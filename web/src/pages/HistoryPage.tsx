import { useEffect, useState } from 'react';
import { History, Music } from 'lucide-react';
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
    <div className="mx-auto max-w-2xl py-4">
      <header className="sticky top-[4.5rem] z-30 mb-5">
        <div className="apple-glass mx-auto flex items-center gap-3 rounded-[1.75rem] p-4">
          <History className="h-5 w-5 text-muted-foreground" />
          <h1 className="apple-typo-headline">播放历史</h1>
        </div>
      </header>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="apple-card py-12 text-center text-sm text-muted-foreground">
            还没有播放记录
          </div>
        )}
        {items.map((h) => (
          <div
            key={h.id}
            className="apple-card flex items-center gap-3 rounded-2xl px-3 py-2 text-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Music className="h-4 w-4 text-muted-foreground" />
            </div>
            <SourceBadge source={h.source} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{h.songWorkTitle}</div>
              <div className="truncate text-xs text-muted-foreground">{h.songWorkArtists}</div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {OUTCOME_LABEL[h.outcome] ?? h.outcome}
              {h.durationPlayedSec != null && ` · ${formatDuration(h.durationPlayedSec)}`}
            </span>
            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
              {new Date(h.playedAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
