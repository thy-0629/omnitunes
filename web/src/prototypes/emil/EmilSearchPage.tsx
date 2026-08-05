import { useEffect, useMemo, useState } from 'react';
import {
  Heart,
  ListPlus,
  ListChecks,
  Loader2,
  Play,
  Search as SearchIcon,
  X,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import type {
  SearchResultGroup,
  SourceId,
  SourceItem,
  UnifiedSearchResult,
} from '@/lib/api/types';
import './emil-theme.css';

const SOURCE_FILTERS: Array<{ id: SourceId; label: string }> = [
  { id: 'bilibili', label: 'B站' },
  { id: 'open_source', label: 'Archive' },
  { id: 'local', label: '本地' },
];

const SOURCE_META: Record<SourceId, { label: string; colorClass: string }> = {
  bilibili: { label: 'B站', colorClass: 'bg-pink-500 text-white' },
  open_source: { label: 'Archive', colorClass: 'bg-emerald-600 text-white' },
  local: { label: '本地', colorClass: 'bg-sky-600 text-white' },
  youtube: { label: 'YouTube', colorClass: 'bg-red-600 text-white' },
  mock: { label: 'Mock', colorClass: 'bg-zinc-500 text-white' },
};

const MOCK_RESULT: UnifiedSearchResult = {
  query: '陈奕迅',
  totalSongWorks: 3,
  results: [
    {
      songWork: { id: 'sw-1', title: '十年', artists: '陈奕迅', year: 2003 },
      recordings: [
        {
          recording: {
            id: 'rec-1',
            songWorkId: 'sw-1',
            versionType: 'studio',
            durationSec: 206,
            performers: '陈奕迅',
            album: '黑·白·灰',
          },
          sourceItems: [
            {
              id: 'si-1-1',
              recordingId: 'rec-1',
              source: 'bilibili',
              externalId: 'BV1xxx',
              publisher: null,
              url: null,
              thumbnailUrl: null,
              qualityMetadata: null,
            },
            {
              id: 'si-1-2',
              recordingId: 'rec-1',
              source: 'open_source',
              externalId: 'arch-1',
              publisher: null,
              url: null,
              thumbnailUrl: null,
              qualityMetadata: null,
            },
          ],
        },
      ],
    },
    {
      songWork: { id: 'sw-2', title: '浮夸', artists: '陈奕迅', year: 2005 },
      recordings: [
        {
          recording: {
            id: 'rec-2',
            songWorkId: 'sw-2',
            versionType: 'live',
            durationSec: 288,
            performers: '陈奕迅',
            album: 'U87',
          },
          sourceItems: [
            {
              id: 'si-2-1',
              recordingId: 'rec-2',
              source: 'bilibili',
              externalId: 'BV2yyy',
              publisher: null,
              url: null,
              thumbnailUrl: null,
              qualityMetadata: null,
            },
          ],
        },
      ],
    },
    {
      songWork: { id: 'sw-3', title: 'K歌之王', artists: '陈奕迅', year: 2000 },
      recordings: [
        {
          recording: {
            id: 'rec-3',
            songWorkId: 'sw-3',
            versionType: 'studio',
            durationSec: 235,
            performers: '陈奕迅',
            album: '打得火热',
          },
          sourceItems: [
            {
              id: 'si-3-1',
              recordingId: 'rec-3',
              source: 'open_source',
              externalId: 'arch-3',
              publisher: null,
              url: null,
              thumbnailUrl: null,
              qualityMetadata: null,
            },
            {
              id: 'si-3-2',
              recordingId: 'rec-3',
              source: 'local',
              externalId: 'local-3',
              publisher: null,
              url: null,
              thumbnailUrl: null,
              qualityMetadata: null,
            },
          ],
        },
      ],
    },
  ],
  errors: [],
  meta: {
    searchedAt: Date.now(),
    sourcesQueried: ['bilibili', 'open_source', 'local'],
    latencyMs: 128,
  },
};

function useSearch() {
  const [query, setQuery] = useState('陈奕迅');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnifiedSearchResult | null>(MOCK_RESULT);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      setLoading(false);
      if (trimmed === 'error') {
        setError('模拟错误：请检查网络或切换音源后重试');
        setResult(null);
      } else {
        setResult({ ...MOCK_RESULT, query: trimmed });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  return { query, setQuery, loading, error, result };
}

function ResultCard({
  group,
  index,
  isFavorite,
  onToggleFavorite,
  onPlay,
  onPlayBest,
  onAddToQueue,
  justAdded,
}: {
  group: SearchResultGroup;
  index: number;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onPlay: (sourceItem: SourceItem) => void;
  onPlayBest: () => void;
  onAddToQueue: (sourceItem?: SourceItem) => void;
  justAdded: string | null;
}) {
  const { songWork, recordings } = group;
  const primary = recordings[0]?.recording;
  const sources = useMemo(
    () => recordings.flatMap((r) => r.sourceItems.map((si) => si.source)),
    [recordings],
  );
  const uniqueSources = Array.from(new Set(sources));
  const duration = primary?.durationSec ?? null;
  const isAdded = justAdded === songWork.id;

  return (
    <div className="emil-card group flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
      <button
        type="button"
        onClick={onPlayBest}
        className="emil-surface emil-icon-btn relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-primary text-primary-foreground sm:h-14 sm:w-14"
        aria-label={`播放 ${songWork.title}`}
      >
        <span className="text-sm font-semibold tabular-nums group-hover:opacity-0 sm:text-base">
          {String(index + 1).padStart(2, '0')}
        </span>
        <Play className="absolute h-5 w-5 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 sm:h-6 sm:w-6" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground sm:text-base">
              {songWork.title}
            </h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {songWork.artists}
              {primary?.album && ` · ${primary.album}`}
              {songWork.year && ` · ${songWork.year}`}
            </p>
          </div>
          <div className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
            {formatDuration(duration)}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {uniqueSources.map((source) => {
            const meta = SOURCE_META[source];
            return (
              <span
                key={source}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.colorClass}`}
              >
                {meta.label}
              </span>
            );
          })}
          <span className="text-xs text-muted-foreground sm:hidden">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPlayBest()}
            className="emil-surface inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Play className="h-3.5 w-3.5" />
            播放
          </button>

          {recordings.flatMap((r) => r.sourceItems).map((si) => (
            <button
              key={si.id}
              type="button"
              onClick={() => onPlay(si)}
              className="emil-pill border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
              title={`从 ${SOURCE_META[si.source].label} 播放`}
            >
              {SOURCE_META[si.source].label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onAddToQueue()}
            className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="加入队列"
            aria-label="加入队列"
          >
            {isAdded ? (
              <ListChecks className="h-4 w-4 text-emerald-600" />
            ) : (
              <ListPlus className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleFavorite(songWork.id)}
            className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title={isFavorite ? '取消喜欢' : '喜欢'}
            aria-label={isFavorite ? '取消喜欢' : '喜欢'}
          >
            <Heart
              className={`h-4 w-4 transition-colors duration-150 ${
                isFavorite ? 'fill-red-500 text-red-500' : ''
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmilSearchPage() {
  const { query, setQuery, loading, error, result } = useSearch();
  const [sources, setSources] = useState<SourceId[]>(['bilibili', 'open_source', 'local']);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const toggleSource = (id: SourceId) => {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToQueue = (id: string) => {
    setJustAdded(id);
    const timer = setTimeout(() => {
      setJustAdded((current) => (current === id ? null : current));
    }, 1200);
    return () => clearTimeout(timer);
  };

  const filtered = useMemo(() => {
    if (!result) return null;
    return {
      ...result,
      results: result.results.filter((group) =>
        group.recordings.some((r) =>
          r.sourceItems.some((si) => sources.includes(si.source)),
        ),
      ),
    };
  }, [result, sources]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">搜索</h1>
        <p className="mt-1 text-sm text-muted-foreground">输入歌名、歌手或专辑名</p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(query);
        }}
      >
        <div className="relative flex flex-1 items-center overflow-hidden rounded-full border border-input bg-card px-1 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring">
          <SearchIcon className="pointer-events-none ml-3 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入歌名、歌手…"
            className="h-11 flex-1 bg-transparent px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="emil-surface emil-icon-btn mr-1 h-8 w-8 text-muted-foreground"
              aria-label="清空"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="emil-surface inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
          <span className="hidden sm:inline">搜索</span>
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">音源：</span>
        {SOURCE_FILTERS.map(({ id, label }) => {
          const active = sources.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleSource(id)}
              className={`emil-pill ${
                active
                  ? 'bg-secondary text-secondary-foreground'
                  : 'border border-border bg-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered && !loading && (
        <div className="mt-3 text-xs text-muted-foreground">
          共 {filtered.results.length} 首歌曲
          {filtered.meta?.latencyMs != null && ` · ${filtered.meta.latencyMs}ms`}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-yellow-600/30 bg-yellow-600/10 px-4 py-3 text-xs text-yellow-700 dark:text-yellow-400">
          {result.errors.map((e) => (
            <div key={e.source}>
              {e.source} 暂不可用：{e.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="emil-card h-28 w-full animate-pulse bg-muted/50"
              aria-hidden="true"
            />
          ))}

        {!loading && filtered && filtered.results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-sm font-medium">没有找到「{filtered.query}」相关的结果</p>
            <p className="mt-1 text-xs text-muted-foreground">
              可以尝试简化关键词，或切换音源后重试
            </p>
          </div>
        )}

        {!loading && filtered && (
          <div className="emil-list-enter space-y-3">
            {filtered.results.map((group, index) => (
              <ResultCard
                key={group.songWork.id}
                group={group}
                index={index}
                isFavorite={favorites.has(group.songWork.id)}
                onToggleFavorite={toggleFavorite}
                onPlay={() => {}}
                onPlayBest={() => {}}
                onAddToQueue={() => handleAddToQueue(group.songWork.id)}
                justAdded={justAdded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
