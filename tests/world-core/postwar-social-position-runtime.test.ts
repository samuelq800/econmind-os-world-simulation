/** Protocol boundaries only; actual source/native operation is separately run. */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  parseCanonicalCommand,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  type CommitAuthorizationProof,
} from '@econmind/core';
import {
  createPostwarSocialPositionRuntime,
  isPostwarSocialPositionSourceCommitProtectionPort,
  createPostwarSocialSourceRoleScope,
  createPostwarSocialPositionRuntimeDatabase,
  SOCIAL_POSITION_SOURCE_PURPOSE,
  type SocialPositionSourceCommitRequest,
} from '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const command = parseCanonicalCommand(
  {
    schemaVersion: 'command-v1',
    commandId: 'COMMAND_BOUNDARY_TEST',
    commandType: SOCIAL_POSITION_OFFER_CREATE_COMMAND,
    actorId: 'ACTOR_BOUNDARY_TEST',
    authSubject: '11111111-1111-4111-8111-111111111111',
    correlationId: 'CORRELATION_BOUNDARY_TEST',
    worldId: 'WORLD_BOUNDARY_TEST',
    countryId: 'COUNTRY_01',
    officeId: 'SOCIAL',
    expectedWorldVersion: '0',
    idempotencyKey: 'IDEM_BOUNDARY_TEST',
    simTime: '1000',
    submittedAtReal: '2026-10-28T00:00:00.000Z',
    payload: {
      schemaVersion: 'social-employment-position-offer-create-v1',
      positionId: 'POSITION_NEW_TEST',
      locationId: 'REGION_01_E1',
      skill: 'LOW',
      publicService: 'PUBLIC_SAFETY',
      occupation: 'GENERAL',
      requiredCount: '1',
      wageScheduleRef: 'POSITION_ACTUAL_SOURCE',
      fundingAccountId: 'ACCOUNT_ACTUAL_SOURCE',
      coverageDays: '1',
    },
  },
  (s) => createHash('sha256').update(s).digest('hex'),
);
function database(failure?: Error) {
  const queries: string[] = [];
  const tx: SqlExecutor = {
    async query(sql) {
      queries.push(sql);
      if (failure) throw failure;
      return { rows: [], rowCount: 0 };
    },
  };
  const db: SqlDatabase = {
    query: tx.query,
    transaction: async (consume) => consume(tx),
  };
  return { queries, tx, db };
}
describe('fixed funded position source runtime boundaries', () => {
  it('recognizes only the actually constructed source port identity, not copied or wrapped callbacks', () => {
    const f = database(),
      runtime = createPostwarSocialPositionRuntime({
        database: f.db,
        workerId: 'WORKER_TEST',
        workerRole: 'fixture_social_writer',
      });
    expect(
      isPostwarSocialPositionSourceCommitProtectionPort(
        runtime.sourceCommitProtectionPort,
      ),
    ).toBe(true);
    expect(
      isPostwarSocialPositionSourceCommitProtectionPort({
        ...runtime.sourceCommitProtectionPort,
      }),
    ).toBe(false);
    expect(
      isPostwarSocialPositionSourceCommitProtectionPort({
        assertCurrentFrom: runtime.sourceCommitProtectionPort.assertCurrentFrom,
      }),
    ).toBe(false);
  });
  it('delegates only both exact guard statements and returns the actual SQL results unchanged', async () => {
    const statements: { sql: string; args: readonly unknown[] }[] = [];
    let role = 'fixture_social_writer';
    const original = { rowCount: 0, rows: [] };
    const tx: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        statements.push({ sql, args });
        if (sql.startsWith('set local role ')) {
          role = sql.slice('set local role '.length);
          return { rowCount: 0, rows: [] };
        }
        if (sql.startsWith('select current_user as role_name'))
          return {
            rowCount: 1,
            rows: [
              {
                role_name: role,
                rolsuper: false,
                rolbypassrls: false,
                rolcreaterole: false,
                rolcreatedb: false,
                rolreplication: false,
                source_member: true,
                owner_member: false,
                publisher_member: false,
              },
            ] as unknown as Row[],
          };
        return original;
      },
    };
    const db = createPostwarSocialPositionRuntimeDatabase(
      { query: tx.query, transaction: async (consume) => consume(tx) },
      { workerRole: 'fixture_social_writer' },
    );
    await db.transaction(async (scoped) => {
      const args = [
        'WORLD_TEST',
        '11111111-1111-4111-8111-111111111111',
        'COUNTRY_01',
        'SOCIAL',
        'SOCIAL_LABOUR',
      ];
      expect(
        await scoped.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, args),
      ).toBe(original);
      expect(
        await scoped.query(
          WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
          args.slice(0, 4),
        ),
      ).toBe(original);
      expect(await scoped.query('select unrelated_marker', ['x'])).toBe(
        original,
      );
      await expect(
        scoped.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, args.slice(0, 3)),
      ).rejects.toThrow('parameters differ');
    });
    expect(role).toBe('fixture_social_writer');
    expect(
      statements.filter((s) =>
        s.sql.includes('from world_v2.lock_social_operating_'),
      ),
    ).toEqual([
      {
        sql: 'select auth_subject,world_id,country_id,office_id,capability,team_id,authorization_version from world_v2.lock_social_operating_current_authorization($1,$2,$3::uuid,$4,$5)',
        args: [
          'WORLD_TEST',
          'COUNTRY_01',
          '11111111-1111-4111-8111-111111111111',
          'SOCIAL',
          'SOCIAL_LABOUR',
        ],
      },
      {
        sql: 'select 1 from world_v2.lock_social_operating_active_office($1,$2,$3::uuid,$4)',
        args: [
          'WORLD_TEST',
          'COUNTRY_01',
          '11111111-1111-4111-8111-111111111111',
          'SOCIAL',
        ],
      },
    ]);
  });

  it('delegates only the source read scope and restores the actual writer on success and failure', async () => {
    const writer = 'fixture_social_writer';
    let current = writer;
    const statements: string[] = [];
    const tx: SqlExecutor = {
      async query<Row extends object>(sql: string) {
        statements.push(sql);
        if (sql.startsWith('set local role ')) {
          current = sql.slice('set local role '.length);
          return { rows: [], rowCount: 0 };
        }
        return {
          rowCount: 1,
          rows: [
            {
              role_name: current,
              rolsuper: false,
              rolbypassrls: false,
              rolcreaterole: false,
              rolcreatedb: false,
              rolreplication: false,
              source_member: true,
              owner_member: false,
              publisher_member: false,
            },
          ] as unknown as Row[],
        };
      },
    };
    const scope = createPostwarSocialSourceRoleScope({ workerRole: writer });
    expect(
      await scope.withSourceReaderFrom(tx, async () => {
        expect(current).toBe('world_v2_social_source_reader');
        return 'read';
      }),
    ).toBe('read');
    expect(current).toBe(writer);
    const failure = Error('source rejected');
    await expect(
      scope.withSourceReaderFrom(tx, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(current).toBe(writer);
    expect(statements.filter((q) => q.startsWith('set local role '))).toEqual([
      'set local role world_v2_social_source_reader',
      `set local role ${writer}`,
      'set local role world_v2_social_source_reader',
      `set local role ${writer}`,
    ]);
  });
  it('does not delegate a privileged or nonmember role or accept a source reader as writer', async () => {
    expect(() =>
      createPostwarSocialSourceRoleScope({
        workerRole: 'world_v2_social_source_reader',
      }),
    ).toThrow('separated fixed worker role');
    const scope = createPostwarSocialSourceRoleScope({
      workerRole: 'fixture_social_writer',
    });
    const tx: SqlExecutor = {
      async query<Row extends object>() {
        return {
          rowCount: 1,
          rows: [
            {
              role_name: 'fixture_social_writer',
              rolsuper: true,
              rolbypassrls: false,
              rolcreaterole: false,
              rolcreatedb: false,
              rolreplication: false,
              source_member: true,
              owner_member: false,
              publisher_member: false,
            },
          ] as unknown as Row[],
        };
      },
    };
    let used = false;
    await expect(
      scope.withSourceReaderFrom(tx, async () => {
        used = true;
      }),
    ).rejects.toThrow('actual separated worker');
    expect(used).toBe(false);
  });

  it('selects stable isolation before the first caller query and retains writer role', async () => {
    const f = database(),
      db = createPostwarSocialPositionRuntimeDatabase(f.db, {
        workerRole: 'fixture_social_writer',
      });
    expect(
      await db.transaction(async (tx) => {
        await tx.query('select test_only_marker');
        return 'consumed';
      }),
    ).toBe('consumed');
    expect(f.queries).toEqual([
      'set transaction isolation level repeatable read',
      'select test_only_marker',
    ]);
  });
  it('does not hide a role/isolation setup failure or enter the consumer', async () => {
    const denied = Error('permission denied SET ROLE'),
      f = database(denied);
    let consumed = false;
    await expect(
      createPostwarSocialPositionRuntimeDatabase(f.db, {
        workerRole: 'fixture_social_writer',
      }).transaction(async () => {
        consumed = true;
      }),
    ).rejects.toBe(denied);
    expect(consumed).toBe(false);
    expect(f.queries).toHaveLength(1);
  });
  it('pre-claim checks propagate source failures without claiming a queue or acquiring a lease', async () => {
    const failure = Error('actual source unavailable');
    const f = database(failure);
    const runtime = createPostwarSocialPositionRuntime({
      database: f.db,
      workerId: 'WORKER_TEST',
      workerRole: 'fixture_social_writer',
    });
    await expect(
      runtime.assertSourceBeforeClaim({
        command,
        observedAtReal: '2026-10-28T00:00:00.000Z',
      }),
    ).rejects.toBe(failure);
    expect(f.queries).toHaveLength(1);
    expect(f.queries.join(' ')).not.toMatch(
      /command_queue|acquire_world_writer_lease|insert/i,
    );
    await expect(
      runtime.assertSourceBeforeClaim({
        command,
        observedAtReal: 'not-a-time',
      }),
    ).rejects.toThrow('pre-claim observation');
    expect(f.queries).toHaveLength(1);
  });
  it('refuses null and copied commit proofs before submission or source reads', async () => {
    const f = database(),
      runtime = createPostwarSocialPositionRuntime({
        database: f.db,
        workerId: 'WORKER_TEST',
        workerRole: 'fixture_social_writer',
      });
    for (const commitAuthorization of [null, {} as CommitAuthorizationProof])
      await expect(
        runtime.candidateFactory.prepare({
          command,
          commitAuthorization,
          observedAtReal: '2026-10-28T00:00:00.000Z',
        }),
      ).rejects.toThrow('genuine command-bound');
    expect(f.queries).toHaveLength(0);
  });
  it('does not accept an old PLAN purpose or Ready source binding as funded-position authority', async () => {
    const f = database(),
      runtime = createPostwarSocialPositionRuntime({
        database: f.db,
        workerId: 'WORKER_TEST',
        workerRole: 'fixture_social_writer',
      });
    const request = {
      phase: 'BEFORE_EVENTS',
      purpose: SOCIAL_POSITION_SOURCE_PURPOSE,
      command,
      transition: {},
      currentHead: {
        worldId: command.worldId,
        worldVersion: '0',
        eventSequence: '0',
      },
      observedAtReal: '2026-10-28T00:00:00.000Z',
      readBinding: { ready: true },
      commitAuthorization: { currentlyAuthorized: true },
    } as unknown as SocialPositionSourceCommitRequest;
    await expect(
      runtime.sourceCommitProtectionPort.assertCurrentFrom(f.tx, request),
    ).rejects.toThrow('genuine Social commit proof');
    expect(f.queries).toHaveLength(0);
  });
});
