import { describe, expect, it } from 'vitest';

import {
  createFoundationFact,
  type FoundationFact,
} from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  assertCrisisCauseReplay,
  prepareCrisisCauseAction,
  type CrisisActionStatement,
  type CrisisAuthorizationStatement,
  type CrisisCauseStatement,
  type CrisisComposerInput,
  type CrisisStateSnapshot,
} from '../../packages/core/src/engine-kernels/crisis-cause-composer-foundation.js';

const trace = {
  traceRef: 'TRACE.V24.2',
  calculationVersion: 'CRISIS.CAUSE.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.24',
    sourceVersion: 'WORLD_VERSION.24',
    snapshotRef: 'SNAPSHOT.WORLD.24',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '24000', unit: 'sim_millisecond' },
} as const;
const qty = (amount: string, unit = 'unit_per_day') => ({ amount, unit });
const cash = (amount: string, currency = 'GCU') => ({ amount, currency });

function fact<T>(
  factRef: string,
  payload: T,
  predecessors: readonly string[] = ['GENESIS.WORLD.24'],
): FoundationFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: predecessors,
    payload,
  });
}

function refact<T>(prior: FoundationFact<T>, payload: T): FoundationFact<T> {
  return fact(prior.factRef, payload, prior.predecessorFactRefs);
}

const baseState: CrisisStateSnapshot = {
  worldRef: 'WORLD.1',
  seasonRef: 'SEASON.1',
  crisisRef: 'CRISIS.1',
  stateVersionRef: 'STATE.V1',
  seasonStatus: 'ACTIVE',
  lifecycleStatus: 'INACTIVE',
  clockMode: 'RUNNING',
  atSimTime: trace.snapshotAt,
  appliedActionRefs: [],
  causeFactRefs: [],
};
const resourceCause: CrisisCauseStatement = {
  causeRef: 'CAUSE.RESOURCE.1',
  actionRef: 'ACTION.1',
  kind: 'RESOURCE_EXTRACTION_OUTAGE',
  targetField: 'EXTRACTION_CAPACITY',
  targetOwnerRef: 'OWNER.RESOURCE',
  targetObjectRef: 'DEPOSIT.1',
  before: qty('100'),
  delta: qty('-20'),
  sourceReceiptRef: 'RECEIPT.CAUSE.RESOURCE',
  scenarioEvidenceRef: null,
};
const bankingCause: CrisisCauseStatement = {
  causeRef: 'CAUSE.BANK.1',
  actionRef: 'ACTION.1',
  kind: 'BANKING_ASSET_LOSS',
  targetField: 'LOAN_ASSET_VALUE',
  targetOwnerRef: 'OWNER.BANK',
  targetObjectRef: 'LOAN.PORTFOLIO.1',
  before: cash('100'),
  delta: cash('-10'),
  sourceReceiptRef: 'RECEIPT.CAUSE.BANK',
  scenarioEvidenceRef: null,
};

function input(
  actionKind: CrisisActionStatement['action'] = 'START_CRISIS',
  state: CrisisStateSnapshot = baseState,
): CrisisComposerInput {
  const stateFact = fact('FACT.STATE', state);
  const causeFacts =
    actionKind === 'START_CRISIS'
      ? [
          fact('FACT.CAUSE.RESOURCE', resourceCause),
          fact('FACT.CAUSE.BANK', bankingCause),
        ]
      : [];
  const action: CrisisActionStatement = {
    actionRef: 'ACTION.1',
    actionVersionRef: 'ACTION.VERSION.1',
    action: actionKind,
    worldRef: 'WORLD.1',
    seasonRef: 'SEASON.1',
    crisisRef: 'CRISIS.1',
    expectedStateVersionRef: state.stateVersionRef,
    nextStateVersionRef: 'STATE.V2',
    atSimTime: trace.snapshotAt,
    reasonRef: 'REASON.1',
    causeFactRefs: causeFacts.map((item) => item.factRef),
  };
  const authorization: CrisisAuthorizationStatement = {
    actionRef: 'ACTION.1',
    actionVersionRef: 'ACTION.VERSION.1',
    actorRef: 'ADMIN.1',
    worldRef: 'WORLD.1',
    seasonRef: 'SEASON.1',
    serverAuthorizationRef: 'SERVER.AUTH.1',
    membershipRef: 'MEMBERSHIP.1',
    adminEntitlementRef: 'ENTITLEMENT.ADMIN.1',
    decision: 'AUTHORIZED',
    requiredApprovalRefs: ['REQUIREMENT.ADMIN', 'REQUIREMENT.CAPTAIN'],
    approvals: [
      {
        approvalRef: 'APPROVAL.ADMIN.1',
        requirementRef: 'REQUIREMENT.ADMIN',
        versionRef: 'ACTION.VERSION.1',
        actorRef: 'ADMIN.1',
        status: 'APPROVED',
        decisionRef: 'DECISION.ADMIN.1',
      },
      {
        approvalRef: 'APPROVAL.CAPTAIN.1',
        requirementRef: 'REQUIREMENT.CAPTAIN',
        versionRef: 'ACTION.VERSION.1',
        actorRef: 'CAPTAIN.1',
        status: 'APPROVED',
        decisionRef: 'DECISION.CAPTAIN.1',
      },
    ],
  };
  const authorizationFact = fact('FACT.AUTHORIZATION', authorization);
  const actionFact = fact('FACT.ACTION', action, [
    stateFact.factRef,
    authorizationFact.factRef,
    ...action.causeFactRefs,
  ]);
  return { trace, stateFact, actionFact, authorizationFact, causeFacts };
}

describe('V24.2 crisis/Admin cause-layer pure preparation', () => {
  it('proposes start and exact bottom-layer resource/bank loss without macro edits', () => {
    const request = input();
    const result = prepareCrisisCauseAction(request);
    expect(result.status).toBe('PREPARATION_ONLY');
    expect(result.afterCandidate.lifecycleStatus).toBe('ACTIVE');
    expect(result.afterCandidate.atSimTime).toEqual(trace.snapshotAt);
    expect(result.causeTransitions.map((item) => item.after)).toEqual([
      cash('90'),
      qty('80'),
    ]);
    expect(result.candidateEvents.map((item) => item.kind)).toEqual([
      'CRISIS_START_REQUESTED',
      'SHOCK_CAUSE_REQUESTED',
      'SHOCK_CAUSE_REQUESTED',
    ]);
    expect(
      result.causeTransitions.every(
        (item) =>
          item.causalFactRefs.includes('FACT.ACTION') &&
          item.sourceReceiptRef.startsWith('RECEIPT.CAUSE.'),
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"(GDP|INFLATION|SCORE)"/);
    assertCrisisCauseReplay(request, result);
    expect(prepareCrisisCauseAction(request)).toEqual(result);
  });

  it('ends a crisis without silently reversing prior engine-owned damage', () => {
    const active: CrisisStateSnapshot = {
      ...baseState,
      lifecycleStatus: 'ACTIVE',
      causeFactRefs: ['FACT.CAUSE.OLD'],
    };
    const result = prepareCrisisCauseAction(input('END_CRISIS', active));
    expect(result.afterCandidate.lifecycleStatus).toBe('ENDED');
    expect(result.afterCandidate.causeFactRefs).toEqual(['FACT.CAUSE.OLD']);
    expect(result.causeTransitions).toEqual([]);
    expect(result.candidateEvents[0]?.kind).toBe('CRISIS_END_REQUESTED');
  });

  it('proposes pause and resume at identical frozen SimTime with no catch-up', () => {
    const pause = prepareCrisisCauseAction(input('PAUSE_WORLD'));
    expect(pause.afterCandidate.clockMode).toBe('PAUSED');
    expect(pause.afterCandidate.atSimTime).toEqual(trace.snapshotAt);
    expect(pause.candidateEvents[0]?.kind).toBe('CLOCK_PAUSE_REQUESTED');
    const paused: CrisisStateSnapshot = { ...baseState, clockMode: 'PAUSED' };
    const resume = prepareCrisisCauseAction(input('RESUME_WORLD', paused));
    expect(resume.afterCandidate.clockMode).toBe('RUNNING');
    expect(resume.afterCandidate.atSimTime).toEqual(trace.snapshotAt);
    expect(resume.candidateEvents[0]?.kind).toBe('CLOCK_RESUME_REQUESTED');
  });

  it('rejects missing, stale, rejected or duplicated approvals', () => {
    const request = input();
    for (const approvals of [
      request.authorizationFact.payload.approvals.slice(0, 1),
      request.authorizationFact.payload.approvals.map((item) => ({
        ...item,
        versionRef: 'ACTION.VERSION.OLD',
      })),
      request.authorizationFact.payload.approvals.map((item) => ({
        ...item,
        status: 'REJECTED' as const,
      })),
      request.authorizationFact.payload.approvals.map((item) => ({
        ...item,
        approvalRef: 'APPROVAL.DUPLICATE',
      })),
    ]) {
      const auth = refact(request.authorizationFact, {
        ...request.authorizationFact.payload,
        approvals,
      });
      expect(() =>
        prepareCrisisCauseAction({ ...request, authorizationFact: auth }),
      ).toThrow();
    }
    const denied = refact(request.authorizationFact, {
      ...request.authorizationFact.payload,
      decision: 'DENIED',
    });
    expect(() =>
      prepareCrisisCauseAction({ ...request, authorizationFact: denied }),
    ).toThrow();
  });

  it('rejects duplicate action, stale version, invalid state and wrong clock transition', () => {
    const request = input();
    expect(() =>
      prepareCrisisCauseAction(
        input('START_CRISIS', {
          ...baseState,
          appliedActionRefs: ['ACTION.1'],
        }),
      ),
    ).toThrow();
    const stale = refact(request.actionFact, {
      ...request.actionFact.payload,
      expectedStateVersionRef: 'STATE.OLD',
    });
    expect(() =>
      prepareCrisisCauseAction({ ...request, actionFact: stale }),
    ).toThrow();
    expect(() =>
      prepareCrisisCauseAction(
        input('START_CRISIS', { ...baseState, seasonStatus: 'ENDED' }),
      ),
    ).toThrow();
    expect(() => prepareCrisisCauseAction(input('RESUME_WORLD'))).toThrow();
    expect(() => prepareCrisisCauseAction(input('END_CRISIS'))).toThrow();
    expect(() =>
      prepareCrisisCauseAction(
        input('END_CRISIS', { ...baseState, lifecycleStatus: 'ACTIVE' }),
      ),
    ).toThrow();
  });

  it('rejects direct macro target, positive loss, excessive loss and mismatched units', () => {
    const request = input();
    const source = request.causeFacts[0]!;
    const variants: CrisisCauseStatement[] = [
      {
        ...resourceCause,
        kind: 'GDP_DIRECT_SET' as CrisisCauseStatement['kind'],
        targetField: 'GDP' as CrisisCauseStatement['targetField'],
      },
      { ...resourceCause, delta: qty('20') },
      { ...resourceCause, delta: qty('-101') },
      { ...resourceCause, delta: qty('-20', 'other_unit') },
    ];
    for (const variant of variants) {
      const changed = refact(source, variant);
      expect(() =>
        prepareCrisisCauseAction({
          ...request,
          causeFacts: [changed, request.causeFacts[1]!],
        }),
      ).toThrow();
    }
    const duplicateReceipt = refact(request.causeFacts[1]!, {
      ...bankingCause,
      sourceReceiptRef: resourceCause.sourceReceiptRef,
    });
    expect(() =>
      prepareCrisisCauseAction({
        ...request,
        causeFacts: [request.causeFacts[0]!, duplicateReceipt],
      }),
    ).toThrow();
  });

  it('requires explicit scenario evidence before proposing population displacement', () => {
    const request = input();
    const source = request.causeFacts[0]!;
    const displaced: CrisisCauseStatement = {
      ...resourceCause,
      kind: 'POPULATION_DISPLACEMENT',
      targetField: 'RESIDENT_POPULATION',
      before: qty('1000', 'person'),
      delta: qty('-10', 'person'),
      scenarioEvidenceRef: null,
    };
    expect(() =>
      prepareCrisisCauseAction({
        ...request,
        causeFacts: [refact(source, displaced), request.causeFacts[1]!],
      }),
    ).toThrow();
    const valid = refact(source, {
      ...displaced,
      scenarioEvidenceRef: 'SCENARIO.CASUALTY.1',
    });
    const result = prepareCrisisCauseAction({
      ...request,
      causeFacts: [valid, request.causeFacts[1]!],
    });
    expect(
      result.causeTransitions.find(
        (item) => item.kind === 'POPULATION_DISPLACEMENT',
      )?.after,
    ).toEqual(qty('990', 'person'));
  });

  it('rejects forged fact payload, mixed snapshot and rewritten replay economics', () => {
    const request = input();
    const forged = {
      ...request.causeFacts[0]!,
      payload: { ...resourceCause, delta: qty('-90') },
    };
    expect(() =>
      prepareCrisisCauseAction({
        ...request,
        causeFacts: [forged, request.causeFacts[1]!],
      }),
    ).toThrow();
    const mixed = {
      ...request.stateFact,
      snapshot: { ...trace.snapshot, snapshotHash: 'c'.repeat(64) },
    };
    expect(() =>
      prepareCrisisCauseAction({ ...request, stateFact: mixed }),
    ).toThrow();
    const result = prepareCrisisCauseAction(request);
    expect(() =>
      assertCrisisCauseReplay(request, {
        ...result,
        afterCandidate: { ...result.afterCandidate, clockMode: 'PAUSED' },
      }),
    ).toThrow();
  });
});
