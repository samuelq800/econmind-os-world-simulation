import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPaths = [
  'database/migrations/artifacts/0001_world_v2_namespace.sql',
  'database/migrations/artifacts/0002_world_v2_command_event_ledger.sql',
  'database/migrations/artifacts/0003_world_v2_command_receipts_outbox.sql',
  'database/migrations/artifacts/0004_world_v2_receipt_event_set_integrity.sql',
];

let database: PGlite;

async function insertCommand(
  input: {
    commandId?: string;
    idempotencyKey?: string;
    correlationId?: string;
    fingerprintCharacter?: string;
    worldId?: string;
  } = {},
) {
  await database.query(
    `insert into world_v2.command_submission (
      world_id, command_id, idempotency_key, command_type, schema_version,
      canonical_payload, payload_sha256, command_fingerprint, auth_subject,
      actor_id, country_id, office_id, expected_world_version, sim_time,
      correlation_id, submitted_at_real
    ) values (
      $6, $1, $2, 'TRANSFER_REQUESTED', 'command-v1',
      '{"amount":"10","asset":"GCU"}', $3, $4,
      '11111111-1111-4111-8111-111111111111', 'ACTOR_1', 'COUNTRY_1',
      'TRADE', 0, 10000, $5, '2026-09-10T00:00:00.000Z'
    )`,
    [
      input.commandId ?? 'COMMAND_1',
      input.idempotencyKey ?? 'TRANSFER_1',
      `sha256:${'a'.repeat(64)}`,
      `sha256:${(input.fingerprintCharacter ?? 'b').repeat(64)}`,
      input.correlationId ?? 'CORRELATION_1',
      input.worldId ?? 'WORLD_1',
    ],
  );
}

async function insertEvent(
  input: {
    commandId?: string;
    correlationId?: string;
    eventId?: string;
    sequence?: number;
    worldVersion?: number;
    worldId?: string;
  } = {},
) {
  await database.query(
    `insert into world_v2.authoritative_event (
      world_id, event_id, event_sequence, world_version,
      causation_command_id, correlation_id, event_type, schema_version,
      canonical_payload, payload_sha256, event_fingerprint, sim_time,
      recorded_at_real, corrects_event_id
    ) values (
      $8, $3, $4, $5, $6, $7,
      'TRANSFER_RECORDED', 'event-v1', '{"amount":"10","asset":"GCU"}',
      $1, $2, 10001, '2026-09-10T00:00:01.000Z', null
    )`,
    [
      `sha256:${'c'.repeat(64)}`,
      `sha256:${'d'.repeat(64)}`,
      input.eventId ?? 'EVENT_1',
      input.sequence ?? 1,
      input.worldVersion ?? 1,
      input.commandId ?? 'COMMAND_1',
      input.correlationId ?? 'CORRELATION_1',
      input.worldId ?? 'WORLD_1',
    ],
  );
}

async function insertCommittedReceipt(
  eventIds: readonly string[],
  input: {
    commandId?: string;
    fingerprintCharacter?: string;
    idempotencyKey?: string;
    worldId?: string;
    worldVersionBefore?: number;
    worldVersionAfter?: number;
  } = {},
) {
  await database.query(
    `insert into world_v2.command_receipt (
      world_id, command_id, idempotency_key, schema_version,
      command_fingerprint, outcome, reason_code, transition_id,
      world_version_before, world_version_after, sim_time, event_ids,
      recorded_at_real
    ) values (
      $1, $2, $3, 'command-receipt-v2', $4,
      'COMMITTED', null, $2, $5, $6, 10001,
      $7::jsonb, '2026-09-10T00:00:01.000Z'
    )`,
    [
      input.worldId ?? 'WORLD_1',
      input.commandId ?? 'COMMAND_1',
      input.idempotencyKey ?? 'TRANSFER_1',
      `sha256:${(input.fingerprintCharacter ?? 'b').repeat(64)}`,
      input.worldVersionBefore ?? 0,
      input.worldVersionAfter ?? 1,
      JSON.stringify(eventIds),
    ],
  );
}

beforeEach(async () => {
  database = new PGlite();
  for (const migrationPath of migrationPaths) {
    await database.exec(await readFile(path.join(root, migrationPath), 'utf8'));
  }
  await database.exec(
    "insert into world_v2.world_head (world_id) values ('WORLD_1')",
  );
});

afterEach(async () => database.close());

describe('V07.2 branch-local receipt/queue/outbox candidate', () => {
  it('stores one logical queue item and guards recovery transitions', async () => {
    await insertCommand();
    await database.query(
      `insert into world_v2.command_queue
        (world_id, command_id, authority_kind, available_at_sim_time)
       values ('WORLD_1', 'COMMAND_1', 'DISCRETIONARY_USER', 10000)`,
    );
    await expect(
      database.exec(
        `insert into world_v2.command_queue
          (world_id, command_id, authority_kind, available_at_sim_time)
         values ('WORLD_1', 'COMMAND_1', 'DISCRETIONARY_USER', 10000)`,
      ),
    ).rejects.toThrow();
    await expect(
      database.exec(
        `update world_v2.command_queue
         set queue_state = 'FINALIZED', finalized_at_real = '2026-09-10T00:00:01.000Z'
         where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
      ),
    ).rejects.toThrow('invalid command queue transition');

    await database.query(
      `update world_v2.command_queue
       set queue_state = 'CLAIMED', attempt_count = 1, claimed_by = 'WORKER_1',
           claimed_at_real = '2026-09-10T00:00:01.000Z'
       where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
    );
    await database.exec(
      `update world_v2.command_queue
       set queue_state = 'PENDING', claimed_by = null, claimed_at_real = null
       where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
    );
    await database.exec(
      `update world_v2.command_queue
       set queue_state = 'CLAIMED', attempt_count = 2, claimed_by = 'WORKER_2',
           claimed_at_real = '2026-09-10T00:00:02.000Z'
       where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
    );
    const rows = await database.query(
      `select queue_state, attempt_count, claimed_by
       from world_v2.command_queue where world_id = 'WORLD_1'`,
    );
    expect(rows.rows).toEqual([
      { attempt_count: 2, claimed_by: 'WORKER_2', queue_state: 'CLAIMED' },
    ]);
    await expect(
      database.query(
        `update world_v2.command_queue set authority_kind = 'VERSIONED_AUTOMATIC'
         where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
      ),
    ).rejects.toThrow('identity and authority are immutable');
  });

  it('stores an immutable committed receipt and exactly one Event/effect', async () => {
    await insertCommand();
    await insertEvent();
    await database.query(
      `insert into world_v2.command_receipt (
        world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real
      ) values (
        'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
        'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
        '["EVENT_1"]'::jsonb,
        '2026-09-10T00:00:01.000Z'
      )`,
      [`sha256:${'b'.repeat(64)}`],
    );
    await expect(
      insertCommand({
        correlationId: 'CORRELATION_RETRY',
      }),
    ).rejects.toThrow();
    await expect(
      database.exec(
        `update world_v2.command_receipt set outcome = 'REJECTED'
         where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
      ),
    ).rejects.toThrow('append-only');
    await expect(
      database.exec(
        `delete from world_v2.command_receipt
         where world_id = 'WORLD_1' and command_id = 'COMMAND_1'`,
      ),
    ).rejects.toThrow('append-only');
    const counts = await database.query(
      `select
        (select count(*)::int from world_v2.command_submission) as commands,
        (select count(*)::int from world_v2.authoritative_event) as events,
        (select count(*)::int from world_v2.command_receipt) as receipts`,
    );
    expect(counts.rows).toEqual([{ commands: 1, events: 1, receipts: 1 }]);
  });

  it('binds a committed receipt to the exact Command fingerprint and idempotency key', async () => {
    await insertCommand();
    await insertEvent();
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
          'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
          '["EVENT_1"]'::jsonb, '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'e'.repeat(64)}`],
      ),
    ).rejects.toThrow();
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'DIFFERENT_KEY', 'command-receipt-v2', $1,
          'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
          '["EVENT_1"]'::jsonb, '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'b'.repeat(64)}`],
      ),
    ).rejects.toThrow('receipt Command identity or fingerprint');
  });

  it('requires complete receipt Event evidence from the same transition', async () => {
    await insertCommand();
    await insertEvent();
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
          'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
          '["MISSING_EVENT"]'::jsonb, '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'b'.repeat(64)}`],
      ),
    ).rejects.toThrow('complete ordered authoritative transition Event set');

    await insertCommand({
      commandId: 'COMMAND_2',
      idempotencyKey: 'TRANSFER_2',
      correlationId: 'CORRELATION_2',
      fingerprintCharacter: 'e',
    });
    await insertEvent({
      commandId: 'COMMAND_2',
      correlationId: 'CORRELATION_2',
      eventId: 'EVENT_2',
      sequence: 2,
    });
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
          'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
          '["EVENT_2"]'::jsonb, '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'b'.repeat(64)}`],
      ),
    ).rejects.toThrow('complete ordered authoritative transition Event set');
  });

  it('accepts multiple ordered Events in one transition and one WorldVersion increment', async () => {
    await insertCommand();
    await insertEvent();
    await insertEvent({ eventId: 'EVENT_2', sequence: 2 });
    await insertCommittedReceipt(['EVENT_1', 'EVENT_2']);
    const evidence = await database.query(
      `select world_version_before, world_version_after,
              jsonb_array_length(event_ids)::int as event_count
       from world_v2.command_receipt`,
    );
    expect(evidence.rows).toEqual([
      { event_count: 2, world_version_after: 1, world_version_before: 0 },
    ]);
  });

  it.each([
    ['omits the second Event', ['EVENT_1']],
    ['omits the first Event', ['EVENT_2']],
    ['reverses authoritative Event order', ['EVENT_2', 'EVENT_1']],
    [
      'claims a nonexistent additional Event',
      ['EVENT_1', 'EVENT_2', 'EVENT_3'],
    ],
    ['duplicates an Event identity', ['EVENT_1', 'EVENT_1']],
  ])('rejects a receipt that %s', async (_label, claimedEventIds) => {
    await insertCommand();
    await insertEvent();
    await insertEvent({ eventId: 'EVENT_2', sequence: 2 });
    await expect(insertCommittedReceipt(claimedEventIds)).rejects.toThrow(
      'complete ordered authoritative transition Event set',
    );
  });

  it('derives receipt order from immutable authoritative event_sequence', async () => {
    await insertCommand();
    await insertEvent({ eventId: 'EVENT_1', sequence: 2 });
    await insertEvent({ eventId: 'EVENT_2', sequence: 1 });
    await expect(
      insertCommittedReceipt(['EVENT_1', 'EVENT_2']),
    ).rejects.toThrow('complete ordered authoritative transition Event set');
    await insertCommittedReceipt(['EVENT_2', 'EVENT_1']);
    const receipt = await database.query(
      'select event_ids from world_v2.command_receipt',
    );
    expect(receipt.rows).toEqual([{ event_ids: ['EVENT_2', 'EVENT_1'] }]);
  });

  it('rejects foreign-World Event evidence', async () => {
    await database.exec(
      "insert into world_v2.world_head (world_id) values ('WORLD_2')",
    );
    await insertCommand();
    await insertCommand({
      worldId: 'WORLD_2',
      commandId: 'COMMAND_2',
      idempotencyKey: 'TRANSFER_2',
      correlationId: 'CORRELATION_2',
      fingerprintCharacter: 'e',
    });
    await insertEvent({
      worldId: 'WORLD_2',
      commandId: 'COMMAND_2',
      correlationId: 'CORRELATION_2',
      eventId: 'EVENT_FOREIGN',
    });
    await expect(insertCommittedReceipt(['EVENT_FOREIGN'])).rejects.toThrow(
      'complete ordered authoritative transition Event set',
    );
  });

  it('prevents extending a transition after its immutable receipt is final', async () => {
    await insertCommand();
    await insertEvent();
    await insertCommittedReceipt(['EVENT_1']);
    await expect(
      insertEvent({ eventId: 'EVENT_2', sequence: 2 }),
    ).rejects.toThrow('cannot append an Event after');
  });

  it('permits empty Event evidence only for zero-effect final outcomes', async () => {
    await insertCommand();
    await database.query(
      `insert into world_v2.command_receipt (
        world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real
      ) values (
        'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
        'REJECTED', 'POLICY_REJECTED', null, null, null, 10001, '[]'::jsonb,
        '2026-09-10T00:00:01.000Z'
      )`,
      [`sha256:${'b'.repeat(64)}`],
    );
    await insertCommand({
      commandId: 'COMMAND_2',
      idempotencyKey: 'TRANSFER_2',
      fingerprintCharacter: 'e',
    });
    await expect(
      insertCommittedReceipt([], {
        commandId: 'COMMAND_2',
        idempotencyKey: 'TRANSFER_2',
        fingerprintCharacter: 'e',
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate receipt Event IDs and invalid WorldVersion boundaries', async () => {
    await insertCommand();
    await insertEvent();
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
          'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
          '["EVENT_1","EVENT_1"]'::jsonb,
          '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'b'.repeat(64)}`],
      ),
    ).rejects.toThrow('complete ordered authoritative transition Event set');
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
          'COMMITTED', null, 'COMMAND_1', 0, 2, 10001,
          '["EVENT_1"]'::jsonb, '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'b'.repeat(64)}`],
      ),
    ).rejects.toThrow();
  });

  it('enforces AUTHORIZATION_REVOKED as a zero-effect final outcome', async () => {
    await insertCommand();
    await insertCommand({
      commandId: 'COMMAND_2',
      idempotencyKey: 'TRANSFER_2',
    });
    await database.query(
      `insert into world_v2.command_receipt (
        world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real
      ) values (
        'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
        'AUTHORIZATION_REVOKED', 'AUTHORIZATION_REVOKED', null, null, null,
        10001, '[]'::jsonb,
        '2026-09-10T00:00:01.000Z'
      )`,
      [`sha256:${'b'.repeat(64)}`],
    );
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_2', 'TRANSFER_2', 'command-receipt-v2', $1,
          'AUTHORIZATION_REVOKED', 'AUTHORIZATION_REVOKED', 'COMMAND_2', 1, 2, 10001,
          '["EVENT_2"]'::jsonb, '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'e'.repeat(64)}`],
      ),
    ).rejects.toThrow();
    const counts = await database.query(
      `select
        (select count(*)::int from world_v2.authoritative_event) as events,
        (select count(*)::int from world_v2.command_receipt) as receipts`,
    );
    expect(counts.rows).toEqual([{ events: 0, receipts: 1 }]);
  });

  it('redelivers outbox and consumer state without mutating Event history', async () => {
    await insertCommand();
    await insertEvent();
    await database.query(
      `insert into world_v2.command_receipt (
        world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real
      ) values (
        'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v2', $1,
        'COMMITTED', null, 'COMMAND_1', 0, 1, 10001,
        '["EVENT_1"]'::jsonb,
        '2026-09-10T00:00:01.000Z'
      )`,
      [`sha256:${'b'.repeat(64)}`],
    );
    await database.query(
      `insert into world_v2.notification_outbox (
        world_id, outbox_message_id, command_id, event_id, schema_version,
        canonical_payload, payload_sha256, available_at_sim_time
      ) values (
        'WORLD_1', 'OUTBOX_1', 'COMMAND_1', 'EVENT_1', 'outbox-v1',
        '{"kind":"COMMAND_COMMITTED"}', $1, 10001
      )`,
      [`sha256:${'f'.repeat(64)}`],
    );
    await database.exec(
      `update world_v2.notification_outbox
       set attempt_count = 1, last_attempt_at_real = '2026-09-10T00:00:02.000Z'
       where world_id = 'WORLD_1' and outbox_message_id = 'OUTBOX_1'`,
    );
    await database.exec(
      `update world_v2.notification_outbox
       set delivery_state = 'DELIVERED', attempt_count = 2,
           last_attempt_at_real = '2026-09-10T00:00:03.000Z',
           delivered_at_real = '2026-09-10T00:00:03.000Z'
       where world_id = 'WORLD_1' and outbox_message_id = 'OUTBOX_1'`,
    );
    await expect(
      database.exec(
        `update world_v2.notification_outbox
         set canonical_payload = '{"kind":"REWRITTEN"}'
         where world_id = 'WORLD_1' and outbox_message_id = 'OUTBOX_1'`,
      ),
    ).rejects.toThrow('references and payload are immutable');
    await database.exec(
      `insert into world_v2.event_consumer_receipt (
        world_id, event_id, consumer_id, schema_version, delivery_state,
        last_attempt_at_real
      ) values (
        'WORLD_1', 'EVENT_1', 'PROJECTION_1', 'consumer-receipt-v1',
        'PROCESSING', '2026-09-10T00:00:02.000Z'
      )`,
    );
    await database.exec(
      `update world_v2.event_consumer_receipt
       set delivery_state = 'DELIVERED', attempt_count = 2,
           last_attempt_at_real = '2026-09-10T00:00:03.000Z'
       where world_id = 'WORLD_1' and event_id = 'EVENT_1'
         and consumer_id = 'PROJECTION_1'`,
    );
    await expect(
      database.exec(
        `update world_v2.authoritative_event set event_type = 'REWRITTEN'
         where world_id = 'WORLD_1' and event_id = 'EVENT_1'`,
      ),
    ).rejects.toThrow('append-only');
    const result = await database.query(
      `select
        (select delivery_state from world_v2.notification_outbox) as outbox,
        (select delivery_state from world_v2.event_consumer_receipt) as consumer,
        (select event_type from world_v2.authoritative_event) as event_type`,
    );
    expect(result.rows).toEqual([
      {
        consumer: 'DELIVERED',
        event_type: 'TRANSFER_RECORDED',
        outbox: 'DELIVERED',
      },
    ]);
  });

  it('fails closed on unknown receipt/outbox schema versions', async () => {
    await insertCommand();
    await expect(
      database.query(
        `insert into world_v2.command_receipt (
          world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real
        ) values (
          'WORLD_1', 'COMMAND_1', 'TRANSFER_1', 'command-receipt-v3', $1,
          'REJECTED', 'INVALID', null, null, null, 10001, '[]'::jsonb,
          '2026-09-10T00:00:01.000Z'
        )`,
        [`sha256:${'b'.repeat(64)}`],
      ),
    ).rejects.toThrow();
  });
});
