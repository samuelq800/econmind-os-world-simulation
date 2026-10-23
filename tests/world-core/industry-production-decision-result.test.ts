// Explicit TEST_ONLY fixture supplier reuses the existing production test's Core constructors.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED,
  PRODUCTION_SETTLED_EVENT_TYPE,
  assertInventoryPersistenceSchemaAdmitted,
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  commandId,
  commodityId,
  countryId,
  createAuthoritativeTransition,
  createFinancialAccount,
  createFinancialPostingBatch,
  createFinalCommandReceipt,
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
import { createIsolatedIndustryResultSourceForTestOnly } from '../../apps/world-worker/src/projections/industry-production-result-evidence.js';
import { projectIsolatedIndustryDecisionResultForTestOnly } from '../../apps/world-worker/src/projections/industry-production-decision-result.js';
import { projectOfficeDecisionResult } from '../../apps/world-worker/src/projections/office-decision-result-projector.js';
import type { EconomicReadVisibilitySnapshot } from '../../apps/world-worker/src/projections/economic-read-visibility-source.js';
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
  correctsEventId: string | null = null,
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
      correctsEventId,
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

function complete(f = fixture()) {
  const produced = f.make();
  const rows = [f.paidLineage, produced.lineage];
  return {
    seed: f.seed,
    sourceHead: { worldId: WORLD, worldVersion: '2', eventSequence: '2' },
    transitions: rows.map(withReceipt),
  };
}
function withReceipt(row: V08AuthoritativeLedgerTransition) {
  return {
    ...row,
    receipt: createFinalCommandReceipt({
      ...row,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: row.command.simTime,
      recordedAtReal: NOW,
    }),
  };
}
function visibility(
  allow = true,
  sequence = '2',
  denyAccount: string | null = null,
): EconomicReadVisibilitySnapshot {
  return {
    worldId: WORLD,
    worldVersion: sequence,
    eventSequence: sequence,
    openingBinding: null,
    financial: () => ({
      status: 'NOT_AUTHORIZED',
      reason: 'OWNER_MAPPING_UNAVAILABLE',
    }),
    inventory: (account) =>
      allow && account.batchId !== denyAccount
        ? {
            status: 'AUTHORIZED',
            sourceUnits: ['TEST_ONLY_FIXTURE_VISIBILITY'],
          }
        : { status: 'NOT_AUTHORIZED', reason: 'OWNER_MAPPING_UNAVAILABLE' },
    summary: () => ({
      schemaVersion: 'economic-read-visibility-v1',
      financialDetail: 'NOT_AUTHORIZED',
      inventoryDetail: 'NOT_AUTHORIZED',
      countrySummary: 'NOT_AUTHORIZED',
    }),
  };
}
function project(source = complete(), allow = true) {
  const handle = createIsolatedIndustryResultSourceForTestOnly(source);
  return projectIsolatedIndustryDecisionResultForTestOnly({
    handle,
    countryId: COUNTRY,
    visibility: visibility(allow, source.sourceHead.worldVersion),
  });
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST', 'true');
  vi.stubEnv('ECONMIND_ENV', 'local');
});
afterEach(() => vi.unstubAllEnvs());

describe('isolated Industry constructor, complete memory lineage and result projection', () => {
  it('projects real Core-calculated bottleneck output inside an explicitly unadmitted test envelope', () => {
    const output = project();
    expect(output.admission).toBe('ISOLATED_TEST_ONLY_NOT_ADMITTED');
    expect(output.sourceAdmitted).toBe(false);
    expect(output.runtimeConnected).toBe(false);
    expect(output.productionAuthority).toBe(false);
    expect(output.originalFieldsClosed).toBe(0);
    expect(output.result).toMatchObject({
      officeId: 'INDUSTRY',
      classification: 'OFFICE_PRIVATE',
      status: 'COMMITTED',
      source: 'COMMITTED_EVENT_RESULT',
      semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
      afterState: null,
      businessState: 'APPLIED',
    });
    expect(output.result.metrics).toEqual([
      {
        key: 'PRODUCTION_OUTPUT',
        unit: 'tonne',
        status: 'AFTER_ONLY',
        before: null,
        delta: null,
        after: '3',
        reason: 'PREDECESSOR_STATE_NOT_CARRIED',
      },
    ]);
    expect(output.result.cause).toMatchObject({
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      eventSequence: '2',
      eventType: PRODUCTION_SETTLED_EVENT_TYPE,
    });
    expect(Object.isFrozen(output.result.metrics[0])).toBe(true);
    const text = JSON.stringify(output);
    for (const forbidden of [
      'STEEL_BATCH',
      'ORE_BATCH',
      'COST_CASH',
      'settledCost',
      'recipe',
      'availableBefore',
    ])
      expect(text).not.toContain(forbidden);
    expect(project()).toEqual(output);
  });
  it('requires same-ledger settled funding, not a nonempty fingerprint or reference', () => {
    const source = complete();
    source.transitions[0] = {
      ...source.transitions[0]!,
      financialPostingBatches: [],
    };
    expect(() => project(source)).toThrow();
    expect(() => project(complete(fixture('1')))).toThrow('negative cash');
  });
  it('rejects a forged production posting even when its result looks plausible', () => {
    const source = complete();
    const row = source.transitions[1]!;
    source.transitions[1] = {
      ...row,
      inventoryPostings: [
        {
          ...row.inventoryPostings[0]!,
          fingerprint: `sha256:${'f'.repeat(64)}`,
        },
      ],
    };
    expect(() => project(source)).toThrow();
  });
  it.each([
    {
      worldId: worldId('WORLD_FOREIGN'),
      worldVersion: '2',
      eventSequence: '2',
    },
    { worldId: WORLD, worldVersion: '3', eventSequence: '2' },
    { worldId: WORLD, worldVersion: '2', eventSequence: '1' },
  ])(
    'rejects wrong world/head $worldId/$worldVersion/$eventSequence',
    (sourceHead) => {
      expect(() => project({ ...complete(), sourceHead })).toThrow();
    },
  );
  it('rejects incomplete, duplicate or noncommitted lineage', () => {
    const source = complete();
    expect(() =>
      project({ ...source, transitions: source.transitions.slice(1) }),
    ).toThrow();
    expect(() =>
      project({
        ...source,
        transitions: [...source.transitions, source.transitions[1]!],
      }),
    ).toThrow();
    const row = source.transitions[1]!;
    source.transitions[1] = {
      ...row,
      receipt: { ...row.receipt, outcome: 'REJECTED' },
    };
    expect(() => project(source)).toThrow();
  });
  it('retains fixture visibility denial without leaking production cause or quantity', () => {
    const result = project(complete(), false).result;
    expect(result).toMatchObject({
      status: 'NOT_AUTHORIZED',
      source: null,
      reason: 'SCOPE_NOT_AUTHORIZED',
      cause: null,
      metrics: [],
    });
    const handle = createIsolatedIndustryResultSourceForTestOnly(complete());
    const deniedMaterial = projectIsolatedIndustryDecisionResultForTestOnly({
      handle,
      countryId: COUNTRY,
      visibility: visibility(true, '2', 'ORE_BATCH'),
    });
    expect(deniedMaterial.result.status).toBe('NOT_AUTHORIZED');
    expect(deniedMaterial.result.metrics).toEqual([]);
  });
  it('rejects stale visibility and does not turn a foreign country into this result', () => {
    const handle = createIsolatedIndustryResultSourceForTestOnly(complete());
    expect(() =>
      projectIsolatedIndustryDecisionResultForTestOnly({
        handle,
        countryId: COUNTRY,
        visibility: visibility(true, '1'),
      }),
    ).toThrow('source head differ');
    expect(
      projectIsolatedIndustryDecisionResultForTestOnly({
        handle,
        countryId: 'COUNTRY_FOREIGN',
        visibility: visibility(),
      }).result.status,
    ).toBe('SOURCE_UNAVAILABLE');
  });
  it('does not create a success from a committed cost event or a corrected production cause', () => {
    const f = fixture();
    const empty = project({
      seed: f.seed,
      sourceHead: { worldId: WORLD, worldVersion: '1', eventSequence: '1' },
      transitions: [withReceipt(f.paidLineage)],
    });
    expect(empty.result).toMatchObject({
      status: 'SOURCE_UNAVAILABLE',
      metrics: [],
      cause: null,
    });
    const source = complete();
    const correction = transition(
      2,
      3,
      'TEST_ONLY_CORRECTION',
      {},
      '1000',
      source.transitions[1]!.transition.events[0]!.eventId,
    );
    source.transitions.push(
      withReceipt({
        ...correction,
        inventoryPostings: [],
        financialPostingBatches: [],
      }),
    );
    source.sourceHead.worldVersion = '3';
    source.sourceHead.eventSequence = '3';
    expect(project(source).result.reason).toBe('PRODUCTION_CAUSE_CORRECTED');
  });
  it('does not accept copied handles or caller flags as source authority', () => {
    const handle = createIsolatedIndustryResultSourceForTestOnly(complete());
    expect(() =>
      projectIsolatedIndustryDecisionResultForTestOnly({
        handle: { ...handle },
        countryId: COUNTRY,
        visibility: visibility(),
      }),
    ).toThrow('Untrusted isolated source handle');
    expect(() =>
      createIsolatedIndustryResultSourceForTestOnly({
        ...complete(),
        sourceAdmitted: true,
      } as Parameters<typeof createIsolatedIndustryResultSourceForTestOnly>[0]),
    ).toThrow('Closed fixture source');
    expect(() =>
      createIsolatedIndustryResultSourceForTestOnly({
        ...complete(),
        seed: { ...complete().seed },
      }),
    ).toThrow('validated opening seed');
  });
  it.each([
    ['NODE_ENV', 'production'],
    ['VITEST', 'false'],
    ['ECONMIND_ENV', 'production'],
  ])('guards constructor and reader when %s=%s', (name, value) => {
    const source = complete();
    const handle = createIsolatedIndustryResultSourceForTestOnly(source);
    vi.stubEnv(name, value);
    expect(() => createIsolatedIndustryResultSourceForTestOnly(source)).toThrow(
      'INDUSTRY_ISOLATED_TEST_RUNTIME_REQUIRED',
    );
    expect(() =>
      projectIsolatedIndustryDecisionResultForTestOnly({
        handle,
        countryId: COUNTRY,
        visibility: visibility(),
      }),
    ).toThrow('INDUSTRY_ISOLATED_TEST_RUNTIME_REQUIRED');
  });
  it('keeps all official production and browser paths outside this isolated mechanism', () => {
    const f = fixture();
    expect(() =>
      assertInventoryPersistenceSchemaAdmitted([f.make().posting]),
    ).toThrow(PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED);
    const source = complete();
    expect(
      projectOfficeDecisionResult({
        countryId: COUNTRY,
        officeId: 'INDUSTRY',
        sourceHead: source.sourceHead,
        transitions: source.transitions,
        visibility: visibility(),
        sha256Hex: sha256,
      }),
    ).toMatchObject({
      status: 'SOURCE_UNAVAILABLE',
      reason: 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE',
    });
  });
});
