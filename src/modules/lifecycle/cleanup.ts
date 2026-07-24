import { sql, eq, and, lt, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { playHistory, sourceItems, playableOptions, recordings, songWorks, collections, playlistItems } from '../../db/schema.js';
import { config } from '../../config/env.js';

export interface CleanupResult {
  ranAt: number;
  retentionDays: number;
  deleted: {
    playHistory: number;
    softDeletedSourceItems: number;
    expiredPlayableOptions: number;
    orphanRecordings: number;
    orphanSongWorks: number;
  };
  durationMs: number;
}

/**
 * Data lifecycle cleanup service.
 *
 * Runs a series of DELETE operations inside a single transaction:
 *
 * 1. play_history older than RETENTION_DAYS
 * 2. soft-deleted source_items (deleted_at set) older than RETENTION_DAYS → hard delete
 * 3. playable_options whose expires_at has passed
 * 4. orphan recordings (no source_items reference them)
 * 5. orphan song_works (no recordings, no collections, no playlist_items)
 *
 * Steps 4 & 5 are "cascading orphans": deleting source_items in step 2
 * may leave recordings without children, and deleting recordings leaves
 * song_works without children. We clean those up too.
 */
export class LifecycleCleanup {
  constructor(private db: DbClient) {}

  /**
   * Run the full cleanup cycle. Returns counts of deleted rows per table.
   */
  run(): CleanupResult {
    const start = Date.now();
    const now = Date.now();
    const cutoff = now - config.LIFECYCLE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const result: CleanupResult = {
      ranAt: now,
      retentionDays: config.LIFECYCLE_RETENTION_DAYS,
      deleted: {
        playHistory: 0,
        softDeletedSourceItems: 0,
        expiredPlayableOptions: 0,
        orphanRecordings: 0,
        orphanSongWorks: 0,
      },
      durationMs: 0,
    };

    // Everything in a single transaction for atomicity.
    // better-sqlite3 sync transaction — callback must be synchronous.
    this.db.transaction((tx) => {
      // 1. Delete old play_history rows
      const r1 = tx.delete(playHistory).where(lt(playHistory.playedAt, cutoff)).run();
      result.deleted.playHistory = r1.changes;

      // 2. Hard-delete soft-deleted source_items older than cutoff
      const r2 = tx
        .delete(sourceItems)
        .where(and(
          // deleted_at is not null AND deleted_at < cutoff
          sql`${sourceItems.deletedAt} IS NOT NULL AND ${sourceItems.deletedAt} < ${cutoff}`,
        ))
        .run();
      result.deleted.softDeletedSourceItems = r2.changes;

      // 3. Delete expired playable_options
      const r3 = tx
        .delete(playableOptions)
        .where(and(
          sql`${playableOptions.expiresAt} IS NOT NULL AND ${playableOptions.expiresAt} < ${now}`,
        ))
        .run();
      result.deleted.expiredPlayableOptions = r3.changes;

      // 4. Delete orphan recordings — no source_items reference them
      //    (recordingId not in SELECT recording_id FROM source_items)
      const r4 = tx.run(sql`
        DELETE FROM recordings
        WHERE id NOT IN (SELECT recording_id FROM source_items WHERE recording_id IS NOT NULL)
      `);
      result.deleted.orphanRecordings = r4.changes;

      // 5. Delete orphan song_works — no recordings, no collections, no playlist_items
      const r5 = tx.run(sql`
        DELETE FROM song_works
        WHERE id NOT IN (SELECT song_work_id FROM recordings WHERE song_work_id IS NOT NULL)
          AND id NOT IN (SELECT song_work_id FROM collections WHERE song_work_id IS NOT NULL)
          AND id NOT IN (SELECT song_work_id FROM playlist_items WHERE song_work_id IS NOT NULL)
      `);
      result.deleted.orphanSongWorks = r5.changes;
    });

    result.durationMs = Date.now() - start;
    return result;
  }
}
