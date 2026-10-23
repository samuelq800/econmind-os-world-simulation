// TEST_ONLY mechanism and deterministic SQL rows; never native/source admission.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  type FinalCommandReceipt,
  type FoundationTraceRequest,
  type ProductionConsumptionEvidence,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import {
  evaluateIndustryProductionPrefixForTestOnly,
  readIndustryProductionSourceFrom,
  type IndustryPrefixTestInput,
} from '../../apps/world-worker/src/projections/industry-production-source-port.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const WORLD = worldId('WORLD_INDUSTRY_PREFIX_TEST');
const COUNTRY = countryId('COUNTRY_INDUSTRY_PREFIX_TEST');
const OP = legalEntityId('OP_INDUSTRY_PREFIX_TEST');
const NOW = '2026-10-23T00:00:00.000Z';
type Row = Record<string, unknown>;
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

function receiptRow(r: FinalCommandReceipt): Row {
  return {
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
    event_ids: [...r.eventIds],
    recorded_at_real: r.recordedAtReal,
  };
}
/** Genuine existing issuer over TEST_ONLY SQL rows, no overridden reader method. */
function sqlFixture(
  f: ReturnType<typeof fixture>,
  production = false,
  prohibitedFixtureSeed = false,
) {
  const rows = production ? f.rows : [f.earlier];
  const sourceHead = {
    worldId: WORLD,
    worldVersion: String(rows.length),
    eventSequence: String(rows.length),
  };
  // Dedicated mock server-row protocol, matching the existing genuine-issuer
  // tests. This does not retag/adopt f.seed or issue a real dataset. The pure
  // ForTestOnly entry still accepts ONLY its original TEST_FIXTURE seed.
  const { fingerprint: ignored, ...fixtureSeedIntent } = f.seed;
  void ignored;
  const rowSource = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('PREFIX_TEST_SOURCE'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://TEST_ONLY_SQL_ROW_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY_ROW_PROTOCOL.1',
      payload: { MOCK_SQL_ROWS_ONLY: true, sourceAdmitted: false },
    },
    sha,
  );
  const rowSeed = prohibitedFixtureSeed
    ? f.seed
    : createOpeningSeed({ ...fixtureSeedIntent, sources: [rowSource] }, sha);
  const { fingerprint: seedFingerprint, ...seedIntent } = rowSeed;
  const opening = {
    world_id: WORLD,
    seed_id: f.seed.seedId,
    opening_world_version: '0',
    replay_binding: canonicalSerialize(f.seed.replayBinding),
    canonical_payload: canonicalSerialize(seedIntent),
    seed_fingerprint: seedFingerprint,
  };
  const events = rows.flatMap((row) =>
    row.transition.events.map((e) => {
      const c = row.command;
      return {
        command_actor_id: c.actorId,
        command_auth_subject: c.authSubject,
        command_canonical_payload: c.canonicalPayload,
        command_country_id: c.countryId,
        command_expected_world_version: c.expectedWorldVersion,
        command_fingerprint: c.fingerprint,
        command_id: c.commandId,
        command_idempotency_key: c.idempotencyKey,
        command_office_id: c.officeId,
        command_payload_sha256: c.payloadHash,
        command_schema_version: c.schemaVersion,
        command_sim_time: c.simTime.toCanonicalValue(),
        command_submitted_at_real: c.submittedAtReal,
        command_type: c.commandType,
        command_world_id: c.worldId,
        command_correlation_id: c.correlationId,
        correlation_id: e.correlationId,
        event_canonical_payload: e.canonicalPayload,
        event_causation_command_id: e.causationCommandId,
        event_corrects_event_id: e.correctsEventId,
        event_fingerprint: e.fingerprint,
        event_id: e.eventId,
        event_payload_sha256: e.payloadHash,
        event_recorded_at_real: e.recordedAtReal,
        event_schema_version: e.schemaVersion,
        event_sequence: e.sequence,
        event_sim_time: e.simTime.toCanonicalValue(),
        event_type: e.eventType,
        event_world_id: e.worldId,
        event_world_version: e.worldVersion,
      };
    }),
  );
  const postingRows = (financial: boolean) =>
    rows.flatMap((row) =>
      (financial ? row.financialPostingBatches : row.inventoryPostings).map(
        (p) => {
          const { fingerprint, ...intent } = p;
          return {
            causation_command_id: row.command.commandId,
            canonical_payload: canonicalSerialize(intent),
            fingerprint,
          };
        },
      ),
    );
  const receipts = rows.map((r) => receiptRow(r.receipt));
  const trace: string[] = [];
  const executor: SqlExecutor = {
    async query<Result extends object>(
      statement: string,
      params?: readonly unknown[],
    ) {
      trace.push(statement);
      expect(params?.[0]).toBe(WORLD);
      let values: readonly Row[];
      if (statement.includes('from world_v2.world_head'))
        values = [
          {
            world_version: sourceHead.worldVersion,
            event_sequence: sourceHead.eventSequence,
          },
        ];
      else if (statement.includes('from world_v2.opening_seed'))
        values = [opening];
      else if (statement.includes('from world_v2.authoritative_event event'))
        values = events;
      else if (statement.includes('from world_v2.inventory_posting'))
        values = postingRows(false);
      else if (statement.includes('from world_v2.financial_posting_batch'))
        values = postingRows(true);
      else if (statement.includes("outcome = 'COMMITTED'"))
        values = receipts.map((r) => ({ command_id: r.command_id }));
      else if (statement.includes('from world_v2.command_receipt'))
        values = receipts.filter((r) => r.command_id === params?.[1]);
      else throw new Error('UNEXPECTED_TEST_QUERY');
      return { rows: values as readonly Result[], rowCount: values.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw new Error('POOL_QUERY_FORBIDDEN');
    },
    transaction: async () => {
      throw new Error('NESTED_TRANSACTION_FORBIDDEN');
    },
  };
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: sha,
  });
  return { reader, executor, sourceHead, trace };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST', 'true');
  vi.stubEnv('ECONMIND_ENV', 'local');
});
afterEach(() => vi.unstubAllEnvs());

describe('new Industry source-port shared prefix mechanism', () => {
  it('evaluates real constructor lineage with earlier settled funding and inert exact output', () => {
    const f = fixture();
    const r = evaluateIndustryProductionPrefixForTestOnly(f.input);
    expect(r).toMatchObject({
      kind: 'INDUSTRY_PREFIX_TEST_CANDIDATE',
      admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED',
      productionAuthority: false,
      sourceAdmitted: false,
      runtimeConnected: false,
      result: {
        status: 'EVALUATED_TEST_ONLY',
        actualOutput: q('3', 'tonne'),
        targetCutoff: { worldVersion: '2', eventSequence: '2' },
      },
    });
    expect(Object.keys(r).sort()).toEqual(
      [
        'schemaVersion',
        'kind',
        'admission',
        'productionAuthority',
        'sourceAdmitted',
        'runtimeConnected',
        'result',
      ].sort(),
    );
    expect(canonicalSerialize(r)).not.toMatch(
      /appliedBatches|netDebitBalance|targetPrefixRebuiltLedgers|canonicalPayload/,
    );
  });
  it('uses target historical prefix, not later negative head cash, and is deterministic', () => {
    const f = fixture({ later: true });
    const full = rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: f.rows,
      sha256Hex: sha,
    });
    expect(
      full.financial.positions
        .find((p) => p.account.accountId === f.cash.accountId)
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('-1');
    const a = evaluateIndustryProductionPrefixForTestOnly(f.input),
      b = evaluateIndustryProductionPrefixForTestOnly(f.input);
    expect(a.result).toMatchObject({
      publicationHead: { worldVersion: '3' },
      targetCutoff: { worldVersion: '2' },
      actualOutput: q('3', 'tonne'),
    });
    expect(canonicalSerialize(a)).toBe(canonicalSerialize(b));
  });
  it('owns and freezes head, cause, output and account witnesses, not mutable caller causality', () => {
    const f = fixture();
    const c = { ...f.production.row.command };
    const e = { ...f.production.row.transition.events[0]! };
    const t = { ...f.production.row.transition, events: [e] };
    const input = {
      ...f.input,
      transitions: [
        f.earlier,
        { ...f.production.row, command: c, transition: t },
      ],
    };
    const r = evaluateIndustryProductionPrefixForTestOnly(input);
    const bytes = canonicalSerialize(r);
    expect(Reflect.set(c, 'commandId', commandId('COMMAND_MUTATED'))).toBe(
      true,
    );
    expect(Reflect.set(e, 'eventId', eventId('EVENT_MUTATED'))).toBe(true);
    expect(Reflect.set(input.sourceHead, 'worldVersion', '99')).toBe(true);
    expect(canonicalSerialize(r)).toBe(bytes);
    expect(Object.isFrozen(r)).toBe(true);
    if (r.result.status !== 'EVALUATED_TEST_ONLY')
      throw Error('positive fixture');
    expect(Object.isFrozen(r.result.cause)).toBe(true);
    expect(Object.isFrozen(r.result.inventoryAccountWitnesses)).toBe(true);
    expect(
      Reflect.set(
        r.result.inventoryAccountWitnesses[0]!,
        'titleHolderId',
        'OTHER',
      ),
    ).toBe(false);
  });
  it.each([
    ['NODE_ENV', 'production'],
    ['VITEST', 'false'],
    ['ECONMIND_ENV', 'production'],
  ] as const)(
    'checks %s before any input reads on every call',
    (key, value) => {
      evaluateIndustryProductionPrefixForTestOnly(fixture().input);
      vi.stubEnv(key, value);
      const poison = new Proxy({} as IndustryPrefixTestInput, {
        get() {
          throw Error('INPUT_WAS_READ');
        },
      });
      expect(() => evaluateIndustryProductionPrefixForTestOnly(poison)).toThrow(
        'INDUSTRY_PREFIX_TEST_RUNTIME_REQUIRED',
      );
    },
  );
  it('rejects extra input fields, accessors and non-TEST_FIXTURE sources', () => {
    const f = fixture();
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        provider: () => f.input,
      } as IndustryPrefixTestInput),
    ).toThrow('accessor field');
    const accessor = { ...f.input };
    Object.defineProperty(accessor, 'seed', {
      get() {
        throw Error('GETTER_EXECUTED');
      },
      enumerable: true,
    });
    expect(() => evaluateIndustryProductionPrefixForTestOnly(accessor)).toThrow(
      'accessor field',
    );
    const source = createOpeningSource(
      {
        schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: openingSourceId('NOT_TEST_SOURCE'),
        sourceKind: 'AUTHORITATIVE_DATASET',
        locator: 'dataset://not-admitted-test',
        sourceVersion: '1',
        payload: { TEST_ONLY: true },
      },
      sha,
    );
    const { fingerprint: ignored, ...seed } = f.seed;
    void ignored;
    const other = createOpeningSeed(
      {
        ...seed,
        sources: [source],
        inventoryEntries: [],
        financialBatches: [],
      },
      sha,
    );
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({ ...f.input, seed: other }),
    ).toThrow('TEST_FIXTURE');
  });
  it('rejects missing same-ledger funding fingerprint and a balanced but unpaid payable', () => {
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly(
        fixture({ fingerprint: `sha256:${'a'.repeat(64)}` }).input,
      ),
    ).toThrow('same ledger');
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly(
        fixture({ payable: true }).input,
      ),
    ).toThrow('cash/deposit');
  });
  it('rejects future funding; never marks an unfunded earlier transition paid later', () => {
    const f = fixture({ later: true });
    const batch = f.rows[2]!.financialPostingBatches[0]!;
    const op = {
      ...f.evidence.operating.payload,
      fundingBatchId: batch.batchId,
      fundingFingerprint: batch.fingerprint,
      costLegId: batch.legs.find((l) => l.direction === 'DEBIT')!.legId,
    };
    const evidence = {
      ...f.evidence,
      operating: {
        ...f.evidence.operating,
        payload: op,
        canonicalPayload: canonicalSerialize(op),
      },
    };
    const production = f.make(evidence);
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        transitions: [f.earlier, production.row, f.rows[2]!],
      }),
    ).toThrow('same ledger');
  });
  it('rejects incomplete lineage, noncommitted receipt and a raw snapshot-shaped posting', () => {
    const f = fixture();
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        transitions: [f.production.row],
      }),
    ).toThrow();
    const rejected = createFinalCommandReceipt({
      command: f.production.row.command,
      outcome: 'REJECTED',
      reasonCode: 'TEST_ONLY_REJECTION',
      transition: null,
      simTime: f.production.row.command.simTime,
      recordedAtReal: NOW,
    });
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        transitions: [f.earlier, { ...f.production.row, receipt: rejected }],
      }),
    ).toThrow();
    const raw = { ...f.production.posting };
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        transitions: [
          f.earlier,
          { ...f.production.row, inventoryPostings: [raw] },
        ],
      }),
    ).toThrow('validated canonical');
  });
  it('rejects head/country mismatch and capacity overflow without truncating', () => {
    const f = fixture();
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        sourceHead: { ...f.input.sourceHead, worldVersion: '1' },
      }),
    ).toThrow('Held head');
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        selectors: {
          ...f.input.selectors,
          countryId: countryId('COUNTRY_OTHER'),
        },
      }),
    ).toThrow('country');
    const head = { ...f.input.sourceHead, eventSequence: '10001' };
    expect(() =>
      evaluateIndustryProductionPrefixForTestOnly({
        ...f.input,
        sourceHead: head,
        selectors: { ...f.input.selectors, expectedPublicationHead: head },
      }),
    ).toThrow('never truncate');
  });
  it('returns only an explicit owned unavailable result for an absent exact target', () => {
    const f = fixture();
    const r = evaluateIndustryProductionPrefixForTestOnly({
      ...f.input,
      selectors: {
        ...f.input.selectors,
        commandId: commandId('COMMAND_NOT_PRESENT'),
      },
    });
    expect(r.result).toEqual({
      status: 'SOURCE_UNAVAILABLE',
      reason: 'PRODUCTION_TARGET_NOT_FOUND',
      publicationHead: f.input.sourceHead,
    });
    expect(Object.isFrozen(r.result)).toBe(true);
  });
});

describe('new port over the unchanged genuine issuer and schema guards', () => {
  it('preserves the server refusal of TEST_FIXTURE seed provenance', async () => {
    const f = fixture(),
      sql = sqlFixture(f, false, true);
    let entered = false;
    await expect(
      withValidatedCanonicalLineageFrom(
        { reader: sql.reader, executor: sql.executor, worldId: WORLD },
        async () => {
          entered = true;
        },
      ),
    ).rejects.toThrow('Server opening seed cannot contain TEST_FIXTURE');
    expect(entered).toBe(false);
  });
  it('reads no SQL itself, preserves no-target result and checks exact head/executor/lifetime', async () => {
    const f = fixture(),
      sql = sqlFixture(f);
    let escaped: ValidatedCanonicalLineageView | undefined;
    await withValidatedCanonicalLineageFrom(
      { reader: sql.reader, executor: sql.executor, worldId: WORLD },
      async (view) => {
        escaped = view;
        const count = sql.trace.length;
        const selectors = {
          ...f.input.selectors,
          expectedPublicationHead: sql.sourceHead,
        };
        expect(
          readIndustryProductionSourceFrom(sql.executor, view, selectors, sha)
            .kind,
        ).toBe('SOURCE_UNAVAILABLE');
        expect(sql.trace.length).toBe(count);
        expect(() =>
          readIndustryProductionSourceFrom(
            { query: sql.executor.query },
            view,
            selectors,
            sha,
          ),
        ).toThrow('forged, expired');
        expect(() =>
          readIndustryProductionSourceFrom(
            sql.executor,
            view,
            f.input.selectors,
            sha,
          ),
        ).toThrow('Held head');
      },
    );
    expect(() =>
      readIndustryProductionSourceFrom(
        sql.executor,
        escaped!,
        f.input.selectors,
        sha,
      ),
    ).toThrow('forged, expired');
  });
  it('does not consume a TEST_ONLY candidate as a real view or issue a replacement token', () => {
    const f = fixture(),
      sql = sqlFixture(f),
      candidate = evaluateIndustryProductionPrefixForTestOnly(f.input);
    expect(() =>
      readIndustryProductionSourceFrom(
        sql.executor,
        candidate as unknown as ValidatedCanonicalLineageView,
        f.input.selectors,
        sha,
      ),
    ).toThrow('forged, expired');
    expect(sql.trace).toHaveLength(0);
  });
  it('retains actual prototype decoder and pre-transaction writer schema rejection', async () => {
    const f = fixture(),
      sql = sqlFixture(f, true);
    let entered = false;
    await expect(
      withValidatedCanonicalLineageFrom(
        { reader: sql.reader, executor: sql.executor, worldId: WORLD },
        async () => {
          entered = true;
        },
      ),
    ).rejects.toThrow(PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED);
    expect(entered).toBe(false);
    expect(() =>
      assertInventoryPersistenceSchemaAdmitted([f.production.posting]),
    ).toThrow(PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED);
  });
});

// Native admitted-production positive: NOT_RUN, pending D's reviewed schema /
// decoder contracts. Same-transition funding's present event/batch fingerprint
// cycle is NOT bypassed with a constant digest or forged posting in this suite.
