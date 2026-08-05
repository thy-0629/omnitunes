import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedSearchResult } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';
import { useQueueStore } from '@/stores/queue';
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
              qualityMetadata: { playCount: 1_000_000, isOfficialPublisher: true },
            },
            {
              id: 'source-2',
              recordingId: 'recording-1',
              source: 'local',
              externalId: 'hidden-external-id',
              publisher: null,
              url: null,
              thumbnailUrl: null,
              qualityMetadata: null,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('keeps every source row playable while showing grouped song and source metadata', () => {
    const playSourceItem = vi.spyOn(usePlayerStore.getState(), 'playSourceItem').mockResolvedValue();
    const addToQueue = vi.spyOn(useQueueStore.getState(), 'add').mockResolvedValue(false);
    const addNext = vi.spyOn(useQueueStore.getState(), 'insertNext').mockResolvedValue(false);

    render(<SearchPage />);

    const sourceRows = [
      screen.getByRole('button', {
        name: /晴天 · 周杰伦.*杰威尔音乐 · B站 · 4:29/,
      }),
      screen.getByRole('button', {
        name: /晴天 · 周杰伦.*本地 · 4:29/,
      }),
    ];

    expect(screen.getByRole('button', { name: '收藏' })).toBeVisible();
    expect(screen.getByRole('button', { name: '播放' })).toBeVisible();

    const sourceRow = sourceRows[0];
    expect(sourceRow).toBeVisible();
    expect(within(sourceRow).getByText('B站')).toBeVisible();
    expect(within(sourceRow).getByText('杰威尔音乐 · B站 · 4:29')).toHaveClass(
      'text-xs',
      'text-muted-foreground',
    );

    const publisherlessSourceRow = sourceRows[1];
    expect(publisherlessSourceRow).toBeVisible();
    expect(within(publisherlessSourceRow).getByText('本地')).toBeVisible();
    expect(within(publisherlessSourceRow).getByText('本地 · 4:29')).toHaveClass(
      'text-xs',
      'text-muted-foreground',
    );
    expect(screen.queryByText('hidden-external-id')).not.toBeInTheDocument();

    for (const [index, row] of sourceRows.entries()) {
      const sourceControlRow = row.parentElement;
      expect(sourceControlRow).not.toBeNull();
      const queueButton = within(sourceControlRow!).getByRole('button', { name: '加入队列' });
      const addNextButton = within(sourceControlRow!).getByRole('button', { name: '下一首播放' });

      expect(queueButton).toBeVisible();
      expect(addNextButton).toBeVisible();

      fireEvent.click(row);
      fireEvent.click(queueButton);
      fireEvent.click(addNextButton);

      const sourceItemId = `source-${index + 1}`;
      expect(playSourceItem).toHaveBeenNthCalledWith(index + 1, sourceItemId, {
        id: 'song-1',
        title: '晴天',
        artists: '周杰伦',
      });
      expect(addToQueue).toHaveBeenNthCalledWith(index + 1, searchResult.results[0]!.songWork, sourceItemId);
      expect(addNext).toHaveBeenNthCalledWith(index + 1, searchResult.results[0]!.songWork, sourceItemId);
    }
  });
});
