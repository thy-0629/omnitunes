import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import { config } from './config/env.js';
import requestContextPlugin from './plugins/request-context.js';
import dbPlugin from './plugins/db.js';
import sourcesPlugin from './modules/sources/plugin.js';
import searchPlugin from './modules/search/plugin.js';
import playbackPlugin from './modules/playback/plugin.js';
import queuePlugin from './modules/queue/plugin.js';
import wsHubPlugin from './modules/ws/plugin.js';
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

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    },
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
  await app.register(dbPlugin);
  await app.register(sourcesPlugin);
  await app.register(searchPlugin);
  await app.register(playbackPlugin);
  await app.register(queuePlugin);
  await app.register(wsHubPlugin);

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

  return app;
}
