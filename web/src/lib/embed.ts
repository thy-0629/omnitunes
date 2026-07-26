import type { SourceId } from '@/lib/api/types';

/**
 * Build the iframe URL for an `embed` play option.
 *
 * bilibili: payload is the bvid; embed MUST use player.bilibili.com
 * (www.bilibili.com sends X-Frame-Options). autoplay=0 to satisfy browser
 * autoplay policies — the user presses play inside the iframe.
 *
 * youtube: payload is the videoId → youtube-nocookie embed.
 * mock: no real content — render a placeholder page handled by the caller.
 */
export function buildEmbedUrl(source: SourceId, payload: string): string | null {
  switch (source) {
    case 'bilibili':
      return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(payload)}&autoplay=0&muted=0`;
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(payload)}`;
    default:
      return null;
  }
}
