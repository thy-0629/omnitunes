import { describe, it, expect, beforeEach } from 'vitest';
import { LruTtlCache } from '../../src/modules/cache/lru.js';

describe('LruTtlCache', () => {
  let cache: LruTtlCache<string>;
  let nowMs: number;

  beforeEach(() => {
    nowMs = 1000; // fixed start time
    cache = new LruTtlCache<string>({
      maxEntries: 3,
      defaultTtlMs: 5000,
      now: () => nowMs,
    });
  });

  describe('basic get/set', () => {
    it('returns undefined for missing key', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('returns value after set', () => {
      cache.set('a', 'value-a');
      expect(cache.get('a')).toBe('value-a');
    });

    it('overwrites existing key on set', () => {
      cache.set('a', 'first');
      cache.set('a', 'second');
      expect(cache.get('a')).toBe('second');
    });
  });

  describe('TTL expiry', () => {
    it('returns value within TTL window', () => {
      cache.set('a', 'value', 5000);
      nowMs = 4000; // 3s later, still within 5s TTL
      expect(cache.get('a')).toBe('value');
    });

    it('returns undefined after TTL expires', () => {
      cache.set('a', 'value', 5000);
      nowMs = 6001; // past TTL
      expect(cache.get('a')).toBeUndefined();
    });

    it('deletes expired entry on get', () => {
      cache.set('a', 'value', 5000);
      nowMs = 6001;
      cache.get('a'); // triggers expiry
      expect(cache.size).toBe(0);
    });

    it('does NOT extend TTL on read', () => {
      cache.set('a', 'value', 5000);
      nowMs = 3000; // 2s later, read
      cache.get('a');
      nowMs = 6001; // original TTL still 5000 from createdAt=1000
      expect(cache.get('a')).toBeUndefined();
    });

    it('resets TTL on re-set', () => {
      cache.set('a', 'v1', 5000);
      nowMs = 4000; // 3s later
      cache.set('a', 'v2', 5000); // resets TTL to now=4000
      nowMs = 8999; // just under 5s after re-set, still valid
      expect(cache.get('a')).toBe('v2');
    });
  });

  describe('LRU eviction', () => {
    it('evicts least recently used when at capacity', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      // access 'a' to make it MRU
      cache.get('a');
      // insert 'd' — should evict 'b' (LRU)
      cache.set('d', '4');

      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('a')).toBe('1');
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
    });

    it('eviction count tracked in stats', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.set('d', '4'); // evicts 'a'
      const stats = cache.snapshot();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('prune()', () => {
    it('removes only expired entries', () => {
      cache.set('a', '1', 5000);
      cache.set('b', '2', 10000);
      nowMs = 6001; // 'a' expired, 'b' still valid
      const removed = cache.prune();
      expect(removed).toBe(1);
      expect(cache.get('b')).toBe('2');
    });

    it('returns 0 when nothing expired', () => {
      cache.set('a', '1', 5000);
      nowMs = 2000;
      expect(cache.prune()).toBe(0);
    });
  });

  describe('delete()', () => {
    it('removes entry and returns true', () => {
      cache.set('a', '1');
      expect(cache.delete('a')).toBe(true);
      expect(cache.get('a')).toBeUndefined();
    });

    it('returns false for missing key', () => {
      expect(cache.delete('nope')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('wipes all entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('does NOT reset stats counters', () => {
      cache.set('a', '1');
      cache.get('a');
      cache.clear();
      const stats = cache.snapshot();
      // stats are cumulative — clear only wipes data
      expect(stats.sets).toBe(1);
      expect(stats.hits).toBe(1);
    });
  });

  describe('stats tracking', () => {
    it('tracks hits and misses', () => {
      cache.set('a', '1');
      cache.get('a'); // hit
      cache.get('missing'); // miss
      const stats = cache.snapshot();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('tracks sets count', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      expect(cache.snapshot().sets).toBe(2);
    });

    it('tracks expirations', () => {
      cache.set('a', '1', 5000);
      nowMs = 6001;
      cache.get('a'); // triggers expiration
      expect(cache.snapshot().expirations).toBe(1);
    });
  });
});
