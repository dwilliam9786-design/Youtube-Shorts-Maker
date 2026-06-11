import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  project: null,
  selectedSceneIds: [],     // multi-select: array of scene IDs
  isPlaying: false,
  currentTime: 0,
  setProject: (project) =>
    set({ project, selectedSceneIds: project?.scenes?.[0] ? [project.scenes[0].id] : [] }),
  patchProject: (patch) =>
    set((s) => ({ project: s.project ? { ...s.project, ...patch } : s.project })),
  selectScene: (id, opts = {}) => {
    const cur = get().selectedSceneIds;
    if (opts.shift || opts.meta) {
      if (cur.includes(id)) set({ selectedSceneIds: cur.filter((x) => x !== id) });
      else set({ selectedSceneIds: [...cur, id] });
    } else {
      set({ selectedSceneIds: [id] });
    }
  },
  setSelected: (ids) => set({ selectedSceneIds: ids }),
  clearSelection: () => set({ selectedSceneIds: [] }),
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
      };
    }),
}));
