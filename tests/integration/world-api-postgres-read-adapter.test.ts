import fs from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createWorldReadRequest,
  MAX_WORLD_READ_RESPONSE_BYTES,
  parseSupabaseAuthSubject,
  readEntitledWorldProjection,
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0013_world_v2_read_projection_boundary.sql',
];
const countrySubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174000',
);
const officeSubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174001',
);
const unauthorizedSubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174002',
);

function request(
  classification: 'COUNTRY' | 'OFFICE_PRIVATE',
  scopeKey: string,
) {
  return createWorldReadRequest({
    requestId: '123e4567-e89b-42d3-a456-426614174010',
    worldId: 'WORLD_1',
    classification,
    scopeKey,
  });
}

describe('forward-only parameterized PostgreSQL read adapter', () => {
  let database: PGlite;
  let executor: ParameterizedPgReadExecutor;

  beforeAll(async () => {
    database = new PGlite();
    for (const migration of migrations) {
      await database.exec(
        await fs.readFile(
          path.join(databaseMigrationRoot(), migration),
          'utf8',
        ),
      );
    }
    await database.query(
      `insert into world_v2.world_head (world_id, world_version, event_sequence)
       values ($1, $2, $3)`,
      ['WORLD_1', 9, 14],
    );
    await database.query(
      `insert into world_v2.read_projection
        (world_id, classification, scope_key, schema_version, world_version, event_sequence, payload, generated_at)
       values
        ($1, 'COUNTRY', 'COUNTRY_A', 'world-projection-read-v1', 9, 14, $2::jsonb, $3),
        ($1, 'OFFICE_PRIVATE', 'OFFICE_A', 'world-projection-read-v1', 9, 14, $4::jsonb, $3)`,
      [
        'WORLD_1',
        JSON.stringify({ country: 'COUNTRY_A', status: 'READY' }),
        '2026-09-12T02:00:00.000Z',
        JSON.stringify({ office: 'OFFICE_A', status: 'READY' }),
      ],
    );
    await database.query(
      `insert into world_v2.projection_entitlement
        (world_id, auth_subject, classification, scope_key, authorization_version, granted_at)
       values
        ($1, $2::uuid, 'COUNTRY', 'COUNTRY_A', 'AUTH_1', $4),
        ($1, $3::uuid, 'OFFICE_PRIVATE', 'OFFICE_A', 'AUTH_1', $4)`,
      ['WORLD_1', countrySubject, officeSubject, '2026-09-12T01:00:00.000Z'],
    );
    executor = {
      query: async ({ text, values }) => database.query(text, [...values]),
    };
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it('returns an entitled country projection with its watermark', async () => {
    await expect(
      readEntitledWorldProjection({
        executor,
        authSubject: countrySubject,
        request: request('COUNTRY', 'COUNTRY_A'),
        minimumWatermark: { worldVersion: '9', eventSequence: '14' },
      }),
    ).resolves.toMatchObject({
      classification: 'COUNTRY',
      scopeKey: 'COUNTRY_A',
      payload: { country: 'COUNTRY_A', status: 'READY' },
      watermark: { worldVersion: '9', eventSequence: '14' },
      receipts: [],
      events: [],
    });
  });

  it('returns an entitled office projection without broadening scope', async () => {
    await expect(
      readEntitledWorldProjection({
        executor,
        authSubject: officeSubject,
        request: request('OFFICE_PRIVATE', 'OFFICE_A'),
      }),
    ).resolves.toMatchObject({
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_A',
      payload: { office: 'OFFICE_A', status: 'READY' },
    });
  });

  it('returns an empty result for a subject without an entitlement', async () => {
    await expect(
      readEntitledWorldProjection({
        executor,
        authSubject: unauthorizedSubject,
        request: request('COUNTRY', 'COUNTRY_A'),
      }),
    ).resolves.toBeNull();
  });

  it('returns an empty result when the projection is behind the minimum watermark', async () => {
    await expect(
      readEntitledWorldProjection({
        executor,
        authSubject: countrySubject,
        request: request('COUNTRY', 'COUNTRY_A'),
        minimumWatermark: { worldVersion: '10', eventSequence: '0' },
      }),
    ).resolves.toBeNull();
  });

  it('keeps identity, scope and watermark values out of SQL text', async () => {
    const calls: Array<{ text: string; values: readonly string[] }> = [];
    const recordingExecutor: ParameterizedPgReadExecutor = {
      query: async ({ text, values }) => {
        calls.push({ text, values });
        return { rows: [] };
      },
    };
    await readEntitledWorldProjection({
      executor: recordingExecutor,
      authSubject: countrySubject,
      request: request('COUNTRY', 'COUNTRY_A'),
      minimumWatermark: { worldVersion: '9', eventSequence: '14' },
    });

    expect(calls).toEqual([
      {
        text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
        values: [countrySubject, 'WORLD_1', 'COUNTRY', 'COUNTRY_A', '9', '14'],
      },
    ]);
    for (const value of calls[0]?.values ?? []) {
      expect(calls[0]?.text).not.toContain(value);
    }
  });

  it('fails closed for unsupported classifications and duplicate rows', async () => {
    const publicRequest = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174011',
      worldId: 'WORLD_1',
      classification: 'PUBLIC',
      scopeKey: 'PUBLIC',
    });
    await expect(
      readEntitledWorldProjection({
        executor,
        authSubject: countrySubject,
        request: publicRequest,
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });

    const duplicateExecutor: ParameterizedPgReadExecutor = {
      query: async () => ({ rows: [{}, {}] }),
    };
    await expect(
      readEntitledWorldProjection({
        executor: duplicateExecutor,
        authSubject: countrySubject,
        request: request('COUNTRY', 'COUNTRY_A'),
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
  });

  it('does not query after cancellation and redacts database errors', async () => {
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
      readEntitledWorldProjection({
        executor: unavailableExecutor,
        authSubject: countrySubject,
        request: request('COUNTRY', 'COUNTRY_A'),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED', retryable: false });
    expect(calls).toBe(0);

    await expect(
      readEntitledWorldProjection({
        executor: unavailableExecutor,
        authSubject: countrySubject,
        request: request('COUNTRY', 'COUNTRY_A'),
      }),
    ).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'World read database unavailable',
      retryable: true,
    });
    expect(calls).toBe(1);
  });

  it('rejects a projection that exceeds the one MiB response boundary', async () => {
    const oversizedExecutor: ParameterizedPgReadExecutor = {
      query: async () => ({
        rows: [
          {
            world_id: 'WORLD_1',
            classification: 'COUNTRY',
            scope_key: 'COUNTRY_A',
            schema_version: 'world-projection-read-v1',
            world_version: '9',
            event_sequence: '14',
            payload: 'x'.repeat(MAX_WORLD_READ_RESPONSE_BYTES),
            generated_at: '2026-09-12T02:00:00.000Z',
          },
        ],
      }),
    };
    await expect(
      readEntitledWorldProjection({
        executor: oversizedExecutor,
        authSubject: countrySubject,
        request: request('COUNTRY', 'COUNTRY_A'),
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
  });
});

function databaseMigrationRoot(): string {
  return path.join(repositoryRoot, 'database/migrations/artifacts');
}
