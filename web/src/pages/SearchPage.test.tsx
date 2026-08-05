import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedSearchResult } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';
import { useSearchStore } from '@/stores/search';
import { SearchPage } from './SearchPage';

vi.mock('@/lib/api', () => ({
  addCollection: vi.fn(),
  addPlaylistItem: vi.fn(),
  addToQueue: vi.fn(),
  clearQueue: vi.fn(),
  createPlaylist: vi.fn(),
  endPlay: vi.fn(),
  fallbackPlay: vi.fn(),
  getCollections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getPlaylists: vi.fn(),
  getQueue: vi.fn(),
  localStreamUrl: vi.fn(),
  moveQueueItem: vi.fn(),
  nextInQueue: vi.fn(),
  removeCollection: vi.fn(),
  removeFromQueue: vi.fn(),
  resolvePlay: vi.fn(),
  startPlay: vi.fn(),
}));

const searchResult: UnifiedSearchResult = {
  query: '晴天',
  totalSongWorks: 1,
  results: [
    {
      songWork: { id: 'song-1', title: '晴天', artists: '周杰伦' },
      recordings: [
        {
          recording: {
            id: 'recording-1',
            songWorkId: 'song-1',
            versionType: 'original',
            durationSec: 269,
            performers: null,
            album: null,
          },
          sourceItems: [
            {
              id: 'source-1',
              recordingId: 'recording-1',
              source: 'bilibili',
              externalId: 'BV1',
              publisher: '杰威尔音乐',
              url: null,
              thumbnailUrl: null,
            },
          ],
        },
      ],
    },
  ],
  errors: [],
  meta: { searchedAt: 0, sourcesQueried: ['bilibili'], latencyMs: 0 },
};

describe('SearchPage', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    useSearchStore.setState({
      query: '',
      result: searchResult,
      loading: false,
      error: null,
      sources: undefined,
    });
  });

  it('shows song identity and source metadata in each playable source row', () => {
    render(<SearchPage />);

    const sourceRow = screen.getByRole('button', {
      name: /晴天 · 周杰伦.*杰威尔音乐 · B站 · 4:29/,
    });

    expect(sourceRow).toBeVisible();
    expect(within(sourceRow).getByText('杰威尔音乐 · B站 · 4:29')).toHaveClass(
      'text-xs',
      'text-muted-foreground',
    );
  });
});
