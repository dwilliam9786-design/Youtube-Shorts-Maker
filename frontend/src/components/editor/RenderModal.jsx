import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Download, X, CheckCircle2, Film } from 'lucide-react';
import { apiClient, resolveMedia } from '../../lib/api';

export default function RenderModal({ projectId, onClose }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let timer;
    let cancelled = false;
    const start = async () => {
      try {
        const res = await apiClient.startRender(projectId);
        const jobId = res.job_id;
        const poll = async () => {
          if (cancelled) return;
          const j = await apiClient.getRender(jobId);
          setJob(j);
          if (j.status !== 'completed' && j.status !== 'failed') {
            timer = setTimeout(poll, 1200);
          }
        };
        poll();
      } catch (e) {
        setError(e?.response?.data?.detail || 'Failed to start render');
      }
    };
    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId]);

  const finalUrl = job?.final_video_url ? resolveMedia(job.final_video_url) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur grid place-items-center p-6"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass max-w-lg w-full rounded-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
          <div className="flex items-center gap-2 font-display font-bold">
            <Film className="w-4 h-4 text-accent" /> Render &amp; Export
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded" data-testid="render-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">
          {error ? (
            <div className="text-accent-danger text-sm">{error}</div>
          ) : !job ? (
            <Loading label="Queuing job…" />
          ) : job.status === 'failed' ? (
            <div>
              <div className="text-accent-danger text-sm font-medium mb-2">Render failed</div>
              <div className="text-xs text-ink-secondary font-mono whitespace-pre-wrap">{job.error}</div>
            </div>
          ) : job.status === 'completed' ? (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div className="font-display text-2xl font-bold mt-4">Ready to share</div>
              <div className="text-xs text-ink-secondary mt-1">{job.message}</div>
              {finalUrl && (
                <>
                  <video src={finalUrl} controls className="mt-6 w-full max-h-72 rounded-md border border-white/10 bg-black" />
                  <a
                    href={finalUrl}
                    download
                    data-testid="render-download-btn"
                    className="mt-5 inline-flex items-center gap-2 bg-accent text-black font-bold px-6 py-3 rounded-md hover:bg-accent-hover"
                  >
                    <Download className="w-4 h-4" /> Download MP4
                  </a>
                </>
              )}
            </div>
          ) : (
            <RenderProgress job={job} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function RenderProgress({ job }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-secondary">{job.status}</div>
        <div className="font-mono text-3xl font-bold text-accent">{job.progress}%</div>
      </div>
      <div className="h-2 bg-white/5 rounded overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${job.progress}%` }} />
      </div>
      <div className="mt-4 text-xs text-ink-secondary font-mono">{job.message}</div>
      <div className="mt-6 text-[10px] text-ink-muted font-mono leading-relaxed">
        $ ffmpeg -loop 1 -i scene.jpg -vf "zoompan,drawtext..." → segments → concat → final.mp4
      </div>
    </div>
  );
}

function Loading({ label }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-secondary">
      <Loader2 className="w-4 h-4 animate-spin text-accent" /> {label}
    </div>
  );
}
