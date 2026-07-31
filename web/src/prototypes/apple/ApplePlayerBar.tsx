import { useEffect, useRef, useState } from 'react';
import {
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import type { SongWork } from '@/lib/api/types';

import './apple-theme.css';

interface ApplePlayerBarProps {
  /** Override the currently-playing song for preview purposes. */
  song?: SongWork | null;
  /** Playback status for preview. */
  initialPaused?: boolean;
  /** Duration in seconds (mock). */
  durationSec?: number;
  /** Expand/collapse large player state. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const MOCK_SONG: SongWork = {
  id: 'apple-mock-1',
  title: 'Blinding Lights',
  artists: 'The Weeknd',
  language: 'en',
  year: 2020,
};

/**
 * Apple-style translucent bottom player bar.
 * Uses glass material, spring-press feedback, and a mock progress loop.
 */
export function ApplePlayerBar({
  song = MOCK_SONG,
  initialPaused = false,
  durationSec = 200,
  expanded = false,
  onToggleExpand,
}: ApplePlayerBarProps) {
  const [isPaused, setIsPaused] = useState(initialPaused);
  const [positionSec, setPositionSec] = useState(48);
  const [volume, setVolume] = useState(0.72);
  const [liked, setLiked] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaused) return;

    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setPositionSec((p) => {
        const next = p + delta;
        return next >= durationSec ? 0 : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, durationSec]);

  const progress = durationSec ? Math.min(100, (positionSec / durationSec) * 100) : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || !durationSec) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPositionSec(ratio * durationSec);
  };

  return (
    <div
      className={`apple-theme fixed inset-x-0 z-50 transition-transform duration-500 apple-ease-smooth ${
        expanded ? 'bottom-0 top-0' : 'bottom-0'
      }`}
    >
      {/* Expanded player sheet */}
      {expanded && (
        <div
          className="absolute inset-0 bg-black/25 backdrop-blur-sm"
          onClick={onToggleExpand}
          aria-hidden="true"
        />
      )}

      <div
        className={`apple-glass-strong absolute flex flex-col overflow-hidden bg-card/80 text-card-foreground ${
          expanded ? 'inset-x-4 bottom-4 top-16 rounded-[2rem]' : 'inset-x-0 bottom-0 rounded-t-[1.5rem]'
        }`}
      >
        {/* Collapsed bar */}
        {!expanded && (
          <div className="relative flex items-center gap-3 px-4 py-3">
            {/* Mini artwork */}
            <button
              type="button"
              onClick={onToggleExpand}
              className="apple-press relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-rose-400 to-orange-300 shadow-md"
              aria-label="展开播放器"
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                ♪
              </span>
            </button>

            {/* Progress as thin top accent */}
            <div
              ref={progressRef}
              className="absolute inset-x-0 top-0 h-[2px] cursor-pointer bg-muted"
              onClick={handleSeek}
              role="slider"
              aria-label="进度"
              aria-valuemin={0}
              aria-valuemax={durationSec}
              aria-valuenow={Math.round(positionSec)}
            >
              <div
                className="apple-progress-fill h-full rounded-none"
                style={{ width: `${progress}%` }}
              />
            </div>

            <button
              type="button"
              onClick={onToggleExpand}
              className="min-w-0 flex-1 text-left apple-press"
            >
              <div className="truncate apple-typo-body font-semibold">{song?.title ?? '…'}</div>
              <div className="truncate text-xs text-muted-foreground">{song?.artists}</div>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`apple-btn flex h-9 w-9 items-center justify-center rounded-full ${
                  liked ? 'text-primary' : 'text-muted-foreground'
                }`}
                onClick={() => setLiked((v) => !v)}
                aria-label={liked ? '取消喜欢' : '喜欢'}
              >
                <Heart className={`h-[18px] w-[18px] ${liked ? 'fill-current' : ''}`} />
              </button>

              <button
                type="button"
                className="apple-btn flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                onClick={() => setIsPaused((v) => !v)}
                aria-label={isPaused ? '播放' : '暂停'}
              >
                {isPaused ? (
                  <Play className="h-5 w-5 fill-current" />
                ) : (
                  <Pause className="h-5 w-5 fill-current" />
                )}
              </button>

              <button
                type="button"
                className="apple-btn flex h-9 w-9 items-center justify-center rounded-full text-foreground"
                aria-label="下一首"
              >
                <SkipForward className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        )}

        {/* Expanded sheet content */}
        {expanded && (
          <div className="flex flex-1 flex-col items-center justify-between px-6 py-8">
            <button
              type="button"
              onClick={onToggleExpand}
              className="apple-press h-1.5 w-12 rounded-full bg-muted"
              aria-label="收起"
            />

            <div className="flex w-full flex-1 items-center justify-center">
              <div className="relative aspect-square w-full max-w-[18rem] overflow-hidden rounded-[2rem] bg-gradient-to-br from-rose-400 via-orange-300 to-amber-200 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-tr from-black/10 to-transparent" />
              </div>
            </div>

            <div className="w-full space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="apple-typo-headline truncate">{song?.title}</div>
                  <div className="text-sm text-muted-foreground">{song?.artists}</div>
                </div>
                <button
                  type="button"
                  className={`apple-btn flex h-10 w-10 items-center justify-center ${
                    liked ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setLiked((v) => !v)}
                >
                  <Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="space-y-1.5">
                <div
                  ref={progressRef}
                  className="apple-progress-track h-1 bg-muted"
                  onClick={handleSeek}
                  role="slider"
                  aria-label="进度"
                  aria-valuemin={0}
                  aria-valuemax={durationSec}
                  aria-valuenow={Math.round(positionSec)}
                >
                  <div className="apple-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
                  <span>{formatDuration(positionSec)}</span>
                  <span>{formatDuration(durationSec)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button type="button" className="apple-btn p-2 text-muted-foreground" aria-label="随机">
                  <Shuffle className="h-5 w-5" />
                </button>
                <button type="button" className="apple-btn p-2 text-foreground" aria-label="上一首">
                  <SkipBack className="h-7 w-7 fill-current" />
                </button>
                <button
                  type="button"
                  className="apple-btn flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                  onClick={() => setIsPaused((v) => !v)}
                >
                  {isPaused ? (
                    <Play className="h-8 w-8 fill-current" />
                  ) : (
                    <Pause className="h-8 w-8 fill-current" />
                  )}
                </button>
                <button type="button" className="apple-btn p-2 text-foreground" aria-label="下一首">
                  <SkipForward className="h-7 w-7 fill-current" />
                </button>
                <button type="button" className="apple-btn p-2 text-muted-foreground" aria-label="循环">
                  <Repeat className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center gap-3 text-muted-foreground">
                <Volume2 className="h-4 w-4" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-primary"
                />
              </div>

              <button
                type="button"
                className="apple-btn mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-semibold text-secondary-foreground"
              >
                <ListMusic className="h-4 w-4" />
                查看播放队列
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
