/** Fixed Workers-compatible source adapter. Reconstruction reads one sealed
 * small row plus the complete bounded zero-posting Budget prefix. No whole
 * opening payload, process-local H0 preparation, Ready flag or new authority. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalHashInput,
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
} from '@econmind/core';
import {
  parseFinanceBudgetCapacityData,
  readFinanceBudgetCapacityData,
} from '@econmind/core/finance-budget-capacity-data';
import type { FinanceNativeBudgetPolicy } from '@econmind/core/finance-budget-native';
import { readBoundedFinanceBudgetHistoryFrom } from './bounded-finance-budget-history.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
declare const capacitySource: unique symbol;
export interface PostgresFinanceBudgetCapacitySource {
  readonly [capacitySource]: true;
}
const sources = new WeakMap<
  PostgresFinanceBudgetCapacitySource,
  { worldId: string; countryId: string; expectedRawSourceSHA256: string | null }
>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Budget capacity source: ' + message,
  );
}
export function createPostgresFinanceBudgetCapacitySource(config: {
  readonly worldId: string;
  readonly countryId: string;
  readonly expectedRawSourceSHA256?: string;
}): PostgresFinanceBudgetCapacitySource {
  if (
    !config.worldId ||
    !config.countryId ||
    (config.expectedRawSourceSHA256 !== undefined &&
      !/^[a-f0-9]{64}$/u.test(config.expectedRawSourceSHA256))
  )
    invalid('exact server selectors/hash required');
  const port = Object.freeze({}) as PostgresFinanceBudgetCapacitySource;
  sources.set(port, {
    worldId: config.worldId,
    countryId: config.countryId,
    expectedRawSourceSHA256: config.expectedRawSourceSHA256 ?? null,
  });
  return port;
}
export function isPostgresFinanceBudgetCapacitySource(
  value: unknown,
  worldId: string,
): value is PostgresFinanceBudgetCapacitySource {
  return (
    !!value &&
    typeof value === 'object' &&
    sources.get(value as PostgresFinanceBudgetCapacitySource)?.worldId ===
      worldId
  );
}
export async function readPostgresFinanceBudgetCapacitySourceFrom(input: {
  readonly source: PostgresFinanceBudgetCapacitySource;
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly command: CanonicalCommand;
  readonly policy: FinanceNativeBudgetPolicy;
  readonly sourceRow: Readonly<Record<string, unknown>>;
  readonly workerId: string;
  readonly observedAtReal: string;
}) {
  const config = sources.get(input.source),
    c = input.command,
    tx = input.executor;
  validateCanonicalCommand(c, sha);
  if (
    !config ||
    config.worldId !== c.worldId ||
    config.countryId !== c.countryId
  )
    invalid('exact source scope required');
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
    c.authSubject,
  ]);
  const rows = await tx.query<{
    capacity_ref: string;
    source_text: string;
    source_sha256: string;
    canonical_seed_sha256: string;
  }>(
    'select * from world_v2.read_finance_budget_capacity($1,$2,$3,$4,$5,$6::timestamptz)',
    [
      c.worldId,
      c.countryId,
      input.policy.envelopeRef,
      input.policy.effectivePeriodRef,
      input.workerId,
      input.observedAtReal,
    ],
  );
  if (rows.rows.length !== 1) invalid('sealed source unavailable');
  const row = rows.rows[0]!;
  if (
    typeof row.source_text !== 'string' ||
    Buffer.byteLength(row.source_text) > 65536 ||
    sha(row.source_text) !== row.source_sha256 ||
    (config.expectedRawSourceSHA256 !== null &&
      config.expectedRawSourceSHA256 !== row.source_sha256)
  )
    invalid('sealed source bytes/hash mismatch');
  const data = parseFinanceBudgetCapacityData(JSON.parse(row.source_text)),
    p = readFinanceBudgetCapacityData(data);
  if (
    p.worldId !== c.worldId ||
    p.countryId !== c.countryId ||
    p.seedId !== input.sourceRow.seed_id ||
    p.seedFingerprint !== input.sourceRow.seed_fingerprint ||
    p.admissionRef !== input.sourceRow.admission_ref ||
    p.governmentEntityId !== input.policy.governmentEntityId ||
    p.treasury.assetAccount.currency !== input.policy.currency ||
    p.canonicalSeedSha256 !== 'sha256:' + row.canonical_seed_sha256
  )
    invalid('sealed source differs from actual admitted policy');
  const prefix = await readBoundedFinanceBudgetHistoryFrom({
    executor: tx,
    database: input.database,
    worldId: c.worldId,
    expectedWorldVersion: c.expectedWorldVersion,
  });
  const openingEncumbrances = Object.freeze([
    Object.freeze({
      reference:
        'OPENING_FUNDING_TOTAL_' +
        p.openingFunding.recordsSha256.slice(7).toUpperCase(),
      accountId: p.treasury.assetAccount.accountId,
      amount: p.openingFunding.totalAmount,
      currency: p.treasury.assetAccount.currency,
    }),
  ]);
  return Object.freeze({
    policy: input.policy,
    capacityData: data,
    binding: Object.freeze({
      seedRef: p.seedId,
      seedFingerprint: p.seedFingerprint,
      admissionRef: p.admissionRef,
      financialSourceId: p.financialSourceId,
      originalsSHA256: p.financialOriginalsSha256,
      policyHash: hash(input.policy),
      treasuryAccountId: p.treasury.assetAccount.accountId,
      treasuryClaimId: p.treasury.assetAccount.claimId!,
      openingEncumbranceHash: hash(openingEncumbrances),
      capacityProjectionFingerprint: hash(p),
    }),
    openingEncumbrances,
    frames: prefix.frames,
    worldVersion: prefix.head.world_version,
    eventSequence: prefix.head.event_sequence,
  });
}
