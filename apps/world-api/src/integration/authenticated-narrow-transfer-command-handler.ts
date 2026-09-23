import {
  verifySupabaseJwtClaims,
  type JwtClaimsPolicy,
  type JwtSignatureVerifier,
  type SupabaseAuthSubject,
} from './identity.js';
import { WorldReadFailure } from './transport.js';

export const WORLD_COMMAND_API_SCHEMA_VERSION = 'world-command-api-v1' as const;
export const MAX_WORLD_COMMAND_REQUEST_BYTES = 16 * 1024;

export type DurableCommandOutcome =
  'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';

export interface NarrowTransferCommandRequest {
  readonly schemaVersion: typeof WORLD_COMMAND_API_SCHEMA_VERSION;
  readonly requestId: string;
  readonly operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER';
  readonly payload: {
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
    readonly proposalRef: string;
    readonly buyerCountryId: string;
    readonly buyerFinanceApprovalRef: string;
  };
}

export interface DurableNarrowTransferReceipt {
  /** A transport fixture cannot satisfy this source declaration. */
  readonly source: 'DURABLE_FINAL_COMMAND_RECEIPT';
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly outcome: DurableCommandOutcome;
  readonly reasonCode: string | null;
  readonly worldVersionAfter: string | null;
  readonly eventIds: readonly string[];
  readonly recordedAtReal: string;
}

export interface WorldCommandErrorDto {
  readonly code:
    | 'AUTHENTICATION_REQUIRED'
    | 'AUTHENTICATION_INVALID'
    | 'AUTHORIZATION_DENIED'
    | 'PROTOCOL_ERROR'
    | 'UPSTREAM_UNAVAILABLE';
  readonly message: string;
  readonly retryable: boolean;
}

export type WorldCommandResponseEnvelope =
  | {
      readonly schemaVersion: typeof WORLD_COMMAND_API_SCHEMA_VERSION;
      readonly requestId: string;
      readonly ok: true;
      readonly receipt: DurableNarrowTransferReceipt;
    }
  | {
      readonly schemaVersion: typeof WORLD_COMMAND_API_SCHEMA_VERSION;
      readonly requestId: string;
      readonly ok: false;
      readonly error: WorldCommandErrorDto;
    };

export interface ServerBoundCommandScope {
  readonly authSubject: SupabaseAuthSubject;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly capability: string;
  readonly authorizationVersion: string;
}

export interface CurrentCommandScopeReader {
  resolve(input: {
    readonly authSubject: SupabaseAuthSubject;
    readonly worldId: string;
    readonly signal?: AbortSignal;
  }): Promise<ServerBoundCommandScope | null>;
}

export interface BuyerFinanceApprovalReader {
  readCurrent(input: {
    readonly worldId: string;
    readonly buyerCountryId: string;
    readonly proposalRef: string;
    readonly buyerFinanceApprovalRef: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly worldId: string;
    readonly buyerCountryId: string;
    readonly officeId: 'FINANCE';
    readonly proposalRef: string;
    readonly approvalRef: string;
    readonly status: 'APPROVED';
  } | null>;
}

/**
 * This port must atomically preserve command/idempotency identities and return
 * the stored final receipt for exact retries. It is intentionally server-only.
 */
export interface DurableNarrowTransferReceiptPort {
  acceptOrRead(input: {
    readonly request: NarrowTransferCommandRequest;
    readonly scope: ServerBoundCommandScope;
    readonly buyerFinanceApproval: {
      readonly worldId: string;
      readonly buyerCountryId: string;
      readonly officeId: 'FINANCE';
      readonly proposalRef: string;
      readonly approvalRef: string;
      readonly status: 'APPROVED';
    };
    readonly signal?: AbortSignal;
  }): Promise<DurableNarrowTransferReceipt>;
}

export interface AuthenticatedNarrowTransferCommandHandler {
  handle(input: {
    readonly authorization: unknown;
    readonly request: unknown;
    readonly signal?: AbortSignal;
  }): Promise<WorldCommandResponseEnvelope>;
}

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_AUTHORIZATION_HEADER_BYTES = 8 * 1024;

function failure(
  code: WorldCommandErrorDto['code'],
  message: string,
  retryable: boolean,
): WorldReadFailure {
  return new WorldReadFailure(code, message, retryable);
}

function invalid(message: string): never {
  throw failure('PROTOCOL_ERROR', message, false);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    invalid(`${label} contains missing or unknown fields`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalId(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!CANONICAL_ID.test(parsed)) invalid(`${label} must be canonical`);
  return parsed;
}

function parseAuthorization(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw failure(
      'AUTHENTICATION_REQUIRED',
      'Bearer authentication is required',
      false,
    );
  }
  if (
    Buffer.byteLength(value, 'utf8') > MAX_AUTHORIZATION_HEADER_BYTES ||
    !/^Bearer [A-Za-z0-9._~-]+$/u.test(value)
  ) {
    throw failure(
      'AUTHENTICATION_INVALID',
      'Bearer authentication is invalid',
      false,
    );
  }
  return value.slice('Bearer '.length);
}

function parseRequest(value: unknown): NarrowTransferCommandRequest {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid('command request is not JSON');
  }
  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, 'utf8') > MAX_WORLD_COMMAND_REQUEST_BYTES
  ) {
    invalid('command request exceeds the byte limit');
  }
  const input = record(value, 'command request');
  exactKeys(
    input,
    ['schemaVersion', 'requestId', 'operation', 'payload'],
    'command request',
  );
  if (
    input.schemaVersion !== WORLD_COMMAND_API_SCHEMA_VERSION ||
    input.operation !== 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER'
  ) {
    invalid('command operation is unsupported');
  }
  const requestId = string(input.requestId, 'requestId');
  if (!CANONICAL_UUID.test(requestId)) invalid('requestId must be a UUID');
  const payload = record(input.payload, 'command payload');
  exactKeys(
    payload,
    [
      'worldId',
      'countryId',
      'officeId',
      'commandId',
      'idempotencyKey',
      'proposalRef',
      'buyerCountryId',
      'buyerFinanceApprovalRef',
    ],
    'command payload',
  );
  return Object.freeze({
    schemaVersion: WORLD_COMMAND_API_SCHEMA_VERSION,
    requestId,
    operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
    payload: Object.freeze({
      worldId: canonicalId(payload.worldId, 'worldId'),
      countryId: canonicalId(payload.countryId, 'countryId'),
      officeId: canonicalId(payload.officeId, 'officeId'),
      commandId: canonicalId(payload.commandId, 'commandId'),
      idempotencyKey: canonicalId(payload.idempotencyKey, 'idempotencyKey'),
      proposalRef: canonicalId(payload.proposalRef, 'proposalRef'),
      buyerCountryId: canonicalId(payload.buyerCountryId, 'buyerCountryId'),
      buyerFinanceApprovalRef: canonicalId(
        payload.buyerFinanceApprovalRef,
        'buyerFinanceApprovalRef',
      ),
    }),
  });
}

function validateReceipt(
  receipt: DurableNarrowTransferReceipt,
  request: NarrowTransferCommandRequest,
): DurableNarrowTransferReceipt {
  if (
    receipt.source !== 'DURABLE_FINAL_COMMAND_RECEIPT' ||
    receipt.worldId !== request.payload.worldId ||
    receipt.commandId !== request.payload.commandId ||
    receipt.idempotencyKey !== request.payload.idempotencyKey ||
    !FINGERPRINT.test(receipt.commandFingerprint) ||
    !['COMMITTED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
      receipt.outcome,
    ) ||
    !RFC3339_MILLISECONDS.test(receipt.recordedAtReal)
  ) {
    invalid('durable receipt does not bind the accepted command');
  }
  const committed = receipt.outcome === 'COMMITTED';
  if (
    !Array.isArray(receipt.eventIds) ||
    receipt.eventIds.length > 1_000 ||
    (committed && receipt.eventIds.length === 0) ||
    (!committed && receipt.eventIds.length !== 0) ||
    (committed && receipt.reasonCode !== null) ||
    (!committed && receipt.reasonCode === null) ||
    new Set(receipt.eventIds).size !== receipt.eventIds.length
  ) {
    invalid('durable receipt outcome is internally inconsistent');
  }
  if (receipt.reasonCode !== null && !REASON_CODE.test(receipt.reasonCode)) {
    invalid('durable receipt reason code is invalid');
  }
  if (
    (committed &&
      (receipt.worldVersionAfter === null ||
        !POSITIVE_INTEGER.test(receipt.worldVersionAfter))) ||
    (!committed && receipt.worldVersionAfter !== null)
  ) {
    invalid('durable receipt WorldVersion is internally inconsistent');
  }
  for (const eventId of receipt.eventIds) canonicalId(eventId, 'receipt event');
  return Object.freeze({
    ...receipt,
    eventIds: Object.freeze([...receipt.eventIds]),
  });
}

function errorResponse(
  requestId: string,
  error: WorldReadFailure,
): WorldCommandResponseEnvelope {
  const supported = new Set<WorldCommandErrorDto['code']>([
    'AUTHENTICATION_REQUIRED',
    'AUTHENTICATION_INVALID',
    'AUTHORIZATION_DENIED',
    'PROTOCOL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  ]);
  return Object.freeze({
    schemaVersion: WORLD_COMMAND_API_SCHEMA_VERSION,
    requestId,
    ok: false,
    error: Object.freeze({
      code: supported.has(error.code as WorldCommandErrorDto['code'])
        ? (error.code as WorldCommandErrorDto['code'])
        : 'PROTOCOL_ERROR',
      message: error.message,
      retryable: error.retryable,
    }),
  });
}

function unavailable(): never {
  throw failure(
    'UPSTREAM_UNAVAILABLE',
    'Server-held command evidence is unavailable',
    true,
  );
}

/**
 * Server-only V10 narrow-transfer intake. It has no cache and no fixture
 * fallback: durable idempotency and final-receipt truth stay in the injected
 * server store.
 */
export function createAuthenticatedNarrowTransferCommandHandler(input: {
  readonly approvalReader: BuyerFinanceApprovalReader;
  readonly policy: JwtClaimsPolicy;
  readonly receiptPort: DurableNarrowTransferReceiptPort;
  readonly scopeReader: CurrentCommandScopeReader;
  readonly verifier: JwtSignatureVerifier;
}): Readonly<AuthenticatedNarrowTransferCommandHandler> {
  return Object.freeze({
    async handle(handlerInput: {
      readonly authorization: unknown;
      readonly request: unknown;
      readonly signal?: AbortSignal;
    }) {
      let requestId = '00000000-0000-4000-8000-000000000000';
      try {
        const request = parseRequest(handlerInput.request);
        requestId = request.requestId;
        const token = parseAuthorization(handlerInput.authorization);
        let claims;
        try {
          claims = await verifySupabaseJwtClaims({
            token,
            verifier: input.verifier,
            policy: input.policy,
            ...(handlerInput.signal === undefined
              ? {}
              : { signal: handlerInput.signal }),
          });
        } catch {
          throw failure(
            'AUTHENTICATION_INVALID',
            'Bearer authentication is invalid',
            false,
          );
        }
        const scope = await input.scopeReader
          .resolve({
            authSubject: claims.authSubject,
            worldId: request.payload.worldId,
            ...(handlerInput.signal === undefined
              ? {}
              : { signal: handlerInput.signal }),
          })
          .catch(unavailable);
        if (
          scope === null ||
          scope.authSubject !== claims.authSubject ||
          scope.worldId !== request.payload.worldId ||
          scope.countryId !== request.payload.countryId ||
          scope.officeId !== request.payload.officeId
        ) {
          throw failure(
            'AUTHORIZATION_DENIED',
            'Current server scope does not authorize this command',
            false,
          );
        }
        const approval = await input.approvalReader
          .readCurrent({
            worldId: request.payload.worldId,
            buyerCountryId: request.payload.buyerCountryId,
            proposalRef: request.payload.proposalRef,
            buyerFinanceApprovalRef: request.payload.buyerFinanceApprovalRef,
            ...(handlerInput.signal === undefined
              ? {}
              : { signal: handlerInput.signal }),
          })
          .catch(unavailable);
        if (
          approval === null ||
          approval.worldId !== request.payload.worldId ||
          approval.buyerCountryId !== request.payload.buyerCountryId ||
          approval.officeId !== 'FINANCE' ||
          approval.proposalRef !== request.payload.proposalRef ||
          approval.approvalRef !== request.payload.buyerFinanceApprovalRef ||
          approval.status !== 'APPROVED'
        ) {
          throw failure(
            'AUTHORIZATION_DENIED',
            'Current Buyer Finance approval is required',
            false,
          );
        }
        const receipt = await input.receiptPort
          .acceptOrRead({
            request,
            scope,
            buyerFinanceApproval: approval,
            ...(handlerInput.signal === undefined
              ? {}
              : { signal: handlerInput.signal }),
          })
          .catch(unavailable);
        return Object.freeze({
          schemaVersion: WORLD_COMMAND_API_SCHEMA_VERSION,
          requestId,
          ok: true,
          receipt: validateReceipt(receipt, request),
        });
      } catch (error) {
        return errorResponse(
          requestId,
          error instanceof WorldReadFailure
            ? error
            : failure(
                'PROTOCOL_ERROR',
                'World command request is invalid',
                false,
              ),
        );
      }
    },
  });
}
