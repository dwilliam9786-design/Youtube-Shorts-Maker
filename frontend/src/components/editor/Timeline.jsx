import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../lib/store';
import { Film, AudioLines, Type, Music, ZoomIn, ZoomOut } from 'lucide-react';

const PX_PER_SEC_DEFAULT = 80;

export default function Timeline() {
  const {
    project, currentTime, setCurrentTime, selectedSceneIds, selectScene, reorderScenes, updateScene, trimScene, setMusicTimeline,
  } = useEditorStore();
  const scenes = project?.scenes || [];
  const total = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC_DEFAULT);
  const [dragOver, setDragOver] = useState(null);
  const stripRef = useRef(null);

  const offsets = useMemo(() => {
    const arr = [];
    let t = 0;
    for (const s of scenes) {
      arr.push(t);
      t += s.duration || 0;
    }
    return arr;
  }, [scenes]);

  const trackWidth = Math.max(800, total * pxPerSec + 200);

  const onRulerClick = (e) => {
    // Only scrub when clicking the empty timeline (not a clip)
    if (e.target.closest('[data-clip]')) return;
    const rect = stripRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + stripRef.current.scrollLeft;
    setCurrentTime(Math.max(0, Math.min(total, x / pxPerSec)));
  };

  useEffect(() => {
    if (!stripRef.current) return;
    const playheadX = currentTime * pxPerSec;
    const el = stripRef.current;
    if (playheadX < el.scrollLeft + 100) el.scrollLeft = Math.max(0, playheadX - 100);
    if (playheadX > el.scrollLeft + el.clientWidth - 100) el.scrollLeft = playheadX - el.clientWidth + 200;
  }, [currentTime, pxPerSec]);

  const onDropClip = (toIdx) => (e) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/scene-idx'), 10);
    if (!Number.isFinite(fromIdx) || fromIdx === toIdx) {
      setDragOver(null);
      return;
    }
    reorderScenes(fromIdx, toIdx);
    setDragOver(null);
  };

  return (
    <div className="h-full flex flex-col bg-bg-panel border-t border-white/8">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/8">
        <div className="flex items-center gap-2 text-xs text-ink-secondary font-mono">
          <span>Timeline</span>
          <span className="text-ink-muted">·</span>
          <span>{scenes.length} scenes</span>
          {selectedSceneIds.length > 1 && <span className="text-accent">· {selectedSceneIds.length} selected</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setPxPerSec((p) => Math.max(20, p - 20))} data-testid="timeline-zoom-out" className="p-1.5 hover:bg-white/5 rounded">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[10px] text-ink-muted w-10 text-center">{pxPerSec}px</span>
          <button onClick={() => setPxPerSec((p) => Math.min(200, p + 20))} data-testid="timeline-zoom-in" className="p-1.5 hover:bg-white/5 rounded">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-32 shrink-0 border-r border-white/8 bg-bg-base">
          {[
            { icon: Film, label: 'VIDEO' },
            { icon: Type, label: 'CAPTIONS' },
            { icon: AudioLines, label: 'VOICEOVER' },
            { icon: Music, label: 'MUSIC' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="h-16 flex items-center gap-2 px-3 border-b border-white/5 text-[10px] uppercase tracking-[0.18em] text-ink-secondary">
              <Icon className="w-3.5 h-3.5" /> {label}
            </div>
          ))}
        </div>

        <div ref={stripRef} className="flex-1 overflow-x-auto overflow-y-hidden relative no-scrollbar" onClick={onRulerClick}>
          <div style={{ width: trackWidth }} className="relative">
            <div className="h-6 sticky top-0 z-10 bg-bg-panel border-b border-white/8 ruler" style={{ backgroundSize: `${pxPerSec}px 100%` }}>
              {Array.from({ length: Math.ceil(total) + 2 }).map((_, i) => (
                <span key={i} className="absolute top-1 text-[10px] font-mono text-ink-muted" style={{ left: i * pxPerSec + 4 }}>
                  {i}s
                </span>
              ))}
            </div>

            {/* Video clips track (with drag-reorder) */}
            <Track height={64}>
              {scenes.map((sc, i) => (
                <Clip
                  key={sc.id}
                  scene={sc}
                  idx={i}
                  left={offsets[i] * pxPerSec}
                  width={Math.max(20, (sc.duration || 0) * pxPerSec)}
                  selected={selectedSceneIds.includes(sc.id)}
                  onSelect={(e) => selectScene(sc.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/scene-idx', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOver(i);
                  }}
                  onDrop={onDropClip(i)}
                  dragOver={dragOver === i}
                  onTrimLeft={(secs) => trimScene(sc.id, secs, 0)}
                  onTrimRight={(secs) => trimScene(sc.id, 0, secs)}
                />
              ))}
            </Track>

            <Track height={64}>
              {scenes.map((sc, i) => (
                <CaptionTrack key={sc.id} scene={sc} left={offsets[i] * pxPerSec} pxPerSec={pxPerSec} />
              ))}
            </Track>

            <Track height={64}>
              {scenes.map((sc, i) => (
                <AudioBar
                  key={sc.id}
                  left={offsets[i] * pxPerSec}
                  width={Math.max(20, (sc.duration || 0) * pxPerSec)}
                  label="VO"
                  color="#34D399"
                  draggable
                  onMove={(dx) => updateScene(sc.id, { audio_offset: Math.max(0, (sc.audio_offset || 0) + dx / pxPerSec) })}
                />
              ))}
            </Track>

            <Track height={64}>
              {project?.music_url && (
                <AudioBar
                  left={(project.music_timeline?.start || 0) * pxPerSec}
                  width={Math.max(20, (project.music_timeline?.duration || total) * pxPerSec)}
                  label="Music"
                  color="#60A5FA"
                  draggable
                  onMove={(dx) => setMusicTimeline({ start: Math.max(0, (project.music_timeline?.start || 0) + dx / pxPerSec) })}
                />
              )}
            </Track>

            <div
              className="absolute top-0 bottom-0 w-px bg-accent z-20 pointer-events-none"
              style={{ left: currentTime * pxPerSec, boxShadow: '0 0 6px #FFD60A' }}
            >
              <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 rotate-45 bg-accent" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-1 text-[10px] text-ink-muted border-t border-white/5 font-mono">
        Tip: Drag clips to reorder · Shift+click to multi-select · Space = play/pause · Cmd/Ctrl+S = save
      </div>
    </div>
  );
}

function Track({ height, children }) {
  return <div className="relative border-b border-white/5" style={{ height }}>{children}</div>;
}

function Clip({ scene, idx, left, width, selected, onSelect, onDragStart, onDragOver, onDrop, dragOver, onTrimLeft, onTrimRight }) {
  const sx = React.useRef(null);
  return (
    <div
      data-clip
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      data-testid={`clip-${scene.id}`}
      className={`absolute top-2 bottom-2 rounded-md overflow-hidden border cursor-grab active:cursor-grabbing select-none group text-left ${
        selected ? 'border-accent ring-1 ring-accent/40' : 'border-white/10 hover:border-white/30'
      } ${dragOver ? 'ring-2 ring-accent' : ''}`}
      style={{ left, width }}
    >
      {scene.video_url ? (
        <video src={scene.video_url} className="absolute inset-0 w-full h-full object-cover opacity-80" muted />
      ) : scene.image_url ? (
        <img src={scene.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
      ) : (
        <div className="absolute inset-0 bg-bg-track" />
      )}
      <div className="relative px-2 py-1.5 text-[10px] font-mono text-white bg-gradient-to-r from-black/80 to-transparent truncate">
        <span className="text-accent mr-1">{idx + 1}</span>
        {(scene.script || '').slice(0, 36)}
      </div>
      {(scene.effects || []).length > 0 && (
        <div className="absolute bottom-1 right-1 text-[9px] font-mono text-black bg-accent px-1 rounded">FX {scene.effects.length}</div>
      )}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          sx.current = e.clientX;
          const mm = (ev) => {
            const dx = ev.clientX - sx.current;
            sx.current = ev.clientX;
            onTrimLeft(dx / 80);
          };
          const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
          window.addEventListener('mousemove', mm);
          window.addEventListener('mouseup', mu);
        }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          sx.current = e.clientX;
          const mm = (ev) => {
            const dx = ev.clientX - sx.current;
            sx.current = ev.clientX;
            onTrimRight(-dx / 80);
          };
          const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
          window.addEventListener('mousemove', mm);
          window.addEventListener('mouseup', mu);
        }}
      />
    </div>
  );
}

function CaptionTrack({ scene, left, pxPerSec }) {
  const caps = scene.captions || [];
  return (
    <div className="absolute top-0 bottom-0" style={{ left }}>
      {caps.map((c) => (
        <div
          key={c.id}
          className="absolute top-2 h-12 rounded bg-accent/15 border border-accent/40 px-1.5 text-[10px] font-bold text-accent flex items-center overflow-hidden pointer-events-none"
          style={{ left: c.start * pxPerSec, width: Math.max(20, (c.end - c.start) * pxPerSec) }}
          title={c.text}
        >
          <span className="truncate">{c.text}</span>
        </div>
      ))}
    </div>
  );
}

function AudioBar({ left, width, label, color, draggable, onMove }) {
  const sx = React.useRef(null);
  return (
    <div
      className={`absolute top-2 bottom-2 rounded-md border overflow-hidden flex items-center px-2 text-[10px] font-mono text-white ${draggable ? 'cursor-move' : 'pointer-events-none'}`}
      style={{ left, width, background: `${color}22`, borderColor: `${color}66` }}
      onMouseDown={draggable ? (e) => {
        sx.current = e.clientX;
        const mm = (ev) => {
          const dx = ev.clientX - sx.current;
          sx.current = ev.clientX;
          onMove?.(dx);
        };
        const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
      } : undefined}
    >
      <svg className="absolute inset-y-0 left-0 right-0 w-full h-full opacity-50">
        <path
          d={`M 0 24 ${Array.from({ length: 40 }).map((_, i) => `L ${(width / 40) * i} ${12 + Math.sin(i * 0.7) * 8 + (i % 3) * 2}`).join(' ')}`}
          stroke={color}
          fill="none"
          strokeWidth="1.5"
        />
      </svg>
      <span className="relative">{label}</span>
    </div>
  );
}
