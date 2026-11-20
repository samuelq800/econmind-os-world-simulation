/** Publisher/read/cutoff protocol only; actual native MATCH is separate. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import {
  parseCanonicalCommand,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
} from '@econmind/core';
import {
  createPostwarSocialMatchPublisher,
  createPostwarSocialMatchRuntime,
  isPostwarSocialMatchSourceCommitProtectionPort,
  SOCIAL_MATCH_SOURCE_PURPOSE,
  type SocialMatchSourceCommitRequest,
} from '../../apps/world-worker/src/persistence/postwar-social-match-runtime.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const command = parseCanonicalCommand(
  {
    schemaVersion: 'command-v1',
    actorId: 'ACTOR_TEST_MATCH',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_MATCH_TEST',
    commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
    correlationId: 'CORRELATION_MATCH_TEST',
    countryId: 'COUNTRY_01',
    expectedWorldVersion: '2',
    idempotencyKey: 'IDEMPOTENCY_MATCH_TEST',
    officeId: null,
    simTime: '2000',
    submittedAtReal: '2026-10-28T00:00:00.000Z',
    worldId: 'WORLD_TEST',
    payload: {
      schemaVersion: 'social-job-match-settlement-v1',
      planCommandId: 'COMMAND_PLAN_TEST',
      planFingerprint: `sha256:${'1'.repeat(64)}`,
      dueDayIndex: '0',
      ruleVersion: 'SOCIAL_JOB_MATCH_RULE_V1',
    },
  },
  (s) => createHash('sha256').update(s).digest('hex'),
);
let context: Awaited<ReturnType<typeof loadPostwarSourceContext>>;
beforeAll(async () => {
  context = await loadPostwarSourceContext(
    path.resolve(import.meta.dirname, '../..'),
  );
});
function fixture() {
  const queries: string[] = [];
  const tx: SqlExecutor = {
    async query(sql) {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };
  const database: SqlDatabase = {
    query: tx.query,
    transaction: async (consume) => consume(tx),
  };
  return {
    queries,
    tx,
    runtime: createPostwarSocialMatchRuntime({
      database,
      workerRole: 'fixture_social_worker',
      workerId: 'WORKER_TEST',
      openingAdoption: context.labourSocial,
    }),
  };
}
describe('fixed one-shot MATCH source boundaries', () => {
  it('pre-claim requires the actual source role and does not claim or issue a proof', async () => {
    const f = fixture();
    await expect(
      f.runtime.assertSourceBeforeClaim({
        command,
        observedAtReal: '2026-10-28T00:00:00.000Z',
      }),
    ).rejects.toThrow('actual separated worker');
    expect(f.queries).toHaveLength(1);
    expect(f.queries.join(' ')).not.toMatch(
      /command_queue|acquire_world_writer_lease|insert/i,
    );
  });
  it('rejects invalid pre-claim observation before source SQL', async () => {
    const f = fixture();
    await expect(
      f.runtime.assertSourceBeforeClaim({ command, observedAtReal: 'invalid' }),
    ).rejects.toThrow('pre-claim observation');
    expect(f.queries).toHaveLength(0);
  });
  it('does not admit a copied callback as an actual automatic source port', () => {
    const f = fixture();
    expect(
      isPostwarSocialMatchSourceCommitProtectionPort(
        f.runtime.sourceCommitProtectionPort,
      ),
    ).toBe(true);
    expect(
      isPostwarSocialMatchSourceCommitProtectionPort({
        ...f.runtime.sourceCommitProtectionPort,
      }),
    ).toBe(false);
  });
  it('does not borrow a manual authorization proof or old PLAN purpose', async () => {
    const f = fixture();
    const req = {
      phase: 'BEFORE_EVENTS',
      purpose: SOCIAL_MATCH_SOURCE_PURPOSE,
      command,
      transition: {},
      currentHead: {
        worldId: command.worldId,
        worldVersion: '2',
        eventSequence: '2',
      },
      observedAtReal: '2026-10-28T00:00:00.000Z',
      readBinding: { ready: true },
      commitAuthorization: { currentlyAuthorized: true },
    } as unknown as SocialMatchSourceCommitRequest;
    await expect(
      f.runtime.sourceCommitProtectionPort.assertCurrentFrom(f.tx, req),
    ).rejects.toThrow('null proof required');
    expect(f.queries).toHaveLength(0);
  });
  it('requires actual fixed SQL publisher identity before registering, issuing or revoking due work', async () => {
    const f = fixture(),
      publisher = createPostwarSocialMatchPublisher();
    for (const fn of [
      () =>
        publisher.registerFrom(f.tx, {
          worldId: 'WORLD_TEST',
          countryId: 'COUNTRY_01',
        }),
      () =>
        publisher.publishFrom(f.tx, {
          worldId: 'WORLD_TEST',
          planCommandId: 'COMMAND_PLAN_TEST',
        }),
      () =>
        publisher.revokeFrom(f.tx, {
          worldId: 'WORLD_TEST',
          countryId: 'COUNTRY_01',
          reasonRef: 'REASON_TEST',
        }),
    ])
      await expect(fn()).rejects.toThrow('fixed real publisher');
    expect(
      f.queries.every((q) => q.includes('current_user as role_name')),
    ).toBe(true);
  });
  it('rejects a discretionary proof at automatic candidate preparation without source reads', async () => {
    const f = fixture();
    await expect(
      f.runtime.candidateFactory.prepare({
        command,
        observedAtReal: '2026-10-28T00:00:00.000Z',
        commitAuthorization: {} as never,
      }),
    ).rejects.toThrow('cannot borrow discretionary');
    expect(f.queries).toHaveLength(0);
  });
});
