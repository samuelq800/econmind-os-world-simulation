// Mock SQL rows exercise genuine issuer lifetime; never actual native/source admission.
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
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import { bindIndustryPriorFundingCutoffFrom } from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';

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
  options: {
    payable?: boolean;
    later?: boolean;
    fingerprint?: string;
    openingCash?: string;
    replenishment?: boolean;
  } = {},
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
              amount: Money.from(options.openingCash ?? '100', 'XAA'),
              counterpartLegId: financialOpeningLegId('PREFIX_OPEN_CREDIT'),
            },
            {
              legId: financialOpeningLegId('PREFIX_OPEN_CREDIT'),
              account: equity,
              direction: 'CREDIT',
              amount: Money.from(options.openingCash ?? '100', 'XAA'),
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
  const preceding: Committed[] = [earlier];
  if (options.replenishment) {
    const received = transition(1, 'TEST_ONLY_LATER_CASH_RECEIPT', {
      TEST_ONLY: true,
    });
    const batch = createFinancialPostingBatch(
      {
        schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
        batchId: financialPostingBatchId('PREFIX_REPLENISHMENT'),
        worldId: WORLD,
        causationCommandId: received.command.commandId,
        causationEventIds: received.transition.eventIds,
        worldVersionBefore: '1',
        worldVersionAfter: '2',
        simTime: received.command.simTime,
        command: received.command,
        transition: received.transition,
        settlementCurrency: 'XAA',
        legs: [
          {
            legId: financialPostingLegId('PREFIX_REPLENISH_DEBIT'),
            account: cash,
            direction: 'DEBIT',
            amount: Money.from('2', 'XAA'),
            counterpartyAccountId: equity.accountId,
          },
          {
            legId: financialPostingLegId('PREFIX_REPLENISH_CREDIT'),
            account: equity,
            direction: 'CREDIT',
            amount: Money.from('2', 'XAA'),
            counterpartyAccountId: cash.accountId,
          },
        ],
      },
      sha,
    );
    preceding.push({
      ...received,
      inventoryPostings: [],
      financialPostingBatches: [batch],
    });
  }
  const before = rebuildV08LedgersFromLineage({
    seed,
    transitions: preceding,
    sha256Hex: sha,
  });
  const trace: FoundationTraceRequest = {
    traceRef: 'PREFIX.TRACE',
    calculationVersion: 'TEST_ONLY.1',
    snapshot: {
      lineageRef: 'PREFIX.LINEAGE',
      sourceVersion: `WORLD_VERSION.${before.worldVersion}`,
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
      worldVersion: before.worldVersion,
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
      Number(before.worldVersion),
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
  const rows: Committed[] = [...preceding, production.row];
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
  const rows = production
    ? f.rows
    : f.rows.filter((row) => row.inventoryPostings.length === 0);
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

function sourceInput(f: ReturnType<typeof fixture>) {
  const original = f.earlier,
    c = f.production.row.command,
    b = original.financialPostingBatches[0]!;
  return {
    schemaVersion: 'industry-funding-source-input-v1',
    original: {
      issuerRef: 'TEST_ISSUER',
      custodyRef: 'TEST_CUSTODY',
      qualificationRecordRef: 'TEST_ORIGINAL_DECISION',
      qualificationRevision: 'ORIGINAL_REV',
      sourceContentHash: 'sha256:' + sha('original source'),
      ruleRevision: 'ORIGINAL_RULE',
      sourceRevision: 'ORIGINAL_SOURCE',
      restrictionRevision: 'ORIGINAL_RESTRICTIONS',
      worldId: WORLD,
      countryId: COUNTRY,
      operatorId: OP,
      commandId: original.command.commandId,
      commandFingerprint: original.command.fingerprint,
      batchId: b.batchId,
      batchFingerprint: b.fingerprint,
      costLegId: 'PREFIX_FUNDING_EXPENSE',
      cashAccountId: 'PREFIX_CASH',
      expenseAccountId: 'PREFIX_EXPENSE',
      amount: '6',
      currency: 'XAA',
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      eventSequenceBefore: '0',
      eventSequenceAfter: '1',
      simTime: '1000',
      scope: 'ORIGINAL_SETTLEMENT',
      disposition: 'ELIGIBLE',
    },
    current: {
      issuerRef: 'TEST_CURRENT_ISSUER',
      custodyRef: 'TEST_CUSTODY',
      decisionRef: 'TEST_CURRENT_DECISION',
      revision: 'CURRENT_REV_9',
      sourceContentHash: 'sha256:' + sha('current source'),
      sourceRevision: 'CURRENT_SOURCE_9',
      correctionRevision: null,
      withdrawalRevision: null,
      ruleRevision: 'CURRENT_RULE_9',
      worldId: WORLD,
      countryId: COUNTRY,
      operatorId: OP,
      commandId: c.commandId,
      commandFingerprint: c.fingerprint,
      worldVersion: f.production.row.transition.worldVersionBefore,
      eventSequence: (
        BigInt(f.production.row.transition.events[0]!.sequence) - 1n
      ).toString(),
      simTime: '1000',
      validFromTicks: '0',
      validUntilTicks: '2000',
      fundingBatchId: b.batchId,
      fundingFingerprint: b.fingerprint,
      costLegId: 'PREFIX_FUNDING_EXPENSE',
      scope: 'CURRENT_PRODUCTION_USE',
      disposition: 'ALLOWED',
      originalApplicability: 'PRESERVE_ORIGINAL',
    },
    resources: [
      {
        targetDatabaseIdentity: 'TEST_DATABASE',
        ownerDomainId: 'TEST_OWNER',
        resourceKind: 'FUNDING',
        canonicalResourceKey: 'TEST_RESOURCE',
        aliasIdentity: 'TEST_ALIAS',
        lockMode: 'SHARE',
        observationRevision: 'RESOURCE_REV',
        protectedPredicateRef: 'TEST_PREDICATE',
        writerProtocolRevision: 'TEST_WRITER',
        revokerProtocolRevision: 'TEST_REVOKER',
        postlockObservationRef: 'TEST_POSTLOCK',
      },
    ],
  };
}
function set(value: unknown, parts: readonly string[], replacement: unknown) {
  let r = value as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) r = r[p] as Record<string, unknown>;
  r[parts.at(-1)!] = replacement;
}
async function bound(
  f: ReturnType<typeof fixture>,
  source: unknown = sourceInput(f),
) {
  const s = sqlFixture(f);
  return withValidatedCanonicalLineageFrom(
    { reader: s.reader, executor: s.executor, worldId: WORLD },
    async (view) =>
      bindIndustryPriorFundingCutoffFrom({
        transaction: s.executor,
        view,
        targetCommand: f.production.row.command,
        targetTransition: f.production.row.transition,
        productionPosting: f.production.posting,
        sourceInput: source,
        sha256Hex: sha,
      }),
  );
}
describe('prior own-cutoff and current use data binding, not source authentication', () => {
  it('consumes a genuine short-lived issuer view over financial-only mock SQL history', async () => {
    const f = fixture(),
      r = await bound(f);
    expect(r.status).toBe('DATA_BINDING_MATCH_NOT_AUTHENTICATED');
    expect(r.productionAuthority).toBe(false);
    expect(r.sourceAdmitted).toBe(false);
    expect(r.runtimeReady).toBe(false);
    expect(r.originalCutoff).toMatchObject({
      beforeWorldVersion: '0',
      afterWorldVersion: '1',
      beforeEventSequence: '0',
      afterEventSequence: '1',
    });
    expect(r.checkedHead).toMatchObject({
      worldVersion: '1',
      eventSequence: '1',
    });
    expect(r.proposedWorldVersion).toBe('2');
    expect(Object.isFrozen(r.originalEffect)).toBe(true);
  });
  it('keeps original and current source revisions independent', async () => {
    const f = fixture(),
      r = await bound(f);
    const source = r.source;
    expect(source.original.sourceRevision).toBe('ORIGINAL_SOURCE');
    expect(source.current.sourceRevision).toBe('CURRENT_SOURCE_9');
  });
  it.each([
    ['original amount', ['original', 'amount'], '7'],
    ['original currency', ['original', 'currency'], 'XBB'],
    ['original cost leg', ['original', 'costLegId'], 'MISSING_LEG'],
    ['original cash', ['original', 'cashAccountId'], 'OTHER_CASH'],
    ['original command', ['original', 'commandId'], 'OTHER_COMMAND'],
    ['original cutoff', ['original', 'worldVersionAfter'], '2'],
    ['qualification absent', ['original', 'disposition'], 'UNKNOWN'],
    ['current revoked', ['current', 'disposition'], 'REVOKED'],
    ['current wrong purpose', ['current', 'scope'], 'ORIGINAL_SETTLEMENT'],
    ['current stale head', ['current', 'worldVersion'], '0'],
    ['current wrong command', ['current', 'commandId'], 'OTHER_COMMAND'],
    ['current expired', ['current', 'validUntilTicks'], '1000'],
    [
      'unsupported recall',
      ['current', 'originalApplicability'],
      'ORIGINAL_CORRECTED',
    ],
    [
      'wrong fingerprint',
      ['current', 'fundingFingerprint'],
      'sha256:' + '0'.repeat(64),
    ],
    ['numeric cutoff', ['original', 'simTime'], 1000],
    ['zero amount', ['original', 'amount'], '0'],
    ['noncanonical amount', ['original', 'amount'], '6.0'],
    ['unknown field', ['current', 'extra'], 'x'],
    ['SQL lock string', ['resources', '0', 'lockMode'], 'SELECT_FOR_UPDATE'],
  ])('rejects %s', async (_name, parts, value) => {
    const f = fixture(),
      source = sourceInput(f);
    set(source, parts as string[], value);
    await expect(bound(f, source)).rejects.toThrow();
  });
  it('rejects missing original records without fabricating eligibility', async () => {
    const f = fixture();
    await expect(bound(f, null)).rejects.toThrow();
  });
  it('rejects duplicate resources/aliases and unreviewed ordering', async () => {
    const f = fixture(),
      source = sourceInput(f);
    source.resources.push({ ...source.resources[0]! });
    await expect(bound(f, source)).rejects.toThrow();
    source.resources[1] = {
      ...source.resources[0]!,
      canonicalResourceKey: 'AN_EARLIER_KEY',
      aliasIdentity: 'OTHER_ALIAS',
    };
    await expect(bound(f, source)).rejects.toThrow();
  });
  it('does not promote a balanced unpaid payable to settled cash', async () => {
    await expect(bound(fixture({ payable: true }))).rejects.toThrow();
  });
  it('reuses actual Core joint replay for a second production cost-recognition refusal', () => {
    const f = fixture();
    const after = rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: f.rows,
      sha256Hex: sha,
    });
    const trace = {
      ...f.evidence.input.trace,
      snapshot: {
        ...f.evidence.input.trace.snapshot,
        sourceVersion: 'WORLD_VERSION.2',
        snapshotHash: sha(canonicalSerialize(after)),
      },
    };
    const fact = <T>(name: string, payload: T) =>
      createFoundationFact({
        trace,
        factRef: `REPEAT.${name}`,
        sourceRef: `TEST_SOURCE.REPEAT.${name}`,
        predecessorFactRefs: ['PREFIX.OUTCOME'],
        payload,
      });
    const evidence: ProductionConsumptionEvidence = {
      ...f.evidence,
      runId: 'PREFIX.REPEAT.RUN',
      inventorySnapshotHash: canonicalSha256(
        canonicalHashInput(after.inventory),
        sha,
      ),
      input: {
        ...f.evidence.input,
        trace,
        capacity: fact('CAPACITY', f.evidence.input.capacity.payload),
        materials: [
          fact('MATERIAL', {
            ...f.evidence.input.materials[0]!.payload,
            usableBefore: q('2', 'tonne'),
          }),
        ],
        energy: fact('ENERGY', {
          ...f.evidence.input.energy.payload,
          deliveredBefore: q('1', 'MWh'),
        }),
        labour: fact('LABOUR', f.evidence.input.labour.payload),
        logistics: fact('LOGISTICS', f.evidence.input.logistics.payload),
      },
      recipe: fact('RECIPE', {
        ...f.evidence.recipe.payload,
        costPerOutput: rate('6', 'tonne', 'XAA'),
      }),
      operating: fact('OPERATING', {
        ...f.evidence.operating.payload,
        worldVersion: '2',
      }),
      output: createInventoryAccount({
        ...f.evidence.output,
        batchId: inventoryBatchId('REPEAT_OUTPUT_BATCH'),
      }),
    };
    const next = transition(
      2,
      PRODUCTION_SETTLED_EVENT_TYPE,
      productionConsumptionEventPayload(evidence),
    );
    const posting = createProductionConsumptionPosting(
      {
        postingId: inventoryPostingId('REPEAT_POSTING'),
        command: next.command,
        transition: next.transition,
        evidence,
      },
      sha,
    );
    expect(posting.result.actualOutput.amount).toBe('1');
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          ...f.rows,
          {
            ...next,
            inventoryPostings: [posting],
            financialPostingBatches: [],
          },
        ],
        sha256Hex: sha,
      }),
    ).toThrow('already recognized');
    // Pure-memory negative control, not a production-row view or native admission.
  });
  it('later positive cash cannot cure an originally negative funding cutoff', async () => {
    const f = fixture({ openingCash: '5', replenishment: true });
    const current = rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: f.rows.filter((row) => row.inventoryPostings.length === 0),
      sha256Hex: sha,
    });
    expect(
      current.financial.positions
        .find((p) => p.account.accountId === f.cash.accountId)
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('1');
    await expect(bound(f)).rejects.toThrow('negative cash');
  });
  it('rejects forged, foreign-executor and expired views', async () => {
    const f = fixture(),
      s = sqlFixture(f);
    let escaped: ValidatedCanonicalLineageView | null = null;
    await withValidatedCanonicalLineageFrom(
      { reader: s.reader, executor: s.executor, worldId: WORLD },
      async (view) => {
        escaped = view;
        const run = (executor: SqlExecutor, v: ValidatedCanonicalLineageView) =>
          bindIndustryPriorFundingCutoffFrom({
            transaction: executor,
            view: v,
            targetCommand: f.production.row.command,
            targetTransition: f.production.row.transition,
            productionPosting: f.production.posting,
            sourceInput: sourceInput(f),
            sha256Hex: sha,
          });
        expect(() => run({ ...s.executor }, view)).toThrow();
        expect(() =>
          run(s.executor, {} as ValidatedCanonicalLineageView),
        ).toThrow();
      },
    );
    expect(() =>
      bindIndustryPriorFundingCutoffFrom({
        transaction: s.executor,
        view: escaped!,
        targetCommand: f.production.row.command,
        targetTransition: f.production.row.transition,
        productionPosting: f.production.posting,
        sourceInput: sourceInput(f),
        sha256Hex: sha,
      }),
    ).toThrow();
  });
  it('has no pool queries/nested transaction or source grant', async () => {
    const f = fixture(),
      s = sqlFixture(f);
    await withValidatedCanonicalLineageFrom(
      { reader: s.reader, executor: s.executor, worldId: WORLD },
      async (view) => {
        const r = bindIndustryPriorFundingCutoffFrom({
          transaction: s.executor,
          view,
          targetCommand: f.production.row.command,
          targetTransition: f.production.row.transition,
          productionPosting: f.production.posting,
          sourceInput: sourceInput(f),
          sha256Hex: sha,
        });
        expect(r.status).toBe('DATA_BINDING_MATCH_NOT_AUTHENTICATED');
      },
    );
    expect(s.trace.length).toBeGreaterThan(0);
  });
});
