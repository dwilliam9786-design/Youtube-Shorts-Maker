"""FFmpeg render engine: project JSON -> MP4/WebM/MOV with karaoke captions + effects."""
from __future__ import annotations
import os
import asyncio
import shutil
import uuid
import re
import httpx
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

from dotenv import load_dotenv

load_dotenv()

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/app/storage"))
RENDER_DIR = STORAGE_DIR / "renders"
TMP_DIR = STORAGE_DIR / "tmp"
RENDER_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)

FONT_FILE = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
if not Path(FONT_FILE).exists():
    for p in Path("/usr/share/fonts/truetype").rglob("*.ttf"):
        FONT_FILE = str(p)
        break

# Font registry for caption styling
FONT_FILES = {
    "bold_sans": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "display":   "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "narrow":    "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf",
    "mono":      "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "serif":     "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
}
# Font display names that libass will use (ASS Fontname field)
FONT_NAMES = {
    "bold_sans": "Liberation Sans",
    "display":   "FreeSans",
    "narrow":    "Liberation Sans Narrow",
    "mono":      "Liberation Mono",
    "serif":     "Liberation Serif",
}

# Caption style presets (server-side defaults used when no project caption_style supplied)
CAPTION_PRESETS = {
    "viral_pop": {
        "font": "display", "active_color": "#FFD60A", "phrase_color": "#FFFFFF",
        "size_active": 96, "size_phrase": 42, "stroke_width": 6,
        "position": "bottom", "background": "none", "show_phrase": True,
    },
    "hormozi": {
        "font": "display", "active_color": "#FFFFFF", "phrase_color": "#FFD60A",
        "size_active": 110, "size_phrase": 56, "stroke_width": 10,
        "position": "middle", "background": "dark_box", "show_phrase": False,
    },
    "mrbeast": {
        "font": "display", "active_color": "#FF3B30", "phrase_color": "#FFFFFF",
        "size_active": 120, "size_phrase": 48, "stroke_width": 12,
        "position": "middle", "background": "accent_box", "show_phrase": False,
    },
    "minimal": {
        "font": "bold_sans", "active_color": "#FFFFFF", "phrase_color": "#FFFFFF",
        "size_active": 72, "size_phrase": 36, "stroke_width": 4,
        "position": "bottom", "background": "none", "show_phrase": False,
    },
    "subtitle": {
        "font": "bold_sans", "active_color": "#FFFFFF", "phrase_color": "#FFFFFF",
        "size_active": 54, "size_phrase": 0, "stroke_width": 3,
        "position": "bottom", "background": "dark_box", "show_phrase": False,
    },
}

ASPECT_DIMS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080)}

# Format -> (extension, video codec, audio codec, extra flags)
FORMATS = {
    "mp4":  ("mp4",  "libx264",  "aac",      []),
    "webm": ("webm", "libvpx-vp9", "libopus", ["-b:v", "2M"]),
    "mov":  ("mov",  "libx264",  "aac",      []),
    "gif":  ("gif",  None,       None,       []),  # no audio
}

# Speaker color palette (for multi-speaker support)
SPEAKER_COLORS = {
    "primary":  "#FFD60A",   # cyber yellow
    "speaker1": "#FFD60A",
    "speaker2": "#00E0B4",   # teal
    "speaker3": "#FF7043",   # coral
    "speaker4": "#9BFF00",   # acid green
}


def _ffmpeg_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'").replace(",", r"\,")


async def _download(url: str, dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
        r = await c.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


async def _run(cmd: List[str]) -> Tuple[int, str]:
    """Run a command asynchronously (non-blocking for the event loop)."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, (stderr.decode("utf-8", errors="ignore") + stdout.decode("utf-8", errors="ignore"))


async def render_project(
    project: Dict[str, Any],
    *,
    fps: int = 30,
    out_format: str = "mp4",
    progress_cb=None,
) -> str:
    """Render a project to MP4/WebM/MOV. Returns 'renders/<name>.<ext>'."""
    job_id = uuid.uuid4().hex[:10]
    work = TMP_DIR / f"render_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    aspect = project.get("aspect", "9:16")
    W, H = ASPECT_DIMS.get(aspect, ASPECT_DIMS["9:16"])
    scenes = project.get("scenes", [])
    fmt = FORMATS.get(out_format, FORMATS["mp4"])
    ext, vcodec, acodec, extra = fmt
    fps = max(20, min(90, int(fps or 30)))

    async def report(pct, msg):
        if progress_cb:
            await progress_cb(pct, msg)

    await report(5, f"Preparing {ext.upper()} render @ {fps}fps")

    scene_clips: List[Path] = []
    total = len(scenes) or 1
    for i, sc in enumerate(scenes):
        img_url = sc.get("image_url") or ""
        upload_url = sc.get("video_url")  # uploaded user clip (mp4) — overrides image
        voice_path = sc.get("voiceover_url")
        duration = float(sc.get("duration") or 3.0)

        media_path = work / f"scene_{i}"
        is_video = False
        if upload_url:
            try:
                v = work / f"scene_{i}.mp4"
                if upload_url.startswith("http"):
                    await _download(upload_url, v)
                else:
                    # Local stored upload
                    src = STORAGE_DIR / upload_url.lstrip("/").replace("api/storage/", "")
                    if src.exists():
                        shutil.copy(src, v)
                media_path = v
                is_video = v.exists()
            except Exception:
                is_video = False
        if not is_video:
            img_path = work / f"scene_{i}.jpg"
            if img_url and img_url.startswith("http"):
                try:
                    await _download(img_url, img_path)
                except Exception:
                    await _make_placeholder(img_path, W, H, f"Scene {i + 1}")
            elif img_url and (STORAGE_DIR / img_url.lstrip("/").replace("api/storage/", "")).exists():
                src = STORAGE_DIR / img_url.lstrip("/").replace("api/storage/", "")
                shutil.copy(src, img_path)
            else:
                await _make_placeholder(img_path, W, H, f"Scene {i + 1}")
            media_path = img_path

        # Build filter chain: scale/crop -> animation -> effects -> captions (ASS subtitles)
        animation = sc.get("animation", "ken_burns_in")
        effects = sc.get("effects") or []
        captions = sc.get("captions", [])

        base_vf = f"scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2}"
        anim_vf = _ken_burns_filter(animation, duration, W, H, fps)
        fx_vf = _effects_filter(effects, duration, fps)

        # Write ASS subtitle file for this scene; use libass for karaoke captions
        ass_path = work / f"captions_{i}.ass"
        speaker = sc.get("speaker", "primary")
        caption_style = project.get("caption_style") or {}
        if captions and _write_ass(ass_path, captions, W, H, speaker, caption_style):
            ass_arg = str(ass_path).replace(":", "\\:")
            caption_vf = f"subtitles='{ass_arg}'"
        else:
            caption_vf = None

        chain_parts = [base_vf, anim_vf]
        if fx_vf:
            chain_parts.append(fx_vf)
        chain_parts.append("format=yuv420p")
        if caption_vf:
            chain_parts.append(caption_vf)
        vf = ",".join(chain_parts)

        out_seg = work / f"seg_{i}.mp4"
        cmd: List[str] = ["ffmpeg", "-y"]
        if is_video:
            cmd += ["-stream_loop", "-1", "-i", str(media_path)]
        else:
            cmd += ["-loop", "1", "-t", f"{duration:.2f}", "-i", str(media_path)]

        has_audio = bool(voice_path) and Path(voice_path).exists()
        if has_audio:
            cmd += ["-i", str(voice_path)]

        cmd += [
            "-vf", vf,
            "-t", f"{duration:.2f}",
            "-r", str(fps),
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        ]
        if has_audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
        else:
            cmd += ["-an"]
        cmd += [str(out_seg)]

        code, log = await _run(cmd)
        if code != 0:
            raise RuntimeError(f"FFmpeg failed at scene {i}: {log[-1500:]}")
        scene_clips.append(out_seg)
        await report(10 + int((i + 1) / total * 65), f"Rendered scene {i + 1}/{total}")

    # Concat segments
    list_file = work / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in scene_clips))
    concat_mp4 = work / "concat.mp4"
    code, log = await _run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k", "-r", str(fps),
        str(concat_mp4),
    ])
    if code != 0:
        raise RuntimeError(f"Concat failed: {log[-1500:]}")
    await report(82, f"Concatenated {total} scenes")

    # Add background music (mix under voiceover) if present
    music_url = project.get("music_url")
    if music_url:
        await report(86, "Mixing background music")
        music_path = work / "music_in.mp3"
        try:
            if music_url.startswith("http"):
                await _download(music_url, music_path)
            else:
                local = STORAGE_DIR / music_url.lstrip("/").replace("api/storage/", "")
                if local.exists():
                    shutil.copy(local, music_path)
        except Exception:
            music_path = None
        if music_path and music_path.exists():
            mixed = work / "mixed.mp4"
            code, log = await _run([
                "ffmpeg", "-y", "-i", str(concat_mp4), "-stream_loop", "-1", "-i", str(music_path),
                "-filter_complex", "[1:a]volume=0.18[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
                "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-shortest", str(mixed),
            ])
            if code == 0:
                concat_mp4 = mixed

    # Final encode to requested format
    final_name = f"{job_id}.{ext}"
    final_path = RENDER_DIR / final_name
    if out_format == "gif":
        palette = work / "palette.png"
        await _run(["ffmpeg", "-y", "-i", str(concat_mp4), "-vf", f"fps={min(24, fps)},scale={W//2}:-1:flags=lanczos,palettegen", str(palette)])
        code, log = await _run([
            "ffmpeg", "-y", "-i", str(concat_mp4), "-i", str(palette),
            "-lavfi", f"fps={min(24, fps)},scale={W//2}:-1:flags=lanczos[x];[x][1:v]paletteuse",
            str(final_path),
        ])
    else:
        cmd_final = ["ffmpeg", "-y", "-i", str(concat_mp4), "-c:v", vcodec, "-r", str(fps)] + extra
        if acodec:
            cmd_final += ["-c:a", acodec, "-b:a", "192k"]
        else:
            cmd_final += ["-an"]
        cmd_final += [str(final_path)]
        code, log = await _run(cmd_final)
    if code != 0:
        raise RuntimeError(f"Final encode failed: {log[-1500:]}")

    await report(98, "Finalizing")
    shutil.rmtree(work, ignore_errors=True)
    await report(100, f"Completed → {final_name}")
    return f"renders/{final_name}"


async def _make_placeholder(path: Path, w: int, h: int, label: str) -> None:
    await _run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=#121212:s={w}x{h}",
        "-vf", f"drawtext=fontfile={FONT_FILE}:text='{_ffmpeg_escape(label)}':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2",
        "-frames:v", "1", str(path),
    ])


def _ken_burns_filter(animation: str, duration: float, w: int, h: int, fps: int) -> str:
    frames = max(1, int(duration * fps))
    if animation == "ken_burns_out":
        return f"zoompan=z='if(lte(zoom\\,1.0)\\,1.25\\,max(1.0\\,zoom-0.0009))':d={frames}:s={w}x{h}:fps={fps}"
    if animation == "punch_in":
        return f"zoompan=z='min(zoom+0.0025\\,1.3)':d={frames}:s={w}x{h}:fps={fps}"
    if animation == "slow_pan":
        return f"zoompan=z='1.15':x='if(lte(x\\,0)\\,0\\,x+1)':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps={fps}"
    if animation == "none":
        return f"scale={w}:{h}"
    # ken_burns_in default
    return f"zoompan=z='min(zoom+0.0015\\,1.25)':d={frames}:s={w}x{h}:fps={fps}"


def _effects_filter(effects: List[str], duration: float, fps: int) -> Optional[str]:
    """Map effect names to ffmpeg filters. Multiple effects chained."""
    if not effects:
        return None
    parts = []
    for fx in effects:
        if fx == "shake":
            parts.append("crop=in_w-20:in_h-20:'10+5*sin(2*PI*t*3)':'10+5*cos(2*PI*t*3)'")
        elif fx == "rgb_split":
            parts.append("split=3[a][b][c];[a]lutrgb=g=0:b=0[ar];[b]lutrgb=r=0:b=0[ag];[c]lutrgb=r=0:g=0[ab];[ar][ag]blend=all_mode=screen[ag1];[ag1][ab]blend=all_mode=screen")
        elif fx == "glitch":
            parts.append("noise=alls=20:allf=t,hue=h='if(mod(t\\,0.3)\\,sin(t*20)*30\\,0)'")
        elif fx == "blur_reveal":
            parts.append("gblur=sigma='max(0\\,8-t*10)'")
        elif fx == "vignette":
            parts.append("vignette")
        elif fx == "film_burn":
            parts.append("eq=brightness=0.04:saturation=1.2,colorbalance=rs=0.05:gs=-0.02:bs=-0.05")
        elif fx == "flash":
            parts.append("eq=brightness='if(lt(t\\,0.12)\\,(0.12-t)*3\\,0)'")
        elif fx == "speed_ramp":
            parts.append(f"setpts='if(lt(T\\,{duration/2})\\,PTS*0.7\\,PTS*1.3)'")
    return ",".join(parts) if parts else None


def _build_caption_filter(captions: List[Dict[str, Any]], w: int, h: int) -> str:
    """Deprecated: replaced by ASS subtitles via _write_ass. Kept for backward compatibility."""
    return ""


# ---- ASS subtitle generation (libass) — proper karaoke captions ----

def _ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR& format."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return "&H000AD6FF&"  # cyber yellow fallback
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}&".upper()


def _ass_time(seconds: float) -> str:
    """Convert seconds to ASS time format H:MM:SS.cs"""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def _write_ass(
    path: Path,
    captions: List[Dict[str, Any]],
    w: int,
    h: int,
    speaker: str = "primary",
    style: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Write ASS subtitles with full caption_style support: font, sizes, colors,
    position, stroke, background, animation, uppercase, show_phrase.
    """
    # Merge preset with overrides
    style = dict(style or {})
    preset_name = style.get("preset", "viral_pop")
    preset = CAPTION_PRESETS.get(preset_name, CAPTION_PRESETS["viral_pop"])
    merged = {**preset, **{k: v for k, v in style.items() if v is not None}}

    font_key = merged.get("font", "bold_sans")
    font_name = FONT_NAMES.get(font_key, "Liberation Sans")

    speaker_color = SPEAKER_COLORS.get(speaker, SPEAKER_COLORS["primary"])
    active_color = _ass_color(merged.get("active_color") or speaker_color)
    phrase_color_hex = merged.get("phrase_color", "#FFFFFF")
    phrase_color = _ass_color(phrase_color_hex)

    size_active = int(merged.get("size_active", 96))
    size_phrase = int(merged.get("size_phrase", 42))
    stroke = int(merged.get("stroke_width", 6))
    background = merged.get("background", "none")  # none | accent_box | dark_box
    uppercase = bool(merged.get("uppercase", True))
    show_phrase = bool(merged.get("show_phrase", True))
    animation = merged.get("animation", "pop")
    position = merged.get("position", "bottom")  # bottom, middle, top

    # ASS BorderStyle: 1 = outline+drop-shadow, 3 = opaque box behind text
    if background == "dark_box":
        border_style = 3
        back_color_active = "&H99000000&"
        back_color_phrase = "&H66000000&"
    elif background == "accent_box":
        border_style = 3
        back_color_active = active_color.replace("&H00", "&HAA")  # semi-transparent fill
        back_color_phrase = "&H99000000&"
    else:
        border_style = 1
        back_color_active = "&H88000000&"
        back_color_phrase = "&H66000000&"

    # Vertical margin from bottom (ASS Alignment 2 = bottom-center)
    # We position via MarginV measured from the alignment edge
    if position == "middle":
        margin_active = int(h * 0.48)
        margin_phrase = int(h * 0.40)
    elif position == "top":
        margin_active = int(h * 0.78)
        margin_phrase = int(h * 0.70)
    else:  # bottom
        margin_active = int(h * 0.30)
        margin_phrase = int(h * 0.22)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Active,{font_name},{size_active},{active_color},{active_color},&H00000000&,{back_color_active},1,0,0,0,100,100,0,0,{border_style},{stroke},2,2,40,40,{margin_active},1
Style: Phrase,{font_name},{size_phrase},{phrase_color},{phrase_color},&H00000000&,{back_color_phrase},1,0,0,0,100,100,0,0,{border_style if size_phrase else 1},{max(2, stroke // 2)},1,2,40,40,{margin_phrase},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # Animation override tags
    def fx_tag():
        if animation == "fade":
            return r"{\fad(120,80)}"
        if animation == "slide":
            return r"{\move(540,1100,540,1056,0,140)}"
        if animation == "pop":
            return r"{\fscx80\fscy80\t(0,80,\fscx105\fscy105)\t(80,160,\fscx100\fscy100)}"
        return ""

    lines = []
    for cap in captions:
        cap_start = float(cap.get("start", 0))
        cap_end = float(cap.get("end", cap_start + 1))
        phrase_text = (cap.get("text") or "").strip()
        if uppercase:
            phrase_text = phrase_text.upper()
        phrase_text = _ass_escape(phrase_text)[:140]

        if phrase_text and show_phrase and size_phrase > 0:
            lines.append(
                f"Dialogue: 0,{_ass_time(cap_start)},{_ass_time(cap_end)},Phrase,,0,0,0,,{phrase_text}"
            )

        words = cap.get("words") or []
        if not words and phrase_text:
            lines.append(
                f"Dialogue: 1,{_ass_time(cap_start)},{_ass_time(cap_end)},Active,,0,0,0,,{fx_tag()}{phrase_text}"
            )
            continue
        for w_obj in words:
            wtext = (w_obj.get("word") or "").strip()
            if uppercase:
                wtext = wtext.upper()
            wtext = _ass_escape(wtext)[:40]
            if not wtext:
                continue
            s = float(w_obj.get("start", 0))
            e = float(w_obj.get("end", s + 0.2))
            lines.append(
                f"Dialogue: 1,{_ass_time(s)},{_ass_time(e)},Active,,0,0,0,,{fx_tag()}{wtext}"
            )

    if not lines:
        return False
    path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    return True
