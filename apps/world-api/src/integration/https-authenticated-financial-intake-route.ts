import type { IncomingMessage, ServerResponse } from 'node:http';
import { AUTHENTICATED_FINANCIAL_INTAKE_PATH } from '@econmind/core';
import {
  createAuthenticatedFinancialIntakeComposition,
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  type AuthenticatedFinancialIntakeCompositionConfig,
} from './authenticated-financial-intake-composition.js';

export interface HttpsFinancialIntakeRouteConfig {
  readonly path: string;
  readonly allowedOrigins: readonly string[];
  readonly composition: AuthenticatedFinancialIntakeCompositionConfig | null;
}
const fallbackId = '00000000-0000-4000-8000-000000000000';
class TransportFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
function httpsOrigin(v: string): boolean {
  try {
    const u = new URL(v);
    return (
      u.protocol === 'https:' &&
      u.origin === v &&
      !u.username &&
      !u.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
function header(req: IncomingMessage, name: string): string | null {
  let n = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2)
    if (req.rawHeaders[i]?.toLowerCase() === name) n++;
  return n === 1 && typeof req.headers[name] === 'string'
    ? (req.headers[name] as string)
    : null;
}
function reply(res: ServerResponse, status: number, body: unknown) {
  if (res.destroyed || res.writableEnded) return;
  let text = JSON.stringify(body);
  if (Buffer.byteLength(text) > 1024 * 1024) {
    status = 503;
    text = JSON.stringify({
      schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
      requestId: fallbackId,
      ok: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true },
    });
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    connection: 'close',
  });
  res.end(text);
}
function json(req: IncomingMessage, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (error?: unknown, value?: unknown) => {
      req.off('data', data);
      req.off('end', end);
      req.off('error', fail);
      signal.removeEventListener('abort', abort);
      chunks.length = 0;
      req.resume();
      if (error) reject(error);
      else resolve(value);
    };
    const data = (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 16384) finish(new TransportFailure(413, 'REQUEST_TOO_LARGE'));
      else chunks.push(chunk);
    };
    const end = () => {
      try {
        finish(
          undefined,
          JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(
              Buffer.concat(chunks, size),
            ),
          ),
        );
      } catch {
        finish(new TransportFailure(400, 'INVALID_JSON'));
      }
    };
    const fail = () => finish(new TransportFailure(400, 'INVALID_REQUEST'));
    const abort = () => finish(signal.reason);
    if (signal.aborted) {
      abort();
      return;
    }
    req.on('data', data);
    req.once('end', end);
    req.once('error', fail);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Explicit bounded bearer HTTPS route adapter, never mounted/listening by
 * default. Caller owns actual TLS/server/router; local fixture HTTP isn't TLS.
 * It does not shadow public/auth/storage/health/read routes or economic writes.
 * UNKNOWN after dispatched-write cancellation is preserved from composition. */
export function createHttpsAuthenticatedFinancialIntakeRoute(
  config: HttpsFinancialIntakeRouteConfig,
) {
  const reserved = [
    '/healthz',
    '/readyz',
    '/auth',
    '/storage',
    '/api/public',
    '/season1',
    '/world-data',
  ];
  if (
    config.path !== AUTHENTICATED_FINANCIAL_INTAKE_PATH ||
    !/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(config.path) ||
    config.path.startsWith('/local/') ||
    reserved.some(
      (p) => config.path === p || config.path.startsWith(p + '/'),
    ) ||
    config.path.length > 256
  )
    throw new Error('FINANCIAL_INTAKE_ROUTE_INVALID');
  const path = config.path,
    origins = new Set(config.allowedOrigins);
  if (origins.size === 0 || [...origins].some((o) => !httpsOrigin(o)))
    throw new Error('FINANCIAL_INTAKE_ORIGINS_INVALID');
  const composition = createAuthenticatedFinancialIntakeComposition(
    config.composition,
  );
  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    if (req.url !== path) return false;
    const failure = (status: number, code: string) =>
      reply(res, status, {
        schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
        requestId: fallbackId,
        ok: false,
        error: { code, retryable: false },
      });
    res.setHeader('vary', 'Origin');
    const origin = header(req, 'origin');
    if (!origin || !origins.has(origin)) {
      failure(403, 'ORIGIN_DENIED');
      return true;
    }
    res.setHeader('access-control-allow-origin', origin);
    if (req.method === 'OPTIONS') {
      const method = header(req, 'access-control-request-method'),
        requested = header(req, 'access-control-request-headers');
      if (
        method !== 'POST' ||
        (req.headers['access-control-request-headers'] !== undefined &&
          (!requested ||
            requested
              .split(',')
              .some(
                (h) =>
                  !['authorization', 'content-type'].includes(
                    h.trim().toLowerCase(),
                  ),
              )))
      ) {
        failure(403, 'PREFLIGHT_DENIED');
        return true;
      }
      res.setHeader(
        'vary',
        'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      );
      res.writeHead(204, {
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'Authorization, Content-Type',
        'cache-control': 'private, no-store',
        connection: 'close',
      });
      res.end();
      return true;
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST, OPTIONS');
      failure(405, 'METHOD_NOT_ALLOWED');
      return true;
    }
    const authorization = header(req, 'authorization');
    if (
      !authorization ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9._~-]+$/u.test(authorization)
    ) {
      failure(401, 'AUTHENTICATION_REQUIRED');
      return true;
    }
    if (req.headers.cookie !== undefined) {
      failure(403, 'COOKIE_NOT_SUPPORTED');
      return true;
    }
    const mime = header(req, 'content-type');
    if (
      !mime ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(mime) ||
      req.headers['content-encoding'] !== undefined
    ) {
      failure(415, 'UNSUPPORTED_MEDIA_TYPE');
      return true;
    }
    const length = req.headers['content-length'];
    if (
      length !== undefined &&
      (typeof length !== 'string' || !/^\d{1,20}$/u.test(length))
    ) {
      failure(400, 'INVALID_REQUEST');
      return true;
    }
    if (typeof length === 'string' && BigInt(length) > 16384n) {
      failure(413, 'REQUEST_TOO_LARGE');
      return true;
    }
    const controller = new AbortController(),
      disconnected = () =>
        controller.abort(new TransportFailure(499, 'CANCELLED'));
    req.once('aborted', disconnected);
    res.once('close', disconnected);
    const bodyTimer = setTimeout(
      () => controller.abort(new TransportFailure(408, 'BODY_TIMEOUT')),
      5000,
    );
    const requestTimer = setTimeout(
      () => controller.abort(new TransportFailure(504, 'UPSTREAM_UNAVAILABLE')),
      10000,
    );
    try {
      if (req.aborted || res.destroyed) disconnected();
      const request = await json(req, controller.signal);
      clearTimeout(bodyTimer);
      const result = await composition.handle({
        authorization,
        request,
        signal: controller.signal,
      });
      reply(res, result.httpStatus, result.body);
    } catch (error) {
      const safe =
        error instanceof TransportFailure
          ? error
          : new TransportFailure(503, 'UPSTREAM_UNAVAILABLE');
      if (safe.code !== 'CANCELLED') failure(safe.status, safe.code);
    } finally {
      clearTimeout(bodyTimer);
      clearTimeout(requestTimer);
      req.off('aborted', disconnected);
      res.off('close', disconnected);
      controller.abort();
    }
    return true;
  };
}
