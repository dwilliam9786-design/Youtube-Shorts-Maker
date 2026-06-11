import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  project: null,
  selectedSceneIds: [],     // multi-select: array of scene IDs
  lastSelectedSceneId: null,
  isPlaying: false,
  currentTime: 0,
  setProject: (project) =>
    set({ project, selectedSceneIds: project?.scenes?.[0] ? [project.scenes[0].id] : [], lastSelectedSceneId: project?.scenes?.[0]?.id || null }),
  patchProject: (patch) =>
    set((s) => ({ project: s.project ? { ...s.project, ...patch } : s.project })),
  addMusicTrack: (url) =>
    set((s) => {
      if (!s.project || !url) return s;
      const tracks = Array.from(new Set([...(s.project.music_tracks || []), url]));
      return { project: { ...s.project, music_tracks: tracks } };
    }),
  addTimelineLayer: (layer) =>
    set((s) => {
      if (!s.project || !layer?.url) return s;
      const next = [...(s.project.timeline_layers || []), { id: crypto.randomUUID(), start: 0, duration: 3, track: 0, volume: 1, opacity: 1, trim_start: 0, trim_end: 0, ...layer }];
      return { project: { ...s.project, timeline_layers: next } };
    }),
  updateTimelineLayer: (id, patch) =>
    set((s) => {
      if (!s.project) return s;
      const layers = (s.project.timeline_layers || []).map((layer) => (layer.id === id ? { ...layer, ...patch } : layer));
      return { project: { ...s.project, timeline_layers: layers } };
    }),
  removeTimelineLayer: (id) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, timeline_layers: (s.project.timeline_layers || []).filter((layer) => layer.id !== id) } };
    }),
  removeMusicTrack: (url) =>
    set((s) => {
      if (!s.project) return s;
      return { project: { ...s.project, music_tracks: (s.project.music_tracks || []).filter((track) => track !== url) } };
    }),
  selectScene: (id, opts = {}) => {
    const state = get();
    const cur = state.selectedSceneIds;
    const scenes = state.project?.scenes || [];
    if (opts.shift && state.lastSelectedSceneId) {
      const from = scenes.findIndex((s) => s.id === state.lastSelectedSceneId);
      const to = scenes.findIndex((s) => s.id === id);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        set({
          selectedSceneIds: scenes.slice(start, end + 1).map((s) => s.id),
          lastSelectedSceneId: id,
        });
        return;
      }
    }
    if (opts.shift || opts.meta) {
      if (cur.includes(id)) set({ selectedSceneIds: cur.filter((x) => x !== id), lastSelectedSceneId: id });
      else set({ selectedSceneIds: [...cur, id], lastSelectedSceneId: id });
    } else {
      set({ selectedSceneIds: [id], lastSelectedSceneId: id });
    }
  },
  setSelected: (ids) => set({ selectedSceneIds: ids }),
  clearSelection: () => set({ selectedSceneIds: [], lastSelectedSceneId: null }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (t) => set({ currentTime: t }),
  updateScene: (id, patch) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc));
      const total = scenes.reduce((a, x) => a + (x.duration || 0), 0);
      return { project: { ...s.project, scenes, total_duration: total } };
    }),
  trimScene: (id, leftDelta = 0, rightDelta = 0) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== id) return sc;
        const dur = Math.max(0.5, sc.duration || 0);
        const trimStart = Math.max(0, (sc.trim_start || 0) + leftDelta);
        const trimEnd = Math.max(0, (sc.trim_end || 0) + rightDelta);
        const nextDuration = Math.max(0.5, dur - leftDelta - rightDelta);
        return { ...sc, trim_start: trimStart, trim_end: trimEnd, duration: nextDuration };
      });
      const total = scenes.reduce((a, x) => a + (x.duration || 0), 0);
      return { project: { ...s.project, scenes, total_duration: total } };
    }),
  setMusicTimeline: (patch) =>
    set((s) => {
      if (!s.project) return s;
      const cur = s.project.music_timeline || { start: 0, duration: s.project.total_duration || 0, trim_start: 0, trim_end: 0 };
      return { project: { ...s.project, music_timeline: { ...cur, ...patch } } };
    }),
  updateSelectedScenes: (patch) =>
    set((s) => {
      if (!s.project) return s;
      const ids = new Set(s.selectedSceneIds);
      const scenes = s.project.scenes.map((sc) => (ids.has(sc.id) ? { ...sc, ...patch } : sc));
      const total = scenes.reduce((a, x) => a + (x.duration || 0), 0);
      return { project: { ...s.project, scenes, total_duration: total } };
    }),
  toggleSceneEffect: (id, fx) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== id) return sc;
        const ef = sc.effects || [];
        const next = ef.includes(fx) ? ef.filter((x) => x !== fx) : [...ef, fx];
        return { ...sc, effects: next };
      });
      return { project: { ...s.project, scenes } };
    }),
  toggleSelectedEffect: (fx) =>
    set((s) => {
      if (!s.project) return s;
      const ids = new Set(s.selectedSceneIds);
      const scenes = s.project.scenes.map((sc) => {
        if (!ids.has(sc.id)) return sc;
        const ef = sc.effects || [];
        const next = ef.includes(fx) ? ef.filter((x) => x !== fx) : [...ef, fx];
        return { ...sc, effects: next };
      });
      return { project: { ...s.project, scenes } };
    }),
  updateCaption: (sceneId, capId, patch) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        const captions = (sc.captions || []).map((c) => (c.id === capId ? { ...c, ...patch } : c));
        return { ...sc, captions };
      });
      return { project: { ...s.project, scenes } };
    }),
  updateWord: (sceneId, capId, wordIdx, patch) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        const captions = (sc.captions || []).map((c) => {
          if (c.id !== capId) return c;
          const words = [...(c.words || [])];
          if (words[wordIdx]) words[wordIdx] = { ...words[wordIdx], ...patch };
          return { ...c, words };
        });
        return { ...sc, captions };
      });
      return { project: { ...s.project, scenes } };
    }),
  detachCaptionWord: (sceneId, capId, wordIdx) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        const captions = [...(sc.captions || [])];
        const idx = captions.findIndex((c) => c.id === capId);
        if (idx < 0) return sc;
        const cap = captions[idx];
        const words = [...(cap.words || [])];
        const word = words[wordIdx];
        if (!word) return sc;
        const text = (word.word || '').trim();
        const newCap = {
          ...cap,
          id: crypto.randomUUID(),
          text,
          start: word.start ?? cap.start,
          end: word.end ?? cap.end,
          words: [word],
        };

        const remainingWords = words.filter((_, i) => i !== wordIdx);
        if (remainingWords.length === 0) {
          captions.splice(idx, 1, newCap);
        } else {
          const nextText = remainingWords.map((w) => w.word).join(' ').trim();
          const nextStart = remainingWords[0]?.start ?? cap.start;
          const nextEnd = remainingWords[remainingWords.length - 1]?.end ?? cap.end;
          captions[idx] = { ...cap, words: remainingWords, text: nextText, start: nextStart, end: nextEnd };
          captions.splice(idx + 1, 0, newCap);
        }
        captions.sort((a, b) => (a.start || 0) - (b.start || 0));
        return { ...sc, captions };
      });
      return { project: { ...s.project, scenes } };
    }),
  removeCaption: (sceneId, capId) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        return { ...sc, captions: (sc.captions || []).filter((c) => c.id !== capId) };
      });
      return { project: { ...s.project, scenes } };
    }),
  setCaptionStyle: (patch) =>
    set((s) => {
      if (!s.project) return s;
      const cur = s.project.caption_style || {};
      return { project: { ...s.project, caption_style: { ...cur, ...patch } } };
    }),
  reorderScenes: (fromIdx, toIdx) =>
    set((s) => {
      if (!s.project) return s;
      const arr = [...s.project.scenes];
      const [m] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, m);
      arr.forEach((sc, i) => (sc.index = i));
      return { project: { ...s.project, scenes: arr } };
    }),
  removeScenes: (ids) =>
    set((s) => {
      if (!s.project) return s;
      const set2 = new Set(ids);
      const scenes = s.project.scenes.filter((sc) => !set2.has(sc.id));
      scenes.forEach((sc, i) => (sc.index = i));
      const total = scenes.reduce((a, x) => a + (x.duration || 0), 0);
      return {
        project: { ...s.project, scenes, total_duration: total },
        selectedSceneIds: scenes[0] ? [scenes[0].id] : [],
        lastSelectedSceneId: scenes[0] ? scenes[0].id : null,
      };
    }),
}));
