/** Protocol rejection/cutoff tests only. No admitted source, positive SQL
 * licence/auth witness, ready World or authoritative commit is mocked. */
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  parseCanonicalCommand,
} from '@econmind/core';
import {
  createPostwarSocialEmploymentServiceCreationRuntime,
  isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort,
} from '../../apps/world-worker/src/persistence/postwar-social-employment-service-creation-runtime.js';
import {
  createPostwarSocialServiceCreationPlanningReader,
  isPostwarSocialServiceCreationPlanningReader,
} from '../../apps/world-worker/src/persistence/postwar-social-service-creation-planning-read.js';
import { createPostwarSocialSourcePreparation } from '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js';
import {
  createRegisteredWorldExecutionClock,
  WORLD_EXECUTION_STATE_QUERY,
} from '../../apps/world-worker/src/time/registered-world-execution-state.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const worldId = 'WORLD_TEST_ONLY_CREATE_GUARDS',
  workerId = 'WORKER_TEST_ONLY_CREATE';
function fixture() {
  let clockBorrows = 0;
  const failure = Error('TEST_ONLY_ACTUAL_EXECUTOR_CUTOFF_FAILURE');
  const database: SqlDatabase = {
    query: async () => {
      throw Error('UNEXPECTED_OUTSIDE_EXECUTOR_QUERY');
    },
    transaction: async () => {
      clockBorrows++;
      throw Error('SECOND_POOL_BORROW_FORBIDDEN');
    },
  };
  const clock = createRegisteredWorldExecutionClock({
    database,
    worldId,
    workerId,
    registrationRef: 'REGISTRATION_TEST_ONLY_CREATE',
  });
  const runtime = createPostwarSocialEmploymentServiceCreationRuntime({
    worldId,
    workerId,
    database,
    workerRole: 'worker_test_only_create',
    clock,
    preparedSource: createPostwarSocialSourcePreparation(),
  });
  const statements: string[] = [];
  const tx: SqlExecutor = {
    query: async (sql) => {
      statements.push(sql);
      throw failure;
    },
  };
  return { runtime, tx, statements, failure, borrows: () => clockBorrows };
}
const selection = {
  countryId: 'COUNTRY_01',
  expectedHead: { worldVersion: '0', eventSequence: '0' },
  servicePoolIds: ['POOL_TEST_ONLY'],
};
it('reads the registered Clock using the held executor and propagates its actual failure without another pool borrow', async () => {
  const f = fixture();
  await expect(f.runtime.readPlanningFrom(f.tx, selection)).rejects.toBe(
    f.failure,
  );
  expect(f.statements).toEqual([WORLD_EXECUTION_STATE_QUERY]);
  expect(f.borrows()).toBe(0);
});
it('rejects malformed or unbounded page selections before consulting the Clock/backend', async () => {
  const f = fixture();
  for (const bad of [
    { ...selection, servicePoolIds: ['POOL_TEST_ONLY', 'POOL_TEST_ONLY'] },
    {
      ...selection,
      servicePoolIds: Array.from({ length: 101 }, (_, n) => 'POOL_' + n),
    },
    { ...selection, expectedHead: { worldVersion: '-1', eventSequence: '0' } },
  ])
    await expect(f.runtime.readPlanningFrom(f.tx, bad)).rejects.toThrow(
      'EXACT_BOUNDED_PLANNING_PAGE_REQUIRED',
    );
  expect(f.statements).toEqual([]);
  expect(f.borrows()).toBe(0);
});
it('does not turn an absent real commit proof into a candidate or borrow a transaction', async () => {
  const f = fixture(),
    command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        worldId,
        countryId: 'COUNTRY_01',
        officeId: 'SOCIAL',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'CREATE_TEST_ONLY',
        commandType: SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
        correlationId: 'TRACE_TEST_ONLY',
        expectedWorldVersion: '0',
        idempotencyKey: 'CREATE_TEST_ONLY',
        simTime: '0',
        submittedAtReal: '2026-11-08T00:00:00.000Z',
        payload: {
          schemaVersion: 'social-employment-service-create-v1',
          programmeId: 'PROGRAMME_TEST_ONLY',
          capacity: { amount: '1', unit: 'person' },
          budget: { amount: '0', currency: 'XAA' },
          target: {
            servicePoolId: 'POOL_TEST_ONLY',
            locationId: 'REGION_01_E1',
            skill: 'LOW',
          },
        },
      },
      sha,
    );
  await expect(
    f.runtime.candidateFactory.prepare({
      command,
      commitAuthorization: null,
      observedAtReal: '2026-11-08T00:00:00.000Z',
    }),
  ).rejects.toThrow('GENUINE_CURRENT_SOCIAL_PROOF_REQUIRED');
  expect(f.borrows()).toBe(0);
  expect(f.statements).toEqual([]);
});
it('rejects structural copies of private source ports and public reader bindings', () => {
  const f = fixture();
  expect(
    isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort(
      f.runtime.sourceCommitProtectionPort,
    ),
  ).toBe(true);
  expect(
    isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort({
      ...f.runtime.sourceCommitProtectionPort,
    }),
  ).toBe(false);
  expect(isPostwarSocialServiceCreationPlanningReader({}, worldId)).toBe(false);
  expect(() =>
    createPostwarSocialServiceCreationPlanningReader({ binding: {} as never }),
  ).toThrow('GENUINE_FINANCE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
});
