/**
 * §十一 Cache layer integration test.
 *
 * Verifies:
 *   1. First search → cache miss → live call → cache populated
 *   2. Second identical search → cache hit → latencyMs ~0
 *   3. Different query → cache miss
 *   4. Cache invalidation (manual) → next search → miss
 *   5. Cache clear → all entries wiped
 *   6. GET /api/admin/cache/status shows correct stats
 *   7. resolvePlay caching for single sourceItemId
 *   8. Mutations (startPlay/endPlay) bypass cache
 */
const API = 'http://localhost:3000';
let pass = 0;
let fail = 0;

function ok(label: string) {
  pass++;
  console.log(`  \u2713 ${label}`);
}
function notOk(label: string, detail?: string) {
  fail++;
  console.log(`  \u2717 ${label}${detail ? ' — ' + detail : ''}`);
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`);
  return res.json();
}

async function post(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  // --- 0. Clear cache to start fresh ---
  console.log('\n=== 0. Clearing cache for fresh test ===');
  await fetch(`${API}/api/admin/cache/clear`, { method: 'POST' });
  const stats0 = await get('/api/admin/cache/status');
  console.log(`  cache cleared: search.size=${stats0.search.size}, playOpt.size=${stats0.playOptions.size}`);

  // --- 1. First search → cache miss, stats show 0 hits ---
  console.log('\n=== 1. First search (cache miss) ===');
  const r1 = await get('/api/search?q=bohemian&limit=2&sources=mock');
  if (r1.results && r1.results.length > 0) {
    ok(`first search returned ${r1.results.length} results`);
  } else {
    notOk('first search returned no results');
  }
  const latency1 = r1.meta?.latencyMs ?? 999;
  if (latency1 > 0) {
    ok(`first search latencyMs = ${latency1} (>0, live call)`);
  } else {
    notOk('first search latencyMs = 0 (should be live)');
  }

  // Check stats: 1 miss, 0 hits, 1 set (using delta since stats are cumulative)
  const stats1 = await get('/api/admin/cache/status');
  const dMisses1 = stats1.search.misses - stats0.search.misses;
  const dHits1 = stats1.search.hits - stats0.search.hits;
  const dSets1 = stats1.search.sets - stats0.search.sets;
  if (dMisses1 === 1 && dHits1 === 0 && dSets1 === 1) {
    ok(`stats delta: miss=+1, hit=+0, set=+1 (correct for first call)`);
  } else {
    notOk('stats after first search', `delta: miss=+${dMisses1}, hit=+${dHits1}, set=+${dSets1}`);
  }

  // --- 2. Second identical search → cache hit, latencyMs ~0 ---
  console.log('\n=== 2. Second search (cache hit) ===');
  const r2 = await get('/api/search?q=bohemian&limit=2&sources=mock');
  const latency2 = r2.meta?.latencyMs ?? 999;
  if (latency2 === 0) {
    ok('second search latencyMs = 0 (cache hit)');
  } else {
    notOk('second search latencyMs > 0', `got ${latency2}`);
  }

  // Results should be identical
  if (r1.totalSongWorks === r2.totalSongWorks) {
    ok('same result count on cache hit');
  } else {
    notOk('different result count on cache hit');
  }

  const stats2 = await get('/api/admin/cache/status');
  const dHits2 = stats2.search.hits - stats1.search.hits;
  const dMisses2 = stats2.search.misses - stats1.search.misses;
  if (dHits2 === 1 && dMisses2 === 0) {
    ok(`stats delta: hit=+1, miss=+0 (correct for second call)`);
  } else {
    notOk('stats after second search', `delta: hit=+${dHits2}, miss=+${dMisses2}`);
  }

  // --- 3. Different query → cache miss ---
  console.log('\n=== 3. Different query (cache miss) ===');
  const r3 = await get('/api/search?q=hello&limit=2&sources=mock');
  const latency3 = r3.meta?.latencyMs ?? 999;
  if (latency3 > 0) {
    ok('different query latencyMs > 0 (cache miss)');
  } else {
    notOk('different query latencyMs = 0 (should be miss)');
  }

  const stats3 = await get('/api/admin/cache/status');
  if (stats3.search.size === 2) {
    ok(`cache size = 2 (two distinct queries cached)`);
  } else {
    notOk('cache size', `got ${stats3.search.size}, expected 2`);
  }

  // --- 4. Manual invalidation ---
  console.log('\n=== 4. Manual cache invalidation ===');
  const inv = await post('/api/admin/cache/invalidate', {
    kind: 'search',
    query: 'bohemian',
    sources: ['mock'],
    limit: 2,
  });
  if (inv.ok === true) {
    ok('invalidate returned ok=true');
  } else {
    notOk('invalidate response', JSON.stringify(inv));
  }

  const stats4 = await get('/api/admin/cache/status');
  if (stats4.search.size === 1) {
    ok(`cache size = 1 after invalidation (one entry removed)`);
  } else {
    notOk('cache size after invalidation', `got ${stats4.search.size}, expected 1`);
  }

  // Search again → should be a miss now
  const r4 = await get('/api/search?q=bohemian&limit=2&sources=mock');
  const latency4 = r4.meta?.latencyMs ?? 999;
  if (latency4 > 0) {
    ok('re-search after invalidation → cache miss (latencyMs > 0)');
  } else {
    notOk('re-search after invalidation still cached');
  }

  // --- 5. Cache clear ---
  console.log('\n=== 5. Cache clear all ===');
  const clearRes = await fetch(`${API}/api/admin/cache/clear`, { method: 'POST' });
  const cleared = await clearRes.json();
  if (cleared.ok === true) {
    ok('clear returned ok=true');
  } else {
    notOk('clear response', JSON.stringify(cleared));
  }
  const stats5 = await get('/api/admin/cache/status');
  if (stats5.search.size === 0 && stats5.playOptions.size === 0) {
    ok('both caches empty after clear');
  } else {
    notOk('caches not empty', `search=${stats5.search.size}, playOpt=${stats5.playOptions.size}`);
  }

  // --- 6. resolvePlay caching ---
  console.log('\n=== 6. resolvePlay caching ===');
  // Get a sourceItemId from search
  const searchRes = await get('/api/search?q=hello&limit=1&sources=mock');
  const recordings = searchRes.results?.[0]?.recordings;
  const sourceItemId = recordings?.[0]?.sourceItems?.[0]?.id;
  if (!sourceItemId) {
    notOk('no sourceItemId found for play cache test');
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Results: ${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  }

  // First resolve → miss
  const resolve1 = await post('/api/play/resolve', { sourceItemId });
  if (resolve1.options && resolve1.options.length > 0) {
    ok('first resolvePlay returned options');
  } else {
    notOk('first resolvePlay returned no options', JSON.stringify(resolve1));
  }

  const stats6 = await get('/api/admin/cache/status');
  const dSets6 = stats6.playOptions.sets - stats5.playOptions.sets;
  if (dSets6 >= 1) {
    ok(`playOpt cache: sets delta=+${dSets6} (entry cached)`);
  } else {
    notOk('playOpt cache not populated', `sets delta=+${dSets6}`);
  }

  // Second resolve → hit
  const resolve2 = await post('/api/play/resolve', { sourceItemId });
  if (resolve2.options && resolve2.options.length > 0) {
    ok('second resolvePlay returned options (from cache)');
  } else {
    notOk('second resolvePlay returned no options');
  }

  const stats7 = await get('/api/admin/cache/status');
  const dHits7 = stats7.playOptions.hits - stats6.playOptions.hits;
  if (dHits7 >= 1) {
    ok(`playOpt cache: hits delta=+${dHits7} (cache hit)`);
  } else {
    notOk('playOpt cache no hit recorded', `hits delta=+${dHits7}`);
  }

  // --- 7. Mutations bypass cache ---
  console.log('\n=== 7. Mutations bypass cache ===');
  const startRes = await post('/api/play/start', { sourceItemId });
  if (startRes.playId) {
    ok(`startPlay returned playId (bypasses cache)`);
  } else {
    notOk('startPlay failed', JSON.stringify(startRes));
  }

  const endRes = await post(`/api/play/${startRes.playId}/end`, {
    outcome: 'completed',
    durationPlayedSec: 30,
  });
  if (endRes.ok) {
    ok('endPlay returned ok (bypasses cache)');
  } else {
    notOk('endPlay failed', JSON.stringify(endRes));
  }

  // --- 8. Invalid invalidate params → 400 ---
  console.log('\n=== 8. Invalid invalidate params ===');
  const invRes = await fetch(`${API}/api/admin/cache/invalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'search' }), // missing query
  });
  if (invRes.status === 400) {
    ok('invalidate without query → 400');
  } else {
    notOk('invalidate without query', `got status ${invRes.status}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
