import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createDb, type DbClient } from '../db/client.js';

/**
 * Attach a Drizzle/SQLite client to the Fastify instance as `app.db`.
 * Closes the underlying SQLite handle on shutdown.
 */
declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
  }
}

export default fp(async (app: FastifyInstance) => {
  const { db, sqlite } = createDb();
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    sqlite.close();
  });
  app.log.info({ path: 'see config.DATABASE_URL' }, '[db] connected');
}, { name: 'db' });