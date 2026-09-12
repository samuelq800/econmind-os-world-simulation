import { parseWorldReadRequest, type WorldProjectionDto } from './contracts.js';
import {
  verifySupabaseJwtClaims,
  type JwtClaimsPolicy,
  type JwtSignatureVerifier,
} from './identity.js';
import {
  readEntitledWorldProjection,
  type MinimumProjectionWatermark,
  type ParameterizedPgReadExecutor,
} from './postgres-read-adapter.js';
import { WorldReadFailure } from './transport.js';

const MAX_AUTHORIZATION_HEADER_BYTES = 8 * 1024;

/** The server never replays a database read after authentication succeeds. */
export const SERVER_WORLD_READ_RETRY_MODE = 'CALLER_RETRY_ONLY' as const;

export interface AuthenticatedWorldReadPolicy {
  readonly jwt: JwtClaimsPolicy;
  readonly timeoutMs: number;
}

function protocol(message: string): never {
  throw new WorldReadFailure('PROTOCOL_ERROR', message, false);
}

function authenticationRequired(): never {
  throw new WorldReadFailure(
    'AUTHENTICATION_REQUIRED',
    'Bearer authentication is required',
    false,
  );
}

function authenticationInvalid(): never {
  throw new WorldReadFailure(
    'AUTHENTICATION_INVALID',
    'Bearer authentication is invalid',
    false,
  );
}

function parseBearerAuthorization(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    authenticationRequired();
  }
  if (
    Buffer.byteLength(value, 'utf8') > MAX_AUTHORIZATION_HEADER_BYTES ||
    !/^Bearer [A-Za-z0-9._~-]+$/u.test(value)
  ) {
    authenticationInvalid();
  }
  return value.slice('Bearer '.length);
}

function timeoutMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 30_000) {
    protocol('Server read timeout must be an integer from 1 to 30000');
  }
  return value;
}

/**
 * Server-only entry point for future World-read routes. It accepts raw request
 * data and an Authorization header, verifies the JWT before exposing `sub` to
 * the entitlement query, and bounds the full verification-plus-read lifetime.
 */
export async function executeAuthenticatedWorldProjectionRead(input: {
  readonly authorization: unknown;
  readonly executor: ParameterizedPgReadExecutor;
  readonly minimumWatermark?: MinimumProjectionWatermark;
  readonly policy: AuthenticatedWorldReadPolicy;
  readonly request: unknown;
  readonly signal?: AbortSignal;
  readonly verifier: JwtSignatureVerifier;
}): Promise<WorldProjectionDto | null> {
  const request = (() => {
    try {
      return parseWorldReadRequest(input.request);
    } catch {
      protocol('World read request is invalid');
    }
  })();
  const token = parseBearerAuthorization(input.authorization);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (input.signal?.aborted) controller.abort();
  else input.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs(input.policy.timeoutMs));
  try {
    if (controller.signal.aborted) {
      throw new WorldReadFailure('CANCELLED', 'World read cancelled', false);
    }
    const claims = await verifySupabaseJwtClaims({
      token,
      verifier: input.verifier,
      policy: input.policy.jwt,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      throw new WorldReadFailure('CANCELLED', 'World read cancelled', false);
    }
    return await readEntitledWorldProjection({
      executor: input.executor,
      authSubject: claims.authSubject,
      request,
      ...(input.minimumWatermark === undefined
        ? {}
        : { minimumWatermark: input.minimumWatermark }),
      signal: controller.signal,
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw new WorldReadFailure('CANCELLED', 'World read cancelled', false);
    }
    if (timedOut) {
      throw new WorldReadFailure('TIMEOUT', 'World read timed out', true);
    }
    if (error instanceof WorldReadFailure) throw error;
    return authenticationInvalid();
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', cancel);
  }
}
