import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  COMMAND_SCHEMA_VERSION,
  parseCanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import { createV10TwoCountryTestFixture } from './v10-two-country-fixture.js';
import { snapshotStorageFixtureSql } from './snapshot-storage-fixture.js';

export const approvalLockSha: Sha256Hex = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
export const approvalLockFixture = createV10TwoCountryTestFixture;
export const APPROVAL_LOCK_AT = '2026-09-14T00:00:04.000Z';
export const APPROVAL_LOCK_REF = 'APPROVAL_B_TEST_ONLY';
export type ApprovalLockHook = (
  statement: string,
  parameters: readonly unknown[] | undefined,
  pid: number,
) => Promise<void>;

export function approvalLockCommand(suffix = '') {
  const f = approvalLockFixture(),
    source = f.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: `COMMAND_B_APPROVAL_TEST_ONLY${suffix}`,
      idempotencyKey: `IDEMPOTENCY_B_APPROVAL_TEST_ONLY${suffix}`,
      worldId: f.worldId,
      actorId: f.officeActors.sellerTrade.actorId,
      authSubject: f.officeActors.sellerTrade.principal.authSubject,
      countryId: f.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: '2026-09-14T00:00:00.000Z',
      correlationId: 'CORRELATION_B_APPROVAL_TEST_ONLY',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: f.countries.seller,
        buyerCountryId: f.countries.buyer,
        quantity: { amount: '2', unit: source.unit },
        price: { amount: '3', currency: 'GCU', perUnit: source.unit },
        assetSource: {
          batchId: source.batchId,
          physicalLocationId: source.physicalLocationId,
          titleHolderId: source.titleHolderId,
          riskBearerId: source.riskBearerId,
          economicRecognitionId: source.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: '2026-09-14T00:10:00.000Z',
      },
    },
    approvalLockSha,
  );
}

/** Test adapter: real PG transactions, no retry; hooks only observe/pause queries. */
export function approvalLockDatabase(
  pool: Pool,
  before?: ApprovalLockHook,
  after?: ApprovalLockHook,
): SqlDatabase {
  const executor = (client: Pick<Pool, 'query'>): SqlExecutor => ({
    async query<Row extends object>(sql: string, values?: readonly unknown[]) {
      const result = await client.query(sql, values ? [...values] : undefined);
      return { rows: result.rows as Row[], rowCount: result.rowCount };
    },
  });
  return {
    ...executor(pool),
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query('begin isolation level read committed');
        await client.query("set local lock_timeout='5s'");
        await client.query("set local statement_timeout='8s'");
        const pid = (
          await client.query<{ pid: number }>('select pg_backend_pid() as pid')
        ).rows[0]!.pid;
        const tx: SqlExecutor = {
          async query<Row extends object>(
            sql: string,
            values?: readonly unknown[],
          ) {
            await before?.(sql, values, pid);
            const result = await executor(client).query<Row>(sql, values);
            await after?.(sql, values, pid);
            return result;
          },
        };
        const value = await operation(tx);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** Owned TEST_ONLY PG16, private socket, TCP disabled. Never consumes an env DSN.
 * Every migration is applied verbatim after digest verification, including vetoes.
 * Test-only policies/grants below are not a production role/ACL proposal. */
export async function startBApprovalLockCluster() {
  const root = mkdtempSync('/private/tmp/b-approval-lock-'),
    socket = join(root, 'socket');
  mkdirSync(socket);
  const data = join(root, 'data'),
    log = join(root, 'postgres.log');
  const pgCtl = '/opt/homebrew/opt/postgresql@16/bin/pg_ctl';
  const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
  let started = false;
  let admin: Pool | undefined;
  const pools: Pool[] = [];
  const config = { host: socket, port: 5459, database: 'postgres', ssl: false };
  async function close() {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
    await admin?.end();
    admin = undefined;
    if (started) {
      execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], {
        env,
        stdio: 'pipe',
      });
      started = false;
    }
    // Only the exact mkdtemp-owned directory, after its server has stopped.
    rmSync(root, { recursive: true });
  }
  try {
    execFileSync(
      '/opt/homebrew/opt/postgresql@16/bin/initdb',
      [
        '-D',
        data,
        '-U',
        'b_test_only_admin',
        '-A',
        'trust',
        '--no-locale',
        '-E',
        'UTF8',
      ],
      { env, stdio: 'pipe' },
    );
    execFileSync(
      pgCtl,
      [
        '-D',
        data,
        '-l',
        log,
        '-o',
        `-k ${socket} -p 5459 -c listen_addresses=''`,
        '-w',
        'start',
      ],
      { env, stdio: 'pipe' },
    );
    started = true;
    admin = new Pool({ ...config, user: 'b_test_only_admin' });
    await admin.query(`create role b_test_only_approval login nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
      create role b_test_only_auth_writer login nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
      create role anon nologin nosuperuser nobypassrls;
      create role authenticated nologin nosuperuser nobypassrls;`);
    const version = (await admin.query<{ version: string }>('select version()'))
      .rows[0]!.version;
    await admin.query('create database b_test_only_template');
    const template = new Pool({
      ...config,
      database: 'b_test_only_template',
      user: 'b_test_only_admin',
    });
    try {
      const read = (path: string) =>
        readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
      await template.query(
        snapshotStorageFixtureSql.replace(/^create role .*;\n/gm, ''),
      );
      const manifest = JSON.parse(
        read('database/migrations/manifest.json'),
      ) as {
        migrations: Array<{ path: string; sha256: string }>;
      };
      for (const migration of manifest.migrations) {
        const bytes = read(migration.path);
        if (approvalLockSha(bytes) !== migration.sha256)
          throw new Error('MIGRATION_DIGEST_MISMATCH');
        await template.query(bytes);
      }
    } finally {
      await template.end();
    }
    let ordinal = 0;
    return {
      version,
      root,
      close,
      async fixture() {
        const name = `b_test_only_approval_${++ordinal}`;
        await admin!.query(
          `create database ${name} template b_test_only_template`,
        );
        const pool = (user: string) => {
          const value = new Pool({ ...config, database: name, user, max: 3 });
          pools.push(value);
          return value;
        };
        const setup = pool('b_test_only_admin'),
          approval = pool('b_test_only_approval'),
          writer = pool('b_test_only_auth_writer');
        const command = approvalLockCommand(),
          f = approvalLockFixture();
        await setup.query(
          'insert into world_v2.world_head (world_id) values ($1)',
          [command.worldId],
        );
        await setup.query(
          `insert into world_v2.command_submission
          (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,
           command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13,$14,$15,$16::timestamptz)`,
          [
            command.worldId,
            command.commandId,
            command.idempotencyKey,
            command.commandType,
            command.schemaVersion,
            command.canonicalPayload,
            command.payloadHash,
            command.fingerprint,
            command.authSubject,
            command.actorId,
            command.countryId,
            command.officeId,
            command.expectedWorldVersion,
            command.simTime.ticks,
            command.correlationId,
            command.submittedAtReal,
          ],
        );
        for (const actor of [
          f.officeActors.sellerTrade,
          f.officeActors.buyerTrade,
          f.officeActors.buyerFinance,
        ])
          await setup.query(
            `insert into world_v2.current_commit_authorization
            (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
            values ($1,$2::uuid,$3,$4,$5,$6,$7,true,$8::timestamptz)`,
            [
              command.worldId,
              actor.principal.authSubject,
              actor.membership.countryId,
              actor.officeId,
              actor.capability,
              actor.membership.teamId,
              actor.membership.authorizationVersion,
              command.submittedAtReal,
            ],
          );
        // Row locks require UPDATE privilege on at least one column. Immutable
        // history triggers still forbid actual UPDATE; no economic DML is granted.
        await setup.query(`grant usage on schema world_v2 to b_test_only_approval,b_test_only_auth_writer;
          grant select on world_v2.world_head,world_v2.current_commit_authorization to b_test_only_approval,b_test_only_auth_writer;
          grant update(world_id) on world_v2.world_head to b_test_only_approval,b_test_only_auth_writer;
          grant update(active,authorization_version) on world_v2.current_commit_authorization to b_test_only_auth_writer;
          grant update(authorization_version) on world_v2.current_commit_authorization to b_test_only_approval;
          grant select on world_v2.command_submission,world_v2.narrow_transfer_proposal,
            world_v2.narrow_transfer_approval_signature,world_v2.narrow_transfer_approval_reference to b_test_only_approval;
          grant update(command_id) on world_v2.command_submission to b_test_only_approval;
          grant insert on world_v2.narrow_transfer_proposal,world_v2.narrow_transfer_approval_signature,
            world_v2.narrow_transfer_approval_reference to b_test_only_approval;
          grant update(status,approved_at_real) on world_v2.narrow_transfer_proposal to b_test_only_approval;
          grant update(office_id) on world_v2.narrow_transfer_approval_signature to b_test_only_approval;
          grant update(approval_ref) on world_v2.narrow_transfer_approval_reference to b_test_only_approval;`);
        for (const table of [
          'world_head',
          'current_commit_authorization',
          'command_submission',
          'narrow_transfer_proposal',
          'narrow_transfer_approval_signature',
          'narrow_transfer_approval_reference',
        ])
          await setup.query(
            `create policy b_test_only_scope on world_v2.${table} to b_test_only_approval,b_test_only_auth_writer using (true) with check (true)`,
          );
        const database = approvalLockDatabase(approval);
        return {
          setup,
          approval,
          writer,
          command,
          database,
          store: new NarrowTransferApprovalStore({
            database,
            sha256Hex: approvalLockSha,
          }),
        };
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export type BApprovalLockFixture = Awaited<
  ReturnType<Awaited<ReturnType<typeof startBApprovalLockCluster>>['fixture']>
>;
