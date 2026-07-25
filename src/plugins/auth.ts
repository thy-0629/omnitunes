import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Authentication plugin using Bearer token.
 * 
 * Validates `Authorization: Bearer <token>` header against `AUTH_TOKEN` environment variable.
 * Public routes are excluded from authentication.
 */
async function authPlugin(app: FastifyInstance): Promise<void> {
  const authToken = process.env.AUTH_TOKEN;
  
  // 如果没有配置AUTH_TOKEN，跳过认证（开发模式）
  if (!authToken || authToken === 'change-me-in-production') {
    app.log.warn('AUTH_TOKEN not configured or using default value, skipping authentication');
    return;
  }

  // 公开路由白名单（不需要认证）
  const publicRoutes = [
    { method: 'GET', url: '/health' },
    { method: 'GET', url: '/api/sources' },
    { method: 'GET', url: '/api/sources/health' },
    { method: 'GET', url: '/api/search' },
    { method: 'GET', url: '/api/local-stream' },
    { method: 'GET', url: '/api/history' },
    { method: 'GET', url: '/api/queue' },
    { method: 'GET', url: '/api/collections' },
    { method: 'GET', url: '/api/playlists' },
    { method: 'GET', url: '/api/playlists/:id' },
    { method: 'GET', url: '/api/ws/status' },
    { method: 'GET', url: '/api/cache/status' },
    { method: 'GET', url: '/api/lifecycle/status' },
    // WebSocket升级也需要认证
    { method: 'GET', url: '/ws' },
  ];

  // 检查是否为公开路由
  function isPublicRoute(method: string, url: string): boolean {
    return publicRoutes.some(route => {
      // 简单匹配，支持路径参数
      const urlPattern = route.url.replace(/:[^/]+/g, '[^/]+');
      const regex = new RegExp(`^${urlPattern}$`);
      return route.method === method && regex.test(url);
    });
  }

  // preHandler hook：验证token
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // 跳过公开路由
    if (isPublicRoute(request.method, request.url)) {
      return;
    }

    // 获取Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Authorization header is required',
        },
        requestId: (request as FastifyRequest & { requestId?: string }).requestId,
      });
      return;
    }

    // 验证Bearer token格式
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Invalid authorization format. Use: Bearer <token>',
        },
        requestId: (request as FastifyRequest & { requestId?: string }).requestId,
      });
      return;
    }

    // 验证token
    if (token !== authToken) {
      reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Invalid authentication token',
        },
        requestId: (request as FastifyRequest & { requestId?: string }).requestId,
      });
      return;
    }

    // 认证成功，记录到日志
    request.log.info({ userId: 'authenticated' }, 'authenticated request');
  });
}

export default fp(authPlugin, { name: 'auth' });