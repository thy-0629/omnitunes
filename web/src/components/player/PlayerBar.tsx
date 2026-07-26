import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SourceBadge } from '@/components/SourceBadge';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/player';

/** Persistent bottom player bar. */
export function PlayerBar() {
  const { songWork, option, status, error, positionSec, durationSec } = usePlayerStore();

  if (status === 'idle') return null;

  const isEmbed = option?.option.type === 'embed';
  const progress = durationSec ? Math.min(100, (positionSec / durationSec) * 100) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-card">
      {!isEmbed && (
        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          {status === 'error' ? (
            <div className="truncate text-sm text-destructive">{error}</div>
          ) : (
            <>
              <div className="truncate text-sm font-medium">{songWork?.title ?? '…'}</div>
              <div className="truncate text-xs text-muted-foreground">
                {songWork?.artists}
                {isEmbed && ' · 嵌入播放中（在播放器内控制进度）'}
              </div>
            </>
          )}
        </div>

        {option && <SourceBadge source={option.source} />}

        {!isEmbed && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatDuration(positionSec)} / {formatDuration(durationSec)}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          {status === 'resolving' ? (
            <span className="text-xs text-muted-foreground">解析中…</span>
          ) : (
            <>
              <Button variant="ghost" size="icon" disabled title="播放/暂停在媒体控件内">
                {status === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="下一首"
                onClick={() => void usePlayerStore.getState().playNextFromQueue()}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="停止"
                onClick={() => {
                  void usePlayerStore.getState().endCurrent('skipped');
                }}
              >
                <Square className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
