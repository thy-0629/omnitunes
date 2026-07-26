import { useEffect, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultCard } from '@/components/SearchResultCard';
import { useSearchStore } from '@/stores/search';
import { usePlayerStore } from '@/stores/player';
import { useQueueStore } from '@/stores/queue';
import { addCollection, getCollections, removeCollection } from '@/lib/api';
import type { SourceId } from '@/lib/api/types';

const SOURCE_FILTERS: Array<{ id: SourceId; label: string }> = [
  { id: 'bilibili', label: 'B站' },
  { id: 'open_source', label: 'Archive' },
  { id: 'local', label: '本地' },
];

export function SearchPage() {
  const { query, result, loading, error, setQuery, toggleSource, runSearch, sources } =
    useSearchStore();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCollections()
      .then((c) => setFavorites(new Set(c.items.map((i) => i.songWorkId))))
      .catch(() => {});
  }, [result]);

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

  return (
    <div className="mx-auto max-w-3xl p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入歌名、歌手…"
          className="text-base"
          autoFocus
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          <SearchIcon className="h-4 w-4" />
          搜索
        </Button>
      </form>

      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <span>音源：</span>
        {SOURCE_FILTERS.map(({ id, label }) => {
          const active = sources === undefined || sources.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggleSource(id)}
              className={`rounded-full border px-3 py-0.5 text-xs transition-colors ${
                active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error && <div className="mt-4 text-sm text-destructive">{error}</div>}

      {result && result.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-yellow-600/40 bg-yellow-600/10 px-3 py-2 text-xs">
          {result.errors.map((e) => (
            <div key={e.source}>
              {e.source} 暂不可用：{e.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}

        {!loading && result && result.results.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            没有找到「{result.query}」相关的结果
          </div>
        )}

        {!loading &&
          result?.results.map((group) => (
            <SearchResultCard
              key={group.songWork.id}
              group={group}
              isFavorite={favorites.has(group.songWork.id)}
              onPlay={(si) =>
                void usePlayerStore.getState().playSourceItem(si.id, {
                  id: group.songWork.id,
                  title: group.songWork.title,
                  artists: group.songWork.artists,
                })
              }
              onAddToQueue={(id) => void useQueueStore.getState().add(id)}
              onToggleFavorite={(id) => void toggleFavorite(id)}
            />
          ))}
      </div>
    </div>
  );
}
