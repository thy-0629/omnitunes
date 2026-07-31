import { useEffect, useState } from 'react';
import { Heart, ListPlus, MoreHorizontal, Music, Play, Search, SkipForward, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PlaylistPicker } from '@/components/PlaylistPicker';
import { useSearchStore } from '@/stores/search';
import { usePlayerStore } from '@/stores/player';
import { useQueueStore } from '@/stores/queue';
import { addCollection, getCollections, removeCollection } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import type { SearchResultGroup, SourceId, SourceItem } from '@/lib/api/types';

const SOURCE_FILTERS: Array<{ id: SourceId; label: string }> = [
  { id: 'bilibili', label: 'B站' },
  { id: 'open_source', label: 'Archive' },
  { id: 'local', label: '本地' },
];

function sourceLabel(source: SourceId) {
  switch (source) {
    case 'bilibili':
      return 'B站';
    case 'open_source':
      return 'Archive';
    case 'local':
      return '本地';
    case 'youtube':
      return 'YouTube';
    case 'mock':
      return 'Mock';
    default:
      return source;
  }
}

function sourceTone(source: SourceId) {
  switch (source) {
    case 'bilibili':
      return 'bg-pink-500/90 text-white';
    case 'open_source':
      return 'bg-emerald-600/90 text-white';
    case 'local':
      return 'bg-sky-600/90 text-white';
    case 'youtube':
      return 'bg-red-600/90 text-white';
    case 'mock':
      return 'bg-zinc-500/90 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function SearchPage() {
  const { query, result, loading, error, setQuery, toggleSource, runSearch, sources } =
    useSearchStore();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCollections()
      .then((c) => setFavorites(new Set(c.items.map((i) => i.songWorkId))))
      .catch(() => {});
  }, [result]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      void runSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const toggleFavorite = async (songWorkId: string) => {
    try {
      if (favorites.has(songWorkId)) {
        await removeCollection(songWorkId);
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(songWorkId);
          return next;
        });
      } else {
        await addCollection(songWorkId);
        setFavorites((prev) => new Set(prev).add(songWorkId));
      }
    } catch {
      // 409 / network — leave UI as-is
    }
  };

  const handlePlaySourceItem = (group: SearchResultGroup, si: SourceItem) => {
    void usePlayerStore.getState().playSourceItem(si.id, {
      id: group.songWork.id,
      title: group.songWork.title,
      artists: group.songWork.artists,
    });
  };

  const handleAddToQueue = (group: SearchResultGroup, sourceItemId?: string) => {
    void useQueueStore.getState().add(group.songWork, sourceItemId);
  };

  const handleAddNext = (group: SearchResultGroup, sourceItemId?: string) => {
    void useQueueStore.getState().insertNext(group.songWork, sourceItemId);
  };

  const results = result?.results ?? [];
  const playerSongWorkId = usePlayerStore((s) => s.songWork?.id);

  return (
    <div className="mx-auto max-w-2xl py-4">
      {/* Floating translucent search header */}
      <header className="sticky top-[4.5rem] z-30">
        <div className="apple-glass relative flex flex-col gap-3 rounded-[1.75rem] p-3">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索歌曲、歌手、专辑…"
              className="h-12 w-full rounded-2xl border border-input bg-secondary/60 pl-12 pr-10 text-[17px] text-foreground outline-none ring-primary placeholder:text-muted-foreground focus:bg-card focus:ring-2"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="apple-press absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label="清空"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-medium text-muted-foreground">音源</span>
            {SOURCE_FILTERS.map(({ id, label }) => {
              const active = sources === undefined || sources.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSource(id)}
                  className={`apple-btn h-7 px-3 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="pt-6">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            找到 <span className="font-semibold text-foreground">{result ? results.length : 0}</span> 首歌曲
          </span>
          {result && result.meta?.latencyMs != null && (
            <span className="text-xs">{result.meta.latencyMs}ms</span>
          )}
        </div>

        {error && <div className="mt-4 text-sm text-destructive">{error}</div>}

        {result && result.errors.length > 0 && (
          <div className="mt-4 rounded-[1.25rem] border border-yellow-600/40 bg-yellow-600/10 px-3 py-2 text-xs">
            {result.errors.map((e) => (
              <div key={e.source}>
                {e.source} 暂不可用：{e.message}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-[1.25rem]" />)}

          {!loading && result && results.length === 0 && (
            <div className="apple-card py-12 text-center">
              <p className="text-sm text-muted-foreground">
                没有找到「{result.query}」相关的结果
              </p>
              <p className="mt-1 text-xs text-muted-foreground">可以尝试简化关键词，或切换音源后重试</p>
            </div>
          )}

          {!loading &&
            results.map((group) => {
              const isFavorite = favorites.has(group.songWork.id);
              const isPlaying = playerSongWorkId === group.songWork.id;

              return (
                <article
                  key={group.songWork.id}
                  className="apple-card apple-card-interactive relative overflow-hidden p-4"
                >
                  <div className="flex items-center gap-4">
                    {/* Artwork */}
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-300 to-orange-200 text-lg font-bold text-white shadow-sm">
                      <Music className="h-6 w-6 opacity-90" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[17px] font-semibold leading-tight">
                          {group.songWork.title}
                        </h2>
                        {isPlaying && (
                          <span className="relative flex h-2 w-2 rounded-full bg-primary">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {group.songWork.artists}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {group.recordings.flatMap((r) =>
                          r.sourceItems.map((si) => (
                            <span
                              key={si.id}
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${sourceTone(
                                si.source,
                              )}`}
                            >
                              {sourceLabel(si.source)}
                            </span>
                          )),
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className={`apple-btn h-9 w-9 rounded-full ${
                          isFavorite ? 'text-primary' : 'text-muted-foreground'
                        }`}
                        onClick={() => toggleFavorite(group.songWork.id)}
                        aria-label={isFavorite ? '取消收藏' : '收藏'}
                      >
                        <Heart className={`h-[18px] w-[18px] ${isFavorite ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        className="apple-btn flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        onClick={() =>
                          void usePlayerStore.getState().playSongWork(group.songWork)
                        }
                        aria-label="播放"
                      >
                        <Play className="h-[18px] w-[18px] fill-current" />
                      </button>
                      <PlaylistPicker songWorkId={group.songWork.id} songWorkTitle={group.songWork.title}>
                        <MoreHorizontal className="h-[18px] w-[18px]" />
                      </PlaylistPicker>
                    </div>
                  </div>

                  {/* Source list */}
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                    {group.recordings.map((rec) => (
                      <div key={rec.recording.id}>
                        {group.recordings.length > 1 && (
                          <div className="mb-1 text-xs font-medium text-muted-foreground">
                            {rec.recording.album ?? rec.recording.versionType}
                          </div>
                        )}
                        {rec.sourceItems.map((si) => (
                          <div
                            key={si.id}
                            className="apple-press flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-accent"
                          >
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                              onClick={() => handlePlaySourceItem(group, si)}
                            >
                              <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceTone(
                                  si.source,
                                )}`}
                              >
                                {sourceLabel(si.source)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {si.publisher ?? si.externalId}
                              </span>
                              {rec.recording.durationSec != null && (
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {formatDuration(rec.recording.durationSec)}
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="apple-btn rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                              onClick={() => handleAddToQueue(group, si.id)}
                              aria-label="加入队列"
                            >
                              <ListPlus className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="apple-btn rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                              onClick={() => handleAddNext(group, si.id)}
                              aria-label="下一首播放"
                            >
                              <SkipForward className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
        </div>
      </main>
    </div>
  );
}
