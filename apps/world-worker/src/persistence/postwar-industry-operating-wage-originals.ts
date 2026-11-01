/** Fixed wage/population/funding projection from private prepared originals.
 * This produces DATA only; SQL/current-context issuers protect its inputs. */
import { createHash } from 'node:crypto';
import { readPostwarIndustryCompletedWorkOriginalFrom } from './postwar-industry-completed-work-original.js';
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
  Money,
} from '@econmind/core';
import type { IndustryCompletedWorkData } from '@econmind/core/industry-first-day-work';
import type { IndustryOperatingWageSource } from '@econmind/core/industry-operating-wage-payment';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import type { PostwarIndustryFirstDaySourceData } from './postwar-industry-first-day-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_OPERATING_WAGE_SOURCE:' + s,
  );
}
export function projectPostwarIndustryOperatingWageSource(input: {
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
  firstdayOriginal: Readonly<PostwarIndustryFirstDaySourceData>;
  workData: Readonly<IndustryCompletedWorkData>;
  maximumExpense: Readonly<{ amount: string; currency: string }>;
}): Readonly<IndustryOperatingWageSource> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline),
    d = input.workData,
    o = input.firstdayOriginal;
  if (
    b.pins.worldId !== d.worldId ||
    b.pins.seedRef !== d.seedId ||
    b.pins.contentHash !== d.seedFingerprint ||
    b.pins.admissionRef !== d.admissionRef ||
    o.sourceRef !== d.policy.sourceRef ||
    o.rawSha256 !== d.policy.sourceRawSha256 ||
    sha(o.rawText) !== o.rawSha256 ||
    o.data.operatorId !== d.operatorId ||
    o.data.facilityId !== d.facilityId ||
    o.data.locationId !== d.locationId ||
    o.data.seedFingerprint !== d.seedFingerprint ||
    o.data.admissionRef !== d.admissionRef
  )
    invalid('EXACT_REGISTERED_SOURCE_AND_WORK_PINS_REQUIRED');
  const document = b.document;
  const fundingAccounts = document.inputs.fundingAccounts.filter(
    (a) =>
      a.countryId === d.countryId &&
      a.payerEntityId === d.operatorId &&
      a.payerRole === 'OP' &&
      a.accountClass === 'BUSINESS_DEPOSIT_ASSET',
  );
  if (fundingAccounts.length !== 1)
    invalid('ACTUAL_SHARED_OP_RESERVATIONS_REQUIRED');
  const funding = fundingAccounts[0]!;
  // Canonical original instrument identity is independently checked by Core's
  // private opening classification. No 119MB seed/source reparse or parent copy.
  const householdAccountId = `ACCOUNT_${sha(canonicalSerialize([d.worldId, d.countryId, 'HOUSEHOLD_DEPOSIT_ASSET', funding.currency])).toUpperCase()}`;
  if (
    !b.financialAccounts.some(
      (a) =>
        a.accountId === householdAccountId &&
        a.accountClass === 'ASSET' &&
        a.counterpartyEntityId === funding.issuerEntityId &&
        a.currency === funding.currency,
    )
  )
    invalid('ACTUAL_ORIGINAL_HOUSEHOLD_CLAIM_REQUIRED');
  const encumbrances = b.funding.filter(
    (f) =>
      f.fundingId === funding.accountRef &&
      f.accountId === funding.accountRef &&
      f.countryId === d.countryId &&
      f.payerEntityId === d.operatorId &&
      f.currency === funding.currency &&
      Money.from(f.ceilingAmount, f.currency).toCanonicalValue().amount ===
        Money.from(funding.reservedAmount, funding.currency).toCanonicalValue()
          .amount,
  );
  if (encumbrances.length !== 1)
    invalid('EXACT_AGGREGATE_OPENING_ENCUMBRANCE_REQUIRED');
  const wages: IndustryOperatingWageSource['wages'][number][] = [];
  const sitePositions = document.inputs.sourcePositions.filter(
    (p) =>
      p.sourceBucket === 'INDUSTRY' &&
      p.sourceObjectId === d.facilityId &&
      p.countryId === d.countryId &&
      p.locationId === d.locationId &&
      p.employerId === d.operatorId &&
      p.employerRole === 'OP',
  );
  if (
    !sitePositions.length ||
    sitePositions.length > 3 ||
    d.allocations.some(
      (a) => !sitePositions.some((p) => p.positionId === a.positionId),
    )
  )
    invalid('EXACT_REGISTERED_SITE_POSITION_SET_REQUIRED');
  for (const positionId of sitePositions.map((p) => p.positionId).sort()) {
    const wagesFor = document.inputs.labour.positions.filter(
        (p) => p.positionId === positionId,
      ),
      positions = document.inputs.sourcePositions.filter(
        (p) => p.positionId === positionId,
      ),
      people = document.inputs.populationPositionRefs.filter(
        (p) => p.positionId === positionId,
      ),
      funds = document.inputs.positionFunding.filter(
        (p) => p.positionId === positionId,
      );
    if ([wagesFor, positions, people, funds].some((a) => a.length !== 1))
      invalid('EXACT_POSITION_WAGE_POPULATION_FUNDING_JOIN_REQUIRED');
    const w = wagesFor[0]!,
      p = positions[0]!,
      r = people[0]!,
      f = funds[0]!;
    if (
      w.employerRole !== 'OP' ||
      w.employerId !== d.operatorId ||
      w.countryId !== d.countryId ||
      w.locationId !== d.locationId ||
      w.wagePeriod !== 'SIM_YEAR' ||
      p.personRange.poolId !== r.sourcePoolId ||
      p.personRange.startOrdinal !== r.sourceStartOrdinal ||
      p.filledCount !== r.count ||
      r.regionId !== d.locationId ||
      f.accountRef !== funding.accountRef ||
      f.payerEntityId !== d.operatorId ||
      f.currency !== w.wageCurrency
    )
      invalid('ACTUAL_POSITION_SOURCE_SCOPE_DIFFERS');
    for (const a of d.allocations.filter((a) => a.positionId === positionId))
      if (
        a.poolId !== r.sourcePoolId ||
        a.cohortRef !== r.cohortId ||
        a.skill !== w.skill ||
        BigInt(a.sourceStartOrdinal) < BigInt(r.sourceStartOrdinal) ||
        BigInt(a.sourceStartOrdinal) + BigInt(a.count) >
          BigInt(r.sourceStartOrdinal) + BigInt(r.count) ||
        BigInt(a.startOrdinal) !==
          BigInt(r.startOrdinal) +
            BigInt(a.sourceStartOrdinal) -
            BigInt(r.sourceStartOrdinal)
      )
        invalid('ACTUAL_WORK_PERSON_COORDINATE_DIFFERS');
    wages.push({
      positionId,
      poolId: r.sourcePoolId,
      cohortRef: r.cohortId,
      skill: w.skill,
      sourceStartOrdinal: r.sourceStartOrdinal,
      firstPersonOrdinal: r.startOrdinal,
      personCount: r.count,
      annualWage: Money.from(w.wageAmount, w.wageCurrency).toCanonicalValue()
        .amount,
      currency: w.wageCurrency,
      wagePeriod: 'SIM_YEAR',
      wageVersion: w.wageVersion,
      sourceRef: w.payrollFundingRef,
      reservationId: f.fundingRef,
      reservedAmount: Money.from(f.amount, f.currency).toCanonicalValue()
        .amount,
    });
  }
  return Object.freeze({
    worldId: d.worldId,
    countryId: d.countryId,
    locationId: d.locationId,
    facilityId: d.facilityId,
    operatorId: d.operatorId,
    runId: d.runId,
    seedId: d.seedId,
    seedFingerprint: d.seedFingerprint,
    admissionRef: d.admissionRef,
    schedule: d.schedule,
    policy: d.policy,
    householdAccountId,
    maximumExpense: Object.freeze({
      amount: Money.from(
        input.maximumExpense.amount,
        input.maximumExpense.currency,
      ).toCanonicalValue().amount,
      currency: input.maximumExpense.currency,
    }),
    openingEncumbranceRef: encumbrances[0]!.fundingId,
    openingReservedAmount: Money.from(
      funding.reservedAmount,
      funding.currency,
    ).toCanonicalValue().amount,
    wages: Object.freeze(wages),
  });
}

/** Historical source DATA only. Never calls whole paged replay recursively. */
export async function readPostwarIndustryOperatingWagePageOriginalsFrom(
  tx: import('./sql-database.js').SqlExecutor,
  input: {
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    hostCountryId: string;
    officeId: 'SOCIAL' | 'FINANCE';
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
    frames: readonly import('@econmind/core/finance-budget-native').FinanceNativeBudgetCanonicalFrame[];
  },
): Promise<
  Readonly<{
    industryWageSources: readonly Readonly<IndustryOperatingWageSource>[];
  }>
> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (b.pins.worldId !== input.worldId) invalid('SAME_WORLD_BASE_REQUIRED');
  const sources = new Map<string, Readonly<IndustryOperatingWageSource>>();
  for (const frame of input.frames) {
    if (frame.command.commandType !== 'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1')
      continue;
    const intent = JSON.parse(frame.command.canonicalPayload) as Record<
      string,
      unknown
    >;
    if (
      typeof intent.workEventId !== 'string' ||
      typeof intent.workEventFingerprint !== 'string'
    )
      invalid('EXACT_CANONICAL_WAGE_WORK_REFERENCE_REQUIRED');
    const original = await readPostwarIndustryCompletedWorkOriginalFrom(tx, {
      baseline: input.baseline,
      worldId: input.worldId,
      hostCountryId: input.hostCountryId,
      officeId: input.officeId,
      sourceCountryId: frame.command.countryId,
      workEventId: intent.workEventId,
      workEventFingerprint: intent.workEventFingerprint,
      expectedHead: input.expectedHead,
    });
    if (
      BigInt(original.worldVersion) >=
      BigInt(frame.transition.worldVersionAfter)
    )
      invalid('DISTINCT_PRIOR_COMMITTED_WORK_REQUIRED');
    const source = projectPostwarIndustryOperatingWageSource({
        baseline: input.baseline,
        firstdayOriginal: original.firstdayOriginal,
        workData: original.body,
        maximumExpense: original.maximumExpense,
      }),
      key = source.countryId + '\0' + source.facilityId + '\0' + source.runId,
      prior = sources.get(key);
    if (prior && canonicalSerialize(prior) !== canonicalSerialize(source))
      invalid('IMMUTABLE_RUN_WAGE_SOURCE_CHANGED');
    sources.set(key, source);
  }
  return Object.freeze({
    industryWageSources: Object.freeze([...sources.values()]),
  });
}
