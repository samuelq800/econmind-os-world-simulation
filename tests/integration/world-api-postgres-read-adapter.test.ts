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
const negotiationSubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174003',
);
const officeScope = 'OFFICE_434F554E5452595F41_46494E414E4345';
function classifiedPayload(office = false) {
  return {
    schemaVersion: 'world-activity-projection-v1',
    countryId: 'COUNTRY_A',
    ...(office ? { officeId: 'FINANCE' } : {}),
    activity: {
      authoritativeEventCount: '0',
      lastAuthoritativeEventSequence: '0',
      lastAuthoritativeEventWorldVersion: '0',
    },
    ledger: {
      financialPositions: [],
      inventoryPositions: [],
      visibility: {
        schemaVersion: 'economic-read-visibility-v1',
        financialDetail: office ? 'AUTHORIZED_FILTERED' : 'NOT_AUTHORIZED',
        inventoryDetail: 'NOT_AUTHORIZED',
        countrySummary: 'NOT_AUTHORIZED',
      },
    },
  };
}
const unauthorizedSubject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174002',
);

function request(
  classification: 'COUNTRY' | 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY',
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
        ($1, 'OFFICE_PRIVATE', 'OFFICE_434F554E5452595F41_46494E414E4345', 'world-projection-read-v1', 9, 14, $4::jsonb, $3),
        ($1, 'NEGOTIATION_PARTY', 'PARTY_A', 'world-projection-read-v1', 9, 14, $5::jsonb, $3)`,
      [
        'WORLD_1',
        JSON.stringify(classifiedPayload()),
        '2026-09-12T02:00:00.000Z',
        JSON.stringify(classifiedPayload(true)),
        JSON.stringify({ party: 'PARTY_A', status: 'READY' }),
      ],
    );
    await database.query(
      `insert into world_v2.projection_entitlement
        (world_id, auth_subject, classification, scope_key, authorization_version, granted_at)
       values
        ($1, $2::uuid, 'COUNTRY', 'COUNTRY_A', 'AUTH_1', $5),
        ($1, $3::uuid, 'OFFICE_PRIVATE', 'OFFICE_434F554E5452595F41_46494E414E4345', 'AUTH_1', $5),
        ($1, $4::uuid, 'NEGOTIATION_PARTY', 'PARTY_A', 'AUTH_1', $5)`,
      [
        'WORLD_1',
        countrySubject,
        officeSubject,
        negotiationSubject,
        '2026-09-12T01:00:00.000Z',
      ],
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
      payload: classifiedPayload(),
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
        request: request('OFFICE_PRIVATE', officeScope),
      }),
    ).resolves.toMatchObject({
      classification: 'OFFICE_PRIVATE',
      scopeKey: officeScope,
      payload: classifiedPayload(true),
    });
  });

  it('returns an entitled negotiation-party projection without broadening scope', async () => {
    await expect(
      readEntitledWorldProjection({
        executor,
        authSubject: negotiationSubject,
        request: request('NEGOTIATION_PARTY', 'PARTY_A'),
      }),
    ).resolves.toMatchObject({
      classification: 'NEGOTIATION_PARTY',
      scopeKey: 'PARTY_A',
      payload: { party: 'PARTY_A', status: 'READY' },
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
  it.each([
    'legacyRaw',
    'countryRelabel',
    'unauthorizedFinancial',
    'privateExtra',
    'wrongScope',
    'inventoryDetail',
  ])(
    'rejects %s at the actual server mapping boundary before a payload can be returned',
    async (kind) => {
      const payload: Record<string, unknown> =
        structuredClone(classifiedPayload());
      const ledger = payload.ledger as {
        visibility: Record<string, unknown>;
        financialPositions: unknown[];
        inventoryPositions: unknown[];
      };
      if (kind === 'legacyRaw')
        delete (payload.ledger as Record<string, unknown>).visibility;
      if (kind === 'countryRelabel')
        ledger.visibility.financialDetail = 'AUTHORIZED_FILTERED';
      if (kind === 'unauthorizedFinancial')
        ledger.financialPositions.push({
          accountId: 'ACCOUNT_SECRET_TREASURY',
          accountClass: 'CASH',
          currency: 'GCU',
          netDebitBalance: '999',
        });
      if (kind === 'privateExtra')
        payload.secretTreasuryForecast = 'SENSITIVE_TEST_PAYLOAD';
      if (kind === 'wrongScope') payload.countryId = 'COUNTRY_OTHER';
      if (kind === 'inventoryDetail')
        ledger.inventoryPositions.push({
          commodityId: 'PRIVATE_STOCK',
          quantity: '9',
          unit: 'tonne',
          bucket: 'AVAILABLE',
        });
      const replay: ParameterizedPgReadExecutor = {
        query: async (call) => {
          const result = await executor.query(call);
          return {
            rows: result.rows.map((row) => ({ ...(row as object), payload })),
          };
        },
      };
      await expect(
        readEntitledWorldProjection({
          executor: replay,
          authSubject: countrySubject,
          request: request('COUNTRY', 'COUNTRY_A'),
        }),
      ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
    },
  );

  it('rejects a current private financial marker assigned to Trade rather than Finance/CB', async () => {
    const payload = { ...classifiedPayload(true), officeId: 'TRADE' };
    const tradeScope = 'OFFICE_434F554E5452595F41_5452414445';
    const wrongOffice: ParameterizedPgReadExecutor = {
      query: async () => ({
        rows: [
          {
            world_id: 'WORLD_1',
            classification: 'OFFICE_PRIVATE',
            scope_key: tradeScope,
            schema_version: 'world-projection-read-v1',
            world_version: '9',
            event_sequence: '14',
            payload,
            generated_at: '2026-09-12T02:00:00.000Z',
          },
        ],
      }),
    };
    await expect(
      readEntitledWorldProjection({
        executor: wrongOffice,
        authSubject: officeSubject,
        request: request('OFFICE_PRIVATE', tradeScope),
      }),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
  });
  it.each([
    'wrongHead',
    'extraSeedField',
    'countryScope',
    'deniedWithPositions',
    'movementSemantics',
    'zeroPosition',
    'badSourceUnit',
    'duplicatePosition',
  ])(
    'refuses %s in the optional opening-inclusive position at the actual server map boundary',
    async (kind) => {
      const payload: Record<string, unknown> = classifiedPayload(
        kind !== 'countryScope',
      );
      const absolute: Record<string, unknown> = {
        schemaVersion: 'authoritative-financial-position-v1',
        status: 'AUTHORIZED_FILTERED',
        semantics: 'OPENING_PLUS_POSTING_LINEAGE',
        positionCoverage: 'NONZERO_LEDGER_POSITIONS',
        sourceHead: { worldVersion: '9', eventSequence: '14' },
        opening: {
          seedId: 'SEED_TEST',
          seedFingerprint: 'sha256:' + 'a'.repeat(64),
          openingWorldVersion: '0',
        },
        sourceUnits: [
          'CONSTITUTION-U0381',
          'CONSTITUTION-U0382',
          'FINANCE-U0831',
        ],
        positions: [
          {
            accountId: 'ACCOUNT_TEST',
            accountClass: 'CASH',
            currency: 'GCU',
            netDebitBalance: '13',
          },
        ],
      };
      if (kind === 'wrongHead')
        absolute.sourceHead = { worldVersion: '8', eventSequence: '14' };
      if (kind === 'extraSeedField')
        (absolute.opening as Record<string, unknown>).roster = 'SENSITIVE_TEST';
      if (kind === 'deniedWithPositions') absolute.status = 'NOT_AUTHORIZED';
      if (kind === 'movementSemantics')
        absolute.semantics = 'NET_POSTING_MOVEMENT';
      if (kind === 'zeroPosition')
        (
          absolute.positions as { netDebitBalance: string }[]
        )[0]!.netDebitBalance = '0';
      if (kind === 'badSourceUnit')
        absolute.sourceUnits = ['CAPTAIN_FAKE_GRANT'];
      if (kind === 'duplicatePosition')
        (absolute.positions as unknown[]).push(
          (absolute.positions as unknown[])[0],
        );
      (
        payload.ledger as Record<string, unknown>
      ).authoritativeFinancialPosition = absolute;
      const replay: ParameterizedPgReadExecutor = {
        query: async (call) => {
          const result = await executor.query(call);
          return {
            rows: result.rows.map((row) => ({ ...(row as object), payload })),
          };
        },
      };
      await expect(
        readEntitledWorldProjection({
          executor: replay,
          authSubject: kind === 'countryScope' ? countrySubject : officeSubject,
          request: request(
            kind === 'countryScope' ? 'COUNTRY' : 'OFFICE_PRIVATE',
            kind === 'countryScope' ? 'COUNTRY_A' : officeScope,
          ),
        }),
      ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR', retryable: false });
    },
  );
});

function databaseMigrationRoot(): string {
  return path.join(repositoryRoot, 'database/migrations/artifacts');
}
