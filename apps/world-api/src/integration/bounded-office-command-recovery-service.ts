/** Actual final receipt recovery through the existing intake metadata role,
 * in READ ONLY verified-subject transactions. No canonical seed hydration,
 * economic writer, caller scope authority or receipt synthesis. */
import {
  DomainError,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  canonicalSerialize,
  type AuthenticatedCommandRecoveryResponseDto,
} from '@econmind/core';
import {
  OFFICE_COMMAND_CURRENT_BINDING_QUERY,
  manualOfficeCommandCapability,
} from '@econmind/world-worker/office-command-intake';
import { createBoundedOfficeCommandBindingProvider } from './bounded-office-command-binding.js';
import { createPostgresServerReadBindingSnapshotReader } from './postgres-server-read-binding.js';
import { readManualRecoveryFrom } from './authenticated-command-recovery-reader.js';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';
import {
  parseRecoveryRequest,
  bearer,
} from '../runtime-preparation/bounded-executor-transport.js';
import type { AuthenticatedOfficeCommandServiceConfig } from './authenticated-office-command-service.js';

export const POSTWAR_OFFICE_RECOVERY_BINDING_READ_QUERY =
  'select * from world_v2.read_postwar_office_recovery_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
/** Legacy metadata readers retain their existing SQL/proposal dependencies. */
export function boundedOfficeRecoveryBindingQuery(
  mode: AuthenticatedOfficeCommandServiceConfig['recoveryBindingMode'],
): string {
  if (mode === 'POSTWAR_CAPTAIN_READ_ONLY_V1')
    return 'select * from world_v2.read_postwar_captain_recovery_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
  return mode === 'POSTWAR_READ_ONLY_V1'
    ? POSTWAR_OFFICE_RECOVERY_BINDING_READ_QUERY
    : OFFICE_COMMAND_CURRENT_BINDING_QUERY;
}

export function createBoundedOfficeCommandRecoveryService(
  config: AuthenticatedOfficeCommandServiceConfig | null = null,
) {
  const c = config
    ? {
        ...config,
        admittedWorldPins: Object.freeze({ ...config.admittedWorldPins }),
        auth: Object.freeze({ ...config.auth }),
      }
    : null;
  const binding = c
    ? createBoundedOfficeCommandBindingProvider({
        pool: c.readPool,
        readerRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const snapshot = c
    ? createPostgresServerReadBindingSnapshotReader({
        pool: c.writerPool,
        readerRole: c.writerRole,
      })
    : null;
  const verifier = c ? createSupabaseJwksSignatureVerifier(c.auth) : null;
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
      if (!c || !binding || !snapshot || !verifier)
        return fail(503, 'NOT_CONNECTED');
      const signal = input.signal ?? new AbortController().signal;
      try {
        const request = parseRecoveryRequest(input.request);
        requestId = request.requestId;
        if (request.request.worldId !== c.admittedWorldPins.worldId)
          return fail(403, 'CURRENT_SEAT_OR_ADMISSION_REQUIRED');
        const claims = await verifySupabaseJwtClaims({
          token: bearer(input.authorization).slice(7),
          verifier,
          policy: {
            expectedIssuer: c.auth.expectedIssuer,
            expectedAudience: c.auth.audience,
            nowEpochSeconds: Math.floor(Date.now() / 1000),
          },
          signal,
        });
        const original = request.request.originalRequest.request;
        const selector = {
          verifiedSubject: claims.authSubject,
          worldId: request.request.worldId,
          projectionSelector: {
            classification: 'OFFICE_PRIVATE',
            scopeKey: `OFFICE_${Buffer.from(original.countryId).toString('hex').toUpperCase()}_${Buffer.from(original.officeId).toString('hex').toUpperCase()}`,
          },
          finalSelector: null,
          signal,
        };
        const before = await binding.resolve(selector),
          pins = c.admittedWorldPins;
        if (
          !before ||
          before.identity.authSubjectId !== claims.authSubject ||
          before.identity.countryId !== original.countryId ||
          before.identity.officeId !== original.officeId ||
          before.seed.seedRef !== pins.seedRef ||
          before.seed.contentHash !== pins.contentHash ||
          before.seed.admissionRef !== pins.admissionRef ||
          BigInt(before.readback.worldVersion) <
            BigInt(pins.minimumWorldVersion)
        )
          return fail(403, 'CURRENT_SEAT_OR_ADMISSION_REQUIRED');
        const result = await snapshot.withReadOnlyExecutor(
          {
            verifiedSubject: claims.authSubject,
            worldId: request.request.worldId,
            signal,
          },
          async (tx) => {
            const capability = manualOfficeCommandCapability(original);
            const args = [
              request.request.worldId,
              claims.authSubject,
              original.countryId,
              original.officeId,
              before.seatRef,
              before.identity.authorizationRevision,
              capability,
              before.identity.scopeKey,
            ];
            const current = await tx.query<Record<string, string>>(
              boundedOfficeRecoveryBindingQuery(c.recoveryBindingMode),
              args,
            );
            const actual = current.rows[0];
            if (
              current.rows.length !== 1 ||
              !actual ||
              actual.seat_ref !== before.seatRef ||
              actual.authorization_version !==
                before.identity.authorizationRevision ||
              actual.admission_ref !== before.seed.admissionRef ||
              actual.seed_fingerprint !== before.seed.contentHash ||
              actual.seed_id !== before.seed.seedRef ||
              actual.model_version !== before.identity.modelVersion ||
              actual.world_version !== before.readback.worldVersion ||
              actual.event_sequence !== before.readback.eventSequence
            )
              return { status: 'DENIED' as const };
            return {
              status: 'READ' as const,
              state: await readManualRecoveryFrom(
                tx,
                request.request,
                before,
                signal,
              ),
            };
          },
        );
        if (result?.status === 'DENIED')
          return fail(403, 'CURRENT_BINDING_CHANGED');
        if (!result) return fail(503, 'UPSTREAM_UNAVAILABLE', true);
        const after = await binding.resolve(selector);
        if (!after || canonicalSerialize(before) !== canonicalSerialize(after))
          return fail(403, 'CURRENT_BINDING_CHANGED');
        return result.state
          ? {
              httpStatus: 200,
              body: {
                schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
                requestId,
                ok: true,
                state: result.state,
              },
            }
          : fail(404, 'NOT_FOUND');
      } catch (error) {
        if (signal.aborted) return fail(499, 'CANCELLED');
        if (error instanceof DomainError)
          return fail(
            error.code === 'AUTHORIZATION_DENIED'
              ? 403
              : error.code === 'IDEMPOTENCY_CONFLICT'
                ? 409
                : 400,
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
