/**
 * Mirrors of backend response shapes (see API.md / src modules).
 * Kept hand-written on purpose: the backend is the source of truth and
 * these are the stable contract surfaces the UI consumes.
 */

export type SourceId = 'youtube' | 'open_source' | 'local' | 'mock' | 'bilibili';
export type PlayOptionType = 'embed' | 'stream' | 'local';

export interface SongWork {
  id: string;
  title: string;
  artists: string;
  aliases?: string[];
  fingerprint?: string | null;
  language?: string | null;
  year?: number | null;
}

export interface Recording {
  id: string;
  songWorkId: string;
  versionType: string;
  durationSec: number | null;
  performers: string | null;
  album: string | null;
}

export interface SourceQualityMetadata {
  playCount?: number;
  interactionCount?: number;
  isOfficialPublisher?: boolean;
}

export interface SourceAttributionMetadata {
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  creator: string;
}

export interface SourceItem {
  id: string;
  recordingId: string;
  source: SourceId;
  externalId: string;
  publisher: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  qualityMetadata: SourceQualityMetadata | null;
  attributionMetadata: SourceAttributionMetadata | null;
}

export interface SearchResultGroup {
  songWork: SongWork;
  recordings: Array<{
    recording: Recording;
    sourceItems: SourceItem[];
  }>;
}

export interface SearchError {
  source: SourceId;
  code: string;
  message: string;
}

export interface UnifiedSearchResult {
  query: string;
  totalSongWorks: number;
  results: SearchResultGroup[];
  errors: SearchError[];
  meta: {
    searchedAt: number;
    sourcesQueried: SourceId[];
    latencyMs: number;
  };
}

export interface PlayOption {
  type: PlayOptionType;
  payload: string;
  expiresAt?: number | null;
}

export interface RankedPlayOption {
  rank: number;
  sourceItem: SourceItem;
  option: PlayOption;
  playableOptionId: string;
  source: SourceId;
}

export interface ResolvePlayResult {
  options: RankedPlayOption[];
  best: RankedPlayOption | null;
  errors: Array<{ source: SourceId; sourceItemId?: string; code: string; message: string }>;
}

export interface StartPlayResult {
  playId: string;
  option: RankedPlayOption;
}

export interface QueueItem {
  id: string;
  songWorkId: string;
  songWork: { id: string; title: string; artists: string };
  sourceItemId?: string;
  enqueuedAt: number;
}

export interface QueueSnapshot {
  items: QueueItem[];
  total: number;
}

export interface QueueAddResult {
  item: QueueItem;
  total: number;
  duplicate: boolean;
}

export interface QueueMoveResult {
  ok: true;
  total: number;
}

export interface QueueNextResult {
  queueItem: QueueItem;
  resolve: ResolvePlayResult;
  started: StartPlayResult | null;
}

export interface HistoryEntry {
  id: string;
  songWorkId: string;
  songWorkTitle: string;
  songWorkArtists: string;
  source: SourceId;
  sourceItemId: string | null;
  trigger: string;
  outcome: string;
  durationPlayedSec: number | null;
  playedAt: number;
}

export interface CollectionEntry {
  songWorkId: string;
  preferredSource: SourceId | null;
  preferredRecordingId: string | null;
  createdAt: number;
  songWork: { id: string; title: string; artists: string };
}

export interface Playlist {
  id: string;
  name: string;
  visibility: 'private' | 'shared';
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistItem {
  id: string;
  songWorkId: string;
  position: number;
  addedAt: number;
  songWork: { id: string; title: string; artists: string };
}

export interface SourceDescription {
  id: SourceId;
  displayName: string;
  capabilities: { search: boolean; playOptions: boolean; health: boolean };
  stats: {
    totalCalls: number;
    successRate: number;
    playabilitySuccessRate: number | null;
    avgLatencyMs: number;
    lastErrorCode?: string;
    lastErrorAt?: number;
  };
}

export interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'unavailable';
  message?: string;
  checkedAt: number;
}
