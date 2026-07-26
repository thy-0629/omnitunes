import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListMusic, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
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
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">歌单</h1>

      <div className="mt-4 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新歌单名称"
          onKeyDown={(e) => e.key === 'Enter' && void create()}
        />
        <Button onClick={() => void create()} disabled={!name.trim()}>
          <Plus className="h-4 w-4" />
          创建
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {playlists.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">还没有歌单</div>
        )}
        {playlists.map((pl) => (
          <Card key={pl.id} className="flex items-center gap-3 p-3">
            <ListMusic className="h-5 w-5 shrink-0 text-muted-foreground" />
            <Link to={`/playlists/${pl.id}`} className="min-w-0 flex-1 truncate hover:underline">
              {pl.name}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void deletePlaylist(pl.id).then(refresh)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
