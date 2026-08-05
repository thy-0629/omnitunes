# Final search-resilience fix report

## Findings

- Search preflight intentionally checks only the first eight hits, but the search result fallback labeled every hit with no recorded outcome as `unavailable`. This falsely represented ninth-and-later hits, and a hit whose option lookup returned no options and no failure, as known failures.
- Source-level preflight warnings were deduplicated by `(source, code, message)`, allowing several warning rows for one source when individual hits failed differently.
- `SearchPage` rendered the preflight reason and a later runtime playback reason together for the same source row.

## Changes

- Added the truthful search-only `unknown` playability state in the backend and web API mirror. Unpreflighted and inconclusive rows now receive `unknown`; known verification failures retain `unavailable` and their detailed reason.
- Aggregated top-level preflight warnings by source while retaining each source row's exact failure code/message/retry state.
- Made a runtime click-play failure replace that row's preflight message in `SearchPage`.
- Added regression coverage for eight-hit preflight bounds, inconclusive option results, differing same-source failures, and UI reason replacement.

## TDD evidence

The new backend regressions were run before the implementation and failed as expected: the service returned `unavailable` for unpreflighted/inconclusive hits and emitted two source warnings for distinct failures. The UI regression was added before its conditional rendering change. All are now green.

## Verification

| Command | Result |
| --- | --- |
| `pnpm vitest run test/unit/search-playability.test.ts test/unit/search-ranking.test.ts` | Passed: 2 files, 20 tests |
| `pnpm --filter omnitunes-web test -- SearchPage.test.tsx` | Passed: 1 file, 17 tests |
| `pnpm typecheck` | Passed |
| `pnpm --filter omnitunes-web typecheck` | Passed |
| `pnpm build` | Passed |
| `pnpm --filter omnitunes-web build` | Passed |
| `git diff --check` | Passed |

## Scope and concerns

This change does not alter adapter media restrictions or playback resolution. The `unknown` state is deliberately informational: it does not disable a source row or claim that its media is available. Verification was targeted to the affected backend and web suites rather than the entire repository test suite.
