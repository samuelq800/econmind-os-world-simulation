import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  prepareSocialEmploymentServiceCreation,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseCanonicalCommand,
  prepareSocialEmploymentServiceOperation,
  type CanonicalCommand,
  type LabourSkill,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceCreationReadFacts,
  type SocialEmploymentServiceState,
} from '@econmind/core';
import { projectPostwarSocialServiceCreationPlanning } from '../../apps/world-worker/src/persistence/postwar-social-service-creation-originals.js';
import {
  assertSocialPhysicalAttemptEnvelope,
  assertSocialPhysicalCapacityState,
  type SocialPhysicalAttemptEnvelope,
} from '../../apps/world-worker/src/persistence/social-physical-attempt-envelope.js';

// Entirely synthetic local fixtures; no admitted source, actual staff or clock.
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const skills = ['LOW', 'MEDIUM', 'HIGH'] as const;
const countryId = 'COUNTRY_01',
  locationId = 'REGION_01_E1';
const at = '2026-10-25T00:00:00.000Z';
function plan(
  n = 1,
  skill: LabourSkill = 'HIGH',
  amount = '3',
  version = '0',
  day = '1',
  pool = `POOL_${skill}_D${day}`,
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: `PLAN_${n}`,
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'TRACE_TEST',
      countryId,
      worldId: 'WORLD_TEST_01',
      officeId: 'SOCIAL',
      expectedWorldVersion: version,
      idempotencyKey: `PLAN_IDEM_${n}`,
      simTime: '10000',
      submittedAtReal: at,
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId,
        skill,
        positionId: `POSITION_${skill}`,
        servicePoolId: pool,
        requestedMatches: amount,
        dueDayIndex: day,
      },
    },
    digest,
  );
}
function due(original: CanonicalCommand, version = '1', day = '1') {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_AUTOMATIC',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: `DUE_${original.commandId}`,
      commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
      correlationId: 'TRACE_TEST',
      countryId,
      worldId: 'WORLD_TEST_01',
      officeId: null,
      expectedWorldVersion: version,
      idempotencyKey: `IDEM_DUE_${original.commandId}`,
      simTime: '20000',
      submittedAtReal: at,
      payload: {
        schemaVersion: 'social-job-match-settlement-v1',
        planCommandId: original.commandId,
        planFingerprint: original.fingerprint,
        dueDayIndex: day,
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
      },
    },
    digest,
  );
}
function fixture(capacity = '6', vacancies = '6') {
  const populationAvailability = [
    { countryId, locationId, workingAgeAvailable: '24' },
  ];
  const labour = materializeOpeningLabourState({
    targets: skills.map((skill) => ({
      countryId,
      locationId,
      skill,
      count: '2',
    })),
    positions: skills.map((skill) => ({
      countryId,
      locationId,
      skill,
      positionId: `POSITION_${skill}`,
      requiredCount: (BigInt(vacancies) + 2n).toString(),
      sourceWeight: '1',
      owner: 'PRIVATE_SECTOR' as const,
      classificationId: 'SECTOR_FOOD',
      employerId: 'ENTITY_OPERATOR_01',
      employerRole: 'OP' as const,
      occupation: 'GENERAL' as const,
      wageAmount: '11',
      wageCurrency: 'XAA',
      wagePeriod: 'SIM_YEAR' as const,
      wageVersion: 'WAGE_TEST_V1',
      payrollFundingRef: 'TEST_PAYROLL_REF',
    })),
    populationAvailability,
    skillAvailability: skills.map((skill) => ({
      countryId,
      locationId,
      skill,
      count: '8',
    })),
    nonEmployedAggregates: skills.map((skill) => ({
      countryId,
      locationId,
      skill,
      status: 'UNEMPLOYED_SEARCHING' as const,
      count: '6',
    })),
    employers: [{ countryId, employerId: 'ENTITY_OPERATOR_01', role: 'OP' }],
  }).state;
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: 'WORLD_TEST_01',
    labour,
    servicePools: skills.map((skill) => ({
      poolId: `POOL_${skill}_D1`,
      countryId,
      locationId,
      skill,
      dayIndex: '1',
      ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
      capacitySlots: capacity,
      usedSlots: '0',
      reservedSlots: '0',
    })),
    plans: [],
    appliedOperations: [],
  };
  const facts = (
    skill: LabourSkill = 'HIGH',
    settlement = false,
    offerState: 'ACTIVE' | 'REVOKED' = 'ACTIVE',
  ): SocialEmploymentReadFacts => ({
    boundary: createE01DailyBoundary(settlement ? '1' : '0'),
    simTime: settlement ? '20000' : '10000',
    populationAvailability,
    offer: {
      countryId,
      locationId,
      skill,
      positionId: `POSITION_${skill}`,
      employerId: 'ENTITY_OPERATOR_01',
      employerRole: 'OP',
      legalPositionRef: 'TEST_LEGAL_POSITION',
      payrollFundingRef: 'TEST_PAYROLL_REF',
      offerVersion: 'OFFER_TEST_V1',
      state: offerState,
      wageVersion: 'WAGE_TEST_V1',
      amount: '11',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
    minimumWage: {
      countryId,
      ruleId: 'MIN_TEST',
      ruleVersion: 'MIN_TEST_V1',
      amount: '7',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
  });
  return { state, facts };
}
function envelope(version = '0', day = '1'): SocialPhysicalAttemptEnvelope {
  return {
    schemaVersion: 'social-physical-attempt-envelope-v1',
    worldId: 'WORLD_TEST_01',
    headWorldVersion: version,
    headEventSequence: version,
    ruleRevision: 'TEST_RULE_V1',
    sourceRevision: 'TEST_ORIGINAL_BODY_V1',
    validFromDayIndex: '0',
    validUntilDayIndex: '3',
    dayIndex: day,
    countryId,
    locationId,
    pools: skills.map((skill) => ({ poolId: `POOL_${skill}_D${day}`, skill })),
    stages: [
      {
        resourceKey: 'TEST_SHARED_STAGE',
        availableMinutes: '24',
        minutesPerOpportunity: { LOW: '2', MEDIUM: '3', HIGH: '4' },
      },
    ],
  };
}
const apply = (
  command: CanonicalCommand,
  state: SocialEmploymentServiceState,
  readFacts: SocialEmploymentReadFacts,
) =>
  prepareSocialEmploymentServiceOperation({
    command,
    state,
    readFacts,
    sha256Hex: digest,
  });
const assess = (
  command: CanonicalCommand,
  state: SocialEmploymentServiceState,
  readFacts: SocialEmploymentReadFacts,
  sourceEnvelope: unknown = envelope(command.expectedWorldVersion!),
) =>
  assertSocialPhysicalAttemptEnvelope({
    command,
    state,
    readFacts,
    sourceEnvelope,
    sha256Hex: digest,
  });

describe('daily physical preallocation — no persistence or source authority', () => {
  it('derives proposed full PLAN charge without mutating the input or dispatching work', () => {
    const f = fixture(),
      e = envelope(),
      before = JSON.stringify({ state: f.state, e });
    const r = assess(plan(), f.state, f.facts(), e);
    expect(r.stages[0]).toMatchObject({
      chargedBefore: '0',
      chargedAfter: '12',
      remaining: '12',
    });
    expect(r.lanes.find((l) => l.skill === 'HIGH')).toMatchObject({
      chargedAfter: '3',
      remaining: '3',
    });
    expect(r.sourceAdmitted).toBe(false);
    expect(r.runtimeReady).toBe(false);
    expect(JSON.stringify({ state: f.state, e })).toBe(before);
    expect(Object.isFrozen(e)).toBe(false);
    expect(Object.isFrozen(r.stages[0])).toBe(true);
    expect(assess(plan(), f.state, f.facts(), e)).toEqual(r);
  });
  it.each(['0', '1', '3'])(
    'keeps all3 requested opportunities when MATCH succeeds for%s',
    (matched) => {
      const f = fixture('6', matched === '1' ? '1' : '6'),
        p = plan();
      const pending = apply(p, f.state, f.facts()).state;
      const facts = f.facts(
        'HIGH',
        true,
        matched === '0' ? 'REVOKED' : 'ACTIVE',
      );
      const r = assess(due(p), pending, facts, envelope('1'));
      expect(r.stages[0]).toMatchObject({
        chargedBefore: '12',
        chargedAfter: '12',
      });
      const settled = apply(due(p), pending, facts);
      expect(settled.result.matched).toBe(matched);
      expect(
        settled.state.servicePools.find((p) => p.skill === 'HIGH')
          ?.reservedSlots,
      ).toBe('0');
      expect(
        settled.state.servicePools.find((p) => p.skill === 'HIGH')?.usedSlots,
      ).toBe(matched);
    },
  );
  it.each(['0', '1'])(
    'rejects new PLAN reusing returned reservation after%s successes',
    (matched) => {
      const f = fixture('6', matched === '1' ? '1' : '6'),
        p = plan();
      const pending = apply(p, f.state, f.facts()).state;
      const settled = apply(
        due(p),
        pending,
        f.facts('HIGH', true, matched === '0' ? 'REVOKED' : 'ACTIVE'),
      ).state;
      const next = plan(2, 'HIGH', '4', '2');
      // The old V1 free-slot check permits this; the new derived constraint must not.
      expect(apply(next, settled, f.facts()).source).toBe('APPLIED');
      const bytes = JSON.stringify(settled);
      expect(() => assess(next, settled, f.facts(), envelope('2'))).toThrow(
        'PHYSICAL_LANE_EXHAUSTED',
      );
      expect(JSON.stringify(settled)).toBe(bytes);
    },
  );
  it('shares a stage budget across HIGH, LOW and MEDIUM, not one budget per lane', () => {
    const f = fixture('9');
    const s1 = apply(plan(), f.state, f.facts()).state;
    const s2 = apply(plan(2, 'LOW', '3', '1'), s1, f.facts('LOW')).state;
    const p = plan(3, 'MEDIUM', '3', '2');
    expect(apply(p, s2, f.facts('MEDIUM')).source).toBe('APPLIED');
    expect(() => assess(p, s2, f.facts('MEDIUM'), envelope('2'))).toThrow(
      'SHARED_PHYSICAL_STAGE_EXHAUSTED',
    );
  });
  it('an exact duplicate adds0, not a new execution permit', () => {
    const f = fixture(),
      p = plan(),
      s = apply(p, f.state, f.facts()).state;
    const r = assess(p, s, f.facts(), envelope('1'));
    expect(r.operationSource).toBe('EXACT_DUPLICATE');
    expect(r.stages[0]).toMatchObject({
      chargedBefore: '12',
      chargedAfter: '12',
    });
    expect(r.status).toBe('DERIVED_FEASIBILITY_ONLY_NOT_SOURCE_AUTHORITY');
  });
  it('changed fingerprint under a previously used commandID rejects', () => {
    const f = fixture(),
      s = apply(plan(), f.state, f.facts()).state;
    expect(() =>
      assess(plan(1, 'HIGH', '2'), s, f.facts(), envelope('1')),
    ).toThrow();
  });
  it('a later-day sourced pool does not erase the original due-day preallocation', () => {
    const f = fixture(),
      s = apply(plan(), f.state, f.facts()).state;
    const both = {
      ...s,
      servicePools: [
        ...s.servicePools,
        ...f.state.servicePools.map((p) => ({
          ...p,
          poolId: p.poolId.replace('_D1', '_D2'),
          dayIndex: '2',
        })),
      ],
    };
    const r = assess(
      plan(2, 'HIGH', '3', '1', '2'),
      both,
      f.facts(),
      envelope('1', '2'),
    );
    expect(r.stages[0]).toMatchObject({
      chargedBefore: '0',
      chargedAfter: '12',
    });
    expect(
      assess(plan(), both, f.facts(), envelope('1')).stages[0]?.chargedBefore,
    ).toBe('12');
  });
  it('rejects unexplained initial successful use rather than fabricating history0', () => {
    const f = fixture(),
      s = {
        ...f.state,
        servicePools: f.state.servicePools.map((p) => ({
          ...p,
          usedSlots: '1',
        })),
      };
    expect(() => assess(plan(), s, f.facts())).toThrow(
      'UNEXPLAINED_INITIAL_USE',
    );
  });
  it('missing a committed PLAN is not an admissible history truncation', () => {
    const f = fixture(),
      s = apply(plan(), f.state, f.facts()).state;
    expect(() =>
      assess(plan(2, 'HIGH', '1', '1'), { ...s, plans: [] }, f.facts()),
    ).toThrow();
  });
  it('binds current head for fresh effects but does not claim event-head authenticity', () => {
    const f = fixture();
    expect(() => assess(plan(), f.state, f.facts(), envelope('1'))).toThrow(
      'HEAD_VERSION_MISMATCH',
    );
    const e = { ...envelope(), headEventSequence: '900' };
    expect(
      assess(plan(), f.state, f.facts(), e).checkedFor.headEventSequence,
    ).toBe('900');
  });
  it('hashes original body independently of current audit head; G must authenticate it', () => {
    const f = fixture(),
      p = plan(),
      s = apply(p, f.state, f.facts()).state;
    const a = assess(p, s, f.facts(), envelope('1'));
    const b = assess(p, s, f.facts(), {
      ...envelope('2'),
      headEventSequence: '9',
    });
    expect(a.immutableBodyHash).toBe(b.immutableBodyHash);
    for (const e of [
      { ...envelope('1'), sourceRevision: 'TEST_REPRICE_V2' },
      {
        ...envelope('1'),
        stages: [{ ...envelope().stages[0]!, availableMinutes: '25' }],
      },
      {
        ...envelope('1'),
        stages: [{ ...envelope().stages[0]!, resourceKey: 'RENAMED_STAGE' }],
      },
      {
        ...envelope('1'),
        stages: [
          {
            ...envelope().stages[0]!,
            minutesPerOpportunity: { LOW: '1', MEDIUM: '1', HIGH: '1' },
          },
        ],
      },
    ])
      expect(assess(p, s, f.facts(), e).immutableBodyHash).not.toBe(
        a.immutableBodyHash,
      );
    // Hash difference is diagnostic, not an implemented durable source-binding guard.
  });
  it('sums integer products above IEEE exact range using BigInt', () => {
    const f = fixture(),
      e = envelope();
    const cost = '9007199254740993',
      available = (3n * BigInt(cost)).toString();
    const r = assess(plan(), f.state, f.facts(), {
      ...e,
      stages: [
        {
          resourceKey: 'BIG_STAGE',
          availableMinutes: available,
          minutesPerOpportunity: { LOW: '1', MEDIUM: '1', HIGH: cost },
        },
      ],
    });
    expect(r.stages[0]?.chargedAfter).toBe('27021597764222979');
    expect(r.stages[0]?.remaining).toBe('0');
  });
  it.each([
    ['no stages', (e: SocialPhysicalAttemptEnvelope) => ({ ...e, stages: [] })],
    [
      '65 stages',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        stages: Array.from({ length: 65 }, (_, n) => ({
          ...e.stages[0]!,
          resourceKey: `S_${n}`,
        })),
      }),
    ],
    [
      'duplicate resource',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        stages: [e.stages[0], e.stages[0]],
      }),
    ],
    [
      'missing lane',
      (e: SocialPhysicalAttemptEnvelope) => ({ ...e, pools: e.pools.slice(1) }),
    ],
    [
      'duplicate skill',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        pools: [e.pools[0], e.pools[0], e.pools[2]],
      }),
    ],
    [
      'wrong lane ID',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        pools: e.pools.map((p) => ({ ...p, poolId: `OTHER_${p.skill}` })),
      }),
    ],
    [
      'zero per-op minutes',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        stages: [
          {
            ...e.stages[0]!,
            minutesPerOpportunity: { LOW: '2', MEDIUM: '3', HIGH: '0' },
          },
        ],
      }),
    ],
    [
      'negative budget',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        stages: [{ ...e.stages[0]!, availableMinutes: '-1' }],
      }),
    ],
    [
      'numeric budget',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        stages: [{ ...e.stages[0]!, availableMinutes: 24 }],
      }),
    ],
    [
      '121digits',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        headEventSequence: '1'.repeat(121),
      }),
    ],
    [
      'unknown field',
      (e: SocialPhysicalAttemptEnvelope) => ({ ...e, admitted: true }),
    ],
    [
      'unknown recipe field',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        stages: [{ ...e.stages[0]!, extra: true }],
      }),
    ],
    [
      'outside half-open end',
      (e: SocialPhysicalAttemptEnvelope) => ({ ...e, validUntilDayIndex: '1' }),
    ],
    [
      'wrong due-day',
      (e: SocialPhysicalAttemptEnvelope) => ({ ...e, dayIndex: '2' }),
    ],
    [
      'foreign World',
      (e: SocialPhysicalAttemptEnvelope) => ({
        ...e,
        worldId: 'WORLD_FOREIGN',
      }),
    ],
    [
      'foreign country',
      (e: SocialPhysicalAttemptEnvelope) => ({ ...e, countryId: 'COUNTRY_02' }),
    ],
  ])('rejects %s', (_label, mutate) => {
    const f = fixture();
    expect(() =>
      assess(plan(), f.state, f.facts(), mutate(envelope())),
    ).toThrow();
  });
  it('rejects accessor fields without invoking them', () => {
    let invoked = 0;
    const e = { ...envelope() };
    Object.defineProperty(e, 'stages', {
      get() {
        invoked++;
        return [];
      },
      enumerable: true,
    });
    const f = fixture();
    expect(() => assess(plan(), f.state, f.facts(), e)).toThrow(
      'DATA_FIELDS_ONLY',
    );
    expect(invoked).toBe(0);
  });
  it('rejects sparse or accessor arrays and class-bearing records', () => {
    const f = fixture(),
      sparse = Array(3);
    expect(() =>
      assess(plan(), f.state, f.facts(), { ...envelope(), pools: sparse }),
    ).toThrow();
    const e = envelope(),
      pools = [...e.pools];
    let invoked = 0;
    Object.defineProperty(pools, '0', {
      get() {
        invoked++;
        return e.pools[0];
      },
      enumerable: true,
    });
    expect(() => assess(plan(), f.state, f.facts(), { ...e, pools })).toThrow();
    expect(invoked).toBe(0);
    expect(() =>
      assess(plan(), f.state, f.facts(), Object.create(e)),
    ).toThrow();
  });
  it('rejects extra same-scope pool even with another skill label/ID', () => {
    const f = fixture(),
      s = {
        ...f.state,
        servicePools: [
          ...f.state.servicePools,
          { ...f.state.servicePools[0]!, poolId: 'ALIAS_POOL' },
        ],
      };
    expect(() => assess(plan(), s, f.facts())).toThrow('ALIASED_POOL_SCOPE');
  });
  it('rejects a complete history larger than10000 without truncation', () => {
    const f = fixture(),
      s = { ...f.state, plans: Array(10001).fill(null) };
    expect(() => assess(plan(), s, f.facts())).toThrow('COLLECTION_BOUND');
  });
  it('Core validation failure leaves all inputs unchanged', () => {
    const f = fixture(),
      before = JSON.stringify(f.state);
    expect(() =>
      assess(plan(), f.state, f.facts('HIGH', false, 'REVOKED')),
    ).toThrow();
    expect(JSON.stringify(f.state)).toBe(before);
  });
});

// Actual Core operations over explicit TEST_ONLY DATA; no admitted source or
// SQL/actor/Clock authority is supplied by these feasibility checks.
describe('programme child pools retain the original physical desk', () => {
  function createdDesk() {
    const f = fixture('10', '2');
    const state = {
      ...f.state,
      servicePools: f.state.servicePools.map((p) => ({
        ...p,
        poolId: p.poolId.replace('_D1', '_D0'),
        dayIndex: '0',
      })),
    };
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        worldId: state.worldId,
        countryId,
        officeId: 'SOCIAL',
        actorId: 'ACTOR_SOCIAL',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'CREATE_TEST_ONLY_PROGRAMME',
        commandType: SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
        correlationId: 'TRACE_TEST',
        expectedWorldVersion: '0',
        idempotencyKey: 'CREATE_TEST_ONLY_PROGRAMME',
        simTime: '10000',
        submittedAtReal: at,
        payload: {
          schemaVersion: 'social-employment-service-create-v1',
          programmeId: 'PROGRAMME_TEST_ONLY',
          capacity: { amount: '4', unit: 'person' },
          budget: { amount: '0', currency: 'XAA' },
          target: { servicePoolId: 'POOL_HIGH_D0', locationId, skill: 'HIGH' },
        },
      },
      digest,
    );
    const creationFacts: SocialEmploymentServiceCreationReadFacts = {
      boundary: createE01DailyBoundary('0'),
      simTime: '10000',
      populationAvailability: f.facts().populationAvailability,
      worldId: state.worldId,
      head: { worldVersion: '0', eventSequence: '0' },
      countryId,
      governmentEntityId: 'ENTITY_GOVERNMENT_01',
      localCurrency: 'XAA',
      sourceRef: 'SOURCE_TEST_ONLY',
      sourceFingerprint: `sha256:${'1'.repeat(64)}`,
      sourceRevocations: [],
      usageLicence: {
        licenseId: 'LICENCE_TEST_ONLY',
        licensorEntityId: 'ENTITY_OPERATOR_01',
        beneficiaryEntityId: 'ENTITY_GOVERNMENT_01',
        locationId,
        validFromDayIndex: '0',
        validUntilDayIndex: '1',
        dutyAssignmentIds: ['DUTY_TEST_ONLY_INTAKE', 'DUTY_TEST_ONLY_VERIFY'],
        maximumWorkerMinutes: '960',
        scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER',
        state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE',
        additionalFeeAmount: '0',
        futurePaymentCondition:
          'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT',
      },
    };
    const result = prepareSocialEmploymentServiceCreation({
      command,
      state,
      sha256Hex: digest,
      readFacts: creationFacts,
    });
    // This envelope is DATA, not a claimed real staff licence.
    const body = (version: string) => ({
      ...envelope(version, '0'),
      stages: [
        {
          resourceKey: 'TEST_SHARED_STAGE',
          availableMinutes: '100',
          minutesPerOpportunity: { LOW: '2', MEDIUM: '3', HIGH: '4' },
        },
      ],
    });
    return {
      ...f,
      before: state,
      created: result.state,
      child: result.result.servicePoolId,
      creationFacts,
      body,
    };
  }
  function planningFixture() {
    const f = createdDesk();
    const document = {
      inputs: {
        worldId: f.before.worldId,
        fundingAccounts: [
          {
            countryId,
            payerEntityId: 'ENTITY_GOVERNMENT_01',
            payerRole: 'GOV' as const,
            currency: 'XAA',
          },
        ],
      },
      countries: [
        {
          countryId,
          minimumWage: f.facts().minimumWage,
          validationReadFacts: {
            classification: 'VALIDATION_ONLY_NOT_ACTIVE_OFFER' as const,
            facts: f.facts(),
          },
          npcUsageLicenses: [
            {
              ...f.creationFacts.usageLicence,
              validFromDayIndex: '0' as const,
              validUntilDayIndex: '1' as const,
            },
          ],
          physicalDayBodies: [f.body('0')],
        },
      ],
    };
    const input = {
      document,
      source: {
        sourceId: 'SOURCE_TEST_ONLY',
        payloadHash: f.creationFacts.sourceFingerprint,
      },
      countryId,
      state: f.created,
      head: { worldVersion: '1', eventSequence: '1' },
      simTime: '10000',
      servicePoolIds: ['POOL_HIGH_D0', f.child],
      sha256Hex: digest,
    };
    return { f, input };
  }
  it('projects only the requested current page with the original licence/LC and already-partitioned root capacity', () => {
    const { f, input } = planningFixture();
    const pending = apply(
      plan(110, 'HIGH', '2', '1', '0'),
      f.created,
      f.facts(),
    ).state;
    const data = projectPostwarSocialServiceCreationPlanning({
      ...input,
      state: pending,
    });
    expect(data.rootTargets).toEqual([
      {
        poolId: 'POOL_HIGH_D0',
        locationId,
        skill: 'HIGH',
        dayIndex: '0',
        capacitySlots: '6',
        usedSlots: '0',
        reservedSlots: '2',
        actualUnemployedCount: '6',
      },
    ]);
    expect(data.usageLicences).toEqual([f.creationFacts.usageLicence]);
    expect(data.localCurrency).toBe('XAA');
    expect(data.creations).toEqual([
      {
        programmeId: 'PROGRAMME_TEST_ONLY',
        parentPoolId: 'POOL_HIGH_D0',
        childPoolId: f.child,
        capacitySlots: '4',
      },
    ]);
    const childOnly = projectPostwarSocialServiceCreationPlanning({
      ...input,
      servicePoolIds: [f.child],
    });
    expect(childOnly.rootTargets).toEqual([]);
    expect(childOnly.creations).toEqual(data.creations);
  });
  it('keeps a true absent licence distinct from a failed source, and rejects unknown page scope or expired day', () => {
    const { input } = planningFixture();
    const noLicence = {
      ...input.document,
      countries: input.document.countries.map((c) => ({
        ...c,
        npcUsageLicenses: [],
      })),
    };
    expect(
      projectPostwarSocialServiceCreationPlanning({
        ...input,
        document: noLicence,
      }).usageLicences,
    ).toEqual([]);
    for (const servicePoolIds of [
      ['POOL_FOREIGN'],
      ['POOL_HIGH_D0', 'POOL_HIGH_D0'],
      Array.from({ length: 101 }, (_, n) => 'POOL_' + n),
    ])
      expect(() =>
        projectPostwarSocialServiceCreationPlanning({
          ...input,
          servicePoolIds,
        }),
      ).toThrow('EXACT_CURRENT_PAGE_SERVICE_POOL_IDS_REQUIRED');
    expect(() =>
      projectPostwarSocialServiceCreationPlanning({
        ...input,
        simTime: '86400000',
      }),
    ).toThrow('ACTUAL_T0_PLANNING_COUNTRY_REQUIRED');
    expect(() =>
      projectPostwarSocialServiceCreationPlanning({
        ...input,
        countryId: 'COUNTRY_02',
      }),
    ).toThrow('ACTUAL_T0_PLANNING_COUNTRY_REQUIRED');
    expect(() =>
      projectPostwarSocialServiceCreationPlanning({
        ...input,
        source: { ...input.source, payloadHash: 'sha256:invalid' },
      }),
    ).toThrow('ACTUAL_OPERATING_SOURCE_FINGERPRINT_REQUIRED');
  });
  it('partitions ten slots without increasing the physical lane or issuing work', () => {
    const f = createdDesk();
    const read = (state: SocialEmploymentServiceState) =>
      assertSocialPhysicalCapacityState({
        state,
        readFacts: f.facts(),
        sourceEnvelope: f.body('1'),
        sha256Hex: digest,
      });
    expect(read(f.created)).toEqual(read(f.before));
    expect(read(f.created).lanes.find((l) => l.skill === 'HIGH')).toMatchObject(
      {
        capacity: '10',
        charged: '0',
        poolId: 'POOL_HIGH_D0',
      },
    );
    expect(f.created.labour).toEqual(f.before.labour);
  });
  it('charges parent and programme PLANs to the same root desk', () => {
    const f = createdDesk(),
      childPlan = plan(101, 'HIGH', '4', '1', '0', f.child);
    const first = assess(childPlan, f.created, f.facts(), f.body('1'));
    expect(first.lanes.find((l) => l.skill === 'HIGH')).toMatchObject({
      capacity: '10',
      chargedAfter: '4',
    });
    const pending = apply(childPlan, f.created, f.facts()).state;
    const rootPlan = plan(102, 'HIGH', '6', '2', '0');
    expect(
      assess(rootPlan, pending, f.facts(), f.body('2')).lanes.find(
        (l) => l.skill === 'HIGH',
      ),
    ).toMatchObject({
      capacity: '10',
      chargedBefore: '4',
      chargedAfter: '10',
      remaining: '0',
    });
  });
  it('retains child attempts after partial MATCH and prevents capacity laundering via the parent', () => {
    const f = createdDesk(),
      childPlan = plan(103, 'HIGH', '4', '1', '0', f.child);
    const pending = apply(childPlan, f.created, f.facts()).state;
    const match = due(childPlan, '2', '0');
    const matchFacts = { ...f.facts(), simTime: '20000' };
    expect(
      assess(match, pending, matchFacts, f.body('2')).lanes.find(
        (l) => l.skill === 'HIGH',
      ),
    ).toMatchObject({ chargedBefore: '4', chargedAfter: '4' });
    const settled = apply(match, pending, matchFacts);
    expect(settled.result.matched).toBe('2');
    const rootPlan = plan(104, 'HIGH', '6', '3', '0');
    const full = apply(rootPlan, settled.state, f.facts()).state;
    const extra = plan(105, 'HIGH', '1', '4', '0', f.child);
    expect(apply(extra, full, f.facts()).source).toBe('APPLIED');
    expect(() => assess(extra, full, f.facts(), f.body('4'))).toThrow(
      'PHYSICAL_LANE_EXHAUSTED',
    );
  });
  it('rejects relabeling a physical original with the child pool ID', () => {
    const f = createdDesk(),
      body = f.body('1');
    expect(() =>
      assertSocialPhysicalCapacityState({
        state: f.created,
        readFacts: f.facts(),
        sourceEnvelope: {
          ...body,
          pools: body.pools.map((p) =>
            p.skill === 'HIGH' ? { ...p, poolId: f.child } : p,
          ),
        },
        sha256Hex: digest,
      }),
    ).toThrow('INCOMPLETE_OR_ALIASED_POOL_SCOPE');
  });
});
