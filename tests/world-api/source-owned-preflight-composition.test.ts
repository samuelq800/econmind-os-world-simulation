import {
  CURRENT_REPLAY_BINDING,
  parseWorldWriterLease,
  type CanonicalCommand,
} from '@econmind/core';
import {
  createServerCommandHostBinding,
  type ServerCommandHostBinding,
  type ServerCommandHostDependencies,
} from '../../apps/world-worker/dist/runtime-preparation/production-world-command-host-exports.js';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { fixture } from '../support/g-manual-office-api-test-only-fixture.js';
import {
  captainTestOnlyCommand,
  captainTestOnlySnapshot,
} from '../support/g-dispatch-captain-test-only-fixture.js';
import { createSourceOwnedExecutorComposition } from '../../apps/world-api/src/runtime-preparation/source-owned-executor-composition.js';
import { EXECUTOR_PATHS } from '../../apps/world-api/src/runtime-preparation/bounded-executor-transport.js';

const at = '2026-10-08T00:00:00.000Z';
/** Resource-only fixture: there is deliberately no positive SQL/source result.
 * Cancellation must dispose of the actual late client without issuing SQL.
 */
function delayedSourceComposition() {
  const command = captainTestOnlyCommand();
  let acquired: (client: PoolClient) => void = () => undefined;
  const connect = vi.fn(
    () =>
      new Promise<PoolClient>((resolve) => {
        acquired = resolve;
      }),
  );
  const noQuery = async () => {
    throw new Error('NO_SQL_OR_WRITE_EXPECTED');
  };
  const binding = createServerCommandHostBinding({
    worldId: command.worldId,
    workerId: 'WORKER_TEST_ONLY_BRIDGE',
    seedRef: 'SEED_TEST_ONLY',
    contentHash: `sha256:${'a'.repeat(64)}`,
    admissionRef: 'ADMISSION_TEST_ONLY',
    modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    sourcePool: { connect } as unknown as Pick<Pool, 'connect'>,
    intakePool: { connect: noQuery } as unknown as Pick<Pool, 'connect'>,
    readerRole: 'test_bridge_reader',
    authorizationPublisherRole: 'test_bridge_publisher',
    workerDatabase: { query: noQuery, transaction: noQuery },
    clock: Object.freeze({ nowReal: () => at, simTime: async () => '16000' }),
    resolveActorId: async () => null,
    readers: { captain: { read: noQuery } },
  });
  return {
    command,
    connect,
    acquired: (client: PoolClient) => acquired(client),
    composition: createSourceOwnedExecutorComposition(binding),
  };
}

async function actualSqlComposition() {
  const command = captainTestOnlyCommand();
  const f = await fixture(0, true, command.worldId);
  f.server.actor = command.actorId;
  f.server.simTime = command.simTime.toCanonicalValue();
  await f.admin('create table bridge_test_only_source(payload jsonb not null)');
  await f.admin('insert into bridge_test_only_source values($1::jsonb)', [
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
      throw new Error('PREFLIGHT_MUST_NOT_WRITE');
    },
  };
  const dependencies: ServerCommandHostDependencies = {
    ...f.config.admittedWorldPins,
    workerId: 'WORKER_TEST_ONLY_BRIDGE',
    modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    intakePool: f.config.writerPool,
    sourcePool: f.config.readPool,
    readerRole: f.config.readerRole,
    authorizationPublisherRole: f.config.authorizationPublisherRole,
    workerDatabase: database,
    clock: Object.freeze(f.config.clock),
    resolveActorId: f.config.resolveActorId,
    readers: {
      captain: {
        async read() {
          const rows = await f.admin(
            'select payload from bridge_test_only_source',
          );
          return {
            kind: 'READ',
            snapshot: rows.rows[0]!.payload as ReturnType<
              typeof captainTestOnlySnapshot
            >,
            lease: parseWorldWriterLease({
              schemaVersion: 'world-writer-lease-v1',
              worldId: command.worldId,
              holderId: 'WORKER_TEST_ONLY_BRIDGE',
              fencingToken: '1',
              acquiredAtReal: at,
              renewedAtReal: at,
              expiresAtReal: '2026-10-08T00:01:00.000Z',
            }),
          };
        },
      },
    },
  };
  return {
    f,
    command,
    composition: createSourceOwnedExecutorComposition(
      createServerCommandHostBinding(dependencies),
    ),
  };
}

describe('source-owned read preflight and execution are separate', () => {
  const command = {} as CanonicalCommand; // Never inspected without a registered server binding.
  it('keeps missing bindings disconnected before SQL or command processing', async () => {
    const composition = createSourceOwnedExecutorComposition();
    expect(
      await composition.preflightOnly({
        command,
        observedAtReal: '2026-10-28T00:00:00.000Z',
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: 'SOURCE_RUNTIME_UNAVAILABLE', commandQueued: false });
    expect(composition.commandExecutionEnabled).toBe(false);
    const response = await composition.handle(
      new Request(EXECUTOR_PATHS['/v1/office-command']),
    );
    expect(response.status).toBe(503);
    await composition.stop();
  });
  it('does not invoke caller-supplied callbacks or treat structural configuration as authority', async () => {
    let calls = 0;
    const forged = {
      sourcePool: {
        connect() {
          calls++;
        },
      },
      readers: {},
      ready: true,
    } as unknown as ServerCommandHostBinding;
    const composition = createSourceOwnedExecutorComposition(forged);
    expect(
      await composition.preflightOnly({
        command,
        observedAtReal: '2026-10-28T00:00:00.000Z',
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: 'SOURCE_RUNTIME_UNAVAILABLE', commandQueued: false });
    expect(calls).toBe(0);
    expect(composition.commandExecutionEnabled).toBe(false);
    await composition.stop();
  });
  it('reports cancellation before acquiring a runtime', async () => {
    const composition = createSourceOwnedExecutorComposition();
    const controller = new AbortController();
    controller.abort();
    expect(
      await composition.preflightOnly({
        command,
        observedAtReal: '2026-10-28T00:00:00.000Z',
        signal: controller.signal,
      }),
    ).toEqual({ status: 'CANCELLED', commandQueued: false });
    await composition.stop();
  });

  it('performs real SQL and canonical source preflight without enabling the execution handler or writing queue/economic tables', async () => {
    // The disposable fixture supplies explicitly TEST_ONLY admission rows and
    // source originals; this is mechanism evidence, never official admission.
    const s = await actualSqlComposition();
    try {
      expect(
        await s.composition.preflightOnly({
          command: s.command,
          observedAtReal: at,
          signal: new AbortController().signal,
        }),
      ).toEqual({ status: 'SOURCE_PREFLIGHT_PASSED', commandQueued: false });
      expect(s.composition.commandExecutionEnabled).toBe(false);
      expect(
        (
          await s.composition.handle(
            new Request(EXECUTOR_PATHS['/v1/office-command'], {
              method: 'POST',
              body: '{}',
            }),
          )
        ).status,
      ).toBe(503);
      await s.f.noEffects();
    } finally {
      await s.composition.stop();
    }
  });

  it.each(['abort', 'stop'] as const)(
    'waits for late source-client disposal on %s before reporting completion',
    async (mode) => {
      const s = delayedSourceComposition();
      const controller = new AbortController();
      let finished = false;
      const pending = s.composition
        .preflightOnly({
          command: s.command,
          observedAtReal: at,
          signal: controller.signal,
        })
        .then((result) => {
          finished = true;
          return result;
        });
      expect(s.connect).toHaveBeenCalledOnce();
      let stopped = false;
      if (mode === 'abort') controller.abort();
      const stopping = s.composition.stop().then(() => {
        stopped = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(finished).toBe(false);
      expect(stopped).toBe(false);
      const release = vi.fn(),
        query = vi.fn();
      s.acquired({ release, query } as unknown as PoolClient);
      expect(await pending).toEqual({
        status: 'CANCELLED',
        commandQueued: false,
      });
      await stopping;
      expect(release).toHaveBeenCalledExactlyOnceWith(true);
      expect(query).not.toHaveBeenCalled();
      expect(stopped).toBe(true);
      expect(
        await s.composition.preflightOnly({
          command: s.command,
          observedAtReal: at,
          signal: new AbortController().signal,
        }),
      ).toEqual({ status: 'CANCELLED', commandQueued: false });
      await s.composition.stop();
    },
  );

  it('rejects request completion and stop when rollback fails after the abort result won', async () => {
    const s = delayedSourceComposition();
    const controller = new AbortController();
    let rejectRollback: (error: Error) => void = () => undefined;
    let rollbackStarted = false;
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('begin')) return { rows: [], rowCount: 0 };
      if (sql === 'rollback') {
        rollbackStarted = true;
        return new Promise<never>((_resolve, reject) => {
          rejectRollback = reject;
        });
      }
      throw new Error('TEST_ONLY_READ_FAILURE');
    });
    const release = vi.fn();
    const pending = s.composition.preflightOnly({
      command: s.command,
      observedAtReal: at,
      signal: controller.signal,
    });
    // Attach the rejection expectation before completing the controlled race.
    const denied = expect(pending).rejects.toThrow(
      'SOURCE_PREFLIGHT_CLEANUP_UNCONFIRMED',
    );
    s.acquired({ query, release } as unknown as PoolClient);
    await vi.waitFor(() => expect(rollbackStarted).toBe(true));
    controller.abort();
    const stopped = expect(s.composition.stop()).rejects.toThrow(
      'SOURCE_PREFLIGHT_CLEANUP_UNCONFIRMED',
    );
    rejectRollback(new Error('TEST_ONLY_ROLLBACK_ACK_LOSS'));
    await Promise.all([denied, stopped]);
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    await expect(s.composition.stop()).rejects.toThrow(
      'SOURCE_PREFLIGHT_CLEANUP_UNCONFIRMED',
    );
    await expect(
      s.composition.preflightOnly({
        command: s.command,
        observedAtReal: at,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('SOURCE_PREFLIGHT_CLEANUP_UNCONFIRMED');
  });
});
