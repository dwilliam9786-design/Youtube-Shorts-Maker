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
  caption_presets: [
    { id: 'viral_pop', label: 'Viral Pop', desc: 'Yellow active word + phrase' },
    { id: 'hormozi',   label: 'Hormozi',   desc: 'Big middle, dark backdrop' },
    { id: 'mrbeast',   label: 'MrBeast',   desc: 'Massive red+white, accent box' },
    { id: 'minimal',   label: 'Minimal',   desc: 'Clean white, single line' },
    { id: 'subtitle',  label: 'Subtitle',  desc: 'Bottom subtitle bar' },
  ],
  caption_fonts: [
    { id: 'bold_sans', label: 'Bold Sans' },
    { id: 'display',   label: 'Display' },
    { id: 'narrow',    label: 'Narrow' },
    { id: 'mono',      label: 'Mono' },
    { id: 'serif',     label: 'Serif' },
  ],
  caption_positions: [
    { id: 'top', label: 'Top' },
    { id: 'middle', label: 'Middle' },
    { id: 'bottom', label: 'Bottom' },
  ],
  caption_backgrounds: [
    { id: 'none', label: 'None' },
    { id: 'accent_box', label: 'Accent Box' },
    { id: 'dark_box', label: 'Dark Box' },
  ],
  caption_animations: [
    { id: 'pop', label: 'Pop' }, { id: 'fade', label: 'Fade' },
    { id: 'slide', label: 'Slide' }, { id: 'none', label: 'None' },
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

function CaptionsTab({ scene, meta }) {
  const { project, setCaptionStyle, updateCaption, updateWord, removeCaption } = useEditorStore();
  const style = project?.caption_style || {};
  const caps = scene.captions || [];

  const setPreset = (preset) => {
    // Apply server-known preset values as a one-shot reset
    const presetMap = {
      viral_pop: { font: 'display', active_color: '#FFD60A', phrase_color: '#FFFFFF', size_active: 96, size_phrase: 42, stroke_width: 6, position: 'bottom', background: 'none', show_phrase: true },
      hormozi:   { font: 'display', active_color: '#FFFFFF', phrase_color: '#FFD60A', size_active: 110, size_phrase: 56, stroke_width: 10, position: 'middle', background: 'dark_box', show_phrase: false },
      mrbeast:   { font: 'display', active_color: '#FF3B30', phrase_color: '#FFFFFF', size_active: 120, size_phrase: 48, stroke_width: 12, position: 'middle', background: 'accent_box', show_phrase: false },
      minimal:   { font: 'bold_sans', active_color: '#FFFFFF', phrase_color: '#FFFFFF', size_active: 72, size_phrase: 36, stroke_width: 4, position: 'bottom', background: 'none', show_phrase: false },
      subtitle:  { font: 'bold_sans', active_color: '#FFFFFF', phrase_color: '#FFFFFF', size_active: 54, size_phrase: 0, stroke_width: 3, position: 'bottom', background: 'dark_box', show_phrase: false },
    };
    setCaptionStyle({ preset, ...(presetMap[preset] || {}) });
    toast.success(`Preset: ${preset}`);
  };

  return (
    <div className="space-y-5">
      {/* PRESETS */}
      <div>
        <Label>Caption Preset</Label>
        <div className="grid grid-cols-2 gap-2">
          {(meta.caption_presets || []).map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              data-testid={`caption-preset-${p.id}`}
              className={`p-2.5 rounded-md border text-left text-xs transition-colors ${
                style.preset === p.id ? 'border-accent bg-accent/10 text-white' : 'border-white/10 text-ink-secondary hover:border-white/30'
              }`}
            >
              <div className="font-bold text-white text-[12px]">{p.label}</div>
              <div className="text-[10px] text-ink-muted mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* STYLE CONTROLS */}
      <details className="border border-white/10 rounded-md" open>
        <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-ink-secondary hover:text-white">
          Style
        </summary>
        <div className="p-3 space-y-3">
          <Row label="Font">
            <select
              value={style.font || 'bold_sans'}
              onChange={(e) => setCaptionStyle({ font: e.target.value })}
              data-testid="caption-font-select"
              className="w-full bg-bg-base border border-white/10 rounded px-2 py-1.5 text-xs"
            >
              {(meta.caption_fonts || FALLBACK_META.caption_fonts).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </Row>
          <Row label="Position">
            <div className="grid grid-cols-3 gap-1">
              {(meta.caption_positions || FALLBACK_META.caption_positions).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCaptionStyle({ position: p.id })}
                  data-testid={`caption-pos-${p.id}`}
                  className={`text-[11px] py-1.5 rounded border ${
                    (style.position || 'bottom') === p.id ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Background">
            <select
              value={style.background || 'none'}
              onChange={(e) => setCaptionStyle({ background: e.target.value })}
              data-testid="caption-bg-select"
              className="w-full bg-bg-base border border-white/10 rounded px-2 py-1.5 text-xs"
            >
              {(meta.caption_backgrounds || FALLBACK_META.caption_backgrounds).map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </Row>
          <Row label="Animation">
            <select
              value={style.animation || 'pop'}
              onChange={(e) => setCaptionStyle({ animation: e.target.value })}
              data-testid="caption-anim-select"
              className="w-full bg-bg-base border border-white/10 rounded px-2 py-1.5 text-xs"
            >
              {(meta.caption_animations || FALLBACK_META.caption_animations).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </Row>
          <Row label="Active color">
            <ColorInput
              value={style.active_color || '#FFD60A'}
              onChange={(c) => setCaptionStyle({ active_color: c })}
              testid="caption-active-color"
            />
          </Row>
          <Row label="Phrase color">
            <ColorInput
              value={style.phrase_color || '#FFFFFF'}
              onChange={(c) => setCaptionStyle({ phrase_color: c })}
              testid="caption-phrase-color"
            />
          </Row>
          <Row label={`Active size (${style.size_active || 96}px)`}>
            <input
              type="range" min="40" max="160" step="2"
              value={style.size_active || 96}
              onChange={(e) => setCaptionStyle({ size_active: parseInt(e.target.value, 10) })}
              data-testid="caption-size-active"
              className="w-full accent-[#FFD60A]"
            />
          </Row>
          <Row label={`Stroke (${style.stroke_width || 6})`}>
            <input
              type="range" min="0" max="16" step="1"
              value={style.stroke_width ?? 6}
              onChange={(e) => setCaptionStyle({ stroke_width: parseInt(e.target.value, 10) })}
              data-testid="caption-stroke-width"
              className="w-full accent-[#FFD60A]"
            />
          </Row>
          <Row label={`X Offset (${Math.round(style.offset_x || 0)}px)`}>
            <input
              type="range" min="-400" max="400" step="1"
              value={style.offset_x || 0}
              onChange={(e) => setCaptionStyle({ offset_x: parseInt(e.target.value, 10) })}
              className="w-full accent-[#FFD60A]"
            />
          </Row>
          <Row label={`Y Offset (${Math.round(style.offset_y || 0)}px)`}>
            <input
              type="range" min="-400" max="400" step="1"
              value={style.offset_y || 0}
              onChange={(e) => setCaptionStyle({ offset_y: parseInt(e.target.value, 10) })}
              className="w-full accent-[#FFD60A]"
            />
          </Row>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-secondary">Uppercase</span>
            <Toggle
              checked={style.uppercase !== false}
              onChange={(v) => setCaptionStyle({ uppercase: v })}
              testid="caption-uppercase"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-secondary">Show phrase line</span>
            <Toggle
              checked={style.show_phrase !== false}
              onChange={(v) => setCaptionStyle({ show_phrase: v })}
              testid="caption-show-phrase"
            />
          </div>
        </div>
      </details>

      {/* CAPTION TEXT EDITOR */}
      <div>
        <Label>
          Captions ({caps.length} groups · {caps.reduce((a, c) => a + (c.words?.length || 0), 0)} words)
        </Label>
        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
          {caps.map((c) => (
            <CaptionRow
              key={c.id}
              cap={c}
              sceneId={scene.id}
              onChangeText={(t) => updateCaption(scene.id, c.id, { text: t })}
              onChangeWord={(idx, p) => updateWord(scene.id, c.id, idx, p)}
              onDelete={() => removeCaption(scene.id, c.id)}
            />
          ))}
          {caps.length === 0 && (
            <div className="text-xs text-ink-muted">No captions for this scene.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptionRow({ cap, onChangeText, onChangeWord, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-l-2 border-accent/40 pl-2.5">
      <div className="flex items-start gap-2">
        <div className="font-mono text-[10px] text-accent whitespace-nowrap pt-1.5">
          {cap.start.toFixed(2)}s
        </div>
        <input
          value={cap.text}
          onChange={(e) => onChangeText(e.target.value)}
          data-testid={`caption-text-${cap.id}`}
          className="flex-1 bg-bg-base border border-white/10 focus:border-accent/60 rounded px-2 py-1.5 text-xs"
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="px-1.5 text-[10px] text-ink-secondary hover:text-white"
          data-testid={`caption-toggle-${cap.id}`}
        >
          {open ? '▾' : '▸'}
        </button>
        <button
          onClick={onDelete}
          className="px-1.5 text-[10px] text-ink-muted hover:text-accent-danger"
          data-testid={`caption-delete-${cap.id}`}
          title="Delete caption"
        >
          ✕
        </button>
      </div>
      {open && (cap.words || []).length > 0 && (
        <div className="mt-2 ml-12 space-y-1">
          {(cap.words || []).map((w, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] text-ink-muted w-10">{w.start.toFixed(2)}</span>
              <input
                value={w.word}
                onChange={(e) => onChangeWord(i, { word: e.target.value })}
                data-testid={`caption-word-${cap.id}-${i}`}
                className="flex-1 bg-bg-base border border-white/10 focus:border-accent/60 rounded px-1.5 py-0.5 text-[11px]"
              />
              <input
                type="number" step="0.05" value={w.end.toFixed(2)}
                onChange={(e) => onChangeWord(i, { end: parseFloat(e.target.value) || w.end })}
                className="w-14 bg-bg-base border border-white/10 rounded px-1 py-0.5 text-[10px] font-mono"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2">{children}</div>;
}

function ColorInput({ value, onChange, testid }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-bg-base border border-white/10 rounded px-2 py-1.5 text-xs font-mono"
      />
    </div>
  );
}

function Toggle({ checked, onChange, testid }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      data-testid={testid}
      className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-accent' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
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
