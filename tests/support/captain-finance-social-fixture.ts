/** Full ordered TEST_ONLY Core economic frames, never a DB/source approval. */
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
  type FinanceSocialFxOriginal,
  type FinanceSocialFxOpeningEncumbrance,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  prepareFinanceNativeBudgetTransition,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetSource,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  mixedFinancialFixture,
  mixedSocialOriginal,
  withMixedTestProof,
  mixedWorld as world,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
const at = '2026-10-29T00:00:00.000Z';
export function createCaptainMixedTestFixture(
  captainCountries = [testOnlyCaptainOriginal()],
) {
  const f = mixedFinancialFixture(),
    social = mixedSocialOriginal(),
    a = f.accounts;
  const fxOriginals: FinanceSocialFxOriginal[] = [
    {
      quote: f.quote,
      treasuryAsset: a.treasuryAsset,
      treasuryLiability: a.treasuryLiability,
      bankSettlementAsset: a.bankSettlementAsset,
      bankSettlementLiability: a.bankSettlementLiability,
      bankGcuAsset: a.bankGcuAsset,
    },
  ];
  const openingEncumbrances: FinanceSocialFxOpeningEncumbrance[] = [
    {
      reference: 'OPENING_TREASURY_TEST_ONLY',
      accountId: a.treasuryAsset.accountId,
      amount: '200',
      currency: 'XAA',
    },
    {
      reference: 'OPENING_BANK_GCU_TEST_ONLY',
      accountId: a.bankGcuAsset.accountId,
      amount: '10',
      currency: 'GCU',
    },
  ];
  const prepared = prepareFinanceSocialLedger(f.financial);
  const replay = (frames: readonly FinanceNativeBudgetCanonicalFrame[]) =>
    replayPreparedFinanceSocialFxLedger({
      prepared,
      frames,
      captainCountries,
      socialCountries: [social],
      openingEncumbrances,
      fxOriginals,
      expectedHead: {
        worldVersion: frames.at(-1)?.transition.worldVersionAfter ?? '0',
        eventSequence: frames.at(-1)?.events.at(-1)?.sequence ?? '0',
      },
      sha256Hex: sha,
    });
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
    ruleRevision: 'TEST_ONLY_RULE',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: world,
    countryId: 'COUNTRY_01',
    governmentEntityId: a.treasuryAsset.ownerId,
    currency: 'XAA',
    envelopeRef: 'ENVELOPE_MIXED_FX_TEST_ONLY',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '86400000',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ): FinanceNativeBudgetSource => {
    const current = replay(frames),
      opening = [openingEncumbrances[0]!];
    return {
      policy,
      binding: {
        seedRef: f.seed.seedId,
        seedFingerprint: f.seed.fingerprint,
        admissionRef: 'TEST_ONLY_ADMISSION',
        financialSourceId: f.seed.sources[0]!.sourceId,
        originalsSHA256: 'sha256:' + 'b'.repeat(64),
        policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
        treasuryAccountId: a.treasuryAsset.accountId,
        treasuryClaimId: a.treasuryAsset.claimId!,
        openingEncumbranceHash: C.canonicalSha256(
          C.canonicalHashInput(opening),
          sha,
        ),
      },
      openingEncumbrances: opening,
      financialState: current.financial,
      mixedPrefixEvidence: current.mixedPrefixEvidence,
      frames,
      worldVersion: current.budgetState.worldVersion,
      eventSequence: current.budgetState.eventSequence,
    };
  };
  const command = (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY_MIXED',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'COMMAND_MIXED_' + identity,
        idempotencyKey: 'KEY_MIXED_' + identity,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        expectedWorldVersion:
          frames.at(-1)?.transition.worldVersionAfter ?? '0',
        simTime: '1',
        correlationId: 'CORRELATION_MIXED_' + identity,
        submittedAtReal: at,
        payload: {
          operation,
          scope: {
            worldId: world,
            countryId: 'COUNTRY_01',
            entityRef: policy.governmentEntityId,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: 'XAA',
          amount,
          envelopeRevisionRef: 'ENVELOPE_REV_MIXED',
          lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_MIXED_FX',
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_MIXED'
              : 'LINE_REV_MIXED',
          predecessorRevisionRef: null,
        },
      },
      sha,
    );
  const budgetFrame = async (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) => {
    const c = command(operation, frames, identity, amount),
      s = source(frames);
    const value = await withMixedTestProof(c, 'FINANCE_BUDGET', (proof) =>
      prepareFinanceNativeBudgetTransition({
        command: c,
        authorization: proof,
        source: s,
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    );
    return {
      command: c,
      events: value.transition.events,
      transition: value.transition,
      receipt: value.receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    };
  };
  return {
    f,
    social,
    fxOriginals,
    openingEncumbrances,
    prepared,
    replay,
    policy,
    source,
    command,
    budgetFrame,
  };
}

export function testOnlyCaptainOriginal(countryId = 'COUNTRY_01') {
  const q = (amount: string) => ({ amount, unit: 'political_capital' });
  return {
    countryId,
    capital: {
      capitalRef: 'CAPITAL_TEST_ONLY_' + countryId,
      countryRef: countryId,
      opening: q('100'),
      generated: q('0'),
      total: q('100'),
      available: q('100'),
      spent: q('0'),
      closing: q('100'),
      buckets: C.POLITICAL_CAPITAL_BUCKETS.map((bucket, i) => ({
        bucket,
        balance: q(i === 0 ? '40' : '10'),
      })),
    },
  };
}
export function testOnlyCaptainFrame(input: {
  fixture: ReturnType<typeof createCaptainMixedTestFixture>;
  frames: readonly FinanceNativeBudgetCanonicalFrame[];
  countryId?: string;
  identity: string;
  amount?: string;
}) {
  const countryId = input.countryId ?? 'COUNTRY_01',
    current = input.fixture.replay(input.frames);
  const state = current.captainCountries!.find(
    (c) => c.countryId === countryId,
  )?.state;
  if (!state) throw Error('TEST_ONLY_CAPTAIN_COUNTRY_REQUIRED');
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId,
      officeId: 'CAPTAIN',
      actorId: 'ACTOR_TEST_ONLY_CAPTAIN',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandType: C.CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      commandId: 'COMMAND_CAPTAIN_' + input.identity,
      idempotencyKey: 'KEY_CAPTAIN_' + input.identity,
      expectedWorldVersion: state.worldVersion,
      simTime: '1',
      correlationId: 'CORRELATION_CAPTAIN_' + input.identity,
      submittedAtReal: at,
      payload: {
        schemaVersion: C.CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
        fromBucket: 'FISCAL_REFORM',
        toBucket: 'INDUSTRIAL_STRATEGY',
        amount: { amount: input.amount ?? '2', unit: 'political_capital' },
        reasonFactRef: 'REASON_TEST_ONLY_' + countryId,
      },
    },
    sha,
  );
  const trace: C.FoundationTraceRequest = {
    traceRef: 'TRACE_TEST_ONLY_' + input.identity,
    calculationVersion: 'CAPTAIN_TEST_ONLY_V1',
    snapshot: {
      lineageRef: world,
      sourceVersion: 'WORLD_VERSION_' + state.worldVersion,
      snapshotRef: 'SNAPSHOT_TEST_ONLY_' + input.identity,
      snapshotHash: '0'.repeat(64),
      predecessorSnapshotHash: null,
    },
    snapshotAt: { amount: '1', unit: 'sim_millisecond' },
  };
  const facts = (trace: C.FoundationTraceRequest) => ({
    capitalFact: C.createFoundationFact({
      trace,
      factRef: 'CAPITAL_FACT_TEST_ONLY_' + input.identity,
      sourceRef: 'CAPTAIN_SOURCE_TEST_ONLY',
      predecessorFactRefs: ['GENESIS_TEST_ONLY_' + countryId],
      payload: state.capital,
    }),
    reasonFact: C.createFoundationFact({
      trace,
      factRef: 'REASON_TEST_ONLY_' + countryId,
      sourceRef: 'REASON_SOURCE_TEST_ONLY',
      predecessorFactRefs: ['REASON_ORIGINAL_TEST_ONLY_' + countryId],
      payload: {
        countryRef: countryId,
        recordRef: 'RECORD_TEST_ONLY_' + countryId,
        reason:
          'TEST_ONLY transfer from original existing capital; no generation',
      },
    }),
  });
  const scope = {
    worldId: world,
    countryId,
    worldVersion: state.worldVersion,
    lastEventSequence: state.lastEventSequence,
  };
  const bound = {
    ...trace,
    snapshot: {
      ...trace.snapshot,
      snapshotHash: C.captainPoliticalCapitalSourceHash(
        { ...scope, ...facts(trace) },
        sha,
      ),
    },
  };
  const source = { ...scope, trace: bound, ...facts(bound) };
  const prepared = C.prepareCaptainPoliticalCapitalEvent({
    command,
    source,
    eventId: 'EVENT_CAPTAIN_' + input.identity,
    recordedAtReal: at,
    sha256Hex: sha,
  });
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: state.worldVersion,
    worldVersionAfter: prepared.event.worldVersion,
    events: [prepared.event],
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
    transition,
    receipt,
    events: [prepared.event],
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
