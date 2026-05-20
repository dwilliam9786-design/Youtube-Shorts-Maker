import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { Search, Image as ImageIcon, Music, Loader2, Plus } from 'lucide-react';
import { useEditorStore } from '../../lib/store';
import { toast } from 'sonner';

export default function AssetLibrary() {
  const [tab, setTab] = useState('image');
  const [q, setQ] = useState('cinematic');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { selectedSceneId, updateScene, patchProject, project } = useEditorStore();

  const search = async () => {
    setLoading(true);
    try {
      const data = await apiClient.library(q, tab);
      setItems(data.items || []);
    } catch (e) {
      toast.error('Library search failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    search();
    // eslint-disable-next-line
  }, [tab]);

  const applyImage = (item) => {
    if (!selectedSceneId) {
      toast('Select a scene first');
      return;
    }
    updateScene(selectedSceneId, { image_url: item.url });
    toast.success('Visual replaced');
  };

  const applyMusic = (item) => {
    patchProject({ music_url: item.preview });
    toast.success('Music added (preview)');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-white/8 space-y-2">
        <div className="flex gap-1 text-xs">
          <Tab active={tab === 'image'} onClick={() => setTab('image')} icon={ImageIcon} label="Visuals" testid="library-tab-image" />
          <Tab active={tab === 'music'} onClick={() => setTab('music')} icon={Music} label="Music" testid="library-tab-music" />
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search Pixabay…"
              data-testid="library-search-input"
              className="w-full bg-bg-base border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs focus:border-accent/60 outline-none"
            />
          </div>
          <button onClick={search} className="px-3 text-xs bg-accent text-black rounded-md hover:bg-accent-hover" data-testid="library-search-btn">
            Go
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="h-full grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin text-ink-secondary" />
          </div>
        ) : tab === 'image' ? (
          <div className="grid grid-cols-2 gap-2">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => applyImage(it)}
                data-testid={`library-image-${it.id}`}
                className="group relative aspect-[9/16] rounded-md overflow-hidden border border-white/8 hover:border-accent/60"
              >
                <img src={it.thumb} alt={it.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors grid place-items-center">
                  <Plus className="w-5 h-5 opacity-0 group-hover:opacity-100 text-accent transition-opacity" />
                </div>
                <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[10px] truncate bg-gradient-to-t from-black to-transparent">
                  {it.title}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="p-3 border border-white/8 rounded-md hover:border-accent/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{it.title}</div>
                  <button
                    onClick={() => applyMusic(it)}
                    className="text-[11px] px-2 py-1 bg-accent text-black rounded font-medium hover:bg-accent-hover"
                    data-testid={`library-music-add-${it.id}`}
                  >
                    + Add
                  </button>
                </div>
                <audio src={it.preview} controls className="w-full h-8" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
        active ? 'bg-white/5 text-white' : 'text-ink-secondary hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
