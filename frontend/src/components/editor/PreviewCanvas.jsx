import React, { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../../lib/store';
import { resolveMedia } from '../../lib/api';

const SPEAKER_COLORS = {
  primary: '#FFD60A',
  speaker2: '#00E0B4',
  speaker3: '#FF7043',
  speaker4: '#9BFF00',
};

const aspectStyle = {
  '9:16': { aspectRatio: '9 / 16' },
  '1:1': { aspectRatio: '1 / 1' },
  '16:9': { aspectRatio: '16 / 9' },
};

export default function PreviewCanvas() {
  const { project, currentTime, isPlaying, setCurrentTime, setPlaying } = useEditorStore();
  const audioRef = useRef(null);
  const musicRef = useRef(null);
  const rafRef = useRef(null);
  const startedAtRef = useRef(0);
  const baseTimeRef = useRef(0);

  const scenes = project?.scenes || [];
  const total = useMemo(
    () => scenes.reduce((acc, s) => acc + (s.duration || 0), 0),
    [scenes]
  );

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

  // RAF playback loop
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (currentTime >= total - 0.05) {
      setCurrentTime(0);
      baseTimeRef.current = 0;
    } else {
      baseTimeRef.current = currentTime;
    }
    startedAtRef.current = performance.now();

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
  }, [isPlaying]);

  // Set audio source whenever active scene CHANGES (not every frame)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const src = audioSrcFor(activeScene);
    if (!src) {
      a.pause();
      a.removeAttribute('src');
      a.load();
      return;
    }
    if (a.dataset.src === src) return;
    a.dataset.src = src;
    a.src = src;
    a.load();
    const onReady = () => {
      a.currentTime = Math.max(0, Math.min(a.duration || 0, sceneLocal));
      if (isPlaying) a.play().catch(() => {});
      a.removeEventListener('canplay', onReady);
    };
    a.addEventListener('canplay', onReady);
    // eslint-disable-next-line
  }, [activeScene?.id]);

  // Play/pause audio when isPlaying toggles
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      if (a.readyState >= 2) {
        a.currentTime = Math.max(0, Math.min(a.duration || 0, sceneLocal));
        a.play().catch(() => {});
      }
      if (musicRef.current && project?.music_url) musicRef.current.play().catch(() => {});
    } else {
      a.pause();
      if (musicRef.current) musicRef.current.pause();
    }
    // eslint-disable-next-line
  }, [isPlaying]);

  // Drift correction: every 250ms re-align audio.currentTime if off by > 0.35s
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const a = audioRef.current;
      if (!a || a.readyState < 2) return;
      if (Math.abs(a.currentTime - sceneLocal) > 0.35) {
        a.currentTime = Math.max(0, Math.min(a.duration || 0, sceneLocal));
      }
    }, 300);
    return () => clearInterval(id);
  }, [isPlaying, sceneLocal]);

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
        <div className="absolute top-3 left-3 font-mono text-xs text-white/80 px-2 py-1 rounded bg-black/50 backdrop-blur">
          {activeIdx >= 0 ? `${activeIdx + 1}/${scenes.length}` : '—'}
        </div>
        <div className="absolute top-3 right-3 font-mono text-xs text-accent px-2 py-1 rounded bg-black/50 backdrop-blur">
          {fmtTC(currentTime)} / {fmtTC(total)}
        </div>
      </div>
      <audio ref={audioRef} preload="auto" crossOrigin="anonymous" />
      {project.music_url && (
        <audio
          ref={musicRef}
          src={resolveMedia(project.music_url)}
          preload="auto"
          loop
          volume={0.2}
        />
      )}
    </div>
  );
}

function audioSrcFor(scene) {
  if (!scene?.voiceover_url) return '';
  const raw = scene.voiceover_url;
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
  const t = Math.min(1, sceneLocal / Math.max(0.01, scene.duration));
  const k = scene.animation;
  let transform = 'scale(1.05)';
  if (k === 'ken_burns_in') transform = `scale(${1.05 + 0.15 * t})`;
  if (k === 'ken_burns_out') transform = `scale(${1.25 - 0.15 * t})`;
  if (k === 'punch_in') transform = `scale(${1.0 + 0.25 * t})`;
  if (k === 'slow_pan') transform = `scale(1.15) translateX(${-2 + 6 * t}%)`;
  if (k === 'none') transform = 'scale(1)';

  const effects = scene.effects || [];
  const filters = [];
  if (effects.includes('vignette')) filters.push('contrast(1.05)');
  if (effects.includes('film_burn')) filters.push('sepia(0.18) saturate(1.2)');
  if (effects.includes('blur_reveal')) {
    const blur = Math.max(0, 8 - sceneLocal * 10);
    if (blur > 0) filters.push(`blur(${blur}px)`);
  }
  if (effects.includes('glitch')) filters.push('hue-rotate(8deg)');
  const filterCss = filters.join(' ') || 'none';

  const shake = effects.includes('shake') ? `translate(${Math.sin(sceneLocal * 30) * 4}px, ${Math.cos(sceneLocal * 30) * 4}px)` : '';
  const finalTransform = `${transform} ${shake}`.trim();
  const showFlash = effects.includes('flash') && sceneLocal < 0.12;
  const showRgb = effects.includes('rgb_split');

  const mediaSrc = scene.video_url ? resolveMedia(scene.video_url) : scene.image_url;

  return (
    <div className="absolute inset-0">
      {showRgb && mediaSrc && (
        <>
          <img src={mediaSrc} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen" style={{ transform: `${finalTransform} translateX(-6px)`, filter: 'brightness(0.6) sepia(1) saturate(8) hue-rotate(-30deg)' }} />
          <img src={mediaSrc} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen" style={{ transform: `${finalTransform} translateX(6px)`, filter: 'brightness(0.6) sepia(1) saturate(8) hue-rotate(180deg)' }} />
        </>
      )}
      {mediaSrc ? (
        scene.video_url ? (
          <video
            src={mediaSrc}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: finalTransform, filter: filterCss }}
          />
        ) : (
          <img
            src={mediaSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-75"
            style={{ transform: finalTransform, filter: filterCss }}
          />
        )
      ) : (
        <div className="absolute inset-0 bg-bg-panel grid place-items-center text-ink-muted text-sm font-mono">
          {scene.script?.slice(0, 60) || 'No visual'}
        </div>
      )}
      {showFlash && <div className="absolute inset-0 bg-white" style={{ opacity: (0.12 - sceneLocal) / 0.12 * 0.85 }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <CaptionOverlay scene={scene} sceneLocal={sceneLocal} />
    </div>
  );
}

function CaptionOverlay({ scene, sceneLocal }) {
  const { project, setCaptionStyle } = useEditorStore.getState();
  const style = project?.caption_style || {};
  const cap = (scene.captions || []).find(
    (c) => sceneLocal >= c.start - 0.02 && sceneLocal <= c.end + 0.02
  );
  if (!cap) return null;
  const speaker = cap.speaker || scene.speaker || 'primary';
  const activeColor = style.active_color || SPEAKER_COLORS[speaker] || SPEAKER_COLORS.primary;
  const phraseColor = style.phrase_color || '#FFFFFF';
  const sizeActive = style.size_active || 96;
  const sizePhrase = style.size_phrase || 42;
  const stroke = style.stroke_width ?? 6;
  const upper = style.uppercase !== false;
  const showPhrase = style.show_phrase !== false && sizePhrase > 0;
  const position = style.position || 'bottom';
  const offsetX = style.offset_x || 0;
  const offsetY = style.offset_y || 0;
  const bg = style.background || 'none';
  const fontFamily = ({
    bold_sans: 'Satoshi, system-ui, sans-serif',
    display: '"Cabinet Grotesk", system-ui, sans-serif',
    narrow: '"Arial Narrow", sans-serif',
    mono: '"JetBrains Mono", monospace',
    serif: 'Georgia, serif',
  })[style.font || 'bold_sans'];

  const activeWord = (cap.words || []).find(
    (w) => sceneLocal >= w.start - 0.02 && sceneLocal <= w.end + 0.02
  );

  const positionClass = position === 'middle' ? 'top-1/2 -translate-y-1/2' : position === 'top' ? 'top-[10%]' : 'bottom-[12%]';

  const boxStyleActive =
    bg === 'dark_box' ? { background: 'rgba(0,0,0,0.6)', padding: '0.15em 0.5em', borderRadius: 8 } :
    bg === 'accent_box' ? { background: activeColor + '55', padding: '0.15em 0.5em', borderRadius: 8 } : {};
  const boxStylePhrase =
    bg === 'dark_box' ? { background: 'rgba(0,0,0,0.4)', padding: '0.1em 0.5em', borderRadius: 6 } : {};

  const transform = activeWord ? 'scale(1.04)' : 'scale(0.95)';
  const animEnabled = (style.animation || 'pop') !== 'none';

  return (
    <div
      className={`absolute inset-x-4 flex flex-col items-center gap-2 ${positionClass}`}
      style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
      onMouseDown={(e) => {
        const startX = e.clientX;
        const startY = e.clientY;
        const baseX = style.offset_x || 0;
        const baseY = style.offset_y || 0;
        const mm = (ev) => {
          setCaptionStyle({ offset_x: baseX + (ev.clientX - startX), offset_y: baseY + (ev.clientY - startY) });
        };
        const mu = () => {
          window.removeEventListener('mousemove', mm);
          window.removeEventListener('mouseup', mu);
        };
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
      }}
    >
      <div
        className="font-black tracking-tighter text-center px-1"
        style={{
          color: activeColor,
          fontFamily,
          fontSize: `clamp(${Math.max(20, sizeActive * 0.4)}px, ${sizeActive / 14}vw, ${sizeActive}px)`,
          WebkitTextStroke: stroke > 0 ? `${Math.max(1, stroke / 3)}px black` : 'none',
          textShadow: '0 6px 24px rgba(0,0,0,0.7)',
          transform: animEnabled ? transform : 'none',
          transition: 'transform 90ms ease-out',
          ...boxStyleActive,
        }}
      >
        {(upper ? (activeWord?.word || '').toUpperCase() : activeWord?.word || '')}
      </div>
      {showPhrase && (
        <div
          className="font-bold tracking-tight text-center px-1"
          style={{
            color: phraseColor,
            opacity: 0.7,
            fontFamily,
            fontSize: `clamp(14px, ${sizePhrase / 22}vw, ${sizePhrase}px)`,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            ...boxStylePhrase,
          }}
        >
          {upper ? cap.text.toUpperCase() : cap.text}
        </div>
      )}
    </div>
  );
}
