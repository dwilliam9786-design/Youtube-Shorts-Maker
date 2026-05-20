import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, Wand2, Type, Music, Scissors, Zap, ArrowRight, Play, Activity,
} from 'lucide-react';

const features = [
  { icon: Wand2, title: 'AI Script → Video', body: 'Paste a script. We split scenes, generate voiceover, pull stock visuals, align word-perfect captions.' },
  { icon: Scissors, title: 'Pro Timeline Editor', body: 'Multi-track non-linear editor. Trim, split, reorder, snap, keyboard-first like Final Cut.' },
  { icon: Type, title: 'Karaoke Captions', body: 'Whisper-aligned word timings drive viral pop captions with per-speaker styles.' },
  { icon: Music, title: 'Pixabay Library', body: 'Drop in royalty-free music, SFX, and cinematic stock — beat-synced transitions.' },
  { icon: Zap, title: 'Trending Effects', body: 'Zoom cuts, glitch, flash, Ken Burns, RGB split — one-click for viral retention.' },
  { icon: Activity, title: 'Render in 1080p', body: 'GPU-accelerated FFmpeg pipeline. 9:16 Shorts, 1:1 Reels, 16:9 YouTube.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg-base text-white relative overflow-x-hidden">
      {/* Top nav */}
      <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
            <div className="w-8 h-8 rounded-md bg-accent text-black grid place-items-center font-display font-black">V</div>
            <span className="font-display text-lg font-bold tracking-tight">VOLTCUT</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-ink-secondary">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#workflow" className="hover:text-white transition-colors">Workflow</a>
            <a href="#stack" className="hover:text-white transition-colors">Tech</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/app" className="text-sm text-ink-secondary hover:text-white" data-testid="sign-in-link">Sign in</Link>
            <Link
              to="/studio"
              data-testid="hero-cta-launch"
              className="text-sm font-medium bg-accent text-black px-4 py-2 rounded-md hover:bg-accent-hover transition-colors"
            >
              Start Creating
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative pt-40 pb-32 px-6 noise vignette">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              "url('https://static.prod-images.emergentagent.com/jobs/920b20a9-8be0-4858-96c8-c183e9068c23/images/9116f7965d2816ef580412c2fe14d7656d690f37a888c227c1d76f95d3180d10.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-bg-base/40 via-bg-base/80 to-bg-base"></div>

        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-2 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 text-xs text-ink-secondary uppercase tracking-[0.2em]">
              <Sparkles className="w-3 h-3 text-accent" /> Built for creators in 2026
            </span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-6xl sm:text-7xl md:text-[120px] font-black tracking-tighter leading-[0.85] text-glow"
          >
            Script in.<br />
            <span className="text-accent">Viral video</span><br /> out.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 max-w-2xl text-lg text-ink-secondary leading-relaxed"
          >
            Voltcut is the AI short-form video studio for TikTok, Reels and Shorts. Paste a script —
            we generate the voiceover, source the visuals, align karaoke captions, and render a
            cinematic vertical video in seconds.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              to="/studio"
              data-testid="hero-primary-cta"
              className="group inline-flex items-center gap-2 bg-accent text-black font-bold px-6 py-3.5 rounded-md hover:bg-accent-hover transition-colors"
            >
              Create your first video
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/app"
              data-testid="hero-secondary-cta"
              className="inline-flex items-center gap-2 border border-white/15 px-6 py-3.5 rounded-md hover:bg-white/5 transition-colors"
            >
              <Play className="w-4 h-4" /> Open my projects
            </Link>
          </motion.div>

          {/* metric row */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            {[
              ['< 45s', 'AI scene render'],
              ['1080p', 'Vertical export'],
              ['Whisper', 'Word-perfect captions'],
              ['Pixabay', 'Stock library'],
            ].map(([k, v]) => (
              <div key={k} className="border-l border-white/10 pl-4">
                <div className="font-mono text-accent text-2xl font-bold">{k}</div>
                <div className="text-xs text-ink-secondary uppercase tracking-wider mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-secondary mb-3">Capabilities</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tight max-w-2xl">
              Everything CapCut does — automated.
            </h2>
          </div>
          <Link to="/studio" className="hidden md:inline-flex text-sm text-ink-secondary hover:text-white items-center gap-1">
            Try the studio <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 border border-white/5">
          {features.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="bg-bg-base p-8 hover:bg-bg-panel transition-colors group"
            >
              <Icon className="w-6 h-6 text-accent" />
              <h3 className="mt-6 font-display text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-3 text-sm text-ink-secondary leading-relaxed">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="workflow" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-xs uppercase tracking-[0.3em] text-ink-secondary mb-3">Workflow</div>
        <h2 className="font-display text-4xl md:text-5xl font-black tracking-tight mb-16 max-w-2xl">
          Four steps from idea to upload.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { n: '01', t: 'Paste script', d: 'Drop in your hook + body copy.' },
            { n: '02', t: 'AI generates', d: 'Scenes split, voice cloned, visuals fetched.' },
            { n: '03', t: 'Polish in editor', d: 'Trim, swap clips, tweak captions, beat-sync.' },
            { n: '04', t: 'Render & ship', d: '1080p MP4 ready for TikTok/IG/YT.' },
          ].map((s) => (
            <div key={s.n} className="p-6 border border-white/10 rounded-md hover:border-accent/40 transition-colors">
              <div className="font-mono text-accent text-sm">{s.n}</div>
              <div className="mt-4 font-display text-xl font-bold">{s.t}</div>
              <div className="mt-2 text-sm text-ink-secondary">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="px-6 py-24 max-w-7xl mx-auto">
        <div className="glass rounded-md p-12 md:p-20 text-center relative overflow-hidden noise">
          <h2 className="font-display text-4xl md:text-6xl font-black tracking-tighter">
            Make it. Post it. <span className="text-accent">Go viral.</span>
          </h2>
          <p className="mt-6 text-ink-secondary max-w-xl mx-auto">
            Stop wrestling with timelines. Voltcut handles the heavy lifting so you can focus on what matters: the hook.
          </p>
          <Link
            to="/studio"
            data-testid="footer-cta"
            className="mt-10 inline-flex items-center gap-2 bg-accent text-black font-bold px-8 py-4 rounded-md hover:bg-accent-hover transition-colors"
          >
            Start creating free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="px-6 py-12 border-t border-white/5 text-xs text-ink-muted">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span>© 2026 Voltcut Studio</span>
          <span className="font-mono">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
