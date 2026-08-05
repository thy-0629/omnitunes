import type { SourceAttributionMetadata } from '@/lib/api/types';

interface SourceAttributionProps {
  attribution: SourceAttributionMetadata | null;
}

export function SourceAttribution({ attribution }: SourceAttributionProps) {
  if (!attribution) return null;

  return (
    <a
      href={attribution.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${attribution.creator} · ${attribution.license}`}
    >
      {attribution.license}
    </a>
  );
}
