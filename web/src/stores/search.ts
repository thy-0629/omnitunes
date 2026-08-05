import { create } from 'zustand';
import { search } from '@/lib/api';
import type { SourceId, UnifiedSearchResult } from '@/lib/api/types';

interface SearchState {
  query: string;
  sources: SourceId[];
  result: UnifiedSearchResult | null;
  loading: boolean;
  error: string | null;
  setQuery: (q: string) => void;
  toggleSource: (s: SourceId) => void;
  runSearch: () => Promise<void>;
}

export const DEFAULT_SEARCH_SOURCES: readonly SourceId[] = [
  'bilibili',
  'open_source',
  'openverse',
  'wikimedia',
  'local',
];

export const useSearchStore = create<SearchState>()((set, get) => ({
  query: '',
  sources: [...DEFAULT_SEARCH_SOURCES],
  result: null,
  loading: false,
  error: null,

  setQuery: (query) => set({ query }),

  toggleSource: (s) =>
    set((state) => {
      const current = state.sources;
      const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
      return { sources: next, result: null, loading: false, error: null };
    }),

  runSearch: async () => {
    const { query, sources } = get();
    const q = query.trim();
    if (!q) return;
    const requestSignature = sourceSignature(sources);
    set({ loading: true, error: null });
    try {
      const result = await search(q, { limit: 20, sources });
      if (
        get().query.trim() === q &&
        sourceSignature(get().sources) === requestSignature
      ) {
        set({ result, loading: false });
      }
    } catch (err) {
      if (
        get().query.trim() === q &&
        sourceSignature(get().sources) === requestSignature
      ) {
        set({ error: err instanceof Error ? err.message : String(err), loading: false });
      }
    }
  },
}));

function sourceSignature(sources: SourceId[]): string {
  return [...sources].sort().join(',');
}
