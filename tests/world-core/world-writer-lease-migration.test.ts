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
  'database/migrations/artifacts/0005_world_v2_writer_lease_fencing.sql',
  'database/migrations/artifacts/0006_world_v2_writer_lease_lineage_guard.sql',
];

let database: PGlite;

async function acquireLease(
  world: string,
  holder: string,
  observedAtReal: string,
  durationMilliseconds: string,
) {
  return database.query(
    `select
       holder_id,
       fencing_token::text as fencing_token,
       acquisition_kind
     from world_v2.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
    [world, holder, observedAtReal, durationMilliseconds],
  );
}

async function assertCommitGuard(
  world: string,
  holder: string,
  fence: string,
  expectedWorldVersion: string,
  observedAtReal: string,
) {
  return database.query(
    `select
       world_version::text as world_version,
       event_sequence::text as event_sequence
     from world_v2.assert_world_writer_commit_guard(
       $1,
       $2,
       $3::bigint,
       $4::bigint,
       $5::timestamptz
     )`,
    [world, holder, fence, expectedWorldVersion, observedAtReal],
  );
}

beforeEach(async () => {
  database = new PGlite();
  for (const migrationPath of migrationPaths) {
    await database.exec(await readFile(path.join(root, migrationPath), 'utf8'));
  }
  await database.exec(
    `insert into world_v2.world_head (world_id)
     values ('WORLD_1'), ('WORLD_2')`,
  );
});

afterEach(async () => database.close());

describe('V09.1 branch-local writer lease/fencing DDL candidate', () => {
  it('serializes acquire, renewal and expiry takeover with monotonic fencing', async () => {
    await expect(
      acquireLease('WORLD_1', 'WORKER_1', '2026-09-11T00:00:00.000Z', '1000'),
    ).resolves.toMatchObject({
      rows: [
        {
          acquisition_kind: 'ACQUIRED',
          fencing_token: '1',
          holder_id: 'WORKER_1',
        },
      ],
    });
    await expect(
      acquireLease('WORLD_1', 'WORKER_2', '2026-09-11T00:00:00.500Z', '1000'),
    ).rejects.toThrow('WORLD_WRITER_LEASE_HELD');
    await expect(
      acquireLease('WORLD_1', 'WORKER_1', '2026-09-11T00:00:00.500Z', '2000'),
    ).resolves.toMatchObject({
      rows: [
        {
          acquisition_kind: 'RENEWED',
          fencing_token: '1',
          holder_id: 'WORKER_1',
        },
      ],
    });
    await expect(
      acquireLease('WORLD_1', 'WORKER_2', '2026-09-11T00:00:02.500Z', '1000'),
    ).resolves.toMatchObject({
      rows: [
        {
          acquisition_kind: 'TAKEN_OVER',
          fencing_token: '2',
          holder_id: 'WORKER_2',
        },
      ],
    });
  });

  it('rejects stale fence, expiry and WorldVersion inside the SQL guard', async () => {
    await acquireLease(
      'WORLD_1',
      'WORKER_1',
      '2026-09-11T00:00:00.000Z',
      '1000',
    );
    await acquireLease(
      'WORLD_1',
      'WORKER_2',
      '2026-09-11T00:00:01.000Z',
      '1000',
    );

    await expect(
      assertCommitGuard(
        'WORLD_1',
        'WORKER_1',
        '1',
        '0',
        '2026-09-11T00:00:01.000Z',
      ),
    ).rejects.toThrow('WORLD_WRITER_FENCE_STALE');
    await expect(
      assertCommitGuard(
        'WORLD_1',
        'WORKER_2',
        '2',
        '1',
        '2026-09-11T00:00:01.000Z',
      ),
    ).rejects.toThrow('WORLD_VERSION_MISMATCH');
    await expect(
      assertCommitGuard(
        'WORLD_1',
        'WORKER_2',
        '2',
        '0',
        '2026-09-11T00:00:02.000Z',
      ),
    ).rejects.toThrow('WORLD_WRITER_LEASE_EXPIRED');
    await expect(
      assertCommitGuard(
        'WORLD_1',
        'WORKER_2',
        '2',
        '0',
        '2026-09-11T00:00:01.500Z',
      ),
    ).resolves.toMatchObject({
      rows: [{ event_sequence: '0', world_version: '0' }],
    });
  });

  it('guards direct lease records against fence regression, reuse and early takeover', async () => {
    await acquireLease(
      'WORLD_1',
      'WORKER_1',
      '2026-09-11T00:00:00.000Z',
      '1000',
    );
    await expect(
      database.exec(
        `update world_v2.world_writer_lease
         set holder_id = 'WORKER_2'
         where world_id = 'WORLD_1'`,
      ),
    ).rejects.toThrow('lease renewal cannot replace');
    await expect(
      database.exec(
        `update world_v2.world_writer_lease
         set fencing_token = 3
         where world_id = 'WORLD_1'`,
      ),
    ).rejects.toThrow('fencing token must be unchanged');
    await expect(
      database.exec(
        `update world_v2.world_writer_lease
         set holder_id = 'WORKER_2',
             fencing_token = 2,
             acquired_at_real = '2026-09-11T00:00:00.500Z',
             renewed_at_real = '2026-09-11T00:00:00.500Z',
             lease_expires_at_real = '2026-09-11T00:00:02.000Z'
         where world_id = 'WORLD_1'`,
      ),
    ).rejects.toThrow('lease takeover requires expiry');
    await expect(
      database.exec(
        `insert into world_v2.world_writer_lease (
           world_id,
           holder_id,
           fencing_token,
           acquired_at_real,
           renewed_at_real,
           lease_expires_at_real
         ) values (
           'WORLD_2',
           'WORKER_2',
           2,
           '2026-09-11T00:00:00.000Z',
           '2026-09-11T00:00:00.000Z',
           '2026-09-11T00:00:01.000Z'
         )`,
      ),
    ).rejects.toThrow(
      'initial World writer lease must begin at fencing token 1',
    );
  });

  it('forbids deletion/reset and keeps the pre-takeover fence stale', async () => {
    await acquireLease(
      'WORLD_1',
      'WORKER_1',
      '2026-09-11T00:00:00.000Z',
      '1000',
    );
    await expect(
      database.exec(
        `delete from world_v2.world_writer_lease where world_id = 'WORLD_1'`,
      ),
    ).rejects.toThrow('World writer lease lineage is append-only; DELETE');
    await expect(
      database.exec('truncate world_v2.world_writer_lease'),
    ).rejects.toThrow('World writer lease lineage is append-only; TRUNCATE');

    await expect(
      acquireLease('WORLD_1', 'WORKER_2', '2026-09-11T00:00:01.000Z', '1000'),
    ).resolves.toMatchObject({
      rows: [
        {
          acquisition_kind: 'TAKEN_OVER',
          fencing_token: '2',
          holder_id: 'WORKER_2',
        },
      ],
    });
    await expect(
      assertCommitGuard(
        'WORLD_1',
        'WORKER_1',
        '1',
        '0',
        '2026-09-11T00:00:01.000Z',
      ),
    ).rejects.toThrow('WORLD_WRITER_FENCE_STALE');
  });

  it('keeps operational lease facts separate across Worlds and from economic facts', async () => {
    await acquireLease(
      'WORLD_1',
      'WORKER_1',
      '2026-09-11T00:00:00.000Z',
      '1000',
    );
    await acquireLease(
      'WORLD_2',
      'WORKER_2',
      '2026-09-11T00:00:00.000Z',
      '1000',
    );
    const rows = await database.query(
      `select
         world_id,
         holder_id,
         fencing_token::text as fencing_token
       from world_v2.world_writer_lease
       order by world_id`,
    );
    const economicCounts = await database.query(
      `select
         (select count(*)::int from world_v2.command_submission) as commands,
         (select count(*)::int from world_v2.authoritative_event) as events,
         (select count(*)::int from world_v2.command_receipt) as receipts`,
    );
    expect(rows.rows).toEqual([
      { fencing_token: '1', holder_id: 'WORKER_1', world_id: 'WORLD_1' },
      { fencing_token: '1', holder_id: 'WORKER_2', world_id: 'WORLD_2' },
    ]);
    expect(economicCounts.rows).toEqual([
      { commands: 0, events: 0, receipts: 0 },
    ]);
  });
});
