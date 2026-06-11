import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Play, Pause, SkipBack, SkipForward, ArrowLeft, Save, Download, Sparkles, Library, Wand2, Loader2,
} from 'lucide-react';
import { apiClient } from '../lib/api';
import { useEditorStore } from '../lib/store';
import PreviewCanvas from '../components/editor/PreviewCanvas';
import Timeline from '../components/editor/Timeline';
import Inspector from '../components/editor/Inspector';
import AssetLibrary from '../components/editor/AssetLibrary';
import RenderModal from '../components/editor/RenderModal';

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { project, setProject, isPlaying, setPlaying, currentTime, setCurrentTime } = useEditorStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRender, setShowRender] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const p = await apiClient.getProject(id);
        if (!cancelled) {
          setProject(p);
          setCurrentTime(0);
        }
      } catch (e) {
        toast.error('Project not found');
        nav('/app');
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, nav, setCurrentTime, setProject]);

  const onSave = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    try {
      const payload = {
        title: project.title,
        scenes: project.scenes,
        music_url: project.music_url,
        music_tracks: project.music_tracks,
        timeline_layers: project.timeline_layers,
        music_timeline: project.music_timeline,
        caption_style: project.caption_style,
        total_duration: (project.scenes || []).reduce((a, s) => a + (s.duration || 0), 0),
      };
      await apiClient.updateProject(project.id, payload);
      toast.success('Saved');
    } catch (e) {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }, [project]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(!isPlaying);
      }
      if (e.code === 'KeyS' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSave();
      }
      if (e.code === 'ArrowRight') setCurrentTime(currentTime + 0.5);
      if (e.code === 'ArrowLeft') setCurrentTime(Math.max(0, currentTime - 0.5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, setPlaying, onSave, currentTime, setCurrentTime]);

  if (loading || !project) {
    return (
      <div className="h-screen grid place-items-center bg-bg-base">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const total = (project.scenes || []).reduce((a, s) => a + (s.duration || 0), 0);

  return (
    <div className="h-screen overflow-hidden bg-bg-base text-white flex flex-col">
      {/* TOP NAV */}
      <header className="h-12 border-b border-white/8 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/app" className="p-1.5 hover:bg-white/5 rounded" data-testid="editor-back-btn">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <input
            value={project.title}
            onChange={(e) => useEditorStore.setState({ project: { ...project, title: e.target.value } })}
            className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-accent outline-none px-1 text-sm font-medium w-64"
            data-testid="editor-title-input"
          />
          <span className="text-[10px] font-mono text-ink-muted px-2 py-0.5 border border-white/10 rounded">
            {project.aspect} · {fmt(total)}
          </span>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentTime(0)}
            className="p-2 hover:bg-white/5 rounded"
            data-testid="transport-restart"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPlaying(!isPlaying)}
            className="bg-accent text-black px-4 py-1.5 rounded-md inline-flex items-center gap-2 font-medium hover:bg-accent-hover"
            data-testid="transport-play-btn"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => setCurrentTime(total)}
            className="p-2 hover:bg-white/5 rounded"
            data-testid="transport-end"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-ink-secondary ml-3">{fmtTC(currentTime)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            data-testid="editor-save-btn"
            className="text-xs border border-white/10 px-3 py-1.5 rounded-md hover:bg-white/5 inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
          <ViralModeButton />
          <button
            onClick={() => setShowRender(true)}
            data-testid="editor-export-btn"
            className="text-sm bg-accent text-black font-bold px-4 py-1.5 rounded-md hover:bg-accent-hover inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </header>

      {/* MAIN: 3 col + bottom timeline */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 shrink-0 border-r border-white/8 bg-bg-panel">
          <div className="px-4 h-9 border-b border-white/8 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-ink-secondary">
            <Library className="w-3.5 h-3.5" /> Library
          </div>
          <div className="h-[calc(100%-2.25rem)]">
            <AssetLibrary />
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <PreviewCanvas />
          </div>
          <div className="h-[40%] min-h-[280px]">
            <Timeline />
          </div>
        </main>

        <aside className="w-80 shrink-0 border-l border-white/8 bg-bg-panel">
          <div className="px-4 h-9 border-b border-white/8 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-ink-secondary">
            <Sparkles className="w-3.5 h-3.5" /> Inspector
          </div>
          <div className="h-[calc(100%-2.25rem)]">
            <Inspector />
          </div>
        </aside>
      </div>

      {showRender && <RenderModal projectId={project.id} onClose={() => setShowRender(false)} />}
    </div>
  );
}

function ViralModeButton() {
  const { project, updateScene } = useEditorStore();
  const apply = () => {
    if (!project) return;
    const presets = ['punch_in', 'ken_burns_in', 'ken_burns_out', 'slow_pan'];
    project.scenes.forEach((s, i) => {
      updateScene(s.id, {
        animation: presets[i % presets.length],
        transition_in: i % 2 === 0 ? 'flash' : 'zoom',
      });
    });
    toast.success('Viral mode applied');
  };
  return (
    <button
      onClick={apply}
      data-testid="viral-mode-btn"
      className="text-xs px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10 inline-flex items-center gap-1.5 animate-pulse-glow"
    >
      <Wand2 className="w-3.5 h-3.5" /> Viral Mode
    </button>
  );
}

function fmt(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${s}s`;
}
function fmtTC(t) {
  const tt = Math.max(0, t || 0);
  const m = Math.floor(tt / 60);
  const s = Math.floor(tt % 60);
  const cs = Math.floor((tt - Math.floor(tt)) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}
