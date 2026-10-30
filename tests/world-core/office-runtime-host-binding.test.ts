import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { CURRENT_REPLAY_BINDING, parseWorldWriterLease } from '@econmind/core';
import {
  createProductionWorldCommandHost,
  createServerCommandHostBinding,
  boundProductionManualIntakeRuntime,
  preflightProductionManualIntakeRuntime,
  WorkerRequestCompletion,
  type ServerCommandHostDependencies,
} from '../../apps/world-worker/src/runtime-preparation/production-world-command-host.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { fixture } from '../support/g-manual-office-api-test-only-fixture.js';
import {
  captainTestOnlyCommand,
  captainTestOnlySnapshot,
} from '../support/g-dispatch-captain-test-only-fixture.js';

/** Actual disposable SQL/role/admission-consumer mechanism. The reused fixture
 * temporarily bypasses ONLY its own admission publication veto, then restores
 * it. No production source admission, formal Clock or consumer is claimed.
 */
async function setup(admitted = true) {
  const command = captainTestOnlyCommand();
  const f = await fixture(0, admitted, command.worldId);
  f.server.actor = command.actorId;
  f.server.simTime = command.simTime.toCanonicalValue();
  await f.admin('create table host_test_only_source(payload jsonb not null)');
  await f.admin('insert into host_test_only_source values($1::jsonb)', [
    JSON.stringify(captainTestOnlySnapshot()),
  ]);
  const database: SqlDatabase = {
    async query<Row extends object>(
      sql: string,
      values: readonly unknown[] = [],
    ) {
      const result = await f.admin(sql, [...values]);
      return {
        rows: result.rows as Row[],
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    async transaction() {
      throw new Error('NO_TRANSACTION_OR_ECONOMIC_WRITE_IN_PREFLIGHT');
    },
  };
  const sourceRead = vi.fn(async () => {
    const result = await f.admin('select payload from host_test_only_source');
    return {
      kind: 'READ' as const,
      snapshot: result.rows[0]!.payload as ReturnType<
        typeof captainTestOnlySnapshot
      >,
      lease: parseWorldWriterLease({
        schemaVersion: 'world-writer-lease-v1',
        worldId: command.worldId,
        holderId: 'WORKER_TEST_ONLY_HOST',
        fencingToken: '1',
        acquiredAtReal: '2026-10-08T00:00:00.000Z',
        renewedAtReal: '2026-10-08T00:00:00.000Z',
        expiresAtReal: '2026-10-08T00:01:00.000Z',
      }),
    };
  });
  const dependencies: ServerCommandHostDependencies = {
    ...f.config.admittedWorldPins,
    worldId: command.worldId,
    workerId: 'WORKER_TEST_ONLY_HOST',
    modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    intakePool: f.config.writerPool,
    sourcePool: f.config.readPool,
    readerRole: f.config.readerRole,
    authorizationPublisherRole: f.config.authorizationPublisherRole,
    workerDatabase: database,
    clock: Object.freeze(f.config.clock),
    resolveActorId: f.config.resolveActorId,
    readers: { captain: { read: sourceRead } },
  };
  const binding = createServerCommandHostBinding(dependencies);
  const host = createProductionWorldCommandHost(binding);
  const controller = new AbortController();
  const runtime = host.openIntakeRequest({
    route: '/v1/office-command',
    signal: controller.signal,
  })!;
  return {
    f,
    command,
    dependencies,
    binding,
    host,
    runtime,
    controller,
    sourceRead,
    preflight: () =>
      preflightProductionManualIntakeRuntime(
        runtime,
        command,
        f.config.clock.nowReal(),
      ),
  };
}

describe('server-owned Office host dependencies and short-lived request binding', () => {
  it('destroys a late source client after cancellation and retains actual work in the request drain', async () => {
    const s = await setup();
    let acquired: (client: PoolClient) => void = () => undefined;
    const sourcePool = {
      connect: () =>
        new Promise<PoolClient>((resolve) => {
          acquired = resolve;
        }),
    } as Pick<Pool, 'connect'>;
    const host = createProductionWorldCommandHost(
      createServerCommandHostBinding({ ...s.dependencies, sourcePool }),
    );
    const controller = new AbortController();
    const runtime = host.openIntakeRequest({
      route: '/v1/office-command',
      signal: controller.signal,
    })!;
    const completion = new WorkerRequestCompletion();
    const pending = completion.run(() =>
      preflightProductionManualIntakeRuntime(
        runtime,
        s.command,
        s.f.config.clock.nowReal(),
      ),
    );
    controller.abort();
    expect(await pending).toBe(false);
    expect(completion.pending()).toBe(1);
    const release = vi.fn();
    const query = vi.fn();
    acquired({ release, query } as unknown as PoolClient);
    await completion.drain();
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    expect(query).not.toHaveBeenCalled();
    expect(completion.pending()).toBe(0);
    await host.stop();
    await s.host.stop();
  });
  it('uses real SQL admission/seat/current authorization and canonical source preflight positively, without queueing or execution', async () => {
    const s = await setup();
    expect(s.host.diagnostics().status).toBe('COMPOSED_UNMOUNTED');
    expect(
      boundProductionManualIntakeRuntime(s.runtime, {
        pool: s.dependencies.intakePool,
        clock: s.dependencies.clock,
        worldId: s.command.worldId,
      }),
    ).toBe(true);
    expect(await s.preflight()).toBe(true);
    expect(s.sourceRead).toHaveBeenCalledOnce();
    await s.f.noEffects();
    s.host.retireIntakeRequest(s.runtime);
    expect(await s.preflight()).toBe(false);
    await s.host.stop();
  });

  it('refuses missing durable admission before consulting a domain source', async () => {
    const s = await setup(false);
    expect(await s.preflight()).toBe(false);
    expect(s.sourceRead).not.toHaveBeenCalled();
    await s.f.noEffects();
    await s.host.stop();
  });

  it('refuses revoked authority and absent/mismatched actor, without granting from a source callback', async () => {
    const s = await setup();
    s.f.server.actor = null;
    expect(await s.preflight()).toBe(false);
    s.f.server.actor = 'ACTOR_OTHER';
    expect(await s.preflight()).toBe(false);
    s.f.server.actor = s.command.actorId;
    await s.f.admin(
      'update world_v2.current_commit_authorization set active=false',
    );
    expect(await s.preflight()).toBe(false);
    expect(s.sourceRead).not.toHaveBeenCalled();
    await s.host.stop();
  });

  it('refuses a stale source/head and retirement during source work', async () => {
    const s = await setup();
    s.sourceRead.mockImplementationOnce(async () => {
      s.controller.abort();
      return { kind: 'MISSING', missing: ['CURRENT_WORLD_HEAD'] } as never;
    });
    expect(await s.preflight()).toBe(false);
    expect(
      boundProductionManualIntakeRuntime(s.runtime, {
        pool: s.dependencies.intakePool,
        clock: s.dependencies.clock,
        worldId: s.command.worldId,
      }),
    ).toBe(false);
    await s.host.stop();
    const other = await setup();
    await other.f.admin('update world_v2.world_head set world_version=1');
    expect(await other.preflight()).toBe(false);
    expect(other.sourceRead).not.toHaveBeenCalled();
    await other.host.stop();
  });

  it('keeps forged/copied bindings HOLD and binds requests to exact host/pool/clock/World', async () => {
    const s = await setup();
    const fake = createProductionWorldCommandHost({ ...s.binding });
    expect(fake.diagnostics().status).toBe('HOLD');
    expect(
      fake.openIntakeRequest({
        route: '/v1/office-command',
        signal: s.controller.signal,
      }),
    ).toBeNull();
    for (const change of [
      { pool: {} },
      { clock: {} },
      { worldId: 'WORLD_OTHER' },
    ]) {
      expect(
        boundProductionManualIntakeRuntime(s.runtime, {
          pool: s.dependencies.intakePool,
          clock: s.dependencies.clock,
          worldId: s.command.worldId,
          ...change,
        }),
      ).toBe(false);
    }
    expect(
      s.host.openIntakeRequest({
        route: '/v1/financial-intake',
        signal: s.controller.signal,
      }),
    ).toBeNull();
    expect(
      s.host.openIntakeRequest({
        route: '/v1/office-command',
        signal: s.controller.signal,
        admitted: true,
      }),
    ).toBeNull();
    await s.host.stop();
    expect(await s.preflight()).toBe(false);
    await fake.stop();
  });
});
