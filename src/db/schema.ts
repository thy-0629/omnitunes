/**
 * Drizzle schema for Omnitune.
 *
 * Five-layer content model:
 *   SongWork       (abstract song)
 *     └─ Recording        (one concrete recording)
 *          └─ SourceItem  (a video/audio entry on a platform)
 *               └─ PlayableOption (how to play it: embed/stream/local)
 *   LocalAsset     (the actual media file on disk, linked via fingerprint)
 *
 * Plus long-term relations:
 *   Collection, Playlist/PlaylistItem, PlayHistory
 *
 * Health/lifecycle:
 *   SourceHealth, ApiKeyThirdParty
 *
 * Conventions:
 *   - All ids are text (cuid2 or uuid) so we can migrate to Postgres later without surprises.
 *   - Foreign keys use ON DELETE CASCADE unless we want to preserve orphans (SourceItem, PlayHistory).
 *   - Timestamps are unix epoch ms (integer) for portable sort/comparison.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// content layer
// -----------------------------------------------------------------------------

export const songWorks = sqliteTable(
  'song_works',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    /** canonicalized artist string. May contain multiple creators separated by a fixed delimiter. */
    artists: text('artists').notNull(),
    /** alternative titles, JSON array of strings. */
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().default([]),
    /** MusicBrainz recording id, AcoustID, or self-generated fingerprint. Used to dedupe across sources. */
    fingerprint: text('fingerprint'),
    /** language hint, ISO 639-1 (e.g. 'zh', 'en'). */
    language: text('language'),
    /** release year (best guess from any source). */
    year: integer('year'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    fpIdx: index('song_works_fingerprint_idx').on(t.fingerprint),
    titleArtistIdx: index('song_works_title_artists_idx').on(t.title, t.artists),
  }),
);

export const recordings = sqliteTable(
  'recordings',
  {
    id: text('id').primaryKey(),
    songWorkId: text('song_work_id')
      .notNull()
      .references(() => songWorks.id, { onDelete: 'cascade' }),
    /** live / studio / remix / cover / acoustic / karaoke / etc. */
    versionType: text('version_type').notNull().default('studio'),
    /** seconds. null = unknown yet (e.g. before play). */
    durationSec: real('duration_sec'),
    /** performer names for THIS recording, can differ from song work's artist. */
    performers: text('performers'),
    /** album name (if known). */
    album: text('album'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    swIdx: index('recordings_song_work_id_idx').on(t.songWorkId),
  }),
);

export const sourceItems = sqliteTable(
  'source_items',
  {
    id: text('id').primaryKey(),
    recordingId: text('recording_id')
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
    /** 'youtube' | 'open_source' | 'local' | future platforms. */
    source: text('source').notNull(),
    /** id within the platform (youtube videoId, jamendo track id, etc.). */
    externalId: text('external_id').notNull(),
    /** uploader / publisher label, for display. */
    publisher: text('publisher'),
    /** direct URL if applicable (open source streams, local file ref). */
    url: text('url'),
    /** thumbnail URL. */
    thumbnailUrl: text('thumbnail_url'),
    /** when this entry was first observed. Used for 30-day refresh policy. */
    fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
    /** true after a soft delete; row is preserved for audit. */
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    srcExtIdx: uniqueIndex('source_items_source_external_idx').on(t.source, t.externalId),
    recIdx: index('source_items_recording_id_idx').on(t.recordingId),
    fetchedIdx: index('source_items_fetched_at_idx').on(t.fetchedAt),
  }),
);

export const playableOptions = sqliteTable(
  'playable_options',
  {
    id: text('id').primaryKey(),
    sourceItemId: text('source_item_id')
      .notNull()
      .references(() => sourceItems.id, { onDelete: 'cascade' }),
    /** 'embed' (YouTube IFrame) | 'stream' (authorized URL) | 'local' (file) */
    type: text('type').notNull(),
    /** for embed: videoId; for stream: signed URL; for local: relative path. */
    payload: text('payload').notNull(),
    /** 'available' | 'blocked' | 'expired' | 'unknown'. */
    status: text('status').notNull().default('available'),
    /** epoch ms after which the option should be re-checked (signed URL expiry etc.). */
    expiresAt: integer('expires_at'),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    siIdx: index('playable_options_source_item_id_idx').on(t.sourceItemId),
  }),
);

export const localAssets = sqliteTable(
  'local_assets',
  {
    id: text('id').primaryKey(),
    /** absolute or root-relative path on disk. */
    path: text('path').notNull(),
    /** 'mp3' | 'flac' | 'm4a' | 'ogg' | 'wav' | 'mp4' | etc. */
    format: text('format').notNull(),
    /** sha256 of file contents; used for dedup + integrity. */
    checksum: text('checksum'),
    /** size in bytes. */
    sizeBytes: integer('size_bytes'),
    /** duration via ffprobe. */
    durationSec: real('duration_sec'),
    /** bitrate kbps. */
    bitrateKbps: integer('bitrate_kbps'),
    /** audio sample rate Hz. */
    sampleRate: integer('sample_rate'),
    /** id3 tags, parsed by music-metadata. JSON object. */
    tags: text('tags', { mode: 'json' }).$type<Record<string, unknown>>(),
    mtime: integer('mtime'),
    indexedAt: integer('indexed_at').notNull().default(sql`(unixepoch() * 1000)`),
    /** foreign link: this asset represents THIS source item (e.g. local mirror of a YouTube entry). nullable because local files can exist standalone. */
    sourceItemId: text('source_item_id').references(() => sourceItems.id, { onDelete: 'set null' }),
  },
  (t) => ({
    checksumIdx: uniqueIndex('local_assets_checksum_idx').on(t.checksum),
    siIdx: index('local_assets_source_item_id_idx').on(t.sourceItemId),
  }),
);

// -----------------------------------------------------------------------------
// long-term relations
// -----------------------------------------------------------------------------

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    songWorkId: text('song_work_id')
      .notNull()
      .references(() => songWorks.id, { onDelete: 'cascade' }),
    /** 'youtube' | 'open_source' | 'local' | future. */
    preferredSource: text('preferred_source'),
    /** optional pin: when this recording is preferred over alternatives. */
    preferredRecordingId: text('preferred_recording_id').references(() => recordings.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    swIdx: uniqueIndex('collections_song_work_id_idx').on(t.songWorkId),
  }),
);

export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 'private' | 'shared'. MVP defaults to private. */
  visibility: text('visibility').notNull().default('private'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const playlistItems = sqliteTable(
  'playlist_items',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    songWorkId: text('song_work_id')
      .notNull()
      .references(() => songWorks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: integer('added_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    plPosIdx: uniqueIndex('playlist_items_playlist_position_idx').on(t.playlistId, t.position),
    plIdx: index('playlist_items_playlist_id_idx').on(t.playlistId),
  }),
);

export const playHistory = sqliteTable(
  'play_history',
  {
    id: text('id').primaryKey(),
    songWorkId: text('song_work_id')
      .notNull()
      .references(() => songWorks.id, { onDelete: 'cascade' }),
    /** which source was used for this play. */
    source: text('source').notNull(),
    sourceItemId: text('source_item_id').references(() => sourceItems.id, { onDelete: 'set null' }),
    /** 'manual' | 'queue' | 'autoplay' | 'fallback'. */
    trigger: text('trigger').notNull().default('manual'),
    /** seconds actually played. */
    durationPlayedSec: real('duration_played_sec'),
    /** 'completed' | 'skipped' | 'failed' | 'still_playing'. */
    outcome: text('outcome').notNull().default('completed'),
    /** if a fallback kicked in, this points to the previous source item id. */
    fallbackFromId: text('fallback_from_id'),
    playedAt: integer('played_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    playedAtIdx: index('play_history_played_at_idx').on(t.playedAt),
    swIdx: index('play_history_song_work_id_idx').on(t.songWorkId),
  }),
);

// -----------------------------------------------------------------------------
// health & lifecycle
// -----------------------------------------------------------------------------

export const sourceHealth = sqliteTable('source_health', {
  id: text('id').primaryKey(),
  /** 'youtube' | 'open_source' | 'local'. */
  source: text('source').notNull(),
  /** success rate over last N=100 calls (rolling), 0..1. */
  successRate: real('success_rate').notNull().default(1.0),
  /** average latency ms. */
  avgLatencyMs: real('avg_latency_ms').notNull().default(0),
  /** 'embed_blocked' | 'source_gone' | 'codec_unsupported' | 'network' | 'unknown'. */
  lastErrorCode: text('last_error_code'),
  lastErrorAt: integer('last_error_at'),
  /** total calls since startup. */
  totalCalls: integer('total_calls').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const apiKeysThirdParty = sqliteTable(
  'api_keys_third_party',
  {
    id: text('id').primaryKey(),
    /** 'youtube_data_api' | 'youtube_oauth' | future. */
    provider: text('provider').notNull(),
    /** opaque key/secret blob. For MVP, plaintext. TODO: encrypt at rest. */
    key: text('key').notNull(),
    /** epoch ms when this key was last refreshed from provider. */
    lastRefreshAt: integer('last_refresh_at').notNull().default(sql`(unixepoch() * 1000)`),
    /** epoch ms when this key expires (null = no expiry). */
    expiresAt: integer('expires_at'),
    /** scope label, e.g. 'youtube.force-ssl'. */
    scope: text('scope'),
  },
  (t) => ({
    providerIdx: uniqueIndex('api_keys_third_party_provider_scope_idx').on(t.provider, t.scope),
  }),
);

// -----------------------------------------------------------------------------
// relations (typed joins for Drizzle's query API)
// -----------------------------------------------------------------------------

export const songWorksRelations = relations(songWorks, ({ many }) => ({
  recordings: many(recordings),
  collections: many(collections),
  playlistItems: many(playlistItems),
  playHistory: many(playHistory),
}));

export const recordingsRelations = relations(recordings, ({ one, many }) => ({
  songWork: one(songWorks, { fields: [recordings.songWorkId], references: [songWorks.id] }),
  sourceItems: many(sourceItems),
}));

export const sourceItemsRelations = relations(sourceItems, ({ one, many }) => ({
  recording: one(recordings, { fields: [sourceItems.recordingId], references: [recordings.id] }),
  playableOptions: many(playableOptions),
  localAsset: many(localAssets),
}));

export const playableOptionsRelations = relations(playableOptions, ({ one }) => ({
  sourceItem: one(sourceItems, { fields: [playableOptions.sourceItemId], references: [sourceItems.id] }),
}));

export const localAssetsRelations = relations(localAssets, ({ one }) => ({
  sourceItem: one(sourceItems, { fields: [localAssets.sourceItemId], references: [sourceItems.id] }),
}));

export const collectionsRelations = relations(collections, ({ one }) => ({
  songWork: one(songWorks, { fields: [collections.songWorkId], references: [songWorks.id] }),
  preferredRecording: one(recordings, {
    fields: [collections.preferredRecordingId],
    references: [recordings.id],
  }),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
  items: many(playlistItems),
}));

export const playlistItemsRelations = relations(playlistItems, ({ one }) => ({
  playlist: one(playlists, { fields: [playlistItems.playlistId], references: [playlists.id] }),
  songWork: one(songWorks, { fields: [playlistItems.songWorkId], references: [songWorks.id] }),
}));

export const playHistoryRelations = relations(playHistory, ({ one }) => ({
  songWork: one(songWorks, { fields: [playHistory.songWorkId], references: [songWorks.id] }),
  sourceItem: one(sourceItems, { fields: [playHistory.sourceItemId], references: [sourceItems.id] }),
}));

// -----------------------------------------------------------------------------
// inferred types (handy for repositories / services)
// -----------------------------------------------------------------------------

export type SongWork = typeof songWorks.$inferSelect;
export type NewSongWork = typeof songWorks.$inferInsert;
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type SourceItem = typeof sourceItems.$inferSelect;
export type NewSourceItem = typeof sourceItems.$inferInsert;
export type PlayableOption = typeof playableOptions.$inferSelect;
export type NewPlayableOption = typeof playableOptions.$inferInsert;
export type LocalAsset = typeof localAssets.$inferSelect;
export type NewLocalAsset = typeof localAssets.$inferInsert;
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
export type PlaylistItem = typeof playlistItems.$inferSelect;
export type NewPlaylistItem = typeof playlistItems.$inferInsert;
export type PlayHistoryRow = typeof playHistory.$inferSelect;
export type NewPlayHistoryRow = typeof playHistory.$inferInsert;
export type SourceHealthRow = typeof sourceHealth.$inferSelect;
export type ApiKeyThirdParty = typeof apiKeysThirdParty.$inferSelect;
export type NewApiKeyThirdParty = typeof apiKeysThirdParty.$inferInsert;