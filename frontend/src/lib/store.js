import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  project: null,
  selectedSceneId: null,
  isPlaying: false,
  currentTime: 0,
  setProject: (project) => set({ project, selectedSceneId: project?.scenes?.[0]?.id || null }),
  patchProject: (patch) => set((s) => ({ project: s.project ? { ...s.project, ...patch } : s.project })),
  selectScene: (id) => set({ selectedSceneId: id }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (t) => set({ currentTime: t }),
  updateScene: (id, patch) =>
    set((s) => {
      if (!s.project) return s;
      const scenes = s.project.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc));
      return { project: { ...s.project, scenes } };
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
}));
