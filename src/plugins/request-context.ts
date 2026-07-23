import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Attaches a unique request id to every incoming request.
 * The id is read from the incoming `x-request-id` header if present,
 * otherwise generated. It is exposed on `request.id` and echoed back
 * in the response as `x-request-id`.
 */
async function requestContextPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    (request as FastifyRequest & { requestId: string }).requestId = id;
    reply.header('x-request-id', id);
  });
}

export default fp(requestContextPlugin, { name: 'request-context' });
