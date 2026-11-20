/** Canonical TEST_ONLY mechanism ledgers; never production source/approval. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  createPostwarDayOneFxQuoteData,
  calculatePostwarDayOneTreasuryFx,
  parsePostwarDayOneTreasuryFxPayload,
  applyPostwarDayOneTreasuryFx,
  replayPostwarDayOneTreasuryFxFrame,
  assertPostwarDayOneTreasuryFxCommitBinding,
  type PostwarDayOneTreasuryFxAccounts,
} from '@econmind/core/postwar-day-one-treasury-fx';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = C.worldId('WORLD_FX_TEST_ONLY'),
  country = C.countryId('COUNTRY_01');
function fixture() {
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

async function settledFixture() {
  const f = fixture(),
    draft = calculatePostwarDayOneTreasuryFx(f, sha),
    at = '2026-10-29T00:00:00.000Z',
    subject = C.authSubject('11111111-1111-4111-8111-111111111111');
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: country,
      actorId: 'ACTOR_TEST_ONLY_TREASURY',
      authSubject: subject,
      commandId: 'COMMAND_TEST_ONLY_FX',
      commandType: 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
      correlationId: 'CORRELATION_TEST_ONLY_FX',
      expectedWorldVersion: '0',
      idempotencyKey: 'KEY_TEST_ONLY_FX',
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
      eventId: 'EVENT_TEST_ONLY_FX',
      eventType: 'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1',
      sequence: '1',
      worldVersion: '1',
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
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const receipt = C.createFinalCommandReceipt({
    command,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: command.simTime,
    recordedAtReal: at,
  });
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
        teamId: C.teamId('TEAM_TEST_ONLY_TREASURY'),
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
    requestedOfficeId: 'FINANCE',
    capability: 'FINANCE_TREASURY',
  });
  let proof: C.CommitAuthorizationProof | undefined,
    settlement:
      Awaited<ReturnType<typeof applyPostwarDayOneTreasuryFx>> | undefined;
  await C.processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    requiredCapability: 'FINANCE_TREASURY',
    intakeAuthorization,
    commitSimTime: command.simTime,
    recordedAtReal: at,
    persistence: {
      readFinalReceipt: async () => null,
      recordZeroEffectReceipt: async (r) => r,
      commitAuthorizedCommand: async (input) => {
        proof = input.commitAuthorization!;
        settlement = await applyPostwarDayOneTreasuryFx(
          {
            draft,
            financial: f.financial,
            command,
            transition,
            commitAuthorization: proof,
          },
          sha,
        );
        return { transition, receipt };
      },
    },
  });
  if (!proof || !settlement) throw Error('TEST_ONLY_FX_NOT_ACTUALLY_COMMITTED');
  return { f, command, transition, receipt, proof, settlement };
}
describe('exact first-day Treasury FX calculation and guards', () => {
  it('keeps original LC_PER_GCU units exact, floors GCU and leaves all unused LC with payer without fees', () => {
    const f = fixture(),
      d = calculatePostwarDayOneTreasuryFx(f, sha);
    expect(d.filledGcu).toBe('3.333333');
    expect(d.actualLocalDebit).toBe('9.999999');
    expect(d.unusedLocalMaximum).toBe('0.000001');
    expect(d.eventPayload.fee).toBe('0');
    expect(d.eventPayload.officialGcuReserveEffect).toBe('0');
    expect(d.accounts.treasuryLiability.ownerId).toBe('ENTITY_CENTRAL_BANK_01');
  });
  it('accepts only the first full Core simulation day, including the last tick but excluding rollover', () => {
    const f = fixture();
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        { ...f, simTime: C.SimTime.fromTicks('86399999') },
        sha,
      ),
    ).not.toThrow();
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        { ...f, simTime: C.SimTime.fromTicks(C.SIMULATION_TICKS_PER_DAY) },
        sha,
      ),
    ).toThrow('unexpired');
  });
  it('deducts actual reservations and rejects unavailable Treasury or bank funds instead of spending total balances', () => {
    const f = fixture();
    for (const encumbrances of [
      { ...f.encumbrances, treasuryReservedAmount: '995' },
      { ...f.encumbrances, bankGcuReservedAmount: '99' },
    ])
      expect(() =>
        calculatePostwarDayOneTreasuryFx({ ...f, encumbrances }, sha),
      ).toThrow('unreserved');
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        { ...f, encumbrances: { ...f.encumbrances, worldVersion: '1' } },
        sha,
      ),
    ).toThrow('encumbrance');
  });
  it('rejects foreign owners, broken claim mirrors, use of official reserve assets and forged ledger snapshots', () => {
    const f = fixture();
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        {
          ...f,
          accounts: {
            ...f.accounts,
            bankGcuAsset: {
              ...f.accounts.bankGcuAsset,
              ownerId: C.legalEntityId('ENTITY_CENTRAL_BANK_01'),
            },
          },
        },
        sha,
      ),
    ).toThrow();
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        {
          ...f,
          accounts: {
            ...f.accounts,
            treasuryLiability: {
              ...f.accounts.treasuryLiability,
              claimId: C.financialClaimId('OTHER_CLAIM'),
            },
          },
        },
        sha,
      ),
    ).toThrow('mirror');
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        { ...f, financial: { ...f.financial } },
        sha,
      ),
    ).toThrow('actual ledger');
  });
  it('rejects source quote rehash mismatch and all unsupported intent fields/OP authority', () => {
    const f = fixture();
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        { ...f, quote: { ...f.quote, localCurrencyPerGcu: '1' } },
        sha,
      ),
    ).toThrow('quote hash');
    expect(() =>
      parsePostwarDayOneTreasuryFxPayload({
        ...f.payload,
        ownerMandateRef: 'FAKE_OP',
      }),
    ).toThrow('exact Treasury intent');
    expect(() =>
      calculatePostwarDayOneTreasuryFx(
        { ...f, payload: { ...f.payload, localAmount: '0.0000001' } },
        sha,
      ),
    ).toThrow('quantum');
  });
  it('actually applies all six legs under a genuine Treasury proof and replays the same two-currency transition from persisted JSON', async () => {
    const { f, command, transition, receipt, proof, settlement } =
      await settledFixture();
    expect(settlement.postingBatches.map((b) => b.legs.length)).toEqual([4, 2]);
    const balance = (id: string) =>
      C.canonicalDecimal(
        settlement.financial.positions.find((p) => p.account.accountId === id)!
          .netDebitBalance.amount,
      );
    expect(balance('TGA_ASSET')).toBe('990.000001');
    expect(balance('TGA_LIABILITY')).toBe('-990.000001');
    expect(balance('BANK_RESERVE_ASSET')).toBe('509.999999');
    expect(balance('BANK_RESERVE_LIABILITY')).toBe('-509.999999');
    expect(balance('BANK_GCU_CASH')).toBe('96.666667');
    expect(balance('GOV_GCU_CASH')).toBe('3.333333');
    expect(() =>
      assertPostwarDayOneTreasuryFxCommitBinding(
        {
          settlement,
          command,
          transition,
          financialPostingBatches: settlement.postingBatches,
          commitAuthorization: proof,
        },
        sha,
      ),
    ).not.toThrow();
    expect(() =>
      assertPostwarDayOneTreasuryFxCommitBinding(
        {
          settlement: { ...settlement },
          command,
          transition,
          financialPostingBatches: settlement.postingBatches,
          commitAuthorization: proof,
        },
        sha,
      ),
    ).toThrow('genuine');
    const financialPostingBatches = JSON.parse(
      C.canonicalSerialize(settlement.postingBatches),
    ) as unknown[];
    const replayInput = {
      financialBefore: f.financial,
      quote: f.quote,
      accounts: f.accounts,
      encumbrances: f.encumbrances,
      frame: {
        command,
        transition,
        receipt,
        financialPostingBatches,
        inventoryPostings: [],
      },
    };
    const replay = replayPostwarDayOneTreasuryFxFrame(replayInput, sha);
    expect(C.canonicalSerialize(replay.financial)).toBe(
      C.canonicalSerialize(settlement.financial),
    );
    const lineage = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [
        {
          command,
          transition,
          financialPostingBatches: settlement.postingBatches,
          inventoryPostings: [],
        },
      ],
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(lineage.financial)).toBe(
      C.canonicalSerialize(settlement.financial),
    );
    expect(() =>
      replayPostwarDayOneTreasuryFxFrame(
        {
          ...replayInput,
          frame: {
            ...replayInput.frame,
            financialPostingBatches: financialPostingBatches.slice(0, 1),
          },
        },
        sha,
      ),
    ).toThrow('persisted complete FX');
    expect(() =>
      assertPostwarDayOneTreasuryFxCommitBinding(
        {
          settlement: replay,
          command,
          transition,
          financialPostingBatches: replay.postingBatches,
          commitAuthorization: proof,
        },
        sha,
      ),
    ).toThrow('genuine');
  });
});
