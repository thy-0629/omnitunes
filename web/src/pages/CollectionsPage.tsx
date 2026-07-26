import { useEffect, useState } from 'react';
import { Heart, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCollections, removeCollection } from '@/lib/api';
import type { CollectionEntry } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';

export function CollectionsPage() {
  const [items, setItems] = useState<CollectionEntry[]>([]);

  const refresh = () => {
    getCollections()
      .then((r) => setItems(r.items))
      .catch(() => {});
  };
  useEffect(refresh, []);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">收藏（{items.length}）</h1>

      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            还没有收藏 — 在搜索结果点 ♥
          </div>
        )}
        {items.map((c) => (
          <Card key={c.songWorkId} className="flex items-center gap-3 p-3">
            <Heart className="h-4 w-4 shrink-0 fill-red-500 text-red-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.songWork.title}</div>
              <div className="truncate text-xs text-muted-foreground">{c.songWork.artists}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
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
              variant="outline"
              size="sm"
              onClick={() => void removeCollection(c.songWorkId).then(refresh)}
            >
              取消收藏
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
