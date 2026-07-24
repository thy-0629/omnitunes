import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Normalizer } from './normalizer.js';
import { UnifiedSearchService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    search: UnifiedSearchService;
  }
}

/**
 * Wire the unified search service onto the app as `app.search`.
 *
 * Depends on `db` (for the Normalizer's persistence) and `sources` (for the
 * registry the service fans out to). Adding search to a new app is a one-line
 * register() call in app.ts.
 */
export default fp(
  async (app: FastifyInstance) => {
    const normalizer = new Normalizer(app.db);
    const service = new UnifiedSearchService(app.sources, normalizer);
    app.decorate('search', service);
    app.log.info('[search] unified search service ready');
  },
  { name: 'search', dependencies: ['db', 'sources'] },
);
