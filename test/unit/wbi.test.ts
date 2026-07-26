import { describe, it, expect } from 'vitest';
import {
  getMixinKey,
  signParams,
  extractKeyFromWbiUrl,
  MIXIN_KEY_ENC_TAB,
} from '../../src/modules/sources/adapters/bilibili/wbi.js';

// Public reference vector from SocialSisterYi/bilibili-API-collect docs.
const IMG_KEY = '7cd084941338484aae1ad9425b84077c';
const SUB_KEY = '4932caff0ff746eab6f01bf08b70ac45';
const EXPECTED_MIXIN = 'ea1db124af3c7062474693fa704f4ff8';

describe('getMixinKey', () => {
  it('matches the documented reference vector', () => {
    expect(getMixinKey(IMG_KEY, SUB_KEY)).toBe(EXPECTED_MIXIN);
  });

  it('produces a 32-char key', () => {
    expect(getMixinKey(IMG_KEY, SUB_KEY)).toHaveLength(32);
  });

  it('permutation table is a valid 0..63 permutation', () => {
    expect(MIXIN_KEY_ENC_TAB).toHaveLength(64);
    expect([...MIXIN_KEY_ENC_TAB].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 64 }, (_, i) => i),
    );
  });
});

describe('signParams', () => {
  it('pins exact w_rid for frozen wts', () => {
    const signed = signParams(
      { baz: 1919810, foo: 114, bar: 514 },
      EXPECTED_MIXIN,
      1684746387,
    );
    // computed from the reference algorithm — regression anchor
    expect(signed['w_rid']).toBe('cf8c26a9acd82f9e961cf282adb501a2');
    expect(signed['wts']).toBe('1684746387');
  });

  it('sorts params by key in the signed query', () => {
    const signed = signParams({ z: 1, a: 2, m: 3 }, EXPECTED_MIXIN, 1000);
    const keys = Object.keys(signed).filter((k) => k !== 'w_rid');
    expect(keys).toEqual(['a', 'm', 'wts', 'z']);
  });

  it("strips !'()* from values", () => {
    const signed = signParams({ q: "a!b'c(d)e*f" }, EXPECTED_MIXIN, 1000);
    expect(signed['q']).toBe('abcdef');
  });

  it('w_rid changes when any param changes', () => {
    const a = signParams({ keyword: 'hello' }, EXPECTED_MIXIN, 1000);
    const b = signParams({ keyword: 'hellp' }, EXPECTED_MIXIN, 1000);
    expect(a['w_rid']).not.toBe(b['w_rid']);
  });

  it('does not mutate the input params', () => {
    const input = { keyword: 'test' };
    signParams(input, EXPECTED_MIXIN, 1000);
    expect(input).toEqual({ keyword: 'test' });
  });
});

describe('extractKeyFromWbiUrl', () => {
  it('extracts basename without extension', () => {
    expect(
      extractKeyFromWbiUrl('https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png'),
    ).toBe(IMG_KEY);
  });

  it('handles URLs without extension', () => {
    expect(extractKeyFromWbiUrl('https://example.com/abcdef')).toBe('abcdef');
  });
});
