import { describe, expect, it } from 'vitest';

import {
  createFoundationFact,
  type FoundationFact,
} from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  assertBriefProjectionReplay,
  assertPolicyConflictReplay,
  assertResponsibilityLogReplay,
  assertTemporaryPowerReplay,
  detectPolicyConflicts,
  evaluateTemporaryPower,
  prepareCabinetBriefProjection,
  prepareResponsibilityLog,
  type BriefGrantStatement,
  type BriefViewerStatement,
  type CabinetBriefStatement,
  type CrisisLifecycleStatement,
  type PolicyStatement,
  type ResponsibilityDecisionStatement,
  type TemporaryPowerStatement,
} from '../../packages/core/src/engine-kernels/governance-brief-conflict-expiry-foundation.js';

const trace = {
  traceRef: 'TRACE.V24.3',
  calculationVersion: 'GOVERNANCE.PREPARATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.24',
    sourceVersion: 'WORLD_VERSION.24',
    snapshotRef: 'SNAPSHOT.WORLD.24',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '100', unit: 'sim_millisecond' },
} as const;
const t = (amount: string) => ({ amount, unit: 'sim_millisecond' });

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

function briefFacts(restricted = false) {
  const brief: CabinetBriefStatement = {
    briefRef: 'BRIEF.SECRET',
    worldRef: 'WORLD.A',
    seasonRef: 'SEASON.A',
    countryRef: 'COUNTRY.A',
    versionRef: 'BRIEF_VERSION.1',
    classification: restricted ? 'CABINET_RESTRICTED' : 'CABINET_INTERNAL',
    scopeOfficeRefs: ['OFFICE.TREASURY'],
    requiredGrantRef: restricted ? 'GRANT.SECRET' : null,
    title: 'SECRET_TITLE_NEVER_LEAK',
    body: 'SECRET_BODY_NEVER_LEAK',
    sourceReceiptRef: 'RECEIPT.BRIEF',
  };
  const viewer: BriefViewerStatement = {
    actorRef: 'ACTOR.A',
    worldRef: 'WORLD.A',
    seasonRef: 'SEASON.A',
    countryRef: 'COUNTRY.A',
    authenticated: true,
    cabinetMembershipRef: 'CABINET.MEMBER.A',
    officeRefs: ['OFFICE.TREASURY'],
    serverAuthorizationRef: 'AUTH.SERVER.A',
  };
  const briefFact = fact('FACT.BRIEF.SECRET', brief);
  const viewerFact = fact('FACT.VIEWER.A', viewer);
  const grant: BriefGrantStatement = {
    grantRef: 'GRANT.SECRET',
    briefRef: brief.briefRef,
    briefVersionRef: brief.versionRef,
    actorRef: viewer.actorRef,
    officeRef: 'OFFICE.TREASURY',
    allowed: true,
    validFrom: t('10'),
    expiresAt: t('101'),
    sourceReceiptRef: 'RECEIPT.GRANT',
  };
  const grantFact = fact('FACT.GRANT.SECRET', grant, [
    briefFact.factRef,
    viewerFact.factRef,
  ]);
  return { brief, viewer, grant, briefFact, viewerFact, grantFact };
}

function policy(
  policyRef: string,
  overrides: Partial<PolicyStatement> = {},
): FoundationFact<PolicyStatement> {
  return fact(`FACT.${policyRef}`, {
    policyRef,
    versionRef: `VERSION.${policyRef}`,
    worldRef: 'WORLD.A',
    seasonRef: 'SEASON.A',
    countryRef: 'COUNTRY.A',
    ownerOfficeRef: 'OFFICE.TREASURY',
    commandRef: `COMMAND.${policyRef}`,
    targetRef: 'TARGET.TAX',
    direction: 'INCREASE',
    exclusiveResourceRef: null,
    effectiveFrom: t('10'),
    effectiveUntil: t('50'),
    sourceReceiptRef: `RECEIPT.${policyRef}`,
    ...overrides,
  });
}

function powerFacts() {
  const grant: TemporaryPowerStatement = {
    grantRef: 'POWER.A',
    grantVersionRef: 'POWER_VERSION.1',
    actorRef: 'ACTOR.A',
    officeRef: 'OFFICE.A',
    scopeRef: 'SCOPE.CRISIS',
    worldRef: 'WORLD.A',
    seasonRef: 'SEASON.A',
    countryRef: 'COUNTRY.A',
    crisisRef: 'CRISIS.A',
    issuedAt: t('20'),
    expiresAt: t('200'),
    approvalRef: 'APPROVAL.A',
    serverAuthorizationRef: 'AUTH.SERVER.A',
    sourceReceiptRef: 'RECEIPT.POWER',
  };
  const crisis: CrisisLifecycleStatement = {
    crisisRef: 'CRISIS.A',
    versionRef: 'CRISIS_VERSION.1',
    worldRef: 'WORLD.A',
    seasonRef: 'SEASON.A',
    countryRef: 'COUNTRY.A',
    status: 'ACTIVE',
    endedAt: null,
    sourceReceiptRef: 'RECEIPT.CRISIS',
  };
  return {
    grant,
    crisis,
    grantFact: fact('FACT.POWER', grant),
    crisisFact: fact('FACT.CRISIS', crisis),
  };
}

describe('V24.3 brief/conflict/expiry preparation', () => {
  it('returns an authorized candidate only for explicit cabinet scope and replays it', () => {
    const { briefFact, viewerFact } = briefFacts();
    const input = { trace, briefFact, viewerFact, grantFact: null };
    const result = prepareCabinetBriefProjection(input);
    expect(result.status).toBe('AUTHORIZED_CANDIDATE');
    assertBriefProjectionReplay(input, result);
    expect(prepareCabinetBriefProjection(input)).toEqual(result);
  });

  it('requires exact versioned restricted grant and denies without leaking content or identifier', () => {
    const { brief, viewer, grant, briefFact, viewerFact, grantFact } =
      briefFacts(true);
    const input = { trace, briefFact, viewerFact, grantFact };
    expect(prepareCabinetBriefProjection(input).status).toBe(
      'AUTHORIZED_CANDIDATE',
    );
    const denied = [
      prepareCabinetBriefProjection({ ...input, grantFact: null }),
      prepareCabinetBriefProjection({
        ...input,
        viewerFact: fact('FACT.VIEWER.A', {
          ...viewer,
          countryRef: 'COUNTRY.B',
        }),
      }),
      prepareCabinetBriefProjection({
        ...input,
        viewerFact: fact('FACT.VIEWER.A', {
          ...viewer,
          cabinetMembershipRef: null,
        }),
      }),
      prepareCabinetBriefProjection({
        ...input,
        viewerFact: fact('FACT.VIEWER.A', {
          ...viewer,
          officeRefs: ['OFFICE.OTHER'],
        }),
      }),
      prepareCabinetBriefProjection({
        ...input,
        grantFact: fact(
          'FACT.GRANT.SECRET',
          { ...grant, briefVersionRef: 'BRIEF_VERSION.OLD' },
          grantFact.predecessorFactRefs,
        ),
      }),
      prepareCabinetBriefProjection({
        ...input,
        grantFact: fact(
          'FACT.GRANT.SECRET',
          { ...grant, expiresAt: t('100') },
          grantFact.predecessorFactRefs,
        ),
      }),
      prepareCabinetBriefProjection({
        ...input,
        briefFact: fact('FACT.BRIEF.SECRET', {
          ...brief,
          countryRef: 'COUNTRY.B',
        }),
      }),
    ];
    for (const result of denied) {
      expect(result).toEqual({ status: 'DENIED' });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(brief.title);
      expect(serialized).not.toContain(brief.body);
      expect(serialized).not.toContain(brief.briefRef);
      expect(serialized).not.toContain('hashInput');
    }
    expect(() =>
      assertBriefProjectionReplay(input, { status: 'DENIED' }),
    ).toThrow();
  });

  it('detects overlapping opposite targets and exclusive resources, but not half-open adjacency', () => {
    const left = policy('POLICY.A', { exclusiveResourceRef: 'RESOURCE.A' });
    const right = policy('POLICY.B', {
      direction: 'DECREASE',
      exclusiveResourceRef: 'RESOURCE.A',
      effectiveFrom: t('30'),
      effectiveUntil: t('80'),
    });
    const input = { trace, policyFacts: [right, left] };
    const result = detectPolicyConflicts(input);
    expect(result.conflicts.map((item) => item.kind)).toEqual([
      'TARGET_DIRECTION_CONFLICT',
      'EXCLUSIVE_RESOURCE_CONFLICT',
    ]);
    expect(result.conflicts[0]?.overlapFrom).toEqual(t('30'));
    expect(result.conflicts[0]?.overlapUntil).toEqual(t('50'));
    expect(
      detectPolicyConflicts({ trace, policyFacts: [left, right] }),
    ).toEqual(result);
    assertPolicyConflictReplay(input, result);
    expect(
      detectPolicyConflicts({
        trace,
        policyFacts: [
          left,
          policy('POLICY.C', {
            direction: 'DECREASE',
            effectiveFrom: t('50'),
            effectiveUntil: t('80'),
          }),
        ],
      }).conflicts,
    ).toEqual([]);
    expect(
      detectPolicyConflicts({
        trace,
        policyFacts: [
          left,
          policy('POLICY.D', {
            countryRef: 'COUNTRY.B',
            direction: 'DECREASE',
          }),
        ],
      }).conflicts,
    ).toEqual([]);
  });

  it('rejects duplicate, malformed, forged, and replay-tampered policy evidence', () => {
    const a = policy('POLICY.A');
    expect(() =>
      detectPolicyConflicts({ trace, policyFacts: [a, a] }),
    ).toThrow();
    expect(() =>
      detectPolicyConflicts({
        trace,
        policyFacts: [a, policy('POLICY.B', { policyRef: 'POLICY.A' })],
      }),
    ).toThrow();
    expect(() =>
      detectPolicyConflicts({
        trace,
        policyFacts: [
          policy('POLICY.BAD', {
            effectiveFrom: t('50'),
            effectiveUntil: t('50'),
          }),
        ],
      }),
    ).toThrow();
    const forged = {
      ...a,
      payload: { ...a.payload, direction: 'DECREASE' as const },
    };
    expect(() =>
      detectPolicyConflicts({ trace, policyFacts: [forged] }),
    ).toThrow();
    const input = { trace, policyFacts: [a] };
    const result = detectPolicyConflicts(input);
    expect(() =>
      assertPolicyConflictReplay(input, { ...result, hashInput: 'tampered' }),
    ).toThrow();
  });

  it('keeps mixed-case policy and log order independent of host locale', () => {
    const upper = policy('POLICY.I');
    const lower = policy('POLICY.i', { direction: 'DECREASE' });
    const conflict = detectPolicyConflicts({
      trace,
      policyFacts: [lower, upper],
    });
    expect(conflict.conflicts[0]?.leftPolicyRef).toBe('POLICY.I');
    expect(conflict.conflicts[0]?.rightPolicyRef).toBe('POLICY.i');
    expect(
      detectPolicyConflicts({ trace, policyFacts: [upper, lower] }),
    ).toEqual(conflict);
    const decision: ResponsibilityDecisionStatement = {
      decisionRef: 'DECISION.I',
      actionRef: 'ACTION.I',
      actorRef: 'ACTOR.A',
      officeRef: 'OFFICE.A',
      worldRef: 'WORLD.A',
      seasonRef: 'SEASON.A',
      countryRef: 'COUNTRY.A',
      versionRef: 'WORLD_VERSION.24',
      decisionAt: t('50'),
      outcome: 'APPROVED',
      sourceReceiptRef: 'RECEIPT.I',
    };
    const upperDecision = fact('FACT.I', decision);
    const lowerDecision = fact('FACT.i', {
      ...decision,
      decisionRef: 'DECISION.i',
      sourceReceiptRef: 'RECEIPT.i',
    });
    const log = prepareResponsibilityLog({
      trace,
      decisionFacts: [lowerDecision, upperDecision],
    });
    expect(log.entries.map((entry) => entry.decisionRef)).toEqual([
      'DECISION.I',
      'DECISION.i',
    ]);
    expect(
      prepareResponsibilityLog({
        trace,
        decisionFacts: [upperDecision, lowerDecision],
      }),
    ).toEqual(log);
  });

  it('makes a deterministic metadata-only responsibility candidate and checks replay', () => {
    const base: ResponsibilityDecisionStatement = {
      decisionRef: 'DECISION.B',
      actionRef: 'ACTION.B',
      actorRef: 'ACTOR.B',
      officeRef: 'OFFICE.B',
      worldRef: 'WORLD.A',
      seasonRef: 'SEASON.A',
      countryRef: 'COUNTRY.A',
      versionRef: 'WORLD_VERSION.24',
      decisionAt: t('30'),
      outcome: 'APPROVED',
      sourceReceiptRef: 'RECEIPT.DECISION.B',
    };
    const a = fact('FACT.DECISION.A', {
      ...base,
      decisionRef: 'DECISION.A',
      actionRef: 'ACTION.A',
      decisionAt: t('20'),
    });
    const b = fact('FACT.DECISION.B', base);
    const input = { trace, decisionFacts: [b, a] };
    const result = prepareResponsibilityLog(input);
    expect(result.entries.map((item) => item.decisionRef)).toEqual([
      'DECISION.A',
      'DECISION.B',
    ]);
    expect(prepareResponsibilityLog({ trace, decisionFacts: [a, b] })).toEqual(
      result,
    );
    expect(JSON.stringify(result)).not.toContain('SECRET_BODY_NEVER_LEAK');
    assertResponsibilityLogReplay(input, result);
    expect(() =>
      prepareResponsibilityLog({
        trace,
        decisionFacts: [
          a,
          fact('FACT.OTHER', { ...base, decisionRef: 'DECISION.A' }),
        ],
      }),
    ).toThrow();
    expect(() =>
      prepareResponsibilityLog({
        trace,
        decisionFacts: [fact('FACT.LATE', { ...base, decisionAt: t('101') })],
      }),
    ).toThrow();
    expect(() =>
      prepareResponsibilityLog({
        trace,
        decisionFacts: [
          fact('FACT.LEAK', { ...base, briefBody: 'SECRET_BODY_NEVER_LEAK' }),
        ],
      }),
    ).toThrow('only the declared metadata fields');
    expect(() =>
      assertResponsibilityLogReplay(input, { ...result, entries: [] }),
    ).toThrow();
  });

  it('expires temporary power at crisis end or time boundary, without wall-clock input', () => {
    const { grant, crisis, grantFact, crisisFact } = powerFacts();
    const input = { trace, grantFact, crisisFact };
    const active = evaluateTemporaryPower(input);
    expect(active.temporalEligibility).toBe('ACTIVE');
    assertTemporaryPowerReplay(input, active);
    const ended = fact('FACT.CRISIS', {
      ...crisis,
      status: 'ENDED' as const,
      endedAt: t('100'),
    });
    const expired = evaluateTemporaryPower({
      trace,
      grantFact,
      crisisFact: ended,
    });
    expect(expired.temporalEligibility).toBe('EXPIRED');
    expect(expired.expiryCause).toBe('CRISIS_ENDED');
    expect(expired.effectiveUntil).toEqual(t('100'));
    const timeLimit = evaluateTemporaryPower({
      trace,
      grantFact: fact('FACT.POWER', { ...grant, expiresAt: t('100') }),
      crisisFact,
    });
    expect(timeLimit.temporalEligibility).toBe('EXPIRED');
    expect(timeLimit.expiryCause).toBe('TIME_LIMIT');
    expect(
      evaluateTemporaryPower({
        trace,
        grantFact: fact('FACT.POWER', { ...grant, issuedAt: t('101') }),
        crisisFact,
      }).temporalEligibility,
    ).toBe('NOT_YET_ACTIVE');
  });

  it('fails closed on contradictory crisis facts, invalid intervals and replay tampering', () => {
    const { grant, crisis, grantFact, crisisFact } = powerFacts();
    expect(() =>
      evaluateTemporaryPower({
        trace,
        grantFact,
        crisisFact: fact('FACT.CRISIS', {
          ...crisis,
          status: 'ENDED',
          endedAt: null,
        }),
      }),
    ).toThrow();
    expect(() =>
      evaluateTemporaryPower({
        trace,
        grantFact,
        crisisFact: fact('FACT.CRISIS', { ...crisis, endedAt: t('90') }),
      }),
    ).toThrow();
    expect(() =>
      evaluateTemporaryPower({
        trace,
        grantFact: fact('FACT.POWER', { ...grant, issuedAt: t('200') }),
        crisisFact,
      }),
    ).toThrow();
    expect(() =>
      evaluateTemporaryPower({
        trace,
        grantFact: fact('FACT.POWER', { ...grant, countryRef: 'COUNTRY.B' }),
        crisisFact,
      }),
    ).toThrow();
    const input = { trace, grantFact, crisisFact };
    const result = evaluateTemporaryPower(input);
    expect(() =>
      assertTemporaryPowerReplay(input, {
        ...result,
        temporalEligibility: 'EXPIRED',
      }),
    ).toThrow();
  });
});
