import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListMusic, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPlaylist, deletePlaylist, getPlaylists } from '@/lib/api';
import type { Playlist } from '@/lib/api/types';

export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState('');

  const refresh = () => {
    getPlaylists()
      .then((r) => setPlaylists(r.items))
      .catch(() => {});
  };
  useEffect(refresh, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createPlaylist(trimmed);
    setName('');
    refresh();
  };

  return (
    <div className="mx-auto max-w-2xl py-4">
      <header className="sticky top-[4.5rem] z-30 mb-5">
        <div className="apple-glass mx-auto flex flex-col gap-3 rounded-[1.75rem] p-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="apple-typo-headline">歌单</h1>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新歌单名称"
              onKeyDown={(e) => e.key === 'Enter' && void create()}
              className="h-9 rounded-full bg-secondary/60 border-input"
            />
            <Button
              onClick={() => void create()}
              disabled={!name.trim()}
              className="apple-btn h-9 rounded-full bg-primary px-4 text-primary-foreground"
            >
              <Plus className="mr-1 h-4 w-4" />
              创建
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-2">
        {playlists.length === 0 && (
          <div className="apple-card py-12 text-center text-sm text-muted-foreground">
            还没有歌单
          </div>
        )}
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className="apple-card apple-card-interactive flex items-center gap-3 p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <ListMusic className="h-5 w-5 text-muted-foreground" />
            </div>
            <Link to={`/playlists/${pl.id}`} className="min-w-0 flex-1 truncate hover:underline">
              {pl.name}
            </Link>
            <button
              type="button"
              onClick={() => void deletePlaylist(pl.id).then(refresh)}
              className="apple-btn flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
              aria-label="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
