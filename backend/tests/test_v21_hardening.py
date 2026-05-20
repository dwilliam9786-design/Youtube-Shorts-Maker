"""
Voltcut iteration 2.1 hardening tests.

Covers:
- /api/uploads extension allow-list (allowed: .jpg .png .mp4 .mp3; rejected: .exe)
- /api/uploads response shape preserved
- /api/storage/{kind}/{name} path traversal guard (.., /, \\) -> 400
- /api/storage unknown kind -> 404
- /api/storage successfully serves a valid file
- POST /api/renders mp4@30 still completes (regression)
- During active render, /api/ and /api/renders/{job_id} respond within 5s
  (proves _run is non-blocking via asyncio.create_subprocess_exec)
"""
from __future__ import annotations
import io
import os
import time
import struct
import zlib
import threading
import statistics
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


def _png_bytes(w: int = 8, h: int = 8) -> bytes:
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
    return requests.Session()


# ---------- /api/uploads: allowed extensions ----------
def test_upload_allows_png(session):
    files = {"file": ("TEST_iter21.png", _png_bytes(), "image/png")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "image"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["url"].startswith("/api/storage/uploads/")
    assert body["media_type"] == "image"
    assert body["size"] == len(_png_bytes())
    state["png_url"] = body["url"]
    state["png_name"] = body["url"].rsplit("/", 1)[-1]


def test_upload_allows_jpg(session):
    fake = b"\xff\xd8\xff\xe0" + b"\x00" * 64  # JPEG-ish header
    files = {"file": ("TEST_iter21.jpg", fake, "image/jpeg")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "image"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["media_type"] == "image"


def test_upload_allows_mp4(session):
    fake = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 128
    files = {"file": ("TEST_iter21.mp4", fake, "video/mp4")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "video"}, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["media_type"] == "video"
    assert body["url"].endswith(".mp4")


def test_upload_allows_mp3(session):
    fake = b"ID3\x03\x00\x00\x00\x00" + b"\x00" * 64
    files = {"file": ("TEST_iter21.mp3", fake, "audio/mpeg")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "music"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["media_type"] == "audio"


# ---------- /api/uploads: rejected extension ----------
def test_upload_rejects_exe(session):
    files = {"file": ("TEST_malware.exe", b"MZ\x90\x00" + b"\x00" * 256, "application/octet-stream")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "image"}, timeout=20)
    assert r.status_code == 415, f"expected 415, got {r.status_code} body={r.text[:200]}"


def test_upload_rejects_txt(session):
    files = {"file": ("TEST_notes.txt", b"hello", "text/plain")}
    r = session.post(f"{API}/uploads", files=files, data={"kind": "image"}, timeout=20)
    assert r.status_code == 415


# ---------- /api/storage: path traversal guard ----------
def test_storage_rejects_dotdot(session):
    # ".." in filename -> 400
    r = session.get(f"{API}/storage/uploads/..foo.png", timeout=10, allow_redirects=False)
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


def test_storage_rejects_backslash(session):
    # backslash in name -> 400. URL-encode it so router accepts the path param.
    r = session.get(f"{API}/storage/uploads/foo%5Cbar.png", timeout=10, allow_redirects=False)
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


def test_storage_rejects_unknown_kind(session):
    r = session.get(f"{API}/storage/foo/bar.jpg", timeout=10, allow_redirects=False)
    assert r.status_code == 404, f"expected 404, got {r.status_code}"


def test_storage_serves_valid_file(session):
    """Uses the PNG uploaded earlier — verifies happy path still works."""
    name = state.get("png_name")
    assert name, "Upload test must run first"
    r = session.get(f"{API}/storage/uploads/{name}", timeout=15)
    assert r.status_code == 200, r.text
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_storage_missing_file_404(session):
    r = session.get(f"{API}/storage/uploads/nonexistent_xyz_TEST.png", timeout=10)
    assert r.status_code == 404


# ---------- Generate a small project for render regression ----------
@pytest.mark.timeout(180)
def test_generate_project_for_render(session):
    payload = {
        "title": "TEST_iter21_render",
        "script": "Action beats perfection every time.",
        "aspect": "9:16",
        "voice": "nova",
        "caption_theme": "viral_pop",
    }
    r = session.post(f"{API}/projects/generate", json=payload, timeout=180)
    assert r.status_code == 200, r.text[:400]
    p = r.json()
    assert p["status"] == "ready"
    assert len(p.get("scenes", [])) >= 1
    state["pid"] = p["id"]


# ---------- Render regression + non-blocking event loop check ----------
@pytest.mark.timeout(240)
def test_render_mp4_30_nonblocking(session):
    """
    Start a real ffmpeg render and, while it's running, probe /api/ and
    /api/renders/{job_id} at high frequency. Each response must come back
    within 5s — proving the event loop is not blocked by ffmpeg.
    """
    pid = state.get("pid")
    if not pid:
        pytest.skip("no generated project")

    # Reset scenes to safe defaults (no effects)
    g = session.get(f"{API}/projects/{pid}", timeout=15)
    scenes = g.json()["scenes"]
    for s in scenes:
        s["effects"] = []
        s["video_url"] = None
        s["speaker"] = "primary"
    session.patch(f"{API}/projects/{pid}", json={"scenes": scenes}, timeout=20)

    # Start render
    r = session.post(
        f"{API}/renders",
        json={"project_id": pid, "fps": 30, "out_format": "mp4"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]

    # Concurrently probe responsiveness for up to ~25s or until completion
    latencies_root: list = []
    latencies_job: list = []
    slow_calls: list = []
    stop_flag = {"done": False}
    final_doc = {"doc": None}

    def probe():
        probe_sess = requests.Session()
        deadline = time.time() + 200
        while not stop_flag["done"] and time.time() < deadline:
            t0 = time.time()
            try:
                rr = probe_sess.get(f"{API}/", timeout=10)
                dt = time.time() - t0
                latencies_root.append(dt)
                if dt > 5.0:
                    slow_calls.append(("/api/", dt, rr.status_code))
            except Exception as e:
                slow_calls.append(("/api/", -1, str(e)[:80]))
            t0 = time.time()
            try:
                rr = probe_sess.get(f"{API}/renders/{job_id}", timeout=10)
                dt = time.time() - t0
                latencies_job.append(dt)
                if dt > 5.0:
                    slow_calls.append((f"/api/renders/{job_id}", dt, rr.status_code))
                if rr.status_code == 200 and rr.json().get("status") in ("completed", "failed"):
                    final_doc["doc"] = rr.json()
                    stop_flag["done"] = True
                    break
            except Exception as e:
                slow_calls.append((f"/api/renders/{job_id}", -1, str(e)[:80]))
            time.sleep(0.5)

    t = threading.Thread(target=probe, daemon=True)
    t.start()
    t.join(timeout=210)
    stop_flag["done"] = True

    # If probe loop didn't catch completion, do one final check
    if not final_doc["doc"]:
        rr = session.get(f"{API}/renders/{job_id}", timeout=15)
        if rr.status_code == 200:
            final_doc["doc"] = rr.json()

    doc = final_doc["doc"]
    assert doc, "Render never observed in completed/failed state"
    assert doc.get("status") == "completed", f"Render failed/incomplete: {doc}"
    url = doc.get("final_video_url")
    assert url and url.endswith(".mp4")

    # Latency assertions — non-blocking proof
    assert latencies_root, "No /api/ probes recorded"
    assert latencies_job, "No /api/renders probes recorded"
    p_root_max = max(latencies_root)
    p_job_max = max(latencies_job)
    p_root_med = statistics.median(latencies_root)
    p_job_med = statistics.median(latencies_job)
    print(
        f"[non-blocking] /api/      n={len(latencies_root)} median={p_root_med:.3f}s max={p_root_max:.3f}s"
    )
    print(
        f"[non-blocking] /api/renders n={len(latencies_job)} median={p_job_med:.3f}s max={p_job_max:.3f}s"
    )
    if slow_calls:
        print(f"[non-blocking] slow calls (>5s): {slow_calls[:5]}")

    # Hard requirement from the review request
    assert p_root_max < 5.0, f"/api/ exceeded 5s during render (max={p_root_max:.2f}s)"
    assert p_job_max < 5.0, f"/api/renders/{{job_id}} exceeded 5s during render (max={p_job_max:.2f}s)"


# ---------- Cleanup ----------
def test_cleanup(session):
    pid = state.get("pid")
    if pid:
        session.delete(f"{API}/projects/{pid}", timeout=30)
