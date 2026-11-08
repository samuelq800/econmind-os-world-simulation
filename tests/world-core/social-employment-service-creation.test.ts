/** Pure genuine Core calculations over explicit TEST_ONLY source DATA. No
 * official source admission, SQL licence/auth locks, Actor authority or commit
 * protection is fabricated or certified by this file. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
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
    sourceFingerprint: `sha256:${'1'.repeat(64)}`,
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

import {
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
function canonicalFrame(
  c: CanonicalCommand,
  eventType: string,
  eventPayload: unknown,
  sequence: string,
): FinanceNativeBudgetCanonicalFrame {
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_' + c.commandId,
      eventType,
      worldId: c.worldId,
      causationCommandId: c.commandId,
      correlationId: c.correlationId,
      worldVersion: (BigInt(c.expectedWorldVersion!) + 1n).toString(),
      sequence,
      simTime: c.simTime.toCanonicalValue(),
      recordedAtReal: '2026-11-08T00:00:00.000Z',
      correctsEventId: null,
      payload: eventPayload,
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command: c,
    worldVersionBefore: c.expectedWorldVersion!,
    worldVersionAfter: event.worldVersion,
    events: [event],
  });
  return {
    command: c,
    events: [event],
    transition,
    receipt: createFinalCommandReceipt({
      command: c,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: c.simTime,
      recordedAtReal: '2026-11-08T00:00:00.000Z',
    }),
    inventoryPostings: [],
    financialPostingBatches: [],
  };
}
describe('CREATE in the actual complete ordered canonical Social prefix', () => {
  function input() {
    const f = fixture(),
      c = create(),
      operation = birth(c, f.state, f.creationFacts);
    const {
      worldId,
      countryId,
      governmentEntityId,
      localCurrency,
      sourceRef,
      sourceFingerprint,
      populationAvailability,
      usageLicence,
    } = f.creationFacts;
    return {
      f,
      c,
      operation,
      frame: canonicalFrame(
        c,
        SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT,
        operation.eventPayload,
        '1',
      ),
      original: {
        worldId,
        countryId,
        governmentEntityId,
        localCurrency,
        sourceRef,
        sourceFingerprint,
        populationAvailability,
        usageLicences: [usageLicence],
      },
    };
  }
  it('reduces CREATE then old PLAN into the same global state without financial or inventory effects', () => {
    const x = input(),
      p = plan(x.operation.result.servicePoolId, '4', 'PLAN_AFTER_CREATE'),
      prepared = allocate(p, x.operation.state, x.f.facts);
    const frames = [
      x.frame,
      canonicalFrame(
        p,
        'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1',
        prepared.eventPayload,
        '2',
      ),
    ];
    const evidence = prepareFinanceNativeBudgetMixedPrefix(
      {
        worldId: x.c.worldId,
        frames,
        socialCountries: [
          { countryId: country, state: x.f.state, offers: [x.f.facts.offer] },
        ],
        socialCreationOriginals: [x.original],
      },
      sha,
    );
    const result = readFinanceNativeBudgetMixedPrefix(
      evidence,
      x.c.worldId,
      frames,
      sha,
    );
    expect(result.budgetState.worldVersion).toBe('2');
    expect(result.socialCountries[0]!.lifecycle.employment).toEqual(
      prepared.state,
    );
    expect(
      result.socialCountries[0]!.lifecycle.employment.creations,
    ).toHaveLength(1);
  });
  it('retains a real empty licence set without disabling unrelated history; CREATE remains closed', () => {
    const x = input(),
      base = {
        worldId: x.c.worldId,
        socialCountries: [
          { countryId: country, state: x.f.state, offers: [x.f.facts.offer] },
        ],
        socialCreationOriginals: [{ ...x.original, usageLicences: [] }],
      };
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix({ ...base, frames: [] }, sha),
    ).not.toThrow();
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { ...base, frames: [x.frame] },
        sha,
      ),
    ).toThrow('SOCIAL_CREATION_ACTUAL_T0_ORIGINALS');
  });
  it('rejects missing or mismatched real licence/source/population originals and unknown families', () => {
    const x = input(),
      base = {
        worldId: x.c.worldId,
        frames: [x.frame],
        socialCountries: [
          { countryId: country, state: x.f.state, offers: [x.f.facts.offer] },
        ],
      };
    expect(() => prepareFinanceNativeBudgetMixedPrefix(base, sha)).toThrow(
      'SOCIAL_CREATION_ACTUAL_T0_ORIGINALS',
    );
    for (const original of [
      { ...x.original, sourceFingerprint: 'sha256:' + '2'.repeat(64) },
      {
        ...x.original,
        usageLicences: [
          { ...x.original.usageLicences[0]!, maximumWorkerMinutes: '999' },
        ],
      },
      { ...x.original, populationAvailability: [] },
    ])
      expect(() =>
        prepareFinanceNativeBudgetMixedPrefix(
          { ...base, socialCreationOriginals: [original] },
          sha,
        ),
      ).toThrow();
    const unknown = command(
      'UNKNOWN_TEST_ONLY',
      'CORE_UNKNOWN_SOCIAL_V1',
      '0',
      {},
    );
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          ...base,
          frames: [canonicalFrame(unknown, 'UNKNOWN_SOCIAL_EVENT_V1', {}, '1')],
          socialCreationOriginals: [x.original],
        },
        sha,
      ),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_FAMILY');
  });
  it('rejects extra posting effects and receipt changes on an otherwise genuine CREATE frame', () => {
    const x = input(),
      base = {
        worldId: x.c.worldId,
        socialCountries: [
          { countryId: country, state: x.f.state, offers: [x.f.facts.offer] },
        ],
        socialCreationOriginals: [x.original],
      };
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { ...base, frames: [{ ...x.frame, inventoryPostings: [{}] }] },
        sha,
      ),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_POSTING_EFFECT');
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { ...base, frames: [{ ...x.frame, financialPostingBatches: [{}] }] },
        sha,
      ),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_POSTING_EFFECT');
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          ...base,
          frames: [
            {
              ...x.frame,
              receipt: { ...x.frame.receipt, outcome: 'REJECTED' },
            },
          ],
        },
        sha,
      ),
    ).toThrow();
  });
});

import {
  OPENING_SOURCE_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  createOpeningSource,
  createOpeningSeed,
  openingSourceId,
  openingSeedId,
  worldId,
  rebuildV08LedgersFromLineage,
  canonicalSha256,
  canonicalHashInput,
} from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
it('genuine paired H0 continuation keeps CREATE and its immutable licence across pages, matching one full prefix', () => {
  const f = fixture(),
    c = create(),
    creation = birth(c, f.state, f.creationFacts),
    p = plan(creation.result.servicePoolId, '4', 'PLAN_PAGED_CREATION'),
    operation = allocate(p, creation.state, f.facts),
    frames = [
      canonicalFrame(
        c,
        SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT,
        creation.eventPayload,
        '1',
      ),
      canonicalFrame(
        p,
        'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1',
        operation.eventPayload,
        '2',
      ),
    ];
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_TEST_ONLY_CREATE_PAGES'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/social-employment-service-creation.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { classification: 'TEST_ONLY_NOT_ADMISSION' },
    },
    sha,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_CREATE_PAGES'),
      worldId: worldId(c.worldId),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      financialBatches: [],
      inventoryEntries: [],
    },
    sha,
  );
  const opening = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha }),
    {
      worldId: w,
      countryId,
      governmentEntityId,
      localCurrency,
      sourceRef,
      sourceFingerprint,
      populationAvailability,
      usageLicence,
    } = f.creationFacts,
    original = {
      worldId: w,
      countryId,
      governmentEntityId,
      localCurrency,
      sourceRef,
      sourceFingerprint,
      populationAvailability,
      usageLicences: [usageLicence],
    },
    originals = { socialCreationOriginals: [original] },
    head = { worldVersion: '2', eventSequence: '2' },
    start = () =>
      prepareFinanceSocialReplayContinuation(
        {
          opening,
          expectedHead: head,
          socialCountries: [
            { countryId: country, state: f.state, offers: [f.facts.offer] },
          ],
          ...originals,
          openingEncumbrances: [],
          fxOriginals: [],
        },
        sha,
      ),
    page = (
      from: number,
      through: number,
      fs: readonly FinanceNativeBudgetCanonicalFrame[],
    ) => ({
      schemaVersion: 'finance-social-replay-page-v1' as const,
      worldId: w,
      seedFingerprint: seed.fingerprint,
      fromHead: { worldVersion: String(from), eventSequence: String(from) },
      throughHead: {
        worldVersion: String(through),
        eventSequence: String(through),
      },
      expectedHead: head,
      frames: fs,
      framesSha256: canonicalSha256(canonicalHashInput(fs), sha),
    });
  let paged = start(),
    single = start();
  expect(() =>
    appendFinanceSocialReplayPage({
      continuation: paged,
      page: page(0, 1, [frames[0]!]),
      sha256Hex: sha,
      originals: {
        socialCreationOriginals: [{ ...original, localCurrency: 'XBB' }],
      },
    }),
  ).toThrow('IMMUTABLE_SOCIAL_CREATION_ORIGINAL_CHANGED');
  expect(readFinanceSocialReplayContinuation(paged).head.worldVersion).toBe(
    '0',
  );
  paged = appendFinanceSocialReplayPage({
    continuation: paged,
    page: page(0, 1, [frames[0]!]),
    sha256Hex: sha,
  });
  paged = appendFinanceSocialReplayPage({
    continuation: paged,
    page: page(1, 2, [frames[1]!]),
    sha256Hex: sha,
  });
  single = appendFinanceSocialReplayPage({
    continuation: single,
    page: page(0, 2, frames),
    sha256Hex: sha,
  });
  const result = readFinanceSocialReplayContinuation(paged);
  expect(result.complete).toBe(true);
  expect(result.result.socialCountries).toEqual(
    readFinanceSocialReplayContinuation(single).result.socialCountries,
  );
  expect(result.result.socialCountries[0]!.lifecycle.employment).toEqual(
    operation.state,
  );
  expect(result.result.financialState?.positions).toEqual([]);
  retireFinanceSocialReplayContinuation(paged);
  retireFinanceSocialReplayContinuation(single);
});
