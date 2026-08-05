# Task 1 report — Persist quality signals and rank grouped results

## Status

Implemented the backend quality-metadata/search-ranking slice on `main`. The
pre-existing untracked plan file at
`docs/superpowers/plans/2026-08-05-search-quality-video-playback.md` was left
unchanged and is excluded from this task's commit.

## What changed

- Added exported `SourceQualityMetadata` and nested `RawHit.metadata.quality`.
- Added nullable JSON `source_items.quality_metadata`, plus generated Drizzle
  migration `0001_medical_shiver_man.sql`, snapshot, and journal entry.
- Normalizer now sanitizes quality input (finite, non-negative counts and
  booleans only) and writes `null` on insert/update when no valid signal remains.
- Bilibili search mapping now places `play` and `video_review` in
  `metadata.quality` as `playCount` and `interactionCount`.
- Exported `scoreGroup`; ranking now gives exact titles a text-first tier,
  adds meaningful artist-token matches, applies noise penalties before source
  quality, and uses the best source's capped log-scaled popularity bonus.
- Added regression coverage for Bilibili quality mapping and exact-song versus
  highly popular noise ranking, including an artist-qualified near-match case
  identified during independent review.

## TDD evidence

### RED

Command:

```text
pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts
```

Exit 1. Expected failures were observed:

```text
scoreGroup > ranks an exact song and artist group above a popular noisy result
→ (0 , scoreGroup) is not a function

parseSearchResults > maps result items to RawHits
→ expected metadata to contain quality: { playCount: 999999, interactionCount: 1234 }

Test Files  2 failed (2)
Tests       2 failed | 13 passed (15)
```

Independent review then added a second RED regression for an artist-qualified
query: the same command exited 1 with `expected 57 to be greater than 61` for
the correct song versus a popular official near-match. The strengthened
two-source regression also exited 1 with `expected 69 to be greater than 71`.

### GREEN

Command (fresh final run):

```text
git diff --check
pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts
pnpm typecheck
```

Exit 0. Focused test output:

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

`pnpm typecheck` completed successfully (`tsc --noEmit`).

## Files

- `src/modules/sources/types.ts`
- `src/db/schema.ts`
- `src/modules/search/normalizer.ts`
- `src/modules/search/service.ts`
- `src/modules/sources/adapters/bilibili.ts`
- `test/unit/bilibili.test.ts`
- `test/unit/search-ranking.test.ts`
- `drizzle/0001_medical_shiver_man.sql`
- `drizzle/meta/0001_snapshot.json`
- `drizzle/meta/_journal.json`

## Self-review

- Checked the generated SQL: it adds only nullable `quality_metadata text` to
  `source_items`.
- Confirmed existing raw metadata remains supported through the intersection
  type, including `url`, fingerprints, Bilibili identifiers, and arbitrary
  adapter fields.
- Confirmed quality cannot exceed 20 per group, selection uses the best single
  source, and invalid/missing input clears stale stored quality on refresh.
- Confirmed no playback or extraction paths changed.
- Independent review found an artist-qualified near-match could initially
  outrank the correct song (57 vs. 61), and then reproduced the same issue
  with its two-source bonus (69 vs. 71). Added failing regressions and a
  text-first exact-title-plus-artist tier before rerunning the focused suite.

## Concerns

No blocking concerns. The required focused tests and typecheck were run; the
full repository test suite was not part of this task's requested verification.
