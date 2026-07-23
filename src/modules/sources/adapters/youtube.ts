import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';
import { SourceError } from '../types.js';

/**
 * YouTubeAdapter — Data API v3 search + IFrame playback.
 *
 * IMPORTANT — design rules (from product spec, §三):
 *   - We DO NOT extract audio / download videos. Playback is IFrame embed
 *     using the returned `videoId`. Streaming the audio in our own player
 *     would violate YouTube TOS.
 *   - When `apiKey` is absent we report `unavailable` rather than failing
 *     every search call. Callers should treat this source as disabled.
 *
 * The actual HTTP call to Data API is left as a TODO — wired up in a later
 * commit once an API key is provided. For now this adapter returns
 * deterministic offline results so the rest of the stack can be developed.
 */
export class YouTubeAdapter implements SourceAdapter {
  readonly id = 'youtube' as const;
  readonly displayName = 'YouTube';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  constructor(private readonly apiKey: string | undefined) {}

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async search(params: SearchParams): Promise<RawHit[]> {
    if (!this.enabled) {
      throw new SourceError(
        this.id,
        'unauthorized',
        'YOUTUBE_API_KEY not configured; YouTube source is disabled',
      );
    }
    // TODO: replace with real fetch to
    //   https://www.googleapis.com/youtube/v3/search?part=snippet&q=...&key=...
    // For now we deliberately do NOT call the network: the contract is what
    // matters at this stage, and a working contract lets §四 / §五 be built
    // against it. See the `Wired` test in test/ for a smoke check.
    return [
      {
        externalId: `yt-offline-${slug(params.query)}`,
        title: `${params.query} (YouTube, not yet wired)`,
        artists: 'YouTube',
        durationSec: undefined,
        publisher: 'YouTube',
        metadata: { offline: true },
      },
    ];
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    if (!externalId) return [];
    return [
      {
        type: 'embed',
        payload: externalId,
        // IFrame doesn't expire; leave null
        expiresAt: null,
      },
    ];
  }

  async health(): Promise<HealthSnapshot> {
    if (!this.enabled) {
      return {
        status: 'unavailable',
        message: 'YOUTUBE_API_KEY not set',
        checkedAt: Date.now(),
      };
    }
    return { status: 'healthy', checkedAt: Date.now() };
  }
}

function slug(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'q';
}