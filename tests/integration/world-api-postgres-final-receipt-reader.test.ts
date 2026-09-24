import fs from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import {
  readPostgresFinalCommandReceipt,
  WORLD_V2_FINAL_RECEIPT_QUERY,
} from '../../apps/world-api/src/integration/postgres-final-receipt-reader.js';
import type { ParameterizedPgReadExecutor } from '../../apps/world-api/src/integration/postgres-read-adapter.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
];
const authSubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174000',
);
const otherSubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174001',
);
const fingerprintA = `sha256:${'a'.repeat(64)}`;
const fingerprintB = `sha256:${'b'.repeat(64)}`;
const payloadHash = `sha256:${'c'.repeat(64)}`;
const eventFingerprint = `sha256:${'d'.repeat(64)}`;

const committedIdentity = Object.freeze({
  worldId: 'WORLD_1',
  commandId: 'COMMAND_1',
  idempotencyKey: 'IDEMPOTENCY_1',
});
const rejectedIdentity = Object.freeze({
  worldId: 'WORLD_1',
  commandId: 'COMMAND_2',
  idempotencyKey: 'IDEMPOTENCY_2',
});
const serverScope = Object.freeze({
  authSubject,
  countryId: 'COUNTRY_A',
  officeId: 'TRADE',
});

function validExecutorRow(): Record<string, unknown> {
  return {
    receipt_world_id: committedIdentity.worldId,
    receipt_command_id: committedIdentity.commandId,
    receipt_idempotency_key: committedIdentity.idempotencyKey,
    receipt_schema_version: 'command-receipt-v2',
    receipt_command_fingerprint: fingerprintA,
    outcome: 'COMMITTED',
    reason_code: null,
    transition_id: committedIdentity.commandId,
    world_version_before: '0',
    world_version_after: '1',
    sim_time: '1',
    event_ids: ['EVENT_1'],
    recorded_at_real: new Date('2026-09-24T01:02:03.000Z'),
    submission_world_id: committedIdentity.worldId,
    submission_command_id: committedIdentity.commandId,
    submission_idempotency_key: committedIdentity.idempotencyKey,
    submission_command_fingerprint: fingerprintA,
    submission_auth_subject: authSubject,
    submission_country_id: serverScope.countryId,
    submission_office_id: serverScope.officeId,
  };
}

describe('server-scoped PostgreSQL final receipt reader', () => {
  let database: PGlite;
  let executor: ParameterizedPgReadExecutor;

  beforeAll(async () => {
    database = new PGlite();
    for (const migration of migrations) {
      await database.exec(
        await fs.readFile(
          path.join(repositoryRoot, 'database/migrations/artifacts', migration),
          'utf8',
        ),
      );
    }
    await database.query(
      `insert into world_v2.world_head (world_id, world_version, event_sequence)
       values ($1, 1, 1)`,
      [committedIdentity.worldId],
    );
    await database.query(
      `insert into world_v2.command_submission
        (world_id, command_id, idempotency_key, command_type, schema_version,
         canonical_payload, payload_sha256, command_fingerprint, auth_subject,
         actor_id, country_id, office_id, expected_world_version, sim_time,
         correlation_id, submitted_at_real)
       values
        ($1, $2, $3, 'TEST_COMMAND', 'command-v1', '{}', $4, $5,
         $6::uuid, 'ACTOR_1', $7, $8, 0, 1, 'CORRELATION_1', $9),
        ($1, $10, $11, 'TEST_COMMAND', 'command-v1', '{}', $4, $12,
         $6::uuid, 'ACTOR_1', $7, $8, 1, 2, 'CORRELATION_2', $9)`,
      [
        committedIdentity.worldId,
        committedIdentity.commandId,
        committedIdentity.idempotencyKey,
        payloadHash,
        fingerprintA,
        authSubject,
        serverScope.countryId,
        serverScope.officeId,
        '2026-09-24T01:00:00.000Z',
        rejectedIdentity.commandId,
        rejectedIdentity.idempotencyKey,
        fingerprintB,
      ],
    );
    await database.query(
      `insert into world_v2.authoritative_event
        (world_id, event_id, event_sequence, world_version,
         causation_command_id, correlation_id, event_type, schema_version,
         canonical_payload, payload_sha256, event_fingerprint, sim_time,
         recorded_at_real)
       values ($1, 'EVENT_1', 1, 1, $2, 'CORRELATION_1', 'TEST_EVENT',
               'event-v1', '{}', $3, $4, 1, $5)`,
      [
        committedIdentity.worldId,
        committedIdentity.commandId,
        payloadHash,
        eventFingerprint,
        '2026-09-24T01:01:00.000Z',
      ],
    );
    await database.query(
      `insert into world_v2.command_receipt
        (world_id, command_id, idempotency_key, schema_version,
         command_fingerprint, outcome, reason_code, transition_id,
         world_version_before, world_version_after, sim_time, event_ids,
         recorded_at_real)
       values
        ($1, $2, $3, 'command-receipt-v2', $4, 'COMMITTED', null, $2,
         0, 1, 1, '["EVENT_1"]'::jsonb, $5),
        ($1, $6, $7, 'command-receipt-v2', $8, 'REJECTED',
         'POLICY_REJECTED', null, null, null, 2, '[]'::jsonb, $5)`,
      [
        committedIdentity.worldId,
        committedIdentity.commandId,
        committedIdentity.idempotencyKey,
        fingerprintA,
        '2026-09-24T01:02:03.000Z',
        rejectedIdentity.commandId,
        rejectedIdentity.idempotencyKey,
        fingerprintB,
      ],
    );
    executor = {
      query: async ({ text, values }) => database.query(text, [...values]),
    };
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it('reads a migration-backed committed receipt with complete evidence', async () => {
    await expect(
      readPostgresFinalCommandReceipt({
        executor,
        identity: committedIdentity,
        serverScope,
      }),
    ).resolves.toEqual({
      source: 'DURABLE_FINAL_COMMAND_RECEIPT',
      schemaVersion: 'command-receipt-v2',
      worldId: committedIdentity.worldId,
      commandId: committedIdentity.commandId,
      idempotencyKey: committedIdentity.idempotencyKey,
      commandFingerprint: fingerprintA,
      outcome: 'COMMITTED',
      reasonCode: null,
      transitionId: committedIdentity.commandId,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: '1',
      eventIds: ['EVENT_1'],
      recordedAtReal: '2026-09-24T01:02:03.000Z',
    });
  });

  it('reads a migration-backed zero-effect final receipt', async () => {
    await expect(
      readPostgresFinalCommandReceipt({
        executor,
        identity: rejectedIdentity,
        serverScope,
      }),
    ).resolves.toMatchObject({
      commandId: rejectedIdentity.commandId,
      idempotencyKey: rejectedIdentity.idempotencyKey,
      commandFingerprint: fingerprintB,
      outcome: 'REJECTED',
      reasonCode: 'POLICY_REJECTED',
      transitionId: null,
      worldVersionBefore: null,
      worldVersionAfter: null,
      eventIds: [],
    });
  });

  it.each([
    [
      'different auth subject',
      committedIdentity,
      { ...serverScope, authSubject: otherSubject },
    ],
    [
      'different country',
      committedIdentity,
      { ...serverScope, countryId: 'COUNTRY_B' },
    ],
    [
      'different office',
      committedIdentity,
      { ...serverScope, officeId: 'FINANCE' },
    ],
    [
      'different idempotency key',
      { ...committedIdentity, idempotencyKey: 'IDEMPOTENCY_OTHER' },
      serverScope,
    ],
    [
      'different command ID',
      { ...committedIdentity, commandId: 'COMMAND_OTHER' },
      serverScope,
    ],
  ])(
    'returns the same empty result for a %s',
    async (_label, identity, scope) => {
      await expect(
        readPostgresFinalCommandReceipt({
          executor,
          identity,
          serverScope: scope,
        }),
      ).resolves.toBeNull();
    },
  );

  it('binds every identity and server scope value as a query parameter', async () => {
    const calls: Array<{ text: string; values: readonly string[] }> = [];
    const recordingExecutor: ParameterizedPgReadExecutor = {
      query: async ({ text, values }) => {
        calls.push({ text, values });
        return { rows: [] };
      },
    };
    await readPostgresFinalCommandReceipt({
      executor: recordingExecutor,
      identity: committedIdentity,
      serverScope,
    });

    expect(calls).toEqual([
      {
        text: WORLD_V2_FINAL_RECEIPT_QUERY,
        values: [
          committedIdentity.worldId,
          committedIdentity.commandId,
          committedIdentity.idempotencyKey,
          authSubject,
          serverScope.countryId,
          serverScope.officeId,
        ],
      },
    ]);
    for (const value of calls[0]?.values ?? []) {
      expect(calls[0]?.text).not.toContain(value);
    }
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).toMatch(/^select\b/u);
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).not.toMatch(
      /\b(?:insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|call|do|for\s+update)\b/iu,
    );
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).toContain(
      'from world_v2.command_receipt as receipt',
    );
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).toContain(
      'inner join world_v2.command_submission as submission',
    );
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).toContain(
      'and submission.auth_subject = $4::uuid',
    );
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).toContain(
      'and submission.country_id = $5',
    );
    expect(WORLD_V2_FINAL_RECEIPT_QUERY).toContain(
      'and submission.office_id = $6',
    );
  });

  it('fails closed for duplicate, conflicting, or source-labelled rows', async () => {
    const duplicateExecutor: ParameterizedPgReadExecutor = {
      query: async () => ({ rows: [validExecutorRow(), validExecutorRow()] }),
    };
    await expect(
      readPostgresFinalCommandReceipt({
        executor: duplicateExecutor,
        identity: committedIdentity,
        serverScope,
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });

    const conflictExecutor: ParameterizedPgReadExecutor = {
      query: async () => ({
        rows: [
          {
            ...validExecutorRow(),
            submission_command_fingerprint: fingerprintB,
          },
        ],
      }),
    };
    await expect(
      readPostgresFinalCommandReceipt({
        executor: conflictExecutor,
        identity: committedIdentity,
        serverScope,
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });

    const sourceLiteralExecutor: ParameterizedPgReadExecutor = {
      query: async () => ({
        rows: [
          {
            ...validExecutorRow(),
            source: 'DURABLE_FINAL_COMMAND_RECEIPT',
          },
        ],
      }),
    };
    await expect(
      readPostgresFinalCommandReceipt({
        executor: sourceLiteralExecutor,
        identity: committedIdentity,
        serverScope,
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
  });

  it('fails closed for malformed outcome evidence', async () => {
    const malformedExecutor: ParameterizedPgReadExecutor = {
      query: async () => ({
        rows: [
          {
            ...validExecutorRow(),
            outcome: 'COMMITTED',
            event_ids: [],
          },
        ],
      }),
    };
    await expect(
      readPostgresFinalCommandReceipt({
        executor: malformedExecutor,
        identity: committedIdentity,
        serverScope,
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
  });

  it('does not query after cancellation and redacts database failures', async () => {
    let calls = 0;
    const unavailableExecutor: ParameterizedPgReadExecutor = {
      query: () => {
        calls += 1;
        return Promise.reject(new Error('synthetic-secret-database-detail'));
      },
    };
    const controller = new AbortController();
    controller.abort();
    await expect(
      readPostgresFinalCommandReceipt({
        executor: unavailableExecutor,
        identity: committedIdentity,
        serverScope,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED', retryable: false });
    expect(calls).toBe(0);

    await expect(
      readPostgresFinalCommandReceipt({
        executor: unavailableExecutor,
        identity: committedIdentity,
        serverScope,
      }),
    ).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Final receipt database unavailable',
      retryable: true,
    });
    expect(calls).toBe(1);
  });
});
