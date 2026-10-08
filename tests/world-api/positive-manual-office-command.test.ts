import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  parseWorldWriterLease,
  type CaptainPoliticalCapitalSourceSnapshot,
} from '@econmind/core';
import {
  createManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from '../../apps/world-worker/dist/intake/postgres-office-command-intake.js';
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
async function positiveFixture() {
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

describe('SHARED1 conditional positive manual intake: real server composition + SQL once sink', () => {
  it('actual source/sole consumer registers one command/queue and JWT retry retains stored server clock', async () => {
    const f = await positiveFixture();
    const first = await f.call();
    expect(first).toMatchObject({
      httpStatus: 202,
      body: {
        ok: true,
        state: {
          status: 'QUEUED',
          source: 'NEW',
          submitted: true,
          queued: true,
        },
      },
    });
    expect(first.body).not.toHaveProperty('receipt');
    expect(f.runtime.consumer.state()).toBe('PREPARED');
    expect(f.service.workerActivationAllowed).toBe(false);
    f.server.simTime = '32000';
    const second = await f.call();
    expect(second).toMatchObject({
      httpStatus: 200,
      body: {
        ok: true,
        state: {
          status: 'QUEUED',
          source: 'EXISTING',
          submitted: false,
          queued: true,
        },
      },
    });
    expect(f.server.clockCalls).toBe(1);
    expect(f.readCount()).toBe(1);
    expect(await f.counts()).toEqual({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 0,
      command_receipt: 0,
      financial_posting_batch: 0,
      inventory_posting: 0,
    });
    expect(
      (
        await f.admin(
          'select sim_time::text,actor_id,auth_subject::text from world_v2.command_submission',
        )
      ).rows[0],
    ).toEqual({
      sim_time: '16000',
      actor_id: 'ACTOR_TEST_ONLY_MANUAL',
      auth_subject: '11111111-1111-4111-8111-111111111111',
    });
  });
  it('accepted queue reaches the already existing genuine authoritative consumer once', async () => {
    const f = await positiveFixture();
    expect((await f.call()).body.ok).toBe(true);
    f.runtime.consumer.startPreparation();
    expect(await f.runtime.consumer.consumeOnce()).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'COMMITTED' },
    });
    expect(await f.runtime.consumer.consumeOnce()).toEqual({ status: 'IDLE' });
    const retry = await f.call();
    expect(retry).toMatchObject({
      httpStatus: 200,
      body: {
        ok: true,
        state: { status: 'FINALIZED', source: 'EXISTING', submitted: false },
      },
    });
    expect(retry.body).not.toHaveProperty('receipt');
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 1,
      command_receipt: 1,
    });
    await f.runtime.consumer.stop();
  });
  it('fake READY object or copied real constructor token never enables the sink', async () => {
    const f = await positiveFixture();
    for (const runtime of [
      { ready: true, consumer: f.runtime.consumer },
      { ...f.runtime },
    ] as unknown as ManualOfficeIntakeRuntime[]) {
      const service = createAuthenticatedOfficeCommandService({
        ...f.config,
        runtime,
      });
      expect(
        await service.handle({
          authorization: `Bearer ${f.token()}`,
          request: f.envelope(f.request),
        }),
      ).toMatchObject({
        httpStatus: 503,
        body: { ok: false, error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' } },
      });
    }
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
    });
  });
  it('bound missing source refuses before submission/queue insert', async () => {
    const f = await positiveFixture();
    await f.admin('delete from g_test_only_manual_domain_source');
    expect(await f.call()).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' } },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
      authoritative_event: 0,
    });
  });
  it.each(['revocation', 'head', 'entitlement'] as const)(
    '%s during actual source read is refused by source/pre-commit cutoff with zero effects',
    async (kind) => {
      const f = await positiveFixture();
      f.sourceHooks.afterRead = async () => {
        await f.db.exec(
          kind === 'revocation'
            ? "update world_v2.current_commit_authorization set active=false where capability='CAPTAIN_CABINET'"
            : kind === 'head'
              ? 'update world_v2.world_head set world_version=1,event_sequence=1'
              : 'update world_v2.projection_entitlement set active=false,revoked_at=now()',
        );
      };
      expect(await f.call()).toMatchObject({
        httpStatus: kind === 'head' ? 409 : 403,
        body: {
          ok: false,
          error: {
            code: kind === 'head' ? 'VERSION_MISMATCH' : 'AUTHORIZATION_DENIED',
          },
        },
      });
      expect(await f.counts()).toMatchObject({
        command_submission: 0,
        command_queue: 0,
        authoritative_event: 0,
        command_receipt: 0,
      });
    },
  );
  it('different intent or identity cannot reuse stored canonical fingerprint', async () => {
    const f = await positiveFixture();
    expect((await f.call()).body.ok).toBe(true);
    for (const request of [
      { ...f.request, commandId: 'COMMAND_OTHER' },
      {
        ...f.request,
        payload: {
          ...(f.request.payload as object),
          amount: { amount: '1', unit: 'political_capital' },
        },
      },
    ])
      expect(await f.call(request)).toMatchObject({
        httpStatus: 409,
        body: { ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } },
      });
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
    });
  });
  it('queue insert failure rolls back the actual command insert in the same transaction', async () => {
    const f = await positiveFixture();
    await f.db.exec('reset role');
    await f.db
      .exec(`create function g_test_only_queue_failure() returns trigger language plpgsql as $$begin raise exception 'TEST_ONLY_QUEUE_INSERT_FAILED';end;$$;
      create trigger g_test_only_queue_failure before insert on world_v2.command_queue for each row execute function g_test_only_queue_failure();`);
    expect(await f.call()).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'UPSTREAM_UNAVAILABLE' } },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
      authoritative_event: 0,
    });
  });
  it('lost actual local COMMIT acknowledgement reports UNKNOWN and never blindly replays writes', async () => {
    const f = await positiveFixture();
    f.hooks.loseCommit = true;
    expect(await f.call()).toMatchObject({
      httpStatus: 503,
      body: {
        ok: false,
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      },
    });
    expect(
      f.queries.filter((q) =>
        q.sql.startsWith('insert into world_v2.command_submission'),
      ),
    ).toHaveLength(1);
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
    });
    f.hooks.loseCommit = false;
    expect(await f.call()).toMatchObject({
      httpStatus: 200,
      body: { ok: true, state: { source: 'EXISTING', submitted: false } },
    });
    expect(
      f.queries.filter((q) =>
        q.sql.startsWith('insert into world_v2.command_submission'),
      ),
    ).toHaveLength(1);
  });
  it('production environment is still rejected by the actual sole consumer construction', async () => {
    const f = await positiveFixture();
    expect(() =>
      createManualOfficeIntakeRuntime({
        intakePool: f.config.writerPool,
        workerDatabase: {} as SqlDatabase,
        worldId: f.request.worldId,
        workerId: 'WORKER_TEST_ONLY',
        clock: f.config.clock,
        environment: { ECONMIND_ENV: 'production' },
        sha256Hex: sha,
        readers: {},
      }),
    ).toThrow(/local\/CI only/u);
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
    });
  });
  it('real constructed consumer with no source still returns SOURCE_RUNTIME_UNAVAILABLE without lock/write privileges', async () => {
    const f = await positiveFixture();
    await f.admin(
      `revoke update on world_v2.command_submission,world_v2.world_head from ${INTAKE}`,
    );
    const runtime = f.construct({});
    const service = createAuthenticatedOfficeCommandService({
      ...f.config,
      runtime,
    });
    expect(
      await service.handle({
        authorization: `Bearer ${f.token()}`,
        request: f.envelope(f.request),
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' } },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
    });
  });
  it('rollback acknowledgement loss after actual write cannot become a definite semantic rejection', async () => {
    const f = await positiveFixture();
    f.hooks.beforeSql = async (sql) => {
      if (sql.startsWith('insert into world_v2.command_queue'))
        throw new Error('TEST_ONLY_QUEUE_QUERY_FAILURE');
    };
    f.hooks.loseRollback = true;
    expect(await f.call()).toMatchObject({
      httpStatus: 503,
      body: {
        ok: false,
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
    });
  });
  it('current manual revocation still denies an exact historical retry', async () => {
    const f = await positiveFixture();
    expect((await f.call()).body.ok).toBe(true);
    await f.admin(
      "update world_v2.current_commit_authorization set active=false where capability='CAPTAIN_CABINET'",
    );
    expect(await f.call()).toMatchObject({
      httpStatus: 403,
      body: { ok: false, error: { code: 'AUTHORIZATION_DENIED' } },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
    });
  });
  it('consumer stopped during actual source preflight remains SOURCE_RUNTIME_UNAVAILABLE before writes', async () => {
    const f = await positiveFixture();
    f.sourceHooks.afterRead = async () => {
      await f.runtime.consumer.stop();
    };
    expect(await f.call()).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' } },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
    });
  });
  it('actual source event sequence must match the durable head', async () => {
    const f = await positiveFixture();
    await f.admin('update world_v2.world_head set event_sequence=1');
    expect(await f.call()).toMatchObject({
      httpStatus: 409,
      body: { ok: false, error: { code: 'VERSION_MISMATCH' } },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 0,
      command_queue: 0,
    });
  });
});
