from __future__ import annotations

import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import render_service


def test_render_dependencies_reports_missing_binary(monkeypatch):
    def fake_which(name: str):
        return "C:/tools/ffmpeg.exe" if name == "ffmpeg" else None

    monkeypatch.setattr(render_service.shutil, "which", fake_which)

    deps = render_service.render_dependencies()

    assert deps["available"] is False
    assert deps["binaries"]["ffmpeg"] == "C:/tools/ffmpeg.exe"
    assert deps["binaries"]["ffprobe"] is None


def test_has_audio_stream_uses_ffprobe_result(monkeypatch, tmp_path):
    async def fake_run(cmd):
        assert cmd[0] == "ffprobe"
        return 0, "audio\n"

    monkeypatch.setattr(render_service, "_run", fake_run)

    assert asyncio.run(render_service._has_audio_stream(tmp_path / "clip.mp4")) is True


def test_has_audio_stream_false_on_missing_stream(monkeypatch, tmp_path):
    async def fake_run(cmd):
        return 1, ""

    monkeypatch.setattr(render_service, "_run", fake_run)

    assert asyncio.run(render_service._has_audio_stream(tmp_path / "clip.mp4")) is False


def test_resolve_storage_path_accepts_api_storage_upload(monkeypatch, tmp_path):
    monkeypatch.setattr(render_service, "STORAGE_DIR", tmp_path)

    expected = tmp_path / "uploads" / "clip.mp3"

    assert render_service._resolve_storage_path("/api/storage/uploads/clip.mp3") == expected
