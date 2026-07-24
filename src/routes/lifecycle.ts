import type { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';

/**
 * Lifecycle management routes — admin endpoints for data cleanup.
 *
 * GET  /api/admin/lifecycle/status  — last run + next scheduled run
 * POST /api/admin/lifecycle/run     — trigger cleanup manually
 */
export async function lifecycleRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/lifecycle/status
  app.get('/api/admin/lifecycle/status', async () => {
    const lastRun = app.lifecycle.getLastRun();
    const nextRun = app.lifecycle.getNextRun();
    return {
      lastRun,
      nextRun,
      config: {
        retentionDays: config.LIFECYCLE_RETENTION_DAYS,
        intervalHours: config.LIFECYCLE_INTERVAL_HOURS,
      },
    };
  });

  // POST /api/admin/lifecycle/run — manual trigger
  app.post('/api/admin/lifecycle/run', async () => {
    const result = app.lifecycle.runOnce();
    return result;
  });
}
