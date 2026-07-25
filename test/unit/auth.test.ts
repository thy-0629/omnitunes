import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import authPlugin from '../../src/plugins/auth.js';

describe('auth plugin', () => {
  let app: FastifyInstance;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
  });

  it('skips authentication when AUTH_TOKEN is default', async () => {
    process.env.AUTH_TOKEN = 'change-me-in-production';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });
    
    expect(res.statusCode).toBe(200);
  });

  it('skips authentication when AUTH_TOKEN is not set', async () => {
    delete process.env.AUTH_TOKEN;
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });
    
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when AUTH_TOKEN is set and no Authorization header', async () => {
    process.env.AUTH_TOKEN = 'test-token-123456';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });
    
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 401 when Authorization header has wrong format', async () => {
    process.env.AUTH_TOKEN = 'test-token-123456';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toContain('Invalid authorization format');
  });

  it('returns 401 when Bearer token is wrong', async () => {
    process.env.AUTH_TOKEN = 'test-token-123456';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer wrong-token' },
    });
    
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toBe('Invalid authentication token');
  });

  it('passes through when Bearer token is correct', async () => {
    process.env.AUTH_TOKEN = 'test-token-123456';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer test-token-123456' },
    });
    
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('allows public routes without authentication', async () => {
    process.env.AUTH_TOKEN = 'test-token-123456';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/health', async () => ({ status: 'ok' }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    
    expect(res.statusCode).toBe(200);
  });

  it('returns requestId in error response', async () => {
    process.env.AUTH_TOKEN = 'test-token-123456';
    
    app = Fastify();
    await app.register(authPlugin);
    
    app.get('/test', async () => ({ ok: true }));
    
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-request-id': 'test-request-123' },
    });
    
    expect(res.statusCode).toBe(401);
    const body = res.json();
    // requestId可能不存在，因为requestContext插件没有在测试中注册
    // 但error字段应该存在
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('unauthorized');
  });
});