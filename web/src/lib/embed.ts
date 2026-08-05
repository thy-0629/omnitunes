import type { SourceId } from '@/lib/api/types';

/**
 * Build the iframe URL for an `embed` play option.
 *
 * bilibili: payload is the bvid; embed MUST use player.bilibili.com
 * (www.bilibili.com sends X-Frame-Options). autoplay=1 is a best-effort
 * request initiated by the user's source-selection click; browser and
 * provider policy can still prevent unmuted autoplay.
 *
 * youtube: payload is the videoId → youtube-nocookie embed.
 * mock: no real content — render a placeholder page handled by the caller.
 */
export function buildEmbedUrl(source: SourceId, payload: string): string | null {
  switch (source) {
    case 'bilibili':
      return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(payload)}&autoplay=1&muted=0`;
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(payload)}?autoplay=1`;
    default:
      return null;
  }
}
