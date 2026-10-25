// Synthetic isolated constructor fixtures; not actual production/source admission.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Money,
  Quantity,
  PRODUCTION_SETTLED_EVENT_TYPE,
  PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED,
  assertInventoryPersistenceSchemaAdmitted,
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
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
  type FinalCommandReceipt,
  type FoundationTraceRequest,
  type ProductionConsumptionEvidence,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import type { IndustryPrefixTestInput } from '../../apps/world-worker/src/projections/industry-production-source-port.js';
import {
  decodeIndustryProductionRow,
  copyIndustrySourceData,
} from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const WORLD = worldId('WORLD_INDUSTRY_PREFIX_TEST');
const COUNTRY = countryId('COUNTRY_INDUSTRY_PREFIX_TEST');
const OP = legalEntityId('OP_INDUSTRY_PREFIX_TEST');
const NOW = '2026-10-23T00:00:00.000Z';
type Committed = V08AuthoritativeLedgerTransition & {
  receipt: FinalCommandReceipt;
};
const q = (amount: string, unit: string) => ({ amount, unit });
const rate = (amount: string, inputUnit: string, outputUnit: string) => ({
  amount,
  inputUnit,
  outputUnit,
});

function transition(before: number, type: string, payload: unknown) {
  const after = String(before + 1);
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: WORLD,
      countryId: COUNTRY,
      actorId: 'ACTOR_PREFIX_TEST',
      authSubject: '00000000-0000-4000-8000-000000000010',
      officeId: 'INDUSTRY',
      commandId: `COMMAND_PREFIX_${after}`,
      commandType: 'TEST_ONLY_INDUSTRY_PREFIX',
      correlationId: `CORRELATION_PREFIX_${after}`,
      expectedWorldVersion: String(before),
      idempotencyKey: `IDEMPOTENCY_PREFIX_${after}`,
      payload: { TEST_ONLY: true },
      simTime: '1000',
      submittedAtReal: NOW,
    },
    sha,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_PREFIX_${after}`,
      eventType: type,
      worldId: WORLD,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: after,
      simTime: '1000',
      recordedAtReal: NOW,
      correctsEventId: null,
      payload,
    },
    sha,
  );
  const t = createAuthoritativeTransition({
    command,
    worldVersionBefore: String(before),
    worldVersionAfter: after,
    events: [event],
  });
  return {
    command,
    transition: t,
    receipt: createFinalCommandReceipt({
      command,
      transition: t,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: NOW,
    }),
  };
}

function fixture(
  options: { payable?: boolean; later?: boolean; fingerprint?: string } = {},
) {
  const cash = createFinancialAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    ownerId: OP,
    accountId: financialAccountId('PREFIX_CASH'),
    accountClass: 'CASH',
    currency: 'XAA',
    claimId: null,
    counterpartyEntityId: null,
  });
  const equity = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('PREFIX_EQUITY'),
    accountClass: 'EQUITY',
  });
  const expense = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('PREFIX_EXPENSE'),
    accountClass: 'EXPENSE',
  });
  const payable = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('PREFIX_PAYABLE'),
    accountClass: 'PAYABLE',
  });
  const account = (batch: string, commodity: string) =>
    createInventoryAccount({
      worldId: WORLD,
      countryId: COUNTRY,
      commodityId: commodityId(commodity),
      batchId: inventoryBatchId(batch),
      unit: 'tonne',
      physicalLocationId: inventoryLocationId('PREFIX_FACILITY'),
      bucket: 'AVAILABLE',
      titleHolderId: OP,
      riskBearerId: OP,
      reservationId: null,
      shipmentId: null,
      economicRecognitionId: null,
    });
  const ore = account('PREFIX_ORE', 'ORE');
  const output = account('PREFIX_STEEL', 'STEEL');
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('PREFIX_TEST_SOURCE'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/industry-production-source-port.test.ts',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: true },
    },
    sha,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('PREFIX_TEST_SEED'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('PREFIX_ORE_OPENING'),
          sourceId: source.sourceId,
          account: ore,
          quantity: Quantity.from('8', 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('PREFIX_CASH_OPENING'),
          sourceId: source.sourceId,
          settlementCurrency: 'XAA',
          legs: [
            {
              legId: financialOpeningLegId('PREFIX_OPEN_DEBIT'),
              account: cash,
              direction: 'DEBIT',
              amount: Money.from('100', 'XAA'),
              counterpartLegId: financialOpeningLegId('PREFIX_OPEN_CREDIT'),
            },
            {
              legId: financialOpeningLegId('PREFIX_OPEN_CREDIT'),
              account: equity,
              direction: 'CREDIT',
              amount: Money.from('100', 'XAA'),
              counterpartLegId: financialOpeningLegId('PREFIX_OPEN_DEBIT'),
            },
          ],
        },
      ],
    },
    sha,
  );
  const paid = transition(0, 'TEST_ONLY_COST_PAID', { TEST_ONLY: true });
  const fundingFor = (
    row: ReturnType<typeof transition>,
    amount: string,
    id: string,
    credit = cash,
  ) =>
    createFinancialPostingBatch(
      {
        schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
        batchId: financialPostingBatchId(id),
        worldId: WORLD,
        causationCommandId: row.command.commandId,
        causationEventIds: row.transition.eventIds,
        worldVersionBefore: row.transition.worldVersionBefore,
        worldVersionAfter: row.transition.worldVersionAfter,
        simTime: row.command.simTime,
        command: row.command,
        transition: row.transition,
        settlementCurrency: 'XAA',
        legs: [
          {
            legId: financialPostingLegId(`${id}_EXPENSE`),
            account: expense,
            direction: 'DEBIT',
            amount: Money.from(amount, 'XAA'),
            counterpartyAccountId: credit.accountId,
          },
          {
            legId: financialPostingLegId(`${id}_CREDIT`),
            account: credit,
            direction: 'CREDIT',
            amount: Money.from(amount, 'XAA'),
            counterpartyAccountId: expense.accountId,
          },
        ],
      },
      sha,
    );
  const funding = fundingFor(
    paid,
    '6',
    'PREFIX_FUNDING',
    options.payable ? payable : cash,
  );
  const earlier: Committed = {
    ...paid,
    inventoryPostings: [],
    financialPostingBatches: [funding],
  };
  const before = rebuildV08LedgersFromLineage({
    seed,
    transitions: [earlier],
    sha256Hex: sha,
  });
  const trace: FoundationTraceRequest = {
    traceRef: 'PREFIX.TRACE',
    calculationVersion: 'TEST_ONLY.1',
    snapshot: {
      lineageRef: 'PREFIX.LINEAGE',
      sourceVersion: 'WORLD_VERSION.1',
      snapshotRef: 'PREFIX.SNAPSHOT',
      snapshotHash: sha(canonicalSerialize(before)),
      predecessorSnapshotHash: 'a'.repeat(64),
    },
    snapshotAt: q('1000', 'sim_millisecond'),
  };
  const fact = <T>(name: string, payload: T) =>
    createFoundationFact({
      trace,
      factRef: `PREFIX.${name}`,
      sourceRef: `TEST_SOURCE.${name}`,
      predecessorFactRefs: ['PREFIX.GENESIS'],
      payload,
    });
  const evidence: ProductionConsumptionEvidence = {
    runId: 'PREFIX.RUN',
    inventorySnapshotHash: canonicalSha256(
      canonicalHashInput(before.inventory),
      sha,
    ),
    input: {
      trace,
      outcomeRef: 'PREFIX.OUTCOME',
      capacity: fact('CAPACITY', {
        facilityRef: 'PREFIX.FACILITY',
        operationalCapacity: rate('10', 'hour', 'tonne'),
        operatingDuration: q('1', 'hour'),
        targetUtilisation: { amount: '1', unit: 'ratio' },
        productivity: rate('1', 'tonne', 'tonne'),
      }),
      materials: [
        fact('MATERIAL', {
          materialRef: 'PREFIX.ORE',
          inventoryRef: ore.batchId,
          v12AvailabilityRef: 'PREFIX.V12',
          readOnly: true,
          usableBefore: q('8', 'tonne'),
          requiredAtPotentialOutput: q('20', 'tonne'),
        }),
      ],
      energy: fact('ENERGY', {
        allocationRef: 'PREFIX.ENERGY',
        deliveredBefore: q('3', 'MWh'),
        requiredAtPotentialOutput: q('10', 'MWh'),
      }),
      labour: fact('LABOUR', {
        capacityRef: 'PREFIX.LABOUR',
        availableBefore: q('10', 'person_hour'),
        requiredAtPotentialOutput: q('10', 'person_hour'),
      }),
      logistics: fact('LOGISTICS', {
        capacityRef: 'PREFIX.LOGISTICS',
        availableBefore: q('10', 'tonne_km'),
        requiredAtPotentialOutput: q('10', 'tonne_km'),
      }),
    },
    recipe: fact('RECIPE', {
      facilityRef: 'PREFIX.FACILITY',
      outputCommodityId: commodityId('STEEL'),
      outputUnit: 'tonne',
      materials: [
        {
          materialRef: 'PREFIX.ORE',
          commodityId: ore.commodityId,
          perOutput: rate('2', 'tonne', 'tonne'),
        },
      ],
      energyPerOutput: rate('1', 'tonne', 'MWh'),
      labourPerOutput: rate('1', 'tonne', 'person_hour'),
      logisticsPerOutput: rate('1', 'tonne', 'tonne_km'),
      costPerOutput: rate('2', 'tonne', 'XAA'),
    }),
    operating: fact('OPERATING', {
      worldId: WORLD,
      worldVersion: '1',
      facilityRef: 'PREFIX.FACILITY',
      operatorId: OP,
      operatorClassification: 'OP',
      maintenanceAppliedRef: 'PREFIX.MAINTENANCE',
      technologyRightRef: 'PREFIX.TECHNOLOGY',
      operatingPermissionRef: 'PREFIX.PERMISSION',
      costSourceRef: 'PREFIX.COST',
      fundingBatchId: funding.batchId,
      fundingFingerprint: (options.fingerprint ??
        funding.fingerprint) as typeof funding.fingerprint,
      costLegId: financialPostingLegId('PREFIX_FUNDING_EXPENSE'),
      settledCost: { amount: '6', currency: 'XAA' },
    }),
    materials: [{ materialRef: 'PREFIX.ORE', account: ore }],
    output,
  };
  const make = (value = evidence) => {
    const executed = transition(
      1,
      PRODUCTION_SETTLED_EVENT_TYPE,
      productionConsumptionEventPayload(value),
    );
    const posting = createProductionConsumptionPosting(
      {
        postingId: inventoryPostingId('PREFIX_PRODUCTION'),
        command: executed.command,
        transition: executed.transition,
        evidence: value,
      },
      sha,
    );
    const row: Committed = {
      ...executed,
      inventoryPostings: [posting],
      financialPostingBatches: [],
    };
    return { row, posting };
  };
  const production = make();
  const rows: Committed[] = [earlier, production.row];
  if (options.later) {
    // Generic balanced TEST_ONLY later fact: its negative current cash is NOT
    // retroactive evidence that the earlier production cost was unpaid.
    const later = transition(2, 'TEST_ONLY_LATER_FINANCIAL_FACT', {
      TEST_ONLY: true,
    });
    rows.push({
      ...later,
      inventoryPostings: [],
      financialPostingBatches: [fundingFor(later, '95', 'PREFIX_LATER')],
    });
  }
  const input: IndustryPrefixTestInput = {
    seed,
    sourceHead: {
      worldId: WORLD,
      worldVersion: String(rows.length),
      eventSequence: String(rows.length),
    },
    transitions: rows,
    selectors: {
      worldId: WORLD,
      countryId: COUNTRY,
      commandId: production.row.command.commandId,
      eventId: production.row.transition.eventIds[0]!,
      postingId: production.posting.postingId,
      expectedPublicationHead: {
        worldId: WORLD,
        worldVersion: String(rows.length),
        eventSequence: String(rows.length),
      },
    },
    sha256Hex: sha,
  };
  return { seed, rows, input, earlier, evidence, make, production, cash };
}

function stored(posting: ReturnType<typeof fixture>['production']['posting']) {
  const payload = JSON.parse(canonicalSerialize(posting)) as Record<
    string,
    unknown
  >;
  const fingerprint = payload.fingerprint;
  delete payload.fingerprint;
  return {
    canonical_payload: payload,
    causation_command_id: posting.causationCommandId,
    fingerprint,
  };
}
function decode(f = fixture(), row: unknown = stored(f.production.posting)) {
  return decodeIndustryProductionRow({
    row,
    command: f.production.row.command,
    transition: f.production.row.transition,
    sha256Hex: sha,
  });
}
function set(value: unknown, parts: readonly string[], replacement: unknown) {
  let r = value as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) r = r[p] as Record<string, unknown>;
  r[parts.at(-1)!] = replacement;
}
describe('finite production row decoder, not schema admission', () => {
  it('roundtrips the real earlier-funded standard-SHA Core posting', () => {
    const f = fixture(),
      row = stored(f.production.posting),
      before = canonicalSerialize(row);
    const result = decode(f, row);
    expect(result.fingerprint).toBe(f.production.posting.fingerprint);
    expect(canonicalSerialize(result)).toBe(
      canonicalSerialize(f.production.posting),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(canonicalSerialize(row)).toBe(before);
    expect(() => assertInventoryPersistenceSchemaAdmitted([result])).toThrow(
      PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED,
    );
  });
  it('accepts actual canonical SQL text representation without coercing values', () => {
    const f = fixture(),
      r = stored(f.production.posting);
    expect(
      decode(f, {
        ...r,
        canonical_payload: canonicalSerialize(r.canonical_payload),
      }).fingerprint,
    ).toBe(r.fingerprint);
  });
  it.each([
    ['wrong row cause', ['causation_command_id'], 'OTHER_COMMAND'],
    ['wrong fingerprint', ['fingerprint'], 'sha256:' + '0'.repeat(64)],
    [
      'wrong result',
      ['canonical_payload', 'result', 'actualOutput', 'amount'],
      '999',
    ],
    ['extra top field', ['canonical_payload', 'admitted'], true],
    [
      'extra recipe field',
      ['canonical_payload', 'evidence', 'recipe', 'payload', 'extra'],
      'x',
    ],
    [
      'extra source field',
      ['canonical_payload', 'evidence', 'operating', 'extra'],
      'x',
    ],
    [
      'unknown quantity field',
      [
        'canonical_payload',
        'evidence',
        'input',
        'energy',
        'payload',
        'deliveredBefore',
        'extra',
      ],
      'x',
    ],
    [
      'changed funding',
      [
        'canonical_payload',
        'evidence',
        'operating',
        'payload',
        'settledCost',
        'amount',
      ],
      '5',
    ],
    [
      'changed title',
      ['canonical_payload', 'evidence', 'output', 'titleHolderId'],
      'OTHER_OPERATOR',
    ],
    ['mixed transition', ['canonical_payload', 'worldVersionAfter'], '3'],
    ['wrong operation', ['canonical_payload', 'operation'], 'TRANSFER'],
    ['unknown row field', ['extra'], 'x'],
    ['malformed JSON', ['canonical_payload'], '{'],
    ['oversize JSON', ['canonical_payload'], ' '.repeat(262145)],
  ])('rejects %s', (_name, parts, value) => {
    const f = fixture(),
      r = structuredClone(stored(f.production.posting));
    set(r, parts as string[], value);
    expect(() => decode(f, r)).toThrow();
  });
  it('rejects untrusted accessors without evaluating them', () => {
    const f = fixture(),
      r = stored(f.production.posting);
    let calls = 0;
    Object.defineProperty(r, 'canonical_payload', {
      get() {
        calls++;
        return {};
      },
    });
    expect(() => decode(f, r)).toThrow();
    expect(calls).toBe(0);
  });
  it('rejects native Proxy identities before reflective traps', () => {
    const f = fixture();
    let traps = 0;
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          traps++;
          throw new Error('must not inspect');
        },
        ownKeys() {
          traps++;
          throw new Error('must not inspect');
        },
      },
    );
    expect(() => decode(f, proxy)).toThrow();
    const row = stored(f.production.posting);
    row.canonical_payload.evidence = proxy;
    expect(() => decode(f, row)).toThrow();
    expect(traps).toBe(0);
  });
  it('rejects sparse arrays, prototypes, cycles and excess nesting', () => {
    const f = fixture();
    const sparse = stored(f.production.posting);
    sparse.canonical_payload.entries = Array(2);
    expect(() => decode(f, sparse)).toThrow();
    const proto = Object.create(stored(f.production.posting));
    expect(() => decode(f, proto)).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.x = cycle;
    expect(() => copyIndustrySourceData(cycle)).toThrow();
    let deep: unknown = 'leaf';
    for (let n = 0; n < 18; n++) deep = { value: deep };
    expect(() => copyIndustrySourceData(deep)).toThrow();
  });
  it('does not execute a second calculator or authenticate supplied source refs', () => {
    const f = fixture(),
      p = decode(f);
    expect(p.result.actualOutput).toEqual({ amount: '3', unit: 'tonne' });
    expect(p.evidence.operating.payload.fundingBatchId).toBe(
      f.earlier.financialPostingBatches[0]!.batchId,
    );
  });
});
