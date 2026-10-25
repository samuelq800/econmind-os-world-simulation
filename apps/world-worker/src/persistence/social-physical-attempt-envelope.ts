import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  countryId,
  idempotencyKey,
  parseCanonicalCommand,
  parseSocialEmploymentServiceCommand,
  prepareSocialEmploymentServiceOperation,
  validateSocialEmploymentServiceState,
  worldId,
  type CanonicalCommand,
  type LabourSkill,
  type Sha256Hex,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
} from '@econmind/core';

const SKILLS = ['LOW', 'MEDIUM', 'HIGH'] as const;
type Row = Record<string, unknown>;
type Counts = Record<LabourSkill, bigint>;

export interface SocialPhysicalAttemptEnvelope {
  readonly schemaVersion: 'social-physical-attempt-envelope-v1';
  readonly worldId: string;
  readonly headWorldVersion: string;
  readonly headEventSequence: string;
  readonly ruleRevision: string;
  /** Original immutable day-body revision, NOT current eligibility revision. */
  readonly sourceRevision: string;
  readonly validFromDayIndex: string;
  readonly validUntilDayIndex: string;
  readonly dayIndex: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly pools: readonly Readonly<{ poolId: string; skill: LabourSkill }>[];
  readonly stages: readonly Readonly<{
    resourceKey: string;
    availableMinutes: string;
    minutesPerOpportunity: Readonly<Record<LabourSkill, string>>;
  }>[];
}

export interface SocialPhysicalAttemptAssessment {
  readonly schemaVersion: 'social-physical-attempt-assessment-v1';
  readonly status: 'DERIVED_FEASIBILITY_ONLY_NOT_SOURCE_AUTHORITY';
  readonly checkedFor: Readonly<{
    worldId: string;
    headWorldVersion: string;
    headEventSequence: string;
    ruleRevision: string;
    sourceRevision: string;
    dayIndex: string;
    countryId: string;
    locationId: string;
  }>;
  readonly immutableBodyHash: string;
  readonly operationKind: 'PLAN' | 'MATCH';
  readonly operationSource: 'APPLIED' | 'EXACT_DUPLICATE';
  readonly lanes: readonly Readonly<{
    skill: LabourSkill;
    poolId: string;
    capacity: string;
    chargedBefore: string;
    chargedAfter: string;
    remaining: string;
  }>[];
  readonly stages: readonly Readonly<{
    resourceKey: string;
    availableMinutes: string;
    chargedBefore: string;
    chargedAfter: string;
    remaining: string;
  }>[];
  readonly sourceAdmitted: false;
  readonly runtimeReady: false;
}

function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Social physical envelope: ${reason}`,
  );
}
function record(value: unknown, expected: readonly string[]): Row {
  if (
    value === null ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('CLOSED_RECORD_REQUIRED');
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length ||
    keys.some((k) => typeof k !== 'string' || !expected.includes(k))
  )
    invalid('CLOSED_RECORD_REQUIRED');
  const copy: Row = {};
  for (const key of expected) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !Object.hasOwn(property, 'value'))
      invalid('DATA_FIELDS_ONLY');
    copy[key] = property.value;
  }
  return copy;
}
function list(value: unknown, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    invalid('COLLECTION_BOUND');
  if (Reflect.ownKeys(value).length !== value.length + 1)
    invalid('DENSE_DATA_ARRAY_REQUIRED');
  const copy: unknown[] = [];
  for (let n = 0; n < value.length; n++) {
    const property = Object.getOwnPropertyDescriptor(value, String(n));
    if (!property || !Object.hasOwn(property, 'value'))
      invalid('DENSE_DATA_ARRAY_REQUIRED');
    copy.push(property.value);
  }
  return copy;
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$/u.test(value)
  )
    invalid('EXPLICIT_BOUNDED_IDENTITY');
  return value;
}
function integer(value: unknown, positive = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 120 ||
    !(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(value)
  )
    invalid('CANONICAL_BOUNDED_INTEGER');
  return value;
}
function skill(value: unknown): LabourSkill {
  if (!SKILLS.includes(value as LabourSkill)) invalid('UNKNOWN_SKILL');
  return value as LabourSkill;
}
function freeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function parseEnvelope(
  value: unknown,
): Readonly<SocialPhysicalAttemptEnvelope> {
  const r = record(value, [
    'schemaVersion',
    'worldId',
    'headWorldVersion',
    'headEventSequence',
    'ruleRevision',
    'sourceRevision',
    'validFromDayIndex',
    'validUntilDayIndex',
    'dayIndex',
    'countryId',
    'locationId',
    'pools',
    'stages',
  ]);
  if (r.schemaVersion !== 'social-physical-attempt-envelope-v1')
    invalid('UNSUPPORTED_SCHEMA');
  const pools = list(r.pools, 3, 3).map((v) => {
    const p = record(v, ['poolId', 'skill']);
    return { poolId: idempotencyKey(text(p.poolId)), skill: skill(p.skill) };
  });
  if (
    new Set(pools.map((p) => p.poolId)).size !== 3 ||
    new Set(pools.map((p) => p.skill)).size !== 3
  )
    invalid('THREE_DISTINCT_LANES_REQUIRED');
  const stages = list(r.stages, 1, 64).map((v) => {
    const s = record(v, [
      'resourceKey',
      'availableMinutes',
      'minutesPerOpportunity',
    ]);
    const cost = record(s.minutesPerOpportunity, SKILLS);
    return {
      resourceKey: text(s.resourceKey),
      availableMinutes: integer(s.availableMinutes),
      minutesPerOpportunity: {
        LOW: integer(cost.LOW, true),
        MEDIUM: integer(cost.MEDIUM, true),
        HIGH: integer(cost.HIGH, true),
      },
    };
  });
  if (new Set(stages.map((s) => s.resourceKey)).size !== stages.length)
    invalid('DUPLICATE_RESOURCE');
  const envelope: SocialPhysicalAttemptEnvelope = {
    schemaVersion: r.schemaVersion,
    worldId: worldId(text(r.worldId)),
    headWorldVersion: integer(r.headWorldVersion),
    headEventSequence: integer(r.headEventSequence),
    ruleRevision: text(r.ruleRevision),
    sourceRevision: text(r.sourceRevision),
    validFromDayIndex: integer(r.validFromDayIndex),
    validUntilDayIndex: integer(r.validUntilDayIndex),
    dayIndex: integer(r.dayIndex),
    countryId: countryId(text(r.countryId)),
    locationId: idempotencyKey(text(r.locationId)),
    pools,
    stages,
  };
  if (
    BigInt(envelope.validFromDayIndex) >= BigInt(envelope.validUntilDayIndex) ||
    BigInt(envelope.dayIndex) < BigInt(envelope.validFromDayIndex) ||
    BigInt(envelope.dayIndex) >= BigInt(envelope.validUntilDayIndex)
  )
    invalid('DAY_OUTSIDE_HALF_OPEN_VALIDITY');
  if (new TextEncoder().encode(canonicalSerialize(envelope)).length > 262144)
    invalid('ENVELOPE_BYTE_BOUND');
  return freeze(envelope);
}

function counts(
  state: SocialEmploymentServiceState,
  envelope: SocialPhysicalAttemptEnvelope,
  digest: Sha256Hex,
): Counts {
  const result: Counts = { LOW: 0n, MEDIUM: 0n, HIGH: 0n };
  const matched: Counts = { LOW: 0n, MEDIUM: 0n, HIGH: 0n };
  for (const plan of state.plans) {
    integer(plan.reservedSlots, true);
    const command = parseCanonicalCommand(
      JSON.parse(plan.canonicalCommand),
      digest,
    );
    const parsed = parseSocialEmploymentServiceCommand(command, digest);
    if (parsed.kind !== 'PLAN') invalid('HISTORY_IS_NOT_PLAN');
    const intent = parsed.intent;
    const pool = state.servicePools.find(
      (p) => p.poolId === intent.servicePoolId,
    );
    if (
      !pool ||
      pool.countryId !== command.countryId ||
      pool.locationId !== intent.locationId ||
      pool.skill !== intent.skill ||
      pool.dayIndex !== intent.dueDayIndex
    )
      invalid('ORPHAN_OR_MIXED_PLAN_SCOPE');
    if (
      pool.countryId !== envelope.countryId ||
      pool.locationId !== envelope.locationId ||
      pool.dayIndex !== envelope.dayIndex
    )
      continue;
    const lane = envelope.pools.find((p) => p.poolId === pool.poolId);
    if (!lane || lane.skill !== pool.skill) invalid('UNBOUND_HISTORICAL_LANE');
    result[lane.skill] += BigInt(plan.reservedSlots);
    if (plan.state === 'SETTLED')
      matched[lane.skill] += BigInt(integer(plan.matched));
  }
  for (const lane of envelope.pools) {
    const pool = state.servicePools.find((p) => p.poolId === lane.poolId)!;
    if (BigInt(pool.usedSlots) !== matched[lane.skill])
      invalid('UNEXPLAINED_INITIAL_USE_OR_INCOMPLETE_HISTORY');
  }
  return result;
}

/**
 * Pure diagnostic only. G must authenticate the immutable original body and its
 * complete aliases, held event head and current source/commit protection. A
 * caller-supplied body/hash cannot establish any of those facts. See contract.
 */
export function assertSocialPhysicalAttemptEnvelope(input: {
  readonly command: CanonicalCommand;
  readonly state: SocialEmploymentServiceState;
  readonly readFacts: SocialEmploymentReadFacts;
  readonly sourceEnvelope: unknown;
  readonly sha256Hex: Sha256Hex;
}): Readonly<SocialPhysicalAttemptAssessment> {
  const envelope = parseEnvelope(input.sourceEnvelope);
  // Enforce the complete-history limit before Core's potentially costly replay.
  const property = Object.getOwnPropertyDescriptor(input.state, 'plans');
  if (!property || !Object.hasOwn(property, 'value'))
    invalid('DATA_FIELDS_ONLY');
  list(property.value, 0, 10000);
  const before = validateSocialEmploymentServiceState(
    input.state,
    input.readFacts,
    input.sha256Hex,
  );
  const parsed = parseSocialEmploymentServiceCommand(
    input.command,
    input.sha256Hex,
  );
  if (
    envelope.worldId !== before.worldId ||
    envelope.worldId !== input.command.worldId ||
    envelope.countryId !== input.command.countryId
  )
    invalid('MIXED_WORLD_OR_COUNTRY');
  const scopedPools = before.servicePools.filter(
    (p) =>
      p.countryId === envelope.countryId &&
      p.locationId === envelope.locationId &&
      p.dayIndex === envelope.dayIndex,
  );
  if (
    scopedPools.length !== 3 ||
    envelope.pools.some(
      (lane) =>
        !scopedPools.some(
          (p) => p.poolId === lane.poolId && p.skill === lane.skill,
        ),
    )
  )
    invalid('INCOMPLETE_OR_ALIASED_POOL_SCOPE');
  for (const p of scopedPools) {
    integer(p.capacitySlots);
    integer(p.usedSlots);
    integer(p.reservedSlots);
  }
  const original =
    parsed.kind === 'PLAN'
      ? input.command
      : (() => {
          const p = before.plans.find(
            (p) => p.planCommandId === parsed.intent.planCommandId,
          );
          if (!p) invalid('MISSING_ORIGINAL_PLAN');
          return parseCanonicalCommand(
            JSON.parse(p.canonicalCommand),
            input.sha256Hex,
          );
        })();
  const originalParsed = parseSocialEmploymentServiceCommand(
    original,
    input.sha256Hex,
  );
  if (
    originalParsed.kind !== 'PLAN' ||
    originalParsed.intent.dueDayIndex !== envelope.dayIndex ||
    originalParsed.intent.locationId !== envelope.locationId ||
    !envelope.pools.some(
      (p) =>
        p.poolId === originalParsed.intent.servicePoolId &&
        p.skill === originalParsed.intent.skill,
    )
  )
    invalid('COMMAND_OUTSIDE_BOUND_DAY_AND_LANE');
  const operation = prepareSocialEmploymentServiceOperation({
    command: input.command,
    state: before,
    readFacts: input.readFacts,
    sha256Hex: input.sha256Hex,
  });
  if (
    operation.source === 'APPLIED' &&
    input.command.expectedWorldVersion !== envelope.headWorldVersion
  )
    invalid('NEW_EFFECT_HEAD_VERSION_MISMATCH');
  if (operation.state.plans.length > 10000) invalid('COLLECTION_BOUND');
  const chargedBefore = counts(before, envelope, input.sha256Hex);
  const chargedAfter = counts(operation.state, envelope, input.sha256Hex);
  const lanes = envelope.pools.map((lane) => {
    const pool = scopedPools.find((p) => p.poolId === lane.poolId)!;
    const capacity = BigInt(pool.capacitySlots);
    if (
      chargedBefore[lane.skill] > capacity ||
      chargedAfter[lane.skill] > capacity ||
      chargedAfter[lane.skill] < chargedBefore[lane.skill]
    )
      invalid('PHYSICAL_LANE_EXHAUSTED');
    return {
      ...lane,
      capacity: pool.capacitySlots,
      chargedBefore: chargedBefore[lane.skill].toString(),
      chargedAfter: chargedAfter[lane.skill].toString(),
      remaining: (capacity - chargedAfter[lane.skill]).toString(),
    };
  });
  const stages = envelope.stages.map((stage) => {
    const charge = (values: Counts) =>
      SKILLS.reduce(
        (n, s) => n + values[s] * BigInt(stage.minutesPerOpportunity[s]),
        0n,
      );
    const oldCharge = charge(chargedBefore),
      newCharge = charge(chargedAfter);
    const available = BigInt(stage.availableMinutes);
    if (oldCharge > available || newCharge > available || newCharge < oldCharge)
      invalid('SHARED_PHYSICAL_STAGE_EXHAUSTED');
    return {
      resourceKey: stage.resourceKey,
      availableMinutes: stage.availableMinutes,
      chargedBefore: oldCharge.toString(),
      chargedAfter: newCharge.toString(),
      remaining: (available - newCharge).toString(),
    };
  });
  const body = Object.fromEntries(
    Object.entries(envelope).filter(
      ([key]) => key !== 'headWorldVersion' && key !== 'headEventSequence',
    ),
  );
  return freeze({
    schemaVersion: 'social-physical-attempt-assessment-v1',
    status: 'DERIVED_FEASIBILITY_ONLY_NOT_SOURCE_AUTHORITY',
    checkedFor: {
      worldId: envelope.worldId,
      headWorldVersion: envelope.headWorldVersion,
      headEventSequence: envelope.headEventSequence,
      ruleRevision: envelope.ruleRevision,
      sourceRevision: envelope.sourceRevision,
      dayIndex: envelope.dayIndex,
      countryId: envelope.countryId,
      locationId: envelope.locationId,
    },
    immutableBodyHash: canonicalSha256(
      canonicalHashInput(body),
      input.sha256Hex,
    ),
    operationKind: parsed.kind,
    operationSource: operation.source,
    lanes,
    stages,
    sourceAdmitted: false,
    runtimeReady: false,
  });
}
