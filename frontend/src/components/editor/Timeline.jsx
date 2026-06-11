import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../lib/store';
import { Film, AudioLines, Type, Music, ZoomIn, ZoomOut } from 'lucide-react';

const PX_PER_SEC_DEFAULT = 80;
const SNAP_SECONDS = 0.05;

const snapTime = (seconds) => Math.round(Math.max(0, seconds) / SNAP_SECONDS) * SNAP_SECONDS;

export default function Timeline() {
  const {
    project, currentTime, setCurrentTime, selectedSceneIds, selectScene, reorderScenes, updateScene, trimScene, setMusicTimeline, updateTimelineLayer, removeTimelineLayer,
  } = useEditorStore();
  const scenes = useMemo(() => project?.scenes || [], [project?.scenes]);
  const layers = useMemo(() => project?.timeline_layers || [], [project?.timeline_layers]);
  const total = useMemo(() => scenes.reduce((acc, s) => acc + (s.duration || 0), 0), [scenes]);
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC_DEFAULT);
  const [dragOver, setDragOver] = useState(null);
  const [selectedWidget, setSelectedWidget] = useState(null);
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
    setCurrentTime(snapTime(Math.min(total, x / pxPerSec)));
    setSelectedWidget(null);
  };

  useEffect(() => {
    if (!stripRef.current) return;
    const playheadX = currentTime * pxPerSec;
    const el = stripRef.current;
    if (playheadX < el.scrollLeft + 100) el.scrollLeft = Math.max(0, playheadX - 100);
    if (playheadX > el.scrollLeft + el.clientWidth - 100) el.scrollLeft = playheadX - el.clientWidth + 200;
  }, [currentTime, pxPerSec]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      if (!selectedWidget || selectedWidget.type !== 'caption') return;
      e.preventDefault();
      const { sceneId, captionId, wordIdx } = selectedWidget;
      useEditorStore.getState().detachCaptionWord(sceneId, captionId, wordIdx);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedWidget]);

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
              <CaptionTrack
                  key={sc.id}
                  scene={sc}
                  left={offsets[i] * pxPerSec}
                  pxPerSec={pxPerSec}
                  selectedWidget={selectedWidget}
                  onSelectWidget={setSelectedWidget}
                  updateCaption={(capId, patch) => useEditorStore.getState().updateCaption(sc.id, capId, patch)}
                />
              ))}
            </Track>

            <Track height={64}>
              {scenes.map((sc, i) => (
                <AudioBar
                  key={sc.id}
                  left={(offsets[i] + (sc.audio_offset || 0)) * pxPerSec}
                  width={Math.max(20, (sc.duration || 0) * pxPerSec)}
                  label="VO"
                  color="#34D399"
                  draggable
                  collapseKey={`voiceover:${sc.id}`}
                  selected={selectedWidget?.type === 'audio' && selectedWidget.id === sc.id}
                  onSelect={() => setSelectedWidget({ type: 'audio', id: sc.id })}
                  onMove={(dx) => updateScene(sc.id, { audio_offset: snapTime((sc.audio_offset || 0) + dx / pxPerSec) })}
                  onResizeLeft={(dx) => {
                    const delta = dx / pxPerSec;
                    updateScene(sc.id, {
                      audio_trim_start: snapTime((sc.audio_trim_start || 0) + delta),
                    });
                  }}
                  onResizeRight={(dx) => {
                    const delta = dx / pxPerSec;
                    updateScene(sc.id, {
                      audio_trim_end: snapTime((sc.audio_trim_end || 0) - delta),
                    });
                  }}
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
                  collapseKey="music:primary"
                  selected={selectedWidget?.type === 'music'}
                  onSelect={() => setSelectedWidget({ type: 'music' })}
                  onMove={(dx) => setMusicTimeline({ start: snapTime((project.music_timeline?.start || 0) + dx / pxPerSec) })}
                  onResizeLeft={(dx) => {
                    const delta = dx / pxPerSec;
                    setMusicTimeline({
                      start: snapTime((project.music_timeline?.start || 0) + delta),
                      duration: Math.max(0.25, snapTime((project.music_timeline?.duration || total) - delta)),
                    });
                  }}
                  onResizeRight={(dx) => {
                    const delta = dx / pxPerSec;
                    setMusicTimeline({
                      duration: Math.max(0.25, snapTime((project.music_timeline?.duration || total) + delta)),
                    });
                  }}
                />
              )}
            </Track>

            {layers.length > 0 && (
              <div className="border-t border-white/8">
                <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-ink-secondary">Layers</div>
                {layers.map((layer, index) => (
                  <Track key={layer.id} height={56}>
                    <LayerBar
                      layer={layer}
                      left={(layer.start || 0) * pxPerSec}
                      width={Math.max(20, (layer.duration || 3) * pxPerSec)}
                      color={layer.type === 'audio' ? '#60A5FA' : layer.type === 'video' ? '#34D399' : '#F59E0B'}
                      selected={selectedWidget?.type === 'layer' && selectedWidget.id === layer.id}
                      onSelect={() => setSelectedWidget({ type: 'layer', id: layer.id })}
                      onMove={(dx) => updateTimelineLayer(layer.id, { start: snapTime((layer.start || 0) + dx / pxPerSec) })}
                      onResize={(side, dx) => {
                        const delta = dx / pxPerSec;
                        if (side === 'left') {
                          const nextStart = snapTime((layer.start || 0) + delta);
                          const nextDuration = Math.max(0.25, snapTime((layer.duration || 3) - delta));
                          updateTimelineLayer(layer.id, { start: nextStart, duration: nextDuration });
                        } else {
                          updateTimelineLayer(layer.id, { duration: Math.max(0.25, snapTime((layer.duration || 3) + delta)) });
                        }
                      }}
                      onDelete={() => removeTimelineLayer(layer.id)}
                      label={`${layer.type.toUpperCase()} ${index + 1}`}
                    />
                  </Track>
                ))}
              </div>
            )}

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

function CaptionTrack({ scene, left, pxPerSec, updateCaption, selectedWidget, onSelectWidget }) {
  const caps = scene.captions || [];
  return (
    <div className="absolute top-0 bottom-0" style={{ left }}>
      {caps.map((c) => (
        <CaptionChip
          key={c.id}
          caption={c}
          sceneId={scene.id}
          pxPerSec={pxPerSec}
          onChange={updateCaption}
          selected={selectedWidget?.type === 'caption' && selectedWidget.captionId === c.id}
          onSelect={(wordIdx) => onSelectWidget({ type: 'caption', sceneId: scene.id, captionId: c.id, wordIdx })}
        />
      ))}
    </div>
  );
}

function CaptionChip({ caption, sceneId, pxPerSec, onChange, selected, onSelect }) {
  const dragRef = React.useRef(null);
  const modeRef = React.useRef('move');
  const hoverRef = React.useRef({ x: 0, idx: 0 });

  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    modeRef.current = mode;
    dragRef.current = {
      x: e.clientX,
      start: caption.start || 0,
      end: caption.end || 0,
    };
    const mm = (ev) => {
      const base = dragRef.current;
      if (!base) return;
      const delta = (ev.clientX - base.x) / pxPerSec;
      if (modeRef.current === 'move') {
        const duration = Math.max(0.05, base.end - base.start);
        const nextStart = snapTime(base.start + delta);
        onChange(caption.id, { start: nextStart, end: nextStart + duration });
      } else if (modeRef.current === 'left') {
        const nextStart = snapTime(Math.min(base.end - SNAP_SECONDS, base.start + delta));
        onChange(caption.id, { start: nextStart });
      } else if (modeRef.current === 'right') {
        const nextEnd = Math.max(base.start + SNAP_SECONDS, snapTime(base.end + delta));
        onChange(caption.id, { end: nextEnd });
      }
    };
    const mu = () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      dragRef.current = null;
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  };

  const updateHover = (e) => {
    const words = caption.words || [];
    if (words.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = caption.start + relX / pxPerSec;
    let bestIdx = 0;
    let bestDist = Infinity;
    words.forEach((word, idx) => {
      const mid = ((word.start ?? caption.start) + (word.end ?? caption.end)) / 2;
      const dist = Math.abs(mid - targetTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    hoverRef.current = { x: relX, idx: bestIdx };
  };

  return (
    <div
      className={`absolute top-2 h-12 rounded text-[10px] font-bold overflow-hidden group cursor-pointer ${
        selected ? 'bg-accent/30 border-2 border-accent text-white' : 'bg-accent/15 border border-accent/40 text-accent'
      }`}
      style={{ left: caption.start * pxPerSec, width: Math.max(20, (caption.end - caption.start) * pxPerSec) }}
      title={caption.text}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect?.(hoverRef.current.idx || 0);
      }}
      onMouseDown={(e) => startDrag(e, 'move')}
      onMouseMove={updateHover}
    >
      <div
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-accent/30 opacity-0 group-hover:opacity-100"
        onMouseDown={(e) => startDrag(e, 'left')}
      />
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-accent/30 opacity-0 group-hover:opacity-100"
        onMouseDown={(e) => startDrag(e, 'right')}
      />
      <div className="h-full flex items-center px-1.5 pointer-events-none">
        <span className="truncate">{caption.text}</span>
      </div>
    </div>
  );
}

function AudioBar({ left, width, label, color, draggable, collapseKey, onMove, onResizeLeft, onResizeRight, selected, onSelect }) {
  const sx = React.useRef(null);
  const storageKey = collapseKey ? `voltcut.audioCollapsed.${collapseKey}` : null;
  const [collapsed, setCollapsed] = React.useState(() => {
    if (!storageKey) return false;
    return window.localStorage.getItem(storageKey) === '1';
  });
  React.useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, collapsed ? '1' : '0');
  }, [collapsed, storageKey]);
  return (
    <div
      className={`absolute top-2 bottom-2 rounded-md border overflow-hidden flex items-center px-2 text-[10px] font-mono text-white ${draggable ? 'cursor-move' : 'pointer-events-none'} ${selected ? 'ring-2 ring-white' : ''}`}
      style={{ left, width, background: `${color}22`, borderColor: `${color}66` }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect?.();
      }}
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
      {!collapsed && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20"
            onMouseDown={(e) => {
              e.stopPropagation();
              sx.current = e.clientX;
              const mm = (ev) => {
                const dx = ev.clientX - sx.current;
                sx.current = ev.clientX;
                onResizeLeft?.(dx);
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
                onResizeRight?.(dx);
              };
              const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
              window.addEventListener('mousemove', mm);
              window.addEventListener('mouseup', mu);
            }}
          />
          <svg className="absolute inset-y-0 left-0 right-0 w-full h-full opacity-50">
            <path
              d={`M 0 24 ${Array.from({ length: 40 }).map((_, i) => `L ${(width / 40) * i} ${12 + Math.sin(i * 0.7) * 8 + (i % 3) * 2}`).join(' ')}`}
              stroke={color}
              fill="none"
              strokeWidth="1.5"
            />
          </svg>
          <span className="relative">{label}</span>
        </>
      )}
      {collapsed && <span className="relative">{label}</span>}
      <button
        type="button"
        className="absolute top-1 right-4 z-10 text-[9px] px-1 py-0.5 rounded bg-black/20 hover:bg-black/40"
        onClick={(e) => {
          e.stopPropagation();
          setCollapsed((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {collapsed ? '+' : '−'}
      </button>
      <div className="absolute left-0 right-0 bottom-0 h-3 cursor-move" title="Drag to reposition">
        <div
          className="absolute inset-0 bg-transparent"
          onMouseDown={(e) => {
            e.stopPropagation();
            sx.current = e.clientX;
            const mm = (ev) => {
              const dx = ev.clientX - sx.current;
              sx.current = ev.clientX;
              onMove?.(dx);
            };
            const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
            window.addEventListener('mousemove', mm);
            window.addEventListener('mouseup', mu);
          }}
        />
      </div>
    </div>
  );
}

function LayerBar({ layer, left, width, label, color, onMove, onResize, onDelete, selected, onSelect }) {
  const sx = React.useRef(null);
  return (
    <div
      className={`absolute top-2 bottom-2 rounded-md border overflow-hidden flex items-center px-2 text-[10px] font-mono text-white cursor-move ${selected ? 'ring-2 ring-white' : ''}`}
      style={{ left, width, background: `${color}22`, borderColor: `${color}66` }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect?.();
      }}
      onMouseDown={(e) => {
        sx.current = e.clientX;
        const mm = (ev) => {
          const dx = ev.clientX - sx.current;
          sx.current = ev.clientX;
          onMove?.(dx);
        };
        const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
      }}
    >
      <button
        type="button"
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          sx.current = e.clientX;
          const mm = (ev) => {
            const dx = ev.clientX - sx.current;
            sx.current = ev.clientX;
            onResize?.('left', dx);
          };
          const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
          window.addEventListener('mousemove', mm);
          window.addEventListener('mouseup', mu);
        }}
      />
      <button
        type="button"
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20"
        onMouseDown={(e) => {
          e.stopPropagation();
          sx.current = e.clientX;
          const mm = (ev) => {
            const dx = ev.clientX - sx.current;
            sx.current = ev.clientX;
            onResize?.('right', dx);
          };
          const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
          window.addEventListener('mousemove', mm);
          window.addEventListener('mouseup', mu);
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
        className="absolute right-3 top-1 text-[9px] text-white/80 hover:text-white"
      >
        ×
      </button>
      <span className="relative">{label}</span>
    </div>
  );
}
