import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../lib/store';
import { resolveMedia } from '../../lib/api';

const aspectStyle = {
  '9:16': { aspectRatio: '9 / 16' },
  '1:1': { aspectRatio: '1 / 1' },
  '16:9': { aspectRatio: '16 / 9' },
};

export default function PreviewCanvas() {
  const { project, currentTime, isPlaying, setCurrentTime, setPlaying } = useEditorStore();
  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const startedAtRef = useRef(0);
  const baseTimeRef = useRef(0);

  const scenes = project?.scenes || [];
  const total = useMemo(
    () => scenes.reduce((acc, s) => acc + (s.duration || 0), 0),
    [scenes]
  );

  // Determine active scene + local offset
  const { activeScene, sceneLocal, activeIdx } = useMemo(() => {
    let t = 0;
    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];
      const d = sc.duration || 0;
      if (currentTime < t + d) return { activeScene: sc, sceneLocal: currentTime - t, activeIdx: i };
      t += d;
    }
    const last = scenes[scenes.length - 1];
    return { activeScene: last, sceneLocal: last?.duration || 0, activeIdx: scenes.length - 1 };
  }, [scenes, currentTime]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    startedAtRef.current = performance.now();
    baseTimeRef.current = currentTime >= total - 0.05 ? 0 : currentTime;
    if (currentTime >= total - 0.05) setCurrentTime(0);

    const tick = () => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      const t = baseTimeRef.current + elapsed;
      if (t >= total) {
        setCurrentTime(total);
        setPlaying(false);
        return;
      }
      setCurrentTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line
  }, [isPlaying, total]);

  // Sync per-scene audio
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !activeScene) return;
    const src = audioSrcFor(activeScene);
    if (!src) {
      a.pause();
      return;
    }
    if (a.dataset.src !== src) {
      a.src = src;
      a.dataset.src = src;
    }
    if (isPlaying) {
      try {
        if (Math.abs(a.currentTime - sceneLocal) > 0.4) a.currentTime = Math.max(0, sceneLocal);
        a.play().catch(() => {});
      } catch (e) {}
    } else {
      a.pause();
    }
  }, [activeScene?.id, isPlaying, sceneLocal]);

  if (!project) return null;

  return (
    <div className="w-full h-full grid place-items-center p-6 bg-black/60 noise relative">
      <div
        className="relative bg-black border border-white/10 rounded-md overflow-hidden shadow-2xl max-h-full"
        style={{ ...aspectStyle[project.aspect || '9:16'], height: '100%', maxWidth: '100%' }}
      >
        {activeScene ? (
          <SceneFrame scene={activeScene} sceneLocal={sceneLocal} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-ink-muted">No scenes</div>
        )}

        {/* Scene counter */}
        <div className="absolute top-3 left-3 font-mono text-xs text-white/80 px-2 py-1 rounded bg-black/50 backdrop-blur">
          {activeIdx >= 0 ? `${activeIdx + 1}/${scenes.length}` : '—'}
        </div>
        <div className="absolute top-3 right-3 font-mono text-xs text-accent px-2 py-1 rounded bg-black/50 backdrop-blur">
          {fmtTC(currentTime)} / {fmtTC(total)}
        </div>
      </div>
      <audio ref={audioRef} preload="auto" />
    </div>
  );
}

function audioSrcFor(scene) {
  if (!scene?.voiceover_url) return '';
  const raw = scene.voiceover_url;
  // backend stores local fs path; expose via /api/storage/voiceover/<file>
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/api/')) return resolveMedia(raw);
  const parts = raw.split('/');
  const name = parts[parts.length - 1];
  return resolveMedia(`/api/storage/voiceover/${name}`);
}

function fmtTC(t) {
  const tt = Math.max(0, t || 0);
  const m = Math.floor(tt / 60);
  const s = Math.floor(tt % 60);
  const cs = Math.floor((tt - Math.floor(tt)) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function SceneFrame({ scene, sceneLocal }) {
  // Ken Burns CSS based on scene.animation
  const t = sceneLocal / Math.max(0.01, scene.duration);
  const k = scene.animation;
  let transform = 'scale(1.05)';
  if (k === 'ken_burns_in') transform = `scale(${1.05 + 0.15 * t})`;
  if (k === 'ken_burns_out') transform = `scale(${1.25 - 0.15 * t})`;
  if (k === 'punch_in') transform = `scale(${1.0 + 0.25 * t})`;
  if (k === 'slow_pan') transform = `scale(1.15) translateX(${-2 + 6 * t}%)`;

  return (
    <div className="absolute inset-0">
      {scene.image_url ? (
        <img
          src={scene.image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-100"
          style={{ transform }}
        />
      ) : (
        <div className="absolute inset-0 bg-bg-panel grid place-items-center text-ink-muted text-sm font-mono">
          {scene.script?.slice(0, 60) || 'No visual'}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <CaptionOverlay scene={scene} sceneLocal={sceneLocal} />
    </div>
  );
}

function CaptionOverlay({ scene, sceneLocal }) {
  const cap = (scene.captions || []).find((c) => sceneLocal >= c.start - 0.02 && sceneLocal <= c.end + 0.02);
  if (!cap) return null;
  return (
    <div className="absolute inset-x-4 bottom-[14%] flex justify-center pointer-events-none">
      <div className="font-display font-black tracking-tight text-center px-4" style={{ fontSize: 'clamp(22px, 5vw, 56px)' }}>
        {cap.words && cap.words.length > 0 ? (
          cap.words.map((w, i) => {
            const active = sceneLocal >= w.start - 0.02 && sceneLocal <= w.end + 0.02;
            return (
              <span key={i} className={`kara ${active ? 'active' : ''} mx-1`} style={{ color: active ? '#FFD60A' : 'white' }}>
                {w.word.toUpperCase()}
              </span>
            );
          })
        ) : (
          <span className="text-white">{cap.text.toUpperCase()}</span>
        )}
      </div>
    </div>
  );
}
