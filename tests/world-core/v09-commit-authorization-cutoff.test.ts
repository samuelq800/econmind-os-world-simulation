import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  SimTime,
  authSubject,
  authorizeOfficeCapability,
  countryId,
  officeId,
  parseCanonicalCommand,
  processQueuedCommand,
  teamId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationResolver,
  type CommandLifecyclePersistencePort,
  type CommitAuthorizationProof,
  type Sha256Hex,
  type WorldId,
} from '@econmind/core';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

const sha256Hex: Sha256Hex = (preimage) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_AUTHORIZATION_CUTOFF');
const COUNTRY = countryId('COUNTRY_AUTHORIZATION_CUTOFF');
const SUBJECT = authSubject('550e8400-e29b-41d4-a716-446655440000');
const FINANCE = officeId('FINANCE');
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
] as const;
const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<V09AtomicTestDatabase> {
  const database = createPGliteV09AtomicTestDatabase();
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
    [WORLD],
  );
  return database;
}

function command() {
  return parseCanonicalCommand(
    {
      actorId: 'ACTOR_AUTHORIZATION_CUTOFF',
      authSubject: SUBJECT,
      commandId: 'COMMAND_AUTHORIZATION_CUTOFF',
      commandType: 'TEST_AUTHORIZATION_CUTOFF',
      correlationId: 'CORRELATION_AUTHORIZATION_CUTOFF',
      countryId: COUNTRY,
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEMPOTENCY_AUTHORIZATION_CUTOFF',
      officeId: FINANCE,
      payload: { operation: 'AUTHORIZATION_CUTOFF' },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: '10000',
      submittedAtReal: '2026-09-12T00:00:00.000Z',
      worldId: WORLD,
    },
    sha256Hex,
  );
}

async function issueProof(): Promise<CommitAuthorizationProof> {
  const principal = Object.freeze({
    authSubject: SUBJECT,
    facts: Object.freeze({
      display_name: 'V09 package-Core cutoff proof test',
      school_id: 'TEST_ONLY',
      user_id: SUBJECT,
    }),
    token: Object.freeze({
      audience: 'world-v2-test',
      expiresAt: '2099-01-01T00:00:00.000Z',
      issuedAt: '2026-09-12T00:00:00.000Z',
      issuer: 'https://test.invalid',
      subject: SUBJECT,
    }),
  }) satisfies AuthenticatedPrincipal;
  const resolver: AuthorizationResolver = Object.freeze({
    async resolveCurrentIdentity() {
      return SUBJECT;
    },
    async resolveCurrentMembership(
      _principal: AuthenticatedPrincipal,
      requestedWorldId: WorldId,
    ) {
      if (requestedWorldId !== WORLD) return null;
      return Object.freeze({
        active: true,
        authorizationVersion: 'AUTH_REVISION_1',
        authSubject: SUBJECT,
        countryId: COUNTRY,
        isWorldAdmin: false,
        negotiationPartyIds: Object.freeze([]),
        officeAssignments: Object.freeze([FINANCE]),
        suspended: false,
        teamId: teamId('TEAM_AUTHORIZATION_CUTOFF'),
        worldId: WORLD,
      });
    },
  });
  const capturedSignal = new Error('COMMIT_PROOF_CAPTURED');
  let proof: CommitAuthorizationProof | null = null;
  const persistence: CommandLifecyclePersistencePort = {
    async readFinalReceipt() {
      return null;
    },
    async recordZeroEffectReceipt() {
      throw new Error('UNEXPECTED_AUTHORIZATION_REVOCATION');
    },
    async commitAuthorizedCommand(input) {
      proof = input.commitAuthorization;
      throw capturedSignal;
    },
  };
  try {
    await processQueuedCommand({
      command: command(),
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: SimTime.fromTicks('10000'),
      recordedAtReal: '2026-09-12T00:00:01.000Z',
      requiredCapability: 'FINANCE_TREASURY',
      intakeAuthorization: await authorizeOfficeCapability({
        capability: 'FINANCE_TREASURY',
        principal,
        requestedCountryId: COUNTRY,
        requestedOfficeId: FINANCE,
        resolver,
        worldId: WORLD,
      }),
      persistence,
    });
  } catch (error) {
    if (error !== capturedSignal) throw error;
  }
  if (proof === null) throw new Error('COMMIT_PROOF_NOT_CAPTURED');
  return proof;
}

describe('V09 real Core-issued authorization at transaction cutoff', () => {
  it('rejects a genuine Core-issued proof when the SQL-held revision changes or authority is revoked before commit', async () => {
    const proof = await issueProof();
    const value = await database();
    await value.query(
      `insert into world_v2.current_commit_authorization
         (world_id, auth_subject, country_id, office_id, capability, team_id,
          authorization_version, active, refreshed_at_real)
       values ($1, $2::uuid, $3, $4, $5, $6, $7, true, $8)`,
      [
        proof.worldId,
        proof.authSubject,
        proof.countryId,
        proof.officeId,
        proof.capability,
        proof.teamId,
        proof.authorizationVersion,
        '2026-09-12T00:00:00.000Z',
      ],
    );
    const guard = createTransactionCutoffAuthorizationGuard();
    const input = {
      command: command(),
      authorityKind: 'DISCRETIONARY_USER' as const,
      proof,
      expected: 'AUTHORIZED' as const,
    };

    await expect(
      value.transaction((transaction) =>
        guard.assertCurrent(transaction as SqlExecutor, input),
      ),
    ).resolves.toBe(undefined);

    await value.query(
      `update world_v2.current_commit_authorization
          set authorization_version = 'AUTH_REVISION_2'
        where world_id = $1 and auth_subject = $2::uuid`,
      [proof.worldId, proof.authSubject],
    );
    await expect(
      value.transaction((transaction) =>
        guard.assertCurrent(transaction as SqlExecutor, input),
      ),
    ).rejects.toMatchObject({
      cause: { code: 'AUTHORIZATION_DENIED' },
    });

    await value.query(
      `update world_v2.current_commit_authorization
          set active = false
        where world_id = $1 and auth_subject = $2::uuid`,
      [proof.worldId, proof.authSubject],
    );
    await expect(
      value.transaction((transaction) =>
        guard.assertCurrent(transaction as SqlExecutor, input),
      ),
    ).rejects.toMatchObject({
      cause: { code: 'AUTHORIZATION_DENIED' },
    });
  });
});
