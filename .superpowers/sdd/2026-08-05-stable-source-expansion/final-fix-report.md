# Stable source expansion final fix report

Date: 2026-08-05
Base: `5f4ad4d3ede44f7a963ef76753521e32d77b01fc`
Requested commit: `fix: harden stable source expansion`

## Scope completed

- I1: Stream preflight now requires credential-free HTTPS, validates and pins public DNS addresses for the actual Undici connection, handles redirects manually with a fixed limit, rejects unsafe redirect targets, accepts only bounded audio responses, validates `Content-Length`/`Content-Range`, narrowly permits octet-stream for ranged known-audio extensions, cancels response bodies, and returns structured failures.
- I2: The verifier cache is source+URL qualified, capped at 1,000 LRU entries, TTL-pruned, and shared with in-flight coalescing plus an application-level eight-probe semaphore.
- I3: Runtime `markUnavailable` emits an invalidation event; the mounted cached search service clears cached searches before they can re-emit the failed item. The integration regression preserves alternate-source results.
- I4: Preflight reason/message/retry time flow through unified-search `errors[]`, registry stats, API types, SearchPage, and SourcesPage. Openverse and Wikimedia classify 429 as `rate_limited`, parse `Retry-After`, and suppress requests during the indicated cooldown.
- I5: The web store models the five default sources as an explicit enabled set. Each button independently removes/adds one source, filter changes clear stale results, stale in-flight responses are ignored by query+source signature, and empty/all cache and route semantics are distinct.
- I6: Every Wikimedia API request sends descriptive `User-Agent` and `Api-User-Agent` headers identifying OmniTunes 0.1.0 and the project URL.
- M1: Attribution labels use a bounded truncating width with the complete license retained as the accessible name/title, so mobile action controls keep their space.

## TDD RED evidence

Production code was not changed until the initial regression wave had been observed failing.

- `pnpm vitest run test/unit/playability.test.ts test/unit/search-ranking.test.ts test/unit/registry.test.ts test/unit/openverse.test.ts test/unit/wikimedia.test.ts test/unit/cache-keys.test.ts`
  - Exit 1; 27 intended failures covering unsafe targets/redirects, media/range/body rejection, structured outcomes, cache bounds/qualification/dedup/concurrency, runtime search-cache invalidation, source retry stats, 429 handling, Commons UA, and empty/all cache identity.
- `pnpm --filter omnitunes-web test -- SearchPage SourceAttribution SourcesPage`
  - Exit 1; 3 intended failures covering stale result identity, preflight reason/retry presentation, and bounded attribution layout.
- `pnpm --filter omnitunes-web test -- SearchPage`
  - Exit 1; 2 intended failures proving the store still used the implicit all-sources sentinel and retained old results after a filter change.
- Self-review correction: `pnpm vitest run test/unit/wikimedia.test.ts`
  - Exit 1; the exact descriptive User-Agent test caught a placeholder repository URL.
- Connection-pinning correction: `pnpm vitest run test/unit/playability.test.ts -t "accepts a bounded"`
  - Exit 1; the request did not yet carry the pinned public-address dispatcher.

## GREEN and verification evidence

- Focused backend: same six-file Vitest command -> 6 files passed, 82/82 tests passed.
- Focused web: `pnpm --filter omnitunes-web test -- SearchPage SourceAttribution SourcesPage` -> 3 files passed, 15/15 tests passed.
- Exact Wikimedia identification: `pnpm vitest run test/unit/wikimedia.test.ts` -> 1 file passed, 10/10 tests passed.
- Pinned transport regression plus backend typecheck: `pnpm typecheck` and `pnpm vitest run test/unit/playability.test.ts -t "accepts a bounded"` -> exit 0; selected regression passed.
- Full backend: `pnpm test` -> 13 files passed, 186/186 tests passed.
- Full web: `pnpm --filter omnitunes-web test` -> 11 files passed, 27/27 tests passed.
- Backend typecheck/build: `pnpm typecheck` and `pnpm build` -> exit 0.
- Web typecheck/build: `pnpm typecheck:web` and `pnpm build:web` -> exit 0; Vite transformed 1,624 modules and completed the production build.
- `git diff --check` -> exit 0 before report creation.

## Delivery boundary and remaining verification

- No forbidden source, credential, proxy/extraction/download/transcode, desktop packaging, release, or push work was introduced.
- No manual 1440px/390px browser visual-QA session was run in this fix wave; mobile attribution behavior is covered by the component regression and Tailwind layout contract.
- The controller owns the required scoped re-review of the committed diff; the implementer's internal reviewer was interrupted as directed and is not treated as approval evidence.
