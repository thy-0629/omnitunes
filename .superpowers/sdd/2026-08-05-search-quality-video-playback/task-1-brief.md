### Task 1: Persist quality signals and rank grouped results

**Files:**
- Modify: `src/modules/sources/types.ts:37-47`, `src/db/schema.ts:82-105`, `src/modules/search/normalizer.ts:159-201`, `src/modules/search/service.ts:1-191`, `src/modules/sources/adapters/bilibili.ts:280-318`, `test/unit/bilibili.test.ts:42-65`
- Create: generated `drizzle/0001_*.sql`, generated `drizzle/meta/*`, `test/unit/search-ranking.test.ts`

**Interfaces:** Produce `SourceQualityMetadata` and exported `scoreGroup(group, query, queryClean): number`.

1. Write failing tests proving Bilibili metadata includes `{ playCount: 999999, interactionCount: 1234 }` and an exact song/artist group outranks a popular noise group.
2. Run `pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts`; tests must fail for the missing behavior.
3. Add `SourceQualityMetadata { playCount?, interactionCount?, isOfficialPublisher? }`. `RawHit.metadata` becomes `Record<string, unknown> & { quality?: SourceQualityMetadata }`. Add nullable JSON `qualityMetadata` on `sourceItems`; `Normalizer.upsertSourceItem` sets it on update/insert using a helper that preserves only finite non-negative numbers and booleans, otherwise returns null. Run `pnpm db:generate` and retain its generated migration/meta assets.
4. Export `scoreGroup`. Keep exact song title score above every possible quality bonus. Add artist bonuses only for meaningful query tokens matching `songWork.artists`; keep noise penalties ahead of source-quality bonus. A source's popularity bonus is capped and log-scaled: `Math.min(12, Math.log10(Math.max(0, playCount ?? 0) + 1) * 2 + Math.log10(Math.max(0, interactionCount ?? 0) + 1))`. Use the group best-source quality, capped 20. Bilibili maps `raw.play` and `raw.video_review` to `metadata.quality`.
5. Run focused tests plus `pnpm typecheck`; then commit all Task 1 files with `feat: rank music search results by source quality`.

Global constraints: do not alter third-party playback/extraction behavior. Ranking remains text-first and changes ordering only; it does not filter playable results.

## Follow-up interpretation: title/artist ambiguity

- A whitespace-only query is an exact whole-title search. For example,
  `Song Artist` ranks a work titled `Song Artist` above a split `Song` /
  `Artist` metadata match.
- A title-plus-artist priority tier applies only to explicitly separated
  clauses: `Song - Artist`, `Song — Artist`, or `Song by Artist`.
- Explicit artist matching uses normalized whole-artist equality or a
  token-boundary match. Substrings do not qualify; `Song` does not match
  `The Songwriter`.
