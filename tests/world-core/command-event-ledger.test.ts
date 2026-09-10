import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPaths = [
  'database/migrations/artifacts/0001_world_v2_namespace.sql',
  'database/migrations/artifacts/0002_world_v2_command_event_ledger.sql',
];

let database: PGlite;

async function insertCommand(overrides: Record<string, unknown> = {}) {
  const row = {
    actorId: 'ACTOR_1',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandFingerprint: `sha256:${'b'.repeat(64)}`,
    commandId: 'COMMAND_1',
    commandType: 'TRANSFER_REQUESTED',
    correlationId: 'CORRELATION_1',
    countryId: 'COUNTRY_1',
    idempotencyKey: 'TRANSFER_1',
    payload: '{"amount":"10","asset":"GCU"}',
    payloadHash: `sha256:${'a'.repeat(64)}`,
    schemaVersion: 'command-v1',
    ...overrides,
  };
  await database.query(
    `insert into world_v2.command_submission (
      world_id, command_id, idempotency_key, command_type, schema_version,
      canonical_payload, payload_sha256, command_fingerprint, auth_subject,
      actor_id, country_id, office_id, expected_world_version, sim_time,
      correlation_id, submitted_at_real
    ) values (
      'WORLD_1', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      'TRADE', 0, 10000, $11, '2026-09-10T00:00:00.000Z'
    )`,
    [
      row.commandId,
      row.idempotencyKey,
      row.commandType,
      row.schemaVersion,
      row.payload,
      row.payloadHash,
      row.commandFingerprint,
      row.authSubject,
      row.actorId,
      row.countryId,
      row.correlationId,
    ],
  );
}

async function insertEvent(overrides: Record<string, unknown> = {}) {
  const row = {
    correctsEventId: null,
    eventId: 'EVENT_1',
    eventSequence: 1,
    eventType: 'TRANSFER_RECORDED',
    worldVersion: 1,
    ...overrides,
  };
  await database.query(
    `insert into world_v2.authoritative_event (
      world_id, event_id, event_sequence, world_version,
      causation_command_id, correlation_id, event_type, schema_version,
      canonical_payload, payload_sha256, event_fingerprint, sim_time,
      recorded_at_real, corrects_event_id
    ) values (
      'WORLD_1', $1, $2, $3, 'COMMAND_1', 'CORRELATION_1', $4,
      'event-v1', '{"amount":"10","asset":"GCU"}', $5, $6, 10000,
      '2026-09-10T00:00:01.000Z', $7
    )`,
    [
      row.eventId,
      row.eventSequence,
      row.worldVersion,
      row.eventType,
      `sha256:${'c'.repeat(64)}`,
      `sha256:${'d'.repeat(64)}`,
      row.correctsEventId,
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

describe('V07.1 branch-local append-only Event Ledger candidate', () => {
  it('enforces durable command and idempotency identities', async () => {
    await insertCommand();
    await expect(
      insertCommand({ commandFingerprint: `sha256:${'e'.repeat(64)}` }),
    ).rejects.toThrow();
    await expect(
      insertCommand({ commandId: 'COMMAND_2', payload: '{"amount":"11"}' }),
    ).rejects.toThrow();
    const rows = await database.query(
      'select command_id, idempotency_key from world_v2.command_submission',
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('prohibits historical Event UPDATE and DELETE', async () => {
    await insertCommand();
    await insertEvent();
    await expect(
      database.exec(
        "update world_v2.authoritative_event set event_type = 'REWRITTEN' where event_id = 'EVENT_1'",
      ),
    ).rejects.toThrow('append-only');
    await expect(
      database.exec(
        "delete from world_v2.authoritative_event where event_id = 'EVENT_1'",
      ),
    ).rejects.toThrow('append-only');
  });

  it('records correction as a new immutable Event and rejects duplicate order', async () => {
    await insertCommand();
    await insertEvent();
    await insertEvent({
      correctsEventId: 'EVENT_1',
      eventId: 'EVENT_2',
      eventSequence: 2,
      eventType: 'TRANSFER_CORRECTED',
      worldVersion: 2,
    });
    await expect(
      insertEvent({ eventId: 'EVENT_3', eventSequence: 2 }),
    ).rejects.toThrow();
    const rows = await database.query(
      'select event_id, corrects_event_id from world_v2.authoritative_event order by event_sequence',
    );
    expect(rows.rows).toEqual([
      { corrects_event_id: null, event_id: 'EVENT_1' },
      { corrects_event_id: 'EVENT_1', event_id: 'EVENT_2' },
    ]);
  });

  it('keeps consumer delivery state outside authoritative Event history', async () => {
    const relation = await database.query(
      `select column_name from information_schema.columns
       where table_schema = 'world_v2' and table_name = 'authoritative_event'
       order by column_name`,
    );
    const names = relation.rows.map((row) => row.column_name);
    expect(names).not.toContain('processed_at');
    expect(names).not.toContain('consumer_receipt');
  });
});
