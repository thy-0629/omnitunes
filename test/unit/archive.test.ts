import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ArchiveOrgAdapter,
  parseSearchResponse,
  pickAudioFiles,
  encodeURIPathSegment,
} from '../../src/modules/sources/adapters/archive.js';
import { SourceError } from '../../src/modules/sources/types.js';

describe('parseSearchResponse', () => {
  it('maps docs to RawHits', () => {
    const json = {
      response: {
        docs: [
          {
            identifier: 'gd1977-05-08',
            title: 'Grateful Dead Live at Barton Hall',
            creator: 'Grateful Dead',
            duration: '3:45',
          },
        ],
      },
    };
    const hits = parseSearchResponse(json);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      externalId: 'gd1977-05-08',
      title: 'Grateful Dead Live at Barton Hall',
      artists: 'Grateful Dead',
      durationSec: 225,
      publisher: 'Internet Archive',
    });
    expect(hits[0]!.metadata?.['url']).toBe('https://archive.org/details/gd1977-05-08');
  });

  it('joins array creators', () => {
    const json = {
      response: { docs: [{ identifier: 'x', title: 'T', creator: ['A', 'B'] }] },
    };
    expect(parseSearchResponse(json)[0]!.artists).toBe('A, B');
  });

  it('defaults missing creator to Unknown and missing title to identifier', () => {
    const json = { response: { docs: [{ identifier: 'abc' }] } };
    const hit = parseSearchResponse(json)[0]!;
    expect(hit.artists).toBe('Unknown');
    expect(hit.title).toBe('abc');
    expect(hit.durationSec).toBeUndefined();
  });

  it('parses hh:mm:ss durations', () => {
    const json = {
      response: { docs: [{ identifier: 'x', title: 'T', duration: '1:02:03' }] },
    };
    expect(parseSearchResponse(json)[0]!.durationSec).toBe(3723);
  });

  it('skips docs without identifier', () => {
    const json = { response: { docs: [{ title: 'no id' }, { identifier: 'ok' }] } };
    const hits = parseSearchResponse(json);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.externalId).toBe('ok');
  });

  it('returns [] for malformed payloads', () => {
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse({})).toEqual([]);
    expect(parseSearchResponse({ response: { docs: 'nope' } })).toEqual([]);
  });
});

describe('pickAudioFiles', () => {
  it('prefers mp3 over ogg over flac and skips non-audio', () => {
    const json = {
      files: [
        { name: 'track.flac', format: 'Flac' },
        { name: 'track.mp3', format: 'VBR MP3' },
        { name: 'track.ogg', format: 'Ogg Vorbis' },
        { name: 'cover.png', format: 'PNG' },
        { name: 'notes.txt', format: 'Text' },
      ],
    };
    expect(pickAudioFiles(json)).toEqual(['track.mp3', 'track.ogg', 'track.flac']);
  });

  it('matches on format field when extension is unusual', () => {
    const json = { files: [{ name: 'AUDIO FILE', format: 'VBR MP3' }] };
    expect(pickAudioFiles(json)).toEqual(['AUDIO FILE']);
  });

  it('skips subdirectory files', () => {
    const json = {
      files: [
        { name: 'derivatives/track.mp3', format: 'VBR MP3' },
        { name: 'track.mp3', format: 'VBR MP3' },
      ],
    };
    expect(pickAudioFiles(json)).toEqual(['track.mp3']);
  });

  it('returns [] for malformed payloads', () => {
    expect(pickAudioFiles(null)).toEqual([]);
    expect(pickAudioFiles({ files: {} })).toEqual([]);
  });
});

describe('encodeURIPathSegment', () => {
  it('encodes spaces and unicode', () => {
    expect(encodeURIPathSegment('01 - 序曲.mp3')).toBe('01%20-%20%E5%BA%8F%E6%9B%B2.mp3');
  });
});

describe('ArchiveOrgAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    return fetchMock;
  }

  it('search() maps response docs to hits', async () => {
    const fetchMock = stubFetchOnce({
      response: {
        docs: [{ identifier: 'gd77', title: 'Scarlet Begonias', creator: 'Grateful Dead' }],
      },
    });
    const adapter = new ArchiveOrgAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    const hits = await adapter.search({ query: 'scarlet', limit: 5 });

    expect(hits).toHaveLength(1);
    expect(hits[0]!.externalId).toBe('gd77');
    const calledUrl = String(fetchMock.mock.calls[0]![0]);
    expect(calledUrl).toContain('advancedsearch.php');
    expect(calledUrl).toContain('rows=5');
    expect(calledUrl).toContain(encodeURIComponent('scarlet AND mediatype:(audio)'));
  });

  it('getPlayOptions() returns stream options from metadata files', async () => {
    const fetchMock = stubFetchOnce({
      files: [
        { name: '01 song.mp3', format: 'VBR MP3' },
        { name: 'artwork.jpg', format: 'JPEG' },
      ],
    });
    const adapter = new ArchiveOrgAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    const opts = await adapter.getPlayOptions('gd77');

    expect(opts).toEqual([
      {
        type: 'stream',
        payload: 'https://archive.org/download/gd77/01%20song.mp3',
        expiresAt: null,
      },
    ]);
  });

  it('getPlayOptions() caches metadata (second call does not refetch)', async () => {
    const fetchMock = stubFetchOnce({ files: [{ name: 'a.mp3', format: 'VBR MP3' }] });
    const adapter = new ArchiveOrgAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    await adapter.getPlayOptions('gd77');
    await adapter.getPlayOptions('gd77');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getPlayOptions() rejects traversal-ish identifiers without a request', async () => {
    const fetchMock = vi.fn();
    const adapter = new ArchiveOrgAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    expect(await adapter.getPlayOptions('../etc')).toEqual([]);
    expect(await adapter.getPlayOptions('a/b')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws SourceError network on HTTP 500', async () => {
    const fetchMock = stubFetchOnce({}, { status: 500 });
    const adapter = new ArchiveOrgAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    await expect(adapter.search({ query: 'x' })).rejects.toMatchObject({
      name: 'SourceError',
      code: 'network',
    });
  });

  it('throws SourceError network on fetch failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const adapter = new ArchiveOrgAdapter({ fetchFn: fetchMock as unknown as typeof fetch });
    await expect(adapter.search({ query: 'x' })).rejects.toBeInstanceOf(SourceError);
  });

  it('health() is healthy on 200 and unavailable on throw', async () => {
    const okFetch = stubFetchOnce({});
    const healthy = new ArchiveOrgAdapter({ fetchFn: okFetch as unknown as typeof fetch });
    expect((await healthy.health()).status).toBe('healthy');

    const badFetch = vi.fn().mockRejectedValue(new Error('down'));
    const degraded = new ArchiveOrgAdapter({ fetchFn: badFetch as unknown as typeof fetch });
    expect((await degraded.health()).status).toBe('unavailable');
  });
});
