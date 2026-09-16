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

/** E02 is the sole owner of these population cohort stocks. */
export type PopulationCohort =
  'CHILDREN_0_15' | 'WORKING_AGE_16_64' | 'RETIRED_65_PLUS';

export type PopulationFactKind =
  | 'BIRTH'
  | 'DEATH'
  | 'MIGRATION_DEPARTURE'
  | 'MIGRATION_ARRIVAL'
  | 'AGE_COHORT_ROLL'
  | 'HOUSEHOLD_COUNT_UPDATE';

export interface E01DailyBoundary {
  readonly kind: 'E01_DAILY_BOUNDARY';
  /** Canonical day ordinal supplied by E01; no calendar policy is inferred. */
  readonly dayIndex: string;
}

export interface PopulationCountryState {
  readonly countryId: string;
  /** Stored only when it exactly closes over the three authoritative cohorts. */
  readonly total: string;
  readonly children0To15: string;
  readonly workingAge16To64: string;
  readonly retired65Plus: string;
  readonly householdCount: string;
}

/**
 * Durable idempotency bindings supplied by the later authoritative adapter.
 * This pure module never persists them itself.
 */
export interface PopulationAppliedFactBinding {
  readonly factId: string;
  readonly canonicalPayload: string;
}

export interface PopulationEngineState {
  readonly countries: readonly PopulationCountryState[];
  readonly appliedFactBindings: readonly PopulationAppliedFactBinding[];
}

interface PopulationFactBase {
  readonly kind: PopulationFactKind;
  readonly factId: string;
  readonly countryId: string;
  readonly dayIndex: string;
}

export interface BirthPopulationFact extends PopulationFactBase {
  readonly kind: 'BIRTH';
  readonly count: string;
}

/** The count is already explicit; no mortality-rate or health formula exists here. */
export interface DeathPopulationFact extends PopulationFactBase {
  readonly kind: 'DEATH';
  readonly cohort: PopulationCohort;
  readonly count: string;
  readonly cause: 'BASELINE' | 'HEALTH_CRISIS' | 'CRISIS_CASUALTY';
  /** Metadata only: a later approved owner owns any modifier calculation. */
  readonly mortalityModifierVersion: string | null;
}

export interface MigrationLabourHandoff {
  readonly handoffId: string;
  readonly disposition: 'PENDING_V11_2_CLASSIFICATION';
}

interface MigrationPopulationFactBase extends PopulationFactBase {
  readonly migrationId: string;
  readonly counterpartyCountryId: string;
  readonly cohort: PopulationCohort;
  readonly count: string;
}

export interface MigrationDeparturePopulationFact extends MigrationPopulationFactBase {
  readonly kind: 'MIGRATION_DEPARTURE';
}

export interface MigrationArrivalPopulationFact extends MigrationPopulationFactBase {
  readonly kind: 'MIGRATION_ARRIVAL';
  /** Typed handoff metadata only; it cannot create labour/skill/wage state. */
  readonly migrationLabourHandoff: MigrationLabourHandoff | null;
}

export interface AgeCohortRollPopulationFact extends PopulationFactBase {
  readonly kind: 'AGE_COHORT_ROLL';
  readonly fromCohort: 'CHILDREN_0_15' | 'WORKING_AGE_16_64';
  readonly toCohort: 'WORKING_AGE_16_64' | 'RETIRED_65_PLUS';
  readonly count: string;
}

export interface HouseholdCountUpdatePopulationFact extends PopulationFactBase {
  readonly kind: 'HOUSEHOLD_COUNT_UPDATE';
  readonly householdCount: string;
  /** Caller-supplied total used by its household calculation; it never changes population. */
  readonly populationTotalForReconciliation: string;
}

export type PopulationFact =
  | BirthPopulationFact
  | DeathPopulationFact
  | MigrationDeparturePopulationFact
  | MigrationArrivalPopulationFact
  | AgeCohortRollPopulationFact
  | HouseholdCountUpdatePopulationFact;

/** An approval/schedule notice is deliberately outside the population flow set. */
export interface ScheduledMigrationNotice {
  readonly migrationId: string;
  readonly originCountryId: string;
  readonly destinationCountryId: string;
  readonly cohort: PopulationCohort;
  readonly count: string;
  readonly scheduledDayIndex: string;
}

export interface ApplyPopulationFactsInput {
  readonly boundary: E01DailyBoundary;
  readonly state: PopulationEngineState;
  readonly facts: readonly PopulationFact[];
  readonly scheduledMigrationNotices?: readonly ScheduledMigrationNotice[];
}

export interface PopulationCountryTransition {
  readonly countryId: CountryId;
  readonly previousTotal: string;
  readonly births: string;
  readonly deaths: string;
  readonly immigration: string;
  readonly emigration: string;
  readonly nextTotal: string;
  /**
   * Exact derived ratio, reduced to canonical integer terms. V11.1 deliberately
   * does not round a non-terminating demographic ratio into a false precise rate.
   */
  readonly dependencyRatio: PopulationDependencyRatio | null;
}

export interface PopulationDependencyRatio {
  readonly numerator: string;
  readonly denominator: string;
}

export interface PopulationActionEvidence {
  readonly factId: string;
  readonly kind: PopulationFactKind;
  readonly countryId: CountryId;
  readonly dayIndex: string;
  readonly canonicalPayload: string;
  readonly migrationId: string | null;
  readonly count: string | null;
}

export interface PopulationReconciliationWarning {
  readonly factId: string;
  readonly countryId: CountryId;
  readonly householdCount: string;
  readonly suppliedPopulationTotal: string;
  readonly actualPopulationTotal: string;
  readonly code: 'HOUSEHOLD_RECONCILIATION_MISMATCH';
}

export interface ApplyPopulationFactsResult {
  readonly state: PopulationEngineState;
  readonly countryTransitions: readonly PopulationCountryTransition[];
  readonly newlyAppliedFacts: readonly PopulationActionEvidence[];
  readonly idempotentFactIds: readonly string[];
  readonly scheduledMigrationIds: readonly string[];
  readonly reconciliationWarnings: readonly PopulationReconciliationWarning[];
}

const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const populationBoundaryInstances = new WeakSet<object>();

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS, message);
}

function canonicalDayIndex(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !CANONICAL_NON_NEGATIVE_INTEGER.test(value)
  ) {
    invalid(`${label} must be a canonical non-negative day index`);
  }
  return value;
}

function canonicalFactId(value: string, label: string): string {
  try {
    return idempotencyKey(value);
  } catch {
    return invalid(`${label} must be a canonical immutable identifier`);
  }
}

function exactNonNegativeCount(
  value: string,
  label: string,
): WorldDecimalValue {
  const parsed = parseWorldDecimal(value);
  if (parsed.isNegative() || !parsed.isInteger()) {
    invalid(`${label} must be a non-negative whole-person/count string`);
  }
  return assertWorldDecimalResult(parsed);
}

function exactPositiveCount(value: string, label: string): WorldDecimalValue {
  const parsed = exactNonNegativeCount(value, label);
  if (parsed.isZero()) invalid(`${label} must be positive`);
  return parsed;
}

function renderCount(value: WorldDecimalValue, label: string): string {
  if (value.isNegative() || !value.isInteger()) {
    invalid(`${label} must remain a non-negative whole-person/count string`);
  }
  return canonicalDecimal(assertWorldDecimalResult(value));
}

function canonicalCountry(value: string, label: string): CountryId {
  try {
    return countryId(value);
  } catch {
    return invalid(`${label} must be a canonical country identifier`);
  }
}

function assertKeys(
  value: object,
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

function assertCohort(value: string, label: string): PopulationCohort {
  if (
    value !== 'CHILDREN_0_15' &&
    value !== 'WORKING_AGE_16_64' &&
    value !== 'RETIRED_65_PLUS'
  ) {
    invalid(`${label} is not a supported population cohort`);
  }
  return value;
}

function canonicalHandoff(
  value: MigrationLabourHandoff | null,
): MigrationLabourHandoff | null {
  if (value === null) return null;
  assertKeys(value, ['disposition', 'handoffId'], 'migrationLabourHandoff');
  if (value.disposition !== 'PENDING_V11_2_CLASSIFICATION') {
    invalid('migrationLabourHandoff disposition is invalid');
  }
  return Object.freeze({
    handoffId: canonicalFactId(value.handoffId, 'migrationLabourHandoff'),
    disposition: value.disposition,
  });
}

function canonicalFact(
  input: PopulationFact,
  boundary: E01DailyBoundary,
): PopulationFact {
  const base = {
    factId: canonicalFactId(input.factId, 'factId'),
    countryId: canonicalCountry(input.countryId, 'countryId'),
    dayIndex: canonicalDayIndex(input.dayIndex, 'fact dayIndex'),
  };
  if (base.dayIndex !== boundary.dayIndex) {
    invalid(
      'Population fact must be recorded on the supplied E01 daily boundary',
    );
  }
  switch (input.kind) {
    case 'BIRTH':
      assertKeys(
        input,
        ['countryId', 'count', 'dayIndex', 'factId', 'kind'],
        'birth fact',
      );
      return Object.freeze({
        kind: 'BIRTH' as const,
        ...base,
        count: renderCount(
          exactPositiveCount(input.count, 'birth count'),
          'birth count',
        ),
      });
    case 'DEATH':
      assertKeys(
        input,
        [
          'cause',
          'cohort',
          'countryId',
          'count',
          'dayIndex',
          'factId',
          'kind',
          'mortalityModifierVersion',
        ],
        'death fact',
      );
      if (
        input.cause !== 'BASELINE' &&
        input.cause !== 'HEALTH_CRISIS' &&
        input.cause !== 'CRISIS_CASUALTY'
      ) {
        invalid('death cause is invalid');
      }
      if (
        input.mortalityModifierVersion !== null &&
        typeof input.mortalityModifierVersion !== 'string'
      ) {
        invalid('mortalityModifierVersion must be null or an explicit version');
      }
      return Object.freeze({
        kind: 'DEATH' as const,
        ...base,
        cohort: assertCohort(input.cohort, 'death cohort'),
        count: renderCount(
          exactPositiveCount(input.count, 'death count'),
          'death count',
        ),
        cause: input.cause,
        mortalityModifierVersion:
          input.mortalityModifierVersion === null
            ? null
            : canonicalFactId(
                input.mortalityModifierVersion,
                'mortalityModifierVersion',
              ),
      });
    case 'MIGRATION_DEPARTURE':
      assertKeys(
        input,
        [
          'cohort',
          'counterpartyCountryId',
          'countryId',
          'count',
          'dayIndex',
          'factId',
          'kind',
          'migrationId',
        ],
        'migration departure fact',
      );
      return Object.freeze({
        kind: 'MIGRATION_DEPARTURE' as const,
        ...base,
        migrationId: canonicalFactId(input.migrationId, 'migrationId'),
        counterpartyCountryId: canonicalCountry(
          input.counterpartyCountryId,
          'counterpartyCountryId',
        ),
        cohort: assertCohort(input.cohort, 'migration cohort'),
        count: renderCount(
          exactPositiveCount(input.count, 'migration count'),
          'migration count',
        ),
      });
    case 'MIGRATION_ARRIVAL':
      assertKeys(
        input,
        [
          'cohort',
          'counterpartyCountryId',
          'countryId',
          'count',
          'dayIndex',
          'factId',
          'kind',
          'migrationId',
          'migrationLabourHandoff',
        ],
        'migration arrival fact',
      );
      return Object.freeze({
        kind: 'MIGRATION_ARRIVAL' as const,
        ...base,
        migrationId: canonicalFactId(input.migrationId, 'migrationId'),
        counterpartyCountryId: canonicalCountry(
          input.counterpartyCountryId,
          'counterpartyCountryId',
        ),
        cohort: assertCohort(input.cohort, 'migration cohort'),
        count: renderCount(
          exactPositiveCount(input.count, 'migration count'),
          'migration count',
        ),
        migrationLabourHandoff: canonicalHandoff(input.migrationLabourHandoff),
      });
    case 'AGE_COHORT_ROLL':
      assertKeys(
        input,
        [
          'countryId',
          'count',
          'dayIndex',
          'factId',
          'fromCohort',
          'kind',
          'toCohort',
        ],
        'age cohort roll fact',
      );
      if (!(
        (input.fromCohort === 'CHILDREN_0_15' &&
          input.toCohort === 'WORKING_AGE_16_64') ||
        (input.fromCohort === 'WORKING_AGE_16_64' &&
          input.toCohort === 'RETIRED_65_PLUS')
      )) {
        invalid('Age cohort roll must use one documented adjacent transition');
      }
      return Object.freeze({
        kind: 'AGE_COHORT_ROLL' as const,
        ...base,
        fromCohort: input.fromCohort,
        toCohort: input.toCohort,
        count: renderCount(
          exactPositiveCount(input.count, 'age cohort roll count'),
          'age cohort roll count',
        ),
      });
    case 'HOUSEHOLD_COUNT_UPDATE':
      assertKeys(
        input,
        [
          'countryId',
          'dayIndex',
          'factId',
          'householdCount',
          'kind',
          'populationTotalForReconciliation',
        ],
        'household update fact',
      );
      return Object.freeze({
        kind: 'HOUSEHOLD_COUNT_UPDATE' as const,
        ...base,
        householdCount: renderCount(
          exactNonNegativeCount(input.householdCount, 'householdCount'),
          'householdCount',
        ),
        populationTotalForReconciliation: renderCount(
          exactNonNegativeCount(
            input.populationTotalForReconciliation,
            'populationTotalForReconciliation',
          ),
          'populationTotalForReconciliation',
        ),
      });
    default:
      return invalid('Population fact type is unsupported');
  }
}

type CanonicalPopulationFact = ReturnType<typeof canonicalFact>;

function canonicalState(input: PopulationEngineState): PopulationEngineState {
  const countryIds = new Set<string>();
  const countries = input.countries.map((country) => {
    assertKeys(
      country,
      [
        'children0To15',
        'countryId',
        'householdCount',
        'retired65Plus',
        'total',
        'workingAge16To64',
      ],
      'population country state',
    );
    const canonicalCountryId = canonicalCountry(country.countryId, 'countryId');
    if (countryIds.has(canonicalCountryId)) {
      invalid(`Population state repeats country ${canonicalCountryId}`);
    }
    countryIds.add(canonicalCountryId);
    const children0To15 = renderCount(
      exactNonNegativeCount(country.children0To15, 'children0To15'),
      'children0To15',
    );
    const workingAge16To64 = renderCount(
      exactNonNegativeCount(country.workingAge16To64, 'workingAge16To64'),
      'workingAge16To64',
    );
    const retired65Plus = renderCount(
      exactNonNegativeCount(country.retired65Plus, 'retired65Plus'),
      'retired65Plus',
    );
    const total = renderCount(
      exactNonNegativeCount(country.total, 'total'),
      'total',
    );
    const cohortTotal = renderCount(
      parseWorldDecimal(children0To15)
        .plus(parseWorldDecimal(workingAge16To64))
        .plus(parseWorldDecimal(retired65Plus)),
      'cohort total',
    );
    if (total !== cohortTotal) {
      invalid('Population total must equal the three authoritative cohorts');
    }
    return Object.freeze({
      countryId: canonicalCountryId,
      total,
      children0To15,
      workingAge16To64,
      retired65Plus,
      householdCount: renderCount(
        exactNonNegativeCount(country.householdCount, 'householdCount'),
        'householdCount',
      ),
    });
  });
  const bindingIds = new Set<string>();
  const appliedFactBindings = input.appliedFactBindings.map((binding) => {
    assertKeys(
      binding,
      ['canonicalPayload', 'factId'],
      'population fact binding',
    );
    const factId = canonicalFactId(binding.factId, 'bound factId');
    if (bindingIds.has(factId))
      invalid(`Population state repeats fact ${factId}`);
    bindingIds.add(factId);
    if (typeof binding.canonicalPayload !== 'string') {
      invalid('Population fact binding payload must be canonical text');
    }
    try {
      const parsed: unknown = JSON.parse(binding.canonicalPayload);
      if (canonicalSerialize(parsed) !== binding.canonicalPayload) {
        invalid('Population fact binding payload must be canonical text');
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      invalid('Population fact binding payload must be canonical text');
    }
    return Object.freeze({
      factId,
      canonicalPayload: binding.canonicalPayload,
    });
  });
  countries.sort((left, right) =>
    compareCanonicalIdentifiers(left.countryId, right.countryId),
  );
  appliedFactBindings.sort((left, right) =>
    compareCanonicalIdentifiers(left.factId, right.factId),
  );
  return Object.freeze({
    countries: Object.freeze(countries),
    appliedFactBindings: Object.freeze(appliedFactBindings),
  });
}

function assertBoundary(boundary: E01DailyBoundary): E01DailyBoundary {
  if (
    typeof boundary !== 'object' ||
    boundary === null ||
    !populationBoundaryInstances.has(boundary) ||
    boundary.kind !== 'E01_DAILY_BOUNDARY'
  ) {
    invalid('Population transition requires an E01 daily boundary');
  }
  return boundary;
}

function canonicalScheduledMigration(
  input: ScheduledMigrationNotice,
): ScheduledMigrationNotice {
  assertKeys(
    input,
    [
      'cohort',
      'count',
      'destinationCountryId',
      'migrationId',
      'originCountryId',
      'scheduledDayIndex',
    ],
    'scheduled migration notice',
  );
  const originCountryId = canonicalCountry(
    input.originCountryId,
    'originCountryId',
  );
  const destinationCountryId = canonicalCountry(
    input.destinationCountryId,
    'destinationCountryId',
  );
  if (originCountryId === destinationCountryId) {
    invalid(
      'Scheduled migration must name distinct origin and destination countries',
    );
  }
  return Object.freeze({
    migrationId: canonicalFactId(input.migrationId, 'migrationId'),
    originCountryId,
    destinationCountryId,
    cohort: assertCohort(input.cohort, 'scheduled migration cohort'),
    count: renderCount(
      exactPositiveCount(input.count, 'scheduled migration count'),
      'scheduled migration count',
    ),
    scheduledDayIndex: canonicalDayIndex(
      input.scheduledDayIndex,
      'scheduled migration dayIndex',
    ),
  });
}

function assertMigrationPairs(facts: readonly CanonicalPopulationFact[]): void {
  const byMigrationId = new Map<string, CanonicalPopulationFact[]>();
  for (const fact of facts) {
    if (
      fact.kind !== 'MIGRATION_DEPARTURE' &&
      fact.kind !== 'MIGRATION_ARRIVAL'
    ) {
      continue;
    }
    const group = byMigrationId.get(fact.migrationId) ?? [];
    group.push(fact);
    byMigrationId.set(fact.migrationId, group);
  }
  for (const [migrationId, group] of byMigrationId) {
    if (group.length !== 2) {
      invalid(
        `Migration ${migrationId} must contain exactly one departure and one arrival`,
      );
    }
    const departure = group.find(
      (fact): fact is MigrationDeparturePopulationFact =>
        fact.kind === 'MIGRATION_DEPARTURE',
    );
    const arrival = group.find(
      (fact): fact is MigrationArrivalPopulationFact =>
        fact.kind === 'MIGRATION_ARRIVAL',
    );
    if (departure === undefined || arrival === undefined) {
      invalid(
        `Migration ${migrationId} must contain one departure and one arrival`,
      );
    }
    if (
      departure.countryId === departure.counterpartyCountryId ||
      departure.countryId !== arrival.counterpartyCountryId ||
      departure.counterpartyCountryId !== arrival.countryId ||
      departure.cohort !== arrival.cohort ||
      departure.count !== arrival.count ||
      departure.dayIndex !== arrival.dayIndex
    ) {
      invalid(`Migration ${migrationId} is not a matched bilateral transfer`);
    }
  }
}

function appliedMigrationIds(
  bindings: readonly PopulationAppliedFactBinding[],
): ReadonlySet<string> {
  const migrationIds = new Set<string>();
  for (const binding of bindings) {
    let payload: unknown;
    try {
      payload = JSON.parse(binding.canonicalPayload);
    } catch {
      invalid('Population fact binding payload must be canonical text');
    }
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      continue;
    }
    const candidate = payload as Record<string, unknown>;
    if (
      candidate.kind !== 'MIGRATION_DEPARTURE' &&
      candidate.kind !== 'MIGRATION_ARRIVAL'
    ) {
      continue;
    }
    if (typeof candidate.migrationId !== 'string') {
      invalid(
        'Bound migration fact must carry its immutable migration identity',
      );
    }
    migrationIds.add(
      canonicalFactId(candidate.migrationId, 'bound migrationId'),
    );
  }
  return migrationIds;
}

interface MutableCountryPopulation {
  readonly countryId: CountryId;
  children: WorldDecimalValue;
  workingAge: WorldDecimalValue;
  retired: WorldDecimalValue;
  households: WorldDecimalValue;
}

interface MutablePopulationFlows {
  births: WorldDecimalValue;
  deaths: WorldDecimalValue;
  immigration: WorldDecimalValue;
  emigration: WorldDecimalValue;
}

interface MutablePopulationDeltas {
  children: WorldDecimalValue;
  workingAge: WorldDecimalValue;
  retired: WorldDecimalValue;
  householdUpdate: HouseholdCountUpdatePopulationFact | null;
}

function zero(): WorldDecimalValue {
  return parseWorldDecimal('0');
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let dividend = left < 0n ? -left : left;
  let divisor = right < 0n ? -right : right;
  while (divisor !== 0n) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

function exactDependencyRatio(
  children: WorldDecimalValue,
  retired: WorldDecimalValue,
  workingAge: WorldDecimalValue,
): PopulationDependencyRatio | null {
  if (workingAge.isZero()) return null;
  const numerator = BigInt(
    renderCount(children.plus(retired), 'dependency numerator'),
  );
  const denominator = BigInt(renderCount(workingAge, 'dependency denominator'));
  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  });
}

function countryTotal(country: MutableCountryPopulation): WorldDecimalValue {
  return country.children.plus(country.workingAge).plus(country.retired);
}

function replaceCohort(
  country: MutableCountryPopulation,
  cohort: PopulationCohort,
  value: WorldDecimalValue,
): void {
  const canonical = assertWorldDecimalResult(value);
  if (canonical.isNegative() || !canonical.isInteger()) {
    invalid(
      `Population flow would create a negative or fractional ${cohort} cohort`,
    );
  }
  if (cohort === 'CHILDREN_0_15') country.children = canonical;
  else if (cohort === 'WORKING_AGE_16_64') country.workingAge = canonical;
  else country.retired = canonical;
}

function actionEvidence(
  fact: CanonicalPopulationFact,
): PopulationActionEvidence {
  const migrationId =
    fact.kind === 'MIGRATION_DEPARTURE' || fact.kind === 'MIGRATION_ARRIVAL'
      ? fact.migrationId
      : null;
  const count =
    fact.kind === 'HOUSEHOLD_COUNT_UPDATE'
      ? null
      : fact.kind === 'BIRTH' ||
          fact.kind === 'DEATH' ||
          fact.kind === 'MIGRATION_DEPARTURE' ||
          fact.kind === 'MIGRATION_ARRIVAL' ||
          fact.kind === 'AGE_COHORT_ROLL'
        ? fact.count
        : null;
  return Object.freeze({
    factId: fact.factId,
    kind: fact.kind,
    countryId: canonicalCountry(fact.countryId, 'fact countryId'),
    dayIndex: fact.dayIndex,
    canonicalPayload: canonicalSerialize(fact),
    migrationId,
    count,
  });
}

/** Creates an opaque, immutable E01 boundary token for one pure transition call. */
export function createE01DailyBoundary(dayIndex: string): E01DailyBoundary {
  const boundary = Object.freeze({
    kind: 'E01_DAILY_BOUNDARY' as const,
    dayIndex: canonicalDayIndex(dayIndex, 'E01 daily boundary'),
  });
  populationBoundaryInstances.add(boundary);
  return boundary;
}

/**
 * Applies only explicit E02 facts at one supplied E01 boundary. It is pure:
 * the caller owns authorization, commands/events, idempotency persistence and
 * atomic World State settlement.
 */
export function applyPopulationFacts(
  input: ApplyPopulationFactsInput,
): ApplyPopulationFactsResult {
  const boundary = assertBoundary(input.boundary);
  const prior = canonicalState(input.state);
  const priorBindings = new Map(
    prior.appliedFactBindings.map((binding) => [
      binding.factId,
      binding.canonicalPayload,
    ]),
  );
  const incomingIds = new Set<string>();
  const activeFacts: CanonicalPopulationFact[] = [];
  const idempotentFactIds: string[] = [];
  for (const rawFact of input.facts) {
    const fact = canonicalFact(rawFact, boundary);
    if (incomingIds.has(fact.factId)) {
      invalid(`Population input repeats immutable fact ${fact.factId}`);
    }
    incomingIds.add(fact.factId);
    const payload = canonicalSerialize(fact);
    const priorPayload = priorBindings.get(fact.factId);
    if (priorPayload === undefined) {
      activeFacts.push(fact);
    } else if (priorPayload === payload) {
      idempotentFactIds.push(fact.factId);
    } else {
      invalid(
        `Population fact ${fact.factId} conflicts with a prior canonical payload`,
      );
    }
  }
  activeFacts.sort((left, right) =>
    compareCanonicalIdentifiers(left.factId, right.factId),
  );
  idempotentFactIds.sort(compareCanonicalIdentifiers);
  assertMigrationPairs(activeFacts);
  const priorMigrationIds = appliedMigrationIds(prior.appliedFactBindings);
  for (const fact of activeFacts) {
    if (
      (fact.kind === 'MIGRATION_DEPARTURE' ||
        fact.kind === 'MIGRATION_ARRIVAL') &&
      priorMigrationIds.has(fact.migrationId)
    ) {
      invalid(`Migration ${fact.migrationId} was already applied`);
    }
  }

  const countries = new Map<CountryId, MutableCountryPopulation>();
  const flows = new Map<CountryId, MutablePopulationFlows>();
  const deltas = new Map<CountryId, MutablePopulationDeltas>();
  const previousTotals = new Map<CountryId, WorldDecimalValue>();
  for (const country of prior.countries) {
    const canonicalCountryId = canonicalCountry(country.countryId, 'countryId');
    const state = {
      countryId: canonicalCountryId,
      children: exactNonNegativeCount(country.children0To15, 'children0To15'),
      workingAge: exactNonNegativeCount(
        country.workingAge16To64,
        'workingAge16To64',
      ),
      retired: exactNonNegativeCount(country.retired65Plus, 'retired65Plus'),
      households: exactNonNegativeCount(
        country.householdCount,
        'householdCount',
      ),
    };
    countries.set(canonicalCountryId, state);
    flows.set(canonicalCountryId, {
      births: zero(),
      deaths: zero(),
      immigration: zero(),
      emigration: zero(),
    });
    deltas.set(canonicalCountryId, {
      children: zero(),
      workingAge: zero(),
      retired: zero(),
      householdUpdate: null,
    });
    previousTotals.set(canonicalCountryId, countryTotal(state));
  }

  const countryFor = (value: string): MutableCountryPopulation => {
    const canonicalCountryId = canonicalCountry(value, 'fact countryId');
    const found = countries.get(canonicalCountryId);
    if (found === undefined)
      invalid(`Population state does not contain ${canonicalCountryId}`);
    return found;
  };
  const flowsFor = (value: string): MutablePopulationFlows => {
    const canonicalCountryId = canonicalCountry(value, 'fact countryId');
    const found = flows.get(canonicalCountryId);
    if (found === undefined)
      invalid(`Population state does not contain ${canonicalCountryId}`);
    return found;
  };
  const deltasFor = (value: string): MutablePopulationDeltas => {
    const canonicalCountryId = canonicalCountry(value, 'fact countryId');
    const found = deltas.get(canonicalCountryId);
    if (found === undefined)
      invalid(`Population state does not contain ${canonicalCountryId}`);
    return found;
  };
  const addCohortDelta = (
    delta: MutablePopulationDeltas,
    cohort: PopulationCohort,
    amount: WorldDecimalValue,
  ): void => {
    if (cohort === 'CHILDREN_0_15')
      delta.children = delta.children.plus(amount);
    else if (cohort === 'WORKING_AGE_16_64') {
      delta.workingAge = delta.workingAge.plus(amount);
    } else delta.retired = delta.retired.plus(amount);
  };

  for (const fact of activeFacts) {
    countryFor(fact.countryId);
    const totals = flowsFor(fact.countryId);
    const delta = deltasFor(fact.countryId);
    if (fact.kind === 'BIRTH') {
      const count = exactPositiveCount(fact.count, 'birth count');
      addCohortDelta(delta, 'CHILDREN_0_15', count);
      totals.births = totals.births.plus(count);
    } else if (fact.kind === 'DEATH') {
      const count = exactPositiveCount(fact.count, 'death count');
      addCohortDelta(delta, fact.cohort, count.negated());
      totals.deaths = totals.deaths.plus(count);
    } else if (fact.kind === 'MIGRATION_DEPARTURE') {
      const count = exactPositiveCount(fact.count, 'migration count');
      addCohortDelta(delta, fact.cohort, count.negated());
      totals.emigration = totals.emigration.plus(count);
    } else if (fact.kind === 'MIGRATION_ARRIVAL') {
      const count = exactPositiveCount(fact.count, 'migration count');
      addCohortDelta(delta, fact.cohort, count);
      totals.immigration = totals.immigration.plus(count);
    } else if (fact.kind === 'AGE_COHORT_ROLL') {
      const count = exactPositiveCount(fact.count, 'age cohort roll count');
      addCohortDelta(delta, fact.fromCohort, count.negated());
      addCohortDelta(delta, fact.toCohort, count);
    } else if (fact.kind === 'HOUSEHOLD_COUNT_UPDATE') {
      if (delta.householdUpdate !== null) {
        invalid(
          'Population accepts at most one household count update per country and E01 boundary',
        );
      }
      delta.householdUpdate = fact;
    }
  }

  for (const country of countries.values()) {
    const delta = deltas.get(country.countryId);
    if (delta === undefined) {
      invalid('Population state transition has no country delta');
    }
    replaceCohort(
      country,
      'CHILDREN_0_15',
      country.children.plus(delta.children),
    );
    replaceCohort(
      country,
      'WORKING_AGE_16_64',
      country.workingAge.plus(delta.workingAge),
    );
    replaceCohort(
      country,
      'RETIRED_65_PLUS',
      country.retired.plus(delta.retired),
    );
    if (delta.householdUpdate !== null) {
      country.households = exactNonNegativeCount(
        delta.householdUpdate.householdCount,
        'householdCount',
      );
    }
  }

  const countryTransitions = [...countries.values()]
    .sort((left, right) =>
      compareCanonicalIdentifiers(left.countryId, right.countryId),
    )
    .map((country) => {
      const priorTotal = previousTotals.get(country.countryId);
      const totals = flows.get(country.countryId);
      if (priorTotal === undefined || totals === undefined) {
        return invalid('Population state transition cannot be reconciled');
      }
      const nextTotal = countryTotal(country);
      const expected = priorTotal
        .plus(totals.births)
        .minus(totals.deaths)
        .plus(totals.immigration)
        .minus(totals.emigration);
      if (!nextTotal.equals(expected)) {
        invalid(
          `Population identity does not reconcile for ${country.countryId}`,
        );
      }
      const dependencyRatio = exactDependencyRatio(
        country.children,
        country.retired,
        country.workingAge,
      );
      return Object.freeze({
        countryId: country.countryId,
        previousTotal: renderCount(priorTotal, 'previousTotal'),
        births: renderCount(totals.births, 'births'),
        deaths: renderCount(totals.deaths, 'deaths'),
        immigration: renderCount(totals.immigration, 'immigration'),
        emigration: renderCount(totals.emigration, 'emigration'),
        nextTotal: renderCount(nextTotal, 'nextTotal'),
        dependencyRatio,
      });
    });

  const reconciliationWarnings = activeFacts
    .filter(
      (fact): fact is HouseholdCountUpdatePopulationFact =>
        fact.kind === 'HOUSEHOLD_COUNT_UPDATE',
    )
    .map((fact) => {
      const country = countryFor(fact.countryId);
      const actualPopulationTotal = renderCount(
        countryTotal(country),
        'actualPopulationTotal',
      );
      if (fact.populationTotalForReconciliation === actualPopulationTotal) {
        return null;
      }
      return Object.freeze({
        factId: fact.factId,
        countryId: country.countryId,
        householdCount: renderCount(country.households, 'householdCount'),
        suppliedPopulationTotal: fact.populationTotalForReconciliation,
        actualPopulationTotal,
        code: 'HOUSEHOLD_RECONCILIATION_MISMATCH' as const,
      });
    })
    .filter(
      (warning): warning is PopulationReconciliationWarning => warning !== null,
    )
    .sort((left, right) =>
      compareCanonicalIdentifiers(left.factId, right.factId),
    );

  const newlyAppliedFacts = activeFacts.map(actionEvidence);
  const state: PopulationEngineState = Object.freeze({
    countries: Object.freeze(
      [...countries.values()]
        .sort((left, right) =>
          compareCanonicalIdentifiers(left.countryId, right.countryId),
        )
        .map((country) =>
          Object.freeze({
            countryId: country.countryId,
            total: renderCount(countryTotal(country), 'total'),
            children0To15: renderCount(country.children, 'children0To15'),
            workingAge16To64: renderCount(
              country.workingAge,
              'workingAge16To64',
            ),
            retired65Plus: renderCount(country.retired, 'retired65Plus'),
            householdCount: renderCount(country.households, 'householdCount'),
          }),
        ),
    ),
    appliedFactBindings: Object.freeze(
      [
        ...prior.appliedFactBindings,
        ...activeFacts.map((fact) =>
          Object.freeze({
            factId: fact.factId,
            canonicalPayload: canonicalSerialize(fact),
          }),
        ),
      ].sort((left, right) =>
        compareCanonicalIdentifiers(left.factId, right.factId),
      ),
    ),
  });
  const scheduledMigrationIds = (input.scheduledMigrationNotices ?? [])
    .map(canonicalScheduledMigration)
    .map((notice) => notice.migrationId)
    .sort(compareCanonicalIdentifiers);
  if (new Set(scheduledMigrationIds).size !== scheduledMigrationIds.length) {
    invalid(
      'Scheduled migration notices repeat an immutable migration identity',
    );
  }
  return Object.freeze({
    state,
    countryTransitions: Object.freeze(countryTransitions),
    newlyAppliedFacts: Object.freeze(newlyAppliedFacts),
    idempotentFactIds: Object.freeze(idempotentFactIds),
    scheduledMigrationIds: Object.freeze(scheduledMigrationIds),
    reconciliationWarnings: Object.freeze(reconciliationWarnings),
  });
}
