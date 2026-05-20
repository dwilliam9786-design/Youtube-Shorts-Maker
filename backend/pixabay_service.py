"""Pixabay stock media integration with graceful mock fallback."""
from __future__ import annotations
import os
import httpx
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()
_KEY = os.environ.get("PIXABAY_API_KEY", "").strip()

# Curated cinematic mock library (used when no API key)
_MOCK_IMAGES: List[Dict[str, Any]] = [
    {"id": "m1", "type": "image", "title": "Neon city night", "thumb": "https://images.unsplash.com/photo-1493514789931-586cb221d7a7?w=400", "url": "https://images.unsplash.com/photo-1493514789931-586cb221d7a7?w=1920", "tags": "city neon night"},
    {"id": "m2", "type": "image", "title": "Coffee pour close up", "thumb": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400", "url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1920", "tags": "coffee cafe"},
    {"id": "m3", "type": "image", "title": "Mountain sunrise", "thumb": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400", "url": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920", "tags": "mountain sunrise nature"},
    {"id": "m4", "type": "image", "title": "Studio camera", "thumb": "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400", "url": "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1920", "tags": "camera studio"},
    {"id": "m5", "type": "image", "title": "Ocean waves", "thumb": "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=400", "url": "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=1920", "tags": "ocean sea waves"},
    {"id": "m6", "type": "image", "title": "Tech laptop", "thumb": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400", "url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1920", "tags": "tech laptop code"},
    {"id": "m7", "type": "image", "title": "Athlete sprint", "thumb": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400", "url": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1920", "tags": "sport running fitness"},
    {"id": "m8", "type": "image", "title": "Crowd concert", "thumb": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400", "url": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1920", "tags": "crowd concert lights"},
    {"id": "m9", "type": "image", "title": "Cinematic forest", "thumb": "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400", "url": "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920", "tags": "forest fog cinematic"},
    {"id": "m10", "type": "image", "title": "Money close up", "thumb": "https://images.unsplash.com/photo-1561414927-6d86591d0c4f?w=400", "url": "https://images.unsplash.com/photo-1561414927-6d86591d0c4f?w=1920", "tags": "money cash finance"},
    {"id": "m11", "type": "image", "title": "Person thinking", "thumb": "https://images.unsplash.com/photo-1521119989659-a83eee488004?w=400", "url": "https://images.unsplash.com/photo-1521119989659-a83eee488004?w=1920", "tags": "person portrait thinking"},
    {"id": "m12", "type": "image", "title": "Abstract neon waves", "thumb": "https://images.unsplash.com/photo-1554189097-ffe88e998a2b?w=400", "url": "https://images.unsplash.com/photo-1554189097-ffe88e998a2b?w=1920", "tags": "abstract neon waves"},
]

_MOCK_MUSIC: List[Dict[str, Any]] = [
    {"id": "mu1", "type": "audio", "title": "Cinematic Tension", "duration": 30, "preview": "https://cdn.pixabay.com/audio/2022/03/15/audio_8398a9bf3a.mp3", "tags": "cinematic dark"},
    {"id": "mu2", "type": "audio", "title": "Upbeat Pop Energy", "duration": 30, "preview": "https://cdn.pixabay.com/audio/2022/10/30/audio_946bc6c190.mp3", "tags": "pop upbeat"},
    {"id": "mu3", "type": "audio", "title": "Lo-fi Chill Beat", "duration": 30, "preview": "https://cdn.pixabay.com/audio/2022/08/03/audio_2dde668ca5.mp3", "tags": "lofi chill"},
    {"id": "mu4", "type": "audio", "title": "Epic Trailer Drum", "duration": 30, "preview": "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3", "tags": "epic trailer"},
]


async def search_pixabay(query: str, media_type: str = "image", per_page: int = 12) -> List[Dict[str, Any]]:
    """Search Pixabay images or music. Falls back to curated mock if no API key."""
    if not _KEY:
        if media_type == "music":
            return [m for m in _MOCK_MUSIC if not query or query.lower() in m["tags"].lower()]
        q = query.lower()
        results = [m for m in _MOCK_IMAGES if not q or any(t in m["tags"] for t in q.split())]
        return results or _MOCK_IMAGES[:per_page]

    async with httpx.AsyncClient(timeout=15) as client:
        if media_type == "music":
            # Pixabay music endpoint isn't open; return mock when music requested
            return _MOCK_MUSIC
        url = "https://pixabay.com/api/"
        params = {
            "key": _KEY,
            "q": query or "cinematic",
            "image_type": "photo",
            "orientation": "vertical",
            "per_page": per_page,
            "safesearch": "true",
        }
        r = await client.get(url, params=params)
        r.raise_for_status()
        items = r.json().get("hits", [])
        return [
            {
                "id": str(it.get("id")),
                "type": "image",
                "title": it.get("tags", "")[:40],
                "thumb": it.get("webformatURL"),
                "url": it.get("largeImageURL") or it.get("webformatURL"),
                "tags": it.get("tags", ""),
            }
            for it in items
        ]


async def fetch_first_image_for_keywords(keywords: list) -> str | None:
    """Helper used by AI generator to pick a stock image for a scene."""
    q = " ".join(keywords[:2]) if keywords else "cinematic"
    items = await search_pixabay(q, "image", per_page=6)
    if items:
        return items[0]["url"]
    return None
