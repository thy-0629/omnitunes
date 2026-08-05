# 搜索韧性与结果体验实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留多音源搜索命中并标明播放状态，修复歌手召回、双清空和结果区滚动遮挡。

**Architecture:** 后端先规范化所有检索命中，再将播放预检映射为来源项的瞬态状态；前端在来源行展示该状态及定向播放失败。应用壳固定为视口高度，使主区独立滚动并为固定播放器预留空间。

**Tech Stack:** TypeScript、Fastify、Vitest、React、Zustand、Tailwind、Testing Library。

## Global Constraints

- 不绕过第三方平台限制或下载第三方媒体。
- 预检失败不删除搜索命中；来源项仍可点击重新验证播放。
- 发布者只能作为较弱的召回信号，不能替代可靠的歌手元数据。
- 搜索仍最多返回 20 个分组；本次不增加无限加载。

---

### Task 1: 返回未预检成功的命中及其播放状态

**Files:**
- Modify: `src/modules/search/service.ts`, `src/modules/search/query.ts`, `src/modules/sources/adapters/bilibili.ts`, `test/unit/search-ranking.test.ts`, `test/unit/bilibili.test.ts`
- Create: `test/unit/search-playability.test.ts`

**Interfaces:**
- Produces `SearchPlayability = { status: 'playable' | 'unavailable'; code?: string; message?: string; retryAt?: number }`.
- Search-response `sourceItems` are `NormalizedEntry['sourceItem'] & { playability: SearchPlayability }`; the database table remains unchanged.

- [ ] **Step 1: Write the failing preflight-retention tests**

```ts
it('keeps a source item when its preflight times out', async () => {
  verifier.verify.mockResolvedValue({ options: [], failures: [timeoutFailure] });
  const result = await service.search({ query: 'artist', sources: ['open_source'] });
  const item = result.results[0]!.recordings[0]!.sourceItems[0]!;
  expect(item.playability).toMatchObject({ status: 'unavailable', code: 'timeout' });
});

it('summarizes identical preflight failures from one source once', async () => {
  const result = await service.search({ query: 'artist', sources: ['open_source'] });
  expect(result.errors).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test and confirm red**

Run: `pnpm vitest run test/unit/search-playability.test.ts`

Expected: FAIL because `UnifiedSearchService` excludes every hit whose verifier has no options.

- [ ] **Step 3: Implement discovery/preflight separation**

```ts
type SearchSourceItem = NormalizedEntry['sourceItem'] & { playability: SearchPlayability };

const verification = await verifier.verify(adapter.id, await adapter.getPlayOptions(hit.externalId));
const playability: SearchPlayability = verification.options.length > 0
  ? { status: 'playable' }
  : toUnavailablePlayability(adapter.id, verification.failures[0]);
```

Collect a `NormalizerInput` for every successful adapter search hit, not just verified hits. Normalize that complete collection, join preflight state by `(sourceId, externalId)`, then group enriched entries. Deduplicate preflight `SearchError`s by source, code, message, and retry time. Preserve adapter-level search failures and database persistence behavior.

- [ ] **Step 4: Write and run failing pure-artist recall tests**

```ts
it('ranks a reliable artist match above an unrelated title hit', () => {
  expect(scoreGroup(artistMatch, '周杰伦', canonicalTitle('周杰伦')))
    .toBeGreaterThan(scoreGroup(unrelatedTitleMatch, '周杰伦', canonicalTitle('周杰伦')));
});

it('retains a Bilibili hit whose uploader matches a pure artist query', () => {
  expect(filterSearchResults(rawHits, '周杰伦'))
    .toContainEqual(expect.objectContaining({ author: '周杰伦' }));
});
```

Run: `pnpm vitest run test/unit/search-ranking.test.ts test/unit/bilibili.test.ts`

Expected: FAIL because no separator means no artist score and Bilibili filters title-only.

- [ ] **Step 5: Add bounded artist and uploader matching**

Update Bilibili hit filtering to retain title, parsed artist, or uploader matches. In `scoreGroup`, reward pure-query matches in `songWork.artists` more strongly than publisher/uploader matches, while retaining exact title priority. Keep existing explicit `歌名 - 歌手` / `by` parsing behavior.

- [ ] **Step 6: Verify green and commit**

Run: `pnpm vitest run test/unit/search-playability.test.ts test/unit/search-ranking.test.ts test/unit/bilibili.test.ts && pnpm typecheck`

Expected: PASS.

```bash
git add src/modules/search/service.ts src/modules/search/query.ts src/modules/sources/adapters/bilibili.ts test/unit/search-playability.test.ts test/unit/search-ranking.test.ts test/unit/bilibili.test.ts
git commit -m "feat: retain unavailable source search results"
```

### Task 2: 在来源行中显示预检和点击播放失败

**Files:**
- Modify: `web/src/lib/api/types.ts`, `web/src/stores/player.ts`, `web/src/stores/player.test.ts`, `web/src/pages/SearchPage.tsx`, `web/src/pages/SearchPage.test.tsx`

**Interfaces:**
- Consumes optional `SourceItem.playability`.
- Adds `failedSourceItemId: string | null` to `PlayerState`; only `playSourceItem` writes it on a start failure.

- [ ] **Step 1: Write the failing UI and player-state tests**

```tsx
it('shows an unavailable status but keeps the source action enabled', () => {
  render(<SearchPage />);
  expect(screen.getByRole('button', { name: /Archive.*当前无法播放.*请求超时/ })).toBeEnabled();
});

it('shows the latest playback error on its originating source row', () => {
  usePlayerStore.setState({ failedSourceItemId: 'source-archive', error: 'Archive metadata request timed out' });
  render(<SearchPage />);
  expect(screen.getByText('Archive metadata request timed out')).toBeVisible();
});
```

```ts
it('records the item that failed to start', async () => {
  vi.mocked(startPlay).mockRejectedValue(new Error('network'));
  await usePlayerStore.getState().playSourceItem('source-archive', songWork);
  expect(usePlayerStore.getState()).toMatchObject({ status: 'error', failedSourceItemId: 'source-archive' });
});
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `pnpm --filter omnitunes-web vitest run src/pages/SearchPage.test.tsx src/stores/player.test.ts`

Expected: FAIL because neither the API type nor player state identifies an unavailable source item.

- [ ] **Step 3: Implement in-place availability feedback**

Mirror `SearchPlayability` into API types and make it nullable for compatibility with persisted/non-search `SourceItem`s. In `playSourceItem`, clear `failedSourceItemId` when beginning and set it in its catch branch. Subscribe to the ID and `error` in `SearchPage`; render a text status and `aria-live="polite"` failure message in the matching source row. Preserve the row's enabled play button and existing favorite/queue controls.

- [ ] **Step 4: Verify green and commit**

Run: `pnpm --filter omnitunes-web vitest run src/pages/SearchPage.test.tsx src/stores/player.test.ts && pnpm --filter omnitunes-web typecheck && pnpm --filter omnitunes-web build`

Expected: PASS.

```bash
git add web/src/lib/api/types.ts web/src/stores/player.ts web/src/stores/player.test.ts web/src/pages/SearchPage.tsx web/src/pages/SearchPage.test.tsx
git commit -m "feat: explain unavailable search sources in place"
```

### Task 3: 移除重复取消并修正滚动容器

**Files:**
- Modify: `web/src/index.css`, `web/src/pages/SearchPage.tsx`, `web/src/pages/SearchPage.test.tsx`, `web/src/components/AppShell.tsx`, `web/src/components/AppShell.test.tsx`

**Interfaces:**
- `SearchPage` exposes exactly one authored button named `清空` for a non-empty query.
- `AppShell` exposes a viewport-bounded `main` region with `min-h-0 overflow-y-auto` and 9rem player clearance.

- [ ] **Step 1: Write the failing structure tests**

```tsx
it('uses one authored clear button and a search-input class', () => {
  useSearchStore.setState({ query: '周杰伦' });
  render(<SearchPage />);
  expect(screen.getAllByRole('button', { name: '清空' })).toHaveLength(1);
  expect(screen.getByRole('searchbox')).toHaveClass('search-input');
});

it('uses an independently scrollable, viewport-bounded main area', () => {
  renderShell();
  expect(screen.getByTestId('app-shell')).toHaveClass('h-dvh', 'min-h-0');
  expect(screen.getByRole('main')).toHaveClass('min-h-0', 'overflow-y-auto', 'pb-36');
});
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `pnpm --filter omnitunes-web vitest run src/pages/SearchPage.test.tsx src/components/AppShell.test.tsx`

Expected: FAIL because native search cancellation is not targeted and the shell uses unconstrained `min-h-screen`.

- [ ] **Step 3: Implement the minimal visual-layout fix**

```css
.search-input::-webkit-search-cancel-button {
  appearance: none;
  display: none;
}
```

Add `search-input` to the existing `type="search"` input and keep the custom accessible clear button. Change the shell root from `min-h-screen` to `h-dvh min-h-0`; change `main` to `min-h-0 flex-1 overflow-y-auto pb-36`. Do not add a second scrolling wrapper or infinite-scroll behavior.

- [ ] **Step 4: Verify green and commit**

Run: `pnpm --filter omnitunes-web vitest run src/pages/SearchPage.test.tsx src/components/AppShell.test.tsx && pnpm --filter omnitunes-web typecheck && pnpm --filter omnitunes-web build`

Expected: PASS.

```bash
git add web/src/index.css web/src/pages/SearchPage.tsx web/src/pages/SearchPage.test.tsx web/src/components/AppShell.tsx web/src/components/AppShell.test.tsx
git commit -m "fix: keep search controls and results accessible"
```

### Task 4: 验证与独立审查

**Files:**
- Modify: `docs/superpowers/plans/2026-08-05-search-resilience-ux.md` only if project convention permits task completion marks.

- [ ] **Step 1: Run full automation**

Run: `pnpm test && pnpm --filter omnitunes-web test && pnpm typecheck && pnpm --filter omnitunes-web typecheck && pnpm build && pnpm --filter omnitunes-web build`

Expected: all commands exit 0.

- [ ] **Step 2: Run manual viewport checks**

At 1440px and 390px, search a commercial Chinese singer and verify one clear icon, preserved returned non-Bilibili rows, in-place unavailable status, click-play failure on only its source row, and the final result fully scrollable above the player.

- [ ] **Step 3: Independent review and final checks**

Give a fresh reviewer this plan, the design, changed files, test output, and manual observations. Fix actionable findings, rerun affected tests, then run:

```bash
git diff --check HEAD~3..HEAD
git status --short
```

Expected: no whitespace errors or unintended files.

## Plan self-review

**Spec coverage:** Task 1 handles retained discovery, availability state, error aggregation and artist recall; Task 2 handles per-card feedback; Task 3 handles clear control and scrolling; Task 4 verifies behavior independently.

**Placeholder scan:** No TODO, TBD or undefined test behavior remains.

**Type consistency:** Backend `SearchPlayability` flows to `SourceItem.playability`; `failedSourceItemId` is the same source item ID passed to `playSourceItem`.
