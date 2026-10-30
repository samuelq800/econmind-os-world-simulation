/** Real TEST_ONLY Core FX batches and mixed-prefix evidence, then the existing
 * facility join. Not a native source/admission or production observation test. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import * as SourceCore from '../../packages/core/src/index.js';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import { parsePostwarDayOneFxQuoteData } from '@econmind/core/postwar-day-one-treasury-fx';
import {
  mixedFinancialFixture,
  mixedFxFrame,
} from '../support/finance-social-fx-replay-fixture.js';
import { decodeDurableFinancialPostingBatch } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  createPostwarIndustryMixedLabourReader,
  projectPostwarIndustryMixedLabourReadout,
} from '../../apps/world-worker/src/persistence/postwar-industry-mixed-labour-read.js';
import { assertPostwarIndustryLabourObservation } from '../../apps/world-worker/src/persistence/postwar-industry-labour-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const worldId = 'WORLD_FX_TEST_ONLY',
  countryId = 'COUNTRY_01',
  locationId = 'LOCATION_TEST_ONLY',
  employerId = 'OP_TEST_ONLY';
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

function exactAccount(ledger: Readonly<C.FinancialLedgerState>, id: string) {
  const accounts = ledger.accounts.filter((a) => a.accountId === id);
  if (accounts.length !== 1)
    throw Error('EXACT_PARSED_OPENING_ACCOUNT_REQUIRED');
  return accounts[0]!;
}
async function settledFixture() {
  const source = mixedFinancialFixture(),
    original = await mixedFxFrame({
      financial: source.financial,
      original: source,
      sequence: '1',
      identity: 'INDUSTRY_CURRENT_READ',
      treasuryReservedAmount: '900',
      bankGcuReservedAmount: '10',
    });
  // Cross the real canonical byte boundary so Worker/dist and fixture/source
  // never exchange opaque ledger or SimTime identities between Core issuers.
  const seed = C.parseOpeningSeed(
      JSON.parse(SourceCore.canonicalSerialize(source.seed)),
      sha,
    ),
    financial = C.rebuildV08LedgersFromLineage({
      seed,
      sha256Hex: sha,
    }).financial,
    c = original.command,
    command = C.parseCanonicalCommand(
      {
        schemaVersion: c.schemaVersion,
        worldId: c.worldId,
        countryId: c.countryId,
        officeId: c.officeId,
        commandType: c.commandType,
        commandId: c.commandId,
        idempotencyKey: c.idempotencyKey,
        actorId: c.actorId,
        authSubject: c.authSubject,
        correlationId: c.correlationId,
        expectedWorldVersion: c.expectedWorldVersion,
        simTime: c.simTime.toCanonicalValue(),
        submittedAtReal: c.submittedAtReal,
        payload: JSON.parse(c.canonicalPayload),
      },
      sha,
    ),
    events = original.events.map((e) =>
      C.parseAuthoritativeEvent(
        {
          schemaVersion: e.schemaVersion,
          eventId: e.eventId,
          eventType: e.eventType,
          worldId: e.worldId,
          causationCommandId: e.causationCommandId,
          correlationId: e.correlationId,
          worldVersion: e.worldVersion,
          sequence: e.sequence,
          simTime: e.simTime.toCanonicalValue(),
          recordedAtReal: e.recordedAtReal,
          correctsEventId: e.correctsEventId,
          payload: JSON.parse(e.canonicalPayload),
        },
        sha,
      ),
    ),
    transition = C.createAuthoritativeTransition({
      command,
      events,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
    }),
    receipt = C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: original.receipt.recordedAtReal,
    }),
    batches = original.financialPostingBatches.map((batch) => {
      const { fingerprint, ...intent } = batch;
      return decodeDurableFinancialPostingBatch({
        command,
        transition,
        sha256Hex: sha,
        row: {
          causation_command_id: command.commandId,
          canonical_payload: SourceCore.canonicalSerialize(intent),
          fingerprint,
        },
      });
    }),
    frame = {
      command,
      events,
      transition,
      receipt,
      financialPostingBatches: batches,
      inventoryPostings: [],
    },
    f = fixture(),
    a = {
      treasuryAsset: exactAccount(
        financial,
        source.accounts.treasuryAsset.accountId,
      ),
      treasuryLiability: exactAccount(
        financial,
        source.accounts.treasuryLiability.accountId,
      ),
      bankSettlementAsset: exactAccount(
        financial,
        source.accounts.bankSettlementAsset.accountId,
      ),
      bankSettlementLiability: exactAccount(
        financial,
        source.accounts.bankSettlementLiability.accountId,
      ),
      bankGcuAsset: exactAccount(
        financial,
        source.accounts.bankGcuAsset.accountId,
      ),
    },
    replay = replayPreparedFinanceSocialFxLedger({
      prepared: prepareFinanceSocialLedger(financial),
      frames: [frame],
      socialCountries: [{ countryId, state: f.state, offers: f.offers }],
      openingEncumbrances: [
        {
          reference: 'OPENING_TGA_TEST_ONLY',
          accountId: a.treasuryAsset.accountId,
          currency: 'XAA',
          amount: '900',
        },
        {
          reference: 'OPENING_GCU_TEST_ONLY',
          accountId: a.bankGcuAsset.accountId,
          currency: 'GCU',
          amount: '10',
        },
      ],
      fxOriginals: [
        {
          quote: parsePostwarDayOneFxQuoteData(source.quote, sha),
          treasuryAsset: a.treasuryAsset,
          treasuryLiability: a.treasuryLiability,
          bankSettlementAsset: a.bankSettlementAsset,
          bankSettlementLiability: a.bankSettlementLiability,
          bankGcuAsset: a.bankGcuAsset,
        },
      ],
      expectedHead: { worldVersion: '1', eventSequence: '1' },
      sha256Hex: sha,
    });
  return { f, frame, replay };
}
describe('Industry mixed-prefix labour read DATA bridge', () => {
  it('reads actual facility headcount after real six-leg FX replay without manufacturing work, cost or rights', async () => {
    const { f, frame, replay } = await settledFixture();
    const result = projectPostwarIndustryMixedLabourReadout({
      ...f.project(),
      evidence: replay.mixedPrefixEvidence,
      frames: [frame],
      head: { worldVersion: '1', eventSequence: '1' },
    });
    expect(frame.financialPostingBatches).toHaveLength(2);
    expect(frame.financialPostingBatches.flatMap((b) => b.legs)).toHaveLength(
      6,
    );
    expect(result.classification).toBe(
      'CURRENT_EMPLOYMENT_DATA_NOT_PRODUCTION_AUTHORITY',
    );
    expect(result.allocation.currentEmployedCount).toBe('2');
    expect(result.allocation.requiredCount).toBe('6');
    expect(result.allocation.positions[0]?.openingPopulationReference).toEqual(
      f.originals.populationPositionRefs[0],
    );
    expect(result.allocation.positions[0]?.payrollFundingRef).toBe(
      'PAYROLL_TEST_ONLY_A',
    );
    expect(result.allocation.completedPersonDays).toBeNull();
    expect(result.unresolved).toEqual({
      paidOperatingCost: null,
      waterRights: null,
      powerRights: null,
      operatingRights: null,
    });
    expect(Object.isFrozen(result.unresolved)).toBe(true);
    expect(() => assertPostwarIndustryLabourObservation(result)).toThrow(
      'GENUINE_HELD_LINEAGE',
    );
    expect(() =>
      assertPostwarIndustryLabourObservation(result.allocation),
    ).toThrow('GENUINE_HELD_LINEAGE');
  });
  it('rejects stale head, copied evidence, a changed full posting set and an unrelated facility scope', async () => {
    const { f, frame, replay } = await settledFixture(),
      input = {
        ...f.project(),
        evidence: replay.mixedPrefixEvidence,
        frames: [frame],
        head: { worldVersion: '1', eventSequence: '1' },
      };
    expect(() =>
      projectPostwarIndustryMixedLabourReadout({
        ...input,
        head: { worldVersion: '0', eventSequence: '0' },
      }),
    ).toThrow('COMPLETE_CURRENT_PREFIX');
    expect(() =>
      projectPostwarIndustryMixedLabourReadout({
        ...input,
        evidence: { ...input.evidence },
      }),
    ).toThrow();
    expect(() =>
      projectPostwarIndustryMixedLabourReadout({
        ...input,
        frames: [{ ...frame, financialPostingBatches: [] }],
      }),
    ).toThrow();
    expect(() =>
      projectPostwarIndustryMixedLabourReadout({
        ...input,
        scope: { ...input.scope, countryId: 'COUNTRY_02' },
      }),
    ).toThrow('EXACT_REPLAYED_COUNTRY');
    expect(() =>
      projectPostwarIndustryMixedLabourReadout({
        ...input,
        scope: { ...input.scope, facilityId: 'FACILITY_UNKNOWN' },
      }),
    ).toThrow('FACILITY_POSITION_ORIGINAL_MISSING');
  });
  it('cannot install a structural callback/source object as a genuine current source', () => {
    let reads = 0;
    expect(() =>
      createPostwarIndustryMixedLabourReader({
        worldId,
        socialConnection: {} as never,
        mixedSource: {
          worldId,
          withSnapshot: async () => {
            reads++;
            throw Error('unexpected');
          },
        } as never,
      }),
    ).toThrow('GENUINE_SAME_WORLD');
    expect(reads).toBe(0);
  });
});
