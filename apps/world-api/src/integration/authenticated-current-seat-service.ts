import {
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
  type AuthenticatedCurrentSeatResponseDto,
} from '@econmind/core';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';
import {
  createAuthenticatedCurrentSeatReader,
  CurrentSeatReadError,
} from './authenticated-current-seat-reader.js';
import {
  explicitReadConfig,
  matchesReadPins,
  type ExplicitReadPreparationConfig,
} from '../runtime-preparation/explicit-read-preparation-config.js';
import {
  parseCurrentSeatRequest,
  bearer,
} from '../runtime-preparation/bounded-executor-transport.js';
import { trackRequestCompletion } from '../runtime-preparation/request-completion.js';
export function createAuthenticatedCurrentSeatService(
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
      body: AuthenticatedCurrentSeatResponseDto;
    }> {
      let requestId = '00000000-0000-4000-8000-000000000000';
      const fail = (httpStatus: number, code: string, retryable = false) => ({
        httpStatus,
        body: {
          schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
          requestId,
          ok: false as const,
          error: { code, retryable },
        },
      });
      if (!c) return fail(503, 'NOT_CONNECTED');
      try {
        const request = parseCurrentSeatRequest(input.request);
        requestId = request.requestId;
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
        const signal = input.signal ?? new AbortController().signal;
        const bindings = await trackRequestCompletion(
          createAuthenticatedCurrentSeatReader(c).read({
            verifiedSubject: claims.authSubject,
            worldId: c.admittedWorldPins.worldId,
            signal,
          }),
        );
        if (!bindings?.length || bindings.some((b) => !matchesReadPins(b, c)))
          return fail(503, 'READ_BINDING_UNAVAILABLE');
        return {
          httpStatus: 200,
          body: {
            schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
            requestId,
            ok: true,
            session: {
              authSubjectId: claims.authSubject,
              issuedAtEpochSeconds: claims.issuedAtEpochSeconds,
              expiresAtEpochSeconds: claims.expiresAtEpochSeconds,
            },
            world: c.admittedWorldPins,
            bindings,
          },
        };
      } catch (error) {
        if (input.signal?.aborted) return fail(499, 'CANCELLED');
        if (error instanceof CurrentSeatReadError)
          return fail(
            ['READ_BINDING_UNAVAILABLE', 'NOT_CONNECTED'].includes(error.code)
              ? 503
              : error.code === 'CURRENT_AUTHORIZATION_NOT_COHERENT'
                ? 409
                : 403,
            error.code,
          );
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
