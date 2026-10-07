// TEST_ONLY. Fixture values reused from reviewed 8603d61; every result/posting is recalculated by the actual Core constructor.
import { createHash } from 'node:crypto';
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
} from '../../packages/core/src/index.js';

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
export function createProductionSchemaFixture(cashAmount = '100') {
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
export { transition as createSchemaTransition };
