// Replaced by §十一 cache plugin (./modules/cache/plugin.ts).
// The cache plugin now owns the playback orchestrator + its wrapper.
import type { FastifyInstance } from 'fastify';

export default async function _legacyPlaybackPlugin(_app: FastifyInstance): Promise<void> {
  // intentionally empty — the cache plugin does the real work
}
