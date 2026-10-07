import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  authorizeOfficeCapability,
  createOpeningSeed,
  createOpeningSource,
  worldId,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { RuntimeReadBindingStore } from '../../apps/world-worker/src/persistence/runtime-read-binding-store.js';
import {
  createAuthenticatedFinancialIntakeComposition,
  type AuthenticatedFinancialIntakeCompositionConfig,
} from '../../apps/world-api/src/integration/authenticated-financial-intake-composition.js';
import {
  createV10TwoCountryTestFixture,
  type V10FixtureActorKey,
} from './v10-two-country-fixture.js';
import { snapshotStorageFixtureSql } from './snapshot-storage-fixture.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

const read = (p: string) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
export const G_INTAKE_NATIVE_ROLES = {
  reader: 'g_test_only_intake_reader',
  writer: 'g_test_only_intake_writer',
  publisher: 'g_test_only_intake_publisher',
} as const;
const project = 'abcdefghijklmnopqrst',
  issuer = `https://${project}.supabase.co/auth/v1`,
  jwksUrl = issuer + '/.well-known/jwks.json';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Fresh TEST_ONLY PG16 cluster/private Unix socket/TCP disabled. No env DSN,
 * production credential or actor. Pools/roles/data all discarded on close. */
export async function startGFinancialIntakeNativeCluster() {
  const root = mkdtempSync('/tmp/g-intake-test-'),
    socket = join(root, 'socket');
  mkdirSync(socket);
  execFileSync(
    '/opt/homebrew/bin/initdb',
    [
      '-D',
      join(root, 'data'),
      '-U',
      'g_test_only_cluster_admin',
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
      join(root, 'data'),
      '-l',
      join(root, 'postgres.log'),
      '-o',
      `-k ${socket} -p 5448 -c listen_addresses=''`,
      '-w',
      'start',
    ],
    { stdio: 'pipe' },
  );
  const clusterAdmin = new Pool({
    host: socket,
    port: 5448,
    user: 'g_test_only_cluster_admin',
    database: 'postgres',
  });
  for (const role of [
    ...Object.values(G_INTAKE_NATIVE_ROLES),
    'anon',
    'authenticated',
  ])
    await clusterAdmin.query(
      `create role ${role} ${['anon', 'authenticated'].includes(role) ? 'nologin' : 'login'} nosuperuser nobypassrls nocreaterole nocreatedb noreplication`,
    );
  let ordinal = 0;
  const active: Array<{
    admin: Pool;
    reader: Pool;
    writer: Pool;
    publisher: Pool;
    name: string;
  }> = [];
  async function fixture(admitted = true) {
    const name = `g_test_only_intake_${++ordinal}`;
    await clusterAdmin.query(`create database ${name}`);
    const pool = (user: string) =>
      new Pool({ host: socket, port: 5448, user, database: name, max: 3 });
    const admin = pool('g_test_only_cluster_admin'),
      reader = pool(G_INTAKE_NATIVE_ROLES.reader),
      writer = pool(G_INTAKE_NATIVE_ROLES.writer),
      publisher = pool(G_INTAKE_NATIVE_ROLES.publisher);
    active.push({ admin, reader, writer, publisher, name });
    await admin.query(
      snapshotStorageFixtureSql.replace(/^create role .*;\n/gm, ''),
    );
    const manifest = JSON.parse(read('database/migrations/manifest.json')) as {
      migrations: Array<{ path: string; release_order: number }>;
    };
    for (const row of manifest.migrations.filter(
      (row) => row.release_order <= 17,
    ))
      await admin.query(read(row.path));
    await admin.query(
      read('database/proposals/runtime-read-binding-storage.sql'),
    );
    const original = createV10TwoCountryTestFixture(),
      world = worldId(`WORLD_G_TEST_ONLY_INTAKE_${ordinal}`),
      real = new Date().toISOString();
    const seed = createOpeningSeed(
      {
        ...original.openingSeed,
        worldId: world,
        seedId:
          `SEED_G_TEST_ONLY_${ordinal}` as typeof original.openingSeed.seedId,
        sources: [
          createOpeningSource(
            {
              ...original.openingSeed.sources[0]!,
              sourceKind: 'DOCUMENTED_ASSUMPTION',
              locator:
                'tests/support/g-financial-intake-native-fixture.ts#TEST_ONLY',
              sourceVersion: 'TEST_ONLY',
              payload: { testOnly: true, productionFallback: false },
            },
            sha,
          ),
        ],
        inventoryEntries: original.openingSeed.inventoryEntries.map((e) => ({
          ...e,
          account: { ...e.account, worldId: world },
        })),
        financialBatches: original.openingSeed.financialBatches.map((b) => ({
          ...b,
          legs: b.legs.map((l) => ({
            ...l,
            account: { ...l.account, worldId: world },
          })),
        })),
      },
      sha,
    );
    const database: SqlDatabase = {
      query: async (sql, values) => {
        const r = await admin.query(sql, values ? [...values] : undefined);
        return { rows: r.rows, rowCount: r.rowCount };
      },
      transaction: async (operation) => {
        const client = await admin.connect();
        try {
          await client.query('begin');
          const r = await operation({
            query: async (sql, values) => {
              const r = await client.query(
                sql,
                values ? [...values] : undefined,
              );
              return { rows: r.rows, rowCount: r.rowCount };
            },
          });
          await client.query('commit');
          return r;
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      },
    };
    await admin.query('insert into world_v2.world_head(world_id) values($1)', [
      world,
    ]);
    await new WorldOpeningSeedStore({ database, sha256Hex: sha }).bootstrap({
      seed,
      bootstrappedAtReal: real,
    });
    for (const a of Object.values(original.officeActors))
      await admin.query(
        'insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,$6,$7,true,$8)',
        [
          world,
          a.principal.authSubject,
          a.membership.countryId,
          a.officeId,
          a.capability,
          a.membership.teamId,
          a.membership.authorizationVersion,
          real,
        ],
      );
    const R = G_INTAKE_NATIVE_ROLES.reader,
      W = G_INTAKE_NATIVE_ROLES.writer,
      P = G_INTAKE_NATIVE_ROLES.publisher;
    await admin.query(`grant usage on schema world_v2 to ${R},${W},${P};
      grant select,update(active) on world_v2.current_commit_authorization to ${P}; grant select,insert on world_v2.runtime_read_seat to ${P};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,world_v2.world_head,world_v2.command_submission,world_v2.projection_entitlement,world_v2.read_projection to ${R};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,world_v2.world_head,world_v2.command_receipt to ${W};
      grant update(active) on world_v2.current_commit_authorization to ${W}; grant update(world_version) on world_v2.world_head to ${W};
      grant select,insert,update on world_v2.command_submission,world_v2.narrow_transfer_proposal,world_v2.narrow_transfer_approval_signature,world_v2.narrow_transfer_approval_reference to ${W};
      grant select,insert on world_v2.command_queue to ${W};
      grant execute on function world_v2.validate_narrow_transfer_approval_reference() to ${W};
      create policy g_test_only_opening_read on world_v2.opening_seed for select to ${R},${W} using(exists(select 1 from world_v2.runtime_read_seat s where s.world_id=opening_seed.world_id and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)));`);
    for (const table of [
      'narrow_transfer_proposal',
      'narrow_transfer_approval_signature',
      'narrow_transfer_approval_reference',
    ])
      await admin.query(
        `create policy g_test_only_intake on world_v2.${table} for all to ${W} using(exists(select 1 from world_v2.current_commit_authorization a where a.world_id=${table}.world_id and a.auth_subject::text=current_setting('request.jwt.claim.sub',true) and a.active)) with check(exists(select 1 from world_v2.current_commit_authorization a where a.world_id=${table}.world_id and a.auth_subject::text=current_setting('request.jwt.claim.sub',true) and a.active))`,
      );
    for (const a of Object.values(original.officeActors)) {
      const authorization = await authorizeOfficeCapability({
        principal: a.principal,
        resolver: {
          resolveCurrentIdentity: async () => a.principal.authSubject,
          resolveCurrentMembership: async () => ({
            ...a.membership,
            worldId: world,
          }),
        },
        worldId: world,
        requestedCountryId: a.membership.countryId,
        requestedOfficeId: a.officeId,
        capability: a.capability,
      });
      const pubDb: SqlDatabase = {
        query: database.query,
        transaction: async (operation) => {
          const client = await publisher.connect();
          try {
            await client.query('begin');
            await client.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [a.principal.authSubject],
            );
            const result = await operation({
              query: async (sql, values) => {
                const r = await client.query(
                  sql,
                  values ? [...values] : undefined,
                );
                return { rows: r.rows, rowCount: r.rowCount };
              },
            });
            await client.query('commit');
            return result;
          } catch (e) {
            await client.query('rollback');
            throw e;
          } finally {
            client.release();
          }
        },
      };
      await new RuntimeReadBindingStore({
        database: pubDb,
        authorizationPublisherRole: P,
        runtimeReaderRole: R,
      }).bindCurrentSeat({ authorization });
      const scope = `OFFICE_${Buffer.from(a.membership.countryId).toString('hex').toUpperCase()}_${Buffer.from(a.officeId).toString('hex').toUpperCase()}`;
      await admin.query(
        "insert into world_v2.projection_entitlement values($1,$2,'OFFICE_PRIVATE',$3,$4,true,$5,null)",
        [
          world,
          a.principal.authSubject,
          scope,
          a.membership.authorizationVersion,
          real,
        ],
      );
      await admin.query(
        "insert into world_v2.read_projection values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}',$3)",
        [world, scope, real],
      );
    }
    if (admitted) {
      await admin.query(
        'alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_requires_real_publication',
      );
      await admin.query(
        "insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding) select world_id,'ADMISSION_G_TEST_ONLY',seed_id,seed_fingerprint,$2,replay_binding from world_v2.opening_seed where world_id=$1",
        [world, seed.replayBinding.modelVersion],
      );
      await admin.query(
        'alter table world_v2.runtime_opening_admission enable trigger runtime_opening_admission_requires_real_publication',
      );
    }
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      jwk = {
        ...keys.publicKey.export({ format: 'jwk' }),
        kid: 'G_TEST_ONLY',
        alg: 'ES256',
        use: 'sig',
      };
    const fetchKeys: typeof fetch = async () => {
      const r = new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'content-type': 'application/json' },
      });
      Object.defineProperty(r, 'url', { value: jwksUrl });
      return r;
    };
    const actorMapping = { present: true },
      clock = { present: true };
    const config: AuthenticatedFinancialIntakeCompositionConfig = {
      readPool: reader,
      writerPool: writer,
      readerRole: R,
      writerRole: W,
      authorizationPublisherRole: P,
      admittedWorldPins: {
        worldId: world,
        seedRef: seed.seedId,
        contentHash: seed.fingerprint,
        admissionRef: 'ADMISSION_G_TEST_ONLY',
        minimumWorldVersion: '0',
      },
      auth: {
        projectRef: project,
        expectedIssuer: issuer,
        jwksUrl,
        audience: 'authenticated',
        fetch: fetchKeys,
      },
      resolveActorId: async (subject) =>
        actorMapping.present
          ? (Object.values(original.officeActors).find(
              (a) => a.principal.authSubject === subject,
            )?.actorId ?? null)
          : null,
      clock: {
        nowReal: () => new Date().toISOString(),
        simTime: async (requested) => {
          if (!clock.present || requested !== world)
            throw new Error('TEST_ONLY_CLOCK_UNAVAILABLE');
          return '10000';
        },
      },
    };
    const composition = createAuthenticatedFinancialIntakeComposition(config);
    const token = (seat: V10FixtureActorKey, expired = false) => {
      const now = Math.floor(Date.now() / 1000),
        h = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'G_TEST_ONLY' }),
        ).toString('base64url'),
        p = Buffer.from(
          JSON.stringify({
            sub: original.officeActors[seat].principal.authSubject,
            iss: issuer,
            aud: 'authenticated',
            iat: now - 10,
            exp: expired ? now - 1 : now + 60,
          }),
        ).toString('base64url');
      return `${h}.${p}.${sign('sha256', Buffer.from(h + '.' + p), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    };
    const staged = (
      action: string,
      seat: V10FixtureActorKey = 'sellerTrade',
      extra: Record<string, unknown> = {},
    ) => ({
      schemaVersion: 'world-staged-transfer-v1',
      action,
      worldId: world,
      commandId: 'COMMAND_G_TEST_ONLY',
      idempotencyKey: 'KEY_G_TEST_ONLY',
      countryId: original.officeActors[seat].membership.countryId,
      officeId: original.officeActors[seat].officeId,
      ...extra,
    });
    const envelope = (request: unknown) => ({
      schemaVersion: 'world-authenticated-financial-intake-v1',
      requestId: '33333333-3333-4333-8333-333333333333',
      request,
    });
    const source = original.inventoryAccounts.sellerAvailable;
    const intent = {
      expectedWorldVersion: '0',
      buyerCountryId: original.countries.buyer,
      quantity: { amount: '2', unit: source.unit },
      price: { amount: '3', currency: 'GCU', perUnit: source.unit },
      assetSource: {
        batchId: source.batchId,
        physicalLocationId: source.physicalLocationId,
        titleHolderId: source.titleHolderId,
        riskBearerId: source.riskBearerId,
        economicRecognitionId: source.economicRecognitionId,
      },
      expiresAtReal: new Date(Date.parse(real) + 600000).toISOString(),
    };
    const call = (request: unknown, seat: V10FixtureActorKey = 'sellerTrade') =>
      composition.handle({
        authorization: `Bearer ${token(seat)}`,
        request: envelope(request),
      });
    return {
      admin,
      reader,
      writer,
      original,
      world,
      seed,
      config,
      composition,
      token,
      staged,
      envelope,
      intent,
      call,
      actorMapping,
      clock,
    };
  }
  return {
    fixture,
    async close() {
      for (const f of active.splice(0)) {
        await Promise.all([
          f.admin.end(),
          f.reader.end(),
          f.writer.end(),
          f.publisher.end(),
        ]);
        await clusterAdmin.query(`drop database ${f.name}`);
      }
      await clusterAdmin.end();
      try {
        execFileSync(
          '/opt/homebrew/bin/pg_ctl',
          ['-D', join(root, 'data'), '-m', 'fast', '-w', 'stop'],
          { stdio: 'pipe' },
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
