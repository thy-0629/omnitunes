import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/db/schema.js';
import { playableOptions } from '../../src/db/schema.js';
import { Normalizer } from '../../src/modules/search/normalizer.js';
import { PlaybackOrchestrator } from '../../src/modules/playback/orchestrator.js';
import { PlayabilityVerifier } from '../../src/modules/sources/playability.js';
import { SourceRegistry } from '../../src/modules/sources/registry.js';
import type { PlayOption, SourceAdapter, SourceId } from '../../src/modules/sources/types.js';

describe('PlayabilityVerifier', () => {
  it('accepts a bounded 206 audio stream response', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue({
      status: 206,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      body: { cancel },
    });
    const verifier = new PlayabilityVerifier({
      fetchFn: fetchFn as unknown as typeof fetch,
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
