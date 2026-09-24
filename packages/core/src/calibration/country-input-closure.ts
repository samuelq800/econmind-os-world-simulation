import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

export const V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION =
  'v27.2-country-calibration-preparation-v2' as const;
export const V27_2_COUNTRY_CONFIGURATION_BINDING_VERSION =
  'v27.2-country-configuration-identity-v1' as const;
export const V27_2_REQUIRED_COUNTRY_COUNT = 70 as const;
export const V27_2_REQUIRED_COUNTRY_COUNT_VALUE = '70' as const;

export type CalibrationEvidenceClassification =
  'OBSERVED' | 'DERIVED' | 'SYNTHETIC_CALIBRATION' | 'PLACEHOLDER';

export interface CalibrationSourceEvidence {
  readonly sourceRef: string;
  readonly classification: CalibrationEvidenceClassification;
  readonly locator: string;
  readonly sourceVersion: string;
  readonly contentHash: CanonicalSha256;
}

export interface CalibrationNumericChange {
  readonly changeRef: string;
  readonly before: string;
  readonly delta: string;
  readonly after: string;
  readonly unit: string;
  readonly sourceRef: string;
  readonly assumptionRef: string;
}

export interface CalibrationQuantity {
  readonly amount: string;
  readonly unit: string;
  readonly sourceUnit: string;
  readonly sourceRef: string;
  readonly assumptionRef: string | null;
  readonly changes: readonly CalibrationNumericChange[];
}

export interface CalibrationFinancialLeg {
  readonly legRef: string;
  readonly accountRef: string;
  readonly direction: 'DEBIT' | 'CREDIT';
  readonly quantity: CalibrationQuantity;
  readonly counterpartLegRef: string;
}

export interface CalibrationFinancialBatch {
  readonly batchRef: string;
  readonly legs: readonly CalibrationFinancialLeg[];
}

export interface CalibrationInventoryClosure {
  readonly commodityId: string;
  readonly total: CalibrationQuantity;
  readonly buckets: {
    readonly available: CalibrationQuantity;
    readonly reserved: CalibrationQuantity;
    readonly strategic: CalibrationQuantity;
    readonly inTransit: CalibrationQuantity;
  };
}

export interface CalibrationGeologicalClosure {
  readonly resourceId: string;
  readonly total: CalibrationQuantity;
  readonly layers: {
    readonly undiscovered: CalibrationQuantity;
    readonly discoveredUnrecoverable: CalibrationQuantity;
    readonly recoverableUndeveloped: CalibrationQuantity;
    readonly developedRemaining: CalibrationQuantity;
    readonly cumulativeExtracted: CalibrationQuantity;
  };
}

export interface CalibrationFacilityInput {
  readonly facilityId: string;
  readonly installedCapacity: CalibrationQuantity;
  readonly operationalCapacity: CalibrationQuantity;
  readonly staffRequired: CalibrationQuantity;
  readonly staffAssigned: CalibrationQuantity;
}

export interface CalibrationSupplierShare {
  readonly supplierCountryId: string;
  readonly share: CalibrationQuantity;
}

export interface CalibrationSupplyChainInput {
  readonly commodityId: string;
  readonly supplierShares: readonly CalibrationSupplierShare[];
}

export interface CountryCalibrationInput {
  readonly countryId: string;
  /** Descriptive generation provenance only; never emitted as a modifier. */
  readonly archetypeRef: string | null;
  readonly financialBatches: readonly CalibrationFinancialBatch[];
  readonly inventoryClosures: readonly CalibrationInventoryClosure[];
  readonly geologicalClosures: readonly CalibrationGeologicalClosure[];
  readonly facilities: readonly CalibrationFacilityInput[];
  readonly supplyChains: readonly CalibrationSupplyChainInput[];
}

export interface V27_2CalibrationPreparationInput {
  readonly schemaVersion: typeof V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION;
  readonly worldId: string;
  /** Content-addressed World/country identity, not configuration authority. */
  readonly countryConfigurationRef: CanonicalSha256;
  readonly expectedCountryCount: typeof V27_2_REQUIRED_COUNTRY_COUNT_VALUE;
  readonly sources: readonly CalibrationSourceEvidence[];
  readonly countries: readonly CountryCalibrationInput[];
}

export type V27_2CalibrationPreparationResult =
  | Readonly<{
      status: 'PREPARATION_INCOMPLETE';
      generationAuthorized: false;
      countryCount: number;
      issues: readonly string[];
      fingerprint: null;
    }>
  | Readonly<{
      status: 'PREPARATION_INPUT_CLOSED';
      generationAuthorized: false;
      countryCount: typeof V27_2_REQUIRED_COUNTRY_COUNT;
      issues: readonly [];
      fingerprint: CanonicalSha256;
      candidate: Readonly<V27_2CalibrationPreparationInput>;
    }>;

type UnknownRecord = Readonly<Record<string, unknown>>;

const SOURCE_CLASSIFICATIONS = new Set<CalibrationEvidenceClassification>([
  'OBSERVED',
  'DERIVED',
  'SYNTHETIC_CALIBRATION',
  'PLACEHOLDER',
]);
const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const CANONICAL_UNIT = /^[A-Za-z][A-Za-z0-9 _/-]{0,63}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const INDEX_UNIT = /^index(?:[_ /-]?0[_ /-]?100)?$/iu;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
    `V27.2 calibration preparation invalid: ${message}`,
  );
}

function record(value: unknown, label: string): UnknownRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${label} must be a plain record`);
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
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

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    invalid(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function stableReference(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!STABLE_REFERENCE.test(parsed)) {
    invalid(`${label} must be a stable reference`);
  }
  return parsed;
}

function canonicalId(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!CANONICAL_ID.test(parsed)) invalid(`${label} must be canonical`);
  return parsed;
}

function unit(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!CANONICAL_UNIT.test(parsed)) invalid(`${label} must be canonical`);
  if (INDEX_UNIT.test(parsed)) {
    invalid(`${label} cannot use a 0-100 index as a real opening unit`);
  }
  return parsed;
}

function decimal(value: unknown, label: string): WorldDecimalValue {
  const rendered = string(value, label);
  let parsed: WorldDecimalValue;
  try {
    parsed = parseWorldDecimal(rendered);
  } catch {
    return invalid(`${label} must be a canonical decimal`);
  }
  if (canonicalDecimal(parsed) !== rendered) {
    invalid(`${label} must be a canonical decimal`);
  }
  return parsed;
}

function nonNegative(value: WorldDecimalValue, label: string): void {
  if (value.isNegative()) invalid(`${label} must be non-negative`);
}

function positive(value: WorldDecimalValue, label: string): void {
  if (!value.isPositive()) invalid(`${label} must be positive`);
}

function sortedUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): readonly T[] {
  const sorted = [...values].sort((left, right) => {
    const leftId = identity(left);
    const rightId = identity(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  if (new Set(sorted.map(identity)).size !== sorted.length) {
    invalid(`${label} identities must be unique`);
  }
  return Object.freeze(sorted);
}

/** Structural identity only; an external owner must still attest the source. */
export function v27_2CountryConfigurationRef(
  input: { readonly worldId: string; readonly countryIds: readonly string[] },
  sha256Hex: Sha256Hex,
): CanonicalSha256 {
  const requestedWorldId = canonicalId(input.worldId, 'worldId');
  const countryIds = sortedUnique(
    list(input.countryIds, 'country configuration IDs').map((value) =>
      canonicalId(value, 'country configuration ID'),
    ),
    (value) => value,
    'country configuration',
  );
  return canonicalSha256(
    canonicalHashInput({
      bindingVersion: V27_2_COUNTRY_CONFIGURATION_BINDING_VERSION,
      worldId: requestedWorldId,
      countryIds,
    }),
    sha256Hex,
  );
}

function sourceEvidence(value: unknown): CalibrationSourceEvidence {
  const input = record(value, 'source evidence');
  exactKeys(
    input,
    ['sourceRef', 'classification', 'locator', 'sourceVersion', 'contentHash'],
    'source evidence',
  );
  const classification = string(input.classification, 'source classification');
  if (
    !SOURCE_CLASSIFICATIONS.has(
      classification as CalibrationEvidenceClassification,
    )
  ) {
    invalid('source classification is unsupported');
  }
  const contentHash = string(input.contentHash, 'source contentHash');
  if (!SHA256.test(contentHash)) {
    invalid('source contentHash must be canonical SHA-256');
  }
  return Object.freeze({
    sourceRef: stableReference(input.sourceRef, 'sourceRef'),
    classification: classification as CalibrationEvidenceClassification,
    locator: string(input.locator, 'source locator'),
    sourceVersion: stableReference(input.sourceVersion, 'sourceVersion'),
    contentHash: contentHash as CanonicalSha256,
  });
}

function numericChange(input: {
  readonly value: unknown;
  readonly expectedUnit: string;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationNumericChange {
  const value = record(input.value, input.label);
  exactKeys(
    value,
    [
      'changeRef',
      'before',
      'delta',
      'after',
      'unit',
      'sourceRef',
      'assumptionRef',
    ],
    input.label,
  );
  const changeUnit = unit(value.unit, `${input.label}.unit`);
  if (changeUnit !== input.expectedUnit) {
    invalid(`${input.label}.unit must match the calibrated quantity`);
  }
  const sourceRef = stableReference(
    value.sourceRef,
    `${input.label}.sourceRef`,
  );
  const source = input.sources.get(sourceRef);
  if (source === undefined) invalid(`${input.label} references unknown source`);
  if (source.classification === 'PLACEHOLDER') {
    input.issues.push(
      `${input.label} depends on placeholder source ${sourceRef}`,
    );
  }
  const assumptionRef = stableReference(
    value.assumptionRef,
    `${input.label}.assumptionRef`,
  );
  const before = decimal(value.before, `${input.label}.before`);
  const delta = decimal(value.delta, `${input.label}.delta`);
  const after = decimal(value.after, `${input.label}.after`);
  nonNegative(before, `${input.label}.before`);
  nonNegative(after, `${input.label}.after`);
  if (!before.plus(delta).equals(after)) {
    invalid(`${input.label} before + delta must equal after exactly`);
  }
  return Object.freeze({
    changeRef: stableReference(value.changeRef, `${input.label}.changeRef`),
    before: canonicalDecimal(before),
    delta: canonicalDecimal(delta),
    after: canonicalDecimal(after),
    unit: changeUnit,
    sourceRef,
    assumptionRef,
  });
}

function quantity(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationQuantity {
  const value = record(input.value, input.label);
  exactKeys(
    value,
    ['amount', 'unit', 'sourceUnit', 'sourceRef', 'assumptionRef', 'changes'],
    input.label,
  );
  const parsedUnit = unit(value.unit, `${input.label}.unit`);
  const sourceUnit = unit(value.sourceUnit, `${input.label}.sourceUnit`);
  if (sourceUnit !== parsedUnit) {
    invalid(
      `${input.label} source/destination unit conversion is not supported`,
    );
  }
  const sourceRef = stableReference(
    value.sourceRef,
    `${input.label}.sourceRef`,
  );
  const source = input.sources.get(sourceRef);
  if (source === undefined) invalid(`${input.label} references unknown source`);
  const assumptionRef =
    value.assumptionRef === null
      ? null
      : stableReference(value.assumptionRef, `${input.label}.assumptionRef`);
  const amount = decimal(value.amount, `${input.label}.amount`);
  nonNegative(amount, `${input.label}.amount`);
  const changes = list(value.changes, `${input.label}.changes`).map(
    (change, index) =>
      numericChange({
        value: change,
        expectedUnit: parsedUnit,
        sources: input.sources,
        label: `${input.label}.changes[${index}]`,
        issues: input.issues,
      }),
  );
  if (
    new Set(changes.map((change) => change.changeRef)).size !== changes.length
  ) {
    invalid(`${input.label} change references must be unique`);
  }
  for (let index = 1; index < changes.length; index += 1) {
    if (changes[index - 1]?.after !== changes[index]?.before) {
      invalid(`${input.label} change chain must be contiguous`);
    }
  }

  if (source.classification === 'OBSERVED') {
    if (assumptionRef !== null || changes.length !== 0) {
      invalid(
        `${input.label} observed values cannot hide an assumption/change`,
      );
    }
  } else if (source.classification === 'PLACEHOLDER') {
    input.issues.push(`${input.label} uses placeholder source ${sourceRef}`);
  } else if (
    assumptionRef === null ||
    changes.length === 0 ||
    changes.at(-1)?.after !== canonicalDecimal(amount)
  ) {
    invalid(
      `${input.label} derived/synthetic value requires an assumption and exact change chain`,
    );
  }

  return Object.freeze({
    amount: canonicalDecimal(amount),
    unit: parsedUnit,
    sourceUnit,
    sourceRef,
    assumptionRef,
    changes: Object.freeze(changes),
  });
}

function amount(value: CalibrationQuantity): WorldDecimalValue {
  return parseWorldDecimal(value.amount);
}

function sameUnits(
  values: readonly CalibrationQuantity[],
  label: string,
): string {
  const first = values[0]?.unit;
  if (first === undefined || values.some((value) => value.unit !== first)) {
    invalid(`${label} quantities must use one exact unit`);
  }
  return first;
}

function exactSum(values: readonly CalibrationQuantity[]): WorldDecimalValue {
  return values.reduce(
    (total, value) => total.plus(amount(value)),
    parseWorldDecimal('0'),
  );
}

function nonEmptyDomain(
  values: readonly unknown[],
  countryId: string,
  domain: string,
  issues: string[],
): void {
  if (values.length === 0) {
    issues.push(`${countryId} is missing required ${domain} input`);
  }
}

function financialBatch(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationFinancialBatch {
  const value = record(input.value, input.label);
  exactKeys(value, ['batchRef', 'legs'], input.label);
  const legs = list(value.legs, `${input.label}.legs`).map((raw, index) => {
    const leg = record(raw, `${input.label}.legs[${index}]`);
    exactKeys(
      leg,
      ['legRef', 'accountRef', 'direction', 'quantity', 'counterpartLegRef'],
      `${input.label}.legs[${index}]`,
    );
    const direction = string(
      leg.direction,
      `${input.label}.legs[${index}].direction`,
    );
    if (direction !== 'DEBIT' && direction !== 'CREDIT') {
      invalid(`${input.label}.legs[${index}].direction is unsupported`);
    }
    const parsedQuantity = quantity({
      value: leg.quantity,
      sources: input.sources,
      label: `${input.label}.legs[${index}].quantity`,
      issues: input.issues,
    });
    positive(amount(parsedQuantity), `${input.label}.legs[${index}].quantity`);
    return Object.freeze({
      legRef: stableReference(
        leg.legRef,
        `${input.label}.legs[${index}].legRef`,
      ),
      accountRef: stableReference(
        leg.accountRef,
        `${input.label}.legs[${index}].accountRef`,
      ),
      direction,
      quantity: parsedQuantity,
      counterpartLegRef: stableReference(
        leg.counterpartLegRef,
        `${input.label}.legs[${index}].counterpartLegRef`,
      ),
    });
  });
  if (legs.length < 2) invalid(`${input.label} requires counterpart legs`);
  if (new Set(legs.map((leg) => leg.accountRef)).size !== legs.length) {
    invalid(`${input.label} cannot repeat an account`);
  }
  for (const leg of legs) {
    const counterpart = legs.find(
      (candidate) => candidate.legRef === leg.counterpartLegRef,
    );
    if (
      counterpart === undefined ||
      counterpart.legRef === leg.legRef ||
      counterpart.direction === leg.direction ||
      counterpart.counterpartLegRef !== leg.legRef
    ) {
      invalid(`${input.label} requires reciprocal opposite counterparts`);
    }
  }
  sameUnits(
    legs.map((leg) => leg.quantity),
    input.label,
  );
  const debit = exactSum(
    legs.filter((leg) => leg.direction === 'DEBIT').map((leg) => leg.quantity),
  );
  const credit = exactSum(
    legs.filter((leg) => leg.direction === 'CREDIT').map((leg) => leg.quantity),
  );
  if (!debit.equals(credit)) {
    invalid(`${input.label} debit and credit must balance exactly`);
  }
  return Object.freeze({
    batchRef: stableReference(value.batchRef, `${input.label}.batchRef`),
    legs: sortedUnique(legs, (leg) => leg.legRef, `${input.label} leg`),
  });
}

function inventoryClosure(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationInventoryClosure {
  const value = record(input.value, input.label);
  exactKeys(value, ['commodityId', 'total', 'buckets'], input.label);
  const buckets = record(value.buckets, `${input.label}.buckets`);
  exactKeys(
    buckets,
    ['available', 'reserved', 'strategic', 'inTransit'],
    `${input.label}.buckets`,
  );
  const total = quantity({
    ...input,
    value: value.total,
    label: `${input.label}.total`,
  });
  const available = quantity({
    ...input,
    value: buckets.available,
    label: `${input.label}.buckets.available`,
  });
  const reserved = quantity({
    ...input,
    value: buckets.reserved,
    label: `${input.label}.buckets.reserved`,
  });
  const strategic = quantity({
    ...input,
    value: buckets.strategic,
    label: `${input.label}.buckets.strategic`,
  });
  const inTransit = quantity({
    ...input,
    value: buckets.inTransit,
    label: `${input.label}.buckets.inTransit`,
  });
  const components = [available, reserved, strategic, inTransit];
  sameUnits([total, ...components], input.label);
  if (!exactSum(components).equals(amount(total))) {
    invalid(`${input.label} inventory buckets must equal total exactly`);
  }
  return Object.freeze({
    commodityId: canonicalId(value.commodityId, `${input.label}.commodityId`),
    total,
    buckets: Object.freeze({ available, reserved, strategic, inTransit }),
  });
}

function geologicalClosure(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationGeologicalClosure {
  const value = record(input.value, input.label);
  exactKeys(value, ['resourceId', 'total', 'layers'], input.label);
  const layers = record(value.layers, `${input.label}.layers`);
  exactKeys(
    layers,
    [
      'undiscovered',
      'discoveredUnrecoverable',
      'recoverableUndeveloped',
      'developedRemaining',
      'cumulativeExtracted',
    ],
    `${input.label}.layers`,
  );
  const total = quantity({
    ...input,
    value: value.total,
    label: `${input.label}.total`,
  });
  const undiscovered = quantity({
    ...input,
    value: layers.undiscovered,
    label: `${input.label}.layers.undiscovered`,
  });
  const discoveredUnrecoverable = quantity({
    ...input,
    value: layers.discoveredUnrecoverable,
    label: `${input.label}.layers.discoveredUnrecoverable`,
  });
  const recoverableUndeveloped = quantity({
    ...input,
    value: layers.recoverableUndeveloped,
    label: `${input.label}.layers.recoverableUndeveloped`,
  });
  const developedRemaining = quantity({
    ...input,
    value: layers.developedRemaining,
    label: `${input.label}.layers.developedRemaining`,
  });
  const cumulativeExtracted = quantity({
    ...input,
    value: layers.cumulativeExtracted,
    label: `${input.label}.layers.cumulativeExtracted`,
  });
  const components = [
    undiscovered,
    discoveredUnrecoverable,
    recoverableUndeveloped,
    developedRemaining,
    cumulativeExtracted,
  ];
  sameUnits([total, ...components], input.label);
  if (!exactSum(components).equals(amount(total))) {
    invalid(`${input.label} geological layers must equal total exactly`);
  }
  return Object.freeze({
    resourceId: canonicalId(value.resourceId, `${input.label}.resourceId`),
    total,
    layers: Object.freeze({
      undiscovered,
      discoveredUnrecoverable,
      recoverableUndeveloped,
      developedRemaining,
      cumulativeExtracted,
    }),
  });
}

function facility(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationFacilityInput {
  const value = record(input.value, input.label);
  exactKeys(
    value,
    [
      'facilityId',
      'installedCapacity',
      'operationalCapacity',
      'staffRequired',
      'staffAssigned',
    ],
    input.label,
  );
  const installedCapacity = quantity({
    ...input,
    value: value.installedCapacity,
    label: `${input.label}.installedCapacity`,
  });
  const operationalCapacity = quantity({
    ...input,
    value: value.operationalCapacity,
    label: `${input.label}.operationalCapacity`,
  });
  const staffRequired = quantity({
    ...input,
    value: value.staffRequired,
    label: `${input.label}.staffRequired`,
  });
  const staffAssigned = quantity({
    ...input,
    value: value.staffAssigned,
    label: `${input.label}.staffAssigned`,
  });
  sameUnits(
    [installedCapacity, operationalCapacity],
    `${input.label} capacity`,
  );
  if (staffRequired.unit !== 'person' || staffAssigned.unit !== 'person') {
    invalid(`${input.label} staffing must use person units`);
  }
  if (amount(operationalCapacity).greaterThan(amount(installedCapacity))) {
    invalid(`${input.label} operational capacity exceeds installed capacity`);
  }
  if (amount(staffAssigned).greaterThan(amount(staffRequired))) {
    invalid(`${input.label} assigned staff exceeds required staff`);
  }
  return Object.freeze({
    facilityId: canonicalId(value.facilityId, `${input.label}.facilityId`),
    installedCapacity,
    operationalCapacity,
    staffRequired,
    staffAssigned,
  });
}

function supplyChain(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly label: string;
  readonly issues: string[];
}): CalibrationSupplyChainInput {
  const value = record(input.value, input.label);
  exactKeys(value, ['commodityId', 'supplierShares'], input.label);
  const supplierShares = list(
    value.supplierShares,
    `${input.label}.supplierShares`,
  ).map((raw, index) => {
    const share = record(raw, `${input.label}.supplierShares[${index}]`);
    exactKeys(
      share,
      ['supplierCountryId', 'share'],
      `${input.label}.supplierShares[${index}]`,
    );
    const parsedShare = quantity({
      value: share.share,
      sources: input.sources,
      label: `${input.label}.supplierShares[${index}].share`,
      issues: input.issues,
    });
    if (parsedShare.unit !== 'ratio' || amount(parsedShare).greaterThan(1)) {
      invalid(`${input.label} supplier shares must be ratios from zero to one`);
    }
    return Object.freeze({
      supplierCountryId: canonicalId(
        share.supplierCountryId,
        `${input.label}.supplierShares[${index}].supplierCountryId`,
      ),
      share: parsedShare,
    });
  });
  if (supplierShares.length === 0) {
    input.issues.push(`${input.label} is missing supplier shares`);
  } else if (!exactSum(supplierShares.map((item) => item.share)).equals(1)) {
    invalid(`${input.label} supplier shares must sum to one exactly`);
  }
  return Object.freeze({
    commodityId: canonicalId(value.commodityId, `${input.label}.commodityId`),
    supplierShares: sortedUnique(
      supplierShares,
      (item) => item.supplierCountryId,
      `${input.label} supplier`,
    ),
  });
}

function country(input: {
  readonly value: unknown;
  readonly sources: ReadonlyMap<string, CalibrationSourceEvidence>;
  readonly issues: string[];
}): CountryCalibrationInput {
  const value = record(input.value, 'country calibration');
  exactKeys(
    value,
    [
      'countryId',
      'archetypeRef',
      'financialBatches',
      'inventoryClosures',
      'geologicalClosures',
      'facilities',
      'supplyChains',
    ],
    'country calibration',
  );
  const countryId = canonicalId(value.countryId, 'countryId');
  const archetypeRef =
    value.archetypeRef === null
      ? null
      : stableReference(value.archetypeRef, `${countryId}.archetypeRef`);
  const financialValues = list(
    value.financialBatches,
    `${countryId}.financialBatches`,
  );
  const inventoryValues = list(
    value.inventoryClosures,
    `${countryId}.inventoryClosures`,
  );
  const geologicalValues = list(
    value.geologicalClosures,
    `${countryId}.geologicalClosures`,
  );
  const facilityValues = list(value.facilities, `${countryId}.facilities`);
  const supplyValues = list(value.supplyChains, `${countryId}.supplyChains`);
  nonEmptyDomain(financialValues, countryId, 'financial batch', input.issues);
  nonEmptyDomain(inventoryValues, countryId, 'inventory closure', input.issues);
  nonEmptyDomain(
    geologicalValues,
    countryId,
    'geological closure',
    input.issues,
  );
  nonEmptyDomain(facilityValues, countryId, 'facility/staffing', input.issues);
  nonEmptyDomain(supplyValues, countryId, 'supply-chain', input.issues);

  const financialBatches = financialValues.map((item, index) =>
    financialBatch({
      ...input,
      value: item,
      label: `${countryId}.financialBatches[${index}]`,
    }),
  );
  const inventoryClosures = inventoryValues.map((item, index) =>
    inventoryClosure({
      ...input,
      value: item,
      label: `${countryId}.inventoryClosures[${index}]`,
    }),
  );
  const geologicalClosures = geologicalValues.map((item, index) =>
    geologicalClosure({
      ...input,
      value: item,
      label: `${countryId}.geologicalClosures[${index}]`,
    }),
  );
  const facilities = facilityValues.map((item, index) =>
    facility({
      ...input,
      value: item,
      label: `${countryId}.facilities[${index}]`,
    }),
  );
  const supplyChains = supplyValues.map((item, index) =>
    supplyChain({
      ...input,
      value: item,
      label: `${countryId}.supplyChains[${index}]`,
    }),
  );
  return Object.freeze({
    countryId,
    archetypeRef,
    financialBatches: sortedUnique(
      financialBatches,
      (item) => item.batchRef,
      `${countryId} financial batch`,
    ),
    inventoryClosures: sortedUnique(
      inventoryClosures,
      (item) => item.commodityId,
      `${countryId} inventory commodity`,
    ),
    geologicalClosures: sortedUnique(
      geologicalClosures,
      (item) => item.resourceId,
      `${countryId} geological resource`,
    ),
    facilities: sortedUnique(
      facilities,
      (item) => item.facilityId,
      `${countryId} facility`,
    ),
    supplyChains: sortedUnique(
      supplyChains,
      (item) => item.commodityId,
      `${countryId} supply-chain commodity`,
    ),
  });
}

/**
 * Validates an inert V27.2 candidate. A closed result is still preparation
 * evidence only and deliberately cannot authorize generation or OpeningSeed.
 */
export function validateV27_2CalibrationPreparation(
  value: unknown,
  sha256Hex: Sha256Hex,
): V27_2CalibrationPreparationResult {
  const input = record(value, 'V27.2 calibration input');
  exactKeys(
    input,
    [
      'schemaVersion',
      'worldId',
      'countryConfigurationRef',
      'expectedCountryCount',
      'sources',
      'countries',
    ],
    'V27.2 calibration input',
  );
  if (
    input.schemaVersion !== V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION ||
    input.expectedCountryCount !== V27_2_REQUIRED_COUNTRY_COUNT_VALUE
  ) {
    invalid('schema version and expected country count are fixed');
  }
  const requestedWorldId = canonicalId(input.worldId, 'worldId');
  const countryConfigurationRef = string(
    input.countryConfigurationRef,
    'countryConfigurationRef',
  );
  if (!SHA256.test(countryConfigurationRef)) {
    invalid('countryConfigurationRef must be canonical SHA-256');
  }
  const sources = sortedUnique(
    list(input.sources, 'sources').map(sourceEvidence),
    (source) => source.sourceRef,
    'source',
  );
  const sourceMap = new Map(
    sources.map((source) => [source.sourceRef, source] as const),
  );
  const issues = sources
    .filter((source) => source.classification === 'PLACEHOLDER')
    .map((source) => `source ${source.sourceRef} remains PLACEHOLDER`);
  if (sources.length === 0) issues.push('no calibration sources were supplied');
  const countries = sortedUnique(
    list(input.countries, 'countries').map((item) =>
      country({ value: item, sources: sourceMap, issues }),
    ),
    (item) => item.countryId,
    'country',
  );
  if (countries.length !== V27_2_REQUIRED_COUNTRY_COUNT) {
    issues.push(
      `expected ${V27_2_REQUIRED_COUNTRY_COUNT} countries but received ${countries.length}`,
    );
  }
  if (
    countries.length === V27_2_REQUIRED_COUNTRY_COUNT &&
    countryConfigurationRef !==
      v27_2CountryConfigurationRef(
        {
          worldId: requestedWorldId,
          countryIds: countries.map((country) => country.countryId),
        },
        sha256Hex,
      )
  ) {
    invalid('countryConfigurationRef does not bind World and country IDs');
  }
  const countryIds = new Set(countries.map((item) => item.countryId));
  for (const item of countries) {
    for (const chain of item.supplyChains) {
      for (const supplier of chain.supplierShares) {
        if (!countryIds.has(supplier.supplierCountryId)) {
          invalid(
            `${item.countryId}.${chain.commodityId} references unknown supplier country`,
          );
        }
      }
    }
  }
  const uniqueIssues = Object.freeze([...new Set(issues)].sort());
  if (uniqueIssues.length !== 0) {
    return Object.freeze({
      status: 'PREPARATION_INCOMPLETE',
      generationAuthorized: false,
      countryCount: countries.length,
      issues: uniqueIssues,
      fingerprint: null,
    });
  }
  const candidate: Readonly<V27_2CalibrationPreparationInput> = Object.freeze({
    schemaVersion: V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
    worldId: requestedWorldId,
    countryConfigurationRef: countryConfigurationRef as CanonicalSha256,
    expectedCountryCount: V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
    sources,
    countries,
  });
  // Serialize once before hashing so hostile/non-inert values cannot hide in
  // an otherwise well-shaped object.
  canonicalSerialize(candidate);
  const noIssues = Object.freeze([]) as readonly [];
  return Object.freeze({
    status: 'PREPARATION_INPUT_CLOSED',
    generationAuthorized: false,
    countryCount: V27_2_REQUIRED_COUNTRY_COUNT,
    issues: noIssues,
    fingerprint: canonicalSha256(canonicalHashInput(candidate), sha256Hex),
    candidate,
  });
}
