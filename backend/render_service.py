"""FFmpeg render engine: project JSON -> MP4."""
from __future__ import annotations
import os
import asyncio
import shutil
import subprocess
import uuid
import re
import httpx
from pathlib import Path
from typing import Dict, Any, List, Tuple

from dotenv import load_dotenv

load_dotenv()

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/app/storage"))
RENDER_DIR = STORAGE_DIR / "renders"
TMP_DIR = STORAGE_DIR / "tmp"
RENDER_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)

FONT_FILE = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
if not Path(FONT_FILE).exists():
    # Try first available font
    for p in Path("/usr/share/fonts/truetype").rglob("*.ttf"):
        FONT_FILE = str(p)
        break

ASPECT_DIMS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080)}


def _ffmpeg_escape(s: str) -> str:
    # Escape for ffmpeg drawtext filter
    return s.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'").replace(",", r"\,")


async def _download(url: str, dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
        r = await c.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def _run(cmd: List[str]) -> Tuple[int, str]:
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, (p.stderr or "") + (p.stdout or "")


async def render_project(project: Dict[str, Any], progress_cb=None) -> str:
    """
    Render a project (dict) to MP4. Returns the relative storage path of the final MP4
    (e.g. 'renders/<id>.mp4'). Raises on failure.
    progress_cb: async function (percent:int, message:str) -> None
    """
    job_id = uuid.uuid4().hex[:10]
    work = TMP_DIR / f"render_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    aspect = project.get("aspect", "9:16")
    W, H = ASPECT_DIMS.get(aspect, ASPECT_DIMS["9:16"])
    scenes = project.get("scenes", [])

    async def report(pct, msg):
        if progress_cb:
            await progress_cb(pct, msg)

    await report(5, "Preparing assets")

    # 1) Build per-scene clips
    scene_clips: List[Path] = []
    total = len(scenes) or 1
    for i, sc in enumerate(scenes):
        img_url = sc.get("image_url")
        voice_path = sc.get("voiceover_url")  # local filesystem path
        duration = float(sc.get("duration") or 3.0)

        # Download image
        img_path = work / f"scene_{i}.jpg"
        if img_url and img_url.startswith("http"):
            try:
                await _download(img_url, img_path)
            except Exception:
                _make_placeholder(img_path, W, H, f"Scene {i+1}")
        else:
            _make_placeholder(img_path, W, H, f"Scene {i+1}")

        # Build caption drawtext filters
        caption_filters = _build_caption_filter(sc.get("captions", []), W, H)

        # ken burns / zoompan filter
        animation = sc.get("animation", "ken_burns_in")
        zp = _ken_burns_filter(animation, duration, W, H)

        # Compose video segment
        out_seg = work / f"seg_{i}.mp4"
        # Input: image (looped to duration), audio: voiceover if present
        vf = f"scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},{zp},format=yuv420p"
        if caption_filters:
            vf += "," + caption_filters

        cmd: List[str] = [
            "ffmpeg", "-y",
            "-loop", "1", "-t", f"{duration:.2f}", "-i", str(img_path),
        ]
        has_audio = bool(voice_path) and Path(voice_path).exists()
        if has_audio:
            cmd += ["-i", str(voice_path)]

        cmd += [
            "-vf", vf,
            "-r", "30",
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        ]
        if has_audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
        else:
            cmd += ["-an"]
        cmd += [str(out_seg)]

        code, log = _run(cmd)
        if code != 0:
            raise RuntimeError(f"FFmpeg failed at scene {i}: {log[-1200:]}")
        scene_clips.append(out_seg)
        await report(10 + int((i + 1) / total * 70), f"Rendered scene {i + 1}/{total}")

    # 2) Concat
    list_file = work / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in scene_clips))
    final_path = RENDER_DIR / f"{job_id}.mp4"
    code, log = _run(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-c", "copy", str(final_path),
        ]
    )
    if code != 0:
        # fallback: re-encode concat
        code, log = _run(
            [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "192k",
                str(final_path),
            ]
        )
        if code != 0:
            raise RuntimeError(f"Concat failed: {log[-1200:]}")

    await report(95, "Finalizing")
    shutil.rmtree(work, ignore_errors=True)
    await report(100, "Completed")
    return f"renders/{job_id}.mp4"


def _make_placeholder(path: Path, w: int, h: int, label: str) -> None:
    """Generate solid color placeholder image with text using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=#121212:s={w}x{h}",
        "-vf", f"drawtext=fontfile={FONT_FILE}:text='{_ffmpeg_escape(label)}':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2",
        "-frames:v", "1", str(path),
    ]
    _run(cmd)


def _ken_burns_filter(animation: str, duration: float, w: int, h: int) -> str:
    frames = max(1, int(duration * 30))
    if animation == "ken_burns_out":
        zoom = f"zoompan=z='if(lte(zoom,1.0),1.25,max(1.0,zoom-0.0009))':d={frames}:s={w}x{h}:fps=30"
    elif animation == "punch_in":
        zoom = f"zoompan=z='min(zoom+0.0025,1.3)':d={frames}:s={w}x{h}:fps=30"
    elif animation == "slow_pan":
        zoom = f"zoompan=z='1.15':x='if(lte(x,0),0,x+1)':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps=30"
    else:  # ken_burns_in
        zoom = f"zoompan=z='min(zoom+0.0015,1.25)':d={frames}:s={w}x{h}:fps=30"
    return zoom


def _build_caption_filter(captions: List[Dict[str, Any]], w: int, h: int) -> str:
    """Burn captions into video using ffmpeg drawtext (chained, one per caption)."""
    filters = []
    y_pos = int(h * 0.75)
    for cap in captions:
        text = re.sub(r"[^\w\s!?.,'-]", "", cap.get("text", ""))[:80]
        if not text:
            continue
        start = float(cap.get("start", 0))
        end = float(cap.get("end", start + 1))
        escaped = _ffmpeg_escape(text.upper())
        # Escape commas in expression since chained filters use comma as separator
        filters.append(
            f"drawtext=fontfile={FONT_FILE}:text='{escaped}':"
            f"fontcolor=white:fontsize=64:borderw=6:bordercolor=black@0.85:"
            f"x=(w-text_w)/2:y={y_pos}:"
            f"enable='between(t\\,{start:.3f}\\,{end:.3f})'"
        )
    return ",".join(filters)
