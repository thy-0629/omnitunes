import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { LruTtlCache, type LruTtlCacheStats } from '../cache/lru.js';
import type { PlayOption, SourceId } from './types.js';

export type PlayabilityFailureCode =
  | 'unsafe_target'
  | 'redirect_limit'
  | 'http_status'
  | 'rate_limited'
  | 'invalid_content_type'
  | 'invalid_range'
  | 'response_too_large'
  | 'timeout'
  | 'network'
  | 'unsupported_option'
  | 'runtime_failure';

export interface PlayabilityFailure {
  source: SourceId;
  url: string;
  code: PlayabilityFailureCode;
  message: string;
  retryAt?: number;
  status?: number;
}

export interface PlayabilityVerification {
  options: PlayOption[];
  failures: PlayabilityFailure[];
}

export interface PlayabilityUnavailableEvent {
  source: SourceId;
  urls: string[];
  retryAt: number;
}

export interface PlayabilityVerifierOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  successTtlMs?: number;
  failureTtlMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
  cacheMaxEntries?: number;
  maxConcurrentProbes?: number;
  now?: () => number;
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

type ProbeOutcome =
  | { ok: true }
  | { ok: false; failure: PlayabilityFailure };

const VERIFIED_EMBED_SOURCES: ReadonlySet<SourceId> = new Set(['bilibili', 'youtube']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const AUDIO_EXTENSIONS = /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)(?:$)/i;

/**
 * Performs bounded, source-qualified media preflights for remote streams.
 * One application instance owns the cache, in-flight deduplication, and
 * semaphore, so concurrent searches cannot multiply probe concurrency.
 */
export class PlayabilityVerifier {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly successTtlMs: number;
  private readonly failureTtlMs: number;
  private readonly maxBodyBytes: number;
  private readonly maxRedirects: number;
  private readonly now: () => number;
  private readonly resolveHostname: (hostname: string) => Promise<string[]>;
  private readonly cache: LruTtlCache<ProbeOutcome>;
  private readonly inFlight = new Map<string, Promise<ProbeOutcome>>();
  private readonly listeners = new Set<(event: PlayabilityUnavailableEvent) => void>();
  private readonly semaphore: Semaphore;

  constructor(options: PlayabilityVerifierOptions = {}) {
    this.fetchFn = options.fetchFn ?? (undiciFetch as unknown as typeof fetch);
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 3_000);
    this.successTtlMs = Math.max(0, options.successTtlMs ?? 300_000);
    this.failureTtlMs = Math.max(0, options.failureTtlMs ?? 60_000);
    this.maxBodyBytes = Math.max(2, options.maxBodyBytes ?? 1_024);
    this.maxRedirects = Math.max(0, Math.floor(options.maxRedirects ?? 3));
    this.now = options.now ?? Date.now;
    this.resolveHostname = options.resolveHostname ?? resolveDnsAddresses;
    this.cache = new LruTtlCache<ProbeOutcome>({
      maxEntries: Math.max(1, Math.floor(options.cacheMaxEntries ?? 1_000)),
      defaultTtlMs: this.successTtlMs,
      now: this.now,
    });
    this.semaphore = new Semaphore(
      Math.max(1, Math.floor(options.maxConcurrentProbes ?? 8)),
    );
  }

  get cacheStats(): LruTtlCacheStats {
    return this.cache.snapshot();
  }

  onUnavailable(listener: (event: PlayabilityUnavailableEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async verify(source: SourceId, options: PlayOption[]): Promise<PlayabilityVerification> {
    this.cache.prune();
    const checked = await Promise.all(
      options.map(async (option) => ({ option, outcome: await this.verifyOption(source, option) })),
    );
    return {
      options: checked.filter(({ outcome }) => outcome.ok).map(({ option }) => option),
      failures: checked.flatMap(({ outcome }) => outcome.ok ? [] : [outcome.failure]),
    };
  }

  markUnavailable(source: SourceId, options: PlayOption[]): PlayabilityUnavailableEvent | null {
    const now = this.now();
    const retryAt = now + this.failureTtlMs;
    const urls = [...new Set(options
      .filter((option) => option.type === 'stream')
      .map((option) => option.payload))];
    for (const url of urls) {
      const key = cacheKey(source, url);
      this.inFlight.delete(key);
      this.cache.set(key, {
        ok: false,
        failure: {
          source,
          url,
          code: 'runtime_failure',
          message: 'Playback failed at runtime; stream is cooling down before retry',
          retryAt,
        },
      }, this.failureTtlMs);
    }
    if (urls.length === 0) return null;
    const event = { source, urls, retryAt };
    for (const listener of this.listeners) listener(event);
    return event;
  }

  private async verifyOption(source: SourceId, option: PlayOption): Promise<ProbeOutcome> {
    if (option.type === 'local') return { ok: true };
    if (option.type === 'embed') {
      return VERIFIED_EMBED_SOURCES.has(source)
        ? { ok: true }
        : {
            ok: false,
            failure: {
              source,
              url: option.payload,
              code: 'unsupported_option',
              message: `Embed playback is not trusted for source ${source}`,
            },
          };
    }

    const key = cacheKey(source, option.payload);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.semaphore.run(() => this.runTimedProbe(source, option.payload));
    this.inFlight.set(key, promise);
    try {
      const outcome = await promise;
      if (this.inFlight.get(key) === promise) {
        const ttl = outcome.ok
          ? this.successTtlMs
          : Math.max(this.failureTtlMs, (outcome.failure.retryAt ?? 0) - this.now());
        this.cache.set(key, outcome, ttl);
      }
      return outcome;
    } finally {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    }
  }

  private async runTimedProbe(source: SourceId, url: string): Promise<ProbeOutcome> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<ProbeOutcome>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({
          ok: false,
          failure: this.failure(source, url, 'timeout', 'Media preflight timed out'),
        });
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.preflightStream(source, url, controller.signal), timedOut]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async preflightStream(
    source: SourceId,
    initialUrl: string,
    signal: AbortSignal,
  ): Promise<ProbeOutcome> {
    let currentUrl = initialUrl;
    for (let redirectCount = 0; ; redirectCount += 1) {
      const target = await this.validateTarget(source, currentUrl);
      if ('code' in target) return { ok: false, failure: target };
      const dispatcher = createPinnedDispatcher(target.addresses);

      let response: Response;
      try {
        response = await this.fetchFn(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          dispatcher,
          headers: {
            Range: 'bytes=0-1',
            Accept: 'audio/*',
          },
          signal,
        } as unknown as RequestInit);
      } catch (error) {
        await dispatcher.close();
        const timeout = signal.aborted || (error as { name?: string } | null)?.name === 'AbortError';
        return {
          ok: false,
          failure: this.failure(
            source,
            currentUrl,
            timeout ? 'timeout' : 'network',
            timeout ? 'Media preflight timed out' : 'Media preflight request failed',
          ),
        };
      }

      try {
        if (REDIRECT_STATUSES.has(response.status)) {
          if (redirectCount >= this.maxRedirects) {
            return {
              ok: false,
              failure: this.failure(
                source,
                currentUrl,
                'redirect_limit',
                `Media preflight exceeded ${this.maxRedirects} redirects`,
              ),
            };
          }
          const location = response.headers.get('location');
          if (!location) {
            return {
              ok: false,
              failure: this.failure(source, currentUrl, 'http_status', 'Redirect omitted Location'),
            };
          }
          try {
            currentUrl = new URL(location, currentUrl).toString();
          } catch {
            return {
              ok: false,
              failure: this.failure(source, currentUrl, 'unsafe_target', 'Redirect target is invalid'),
            };
          }
          continue;
        }

        if (response.status === 429) {
          const retryAt = parseRetryAfter(response.headers.get('retry-after'), this.now());
          return {
            ok: false,
            failure: {
              ...this.failure(source, currentUrl, 'rate_limited', 'Media preflight returned HTTP 429'),
              status: 429,
              retryAt: retryAt ?? this.now() + this.failureTtlMs,
            },
          };
        }
        if (response.status !== 200 && response.status !== 206) {
          return {
            ok: false,
            failure: {
              ...this.failure(
                source,
                currentUrl,
                'http_status',
                `Media preflight returned HTTP ${response.status}`,
              ),
              status: response.status,
            },
          };
        }

        const contentLength = parseContentLength(response.headers.get('content-length'));
        if (contentLength === null || contentLength > this.maxBodyBytes) {
          return {
            ok: false,
            failure: this.failure(
              source,
              currentUrl,
              'response_too_large',
              contentLength === null
                ? 'Media preflight response size is not bounded'
                : `Media preflight response exceeds ${this.maxBodyBytes} bytes`,
            ),
          };
        }

        const rangeAccepted = response.status === 200 || validContentRange(
          response.headers.get('content-range'),
          contentLength,
        );
        if (!rangeAccepted) {
          return {
            ok: false,
            failure: this.failure(
              source,
              currentUrl,
              'invalid_range',
              'Media server did not honor the bounded byte range',
            ),
          };
        }

        const contentType = (response.headers.get('content-type') ?? '')
          .split(';', 1)[0]!
          .trim()
          .toLowerCase();
        if (!isAcceptedAudioType(contentType, currentUrl, response.status, rangeAccepted)) {
          return {
            ok: false,
            failure: this.failure(
              source,
              currentUrl,
              'invalid_content_type',
              `Expected an audio response, received ${contentType || 'no content type'}`,
            ),
          };
        }
        return { ok: true };
      } finally {
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close();
      }
    }
  }

  private async validateTarget(
    source: SourceId,
    rawUrl: string,
  ): Promise<PlayabilityFailure | { addresses: string[] }> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return this.failure(source, rawUrl, 'unsafe_target', 'Media target is not a valid URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      return this.failure(
        source,
        rawUrl,
        'unsafe_target',
        'Media target must be credential-free HTTPS',
      );
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return this.failure(source, rawUrl, 'unsafe_target', 'Media target hostname is not public');
    }

    let addresses: string[];
    try {
      addresses = isIP(hostname) ? [hostname] : await this.resolveHostname(hostname);
    } catch {
      return this.failure(source, rawUrl, 'network', 'Media target DNS lookup failed');
    }
    if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
      return this.failure(source, rawUrl, 'unsafe_target', 'Media target resolved outside public networks');
    }
    return { addresses };
  }

  private failure(
    source: SourceId,
    url: string,
    code: PlayabilityFailureCode,
    message: string,
  ): PlayabilityFailure {
    return {
      source,
      url,
      code,
      message,
      retryAt: this.now() + this.failureTtlMs,
    };
  }
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }
}

async function resolveDnsAddresses(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

function cacheKey(source: SourceId, url: string): string {
  return JSON.stringify([source, url]);
}

function createPinnedDispatcher(addresses: string[]): Agent {
  const records = addresses.map((address) => ({
    address,
    family: isIP(address) as 4 | 6,
  }));
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, records);
      return;
    }
    const first = records[0]!;
    callback(null, first.address, first.family);
  };
  return new Agent({ connect: { lookup: pinnedLookup } });
}

function parseContentLength(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function validContentRange(raw: string | null, contentLength: number): boolean {
  const match = /^bytes\s+(\d+)-(\d+)\/(?:\d+|\*)$/i.exec(raw ?? '');
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start === 0 && end >= start && end <= 1 && contentLength === end - start + 1;
}

function isAcceptedAudioType(
  contentType: string,
  url: string,
  status: number,
  rangeAccepted: boolean,
): boolean {
  if (contentType.startsWith('audio/')) return true;
  if (contentType === 'application/ogg' || contentType === 'application/x-ogg') return true;
  if (contentType !== 'application/octet-stream' || status !== 206 || !rangeAccepted) return false;
  try {
    return AUDIO_EXTENSIONS.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function parseRetryAfter(raw: string | null, now: number): number | undefined {
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return now + Math.ceil(seconds * 1_000);
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) && timestamp > now ? timestamp : undefined;
}

function isPublicAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;

  const mapped = /(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('2001:db8:')) return false;
  const first = Number.parseInt(normalized.split(':', 1)[0] || '0', 16);
  return first >= 0x2000 && first <= 0x3fff;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}
