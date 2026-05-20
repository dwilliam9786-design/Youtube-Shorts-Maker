import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../lib/store';
import { Trash2, ArrowUp, ArrowDown, Sparkles, Layers, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

const FALLBACK_META = {
  animations: [
    { id: 'ken_burns_in', label: 'Ken Burns In' },
    { id: 'ken_burns_out', label: 'Ken Burns Out' },
    { id: 'punch_in', label: 'Punch In' },
    { id: 'slow_pan', label: 'Slow Pan' },
    { id: 'none', label: 'None' },
  ],
  transitions: [
    { id: 'fade', label: 'Fade' },
    { id: 'flash', label: 'Flash' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'swipe', label: 'Swipe' },
  ],
  effects: [
    { id: 'shake', label: 'Shake' },
    { id: 'rgb_split', label: 'RGB Split' },
    { id: 'glitch', label: 'Glitch' },
    { id: 'blur_reveal', label: 'Blur Reveal' },
    { id: 'vignette', label: 'Vignette' },
    { id: 'film_burn', label: 'Film Burn' },
    { id: 'flash', label: 'Flash' },
    { id: 'speed_ramp', label: 'Speed Ramp' },
  ],
  speakers: [
    { id: 'primary', label: 'Primary', color: '#FFD60A' },
    { id: 'speaker2', label: 'Speaker 2', color: '#00E0B4' },
    { id: 'speaker3', label: 'Speaker 3', color: '#FF7043' },
    { id: 'speaker4', label: 'Speaker 4', color: '#9BFF00' },
  ],
};

export default function Inspector() {
  const {
    project, selectedSceneIds, updateScene, updateSelectedScenes,
    toggleSelectedEffect, reorderScenes, removeScenes,
  } = useEditorStore();
  const [meta, setMeta] = useState(FALLBACK_META);
  const [tab, setTab] = useState('scene');

  useEffect(() => {
    apiClient.meta().then((m) => setMeta({ ...FALLBACK_META, ...m })).catch(() => {});
  }, []);

  const selected = (project?.scenes || []).filter((s) => selectedSceneIds.includes(s.id));
  const scene = selected[0];

  if (!scene) {
    return (
      <div className="h-full p-6 text-sm text-ink-secondary">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-3">Inspector</div>
        Select a clip to edit
      </div>
    );
  }

  const isMulti = selected.length > 1;
  const idx = project.scenes.findIndex((s) => s.id === scene.id);
  const swap = (delta) => {
    const to = idx + delta;
    if (to < 0 || to >= project.scenes.length) return;
    reorderScenes(idx, to);
  };
  const onDelete = () => {
    if (!window.confirm(`Remove ${selected.length} scene(s)?`)) return;
    removeScenes(selected.map((s) => s.id));
    toast.success('Removed');
  };

  return (
    <div className="h-full overflow-y-auto text-sm">
      {/* Tabs */}
      <div className="flex border-b border-white/8 sticky top-0 bg-bg-panel z-10">
        <TabBtn active={tab === 'scene'} onClick={() => setTab('scene')} icon={Sparkles} label="Scene" testid="inspector-tab-scene" />
        <TabBtn active={tab === 'effects'} onClick={() => setTab('effects')} icon={Layers} label="Effects" testid="inspector-tab-effects" />
        <TabBtn active={tab === 'captions'} onClick={() => setTab('captions')} icon={Volume2} label="Captions" testid="inspector-tab-captions" />
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase tracking-[0.2em] text-ink-secondary">
            {isMulti ? `${selected.length} scenes selected` : `Scene ${idx + 1}`}
          </div>
          <div className="flex items-center gap-1">
            {!isMulti && (
              <>
                <button onClick={() => swap(-1)} className="p-1.5 hover:bg-white/5 rounded" data-testid="scene-move-up">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => swap(1)} className="p-1.5 hover:bg-white/5 rounded" data-testid="scene-move-down">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button onClick={onDelete} className="p-1.5 hover:bg-accent-danger/30 rounded" data-testid="scene-delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {tab === 'scene' && (
          <SceneTab
            scene={scene}
            isMulti={isMulti}
            meta={meta}
            updateScene={updateScene}
            updateSelectedScenes={updateSelectedScenes}
          />
        )}
        {tab === 'effects' && (
          <EffectsTab
            scene={scene}
            isMulti={isMulti}
            meta={meta}
            toggleSelectedEffect={toggleSelectedEffect}
          />
        )}
        {tab === 'captions' && <CaptionsTab scene={scene} meta={meta} updateScene={updateScene} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] uppercase tracking-[0.18em] border-b-2 transition-colors ${
        active ? 'border-accent text-white' : 'border-transparent text-ink-secondary hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function SceneTab({ scene, isMulti, meta, updateScene, updateSelectedScenes }) {
  const onChange = (patch) => (isMulti ? updateSelectedScenes(patch) : updateScene(scene.id, patch));
  return (
    <>
      {!isMulti && scene.image_url && (
        <img src={scene.image_url} alt="" className="w-full aspect-[9/16] object-cover rounded-md border border-white/10 mb-4" />
      )}

      {!isMulti && (
        <Field label="Script">
          <textarea
            value={scene.script || ''}
            onChange={(e) => updateScene(scene.id, { script: e.target.value })}
            rows={4}
            data-testid="inspector-script-input"
            className="w-full bg-bg-base border border-white/10 focus:border-accent/60 rounded-md p-2 text-sm leading-snug"
          />
        </Field>
      )}

      <Field label="Duration (s)">
        <input
          type="number"
          step="0.1"
          min="0.5"
          value={(scene.duration || 0).toFixed(2)}
          onChange={(e) => onChange({ duration: parseFloat(e.target.value) || 0 })}
          className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-1.5 text-sm font-mono"
          data-testid="inspector-duration-input"
        />
      </Field>

      <Field label="Animation">
        <select
          value={scene.animation || 'ken_burns_in'}
          onChange={(e) => onChange({ animation: e.target.value })}
          data-testid="inspector-animation-select"
          className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-1.5 text-sm"
        >
          {meta.animations.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Transition In">
        <select
          value={scene.transition_in || 'fade'}
          onChange={(e) => onChange({ transition_in: e.target.value })}
          data-testid="inspector-transition-select"
          className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-1.5 text-sm"
        >
          {meta.transitions.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Speaker">
        <div className="grid grid-cols-2 gap-1.5">
          {meta.speakers.map((sp) => (
            <button
              key={sp.id}
              onClick={() => onChange({ speaker: sp.id })}
              data-testid={`speaker-${sp.id}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${
                scene.speaker === sp.id ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-white/30'
              }`}
            >
              <span className="w-3 h-3 rounded-sm" style={{ background: sp.color }} />
              {sp.label}
            </button>
          ))}
        </div>
      </Field>

      {!isMulti && (
        <Field label="Keywords">
          <div className="flex flex-wrap gap-1.5">
            {(scene.keywords || []).map((k, i) => (
              <span key={i} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[11px]">{k}</span>
            ))}
          </div>
        </Field>
      )}
    </>
  );
}

function EffectsTab({ scene, isMulti, meta, toggleSelectedEffect }) {
  const isActive = (id) => (scene.effects || []).includes(id);
  return (
    <>
      <div className="text-[11px] text-ink-secondary leading-relaxed mb-4">
        Toggle effects to apply to {isMulti ? 'all selected scenes' : 'this scene'}. Effects are rendered into the final export.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {meta.effects.map((fx) => (
          <button
            key={fx.id}
            onClick={() => toggleSelectedEffect(fx.id)}
            data-testid={`effect-${fx.id}`}
            className={`p-3 rounded-md border text-left text-xs font-medium transition-colors ${
              isActive(fx.id) ? 'border-accent bg-accent/10 text-white' : 'border-white/10 text-ink-secondary hover:border-white/30'
            }`}
          >
            {fx.label}
            {isActive(fx.id) && <span className="block text-[9px] text-accent mt-0.5 font-mono">ACTIVE</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function CaptionsTab({ scene }) {
  const caps = scene.captions || [];
  return (
    <>
      <div className="text-[11px] text-ink-secondary mb-2">{caps.length} caption groups · {caps.reduce((a, c) => a + (c.words?.length || 0), 0)} words</div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {caps.map((c) => (
          <div key={c.id} className="text-xs border-l-2 border-accent/40 pl-2">
            <div className="font-mono text-accent text-[10px]">{c.start.toFixed(2)}s — {c.end.toFixed(2)}s</div>
            <div className="text-white">{c.text}</div>
            <div className="text-[10px] text-ink-muted mt-0.5">{(c.words || []).length} words</div>
          </div>
        ))}
        {caps.length === 0 && <div className="text-xs text-ink-muted">No captions yet.</div>}
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}
