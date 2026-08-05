import { describe, it, expect } from 'vitest';
import { searchCacheKey, playOptCacheKey } from '../../src/modules/cache/layers.js';

describe('searchCacheKey', () => {
  it('produces stable key for same params', () => {
    const k1 = searchCacheKey({ query: 'Bohemian', limit: 5, sources: ['mock', 'local'] });
    const k2 = searchCacheKey({ query: 'Bohemian', limit: 5, sources: ['mock', 'local'] });
    expect(k1).toBe(k2);
  });

  it('normalizes query case + whitespace', () => {
    const k1 = searchCacheKey({ query: '  BOHEMIAN  ', limit: 5, sources: ['mock'] });
    const k2 = searchCacheKey({ query: 'bohemian', limit: 5, sources: ['mock'] });
    expect(k1).toBe(k2);
  });

  it('produces different key for different query', () => {
    const k1 = searchCacheKey({ query: 'hello', limit: 5, sources: ['mock'] });
    const k2 = searchCacheKey({ query: 'world', limit: 5, sources: ['mock'] });
    expect(k1).not.toBe(k2);
  });

  it('produces different key for different limit', () => {
    const k1 = searchCacheKey({ query: 'hello', limit: 5, sources: ['mock'] });
    const k2 = searchCacheKey({ query: 'hello', limit: 10, sources: ['mock'] });
    expect(k1).not.toBe(k2);
  });

  it('ignores source array ordering', () => {
    const k1 = searchCacheKey({ query: 'hello', limit: 5, sources: ['mock', 'local'] });
    const k2 = searchCacheKey({ query: 'hello', limit: 5, sources: ['local', 'mock'] });
    expect(k1).toBe(k2);
  });

  it('distinguishes an explicit no-sources filter from the all-sources default', () => {
    const k1 = searchCacheKey({ query: 'hello', limit: 5 });
    const k2 = searchCacheKey({ query: 'hello', limit: 5, sources: [] });
    expect(k1).not.toBe(k2);
  });

  it('keys start with "search:" prefix', () => {
    const k = searchCacheKey({ query: 'test' });
    expect(k.startsWith('search:')).toBe(true);
  });
});

describe('playOptCacheKey', () => {
  it('produces stable key for same inputs', () => {
    const k1 = playOptCacheKey('youtube', 'vid-123');
    const k2 = playOptCacheKey('youtube', 'vid-123');
    expect(k1).toBe(k2);
  });

  it('produces different key for different source', () => {
    const k1 = playOptCacheKey('youtube', 'vid-123');
    const k2 = playOptCacheKey('mock', 'vid-123');
    expect(k1).not.toBe(k2);
  });

  it('produces different key for different externalId', () => {
    const k1 = playOptCacheKey('youtube', 'vid-123');
    const k2 = playOptCacheKey('youtube', 'vid-456');
    expect(k1).not.toBe(k2);
  });

  it('starts with "playopt:" prefix', () => {
    expect(playOptCacheKey('mock', 'x').startsWith('playopt:')).toBe(true);
  });
});
