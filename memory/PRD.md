# Voltcut — AI Short-Form Video Studio

## Original problem statement
Build a full-stack AI-powered short-form video creation and editing platform similar
to modern viral content generators (TikTok / Reels / Shorts / faceless automation).
Users generate videos from scripts, upload assets, edit on a pro timeline, get
auto-captions synced to speakers, apply trending transitions/effects, add music,
and render/export in high quality. Inspired by CapCut + Linear + Notion + Descript.

## Architecture
- **Frontend**: React 18 (CRA) + TailwindCSS + Framer Motion + Zustand + React
  Router + Sonner. Fonts: Cabinet Grotesk + Satoshi + JetBrains Mono. Theme: pure
  obsidian dark + Cyber Yellow (#FFD60A) accent.
- **Backend**: FastAPI + Motor (MongoDB async). `asyncio.create_subprocess_exec`
  for non-blocking ffmpeg. emergentintegrations for GPT-5.2 / OpenAI TTS / Whisper-1.
- **Render engine**: FFmpeg + libass for ASS karaoke captions. Per-scene
  composition (zoompan + effects) → concat → optional music mix → final encode
  in selected format/fps.
- **Storage**: local FS under `/app/storage/{voiceover,renders,uploads}`,
  served via `/api/storage/{kind}/{name}` with path-traversal guard.
- **Auth**: deferred to v2 (single workspace).

## User personas
1. Faceless creator — script → AI → 9:16 short.
2. Indie editor — refine AI-generated scenes, swap visuals, apply effects, re-render.
3. Marketer — repurpose long-form copy into shorts.

## Core requirements
- AI script → scene split (GPT-5.2 JSON).
- TTS voiceover per scene (OpenAI tts-1, 6 voices).
- Whisper word-level timestamps for karaoke captions (3-word phrase groups).
- Pixabay-style asset library (mock fallback when no API key).
- Multi-track timeline (video, captions, voiceover, music) with playhead/zoom/ruler.
- Inspector tabs: Scene / Effects / Captions.
- Live preview canvas with audio sync + animated single-active-word karaoke.
- FFmpeg server-side render with progress polling.

## Implemented (May 2026)
### Iteration 1
- Landing, Dashboard, AI Studio, Editor with 3-pane layout.
- AI pipeline: GPT scene split + TTS + Whisper + Pixabay → ready project.
- Render to 9:16 / 1:1 / 16:9 MP4.

### Iteration 2 (this session)
- **User uploads** (`POST /api/uploads`): image / video / audio, multipart, streaming
  write with 200MB cap, extension allow-list, served via `/api/storage/uploads/...`.
- **Library upload tab** in editor + drag-to-drop user files into scenes.
- **Drag-to-reorder** scenes directly on the timeline (HTML5 DnD with drop-target highlight).
- **Multi-select** via shift/cmd click on timeline clips; Inspector supports multi-edit
  (duration, animation, transition, effects).
- **Effects engine** with 8 effects (Shake, RGB Split, Glitch, Blur Reveal, Vignette,
  Film Burn, Flash, Speed Ramp) — applied in both preview (CSS) and render (FFmpeg filters).
- **ASS karaoke captions** rendered with libass — proper per-word coloring with
  speaker palette, matches preview exactly (large active word + dimmed phrase).
- **Multi-speaker styles**: per-scene speaker color (4 palette options).
- **Render options**: FPS dropdown 20/24/30/48/60/90, Format dropdown MP4 / WebM
  (VP9+Opus) / MOV / GIF.
- **Audio playback fix** in preview canvas: scene-change-triggered src swap with
  proper canplay event handling + 300ms drift correction.
- **Caption styling alignment** between preview and rendered output (single
  active-word large + speaker color + phrase below).

### Iteration 2.1 (hardening)
- `asyncio.create_subprocess_exec` everywhere — event loop never blocks during
  long renders. Verified: max poll latency 0.293s during active ffmpeg render.
- `/api/storage` path-traversal guard (`..`, `/`, `\\` rejected with 400).
- `/api/uploads` streaming write + extension allow-list + 200MB cap.

## Test status
- **35/35 backend pytest tests passing** (11 iter-1 + 12 iter-2 + 14 iter-2.1).
- Visually verified all pages render with cinematic dark UI.
- All exports: MP4@30 ✓, MP4@60 ✓, WebM@24 (VP9+Opus) ✓, MOV ✓.

## Known limits / mocks
- **Pixabay**: PIXABAY_API_KEY empty → curated Unsplash mock (intentional).
- **Storage** is local FS (not persisted across redeploys).
- **No multi-user auth** (single workspace).
- **WebSocket progress** not implemented — polling at 1.2s cadence (responsive
  enough; backend non-blocking now eliminates 502s).
- **ffmpeg.wasm** intentionally not used — server-side FFmpeg is faster and
  supports the full filter graph (libass, zoompan, vp9, etc.).
- **HEIC for video** is not a thing — HEIC is image-only. We offer MP4, WebM,
  MOV, GIF as the standard video export formats.
- **True multi-speaker diarization** requires pyannote — Whisper alone returns a
  single speaker. Multi-speaker styling is currently per-scene (manual choice).
- **rgb_split + other effects together** can produce a malformed filtergraph
  (known issue — rgb_split uses `;` which conflicts with comma chaining). Use
  rgb_split standalone for now.

## Backlog (prioritized)
- **P0**: WebSocket / SSE for render and generation progress (replace polling).
- **P0**: True per-word caption editor (edit text + per-word color overrides).
- **P0**: Audio waveform from the real voiceover file (currently a faux sine).
- **P1**: Drag-and-drop file upload directly onto a timeline clip.
- **P1**: ElevenLabs voices (premium TTS) — user-supplied key.
- **P1**: Auth via Emergent Google Auth.
- **P1**: Real Pixabay API integration.
- **P1**: True multi-speaker diarization (pyannote) for uploaded audio.
- **P1**: Effects filter_complex builder so rgb_split composes with other effects.
- **P2**: Beat-sync transitions; auto-ducking under voiceover.
- **P2**: AI avatars / lip sync / dubbing.
- **P2**: Collaboration (shared projects, comments, version history).
- **P2**: Dedicated render workers + Redis/BullMQ queue.
- **P2**: Cloud storage (S3 / Supabase) swap.

## Test credentials
n/a (no auth in v1)
