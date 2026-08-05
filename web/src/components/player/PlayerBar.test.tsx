import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankedPlayOption } from '@/lib/api/types';
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

describe('PlayerBar embed controls', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it('gives the collapsed show-video control a tooltip and pressed-state feedback', () => {
    renderHiddenEmbedPlayerBar();

    const showButton = screen.getByRole('button', { name: '显示视频' });
    expect(showButton).toHaveAttribute('title', '显示视频画面');
    expect(showButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/没有可靠结束事件，请手动点下一首/)).toBeVisible();
  });

  it('gives the expanded duplicate show-video control the same feedback', () => {
    renderHiddenEmbedPlayerBar();

    fireEvent.click(screen.getByRole('button', { name: '展开播放器' }));

    const showButton = screen.getByRole('button', { name: '显示视频' });
    expect(showButton).toHaveAttribute('title', '显示视频画面');
    expect(showButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/没有可靠结束事件，请手动点下一首/)).toBeVisible();
  });
});
