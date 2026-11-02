/** Small explicit TEST_ONLY originals and genuine Core employment/prefixes.
 * No selected-source admission, PG custody, paid work or native Industry pass. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import {
  projectPostwarIndustryLabourAllocation,
  readPostwarIndustryLabourFrom,
  assertPostwarIndustryLabourObservation,
} from '../../apps/world-worker/src/persistence/postwar-industry-labour-source.js';
import type { ValidatedCanonicalLineageView } from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const worldId = 'WORLD_TEST_ONLY_INDUSTRY_LABOUR',
  countryId = 'COUNTRY_01',
  locationId = 'LOCATION_TEST_ONLY',
  employerId = 'OP_TEST_ONLY',
  at = '2026-10-28T00:00:00.000Z';
function fixture() {
  const scope = { countryId, locationId, skill: 'HIGH' as const };
  const positions = ['A', 'B'].map((suffix) => ({
    ...scope,
    positionId: `POSITION_${suffix}`,
    owner: 'PRIVATE_SECTOR' as const,
    classificationId: 'STEEL',
    requiredCount: suffix === 'A' ? '6' : '2',
    sourceWeight: '2',
    employerId,
    employerRole: 'OP' as const,
    occupation: 'GENERAL' as const,
    wageAmount: '3600',
    wageCurrency: 'GBP',
    wagePeriod: 'SIM_YEAR' as const,
    wageVersion: 'WAGE_TEST_ONLY',
    payrollFundingRef: `PAYROLL_TEST_ONLY_${suffix}`,
  }));
  const populationAvailability = [
    { countryId, locationId, workingAgeAvailable: '7' },
  ];
  const labour = {
    positions,
    targets: [{ ...scope, count: '4' }],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING' as const, count: '3' },
    ],
    employers: [{ countryId, employerId, role: 'OP' as const }],
  };
  const opening = C.materializeOpeningLabourState(labour);
  const originals = {
    labour,
    sourcePositions: positions.map((p, i) => ({
      ...p,
      sourceBucket: 'INDUSTRY' as const,
      sourceObjectId: `FACILITY_${i ? 'B' : 'A'}`,
      policyVersion: 'TEST_ONLY_V1',
      provenance: 'SOURCE_MAPPED' as const,
      filledCount: opening.state.positions.find(
        (a) => a.positionId === p.positionId,
      )!.employedCount,
      personRange: {
        poolId: 'SOURCE_POOL_TEST_ONLY',
        startOrdinal: String(i * 2),
        count: '2',
      },
    })),
    populationPositionRefs: positions.map((p, i) => ({
      positionId: p.positionId,
      regionId: locationId,
      cohortId: 'COHORT_TEST_ONLY',
      startOrdinal: String(i * 2),
      count: '2',
      sourcePoolId: 'SOURCE_POOL_TEST_ONLY',
      sourceStartOrdinal: String(i * 2),
    })),
    positionFunding: positions.map((p) => ({
      kind: 'PAYROLL' as const,
      period: 'SIM_DAY' as const,
      periodDays: '1' as const,
      countryId,
      locationId,
      positionId: p.positionId,
      purposeId: p.positionId,
      payerEntityId: employerId,
      accountRef: 'ACCOUNT_TEST_ONLY',
      currency: p.wageCurrency,
      amount: '20',
      requestedReservationAmount: '20',
      uncoveredReservationAmount: '0',
      fundingRef: p.payrollFundingRef,
      payrollFundingRef: p.payrollFundingRef,
      sourceBalanceRef: 'TEST_ONLY_ORIGINAL',
      filledCount: '2',
      exactFirstDayPayrollLC: { numerator: '7200', denominator: '360' },
    })),
  };
  const state: C.SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: C.worldId(worldId),
    labour: opening.state,
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
  const offers: C.SocialEmploymentWageOffer[] = positions.map((p) => ({
    ...scope,
    positionId: p.positionId,
    employerId,
    employerRole: 'OP',
    legalPositionRef: `LEGAL_${p.positionId}`,
    payrollFundingRef: p.payrollFundingRef,
    offerVersion: 'OFFER_TEST_ONLY',
    state: 'ACTIVE',
    wageVersion: p.wageVersion,
    amount: p.wageAmount,
    currency: p.wageCurrency,
    period: p.wagePeriod,
    validFromDayIndex: '0',
    validUntilDayIndex: '1',
  }));
  const facts: C.SocialEmploymentReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '0',
    populationAvailability,
    offer: offers[0]!,
    minimumWage: {
      countryId,
      ruleId: 'FLOOR_TEST_ONLY',
      ruleVersion: 'FLOOR_TEST_ONLY_V1',
      amount: '3600',
      currency: 'GBP',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  const projectScope = {
    worldId,
    countryId,
    locationId,
    facilityId: 'FACILITY_A',
    operatorId: employerId,
  };
  const evidence = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[] = [],
  ) =>
    prepareFinanceNativeBudgetMixedPrefix(
      { worldId, frames, socialCountries: [{ countryId, state, offers }] },
      sha,
    );
  const project = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[] = [],
  ) => ({
    scope: projectScope,
    originals,
    evidence: evidence(frames),
    frames,
    head: {
      worldVersion: String(frames.length),
      eventSequence: String(frames.length),
    },
  });
  return { scope, state, facts, offers, originals, evidence, project };
}
function socialFrame(
  f: ReturnType<typeof fixture>,
  previous?: ReturnType<typeof planFrame>,
) {
  return planFrame(f, previous);
}
function planFrame(
  f: ReturnType<typeof fixture>,
  previous?: {
    command: C.CanonicalCommand;
    state: C.SocialEmploymentServiceState;
  },
) {
  const due = !!previous;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId,
      countryId,
      officeId: due ? null : 'SOCIAL',
      commandType: due
        ? C.SOCIAL_JOB_MATCH_DUE_COMMAND
        : C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      commandId: `COMMAND_TEST_ONLY_${due ? 'MATCH' : 'PLAN'}`,
      idempotencyKey: `KEY_TEST_ONLY_${due ? 'MATCH' : 'PLAN'}`,
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
            positionId: 'POSITION_A',
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
      worldId,
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
    worldVersionBefore: due ? '1' : '0',
    worldVersionAfter: event.worldVersion,
    events: [event],
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
describe('Industry facility staffing from existing E03 and complete Core prefix', () => {
  it('joins the exact H0 facility, population and once-only payroll; does not mint work or authority', () => {
    const f = fixture(),
      result = projectPostwarIndustryLabourAllocation(f.project());
    expect(result.currentEmployedCount).toBe('2');
    expect(result.positions.map((p) => p.positionId)).toEqual(['POSITION_A']);
    expect(result.positions[0]!.openingPopulationReference).toEqual(
      f.originals.populationPositionRefs[0],
    );
    expect(result.positions[0]!.payrollFundingRef).toBe('PAYROLL_TEST_ONLY_A');
    expect(result.completedPersonDays).toBeNull();
    expect(Object.isFrozen(result.positions[0])).toBe(true);
    expect(() => assertPostwarIndustryLabourObservation(result)).toThrow(
      'GENUINE_HELD_LINEAGE',
    );
    expect(projectPostwarIndustryLabourAllocation(f.project())).toEqual(result);
  });
  it('uses the actual H2 MATCH result instead of opening headcount, without changing opening people/payment references', () => {
    const f = fixture(),
      plan = socialFrame(f),
      match = socialFrame(f, plan);
    const result = projectPostwarIndustryLabourAllocation(
      f.project([plan, match]),
    );
    expect(result.currentEmployedCount).toBe('3');
    expect(result.positions[0]!.openingFilledCount).toBe('2');
    expect(result.positions[0]!.openingPopulationReference.count).toBe('2');
    expect(result.completedPersonDays).toBeNull();
  });
  it('refuses a missing facility or current position', () => {
    const f = fixture(),
      input = f.project();
    expect(() =>
      projectPostwarIndustryLabourAllocation({
        ...input,
        scope: { ...input.scope, facilityId: 'FACILITY_UNKNOWN' },
      }),
    ).toThrow('FACILITY_POSITION_ORIGINAL_MISSING');
    const origin = f.originals.sourcePositions[0]!;
    origin.positionId = 'POSITION_NO_CURRENT';
    expect(() => projectPostwarIndustryLabourAllocation(f.project())).toThrow(
      'COMPLETE_FACILITY_POSITION_JOIN',
    );
  });
  it.each(['countryId', 'locationId', 'operatorId'] as const)(
    'rejects cross-scope %s',
    (field) => {
      const f = fixture(),
        input = f.project();
      expect(() =>
        projectPostwarIndustryLabourAllocation({
          ...input,
          scope: { ...input.scope, [field]: 'OTHER_TEST_ONLY' },
        }),
      ).toThrow();
    },
  );
  it('rejects duplicate source ownership, overlapping population and wrong payroll holder', () => {
    const f = fixture();
    f.originals.sourcePositions.push({ ...f.originals.sourcePositions[0]! });
    expect(() => projectPostwarIndustryLabourAllocation(f.project())).toThrow(
      'DUPLICATE_POSITION_ORIGINAL',
    );
    const overlap = fixture();
    overlap.originals.sourcePositions[1]!.personRange.startOrdinal = '1';
    expect(() =>
      projectPostwarIndustryLabourAllocation(overlap.project()),
    ).toThrow('DUPLICATE_OPENING_POPULATION_OCCUPATION');
    const wrong = fixture();
    wrong.originals.positionFunding[0]!.payerEntityId = 'GOV_TEST_ONLY';
    expect(() =>
      projectPostwarIndustryLabourAllocation(wrong.project()),
    ).toThrow('EXACT_POPULATION_EMPLOYER_PAYROLL');
  });
  it('rejects a copied Core prefix token, wrong head and changed skill', () => {
    const f = fixture(),
      input = f.project();
    expect(() =>
      projectPostwarIndustryLabourAllocation({
        ...input,
        evidence: { ...input.evidence },
      }),
    ).toThrow('GENUINE_EXACT_MIXED_PREFIX');
    expect(() =>
      projectPostwarIndustryLabourAllocation({
        ...input,
        head: { worldVersion: '1', eventSequence: '1' },
      }),
    ).toThrow('COMPLETE_CURRENT_PREFIX');
    const wrong = fixture();
    const originals = {
      ...wrong.originals,
      sourcePositions: wrong.originals.sourcePositions.map((p, i) =>
        i === 0 ? { ...p, skill: 'LOW' as const } : p,
      ),
    };
    expect(() =>
      projectPostwarIndustryLabourAllocation({ ...wrong.project(), originals }),
    ).toThrow('CURRENT_POSITION_SCOPE');
  });
  it('rejects unknown economic frames rather than cropping them as unrelated', () => {
    const f = fixture(),
      plan = socialFrame(f);
    const wire = (value: unknown) => {
      const copy = JSON.parse(C.canonicalSerialize(value));
      delete copy.canonicalPayload;
      delete copy.payloadHash;
      delete copy.fingerprint;
      return copy;
    };
    const command = C.parseCanonicalCommand(
      {
        ...wire(plan.command),
        commandType: 'UNKNOWN_TEST_ONLY_ECONOMY',
        payload: {},
      },
      sha,
    );
    const event = C.parseAuthoritativeEvent(
      {
        ...wire(plan.events[0]),
        eventType: 'UNKNOWN_TEST_ONLY_EFFECT',
        payload: {},
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [event],
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
      f.evidence([{ ...plan, command, events: [event], transition, receipt }]),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_FAMILY');
  });
  it('does not accept a structural lineage view or arbitrary source object at the issuer entrypoint', () => {
    const f = fixture(),
      command = C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          commandId: 'COMMAND_TEST_ONLY_INDUSTRY',
          idempotencyKey: 'KEY_TEST_ONLY_INDUSTRY',
          worldId,
          countryId,
          officeId: 'INDUSTRY',
          commandType: 'INDUSTRY_TEST_ONLY',
          actorId: 'ACTOR_TEST_ONLY',
          authSubject: '11111111-1111-4111-8111-111111111111',
          expectedWorldVersion: '0',
          simTime: '0',
          correlationId: 'CORRELATION_TEST_ONLY',
          submittedAtReal: at,
          payload: {},
        },
        sha,
      );
    expect(() =>
      readPostwarIndustryLabourFrom({
        executor: {
          query: async () => {
            throw Error('NO_SQL_EXPECTED');
          },
        },
        lineageView: {} as ValidatedCanonicalLineageView,
        command,
        scope: f.project().scope,
        seedFingerprint: `sha256:${'1'.repeat(64)}`,
        eventSequence: '0',
      }),
    ).toThrow('Validated lineage view is forged');
  });
});
