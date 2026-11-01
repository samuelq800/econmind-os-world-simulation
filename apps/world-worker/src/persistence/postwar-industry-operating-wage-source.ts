/** Fixed current-source DATA reader for actual completed-work wages. No work,
 * admission, automatic grant, arbitrary candidate callback or SQL write. */
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
  type CanonicalCommand,
} from '@econmind/core';
import {
  readIndustryCompletedWork,
  type IndustryCompletedWork,
} from '@econmind/core/industry-first-day-work';
import {
  prepareIndustryOperatingWagePayment,
  type IndustryOperatingWageSource,
  type IndustryOperatingWageState,
  type IndustryOperatingWageResult,
} from '@econmind/core/industry-operating-wage-payment';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import { projectPostwarIndustryOperatingWageSource } from './postwar-industry-operating-wage-originals.js';
import { readPostwarIndustryFirstDaySourceFrom } from './postwar-industry-first-day-source.js';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';
import type { SqlExecutor } from './sql-database.js';
import { createHash } from 'node:crypto';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_OPERATING_WAGE_SOURCE:' + s,
  );
}
export interface IndustryOperatingWageSourceData {
  readonly classification: 'CURRENT_WORK_WAGE_SOURCE_DATA_NOT_AUTHORITY';
  readonly source: Readonly<IndustryOperatingWageSource>;
}
interface Lease {
  readonly tx: SqlExecutor;
  readonly lineage: ValidatedCanonicalLineageView;
  readonly work: IndustryCompletedWork;
  readonly social: Readonly<PostwarSocialRuntimeConnection>;
}
const leases = new WeakMap<object, Lease>();
export async function readIndustryOperatingWageSourceFrom(
  tx: SqlExecutor,
  input: {
    lineage: ValidatedCanonicalLineageView;
    work: IndustryCompletedWork;
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  },
): Promise<Readonly<IndustryOperatingWageSourceData>> {
  const actual = readValidatedCanonicalLineageFrom(tx, input.lineage),
    work = readIndustryCompletedWork(input.work),
    d = work.data;
  if (
    actual.worldId !== d.worldId ||
    actual.seed.seedId !== d.seedId ||
    actual.seed.fingerprint !== d.seedFingerprint ||
    actual.transitions.length > 256
  )
    invalid('ACTUAL_SOURCE_SEED_AND_BOUNDED_PREFIX_REQUIRED');
  const matches = actual.transitions.filter(
    (f) => f.command.commandId === work.frame.command.commandId,
  );
  if (
    matches.length !== 1 ||
    canonicalSerialize(matches[0]) !==
      canonicalSerialize({
        command: work.frame.command,
        transition: work.frame.transition,
        inventoryPostings: work.frame.inventoryPostings,
        financialPostingBatches: work.frame.financialPostingBatches,
        receipt: work.frame.receipt,
      })
  )
    invalid('EXACT_ACTUAL_COMMITTED_WORK_ORIGINAL_REQUIRED');
  const base = readPostwarSocialRuntimeFinancialReplayBase(
      input.socialConnection,
      d.worldId,
    ),
    b = consumePreparedPostwarSocialFinancialReplayBase(base);
  if (
    b.pins.seedRef !== d.seedId ||
    b.pins.contentHash !== d.seedFingerprint ||
    b.pins.admissionRef !== d.admissionRef
  )
    invalid('EXACT_PREPARED_SOURCE_AND_ADMISSION_REQUIRED');
  const registered = await readPostwarIndustryFirstDaySourceFrom(tx, {
    worldId: d.worldId,
    countryId: d.countryId,
    facilityId: d.facilityId,
    head: {
      worldVersion: actual.headWorldVersion,
      eventSequence: actual.headEventSequence,
    },
    expectedPins: {
      seedId: d.seedId,
      seedFingerprint: d.seedFingerprint,
      admissionRef: d.admissionRef,
    },
  });
  if (!registered) invalid('REGISTERED_WORK_SOURCE_MISSING');
  if (
    registered.sourceRef !== d.policy.sourceRef ||
    registered.rawSha256 !== d.policy.sourceRawSha256 ||
    registered.data.operatorId !== d.operatorId
  )
    invalid('ACTUAL_CURRENT_WORK_POLICY_SOURCE_DIFFERS');
  const schedules = actual.transitions.filter(
    (f) =>
      f.command.commandId === d.schedule.commandId &&
      f.command.fingerprint === d.schedule.commandFingerprint &&
      f.command.commandType === 'CORE_INDUSTRY_RUN_SCHEDULE_V1' &&
      f.receipt.outcome === 'COMMITTED',
  );
  if (schedules.length !== 1) invalid('ACTUAL_COMMITTED_RUN_ORIGINAL_REQUIRED');
  const schedule = JSON.parse(schedules[0]!.command.canonicalPayload) as {
    maximumExpense?: { amount?: unknown; currency?: unknown };
  };
  if (
    typeof schedule.maximumExpense?.amount !== 'string' ||
    typeof schedule.maximumExpense.currency !== 'string'
  )
    invalid('ACTUAL_RUN_EXPENSE_CEILING_REQUIRED');
  const source = projectPostwarIndustryOperatingWageSource({
    baseline: base,
    firstdayOriginal: registered,
    workData: d,
    maximumExpense: {
      amount: schedule.maximumExpense.amount,
      currency: schedule.maximumExpense.currency,
    },
  });
  const result = Object.freeze({
    classification: 'CURRENT_WORK_WAGE_SOURCE_DATA_NOT_AUTHORITY' as const,
    source,
  });
  leases.set(result, {
    tx,
    lineage: input.lineage,
    work: input.work,
    social: input.socialConnection,
  });
  return result;
}
/** Conditional finite calculation only. The installed sole consumer must still
 * protect actual source/clock/head/authority through Atomic BEFORE_EVENTS. */
export function prepareIndustryOperatingWageFromSource(
  tx: SqlExecutor,
  input: {
    sourceData: Readonly<IndustryOperatingWageSourceData>;
    command: CanonicalCommand;
    state: IndustryOperatingWageState;
    observedAtReal: string;
  },
): Readonly<IndustryOperatingWageResult> {
  const lease = leases.get(input.sourceData);
  if (!lease || lease.tx !== tx)
    invalid('GENUINE_SAME_EXECUTOR_SOURCE_DATA_REQUIRED');
  const data = readValidatedCanonicalLineageFrom(tx, lease.lineage);
  if (
    data.worldId !== input.command.worldId ||
    data.headWorldVersion !== input.command.expectedWorldVersion
  )
    invalid('ACTUAL_CURRENT_HEAD_REQUIRED');
  const base = readPostwarSocialRuntimeFinancialReplayBase(
    lease.social,
    data.worldId,
  );
  const receipts = readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(
    base,
  )?.filter((r) => r.countryId === input.command.countryId);
  if (receipts && receipts.length !== 1)
    invalid('EXACT_BENEFICIAL_COUNTRY_RECEIPT_REQUIRED');
  return prepareIndustryOperatingWagePayment({
    command: input.command,
    source: input.sourceData.source,
    work: lease.work,
    state: input.state,
    financial: data.ledgers.financial,
    ...(receipts ? { beneficialReceipt: receipts[0]! } : {}),
    eventSequence: (BigInt(data.headEventSequence) + 1n).toString(),
    observedAtReal: input.observedAtReal,
    sha256Hex: sha,
  });
}
