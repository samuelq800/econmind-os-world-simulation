import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  V10_GATE_B_PROPERTIES,
  V10_INHERITED_FOUNDATION_INVARIANTS,
  classifyV10GateBReadiness,
  deterministicV10GateBCampaignJson,
  type V10EvidenceResult,
  type V10GateBCampaign,
} from '../support/v10-gate-b-evidence.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function campaign(result: V10EvidenceResult): V10GateBCampaign {
  return {
    candidateCommit: 'a'.repeat(40),
    productionMutation: false,
    v11ImplementationStarted: false,
    propertyEvidence: V10_GATE_B_PROPERTIES.map((subject) => ({
      subject,
      result,
      surface: 'ISOLATED_POSTGRESQL',
      evidenceRef: `evidence/${subject}.json`,
    })),
    foundationEvidence: V10_INHERITED_FOUNDATION_INVARIANTS.map((subject) => ({
      subject,
      result,
      surface: 'REPOSITORY_REGRESSION',
      evidenceRef: `evidence/${subject}.json`,
    })),
    browserE2E: {
      subject: 'TWO_COUNTRY_TWO_OFFICE_BROWSER_E2E',
      result,
      surface: 'BROWSER_E2E',
      evidenceRef: 'evidence/browser-e2e.json',
    },
    realPostgresCrashRecovery: {
      subject: 'POSTGRES_CRASH_RECOVERY',
      result,
      surface: 'ISOLATED_POSTGRESQL',
      evidenceRef: 'evidence/postgres-crash-recovery.json',
    },
    stagingRlsGrants: {
      subject: 'STAGING_RLS_AND_GRANTS',
      result,
      surface: 'NONPRODUCTION_SUPABASE_STAGING',
      evidenceRef: 'evidence/staging-rls-grants.json',
    },
    fullRegression: {
      subject: 'FULL_REPOSITORY_REGRESSION',
      result,
      surface: 'REPOSITORY_REGRESSION',
      evidenceRef: 'evidence/full-regression.json',
    },
  };
}

describe('V10.4 Gate B evidence classifier', () => {
  it('keeps every unrun surface explicitly pending', () => {
    const result = classifyV10GateBReadiness(campaign('NOT_RUN'), sha256);
    expect(result.kind).toBe('PENDING_EVIDENCE');
    if (result.kind !== 'PENDING_EVIDENCE') throw new Error('Expected pending');
    expect(result.missing).toContain('CONCURRENCY_SAFE');
    expect(result.missing).toContain('STAGING_RLS_AND_GRANTS');
  });

  it('does not accept atomicity evidence from a local-only run', () => {
    const candidate = campaign('PASS');
    const propertyEvidence = candidate.propertyEvidence.map((item) =>
      item.subject === 'TRANSACTIONS_ATOMIC'
        ? { ...item, surface: 'LOCAL_UNIT' as const }
        : item,
    );
    const result = classifyV10GateBReadiness(
      { ...candidate, propertyEvidence },
      sha256,
    );
    expect(result).toMatchObject({
      kind: 'BLOCKED_BY_FAILED_EVIDENCE',
      failed: ['TRANSACTIONS_ATOMIC:PASS_ON_WRONG_SURFACE'],
    });
  });

  it('is deterministic and stops at independent-review readiness', () => {
    const candidate = campaign('PASS');
    const reordered = {
      ...candidate,
      propertyEvidence: [...candidate.propertyEvidence].reverse(),
      foundationEvidence: [...candidate.foundationEvidence].reverse(),
    };
    const first = classifyV10GateBReadiness(candidate, sha256);
    const second = classifyV10GateBReadiness(reordered, sha256);
    expect(first.kind).toBe('READY_FOR_INDEPENDENT_GATE_B_REVIEW');
    expect(second).toEqual(first);
    expect(deterministicV10GateBCampaignJson(reordered)).toBe(
      deterministicV10GateBCampaignJson(candidate),
    );
  });

  it('rejects a missing or duplicated hard-property row', () => {
    const candidate = campaign('NOT_RUN');
    expect(() =>
      classifyV10GateBReadiness(
        {
          ...candidate,
          propertyEvidence: [
            ...candidate.propertyEvidence.slice(1),
            candidate.propertyEvidence[1]!,
          ],
        },
        sha256,
      ),
    ).toThrow('V10_GATE_B_EVIDENCE_INVALID');
  });
});
