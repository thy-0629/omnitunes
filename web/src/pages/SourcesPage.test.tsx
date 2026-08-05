import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SourceDescription } from '@/lib/api/types';
import { SourcesPage } from './SourcesPage';

const refresh = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/sources', () => ({
  useSourcesStore: () => ({
    sources: [
      {
        id: 'openverse',
        displayName: 'Openverse',
        capabilities: { search: true, playOptions: true, health: true },
        stats: {
          totalCalls: 8,
          successRate: 0.875,
          playabilitySuccessRate: 0.666,
          avgLatencyMs: 120,
          lastPlayabilityErrorCode: 'invalid_content_type',
          lastPlayabilityErrorMessage: 'Expected an audio response, received application/json',
          lastPlayabilityErrorAt: 1_786_000_000_000,
          playabilityRetryAt: 4_102_444_800_000,
        },
      },
      {
        id: 'wikimedia',
        displayName: 'Commons',
        capabilities: { search: true, playOptions: true, health: true },
        stats: {
          totalCalls: 0,
          successRate: 0,
          playabilitySuccessRate: null,
          avgLatencyMs: 0,
        },
      },
    ] satisfies SourceDescription[],
    health: {},
    loading: false,
    refresh,
  }),
}));

describe('SourcesPage', () => {
  it('shows rounded playability health only after a source has verification data', () => {
    render(<SourcesPage />);

    expect(screen.getByText('可播放验证 67%')).toBeVisible();
    expect(screen.getByText('尚无可播放验证')).toBeVisible();
    expect(screen.getByText(/invalid_content_type/)).toBeVisible();
    expect(screen.getByText(/application\/json/)).toBeVisible();
    expect(screen.getByText(/可重试/)).toBeVisible();
  });
});
