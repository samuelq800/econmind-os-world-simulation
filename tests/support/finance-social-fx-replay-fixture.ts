/** TEST_ONLY original Core ledgers and economic policy, not PG/admission. */
import { createHash } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
import {
  createPostwarDayOneFxQuoteData,
  type PostwarDayOneTreasuryFxAccounts,
} from '../../packages/core/src/finance/postwar-day-one-treasury-fx.js';
export const mixedSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
const sha = mixedSha;
export const mixedWorld = C.worldId('WORLD_FX_TEST_ONLY');
const world = mixedWorld,
  country = C.countryId('COUNTRY_01'),
  subject = C.authSubject('11111111-1111-4111-8111-111111111111'),
  at = '2026-10-29T00:00:00.000Z';
export function mixedFinancialFixture() {
  const gov = C.legalEntityId('ENTITY_GOVERNMENT_01'),
    bank = C.legalEntityId('ENTITY_BANK_01'),
    cb = C.legalEntityId('ENTITY_CENTRAL_BANK_01');
  const account = (
    id: string,
    owner: typeof gov,
    cls: C.FinancialAccountClass,
    currency: string,
    claim: string | null,
    counterparty: typeof gov | null,
  ) =>
    C.createFinancialAccount({
      worldId: world,
      countryId: country,
      accountId: C.financialAccountId(id),
      ownerId: owner,
      accountClass: cls,
      currency,
      claimId: claim === null ? null : C.financialClaimId(claim),
      counterpartyEntityId: counterparty,
    });
  const accounts: PostwarDayOneTreasuryFxAccounts = {
    treasuryAsset: account('TGA_ASSET', gov, 'ASSET', 'XAA', 'TGA_CLAIM', cb),
    treasuryLiability: account(
      'TGA_LIABILITY',
      cb,
      'LIABILITY',
      'XAA',
      'TGA_CLAIM',
      gov,
    ),
    bankSettlementAsset: account(
      'BANK_RESERVE_ASSET',
      bank,
      'ASSET',
      'XAA',
      'BANK_RESERVE_CLAIM',
      cb,
    ),
    bankSettlementLiability: account(
      'BANK_RESERVE_LIABILITY',
      cb,
      'LIABILITY',
      'XAA',
      'BANK_RESERVE_CLAIM',
      bank,
    ),
    bankGcuAsset: account('BANK_GCU_CASH', bank, 'CASH', 'GCU', null, null),
    treasuryGcuAsset: account('GOV_GCU_CASH', gov, 'CASH', 'GCU', null, null),
  };
  const sourceId = C.openingSourceId('SOURCE_FX_TEST_ONLY'),
    source = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId,
        sourceKind: 'TEST_FIXTURE',
        locator: 'TEST_ONLY_FX_MECHANISM',
        sourceVersion: 'V1',
        payload: { purpose: 'MECHANISM_NOT_ADMISSION' },
      },
      sha,
    );
  const equity = account('BANK_GCU_EQUITY', bank, 'EQUITY', 'GCU', null, null);
  const pair = (
    id: string,
    a: C.FinancialAccount,
    b: C.FinancialAccount,
    amount: string,
  ): C.FinancialOpeningBatch => ({
    batchId: C.financialOpeningBatchId(id),
    sourceId,
    settlementCurrency: a.currency,
    legs: [
      {
        legId: C.financialOpeningLegId(id + '_D'),
        account: a,
        direction: 'DEBIT',
        amount: C.Money.from(amount, a.currency),
        counterpartLegId: C.financialOpeningLegId(id + '_C'),
      },
      {
        legId: C.financialOpeningLegId(id + '_C'),
        account: b,
        direction: 'CREDIT',
        amount: C.Money.from(amount, a.currency),
        counterpartLegId: C.financialOpeningLegId(id + '_D'),
      },
    ],
  });
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      worldId: world,
      seedId: C.openingSeedId('SEED_FX_TEST_ONLY'),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [
        pair(
          'TGA_OPEN',
          accounts.treasuryAsset,
          accounts.treasuryLiability,
          '1000',
        ),
        pair(
          'BANK_SETTLEMENT_OPEN',
          accounts.bankSettlementAsset,
          accounts.bankSettlementLiability,
          '500',
        ),
        pair('BANK_GCU_OPEN', accounts.bankGcuAsset, equity, '100'),
      ],
    },
    sha,
  );
  const financial = C.rebuildV08LedgersFromLineage({
    seed,
    sha256Hex: sha,
  }).financial;
  const quote = createPostwarDayOneFxQuoteData(
    {
      schemaVersion: 'postwar-day-one-fx-quote-v1',
      policyVersion: 'POSTWAR_DAY_ONE_FX_20261029_V1',
      worldId: world,
      seedFingerprint: seed.fingerprint,
      countryId: country,
      localCurrency: 'XAA',
      localCurrencyPerGcu: '3',
      governmentEntityId: gov,
      centralBankEntityId: cb,
      bankEntityId: bank,
      dealerGcuAccountId: accounts.bankGcuAsset.accountId,
      financialSourceId: sourceId,
      financialSourcePayloadHash: source.payloadHash,
      gcuSourceId: sourceId,
      gcuSourcePayloadHash: source.payloadHash,
      baselineFxVersion: 'TEST_ONLY_FX',
      baselineSourceSha256: '1'.repeat(64),
      policySha256: '2'.repeat(64),
      userReceiptSha256: '3'.repeat(64),
      validFromSimTime: '0',
      validUntilSimTime: C.SIMULATION_TICKS_PER_DAY,
      spreadBps: '0',
      gcuQuantum: '0.000001',
    },
    sha,
  );
  const payload = {
    schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
    quoteRef: quote.quoteRef,
    payerTreasuryAccountId: accounts.treasuryAsset.accountId,
    payerGcuAccountId: accounts.treasuryGcuAsset.accountId,
    dealerGcuAccountId: accounts.bankGcuAsset.accountId,
    localAmount: '10',
    localCurrency: 'XAA',
    expectedQuoteSha256: quote.quoteSha256,
  };
  const input = {
    quote,
    payload,
    financial,
    accounts,
    simTime: C.SimTime.fromTicks('1'),
    encumbrances: {
      worldVersion: '0',
      treasuryReservedAmount: '900',
      bankGcuReservedAmount: '10',
      sourceRef: 'TEST_ONLY_HELD_ENCUMBRANCES',
      sourceSha256: '4'.repeat(64),
    },
  };
  return { ...input, seed };
}

export function mixedSocialOriginal(countryId = 'COUNTRY_01') {
  const scope = {
    countryId,
    locationId: `LOCATION_${countryId}`,
    skill: 'HIGH' as const,
  };
  const positionId = `POSITION_${countryId}`,
    employerId = 'ENTITY_GOVERNMENT_01';
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
        wageCurrency: 'XAA',
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
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    minimumWage: {
      countryId,
      ruleId: 'TEST_ONLY_FLOOR',
      ruleVersion: 'TEST_ONLY_FLOOR_V1',
      amount: '3600',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  return { countryId, state, offers: [facts.offer], facts, scope, positionId };
}
export function mixedSocialFrame(
  original: ReturnType<typeof mixedSocialOriginal>,
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
export async function withMixedTestProof<
  T extends {
    transition: C.AuthoritativeTransition;
    receipt: C.FinalCommandReceipt;
  },
>(
  command: C.CanonicalCommand,
  capability: 'FINANCE_TREASURY' | 'FINANCE_BUDGET',
  operation: (proof: C.CommitAuthorizationProof) => Promise<T>,
): Promise<T> {
  const intakeAuthorization = await C.authorizeOfficeCapability({
    principal: {
      authSubject: subject,
      facts: { user_id: subject, display_name: null, school_id: null },
      token: {
        subject,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: at,
        expiresAt: '2026-10-30T00:00:00.000Z',
      },
    },
    resolver: {
      resolveCurrentIdentity: async () => subject,
      resolveCurrentMembership: async () => ({
        authSubject: subject,
        worldId: world,
        countryId: country,
        teamId: C.teamId('TEAM_TEST_ONLY_MIXED_FX'),
        authorizationVersion: 'REV_TEST_ONLY',
        officeAssignments: [C.officeId('FINANCE')],
        active: true,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      }),
    },
    worldId: world,
    requestedCountryId: country,
    requestedOfficeId: C.officeId('FINANCE'),
    capability,
  });
  let result: T | undefined;
  await C.processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    requiredCapability: capability,
    intakeAuthorization,
    commitSimTime: command.simTime,
    recordedAtReal: at,
    persistence: {
      readFinalReceipt: async () => null,
      recordZeroEffectReceipt: async (r) => r,
      commitAuthorizedCommand: async (input) => {
        result = await operation(input.commitAuthorization!);
        return { transition: result.transition, receipt: result.receipt };
      },
    },
  });
  if (!result) throw Error('TEST_ONLY_GENUINE_PROOF_NOT_ISSUED');
  return result;
}
export async function mixedFxFrame(input: {
  financial: C.FinancialLedgerState;
  original: ReturnType<typeof mixedFinancialFixture>;
  sequence: string;
  identity: string;
  treasuryReservedAmount?: string;
  bankGcuReservedAmount?: string;
}) {
  const X =
    await import('../../packages/core/src/finance/postwar-day-one-treasury-fx.js');
  const f = input.original,
    version = input.financial.worldVersion,
    after = (BigInt(version) + 1n).toString();
  const encumbrances = {
    worldVersion: version,
    treasuryReservedAmount: input.treasuryReservedAmount ?? '300',
    bankGcuReservedAmount: input.bankGcuReservedAmount ?? '10',
    sourceRef: 'TEST_ONLY_COMPLETE_OPENING_BUDGET_SOCIAL',
    sourceSha256: '4'.repeat(64),
  };
  const draft = X.calculatePostwarDayOneTreasuryFx(
    {
      quote: f.quote,
      payload: f.payload,
      financial: input.financial,
      accounts: f.accounts,
      simTime: C.SimTime.fromTicks('1'),
      encumbrances,
    },
    sha,
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: country,
      actorId: 'ACTOR_TEST_ONLY_FX',
      authSubject: subject,
      commandId: 'COMMAND_MIXED_FX_' + input.identity,
      commandType: 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
      correlationId: 'CORRELATION_MIXED_FX_' + input.identity,
      expectedWorldVersion: version,
      idempotencyKey: 'KEY_MIXED_FX_' + input.identity,
      officeId: 'FINANCE',
      payload: f.payload,
      simTime: '1',
      submittedAtReal: at,
    },
    sha,
  );
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      worldId: world,
      eventId: 'EVENT_MIXED_FX_' + input.identity,
      eventType: 'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1',
      worldVersion: after,
      sequence: input.sequence,
      simTime: '1',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      payload: draft.eventPayload,
      recordedAtReal: at,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: version,
    worldVersionAfter: after,
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
  return withMixedTestProof(command, 'FINANCE_TREASURY', async (proof) => {
    const settlement = await X.applyPostwarDayOneTreasuryFx(
      {
        draft,
        financial: input.financial,
        command,
        transition,
        commitAuthorization: proof,
      },
      sha,
    );
    return {
      command,
      events: [event],
      transition,
      receipt,
      financialPostingBatches: settlement.postingBatches,
      inventoryPostings: [],
      financialAfter: settlement.financial,
    };
  });
}
