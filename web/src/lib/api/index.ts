import { api } from './client';
import type {
  CollectionEntry,
  HealthSnapshot,
  HistoryEntry,
  Playlist,
  PlaylistItem,
  QueueSnapshot,
  ResolvePlayResult,
  SourceDescription,
  SourceId,
  StartPlayResult,
  UnifiedSearchResult,
} from './types';

// --- search ---
export const search = (q: string, opts: { limit?: number; sources?: SourceId[] } = {}) =>
  api<UnifiedSearchResult>('/api/search', {
    query: { q, limit: opts.limit, sources: opts.sources?.join(',') },
  });

// --- playback ---
export const resolvePlay = (body: {
  songWorkId?: string;
  recordingId?: string;
  sourceItemId?: string;
  preferredSource?: SourceId;
}) => api<ResolvePlayResult>('/api/play/resolve', { method: 'POST', body });

export const startPlay = (body: {
  sourceItemId: string;
  optionId?: string;
  trigger?: 'manual' | 'queue' | 'autoplay';
}) => api<StartPlayResult>('/api/play/start', { method: 'POST', body });

export const endPlay = (playId: string, body: {
  outcome: 'completed' | 'skipped' | 'failed';
  durationPlayedSec?: number;
}) => api<{ ok: true }>(`/api/play/${playId}/end`, { method: 'POST', body });

export const fallbackPlay = (playId: string, reason: string) =>
  api<StartPlayResult & { fallbackFromId: string }>(`/api/play/${playId}/fallback`, {
    method: 'POST',
    body: { reason },
  });

export const localStreamUrl = (sourceItemId: string) => `/api/local/stream/${sourceItemId}`;

// --- queue ---
export const getQueue = () => api<QueueSnapshot>('/api/queue');
export const addToQueue = (songWorkId: string, sourceItemId?: string) =>
  api<{ item: unknown; total: number }>('/api/queue', { method: 'POST', body: { songWorkId, sourceItemId } });
export const removeFromQueue = (position: number) =>
  api<{ ok: true; total: number }>(`/api/queue/${position}`, { method: 'DELETE' });
export const nextInQueue = (autoStart = true) =>
  api<{ queueItem: unknown; resolve: ResolvePlayResult }>('/api/queue/next', {
    method: 'POST',
    body: { autoStart },
  });
export const clearQueue = () => api<{ ok: true; removed: number }>('/api/queue/clear', { method: 'POST' });

// --- history ---
export const getHistory = (opts: { limit?: number; offset?: number } = {}) =>
  api<{ items: HistoryEntry[]; total: number; limit: number; offset: number }>('/api/history', {
    query: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
  });

// --- collections ---
export const getCollections = () =>
  api<{ items: CollectionEntry[]; total: number }>('/api/collections');
export const addCollection = (songWorkId: string) =>
  api<{ collection: unknown }>('/api/collections', { method: 'POST', body: { songWorkId } });
export const removeCollection = (songWorkId: string) =>
  api<{ ok: true }>(`/api/collections/${songWorkId}`, { method: 'DELETE' });

// --- playlists ---
export const getPlaylists = () => api<{ items: Playlist[]; total: number }>('/api/playlists');
export const createPlaylist = (name: string) =>
  api<{ playlist: Playlist }>('/api/playlists', { method: 'POST', body: { name } });
export const getPlaylist = (id: string) =>
  api<{ playlist: Playlist; items: PlaylistItem[]; total: number }>(`/api/playlists/${id}`);
export const renamePlaylist = (id: string, name: string) =>
  api<{ playlist: Playlist }>(`/api/playlists/${id}`, { method: 'PATCH', body: { name } });
export const deletePlaylist = (id: string) =>
  api<{ ok: true }>(`/api/playlists/${id}`, { method: 'DELETE' });
export const addPlaylistItem = (id: string, songWorkId: string, position?: number) =>
  api<{ item: unknown }>(`/api/playlists/${id}/items`, {
    method: 'POST',
    body: { songWorkId, position },
  });
export const removePlaylistItem = (id: string, itemId: string) =>
  api<{ ok: true }>(`/api/playlists/${id}/items/${itemId}`, { method: 'DELETE' });
export const movePlaylistItem = (id: string, itemId: string, position: number) =>
  api<{ item: unknown }>(`/api/playlists/${id}/items/${itemId}`, {
    method: 'PATCH',
    body: { position },
  });

// --- sources ---
export const getSources = () => api<{ sources: SourceDescription[] }>('/api/sources');
export const getSourcesHealth = () =>
  api<{ health: Record<SourceId, HealthSnapshot> }>('/api/sources/health');
