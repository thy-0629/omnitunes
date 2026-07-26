import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlaylist, movePlaylistItem, removePlaylistItem } from '@/lib/api';
import type { Playlist, PlaylistItem } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);

  const refresh = () => {
    if (!id) return;
    getPlaylist(id)
      .then((r) => {
        setPlaylist(r.playlist);
        setItems([...r.items].sort((a, b) => a.position - b.position));
      })
      .catch(() => {});
  };
  useEffect(refresh, [id]);

  const move = async (item: PlaylistItem, delta: -1 | 1) => {
    if (!id) return;
    const target = item.position + delta;
    if (target < 0 || target >= items.length) return;
    await movePlaylistItem(id, item.id, target);
    refresh();
  };

  if (!playlist) return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link to="/playlists" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" />
        返回歌单
      </Link>
      <h1 className="mt-2 text-lg font-semibold">{playlist.name}</h1>

      <div className="mt-4 space-y-1">
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            歌单为空 — 在搜索结果里把歌加进来（后续版本会加「加入歌单」按钮）
          </div>
        )}
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <span className="w-6 shrink-0 text-center tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.songWork.title}</div>
              <div className="truncate text-xs text-muted-foreground">{item.songWork.artists}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="播放"
              onClick={() =>
                void usePlayerStore.getState().playSongWork({
                  id: item.songWork.id,
                  title: item.songWork.title,
                  artists: item.songWork.artists,
                })
              }
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => void move(item, -1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={i === items.length - 1}
              onClick={() => void move(item, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => id && void removePlaylistItem(id, item.id).then(refresh)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
