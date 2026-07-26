import { create } from 'zustand';
import { search } from '@/lib/api';
import type { SourceId, UnifiedSearchResult } from '@/lib/api/types';

interface SearchState {
  query: string;
  sources: SourceId[] | undefined;
  result: UnifiedSearchResult | null;
  loading: boolean;
  error: string | null;
  setQuery: (q: string) => void;
  toggleSource: (s: SourceId) => void;
  runSearch: () => Promise<void>;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  query: '',
  sources: undefined, // undefined = all sources
  result: null,
  loading: false,
  error: null,

  setQuery: (query) => set({ query }),

  toggleSource: (s) =>
    set((state) => {
      const current = state.sources ?? [];
      const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
      return { sources: next.length === 0 ? undefined : next };
    }),

  runSearch: async () => {
    const { query, sources } = get();
    const q = query.trim();
    if (!q) return;
    set({ loading: true, error: null });
    try {
      const result = await search(q, { limit: 20, sources });
      set({ result, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },
}));
