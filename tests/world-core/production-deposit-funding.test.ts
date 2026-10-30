import { applyFinancialPostingBatch } from '../../packages/core/src/finance/financial-ledger.js';
/** Fixture fee/recipe is TEST_ONLY, not a new operating price or production admission. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Money,
  Quantity,
  SimTime,
  PRODUCTION_SETTLED_EVENT_TYPE,
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  commandId,
  commodityId,
  countryId,
  createAuthoritativeTransition,
  createFinancialAccount,
  createFinancialPostingBatch,
  createFoundationFact,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  createProductionConsumptionPosting,
  eventId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  legalEntityId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  productionConsumptionEventPayload,
  rebuildV08LedgersFromLineage,
  worldId,
  type FoundationTraceRequest,
  type ProductionConsumptionEvidence,
  type V08AuthoritativeLedgerTransition,
  financialClaimId,
  parseOpeningSeed,
  assertProductionFunding,
  selectSettledProductionFundingPayment,
} from '../../packages/core/src/index.js';
import { bindOpeningProductionDepositInstruments } from '../../packages/core/src/finance/production-deposit-funding.js';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const NOW = '2026-10-28T00:00:01.000Z';
const Q = (amount: string, unit: string) => ({ amount, unit });
const RATE = (amount: string, inputUnit: string, outputUnit: string) => ({
  amount,
  inputUnit,
  outputUnit,
});

function baseline(ordinary = false, small = false, actualIntent?: unknown) {
  const WORLD = worldId('WORLD_PRODUCTION_TEST'),
    COUNTRY = countryId('COUNTRY_PRODUCTION_TEST'),
    OP = legalEntityId('OP_PRODUCTION_TEST'),
    HH = legalEntityId('HH_PRODUCTION_TEST'),
    BANK = legalEntityId('BANK_PRODUCTION_TEST');
  const identity = (prefix: string, suffix: string) =>
    `${prefix}_${sha256(canonicalSerialize([WORLD, COUNTRY, suffix, 'GCU'])).toUpperCase()}`;
  const instrument = (key: string, owner: typeof OP) => {
    const shared = {
      worldId: WORLD,
      countryId: COUNTRY,
      currency: 'GCU',
      claimId: financialClaimId(identity('CLAIM', key)),
    };
    return {
      asset: createFinancialAccount({
        ...shared,
        accountId: financialAccountId(identity('ACCOUNT', key + '_ASSET')),
        accountClass: 'ASSET',
        ownerId: owner,
        counterpartyEntityId: BANK,
      }),
      liability: createFinancialAccount({
        ...shared,
        accountId: financialAccountId(identity('ACCOUNT', key + '_LIABILITY')),
        accountClass: 'LIABILITY',
        ownerId: BANK,
        counterpartyEntityId: owner,
      }),
    };
  };
  const op = instrument('BUSINESS_DEPOSIT', OP),
    hh = instrument('HOUSEHOLD_DEPOSIT', HH);
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_TEST_ONLY_DEPOSIT_CONTRACT'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'TEST_ONLY_NOT_OFFICIAL_CUSTODY',
      sourceVersion: 'TEST_ONLY.1',
      payload: {
        TEST_ONLY: true,
        schemaVersion: ordinary
          ? 'TEST_ONLY_ORDINARY_ASSET'
          : 'adopted-financial-opening-source-v2',
        assembly: {
          worldId: WORLD,
          countries: [
            {
              countryId: COUNTRY,
              roster: { operator: OP, households: HH, bank: BANK },
            },
          ],
        },
        reconciliations: [
          {
            countryId: COUNTRY,
            denominations: [
              {
                field: 'businessBankDeposits',
                localBookValue: {
                  amount: small ? '1' : '100',
                  currency: 'GCU',
                },
              },
              {
                field: 'householdBankDeposits',
                localBookValue: { amount: '100', currency: 'GCU' },
              },
            ],
          },
        ],
      },
    },
    sha256,
  );
  const ore = createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: commodityId('ORE'),
    batchId: inventoryBatchId('ORE_BATCH'),
    unit: 'tonne',
    physicalLocationId: inventoryLocationId('FACILITY_TEST'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: OP,
    riskBearerId: OP,
    economicRecognitionId: null,
  });
  const smallSeed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_ORIGINAL_DEPOSIT'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('TEST_ONLY_ORE'),
          sourceId: source.sourceId,
          account: ore,
          quantity: Quantity.from('8', 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('TEST_ONLY_ORIGINAL_DEPOSITS'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [op, hh].flatMap((pair, index) => {
            const a = financialOpeningLegId('TEST_ONLY_ASSET_' + index),
              l = financialOpeningLegId('TEST_ONLY_LIABILITY_' + index),
              amount = Money.from(index === 0 && small ? '1' : '100', 'GCU');
            return [
              {
                legId: a,
                account: pair.asset,
                direction: 'DEBIT' as const,
                amount,
                counterpartLegId: l,
              },
              {
                legId: l,
                account: pair.liability,
                direction: 'CREDIT' as const,
                amount,
                counterpartLegId: a,
              },
            ];
          }),
        },
      ],
    },
    sha256,
  );
  const seed = actualIntent
    ? parseOpeningSeed(
        {
          ...JSON.parse(canonicalSerialize(actualIntent)),
          fingerprint: canonicalSha256(
            canonicalHashInput(actualIntent),
            sha256,
          ),
        },
        sha256,
      )
    : smallSeed;
  const ledger = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha256 });
  const country = actualIntent ? 'COUNTRY_01' : COUNTRY;
  const payload = JSON.parse(seed.sources[0]!.canonicalPayload) as {
    assembly: {
      countries: {
        countryId: string;
        roster: { operator: string; bank: string; households: string };
      }[];
    };
  };
  const roster = payload.assembly.countries.find(
    (c) => c.countryId === country,
  )!.roster;
  const cash = ledger.financial.accounts.find(
    (a) =>
      a.countryId === country &&
      a.ownerId === roster.operator &&
      a.accountClass === 'ASSET' &&
      a.counterpartyEntityId === roster.bank,
  )!;
  const liability = ledger.financial.accounts.find(
    (a) =>
      a.countryId === country &&
      a.accountClass === 'LIABILITY' &&
      a.claimId === cash.claimId,
  )!;
  const householdAsset = ledger.financial.accounts.find(
    (a) =>
      a.countryId === country &&
      a.ownerId === roster.households &&
      a.accountClass === 'ASSET' &&
      a.counterpartyEntityId === roster.bank,
  )!;
  const householdLiability = ledger.financial.accounts.find(
    (a) =>
      a.accountClass === 'LIABILITY' && a.claimId === householdAsset.claimId,
  )!;
  const material = seed.inventoryEntries.find(
    (e) =>
      e.account.countryId === country &&
      e.account.titleHolderId === cash.ownerId &&
      e.account.unit === 'tonne' &&
      e.quantity.amount.greaterThanOrEqualTo('8'),
  )!;
  return {
    seed,
    cash,
    liability,
    ore: material.account,
    initial: ledger,
    householdAsset,
    householdLiability,
    householdRevenue: createFinancialAccount({
      ...householdAsset,
      accountId: financialAccountId('TEST_ONLY_HOUSEHOLD_REVENUE'),
      accountClass: 'REVENUE',
      claimId: null,
      counterpartyEntityId: null,
    }),
    expense: createFinancialAccount({
      ...cash,
      accountId: financialAccountId('TEST_ONLY_ACTUAL_EXPENSE'),
      accountClass: 'EXPENSE',
      claimId: null,
      counterpartyEntityId: null,
    }),
    bankRevenue: createFinancialAccount({
      ...cash,
      accountId: financialAccountId('TEST_ONLY_ACTUAL_BANK_FEE_REVENUE'),
      ownerId: liability.ownerId,
      accountClass: 'REVENUE',
      claimId: null,
      counterpartyEntityId: null,
    }),
  };
}
function fixture(
  options: {
    ordinary?: boolean;
    small?: boolean;
    mode?:
      | 'missing-mirror'
      | 'payable'
      | 'foreign-owner'
      | 'household-transfer'
      | 'missing-recipient-mirror';
  } = {},
  actualIntent?: unknown,
) {
  const b = baseline(options.ordinary, options.small, actualIntent);
  const { seed, cash, liability, expense, bankRevenue, ore } = b;
  const WORLD = seed.worldId,
    COUNTRY = cash.countryId,
    OP = cash.ownerId;
  const currency = cash.currency;
  const transition = (
    before: number,
    sequence: number,
    type: string,
    payload: unknown,
  ) => makeTransition(before, sequence, type, payload, '1000', WORLD, COUNTRY);
  const account = (
    batch = 'TEST_ONLY_REWORKED_STEEL',
    commodity = 'STEEL',
    unit = 'tonne',
  ) =>
    createInventoryAccount({
      ...ore,
      batchId: inventoryBatchId(batch),
      commodityId: commodityId(commodity),
      unit,
    });
  const paymentAccount =
    options.mode === 'payable'
      ? createFinancialAccount({
          ...cash,
          accountId: financialAccountId('TEST_ONLY_PAYABLE'),
          accountClass: 'PAYABLE',
          claimId: null,
          counterpartyEntityId: null,
        })
      : options.mode === 'foreign-owner'
        ? createFinancialAccount({
            ...cash,
            accountId: financialAccountId('TEST_ONLY_FOREIGN_ASSET'),
            ownerId: legalEntityId('TEST_ONLY_FOREIGN_OWNER'),
          })
        : cash;
  const paid = transition(0, 1, 'COST_SETTLED', { TEST_ONLY: true });
  const funding = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('COST_BATCH'),
      worldId: WORLD,
      causationCommandId: paid.command.commandId,
      causationEventIds: paid.transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: paid.command.simTime,
      command: paid.command,
      transition: paid.transition,
      settlementCurrency: currency,
      legs: [
        {
          legId: financialPostingLegId('COST_EXPENSE'),
          account: expense,
          direction: 'DEBIT',
          amount: Money.from('6', currency),
          counterpartyAccountId: paymentAccount.accountId,
        },
        {
          legId: financialPostingLegId('COST_CASH'),
          account: paymentAccount,
          direction: 'CREDIT',
          amount: Money.from('6', currency),
          counterpartyAccountId: expense.accountId,
        },
        ...(options.mode === 'missing-mirror' || options.mode === 'payable'
          ? []
          : options.mode === 'household-transfer' ||
              options.mode === 'missing-recipient-mirror'
            ? [
                {
                  legId: financialPostingLegId('COST_BANK_LIABILITY'),
                  account: liability,
                  direction: 'DEBIT' as const,
                  amount: Money.from('6', currency),
                  counterpartyAccountId:
                    options.mode === 'missing-recipient-mirror'
                      ? bankRevenue.accountId
                      : b.householdLiability.accountId,
                },
                {
                  legId: financialPostingLegId('COST_RECIPIENT_ASSET'),
                  account: b.householdAsset,
                  direction: 'DEBIT' as const,
                  amount: Money.from('6', currency),
                  counterpartyAccountId: b.householdRevenue.accountId,
                },
                {
                  legId: financialPostingLegId('COST_RECIPIENT_LIABILITY'),
                  account:
                    options.mode === 'missing-recipient-mirror'
                      ? bankRevenue
                      : b.householdLiability,
                  direction: 'CREDIT' as const,
                  amount: Money.from('6', currency),
                  counterpartyAccountId: liability.accountId,
                },
                {
                  legId: financialPostingLegId('COST_RECIPIENT_REVENUE'),
                  account: b.householdRevenue,
                  direction: 'CREDIT' as const,
                  amount: Money.from('6', currency),
                  counterpartyAccountId: b.householdAsset.accountId,
                },
              ]
            : [
                {
                  legId: financialPostingLegId('COST_BANK_LIABILITY'),
                  account: liability,
                  direction: 'DEBIT' as const,
                  amount: Money.from('6', currency),
                  counterpartyAccountId: bankRevenue.accountId,
                },
                {
                  legId: financialPostingLegId('COST_BANK_REVENUE'),
                  account: bankRevenue,
                  direction: 'CREDIT' as const,
                  amount: Money.from('6', currency),
                  counterpartyAccountId: liability.accountId,
                },
              ]),
      ],
    },
    sha256,
  );
  const paidLineage: V08AuthoritativeLedgerTransition = {
    ...paid,
    inventoryPostings: [],
    financialPostingBatches: [funding],
  };
  const before = rebuildV08LedgersFromLineage({
    seed,
    transitions: [paidLineage],
    sha256Hex: sha256,
  });
  const trace: FoundationTraceRequest = {
    traceRef: 'TRACE.TEST_ONLY',
    calculationVersion: 'V13.TEST_ONLY.1',
    snapshot: {
      lineageRef: 'LINEAGE.TEST_ONLY',
      sourceVersion: 'WORLD_VERSION.1',
      snapshotRef: 'SNAPSHOT.TEST_ONLY.1',
      snapshotHash: sha256(canonicalSerialize(before)),
      predecessorSnapshotHash: 'a'.repeat(64),
    },
    snapshotAt: Q('1000', 'sim_millisecond'),
  };
  const fact = <T>(name: string, payload: T) =>
    createFoundationFact({
      trace,
      factRef: `FACT.${name}`,
      sourceRef: `SOURCE.TEST_ONLY.${name}`,
      predecessorFactRefs: ['GENESIS.TEST_ONLY'],
      payload,
    });
  const evidence: ProductionConsumptionEvidence = {
    runId: 'RUN.TEST_ONLY.1',
    inventorySnapshotHash: canonicalSha256(
      canonicalHashInput(before.inventory),
      sha256,
    ),
    input: {
      trace,
      outcomeRef: 'OUTCOME.TEST_ONLY.1',
      capacity: fact('CAPACITY', {
        facilityRef: 'FACILITY.TEST',
        operationalCapacity: RATE('10', 'hour', 'tonne'),
        operatingDuration: Q('1', 'hour'),
        targetUtilisation: { amount: '1', unit: 'ratio' as const },
        productivity: RATE('1', 'tonne', 'tonne'),
      }),
      materials: [
        fact('ORE', {
          materialRef: 'MATERIAL.ORE',
          inventoryRef: ore.batchId,
          v12AvailabilityRef: 'V12.ORE',
          readOnly: true,
          usableBefore: Q(
            before.inventory.balances
              .find((b) => b.account.batchId === ore.batchId)!
              .quantity.toCanonicalValue().amount,
            'tonne',
          ),
          requiredAtPotentialOutput: Q('20', 'tonne'),
        }),
      ],
      energy: fact('ENERGY', {
        allocationRef: 'ALLOCATION.TEST',
        deliveredBefore: Q('3', 'MWh'),
        requiredAtPotentialOutput: Q('10', 'MWh'),
      }),
      labour: fact('LABOUR', {
        capacityRef: 'LABOUR.TEST',
        availableBefore: Q('10', 'person_hour'),
        requiredAtPotentialOutput: Q('10', 'person_hour'),
      }),
      logistics: fact('LOGISTICS', {
        capacityRef: 'LOGISTICS.TEST',
        availableBefore: Q('10', 'tonne_km'),
        requiredAtPotentialOutput: Q('10', 'tonne_km'),
      }),
    },
    recipe: fact('RECIPE', {
      facilityRef: 'FACILITY.TEST',
      outputCommodityId: commodityId('STEEL'),
      outputUnit: 'tonne',
      materials: [
        {
          materialRef: 'MATERIAL.ORE',
          commodityId: ore.commodityId,
          perOutput: RATE('2', 'tonne', 'tonne'),
        },
      ],
      energyPerOutput: RATE('1', 'tonne', 'MWh'),
      labourPerOutput: RATE('1', 'tonne', 'person_hour'),
      logisticsPerOutput: RATE('1', 'tonne', 'tonne_km'),
      costPerOutput: RATE('2', 'tonne', currency),
    }),
    operating: fact('OPERATING', {
      worldId: WORLD,
      worldVersion: '1',
      facilityRef: 'FACILITY.TEST',
      operatorId: OP,
      operatorClassification: 'OP',
      maintenanceAppliedRef: 'MAINTENANCE.TEST_ONLY',
      technologyRightRef: 'TECHNOLOGY.TEST_ONLY',
      operatingPermissionRef: 'PERMIT.TEST_ONLY',
      costSourceRef: 'COST.TEST_ONLY',
      fundingBatchId: funding.batchId,
      fundingFingerprint: funding.fingerprint,
      costLegId: financialPostingLegId('COST_EXPENSE'),
      settledCost: { amount: '6', currency },
    }),
    materials: [{ materialRef: 'MATERIAL.ORE', account: ore }],
    output: account('STEEL_BATCH', 'STEEL'),
  };
  const make = (
    next = evidence,
    type: string = PRODUCTION_SETTLED_EVENT_TYPE,
  ) => {
    const executed = transition(
      1,
      2,
      type,
      productionConsumptionEventPayload(next),
    );
    const posting = createProductionConsumptionPosting(
      {
        ...executed,
        postingId: inventoryPostingId('PRODUCTION_POSTING'),
        evidence: next,
      },
      sha256,
    );
    return {
      ...executed,
      posting,
      lineage: {
        ...executed,
        inventoryPostings: [posting],
        financialPostingBatches: [],
      } satisfies V08AuthoritativeLedgerTransition,
    };
  };
  return {
    seed,
    b,
    before,
    paidLineage,
    funding,
    evidence,
    make,
    run: (next = evidence) =>
      rebuildV08LedgersFromLineage({
        seed,
        transitions: [paidLineage, make(next).lineage],
        sha256Hex: sha256,
      }),
  };
}
function makeTransition(
  before: number,
  sequence: number,
  type: string,
  payload: unknown,
  ticks = '1000',
  WORLD = worldId('WORLD_PRODUCTION_TEST'),
  COUNTRY = countryId('COUNTRY_PRODUCTION_TEST'),
) {
  const simTime = SimTime.fromTicks(ticks);
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '00000000-0000-4000-8000-000000000001',
      commandId: commandId(`COMMAND_TEST_${sequence}`),
      commandType: 'TEST_ONLY_PRODUCTION_SETTLEMENT',
      correlationId: `CORRELATION_TEST_${sequence}`,
      countryId: COUNTRY,
      expectedWorldVersion: String(before),
      idempotencyKey: `IDEMPOTENCY_TEST_${sequence}`,
      officeId: null,
      payload: { TEST_ONLY: true },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: simTime.toCanonicalValue(),
      submittedAtReal: '2026-10-07T00:00:00.000Z',
      worldId: WORLD,
    },
    sha256,
  );
  const event = parseAuthoritativeEvent(
    {
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      eventId: eventId(`EVENT_TEST_${sequence}`),
      eventType: type,
      payload,
      recordedAtReal: NOW,
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: String(sequence),
      simTime: simTime.toCanonicalValue(),
      worldId: WORLD,
      worldVersion: String(before + 1),
    },
    sha256,
  );
  return {
    command,
    transition: createAuthoritativeTransition({
      command,
      worldVersionBefore: String(before),
      worldVersionAfter: String(before + 1),
      events: [event],
    }),
  };
}

describe('source-proven production deposit settlement (TEST_ONLY operations, no production authorization)', () => {
  it('supports an actual balanced bank fee settlement, joint production replay and exact funding duplicate without changing opening bytes', () => {
    const f = fixture(),
      opening = canonicalSerialize(f.seed),
      result = f.run();
    const position = (id: string) =>
      result.financial.positions
        .find((p) => p.account.accountId === id)
        ?.netDebitBalance.toCanonicalValue().amount;
    expect(position(f.b.cash.accountId)).toBe('94');
    expect(position(f.b.liability.accountId)).toBe('-94');
    expect(
      result.inventory.balances
        .find((b) => b.account.batchId === 'STEEL_BATCH')
        ?.quantity.toCanonicalValue().amount,
    ).toBe('3');
    const duplicate = applyFinancialPostingBatch(f.before.financial, f.funding);
    expect(duplicate.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.state).toBe(f.before.financial);
    expect(canonicalSerialize(f.seed)).toBe(opening);
  });
  it('settles a distinct same-bank household recipient with both claim mirrors, conserving the deposit total', () => {
    const f = fixture({ mode: 'household-transfer' }),
      result = f.run();
    const amount = (id: string) =>
      result.financial.positions.find((p) => p.account.accountId === id)!
        .netDebitBalance;
    expect(amount(f.b.cash.accountId).toCanonicalValue().amount).toBe('94');
    expect(amount(f.b.householdAsset.accountId).toCanonicalValue().amount).toBe(
      '106',
    );
    expect(
      amount(f.b.householdLiability.accountId).toCanonicalValue().amount,
    ).toBe('-106');
    expect(
      amount(f.b.cash.accountId)
        .add(amount(f.b.householdAsset.accountId))
        .toCanonicalValue().amount,
    ).toBe('200');
  });
  it('rejects different canonical content under the already applied funding batch identity', () => {
    const f = fixture();
    const conflict = createFinancialPostingBatch(
      {
        ...f.funding,
        command: f.paidLineage.command,
        transition: f.paidLineage.transition,
        legs: f.funding.legs.map((l) => ({
          ...l,
          amount: Money.from('7', l.amount.currency),
        })),
      },
      sha256,
    );
    expect(() =>
      applyFinancialPostingBatch(f.before.financial, conflict),
    ).toThrow('different canonical intent');
  });
  it('recognizes the source instrument but refuses an unpaid reservation or unapplied batch', () => {
    const f = fixture();
    expect(() =>
      assertProductionFunding(
        f.make().posting,
        [f.funding],
        f.b.initial.financial,
      ),
    ).toThrow('must be applied');
  });
  it.each([
    'missing-mirror',
    'payable',
    'foreign-owner',
    'missing-recipient-mirror',
  ] as const)(
    'rejects %s payment despite a balanced financial batch',
    (mode) => {
      const f = fixture({ mode });
      expect(() => f.run()).toThrow();
    },
  );
  it('never promotes an arbitrary ASSET/claim or a negative original deposit to cash', () => {
    expect(() => fixture({ ordinary: true }).run()).toThrow(
      'settled cash/deposit',
    );
    expect(() => fixture({ small: true }).run()).toThrow('nonnegative asset');
  });
  it('does not mint instrument proof from serialized seed/financial DTOs', () => {
    const f = fixture();
    expect(() =>
      bindOpeningProductionDepositInstruments(
        JSON.parse(canonicalSerialize(f.seed)) as typeof f.seed,
        f.b.initial.financial,
        sha256,
      ),
    ).toThrow('genuine opening seed');
  });
  const actualFile = process.env.ECONMIND_PRODUCTION_ACTUAL_FINANCIAL_INTENT;
  it.runIf(Boolean(actualFile))(
    'uses exact retained c427 original source/accounts: unpaid rejected; symmetric TEST_ONLY fee then real joint production accepted',
    async () => {
      const actual = JSON.parse(await readFile(actualFile!, 'utf8')) as unknown;
      const f = fixture({}, actual),
        p = f.make().posting;
      const provenance = JSON.parse(
        await readFile(actualFile! + '.provenance.json', 'utf8'),
      ) as { parentSeedFingerprint: string; parentSeedFileSha256: string };
      expect(provenance.parentSeedFingerprint).toBe(
        'sha256:c42757599f51fe7e21ff52c152387c1f6a27649ff0cd199dd39b7d2205386589',
      );
      expect(provenance.parentSeedFileSha256).toBe(
        '0050d72588d4f5bf7c26d76ffe612a3f131fbfa0d384601bef480023f25dd399',
      );

      expect(f.b.cash.accountClass).toBe('ASSET');
      expect(f.b.cash.currency).toBe('XAA');
      expect(f.b.cash.ownerId).toBe('ENTITY_OPERATOR_01');
      expect(() =>
        assertProductionFunding(p, [f.funding], f.b.initial.financial),
      ).toThrow('must be applied');
      const result = f.run();
      const before = f.b.initial.financial.positions.find(
        (p) => p.account.accountId === f.b.cash.accountId,
      )!.netDebitBalance;
      const after = result.financial.positions.find(
        (p) => p.account.accountId === f.b.cash.accountId,
      )!.netDebitBalance;
      expect(before.subtract(after).toCanonicalValue().amount).toBe('6');
      expect(
        selectSettledProductionFundingPayment(p, f.funding, result.financial)
          .account.accountId,
      ).toBe(f.b.cash.accountId);
      const evidenceDirectory =
        process.env.ECONMIND_PRODUCTION_FUNDING_EVIDENCE_DIR;
      if (evidenceDirectory) {
        await mkdir(evidenceDirectory, { recursive: true });
        await writeFile(
          evidenceDirectory + '/actual-source-result.json',
          JSON.stringify(
            {
              classification:
                'TEST_ONLY_SYMMETRIC_FEE_AND_RECIPE_USING_EXACT_C427_SOURCE_FINANCIAL_INVENTORY_SLICE_NOT_FORMAL_PRODUCTION_CUSTODY',
              provenance,
              sliceFingerprint: f.seed.fingerprint,
              sourceId: f.seed.sources[0]!.sourceId,
              sourcePayloadHash: f.seed.sources[0]!.payloadHash,
              retainedFinancialBatches: f.seed.financialBatches.length,
              retainedOriginalInventoryEntries: f.seed.inventoryEntries.length,
              countryId: f.b.cash.countryId,
              operatorId: f.b.cash.ownerId,
              accountId: f.b.cash.accountId,
              accountClass: f.b.cash.accountClass,
              bankIssuerId: f.b.liability.ownerId,
              claimId: f.b.cash.claimId,
              currency: f.b.cash.currency,
              before: before.toCanonicalValue(),
              after: after.toCanonicalValue(),
              fixturePaidAmount: '6',
              paymentBatchFingerprint: f.funding.fingerprint,
              productionPostingFingerprint: p.fingerprint,
              resultWorldVersion: result.worldVersion,
              unpaidRefused: true,
              sourceFinancialBatchesUntouched: true,
              actualFullC427Replay: false,
              formalProductionAdmission: false,
              WorldClock: false,
            },
            null,
            2,
          ) + '\n',
        );
      }
    },
  );
});
