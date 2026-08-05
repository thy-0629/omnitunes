import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';
import { parseRetryAfter, SourceError } from '../types.js';

const API_ROOT = 'https://api.openverse.org/v1/audio/';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;

interface OpenverseRecord {
  id: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  streamUrl: string;
  durationSec?: number;
  thumbnailUrl?: string;
}

interface CacheEntry {
  record: OpenverseRecord;
  expiresAt: number;
}

export class OpenverseAdapter implements SourceAdapter {
  readonly id = 'openverse' as const;
  readonly displayName = 'Openverse';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly cache = new Map<string, CacheEntry>();
  private rateLimitRetryAt = 0;

  constructor(options: {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
    cacheTtlMs?: number;
    cacheMaxEntries?: number;
  } = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
    this.cacheMaxEntries = Math.max(1, Math.floor(options.cacheMaxEntries ?? CACHE_MAX_ENTRIES));
  }

  async search(params: SearchParams): Promise<RawHit[]> {
    const query = params.query.trim();
    if (!query) return [];
    const limit = Math.max(1, Math.min(50, params.limit ?? 20));
    const url = new URL(API_ROOT);
    url.searchParams.set('q', query);
    url.searchParams.set('category', 'music');
    url.searchParams.set('page_size', String(limit));

    const json = await this.getJson(url.toString(), 'search');
    const records = parseOpenverseRecords(json);
    this.remember(records);
    return records.map(toRawHit);
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    if (!externalId) return [];
    let record = this.readCache(externalId);
    if (!record) {
      const json = await this.getJson(`${API_ROOT}${encodeURIComponent(externalId)}/`, 'detail');
      const fetched = parseOpenverseRecord(json);
      if (!fetched || fetched.id !== externalId) return [];
      record = fetched;
      this.remember([fetched]);
    }
    return [{ type: 'stream', payload: record.streamUrl, expiresAt: null }];
  }

  async health(): Promise<HealthSnapshot> {
    try {
      const response = await this.fetchWithTimeout(`${API_ROOT}?q=music&category=music&page_size=1`);
      return {
        status: response.ok ? 'healthy' : 'degraded',
        message: response.ok ? undefined : `HTTP ${response.status}`,
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        status: 'unavailable',
        message: error instanceof Error ? error.message : String(error),
        checkedAt: Date.now(),
      };
    }
  }

  private remember(records: OpenverseRecord[]): void {
    const now = Date.now();
    const expiresAt = now + this.cacheTtlMs;
    this.pruneCache(now);
    for (const record of records) {
      this.cache.delete(record.id);
      this.cache.set(record.id, { record, expiresAt });
      while (this.cache.size > this.cacheMaxEntries) {
        const oldestId = this.cache.keys().next().value as string | undefined;
        if (oldestId === undefined) break;
        this.cache.delete(oldestId);
      }
    }
  }

  private readCache(id: string): OpenverseRecord | undefined {
    const entry = this.cache.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt > Date.now()) return entry.record;
    this.cache.delete(id);
    return undefined;
  }

  private pruneCache(now: number): void {
    for (const [id, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(id);
    }
  }

  private async getJson(url: string, operation: string): Promise<unknown> {
    if (this.rateLimitRetryAt > Date.now()) {
      throw new SourceError(
        this.id,
        'rate_limited',
        `Openverse ${operation} is cooling down after rate limiting`,
        undefined,
        this.rateLimitRetryAt,
      );
    }
    let response: Response;
    try {
      response = await this.fetchWithTimeout(url);
    } catch (error) {
      throw new SourceError(this.id, 'network', `Openverse ${operation} request failed`, error);
    }
    if (response.status === 404) {
      throw new SourceError(this.id, 'source_gone', `Openverse audio not found: ${url}`);
    }
    if (response.status === 429) {
      this.rateLimitRetryAt = parseRetryAfter(response.headers.get('retry-after'))
        ?? Date.now() + 60_000;
      throw new SourceError(
        this.id,
        'rate_limited',
        `Openverse ${operation} HTTP 429`,
        undefined,
        this.rateLimitRetryAt,
      );
    }
    if (!response.ok) {
      throw new SourceError(this.id, 'network', `Openverse ${operation} HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new SourceError(this.id, 'unknown', `Openverse ${operation} returned invalid JSON`, error);
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseOpenverseResponse(json: unknown): RawHit[] {
  return parseOpenverseRecords(json).map(toRawHit);
}

function parseOpenverseRecords(json: unknown): OpenverseRecord[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results
    .map(parseOpenverseRecord)
    .filter((record): record is OpenverseRecord => record !== null);
}

function parseOpenverseRecord(value: unknown): OpenverseRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw['mature'] !== false ||
    !isNonEmptyString(raw['id']) ||
    !isNonEmptyString(raw['title']) ||
    !isNonEmptyString(raw['creator']) ||
    !isNonEmptyString(raw['license']) ||
    !isHttpsUrl(raw['license_url']) ||
    !isHttpsUrl(raw['foreign_landing_url']) ||
    !isHttpsUrl(raw['url'])
  ) {
    return null;
  }

  const duration = raw['duration'];
  const thumbnail = raw['thumbnail'];
  return {
    id: raw['id'].trim(),
    title: raw['title'].trim(),
    creator: raw['creator'].trim(),
    license: raw['license'].trim(),
    licenseUrl: raw['license_url'],
    sourceUrl: raw['foreign_landing_url'],
    streamUrl: raw['url'],
    durationSec:
      typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
        ? duration / 1000
        : undefined,
    thumbnailUrl: isHttpsUrl(thumbnail) ? thumbnail : undefined,
  };
}

function toRawHit(record: OpenverseRecord): RawHit {
  return {
    externalId: record.id,
    title: record.title,
    artists: record.creator,
    durationSec: record.durationSec,
    thumbnailUrl: record.thumbnailUrl,
    publisher: 'Openverse',
    metadata: {
      url: record.sourceUrl,
      attribution: {
        license: record.license,
        licenseUrl: record.licenseUrl,
        sourceUrl: record.sourceUrl,
        creator: record.creator,
      },
      directStreamUrl: record.streamUrl,
    },
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
