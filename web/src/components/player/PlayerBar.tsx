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
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteFeedback, setFavoriteFeedback] = useState<string | null>(null);
  const favoriteReadGeneration = useRef(0);
  const navigate = useNavigate();

  const refreshFavorite = async (songWorkId: string) => {
    const readGeneration = ++favoriteReadGeneration.current;
    try {
      const collections = await getCollections();
      if (
        readGeneration !== favoriteReadGeneration.current ||
        songWorkId !== usePlayerStore.getState().songWork?.id
      ) {
        return false;
      }
      setLiked(collections.items.some((item) => item.songWorkId === songWorkId));
      return true;
    } catch {
      if (
        readGeneration === favoriteReadGeneration.current &&
        songWorkId === usePlayerStore.getState().songWork?.id
      ) {
        setLiked(false);
      }
      return false;
    }
  };

  useEffect(() => {
    setLiked(false);
    setFavoriteFeedback(null);
    if (!songWork) {
      return;
    }
    void refreshFavorite(songWork.id);
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
    if (!songWork || favoritePending) return;
    const songWorkId = songWork.id;
    const shouldRemove = liked;
    setFavoritePending(true);
    setFavoriteFeedback(null);
    try {
      if (shouldRemove) {
        await removeCollection(songWorkId);
      } else {
        await addCollection(songWorkId);
      }
      if (songWorkId === usePlayerStore.getState().songWork?.id) {
        favoriteReadGeneration.current += 1;
        setLiked(!shouldRemove);
      }
    } catch (err) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
      const isActiveSong = songWorkId === usePlayerStore.getState().songWork?.id;
      if (isActiveSong && (status === 404 || status === 409)) {
        const refreshed = await refreshFavorite(songWorkId);
        if (songWorkId === usePlayerStore.getState().songWork?.id) {
          setFavoriteFeedback(refreshed ? '收藏状态已刷新' : '收藏状态刷新失败，请重试。');
        }
      } else if (isActiveSong) {
        setFavoriteFeedback('收藏操作失败，请重试。');
      }
    } finally {
      setFavoritePending(false);
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
                    ? '请显示视频并使用播放器内的播放/暂停控件。'
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
                  title="显示视频画面"
                  aria-pressed={!videoVisible}
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
                disabled={favoritePending}
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
              ) : isEmbed ? (
                <span className="px-2 text-xs text-muted-foreground" aria-label="请使用视频播放器内的播放暂停控件">
                  请使用视频播放器
                </span>
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
            {favoriteFeedback && (
              <p className="absolute bottom-0 left-0 right-0 text-center text-[11px] text-muted-foreground" role="status">
                {favoriteFeedback}
              </p>
            )}
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
                  disabled={favoritePending}
                  aria-label={liked ? '取消喜欢' : '喜欢'}
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
                  请显示视频并使用播放器内的播放/暂停控件。
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="apple-btn p-2 text-muted-foreground/50"
                  aria-label="随机（暂不支持）"
                  title="随机（暂不支持）"
                  disabled
                >
                  <Shuffle className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="apple-btn p-2 text-muted-foreground/50"
                  aria-label="上一首（暂不支持）"
                  title="上一首（暂不支持）"
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
                ) : isEmbed ? (
                  <span className="flex h-16 items-center px-2 text-center text-xs text-muted-foreground">
                    请使用视频播放器
                  </span>
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
                  aria-label="循环（暂不支持）"
                  title="循环（暂不支持）"
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
                  title="显示视频画面"
                  aria-pressed={!videoVisible}
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

              {favoriteFeedback && (
                <p className="text-center text-xs text-muted-foreground" role="status">
                  {favoriteFeedback}
                </p>
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
