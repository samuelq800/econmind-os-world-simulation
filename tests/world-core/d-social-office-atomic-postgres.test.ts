/** Actual owned PostgreSQL/role/transaction controls, never the linked production project. */
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  config,
  command,
  match,
  principal,
  socialScenario,
  installFixture,
  grantFixtureRoles,
  digest,
} from '../support/social-office-atomic-fixture.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createSocialOfficeSimulatedAtomicRepository,
  type SocialOfficeSimulatedAtomicRepository,
} from '../../apps/world-worker/src/persistence/social-office-atomic-repository.js';
import {
  withSocialOfficeSimulatedTransaction,
  requireSocialOfficeProtectedSource,
} from '../../apps/world-worker/src/persistence/social-office-resource-protection.js';
import { publishSocialOfficeSimulatedSource } from '../../apps/world-worker/src/persistence/social-office-simulated-source-custody.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { withValidatedCanonicalLineageFrom } from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';

const suite = process.env.D_SOCIAL_ATOMIC_NATIVE_MARKER
  ? describe
  : describe.skip;
let admin: Pool,
  settler: Pool,
  reader: Pool,
  publisher: Pool,
  authority: Pool,
  lease: Pool;
let scenario: Awaited<ReturnType<typeof socialScenario>>,
  repo: SocialOfficeSimulatedAtomicRepository,
  readRepo: SocialOfficeSimulatedAtomicRepository;
let plan: C.CanonicalCommand, due: C.CanonicalCommand;
let connection: PoolConfig;
function acknowledgementFault(failRecovery: boolean) {
  const pool = new Pool({ ...connection, user: 'd_social_settler' });
  const connect = pool.connect.bind(pool);
  let lost = false;
  Object.defineProperty(pool, 'connect', {
    value: async () => {
      if (lost && failRecovery) throw Error('D_NATIVE_RECOVERY_UNAVAILABLE');
      const client = await connect();
      let event = false;
      return {
        query: async (
          statement: string,
          parameters: readonly unknown[] = [],
        ) => {
          const result = await client.query(statement, [...parameters]);
          if (statement.startsWith('insert into world_v2.authoritative_event'))
            event = true;
          if (statement === 'commit' && event && !lost) {
            lost = true;
            throw Error('D_NATIVE_ACK_LOST_AFTER_REAL_COMMIT');
          }
          return result;
        },
        release: (error?: Error) => client.release(error),
      };
    },
  });
  return {
    pool,
    repository: createSocialOfficeSimulatedAtomicRepository(
      config(new PostgresSqlDatabase(pool), scenario),
    ),
    lost: () => lost,
  };
}
async function counts() {
  return (
    await admin.query(
      'select (select count(*)::int from world_v2.authoritative_event) events,(select count(*)::int from world_v2.inventory_posting) inventory,(select count(*)::int from world_v2.financial_posting_batch) financial,(select count(*)::int from world_v2.command_receipt) receipts,(select count(*)::int from world_v2.authoritative_commit_authorization) audit,(select count(*)::int from world_v2.notification_outbox) outbox,(select world_version::text from world_v2.world_head) version',
    )
  ).rows[0];
}
async function advance(day: '1' | '10') {
  const latest = (
    await admin.query(
      'select generation::text,manifest_hash from world_v2.social_demo_source_revision order by generation desc limit 1',
    )
  ).rows[0] as { generation: string; manifest_hash: string };
  return publishSocialOfficeSimulatedSource(
    new PostgresSqlDatabase(publisher),
    scenario.publicationForPreset({
      dayIndex: day,
      expectedGeneration: latest.generation,
      expectedManifestHash: latest.manifest_hash,
    }),
  );
}
suite('D native Social atomic/sole-reader exact simulation', () => {
  beforeAll(async () => {
    const markerPath = process.env.D_SOCIAL_ATOMIC_NATIVE_MARKER!;
    const st = await lstat(markerPath),
      uid = process.getuid?.();
    if (
      !path.isAbsolute(markerPath) ||
      !st.isFile() ||
      st.isSymbolicLink() ||
      uid === undefined ||
      uid === 0 ||
      st.uid !== uid ||
      (st.mode & 0o777) !== 0o600
    )
      throw Error('PRIVATE_OWNED_MARKER_REQUIRED');
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as {
      uid: number;
      root: string;
      data: string;
      socket: string;
      port: number;
      serverPid: number;
      database: string;
      user: string;
    };
    if (
      marker.uid !== uid ||
      !path.basename(marker.root).startsWith('econmind-d-social-atomic-') ||
      marker.data !== path.join(marker.root, 'data') ||
      marker.socket !== path.join(marker.root, 'socket') ||
      marker.database !== 'econmind_d_social_atomic'
    )
      throw Error('FOREIGN_CLUSTER');
    for (const p of [marker.root, marker.data, marker.socket]) {
      const a = await lstat(p);
      if (
        !a.isDirectory() ||
        a.isSymbolicLink() ||
        a.uid !== uid ||
        (a.mode & 0o777) !== 0o700 ||
        (await realpath(p)) !== p
      )
        throw Error('PRIVATE_OWNED_CLUSTER_REQUIRED');
    }
    const pid = (
      await readFile(path.join(marker.data, 'postmaster.pid'), 'utf8')
    ).split('\n');
    if (
      pid[0] !== String(marker.serverPid) ||
      pid[1] !== marker.data ||
      pid[3] !== String(marker.port)
    )
      throw Error('PID_MISMATCH');
    const settings = {
      host: marker.socket,
      port: marker.port,
      database: marker.database,
      max: 3,
      options: '-c statement_timeout=5000 -c lock_timeout=3000',
    };
    connection = settings;
    admin = new Pool({ ...settings, user: marker.user });
    const actual = (
      await admin.query(
        "select current_database() db,inet_server_addr() host,current_setting('data_directory') data,current_setting('listen_addresses') listen,current_setting('server_version') version",
      )
    ).rows[0];
    expect(actual).toMatchObject({
      db: marker.database,
      host: null,
      data: marker.data,
      listen: '',
    });
    expect(actual.version).toMatch(/^16\./u);
    expect(
      (
        await admin.query(
          "select 1 from information_schema.schemata where schema_name='world_v2'",
        )
      ).rows,
    ).toHaveLength(0);
    scenario = await socialScenario();
    await installFixture(admin, scenario);
    await grantFixtureRoles(admin);
    settler = new Pool({ ...settings, user: 'd_social_settler' });
    reader = new Pool({ ...settings, user: 'd_social_reader' });
    publisher = new Pool({ ...settings, user: 'd_social_publisher' });
    authority = new Pool({ ...settings, user: 'd_social_authority' });
    lease = new Pool({ ...settings, user: 'd_social_lease' });
    repo = createSocialOfficeSimulatedAtomicRepository(
      config(new PostgresSqlDatabase(settler), scenario),
    );
    readRepo = createSocialOfficeSimulatedAtomicRepository(
      config(new PostgresSqlDatabase(reader), scenario),
    );
  }, 30000);
  afterAll(async () => {
    for (const pool of [settler, reader, publisher, authority, lease, admin])
      if (pool) await pool.end();
  });
  it('installs the original full23 chain, preserves admission veto and old validator, and denies role escalation', async () => {
    expect(
      (await admin.query('select count(*)::int n from world_v2.schema_release'))
        .rows[0].n,
    ).toBe(23);
    expect(
      (
        await admin.query(
          "select prosrc from pg_proc where oid='world_v2.validate_inventory_before_social_demo(jsonb,world_v2.inventory_posting)'::regprocedure",
        )
      ).rows[0].prosrc,
    ).toContain('validate_inventory_production_payload');
    for (const pool of [settler, reader, publisher, authority, lease])
      expect(
        (
          await pool.query(
            'select rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname=current_user',
          )
        ).rows[0],
      ).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      });
    await expect(
      reader.query(
        'update world_v2.world_head set world_version=world_version',
      ),
    ).rejects.toThrow('permission denied');
    await expect(
      settler.query(
        'update world_v2.current_commit_authorization set active=false',
      ),
    ).rejects.toThrow('permission denied');
    await expect(
      publisher.query('select * from world_v2.world_head for update'),
    ).rejects.toThrow('permission denied');
    await expect(
      authority.query('select * from world_v2.command_submission for update'),
    ).rejects.toThrow('permission denied');
    expect(
      (
        await admin.query(
          'select count(*)::int n from world_v2.runtime_opening_admission',
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('requires the real source executor, expires escaped scopes, and holds revocation through outer rollback', async () => {
    const db = new PostgresSqlDatabase(reader),
      identity = {
        simulationId: scenario.scope.simulationId,
        worldId: scenario.scope.worldId,
        countryId: scenario.scope.countryId,
      };
    let escaped: () => Promise<unknown> = async () => {};
    let observed = false;
    await expect(
      withSocialOfficeSimulatedTransaction(
        { database: db, identity },
        async (scope) => {
          const raw = await scope.peekSource();
          escaped = scope.peekSource;
          expect(() =>
            requireSocialOfficeProtectedSource(scope.executor, identity),
          ).toThrow('same-executor');
          await scope.protectSource({
            purpose: 'EMPLOYMENT',
            simTime: '0',
            expectedGeneration: raw.generation,
            expectedManifestHash: raw.manifestHash,
          });
          expect(
            requireSocialOfficeProtectedSource(scope.executor, identity)
              .generation,
          ).toBe('1');
          expect(() =>
            requireSocialOfficeProtectedSource(db, identity),
          ).toThrow('same-executor');
          const other = await authority.connect();
          try {
            await other.query('begin');
            await other.query("set local lock_timeout='100ms'");
            await expect(
              other.query(
                'select world_v2.social_demo_revise_automatic_authority($1::jsonb)',
                [
                  C.canonicalSerialize({
                    ...identity,
                    issuerRef: scenario.executionIdentity.publisher.issuerRef,
                    expectedAuthorizationVersion: 'SOCIAL_AUTO_V1',
                    nextAuthorizationVersion: 'SOCIAL_AUTO_V2',
                    active: false,
                    observedAtReal: new Date().toISOString(),
                  }),
                ],
              ),
            ).rejects.toThrow('lock timeout');
            observed = true;
            await other.query('rollback');
          } finally {
            other.release();
          }
          throw Error('FORCE_OUTER_ROLLBACK');
        },
      ),
    ).rejects.toThrow('ROLLED_BACK');
    expect(observed).toBe(true);
    await expect(escaped()).rejects.toThrow('ended scope');
    expect((await counts()).events).toBe(0);
  });
  it('commits a real plan exactly once under two simultaneous same-ID requests', async () => {
    plan = command(scenario, 'PLAN');
    const p = principal();
    const results = await Promise.all([
      repo.executeManual({ command: plan, principal: p }),
      repo.executeManual({ command: plan, principal: p }),
    ]);
    expect(results.map((x) => x.status)).toEqual(['FINAL', 'FINAL']);
    for (const result of results)
      if (result.status === 'FINAL')
        expect(result.receipt.outcome).toBe('COMMITTED');
    expect(await counts()).toEqual({
      events: 1,
      inventory: 0,
      financial: 0,
      receipts: 1,
      audit: 1,
      outbox: 1,
      version: '1',
    });
    const projection = await readRepo.readProjection({ principal: p });
    expect(projection.head.worldVersion).toBe('1');
  });
  it('rolls back an actual AFTER_EVENT database failure, retains committed T1, and never invents finality', async () => {
    const c = command(scenario, 'SERVE', '1');
    const before = await counts();
    await admin.query(
      "create function world_v2.d_native_fail_after_event() returns trigger language plpgsql as $$ begin if new.causation_command_id='D_SOCIAL_SERVE_A' then raise exception 'D_NATIVE_AFTER_EVENT_FAILURE'; end if; return new; end $$; create trigger d_native_fail_after_event after insert on world_v2.authoritative_event for each row execute function world_v2.d_native_fail_after_event()",
    );
    await expect(
      repo.executeManual({ command: c, principal: principal() }),
    ).rejects.toThrow('ROLLED_BACK');
    expect(await counts()).toEqual(before);
    expect(
      (await repo.recover({ command: c, principal: principal() })).status,
    ).toBe('PENDING');
    expect(
      (
        await admin.query(
          'select queue_state from world_v2.command_queue where command_id=$1',
          [c.commandId],
        )
      ).rows[0].queue_state,
    ).toBe('PENDING');
    await admin.query(
      'drop trigger d_native_fail_after_event on world_v2.authoritative_event; drop function world_v2.d_native_fail_after_event()',
    );
    const fault = acknowledgementFault(true);
    try {
      const result = await fault.repository.executeManual({
        command: c,
        principal: principal(),
      });
      expect(fault.lost()).toBe(true);
      expect(result).toMatchObject({ status: 'UNKNOWN', retryable: false });
    } finally {
      await fault.pool.end();
    }
    const recovered = await repo.recover({
      command: c,
      principal: principal(),
    });
    expect(recovered.status).toBe('FINAL');
    if (recovered.status === 'FINAL')
      expect(recovered.receipt.outcome).toBe('COMMITTED');
    expect(await counts()).toEqual({
      events: 2,
      inventory: 1,
      financial: 1,
      receipts: 2,
      audit: 2,
      outbox: 2,
      version: '2',
    });
    const projection = await readRepo.readProjection({
      principal: principal(),
    });
    expect(projection.social.clinic.backlog).toBe('9');
    // The existing Inventory writer removes zero balances after all five doses are consumed.
    expect(
      projection.inventory.balances.some(
        (b) =>
          b.account.unit === 'medical_dose' && b.account.bucket === 'AVAILABLE',
      ),
    ).toBe(false);
    expect(
      projection.inventory.appliedPostings.filter(
        (p) => p.socialService !== undefined,
      ),
    ).toHaveLength(1);
  });
  it('SQL rejects rehashed numeric medicine data before a duplicate service can persist', async () => {
    const before = await counts();
    const row = (
      await admin.query(
        "select * from world_v2.inventory_posting where operation='SERVICE_CONSUME'",
      )
    ).rows[0] as {
      canonical_payload: string;
      world_id: string;
      causation_command_id: string;
      world_version_before: string;
      world_version_after: string;
      sim_time: string;
      event_ids: unknown;
      transition_binding: string;
    };
    const p = JSON.parse(row.canonical_payload) as {
      postingId: string;
      entries: { delta: { amount: unknown } }[];
    };
    p.postingId = 'D_BAD_SERVICE_NUMERIC';
    p.entries[0]!.delta.amount = -5;
    // Deliberately bypass Core's number rejection to exercise the actual SQL decoder.
    const raw = JSON.stringify(p),
      fingerprint = `sha256:${digest(`SHA-256\n${raw}`)}`;
    await expect(
      admin.query(
        `insert into world_v2.inventory_posting(world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,operation,canonical_payload,posting_fingerprint) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'SERVICE_CONSUME',$9,$10)`,
        [
          row.world_id,
          p.postingId,
          row.causation_command_id,
          row.world_version_before,
          row.world_version_after,
          row.sim_time,
          C.canonicalSerialize(row.event_ids),
          row.transition_binding,
          raw,
          fingerprint,
        ],
      ),
    ).rejects.toThrow('SOCIAL_SERVICE_ENTRY_SHAPE');
    expect(await counts()).toEqual(before);
  });
  it('uses native single-action capabilities and current seat, then restores a new revision without rewriting documents', async () => {
    const before = await counts();
    await admin.query(
      "update world_v2.current_commit_authorization set active=false where capability='SOCIAL_LABOUR'",
    );
    await expect(
      readRepo.readProjection({ principal: principal() }),
    ).rejects.toThrow('ROLLED_BACK');
    const c = command(scenario, 'ADMIT', '2');
    const fault = acknowledgementFault(false);
    try {
      const result = await fault.repository.executeManual({
        command: c,
        principal: principal(),
      });
      expect(fault.lost()).toBe(true);
      expect(result.status).toBe('FINAL');
      if (result.status === 'FINAL')
        expect(result.receipt.outcome).toBe('COMMITTED');
    } finally {
      await fault.pool.end();
    }
    await expect(
      repo.executeManual({
        command: command(scenario, 'PLAN', '3', '0', 'DENIED'),
        principal: principal(),
      }),
    ).rejects.toThrow('ROLLED_BACK');
    expect((await counts()).events).toBe(before.events + 1);
    const request = {
      simulationId: scenario.scope.simulationId,
      worldId: scenario.scope.worldId,
      countryId: scenario.scope.countryId,
      authSubject: scenario.authSubject,
      expectedAuthorizationVersion: 'SOCIAL_AUTH_V1',
      nextAuthorizationVersion: 'SOCIAL_AUTH_V2',
      active: true,
      observedAtReal: new Date().toISOString(),
    };
    await authority.query(
      'select world_v2.social_demo_revise_manual_authority($1::jsonb)',
      [C.canonicalSerialize(request)],
    );
    expect(
      (await readRepo.readProjection({ principal: principal() })).head
        .worldVersion,
    ).toBe('3');
    expect(
      (
        await admin.query(
          'select count(*)::int n from world_v2.social_demo_source_record',
        )
      ).rows[0].n,
    ).toBe(19);
  });
  it('requires the independent native automatic grant and real original PLAN, then commits MATCH once at day1', async () => {
    await advance('1');
    due = match(scenario, plan, '3');
    await admin.query(
      'update world_v2.social_demo_automatic_authorization set active=false',
    );
    const before = await counts();
    await expect(repo.executeDueMatch({ command: due })).rejects.toThrow(
      'ROLLED_BACK',
    );
    expect(await counts()).toEqual(before);
    await authority.query(
      'select world_v2.social_demo_revise_automatic_authority($1::jsonb)',
      [
        C.canonicalSerialize({
          simulationId: scenario.scope.simulationId,
          worldId: scenario.scope.worldId,
          countryId: scenario.scope.countryId,
          issuerRef: scenario.executionIdentity.publisher.issuerRef,
          expectedAuthorizationVersion: 'SOCIAL_AUTO_V1',
          nextAuthorizationVersion: 'SOCIAL_AUTO_V2',
          active: true,
          observedAtReal: new Date().toISOString(),
        }),
      ],
    );
    const result = await repo.executeDueMatch({ command: due });
    expect(result.status).toBe('FINAL');
    if (result.status === 'FINAL')
      expect(result.receipt.outcome).toBe('COMMITTED');
    expect(
      (await readRepo.readProjection({ principal: principal() })).head
        .worldVersion,
    ).toBe('4');
  });
  it('replays the complete real SERVICE/financial prefix at day10 and restores old finals after source/auto revocation', async () => {
    await advance('10');
    const before = await counts();
    await expect(
      repo.executeDueMatch({
        command: match(scenario, plan, '4', '10', 'LATE'),
      }),
    ).rejects.toThrow('ROLLED_BACK');
    const graduated = await repo.executeManual({
      command: command(scenario, 'GRADUATE', '4', '10'),
      principal: principal(),
    });
    expect(graduated.status).toBe('FINAL');
    if (graduated.status === 'FINAL')
      expect(graduated.receipt.outcome).toBe('COMMITTED');
    expect(
      (await readRepo.readProjection({ principal: principal() })).head
        .worldVersion,
    ).toBe('5');
    const latest = (
      await admin.query(
        'select generation::text,manifest_hash,publication_utf8 from world_v2.social_demo_source_revision order by generation desc limit 1',
      )
    ).rows[0] as {
      generation: string;
      manifest_hash: string;
      publication_utf8: string;
    };
    const publication = JSON.parse(latest.publication_utf8) as Record<
      string,
      unknown
    >;
    await publishSocialOfficeSimulatedSource(
      new PostgresSqlDatabase(publisher),
      {
        ...publication,
        operationId: 'D_REVOKE_SOURCE',
        expectedGeneration: latest.generation,
        expectedManifestHash: latest.manifest_hash,
        disposition: 'REVOKED',
      },
    );
    await admin.query(
      'update world_v2.social_demo_automatic_authorization set active=false',
    );
    const recovered = await repo.executeDueMatch({ command: due });
    expect(recovered.status).toBe('FINAL');
    if (recovered.status === 'FINAL')
      expect(recovered.receipt.outcome).toBe('COMMITTED');
    const receipt = await readRepo.readReceipt({
      principal: principal(),
      commandId: plan.commandId,
    });
    expect(receipt.status).toBe('FINAL');
    expect((await counts()).events).toBe(before.events + 1);
    await expect(
      readRepo.readProjection({ principal: principal() }),
    ).rejects.toThrow('ROLLED_BACK');
  });
  it('the sole issuer rejects an unknown sibling in the entire native prefix and rolls the control back', async () => {
    const latest = (
      await admin.query(
        'select generation::text,manifest_hash,publication_utf8 from world_v2.social_demo_source_revision order by generation desc limit 1',
      )
    ).rows[0] as {
      generation: string;
      manifest_hash: string;
      publication_utf8: string;
    };
    await publishSocialOfficeSimulatedSource(
      new PostgresSqlDatabase(publisher),
      {
        ...JSON.parse(latest.publication_utf8),
        operationId: 'D_RESTORE_FOR_PREFIX_CONTROL',
        expectedGeneration: latest.generation,
        expectedManifestHash: latest.manifest_hash,
        disposition: 'ACTIVE',
      },
    );
    const before = await counts(),
      db = new PostgresSqlDatabase(admin);
    const identity = {
      simulationId: scenario.scope.simulationId,
      worldId: scenario.scope.worldId,
      countryId: scenario.scope.countryId,
    };
    const c = command(scenario, 'PLAN', '5', '10', 'UNKNOWN_SIBLING');
    const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'D_UNKNOWN_SIBLING_EVENT',
        eventType: 'UNSUPPORTED_SOCIAL_SIBLING_V1',
        worldId: c.worldId,
        worldVersion: '6',
        sequence: '6',
        causationCommandId: c.commandId,
        correlationId: c.correlationId,
        correctsEventId: null,
        simTime: c.simTime.toCanonicalValue(),
        recordedAtReal: new Date().toISOString(),
        payload: {},
      },
      digest,
    );
    const transition = C.createAuthoritativeTransition({
      command: c,
      worldVersionBefore: '5',
      worldVersionAfter: '6',
      events: [event],
    });
    const receipt = C.createFinalCommandReceipt({
      command: c,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: c.simTime,
      recordedAtReal: event.recordedAtReal,
    });
    let rejected = false;
    try {
      await withSocialOfficeSimulatedTransaction(
        { database: db, identity },
        async (scope) => {
          const raw = await scope.peekSource();
          await scope.protectSource({
            purpose: 'EMPLOYMENT',
            simTime: c.simTime.toCanonicalValue(),
            expectedGeneration: raw.generation,
            expectedManifestHash: raw.manifestHash,
          });
          await scope.executor.query(
            `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
          await scope.executor.query(
            'select * from world_v2.assert_world_writer_commit_guard($1,$2,1,5,$3)',
            [c.worldId, 'SOCIAL_DEMO_WORKER_V1', new Date().toISOString()],
          );
          await scope.executor.query(
            `insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id) values($1,$2,6,6,$3,$4,$5,$6,$7,$8,$9,$10,$11,null)`,
            [
              c.worldId,
              event.eventId,
              c.commandId,
              c.correlationId,
              event.eventType,
              event.schemaVersion,
              event.canonicalPayload,
              event.payloadHash,
              event.fingerprint,
              event.simTime.toCanonicalValue(),
              event.recordedAtReal,
            ],
          );
          await scope.executor.query(
            `insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real) values($1,$2,$3,$4,$5,'COMMITTED',null,$2,5,6,$6,$7::jsonb,$8)`,
            [
              c.worldId,
              c.commandId,
              c.idempotencyKey,
              receipt.schemaVersion,
              c.fingerprint,
              c.simTime.toCanonicalValue(),
              C.canonicalSerialize(receipt.eventIds),
              receipt.recordedAtReal,
            ],
          );
          await scope.executor.query(
            'update world_v2.world_head set world_version=6,event_sequence=6 where world_id=$1',
            [c.worldId],
          );
          const reader = new DurableV08LedgerLineageReader({
            database: db,
            sha256Hex: digest,
            socialSimulation: {
              ...identity,
              seedId: scenario.seed.seedId,
              seedFingerprint: scenario.seed.fingerprint,
            },
          });
          await withValidatedCanonicalLineageFrom(
            { reader, executor: scope.executor, worldId: c.worldId },
            async () => {
              throw Error('MUST_NOT_ISSUE_VIEW');
            },
          );
        },
      );
    } catch (error) {
      expect((error as Error).cause).toMatchObject({
        message: expect.stringContaining('Unsupported/unknown sibling'),
      });
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(await counts()).toEqual(before);
  });
});
