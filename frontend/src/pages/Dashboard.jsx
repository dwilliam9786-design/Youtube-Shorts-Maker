import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { apiClient, resolveMedia } from '../lib/api';
import { Plus, Wand2, Film, Trash2, Clock, ChevronRight } from 'lucide-react';

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
};

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const list = await apiClient.listProjects();
      setProjects(list);
    } catch (e) {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this project?')) return;
    await apiClient.deleteProject(id);
    toast.success('Project deleted');
    load();
  };

  const onBlank = async () => {
    const proj = await apiClient.createBlank({ title: 'Untitled Video', aspect: '9:16' });
    nav(`/editor/${proj.id}`);
  };

  return (
    <div className="min-h-screen bg-bg-base text-white">
      <header className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="dashboard-logo">
            <div className="w-8 h-8 rounded-md bg-accent text-black grid place-items-center font-display font-black">V</div>
            <span className="font-display text-lg font-bold tracking-tight">VOLTCUT</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={onBlank}
              data-testid="new-blank-btn"
              className="text-sm border border-white/10 px-4 py-2 rounded-md hover:bg-white/5 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Blank project
            </button>
            <Link
              to="/studio"
              data-testid="ai-studio-btn"
              className="text-sm bg-accent text-black font-medium px-4 py-2 rounded-md hover:bg-accent-hover inline-flex items-center gap-2"
            >
              <Wand2 className="w-4 h-4" /> AI Studio
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-secondary mb-2">Workspace</div>
            <h1 className="font-display text-4xl font-black tracking-tight">Your Projects</h1>
          </div>
          <div className="text-sm text-ink-secondary">
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-md bg-bg-panel animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onBlank={onBlank} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {projects.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Link
                  to={`/editor/${p.id}`}
                  data-testid={`project-card-${p.id}`}
                  className="group block relative aspect-[9/16] rounded-md border border-white/8 bg-bg-panel overflow-hidden hover:border-accent/50 transition-colors"
                >
                  {p.thumbnail_url ? (
                    <img
                      src={resolveMedia(p.thumbnail_url)}
                      alt={p.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-ink-muted">
                      <Film className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/70 to-transparent">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusPill status={p.status} />
                      <span className="text-[10px] font-mono text-ink-secondary">{p.aspect}</span>
                    </div>
                    <div className="font-display text-base font-bold truncate">{p.title}</div>
                    <div className="text-xs text-ink-secondary flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" /> {fmtTime(p.updated_at)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => onDelete(p.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-danger"
                    data-testid={`delete-project-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onBlank }) {
  return (
    <div className="border border-dashed border-white/10 rounded-md p-16 text-center">
      <Film className="w-12 h-12 text-ink-muted mx-auto" />
      <h3 className="mt-6 font-display text-2xl font-bold">No projects yet</h3>
      <p className="mt-2 text-sm text-ink-secondary">Start with AI or open a blank timeline.</p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          to="/studio"
          className="bg-accent text-black font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 hover:bg-accent-hover"
        >
          <Wand2 className="w-4 h-4" /> Generate with AI <ChevronRight className="w-4 h-4" />
        </Link>
        <button
          onClick={onBlank}
          className="border border-white/10 px-4 py-2 rounded-md inline-flex items-center gap-2 hover:bg-white/5"
        >
          <Plus className="w-4 h-4" /> Blank project
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    draft: 'text-ink-secondary border-white/10',
    generating: 'text-accent border-accent/40 animate-pulse',
    ready: 'text-emerald-400 border-emerald-400/30',
    rendering: 'text-accent border-accent/40 animate-pulse',
    rendered: 'text-emerald-400 border-emerald-400/30',
    failed: 'text-accent-danger border-red-500/30',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}
