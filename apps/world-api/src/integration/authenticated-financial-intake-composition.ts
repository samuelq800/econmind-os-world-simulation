import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  DomainError,
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  FINANCIAL_INTAKE_OFFICE_ACTIONS,
  type AuthenticatedFinancialIntakeResponseDto,
  type FinancialIntakeStateDto,
} from '@econmind/core';
export { AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA } from '@econmind/core';
import { PostgresNarrowTransferIntake } from '@econmind/world-worker/intake';
import { NarrowTransferApprovalStore } from '@econmind/world-worker/approval-store';
import type {
  ServerVerifiedReadBinding,
  HttpsReadCompositionConfig,
} from './https-authenticated-read-composition.js';
import { createPostgresServerReadBindingProvider } from './postgres-full-read-provider.js';
import { createPostgresFinancialIntakeDatabase } from './postgres-financial-intake-database.js';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';
import {
  createStagedTransferService,
  type StagedTransferServiceInput,
} from './staged-narrow-transfer-service.js';
import {
  parseStagedTransferRequest,
  type StagedTransferRequest,
} from './staged-narrow-transfer-handler.js';
import { createPostgresBuyerFinanceApprovalReader } from './postgres-buyer-finance-approval-reader.js';

export interface FinancialIntakeResult {
  readonly httpStatus: number;
  readonly body: AuthenticatedFinancialIntakeResponseDto;
}
export interface AuthenticatedFinancialIntakeCompositionConfig {
  readonly readPool: Pick<Pool, 'connect'>;
  readonly writerPool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
  readonly writerRole: string;
  readonly authorizationPublisherRole: string;
  readonly admittedWorldPins: HttpsReadCompositionConfig['admittedWorldPins'];
  readonly auth: {
    readonly projectRef: string;
    readonly expectedIssuer: string;
    readonly jwksUrl: string;
    readonly audience: string;
    readonly fetch?: typeof globalThis.fetch;
  };
  readonly resolveActorId: StagedTransferServiceInput['resolveActorId'];
  readonly clock: StagedTransferServiceInput['clock'];
}
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    v,
  );
const offices = [
  'CAPTAIN',
  'FINANCE',
  'CENTRAL_BANK',
  'INDUSTRY',
  'TRADE',
  'SOCIAL',
];
const allowed: Readonly<Record<string, readonly string[]>> =
  FINANCIAL_INTAKE_OFFICE_ACTIONS;
function sameBinding(
  a: ServerVerifiedReadBinding,
  b: ServerVerifiedReadBinding,
): boolean {
  return (
    a.seatRef === b.seatRef &&
    JSON.stringify(a.identity) === JSON.stringify(b.identity) &&
    JSON.stringify(a.seed) === JSON.stringify(b.seed)
  );
}
function domain(error: unknown): DomainError | null {
  for (let i = 0; i < 8 && error instanceof Error; i++, error = error.cause)
    if (error instanceof DomainError) return error;
  return null;
}

/** Real JWT -> current persisted binding -> existing canonical service and
 * Worker SQL ports. No second Command/economic parser, synchronous settlement,
 * grant, default actor or Clock, HTTP install or production activation. */
export function createAuthenticatedFinancialIntakeComposition(
  config: AuthenticatedFinancialIntakeCompositionConfig | null = null,
) {
  const c =
    config &&
    typeof config.resolveActorId === 'function' &&
    typeof config.clock?.simTime === 'function' &&
    typeof config.clock?.nowReal === 'function'
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
  async function handle(input: {
    authorization: unknown;
    request: unknown;
    signal?: AbortSignal;
  }): Promise<FinancialIntakeResult> {
    const raw = record(input.request),
      requestId = uuid(raw?.requestId)
        ? raw.requestId
        : '00000000-0000-4000-8000-000000000000';
    const failure = (
      status: number,
      code: string,
      retryable = false,
    ): FinancialIntakeResult => ({
      httpStatus: status,
      body: {
        schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
        requestId,
        ok: false,
        error: { code, retryable },
      },
    });
    if (!c || !verifier || !reader) return failure(503, 'NOT_CONNECTED');
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
    let request: StagedTransferRequest | undefined,
      dispatched = false;
    const unknown = (): FinancialIntakeResult => ({
      httpStatus: 503,
      body: {
        schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
        requestId,
        ok: false,
        state: {
          status: 'UNKNOWN',
          action: request?.action,
          worldId: request?.worldId,
          commandId: request?.commandId,
          idempotencyKey: request?.idempotencyKey,
          retryable: true,
        },
      },
    });
    let cancel: (result: FinancialIntakeResult) => void = () => undefined;
    const cancelled = new Promise<FinancialIntakeResult>((resolve) => {
      cancel = resolve;
    });
    const onAbort = () =>
      cancel(dispatched ? unknown() : failure(499, 'CANCELLED'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 10_000);
    async function execute(): Promise<FinancialIntakeResult> {
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
        if (
          !raw ||
          Object.keys(raw).length !== 3 ||
          !['schemaVersion', 'requestId', 'request'].every((k) =>
            Object.hasOwn(raw, k),
          ) ||
          raw.schemaVersion !== AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA ||
          !uuid(raw.requestId)
        )
          return failure(400, 'PROTOCOL_ERROR');
        const selected = record(raw.request);
        if (
          selected &&
          typeof selected.officeId === 'string' &&
          offices.includes(selected.officeId) &&
          allowed[selected.officeId]?.length === 0
        )
          return failure(400, 'OFFICE_COMMAND_FAMILY_UNSUPPORTED');
        try {
          request = parseStagedTransferRequest(raw.request);
        } catch {
          return failure(400, 'PROTOCOL_ERROR');
        }
        if (!allowed[request.officeId]?.includes(request.action))
          return failure(403, 'OFFICE_ACTION_UNSUPPORTED');
        if (request.worldId !== c!.admittedWorldPins.worldId)
          return failure(403, 'WORLD_BINDING_MISMATCH');
        const selector = {
          verifiedSubject: claims.authSubject,
          worldId: request.worldId,
          projectionSelector: {
            classification: 'OFFICE_PRIVATE',
            scopeKey: `OFFICE_${Buffer.from(request.countryId, 'utf8').toString('hex').toUpperCase()}_${Buffer.from(request.officeId, 'utf8').toString('hex').toUpperCase()}`,
          },
          finalSelector: null,
          signal: controller.signal,
        };
        const before = await reader!.resolve(selector);
        const pins = c!.admittedWorldPins;
        if (
          !before ||
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
        const database = createPostgresFinancialIntakeDatabase({
          pool: c!.writerPool,
          writerRole: c!.writerRole,
          binding: before,
          signal: controller.signal,
        });
        const sha256Hex = (s: string) =>
          createHash('sha256').update(s).digest('hex');
        const service = createStagedTransferService({
          database,
          intake: new PostgresNarrowTransferIntake({ database, sha256Hex }),
          approvals: new NarrowTransferApprovalStore({ database, sha256Hex }),
          approvalReader: createPostgresBuyerFinanceApprovalReader({
            pool: {
              query: (sql: string, values: readonly unknown[]) =>
                database.query(sql, values),
            } as unknown as Pick<Pool, 'query'>,
          }),
          sha256Hex,
          resolveActorId: c!.resolveActorId,
          clock: c!.clock,
        });
        dispatched = !['INSPECT', 'READ'].includes(request.action);
        const state = await service.execute(request, claims);
        database.assertNoRolledBackBindingDenial();
        if (controller.signal.aborted)
          return dispatched ? unknown() : failure(499, 'CANCELLED');
        const after = await reader!.resolve(selector);
        if (!after || !sameBinding(before, after))
          return dispatched ? unknown() : failure(403, 'AUTHORIZATION_DENIED');
        return {
          httpStatus: 200,
          body: {
            schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
            requestId,
            ok: true,
            authority: after,
            // Service is the existing canonical parser/port consumer. This is
            // its transport status shape, not a second economic parser.
            state: state as FinancialIntakeStateDto,
          },
        };
      } catch (error) {
        const semantic = domain(error);
        if (semantic)
          return failure(
            semantic.code === 'AUTHORIZATION_DENIED'
              ? 403
              : ['IDEMPOTENCY_CONFLICT', 'VERSION_MISMATCH'].includes(
                    semantic.code,
                  )
                ? 409
                : 400,
            semantic.code,
          );
        if (controller.signal.aborted)
          return dispatched ? unknown() : failure(499, 'CANCELLED');
        if (dispatched) return unknown();
        return failure(503, 'UPSTREAM_UNAVAILABLE', true);
      }
    }
    try {
      return await Promise.race([execute(), cancelled]);
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
