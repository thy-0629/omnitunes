/**
 * §九 WebSocket integration test.
 *
 * Tests:
 *  1. Connect → receive `connected` message
 *  2. Subscribe to playback/queue/progress channels
 *  3. API-triggered broadcast: queue:add → queue:changed
 *  4. API-triggered broadcast: play:start → play:started
 *  5. API-triggered broadcast: play:end → play:ended
 *  6. Progress relay: client A sends progress → client B receives progress:sync
 *  7. Unsubscribe → unsubscribed confirmation
 *  8. /api/ws/status shows correct connection count
 */

import { WebSocket } from 'ws';

const BASE = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

let pass = 0;
let fail = 0;
const results: string[] = [];

function ok(name: string) {
  pass++;
  results.push(`  ✓ ${name}`);
}

function notOk(name: string, reason: string) {
  fail++;
  results.push(`  ✗ ${name} — ${reason}`);
}

// --- helper: HTTP POST ---
async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// --- helper: wait for a WS message with timeout ---
function waitForMessage(ws: WebSocket, expectedType: string, timeoutMs = 5000): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      resolve(null);
    }, timeoutMs);

    function handler(data: Buffer) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === expectedType) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {
        // ignore parse errors
      }
    }
    ws.on('message', handler);
  });
}

// --- helper: send a WS message ---
function send(ws: WebSocket, msg: unknown) {
  ws.send(JSON.stringify(msg));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- main test ---
async function main() {
  console.log('\n=== §九 WebSocket Integration Test ===\n');

  // 1. Connect
  const ws1 = new WebSocket(WS_URL);
  const connected1 = await waitForMessage(ws1, 'connected');
  if (connected1 && connected1.type === 'connected') {
    ok('connect → received "connected" message');
  } else {
    notOk('connect', 'no connected message');
  }

  // 2. Subscribe to playback
  send(ws1, { type: 'subscribe', channel: 'playback' });
  const sub1 = await waitForMessage(ws1, 'subscribed');
  if (sub1 && sub1.channel === 'playback') {
    ok('subscribe playback → confirmed');
  } else {
    notOk('subscribe playback', 'no confirmation');
  }

  // 3. Subscribe to queue
  send(ws1, { type: 'subscribe', channel: 'queue' });
  const sub2 = await waitForMessage(ws1, 'subscribed');
  if (sub2 && sub2.channel === 'queue') {
    ok('subscribe queue → confirmed');
  } else {
    notOk('subscribe queue', 'no confirmation');
  }

  // 4. Subscribe to progress
  send(ws1, { type: 'subscribe', channel: 'progress' });
  const sub3 = await waitForMessage(ws1, 'subscribed');
  if (sub3 && sub3.channel === 'progress') {
    ok('subscribe progress → confirmed');
  } else {
    notOk('subscribe progress', 'no confirmation');
  }

  // 5. Check /api/ws/status shows 1 connection
  const status1 = await get('/api/ws/status');
  if (status1.connections === 1) {
    ok('/api/ws/status shows 1 connection');
  } else {
    notOk('/api/ws/status', `expected 1, got ${status1.connections}`);
  }

  // 6. Connect second client (for progress relay test)
  const ws2 = new WebSocket(WS_URL);
  const connected2 = await waitForMessage(ws2, 'connected');
  if (connected2) {
    ok('second client connected');
  } else {
    notOk('second client connect', 'no connected message');
  }

  // ws2 subscribes to progress
  send(ws2, { type: 'subscribe', channel: 'progress' });
  const sub4 = await waitForMessage(ws2, 'subscribed');
  if (sub4 && sub4.channel === 'progress') {
    ok('ws2 subscribe progress → confirmed');
  } else {
    notOk('ws2 subscribe progress', 'no confirmation');
  }

  // 7. API-triggered: queue add → queue:changed broadcast
  const queueMsgPromise = waitForMessage(ws1, 'queue:changed');
  await post('/api/queue', { songWorkId: 'test-ws-song-1' });
  const queueMsg = await queueMsgPromise;
  if (queueMsg && queueMsg.type === 'queue:changed' && queueMsg.action === 'add') {
    ok('POST /api/queue → WS received queue:changed (add)');
  } else {
    notOk('queue:changed broadcast', `got: ${JSON.stringify(queueMsg)}`);
  }

  // 8. Search for a song to get songWorkId for resolve + play test
  const searchRes = await get('/api/search?q=bohemian&limit=1&sources=mock');
  const searchResults = searchRes.results as Array<Record<string, unknown>> | undefined;
  if (searchResults && searchResults.length > 0) {
    const first = searchResults[0]!;
    const songWorkId = (first.songWork as Record<string, unknown>)?.id as string | undefined;

    if (songWorkId) {
      // 8a. Resolve play options (creates playable_options rows)
      const resolveRes = await post('/api/play/resolve', { songWorkId });
      const best = resolveRes.best as Record<string, unknown> | null;

      if (best) {
        const sourceItemId = (best.sourceItem as Record<string, unknown>)?.id as string;
        const optionId = best.playableOptionId as string;

        // 9. API-triggered: play start → play:started broadcast
        const playStartedPromise = waitForMessage(ws1, 'play:started');
        const startRes = await post('/api/play/start', { sourceItemId, optionId });
        const playId = startRes.playId as string | undefined;

        const playStartedMsg = await playStartedPromise;
        if (playStartedMsg && playStartedMsg.type === 'play:started' && playStartedMsg.playId === playId) {
          ok('POST /api/play/start → WS received play:started');
        } else {
          notOk('play:started broadcast', `got: ${JSON.stringify(playStartedMsg)}`);
        }

        // 10. API-triggered: play end → play:ended broadcast
        if (playId) {
          const playEndedPromise = waitForMessage(ws1, 'play:ended');
          await post(`/api/play/${playId}/end`, { outcome: 'completed', durationPlayedSec: 180 });
          const playEndedMsg = await playEndedPromise;
          if (playEndedMsg && playEndedMsg.type === 'play:ended' && playEndedMsg.playId === playId) {
            ok('POST /api/play/:id/end → WS received play:ended');
          } else {
            notOk('play:ended broadcast', `got: ${JSON.stringify(playEndedMsg)}`);
          }
        }
      } else {
        notOk('resolve play options', 'no best option returned');
      }
    } else {
      notOk('search for play test', 'no songWorkId found');
    }
  } else {
    notOk('search for play test', 'no results from mock source');
  }

  // 11. Progress relay: ws1 sends progress → ws2 receives progress:sync
  const progressPromise = waitForMessage(ws2, 'progress:sync');
  send(ws1, {
    type: 'progress',
    playId: 'test-play-123',
    positionSec: 45.3,
    durationSec: 180.0,
  });
  const progressMsg = await progressPromise;
  if (
    progressMsg &&
    progressMsg.type === 'progress:sync' &&
    progressMsg.playId === 'test-play-123' &&
    progressMsg.positionSec === 45.3
  ) {
    ok('progress relay: ws1 → ws2 received progress:sync');
  } else {
    notOk('progress relay', `got: ${JSON.stringify(progressMsg)}`);
  }

  // 12. Progress echo check: ws1 should NOT receive its own progress back
  const echoPromise = waitForMessage(ws1, 'progress:sync', 2000);
  send(ws1, {
    type: 'progress',
    playId: 'test-play-456',
    positionSec: 10.0,
    durationSec: 200.0,
  });
  const echoMsg = await echoPromise;
  if (echoMsg === null) {
    ok('no echo: sender does not receive its own progress');
  } else {
    notOk('no echo', `unexpected message: ${JSON.stringify(echoMsg)}`);
  }

  // 13. Unsubscribe from queue
  send(ws1, { type: 'unsubscribe', channel: 'queue' });
  const unsubMsg = await waitForMessage(ws1, 'unsubscribed');
  if (unsubMsg && unsubMsg.channel === 'queue') {
    ok('unsubscribe queue → confirmed');
  } else {
    notOk('unsubscribe queue', 'no confirmation');
  }

  // 14. Verify queue broadcast NOT received after unsubscribe
  const noBroadcastPromise = waitForMessage(ws1, 'queue:changed', 2000);
  await post('/api/queue/clear');
  const noBroadcast = await noBroadcastPromise;
  if (noBroadcast === null) {
    ok('unsubscribed: no queue:changed received after unsubscribe');
  } else {
    notOk('unsubscribe filter', `received unexpected: ${JSON.stringify(noBroadcast)}`);
  }

  // 15. Invalid message → error
  const errorPromise = waitForMessage(ws1, 'error');
  ws1.send('not json at all');
  const errorMsg = await errorPromise;
  if (errorMsg && errorMsg.type === 'error') {
    ok('invalid message → error response');
  } else {
    notOk('invalid message', 'no error response');
  }

  // 16. Check /api/ws/status shows 2 connections
  const status2 = await get('/api/ws/status');
  if (status2.connections === 2) {
    ok('/api/ws/status shows 2 connections');
  } else {
    notOk('/api/ws/status 2 connections', `expected 2, got ${status2.connections}`);
  }

  // cleanup
  ws1.close();
  ws2.close();
  await sleep(500);

  // 17. Check /api/ws/status shows 0 connections after disconnect
  const status3 = await get('/api/ws/status');
  if (status3.connections === 0) {
    ok('/api/ws/status shows 0 after disconnect');
  } else {
    notOk('/api/ws/status 0 after disconnect', `expected 0, got ${status3.connections}`);
  }

  // --- results ---
  console.log(results.join('\n'));
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
