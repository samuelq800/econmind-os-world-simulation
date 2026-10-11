import { setTimeout as pause } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES } from '@econmind/core';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import {
  APPROVAL_LOCK_AT,
  APPROVAL_LOCK_REF,
  approvalLockCommand,
  approvalLockDatabase,
  approvalLockFixture,
  approvalLockSha,
  startBApprovalLockCluster,
  type BApprovalLockFixture,
} from '../support/b-narrow-approval-lock-native.js';

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const normalized = (sql: string) => sql.replace(/\s+/gu, ' ').trim();
const headLock = (sql: string) =>
  /from world_v2\.world_head .*for (?:update|share)/u.test(normalized(sql));
const submissionLock = (sql: string) =>
  /from world_v2\.command_submission .*for update/u.test(normalized(sql));
const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('NATIVE_BARRIER_DEADLINE')),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function blockedBy(pool: Pool, waiting: number, holder: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const row = (
      await pool.query<{ blockers: number[] }>(
        'select pg_blocking_pids($1) as blockers',
        [waiting],
      )
    ).rows[0]!;
    if (row.blockers.includes(holder)) return;
    await pause(10);
  }
  throw new Error(`EXPECTED_NATIVE_BLOCK_NOT_OBSERVED:${waiting}:${holder}`);
}
async function begin(pool: Pool) {
  const client = await pool.connect();
  await client.query('begin isolation level read committed');
  await client.query("set local lock_timeout='5s'");
  await client.query("set local statement_timeout='8s'");
  const pid = (
    await client.query<{ pid: number }>('select pg_backend_pid() as pid')
  ).rows[0]!.pid;
  return { client, pid };
}
async function lockHead(client: PoolClient, world: string) {
  await client.query(
    'select world_id from world_v2.world_head where world_id=$1 for update',
    [world],
  );
}
// Primitive lock-order competitor only, NOT A's source publisher/registration.
async function revoke(
  client: PoolClient,
  f: BApprovalLockFixture,
  actor: string,
) {
  await client.query(
    `update world_v2.current_commit_authorization
    set active=false,authorization_version='AUTH_B_TEST_ONLY_REVOKED'
    where world_id=$1 and auth_subject=$2::uuid`,
    [f.command.worldId, actor],
  );
}
const entries = [
  'open',
  'buyerTrade',
  'buyerFinance',
  'bind',
  'assertCurrent',
  'existing-S-H',
] as const;
type Entry = (typeof entries)[number];
function signer(key: 'sellerTrade' | 'buyerTrade' | 'buyerFinance') {
  const actor = approvalLockFixture().officeActors[key];
  const second =
    key === 'sellerTrade' ? '01' : key === 'buyerTrade' ? '02' : '03';
  return {
    actorId: actor.actorId,
    authSubject: actor.principal.authSubject,
    signedAtReal: `2026-09-14T00:00:${second}.000Z`,
  };
}
async function prepare(f: BApprovalLockFixture, entry: Entry) {
  if (entry === 'open') return;
  await f.store.openSellerOffer({
    command: f.command,
    signer: signer('sellerTrade'),
  });
  if (entry === 'buyerTrade') return;
  await f.store.signBuyerOffice({
    command: f.command,
    office: 'TRADE',
    signer: signer('buyerTrade'),
  });
  if (entry === 'buyerFinance') return;
  await f.store.signBuyerOffice({
    command: f.command,
    office: 'FINANCE',
    signer: signer('buyerFinance'),
  });
}
function call(
  f: BApprovalLockFixture,
  entry: Entry,
  db = f.database,
): Promise<unknown> {
  const store = new NarrowTransferApprovalStore({
    database: db,
    sha256Hex: approvalLockSha,
  });
  if (entry === 'open')
    return store.openSellerOffer({
      command: f.command,
      signer: signer('sellerTrade'),
    });
  if (entry === 'buyerTrade' || entry === 'buyerFinance')
    return store.signBuyerOffice({
      command: f.command,
      office: entry === 'buyerTrade' ? 'TRADE' : 'FINANCE',
      signer: signer(entry),
    });
  if (entry === 'bind')
    return store.bindBuyerFinanceApprovalReference({
      command: f.command,
      approvalRef: APPROVAL_LOCK_REF,
      observedAtReal: APPROVAL_LOCK_AT,
    });
  return db.transaction(async (tx) => {
    if (entry === 'existing-S-H') {
      // Existing ENQUEUE/commit frontier, not H-first new-SUBMIT.
      await tx.query(
        'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
        [f.command.worldId, f.command.commandId],
      );
      await tx.query(
        'select world_id from world_v2.world_head where world_id=$1 for update',
        [f.command.worldId],
      );
    }
    await store.assertCurrent(tx, {
      command: f.command,
      observedAtReal: APPROVAL_LOCK_AT,
    });
  });
}
async function snapshot(f: BApprovalLockFixture) {
  const value: Record<string, unknown> = {};
  for (const table of [
    'world_head',
    'command_submission',
    'narrow_transfer_proposal',
    'narrow_transfer_approval_signature',
    'narrow_transfer_approval_reference',
    'authoritative_event',
    'inventory_posting',
    'financial_posting_batch',
    'command_receipt',
    'command_queue',
  ]) {
    value[table] = (
      await f.setup.query<{ rows: unknown }>(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from world_v2.${table} t`,
      )
    ).rows[0]!.rows;
  }
  return value;
}
function expectFrontier(
  trace: Array<{ sql: string; parameters: readonly unknown[] | undefined }>,
  world: string,
) {
  expect(submissionLock(trace[0]!.sql)).toBe(true);
  expect(headLock(trace[1]!.sql)).toBe(true);
  expect(trace[1]!.parameters).toEqual([world]);
  expect(trace[1]!.sql).toMatch(/where world_id\s*=\s*\$1/u);
}

describe.runIf(process.env.B_APPROVAL_LOCK_NATIVE === '1')(
  'B narrow approval same-World S -> H native compatibility (TEST_ONLY)',
  () => {
    let cluster: Awaited<ReturnType<typeof startBApprovalLockCluster>>;
    beforeAll(async () => {
      cluster = await startBApprovalLockCluster();
      expect(cluster.version).toMatch(/PostgreSQL 16\./u);
      console.info(
        `B_APPROVAL_NATIVE_VERSION=${cluster.version}; TCP_DISABLED; SOURCE_REGISTRATION=NOT_ESTABLISHED`,
      );
    });
    afterAll(async () => {
      await cluster?.close();
    });

    for (const entry of entries) {
      it(`${entry}: H-first revoke commits first; actual API waits before A/proposals and fails closed on fresh authority`, async () => {
        const f = await cluster.fixture();
        await prepare(f, entry);
        const before = await snapshot(f);
        const writer = await begin(f.writer);
        const trace: Array<{
          sql: string;
          parameters: readonly unknown[] | undefined;
        }> = [];
        const started = latch();
        let approvalPid = 0;
        let result: ReturnType<typeof settle> | undefined;
        try {
          await lockHead(writer.client, f.command.worldId);
          const db = approvalLockDatabase(
            f.approval,
            async (sql, parameters, pid) => {
              trace.push({ sql: normalized(sql), parameters });
              approvalPid = pid;
              started.resolve();
            },
          );
          result = settle(call(f, entry, db));
          await bounded(started.promise);
          await blockedBy(f.setup, approvalPid, writer.pid);
          expectFrontier(trace, f.command.worldId);
          expect(trace).toHaveLength(2); // no downstream query even attempted
          const key =
            entry === 'open'
              ? 'sellerTrade'
              : entry === 'buyerTrade'
                ? 'buyerTrade'
                : 'buyerFinance';
          await revoke(writer.client, f, signer(key).authSubject);
          await writer.client.query('commit');
          expect(await result).toMatchObject({
            ok: false,
            error: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
          });
          expect(await snapshot(f)).toEqual(before);
        } finally {
          await writer.client.query('rollback');
          writer.client.release();
          await result;
        }
      });

      it(`${entry}: actual API owns H first; writer demonstrably waits through approval COMMIT, then revocation defeats retry`, async () => {
        const f = await cluster.fixture();
        await prepare(f, entry);
        const before = await snapshot(f),
          acquired = latch(),
          release = latch();
        const trace: Array<{
          sql: string;
          parameters: readonly unknown[] | undefined;
        }> = [];
        let approvalPid = 0,
          paused = false;
        const db = approvalLockDatabase(
          f.approval,
          async (sql, parameters) => {
            trace.push({ sql: normalized(sql), parameters });
          },
          async (sql, _parameters, pid) => {
            if (headLock(sql) && !paused) {
              paused = true;
              approvalPid = pid;
              acquired.resolve();
              await release.promise;
            }
          },
        );
        const result = settle(call(f, entry, db));
        try {
          await bounded(acquired.promise);
        } catch (error) {
          release.resolve();
          await result;
          throw error;
        }
        const writer = await begin(f.writer);
        const writerLock = settle(lockHead(writer.client, f.command.worldId));
        try {
          await blockedBy(f.setup, writer.pid, approvalPid);
          expectFrontier(trace, f.command.worldId);
          release.resolve();
          expect(await result).toMatchObject({ ok: true });
          expect(await writerLock).toMatchObject({ ok: true });
          const after = await snapshot(f);
          for (const table of [
            'world_head',
            'command_submission',
            'authoritative_event',
            'inventory_posting',
            'financial_posting_batch',
            'command_receipt',
            'command_queue',
          ])
            expect(after[table]).toEqual(before[table]);
          expect(after.narrow_transfer_proposal).toHaveLength(2);
          expect(after.narrow_transfer_approval_signature).toHaveLength(
            entry === 'open' ? 1 : entry === 'buyerTrade' ? 2 : 3,
          );
          expect(after.narrow_transfer_approval_reference).toHaveLength(
            entry === 'bind' ? 1 : 0,
          );
          const key =
            entry === 'open'
              ? 'sellerTrade'
              : entry === 'buyerTrade'
                ? 'buyerTrade'
                : 'buyerFinance';
          await revoke(writer.client, f, signer(key).authSubject);
          await writer.client.query('commit');
          expect(await settle(call(f, entry))).toMatchObject({
            ok: false,
            error: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
          });
          expect(await snapshot(f)).toEqual(after);
        } finally {
          release.resolve();
          await writer.client.query('rollback');
          writer.client.release();
          await Promise.all([result, writerLock]);
        }
      });
    }

    it('native source-shaped OLD SQL control: S -> A -> implicit FK-H opposes H -> A (not a claim of executing the old API)', async () => {
      const f = await cluster.fixture(),
        before = await snapshot(f);
      const approval = await begin(f.approval),
        writer = await begin(f.writer);
      try {
        await approval.client.query(
          'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
          [f.command.worldId, f.command.commandId],
        );
        await approval.client.query(
          'select authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid for update',
          [f.command.worldId, signer('sellerTrade').authSubject],
        );
        await lockHead(writer.client, f.command.worldId);
        const changing = settle(
          revoke(writer.client, f, signer('sellerTrade').authSubject),
        );
        await blockedBy(f.setup, writer.pid, approval.pid);
        const inserting = settle(
          approval.client.query(
            `insert into world_v2.narrow_transfer_proposal
        (world_id,proposal_id,command_id,country_id,command_fingerprint,policy_version,threshold_policy_version,required_offices,status,opened_at_real)
        values ($1,'PROPOSAL_B_OLD_SQL_TEST_ONLY',$2,$3,$4,'V10_TREASURY_GCU_V1','V10_TREASURY_GCU_THRESHOLD_V1','["TRADE"]','PENDING',$5::timestamptz)`,
            [
              f.command.worldId,
              f.command.commandId,
              f.command.countryId,
              f.command.fingerprint,
              f.command.submittedAtReal,
            ],
          ),
        );
        const results = await Promise.all([changing, inserting]);
        expect(results.filter((result) => !result.ok)).toHaveLength(1);
        expect(results.find((result) => !result.ok)).toMatchObject({
          ok: false,
          error: { code: '40P01' },
        });
      } finally {
        await Promise.all([
          approval.client.query('rollback'),
          writer.client.query('rollback'),
        ]);
        approval.client.release();
        writer.client.release();
      }
      expect(await snapshot(f)).toEqual(before);
    });

    it('missing durable S fails before H or any approval access; never bootstraps a new Command', async () => {
      const f = await cluster.fixture(),
        before = await snapshot(f),
        trace: string[] = [];
      const store = new NarrowTransferApprovalStore({
        database: approvalLockDatabase(f.approval, async (sql) => {
          trace.push(sql);
        }),
        sha256Hex: approvalLockSha,
      });
      expect(
        await settle(
          store.openSellerOffer({
            command: approvalLockCommand('_MISSING'),
            signer: signer('sellerTrade'),
          }),
        ),
      ).toMatchObject({
        ok: false,
        error: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
      });
      expect(trace).toHaveLength(1);
      expect(submissionLock(trace[0]!)).toBe(true);
      expect(await snapshot(f)).toEqual(before);
    });

    it('caller-owned S -> H SHARE frontier never upgrades H while another same-World SHARE holder exists', async () => {
      const f = await cluster.fixture();
      await prepare(f, 'assertCurrent');
      const other = await begin(f.writer);
      const before = await snapshot(f);
      try {
        await other.client.query(
          'select world_id from world_v2.world_head where world_id=$1 for share',
          [f.command.worldId],
        );
        await bounded(
          f.database.transaction(async (tx) => {
            await tx.query(
              'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
              [f.command.worldId, f.command.commandId],
            );
            await tx.query(
              'select world_id from world_v2.world_head where world_id=$1 for share',
              [f.command.worldId],
            );
            await f.store.assertCurrent(tx, {
              command: f.command,
              observedAtReal: APPROVAL_LOCK_AT,
            });
          }),
        );
        expect(await snapshot(f)).toEqual(before);
      } finally {
        await other.client.query('rollback');
        other.client.release();
      }
    });

    it('native ordinary nonadmin controls: exact retry, other-World H independence, intact vetoes and no economic grants', async () => {
      const f = await cluster.fixture();
      await prepare(f, 'bind');
      await call(f, 'bind');
      const before = await snapshot(f);
      await call(f, 'bind');
      expect(await snapshot(f)).toEqual(before);
      await f.setup.query(
        "insert into world_v2.world_head(world_id) values ('WORLD_B_OTHER_TEST_ONLY')",
      );
      const writer = await begin(f.writer);
      try {
        await lockHead(writer.client, 'WORLD_B_OTHER_TEST_ONLY');
        expect(await settle(call(f, 'assertCurrent'))).toMatchObject({
          ok: true,
        });
      } finally {
        await writer.client.query('rollback');
        writer.client.release();
      }
      expect(
        (
          await f.approval.query(
            'select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user',
          )
        ).rows,
      ).toEqual([
        {
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        },
      ]);
      expect(
        (
          await f.approval.query(
            "select has_table_privilege(current_user,'world_v2.authoritative_event','INSERT') as events,has_table_privilege(current_user,'world_v2.inventory_posting','INSERT') as inventory,has_table_privilege(current_user,'world_v2.financial_posting_batch','INSERT') as financial",
          )
        ).rows,
      ).toEqual([{ events: false, inventory: false, financial: false }]);
      expect(
        (
          await f.setup.query(
            "select policyname from pg_policies where schemaname='storage' and policyname like 'world_v2_snapshot_objects_%' order by policyname",
          )
        ).rows,
      ).toEqual([
        { policyname: 'world_v2_snapshot_objects_delete_deny' },
        { policyname: 'world_v2_snapshot_objects_insert_deny' },
      ]);
    });
  },
);
