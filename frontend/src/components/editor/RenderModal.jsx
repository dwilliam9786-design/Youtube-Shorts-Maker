import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Download, X, CheckCircle2, Film, Settings2 } from 'lucide-react';
import { apiClient, resolveMedia } from '../../lib/api';

const FALLBACK_FORMATS = [
  { id: 'mp4', label: 'MP4 (H.264 + AAC)' },
  { id: 'webm', label: 'WebM (VP9 + Opus)' },
  { id: 'mov', label: 'MOV (H.264 + AAC)' },
  { id: 'gif', label: 'GIF (no audio)' },
];
const FALLBACK_FPS = [20, 24, 30, 48, 60, 90];

export default function RenderModal({ projectId, onClose }) {
  const [stage, setStage] = useState('config'); // config -> running -> done | failed
  const [fps, setFps] = useState(30);
  const [fmt, setFmt] = useState('mp4');
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [formats, setFormats] = useState(FALLBACK_FORMATS);
  const [fpsOptions, setFpsOptions] = useState(FALLBACK_FPS);
  const [renderTools, setRenderTools] = useState({ available: true, binaries: {} });

  useEffect(() => {
    apiClient.meta().then((m) => {
      if (m.formats) setFormats(m.formats);
      if (m.fps_options) setFpsOptions(m.fps_options);
      if (m.render_tools) setRenderTools(m.render_tools);
    }).catch(() => {});
  }, []);

  const startRender = async () => {
    setStage('running');
    setError(null);
    try {
      const res = await apiClient.startRender({ project_id: projectId, fps, out_format: fmt });
      const jobId = res.job_id;
      const poll = async () => {
        try {
          const j = await apiClient.getRender(jobId);
          setJob(j);
          if (j.status === 'completed') setStage('done');
          else if (j.status === 'failed') setStage('failed');
          else setTimeout(poll, 1200);
        } catch (e) {
          setTimeout(poll, 1500);
        }
      };
      poll();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to start render');
      setStage('failed');
    }
  };

  const finalUrl = job?.final_video_url ? resolveMedia(job.final_video_url) : null;
  const downloadName = `voltcut-${projectId.slice(0, 8)}.${fmt}`;

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
          {stage === 'config' && (
            <>
              <div className="text-xs uppercase tracking-[0.2em] text-ink-secondary mb-4 flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5" /> Export Settings
              </div>

              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1.5">Format</div>
                <select
                  value={fmt}
                  onChange={(e) => setFmt(e.target.value)}
                  data-testid="render-format-select"
                  className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-2 text-sm"
                >
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1.5">Frame Rate (FPS)</div>
                <select
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value, 10))}
                  data-testid="render-fps-select"
                  className="w-full bg-bg-base border border-white/10 rounded-md px-2 py-2 text-sm font-mono"
                >
                  {fpsOptions.map((n) => (
                    <option key={n} value={n}>{n} fps {n === 30 ? '· standard' : n === 60 ? '· smooth' : n >= 90 ? '· ultra' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-ink-muted leading-relaxed border-l-2 border-accent/40 pl-3 mb-6">
                Higher fps and 4K-equivalent renders take longer. MP4 is the best universal pick.
                GIF exports with no audio. Captions and effects are burned into the file.
              </div>

              <button
                onClick={startRender}
                disabled={!renderTools.available}
                data-testid="render-start-btn"
                className="w-full bg-accent text-black font-bold px-6 py-3 rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start render
              </button>
              {!renderTools.available && (
                <div className="mt-3 text-[11px] text-accent-danger font-mono">
                  Missing render tools: {Object.entries(renderTools.binaries || {}).filter(([, path]) => !path).map(([name]) => name).join(', ')}
                </div>
              )}
            </>
          )}

          {stage === 'running' && (
            !job ? (
              <Loading label="Queuing job…" />
            ) : (
              <RenderProgress job={job} fps={fps} fmt={fmt} />
            )
          )}

          {stage === 'failed' && (
            <div>
              <div className="text-accent-danger text-sm font-medium mb-2">Render failed</div>
              <div className="text-xs text-ink-secondary font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                {error || job?.error}
              </div>
              <button
                onClick={() => setStage('config')}
                className="mt-4 text-xs border border-white/10 px-3 py-2 rounded hover:bg-white/5"
                data-testid="render-retry-btn"
              >
                Try again
              </button>
            </div>
          )}

          {stage === 'done' && finalUrl && (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div className="font-display text-2xl font-bold mt-4">Ready to share</div>
              <div className="text-xs text-ink-secondary mt-1 font-mono">
                {fps}fps · {fmt.toUpperCase()} · {job?.message}
              </div>
              <video
                src={finalUrl}
                controls
                className="mt-6 w-full max-h-72 rounded-md border border-white/10 bg-black"
              />
              <a
                href={finalUrl}
                download={downloadName}
                data-testid="render-download-btn"
                className="mt-5 inline-flex items-center gap-2 bg-accent text-black font-bold px-6 py-3 rounded-md hover:bg-accent-hover"
              >
                <Download className="w-4 h-4" /> Download {fmt.toUpperCase()}
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function RenderProgress({ job, fps, fmt }) {
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
        $ ffmpeg -r {fps} -c:v {fmt === 'webm' ? 'libvpx-vp9' : 'libx264'} → segments → captions → concat → mix → {fmt}
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
