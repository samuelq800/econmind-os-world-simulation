/** Existing E03 employment projected to its original industrial facility.
 * Headcount is not attendance, completed work, a person-day, or a payment.
 * Only the held canonical-lineage entrypoint issues observations. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
} from '@econmind/core';
import {
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetMixedPrefixEvidence,
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import type { PostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import { replayPostwarSharedOfficePrefix } from './postwar-shared-office-prefix.js';
import type { SqlExecutor } from './sql-database.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
const issued = new WeakSet<object>();
function invalid(reason: string): never {
  throw Error(`POSTWAR_INDUSTRY_LABOUR:${reason}`);
}
function whole(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) invalid('CANONICAL_HEADCOUNT_REQUIRED');
  return BigInt(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export interface PostwarIndustryLabourScope {
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
}
type Originals = Pick<
  PostwarSocialEmploymentStateDocument['inputs'],
  'sourcePositions' | 'populationPositionRefs' | 'labour' | 'positionFunding'
>;
function uniqueBy<T>(values: readonly T[], key: (value: T) => string) {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) invalid('DUPLICATE_POSITION_ORIGINAL');
    result.set(id, value);
  }
  return result;
}

/** Pure DTO join only. Calling this function never issues an observation,
 * proves currentness/admission, or removes a production source guard. */
export function projectPostwarIndustryLabourAllocation(input: {
  readonly scope: PostwarIndustryLabourScope;
  readonly originals: Originals;
  readonly evidence: FinanceNativeBudgetMixedPrefixEvidence;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
}) {
  const { originals, scope } = input;
  const replay = readFinanceNativeBudgetMixedPrefix(
    input.evidence,
    scope.worldId,
    input.frames,
    digest,
  );
  if (
    replay.budgetState.worldVersion !== input.head.worldVersion ||
    replay.budgetState.eventSequence !== input.head.eventSequence
  )
    invalid('COMPLETE_CURRENT_PREFIX_REQUIRED');
  const countries = replay.socialCountries.filter(
    (c) => c.countryId === scope.countryId,
  );
  if (countries.length !== 1) invalid('EXACT_REPLAYED_COUNTRY_REQUIRED');
  const sources = uniqueBy(originals.sourcePositions, (p) => p.positionId),
    contracts = uniqueBy(originals.labour.positions, (p) => p.positionId),
    population = uniqueBy(
      originals.populationPositionRefs,
      (p) => p.positionId,
    ),
    funding = uniqueBy(originals.positionFunding, (p) => p.positionId),
    current = uniqueBy(
      countries[0]!.lifecycle.employment.labour.positions,
      (p) => p.positionId,
    );
  // Source pool coordinates are globally exclusive, including other facilities
  // and countries. This is the existing opening partition, never attendance.
  const ranges = new Map<string, { start: bigint; end: bigint }[]>();
  for (const p of sources.values()) {
    const start = whole(p.personRange.startOrdinal),
      count = whole(p.personRange.count);
    if (count !== whole(p.filledCount))
      invalid('OPENING_PERSON_RANGE_MISMATCH');
    const existing = ranges.get(p.personRange.poolId) ?? [];
    if (
      count > 0n &&
      existing.some((r) => start < r.end && start + count > r.start)
    )
      invalid('DUPLICATE_OPENING_POPULATION_OCCUPATION');
    if (count > 0n) existing.push({ start, end: start + count });
    ranges.set(p.personRange.poolId, existing);
  }
  const matching = [...sources.values()].filter(
    (p) => p.sourceObjectId === scope.facilityId,
  );
  if (!matching.length) invalid('FACILITY_POSITION_ORIGINAL_MISSING');
  const skills = new Set<string>();
  const positions = matching
    .map((original) => {
      const contract = contracts.get(original.positionId),
        people = population.get(original.positionId),
        payment = funding.get(original.positionId),
        actual = current.get(original.positionId);
      if (!contract || !people || !payment || !actual)
        invalid('COMPLETE_FACILITY_POSITION_JOIN_REQUIRED');
      if (
        original.countryId !== scope.countryId ||
        original.locationId !== scope.locationId ||
        original.employerId !== scope.operatorId ||
        original.employerRole !== 'OP' ||
        original.owner !== 'PRIVATE_SECTOR' ||
        original.sourceBucket !== 'INDUSTRY' ||
        original.occupation !== 'GENERAL' ||
        skills.has(original.skill)
      )
        invalid('EXACT_FACILITY_COUNTRY_REGION_OP_SKILL_REQUIRED');
      skills.add(original.skill);
      for (const key of [
        'positionId',
        'countryId',
        'locationId',
        'skill',
        'owner',
        'classificationId',
        'requiredCount',
      ] as const)
        if (original[key] !== contract[key] || original[key] !== actual[key])
          invalid('CURRENT_POSITION_SCOPE_OR_REQUIREMENT_CHANGED');
      if (
        contract.employerId !== scope.operatorId ||
        contract.employerRole !== 'OP' ||
        contract.occupation !== original.occupation ||
        people.regionId !== scope.locationId ||
        people.count !== original.filledCount ||
        people.sourcePoolId !== original.personRange.poolId ||
        people.sourceStartOrdinal !== original.personRange.startOrdinal ||
        payment.countryId !== scope.countryId ||
        payment.locationId !== scope.locationId ||
        payment.payerEntityId !== scope.operatorId ||
        payment.kind !== 'PAYROLL' ||
        payment.filledCount !== original.filledCount ||
        payment.currency !== contract.wageCurrency ||
        payment.payrollFundingRef !== contract.payrollFundingRef
      )
        invalid('EXACT_POPULATION_EMPLOYER_PAYROLL_JOIN_REQUIRED');
      if (
        whole(actual.employedCount) > whole(actual.requiredCount) ||
        whole(original.filledCount) > whole(original.requiredCount)
      )
        invalid('EMPLOYMENT_EXCEEDS_POSITION_CAPACITY');
      return {
        positionId: original.positionId,
        skill: original.skill,
        classificationId: original.classificationId,
        requiredCount: original.requiredCount,
        openingFilledCount: original.filledCount,
        currentEmployedCount: actual.employedCount,
        openingPopulationReference: { ...people },
        payrollFundingRef: contract.payrollFundingRef,
        wageVersion: contract.wageVersion,
        wageAmount: contract.wageAmount,
        wageCurrency: contract.wageCurrency,
        wagePeriod: contract.wagePeriod,
      };
    })
    .sort((a, b) => a.positionId.localeCompare(b.positionId));
  return freeze({
    classification: 'EMPLOYMENT_HEADCOUNT_NOT_COMPLETED_WORK' as const,
    scope: { ...scope },
    positions,
    currentEmployedCount: positions
      .reduce((n, p) => n + whole(p.currentEmployedCount), 0n)
      .toString(),
    requiredCount: positions
      .reduce((n, p) => n + whole(p.requiredCount), 0n)
      .toString(),
    completedPersonDays: null,
  });
}
export type PostwarIndustryLabourAllocation = ReturnType<
  typeof projectPostwarIndustryLabourAllocation
>;
export interface PostwarIndustryLabourObservation {
  readonly classification: 'VALIDATED_PREFIX_EMPLOYMENT_NOT_AUTHORITY';
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly seedFingerprint: string;
  readonly sourceRevision: string;
  readonly sourceChecksumsSha256: string;
  readonly prefixFingerprint: string;
  readonly allocationFingerprint: string;
  readonly allocation: PostwarIndustryLabourAllocation;
}
export function assertPostwarIndustryLabourObservation(
  value: unknown,
): asserts value is PostwarIndustryLabourObservation {
  if (value === null || typeof value !== 'object' || !issued.has(value))
    invalid('GENUINE_HELD_LINEAGE_OBSERVATION_REQUIRED');
}

/** No SQL/authority constructor: consumes an active same-executor view issued
 * only by the existing real durable reader. Every global frame is replayed by
 * the shared Core validator; unknown families fail closed, including at H>0.
 * Source/admission/role locks remain the caller's responsibility. */
export function readPostwarIndustryLabourFrom(input: {
  readonly executor: SqlExecutor;
  readonly lineageView: ValidatedCanonicalLineageView;
  readonly command: CanonicalCommand;
  readonly scope: PostwarIndustryLabourScope;
  readonly seedFingerprint: string;
  readonly eventSequence: string;
}): Readonly<PostwarIndustryLabourObservation> {
  const command = validateCanonicalCommand(input.command, digest),
    lineage = readValidatedCanonicalLineageFrom(
      input.executor,
      input.lineageView,
    ),
    scope = input.scope;
  if (
    command.officeId !== 'INDUSTRY' ||
    command.worldId !== scope.worldId ||
    command.countryId !== scope.countryId ||
    lineage.worldId !== scope.worldId ||
    lineage.seed.fingerprint !== input.seedFingerprint ||
    lineage.headWorldVersion !== command.expectedWorldVersion ||
    lineage.headEventSequence !== input.eventSequence
  )
    invalid('EXACT_COMMAND_SOURCE_AND_CURRENT_HEAD_REQUIRED');
  const operating = readPostwarOperatingGenesisFromSeed(lineage.seed);
  if (!operating.socialEmployment) invalid('ADOPTED_E03_ORIGINAL_MISSING');
  const shared = replayPostwarSharedOfficePrefix({
    lineage,
    document: operating.socialEmployment,
  });
  const allocation = projectPostwarIndustryLabourAllocation({
    scope,
    originals: operating.socialEmployment.inputs,
    evidence: shared.evidence,
    frames: lineage.transitions.map((frame) => ({
      ...frame,
      events: frame.transition.events,
    })),
    head: shared.head,
  });
  const observation: PostwarIndustryLabourObservation = freeze({
    classification: 'VALIDATED_PREFIX_EMPLOYMENT_NOT_AUTHORITY',
    head: shared.head,
    seedFingerprint: shared.seed.fingerprint,
    sourceRevision: shared.sourceRevision,
    sourceChecksumsSha256: shared.sourceChecksumsSha256,
    prefixFingerprint: shared.prefixFingerprint,
    allocationFingerprint: hash(allocation),
    allocation,
  });
  issued.add(observation);
  return observation;
}
