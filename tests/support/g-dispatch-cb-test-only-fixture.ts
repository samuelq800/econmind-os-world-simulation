// TEST_ONLY builders derived from existing fixed Core fixtures. No official genesis, readiness or runtime admission.
import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Money,
  CENTRAL_BANK_OMO_COMMAND,
  centralBankOmoSourceHash,
  createFinancialAccount,
  createOpeningSeed,
  createOpeningSource,
  financialAccountId,
  financialClaimId,
  financialOpeningBatchId,
  financialOpeningLegId,
  legalEntityId,
  countryId,
  openingSeedId,
  openingSourceId,
  worldId,
  workerId,
  acquireWorldWriterLease,
  worldWriterLeaseRequest,
  createWorldWriterCommitAssertion,
  parseCanonicalCommand,
  rebuildV08LedgersFromLineage,
  type CentralBankOmoIntent,
  type CentralBankOmoSource,
  type CentralBankOmoSourceFacts,
  type CommercialBankLedgerSnapshot,
  type CentralBankLedgerSnapshot,
  type FinancialAccount,
  type FinancialAccountClass,
} from '@econmind/core';
import type { CentralBankOmoPreparation } from '../../apps/world-worker/src/persistence/central-bank-omo-candidate-source.js';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const WORLD = worldId('WORLD_TEST_ONLY_CB1');
const COUNTRY = countryId('COUNTRY_TEST_ONLY_CB1');
const BANK = legalEntityId('ENTITY_TEST_ONLY_BANK');
const CB = legalEntityId('ENTITY_TEST_ONLY_CB');
const TREASURY = legalEntityId('ENTITY_TEST_ONLY_TREASURY');
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-07T00:00:00.000Z';
const money = (amount: string) => ({ amount, currency: 'GBP' });
const bankTemplate: CommercialBankLedgerSnapshot = {
  bankRef: BANK,
  centralBankRef: CB,
  currency: 'GBP',
  reservesAtCentralBank: money('100'),
  settlementCash: money('10'),
  loanAssets: money('10'),
  governmentSecurities: money('100'),
  otherAssets: money('10'),
  demandDeposits: money('100'),
  savingsDeposits: money('10'),
  timeDeposits: money('10'),
  wholesaleFunding: money('10'),
  centralBankRefinancingBorrowing: money('10'),
  centralBankEmergencyLiquidityBorrowing: money('10'),
  otherLiabilities: money('10'),
  equity: money('70'),
  nonPerformingLoans: money('0'),
};
const centralBankTemplate: CentralBankLedgerSnapshot = {
  centralBankRef: CB,
  commercialBankRef: BANK,
  currency: 'GBP',
  governmentSecurities: money('100'),
  regularRefinancingLoans: money('10'),
  emergencyLiquidityLoans: money('10'),
  otherAssets: money('10'),
  currencyInCirculation: money('10'),
  commercialBankReserves: money('100'),
  treasuryDeposits: money('5'),
  centralBankBills: money('5'),
  otherLiabilities: money('5'),
  equity: money('5'),
};

export function centralBankTestOnlyFixture(
  direction: CentralBankOmoIntent['direction'] = 'BUY_GOVERNMENT_SECURITIES',
  faceAmount = '8',
  reserveAmount = '100',
) {
  const bank: CommercialBankLedgerSnapshot = {
    ...bankTemplate,
    reservesAtCentralBank: money(reserveAmount),
    equity: money(
      Money.from(reserveAmount, 'GBP')
        .subtract(Money.from('30', 'GBP'))
        .amount.toString(),
    ),
  };
  const centralBank: CentralBankLedgerSnapshot = {
    ...centralBankTemplate,
    commercialBankReserves: money(reserveAmount),
    equity: money(
      Money.from('105', 'GBP')
        .subtract(Money.from(reserveAmount, 'GBP'))
        .amount.toString(),
    ),
  };
  const accounts: FinancialAccount[] = [];
  const mappings = (
    snapshot: CommercialBankLedgerSnapshot | CentralBankLedgerSnapshot,
    owner: typeof BANK,
  ) => {
    const result: Record<string, ReturnType<typeof financialAccountId>> = {};
    for (const [field, value] of Object.entries(snapshot)) {
      if (field === 'nonPerformingLoans' || typeof value !== 'object') continue;
      const liability =
        /Deposits|Funding|Borrowing|Liabilities|currencyInCirculation|commercialBankReserves|treasuryDeposits|centralBankBills/u.test(
          field,
        );
      const accountClass: FinancialAccountClass =
        field === 'equity'
          ? 'EQUITY'
          : field === 'settlementCash'
            ? 'CASH'
            : liability
              ? 'LIABILITY'
              : 'ASSET';
      const reserve =
        field === 'reservesAtCentralBank' || field === 'commercialBankReserves';
      const account = createFinancialAccount({
        worldId: WORLD,
        countryId: COUNTRY,
        ownerId: owner,
        accountId: financialAccountId(`${owner}_${field.toUpperCase()}`),
        currency: 'GBP',
        accountClass,
        claimId: reserve ? financialClaimId('CLAIM_TEST_ONLY_R') : null,
        counterpartyEntityId: reserve ? (owner === BANK ? CB : BANK) : null,
      });
      accounts.push(account);
      result[field] = account.accountId;
    }
    return result;
  };
  const bankAccounts = mappings(bank, BANK);
  const centralBankAccounts = mappings(centralBank, CB);
  const openingSource = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_TEST_ONLY_CB1'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/cb1-omo-source-draft.test.ts',
      sourceVersion: 'TEST_ONLY_CB1_V1',
      payload: { notice: 'NOT_OFFICIAL_NO_70_COUNTRY_AUTHORITY' },
    },
    sha,
  );
  const leg = (account: FinancialAccount) =>
    financialOpeningLegId(`OPEN_${account.accountId}`);
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_CB1'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [openingSource],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('BATCH_TEST_ONLY_OPEN_CB1'),
          sourceId: openingSource.sourceId,
          settlementCurrency: 'GBP',
          legs: accounts.map((account) => {
            const bankOwned = account.ownerId === BANK;
            const map = bankOwned ? bankAccounts : centralBankAccounts;
            const field = Object.keys(map).find(
              (key) => map[key] === account.accountId,
            )!;
            const snapshot = (bankOwned
              ? bank
              : centralBank) as unknown as Record<string, { amount: string }>;
            const debit =
              account.accountClass === 'ASSET' ||
              account.accountClass === 'CASH' ||
              (account.accountClass === 'EQUITY' &&
                Money.from(snapshot[field]!.amount, 'GBP').amount.lt('0'));
            const counterpartId =
              account.claimId !== null
                ? bankOwned
                  ? centralBankAccounts.commercialBankReserves!
                  : bankAccounts.reservesAtCentralBank!
                : debit
                  ? bankOwned
                    ? map.demandDeposits!
                    : map.treasuryDeposits!
                  : map.governmentSecurities!;
            return {
              legId: leg(account),
              account,
              direction: debit ? ('DEBIT' as const) : ('CREDIT' as const),
              amount: Money.from(
                Money.from(snapshot[field]!.amount, 'GBP')
                  .amount.abs()
                  .toString(),
                'GBP',
              ),
              counterpartLegId: leg(
                accounts.find((entry) => entry.accountId === counterpartId)!,
              ),
            };
          }),
        },
      ],
    },
    sha,
  );
  const intent: CentralBankOmoIntent = {
    schemaVersion: 'central-bank-omo-intent-v1',
    direction,
    securityRef: 'SECURITY_TEST_ONLY_GOV',
    batchRef: 'BATCH_TEST_ONLY_GOV',
    faceValue: money(faceAmount),
    settlementSimTime: '10000',
    policyNote: null,
  };
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_TEST_ONLY_CB1',
      authSubject: SUBJECT,
      commandId: `COMMAND_CB1_${direction}`,
      commandType: CENTRAL_BANK_OMO_COMMAND,
      correlationId: 'CORRELATION_CB1',
      countryId: COUNTRY,
      expectedWorldVersion: '0',
      idempotencyKey: `IDEMPOTENCY_CB1_${direction}`,
      officeId: 'CENTRAL_BANK',
      payload: intent,
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: '10000',
      submittedAtReal: AT,
      worldId: WORLD,
    },
    sha,
  );
  const facts: CentralBankOmoSourceFacts = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '0',
    currentSimTime: '10000',
    currentEventSequence: '0',
    domesticTreasuryRef: TREASURY,
    bank,
    centralBank,
    bankAccounts,
    centralBankAccounts,
    holdings: [BANK, CB].map((holderRef) => ({
      securityRef: intent.securityRef,
      batchRef: intent.batchRef,
      issuerRef: TREASURY,
      holderRef,
      currency: 'GBP',
      maturitySimTime: '100000',
      faceValue: '80',
      encumberedFaceValue: '0',
      carryingValue: '100',
    })),
    quote: {
      quoteRef: 'QUOTE_TEST_ONLY_GOV',
      securityRef: intent.securityRef,
      batchRef: intent.batchRef,
      issuerRef: TREASURY,
      currency: 'GBP',
      pricePerFace: '1.25',
      validAtSimTime: '10000',
      sourceRef: 'SOURCE_TEST_ONLY_QUOTE',
      worldVersion: '0',
    },
  };
  const source: CentralBankOmoSource = {
    facts,
    financialState: rebuildV08LedgersFromLineage({ seed, sha256Hex: sha })
      .financial,
    trace: {
      traceRef: 'TRACE_TEST_ONLY_CB1',
      calculationVersion: 'CB1.V1',
      snapshot: {
        lineageRef: 'LINEAGE_TEST_ONLY_CB1',
        sourceVersion: 'WORLD_VERSION.0',
        snapshotRef: 'SNAPSHOT_TEST_ONLY_CB1',
        snapshotHash: centralBankOmoSourceHash(facts, sha),
        predecessorSnapshotHash: null,
      },
      snapshotAt: { amount: '10000', unit: 'sim_millisecond' },
    },
  };
  const preparation: CentralBankOmoPreparation = {
    source,
    commitAssertion: createWorldWriterCommitAssertion(
      acquireWorldWriterLease(
        null,
        worldWriterLeaseRequest(
          WORLD,
          workerId('WORKER_TEST_ONLY_CB1'),
          AT,
          '2026-10-07T00:01:00.000Z',
        ),
      ).lease,
      '0',
    ),
    eventId: 'EVENT_TEST_ONLY_CB1',
    eventSequence: '1',
    financialBatchId: 'POSTING_TEST_ONLY_CB1',
    outboxMessageId: 'OUTBOX_TEST_ONLY_CB1',
  };
  return { command, seed, intent, preparation };
}
