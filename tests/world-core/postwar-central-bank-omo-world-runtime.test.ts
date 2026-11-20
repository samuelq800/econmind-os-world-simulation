/** Actual Root Atomic commands under two real independent TEST_ONLY country
 * sources. This is an embedded SQL test, not a native PG/HTTP/production claim. */
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createPostwarCentralBankWorldAtomicFixture } from '../support/postwar-central-bank-world-atomic-fixture.js';
import {
  isPostwarCentralBankOmoRuntime,
  isPostwarCentralBankOmoSourceCommitProtectionPort,
} from '../../apps/world-worker/src/persistence/postwar-central-bank-omo-runtime.js';
import {
  CB_ATOMIC_TEST_AT as at,
  cbAtomicTestSha as sha,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type { Pool } from 'pg';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createPostwarCentralBankOmoWorldRuntime } from '../../apps/world-worker/src/persistence/postwar-central-bank-omo-world-runtime.js';

/** Real PostgresSqlDatabase begin/commit/rollback/error wrapping over the
 * existing actual embedded SQL fixture. This is not a native pg transport. */
function postgresTransport(
  f: Awaited<ReturnType<typeof createPostwarCentralBankWorldAtomicFixture>>,
) {
  let failure:
    'NONE' | 'ROLLBACK' | 'COMMIT' | 'PERMISSION' | 'CONNECTION' | 'RESTORE' =
    'NONE';
  const headers: string[] = [];
  const releases: (Error | undefined)[] = [];
  const fault = new Error('TEST_ONLY transport failure');
  const permission = Object.assign(new Error('TEST_ONLY forbidden header'), {
    code: '42501',
  });
  const client = {
    async query(sql: string, parameters: unknown[] = []) {
      if (sql === 'begin') {
        await f.db.exec(
          'begin isolation level repeatable read;set local role cb_omo_atomic_test_worker',
        );
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('lock_central_bank_omo_startup_header')) {
        headers.push(String(parameters[1]));
        if (failure === 'PERMISSION') throw permission;
        if (failure === 'CONNECTION') throw fault;
      }
      if (
        sql === 'rollback to savepoint cb_omo_source_scope' &&
        failure === 'RESTORE'
      )
        throw fault;
      const result = await f.db.query(sql, parameters);
      if (
        (sql === 'commit' && failure === 'COMMIT') ||
        (sql === 'rollback' && failure === 'ROLLBACK')
      )
        throw fault;
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    release(error?: Error) {
      releases.push(error);
    },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return {
    database: new PostgresSqlDatabase(pool),
    headers,
    releases,
    fault,
    permission,
    setFailure(value: typeof failure) {
      failure = value;
    },
  };
}

function wrappedRuntime(
  f: Awaited<ReturnType<typeof createPostwarCentralBankWorldAtomicFixture>>,
  transport: ReturnType<typeof postgresTransport>,
  countries: readonly string[],
) {
  return createPostwarCentralBankOmoWorldRuntime({
    database: transport.database,
    worldId: f.seed.worldId,
    workerId: 'WORKER_TEST_ONLY_CB1',
    workerRole: 'cb_omo_atomic_test_worker',
    mode: 'TEST_ONLY_LOCAL',
    countryIds: countries,
    clock: f.clock,
    workerPool: {
      connect: async () => {
        throw Error('UNUSED_POOL');
      },
    } as Pick<Pool, 'connect'>,
  });
}
function reCountry(c: C.CanonicalCommand, country: string) {
  return C.parseCanonicalCommand(
    {
      schemaVersion: c.schemaVersion,
      worldId: c.worldId,
      countryId: country,
      commandId: c.commandId + '_SCOPE',
      idempotencyKey: c.idempotencyKey + '_SCOPE',
      expectedWorldVersion: c.expectedWorldVersion,
      actorId: c.actorId,
      authSubject: c.authSubject,
      officeId: c.officeId,
      commandType: c.commandType,
      correlationId: c.correlationId,
      simTime: c.simTime.toCanonicalValue(),
      submittedAtReal: c.submittedAtReal,
      payload: JSON.parse(c.canonicalPayload),
    },
    sha,
  );
}
describe('genuine finite World CB runtime country selection and current Atomic cutoff', () => {
  it('preserves C1/C2 bound and C3 missing through actual Postgres transaction wrapping without writes or false binding', async () => {
    const f = await createPostwarCentralBankWorldAtomicFixture();
    const transport = postgresTransport(f);
    const runtime = wrappedRuntime(f, transport, [
      'COUNTRY_01',
      'COUNTRY_02',
      'COUNTRY_03',
    ]);
    try {
      const before = await f.db.query('select * from world_v2.world_head');
      await expect(runtime.prepare(f.seed)).resolves.toBeUndefined();
      expect(transport.headers).toEqual([
        'COUNTRY_01',
        'COUNTRY_02',
        'COUNTRY_03',
      ]);
      await runtime.preflight(f.command, at);
      // The successfully bound country does not re-run startup binding.
      expect(transport.headers.filter((x) => x === 'COUNTRY_01')).toHaveLength(
        1,
      );
      for (let n = 0; n < 2; n++) {
        await expect(
          runtime.preflight(reCountry(f.command, 'COUNTRY_03'), at),
        ).rejects.toMatchObject({
          missing: ['CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED'],
        });
      }
      expect(transport.headers.filter((x) => x === 'COUNTRY_03')).toHaveLength(
        3,
      );
      expect(
        (await f.db.query('select * from world_v2.world_head')).rows,
      ).toEqual(before.rows);
      expect(
        (
          await f.db.query(
            'select count(*)::int as count from world_v2.authoritative_event',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(transport.releases).toHaveLength(6);
      expect(
        transport.releases
          .filter((error) => error !== undefined)
          .every(
            (e) =>
              e instanceof PostgresTransactionError &&
              e.outcome === 'ROLLED_BACK',
          ),
      ).toBe(true);
    } finally {
      await runtime.close();
      await f.runtime.close();
      await f.db.close();
    }
  });

  it('does not classify permissions, connection, scope restoration or uncertain rollback/commit as source missing', async () => {
    const f = await createPostwarCentralBankWorldAtomicFixture();
    const transport = postgresTransport(f);
    try {
      for (const [failure, country, outcome] of [
        ['ROLLBACK', 'COUNTRY_03', 'ROLLBACK_UNCONFIRMED'],
        ['COMMIT', 'COUNTRY_01', 'COMMIT_OUTCOME_UNKNOWN'],
        ['PERMISSION', 'COUNTRY_01', 'ROLLED_BACK'],
        ['CONNECTION', 'COUNTRY_01', 'ROLLED_BACK'],
        ['RESTORE', 'COUNTRY_03', 'ROLLED_BACK'],
      ] as const) {
        const runtime = wrappedRuntime(f, transport, [country]);
        transport.setFailure(failure);
        try {
          const error = await runtime.prepare(f.seed).catch((e: unknown) => e);
          expect(error).toBeInstanceOf(PostgresTransactionError);
          expect(error).toMatchObject({ outcome });
          expect(error).not.toHaveProperty('missing');
          if (failure === 'PERMISSION')
            expect((error as PostgresTransactionError).cause).toBe(
              transport.permission,
            );
          if (failure === 'CONNECTION')
            expect((error as PostgresTransactionError).cause).toBe(
              transport.fault,
            );
          if (failure === 'RESTORE')
            expect((error as PostgresTransactionError).cause).toBeInstanceOf(
              AggregateError,
            );
          // Failed/uncertain startup never installs the opening. A new use
          // must repeat the actual header RPC, including after COMMIT unknown.
          transport.setFailure('PERMISSION');
          const reads = transport.headers.length;
          await expect(
            runtime.preflight(reCountry(f.command, country), at),
          ).rejects.toMatchObject({
            outcome: 'ROLLED_BACK',
            cause: transport.permission,
          });
          expect(transport.headers).toHaveLength(reads + 1);
        } finally {
          await runtime.close();
        }
      }
      expect(
        (
          await f.db.query(
            'select world_version::text as version from world_v2.world_head',
          )
        ).rows,
      ).toEqual([{ version: '0' }]);
      expect(
        (
          await f.db.query(
            'select count(*)::int as count from world_v2.authoritative_event',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await f.runtime.close();
      await f.db.close();
    }
  });
  it('commits country 01 then country 02 in one global prefix, refuses missing/unbound countries and recovers FINAL after revocation without duplicates', async () => {
    const f = await createPostwarCentralBankWorldAtomicFixture();
    try {
      expect(isPostwarCentralBankOmoRuntime(f.runtime)).toBe(true);
      expect(isPostwarCentralBankOmoRuntime({ ...f.runtime })).toBe(false);
      expect(
        isPostwarCentralBankOmoSourceCommitProtectionPort(
          f.runtime.sourceCommitProtectionPort,
        ),
      ).toBe(true);
      expect(
        isPostwarCentralBankOmoSourceCommitProtectionPort({
          ...f.runtime.sourceCommitProtectionPort,
        }),
      ).toBe(false);
      expect(f.runtime.clock).toBe(f.clock);
      expect(f.runtime.countryIds).toEqual([
        'COUNTRY_01',
        'COUNTRY_02',
        'COUNTRY_03',
      ]);
      expect(
        (
          await f.database.transaction((tx) =>
            tx.query(
              "select has_any_column_privilege(current_user,'world_v2.current_commit_authorization','UPDATE')as auth_update,has_any_column_privilege(current_user,'world_v2.projection_entitlement','UPDATE')as entitlement_update,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed",
            ),
          )
        ).rows,
      ).toEqual([
        { auth_update: false, entitlement_update: false, raw_seed: false },
      ]);
      const count = async () =>
        (
          await f.db.query<{
            version: string;
            sequence: string;
            events: number;
            batches: number;
            receipts: number;
            commands: number;
            audit: number;
          }>(
            `select world_version::text as version,event_sequence::text as sequence,(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.financial_posting_batch)as batches,(select count(*)::int from world_v2.command_receipt)as receipts,(select count(*)::int from world_v2.command_submission)as commands,(select count(*)::int from world_v2.authoritative_commit_authorization)as audit from world_v2.world_head`,
          )
        ).rows[0]!;
      const empty = await count();
      await expect(
        f.runtime.preflight(reCountry(f.command, 'COUNTRY_03'), at),
      ).rejects.toMatchObject({
        missing: ['CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED'],
      });
      const reads = f.queries.length;
      await expect(
        f.runtime.preflight(reCountry(f.command, 'COUNTRY_70'), at),
      ).rejects.toMatchObject({ missing: ['COUNTRY_NOT_BOUND_TO_CB_RUNTIME'] });
      expect(f.queries).toHaveLength(reads);
      expect(await count()).toEqual(empty);
      const first = await f.execution.executeQueuedCommand(f.input);
      expect(first.source).toBe('NEW_FINAL');
      expect(first.receipt.outcome).toBe('COMMITTED');
      await f.enqueueSecond();
      await f.runtime.preflight(f.second.command, at);
      const second = await f.execution.executeQueuedCommand(f.secondInput);
      expect(second.source).toBe('NEW_FINAL');
      expect(second.receipt.outcome).toBe('COMMITTED');
      const after = await count();
      expect(after).toEqual({
        version: '2',
        sequence: '2',
        events: 2,
        batches: 2,
        receipts: 2,
        commands: 2,
        audit: 2,
      });
      expect(
        f.queries.some((sql) =>
          sql.includes('lock_postwar_central_bank_current_authorization'),
        ),
      ).toBe(true);
      const rebuilt = await new DurableV08LedgerLineageReader({
        database: f.admin,
        sha256Hex: sha,
      }).rebuild(f.seed.worldId);
      for (const original of [
        f.original,
        { bankAccounts: f.second.facts.bankAccounts },
      ])
        expect(
          rebuilt.financial.positions
            .find(
              (p) =>
                p.account.accountId ===
                original.bankAccounts.reservesAtCentralBank,
            )
            ?.netDebitBalance.toCanonicalValue(),
        ).toEqual({ amount: '101.25', currency: 'GBP' });
      await f.revoke('SOURCE');
      await expect(f.runtime.preflight(f.command, at)).rejects.toMatchObject({
        missing: ['CB_OMO_SOURCE_REVOKED'],
      });
      expect((await f.execution.executeQueuedCommand(f.input)).source).toBe(
        'EXISTING_FINAL',
      );
      expect(
        (await f.execution.executeQueuedCommand(f.secondInput)).source,
      ).toBe('EXISTING_FINAL');
      expect(await count()).toEqual(after);
      await f.runtime.close();
      await expect(
        f.runtime.preflight(f.second.command, at),
      ).rejects.toMatchObject({ missing: ['WORLD_CB_SOURCE_RETIRED'] });
      expect(
        (await f.execution.executeQueuedCommand(f.secondInput)).source,
      ).toBe('EXISTING_FINAL');
      expect(await count()).toEqual(after);
    } finally {
      await f.runtime.close();
      await f.db.close();
    }
  });
});
