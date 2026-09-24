import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildV29EvidenceMatrix,
  type V29EvidenceClaim,
  type V29RequirementRow,
} from '../../tools/v29/requirement-evidence-preparation.js';

const registry = JSON.parse(
  readFileSync(
    new URL('../../requirements/requirement_registry.json', import.meta.url),
    'utf8',
  ),
) as { requirements: V29RequirementRow[] };

const requirement = registry.requirements[0]!;
const claim: V29EvidenceClaim = {
  requirementId: requirement.requirement_id,
  status: 'EVIDENCED',
  reason: 'Example exact-SHA code/test binding, not independent approval',
  candidateSha: 'a'.repeat(40),
  codePaths: ['packages/core/src/index.ts'],
  testPaths: ['tests/world-core/example.test.ts'],
  evidenceRefs: ['docs/reports/example/TEST_EVIDENCE.json'],
};

describe('V29.1 requirement evidence preparation', () => {
  it('treats every source-linked registry entry as missing until bound', () => {
    const matrix = buildV29EvidenceMatrix(registry.requirements, []);
    expect(matrix.status).toBe('PREPARATION_ONLY_NOT_V29_APPROVAL');
    expect(matrix.rows).toHaveLength(139);
    expect(matrix.counts).toEqual({
      EVIDENCED: 0,
      MISSING: 139,
      FAIL: 0,
      NOT_RUN: 0,
    });
    expect(matrix.rows.every((row) => row.formallyVerified === false)).toBe(
      true,
    );
  });

  it('binds a structurally evidenced row without calling it verified', () => {
    const matrix = buildV29EvidenceMatrix(registry.requirements, [claim]);
    expect(matrix.counts.EVIDENCED).toBe(1);
    expect(matrix.counts.MISSING).toBe(138);
    expect(matrix.rows[0]).toMatchObject({
      requirementId: claim.requirementId,
      candidateSha: claim.candidateSha,
      formallyVerified: false,
    });
  });

  it('rejects unsupported, duplicate and orphan claims', () => {
    expect(() =>
      buildV29EvidenceMatrix(registry.requirements, [claim, claim]),
    ).toThrow();
    expect(() =>
      buildV29EvidenceMatrix(registry.requirements, [
        { ...claim, requirementId: 'REQ-UNKNOWN' },
      ]),
    ).toThrow();
    expect(() =>
      buildV29EvidenceMatrix(registry.requirements, [
        { ...claim, candidateSha: 'short' },
      ]),
    ).toThrow();
    expect(() =>
      buildV29EvidenceMatrix(registry.requirements, [
        { ...claim, codePaths: ['../outside.ts'] },
      ]),
    ).toThrow();
  });

  it('keeps missing, failed and not-run rows free of invented evidence', () => {
    for (const status of ['MISSING', 'FAIL', 'NOT_RUN'] as const) {
      const matrix = buildV29EvidenceMatrix(registry.requirements, [
        {
          requirementId: requirement.requirement_id,
          status,
          reason: 'No measured candidate result',
        },
      ]);
      expect(matrix.counts[status]).toBe(status === 'MISSING' ? 139 : 1);
      expect(matrix.rows[0]?.candidateSha).toBeNull();
      expect(matrix.rows[0]?.formallyVerified).toBe(false);
      expect(() =>
        buildV29EvidenceMatrix(registry.requirements, [{ ...claim, status }]),
      ).toThrow();
    }
  });
});
