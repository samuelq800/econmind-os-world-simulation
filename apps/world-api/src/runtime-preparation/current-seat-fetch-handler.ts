import {
  AUTHENTICATED_CURRENT_SEAT_PATH,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';
import { createAuthenticatedCurrentSeatService } from '../integration/authenticated-current-seat-service.js';
import {
  explicitReadConfig,
  type ExplicitReadPreparationConfig,
} from './explicit-read-preparation-config.js';
import { RequestCompletion } from './request-completion.js';
import {
  ZERO_REQUEST_ID,
  ExecutorTransportError,
  bearer,
  requestBudget,
  boundedBytes,
  jsonBytes,
  parseCurrentSeatRequest,
  responseJson,
} from './bounded-executor-transport.js';

/** Unmounted read-only Fetch adapter. It borrows the managed reader pool and
 * waits for actual outstanding work; it does not own or end that shared pool. */
export function createCurrentSeatFetchHandler(
  config: ExplicitReadPreparationConfig | null = null,
) {
  const c = explicitReadConfig(config);
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (
      url.pathname !== AUTHENTICATED_CURRENT_SEAT_PATH ||
      url.search ||
      url.hash ||
      request.url !== url.origin + AUTHENTICATED_CURRENT_SEAT_PATH
    )
      return null;
    let requestId = ZERO_REQUEST_ID;
    const origin = request.headers.get('origin') ?? undefined;
    const fail = (status: number, code: string) =>
      responseJson(
        status,
        {
          schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
          requestId,
          ok: false,
          error: { code, retryable: false },
        },
        c && origin && c.routeOptions.allowedOrigins.includes(origin)
          ? origin
          : undefined,
      );
    if (!c) return fail(503, 'NOT_CONNECTED');
    if (origin && !c.routeOptions.allowedOrigins.includes(origin))
      return fail(403, 'ORIGIN_DENIED');
    if (request.method === 'OPTIONS') {
      const asked = (
        request.headers.get('access-control-request-headers') ?? ''
      )
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        !origin ||
        request.headers.get('access-control-request-method') !== 'POST' ||
        asked.some((s) => !['authorization', 'content-type'].includes(s))
      )
        return fail(403, 'CORS_DENIED');
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          vary: 'Origin',
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'authorization, content-type',
          'cache-control': 'private, no-store',
        },
      });
    }
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
    const budget = requestBudget(request.signal),
      completion = new RequestCompletion();
    let response: Response,
      cleanupExceeded = false;
    try {
      response = await completion.run(async () => {
        try {
          if (
            request.headers
              .get('content-type')
              ?.split(';')[0]
              ?.trim()
              .toLowerCase() !== 'application/json' ||
            request.headers.has('content-encoding')
          )
            throw new ExecutorTransportError(415, 'INVALID_REQUEST');
          const authorization = bearer(request.headers.get('authorization'));
          const parsed = parseCurrentSeatRequest(
            jsonBytes(await boundedBytes(request, 2048, budget.signal, true)),
          );
          requestId = parsed.requestId;
          const result = await createAuthenticatedCurrentSeatService(c).handle({
            authorization,
            request: parsed,
            signal: budget.signal,
          });
          return responseJson(result.httpStatus, result.body, origin);
        } catch (error) {
          return fail(
            error instanceof ExecutorTransportError
              ? error.status
              : error instanceof Error &&
                  error.message === 'AUTHENTICATION_INVALID'
                ? 401
                : 400,
            error instanceof ExecutorTransportError
              ? error.code
              : error instanceof Error &&
                  error.message === 'AUTHENTICATION_INVALID'
                ? 'AUTHENTICATION_INVALID'
                : 'INVALID_REQUEST',
          );
        }
      });
    } finally {
      budget.abort();
      const tail = setTimeout(() => {
        cleanupExceeded = true;
      }, 5000);
      try {
        await completion.drain();
      } finally {
        clearTimeout(tail);
        budget.close();
      }
    }
    return cleanupExceeded || completion.cleanupFailed()
      ? fail(503, 'UPSTREAM_UNAVAILABLE')
      : response!;
  };
}
