"""Supabase-backed DB layer with Mongo-like async collection API used by server.py."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

_SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
_SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not _SUPABASE_URL or not _SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env")

_sb = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_ROLE_KEY)
_LOCAL_DB_DIR = Path(__file__).resolve().parent / "data"
_LOCAL_DB_DIR.mkdir(exist_ok=True)

_TABLE_COLUMNS = {
    "projects": {
        "id", "title", "aspect", "script", "voice", "caption_theme", "status",
        "scenes", "music_url", "music_tracks", "timeline_layers", "music_timeline", "total_duration", "thumbnail_url", "final_video_url",
        "created_at", "updated_at",
    },
    "renders": {
        "id", "project_id", "status", "progress", "message", "final_video_url",
        "error", "created_at", "updated_at",
    },
    "assets": {"id", "kind", "url", "meta", "created_at"},
}


@dataclass
class _DeleteResult:
    deleted_count: int


@dataclass
class _UpdateResult:
    matched_count: int


class _Cursor:
    def __init__(self, table: str, filt: Dict[str, Any]):
        self.table = table
        self.filt = filt or {}
        self._order_by: Optional[str] = None
        self._order_desc = False
        self._limit: Optional[int] = None
        self._rows: Optional[List[Dict[str, Any]]] = None
        self._idx = 0

    def sort(self, field: str, direction: int):
        self._order_by = field
        self._order_desc = direction == -1
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    async def _fetch(self):
        def _run():
            try:
                q = _sb.table(self.table).select("*")
                for k, v in self.filt.items():
                    q = q.eq(k, v)
                if self._order_by:
                    q = q.order(self._order_by, desc=self._order_desc)
                if self._limit is not None:
                    q = q.limit(self._limit)
                return q.execute().data or []
            except Exception:
                rows = self._load_local()
                for k, v in self.filt.items():
                    rows = [row for row in rows if row.get(k) == v]
                if self._order_by:
                    rows = sorted(rows, key=lambda row: row.get(self._order_by), reverse=self._order_desc)
                if self._limit is not None:
                    rows = rows[: self._limit]
                return rows

        self._rows = await asyncio.to_thread(_run)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._rows is None:
            await self._fetch()
        assert self._rows is not None
        if self._idx >= len(self._rows):
            raise StopAsyncIteration
        row = self._rows[self._idx]
        self._idx += 1
        return row


class _Collection:
    def __init__(self, table: str):
        self.table = table
        self._file = _LOCAL_DB_DIR / f"{table}.json"

    def _load_local(self) -> List[Dict[str, Any]]:
        if not self._file.exists():
            return []
        try:
            return json.loads(self._file.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _save_local(self, rows: List[Dict[str, Any]]) -> None:
        self._file.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    def find(self, filt: Dict[str, Any], projection: Optional[Dict[str, int]] = None):
        cursor = _Cursor(self.table, filt)
        cursor._load_local = self._load_local  # type: ignore[attr-defined]
        return cursor

    async def find_one(self, filt: Dict[str, Any], projection: Optional[Dict[str, int]] = None):
        def _run():
            try:
                q = _sb.table(self.table).select("*")
                for k, v in filt.items():
                    q = q.eq(k, v)
                rows = q.limit(1).execute().data or []
                return rows[0] if rows else None
            except Exception:
                for row in self._load_local():
                    if all(row.get(k) == v for k, v in filt.items()):
                        return row
                return None

        return await asyncio.to_thread(_run)

    async def insert_one(self, doc: Dict[str, Any]):
        allowed = _TABLE_COLUMNS.get(self.table)
        payload = {k: v for k, v in doc.items() if not allowed or k in allowed}

        def _run():
            try:
                _sb.table(self.table).insert(payload).execute()
            except Exception:
                rows = self._load_local()
                rows = [row for row in rows if row.get("id") != payload.get("id")]
                rows.append(payload)
                self._save_local(rows)
        await asyncio.to_thread(_run)
        return {"inserted_id": payload.get("id")}

    async def delete_one(self, filt: Dict[str, Any]):
        existing = await self.find_one(filt)
        if not existing:
            return _DeleteResult(deleted_count=0)

        def _run():
            try:
                q = _sb.table(self.table).delete()
                for k, v in filt.items():
                    q = q.eq(k, v)
                q.execute()
            except Exception:
                rows = self._load_local()
                rows = [row for row in rows if not all(row.get(k) == v for k, v in filt.items())]
                self._save_local(rows)

        await asyncio.to_thread(_run)
        return _DeleteResult(deleted_count=1)

    async def update_one(self, filt: Dict[str, Any], update: Dict[str, Any]):
        existing = await self.find_one(filt)
        if not existing:
            return _UpdateResult(matched_count=0)

        allowed = _TABLE_COLUMNS.get(self.table)
        set_payload = {
            k: v for k, v in update.get("$set", {}).items()
            if not allowed or k in allowed
        }

        def _run():
            try:
                q = _sb.table(self.table).update(set_payload)
                for k, v in filt.items():
                    q = q.eq(k, v)
                q.execute()
            except Exception:
                rows = self._load_local()
                updated = False
                for row in rows:
                    if all(row.get(k) == v for k, v in filt.items()):
                        row.update(set_payload)
                        updated = True
                if updated:
                    self._save_local(rows)

        await asyncio.to_thread(_run)
        return _UpdateResult(matched_count=1)


projects = _Collection("projects")
renders = _Collection("renders")
assets = _Collection("assets")
