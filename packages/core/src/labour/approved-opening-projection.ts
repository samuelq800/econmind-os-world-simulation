import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { countryId, idempotencyKey, legalEntityId } from '../ids.js';
import { Money } from '../numeric/money.js';
import { compareCanonicalIdentifiers } from '../time/deterministic-order.js';
import {
  renderQuantity,
  wholeQuantity,
  type ExactQuantity,
} from '../engine-kernels/common.js';
import {
  applyLabourFacts,
  type LabourAggregate,
  type LabourEngineState,
  type LabourPopulationAvailability,
  type LabourPosition,
  type LabourSkill,
} from './labour-engine.js';

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS, message);
}
function count(value: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('Opening people require exact non-negative integer strings');
  return BigInt(value);
}

export interface OpeningPeopleDemand {
  readonly id: string;
  readonly weight: string;
  readonly capacity: string;
}

/** Capped Hamilton allocation. Integer people only; never a money rounding rule. */
export function allocateOpeningPeopleLargestRemainder(input: {
  readonly total: string;
  readonly demands: readonly OpeningPeopleDemand[];
}): Readonly<{
  assignments: readonly Readonly<{ id: string; count: string }>[];
  unmatched: string;
}> {
  const total = count(input.total);
  const seen = new Set<string>();
  const rows = input.demands
    .map((d) => {
      const id = idempotencyKey(d.id);
      if (seen.has(id)) invalid('Duplicate opening demand ID');
      seen.add(id);
      return {
        id,
        weight: count(d.weight),
        capacity: count(d.capacity),
        assigned: 0n,
      };
    })
    .sort((a, b) => compareCanonicalIdentifiers(a.id, b.id));
  let remaining = total;
  let active = rows.filter((r) => r.capacity > 0n && r.weight > 0n);
  while (remaining > 0n && active.length > 0) {
    const weights = active.reduce((s, r) => s + r.weight, 0n);
    const saturated = active.filter(
      (r) => remaining * r.weight >= r.capacity * weights,
    );
    if (saturated.length > 0) {
      for (const r of saturated) {
        r.assigned = r.capacity;
        remaining -= r.capacity;
      }
      const ids = new Set(saturated.map((r) => r.id));
      active = active.filter((r) => !ids.has(r.id));
      continue;
    }
    const remainderOrder = active
      .map((r) => {
        const numerator = remaining * r.weight;
        r.assigned = numerator / weights;
        return { row: r, remainder: numerator % weights };
      })
      .sort((a, b) =>
        a.remainder === b.remainder
          ? compareCanonicalIdentifiers(a.row.id, b.row.id)
          : a.remainder > b.remainder
            ? -1
            : 1,
      );
    let extras = remaining - active.reduce((s, r) => s + r.assigned, 0n);
    for (const { row } of remainderOrder) {
      if (extras === 0n) break;
      row.assigned += 1n;
      extras -= 1n;
    }
    remaining = extras;
    break;
  }
  const assignments = rows.map((r) =>
    Object.freeze({ id: r.id, count: r.assigned.toString() }),
  );
  if (
    rows.reduce((s, r) => s + r.assigned, 0n) + remaining !== total ||
    rows.some((r) => r.assigned > r.capacity)
  )
    invalid('Opening allocation failed exact conservation/capacity');
  return Object.freeze({
    assignments: Object.freeze(assignments),
    unmatched: remaining.toString(),
  });
}

export interface OpeningLabourTarget {
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly count: string;
}

export interface OpeningLabourPositionDemand extends Omit<
  LabourPosition,
  'employedCount'
> {
  readonly sourceWeight: string;
  readonly employerId: string;
  readonly employerRole: 'OP' | 'GOV';
  readonly wageAmount: string;
  readonly wageCurrency: string;
  readonly wagePeriod: 'SIM_HOUR' | 'SIM_YEAR';
  readonly wageVersion: string;
  readonly payrollFundingRef: string;
  readonly occupation:
    | 'GENERAL'
    | 'TEACHER'
    | 'DOCTOR'
    | 'NURSE'
    | 'MEDICAL_TECHNICIAN'
    | 'SUPPORT';
}

export interface OpeningLabourMaterialization {
  readonly state: LabourEngineState;
  readonly employerBindings: readonly {
    readonly positionId: string;
    readonly employerId: string;
    readonly employerRole: 'OP' | 'GOV';
    readonly occupation: OpeningLabourPositionDemand['occupation'];
    readonly wageAmount: Readonly<{ amount: string; currency: string }>;
    readonly wagePeriod: 'SIM_HOUR' | 'SIM_YEAR';
    readonly wageVersion: string;
    readonly payrollFundingRef: string;
  }[];
  readonly generatedHiringEvents: false;
  readonly wagesPaid: false;
  readonly unmatched: '0';
}

/**
 * Complete genesis facts only. Validates the existing E03 state with no hiring,
 * wage payment or historical events. No incomplete aggregate becomes employed.
 * Source/adoption/authority validation belongs to the server-owned producer.
 */
export function materializeOpeningLabourState(input: {
  readonly targets: readonly OpeningLabourTarget[];
  readonly positions: readonly OpeningLabourPositionDemand[];
  readonly populationAvailability: readonly LabourPopulationAvailability[];
  readonly nonEmployedAggregates: readonly LabourAggregate[];
  /** Exact participating skill pools; missing population is never inferred. */
  readonly skillAvailability: readonly OpeningLabourTarget[];
  readonly employers: readonly {
    readonly countryId: string;
    readonly role: 'OP' | 'GOV';
    readonly employerId: string;
  }[];
}): OpeningLabourMaterialization {
  const key = (r: OpeningLabourTarget) =>
    [countryId(r.countryId), idempotencyKey(r.locationId), r.skill].join(
      '\u0001',
    );
  const targetKeys = new Set<string>();
  const positions: LabourPosition[] = [];
  const aggregates: LabourAggregate[] = [...input.nonEmployedAggregates];
  if (aggregates.some((a) => a.status === 'EMPLOYED'))
    invalid('Employment must come from explicit opening targets');
  const employers = new Map<string, string>();
  for (const employer of input.employers) {
    const employerKey = `${countryId(employer.countryId)}/${employer.role}`;
    if (!['OP', 'GOV'].includes(employer.role) || employers.has(employerKey))
      invalid('Invalid or duplicate opening employer binding');
    employers.set(employerKey, legalEntityId(employer.employerId));
  }
  const employerBindings = input.positions.map((p) => {
    if (
      !['OP', 'GOV'].includes(p.employerRole) ||
      (p.owner === 'PUBLIC_SERVICE') !== (p.employerRole === 'GOV') ||
      employers.get(`${p.countryId}/${p.employerRole}`) !== p.employerId
    )
      invalid('Public employment requires GOV; private employment requires OP');
    const allowed: Record<
      OpeningLabourPositionDemand['occupation'],
      readonly LabourSkill[]
    > = {
      GENERAL: ['LOW', 'MEDIUM', 'HIGH'],
      TEACHER: ['HIGH'],
      DOCTOR: ['HIGH'],
      NURSE: ['MEDIUM', 'HIGH'],
      MEDICAL_TECHNICIAN: ['MEDIUM'],
      SUPPORT: ['LOW', 'MEDIUM'],
    };
    if (
      !allowed[p.occupation]?.includes(p.skill) ||
      (p.owner === 'PUBLIC_SERVICE' &&
        ['EDUCATION', 'HEALTHCARE'].includes(p.classificationId) &&
        p.occupation === 'GENERAL') ||
      (p.occupation === 'TEACHER' &&
        (p.owner !== 'PUBLIC_SERVICE' || p.classificationId !== 'EDUCATION')) ||
      (['DOCTOR', 'NURSE', 'MEDICAL_TECHNICIAN'].includes(p.occupation) &&
        (p.owner !== 'PUBLIC_SERVICE' || p.classificationId !== 'HEALTHCARE'))
    )
      invalid('Opening occupation is not skill/service compatible');
    const wage = Money.from(p.wageAmount, p.wageCurrency);
    if (
      wage.amount.isNegative() ||
      wage.amount.isZero() ||
      !['SIM_HOUR', 'SIM_YEAR'].includes(p.wagePeriod)
    )
      invalid('An explicit positive wage and wage period are required');
    return Object.freeze({
      positionId: idempotencyKey(p.positionId),
      employerId: legalEntityId(p.employerId),
      employerRole: p.employerRole,
      occupation: p.occupation,
      wageAmount: Object.freeze(wage.toCanonicalValue()),
      wagePeriod: p.wagePeriod,
      wageVersion: idempotencyKey(p.wageVersion),
      payrollFundingRef: idempotencyKey(p.payrollFundingRef),
    });
  });
  const positionIds = new Set<string>();
  for (const target of input.targets) {
    const group = key(target);
    if (targetKeys.has(group))
      invalid('Duplicate country/region/skill opening target');
    targetKeys.add(group);
    const demands = input.positions.filter(
      (p) => key({ ...p, count: '0' }) === group,
    );
    const allocated = allocateOpeningPeopleLargestRemainder({
      total: target.count,
      demands: demands.map((p) => ({
        id: p.positionId,
        weight: p.sourceWeight,
        capacity: p.requiredCount,
      })),
    });
    if (allocated.unmatched !== '0')
      invalid(
        'Unmatched opening people must remain unresolved, not disappear or become unemployed',
      );
    for (const p of demands) {
      if (positionIds.has(p.positionId)) invalid('Duplicate opening position');
      positionIds.add(p.positionId);
      positions.push({
        positionId: p.positionId,
        countryId: p.countryId,
        locationId: p.locationId,
        skill: p.skill,
        owner: p.owner,
        classificationId: p.classificationId,
        requiredCount: p.requiredCount,
        employedCount: allocated.assignments.find((a) => a.id === p.positionId)!
          .count,
      });
    }
    aggregates.push({
      countryId: target.countryId,
      locationId: target.locationId,
      skill: target.skill,
      count: target.count,
      status: 'EMPLOYED',
    });
  }
  if (positionIds.size !== input.positions.length)
    invalid('Every demand needs an explicit country/region/skill target');
  const skillPools = new Map<string, bigint>();
  for (const pool of input.skillAvailability) {
    const poolKey = key(pool);
    if (
      !['LOW', 'MEDIUM', 'HIGH'].includes(pool.skill) ||
      skillPools.has(poolKey)
    )
      invalid('Invalid or duplicate opening skill pool');
    skillPools.set(poolKey, count(pool.count));
  }
  const occupied = new Map<string, bigint>();
  for (const aggregate of aggregates) {
    const poolKey = key(aggregate);
    if (!skillPools.has(poolKey))
      invalid('Opening aggregate has no explicit skill pool');
    occupied.set(
      poolKey,
      (occupied.get(poolKey) ?? 0n) + count(aggregate.count),
    );
  }
  for (const [poolKey, available] of skillPools) {
    if ((occupied.get(poolKey) ?? 0n) !== available)
      invalid('Opening skill pool must be exactly conserved across statuses');
  }
  const state: LabourEngineState = {
    aggregates,
    positions,
    wageAssertions: input.positions.map((p) => ({
      positionId: p.positionId,
      wageVersion: p.wageVersion,
      wageAmount: p.wageAmount,
    })),
    appliedFactBindings: [],
  };
  const checked = applyLabourFacts({
    boundary: { kind: 'E01_DAILY_BOUNDARY', dayIndex: '0' },
    populationAvailability: input.populationAvailability,
    state,
    facts: [],
  });
  return Object.freeze({
    state: checked.state,
    employerBindings: Object.freeze(
      employerBindings.sort((a, b) =>
        compareCanonicalIdentifiers(a.positionId, b.positionId),
      ),
    ),
    generatedHiringEvents: false,
    wagesPaid: false,
    unmatched: '0' as const,
  });
}

export interface OpeningSocialCapacityInput {
  readonly assetId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly kind: 'EDUCATION' | 'HEALTHCARE' | 'HOUSING';
  readonly capacity: ExactQuantity;
}

export interface OpeningSocialCapacity extends OpeningSocialCapacityInput {
  readonly actualEnrollment: null;
  readonly actualEmployedStaff: null;
  readonly occupiedBeds: null;
  readonly deliveredCare: null;
  readonly occupiedHousingUnits: null;
  readonly welfarePaid: null;
  readonly generatedServiceEvents: false;
}

/** A genesis physical-capacity carrier, not enrollment, treatment or occupancy. */
export function createOpeningSocialCapacity(
  input: OpeningSocialCapacityInput,
): OpeningSocialCapacity {
  const units = {
    EDUCATION: 'person',
    HEALTHCARE: 'bed',
    HOUSING: 'housing_unit',
  } as const;
  const unit = units[input.kind];
  if (unit === undefined) invalid('Unsupported social capacity kind');
  const capacity = wholeQuantity(
    input.capacity,
    unit,
    'opening social physical capacity',
  ).amount;
  return Object.freeze({
    assetId: idempotencyKey(input.assetId),
    countryId: countryId(input.countryId),
    locationId: idempotencyKey(input.locationId),
    kind: input.kind,
    capacity: renderQuantity(capacity, unit),
    actualEnrollment: null,
    actualEmployedStaff: null,
    occupiedBeds: null,
    deliveredCare: null,
    occupiedHousingUnits: null,
    welfarePaid: null,
    generatedServiceEvents: false as const,
  });
}
