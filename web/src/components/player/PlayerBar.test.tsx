import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addCollection, getCollections, removeCollection } from '@/lib/api';
import type { CollectionEntry, RankedPlayOption } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';
import { PlayerBar } from './PlayerBar';

vi.mock('@/lib/api', () => ({
  addCollection: vi.fn(),
  endPlay: vi.fn(),
  fallbackPlay: vi.fn(),
  getCollections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  localStreamUrl: vi.fn(),
  nextInQueue: vi.fn(),
  removeCollection: vi.fn(),
  resolvePlay: vi.fn(),
  startPlay: vi.fn(),
}));

const embedOption: RankedPlayOption = {
  rank: 1,
  source: 'youtube',
  sourceItem: {
    id: 'source-1',
    recordingId: 'recording-1',
    source: 'youtube',
    externalId: 'video-1',
    publisher: null,
    url: null,
    thumbnailUrl: null,
    qualityMetadata: null,
    attributionMetadata: null,
  },
  option: { type: 'embed', payload: 'video-1' },
  playableOptionId: 'option-1',
};

function renderHiddenEmbedPlayerBar() {
  usePlayerStore.setState({
    option: embedOption,
    songWork: { id: 'song-1', title: 'Song', artists: 'Artist' },
    status: 'playing',
    videoVisible: false,
  });
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlayerBar />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function collection(songWorkId: string): CollectionEntry {
  return {
    songWorkId,
    preferredSource: null,
    preferredRecordingId: null,
    createdAt: 0,
    songWork: { id: songWorkId, title: `Song ${songWorkId}`, artists: 'Artist' },
  };
}

function setStreamSong(id = 'song-1') {
  usePlayerStore.setState({
    option: { ...embedOption, option: { type: 'stream', payload: 'https://example.test/song.mp3' } },
    songWork: { id, title: `Song ${id}`, artists: 'Artist' },
    status: 'playing',
    isPaused: false,
  });
}

describe('PlayerBar embed controls', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it('gives the collapsed show-video control a tooltip and pressed-state feedback', () => {
    renderHiddenEmbedPlayerBar();

    const showButton = screen.getByRole('button', { name: '显示视频' });
    expect(showButton).toHaveAttribute('title', '显示视频画面');
    expect(showButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('请显示视频并使用播放器内的播放/暂停控件。')).toBeVisible();
  });

  it('gives the expanded duplicate show-video control the same feedback', () => {
    renderHiddenEmbedPlayerBar();

    fireEvent.click(screen.getByRole('button', { name: '展开播放器' }));

    const showButton = screen.getByRole('button', { name: '显示视频' });
    expect(showButton).toHaveAttribute('title', '显示视频画面');
    expect(showButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('请显示视频并使用播放器内的播放/暂停控件。')).toBeVisible();
  });

  it('does not present an embed pause button and tells the listener to use the video player', () => {
    renderHiddenEmbedPlayerBar();

    expect(screen.queryByTitle('播放/暂停')).not.toBeInTheDocument();
    expect(screen.getByText('请显示视频并使用播放器内的播放/暂停控件。')).toBeVisible();
  });

  it('labels unsupported shuffle, previous, and repeat controls as unavailable', () => {
    renderHiddenEmbedPlayerBar();
    fireEvent.click(screen.getByRole('button', { name: '展开播放器' }));

    expect(screen.getByRole('button', { name: '随机（暂不支持）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '上一首（暂不支持）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '循环（暂不支持）' })).toBeDisabled();
  });
});

describe('PlayerBar stream and favorite controls', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    vi.mocked(getCollections).mockReset().mockResolvedValue({ items: [], total: 0 });
    vi.mocked(addCollection).mockReset();
    vi.mocked(removeCollection).mockReset();
  });

  it('toggles stream playback from the collapsed pause button', () => {
    setStreamSong();
    render(<MemoryRouter><PlayerBar /></MemoryRouter>);

    fireEvent.click(screen.getByTitle('播放/暂停'));

    expect(usePlayerStore.getState().isPaused).toBe(true);
  });

  it('keeps the current song favorite state when an older collection read resolves last', async () => {
    const firstRead = deferred<{ items: CollectionEntry[]; total: number }>();
    const secondRead = deferred<{ items: CollectionEntry[]; total: number }>();
    vi.mocked(getCollections)
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(secondRead.promise);
    setStreamSong('song-a');
    render(<MemoryRouter><PlayerBar /></MemoryRouter>);

    act(() => setStreamSong('song-b'));
    secondRead.resolve({ items: [collection('song-b')], total: 1 });
    await waitFor(() => expect(screen.getByRole('button', { name: '取消喜欢' })).toBeVisible());

    firstRead.resolve({ items: [], total: 0 });

    await waitFor(() => expect(screen.getByRole('button', { name: '取消喜欢' })).toBeVisible());
  });

  it('disables a favorite action while its request is pending', () => {
    const pendingAdd = deferred<{ collection: unknown }>();
    vi.mocked(addCollection).mockReturnValueOnce(pendingAdd.promise);
    setStreamSong();
    render(<MemoryRouter><PlayerBar /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: '喜欢' }));

    expect(screen.getByRole('button', { name: '喜欢' })).toBeDisabled();
  });

  it('refreshes favorite state after a conflict response', async () => {
    vi.mocked(addCollection).mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }));
    vi.mocked(getCollections)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [collection('song-1')], total: 1 });
    setStreamSong();
    render(<MemoryRouter><PlayerBar /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: '喜欢' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '取消喜欢' })).toBeVisible());
    expect(screen.getByRole('status')).toHaveTextContent('收藏状态已刷新');
  });

  it('refreshes favorite state after a not-found response', async () => {
    vi.mocked(removeCollection).mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }));
    vi.mocked(getCollections)
      .mockResolvedValueOnce({ items: [collection('song-1')], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    setStreamSong();
    render(<MemoryRouter><PlayerBar /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: '取消喜欢' })).toBeVisible());

    fireEvent.click(screen.getByRole('button', { name: '取消喜欢' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '喜欢' })).toBeVisible());
    expect(screen.getByRole('status')).toHaveTextContent('收藏状态已刷新');
  });
});
