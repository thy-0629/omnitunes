import { Heart, ListPlus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SourceBadge } from '@/components/SourceBadge';
import { formatDuration } from '@/lib/utils';
import type { SearchResultGroup, SourceItem } from '@/lib/api/types';

interface Props {
  group: SearchResultGroup;
  onPlay: (sourceItem: SourceItem) => void;
  onAddToQueue: (songWorkId: string) => void;
  onToggleFavorite: (songWorkId: string) => void;
  isFavorite: boolean;
}

/** One search result: song-work level card with per-source items. */
export function SearchResultCard({ group, onPlay, onAddToQueue, onToggleFavorite, isFavorite }: Props) {
  const { songWork, recordings } = group;
  const sourceItems = recordings.flatMap((r) =>
    r.sourceItems.map((si) => ({ si, duration: r.recording.durationSec })),
  );

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{songWork.title}</div>
          <div className="truncate text-sm text-muted-foreground">{songWork.artists}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={isFavorite ? '取消收藏' : '收藏'}
            onClick={() => onToggleFavorite(songWork.id)}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" title="加入队列" onClick={() => onAddToQueue(songWork.id)}>
            <ListPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {sourceItems.map(({ si, duration }) => (
          <button
            key={si.id}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => onPlay(si)}
          >
            <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SourceBadge source={si.source} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {si.publisher ?? si.externalId}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatDuration(duration)}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
