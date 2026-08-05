import { create } from 'zustand';
import {
  endPlay,
  fallbackPlay,
  localStreamUrl,
  nextInQueue,
  resolvePlay,
  startPlay,
} from '@/lib/api';
import type { QueueItem, RankedPlayOption, SongWork } from '@/lib/api/types';
import { useQueueStore } from './queue';

export type PlayerStatus = 'idle' | 'resolving' | 'playing' | 'error';

interface PlayerState {
  playId: string | null;
  option: RankedPlayOption | null;
  songWork: Pick<SongWork, 'id' | 'title' | 'artists'> | null;
  currentQueueItemId: string | null;
  status: PlayerStatus;
  error: string | null;
  positionSec: number;
  durationSec: number | null;
  isPaused: boolean;
  volume: number;
  isMuted: boolean;
  seekRatio: number | null;
  videoVisible: boolean;

  /** Resolve + start playback for a source item, showing song info in the bar. */
  playSourceItem: (
    sourceItemId: string,
    songWork: Pick<SongWork, 'id' | 'title' | 'artists'>,
    optionId?: string,
  ) => Promise<void>;
  /** Resolve + start playback for a whole song work (auto-picks best option). */
  playSongWork: (songWork: Pick<SongWork, 'id' | 'title' | 'artists'>) => Promise<void>;
  /** Play a specific queue item, respecting its pinned sourceItemId. */
  playQueueItem: (item: QueueItem) => Promise<void>;
  endCurrent: (outcome: 'completed' | 'skipped' | 'failed') => Promise<void>;
  tryFallback: (reason: string) => Promise<void>;
  playNextFromQueue: () => Promise<void>;
  setProgress: (positionSec: number, durationSec: number | null) => void;
  togglePause: () => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
  requestSeek: (ratio: number) => void;
  consumeSeek: () => void;
  hideVideo: () => void;
  showVideo: () => void;
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
  currentQueueItemId: null,
  status: 'idle',
  error: null,
  positionSec: 0,
  durationSec: null,
  isPaused: false,
  volume: 1,
  isMuted: false,
  seekRatio: null,
  videoVisible: true,

  playSourceItem: async (sourceItemId, songWork, optionId) => {
    set({ status: 'resolving', error: null, songWork, isPaused: false, currentQueueItemId: null });
    try {
      const { playId, option } = await startPlay({ sourceItemId, optionId });
      set({
        playId,
        option,
        status: 'playing',
        positionSec: 0,
        durationSec: null,
        isPaused: false,
        videoVisible: true,
      });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  playSongWork: async (songWork) => {
    set({ status: 'resolving', error: null, songWork, isPaused: false, currentQueueItemId: null });
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
      set({
        playId,
        option,
        status: 'playing',
        positionSec: 0,
        durationSec: null,
        isPaused: false,
        videoVisible: true,
      });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  playQueueItem: async (item) => {
    set({
      status: 'resolving',
      error: null,
      songWork: item.songWork,
      isPaused: false,
      currentQueueItemId: item.id,
    });
    try {
      if (item.sourceItemId) {
        const { playId, option } = await startPlay({ sourceItemId: item.sourceItemId });
        set({
          playId,
          option,
          status: 'playing',
          positionSec: 0,
          durationSec: null,
          isPaused: false,
          videoVisible: true,
        });
      } else {
        const resolved = await resolvePlay({ songWorkId: item.songWorkId });
        if (!resolved.best) {
          set({ status: 'error', error: '没有可用的播放来源' });
          return;
        }
        const { playId, option } = await startPlay({
          sourceItemId: resolved.best.sourceItem.id,
          optionId: resolved.best.playableOptionId,
        });
        set({
          playId,
          option,
          status: 'playing',
          positionSec: 0,
          durationSec: null,
          isPaused: false,
          videoVisible: true,
        });
      }
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
    set({ status: 'resolving', error: null, isPaused: false });
    try {
      const res = await fallbackPlay(playId, reason);
      set({
        playId: res.playId,
        option: res.option,
        status: 'playing',
        positionSec: 0,
        isPaused: false,
        videoVisible: true,
      });
    } catch (err) {
      set({ status: 'error', error: `换源失败：${err instanceof Error ? err.message : String(err)}` });
    }
  },

  playNextFromQueue: async () => {
    try {
      const result = await nextInQueue(true);
      const { queueItem, started } = result;
      if (started) {
        set({
          playId: started.playId,
          option: started.option,
          status: 'playing',
          songWork: queueItem.songWork,
          currentQueueItemId: queueItem.id,
          positionSec: 0,
          durationSec: null,
          isPaused: false,
          error: null,
          videoVisible: true,
        });
      } else {
        set({
          status: 'error',
          error: '队列中的歌曲没有可用的播放来源',
          songWork: queueItem.songWork,
          currentQueueItemId: queueItem.id,
        });
      }
      useQueueStore.getState().refresh();
    } catch {
      // queue empty — fine, just stop
      get().reset();
    }
  },

  setProgress: (positionSec, durationSec) => set({ positionSec, durationSec }),

  togglePause: () => {
    const { status, isPaused } = get();
    if (status !== 'playing' && status !== 'error') return;
    set({ isPaused: !isPaused });
  },

  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)), isMuted: volume === 0 }),

  toggleMuted: () => set((state) => ({ isMuted: !state.isMuted })),

  requestSeek: (ratio) => set({ seekRatio: Math.max(0, Math.min(1, ratio)) }),

  consumeSeek: () => set({ seekRatio: null }),

  hideVideo: () => set({ videoVisible: false }),

  showVideo: () => set({ videoVisible: true }),

  reset: () =>
    set({
      playId: null,
      option: null,
      songWork: null,
      currentQueueItemId: null,
      status: 'idle',
      error: null,
      positionSec: 0,
      durationSec: null,
      isPaused: false,
      seekRatio: null,
      videoVisible: true,
    }),
}));
