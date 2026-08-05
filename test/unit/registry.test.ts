import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/modules/sources/registry.js';
import { MockAdapter } from '../../src/modules/sources/adapters/mock.js';
import { SourceError, type SourceAdapter, type RawHit, type PlayOption, type HealthSnapshot, type SearchParams } from '../../src/modules/sources/types.js';

describe('SourceRegistry', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  describe('register()', () => {
    it('registers an adapter', () => {
      registry.register(new MockAdapter());
      expect(registry.get('mock')).toBeDefined();
    });

    it('throws on duplicate registration', () => {
      registry.register(new MockAdapter());
      expect(() => registry.register(new MockAdapter())).toThrow(/already registered/);
    });
  });

  describe('get()', () => {
    it('returns registered adapter', () => {
      const mock = new MockAdapter();
      registry.register(mock);
      expect(registry.get('mock')).toBe(mock);
    });

    it('returns undefined for unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('list()', () => {
    it('returns all registered adapters', () => {
      registry.register(new MockAdapter());
      const list = registry.list();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('mock');
    });
  });

  describe('describe()', () => {
    it('returns summary with stats', () => {
      registry.register(new MockAdapter());
      const desc = registry.describe();
      expect(desc).toHaveLength(1);
      expect(desc[0]?.id).toBe('mock');
      expect(desc[0]?.stats.totalCalls).toBe(0);
      expect(desc[0]?.stats.successRate).toBe(1);
      expect(desc[0]?.stats.playabilitySuccessRate).toBeNull();
    });

    it('tracks playability success independently from adapter calls', async () => {
      registry.register(new MockAdapter());
      await registry.instrumentedSearch('mock', { query: 'test' });
      registry.recordPlayability('mock', true);
      registry.recordPlayability('mock', false);

      const stats = registry.describe()[0]!.stats;
      expect(stats.successRate).toBe(1);
      expect(stats.playabilitySuccessRate).toBe(0.5);
    });

    it('retains the latest structured preflight failure reason and retry time', () => {
      registry.register(new MockAdapter());
      registry.recordPlayability('mock', {
        source: 'mock',
        url: 'https://media.example/song.mp3',
        code: 'rate_limited',
        message: 'Media preflight returned HTTP 429',
        retryAt: 123_456,
      });

      expect(registry.describe()[0]!.stats).toMatchObject({
        playabilitySuccessRate: 0,
        lastPlayabilityErrorCode: 'rate_limited',
        lastPlayabilityErrorMessage: 'Media preflight returned HTTP 429',
        lastPlayabilityErrorAt: expect.any(Number),
        playabilityRetryAt: 123_456,
      });
    });
  });

  describe('instrumentedSearch()', () => {
    it('returns results and updates stats', async () => {
      registry.register(new MockAdapter());
      const hits = await registry.instrumentedSearch('mock', { query: 'test', limit: 2 });
      expect(hits).toHaveLength(1);
      const desc = registry.describe();
      expect(desc[0]?.stats.totalCalls).toBe(1);
      expect(desc[0]?.stats.successRate).toBe(1);
    });

    it('records failure stats on error', async () => {
      // Create a failing adapter
      const failingAdapter: SourceAdapter = {
        id: 'failing',
        displayName: 'Failing',
        capabilities: { search: true, playOptions: false, health: true },
        async search(): Promise<RawHit[]> {
          throw new SourceError('failing', 'network', 'connection refused');
        },
        async getPlayOptions(): Promise<PlayOption[]> { return []; },
        async health(): Promise<HealthSnapshot> {
          return { status: 'unavailable', checkedAt: Date.now() };
        },
      };
      registry.register(failingAdapter);

      await expect(registry.instrumentedSearch('failing', { query: 'x' })).rejects.toThrow();
      const desc = registry.describe();
      expect(desc[0]?.stats.totalCalls).toBe(1);
      expect(desc[0]?.stats.successRate).toBe(0);
      expect(desc[0]?.stats.lastErrorCode).toBe('network');
    });

    it('throws on unknown source', async () => {
      await expect(registry.instrumentedSearch('unknown', { query: 'x' })).rejects.toThrow(/unknown source/);
    });
  });

  describe('instrumentedPlayOptions()', () => {
    it('returns play options for mock adapter', async () => {
      registry.register(new MockAdapter());
      const opts = await registry.instrumentedPlayOptions('mock', 'mock-test-0');
      expect(opts).toHaveLength(1);
      expect(opts[0]?.type).toBe('embed');
    });
  });

  describe('healthCheckAll()', () => {
    it('returns health snapshot for all adapters', async () => {
      registry.register(new MockAdapter());
      const health = await registry.healthCheckAll();
      expect(health.mock.status).toBe('healthy');
    });

    it('includes unavailable for failing adapters', async () => {
      const failingAdapter: SourceAdapter = {
        id: 'failing',
        displayName: 'Failing',
        capabilities: { search: false, playOptions: false, health: true },
        async search(): Promise<RawHit[]> { return []; },
        async getPlayOptions(): Promise<PlayOption[]> { return []; },
        async health(): Promise<HealthSnapshot> {
          throw new Error('health check failed');
        },
      };
      registry.register(failingAdapter);

      const health = await registry.healthCheckAll();
      expect(health.failing.status).toBe('unavailable');
      expect(health.failing.message).toContain('health check failed');
    });
  });
});
