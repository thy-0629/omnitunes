/**
 * Source adapter contract.
 *
 * Every music source (YouTube, open-source catalogs, local files, future ones)
 * implements this interface. The unified search / playback layer in §四 / §五
 * depends ONLY on this contract — adding a new source means writing one class.
 *
 * Conventions:
 *   - Adapters are stateless. They can keep an in-memory cache if useful but
 *     must NOT carry per-request state.
 *   - `search()` returns RAW hits (per-source fields). Normalization to the
 *     five-layer model (SongWork / Recording / SourceItem) happens in §四.
 *   - Errors should be thrown as `SourceError` so the orchestrator can classify.
 */

export type SourceId = 'youtube' | 'open_source' | 'local' | 'mock' | 'bilibili';

export const KNOWN_SOURCE_IDS: readonly SourceId[] = ['youtube', 'open_source', 'local', 'mock', 'bilibili'];

export interface SourceCapabilities {
  /** can answer `search()` queries. */
  search: boolean;
  /** can resolve `externalId` -> playable payload. */
  playOptions: boolean;
  /** can report a health snapshot. */
  health: boolean;
}

export interface SearchParams {
  query: string;
  /** 1..50, defaults to 20. */
  limit?: number;
  /** adapter-specific hints (locale, video category, etc.). */
  hints?: Record<string, unknown>;
}

export interface SourceQualityMetadata {
  playCount?: number;
  interactionCount?: number;
  isOfficialPublisher?: boolean;
}

export interface SourceAttributionMetadata {
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  creator: string;
}

export interface RawHit {
  /** unique within this adapter (becomes SourceItem.externalId). */
  externalId: string;
  title: string;
  artists: string;
  durationSec?: number;
  thumbnailUrl?: string;
  publisher?: string;
  /** adapter-specific metadata, e.g. youtube videoId, local file mtime. */
  metadata?: Record<string, unknown> & {
    quality?: SourceQualityMetadata;
    attribution?: SourceAttributionMetadata;
  };
}

export type PlayOptionType = 'embed' | 'stream' | 'local';

export interface PlayOption {
  type: PlayOptionType;
  /** embed: videoId · stream: signed URL · local: relative path */
  payload: string;
  /** epoch ms when this option expires (signed URLs etc.). null = no expiry. */
  expiresAt?: number | null;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface HealthSnapshot {
  status: HealthStatus;
  message?: string;
  /** epoch ms when measured. */
  checkedAt: number;
}

export interface SourceAdapter {
  readonly id: SourceId;
  readonly displayName: string;
  readonly capabilities: SourceCapabilities;

  /** Return raw hits; empty array on no results. Throw `SourceError` on failure. */
  search(params: SearchParams): Promise<RawHit[]>;

  /** Resolve a previously-returned externalId into one or more ways to play. */
  getPlayOptions(externalId: string): Promise<PlayOption[]>;

  /** Cheap liveness probe. Should NOT throw — return a snapshot instead. */
  health(): Promise<HealthSnapshot>;
}

// -----------------------------------------------------------------------------
// error model
// -----------------------------------------------------------------------------

export type SourceErrorCode =
  | 'embed_blocked' // platform refuses to embed (regional / age / etc.)
  | 'source_gone'   // item removed or video taken down
  | 'codec_unsupported'
  | 'network'        // transient network failure
  | 'rate_limited'
  | 'unauthorized'   // missing / bad API key
  | 'unknown';

export class SourceError extends Error {
  constructor(
    public readonly sourceId: SourceId,
    public readonly code: SourceErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}
