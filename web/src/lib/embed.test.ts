import { describe, expect, it } from 'vitest';
import { buildEmbedUrl } from './embed';

describe('buildEmbedUrl', () => {
  it('enables autoplay for Bilibili embeds while preserving the encoded bvid', () => {
    expect(buildEmbedUrl('bilibili', 'BV1 a&b')).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1%20a%26b&autoplay=1&muted=0',
    );
  });

  it('enables autoplay for privacy-enhanced YouTube embeds', () => {
    expect(buildEmbedUrl('youtube', 'abc/123')).toBe(
      'https://www.youtube-nocookie.com/embed/abc%2F123?autoplay=1',
    );
  });
});
