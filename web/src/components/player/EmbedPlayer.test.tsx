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

    expect(iframe).toHaveAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');

    usePlayerStore.getState().hideVideo();
    rerender(<EmbedPlayer />);

    expect(screen.getByTitle('embedded player')).toBe(iframe);
    expect(iframe.parentElement).toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: '显示视频' })).toHaveAttribute('aria-pressed', 'true');
  });
});
