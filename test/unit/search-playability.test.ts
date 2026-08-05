import { describe, expect, it, vi } from 'vitest';
import { Normalizer, type NormalizerInput } from '../../src/modules/search/normalizer.js';
import { UnifiedSearchService } from '../../src/modules/search/service.js';
import { PlayabilityVerifier } from '../../src/modules/sources/playability.js';
import { SourceRegistry } from '../../src/modules/sources/registry.js';
import type { SourceAdapter } from '../../src/modules/sources/types.js';

function createArchiveSearch(): { adapter: SourceAdapter; normalizer: Normalizer } {
  const adapter: SourceAdapter = {
    id: 'open_source',
    displayName: 'Internet Archive',
    capabilities: { search: true, playOptions: true, health: true },
    search: vi.fn().mockResolvedValue([
      { externalId: 'archive-hit-1', title: 'Archive Hit', artists: 'Artist' },
      { externalId: 'archive-hit-2', title: 'Archive Hit', artists: 'Artist' },
    ]),
    getPlayOptions: vi.fn().mockResolvedValue([
      { type: 'stream', payload: 'https://media.example/archive.mp3' },
    ]),
    health: vi.fn().mockResolvedValue({ status: 'healthy', checkedAt: 0 }),
  };
  const normalizer = {
    normalizeAll: vi.fn((inputs: NormalizerInput[]) => inputs.map(({ sourceId, hit }) => ({
      sourceId,
      songWork: { id: 'archive-work', title: hit.title, artists: hit.artists },
      recording: { id: 'archive-recording', durationSec: null },
      sourceItem: { id: hit.externalId, source: sourceId, externalId: hit.externalId },
    }))),
  } as unknown as Normalizer;
  return { adapter, normalizer };
}

describe('UnifiedSearchService search playability', () => {
  it('retains an Archive hit with unavailable timeout playability', async () => {
    const { adapter, normalizer } = createArchiveSearch();
    const registry = new SourceRegistry();
    registry.register(adapter);
    const verifier = new PlayabilityVerifier({
      fetchFn: vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch,
      resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    const result = await new UnifiedSearchService(registry, normalizer, verifier)
      .search({ query: 'Archive Hit' });

    expect(result.results[0]!.recordings[0]!.sourceItems[0]).toMatchObject({
      externalId: 'archive-hit-1',
      playability: { status: 'unavailable', code: 'timeout' },
    });
  });

  it('deduplicates identical preflight failures from one source', async () => {
    const { adapter, normalizer } = createArchiveSearch();
    const registry = new SourceRegistry();
    registry.register(adapter);
    const verifier = new PlayabilityVerifier({
      fetchFn: vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch,
      resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    const result = await new UnifiedSearchService(registry, normalizer, verifier)
      .search({ query: 'Archive Hit' });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ source: 'open_source', code: 'timeout' });
  });
});
