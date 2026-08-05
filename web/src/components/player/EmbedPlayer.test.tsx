import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankedPlayOption } from '@/lib/api/types';
import { usePlayerStore } from '@/stores/player';
import { EmbedPlayer } from './EmbedPlayer';

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

const happyWindow = window as unknown as Window & {
  happyDOM: { settings: { disableIframePageLoading: boolean } };
};

describe('EmbedPlayer', () => {
  beforeEach(() => {
    happyWindow.happyDOM.settings.disableIframePageLoading = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    usePlayerStore.setState({ option: embedOption, status: 'playing', videoVisible: true });
  });

  afterEach(() => {
    happyWindow.happyDOM.settings.disableIframePageLoading = false;
    vi.restoreAllMocks();
  });

  it('keeps the iframe mounted when hidden and provides a show-video control', () => {
    const { rerender } = render(<EmbedPlayer />);
    const iframe = screen.getByTitle('embedded player');
    const hideButton = screen.getByRole('button', { name: '隐藏视频' });

    expect(iframe).toHaveAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    expect(screen.getByText(/浏览器或视频平台可能阻止有声自动播放/)).toBeVisible();
    expect(hideButton).toHaveAttribute('title', '隐藏视频画面');
    expect(hideButton).toHaveAttribute('aria-pressed', 'false');

    usePlayerStore.getState().hideVideo();
    rerender(<EmbedPlayer />);

    expect(screen.getByTitle('embedded player')).toBe(iframe);
    expect(iframe.parentElement).toHaveAttribute('hidden');
    expect(screen.getByText(/若未开始，请显示视频并在视频中点击播放/)).toBeVisible();
    expect(screen.getByRole('button', { name: '显示视频' })).toHaveAttribute(
      'title',
      '显示视频画面',
    );
    expect(screen.getByRole('button', { name: '显示视频' })).toHaveAttribute('aria-pressed', 'true');
  });
});
