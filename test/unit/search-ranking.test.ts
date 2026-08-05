import { afterEach, describe, expect, it, vi } from 'vitest';
import { Normalizer, canonicalTitle } from '../../src/modules/search/normalizer.js';
import { scoreGroup, UnifiedSearchService, type SearchResultGroup } from '../../src/modules/search/service.js';
import { PlayabilityVerifier } from '../../src/modules/sources/playability.js';
import { SourceRegistry } from '../../src/modules/sources/registry.js';
import type { SourceAdapter } from '../../src/modules/sources/types.js';

function group(
  title: string,
  artists: string,
  qualityMetadata: {
    playCount?: number;
    interactionCount?: number;
    isOfficialPublisher?: boolean;
  } | null,
  sourceCount = 1,
): SearchResultGroup {
  return {
    songWork: { id: title, title, artists },
    recordings: [{
      recording: { id: `${title}-recording`, durationSec: 240 },
      sourceItems: Array.from({ length: sourceCount }, (_, index) => ({
        id: `${title}-source-${index}`,
        source: index === 0 ? 'bilibili' : 'mock',
        qualityMetadata,
      })),
    }],
  } as unknown as SearchResultGroup;
}

describe('scoreGroup', () => {
  it('ranks an exact song and artist group above a popular noisy result', () => {
    const exactSong = group('Starlight', 'Aurora', null);
    const popularNoise = group('Starlight review vlog', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
    });

    expect(scoreGroup(exactSong, 'Starlight', 'starlight')).toBeGreaterThan(
      scoreGroup(popularNoise, 'Starlight', 'starlight'),
    );
  });

  it('ranks an explicitly qualified song above a popular official near-match', () => {
    const exactSong = group('Starlight', 'Aurora', null);
    const popularNearMatch = group('Starlight Official MV', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);
    const query = 'Starlight - Aurora';

    expect(scoreGroup(exactSong, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(popularNearMatch, query, canonicalTitle(query)),
    );
  });

  it('ranks split song and artist metadata above a popular combined-title candidate', () => {
    const splitMetadataMatch = group('Song', 'Artist', null);
    const combinedTitleCandidate = group('Song Artist', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);

    const query = 'Song - Artist';

    expect(scoreGroup(splitMetadataMatch, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(combinedTitleCandidate, query, canonicalTitle(query)),
    );
  });

  it('keeps an exact whole title authoritative for a whitespace-only query', () => {
    const exactWholeTitle = group('Song Artist', 'The Band', null);
    const splitMetadataMatch = group('Song', 'Artist', null);
    const query = 'Song Artist';

    expect(scoreGroup(exactWholeTitle, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(splitMetadataMatch, query, canonicalTitle(query)),
    );
  });

  it('ranks a reliable artist match above an unrelated popular title hit for a pure artist query', () => {
    const artistMatch = group('Starlight', 'Aurora', null);
    const unrelatedTitleHit = group('Aurora review vlog', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);
    const query = 'Aurora';

    expect(scoreGroup(artistMatch, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(unrelatedTitleHit, query, canonicalTitle(query)),
    );
  });

  it('ranks a reliable artist match above an ordinary title-substring result for a pure artist query', () => {
    const artistMatch = group('Starlight', 'Aurora', null);
    const unrelatedTitleHit = group('Aurora Bright Skies', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);
    const query = 'Aurora';

    expect(scoreGroup(artistMatch, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(unrelatedTitleHit, query, canonicalTitle(query)),
    );
  });

  it('prioritizes explicit title and artist clauses without substring artist matches', () => {
    const splitMetadataMatch = group('Song', 'Artist', null);
    const wholeTitleCandidate = group('Song - Artist', 'The Songwriter', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);
    const query = 'Song - Artist';

    expect(scoreGroup(splitMetadataMatch, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(wholeTitleCandidate, query, canonicalTitle(query)),
    );
  });

  it('parses a no-space em dash as an explicit title-and-artist separator', () => {
    const splitMetadataMatch = group('Song', 'Artist', null);
    const wholeTitleCandidate = group('Song—Artist', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);
    const query = 'Song—Artist';

    expect(scoreGroup(splitMetadataMatch, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(wholeTitleCandidate, query, canonicalTitle(query)),
    );
  });

  it.each(['反应', '教程'])('penalizes the Chinese noise term %s', (noiseTerm) => {
    const musicResult = group('晴天 现场', '周杰伦', null);
    const noiseResult = group(`晴天 ${noiseTerm}`, '视频作者', null);
    const query = '晴天';

    expect(scoreGroup(musicResult, query, canonicalTitle(query))).toBeGreaterThan(
      scoreGroup(noiseResult, query, canonicalTitle(query)),
    );
  });
});

describe('UnifiedSearchService playability gate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes a hit whose only stream option fails preflight', async () => {
    const adapter: SourceAdapter = {
      id: 'open_source',
      displayName: 'Open source test adapter',
      capabilities: { search: true, playOptions: true, health: true },
      search: vi.fn().mockResolvedValue([
        { externalId: 'broken-stream', title: 'Silent Result', artists: 'Nobody' },
      ]),
      getPlayOptions: vi.fn().mockResolvedValue([
        { type: 'stream', payload: 'https://media.example/broken.mp3' },
      ]),
      health: vi.fn().mockResolvedValue({ status: 'healthy', checkedAt: 0 }),
    };
    const registry = new SourceRegistry();
    registry.register(adapter);
    const normalizeAll = vi.fn().mockReturnValue([]);
    const normalizer = { normalizeAll } as unknown as Normalizer;
    const verifier = new PlayabilityVerifier({
      fetchFn: vi.fn().mockResolvedValue(new Response('', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      })) as unknown as typeof fetch,
      resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
    });
    const service = new UnifiedSearchService(registry, normalizer, verifier);

    const result = await service.search({ query: 'Silent Result' });

    expect(result.results).toEqual([]);
    expect(normalizeAll).toHaveBeenCalledWith([
      { sourceId: 'open_source', hit: expect.objectContaining({ externalId: 'broken-stream' }) },
    ]);
    expect(result.errors).toEqual([
      expect.objectContaining({ source: 'open_source', code: 'http_status' }),
    ]);
  });

  it.each([
    [
      'timeout',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      'timeout',
    ],
    [
      'HTTP rejection',
      vi.fn().mockResolvedValue(new Response('', {
        status: 503,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '2' },
      })),
      'http_status',
    ],
    [
      'content rejection',
      vi.fn().mockResolvedValue(new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '2' },
      })),
      'invalid_content_type',
    ],
  ])('surfaces a structured source error for preflight %s', async (_name, fetchFn, expectedCode) => {
    const adapter: SourceAdapter = {
      id: 'openverse',
      displayName: 'Openverse test adapter',
      capabilities: { search: true, playOptions: true, health: true },
      search: vi.fn().mockResolvedValue([
        { externalId: 'candidate', title: 'Candidate', artists: 'Artist' },
      ]),
      getPlayOptions: vi.fn().mockResolvedValue([
        { type: 'stream', payload: 'https://media.example/candidate.mp3' },
      ]),
      health: vi.fn().mockResolvedValue({ status: 'healthy', checkedAt: 0 }),
    };
    const registry = new SourceRegistry();
    registry.register(adapter);
    const normalizer = { normalizeAll: vi.fn().mockReturnValue([]) } as unknown as Normalizer;
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    const result = await new UnifiedSearchService(registry, normalizer, verifier)
      .search({ query: 'candidate' });

    expect(result.errors).toEqual([
      expect.objectContaining({ source: 'openverse', code: expectedCode }),
    ]);
    expect(registry.describe()[0]!.stats).toMatchObject({
      lastPlayabilityErrorCode: expectedCode,
    });
  });

  it('checks only the top eight hits and preserves a per-hit source error', async () => {
    const hits = Array.from({ length: 10 }, (_, index) => ({
      externalId: `hit-${index}`,
      title: `Result ${index}`,
      artists: 'Artist',
    }));
    const getPlayOptions = vi.fn().mockImplementation(async (externalId: string) => {
      if (externalId === 'hit-7') throw Object.assign(new Error('option lookup failed'), { code: 'network' });
      return [{ type: 'embed', payload: externalId }];
    });
    const adapter: SourceAdapter = {
      id: 'bilibili',
      displayName: 'Bilibili test adapter',
      capabilities: { search: true, playOptions: true, health: true },
      search: vi.fn().mockResolvedValue(hits),
      getPlayOptions,
      health: vi.fn().mockResolvedValue({ status: 'healthy', checkedAt: 0 }),
    };
    const registry = new SourceRegistry();
    registry.register(adapter);
    const normalizeAll = vi.fn().mockReturnValue([]);
    const normalizer = { normalizeAll } as unknown as Normalizer;
    const verifier = new PlayabilityVerifier({ fetchFn: vi.fn() as unknown as typeof fetch });
    const service = new UnifiedSearchService(registry, normalizer, verifier);

    const result = await service.search({ query: 'Result' });

    expect(getPlayOptions).toHaveBeenCalledTimes(8);
    expect(normalizeAll.mock.calls[0]![0]).toHaveLength(10);
    expect(result.errors).toEqual([
      { source: 'bilibili', code: 'network', message: 'option lookup failed' },
    ]);
    expect(registry.describe()[0]!.stats.playabilitySuccessRate).toBe(7 / 8);
  });
});
