// Replaced by §十一 cache plugin (./modules/cache/plugin.ts).
// The cache plugin now owns the unified search service + the underlying
// normalizer; this file is kept only to avoid stray imports elsewhere.
// It is no longer registered in app.ts.
import type { FastifyInstance } from 'fastify';

export default async function _legacySearchPlugin(_app: FastifyInstance): Promise<void> {
  // intentionally empty — the cache plugin does the real work
}
