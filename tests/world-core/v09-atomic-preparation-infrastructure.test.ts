// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  authSubject,
  countryId,
  officeId,
  worldId,
} from '../../packages/core/src/index.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import {
  DeterministicV09FaultInjector,
  V09_ATOMIC_FAULT_POINTS,
  V09_ATOMIC_PREPARATION_STATE,
  classifyTransactionResult,
  type V09AtomicFaultPoint,
  type V09AtomicTestDatabase,
} from '../support/v09-atomic-contract.js';
import {
  prepareV09AtomicEvidence,
  serializeV09AtomicEvidence,
  writeV09AtomicEvidence,
} from '../support/v09-atomic-evidence.js';
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

const FINANCE = officeId('FINANCE');
const COUNTRY = countryId('COUNTRY_1');
const CAPABILITY = 'FINANCE_TREASURY' as const;
const ACTIVE_AT = '2026-09-12T00:00:00.000Z';
const EXPIRES_AT = '2026-09-12T00:05:00.000Z';

let database: V09AtomicTestDatabase;

function identifier(prefix: string, index: number): string {
  return `${prefix}_${String(index).padStart(2, '0')}`;
}

async function commandFixture(input: {
  readonly index: number;
  readonly worldVersion?: string;
}): Promise<{
  readonly authorization: MutableV09AuthorizationFixture;
  readonly command: V09AtomicCommandFixture;
}> {
  const world = worldId(identifier('WORLD_TEST', input.index));
  const authorization = new MutableV09AuthorizationFixture({
    authorizationVersion: 'AUTH_REVISION_1',
    countryId: COUNTRY,
    officeAssignments: [FINANCE],
    worldId: world,
  });
  const authorizationContext = await authorization.authorize({
    capability: CAPABILITY,
    countryId: COUNTRY,
    officeId: FINANCE,
  });
  const suffix = String(input.index).padStart(2, '0');
  return {
    authorization,
    command: Object.freeze({
      authorizationContext,
      commandFingerprint: `sha256:${'a'.repeat(62)}${suffix}`,
      commandId: identifier('COMMAND_TEST', input.index),
      expectedAuthorizationRevision: 'AUTH_REVISION_1',
      expectedWorldVersion: input.worldVersion ?? '0',
      fencingToken: '7',
      financialAmount: '125.50',
      holderId: 'WORKER_TEST',
      idempotencyKey: identifier('IDEMPOTENCY_TEST', input.index),
      inventoryAmount: '10',
      observedAtReal: ACTIVE_AT,
      requiredCapability: CAPABILITY,
      requiredCountryId: COUNTRY,
      requiredOfficeId: FINANCE,
      worldId: world,
    }),
  };
}

async function seed(command: V09AtomicCommandFixture): Promise<void> {
  await seedV09AtomicFixture(database, {
    expiresAtReal: EXPIRES_AT,
    fencingToken: command.fencingToken,
    holderId: command.holderId,
    worldId: command.worldId,
    worldVersion: command.expectedWorldVersion,
  });
}

beforeEach(async () => {
  database = createPGliteV09AtomicTestDatabase();
  await bootstrapV09AtomicPreparationSchema(database);
});

afterEach(async () => database.close());

describe('V09 atomic preparation transaction classifier', () => {
  it('distinguishes committed, rolled back, unknown and cleanup-incomplete outcomes', () => {
    expect(
      classifyTransactionResult({
        cleanupConfirmed: true,
        commitAcknowledged: true,
        commitAttempted: true,
        durableResultFound: false,
        rollbackConfirmed: false,
      }),
    ).toBe('COMMITTED');
    expect(
      classifyTransactionResult({
        cleanupConfirmed: true,
        commitAcknowledged: false,
        commitAttempted: false,
        durableResultFound: false,
        rollbackConfirmed: true,
      }),
    ).toBe('ROLLED_BACK');
    expect(
      classifyTransactionResult({
        cleanupConfirmed: true,
        commitAcknowledged: false,
        commitAttempted: true,
        durableResultFound: false,
        rollbackConfirmed: false,
      }),
    ).toBe('UNKNOWN');
    expect(
      classifyTransactionResult({
        cleanupConfirmed: false,
        commitAcknowledged: false,
        commitAttempted: false,
        durableResultFound: false,
        rollbackConfirmed: false,
      }),
    ).toBe('CLEANUP_INCOMPLETE');
  });
});

describe('V09 atomic preparation deterministic failure matrix', () => {
  const preCommitPoints = V09_ATOMIC_FAULT_POINTS.filter(
    (point) =>
      point !== 'COMMIT_ACKNOWLEDGEMENT_UNKNOWN' &&
      point !== 'POST_COMMIT_RESPONSE_LOST',
  );
  const preCommitCases = preCommitPoints.map(
    (point, index) => [point, index + 1] as const,
  );

  it.each(preCommitCases)(
    'rolls back every write when %s fails',
    async (point, index) => {
      const fixture = await commandFixture({ index });
      await seed(fixture.command);

      const result = await runV09AtomicPreparationAttempt({
        command: fixture.command,
        database,
        faultInjector: new DeterministicV09FaultInjector(point),
      });

      expect(result).toMatchObject({
        classification: 'ROLLED_BACK',
        disposition: 'FAILED',
        failurePoint: point,
      });
      assertV09ZeroPersistence(
        await inspectV09AtomicFootprint(database, fixture.command),
        '0',
      );
    },
  );

  const postCommitCases = (
    [
      'COMMIT_ACKNOWLEDGEMENT_UNKNOWN',
      'POST_COMMIT_RESPONSE_LOST',
    ] satisfies readonly V09AtomicFaultPoint[]
  ).map((point, index) => [point, index + 30] as const);

  it.each(postCommitCases)(
    'recovers one durable result after %s',
    async (point, index) => {
      const fixture = await commandFixture({ index });
      await seed(fixture.command);

      const first = await runV09AtomicPreparationAttempt({
        command: fixture.command,
        database,
        faultInjector: new DeterministicV09FaultInjector(point),
      });
      const retry = await runV09AtomicPreparationAttempt({
        command: fixture.command,
        database,
      });

      expect(first).toMatchObject({
        classification: 'COMMITTED',
        disposition: 'APPLIED',
        failurePoint: point,
      });
      expect(retry).toMatchObject({
        classification: 'COMMITTED',
        disposition: 'DURABLE_RETRY',
        durableResult: first.durableResult,
      });
      assertV09ExactlyOneCommit(
        await inspectV09AtomicFootprint(database, fixture.command),
        '1',
      );
    },
  );

  it('preserves UNKNOWN when commit acknowledgement recovery cannot observe durable state', async () => {
    const fixture = await commandFixture({ index: 40 });
    await seed(fixture.command);

    const result = await runV09AtomicPreparationAttempt({
      command: fixture.command,
      database,
      faultInjector: new DeterministicV09FaultInjector(
        'COMMIT_ACKNOWLEDGEMENT_UNKNOWN',
      ),
      recoveryProbe: async () => {
        throw new Error('simulated recovery connection loss');
      },
    });

    expect(result.classification).toBe('UNKNOWN');
    assertV09ExactlyOneCommit(
      await inspectV09AtomicFootprint(database, fixture.command),
      '1',
    );
  });
});

describe('V09 atomic preparation guards and oracle', () => {
  it.each([
    ['holder', { holderId: 'WORKER_STALE' }],
    ['fence', { fencingToken: '8' }],
    ['WorldVersion', { expectedWorldVersion: '1' }],
    ['expired lease', { observedAtReal: EXPIRES_AT }],
  ] as const)('rejects stale %s with zero persistence', async (_, override) => {
    const fixture = await commandFixture({ index: 50 });
    await seed(fixture.command);
    const stale = Object.freeze({ ...fixture.command, ...override });

    const result = await runV09AtomicPreparationAttempt({
      command: stale,
      database,
    });

    expect(result.classification).toBe('ROLLED_BACK');
    assertV09ZeroPersistence(
      await inspectV09AtomicFootprint(database, stale),
      '0',
    );
  });

  it('re-resolves AuthSubject, membership, country, Office, capability and revision at transaction time', async () => {
    const fixture = await commandFixture({ index: 51 });
    await seed(fixture.command);
    fixture.authorization.mutate({ authorizationVersion: 'AUTH_REVISION_2' });

    const result = await runV09AtomicPreparationAttempt({
      command: fixture.command,
      database,
    });

    expect(result).toMatchObject({
      classification: 'ROLLED_BACK',
      failurePoint: 'AUTHORIZATION_REVISION_OR_SCOPE_STALE',
    });
    expect(
      fixture.authorization
        .resolutionTrace()
        .slice(-2)
        .map((entry) => entry.kind),
    ).toEqual(['IDENTITY', 'MEMBERSHIP']);
    assertV09ZeroPersistence(
      await inspectV09AtomicFootprint(database, fixture.command),
      '0',
    );
  });

  it.each([
    ['country', { requiredCountryId: countryId('COUNTRY_2') }, 71],
    ['Office', { requiredOfficeId: officeId('TRADE') }, 72],
    ['capability', { requiredCapability: 'TRADE_CONTRACTS' as const }, 73],
  ] as const)(
    'rejects a mismatched current authorization %s scope',
    async (_, override, index) => {
      const fixture = await commandFixture({ index });
      await seed(fixture.command);
      const command = Object.freeze({ ...fixture.command, ...override });

      const result = await runV09AtomicPreparationAttempt({
        command,
        database,
      });

      expect(result).toMatchObject({
        classification: 'ROLLED_BACK',
        failurePoint: 'AUTHORIZATION_REVISION_OR_SCOPE_STALE',
      });
      assertV09ZeroPersistence(
        await inspectV09AtomicFootprint(database, command),
        '0',
      );
    },
  );

  it('fails closed when the current AuthSubject or Office membership is revoked', async () => {
    const subjectFixture = await commandFixture({ index: 52 });
    await seed(subjectFixture.command);
    subjectFixture.authorization.mutate({
      authSubject: authSubject('7f76f8de-95c7-4c4d-8714-4f64fbf6c120'),
    });
    const subjectResult = await runV09AtomicPreparationAttempt({
      command: subjectFixture.command,
      database,
    });
    expect(subjectResult.classification).toBe('ROLLED_BACK');

    const officeFixture = await commandFixture({ index: 53 });
    await seed(officeFixture.command);
    officeFixture.authorization.mutate({ officeAssignments: [] });
    const officeResult = await runV09AtomicPreparationAttempt({
      command: officeFixture.command,
      database,
    });
    expect(officeResult.classification).toBe('ROLLED_BACK');
    assertV09ZeroPersistence(
      await inspectV09AtomicFootprint(database, officeFixture.command),
      '0',
    );
  });

  it('returns one result for an exact retry and rejects same-key changed intent', async () => {
    const fixture = await commandFixture({ index: 54 });
    await seed(fixture.command);
    const committed = await runV09AtomicPreparationAttempt({
      command: fixture.command,
      database,
    });
    const retry = await runV09AtomicPreparationAttempt({
      command: fixture.command,
      database,
    });
    const conflict = Object.freeze({
      ...fixture.command,
      commandFingerprint: `sha256:${'b'.repeat(64)}`,
      commandId: 'COMMAND_CONFLICT',
      expectedWorldVersion: '1',
    });
    const conflicted = await runV09AtomicPreparationAttempt({
      command: conflict,
      database,
    });

    expect(committed.disposition).toBe('APPLIED');
    expect(retry).toMatchObject({
      classification: 'COMMITTED',
      disposition: 'DURABLE_RETRY',
      durableResult: committed.durableResult,
    });
    expect(conflicted).toMatchObject({
      classification: 'ROLLED_BACK',
      failurePoint: 'IDEMPOTENCY_INTENT_CONFLICT',
    });
    assertV09ExactlyOneCommit(
      await inspectV09AtomicFootprint(database, fixture.command),
      '1',
    );
  });

  it('allows only one of two concurrent N to N+1 attempts to commit', async () => {
    const first = await commandFixture({ index: 55 });
    await seed(first.command);
    const secondOnSameWorld = Object.freeze({
      ...first.command,
      commandFingerprint: `sha256:${'c'.repeat(64)}`,
      commandId: 'COMMAND_TEST_56',
      idempotencyKey: 'IDEMPOTENCY_TEST_56',
    });

    const results = await Promise.all([
      runV09AtomicPreparationAttempt({
        command: first.command,
        database,
      }),
      runV09AtomicPreparationAttempt({
        command: secondOnSameWorld,
        database,
      }),
    ]);

    assertOnlyOneNToNPlusOneSucceeded(results);
    expect(results.map((result) => result.classification).sort()).toEqual([
      'COMMITTED',
      'ROLLED_BACK',
    ]);
  });

  it('survives a short deterministic low-pressure run without partial state', async () => {
    const fixture = await commandFixture({ index: 60 });
    await seed(fixture.command);

    for (let index = 0; index < 16; index += 1) {
      const command = Object.freeze({
        ...fixture.command,
        commandFingerprint: `sha256:${String(index).padStart(64, '0')}`,
        commandId: identifier('COMMAND_STABILITY', index),
        expectedWorldVersion: String(index),
        idempotencyKey: identifier('IDEMPOTENCY_STABILITY', index),
      });
      const result = await runV09AtomicPreparationAttempt({
        command,
        database,
      });
      expect(result.classification).toBe('COMMITTED');
    }

    const finalHead = await database.query<{ world_version: string }>(
      `select world_version::text as world_version
         from v09_atomic_preparation.world_head
        where world_id = $1`,
      [fixture.command.worldId],
    );
    expect(finalHead.rows[0]?.world_version).toBe('16');
  });

  it('tears down only the allowlisted preparation schema with RESTRICT', async () => {
    await expect(cleanupV09AtomicPreparationSchema(database)).resolves.toBe(
      'COMMITTED',
    );
    await expect(
      database.query('select * from v09_atomic_preparation.world_head'),
    ).rejects.toThrow();
  });
});

describe('V09 atomic preparation evidence utilities', () => {
  it('redacts recursively, serializes deterministically, hashes and atomically lands evidence', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'econmind-v09-atomic-evidence-'),
    );
    const firstPath = path.join(directory, 'first.json');
    const secondPath = path.join(directory, 'second.json');
    try {
      const left = prepareV09AtomicEvidence({
        z: 1,
        nested: { password: 'do-not-write', safe: 'VISIBLE' },
        connection: 'postgresql://user:password@127.0.0.1/test',
      });
      const right = prepareV09AtomicEvidence({
        connection: 'different-secret',
        nested: { safe: 'VISIBLE', password: 'changed-secret' },
        z: 1,
      });
      expect(serializeV09AtomicEvidence(left.payload)).toBe(
        serializeV09AtomicEvidence(right.payload),
      );
      expect(left.payloadSha256).toBe(right.payloadSha256);

      await writeV09AtomicEvidence({
        evidencePath: firstPath,
        payload: left.payload,
      });
      await writeV09AtomicEvidence({
        evidencePath: secondPath,
        payload: right.payload,
      });

      const durable = await readFile(firstPath, 'utf8');
      expect(durable).toContain(V09_ATOMIC_PREPARATION_STATE);
      expect(durable).toContain('[REDACTED]');
      expect(durable).not.toContain('do-not-write');
      expect((await stat(firstPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
