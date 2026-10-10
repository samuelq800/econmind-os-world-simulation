import type { Pool } from 'pg';
import {
  createAuthenticatedOfficeCommandService,
  type AuthenticatedOfficeCommandServiceConfig,
} from '../integration/authenticated-office-command-service.js';
import {
  createAuthenticatedFinancialIntakeComposition,
  type AuthenticatedFinancialIntakeCompositionConfig,
} from '../integration/authenticated-financial-intake-composition.js';
import { createAuthenticatedCommandRecoveryService } from '../integration/authenticated-command-recovery-service.js';
import { createNonactivatedRuntimeApiHost } from '../integration/nonactivated-runtime-api-host.js';
import {
  explicitReadConfig,
  type ExplicitReadPreparationConfig,
} from './explicit-read-preparation-config.js';
import {
  RequestCompletion,
  trackRequestCompletion,
} from './request-completion.js';
import {
  EXECUTOR_PATHS,
  TRANSPORT_VERSION,
  ZERO_REQUEST_ID,
  ExecutorTransportError,
  bearer,
  requestBudget,
  boundedBytes,
  jsonBytes,
  parseForwardRequest,
  transportFailure,
  responseJson,
  type ExecutorPublicPath,
} from './bounded-executor-transport.js';
export interface InternalExecutorCommandConfig {
  readonly read: ExplicitReadPreparationConfig;
  readonly office: AuthenticatedOfficeCommandServiceConfig | null;
  readonly financial: AuthenticatedFinancialIntakeCompositionConfig | null;
  /** Actual per-request owned pools, never a caller's shared lifetime.
   * The config is single-use; no env discovery, pool or production issuer. */
  readonly ownedPools: readonly Pool[];
}
/** Standard Fetch handler, intentionally unmounted. This slice cannot construct
 * a production registry/consumer. Positive Office ports retain the real old
 * local/CI private identity; production construction remains a later slice. */
export function createInternalExecutorCommandHandler(
  config: InternalExecutorCommandConfig | null = null,
) {
  const read = explicitReadConfig(config?.read ?? null);
  const copy = <C extends AuthenticatedFinancialIntakeCompositionConfig>(
    value: C | null,
  ): C | null =>
    value
      ? Object.freeze({
          ...value,
          auth: Object.freeze({ ...value.auth }),
          admittedWorldPins: Object.freeze({ ...value.admittedWorldPins }),
        })
      : null;
  const office = copy(config?.office ?? null),
    financial = copy(config?.financial ?? null),
    ownedPools = Object.freeze([...(config?.ownedPools ?? [])]);
  let used = false;
  if (config && read) {
    const required = [
      read.pool,
      ...(config.office
        ? [config.office.readPool, config.office.writerPool]
        : []),
      ...(config.financial
        ? [config.financial.readPool, config.financial.writerPool]
        : []),
    ];
    if (
      required.some((p) => !ownedPools.includes(p as Pool)) ||
      ownedPools.some((p) => typeof p.end !== 'function')
    )
      throw new TypeError('EXECUTOR_POOL_OWNERSHIP_REQUIRED');
    createNonactivatedRuntimeApiHost({
      modelVersion: read.modelVersion,
      read,
      office: config.office
        ? {
            path: '/v1/office-command',
            allowedOrigins: read.routeOptions.allowedOrigins,
            composition: config.office,
          }
        : null,
      financial: config.financial
        ? {
            path: '/v1/financial-intake',
            allowedOrigins: read.routeOptions.allowedOrigins,
            composition: config.financial,
          }
        : null,
    });
  }
  return async function internal(request: Request): Promise<Response> {
    const key = (Object.entries(EXECUTOR_PATHS).find(
      ([, value]) => request.url === value,
    )?.[0] ?? null) as ExecutorPublicPath | null;
    if (!key) return responseJson(404, { status: 'NOT_FOUND' });
    if (!config || !read)
      return transportFailure(key, ZERO_REQUEST_ID, 503, 'NOT_CONNECTED');
    if (used)
      return transportFailure(
        key,
        ZERO_REQUEST_ID,
        503,
        'REQUEST_CONTEXT_RETIRED',
      );
    used = true;
    const completion = new RequestCompletion();
    let requestId = ZERO_REQUEST_ID,
      response: Response | undefined,
      cleanupExceeded = false;
    const supplied = request.headers.get('x-econmind-deadline-ms');
    const valid =
      supplied !== null &&
      /^[1-9]\d{0,15}$/u.test(supplied) &&
      Number.isSafeInteger(Number(supplied));
    const budget = requestBudget(
      request.signal,
      valid ? Number(supplied) : Date.now() - 1,
    );
    try {
      response = await completion.run(async () => {
        try {
          if (request.method !== 'POST')
            throw new ExecutorTransportError(405, 'METHOD_NOT_ALLOWED');
          if (
            request.headers.get('x-econmind-forward-version') !==
              TRANSPORT_VERSION ||
            !valid
          )
            throw new ExecutorTransportError(400, 'INVALID_REQUEST');
          if (budget.signal.aborted) throw budget.signal.reason;
          const origin = request.headers.get('origin');
          if (origin && !read.routeOptions.allowedOrigins.includes(origin))
            throw new ExecutorTransportError(403, 'ORIGIN_DENIED');
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
              key === '/v1/command-recovery' ? 32768 : 16384,
              budget.signal,
              true,
            ),
            parsed = parseForwardRequest(key, jsonBytes(raw));
          requestId = parsed.requestId;
          const service =
            key === '/v1/office-command'
              ? createAuthenticatedOfficeCommandService(office)
              : key === '/v1/financial-intake'
                ? createAuthenticatedFinancialIntakeComposition(financial)
                : createAuthenticatedCommandRecoveryService(read);
          const result = await service.handle({
            authorization,
            request: parsed,
            signal: budget.signal,
          });
          return responseJson(result.httpStatus, { ...result.body, requestId });
        } catch (error) {
          return transportFailure(
            key,
            requestId,
            error instanceof ExecutorTransportError ? error.status : 400,
            error instanceof ExecutorTransportError
              ? error.code
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
        const closing = [...new Set(ownedPools)].map((pool) =>
          trackRequestCompletion(Promise.resolve().then(() => pool.end())),
        );
        const closed = await Promise.allSettled(closing);
        if (closed.some((r) => r.status === 'rejected')) cleanupExceeded = true;
        await completion.drain();
      } finally {
        clearTimeout(tail);
        budget.close();
      }
    }
    if (cleanupExceeded || completion.cleanupFailed()) {
      if (key === '/v1/financial-intake' && response) {
        const b = (await response.clone().json()) as {
          state?: { status?: string };
        };
        if (b.state?.status === 'UNKNOWN') return response;
      }
      return transportFailure(
        key,
        requestId,
        503,
        key === '/v1/command-recovery'
          ? 'UPSTREAM_UNAVAILABLE'
          : 'WRITE_OUTCOME_UNKNOWN',
      );
    }
    return response!;
  };
}
