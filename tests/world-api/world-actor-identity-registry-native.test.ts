/** Opt-in actual PG16.15 tiny private cluster. The owned runner alone produces
 * the marker. No shared DSN, World source, actor assignments or production. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresWorldActorResolver,
  publishWorldActorBindingFrom,
  publishWorldActorReaderScopeFrom,
  revokeWorldActorRegistryFrom,
  WORLD_ACTOR_BINDING_READ_QUERY,
  type WorldActorBindingOriginal,
} from '../../apps/world-api/src/integration/postgres-world-actor-registry.js';

const flag = process.env.ECONMIND_ACTOR_REGISTRY_NATIVE_TESTS;
const markerFile = process.env.ECONMIND_ACTOR_REGISTRY_NATIVE_MARKER;
if (
  (flag !== undefined || markerFile !== undefined) &&
  (flag !== '1' || !markerFile)
)
  throw Error('ACTOR_NATIVE_COMPLETE_OWNED_RUNNER_CONFIGURATION_REQUIRED');
const enabled = flag === '1';
const WORLD = 'WORLD_ACTOR_NATIVE_TEST_ONLY';
const OTHER = 'WORLD_ACTOR_OTHER_NATIVE_TEST_ONLY';
const subject = '11111111-1111-4111-8111-111111111111';
const unused = '22222222-2222-4222-8222-222222222222';
const issuerRef = 'ISSUER_ACTOR_NATIVE_TEST_ONLY';
const originalSha256 = 'a'.repeat(64);
const sha = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
interface Marker {
  schema: 'WORLD_ACTOR_NATIVE_OWNED_V1';
  image: string;
  nonce: string;
  ownedContainer: string;
  socket: string;
  database: string;
  evidenceDirectory: string;
  sqlSha256: string;
}
const pinnedImage =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';

describe.skipIf(!enabled)('actual native World actor identity registry', () => {
  let marker: Marker;
  let admin: Pool;
  let pub1: Pool;
  let pub2: Pool;
  let reader: Pool;
  let outsider: Pool;
  const pools: Pool[] = [];
  const observations: Record<string, unknown> = {
    classification: 'TEST_ONLY_ACTOR_REGISTRY_NATIVE_NOT_PRODUCTION',
    raceOutcomes: [],
    cleanup: {},
  };
  const readerRole = 'actor_native_reader';
  function pool(user: string): Pool {
    const value = new Pool({
      host: marker.socket,
      port: 5432,
      database: marker.database,
      user,
      password: async () => '',
      ssl: false,
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
      application_name: 'ACTOR_NATIVE_TEST_ONLY_' + user,
    });
    // No default pg idle-error dump of the client/configuration.
    value.on('error', (error) => {
      observations.idleError = { message: error.message };
    });
    pools.push(value);
    return value;
  }
  async function publish<T>(
    source: Pool,
    consume: (client: PoolClient) => Promise<T>,
  ) {
    const client = await source.connect();
    try {
      await client.query('begin isolation level serializable read write');
      const result = await consume(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  const binding = (
    suffix: string,
    authSubject = subject,
  ): WorldActorBindingOriginal => ({
    worldId: WORLD,
    authSubject,
    actorId: 'ACTOR_NATIVE_' + suffix,
    bindingRef: 'BINDING_NATIVE_' + suffix,
    issuerRef,
    originalSha256,
  });
  async function currentRead(source: Pool, world = WORLD, auth = subject) {
    const client = await source.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
        auth,
      ]);
      const result = await client.query(WORLD_ACTOR_BINDING_READ_QUERY, [
        world,
        auth,
      ]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    marker = JSON.parse(await readFile(markerFile!, 'utf8')) as Marker;
    if (
      marker.schema !== 'WORLD_ACTOR_NATIVE_OWNED_V1' ||
      marker.image !== pinnedImage ||
      !/^[0-9a-f]{32}$/u.test(marker.nonce) ||
      marker.ownedContainer !== 'econmind-actor-native-' + marker.nonce ||
      marker.socket !== path.join(marker.evidenceDirectory, 'socket') ||
      marker.database !== 'actor_registry_' + marker.nonce ||
      path.dirname(markerFile!) !== marker.evidenceDirectory
    )
      throw Error('ACTOR_NATIVE_OWNERSHIP_MARKER_INVALID');
    admin = pool('postgres');
    const version = await admin.query<{ version: string; version_num: string }>(
      "select version(),current_setting('server_version_num')as version_num",
    );
    expect(version.rows[0]?.version_num).toBe('160015');
    observations.server = version.rows[0];
    await admin.query(`create schema unrelated_application;
      create table unrelated_application.sentinel(id integer primary key,value text);
      insert into unrelated_application.sentinel values(1,'MUST_PRESERVE_EXISTING_DATA');
      create role actor_unrelated_sentinel nologin;
      create schema world_v2;
      create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
      insert into world_v2.world_head values('${WORLD}',0,0),('${OTHER}',0,0)`);
    const sql = await readFile(
      new URL(
        '../../database/proposals/world-actor-identity-registry.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(sha(sql)).toBe(marker.sqlSha256);
    await admin.query(sql);
    // Explicit fixture-only LOGIN roles; proposal itself creates no membership.
    await admin.query(`create role actor_native_pub1 login;create role actor_native_pub2 login;
      create role ${readerRole} login;create role actor_native_outsider login;
      grant world_v2_actor_registry_publisher to actor_native_pub1,actor_native_pub2;
      grant world_v2_actor_registry_reader to ${readerRole};
      grant usage on schema world_v2 to actor_native_outsider`);
    pub1 = pool('actor_native_pub1');
    pub2 = pool('actor_native_pub2');
    reader = pool(readerRole);
    outsider = pool('actor_native_outsider');
    await publish(pub1, (client) =>
      publishWorldActorReaderScopeFrom(client, {
        worldId: WORLD,
        scopeRef: 'SCOPE_NATIVE_TEST_ONLY',
        readerRole,
        issuerRef,
        originalSha256,
      }),
    );
  });
  afterAll(async () => {
    const cleanup: unknown[] = [];
    try {
      if (admin) {
        const rows = await admin.query(
          'select * from unrelated_application.sentinel',
        );
        observations.sentinelAfter = rows.rows;
        expect(rows.rows).toEqual([
          { id: 1, value: 'MUST_PRESERVE_EXISTING_DATA' },
        ]);
        const heads = await admin.query(
          'select world_id,world_version::text,event_sequence::text from world_v2.world_head order by world_id',
        );
        observations.headsAfter = heads.rows;
        expect(
          heads.rows.every(
            (r) => r.world_version === '0' && r.event_sequence === '0',
          ),
        ).toBe(true);
      }
    } catch (error) {
      cleanup.push(error);
    }
    const settled = await Promise.allSettled(pools.map((value) => value.end()));
    for (const item of settled)
      if (item.status === 'rejected') cleanup.push(item.reason);
    if (pools.some((value) => value.totalCount !== 0))
      cleanup.push(Error('ACTOR_NATIVE_POOL_CONNECTIONS_REMAIN'));
    observations.cleanup = {
      pools: pools.length,
      allPoolEndsSettled: true,
      poolErrors: cleanup.map(String),
      remainingPoolConnections: pools.map((p) => p.totalCount),
    };
    if (marker)
      await writeFile(
        path.join(marker.evidenceDirectory, 'actual-native-observations.json'),
        JSON.stringify(observations, null, 2) + '\n',
      );
    if (cleanup.length)
      throw new AggregateError(cleanup, 'ACTOR_NATIVE_TEST_CLEANUP_FAILED');
  });

  it('installs into a fresh isolated database without changing unrelated schema/roles or creating identity defaults', async () => {
    expect(
      (await admin.query('select * from world_v2.world_actor_binding'))
        .rowCount,
    ).toBe(0);
    expect(
      (await admin.query('select * from unrelated_application.sentinel')).rows,
    ).toEqual([{ id: 1, value: 'MUST_PRESERVE_EXISTING_DATA' }]);
    const roles = await admin.query(
      "select rolname,rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname like 'world_v2_actor_registry_%' order by rolname",
    );
    expect(roles.rows).toHaveLength(3);
    expect(
      roles.rows.every((r) => !r.rolcanlogin && !r.rolsuper && !r.rolbypassrls),
    ).toBe(true);
    expect(
      (
        await admin.query(
          "select rolcanlogin from pg_roles where rolname='actor_unrelated_sentinel'",
        )
      ).rows[0]?.rolcanlogin,
    ).toBe(false);
    observations.registryProfiles = roles.rows;
  });

  it('two actual concurrent publisher backends cannot create two active subject or actor bindings', async () => {
    for (const kind of ['SUBJECT', 'ACTOR'] as const) {
      const auth1 =
        kind === 'SUBJECT'
          ? '33333333-3333-4333-8333-333333333333'
          : '44444444-4444-4444-8444-444444444444';
      const auth2 =
        kind === 'SUBJECT' ? auth1 : '55555555-5555-4555-8555-555555555555';
      const first = binding(kind + '_FIRST', auth1);
      const second = {
        ...binding(kind + '_SECOND', auth2),
        actorId:
          kind === 'ACTOR' ? first.actorId : 'ACTOR_NATIVE_SUBJECT_SECOND',
      };
      const a = await pub1.connect();
      const b = await pub2.connect();
      let pending: Promise<{ outcome: string; code?: string }> | undefined;
      try {
        await a.query('begin isolation level serializable read write');
        await b.query('begin isolation level serializable read write');
        // Assign both serializable snapshots before either binding commits.
        const pidA = (
          await a.query('select pg_backend_pid()as pid,count(*)from pg_roles')
        ).rows[0].pid;
        const pidB = (
          await b.query('select pg_backend_pid()as pid,count(*)from pg_roles')
        ).rows[0].pid;
        expect(pidA).not.toBe(pidB);
        await publishWorldActorBindingFrom(a, first);
        pending = (async () => {
          try {
            await publishWorldActorBindingFrom(b, second);
            await b.query('commit');
            return { outcome: 'COMMITTED' };
          } catch (error) {
            await b.query('rollback');
            return {
              outcome: 'REJECTED',
              code: String((error as { code?: string }).code),
            };
          }
        })();
        let actualAdvisoryWait = false;
        const until = Date.now() + 3000;
        while (Date.now() < until) {
          const activity = await admin.query(
            'select wait_event_type,wait_event from pg_stat_activity where pid=$1',
            [pidB],
          );
          if (
            activity.rows[0]?.wait_event_type === 'Lock' &&
            activity.rows[0]?.wait_event === 'advisory'
          ) {
            actualAdvisoryWait = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(actualAdvisoryWait).toBe(true);
        await a.query('commit');
        const loser = await pending;
        expect(loser.outcome).toBe('REJECTED');
        expect(['40001', '23505']).toContain(loser.code);
        const actual = await admin.query(
          `select actor_id,auth_subject::text from world_v2.world_actor_binding where world_id=$1 and binding_ref in($2,$3)`,
          [WORLD, first.bindingRef, second.bindingRef],
        );
        expect(actual.rows).toEqual([
          { actor_id: first.actorId, auth_subject: first.authSubject },
        ]);
        (observations.raceOutcomes as unknown[]).push({
          kind,
          pidA,
          pidB,
          actualAdvisoryWait,
          outcomes: [{ outcome: 'COMMITTED' }, loser],
          actualRows: actual.rows,
        });
      } finally {
        // Release the first lock even when the wait assertion fails, before
        // awaiting its blocked peer; do not leave a test-only deadlock behind.
        try {
          await a.query('rollback').catch(() => undefined);
          if (pending) await pending;
          else await b.query('rollback').catch(() => undefined);
        } finally {
          a.release();
          b.release();
        }
      }
    }
  });

  it('uses actual low-reader service lookup, exact retry and fresh binding revocation without caching actors', async () => {
    const value = binding('LOOKUP');
    await publish(pub1, async (client) => {
      await publishWorldActorBindingFrom(client, value);
      await publishWorldActorBindingFrom(client, value);
    });
    const resolver = createPostgresWorldActorResolver({
      pool: reader,
      worldId: WORLD,
      readerRole,
    });
    expect(await resolver.resolveActorId(subject)).toBe(value.actorId);
    expect(await resolver.resolveActorId(unused)).toBeNull();
    expect(reader.waitingCount).toBe(0);
    expect(reader.idleCount).toBe(reader.totalCount);
    await publish(pub2, async (client) => {
      await revokeWorldActorRegistryFrom(client, 'BINDING', {
        worldId: WORLD,
        targetRef: value.bindingRef,
        revocationRef: 'REVOKE_NATIVE_LOOKUP',
        issuerRef,
        originalSha256,
      });
      await publishWorldActorBindingFrom(client, value);
    });
    expect(await resolver.resolveActorId(subject)).toBeNull();
    const retained = await admin.query(
      'select b.binding_ref,r.revocation_ref from world_v2.world_actor_binding b join world_v2.world_actor_binding_revocation r using(world_id,binding_ref)where b.binding_ref=$1',
      [value.bindingRef],
    );
    expect(retained.rowCount).toBe(1);
    observations.lookupRevokedOriginalRetained = retained.rows;
  });

  it('denies cross-World/role/table operations and preserves failed-read client cleanup', async () => {
    await expect(currentRead(reader, OTHER)).rejects.toMatchObject({
      code: '42501',
    });
    await expect(currentRead(pub1)).rejects.toMatchObject({ code: '42501' });
    await expect(currentRead(outsider)).rejects.toMatchObject({
      code: '42501',
    });
    for (const sql of [
      'select * from world_v2.world_actor_binding',
      "update world_v2.world_actor_binding set actor_id='ACTOR_NOT_GRANTED'",
      'truncate world_v2.world_actor_binding_revocation',
    ])
      await expect(reader.query(sql)).rejects.toMatchObject({ code: '42501' });
    await expect(
      publish(reader, (client) =>
        publishWorldActorBindingFrom(client, binding('DENIED')),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    const wrongWorld = createPostgresWorldActorResolver({
      pool: reader,
      worldId: OTHER,
      readerRole,
    });
    await expect(wrongWorld.resolveActorId(subject)).rejects.toMatchObject({
      code: '42501',
    });
    expect(reader.waitingCount).toBe(0);
    expect(reader.idleCount).toBe(reader.totalCount);
    const activity = await admin.query(
      'select state from pg_stat_activity where application_name=$1',
      ['ACTOR_NATIVE_TEST_ONLY_' + readerRole],
    );
    expect(activity.rows.every((row) => row.state === 'idle')).toBe(true);
    observations.readerAfterDeniedCalls = {
      poolTotal: reader.totalCount,
      poolIdle: reader.idleCount,
      activity: activity.rows,
    };
  });

  it('append-only owner guards and scoped-reader revocation preserve all originals and unrelated state', async () => {
    const owner = await admin.connect();
    try {
      await owner.query('begin');
      await owner.query('set local role world_v2_actor_registry_owner');
      await expect(
        owner.query(
          "update world_v2.world_actor_binding set actor_id='ACTOR_OVERWRITTEN'",
        ),
      ).rejects.toMatchObject({ code: '55000' });
    } finally {
      await owner.query('rollback');
      owner.release();
    }
    await publish(pub1, async (client) => {
      const revoke = {
        worldId: WORLD,
        targetRef: 'SCOPE_NATIVE_TEST_ONLY',
        revocationRef: 'REVOKE_NATIVE_SCOPE',
        issuerRef,
        originalSha256,
      };
      await revokeWorldActorRegistryFrom(client, 'READER_SCOPE', revoke);
      await revokeWorldActorRegistryFrom(client, 'READER_SCOPE', revoke);
      await publishWorldActorReaderScopeFrom(client, {
        worldId: WORLD,
        scopeRef: 'SCOPE_NATIVE_TEST_ONLY',
        readerRole,
        issuerRef,
        originalSha256,
      });
    });
    const resolver = createPostgresWorldActorResolver({
      pool: reader,
      worldId: WORLD,
      readerRole,
    });
    await expect(resolver.resolveActorId(subject)).rejects.toMatchObject({
      code: '42501',
    });
    expect(reader.idleCount).toBe(reader.totalCount);
    expect(
      (await admin.query('select value from unrelated_application.sentinel'))
        .rows[0]?.value,
    ).toBe('MUST_PRESERVE_EXISTING_DATA');
  });
});
