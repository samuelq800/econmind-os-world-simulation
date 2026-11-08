/** Pure genuine Core calculations over explicit TEST_ONLY source DATA. No
 * official source admission, SQL licence/auth locks, Actor authority or commit
 * protection is fabricated or certified by this file. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  canonicalSerialize,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseCanonicalCommand,
  SimTime,
  eventId,
  eventType,
  type CanonicalCommand,
  type ReplayReducerEvent,
} from '../../packages/core/src/index.js';
import {
  SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  prepareSocialEmploymentServiceCreation,
  prepareSocialEmploymentServiceOperation,
  reduceSocialEmploymentServiceCreatedEvent,
  resolveSocialEmploymentPhysicalServicePool,
  validateSocialEmploymentServiceState,
  type SocialEmploymentServiceState,
  type SocialEmploymentServiceCreationReadFacts,
  type SocialEmploymentReadFacts,
} from '../../packages/core/src/commands/social-employment-service.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const country = 'COUNTRY_01',
  location = 'REGION_01_E1',
  poolId = 'POOL_TEST_ONLY_DESK';
function fixture() {
  const populationAvailability = [
    { countryId: country, locationId: location, workingAgeAvailable: '22' },
  ];
  const scope = {
    countryId: country,
    locationId: location,
    skill: 'LOW' as const,
  };
  const labour = materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    positions: [
      {
        ...scope,
        positionId: 'POSITION_TEST_ONLY',
        requiredCount: '22',
        sourceWeight: '1',
        owner: 'PRIVATE_SECTOR',
        classificationId: 'SECTOR_TEST_ONLY',
        employerId: 'ENTITY_OPERATOR_01',
        employerRole: 'OP',
        occupation: 'GENERAL',
        wageAmount: '2',
        wageCurrency: 'XAA',
        wagePeriod: 'SIM_HOUR',
        wageVersion: 'WAGE_TEST_ONLY',
        payrollFundingRef: 'PAYROLL_TEST_ONLY',
      },
    ],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '22' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '20' },
    ],
    employers: [
      { countryId: country, employerId: 'ENTITY_OPERATOR_01', role: 'OP' },
    ],
  }).state;
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: 'WORLD_TEST_ONLY_CREATION',
    labour,
    servicePools: [
      {
        ...scope,
        poolId,
        dayIndex: '0',
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '10',
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const population = {
    boundary: createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability,
  };
  const creationFacts: SocialEmploymentServiceCreationReadFacts = {
    ...population,
    worldId: state.worldId,
    head: { worldVersion: '0', eventSequence: '0' },
    countryId: country,
    governmentEntityId: 'ENTITY_GOVERNMENT_01',
    localCurrency: 'XAA',
    sourceRef: 'SOURCE_TEST_ONLY_CREATION',
    sourceFingerprint: 'sha256:' + '1'.repeat(64),
    sourceRevocations: [],
    usageLicence: {
      licenseId: 'LICENCE_TEST_ONLY_PUBLIC_REFERRAL',
      licensorEntityId: 'ENTITY_OPERATOR_01',
      beneficiaryEntityId: 'ENTITY_GOVERNMENT_01',
      locationId: location,
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
      dutyAssignmentIds: ['DUTY_TEST_ONLY_INTAKE', 'DUTY_TEST_ONLY_VERIFY'],
      maximumWorkerMinutes: '480',
      scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER',
      state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE',
      additionalFeeAmount: '0',
      futurePaymentCondition:
        'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT',
    },
  };
  const facts: SocialEmploymentReadFacts = {
    ...population,
    offer: {
      ...scope,
      positionId: 'POSITION_TEST_ONLY',
      employerId: 'ENTITY_OPERATOR_01',
      employerRole: 'OP',
      legalPositionRef: 'LEGAL_TEST_ONLY',
      payrollFundingRef: 'PAYROLL_TEST_ONLY',
      offerVersion: 'OFFER_TEST_ONLY',
      state: 'ACTIVE',
      wageVersion: 'WAGE_TEST_ONLY',
      amount: '2',
      currency: 'XAA',
      period: 'SIM_HOUR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    minimumWage: {
      countryId: country,
      ruleId: 'MIN_TEST_ONLY',
      ruleVersion: 'MIN_TEST_ONLY_V1',
      amount: '1',
      currency: 'XAA',
      period: 'SIM_HOUR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  return { state, creationFacts, facts };
}
function command(
  id: string,
  type: string,
  version: string,
  payload: unknown,
  change: Record<string, unknown> = {},
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: 'WORLD_TEST_ONLY_CREATION',
      countryId: country,
      officeId: 'SOCIAL',
      actorId: 'ACTOR_TEST_ONLY_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: id,
      idempotencyKey: id,
      commandType: type,
      expectedWorldVersion: version,
      simTime: '10000',
      submittedAtReal: '2026-11-08T00:00:00.000Z',
      correlationId: 'TRACE_TEST_ONLY',
      payload,
      ...change,
    },
    sha,
  );
}
function create(
  capacity = '4',
  id = 'CREATE_TEST_ONLY_A',
  parent = poolId,
  version = '0',
) {
  return command(id, SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND, version, {
    schemaVersion: 'social-employment-service-create-v1',
    programmeId: id,
    capacity: { amount: capacity, unit: 'person' },
    budget: { amount: '0', currency: 'XAA' },
    target: { servicePoolId: parent, locationId: location, skill: 'LOW' },
  });
}
function plan(pool: string, amount: string, id: string, version = '1') {
  return command(id, SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND, version, {
    schemaVersion: 'social-employment-service-plan-v1',
    locationId: location,
    skill: 'LOW',
    positionId: 'POSITION_TEST_ONLY',
    servicePoolId: pool,
    requestedMatches: amount,
    dueDayIndex: '0',
  });
}
const allocate = (
  c: CanonicalCommand,
  state: SocialEmploymentServiceState,
  f: SocialEmploymentReadFacts,
) =>
  prepareSocialEmploymentServiceOperation({
    command: c,
    state,
    readFacts: f,
    sha256Hex: sha,
  });
const birth = (
  c: CanonicalCommand,
  state: SocialEmploymentServiceState,
  f: SocialEmploymentServiceCreationReadFacts,
) =>
  prepareSocialEmploymentServiceCreation({
    command: c,
    state,
    readFacts: f,
    sha256Hex: sha,
  });

describe('first-day service programme partitions one existing lawful desk', () => {
  it('preserves old shape, partitions capacity once, and maps the child to its real original pool', () => {
    const f = fixture();
    expect(
      Object.hasOwn(
        validateSocialEmploymentServiceState(f.state, f.facts, sha),
        'creations',
      ),
    ).toBe(false);
    const result = birth(create(), f.state, f.creationFacts);
    expect(result.result.classification).toBe(
      'CAPACITY_PARTITION_NOT_WORK_MATCH_OR_PAYMENT',
    );
    expect(
      result.state.servicePools
        .map((p) => BigInt(p.capacitySlots))
        .reduce((a, b) => a + b),
    ).toBe(10n);
    expect(
      result.state.servicePools.find((p) => p.poolId === poolId),
    ).toMatchObject({ capacitySlots: '6', usedSlots: '0', reservedSlots: '0' });
    expect(result.state.labour).toEqual(f.state.labour);
    expect(
      resolveSocialEmploymentPhysicalServicePool(
        result.state,
        result.result.servicePoolId,
        sha,
      ),
    ).toBe(poolId);
    const duplicate = birth(create(), result.state, f.creationFacts);
    expect(duplicate.source).toBe('EXACT_DUPLICATE');
    expect(duplicate.eventPayload).toBe(null);
    expect(duplicate.state).toEqual(result.state);
    expect(() => birth(create('3'), result.state, f.creationFacts)).toThrow(
      'idempotency',
    );
  });
  it('makes old and programme PLAN/MATCH compete for the same ten slots without changing payroll or headcounts on creation', () => {
    const f = fixture(),
      created = birth(create(), f.state, f.creationFacts),
      child = created.result.servicePoolId;
    expect(() =>
      allocate(plan(poolId, '7', 'PLAN_TOO_MANY'), created.state, f.facts),
    ).toThrow('insufficient');
    const oldPlan = plan(poolId, '6', 'PLAN_PARENT'),
      newPlan = plan(child, '4', 'PLAN_CHILD', '2');
    const one = allocate(oldPlan, created.state, f.facts),
      two = allocate(newPlan, one.state, f.facts);
    expect(() =>
      allocate(plan(child, '1', 'PLAN_CHILD_EXTRA'), two.state, f.facts),
    ).toThrow('insufficient');
    const match = (
      original: CanonicalCommand,
      state: SocialEmploymentServiceState,
      id: string,
    ) =>
      allocate(
        command(
          id,
          SOCIAL_JOB_MATCH_DUE_COMMAND,
          '3',
          {
            schemaVersion: 'social-job-match-settlement-v1',
            planCommandId: original.commandId,
            planFingerprint: original.fingerprint,
            dueDayIndex: '0',
            ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
          },
          { officeId: null, simTime: '20000' },
        ),
        state,
        { ...f.facts, simTime: '20000' },
      );
    const a = match(oldPlan, two.state, 'MATCH_PARENT'),
      b = match(newPlan, a.state, 'MATCH_CHILD');
    expect(BigInt(a.result.matched) + BigInt(b.result.matched)).toBe(10n);
    expect(
      b.state.servicePools.reduce((n, p) => n + BigInt(p.usedSlots), 0n),
    ).toBe(10n);
    expect(b.state.servicePools.every((p) => p.reservedSlots === '0')).toBe(
      true,
    );
  });
  it('leaves already-reserved old PLAN capacity intact and rejects nested or excessive splits', () => {
    const f = fixture(),
      pending = allocate(
        plan(poolId, '7', 'EXISTING_PLAN', '0'),
        f.state,
        f.facts,
      );
    expect(() => birth(create('4'), pending.state, f.creationFacts)).toThrow(
      'already allocated',
    );
    const created = birth(create('3'), pending.state, f.creationFacts);
    expect(
      created.state.servicePools.find((p) => p.poolId === poolId),
    ).toMatchObject({ capacitySlots: '7', reservedSlots: '7' });
    expect(() =>
      birth(
        create('1', 'NESTED', created.result.servicePoolId, '1'),
        created.state,
        { ...f.creationFacts, head: { worldVersion: '1', eventSequence: '1' } },
      ),
    ).toThrow('nested');
  });
  it('replays the actual calculated creation and rejects tampered effects or sequence', () => {
    const f = fixture(),
      c = create(),
      result = birth(c, f.state, f.creationFacts);
    const event: ReplayReducerEvent = {
      transitionId: c.commandId,
      worldId: c.worldId,
      eventId: eventId('EVENT_TEST_ONLY_CREATE'),
      causationCommandId: c.commandId,
      correctsEventId: null,
      eventType: eventType(SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT),
      sequence: '1',
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: c.simTime,
      payload: result.eventPayload,
    };
    expect(
      reduceSocialEmploymentServiceCreatedEvent({
        state: f.state,
        event,
        sha256Hex: sha,
      }),
    ).toEqual(result.state);
    expect(() =>
      reduceSocialEmploymentServiceCreatedEvent({
        state: f.state,
        event: { ...event, sequence: '2' },
        sha256Hex: sha,
      }),
    ).toThrow();
    const payload = JSON.parse(canonicalSerialize(result.eventPayload));
    payload.result.capacitySlots = '5';
    expect(() =>
      reduceSocialEmploymentServiceCreatedEvent({
        state: f.state,
        event: { ...event, payload },
        sha256Hex: sha,
      }),
    ).toThrow();
  });
  it('requires a current unrevoked actual no-fee licence and rejects purchases, currency substitution and invented targets', () => {
    const f = fixture(),
      c = create();
    for (const patch of [
      { worldId: 'WORLD_OTHER' },
      { countryId: 'COUNTRY_02' },
      { head: { worldVersion: '1', eventSequence: '0' } },
      { localCurrency: 'GCU' },
      {
        sourceRevocations: [
          {
            sourceRef: f.creationFacts.sourceRef,
            revocationRef: 'REVOKED_TEST_ONLY',
          },
        ],
      },
      {
        usageLicence: {
          ...f.creationFacts.usageLicence,
          additionalFeeAmount: '1',
        },
      },
      {
        usageLicence: {
          ...f.creationFacts.usageLicence,
          validUntilDayIndex: '2',
        },
      },
      {
        usageLicence: {
          ...f.creationFacts.usageLicence,
          dutyAssignmentIds: [],
        },
      },
    ])
      expect(() =>
        birth(c, f.state, {
          ...f.creationFacts,
          ...patch,
        } as SocialEmploymentServiceCreationReadFacts),
      ).toThrow();
    const payload = JSON.parse(c.canonicalPayload);
    payload.budget.amount = '1';
    expect(() =>
      birth(
        command(
          'POSITIVE_BUDGET',
          SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
          '0',
          payload,
        ),
        f.state,
        f.creationFacts,
      ),
    ).toThrow('purchase');
    const expired = command(
      'EXPIRED',
      SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
      '0',
      JSON.parse(c.canonicalPayload),
      { simTime: '86400000' },
    );
    expect(() =>
      birth(expired, f.state, {
        ...f.creationFacts,
        boundary: createE01DailyBoundary('1'),
        simTime: SimTime.fromTicks('86400000').toCanonicalValue(),
      }),
    ).toThrow('first-day');
    const noTarget = {
      ...f.state,
      labour: {
        ...f.state.labour,
        aggregates: f.state.labour.aggregates.filter(
          (a) => a.status !== 'UNEMPLOYED_SEARCHING',
        ),
      },
    };
    expect(() => birth(c, noTarget, f.creationFacts)).toThrow();
  });
});
