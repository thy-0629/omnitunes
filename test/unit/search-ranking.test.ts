import { describe, expect, it } from 'vitest';
import { canonicalTitle } from '../../src/modules/search/normalizer.js';
import { scoreGroup, type SearchResultGroup } from '../../src/modules/search/service.js';

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
