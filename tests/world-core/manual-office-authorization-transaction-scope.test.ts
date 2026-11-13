/** Authorization/connection protocol only; no SQL grant or economic commit. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  parseCanonicalCommand,
  processQueuedCommand,
  reauthorizeCommitAuthorizationProof,
  type CommitAuthorizationProof,
} from '@econmind/core';
import { authorizeManualOfficeCommand } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import { createManualOfficeAuthorizationTransactionDatabase } from '../../apps/world-worker/src/persistence/manual-office-authorization-transaction-scope.js';
import { MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY } from '../../apps/world-worker/src/persistence/manual-office-authorization-sql.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const command = parseCanonicalCommand(
  {
    schemaVersion: 'command-v1',
    worldId: 'WORLD_AUTH_SCOPE',
    countryId: 'COUNTRY_01',
    officeId: 'FINANCE',
    actorId: 'ACTOR_AUTH_SCOPE',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_AUTH_SCOPE',
    commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
    expectedWorldVersion: '0',
    idempotencyKey: 'IDEM_AUTH_SCOPE',
    correlationId: 'CORRELATION_AUTH_SCOPE',
    simTime: '2000',
    submittedAtReal: '2026-10-29T00:00:00.000Z',
    payload: { testOnlyAuthorizationProtocol: true },
  },
  sha,
);
function singleConnection() {
  let held = false,
    active = true,
    revision = '1',
    poolQueries = 0,
    transactionQueries = 0;
  const statements: string[] = [];
  const read = <Row extends object>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): { rows: Row[]; rowCount: number } => {
    statements.push(sql);
    expect(sql).toBe(MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY);
    expect(parameters).toEqual([
      command.worldId,
      command.authSubject,
      command.countryId,
      command.officeId,
      'FINANCE_BUDGET',
    ]);
    const rows = active
      ? [{ team_id: 'TEAM_AUTH_SCOPE', authorization_version: revision }]
      : [];
    return { rows: rows as Row[], rowCount: rows.length };
  };
  const tx: SqlExecutor = {
    query: async <Row extends object>(sql: string, parameters) => {
      transactionQueries++;
      return read<Row>(sql, parameters);
    },
  };
  const database: SqlDatabase = {
    query: async <Row extends object>(sql: string, parameters) => {
      poolQueries++;
      if (held) throw Error('SECOND_CONNECTION_REQUIRED');
      return read<Row>(sql, parameters);
    },
    transaction: async (consume) => {
      if (held) throw Error('NESTED_TRANSACTION_REQUIRES_CONNECTION');
      held = true;
      try {
        return await consume(tx);
      } finally {
        held = false;
      }
    },
  };
  return {
    database,
    get poolQueries() {
      return poolQueries;
    },
    get transactionQueries() {
      return transactionQueries;
    },
    statements,
    revoke: () => {
      active = false;
    },
    changeRevision: () => {
      revision = '2';
    },
  };
}
async function proof(database: SqlDatabase): Promise<CommitAuthorizationProof> {
  const authorization = await authorizeManualOfficeCommand({
    database,
    command,
  });
  let captured: CommitAuthorizationProof | null = null;
  const sentinel = Error('TEST_ONLY_CAPTURE_NO_ECONOMIC_COMMIT');
  await expect(
    processQueuedCommand({
      command,
      authorityKind: 'DISCRETIONARY_USER',
      requiredCapability: 'FINANCE_BUDGET',
      intakeAuthorization: authorization,
      commitSimTime: command.simTime,
      recordedAtReal: '2026-10-29T00:00:00.000Z',
      persistence: {
        readFinalReceipt: async () => null,
        recordZeroEffectReceipt: async () => {
          throw Error('unexpected revoked at bootstrap');
        },
        commitAuthorizedCommand: async (input) => {
          captured = input.commitAuthorization;
          throw sentinel;
        },
      },
    }),
  ).rejects.toBe(sentinel);
  if (!captured) throw Error('genuine Core proof not issued');
  return captured;
}
describe('manual Core proof reauthorization uses the held transaction executor', () => {
  it('reproduces the old max-one connection failure and resolves the same real Core proof through the active executor', async () => {
    const legacy = singleConnection(),
      oldProof = await proof(legacy.database);
    await expect(
      legacy.database.transaction(async () =>
        reauthorizeCommitAuthorizationProof(oldProof),
      ),
    ).rejects.toThrow('SECOND_CONNECTION_REQUIRED');
    const driver = singleConnection(),
      database = createManualOfficeAuthorizationTransactionDatabase(
        driver.database,
      ),
      authorization = await proof(database),
      before = driver.poolQueries;
    expect(
      createManualOfficeAuthorizationTransactionDatabase(driver.database),
    ).toBe(database);
    expect(createManualOfficeAuthorizationTransactionDatabase(database)).toBe(
      database,
    );
    await database.transaction(async () => {
      await reauthorizeCommitAuthorizationProof(authorization);
      await reauthorizeCommitAuthorizationProof(authorization);
    });
    expect(driver.poolQueries).toBe(before);
    expect(driver.transactionQueries).toBeGreaterThan(0);
    await reauthorizeCommitAuthorizationProof(authorization);
    expect(driver.poolQueries).toBeGreaterThan(before);
  });
  it('rechecks revocation and same-head revision changes without cached membership or a second pool query', async () => {
    for (const mutation of ['REVOKE', 'REVISION']) {
      const driver = singleConnection(),
        database = createManualOfficeAuthorizationTransactionDatabase(
          driver.database,
        ),
        authorization = await proof(database),
        before = driver.poolQueries;
      await database.transaction(async () => {
        if (mutation === 'REVOKE') driver.revoke();
        else driver.changeRevision();
        await expect(
          reauthorizeCommitAuthorizationProof(authorization),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
      });
      expect(driver.poolQueries).toBe(before);
      expect(driver.transactionQueries).toBeGreaterThan(0);
    }
  });
  it('rejects escaped asynchronous authorization after the callback has retired', async () => {
    const driver = singleConnection(),
      database = createManualOfficeAuthorizationTransactionDatabase(
        driver.database,
      ),
      authorization = await proof(database),
      before = driver.poolQueries;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let late!: Promise<void>;
    await database.transaction(async () => {
      late = (async () => {
        await gate;
        await reauthorizeCommitAuthorizationProof(authorization);
      })();
    });
    release();
    await expect(late).rejects.toThrow('TRANSACTION_SCOPE_RETIRED');
    expect(driver.poolQueries).toBe(before);
    expect(driver.transactionQueries).toBe(0);
  });
  it('does not borrow another database executor and preserves actual backend failures', async () => {
    const first = singleConnection(),
      second = singleConnection(),
      a = createManualOfficeAuthorizationTransactionDatabase(first.database),
      b = createManualOfficeAuthorizationTransactionDatabase(second.database),
      authorization = await proof(a),
      before = first.poolQueries;
    await b.transaction(async () =>
      reauthorizeCommitAuthorizationProof(authorization),
    );
    expect(first.poolQueries).toBeGreaterThan(before);
    expect(second.transactionQueries).toBe(0);
    const failure = Error('actual backend failure'),
      broken: SqlDatabase = {
        query: async () => {
          throw failure;
        },
        transaction: async (consume) =>
          consume({
            query: async () => {
              throw failure;
            },
          }),
      };
    const wrapped = createManualOfficeAuthorizationTransactionDatabase(broken);
    await expect(
      wrapped.transaction((tx) =>
        tx.query(MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY),
      ),
    ).rejects.toBe(failure);
  });
});
