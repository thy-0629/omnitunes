import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';

/**
 * MockAdapter — deterministic fake data for development & tests.
 *
 * It exists so the §四 unified search and §五 playback orchestrator can be
 * wired up and demoed BEFORE any real source is configured. Every externalId
 * returned is replayable: `getPlayOptions` accepts the same id back.
 */
export class MockAdapter implements SourceAdapter {
  readonly id = 'mock' as const;
  readonly displayName = 'Mock (dev only)';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  async search(params: SearchParams): Promise<RawHit[]> {
    const base = sanitizeQuery(params.query);
    return [{
      externalId: `mock-${slug(base)}`,
      title: `Mock result for “${base}”`,
      artists: 'Mock Artist',
      durationSec: 180,
      thumbnailUrl: `https://placehold.co/120x120?text=${encodeURIComponent(base)}`,
      publisher: 'Mock Records',
      metadata: { mockIndex: 0 },
    }];
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    if (!externalId.startsWith('mock-')) return [];
    return [
      {
        type: 'embed',
        payload: `mock-video-${externalId.slice(5)}`,
        expiresAt: Date.now() + 60 * 60 * 1000,
      },
    ];
  }

  async health(): Promise<HealthSnapshot> {
    return { status: 'healthy', checkedAt: Date.now() };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sanitizeQuery(q: string): string {
  return q.trim() || 'unknown';
}

function slug(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'q';
}