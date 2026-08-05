import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';
import { SourceError } from '../types.js';

const API_URL = 'https://commons.wikimedia.org/w/api.php';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;

interface CommonsRecord {
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  streamUrl: string;
}

interface CacheEntry {
  record: CommonsRecord;
  expiresAt: number;
}

export class WikimediaCommonsAdapter implements SourceAdapter {
  readonly id = 'wikimedia' as const;
  readonly displayName = 'Wikimedia Commons';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly cache = new Map<string, CacheEntry>();

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
    const url = this.baseQuery();
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrsearch', `${query} filetype:audio`);
    url.searchParams.set('gsrlimit', String(limit));

    const records = parseWikimediaRecords(await this.getJson(url.toString(), 'search'));
    this.remember(records);
    return records.map(toRawHit);
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    if (!externalId) return [];
    let record = this.readCache(externalId);
    if (!record) {
      const url = this.baseQuery();
      url.searchParams.set('titles', externalId);
      const records = parseWikimediaRecords(await this.getJson(url.toString(), 'title lookup'));
      record = records.find((candidate) => candidate.title === externalId);
      if (!record) return [];
      this.remember([record]);
    }
    return [{ type: 'stream', payload: record.streamUrl, expiresAt: null }];
  }

  async health(): Promise<HealthSnapshot> {
    const url = this.baseQuery();
    url.searchParams.set('titles', 'File:Example.ogg');
    try {
      const response = await this.fetchWithTimeout(url.toString());
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

  private baseQuery(): URL {
    const url = new URL(API_URL);
    url.searchParams.set('action', 'query');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|extmetadata');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('origin', '*');
    return url;
  }

  private remember(records: CommonsRecord[]): void {
    const now = Date.now();
    const expiresAt = now + this.cacheTtlMs;
    this.pruneCache(now);
    for (const record of records) {
      this.cache.delete(record.title);
      this.cache.set(record.title, { record, expiresAt });
      while (this.cache.size > this.cacheMaxEntries) {
        const oldestTitle = this.cache.keys().next().value as string | undefined;
        if (oldestTitle === undefined) break;
        this.cache.delete(oldestTitle);
      }
    }
  }

  private readCache(title: string): CommonsRecord | undefined {
    const entry = this.cache.get(title);
    if (!entry) return undefined;
    if (entry.expiresAt > Date.now()) return entry.record;
    this.cache.delete(title);
    return undefined;
  }

  private pruneCache(now: number): void {
    for (const [title, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(title);
    }
  }

  private async getJson(url: string, operation: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(url);
    } catch (error) {
      throw new SourceError(this.id, 'network', `Wikimedia Commons ${operation} request failed`, error);
    }
    if (response.status === 404) {
      throw new SourceError(this.id, 'source_gone', `Wikimedia Commons file not found: ${url}`);
    }
    if (!response.ok) {
      throw new SourceError(
        this.id,
        'network',
        `Wikimedia Commons ${operation} HTTP ${response.status}`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new SourceError(
        this.id,
        'unknown',
        `Wikimedia Commons ${operation} returned invalid JSON`,
        error,
      );
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

export function parseWikimediaResponse(json: unknown): RawHit[] {
  return parseWikimediaRecords(json).map(toRawHit);
}

function parseWikimediaRecords(json: unknown): CommonsRecord[] {
  const pages = (json as { query?: { pages?: unknown } } | null)?.query?.pages;
  const values = Array.isArray(pages)
    ? pages
    : pages && typeof pages === 'object'
      ? Object.values(pages)
      : [];
  return values.map(parseWikimediaPage).filter((record): record is CommonsRecord => record !== null);
}

function parseWikimediaPage(value: unknown): CommonsRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  const imageInfo = Array.isArray(page['imageinfo']) ? page['imageinfo'][0] : undefined;
  if (!imageInfo || typeof imageInfo !== 'object' || Array.isArray(imageInfo)) return null;
  const info = imageInfo as Record<string, unknown>;
  const extMetadata = info['extmetadata'];
  if (!extMetadata || typeof extMetadata !== 'object' || Array.isArray(extMetadata)) return null;
  const metadata = extMetadata as Record<string, unknown>;

  const title = readString(page['title']);
  const creator = stripHtml(readMetadataValue(metadata['Artist']));
  const license = stripHtml(readMetadataValue(metadata['LicenseShortName']));
  const licenseUrl = readMetadataValue(metadata['LicenseUrl']);
  const sourceUrl = readString(info['descriptionurl']);
  const streamUrl = readString(info['url']);
  if (
    !title ||
    !creator ||
    !license ||
    !isHttpsUrl(licenseUrl) ||
    !isHttpsUrl(sourceUrl) ||
    !isHttpsUrl(streamUrl)
  ) {
    return null;
  }
  return { title, creator, license, licenseUrl, sourceUrl, streamUrl };
}

function toRawHit(record: CommonsRecord): RawHit {
  return {
    externalId: record.title,
    title: stripFileExtension(record.title),
    artists: record.creator,
    publisher: 'Wikimedia Commons',
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

function readMetadataValue(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return readString((value as Record<string, unknown>)['value']);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFileExtension(title: string): string {
  return title.replace(/^File:/i, '').replace(/\.[^.]+$/, '').trim();
}

function isHttpsUrl(value: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
