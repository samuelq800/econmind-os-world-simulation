import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

import { afterEach, describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  parseCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import {
  createPGliteV09AtomicTestDatabase,
  createLocalPostgresV09AtomicTestDatabase,
} from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0004_world_v2_receipt_event_set_integrity.sql',
  '0005_world_v2_writer_lease_fencing.sql',
  '0006_world_v2_writer_lease_lineage_guard.sql',
  '0007_world_v2_atomic_transition_facts.sql',
  '0008_world_v2_materialization_recovery.sql',
  '0009_world_v2_posting_payload_integrity.sql',
  '0010_world_v2_command_claim_fencing.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0012_world_v2_command_claim_active_lease_guard.sql',
  '0013_world_v2_read_projection_boundary.sql',
  '0014_world_v2_current_negotiation_party_membership.sql',
  '0015_world_v2_narrow_transfer_approvals.sql',
  '0016_world_v2_opening_seed.sql',
  '0017_world_v2_narrow_transfer_approval_reference.sql',
] as const;
const SUBMITTED = '2026-09-14T00:00:00.000Z';
const EXPIRES = '2026-09-14T00:10:00.000Z';
const sha256Hex: Sha256Hex = (preimage) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const databases: V09AtomicTestDatabase[] = [];
const nativeCleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
  await Promise.all(nativeCleanups.splice(0).map((cleanup) => cleanup()));
});

function command(quantity = '2', suffix = ''): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const source = fixture.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: `COMMAND_V10_2_DURABLE_APPROVAL${suffix}`,
      idempotencyKey: `IDEMPOTENCY_V10_2_DURABLE_APPROVAL${suffix}`,
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: SUBMITTED,
      correlationId: 'CORRELATION_V10_2_DURABLE_APPROVAL',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: fixture.countries.seller,
        buyerCountryId: fixture.countries.buyer,
        quantity: { amount: quantity, unit: source.unit },
        price: { amount: '3', currency: 'GCU', perUnit: source.unit },
        assetSource: {
          batchId: source.batchId,
          physicalLocationId: source.physicalLocationId,
          titleHolderId: source.titleHolderId,
          riskBearerId: source.riskBearerId,
          economicRecognitionId: source.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: EXPIRES,
      },
    },
    sha256Hex,
  );
}

async function database(
  command: CanonicalCommand,
  persistCommand = true,
): Promise<V09AtomicTestDatabase> {
  let database: V09AtomicTestDatabase;
  if (process.env.APPROVAL_REFERENCE_NATIVE === '1') {
    const authorized = assertV09PostgresTestEnvironment();
    const admin = new Pool({ connectionString: authorized.connectionString });
    // Each test owns a new empty disposable DB; never drop an existing schema.
    const name = `econmind_v09_approval_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`create database ${name}`);
    nativeCleanups.push(async () => {
      try {
        await admin.query(`drop database ${name}`);
      } finally {
        await admin.end();
      }
    });
    const target = new URL(authorized.connectionString);
    target.pathname = `/${name}`;
    database = createLocalPostgresV09AtomicTestDatabase({
      ...process.env,
      V09_TEST_DATABASE_URL: target.toString(),
    });
  } else {
    database = createPGliteV09AtomicTestDatabase();
  }
  databases.push(database);
  for (const migration of migrations) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await database.query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [command.worldId],
  );
  if (persistCommand)
    await database.query(
      `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11, $12, $13,
             $14, $15, $16::timestamptz)`,
      [
        command.worldId,
        command.commandId,
        command.idempotencyKey,
        command.commandType,
        command.schemaVersion,
        command.canonicalPayload,
        command.payloadHash,
        command.fingerprint,
        command.authSubject,
        command.actorId,
        command.countryId,
        command.officeId,
        command.expectedWorldVersion,
        command.simTime.ticks,
        command.correlationId,
        command.submittedAtReal,
      ],
    );
  const fixture = createV10TwoCountryTestFixture();
  for (const actor of [
    fixture.officeActors.sellerTrade,
    fixture.officeActors.buyerTrade,
    fixture.officeActors.buyerFinance,
  ]) {
    await database.query(
      `insert into world_v2.current_commit_authorization
         (world_id, auth_subject, country_id, office_id, capability, team_id,
          authorization_version, active, refreshed_at_real)
       values ($1, $2::uuid, $3, $4, $5, $6, $7, true, $8::timestamptz)`,
      [
        command.worldId,
        actor.principal.authSubject,
        actor.membership.countryId,
        actor.officeId,
        actor.capability,
        actor.membership.teamId,
        actor.membership.authorizationVersion,
        SUBMITTED,
      ],
    );
  }
  return database;
}

describe('V10.2 durable narrow transfer approval store', () => {
  it('rejects a different canonical intent with the same durable Command identity before creating a proposal', async () => {
    const accepted = command();
    const testDatabase = await database(accepted);
    const fixture = createV10TwoCountryTestFixture();
    const store = new NarrowTransferApprovalStore({
      database: testDatabase,
      sha256Hex,
    });

    await expect(
      store.openSellerOffer({
        command: command('1'),
        signer: {
          actorId: fixture.officeActors.sellerTrade.actorId,
          authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
          signedAtReal: '2026-09-14T00:00:01.000Z',
        },
      }),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT },
    });
    await expect(
      testDatabase.query<{ readonly count: string }>(
        `select count(*)::text as count
           from world_v2.narrow_transfer_proposal
          where world_id = $1`,
        [accepted.worldId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  });

  it('binds all three current Office signatures and rechecks their revision at the atomic cutoff', async () => {
    const value = command();
    const fixture = createV10TwoCountryTestFixture();
    const testDatabase = await database(value);
    const store = new NarrowTransferApprovalStore({
      database: testDatabase,
      sha256Hex,
    });

    await expect(
      testDatabase.query<{
        readonly capability: string;
        readonly country_id: string;
        readonly office_id: string;
      }>(
        `select country_id, office_id, capability
           from world_v2.current_commit_authorization
          where world_id = $1
          order by country_id, office_id`,
        [value.worldId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          capability: 'FINANCE_TREASURY',
          country_id: fixture.countries.buyer,
          office_id: 'FINANCE',
        },
        {
          capability: 'TRADE_CONTRACTS',
          country_id: fixture.countries.buyer,
          office_id: 'TRADE',
        },
        {
          capability: 'TRADE_CONTRACTS',
          country_id: fixture.countries.seller,
          office_id: 'TRADE',
        },
      ],
    });
    await store.openSellerOffer({
      command: value,
      signer: {
        actorId: fixture.officeActors.sellerTrade.actorId,
        authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
        signedAtReal: '2026-09-14T00:00:01.000Z',
      },
    });
    await store.signBuyerOffice({
      command: value,
      office: 'TRADE',
      signer: {
        actorId: fixture.officeActors.buyerTrade.actorId,
        authSubject: fixture.officeActors.buyerTrade.principal.authSubject,
        signedAtReal: '2026-09-14T00:00:02.000Z',
      },
    });
    await store.signBuyerOffice({
      command: value,
      office: 'FINANCE',
      signer: {
        actorId: fixture.officeActors.buyerFinance.actorId,
        authSubject: fixture.officeActors.buyerFinance.principal.authSubject,
        signedAtReal: '2026-09-14T00:00:03.000Z',
      },
    });

    const cutoffAuthorizationQueries: string[] = [];
    await expect(
      testDatabase.transaction((transaction) => {
        const observingTransaction: SqlExecutor = {
          query<Row extends object = Record<string, unknown>>(
            statement: string,
            parameters?: readonly unknown[],
          ) {
            if (
              statement.includes('from world_v2.current_commit_authorization')
            ) {
              cutoffAuthorizationQueries.push(statement);
            }
            return transaction.query<Row>(statement, parameters);
          },
        };
        return store.assertCurrent(observingTransaction, {
          command: value,
          observedAtReal: '2026-09-14T00:00:04.000Z',
        });
      }),
    ).resolves.toBe(undefined);
    expect(cutoffAuthorizationQueries).toHaveLength(3);
    for (const statement of cutoffAuthorizationQueries) {
      expect(statement).toMatch(/for update/u);
      expect(statement).not.toMatch(/for key share/u);
    }
    await expect(
      testDatabase.query<{
        readonly proposal_id: string;
        readonly status: string;
      }>(
        `select proposal_id, status
           from world_v2.narrow_transfer_proposal
          where world_id = $1
          order by proposal_id`,
        [value.worldId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          proposal_id: `BUYER_APPROVAL_${value.commandId}`,
          status: 'APPROVED',
        },
        {
          proposal_id: `SELLER_APPROVAL_${value.commandId}`,
          status: 'APPROVED',
        },
      ],
    });

    await testDatabase.query(
      `update world_v2.current_commit_authorization
          set authorization_version = 'AUTH_V10_BUYER_2'
        where world_id = $1
          and auth_subject = $2::uuid
          and office_id = 'FINANCE'`,
      [value.worldId, fixture.officeActors.buyerFinance.principal.authSubject],
    );
    await expect(
      testDatabase.transaction((transaction) =>
        store.assertCurrent(transaction as SqlExecutor, {
          command: value,
          observedAtReal: '2026-09-14T00:00:04.000Z',
        }),
      ),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
  });
});

const BIND_AT = '2026-09-14T00:00:04.000Z';
const APPROVAL_REF = 'APPROVAL_V10_BUYER_FINANCE';

async function signFixture(
  store: NarrowTransferApprovalStore,
  value: CanonicalCommand,
  finance = true,
) {
  const { officeActors } = createV10TwoCountryTestFixture();
  const signer = (actor: typeof officeActors.buyerFinance, second: string) => ({
    actorId: actor.actorId,
    authSubject: actor.principal.authSubject,
    signedAtReal: `2026-09-14T00:00:0${second}.000Z`,
  });
  await store.openSellerOffer({
    command: value,
    signer: signer(officeActors.sellerTrade, '1'),
  });
  await store.signBuyerOffice({
    command: value,
    office: 'TRADE',
    signer: signer(officeActors.buyerTrade, '2'),
  });
  if (finance)
    await store.signBuyerOffice({
      command: value,
      office: 'FINANCE',
      signer: signer(officeActors.buyerFinance, '3'),
    });
}

async function setupReference(finance = true) {
  const value = command();
  const db = await database(value);
  const store = new NarrowTransferApprovalStore({ database: db, sha256Hex });
  await signFixture(store, value, finance);
  const input = {
    command: value,
    approvalRef: APPROVAL_REF,
    observedAtReal: BIND_AT,
  };
  return { value, db, store, input };
}

async function referenceCount(db: SqlExecutor) {
  return (
    await db.query<{ count: string }>(
      'select count(*)::text as count from world_v2.narrow_transfer_approval_reference',
    )
  ).rows[0]?.count;
}

describe(`approval-reference write contract (${process.env.APPROVAL_REFERENCE_NATIVE === '1' ? 'native PostgreSQL' : 'PGlite'})`, () => {
  it('binds the exact durable signature and concurrent retries return the first immutable row', async () => {
    const { value, db, store, input } = await setupReference();
    const [first, concurrent] = await Promise.all([
      store.bindBuyerFinanceApprovalReference(input),
      store.bindBuyerFinanceApprovalReference(input),
    ]);
    const finance = createV10TwoCountryTestFixture().officeActors.buyerFinance;
    expect(first).toEqual({
      worldId: value.worldId,
      approvalRef: APPROVAL_REF,
      proposalRef: `BUYER_APPROVAL_${value.commandId}`,
      buyerCountryId: finance.membership.countryId,
      commandId: value.commandId,
      commandFingerprint: value.fingerprint,
      officeId: 'FINANCE',
      financeActorId: finance.actorId,
      financeAuthSubject: finance.principal.authSubject,
      financeAuthorizationVersion: finance.membership.authorizationVersion,
      financeSignedAtReal: '2026-09-14T00:00:03.000Z',
      boundAtReal: BIND_AT,
    });
    expect(concurrent).toEqual(first);
    expect(
      await store.bindBuyerFinanceApprovalReference({
        ...input,
        observedAtReal: '2026-09-14T00:00:05.000Z',
      }),
    ).toEqual(first);
    expect(await referenceCount(db)).toBe('1');
    // Approval persistence cannot change WorldVersion or create settlement.
    expect(
      (
        await db.query(
          'select world_version::text as version from world_v2.world_head',
        )
      ).rows,
    ).toEqual([{ version: '0' }]);
    expect(
      (
        await db.query(
          'select count(*)::text as count from world_v2.authoritative_event',
        )
      ).rows,
    ).toEqual([{ count: '0' }]);
  });

  it('requires an already durable Command: reference binding and signing cannot bootstrap intake', async () => {
    const value = command();
    const db = await database(value, false);
    const store = new NarrowTransferApprovalStore({ database: db, sha256Hex });
    await expect(
      store.bindBuyerFinanceApprovalReference({
        command: value,
        approvalRef: APPROVAL_REF,
        observedAtReal: BIND_AT,
      }),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
    await expect(signFixture(store, value)).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
    expect(await referenceCount(db)).toBe('0');
  });

  it('does not backfill old signatures or treat an incomplete approval as valid', async () => {
    const { db, store, input } = await setupReference(false);
    expect(await referenceCount(db)).toBe('0');
    await expect(
      store.bindBuyerFinanceApprovalReference(input),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
    expect(await referenceCount(db)).toBe('0');
  });

  it('rejects reference replacement and changed canonical intent with zero added binding', async () => {
    const { db, store, input } = await setupReference();
    await store.bindBuyerFinanceApprovalReference(input);
    for (const changed of [
      { ...input, approvalRef: 'APPROVAL_REPLACEMENT' },
      { ...input, command: command('1') },
    ])
      await expect(
        store.bindBuyerFinanceApprovalReference(changed),
      ).rejects.toMatchObject({
        cause: { code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT },
      });
    expect(await referenceCount(db)).toBe('1');
  });

  it('arbitrates concurrent reuse of one reference across different approved Commands', async () => {
    const { db, store, input, value } = await setupReference();
    const other = command('2', '_OTHER');
    await db.query(
      `insert into world_v2.command_submission
      (world_id, command_id, idempotency_key, command_type, schema_version,
       canonical_payload, payload_sha256, command_fingerprint, auth_subject,
       actor_id, country_id, office_id, expected_world_version, sim_time,
       correlation_id, submitted_at_real)
      select world_id, $2, $3, command_type, schema_version, canonical_payload,
             payload_sha256, $4, auth_subject, actor_id, country_id, office_id,
             expected_world_version, sim_time, correlation_id, submitted_at_real
        from world_v2.command_submission where command_id = $1`,
      [
        value.commandId,
        other.commandId,
        other.idempotencyKey,
        other.fingerprint,
      ],
    );
    await signFixture(store, other);
    const outcomes = await Promise.allSettled([
      store.bindBuyerFinanceApprovalReference(input),
      store.bindBuyerFinanceApprovalReference({ ...input, command: other }),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.find((outcome) => outcome.status === 'rejected'),
    ).toMatchObject({
      reason: { cause: { code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT } },
    });
    expect(await referenceCount(db)).toBe('1');
  });

  it('recovers an acknowledgement-lost write through a fresh exact retry', async () => {
    const { db, input } = await setupReference();
    const lost = new NarrowTransferApprovalStore({
      sha256Hex,
      database: {
        query: db.query,
        transaction: async (operation) => {
          await db.transaction(operation);
          throw new Error('INJECTED_AFTER_COMMIT_BEFORE_ACK');
        },
      },
    });
    await expect(lost.bindBuyerFinanceApprovalReference(input)).rejects.toThrow(
      'INJECTED_AFTER_COMMIT_BEFORE_ACK',
    );
    expect(await referenceCount(db)).toBe('1');
    const restarted = new NarrowTransferApprovalStore({
      database: db,
      sha256Hex,
    });
    expect(
      await restarted.bindBuyerFinanceApprovalReference({
        ...input,
        observedAtReal: '2026-09-14T00:00:05.000Z',
      }),
    ).toMatchObject({ approvalRef: APPROVAL_REF, boundAtReal: BIND_AT });
    expect(await referenceCount(db)).toBe('1');
  });

  it.each(['FINANCE', 'TRADE'] as const)(
    'rereads current %s authority on first bind and retry',
    async (office) => {
      const { db, store, input } = await setupReference();
      await db.query(
        'update world_v2.current_commit_authorization set active = false where office_id = $1',
        [office],
      );
      await expect(
        store.bindBuyerFinanceApprovalReference(input),
      ).rejects.toMatchObject({
        cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
      });
      expect(await referenceCount(db)).toBe('0');
      await db.query(
        'update world_v2.current_commit_authorization set active = true where office_id = $1',
        [office],
      );
      await store.bindBuyerFinanceApprovalReference(input);
      await db.query(
        "update world_v2.current_commit_authorization set authorization_version = 'REVOKED_REVISION' where office_id = $1",
        [office],
      );
      await expect(
        store.bindBuyerFinanceApprovalReference(input),
      ).rejects.toMatchObject({
        cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
      });
      expect(await referenceCount(db)).toBe('1');
    },
  );

  it('rejects expiry on first bind and retry without deleting immutable history', async () => {
    const { db, store, input } = await setupReference();
    const expired = { ...input, observedAtReal: EXPIRES };
    await expect(
      store.bindBuyerFinanceApprovalReference(expired),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
    expect(await referenceCount(db)).toBe('0');
    await store.bindBuyerFinanceApprovalReference(input);
    await expect(
      store.bindBuyerFinanceApprovalReference(expired),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
    expect(await referenceCount(db)).toBe('1');
  });

  it('rolls back a failed binding transaction and permits an exact retry', async () => {
    const { db, input } = await setupReference();
    const failing = new NarrowTransferApprovalStore({
      sha256Hex,
      database: {
        query: db.query,
        transaction: (operation) =>
          db.transaction(async (tx) => {
            await operation(tx);
            throw new Error('INJECTED_BEFORE_COMMIT');
          }),
      },
    });
    await expect(
      failing.bindBuyerFinanceApprovalReference(input),
    ).rejects.toBeDefined();
    expect(await referenceCount(db)).toBe('0');
    const restarted = new NarrowTransferApprovalStore({
      database: db,
      sha256Hex,
    });
    await restarted.bindBuyerFinanceApprovalReference(input);
    expect(await referenceCount(db)).toBe('1');
  });

  it('enforces immutable rows and rejects direct SQL scope/signature substitution', async () => {
    const { db, store, input } = await setupReference();
    await store.bindBuyerFinanceApprovalReference(input);
    for (const statement of [
      "update world_v2.narrow_transfer_approval_reference set approval_ref = 'OTHER_REF'",
      'delete from world_v2.narrow_transfer_approval_reference',
      'truncate world_v2.narrow_transfer_approval_reference',
    ])
      await expect(db.query(statement)).rejects.toBeDefined();
    // INSERT validation runs before uniqueness handling, so this exercises
    // binding validation even though the original proposal is already bound.
    for (const [column, expression] of [
      ['command_fingerprint', "'sha256:' || repeat('0', 64)"],
      ['buyer_country_id', "'COUNTRY_OTHER'"],
      ['finance_actor_id', "'ACTOR_OTHER'"],
      ['finance_auth_subject', "'00000000-0000-0000-0000-000000000001'::uuid"],
      ['finance_authorization_version', "'OTHER_REVISION'"],
      [
        'finance_signed_at_real',
        "finance_signed_at_real + interval '1 second'",
      ],
      ['command_id', "'COMMAND_OTHER'"],
      ['world_id', "'WORLD_OTHER'"],
    ]) {
      const columns = [
        'world_id',
        'approval_ref',
        'proposal_id',
        'buyer_country_id',
        'command_id',
        'command_fingerprint',
        'finance_actor_id',
        'finance_auth_subject',
        'finance_authorization_version',
        'finance_signed_at_real',
        'bound_at_real',
      ];
      const projection = columns
        .map((name) => (name === column ? expression : name))
        .join(', ');
      await expect(
        db.query(
          `insert into world_v2.narrow_transfer_approval_reference (${columns.join(', ')}) select ${projection} from world_v2.narrow_transfer_approval_reference on conflict do nothing`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    expect(await referenceCount(db)).toBe('1');
    expect(
      (
        await db.query(
          "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'world_v2.narrow_transfer_approval_reference'::regclass",
        )
      ).rows,
    ).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    const role = `approval_browser_${randomUUID().replaceAll('-', '')}`;
    await db.query(`create role ${role} nologin`);
    await db.transaction(async (tx) => {
      await tx.query(`set local role ${role}`);
      await expect(
        tx.query('select * from world_v2.narrow_transfer_approval_reference'),
      ).rejects.toMatchObject({ code: '42501' });
    });
    await db.query(`drop role ${role}`);
  });
});
