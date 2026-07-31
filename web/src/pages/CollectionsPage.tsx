import { useEffect, useState } from 'react';
import { Heart, ListPlus, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCollections, removeCollection } from '@/lib/api';
import type { CollectionEntry } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';
import { useQueueStore } from '@/stores/queue';
import { PlaylistPicker } from '@/components/PlaylistPicker';

export function CollectionsPage() {
  const [items, setItems] = useState<CollectionEntry[]>([]);

  const refresh = () => {
    getCollections()
      .then((r) => setItems(r.items))
      .catch(() => {});
  };
  useEffect(refresh, []);

  return (
    <div className="mx-auto max-w-2xl py-4">
      <header className="sticky top-[4.5rem] z-30 mb-5">
        <div className="apple-glass mx-auto rounded-[1.75rem] p-4">
          <h1 className="apple-typo-headline">收藏（{items.length}）</h1>
        </div>
      </header>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="apple-card py-12 text-center text-sm text-muted-foreground">
            还没有收藏 — 在搜索结果点 ♥
          </div>
        )}
        {items.map((c) => (
          <div
            key={c.songWorkId}
            className="apple-card apple-card-interactive flex items-center gap-3 p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Heart className="h-4 w-4 fill-primary text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.songWork.title}</div>
              <div className="truncate text-xs text-muted-foreground">{c.songWork.artists}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full"
              title="播放"
              onClick={() =>
                void usePlayerStore.getState().playSongWork({
                  id: c.songWork.id,
                  title: c.songWork.title,
                  artists: c.songWork.artists,
                })
              }
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="apple-btn h-8 w-8 rounded-full"
              title="加入队列"
              onClick={() => void useQueueStore.getState().add(c.songWork)}
            >
              <ListPlus className="h-4 w-4" />
            </Button>
            <PlaylistPicker songWorkId={c.songWorkId} songWorkTitle={c.songWork.title}>
              <ListPlus className="h-4 w-4" />
            </PlaylistPicker>
            <Button
              variant="outline"
              size="sm"
              className="apple-btn h-8 rounded-full text-xs text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => void removeCollection(c.songWorkId).then(refresh)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              取消
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
