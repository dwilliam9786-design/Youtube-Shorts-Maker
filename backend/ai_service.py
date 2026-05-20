"""AI services: script -> scenes (GPT), TTS, Whisper word alignment."""
from __future__ import annotations
import os
import json
import re
import uuid
from pathlib import Path
from typing import List, Dict, Any

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAITextToSpeech, OpenAISpeechToText

load_dotenv()

_KEY = os.environ.get("EMERGENT_LLM_KEY")
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
    chat = LlmChat(
        api_key=_KEY,
        session_id=f"scene-split-{uuid.uuid4().hex[:8]}",
        system_message=SCENE_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-5.2")

    msg = UserMessage(text=f"Script:\n\"\"\"{script.strip()}\"\"\"")
    raw = await chat.send_message(msg)

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
    tts = OpenAITextToSpeech(api_key=_KEY)
    audio_bytes = await tts.generate_speech(text=text, model=model, voice=voice)
    file_id = uuid.uuid4().hex
    out_path = VOICE_DIR / f"{file_id}.mp3"
    out_path.write_bytes(audio_bytes)
    return str(out_path)


async def transcribe_words(audio_path: str) -> Dict[str, Any]:
    """Whisper: get word-level timestamps. Returns {'text', 'words':[{word,start,end}], 'duration'}"""
    stt = OpenAISpeechToText(api_key=_KEY)
    with open(audio_path, "rb") as f:
        resp = await stt.transcribe(
            file=f,
            model="whisper-1",
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

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
