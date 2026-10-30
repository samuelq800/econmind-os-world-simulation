import {
  AUTHENTICATED_CURRENT_SEAT_PATH,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';
import {
  createPostwarOfficeRuntimeReadService,
  POSTWAR_OFFICE_RUNTIME_SCHEMA,
} from '../integration/postwar-office-runtime-read-service.js';
import {
  explicitReadConfig,
  type ExplicitReadPreparationConfig,
} from './explicit-read-preparation-config.js';
import { RequestCompletion } from './request-completion.js';
import {
  ZERO_REQUEST_ID,
  ExecutorTransportError,
  awaitTransport,
  bearer,
  boundedBytes,
  jsonBytes,
  record,
  requestBudget,
  responseJson,
  uuid,
} from './bounded-executor-transport.js';

export const POSTWAR_OFFICE_RUNTIME_READ_PATH =
  '/v1/postwar-office-runtime' as const;

/** Borrowed managed read pool only. No pool startup/ownership, environment
 * lookup, write command, source grant or production mount. */
function createBoundedPostwarFetchHandler(
  config: ExplicitReadPreparationConfig | null,
  target: 'OFFICE_PAGE' | 'CURRENT_SEAT',
) {
  const path =
    target === 'OFFICE_PAGE'
      ? POSTWAR_OFFICE_RUNTIME_READ_PATH
      : AUTHENTICATED_CURRENT_SEAT_PATH;
  const schema =
    target === 'OFFICE_PAGE'
      ? POSTWAR_OFFICE_RUNTIME_SCHEMA
      : AUTHENTICATED_CURRENT_SEAT_SCHEMA;
  const c = explicitReadConfig(config);
  if (
    c &&
    (c.endpointPins.projectionPath !== POSTWAR_OFFICE_RUNTIME_READ_PATH ||
      c.endpointPins.finalLookupPath === POSTWAR_OFFICE_RUNTIME_READ_PATH ||
      c.endpointPins.finalLookupPath === AUTHENTICATED_CURRENT_SEAT_PATH)
  )
    throw new TypeError('POSTWAR_READ_ENDPOINT_PINS_INVALID');
  const service = c ? createPostwarOfficeRuntimeReadService(c) : null;
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (
      url.pathname !== path ||
      url.search ||
      url.hash ||
      request.url !== url.origin + path
    )
      return null;
    let requestId = ZERO_REQUEST_ID;
    const origin = request.headers.get('origin') ?? undefined;
    const fail = (status: number, code: string) =>
      responseJson(
        status,
        {
          schemaVersion: schema,
          requestId,
          ok: false,
          error: { code, retryable: false },
        },
        c && origin && c.routeOptions.allowedOrigins.includes(origin)
          ? origin
          : undefined,
      );
    if (!c || !service) return fail(503, 'NOT_CONNECTED');
    if (origin && !c.routeOptions.allowedOrigins.includes(origin))
      return fail(403, 'ORIGIN_DENIED');
    if (request.method === 'OPTIONS') {
      const asked = (
        request.headers.get('access-control-request-headers') ?? ''
      )
        .toLowerCase()
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (
        !origin ||
        request.headers.get('access-control-request-method') !== 'POST' ||
        asked.some(
          (value) => !['authorization', 'content-type'].includes(value),
        )
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
          const parsed = jsonBytes(
            await boundedBytes(request, 16384, budget.signal, true),
          );
          const value = record(parsed);
          if (value && uuid(value.requestId)) requestId = value.requestId;
          const input = {
            authorization,
            request: parsed,
            signal: budget.signal,
          };
          const result =
            target === 'OFFICE_PAGE'
              ? await awaitTransport(service.handle(input), budget.signal)
              : await awaitTransport(
                  service.handleCurrentSeat(input),
                  budget.signal,
                );
          return responseJson(result.httpStatus, result.body, origin);
        } catch (error) {
          if (error instanceof ExecutorTransportError)
            return fail(error.status, error.code);
          if (
            error instanceof Error &&
            error.message === 'AUTHENTICATION_INVALID'
          )
            return fail(401, 'AUTHENTICATION_INVALID');
          if (error instanceof Error && error.message === 'INVALID_REQUEST')
            return fail(400, 'INVALID_REQUEST');
          return fail(503, 'UPSTREAM_UNAVAILABLE');
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

/** Explicit bounded office page read. */
export function createPostwarOfficeRuntimeFetchHandler(
  config: ExplicitReadPreparationConfig | null = null,
) {
  return createBoundedPostwarFetchHandler(config, 'OFFICE_PAGE');
}
/** Same existing URL/schema; metadata-only Native header hydration. */
export function createPostwarCurrentSeatFetchHandler(
  config: ExplicitReadPreparationConfig | null = null,
) {
  return createBoundedPostwarFetchHandler(config, 'CURRENT_SEAT');
}
