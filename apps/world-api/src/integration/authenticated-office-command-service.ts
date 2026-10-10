import { trackRequestCompletion } from '../runtime-preparation/request-completion.js';
import {
  DomainError,
  authSubject,
  canonicalSerialize,
  type AuthenticatedPrincipal,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandResponseDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  PostgresOfficeCommandIntake,
  OfficeCommandOutcomeUnknownError,
  type ManualOfficeIntakeRuntime,
  parseManualOfficeCommandRequest,
} from '@econmind/world-worker/office-command-intake';
import type { AuthenticatedFinancialIntakeCompositionConfig } from './authenticated-financial-intake-composition.js';
import type { ServerVerifiedReadBinding } from './https-authenticated-read-composition.js';
import { createPostgresServerReadBindingProvider } from './postgres-full-read-provider.js';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';

export type AuthenticatedOfficeCommandServiceConfig =
  AuthenticatedFinancialIntakeCompositionConfig & {
    readonly runtime?: ManualOfficeIntakeRuntime | null;
  };

const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    v,
  );

/** Include the actual head, not just seat/seed: a rejection must never attest
 * that a different request-time snapshot was checked. No binding comes from
 * the browser or a caller-supplied authorize/readiness callback. */
function sameBinding(
  a: ServerVerifiedReadBinding,
  b: ServerVerifiedReadBinding,
) {
  return canonicalSerialize(a) === canonicalSerialize(b);
}

/** Server composition only. Real JWT and persisted current binding, server
 * identity/clock, strict Core family parser and actual SQL preflight. No HTTP
 * installation, dispatcher, writer grant or simulation activation. The fixed
 * Default rejects unwired families; a private real server runtime binding can
 * atomically register one durable command/queue, never settle economics. */
export function createAuthenticatedOfficeCommandService(
  config: AuthenticatedOfficeCommandServiceConfig | null = null,
) {
  const c =
    config &&
    typeof config.resolveActorId === 'function' &&
    typeof config.clock?.nowReal === 'function' &&
    typeof config.clock?.simTime === 'function'
      ? {
          ...config,
          admittedWorldPins: Object.freeze({ ...config.admittedWorldPins }),
          auth: Object.freeze({ ...config.auth }),
        }
      : null;
  const verifier = c ? createSupabaseJwksSignatureVerifier(c.auth) : null;
  const reader = c
    ? createPostgresServerReadBindingProvider({
        pool: c.readPool,
        readerRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const intake = c
    ? new PostgresOfficeCommandIntake({
        pool: c.writerPool,
        role: c.writerRole,
        clock: c.clock,
        runtime: c.runtime ?? null,
      })
    : null;

  async function handle(input: {
    authorization: unknown;
    request: unknown;
    signal?: AbortSignal;
  }): Promise<{
    httpStatus: number;
    body: AuthenticatedOfficeCommandResponseDto;
  }> {
    let requestId = '00000000-0000-4000-8000-000000000000';
    const failure = (httpStatus: number, code: string, retryable = false) => ({
      httpStatus,
      body: {
        schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId,
        ok: false as const,
        error: { code, retryable },
      },
    });
    if (!c || !verifier || !reader || !intake)
      return failure(503, 'NOT_CONNECTED');
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
    const timer = setTimeout(abort, 10_000);
    let cancel: (result: ReturnType<typeof failure>) => void = () => undefined;
    const cancelled = new Promise<ReturnType<typeof failure>>((resolve) => {
      cancel = resolve;
    });
    let intakeStarted = false;
    const onAbort = () =>
      cancel(
        c.runtime && intakeStarted
          ? failure(503, 'WRITE_OUTCOME_UNKNOWN', false)
          : failure(499, 'CANCELLED'),
      );
    controller.signal.addEventListener('abort', onAbort, { once: true });

    async function execute() {
      try {
        if (controller.signal.aborted) return failure(499, 'CANCELLED');
        if (
          typeof input.authorization !== 'string' ||
          input.authorization.length > 8192 ||
          !/^Bearer [A-Za-z0-9._~-]+$/u.test(input.authorization)
        )
          return failure(401, 'AUTHENTICATION_REQUIRED');
        let claims;
        try {
          claims = await verifySupabaseJwtClaims({
            token: input.authorization.slice(7),
            verifier: verifier!,
            policy: {
              expectedIssuer: c!.auth.expectedIssuer,
              expectedAudience: c!.auth.audience,
              nowEpochSeconds: Math.floor(Date.now() / 1000),
            },
            signal: controller.signal,
          });
        } catch {
          return failure(401, 'AUTHENTICATION_INVALID');
        }
        let raw: Record<string, unknown>;
        let request;
        try {
          const text = canonicalSerialize(input.request);
          if (text.length > 65536) return failure(400, 'PROTOCOL_ERROR');
          const value: unknown = JSON.parse(text);
          if (!value || typeof value !== 'object' || Array.isArray(value))
            return failure(400, 'PROTOCOL_ERROR');
          raw = value as Record<string, unknown>;
          if (uuid(raw.requestId)) requestId = raw.requestId;
          if (
            Object.keys(raw).length !== 3 ||
            !['schemaVersion', 'requestId', 'request'].every((k) =>
              Object.hasOwn(raw, k),
            ) ||
            raw.schemaVersion !== AUTHENTICATED_OFFICE_COMMAND_SCHEMA ||
            !uuid(raw.requestId)
          )
            return failure(400, 'PROTOCOL_ERROR');
          request = parseManualOfficeCommandRequest(raw.request);
        } catch {
          return failure(400, 'PROTOCOL_ERROR');
        }
        const pins = c!.admittedWorldPins;
        if (request.worldId !== pins.worldId)
          return failure(403, 'WORLD_BINDING_MISMATCH');
        const selector = {
          verifiedSubject: claims.authSubject,
          worldId: request.worldId,
          projectionSelector: {
            classification: 'OFFICE_PRIVATE',
            scopeKey: `OFFICE_${Buffer.from(request.countryId).toString('hex').toUpperCase()}_${Buffer.from(request.officeId).toString('hex').toUpperCase()}`,
          },
          finalSelector: null,
          signal: controller.signal,
        };
        const before = await reader!.resolve(selector);
        if (
          !before ||
          before.identity.authSubjectId !== claims.authSubject ||
          before.identity.worldId !== request.worldId ||
          before.identity.countryId !== request.countryId ||
          before.identity.officeId !== request.officeId ||
          before.seed.worldId !== pins.worldId ||
          before.seed.seedRef !== pins.seedRef ||
          before.seed.contentHash !== pins.contentHash ||
          before.seed.admissionRef !== pins.admissionRef ||
          BigInt(before.readback.worldVersion) <
            BigInt(pins.minimumWorldVersion)
        )
          return failure(403, 'CURRENT_SEAT_OR_ADMISSION_REQUIRED');
        const actor = await c!.resolveActorId(claims.authSubject);
        if (actor === null) return failure(403, 'SERVER_ACTOR_REQUIRED');
        const subject = authSubject(claims.authSubject);
        const principal: AuthenticatedPrincipal = {
          authSubject: subject,
          facts: { user_id: subject, display_name: null, school_id: null },
          token: {
            subject,
            issuer: claims.issuer,
            audience: claims.audience,
            issuedAt: new Date(
              claims.issuedAtEpochSeconds * 1000,
            ).toISOString(),
            expiresAt: new Date(
              claims.expiresAtEpochSeconds * 1000,
            ).toISOString(),
          },
        };
        intakeStarted = true;
        const state = await intake!.submit({
          request,
          binding: before,
          principal,
          actor,
          signal: controller.signal,
        });
        if (state.status !== 'REJECTED') {
          // SQL cutoff is held through the actual commit. A later head/seat
          // change cannot turn a committed queue acknowledgement into API403.
          return {
            httpStatus: state.source === 'NEW' ? 202 : 200,
            body: {
              schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
              requestId,
              ok: true as const,
              state,
            },
          };
        }
        const after = await reader!.resolve(selector);
        if (controller.signal.aborted) return failure(499, 'CANCELLED');
        if (!after || !sameBinding(before, after))
          return failure(403, 'CURRENT_BINDING_CHANGED');
        return {
          ...failure(503, state.reason),
          body: { ...failure(503, state.reason).body, state },
        };
      } catch (error) {
        if (controller.signal.aborted) return failure(499, 'CANCELLED');
        if (error instanceof OfficeCommandOutcomeUnknownError)
          return failure(503, 'WRITE_OUTCOME_UNKNOWN', false);
        // Uncertain writes/cleanup never become a definite Core denial or result.
        if (error instanceof DomainError)
          return failure(
            error.code === 'AUTHORIZATION_DENIED'
              ? 403
              : ['VERSION_MISMATCH', 'IDEMPOTENCY_CONFLICT'].includes(
                    error.code,
                  )
                ? 409
                : 400,
            error.code,
          );
        return failure(503, 'UPSTREAM_UNAVAILABLE', true);
      }
    }
    try {
      return await Promise.race([trackRequestCompletion(execute()), cancelled]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      input.signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  }
  return Object.freeze({
    simulationEnabled: false as const,
    workerActivationAllowed: false as const,
    clockActivationAllowed: false as const,
    handle,
    invalidateSessionKeyCache: () => verifier?.invalidateCache(),
  });
}
