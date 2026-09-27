import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createLocalStagedNarrowTransferBridge } from '../../apps/world-api/src/integration/staged-narrow-transfer-composition.js';
import {
  startLocalNonproductionWorldHttpBridge,
  type RunningLocalNonproductionWorldHttpBridge,
} from '../../apps/world-api/src/integration/local-nonproduction-http-bridge.js';
import {
  createLocalPostgresV09AtomicTestDatabase,
  createPGliteV09AtomicTestDatabase,
} from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

const root = path.resolve(import.meta.dirname, '../..');
const native = process.env.STAGED_HTTP_NATIVE === '1';
const fixture = createV10TwoCountryTestFixture();
const actors = fixture.officeActors;
type Seat = keyof typeof actors;
const secret = randomBytes(32);
const issuer = 'https://staged.local.test';
const schemaVersion = 'world-staged-transfer-v1';
const route = '/local/v1/staged-narrow-transfer';

describe(`real staged HTTP lifecycle / ${native ? 'native PostgreSQL' : 'PGlite'}`, () => {
  let db: V09AtomicTestDatabase;
  let running: RunningLocalNonproductionWorldHttpBridge;
  let world: string;
  let ordinal = 0;
  let real: string;
  let simTicks = '10000';
  let actorMapping = true;
  let loseAcknowledgement = false;
  let failRecovery = false;

  const token = (seat: Seat) => {
    const seconds = Math.floor(Date.parse(real) / 1000);
    const data = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: actors[seat].principal.authSubject, iss: issuer, aud: 'authenticated', iat: seconds - 1, exp: seconds + 3600 })).toString('base64url')}`;
    return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
  };
  beforeAll(async () => {
    db = native
      ? createLocalPostgresV09AtomicTestDatabase()
      : createPGliteV09AtomicTestDatabase();
    expect(
      (
        await db.query(
          "select to_regclass('world_v2.command_submission')::text as name",
        )
      ).rows,
    ).toEqual([{ name: null }]);
    const manifest = JSON.parse(
      await readFile(
        path.join(root, 'database/migrations/manifest.json'),
        'utf8',
      ),
    ) as { migrations: { path: string }[] };
    for (const migration of manifest.migrations)
      await db.executeScript(
        await readFile(path.join(root, migration.path), 'utf8'),
      );
    const database: SqlDatabase = {
      query: (sql, values) => db.query(sql, values),
      transaction: async (operation) => {
        if (failRecovery) {
          failRecovery = false;
          throw new Error('INJECTED_RECOVERY_CONNECTION_FAILURE');
        }
        const result = await db.transaction(operation);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          failRecovery = true;
          throw new Error('INJECTED_COMMIT_ACK_LOSS');
        }
        return result;
      },
    };
    running = await startLocalNonproductionWorldHttpBridge({
      bridge: createLocalStagedNarrowTransferBridge({
        database,
        approvalPool: {
          query: (sql: string, values: readonly unknown[]) =>
            db.query(sql, values),
        } as unknown as Pick<Pool, 'query'>,
        environment: { ECONMIND_ENV: native ? 'ci' : 'local' },
        expectedIssuer: issuer,
        expectedAudience: 'authenticated',
        verifier: {
          async verify(value: string) {
            const [header, payload, signature, extra] = value.split('.');
            if (!header || !payload || !signature || extra)
              throw new Error('BAD_TOKEN');
            const digest = createHmac('sha256', secret)
              .update(`${header}.${payload}`)
              .digest();
            const supplied = Buffer.from(signature, 'base64url');
            if (
              digest.length !== supplied.length ||
              !timingSafeEqual(digest, supplied)
            )
              throw new Error('BAD_SIGNATURE');
            return JSON.parse(
              Buffer.from(payload, 'base64url').toString(),
            ) as unknown;
          },
        },
        resolveActorId: async (subject: string) =>
          actorMapping
            ? (Object.values(actors).find(
                (actor) => actor.principal.authSubject === subject,
              )?.actorId ?? null)
            : null,
        clock: { nowReal: () => real, simTime: async () => simTicks },
      }),
      port: 0,
    });
  });
  afterAll(async () => {
    await running?.shutdown();
    await db?.close();
  });
  beforeEach(async () => {
    world = `WORLD_STAGED_HTTP_${++ordinal}`;
    real = new Date().toISOString();
    simTicks = '10000';
    actorMapping = true;
    loseAcknowledgement = false;
    failRecovery = false;
    await db.query('insert into world_v2.world_head (world_id) values ($1)', [
      world,
    ]);
    for (const actor of Object.values(actors))
      await db.query(
        `insert into world_v2.current_commit_authorization (world_id, auth_subject, country_id, office_id, capability, team_id, authorization_version, active, refreshed_at_real)
       values ($1,$2::uuid,$3,$4,$5,$6,$7,true,$8::timestamptz)`,
        [
          world,
          actor.principal.authSubject,
          actor.membership.countryId,
          actor.officeId,
          actor.capability,
          actor.membership.teamId,
          actor.membership.authorizationVersion,
          real,
        ],
      );
  });
  function body(
    action: string,
    seat: Seat = 'sellerTrade',
    extra: Record<string, unknown> = {},
  ) {
    return {
      schemaVersion,
      action,
      worldId: world,
      commandId: 'COMMAND_HTTP',
      idempotencyKey: 'KEY_HTTP',
      countryId: actors[seat].membership.countryId,
      officeId: actors[seat].officeId,
      ...extra,
    };
  }
  function intent() {
    const source = fixture.inventoryAccounts.sellerAvailable;
    return {
      expectedWorldVersion: '0',
      buyerCountryId: fixture.countries.buyer,
      quantity: { amount: '2', unit: source.unit },
      price: { amount: '3', currency: 'GCU', perUnit: source.unit },
      assetSource: {
        batchId: source.batchId,
        physicalLocationId: source.physicalLocationId,
        titleHolderId: source.titleHolderId,
        riskBearerId: source.riskBearerId,
        economicRecognitionId: source.economicRecognitionId,
      },
      expiresAtReal: new Date(Date.parse(real) + 600_000).toISOString(),
    };
  }
  async function call(
    request: object,
    seat: Seat = 'sellerTrade',
    bearer = token(seat),
  ) {
    const response = await fetch(`${running.origin}${route}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return {
      http: response.status,
      json: (await response.json()) as {
        ok: boolean;
        state?: Record<string, unknown>;
        error?: { code: string };
      },
    };
  }
  async function register() {
    const request = body('REGISTER', 'sellerTrade', { intent: intent() });
    const result = await call(request);
    expect(result.http).toBe(200);
    expect(result.json.state?.status).toBe('PENDING_APPROVAL_OR_ENQUEUE');
    const inspected = await call(body('INSPECT'));
    return {
      request,
      fingerprint: inspected.json.state?.commandFingerprint as string,
    };
  }
  async function sign(fingerprint: string, finance = true) {
    for (const [action, seat] of [
      ['SIGN_SELLER', 'sellerTrade'],
      ['SIGN_BUYER_TRADE', 'buyerTrade'],
      ...(finance ? [['SIGN_BUYER_FINANCE', 'buyerFinance']] : []),
    ] as [string, Seat][]) {
      const inspected = await call(body('INSPECT', seat), seat);
      expect(inspected.json.state).toMatchObject({
        status: 'INTENT',
        commandFingerprint: fingerprint,
      });
      expect(
        (
          await call(
            body(action, seat, { commandFingerprint: fingerprint }),
            seat,
          )
        ).json.state?.status,
      ).toBe('SIGNATURE_RECORDED');
    }
  }
  async function counts() {
    return (
      await db.query(
        `select
      (select count(*)::int from world_v2.command_submission where world_id=$1) commands,
      (select count(*)::int from world_v2.narrow_transfer_approval_signature where world_id=$1) signatures,
      (select count(*)::int from world_v2.narrow_transfer_approval_reference where world_id=$1) refs,
      (select count(*)::int from world_v2.command_queue where world_id=$1) queues,
      (select count(*)::int from world_v2.command_receipt where world_id=$1) receipts,
      (select count(*)::int from world_v2.authoritative_event where world_id=$1) events,
      world_version::text as version from world_v2.world_head where world_id=$1`,
        [world],
      )
    ).rows[0];
  }
  it('registers over HTTP, obtains three real signatures, binds ref and enqueues once; QUEUED is not FINAL', async () => {
    expect(await counts()).toMatchObject({
      commands: 0,
      signatures: 0,
      refs: 0,
      queues: 0,
    });
    const { fingerprint, request } = await register();
    await sign(fingerprint);
    const bind = body('BIND_REFERENCE', 'buyerFinance', {
      commandFingerprint: fingerprint,
    });
    const reference = (await call(bind, 'buyerFinance')).json.state
      ?.approvalRef;
    expect(reference).toBe('APPROVAL_FINANCE_COMMAND_HTTP');
    expect((await call(bind, 'buyerFinance')).json.state?.approvalRef).toBe(
      reference,
    );
    const enqueue = body('ENQUEUE', 'sellerTrade', {
      commandFingerprint: fingerprint,
      approvalRef: reference,
    });
    expect((await call(enqueue)).json.state?.status).toBe('QUEUED');
    expect((await call(enqueue)).json.state?.status).toBe('QUEUED');
    expect((await call(body('READ'))).json.state?.status).toBe('QUEUED');
    simTicks = '99999';
    real = new Date(Date.parse(real) + 5000).toISOString();
    expect((await call(request)).json.state?.status).toBe('QUEUED');
    expect(await counts()).toEqual({
      commands: 1,
      signatures: 3,
      refs: 1,
      queues: 1,
      receipts: 0,
      events: 0,
      version: '0',
    });
  });
  it('rejects missing Finance signature and cannot manufacture a reference or queue', async () => {
    const { fingerprint } = await register();
    await sign(fingerprint, false);
    expect(
      (
        await call(
          body('BIND_REFERENCE', 'buyerFinance', {
            commandFingerprint: fingerprint,
          }),
          'buyerFinance',
        )
      ).http,
    ).toBe(403);
    expect(
      (
        await call(
          body('ENQUEUE', 'sellerTrade', {
            commandFingerprint: fingerprint,
            approvalRef: 'FAKE_APPROVAL',
          }),
        )
      ).http,
    ).toBe(403);
    expect(await counts()).toMatchObject({
      signatures: 2,
      refs: 0,
      queues: 0,
      events: 0,
    });
  });
  it('rejects forged identity/clock fields, invalid tokens and absent server actor mapping', async () => {
    for (const field of [
      'actorId',
      'authSubject',
      'simTime',
      'submittedAtReal',
      'authorization',
    ]) {
      expect(
        (
          await call(
            body('REGISTER', 'sellerTrade', {
              intent: intent(),
              [field]: 'FORGED',
            }),
          )
        ).http,
      ).toBe(400);
    }
    expect(
      (
        await call(
          body('REGISTER', 'sellerTrade', { intent: intent() }),
          'sellerTrade',
          'forged',
        )
      ).http,
    ).toBe(401);
    actorMapping = false;
    expect(
      (await call(body('REGISTER', 'sellerTrade', { intent: intent() }))).http,
    ).toBe(403);
    expect(await counts()).toMatchObject({ commands: 0, queues: 0 });
  });
  it('rejects changed intent and cross-country/Office signatures', async () => {
    const { request, fingerprint } = await register();
    expect(
      (
        await call({
          ...request,
          intent: { ...intent(), quantity: { amount: '1', unit: 'tonne' } },
        })
      ).http,
    ).toBe(409);
    expect(
      (
        await call(
          body('SIGN_BUYER_FINANCE', 'sellerTrade', {
            commandFingerprint: fingerprint,
          }),
        )
      ).http,
    ).toBe(403);
    expect(
      (
        await call(
          body('SIGN_SELLER', 'buyerTrade', {
            commandFingerprint: fingerprint,
          }),
          'buyerTrade',
        )
      ).http,
    ).toBe(403);
    expect(
      (
        await call(
          body('SIGN_SELLER', 'sellerTrade', {
            commandFingerprint: `sha256:${'0'.repeat(64)}`,
          }),
        )
      ).http,
    ).toBe(409);
    expect(await counts()).toMatchObject({
      commands: 1,
      signatures: 0,
      queues: 0,
    });
  });
  it('rechecks current Finance authorization after reference binding and denies enqueue after revocation', async () => {
    const { fingerprint } = await register();
    await sign(fingerprint);
    const reference = (
      await call(
        body('BIND_REFERENCE', 'buyerFinance', {
          commandFingerprint: fingerprint,
        }),
        'buyerFinance',
      )
    ).json.state?.approvalRef;
    await db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='FINANCE'",
      [world],
    );
    expect(
      (
        await call(
          body('ENQUEUE', 'sellerTrade', {
            commandFingerprint: fingerprint,
            approvalRef: reference,
          }),
        )
      ).http,
    ).toBe(403);
    expect(
      (
        await call(
          body('SIGN_BUYER_FINANCE', 'buyerFinance', {
            commandFingerprint: fingerprint,
          }),
          'buyerFinance',
        )
      ).http,
    ).toBe(403);
    expect(await counts()).toMatchObject({ refs: 1, queues: 0, events: 0 });
  });
  it('recovers UNKNOWN registration by IDs after lost commit acknowledgement, without duplicate intent', async () => {
    const request = body('REGISTER', 'sellerTrade', { intent: intent() });
    loseAcknowledgement = true;
    const uncertain = await call(request);
    expect(uncertain.json.state?.status).toBe('UNKNOWN');
    expect(await counts()).toMatchObject({ commands: 1, queues: 0 });
    expect((await call(body('READ'))).json.state?.status).toBe(
      'PENDING_APPROVAL_OR_ENQUEUE',
    );
    simTicks = '20000';
    real = new Date(Date.parse(real) + 1000).toISOString();
    expect((await call(request)).json.state?.status).toBe(
      'PENDING_APPROVAL_OR_ENQUEUE',
    );
    expect(await counts()).toMatchObject({
      commands: 1,
      signatures: 0,
      refs: 0,
      queues: 0,
      receipts: 0,
    });
  });
  it('recovers UNKNOWN enqueue through a fresh read with exactly one queue row', async () => {
    const { fingerprint } = await register();
    await sign(fingerprint);
    const bound = await call(
      body('BIND_REFERENCE', 'buyerFinance', {
        commandFingerprint: fingerprint,
      }),
      'buyerFinance',
    );
    const enqueue = body('ENQUEUE', 'sellerTrade', {
      commandFingerprint: fingerprint,
      approvalRef: bound.json.state?.approvalRef,
    });
    loseAcknowledgement = true;
    expect((await call(enqueue)).json.state?.status).toBe('UNKNOWN');
    expect((await call(body('READ'))).json.state?.status).toBe('QUEUED');
    expect((await call(enqueue)).json.state?.status).toBe('QUEUED');
    expect(await counts()).toMatchObject({
      commands: 1,
      signatures: 3,
      refs: 1,
      queues: 1,
      receipts: 0,
      events: 0,
    });
  });
  it('rejects JS numeric amounts and handles duplicate HTTP registration without queue effects', async () => {
    const terms = intent();
    expect(
      (
        await call(
          body('REGISTER', 'sellerTrade', {
            intent: { ...terms, quantity: { ...terms.quantity, amount: 2 } },
          }),
        )
      ).http,
    ).toBe(400);
    expect(await counts()).toMatchObject({ commands: 0, queues: 0 });
    const request = body('REGISTER', 'sellerTrade', { intent: terms });
    const results = await Promise.all([call(request), call(request)]);
    expect(results.map((result) => result.json.state?.status)).toEqual([
      'PENDING_APPROVAL_OR_ENQUEUE',
      'PENDING_APPROVAL_OR_ENQUEUE',
    ]);
    expect(await counts()).toMatchObject({ commands: 1, queues: 0 });
  });
  it('keeps the old final-only route unbound and returns NOT_FOUND for an absent staged command', async () => {
    expect((await call(body('READ'))).json.state?.status).toBe('NOT_FOUND');
    const response = await fetch(
      `${running.origin}/local/v1/narrow-transfer-command`,
      { method: 'POST' },
    );
    expect(response.status).toBe(503);
  });
});
