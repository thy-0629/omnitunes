import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { playableOptions, playHistory, recordings, sourceItems } from '../../db/schema.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { PlayOption, PlayOptionType, SourceId } from '../sources/types.js';

// -----------------------------------------------------------------------------
// public types
// -----------------------------------------------------------------------------

export interface ResolvePlayRequest {
  /** resolve options for all recordings under this song work. */
  songWorkId?: string;
  /** resolve options for source items under this recording only. */
  recordingId?: string;
  /** resolve options for this one source item only. */
  sourceItemId?: string;
  /** bump options from this source to the top of the ranking. */
  preferredSource?: SourceId;
}

export interface RankedPlayOption {
  rank: number;
  sourceItem: typeof sourceItems.$inferSelect;
  option: PlayOption;
  /** the DB row id in playable_options. */
  playableOptionId: string;
  source: SourceId;
}

export interface PlayErrorEntry {
  source: SourceId;
  sourceItemId?: string;
  code: string;
  message: string;
}

export interface ResolvePlayResult {
  options: RankedPlayOption[];
  best: RankedPlayOption | null;
  errors: PlayErrorEntry[];
}

export interface StartPlayRequest {
  sourceItemId: string;
  /** if omitted, the best option is resolved automatically. */
  optionId?: string;
  trigger?: 'manual' | 'queue' | 'autoplay';
}

export interface StartPlayResult {
  playId: string;
  option: RankedPlayOption;
}

export interface EndPlayRequest {
  outcome: 'completed' | 'skipped' | 'failed';
  durationPlayedSec?: number;
}

export interface FallbackRequest {
  reason: string;
}

export interface FallbackResult {
  playId: string;
  option: RankedPlayOption;
  fallbackFromId: string;
}

// -----------------------------------------------------------------------------
// internals
// -----------------------------------------------------------------------------

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

type SourceItemRow = typeof sourceItems.$inferSelect;

const TYPE_PRIORITY: Record<PlayOptionType, number> = {
  local: 0,
  stream: 1,
  embed: 2,
};

const VALID_TRIGGERS = ['manual', 'queue', 'autoplay', 'fallback'] as const;
type Trigger = (typeof VALID_TRIGGERS)[number];

// -----------------------------------------------------------------------------
// orchestrator
// -----------------------------------------------------------------------------

/**
 * PlaybackOrchestrator — the §五 layer.
 *
 * Given a song work / recording / source item, it resolves *all* ways to play
 * it by asking each source adapter live (online-first), persists the options
 * to `playable_options`, ranks them (local > stream > embed, preferred source
 * bumps to top), and returns the best choice + fallbacks.
 *
 * It also owns play-history: every `startPlay` creates a row, `endPlay`
 * finalises it, and `fallback` creates a new row linked to the previous one
 * via `fallbackFromId`.
 *
 * DB writes are synchronous (better-sqlite3); adapter calls are async and
 * fanned out with Promise.allSettled so one source failing doesn't block
 * the others — same pattern as the §四 search service.
 */
export class PlaybackOrchestrator {
  constructor(
    private readonly db: DbClient,
    private readonly registry: SourceRegistry,
  ) {}

  // --- resolve ---------------------------------------------------------------

  async resolvePlay(req: ResolvePlayRequest): Promise<ResolvePlayResult> {
    const items = this.findSourceItems(req);
    if (items.length === 0) return { options: [], best: null, errors: [] };

    // live fan-out — online-first
    const settled = await Promise.allSettled(
      items.map((si) => this.registry.instrumentedPlayOptions(si.source as SourceId, si.externalId)),
    );

    const errors: PlayErrorEntry[] = [];
    const collected: Array<{ sourceItem: SourceItemRow; option: PlayOption }> = [];

    settled.forEach((res, i) => {
      const si = items[i]!;
      if (res.status === 'fulfilled') {
        for (const opt of res.value) {
          collected.push({ sourceItem: si, option: opt });
        }
      } else {
        const err = res.reason as { code?: string; message?: string } | undefined;
        errors.push({
          source: si.source as SourceId,
          sourceItemId: si.id,
          code: err?.code ?? 'unknown',
          message: err?.message ?? String(res.reason),
        });
      }
    });

    if (collected.length === 0) return { options: [], best: null, errors };

    // persist to playable_options (sync, batched in one transaction)
    const persisted = this.db.transaction((tx) =>
      collected.map(({ sourceItem, option }) => {
        const existing = tx
          .select()
          .from(playableOptions)
          .where(
            and(
              eq(playableOptions.sourceItemId, sourceItem.id),
              eq(playableOptions.type, option.type),
              eq(playableOptions.payload, option.payload),
            ),
          )
          .limit(1)
          .get();

        if (existing) {
          const updated = tx
            .update(playableOptions)
            .set({
              status: 'available',
              expiresAt: option.expiresAt ?? null,
              updatedAt: Date.now(),
            })
            .where(eq(playableOptions.id, existing.id))
            .returning()
            .get();
          return { sourceItem, option, playableOptionId: updated!.id };
        }

        const created = tx
          .insert(playableOptions)
          .values({
            id: randomUUID(),
            sourceItemId: sourceItem.id,
            type: option.type,
            payload: option.payload,
            status: 'available',
            expiresAt: option.expiresAt ?? null,
          })
          .returning()
          .get();
        return { sourceItem, option, playableOptionId: created!.id };
      }),
    );

    const ranked = rankOptions(persisted, req.preferredSource);
    return { options: ranked, best: ranked[0] ?? null, errors };
  }

  // --- start / end / fallback ------------------------------------------------

  startPlay(req: StartPlayRequest): StartPlayResult {
    const si = this.db
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.id, req.sourceItemId))
      .limit(1)
      .get();
    if (!si) throw new PlayError('source_item_not_found', `source item not found: ${req.sourceItemId}`);

    // resolve songWorkId via recording
    const rec = this.db
      .select()
      .from(recordings)
      .where(eq(recordings.id, si.recordingId))
      .limit(1)
      .get();
    if (!rec) throw new PlayError('recording_not_found', `recording not found: ${si.recordingId}`);

    // find the option to play
    let optionRow: typeof playableOptions.$inferSelect;
    if (req.optionId) {
      const found = this.db
        .select()
        .from(playableOptions)
        .where(eq(playableOptions.id, req.optionId))
        .limit(1)
        .get();
      if (!found) throw new PlayError('option_not_found', `playable option not found: ${req.optionId}`);
      optionRow = found;
    } else {
      // auto-pick the best (lowest type priority)
      const best = this.db
        .select()
        .from(playableOptions)
        .where(
          and(
            eq(playableOptions.sourceItemId, si.id),
            eq(playableOptions.status, 'available'),
          ),
        )
        .all()
        .sort((a, b) => {
          const pa = TYPE_PRIORITY[a.type as PlayOptionType] ?? 99;
          const pb = TYPE_PRIORITY[b.type as PlayOptionType] ?? 99;
          return pa - pb;
        })[0];
      if (!best) throw new PlayError('no_playable_option', `no playable option for source item: ${si.id}`);
      optionRow = best;
    }

    const trigger: Trigger = req.trigger ?? 'manual';

    const play = this.db
      .insert(playHistory)
      .values({
        id: randomUUID(),
        songWorkId: rec.songWorkId,
        source: si.source,
        sourceItemId: si.id,
        trigger,
        outcome: 'still_playing',
      })
      .returning()
      .get();

    const option: RankedPlayOption = {
      rank: 0,
      sourceItem: si,
      option: {
        type: optionRow.type as PlayOptionType,
        payload: optionRow.payload,
        expiresAt: optionRow.expiresAt,
      },
      playableOptionId: optionRow.id,
      source: si.source as SourceId,
    };

    return { playId: play!.id, option };
  }

  endPlay(playId: string, req: EndPlayRequest): { ok: true } {
    const existing = this.db
      .select()
      .from(playHistory)
      .where(eq(playHistory.id, playId))
      .limit(1)
      .get();
    if (!existing) throw new PlayError('play_not_found', `play not found: ${playId}`);

    this.db
      .update(playHistory)
      .set({
        outcome: req.outcome,
        durationPlayedSec: req.durationPlayedSec ?? null,
      })
      .where(eq(playHistory.id, playId))
      .run();

    return { ok: true };
  }

  async fallback(playId: string, _req: FallbackRequest): Promise<FallbackResult> {
    const prev = this.db
      .select()
      .from(playHistory)
      .where(eq(playHistory.id, playId))
      .limit(1)
      .get();
    if (!prev) throw new PlayError('play_not_found', `play not found: ${playId}`);
    if (!prev.sourceItemId) throw new PlayError('no_source_item', 'previous play has no source item');

    // mark the old play as failed
    this.db
      .update(playHistory)
      .set({ outcome: 'failed' })
      .where(eq(playHistory.id, playId))
      .run();

    // resolve all options for the same song work
    const resolved = await this.resolvePlay({ songWorkId: prev.songWorkId });
    if (resolved.options.length === 0) {
      throw new PlayError('no_fallback', `no alternative play options for song work: ${prev.songWorkId}`);
    }

    // pick the next option that's NOT the one that just failed
    const next = resolved.options.find((o) => o.sourceItem.id !== prev.sourceItemId);
    if (!next) {
      // only one option and it failed — re-use it (caller can decide to stop)
      throw new PlayError('no_alternative', 'only one source item available, no fallback possible');
    }

    // create new play_history with trigger='fallback'
    const play = this.db
      .insert(playHistory)
      .values({
        id: randomUUID(),
        songWorkId: prev.songWorkId,
        source: next.source,
        sourceItemId: next.sourceItem.id,
        trigger: 'fallback',
        outcome: 'still_playing',
        fallbackFromId: prev.sourceItemId,
      })
      .returning()
      .get();

    return {
      playId: play!.id,
      option: { ...next, rank: 0 },
      fallbackFromId: prev.sourceItemId!,
    };
  }

  // --- internals -------------------------------------------------------------

  private findSourceItems(req: ResolvePlayRequest): SourceItemRow[] {
    if (req.sourceItemId) {
      const si = this.db
        .select()
        .from(sourceItems)
        .where(and(eq(sourceItems.id, req.sourceItemId), isNull(sourceItems.deletedAt)))
        .limit(1)
        .get();
      return si ? [si] : [];
    }

    if (req.recordingId) {
      return this.db
        .select()
        .from(sourceItems)
        .where(and(eq(sourceItems.recordingId, req.recordingId), isNull(sourceItems.deletedAt)))
        .all();
    }

    if (req.songWorkId) {
      return this.db
        .select({ si: sourceItems })
        .from(sourceItems)
        .innerJoin(recordings, eq(sourceItems.recordingId, recordings.id))
        .where(and(eq(recordings.songWorkId, req.songWorkId), isNull(sourceItems.deletedAt)))
        .all()
        .map((r) => r.si);
    }

    return [];
  }
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function rankOptions(
  options: Array<{ sourceItem: SourceItemRow; option: PlayOption; playableOptionId: string }>,
  preferredSource?: SourceId,
): RankedPlayOption[] {
  const sorted = [...options].sort((a, b) => {
    // preferred source bumps to top
    if (preferredSource) {
      const aPref = a.sourceItem.source === preferredSource;
      const bPref = b.sourceItem.source === preferredSource;
      if (aPref && !bPref) return -1;
      if (!aPref && bPref) return 1;
    }
    // by type (local < stream < embed)
    return TYPE_PRIORITY[a.option.type] - TYPE_PRIORITY[b.option.type];
  });

  return sorted.map((opt, i) => ({
    rank: i,
    sourceItem: opt.sourceItem,
    option: opt.option,
    playableOptionId: opt.playableOptionId,
    source: opt.sourceItem.source as SourceId,
  }));
}

/** Thrown for client-facing errors (400). The route handler catches and maps. */
export class PlayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlayError';
  }
}
