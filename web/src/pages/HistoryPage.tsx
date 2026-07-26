import { useEffect, useState } from 'react';
import { getHistory } from '@/lib/api';
import type { HistoryEntry } from '@/lib/api/types';
import { SourceBadge } from '@/components/SourceBadge';
import { formatDuration } from '@/lib/utils';

const OUTCOME_LABEL: Record<string, string> = {
  completed: '播完',
  skipped: '跳过',
  failed: '失败',
  still_playing: '播放中',
};

export function HistoryPage() {
  const [items, setItems] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    getHistory({ limit: 100 })
      .then((r) => setItems(r.items))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">播放历史</h1>

      <div className="mt-4 space-y-1">
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">还没有播放记录</div>
        )}
        {items.map((h) => (
          <div key={h.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <SourceBadge source={h.source} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{h.songWorkTitle}</div>
              <div className="truncate text-xs text-muted-foreground">{h.songWorkArtists}</div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {OUTCOME_LABEL[h.outcome] ?? h.outcome}
              {h.durationPlayedSec != null && ` · ${formatDuration(h.durationPlayedSec)}`}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {new Date(h.playedAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
