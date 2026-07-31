import { Heart, ListPlus, Play, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SourceBadge } from '@/components/SourceBadge';
import { PlaylistPicker } from '@/components/PlaylistPicker';
import { formatDuration } from '@/lib/utils';
import type { SearchResultGroup, SourceItem } from '@/lib/api/types';

interface Props {
  group: SearchResultGroup;
  query?: string;
  onPlay: (sourceItem: SourceItem) => void;
  onPlayBest: () => void;
  onAddToQueue: (songWorkId: string, sourceItemId?: string) => void;
  onAddNext: (songWorkId: string, sourceItemId?: string) => void;
  onToggleFavorite: (songWorkId: string) => void;
  isFavorite: boolean;
}

/** One search result: song-work level card with per-source items. */
export function SearchResultCard({
  group,
  query,
  onPlay,
  onPlayBest,
  onAddToQueue,
  onAddNext,
  onToggleFavorite,
  isFavorite,
}: Props) {
  const { songWork, recordings } = group;
  const totalSources = recordings.reduce((sum, r) => sum + r.sourceItems.length, 0);

  const queryClean = query?.trim().toLowerCase() ?? '';
  const titleLower = songWork.title.toLowerCase();
  const showQueryAsTitle =
    queryClean.length >= 2 &&
    (titleLower.includes(queryClean) ||
      songWork.title.replace(/[（(〔【[{「《「\s\-–—）)〕】}\]」》」]/g, '').toLowerCase().includes(queryClean));

  const displayTitle = showQueryAsTitle ? query!.trim() : songWork.title;
  const fullTitleTooltip = showQueryAsTitle ? songWork.title : undefined;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold leading-tight" title={fullTitleTooltip}>
            {displayTitle}
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{songWork.artists}</div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={isFavorite ? '取消收藏' : '收藏'}
            onClick={() => onToggleFavorite(songWork.id)}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="加入队列"
            onClick={() => onAddToQueue(songWork.id)}
          >
            <ListPlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="下一首播放"
            onClick={() => onAddNext(songWork.id)}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <PlaylistPicker songWorkId={songWork.id} songWorkTitle={songWork.title} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => onPlayBest()}>
          <Play className="mr-1 h-4 w-4" />
          播放最佳来源
        </Button>
        <span className="text-xs text-muted-foreground">{totalSources} 个来源</span>
      </div>

      <div className="mt-2 space-y-2">
        {recordings.map((rec) => (
          <div key={rec.recording.id}>
            {recordings.length > 1 && (
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {rec.recording.performers ?? rec.recording.versionType ?? '版本'}
                {rec.recording.durationSec != null && (
                  <span className="ml-1 tabular-nums">· {formatDuration(rec.recording.durationSec)}</span>
                )}
              </div>
            )}
            <div className="space-y-0.5">
              {rec.sourceItems.map((si) => (
                <div
                  key={si.id}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <button
                    type="button"
                    title={`播放 · ${si.publisher ?? si.externalId}`}
                    className="flex flex-1 items-center gap-2 overflow-hidden"
                    onClick={() => onPlay(si)}
                  >
                    <Play className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SourceBadge source={si.source} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {si.publisher ?? si.externalId}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatDuration(rec.recording.durationSec)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    title="加入该来源到队列"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToQueue(songWork.id, si.id);
                    }}
                  >
                    <ListPlus className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
