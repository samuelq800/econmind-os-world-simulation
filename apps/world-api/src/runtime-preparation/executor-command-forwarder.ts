import { createSupabaseJwksSignatureVerifier } from '../integration/supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from '../integration/identity.js';
import {
  snapshotServerMetadata,
  type ExplicitServerMetadata,
} from './explicit-read-preparation-config.js';
import {
  RequestCompletion,
  trackRequestCleanup,
} from './request-completion.js';
import {
  EXECUTOR_PATHS,
  TRANSPORT_VERSION,
  ZERO_REQUEST_ID,
  ExecutorTransportError,
  record,
  bearer,
  requestBudget,
  boundedBytes,
  jsonBytes,
  parseForwardRequest,
  awaitTransport,
  validateReply,
  transportFailure,
  responseJson,
  type ExecutorPublicPath,
} from './bounded-executor-transport.js';
export interface WorldExecutorServiceBinding {
  fetch(request: Request): Promise<Response>;
}
export interface ExecutorCommandForwarderConfig extends ExplicitServerMetadata {
  readonly executor: WorldExecutorServiceBinding;
}
/** Unmounted server transport. Only a fixed service binding carries original
 * bytes/bearer; neither metadata nor an upstream response is a readiness proof. */
export function createExecutorCommandForwarder(
  config: ExecutorCommandForwarderConfig | null = null,
) {
  const c =
    config && typeof config.executor?.fetch === 'function'
      ? snapshotServerMetadata({
          ...config,
          executor: Object.freeze({
            fetch: config.executor.fetch.bind(config.executor),
          }),
        })
      : null;
  return async function forward(request: Request): Promise<Response | null> {
    const url = new URL(request.url),
      path = url.pathname as ExecutorPublicPath;
    if (
      !Object.hasOwn(EXECUTOR_PATHS, path) ||
      url.search ||
      url.hash ||
      request.url !== url.origin + path
    )
      return null;
    if (!c)
      return transportFailure(path, ZERO_REQUEST_ID, 503, 'NOT_CONNECTED');
    const origin = request.headers.get('origin') ?? undefined;
    if (origin && !c.routeOptions.allowedOrigins.includes(origin))
      return transportFailure(path, ZERO_REQUEST_ID, 403, 'ORIGIN_DENIED');
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
        return transportFailure(path, ZERO_REQUEST_ID, 403, 'CORS_DENIED');
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
    if (request.method !== 'POST')
      return transportFailure(
        path,
        ZERO_REQUEST_ID,
        405,
        'METHOD_NOT_ALLOWED',
        origin,
      );
    const budget = requestBudget(request.signal),
      completion = new RequestCompletion();
    let requestId = ZERO_REQUEST_ID,
      dispatched = false,
      reply: Response,
      cleanupExceeded = false;
    try {
      reply = await completion.run(async () => {
        let upstream: Response | undefined;
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
          const raw = await boundedBytes(
            request,
            path === '/v1/command-recovery' ? 32768 : 16384,
            budget.signal,
            true,
          );
          const parsed = parseForwardRequest(path, jsonBytes(raw));
          requestId = parsed.requestId;
          const selected = record(parsed.request);
          if (selected?.worldId !== c.admittedWorldPins.worldId)
            throw new ExecutorTransportError(403, 'WORLD_BINDING_MISMATCH');
          const verifier = createSupabaseJwksSignatureVerifier(c.auth);
          const claims = await verifySupabaseJwtClaims({
            token: authorization.slice(7),
            verifier,
            policy: {
              expectedIssuer: c.auth.expectedIssuer,
              expectedAudience: c.auth.audience,
              nowEpochSeconds: Math.floor(Date.now() / 1000),
            },
            signal: budget.signal,
          });
          if (budget.signal.aborted) throw budget.signal.reason;
          const headers = new Headers({
            authorization: authorization,
            'content-type': 'application/json',
            'x-econmind-forward-version': TRANSPORT_VERSION,
            'x-econmind-deadline-ms': String(budget.deadline),
          });
          if (origin) headers.set('origin', origin);
          dispatched = true;
          upstream = await awaitTransport(
            c.executor
              .fetch(
                new Request(EXECUTOR_PATHS[path], {
                  method: 'POST',
                  headers,
                  body: raw,
                  signal: budget.signal,
                  redirect: 'manual',
                }),
              )
              .then(async (response) => {
                if (budget.signal.aborted) {
                  if (response.body)
                    await trackRequestCleanup(response.body.cancel());
                  throw budget.signal.reason;
                }
                return response;
              }),
            budget.signal,
          );
          if (!upstream) throw new Error('INVALID_EXECUTOR_REPLY');
          if (
            upstream.status < 200 ||
            upstream.status >= 600 ||
            (upstream.status >= 300 && upstream.status < 400) ||
            upstream.headers
              .get('content-type')
              ?.split(';')[0]
              ?.trim()
              .toLowerCase() !== 'application/json'
          )
            throw new Error('INVALID_EXECUTOR_REPLY');
          const body = jsonBytes(
            await boundedBytes(upstream, 1048576, budget.signal),
          );
          if (
            !validateReply(
              path,
              body,
              requestId,
              selected,
              claims.authSubject,
              c,
              upstream.status,
            )
          )
            throw new Error('INVALID_EXECUTOR_REPLY');
          return responseJson(upstream.status, body, origin);
        } catch (error) {
          if (dispatched && path !== '/v1/command-recovery')
            return transportFailure(
              path,
              requestId,
              503,
              'WRITE_OUTCOME_UNKNOWN',
              origin,
            );
          if (budget.signal.aborted) {
            const reason = budget.signal.reason;
            return transportFailure(
              path,
              requestId,
              reason instanceof ExecutorTransportError ? reason.status : 499,
              reason instanceof ExecutorTransportError
                ? reason.code
                : 'CANCELLED',
              origin,
            );
          }
          if (error instanceof ExecutorTransportError)
            return transportFailure(
              path,
              requestId,
              error.status,
              error.code,
              origin,
            );
          return transportFailure(
            path,
            requestId,
            error instanceof Error &&
              /JWT|SUPABASE|AUTHENTICATION/u.test(error.message)
              ? 401
              : dispatched
                ? 503
                : 400,
            error instanceof Error &&
              /JWT|SUPABASE|AUTHENTICATION/u.test(error.message)
              ? 'AUTHENTICATION_INVALID'
              : dispatched
                ? 'UPSTREAM_UNAVAILABLE'
                : 'INVALID_REQUEST',
            origin,
          );
        } finally {
          if (upstream?.body && !upstream.body.locked)
            trackRequestCleanup(upstream.body.cancel()).catch(() => undefined);
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
    if (cleanupExceeded || completion.cleanupFailed())
      return transportFailure(
        path,
        requestId,
        503,
        dispatched && path !== '/v1/command-recovery'
          ? 'WRITE_OUTCOME_UNKNOWN'
          : 'UPSTREAM_UNAVAILABLE',
        origin,
      );
    return reply!;
  };
}
