import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Attaches a unique request id to every incoming request.
 * The id is read from the incoming `x-request-id` header if present,
 * otherwise generated. It is exposed on `request.id` and echoed back
 * in the response as `x-request-id`.
 * 
 * Also logs request completion with timing, status code, and request ID.
 */
async function requestContextPlugin(app: FastifyInstance): Promise<void> {
  // onRequest: 生成/注入requestId
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    (request as FastifyRequest & { requestId: string }).requestId = id;
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
    reply.header('x-request-id', id);
  });

  // onResponse: 记录请求完成日志
  app.addHook('onResponse', async (request: FastifyRequest & { requestId?: string; startTime?: number }, reply: FastifyReply) => {
    const requestId = request.requestId;
    const startTime = request.startTime;
    const duration = startTime ? Date.now() - startTime : 0;
    
    // 构建日志上下文
    const logContext = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    };

    // 根据状态码选择日志级别
    if (reply.statusCode >= 500) {
      request.log.error(logContext, 'request completed with server error');
    } else if (reply.statusCode >= 400) {
      request.log.warn(logContext, 'request completed with client error');
    } else {
      request.log.info(logContext, 'request completed');
    }
  });
}

export default fp(requestContextPlugin, { name: 'request-context' });
