import { describe, expect, it } from 'vitest';

import type {
  CanonicalCommand,
  CommitAuthorizationProof,
  Sha256Hex,
} from '@econmind/core';
import {
  createAuthoritativeWorkerExecution,
  createTransactionCutoffAuthorizationGuard,
  type CurrentCommitAuthorization,
  type ServerHeldCommitAuthorizationSource,
} from '../../apps/world-worker/src/authoritative-execution.js';
import type { AtomicTransitionCandidateFactory } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const transaction: SqlExecutor = Object.freeze({
  async query() {
    return Object.freeze({ rowCount: 0, rows: Object.freeze([]) });
  },
});

const command = Object.freeze({
  commandId: 'COMMAND_CUTOFF_TEST',
  worldId: 'WORLD_CUTOFF_TEST',
}) as unknown as CanonicalCommand;
const proof = Object.freeze({
  authSubject: '550e8400-e29b-41d4-a716-446655440000',
  worldId: 'WORLD_CUTOFF_TEST',
  countryId: 'COUNTRY_CUTOFF_TEST',
  officeId: 'FINANCE',
  capability: 'FINANCE_TREASURY',
  teamId: 'TEAM_CUTOFF_TEST',
  authorizationVersion: 'AUTH_CUTOFF_1',
}) as unknown as CommitAuthorizationProof;
const sha256Hex: Sha256Hex = () =>
  'a'.repeat(64) as Sha256Hex extends (input: string) => infer Output
    ? Output
    : never;

function current(
  authorizationVersion = 'AUTH_CUTOFF_1',
): Readonly<CurrentCommitAuthorization> {
  return Object.freeze({
    authSubject: proof.authSubject,
    worldId: proof.worldId,
    countryId: proof.countryId,
    officeId: proof.officeId,
    capability: proof.capability,
    teamId: proof.teamId,
    authorizationVersion,
  });
}

describe('V09 authoritative Worker composition', () => {
  it('rechecks the server-held source using the repository transaction and fails when revision changes', async () => {
    const observedTransactions: SqlExecutor[] = [];
    let authorizationVersion = 'AUTH_CUTOFF_1';
    let revoked = false;
    const source: ServerHeldCommitAuthorizationSource = {
      async readCurrentAuthorization(observed, input) {
        observedTransactions.push(observed);
        expect(input).toMatchObject({ command, proof });
        return revoked ? null : current(authorizationVersion);
      },
      async assertStillRevoked() {
        throw new Error('UNEXPECTED_REVOCATION_CHECK');
      },
    };
    const guard = createTransactionCutoffAuthorizationGuard(source);
    const input = {
      command,
      authorityKind: 'DISCRETIONARY_USER' as const,
      proof,
      expected: 'AUTHORIZED' as const,
    };

    await expect(guard.assertCurrent(transaction, input)).resolves.toBe(
      undefined,
    );
    expect(observedTransactions).toEqual([transaction]);

    authorizationVersion = 'AUTH_CUTOFF_2';
    await expect(guard.assertCurrent(transaction, input)).rejects.toMatchObject(
      {
        message:
          'Office assignment, capability, team or authorization revision changed before commit',
      },
    );

    authorizationVersion = 'AUTH_CUTOFF_1';
    revoked = true;
    await expect(guard.assertCurrent(transaction, input)).rejects.toMatchObject(
      {
        message:
          'Office assignment, capability, team or authorization revision changed before commit',
      },
    );
  });

  it('has no caller-selectable authorization guard at the Worker composition root', () => {
    const database: SqlDatabase = {
      query: transaction.query,
      async transaction(operation) {
        return operation(transaction);
      },
    };
    const source: ServerHeldCommitAuthorizationSource = {
      async readCurrentAuthorization() {
        return current();
      },
      async assertStillRevoked() {
        return undefined;
      },
    };
    const candidates: AtomicTransitionCandidateFactory = {
      async prepare() {
        throw new Error('NOT_REACHED');
      },
    };

    const execution = createAuthoritativeWorkerExecution({
      database,
      workerId: 'WORKER_CUTOFF_TEST',
      sha256Hex,
      authorizationSource: source,
      candidateFactory: candidates,
    });

    expect(execution.repository).toBeDefined();
    expect(execution.executeQueuedCommand).toEqual(expect.any(Function));
  });
});
