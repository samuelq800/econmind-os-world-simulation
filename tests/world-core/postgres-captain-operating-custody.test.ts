/** Native embedded-SQL protocol with explicitly TEST_ONLY original/adoption
 * rows. This is not a 70-country issuer, source admission or production proof. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  POLITICAL_CAPITAL_BUCKETS,
  canonicalSerialize,
  createFoundationFact,
  parseCanonicalCommand,
  preparePoliticalCapitalAllocation,
  type FoundationTraceRequest,
  type PoliticalCapitalSnapshot,
} from '@econmind/core';
import {
  createPostgresCaptainOperatingCustody,
  createPostgresCaptainRuntimeSnapshotReader,
} from '../../apps/world-worker/src/persistence/postgres-captain-operating-custody.js';
import type { CaptainOperatingOriginal } from '../../apps/world-worker/src/persistence/captain-operating-source-custody.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_CAPTAIN_NATIVE_TEST',
  country = 'COUNTRY_01',
  worker = 'WORKER_CAPTAIN_NATIVE_TEST';
const now = '2026-10-28T12:00:00.000Z',
  subject = '11111111-1111-4111-8111-111111111111';
const command = parseCanonicalCommand(
  {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    commandId: 'COMMAND_CAPTAIN_NATIVE_TEST',
    commandType: CAPTAIN_POLITICAL_CAPITAL_COMMAND,
    actorId: 'ACTOR_CAPTAIN_NATIVE_TEST',
    authSubject: subject,
    correlationId: 'CORRELATION_CAPTAIN_NATIVE_TEST',
    worldId: world,
    countryId: country,
    officeId: 'CAPTAIN',
    expectedWorldVersion: '0',
    idempotencyKey: 'IDEM_CAPTAIN_NATIVE_TEST',
    simTime: '1000',
    submittedAtReal: now,
    payload: {
      schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
      fromBucket: 'FISCAL_REFORM',
      toBucket: 'INDUSTRIAL_STRATEGY',
      amount: { amount: '2', unit: 'political_capital' },
      reasonFactRef: 'REASON_NATIVE_TEST',
    },
  },
  sha,
);
const request = {
  purpose: 'CAPTAIN_OPERATING_SOURCE_READ_V1' as const,
  command,
  observedAtReal: now,
};
function original(factRef: string, payload: unknown): CaptainOperatingOriginal {
  const canonicalPayload = canonicalSerialize(payload);
  return {
    recordId: factRef,
    revision: 'TEST_REV_1',
    factRef,
    sourceRef: 'SOURCE_TEST_ONLY',
    predecessorFactRefs: ['TEST_ONLY_PARENT'],
    issuerRef: 'TEST_ONLY_ISSUER',
    custodianRef: 'TEST_ONLY_CUSTODIAN',
    admissionRef: 'TEST_ONLY_ORIGINAL_ADMISSION',
    admissionRevision: 'TEST_ONLY_REV_1',
    sourceClass: 'TEST_ONLY',
    effectiveFromSimTime: '0',
    effectiveUntilSimTime: null,
    revokedByRevision: null,
    canonicalPayload,
    payloadSHA256: sha(canonicalPayload),
  };
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`create schema world_v2;
    create table world_v2.opening_seed(world_id text,seed_fingerprint text,unique(world_id,seed_fingerprint));
    create table world_v2.world_writer_lease(world_id text primary key,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
    create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_version text,capability text,active boolean);
    create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;`);
  await db.exec(
    await readFile(
      new URL(
        '../../database/proposals/captain-operating-custody.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.query('insert into world_v2.opening_seed values($1,$2)', [
    world,
    `sha256:${'1'.repeat(64)}`,
  ]);
  await db.query(
    'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
    [world, worker, now, '2026-10-28T12:01:00.000Z'],
  );
  await db.query(
    "insert into world_v2.current_commit_authorization values($1,$2,$3,'CAPTAIN','TEAM_NATIVE_TEST','REV_NATIVE_TEST','CAPTAIN_CABINET',true)",
    [world, subject, country],
  );
  const executor: SqlExecutor = {
    async query<Row extends object>(
      sql: string,
      args: readonly unknown[] = [],
    ) {
      const r = await db.query<Row>(sql, [...args]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  const run = async <T>(op: (tx: SqlExecutor) => Promise<T>) => {
    await db.exec(
      'begin isolation level repeatable read;set local role world_v2_captain_source_reader',
    );
    try {
      const r = await op(executor);
      await db.exec('commit');
      return r;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
  };
  const database: SqlDatabase = { ...executor, transaction: run };
  const custody = createPostgresCaptainOperatingCustody({
    workerId: worker,
    mode: 'TEST_ONLY_LOCAL',
  });
  const insert = async () => {
    await db.query(
      'insert into world_v2.captain_operating_source_adoption values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'ADOPTION_TEST_ONLY',
        world,
        country,
        `sha256:${'1'.repeat(64)}`,
        'TEST_ONLY_ISSUER',
        'TEST_ONLY_CUSTODIAN',
        'TEST_ONLY_ORIGINAL_ADMISSION',
        'TEST_ONLY_REV_1',
        sha('TEST_ONLY_ADOPTION_NOT_PRODUCTION'),
      ],
    );
    const genesis = original('GENESIS_NATIVE_TEST', {
      schemaVersion: 'captain-operating-genesis-v1',
      worldId: world,
      countryId: country,
      seedId: 'SEED_NATIVE_TEST',
      seedFingerprint: `sha256:${'1'.repeat(64)}`,
      semanticRevision: 'TEST_ONLY_CAPITAL_V1',
      capital: {
        capitalRef: 'CAPITAL_TEST_ONLY',
        countryRef: country,
        opening: { amount: '42', unit: 'political_capital' },
        generated: { amount: '0', unit: 'political_capital' },
        total: { amount: '42', unit: 'political_capital' },
        available: { amount: '42', unit: 'political_capital' },
        spent: { amount: '0', unit: 'political_capital' },
        closing: { amount: '42', unit: 'political_capital' },
        buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket) => ({
          bucket,
          balance: { amount: '6', unit: 'political_capital' },
        })),
      },
    });
    const reason = original('REASON_NATIVE_TEST', {
      schemaVersion: 'captain-operating-reason-v1',
      worldId: world,
      countryId: country,
      reason: {
        countryRef: country,
        recordRef: 'CABINET_TEST_ONLY',
        reason: 'Independent TEST_ONLY original.',
      },
    });
    for (const [kind, record] of [
      ['GENESIS', genesis],
      ['REASON', reason],
    ] as const) {
      const bytes = canonicalSerialize(record);
      await db.query(
        'insert into world_v2.captain_operating_original values($1,$2,$3,$4,$5)',
        ['ADOPTION_TEST_ONLY', kind, record.factRef, bytes, sha(bytes)],
      );
    }
    return { genesis, reason };
  };
  return { db, run, executor, database, custody, insert };
}
describe('native Captain original custody, independent of opening-source hashes', () => {
  it('composes with the existing runtime reader and reports absent originals rather than zero capital', async () => {
    const f = await fixture();
    try {
      const composed = createPostgresCaptainRuntimeSnapshotReader({
        database: f.database,
        workerId: worker,
        mode: 'OFFICIAL_RUNTIME',
      });
      expect(
        await composed.reader.readCanonical!(
          {
            worldId: command.worldId,
            countryId: command.countryId!,
            commandId: command.commandId,
            commandFingerprint: command.fingerprint,
            expectedWorldVersion: '0',
            simTime: command.simTime.toCanonicalValue(),
            reasonFactRef: 'REASON_NATIVE_TEST',
            observedAtReal: now,
          },
          command,
        ),
      ).toEqual({
        kind: 'MISSING',
        missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE', 'REASON_RECORD'],
      });
      expect(
        await f.run((tx) =>
          f.custody.withProtectedAdmittedOriginalsFrom(
            tx,
            request,
            async (r) => r,
          ),
        ),
      ).toEqual({
        kind: 'MISSING',
        missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE', 'REASON_RECORD'],
      });
      await expect(
        f.run((tx) =>
          tx.query('select * from world_v2.captain_operating_original'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        f.custody.withProtectedAdmittedOriginalsFrom(
          f.executor,
          request,
          async (r) => r,
        ),
      ).rejects.toThrow('separated native reader');
    } finally {
      await f.db.close();
    }
  });
  it('reads exact registered original bytes under the native role and rejects TEST_ONLY as official source', async () => {
    const f = await fixture();
    try {
      const originals = await f.insert();
      const r = await f.run((tx) =>
        f.custody.withProtectedAdmittedOriginalsFrom(
          tx,
          request,
          async (r) => r,
        ),
      );
      expect(r.kind).toBe('ORIGINALS');
      if (r.kind !== 'ORIGINALS') throw Error('EXPECTED_NATIVE_ORIGINAL_ROWS');
      expect(r.genesis).toEqual(originals.genesis);
      expect(r.reason).toEqual(originals.reason);
      expect(r.lease.holderId).toBe(worker);
      expect(Object.isFrozen(r.genesis)).toBe(true);
      const capital = (
        JSON.parse(r.genesis.canonicalPayload) as {
          capital: PoliticalCapitalSnapshot;
        }
      ).capital;
      const trace: FoundationTraceRequest = {
        traceRef: 'TRACE_NATIVE_TEST',
        calculationVersion: 'TEST_ONLY_CAPITAL_V1',
        snapshotAt: { amount: '1000', unit: 'sim_millisecond' },
        snapshot: {
          lineageRef: world,
          sourceVersion: 'TEST_ONLY_V1',
          snapshotRef: 'SNAPSHOT_NATIVE_TEST',
          snapshotHash: 'a'.repeat(64),
          predecessorSnapshotHash: 'b'.repeat(64),
        },
      };
      const effect = preparePoliticalCapitalAllocation({
        trace,
        capitalFact: createFoundationFact({
          trace,
          factRef: r.genesis.factRef,
          sourceRef: r.genesis.sourceRef,
          predecessorFactRefs: r.genesis.predecessorFactRefs,
          payload: capital,
        }),
        requestFact: createFoundationFact({
          trace,
          factRef: 'REQUEST_NATIVE_TEST',
          sourceRef: 'COMMAND_CAPTAIN_NATIVE_TEST',
          predecessorFactRefs: [r.genesis.factRef, r.reason.factRef],
          payload: {
            allocationRef: 'ALLOCATION_NATIVE_TEST',
            countryRef: country,
            fromBucket: 'FISCAL_REFORM' as const,
            toBucket: 'INDUSTRIAL_STRATEGY' as const,
            amount: { amount: '2', unit: 'political_capital' },
            reasonFactRef: r.reason.factRef,
            effectiveAt: trace.snapshotAt,
          },
        }),
      });
      expect(effect.output.capital.total.amount).toBe('42');
      expect(
        effect.output.capital.buckets.find((b) => b.bucket === 'FISCAL_REFORM')
          ?.balance.amount,
      ).toBe('4');
      expect(
        effect.output.capital.buckets.find(
          (b) => b.bucket === 'INDUSTRIAL_STRATEGY',
        )?.balance.amount,
      ).toBe('8');
      const official = createPostgresCaptainOperatingCustody({
        workerId: worker,
        mode: 'OFFICIAL_RUNTIME',
      });
      await expect(
        f.run((tx) =>
          official.withProtectedAdmittedOriginalsFrom(
            tx,
            request,
            async (r) => r,
          ),
        ),
      ).rejects.toThrow('independently registered issuer');
      await f.db.query(
        "insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref)values('ADOPTION_TEST_ONLY','REVOKE_TEST_ONLY')",
      );
      expect(
        await f.run((tx) =>
          f.custody.withProtectedAdmittedOriginalsFrom(
            tx,
            request,
            async (r) => r,
          ),
        ),
      ).toMatchObject({ kind: 'MISSING' });
      await expect(
        f.db.query(
          "update world_v2.captain_operating_source_adoption set admission_revision='REV2'",
        ),
      ).rejects.toThrow('IMMUTABLE_HISTORY');
    } finally {
      await f.db.close();
    }
  });
  it('rejects cross-country/current-role spoofing and expired writer lease at the actual SQL boundary', async () => {
    const f = await fixture();
    try {
      await expect(
        f.run((tx) =>
          tx.query(
            'select * from world_v2.lock_captain_operating_originals($1,$2,$3,$4,$5,$6)',
            [world, 'COUNTRY_02', 'REASON_NATIVE_TEST', worker, now, subject],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await f.db.query(
        'update world_v2.world_writer_lease set lease_expires_at_real=$1',
        [now],
      );
      expect(
        await f.run((tx) =>
          f.custody.withProtectedAdmittedOriginalsFrom(
            tx,
            request,
            async (r) => r,
          ),
        ),
      ).toEqual({ kind: 'MISSING', missing: ['WRITER_LEASE'] });
    } finally {
      await f.db.close();
    }
  });
});
