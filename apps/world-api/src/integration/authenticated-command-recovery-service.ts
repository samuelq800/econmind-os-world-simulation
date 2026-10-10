import {
  DomainError,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  type AuthenticatedCommandRecoveryResponseDto,
} from '@econmind/core';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';
import { createAuthenticatedCommandRecoveryReader } from './authenticated-command-recovery-reader.js';
import { CurrentSeatReadError } from './authenticated-current-seat-reader.js';
import {
  explicitReadConfig,
  type ExplicitReadPreparationConfig,
} from '../runtime-preparation/explicit-read-preparation-config.js';
import {
  parseRecoveryRequest,
  bearer,
} from '../runtime-preparation/bounded-executor-transport.js';
import { trackRequestCompletion } from '../runtime-preparation/request-completion.js';
export function createAuthenticatedCommandRecoveryService(
  config: ExplicitReadPreparationConfig | null = null,
) {
  const c = explicitReadConfig(config);
  return Object.freeze({
    async handle(input: {
      authorization: unknown;
      request: unknown;
      signal?: AbortSignal;
    }): Promise<{
      httpStatus: number;
      body: AuthenticatedCommandRecoveryResponseDto;
    }> {
      let requestId = '00000000-0000-4000-8000-000000000000';
      const fail = (httpStatus: number, code: string, retryable = false) => ({
        httpStatus,
        body: {
          schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
          requestId,
          ok: false as const,
          error: { code, retryable },
        },
      });
      if (!c) return fail(503, 'NOT_CONNECTED');
      try {
        const request = parseRecoveryRequest(input.request);
        requestId = request.requestId;
        if (request.request.worldId !== c.admittedWorldPins.worldId)
          return fail(403, 'CURRENT_SEAT_OR_ADMISSION_REQUIRED');
        const verifier = createSupabaseJwksSignatureVerifier(c.auth);
        const claims = await verifySupabaseJwtClaims({
          token: bearer(input.authorization).slice(7),
          verifier,
          policy: {
            expectedIssuer: c.auth.expectedIssuer,
            expectedAudience: c.auth.audience,
            nowEpochSeconds: Math.floor(Date.now() / 1000),
          },
          ...(input.signal ? { signal: input.signal } : {}),
        });
        const state = await trackRequestCompletion(
          createAuthenticatedCommandRecoveryReader(c).read({
            verifiedSubject: claims.authSubject,
            worldId: c.admittedWorldPins.worldId,
            signal: input.signal ?? new AbortController().signal,
            recovery: request.request,
            pins: c.admittedWorldPins,
            modelVersion: c.modelVersion,
          }),
        );
        return state
          ? {
              httpStatus: 200,
              body: {
                schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
                requestId,
                ok: true,
                state,
              },
            }
          : fail(404, 'NOT_FOUND');
      } catch (error) {
        if (input.signal?.aborted) return fail(499, 'CANCELLED');
        if (error instanceof CurrentSeatReadError)
          return error.code === 'NOT_CONNECTED'
            ? fail(503, 'NOT_CONNECTED')
            : fail(403, 'CURRENT_SEAT_OR_ADMISSION_REQUIRED');
        if (
          error instanceof DomainError &&
          error.code === 'IDEMPOTENCY_CONFLICT'
        )
          return fail(409, 'IDEMPOTENCY_CONFLICT');
        if (
          error instanceof Error &&
          /JWT|AUTHENTICATION|SUPABASE/u.test(error.message)
        )
          return fail(401, 'AUTHENTICATION_INVALID');
        if (error instanceof Error && error.message === 'INVALID_REQUEST')
          return fail(400, 'INVALID_REQUEST');
        return fail(503, 'UPSTREAM_UNAVAILABLE', true);
      }
    },
  });
}
