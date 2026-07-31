import { useEffect, useRef, useState } from 'react';
import { ListMusic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { addPlaylistItem, createPlaylist, getPlaylists } from '@/lib/api';
import type { Playlist } from '@/lib/api/types';

interface PlaylistPickerProps {
  songWorkId: string;
  songWorkTitle?: string;
  children?: React.ReactNode;
  onAdded?: () => void;
}

export function PlaylistPicker({ songWorkId, songWorkTitle, children, onAdded }: PlaylistPickerProps) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPlaylists()
      .then((res) => setPlaylists(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAdd = async (playlistId: string) => {
    try {
      await addPlaylistItem(playlistId, songWorkId);
      setOpen(false);
      onAdded?.();
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await createPlaylist(name);
      await addPlaylistItem(res.playlist.id, songWorkId);
      setCreating(false);
      setNewName('');
      setOpen(false);
      onAdded?.();
    } catch {
      // ignore
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        title="加入歌单"
        onClick={() => setOpen((v) => !v)}
      >
        {children ?? <ListMusic className="h-4 w-4" />}
      </Button>

      {open && (
        <Card className="absolute right-0 top-full z-50 mt-1 w-56 p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">加入歌单</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {creating ? (
            <div className="space-y-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="新歌单名称"
                className="h-8 text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCreating(false)}>
                  取消
                </Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => void handleCreate()} disabled={!newName.trim()}>
                  创建并加入
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-48 overflow-auto">
                {loading && (
                  <div className="py-2 text-center text-xs text-muted-foreground">加载中…</div>
                )}
                {!loading && playlists.length === 0 && (
                  <div className="py-2 text-center text-xs text-muted-foreground">暂无歌单</div>
                )}
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => void handleAdd(pl.id)}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full text-xs"
                onClick={() => setCreating(true)}
              >
                + 新建歌单{songWorkTitle ? `「${songWorkTitle}」` : ''}
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
