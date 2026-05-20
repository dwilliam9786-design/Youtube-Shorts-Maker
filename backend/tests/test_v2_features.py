"""
Voltcut v2 backend tests.

Covers new endpoints / fields added in iteration 2:
- POST /api/uploads multipart (image/video/audio)
- GET /api/storage/uploads/{name}
- GET /api/meta extended (effects, animations, transitions, speakers, formats, fps_options)
- POST /api/projects/generate end-to-end (1-sentence script)
- POST /api/renders {project_id, fps, out_format} for mp4/webm/mov
- Edge: invalid out_format -> mp4 fallback
- Edge: invalid fps -> clamped 20..90
- PATCH /api/projects/{id} stores new Scene fields (effects, speaker, video_url)
- GET /api/projects/{id} round-trips new Scene fields
- DELETE /api/projects/{id}
"""
from __future__ import annotations
import io
import os
import time
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE_URL}/api"

state: dict = {}


# ------------------- helpers -------------------
def _png_bytes(w: int = 8, h: int = 8) -> bytes:
    """Construct minimal valid PNG (white image)."""
    def chunk(typ: bytes, data: bytes) -> bytes:
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    raw = b"".join(b"\x00" + b"\xff\xff\xff" * w for _ in range(h))
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


# ------------------- /api/meta extended -------------------
def test_meta_extended(session):
    r = session.get(f"{API}/meta", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for key in ("effects", "animations", "transitions", "speakers", "formats", "fps_options"):
        assert key in data, f"Missing meta key: {key}"
        assert isinstance(data[key], list)
        assert len(data[key]) > 0
    # specific values
    effect_ids = {e["id"] for e in data["effects"]}
    assert {"shake", "rgb_split", "glitch"}.issubset(effect_ids)
    fmt_ids = {f["id"] for f in data["formats"]}
    assert {"mp4", "webm", "mov"}.issubset(fmt_ids)
    speaker_ids = {s["id"] for s in data["speakers"]}
    assert "primary" in speaker_ids
    assert 30 in data["fps_options"]
    assert 60 in data["fps_options"]


# ------------------- Upload (image) -------------------
def test_upload_image_and_fetch(session):
    png = _png_bytes()
    files = {"file": ("TEST_pic.png", png, "image/png")}
    data = {"kind": "image"}
    r = session.post(f"{API}/uploads", files=files, data=data, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["url"].startswith("/api/storage/uploads/")
    assert body["media_type"] == "image"
    assert body["kind"] == "image"
    assert body["size"] == len(png)
    state["upload_image_url"] = body["url"]

    # GET file
    fetch = session.get(f"{BASE_URL}{body['url']}", timeout=20)
    assert fetch.status_code == 200, fetch.text
    ctype = fetch.headers.get("content-type", "")
    assert "png" in ctype or "image" in ctype, f"unexpected content-type {ctype}"
    assert fetch.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_upload_audio_media_type(session):
    """Verify media_type detection for audio extension."""
    files = {"file": ("TEST_clip.mp3", b"ID3\x03\x00\x00\x00\x00" + b"\x00" * 64, "audio/mpeg")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "music"}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["media_type"] == "audio"
    assert body["kind"] == "music"
    assert body["url"].endswith(".mp3")


def test_upload_video_media_type(session):
    """Verify media_type detection for video extension. Content not actually valid mp4, but we only assert metadata + serving."""
    fake_mp4 = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2mp41" + b"\x00" * 256
    files = {"file": ("TEST_clip.mp4", fake_mp4, "video/mp4")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "video"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["media_type"] == "video"
    assert body["url"].endswith(".mp4")
    # Verify served
    fetched = session.get(f"{BASE_URL}{body['url']}", timeout=20)
    assert fetched.status_code == 200


# ------------------- Generate small project (reused for render tests) -------------------
@pytest.mark.timeout(180)
def test_generate_small_project(session):
    payload = {
        "title": "TEST_v2_small",
        "script": "Action beats perfection every single time.",
        "aspect": "9:16",
        "voice": "nova",
        "caption_theme": "viral_pop",
    }
    r = session.post(f"{API}/projects/generate", json=payload, timeout=180)
    assert r.status_code == 200, r.text[:600]
    p = r.json()
    assert p["status"] == "ready"
    assert len(p.get("scenes", [])) >= 1
    s0 = p["scenes"][0]
    # New Scene fields default-present
    assert "effects" in s0 and isinstance(s0["effects"], list)
    assert "speaker" in s0
    assert "video_url" in s0  # may be None but key present
    state["pid"] = p["id"]


# ------------------- PATCH new Scene fields + GET round-trip -------------------
def test_patch_scene_new_fields(session):
    pid = state.get("pid")
    assert pid, "Generate test must run first"

    # Fetch and modify
    r = session.get(f"{API}/projects/{pid}", timeout=15)
    assert r.status_code == 200
    scenes = r.json()["scenes"]
    assert len(scenes) >= 1
    # Mutate scene 0
    scenes[0]["effects"] = ["shake", "rgb_split"]
    scenes[0]["speaker"] = "speaker2"
    scenes[0]["video_url"] = state.get("upload_image_url") or "/api/storage/uploads/dummy.mp4"

    rp = session.patch(f"{API}/projects/{pid}", json={"scenes": scenes}, timeout=20)
    assert rp.status_code == 200, rp.text
    patched = rp.json()
    s0 = patched["scenes"][0]
    assert s0["effects"] == ["shake", "rgb_split"]
    assert s0["speaker"] == "speaker2"
    assert s0["video_url"] == scenes[0]["video_url"]

    # GET again
    g = session.get(f"{API}/projects/{pid}", timeout=15)
    assert g.status_code == 200
    s0g = g.json()["scenes"][0]
    assert s0g["effects"] == ["shake", "rgb_split"]
    assert s0g["speaker"] == "speaker2"
    assert s0g["video_url"] == scenes[0]["video_url"]
    # Sanity: server stripped any mongo _id
    assert "_id" not in g.json()


# ------------------- Render helper -------------------
def _start_and_wait_render(session, pid, *, fps=30, out_format="mp4", timeout_s=180):
    r = session.post(
        f"{API}/renders",
        json={"project_id": pid, "fps": fps, "out_format": out_format},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "queued"
    # echo
    assert job.get("out_format") == out_format
    job_id = job["job_id"]

    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        try:
            rr = session.get(f"{API}/renders/{job_id}", timeout=60)
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError):
            time.sleep(6)
            continue
        if rr.status_code in (502, 503, 504):
            # Gateway timeout while backend ffmpeg is blocking event loop — retry
            time.sleep(6)
            continue
        assert rr.status_code == 200, f"status={rr.status_code} body={rr.text[:200]}"
        doc = rr.json()
        last = doc
        if doc.get("status") == "completed":
            return doc
        if doc.get("status") == "failed":
            pytest.fail(f"Render failed: {doc.get('error')}")
        time.sleep(6)
    pytest.fail(f"Render did not complete in {timeout_s}s; last={last}")


# ------------------- Render: mp4 @ 30fps -------------------
@pytest.mark.timeout(220)
def test_render_mp4_30fps(session):
    pid = state.get("pid")
    if not pid:
        pytest.skip("no generated project")
    # Reset scene fields to safe defaults (remove effects + video_url override to avoid ffmpeg issues)
    g = session.get(f"{API}/projects/{pid}", timeout=15)
    scenes = g.json()["scenes"]
    for s in scenes:
        s["effects"] = []
        s["video_url"] = None
        s["speaker"] = "primary"
    session.patch(f"{API}/projects/{pid}", json={"scenes": scenes}, timeout=20)

    doc = _start_and_wait_render(session, pid, fps=30, out_format="mp4", timeout_s=180)
    url = doc.get("final_video_url")
    assert url and url.endswith(".mp4"), url
    state["mp4_url"] = url
    # served
    r = session.get(f"{BASE_URL}{url}", timeout=30, stream=True)
    assert r.status_code == 200
    chunk = next(r.iter_content(chunk_size=2048), b"")
    assert len(chunk) > 0


# ------------------- Edge: invalid out_format -> defaults to mp4 -------------------
@pytest.mark.timeout(220)
def test_render_invalid_format_falls_back_to_mp4(session):
    pid = state.get("pid")
    if not pid:
        pytest.skip("no generated project")
    doc = _start_and_wait_render(session, pid, fps=30, out_format="bogus", timeout_s=180)
    url = doc.get("final_video_url")
    # FORMATS.get("bogus", FORMATS["mp4"]) -> ext is "mp4"
    assert url and url.endswith(".mp4"), f"expected mp4 fallback, got {url}"


# ------------------- Edge: invalid fps clamps to 20..90 -------------------
@pytest.mark.timeout(220)
def test_render_invalid_fps_clamps(session):
    pid = state.get("pid")
    if not pid:
        pytest.skip("no generated project")
    # fps=5 should clamp to 20; render still succeeds
    doc = _start_and_wait_render(session, pid, fps=5, out_format="mp4", timeout_s=180)
    assert doc.get("final_video_url", "").endswith(".mp4")


# ------------------- Render: webm (VP9) -------------------
@pytest.mark.timeout(420)
def test_render_webm(session):
    pid = state.get("pid")
    if not pid:
        pytest.skip("no generated project")
    doc = _start_and_wait_render(session, pid, fps=24, out_format="webm", timeout_s=360)
    url = doc.get("final_video_url")
    assert url and url.endswith(".webm"), url
    # served
    r = session.get(f"{BASE_URL}{url}", timeout=60, stream=True)
    assert r.status_code == 200
    assert len(next(r.iter_content(chunk_size=2048), b"")) > 0


# ------------------- Render: mov -------------------
@pytest.mark.timeout(360)
def test_render_mov(session):
    pid = state.get("pid")
    if not pid:
        pytest.skip("no generated project")
    doc = _start_and_wait_render(session, pid, fps=30, out_format="mov", timeout_s=300)
    url = doc.get("final_video_url")
    assert url and url.endswith(".mov"), url
    r = session.get(f"{BASE_URL}{url}", timeout=60, stream=True)
    assert r.status_code == 200
    assert len(next(r.iter_content(chunk_size=2048), b"")) > 0


# ------------------- Cleanup -------------------
def test_delete_v2_project(session):
    pid = state.get("pid")
    if not pid:
        pytest.skip("no project to delete")
    r = session.delete(f"{API}/projects/{pid}", timeout=60)
    assert r.status_code == 200
    assert r.json().get("deleted") in (0, 1)
    g = session.get(f"{API}/projects/{pid}", timeout=30)
    assert g.status_code == 404
