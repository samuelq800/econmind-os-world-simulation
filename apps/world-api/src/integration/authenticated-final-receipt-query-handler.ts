import type { DurableNarrowTransferReceipt } from './authenticated-narrow-transfer-command-handler.js';
import {
  readAuthenticatedPostgresFinalCommandReceipt,
  type FinalReceiptIdentity,
} from './postgres-final-receipt-reader.js';
import type { ParameterizedPgReadExecutor } from './postgres-read-adapter.js';
import {
  verifySupabaseJwtClaims,
  type JwtClaimsPolicy,
  type JwtSignatureVerifier,
} from './identity.js';
import { WorldReadFailure } from './transport.js';

export const WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION =
  'world-final-receipt-read-v1' as const;
export const MAX_WORLD_FINAL_RECEIPT_READ_REQUEST_BYTES = 16 * 1024;

export interface FinalReceiptReadRequest {
  readonly schemaVersion: typeof WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION;
  readonly requestId: string;
  readonly operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT';
  readonly payload: FinalReceiptIdentity;
}

export interface WorldFinalReceiptReadErrorDto {
  readonly code:
    | 'AUTHENTICATION_REQUIRED'
    | 'AUTHENTICATION_INVALID'
    | 'NOT_FOUND'
    | 'PROTOCOL_ERROR'
    | 'UPSTREAM_UNAVAILABLE';
  readonly message: string;
  readonly retryable: boolean;
}

export type WorldFinalReceiptReadResponseEnvelope =
  | {
      readonly schemaVersion: typeof WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION;
      readonly requestId: string;
      readonly ok: true;
      readonly receipt: DurableNarrowTransferReceipt;
    }
  | {
      readonly schemaVersion: typeof WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION;
      readonly requestId: string;
      readonly ok: false;
      readonly error: WorldFinalReceiptReadErrorDto;
    };

export interface AuthenticatedFinalReceiptQueryHandler {
  handle(input: {
    readonly authorization: unknown;
    readonly request: unknown;
    readonly signal?: AbortSignal;
  }): Promise<WorldFinalReceiptReadResponseEnvelope>;
}

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const MAX_AUTHORIZATION_HEADER_BYTES = 8 * 1024;
const FALLBACK_REQUEST_ID = '00000000-0000-4000-8000-000000000000';

function failure(
  code: WorldFinalReceiptReadErrorDto['code'],
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

function parseRequest(value: unknown): FinalReceiptReadRequest {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid('final receipt request is not JSON');
  }
  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, 'utf8') >
      MAX_WORLD_FINAL_RECEIPT_READ_REQUEST_BYTES
  ) {
    invalid('final receipt request exceeds the byte limit');
  }
  const input = record(value, 'final receipt request');
  exactKeys(
    input,
    ['schemaVersion', 'requestId', 'operation', 'payload'],
    'final receipt request',
  );
  if (
    input.schemaVersion !== WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION ||
    input.operation !== 'READ_FINAL_NARROW_TRANSFER_RECEIPT'
  ) {
    invalid('final receipt operation is unsupported');
  }
  const requestId = string(input.requestId, 'requestId');
  if (!CANONICAL_UUID.test(requestId)) invalid('requestId must be a UUID');
  const payload = record(input.payload, 'final receipt payload');
  exactKeys(
    payload,
    ['worldId', 'commandId', 'idempotencyKey'],
    'final receipt payload',
  );
  return Object.freeze({
    schemaVersion: WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION,
    requestId,
    operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
    payload: Object.freeze({
      worldId: canonicalId(payload.worldId, 'worldId'),
      commandId: canonicalId(payload.commandId, 'commandId'),
      idempotencyKey: canonicalId(payload.idempotencyKey, 'idempotencyKey'),
    }),
  });
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

function errorResponse(input: {
  readonly requestId: string;
  readonly error: WorldReadFailure;
}): WorldFinalReceiptReadResponseEnvelope {
  const supported = new Set<WorldFinalReceiptReadErrorDto['code']>([
    'AUTHENTICATION_REQUIRED',
    'AUTHENTICATION_INVALID',
    'NOT_FOUND',
    'PROTOCOL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  ]);
  return Object.freeze({
    schemaVersion: WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION,
    requestId: input.requestId,
    ok: false,
    error: Object.freeze({
      code: supported.has(
        input.error.code as WorldFinalReceiptReadErrorDto['code'],
      )
        ? (input.error.code as WorldFinalReceiptReadErrorDto['code'])
        : 'UPSTREAM_UNAVAILABLE',
      message: input.error.message,
      retryable: input.error.retryable,
    }),
  });
}

/**
 * HTTP-neutral receipt-recovery boundary for a command whose acknowledgement
 * was lost. It does not submit, execute, cache or synthesize a receipt.
 */
export function createAuthenticatedFinalReceiptQueryHandler(input: {
  readonly executor: ParameterizedPgReadExecutor;
  readonly policy: JwtClaimsPolicy;
  readonly verifier: JwtSignatureVerifier;
}): Readonly<AuthenticatedFinalReceiptQueryHandler> {
  return Object.freeze({
    async handle(handlerInput: {
      readonly authorization: unknown;
      readonly request: unknown;
      readonly signal?: AbortSignal;
    }) {
      let requestId = FALLBACK_REQUEST_ID;
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
        const receipt = await readAuthenticatedPostgresFinalCommandReceipt({
          executor: input.executor,
          identity: request.payload,
          authSubject: claims.authSubject,
          ...(handlerInput.signal === undefined
            ? {}
            : { signal: handlerInput.signal }),
        });
        if (receipt === null) {
          throw failure(
            'NOT_FOUND',
            'Final command receipt is unavailable',
            false,
          );
        }
        return Object.freeze({
          schemaVersion: WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION,
          requestId,
          ok: true,
          receipt,
        });
      } catch (error) {
        return errorResponse({
          requestId,
          error:
            error instanceof WorldReadFailure
              ? error
              : failure(
                  'PROTOCOL_ERROR',
                  'Final command receipt request is invalid',
                  false,
                ),
        });
      }
    },
  });
}
