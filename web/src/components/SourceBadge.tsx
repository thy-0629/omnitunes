import { Badge } from '@/components/ui/badge';
import type { SourceId } from '@/lib/api/types';

const SOURCE_META: Record<SourceId, { label: string; className: string }> = {
  open_source: { label: 'Archive', className: 'bg-emerald-600/80 text-white border-transparent' },
  bilibili: { label: 'B站', className: 'bg-pink-500/80 text-white border-transparent' },
  local: { label: '本地', className: 'bg-sky-600/80 text-white border-transparent' },
  youtube: { label: 'YouTube', className: 'bg-red-600/80 text-white border-transparent' },
  mock: { label: 'Mock', className: 'bg-zinc-500/80 text-white border-transparent' },
};

export function SourceBadge({ source }: { source: SourceId }) {
  const meta = SOURCE_META[source] ?? { label: source, className: '' };
  return <Badge className={meta.className}>{meta.label}</Badge>;
}
