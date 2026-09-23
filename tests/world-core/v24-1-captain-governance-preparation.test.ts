import { describe, expect, it } from 'vitest';

import {
  CAPTAIN_GOVERNANCE_PREPARATION_STATUS,
  assertCaptainGovernanceReplayEvidence,
  canonicalHashInput,
  createFoundationFact,
  prepareCabinetAgendaChange,
  prepareCabinetCoordination,
  prepareCaptainPriorityChange,
  prepareCaptainProposalDecision,
  prepareCaptainStrategyChange,
  prepareGovernmentCommitment,
  preparePoliticalCapitalAllocation,
  type CabinetAgendaIssue,
  type CabinetAgendaSnapshot,
  type CabinetConflictSnapshot,
  type CabinetCoordinationRequest,
  type CabinetProposalSnapshot,
  type CaptainGovernanceFact,
  type CaptainProposalDecisionRequest,
  type FoundationTraceRequest,
  type GovernmentCommitmentRequest,
  type NationalPrioritySnapshot,
  type NationalStrategySnapshot,
  type PoliticalCapitalAllocationRequest,
  type PoliticalCapitalSnapshot,
  type PriorityChangeRequest,
  type StrategyChangeRequest,
} from '../../packages/core/src/index.js';

const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V24.1',
  calculationVersion: 'V24_1_CAPTAIN_PREPARATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.24',
    sourceVersion: 'WORLD.VERSION.24',
    snapshotRef: 'SNAPSHOT.WORLD.24',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '24000', unit: 'sim_millisecond' },
};

const Q = (amount: string, unit: string) => ({ amount, unit }) as const;
const MONEY = (amount: string, currency: string) =>
  ({ amount, currency }) as const;

function fact<T>(
  factRef: string,
  payload: T,
  trace: FoundationTraceRequest = TRACE,
): CaptainGovernanceFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.24'],
    payload,
  });
}

function capital(sequence: string) {
  return fact<PoliticalCapitalSnapshot>(`FACT.CAPITAL.${sequence}`, {
    capitalRef: `CAPITAL.${sequence}`,
    countryRef: 'COUNTRY.A',
    opening: Q('90', 'political_capital'),
    generated: Q('10', 'political_capital'),
    total: Q('100', 'political_capital'),
    available: Q('80', 'political_capital'),
    spent: Q('20', 'political_capital'),
    closing: Q('80', 'political_capital'),
    buckets: [
      { bucket: 'FISCAL_REFORM', balance: Q('10', 'political_capital') },
      {
        bucket: 'INDUSTRIAL_STRATEGY',
        balance: Q('15', 'political_capital'),
      },
      {
        bucket: 'TRADE_NEGOTIATIONS',
        balance: Q('10', 'political_capital'),
      },
      {
        bucket: 'SOCIAL_REFORM_PROTECTION',
        balance: Q('10', 'political_capital'),
      },
      {
        bucket: 'STRATEGIC_PROJECT_SUPPORT',
        balance: Q('10', 'political_capital'),
      },
      { bucket: 'CRISIS_RESPONSE', balance: Q('10', 'political_capital') },
      {
        bucket: 'UNALLOCATED_CRISIS_RESERVE',
        balance: Q('15', 'political_capital'),
      },
    ],
  });
}

function issue(
  sequence: string,
  status: CabinetAgendaIssue['status'] = 'ACTIVE',
): CabinetAgendaIssue {
  return {
    issueRef: `AGENDA.ISSUE.${sequence}`,
    titleRef: `TITLE.${sequence}`,
    category: 'INDUSTRY',
    priority: 'HIGH',
    problemFactRef: `FACT.PROBLEM.${sequence}`,
    targetFactRef: `FACT.TARGET.${sequence}`,
    leadOffice: 'INDUSTRY',
    supportingOffices: ['FINANCE'],
    constraintFactRefs: [`FACT.CONSTRAINT.${sequence}`],
    targetAt: Q('30000', 'sim_millisecond'),
    requiresProposal: true,
    status,
    notesRef: `NOTE.${sequence}`,
  };
}

describe('V24.1 Captain governance preparation', () => {
  it('changes strategy with exact political-capital cost and no macro mutation', () => {
    const strategy = fact<NationalStrategySnapshot>('FACT.STRATEGY.1', {
      strategyRef: 'STRATEGY.1',
      countryRef: 'COUNTRY.A',
      primary: 'TECHNOLOGY_LEADERSHIP',
      supporting: 'GREEN_TRANSITION',
      status: 'ACTIVE',
      effectiveAt: Q('20000', 'sim_millisecond'),
      reviewAt: Q('28000', 'sim_millisecond'),
    });
    const capitalFact = capital('STRATEGY');
    const request = fact<StrategyChangeRequest>('FACT.STRATEGY.CHANGE', {
      actionRef: 'ACTION.STRATEGY.CHANGE',
      countryRef: 'COUNTRY.A',
      action: 'CHANGE_PRIMARY',
      nextPrimary: 'INFRASTRUCTURE_LED_GROWTH',
      nextSupporting: 'GREEN_TRANSITION',
      reasonFactRef: 'FACT.REASON.STRATEGY',
      crisisFactRef: null,
      politicalCapitalBucket: 'INDUSTRIAL_STRATEGY',
      politicalCapitalCost: Q('5', 'political_capital'),
      effectiveAt: TRACE.snapshotAt,
      reviewAt: Q('30000', 'sim_millisecond'),
    });
    const result = prepareCaptainStrategyChange({
      trace: TRACE,
      strategyFact: strategy,
      capitalFact,
      requestFact: request,
    });
    expect(result).toMatchObject({
      preparationStatus: CAPTAIN_GOVERNANCE_PREPARATION_STATUS,
      authoritativeEconomicMutation: false,
      output: {
        strategy: { primary: 'INFRASTRUCTURE_LED_GROWTH' },
        capital: {
          total: Q('100', 'political_capital'),
          available: Q('75', 'political_capital'),
          spent: Q('25', 'political_capital'),
          closing: Q('75', 'political_capital'),
        },
      },
    });
    expect(result.transitions).toHaveLength(4);
    expect(JSON.stringify(result.output)).not.toMatch(
      /gdp|productivity|taxRate|policyRate/u,
    );
    assertCaptainGovernanceReplayEvidence(result.replayProof, [
      strategy,
      capitalFact,
      request,
    ]);

    expect(() =>
      prepareCaptainStrategyChange({
        trace: TRACE,
        strategyFact: strategy,
        capitalFact,
        requestFact: fact('FACT.STRATEGY.MACRO', {
          ...request.payload,
          actionRef: 'ACTION.STRATEGY.MACRO',
          taxRateAfter: '0.3',
        } as never),
      }),
    ).toThrow('direct economic mutation');
  });

  it('requires distinct primary/secondary priorities and a fixed change reason', () => {
    const current = fact<NationalPrioritySnapshot>('FACT.PRIORITY.1', {
      priorityRef: 'PRIORITY.1',
      countryRef: 'COUNTRY.A',
      primary: 'PRICE_STABILITY',
      secondary: 'EMPLOYMENT',
      effectiveAt: Q('20000', 'sim_millisecond'),
    });
    const capitalFact = capital('PRIORITY');
    const request = fact<PriorityChangeRequest>('FACT.PRIORITY.CHANGE', {
      actionRef: 'ACTION.PRIORITY.CHANGE',
      countryRef: 'COUNTRY.A',
      nextPrimary: 'EMPLOYMENT',
      nextSecondary: 'FISCAL_SUSTAINABILITY',
      reason: 'DETERIORATION',
      reasonFactRef: 'FACT.REASON.PRIORITY',
      politicalCapitalBucket: 'UNALLOCATED_CRISIS_RESERVE',
      politicalCapitalCost: Q('2', 'political_capital'),
      effectiveAt: TRACE.snapshotAt,
    });
    expect(
      prepareCaptainPriorityChange({
        trace: TRACE,
        priorityFact: current,
        capitalFact,
        requestFact: request,
      }).output,
    ).toMatchObject({
      priority: {
        primary: 'EMPLOYMENT',
        secondary: 'FISCAL_SUSTAINABILITY',
      },
      capital: { available: Q('78', 'political_capital') },
    });
    expect(() =>
      prepareCaptainPriorityChange({
        trace: TRACE,
        priorityFact: current,
        capitalFact,
        requestFact: fact('FACT.PRIORITY.BAD', {
          ...request.payload,
          actionRef: 'ACTION.PRIORITY.BAD',
          nextSecondary: 'EMPLOYMENT',
        }),
      }),
    ).toThrow('must differ');
    expect(() =>
      prepareCaptainPriorityChange({
        trace: TRACE,
        priorityFact: current,
        capitalFact,
        requestFact: fact('FACT.PRIORITY.NOOP', {
          ...request.payload,
          actionRef: 'ACTION.PRIORITY.NOOP',
          nextPrimary: current.payload.primary,
          nextSecondary: current.payload.secondary,
        }),
      }),
    ).toThrow('must alter');
  });

  it('reallocates political capital exactly without creating or spending it', () => {
    const capitalFact = capital('ALLOCATION');
    const request = fact<PoliticalCapitalAllocationRequest>(
      'FACT.CAPITAL.ALLOCATION.REQUEST',
      {
        allocationRef: 'ALLOCATION.CAPITAL.1',
        countryRef: 'COUNTRY.A',
        fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
        toBucket: 'CRISIS_RESPONSE',
        amount: Q('3', 'political_capital'),
        reasonFactRef: 'FACT.REASON.ALLOCATION',
        effectiveAt: TRACE.snapshotAt,
      },
    );
    const result = preparePoliticalCapitalAllocation({
      trace: TRACE,
      capitalFact,
      requestFact: request,
    });
    expect(result.output.capital).toMatchObject({
      total: Q('100', 'political_capital'),
      available: Q('80', 'political_capital'),
      spent: Q('20', 'political_capital'),
      closing: Q('80', 'political_capital'),
    });
    expect(
      result.output.capital.buckets.find(
        (entry) => entry.bucket === 'UNALLOCATED_CRISIS_RESERVE',
      )?.balance,
    ).toEqual(Q('12', 'political_capital'));
    expect(
      result.output.capital.buckets.find(
        (entry) => entry.bucket === 'CRISIS_RESPONSE',
      )?.balance,
    ).toEqual(Q('13', 'political_capital'));
    expect(result.transitions).toHaveLength(2);
  });

  it('enforces at most three active Cabinet issues', () => {
    const agenda = fact<CabinetAgendaSnapshot>('FACT.AGENDA.1', {
      agendaRef: 'AGENDA.1',
      countryRef: 'COUNTRY.A',
      issues: [issue('ONE'), issue('TWO')],
    });
    const capitalFact = capital('AGENDA');
    const request = fact('FACT.AGENDA.CHANGE', {
      actionRef: 'ACTION.AGENDA.CREATE',
      countryRef: 'COUNTRY.A',
      action: 'CREATE' as const,
      issue: issue('THREE'),
      politicalCapitalBucket: 'UNALLOCATED_CRISIS_RESERVE' as const,
      politicalCapitalCost: Q('1', 'political_capital'),
      effectiveAt: TRACE.snapshotAt,
    });
    expect(
      prepareCabinetAgendaChange({
        trace: TRACE,
        agendaFact: agenda,
        capitalFact,
        requestFact: request,
      }).output.agenda.issues,
    ).toHaveLength(3);
    expect(() =>
      prepareCabinetAgendaChange({
        trace: TRACE,
        agendaFact: fact('FACT.AGENDA.THREE', {
          ...agenda.payload,
          agendaRef: 'AGENDA.THREE',
          issues: [issue('ONE'), issue('TWO'), issue('THREE')],
        }),
        capitalFact,
        requestFact: fact('FACT.AGENDA.FOUR', {
          ...request.payload,
          actionRef: 'ACTION.AGENDA.FOUR',
          issue: issue('FOUR'),
        }),
      }),
    ).toThrow('at most three active issues');
  });

  it('binds Captain proposal decisions to the exact version and required approvals', () => {
    const proposal = fact<CabinetProposalSnapshot>('FACT.PROPOSAL.1', {
      proposalRef: 'PROPOSAL.1',
      countryRef: 'COUNTRY.A',
      version: Q('1', 'proposal_version'),
      status: 'SUBMITTED',
      ownerOffice: 'INDUSTRY',
      supportingOffices: ['FINANCE'],
      agendaIssueRef: 'AGENDA.ISSUE.ONE',
      objectiveFactRef: 'FACT.OBJECTIVE.PROPOSAL',
      settingsFactRef: 'FACT.OWNER.SETTINGS.PROPOSAL',
      fiscalCost: MONEY('50', 'GCU'),
      fxCost: MONEY('10', 'USD'),
      politicalCost: Q('3', 'political_capital'),
      administrativeBurden: Q('4', 'administrative_capacity'),
      commodityRequirementFactRefs: ['FACT.COMMODITY.REQUIREMENT'],
      labourRequirementFactRefs: ['FACT.LABOUR.REQUIREMENT'],
      technologyPrerequisiteFactRefs: ['FACT.TECHNOLOGY.PREREQUISITE'],
      riskFactRefs: ['FACT.RISK.PROPOSAL'],
      dependencyFactRefs: ['FACT.DEPENDENCY.PROPOSAL'],
      requiredApprovalOffices: ['FINANCE', 'CAPTAIN'],
      optionalSupportOffices: ['TRADE'],
    });
    const capitalFact = capital('PROPOSAL');
    const request = fact<CaptainProposalDecisionRequest>(
      'FACT.PROPOSAL.DECISION',
      {
        decisionRef: 'DECISION.PROPOSAL.1',
        countryRef: 'COUNTRY.A',
        proposalRef: 'PROPOSAL.1',
        proposalVersion: Q('1', 'proposal_version'),
        decision: 'APPROVE',
        reasonFactRef: 'FACT.REASON.PROPOSAL',
        approvalBindings: [
          {
            office: 'FINANCE',
            proposalVersion: Q('1', 'proposal_version'),
            approvalFactRef: 'FACT.APPROVAL.FINANCE',
          },
          {
            office: 'CAPTAIN',
            proposalVersion: Q('1', 'proposal_version'),
            approvalFactRef: 'FACT.APPROVAL.CAPTAIN',
          },
        ],
        revisionRequestFactRef: null,
        additionalOfficeRefs: [],
        cabinetVoteFactRef: null,
        politicalCapitalBucket: 'STRATEGIC_PROJECT_SUPPORT',
        politicalCapitalCost: Q('3', 'political_capital'),
        decidedAt: TRACE.snapshotAt,
      },
    );
    const result = prepareCaptainProposalDecision({
      trace: TRACE,
      proposalFact: proposal,
      capitalFact,
      requestFact: request,
    });
    expect(result.output).toMatchObject({
      decision: {
        decision: 'APPROVE',
        proposalVersion: Q('1', 'proposal_version'),
        ownerSettingsFactRef: 'FACT.OWNER.SETTINGS.PROPOSAL',
        authoritativeOwnerMutation: false,
      },
    });
    expect(() =>
      prepareCaptainProposalDecision({
        trace: TRACE,
        proposalFact: proposal,
        capitalFact,
        requestFact: fact('FACT.PROPOSAL.STALE', {
          ...request.payload,
          decisionRef: 'DECISION.PROPOSAL.STALE',
          proposalVersion: Q('0', 'proposal_version'),
        }),
      }),
    ).toThrow('exact country, proposal and version');
  });

  it('creates explicit commitments without credibility or public-support writes', () => {
    const capitalFact = capital('COMMITMENT');
    const request = fact<GovernmentCommitmentRequest>(
      'FACT.COMMITMENT.REQUEST',
      {
        commitmentRef: 'COMMITMENT.1',
        countryRef: 'COUNTRY.A',
        statementType: 'POLICY_ANNOUNCEMENT',
        level: 'EXPLICIT_TARGET',
        issueFactRef: 'FACT.ISSUE.COMMITMENT',
        targetMetricRef: 'METRIC.UNEMPLOYMENT',
        targetDirectionRef: 'DIRECTION.DECREASE',
        targetValue: Q('5', 'percentage_point'),
        deadlineAt: Q('30000', 'sim_millisecond'),
        linkedPolicyFactRef: 'FACT.POLICY.COMMITMENT',
        linkedStrategyOrPriorityRef: 'PRIORITY.EMPLOYMENT',
        politicalCapitalBucket: 'SOCIAL_REFORM_PROTECTION',
        politicalCapitalCost: Q('1', 'political_capital'),
        announcedAt: TRACE.snapshotAt,
      },
    );
    const result = prepareGovernmentCommitment({
      trace: TRACE,
      capitalFact,
      requestFact: request,
    });
    expect(result.output.commitment).toMatchObject({
      level: 'EXPLICIT_TARGET',
      targetValue: Q('5', 'percentage_point'),
      status: 'ACTIVE',
    });
    expect('credibilityEffect' in result.output.commitment).toBe(false);
    expect('publicSupportEffect' in result.output.commitment).toBe(false);
    expect(() =>
      prepareGovernmentCommitment({
        trace: TRACE,
        capitalFact,
        requestFact: fact('FACT.COMMITMENT.CAUTIOUS.BAD', {
          ...request.payload,
          commitmentRef: 'COMMITMENT.CAUTIOUS.BAD',
          level: 'CAUTIOUS' as const,
        }),
      }),
    ).toThrow('Cautious commitment');
  });

  it('creates coordination candidates without changing Finance or Central Bank policy', () => {
    const conflict = fact<CabinetConflictSnapshot>('FACT.CONFLICT.1', {
      conflictRef: 'CONFLICT.1',
      countryRef: 'COUNTRY.A',
      type: 'FISCAL_EXPANSION_VS_MONETARY_TIGHTENING',
      officeRefs: ['FINANCE', 'CENTRAL_BANK'],
      sourceFactRefs: ['FACT.FISCAL.STANCE', 'FACT.MONETARY.STANCE'],
    });
    const capitalFact = capital('COORDINATION');
    const request = fact<CabinetCoordinationRequest>(
      'FACT.COORDINATION.REQUEST',
      {
        coordinationRef: 'COORDINATION.1',
        countryRef: 'COUNTRY.A',
        conflictRef: 'CONFLICT.1',
        action: 'REQUEST_COORDINATION',
        participatingOffices: ['FINANCE', 'CENTRAL_BANK'],
        agendaIssueRef: null,
        proposalRef: null,
        reasonFactRef: 'FACT.REASON.COORDINATION',
        politicalCapitalBucket: 'CRISIS_RESPONSE',
        politicalCapitalCost: Q('1', 'political_capital'),
        coordinatedAt: TRACE.snapshotAt,
      },
    );
    const result = prepareCabinetCoordination({
      trace: TRACE,
      conflictFact: conflict,
      capitalFact,
      requestFact: request,
    });
    expect(result.output.coordination).toMatchObject({
      action: 'REQUEST_COORDINATION',
      officePolicyMutations: [],
    });
    expect(result.output.capital.available).toEqual(
      Q('79', 'political_capital'),
    );
  });

  it('rejects forged replay output even when the public hash is recomputed', () => {
    const capitalFact = capital('REPLAY');
    const request = fact<PoliticalCapitalAllocationRequest>(
      'FACT.ALLOCATION.REPLAY',
      {
        allocationRef: 'ALLOCATION.REPLAY.1',
        countryRef: 'COUNTRY.A',
        fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
        toBucket: 'FISCAL_REFORM',
        amount: Q('2', 'political_capital'),
        reasonFactRef: 'FACT.REASON.REPLAY',
        effectiveAt: TRACE.snapshotAt,
      },
    );
    const result = preparePoliticalCapitalAllocation({
      trace: TRACE,
      capitalFact,
      requestFact: request,
    });
    const forgedBody: Record<string, unknown> = {
      ...result.replayProof,
      outputCanonical: '{"capital":"created"}',
    };
    delete forgedBody.hashInput;
    const forged = {
      ...result.replayProof,
      outputCanonical: '{"capital":"created"}',
      hashInput: canonicalHashInput(forgedBody),
    };
    expect(() =>
      assertCaptainGovernanceReplayEvidence(forged, [capitalFact, request]),
    ).toThrow('recomputed result');
  });
});
