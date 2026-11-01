/** Pure evidence checks, not a source/admission/permission issuer. The native
 * source guard must additionally compare these pins with its actual seed and
 * protected original records. No maintenance, technology right or payment is
 * created by accepting the bounded opening rule. */
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { countryId, legalEntityId, openingSeedId, worldId } from '../ids.js';
import { Quantity } from '../numeric/quantity.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import { SIMULATION_TICKS_PER_DAY } from '../time/simulation-clock.js';
import type { ExactQuantity, ExactUnitRate } from '../engine-kernels/common.js';

export const PRODUCTION_OPENING_SERVICEABILITY_BASIS =
  'OPENING_SERVICEABLE_NOT_COMPLETED_MAINTENANCE' as const;
export const INDUSTRY_FIRST_DAY_POLICY_VERSION =
  'INDUSTRY_FIRST_DAY_20261101_V1' as const;
export const INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256 =
  '99ede2cbf1bb7b04d3fe5d99cf101c47ed055b2e12b8ca9080cfc2a43b3d086c' as const;
export const INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256 =
  '8d5fb70a2b2250201d623aa7898a95d48540083d6fa316a1b8e920abca0fd9d6' as const;

export interface ProductionOpeningBasisSource {
  readonly schemaVersion: 'postwar-industry-first-day-basis-v1';
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_POLICY_VERSION;
  readonly policyRawSha256: string;
  readonly userAdoptionRawSha256: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityRef: string;
  readonly operatorId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly sourcePointer: string;
  readonly rightsScope: 'DOMESTIC_EXISTING_UNFRAGMENTED_OP_AGGREGATE';
  readonly openingWindowStartsAtSimTime: '0';
  readonly openingWindowEndsAtSimTime: typeof SIMULATION_TICKS_PER_DAY;
}
export interface ProductionOpeningServiceability extends ProductionOpeningBasisSource {
  readonly originalConditionFraction: '1';
}
export interface ProductionBaselineTechnologyNonrequirement extends ProductionOpeningBasisSource {
  readonly basis: 'EXISTING_SITE_REFINERY_RECIPE_COEFFICIENTS';
  readonly recipeFactRef: string;
  readonly recipeSourceRef: string;
  readonly recipeCanonicalPayload: string;
  readonly baselineProductivity: ExactUnitRate;
  /** An actual requirement cannot be waived by selecting this variant. */
  readonly baselineRequiredTechnologyRightRefs: readonly string[];
  /** Retained proposals only; none is granted, mastered or used as an upgrade. */
  readonly excludedUpgradeTechnologyRefs: readonly string[];
}
export interface ProductionOperatingBasisFields {
  readonly maintenanceAppliedRef: string | null;
  readonly maintenanceBasis?:
    'COMPLETED_MAINTENANCE' | typeof PRODUCTION_OPENING_SERVICEABILITY_BASIS;
  readonly openingServiceability?: ProductionOpeningServiceability;
  readonly technologyRightRef: string | null;
  readonly baselineTechnologyNonrequirement?: ProductionBaselineTechnologyNonrequirement;
}
export interface ProductionOpeningBasisScope {
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityRef: string;
  readonly operatorId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
}
const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const commonKeys = [
  'schemaVersion',
  'policyVersion',
  'policyRawSha256',
  'userAdoptionRawSha256',
  'worldId',
  'countryId',
  'facilityRef',
  'operatorId',
  'seedId',
  'seedFingerprint',
  'sourceRef',
  'sourceRawSha256',
  'sourcePointer',
  'rightsScope',
  'openingWindowStartsAtSimTime',
  'openingWindowEndsAtSimTime',
] as const;
function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID, message);
}
function ref(value: string, label: string): void {
  if (typeof value !== 'string' || !REF.test(value))
    invalid(`${label} requires explicit source evidence`);
}
function exact(value: object, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    invalid('Opening production basis requires exact source fields');
}
/** Native guards call this with actual source-owned seed/world/facility pins.
 * This comparison does not itself authenticate a caller-supplied source. */
export function assertProductionOpeningBasisScope(
  source: ProductionOpeningBasisSource,
  expected: ProductionOpeningBasisScope,
): void {
  if (
    !source ||
    typeof source !== 'object' ||
    source.schemaVersion !== 'postwar-industry-first-day-basis-v1' ||
    source.policyVersion !== INDUSTRY_FIRST_DAY_POLICY_VERSION ||
    source.policyRawSha256 !== INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256 ||
    source.userAdoptionRawSha256 !==
      INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256 ||
    source.rightsScope !== 'DOMESTIC_EXISTING_UNFRAGMENTED_OP_AGGREGATE' ||
    source.openingWindowStartsAtSimTime !== '0' ||
    source.openingWindowEndsAtSimTime !== SIMULATION_TICKS_PER_DAY
  )
    invalid('Adopted finite Industry opening policy and source scope required');
  worldId(source.worldId);
  countryId(source.countryId);
  legalEntityId(source.operatorId);
  openingSeedId(source.seedId);
  for (const key of ['facilityRef', 'sourceRef'] as const)
    ref(source[key], key);
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(source.seedFingerprint) ||
    !/^[a-f0-9]{64}$/u.test(source.sourceRawSha256) ||
    typeof source.sourcePointer !== 'string' ||
    source.sourcePointer.trim() !== source.sourcePointer ||
    !source.sourcePointer ||
    source.sourcePointer.length > 2048
  )
    invalid(
      'Opening production basis requires exact original pointers and hashes',
    );
  for (const key of [
    'worldId',
    'countryId',
    'facilityRef',
    'operatorId',
    'seedId',
    'seedFingerprint',
  ] as const)
    if (source[key] !== expected[key])
      invalid('Opening production basis source scope/seed mismatch');
}
const ticksPerUnit: Readonly<Record<string, string>> = Object.freeze({
  sim_millisecond: '1',
  sim_second: '1000',
  second: '1000',
  sim_minute: '60000',
  minute: '60000',
  sim_hour: '3600000',
  hour: '3600000',
  sim_day: SIMULATION_TICKS_PER_DAY,
  day: SIMULATION_TICKS_PER_DAY,
});
function withinOpeningDay(at: ExactQuantity, duration: ExactQuantity): void {
  if (at.unit !== 'sim_millisecond' || !/^(0|[1-9][0-9]*)$/u.test(at.amount))
    invalid('Opening production requires exact simulation ticks');
  const factor = ticksPerUnit[duration.unit];
  if (!factor)
    invalid(
      'Opening production duration requires an explicit simulation time unit',
    );
  const ticks = Quantity.from(duration.amount, duration.unit).amount.times(
    factor,
  );
  if (
    !ticks.isInteger() ||
    !ticks.greaterThan('0') ||
    BigInt(at.amount) >= BigInt(SIMULATION_TICKS_PER_DAY) ||
    BigInt(at.amount) + BigInt(ticks.toFixed(0)) >
      BigInt(SIMULATION_TICKS_PER_DAY)
  )
    invalid(
      'Opening serviceability/baseline technology is limited to the first simulation-day window',
    );
}
export function assertProductionOperatingBasis(input: {
  readonly operating: ProductionOperatingBasisFields;
  readonly scope: Omit<
    ProductionOpeningBasisScope,
    'seedId' | 'seedFingerprint'
  >;
  readonly snapshotAt: ExactQuantity;
  readonly operatingDuration: ExactQuantity;
  readonly recipeFactRef: string;
  readonly recipeSourceRef: string;
  readonly recipeCanonicalPayload: string;
  readonly productivity: ExactUnitRate;
}): void {
  const op = input.operating,
    opening = op.openingServiceability,
    baseline = op.baselineTechnologyNonrequirement;
  const source = opening ?? baseline;
  const check = (value: ProductionOpeningBasisSource) => {
    assertProductionOpeningBasisScope(value, {
      ...input.scope,
      seedId: source!.seedId,
      seedFingerprint: source!.seedFingerprint,
    });
    withinOpeningDay(input.snapshotAt, input.operatingDuration);
  };
  if (op.maintenanceAppliedRef !== null) {
    ref(op.maintenanceAppliedRef, 'maintenanceAppliedRef');
    if (
      opening !== undefined ||
      (op.maintenanceBasis !== undefined &&
        op.maintenanceBasis !== 'COMPLETED_MAINTENANCE')
    )
      invalid(
        'Completed maintenance and opening serviceability must remain distinct',
      );
  } else {
    if (
      op.maintenanceBasis !== PRODUCTION_OPENING_SERVICEABILITY_BASIS ||
      !opening
    )
      invalid(
        'Null maintenance requires explicit opening serviceability, never a completed-maintenance claim',
      );
    exact(opening, [...commonKeys, 'originalConditionFraction']);
    check(opening);
    if (opening.originalConditionFraction !== '1')
      invalid(
        'Opening serviceability requires original conditionFraction exactly one',
      );
  }
  if (op.technologyRightRef !== null) {
    ref(op.technologyRightRef, 'technologyRightRef');
    if (baseline !== undefined)
      invalid(
        'Actual technology right and baseline nonrequirement must remain distinct',
      );
  } else {
    if (!baseline)
      invalid(
        'Null technology right requires explicit baseline nonrequirement',
      );
    exact(baseline, [
      ...commonKeys,
      'basis',
      'recipeFactRef',
      'recipeSourceRef',
      'recipeCanonicalPayload',
      'baselineProductivity',
      'baselineRequiredTechnologyRightRefs',
      'excludedUpgradeTechnologyRefs',
    ]);
    check(baseline);
    if (
      baseline.basis !== 'EXISTING_SITE_REFINERY_RECIPE_COEFFICIENTS' ||
      baseline.recipeFactRef !== input.recipeFactRef ||
      baseline.recipeSourceRef !== input.recipeSourceRef ||
      baseline.recipeCanonicalPayload !== input.recipeCanonicalPayload ||
      canonicalSerialize(baseline.baselineProductivity) !==
        canonicalSerialize(input.productivity) ||
      baseline.baselineProductivity.inputUnit !==
        baseline.baselineProductivity.outputUnit ||
      !Quantity.from(
        baseline.baselineProductivity.amount,
        baseline.baselineProductivity.outputUnit,
      ).amount.greaterThan('0') ||
      Quantity.from(
        baseline.baselineProductivity.amount,
        baseline.baselineProductivity.outputUnit,
      ).amount.greaterThan('1') ||
      !Array.isArray(baseline.baselineRequiredTechnologyRightRefs) ||
      baseline.baselineRequiredTechnologyRightRefs.length !== 0 ||
      !Array.isArray(baseline.excludedUpgradeTechnologyRefs)
    )
      invalid(
        'Baseline technology cannot waive recipe requirements or grant an efficiency upgrade',
      );
    ref(baseline.recipeFactRef, 'recipeFactRef');
    ref(baseline.recipeSourceRef, 'recipeSourceRef');
    for (const r of baseline.excludedUpgradeTechnologyRefs)
      ref(r, 'excludedUpgradeTechnologyRef');
    if (
      new Set(baseline.excludedUpgradeTechnologyRefs).size !==
      baseline.excludedUpgradeTechnologyRefs.length
    )
      invalid('Duplicate excluded upgrade technology reference');
  }
}
