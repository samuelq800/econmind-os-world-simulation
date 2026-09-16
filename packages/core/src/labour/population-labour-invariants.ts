import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { countryId, idempotencyKey, type CountryId } from '../ids.js';
import {
  assertWorldDecimalResult,
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from '../numeric/world-decimal.js';
import {
  applyPopulationFacts,
  createE01DailyBoundary,
  type PopulationActionEvidence,
  type PopulationEngineState,
  type PopulationFact,
} from '../population/population-engine.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import { compareCanonicalIdentifiers } from '../time/deterministic-order.js';
import {
  applyLabourFacts,
  type LabourActionEvidence,
  type LabourEngineState,
  type LabourFact,
  type LabourPopulationAvailability,
} from './labour-engine.js';

/** Caller-chosen metadata only; this validator never interprets snapshot order. */
export interface PopulationLabourSnapshotLabel {
  readonly snapshotId: string;
  readonly dayIndex: string;
  readonly callerTimeLabel: string;
}

export interface PopulationLabourPopulationSnapshot {
  readonly label: PopulationLabourSnapshotLabel;
  readonly state: PopulationEngineState;
}

export interface PopulationLabourLabourSnapshot {
  readonly label: PopulationLabourSnapshotLabel;
  readonly state: LabourEngineState;
  readonly populationAvailability: readonly LabourPopulationAvailability[];
}

export interface PopulationLabourInvariantInput {
  readonly source: {
    readonly population: PopulationLabourPopulationSnapshot;
    readonly labour: PopulationLabourLabourSnapshot;
  };
  readonly result: {
    readonly population: PopulationLabourPopulationSnapshot;
    readonly labour: PopulationLabourLabourSnapshot;
  };
  /** Exact V11.1 evidence for the E02 transition into `result.population`. */
  readonly populationEvidence: readonly PopulationActionEvidence[];
  /** Exact V11.2 evidence for the E03 transition into `result.labour`. */
  readonly labourEvidence: readonly LabourActionEvidence[];
}

/** A validation receipt, not an authoritative population or labour state. */
export interface PopulationLabourInvariantReceipt {
  readonly populationFactIds: readonly string[];
  readonly labourFactIds: readonly string[];
  readonly migrationHandoffIds: readonly string[];
}

const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const KEY_SEPARATOR = '\u0001';

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS, message);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(`${label} must be a plain record`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) return invalid(`${label} must be an array`);
  return value;
}

function assertKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    actual.length !== allowed.length ||
    actual.some((key, index) => key !== allowed[index])
  ) {
    invalid(`${label} contains missing or unsupported fields`);
  }
}

function canonicalIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    return invalid(`${label} must be a canonical immutable identifier`);
  }
  try {
    return idempotencyKey(value);
  } catch {
    return invalid(`${label} must be a canonical immutable identifier`);
  }
}

function canonicalCountry(value: unknown, label: string): CountryId {
  if (typeof value !== 'string') {
    return invalid(`${label} must be a canonical country identifier`);
  }
  try {
    return countryId(value);
  } catch {
    return invalid(`${label} must be a canonical country identifier`);
  }
}

function canonicalDayIndex(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !CANONICAL_NON_NEGATIVE_INTEGER.test(value)
  ) {
    return invalid(`${label} must be a canonical non-negative day index`);
  }
  return value;
}

function canonicalCount(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    return invalid(
      `${label} must be a canonical non-negative whole-person count`,
    );
  }
  let parsed: WorldDecimalValue;
  try {
    parsed = parseWorldDecimal(value);
  } catch {
    return invalid(
      `${label} must be a canonical non-negative whole-person count`,
    );
  }
  if (
    parsed.isNegative() ||
    !parsed.isInteger() ||
    canonicalDecimal(parsed) !== value
  ) {
    return invalid(
      `${label} must be a canonical non-negative whole-person count`,
    );
  }
  return canonicalDecimal(assertWorldDecimalResult(parsed));
}

function canonicalLabel(
  value: unknown,
  label: string,
): PopulationLabourSnapshotLabel {
  const record = assertRecord(value, label);
  assertKeys(record, ['callerTimeLabel', 'dayIndex', 'snapshotId'], label);
  return Object.freeze({
    snapshotId: canonicalIdentifier(record.snapshotId, `${label} snapshotId`),
    dayIndex: canonicalDayIndex(record.dayIndex, `${label} dayIndex`),
    callerTimeLabel: canonicalIdentifier(
      record.callerTimeLabel,
      `${label} callerTimeLabel`,
    ),
  });
}

function sameLabel(
  left: PopulationLabourSnapshotLabel,
  right: PopulationLabourSnapshotLabel,
): boolean {
  return (
    left.snapshotId === right.snapshotId &&
    left.dayIndex === right.dayIndex &&
    left.callerTimeLabel === right.callerTimeLabel
  );
}

function parsedCanonicalPayload(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'string') {
    return invalid(`${label} must be canonical serialized fact text`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return invalid(`${label} must be canonical serialized fact text`);
  }
  const record = assertRecord(parsed, label);
  if (canonicalSerialize(record) !== value) {
    invalid(`${label} must be canonical serialized fact text`);
  }
  return record;
}

function parsePopulationEvidence(
  value: unknown,
  resultDayIndex: string,
): readonly {
  readonly evidence: PopulationActionEvidence;
  readonly fact: PopulationFact;
}[] {
  const seen = new Set<string>();
  const rows = assertArray(value, 'populationEvidence').map((row) => {
    const record = assertRecord(row, 'population evidence');
    assertKeys(
      record,
      [
        'canonicalPayload',
        'count',
        'countryId',
        'dayIndex',
        'factId',
        'kind',
        'migrationId',
      ],
      'population evidence',
    );
    const factId = canonicalIdentifier(
      record.factId,
      'population evidence factId',
    );
    if (seen.has(factId)) invalid(`population evidence repeats fact ${factId}`);
    seen.add(factId);
    const countryIdValue = canonicalCountry(
      record.countryId,
      'population evidence countryId',
    );
    const dayIndex = canonicalDayIndex(
      record.dayIndex,
      'population evidence dayIndex',
    );
    if (dayIndex !== resultDayIndex) {
      invalid('Population evidence must use the declared result E02 label day');
    }
    const canonicalPayload = record.canonicalPayload;
    const payload = parsedCanonicalPayload(
      canonicalPayload,
      'population evidence canonicalPayload',
    );
    if (
      payload.factId !== factId ||
      payload.countryId !== countryIdValue ||
      payload.dayIndex !== dayIndex ||
      payload.kind !== record.kind
    ) {
      invalid('Population evidence fields must match its canonical payload');
    }
    const migrationId =
      record.migrationId === null
        ? null
        : canonicalIdentifier(
            record.migrationId,
            'population evidence migrationId',
          );
    const count =
      record.count === null
        ? null
        : canonicalCount(record.count, 'population evidence count');
    const fact = payload as unknown as PopulationFact;
    return Object.freeze({
      evidence: Object.freeze({
        factId,
        kind: record.kind as PopulationActionEvidence['kind'],
        countryId: countryIdValue,
        dayIndex,
        canonicalPayload: canonicalPayload as string,
        migrationId,
        count,
      }),
      fact,
    });
  });
  rows.sort((left, right) =>
    compareCanonicalIdentifiers(left.evidence.factId, right.evidence.factId),
  );
  return Object.freeze(rows);
}

function parseLabourEvidence(
  value: unknown,
  resultDayIndex: string,
): readonly {
  readonly evidence: LabourActionEvidence;
  readonly fact: LabourFact;
}[] {
  const seen = new Set<string>();
  const rows = assertArray(value, 'labourEvidence').map((row) => {
    const record = assertRecord(row, 'labour evidence');
    assertKeys(
      record,
      [
        'canonicalPayload',
        'count',
        'countryId',
        'dayIndex',
        'factId',
        'kind',
        'locationId',
        'positionId',
        'wageVersion',
      ],
      'labour evidence',
    );
    const factId = canonicalIdentifier(record.factId, 'labour evidence factId');
    if (seen.has(factId)) invalid(`labour evidence repeats fact ${factId}`);
    seen.add(factId);
    const countryIdValue = canonicalCountry(
      record.countryId,
      'labour evidence countryId',
    );
    const locationId = canonicalIdentifier(
      record.locationId,
      'labour evidence locationId',
    );
    const dayIndex = canonicalDayIndex(
      record.dayIndex,
      'labour evidence dayIndex',
    );
    if (dayIndex !== resultDayIndex) {
      invalid('Labour evidence must use the declared result E03 label day');
    }
    const canonicalPayload = record.canonicalPayload;
    const payload = parsedCanonicalPayload(
      canonicalPayload,
      'labour evidence canonicalPayload',
    );
    if (
      payload.factId !== factId ||
      payload.countryId !== countryIdValue ||
      payload.locationId !== locationId ||
      payload.dayIndex !== dayIndex ||
      payload.kind !== record.kind
    ) {
      invalid('Labour evidence fields must match its canonical payload');
    }
    const positionId =
      record.positionId === null
        ? null
        : canonicalIdentifier(record.positionId, 'labour evidence positionId');
    const count =
      record.count === null
        ? null
        : canonicalCount(record.count, 'labour evidence count');
    const wageVersion =
      record.wageVersion === null
        ? null
        : canonicalIdentifier(
            record.wageVersion,
            'labour evidence wageVersion',
          );
    const fact = payload as unknown as LabourFact;
    return Object.freeze({
      evidence: Object.freeze({
        factId,
        kind: record.kind as LabourActionEvidence['kind'],
        countryId: countryIdValue,
        locationId,
        dayIndex,
        canonicalPayload: canonicalPayload as string,
        positionId,
        count,
        wageVersion,
      }),
      fact,
    });
  });
  rows.sort((left, right) =>
    compareCanonicalIdentifiers(left.evidence.factId, right.evidence.factId),
  );
  return Object.freeze(rows);
}

function canonicalAvailability(
  value: unknown,
): readonly LabourPopulationAvailability[] {
  const seen = new Set<string>();
  const rows = assertArray(value, 'populationAvailability').map((row) => {
    const record = assertRecord(row, 'population availability');
    assertKeys(
      record,
      ['countryId', 'locationId', 'workingAgeAvailable'],
      'population availability',
    );
    const countryIdValue = canonicalCountry(
      record.countryId,
      'availability countryId',
    );
    const locationId = canonicalIdentifier(
      record.locationId,
      'availability locationId',
    );
    const key = `${countryIdValue}${KEY_SEPARATOR}${locationId}`;
    if (seen.has(key)) invalid(`population availability repeats ${key}`);
    seen.add(key);
    return Object.freeze({
      countryId: countryIdValue,
      locationId,
      workingAgeAvailable: canonicalCount(
        record.workingAgeAvailable,
        'availability workingAgeAvailable',
      ),
    });
  });
  rows.sort((left, right) =>
    compareCanonicalIdentifiers(
      `${left.countryId}${KEY_SEPARATOR}${left.locationId}`,
      `${right.countryId}${KEY_SEPARATOR}${right.locationId}`,
    ),
  );
  return Object.freeze(rows);
}

function assertAvailabilityBoundedByPopulation(
  availability: readonly LabourPopulationAvailability[],
  population: PopulationEngineState,
): void {
  const workingAgeByCountry = new Map(
    population.countries.map((country) => [
      country.countryId,
      parseWorldDecimal(country.workingAge16To64),
    ]),
  );
  const availabilityByCountry = new Map<string, WorldDecimalValue>();
  for (const entry of availability) {
    const populationWorkingAge = workingAgeByCountry.get(entry.countryId);
    if (populationWorkingAge === undefined) {
      invalid('Labour availability must reference an E02 result country');
    }
    const previous =
      availabilityByCountry.get(entry.countryId) ?? parseWorldDecimal('0');
    availabilityByCountry.set(
      entry.countryId,
      assertWorldDecimalResult(
        previous.plus(parseWorldDecimal(entry.workingAgeAvailable)),
      ),
    );
  }
  for (const [countryIdValue, available] of availabilityByCountry) {
    if (available.greaterThan(workingAgeByCountry.get(countryIdValue)!)) {
      invalid('Labour availability cannot exceed E02 working-age population');
    }
  }
}

function assertExactEvidence(
  actual: readonly PopulationActionEvidence[] | readonly LabourActionEvidence[],
  expected:
    readonly PopulationActionEvidence[] | readonly LabourActionEvidence[],
  label: string,
): void {
  if (canonicalSerialize(actual) !== canonicalSerialize(expected)) {
    invalid(`${label} must exactly equal the replayed engine evidence`);
  }
}

function migrationHandoffs(
  populationEvidence: readonly PopulationActionEvidence[],
  labourEvidence: readonly LabourActionEvidence[],
): readonly string[] {
  const arrivals = new Map<
    string,
    { readonly countryId: string; readonly count: WorldDecimalValue }
  >();
  for (const evidence of populationEvidence) {
    const payload = parsedCanonicalPayload(
      evidence.canonicalPayload,
      'population replay evidence canonicalPayload',
    );
    if (payload.kind !== 'MIGRATION_ARRIVAL') continue;
    if (payload.cohort !== 'WORKING_AGE_16_64') continue;
    const handoff = payload.migrationLabourHandoff;
    if (handoff === null || handoff === undefined) continue;
    const handoffRecord = assertRecord(handoff, 'migration labour handoff');
    assertKeys(
      handoffRecord,
      ['disposition', 'handoffId'],
      'migration labour handoff',
    );
    if (handoffRecord.disposition !== 'PENDING_V11_2_CLASSIFICATION') {
      invalid('migration labour handoff disposition is invalid');
    }
    const handoffId = canonicalIdentifier(
      handoffRecord.handoffId,
      'migration handoffId',
    );
    if (arrivals.has(handoffId)) {
      invalid(`Population evidence repeats migration handoff ${handoffId}`);
    }
    arrivals.set(handoffId, {
      countryId: canonicalCountry(payload.countryId, 'arrival countryId'),
      count: parseWorldDecimal(canonicalCount(payload.count, 'arrival count')),
    });
  }

  const entries = new Map<
    string,
    { readonly countryId: string; readonly count: WorldDecimalValue }
  >();
  for (const evidence of labourEvidence) {
    const payload = parsedCanonicalPayload(
      evidence.canonicalPayload,
      'labour replay evidence canonicalPayload',
    );
    if (payload.kind !== 'MIGRATION_LABOUR_ENTRY') continue;
    const handoffId = canonicalIdentifier(
      payload.migrationHandoffId,
      'migration handoffId',
    );
    const countryIdValue = canonicalCountry(
      payload.countryId,
      'migration entry countryId',
    );
    const count = parseWorldDecimal(
      canonicalCount(payload.count, 'migration entry count'),
    );
    const existing = entries.get(handoffId);
    if (existing !== undefined && existing.countryId !== countryIdValue) {
      invalid(
        'One migration handoff cannot create labour in multiple countries',
      );
    }
    entries.set(handoffId, {
      countryId: countryIdValue,
      count: assertWorldDecimalResult(
        (existing?.count ?? parseWorldDecimal('0')).plus(count),
      ),
    });
  }

  for (const [handoffId, entry] of entries) {
    const arrival = arrivals.get(handoffId);
    if (arrival === undefined) {
      invalid(`Migration labour entry has no E02 arrival handoff ${handoffId}`);
    }
    if (
      arrival.countryId !== entry.countryId ||
      entry.count.greaterThan(arrival.count)
    ) {
      invalid(
        'Migration labour entry exceeds its E02 working-age arrival handoff',
      );
    }
  }
  return Object.freeze([...entries.keys()].sort(compareCanonicalIdentifiers));
}

/**
 * Validates a caller-labelled E02/E03 transition without selecting a time model,
 * persisting data, or introducing a new population, labour, or skill rule.
 */
export function validatePopulationLabourInvariants(
  input: PopulationLabourInvariantInput,
): PopulationLabourInvariantReceipt {
  const root = assertRecord(input, 'population/labour invariant input');
  assertKeys(
    root,
    ['labourEvidence', 'populationEvidence', 'result', 'source'],
    'population/labour invariant input',
  );
  const source = assertRecord(root.source, 'source snapshots');
  const result = assertRecord(root.result, 'result snapshots');
  assertKeys(source, ['labour', 'population'], 'source snapshots');
  assertKeys(result, ['labour', 'population'], 'result snapshots');
  const sourcePopulation = assertRecord(
    source.population,
    'source population snapshot',
  );
  const resultPopulation = assertRecord(
    result.population,
    'result population snapshot',
  );
  const sourceLabour = assertRecord(source.labour, 'source labour snapshot');
  const resultLabour = assertRecord(result.labour, 'result labour snapshot');
  assertKeys(
    sourcePopulation,
    ['label', 'state'],
    'source population snapshot',
  );
  assertKeys(
    resultPopulation,
    ['label', 'state'],
    'result population snapshot',
  );
  assertKeys(
    sourceLabour,
    ['label', 'populationAvailability', 'state'],
    'source labour snapshot',
  );
  assertKeys(
    resultLabour,
    ['label', 'populationAvailability', 'state'],
    'result labour snapshot',
  );

  const sourcePopulationLabel = canonicalLabel(
    sourcePopulation.label,
    'source population label',
  );
  const sourceLabourLabel = canonicalLabel(
    sourceLabour.label,
    'source labour label',
  );
  const resultPopulationLabel = canonicalLabel(
    resultPopulation.label,
    'result population label',
  );
  const resultLabourLabel = canonicalLabel(
    resultLabour.label,
    'result labour label',
  );
  if (!sameLabel(sourcePopulationLabel, sourceLabourLabel)) {
    invalid('E02 and E03 source snapshot labels must exactly match');
  }
  if (!sameLabel(resultPopulationLabel, resultLabourLabel)) {
    invalid('E02 and E03 result snapshot labels must exactly match');
  }

  const sourceAvailability = canonicalAvailability(
    sourceLabour.populationAvailability,
  );
  const resultAvailability = canonicalAvailability(
    resultLabour.populationAvailability,
  );
  const canonicalSourcePopulation = applyPopulationFacts({
    boundary: createE01DailyBoundary(sourcePopulationLabel.dayIndex),
    state: sourcePopulation.state as PopulationEngineState,
    facts: [],
  }).state;
  const canonicalSourceLabour = applyLabourFacts({
    boundary: createE01DailyBoundary(sourceLabourLabel.dayIndex),
    populationAvailability: sourceAvailability,
    state: sourceLabour.state as LabourEngineState,
    facts: [],
  }).state;
  const canonicalResultPopulation = applyPopulationFacts({
    boundary: createE01DailyBoundary(resultPopulationLabel.dayIndex),
    state: resultPopulation.state as PopulationEngineState,
    facts: [],
  }).state;
  const canonicalResultLabour = applyLabourFacts({
    boundary: createE01DailyBoundary(resultLabourLabel.dayIndex),
    populationAvailability: resultAvailability,
    state: resultLabour.state as LabourEngineState,
    facts: [],
  }).state;

  const populationRows = parsePopulationEvidence(
    root.populationEvidence,
    resultPopulationLabel.dayIndex,
  );
  const labourRows = parseLabourEvidence(
    root.labourEvidence,
    resultLabourLabel.dayIndex,
  );
  const replayedPopulation = applyPopulationFacts({
    boundary: createE01DailyBoundary(resultPopulationLabel.dayIndex),
    state: canonicalSourcePopulation,
    facts: populationRows.map((row) => row.fact),
  });
  const replayedLabour = applyLabourFacts({
    boundary: createE01DailyBoundary(resultLabourLabel.dayIndex),
    populationAvailability: resultAvailability,
    state: canonicalSourceLabour,
    facts: labourRows.map((row) => row.fact),
  });
  if (
    canonicalSerialize(replayedPopulation.state) !==
    canonicalSerialize(canonicalResultPopulation)
  ) {
    invalid('E02 result state must exactly equal its explicit evidence replay');
  }
  if (
    canonicalSerialize(replayedLabour.state) !==
    canonicalSerialize(canonicalResultLabour)
  ) {
    invalid('E03 result state must exactly equal its explicit evidence replay');
  }
  assertExactEvidence(
    replayedPopulation.newlyAppliedFacts,
    populationRows.map((row) => row.evidence),
    'E02 evidence',
  );
  assertExactEvidence(
    replayedLabour.newlyAppliedFacts,
    labourRows.map((row) => row.evidence),
    'E03 evidence',
  );
  assertAvailabilityBoundedByPopulation(
    resultAvailability,
    canonicalResultPopulation,
  );
  const migrationHandoffIds = migrationHandoffs(
    replayedPopulation.newlyAppliedFacts,
    replayedLabour.newlyAppliedFacts,
  );
  return Object.freeze({
    populationFactIds: Object.freeze(
      replayedPopulation.newlyAppliedFacts.map((fact) => fact.factId),
    ),
    labourFactIds: Object.freeze(
      replayedLabour.newlyAppliedFacts.map((fact) => fact.factId),
    ),
    migrationHandoffIds,
  });
}
