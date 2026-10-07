import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  authorizeOfficeCapability,
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  type FinancialIntakeAction,
} from '@econmind/core';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { RuntimeReadBindingStore } from '../../apps/world-worker/src/persistence/runtime-read-binding-store.js';
import { CurrentAuthorizationEntitlementPublisher } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import { AuthoritativeActivityReadProjectionPublisher } from '../../apps/world-worker/src/projections/authoritative-activity-read-projection-publisher.js';
import { officePrivateReadProjectionScopeKey } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import { createAuthenticatedFinancialIntakeComposition } from '../../apps/world-api/src/integration/authenticated-financial-intake-composition.js';
import { createNonactivatedRuntimeReadHost } from '../../apps/world-api/src/integration/nonactivated-runtime-read-host.js';
import { createCIsolatedFinancialFixture } from './c-isolated-financial-fixture.js';
import type { V10FixtureActorKey } from './v10-two-country-fixture.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

const read = (path: string) =>
  readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const roles = {
  reader: 'o_test_only_read',
  writer: 'o_test_only_intake',
  publisher: 'o_test_only_seat',
} as const;
async function loopbackPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('O_TEST_PORT_REQUIRED');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** One fresh, empty, disposable TEST_ONLY PostgreSQL cluster. No env DSN or
 * production target. Real C host verifies loopback/econmind_v09*/
export async function createOAuthenticatedFinancialRoundtripFixture() {
  const root = mkdtempSync('/tmp/o-roundtrip-'),
    socket = join(root, 'socket');
  mkdirSync(socket);
  const port = await loopbackPort();
  const pools: Pool[] = [];
  let started = false;
  const close = async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    if (started) {
      execFileSync(
        '/opt/homebrew/bin/pg_ctl',
        ['-D', join(root, 'data'), '-m', 'immediate', '-w', 'stop'],
        { stdio: 'pipe' },
      );
      started = false;
    }
    rmSync(root, { recursive: true, force: true });
  };
  const pool = (database: string, user = 'postgres') => {
    const p = new Pool({
      host: '127.0.0.1',
      port,
      database,
      user,
      max: 6,
      options: '-c lock_timeout=3000 -c statement_timeout=10000',
    });
    pools.push(p);
    return p;
  };
  try {
    execFileSync(
      '/opt/homebrew/bin/initdb',
      [
        '-D',
        join(root, 'data'),
        '-U',
        'postgres',
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
        `-k ${socket} -p ${port} -c listen_addresses='127.0.0.1'`,
        '-w',
        'start',
      ],
      { stdio: 'pipe' },
    );
    started = true;
    const clusterAdmin = pool('postgres');
    for (const role of [...Object.values(roles), 'anon', 'authenticated'])
      await clusterAdmin.query(
        `create role ${role} ${['anon', 'authenticated'].includes(role) ? 'nologin' : 'login'} nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
    const name = 'econmind_v09_o_authenticated_roundtrip';
    await clusterAdmin.query(`create database ${name}`);
    const admin = pool(name),
      reader = pool(name, roles.reader),
      writer = pool(name, roles.writer),
      publisher = pool(name, roles.publisher);
    const database = new PostgresSqlDatabase(admin);
    const exists = await admin.query(
      "select to_regnamespace('world_v2')::text as schema",
    );
    if (exists.rows[0]?.schema !== null)
      throw new Error('O_REQUIRES_EMPTY_ISOLATED_DATABASE');
    const manifest = JSON.parse(read('database/migrations/manifest.json')) as {
      migrations: Array<{ path: string; release_order: number }>;
    };
    for (const migration of manifest.migrations.filter(
      (m) => m.release_order <= 17,
    ))
      await admin.query(read(migration.path));
    await admin.query(
      read('database/proposals/runtime-read-binding-storage.sql'),
    );
    // Reuse C's actual opening bootstrap, current authorizations, fenced host
    // and automatic scheduling port. Its direct intake/approve/transfer are
    // deliberately not called: G creates the sole discretionary Command.
    const c = await createCIsolatedFinancialFixture(
      database,
      'O_AUTHENTICATED',
    );
    const real = new Date().toISOString();
    c.setTime('10000', real);
    await c.lease();
    const leaseRow = (
      await admin.query(
        'select * from world_v2.world_writer_lease where world_id=$1',
        [c.world],
      )
    ).rows[0]!;
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: c.world,
      holderId: leaseRow.holder_id,
      fencingToken: String(leaseRow.fencing_token),
      acquiredAtReal: leaseRow.acquired_at_real.toISOString(),
      renewedAtReal: leaseRow.renewed_at_real.toISOString(),
      expiresAtReal: leaseRow.lease_expires_at_real.toISOString(),
    });
    const publish = async (version: string) => {
      const input = {
        assertion: createWorldWriterCommitAssertion(lease, version),
        observedAtReal: new Date().toISOString(),
      };
      await new CurrentAuthorizationEntitlementPublisher({
        database,
        workerId: c.hostInput.workerId,
      }).replace(input);
      return new AuthoritativeActivityReadProjectionPublisher({
        database,
        workerId: c.hostInput.workerId,
      }).replace(input);
    };
    // Genuine source-bound publishers derive initial empty activity and real
    // entitlements. No prefilled golden projection/receipt/economic events.
    await publish('0');
    await admin.query(`grant usage on schema world_v2 to ${roles.reader},${roles.writer},${roles.publisher};
      grant select,update(active) on world_v2.current_commit_authorization to ${roles.publisher};
      grant select,insert on world_v2.runtime_read_seat to ${roles.publisher};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,world_v2.world_head,world_v2.command_submission,world_v2.command_receipt,world_v2.projection_entitlement,world_v2.read_projection,world_v2.authoritative_event to ${roles.reader};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,world_v2.world_head,world_v2.command_receipt to ${roles.writer};
      grant update(active) on world_v2.current_commit_authorization to ${roles.writer};
      grant update(world_version) on world_v2.world_head to ${roles.writer};
      grant select,insert,update on world_v2.command_submission,world_v2.narrow_transfer_proposal,world_v2.narrow_transfer_approval_signature,world_v2.narrow_transfer_approval_reference to ${roles.writer};
      grant select,insert on world_v2.command_queue to ${roles.writer};
      grant execute on function world_v2.validate_narrow_transfer_approval_reference() to ${roles.writer};
      create policy o_test_only_opening_read on world_v2.opening_seed for select to ${roles.reader},${roles.writer}
        using(exists(select 1 from world_v2.runtime_read_seat s where s.world_id=opening_seed.world_id and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)));`);
    for (const table of [
      'narrow_transfer_proposal',
      'narrow_transfer_approval_signature',
      'narrow_transfer_approval_reference',
    ])
      await admin.query(`create policy o_test_only_intake on world_v2.${table} for all to ${roles.writer}
        using(exists(select 1 from world_v2.current_commit_authorization a where a.world_id=${table}.world_id and a.auth_subject::text=current_setting('request.jwt.claim.sub',true) and a.active))
        with check(exists(select 1 from world_v2.current_commit_authorization a where a.world_id=${table}.world_id and a.auth_subject::text=current_setting('request.jwt.claim.sub',true) and a.active))`);
    const publisherDb = new PostgresSqlDatabase(publisher);
    for (const actor of Object.values(c.original.officeActors)) {
      const authorization = await authorizeOfficeCapability({
        principal: actor.principal,
        resolver: {
          resolveCurrentIdentity: async () => actor.principal.authSubject,
          resolveCurrentMembership: async () => ({
            ...actor.membership,
            worldId: c.world,
          }),
        },
        worldId: c.world,
        requestedCountryId: actor.membership.countryId,
        requestedOfficeId: actor.officeId,
        capability: actor.capability,
      });
      const subjectDb: SqlDatabase = {
        query: (sql, values) => publisherDb.query(sql, values),
        transaction: (operation) =>
          publisherDb.transaction(async (tx) => {
            await tx.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [actor.principal.authSubject],
            );
            return operation(tx);
          }),
      };
      await new RuntimeReadBindingStore({
        database: subjectDb,
        authorizationPublisherRole: roles.publisher,
        runtimeReaderRole: roles.reader,
      }).bindCurrentSeat({ authorization });
    }
    // This is not an admission publisher implementation. Only this disposable
    // positive mechanism fixture overrides the currently missing publication
    // veto; restore it even when INSERT fails. Application/proposal unchanged.
    await admin.query(
      'alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_requires_real_publication',
    );
    try {
      await admin.query(
        "insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding) select world_id,'ADMISSION_O_TEST_ONLY',seed_id,seed_fingerprint,$2,replay_binding from world_v2.opening_seed where world_id=$1",
        [c.world, c.seed.replayBinding.modelVersion],
      );
    } finally {
      await admin.query(
        'alter table world_v2.runtime_opening_admission enable trigger runtime_opening_admission_requires_real_publication',
      );
    }
    const project = 'abcdefghijklmnopqrst',
      issuer = `https://${project}.supabase.co/auth/v1`,
      jwksUrl = issuer + '/.well-known/jwks.json';
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = {
      ...keys.publicKey.export({ format: 'jwk' }),
      kid: 'O_TEST_ONLY',
      alg: 'ES256',
      use: 'sig',
    };
    const fetchKeys: typeof fetch = async () => {
      const response = new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'content-type': 'application/json' },
      });
      Object.defineProperty(response, 'url', { value: jwksUrl });
      return response;
    };
    const auth = {
      projectRef: project,
      expectedIssuer: issuer,
      jwksUrl,
      audience: 'authenticated',
      fetch: fetchKeys,
    };
    const admittedWorldPins = {
      worldId: c.world,
      seedRef: c.seed.seedId,
      contentHash: c.seed.fingerprint,
      admissionRef: 'ADMISSION_O_TEST_ONLY',
      minimumWorldVersion: '0',
    };
    const intake = createAuthenticatedFinancialIntakeComposition({
      readPool: reader,
      writerPool: writer,
      readerRole: roles.reader,
      writerRole: roles.writer,
      authorizationPublisherRole: roles.publisher,
      admittedWorldPins,
      auth,
      clock: c.hostInput.clock,
      resolveActorId: async (subject) =>
        Object.values(c.original.officeActors).find(
          (actor) => actor.principal.authSubject === subject,
        )?.actorId ?? null,
    });
    const readHost = createNonactivatedRuntimeReadHost({
      pool: reader,
      readerRole: roles.reader,
      authorizationPublisherRole: roles.publisher,
      admittedWorldPins,
      auth,
      endpointPins: {
        origin: 'https://o-test-only.example.invalid',
        projectionPath: '/v1/world-read',
        finalLookupPath: '/v1/final-receipt',
        deploymentRef: 'O_TEST_ONLY_NOT_DEPLOYED',
      },
      routeOptions: { allowedOrigins: ['https://o-test-only.example.invalid'] },
    });
    const token = (seat: V10FixtureActorKey) => {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'O_TEST_ONLY' }),
      ).toString('base64url');
      const claims = Buffer.from(
        JSON.stringify({
          sub: c.original.officeActors[seat].principal.authSubject,
          iss: issuer,
          aud: 'authenticated',
          iat: now - 10,
          exp: now + 120,
        }),
      ).toString('base64url');
      return `${header}.${claims}.${sign('sha256', Buffer.from(header + '.' + claims), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    };
    const commandId = 'COMMAND_O_JWT_TRANSFER',
      idempotencyKey = 'KEY_O_JWT_TRANSFER';
    const staged = (
      action: FinancialIntakeAction,
      seat: V10FixtureActorKey = 'sellerTrade',
      extra: Record<string, unknown> = {},
    ) => ({
      schemaVersion: 'world-staged-transfer-v1',
      action,
      worldId: c.world,
      commandId,
      idempotencyKey,
      countryId: c.original.officeActors[seat].membership.countryId,
      officeId: c.original.officeActors[seat].officeId,
      ...extra,
    });
    const call = (request: unknown, seat: V10FixtureActorKey = 'sellerTrade') =>
      intake.handle({
        authorization: `Bearer ${token(seat)}`,
        request: {
          schemaVersion: 'world-authenticated-financial-intake-v1',
          requestId: '33333333-3333-4333-8333-333333333333',
          request,
        },
      });
    const scope = (seat: V10FixtureActorKey) =>
      officePrivateReadProjectionScopeKey({
        countryId: c.original.officeActors[seat].membership.countryId,
        officeId: c.original.officeActors[seat].officeId,
      });
    const projection = (seat: V10FixtureActorKey, scopeKey = scope(seat)) =>
      readHost.composition.handleProjection({
        authorization: `Bearer ${token(seat)}`,
        request: {
          schemaVersion: 'world-read-api-v1',
          requestId: '44444444-4444-4444-8444-444444444444',
          operation: 'READ_WORLD_PROJECTION',
          payload: {
            worldId: c.world,
            classification: 'OFFICE_PRIVATE',
            scopeKey,
          },
        },
      });
    const final = () =>
      readHost.composition.handleFinalLookup({
        authorization: `Bearer ${token('sellerTrade')}`,
        request: {
          schemaVersion: 'world-final-receipt-read-v1',
          requestId: '55555555-5555-4555-8555-555555555555',
          operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
          payload: { worldId: c.world, commandId, idempotencyKey },
        },
      });
    const asset = c.original.inventoryAccounts.sellerAvailable;
    const intent = {
      expectedWorldVersion: '0',
      buyerCountryId: c.original.countries.buyer,
      quantity: { amount: '2', unit: asset.unit },
      price: { amount: '3', currency: 'GCU', perUnit: asset.unit },
      assetSource: {
        batchId: asset.batchId,
        physicalLocationId: asset.physicalLocationId,
        titleHolderId: asset.titleHolderId,
        riskBearerId: asset.riskBearerId,
        economicRecognitionId: asset.economicRecognitionId,
      },
      expiresAtReal: new Date(Date.now() + 600000).toISOString(),
    };
    return {
      c,
      admin,
      database,
      roles,
      root,
      port,
      publish,
      call,
      staged,
      scope,
      projection,
      final,
      intent,
      commandId,
      idempotencyKey,
      intake,
      readHost,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
