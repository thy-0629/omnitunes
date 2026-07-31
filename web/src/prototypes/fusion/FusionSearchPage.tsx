import { useMemo, useState } from 'react';
import { Heart, ListPlus, ListChecks, Play, Search, SkipForward, X } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import type { SearchResultGroup, SourceId, SourceItem } from '@/lib/api/types';
import './fusion-theme.css';

const SOURCE_FILTERS: Array<{ id: SourceId; label: string }> = [
  { id: 'bilibili', label: 'B站' },
  { id: 'open_source', label: 'Archive' },
  { id: 'local', label: '本地' },
];

const SOURCE_META: Record<SourceId, { label: string; tone: string }> = {
  bilibili: { label: 'B站', tone: 'bg-pink-500 text-white' },
  open_source: { label: 'Archive', tone: 'bg-emerald-600 text-white' },
  local: { label: '本地', tone: 'bg-sky-600 text-white' },
  youtube: { label: 'YouTube', tone: 'bg-red-600 text-white' },
  mock: { label: 'Mock', tone: 'bg-zinc-500 text-white' },
};

const MOCK_RESULTS: SearchResultGroup[] = [
  {
    songWork: { id: 'sw-1', title: '晴天', artists: '周杰伦', year: 2003 },
    recordings: [
      {
        recording: {
          id: 'rec-1',
          songWorkId: 'sw-1',
          versionType: 'studio',
          durationSec: 269,
          performers: '周杰伦',
          album: '叶惠美',
        },
        sourceItems: [
          { id: 'si-1', recordingId: 'rec-1', source: 'bilibili', externalId: 'BV1xx', publisher: '周杰伦音乐台', url: null, thumbnailUrl: null },
          { id: 'si-2', recordingId: 'rec-1', source: 'local', externalId: 'file-001', publisher: '本地曲库', url: null, thumbnailUrl: null },
        ],
      },
    ],
  },
  {
    songWork: { id: 'sw-2', title: '十年', artists: '陈奕迅', year: 2003 },
    recordings: [
      {
        recording: {
          id: 'rec-2',
          songWorkId: 'sw-2',
          versionType: 'studio',
          durationSec: 206,
          performers: '陈奕迅',
          album: '黑·白·灰',
        },
        sourceItems: [
          { id: 'si-3', recordingId: 'rec-2', source: 'bilibili', externalId: 'BV2yy', publisher: '陈奕迅频道', url: null, thumbnailUrl: null },
          { id: 'si-4', recordingId: 'rec-2', source: 'open_source', externalId: 'arch-1', publisher: 'Internet Archive', url: null, thumbnailUrl: null },
        ],
      },
    ],
  },
  {
    songWork: { id: 'sw-3', title: '夜曲', artists: '周杰伦', year: 2005 },
    recordings: [
      {
        recording: {
          id: 'rec-3',
          songWorkId: 'sw-3',
          versionType: 'studio',
          durationSec: 226,
          performers: '周杰伦',
          album: '十一月的萧邦',
        },
        sourceItems: [
          { id: 'si-5', recordingId: 'rec-3', source: 'bilibili', externalId: 'BV3zz', publisher: '杰威尔音乐', url: null, thumbnailUrl: null },
        ],
      },
    ],
  },
];

function ResultCard({
  group,
  index,
  isFavorite,
  isAdded,
  onToggleFavorite,
  onPlay,
  onPlayBest,
  onAddToQueue,
}: {
  group: SearchResultGroup;
  index: number;
  isFavorite: boolean;
  isAdded: boolean;
  onToggleFavorite: () => void;
  onPlay: (si: SourceItem) => void;
  onPlayBest: () => void;
  onAddToQueue: () => void;
}) {
  const { songWork, recordings } = group;
  const primary = recordings[0]?.recording;
  const sources = useMemo(
    () => recordings.flatMap((r) => r.sourceItems.map((si) => si.source)),
    [recordings],
  );
  const uniqueSources = Array.from(new Set(sources));
  const duration = primary?.durationSec ?? null;

  return (
    <div className="fusion-card group flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
      <button
        type="button"
        onClick={onPlayBest}
        className="fusion-surface relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground sm:h-14 sm:w-14"
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
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}
              >
                {meta.label}
              </span>
            );
          })}
          <span className="text-xs text-muted-foreground sm:hidden">{formatDuration(duration)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPlayBest}
            className="fusion-btn inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Play className="h-3.5 w-3.5" />
            播放
          </button>

          {recordings.flatMap((r) => r.sourceItems).map((si) => (
            <button
              key={si.id}
              type="button"
              onClick={() => onPlay(si)}
              className="fusion-pill border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
              title={`从 ${SOURCE_META[si.source].label} 播放`}
            >
              {SOURCE_META[si.source].label}
            </button>
          ))}

          <button
            type="button"
            onClick={onAddToQueue}
            className="fusion-icon-btn h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="加入队列"
            aria-label="加入队列"
          >
            {isAdded ? <ListChecks className="h-4 w-4 text-emerald-600" /> : <ListPlus className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleFavorite}
            className="fusion-icon-btn h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title={isFavorite ? '取消喜欢' : '喜欢'}
            aria-label={isFavorite ? '取消喜欢' : '喜欢'}
          >
            <Heart
              className={`h-4 w-4 transition-colors duration-150 ${
                isFavorite ? 'fill-red-500 text-red-500' : ''
              }`}
            />
          </button>

          <button
            type="button"
            className="fusion-icon-btn h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="下一首播放"
            aria-label="下一首播放"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function FusionSearchPage() {
  const [query, setQuery] = useState('晴天');
  const [sources, setSources] = useState<SourceId[]>(['bilibili', 'open_source', 'local']);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const toggleSource = (id: SourceId) => {
    setSources((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const filtered = useMemo(
    () =>
      MOCK_RESULTS.filter((group) =>
        group.recordings.some((r) => r.sourceItems.some((si) => sources.includes(si.source))),
      ),
    [sources],
  );

  const handleAddToQueue = (id: string) => {
    setJustAdded(id);
    setTimeout(() => {
      setJustAdded((current) => (current === id ? null : current));
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      {/* Floating glass search header — Apple chrome + Emil spacing */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="fusion-glass-strong relative mx-auto flex max-w-3xl flex-col gap-3 rounded-[1.75rem] p-3">
          <form className="relative" onSubmit={(e) => e.preventDefault()}>
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
                className="fusion-press absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label="清空"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-medium text-muted-foreground">音源</span>
            {SOURCE_FILTERS.map(({ id, label }) => {
              const active = sources.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSource(id)}
                  className={`fusion-pill h-7 px-3 text-xs font-semibold ${
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

      <main className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            找到 <span className="font-semibold text-foreground">{filtered.length}</span> 首歌曲
          </span>
          <span className="text-xs">124ms</span>
        </div>

        <div className="fusion-list-enter space-y-3">
          {filtered.map((group, index) => (
            <ResultCard
              key={group.songWork.id}
              group={group}
              index={index}
              isFavorite={favorites.has(group.songWork.id)}
              isAdded={justAdded === group.songWork.id}
              onToggleFavorite={() =>
                setFavorites((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.songWork.id)) next.delete(group.songWork.id);
                  else next.add(group.songWork.id);
                  return next;
                })
              }
              onPlay={() => {}}
              onPlayBest={() => {}}
              onAddToQueue={() => handleAddToQueue(group.songWork.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
