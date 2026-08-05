import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/db/schema.js';
import { playableOptions } from '../../src/db/schema.js';
import {
  CachedPlaybackOrchestrator,
  CachedUnifiedSearchService,
} from '../../src/modules/cache/layers.js';
import { LruTtlCache } from '../../src/modules/cache/lru.js';
import { Normalizer } from '../../src/modules/search/normalizer.js';
import { UnifiedSearchService, type UnifiedSearchResult } from '../../src/modules/search/service.js';
import {
  PlaybackOrchestrator,
  type ResolvePlayResult,
} from '../../src/modules/playback/orchestrator.js';
import { PlayabilityVerifier } from '../../src/modules/sources/playability.js';
import { SourceRegistry } from '../../src/modules/sources/registry.js';
import type { PlayOption, SourceAdapter, SourceId } from '../../src/modules/sources/types.js';

const resolvePublicHostname = vi.fn().mockResolvedValue(['93.184.216.34']);

function validStreamResponse(contentType = 'audio/mpeg') {
  return {
    status: 206,
    headers: new Headers({
      'content-type': contentType,
      'content-length': '2',
      'content-range': 'bytes 0-1/2048',
    }),
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('PlayabilityVerifier', () => {
  const publicLookup = resolvePublicHostname;

  it('accepts a bounded bytes=0-1 audio response and cancels its body', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue({
      status: 206,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '2',
        'content-range': 'bytes 0-1/2048',
      }),
      body: { cancel },
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
    });
    const option = { type: 'stream' as const, payload: 'https://media.example/song.mp3' };

    await expect(verifier.verify('open_source', [option])).resolves.toEqual({
      options: [option],
      failures: [],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      option.payload,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        dispatcher: expect.anything(),
        headers: expect.objectContaining({
          Range: 'bytes=0-1',
          Accept: 'audio/*',
        }),
      }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['application/json', 'text/plain', 'image/png', 'text/html; charset=utf-8'])(
    'rejects a 200 %s response as non-audio',
    async (contentType) => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const verifier = new PlayabilityVerifier({
        fetchFn: vi.fn().mockResolvedValue({
          status: 200,
          headers: new Headers({ 'content-type': contentType, 'content-length': '2' }),
          body: { cancel },
        }) as unknown as typeof fetch,
        resolveHostname: publicLookup,
      });

      const result = await verifier.verify('open_source', [
        { type: 'stream', payload: 'https://media.example/not-a-song' },
      ]);

      expect(result.options).toEqual([]);
      expect(result.failures[0]).toMatchObject({ code: 'invalid_content_type' });
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it('rejects non-HTTPS and credential-bearing stream targets without fetching them', async () => {
    const fetchFn = vi.fn();
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
    });

    for (const payload of [
      'http://media.example/song.mp3',
      'https://user:secret@media.example/song.mp3',
    ]) {
      const result = await verifier.verify('open_source', [{ type: 'stream', payload }]);
      expect(result.failures[0]).toMatchObject({ code: 'unsafe_target' });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['downgraded', 'http://media.example/song.mp3', ['93.184.216.34']],
    ['private', 'https://private.example/song.mp3', ['127.0.0.1']],
  ])('rejects an HTTPS redirect to a %s target', async (_name, location, resolvedAddresses) => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue({
      status: 302,
      headers: new Headers({ location }),
      body: { cancel },
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: vi.fn(async (hostname: string) =>
        hostname === 'private.example' ? resolvedAddresses : ['93.184.216.34']),
    });

    const result = await verifier.verify('open_source', [
      { type: 'stream', payload: 'https://media.example/start.mp3' },
    ]);

    expect(result.options).toEqual([]);
    expect(result.failures[0]).toMatchObject({ code: 'unsafe_target' });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects redirects beyond the configured limit', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const hop = Number(new URL(String(url)).searchParams.get('hop') ?? 0);
      return {
        status: 302,
        headers: new Headers({ location: `https://media.example/song.mp3?hop=${hop + 1}` }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      };
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
      maxRedirects: 2,
    });

    const result = await verifier.verify('open_source', [
      { type: 'stream', payload: 'https://media.example/song.mp3?hop=0' },
    ]);

    expect(result.failures[0]).toMatchObject({ code: 'redirect_limit' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['an oversized full response', 200, { 'content-length': '2048' }, 'response_too_large'],
    ['a malformed partial response', 206, { 'content-length': '2' }, 'invalid_range'],
  ])('rejects %s', async (_name, status, extraHeaders, code) => {
    const verifier = new PlayabilityVerifier({
      fetchFn: vi.fn().mockResolvedValue({
        status,
        headers: new Headers({ 'content-type': 'audio/mpeg', ...extraHeaders }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      }) as unknown as typeof fetch,
      resolveHostname: publicLookup,
      maxBodyBytes: 1024,
    });

    const result = await verifier.verify('open_source', [
      { type: 'stream', payload: 'https://media.example/song.mp3' },
    ]);

    expect(result.failures[0]).toMatchObject({ code });
  });

  it('accepts octet-stream only for a ranged URL with a known audio extension', async () => {
    const verifier = new PlayabilityVerifier({
      fetchFn: vi.fn().mockResolvedValue(validStreamResponse('application/octet-stream')) as unknown as typeof fetch,
      resolveHostname: publicLookup,
    });

    const accepted = await verifier.verify('open_source', [
      { type: 'stream', payload: 'https://media.example/song.mp3' },
    ]);
    const rejected = await verifier.verify('open_source', [
      { type: 'stream', payload: 'https://media.example/no-extension' },
    ]);

    expect(accepted.options).toHaveLength(1);
    expect(rejected.failures[0]).toMatchObject({ code: 'invalid_content_type' });
  });

  it('accepts only official embeds and never fetches local options', async () => {
    const fetchFn = vi.fn();
    const verifier = new PlayabilityVerifier({ fetchFn: fetchFn as unknown as typeof fetch });
    const embed = { type: 'embed' as const, payload: 'video-id' };
    const local = { type: 'local' as const, payload: 'album/song.flac' };

    await expect(verifier.verify('youtube', [embed])).resolves.toMatchObject({ options: [embed] });
    await expect(verifier.verify('bilibili', [embed])).resolves.toMatchObject({ options: [embed] });
    await expect(verifier.verify('mock', [embed])).resolves.toMatchObject({ options: [] });
    await expect(verifier.verify('local', [local])).resolves.toMatchObject({ options: [local] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses source-qualified cache keys and lets runtime failures override success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(validStreamResponse('audio/ogg'));
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
    });
    const stream = { type: 'stream' as const, payload: 'https://media.example/cached.ogg' };

    await expect(verifier.verify('open_source', [stream])).resolves.toMatchObject({ options: [stream] });
    await expect(verifier.verify('open_source', [stream])).resolves.toMatchObject({ options: [stream] });
    await expect(verifier.verify('openverse', [stream])).resolves.toMatchObject({ options: [stream] });
    verifier.markUnavailable('open_source', [stream]);
    await expect(verifier.verify('open_source', [stream])).resolves.toMatchObject({ options: [] });
    await expect(verifier.verify('openverse', [stream])).resolves.toMatchObject({ options: [stream] });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('evicts least-recently-used outcomes and prunes expired entries', async () => {
    let now = 1_000;
    const fetchFn = vi.fn().mockResolvedValue(validStreamResponse());
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
      cacheMaxEntries: 1,
      successTtlMs: 10,
      now: () => now,
    });
    const stream = (name: string) => ({
      type: 'stream' as const,
      payload: `https://media.example/${name}.mp3`,
    });

    await verifier.verify('open_source', [stream('first')]);
    now += 11;
    await verifier.verify('open_source', [stream('second')]);
    expect(verifier.cacheStats.size).toBe(1);
    await verifier.verify('open_source', [stream('first')]);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(verifier.cacheStats.size).toBe(1);
  });

  it('coalesces duplicate in-flight probes', async () => {
    let finish!: (value: unknown) => void;
    const fetchFn = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
    });
    const stream = { type: 'stream' as const, payload: 'https://media.example/shared.mp3' };

    const first = verifier.verify('open_source', [stream]);
    const second = verifier.verify('open_source', [stream]);
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    finish(validStreamResponse());

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { options: [stream] },
      { options: [stream] },
    ]);
  });

  it('enforces one application-level maximum across concurrent verify calls', async () => {
    let active = 0;
    let maximum = 0;
    const fetchFn = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return validStreamResponse();
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveHostname: publicLookup,
      maxConcurrentProbes: 2,
    });
    const streams = Array.from({ length: 6 }, (_, index) => ({
      type: 'stream' as const,
      payload: `https://media.example/${index}.mp3`,
    }));

    await Promise.all([
      verifier.verify('open_source', streams.slice(0, 3)),
      verifier.verify('openverse', streams.slice(3)),
    ]);

    expect(maximum).toBe(2);
  });
});

describe('PlaybackOrchestrator playability feedback', () => {
  it('invalidates cached searches after runtime fallback and preserves alternate sources', async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });

    try {
      const streamOption: PlayOption = {
        type: 'stream',
        payload: 'https://media.example/runtime-dead.mp3',
      };
      const streamAdapter = adapter('open_source', 'runtime-stream', [streamOption]);
      const embedAdapter = adapter('bilibili', 'runtime-embed', [
        { type: 'embed', payload: 'official-bvid' },
      ]);
      const registry = new SourceRegistry();
      registry.register(streamAdapter);
      registry.register(embedAdapter);
      const fetchFn = vi.fn().mockResolvedValue({
        status: 206,
        headers: new Headers({
          'content-type': 'audio/mpeg',
          'content-length': '2',
          'content-range': 'bytes 0-1/2048',
        }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      });
      const verifier = new PlayabilityVerifier({
        fetchFn: fetchFn as unknown as typeof fetch,
        resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
      });
      const innerSearch = new UnifiedSearchService(registry, new Normalizer(db), verifier);
      const searchCache = new LruTtlCache<UnifiedSearchResult>({
        maxEntries: 10,
        defaultTtlMs: 60_000,
      });
      const mountedSearch = new CachedUnifiedSearchService(innerSearch, searchCache, verifier);
      const innerPlayback = new PlaybackOrchestrator(db, registry, verifier);
      const mountedPlayback = new CachedPlaybackOrchestrator(
        innerPlayback,
        new LruTtlCache<Map<string, ResolvePlayResult>>({
          maxEntries: 10,
          defaultTtlMs: 60_000,
        }),
      );

      const initial = await mountedSearch.search({ query: 'Same Song' });
      const sourceItems = initial.results[0]!.recordings[0]!.sourceItems;
      const streamItem = sourceItems.find((item) => item.source === 'open_source')!;
      expect(sourceItems.map((item) => item.source).sort()).toEqual(['bilibili', 'open_source']);

      await mountedPlayback.resolvePlay({ sourceItemId: streamItem.id });
      const started = await mountedPlayback.startPlay({ sourceItemId: streamItem.id });
      await mountedPlayback.fallback(started.playId, { reason: 'audio-element-error' });

      const refreshed = await mountedSearch.search({ query: 'Same Song' });
      const refreshedSources = refreshed.results[0]!.recordings
        .flatMap((recording) => recording.sourceItems.map((item) => item.source));

      expect(refreshedSources).toEqual(['bilibili']);
      expect(streamAdapter.search).toHaveBeenCalledTimes(2);
      expect(embedAdapter.search).toHaveBeenCalledTimes(2);
      mountedSearch.close();
    } finally {
      sqlite.close();
    }
  });

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
      const fetchFn = vi.fn().mockResolvedValue(validStreamResponse());
      const verifier = new PlayabilityVerifier({
        fetchFn: fetchFn as unknown as typeof fetch,
        resolveHostname: resolvePublicHostname,
      });
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
      const fetchFn = vi.fn().mockResolvedValue(validStreamResponse());
      const verifier = new PlayabilityVerifier({
        fetchFn: fetchFn as unknown as typeof fetch,
        resolveHostname: resolvePublicHostname,
      });
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
      const fetchFn = vi.fn().mockResolvedValue(validStreamResponse());
      const verifier = new PlayabilityVerifier({
        fetchFn: fetchFn as unknown as typeof fetch,
        resolveHostname: resolvePublicHostname,
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
