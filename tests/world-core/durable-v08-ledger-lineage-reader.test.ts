import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Quantity,
  canonicalSerialize,
  commandId,
  commodityId,
  createAuthoritativeTransition,
  createFinancialAccount,
  createFinancialPostingBatch,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  createReservationPosting,
  eventId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  financialPostingBatchId,
  financialPostingLegId,
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
  worldId,
} from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const WORLD = worldId('WORLD_DURABLE_LINEAGE');
const COUNTRY = 'COUNTRY_DURABLE';
const OWNER = legalEntityId('ENTITY_DURABLE_OWNER');

function canonicalIntent(value: { readonly fingerprint: unknown }): string {
  const { fingerprint: _fingerprint, ...intent } = value;
  void _fingerprint;
  return canonicalSerialize(intent);
}

function fixture(input: { readonly expectedWorldVersion?: string | null } = {}) {
  const available = createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: commodityId('GRAIN'),
    batchId: inventoryBatchId('BATCH_DURABLE'),
    unit: 'tonne',
    physicalLocationId: inventoryLocationId('PORT_DURABLE'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: OWNER,
    riskBearerId: OWNER,
    economicRecognitionId: null,
  });
  const reserved = createInventoryAccount({
    ...available,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('RESERVATION_DURABLE'),
  });
  const cash = createFinancialAccount({
    worldId: WORLD,
    accountId: financialAccountId('ACCOUNT_DURABLE_CASH'),
    ownerId: OWNER,
    countryId: COUNTRY,
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const equity = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('ACCOUNT_DURABLE_EQUITY'),
    accountClass: 'EQUITY',
  });
  const expense = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('ACCOUNT_DURABLE_EXPENSE'),
    accountClass: 'EXPENSE',
  });
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_DURABLE'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://durable-lineage/v1',
      sourceVersion: '2026-09-14',
      payload: { dataset: 'durable-lineage-v1' },
    },
    sha256Hex,
  );
  const opening = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_DURABLE'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('OPENING_DURABLE_GRAIN'),
          sourceId: source.sourceId,
          account: available,
          quantity: Quantity.from('10', 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('OPENING_DURABLE_FINANCE'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: financialOpeningLegId('OPENING_DURABLE_CASH'),
              account: cash,
              direction: 'DEBIT',
              amount: Money.from('100', 'GCU'),
              counterpartLegId: financialOpeningLegId('OPENING_DURABLE_EQUITY'),
            },
            {
              legId: financialOpeningLegId('OPENING_DURABLE_EQUITY'),
              account: equity,
              direction: 'CREDIT',
              amount: Money.from('100', 'GCU'),
              counterpartLegId: financialOpeningLegId('OPENING_DURABLE_CASH'),
            },
          ],
        },
      ],
    },
    sha256Hex,
  );
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_DURABLE',
      authSubject: '00000000-0000-4000-8000-000000000010',
      commandId: commandId('COMMAND_DURABLE'),
      commandType: 'DURABLE_LEDGER_TEST',
      correlationId: 'CORRELATION_DURABLE',
      countryId: COUNTRY,
      expectedWorldVersion:
        input.expectedWorldVersion === undefined
          ? '0'
          : input.expectedWorldVersion,
      idempotencyKey: 'IDEMPOTENCY_DURABLE',
      officeId: null,
      payload: { purpose: 'durable-lineage-test' },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: '1000',
      submittedAtReal: '2026-09-14T00:00:00.000Z',
      worldId: WORLD,
    },
    sha256Hex,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: eventId('EVENT_DURABLE'),
      eventType: 'DURABLE_LEDGER_EVENT',
      worldId: WORLD,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: '2026-09-14T00:00:01.000Z',
      correctsEventId: null,
      payload: { purpose: 'durable-lineage-event' },
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const inventory = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId('POSTING_DURABLE_INVENTORY'),
      worldId: WORLD,
      causationCommandId: command.commandId,
      causationEventIds: [event.eventId],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      quantity: Quantity.from('4', 'tonne'),
      source: available,
      destination: reserved,
      command,
      transition,
    },
    sha256Hex,
  );
  const financial = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('POSTING_DURABLE_FINANCIAL'),
      worldId: WORLD,
      causationCommandId: command.commandId,
      causationEventIds: [event.eventId],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: financialPostingLegId('POSTING_DURABLE_DEBIT'),
          account: expense,
          direction: 'DEBIT',
          amount: Money.from('5', 'GCU'),
          counterpartyAccountId: cash.accountId,
        },
        {
          legId: financialPostingLegId('POSTING_DURABLE_CREDIT'),
          account: cash,
          direction: 'CREDIT',
          amount: Money.from('5', 'GCU'),
          counterpartyAccountId: expense.accountId,
        },
      ],
      command,
      transition,
    },
    sha256Hex,
  );
  const { fingerprint: _fingerprint, ...openingIntent } = opening;
  void _fingerprint;
  return Object.freeze({
    opening,
    command,
    event,
    inventory,
    financial,
    openingIntent,
  });
}

function database(input: {
  readonly eventFingerprint?: string;
  readonly values: ReturnType<typeof fixture>;
}): SqlDatabase {
  const { values } = input;
  const query: SqlExecutor['query'] = async <Row extends object>(statement) => {
    let rows: readonly object[];
    if (statement.includes('from world_v2.world_head')) {
      rows = [{ world_version: '1', event_sequence: '1' }];
    } else if (statement.includes('from world_v2.opening_seed')) {
      rows = [
        {
          world_id: values.opening.worldId,
          seed_id: values.opening.seedId,
          opening_world_version: '0',
          replay_binding: canonicalSerialize(values.opening.replayBinding),
          canonical_payload: canonicalSerialize(values.openingIntent),
          seed_fingerprint: values.opening.fingerprint,
        },
      ];
    } else if (statement.includes('from world_v2.authoritative_event event')) {
      rows = [
        {
          command_actor_id: values.command.actorId,
          command_auth_subject: values.command.authSubject,
          command_canonical_payload: values.command.canonicalPayload,
          command_country_id: values.command.countryId,
          command_expected_world_version: values.command.expectedWorldVersion,
          command_fingerprint: values.command.fingerprint,
          command_id: values.command.commandId,
          command_idempotency_key: values.command.idempotencyKey,
          command_office_id: values.command.officeId,
          command_payload_sha256: values.command.payloadHash,
          command_schema_version: values.command.schemaVersion,
          command_sim_time: values.command.simTime.toCanonicalValue(),
          command_submitted_at_real: values.command.submittedAtReal,
          command_type: values.command.commandType,
          command_world_id: values.command.worldId,
          correlation_id: values.event.correlationId,
          event_canonical_payload: values.event.canonicalPayload,
          event_causation_command_id: values.event.causationCommandId,
          event_corrects_event_id: values.event.correctsEventId,
          event_fingerprint: input.eventFingerprint ?? values.event.fingerprint,
          event_id: values.event.eventId,
          event_payload_sha256: values.event.payloadHash,
          event_recorded_at_real: values.event.recordedAtReal,
          event_schema_version: values.event.schemaVersion,
          event_sequence: values.event.sequence,
          event_sim_time: values.event.simTime.toCanonicalValue(),
          event_type: values.event.eventType,
          event_world_id: values.event.worldId,
          event_world_version: values.event.worldVersion,
        },
      ];
    } else if (statement.includes('from world_v2.inventory_posting')) {
      rows = [
        {
          causation_command_id: values.inventory.causationCommandId,
          canonical_payload: canonicalIntent(values.inventory),
          fingerprint: values.inventory.fingerprint,
        },
      ];
    } else if (statement.includes('from world_v2.financial_posting_batch')) {
      rows = [
        {
          causation_command_id: values.financial.causationCommandId,
          canonical_payload: canonicalIntent(values.financial),
          fingerprint: values.financial.fingerprint,
        },
      ];
    } else {
      throw new Error(`Unexpected SQL in durable reader fixture: ${statement}`);
    }
    return Object.freeze({
      rowCount: rows.length,
      rows: rows as readonly Row[],
    });
  };
  return Object.freeze({
    query,
    transaction: async <Result>(
      operation: (executor: SqlExecutor) => Promise<Result>,
    ) => operation(Object.freeze({ query })),
  });
}

describe('V10.6 durable V08 ledger lineage reader', () => {
  it('replays the persisted opening seed plus Command/Event/Posting facts', async () => {
    const values = fixture();
    const reader = new DurableV08LedgerLineageReader({
      database: database({ values }),
      sha256Hex,
    });
    const rebuilt = await reader.rebuild(WORLD);
    expect(rebuilt.worldVersion).toBe('1');
    expect(
      rebuilt.inventory.balances
        .find((balance) => balance.account.bucket === 'AVAILABLE')
        ?.quantity.toCanonicalValue().amount,
    ).toBe('6');
    expect(
      rebuilt.inventory.balances
        .find((balance) => balance.account.bucket === 'RESERVED')
        ?.quantity.toCanonicalValue().amount,
    ).toBe('4');
    expect(
      rebuilt.financial.positions
        .find(
          (position) => position.account.accountId === 'ACCOUNT_DURABLE_CASH',
        )
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('95');
  });

  it('replays an unversioned durable Command from its Event version boundary', async () => {
    const values = fixture({ expectedWorldVersion: null });
    const reader = new DurableV08LedgerLineageReader({
      database: database({ values }),
      sha256Hex,
    });

    await expect(reader.rebuild(WORLD)).resolves.toMatchObject({
      worldVersion: '1',
    });
  });

  it('fails closed when durable Event evidence does not recompute', async () => {
    const values = fixture();
    const reader = new DurableV08LedgerLineageReader({
      database: database({
        values,
        eventFingerprint:
          'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      }),
      sha256Hex,
    });
    await expect(reader.rebuild(WORLD)).rejects.toThrow(
      'Durable Event hashes differ',
    );
  });
});
