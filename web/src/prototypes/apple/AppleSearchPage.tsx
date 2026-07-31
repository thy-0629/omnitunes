import { useMemo, useState } from 'react';
import {
  Heart,
  ListPlus,
  MoreHorizontal,
  Play,
  Search,
  SkipForward,
  X,
} from 'lucide-react';
import type { SearchResultGroup, SourceId } from '@/lib/api/types';

import './apple-theme.css';

const SOURCE_FILTERS: Array<{ id: SourceId; label: string }> = [
  { id: 'bilibili', label: 'B站' },
  { id: 'open_source', label: 'Archive' },
  { id: 'local', label: '本地' },
];

const MOCK_RESULTS: SearchResultGroup[] = [
  {
    songWork: {
      id: 'sw-1',
      title: '晴天',
      artists: '周杰伦',
      language: 'zh',
      year: 2003,
    },
    recordings: [
      {
        recording: {
          id: 'rec-1',
          songWorkId: 'sw-1',
          versionType: 'album',
          durationSec: 269,
          performers: '周杰伦',
          album: '叶惠美',
        },
        sourceItems: [
          {
            id: 'si-1',
            recordingId: 'rec-1',
            source: 'bilibili',
            externalId: 'BV1xx411c7mD',
            publisher: '周杰伦音乐台',
            url: null,
            thumbnailUrl: null,
          },
          {
            id: 'si-2',
            recordingId: 'rec-1',
            source: 'local',
            externalId: 'file-001',
            publisher: '本地曲库',
            url: null,
            thumbnailUrl: null,
          },
        ],
      },
    ],
  },
  {
    songWork: {
      id: 'sw-2',
      title: '起风了',
      artists: '买辣椒也用券',
      language: 'zh',
      year: 2017,
    },
    recordings: [
      {
        recording: {
          id: 'rec-2',
          songWorkId: 'sw-2',
          versionType: 'single',
          durationSec: 314,
          performers: '买辣椒也用券',
          album: '起风了',
        },
        sourceItems: [
          {
            id: 'si-3',
            recordingId: 'rec-2',
            source: 'open_source',
            externalId: 'archive-778',
            publisher: 'Internet Archive',
            url: null,
            thumbnailUrl: null,
          },
          {
            id: 'si-4',
            recordingId: 'rec-2',
            source: 'bilibili',
            externalId: 'BV1yb411b7kR',
            publisher: '音乐推荐君',
            url: null,
            thumbnailUrl: null,
          },
        ],
      },
    ],
  },
  {
    songWork: {
      id: 'sw-3',
      title: '夜曲',
      artists: '周杰伦',
      language: 'zh',
      year: 2005,
    },
    recordings: [
      {
        recording: {
          id: 'rec-3',
          songWorkId: 'sw-3',
          versionType: 'album',
          durationSec: 226,
          performers: '周杰伦',
          album: '十一月的萧邦',
        },
        sourceItems: [
          {
            id: 'si-5',
            recordingId: 'rec-3',
            source: 'bilibili',
            externalId: 'BV1Zs411t7hM',
            publisher: '杰威尔音乐',
            url: null,
            thumbnailUrl: null,
          },
        ],
      },
    ],
  },
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
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Apple-style search page with translucent chrome, pill search bar,
 * and spring-press result cards.
 */
export function AppleSearchPage() {
  const [query, setQuery] = useState('晴天');
  const [activeSources, setActiveSources] = useState<Set<SourceId>>(
    new Set(SOURCE_FILTERS.map((s) => s.id)),
  );
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);

  const results = useMemo(() => {
    return MOCK_RESULTS.filter((g) =>
      g.recordings.some((r) => r.sourceItems.some((si) => activeSources.has(si.source))),
    );
  }, [activeSources]);

  const toggleSource = (id: SourceId) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="apple-theme min-h-screen bg-background pb-28 text-foreground">
      {/* Floating translucent search header */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="apple-glass-strong relative mx-auto flex max-w-2xl flex-col gap-3 rounded-[1.75rem] p-3">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
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
              const active = activeSources.has(id);
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

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            找到 <span className="font-semibold text-foreground">{results.length}</span> 首歌曲
          </span>
          <span className="text-xs">124ms</span>
        </div>

        <div className="space-y-3">
          {results.map((group) => {
            const isFavorite = favorites.has(group.songWork.id);
            const isPlaying = playingId === group.songWork.id;

            return (
              <article
                key={group.songWork.id}
                className="apple-card apple-card-interactive relative overflow-hidden p-4"
              >
                <div className="flex items-center gap-4">
                  {/* Artwork */}
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-300 to-orange-200 text-lg font-bold text-white shadow-sm">
                    {group.songWork.title.slice(0, 1)}
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
                      onClick={() => setPlayingId(group.songWork.id)}
                      aria-label="播放"
                    >
                      <Play className="h-[18px] w-[18px] fill-current" />
                    </button>
                    <button
                      type="button"
                      className="apple-btn h-9 w-9 rounded-full text-muted-foreground"
                      aria-label="更多"
                    >
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
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
                            onClick={() => setPlayingId(group.songWork.id)}
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
                          </button>
                          <button
                            type="button"
                            className="apple-btn rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                            aria-label="加入队列"
                          >
                            <ListPlus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="apple-btn rounded-full p-1.5 text-muted-foreground hover:text-foreground"
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
