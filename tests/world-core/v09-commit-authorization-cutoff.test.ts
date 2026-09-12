import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  SimTime,
  authSubject,
  countryId,
  officeId,
  parseCanonicalCommand,
  processQueuedCommand,
  worldId,
  type CommandLifecyclePersistencePort,
  type CommitAuthorizationProof,
  type Sha256Hex,
} from '../../packages/core/src/index.js';
import {
  createTransactionCutoffAuthorizationGuard,
  type ServerHeldCommitAuthorizationSource,
} from '../../apps/world-worker/src/authoritative-execution.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { MutableV09AuthorizationFixture } from '../support/v09-authorization-fixture.js';

const sha256Hex: Sha256Hex = (preimage) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_AUTHORIZATION_CUTOFF');
const COUNTRY = countryId('COUNTRY_AUTHORIZATION_CUTOFF');
const SUBJECT = authSubject('550e8400-e29b-41d4-a716-446655440000');
const FINANCE = officeId('FINANCE');
const transaction: SqlExecutor = Object.freeze({
  async query() {
    return Object.freeze({ rowCount: 0, rows: Object.freeze([]) });
  },
});

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

async function issueProof(
  fixture: MutableV09AuthorizationFixture,
): Promise<CommitAuthorizationProof> {
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
      intakeAuthorization: await fixture.authorize({
        capability: 'FINANCE_TREASURY',
        countryId: COUNTRY,
        officeId: FINANCE,
      }),
      persistence,
    });
  } catch (error) {
    if (error !== capturedSignal) throw error;
  }
  if (proof === null) throw new Error('COMMIT_PROOF_NOT_CAPTURED');
  return proof;
}

function sourceFor(
  fixture: MutableV09AuthorizationFixture,
  observedTransactions: SqlExecutor[],
): ServerHeldCommitAuthorizationSource {
  return {
    async readCurrentAuthorization(observed, input) {
      observedTransactions.push(observed);
      const membership = fixture.currentMembership();
      const commandScope = input.command as unknown as {
        readonly authSubject: string;
        readonly worldId: string;
        readonly countryId: string;
      };
      const proofScope = input.proof as unknown as {
        readonly officeId: string;
        readonly capability: string;
      };
      if (
        membership === null ||
        !membership.active ||
        membership.suspended ||
        String(membership.authSubject) !== commandScope.authSubject ||
        String(membership.worldId) !== commandScope.worldId ||
        String(membership.countryId) !== commandScope.countryId ||
        !membership.officeAssignments.some(
          (assignment) => String(assignment) === proofScope.officeId,
        )
      ) {
        return null;
      }
      return Object.freeze({
        authSubject: String(membership.authSubject),
        worldId: String(membership.worldId),
        countryId: String(membership.countryId),
        officeId: proofScope.officeId,
        capability: proofScope.capability,
        teamId: String(membership.teamId),
        authorizationVersion: membership.authorizationVersion,
      });
    },
    async assertStillRevoked() {
      throw new Error('UNEXPECTED_ZERO_EFFECT_AUTHORIZATION_CHECK');
    },
  };
}

describe('V09 real Core-issued authorization at transaction cutoff', () => {
  it('rejects a genuine intake proof when server-held membership revision changes or is revoked before commit', async () => {
    const fixture = new MutableV09AuthorizationFixture({
      authSubject: SUBJECT,
      countryId: COUNTRY,
      worldId: WORLD,
    });
    const proof = await issueProof(fixture);
    const observedTransactions: SqlExecutor[] = [];
    const guard = createTransactionCutoffAuthorizationGuard(
      sourceFor(fixture, observedTransactions),
    );
    const input = {
      command: command(),
      authorityKind: 'DISCRETIONARY_USER' as const,
      proof,
      expected: 'AUTHORIZED' as const,
    };

    await expect(
      guard.assertCurrent(transaction, input as never),
    ).resolves.toBe(undefined);
    expect(observedTransactions).toEqual([transaction]);

    fixture.mutate({ authorizationVersion: 'AUTH_REVISION_2' });
    await expect(
      guard.assertCurrent(transaction, input as never),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });

    fixture.mutate({ membershipPresent: false });
    await expect(
      guard.assertCurrent(transaction, input as never),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
});
