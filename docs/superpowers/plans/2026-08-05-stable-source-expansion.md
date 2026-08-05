# Stable Source Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyless open-audio sources and ensure only verified playable results reach search, so coverage increases without presenting dead links.

**Architecture:** A shared `PlayabilityVerifier` probes stream candidates with bounded range requests and caches success/failure; unified search uses it before persistence and playback reports stream failures back to it. Archive, Openverse, and Wikimedia adapters resolve public original audio URLs through their official APIs. Source items persist compact attribution metadata for license/source-page display.

**Tech Stack:** TypeScript, Fastify, Drizzle SQLite, Undici/fetch, Vitest, React 18, Zustand, Tailwind, Testing Library.

## Global Constraints

- Keep official Bilibili/YouTube embeds; never extract, download, proxy, transcode, or bypass third-party media.
- Do not add Douyin scraping, deep linking, simulated download, or a Douyin adapter.
- Do not require or ship an API key, token, or Jamendo test client ID.
- `open_source` remains the Archive source ID; new source IDs are exactly `openverse` and `wikimedia`.
- A stream result is displayed only after the availability verifier accepts it; Bilibili embeds are accepted only as official embed options.
- Direct play and native queue semantics remain unchanged; a stream error may mark the failed source unavailable but must not infer embedded-video completion.
- Open-license results expose creator, license, and source-page attribution; missing attribution prevents display.

---

### Task 1: Extend source contracts, persisted attribution, and source statistics

**Files:**
- Modify: `src/modules/sources/types.ts:16-80`, `src/db/schema.ts:82-105`, `src/modules/search/normalizer.ts:159-201`, `src/modules/sources/registry.ts:10-82`
- Modify: `web/src/lib/api/types.ts:7-45`
- Create: generated `drizzle/0002_*.sql` and matching `drizzle/meta/*`
- Create: `test/unit/source-metadata.test.ts`
- Modify: `test/unit/registry.test.ts:1-150`

**Interfaces:**
- Produces `SourceAttributionMetadata`, `RawHit.metadata.attribution`, `SourceItem.attributionMetadata`, and source descriptions with `playabilitySuccessRate`.

- [ ] **Step 1: Write failing persistence and statistic tests**

```ts
it('keeps only complete open-license attribution metadata', () => {
  expect(readAttributionMetadata({ attribution: {
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://example.test/file', creator: 'Artist',
  }})).toMatchObject({ license: 'CC BY 4.0', creator: 'Artist' });
});

it('reports preflight success separately from adapter calls', () => {
  registry.recordPlayability('openverse', true);
  registry.recordPlayability('openverse', false);
  expect(registry.describe()[0]?.stats.playabilitySuccessRate).toBe(0.5);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm vitest run test/unit/source-metadata.test.ts test/unit/registry.test.ts`

Expected: FAIL because attribution fields and `recordPlayability` do not exist.

- [ ] **Step 3: Add typed fields and migration**

```ts
export interface SourceAttributionMetadata {
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  creator: string;
}

metadata?: Record<string, unknown> & {
  quality?: SourceQualityMetadata;
  attribution?: SourceAttributionMetadata;
};
```

Add `attributionMetadata: text('attribution_metadata', { mode: 'json' }).$type<SourceAttributionMetadata | null>()` to `sourceItems`. In normalizer updates/inserts call `readAttributionMetadata`, accepting only non-empty HTTPS strings and a non-empty license/creator; return null otherwise. Mirror the required nullable field in the frontend `SourceItem`. Add `playabilityCalls`, `playabilitySuccesses`, `recordPlayability(id, ok)`, and a `playabilitySuccessRate` in registry stats/description. Run `pnpm db:generate` and retain generated migration, snapshot, and journal.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run test/unit/source-metadata.test.ts test/unit/registry.test.ts && pnpm typecheck && pnpm typecheck:web`

Expected: all selected tests and both typechecks pass.

- [ ] **Step 5: Commit contract/migration slice**

Run: `git add src/modules/sources/types.ts src/db/schema.ts src/modules/search/normalizer.ts src/modules/sources/registry.ts web/src/lib/api/types.ts drizzle test/unit/source-metadata.test.ts test/unit/registry.test.ts; git commit -m "feat: persist source attribution and availability stats"`

### Task 2: Verify stream candidates before search and penalize runtime failures

**Files:**
- Create: `src/modules/sources/playability.ts`
- Create: `test/unit/playability.test.ts`
- Modify: `src/modules/search/service.ts:60-146`, `src/modules/cache/plugin.ts:30-55`, `src/modules/playback/orchestrator.ts:108-195,325-374`
- Modify: `src/app.ts` or the narrow source/plugin declaration point to decorate the verifier

**Interfaces:**
- Produces `PlayabilityVerifier.verify(source, options): Promise<PlayOption[]>` and `markUnavailable(source, options): void`.

- [ ] **Step 1: Write failing verifier and search gate tests**

```ts
it('accepts a stream only after a bounded successful range response', async () => {
  const verifier = new PlayabilityVerifier({ fetchFn: range206Fetch });
  await expect(verifier.verify('open_source', [stream('https://media.test/a.mp3')]))
    .resolves.toEqual([stream('https://media.test/a.mp3')]);
});

it('drops a stream candidate that returns an HTML error page', async () => {
  const verifier = new PlayabilityVerifier({ fetchFn: html200Fetch });
  await expect(verifier.verify('open_source', [stream('https://media.test/a.mp3')]))
    .resolves.toEqual([]);
});

it('does not normalize a search hit when its only stream option fails preflight', async () => {
  await expect(service.search({ query: 'dead' })).resolves.toMatchObject({ totalSongWorks: 0 });
});
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run test/unit/playability.test.ts test/unit/search-ranking.test.ts`

Expected: FAIL because no verifier or unified-search gate exists.

- [ ] **Step 3: Implement the bounded verifier**

Implement a class constructed with injectable `fetchFn`, `timeoutMs = 3000`, `successTtlMs = 300000`, `failureTtlMs = 60000`, and `maxBodyBytes = 1024`. For `stream`, send `GET` with `Range: bytes=0-1` and `Accept: audio/*`; accept only status 200/206 with non-HTML `content-type`, cancel the body after headers, and cache by URL. For `embed`, return the option unchanged only for `bilibili` and `youtube`; reject unknown embed sources. Never fetch `local` options. `markUnavailable` writes the failure cache for every provided stream URL.

- [ ] **Step 4: Gate unified search and playback resolution**

Inject one verifier into `UnifiedSearchService` and `PlaybackOrchestrator`. For each adapter's top eight search hits, call `adapter.getPlayOptions(externalId)`, retain a hit only if `verify` returns one or more options, and call `registry.recordPlayability` for every verification outcome. Preserve partial-source errors in `errors[]`. In `PlaybackOrchestrator.resolvePlay`, verify fresh options before persisting/ranking them. In `fallback`, resolve the previous source's options, call `markUnavailable`, mark its persisted options `blocked`, then resolve alternate items as today. A later successful fresh verification may restore a blocked option to `available`.

- [ ] **Step 5: Run focused and backend suites**

Run: `pnpm vitest run test/unit/playability.test.ts test/unit/search-ranking.test.ts test/unit/archive.test.ts && pnpm test && pnpm typecheck`

Expected: all tests pass; no source failure blanks other adapters.

- [ ] **Step 6: Commit verification slice**

Run: `git add src/modules/sources/playability.ts src/modules/search/service.ts src/modules/cache/plugin.ts src/modules/playback/orchestrator.ts src/app.ts test/unit/playability.test.ts test/unit/search-ranking.test.ts; git commit -m "feat: verify stream sources before search playback"`

### Task 3: Make Archive reliable and add Openverse and Wikimedia adapters

**Files:**
- Modify: `src/modules/sources/types.ts:16-18`, `src/modules/sources/plugin.ts:1-60`, `src/config/env.ts:1-60`
- Modify: `src/modules/sources/adapters/archive.ts:1-260`
- Create: `src/modules/sources/adapters/openverse.ts`, `src/modules/sources/adapters/wikimedia.ts`
- Create: `test/unit/openverse.test.ts`, `test/unit/wikimedia.test.ts`
- Modify: `test/unit/archive.test.ts:1-210`

**Interfaces:**
- `OpenverseAdapter` and `WikimediaAdapter` implement `SourceAdapter`; each returns valid attribution data and resolves a public stream option from its external ID.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('returns only Archive hits whose metadata contains supported audio files', async () => {
  const hits = await adapter.search({ query: 'concert', limit: 2 });
  expect(hits.map((hit) => hit.externalId)).toEqual(['playable-item']);
});

it('maps Openverse music audio with direct URL and CC attribution', async () => {
  expect(parseOpenverseSearch(response)[0]).toMatchObject({
    externalId: 'audio-uuid', metadata: { attribution: { license: 'CC BY 4.0' } },
  });
});

it('maps Commons audio file metadata to a public stream and attribution', async () => {
  expect(parseCommonsQuery(response)[0]?.metadata?.attribution.creator).toBe('Composer');
});
```

- [ ] **Step 2: Run adapter RED tests**

Run: `pnpm vitest run test/unit/archive.test.ts test/unit/openverse.test.ts test/unit/wikimedia.test.ts`

Expected: FAIL because Archive returns unverified catalog rows and new adapters/parsers do not exist.

- [ ] **Step 3: Implement Archive metadata filtering**

After Archive advanced search, fetch metadata for at most eight candidates with bounded concurrency four; keep a hit only when `pickAudioFiles` is non-empty and cache those filenames. Leave the final HTTP range check to Task 2's shared verifier. Do not make Archive's fallback fieldless query if the title query produced candidates that all fail playability; return no Archive result rather than broad irrelevant audio.

- [ ] **Step 4: Implement Openverse and Commons adapters**

Openverse calls `GET https://api.openverse.org/v1/audio/?q=<query>&category=music&page_size=<limit>` anonymously. Accept only entries with HTTPS original `url`, non-mature status, title, creator, license, license URL, and landing URL. Store a short-lived record cache by UUID; on cache miss `getPlayOptions` calls `GET /v1/audio/{id}/` and revalidates the same fields before returning one `stream` option.

Wikimedia calls the official `commons.wikimedia.org/w/api.php` Action API with `generator=search`, namespace 6, `gsrsearch=<query> filetype:audio`, `prop=imageinfo|extmetadata`, `iiprop=url`, and JSON format. Parse only pages with HTTPS original URL, creator, license name, license URL, and description/source URL. Use the file title as external ID; `getPlayOptions` repeats the title lookup after cache expiry. Give both adapters 10-second request timeouts, source-specific network errors, and no credentials.

- [ ] **Step 5: Register sources and verify**

Add `openverse` and `wikimedia` to `SourceId`, `KNOWN_SOURCE_IDS`, plugin registration, config-free defaults, all route validation surfaces, and source display types. Run: `pnpm vitest run test/unit/archive.test.ts test/unit/openverse.test.ts test/unit/wikimedia.test.ts && pnpm test && pnpm typecheck`

Expected: adapter tests prove filtered playability/attribution and full backend suite passes.

- [ ] **Step 6: Commit source adapters**

Run: `git add src/modules/sources/adapters src/modules/sources/types.ts src/modules/sources/plugin.ts src/config/env.ts test/unit/archive.test.ts test/unit/openverse.test.ts test/unit/wikimedia.test.ts; git commit -m "feat: add verified open audio sources"`

### Task 4: Expose verified sources, attribution, and health in the web UI

**Files:**
- Modify: `web/src/pages/SearchPage.tsx:1-340`, `web/src/components/SourceBadge.tsx:1-20`, `web/src/pages/SourcesPage.tsx:1-100`
- Modify: `web/src/lib/api/types.ts:1-180`, `web/src/stores/search.ts:1-50`
- Create: `web/src/components/SourceAttribution.tsx`, `web/src/components/SourceAttribution.test.tsx`
- Modify: `web/src/pages/SearchPage.test.tsx`, `web/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes `SourceItem.attributionMetadata` and `SourceDescription.stats.playabilitySuccessRate`.
- Produces new `Openverse` and `Commons` source filters/badges, an accessible attribution link, and a source-health playability percentage.

- [ ] **Step 1: Write failing UI tests**

```tsx
it('filters Openverse and Commons independently', () => {
  render(<SearchPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Openverse' }));
  expect(useSearchStore.getState().sources).toContain('openverse');
});

it('renders attribution as a safe external source link', () => {
  render(<SourceAttribution attribution={ccByAttribution} />);
  expect(screen.getByRole('link', { name: /CC BY 4.0/ })).toHaveAttribute('rel', 'noreferrer');
});

it('shows the stream preflight success percentage on a source card', () => {
  render(<SourcesPage />);
  expect(screen.getByText(/可播放验证 75%/)).toBeVisible();
});
```

- [ ] **Step 2: Run frontend RED tests**

Run: `pnpm --filter omnitunes-web test -- SearchPage SourceAttribution SourcesPage`

Expected: FAIL because new source labels, attribution component, and playability stat are absent.

- [ ] **Step 3: Implement filters, badges, and attribution**

Add fixed filter entries for `{ id: 'openverse', label: 'Openverse' }` and `{ id: 'wikimedia', label: 'Commons' }`; extend all source-label/tone maps. Render `SourceAttribution` only when metadata is non-null, with a compact license label opening `sourceUrl` in a new tab using `target="_blank" rel="noreferrer"`. Keep the existing song/artist/publisher hierarchy and source-row controls. Update the empty state text to “未找到可播放版本” only when a completed search has zero verified results.

- [ ] **Step 4: Implement source health presentation**

Add `playabilitySuccessRate` to frontend `SourceDescription.stats`. On `SourcesPage`, display `可播放验证 {(rate * 100).toFixed(0)}%` only after at least one verification; otherwise display `尚无可播放验证`. Keep existing call success rate and latest source error separately.

- [ ] **Step 5: Run web verification and visual QA**

Run: `pnpm --filter omnitunes-web test && pnpm typecheck:web && pnpm build:web`

Then run `pnpm dev` and `pnpm dev:web`; at 1440px and 390px confirm B站/Archive/Openverse/Commons buttons fit, the attribution link is keyboard accessible, and a failed source shown by the API does not hide results from another source.

- [ ] **Step 6: Commit web source UX**

Run: `git add web/src/pages/SearchPage.tsx web/src/components/SourceBadge.tsx web/src/pages/SourcesPage.tsx web/src/lib/api/types.ts web/src/stores/search.ts web/src/components/SourceAttribution.tsx web/src/components/SourceAttribution.test.tsx web/src/pages/SearchPage.test.tsx web/src/components/AppShell.test.tsx; git commit -m "feat: show verified open audio sources"`

### Task 5: Final verification and delivery boundary

**Files:**
- Modify: `docs/superpowers/plans/2026-08-05-stable-source-expansion.md` only to mark completed tasks if project convention permits it.

- [ ] **Step 1: Run complete verification**

Run: `pnpm test && pnpm --filter omnitunes-web test && pnpm typecheck && pnpm typecheck:web && pnpm build && pnpm build:web && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Conduct independent code review**

Give a fresh reviewer the source-expansion spec, this plan, changed files, and command output. Fix every Critical or Important finding, then perform one scoped re-review.

- [ ] **Step 3: Deliver source code only**

Report default sources, the reason Douyin and YouTube are absent, verification evidence, and any visual-QA limitation. Do not run `pnpm dist:electron`, update desktop shortcuts, publish a GitHub Release, or push: those actions were deferred by the user.

## Plan self-review

**Spec coverage:** Task 1 adds attribution and availability observability. Task 2 is the shared verified-playability gate and runtime failure feedback. Task 3 fixes Archive and adds both keyless open-audio sources. Task 4 exposes selection, attribution, and health. Task 5 covers independent review, verification, and deferred releases.

**Placeholder scan:** The plan has no TBD/TODO or unspecified test step; every task lists files, interfaces, commands, and concrete behavior.

**Type consistency:** `SourceAttributionMetadata` flows from `RawHit.metadata.attribution` through `sourceItems.attributionMetadata` to frontend `SourceItem.attributionMetadata`. `PlayabilityVerifier.verify` returns the accepted `PlayOption[]` that unified search and playback use. `playabilitySuccessRate` flows from `SourceRegistry.describe()` to `SourceDescription.stats` and `SourcesPage`.
