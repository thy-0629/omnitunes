import { useEffect, useRef, useState } from 'react';
import { Heart, ListMusic, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { SongWork } from '@/lib/api/types';
import './fusion-theme.css';

interface FusionPlayerBarProps {
  song?: SongWork | null;
  initialPaused?: boolean;
  durationSec?: number;
}

const MOCK_SONG: SongWork = {
  id: 'fusion-mock-1',
  title: '晴天',
  artists: '周杰伦',
};

export function FusionPlayerBar({
  song = MOCK_SONG,
  initialPaused = false,
  durationSec = 269,
}: FusionPlayerBarProps) {
  const [isPaused, setIsPaused] = useState(initialPaused);
  const [positionSec, setPositionSec] = useState(48);
  const [liked, setLiked] = useState(false);
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
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPositionSec(ratio * durationSec);
  };

  return (
    <div className="fusion-glass-strong fixed inset-x-0 bottom-0 z-50 rounded-t-[1.5rem]">
      <div className="relative flex items-center gap-3 px-4 py-3">
        {/* Progress as thin top accent */}
        <div
          className="fusion-progress-track absolute inset-x-0 top-0 h-[2px] rounded-none"
          onClick={handleSeek}
          role="slider"
          aria-label="进度"
          aria-valuemin={0}
          aria-valuemax={durationSec}
          aria-valuenow={Math.round(positionSec)}
        >
          <div className="fusion-progress-fill rounded-none" style={{ width: `${progress}%` }} />
        </div>

        {/* Mini artwork */}
        <button
          type="button"
          className="fusion-press relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-orange-400 shadow-md"
          aria-label="展开播放器"
        >
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">♪</span>
        </button>

        <button type="button" className="min-w-0 flex-1 text-left fusion-press">
          <div className="truncate fusion-body font-semibold">{song?.title ?? '…'}</div>
          <div className="truncate text-xs text-muted-foreground">{song?.artists}</div>
        </button>

        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            className="fusion-icon-btn h-8 w-8 text-muted-foreground"
            aria-label="上一首"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>

          <button
            type="button"
            className="fusion-btn flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
            onClick={() => setIsPaused((v) => !v)}
            aria-label={isPaused ? '播放' : '暂停'}
          >
            {isPaused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
          </button>

          <button
            type="button"
            className="fusion-icon-btn h-8 w-8 text-foreground"
            aria-label="下一首"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>

        <button
          type="button"
          className={`fusion-icon-btn h-9 w-9 ${liked ? 'text-primary' : 'text-muted-foreground'}`}
          onClick={() => setLiked((v) => !v)}
          aria-label={liked ? '取消喜欢' : '喜欢'}
        >
          <Heart className={`h-[18px] w-[18px] ${liked ? 'fill-current' : ''}`} />
        </button>

        <button type="button" className="fusion-icon-btn h-9 w-9 text-muted-foreground" aria-label="队列">
          <ListMusic className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
