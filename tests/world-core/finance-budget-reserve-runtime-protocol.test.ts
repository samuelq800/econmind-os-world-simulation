import { expect, it } from 'vitest';
import {
  classifyReserveLifecycle,
  inspectReserveLockPlan,
  inspectReservePhase,
  type InertReserveAnchor,
  type InertReserveBinding,
  type InertReservePhase,
} from '../../apps/world-worker/src/persistence/finance-budget-reserve-runtime-protocol.js';

// All inputs are inert TEST_ONLY declarations. No source, native SQL, lease,
// admission, actual sampling, transaction rollback or runtime GO is proven.
const hash = (c: string) => `sha256:${c.repeat(64)}`;
const binding: InertReserveBinding = {
  worldId: 'W',
  countryId: 'C',
  entityRef: 'E',
  envelopeRef: 'B',
  effectivePeriodRef: 'P',
  budgetLineRef: 'L',
  currency: 'GCU',
  commandId: 'CMD',
  idempotencyKey: 'KEY',
  commandFingerprint: hash('a'),
  canonicalIntent: 'TEST_ONLY_CANONICAL_INTENT',
  intentSimTime: '77',
  sourceRef: 'SOURCE',
  sourceRevision: 'R1',
  admissionRef: 'ADMISSION',
  approvalRevision: 'A1',
  permissionRevision: 'P1',
  executorRef: 'TX1',
  timeProviderRef: 'TIME1',
  holderId: 'WORKER',
  fencingToken: '7',
};
function fixture(laggedCache = false) {
  const n = '9007199254740993',
    e = '9007199254741093';
  const beforeHead = { worldVersion: n, eventSequence: e };
  const afterHead = {
    worldVersion: (BigInt(n) + 1n).toString(),
    eventSequence: (BigInt(e) + 2n).toString(),
  };
  const key = 'BUDGET_RESERVE_V1_43_45_42_50_4C';
  const beforeValue = laggedCache
    ? {
        key,
        valueWorldVersion: (BigInt(n) - 5n).toString(),
        canonicalPayload: 'TEST_ONLY_BEFORE',
        payloadHash: hash('b'),
        sourceCommandId: 'PRIOR',
      }
    : {
        key,
        valueWorldVersion: null,
        canonicalPayload: null,
        payloadHash: null,
        sourceCommandId: null,
      };
  const events = [0, 1].map((i) => ({
    eventId: `EVENT_${i + 1}`,
    sequence: (BigInt(e) + BigInt(i) + 1n).toString(),
    worldVersion: afterHead.worldVersion,
    commandId: 'CMD',
    simTime: '77',
    canonicalEvent: `TEST_ONLY_EVENT_${i + 1}`,
    fingerprint: hash(i === 0 ? 'c' : 'd'),
  }));
  const a: InertReserveAnchor = {
    binding: { ...binding },
    beforeHead,
    sourceCutoff: { ...beforeHead },
    originalCache: {
      observationRef: 'C0',
      observedWorldVersion: n,
      value: beforeValue,
    },
    afterHead,
    afterCache: {
      key,
      valueWorldVersion: afterHead.worldVersion,
      canonicalPayload: 'TEST_ONLY_AFTER',
      payloadHash: hash('e'),
      sourceCommandId: 'CMD',
    },
    events,
    final: {
      commandId: 'CMD',
      idempotencyKey: 'KEY',
      commandFingerprint: hash('a'),
      worldVersionBefore: n,
      worldVersionAfter: afterHead.worldVersion,
      simTime: '77',
      outcome: 'COMMITTED',
      eventIds: events.map((x) => x.eventId),
      canonicalFinal: 'TEST_ONLY_FINAL',
    },
    authorizationAudit: 'TEST_ONLY_AUDIT',
    outbox: ['TEST_ONLY_OUTBOX'],
    leaseRenewedAtReal: '2026-10-16T00:00:00.000Z',
    leaseExpiresAtReal: '2026-10-16T00:00:30.000Z',
    validity: [
      {
        ref: 'APPROVAL',
        effectiveAtReal: '2026-10-16T00:00:00.000Z',
        expiresAtReal: '2026-10-16T00:00:40.000Z',
      },
    ],
  };
  const pre: InertReservePhase = {
    phase: 'PREWRITE',
    binding: { ...a.binding },
    head: { ...beforeHead },
    sourceCutoff: { ...beforeHead },
    originalCache: structuredClone(a.originalCache),
    currentCache: structuredClone(beforeValue),
    queue: {
      commandId: 'CMD',
      holderId: 'WORKER',
      fencingToken: '7',
      authorityKind: 'DISCRETIONARY_USER',
      intentSimTime: '77',
      state: 'CLAIMED',
    },
    events: [],
    final: null,
    authorizationAudit: null,
    outbox: [],
    tailCalls: '0',
    deltaApplications: '0',
    cacheWrites: '0',
    financialPostings: '0',
    inventoryPostings: '0',
    cutoffReal: '2026-10-16T00:00:10.000Z',
    previousCutoffReal: null,
    cutoffOrdinal: '10',
    lastBarrierOrdinal: '9',
    tailCompleteOrdinal: null,
  };
  const post: InertReservePhase = {
    ...pre,
    phase: 'POST_TAIL',
    head: { ...afterHead },
    currentCache: structuredClone(a.afterCache),
    queue: { ...pre.queue, state: 'FINALIZED' },
    events: structuredClone(events),
    final: structuredClone(a.final),
    authorizationAudit: a.authorizationAudit,
    outbox: [...a.outbox],
    tailCalls: '1',
    deltaApplications: '1',
    cacheWrites: '1',
    cutoffReal: '2026-10-16T00:00:15.000Z',
    previousCutoffReal: pre.cutoffReal,
    cutoffOrdinal: '20',
    lastBarrierOrdinal: '19',
    tailCompleteOrdinal: '18',
  };
  return { a, pre, post };
}
function lockPlan() {
  return {
    worldId: 'W',
    commandId: 'CMD',
    locks: ['S', 'L', 'H', 'D', 'A', 'C', 'Q'].map((rank) => ({
      rank,
      worldId: 'W',
      resourceId: rank === 'S' ? 'CMD' : `${rank}_ROW`,
      mode: ['D', 'A'].includes(rank) ? 'SHARE' : 'UPDATE',
    })),
  };
}

it('accepts a complete ordered inert lock plan without issuing authority', () => {
  expect(inspectReserveLockPlan(lockPlan())).toEqual({
    kind: 'INERT_CONSISTENT',
    code: null,
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
  });
});

it('rejects a lock-rank inversion rather than sorting an unsafe trace', () => {
  const p = lockPlan();
  [p.locks[2], p.locks[3]] = [p.locks[3]!, p.locks[2]!];
  expect(inspectReserveLockPlan(p).code).toBe('LOCK_ORDER');
});

it('rejects locking another historical submission beneath the selected command identity', () => {
  const p = lockPlan();
  p.locks[0]!.resourceId = 'OTHER_COMMAND';
  expect(inspectReserveLockPlan(p).code).toBe('OTHER_SUBMISSION_LOCK');
});

it('rejects a weak authorization lock mode, not treating KEY SHARE as SHARE', () => {
  const p = lockPlan();
  p.locks[4]!.mode = 'KEY_SHARE';
  expect(inspectReserveLockPlan(p).code).toBe('LOCK_MODE');
});

it('accepts PREWRITE with explicit nonnull absence descriptor, retaining original inputs', () => {
  const { a, pre } = fixture(),
    original = structuredClone({ a, pre });
  expect(inspectReservePhase(a, pre).kind).toBe('INERT_CONSISTENT');
  expect({ a, pre }).toEqual(original);
  expect(inspectReservePhase(a, { ...pre, originalCache: null }).kind).toBe(
    'INERT_REJECTED',
  );
});

it('accepts declared lagged-cache PREWRITE without substituting a global predecessor or zero', () => {
  const { a, pre } = fixture(true);
  expect(inspectReservePhase(a, pre).kind).toBe('INERT_CONSISTENT');
  expect(a.originalCache.value.valueWorldVersion).toBe('9007199254740988');
});

it('PT-SUCCESS accepts exact H1/FINALIZED/after-cache after one tail using exact big counters', () => {
  const { a, post } = fixture(),
    original = structuredClone(a.originalCache);
  expect(inspectReservePhase(a, post).kind).toBe('INERT_CONSISTENT');
  expect(post.head).toEqual({
    worldVersion: '9007199254740994',
    eventSequence: '9007199254741095',
  });
  expect(a.originalCache).toEqual(original);
  expect(post.deltaApplications).toBe('1');
});

it('PT-EXPIRY rejects the same exact after-state when only the existing lease expires at t2', () => {
  const { a, post } = fixture();
  expect(
    inspectReservePhase(a, { ...post, cutoffReal: a.leaseExpiresAtReal }).code,
  ).toBe('LEASE_EXPIRED_OR_FUTURE');
  // This is descriptor rejection only, NOT proof of actual SQL rollback.
  expect(post.tailCalls).toBe('1');
});

it('does not accept the old H0 as a POST_TAIL head', () => {
  const { a, post } = fixture();
  expect(inspectReservePhase(a, { ...post, head: a.beforeHead }).code).toBe(
    'POST_TAIL_HEAD',
  );
});

it('requires FINALIZED rather than the old CLAIMED predicate after the sole tail', () => {
  const { a, post } = fixture();
  expect(
    inspectReservePhase(a, {
      ...post,
      queue: { ...post.queue, state: 'CLAIMED' },
    }).code,
  ).toBe('POST_TAIL_QUEUE');
});

it('rejects overwriting original C0/CAS identity with an after-cache observation', () => {
  const { a, post } = fixture();
  const overwritten = {
    ...a.originalCache,
    observationRef: 'C1',
    value: a.afterCache,
  };
  expect(
    inspectReservePhase(a, { ...post, originalCache: overwritten }).code,
  ).toBe('CACHE_AHEAD');
});

it('requires the exact candidate Event/FINAL/cache facts, not merely a compatible head', () => {
  const { a, post } = fixture();
  const events = post.events.map((e) => ({
    ...e,
    canonicalEvent: 'DIFFERENT_EVENT',
  }));
  expect(inspectReservePhase(a, { ...post, events }).code).toBe(
    'POST_TAIL_EVENTS',
  );
  expect(
    inspectReservePhase(a, {
      ...post,
      final: { ...a.final, canonicalFinal: 'DIFFERENT_FINAL' },
    }).code,
  ).toBe('POST_TAIL_FINAL');
  expect(
    inspectReservePhase(a, {
      ...post,
      currentCache: { ...a.afterCache, sourceCommandId: 'OTHER' },
    }).code,
  ).toBe('POST_TAIL_CACHE');
});

it('rejects a second apply/tail and never turns postcondition checking into execution', () => {
  const { a, post } = fixture();
  expect(
    inspectReservePhase(a, {
      ...post,
      tailCalls: '2',
      deltaApplications: '2',
      cacheWrites: '2',
    }).code,
  ).toBe('POST_TAIL_NOT_ONCE');
  expect(inspectReservePhase(a, post).kind).toBe('INERT_CONSISTENT');
  expect(inspectReservePhase(a, post).kind).toBe('INERT_CONSISTENT');
  expect(post.deltaApplications).toBe('1');
});

it('rejects a later awaited barrier until a fresh phase-correct POST_TAIL recheck', () => {
  const { a, post } = fixture();
  const late = { ...post, lastBarrierOrdinal: '21' };
  expect(inspectReservePhase(a, late).code).toBe('STALE_CUTOFF');
  const fresh = {
    ...late,
    previousCutoffReal: post.cutoffReal,
    cutoffReal: '2026-10-16T00:00:16.000Z',
    cutoffOrdinal: '22',
  };
  expect(inspectReservePhase(a, fresh).kind).toBe('INERT_CONSISTENT');
  expect(fresh.tailCalls).toBe('1');
});

it('rejects stable permission or intent/source-cutoff changes instead of excusing them as own delta', () => {
  const { a, post } = fixture();
  expect(
    inspectReservePhase(a, {
      ...post,
      binding: { ...post.binding, permissionRevision: 'P2' },
    }).code,
  ).toBe('BINDING_CHANGED');
  expect(
    inspectReservePhase(a, {
      ...post,
      binding: { ...post.binding, intentSimTime: '78' },
    }).code,
  ).toBe('BINDING_CHANGED');
  expect(
    inspectReservePhase(a, { ...post, sourceCutoff: a.afterHead }).code,
  ).toBe('SOURCE_CUTOFF');
});

it('keeps original FINAL, uncertain acknowledgement/rollback and cleanup as separate inert evidence axes', () => {
  const classify = (
    phaseEvidence: string,
    finalEvidence = 'NONE',
    cleanup = 'CONFIRMED',
  ) => {
    const result = classifyReserveLifecycle({
      phaseEvidence,
      finalEvidence,
      cleanup,
    });
    const markers: {
      productionAuthority: false;
      sourceAdmitted: false;
      runtimeConnected: false;
    } = result;
    expect(markers).toMatchObject({
      productionAuthority: false,
      sourceAdmitted: false,
      runtimeConnected: false,
    });
    return result;
  };
  expect(classify('NOT_STARTED', 'EXACT_COMMITTED_FINAL').economicOutcome).toBe(
    'COMMITTED',
  );
  expect(classify('COMMIT_ACK', 'NONE', 'CLEANUP_INCOMPLETE')).toMatchObject({
    economicOutcome: 'COMMITTED',
    cleanup: 'CLEANUP_INCOMPLETE',
    stopWork: true,
    productionAuthority: false,
  });
  expect(classify('COMMIT_UNKNOWN').economicOutcome).toBe('UNKNOWN');
  expect(classify('ROLLBACK_UNCONFIRMED').economicOutcome).toBe('UNKNOWN');
  expect(
    classify('COMMIT_UNKNOWN', 'EXACT_COMMITTED_FINAL', 'CLEANUP_INCOMPLETE'),
  ).toMatchObject({
    economicOutcome: 'COMMITTED',
    cleanup: 'CLEANUP_INCOMPLETE',
    stopWork: true,
  });
  expect(classify('ROLLBACK_ACK')).toMatchObject({
    economicOutcome: 'ROLLED_BACK',
    cleanup: 'CONFIRMED',
  });
});
