import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  commandId,
  countryId,
  idempotencyKey,
  legalEntityId,
  worldId,
} from '../ids.js';
import { Money } from '../numeric/money.js';
import { SimTime } from '../numeric/sim-time.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  applyLabourFacts,
  type LabourEngineState,
  type LabourPopulationAvailability,
  type LabourSkill,
} from '../labour/labour-engine.js';
import {
  createE01DailyBoundary,
  type E01DailyBoundary,
} from '../population/population-engine.js';
import { calculateLabourMatch } from '../engine-kernels/population-labour-services.js';
import {
  canonicalSha256,
  parseCanonicalCommand,
  validateCanonicalCommand,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from './command.js';
import type { ReplayReducer, ReplayReducerEvent } from '../replay/replay.js';

export const SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND =
  'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1';
export const SOCIAL_JOB_MATCH_DUE_COMMAND =
  'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1';
export const SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY = 'SOCIAL_LABOUR';
export const SOCIAL_JOB_MATCH_RULE_VERSION = 'SOCIAL_JOB_MATCH_RULE_V1';
export const SOCIAL_SERVICE_PLAN_EVENT = 'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1';
export const SOCIAL_JOB_MATCH_EVENT = 'SOCIAL_JOB_MATCH_SETTLED_V1';
export const SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND =
  'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1';
export const SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT =
  'SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1';

type RecordValue = Readonly<Record<string, unknown>>;
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    `SOC-1: ${message}`,
  );
}
function inert(input: unknown): Record<string, unknown> {
  const value: unknown = JSON.parse(canonicalSerialize(input));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Expected an inert record');
  return value as Record<string, unknown>;
}
function keys(row: RecordValue, expected: readonly string[]) {
  const actual = Object.keys(row).sort(),
    wanted = [...expected].sort();
  if (canonicalSerialize(actual) !== canonicalSerialize(wanted))
    invalid('Missing/unknown fields');
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length)
    invalid('Explicit text required');
  return value;
}
function integer(value: unknown, positive = false): string {
  const v = text(value);
  if (!(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(v))
    invalid('Exact canonical integer required');
  return v;
}
function skill(value: unknown): LabourSkill {
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(text(value)))
    invalid('Explicit skill required');
  return value as LabourSkill;
}
function sha(value: unknown): CanonicalSha256 {
  const v = text(value);
  if (!/^sha256:[0-9a-f]{64}$/u.test(v)) invalid('Canonical SHA256 required');
  return v as CanonicalSha256;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) invalid('Explicit array required');
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
const hash = (value: unknown, digest: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(value), digest);
const sum = (values: readonly string[]) =>
  values.reduce((n, v) => n + BigInt(v), 0n).toString();

export interface SocialEmploymentServicePlanIntent {
  readonly schemaVersion: 'social-employment-service-plan-v1';
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly positionId: string;
  readonly servicePoolId: string;
  readonly requestedMatches: string;
  readonly dueDayIndex: string;
}
export interface SocialJobMatchDueIntent {
  readonly schemaVersion: 'social-job-match-settlement-v1';
  readonly planCommandId: string;
  readonly planFingerprint: CanonicalSha256;
  readonly dueDayIndex: string;
  readonly ruleVersion: typeof SOCIAL_JOB_MATCH_RULE_VERSION;
}

export function parseSocialEmploymentServicePlanIntent(
  value: unknown,
): SocialEmploymentServicePlanIntent {
  const r = inert(value);
  keys(r, [
    'schemaVersion',
    'locationId',
    'skill',
    'positionId',
    'servicePoolId',
    'requestedMatches',
    'dueDayIndex',
  ]);
  if (r.schemaVersion !== 'social-employment-service-plan-v1')
    invalid('Unsupported plan schema');
  return freeze({
    schemaVersion: r.schemaVersion,
    locationId: idempotencyKey(text(r.locationId)),
    skill: skill(r.skill),
    positionId: idempotencyKey(text(r.positionId)),
    servicePoolId: idempotencyKey(text(r.servicePoolId)),
    requestedMatches: integer(r.requestedMatches, true),
    dueDayIndex: integer(r.dueDayIndex),
  });
}
export function parseSocialJobMatchDueIntent(
  value: unknown,
): SocialJobMatchDueIntent {
  const r = inert(value);
  keys(r, [
    'schemaVersion',
    'planCommandId',
    'planFingerprint',
    'dueDayIndex',
    'ruleVersion',
  ]);
  if (
    r.schemaVersion !== 'social-job-match-settlement-v1' ||
    r.ruleVersion !== SOCIAL_JOB_MATCH_RULE_VERSION
  )
    invalid('Unsupported due schema/rule');
  return freeze({
    schemaVersion: r.schemaVersion,
    planCommandId: commandId(text(r.planCommandId)),
    planFingerprint: sha(r.planFingerprint),
    dueDayIndex: integer(r.dueDayIndex),
    ruleVersion: r.ruleVersion,
  });
}
export function parseSocialEmploymentServiceCommand(
  command: CanonicalCommand,
  digest: Sha256Hex,
) {
  validateCanonicalCommand(command, digest);
  if (command.expectedWorldVersion === null)
    invalid('Expected WorldVersion required');
  const value: unknown = JSON.parse(command.canonicalPayload);
  if (
    command.commandType === SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND &&
    command.officeId === 'SOCIAL'
  )
    return freeze({
      kind: 'PLAN' as const,
      intent: parseSocialEmploymentServicePlanIntent(value),
    });
  if (
    command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND &&
    command.officeId === null
  )
    return freeze({
      kind: 'MATCH' as const,
      intent: parseSocialJobMatchDueIntent(value),
    });
  return invalid('Wrong family/Office; due syntax is not automatic authority');
}

export interface SocialEmploymentServicePool {
  readonly poolId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly dayIndex: string;
  readonly ruleVersion: string;
  readonly capacitySlots: string;
  readonly usedSlots: string;
  readonly reservedSlots: string;
}
export interface SocialEmploymentServicePlan {
  readonly planCommandId: string;
  readonly planFingerprint: CanonicalSha256;
  readonly canonicalCommand: string;
  readonly reservedSlots: string;
  readonly state: 'PENDING' | 'SETTLED';
  readonly settlementCommandId: string | null;
  readonly matched: string | null;
}
export interface SocialEmploymentOutcome {
  readonly kind: 'PLAN' | 'MATCH';
  readonly planCommandId: string;
  readonly servicePoolId: string;
  readonly positionId: string;
  readonly allocatedSlots: string;
  readonly matched: string;
  readonly remainingUnemployed: string;
  readonly remainingVacancies: string;
  readonly remainingFreeServiceSlots: string;
  readonly reason: string | null;
}
export interface SocialEmploymentOperationBinding {
  readonly commandId: string;
  readonly commandFingerprint: CanonicalSha256;
  readonly canonicalPayload: string;
  readonly result: SocialEmploymentOutcome;
}
/** Root's single E03 slice plus service allocation metadata, never a second E03 engine/table. */
export interface SocialEmploymentServiceState {
  readonly schemaVersion: 'social-employment-service-state-v1';
  readonly worldId: string;
  readonly labour: LabourEngineState;
  readonly servicePools: readonly SocialEmploymentServicePool[];
  readonly plans: readonly SocialEmploymentServicePlan[];
  readonly appliedOperations: readonly SocialEmploymentOperationBinding[];
  /** Absent in old history: do not normalize absence into [] or change hashes. */
  readonly creations?: readonly SocialEmploymentServiceCreationRecord[];
}
export interface SocialEmploymentServiceCreateIntent {
  readonly schemaVersion: 'social-employment-service-create-v1';
  readonly programmeId: string;
  readonly capacity: Readonly<{ amount: string; unit: 'person' }>;
  readonly budget: Readonly<{ amount: string; currency: string }>;
  readonly target: Readonly<{
    servicePoolId: string;
    locationId: string;
    skill: LabourSkill;
  }>;
}
export interface SocialEmploymentServiceCreationRecord {
  readonly canonicalCommand: string;
  readonly commandFingerprint: CanonicalSha256;
  readonly servicePoolId: string;
  readonly parentCapacityBefore: string;
  readonly licenceRef: string;
  readonly licenceFingerprint: CanonicalSha256;
  readonly sourceRef: string;
  readonly sourceFingerprint: CanonicalSha256;
}
export interface SocialEmploymentPopulationReadFacts {
  readonly boundary: E01DailyBoundary;
  readonly simTime: string;
  readonly populationAvailability: readonly LabourPopulationAvailability[];
}
export interface SocialEmploymentServiceCreationReadFacts extends SocialEmploymentPopulationReadFacts {
  readonly worldId: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly countryId: string;
  readonly governmentEntityId: string;
  readonly localCurrency: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: CanonicalSha256;
  readonly sourceRevocations: readonly Readonly<{
    sourceRef: string;
    revocationRef: string;
  }>[];
  readonly usageLicence: Readonly<{
    licenseId: string;
    licensorEntityId: string;
    beneficiaryEntityId: string;
    locationId: string;
    validFromDayIndex: string;
    validUntilDayIndex: string;
    dutyAssignmentIds: readonly string[];
    maximumWorkerMinutes: string;
    scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER';
    state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE';
    additionalFeeAmount: '0';
    futurePaymentCondition: 'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT';
  }>;
}

export function parseSocialEmploymentServiceCreateIntent(
  value: unknown,
): Readonly<SocialEmploymentServiceCreateIntent> {
  const r = inert(value);
  keys(r, ['schemaVersion', 'programmeId', 'capacity', 'budget', 'target']);
  if (r.schemaVersion !== 'social-employment-service-create-v1')
    invalid('Unsupported employment service creation schema');
  const capacity = inert(r.capacity),
    budget = inert(r.budget),
    target = inert(r.target);
  keys(capacity, ['amount', 'unit']);
  keys(budget, ['amount', 'currency']);
  keys(target, ['servicePoolId', 'locationId', 'skill']);
  if (capacity.unit !== 'person') invalid('Service capacity is a person count');
  const requestedBudget = Money.from(
    text(budget.amount),
    text(budget.currency),
  );
  if (
    canonicalSerialize(requestedBudget.toCanonicalValue()) !==
      canonicalSerialize(budget) ||
    requestedBudget.amount.isNegative()
  )
    invalid('Exact nonnegative local-currency budget required');
  return freeze({
    schemaVersion: r.schemaVersion,
    programmeId: idempotencyKey(text(r.programmeId)),
    capacity: { amount: integer(capacity.amount, true), unit: 'person' },
    budget: requestedBudget.toCanonicalValue(),
    target: {
      servicePoolId: idempotencyKey(text(target.servicePoolId)),
      locationId: idempotencyKey(text(target.locationId)),
      skill: skill(target.skill),
    },
  });
}
function parseCreationCommand(command: CanonicalCommand, digest: Sha256Hex) {
  validateCanonicalCommand(command, digest);
  if (
    command.commandType !== SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND ||
    command.officeId !== 'SOCIAL' ||
    command.expectedWorldVersion === null ||
    command.idempotencyKey === null
  )
    invalid('Current manual Social service creation command required');
  return parseSocialEmploymentServiceCreateIntent(
    JSON.parse(command.canonicalPayload),
  );
}
function createdPoolId(command: CanonicalCommand, digest: Sha256Hex): string {
  const intent = parseCreationCommand(command, digest);
  return (
    'SOCIAL_PROGRAMME_POOL_' +
    hash(
      [
        command.worldId,
        command.countryId,
        command.commandId,
        intent.programmeId,
      ],
      digest,
    )
      .slice(7)
      .toUpperCase()
  );
}
/** Current legal offer/rule facts are server-read, not values/booleans in intent. */
export interface SocialEmploymentWageOffer {
  readonly positionId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: LabourSkill;
  readonly employerId: string;
  readonly employerRole: 'OP' | 'GOV';
  readonly legalPositionRef: string;
  readonly payrollFundingRef: string;
  readonly offerVersion: string;
  readonly state: 'ACTIVE' | 'REVOKED';
  readonly wageVersion: string;
  readonly amount: string;
  readonly currency: string;
  readonly period: 'SIM_HOUR' | 'SIM_YEAR';
  readonly validFromDayIndex: string;
  readonly validUntilDayIndex: string;
}
export interface SocialEmploymentMinimumWage {
  readonly countryId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly amount: string;
  readonly currency: string;
  readonly period: 'SIM_HOUR' | 'SIM_YEAR';
  readonly validFromDayIndex: string;
  readonly validUntilDayIndex: string;
}
export interface SocialEmploymentReadFacts {
  readonly boundary: E01DailyBoundary;
  readonly simTime: string;
  readonly populationAvailability: readonly LabourPopulationAvailability[];
  readonly offer: SocialEmploymentWageOffer;
  readonly minimumWage: SocialEmploymentMinimumWage;
}

function wire(command: CanonicalCommand): RecordValue {
  return freeze({
    actorId: command.actorId,
    authSubject: command.authSubject,
    commandId: command.commandId,
    commandType: command.commandType,
    correlationId: command.correlationId,
    countryId: command.countryId,
    expectedWorldVersion: command.expectedWorldVersion,
    idempotencyKey: command.idempotencyKey,
    officeId: command.officeId,
    payload: JSON.parse(command.canonicalPayload) as unknown,
    schemaVersion: command.schemaVersion,
    simTime: command.simTime.toCanonicalValue(),
    submittedAtReal: command.submittedAtReal,
    worldId: command.worldId,
  });
}
function facts(input: SocialEmploymentReadFacts): SocialEmploymentReadFacts {
  const r = inert(input);
  keys(r, [
    'boundary',
    'simTime',
    'populationAvailability',
    'offer',
    'minimumWage',
  ]);
  const b = inert(r.boundary);
  keys(b, ['kind', 'dayIndex']);
  if (b.kind !== 'E01_DAILY_BOUNDARY')
    invalid('An existing E01 daily boundary is required');
  const offer = inert(r.offer);
  keys(offer, [
    'positionId',
    'countryId',
    'locationId',
    'skill',
    'employerId',
    'employerRole',
    'legalPositionRef',
    'payrollFundingRef',
    'offerVersion',
    'state',
    'wageVersion',
    'amount',
    'currency',
    'period',
    'validFromDayIndex',
    'validUntilDayIndex',
  ]);
  const minimum = inert(r.minimumWage);
  keys(minimum, [
    'countryId',
    'ruleId',
    'ruleVersion',
    'amount',
    'currency',
    'period',
    'validFromDayIndex',
    'validUntilDayIndex',
  ]);
  for (const row of [offer, minimum]) {
    countryId(text(row.countryId));
    Money.from(text(row.amount), text(row.currency));
    if (
      !['SIM_HOUR', 'SIM_YEAR'].includes(text(row.period)) ||
      BigInt(integer(row.validUntilDayIndex)) <=
        BigInt(integer(row.validFromDayIndex))
    )
      invalid('Explicit wage period/effective interval required');
  }
  if (
    !['ACTIVE', 'REVOKED'].includes(text(offer.state)) ||
    !['OP', 'GOV'].includes(text(offer.employerRole))
  )
    invalid('Explicit current offer state/employer required');
  legalEntityId(text(offer.employerId));
  skill(offer.skill);
  for (const field of [
    'positionId',
    'locationId',
    'legalPositionRef',
    'payrollFundingRef',
    'offerVersion',
    'wageVersion',
  ])
    idempotencyKey(text(offer[field]));
  idempotencyKey(text(minimum.ruleId));
  idempotencyKey(text(minimum.ruleVersion));
  SimTime.fromTicks(text(r.simTime));
  array(r.populationAvailability);
  return freeze({
    boundary: createE01DailyBoundary(integer(b.dayIndex)),
    simTime: text(r.simTime),
    populationAvailability:
      r.populationAvailability as unknown as readonly LabourPopulationAvailability[],
    offer: offer as unknown as SocialEmploymentWageOffer,
    minimumWage: minimum as unknown as SocialEmploymentMinimumWage,
  });
}

export function validateSocialEmploymentServiceState(
  input: SocialEmploymentServiceState,
  readFacts: SocialEmploymentReadFacts,
  digest: Sha256Hex,
): SocialEmploymentServiceState {
  return validateServiceStateFromPopulation(input, facts(readFacts), digest);
}
function populationFacts(value: unknown): SocialEmploymentPopulationReadFacts {
  const r = inert(value);
  keys(r, ['boundary', 'simTime', 'populationAvailability']);
  const b = inert(r.boundary);
  keys(b, ['kind', 'dayIndex']);
  if (b.kind !== 'E01_DAILY_BOUNDARY')
    invalid('Existing E01 boundary required');
  const simTime = SimTime.fromTicks(text(r.simTime)).toCanonicalValue();
  if (simTime !== r.simTime) invalid('Exact current SimTime required');
  return freeze({
    boundary: createE01DailyBoundary(integer(b.dayIndex)),
    simTime,
    populationAvailability: array(
      r.populationAvailability,
    ) as unknown as readonly LabourPopulationAvailability[],
  });
}
function validateServiceStateFromPopulation(
  input: SocialEmploymentServiceState,
  boundaryFacts: SocialEmploymentPopulationReadFacts,
  digest: Sha256Hex,
): SocialEmploymentServiceState {
  const r = inert(input);
  keys(r, [
    'schemaVersion',
    'worldId',
    'labour',
    'servicePools',
    'plans',
    'appliedOperations',
    ...(Object.hasOwn(r, 'creations') ? ['creations'] : []),
  ]);
  if (r.schemaVersion !== 'social-employment-service-state-v1')
    invalid('Unsupported social service state');
  const labour = applyLabourFacts({
    boundary: boundaryFacts.boundary,
    populationAvailability: boundaryFacts.populationAvailability,
    state: r.labour as unknown as LabourEngineState,
    facts: [],
  }).state;
  const poolIds = new Set<string>();
  const servicePools = array(r.servicePools)
    .map((value) => {
      const p = inert(value);
      keys(p, [
        'poolId',
        'countryId',
        'locationId',
        'skill',
        'dayIndex',
        'ruleVersion',
        'capacitySlots',
        'usedSlots',
        'reservedSlots',
      ]);
      const poolId = idempotencyKey(text(p.poolId));
      if (poolIds.has(poolId)) invalid('Repeated service pool');
      poolIds.add(poolId);
      const capacity = integer(p.capacitySlots),
        used = integer(p.usedSlots),
        reserved = integer(p.reservedSlots);
      if (BigInt(used) + BigInt(reserved) > BigInt(capacity))
        invalid('Service slots over-allocated');
      if (p.ruleVersion !== SOCIAL_JOB_MATCH_RULE_VERSION)
        invalid('Unsupported service rule version');
      return {
        poolId,
        countryId: countryId(text(p.countryId)),
        locationId: idempotencyKey(text(p.locationId)),
        skill: skill(p.skill),
        dayIndex: integer(p.dayIndex),
        ruleVersion: text(p.ruleVersion),
        capacitySlots: capacity,
        usedSlots: used,
        reservedSlots: reserved,
      };
    })
    .sort((a, b) => (a.poolId < b.poolId ? -1 : a.poolId === b.poolId ? 0 : 1));
  const planIds = new Set<string>();
  const creations = Object.hasOwn(r, 'creations')
    ? validateCreationRecords(
        r.creations,
        servicePools,
        text(r.worldId),
        digest,
      )
    : undefined;
  const plans = array(r.plans)
    .map((value) => {
      const p = inert(value);
      keys(p, [
        'planCommandId',
        'planFingerprint',
        'canonicalCommand',
        'reservedSlots',
        'state',
        'settlementCommandId',
        'matched',
      ]);
      const original = parseCanonicalCommand(
        JSON.parse(text(p.canonicalCommand)) as unknown,
        digest,
      );
      const parsed = parseSocialEmploymentServiceCommand(original, digest);
      if (
        parsed.kind !== 'PLAN' ||
        original.commandId !== p.planCommandId ||
        original.fingerprint !== p.planFingerprint ||
        original.worldId !== r.worldId ||
        canonicalSerialize(wire(original)) !== p.canonicalCommand
      )
        invalid('Plan does not bind its immutable command');
      if (planIds.has(original.commandId)) invalid('Repeated plan');
      planIds.add(original.commandId);
      if (
        integer(p.reservedSlots, true) !== parsed.intent.requestedMatches ||
        !['PENDING', 'SETTLED'].includes(text(p.state))
      )
        invalid('Invalid plan allocation/status');
      if (
        p.state === 'PENDING'
          ? p.settlementCommandId !== null || p.matched !== null
          : p.settlementCommandId === null || p.matched === null
      )
        invalid('Incomplete settlement binding');
      if (
        p.state === 'SETTLED' &&
        BigInt(integer(p.matched)) > BigInt(integer(p.reservedSlots))
      )
        invalid('Matched people exceed plan slots');
      return {
        planCommandId: original.commandId,
        planFingerprint: original.fingerprint,
        canonicalCommand: text(p.canonicalCommand),
        reservedSlots: integer(p.reservedSlots),
        state: p.state as 'PENDING' | 'SETTLED',
        settlementCommandId:
          p.settlementCommandId === null
            ? null
            : commandId(text(p.settlementCommandId)),
        matched: p.matched === null ? null : integer(p.matched),
      };
    })
    .sort((a, b) =>
      a.planCommandId < b.planCommandId
        ? -1
        : a.planCommandId === b.planCommandId
          ? 0
          : 1,
    );
  const bindingIds = new Set<string>();
  const appliedOperations = array(r.appliedOperations)
    .map((value) => {
      const o = inert(value);
      keys(o, [
        'commandId',
        'commandFingerprint',
        'canonicalPayload',
        'result',
      ]);
      const id = commandId(text(o.commandId));
      if (bindingIds.has(id)) invalid('Repeated operation');
      bindingIds.add(id);
      const result = inert(o.result);
      keys(result, [
        'kind',
        'planCommandId',
        'servicePoolId',
        'positionId',
        'allocatedSlots',
        'matched',
        'remainingUnemployed',
        'remainingVacancies',
        'remainingFreeServiceSlots',
        'reason',
      ]);
      if (!['PLAN', 'MATCH'].includes(text(result.kind)))
        invalid('Unsupported operation result');
      for (const k of [
        'allocatedSlots',
        'matched',
        'remainingUnemployed',
        'remainingVacancies',
        'remainingFreeServiceSlots',
      ])
        integer(result[k]);
      for (const k of ['planCommandId', 'servicePoolId', 'positionId'])
        idempotencyKey(text(result[k]));
      if (result.reason !== null) text(result.reason);
      const canonicalPayload = text(o.canonicalPayload);
      if (
        canonicalSerialize(JSON.parse(canonicalPayload) as unknown) !==
        canonicalPayload
      )
        invalid('Operation payload is not canonical');
      return {
        commandId: id,
        commandFingerprint: sha(o.commandFingerprint),
        canonicalPayload,
        result: result as unknown as SocialEmploymentOutcome,
      };
    })
    .sort((a, b) =>
      a.commandId < b.commandId ? -1 : a.commandId === b.commandId ? 0 : 1,
    );
  for (const p of plans) {
    const command = parseCanonicalCommand(
        JSON.parse(p.canonicalCommand) as unknown,
        digest,
      ),
      intent = parseSocialEmploymentServicePlanIntent(
        JSON.parse(command.canonicalPayload) as unknown,
      );
    const pool = servicePools.find((s) => s.poolId === intent.servicePoolId);
    if (
      !pool ||
      pool.countryId !== command.countryId ||
      pool.locationId !== intent.locationId ||
      pool.skill !== intent.skill ||
      pool.dayIndex !== intent.dueDayIndex
    )
      invalid('Plan pool/scope does not exist');
    const binding = appliedOperations.find(
      (o) => o.commandId === p.planCommandId,
    );
    if (
      !binding ||
      binding.commandFingerprint !== p.planFingerprint ||
      binding.canonicalPayload !== command.canonicalPayload ||
      binding.result.kind !== 'PLAN'
    )
      invalid('Plan lacks its operation binding');
    if (
      p.state === 'SETTLED' &&
      !appliedOperations.some(
        (o) =>
          o.commandId === p.settlementCommandId &&
          o.result.kind === 'MATCH' &&
          o.result.planCommandId === p.planCommandId &&
          o.result.matched === p.matched,
      )
    )
      invalid('Settled plan lacks exact matching operation');
  }
  for (const pool of servicePools) {
    const plansForPool = plans.filter(
      (p) =>
        parseSocialEmploymentServicePlanIntent(
          JSON.parse(
            parseCanonicalCommand(
              JSON.parse(p.canonicalCommand) as unknown,
              digest,
            ).canonicalPayload,
          ) as unknown,
        ).servicePoolId === pool.poolId,
    );
    if (
      sum(
        plansForPool
          .filter((p) => p.state === 'PENDING')
          .map((p) => p.reservedSlots),
      ) !== pool.reservedSlots ||
      BigInt(
        sum(
          plansForPool
            .filter((p) => p.state === 'SETTLED')
            .map((p) => p.matched!),
        ),
      ) > BigInt(pool.usedSlots)
    )
      invalid('Service reservation/use does not bind plans');
  }
  for (const operation of appliedOperations) {
    const plan = plans.find(
      (p) => p.planCommandId === operation.result.planCommandId,
    );
    if (
      !plan ||
      (operation.result.kind === 'PLAN'
        ? operation.commandId !== plan.planCommandId ||
          operation.result.matched !== '0'
        : operation.commandId !== plan.settlementCommandId ||
          operation.result.matched !== plan.matched)
    )
      invalid('Orphan or inconsistent operation binding');
    const intent = parseSocialEmploymentServicePlanIntent(
      JSON.parse(
        parseCanonicalCommand(
          JSON.parse(plan.canonicalCommand) as unknown,
          digest,
        ).canonicalPayload,
      ) as unknown,
    );
    if (
      operation.result.servicePoolId !== intent.servicePoolId ||
      operation.result.positionId !== intent.positionId ||
      operation.result.allocatedSlots !== plan.reservedSlots
    )
      invalid('Operation scope/allocation differs from its plan');
    if (operation.result.kind === 'MATCH') {
      const due = parseSocialJobMatchDueIntent(
        JSON.parse(operation.canonicalPayload) as unknown,
      );
      if (
        due.planCommandId !== plan.planCommandId ||
        due.planFingerprint !== plan.planFingerprint ||
        due.dueDayIndex !== intent.dueDayIndex
      )
        invalid('Settlement payload differs from its causal plan');
    }
  }
  return freeze({
    schemaVersion: r.schemaVersion,
    worldId: worldId(text(r.worldId)),
    labour,
    servicePools,
    plans,
    appliedOperations,
    ...(creations ? { creations } : {}),
  });
}

function validateCreationRecords(
  value: unknown,
  pools: readonly SocialEmploymentServicePool[],
  world: string,
  digest: Sha256Hex,
): readonly SocialEmploymentServiceCreationRecord[] {
  const ids = new Set<string>(),
    programmes = new Set<string>();
  const records = array(value)
    .map((value) => {
      const r = inert(value);
      keys(r, [
        'canonicalCommand',
        'commandFingerprint',
        'servicePoolId',
        'parentCapacityBefore',
        'licenceRef',
        'licenceFingerprint',
        'sourceRef',
        'sourceFingerprint',
      ]);
      const canonicalCommand = text(r.canonicalCommand),
        command = parseCanonicalCommand(JSON.parse(canonicalCommand), digest),
        intent = parseCreationCommand(command, digest);
      if (
        canonicalSerialize(wire(command)) !== canonicalCommand ||
        command.fingerprint !== r.commandFingerprint ||
        command.worldId !== world ||
        intent.budget.amount !== '0' ||
        SimTime.fromTicks('86400000').ticks <= command.simTime.ticks ||
        createdPoolId(command, digest) !== r.servicePoolId
      )
        invalid('Creation does not bind its immutable first-day command');
      const key = command.countryId + '\n' + intent.programmeId;
      if (ids.has(command.commandId) || programmes.has(key))
        invalid('Duplicate service creation');
      ids.add(command.commandId);
      programmes.add(key);
      const parent = pools.find(
          (p) => p.poolId === intent.target.servicePoolId,
        ),
        child = pools.find((p) => p.poolId === r.servicePoolId);
      if (
        !parent ||
        !child ||
        parent.countryId !== command.countryId ||
        child.countryId !== command.countryId ||
        parent.locationId !== intent.target.locationId ||
        parent.skill !== intent.target.skill ||
        parent.dayIndex !== '0' ||
        child.locationId !== parent.locationId ||
        child.skill !== parent.skill ||
        child.dayIndex !== parent.dayIndex ||
        child.ruleVersion !== parent.ruleVersion ||
        child.capacitySlots !== intent.capacity.amount
      )
        invalid('Programme pool must partition the same real parent scope');
      return freeze({
        canonicalCommand,
        commandFingerprint: sha(r.commandFingerprint),
        servicePoolId: idempotencyKey(text(r.servicePoolId)),
        parentCapacityBefore: integer(r.parentCapacityBefore, true),
        licenceRef: idempotencyKey(text(r.licenceRef)),
        licenceFingerprint: sha(r.licenceFingerprint),
        sourceRef: idempotencyKey(text(r.sourceRef)),
        sourceFingerprint: sha(r.sourceFingerprint),
      });
    })
    .sort((a, b) => {
      const head = (r: SocialEmploymentServiceCreationRecord) =>
        BigInt(
          parseCanonicalCommand(JSON.parse(r.canonicalCommand), digest)
            .expectedWorldVersion!,
        );
      return head(a) < head(b)
        ? -1
        : head(a) > head(b)
          ? 1
          : a.servicePoolId < b.servicePoolId
            ? -1
            : a.servicePoolId === b.servicePoolId
              ? 0
              : 1;
    });
  const children = new Set<string>(records.map((r) => r.servicePoolId));
  const remaining = new Map<string, bigint>();
  const heads = new Set<string>();
  for (const r of records) {
    const c = parseCanonicalCommand(JSON.parse(r.canonicalCommand), digest),
      intent = parseCreationCommand(c, digest),
      parent = intent.target.servicePoolId;
    if (heads.has(c.expectedWorldVersion!))
      invalid('Two creations cannot share a global predecessor version');
    heads.add(c.expectedWorldVersion!);
    if (children.has(parent))
      invalid('Nested programme pool partitions are forbidden');
    const before = remaining.get(parent) ?? BigInt(r.parentCapacityBefore);
    if (
      before !== BigInt(r.parentCapacityBefore) ||
      before < BigInt(intent.capacity.amount)
    )
      invalid('Creation capacity chain is not conserved');
    remaining.set(parent, before - BigInt(intent.capacity.amount));
  }
  for (const [id, capacity] of remaining)
    if (BigInt(pools.find((p) => p.poolId === id)!.capacitySlots) !== capacity)
      invalid('Parent capacity differs from exact creation partitions');
  return records;
}

/** DATA mapping only. Worker must consume the genuine current replay state and
 * recheck the same original desk/people/time sources; this grants no authority. */
export function resolveSocialEmploymentPhysicalServicePool(
  state: SocialEmploymentServiceState,
  servicePoolId: string,
  digest: Sha256Hex,
): string {
  const records = validateCreationRecords(
    state.creations ?? [],
    state.servicePools,
    state.worldId,
    digest,
  );
  const creation = records.find((r) => r.servicePoolId === servicePoolId);
  if (!state.servicePools.some((p) => p.poolId === servicePoolId))
    invalid('Unknown service pool');
  return creation
    ? parseCreationCommand(
        parseCanonicalCommand(JSON.parse(creation.canonicalCommand), digest),
        digest,
      ).target.servicePoolId
    : servicePoolId;
}

export interface SocialEmploymentServiceCreationOutcome {
  readonly programmeId: string;
  readonly servicePoolId: string;
  readonly parentServicePoolId: string;
  readonly parentCapacityBefore: string;
  readonly parentCapacityAfter: string;
  readonly capacitySlots: string;
  readonly budget: Readonly<{ amount: string; currency: string }>;
  readonly classification: 'CAPACITY_PARTITION_NOT_WORK_MATCH_OR_PAYMENT';
}
function creationOutcome(
  record: SocialEmploymentServiceCreationRecord,
  digest: Sha256Hex,
): SocialEmploymentServiceCreationOutcome {
  const intent = parseCreationCommand(
    parseCanonicalCommand(JSON.parse(record.canonicalCommand), digest),
    digest,
  );
  return freeze({
    programmeId: intent.programmeId,
    servicePoolId: record.servicePoolId,
    parentServicePoolId: intent.target.servicePoolId,
    parentCapacityBefore: record.parentCapacityBefore,
    parentCapacityAfter: (
      BigInt(record.parentCapacityBefore) - BigInt(intent.capacity.amount)
    ).toString(),
    capacitySlots: intent.capacity.amount,
    budget: intent.budget,
    classification: 'CAPACITY_PARTITION_NOT_WORK_MATCH_OR_PAYMENT',
  });
}
export interface SocialEmploymentServiceCreationPreparedOperation {
  readonly source: 'APPLIED' | 'EXACT_DUPLICATE';
  readonly state: SocialEmploymentServiceState;
  readonly result: SocialEmploymentServiceCreationOutcome;
  readonly eventPayload: unknown | null;
}
/** Only the already-established first-day, no-additional-fee licence is usable.
 * Facts are deterministic DATA; Worker must freshly lock their real issuer,
 * admission, revocations, auth and head. No DTO here is commit authority. */
export function prepareSocialEmploymentServiceCreation(input: {
  readonly command: CanonicalCommand;
  readonly state: SocialEmploymentServiceState;
  readonly readFacts: SocialEmploymentServiceCreationReadFacts;
  readonly sha256Hex: Sha256Hex;
}): SocialEmploymentServiceCreationPreparedOperation {
  const command = input.command,
    digest = input.sha256Hex,
    intent = parseCreationCommand(command, digest),
    r = inert(input.readFacts);
  keys(r, [
    'worldId',
    'boundary',
    'simTime',
    'populationAvailability',
    'head',
    'countryId',
    'governmentEntityId',
    'localCurrency',
    'sourceRef',
    'sourceFingerprint',
    'sourceRevocations',
    'usageLicence',
  ]);
  const population = populationFacts({
    boundary: r.boundary,
    simTime: r.simTime,
    populationAvailability: r.populationAvailability,
  });
  const state = validateServiceStateFromPopulation(
    input.state,
    population,
    digest,
  );
  if (
    state.worldId !== command.worldId ||
    r.worldId !== command.worldId ||
    r.countryId !== command.countryId
  )
    invalid('Creation World/country differs from actual source');
  const duplicate = state.creations?.find(
    (record) =>
      parseCanonicalCommand(JSON.parse(record.canonicalCommand), digest)
        .commandId === command.commandId,
  );
  if (duplicate) {
    if (
      duplicate.commandFingerprint !== command.fingerprint ||
      duplicate.canonicalCommand !== canonicalSerialize(wire(command))
    )
      invalid('Creation idempotency conflict');
    return freeze({
      source: 'EXACT_DUPLICATE',
      state,
      result: creationOutcome(duplicate, digest),
      eventPayload: null,
    });
  }
  const head = inert(r.head);
  keys(head, ['worldVersion', 'eventSequence']);
  integer(head.eventSequence);
  if (
    integer(head.worldVersion) !== command.expectedWorldVersion ||
    population.simTime !== command.simTime.toCanonicalValue() ||
    population.boundary.dayIndex !== '0' ||
    command.simTime.ticks >= 86400000n
  )
    invalid('Exact current first-day source/head required');
  const licence = inert(r.usageLicence);
  keys(licence, [
    'licenseId',
    'licensorEntityId',
    'beneficiaryEntityId',
    'locationId',
    'validFromDayIndex',
    'validUntilDayIndex',
    'dutyAssignmentIds',
    'maximumWorkerMinutes',
    'scope',
    'state',
    'additionalFeeAmount',
    'futurePaymentCondition',
  ]);
  const duties = array(licence.dutyAssignmentIds).map((id) =>
    idempotencyKey(text(id)),
  );
  integer(licence.maximumWorkerMinutes, true);
  if (
    !duties.length ||
    new Set(duties).size !== duties.length ||
    licence.validFromDayIndex !== '0' ||
    licence.validUntilDayIndex !== '1' ||
    licence.scope !== 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER' ||
    licence.state !== 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE' ||
    licence.additionalFeeAmount !== '0' ||
    licence.futurePaymentCondition !==
      'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT' ||
    licence.locationId !== intent.target.locationId ||
    legalEntityId(text(licence.beneficiaryEntityId)) !==
      legalEntityId(text(r.governmentEntityId)) ||
    legalEntityId(text(licence.licensorEntityId)) === r.governmentEntityId
  )
    invalid('Actual finite T0 public-referral licence required');
  if (
    intent.budget.amount !== '0' ||
    intent.budget.currency !== text(r.localCurrency)
  )
    invalid(
      'Additional purchase or nonlocal budget is outside the no-fee licence',
    );
  const sourceRef = idempotencyKey(text(r.sourceRef)),
    sourceFingerprint = sha(r.sourceFingerprint);
  for (const value of array(r.sourceRevocations)) {
    const revocation = inert(value);
    keys(revocation, ['sourceRef', 'revocationRef']);
    idempotencyKey(text(revocation.revocationRef));
    if (
      text(revocation.sourceRef) === sourceRef ||
      revocation.sourceRef === licence.licenseId
    )
      invalid('Creation source/licence revoked');
  }
  const parent = state.servicePools.find(
    (p) => p.poolId === intent.target.servicePoolId,
  );
  if (
    !parent ||
    parent.countryId !== command.countryId ||
    parent.locationId !== intent.target.locationId ||
    parent.skill !== intent.target.skill ||
    parent.dayIndex !== '0' ||
    state.creations?.some((c) => c.servicePoolId === parent.poolId)
  )
    invalid(
      'Existing same-scope root desk pool required; no nested partitions',
    );
  const target = state.labour.aggregates.find(
    (p) =>
      p.countryId === command.countryId &&
      p.locationId === parent.locationId &&
      p.skill === parent.skill &&
      p.status === 'UNEMPLOYED_SEARCHING',
  );
  if (!target)
    invalid('Actual current same-country job-seeking target missing, not zero');
  const available =
      BigInt(parent.capacitySlots) -
      BigInt(parent.usedSlots) -
      BigInt(parent.reservedSlots),
    amount = BigInt(intent.capacity.amount);
  if (amount > available)
    invalid('Creation would reuse already allocated desk capacity');
  const record: SocialEmploymentServiceCreationRecord = freeze({
    canonicalCommand: canonicalSerialize(wire(command)),
    commandFingerprint: command.fingerprint,
    servicePoolId: createdPoolId(command, digest),
    parentCapacityBefore: parent.capacitySlots,
    licenceRef: idempotencyKey(text(licence.licenseId)),
    licenceFingerprint: hash(licence, digest),
    sourceRef,
    sourceFingerprint,
  });
  if (state.servicePools.some((p) => p.poolId === record.servicePoolId))
    invalid('Programme pool identity already exists');
  const next = validateServiceStateFromPopulation(
    {
      ...state,
      servicePools: [
        ...state.servicePools.map((p) =>
          p.poolId === parent.poolId
            ? {
                ...p,
                capacitySlots: (BigInt(p.capacitySlots) - amount).toString(),
              }
            : p,
        ),
        {
          ...parent,
          poolId: record.servicePoolId,
          capacitySlots: intent.capacity.amount,
          usedSlots: '0',
          reservedSlots: '0',
        },
      ],
      creations: [...(state.creations ?? []), record],
    },
    population,
    digest,
  );
  const result = creationOutcome(record, digest);
  return freeze({
    source: 'APPLIED',
    state: next,
    result,
    eventPayload: {
      schemaVersion: 'social-employment-service-created-v1',
      command: wire(command),
      readFacts: r,
      beforeStateHash: hash(state, digest),
      afterStateHash: hash(next, digest),
      result,
    },
  });
}

export function reduceSocialEmploymentServiceCreatedEvent(input: {
  readonly state: SocialEmploymentServiceState;
  readonly event: ReplayReducerEvent;
  readonly sha256Hex: Sha256Hex;
}): SocialEmploymentServiceState {
  const r = inert(input.event.payload);
  keys(r, [
    'schemaVersion',
    'command',
    'readFacts',
    'beforeStateHash',
    'afterStateHash',
    'result',
  ]);
  if (r.schemaVersion !== 'social-employment-service-created-v1')
    invalid('Unsupported creation event');
  const command = parseCanonicalCommand(r.command, input.sha256Hex);
  parseCreationCommand(command, input.sha256Hex);
  if (
    input.event.eventType !== SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT ||
    input.event.causationCommandId !== command.commandId ||
    input.event.transitionId !== command.commandId ||
    input.event.worldId !== command.worldId ||
    input.event.worldVersionBefore !== command.expectedWorldVersion ||
    input.event.worldVersionAfter !==
      (BigInt(command.expectedWorldVersion!) + 1n).toString() ||
    input.event.simTime.ticks !== command.simTime.ticks ||
    input.event.correctsEventId !== null
  )
    invalid('Creation event causation/version/SimTime mismatch');
  const f = r.readFacts as unknown as SocialEmploymentServiceCreationReadFacts;
  if (input.event.sequence !== (BigInt(f.head.eventSequence) + 1n).toString())
    invalid('Creation event sequence differs from actual source head');
  const state = validateServiceStateFromPopulation(
    input.state,
    populationFacts({
      boundary: f.boundary,
      simTime: f.simTime,
      populationAvailability: f.populationAvailability,
    }),
    input.sha256Hex,
  );
  if (hash(state, input.sha256Hex) !== sha(r.beforeStateHash))
    invalid('Creation replay predecessor differs');
  const operation = prepareSocialEmploymentServiceCreation({
    command,
    state,
    readFacts: f,
    sha256Hex: input.sha256Hex,
  });
  if (
    operation.source !== 'APPLIED' ||
    canonicalSerialize(operation.eventPayload) !== canonicalSerialize(r)
  )
    invalid('Creation replay differs from actual Core calculation');
  return operation.state;
}

export interface SocialEmploymentPreparedOperation {
  readonly source: 'APPLIED' | 'EXACT_DUPLICATE';
  readonly state: SocialEmploymentServiceState;
  readonly result: SocialEmploymentOutcome;
  readonly eventPayload: unknown | null;
}
export function prepareSocialEmploymentServiceOperation(input: {
  readonly command: CanonicalCommand;
  readonly state: SocialEmploymentServiceState;
  readonly readFacts: SocialEmploymentReadFacts;
  readonly sha256Hex: Sha256Hex;
}): SocialEmploymentPreparedOperation {
  const parsed = parseSocialEmploymentServiceCommand(
      input.command,
      input.sha256Hex,
    ),
    readFacts = facts(input.readFacts);
  const state = validateSocialEmploymentServiceState(
      input.state,
      readFacts,
      input.sha256Hex,
    ),
    command = input.command;
  if (
    state.worldId !== command.worldId ||
    readFacts.simTime !== command.simTime.toCanonicalValue()
  )
    invalid('Mixed World/current SimTime snapshot');
  const duplicate = state.appliedOperations.find(
    (o) => o.commandId === command.commandId,
  );
  if (duplicate) {
    if (
      duplicate.commandFingerprint !== command.fingerprint ||
      duplicate.canonicalPayload !== command.canonicalPayload
    )
      invalid('Operation idempotency conflict');
    return freeze({
      source: 'EXACT_DUPLICATE',
      state,
      result: duplicate.result,
      eventPayload: null,
    });
  }
  const plan =
    parsed.kind === 'MATCH'
      ? state.plans.find((p) => p.planCommandId === parsed.intent.planCommandId)
      : undefined;
  if (
    parsed.kind === 'MATCH' &&
    (!plan ||
      plan.state !== 'PENDING' ||
      plan.planFingerprint !== parsed.intent.planFingerprint)
  )
    invalid('Missing, settled or mismatched original plan');
  const intent =
    parsed.kind === 'PLAN'
      ? parsed.intent
      : parseSocialEmploymentServicePlanIntent(
          JSON.parse(
            parseCanonicalCommand(
              JSON.parse(plan!.canonicalCommand) as unknown,
              input.sha256Hex,
            ).canonicalPayload,
          ) as unknown,
        );
  const originalCountry =
    parsed.kind === 'PLAN'
      ? command.countryId
      : parseCanonicalCommand(
          JSON.parse(plan!.canonicalCommand) as unknown,
          input.sha256Hex,
        ).countryId;
  if (command.countryId !== originalCountry) invalid('Cross-country due');
  const pool = state.servicePools.find(
      (p) => p.poolId === intent.servicePoolId,
    ),
    position = state.labour.positions.find(
      (p) => p.positionId === intent.positionId,
    );
  if (
    !pool ||
    !position ||
    pool.countryId !== command.countryId ||
    position.countryId !== command.countryId ||
    pool.locationId !== intent.locationId ||
    pool.skill !== intent.skill ||
    pool.dayIndex !== intent.dueDayIndex
  )
    invalid('Existing lawful position/service pool missing or cross-bound');
  const unemployed = state.labour.aggregates.find(
    (a) =>
      a.countryId === command.countryId &&
      a.locationId === intent.locationId &&
      a.skill === intent.skill &&
      a.status === 'UNEMPLOYED_SEARCHING',
  );
  if (!unemployed)
    invalid('Explicit current unemployed pool is missing, not zero');
  const offer = readFacts.offer,
    minimum = readFacts.minimumWage;
  if (
    offer.positionId !== position.positionId ||
    offer.countryId !== position.countryId ||
    offer.locationId !== position.locationId ||
    offer.skill !== position.skill ||
    minimum.countryId !== position.countryId ||
    (position.owner === 'PUBLIC_SERVICE') !== (offer.employerRole === 'GOV')
  )
    invalid('Current wage offer/rule/employer scope mismatch');
  const wage = state.labour.wageAssertions.find(
    (w) =>
      w.positionId === position.positionId &&
      w.wageVersion === offer.wageVersion,
  );
  const offered = Money.from(offer.amount, offer.currency),
    floor = Money.from(minimum.amount, minimum.currency);
  if (
    !wage ||
    Money.from(wage.wageAmount, offer.currency).toCanonicalValue().amount !==
      offered.toCanonicalValue().amount
  )
    invalid('Current wage version/amount is not in E03');
  const day = BigInt(readFacts.boundary.dayIndex),
    activeAt = (r: SocialEmploymentMinimumWage | SocialEmploymentWageOffer) =>
      day >= BigInt(r.validFromDayIndex) && day < BigInt(r.validUntilDayIndex);
  const wageEligible =
    offer.state === 'ACTIVE' &&
    activeAt(offer) &&
    activeAt(minimum) &&
    !offered.amount.isNegative() &&
    !offered.amount.isZero() &&
    !floor.amount.isNegative() &&
    offer.currency === minimum.currency &&
    offer.period === minimum.period &&
    offered.amount.greaterThanOrEqualTo(floor.amount);
  const compatible =
    position.skill === intent.skill &&
    position.locationId === intent.locationId;
  const free =
    BigInt(pool.capacitySlots) -
    BigInt(pool.usedSlots) -
    BigInt(pool.reservedSlots);
  let labour = state.labour,
    updatedPool: SocialEmploymentServicePool,
    updatedPlan: SocialEmploymentServicePlan;
  let matched = '0',
    reason: string | null = null;
  const vacancies = (
    BigInt(position.requiredCount) - BigInt(position.employedCount)
  ).toString();
  let remainingUnemployed = unemployed.count,
    remainingVacancies = vacancies;
  if (parsed.kind === 'PLAN') {
    if (!compatible || !wageEligible)
      invalid('Plan requires a current eligible legal position/offer');
    if (
      BigInt(intent.dueDayIndex) < day ||
      BigInt(intent.requestedMatches) > free
    )
      invalid('Past plan or insufficient finite service slots');
    updatedPool = {
      ...pool,
      reservedSlots: (
        BigInt(pool.reservedSlots) + BigInt(intent.requestedMatches)
      ).toString(),
    };
    updatedPlan = {
      planCommandId: command.commandId,
      planFingerprint: command.fingerprint,
      canonicalCommand: canonicalSerialize(wire(command)),
      reservedSlots: intent.requestedMatches,
      state: 'PENDING',
      settlementCommandId: null,
      matched: null,
    };
  } else {
    if (
      parsed.intent.dueDayIndex !== intent.dueDayIndex ||
      readFacts.boundary.dayIndex !== intent.dueDayIndex ||
      command.simTime.ticks <
        parseCanonicalCommand(
          JSON.parse(plan!.canonicalCommand) as unknown,
          input.sha256Hex,
        ).simTime.ticks
    )
      invalid('Not the exact lawful E03 due boundary');
    const q = (amount: string) => ({ amount, unit: 'person' });
    const calculated = calculateLabourMatch({
      unemployedSupply: q(unemployed.count),
      vacancyDemand: q(vacancies),
      matchingCapacity: q(plan!.reservedSlots),
      skillMatches: position.skill === intent.skill,
      locationMatches: position.locationId === intent.locationId,
      offeredWageMeetsMinimum: wageEligible,
    });
    matched = calculated.matched.amount;
    reason = calculated.reason;
    remainingUnemployed = calculated.remainingUnemployed.amount;
    remainingVacancies = calculated.remainingVacancies.amount;
    if (matched !== '0') {
      const applied = applyLabourFacts({
        boundary: readFacts.boundary,
        populationAvailability: readFacts.populationAvailability,
        state: labour,
        facts: [
          {
            kind:
              position.owner === 'PRIVATE_SECTOR'
                ? 'JOB_MATCH'
                : 'PUBLIC_SERVICE_OCCUPATION',
            factId: `SOCIAL_MATCH_${plan!.planCommandId}`,
            countryId: command.countryId,
            locationId: intent.locationId,
            skill: intent.skill,
            positionId: position.positionId,
            dayIndex: intent.dueDayIndex,
            count: matched,
          },
        ],
      });
      if (applied.idempotentFactIds.length !== 0)
        invalid(
          'Already-applied matching fact lacks reconciled service settlement',
        );
      labour = applied.state;
    }
    updatedPool = {
      ...pool,
      reservedSlots: (
        BigInt(pool.reservedSlots) - BigInt(plan!.reservedSlots)
      ).toString(),
      usedSlots: (BigInt(pool.usedSlots) + BigInt(matched)).toString(),
    };
    updatedPlan = {
      ...plan!,
      state: 'SETTLED',
      settlementCommandId: command.commandId,
      matched,
    };
  }
  const result: SocialEmploymentOutcome = freeze({
    kind: parsed.kind,
    planCommandId: updatedPlan.planCommandId,
    servicePoolId: pool.poolId,
    positionId: position.positionId,
    allocatedSlots: updatedPlan.reservedSlots,
    matched,
    remainingUnemployed,
    remainingVacancies,
    remainingFreeServiceSlots: (
      BigInt(updatedPool.capacitySlots) -
      BigInt(updatedPool.usedSlots) -
      BigInt(updatedPool.reservedSlots)
    ).toString(),
    reason,
  });
  const next = validateSocialEmploymentServiceState(
    {
      ...state,
      labour,
      servicePools: state.servicePools.map((p) =>
        p.poolId === pool.poolId ? updatedPool : p,
      ),
      plans:
        parsed.kind === 'PLAN'
          ? [...state.plans, updatedPlan]
          : state.plans.map((p) =>
              p.planCommandId === plan!.planCommandId ? updatedPlan : p,
            ),
      appliedOperations: [
        ...state.appliedOperations,
        {
          commandId: command.commandId,
          commandFingerprint: command.fingerprint,
          canonicalPayload: command.canonicalPayload,
          result,
        },
      ],
    },
    readFacts,
    input.sha256Hex,
  );
  return freeze({
    source: 'APPLIED',
    state: next,
    result,
    eventPayload: {
      schemaVersion: 'social-employment-service-event-v1',
      command: wire(command),
      readFacts,
      beforeStateHash: hash(state, input.sha256Hex),
      afterStateHash: hash(next, input.sha256Hex),
      result,
    },
  });
}

/** Registered by Root in the existing replay registry; not another runtime. */
export function reduceSocialEmploymentServiceEvent(input: {
  readonly state: SocialEmploymentServiceState;
  readonly event: ReplayReducerEvent;
  readonly sha256Hex: Sha256Hex;
}): SocialEmploymentServiceState {
  const r = inert(input.event.payload);
  keys(r, [
    'schemaVersion',
    'command',
    'readFacts',
    'beforeStateHash',
    'afterStateHash',
    'result',
  ]);
  if (r.schemaVersion !== 'social-employment-service-event-v1')
    invalid('Unsupported social event');
  const command = parseCanonicalCommand(r.command, input.sha256Hex),
    parsed = parseSocialEmploymentServiceCommand(command, input.sha256Hex);
  if (
    input.event.eventType !==
      (parsed.kind === 'PLAN'
        ? SOCIAL_SERVICE_PLAN_EVENT
        : SOCIAL_JOB_MATCH_EVENT) ||
    input.event.causationCommandId !== command.commandId ||
    input.event.transitionId !== command.commandId ||
    input.event.worldId !== command.worldId ||
    input.event.worldVersionBefore !== command.expectedWorldVersion ||
    input.event.worldVersionAfter !==
      (BigInt(command.expectedWorldVersion!) + 1n).toString() ||
    input.event.simTime.ticks !== command.simTime.ticks ||
    input.event.correctsEventId !== null
  )
    invalid('Event causation/version/type/SimTime mismatch');
  const readFacts = facts(r.readFacts as unknown as SocialEmploymentReadFacts);
  const state = validateSocialEmploymentServiceState(
    input.state,
    readFacts,
    input.sha256Hex,
  );
  if (hash(state, input.sha256Hex) !== sha(r.beforeStateHash))
    invalid('Replay predecessor state differs');
  const operation = prepareSocialEmploymentServiceOperation({
    command,
    state,
    readFacts,
    sha256Hex: input.sha256Hex,
  });
  if (
    operation.source !== 'APPLIED' ||
    canonicalSerialize(operation.eventPayload) !== canonicalSerialize(r)
  )
    invalid('Replay result/read facts differ from the real Core calculation');
  return operation.state;
}
export function createSocialEmploymentServiceReplayReducers(
  digest: Sha256Hex,
): Readonly<Record<string, ReplayReducer>> {
  const reducer: ReplayReducer = ({ state, event }) =>
    reduceSocialEmploymentServiceEvent({
      state: state as SocialEmploymentServiceState,
      event,
      sha256Hex: digest,
    });
  return Object.freeze({
    [SOCIAL_SERVICE_PLAN_EVENT]: reducer,
    [SOCIAL_JOB_MATCH_EVENT]: reducer,
    [SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT]: ({ state, event }) =>
      reduceSocialEmploymentServiceCreatedEvent({
        state: state as SocialEmploymentServiceState,
        event,
        sha256Hex: digest,
      }),
  });
}
