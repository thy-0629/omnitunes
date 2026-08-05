import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCollections, search } from '@/lib/api';
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
  search: vi.fn(),
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
              attributionMetadata: null,
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
              attributionMetadata: null,
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
    vi.mocked(getCollections).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(search).mockResolvedValue(searchResult);
    usePlayerStore.getState().reset();
    useSearchStore.setState({
      query: '',
      result: searchResult,
      loading: false,
      error: null,
      sources: ['bilibili', 'open_source', 'openverse', 'wikimedia', 'local'],
    });
  });

  it('models the default-all filter as an explicit enabled source set', () => {
    expect(useSearchStore.getInitialState().sources).toEqual([
      'bilibili',
      'open_source',
      'openverse',
      'wikimedia',
      'local',
    ]);
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

  it('shows an unknown artist separately from the Bilibili uploader', () => {
    useSearchStore.setState({
      result: {
        ...searchResult,
        results: [{
          songWork: { id: 'song-unknown', title: '晴天 官方MV', artists: '未知艺术家' },
          recordings: [{
            recording: {
              ...searchResult.results[0]!.recordings[0]!.recording,
              id: 'recording-unknown',
              songWorkId: 'song-unknown',
            },
            sourceItems: [{
              ...searchResult.results[0]!.recordings[0]!.sourceItems[0]!,
              id: 'source-unknown',
              recordingId: 'recording-unknown',
              publisher: '某UP主',
            }],
          }],
        }],
      },
    });

    render(<SearchPage />);

    const sourceRow = screen.getByRole('button', {
      name: /晴天 官方MV · 未知艺术家.*某UP主 · B站 · 4:29/,
    });
    expect(within(sourceRow).getByText('晴天 官方MV · 未知艺术家')).toBeVisible();
    expect(within(sourceRow).getByText('某UP主 · B站 · 4:29')).toBeVisible();
  });
  it.each([
    ['Openverse', 'openverse'],
    ['Commons', 'wikimedia'],
  ] as const)('turns off only %s from the default-all set in the next request', async (label, sourceId) => {
    render(<SearchPage />);

    fireEvent.click(screen.getByRole('button', { name: label }));
    useSearchStore.getState().setQuery('filter test');
    await useSearchStore.getState().runSearch();

    const expected = ['bilibili', 'open_source', 'openverse', 'wikimedia', 'local']
      .filter((id) => id !== sourceId);
    expect(useSearchStore.getState().sources).toEqual(expected);
    expect(search).toHaveBeenLastCalledWith('filter test', { limit: 20, sources: expected });
  });

  it('clears results and empty-state identity when a source filter changes', () => {
    render(<SearchPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Openverse' }));

    expect(useSearchStore.getState().result).toBeNull();
    expect(screen.queryByRole('button', { name: /鏅村ぉ.*鏉板▉灏旈煶涔?/ })).not.toBeInTheDocument();
    expect(screen.queryByText('未找到可播放版本')).not.toBeInTheDocument();
  });

  it('wraps source filters on narrow screens instead of overflowing', () => {
    render(<SearchPage />);

    expect(screen.getByRole('button', { name: 'Openverse' }).parentElement).toHaveClass('flex-wrap');
  });

  it('keeps results from available sources when another source reports an error', () => {
    useSearchStore.setState({
      result: {
        ...searchResult,
        errors: [{ source: 'openverse', code: 'UPSTREAM_UNAVAILABLE', message: 'Openverse unavailable' }],
      },
    });

    render(<SearchPage />);

    expect(screen.getByText(/Openverse unavailable/)).toBeVisible();
    expect(screen.getByRole('button', { name: /杰威尔音乐.*B站.*4:29/ })).toBeVisible();
  });

  it('shows the verified-playable empty state only after a completed zero-result search', () => {
    useSearchStore.setState({
      query: '晴天',
      result: { ...searchResult, results: [] },
      loading: false,
    });

    render(<SearchPage />);

    expect(screen.getByText('未找到可播放版本')).toBeVisible();
  });

  it('hides a prior empty result as soon as the query changes during debounce', () => {
    useSearchStore.setState({
      query: '晴天',
      result: { ...searchResult, results: [] },
      loading: false,
      error: null,
    });

    render(<SearchPage />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '稻香' } });

    expect(screen.queryByText('未找到可播放版本')).not.toBeInTheDocument();
  });

  it('does not pair a prior empty result with a failed later search', () => {
    useSearchStore.setState({
      query: '稻香',
      result: { ...searchResult, results: [] },
      loading: false,
      error: 'Network unavailable',
    });

    render(<SearchPage />);

    expect(screen.getByText('Network unavailable')).toBeVisible();
    expect(screen.queryByText('未找到可播放版本')).not.toBeInTheDocument();
  });
});
