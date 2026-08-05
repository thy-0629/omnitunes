import { describe, expect, it } from 'vitest';
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

  it('ranks an artist-qualified song above a popular official near-match', () => {
    const exactSong = group('晴天', '周杰伦', null);
    const popularNearMatch = group('晴天 Official MV', 'Unrelated Creator', {
      playCount: 10_000_000_000,
      interactionCount: 10_000_000_000,
      isOfficialPublisher: true,
    }, 2);

    expect(scoreGroup(exactSong, '晴天 周杰伦', '晴天 周杰伦')).toBeGreaterThan(
      scoreGroup(popularNearMatch, '晴天 周杰伦', '晴天 周杰伦'),
    );
  });
});
