import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  authorizeOfficeCapability,
  createFinalCommandReceipt,
  parseCanonicalCommand,
  type CanonicalCommand,
} from '@econmind/core';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import {
  PostgresNarrowTransferIntake,
  type NarrowTransferIntakeInput,
} from '../../apps/world-worker/src/intake/postgres-narrow-transfer-intake.js';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createV10TwoCountryTestFixture } from './v10-two-country-fixture.js';
import {
  assertIntakeWorkerLockRace,
  withinIntakeRaceDeadline,
} from './f-durable-command-intake-worker-race.js';

export interface IntakeTestDatabase extends SqlDatabase {
  readonly native: boolean;
  executeScript(script: string): Promise<void>;
  close(): Promise<void>;
}

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
] as const;
const AT = '2026-09-27T00:00:00.000Z';
const OBSERVED = '2026-09-27T00:00:04.000Z';
const EXPIRES = '2026-09-27T00:10:00.000Z';
const sha256Hex = (text: string) =>
  createHash('sha256').update(text).digest('hex');

export function defineDurableIntakeSuite(
  label: string,
  databaseFactory: () => IntakeTestDatabase,
  enabled = true,
  native = false,
): void {
  (enabled ? describe : describe.skip)(label, () => {
    let database: IntakeTestDatabase;
    let intake: PostgresNarrowTransferIntake;
    let approvals: NarrowTransferApprovalStore;
    let input: NarrowTransferIntakeInput;
    let ordinal = 0;
    const fixture = createV10TwoCountryTestFixture();

    beforeAll(async () => {
      database = databaseFactory();
      // Native job uses an empty disposable database. Never drop an existing schema.
      const existing = await database.query<{ name: string | null }>(
        "select to_regclass('world_v2.command_submission')::text as name",
      );
      if (existing.rows[0]?.name !== null)
        throw new Error('INTAKE_REQUIRES_EMPTY_DISPOSABLE_DATABASE');
      for (const migration of migrations) {
        await database.executeScript(
          await readFile(
            path.join(root, 'database/migrations/artifacts', migration),
            'utf8',
          ),
        );
      }
    });
    afterAll(async () => {
      await database?.close();
    });

    beforeEach(async () => {
      ordinal += 1;
      const seller = fixture.officeActors.sellerTrade;
      const source = fixture.inventoryAccounts.sellerAvailable;
      const command = parseCanonicalCommand(
        {
          schemaVersion: COMMAND_SCHEMA_VERSION,
          commandType: 'CORE_GOODS_TRANSFER_V1',
          commandId: 'COMMAND_F_INTAKE',
          idempotencyKey: 'KEY_F_INTAKE',
          worldId: `WORLD_F_INTAKE_${ordinal}`,
          actorId: seller.actorId,
          authSubject: seller.principal.authSubject,
          countryId: fixture.countries.seller,
          officeId: 'TRADE',
          expectedWorldVersion: '0',
          simTime: '10000',
          submittedAtReal: AT,
          correlationId: 'CORRELATION_F_INTAKE',
          payload: {
            schemaVersion: 'core-goods-transfer-v1',
            commodityId: 'GRAIN',
            sellerCountryId: fixture.countries.seller,
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
      const authorization = await authorizeOfficeCapability({
        principal: seller.principal,
        resolver: {
          resolveCurrentIdentity: async () => seller.principal.authSubject,
          resolveCurrentMembership: async () => ({
            ...seller.membership,
            worldId: command.worldId,
          }),
        },
        worldId: command.worldId,
        requestedCountryId: command.countryId,
        requestedOfficeId: seller.officeId,
        capability: seller.capability,
      });
      input = {
        command,
        scope: { actorId: seller.actorId, authorization },
        observedAtReal: OBSERVED,
      };
      intake = new PostgresNarrowTransferIntake({ database, sha256Hex });
      approvals = new NarrowTransferApprovalStore({ database, sha256Hex });
      await database.query(
        'insert into world_v2.world_head (world_id) values ($1)',
        [command.worldId],
      );
      for (const actor of Object.values(fixture.officeActors)) {
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
            AT,
          ],
        );
      }
    });

    function altered(fields: Record<string, unknown>): CanonicalCommand {
      const command = Object.fromEntries(
        Object.entries(input.command).filter(
          ([key]) =>
            !['fingerprint', 'payloadHash', 'canonicalPayload'].includes(key),
        ),
      );
      return parseCanonicalCommand(
        {
          ...command,
          payload: JSON.parse(input.command.canonicalPayload) as unknown,
          simTime: input.command.simTime.toCanonicalValue(),
          ...fields,
        },
        sha256Hex,
      );
    }

    async function approve(includeFinance = true): Promise<void> {
      const seller = fixture.officeActors.sellerTrade;
      await approvals.openSellerOffer({
        command: input.command,
        signer: {
          actorId: seller.actorId,
          authSubject: seller.principal.authSubject,
          signedAtReal: '2026-09-27T00:00:01.000Z',
        },
      });
      for (const key of includeFinance
        ? (['buyerTrade', 'buyerFinance'] as const)
        : (['buyerTrade'] as const)) {
        const actor = fixture.officeActors[key];
        await approvals.signBuyerOffice({
          command: input.command,
          office: key === 'buyerTrade' ? 'TRADE' : 'FINANCE',
          signer: {
            actorId: actor.actorId,
            authSubject: actor.principal.authSubject,
            signedAtReal: '2026-09-27T00:00:02.000Z',
          },
        });
      }
    }

    async function counts() {
      const result = await database.query(
        `select world_version::text as version,
          (select count(*)::text from world_v2.command_submission where world_id = $1) as commands,
          (select count(*)::text from world_v2.command_queue where world_id = $1) as queues,
          (select count(*)::text from world_v2.command_receipt where world_id = $1) as receipts,
          (select count(*)::text from world_v2.authoritative_event where world_id = $1) as events,
          (select count(*)::text from world_v2.inventory_posting where world_id = $1) as inventory,
          (select count(*)::text from world_v2.financial_posting_batch where world_id = $1) as financial,
          (select count(*)::text from world_v2.notification_outbox where world_id = $1) as outbox
         from world_v2.world_head where world_id = $1`,
        [input.command.worldId],
      );
      return result.rows[0];
    }

    it('persists pending intent before approvals with no execution obligation or final receipt', async () => {
      expect(await intake.read(input)).toEqual({ status: 'NOT_FOUND' });
      expect(await intake.enqueueApproved(input)).toEqual({
        status: 'NOT_FOUND',
      });
      const result = await intake.submitPending(input);
      expect(result.status).toBe('PENDING_APPROVAL_OR_ENQUEUE');
      expect(result).not.toHaveProperty('receipt');
      expect(await counts()).toEqual({
        version: '0',
        commands: '1',
        queues: '0',
        receipts: '0',
        events: '0',
        inventory: '0',
        financial: '0',
        outbox: '0',
      });
      await approve(); // existing 0015 store sees the real durable intent
      expect((await intake.read(input)).status).toBe(
        'PENDING_APPROVAL_OR_ENQUEUE',
      );
    });

    it('requires all three current signatures then enqueues exactly once', async () => {
      await intake.submitPending(input);
      await expect(intake.enqueueApproved(input)).rejects.toMatchObject({
        code: 'AUTHORIZATION_DENIED',
      });
      await approve(false);
      await expect(intake.enqueueApproved(input)).rejects.toMatchObject({
        code: 'AUTHORIZATION_DENIED',
      });
      expect((await counts())?.queues).toBe('0');
      await approve();
      expect((await intake.enqueueApproved(input)).status).toBe('QUEUED');
      expect((await intake.enqueueApproved(input)).status).toBe('QUEUED');
      expect(await counts()).toEqual({
        version: '0',
        commands: '1',
        queues: '1',
        receipts: '0',
        events: '0',
        inventory: '0',
        financial: '0',
        outbox: '0',
      });
    });

    it.each([
      [
        'different payload',
        () => ({
          payload: {
            ...(JSON.parse(input.command.canonicalPayload) as object),
            quantity: { amount: '1', unit: 'tonne' },
          },
        }),
      ],
      ['same key different ID', () => ({ commandId: 'OTHER_COMMAND' })],
      ['same ID different key', () => ({ idempotencyKey: 'OTHER_KEY' })],
      ['different version', () => ({ expectedWorldVersion: '1' })],
    ] as const)('rejects identity conflict: %s', async (_label, fields) => {
      await intake.submitPending(input);
      await expect(
        intake.submitPending({ ...input, command: altered(fields()) }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      expect((await counts())?.commands).toBe('1');
    });

    it('rejects server actor mismatch and deserialized Office context', async () => {
      await expect(
        intake.submitPending({
          ...input,
          command: altered({ actorId: 'OTHER_ACTOR' }),
        }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
      await expect(
        intake.submitPending({
          ...input,
          scope: {
            ...input.scope,
            authorization: { ...input.scope.authorization },
          },
        }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
      expect((await counts())?.commands).toBe('0');
    });

    it.each([
      'active = false',
      "authorization_version = 'OTHER_REVISION'",
      "team_id = 'OTHER_TEAM'",
      "office_id = 'FINANCE'",
      "country_id = 'OTHER_COUNTRY'",
      "capability = 'FINANCE_TREASURY'",
      "auth_subject = '550e8400-e29b-41d4-a716-446655440399'::uuid",
    ])(
      'fails closed on current authorization change: %s',
      async (assignment) => {
        await intake.submitPending(input);
        await approve();
        // assignment is a fixed test vector above, never user-controlled SQL.
        await database.query(
          `update world_v2.current_commit_authorization set ${assignment}
        where world_id = $1 and auth_subject = $2::uuid`,
          [input.command.worldId, input.command.authSubject],
        );
        await expect(intake.enqueueApproved(input)).rejects.toMatchObject({
          code: 'AUTHORIZATION_DENIED',
        });
        await expect(intake.read(input)).rejects.toMatchObject({
          code: 'AUTHORIZATION_DENIED',
        });
        expect((await counts())?.queues).toBe('0');
      },
    );

    it('rejects stale Buyer Finance revision after signature collection', async () => {
      await intake.submitPending(input);
      await approve();
      await database.query(
        `update world_v2.current_commit_authorization set authorization_version = 'STALE_FINANCE'
        where world_id = $1 and office_id = 'FINANCE'`,
        [input.command.worldId],
      );
      await expect(intake.enqueueApproved(input)).rejects.toMatchObject({
        code: 'AUTHORIZATION_DENIED',
      });
      expect((await counts())?.queues).toBe('0');
    });

    it('preserves original audit acknowledgement on exact retry but fences first enqueue at changed version', async () => {
      const accepted = await intake.submitPending(input);
      await approve();
      await database.query(
        'update world_v2.world_head set world_version = 1 where world_id = $1',
        [input.command.worldId],
      );
      const retry = {
        ...input,
        command: altered({
          correlationId: 'RETRY_CORRELATION',
          submittedAtReal: '2026-09-27T00:00:01.000Z',
        }),
      };
      expect(await intake.submitPending(retry)).toEqual(accepted);
      await expect(intake.enqueueApproved(retry)).rejects.toMatchObject({
        code: 'VERSION_MISMATCH',
      });
      expect((await counts())?.queues).toBe('0');
    });

    it('rejects stale first submission, expired offer, future time and absent idempotency key', async () => {
      await expect(
        intake.submitPending({
          ...input,
          command: altered({ expectedWorldVersion: '1' }),
        }),
      ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
      await expect(
        intake.submitPending({ ...input, observedAtReal: EXPIRES }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
      await expect(
        intake.submitPending({
          ...input,
          observedAtReal: '2026-09-26T23:59:59.000Z',
        }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
      await expect(
        intake.submitPending({
          ...input,
          command: altered({ idempotencyKey: null }),
        }),
      ).rejects.toMatchObject({ code: 'COMMAND_SCHEMA_INVALID' });
      expect((await counts())?.commands).toBe('0');
    });

    it('serializes two exact acceptance/enqueue calls without duplicate obligations', async () => {
      const second = new PostgresNarrowTransferIntake({ database, sha256Hex });
      const accepted = await Promise.all([
        intake.submitPending(input),
        second.submitPending(input),
      ]);
      expect(accepted[0]).toEqual(accepted[1]);
      await approve();
      const queued = await Promise.all([
        intake.enqueueApproved(input),
        second.enqueueApproved(input),
      ]);
      expect(queued.map((value) => value.status)).toEqual(['QUEUED', 'QUEUED']);
      expect((await counts())?.queues).toBe('1');
    });

    it('serializes two IDs racing for one key with one conflict', async () => {
      const results = await Promise.allSettled([
        intake.submitPending(input),
        intake.submitPending({
          ...input,
          command: altered({ commandId: 'COMPETING_COMMAND' }),
        }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: 'IDEMPOTENCY_CONFLICT' } });
      expect((await counts())?.commands).toBe('1');
    });

    it.each(['SUBMIT', 'ENQUEUE'] as const)(
      'rolls back %s before commit and never fabricates a receipt',
      async (stage) => {
        if (stage === 'ENQUEUE') {
          await intake.submitPending(input);
          await approve();
        }
        let failed = false;
        const broken: SqlDatabase = {
          query: (sql, params) => database.query(sql, params),
          transaction: (operation) =>
            database.transaction(async (transaction) => {
              const result = await operation(transaction);
              if (!failed) {
                failed = true;
                throw new Error('INJECT_BEFORE_COMMIT');
              }
              return result;
            }),
        };
        const adapter = new PostgresNarrowTransferIntake({
          database: broken,
          sha256Hex,
        });
        const result = await (stage === 'SUBMIT'
          ? adapter.submitPending(input)
          : adapter.enqueueApproved(input));
        expect(result.status).toBe('UNKNOWN');
        expect(result).not.toHaveProperty('receipt');
        expect(await counts()).toMatchObject({
          commands: stage === 'SUBMIT' ? '0' : '1',
          queues: '0',
          receipts: '0',
          events: '0',
        });
      },
    );

    it.each(['SUBMIT', 'ENQUEUE'] as const)(
      'recovers %s after a lost commit acknowledgement through a fresh read',
      async (stage) => {
        if (stage === 'ENQUEUE') {
          await intake.submitPending(input);
          await approve();
        }
        let calls = 0;
        const broken: SqlDatabase = {
          query: (sql, params) => database.query(sql, params),
          async transaction(operation) {
            const result = await database.transaction(operation);
            calls += 1;
            if (calls === 1) throw new Error('INJECT_COMMIT_ACK_LOST');
            return result;
          },
        };
        const adapter = new PostgresNarrowTransferIntake({
          database: broken,
          sha256Hex,
        });
        const result = await (stage === 'SUBMIT'
          ? adapter.submitPending(input)
          : adapter.enqueueApproved(input));
        expect(calls).toBe(2);
        expect(result.status).toBe(
          stage === 'SUBMIT' ? 'PENDING_APPROVAL_OR_ENQUEUE' : 'QUEUED',
        );
        expect(await intake.submitPending(input)).toEqual(result);
        expect((await counts())?.commands).toBe('1');
      },
    );

    it('returns UNKNOWN if commit acknowledgement and recovery read both fail, then safely retries', async () => {
      let calls = 0;
      const unavailable: SqlDatabase = {
        query: (sql, params) => database.query(sql, params),
        async transaction(operation) {
          calls += 1;
          if (calls === 1) await database.transaction(operation);
          throw new Error('DATABASE_UNAVAILABLE');
        },
      };
      const result = await new PostgresNarrowTransferIntake({
        database: unavailable,
        sha256Hex,
      }).submitPending(input);
      expect(result).toMatchObject({
        status: 'UNKNOWN',
        retryable: true,
        commandFingerprint: input.command.fingerprint,
      });
      expect((await intake.submitPending(input)).status).toBe(
        'PENDING_APPROVAL_OR_ENQUEUE',
      );
      expect((await counts())?.commands).toBe('1');
    });

    it('reads EXECUTING and the immutable final receipt written by the existing Worker repository', async () => {
      await intake.submitPending(input);
      await approve();
      await intake.enqueueApproved(input);
      await database.query(
        `select * from world_v2.acquire_world_writer_lease($1, 'WORKER_F_INTAKE', $2::timestamptz, 600000::bigint)`,
        [input.command.worldId, AT],
      );
      await database.query(
        `update world_v2.command_queue set queue_state = 'CLAIMED', claimed_by = 'WORKER_F_INTAKE',
        claimed_at_real = $2::timestamptz, claim_fencing_token = 1, attempt_count = 1 where world_id = $1`,
        [input.command.worldId, OBSERVED],
      );
      expect((await intake.read(input)).status).toBe('EXECUTING');
      const worker = createAuthoritativeWorkerExecution({
        database,
        workerId: 'WORKER_F_INTAKE',
        sha256Hex,
        candidateFactory: {
          prepare: async () => {
            throw new Error('NO_ECONOMIC_CANDIDATE_IN_THIS_TEST');
          },
        },
      });
      const receipt = await worker.repository.recordZeroEffectReceipt(
        createFinalCommandReceipt({
          command: input.command,
          outcome: 'REJECTED',
          reasonCode: 'TEST_REJECTION',
          transition: null,
          simTime: input.command.simTime,
          recordedAtReal: OBSERVED,
        }),
      );
      await database.query(
        'update world_v2.world_head set world_version = 1 where world_id = $1',
        [input.command.worldId],
      );
      const retry = { ...input, observedAtReal: EXPIRES };
      expect(await intake.read(retry)).toMatchObject({
        status: 'FINAL',
        receipt,
      });
      expect(await intake.submitPending(retry)).toMatchObject({
        status: 'FINAL',
        receipt,
      });
      expect(await intake.enqueueApproved(retry)).toMatchObject({
        status: 'FINAL',
        receipt,
      });
      expect(await counts()).toEqual({
        version: '1',
        commands: '1',
        queues: '1',
        receipts: '1',
        events: '0',
        inventory: '0',
        financial: '0',
        outbox: '0',
      });
    });

    it.skipIf(!native)(
      'rechecks version after waiting for an in-flight World head owner (native PG only)',
      async () => {
        let locked!: () => void;
        let release!: () => void;
        const acquired = new Promise<void>((resolve) => {
          locked = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const writer = database.transaction(async (transaction) => {
          await transaction.query(
            'update world_v2.world_head set world_version = 1 where world_id = $1',
            [input.command.worldId],
          );
          locked();
          await gate;
        });
        await acquired;
        const pending = intake.submitPending(input);
        release();
        await writer;
        await expect(pending).rejects.toMatchObject({
          code: 'VERSION_MISMATCH',
        });
        expect((await counts())?.commands).toBe('0');
      },
    );

    it
      .skipIf(!native)
      .each(['read', 'submitPending', 'enqueueApproved'] as const)(
      'keeps %s and actual same-Command Worker commit deadlock-free (native PG only)',
      async (method) => {
        await intake.submitPending(input);
        await approve();
        await intake.enqueueApproved(input);
        await assertIntakeWorkerLockRace({
          database,
          intakeInput: input,
          sha256Hex,
          method,
          source: fixture.inventoryAccounts.sellerAvailable,
        });
      },
    );

    it.skipIf(!native).each([false, true])(
      'rechecks an initially missing registration without reversing locks (conflict=%s, native PG only)',
      async (conflicting) => {
        const missing = Promise.withResolvers<void>();
        const resume = Promise.withResolvers<void>();
        const lookupStatements: string[] = [];
        const lateDatabase: SqlDatabase = {
          query: (sql, parameters) => database.query(sql, parameters),
          transaction: (operation) =>
            database.transaction((transaction) =>
              operation({
                async query<Row extends object>(
                  sql: string,
                  parameters?: readonly unknown[],
                ) {
                  const result = await transaction.query<Row>(sql, parameters);
                  if (sql.includes('from world_v2.command_submission')) {
                    lookupStatements.push(sql);
                    if (lookupStatements.length === 1) {
                      expect(result.rows).toHaveLength(0);
                      missing.resolve();
                      await withinIntakeRaceDeadline(resume.promise);
                    }
                  }
                  return result;
                },
              }),
            ),
        };
        const late = new PostgresNarrowTransferIntake({
          database: lateDatabase,
          sha256Hex,
        })
          .submitPending(input)
          .then(
            (state) => ({ state, error: null }),
            (error: unknown) => ({ state: null, error }),
          );
        try {
          await withinIntakeRaceDeadline(missing.promise);
          const registered = await intake.submitPending({
            ...input,
            command: conflicting
              ? altered({ commandId: 'OTHER_REGISTRANT' })
              : input.command,
          });
          resume.resolve();
          const result = await withinIntakeRaceDeadline(late);
          if (conflicting) {
            expect(result.error).toMatchObject({
              code: 'IDEMPOTENCY_CONFLICT',
            });
          } else {
            expect(result.error).toBeNull();
            expect(result.state).toEqual(registered);
          }
          expect(lookupStatements).toHaveLength(2);
          expect(lookupStatements[0]).toMatch(/for update/iu);
          expect(lookupStatements[1]).not.toMatch(/for update/iu);
          expect(await counts()).toMatchObject({
            commands: '1',
            queues: '0',
            events: '0',
            receipts: '0',
          });
        } finally {
          resume.resolve();
          await late;
        }
      },
    );
  });
}
