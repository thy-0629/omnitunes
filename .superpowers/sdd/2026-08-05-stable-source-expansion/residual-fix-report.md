# Stable source expansion residual fix report

Date: 2026-08-05

Scope: only the two Important findings in `final-fix-review.md` (I3 and I4), their regression coverage, and this report.

## I3 — in-flight search repopulates a cache after runtime invalidation

### Root cause

`CachedUnifiedSearchService.search()` checked the cache, awaited `inner.search()`, and then populated the cache unconditionally. The unavailable-event listener cleared entries that already existed, but it did not invalidate work that had passed the initial cache miss and was still awaiting the inner search. If `markUnavailable()` fired before that continuation wrote its result, the stale result repopulated the just-cleared cache.

### RED

Added `does not cache an in-flight search result invalidated before its cache write` in `test/unit/playability.test.ts`.

The test starts a deferred inner search, resolves it with a stale result, emits `markUnavailable()` before the wrapper continuation can populate the cache, then performs the same lookup again. The expected behavior is a second inner search returning a fresh result.

Command:

```text
pnpm vitest run test/unit/playability.test.ts
```

Observed before the production fix:

- The new lookup returned the stale cached result with `searchedAt: 1` and cache-hit `latencyMs: 0` instead of the fresh result with `searchedAt: 2`.
- The focused file reported 21 passing and 2 failing tests; this was one of the two expected failures.

### GREEN

Added an invalidation generation to `CachedUnifiedSearchService`. Every `clear()` increments the generation before clearing the cache. A search captures the generation before awaiting the inner service and writes its result only if that generation is still current. The unavailable listener uses the same `clear()` path, so an already-running stale fill cannot undo runtime invalidation.

## I4 — structured playback preflight failures counted twice

### Root cause

`PlaybackOrchestrator.resolveSourceItems()` recorded a structured verifier failure, threw that failure inside the same `try`, then caught its own deliberate throw and recorded another failure. Thus one successful playback preflight followed by one failed preflight produced one success across three recorded calls (`1/3`) instead of one success across two attempts (`1/2`).

### RED

Added `records one playability outcome for each successful or failed playback preflight` in `test/unit/playability.test.ts`.

The test resolves one valid stream and then one stream whose preflight returns HTTP 503, verifies that the second result retains the structured `http_status` error, and asserts a playability success rate of `0.5`.

Command:

```text
pnpm vitest run test/unit/playability.test.ts
```

Observed before the production fix:

- The reported rate was `0.3333333333333333` instead of `0.5`.
- The focused file reported 21 passing and 2 failing tests; this was the other expected failure.

### GREEN

Narrowed the `try/catch` to the adapter call and verifier execution. Unexpected adapter/verifier exceptions are still recorded once in the catch path. The structured verifier outcome is recorded after that catch boundary, and its deliberate throw is no longer caught by the same block. Each verification attempt therefore contributes exactly one playability outcome while preserving the structured failure in the resolve result.

## Verification

Focused GREEN:

```text
pnpm vitest run test/unit/playability.test.ts
23 passed (23)
```

Full backend:

```text
pnpm test
13 test files passed; 188 tests passed

pnpm typecheck
exit 0

pnpm build
exit 0
```

Full web:

```text
pnpm --dir web test
11 test files passed; 27 tests passed

pnpm typecheck:web
exit 0

pnpm build:web
1624 modules transformed; production build completed
```

Diff hygiene:

```text
git diff --check
exit 0
```

Changed implementation/test files are limited to:

- `src/modules/cache/layers.ts`
- `src/modules/playback/orchestrator.ts`
- `test/unit/playability.test.ts`
- this report

## Concerns

None identified within the authorized scope. No sources, keys, proxies, release artifacts, pushes, or unrelated areas were changed.
