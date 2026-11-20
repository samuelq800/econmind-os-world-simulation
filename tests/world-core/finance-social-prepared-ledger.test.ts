/** Small TEST_ONLY Core originals. No runtime source, admission or PG authority. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialLedger,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import { isAuthoritativeFinancialLedgerState } from '../../packages/core/src/opening/ledger-authority.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = C.worldId('WORLD_PREPARED_MIXED_TEST_ONLY'),
  countryId = 'COUNTRY_01',
  locationId = 'LOCATION_TEST_ONLY',
  at = '2026-10-28T00:00:00.000Z';
function financialBase(worldId = world) {
  const gov = C.legalEntityId('GOV_TEST_ONLY'),
    cb = C.legalEntityId('CB_TEST_ONLY');
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_PREPARED_MIXED_TEST_ONLY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/finance-social-prepared-ledger.test.ts',
      sourceVersion: 'TEST_ONLY',
      payload: {},
    },
    sha,
  );
  const accounts = [gov, cb].map((ownerId, i) =>
    C.createFinancialAccount({
      worldId,
      countryId: C.countryId(countryId),
      accountId: C.financialAccountId(`ACCOUNT_TEST_ONLY_${i}`),
      ownerId,
      counterpartyEntityId: i ? gov : cb,
      claimId: C.financialClaimId('CLAIM_TEST_ONLY_TGA'),
      currency: 'GBP',
      accountClass: i ? 'LIABILITY' : 'ASSET',
    }),
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_PREPARED_MIXED_TEST_ONLY'),
      worldId,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('BATCH_TEST_ONLY'),
          sourceId: source.sourceId,
          settlementCurrency: 'GBP',
          legs: accounts.map((account, i) => ({
            legId: C.financialOpeningLegId(`LEG_TEST_ONLY_${i}`),
            account,
            direction: i ? 'CREDIT' : 'DEBIT',
            amount: C.Money.from('17.125', 'GBP'),
            counterpartLegId: C.financialOpeningLegId(`LEG_TEST_ONLY_${1 - i}`),
          })),
        },
      ],
    },
    sha,
  );
  return C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha }).financial;
}
function socialFixture() {
  const scope = { countryId, locationId, skill: 'HIGH' as const },
    employerId = 'GOV_TEST_ONLY',
    positionId = 'POSITION_TEST_ONLY';
  const populationAvailability = [
    { countryId, locationId, workingAgeAvailable: '7' },
  ];
  const labour = C.materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    positions: [
      {
        ...scope,
        positionId,
        requiredCount: '6',
        sourceWeight: '1',
        owner: 'PUBLIC_SERVICE',
        classificationId: 'EDUCATION',
        employerId,
        employerRole: 'GOV',
        occupation: 'TEACHER',
        wageAmount: '3600',
        wageCurrency: 'GBP',
        wagePeriod: 'SIM_YEAR',
        wageVersion: 'TEST_ONLY_WAGE',
        payrollFundingRef: 'PAYROLL_TEST_ONLY',
      },
    ],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [{ countryId, employerId, role: 'GOV' }],
  }).state;
  const state: C.SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: world,
    labour,
    servicePools: [
      {
        ...scope,
        poolId: 'POOL_TEST_ONLY',
        dayIndex: '0',
        ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '3',
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const offer: C.SocialEmploymentWageOffer = {
    ...scope,
    positionId,
    employerId,
    employerRole: 'GOV',
    legalPositionRef: 'LEGAL_POSITION_TEST_ONLY',
    payrollFundingRef: 'PAYROLL_TEST_ONLY',
    offerVersion: 'OFFER_TEST_ONLY',
    state: 'ACTIVE',
    wageVersion: 'TEST_ONLY_WAGE',
    amount: '3600',
    currency: 'GBP',
    period: 'SIM_YEAR',
    validFromDayIndex: '0',
    validUntilDayIndex: '1',
  };
  const facts: C.SocialEmploymentReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '0',
    populationAvailability,
    offer,
    minimumWage: {
      countryId,
      ruleId: 'FLOOR_TEST_ONLY',
      ruleVersion: 'FLOOR_TEST_ONLY',
      amount: '3600',
      currency: 'GBP',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  return { state, facts, offers: [offer], countryId };
}
function socialFrame(
  f: ReturnType<typeof socialFixture>,
  previous?: {
    command: C.CanonicalCommand;
    state: C.SocialEmploymentServiceState;
  },
) {
  const due = !!previous;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandId: `COMMAND_PREPARED_${due ? 'MATCH' : 'PLAN'}`,
      idempotencyKey: `KEY_PREPARED_${due ? 'MATCH' : 'PLAN'}`,
      worldId: world,
      countryId,
      officeId: due ? null : 'SOCIAL',
      commandType: due
        ? C.SOCIAL_JOB_MATCH_DUE_COMMAND
        : C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_ONLY',
      expectedWorldVersion: due ? '1' : '0',
      simTime: '0',
      submittedAtReal: at,
      payload: due
        ? {
            schemaVersion: 'social-job-match-settlement-v1',
            planCommandId: previous!.command.commandId,
            planFingerprint: previous!.command.fingerprint,
            dueDayIndex: '0',
            ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
          }
        : {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId,
            skill: 'HIGH',
            positionId: 'POSITION_TEST_ONLY',
            servicePoolId: 'POOL_TEST_ONLY',
            requestedMatches: '1',
            dueDayIndex: '0',
          },
    },
    sha,
  );
  const prepared = C.prepareSocialEmploymentServiceOperation({
    command,
    state: previous?.state ?? f.state,
    readFacts: f.facts,
    sha256Hex: sha,
  });
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: due ? C.SOCIAL_JOB_MATCH_EVENT : C.SOCIAL_SERVICE_PLAN_EVENT,
      worldId: world,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: due ? '2' : '1',
      sequence: due ? '2' : '1',
      simTime: '0',
      recordedAtReal: at,
      correctsEventId: null,
      payload: prepared.eventPayload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: due ? '1' : '0',
    worldVersionAfter: event.worldVersion,
  });
  return {
    command,
    events: [event],
    transition,
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    }),
    inventoryPostings: [],
    financialPostingBatches: [],
    state: prepared.state,
  };
}
function fixture() {
  const f = socialFixture(),
    plan = socialFrame(f),
    match = socialFrame(f, plan),
    base = financialBase();
  const frames: readonly FinanceNativeBudgetCanonicalFrame[] = [plan, match];
  const evidence = (prefix = frames) =>
    prepareFinanceNativeBudgetMixedPrefix(
      { worldId: world, frames: prefix, socialCountries: [f] },
      sha,
    );
  const input = {
    prepared: prepareFinanceSocialLedger(base),
    mixedPrefixEvidence: evidence(),
    frames,
    expectedHead: { worldVersion: '2', eventSequence: '2' },
    sha256Hex: sha,
  };
  return { base, plan, match, f, evidence, input };
}
describe('genuine H0 financial data advanced by a complete zero-posting Budget/Social prefix', () => {
  it('retains the genuine opening base at H0 and preserves all balances/claims/batch identities at H2 Social', () => {
    const f = fixture();
    expect(
      replayPreparedFinanceSocialLedger({
        ...f.input,
        frames: [],
        mixedPrefixEvidence: f.evidence([]),
        expectedHead: { worldVersion: '0', eventSequence: '0' },
      }),
    ).toBe(f.base);
    const current = replayPreparedFinanceSocialLedger(f.input);
    expect(isAuthoritativeFinancialLedgerState(current)).toBe(true);
    expect(current.worldVersion).toBe('2');
    expect(
      C.canonicalSerialize({
        accounts: current.accounts,
        positions: current.positions,
        appliedBatches: current.appliedBatches,
      }),
    ).toBe(
      C.canonicalSerialize({
        accounts: f.base.accounts,
        positions: f.base.positions,
        appliedBatches: f.base.appliedBatches,
      }),
    );
    expect(
      current.positions.map((p) => p.netDebitBalance.toCanonicalValue().amount),
    ).toEqual(['17.125', '-17.125']);
    expect(f.base.worldVersion).toBe('0');
    expect(() => prepareFinanceSocialLedger(current)).toThrow('genuine H0');
    expect(replayPreparedFinanceSocialLedger(f.input)).toEqual(current);
  });
  it('rejects copied bases/preparation/evidence and same-prefix evidence from another World', () => {
    const f = fixture();
    expect(() => prepareFinanceSocialLedger({ ...f.base })).toThrow(
      'genuine H0',
    );
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        prepared: { ...f.input.prepared },
      }),
    ).toThrow('genuine preparation');
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        mixedPrefixEvidence: { ...f.input.mixedPrefixEvidence },
      }),
    ).toThrow('GENUINE_EXACT_MIXED_PREFIX');
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        prepared: prepareFinanceSocialLedger(
          financialBase(C.worldId('WORLD_OTHER_TEST_ONLY')),
        ),
      }),
    ).toThrow('GENUINE_EXACT_MIXED_PREFIX');
  });
  it('rejects incomplete, rebased, reordered, over-limit or stale-head prefixes', () => {
    const f = fixture();
    for (const frames of [
      [f.plan],
      [f.match],
      [f.match, f.plan],
      Array.from({ length: 257 }, () => f.plan),
    ])
      expect(() =>
        replayPreparedFinanceSocialLedger({ ...f.input, frames }),
      ).toThrow();
    for (const expectedHead of [
      { worldVersion: '1', eventSequence: '2' },
      { worldVersion: '2', eventSequence: '1' },
    ])
      expect(() =>
        replayPreparedFinanceSocialLedger({ ...f.input, expectedHead }),
      ).toThrow('exact complete current head');
  });
  it.each(['financialPostingBatches', 'inventoryPostings'] as const)(
    'rejects an external %s even with the genuine unchanged command/event token',
    (field) => {
      const f = fixture();
      const frames = [{ ...f.plan, [field]: [{}] }, f.match];
      expect(() =>
        replayPreparedFinanceSocialLedger({ ...f.input, frames }),
      ).toThrow('zero-posting');
    },
  );
  it('revalidates the entire external transition and COMMITTED receipt on every use', () => {
    const f = fixture();
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        frames: [
          {
            ...f.plan,
            transition: { ...f.plan.transition, worldVersionAfter: '9' },
          },
          f.match,
        ],
      }),
    ).toThrow('canonical whole transition');
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        frames: [
          { ...f.plan, receipt: { ...f.plan.receipt, worldVersionAfter: '9' } },
          f.match,
        ],
      }),
    ).toThrow();
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        frames: [
          { ...f.plan, receipt: { ...f.plan.receipt, outcome: 'REJECTED' } },
          f.match,
        ],
      }),
    ).toThrow('COMMITTED');
  });
  it('requires actual known-family evidence; an unknown canonical command/event cannot mint it', () => {
    const f = fixture();
    const wire = (value: unknown) => {
      const copy = JSON.parse(C.canonicalSerialize(value));
      delete copy.canonicalPayload;
      delete copy.payloadHash;
      delete copy.fingerprint;
      return copy;
    };
    const command = C.parseCanonicalCommand(
      {
        ...wire(f.plan.command),
        commandType: 'UNKNOWN_ECONOMY_TEST_ONLY',
        payload: {},
      },
      sha,
    );
    const event = C.parseAuthoritativeEvent(
      {
        ...wire(f.plan.events[0]),
        eventType: 'UNKNOWN_EFFECT_TEST_ONLY',
        payload: {},
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
      command,
      events: [event],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
    });
    const receipt = C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    });
    expect(() =>
      f.evidence([
        { ...f.plan, command, events: [event], transition, receipt },
      ]),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_FAMILY');
  });
  it('rejects changed receipt key, reason, SimTime or invalid audit timestamp despite genuine mixed evidence', () => {
    const f = fixture();
    for (const changed of [
      { idempotencyKey: C.idempotencyKey('KEY_OTHER_TEST_ONLY') },
      { reasonCode: 'INVENTED_REASON_TEST_ONLY' },
      { simTime: C.SimTime.fromTicks('1') },
      { recordedAtReal: 'not-an-audit-timestamp' },
    ])
      expect(() =>
        replayPreparedFinanceSocialLedger({
          ...f.input,
          frames: [
            { ...f.plan, receipt: { ...f.plan.receipt, ...changed } },
            f.match,
          ],
        }),
      ).toThrow();
    expect(() =>
      replayPreparedFinanceSocialLedger({
        ...f.input,
        frames: [
          {
            ...f.plan,
            receipt: {
              ...f.plan.receipt,
              simTime: { ...f.plan.receipt.simTime } as C.SimTime,
            },
          },
          f.match,
        ],
      }),
    ).toThrow('genuine canonical COMMITTED receipt SimTime');
  });
});
