/** Isolated embedded PostgreSQL identity configuration only. No production
 * subjects, memberships, issuer approval or economic permissions are created. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresWorldActorResolver,
  isPostgresWorldActorResolver,
  publishWorldActorBindingFrom,
  publishWorldActorReaderScopeFrom,
  revokeWorldActorRegistryFrom,
  WORLD_ACTOR_BINDING_READ_QUERY,
  type WorldActorBindingOriginal,
} from '../../apps/world-api/src/integration/postgres-world-actor-registry.js';

const world = 'WORLD_ACTOR_TEST_ONLY';
const otherWorld = 'WORLD_ACTOR_OTHER_TEST_ONLY';
const reader = 'test_actor_reader';
const publisher = 'test_actor_publisher';
const subject = '11111111-1111-4111-8111-111111111111';
const unusedSubject = '22222222-2222-4222-8222-222222222222';
const revocableSubject = '33333333-3333-4333-8333-333333333333';
const issuerRef = 'ISSUER_EXPLICIT_TEST_ONLY';
const originalSha256 = 'a'.repeat(64);
const binding: WorldActorBindingOriginal = {
  worldId: world,
  authSubject: subject,
  actorId: 'ACTOR_EXPLICIT_TEST_ONLY',
  bindingRef: 'BINDING_EXPLICIT_TEST_ONLY',
  issuerRef,
  originalSha256,
};

describe('controlled World-local actor identity registry', () => {
  let db: PGlite;
  let connects = 0;
  let releases = 0;
  const queries: string[] = [];
  function executor(): Pick<PoolClient, 'query'> {
    return {
      query: async (text: string, args?: unknown[]) => {
        const result = await db.query(text, args);
        return { ...result, rowCount: result.rows.length };
      },
    } as Pick<PoolClient, 'query'>;
  }
  async function asRole<T>(
    role: string,
    run: (tx: Pick<PoolClient, 'query'>) => Promise<T>,
    options: { readonly?: boolean; isolation?: string } = {},
  ) {
    await db.exec('reset role');
    await db.exec(
      `begin isolation level ${options.isolation ?? 'serializable'} ${options.readonly ? 'read only' : 'read write'}`,
    );
    try {
      await db.exec('set local role ' + role);
      const result = await run(executor());
      await db.exec('commit');
      return result;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  const pool = {
    async connect(): Promise<PoolClient> {
      connects++;
      await db.exec('set role ' + reader);
      return {
        async query(text: string, args?: unknown[]) {
          queries.push(text);
          const result = await db.query(text, args);
          return { ...result, rowCount: result.rows.length };
        },
        release() {
          releases++;
        },
      } as PoolClient;
    },
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema world_v2;
      create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
      insert into world_v2.world_head values('${world}',0,0),('${otherWorld}',0,0);`);
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/world-actor-identity-registry.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(`create role ${reader} nologin;create role ${publisher} nologin;
      create role test_actor_outsider nologin;
      grant world_v2_actor_registry_reader to ${reader};
      grant world_v2_actor_registry_publisher to ${publisher};
      grant usage on schema world_v2 to ${reader},${publisher},test_actor_outsider;`);
  });
  afterAll(async () => {
    await db?.exec('reset role');
    await db?.close();
  });

  it('installs no identities/scopes/memberships and retains fixed NOLOGIN separated role profiles', async () => {
    const result = await db.query<{
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      "select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname like 'world_v2_actor_registry_%' order by rolname",
    );
    expect(result.rows).toHaveLength(3);
    expect(
      result.rows.every(
        (r) => !r.rolcanlogin && !r.rolsuper && !r.rolbypassrls,
      ),
    ).toBe(true);
    expect(
      (await db.query('select * from world_v2.world_actor_binding')).rows,
    ).toHaveLength(0);
    expect(
      (await db.query('select * from world_v2.world_actor_reader_scope')).rows,
    ).toHaveLength(0);
  });

  it('publishes only explicit actor and reader originals, retries idempotently, and reads through the actual definer under READ ONLY', async () => {
    await asRole(publisher, async (tx) => {
      expect(
        await publishWorldActorReaderScopeFrom(tx, {
          worldId: world,
          scopeRef: 'SCOPE_TEST_ONLY',
          readerRole: reader,
          issuerRef,
          originalSha256,
        }),
      ).toBe('SCOPE_TEST_ONLY');
      expect(await publishWorldActorBindingFrom(tx, binding)).toBe(
        binding.bindingRef,
      );
      expect(await publishWorldActorBindingFrom(tx, binding)).toBe(
        binding.bindingRef,
      );
    });
    const resolver = createPostgresWorldActorResolver({
      pool,
      worldId: world,
      readerRole: reader,
    });
    expect(isPostgresWorldActorResolver(resolver, world)).toBe(true);
    expect(isPostgresWorldActorResolver({ ...resolver }, world)).toBe(false);
    expect(isPostgresWorldActorResolver(resolver, otherWorld)).toBe(false);
    expect(await resolver.resolveActorId(subject)).toBe(binding.actorId);
    expect(queries).toContain(WORLD_ACTOR_BINDING_READ_QUERY);
    expect(connects).toBe(releases);
  });

  it('returns null only for an actually absent mapping, with no UUID-to-actor fallback or insert', async () => {
    const resolver = createPostgresWorldActorResolver({
      pool,
      worldId: world,
      readerRole: reader,
    });
    expect(await resolver.resolveActorId(unusedSubject)).toBeNull();
    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select * from world_v2.world_actor_binding where auth_subject=$1',
          [unusedSubject],
        )
      ).rows,
    ).toHaveLength(0);
    expect(connects).toBe(releases);
  });

  it('rejects conflicting reference, subject and actor reuse within a World; another World still needs its own reader scope', async () => {
    for (const value of [
      { ...binding, actorId: 'ACTOR_CONFLICT_TEST_ONLY' },
      {
        ...binding,
        bindingRef: 'BINDING_SUBJECT_CONFLICT_TEST_ONLY',
        actorId: 'ACTOR_OTHER_TEST_ONLY',
      },
      {
        ...binding,
        bindingRef: 'BINDING_ACTOR_CONFLICT_TEST_ONLY',
        authSubject: unusedSubject,
      },
    ])
      await expect(
        asRole(publisher, (tx) => publishWorldActorBindingFrom(tx, value)),
      ).rejects.toMatchObject({ code: '23505' });
    await asRole(publisher, (tx) =>
      publishWorldActorBindingFrom(tx, { ...binding, worldId: otherWorld }),
    );
    const resolver = createPostgresWorldActorResolver({
      pool,
      worldId: otherWorld,
      readerRole: reader,
    });
    await expect(resolver.resolveActorId(subject)).rejects.toMatchObject({
      code: '42501',
    });
    expect(connects).toBe(releases);
  });

  it('rejects mismatched verified subject, nonstable read and weak publication isolation', async () => {
    await expect(
      asRole(
        reader,
        async (tx) => {
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
            unusedSubject,
          ]);
          return tx.query(WORLD_ACTOR_BINDING_READ_QUERY, [world, subject]);
        },
        { readonly: true },
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asRole(
        reader,
        (tx) => tx.query(WORLD_ACTOR_BINDING_READ_QUERY, [world, subject]),
        { readonly: false },
      ),
    ).rejects.toMatchObject({ code: '25001' });
    await expect(
      asRole(publisher, (tx) => publishWorldActorBindingFrom(tx, binding), {
        isolation: 'repeatable read',
      }),
    ).rejects.toMatchObject({ code: '25001' });
  });

  it('reader/outside roles cannot raw-read, mutate or publish; publisher cannot read identities as a runtime reader', async () => {
    await expect(
      asRole(publisher, (tx) =>
        tx.query(
          'select world_v2.publish_world_actor_reader_scope($1,$2,$3::name,$4,$5)',
          [
            world,
            'SCOPE_GROUP_DENIED',
            'world_v2_actor_registry_reader',
            issuerRef,
            originalSha256,
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const sql of [
      'select * from world_v2.world_actor_binding',
      "update world_v2.world_actor_binding set actor_id='ACTOR_SELF_GRANTED'",
      'select world_v2.publish_world_actor_binding($1,$2::uuid,$3,$4,$5,$6)',
    ])
      await expect(
        asRole(reader, (tx) =>
          tx.query(
            sql,
            sql.includes('$1')
              ? [
                  world,
                  unusedSubject,
                  'ACTOR_SELF_GRANTED',
                  'BINDING_SELF_GRANTED',
                  issuerRef,
                  originalSha256,
                ]
              : [],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    for (const role of [publisher, 'test_actor_outsider'])
      await expect(
        asRole(
          role,
          (tx) => tx.query(WORLD_ACTOR_BINDING_READ_QUERY, [world, subject]),
          { readonly: true },
        ),
      ).rejects.toMatchObject({ code: '42501' });
  });

  it('binding revocation is append-only, observable on the next call and never undone by retrying its original registration', async () => {
    const value = {
      ...binding,
      authSubject: revocableSubject,
      actorId: 'ACTOR_REVOCABLE_TEST_ONLY',
      bindingRef: 'BINDING_REVOCABLE_TEST_ONLY',
    };
    await asRole(publisher, (tx) => publishWorldActorBindingFrom(tx, value));
    const resolver = createPostgresWorldActorResolver({
      pool,
      worldId: world,
      readerRole: reader,
    });
    expect(await resolver.resolveActorId(revocableSubject)).toBe(value.actorId);
    await asRole(publisher, async (tx) => {
      const revoke = {
        worldId: world,
        targetRef: value.bindingRef,
        revocationRef: 'REVOCATION_TEST_ONLY',
        issuerRef,
        originalSha256,
      };
      await revokeWorldActorRegistryFrom(tx, 'BINDING', revoke);
      await revokeWorldActorRegistryFrom(tx, 'BINDING', revoke);
      await publishWorldActorBindingFrom(tx, value);
    });
    expect(await resolver.resolveActorId(revocableSubject)).toBeNull();
    await asRole(publisher, (tx) =>
      publishWorldActorBindingFrom(tx, {
        ...value,
        bindingRef: 'BINDING_REPLACEMENT_TEST_ONLY',
        actorId: 'ACTOR_EXPLICIT_REPLACEMENT_TEST_ONLY',
      }),
    );
    expect(await resolver.resolveActorId(revocableSubject)).toBe(
      'ACTOR_EXPLICIT_REPLACEMENT_TEST_ONLY',
    );
    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select * from world_v2.world_actor_binding where auth_subject=$1',
          [revocableSubject],
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (await db.query('select * from world_v2.world_actor_binding_revocation'))
        .rows,
    ).toHaveLength(1);
  });

  it('revoking reader scope denies that same resolver and original-scope retry cannot reactivate it', async () => {
    await asRole(publisher, async (tx) => {
      await revokeWorldActorRegistryFrom(tx, 'READER_SCOPE', {
        worldId: world,
        targetRef: 'SCOPE_TEST_ONLY',
        revocationRef: 'SCOPE_REVOKE_TEST_ONLY',
        issuerRef,
        originalSha256,
      });
      await publishWorldActorReaderScopeFrom(tx, {
        worldId: world,
        scopeRef: 'SCOPE_TEST_ONLY',
        readerRole: reader,
        issuerRef,
        originalSha256,
      });
    });
    const resolver = createPostgresWorldActorResolver({
      pool,
      worldId: world,
      readerRole: reader,
    });
    await expect(resolver.resolveActorId(subject)).rejects.toMatchObject({
      code: '42501',
    });
    expect(connects).toBe(releases);
    await asRole(publisher, (tx) =>
      publishWorldActorReaderScopeFrom(tx, {
        worldId: world,
        scopeRef: 'SCOPE_REPLACEMENT_TEST_ONLY',
        readerRole: reader,
        issuerRef,
        originalSha256,
      }),
    );
    expect(await resolver.resolveActorId(subject)).toBe(binding.actorId);
  });

  it('preserves identity originals against direct mutation, including by their isolated table owner', async () => {
    for (const query of [
      "update world_v2.world_actor_binding set actor_id='ACTOR_OVERWRITTEN'",
      'delete from world_v2.world_actor_binding_revocation',
      'truncate world_v2.world_actor_reader_scope_revocation',
    ])
      await expect(
        asRole('world_v2_actor_registry_owner', (tx) => tx.query(query)),
      ).rejects.toMatchObject({ code: '55000' });
  });

  it('invalid config/subject never opens a connection; failures retain original and cleanup errors and release exactly once', async () => {
    const before = connects;
    expect(() =>
      createPostgresWorldActorResolver({
        pool,
        worldId: world,
        readerRole: 'postgres',
      }),
    ).toThrow();
    const resolver = createPostgresWorldActorResolver({
      pool,
      worldId: world,
      readerRole: reader,
    });
    await expect(
      resolver.resolveActorId('ACTOR_IS_NOT_A_SUBJECT'),
    ).rejects.toThrow();
    expect(connects).toBe(before);
    const primary = Error('TEST_ONLY_BEGIN_FAILURE');
    const release = Error('TEST_ONLY_RELEASE_FAILURE');
    let released = 0;
    const failing = createPostgresWorldActorResolver({
      worldId: world,
      readerRole: reader,
      pool: {
        connect: async () =>
          ({
            query: async () => {
              throw primary;
            },
            release: () => {
              released++;
              throw release;
            },
          }) as unknown as PoolClient,
      },
    });
    await expect(failing.resolveActorId(subject)).rejects.toMatchObject({
      cause: primary,
      errors: [primary, release],
    });
    expect(released).toBe(1);
  });
});
