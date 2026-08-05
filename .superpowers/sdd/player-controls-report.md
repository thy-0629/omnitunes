# PlayerBar control fixes

## Scope

- `web/src/components/player/PlayerBar.tsx`
- `web/src/components/player/PlayerBar.test.tsx`

## TDD record

### Red

Added PlayerBar tests for:

- stream pause toggling the player store;
- embed playback having no pause button and clearly directing the listener to the visible video player;
- disabled shuffle, previous, and repeat labels explicitly stating that the capability is unavailable;
- out-of-order collection reads preserving the current song's favorite state;
- disabling repeat favorite mutations while a request is pending;
- 409 and 404 mutation outcomes refreshing the authoritative collection state.

Ran:

```text
pnpm --filter omnitunes-web test src/components/player/PlayerBar.test.tsx
```

Result: failed as expected (6 failing tests). The failures showed the existing disabled embed pause button, old unsupported-control names, and unprotected favorite read/mutation behavior.

### Green

Implemented a monotonically increasing favorite-read generation and current-song check, immediate favorite reset on song changes, pending mutation disabling, and 404/409 reconciliation through a fresh collection read. Other favorite failures now show a small `role="status"` message.

Embed playback now shows a non-interactive instruction instead of a pause-shaped control; stream/local playback retains its normal store pause toggle. The existing show-video controls remain unchanged. Unsupported expanded controls remain disabled and their accessible names/titles now include `暂不支持`.

Ran:

```text
pnpm --filter omnitunes-web test src/components/player/PlayerBar.test.tsx
```

Result: 1 file passed, 9 tests passed. Vitest still emits the pre-existing React Router v7 future-flag warnings.

## Verification

```text
pnpm --filter omnitunes-web typecheck
```

Result: passed.

```text
pnpm --filter omnitunes-web build
```

Result: passed (`tsc -b && vite build`; 1624 modules transformed).

```text
git diff --check
```

Result: passed.

## Decisions

- No third-party embed control API was added or implied. The UI points listeners to the actual visible video player.
- Collection 404/409 responses are treated as a state divergence and reconciled by rereading collections; other failures preserve an actionable accessible feedback message.
- Shuffle, previous, and repeat retain their existing disabled behavior; no playback feature scope was expanded.

## Commit

`18ae396 fix(player): clarify controls and favorite state`

## Follow-up race repair

### Red

Added regression coverage for a successful add followed by a stale pre-mutation collection read, and for a delayed conflict from song A arriving after the player switches to song B while B's favorite read is still pending. The focused test command failed with both regressions as expected: the stale read reset the successful add, and A's reconciliation invalidated B's read. Added local-playback pause coverage and generic failed-favorite status coverage as well.

### Green

Successful favorite mutations now advance the collection-read generation before committing their state, invalidating any read started before the mutation. 404/409 reconciliation only begins while the mutation's song is still active, so a former song cannot invalidate the active song's read.

Verification:

```text
pnpm --filter omnitunes-web test src/components/player/PlayerBar.test.tsx
```

Result: 1 file passed, 13 tests passed (the existing React Router v7 future-flag warnings remain).

```text
pnpm --filter omnitunes-web typecheck
pnpm --filter omnitunes-web build
```

Result: both passed; build transformed 1624 modules.

Follow-up code commit: `b68cdaf fix(player): guard favorite state races`.
