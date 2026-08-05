import type { PlayOption, SourceId } from './types.js';

export interface PlayabilityVerifierOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  successTtlMs?: number;
  failureTtlMs?: number;
  maxBodyBytes?: number;
}

interface CachedOutcome {
  ok: boolean;
  expiresAt: number;
}

const VERIFIED_EMBED_SOURCES: ReadonlySet<SourceId> = new Set(['bilibili', 'youtube']);

/**
 * Performs a bounded preflight before remote stream options can be shown or
 * persisted. Results are cached by stream URL so search fan-out does not
 * repeatedly probe the same media endpoint.
 */
export class PlayabilityVerifier {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly successTtlMs: number;
  private readonly failureTtlMs: number;
  private readonly maxBodyBytes: number;
  private readonly cache = new Map<string, CachedOutcome>();

  constructor(options: PlayabilityVerifierOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.successTtlMs = options.successTtlMs ?? 300_000;
    this.failureTtlMs = options.failureTtlMs ?? 60_000;
    this.maxBodyBytes = Math.max(1, options.maxBodyBytes ?? 1_024);
  }

  async verify(source: SourceId, options: PlayOption[]): Promise<PlayOption[]> {
    const verified = await Promise.all(
      options.map(async (option) => ({ option, ok: await this.verifyOption(source, option) })),
    );
    return verified.filter(({ ok }) => ok).map(({ option }) => option);
  }

  markUnavailable(_source: SourceId, options: PlayOption[]): void {
    const now = Date.now();
    for (const option of options) {
      if (option.type === 'stream') {
        this.cache.set(option.payload, { ok: false, expiresAt: now + this.failureTtlMs });
      }
    }
  }

  private async verifyOption(source: SourceId, option: PlayOption): Promise<boolean> {
    if (option.type === 'local') return true;
    if (option.type === 'embed') return VERIFIED_EMBED_SOURCES.has(source);

    const cached = this.cache.get(option.payload);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.ok;
    if (cached) this.cache.delete(option.payload);

    const ok = await this.preflightStream(option.payload);
    this.cache.set(option.payload, {
      ok,
      expiresAt: now + (ok ? this.successTtlMs : this.failureTtlMs),
    });
    return ok;
  }

  private async preflightStream(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const rangeEnd = Math.min(1, this.maxBodyBytes - 1);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Range: `bytes=0-${rangeEnd}`,
          Accept: 'audio/*',
        },
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      const statusAccepted = response.status === 200 || response.status === 206;
      const contentAccepted = contentType.length > 0 && !contentType.includes('html');

      await response.body?.cancel().catch(() => undefined);
      return statusAccepted && contentAccepted;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
