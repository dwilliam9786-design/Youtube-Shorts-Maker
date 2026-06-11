"""Pydantic models for the video studio."""
from __future__ import annotations
from typing import List, Optional, Literal
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Word(BaseModel):
    word: str
    start: float
    end: float


class Caption(BaseModel):
    id: str = Field(default_factory=_uid)
    text: str
    start: float
    end: float
    speaker: str = "primary"
    words: List[Word] = []
    style_preset: str = "viral_pop"


class Scene(BaseModel):
    id: str = Field(default_factory=_uid)
    index: int
    script: str
    duration: float = 0.0
    voiceover_url: Optional[str] = None  # local fs path or http url
    image_url: Optional[str] = None
    video_url: Optional[str] = None  # uploaded user video (mp4) overrides image
    keywords: List[str] = []
    transition_in: str = "fade"
    animation: str = "ken_burns_in"
    effects: List[str] = []
    speaker: str = "primary"
    crop_x: float = 0.0
    crop_y: float = 0.0
    crop_zoom: float = 1.0
    captions: List[Caption] = []


class TimelineLayer(BaseModel):
    id: str = Field(default_factory=_uid)
    type: str = "audio"  # audio | image | video
    url: str
    start: float = 0.0
    duration: float = 3.0
    track: int = 0
    volume: float = 1.0
    opacity: float = 1.0
    trim_start: float = 0.0
    trim_end: float = 0.0


class CaptionStyle(BaseModel):
    preset: str = "viral_pop"     # viral_pop, hormozi, mrbeast, minimal, subtitle
    font: str = "bold_sans"       # bold_sans, display, mono, narrow
    active_color: str = "#FFD60A"
    phrase_color: str = "#FFFFFF"
    phrase_opacity: float = 0.55
    position: str = "bottom"      # bottom, middle, top
    size_active: int = 96
    size_phrase: int = 42
    stroke_width: int = 6
    background: str = "none"      # none, accent_box, dark_box
    uppercase: bool = True
    animation: str = "pop"        # pop, fade, slide, none
    show_phrase: bool = True


class Project(BaseModel):
    id: str = Field(default_factory=_uid)
    title: str = "Untitled Video"
    aspect: Literal["9:16", "1:1", "16:9"] = "9:16"
    script: str = ""
    voice: str = "nova"
    caption_theme: str = "viral_pop"
    caption_style: CaptionStyle = Field(default_factory=CaptionStyle)
    scenes: List[Scene] = []
    music_url: Optional[str] = None
    music_tracks: List[str] = []
    timeline_layers: List[TimelineLayer] = []
    music_timeline: dict = Field(default_factory=lambda: {"start": 0, "duration": 0, "trim_start": 0, "trim_end": 0})
    total_duration: float = 0.0
    thumbnail_url: Optional[str] = None
    status: Literal["draft", "generating", "ready", "rendering", "rendered", "failed"] = "draft"
    final_video_url: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class GenerateRequest(BaseModel):
    title: Optional[str] = None
    script: str
    aspect: Literal["9:16", "1:1", "16:9"] = "9:16"
    voice: str = "nova"
    caption_theme: str = "viral_pop"


class RenderRequest(BaseModel):
    project_id: str
    fps: int = 30
    out_format: str = "mp4"  # mp4, webm, mov, gif


class RenderJob(BaseModel):
    id: str = Field(default_factory=_uid)
    project_id: str
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    progress: int = 0
    message: str = "Queued"
    final_video_url: Optional[str] = None
    error: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
