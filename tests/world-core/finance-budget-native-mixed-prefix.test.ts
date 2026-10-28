/** Pure Core fixtures: genuine Core ledger and command authorization brands,
 * but explicit TEST_ONLY originals/policy. SQL admission/custody is separate. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  FINANCE_NATIVE_BUDGET_RULE,
  evaluateFinanceNativeBudgetSource,
  prepareFinanceNativeBudgetTransition,
  replayFinanceNativeBudgetHistory,
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetSource,
} from '../../packages/core/src/commands/finance-budget-native.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-28T00:00:00.000Z',
  world = C.worldId('WORLD_TEST_ONLY_NATIVE_BUDGET'),
  country = C.countryId('COUNTRY_01'),
  subject = C.authSubject('11111111-1111-4111-8111-111111111111');
function fixture() {
  const gov = C.legalEntityId('GOV_TEST_ONLY'),
    cb = C.legalEntityId('CB_TEST_ONLY'),
    claim = C.financialClaimId('CLAIM_TEST_ONLY_TGA');
  const accounts = [gov, cb].map((ownerId, i) =>
    C.createFinancialAccount({
      worldId: world,
      countryId: country,
      accountId: C.financialAccountId(`ACCOUNT_TEST_ONLY_${i}`),
      ownerId,
      counterpartyEntityId: i === 0 ? cb : gov,
      claimId: claim,
      currency: 'GBP',
      accountClass: i === 0 ? 'ASSET' : 'LIABILITY',
    }),
  );
  const opening = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/finance-budget-native.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { classification: 'TEST_ONLY_NOT_ADMITTED' },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [opening],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('BATCH_TEST_ONLY'),
          sourceId: opening.sourceId,
          settlementCurrency: 'GBP',
          legs: accounts.map((account, i) => ({
            legId: C.financialOpeningLegId(`LEG_TEST_ONLY_${i}`),
            account,
            direction: i === 0 ? 'DEBIT' : 'CREDIT',
            amount: C.Money.from('1000', 'GBP'),
            counterpartLegId: C.financialOpeningLegId(`LEG_TEST_ONLY_${1 - i}`),
          })),
        },
      ],
    },
    sha,
  );
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: FINANCE_NATIVE_BUDGET_RULE,
    ruleRevision: 'RULE_REV_TEST_ONLY',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: world,
    countryId: country,
    governmentEntityId: gov,
    currency: 'GBP',
    envelopeRef: 'ENVELOPE_TEST_ONLY',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'PERIOD_REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '100',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source: FinanceNativeBudgetSource = {
    policy,
    binding: {
      seedRef: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef: 'ADMISSION_TEST_ONLY',
      financialSourceId: opening.sourceId,
      originalsSHA256: 'sha256:' + 'b'.repeat(64),
      policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
      treasuryAccountId: accounts[0]!.accountId,
      treasuryClaimId: claim,
      openingEncumbranceHash: C.canonicalSha256(C.canonicalHashInput([]), sha),
    },
    financialState: C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha })
      .financial,
    frames: [],
    openingEncumbrances: [],
    worldVersion: '0',
    eventSequence: '0',
  };
  const command = (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'SET_ENVELOPE',
    amount = '800',
    version = '0',
    suffix = 'SET',
    simTime = '0',
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: `COMMAND_TEST_ONLY_${suffix}`,
        idempotencyKey: `KEY_TEST_ONLY_${suffix}`,
        worldId: world,
        countryId: country,
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: subject,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        expectedWorldVersion: version,
        simTime,
        correlationId: 'CORRELATION_TEST_ONLY',
        submittedAtReal: at,
        payload: {
          operation,
          scope: {
            worldId: world,
            countryId: country,
            entityRef: gov,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: 'GBP',
          amount,
          envelopeRevisionRef: 'ENVELOPE_REV_TEST_ONLY',
          lineRef:
            operation === 'SET_ENVELOPE' ? null : `LINE_TEST_ONLY_${suffix}`,
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_TEST_ONLY'
              : `LINE_REV_TEST_ONLY_${suffix}`,
          predecessorRevisionRef: null,
        },
      },
      sha,
    );
  return { seed, source, command };
}
async function run(
  command: C.CanonicalCommand,
  source: FinanceNativeBudgetSource,
) {
  let active = true,
    proof: C.CommitAuthorizationProof | undefined,
    result:
      | Awaited<ReturnType<typeof prepareFinanceNativeBudgetTransition>>
      | undefined;
  const intakeAuthorization = await C.authorizeOfficeCapability({
    principal: {
      authSubject: subject,
      facts: { user_id: subject, display_name: null, school_id: null },
      token: {
        subject,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: at,
        expiresAt: '2026-10-29T00:00:00.000Z',
      },
    },
    resolver: {
      resolveCurrentIdentity: async () => subject,
      resolveCurrentMembership: async () => ({
        authSubject: subject,
        worldId: world,
        countryId: country,
        teamId: C.teamId('TEAM_TEST_ONLY'),
        authorizationVersion: 'REV_TEST_ONLY',
        officeAssignments: [C.officeId('FINANCE')],
        active,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      }),
    },
    worldId: world,
    requestedCountryId: country,
    requestedOfficeId: 'FINANCE',
    capability: 'FINANCE_BUDGET',
  });
  await C.processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    requiredCapability: 'FINANCE_BUDGET',
    intakeAuthorization,
    commitSimTime: command.simTime,
    recordedAtReal: at,
    persistence: {
      readFinalReceipt: async () => null,
      recordZeroEffectReceipt: async (r) => r,
      commitAuthorizedCommand: async (input) => {
        proof = input.commitAuthorization!;
        result = await prepareFinanceNativeBudgetTransition({
          command,
          authorization: proof,
          source,
          recordedAtReal: at,
          sha256Hex: sha,
        });
        return { transition: result.transition, receipt: result.receipt };
      },
    },
  });
  if (!result || !proof) throw Error('native transition not issued');
  return {
    result,
    proof,
    revoke() {
      active = false;
    },
  };
}

/** Small explicit TEST_ONLY states test reducer interoperability only. Actual
 * selected-country money/custody acceptance uses the separate native suite. */
function socialOriginal(countryId = 'COUNTRY_01') {
  const scope = {
    countryId,
    locationId: `LOCATION_${countryId}`,
    skill: 'HIGH' as const,
  };
  const positionId = `POSITION_${countryId}`,
    employerId = `GOV_${countryId}`;
  const populationAvailability = [
    { countryId, locationId: scope.locationId, workingAgeAvailable: '7' },
  ];
  const opening = C.materializeOpeningLabourState({
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
        payrollFundingRef: `PAYROLL_${countryId}`,
      },
    ],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [{ countryId, employerId, role: 'GOV' }],
  });
  const state: C.SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: world,
    labour: opening.state,
    servicePools: [
      {
        ...scope,
        poolId: `POOL_${countryId}`,
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
  const facts: C.SocialEmploymentReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '0',
    populationAvailability,
    offer: {
      ...scope,
      positionId,
      employerId,
      employerRole: 'GOV',
      legalPositionRef: `LEGAL_${countryId}`,
      payrollFundingRef: `PAYROLL_${countryId}`,
      offerVersion: 'TEST_ONLY_OFFER',
      state: 'ACTIVE',
      wageVersion: 'TEST_ONLY_WAGE',
      amount: '3600',
      currency: 'GBP',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    minimumWage: {
      countryId,
      ruleId: 'TEST_ONLY_FLOOR',
      ruleVersion: 'TEST_ONLY_FLOOR_V1',
      amount: '3600',
      currency: 'GBP',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  return { countryId, state, offers: [facts.offer], facts, scope, positionId };
}
function socialFrame(
  original: ReturnType<typeof socialOriginal>,
  version: string,
  sequence: string,
  previous?: {
    command: C.CanonicalCommand;
    state: C.SocialEmploymentServiceState;
  },
  simTime = '0',
) {
  const due = previous !== undefined;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: original.countryId,
      officeId: due ? null : 'SOCIAL',
      commandType: due
        ? C.SOCIAL_JOB_MATCH_DUE_COMMAND
        : C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      commandId: `COMMAND_${due ? 'MATCH' : 'PLAN'}_${original.countryId}`,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: subject,
      correlationId: 'CORRELATION_TEST_ONLY',
      idempotencyKey: `KEY_${due ? 'MATCH' : 'PLAN'}_${original.countryId}`,
      expectedWorldVersion: version,
      simTime,
      submittedAtReal: at,
      payload: due
        ? {
            schemaVersion: 'social-job-match-settlement-v1',
            planCommandId: previous.command.commandId,
            planFingerprint: previous.command.fingerprint,
            dueDayIndex: '0',
            ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
          }
        : {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: original.scope.locationId,
            skill: 'HIGH',
            positionId: original.positionId,
            servicePoolId: `POOL_${original.countryId}`,
            requestedMatches: '1',
            dueDayIndex: '0',
          },
    },
    sha,
  );
  const prepared = C.prepareSocialEmploymentServiceOperation({
    command,
    state: previous?.state ?? original.state,
    readFacts: { ...original.facts, simTime },
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
      worldVersion: (BigInt(version) + 1n).toString(),
      sequence,
      simTime,
      recordedAtReal: at,
      correctsEventId: null,
      payload: prepared.eventPayload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: version,
    worldVersionAfter: event.worldVersion,
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
  return {
    command,
    events: [event],
    transition,
    receipt,
    inventoryPostings: [],
    financialPostingBatches: [],
    state: prepared.state,
  };
}
const canonicalBudgetFrame = (
  command: C.CanonicalCommand,
  value: Awaited<ReturnType<typeof run>>,
): FinanceNativeBudgetCanonicalFrame => ({
  command,
  events: value.result.transition.events,
  transition: value.result.transition,
  receipt: value.result.receipt,
  inventoryPostings: [],
  financialPostingBatches: [],
});
describe('whole Finance/Social known-family prefix replay, TEST_ONLY Core semantics', () => {
  it('protects Budget cap once in a new Social vacancy and requires that actual payroll reservation back in Finance', async () => {
    const f = fixture(),
      set = f.command(),
      first = await run(set, f.source),
      budgetFrame = canonicalBudgetFrame(set, first),
      c1 = socialOriginal();
    const initialEvidence = prepareFinanceNativeBudgetMixedPrefix(
      { worldId: world, frames: [budgetFrame], socialCountries: [c1] },
      sha,
    );
    const cap = readFinanceNativeBudgetMixedPrefix(
      initialEvidence,
      world,
      [budgetFrame],
      sha,
    ).budgetEncumbrances[0]!;
    const authorized = async (
      office: 'SOCIAL' | 'FINANCE',
      capability: 'SOCIAL_LABOUR' | 'FINANCE_BUDGET',
    ) =>
      C.authorizeOfficeCapability({
        principal: {
          authSubject: subject,
          facts: {
            user_id: subject,
            display_name: 'TEST_ONLY',
            school_id: null,
          },
          token: {
            subject,
            issuer: 'TEST_ONLY',
            audience: 'TEST_ONLY',
            issuedAt: at,
            expiresAt: '2026-10-29T00:00:00.000Z',
          },
        },
        resolver: {
          async resolveCurrentIdentity() {
            return subject;
          },
          async resolveCurrentMembership() {
            return {
              authSubject: subject,
              worldId: world,
              countryId: country,
              teamId: C.teamId('TEAM_TEST_ONLY'),
              authorizationVersion: 'REV_TEST_ONLY',
              officeAssignments: ['SOCIAL', 'FINANCE'],
              active: true,
              suspended: false,
              isWorldAdmin: false,
              negotiationPartyIds: [],
            };
          },
        },
        worldId: world,
        requestedCountryId: country,
        requestedOfficeId: office,
        capability,
      });
    const intent = {
      schemaVersion: 'social-employment-position-offer-create-v1',
      positionId: 'POSITION_NEW_MIXED_TEST',
      locationId: c1.scope.locationId,
      skill: 'HIGH',
      publicService: 'EDUCATION',
      occupation: 'TEACHER',
      requiredCount: '1',
      wageScheduleRef: 'WAGE_SCHEDULE_TEST',
      fundingAccountId: cap.accountId,
      coverageDays: '1',
    };
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: country,
        officeId: 'SOCIAL',
        commandType: C.SOCIAL_POSITION_OFFER_CREATE_COMMAND,
        commandId: 'COMMAND_NEW_MIXED_TEST',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: subject,
        correlationId: 'CORRELATION_TEST_ONLY',
        idempotencyKey: 'KEY_NEW_MIXED_TEST',
        expectedWorldVersion: '1',
        simTime: '0',
        submittedAtReal: at,
        payload: intent,
      },
      sha,
    );
    const { offer: _offer, ...employment } = c1.facts;
    void _offer;
    const facts: C.SocialPositionOfferReadFacts = {
      policyVersion: C.SOCIAL_POSITION_OFFER_POLICY,
      sourceRevision:
        'POSTWAR_E03_' + sha('TEST_ONLY_MIXED_SOURCE_NOT_ADMITTED'),
      governmentEntityId: 'GOV_TEST_ONLY',
      centralBankEntityId: 'CB_TEST_ONLY',
      employment,
      wageSchedule: {
        scheduleId: 'WAGE_SCHEDULE_TEST',
        countryId: country,
        skill: 'HIGH',
        publicService: 'EDUCATION',
        occupation: 'TEACHER',
        amount: '3600',
        currency: 'GBP',
        period: 'SIM_YEAR',
        wageVersion: 'TEST_ONLY_WAGE',
        validFromDayIndex: '0',
        validUntilDayIndex: '1',
      },
      funding: {
        accountId: cap.accountId,
        countryId: country,
        ownerId: 'GOV_TEST_ONLY',
        currency: 'GBP',
        liquidBalance: '1000',
        priorReservations: [
          {
            reservationId: cap.reference,
            sourceRef: cap.eventId,
            amount: cap.amount,
          },
        ],
      },
    };
    const financialState = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [budgetFrame],
      sha256Hex: sha,
    }).financial;
    const prepared = await C.prepareAuthorizedSocialPositionOfferCreate({
      command,
      state: C.createSocialPositionOfferLifecycleState(c1.state, c1.offers),
      readFacts: facts,
      sha256Hex: sha,
      socialAuthorization: await authorized('SOCIAL', 'SOCIAL_LABOUR'),
      financeAuthorization: await authorized('FINANCE', 'FINANCE_BUDGET'),
      financialLedger: financialState,
    });
    const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'EVENT_NEW_MIXED_TEST',
        eventType: C.SOCIAL_POSITION_OFFER_CREATED_EVENT,
        worldId: world,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: '2',
        sequence: '2',
        simTime: '0',
        recordedAtReal: at,
        correctsEventId: null,
        payload: prepared.eventPayload,
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [event],
    });
    const socialFrame: FinanceNativeBudgetCanonicalFrame = {
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
    };
    const frames = [budgetFrame, socialFrame],
      evidence = prepareFinanceNativeBudgetMixedPrefix(
        { worldId: world, frames, socialCountries: [c1] },
        sha,
      ),
      result = readFinanceNativeBudgetMixedPrefix(evidence, world, frames, sha),
      reservation = result.socialReservations[0]!;
    expect(reservation.amount).toBe('10');
    expect(result.budgetEncumbrances[0]?.amount).toBe('800');
    const line = f.command('APPROVE_NEW_LINE', '100', '2', 'AFTER_POSITION'),
      currentFinancial = C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: frames,
        sha256Hex: sha,
      }).financial;
    const source = {
      ...f.source,
      frames,
      mixedPrefixEvidence: evidence,
      worldVersion: '2',
      eventSequence: '2',
      financialState: currentFinancial,
    };
    expect(() =>
      evaluateFinanceNativeBudgetSource({
        command: line,
        source,
        sha256Hex: sha,
      }),
    ).toThrow('OMITS_ACTUAL_SOCIAL_PAYROLL');
    const encumbrances = [
      {
        reference: reservation.reservationId,
        accountId: reservation.accountId,
        amount: reservation.amount,
        currency: reservation.currency,
      },
    ];
    const protectedSource = {
      ...source,
      openingEncumbrances: encumbrances,
      binding: {
        ...source.binding,
        openingEncumbranceHash: C.canonicalSha256(
          C.canonicalHashInput(encumbrances),
          sha,
        ),
      },
    };
    expect(
      evaluateFinanceNativeBudgetSource({
        command: line,
        source: protectedSource,
        sha256Hex: sha,
      }).after.envelopes[0]?.lines,
    ).toHaveLength(1);
    const missingPrior = {
      ...facts,
      funding: { ...facts.funding, priorReservations: [] },
    };
    const unprotected = await C.prepareAuthorizedSocialPositionOfferCreate({
      command,
      state: C.createSocialPositionOfferLifecycleState(c1.state, c1.offers),
      readFacts: missingPrior,
      sha256Hex: sha,
      socialAuthorization: await authorized('SOCIAL', 'SOCIAL_LABOUR'),
      financeAuthorization: await authorized('FINANCE', 'FINANCE_BUDGET'),
      financialLedger: financialState,
    });
    const unprotectedEvent = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'EVENT_UNPROTECTED_MIXED_TEST',
        eventType: C.SOCIAL_POSITION_OFFER_CREATED_EVENT,
        worldId: world,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: '2',
        sequence: '2',
        simTime: '0',
        recordedAtReal: at,
        correctsEventId: null,
        payload: unprotected.eventPayload,
      },
      sha,
    );
    const unprotectedTransition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [unprotectedEvent],
    });
    const bad = {
      ...socialFrame,
      events: [unprotectedEvent],
      transition: unprotectedTransition,
      receipt: C.createFinalCommandReceipt({
        command,
        transition: unprotectedTransition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: at,
      }),
    };
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { worldId: world, frames: [budgetFrame, bad], socialCountries: [c1] },
        sha,
      ),
    ).toThrow('OMITS_EXISTING_BUDGET_CAPACITY');
  });
  it('keeps whole Budget SET/LINE groups, then PLAN/MATCH and a second country, without rebasing', async () => {
    const f = fixture(),
      set = f.command(),
      first = await run(set, f.source);
    const firstFrame = canonicalBudgetFrame(set, first);
    const line = f.command('APPROVE_NEW_LINE', '100', '1', 'LINE');
    const lineSource = {
      ...f.source,
      frames: [firstFrame],
      worldVersion: '1',
      eventSequence: '1',
      financialState: C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [firstFrame],
        sha256Hex: sha,
      }).financial,
    };
    const second = await run(line, lineSource),
      secondFrame = canonicalBudgetFrame(line, second);
    const c1 = socialOriginal(),
      c2 = socialOriginal('COUNTRY_02');
    const plan = socialFrame(c1, '2', '5'),
      match = socialFrame(c1, '3', '6', plan),
      foreign = socialFrame(c2, '4', '7');
    const frames = [firstFrame, secondFrame, plan, match, foreign];
    const evidence = prepareFinanceNativeBudgetMixedPrefix(
      { worldId: world, frames, socialCountries: [c1, c2] },
      sha,
    );
    const result = readFinanceNativeBudgetMixedPrefix(
      evidence,
      world,
      frames,
      sha,
    );
    expect(result.budgetState).toMatchObject({
      worldVersion: '5',
      eventSequence: '7',
    });
    expect(result.budgetEncumbrances).toHaveLength(1);
    expect(result.budgetEncumbrances[0]?.amount).toBe('800');
    expect(result.budgetState.envelopes[0]?.lines[0]?.appropriation).toBe(
      '100',
    );
    expect(result.socialCountries[0]?.lifecycle.employment).toEqual(
      match.state,
    );
    expect(result.socialCountries[1]?.lifecycle.employment).toEqual(
      foreign.state,
    );
    expect(result.checkpoints.map((c) => c.countryId)).toEqual([
      'COUNTRY_01',
      'COUNTRY_01',
      'COUNTRY_02',
    ]);
    expect(() =>
      replayFinanceNativeBudgetHistory(world, frames, sha),
    ).toThrow();
    expect(
      replayFinanceNativeBudgetHistory(world, frames, sha, evidence),
    ).toEqual(result.budgetState);
    expect(() =>
      readFinanceNativeBudgetMixedPrefix({ ...evidence }, world, frames, sha),
    ).toThrow('GENUINE_EXACT');
    expect(() =>
      readFinanceNativeBudgetMixedPrefix(evidence, world, frames.slice(1), sha),
    ).toThrow('GENUINE_EXACT');
  });
  it('continues Budget after Social by genuine typed replay, keeping canonical global cursor hashes', async () => {
    const f = fixture(),
      set = f.command(),
      first = await run(set, f.source),
      firstFrame = canonicalBudgetFrame(set, first),
      c1 = socialOriginal(),
      plan = socialFrame(c1, '1', '2', undefined, '10');
    const frames = [firstFrame, plan];
    const evidence = prepareFinanceNativeBudgetMixedPrefix(
      { worldId: world, frames, socialCountries: [c1] },
      sha,
    );
    const line = f.command(
      'APPROVE_NEW_LINE',
      '100',
      '2',
      'AFTER_SOCIAL',
      '10',
    );
    const source = {
      ...f.source,
      frames,
      mixedPrefixEvidence: evidence,
      worldVersion: '2',
      eventSequence: '2',
      financialState: C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: frames,
        sha256Hex: sha,
      }).financial,
    };
    const staleTime = f.command(
      'APPROVE_NEW_LINE',
      '100',
      '2',
      'STALE_TIME',
      '0',
    );
    expect(() =>
      evaluateFinanceNativeBudgetSource({
        command: staleTime,
        source,
        sha256Hex: sha,
      }),
    ).toThrow('COMMAND_PRECEDES_ACTUAL_PREFIX');
    const second = await run(line, source),
      all = [...frames, canonicalBudgetFrame(line, second)];
    const mixed = prepareFinanceNativeBudgetMixedPrefix(
      { worldId: world, frames: all, socialCountries: [c1] },
      sha,
    );
    expect(
      readFinanceNativeBudgetMixedPrefix(mixed, world, all, sha).budgetState,
    ).toMatchObject({ worldVersion: '3', eventSequence: '5' });
  });
  it('rejects unknown, missing receipt, duplicated sequence, and cross-country original IDs', async () => {
    const f = fixture(),
      set = f.command(),
      first = await run(set, f.source),
      frame = canonicalBudgetFrame(set, first),
      c1 = socialOriginal();
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          worldId: world,
          frames: [
            { ...frame, receipt: { ...frame.receipt, outcome: 'REJECTED' } },
          ],
          socialCountries: [c1],
        },
        sha,
      ),
    ).toThrow('RECEIPT');
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { worldId: world, frames: [frame, frame], socialCountries: [c1] },
        sha,
      ),
    ).toThrow('UNIQUE');
    const c2 = socialOriginal('COUNTRY_02');
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          worldId: world,
          frames: [],
          socialCountries: [
            c1,
            {
              ...c2,
              state: {
                ...c2.state,
                labour: {
                  ...c2.state.labour,
                  positions: c1.state.labour.positions,
                },
              },
            },
          ],
        },
        sha,
      ),
    ).toThrow('POSITION_ORIGINALS');
    const plan = socialFrame(c1, '1', '2');
    const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: plan.events[0]!.eventId,
        eventType: 'UNKNOWN_ECONOMIC_V99',
        worldId: world,
        causationCommandId: plan.command.commandId,
        correlationId: plan.command.correlationId,
        worldVersion: '2',
        sequence: '2',
        recordedAtReal: at,
        correctsEventId: null,
        payload: JSON.parse(plan.events[0]!.canonicalPayload),
        simTime: '0',
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
      command: plan.command,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [event],
    });
    const unknown = {
      ...plan,
      events: [event],
      transition,
      receipt: C.createFinalCommandReceipt({
        command: plan.command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: plan.command.simTime,
        recordedAtReal: at,
      }),
    };
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { worldId: world, frames: [frame, unknown], socialCountries: [c1] },
        sha,
      ),
    ).toThrow('UNSUPPORTED_MIXED');
  });
});
