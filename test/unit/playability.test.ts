import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/db/schema.js';
import { playableOptions } from '../../src/db/schema.js';
import { CachedPlaybackOrchestrator } from '../../src/modules/cache/layers.js';
import { LruTtlCache } from '../../src/modules/cache/lru.js';
import { Normalizer } from '../../src/modules/search/normalizer.js';
import {
  PlaybackOrchestrator,
  type ResolvePlayResult,
} from '../../src/modules/playback/orchestrator.js';
import { PlayabilityVerifier } from '../../src/modules/sources/playability.js';
import { SourceRegistry } from '../../src/modules/sources/registry.js';
import type { PlayOption, SourceAdapter, SourceId } from '../../src/modules/sources/types.js';

describe('PlayabilityVerifier', () => {
  it('accepts a bytes=0-1 206 response regardless of configured body limit', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue({
      status: 206,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      body: { cancel },
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      maxBodyBytes: 1,
    });
    const option = { type: 'stream' as const, payload: 'https://media.example/song.mp3' };

    await expect(verifier.verify('open_source', [option])).resolves.toEqual([option]);
    expect(fetchFn).toHaveBeenCalledWith(
      option.payload,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Range: 'bytes=0-1',
          Accept: 'audio/*',
        }),
      }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects a 200 HTML stream response', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      body: { cancel },
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(verifier.verify('open_source', [
      { type: 'stream', payload: 'https://media.example/not-a-song' },
    ])).resolves.toEqual([]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('accepts only official embeds and never fetches local options', async () => {
    const fetchFn = vi.fn();
    const verifier = new PlayabilityVerifier({ fetchFn: fetchFn as unknown as typeof fetch });
    const embed = { type: 'embed' as const, payload: 'video-id' };
    const local = { type: 'local' as const, payload: 'album/song.flac' };

    await expect(verifier.verify('youtube', [embed])).resolves.toEqual([embed]);
    await expect(verifier.verify('bilibili', [embed])).resolves.toEqual([embed]);
    await expect(verifier.verify('mock', [embed])).resolves.toEqual([]);
    await expect(verifier.verify('local', [local])).resolves.toEqual([local]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('caches stream outcomes by URL and lets runtime failures override success', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 206,
      headers: new Headers({ 'content-type': 'audio/ogg' }),
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    });
    const verifier = new PlayabilityVerifier({ fetchFn: fetchFn as unknown as typeof fetch });
    const stream = { type: 'stream' as const, payload: 'https://media.example/cached.ogg' };

    await expect(verifier.verify('open_source', [stream])).resolves.toEqual([stream]);
    await expect(verifier.verify('open_source', [stream])).resolves.toEqual([stream]);
    verifier.markUnavailable('open_source', [stream]);
    await expect(verifier.verify('open_source', [stream])).resolves.toEqual([]);

    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

describe('PlaybackOrchestrator playability feedback', () => {
  it('does not return a cached failed stream after fallback', async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });

    try {
      const registry = new SourceRegistry();
      registry.register(adapter('open_source', 'cached-stream', [{
        type: 'stream',
        payload: 'https://media.example/cached-live.mp3',
      }]));
      registry.register(adapter('youtube', 'cached-embed', [
        { type: 'embed', payload: 'official-id' },
      ]));
      const [streamEntry] = new Normalizer(db).normalizeAll([
        {
          sourceId: 'open_source',
          hit: { externalId: 'cached-stream', title: 'Cached Song', artists: 'Artist', durationSec: 180 },
        },
        {
          sourceId: 'youtube',
          hit: { externalId: 'cached-embed', title: 'Cached Song', artists: 'Artist', durationSec: 180 },
        },
      ]);
      const fetchFn = vi.fn().mockResolvedValue({
        status: 206,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      });
      const verifier = new PlayabilityVerifier({ fetchFn: fetchFn as unknown as typeof fetch });
      const inner = new PlaybackOrchestrator(db, registry, verifier);
      const cache = new LruTtlCache<Map<string, ResolvePlayResult>>({
        maxEntries: 10,
        defaultTtlMs: 60_000,
      });
      const mountedPlayback = new CachedPlaybackOrchestrator(inner, cache);

      const initial = await mountedPlayback.resolvePlay({ sourceItemId: streamEntry!.sourceItem.id });
      expect(initial.best?.source).toBe('open_source');
      const started = await mountedPlayback.startPlay({ sourceItemId: streamEntry!.sourceItem.id });
      await mountedPlayback.fallback(started.playId, { reason: 'stream-error' });

      const afterFallback = await mountedPlayback.resolvePlay({
        sourceItemId: streamEntry!.sourceItem.id,
      });

      expect(afterFallback.options).toEqual([]);
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(db
        .select()
        .from(playableOptions)
        .where(eq(playableOptions.sourceItemId, streamEntry!.sourceItem.id))
        .get()?.status).toBe('blocked');
    } finally {
      sqlite.close();
    }
  });

  it('marks both freshly rotated and persisted predecessor stream URLs unavailable', async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });

    try {
      const persistedStream: PlayOption = {
        type: 'stream',
        payload: 'https://media.example/signed-old.mp3',
      };
      const rotatedStream: PlayOption = {
        type: 'stream',
        payload: 'https://media.example/signed-new.mp3',
      };
      const getPlayOptions = vi.fn()
        .mockResolvedValueOnce([persistedStream])
        .mockResolvedValueOnce([rotatedStream])
        .mockResolvedValueOnce([persistedStream]);
      const rotatingAdapter: SourceAdapter = {
        id: 'open_source',
        displayName: 'Rotating stream test adapter',
        capabilities: { search: true, playOptions: true, health: true },
        search: vi.fn().mockResolvedValue([]),
        getPlayOptions,
        health: vi.fn().mockResolvedValue({ status: 'healthy', checkedAt: 0 }),
      };
      const registry = new SourceRegistry();
      registry.register(rotatingAdapter);
      registry.register(adapter('youtube', 'rotating-embed', [
        { type: 'embed', payload: 'official-id' },
      ]));
      const [streamEntry] = new Normalizer(db).normalizeAll([
        {
          sourceId: 'open_source',
          hit: { externalId: 'rotating-stream', title: 'Rotating Song', artists: 'Artist', durationSec: 180 },
        },
        {
          sourceId: 'youtube',
          hit: { externalId: 'rotating-embed', title: 'Rotating Song', artists: 'Artist', durationSec: 180 },
        },
      ]);
      const fetchFn = vi.fn().mockResolvedValue({
        status: 206,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      });
      const verifier = new PlayabilityVerifier({ fetchFn: fetchFn as unknown as typeof fetch });
      const orchestrator = new PlaybackOrchestrator(db, registry, verifier);

      const initial = await orchestrator.resolvePlay({ sourceItemId: streamEntry!.sourceItem.id });
      expect(initial.best?.option.payload).toBe(persistedStream.payload);
      const started = await orchestrator.startPlay({ sourceItemId: streamEntry!.sourceItem.id });
      await orchestrator.fallback(started.playId, { reason: 'signed-url-failed' });

      const retried = await orchestrator.resolvePlay({ sourceItemId: streamEntry!.sourceItem.id });

      expect(retried.options).toEqual([]);
      expect(getPlayOptions).toHaveBeenCalledTimes(3);
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(db
        .select()
        .from(playableOptions)
        .where(eq(playableOptions.sourceItemId, streamEntry!.sourceItem.id))
        .get()?.status).toBe('blocked');
    } finally {
      sqlite.close();
    }
  });

  it('blocks a failed stream during fallback and restores it after fresh verification', async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });

    try {
      const streamOption: PlayOption = {
        type: 'stream',
        payload: 'https://media.example/live.mp3',
      };
      const registry = new SourceRegistry();
      registry.register(adapter('open_source', 'stream-item', [streamOption]));
      registry.register(adapter('youtube', 'embed-item', [{ type: 'embed', payload: 'official-id' }]));

      const normalizer = new Normalizer(db);
      const [streamEntry, embedEntry] = normalizer.normalizeAll([
        {
          sourceId: 'open_source',
          hit: { externalId: 'stream-item', title: 'Same Song', artists: 'Artist', durationSec: 180 },
        },
        {
          sourceId: 'youtube',
          hit: { externalId: 'embed-item', title: 'Same Song', artists: 'Artist', durationSec: 180 },
        },
      ]);
      const fetchFn = vi.fn().mockResolvedValue({
        status: 206,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      });
      const verifier = new PlayabilityVerifier({
        fetchFn: fetchFn as unknown as typeof fetch,
        failureTtlMs: 0,
      });
      const orchestrator = new PlaybackOrchestrator(db, registry, verifier);

      const initial = await orchestrator.resolvePlay({ songWorkId: streamEntry!.songWork.id });
      expect(initial.best?.source).toBe('open_source');
      expect(fetchFn).toHaveBeenCalledOnce();
      const started = await orchestrator.startPlay({ sourceItemId: streamEntry!.sourceItem.id });

      const fallback = await orchestrator.fallback(started.playId, { reason: 'stream-error' });

      expect(fallback.option.sourceItem.id).toBe(embedEntry!.sourceItem.id);
      const blocked = db
        .select()
        .from(playableOptions)
        .where(eq(playableOptions.sourceItemId, streamEntry!.sourceItem.id))
        .get();
      expect(blocked?.status).toBe('blocked');

      const retried = await orchestrator.resolvePlay({ sourceItemId: streamEntry!.sourceItem.id });
      expect(retried.best?.source).toBe('open_source');
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const restored = db
        .select()
        .from(playableOptions)
        .where(eq(playableOptions.sourceItemId, streamEntry!.sourceItem.id))
        .get();
      expect(restored?.status).toBe('available');
    } finally {
      sqlite.close();
    }
  });
});

function adapter(id: SourceId, externalId: string, options: PlayOption[]): SourceAdapter {
  return {
    id,
    displayName: `${id} test adapter`,
    capabilities: { search: true, playOptions: true, health: true },
    search: vi.fn().mockResolvedValue([
      { externalId, title: 'Same Song', artists: 'Artist', durationSec: 180 },
    ]),
    getPlayOptions: vi.fn().mockResolvedValue(options),
    health: vi.fn().mockResolvedValue({ status: 'healthy', checkedAt: 0 }),
  };
}
