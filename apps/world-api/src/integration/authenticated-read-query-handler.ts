import {
  parseWorldReadRequest,
  type WorldReadResponseEnvelope,
} from './contracts.js';
import {
  executeAuthenticatedWorldProjectionRead,
  type AuthenticatedWorldReadPolicy,
} from './authenticated-read-boundary.js';
import type {
  MinimumProjectionWatermark,
  ParameterizedPgReadExecutor,
} from './postgres-read-adapter.js';
import type { JwtSignatureVerifier } from './identity.js';
import { WorldReadFailure } from './transport.js';

export interface AuthenticatedWorldReadQueryInput {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly minimumWatermark?: MinimumProjectionWatermark;
  readonly signal?: AbortSignal;
}

export interface AuthenticatedWorldReadQueryHandler {
  /**
   * HTTP-neutral server handler for the V10.1 World read operation. Runtime
   * wiring must inject its managed PostgreSQL executor and JWT verifier; this
   * handler never creates a connection or accepts browser-supplied identity.
   */
  handle(
    input: AuthenticatedWorldReadQueryInput,
  ): Promise<WorldReadResponseEnvelope>;
}

function protocol(message: string): never {
  throw new WorldReadFailure('PROTOCOL_ERROR', message, false);
}

function errorResponse(input: {
  readonly requestId: string;
  readonly error: WorldReadFailure;
}): WorldReadResponseEnvelope {
  return Object.freeze({
    schemaVersion: 'world-read-api-v1' as const,
    requestId: input.requestId,
    ok: false as const,
    error: Object.freeze({
      code: input.error.code,
      message: input.error.message,
      retryable: input.error.retryable,
    }),
  });
}

function unexpectedFailure(): WorldReadFailure {
  return new WorldReadFailure('UNKNOWN', 'World read failed', false);
}

/**
 * Installs the actual V10.1 query-operation boundary without installing a
 * network route, a database connection, or a JWT implementation. Those
 * production-owned dependencies must be supplied by the server runtime.
 */
export function createAuthenticatedWorldReadQueryHandler(input: {
  readonly executor: ParameterizedPgReadExecutor;
  readonly policy: AuthenticatedWorldReadPolicy;
  readonly verifier: JwtSignatureVerifier;
}): Readonly<AuthenticatedWorldReadQueryHandler> {
  return Object.freeze({
    async handle(requestInput: AuthenticatedWorldReadQueryInput) {
      let request;
      try {
        request = parseWorldReadRequest(requestInput.request);
      } catch {
        protocol('World read request is invalid');
      }

      try {
        const projection = await executeAuthenticatedWorldProjectionRead({
          authorization: requestInput.authorization,
          executor: input.executor,
          policy: input.policy,
          request,
          ...(requestInput.minimumWatermark === undefined
            ? {}
            : { minimumWatermark: requestInput.minimumWatermark }),
          ...(requestInput.signal === undefined
            ? {}
            : { signal: requestInput.signal }),
          verifier: input.verifier,
        });
        if (projection === null) {
          return errorResponse({
            requestId: request.requestId,
            error: new WorldReadFailure(
              'NOT_FOUND',
              'World projection is unavailable',
              false,
            ),
          });
        }
        return Object.freeze({
          schemaVersion: 'world-read-api-v1' as const,
          requestId: request.requestId,
          ok: true as const,
          data: projection,
        });
      } catch (error) {
        return errorResponse({
          requestId: request.requestId,
          error:
            error instanceof WorldReadFailure ? error : unexpectedFailure(),
        });
      }
    },
  });
}
