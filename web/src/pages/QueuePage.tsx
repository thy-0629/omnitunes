import { useEffect } from 'react';
import { SkipForward, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueueStore } from '@/stores/queue';
import { usePlayerStore } from '@/stores/player';

export function QueuePage() {
  const { items, total, refresh, removeAt, clear } = useQueueStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">播放队列（{total}）</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void usePlayerStore.getState().playNextFromQueue()}
            disabled={total === 0}
          >
            <SkipForward className="h-4 w-4" />
            播放下一首
          </Button>
          <Button variant="outline" size="sm" onClick={() => void clear()} disabled={total === 0}>
            <Trash2 className="h-4 w-4" />
            清空
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            队列为空 — 在搜索页点「加入队列」
          </div>
        )}
        {items.map((item, i) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="w-6 shrink-0 text-center tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{item.songWorkId}</span>
            <Button variant="ghost" size="icon" onClick={() => void removeAt(i)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
