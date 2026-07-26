import { create } from 'zustand';
import { getSources, getSourcesHealth } from '@/lib/api';
import type { HealthSnapshot, SourceDescription, SourceId } from '@/lib/api/types';

interface SourcesState {
  sources: SourceDescription[];
  health: Partial<Record<SourceId, HealthSnapshot>>;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useSourcesStore = create<SourcesState>()((set) => ({
  sources: [],
  health: {},
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const [list, health] = await Promise.all([getSources(), getSourcesHealth()]);
      set({ sources: list.sources, health: health.health, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
