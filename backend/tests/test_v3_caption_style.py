"""
Voltcut v3 backend tests — caption editing + caption_style system.

Covers:
- GET /api/meta has new keys (caption_presets x5, caption_fonts, caption_positions,
  caption_backgrounds, caption_animations).
- POST /api/projects/blank returns default caption_style with preset='viral_pop'.
- POST /api/projects/generate populates caption_style on the project.
- PATCH /api/projects/{id} accepts caption_style override (round-trip via GET).
- PATCH /api/projects/{id} accepts partial scene caption edits (text + words[].word).
- POST /api/renders mp4@30 with non-default caption_style (hormozi, middle,
  dark_box, show_phrase=false) completes -> final video > 100KB.
- POST /api/renders mp4@30 with caption_style preset 'mrbeast' completes.
- Edge: PATCH /api/projects/{id} with an UNKNOWN caption_style preset still
  succeeds (server stores free-form).
- Regression: GET /api/projects/{id} still serializes.

Skip slow webm/mov renders per request.
"""
from __future__ import annotations
import os
import time
import copy
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

# Existing project from previous iteration (4 scenes, has voice/captions)
EXISTING_PID = "d02d7856f0a64662a462225c81657585"

state: dict = {}


@pytest.fixture(scope="module")
def session():
    return requests.Session()


# ----------------- META -----------------
def test_meta_has_caption_style_keys(session):
    r = session.get(f"{API}/meta", timeout=15)
    assert r.status_code == 200, r.text
    m = r.json()
    # presets: must contain the 5 declared ids
    presets = {p["id"] for p in m.get("caption_presets", [])}
    assert {"viral_pop", "hormozi", "mrbeast", "minimal", "subtitle"}.issubset(presets), presets
    # fonts / positions / backgrounds / animations exist & non-empty
    assert len(m.get("caption_fonts", [])) >= 4
    assert {"top", "middle", "bottom"} == {p["id"] for p in m["caption_positions"]}
    assert {"none", "accent_box", "dark_box"} == {p["id"] for p in m["caption_backgrounds"]}
    assert {"pop", "fade", "slide", "none"} == {p["id"] for p in m["caption_animations"]}
    # all entries have id+label
    for k in ("caption_presets", "caption_fonts", "caption_positions",
              "caption_backgrounds", "caption_animations"):
        for item in m[k]:
            assert "id" in item and "label" in item, (k, item)


# ----------------- BLANK PROJECT -----------------
def test_blank_project_default_caption_style(session):
    r = session.post(f"{API}/projects/blank",
                     json={"title": "TEST_v3_blank", "aspect": "9:16"}, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    state["blank_pid"] = p["id"]
    cs = p.get("caption_style")
    assert isinstance(cs, dict), f"caption_style missing/not dict: {cs}"
    assert cs.get("preset") == "viral_pop"
    assert cs.get("font") == "bold_sans"
    assert cs.get("position") == "bottom"
    assert cs.get("background") == "none"
    assert cs.get("animation") == "pop"
    assert cs.get("uppercase") is True
    assert cs.get("show_phrase") is True
    assert cs.get("active_color", "").startswith("#")
    assert cs.get("phrase_color", "").startswith("#")
    assert isinstance(cs.get("size_active"), int) and cs["size_active"] > 0
    assert isinstance(cs.get("size_phrase"), int) and cs["size_phrase"] > 0
    assert isinstance(cs.get("stroke_width"), int)
    assert isinstance(cs.get("phrase_opacity"), (int, float))


# ----------------- GENERATE → caption_style present -----------------
def test_generate_project_has_caption_style(session):
    r = session.post(
        f"{API}/projects/generate",
        json={"title": "TEST_v3_gen", "script": "Stay hungry. Stay foolish.",
              "aspect": "9:16", "voice": "nova", "caption_theme": "viral_pop"},
        timeout=180,
    )
    assert r.status_code == 200, r.text
    p = r.json()
    state["gen_pid"] = p["id"]
    cs = p.get("caption_style")
    assert isinstance(cs, dict) and cs.get("preset") == "viral_pop"
    assert p.get("status") == "ready"
    assert len(p.get("scenes", [])) >= 1


# ----------------- PATCH caption_style override (round-trip) -----------------
def test_patch_caption_style_roundtrip(session):
    pid = state["blank_pid"]
    override = {
        "preset": "hormozi",
        "font": "display",
        "active_color": "#00E0B4",
        "phrase_color": "#FFFFFF",
        "phrase_opacity": 0.7,
        "position": "middle",
        "size_active": 110,
        "size_phrase": 36,
        "stroke_width": 8,
        "background": "dark_box",
        "uppercase": True,
        "animation": "slide",
        "show_phrase": False,
    }
    r = session.patch(f"{API}/projects/{pid}", json={"caption_style": override}, timeout=15)
    assert r.status_code == 200, r.text
    # GET to confirm persistence
    g = session.get(f"{API}/projects/{pid}", timeout=15).json()
    cs = g["caption_style"]
    for k, v in override.items():
        assert cs.get(k) == v, f"caption_style.{k} mismatch: {cs.get(k)!r} != {v!r}"


# ----------------- PATCH partial scene caption edits -----------------
def test_patch_scene_caption_edits_roundtrip(session):
    pid = state["gen_pid"]
    g = session.get(f"{API}/projects/{pid}", timeout=15).json()
    scenes = copy.deepcopy(g["scenes"])
    assert scenes, "generated project has no scenes"
    # ensure first scene has at least one caption with words
    sc0 = scenes[0]
    caps = sc0.get("captions") or []
    if not caps:
        pytest.skip("scene 0 has no captions to edit")
    cap0 = caps[0]
    cap0["text"] = "EDITED_CAPTION_TEXT"
    if cap0.get("words"):
        cap0["words"][0]["word"] = "EDITEDWORD"
    r = session.patch(f"{API}/projects/{pid}", json={"scenes": scenes}, timeout=20)
    assert r.status_code == 200, r.text
    g2 = session.get(f"{API}/projects/{pid}", timeout=15).json()
    new_cap0 = g2["scenes"][0]["captions"][0]
    assert new_cap0["text"] == "EDITED_CAPTION_TEXT"
    if new_cap0.get("words"):
        assert new_cap0["words"][0]["word"] == "EDITEDWORD"


# ----------------- Edge: unknown preset still accepted -----------------
def test_patch_unknown_preset_accepted(session):
    pid = state["blank_pid"]
    weird = {"preset": "totally_made_up_preset_xyz", "active_color": "#123456",
             "position": "top", "background": "none"}
    r = session.patch(f"{API}/projects/{pid}", json={"caption_style": weird}, timeout=15)
    assert r.status_code == 200, r.text
    g = session.get(f"{API}/projects/{pid}", timeout=15).json()
    assert g["caption_style"]["preset"] == "totally_made_up_preset_xyz"
    assert g["caption_style"]["active_color"] == "#123456"
    assert g["caption_style"]["position"] == "top"


# ----------------- Helpers for render polling -----------------
def _poll_render(session, job_id, timeout_s=240):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout_s:
        r = session.get(f"{API}/renders/{job_id}", timeout=15)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in {"completed", "failed"}:
            return last
        time.sleep(2.0)
    return last


def _verify_video_exists(session, final_url, min_bytes=100 * 1024):
    assert final_url, "no final_video_url"
    # /api/storage/renders/<name>  — final_url already starts with /api
    full = f"{BASE_URL}{final_url}" if final_url.startswith("/api") else final_url
    r = session.get(full, timeout=60, stream=True)
    assert r.status_code == 200, f"video fetch failed: {r.status_code}"
    total = 0
    for chunk in r.iter_content(64 * 1024):
        total += len(chunk)
        if total > min_bytes * 4:
            break  # plenty
    assert total > min_bytes, f"video too small: {total} bytes"
    return total


# ----------------- Render mp4@30 with hormozi style on existing project -----------------
def test_render_mp4_hormozi_style(session):
    # patch existing project with hormozi caption_style
    style = {
        "preset": "hormozi",
        "font": "display",
        "active_color": "#FFD60A",
        "phrase_color": "#FFFFFF",
        "phrase_opacity": 0.55,
        "position": "middle",
        "size_active": 110,
        "size_phrase": 36,
        "stroke_width": 10,
        "background": "dark_box",
        "uppercase": True,
        "animation": "pop",
        "show_phrase": False,
    }
    r = session.patch(f"{API}/projects/{EXISTING_PID}",
                      json={"caption_style": style}, timeout=15)
    assert r.status_code == 200, r.text

    r = session.post(f"{API}/renders",
                     json={"project_id": EXISTING_PID, "fps": 30, "out_format": "mp4"},
                     timeout=15)
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    final = _poll_render(session, job_id, timeout_s=300)
    assert final and final.get("status") == "completed", f"render failed: {final}"
    _verify_video_exists(session, final.get("final_video_url"))


# ----------------- Render mp4@30 with mrbeast preset -----------------
def test_render_mp4_mrbeast_style(session):
    style = {
        "preset": "mrbeast",
        "font": "display",
        "active_color": "#FF3B30",
        "phrase_color": "#FFFFFF",
        "phrase_opacity": 0.6,
        "position": "middle",
        "size_active": 120,
        "size_phrase": 42,
        "stroke_width": 12,
        "background": "accent_box",
        "uppercase": True,
        "animation": "pop",
        "show_phrase": True,
    }
    r = session.patch(f"{API}/projects/{EXISTING_PID}",
                      json={"caption_style": style}, timeout=15)
    assert r.status_code == 200, r.text

    r = session.post(f"{API}/renders",
                     json={"project_id": EXISTING_PID, "fps": 30, "out_format": "mp4"},
                     timeout=15)
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    final = _poll_render(session, job_id, timeout_s=300)
    assert final and final.get("status") == "completed", f"render failed: {final}"
    _verify_video_exists(session, final.get("final_video_url"))


# ----------------- Cleanup test-created projects -----------------
def test_zzz_cleanup(session):
    for key in ("blank_pid", "gen_pid"):
        pid = state.get(key)
        if pid:
            session.delete(f"{API}/projects/{pid}", timeout=10)
