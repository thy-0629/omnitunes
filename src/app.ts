import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import { config } from './config/env.js';
import requestContextPlugin from './plugins/request-context.js';
import authPlugin from './plugins/auth.js';
import dbPlugin from './plugins/db.js';
import sourcesPlugin from './modules/sources/plugin.js';
// §十一: search + playback are wrapped by the cache plugin — original
//        search/playback plugins are merged into cache/plugin.ts.
import cachePlugin from './modules/cache/plugin.js';
import queuePlugin from './modules/queue/plugin.js';
import wsHubPlugin from './modules/ws/plugin.js';
import lifecyclePlugin from './modules/lifecycle/plugin.js';
import { registerErrorHandler } from './utils/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { sourceRoutes } from './routes/sources.js';
import { searchRoutes } from './routes/search.js';
import { playbackRoutes } from './routes/playback.js';
import { localStreamRoutes } from './routes/local-stream.js';
import { historyRoutes } from './routes/history.js';
import { queueRoutes } from './routes/queue.js';
import { collectionRoutes } from './routes/collections.js';
import { playlistRoutes } from './routes/playlists.js';
import { wsRoutes } from './routes/ws.js';
import { lifecycleRoutes } from './routes/lifecycle.js';
import { cacheRoutes } from './routes/cache.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    disableRequestLogging: true, // 禁用Fastify默认日志，由requestContextPlugin统一处理
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // --- plugins (order matters) ---
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(sensible);
  await app.register(websocket);
  await app.register(requestContextPlugin);
  await app.register(authPlugin);
  await app.register(dbPlugin);
  await app.register(sourcesPlugin);
  await app.register(cachePlugin);
  await app.register(queuePlugin);
  await app.register(wsHubPlugin);
  await app.register(lifecyclePlugin);

  // --- error handler ---
  registerErrorHandler(app);

  // --- routes ---
  await app.register(healthRoutes);
  await app.register(sourceRoutes);
  await app.register(searchRoutes);
  await app.register(playbackRoutes);
  await app.register(localStreamRoutes);
  await app.register(historyRoutes);
  await app.register(queueRoutes);
  await app.register(collectionRoutes);
  await app.register(playlistRoutes);
  await app.register(wsRoutes);
  await app.register(lifecycleRoutes);
  await app.register(cacheRoutes);

  // --- static web frontend (production / Electron single-port mode) ---
  // Serves web/dist if it has been built. In dev, the Vite server (:5173)
  // is used instead and this is simply absent.
  const webDist = resolve(process.cwd(), 'web', 'dist');
  if (existsSync(resolve(webDist, 'index.html'))) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, { root: webDist });
    // SPA fallback: unknown non-API GETs return index.html (client-side routing)
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && req.url !== '/ws') {
        return reply.sendFile('index.html');
      }
      return reply
        .status(404)
        .send({ error: { code: 'not_found', message: `route ${req.method} ${req.url} not found` } });
    });
  }

  return app;
}
