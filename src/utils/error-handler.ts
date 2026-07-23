import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from '../config/env.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

/**
 * Centralized error handler. Maps known error types to HTTP responses
 * and keeps the response shape consistent.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;

    // 1) Zod validation errors -> 400
    if (err instanceof ZodError) {
      const body: ErrorBody = {
        error: { code: 'validation_error', message: 'Invalid request', details: err.flatten() },
        requestId,
      };
      return reply.status(400).send(body);
    }

    // 2) Fastify validation errors (e.g. schema mismatch)
    if (err.validation) {
      const body: ErrorBody = {
        error: { code: 'validation_error', message: err.message, details: err.validation },
        requestId,
      };
      return reply.status(err.statusCode ?? 400).send(body);
    }

    // 3) Errors that already declare an HTTP status
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 600) {
      const body: ErrorBody = {
        error: { code: err.code ?? 'http_error', message: err.message },
        requestId,
      };
      request.log.warn({ err, requestId }, 'request failed');
      return reply.status(err.statusCode).send(body);
    }

    // 4) Unknown -> 500
    request.log.error({ err, requestId }, 'unhandled error');
    const body: ErrorBody = {
      error: {
        code: 'internal_error',
        message: config.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      },
      requestId,
    };
    return reply.status(500).send(body);
  });
}
