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

  it('deduplicates same-source timeout errors when each hit has a different retry time', async () => {
    const { adapter, normalizer } = createArchiveSearch();
    adapter.getPlayOptions = vi.fn().mockImplementation(async (externalId: string) => [
      { type: 'stream', payload: `https://media.example/${externalId}.mp3` },
    ]);
    const registry = new SourceRegistry();
    registry.register(adapter);
    let now = 10_000;
    const verifier = new PlayabilityVerifier({
      fetchFn: vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch,
      now: () => now++,
      resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    const result = await new UnifiedSearchService(registry, normalizer, verifier)
      .search({ query: 'Archive Hit' });
    const retryAts = result.results[0]!.recordings[0]!.sourceItems
      .map((item) => item.playability.retryAt);

    expect(new Set(retryAts).size).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ source: 'open_source', code: 'timeout' });
  });

  it('marks unpreflighted and inconclusive hits as unknown instead of unavailable', async () => {
    const { adapter, normalizer } = createArchiveSearch();
    const hits = Array.from({ length: 10 }, (_, index) => ({
      externalId: `archive-hit-${index}`,
      title: `Archive Hit ${index}`,
      artists: 'Artist',
    }));
    adapter.search = vi.fn().mockResolvedValue(hits);
    adapter.getPlayOptions = vi.fn().mockImplementation(async (externalId: string) => (
      externalId === 'archive-hit-0'
        ? []
        : [{ type: 'local', payload: externalId }]
    ));
    const registry = new SourceRegistry();
    registry.register(adapter);

    const result = await new UnifiedSearchService(
      registry,
      normalizer,
      new PlayabilityVerifier({ fetchFn: vi.fn() as unknown as typeof fetch }),
    ).search({ query: 'Archive Hit' });
    const sourceItems = result.results[0]!.recordings[0]!.sourceItems;

    expect(sourceItems.find((item) => item.externalId === 'archive-hit-0')!.playability)
      .toEqual({ status: 'unknown' });
    expect(sourceItems.find((item) => item.externalId === 'archive-hit-8')!.playability)
      .toEqual({ status: 'unknown' });
    expect(sourceItems.find((item) => item.externalId === 'archive-hit-9')!.playability)
      .toEqual({ status: 'unknown' });
    expect(sourceItems.find((item) => item.externalId === 'archive-hit-1')!.playability)
      .toEqual({ status: 'playable' });
  });

  it('shows one source warning while preserving distinct per-hit preflight failures', async () => {
    const { adapter, normalizer } = createArchiveSearch();
    adapter.getPlayOptions = vi.fn().mockImplementation(async (externalId: string) => {
      const error = externalId === 'archive-hit-1'
        ? Object.assign(new Error('First option lookup failed'), { code: 'first_failure' })
        : Object.assign(new Error('Second option lookup failed'), { code: 'second_failure' });
      throw error;
    });
    const registry = new SourceRegistry();
    registry.register(adapter);

    const result = await new UnifiedSearchService(
      registry,
      normalizer,
      new PlayabilityVerifier({ fetchFn: vi.fn() as unknown as typeof fetch }),
    ).search({ query: 'Archive Hit' });
    const sourceItems = result.results[0]!.recordings[0]!.sourceItems;

    expect(result.errors).toEqual([
      expect.objectContaining({ source: 'open_source', code: 'first_failure', message: 'First option lookup failed' }),
    ]);
    expect(sourceItems.find((item) => item.externalId === 'archive-hit-1')!.playability)
      .toMatchObject({ status: 'unavailable', code: 'first_failure', message: 'First option lookup failed' });
    expect(sourceItems.find((item) => item.externalId === 'archive-hit-2')!.playability)
      .toMatchObject({ status: 'unavailable', code: 'second_failure', message: 'Second option lookup failed' });
  });
});
