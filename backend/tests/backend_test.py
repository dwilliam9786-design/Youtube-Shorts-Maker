"""
Voltcut backend regression tests.

Covers:
- Health / meta
- Projects CRUD (list, blank, patch, delete)
- AI generation pipeline (POST /api/projects/generate)
- Library search (image / music) — mocked fallback
- Render job lifecycle (start, poll, MP4 served)
"""
from __future__ import annotations
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Tests need backend URL; allow override via env, otherwise read frontend/.env
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

API = f"{BASE_URL}/api"

# Shared state across tests (ordered execution required)
state: dict = {}


@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health & meta ----------
def test_health(session):
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "voltcut"
    assert data.get("status") == "ok"
    assert "time" in data


def test_meta(session):
    r = session.get(f"{API}/meta", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for key in ("voices", "caption_themes", "aspects", "viral_modes"):
        assert key in data, f"missing {key}"
        assert isinstance(data[key], list) and len(data[key]) > 0
    assert "9:16" in data["aspects"]
    voice_ids = {v["id"] for v in data["voices"]}
    assert {"nova", "alloy"}.issubset(voice_ids)


# ---------- Projects list ----------
def test_list_projects(session):
    r = session.get(f"{API}/projects", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # No assertion on count — pre-existing project from manual run may or may not be there


# ---------- Blank project ----------
def test_create_blank_project(session):
    r = session.post(
        f"{API}/projects/blank",
        json={"title": "TEST_blank_project", "aspect": "9:16"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["title"] == "TEST_blank_project"
    assert p["aspect"] == "9:16"
    assert p["status"] == "draft"
    assert "id" in p and isinstance(p["id"], str) and len(p["id"]) > 0
    assert "_id" not in p
    state["blank_id"] = p["id"]

    # GET to verify persistence
    g = session.get(f"{API}/projects/{p['id']}", timeout=15)
    assert g.status_code == 200
    assert g.json()["id"] == p["id"]


# ---------- Library search ----------
def test_library_search_images(session):
    r = session.get(f"{API}/library/search", params={"q": "ocean", "type": "image"}, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0
    item = data["items"][0]
    assert "url" in item and item["url"].startswith("http")
    assert item["type"] == "image"


def test_library_search_music(session):
    r = session.get(f"{API}/library/search", params={"q": "", "type": "music"}, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert len(data["items"]) > 0
    assert data["items"][0]["type"] == "audio"
    assert "preview" in data["items"][0]


# ---------- AI generation pipeline ----------
@pytest.mark.timeout(180)
def test_generate_project(session):
    payload = {
        "title": "TEST_generated",
        "script": "Most people never start because they fear failure. But the truth is, action beats perfection every single time.",
        "aspect": "9:16",
        "voice": "nova",
        "caption_theme": "viral_pop",
    }
    r = session.post(f"{API}/projects/generate", json=payload, timeout=180)
    assert r.status_code == 200, f"Generate failed: {r.status_code} {r.text[:600]}"
    p = r.json()
    assert p["status"] == "ready", f"status={p.get('status')}"
    assert p["title"] == "TEST_generated"
    assert "_id" not in p
    scenes = p.get("scenes", [])
    assert len(scenes) >= 1, "No scenes generated"
    s0 = scenes[0]
    # Validate scene structure
    assert s0.get("script")
    assert s0.get("duration", 0) > 0
    assert s0.get("voiceover_url"), "voiceover_url missing"
    assert s0.get("image_url"), "image_url missing"
    assert isinstance(s0.get("captions"), list)
    if s0["captions"]:
        cap = s0["captions"][0]
        assert "text" in cap
        assert "start" in cap and "end" in cap
        assert isinstance(cap.get("words", []), list)
    assert p.get("total_duration", 0) > 0
    state["gen_id"] = p["id"]


def test_patch_project(session):
    pid = state.get("gen_id") or state.get("blank_id")
    assert pid, "No project id from previous test"
    new_title = "TEST_patched_title"
    r = session.patch(f"{API}/projects/{pid}", json={"title": new_title}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == new_title
    # Verify persistence
    g = session.get(f"{API}/projects/{pid}", timeout=15)
    assert g.status_code == 200
    assert g.json()["title"] == new_title


# ---------- Render pipeline ----------
@pytest.mark.timeout(120)
def test_render_lifecycle(session):
    pid = state.get("gen_id")
    if not pid:
        pytest.skip("No generated project to render")

    r = session.post(f"{API}/renders", json={"project_id": pid}, timeout=20)
    assert r.status_code == 200, r.text
    job = r.json()
    assert "job_id" in job
    assert job["status"] == "queued"
    job_id = job["job_id"]

    # Poll
    deadline = time.time() + 100
    final = None
    last_status = None
    while time.time() < deadline:
        rr = session.get(f"{API}/renders/{job_id}", timeout=15)
        assert rr.status_code == 200
        doc = rr.json()
        last_status = doc.get("status")
        if last_status == "completed":
            final = doc
            break
        if last_status == "failed":
            pytest.fail(f"Render failed: {doc.get('error')}")
        time.sleep(3)
    assert final, f"Render did not complete in time (last status={last_status})"
    final_url = final.get("final_video_url")
    assert final_url and final_url.startswith("/api/storage/renders/"), final_url
    state["final_url"] = final_url


def test_render_mp4_served(session):
    final_url = state.get("final_url")
    if not final_url:
        pytest.skip("No render produced")
    full = f"{BASE_URL}{final_url}"
    r = session.get(full, timeout=30, stream=True)
    assert r.status_code == 200
    ctype = r.headers.get("content-type", "")
    assert "video" in ctype or "mp4" in ctype, f"Unexpected content-type {ctype}"
    # read a few bytes
    chunk = next(r.iter_content(chunk_size=1024), b"")
    assert len(chunk) > 0


# ---------- Cleanup ----------
def test_delete_projects(session):
    for key in ("blank_id", "gen_id"):
        pid = state.get(key)
        if not pid:
            continue
        r = session.delete(f"{API}/projects/{pid}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted") in (0, 1)
        g = session.get(f"{API}/projects/{pid}", timeout=15)
        assert g.status_code == 404
