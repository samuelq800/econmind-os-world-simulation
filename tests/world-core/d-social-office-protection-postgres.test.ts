// Owned disposable PostgreSQL source protocol only; no World action/admission.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  publishSocialOfficeSimulatedSource,
  type SocialOfficeSimulatedSourceRequest,
} from '../../apps/world-worker/src/persistence/social-office-simulated-source-custody.js';
import { withSocialOfficeSimulatedSourceTransaction } from '../../apps/world-worker/src/persistence/social-office-resource-protection.js';

const suite = process.env.D_SOCIAL_SOURCE_NATIVE_MARKER
  ? describe
  : describe.skip;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const scope = {
  simulationId: 'SIM_SOCIAL_SOURCE_V1',
  worldId: 'WORLD_SOCIAL_SINGLE_DEMO_V1',
  countryId: 'COUNTRY_01',
};
const readerRole = 'd_social_source_reader',
  publisherRole = 'd_social_source_publisher';
let admin: Pool, reader: Pool, publisher: Pool;
let db: PostgresSqlDatabase, writer: PostgresSqlDatabase;
let sequence = 0;
function records() {
  const catalog = {
    schemaVersion: 'social-office-simulated-resource-catalog-v1',
    sourceClass: 'SIMULATED_OPENING',
    ...scope,
    resources: [
      {
        resourceId: 'SIM_M001',
        kind: 'PERSON',
        unit: 'person',
        aliases: ['SIM_M001', 'BUREAU_CASEWORKER', 'COLLEGE_REGISTRAR'],
      },
      {
        resourceId: 'SIM_M001_TIME_DAY0',
        kind: 'TIME',
        unit: 'minute',
        aliases: ['SIM_M001_TIME_DAY0'],
      },
      {
        resourceId: 'CLINIC_BUDGET',
        kind: 'BUDGET',
        unit: 'XAA',
        aliases: ['CLINIC_BUDGET'],
      },
      {
        resourceId: 'CLINIC_MEDICINE',
        kind: 'MEDICINE',
        unit: 'medical_dose',
        aliases: ['CLINIC_MEDICINE'],
      },
      {
        resourceId: 'CLINIC_FACILITY',
        kind: 'FACILITY',
        unit: 'minute',
        aliases: ['CLINIC_FACILITY'],
      },
    ],
  };
  const body = {
    worldId: scope.worldId,
    countryId: scope.countryId,
    locationId: 'REGION_01_E1',
    dayIndex: '0',
    sharedCatalogRef: 'COMMON_RF_RESOURCE_CATALOG_V1',
  };
  return [
    {
      recordId: 'COMMON_RF_RESOURCE_CATALOG_V1',
      revision: 'V1',
      role: 'RESOURCE_CATALOG',
      physicalGroupKey: null as string | null,
      rawUtf8: canonicalSerialize(catalog),
    },
    {
      recordId: 'DAY0_ORIGINAL',
      revision: 'V1',
      role: 'PHYSICAL_ORIGINAL_BODY',
      physicalGroupKey: sha(
        [
          'SOCIAL_PHYSICAL_GROUP_V1',
          scope.worldId,
          scope.countryId,
          'REGION_01_E1',
          '0',
        ].join('\n'),
      ),
      rawUtf8: canonicalSerialize(body),
    },
  ].map((r) => ({ ...r, sha256: sha(r.rawUtf8) }));
}
async function publication() {
  const latest = (
    await admin.query(
      'select generation::text,manifest_hash from world_v2.social_demo_source_revision order by generation desc limit 1',
    )
  ).rows[0] as { generation: string; manifest_hash: string } | undefined;
  return {
    schemaVersion: 'social-office-simulated-source-publication-v1',
    sourceClass: 'SIMULATED_OPENING',
    ...scope,
    operationId: `PUBLISH_${++sequence}`,
    expectedGeneration: latest?.generation ?? '0',
    expectedManifestHash: latest?.manifest_hash ?? null,
    validFromSimTime: '0',
    validUntilSimTime: '100' as string | null,
    disposition: 'ACTIVE',
    allowedPurposes: ['EDUCATION', 'EMPLOYMENT', 'HEALTHCARE'],
    selectedRecordIds: records().map((r) => r.recordId),
    records: records(),
  };
}
const request: SocialOfficeSimulatedSourceRequest = {
  schemaVersion: 'social-office-simulated-source-request-v1',
  sourceClass: 'SIMULATED_OPENING',
  ...scope,
  purpose: 'EMPLOYMENT',
  simTime: '0',
  expectedGeneration: null,
  expectedManifestHash: null,
};
const read = (r = request) =>
  withSocialOfficeSimulatedSourceTransaction(
    { database: db, request: r },
    async (s) => {
      await s.assertCurrent();
      return s.source;
    },
  );
async function counts() {
  return (
    await admin.query(
      'select (select count(*)::int from world_v2.social_demo_source_record) records,(select count(*)::int from world_v2.social_demo_source_revision) revisions',
    )
  ).rows[0] as { records: number; revisions: number };
}
suite('D native simulated source immutable originals and protection', () => {
  beforeAll(async () => {
    const markerPath = process.env.D_SOCIAL_SOURCE_NATIVE_MARKER!;
    if (!path.isAbsolute(markerPath)) throw Error('OWNED_MARKER_REQUIRED');
    const st = await lstat(markerPath),
      uid = process.getuid?.();
    if (
      !st.isFile() ||
      st.isSymbolicLink() ||
      uid === undefined ||
      uid === 0 ||
      st.uid !== uid
    )
      throw Error('OWNED_MARKER_REQUIRED');
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as {
      uid: number;
      root: string;
      data: string;
      database: string;
      port: number;
      serverPid: number;
    };
    if (
      marker.uid !== uid ||
      !path.basename(marker.root).startsWith('econmind-d-social-source-') ||
      marker.data !== path.join(marker.root, 'data') ||
      (await realpath(marker.root)) !== marker.root ||
      (await realpath(marker.data)) !== marker.data
    )
      throw Error('FOREIGN_CLUSTER');
    for (const name of [marker.root, marker.data]) {
      const stat = await lstat(name);
      if (stat.uid !== uid || (stat.mode & 0o777) !== 0o700)
        throw Error('PRIVATE_CLUSTER_REQUIRED');
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
    const target = assertV09PostgresTestEnvironment();
    admin = new Pool({
      connectionString: target.connectionString,
      max: 3,
      options: '-c statement_timeout=5000',
    });
    const actual = (
      await admin.query(
        "select current_database() db,host(inet_server_addr()) host,current_setting('data_directory') data,current_setting('port')::int port,current_setting('server_version') version",
      )
    ).rows[0];
    expect(actual).toMatchObject({
      db: marker.database,
      host: '127.0.0.1',
      data: marker.data,
      port: marker.port,
    });
    expect(actual.version).toMatch(/^16\./u);
    expect(marker.database).toMatch(/^econmind_v09_d_social_source_/u);
    expect(
      (
        await admin.query(
          "select 1 from information_schema.schemata where schema_name='world_v2'",
        )
      ).rows,
    ).toHaveLength(0);
    const fixture = await loadFrozenRenewalMigrationFixture(
      path.resolve(import.meta.dirname, '../..'),
    );
    // Current full provenance validated by existing helper, first9 installed only.
    for (const [i, m] of fixture.manifest.migrations.slice(0, 9).entries()) {
      await admin.query(fixture.artifacts[i]!);
      await admin.query(
        'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
        [m.migration_id, m.sha256, m.artifact_source_commit, m.release_order],
      );
    }
    await admin.query(
      await readFile(
        path.resolve(
          import.meta.dirname,
          '../support/social-office-simulated-source-schema.sql',
        ),
        'utf8',
      ),
    );
    await admin.query('insert into world_v2.world_head(world_id) values($1)', [
      scope.worldId,
    ]);
    await admin.query(
      "insert into world_v2.social_demo_source_scope(simulation_id,world_id,country_id,schema_version,source_class) values($1,$2,$3,'social-office-simulated-source-store-v1','SIMULATED_OPENING')",
      Object.values(scope),
    );
    for (const role of [readerRole, publisherRole]) {
      await admin.query(
        `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
      await admin.query(`grant usage on schema world_v2 to ${role}`);
    }
    await admin.query(
      `grant select on world_v2.social_demo_source_scope,world_v2.social_demo_source_record,world_v2.social_demo_source_revision to ${readerRole}`,
    );
    await admin.query(
      `grant update(lock_column) on world_v2.social_demo_source_scope to ${readerRole}`,
    );
    await admin.query(
      `grant execute on function world_v2.social_demo_publish_source(text) to ${publisherRole}`,
    );
    const readerURL = new URL(target.connectionString),
      writerURL = new URL(target.connectionString);
    readerURL.username = readerRole;
    writerURL.username = publisherRole;
    reader = new Pool({
      connectionString: readerURL.toString(),
      max: 2,
      application_name: 'd_social_source_reader',
      options: '-c statement_timeout=5000',
    });
    publisher = new Pool({
      connectionString: writerURL.toString(),
      max: 2,
      application_name: 'd_social_source_publisher',
      options: '-c statement_timeout=5000',
    });
    db = new PostgresSqlDatabase(reader);
    writer = new PostgresSqlDatabase(publisher);
  }, 30000);
  afterAll(async () => {
    await Promise.all([reader?.end(), publisher?.end(), admin?.end()]);
  });
  it('uses two actual least-privilege principals without World write authority', async () => {
    for (const pool of [reader, publisher]) {
      const r = (
        await pool.query(
          "select rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,(select count(*)::int from pg_auth_members where member=r.oid) memberships,has_schema_privilege(current_user,'world_v2','CREATE') ddl,has_table_privilege(current_user,'world_v2.world_head','UPDATE') worldwrite from pg_roles r where rolname=current_user",
        )
      ).rows[0];
      expect(r).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        memberships: 0,
        ddl: false,
        worldwrite: false,
      });
    }
    const r = (
      await reader.query(
        "select has_column_privilege(current_user,'world_v2.social_demo_source_scope','lock_column','UPDATE') lockupdate,has_table_privilege(current_user,'world_v2.social_demo_source_scope','UPDATE') broadupdate,has_function_privilege(current_user,'world_v2.social_demo_publish_source(text)','EXECUTE') publish",
      )
    ).rows[0];
    expect(r).toEqual({ lockupdate: true, broadupdate: false, publish: false });
    await expect(
      reader.query(
        'update world_v2.social_demo_source_scope set lock_column=true',
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      publisher.query('select * from world_v2.social_demo_source_record'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('publishes and reads shared three-department source; exact retry is publication-only', async () => {
    const p = await publication(),
      first = await publishSocialOfficeSimulatedSource(writer, p),
      again = await publishSocialOfficeSimulatedSource(writer, p);
    expect(first).toMatchObject({ source: 'NEW', generation: '1' });
    expect(again).toMatchObject({ source: 'EXISTING', generation: '1' });
    const result = await read();
    expect(result).toMatchObject({
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      actualSourceCustodian: 'SUPPLIER_UNCONFIRMED',
      generation: '1',
    });
    expect(result.publication.allowedPurposes).toEqual([
      'EDUCATION',
      'EMPLOYMENT',
      'HEALTHCARE',
    ]);
    expect(await counts()).toEqual({ records: 2, revisions: 1 });
    await expect(
      publishSocialOfficeSimulatedSource(writer, {
        ...p,
        disposition: 'REVOKED',
      }),
    ).rejects.toThrow();
    expect(await counts()).toEqual({ records: 2, revisions: 1 });
  });
  it('rejects original replacement, dropped originals and stale CAS with zero partial inserts', async () => {
    const before = await counts(),
      p = await publication();
    await expect(
      publishSocialOfficeSimulatedSource(writer, {
        ...p,
        expectedGeneration: '0',
        expectedManifestHash: null,
      }),
    ).rejects.toThrow();
    const changed = structuredClone(p);
    changed.records[1]!.rawUtf8 = canonicalSerialize({
      ...JSON.parse(changed.records[1]!.rawUtf8),
      capacity: '999',
    });
    changed.records[1]!.sha256 = sha(changed.records[1]!.rawUtf8);
    await expect(
      publishSocialOfficeSimulatedSource(writer, changed),
    ).rejects.toThrow();
    const missing = {
      ...p,
      selectedRecordIds: ['COMMON_RF_RESOURCE_CATALOG_V1'],
      records: [p.records[0]!],
    };
    await expect(
      publishSocialOfficeSimulatedSource(writer, missing),
    ).rejects.toThrow();
    const alias = structuredClone(p);
    alias.records.push({ ...alias.records[1]!, recordId: 'DAY0_RENAMED' });
    alias.selectedRecordIds.push('DAY0_RENAMED');
    // Direct fixed SQL call bypasses TS; the original-group unique constraint still refuses.
    await expect(
      publisher.query('select world_v2.social_demo_publish_source($1)', [
        canonicalSerialize(alias),
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await counts()).toEqual(before);
  });
  it('independently validates SQL types, nulls, tuple identity and duplicate raw JSON keys', async () => {
    const p = await publication(),
      before = await counts();
    for (const change of [
      { disposition: null },
      { allowedPurposes: null },
      { expectedGeneration: 1 },
      { selectedRecordIds: [] },
      { sourceClass: 'ADMITTED' },
    ]) {
      await expect(
        publisher.query('select world_v2.social_demo_publish_source($1)', [
          JSON.stringify({ ...p, ...change }),
        ]),
      ).rejects.toThrow();
    }
    const forged = structuredClone(p);
    forged.records[1]!.physicalGroupKey = sha('renamed');
    await expect(
      publisher.query('select world_v2.social_demo_publish_source($1)', [
        canonicalSerialize(forged),
      ]),
    ).rejects.toThrow();
    const dup = structuredClone(p);
    dup.records[1]!.rawUtf8 = dup.records[1]!.rawUtf8.replace(
      '{',
      '{"dayIndex":"99",',
    );
    dup.records[1]!.sha256 = sha(dup.records[1]!.rawUtf8);
    await expect(
      publisher.query('select world_v2.social_demo_publish_source($1)', [
        canonicalSerialize(dup),
      ]),
    ).rejects.toThrow('DUPLICATE_KEY');
    expect(await counts()).toEqual(before);
  });
  it('retains actual source anchor after inner callback through a pending outer COMMIT', async () => {
    const probe = await admin.connect();
    let innerReturned = false;
    await probe.query('select pg_advisory_lock(47193428)');
    let pending: Promise<unknown> | undefined;
    try {
      pending = withSocialOfficeSimulatedSourceTransaction(
        { database: db, request },
        async (s) => {
          await s.executor.query(
            'create temporary table d_social_commit_probe(i int)',
          );
          await s.executor.query(
            'create function pg_temp.d_social_wait_commit() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(47193428); return new; end$$',
          );
          await s.executor.query(
            'create constraint trigger d_social_outer_commit after insert on d_social_commit_probe deferrable initially deferred for each row execute function pg_temp.d_social_wait_commit()',
          );
          await s.executor.query('insert into d_social_commit_probe values(1)');
          await s.assertCurrent();
          innerReturned = true;
          return 'done';
        },
      );
      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i++) {
        blocked =
          (
            await admin.query(
              "select 1 from pg_stat_activity where application_name='d_social_source_reader' and wait_event='advisory'",
            )
          ).rows.length === 1;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(innerReturned).toBe(true);
      expect(blocked).toBe(true);
      const p = await publication(),
        client = await publisher.connect();
      try {
        await client.query("set lock_timeout='50ms'");
        await expect(
          client.query('select world_v2.social_demo_publish_source($1)', [
            canonicalSerialize(p),
          ]),
        ).rejects.toMatchObject({ code: '55P03' });
      } finally {
        await client.query('reset lock_timeout');
        client.release();
      }
      await probe.query('select pg_advisory_unlock(47193428)');
      await expect(pending).resolves.toBe('done');
      await expect(
        publishSocialOfficeSimulatedSource(writer, p),
      ).resolves.toMatchObject({ source: 'NEW' });
    } finally {
      await probe.query('select pg_advisory_unlock(47193428)');
      probe.release();
      if (pending) await pending.catch(() => {});
    }
  });
  it('rechecks prepared pins and revoked/expired/wrong-purpose applicability', async () => {
    const before = await read(),
      p = await publication();
    p.allowedPurposes = ['EMPLOYMENT'];
    p.validUntilSimTime = '1';
    await publishSocialOfficeSimulatedSource(writer, p);
    await expect(
      read({
        ...request,
        expectedGeneration: before.generation,
        expectedManifestHash: before.manifestHash,
      }),
    ).rejects.toThrow();
    await expect(read({ ...request, purpose: 'EDUCATION' })).rejects.toThrow();
    await expect(read({ ...request, simTime: '1' })).rejects.toThrow();
    const revoked = await publication();
    revoked.disposition = 'REVOKED';
    await publishSocialOfficeSimulatedSource(writer, revoked);
    await expect(read()).rejects.toThrow();
    await publishSocialOfficeSimulatedSource(writer, await publication());
    expect((await read()).sourceAdmitted).toBe(false);
  });
  it('releases locks on actual rollback and rejects ended closures; keeps committed originals', async () => {
    const before = await counts();
    let ended: (() => Promise<void>) | undefined;
    await expect(
      withSocialOfficeSimulatedSourceTransaction(
        { database: db, request },
        async (s) => {
          ended = s.assertCurrent;
          await s.assertCurrent();
          throw Error('controlled rollback');
        },
      ),
    ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
    await expect(ended!()).rejects.toThrow('ended scope');
    expect(await counts()).toEqual(before);
    await expect(
      publishSocialOfficeSimulatedSource(writer, await publication()),
    ).resolves.toMatchObject({ source: 'NEW' });
    console.log(
      'NATIVE_SIMULATED_SOCIAL_SOURCE_PROTOCOL_ONLY_NOT_WORLD_ACTIONS',
    );
  });
});
