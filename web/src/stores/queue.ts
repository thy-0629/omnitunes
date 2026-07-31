import { create } from 'zustand';
import {
  addToQueue,
  clearQueue,
  getQueue,
  moveQueueItem,
  removeFromQueue,
} from '@/lib/api';
import type { QueueItem, SongWork } from '@/lib/api/types';

interface QueueState {
  items: QueueItem[];
  total: number;
  refresh: () => Promise<void>;
  add: (
    songWork: Pick<SongWork, 'id' | 'title' | 'artists'>,
    sourceItemId?: string,
    position?: number,
  ) => Promise<boolean>;
  insertNext: (
    songWork: Pick<SongWork, 'id' | 'title' | 'artists'>,
    sourceItemId?: string,
  ) => Promise<boolean>;
  removeAt: (position: number) => Promise<void>;
  move: (from: number, to: number) => Promise<void>;
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

  add: async (songWork, sourceItemId, position) => {
    const result = await addToQueue(songWork.id, songWork, sourceItemId, position);
    const snap = await getQueue();
    set({ items: snap.items, total: snap.total });
    return result.duplicate;
  },

  insertNext: async (songWork, sourceItemId) => {
    const result = await addToQueue(songWork.id, songWork, sourceItemId, 0);
    const snap = await getQueue();
    set({ items: snap.items, total: snap.total });
    return result.duplicate;
  },

  removeAt: async (position) => {
    await removeFromQueue(position);
    const snap = await getQueue();
    set({ items: snap.items, total: snap.total });
  },

  move: async (from, to) => {
    await moveQueueItem(from, to);
    const snap = await getQueue();
    set({ items: snap.items, total: snap.total });
  },

  clear: async () => {
    await clearQueue();
    set({ items: [], total: 0 });
  },
}));
