/** Explicit TEST_ONLY paid production and actual Core water allocations.
 * These pure semantics tests do not claim source admission/native persistence. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
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
  type InventoryAccount,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import {
  PRODUCTION_WATER_CONSUMED_EVENT,
  createProductionWaterConsumptionState,
  prepareProductionWaterConsumption,
  bindProductionWaterConsumptionToTransition,
  assertProductionWaterConsumptionCommitBinding,
  replayProductionWaterConsumptionHistory,
  type ProductionWaterRecipe,
} from '@econmind/core/production-water-consumption';
const sha256 = (input: string) =>
  createHash('sha256').update(input).digest('hex');
const WORLD = worldId('WORLD_PRODUCTION_TEST');
const COUNTRY = countryId('COUNTRY_PRODUCTION_TEST');
const OP = legalEntityId('OP_PRODUCTION_TEST');
const NOW = '2026-10-07T00:00:01.000Z';
const Q = (amount: string, unit: string) => ({ amount, unit });
const RATE = (amount: string, inputUnit: string, outputUnit: string) => ({
  amount,
  inputUnit,
  outputUnit,
});
function account(
  batch = 'ORE_BATCH',
  commodity = 'ORE',
  unit = 'tonne',
): InventoryAccount {
  return createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: commodityId(commodity),
    batchId: inventoryBatchId(batch),
    unit,
    physicalLocationId: inventoryLocationId('FACILITY_TEST'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: OP,
    riskBearerId: OP,
    economicRecognitionId: null,
  });
}
function fixture(cashAmount = '100') {
  const ore = account();
  const cash = createFinancialAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    ownerId: OP,
    accountId: financialAccountId('CASH_TEST'),
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const equity = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('EQUITY_TEST'),
    accountClass: 'EQUITY',
  });
  const expense = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('EXPENSE_TEST'),
    accountClass: 'EXPENSE',
  });
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_TEST_ONLY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/production-consumption-posting.test.ts',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: true },
    },
    sha256,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('ORE_OPENING'),
          sourceId: source.sourceId,
          account: ore,
          quantity: Quantity.from('8', 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('CASH_OPENING'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: financialOpeningLegId('CASH_OPENING_LEG'),
              account: cash,
              direction: 'DEBIT',
              amount: Money.from(cashAmount, 'GCU'),
              counterpartLegId: financialOpeningLegId('EQUITY_OPENING_LEG'),
            },
            {
              legId: financialOpeningLegId('EQUITY_OPENING_LEG'),
              account: equity,
              direction: 'CREDIT',
              amount: Money.from(cashAmount, 'GCU'),
              counterpartLegId: financialOpeningLegId('CASH_OPENING_LEG'),
            },
          ],
        },
      ],
    },
    sha256,
  );
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
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: financialPostingLegId('COST_EXPENSE'),
          account: expense,
          direction: 'DEBIT',
          amount: Money.from('6', 'GCU'),
          counterpartyAccountId: cash.accountId,
        },
        {
          legId: financialPostingLegId('COST_CASH'),
          account: cash,
          direction: 'CREDIT',
          amount: Money.from('6', 'GCU'),
          counterpartyAccountId: expense.accountId,
        },
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
          usableBefore: Q('8', 'tonne'),
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
      costPerOutput: RATE('2', 'tonne', 'GCU'),
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
      settledCost: { amount: '6', currency: 'GCU' },
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
function transition(
  before: number,
  sequence: number,
  type: string,
  payload: unknown,
  ticks = '1000',
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

function waterFixture(
  input: {
    holder?: string;
    country?: string;
    region?: string;
    purpose?: C.WaterPurpose;
    until?: string;
    quota?: string;
  } = {},
) {
  const right = C.createWaterRight({
    rightRef: 'RIGHT_TEST_ONLY_INDUSTRY',
    countryRef: input.country ?? COUNTRY,
    regionRef: input.region ?? 'REGION_TEST_ONLY',
    basinRef: 'BASIN_TEST_ONLY',
    holderRef: input.holder ?? OP,
    purpose: input.purpose ?? 'OTHER_INDUSTRY',
    quotaPerDay: Q(input.quota ?? '864000', 'm3/sim-day'),
    sourceRef: 'SOURCE_TEST_ONLY_WATER_RIGHT',
    validity: { fromTicks: '0', untilTicks: '86400000' },
  });
  const origin = C.createWaterAllocationState({
    originRef: 'WATER_ORIGIN_TEST_ONLY',
    basinRef: right.basinRef,
    calendar: C.createGregorianWaterCalendarBinding({
      sourceRef: 'CALENDAR_TEST_ONLY',
      anchorSimulationTimestamp: SimTime.fromTicks('0'),
      anchorGregorianTimestamp: '2026-01-01T00:00:00.000Z',
    }),
    openingTimestamp: SimTime.fromTicks('0'),
    monthlyRunoffM3: '267840000',
    ecologicalReserveShare: { amount: '0.2', unit: 'ratio' },
    rights: [right],
  });
  const operation = C.createWaterOperation({
    operationRef: 'DELIVERY_TEST_ONLY_1',
    sourceRef: 'SOURCE_TEST_ONLY_REAL_DELIVERY',
    predecessorRef: origin.lineageRef,
    until: SimTime.fromTicks(input.until ?? '1000'),
    capacities: {
      facilityRef: 'WATER_WORKS_TEST_ONLY',
      operatingEvidenceRef: 'OPERATING_TEST_ONLY',
      abstractionPerDay: Q('864000', 'm3/sim-day'),
      treatmentPerDay: Q('864000', 'm3/sim-day'),
      networkPerDay: Q('864000', 'm3/sim-day'),
      deliveryEfficiency: { amount: '1', unit: 'ratio' },
    },
    demands: [
      {
        demandRef: 'DEMAND_TEST_ONLY_INDUSTRY',
        rightRef: right.rightRef,
        countryRef: right.countryRef,
        regionRef: right.regionRef,
        holderRef: right.holderRef,
        purpose: right.purpose,
        approvedDemandPerDay: Q(input.quota ?? '864000', 'm3/sim-day'),
        networkLimitPerDay: Q('864000', 'm3/sim-day'),
        sourceRef: 'SOURCE_TEST_ONLY_INDUSTRY_DEMAND',
      },
    ],
  });
  const allocated = C.allocateWaterPeriod(origin, operation);
  const state = createProductionWaterConsumptionState(
    { worldId: WORLD, allocation: allocated.state, operation },
    sha256,
  );
  return {
    origin,
    operation,
    allocated,
    state,
    accountRef: state.accounts[0]!.accountRef,
  };
}
function waterRecipe(
  f: ReturnType<typeof fixture>,
  overrides: Partial<ProductionWaterRecipe> = {},
) {
  return C.createFoundationFact({
    trace: f.evidence.input.trace,
    factRef: 'FACT.TEST_ONLY_WATER_RECIPE',
    sourceRef: 'SOURCE.TEST_ONLY_WATER_RECIPE',
    predecessorFactRefs: ['GENESIS.TEST_ONLY'],
    payload: {
      sourceRecipeRef: 'RECIPE_TEST_ONLY',
      facilityRef: f.evidence.recipe.payload.facilityRef,
      countryRef: COUNTRY,
      regionRef: 'REGION_TEST_ONLY',
      perOutput: RATE('1', 'tonne', 'm3'),
      ...overrides,
    },
  });
}
function composed() {
  const f = fixture(),
    w = waterFixture(),
    legacy = f.make(),
    recipe = waterRecipe(f);
  const prepared = prepareProductionWaterConsumption(
    {
      command: legacy.command,
      evidence: f.evidence,
      state: w.state,
      accountRef: w.accountRef,
      waterRecipe: recipe,
    },
    sha256,
  );
  const waterEvent = C.parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_WATER_2',
      eventType: PRODUCTION_WATER_CONSUMED_EVENT,
      worldId: WORLD,
      causationCommandId: legacy.command.commandId,
      correlationId: legacy.command.correlationId,
      worldVersion: '2',
      sequence: '3',
      simTime: '1000',
      recordedAtReal: NOW,
      correctsEventId: null,
      payload: prepared.eventPayload,
    },
    sha256,
  );
  const transition = C.createAuthoritativeTransition({
    command: legacy.command,
    worldVersionBefore: '1',
    worldVersionAfter: '2',
    events: [legacy.transition.events[0]!, waterEvent],
  });
  const posting = C.createProductionConsumptionPosting(
    {
      command: legacy.command,
      transition,
      evidence: f.evidence,
      postingId: legacy.posting.postingId,
    },
    sha256,
  );
  C.assertProductionFunding(posting, [f.funding], f.before.financial);
  const receipt = C.createFinalCommandReceipt({
    command: legacy.command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: legacy.command.simTime,
    recordedAtReal: NOW,
  });
  const binding = bindProductionWaterConsumptionToTransition(
    { command: legacy.command, transition, posting, preparation: prepared },
    sha256,
  );
  return {
    f,
    w,
    legacy,
    recipe,
    prepared,
    transition,
    posting,
    receipt,
    binding,
  };
}
describe('production atomic delivered-water debit / TEST_ONLY Core facts', () => {
  it('consumes exact recipe times actual V13 output once, retaining the same paid cost and immutable delivery', () => {
    const x = composed();
    expect(x.posting.result.actualOutput).toEqual(Q('3', 'tonne'));
    expect(x.prepared.after.accounts[0]!.delivered).toEqual(
      C.volumeFromDecimal('10'),
    );
    expect(x.prepared.after.accounts[0]!.consumed).toEqual(
      C.volumeFromDecimal('3'),
    );
    expect(x.prepared.after.accounts[0]!.available).toEqual(
      C.volumeFromDecimal('7'),
    );
    expect(x.w.state.accounts[0]!.consumed).toEqual(C.zeroWater());
    expect(x.f.evidence.operating.payload.settledCost).toEqual({
      amount: '6',
      currency: 'GCU',
    });
    expect(x.binding.waterEventId).toBe('EVENT_TEST_ONLY_WATER_2');
    expect(x.binding.materialization.payload).toBe(x.prepared.after);
    assertProductionWaterConsumptionCommitBinding(x.binding);
    const ledgers = C.rebuildV08LedgersFromLineage({
      seed: x.f.seed,
      transitions: [
        x.f.paidLineage,
        {
          command: x.legacy.command,
          transition: x.transition,
          inventoryPostings: [x.posting],
          financialPostingBatches: [],
        },
      ],
      sha256Hex: sha256,
    });
    expect(ledgers.inventory.worldVersion).toBe('2');
    expect(
      ledgers.inventory.balances
        .find((b) => b.account.commodityId === 'ORE')!
        .quantity.toCanonicalValue().amount,
    ).toBe('2');
    expect(
      ledgers.inventory.balances
        .find((b) => b.account.commodityId === 'STEEL')!
        .quantity.toCanonicalValue().amount,
    ).toBe('3');
    expect(
      ledgers.financial.positions
        .find((p) => p.account.accountId === 'CASH_TEST')!
        .netDebitBalance.toCanonicalValue().amount,
    ).toBe('94');
    const replay = replayProductionWaterConsumptionHistory(
      {
        opening: x.w.state,
        frames: [
          {
            command: x.legacy.command,
            transition: x.transition,
            posting: x.posting,
            receipt: x.receipt,
            waterRecipe: x.recipe,
            accountRef: x.w.accountRef,
          },
        ],
      },
      sha256,
    );
    expect(C.canonicalSerialize(replay)).toBe(
      C.canonicalSerialize(x.prepared.after),
    );
  });
  it('rejects a repeated run/command after application and deterministically repeats a fresh calculation', () => {
    const x = composed(),
      input = {
        command: x.legacy.command,
        evidence: x.f.evidence,
        state: x.w.state,
        accountRef: x.w.accountRef,
        waterRecipe: x.recipe,
      };
    expect(
      C.canonicalSerialize(
        prepareProductionWaterConsumption(input, sha256).eventPayload,
      ),
    ).toBe(C.canonicalSerialize(x.prepared.eventPayload));
    expect(() =>
      prepareProductionWaterConsumption(
        { ...input, state: x.prepared.after },
        sha256,
      ),
    ).toThrow('already applied');
    expect(x.prepared.after.uses).toHaveLength(1);
  });
  it('never treats a quota, future flow or another purpose as an actual Industry delivery', () => {
    const w = waterFixture(),
      f = fixture(),
      command = f.make().command;
    expect(() =>
      createProductionWaterConsumptionState(
        { worldId: WORLD, allocation: w.origin, operation: w.operation },
        sha256,
      ),
    ).toThrow('already applied');
    for (const bad of [
      { until: '2000' },
      { purpose: 'DOMESTIC' as const },
      { purpose: 'CRITICAL_PUBLIC' as const },
    ]) {
      const wrong = waterFixture(bad);
      expect(() =>
        prepareProductionWaterConsumption(
          {
            command,
            evidence: f.evidence,
            state: wrong.state,
            accountRef: wrong.accountRef,
            waterRecipe: waterRecipe(f),
          },
          sha256,
        ),
      ).toThrow();
    }
  });
  it.each([
    { holder: 'OP_OTHER_TEST_ONLY' },
    { country: 'COUNTRY_OTHER_TEST_ONLY' },
    { region: 'REGION_OTHER_TEST_ONLY' },
  ])('refuses a wrong delivery account scope %j', (bad) => {
    const f = fixture(),
      w = waterFixture(bad);
    expect(() =>
      prepareProductionWaterConsumption(
        {
          command: f.make().command,
          evidence: f.evidence,
          state: w.state,
          accountRef: w.accountRef,
          waterRecipe: waterRecipe(f),
        },
        sha256,
      ),
    ).toThrow('account/holder/country/region');
  });
  it('refuses insufficient remaining delivery and cannot overdraw it by using a fresh command key', () => {
    const f = fixture(),
      w = waterFixture({ quota: '86400' });
    expect(() =>
      prepareProductionWaterConsumption(
        {
          command: f.make().command,
          evidence: f.evidence,
          state: w.state,
          accountRef: w.accountRef,
          waterRecipe: waterRecipe(f),
        },
        sha256,
      ),
    ).toThrow('remaining delivered water');
    expect(w.state.uses).toHaveLength(0);
    expect(w.state.accounts[0]!.available).toEqual(C.volumeFromDecimal('1'));
  });
  it('retains exact fractional m3 and rejects coefficient unit substitution', () => {
    const f = fixture(),
      w = waterFixture(),
      command = f.make().command;
    const p = prepareProductionWaterConsumption(
      {
        command,
        evidence: f.evidence,
        state: w.state,
        accountRef: w.accountRef,
        waterRecipe: waterRecipe(f, { perOutput: RATE('0.1', 'tonne', 'm3') }),
      },
      sha256,
    );
    expect(p.eventPayload.consumed).toEqual(C.waterVolume('3', '10'));
    for (const perOutput of [
      RATE('1', 'kg', 'm3'),
      RATE('1', 'tonne', 'litre'),
    ])
      expect(() =>
        prepareProductionWaterConsumption(
          {
            command,
            evidence: f.evidence,
            state: w.state,
            accountRef: w.accountRef,
            waterRecipe: waterRecipe(f, { perOutput }),
          },
          sha256,
        ),
      ).toThrow('unit mismatch');
  });
  it('rejects missing/forged water companions instead of committing a standalone inventory output', () => {
    const x = composed();
    expect(() =>
      bindProductionWaterConsumptionToTransition(
        {
          command: x.legacy.command,
          transition: x.legacy.transition,
          posting: x.legacy.posting,
          preparation: x.prepared,
        },
        sha256,
      ),
    ).toThrow('same production');
    expect(() =>
      bindProductionWaterConsumptionToTransition(
        {
          command: x.legacy.command,
          transition: x.transition,
          posting: x.posting,
          preparation: { ...x.prepared },
        },
        sha256,
      ),
    ).toThrow('genuine');
    expect(() =>
      assertProductionWaterConsumptionCommitBinding({ ...x.binding }),
    ).toThrow('genuine');
  });
  it('does not turn an unpaid cost into a valid output when water is available', () => {
    const f = fixture(),
      w = waterFixture();
    const operating = C.createFoundationFact({
      trace: f.evidence.input.trace,
      factRef: 'FACT.TEST_ONLY_UNPAID',
      sourceRef: 'SOURCE.TEST_ONLY_UNPAID',
      predecessorFactRefs: ['GENESIS.TEST_ONLY'],
      payload: {
        ...f.evidence.operating.payload,
        settledCost: { amount: '0', currency: 'GCU' },
      },
    });
    expect(() =>
      prepareProductionWaterConsumption(
        {
          command: f.make().command,
          evidence: { ...f.evidence, operating },
          state: w.state,
          accountRef: w.accountRef,
          waterRecipe: waterRecipe(f),
        },
        sha256,
      ),
    ).toThrow('funded');
    expect(w.state.uses).toHaveLength(0);
  });
});

import {
  composePostwarIndustryProductionWaterDraft,
  assertPostwarIndustryWaterEventPresent,
  assertPostwarIndustryWaterAtomicMaterialization,
  type PostwarIndustryOriginalInspection,
} from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import { observeCurrentMaterialization } from '../../apps/world-worker/src/persistence/current-materialization-observation.js';
import type { AtomicTransitionDraft } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
function inspection(
  x: ReturnType<typeof composed>,
): PostwarIndustryOriginalInspection {
  return {
    status: 'SOURCE_BOUND_WITH_MISSING_FACTS',
    scope: {
      worldId: WORLD,
      countryId: COUNTRY,
      locationId: 'REGION_TEST_ONLY',
      facilityId: x.f.evidence.recipe.payload.facilityRef,
      operatorId: OP,
    },
    physical: {
      state: 'ADOPTED_EXISTING_OP_ASSET',
      titleHolderId: OP,
      riskBearerId: OP,
      operatingPermission:
        'OWNER_D04_CONDITIONAL_SITE_SCOPE_NOT_TRANSFERABLE_LICENSE',
      sourceCapacity: '10',
      sourceCapacityUnit: 'tonne/hour',
      installedMachineryReference: null,
    },
    recipe: {
      sourceId: 'RECIPE_TEST_ONLY',
      originalAuthority: 'TEST_ONLY_NOT_ADMITTED',
      outputCommodityId: 'STEEL',
      outputUnit: 'tonne',
      materials: [],
      energyPerOutput: RATE('1', 'tonne', 'MWh'),
      waterPerOutput: RATE('1', 'tonne', 'm3'),
      workersPerDailyOutputUnit: '1',
      costPerOutput: null,
      labourPerOutput: RATE('1', 'tonne', 'person_hour'),
      labourBasis: 'EXACT_PERSON_DAY_DIMENSION_NO_WORKDAY_HOURS_ASSUMPTION',
      logisticsPerOutput: null,
    },
    sourceProductionPlans: [],
    sourceTechnologyProposals: [],
    sourceLicenseProposals: [],
    missing: [
      {
        code: 'ACTUAL_WATER_DELIVERY_MISSING',
        field: 'TEST_ONLY',
        sourcePointer: 'TEST_ONLY',
        detail: 'This fixture establishes no production custody/admission',
      },
    ],
    authority: false,
  };
}
function draft(x: ReturnType<typeof composed>): AtomicTransitionDraft {
  const lease = C.acquireWorldWriterLease(
    null,
    C.worldWriterLeaseRequest(
      WORLD,
      C.workerId('WORKER_TEST_ONLY'),
      '2026-10-07T00:00:00.000Z',
      '2026-10-07T00:05:00.000Z',
    ),
  ).lease;
  return {
    transition: x.transition,
    inventoryPostings: [x.posting],
    financialPostingBatches: [],
    receipt: x.receipt,
    outboxMessages: [],
    currentMaterializations: [],
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitAssertion: C.createWorldWriterCommitAssertion(lease, '1'),
    observedAtReal: NOW,
  };
}
async function observation(x: ReturnType<typeof composed>, wrong = false) {
  // Real constructor/private observation brand over explicitly MOCK SQL data.
  // This issues no source admission, role/lock evidence or commit authority.
  const value = wrong ? { classification: 'TEST_ONLY_WRONG_CACHE' } : null;
  const executor: SqlExecutor = {
    async query<Row extends object>() {
      return {
        rows: [
          {
            world_version: '1',
            value_world_version: value ? '1' : null,
            canonical_payload: value ? C.canonicalSerialize(value) : null,
            payload_sha256: value
              ? C.canonicalSha256(C.canonicalHashInput(value), sha256)
              : null,
          },
        ] as unknown as Row[],
        rowCount: 1,
      };
    },
  };
  return observeCurrentMaterialization({
    executor,
    worldId: WORLD,
    key: x.binding.materialization.key,
    expectedWorldVersion: '1',
    sha256Hex: sha256,
  });
}
describe('postwar fixed atomic water composition / mock observation transport only', () => {
  it('appends exactly one conserved water cache to the original same-transition inventory draft', async () => {
    const x = composed(),
      before = draft(x),
      obs = await observation(x);
    const result = composePostwarIndustryProductionWaterDraft({
      draft: before,
      command: x.legacy.command,
      inspection: inspection(x),
      water: x.binding,
      observation: obs,
    });
    expect(result.currentMaterializations).toHaveLength(1);
    expect(result.currentMaterializations[0]!.payload).toBe(x.prepared.after);
    expect(result.currentMaterializations[0]!.observation).toBe(obs);
    expect(result.transition).toBe(before.transition);
    expect(result.inventoryPostings).toBe(before.inventoryPostings);
    expect(result.financialPostingBatches).toHaveLength(0);
    expect(inspection(x).missing).toHaveLength(1);
  });
  it('the default positive-water source seam refuses a production-only transition', () => {
    const x = composed();
    expect(() =>
      assertPostwarIndustryWaterEventPresent(
        inspection(x),
        x.legacy.transition,
      ),
    ).toThrow('CORE_WATER_DEBIT_BINDING_MISSING');
  });
  it('the default source seam refuses an event without its one exact same-transaction after-state', () => {
    const x = composed(),
      item = {
        key: x.binding.materialization.key,
        payloadHash: x.binding.afterStateHash,
      };
    expect(() =>
      assertPostwarIndustryWaterAtomicMaterialization(
        inspection(x),
        x.transition,
        undefined,
      ),
    ).toThrow('CORE_WATER_DEBIT_BINDING_MISSING');
    expect(() =>
      assertPostwarIndustryWaterAtomicMaterialization(
        inspection(x),
        x.transition,
        [
          {
            ...item,
            payloadHash: ('sha256:' + '0'.repeat(64)) as `sha256:${string}`,
          },
        ],
      ),
    ).toThrow('CORE_WATER_DEBIT_BINDING_MISSING');
    expect(() =>
      assertPostwarIndustryWaterAtomicMaterialization(
        inspection(x),
        x.transition,
        [item, item],
      ),
    ).toThrow('CORE_WATER_DEBIT_BINDING_MISSING');
    expect(() =>
      assertPostwarIndustryWaterAtomicMaterialization(
        inspection(x),
        x.transition,
        [item],
      ),
    ).not.toThrow();
  });
  it('refuses wrong/forged cache observations, repeated materializations and changed source rates', async () => {
    const x = composed(),
      obs = await observation(x),
      base = {
        draft: draft(x),
        command: x.legacy.command,
        inspection: inspection(x),
        water: x.binding,
        observation: obs,
      };
    expect(() =>
      composePostwarIndustryProductionWaterDraft({
        ...base,
        observation: { ...obs },
      }),
    ).toThrow('server-held');
    expect(() =>
      composePostwarIndustryProductionWaterDraft({
        ...base,
        draft: {
          ...base.draft,
          currentMaterializations: [x.binding.materialization],
        },
      }),
    ).toThrow('SINGLE_WATER_DEBIT');
    expect(() =>
      composePostwarIndustryProductionWaterDraft({
        ...base,
        inspection: {
          ...base.inspection,
          recipe: {
            ...base.inspection.recipe,
            waterPerOutput: RATE('2', 'tonne', 'm3'),
          },
        },
      }),
    ).toThrow('EXACT_SOURCE_WATER_RECIPE');
    const wrong = await observation(x, true);
    expect(() =>
      composePostwarIndustryProductionWaterDraft({
        ...base,
        observation: wrong,
      }),
    ).toThrow('HELD_CANONICAL_REPLAY');
  });
});

import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  createPostwarIndustryProductionSource,
  isPostwarIndustryProductionSourceGuard,
} from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import type { IndustryProductionCutoffGuard } from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import path from 'node:path';

let sourceGuardPromise: Promise<IndustryProductionCutoffGuard> | undefined;
function sourceGuard() {
  return (sourceGuardPromise ??= loadPostwarSourceContext(
    path.resolve(import.meta.dirname, '../..'),
  ).then((sourceContext) =>
    createPostwarIndustryProductionSource({
      sourceContext,
      scope: { worldId: WORLD, countryId: COUNTRY },
      runtimeReaderRole: 'water_atomic_test_runtime',
    }).createCutoffGuard(null),
  ));
}
async function atomicDraft(x: ReturnType<typeof composed>) {
  return composePostwarIndustryProductionWaterDraft({
    draft: draft(x),
    command: x.legacy.command,
    inspection: inspection(x),
    water: x.binding,
    observation: await observation(x),
  });
}
async function atomicAttempt(
  x: ReturnType<typeof composed>,
  candidateDraft: AtomicTransitionDraft,
  guard: IndustryProductionCutoffGuard,
  existing = false,
) {
  const statements: string[] = [],
    outer: string[] = [];
  const command = x.legacy.command;
  const executor: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      statements.push(sql);
      let rows: unknown[];
      if (sql.includes('from world_v2.command_submission')) {
        rows = [
          {
            actor_id: command.actorId,
            auth_subject: command.authSubject,
            command_id: command.commandId,
            command_fingerprint: command.fingerprint,
            command_type: command.commandType,
            canonical_payload: command.canonicalPayload,
            correlation_id: command.correlationId,
            country_id: command.countryId,
            idempotency_key: command.idempotencyKey,
            expected_world_version: command.expectedWorldVersion,
            office_id: command.officeId,
            payload_sha256: command.payloadHash,
            schema_version: command.schemaVersion,
            sim_time: command.simTime.toCanonicalValue(),
            submitted_at_real: command.submittedAtReal,
            world_id: command.worldId,
          },
        ];
      } else if (sql.includes('from world_v2.command_receipt')) {
        const r = x.receipt;
        rows = existing
          ? [
              {
                world_id: r.worldId,
                command_id: r.commandId,
                idempotency_key: r.idempotencyKey,
                schema_version: r.schemaVersion,
                command_fingerprint: r.commandFingerprint,
                outcome: r.outcome,
                reason_code: r.reasonCode,
                transition_id: r.transitionId,
                world_version_before: r.worldVersionBefore,
                world_version_after: r.worldVersionAfter,
                sim_time: r.simTime.toCanonicalValue(),
                event_ids: r.eventIds,
                recorded_at_real: r.recordedAtReal,
              },
            ]
          : [];
      } else if (sql.includes('world_v2.assert_world_writer_commit_guard')) {
        if (existing) throw Error('NO_FRESH_SOURCE_OR_HEAD_AFTER_FINAL');
        rows = [{ world_version: '1', event_sequence: '1' }];
      } else throw Error('UNEXPECTED_QUERY_OR_ECONOMIC_WRITE:' + sql);
      return { rows: rows as Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    async transaction(fn) {
      return fn(executor);
    },
    async query<Row extends object>(sql: string) {
      outer.push(sql);
      if (!sql.includes('from world_v2.command_receipt'))
        throw Error('UNEXPECTED_OUTER_QUERY');
      return { rows: [] as Row[], rowCount: 0 };
    },
  };
  let authorizationReads = 0;
  const repository = new AtomicTransitionRepository({
    database,
    workerId: C.workerId('WORKER_TEST_ONLY'),
    sha256Hex: sha256,
    authorizationGuard: {
      async assertCurrent() {
        authorizationReads++;
        if (existing) throw Error('NO_AUTH_AFTER_FINAL');
      },
    },
    industryProductionCutoffGuard: guard,
  });
  const candidate = prepareAtomicTransitionCandidate({
    command,
    commitAuthorization: null,
    sha256Hex: sha256,
    draft: candidateDraft,
  });
  let outcome: Awaited<ReturnType<typeof repository.commit>> | undefined,
    error: unknown;
  try {
    outcome = await repository.commit(candidate);
  } catch (e) {
    error = e;
  }
  return { outcome, error, statements, outer, authorizationReads };
}
describe('real Atomic repository water seam / TEST_ONLY mock persistence, no PG', () => {
  it('refuses plain/copied source guards before a new two-event write', async () => {
    const x = composed(),
      genuine = await sourceGuard();
    expect(isPostwarIndustryProductionSourceGuard(genuine)).toBe(true);
    let callbacks = 0;
    const plain: IndustryProductionCutoffGuard = {
      async assertCurrentFrom() {
        callbacks++;
        throw Error('NO_PLAIN_GUARD_CALLBACK');
      },
    };
    for (const guard of [plain, { ...genuine }]) {
      const r = await atomicAttempt(x, await atomicDraft(x), guard);
      expect(String(r.error)).toContain('issued postwar original-source guard');
      expect(
        r.statements.some((q) => /^\s*(?:insert|update|delete)/iu.test(q)),
      ).toBe(false);
      expect(r.outcome).toBeUndefined();
    }
    expect(callbacks).toBe(0);
  });
  it('refuses missing/copied Core water calculation tokens with an issued fixed source guard', async () => {
    const x = composed(),
      guard = await sourceGuard();
    for (const token of [undefined, { ...x.binding }]) {
      const d = await atomicDraft(x);
      const r = await atomicAttempt(
        x,
        { ...d, productionWaterCommitBinding: token },
        guard,
      );
      expect(String(r.error)).toContain(
        'genuine production/water atomic calculation required',
      );
      expect(
        r.statements.some((q) => /^\s*(?:insert|update|delete)/iu.test(q)),
      ).toBe(false);
    }
  });
  it('refuses missing or changed water materialization before new events with the genuine calculation token', async () => {
    const x = composed(),
      guard = await sourceGuard(),
      d = await atomicDraft(x);
    for (const currentMaterializations of [
      [],
      [
        {
          ...d.currentMaterializations[0]!,
          payload: { classification: 'TEST_ONLY_TAMPER' },
        },
      ],
    ]) {
      const r = await atomicAttempt(
        x,
        { ...d, currentMaterializations },
        guard,
      );
      expect(String(r.error)).toContain(
        'exact production transition, posting and materialization',
      );
      expect(
        r.statements.some((q) => /^\s*(?:insert|update|delete)/iu.test(q)),
      ).toBe(false);
    }
  });
  it('restores the exact existing FINAL before fresh source, water token and getter metadata', async () => {
    const x = composed(),
      d = await atomicDraft(x);
    let callbacks = 0,
      getters = 0;
    const guard: IndustryProductionCutoffGuard = {
      async assertCurrentFrom() {
        callbacks++;
        throw Error('NO_CURRENT_SOURCE_AFTER_FINAL');
      },
    };
    for (const kind of ['missing', 'copied', 'getter'] as const) {
      const candidateDraft = {
        ...d,
        productionWaterCommitBinding:
          kind === 'copied' ? { ...x.binding } : undefined,
      };
      if (kind === 'getter')
        Object.defineProperty(candidateDraft, 'productionWaterCommitBinding', {
          get() {
            getters++;
            throw Error('DO_NOT_EVALUATE_WATER_GETTER');
          },
          enumerable: true,
        });
      const r = await atomicAttempt(x, candidateDraft, guard, true);
      expect(r.error).toBeUndefined();
      expect(r.outcome?.source).toBe('EXISTING_COMMIT');
      expect(r.outcome?.receipt).toEqual(x.receipt);
      expect(r.authorizationReads).toBe(0);
      expect(r.statements).toHaveLength(2);
      expect(r.outer).toHaveLength(0);
    }
    expect(callbacks).toBe(0);
    expect(getters).toBe(0);
  });
});
