import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BilibiliAdapter,
  parseSearchResults,
  stripHtmlTags,
  parseDuration,
} from '../../src/modules/sources/adapters/bilibili.js';
import { SourceError } from '../../src/modules/sources/types.js';

const NAV_RESPONSE = {
  code: 0,
  data: {
    wbi_img: {
      img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
      sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
    },
  },
};

const SEARCH_RESPONSE = {
  code: 0,
  data: {
    result: [
      {
        bvid: 'BV1xx411c7mD',
        title: '<em class="keyword">周杰伦</em> - 晴天 (官方MV)',
        author: '杰威尔音乐',
        duration: '4:29',
        pic: '//i0.hdslb.com/bfs/archive/abc.jpg',
        aid: 12345,
        play: 999999,
        video_review: 1234,
      },
      { bvid: 'not-a-bvid', title: 'skipped' },
    ],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** fetch mock that serves nav once then search; records calls. */
function makeFetchMock(searchBody: unknown = SEARCH_RESPONSE) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/nav')) return Promise.resolve(jsonResponse(NAV_RESPONSE));
    return Promise.resolve(jsonResponse(searchBody));
  });
}

function makeAdapter(fetchMock: unknown): BilibiliAdapter {
  return new BilibiliAdapter({
    fetchFn: fetchMock as typeof fetch,
    minIntervalMs: 100, // speed up tests
  });
}

describe('parseSearchResults', () => {
  it('maps result items to RawHits', () => {
    const hits = parseSearchResults(SEARCH_RESPONSE);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      externalId: 'BV1xx411c7mD',
      title: '周杰伦 - 晴天 (官方MV)',
      artists: '杰威尔音乐',
      durationSec: 269,
      thumbnailUrl: 'https://i0.hdslb.com/bfs/archive/abc.jpg',
      publisher: '杰威尔音乐',
    });
    expect(hits[0]!.metadata).toMatchObject({ bvid: 'BV1xx411c7mD', aid: 12345 });
  });

  it('returns [] for malformed payloads', () => {
    expect(parseSearchResults(null)).toEqual([]);
    expect(parseSearchResults({ data: { result: 'nope' } })).toEqual([]);
  });
});

describe('stripHtmlTags', () => {
  it('removes em keyword wrappers', () => {
    expect(stripHtmlTags('<em class="keyword">晴天</em> MV')).toBe('晴天 MV');
  });
});

describe('parseDuration', () => {
  it('parses mm:ss', () => expect(parseDuration('4:29')).toBe(269));
  it('parses hh:mm:ss', () => expect(parseDuration('1:02:03')).toBe(3723));
  it('passes through numbers', () => expect(parseDuration(269)).toBe(269));
  it('rejects garbage', () => {
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration(undefined)).toBeUndefined();
  });
});

describe('BilibiliAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('search() fetches wbi keys once, then signs the search URL', async () => {
    const fetchMock = makeFetchMock();
    const adapter = makeAdapter(fetchMock);

    const hits = await adapter.search({ query: '周杰伦', limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.externalId).toBe('BV1xx411c7mD');

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes('/nav'))).toHaveLength(1);
    const searchUrl = urls.find((u) => u.includes('search/type'))!;
    expect(searchUrl).toContain('w_rid=');
    expect(searchUrl).toContain('wts=');
    expect(searchUrl).toContain(encodeURIComponent('周杰伦'));
  });

  it('caches wbi keys across searches (no second nav call)', async () => {
    const fetchMock = makeFetchMock();
    const adapter = makeAdapter(fetchMock);

    await adapter.search({ query: 'a' });
    await adapter.search({ query: 'b' });

    const navCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/nav'));
    expect(navCalls).toHaveLength(1);
  });

  it('maps code -412 to SourceError rate_limited after one retry', async () => {
    const fetchMock = makeFetchMock({ code: -412, message: 'risk' });
    const adapter = makeAdapter(fetchMock);

    await expect(adapter.search({ query: 'x' })).rejects.toMatchObject({
      name: 'SourceError',
      code: 'rate_limited',
    });
    // retried once → nav fetched twice (cache invalidated), search called twice
    const navCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/nav'));
    const searchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('search/type'));
    expect(navCalls.length).toBe(2);
    expect(searchCalls.length).toBe(2);
  });

  it('maps non-zero business code to SourceError unknown', async () => {
    const fetchMock = makeFetchMock({ code: -400, message: 'bad request' });
    const adapter = makeAdapter(fetchMock);
    await expect(adapter.search({ query: 'x' })).rejects.toBeInstanceOf(SourceError);
  });

  it('sends SESSDATA cookie when configured', async () => {
    const fetchMock = makeFetchMock();
    const adapter = new BilibiliAdapter({
      fetchFn: fetchMock as unknown as typeof fetch,
      sessdata: 'my-secret-cookie',
      minIntervalMs: 100,
    });
    await adapter.search({ query: 'x' });
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['Cookie']).toBe('SESSDATA=my-secret-cookie');
    expect(headers['User-Agent']).toContain('Mozilla');
  });

  it('getPlayOptions() returns a static embed option for valid bvid', async () => {
    const adapter = makeAdapter(vi.fn());
    expect(await adapter.getPlayOptions('BV1xx411c7mD')).toEqual([
      { type: 'embed', payload: 'BV1xx411c7mD', expiresAt: null },
    ]);
    expect(await adapter.getPlayOptions('bad-id')).toEqual([]);
  });

  it('health() reports degraded on risk-control, healthy otherwise', async () => {
    const okAdapter = makeAdapter(makeFetchMock());
    expect((await okAdapter.health()).status).toBe('healthy');

    const risky = makeAdapter(vi.fn().mockResolvedValue(jsonResponse({}, 412)));
    const snap = await risky.health();
    expect(snap.status).toBe('degraded');
    expect(snap.message).toContain('SESSDATA');
  });
});
