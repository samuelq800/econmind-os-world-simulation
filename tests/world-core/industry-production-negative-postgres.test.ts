// TEST_ONLY native pre-source negative. Not Industry R/F custody or admission.
import { createHash } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireWorldWriterLease,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createWorldWriterCommitAssertion,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  workerId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import { canonicalSerialize as fixtureSerialize } from '../../packages/core/src/index.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import { decodeIndustryProductionRow } from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';

const suite = process.env.D_INDUSTRY_NATIVE_OWNED_MARKER
  ? describe
  : describe.skip;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const WORKER = workerId('WORKER_D_INDUSTRY_NATIVE_NEGATIVE');
const AT = '2026-10-07T00:00:01.000Z';
const workerRole = 'd_industry_negative_worker',
  probeRole = 'd_industry_negative_probe';
let admin: Pool, worker: Pool, probe: Pool;
function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function candidate() {
  const raw = createProductionSchemaFixture().make();
  const {
    canonicalPayload,
    payloadHash: _payloadHash,
    fingerprint: _fingerprint,
    simTime,
    ...intent
  } = raw.command;
  void _payloadHash;
  void _fingerprint;
  // Rebuild with Worker's actual Core instance; no cloned private brands.
  const command = parseCanonicalCommand(
    {
      ...intent,
      payload: JSON.parse(canonicalPayload) as unknown,
      simTime: simTime.toCanonicalValue(),
    },
    sha,
  );
  const events = raw.transition.events.map((value) => {
    const {
      canonicalPayload,
      payloadHash: _payloadHash,
      fingerprint: _fingerprint,
      simTime,
      ...event
    } = value;
    void _payloadHash;
    void _fingerprint;
    return parseAuthoritativeEvent(
      {
        ...event,
        payload: JSON.parse(canonicalPayload) as unknown,
        simTime: simTime.toCanonicalValue(),
      },
      sha,
    );
  });
  const transition = createAuthoritativeTransition({
    command,
    events,
    worldVersionBefore: '1',
    worldVersionAfter: '2',
  });
  const { fingerprint, ...body } = JSON.parse(
    fixtureSerialize(raw.posting),
  ) as Record<string, unknown>;
  const posting = decodeIndustryProductionRow({
    command,
    transition,
    row: {
      canonical_payload: body,
      causation_command_id: command.commandId,
      fingerprint,
    },
    sha256Hex: sha,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      command.worldId,
      WORKER,
      '2026-10-07T00:00:00.000Z',
      '2026-10-07T00:05:00.000Z',
    ),
  ).lease;
  return prepareAtomicTransitionCandidate({
    command,
    commitAuthorization: null,
    sha256Hex: sha,
    draft: {
      transition,
      inventoryPostings: [posting],
      financialPostingBatches: [],
      receipt: createFinalCommandReceipt({
        command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: AT,
      }),
      outboxMessages: [],
      currentMaterializations: [],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: createWorldWriterCommitAssertion(lease, '1'),
      observedAtReal: AT,
    },
  });
}

suite('Industry pre-source boundary — owned native PostgreSQL negative', () => {
  beforeAll(async () => {
    const uid = process.getuid?.();
    if (uid === undefined) throw Error('OWNED_POSIX_CLUSTER_REQUIRED');
    const markerPath = process.env.D_INDUSTRY_NATIVE_OWNED_MARKER;
    if (!markerPath || !path.isAbsolute(markerPath))
      throw Error('OWNED_CLUSTER_MARKER_REQUIRED');
    const markerStat = await lstat(markerPath);
    if (
      !markerStat.isFile() ||
      markerStat.isSymbolicLink() ||
      markerStat.uid !== uid
    )
      throw Error('FOREIGN_CLUSTER_MARKER');
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as {
      uid: number;
      root: string;
      data: string;
      port: number;
      database: string;
      serverPid: number;
    };
    if (
      marker.uid !== uid ||
      !path.basename(marker.root).startsWith('econmind-d-industry-native-') ||
      marker.data !== path.join(marker.root, 'data') ||
      (await realpath(marker.root)) !== marker.root ||
      (await realpath(marker.data)) !== marker.data
    )
      throw Error('OWNED_PRIVATE_DATA_REQUIRED');
    for (const p of [marker.root, marker.data]) {
      const stat = await lstat(p);
      if (stat.uid !== uid || (stat.mode & 0o777) !== 0o700)
        throw Error('OWNED_PRIVATE_DATA_REQUIRED');
    }
    const pid = (
      await readFile(path.join(marker.data, 'postmaster.pid'), 'utf8')
    ).split('\n');
    if (
      pid[0] !== String(marker.serverPid) ||
      pid[1] !== marker.data ||
      pid[3] !== String(marker.port)
    )
      throw Error('POSTMASTER_IDENTITY_MISMATCH');
    const target = assertV09PostgresTestEnvironment();
    admin = new Pool({
      connectionString: target.connectionString,
      max: 2,
      options: '-c statement_timeout=5000',
    });
    const identity = (
      await admin.query(
        "select current_database() as database,host(inet_server_addr()) as host,current_setting('server_version') as version,current_setting('data_directory') as data,current_setting('port')::int as port",
      )
    ).rows[0];
    expect(identity.database).toMatch(/^econmind_v09_d_industry_negative_/u);
    expect(identity.host).toBe('127.0.0.1');
    expect(identity.version).toMatch(/^16\./u);
    expect(identity.database).toBe(marker.database);
    expect(identity.data).toBe(marker.data);
    expect(identity.port).toBe(marker.port);
    expect(
      (
        await admin.query(
          "select 1 from information_schema.schemata where schema_name='world_v2'",
        )
      ).rows,
    ).toHaveLength(0);
    const frozen = await loadFrozenRenewalMigrationFixture(
      path.resolve(import.meta.dirname, '../..'),
    );
    // Existing exact first12 only: no production0023 installation or new store.
    for (const [index, migration] of frozen.manifest.migrations
      .slice(0, 12)
      .entries()) {
      await admin.query(frozen.artifacts[index]!);
      await admin.query(
        'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
        [
          migration.migration_id,
          migration.sha256,
          migration.artifact_source_commit,
          migration.release_order,
        ],
      );
    }
    for (const role of [workerRole, probeRole]) {
      await admin.query(
        `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
      await admin.query(`grant usage on schema world_v2 to ${role}`);
      await admin.query(
        `grant select,update(world_version) on world_v2.world_head to ${role}`,
      );
      await admin.query(
        `grant select,update(renewed_at_real) on world_v2.world_writer_lease to ${role}`,
      );
      await admin.query(
        `grant select,update(command_type) on world_v2.command_submission to ${role}`,
      );
      await admin.query(`grant select on world_v2.command_receipt to ${role}`);
    }
    const w = new URL(target.connectionString);
    w.username = workerRole;
    const p = new URL(target.connectionString);
    p.username = probeRole;
    worker = new Pool({
      connectionString: w.toString(),
      max: 2,
      application_name: 'd_industry_negative_worker',
      options: '-c lock_timeout=2000 -c statement_timeout=5000',
    });
    probe = new Pool({
      connectionString: p.toString(),
      max: 1,
      application_name: 'd_industry_negative_probe',
      options: '-c lock_timeout=2000 -c statement_timeout=5000',
    });
    console.log(
      JSON.stringify({
        scope: 'NATIVE_PRE_SOURCE_NEGATIVE_ONLY',
        ...identity,
        migrationPrefix: 12,
        production0023Installed: false,
        sourceAdmitted: false,
      }),
    );
  });
  afterAll(async () => {
    await worker?.end();
    await probe?.end();
    await admin?.end();
    console.log(
      JSON.stringify({
        scope: 'NATIVE_INDUSTRY_NEGATIVE_CLEANUP',
        allPoolsClosed: true,
      }),
    );
  });

  it('holds actual S/lease/H until missing Industry guard rolls back, then releases all with zero effects', async () => {
    const value = candidate(),
      c = value.command;
    // Frontier/accepted-submission fixture ONLY. No canonical history or source
    // eligibility is manufactured; this path must refuse before reading either.
    await admin.query(
      'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,1,1)',
      [c.worldId],
    );
    await admin.query(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,
      canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,
      sim_time,correlation_id,submitted_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        c.worldId,
        c.commandId,
        c.idempotencyKey,
        c.commandType,
        c.schemaVersion,
        c.canonicalPayload,
        c.payloadHash,
        c.fingerprint,
        c.authSubject,
        c.actorId,
        c.countryId,
        c.officeId,
        c.expectedWorldVersion,
        c.simTime.toCanonicalValue(),
        c.correlationId,
        c.submittedAtReal,
      ],
    );
    await admin.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,$3,$4)',
      [c.worldId, WORKER, '2026-10-07T00:00:00.000Z', '300000'],
    );
    const protectedRows = async () =>
      (
        await admin.query(
          `select to_jsonb(h) as head,
      (select to_jsonb(l) from world_v2.world_writer_lease l where l.world_id=h.world_id) as lease,
      (select to_jsonb(s) from world_v2.command_submission s where s.world_id=h.world_id and s.command_id=$2) as submission
      from world_v2.world_head h where h.world_id=$1`,
          [c.worldId, c.commandId],
        )
      ).rows[0];
    const originalRows = await protectedRows();
    const identity = (
      await worker.query(`select current_user,session_user,r.rolsuper,r.rolbypassrls,
      exists(select 1 from pg_auth_members where member=r.oid) as member,
      has_table_privilege(current_user,'world_v2.authoritative_event','INSERT') as can_write_events
      from pg_roles r where r.rolname=current_user`)
    ).rows[0];
    expect(identity).toEqual({
      current_user: workerRole,
      session_user: workerRole,
      rolsuper: false,
      rolbypassrls: false,
      member: false,
      can_write_events: false,
    });
    const reached = gate(),
      resume = gate();
    let beforeEvents = false;
    const repository = new AtomicTransitionRepository({
      database: new PostgresSqlDatabase(worker),
      workerId: WORKER,
      sha256Hex: sha,
      authorizationGuard: createTransactionCutoffAuthorizationGuard(),
      faultInjector: {
        async hit(phase) {
          if (phase === 'AUTHORIZATION_RECHECKED') {
            reached.release();
            await resume.promise;
          }
          if (phase === 'BEFORE_EVENTS') beforeEvents = true;
        },
      },
    });
    const pending = repository.commit(value).then(
      (result) => ({ ok: true as const, result }),
      (error) => ({ ok: false as const, error: error as unknown }),
    );
    const resources = [
      'command_submission',
      'world_writer_lease',
      'world_head',
    ] as const;
    const blocked: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        reached.promise,
        pending.then(() => {
          throw Error('DID_NOT_REACH_HELD_GUARD');
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error('HELD_GUARD_DEADLINE')), 3000);
        }),
      ]);
      clearTimeout(timer);
      const holder = (
        await admin.query(
          "select pid from pg_stat_activity where application_name='d_industry_negative_worker' and state='idle in transaction'",
        )
      ).rows;
      expect(holder).toHaveLength(1);
      for (const table of resources) {
        const client = await probe.connect();
        try {
          await client.query('begin');
          await expect(
            client.query(
              `select world_id from world_v2.${table} where world_id=$1 for update nowait`,
              [c.worldId],
            ),
          ).rejects.toMatchObject({ code: '55P03' });
          blocked.push(table);
        } finally {
          await client.query('rollback');
          client.release();
        }
      }
      expect(beforeEvents).toBe(false);
    } finally {
      clearTimeout(timer);
      resume.release();
    }
    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('UNGUARDED_PRODUCTION_COMMITTED');
    expect(result.error).toBeInstanceOf(PostgresTransactionError);
    const error = result.error as PostgresTransactionError;
    expect(error.outcome).toBe('ROLLED_BACK');
    expect(error.cause).toMatchObject({
      message: expect.stringContaining(
        'New Industry production requires the fixed source guard',
      ),
    });
    expect(beforeEvents).toBe(false);
    const client = await probe.connect();
    try {
      await client.query('begin');
      for (const table of resources)
        expect(
          (
            await client.query(
              `select world_id from world_v2.${table} where world_id=$1 for update nowait`,
              [c.worldId],
            )
          ).rowCount,
        ).toBe(1);
    } finally {
      await client.query('rollback');
      client.release();
    }
    const footprint = (
      await admin.query(
        `select
      (select count(*)::int from world_v2.authoritative_event where world_id=$1) as events,
      (select count(*)::int from world_v2.inventory_posting where world_id=$1) as inventory,
      (select count(*)::int from world_v2.financial_posting_batch where world_id=$1) as financial,
      (select count(*)::int from world_v2.command_receipt where world_id=$1) as receipts,
      world_version::text as world_version,event_sequence::text as event_sequence from world_v2.world_head where world_id=$1`,
        [c.worldId],
      )
    ).rows[0];
    expect(footprint).toEqual({
      events: 0,
      inventory: 0,
      financial: 0,
      receipts: 0,
      world_version: '1',
      event_sequence: '1',
    });
    expect(await protectedRows()).toEqual(originalRows);
    console.log(
      JSON.stringify({
        scope: 'NATIVE_INDUSTRY_MISSING_GUARD_ROLLBACK_ONLY',
        blocked,
        sqlstate: '55P03',
        rollback: error.outcome,
        locksReleased: true,
        protectedRowsUnchanged: true,
        beforeEvents,
        ...footprint,
        sourceAdmitted: false,
        completeIndustryRFAndAllActors: 'NOT_RUN_NOT_SUPPLIED',
      }),
    );
  });
});
