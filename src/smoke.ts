#!/usr/bin/env node
// Quick smoke test: build server, ping /health, exit.
import { buildServer } from './app.js';

const app = await buildServer();
try {
  const res = await app.inject({ method: 'GET', url: '/health' });
  if (res.statusCode !== 200) {
    console.error(`FAIL: /health returned ${res.statusCode}`);
    process.exit(1);
  }
  console.log('OK:', res.body);
  process.exit(0);
} catch (err) {
  console.error('FAIL:', err);
  process.exit(1);
} finally {
  await app.close();
}
