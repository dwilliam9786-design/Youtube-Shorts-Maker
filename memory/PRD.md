# Voltcut — AI Short-Form Video Studio

## Original problem statement
Build a full-stack AI-powered short-form video creation and editing platform similar
to modern viral content generators (TikTok / Reels / Shorts / faceless automation).
Users generate videos from scripts, upload assets, edit on a pro timeline, get
auto-captions synced to speakers, apply trending transitions/effects, add music,
and render/export in high quality. Inspired by CapCut + Linear + Notion + Descript.

## Architecture (v1)
- **Frontend**: React 18 (CRA) + TailwindCSS + Framer Motion + Zustand + React
  Router + Sonner. Custom shadcn-style components. Fonts: Cabinet Grotesk +
  Satoshi + JetBrains Mono. Theme: pure obsidian dark + Cyber Yellow accent (no
  AI-slop purple gradients).
- **Backend**: FastAPI + Motor (MongoDB async) + emergentintegrations for
  GPT-5.2 / OpenAI TTS / Whisper-1.
- **Render engine**: FFmpeg (system) — per-scene composition with `zoompan`
  (Ken Burns / punch-in / slow pan) + chained `drawtext` for burned-in karaoke
  captions + concat to final 1080×1920 / 1080×1080 / 1920×1080 MP4.
- **Storage**: local FS under `/app/storage/{voiceover,renders,uploads}`,
  served via `/api/storage/{kind}/{name}` endpoint.
- **Auth**: deferred to v2 (single workspace for v1).

## User personas
1. **Faceless creator** — pastes a script, lets AI generate scenes + voiceover +
   stock visuals, exports a 9:16 short.
2. **Indie editor** — opens AI-generated project in editor, tweaks captions,
   swaps stock visuals from library, applies Viral Mode, re-renders.
3. **Marketer** — repurposes long-form copy into multiple shorts.

## Core requirements (static)
- AI script → scene split (GPT-5.2 returns JSON with script + keywords + animation + transition + emphasis words).
- TTS voiceover per scene (OpenAI tts-1, 6 voices: alloy, echo, fable, onyx, nova, shimmer).
- Whisper word-level timestamps for karaoke captions (3-word phrase groups).
- Pixabay-style asset library (graceful mock fallback when no API key).
- Multi-track timeline UI (video, captions, voiceover, music) with playhead, zoom, ruler.
- Inspector panel: per-scene script, duration, animation, transition, captions list.
- Live preview canvas with playback + audio sync + animated karaoke captions.
- FFmpeg server-side render with progress polling and download.

## Implemented (May 2026 — initial build)
- ✅ Landing page (cinematic Cabinet Grotesk hero, marquee features, workflow grid, CTA).
- ✅ Projects dashboard (grid w/ thumbnails, status pills, delete, blank-create).
- ✅ AI Studio wizard (script textarea, aspect/voice/theme selectors, full-pipeline trigger with step messaging).
- ✅ Editor (3-pane: AssetLibrary | Preview + Timeline | Inspector). Transport play/pause/skip + spacebar + Cmd+S shortcuts. Title rename. Viral Mode one-click.
- ✅ AssetLibrary: Pixabay-style image grid + music tab w/ audio preview, drag-into-scene replaces image, add-music sets project.music_url.
- ✅ Timeline: 4 tracks, draggable playhead via ruler click, zoom in/out, per-scene clip thumbnails, caption blocks, faux-waveform audio bars.
- ✅ Preview: aspect-correct canvas, Ken-Burns CSS animations, scene-synced audio playback, karaoke word highlighting in Cyber Yellow.
- ✅ Render modal with progress %, terminal-style logs, video player + download button on completion.
- ✅ Backend pipeline: `/api/projects/generate` orchestrates GPT-5.2 → TTS → Whisper → Pixabay in parallel per scene (~25s for 1-sentence script).
- ✅ Render service: zoompan + drawtext with comma-escaped enable expressions; supports 9:16/1:1/16:9; concat with copy-then-reencode fallback.
- ✅ Pytest backend regression: 11/11 passed.

## Backlog / Future (P0/P1/P2)
- **P0**: real upload endpoint for user clips/images; drag-to-reorder scenes on timeline (currently via inspector arrows); waveform on actual audio file.
- **P0**: surface generation progress via WebSocket (currently spinner with simulated step messages).
- **P1**: Auth (Emergent Google Auth) — gate workspaces by user.
- **P1**: Music beat-sync transitions; auto-ducking under voiceover.
- **P1**: ElevenLabs voices upgrade (user-supplied key).
- **P1**: Pixabay real-API integration (user supplies PIXABAY_API_KEY).
- **P2**: AI avatars / lip sync / multi-language dubbing.
- **P2**: Collaboration (shared projects, comments, version history).
- **P2**: Render workers (BullMQ + Redis) for true horizontal scale.
- **P2**: Cloud storage swap (S3/Supabase) replacing local FS.
- **P2**: GPU FFmpeg acceleration.
- **P2**: Convert subprocess.run → asyncio.create_subprocess_exec for non-blocking render.

## Known limits / mocks
- **Pixabay**: PIXABAY_API_KEY is empty → curated Unsplash mock library (intentional, documented).
- **Storage** is local container FS; renders are not persisted across redeploys.
- No multi-user auth (everyone shares one workspace).

## Test credentials
n/a (no auth)
