import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireWorldWriterLease,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createWorldWriterCommitAssertion,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import {
  createAuthenticatedWorldReadQueryHandler,
  createWorldReadRequest,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';
import {
  AuthoritativeActivityReadProjectionPublisher,
  CurrentAuthorizationEntitlementPublisher,
} from '../../apps/world-worker/src/index.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

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
] as const;
const WORLD = worldId('WORLD_V10_COUNTRY_FLOW_TEST');
const WORKER = workerId('WORKER_V10_COUNTRY_FLOW_TEST');
const AT = '2026-09-14T00:00:00.000Z';
const EXPIRY = '2026-09-14T00:05:00.000Z';
const SELLER_SUBJECT = '550e8400-e29b-41d4-a716-446655440021';
const FORGED_SUBJECT = '550e8400-e29b-41d4-a716-446655440022';
const sha256Hex = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const policy = {
  jwt: {
    expectedIssuer: 'https://issuer.example.test',
    expectedAudience: 'world-api',
    nowEpochSeconds: 1_800_000_000,
  },
  timeoutMs: 50,
} as const;

const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<V09AtomicTestDatabase> {
  const result = createPGliteV09AtomicTestDatabase();
  databases.push(result);
  for (const migration of migrations) {
    await result.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await result.query('insert into world_v2.world_head (world_id) values ($1)', [
    WORLD,
  ]);
  return result;
}

function assertion(expectedWorldVersion = '1') {
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, AT, EXPIRY),
  );
  return createWorldWriterCommitAssertion(lease.lease, expectedWorldVersion);
}

function verifiedClaims(subject: string) {
  return {
    sub: subject,
    iss: policy.jwt.expectedIssuer,
    aud: policy.jwt.expectedAudience,
    iat: 1_799_999_000,
    exp: 1_800_001_000,
  };
}

function activityEvidence(before = '0', suffix = '') {
  const after = (BigInt(before) + 1n).toString();
  const command = parseCanonicalCommand(
    {
      worldId: WORLD,
      commandId: `COMMAND_COUNTRY_ACTIVITY${suffix}`,
      commandType: 'V10_ACTIVITY_TEST',
      schemaVersion: 'command-v1',
      payload: {},
      authSubject: SELLER_SUBJECT,
      actorId: 'ACTOR_SELLER',
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      expectedWorldVersion: before,
      simTime: '0',
      idempotencyKey: null,
      correlationId: `CORRELATION_COUNTRY_ACTIVITY${suffix}`,
      submittedAtReal: AT,
    },
    sha256Hex,
  );
  const event = parseAuthoritativeEvent(
    {
      worldId: WORLD,
      eventId: `EVENT_COUNTRY_ACTIVITY${suffix}`,
      eventType: 'V10_ACTIVITY_RECORDED',
      schemaVersion: 'event-v1',
      payload: {},
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      sequence: after,
      worldVersion: after,
      simTime: '0',
      recordedAtReal: AT,
      correctsEventId: null,
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: before,
    worldVersionAfter: after,
  });
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: AT,
  });
  return { command, event, transition, receipt };
}

async function insertSubmission(
  database: V09AtomicTestDatabase,
  command: ReturnType<typeof activityEvidence>['command'],
) {
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11, $12,
             $13::bigint, $14::bigint, $15, $16)`,
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
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
}

async function seedAuthoritativeCountryActivity(
  database: V09AtomicTestDatabase,
) {
  // TEST_ONLY activity family, not an admitted Trade/economic operation. Keep
  // the original identities and one-event intent; use the real atomic writer.
  const { command, event, transition, receipt } = activityEvidence();
  await database.query(
    `insert into world_v2.current_commit_authorization
       (world_id, auth_subject, country_id, office_id, capability, team_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2::uuid, 'COUNTRY_SELLER', 'TRADE', 'TRADE_PROPOSE',
             'TEAM_SELLER', 'AUTH_SELLER_1', true, $3)`,
    [WORLD, SELLER_SUBJECT, AT],
  );
  await insertSubmission(database, command);
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, 300000)`,
    [WORLD, WORKER, AT],
  );
  await database.query(
    `insert into world_v2.command_queue
       (world_id, command_id, authority_kind, priority_rank,
        available_at_sim_time, attempt_count)
     values ($1, $2, 'VERSIONED_AUTOMATIC', 0, 0, 0)`,
    [WORLD, command.commandId],
  );
  await database.query(
    `update world_v2.command_queue
        set queue_state = 'CLAIMED', attempt_count = 1,
            claimed_by = $3, claimed_at_real = $4, claim_fencing_token = 1
      where world_id = $1 and command_id = $2`,
    [WORLD, command.commandId, WORKER, AT],
  );
  const candidate = prepareAtomicTransitionCandidate({
    command,
    commitAuthorization: null,
    draft: {
      transition,
      receipt,
      inventoryPostings: [],
      financialPostingBatches: [],
      outboxMessages: [],
      currentMaterializations: [],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: assertion('0'),
      observedAtReal: AT,
    },
    sha256Hex,
  });
  const repository = new AtomicTransitionRepository({
    database,
    workerId: WORKER,
    authorizationGuard: createTransactionCutoffAuthorizationGuard(),
    sha256Hex,
  });
  const result = await repository.commit(candidate);
  if (result.source !== 'NEW_COMMIT')
    throw new Error('TEST_ONLY Country activity was not atomically committed');
  return { command, event, receipt, candidate, repository };
}

function executor(
  database: V09AtomicTestDatabase,
): ParameterizedPgReadExecutor {
  return {
    query: async ({ text, values }) => database.query(text, values),
  };
}

describe('V10.1 Country/Office source-to-query flow', () => {
  it('rejects an entitled legacy raw cache on the server and serves only a replacement from the sole classified publisher', async () => {
    const db = await database();
    await seedAuthoritativeCountryActivity(db);
    const publisher = new AuthoritativeActivityReadProjectionPublisher({
      database: db,
      workerId: WORKER,
    });
    await publisher.replace({ assertion: assertion(), observedAtReal: AT });
    await new CurrentAuthorizationEntitlementPublisher({
      database: db,
      workerId: WORKER,
    }).replace({ assertion: assertion(), observedAtReal: AT });
    await db.query(
      `update world_v2.read_projection set payload=$2::jsonb
      where world_id=$1 and classification='COUNTRY' and scope_key='COUNTRY_SELLER'`,
      [
        WORLD,
        JSON.stringify({
          schemaVersion: 'world-activity-projection-v1',
          countryId: 'COUNTRY_SELLER',
          activity: {
            authoritativeEventCount: '1',
            lastAuthoritativeEventSequence: '1',
            lastAuthoritativeEventWorldVersion: '1',
          },
          ledger: {
            financialPositions: [
              {
                accountId: 'SECRET_TREASURY_TEST',
                currency: 'GCU',
                accountClass: 'CASH',
                netDebitBalance: '999',
              },
            ],
            inventoryPositions: [],
          },
        }),
      ],
    );
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(db),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(SELLER_SUBJECT);
        },
      },
    });
    const request = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174129',
      worldId: WORLD,
      classification: 'COUNTRY',
      scopeKey: 'COUNTRY_SELLER',
    });
    const response = await handler.handle({
      authorization: 'Bearer verified-test',
      request,
      minimumWatermark: { worldVersion: '1', eventSequence: '1' },
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR' },
    });
    expect(JSON.stringify(response)).not.toMatch(
      /SECRET_TREASURY_TEST|999|financialPositions/,
    );
    await publisher.replace({ assertion: assertion(), observedAtReal: AT });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-test',
        request,
        minimumWatermark: { worldVersion: '1', eventSequence: '1' },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        payload: {
          ledger: {
            financialPositions: [],
            inventoryPositions: [],
            visibility: {
              schemaVersion: 'economic-read-visibility-v1',
              financialDetail: 'NOT_AUTHORIZED',
            },
          },
        },
      },
    });
  });
  it('serves the source-bound Country and Office-private activity projections only to the current entitled subject', async () => {
    const testDatabase = await database();
    await seedAuthoritativeCountryActivity(testDatabase);
    const commitAssertion = assertion();
    await new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });
    await new CurrentAuthorizationEntitlementPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });

    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(testDatabase),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(SELLER_SUBJECT);
        },
      },
    });
    const countryRequest = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174121',
      worldId: WORLD,
      classification: 'COUNTRY',
      scopeKey: 'COUNTRY_SELLER',
    });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-by-injected-test-verifier',
        request: countryRequest,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        classification: 'COUNTRY',
        scopeKey: 'COUNTRY_SELLER',
        watermark: { worldVersion: '1', eventSequence: '1' },
        payload: {
          activity: {
            authoritativeEventCount: '1',
            lastAuthoritativeEventSequence: '1',
            lastAuthoritativeEventWorldVersion: '1',
          },
          countryId: 'COUNTRY_SELLER',
          schemaVersion: 'world-activity-projection-v1',
        },
      },
    });
    const officeRequest = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174122',
      worldId: WORLD,
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_434F554E5452595F53454C4C4552_5452414445',
    });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-by-injected-test-verifier',
        request: officeRequest,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        classification: 'OFFICE_PRIVATE',
        watermark: { worldVersion: '1', eventSequence: '1' },
        payload: { countryId: 'COUNTRY_SELLER', officeId: 'TRADE' },
      },
    });
  }, 30_000);

  it('does not disclose the materialized Country projection to a valid but unentitled subject', async () => {
    const testDatabase = await database();
    await seedAuthoritativeCountryActivity(testDatabase);
    const commitAssertion = assertion();
    await new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });
    await new CurrentAuthorizationEntitlementPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(testDatabase),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(FORGED_SUBJECT);
        },
      },
    });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-but-unentitled-subject',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174123',
          worldId: WORLD,
          classification: 'COUNTRY',
          scopeKey: 'COUNTRY_SELLER',
        }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'World projection is unavailable',
        retryable: false,
      },
    });
  }, 30_000);
});

describe('V10.1 committed fixture evidence controls (TEST_ONLY PGlite)', () => {
  it('persists one canonical event and final receipt atomically and replays a retry without increasing the activity count', async () => {
    const db = await database();
    const seeded = await seedAuthoritativeCountryActivity(db);
    await expect(
      seeded.repository.readFinalReceipt(seeded.command),
    ).resolves.toEqual(seeded.receipt);
    await expect(
      seeded.repository.commit(seeded.candidate),
    ).resolves.toMatchObject({ source: 'EXISTING_COMMIT' });
    const footprint = await db.query(
      `select world_version::text as world_version, event_sequence::text as event_sequence,
              (select count(*)::int from world_v2.authoritative_event where world_id=$1) as event_count,
              (select count(*)::int from world_v2.command_receipt where world_id=$1) as receipt_count,
              (select queue_state from world_v2.command_queue where world_id=$1) as queue_state,
              (select count(*)::int from world_v2.inventory_posting where world_id=$1) as inventory_count,
              (select count(*)::int from world_v2.financial_posting_batch where world_id=$1) as financial_count
         from world_v2.world_head where world_id=$1`,
      [WORLD],
    );
    expect(footprint.rows).toEqual([
      {
        world_version: '1',
        event_sequence: '1',
        event_count: 1,
        receipt_count: 1,
        queue_state: 'FINALIZED',
        inventory_count: 0,
        financial_count: 0,
      },
    ]);
    const durable = await db.query(
      `select event_fingerprint, payload_sha256 from world_v2.authoritative_event
        where world_id=$1 and event_id=$2`,
      [WORLD, seeded.event.eventId],
    );
    expect(durable.rows).toEqual([
      {
        event_fingerprint: seeded.event.fingerprint,
        payload_sha256: seeded.event.payloadHash,
      },
    ]);
    const publisher = new AuthoritativeActivityReadProjectionPublisher({
      database: db,
      workerId: WORKER,
    });
    await publisher.replace({ assertion: assertion(), observedAtReal: AT });
    const country = await db.query<{
      payload: { activity: { authoritativeEventCount: string } };
    }>(
      `select payload from world_v2.read_projection
        where world_id=$1 and classification='COUNTRY' and scope_key='COUNTRY_SELLER'`,
      [WORLD],
    );
    expect(country.rows[0]?.payload.activity.authoritativeEventCount).toBe('1');
  });

  it.each([
    ['ORPHAN_EVENT', 'decision receipt must be an object'],
    ['BAD_RECEIPT_TIME', 'Committed lineage identity/head/receipt mismatch'],
    ['BAD_EVENT_HASH', 'Durable decision Event hashes differ'],
  ] as const)(
    'rejects %s before replacing previously published rows',
    async (fault, message) => {
      const db = await database();
      await seedAuthoritativeCountryActivity(db);
      const publisher = new AuthoritativeActivityReadProjectionPublisher({
        database: db,
        workerId: WORKER,
      });
      await publisher.replace({ assertion: assertion(), observedAtReal: AT });
      const readProjections = () =>
        db.query(
          `select * from world_v2.read_projection where world_id=$1 order by classification, scope_key`,
          [WORLD],
        );
      const previous = await readProjections();
      expect(previous.rows).toHaveLength(2);
      // Deliberately invalid append-only source in this disposable test DB only.
      // No production trigger/guard is disabled or weakened to inject the fault.
      const { command, event, receipt } = activityEvidence(
        '1',
        '_INVALID_TEST',
      );
      await insertSubmission(db, command);
      await db.query(
        `insert into world_v2.authoritative_event
         (world_id, event_id, event_sequence, world_version, causation_command_id,
          correlation_id, event_type, schema_version, canonical_payload,
          payload_sha256, event_fingerprint, sim_time, recorded_at_real, corrects_event_id)
       values ($1,$2,2,2,$3,$4,$5,$6,$7,$8,$9,0,$10,null)`,
        [
          WORLD,
          event.eventId,
          command.commandId,
          command.correlationId,
          event.eventType,
          event.schemaVersion,
          event.canonicalPayload,
          event.payloadHash,
          fault === 'BAD_EVENT_HASH'
            ? `sha256:${'b'.repeat(64)}`
            : event.fingerprint,
          AT,
        ],
      );
      if (fault !== 'ORPHAN_EVENT')
        await db.query(
          `insert into world_v2.command_receipt
         (world_id, command_id, idempotency_key, schema_version, command_fingerprint,
          outcome, reason_code, transition_id, world_version_before, world_version_after,
          sim_time, event_ids, recorded_at_real)
       values ($1,$2,null,$3,$4,'COMMITTED',null,$2,1,2,$5,$6::jsonb,$7)`,
          [
            WORLD,
            command.commandId,
            receipt.schemaVersion,
            command.fingerprint,
            fault === 'BAD_RECEIPT_TIME' ? '1' : '0',
            canonicalSerialize(receipt.eventIds),
            AT,
          ],
        );
      await db.query(
        `update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1`,
        [WORLD],
      );
      await expect(
        publisher.replace({ assertion: assertion('2'), observedAtReal: AT }),
      ).rejects.toMatchObject({
        name: 'V09TransactionRolledBackError',
        cause: {
          code: 'TRANSITION_EVIDENCE_INVALID',
          message: expect.stringContaining(message),
        },
      });
      expect((await readProjections()).rows).toEqual(previous.rows);
    },
  );
});
