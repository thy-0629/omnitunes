/**
 * §十 Data Lifecycle integration test.
 *
 * Inserts "stale" rows into various tables, then triggers cleanup
 * via POST /api/admin/lifecycle/run and verifies the deleted counts.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const DB_PATH = './data/omnitune.sqlite';
const API = 'http://localhost:3000';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const thirtyFiveDaysAgo = now - 35 * DAY;
const oneDayAgo = now - 1 * DAY;

let pass = 0;
let fail = 0;

function ok(label: string) {
  pass++;
  console.log(`  \u2713 ${label}`);
}
function notOk(label: string, detail?: string) {
  fail++;
  console.log(`  \u2717 ${label}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // --- Open DB directly to insert test data ---
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // Snapshot current counts
  const before = countAll(db);
  console.log('\n=== Before cleanup (existing data) ===');
  printCounts(before);

  // --- Insert test data ---

  // 1. Two old play_history rows (35 days ago → should be deleted)
  const songWorkIds = db.prepare('SELECT id FROM song_works LIMIT 1').all() as { id: string }[];
  const swId = songWorkIds[0]?.id;
  if (!swId) throw new Error('No song_works found in DB');

  const oldPlay1 = randomUUID();
  const oldPlay2 = randomUUID();
  db.prepare(`
    INSERT INTO play_history (id, song_work_id, source, trigger, outcome, played_at)
    VALUES (?, ?, 'mock', 'manual', 'completed', ?)
  `).run(oldPlay1, swId, thirtyFiveDaysAgo);
  db.prepare(`
    INSERT INTO play_history (id, song_work_id, source, trigger, outcome, played_at)
    VALUES (?, ?, 'mock', 'manual', 'skipped', ?)
  `).run(oldPlay2, swId, thirtyFiveDaysAgo);
  console.log('\nInserted 2 old play_history rows (35 days ago)');

  // Also insert a recent one (1 day ago → should NOT be deleted)
  const recentPlay = randomUUID();
  db.prepare(`
    INSERT INTO play_history (id, song_work_id, source, trigger, outcome, played_at)
    VALUES (?, ?, 'mock', 'manual', 'completed', ?)
  `).run(recentPlay, swId, oneDayAgo);
  console.log('Inserted 1 recent play_history row (1 day ago → should survive)');

  // 2. Soft-delete a source_item (35 days ago → should be hard-deleted)
  // Pick one that has no playable_options to avoid complexity
  const si = db.prepare(`
    SELECT si.id, si.recording_id FROM source_items si
    WHERE si.deleted_at IS NULL
    AND si.id NOT IN (SELECT source_item_id FROM playable_options WHERE source_item_id IS NOT NULL)
    LIMIT 1
  `).get() as { id: string; recording_id: string } | undefined;

  let softDeletedSiId: string | undefined;
  let orphanedRecordingId: string | undefined;
  let orphanedSongWorkId: string | undefined;

  if (si) {
    softDeletedSiId = si.id;
    orphanedRecordingId = si.recording_id;
    // Check if the recording's song_work has other recordings
    const recording = db.prepare('SELECT song_work_id FROM recordings WHERE id = ?').get(orphanedRecordingId) as { song_work_id: string };
    const otherRecordings = db.prepare('SELECT COUNT(*) as n FROM recordings WHERE song_work_id = ? AND id != ?').get(recording.song_work_id, orphanedRecordingId) as { n: number };
    const hasCollection = db.prepare('SELECT COUNT(*) as n FROM collections WHERE song_work_id = ?').get(recording.song_work_id) as { n: number };
    const hasPlaylistItem = db.prepare('SELECT COUNT(*) as n FROM playlist_items WHERE song_work_id = ?').get(recording.song_work_id) as { n: number };

    if (otherRecordings.n === 0 && hasCollection.n === 0 && hasPlaylistItem.n === 0) {
      orphanedSongWorkId = recording.song_work_id;
    }

    db.prepare('UPDATE source_items SET deleted_at = ? WHERE id = ?').run(thirtyFiveDaysAgo, softDeletedSiId);
    console.log(`Soft-deleted source_item ${softDeletedSiId} (35 days ago)`);
    console.log(`  → recording ${orphanedRecordingId} will become orphan`);
    if (orphanedSongWorkId) {
      console.log(`  → song_work ${orphanedSongWorkId} will become orphan too`);
    }
  } else {
    console.log('No suitable source_item found for soft-delete test');
  }

  // 3. Insert an expired playable_option
  const anySi = db.prepare('SELECT id FROM source_items LIMIT 1').get() as { id: string };
  const expiredOptionId = randomUUID();
  db.prepare(`
    INSERT INTO playable_options (id, source_item_id, type, payload, status, expires_at)
    VALUES (?, ?, 'stream', 'http://expired.example.com/audio.mp3', 'expired', ?)
  `).run(expiredOptionId, anySi.id, oneDayAgo);
  console.log(`Inserted expired playable_option (expires_at = 1 day ago)`);

  // 4. Insert an orphan recording (linked to existing song_work, but no source_items)
  const orphanRecId = randomUUID();
  db.prepare(`
    INSERT INTO recordings (id, song_work_id, version_type, duration_sec)
    VALUES (?, ?, 'studio', 200)
  `).run(orphanRecId, swId);
  console.log(`Inserted orphan recording ${orphanRecId} (no source_items reference it)`);

  // 5. Insert a fully orphan song_work (no recordings, no collections, no playlist_items)
  const orphanSwId = randomUUID();
  db.prepare(`
    INSERT INTO song_works (id, title, artists, created_at, updated_at)
    VALUES (?, 'Test Orphan Song', 'Test Artist', ?, ?)
  `).run(orphanSwId, now, now);
  console.log(`Inserted orphan song_work ${orphanSwId} (no relations at all)`);

  const afterInsert = countAll(db);
  console.log('\n=== After inserting test data ===');
  printCounts(afterInsert);

  db.close();

  // --- Trigger cleanup via API ---
  console.log('\n=== Triggering cleanup via POST /api/admin/lifecycle/run ===');
  const res = await fetch(`${API}/api/admin/lifecycle/run`, { method: 'POST' });
  const result = await res.json();
  console.log(JSON.stringify(result, null, 2));

  // --- Verify results ---
  console.log('\n=== Verifying cleanup results ===');

  // 1. play_history: 2 old deleted, 1 recent survived
  if (result.deleted.playHistory === 2) {
    ok(`playHistory deleted = 2 (expected 2)`);
  } else {
    notOk(`playHistory deleted = ${result.deleted.playHistory} (expected 2)`);
  }

  const db2 = new Database(DB_PATH);
  const oldPlayStillExists = db2.prepare('SELECT COUNT(*) as n FROM play_history WHERE id IN (?, ?)').get(oldPlay1, oldPlay2) as { n: number };
  if (oldPlayStillExists.n === 0) {
    ok('old play_history rows deleted from DB');
  } else {
    notOk('old play_history rows still in DB', `${oldPlayStillExists.n} remaining`);
  }

  const recentPlayExists = db2.prepare('SELECT COUNT(*) as n FROM play_history WHERE id = ?').get(recentPlay) as { n: number };
  if (recentPlayExists.n === 1) {
    ok('recent play_history row survived (1 day ago < 30 day cutoff)');
  } else {
    notOk('recent play_history row was incorrectly deleted');
  }

  // 2. soft-deleted source_items
  if (softDeletedSiId) {
    if (result.deleted.softDeletedSourceItems === 1) {
      ok(`softDeletedSourceItems = 1 (expected 1)`);
    } else {
      notOk(`softDeletedSourceItems = ${result.deleted.softDeletedSourceItems} (expected 1)`);
    }
    const siStillExists = db2.prepare('SELECT COUNT(*) as n FROM source_items WHERE id = ?').get(softDeletedSiId) as { n: number };
    if (siStillExists.n === 0) {
      ok('soft-deleted source_item hard-deleted from DB');
    } else {
      notOk('soft-deleted source_item still in DB');
    }
  }

  // 3. expired playable_options (>= 1 because we inserted 1; may be more from prior tests)
  if (result.deleted.expiredPlayableOptions >= 1) {
    ok(`expiredPlayableOptions = ${result.deleted.expiredPlayableOptions} (expected >= 1)`);
  } else {
    notOk(`expiredPlayableOptions = ${result.deleted.expiredPlayableOptions} (expected >= 1)`);
  }
  const expiredOptExists = db2.prepare('SELECT COUNT(*) as n FROM playable_options WHERE id = ?').get(expiredOptionId) as { n: number };
  if (expiredOptExists.n === 0) {
    ok('expired playable_option deleted from DB');
  } else {
    notOk('expired playable_option still in DB');
  }

  // 4. orphan recordings (includes the one from soft-deleted source_item + the manually inserted one)
  // At minimum 2 (orphan from soft-delete + manually inserted orphan)
  if (result.deleted.orphanRecordings >= 2) {
    ok(`orphanRecordings = ${result.deleted.orphanRecordings} (expected >= 2)`);
  } else {
    notOk(`orphanRecordings = ${result.deleted.orphanRecordings} (expected >= 2)`);
  }
  const orphanRecExists = db2.prepare('SELECT COUNT(*) as n FROM recordings WHERE id = ?').get(orphanRecId) as { n: number };
  if (orphanRecExists.n === 0) {
    ok('manually inserted orphan recording deleted from DB');
  } else {
    notOk('manually inserted orphan recording still in DB');
  }

  // 5. orphan song_works
  if (result.deleted.orphanSongWorks >= 1) {
    ok(`orphanSongWorks = ${result.deleted.orphanSongWorks} (expected >= 1)`);
  } else {
    notOk(`orphanSongWorks = ${result.deleted.orphanSongWorks} (expected >= 1)`);
  }
  const orphanSwExists = db2.prepare('SELECT COUNT(*) as n FROM song_works WHERE id = ?').get(orphanSwId) as { n: number };
  if (orphanSwExists.n === 0) {
    ok('manually inserted orphan song_work deleted from DB');
  } else {
    notOk('manually inserted orphan song_work still in DB');
  }

  // 6. Existing data should be preserved
  const after = countAll(db2);
  console.log('\n=== After cleanup ===');
  printCounts(after);

  // song_works: original minus orphaned-from-softdelete (the manually inserted orphan nets to 0: added then deleted)
  const originalSwCount = before.songWorks;
  const expectedSwAfter = originalSwCount - (orphanedSongWorkId ? 1 : 0);
  if (after.songWorks === expectedSwAfter) {
    ok(`song_works count = ${after.songWorks} (expected ${expectedSwAfter})`);
  } else {
    notOk(`song_works count = ${after.songWorks} (expected ${expectedSwAfter})`);
  }

  // 7. GET /api/admin/lifecycle/status should show lastRun
  console.log('\n=== Checking lifecycle status ===');
  const statusRes = await fetch(`${API}/api/admin/lifecycle/status`);
  const status = await statusRes.json();
  if (status.lastRun && status.lastRun.ranAt) {
    ok('GET /api/admin/lifecycle/status → lastRun populated');
  } else {
    notOk('GET /api/admin/lifecycle/status → lastRun is null');
  }
  if (status.nextRun && status.nextRun > Date.now()) {
    ok('GET /api/admin/lifecycle/status → nextRun in future');
  } else {
    notOk('GET /api/admin/lifecycle/status → nextRun invalid');
  }
  if (status.config.retentionDays === 30 && status.config.intervalHours === 24) {
    ok('GET /api/admin/lifecycle/status → config correct');
  } else {
    notOk('GET /api/admin/lifecycle/status → config mismatch');
  }

  // 8. Idempotency: running again should delete 0
  console.log('\n=== Idempotency: second run should delete 0 ===');
  const res2 = await fetch(`${API}/api/admin/lifecycle/run`, { method: 'POST' });
  const result2 = await res2.json();
  const totalDeleted = Object.values(result2.deleted).reduce((a: number, b: unknown) => a + (b as number), 0);
  if (totalDeleted === 0) {
    ok('second run deleted 0 rows (idempotent)');
  } else {
    notOk(`second run deleted ${totalDeleted} rows (expected 0)`, JSON.stringify(result2.deleted));
  }

  // 9. durationMs is reasonable
  if (result.durationMs >= 0 && result.durationMs < 5000) {
    ok(`durationMs = ${result.durationMs}ms (reasonable)`);
  } else {
    notOk(`durationMs = ${result.durationMs}ms (suspicious)`);
  }

  db2.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

function countAll(db: Database.Database) {
  const q = (t: string) => (db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get() as { n: number }).n;
  return {
    songWorks: q('song_works'),
    recordings: q('recordings'),
    sourceItems: q('source_items'),
    playableOptions: q('playable_options'),
    playHistory: q('play_history'),
    collections: q('collections'),
    playlists: q('playlists'),
    playlistItems: q('playlist_items'),
  };
}

function printCounts(c: ReturnType<typeof countAll>) {
  for (const [k, v] of Object.entries(c)) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
