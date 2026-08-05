import { Badge } from '@/components/ui/badge';
import type { SourceId } from '@/lib/api/types';
import { sourcePresentation } from '@/lib/source-presentation';

export function SourceBadge({ source }: { source: SourceId }) {
  const { label, tone } = sourcePresentation(source);
  return <Badge className={`${tone} border-transparent`}>{label}</Badge>;
}
