/** Fixed custody transport. Source/quote admission is independently recorded;
 * neither this publisher nor a Core-valid financial snapshot admits originals. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
  type CentralBankOmoSourceFacts,
} from '@econmind/core';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

export const CENTRAL_BANK_OMO_CUSTODY_PROPOSAL =
  'database/proposals/central-bank-omo-custody.sql';
export const CENTRAL_BANK_OMO_SOURCE_READER = 'world_v2_cb_omo_source_reader';
export const CENTRAL_BANK_OMO_ORIGINAL_QUERY =
  'select * from world_v2.lock_central_bank_omo_originals($1,$2,$3,$4,$5,$6::timestamptz,$7::uuid,$8)';
export interface CentralBankOmoOriginal {
  readonly schemaVersion: 'central-bank-omo-original-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly seedFingerprint: string;
  readonly sourceRef: string;
  readonly sourceRevision: string;
  readonly domesticTreasuryRef: string;
  readonly bank: CentralBankOmoSourceFacts['bank'];
  readonly centralBank: CentralBankOmoSourceFacts['centralBank'];
  readonly bankAccounts: CentralBankOmoSourceFacts['bankAccounts'];
  readonly centralBankAccounts: CentralBankOmoSourceFacts['centralBankAccounts'];
  readonly holdings: CentralBankOmoSourceFacts['holdings'];
}
export interface CentralBankOmoCustodyBinding {
  readonly adoptionRef: string;
  readonly admissionRef: string;
  readonly admissionRevision: string;
  readonly sourceRef: string;
  readonly sourceRevision: string;
  readonly originalSHA256: string;
  readonly quoteSHA256: string;
  readonly seedFingerprint: string;
  readonly canonicalSeedSHA256: string;
}
export interface CentralBankOmoLockedOriginals {
  readonly binding: Readonly<CentralBankOmoCustodyBinding>;
  readonly sourceClass: 'ADMITTED_ORIGINAL' | 'TEST_ONLY';
  readonly original: Readonly<CentralBankOmoOriginal>;
  readonly quote: Readonly<CentralBankOmoSourceFacts['quote']>;
  readonly row: Readonly<Record<string, unknown>>;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export class CentralBankOmoOriginalsMissing extends DomainError {
  constructor(readonly missing: readonly string[]) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      `CB_OMO_ORIGINALS_MISSING:${missing.join(',')}`,
    );
  }
}
export function invalidCentralBankOmoOriginal(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `CB_OMO_CUSTODY:${reason}`,
  );
}
export function exactOmoText(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalidCentralBankOmoOriginal('EXACT_STORED_FIELD_REQUIRED');
  return v;
}
function objectBytes<T>(v: unknown, hash: unknown): T {
  const bytes = exactOmoText(v);
  if (Buffer.byteLength(bytes) > 262144 || sha(bytes) !== hash)
    invalidCentralBankOmoOriginal('ORIGINAL_HASH_OR_CAPACITY_DIFFERS');
  const data: unknown = JSON.parse(bytes);
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    canonicalSerialize(data) !== bytes
  )
    invalidCentralBankOmoOriginal('CANONICAL_ORIGINAL_REQUIRED');
  return data as T;
}
export async function lockCentralBankOmoOriginalsFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly securityRef: string;
    readonly batchRef: string;
    readonly workerId: string;
    readonly observedAtReal: string;
    readonly authSubject: string;
    readonly settlementSimTime: string;
  },
): Promise<Readonly<CentralBankOmoLockedOriginals>> {
  let result;
  try {
    result = await tx.query<Record<string, unknown>>(
      CENTRAL_BANK_OMO_ORIGINAL_QUERY,
      [
        input.worldId,
        input.countryId,
        input.securityRef,
        input.batchRef,
        input.workerId,
        input.observedAtReal,
        input.authSubject,
        input.settlementSimTime,
      ],
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      ['55000', '42501', '23514', '54000'].includes(String(error.code)) &&
      /^CB_OMO_[A-Z_]+$/u.test(String(error.message))
    ) {
      const failure = new CentralBankOmoOriginalsMissing([
        String(error.message),
      ]);
      Object.defineProperty(failure, 'cause', { value: error });
      throw failure;
    }
    throw error;
  }
  const r = result.rows[0];
  if (result.rows.length !== 1 || !r)
    throw new CentralBankOmoOriginalsMissing([
      'ADOPTED_HOLDING_TERMS_AND_CURRENT_QUOTE',
    ]);
  const original = objectBytes<CentralBankOmoOriginal>(
    r.original_text,
    r.original_sha256,
  );
  const quote = objectBytes<CentralBankOmoSourceFacts['quote']>(
    r.quote_text,
    r.quote_sha256,
  );
  if (
    original.schemaVersion !== 'central-bank-omo-original-v1' ||
    original.worldId !== input.worldId ||
    original.countryId !== input.countryId ||
    original.seedFingerprint !== r.seed_fingerprint ||
    original.sourceRef !== r.source_ref ||
    original.sourceRevision !== r.source_revision ||
    quote.securityRef !== input.securityRef ||
    quote.batchRef !== input.batchRef ||
    quote.sourceRef !== original.sourceRef ||
    !['ADMITTED_ORIGINAL', 'TEST_ONLY'].includes(String(r.source_class))
  )
    invalidCentralBankOmoOriginal('ADOPTED_EXACT_SCOPE_REQUIRED');
  return Object.freeze({
    original,
    quote,
    sourceClass: r.source_class as 'ADMITTED_ORIGINAL' | 'TEST_ONLY',
    row: r,
    binding: Object.freeze({
      adoptionRef: exactOmoText(r.adoption_ref),
      admissionRef: exactOmoText(r.admission_ref),
      admissionRevision: exactOmoText(r.admission_revision),
      sourceRef: original.sourceRef,
      sourceRevision: original.sourceRevision,
      originalSHA256: exactOmoText(r.original_sha256),
      quoteSHA256: exactOmoText(r.quote_sha256),
      seedFingerprint: original.seedFingerprint,
      canonicalSeedSHA256: exactOmoText(r.canonical_seed_sha256),
    }),
  });
}
/** Only independently admitted exact bytes can be registered by the separated
 * publisher. This accepts no admission/grant/Ready boolean and changes no ledger. */
export async function publishCentralBankOmoOriginals(input: {
  readonly database: SqlDatabase;
  readonly adoptionRef: string;
  readonly original: Readonly<CentralBankOmoOriginal>;
  readonly quote: Readonly<CentralBankOmoSourceFacts['quote']>;
}): Promise<void> {
  await input.database.transaction(async (tx) => {
    await tx.query(
      'select world_v2.publish_central_bank_omo_originals($1,$2,$3)',
      [
        input.adoptionRef,
        canonicalSerialize(input.original),
        canonicalSerialize(input.quote),
      ],
    );
  });
}
