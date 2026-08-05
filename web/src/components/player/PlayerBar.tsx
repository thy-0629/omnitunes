import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { addCollection, getCollections, removeCollection } from '@/lib/api';
import { usePlayerStore } from '@/stores/player';

export function PlayerBar() {
  const {
    songWork,
    option,
    status,
    error,
    positionSec,
    durationSec,
    isPaused,
    volume,
    isMuted,
    videoVisible,
    togglePause,
    tryFallback,
    requestSeek,
    setVolume,
    toggleMuted,
    endCurrent,
    playNextFromQueue,
    showVideo,
  } = usePlayerStore();
  const progressRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!songWork) {
      setLiked(false);
      return;
    }
    getCollections()
      .then((c) => setLiked(c.items.some((i) => i.songWorkId === songWork.id)))
      .catch(() => setLiked(false));
  }, [songWork?.id]);

  if (status === 'idle') return null;

  const isEmbed = option?.option.type === 'embed';
  const progress = durationSec ? Math.min(100, (positionSec / durationSec) * 100) : 0;
  const canTogglePause = !isEmbed && status !== 'resolving';

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEmbed || !durationSec) return;
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    requestSeek(ratio);
  };

  const handleLike = async () => {
    if (!songWork) return;
    try {
      if (liked) {
        await removeCollection(songWork.id);
        setLiked(false);
      } else {
        await addCollection(songWork.id);
        setLiked(true);
      }
    } catch {
      // ignore
    }
  };

  const handleToggleExpand = () => setExpanded((v) => !v);

  return (
    <div
      className={`fixed inset-x-0 z-50 transition-transform duration-500 apple-ease-smooth ${
        expanded ? 'bottom-0 top-0' : 'bottom-0'
      }`}
    >
      {/* Expanded scrim */}
      {expanded && (
        <div
          className="absolute inset-0 bg-black/25 backdrop-blur-sm"
          onClick={handleToggleExpand}
          aria-hidden="true"
        />
      )}

      <div
        className={`apple-glass-strong absolute flex flex-col overflow-hidden text-card-foreground ${
          expanded ? 'inset-x-4 bottom-4 top-16 rounded-[2rem]' : 'inset-x-0 bottom-0 rounded-t-[1.5rem]'
        }`}
      >
        {/* Collapsed bar */}
        {!expanded && (
          <div className="relative flex items-center gap-3 px-4 py-3">
            {/* Mini artwork */}
            <button
              type="button"
              onClick={handleToggleExpand}
              className="apple-press relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-rose-400 to-orange-300 shadow-md"
              aria-label="展开播放器"
            >
              <span className="absolute inset-0 flex items-center justify-center text-white/90">
                <Music className="h-5 w-5" />
              </span>
            </button>

            {/* Progress as thin top accent */}
            {!isEmbed && (
              <div
                ref={progressRef}
                className="absolute inset-x-0 top-0 h-[2px] cursor-pointer bg-muted"
                onClick={handleSeek}
                title="点击跳转进度"
              >
                <div
                  className="apple-progress-fill h-full rounded-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleToggleExpand}
              className="min-w-0 flex-1 text-left apple-press"
            >
              <div className="truncate apple-typo-body font-semibold">
                {status === 'error' ? '播放失败' : (songWork?.title ?? '…')}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {status === 'error'
                  ? error
                  : isEmbed
                    ? '嵌入播放器没有可靠结束事件，请手动点下一首'
                    : songWork?.artists}
              </div>
            </button>

            <div className="flex items-center gap-1">
              {!isEmbed && (
                <button
                  type="button"
                  className={`apple-btn flex h-8 w-8 items-center justify-center rounded-full ${
                    isMuted || volume === 0 ? 'text-muted-foreground' : 'text-foreground'
                  }`}
                  onClick={() => toggleMuted()}
                  title={isMuted ? '取消静音' : '静音'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              )}

              {isEmbed && !videoVisible && (
                <button
                  type="button"
                  className="apple-btn rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
                  onClick={() => showVideo()}
                >
                  显示视频
                </button>
              )}

              <button
                type="button"
                className={`apple-btn flex h-9 w-9 items-center justify-center rounded-full ${
                  liked ? 'text-primary' : 'text-muted-foreground'
                }`}
                onClick={() => void handleLike()}
                aria-label={liked ? '取消喜欢' : '喜欢'}
              >
                <Heart className={`h-[18px] w-[18px] ${liked ? 'fill-current' : ''}`} />
              </button>

              {status === 'resolving' ? (
                <span className="flex h-10 w-10 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </span>
              ) : status === 'error' ? (
                <button
                  type="button"
                  className="apple-btn flex h-9 items-center gap-1 rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
                  onClick={() => void tryFallback('manual')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重试
                </button>
              ) : (
                <button
                  type="button"
                  className="apple-btn flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                  disabled={!canTogglePause}
                  title={isEmbed ? '播放/暂停在媒体控件内' : '播放/暂停'}
                  onClick={() => canTogglePause && togglePause()}
                >
                  {isPaused ? (
                    <Play className="h-5 w-5 fill-current" />
                  ) : (
                    <Pause className="h-5 w-5 fill-current" />
                  )}
                </button>
              )}

              <button
                type="button"
                className="apple-btn flex h-9 w-9 items-center justify-center rounded-full text-foreground"
                title="下一首"
                onClick={() => void playNextFromQueue()}
              >
                <SkipForward className="h-[18px] w-[18px]" />
              </button>

              <button
                type="button"
                className="apple-btn flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                title="停止"
                onClick={() => void endCurrent('skipped')}
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* Expanded sheet content */}
        {expanded && (
          <div className="flex flex-1 flex-col items-center justify-between px-6 py-8">
            <button
              type="button"
              onClick={handleToggleExpand}
              className="apple-press h-1.5 w-12 rounded-full bg-muted"
              aria-label="收起"
            />

            <div className="flex w-full flex-1 items-center justify-center">
              <div className="relative aspect-square w-full max-w-[18rem] overflow-hidden rounded-[2rem] bg-gradient-to-br from-rose-400 via-orange-300 to-amber-200 shadow-2xl">
                <div className="absolute inset-0 flex items-center justify-center text-white/90">
                  <Music className="h-20 w-20 opacity-80" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-tr from-black/10 to-transparent" />
              </div>
            </div>

            <div className="w-full space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="apple-typo-headline truncate">{songWork?.title}</div>
                  <div className="text-sm text-muted-foreground">{songWork?.artists}</div>
                </div>
                <button
                  type="button"
                  className={`apple-btn flex h-10 w-10 items-center justify-center ${
                    liked ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => void handleLike()}
                >
                  <Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="space-y-1.5">
                {!isEmbed ? (
                  <>
                    <div
                      ref={progressRef}
                      className="apple-progress-track h-1 bg-muted"
                      onClick={handleSeek}
                      role="slider"
                      aria-label="进度"
                      aria-valuemin={0}
                      aria-valuemax={durationSec ?? 0}
                      aria-valuenow={Math.round(positionSec)}
                    >
                      <div className="apple-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
                      <span>{formatDuration(positionSec)}</span>
                      <span>{formatDuration(durationSec)}</span>
                    </div>
                  </>
                ) : null}
              </div>

              {isEmbed && (
                <div className="text-center text-xs text-muted-foreground">
                  嵌入播放器没有可靠结束事件，请手动点下一首
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="apple-btn p-2 text-muted-foreground/50"
                  aria-label="随机"
                  disabled
                >
                  <Shuffle className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="apple-btn p-2 text-muted-foreground/50"
                  aria-label="上一首"
                  disabled
                >
                  <SkipBack className="h-7 w-7 fill-current" />
                </button>
                {status === 'resolving' ? (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </span>
                ) : status === 'error' ? (
                  <button
                    type="button"
                    className="apple-btn flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                    onClick={() => void tryFallback('manual')}
                  >
                    <RefreshCw className="h-8 w-8" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="apple-btn flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                    disabled={!canTogglePause}
                    onClick={() => canTogglePause && togglePause()}
                  >
                    {isPaused ? (
                      <Play className="h-8 w-8 fill-current" />
                    ) : (
                      <Pause className="h-8 w-8 fill-current" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="apple-btn p-2 text-foreground"
                  aria-label="下一首"
                  onClick={() => void playNextFromQueue()}
                >
                  <SkipForward className="h-7 w-7 fill-current" />
                </button>
                <button
                  type="button"
                  className="apple-btn p-2 text-muted-foreground/50"
                  aria-label="循环"
                  disabled
                >
                  <Repeat className="h-5 w-5" />
                </button>
              </div>

              {isEmbed && !videoVisible && (
                <button
                  type="button"
                  className="apple-btn mx-auto flex items-center justify-center rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
                  onClick={() => showVideo()}
                >
                  显示视频
                </button>
              )}

              {!isEmbed && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <button
                    type="button"
                    className="apple-btn"
                    onClick={() => toggleMuted()}
                    title={isMuted ? '取消静音' : '静音'}
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
                    step={0.02}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="h-1 flex-1 cursor-pointer accent-primary"
                  />
                </div>
              )}

              <button
                type="button"
                className="apple-btn mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-semibold text-secondary-foreground"
                onClick={() => {
                  setExpanded(false);
                  navigate('/queue');
                }}
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
