import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankedPlayOption } from '@/lib/api/types';
import { usePlayerStore } from './player';

const mocks = vi.hoisted(() => ({ startPlay: vi.fn() }));

vi.mock('@/lib/api', () => {
  return {
    endPlay: vi.fn(),
    fallbackPlay: vi.fn(),
    localStreamUrl: (sourceItemId: string) => `/api/local/stream/${sourceItemId}`,
    nextInQueue: vi.fn(),
    resolvePlay: vi.fn(),
    startPlay: mocks.startPlay,
  };
});

const embedOption: RankedPlayOption = {
  rank: 1,
  source: 'bilibili',
  sourceItem: {
    id: 'source-1',
    recordingId: 'recording-1',
    source: 'bilibili',
    externalId: 'BV1xx',
    publisher: null,
    url: null,
    thumbnailUrl: null,
    qualityMetadata: null,
    attributionMetadata: null,
  },
  option: { type: 'embed', payload: 'BV1xx' },
  playableOptionId: 'option-1',
};

describe('usePlayerStore embed visibility', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    mocks.startPlay.mockReset();
  });

  it('shows a newly selected embed after the video was hidden', async () => {
    mocks.startPlay.mockResolvedValue({ playId: 'play-1', option: embedOption });
    usePlayerStore.getState().hideVideo();

    await usePlayerStore.getState().playSourceItem('source-1', {
      id: 'song-1',
      title: 'Song',
      artists: 'Artist',
    });

    expect(usePlayerStore.getState().videoVisible).toBe(true);
  });
});
