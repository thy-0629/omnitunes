import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../../db/client.js';
import { LifecycleCleanup, type CleanupResult } from './cleanup.js';
import { config } from '../../config/env.js';

// --- type augmentation ---
declare module 'fastify' {
  interface FastifyInstance {
    lifecycle: {
      /** Run cleanup once, right now. Returns the result. */
      runOnce(): CleanupResult;
      /** Get the last cleanup result (null if never run). */
      getLastRun(): CleanupResult | null;
      /** Get the next scheduled run timestamp (ms). Null if scheduler not running. */
      getNextRun(): number | null;
      /** Start the periodic scheduler. No-op if already running. */
      startScheduler(): void;
      /** Stop the periodic scheduler. */
      stopScheduler(): void;
    };
  }
}

/**
 * Registers the LifecycleCleanup service and starts a periodic scheduler
 * that runs cleanup every LIFECYCLE_INTERVAL_HOURS hours.
 *
 * The scheduler uses setInterval — it survives as long as the process lives.
 * On shutdown (onClose), the interval is cleared.
 */
export default fp(async (app: FastifyInstance) => {
  const cleanup = new LifecycleCleanup(app.db);

  let lastRun: CleanupResult | null = null;
  let nextRun: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const intervalMs = config.LIFECYCLE_INTERVAL_HOURS * 60 * 60 * 1000;

  function doRun() {
    try {
      lastRun = cleanup.run();
      nextRun = Date.now() + intervalMs;
      app.log.info(lastRun, '[lifecycle] cleanup completed');
    } catch (err) {
      app.log.error({ err }, '[lifecycle] cleanup failed');
      // Still schedule next run even if this one failed
      nextRun = Date.now() + intervalMs;
    }
  }

  function startScheduler() {
    if (timer) return;
    timer = setInterval(doRun, intervalMs);
    // Allow the process to exit even if the timer is still active
    if (timer.unref) timer.unref();
    nextRun = Date.now() + intervalMs;
    app.log.info(
      { intervalHours: config.LIFECYCLE_INTERVAL_HOURS, retentionDays: config.LIFECYCLE_RETENTION_DAYS },
      '[lifecycle] scheduler started',
    );
  }

  function stopScheduler() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      nextRun = null;
      app.log.info('[lifecycle] scheduler stopped');
    }
  }

  app.decorate('lifecycle', {
    runOnce: () => {
      doRun();
      return lastRun!;
    },
    getLastRun: () => lastRun,
    getNextRun: () => nextRun,
    startScheduler,
    stopScheduler,
  });

  // Start the scheduler automatically
  startScheduler();

  // Cleanup on shutdown
  app.addHook('onClose', async () => {
    stopScheduler();
  });
}, {
  name: 'lifecycle',
  dependencies: ['db'],
});
