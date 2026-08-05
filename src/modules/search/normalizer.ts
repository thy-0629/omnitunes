import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { recordings, songWorks, sourceItems } from '../../db/schema.js';
import type { RawHit, SourceAttributionMetadata, SourceId, SourceQualityMetadata } from '../sources/types.js';

/** One raw hit tagged with the source it came from. */
export interface NormalizerInput {
  sourceId: SourceId;
  hit: RawHit;
}

/** A fully normalized + persisted slice of the five-layer model. */
export interface NormalizedEntry {
  songWork: typeof songWorks.$inferSelect;
  recording: typeof recordings.$inferSelect;
  sourceItem: typeof sourceItems.$inferSelect;
  sourceId: SourceId;
}

/**
 * The transaction callback receives a `SQLiteTransaction`, NOT the root db
 * (which is `BetterSQLite3Database`). They share the query surface but are
 * distinct types. Extract the exact param type so private helpers stay typed.
 */
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/** Two recordings within this many seconds are treated as the same take. */
const DURATION_TOLERANCE_SEC = 3;

/**
 * Normalizer — turns per-source RawHits into the shared five-layer model
 * (SongWork → Recording → SourceItem) and persists them with idempotent
 * upserts so repeated searches for the same query don't create duplicates.
 *
 * Matching strategy (deliberately conservative — we never merge across
 * sources without a fingerprint):
 *   1. SongWork:   by fingerprint (if the adapter provided one), else by
 *                  normalized title + artists.
 *   2. Recording:  same SongWork + duration within ±3s (a different take
 *                  gets its own recording). No duration -> reuse the
 *                  SongWork's single recording or create one.
 *   3. SourceItem: unique by (source, externalId) — upserted, fetchedAt
 *                  refreshed, soft-deletes resurrected.
 *
 * NOTE: better-sqlite3 is synchronous, so the transaction callback and every
 * helper below are synchronous too (`.get()` / `.all()` / `.returning()`
 * return plain values, not promises). We wrap the whole batch in one
 * transaction so it's all-or-nothing.
 */
export class Normalizer {
  constructor(private readonly db: DbClient) {}

  normalizeAll(inputs: NormalizerInput[]): NormalizedEntry[] {
    if (inputs.length === 0) return [];
    return this.db.transaction((tx) => inputs.map((input) => this.normalizeOne(tx, input)));
  }

  private normalizeOne(tx: Tx, input: NormalizerInput): NormalizedEntry {
    const { sourceId, hit } = input;
    const title = hit.title.trim();
    const artists = hit.artists.trim();
    const fingerprint = extractFingerprint(hit);

    const songWork = this.resolveSongWork(tx, { title, artists, fingerprint });
    const recording = this.resolveRecording(tx, songWork.id, hit);
    const sourceItem = this.upsertSourceItem(tx, { sourceId, hit, recordingId: recording.id });

    return { songWork, recording, sourceItem, sourceId };
  }

  private resolveSongWork(
    tx: Tx,
    { title, artists, fingerprint }: { title: string; artists: string; fingerprint: string | null },
  ): NormalizedEntry['songWork'] {
    // 1) fingerprint wins if the adapter provided one
    if (fingerprint) {
      const byFp = tx
        .select()
        .from(songWorks)
        .where(eq(songWorks.fingerprint, fingerprint))
        .limit(1)
        .get();
      if (byFp) return byFp;
    }

    // 2) normalized title + artists
    const byName = tx
      .select()
      .from(songWorks)
      .where(
        and(
          eq(sql`lower(${songWorks.title})`, norm(title)),
          eq(sql`lower(${songWorks.artists})`, norm(artists)),
        ),
      )
      .limit(1)
      .get();
    if (byName) return byName;

    // 3) title-only fallback using canonical title (handles "江南 (Live)" vs "江南")
    const hitCanonical = canonicalTitle(title);
    if (hitCanonical.length >= 2) {
      const likePattern = `%${hitCanonical}%`;
      const candidatesExisting = tx
        .select()
        .from(songWorks)
        .where(sql`lower(${songWorks.title}) LIKE ${likePattern}`)
        .all();
      for (const candidate of candidatesExisting) {
        if (canonicalTitle(candidate.title) === hitCanonical) {
          return candidate;
        }
      }
    }

    // 4) create — better-sqlite3 RETURNING always yields the inserted row
    const created = tx
      .insert(songWorks)
      .values({
        id: randomUUID(),
        title,
        artists,
        fingerprint: fingerprint ?? null,
      })
      .returning()
      .get();
    return created!;
  }

  private resolveRecording(tx: Tx, songWorkId: string, hit: RawHit): NormalizedEntry['recording'] {
    const existing = tx.select().from(recordings).where(eq(recordings.songWorkId, songWorkId)).all();

    // a different take (duration off by > tolerance) gets its own recording
    if (hit.durationSec != null) {
      const close = existing.find(
        (r) => r.durationSec != null && Math.abs(r.durationSec - hit.durationSec!) <= DURATION_TOLERANCE_SEC,
      );
      if (close) return close;
    } else if (existing.length > 0) {
      // no duration hint -> reuse the first recording we already have
      return existing[0]!;
    }

    const created = tx
      .insert(recordings)
      .values({
        id: randomUUID(),
        songWorkId,
        durationSec: hit.durationSec ?? null,
        performers: hit.artists.trim() || null,
      })
      .returning()
      .get();
    return created!;
  }

  private upsertSourceItem(
    tx: Tx,
    { sourceId, hit, recordingId }: { sourceId: SourceId; hit: RawHit; recordingId: string },
  ): NormalizedEntry['sourceItem'] {
    const qualityMetadata = sanitizeQualityMetadata(hit.metadata?.quality);
    const attributionMetadata = readAttributionMetadata(hit.metadata?.attribution);
    const existing = tx
      .select()
      .from(sourceItems)
      .where(and(eq(sourceItems.source, sourceId), eq(sourceItems.externalId, hit.externalId)))
      .limit(1)
      .get();

    if (existing) {
      // refresh metadata + resurrect if it was soft-deleted
      const updated = tx
        .update(sourceItems)
        .set({
          recordingId, // may have re-matched to a different recording
          publisher: hit.publisher ?? null,
          thumbnailUrl: hit.thumbnailUrl ?? null,
          url: (hit.metadata?.['url'] as string | undefined) ?? null,
          qualityMetadata,
          attributionMetadata,
          fetchedAt: Date.now(),
          deletedAt: null,
        })
        .where(eq(sourceItems.id, existing.id))
        .returning()
        .get();
      return updated!;
    }

    const created = tx
      .insert(sourceItems)
      .values({
        id: randomUUID(),
        recordingId,
        source: sourceId,
        externalId: hit.externalId,
        publisher: hit.publisher ?? null,
        thumbnailUrl: hit.thumbnailUrl ?? null,
        url: (hit.metadata?.['url'] as string | undefined) ?? null,
        qualityMetadata,
        attributionMetadata,
      })
      .returning()
      .get();
    return created!;
  }
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

/** Lowercase + collapse whitespace. Used as a soft business key for SongWork. */
function norm(s: string): string {
  return normalizeBase(s);
}

/** Canonical title for matching variants of the same song. */
export function canonicalTitle(title: string): string {
  return titleCandidates(title)[0] ?? '';
}

/** Possible canonical titles extracted from a raw title. */
function titleCandidates(title: string): string[] {
  const base = normalizeBase(title);
  const candidates = new Set<string>();

  // primary: full title with brackets stripped and suffixes removed
  const withoutBrackets = stripBracketsAndContents(base);
  const withoutSuffixes = stripCommonSuffixes(withoutBrackets);
  const primary = withoutSuffixes.replace(/\s+/g, ' ').trim();
  if (primary.length >= 2) candidates.add(primary);

  // content inside brackets is often the actual song title
  for (const m of base.matchAll(/\(([^)]*)\)/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/\[([^\]]*)\]/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/\{([^}]*)\}/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/（([^）]*)）/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/【([^】]*)】/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/〔([^〕]*)〕/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/《([^》]+)》/g)) addCandidate(candidates, m[1]!);
  for (const m of base.matchAll(/「([^」]+)」/g)) addCandidate(candidates, m[1]!);

  // "歌手 - 歌名" / "歌手 – 歌名" / "歌手 — 歌名" -> keep both sides
  for (const segment of base.split(/\s*[-–—]\s*/)) {
    addCandidate(candidates, segment);
  }

  return [...candidates];
}

function addCandidate(set: Set<string>, s: string) {
  const clean = stripCommonSuffixes(stripBracketsAndContents(s))
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length >= 2) set.add(clean);
}

function normalizeBase(s: string): string {
  return s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripBracketsAndContents(s: string): string {
  // remove bracketed content: (..) [..] {..} （..） 【..】 〔..〕 《..》 「..」
  return s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/〔[^〕]*〕/g, ' ')
    .replace(/《[^》]*》/g, ' ')
    .replace(/「[^」]*」/g, ' ');
}

function stripCommonSuffixes(s: string): string {
  return (
    s
      // common suffix keywords and everything after them
      .replace(
        /(\s+[-–—]|\s*[:：])?\s*(official\s*(mv|video|audio|hd)?|mv\b|pv\b|lyric(s)?\s*video|live\b|cover\b|instrumental\b|acoustic\b|remix\b|version\b|ft\.?|feat\.?|with\b|vs\.?).*$/gi,
        ' ',
      )
      // stray standalone separators at end
      .replace(/\s+[-–—]\s*$/g, ' ')
  );
}

function extractFingerprint(hit: RawHit): string | null {
  const fp = hit.metadata?.['fingerprint'];
  return typeof fp === 'string' && fp.length > 0 ? fp : null;
}

function sanitizeQualityMetadata(value: unknown): SourceQualityMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const quality: SourceQualityMetadata = {};
  if (typeof raw['playCount'] === 'number' && Number.isFinite(raw['playCount']) && raw['playCount'] >= 0) {
    quality.playCount = raw['playCount'];
  }
  if (
    typeof raw['interactionCount'] === 'number' &&
    Number.isFinite(raw['interactionCount']) &&
    raw['interactionCount'] >= 0
  ) {
    quality.interactionCount = raw['interactionCount'];
  }
  if (typeof raw['isOfficialPublisher'] === 'boolean') {
    quality.isOfficialPublisher = raw['isOfficialPublisher'];
  }

  return Object.keys(quality).length > 0 ? quality : null;
}

function readAttributionMetadata(value: unknown): SourceAttributionMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const attribution = value as Record<string, unknown>;
  const license = attribution['license'];
  const licenseUrl = attribution['licenseUrl'];
  const sourceUrl = attribution['sourceUrl'];
  const creator = attribution['creator'];

  if (
    !isNonEmptyString(license) ||
    !isNonEmptyString(licenseUrl) ||
    !isNonEmptyString(sourceUrl) ||
    !isNonEmptyString(creator) ||
    !isHttpsUrl(licenseUrl) ||
    !isHttpsUrl(sourceUrl)
  ) {
    return null;
  }

  return { license, licenseUrl, sourceUrl, creator };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
