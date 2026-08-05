import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpenverseAdapter,
  parseOpenverseResponse,
} from '../../src/modules/sources/adapters/openverse.js';

const VALID_AUDIO = {
  id: '8624ba61-57f1-4f98-8a85-ece206c319cf',
  title: 'Wish You Were Here',
  creator: 'The.madpix.project',
  license: 'by-nc-sa',
  license_url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  foreign_landing_url: 'https://example.org/audio/wish-you-were-here',
  url: 'https://cdn.example.org/audio/wish-you-were-here.mp3',
  mature: false,
  duration: 270_000,
  thumbnail: 'https://api.openverse.org/v1/audio/id/thumb/',
};

describe('parseOpenverseResponse', () => {
  it('maps fully attributed non-mature HTTPS audio to a direct-stream RawHit', () => {
    expect(parseOpenverseResponse({ results: [VALID_AUDIO] })).toEqual([
      {
        externalId: VALID_AUDIO.id,
        title: 'Wish You Were Here',
        artists: 'The.madpix.project',
        durationSec: 270,
        thumbnailUrl: VALID_AUDIO.thumbnail,
        publisher: 'Openverse',
        metadata: {
          url: VALID_AUDIO.foreign_landing_url,
          attribution: {
            license: 'by-nc-sa',
            licenseUrl: VALID_AUDIO.license_url,
            sourceUrl: VALID_AUDIO.foreign_landing_url,
            creator: 'The.madpix.project',
          },
          directStreamUrl: VALID_AUDIO.url,
        },
      },
    ]);
  });

  it.each([
    ['mature audio', { mature: true }],
    ['missing creator', { creator: '' }],
    ['non-HTTPS audio', { url: 'http://cdn.example.org/audio.mp3' }],
    ['missing license', { license: '' }],
    ['non-HTTPS license URL', { license_url: 'http://creativecommons.org/licenses/by/4.0/' }],
    ['missing source page', { foreign_landing_url: '' }],
  ])('rejects %s', (_name, override) => {
    expect(parseOpenverseResponse({ results: [{ ...VALID_AUDIO, ...override }] })).toEqual([]);
  });
});

describe('OpenverseAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses anonymous official music search and serves the cached direct stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [VALID_AUDIO] }), { status: 200 }),
    );
    const adapter = new OpenverseAdapter({ fetchFn: fetchMock as unknown as typeof fetch });

    const hits = await adapter.search({ query: 'wish', limit: 7 });
    expect(hits).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.openverse.org/v1/audio/?q=wish&category=music&page_size=7',
    );
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty('headers.Authorization');
    await expect(adapter.getPlayOptions(VALID_AUDIO.id)).resolves.toEqual([
      { type: 'stream', payload: VALID_AUDIO.url, expiresAt: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches and revalidates a cache miss by UUID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VALID_AUDIO), { status: 200 }),
    );
    const adapter = new OpenverseAdapter({ fetchFn: fetchMock as unknown as typeof fetch });

    await expect(adapter.getPlayOptions(VALID_AUDIO.id)).resolves.toEqual([
      { type: 'stream', payload: VALID_AUDIO.url, expiresAt: null },
    ]);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `https://api.openverse.org/v1/audio/${VALID_AUDIO.id}/`,
    );
  });

  it('evicts the oldest cached record when the cache bound is exceeded', async () => {
    const secondAudio = {
      ...VALID_AUDIO,
      id: '9f4b940e-88b3-4fa2-813f-d2a7e5681d0e',
      title: 'Second Song',
      url: 'https://cdn.example.org/audio/second.mp3',
      foreign_landing_url: 'https://example.org/audio/second',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [VALID_AUDIO, secondAudio] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(VALID_AUDIO), { status: 200 }));
    const adapter = new OpenverseAdapter({
      fetchFn: fetchMock as unknown as typeof fetch,
      cacheMaxEntries: 1,
    });

    await adapter.search({ query: 'songs' });
    await expect(adapter.getPlayOptions(VALID_AUDIO.id)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies a rejected request as an Openverse network error', async () => {
    const adapter = new OpenverseAdapter({
      fetchFn: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
    });

    await expect(adapter.search({ query: 'song' })).rejects.toMatchObject({
      sourceId: 'openverse',
      code: 'network',
    });
  });

  it('aborts at the default 10-second boundary and classifies the timeout', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
      });
    });
    const adapter = new OpenverseAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    const request = adapter.search({ query: 'song' });
    const rejection = expect(request).rejects.toMatchObject({
      sourceId: 'openverse',
      code: 'network',
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await rejection;
  });
});
