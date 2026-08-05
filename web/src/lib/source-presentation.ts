import type { SourceId } from './api/types';

export interface SourcePresentation {
  label: string;
  tone: string;
}

const SOURCE_PRESENTATION: Record<SourceId, SourcePresentation> = {
  bilibili: { label: 'B站', tone: 'bg-pink-500/90 text-white' },
  open_source: { label: 'Archive', tone: 'bg-emerald-600/90 text-white' },
  openverse: { label: 'Openverse', tone: 'bg-violet-600/90 text-white' },
  wikimedia: { label: 'Commons', tone: 'bg-cyan-700/90 text-white' },
  local: { label: '本地', tone: 'bg-sky-600/90 text-white' },
  youtube: { label: 'YouTube', tone: 'bg-red-600/90 text-white' },
  mock: { label: 'Mock', tone: 'bg-zinc-500/90 text-white' },
};

export function sourcePresentation(source: SourceId): SourcePresentation {
  return SOURCE_PRESENTATION[source];
}
