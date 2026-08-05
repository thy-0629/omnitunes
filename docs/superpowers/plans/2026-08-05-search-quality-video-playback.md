# Search Quality and Video Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make high-quality, well-matched music results appear first; display song/artist/publisher; make embedded video playback start from one click and be hideable while audio continues.

**Architecture:** Extend source hits with validated quality metadata, persist it as nullable JSON on `SourceItem`, and compute a text-first relevance score per grouped song. Add independent `videoVisible` state to the existing Zustand player; the embed iframe remains mounted while visually hidden.

**Tech Stack:** TypeScript, Fastify, Drizzle SQLite, Vitest, React, Zustand, Tailwind, Testing Library.

## Global Constraints

- Keep official Bilibili/YouTube embeds; never extract/download/bypass third-party media.
- Do not infer an embed end from duration; only native `<audio>` `ended` can auto-advance the queue.
- Direct play does not enqueue; auto-advance consumes only the existing queue.
- Source rows show `歌曲名 · 歌手` then small `发布者 · 来源 · 时长`; publisher never replaces artist.
- Embeds default to visible; hide means no unmount and no playback interruption.

---

### Task 1: Persist quality signals and rank grouped results

**Files:**
- Modify: `src/modules/sources/types.ts:37-47`, `src/db/schema.ts:82-105`, `src/modules/search/normalizer.ts:159-201`, `src/modules/search/service.ts:1-191`, `src/modules/sources/adapters/bilibili.ts:280-318`, `test/unit/bilibili.test.ts:42-65`
- Create: `drizzle/0001_*.sql`, generated `drizzle/meta/*`, `test/unit/search-ranking.test.ts`

**Interfaces:**
- Produces `SourceQualityMetadata` and exported `scoreGroup(group, query, queryClean): number`.

- [ ] **Step 1: Write failing quality tests**

```ts
it('preserves Bilibili counts', () => {
  expect(parseSearchResults(SEARCH_RESPONSE)[0]?.metadata?.quality).toEqual({
    playCount: 999999, interactionCount: 1234,
  });
});
it('keeps exact music above popular noise', () => {
  expect(scoreGroup(exactMusic, '晴天 周杰伦', '晴天 周杰伦'))
    .toBeGreaterThan(scoreGroup(popularVlog, '晴天 周杰伦', '晴天 周杰伦'));
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts`

Expected: FAIL because neither quality metadata nor exported `scoreGroup` exists.

- [ ] **Step 3: Add contract, persistence, and migration**

```ts
export interface SourceQualityMetadata {
  playCount?: number;
  interactionCount?: number;
  isOfficialPublisher?: boolean;
}
// RawHit metadata becomes Record<string, unknown> & { quality?: SourceQualityMetadata }
qualityMetadata: text('quality_metadata', { mode: 'json' }).$type<SourceQualityMetadata | null>(),
```

`Normalizer.upsertSourceItem` calls `readQualityMetadata(hit.metadata)` on insert and update. The helper only keeps finite non-negative numbers and booleans, otherwise returns `null`. Run `pnpm db:generate` and retain generated SQL/snapshot/journal.

- [ ] **Step 4: Implement rank calculation and Bilibili mapping**

```ts
function popularityBonus(playCount?: number, interactionCount?: number): number {
  return Math.min(12, Math.log10(Math.max(0, playCount ?? 0) + 1) * 2
    + Math.log10(Math.max(0, interactionCount ?? 0) + 1));
}
```

Tokenize the query and give an artist bonus only to meaningful tokens present in `songWork.artists`. Apply noise penalty before a capped best-source quality bonus of 20. Keep exact-title score greater than every possible quality bonus. Map `raw.play` and `raw.video_review` to `metadata.quality` in `parseSearchResults`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run test/unit/bilibili.test.ts test/unit/search-ranking.test.ts && pnpm typecheck`

Expected: pass.

Run: `git add src/modules/sources/types.ts src/db/schema.ts src/modules/search/normalizer.ts src/modules/search/service.ts src/modules/sources/adapters/bilibili.ts drizzle test/unit/bilibili.test.ts test/unit/search-ranking.test.ts; git commit -m "feat: rank music search results by source quality"`

### Task 2: Add embedded autoplay and independent video visibility

**Files:**
- Modify: `web/src/lib/embed.ts:1-20`, `web/src/stores/player.ts:10-220`, `web/src/components/player/EmbedPlayer.tsx:1-45`, `web/src/components/player/PlayerBar.tsx:1-290`
- Create: `web/src/lib/embed.test.ts`, `web/src/stores/player.test.ts`, `web/src/components/player/EmbedPlayer.test.tsx`

**Interfaces:**
- Produces `videoVisible: boolean`, `hideVideo(): void`, and `showVideo(): void` in `PlayerState`.

- [ ] **Step 1: Write failing URL, state, and UI tests**

```tsx
expect(buildEmbedUrl('bilibili', 'BV1xx411c7mD')).toContain('autoplay=1');
usePlayerStore.setState({ videoVisible: false });
await usePlayerStore.getState().playSourceItem('source-2', songWork);
expect(usePlayerStore.getState().videoVisible).toBe(true);
render(<EmbedPlayer />);
expect(screen.getByTitle('embedded player')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '显示视频' })).toBeInTheDocument();
```

- [ ] **Step 2: Confirm the tests fail**

Run: `pnpm --filter omnitunes-web test -- embed player`

Expected: FAIL because autoplay, player visibility state, and controls do not exist.

- [ ] **Step 3: Implement URL and state behavior**

```ts
case 'bilibili': return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(payload)}&autoplay=1&muted=0`;
case 'youtube': return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(payload)}?autoplay=1`;
```

Initialize/reset `videoVisible` as `true`; implement `hideVideo`/`showVideo`. Successful `playSourceItem`, `playSongWork`, `playQueueItem`, `playNextFromQueue`, and `tryFallback` set it to true when their new option is `embed`. Do not modify `AudioPlayer.onEnded`.

- [ ] **Step 4: Keep the iframe mounted and expose controls**

```tsx
<iframe allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
  sandbox="allow-scripts allow-same-origin allow-presentation" />
```

When hidden, retain this iframe inside a `hidden` wrapper and render `显示视频` outside it; when visible render `隐藏视频`. Use `aria-pressed={!videoVisible}`. PlayerBar shows the same manual-next fallback copy for embeds without end events; its current Next button remains usable.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter omnitunes-web test && pnpm typecheck:web && pnpm build:web`

Expected: pass.

Run: `git add web/src/lib/embed.ts web/src/lib/embed.test.ts web/src/stores/player.ts web/src/stores/player.test.ts web/src/components/player/EmbedPlayer.tsx web/src/components/player/EmbedPlayer.test.tsx web/src/components/player/PlayerBar.tsx; git commit -m "feat: improve embedded video playback controls"`

### Task 3: Render song, artist, and publisher in source rows

**Files:**
- Modify: `web/src/lib/api/types.ts:29-38`, `web/src/pages/SearchPage.tsx:1-276`
- Create: `web/src/pages/SearchPage.test.tsx`

**Interfaces:**
- Consumes grouped search data and `SourceItem.qualityMetadata`.
- Produces source rows separating song identity from uploader identity.

- [ ] **Step 1: Write a failing UI test**

```tsx
mockSearchResult({ songWork: { id: 'song-1', title: '晴天', artists: '周杰伦' },
  sourceItem: { id: 'source-1', publisher: '杰威尔音乐', source: 'bilibili' }, durationSec: 269 });
render(<SearchPage />);
expect(await screen.findByText('晴天 · 周杰伦')).toBeVisible();
expect(screen.getByText(/杰威尔音乐.*B站.*4:29/)).toHaveClass('text-xs');
```

- [ ] **Step 2: Confirm the test fails**

Run: `pnpm --filter omnitunes-web test -- SearchPage`

Expected: FAIL because source rows only show publisher/external ID.

- [ ] **Step 3: Mirror the API and change the row markup**

Add nullable `qualityMetadata` to frontend `SourceItem`. Each source-row play button gets:

```tsx
<span className="truncate text-sm font-medium text-foreground">{group.songWork.title} · {group.songWork.artists}</span>
<span className="truncate text-xs text-muted-foreground">
  {[si.publisher, sourceLabel(si.source), durationText].filter(Boolean).join(' · ')}
</span>
```

Keep source badges, favorite, play-best, add-to-queue and add-next. Do not show `externalId` as a visible fallback.

- [ ] **Step 4: Verify, visually QA, and commit**

Run: `pnpm --filter omnitunes-web test && pnpm typecheck:web && pnpm build:web`

Expected: pass.

At 1440px and 390px, verify text hierarchy, non-overlapping controls, video hide/show, and native audio `ended` advancing a queued next item. Run: `git add web/src/lib/api/types.ts web/src/pages/SearchPage.tsx web/src/pages/SearchPage.test.tsx; git commit -m "feat: clarify song search result metadata"`

### Task 4: Final verification and delivery

**Files:**
- Modify: `docs/superpowers/plans/2026-08-05-search-quality-video-playback.md` only to mark completed tasks if project convention permits it.

- [ ] **Step 1: Run full automation**

Run: `pnpm test && pnpm --filter omnitunes-web test && pnpm typecheck && pnpm typecheck:web && pnpm build && pnpm build:web`

Expected: every command exits 0.

- [ ] **Step 2: Use independent review and inspect final state**

Give a fresh reviewer this spec, plan, changed files, tests, and manual QA observations; fix actionable findings. Then run `git diff main~3..HEAD --check` and `git status --short`.

Expected: no whitespace errors or unintended files.

- [ ] **Step 3: Deliver source changes only**

Report the embed-end limitation and test evidence. Do not run `pnpm dist:electron`, update a desktop shortcut, or publish GitHub Release assets: the user deferred packaging/release work.

## Plan self-review

**Spec coverage:** Task 1 covers quality, artist matching, noise, and Bilibili signals. Task 2 covers one-click embed attempts, policy-aware manual fallback, hide/show, and native queue handoff. Task 3 covers the required text hierarchy and responsive layout. Task 4 covers full tests, separate review, and deferred releases.

**Placeholder scan:** No TBD/TODO or unspecified test remains.

**Type consistency:** `SourceQualityMetadata` flows through `RawHit`, `sourceItems.qualityMetadata`, and frontend `SourceItem.qualityMetadata`; only `videoVisible`, `hideVideo`, and `showVideo` are added to player visibility state.
