import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
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
import { snapshotStorageFixtureSql } from '../support/snapshot-storage-fixture.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  createOpeningSeed,
  createOpeningSource,
  createInventoryAccount,
  createFinancialAccount,
  openingSeedId,
  openingSourceId,
  worldId,
  Quantity,
  parseWorldWriterLease,
  createWorldWriterCommitAssertion,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { createLocalNarrowReservationWorker } from '../../apps/world-worker/src/preparation/local-narrow-reservation-worker.js';
import { AuthoritativeActivityReadProjectionPublisher } from '../../apps/world-worker/src/projections/authoritative-activity-read-projection-publisher.js';
import { CurrentAuthorizationEntitlementPublisher } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import { createWorldReadRequest } from '../../apps/world-api/src/integration/contracts.js';

const root = path.resolve(import.meta.dirname, '../..');
const native = process.env.STAGED_HTTP_NATIVE === '1';
const fixture = createV10TwoCountryTestFixture();
const actors = fixture.officeActors;
type Seat = keyof typeof actors;
const secret = randomBytes(32);
const issuer = 'https://staged.local.test';
const schemaVersion = 'world-staged-transfer-v1';
const route = '/local/v1/staged-narrow-transfer';
const sha256Hex = (value: string) =>
  createHash('sha256').update(value).digest('hex');

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
    await db.executeScript(snapshotStorageFixtureSql);
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
        queries: {
          policy: {
            jwt: {
              expectedIssuer: issuer,
              expectedAudience: 'authenticated',
              nowEpochSeconds: Math.floor(Date.now() / 1000),
            },
            timeoutMs: 5000,
          },
          executor: {
            query: (request) =>
              db.transaction(async (transaction) => {
                if (!request.verifiedAuthSubject)
                  throw new Error('NO_VERIFIED_SUBJECT');
                await transaction.query(
                  "select set_config('request.jwt.claim.sub',$1,true)",
                  [request.verifiedAuthSubject],
                );
                return transaction.query(request.text, request.values);
              }),
          },
        },
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
  async function enqueue() {
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
    expect(
      (
        await call(
          body('ENQUEUE', 'sellerTrade', {
            commandFingerprint: fingerprint,
            approvalRef: reference,
          }),
        )
      ).json.state?.status,
    ).toBe('QUEUED');
  }
  async function bootstrap(amount = '4') {
    // Fresh disposable test dataset, not conversion/adoption of the V10
    // TEST_FIXTURE source into production provenance. Reuses only test numbers.
    const source = createOpeningSource(
      {
        schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: openingSourceId(`SOURCE_HTTP_NONPRODUCTION_${ordinal}`),
        sourceKind: 'AUTHORITATIVE_DATASET',
        locator: 'dataset://test-only/http-reservation',
        sourceVersion: 'TEST_ONLY_NOT_OFFICIAL',
        payload: {
          testOnly: true,
          productionFallback: false,
          numericalFixture: fixture.fixtureVersion,
        },
      },
      sha256Hex,
    );
    const seed = createOpeningSeed(
      {
        schemaVersion: OPENING_SEED_SCHEMA_VERSION,
        seedId: openingSeedId(`SEED_HTTP_NONPRODUCTION_${ordinal}`),
        worldId: worldId(world),
        openingWorldVersion: '0',
        replayBinding: CURRENT_REPLAY_BINDING,
        sources: [source],
        inventoryEntries: fixture.openingSeed.inventoryEntries.map((entry) => ({
          ...entry,
          sourceId: source.sourceId,
          account: createInventoryAccount({
            ...entry.account,
            worldId: worldId(world),
          }),
          quantity: Quantity.from(amount, entry.quantity.unit),
        })),
        financialBatches: fixture.openingSeed.financialBatches.map((batch) => ({
          ...batch,
          sourceId: source.sourceId,
          legs: batch.legs.map((leg) => ({
            ...leg,
            account: createFinancialAccount({
              ...leg.account,
              worldId: worldId(world),
            }),
          })),
        })),
      },
      sha256Hex,
    );
    await new WorldOpeningSeedStore({ database: db, sha256Hex }).bootstrap({
      seed,
      bootstrappedAtReal: real,
    });
  }
  function worker(
    holder = 'WORKER_HTTP_RESERVATION',
    executionDatabase: SqlDatabase = db,
  ) {
    return createLocalNarrowReservationWorker({
      database: executionDatabase,
      sha256Hex,
      workerId: holder,
      environment: { ECONMIND_ENV: native ? 'ci' : 'local' },
      clock: { nowReal: () => real, simTime: async () => simTicks },
    });
  }
  it('real HTTP → approved queue → SQL Worker → FINAL → durable inventory and authenticated projection', async () => {
    await bootstrap();
    await enqueue();
    const result = await worker().execute({
      worldId: world,
      commandId: 'COMMAND_HTTP',
    });
    expect(result.source).toBe('NEW_FINAL');
    expect(result.receipt).toMatchObject({
      outcome: 'COMMITTED',
      worldVersionBefore: '0',
      worldVersionAfter: '1',
    });
    const ledger = await new DurableV08LedgerLineageReader({
      database: db,
      sha256Hex,
    }).rebuild(world);
    expect(
      ledger.financial.positions.map((position) => ({
        accountId: position.account.accountId,
        balance: position.netDebitBalance.toCanonicalValue(),
      })),
    ).toEqual(
      fixture.rebuiltLedgers.financial.positions.map((position) => ({
        accountId: position.account.accountId,
        balance: position.netDebitBalance.toCanonicalValue(),
      })),
    );
    expect(
      (
        await db.query(
          `select
      (select count(*)::int from world_v2.inventory_posting where world_id=$1) inventory,
      (select count(*)::int from world_v2.financial_posting_batch where world_id=$1) financial,
      (select count(*)::int from world_v2.notification_outbox where world_id=$1) outbox`,
          [world],
        )
      ).rows,
    ).toEqual([{ inventory: 1, financial: 0, outbox: 1 }]);
    expect(
      ledger.inventory.balances
        .map((balance) => ({
          bucket: balance.account.bucket,
          quantity: balance.quantity.toCanonicalValue().amount,
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    ).toEqual([
      { bucket: 'AVAILABLE', quantity: '2' },
      { bucket: 'RESERVED', quantity: '2' },
    ]);
    const leaseRow = (
      await db.query<Record<string, unknown>>(
        'select * from world_v2.world_writer_lease where world_id=$1',
        [world],
      )
    ).rows[0]!;
    const render = (value: unknown) =>
      value instanceof Date ? value.toISOString() : value;
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: world,
      holderId: leaseRow.holder_id,
      fencingToken: String(leaseRow.fencing_token),
      acquiredAtReal: render(leaseRow.acquired_at_real),
      renewedAtReal: render(leaseRow.renewed_at_real),
      expiresAtReal: render(leaseRow.lease_expires_at_real),
    });
    const publication = {
      assertion: createWorldWriterCommitAssertion(lease, '1'),
      observedAtReal: real,
    };
    await new AuthoritativeActivityReadProjectionPublisher({
      database: db,
      workerId: lease.holderId,
    }).replace(publication);
    await new CurrentAuthorizationEntitlementPublisher({
      database: db,
      workerId: lease.holderId,
    }).replace(publication);
    expect((await call(body('READ'))).json.state).toMatchObject({
      status: 'FINAL',
      receipt: { outcome: 'COMMITTED' },
    });
    const projectionResponse = await fetch(
      `${running.origin}/local/v1/world-read`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token('sellerTrade')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          createWorldReadRequest({
            requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            worldId: world,
            classification: 'COUNTRY',
            scopeKey: fixture.countries.seller,
          }),
        ),
      },
    );
    const projection = await projectionResponse.json();
    expect(projectionResponse.status, JSON.stringify(projection)).toBe(200);
    expect(projection).toMatchObject({ ok: true });
    expect(projection).toMatchObject({
      data: {
        watermark: { worldVersion: '1', eventSequence: '1' },
        payload: {
          ledger: {
            inventoryPositions: [
              { bucket: 'AVAILABLE', quantity: '-2', unit: 'tonne' },
              { bucket: 'RESERVED', quantity: '2', unit: 'tonne' },
            ],
          },
        },
      },
    });
    const receiptResponse = await fetch(
      `${running.origin}/local/v1/narrow-transfer-receipt`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token('sellerTrade')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 'world-final-receipt-read-v1',
          requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
          payload: {
            worldId: world,
            commandId: 'COMMAND_HTTP',
            idempotencyKey: 'KEY_HTTP',
          },
        }),
      },
    );
    expect(receiptResponse.status).toBe(200);
    expect(await receiptResponse.json()).toMatchObject({
      ok: true,
      receipt: {
        outcome: 'COMMITTED',
        worldVersionAfter: '1',
        eventIds: result.receipt.eventIds,
      },
    });
    expect(await counts()).toMatchObject({
      commands: 1,
      queues: 1,
      receipts: 1,
      events: 1,
      version: '1',
    });
    const beforeRetry = await counts();
    expect(
      (await worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }))
        .source,
    ).toBe('EXISTING_FINAL');
    expect(await counts()).toEqual(beforeRetry);
    console.info(
      'HTTP_RESERVATION_CAUSAL_EVIDENCE',
      JSON.stringify({
        database: db.kind,
        world,
        commandId: 'COMMAND_HTTP',
        request: 'REAL_LOOPBACK_HTTP',
        final: result.receipt.outcome,
        worldVersion: '0→1',
        inventory: 'AVAILABLE 4→2; RESERVED 0→2 tonne',
        payment: 'NOT_EXECUTED_RESERVATION_ONLY',
        projection,
        production: 'NOT_RUN',
      }),
    );
  });
  it('does not manufacture opening lineage or claim when opening is missing', async () => {
    await enqueue();
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      receipts: 0,
      events: 0,
      version: '0',
    });
    expect(
      (
        await db.query(
          'select queue_state from world_v2.command_queue where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ queue_state: 'PENDING' }]);
    expect(
      (
        await db.query(
          'select count(*)::int as count from world_v2.world_writer_lease where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
  it('rechecks Finance after enqueue and cannot commit stale approval', async () => {
    await bootstrap();
    await enqueue();
    await db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='FINANCE'",
      [world],
    );
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      receipts: 0,
      events: 0,
      version: '0',
    });
  });
  it('fails closed on insufficient durable stock and a different active writer', async () => {
    await bootstrap('1');
    await enqueue();
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    await expect(
      worker('WORKER_OTHER_HTTP').execute({
        worldId: world,
        commandId: 'COMMAND_HTTP',
      }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      receipts: 0,
      events: 0,
      version: '0',
    });
  });
  function atomicFault(kind: 'BEFORE_RECEIPT' | 'AFTER_COMMIT'): SqlDatabase {
    let armed = true;
    return {
      query: (sql, values) => db.query(sql, values),
      transaction: async (operation) => {
        let atomic = false;
        const result = await db.transaction((transaction) =>
          operation({
            query: async (sql, values) => {
              if (sql.includes('insert into world_v2.command_receipt')) {
                atomic = true;
                if (armed && kind === 'BEFORE_RECEIPT') {
                  armed = false;
                  throw new Error('INJECTED_BEFORE_FINAL_RECEIPT');
                }
              }
              return transaction.query(sql, values);
            },
          }),
        );
        if (atomic && armed && kind === 'AFTER_COMMIT') {
          armed = false;
          throw new Error('INJECTED_ATOMIC_ACK_LOSS');
        }
        return result;
      },
    };
  }
  it('rolls back Event and Posting if final receipt write fails; bounded retry commits once', async () => {
    await bootstrap();
    await enqueue();
    const executor = worker(
      'WORKER_HTTP_RESERVATION',
      atomicFault('BEFORE_RECEIPT'),
    );
    await expect(
      executor.execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      events: 0,
      receipts: 0,
      version: '0',
    });
    expect(
      (
        await db.query(
          'select count(*)::int as count from world_v2.inventory_posting where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (await executor.execute({ worldId: world, commandId: 'COMMAND_HTTP' }))
        .receipt.outcome,
    ).toBe('COMMITTED');
    expect(await counts()).toMatchObject({
      events: 1,
      receipts: 1,
      version: '1',
    });
  });
  it('recovers commit acknowledgement loss from durable FINAL, without duplicate inventory movement', async () => {
    await bootstrap();
    await enqueue();
    const executor = worker(
      'WORKER_HTTP_RESERVATION',
      atomicFault('AFTER_COMMIT'),
    );
    expect(
      (await executor.execute({ worldId: world, commandId: 'COMMAND_HTTP' }))
        .receipt.outcome,
    ).toBe('COMMITTED');
    expect((await call(body('READ'))).json.state?.status).toBe('FINAL');
    expect(
      (await worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }))
        .source,
    ).toBe('EXISTING_FINAL');
    expect(await counts()).toMatchObject({
      events: 1,
      receipts: 1,
      version: '1',
    });
    expect(
      (
        await db.query(
          'select count(*)::int as count from world_v2.inventory_posting where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it('rejects production preparation configuration before any database use', () => {
    expect(() =>
      createLocalNarrowReservationWorker({
        database: db,
        sha256Hex,
        workerId: 'WORKER_HTTP_RESERVATION',
        environment: { ECONMIND_ENV: 'production' },
        clock: { nowReal: () => real, simTime: async () => simTicks },
      }),
    ).toThrow('local/CI only');
  });
  it('concurrent bounded writers produce one final reservation, never two movements', async () => {
    await bootstrap();
    await enqueue();
    const results = await Promise.allSettled([
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
      worker('WORKER_OTHER_HTTP').execute({
        worldId: world,
        commandId: 'COMMAND_HTTP',
      }),
    ]);
    expect(
      results.some(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.receipt.outcome === 'COMMITTED',
      ),
    ).toBe(true);
    expect(
      (await worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }))
        .source,
    ).toBe('EXISTING_FINAL');
    expect(await counts()).toMatchObject({
      events: 1,
      receipts: 1,
      version: '1',
    });
    expect(
      (
        await db.query(
          'select count(*)::int as count from world_v2.inventory_posting where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it('does not execute a Command before its server SimTime is due', async () => {
    await bootstrap();
    await enqueue();
    simTicks = '9999';
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      events: 0,
      receipts: 0,
      version: '0',
    });
    expect(
      (
        await db.query(
          'select queue_state from world_v2.command_queue where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ queue_state: 'PENDING' }]);
  });
  it('cannot manufacture a Core context after current Seller authority is revoked', async () => {
    await bootstrap();
    await enqueue();
    await db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and country_id=$2 and office_id='TRADE'",
      [world, fixture.countries.seller],
    );
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      events: 0,
      receipts: 0,
      version: '0',
    });
  });
  it('rejects the old claimed fence after lease takeover instead of silently recovering it', async () => {
    await bootstrap('1');
    await enqueue();
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    real = new Date(Date.parse(real) + 61000).toISOString();
    await db.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
      [world, 'WORKER_OTHER_HTTP', real],
    );
    await expect(
      worker().execute({ worldId: world, commandId: 'COMMAND_HTTP' }),
    ).rejects.toThrow();
    await expect(
      worker('WORKER_OTHER_HTTP').execute({
        worldId: world,
        commandId: 'COMMAND_HTTP',
      }),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({
      events: 0,
      receipts: 0,
      version: '0',
    });
  });
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
