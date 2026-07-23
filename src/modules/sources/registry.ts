import type {
  HealthSnapshot,
  RawHit,
  SearchParams,
  SourceAdapter,
  SourceId,
} from './types.js';

interface SourceStats {
  totalCalls: number;
  successCalls: number;
  totalLatencyMs: number;
  lastErrorCode?: string;
  lastErrorAt?: number;
  lastErrorMessage?: string;
}

/**
 * In-process registry of all enabled source adapters + their rollup stats.
 *
 * The registry owns:
 *   - The set of registered adapters (one per SourceId).
 *   - Lightweight, in-memory stats: success rate, average latency, last error.
 *   - A `healthCheckAll()` helper used by /api/sources/:id/health and any
 *     background watchdog.
 *
 * Persistent stats live in the `source_health` table — §三 orchestrator writes
 * to it on every call. This registry is the runtime mirror of that table.
 */
export class SourceRegistry {
  private readonly adapters = new Map<SourceId, SourceAdapter>();
  private readonly stats = new Map<SourceId, SourceStats>();

  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`source adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
    this.stats.set(adapter.id, {
      totalCalls: 0,
      successCalls: 0,
      totalLatencyMs: 0,
    });
  }

  get(id: SourceId): SourceAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Summary view used by GET /api/sources. */
  describe(): Array<{
    id: SourceId;
    displayName: string;
    capabilities: SourceAdapter['capabilities'];
    stats: {
      totalCalls: number;
      successRate: number;
      avgLatencyMs: number;
      lastErrorCode?: string;
      lastErrorAt?: number;
    };
  }> {
    return this.list().map((a) => {
      const s = this.stats.get(a.id)!;
      const successRate = s.totalCalls === 0 ? 1 : s.successCalls / s.totalCalls;
      const avgLatencyMs = s.totalCalls === 0 ? 0 : s.totalLatencyMs / s.totalCalls;
      return {
        id: a.id,
        displayName: a.displayName,
        capabilities: a.capabilities,
        stats: {
          totalCalls: s.totalCalls,
          successRate,
          avgLatencyMs,
          lastErrorCode: s.lastErrorCode,
          lastErrorAt: s.lastErrorAt,
        },
      };
    });
  }

  /**
   * Wrap an adapter call so we automatically record stats. Throws on failure
   * (caller can decide whether to fallback).
   */
  async instrumentedSearch(
    id: SourceId,
    params: SearchParams,
  ): Promise<RawHit[]> {
    const adapter = this.requireAdapter(id);
    const start = Date.now();
    try {
      const hits = await adapter.search(params);
      this.recordResult(id, true, Date.now() - start);
      return hits;
    } catch (err) {
      this.recordResult(id, false, Date.now() - start, err);
      throw err;
    }
  }

  async instrumentedPlayOptions(
    id: SourceId,
    externalId: string,
  ): Promise<ReturnType<SourceAdapter['getPlayOptions']>> {
    const adapter = this.requireAdapter(id);
    const start = Date.now();
    try {
      const opts = await adapter.getPlayOptions(externalId);
      this.recordResult(id, true, Date.now() - start);
      return opts;
    } catch (err) {
      this.recordResult(id, false, Date.now() - start, err);
      throw err;
    }
  }

  /**
   * Probe every adapter. Failures are recorded but never thrown — callers get
   * a `Record<SourceId, HealthSnapshot>` regardless of partial outages.
   */
  async healthCheckAll(): Promise<Record<SourceId, HealthSnapshot>> {
    const out: Partial<Record<SourceId, HealthSnapshot>> = {};
    for (const adapter of this.list()) {
      const start = Date.now();
      try {
        const snap = await adapter.health();
        out[adapter.id] = { ...snap, checkedAt: snap.checkedAt ?? Date.now() };
        this.recordResult(adapter.id, snap.status === 'healthy', Date.now() - start);
      } catch (err) {
        out[adapter.id] = {
          status: 'unavailable',
          message: err instanceof Error ? err.message : String(err),
          checkedAt: Date.now(),
        };
        this.recordResult(adapter.id, false, Date.now() - start, err);
      }
    }
    return out as Record<SourceId, HealthSnapshot>;
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private requireAdapter(id: SourceId): SourceAdapter {
    const a = this.adapters.get(id);
    if (!a) throw new Error(`unknown source: ${id}`);
    return a;
  }

  private recordResult(
    id: SourceId,
    ok: boolean,
    latencyMs: number,
    err?: unknown,
  ): void {
    const s = this.stats.get(id);
    if (!s) return; // never happens if register() was called
    s.totalCalls += 1;
    s.totalLatencyMs += latencyMs;
    if (ok) {
      s.successCalls += 1;
    } else {
      s.lastErrorAt = Date.now();
      s.lastErrorCode =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'unknown';
      s.lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
  }
}