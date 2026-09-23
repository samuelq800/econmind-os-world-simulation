// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countryId, officeId, worldId } from '../../packages/core/src/index.js';
import {
  createLocalPostgresV09AtomicTestDatabase,
  createPGliteV09AtomicTestDatabase,
} from '../support/v09-atomic-database.js';
import {
  DeterministicV09FaultInjector,
  type V09AtomicTestDatabase,
} from '../support/v09-atomic-contract.js';
import {
  assertOnlyOneNToNPlusOneSucceeded,
  assertV09ExactlyOneCommit,
  assertV09ZeroPersistence,
  bootstrapV09AtomicPreparationSchema,
  cleanupV09AtomicPreparationSchema,
  inspectV09AtomicFootprint,
  runV09AtomicPreparationAttempt,
  seedV09AtomicFixture,
  type V09AtomicCommandFixture,
} from '../support/v09-atomic-harness.js';
import { MutableV09AuthorizationFixture } from '../support/v09-authorization-fixture.js';

const postgresConfigured = Boolean(process.env.V09_TEST_DATABASE_URL);
const describePostgres = postgresConfigured ? describe : describe.skip;
const FINANCE = officeId('FINANCE');
const COUNTRY = countryId('COUNTRY_1');

let database: V09AtomicTestDatabase | undefined;

function currentDatabase(): V09AtomicTestDatabase {
  if (database === undefined) {
    throw new Error('V09 atomic PostgreSQL preparation database is not open');
  }
  return database;
}

async function fixture(
  worldName: string,
  commandName: string,
): Promise<V09AtomicCommandFixture> {
  const world = worldId(worldName);
  const authorization = new MutableV09AuthorizationFixture({
    countryId: COUNTRY,
    officeAssignments: [FINANCE],
    worldId: world,
  });
  const authorizationContext = await authorization.authorize({
    capability: 'FINANCE_TREASURY',
    countryId: COUNTRY,
    officeId: FINANCE,
  });
  return Object.freeze({
    authorizationContext,
    commandFingerprint: `sha256:${commandName.padEnd(64, 'a').slice(0, 64)}`,
    commandId: commandName,
    expectedAuthorizationRevision: 'AUTH_REVISION_1',
    expectedWorldVersion: '0',
    fencingToken: '1',
    financialAmount: '5',
    holderId: 'WORKER_POSTGRES',
    idempotencyKey: `${commandName}_KEY`,
    inventoryAmount: '5',
    observedAtReal: '2026-09-12T00:00:00.000Z',
    requiredCapability: 'FINANCE_TREASURY',
    requiredCountryId: COUNTRY,
    requiredOfficeId: FINANCE,
    worldId: world,
  });
}

async function seed(command: V09AtomicCommandFixture): Promise<void> {
  await seedV09AtomicFixture(currentDatabase(), {
    expiresAtReal: '2026-09-12T00:05:00.000Z',
    fencingToken: command.fencingToken,
    holderId: command.holderId,
    worldId: command.worldId,
    worldVersion: command.expectedWorldVersion,
  });
}

describe('V09 atomic PostgreSQL preparation environment boundary', () => {
  it('rejects an unapproved database environment before opening a pool', () => {
    expect(() =>
      createLocalPostgresV09AtomicTestDatabase({
        DATABASE_URL: 'postgresql://127.0.0.1/runtime',
        ECONMIND_ENV: 'local',
        V09_TEST_DATABASE_FINGERPRINT: 'world-v2-v09-test-local',
        V09_TEST_DATABASE_URL: 'postgresql://127.0.0.1/test',
      }),
    ).toThrow('must not share WORLD_DATABASE_URL or DATABASE_URL with runtime');
  });

  it('keeps the embedded adapter explicitly non-parallel', async () => {
    const embedded = createPGliteV09AtomicTestDatabase();
    expect(embedded).toMatchObject({
      kind: 'PGLITE',
      supportsParallelTransactions: false,
    });
    await embedded.close();
  });
});

describePostgres('V09 atomic disposable PostgreSQL preparation harness', () => {
  beforeAll(async () => {
    database = createLocalPostgresV09AtomicTestDatabase();
    await bootstrapV09AtomicPreparationSchema(database);
  });

  afterAll(async () => {
    if (database !== undefined) {
      expect(await cleanupV09AtomicPreparationSchema(database)).toBe(
        'COMMITTED',
      );
      await database.close();
    }
  });

  it('rolls back a failure after economic and receipt writes', async () => {
    const command = await fixture('WORLD_PG_ROLLBACK', 'COMMAND_PG_ROLLBACK');
    await seed(command);
    const result = await runV09AtomicPreparationAttempt({
      command,
      database: currentDatabase(),
      faultInjector: new DeterministicV09FaultInjector('AFTER_RECEIPT_WRITE'),
    });

    expect(result.classification).toBe('ROLLED_BACK');
    assertV09ZeroPersistence(
      await inspectV09AtomicFootprint(currentDatabase(), command),
      '0',
    );
  });

  it('recovers one durable result after lost post-commit acknowledgement', async () => {
    const command = await fixture('WORLD_PG_ACK', 'COMMAND_PG_ACK');
    await seed(command);
    const first = await runV09AtomicPreparationAttempt({
      command,
      database: currentDatabase(),
      faultInjector: new DeterministicV09FaultInjector(
        'COMMIT_ACKNOWLEDGEMENT_UNKNOWN',
      ),
    });
    const retry = await runV09AtomicPreparationAttempt({
      command,
      database: currentDatabase(),
    });

    expect(first.classification).toBe('COMMITTED');
    expect(retry.disposition).toBe('DURABLE_RETRY');
    assertV09ExactlyOneCommit(
      await inspectV09AtomicFootprint(currentDatabase(), command),
      '1',
    );
  });

  it('uses separate connections so two N to N+1 attempts cannot both commit', async () => {
    const first = await fixture('WORLD_PG_RACE', 'COMMAND_PG_RACE_A');
    await seed(first);
    const second = Object.freeze({
      ...first,
      commandFingerprint: `sha256:${'b'.repeat(64)}`,
      commandId: 'COMMAND_PG_RACE_B',
      idempotencyKey: 'COMMAND_PG_RACE_B_KEY',
    });

    const results = await Promise.all([
      runV09AtomicPreparationAttempt({
        command: first,
        database: currentDatabase(),
      }),
      runV09AtomicPreparationAttempt({
        command: second,
        database: currentDatabase(),
      }),
    ]);

    expect(currentDatabase().supportsParallelTransactions).toBe(true);
    assertOnlyOneNToNPlusOneSucceeded(results);
  });
});
