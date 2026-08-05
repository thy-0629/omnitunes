import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import type { SourceId } from '@/lib/api/types';
import './emil-theme.css';

type PlayerStatus = 'idle' | 'resolving' | 'playing' | 'paused' | 'error';

interface EmilPlayerBarProps {
  status?: PlayerStatus;
  title?: string;
  artists?: string;
  source?: SourceId;
  durationSec?: number;
  initialPositionSec?: number;
  error?: string | null;
}

const SOURCE_META: Record<SourceId, { label: string; colorClass: string }> = {
  bilibili: { label: 'B站', colorClass: 'bg-pink-500 text-white' },
  open_source: { label: 'Archive', colorClass: 'bg-emerald-600 text-white' },
  openverse: { label: 'Openverse', colorClass: 'bg-violet-600 text-white' },
  wikimedia: { label: 'Commons', colorClass: 'bg-cyan-700 text-white' },
  local: { label: '本地', colorClass: 'bg-sky-600 text-white' },
  youtube: { label: 'YouTube', colorClass: 'bg-red-600 text-white' },
  mock: { label: 'Mock', colorClass: 'bg-zinc-500 text-white' },
};

export function EmilPlayerBar({
  status: initialStatus = 'playing',
  title = '十年',
  artists = '陈奕迅',
  source = 'bilibili',
  durationSec = 206,
  initialPositionSec = 42,
  error: initialError = null,
}: EmilPlayerBarProps) {
  const [status, setStatus] = useState<PlayerStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [position, setPosition] = useState(initialPositionSec);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== 'playing') return;
    const id = setInterval(() => {
      setPosition((prev) => {
        if (prev >= durationSec) {
          setStatus('paused');
          return durationSec;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, durationSec]);

  const progress = durationSec ? Math.min(100, (position / durationSec) * 100) : 0;
  const canTogglePause = status !== 'resolving';

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationSec) return;
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPosition(Math.round(ratio * durationSec));
  };

  const handleTogglePause = () => {
    if (!canTogglePause) return;
    setStatus((prev) => (prev === 'playing' ? 'paused' : 'playing'));
  };

  const handleRetry = () => {
    setError(null);
    setStatus('resolving');
    setTimeout(() => setStatus('playing'), 900);
  };

  const handleNext = () => {
    setPosition(0);
    if (status !== 'playing' && status !== 'paused') setStatus('playing');
  };

  const handleStop = () => {
    setStatus('idle');
    setPosition(0);
  };

  if (status === 'idle' && !error) return null;

  const isResolving = status === 'resolving';
  const isPlaying = status === 'playing';
  const sourceMeta = SOURCE_META[source];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card" style={{ boxShadow: 'var(--shadow-player)' }}>
      <div
        ref={progressRef}
        className="emil-progress-track h-1.5 rounded-none"
        onClick={handleSeek}
        title="点击跳转进度"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={durationSec}
        aria-valuenow={position}
        aria-label="播放进度"
      >
        <div className="emil-progress-fill" style={{ width: `${progress}%` }} />
        <div
          className="emil-progress-thumb"
          style={{ left: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {error ? (
            <div className="truncate text-sm text-destructive">{error}</div>
          ) : (
            <>
              <div className="truncate text-sm font-semibold tracking-[-0.01em]">{title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {artists}
                {isResolving && ' · 解析中'}
              </div>
            </>
          )}
        </div>

        <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex ${sourceMeta.colorClass}`}>
          {sourceMeta.label}
        </span>

        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
          {formatDuration(position)} / {formatDuration(durationSec)}
        </span>

        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground"
            aria-label={isMuted ? '取消静音' : '静音'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer accent-primary"
            aria-label="音量"
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {error ? (
            <button
              type="button"
              onClick={handleRetry}
              className="emil-surface inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-sm font-medium"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          ) : (
            <>
              {isResolving ? (
                <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  解析中…
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleTogglePause}
                  disabled={!canTogglePause}
                  className="emil-surface emil-icon-btn h-9 w-9 bg-primary text-primary-foreground disabled:opacity-50"
                  aria-label={isPlaying ? '暂停' : '播放'}
                >
                  {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="emil-surface emil-icon-btn h-9 w-9 text-muted-foreground"
                aria-label="下一首"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="emil-surface emil-icon-btn h-9 w-9 text-muted-foreground"
                aria-label="停止"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
