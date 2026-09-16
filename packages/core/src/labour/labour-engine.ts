import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { countryId, idempotencyKey, type CountryId } from '../ids.js';
import {
  assertWorldDecimalResult,
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from '../numeric/world-decimal.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import { compareCanonicalIdentifiers } from '../time/deterministic-order.js';
import type { E01DailyBoundary } from '../population/population-engine.js';

/** E03 is the sole owner of labour status, skills, positions and wage facts. */
export type LabourSkill = 'LOW' | 'MEDIUM' | 'HIGH';

export type LabourStatus =
  'UNEMPLOYED_SEARCHING' | 'EMPLOYED' | 'NOT_IN_LABOUR_FORCE' | 'STUDENT';

export type LabourPositionOwner = 'PRIVATE_SECTOR' | 'PUBLIC_SERVICE';

export type PublicServiceKind =
  'EDUCATION' | 'HEALTHCARE' | 'PUBLIC_SAFETY' | 'PUBLIC_ADMINISTRATION';

/** Read-only E02 availability; it bounds E03 but never mutates E03 itself. */
export interface LabourPopulationAvailability {
  readonly countryId: string;
  readonly locationId: string;
  readonly workingAgeAvailable: string;
}

export interface LabourAggregate {
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly status: LabourStatus;
  readonly count: string;
}

/** `classificationId` is a sector for private positions and a public service for public positions. */
export interface LabourPosition {
  readonly positionId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly owner: LabourPositionOwner;
  readonly classificationId: string;
  readonly requiredCount: string;
  readonly employedCount: string;
}

/** A supplied wage assertion; it is not a money settlement, formula or rate. */
export interface LabourWageAssertion {
  readonly positionId: string;
  readonly wageVersion: string;
  readonly wageAmount: string;
}

/** Durable idempotency bindings supplied by a later authoritative adapter. */
export interface LabourAppliedFactBinding {
  readonly factId: string;
  readonly canonicalPayload: string;
}

export interface LabourEngineState {
  readonly aggregates: readonly LabourAggregate[];
  readonly positions: readonly LabourPosition[];
  readonly wageAssertions: readonly LabourWageAssertion[];
  readonly appliedFactBindings: readonly LabourAppliedFactBinding[];
}

interface LabourFactBase {
  readonly factId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly dayIndex: string;
}

/** Education may move existing students into an explicit new skill/status only. */
export interface EducationSkillTransitionFact extends LabourFactBase {
  readonly kind: 'EDUCATION_SKILL_TRANSITION';
  readonly educationTransitionVersion: string;
  readonly sourceSkill: LabourSkill;
  readonly targetSkill: LabourSkill;
  readonly count: string;
}

/** Migration entry requires an explicit arrived handoff and explicit work-right version. */
export interface MigrationLabourEntryFact extends LabourFactBase {
  readonly kind: 'MIGRATION_LABOUR_ENTRY';
  readonly migrationHandoffId: string;
  readonly workRightsVersion: string;
  readonly skill: LabourSkill;
  readonly count: string;
}

export interface PrivateJobDemandSetFact extends LabourFactBase {
  readonly kind: 'PRIVATE_JOB_DEMAND_SET';
  readonly positionId: string;
  readonly sectorId: string;
  readonly skill: LabourSkill;
  readonly requiredCount: string;
}

export interface PublicPositionSetFact extends LabourFactBase {
  readonly kind: 'PUBLIC_POSITION_SET';
  readonly positionId: string;
  readonly publicService: PublicServiceKind;
  readonly skill: LabourSkill;
  readonly requiredCount: string;
}

export interface JobMatchFact extends LabourFactBase {
  readonly kind: 'JOB_MATCH';
  readonly positionId: string;
  readonly skill: LabourSkill;
  readonly count: string;
}

export interface PublicServiceOccupationFact extends LabourFactBase {
  readonly kind: 'PUBLIC_SERVICE_OCCUPATION';
  readonly positionId: string;
  readonly skill: LabourSkill;
  readonly count: string;
}

export interface LabourSeparationFact extends LabourFactBase {
  readonly kind: 'LABOUR_SEPARATION';
  readonly positionId: string;
  readonly skill: LabourSkill;
  readonly count: string;
}

export interface WageAssertionFact extends LabourFactBase {
  readonly kind: 'WAGE_ASSERTION';
  readonly positionId: string;
  readonly wageVersion: string;
  readonly wageAmount: string;
}

export type LabourFact =
  | EducationSkillTransitionFact
  | MigrationLabourEntryFact
  | PrivateJobDemandSetFact
  | PublicPositionSetFact
  | JobMatchFact
  | PublicServiceOccupationFact
  | LabourSeparationFact
  | WageAssertionFact;

export interface ApplyLabourFactsInput {
  readonly boundary: E01DailyBoundary;
  readonly populationAvailability: readonly LabourPopulationAvailability[];
  readonly state: LabourEngineState;
  readonly facts: readonly LabourFact[];
}

export interface LabourActionEvidence {
  readonly factId: string;
  readonly kind: LabourFact['kind'];
  readonly countryId: CountryId;
  readonly locationId: string;
  readonly dayIndex: string;
  readonly canonicalPayload: string;
  readonly positionId: string | null;
  readonly count: string | null;
  readonly wageVersion: string | null;
}

export interface ApplyLabourFactsResult {
  readonly state: LabourEngineState;
  readonly newlyAppliedFacts: readonly LabourActionEvidence[];
  readonly idempotentFactIds: readonly string[];
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

function exactNonNegativeCount(
  value: unknown,
  label: string,
): WorldDecimalValue {
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
  return assertWorldDecimalResult(parsed);
}

function canonicalCount(value: unknown, label: string): string {
  return canonicalDecimal(exactNonNegativeCount(value, label));
}

function canonicalNonNegativeDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    return invalid(`${label} must be a canonical non-negative decimal`);
  }
  let parsed: WorldDecimalValue;
  try {
    parsed = parseWorldDecimal(value);
  } catch {
    return invalid(`${label} must be a canonical non-negative decimal`);
  }
  if (parsed.isNegative() || canonicalDecimal(parsed) !== value) {
    return invalid(`${label} must be a canonical non-negative decimal`);
  }
  return canonicalDecimal(assertWorldDecimalResult(parsed));
}

function canonicalSkill(value: unknown, label: string): LabourSkill {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') return value;
  return invalid(`${label} must be LOW, MEDIUM or HIGH`);
}

function canonicalStatus(value: unknown, label: string): LabourStatus {
  if (
    value === 'UNEMPLOYED_SEARCHING' ||
    value === 'EMPLOYED' ||
    value === 'NOT_IN_LABOUR_FORCE' ||
    value === 'STUDENT'
  ) {
    return value;
  }
  return invalid(`${label} is not a supported labour status`);
}

function canonicalPositionOwner(
  value: unknown,
  label: string,
): LabourPositionOwner {
  if (value === 'PRIVATE_SECTOR' || value === 'PUBLIC_SERVICE') return value;
  return invalid(`${label} is not a supported position owner`);
}

function canonicalPublicService(
  value: unknown,
  label: string,
): PublicServiceKind {
  if (
    value === 'EDUCATION' ||
    value === 'HEALTHCARE' ||
    value === 'PUBLIC_SAFETY' ||
    value === 'PUBLIC_ADMINISTRATION'
  ) {
    return value;
  }
  return invalid(`${label} is not a supported public service`);
}

function aggregateKey(
  countryIdValue: string,
  locationId: string,
  skill: LabourSkill,
  status: LabourStatus,
): string {
  return [countryIdValue, locationId, skill, status].join(KEY_SEPARATOR);
}

function availabilityKey(countryIdValue: string, locationId: string): string {
  return [countryIdValue, locationId].join(KEY_SEPARATOR);
}

function wageKey(positionId: string, wageVersion: string): string {
  return [positionId, wageVersion].join(KEY_SEPARATOR);
}

function canonicalBoundary(boundary: E01DailyBoundary): E01DailyBoundary {
  const record = assertRecord(boundary, 'E01 boundary');
  assertKeys(record, ['dayIndex', 'kind'], 'E01 boundary');
  if (record.kind !== 'E01_DAILY_BOUNDARY') {
    invalid('Labour facts require an E01 daily boundary');
  }
  return Object.freeze({
    kind: 'E01_DAILY_BOUNDARY' as const,
    dayIndex: canonicalDayIndex(record.dayIndex, 'E01 boundary dayIndex'),
  });
}

function canonicalAvailability(
  value: unknown,
): readonly LabourPopulationAvailability[] {
  const seen = new Set<string>();
  const availability = assertArray(value, 'populationAvailability').map(
    (row) => {
      const record = assertRecord(row, 'population availability');
      assertKeys(
        record,
        ['countryId', 'locationId', 'workingAgeAvailable'],
        'population availability',
      );
      const countryIdValue = canonicalCountry(record.countryId, 'countryId');
      const locationId = canonicalIdentifier(record.locationId, 'locationId');
      const key = availabilityKey(countryIdValue, locationId);
      if (seen.has(key)) invalid(`Population availability repeats ${key}`);
      seen.add(key);
      return Object.freeze({
        countryId: countryIdValue,
        locationId,
        workingAgeAvailable: canonicalCount(
          record.workingAgeAvailable,
          'workingAgeAvailable',
        ),
      });
    },
  );
  availability.sort((left, right) =>
    compareCanonicalIdentifiers(
      availabilityKey(left.countryId, left.locationId),
      availabilityKey(right.countryId, right.locationId),
    ),
  );
  return Object.freeze(availability);
}

function canonicalAggregate(value: unknown): LabourAggregate {
  const record = assertRecord(value, 'labour aggregate');
  assertKeys(
    record,
    ['count', 'countryId', 'locationId', 'skill', 'status'],
    'labour aggregate',
  );
  return Object.freeze({
    countryId: canonicalCountry(record.countryId, 'aggregate countryId'),
    locationId: canonicalIdentifier(record.locationId, 'aggregate locationId'),
    skill: canonicalSkill(record.skill, 'aggregate skill'),
    status: canonicalStatus(record.status, 'aggregate status'),
    count: canonicalCount(record.count, 'aggregate count'),
  });
}

function canonicalPosition(value: unknown): LabourPosition {
  const record = assertRecord(value, 'labour position');
  assertKeys(
    record,
    [
      'classificationId',
      'countryId',
      'employedCount',
      'locationId',
      'owner',
      'positionId',
      'requiredCount',
      'skill',
    ],
    'labour position',
  );
  const owner = canonicalPositionOwner(record.owner, 'position owner');
  const classificationId = canonicalIdentifier(
    record.classificationId,
    'position classificationId',
  );
  if (owner === 'PUBLIC_SERVICE') {
    canonicalPublicService(
      classificationId,
      'public position classificationId',
    );
  }
  const requiredCount = canonicalCount(
    record.requiredCount,
    'position requiredCount',
  );
  const employedCount = canonicalCount(
    record.employedCount,
    'position employedCount',
  );
  if (
    parseWorldDecimal(employedCount).greaterThan(
      parseWorldDecimal(requiredCount),
    )
  ) {
    invalid('Position employedCount cannot exceed requiredCount');
  }
  return Object.freeze({
    positionId: canonicalIdentifier(record.positionId, 'positionId'),
    countryId: canonicalCountry(record.countryId, 'position countryId'),
    locationId: canonicalIdentifier(record.locationId, 'position locationId'),
    skill: canonicalSkill(record.skill, 'position skill'),
    owner,
    classificationId,
    requiredCount,
    employedCount,
  });
}

function canonicalWageAssertion(value: unknown): LabourWageAssertion {
  const record = assertRecord(value, 'labour wage assertion');
  assertKeys(
    record,
    ['positionId', 'wageAmount', 'wageVersion'],
    'labour wage assertion',
  );
  return Object.freeze({
    positionId: canonicalIdentifier(record.positionId, 'wage positionId'),
    wageVersion: canonicalIdentifier(record.wageVersion, 'wageVersion'),
    wageAmount: canonicalNonNegativeDecimal(record.wageAmount, 'wageAmount'),
  });
}

function canonicalFact(
  input: LabourFact,
  boundary: E01DailyBoundary,
): LabourFact {
  const record = assertRecord(input, 'labour fact');
  const base = {
    factId: canonicalIdentifier(record.factId, 'factId'),
    countryId: canonicalCountry(record.countryId, 'fact countryId'),
    locationId: canonicalIdentifier(record.locationId, 'fact locationId'),
    dayIndex: canonicalDayIndex(record.dayIndex, 'fact dayIndex'),
  };
  if (base.dayIndex !== boundary.dayIndex) {
    invalid('Labour fact must be recorded on the supplied E01 daily boundary');
  }

  switch (record.kind) {
    case 'EDUCATION_SKILL_TRANSITION': {
      assertKeys(
        record,
        [
          'count',
          'countryId',
          'dayIndex',
          'educationTransitionVersion',
          'factId',
          'kind',
          'locationId',
          'sourceSkill',
          'targetSkill',
        ],
        'education skill transition fact',
      );
      const sourceSkill = canonicalSkill(record.sourceSkill, 'sourceSkill');
      const targetSkill = canonicalSkill(record.targetSkill, 'targetSkill');
      if (sourceSkill === targetSkill) {
        invalid('Education skill transition must change the explicit skill');
      }
      return Object.freeze({
        kind: 'EDUCATION_SKILL_TRANSITION' as const,
        ...base,
        educationTransitionVersion: canonicalIdentifier(
          record.educationTransitionVersion,
          'educationTransitionVersion',
        ),
        sourceSkill,
        targetSkill,
        count: canonicalCount(record.count, 'education transition count'),
      });
    }
    case 'MIGRATION_LABOUR_ENTRY':
      assertKeys(
        record,
        [
          'count',
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'migrationHandoffId',
          'skill',
          'workRightsVersion',
        ],
        'migration labour entry fact',
      );
      return Object.freeze({
        kind: 'MIGRATION_LABOUR_ENTRY' as const,
        ...base,
        migrationHandoffId: canonicalIdentifier(
          record.migrationHandoffId,
          'migrationHandoffId',
        ),
        workRightsVersion: canonicalIdentifier(
          record.workRightsVersion,
          'workRightsVersion',
        ),
        skill: canonicalSkill(record.skill, 'migration skill'),
        count: canonicalCount(record.count, 'migration labour entry count'),
      });
    case 'PRIVATE_JOB_DEMAND_SET':
      assertKeys(
        record,
        [
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'positionId',
          'requiredCount',
          'sectorId',
          'skill',
        ],
        'private job demand fact',
      );
      return Object.freeze({
        kind: 'PRIVATE_JOB_DEMAND_SET' as const,
        ...base,
        positionId: canonicalIdentifier(
          record.positionId,
          'private positionId',
        ),
        sectorId: canonicalIdentifier(record.sectorId, 'sectorId'),
        skill: canonicalSkill(record.skill, 'private job skill'),
        requiredCount: canonicalCount(
          record.requiredCount,
          'private requiredCount',
        ),
      });
    case 'PUBLIC_POSITION_SET':
      assertKeys(
        record,
        [
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'positionId',
          'publicService',
          'requiredCount',
          'skill',
        ],
        'public position fact',
      );
      return Object.freeze({
        kind: 'PUBLIC_POSITION_SET' as const,
        ...base,
        positionId: canonicalIdentifier(record.positionId, 'public positionId'),
        publicService: canonicalPublicService(
          record.publicService,
          'publicService',
        ),
        skill: canonicalSkill(record.skill, 'public position skill'),
        requiredCount: canonicalCount(
          record.requiredCount,
          'public requiredCount',
        ),
      });
    case 'JOB_MATCH':
      assertKeys(
        record,
        [
          'count',
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'positionId',
          'skill',
        ],
        'job match fact',
      );
      return Object.freeze({
        kind: 'JOB_MATCH' as const,
        ...base,
        positionId: canonicalIdentifier(
          record.positionId,
          'job match positionId',
        ),
        skill: canonicalSkill(record.skill, 'job match skill'),
        count: canonicalCount(record.count, 'job match count'),
      });
    case 'PUBLIC_SERVICE_OCCUPATION':
      assertKeys(
        record,
        [
          'count',
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'positionId',
          'skill',
        ],
        'public service occupation fact',
      );
      return Object.freeze({
        kind: 'PUBLIC_SERVICE_OCCUPATION' as const,
        ...base,
        positionId: canonicalIdentifier(
          record.positionId,
          'public occupation positionId',
        ),
        skill: canonicalSkill(record.skill, 'public occupation skill'),
        count: canonicalCount(record.count, 'public occupation count'),
      });
    case 'LABOUR_SEPARATION':
      assertKeys(
        record,
        [
          'count',
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'positionId',
          'skill',
        ],
        'labour separation fact',
      );
      return Object.freeze({
        kind: 'LABOUR_SEPARATION' as const,
        ...base,
        positionId: canonicalIdentifier(
          record.positionId,
          'separation positionId',
        ),
        skill: canonicalSkill(record.skill, 'separation skill'),
        count: canonicalCount(record.count, 'separation count'),
      });
    case 'WAGE_ASSERTION':
      assertKeys(
        record,
        [
          'countryId',
          'dayIndex',
          'factId',
          'kind',
          'locationId',
          'positionId',
          'wageAmount',
          'wageVersion',
        ],
        'wage assertion fact',
      );
      return Object.freeze({
        kind: 'WAGE_ASSERTION' as const,
        ...base,
        positionId: canonicalIdentifier(record.positionId, 'wage positionId'),
        wageVersion: canonicalIdentifier(record.wageVersion, 'wageVersion'),
        wageAmount: canonicalNonNegativeDecimal(
          record.wageAmount,
          'wageAmount',
        ),
      });
    default:
      return invalid('Labour fact type is unsupported');
  }
}

type CanonicalLabourFact = ReturnType<typeof canonicalFact>;

function canonicalBoundLabourFact(
  canonicalPayload: string,
): CanonicalLabourFact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalPayload);
  } catch {
    return invalid('Labour fact binding payload must be canonical text');
  }
  const record = assertRecord(parsed, 'bound labour fact');
  if (typeof record.dayIndex !== 'string') {
    return invalid(
      'Labour fact binding payload must include a canonical dayIndex',
    );
  }
  try {
    const fact = canonicalFact(parsed as LabourFact, {
      kind: 'E01_DAILY_BOUNDARY',
      dayIndex: canonicalDayIndex(
        record.dayIndex,
        'bound labour fact dayIndex',
      ),
    });
    if (canonicalSerialize(fact) !== canonicalPayload) {
      invalid('Labour fact binding payload must be canonical text');
    }
    return fact;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return invalid('Labour fact binding payload must be a supported fact');
  }
}

function canonicalState(
  input: LabourEngineState,
  populationAvailabilityInput: readonly LabourPopulationAvailability[],
): LabourEngineState {
  const state = assertRecord(input, 'labour state');
  assertKeys(
    state,
    ['aggregates', 'appliedFactBindings', 'positions', 'wageAssertions'],
    'labour state',
  );
  const populationAvailability = canonicalAvailability(
    populationAvailabilityInput,
  );
  const availability = new Map(
    populationAvailability.map((entry) => [
      availabilityKey(entry.countryId, entry.locationId),
      entry,
    ]),
  );

  const aggregateIds = new Set<string>();
  const aggregates = assertArray(state.aggregates, 'state aggregates').map(
    (value) => {
      const aggregate = canonicalAggregate(value);
      const key = aggregateKey(
        aggregate.countryId,
        aggregate.locationId,
        aggregate.skill,
        aggregate.status,
      );
      if (aggregateIds.has(key))
        invalid(`Labour state repeats aggregate ${key}`);
      aggregateIds.add(key);
      return aggregate;
    },
  );

  const positionIds = new Set<string>();
  const positions = assertArray(state.positions, 'state positions').map(
    (value) => {
      const position = canonicalPosition(value);
      if (positionIds.has(position.positionId)) {
        invalid(`Labour state repeats position ${position.positionId}`);
      }
      positionIds.add(position.positionId);
      if (
        !availability.has(
          availabilityKey(position.countryId, position.locationId),
        )
      ) {
        invalid(
          `Position ${position.positionId} has no read-only population availability`,
        );
      }
      return position;
    },
  );

  const positionById = new Map(
    positions.map((position) => [position.positionId, position]),
  );
  const wageIds = new Set<string>();
  const wageAssertions = assertArray(
    state.wageAssertions,
    'state wageAssertions',
  ).map((value) => {
    const wage = canonicalWageAssertion(value);
    const key = wageKey(wage.positionId, wage.wageVersion);
    if (wageIds.has(key)) invalid(`Labour state repeats wage assertion ${key}`);
    if (!positionById.has(wage.positionId)) {
      invalid(`Wage assertion references missing position ${wage.positionId}`);
    }
    wageIds.add(key);
    return wage;
  });

  const bindingIds = new Set<string>();
  const appliedFactBindings = assertArray(
    state.appliedFactBindings,
    'state appliedFactBindings',
  ).map((value) => {
    const binding = assertRecord(value, 'labour fact binding');
    assertKeys(binding, ['canonicalPayload', 'factId'], 'labour fact binding');
    const factId = canonicalIdentifier(binding.factId, 'bound factId');
    if (bindingIds.has(factId)) invalid(`Labour state repeats fact ${factId}`);
    if (typeof binding.canonicalPayload !== 'string') {
      invalid('Labour fact binding payload must be canonical text');
    }
    const fact = canonicalBoundLabourFact(binding.canonicalPayload);
    if (fact.factId !== factId) {
      invalid(
        'Labour fact binding identity must match its canonical payload factId',
      );
    }
    bindingIds.add(factId);
    return Object.freeze({
      factId,
      canonicalPayload: binding.canonicalPayload,
    });
  });

  const employedByAggregate = new Map<string, WorldDecimalValue>();
  for (const position of positions) {
    const key = aggregateKey(
      position.countryId,
      position.locationId,
      position.skill,
      'EMPLOYED',
    );
    const previous = employedByAggregate.get(key) ?? parseWorldDecimal('0');
    employedByAggregate.set(
      key,
      assertWorldDecimalResult(
        previous.plus(parseWorldDecimal(position.employedCount)),
      ),
    );
  }
  const aggregateByKey = new Map(
    aggregates.map((aggregate) => [
      aggregateKey(
        aggregate.countryId,
        aggregate.locationId,
        aggregate.skill,
        aggregate.status,
      ),
      aggregate,
    ]),
  );
  const employedAggregateKeys = new Set([
    ...employedByAggregate.keys(),
    ...aggregates
      .filter((aggregate) => aggregate.status === 'EMPLOYED')
      .map((aggregate) =>
        aggregateKey(
          aggregate.countryId,
          aggregate.locationId,
          aggregate.skill,
          aggregate.status,
        ),
      ),
  ]);
  for (const key of employedAggregateKeys) {
    const aggregate = aggregateByKey.get(key);
    const expected = employedByAggregate.get(key) ?? parseWorldDecimal('0');
    if (aggregate === undefined && expected.isZero()) continue;
    if (
      aggregate === undefined ||
      !parseWorldDecimal(aggregate.count).equals(expected)
    ) {
      invalid(
        'Aggregate employed count must equal private and public position employment',
      );
    }
  }

  const totalsByAvailability = new Map<string, WorldDecimalValue>();
  for (const aggregate of aggregates) {
    const key = availabilityKey(aggregate.countryId, aggregate.locationId);
    const availabilityEntry = availability.get(key);
    if (availabilityEntry === undefined) {
      invalid(
        `Labour aggregate has no read-only population availability ${key}`,
      );
    }
    const previous = totalsByAvailability.get(key) ?? parseWorldDecimal('0');
    totalsByAvailability.set(
      key,
      assertWorldDecimalResult(
        previous.plus(parseWorldDecimal(aggregate.count)),
      ),
    );
  }
  for (const [key, total] of totalsByAvailability) {
    const available = availability.get(key)!;
    if (total.greaterThan(parseWorldDecimal(available.workingAgeAvailable))) {
      invalid(
        'Labour status aggregates cannot exceed read-only working-age availability',
      );
    }
  }

  aggregates.sort((left, right) =>
    compareCanonicalIdentifiers(
      aggregateKey(left.countryId, left.locationId, left.skill, left.status),
      aggregateKey(
        right.countryId,
        right.locationId,
        right.skill,
        right.status,
      ),
    ),
  );
  positions.sort((left, right) =>
    compareCanonicalIdentifiers(left.positionId, right.positionId),
  );
  wageAssertions.sort((left, right) =>
    compareCanonicalIdentifiers(
      wageKey(left.positionId, left.wageVersion),
      wageKey(right.positionId, right.wageVersion),
    ),
  );
  appliedFactBindings.sort((left, right) =>
    compareCanonicalIdentifiers(left.factId, right.factId),
  );
  return Object.freeze({
    aggregates: Object.freeze(aggregates),
    positions: Object.freeze(positions),
    wageAssertions: Object.freeze(wageAssertions),
    appliedFactBindings: Object.freeze(appliedFactBindings),
  });
}

function factPositionId(fact: CanonicalLabourFact): string | null {
  switch (fact.kind) {
    case 'PRIVATE_JOB_DEMAND_SET':
    case 'PUBLIC_POSITION_SET':
    case 'JOB_MATCH':
    case 'PUBLIC_SERVICE_OCCUPATION':
    case 'LABOUR_SEPARATION':
    case 'WAGE_ASSERTION':
      return fact.positionId;
    default:
      return null;
  }
}

function factCount(fact: CanonicalLabourFact): string | null {
  switch (fact.kind) {
    case 'EDUCATION_SKILL_TRANSITION':
    case 'MIGRATION_LABOUR_ENTRY':
    case 'JOB_MATCH':
    case 'PUBLIC_SERVICE_OCCUPATION':
    case 'LABOUR_SEPARATION':
      return fact.count;
    case 'PRIVATE_JOB_DEMAND_SET':
    case 'PUBLIC_POSITION_SET':
      return fact.requiredCount;
    default:
      return null;
  }
}

function assertNoAmbiguousBatch(facts: readonly CanonicalLabourFact[]): void {
  const positionMutations = new Set<string>();
  const aggregateMutations = new Set<string>();
  const wageAssertions = new Set<string>();
  const registerPosition = (positionId: string): void => {
    if (positionMutations.has(positionId)) {
      invalid(`One input set may mutate position ${positionId} only once`);
    }
    positionMutations.add(positionId);
  };
  const registerAggregate = (
    countryIdValue: string,
    locationId: string,
    skill: LabourSkill,
    status: LabourStatus,
  ): void => {
    const key = aggregateKey(countryIdValue, locationId, skill, status);
    if (aggregateMutations.has(key)) {
      invalid(`One input set may mutate aggregate ${key} only once`);
    }
    aggregateMutations.add(key);
  };

  for (const fact of facts) {
    switch (fact.kind) {
      case 'EDUCATION_SKILL_TRANSITION':
        registerAggregate(
          fact.countryId,
          fact.locationId,
          fact.sourceSkill,
          'STUDENT',
        );
        registerAggregate(
          fact.countryId,
          fact.locationId,
          fact.targetSkill,
          'UNEMPLOYED_SEARCHING',
        );
        break;
      case 'MIGRATION_LABOUR_ENTRY':
        registerAggregate(
          fact.countryId,
          fact.locationId,
          fact.skill,
          'UNEMPLOYED_SEARCHING',
        );
        break;
      case 'PRIVATE_JOB_DEMAND_SET':
      case 'PUBLIC_POSITION_SET':
        registerPosition(fact.positionId);
        break;
      case 'JOB_MATCH':
      case 'PUBLIC_SERVICE_OCCUPATION':
      case 'LABOUR_SEPARATION':
        registerPosition(fact.positionId);
        registerAggregate(
          fact.countryId,
          fact.locationId,
          fact.skill,
          'UNEMPLOYED_SEARCHING',
        );
        registerAggregate(
          fact.countryId,
          fact.locationId,
          fact.skill,
          'EMPLOYED',
        );
        break;
      case 'WAGE_ASSERTION': {
        const key = wageKey(fact.positionId, fact.wageVersion);
        if (wageAssertions.has(key)) {
          invalid(`One input set may assert wage ${key} only once`);
        }
        wageAssertions.add(key);
        break;
      }
    }
  }
}

function mutableAggregateMap(
  state: LabourEngineState,
): Map<string, LabourAggregate> {
  return new Map(
    state.aggregates.map((aggregate) => [
      aggregateKey(
        aggregate.countryId,
        aggregate.locationId,
        aggregate.skill,
        aggregate.status,
      ),
      { ...aggregate },
    ]),
  );
}

function adjustAggregate(
  aggregates: Map<string, LabourAggregate>,
  countryIdValue: string,
  locationId: string,
  skill: LabourSkill,
  status: LabourStatus,
  count: string,
  direction: 'INCREASE' | 'DECREASE',
): void {
  const key = aggregateKey(countryIdValue, locationId, skill, status);
  const existing = aggregates.get(key);
  const delta = parseWorldDecimal(count);
  const previous =
    existing === undefined
      ? parseWorldDecimal('0')
      : parseWorldDecimal(existing.count);
  const next =
    direction === 'INCREASE' ? previous.plus(delta) : previous.minus(delta);
  if (next.isNegative()) {
    invalid(`Labour aggregate ${key} would become negative`);
  }
  if (existing === undefined && next.isZero()) return;
  aggregates.set(
    key,
    Object.freeze({
      countryId: countryIdValue,
      locationId,
      skill,
      status,
      count: canonicalDecimal(assertWorldDecimalResult(next)),
    }),
  );
}

function assertPositionIdentity(
  position: LabourPosition,
  fact: Pick<LabourFactBase, 'countryId' | 'locationId'> & {
    readonly skill: LabourSkill;
  },
): void {
  if (
    position.countryId !== fact.countryId ||
    position.locationId !== fact.locationId
  ) {
    invalid(
      'Labour position identity must match the supplied fact country and location',
    );
  }
  if (position.skill !== fact.skill) {
    invalid('Labour position identity must match the supplied fact skill');
  }
}

function requirePosition(
  positions: Map<string, LabourPosition>,
  positionId: string,
): LabourPosition {
  const position = positions.get(positionId);
  if (position === undefined) {
    return invalid(`Labour fact references missing position ${positionId}`);
  }
  return position;
}

function setPositionDemand(
  positions: Map<string, LabourPosition>,
  fact: PrivateJobDemandSetFact | PublicPositionSetFact,
): void {
  const owner: LabourPositionOwner =
    fact.kind === 'PRIVATE_JOB_DEMAND_SET'
      ? 'PRIVATE_SECTOR'
      : 'PUBLIC_SERVICE';
  const classificationId =
    fact.kind === 'PRIVATE_JOB_DEMAND_SET' ? fact.sectorId : fact.publicService;
  const existing = positions.get(fact.positionId);
  if (existing !== undefined) {
    assertPositionIdentity(existing, fact);
    if (
      existing.owner !== owner ||
      existing.classificationId !== classificationId
    ) {
      invalid('A position ID cannot change owner or classification');
    }
    if (
      parseWorldDecimal(fact.requiredCount).lessThan(
        parseWorldDecimal(existing.employedCount),
      )
    ) {
      invalid('Position demand cannot be reduced below its employed count');
    }
    positions.set(
      fact.positionId,
      Object.freeze({ ...existing, requiredCount: fact.requiredCount }),
    );
    return;
  }
  positions.set(
    fact.positionId,
    Object.freeze({
      positionId: fact.positionId,
      countryId: fact.countryId,
      locationId: fact.locationId,
      skill: fact.skill,
      owner,
      classificationId,
      requiredCount: fact.requiredCount,
      employedCount: '0',
    }),
  );
}

function occupyPosition(
  aggregates: Map<string, LabourAggregate>,
  positions: Map<string, LabourPosition>,
  fact: JobMatchFact | PublicServiceOccupationFact,
): void {
  const position = requirePosition(positions, fact.positionId);
  assertPositionIdentity(position, fact);
  if (
    (fact.kind === 'JOB_MATCH' && position.owner !== 'PRIVATE_SECTOR') ||
    (fact.kind === 'PUBLIC_SERVICE_OCCUPATION' &&
      position.owner !== 'PUBLIC_SERVICE')
  ) {
    invalid('Labour occupation fact does not match its position owner');
  }
  const nextEmployed = parseWorldDecimal(position.employedCount).plus(
    parseWorldDecimal(fact.count),
  );
  if (nextEmployed.greaterThan(parseWorldDecimal(position.requiredCount))) {
    invalid('Labour occupation cannot fill more than the explicit vacancy');
  }
  adjustAggregate(
    aggregates,
    fact.countryId,
    fact.locationId,
    fact.skill,
    'UNEMPLOYED_SEARCHING',
    fact.count,
    'DECREASE',
  );
  adjustAggregate(
    aggregates,
    fact.countryId,
    fact.locationId,
    fact.skill,
    'EMPLOYED',
    fact.count,
    'INCREASE',
  );
  positions.set(
    position.positionId,
    Object.freeze({
      ...position,
      employedCount: canonicalDecimal(assertWorldDecimalResult(nextEmployed)),
    }),
  );
}

function separateFromPosition(
  aggregates: Map<string, LabourAggregate>,
  positions: Map<string, LabourPosition>,
  fact: LabourSeparationFact,
): void {
  const position = requirePosition(positions, fact.positionId);
  assertPositionIdentity(position, fact);
  const nextEmployed = parseWorldDecimal(position.employedCount).minus(
    parseWorldDecimal(fact.count),
  );
  if (nextEmployed.isNegative()) {
    invalid(
      'Labour separation cannot remove more workers than the position employs',
    );
  }
  adjustAggregate(
    aggregates,
    fact.countryId,
    fact.locationId,
    fact.skill,
    'EMPLOYED',
    fact.count,
    'DECREASE',
  );
  adjustAggregate(
    aggregates,
    fact.countryId,
    fact.locationId,
    fact.skill,
    'UNEMPLOYED_SEARCHING',
    fact.count,
    'INCREASE',
  );
  positions.set(
    position.positionId,
    Object.freeze({
      ...position,
      employedCount: canonicalDecimal(assertWorldDecimalResult(nextEmployed)),
    }),
  );
}

function evidenceFor(fact: CanonicalLabourFact): LabourActionEvidence {
  return Object.freeze({
    factId: fact.factId,
    kind: fact.kind,
    countryId: canonicalCountry(fact.countryId, 'evidence countryId'),
    locationId: fact.locationId,
    dayIndex: fact.dayIndex,
    canonicalPayload: canonicalSerialize(fact),
    positionId: factPositionId(fact),
    count: factCount(fact),
    wageVersion: fact.kind === 'WAGE_ASSERTION' ? fact.wageVersion : null,
  });
}

/**
 * Applies explicit E03 facts only. It does not derive participation, matching,
 * wages, population timing, money settlement, or a public-budget decision.
 */
export function applyLabourFacts(
  input: ApplyLabourFactsInput,
): ApplyLabourFactsResult {
  const inputRecord = assertRecord(input, 'apply labour input');
  assertKeys(
    inputRecord,
    ['boundary', 'facts', 'populationAvailability', 'state'],
    'apply labour input',
  );
  const boundary = canonicalBoundary(input.boundary);
  const state = canonicalState(input.state, input.populationAvailability);
  const facts = assertArray(input.facts, 'labour facts')
    .map((fact) => canonicalFact(fact as LabourFact, boundary))
    .sort((left, right) =>
      compareCanonicalIdentifiers(left.factId, right.factId),
    );

  const priorBindings = new Map(
    state.appliedFactBindings.map((binding) => [
      binding.factId,
      binding.canonicalPayload,
    ]),
  );
  const incomingFactIds = new Set<string>();
  const activeFacts: CanonicalLabourFact[] = [];
  const idempotentFactIds: string[] = [];
  for (const fact of facts) {
    if (incomingFactIds.has(fact.factId)) {
      invalid(`One input set repeats fact ${fact.factId}`);
    }
    incomingFactIds.add(fact.factId);
    const canonicalPayload = canonicalSerialize(fact);
    const prior = priorBindings.get(fact.factId);
    if (prior !== undefined) {
      if (prior !== canonicalPayload) {
        invalid(
          `Fact ${fact.factId} conflicts with its prior canonical payload`,
        );
      }
      idempotentFactIds.push(fact.factId);
    } else {
      activeFacts.push(fact);
    }
  }
  assertNoAmbiguousBatch(activeFacts);

  const aggregates = mutableAggregateMap(state);
  const positions = new Map(
    state.positions.map((position) => [position.positionId, { ...position }]),
  );
  const wages = new Map(
    state.wageAssertions.map((wage) => [
      wageKey(wage.positionId, wage.wageVersion),
      wage,
    ]),
  );

  for (const fact of activeFacts) {
    switch (fact.kind) {
      case 'EDUCATION_SKILL_TRANSITION':
        adjustAggregate(
          aggregates,
          fact.countryId,
          fact.locationId,
          fact.sourceSkill,
          'STUDENT',
          fact.count,
          'DECREASE',
        );
        adjustAggregate(
          aggregates,
          fact.countryId,
          fact.locationId,
          fact.targetSkill,
          'UNEMPLOYED_SEARCHING',
          fact.count,
          'INCREASE',
        );
        break;
      case 'MIGRATION_LABOUR_ENTRY':
        adjustAggregate(
          aggregates,
          fact.countryId,
          fact.locationId,
          fact.skill,
          'UNEMPLOYED_SEARCHING',
          fact.count,
          'INCREASE',
        );
        break;
      case 'PRIVATE_JOB_DEMAND_SET':
      case 'PUBLIC_POSITION_SET':
        setPositionDemand(positions, fact);
        break;
      case 'JOB_MATCH':
      case 'PUBLIC_SERVICE_OCCUPATION':
        occupyPosition(aggregates, positions, fact);
        break;
      case 'LABOUR_SEPARATION':
        separateFromPosition(aggregates, positions, fact);
        break;
      case 'WAGE_ASSERTION': {
        const position = requirePosition(positions, fact.positionId);
        if (
          position.countryId !== fact.countryId ||
          position.locationId !== fact.locationId
        ) {
          invalid(
            'Wage assertion position must match the supplied fact country and location',
          );
        }
        const key = wageKey(fact.positionId, fact.wageVersion);
        if (wages.has(key)) {
          invalid(`Wage assertion ${key} already exists`);
        }
        wages.set(
          key,
          Object.freeze({
            positionId: fact.positionId,
            wageVersion: fact.wageVersion,
            wageAmount: fact.wageAmount,
          }),
        );
        break;
      }
    }
  }

  const nextState = canonicalState(
    {
      aggregates: [...aggregates.values()],
      positions: [...positions.values()],
      wageAssertions: [...wages.values()],
      appliedFactBindings: [
        ...state.appliedFactBindings,
        ...activeFacts.map((fact) =>
          Object.freeze({
            factId: fact.factId,
            canonicalPayload: canonicalSerialize(fact),
          }),
        ),
      ],
    },
    input.populationAvailability,
  );

  return Object.freeze({
    state: nextState,
    newlyAppliedFacts: Object.freeze(activeFacts.map(evidenceFor)),
    idempotentFactIds: Object.freeze(idempotentFactIds),
  });
}
