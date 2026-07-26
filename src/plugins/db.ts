import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, type DbClient } from '../db/client.js';

/**
 * Attach a Drizzle/SQLite client to the Fastify instance as `app.db`.
 * Applies pending migrations at boot (idempotent — Drizzle tracks applied
 * ones in __drizzle_migrations), so fresh installs (Electron, Docker) work
 * without a manual `pnpm db:migrate` step.
 * Closes the underlying SQLite handle on shutdown.
 */
declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
  }
}

export default fp(async (app: FastifyInstance) => {
  const { db, sqlite } = createDb();

  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  if (existsSync(resolve(migrationsFolder, 'meta', '_journal.json'))) {
    migrate(db, { migrationsFolder });
    app.log.info('[db] migrations applied');
  }

  app.decorate('db', db);
  app.addHook('onClose', async () => {
    sqlite.close();
  });
  app.log.info({ path: 'see config.DATABASE_URL' }, '[db] connected');
}, { name: 'db' });