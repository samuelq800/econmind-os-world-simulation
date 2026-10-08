// TEST_ONLY copied unchanged real-chain builder from fixed7502 positive suite; no official source/TLS/host authority.
import { readFile } from 'node:fs/promises';
import {
  parseWorldWriterLease,
  type CaptainPoliticalCapitalSourceSnapshot,
} from '@econmind/core';
import { createManualOfficeIntakeRuntime } from '../../apps/world-worker/dist/intake/postgres-office-command-intake.js';
import { createAuthenticatedOfficeCommandService } from '../../apps/world-api/src/integration/authenticated-office-command-service.js';
import type { ManualOfficeRuntimeReaders } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  captainTestOnlyCommand,
  captainTestOnlySnapshot,
} from '../support/g-dispatch-captain-test-only-fixture.js';
import {
  fixture,
  INTAKE,
  sha,
} from '../support/g-manual-office-api-test-only-fixture.js';

/** True JWT/current restricted SQL binding + TEST_ONLY SQL domain fixture +
 * actual private server consumer construction. Not official genesis/host route. */
export async function officeRouteTestOnlyFixture() {
  const cap = captainTestOnlyCommand();
  const f = await fixture(0, true, cap.worldId);
  f.server.simTime = '16000';
  const request = {
    ...f.request,
    payload: JSON.parse(cap.canonicalPayload) as unknown,
  };
  const manifest = JSON.parse(
    await readFile(
      new URL('../../database/migrations/manifest.json', import.meta.url),
      'utf8',
    ),
  ) as { migrations: Array<{ path: string; release_order: number }> };
  const loaded = [1, 2, 3, 7, 11, 13, 16];
  for (const m of manifest.migrations.filter(
    (m) => m.release_order <= 17 && !loaded.includes(m.release_order),
  )) {
    await f.db.exec('reset role');
    await f.db.exec(
      await readFile(new URL('../../' + m.path, import.meta.url), 'utf8'),
    );
  }
  await f.admin(
    'create table g_test_only_manual_domain_source(payload text not null)',
  );
  await f.admin('insert into g_test_only_manual_domain_source values($1)', [
    JSON.stringify(captainTestOnlySnapshot()),
  ]);
  const workerId = 'WORKER_TEST_ONLY_POSITIVE_INTAKE';
  await f.admin(
    'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
    [cap.worldId, workerId, cap.submittedAtReal],
  );
  // TEST_ONLY grants support existing lock convention. No formal provisioning
  // migration/grant is introduced; these column UPDATE privileges are not a
  // production least-privilege decision or a default writer-role grant.
  await f.db.exec('reset role');
  await f.db
    .exec(`grant insert on world_v2.command_submission,world_v2.command_queue to ${INTAKE};
    grant update(command_id) on world_v2.command_submission to ${INTAKE};
    grant update(world_version) on world_v2.world_head to ${INTAKE};
    grant update(active) on world_v2.current_commit_authorization,world_v2.projection_entitlement to ${INTAKE};
    create policy g_test_only_entitlement_lock on world_v2.projection_entitlement for update to ${INTAKE}
      using(auth_subject::text=current_setting('request.jwt.claim.sub',true));`);
  const serverSql = async <T>(operation: () => Promise<T>): Promise<T> => {
    const role = (
      await f.db.query<{ role: string }>('select current_user as role')
    ).rows[0]!.role;
    if (!/^[a-z][a-z0-9_]*$/u.test(role))
      throw new Error('TEST_ONLY_ROLE_INVALID');
    await f.db.exec('reset role');
    try {
      return await operation();
    } finally {
      await f.db.exec('set role ' + role);
    }
  };
  const executor: SqlExecutor = {
    async query<Row extends object>(text: string, values?: readonly unknown[]) {
      const r = await f.db.query(text, values ? [...values] : undefined);
      return {
        rows: r.rows as Row[],
        rowCount: r.affectedRows ?? r.rows.length,
      };
    },
  };
  const database: SqlDatabase = {
    query: (text, values) => serverSql(() => executor.query(text, values)),
    transaction: (operation) =>
      serverSql(async () => {
        await f.db.exec('begin');
        try {
          const result = await operation(executor);
          await f.db.exec('commit');
          return result;
        } catch (error) {
          await f.db.exec('rollback');
          throw error;
        }
      }),
  };
  let reads = 0;
  const sourceHooks: { afterRead?: () => Promise<void> } = {};
  const captain = {
    async read() {
      return serverSql(async () => {
        reads++;
        const data = await f.db.query<{ payload: string }>(
          'select payload from g_test_only_manual_domain_source',
        );
        if (!data.rows[0])
          return {
            kind: 'MISSING' as const,
            missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE'] as const,
          };
        const r = (
          await f.db.query<{
            world_id: string;
            holder_id: string;
            fencing_token: string;
            acquired_at_real: Date;
            renewed_at_real: Date;
            lease_expires_at_real: Date;
          }>(
            'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease',
          )
        ).rows[0]!;
        await sourceHooks.afterRead?.();
        return {
          kind: 'READ' as const,
          snapshot: JSON.parse(
            data.rows[0].payload,
          ) as CaptainPoliticalCapitalSourceSnapshot,
          lease: parseWorldWriterLease({
            schemaVersion: 'world-writer-lease-v1',
            worldId: r.world_id,
            holderId: r.holder_id,
            fencingToken: r.fencing_token,
            acquiredAtReal: r.acquired_at_real.toISOString(),
            renewedAtReal: r.renewed_at_real.toISOString(),
            expiresAtReal: r.lease_expires_at_real.toISOString(),
          }),
        };
      });
    },
  };
  const construct = (readers: ManualOfficeRuntimeReaders = { captain }) =>
    createManualOfficeIntakeRuntime({
      intakePool: f.config.writerPool,
      workerDatabase: database,
      worldId: cap.worldId,
      workerId,
      clock: f.config.clock,
      environment: { ECONMIND_ENV: 'ci' },
      sha256Hex: sha,
      readers,
    });
  const runtime = construct();
  const service = createAuthenticatedOfficeCommandService({
    ...f.config,
    runtime,
  });
  const call = (r: unknown = request) =>
    service.handle({
      authorization: `Bearer ${f.token()}`,
      request: f.envelope(r),
    });
  const counts = async () => {
    const result: Record<string, number> = {};
    for (const table of [
      'command_submission',
      'command_queue',
      'authoritative_event',
      'command_receipt',
      'financial_posting_batch',
      'inventory_posting',
    ])
      result[table] = Number(
        (
          (await f.admin(`select count(*)::text as n from world_v2.${table}`))
            .rows[0] as { n: string }
        ).n,
      );
    return result;
  };
  return {
    ...f,
    request,
    runtime,
    service,
    call,
    counts,
    construct,
    sourceHooks,
    readCount: () => reads,
  };
}
