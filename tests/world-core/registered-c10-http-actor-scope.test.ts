/** Mocked socket boundary only. No SQL is executed or actor/source accepted. */
import { it, expect, vi } from 'vitest';
const observed = vi.hoisted(() => ({
  sql: [] as string[],
  opened: [] as string[],
  closed: 0,
  released: 0,
  failure: Error('TEST_ONLY_STOP_AT_WORKER_HEAD_QUERY'),
}));
vi.mock('pg', () => ({
  Pool: class {
    constructor(input: { user: string }) {
      observed.opened.push(input.user);
    }
    on() {
      return this;
    }
    async connect() {
      return {
        query: async (sql: string) => {
          observed.sql.push(sql);
          if (sql.includes('from world_v2.world_head')) throw observed.failure;
          return { rows: [], rowCount: 0 };
        },
        release: () => {
          observed.released++;
        },
      };
    }
    async end() {
      observed.closed++;
    }
  },
}));
import { prepareRegisteredC10HttpActorFrom } from '../support/registered-c10-http-actor.js';
it('takes the source fence before the snapshot and restores worker for raw head access; no source-reader grants', async () => {
  const old = process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
  process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE = '1';
  try {
    await expect(
      Reflect.apply(prepareRegisteredC10HttpActorFrom, undefined, [
        {
          marker: {
            database: 'postwar_reference_testonly',
            socket: '/tmp/test_only_no_socket',
            port: 5432,
            worldId: 'WORLD_TEST_ONLY_C10_SCOPE',
          },
          clone: {
            database: 'postwar_clone_testonly_c10_scope',
            installer: {
              query: async () => {
                throw Error('NO_ADMIN_METADATA_EXPECTED');
              },
            },
          },
          workerRole: 'test_only_worker',
          actorPublisherRole: 'test_only_actor_publisher',
        },
      ]),
    ).rejects.toBe(observed.failure);
    expect(observed.sql.slice(0, 4)).toEqual([
      'begin isolation level repeatable read',
      'set local role world_v2_industry_source_reader',
      'select world_v2.lock_postwar_source_revocation_fences($1)',
      'set local role "test_only_worker"',
    ]);
    expect(observed.sql[4]).toContain('from world_v2.world_head');
    expect(observed.sql.at(-1)).toBe('rollback');
    expect(observed.opened).toEqual([
      'test_only_worker',
      'test_only_actor_publisher',
    ]);
    expect(observed.closed).toBe(2);
    expect(observed.released).toBe(1);
    expect(
      observed.sql.some((s) =>
        /^(?:grant|insert|update|delete|create)/u.test(s),
      ),
    ).toBe(false);
  } finally {
    if (old === undefined)
      delete process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
    else process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE = old;
  }
});
