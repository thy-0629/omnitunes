import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WikimediaCommonsAdapter,
  parseWikimediaResponse,
} from '../../src/modules/sources/adapters/wikimedia.js';

const FILE_TITLE = 'File:Example song.ogg';
const VALID_RESPONSE = {
  query: {
    pages: {
      42: {
        title: FILE_TITLE,
        imageinfo: [{
          url: 'https://upload.wikimedia.org/example-song.ogg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example_song.ogg',
          extmetadata: {
            Artist: { value: '<a href="/wiki/User:Composer">Composer Name</a>' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
            LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
          },
        }],
      },
    },
  },
};

describe('parseWikimediaResponse', () => {
  it('maps an attributed Commons audio file to a public direct stream', () => {
    expect(parseWikimediaResponse(VALID_RESPONSE)).toEqual([
      {
        externalId: FILE_TITLE,
        title: 'Example song',
        artists: 'Composer Name',
        publisher: 'Wikimedia Commons',
        metadata: {
          url: 'https://commons.wikimedia.org/wiki/File:Example_song.ogg',
          attribution: {
            license: 'CC BY-SA 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example_song.ogg',
            creator: 'Composer Name',
          },
          directStreamUrl: 'https://upload.wikimedia.org/example-song.ogg',
        },
      },
    ]);
  });

  it.each([
    ['creator', { Artist: { value: '' } }],
    ['license', { LicenseShortName: { value: '' } }],
    ['license URL', { LicenseUrl: { value: 'http://example.org/license' } }],
  ])('rejects files missing valid %s attribution', (_name, extmetadata) => {
    const response = structuredClone(VALID_RESPONSE);
    Object.assign(response.query.pages[42]!.imageinfo[0]!.extmetadata, extmetadata);
    expect(parseWikimediaResponse(response)).toEqual([]);
  });
});

describe('WikimediaCommonsAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the official generator search and serves its cached public stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );
    const adapter = new WikimediaCommonsAdapter({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const hits = await adapter.search({ query: 'example song', limit: 6 });
    expect(hits).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(url.searchParams.get('generator')).toBe('search');
    expect(url.searchParams.get('gsrnamespace')).toBe('6');
    expect(url.searchParams.get('gsrsearch')).toBe('example song filetype:audio');
    expect(url.searchParams.get('prop')).toBe('imageinfo');
    expect(url.searchParams.get('iiprop')).toBe('url|extmetadata');
    expect(url.searchParams.get('format')).toBe('json');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toBe(
      'OmniTunes/0.1.0 (music source discovery; https://github.com/thy-0629/omnitunes)',
    );
    await expect(adapter.getPlayOptions(FILE_TITLE)).resolves.toEqual([
      {
        type: 'stream',
        payload: 'https://upload.wikimedia.org/example-song.ogg',
        expiresAt: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repeats a title lookup on a cache miss', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );
    const adapter = new WikimediaCommonsAdapter({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(adapter.getPlayOptions(FILE_TITLE)).resolves.toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('titles')).toBe(FILE_TITLE);
    expect(url.searchParams.has('generator')).toBe(false);
  });

  it('evicts the oldest cached record when the cache bound is exceeded', async () => {
    const secondTitle = 'File:Second song.ogg';
    const searchResponse = structuredClone(VALID_RESPONSE);
    searchResponse.query.pages[43] = {
      ...structuredClone(VALID_RESPONSE.query.pages[42]!),
      title: secondTitle,
      imageinfo: [{
        ...structuredClone(VALID_RESPONSE.query.pages[42]!.imageinfo[0]!),
        url: 'https://upload.wikimedia.org/second-song.ogg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Second_song.ogg',
      }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(searchResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));
    const adapter = new WikimediaCommonsAdapter({
      fetchFn: fetchMock as unknown as typeof fetch,
      cacheMaxEntries: 1,
    });

    await adapter.search({ query: 'songs' });
    await expect(adapter.getPlayOptions(FILE_TITLE)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies a rejected request as a Commons network error', async () => {
    const adapter = new WikimediaCommonsAdapter({
      fetchFn: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
    });

    await expect(adapter.search({ query: 'song' })).rejects.toMatchObject({
      sourceId: 'wikimedia',
      code: 'network',
    });
  });

  it('classifies HTTP 429 separately and preserves Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    const adapter = new WikimediaCommonsAdapter({
      fetchFn: vi.fn().mockResolvedValue(new Response('', {
        status: 429,
        headers: { 'retry-after': 'Wed, 05 Aug 2026 00:02:00 GMT' },
      })) as unknown as typeof fetch,
    });

    await expect(adapter.search({ query: 'song' })).rejects.toMatchObject({
      sourceId: 'wikimedia',
      code: 'rate_limited',
      retryAt: Date.now() + 120_000,
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
    const adapter = new WikimediaCommonsAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    const request = adapter.search({ query: 'song' });
    const rejection = expect(request).rejects.toMatchObject({
      sourceId: 'wikimedia',
      code: 'network',
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await rejection;
  });
});
