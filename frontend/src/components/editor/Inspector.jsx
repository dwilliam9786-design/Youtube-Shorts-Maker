import React from 'react';
import { useEditorStore } from '../../lib/store';
import { Wand2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

const ANIMATIONS = ['ken_burns_in', 'ken_burns_out', 'punch_in', 'slow_pan'];
const TRANSITIONS = ['fade', 'flash', 'zoom', 'swipe'];

export default function Inspector() {
  const { project, selectedSceneId, updateScene, reorderScenes, patchProject } = useEditorStore();
  const scene = project?.scenes?.find((s) => s.id === selectedSceneId);
  const idx = project?.scenes?.findIndex((s) => s.id === selectedSceneId) ?? -1;

  if (!scene) {
    return (
      <div className="h-full p-6 text-sm text-ink-secondary">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-3">Inspector</div>
        Select a clip to edit
      </div>
    );
  }

  const swap = (delta) => {
    const to = idx + delta;
    if (to < 0 || to >= project.scenes.length) return;
    reorderScenes(idx, to);
  };

  const removeScene = () => {
    if (!window.confirm('Remove this scene?')) return;
    const next = project.scenes.filter((s) => s.id !== scene.id);
    patchProject({
      scenes: next,
      total_duration: next.reduce((a, s) => a + (s.duration || 0), 0),
    });
    toast.success('Scene removed');
  };

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-secondary">Scene {idx + 1}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => swap(-1)} className="p-1.5 hover:bg-white/5 rounded" data-testid="scene-move-up">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => swap(1)} className="p-1.5 hover:bg-white/5 rounded" data-testid="scene-move-down">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={removeScene} className="p-1.5 hover:bg-accent-danger/30 rounded" data-testid="scene-delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Image preview */}
      {scene.image_url && (
        <img src={scene.image_url} alt="" className="w-full aspect-[9/16] object-cover rounded-md border border-white/10 mb-4" />
      )}

      <Field label="Script">
        <textarea
          value={scene.script || ''}
          onChange={(e) => updateScene(scene.id, { script: e.target.value })}
          rows={4}
          data-testid="inspector-script-input"
          className="w-full bg-bg-base border border-white/10 focus:border-accent/60 rounded-md p-2 text-sm leading-snug"
        />
      </Field>

      <Field label="Duration (s)">
        <input
          type="number"
          step="0.1"
          min="0.5"
          value={scene.duration?.toFixed?.(2) || 0}
          onChange={(e) => updateScene(scene.id, { duration: parseFloat(e.target.value) || 0 })}
          className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-1.5 text-sm font-mono"
          data-testid="inspector-duration-input"
        />
      </Field>

      <Field label="Animation">
        <select
          value={scene.animation || 'ken_burns_in'}
          onChange={(e) => updateScene(scene.id, { animation: e.target.value })}
          data-testid="inspector-animation-select"
          className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-1.5 text-sm"
        >
          {ANIMATIONS.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </Field>

      <Field label="Transition In">
        <select
          value={scene.transition_in || 'fade'}
          onChange={(e) => updateScene(scene.id, { transition_in: e.target.value })}
          data-testid="inspector-transition-select"
          className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-1.5 text-sm"
        >
          {TRANSITIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>

      <Field label="Keywords">
        <div className="flex flex-wrap gap-1.5">
          {(scene.keywords || []).map((k, i) => (
            <span key={i} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[11px]">{k}</span>
          ))}
        </div>
      </Field>

      <Field label="Captions">
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {(scene.captions || []).map((c) => (
            <div key={c.id} className="text-[11px] font-mono text-ink-secondary border-l-2 border-accent/40 pl-2">
              <span className="text-accent mr-2">{c.start.toFixed(2)}s</span>
              {c.text}
            </div>
          ))}
        </div>
      </Field>
    </div>
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
