"""FastAPI app — Voltcut AI video studio backend."""
from __future__ import annotations
import os
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
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
from render_service import render_project, STORAGE_DIR

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voltcut")

app = FastAPI(title="Voltcut Video Studio API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Health -----
@api.get("/")
async def root():
    return {"service": "voltcut", "status": "ok", "time": _now()}


# ----- Storage / file serving -----
@api.get("/storage/{kind}/{name}")
async def storage_file(kind: str, name: str):
    if kind not in {"voiceover", "renders", "uploads"}:
        raise HTTPException(404)
    path = STORAGE_DIR / kind / name
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
    project = await projects.find_one({"id": req.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.get("scenes"):
        raise HTTPException(400, "Project has no scenes to render")

    job = RenderJob(project_id=req.project_id, status="queued", progress=0, message="Queued")
    await renders.insert_one(job.model_dump())

    bg.add_task(_run_render, job.id, project)
    return {"job_id": job.id, "status": "queued"}


async def _run_render(job_id: str, project: dict):
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
        rel_path = await render_project(project, progress_cb=cb)
        final_url = f"/api/storage/{rel_path}"  # served via storage endpoint
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
    }


app.include_router(api)


@app.on_event("startup")
async def startup():
    Path(STORAGE_DIR).mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "voiceover").mkdir(exist_ok=True)
    (STORAGE_DIR / "renders").mkdir(exist_ok=True)
    (STORAGE_DIR / "uploads").mkdir(exist_ok=True)
    logger.info("Voltcut API ready")
