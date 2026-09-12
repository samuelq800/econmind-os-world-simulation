import { describe, expect, it } from 'vitest';

import type {
  CanonicalCommand,
  CommitAuthorizationProof,
  Sha256Hex,
} from '@econmind/core';
import {
  createAuthoritativeWorkerExecution,
  createTransactionCutoffAuthorizationGuard,
} from '../../apps/world-worker/src/authoritative-execution.js';
import type { AtomicTransitionCandidateFactory } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

function transactionFor(input: {
  readonly authorizationVersion: string | null;
  readonly observedTransactions: SqlExecutor[];
}): SqlExecutor {
  const transaction: SqlExecutor = {
    async query<Row extends object = Record<string, unknown>>() {
      input.observedTransactions.push(transaction);
      if (input.authorizationVersion === null) {
        return Object.freeze({
          rowCount: 0,
          rows: Object.freeze([]) as readonly Row[],
        });
      }
      return Object.freeze({
        rowCount: 1,
        rows: Object.freeze([
          Object.freeze({
            auth_subject: proof.authSubject,
            world_id: proof.worldId,
            country_id: proof.countryId,
            office_id: proof.officeId,
            capability: proof.capability,
            team_id: proof.teamId,
            authorization_version: input.authorizationVersion,
          }),
        ]) as unknown as readonly Row[],
      });
    },
  };
  return Object.freeze(transaction);
}

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

describe('V09 authoritative Worker composition', () => {
  it('uses only its SQL authority reader with the repository transaction and fails when revision changes', async () => {
    const observedTransactions: SqlExecutor[] = [];
    let authorizationVersion: string | null = 'AUTH_CUTOFF_1';
    const guard = createTransactionCutoffAuthorizationGuard();
    const input = {
      command,
      authorityKind: 'DISCRETIONARY_USER' as const,
      proof,
      expected: 'AUTHORIZED' as const,
    };

    const initialTransaction = transactionFor({
      authorizationVersion,
      observedTransactions,
    });
    await expect(guard.assertCurrent(initialTransaction, input)).resolves.toBe(
      undefined,
    );
    expect(observedTransactions).toEqual([initialTransaction]);

    authorizationVersion = 'AUTH_CUTOFF_2';
    await expect(
      guard.assertCurrent(
        transactionFor({ authorizationVersion, observedTransactions }),
        input,
      ),
    ).rejects.toMatchObject({
      message:
        'Office assignment, capability, team or authorization revision changed before commit',
    });

    authorizationVersion = null;
    await expect(
      guard.assertCurrent(
        transactionFor({ authorizationVersion, observedTransactions }),
        input,
      ),
    ).rejects.toMatchObject({
      message:
        'Office assignment, capability, team or authorization revision changed before commit',
    });
  });

  it('has no caller-selectable authorization guard at the Worker composition root', () => {
    const transaction: SqlExecutor = Object.freeze({
      async query() {
        return Object.freeze({ rowCount: 0, rows: Object.freeze([]) });
      },
    });
    const database: SqlDatabase = {
      query: transaction.query,
      async transaction(operation) {
        return operation(transaction);
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
      candidateFactory: candidates,
    });

    expect(execution.repository).toBeDefined();
    expect(execution.executeQueuedCommand).toEqual(expect.any(Function));
  });
});
