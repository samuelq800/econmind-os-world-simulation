import { describe, expect, it } from 'vitest';

import {
  INTERNATIONAL_CONTRACT_FOUNDATION_STATUS,
  INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
  INTERNATIONAL_SUBTYPE_MATRIX,
  assertCompleteInternationalSubtypeMatrix,
  assertInternationalContractReplayEvidence,
  createFoundationFact,
  createInternationalContractVersion,
  recordInternationalContractApproval,
  requestInternationalContractApproval,
  transitionInternationalContractLifecycle,
  validateInternationalActivityType,
  type FoundationTraceRequest,
  type InternationalApprovalDecision,
  type InternationalApprovalRequest,
  type InternationalContractFoundationFact,
  type InternationalContractFoundationSnapshot,
  type InternationalContractVersionProposal,
  type InternationalLifecycleAction,
  type InternationalLifecycleTransitionRequest,
  type InternationalContractStatus,
} from '../../packages/core/src/index.js';

const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V22.1',
  calculationVersion: 'V22_1_FOUNDATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.22',
    sourceVersion: 'WORLD_VERSION.22',
    snapshotRef: 'SNAPSHOT.WORLD.22',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '22000', unit: 'sim_millisecond' },
};

const TERMS = Object.freeze([
  {
    termRef: 'TERM.PRICE.1',
    fieldRef: 'FIELD.UNIT_PRICE',
    valueFactRef: 'FACT.PRICE.100',
    subtypeSchemaVersionRef: 'SCHEMA.INT01.1',
  },
]);

const DRAFT: InternationalContractFoundationSnapshot = {
  contractRef: 'CONTRACT.A_B.1',
  stateRef: 'STATE.DRAFT.1',
  activityType: 'Commodity Supply Agreement',
  partyRefs: ['COUNTRY.A', 'COUNTRY.B'],
  versionRef: 'CONTRACT.A_B.1.V0',
  version: { amount: '0', unit: 'contract_version' },
  status: 'DRAFT',
  structuredTerms: TERMS,
  noteText: 'Negotiation context only.',
  requiredOfficeRefs: [],
  approvals: [],
  activeSignedVersionRef: null,
};

function fact<T>(
  factRef: string,
  payload: T,
  trace: FoundationTraceRequest = TRACE,
): InternationalContractFoundationFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.22'],
    payload,
  });
}

function offer(noteText: string | null = 'Offer context only.') {
  const currentFact = fact('FACT.CONTRACT.DRAFT.1', DRAFT);
  const proposalFact = fact<InternationalContractVersionProposal>(
    'FACT.PROPOSAL.OFFER.1',
    {
      proposalRef: 'PROPOSAL.OFFER.1',
      contractRef: DRAFT.contractRef,
      action: 'OFFER',
      predecessorVersionRef: DRAFT.versionRef,
      nextVersionRef: 'CONTRACT.A_B.1.V1',
      nextVersion: { amount: '1', unit: 'contract_version' },
      structuredTerms: TERMS,
      noteText,
    },
  );
  return {
    currentFact,
    proposalFact,
    result: createInternationalContractVersion({
      trace: TRACE,
      currentFact,
      proposalFact,
    }),
  };
}

function approvalRound() {
  const sent = offer().result.snapshot;
  const sentFact = fact('FACT.CONTRACT.SENT.1', sent);
  const requestFact = fact<InternationalApprovalRequest>(
    'FACT.APPROVAL.REQUEST.1',
    {
      requestRef: 'APPROVAL.REQUEST.1',
      contractRef: sent.contractRef,
      versionRef: sent.versionRef,
      commercialAcceptanceRef: 'ACCEPTANCE.COMMERCIAL.1',
      requiredOfficeRefs: ['OFFICE.TRADE', 'OFFICE.FINANCE'],
    },
  );
  const requested = requestInternationalContractApproval({
    trace: TRACE,
    currentFact: sentFact,
    requestFact,
  });
  const tradeFact = fact<InternationalApprovalDecision>(
    'FACT.APPROVAL.DECISION.TRADE.1',
    {
      decisionRef: 'APPROVAL.DECISION.TRADE.1',
      contractRef: sent.contractRef,
      versionRef: sent.versionRef,
      officeRef: 'OFFICE.TRADE',
      decision: 'APPROVED',
    },
  );
  const trade = recordInternationalContractApproval({
    trace: TRACE,
    currentFact: fact('FACT.CONTRACT.AWAITING.1', requested.snapshot),
    decisionFact: tradeFact,
  });
  const financeFact = fact<InternationalApprovalDecision>(
    'FACT.APPROVAL.DECISION.FINANCE.1',
    {
      decisionRef: 'APPROVAL.DECISION.FINANCE.1',
      contractRef: sent.contractRef,
      versionRef: sent.versionRef,
      officeRef: 'OFFICE.FINANCE',
      decision: 'APPROVED',
    },
  );
  const approved = recordInternationalContractApproval({
    trace: TRACE,
    currentFact: fact('FACT.CONTRACT.TRADE_APPROVED.1', trade.snapshot),
    decisionFact: financeFact,
  });
  return { sent, sentFact, requestFact, requested, trade, approved };
}

function lifecycle(
  current: InternationalContractFoundationSnapshot,
  action: InternationalLifecycleAction,
  targetStatus: InternationalContractStatus,
  sequence: string,
  previouslyAppliedTransitionRefs: readonly string[] = [],
) {
  const transitionRef = `LIFECYCLE.${sequence}`;
  return transitionInternationalContractLifecycle({
    trace: TRACE,
    currentFact: fact(`FACT.CONTRACT.${sequence}.BEFORE`, current),
    transitionFact: fact<InternationalLifecycleTransitionRequest>(
      `FACT.LIFECYCLE.${sequence}`,
      {
        transitionRef,
        contractRef: current.contractRef,
        predecessorStateRef: current.stateRef,
        action,
        targetStatus,
        reasonFactRef: `FACT.REASON.${sequence}`,
        effectiveAt: TRACE.snapshotAt,
        previouslyAppliedTransitionRefs,
      },
    ),
  });
}

describe('V22.1 international contract foundation', () => {
  it('locks the exact ordered 23-type Master matrix without claiming subtype executors', () => {
    const matrix = assertCompleteInternationalSubtypeMatrix([
      ...INTERNATIONAL_SUBTYPE_MATRIX,
    ]);
    expect(matrix).toHaveLength(23);
    expect(matrix[0]).toMatchObject({
      subtypeId: 'INT-01',
      activityType: 'Commodity Supply Agreement',
      coverage: INTERNATIONAL_SUBTYPE_FOUNDATION_COVERAGE,
    });
    expect(matrix[22]).toMatchObject({
      subtypeId: 'INT-23',
      activityType: 'Trade Dispute Settlement',
    });
    expect(() =>
      assertCompleteInternationalSubtypeMatrix(matrix.slice(0, 22)),
    ).toThrow('exactly 23');
    expect(() =>
      assertCompleteInternationalSubtypeMatrix([...matrix].reverse()),
    ).toThrow('fixed Master order');
    expect(() =>
      assertCompleteInternationalSubtypeMatrix([
        { ...matrix[0]!, coverage: 'EXECUTOR_COMPLETE' as never },
        ...matrix.slice(1),
      ]),
    ).toThrow('fixed Master order');
    expect(() =>
      validateInternationalActivityType('Unknown Agreement'),
    ).toThrow('fixed 23-type matrix');
  });

  it('creates exact immutable versions and keeps note text economically inert', () => {
    const first = offer('One negotiation note.');
    const second = offer('A different negotiation note.');

    expect(first.result).toMatchObject({
      foundationStatus: INTERNATIONAL_CONTRACT_FOUNDATION_STATUS,
      snapshot: {
        versionRef: 'CONTRACT.A_B.1.V1',
        version: { amount: '1', unit: 'contract_version' },
        status: 'SENT',
        requiredOfficeRefs: [],
        approvals: [],
      },
      versionTransition: {
        before: { amount: '0', unit: 'contract_version' },
        delta: { amount: '1', unit: 'contract_version' },
        after: { amount: '1', unit: 'contract_version' },
      },
    });
    expect(second.result.snapshot.structuredTerms).toEqual(
      first.result.snapshot.structuredTerms,
    );
    expect(second.result.snapshot.status).toBe(first.result.snapshot.status);
    expect(second.result.snapshot.noteText).not.toBe(
      first.result.snapshot.noteText,
    );
    assertInternationalContractReplayEvidence(first.result.replayProof, [
      first.currentFact,
      first.proposalFact,
    ]);
  });

  it('binds every office approval to one version and rejects stale decisions', () => {
    const round = approvalRound();
    expect(round.requested.snapshot).toMatchObject({
      status: 'AWAITING_INTERNAL_APPROVAL',
      versionRef: 'CONTRACT.A_B.1.V1',
    });
    expect(round.requested.snapshot.approvals).toHaveLength(2);
    expect(round.trade.snapshot.status).toBe('AWAITING_INTERNAL_APPROVAL');
    expect(round.approved.snapshot.status).toBe('APPROVED');
    expect(
      round.approved.snapshot.approvals.every(
        (entry) => entry.status === 'APPROVED',
      ),
    ).toBe(true);

    const rejected = recordInternationalContractApproval({
      trace: TRACE,
      currentFact: fact(
        'FACT.CONTRACT.AWAITING.REJECTION',
        round.requested.snapshot,
      ),
      decisionFact: fact<InternationalApprovalDecision>(
        'FACT.APPROVAL.DECISION.REJECTED',
        {
          decisionRef: 'APPROVAL.DECISION.REJECTED',
          contractRef: round.sent.contractRef,
          versionRef: round.sent.versionRef,
          officeRef: 'OFFICE.TRADE',
          decision: 'REJECTED',
        },
      ),
    });
    expect(rejected.snapshot.status).toBe('NEGOTIATING');

    expect(() =>
      recordInternationalContractApproval({
        trace: TRACE,
        currentFact: fact(
          'FACT.CONTRACT.AWAITING.STALE',
          round.requested.snapshot,
        ),
        decisionFact: fact<InternationalApprovalDecision>(
          'FACT.APPROVAL.DECISION.STALE',
          {
            decisionRef: 'APPROVAL.DECISION.STALE',
            contractRef: round.sent.contractRef,
            versionRef: DRAFT.versionRef,
            officeRef: 'OFFICE.TRADE',
            decision: 'APPROVED',
          },
        ),
      }),
    ).toThrow('exact contract version');
  });

  it('invalidates predecessor approvals when a counteroffer creates a new version', () => {
    const approved = approvalRound().approved.snapshot;
    const counter = createInternationalContractVersion({
      trace: TRACE,
      currentFact: fact('FACT.CONTRACT.APPROVED.1', approved),
      proposalFact: fact<InternationalContractVersionProposal>(
        'FACT.PROPOSAL.COUNTER.2',
        {
          proposalRef: 'PROPOSAL.COUNTER.2',
          contractRef: approved.contractRef,
          action: 'COUNTEROFFER',
          predecessorVersionRef: approved.versionRef,
          nextVersionRef: 'CONTRACT.A_B.1.V2',
          nextVersion: { amount: '2', unit: 'contract_version' },
          structuredTerms: [
            {
              ...TERMS[0]!,
              termRef: 'TERM.PRICE.2',
              valueFactRef: 'FACT.PRICE.95',
            },
          ],
          noteText: null,
        },
      ),
    });

    expect(counter.snapshot).toMatchObject({
      versionRef: 'CONTRACT.A_B.1.V2',
      version: { amount: '2', unit: 'contract_version' },
      status: 'COUNTEROFFER',
      approvals: [],
      requiredOfficeRefs: [],
    });
    expect(counter.invalidatedApprovalRefs).toEqual(
      approved.approvals.map((approval) => approval.approvalRef),
    );
  });

  it('enforces explicit sign, active, suspend, dispute, default and terminal edges', () => {
    const approved = approvalRound().approved.snapshot;
    const signed = lifecycle(approved, 'SIGN', 'SIGNED', 'SIGN.1').snapshot;
    expect(signed.activeSignedVersionRef).toBe(signed.versionRef);
    const active = lifecycle(
      signed,
      'ACTIVATE',
      'ACTIVE',
      'ACTIVATE.1',
    ).snapshot;
    const suspended = lifecycle(
      active,
      'SUSPEND',
      'SUSPENDED',
      'SUSPEND.1',
    ).snapshot;
    const resumed = lifecycle(
      suspended,
      'RESUME',
      'ACTIVE',
      'RESUME.1',
    ).snapshot;
    const disputed = lifecycle(
      resumed,
      'FILE_DISPUTE',
      'DISPUTED',
      'DISPUTE.1',
    ).snapshot;
    const partialDefault = lifecycle(
      disputed,
      'REPORT_PARTIAL_DEFAULT',
      'PARTIALLY_DEFAULTED',
      'PARTIAL_DEFAULT.1',
    ).snapshot;
    const defaulted = lifecycle(
      partialDefault,
      'REPORT_DEFAULT',
      'DEFAULTED',
      'DEFAULT.1',
    ).snapshot;
    expect(
      lifecycle(defaulted, 'TERMINATE', 'TERMINATED', 'TERMINATE.1').snapshot
        .status,
    ).toBe('TERMINATED');

    expect(() =>
      lifecycle(offer().result.snapshot, 'SIGN', 'SIGNED', 'BAD_SIGN'),
    ).toThrow('cannot move');
    expect(() => lifecycle(active, 'ACTIVATE', 'ACTIVE', 'BAD_EDGE')).toThrow(
      'cannot move',
    );
    expect(() =>
      lifecycle(active, 'SUSPEND', 'SUSPENDED', 'DUPLICATE', [
        'LIFECYCLE.DUPLICATE',
      ]),
    ).toThrow('already applied');
  });

  it('rejects prose as a structured value, skipped versions, and unknown actions', () => {
    const base = offer();
    expect(() =>
      createInternationalContractVersion({
        trace: TRACE,
        currentFact: base.currentFact,
        proposalFact: fact<InternationalContractVersionProposal>(
          'FACT.PROPOSAL.PROSE',
          {
            ...base.proposalFact.payload,
            proposalRef: 'PROPOSAL.PROSE',
            structuredTerms: [
              { ...TERMS[0]!, valueFactRef: 'pay 100 immediately' },
            ],
          },
        ),
      }),
    ).toThrow('stable reference');
    expect(() =>
      createInternationalContractVersion({
        trace: TRACE,
        currentFact: base.currentFact,
        proposalFact: fact<InternationalContractVersionProposal>(
          'FACT.PROPOSAL.SKIP',
          {
            ...base.proposalFact.payload,
            proposalRef: 'PROPOSAL.SKIP',
            nextVersion: { amount: '2', unit: 'contract_version' },
          },
        ),
      }),
    ).toThrow('increase by exactly one');

    const active = lifecycle(
      lifecycle(approvalRound().approved.snapshot, 'SIGN', 'SIGNED', 'SIGN.2')
        .snapshot,
      'ACTIVATE',
      'ACTIVE',
      'ACTIVATE.2',
    ).snapshot;
    expect(() =>
      lifecycle(active, 'DELETE' as never, 'TERMINATED', 'UNKNOWN_ACTION'),
    ).toThrow('Unknown international contract lifecycle action');
  });

  it('rejects tampered payloads and mixed snapshot lineage during replay', () => {
    const created = offer();
    expect(() =>
      assertInternationalContractReplayEvidence(created.result.replayProof, [
        created.currentFact,
        {
          ...created.proposalFact,
          payload: { ...created.proposalFact.payload, noteText: 'tampered' },
        },
      ]),
    ).toThrow('canonical payload');

    const staleTrace: FoundationTraceRequest = {
      ...TRACE,
      snapshot: {
        ...TRACE.snapshot,
        sourceVersion: 'WORLD_VERSION.21',
        snapshotHash: 'c'.repeat(64),
      },
    };
    expect(() =>
      createInternationalContractVersion({
        trace: TRACE,
        currentFact: created.currentFact,
        proposalFact: fact(
          'FACT.PROPOSAL.STALE',
          created.proposalFact.payload,
          staleTrace,
        ),
      }),
    ).toThrow('mixed lineage/version/snapshot evidence');
  });
});
