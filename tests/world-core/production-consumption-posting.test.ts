// PREPARATION_ONLY_NOT_V09_2_STARTED; all source facts below are TEST_ONLY.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
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
  acquireWorldWriterLease,
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
  createWorldWriterCommitAssertion,
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
  reconcileV08LedgerSnapshots,
  workerId,
  worldId,
  worldWriterLeaseRequest,
  type FoundationTraceRequest,
  type ProductionConsumptionEvidence,
  type InventoryAccount,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

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
function changedFact<T>(
  fact:
    | ProductionConsumptionEvidence['operating']
    | ProductionConsumptionEvidence['recipe'],
  payload: T,
) {
  return { ...fact, payload, canonicalPayload: canonicalSerialize(payload) };
}

describe('TEST_ONLY real V13 → sole E08 writer → opening lineage', () => {
  it('posts only actual bottlenecked output, consumes exact materials, preserves one WorldVersion and settled cost', () => {
    const f = fixture();
    const p = f.make().posting;
    const result = f.run();
    expect(p.result.potentialOutput).toEqual(Q('10', 'tonne'));
    expect(p.result.actualOutput).toEqual(Q('3', 'tonne'));
    expect(p.result.materialConsumption[0]!.proposedConsumed).toEqual(
      Q('6', 'tonne'),
    );
    expect(p.result.energyConsumption.after).toEqual(Q('0', 'MWh'));
    expect(result.worldVersion).toBe('2');
    expect(
      result.inventory.balances.map((b) => [
        b.account.commodityId,
        b.quantity.toCanonicalValue().amount,
      ]),
    ).toEqual([
      ['ORE', '2'],
      ['STEEL', '3'],
    ]);
    expect(
      result.financial.positions
        .find((p) => p.account.accountClass === 'CASH')!
        .netDebitBalance.toCanonicalValue().amount,
    ).toBe('94');
    expect(result.inventory.appliedPostings).toHaveLength(1);
    expect(result.inventory.appliedPostings[0]!.production).toMatchObject({
      runId: 'RUN.TEST_ONLY.1',
      outputBatchId: 'STEEL_BATCH',
    });
    // L01 per commodity: ore 8 + 0 - 6 = 2; steel 0 + 3 - 0 = 3. No same-unit cross-commodity sum.
  });
  it('deterministically rebuilds/reconciles the same ledger and refuses duplicate lineage', () => {
    const f = fixture();
    const first = f.run();
    const second = f.run();
    expect(canonicalSerialize(second)).toBe(canonicalSerialize(first));
    expect(
      reconcileV08LedgerSnapshots({
        reconstructed: second,
        inventorySnapshot: first.inventory,
        financialSnapshot: first.financial,
        sha256Hex: sha256,
      }).inventory.status,
    ).toBe('MATCH');
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [f.paidLineage, f.make().lineage, f.make().lineage],
        sha256Hex: sha256,
      }),
    ).toThrow();
  });
  it('requires exact production event, not a plan receipt or arbitrary transition', () => {
    const f = fixture();
    expect(() => f.make(f.evidence, 'INDUSTRY_PRODUCTION_PLAN')).toThrow(
      'one exact production settlement Event',
    );
  });
  it.each([
    'maintenanceAppliedRef',
    'technologyRightRef',
    'operatingPermissionRef',
    'costSourceRef',
  ] as const)('fails closed when %s is missing', (field) => {
    const f = fixture();
    const op = { ...f.evidence.operating.payload, [field]: '' };
    expect(() =>
      f.run({
        ...f.evidence,
        operating: changedFact(f.evidence.operating, op),
      }),
    ).toThrow('explicit source evidence');
    expect(
      f.before.inventory.balances[0]!.quantity.toCanonicalValue().amount,
    ).toBe('8');
  });
  it.each(['titleHolderId', 'riskBearerId'] as const)(
    'rejects wrong output %s',
    (field) => {
      const f = fixture();
      expect(() =>
        f.run({
          ...f.evidence,
          output: {
            ...f.evidence.output,
            [field]: legalEntityId('OTHER_OWNER'),
          },
        }),
      ).toThrow('OP title/risk');
    },
  );
  it('rejects missing recipe inputs, duplicate account and mismatched inventory batch source', () => {
    const f = fixture();
    expect(() => f.run({ ...f.evidence, materials: [] })).toThrow(
      'every recipe material',
    );
    expect(() =>
      f.run({
        ...f.evidence,
        materials: [f.evidence.materials[0]!, f.evidence.materials[0]!],
      }),
    ).toThrow();
    expect(() =>
      f.run({
        ...f.evidence,
        materials: [
          { ...f.evidence.materials[0]!, account: account('WRONG_BATCH') },
        ],
      }),
    ).toThrow('Material account');
  });
  it('rejects recipe coefficient/unit mismatch and free cost', () => {
    const f = fixture();
    const recipe = f.evidence.recipe.payload;
    expect(() =>
      f.run({
        ...f.evidence,
        recipe: changedFact(f.evidence.recipe, {
          ...recipe,
          energyPerOutput: RATE('1', 'tonne', 'MW'),
        }),
      }),
    ).toThrow('unit mismatch');
    expect(() =>
      f.run({
        ...f.evidence,
        recipe: changedFact(f.evidence.recipe, {
          ...recipe,
          energyPerOutput: RATE('2', 'tonne', 'MWh'),
        }),
      }),
    ).toThrow('coefficient');
    expect(() =>
      f.run({
        ...f.evidence,
        operating: changedFact(f.evidence.operating, {
          ...f.evidence.operating.payload,
          settledCost: { amount: '0', currency: 'GCU' },
        }),
      }),
    ).toThrow('not zero');
  });
  it('rejects mixed snapshot/version/time and non-OP operator', () => {
    const f = fixture();
    expect(() =>
      f.run({
        ...f.evidence,
        recipe: {
          ...f.evidence.recipe,
          snapshot: {
            ...f.evidence.recipe.snapshot,
            sourceVersion: 'WORLD_VERSION.2',
          },
        },
      }),
    ).toThrow('mixed lineage');
    expect(() =>
      f.run({
        ...f.evidence,
        operating: changedFact(f.evidence.operating, {
          ...f.evidence.operating.payload,
          worldVersion: '2',
        }),
      }),
    ).toThrow('current WorldVersion');
    expect(() =>
      f.run({
        ...f.evidence,
        operating: changedFact(f.evidence.operating, {
          ...f.evidence.operating.payload,
          operatorClassification: 'GOV' as 'OP',
        }),
      }),
    ).toThrow('operational OP');
  });
  it('rejects stale inventory snapshot and fabricated usable balance', () => {
    const f = fixture();
    expect(() =>
      f.run({
        ...f.evidence,
        inventorySnapshotHash: `sha256:${'f'.repeat(64)}`,
      }),
    ).toThrow('snapshot hash mismatch');
    const material = f.evidence.input.materials[0]!;
    const payload = { ...material.payload, usableBefore: Q('100', 'tonne') };
    expect(() =>
      f.run({
        ...f.evidence,
        input: {
          ...f.evidence.input,
          materials: [
            {
              ...material,
              payload,
              canonicalPayload: canonicalSerialize(payload),
            },
          ],
        },
      }),
    ).toThrow('current E08 balance');
  });
  it('requires real settled funding, exact expense leg and nonnegative paid cash', () => {
    const f = fixture();
    const op = f.evidence.operating.payload;
    expect(() =>
      f.run({
        ...f.evidence,
        operating: changedFact(f.evidence.operating, {
          ...op,
          fundingFingerprint: `sha256:${'f'.repeat(64)}`,
        }),
      }),
    ).toThrow('same ledger');
    expect(() =>
      f.run({
        ...f.evidence,
        operating: changedFact(f.evidence.operating, {
          ...op,
          costLegId: financialPostingLegId('COST_CASH'),
        }),
      }),
    ).toThrow('expense leg');
    expect(() => fixture('1').run()).toThrow('negative cash');
  });
  it('does not trust a forged result or an unvalidated posting object on replay', () => {
    const f = fixture();
    const l = f.make().lineage;
    const posting = {
      ...l.inventoryPostings[0]!,
      entries: [
        { account: f.evidence.output, delta: Quantity.from('999', 'tonne') },
      ],
    };
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [f.paidLineage, { ...l, inventoryPostings: [posting] }],
        sha256Hex: sha256,
      }),
    ).toThrow('validated canonical postings');
  });
  it('freezes source evidence and result so later caller mutation cannot change the posting', () => {
    const f = fixture();
    const p = f.make().posting;
    expect(Object.isFrozen(p.evidence.input.capacity.payload)).toBe(true);
    expect(Object.isFrozen(p.result.materialConsumption)).toBe(true);
  });
  it('rejects zero output rather than recording a zero production fact', () => {
    const f = fixture();
    const energy = f.evidence.input.energy;
    const payload = { ...energy.payload, deliveredBefore: Q('0', 'MWh') };
    expect(() =>
      f.run({
        ...f.evidence,
        input: {
          ...f.evidence.input,
          energy: {
            ...energy,
            payload,
            canonicalPayload: canonicalSerialize(payload),
          },
        },
      }),
    ).toThrow('Zero output');
  });
  it.each(['same run', 'renamed run', 'renamed batch'] as const)(
    'cannot recognize another production with %s and reused outcome/cost',
    (mode) => {
      const f = fixture();
      const first = f.run();
      const raw = JSON.parse(
        canonicalSerialize(f.evidence),
      ) as ProductionConsumptionEvidence;
      const trace = {
        ...raw.input.trace,
        snapshot: {
          ...raw.input.trace.snapshot,
          sourceVersion: 'WORLD_VERSION.2',
        },
      };
      const remap = <T extends { snapshot: typeof trace.snapshot }>(
        fact: T,
      ): T => ({ ...fact, snapshot: trace.snapshot });
      const op = { ...raw.operating.payload, worldVersion: '2' };
      const next: ProductionConsumptionEvidence = {
        ...raw,
        runId: mode === 'same run' ? raw.runId : 'RUN.RENAMED',
        output:
          mode === 'renamed batch'
            ? account('RENAMED_STEEL_BATCH', 'STEEL')
            : raw.output,
        inventorySnapshotHash: canonicalSha256(
          canonicalHashInput(first.inventory),
          sha256,
        ),
        input: {
          ...raw.input,
          trace,
          capacity: remap(raw.input.capacity),
          materials: raw.input.materials.map(remap),
          energy: remap(raw.input.energy),
          labour: remap(raw.input.labour),
          logistics: remap(raw.input.logistics),
        },
        recipe: remap(raw.recipe),
        operating: {
          ...remap(raw.operating),
          payload: op,
          canonicalPayload: canonicalSerialize(op),
        },
      };
      const executed = transition(
        2,
        3,
        PRODUCTION_SETTLED_EVENT_TYPE,
        productionConsumptionEventPayload(next),
      );
      const posting = createProductionConsumptionPosting(
        {
          ...executed,
          postingId: inventoryPostingId('PRODUCTION_RETRY_POSTING'),
          evidence: next,
        },
        sha256,
      );
      expect(() =>
        rebuildV08LedgersFromLineage({
          seed: f.seed,
          transitions: [
            f.paidLineage,
            f.make().lineage,
            {
              ...executed,
              inventoryPostings: [posting],
              financialPostingBatches: [],
            },
          ],
          sha256Hex: sha256,
        }),
      ).toThrow('already recognized');
      expect(
        first.inventory.balances.map(
          (b) => b.quantity.toCanonicalValue().amount,
        ),
      ).toEqual(['2', '3']);
    },
  );
  it('cannot pay a genuinely new interval/run/output using a previously recognized cost leg', () => {
    const f = fixture();
    const first = f.run();
    const raw = JSON.parse(
      canonicalSerialize(f.evidence),
    ) as ProductionConsumptionEvidence;
    const trace = {
      ...raw.input.trace,
      snapshotAt: Q('2000', 'sim_millisecond'),
      snapshot: {
        ...raw.input.trace.snapshot,
        sourceVersion: 'WORLD_VERSION.2',
      },
    };
    const remap = <
      T extends {
        snapshot: typeof trace.snapshot;
        observedAt: { amount: string; unit: string };
      },
    >(
      fact: T,
    ): T => ({
      ...fact,
      snapshot: trace.snapshot,
      observedAt: trace.snapshotAt,
    });
    const op = { ...raw.operating.payload, worldVersion: '2' };
    const next: ProductionConsumptionEvidence = {
      ...raw,
      runId: 'RUN.NEW_INTERVAL',
      output: account('NEW_INTERVAL_STEEL_BATCH', 'STEEL'),
      inventorySnapshotHash: canonicalSha256(
        canonicalHashInput(first.inventory),
        sha256,
      ),
      input: {
        ...raw.input,
        outcomeRef: 'OUTCOME.NEW_INTERVAL',
        trace,
        capacity: remap(raw.input.capacity),
        materials: raw.input.materials.map(remap),
        energy: remap(raw.input.energy),
        labour: remap(raw.input.labour),
        logistics: remap(raw.input.logistics),
      },
      recipe: remap(raw.recipe),
      operating: {
        ...remap(raw.operating),
        payload: op,
        canonicalPayload: canonicalSerialize(op),
      },
    };
    const executed = transition(
      2,
      3,
      PRODUCTION_SETTLED_EVENT_TYPE,
      productionConsumptionEventPayload(next),
      '2000',
    );
    const posting = createProductionConsumptionPosting(
      {
        ...executed,
        postingId: inventoryPostingId('PRODUCTION_NEW_INTERVAL'),
        evidence: next,
      },
      sha256,
    );
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          f.paidLineage,
          f.make().lineage,
          {
            ...executed,
            inventoryPostings: [posting],
            financialPostingBatches: [],
          },
        ],
        sha256Hex: sha256,
      }),
    ).toThrow('already recognized');
  });
  it('prepares an actual Atomic draft but refuses production persistence before any DB call', async () => {
    const f = fixture();
    const { command, transition: executed, posting } = f.make();
    const worker = workerId('WORKER_TEST_ONLY');
    const lease = acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(
        WORLD,
        worker,
        '2026-10-07T00:00:00.000Z',
        '2026-10-07T00:05:00.000Z',
      ),
    ).lease;
    const candidate = prepareAtomicTransitionCandidate({
      command,
      commitAuthorization: null,
      sha256Hex: sha256,
      draft: {
        transition: executed,
        inventoryPostings: [posting],
        financialPostingBatches: [],
        receipt: createFinalCommandReceipt({
          command,
          outcome: 'COMMITTED',
          reasonCode: null,
          transition: executed,
          simTime: command.simTime,
          recordedAtReal: NOW,
        }),
        outboxMessages: [],
        currentMaterializations: [],
        authorityKind: 'VERSIONED_AUTOMATIC',
        commitAssertion: createWorldWriterCommitAssertion(lease, '1'),
        observedAtReal: NOW,
      },
    });
    const transaction = vi.fn();
    const query = vi.fn();
    const database: SqlDatabase = { transaction, query };
    const repository = new AtomicTransitionRepository({
      database,
      workerId: worker,
      sha256Hex: sha256,
      authorizationGuard: { assertCurrent: vi.fn() },
    });
    await expect(repository.commit(candidate)).rejects.toThrow(
      PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
