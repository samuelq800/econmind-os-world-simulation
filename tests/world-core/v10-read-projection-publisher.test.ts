import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireWorldWriterLease,
  createWorldWriterCommitAssertion,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import { WorldReadProjectionPublisher } from '../../apps/world-worker/src/index.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0004_world_v2_receipt_event_set_integrity.sql',
  '0005_world_v2_writer_lease_fencing.sql',
  '0006_world_v2_writer_lease_lineage_guard.sql',
  '0007_world_v2_atomic_transition_facts.sql',
  '0008_world_v2_materialization_recovery.sql',
  '0009_world_v2_posting_payload_integrity.sql',
  '0010_world_v2_command_claim_fencing.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0012_world_v2_command_claim_active_lease_guard.sql',
  '0013_world_v2_read_projection_boundary.sql',
] as const;
const WORLD = worldId('WORLD_V10_READ_TEST');
const WORKER = workerId('WORKER_V10_READ_TEST');
const AT = '2026-09-13T00:00:00.000Z';
const EXPIRY = '2026-09-13T00:05:00.000Z';

const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<V09AtomicTestDatabase> {
  const result = createPGliteV09AtomicTestDatabase();
  databases.push(result);
  for (const migration of migrations) {
    await result.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await result.query('insert into world_v2.world_head (world_id) values ($1)', [
    WORLD,
  ]);
  return result;
}

function assertion() {
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, AT, EXPIRY),
  );
  return createWorldWriterCommitAssertion(lease.lease, '0');
}

describe('V10.1 worker read-projection publication', () => {
  it('replaces only V10.1 derived scopes at the locked authoritative watermark', async () => {
    const testDatabase = await database();
    const publisher = new WorldReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    const commitAssertion = assertion();
    await testDatabase.query(
      `select * from world_v2.acquire_world_writer_lease($1, $2, $3, 300000)`,
      [WORLD, WORKER, AT],
    );

    await expect(
      publisher.replace({
        assertion: commitAssertion,
        observedAtReal: AT,
        projections: [
          {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_SELLER_TEST',
            payload: { country: 'SELLER', markets: ['WHEAT'] },
          },
          {
            classification: 'OFFICE_PRIVATE',
            scopeKey: 'OFFICE_TRADE_SELLER_TEST',
            payload: { office: 'TRADE', country: 'SELLER' },
          },
          {
            classification: 'NEGOTIATION_PARTY',
            scopeKey: 'PARTY_SELLER_BUYER_TEST',
            payload: { parties: ['SELLER', 'BUYER'] },
          },
        ],
      }),
    ).resolves.toEqual({
      publishedCount: 3,
      worldVersion: '0',
      eventSequence: '0',
    });
    await testDatabase.query(
      `insert into world_v2.read_projection
         (world_id, classification, scope_key, schema_version, world_version,
          event_sequence, payload, generated_at)
       values ($1, 'PUBLIC', 'PUBLIC', 'world-projection-read-v1', 0, 0, '{}', $2)`,
      [WORLD, AT],
    );
    await expect(
      publisher.replace({
        assertion: commitAssertion,
        observedAtReal: AT,
        projections: [
          {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_SELLER_TEST',
            payload: { country: 'SELLER', markets: ['WHEAT', 'CORN'] },
          },
        ],
      }),
    ).resolves.toMatchObject({ publishedCount: 1 });
    const published = await testDatabase.query<{
      readonly classification: string;
      readonly event_sequence: string;
      readonly payload: string;
      readonly scope_key: string;
      readonly world_version: string;
    }>(
      `select classification, scope_key, world_version::text as world_version,
              event_sequence::text as event_sequence, payload::text as payload
         from world_v2.read_projection
        where world_id = $1
        order by classification, scope_key`,
      [WORLD],
    );
    expect(published.rows).toMatchObject([
      {
        classification: 'COUNTRY',
        scope_key: 'COUNTRY_SELLER_TEST',
        world_version: '0',
        event_sequence: '0',
      },
      {
        classification: 'PUBLIC',
        scope_key: 'PUBLIC',
        world_version: '0',
        event_sequence: '0',
      },
    ]);
    expect(JSON.parse(published.rows[0]!.payload)).toEqual({
      country: 'SELLER',
      markets: ['WHEAT', 'CORN'],
    });
    expect(JSON.parse(published.rows[1]!.payload)).toEqual({});
  }, 30_000);

  it('fails closed before a transaction for a foreign worker or ambiguous projection set', async () => {
    const testDatabase = await database();
    const commitAssertion = assertion();
    const foreignPublisher = new WorldReadProjectionPublisher({
      database: testDatabase,
      workerId: 'WORKER_OTHER_TEST',
    });
    await expect(
      foreignPublisher.replace({
        assertion: commitAssertion,
        observedAtReal: AT,
        projections: [
          {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_SELLER_TEST',
            payload: {},
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });

    const publisher = new WorldReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({
        assertion: commitAssertion,
        observedAtReal: AT,
        projections: [
          {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_SELLER_TEST',
            payload: {},
          },
          {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_SELLER_TEST',
            payload: {},
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
    await expect(
      testDatabase.query(
        'select count(*)::text as count from world_v2.read_projection',
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  }, 30_000);
});
