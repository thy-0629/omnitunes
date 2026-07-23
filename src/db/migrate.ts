/**
 * Apply pending Drizzle migrations from ./drizzle to the configured SQLite file.
 * Safe to run multiple times — Drizzle tracks applied migrations in __drizzle_migrations.
 *
 * Run via:   pnpm db:migrate
 */
import { createDb } from './client.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

async function main() {
  const { db } = createDb();
  console.log('[db] applying migrations...');
  migrate(db, { migrationsFolder: './drizzle' });
  console.log('[db] migrations applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});