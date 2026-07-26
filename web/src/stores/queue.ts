import { create } from 'zustand';
import { addToQueue, clearQueue, getQueue, removeFromQueue } from '@/lib/api';
import type { QueueItem } from '@/lib/api/types';

interface QueueState {
  items: QueueItem[];
  total: number;
  refresh: () => Promise<void>;
  add: (songWorkId: string, sourceItemId?: string) => Promise<void>;
  removeAt: (position: number) => Promise<void>;
  clear: () => Promise<void>;
}

export const useQueueStore = create<QueueState>()((set) => ({
  items: [],
  total: 0,

  refresh: async () => {
    try {
      const snap = await getQueue();
      set({ items: snap.items, total: snap.total });
    } catch {
      // backend down — keep stale state
    }
  },

  add: async (songWorkId, sourceItemId) => {
    await addToQueue(songWorkId, sourceItemId);
    const snap = await getQueue();
    set({ items: snap.items, total: snap.total });
  },

  removeAt: async (position) => {
    await removeFromQueue(position);
    const snap = await getQueue();
    set({ items: snap.items, total: snap.total });
  },

  clear: async () => {
    await clearQueue();
    set({ items: [], total: 0 });
  },
}));
