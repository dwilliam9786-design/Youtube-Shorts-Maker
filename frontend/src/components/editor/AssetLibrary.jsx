import React, { useEffect, useRef, useState } from 'react';
import { apiClient, resolveMedia } from '../../lib/api';
import { Search, Image as ImageIcon, Music, Upload, Loader2, Plus, Video } from 'lucide-react';
import { useEditorStore } from '../../lib/store';
import { toast } from 'sonner';

export default function AssetLibrary() {
  const [tab, setTab] = useState('image');
  const [q, setQ] = useState('cinematic');
  const [items, setItems] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const { selectedSceneIds, updateScene, patchProject } = useEditorStore();
  const targetId = selectedSceneIds[0];

  const search = async () => {
    setLoading(true);
    try {
      const data = await apiClient.library(q, tab === 'music' ? 'music' : 'image');
      setItems(data.items || []);
    } catch (e) {
      toast.error('Library search failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'image' || tab === 'music') search();
    // eslint-disable-next-line
  }, [tab]);

  const applyImage = (item) => {
    if (!targetId) {
      toast('Select a scene first');
      return;
    }
    updateScene(targetId, { image_url: item.url, video_url: null });
    toast.success('Visual replaced');
  };

  const applyMusic = (item) => {
    patchProject({ music_url: item.preview });
    toast.success('Music added');
  };

  const onFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const out = [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const kind = ['mp4', 'mov', 'webm', 'm4v'].includes(ext)
          ? 'video'
          : ['mp3', 'wav', 'm4a', 'ogg'].includes(ext)
          ? 'audio'
          : 'image';
        const res = await apiClient.upload(f, kind);
        out.push(res);
      }
      setUploads((u) => [...out, ...u]);
      toast.success(`${out.length} file(s) uploaded`);
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyUpload = (u) => {
    if (!targetId) {
      toast('Select a scene first');
      return;
    }
    if (u.media_type === 'video') {
      updateScene(targetId, { video_url: u.url, image_url: null });
      toast.success('User clip applied');
    } else if (u.media_type === 'image') {
      updateScene(targetId, { image_url: u.url, video_url: null });
      toast.success('Image applied');
    } else if (u.media_type === 'audio') {
      patchProject({ music_url: u.url });
      toast.success('Music set');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-white/8 space-y-2">
        <div className="flex gap-1 text-xs">
          <Tab active={tab === 'image'} onClick={() => setTab('image')} icon={ImageIcon} label="Stock" testid="library-tab-image" />
          <Tab active={tab === 'music'} onClick={() => setTab('music')} icon={Music} label="Music" testid="library-tab-music" />
          <Tab active={tab === 'upload'} onClick={() => setTab('upload')} icon={Upload} label="Uploads" testid="library-tab-upload" />
        </div>
        {(tab === 'image' || tab === 'music') && (
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Search…"
                data-testid="library-search-input"
                className="w-full bg-bg-base border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs focus:border-accent/60 outline-none"
              />
            </div>
            <button onClick={search} className="px-3 text-xs bg-accent text-black rounded-md hover:bg-accent-hover" data-testid="library-search-btn">
              Go
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'upload' ? (
          <UploadPanel
            uploads={uploads}
            uploading={uploading}
            fileRef={fileRef}
            onFiles={onFiles}
            applyUpload={applyUpload}
          />
        ) : loading ? (
          <div className="h-full grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-ink-secondary" /></div>
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
                <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[10px] truncate bg-gradient-to-t from-black to-transparent">{it.title}</div>
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

function UploadPanel({ uploads, uploading, fileRef, onFiles, applyUpload }) {
  return (
    <>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
        data-testid="upload-dropzone"
        className="border border-dashed border-white/15 rounded-md p-6 text-center cursor-pointer hover:border-accent/60 hover:bg-accent/5 transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
          data-testid="upload-file-input"
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="w-4 h-4 animate-spin text-accent" /> Uploading…
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-ink-secondary" />
            <div className="mt-2 text-xs font-medium">Drop or click to upload</div>
            <div className="text-[10px] text-ink-muted mt-1">Images · Videos (mp4/mov/webm) · Audio</div>
          </>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {uploads.length === 0 ? (
          <div className="text-[11px] text-ink-muted text-center mt-6">No uploads yet</div>
        ) : (
          uploads.map((u, i) => (
            <button
              key={i}
              onClick={() => applyUpload(u)}
              data-testid={`upload-item-${i}`}
              className="w-full flex items-center gap-2 p-2 border border-white/8 rounded-md hover:border-accent/60 hover:bg-white/5 text-left transition-colors"
            >
              <div className="w-12 h-12 rounded overflow-hidden bg-bg-base flex items-center justify-center shrink-0">
                {u.media_type === 'image' ? (
                  <img src={resolveMedia(u.url)} alt="" className="w-full h-full object-cover" />
                ) : u.media_type === 'video' ? (
                  <Video className="w-5 h-5 text-accent" />
                ) : (
                  <Music className="w-5 h-5 text-accent" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{u.filename}</div>
                <div className="text-[10px] text-ink-muted font-mono">
                  {u.media_type} · {(u.size / 1024).toFixed(1)}KB
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </>
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
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
