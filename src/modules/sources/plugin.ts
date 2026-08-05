import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config/env.js';
import { SourceRegistry } from './registry.js';
import { PlayabilityVerifier } from './playability.js';
import { MockAdapter } from './adapters/mock.js';
import { LocalAdapter } from './adapters/local.js';
import { YouTubeAdapter } from './adapters/youtube.js';
import { ArchiveOrgAdapter } from './adapters/archive.js';
import { BilibiliAdapter } from './adapters/bilibili.js';
import { OpenverseAdapter } from './adapters/openverse.js';
import { WikimediaCommonsAdapter } from './adapters/wikimedia.js';

declare module 'fastify' {
  interface FastifyInstance {
    sources: SourceRegistry;
    playability: PlayabilityVerifier;
  }
}

/**
 * Build the source registry, register built-in adapters based on config,
 * and decorate the Fastify instance as `app.sources`.
 *
 * Adding a new source later is a one-line change here.
 */
export default fp(
  async (app: FastifyInstance) => {
    const registry = new SourceRegistry();
    const playability = new PlayabilityVerifier();

    // 1. Mock adapter — always on in development for ease of testing the UI.
    if (config.NODE_ENV !== 'production') {
      registry.register(new MockAdapter());
    }

    // 2. Local adapter — always on, just returns empty hits if dir missing.
    registry.register(new LocalAdapter({ mediaDir: config.MEDIA_DIR }));

    // 3. YouTube adapter — wired but disabled until an API key is provided.
    registry.register(new YouTubeAdapter(process.env['YOUTUBE_API_KEY']));

    // 4. Internet Archive — official keyless API, always on.
    registry.register(new ArchiveOrgAdapter());

    registry.register(new OpenverseAdapter());
    registry.register(new WikimediaCommonsAdapter());

    // 5. Bilibili — keyless web search (WBI-signed) + official iframe embed.
    registry.register(
      new BilibiliAdapter({
        sessdata: config.BILIBILI_SESSDATA,
        minIntervalMs: config.BILIBILI_MIN_INTERVAL_MS,
        wbiTtlSec: config.BILIBILI_WBI_TTL_SEC,
      }),
    );

    app.decorate('sources', registry);
    app.decorate('playability', playability);
    app.log.info(
      { sources: registry.list().map((a) => a.id) },
      '[sources] registered adapters',
    );
  },
  { name: 'sources', dependencies: [] },
);
