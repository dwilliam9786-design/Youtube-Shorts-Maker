"""AI services: script -> scenes (GPT), TTS, Whisper word alignment."""
from __future__ import annotations
import os
import json
import re
import uuid
from pathlib import Path
from typing import List, Dict, Any

import httpx
from dotenv import load_dotenv

load_dotenv()

_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/app/storage"))
VOICE_DIR = STORAGE_DIR / "voiceover"
VOICE_DIR.mkdir(parents=True, exist_ok=True)


SCENE_SYSTEM_PROMPT = """You are a top-tier short-form video director (TikTok/Reels/Shorts).
Given a script, split it into 3-6 punchy scenes optimized for retention.

For EACH scene return:
- "script": the spoken line for this scene (rewrite slightly for punchy spoken delivery, but stay faithful)
- "keywords": 2-3 short visual search keywords for stock footage (e.g. "neon city night", "coffee pour close up")
- "animation": one of "ken_burns_in", "ken_burns_out", "punch_in", "slow_pan"
- "transition_in": one of "fade", "flash", "zoom", "swipe"
- "emphasis_words": 1-3 words from the script to visually emphasize in captions

Return STRICT JSON: { "scenes": [ { "script": "...", "keywords": ["..."], "animation": "...", "transition_in": "...", "emphasis_words": ["..."] } ] }
NO commentary, NO markdown fences, JUST JSON.
"""


async def split_into_scenes(script: str) -> List[Dict[str, Any]]:
    """Use GPT-5.2 to split a script into a list of scene dicts."""
    if not _KEY:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", script.strip()) if s.strip()]
        return [
            {
                "script": s,
                "keywords": s.split()[:3],
                "animation": "ken_burns_in",
                "transition_in": "fade",
                "emphasis_words": [],
            }
            for s in sentences[:6]
        ]

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SCENE_SYSTEM_PROMPT},
            {"role": "user", "content": f'Script:\n"""{script.strip()}"""'},
        ],
        "temperature": 0.4,
    }
    headers = {"Authorization": f"Bearer {_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{OPENAI_BASE_URL}/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        raw = data["choices"][0]["message"]["content"]

    # Strip code fences if any
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
        scenes = data.get("scenes", [])
    except Exception:
        # Fallback: split by sentences
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", script.strip()) if s.strip()]
        scenes = [
            {
                "script": s,
                "keywords": s.split()[:3],
                "animation": "ken_burns_in",
                "transition_in": "fade",
                "emphasis_words": [],
            }
            for s in sentences[:6]
        ]
    return scenes


async def synthesize_voice(text: str, voice: str = "nova", model: str = "tts-1") -> str:
    """Generate TTS audio, save MP3, return absolute file path."""
    if not _KEY:
        raise RuntimeError("OpenAI TTS backend is unavailable: missing OPENAI_API_KEY")
    payload = {"model": model, "voice": voice, "input": text, "format": "mp3"}
    headers = {"Authorization": f"Bearer {_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{OPENAI_BASE_URL}/audio/speech", headers=headers, json=payload)
        r.raise_for_status()
        audio_bytes = r.content
    file_id = uuid.uuid4().hex
    out_path = VOICE_DIR / f"{file_id}.mp3"
    out_path.write_bytes(audio_bytes)
    return str(out_path)


async def transcribe_words(audio_path: str) -> Dict[str, Any]:
    """Whisper: get word-level timestamps. Returns {'text', 'words':[{word,start,end}], 'duration'}"""
    if not _KEY:
        raise RuntimeError("OpenAI STT backend is unavailable: missing OPENAI_API_KEY")
    with open(audio_path, "rb") as f:
        files = {"file": (Path(audio_path).name, f, "audio/mpeg")}
        data = {
            "model": "whisper-1",
            "response_format": "verbose_json",
            "timestamp_granularities[]": "word",
        }
        headers = {"Authorization": f"Bearer {_KEY}"}
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(f"{OPENAI_BASE_URL}/audio/transcriptions", headers=headers, data=data, files=files)
            r.raise_for_status()
            resp = r.json()

    words = []
    duration = 0.0
    text = getattr(resp, "text", "") if not isinstance(resp, dict) else resp.get("text", "")
    raw_words = getattr(resp, "words", None) if not isinstance(resp, dict) else resp.get("words", None)
    if raw_words:
        for w in raw_words:
            if isinstance(w, dict):
                ww = w.get("word", "").strip()
                ws = float(w.get("start", 0.0))
                we = float(w.get("end", ws))
            else:
                ww = getattr(w, "word", "").strip()
                ws = float(getattr(w, "start", 0.0))
                we = float(getattr(w, "end", ws))
            if ww:
                words.append({"word": ww, "start": ws, "end": we})
                duration = max(duration, we)

    if not words and text:
        # Fallback: evenly distribute words across estimated duration
        toks = text.split()
        est = max(1.5, len(toks) * 0.35)
        per = est / max(1, len(toks))
        for i, t in enumerate(toks):
            words.append({"word": t, "start": round(i * per, 3), "end": round((i + 1) * per, 3)})
        duration = est

    return {"text": text, "words": words, "duration": duration}


def build_caption_groups(words: List[Dict[str, Any]], group_size: int = 3) -> List[Dict[str, Any]]:
    """Group word-level timings into 3-word caption phrases."""
    captions = []
    for i in range(0, len(words), group_size):
        chunk = words[i : i + group_size]
        if not chunk:
            continue
        text = " ".join(w["word"] for w in chunk)
        captions.append(
            {
                "text": text,
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
                "speaker": "primary",
                "words": chunk,
                "style_preset": "viral_pop",
            }
        )
    return captions
