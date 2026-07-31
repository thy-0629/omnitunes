import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ListPlus,
  Pencil,
  Play,
  Trash2,
  X,
  Check,
  Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  deletePlaylist,
  getPlaylist,
  movePlaylistItem,
  removePlaylistItem,
  renamePlaylist,
} from '@/lib/api';
import type { Playlist, PlaylistItem } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';
import { useQueueStore } from '@/stores/queue';

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

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

  const handlePlayAll = () => {
    if (items.length === 0) return;
    const [first, ...rest] = items;
    void usePlayerStore.getState().playSongWork(first.songWork);
    for (const item of rest) {
      void useQueueStore.getState().add(item.songWork);
    }
  };

  const handleAddAllToQueue = () => {
    for (const item of items) {
      void useQueueStore.getState().add(item.songWork);
    }
  };

  const startRename = () => {
    setNameDraft(playlist?.name ?? '');
    setIsEditingName(true);
  };

  const confirmRename = async () => {
    if (!id || !nameDraft.trim()) return;
    try {
      const res = await renamePlaylist(id, nameDraft.trim());
      setPlaylist(res.playlist);
      setIsEditingName(false);
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('确定要删除这个歌单吗？')) return;
    try {
      await deletePlaylist(id);
      navigate('/playlists');
    } catch {
      // ignore
    }
  };

  if (!playlist) return <div className="py-4 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="mx-auto max-w-2xl py-4">
      <Link
        to="/playlists"
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted-foreground hover:bg-secondary"
      >
        <ArrowLeft className="h-4 w-4" />
        返回歌单
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        {isEditingName ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-9 rounded-full text-lg font-semibold"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmRename();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="apple-btn h-9 w-9 rounded-full"
              onClick={() => void confirmRename()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="apple-btn h-9 w-9 rounded-full"
              onClick={() => setIsEditingName(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <h1 className="apple-typo-headline">{playlist.name}</h1>
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full"
              title="重命名"
              onClick={startRename}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="apple-btn shrink-0 rounded-full border-destructive text-destructive hover:bg-destructive/10"
          onClick={() => void handleDelete()}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          删除
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={handlePlayAll}
          disabled={items.length === 0}
          className="apple-btn rounded-full bg-primary px-4 text-primary-foreground"
        >
          <Play className="mr-1 h-4 w-4" />
          播放全部
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddAllToQueue}
          disabled={items.length === 0}
          className="apple-btn rounded-full"
        >
          <ListPlus className="mr-1 h-4 w-4" />
          全部加入队列
        </Button>
      </div>

      <div className="mt-5 space-y-2">
        {items.length === 0 && (
          <div className="apple-card py-12 text-center text-sm text-muted-foreground">
            歌单为空 — 在搜索结果里把歌加进来
          </div>
        )}
        {items.map((item, i) => (
          <div
            key={item.id}
            className="apple-card flex items-center gap-3 rounded-2xl px-3 py-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Music className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="w-6 shrink-0 text-center tabular-nums text-sm text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.songWork.title}</div>
              <div className="truncate text-xs text-muted-foreground">{item.songWork.artists}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full"
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
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full"
              disabled={i === 0}
              onClick={() => void move(item, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full"
              disabled={i === items.length - 1}
              onClick={() => void move(item, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
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
