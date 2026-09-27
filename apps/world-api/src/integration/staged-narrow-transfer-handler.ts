import { DomainError, canonicalSerialize } from '@econmind/core';
import {
  verifySupabaseJwtClaims,
  type JwtSignatureVerifier,
  type ValidatedJwtClaims,
} from './identity.js';

export const STAGED_TRANSFER_SCHEMA = 'world-staged-transfer-v1' as const;
export const STAGED_TRANSFER_ACTIONS = [
  'REGISTER',
  'INSPECT',
  'SIGN_SELLER',
  'SIGN_BUYER_TRADE',
  'SIGN_BUYER_FINANCE',
  'BIND_REFERENCE',
  'ENQUEUE',
  'READ',
] as const;
export type StagedTransferAction = (typeof STAGED_TRANSFER_ACTIONS)[number];

export interface StagedTransferRequest {
  readonly schemaVersion: typeof STAGED_TRANSFER_SCHEMA;
  readonly action: StagedTransferAction;
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  /** Selectors only: the service verifies both against current DB authority. */
  readonly countryId: string;
  readonly officeId: 'TRADE' | 'FINANCE';
  readonly intent?: Readonly<{
    expectedWorldVersion: string;
    buyerCountryId: string;
    quantity: unknown;
    price: unknown;
    assetSource: unknown;
    expiresAtReal: string;
  }>;
  readonly commandFingerprint?: string;
  readonly approvalRef?: string;
}

export interface StagedTransferService {
  execute(
    request: StagedTransferRequest,
    claims: ValidatedJwtClaims,
  ): Promise<unknown>;
}
export interface StagedTransferHttpResult {
  readonly httpStatus: number;
  readonly body: object;
}
export interface StagedTransferHandler {
  handle(input: {
    authorization: string | undefined;
    request: unknown;
  }): Promise<StagedTransferHttpResult>;
}

function invalid(): never {
  throw new Error('INVALID_STAGED_REQUEST');
}

export function parseStagedTransferRequest(
  input: unknown,
): StagedTransferRequest {
  const serialized = canonicalSerialize(input);
  if (Buffer.byteLength(serialized, 'utf8') > 16 * 1024) invalid();
  const row: unknown = JSON.parse(serialized);
  if (row === null || typeof row !== 'object' || Array.isArray(row)) invalid();
  const r = row as Record<string, unknown>;
  if (
    r.schemaVersion !== STAGED_TRANSFER_SCHEMA ||
    !STAGED_TRANSFER_ACTIONS.includes(r.action as StagedTransferAction)
  )
    invalid();
  const keys = [
    'schemaVersion',
    'action',
    'worldId',
    'commandId',
    'idempotencyKey',
    'countryId',
    'officeId',
  ];
  if (r.action === 'REGISTER') keys.push('intent');
  if (
    [
      'SIGN_SELLER',
      'SIGN_BUYER_TRADE',
      'SIGN_BUYER_FINANCE',
      'BIND_REFERENCE',
      'ENQUEUE',
    ].includes(r.action as string)
  )
    keys.push('commandFingerprint');
  if (r.action === 'ENQUEUE') keys.push('approvalRef');
  if (
    Object.keys(r).length !== keys.length ||
    Object.keys(r).some((key) => !keys.includes(key))
  )
    invalid();
  for (const key of ['worldId', 'commandId', 'idempotencyKey', 'countryId']) {
    if (
      typeof r[key] !== 'string' ||
      !/^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u.test(r[key])
    )
      invalid();
  }
  if (r.officeId !== 'TRADE' && r.officeId !== 'FINANCE') invalid();
  if (
    keys.includes('commandFingerprint') &&
    (typeof r.commandFingerprint !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(r.commandFingerprint))
  )
    invalid();
  if (
    keys.includes('approvalRef') &&
    (typeof r.approvalRef !== 'string' ||
      !/^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u.test(r.approvalRef))
  )
    invalid();
  if (r.action === 'REGISTER') {
    const intent = r.intent;
    if (!intent || typeof intent !== 'object' || Array.isArray(intent))
      invalid();
    const fields = [
      'expectedWorldVersion',
      'buyerCountryId',
      'quantity',
      'price',
      'assetSource',
      'expiresAtReal',
    ];
    if (
      Object.keys(intent).length !== fields.length ||
      Object.keys(intent).some((key) => !fields.includes(key))
    )
      invalid();
    // Deep economic term validation belongs to the existing canonical parser.
    for (const key of [
      'expectedWorldVersion',
      'buyerCountryId',
      'expiresAtReal',
    ]) {
      if (typeof (intent as Record<string, unknown>)[key] !== 'string')
        invalid();
    }
  }
  return Object.freeze(r) as unknown as StagedTransferRequest;
}

function semanticError(error: unknown): DomainError | undefined {
  let next = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (next instanceof DomainError) return next;
    if (!(next instanceof Error)) return undefined;
    next = next.cause;
  }
  return undefined;
}

export function createStagedTransferHandler(input: {
  readonly service: StagedTransferService;
  readonly verifier: JwtSignatureVerifier;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly nowEpochSeconds: () => number;
}): StagedTransferHandler {
  return Object.freeze({
    async handle(requestInput: Parameters<StagedTransferHandler['handle']>[0]) {
      const failure = (httpStatus: number, code: string) => ({
        httpStatus,
        body: {
          schemaVersion: STAGED_TRANSFER_SCHEMA,
          ok: false,
          error: { code },
        },
      });
      if (!requestInput.authorization?.startsWith('Bearer '))
        return failure(401, 'AUTHENTICATION_REQUIRED');
      let claims: ValidatedJwtClaims;
      try {
        claims = await verifySupabaseJwtClaims({
          token: requestInput.authorization.slice(7),
          verifier: input.verifier,
          policy: {
            expectedIssuer: input.expectedIssuer,
            expectedAudience: input.expectedAudience,
            nowEpochSeconds: input.nowEpochSeconds(),
          },
        });
      } catch {
        return failure(401, 'AUTHENTICATION_INVALID');
      }
      let request: StagedTransferRequest;
      try {
        request = parseStagedTransferRequest(requestInput.request);
      } catch {
        return failure(400, 'PROTOCOL_ERROR');
      }
      try {
        const state = await input.service.execute(request, claims);
        return {
          httpStatus: 200,
          body: { schemaVersion: STAGED_TRANSFER_SCHEMA, ok: true, state },
        };
      } catch (error) {
        const domain = semanticError(error);
        if (domain) {
          const code = domain.code;
          return failure(
            code === 'AUTHORIZATION_DENIED'
              ? 403
              : ['IDEMPOTENCY_CONFLICT', 'VERSION_MISMATCH'].includes(code)
                ? 409
                : 400,
            code,
          );
        }
        // A dispatched write may have committed. Never turn this into FAILED
        // or fabricate FINAL; the caller must inspect/retry the same IDs.
        return {
          httpStatus: 503,
          body: {
            schemaVersion: STAGED_TRANSFER_SCHEMA,
            ok: false,
            state: {
              status: 'UNKNOWN',
              action: request.action,
              worldId: request.worldId,
              commandId: request.commandId,
              idempotencyKey: request.idempotencyKey,
              retryable: true,
            },
          },
        };
      }
    },
  });
}
