import { create } from 'zustand';
import {
  endPlay,
  fallbackPlay,
  localStreamUrl,
  nextInQueue,
  resolvePlay,
  startPlay,
} from '@/lib/api';
import type { RankedPlayOption, SongWork } from '@/lib/api/types';
import { useQueueStore } from './queue';

export type PlayerStatus = 'idle' | 'resolving' | 'playing' | 'error';

interface PlayerState {
  playId: string | null;
  option: RankedPlayOption | null;
  songWork: Pick<SongWork, 'id' | 'title' | 'artists'> | null;
  status: PlayerStatus;
  error: string | null;
  positionSec: number;
  durationSec: number | null;

  /** Resolve + start playback for a source item, showing song info in the bar. */
  playSourceItem: (
    sourceItemId: string,
    songWork: Pick<SongWork, 'id' | 'title' | 'artists'>,
    optionId?: string,
  ) => Promise<void>;
  /** Resolve + start playback for a whole song work (auto-picks best option). */
  playSongWork: (songWork: Pick<SongWork, 'id' | 'title' | 'artists'>) => Promise<void>;
  endCurrent: (outcome: 'completed' | 'skipped' | 'failed') => Promise<void>;
  tryFallback: (reason: string) => Promise<void>;
  playNextFromQueue: () => Promise<void>;
  setProgress: (positionSec: number, durationSec: number | null) => void;
  reset: () => void;
}

/** Stream URL for the current option, or null for embed options. */
export function currentAudioUrl(option: RankedPlayOption | null): string | null {
  if (!option) return null;
  if (option.option.type === 'stream') return option.option.payload;
  if (option.option.type === 'local') return localStreamUrl(option.sourceItem.id);
  return null;
}

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  playId: null,
  option: null,
  songWork: null,
  status: 'idle',
  error: null,
  positionSec: 0,
  durationSec: null,

  playSourceItem: async (sourceItemId, songWork, optionId) => {
    set({ status: 'resolving', error: null, songWork });
    try {
      const { playId, option } = await startPlay({ sourceItemId, optionId });
      set({ playId, option, status: 'playing', positionSec: 0, durationSec: null });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  playSongWork: async (songWork) => {
    set({ status: 'resolving', error: null, songWork });
    try {
      const resolved = await resolvePlay({ songWorkId: songWork.id });
      if (!resolved.best) {
        set({ status: 'error', error: '没有可用的播放来源' });
        return;
      }
      const { playId, option } = await startPlay({
        sourceItemId: resolved.best.sourceItem.id,
        optionId: resolved.best.playableOptionId,
      });
      set({ playId, option, status: 'playing', positionSec: 0, durationSec: null });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  endCurrent: async (outcome) => {
    const { playId, positionSec } = get();
    if (!playId) return;
    try {
      await endPlay(playId, { outcome, durationPlayedSec: Math.round(positionSec) });
    } catch {
      // best-effort — history loss is acceptable on shutdown
    }
    if (outcome !== 'completed') get().reset();
  },

  tryFallback: async (reason) => {
    const { playId } = get();
    if (!playId) return;
    set({ status: 'resolving', error: null });
    try {
      const res = await fallbackPlay(playId, reason);
      set({ playId: res.playId, option: res.option, status: 'playing', positionSec: 0 });
    } catch (err) {
      set({ status: 'error', error: `换源失败：${err instanceof Error ? err.message : String(err)}` });
    }
  },

  playNextFromQueue: async () => {
    try {
      await nextInQueue(true);
      // server auto-started the next play; queue store refreshes via WS
      useQueueStore.getState().refresh();
    } catch {
      // queue empty — fine, just stop
      get().reset();
    }
  },

  setProgress: (positionSec, durationSec) => set({ positionSec, durationSec }),

  reset: () =>
    set({
      playId: null,
      option: null,
      songWork: null,
      status: 'idle',
      error: null,
      positionSec: 0,
      durationSec: null,
    }),
}));
