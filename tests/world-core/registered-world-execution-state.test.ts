/** Isolated controlled TEST metadata. No production Clock, source signature,
 * permission provisioning, World activation or economic command is fabricated. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  createRegisteredWorldExecutionClock,
  createRegisteredWorldExecutionDatabase,
  parseRegisteredWorldExecutionState,
  readRegisteredWorldExecutionFrom,
  type RegisteredWorldExecutionState,
} from '../../apps/world-worker/src/time/registered-world-execution-state.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_FORMAL_EXECUTION_ISOLATED_TEST',
  worker = 'WORKER_FORMAL_EXECUTION_TEST';
const fp = 'sha256:' + '1'.repeat(64),
  adm = 'ADMISSION_' + '2'.repeat(64);
let db: PGlite;
const query: SqlExecutor['query'] = async <R extends object>(
  q: string,
  p: readonly unknown[] = [],
) => {
  const r = await db.query<R>(q, [...p]);
  return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
};
const database: SqlDatabase = {
  query,
  async transaction<T>(operation: (tx: SqlExecutor) => Promise<T>) {
    await db.exec('begin');
    try {
      const value = await operation({ query });
      await db.exec('commit');
      return value;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
  },
};
const clockText = canonicalSerialize({
  schemaVersion: 'world-clock-original-v1',
  worldId: world,
  seedFingerprint: fp,
  sourceRef: 'CLOCK_ORIGINAL_TEST',
  clockVersion: 'SIMULATION_CLOCK_V1',
  simTime: '3000',
  issuerRef: 'TEST_ONLY_CONTROLLED_ISSUER',
  provenanceRef: 'TEST_ONLY_REVIEWED_CLOCK_NOT_PRODUCTION',
});
const controlText = canonicalSerialize({
  schemaVersion: 'world-execution-control-original-v1',
  worldId: world,
  seedFingerprint: fp,
  sourceRef: 'CONTROL_ORIGINAL_TEST',
  controlMode: 'MANUAL_FINITE',
  soleConsumerRef: 'CONSUMER_TEST',
  workerId: worker,
  consumerRole: 'formal_execution_test_worker',
  validFromReal: '2020-01-01T00:00:00.000Z',
  validUntilReal: '2099-01-01T00:00:00.000Z',
  issuerRef: 'TEST_ONLY_CONTROLLED_ISSUER',
  provenanceRef: 'TEST_ONLY_REVIEWED_CONTROL_NOT_PRODUCTION',
});
const original: RegisteredWorldExecutionState = {
  schemaVersion: 'world-command-execution-registration-v1',
  registrationRef: 'EXECUTION_REGISTRATION_TEST',
  worldId: world,
  workerId: worker,
  seedId: 'SEED_EXECUTION_TEST',
  seedFingerprint: fp,
  admissionRef: adm,
  modelVersion: 'TEST_ONLY_MODEL',
  consumerRole: 'formal_execution_test_worker',
  controlMode: 'MANUAL_FINITE',
  clockSourceRef: 'CLOCK_ORIGINAL_TEST',
  clockSourceSha256: sha(clockText),
  controlSourceRef: 'CONTROL_ORIGINAL_TEST',
  controlSourceSha256: sha(controlText),
  soleConsumerRef: 'CONSUMER_TEST',
  clockVersion: 'SIMULATION_CLOCK_V1',
  simTime: '3000',
  validFromReal: '2020-01-01T00:00:00.000Z',
  validUntilReal: '2099-01-01T00:00:00.000Z',
};
const raw = canonicalSerialize(original);
async function admin() {
  await db.exec('reset role;set session authorization postgres');
}
async function release() {
  await admin();
  await db.exec(
    'set session authorization formal_execution_test_registrar;set role world_v2_admission_release',
  );
}
async function asWorker() {
  await admin();
  await db.exec('set session authorization formal_execution_test_worker');
}
const clock = createRegisteredWorldExecutionClock({
  database,
  worldId: world,
  workerId: worker,
  registrationRef: original.registrationRef,
});
beforeAll(async () => {
  db = new PGlite();
  // The owner/roles/admission are explicit TEST_ONLY prerequisite metadata, not
  // an alternate production source or a private-authority signature shortcut.
  await db.exec(`create schema world_v2;
    create role world_v2_admission_owner nologin nosuperuser nobypassrls;
    create role world_v2_admission_release nologin nosuperuser nobypassrls;
    create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;
    create role world_v2_social_source_reader nologin nosuperuser nobypassrls;
    create role formal_execution_test_worker login nosuperuser nobypassrls;
    create role formal_execution_test_other login nosuperuser nobypassrls;
    create role formal_execution_test_registrar login nosuperuser nobypassrls;
    grant world_v2_admission_release to formal_execution_test_registrar;
    grant world_v2_finance_budget_source_reader to formal_execution_test_worker,formal_execution_test_other;
    grant usage on schema world_v2 to world_v2_admission_owner,world_v2_admission_release,world_v2_finance_budget_source_reader;
    create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
    create table world_v2.world_writer_lease(world_id text,holder_id text,lease_expires_at_real timestamptz);
    create table world_v2.runtime_read_seat(world_id text,auth_subject uuid);
    create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);
    create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
    create table world_v2.runtime_admission_publication_revocation(authorization_id text);
    create table world_v2.authoritative_event(world_id text,sim_time bigint);
    create table world_v2.test_only_finite_effect(value text);
    grant insert on world_v2.test_only_finite_effect to formal_execution_test_worker;
    grant select on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.authoritative_event to world_v2_admission_owner;
    grant update(world_version)on world_v2.world_head to world_v2_admission_owner;
    grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_admission_owner;
    create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE';end;$$;`);
  await db.exec(
    await readFile(
      new URL(
        '../../database/proposals/world-command-execution-registration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    "insert into world_v2.world_writer_lease values($1,$2,'2099-01-01')",
    [world, worker],
  );
  await db.query(
    "insert into world_v2.runtime_opening_admission values($1,'SEED_EXECUTION_TEST',$2,$3,'TEST_ONLY_MODEL','TEST_ONLY_REPLAY',now())",
    [world, fp, adm],
  );
  await db.query(
    "insert into world_v2.runtime_admission_publication_permit values('TEST_ONLY_PERMIT',$1,$2,'SEED_EXECUTION_TEST',$3,'TEST_ONLY_MODEL','TEST_ONLY_REPLAY',now()-interval '1 day',now()+interval '1 day')",
    ['2'.repeat(64), world, fp],
  );
});
afterAll(async () => {
  await db?.close();
});
describe('registered manual finite execution model', () => {
  it('has no startup SQL or simulated-time callback fallback, and default empty is denied', async () => {
    expect(Object.isFrozen(clock)).toBe(true);
    expect(() =>
      parseRegisteredWorldExecutionState(
        canonicalSerialize({ ...original, simTime: '03000' }),
      ),
    ).toThrow();
    await asWorker();
    await expect(clock.simTime(world)).rejects.toThrow('REGISTERED_CONSUMER');
    await expect(
      readRegisteredWorldExecutionFrom(
        { query },
        Object.freeze({ nowReal: () => '', simTime: async () => '3000' }),
      ),
    ).rejects.toThrow('REGISTERED_WORLD');
  });
  it('requires exact reviewed Clock/control bytes and controlled release, then reads Core-canonical fixed time', async () => {
    await asWorker();
    await expect(
      db.query(
        'select world_v2.register_world_command_execution($1,$2,$3,$4)',
        [raw, sha(raw), clockText, controlText],
      ),
    ).rejects.toThrow('permission denied');
    await release();
    await expect(
      db.query(
        'select world_v2.register_world_command_execution($1,$2,$3,$4)',
        [raw, 'f'.repeat(64), clockText, controlText],
      ),
    ).rejects.toThrow('EXACT_REVIEWED_BYTES');
    await db.query(
      'select world_v2.register_world_command_execution($1,$2,$3,$4)',
      [raw, sha(raw), clockText, controlText],
    );
    await db.query(
      'select world_v2.register_world_command_execution($1,$2,$3,$4)',
      [raw, sha(raw), clockText, controlText],
    );
    await asWorker();
    expect(await clock.simTime(world)).toBe('3000');
    const guarded = createRegisteredWorldExecutionDatabase(
      database,
      clock,
      original,
    );
    expect(
      await guarded.transaction(async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        await tx.query('set local role world_v2_finance_budget_source_reader');
        expect(
          (await readRegisteredWorldExecutionFrom(tx, clock)).simTime,
        ).toBe('3000');
        await tx.query('set local role formal_execution_test_worker');
        return 'ONE_FINITE_OPERATION';
      }),
    ).toBe('ONE_FINITE_OPERATION');
    await expect(
      db.query('select * from world_v2.world_command_execution_registration'),
    ).rejects.toThrow('permission denied');
    await expect(clock.simTime('WORLD_OTHER')).rejects.toThrow(
      'WORLD_MISMATCH',
    );
    await admin();
    await db.exec('set session authorization formal_execution_test_other');
    await expect(clock.simTime(world)).rejects.toThrow('REGISTERED_CONSUMER');
  });
  it('rejects wrong admission pins at the transaction cutoff without issuing an operation', async () => {
    await asWorker();
    let entered = false;
    const guarded = createRegisteredWorldExecutionDatabase(database, clock, {
      ...original,
      seedFingerprint: 'sha256:' + 'a'.repeat(64),
    });
    await expect(
      guarded.transaction(async (tx) => {
        await tx.query('select 1');
        entered = true;
      }),
    ).rejects.toThrow('EXACT_ADMISSION_PINS');
    expect(entered).toBe(false);
  });
  it('denies lease loss and revoked execution without advancing Clock or economic head', async () => {
    await admin();
    await db.query(
      "update world_v2.world_writer_lease set lease_expires_at_real='2000-01-01'where world_id=$1",
      [world],
    );
    await asWorker();
    await expect(clock.simTime(world)).rejects.toThrow('CURRENT_LEASE');
    await admin();
    await db.query(
      "update world_v2.world_writer_lease set lease_expires_at_real='2099-01-01'where world_id=$1",
      [world],
    );
    await release();
    await db.query('select world_v2.revoke_world_command_execution($1,$2,$3)', [
      world,
      original.registrationRef,
      'TEST_ONLY_REVOKE',
    ]);
    await asWorker();
    await expect(clock.simTime(world)).rejects.toThrow('EXPIRED_OR_REVOKED');
    await admin();
    expect(
      (
        await db.query(
          'select world_version,event_sequence from world_v2.world_head',
        )
      ).rows,
    ).toEqual([{ world_version: 0, event_sequence: 0 }]);
  });
  it('rechecks real expiry at the final transaction cutoff and rolls back a TEST_ONLY effect', async () => {
    const until = new Date(Date.now() + 1500).toISOString();
    const control = canonicalSerialize({
      ...JSON.parse(controlText),
      sourceRef: 'CONTROL_EXPIRY_TEST',
      validUntilReal: until,
    });
    const expiry: RegisteredWorldExecutionState = {
      ...original,
      registrationRef: 'EXECUTION_EXPIRY_TEST',
      controlSourceRef: 'CONTROL_EXPIRY_TEST',
      controlSourceSha256: sha(control),
      validUntilReal: until,
    };
    const expiryRaw = canonicalSerialize(expiry);
    await release();
    await db.query(
      'select world_v2.register_world_command_execution($1,$2,$3,$4)',
      [expiryRaw, sha(expiryRaw), clockText, control],
    );
    await asWorker();
    const expiryClock = createRegisteredWorldExecutionClock({
      database,
      worldId: world,
      workerId: worker,
      registrationRef: expiry.registrationRef,
    });
    const guarded = createRegisteredWorldExecutionDatabase(
      database,
      expiryClock,
      expiry,
    );
    await expect(
      guarded.transaction(async (tx) => {
        await tx.query(
          "insert into world_v2.test_only_finite_effect values('NOT_COMMITTED')",
        );
        await new Promise((resolve) => setTimeout(resolve, 1600));
      }),
    ).rejects.toThrow('EXPIRED_OR_REVOKED');
    await admin();
    expect(
      (await db.query('select * from world_v2.test_only_finite_effect')).rows,
    ).toEqual([]);
  });
});
