import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';
import { ArrowLeft, Sparkles, Wand2, Smartphone, Square, Monitor, Loader2 } from 'lucide-react';

const EXAMPLE = `Most people stay broke because they confuse activity with progress.
They wake up, scroll, react, and call it work.
But the real winners ask a different question: what would actually move the needle today?
Answer that. Build that. Ship that.
Everything else is noise.`;

const aspects = [
  { id: '9:16', label: 'Shorts/Reels/TikTok', icon: Smartphone },
  { id: '1:1', label: 'Instagram Square', icon: Square },
  { id: '16:9', label: 'YouTube Landscape', icon: Monitor },
];

export default function Studio() {
  const [script, setScript] = useState(EXAMPLE);
  const [title, setTitle] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [voice, setVoice] = useState('nova');
  const [theme, setTheme] = useState('viral_pop');
  const [voices, setVoices] = useState([]);
  const [themes, setThemes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    apiClient
      .meta()
      .then((m) => {
        setVoices(m.voices);
        setThemes(m.caption_themes);
      })
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!script.trim()) {
      toast.error('Write a script first');
      return;
    }
    setBusy(true);
    setStep('Splitting scenes with GPT-5.2…');
    try {
      // simulate user-facing step messages while backend runs full pipeline
      const stepTimer = stepFlow((s) => setStep(s));
      const proj = await apiClient.generate({
        script,
        title: title || undefined,
        aspect,
        voice,
        caption_theme: theme,
      });
      clearInterval(stepTimer);
      toast.success('Video generated!');
      nav(`/editor/${proj.id}`);
    } catch (e) {
      console.error(e);
      toast.error('Generation failed. Check backend logs.');
    } finally {
      setBusy(false);
      setStep('');
    }
  };

  return (
    <div className="min-h-screen bg-bg-base text-white">
      <header className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/app" className="flex items-center gap-2 text-sm text-ink-secondary hover:text-white" data-testid="studio-back-btn">
            <ArrowLeft className="w-4 h-4" /> Back to projects
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-display font-bold tracking-tight">AI Studio</span>
          </div>
          <div className="w-32" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-5 gap-10">
        <div className="lg:col-span-3">
          <div className="text-xs uppercase tracking-[0.3em] text-ink-secondary mb-3">Script</div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight mb-2">
            Paste a script.
          </h1>
          <p className="text-ink-secondary mb-8">Voltcut will split scenes, voice it, pull stock visuals, and align captions.</p>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            data-testid="studio-title-input"
            className="w-full bg-bg-base border border-white/10 focus:border-accent/60 focus:ring-1 focus:ring-accent/40 outline-none rounded-md px-4 py-3 text-base mb-4"
          />

          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={12}
            data-testid="studio-script-textarea"
            placeholder="Your hook + body copy..."
            className="w-full bg-bg-panel border border-white/10 focus:border-accent/60 focus:ring-1 focus:ring-accent/40 outline-none rounded-md p-5 text-base leading-relaxed font-sans resize-y"
          />
          <div className="mt-3 text-xs text-ink-muted font-mono">
            {script.length} chars · {script.split(/\s+/).filter(Boolean).length} words · ~{Math.ceil(script.split(/\s+/).filter(Boolean).length / 2.5)}s
          </div>

          <button
            onClick={submit}
            disabled={busy}
            data-testid="generate-video-btn"
            className="mt-8 w-full md:w-auto inline-flex items-center justify-center gap-2 bg-accent text-black font-bold px-8 py-4 rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {step || 'Generating…'}
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" /> Generate video
              </>
            )}
          </button>
        </div>

        {/* Right config */}
        <aside className="lg:col-span-2 space-y-6">
          <Panel title="Aspect Ratio">
            <div className="grid grid-cols-3 gap-2">
              {aspects.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setAspect(id)}
                  data-testid={`aspect-${id}`}
                  className={`p-4 rounded-md border text-left transition-colors ${
                    aspect === id ? 'border-accent bg-accent/10' : 'border-white/8 hover:border-white/20'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${aspect === id ? 'text-accent' : 'text-ink-secondary'}`} />
                  <div className="font-mono text-sm">{id}</div>
                  <div className="text-[11px] text-ink-secondary mt-1">{label}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Voice">
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              data-testid="voice-select"
              className="w-full bg-bg-base border border-white/10 rounded-md px-3 py-2.5 text-sm"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </Panel>

          <Panel title="Caption Theme">
            <div className="grid grid-cols-2 gap-2">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  data-testid={`theme-${t.id}`}
                  className={`p-3 rounded-md border text-sm text-left ${
                    theme === t.id ? 'border-accent bg-accent/10 text-white' : 'border-white/8 text-ink-secondary hover:border-white/20'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Panel>

          <div className="text-[11px] text-ink-muted leading-relaxed border-l-2 border-accent/40 pl-4">
            Generation can take 20–60 seconds depending on script length. We split scenes with GPT-5.2,
            generate TTS audio, transcribe with Whisper for word timings, and source visuals from Pixabay.
          </div>
        </aside>
      </main>

      {busy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center"
        >
          <div className="glass rounded-md p-10 max-w-md w-full mx-6 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto" />
            <div className="mt-6 font-display text-xl font-bold">Cooking your video…</div>
            <div className="mt-3 text-sm text-ink-secondary font-mono">{step}</div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-ink-secondary mb-3">{title}</div>
      {children}
    </div>
  );
}

function stepFlow(setStep) {
  const steps = [
    'Splitting scenes with GPT-5.2…',
    'Generating voiceover (OpenAI TTS)…',
    'Aligning words with Whisper…',
    'Pulling stock visuals…',
    'Assembling timeline…',
    'Almost there…',
  ];
  let i = 0;
  setStep(steps[0]);
  return setInterval(() => {
    i = Math.min(steps.length - 1, i + 1);
    setStep(steps[i]);
  }, 4500);
}
