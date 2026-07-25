/**
 * Tiny in-memory LRU + TTL cache.
 *
 * Why hand-rolled instead of pulling in lru-cache: we want zero new dev deps,
 * ~80 lines is fine, and we want tight control over TTL semantics (the
 * online-first 铁律 means short TTLs and explicit hit/miss telemetry).
 *
 * Semantics:
 *   - `get(key)` returns undefined when missing OR expired. Caller decides
 *     what to do — usually fall back to a live call.
 *   - `set(key, value)` overwrites and re-pins to MRU end.
 *   - On overflow, the LEAST RECENTLY used (read or write) entry is evicted.
 *   - TTL is "createdAt + ttlMs"; refreshed on write but NOT on read
 *     (read does NOT extend TTL — common pitfall).
 *   - Process-local, not persisted. Server restart = empty cache.
 *     The 项目定位铁律 says: "不下载、不提取音轨、收藏歌曲而非链接" —
 *     i.e. we fetch live every time. Cache is just an accelerator for
 *     rapid repeat lookups in the same session, NOT an offline store.
 */

interface Entry<V> {
  value: V;
  /** ms epoch when this entry was created. Quoted as < createdAt + ttlMs. */
  createdAt: number;
  /** ms TTL window. */
  ttlMs: number;
}

export interface LruTtlCacheOptions {
  /** max entries before LRU eviction kicks in. */
  maxEntries: number;
  /** default TTL in milliseconds, used when set() doesn't override. */
  defaultTtlMs: number;
  /** callable to obtain the current time — defaults to Date.now. Override in tests. */
  now?: () => number;
}

export interface LruTtlCacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  expirations: number;
  evictions: number;
  sets: number;
}

export class LruTtlCache<V> {
  private store = new Map<string, Entry<V>>();
  private stats = {
    hits: 0,
    misses: 0,
    expirations: 0,
    evictions: 0,
    sets: 0,
  };

  constructor(private readonly opts: LruTtlCacheOptions) {}

  /** Returns the cached value if present and not expired; otherwise undefined. */
  get(key: string): V | undefined {
    const now = this.now();
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (now - entry.createdAt >= entry.ttlMs) {
      // expired — remove and report miss
      this.store.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return undefined;
    }
    // Hit: refresh LRU position by re-inserting
    this.store.delete(key);
    this.store.set(key, entry);
    this.stats.hits++;
    return entry.value;
  }

  /** Store a value. If key already exists, overwrites and resets TTL. */
  set(key: string, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.opts.defaultTtlMs;
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, {
      value,
      createdAt: this.now(),
      ttlMs: ttl,
    });
    this.stats.sets++;

    // LRU eviction
    while (this.store.size > this.opts.maxEntries) {
      // first key = least recently used (Maps preserve insertion order)
      const oldest = this.store.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
      this.stats.evictions++;
    }
  }

  /** Delete a key if present. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Remove every entry whose TTL has elapsed. Returns the number of removals. */
  prune(): number {
    const now = this.now();
    let removed = 0;
    for (const [k, entry] of this.store) {
      if (now - entry.createdAt >= entry.ttlMs) {
        this.store.delete(k);
        removed++;
      }
    }
    this.stats.expirations += removed;
    return removed;
  }

  /** Wipe everything. */
  clear(): void {
    this.store.clear();
  }

  /** Current entry count. */
  get size(): number {
    return this.store.size;
  }

  /** Telemetry for /api/admin/cache endpoints. */
  snapshot(): LruTtlCacheStats {
    return {
      size: this.store.size,
      maxEntries: this.opts.maxEntries,
      ...this.stats,
    };
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }
}
