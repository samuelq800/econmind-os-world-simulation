import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import { createPostgresServerReadBindingProvider } from '../../apps/world-api/src/integration/postgres-full-read-provider.js';
import { createNonactivatedRuntimeReadHost } from '../../apps/world-api/src/integration/nonactivated-runtime-read-host.js';
import { createPostgresRuntimeReadExecutor } from '../../apps/world-api/src/integration/postgres-runtime-read-executor.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import type { ServerReadBindingPort } from '../../apps/world-api/src/integration/https-authenticated-read-composition.js';
import { WORLD_V2_ENTITLED_PROJECTION_QUERY } from '../../apps/world-api/src/integration/postgres-read-adapter.js';

// TEST_ONLY native PostgreSQL cluster, private Unix socket, no TCP/DSN/env/keys.
// The approved proposal's real admission veto remains tested. A positive
// mechanism fixture disables exactly that veto ONLY in its disposable DB.
// Synthetic DOCUMENTED_ASSUMPTION exercises the existing production parser;
// locator/version explicitly describe this inert fixture, not adopted source.
const SUBJECT = parseSupabaseAuthSubject(
  '11111111-1111-4111-8111-111111111111',
);
const OTHER = parseSupabaseAuthSubject('22222222-2222-4222-8222-222222222222');
const WORLD = 'WORLD_TEST_ONLY_PROVIDER';
const ROLE = 'test_only_runtime_reader',
  PUB = 'test_only_auth_publisher';
const PRIVATE = 'OFFICE_434F554E5452595F3031_5452414445';
const nativeEnabled = process.env.WORLD_V2_G_NATIVE_PROVIDER_TEST === '1';
let started = false;
const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let cluster: string, socket: string, clusterAdmin: Pool;
const open: Array<{ admin: Pool; pool: Pool; name: string }> = [];
let count = 0;
beforeAll(async () => {
  if (!nativeEnabled) return;
  cluster = mkdtempSync('/tmp/g-provider-test-');
  socket = join(cluster, 'socket');
  mkdirSync(socket);
  execFileSync(
    '/opt/homebrew/bin/initdb',
    [
      '-D',
      join(cluster, 'data'),
      '-U',
      'test_only_cluster_admin',
      '-A',
      'trust',
      '--no-locale',
      '-E',
      'UTF8',
    ],
    { stdio: 'pipe' },
  );
  execFileSync(
    '/opt/homebrew/bin/pg_ctl',
    [
      '-D',
      join(cluster, 'data'),
      '-l',
      join(cluster, 'postgres.log'),
      '-o',
      `-k ${socket} -p 5447 -c listen_addresses=''`,
      '-w',
      'start',
    ],
    { stdio: 'pipe' },
  );
  started = true;
  clusterAdmin = new Pool({
    host: socket,
    port: 5447,
    user: 'test_only_cluster_admin',
    database: 'postgres',
  });
  await clusterAdmin.query(
    `create role ${ROLE} login nosuperuser nobypassrls nocreaterole nocreatedb noreplication; create role ${PUB} nologin nosuperuser nobypassrls;`,
  );
}, 30_000);
afterEach(async () => {
  for (const f of open.splice(0)) {
    await f.pool.end();
    await f.admin.end();
    await clusterAdmin.query(`drop database ${f.name}`);
  }
});
afterAll(async () => {
  await clusterAdmin?.end();
  if (cluster) {
    try {
      if (started)
        execFileSync(
          '/opt/homebrew/bin/pg_ctl',
          ['-D', join(cluster, 'data'), '-m', 'fast', '-w', 'stop'],
          { stdio: 'pipe' },
        );
    } finally {
      rmSync(cluster, { recursive: true, force: true });
    }
  }
}, 30_000);
function request(
  overrides: Partial<Parameters<ServerReadBindingPort['resolve']>[0]> = {},
) {
  return {
    verifiedSubject: SUBJECT,
    worldId: WORLD,
    projectionSelector: { classification: 'OFFICE_PRIVATE', scopeKey: PRIVATE },
    finalSelector: null,
    signal: new AbortController().signal,
    ...overrides,
  };
}
async function fixture(
  admitted = true,
  kind: 'DOCUMENTED_ASSUMPTION' | 'TEST_FIXTURE' = 'DOCUMENTED_ASSUMPTION',
) {
  const name = `g_provider_test_only_${++count}`;
  await clusterAdmin.query(`create database ${name}`);
  const admin = new Pool({
    host: socket,
    port: 5447,
    user: 'test_only_cluster_admin',
    database: name,
  });
  const pool = new Pool({
    host: socket,
    port: 5447,
    user: ROLE,
    database: name,
    max: 3,
  });
  open.push({ admin, pool, name });
  for (const file of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0011_world_v2_current_commit_authorization.sql',
    '0013_world_v2_read_projection_boundary.sql',
    '0016_world_v2_opening_seed.sql',
  ])
    await admin.query(read(`database/migrations/artifacts/${file}`));
  await admin.query(
    read('database/proposals/runtime-read-binding-storage.sql'),
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_PROVIDER'),
      worldId: worldId(WORLD),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [
        createOpeningSource(
          {
            schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: openingSourceId('SOURCE_TEST_ONLY_PROVIDER'),
            sourceKind: kind,
            locator: 'fixture://TEST_ONLY/native-provider',
            sourceVersion: 'TEST_ONLY',
            payload: { testOnly: true },
          },
          sha,
        ),
      ],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
  await admin.query('insert into world_v2.world_head values($1,0,0)', [WORLD]);
  await admin.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      WORLD,
      seed.seedId,
      canonicalSerialize(seed.replayBinding),
      canonicalSerialize(intent),
      fingerprint,
    ],
  );
  await admin.query(
    "insert into world_v2.current_commit_authorization values($1,$2,'COUNTRY_01','TRADE','READ','TEAM_TEST_ONLY','REV_1',true,now())",
    [WORLD, SUBJECT],
  );
  await admin.query(
    "insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values('SEAT_TEST_ONLY_PERSISTED',$1,$2,'COUNTRY_01','TRADE','TEAM_TEST_ONLY','REV_1')",
    [WORLD, SUBJECT],
  );
  await admin.query(
    "insert into world_v2.projection_entitlement values($1,$2,'OFFICE_PRIVATE',$3,'REV_1',true,now(),null)",
    [WORLD, SUBJECT, PRIVATE],
  );
  await admin.query(
    "insert into world_v2.read_projection values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,$3,now())",
    [
      WORLD,
      PRIVATE,
      {
        balance: '9007199254740993.25',
        nature: 'TEST_ONLY_DERIVED_PROJECTION',
      },
    ],
  );
  const insertAdmission = () =>
    admin.query(
      "insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding) values($1,'ADMISSION_TEST_ONLY_PERSISTED',$2,$3,$4,$5)",
      [
        WORLD,
        seed.seedId,
        fingerprint,
        seed.replayBinding.modelVersion,
        canonicalSerialize(seed.replayBinding),
      ],
    );
  if (admitted) {
    await admin.query(
      'alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_requires_real_publication',
    );
    await insertAdmission();
    await admin.query(
      'alter table world_v2.runtime_opening_admission enable trigger runtime_opening_admission_requires_real_publication',
    );
  }
  await admin.query(`grant usage on schema world_v2 to ${ROLE};
    grant select on world_v2.current_commit_authorization,world_v2.projection_entitlement,world_v2.read_projection,world_v2.world_head,world_v2.opening_seed,world_v2.command_submission,world_v2.runtime_read_seat,world_v2.runtime_opening_admission to ${ROLE};
    create policy test_only_read_seed on world_v2.opening_seed for select to ${ROLE} using (exists(select 1 from world_v2.runtime_read_seat s where s.world_id=opening_seed.world_id and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)));`);
  const provider = createPostgresServerReadBindingProvider({
    pool,
    readerRole: ROLE,
    authorizationPublisherRole: PUB,
  });
  return { admin, pool, provider, seed, insertAdmission };
}
const project = 'abcdefghijklmnopqrst';
const issuer = `https://${project}.supabase.co/auth/v1`;
function cryptoFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'TEST_ONLY_KEY',
    alg: 'ES256',
    use: 'sig',
  };
  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  let fetches = 0;
  const fetchKeys: typeof fetch = async (url) => {
    expect(url).toBe(jwksUrl);
    fetches++;
    const response = new Response(JSON.stringify({ keys: [jwk] }), {
      headers: { 'content-type': 'application/json' },
    });
    Object.defineProperty(response, 'url', { value: jwksUrl });
    return response;
  };
  const host = createNonactivatedRuntimeReadHost({
    pool: f.pool,
    readerRole: ROLE,
    authorizationPublisherRole: PUB,
    endpointPins: {
      origin: 'https://test-only-runtime.example.invalid',
      projectionPath: '/v1/world-read',
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_ONLY_DEPLOYMENT',
    },
    admittedWorldPins: {
      worldId: WORLD,
      seedRef: f.seed.seedId,
      contentHash: f.seed.fingerprint,
      admissionRef: 'ADMISSION_TEST_ONLY_PERSISTED',
      minimumWorldVersion: '0',
    },
    auth: {
      projectRef: project,
      expectedIssuer: issuer,
      jwksUrl,
      audience: 'authenticated',
      fetch: fetchKeys,
    },
    routeOptions: { allowedOrigins: ['https://test-only-web.example.invalid'] },
  });
  const token = (
    subject = SUBJECT,
    expires = Math.floor(Date.now() / 1000) + 60,
  ) => {
    const h = Buffer.from(
      JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'TEST_ONLY_KEY' }),
    ).toString('base64url');
    const p = Buffer.from(
      JSON.stringify({
        sub: subject,
        iss: issuer,
        aud: 'authenticated',
        iat: Math.floor(Date.now() / 1000) - 10,
        exp: expires,
      }),
    ).toString('base64url');
    return `${h}.${p}.${sign('sha256', Buffer.from(`${h}.${p}`), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };
  const readRequest = {
    schemaVersion: 'world-read-api-v1',
    operation: 'READ_WORLD_PROJECTION',
    requestId: '33333333-3333-4333-8333-333333333333',
    payload: {
      worldId: WORLD,
      classification: 'OFFICE_PRIVATE',
      scopeKey: PRIVATE,
    },
  };
  return { host, token, readRequest, fetches: () => fetches };
}

describe.skipIf(!nativeEnabled)(
  'TEST_ONLY native PG full provider and nonactivated composition',
  () => {
    it('rehydrates real persisted refs and current head under the actual restricted reader', async () => {
      const f = await fixture();
      const b = await f.provider.resolve(request());
      expect(b?.seatRef).toBe('SEAT_TEST_ONLY_PERSISTED');
      expect(b?.seed).toEqual({
        worldId: WORLD,
        seedRef: f.seed.seedId,
        contentHash: f.seed.fingerprint,
        admissionRef: 'ADMISSION_TEST_ONLY_PERSISTED',
      });
      expect(b?.readback).toMatchObject({
        worldVersion: '0',
        eventSequence: '0',
        readbackRef: 'ADMISSION_TEST_ONLY_PERSISTED',
      });
      expect(Object.isFrozen(b?.identity)).toBe(true);
      expect(
        (
          await f.pool.query(
            "select current_setting('request.jwt.claim.sub',true) as subject",
          )
        ).rows[0].subject,
      ).toBeFalsy();
      await expect(
        f.pool.query('update world_v2.world_head set world_version=1'),
      ).rejects.toThrow();
    });
    it('bootstrap without admission denies, and actual schema veto remains intact', async () => {
      const f = await fixture(false);
      expect(await f.provider.resolve(request())).toBeNull();
      await expect(f.insertAdmission()).rejects.toThrow(
        'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING',
      );
      expect(
        (
          await f.admin.query(
            'select count(*)::text as n from world_v2.runtime_opening_admission',
          )
        ).rows[0].n,
      ).toBe('0');
    });
    it('denies wrong subject, World, country and private Office selector', async () => {
      const f = await fixture();
      for (const r of [
        request({ verifiedSubject: OTHER }),
        request({ worldId: 'WORLD_OTHER' }),
        request({
          projectionSelector: {
            classification: 'COUNTRY',
            scopeKey: 'COUNTRY_OTHER',
          },
        }),
        request({
          projectionSelector: {
            classification: 'OFFICE_PRIVATE',
            scopeKey: 'OFFICE_OTHER',
          },
        }),
      ])
        expect(await f.provider.resolve(r)).toBeNull();
    });
    it('denies current revision change, revocation, suspension and incoherent assignments', async () => {
      const f = await fixture();
      await f.admin.query(
        "update world_v2.current_commit_authorization set authorization_version='REV_2'",
      );
      expect(await f.provider.resolve(request())).toBeNull();
      await f.admin.query(
        "update world_v2.current_commit_authorization set authorization_version='REV_1',active=false",
      );
      expect(await f.provider.resolve(request())).toBeNull();
      await f.admin.query(
        'update world_v2.current_commit_authorization set active=true',
      );
      await f.admin.query(
        'update world_v2.projection_entitlement set active=false,revoked_at=now()',
      );
      expect(await f.provider.resolve(request())).toBeNull();
    });
    it('denies TEST_FIXTURE seeds and inconsistent immutable admission lineage', async () => {
      const f = await fixture(true, 'TEST_FIXTURE');
      expect(await f.provider.resolve(request())).toBeNull();
      const g = await fixture();
      await g.admin.query(
        'alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_is_immutable',
      );
      await g.admin.query(
        "update world_v2.runtime_opening_admission set model_version='MODEL_OTHER'",
      );
      expect(await g.provider.resolve(request())).toBeNull();
    });
    it('restricts FINAL to original durable submission Office, never another seat', async () => {
      const f = await fixture();
      const hash = `sha256:${'a'.repeat(64)}`;
      await f.admin.query(
        "insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,sim_time,correlation_id,submitted_at_real) values($1,'COMMAND_TEST_ONLY','KEY_TEST_ONLY','TEST_ONLY','TEST_ONLY','{}',$3,$3,$2,'ACTOR_TEST_ONLY','COUNTRY_01','FINANCE',0,'CORRELATION_TEST_ONLY',now())",
        [WORLD, SUBJECT, hash],
      );
      const r = request({
        projectionSelector: null,
        finalSelector: {
          commandId: 'COMMAND_TEST_ONLY',
          idempotencyKey: 'KEY_TEST_ONLY',
        },
      });
      expect(await f.provider.resolve(r)).toBeNull();
    });
    it('consumes cryptographically verified JWT + actual RLS projection without connecting production', async () => {
      const f = await fixture();
      const c = cryptoFixture(f);
      expect(c.fetches()).toBe(0);
      const result = await c.host.composition.handleProjection({
        authorization: `Bearer ${c.token()}`,
        request: c.readRequest,
      });
      expect(result).toMatchObject({
        ok: true,
        authority: { seatRef: 'SEAT_TEST_ONLY_PERSISTED' },
        result: {
          ok: true,
          data: {
            payload: { balance: '9007199254740993.25' },
            watermark: { worldVersion: '0', eventSequence: '0' },
          },
        },
      });
      expect(c.fetches()).toBe(1);
      expect([
        c.host.simulationEnabled,
        c.host.workerActivationAllowed,
        c.host.clockActivationAllowed,
      ]).toEqual([false, false, false]);
    });
    it('the existing HTTP route consumes the real provider and signed session on local TEST_ONLY transport', async () => {
      const f = await fixture();
      const c = cryptoFixture(f);
      const server = createServer((req, res) => {
        void c.host.route(req, res).then((handled) => {
          if (!handled) {
            res.writeHead(404);
            res.end('TEST_ONLY_EXISTING_ROUTER');
          }
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('TEST_ONLY_LISTEN_FAILED');
      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/v1/world-read`,
          {
            method: 'POST',
            headers: {
              Origin: 'https://test-only-web.example.invalid',
              Authorization: `Bearer ${c.token()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(c.readRequest),
          },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          ok: true,
          authority: {
            seatRef: 'SEAT_TEST_ONLY_PERSISTED',
            readback: { readbackRef: 'ADMISSION_TEST_ONLY_PERSISTED' },
          },
          result: {
            ok: true,
            data: { payload: { balance: '9007199254740993.25' } },
          },
        });
        expect(
          (await fetch(`http://127.0.0.1:${address.port}/healthz`)).status,
        ).toBe(404);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
    it('rejects invalid/expired token and mismatch between pinned World and actual refs', async () => {
      const f = await fixture();
      const c = cryptoFixture(f);
      for (const authorization of [
        `Bearer ${c.token(SUBJECT, 1)}`,
        `Bearer ${c.token(OTHER)}`,
        'Bearer invalid.token.signature',
      ]) {
        const result = await c.host.composition.handleProjection({
          authorization,
          request: c.readRequest,
        });
        expect(result.ok).toBe(false);
      }
      expect(
        (
          await c.host.composition.handleProjection({
            authorization: `Bearer ${c.token()}`,
            request: {
              ...c.readRequest,
              payload: { ...c.readRequest.payload, worldId: 'WORLD_OTHER' },
            },
          })
        ).ok,
      ).toBe(false);
    });
    it('does not substitute stale projection or demo values for advanced durable head', async () => {
      const f = await fixture();
      const c = cryptoFixture(f);
      await f.admin.query(
        'update world_v2.world_head set world_version=1,event_sequence=1',
      );
      expect(
        await c.host.composition.handleProjection({
          authorization: `Bearer ${c.token()}`,
          request: c.readRequest,
        }),
      ).toMatchObject({ ok: false, error: { code: 'STALE_PROJECTION' } });
    });
    it('cancels during reference hydration and destroys the acquired client without publishing', async () => {
      const f = await fixture();
      const controller = new AbortController();
      let destroyed = false;
      const wrappedPool = {
        async connect() {
          const client = await f.pool.connect();
          return {
            async query(sql: string, values?: unknown[]) {
              const result = await client.query(sql, values);
              if (sql.includes('from world_v2.runtime_opening_admission'))
                controller.abort();
              return result;
            },
            release(destroy?: boolean) {
              destroyed = destroy === true;
              client.release(destroy);
            },
          };
        },
      } as unknown as Pick<Pool, 'connect'>;
      const provider = createPostgresServerReadBindingProvider({
        pool: wrappedPool,
        readerRole: ROLE,
        authorizationPublisherRole: PUB,
      });
      await expect(
        provider.resolve(request({ signal: controller.signal })),
      ).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(destroyed).toBe(true);
      expect(
        (
          await f.admin.query(
            'select count(*)::text as n from world_v2.runtime_opening_admission',
          )
        ).rows[0].n,
      ).toBe('1');
    });
    it('rejects a runtime reader that gains publisher membership or economic DML rights', async () => {
      const f = await fixture();
      await f.admin.query(`grant update on world_v2.world_head to ${ROLE}`);
      await expect(f.provider.resolve(request())).rejects.toMatchObject({
        code: 'UPSTREAM_UNAVAILABLE',
      });
      await f.admin.query(`revoke update on world_v2.world_head from ${ROLE}`);
      expect(await f.provider.resolve(request())).not.toBeNull();
    });
    it('executor allows only exact authenticated handler SQL; cancelled requests never read', async () => {
      const f = await fixture();
      const executor = createPostgresRuntimeReadExecutor({
        pool: f.pool,
        readerRole: ROLE,
        authorizationPublisherRole: PUB,
      });
      await expect(
        executor.query({
          text: 'select 1',
          values: [],
          verifiedAuthSubject: SUBJECT,
        }),
      ).rejects.toThrow('Authenticated read query denied');
      await expect(
        executor.query({
          text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
          values: [SUBJECT, WORLD, 'OFFICE_PRIVATE', PRIVATE, '0', '0'],
        }),
      ).rejects.toThrow();
      const controller = new AbortController();
      controller.abort();
      await expect(
        f.provider.resolve(request({ signal: controller.signal })),
      ).rejects.toMatchObject({ code: 'CANCELLED' });
    });
  },
);
