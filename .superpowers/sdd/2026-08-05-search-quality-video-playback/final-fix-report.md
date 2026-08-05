# Final review fix report — search quality and embed guidance

## Status

Implemented the final review fixes on `main` without packaging, publishing, or
changing the existing untracked implementation plan.

## What changed

- Added one shared explicit title/artist query parser. Bilibili filtering now
  uses the intended title for `title - artist` and `title by artist` searches,
  while ranking also recognizes a no-space em dash (`title—artist`). Plain
  whitespace remains authoritative as a whole-title query.
- Preserved Bilibili's simple substring filter and 45-second to 15-minute
  duration limits.
- Stopped mapping a Bilibili uploader to song `artists`. Unreliably parsed
  records retain their cleaned raw title, use `未知艺术家`, and expose the
  uploader only through `publisher`; parsed `artist - title` records retain
  their extracted artist and title.
- Added `反应` and `教程` to Chinese title-noise ranking penalties.
- Added visible embed guidance explaining that browsers/providers may block
  unmuted autoplay and that the user can press play inside the video. The
  existing truthful manual-next/no-end-event message remains in PlayerBar.
- Added tooltip titles and `aria-pressed` feedback to the EmbedPlayer toggle
  and both duplicate PlayerBar show-video controls.
- Added backend, component, and UI regressions for these behaviors.

## Files

- `src/modules/search/query.ts`
- `src/modules/search/service.ts`
- `src/modules/sources/adapters/bilibili.ts`
- `test/unit/bilibili.test.ts`
- `test/unit/search-ranking.test.ts`
- `web/src/components/player/EmbedPlayer.tsx`
- `web/src/components/player/EmbedPlayer.test.tsx`
- `web/src/components/player/PlayerBar.tsx`
- `web/src/components/player/PlayerBar.test.tsx`
- `web/src/pages/SearchPage.test.tsx`
- `.superpowers/sdd/2026-08-05-search-quality-video-playback/final-fix-report.md`

## TDD evidence

### RED — backend

Command:

```text
pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts
```

Exit 1. The focused run reported 6 expected failures:

```text
explicit 晴天 - 周杰伦 / 晴天 by 周杰伦 → expected [] to have length 1
Song—Artist ranking → expected 45 to be greater than 241
反应 / 教程 noise ranking → expected 135 to be greater than 135
unknown artist → expected 未知艺术家, received 某UP主
```

The parse-level contract was then tightened before implementation and rerun:

```text
pnpm vitest run test/unit/bilibili.test.ts
```

Exit 1 with 4 expected failures, including `parseSearchResults` expecting
`未知艺术家` while receiving the uploader.

### RED — web

Command:

```text
pnpm --filter omnitunes-web test -- EmbedPlayer PlayerBar SearchPage
```

Exit 1. Expected behavior failures were observed for missing autoplay-block
guidance and missing `title="显示视频画面"` on both PlayerBar show controls. The
SearchPage regression initially exposed a test-mock reset error; the mock was
reinitialized and its UI-only regression then passed independently before
production changes.

### GREEN — focused

Commands:

```text
pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts
pnpm --filter omnitunes-web test -- EmbedPlayer PlayerBar SearchPage
pnpm --filter omnitunes-web test -- PlayerBar
```

Exit 0:

```text
Backend: 2 files, 26 tests passed
Web:     3 files, 5 tests passed
PlayerBar refactor check: 1 file, 2 tests passed with no router warnings
```

## Full verification

All commands exited 0:

```text
pnpm test
  9 files, 130 tests passed

pnpm --filter omnitunes-web test
  8 files, 13 tests passed

pnpm typecheck
  tsc --noEmit

pnpm typecheck:web
  tsc -b --noEmit

pnpm build
  tsc -p tsconfig.build.json

pnpm build:web
  1622 modules transformed; production build completed

git diff --check
  no whitespace errors
```

An independent read-only reviewer reported no Critical, Important, or Minor
findings and approved the wave, with the reminder to include both new files in
the commit.

## Concerns and limits

- Cross-origin embeds do not expose a reliable autoplay-refusal or end event,
  so the guidance is always visible and queue advancement remains manual for
  embeds. No duration timer was added.
- `未知艺术家` is intentionally a neutral non-empty value because the persisted
  song-work artist column is non-null and the UI renders an artist label.
- Packaging/release commands were deliberately not run.
