"""FastAPI app — Voltcut AI video studio backend."""
from __future__ import annotations
import os
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db import projects, renders
from models import (
    Project, Scene, Caption, GenerateRequest, RenderRequest, RenderJob, _now, _uid,
)
from ai_service import (
    split_into_scenes, synthesize_voice, transcribe_words, build_caption_groups,
)
from pixabay_service import search_pixabay, fetch_first_image_for_keywords
from render_service import render_project, render_dependencies, STORAGE_DIR

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voltcut")

app = FastAPI(title="Voltcut Video Studio API")
api = APIRouter(prefix="/api")

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Health -----
@api.get("/")
async def root():
    return {"service": "voltcut", "status": "ok", "time": _now()}


MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB
ALLOWED_UPLOAD_EXT = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    ".mp4", ".mov", ".webm", ".m4v",
    ".mp3", ".wav", ".m4a", ".ogg",
}


# ----- Storage / file serving -----
@api.get("/storage/{kind}/{name}")
async def storage_file(kind: str, name: str):
    if kind not in {"voiceover", "renders", "uploads"}:
        raise HTTPException(404)
    # Path traversal guard
    if "/" in name or ".." in name or "\\" in name:
        raise HTTPException(400, "Invalid filename")
    path = STORAGE_DIR / kind / name
    try:
        path.resolve().relative_to((STORAGE_DIR / kind).resolve())
    except (ValueError, RuntimeError):
        raise HTTPException(400, "Invalid path")
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(str(path))


# ----- Projects CRUD -----
def _serialize(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@api.get("/projects")
async def list_projects():
    cursor = projects.find({}, {"_id": 0}).sort("updated_at", -1)
    return [doc async for doc in cursor]


@api.get("/projects/{pid}")
async def get_project(pid: str):
    doc = await projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@api.delete("/projects/{pid}")
async def delete_project(pid: str):
    res = await projects.delete_one({"id": pid})
    return {"deleted": res.deleted_count}


@api.patch("/projects/{pid}")
async def update_project(pid: str, payload: dict):
    payload.pop("_id", None)
    payload["updated_at"] = _now()
    res = await projects.update_one({"id": pid}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(404, "Project not found")
    doc = await projects.find_one({"id": pid}, {"_id": 0})
    return doc


# ----- AI generation pipeline -----
@api.post("/projects/generate")
async def generate_project(req: GenerateRequest):
    """Full pipeline: script -> scenes -> TTS -> Whisper -> stock images -> Project."""
    if not req.script.strip():
        raise HTTPException(400, "Empty script")

    project = Project(
        title=req.title or req.script.strip().split(".")[0][:60] or "Untitled",
        aspect=req.aspect,
        script=req.script,
        voice=req.voice,
        caption_theme=req.caption_theme,
        status="generating",
    )
    await projects.insert_one(project.model_dump())

    try:
        scene_dicts = await split_into_scenes(req.script)

        async def build_scene(idx_sc):
            idx, sc = idx_sc
            text = sc.get("script", "").strip()
            if not text:
                return None
            voice_path = await synthesize_voice(text, voice=req.voice)
            align = await transcribe_words(voice_path)
            caps_groups = build_caption_groups(align["words"], group_size=3)
            captions = [Caption(**c).model_dump() for c in caps_groups]
            image_url = await fetch_first_image_for_keywords(sc.get("keywords", []))
            scene = Scene(
                index=idx,
                script=text,
                duration=align["duration"] or max(2.0, len(text.split()) * 0.4),
                voiceover_url=voice_path,
                image_url=image_url,
                keywords=sc.get("keywords", []),
                transition_in=sc.get("transition_in", "fade"),
                animation=sc.get("animation", "ken_burns_in"),
                captions=captions,
            )
            return scene.model_dump()

        results = await asyncio.gather(*[build_scene((i, s)) for i, s in enumerate(scene_dicts)])
        scenes = [r for r in results if r]

        total_duration = sum(s["duration"] for s in scenes)
        thumb = next((s["image_url"] for s in scenes if s.get("image_url")), None)

        await projects.update_one(
            {"id": project.id},
            {
                "$set": {
                    "scenes": scenes,
                    "total_duration": total_duration,
                    "thumbnail_url": thumb,
                    "status": "ready",
                    "updated_at": _now(),
                }
            },
        )
    except Exception as e:
        logger.exception("generation failed")
        await projects.update_one(
            {"id": project.id},
            {"$set": {"status": "failed", "updated_at": _now()}},
        )
        raise HTTPException(500, f"Generation failed: {e}")

    doc = await projects.find_one({"id": project.id}, {"_id": 0})
    return doc


@api.post("/projects/blank")
async def create_blank(payload: dict):
    title = (payload or {}).get("title") or "Untitled Video"
    aspect = (payload or {}).get("aspect", "9:16")
    project = Project(title=title, aspect=aspect, status="draft")
    await projects.insert_one(project.model_dump())
    return await projects.find_one({"id": project.id}, {"_id": 0})


# ----- Pixabay search -----
@api.get("/library/search")
async def library_search(q: str = "", type: str = "image"):
    items = await search_pixabay(q, type)
    return {"items": items}


# ----- Render -----
@api.post("/renders")
async def start_render(req: RenderRequest, bg: BackgroundTasks):
    deps = render_dependencies()
    if not deps["available"]:
        missing = [name for name, path in deps["binaries"].items() if not path]
        raise HTTPException(503, f"Render tools unavailable: missing {', '.join(missing)} on PATH")
    project = await projects.find_one({"id": req.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.get("scenes"):
        raise HTTPException(400, "Project has no scenes to render")

    job = RenderJob(project_id=req.project_id, status="queued", progress=0, message="Queued")
    await renders.insert_one(job.model_dump())

    bg.add_task(_run_render, job.id, project, req.fps, req.out_format)
    return {"job_id": job.id, "status": "queued", "fps": req.fps, "out_format": req.out_format}


async def _run_render(job_id: str, project: dict, fps: int = 30, out_format: str = "mp4"):
    async def cb(pct: int, msg: str):
        await renders.update_one(
            {"id": job_id},
            {"$set": {"progress": pct, "message": msg, "status": "running", "updated_at": _now()}},
        )

    try:
        await renders.update_one(
            {"id": job_id},
            {"$set": {"status": "running", "progress": 1, "message": "Starting", "updated_at": _now()}},
        )
        rel_path = await render_project(project, fps=fps, out_format=out_format, progress_cb=cb)
        final_url = f"/api/storage/{rel_path}"
        await renders.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed", "progress": 100,
                "message": "Done", "final_video_url": final_url,
                "updated_at": _now(),
            }},
        )
        await projects.update_one(
            {"id": project["id"]},
            {"$set": {
                "status": "rendered", "final_video_url": final_url, "updated_at": _now(),
            }},
        )
    except Exception as e:
        logger.exception("render failed")
        await renders.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed", "message": "Render failed",
                "error": str(e)[:4000], "updated_at": _now(),
            }},
        )


@api.get("/renders/{job_id}")
async def get_render(job_id: str):
    doc = await renders.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404)
    return doc


@api.get("/renders")
async def list_renders():
    cursor = renders.find({}, {"_id": 0}).sort("created_at", -1).limit(20)
    return [doc async for doc in cursor]


# ----- Voices & Themes meta -----
@api.get("/meta")
async def meta():
    render_tools = render_dependencies()
    return {
        "voices": [
            {"id": "alloy", "label": "Alloy — Neutral"},
            {"id": "echo", "label": "Echo — Smooth"},
            {"id": "fable", "label": "Fable — Storyteller"},
            {"id": "onyx", "label": "Onyx — Deep"},
            {"id": "nova", "label": "Nova — Energetic"},
            {"id": "shimmer", "label": "Shimmer — Bright"},
        ],
        "caption_themes": [
            {"id": "viral_pop", "label": "Viral Pop"},
            {"id": "minimal", "label": "Minimal"},
            {"id": "hormozi", "label": "Hormozi"},
            {"id": "mrbeast", "label": "MrBeast"},
        ],
        "aspects": ["9:16", "1:1", "16:9"],
        "viral_modes": [
            {"id": "tiktok_retention", "label": "TikTok Retention"},
            {"id": "mrbeast_cuts", "label": "MrBeast Cuts"},
            {"id": "hormozi_subs", "label": "Hormozi Subs"},
            {"id": "documentary", "label": "Documentary Pacing"},
        ],
        "effects": [
            {"id": "shake", "label": "Shake"},
            {"id": "rgb_split", "label": "RGB Split"},
            {"id": "glitch", "label": "Glitch"},
            {"id": "blur_reveal", "label": "Blur Reveal"},
            {"id": "vignette", "label": "Vignette"},
            {"id": "film_burn", "label": "Film Burn"},
            {"id": "flash", "label": "Flash"},
            {"id": "speed_ramp", "label": "Speed Ramp"},
        ],
        "animations": [
            {"id": "ken_burns_in", "label": "Ken Burns In"},
            {"id": "ken_burns_out", "label": "Ken Burns Out"},
            {"id": "punch_in", "label": "Punch In"},
            {"id": "slow_pan", "label": "Slow Pan"},
            {"id": "none", "label": "None"},
        ],
        "transitions": [
            {"id": "fade", "label": "Fade"},
            {"id": "flash", "label": "Flash"},
            {"id": "zoom", "label": "Zoom"},
            {"id": "swipe", "label": "Swipe"},
        ],
        "speakers": [
            {"id": "primary", "label": "Primary", "color": "#FFD60A"},
            {"id": "speaker2", "label": "Speaker 2", "color": "#00E0B4"},
            {"id": "speaker3", "label": "Speaker 3", "color": "#FF7043"},
            {"id": "speaker4", "label": "Speaker 4", "color": "#9BFF00"},
        ],
        "formats": [
            {"id": "mp4", "label": "MP4 (H.264 + AAC)"},
            {"id": "webm", "label": "WebM (VP9 + Opus)"},
            {"id": "mov", "label": "MOV (H.264 + AAC)"},
            {"id": "gif", "label": "GIF (no audio)"},
        ],
        "fps_options": [20, 24, 30, 48, 60, 90],
        "render_tools": render_tools,
        "caption_presets": [
            {"id": "viral_pop", "label": "Viral Pop", "desc": "Yellow active word + white phrase"},
            {"id": "hormozi",   "label": "Hormozi",   "desc": "Big middle, no phrase, dark backdrop"},
            {"id": "mrbeast",   "label": "MrBeast",   "desc": "Massive red+white with accent box"},
            {"id": "minimal",   "label": "Minimal",   "desc": "Clean white, single line"},
            {"id": "subtitle",  "label": "Subtitle",  "desc": "Small bottom subtitle bar"},
        ],
        "caption_fonts": [
            {"id": "bold_sans", "label": "Bold Sans"},
            {"id": "display",   "label": "Display"},
            {"id": "narrow",    "label": "Narrow"},
            {"id": "mono",      "label": "Mono"},
            {"id": "serif",     "label": "Serif"},
        ],
        "caption_positions": [
            {"id": "top",    "label": "Top"},
            {"id": "middle", "label": "Middle"},
            {"id": "bottom", "label": "Bottom"},
        ],
        "caption_backgrounds": [
            {"id": "none",       "label": "None"},
            {"id": "accent_box", "label": "Accent Box"},
            {"id": "dark_box",   "label": "Dark Box"},
        ],
        "caption_animations": [
            {"id": "pop",   "label": "Pop"},
            {"id": "fade",  "label": "Fade"},
            {"id": "slide", "label": "Slide"},
            {"id": "none",  "label": "None"},
        ],
    }


# ----- Upload -----
@api.post("/uploads")
async def upload_file(file: UploadFile = File(...), kind: str = Form("image")):
    """Save user uploads (image/video/audio) and return /api/storage URL."""
    ext = Path(file.filename or "").suffix.lower() or ".bin"
    if ext not in ALLOWED_UPLOAD_EXT:
        raise HTTPException(415, f"Unsupported file extension {ext}")
    name = f"{_uid()}{ext}"
    dest = STORAGE_DIR / "uploads" / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Stream-write with size cap to avoid loading huge files into RAM
    total = 0
    with dest.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"File too large (>{MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")
            f.write(chunk)
    media_type = "video" if ext in {".mp4", ".mov", ".webm", ".m4v"} else (
        "audio" if ext in {".mp3", ".wav", ".m4a", ".ogg"} else "image"
    )
    return {
        "url": f"/api/storage/uploads/{name}",
        "filename": file.filename,
        "size": total,
        "media_type": media_type,
        "kind": kind,
    }


app.include_router(api)


@app.on_event("startup")
async def startup():
    Path(STORAGE_DIR).mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "voiceover").mkdir(exist_ok=True)
    (STORAGE_DIR / "renders").mkdir(exist_ok=True)
    (STORAGE_DIR / "uploads").mkdir(exist_ok=True)
    logger.info("Voltcut API ready")
