import { WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
/** Isolated TEST_ONLY production rejection chain; not a production success. */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { parseIndustryProductionIntent } from '@econmind/core/industry-production-command';
import { createHash } from 'node:crypto';
import {
  createIndustryPaymentAtomicFixture,
  INDUSTRY_ATOMIC_AT,
} from '../support/postwar-industry-payment-atomic-fixture.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  createPostwarIndustryProductionCandidateFactory,
  isPostwarIndustryProductionCandidateFactory,
} from '../../apps/world-worker/src/persistence/postwar-industry-production-candidate-factory.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let f: Awaited<ReturnType<typeof createIndustryPaymentAtomicFixture>>;
describe('fixed Industry Core contract -> candidate factory -> actual Atomic cutoff', () => {
  beforeAll(async () => {
    f = await createIndustryPaymentAtomicFixture();
  });
  afterAll(async () => {
    await f?.close();
  });
  it('Core parses only references and refuses caller economic values', () => {
    expect(parseIndustryProductionIntent(f.command, sha).facilityId).toBe(
      f.paidInput.target.posting.evidence.operating.payload.facilityRef,
    );
    const { canonicalPayload, payloadHash, fingerprint, simTime, ...rest } =
      f.command;
    void payloadHash;
    void fingerprint;
    const bad = C.parseCanonicalCommand(
      {
        ...rest,
        payload: {
          ...(JSON.parse(canonicalPayload) as object),
          worked: true,
          cost: '6',
        },
        simTime: simTime.toCanonicalValue(),
      },
      sha,
    );
    expect(() => parseIndustryProductionIntent(bad, sha)).toThrow(
      'EXACT_FACILITY',
    );
    expect(isPostwarIndustryProductionCandidateFactory(f.factory)).toBe(true);
    expect(isPostwarIndustryProductionCandidateFactory({ ...f.factory })).toBe(
      false,
    );
  });
  it('factory prepares private payment data before standard Atomic command/posting reconstruction', async () => {
    const { draft, proof } = await f.prepareOnly();
    const candidate = prepareAtomicTransitionCandidate({
      command: f.command,
      commitAuthorization: proof,
      draft,
      sha256Hex: sha,
    });
    expect(candidate.command).not.toBe(f.command);
    expect(candidate.inventoryPostings[0]).not.toBe(draft.inventoryPostings[0]);
    expect(candidate.transition).toBe(draft.transition);
    expect(candidate.financialPostingBatches).toHaveLength(0);
    expect(candidate.inventoryPostings).toHaveLength(1);
    expect(draft.authorityKind).toBe('DISCRETIONARY_USER');
  });
  it('actual worker lifecycle reaches fresh paid source only after lease/H/auth and rejects only missing inputs with zero writes', async () => {
    const before = await f.counts(),
      start = f.queries.length;
    let message = '';
    try {
      await f.execution.executeQueuedCommand(f.queued);
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain('INDUSTRY_OPERATING_FACTS_MISSING:WORK');
    expect(message).not.toContain('PAID_COST:');
    expect(message).not.toContain('PREPARATION_REQUIRED');
    expect(await f.counts()).toEqual(before);
    const queries = f.queries.slice(start);
    const lease = queries.findIndex((q) =>
        q.includes('assert_world_writer_commit_guard'),
      ),
      payment = queries.findIndex((q) =>
        q.includes('lock_postwar_industry_payment_prefix'),
      );
    expect(lease).toBeGreaterThanOrEqual(0);
    expect(payment).toBeGreaterThan(lease);
    const auth = queries.indexOf(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY);
    expect(auth).toBeGreaterThan(lease);
    expect(payment).toBeGreaterThan(auth);
    expect(f.protectedCalls).toBe(0);
    expect(before).toMatchObject({
      events: 1,
      receipts: 1,
      inventory: 0,
      batches: 1,
      audit: 0,
      version: '1',
      sequence: '1',
      queue: 'CLAIMED',
    });
  });
  it('factory reauthorizes genuine proof after actual role revocation', async () => {
    const { proof } = await f.prepareOnly(),
      before = await f.counts();
    await f.db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.command.worldId],
    );
    try {
      await expect(
        f.factory.prepare({
          command: f.command,
          commitAuthorization: proof,
          observedAtReal: INDUSTRY_ATOMIC_AT,
        }),
      ).rejects.toThrow();
      expect(await f.counts()).toEqual(before);
    } finally {
      await f.db.query(
        'update world_v2.current_commit_authorization set active=true where world_id=$1',
        [f.command.worldId],
      );
    }
  });
  it('cloned data token or stale writer assertion cannot become a successful production', async () => {
    expect(() =>
      createPostwarIndustryProductionCandidateFactory({
        preparation: { ...f.preparation },
        sourceGuard: f.guard,
        commitAssertion: f.assertion,
      }),
    ).toThrow('GENUINE');
    const { proof } = await f.prepareOnly(),
      before = await f.counts();
    const stale = createPostwarIndustryProductionCandidateFactory({
      preparation: f.preparation,
      sourceGuard: f.guard,
      commitAssertion: { ...f.assertion, fencingToken: '2' },
    });
    const draft = await stale.prepare({
      command: f.command,
      commitAuthorization: proof,
      observedAtReal: INDUSTRY_ATOMIC_AT,
    });
    const candidate = prepareAtomicTransitionCandidate({
      command: f.command,
      commitAuthorization: proof,
      draft,
      sha256Hex: sha,
    });
    await expect(f.execution.repository.commit(candidate)).rejects.toThrow();
    expect(await f.counts()).toEqual(before);
  });
});
