import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '../types/index.js';

const SERVICE_VERSION = '0.1.0';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      version: SERVICE_VERSION,
      env: process.env['NODE_ENV'] ?? 'development',
      timestamp: new Date().toISOString(),
    };
  });
}
