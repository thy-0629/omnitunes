import { buildEmbedUrl } from '@/lib/embed';
import { usePlayerStore } from '@/stores/player';

/**
 * Iframe player for `embed` options (bilibili / youtube).
 * No progress events come out of the iframe — that's a platform limitation,
 * the player bar shows a static hint instead of a scrubber.
 */
export function EmbedPlayer() {
  const option = usePlayerStore((s) => s.option);
  const status = usePlayerStore((s) => s.status);

  if (!option || option.option.type !== 'embed' || status === 'idle') return null;
  const url = buildEmbedUrl(option.source, option.option.payload);

  if (!url) {
    return (
      <div className="border-b bg-card px-4 py-3 text-sm text-muted-foreground">
        该来源（{option.source}）暂不支持嵌入播放
      </div>
    );
  }

  return (
    <div className="border-b bg-black">
      <div className="mx-auto aspect-video max-w-3xl">
        <iframe
          key={url}
          src={url}
          className="h-full w-full"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          title="embedded player"
        />
      </div>
    </div>
  );
}
