import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Quantity,
  canonicalSerialize,
  commodityId,
  countryId,
  createAuthoritativeTransition,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  createReservationPosting,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  shipNarrowTreasuryGcuTransfer,
  worldId,
  type CanonicalCommand,
  type CommitAuthorizationProof,
} from '@econmind/core';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  SqlNarrowTreasuryGcuShipmentPreparationSource,
  createSqlNarrowTreasuryGcuShipmentCandidateFactory,
} from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-shipment-preparation-source.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

// Mock rows exercise actual Core parsing/replay; they are not a real opening,
// economic approval, SQL execution, golden transaction or native PG evidence.
const sha256Hex = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const WORLD = worldId('WORLD_SHIPMENT_SOURCE');
const NOW = '2026-10-07T00:00:01.000Z';
type Row = Record<string, unknown>;

function intent(value: { readonly fingerprint: unknown }) {
  const { fingerprint: _fingerprint, ...rest } = value;
  void _fingerprint;
  return canonicalSerialize(rest);
}

function commandRow(command: CanonicalCommand): Row {
  return {
    command_actor_id: command.actorId,
    command_auth_subject: command.authSubject,
    command_canonical_payload: command.canonicalPayload,
    command_country_id: command.countryId,
    command_expected_world_version: command.expectedWorldVersion,
    command_fingerprint: command.fingerprint,
    command_id: command.commandId,
    command_idempotency_key: command.idempotencyKey,
    command_office_id: command.officeId,
    command_payload_sha256: command.payloadHash,
    command_schema_version: command.schemaVersion,
    command_sim_time: command.simTime.toCanonicalValue(),
    command_submitted_at_real: command.submittedAtReal,
    command_type: command.commandType,
    command_world_id: command.worldId,
    correlation_id: command.correlationId,
  };
}

function changedCommand(command: CanonicalCommand, overrides: Row) {
  const { fingerprint, payloadHash, canonicalPayload, simTime, ...base } =
    command;
  void fingerprint;
  void payloadHash;
  return parseCanonicalCommand(
    {
      ...base,
      payload: JSON.parse(canonicalPayload),
      simTime: simTime.toCanonicalValue(),
      ...overrides,
    },
    sha256Hex,
  );
}

function eventFor(command: CanonicalCommand, sequence: string) {
  return parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: 'MECHANISM_TEST_EVENT',
      worldId: WORLD,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: sequence,
      sequence,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: NOW,
      correctsEventId: null,
      payload: { purpose: 'MOCK_SQL_MECHANISM_ONLY' },
    },
    sha256Hex,
  );
}

function eventRow(
  command: CanonicalCommand,
  event: ReturnType<typeof eventFor>,
): Row {
  return {
    ...commandRow(command),
    event_canonical_payload: event.canonicalPayload,
    event_causation_command_id: event.causationCommandId,
    event_corrects_event_id: event.correctsEventId,
    event_fingerprint: event.fingerprint,
    event_id: event.eventId,
    event_payload_sha256: event.payloadHash,
    event_recorded_at_real: event.recordedAtReal,
    event_schema_version: event.schemaVersion,
    event_sequence: event.sequence,
    event_sim_time: event.simTime.toCanonicalValue(),
    event_type: event.eventType,
    event_world_id: event.worldId,
    event_world_version: event.worldVersion,
  };
}

function fixture(reservationQuantity = '2') {
  const account = createInventoryAccount({
    worldId: WORLD,
    countryId: countryId('COUNTRY_SELLER'),
    commodityId: commodityId('GRAIN'),
    batchId: inventoryBatchId('BATCH_SHIPMENT'),
    unit: 'tonne',
    physicalLocationId: inventoryLocationId('PORT_SHIPMENT'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: legalEntityId('ENTITY_SELLER'),
    riskBearerId: legalEntityId('ENTITY_SELLER'),
    economicRecognitionId: null,
  });
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_SHIPMENT'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://mechanism-test/NOT_REAL_DATA',
      sourceVersion: 'MOCK_ONLY_V1',
      payload: { purpose: 'MOCK_SQL_MECHANISM_ONLY' },
    },
    sha256Hex,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_SHIPMENT'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('OPENING_SHIPMENT'),
          sourceId: source.sourceId,
          account,
          quantity: Quantity.from('10', 'tonne'),
        },
      ],
      financialBatches: [],
    },
    sha256Hex,
  );
  const transfer = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_RESERVE_SOURCE',
      commandType: 'CORE_GOODS_TRANSFER_V1',
      worldId: WORLD,
      countryId: 'COUNTRY_SELLER',
      actorId: 'ACTOR_SELLER',
      authSubject: '11111111-1111-4111-8111-111111111111',
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEMPOTENCY_RESERVE',
      correlationId: 'CORRELATION_RESERVE',
      simTime: '100',
      submittedAtReal: NOW,
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: 'COUNTRY_SELLER',
        buyerCountryId: 'COUNTRY_BUYER',
        quantity: { amount: '2', unit: 'tonne' },
        price: { amount: '3', currency: 'GCU', perUnit: 'tonne' },
        assetSource: {
          batchId: account.batchId,
          physicalLocationId: account.physicalLocationId,
          titleHolderId: account.titleHolderId,
          riskBearerId: account.riskBearerId,
          economicRecognitionId: account.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: '2026-10-07T00:10:00.000Z',
      },
    },
    sha256Hex,
  );
  const shipment = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_SHIPMENT_SOURCE',
      commandType: 'CORE_GOODS_SHIPMENT_V1',
      worldId: WORLD,
      countryId: 'COUNTRY_SELLER',
      actorId: 'ACTOR_SELLER',
      authSubject: transfer.authSubject,
      officeId: null,
      expectedWorldVersion: '1',
      idempotencyKey: 'IDEMPOTENCY_SHIPMENT',
      correlationId: 'CORRELATION_SHIPMENT',
      simTime: '200',
      submittedAtReal: NOW,
      payload: {
        schemaVersion: 'core-goods-shipment-v1',
        shipmentId: 'SHIPMENT_SOURCE',
        transferCommandId: transfer.commandId,
        transferFingerprint: transfer.fingerprint,
      },
    },
    sha256Hex,
  );
  const event = eventFor(transfer, '1');
  const transition = createAuthoritativeTransition({
    command: transfer,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const reserved = createInventoryAccount({
    ...account,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('RESERVATION_FROM_COMMITTED_POSTING'),
  });
  const posting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId('POSTING_SOURCE_RESERVE'),
      worldId: WORLD,
      causationCommandId: transfer.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: transfer.simTime,
      command: transfer,
      transition,
      quantity: Quantity.from(reservationQuantity, 'tonne'),
      source: account,
      destination: reserved,
    },
    sha256Hex,
  );
  return { seed, transfer, shipment, event, transition, posting, reserved };
}

function mechanism(reservationQuantity = '2') {
  const f = fixture(reservationQuantity);
  const rows = {
    head: [{ world_version: '1', event_sequence: '1' }] as Row[],
    opening: [
      {
        world_id: WORLD,
        seed_id: f.seed.seedId,
        opening_world_version: '0',
        replay_binding: canonicalSerialize(f.seed.replayBinding),
        canonical_payload: intent(f.seed),
        seed_fingerprint: f.seed.fingerprint,
      },
    ] as Row[],
    events: [eventRow(f.transfer, f.event)],
    inventory: [
      {
        causation_command_id: f.transfer.commandId,
        canonical_payload: intent(f.posting),
        fingerprint: f.posting.fingerprint,
      },
    ] as Row[],
    transfer: [commandRow(f.transfer)],
    shipment: [commandRow(f.shipment)],
    proof: [
      {
        canonical_payload: intent(f.posting),
        fingerprint: f.posting.fingerprint,
        command_fingerprint: f.transfer.fingerprint,
        outcome: 'COMMITTED',
        reason_code: null,
        transition_id: f.transfer.commandId,
        world_version_before: '0',
        world_version_after: '1',
        sim_time: '100',
        event_ids: [f.event.eventId],
        committed_event_ids: [f.event.eventId],
      },
    ] as Row[],
    lease: [
      {
        world_id: WORLD,
        holder_id: 'WORKER_SHIPMENT',
        fencing_token: '7',
        acquired_at_real: '2026-10-07T00:00:00.000Z',
        renewed_at_real: '2026-10-07T00:00:00.500Z',
        lease_expires_at_real: '2026-10-07T00:00:03.000Z',
      },
    ] as Row[],
  };
  const calls: { statement: string; parameters: readonly unknown[] }[] = [];
  let transactions = 0;
  let boundaryError: Error | null = null;
  const query: SqlExecutor['query'] = async <T extends object>(
    statement: string,
    parameters: readonly unknown[] = [],
  ) => {
    calls.push({ statement, parameters });
    if (!/^select\s/u.test(statement.trim()))
      throw Error('Mutation forbidden in source test');
    let result: readonly Row[];
    if (statement.includes('join world_v2.command_receipt'))
      result = rows.proof;
    else if (statement.includes('for update'))
      result = [{ command_id: parameters[1] }];
    else if (statement.includes('from world_v2.command_submission')) {
      result =
        parameters[1] === f.shipment.commandId
          ? rows.shipment
          : parameters[1] === f.transfer.commandId
            ? rows.transfer
            : [];
    } else if (statement.includes('from world_v2.world_writer_lease'))
      result = rows.lease;
    else if (statement.includes('from world_v2.world_head')) result = rows.head;
    else if (statement.includes('from world_v2.opening_seed'))
      result = rows.opening;
    else if (statement.includes('from world_v2.authoritative_event event'))
      result = rows.events;
    else if (statement.includes('from world_v2.inventory_posting'))
      result = rows.inventory;
    else if (statement.includes('from world_v2.financial_posting_batch'))
      result = [];
    else throw Error(`Unexpected SQL ${statement}`);
    return { rowCount: result.length, rows: result as readonly T[] };
  };
  const database: SqlDatabase = {
    query,
    async transaction(operation) {
      transactions += 1;
      const result = await operation({ query });
      if (boundaryError) throw boundaryError;
      return result;
    },
  };
  const source = new SqlNarrowTreasuryGcuShipmentPreparationSource({
    database,
    sha256Hex,
    workerId: 'WORKER_SHIPMENT',
  });
  const factory = createSqlNarrowTreasuryGcuShipmentCandidateFactory({
    database,
    sha256Hex,
    workerId: 'WORKER_SHIPMENT',
  });
  return {
    f,
    rows,
    calls,
    database,
    source,
    factory,
    transactionCount: () => transactions,
    setError: (error: Error) => {
      boundaryError = error;
    },
  };
}

describe('F SQL Shipment preparation — mock-SQL mechanism only', () => {
  it('reads durable Reserve lineage and produces a deterministic existing atomic candidate without writes', async () => {
    const m = mechanism();
    const request = {
      command: m.f.shipment,
      commitAuthorization: null,
      observedAtReal: NOW,
    };
    const a = await m.factory.prepare(request);
    const b = await m.factory.prepare(request);
    expect(canonicalSerialize(a)).toBe(canonicalSerialize(b));
    expect(m.transactionCount()).toBe(2);
    expect(m.calls[0]?.statement).toContain('for update');
    const read = m.calls.find((c) =>
      c.statement.includes('join world_v2.command_receipt'),
    )!;
    expect(read.parameters).toEqual([WORLD, m.f.transfer.commandId]);
    const candidate = prepareAtomicTransitionCandidate({
      command: m.f.shipment,
      draft: a,
      commitAuthorization: null,
      sha256Hex,
    });
    expect(candidate.commitAssertion).toMatchObject({
      worldId: WORLD,
      holderId: 'WORKER_SHIPMENT',
      fencingToken: '7',
      expectedWorldVersion: '1',
    });
    expect(candidate.transition).toMatchObject({
      worldVersionBefore: '1',
      worldVersionAfter: '2',
    });
    expect(candidate.transition.events[0]).toMatchObject({
      eventId: 'SHIPMENT_EVENT_COMMAND_SHIPMENT_SOURCE',
      sequence: '2',
    });
    const posting = candidate.inventoryPostings[0]!;
    expect(posting.postingId).toBe(
      'SHIPMENT_INVENTORY_COMMAND_SHIPMENT_SOURCE',
    );
    expect(posting.operation).toBe('SHIP');
    expect(
      posting.entries.map((e) => ({
        bucket: e.account.bucket,
        quantity: e.delta.toCanonicalValue(),
      })),
    ).toEqual([
      { bucket: 'IN_TRANSIT', quantity: { amount: '2', unit: 'tonne' } },
      { bucket: 'RESERVED', quantity: { amount: '-2', unit: 'tonne' } },
    ]);
    expect(posting.entries[1]?.account).toEqual(m.f.reserved);
    expect(candidate.financialPostingBatches).toEqual([]);
    expect(candidate.currentMaterializations).toEqual([]);
    expect(candidate.receipt).toMatchObject({
      outcome: 'COMMITTED',
      worldVersionAfter: '2',
    });
    expect(candidate.outboxMessages).toHaveLength(1);
    expect(
      JSON.parse(candidate.outboxMessages[0]!.canonicalPayload),
    ).toMatchObject({
      shipmentId: 'SHIPMENT_SOURCE',
      transferCommandId: m.f.transfer.commandId,
    });
    expect(m.calls.every((c) => c.statement.trim().startsWith('select'))).toBe(
      true,
    );
  });

  it.each([
    'head',
    'opening',
    'transfer',
    'shipment',
    'lease',
    'proof',
  ] as const)('rejects missing durable %s without fallback', async (key) => {
    const m = mechanism();
    m.rows[key] = [];
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toThrow();
    expect(m.transactionCount()).toBe(1);
  });

  it.each(['transfer', 'shipment', 'lease', 'proof'] as const)(
    'rejects ambiguous %s',
    async (key) => {
      const m = mechanism();
      m.rows[key].push({ ...m.rows[key][0] });
      await expect(
        m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
      ).rejects.toThrow();
    },
  );

  it.each([
    ['world_id', 'WORLD_OTHER'],
    ['holder_id', 'WORKER_OTHER'],
    ['lease_expires_at_real', NOW],
    ['renewed_at_real', '2026-10-07T00:00:02.000Z'],
  ])(
    'rejects lease %s=%s even when a mock row bypasses SQL filtering',
    async (key, value) => {
      const m = mechanism();
      m.rows.lease[0]![key!] = value;
      await expect(
        m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
      ).rejects.toThrow();
    },
  );

  it.each([
    'COMMIT_OUTCOME_UNKNOWN',
    'ROLLED_BACK',
    'ROLLBACK_UNCONFIRMED',
  ] as const)('propagates %s unchanged and does not retry', async (outcome) => {
    const m = mechanism();
    const error = new PostgresTransactionError({
      outcome,
      cause: new Error('MOCK_TRANSACTION_BOUNDARY'),
    });
    m.setError(error);
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toBe(error);
    expect(m.transactionCount()).toBe(1);
  });

  it.each([
    ['outcome', 'REJECTED'],
    ['command_fingerprint', `sha256:${'f'.repeat(64)}`],
    ['transition_id', 'COMMAND_OTHER'],
    ['world_version_after', '2'],
    ['sim_time', '101'],
    ['event_ids', []],
    ['committed_event_ids', ['EVENT_OTHER']],
    ['fingerprint', `sha256:${'f'.repeat(64)}`],
  ])('rejects mismatched committed Reserve %s', async (key, value) => {
    const m = mechanism();
    m.rows.proof[0]![key as string] = value;
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toThrow();
  });

  it('rejects corrupted durable replay even if the selected Reserve proof is intact', async () => {
    const m = mechanism();
    m.rows.events[0]!.event_fingerprint = `sha256:${'f'.repeat(64)}`;
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toThrow();
  });

  it.each(['1', '3'])(
    'rejects replay-valid Reserve quantity %s that differs from the original transfer',
    async (quantity) => {
      const m = mechanism(quantity);
      await expect(
        m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
      ).rejects.toThrow('exact quantity differs from original transfer');
    },
  );

  it('rejects caller command mutation rather than accepting caller transfer truth', async () => {
    const m = mechanism();
    await expect(
      m.source.load({
        shipmentCommand: {
          ...m.f.shipment,
          fingerprint: `sha256:${'f'.repeat(64)}`,
        },
        observedAtReal: NOW,
      }),
    ).rejects.toThrow('differs from durable');
  });

  it('rejects a stale expected version', async () => {
    const m = mechanism();
    m.rows.head[0]!.world_version = '2';
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toThrow();
  });

  it('rejects altered same-asset reservation proof instead of stealing its inventory', async () => {
    const m = mechanism();
    const raw = JSON.parse(m.rows.proof[0]!.canonical_payload as string) as {
      entries: { account: { reservationId: string | null } }[];
    };
    raw.entries[1]!.account.reservationId = 'RESERVATION_OTHER_TRANSFER';
    m.rows.proof[0]!.canonical_payload = canonicalSerialize(raw);
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toThrow();
  });

  it('rejects an already-shipped original Reserve using real Core replay of mock lineage', async () => {
    const m = mechanism();
    const preparation = await m.source.load({
      shipmentCommand: m.f.shipment,
      observedAtReal: NOW,
    });
    const event = eventFor(m.f.shipment, '2');
    const transition = createAuthoritativeTransition({
      command: m.f.shipment,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [event],
    });
    const shipped = shipNarrowTreasuryGcuTransfer({
      shipmentCommand: m.f.shipment,
      transferCommand: m.f.transfer,
      inventoryState: preparation.inventoryState,
      source: preparation.source,
      postingId: inventoryPostingId('POSTING_EXISTING_SHIPMENT'),
      transition,
      causationEventIds: transition.eventIds,
      sha256Hex,
    });
    m.rows.head[0] = { world_version: '2', event_sequence: '2' };
    m.rows.events.push(eventRow(m.f.shipment, event));
    m.rows.inventory.push({
      causation_command_id: m.f.shipment.commandId,
      canonical_payload: intent(shipped.posting),
      fingerprint: shipped.posting.fingerprint,
    });
    const next = changedCommand(m.f.shipment, {
      simTime: '300',
      commandId: 'COMMAND_NEXT_SHIPMENT',
      expectedWorldVersion: '2',
    });
    // Explicitly route only this extra durable mock Command; no source override.
    const originalQuery = m.database.query;
    const database: SqlDatabase = {
      query: originalQuery,
      transaction: (operation) =>
        m.database.transaction((transaction) =>
          operation({
            query: async <T extends object>(
              sql: string,
              parameters?: readonly unknown[],
            ) => {
              if (
                sql.includes('from world_v2.command_submission') &&
                !sql.includes('for update') &&
                parameters?.[1] === next.commandId
              )
                return {
                  rowCount: 1,
                  rows: [commandRow(next)] as unknown as readonly T[],
                };
              return transaction.query<T>(sql, parameters);
            },
          }),
        ),
    };
    const source = new SqlNarrowTreasuryGcuShipmentPreparationSource({
      database,
      sha256Hex,
      workerId: 'WORKER_SHIPMENT',
    });
    await expect(
      source.load({ shipmentCommand: next, observedAtReal: NOW }),
    ).rejects.toThrow(
      'Replayed original reserved position must resolve to exactly one durable record',
    );
  });

  it.each([
    { expectedWorldVersion: '0' },
    { simTime: '99' },
    { officeId: 'TRADE' },
    { commandType: 'CORE_GOODS_DELIVERY_V1' },
    {
      payload: {
        ...JSON.parse(fixture().shipment.canonicalPayload),
        transferFingerprint: `sha256:${'f'.repeat(64)}`,
      },
    },
    {
      payload: {
        ...JSON.parse(fixture().shipment.canonicalPayload),
        transferCommandId: 'COMMAND_MISSING_RESERVE',
      },
    },
  ])(
    'rejects canonical but invalid Ship boundary/reference %j',
    async (overrides) => {
      const m = mechanism();
      const command = changedCommand(m.f.shipment, overrides);
      m.rows.shipment = [commandRow(command)];
      await expect(
        m.source.load({ shipmentCommand: command, observedAtReal: NOW }),
      ).rejects.toThrow();
    },
  );

  it('rejects caller user authorization before source reads', async () => {
    const m = mechanism();
    await expect(
      m.factory.prepare({
        command: m.f.shipment,
        observedAtReal: NOW,
        commitAuthorization: {} as CommitAuthorizationProof,
      }),
    ).rejects.toThrow('discretionary authorization');
    expect(m.transactionCount()).toBe(0);
  });

  it('rejects TEST_FIXTURE opening provenance using the existing store', async () => {
    const m = mechanism();
    const seed = createOpeningSeed(
      {
        ...m.f.seed,
        sources: m.f.seed.sources.map((source) =>
          createOpeningSource(
            {
              ...source,
              sourceKind: 'TEST_FIXTURE',
              payload: JSON.parse(source.canonicalPayload),
            },
            sha256Hex,
          ),
        ),
      },
      sha256Hex,
    );
    m.rows.opening[0]!.canonical_payload = intent(seed);
    m.rows.opening[0]!.seed_fingerprint = seed.fingerprint;
    await expect(
      m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: NOW }),
    ).rejects.toThrow('TEST_FIXTURE');
  });

  it.each(['2026-02-30T00:00:00.000Z', '2026-10-07T00:00:01Z'])(
    'rejects noncanonical real time before any transaction: %s',
    async (time) => {
      const m = mechanism();
      await expect(
        m.source.load({ shipmentCommand: m.f.shipment, observedAtReal: time }),
      ).rejects.toThrow();
      expect(m.transactionCount()).toBe(0);
    },
  );

  it('does not wire startup, publish a barrel, import a fixture or create obligations', () => {
    const source = readFileSync(
      new URL(
        '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-shipment-preparation-source.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).not.toMatch(
      /tests\/|testkit|setInterval|setTimeout|Date\.now|insert into|update world_v2|delete from/iu,
    );
    const index = readFileSync(
      new URL('../../apps/world-worker/src/index.ts', import.meta.url),
      'utf8',
    );
    expect(index).not.toContain(
      'sql-narrow-treasury-gcu-shipment-preparation-source',
    );
  });
});
