import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V17-V18 foundation review nonproduction acceptance', () => {
  it('binds B remediation evidence without promoting a product, Gate, or normal-mode path', () => {
    const policy = readJson(
      'docs/governance/WORLD_CORE_V17_V18_FOUNDATION_REVIEWED_NONPRODUCTION_POLICY.json',
    );
    const acceptance = readFileSync(
      resolve(
        root,
        'docs/reports/V17_V18_HOUSEHOLD_FISCAL_FOUNDATION/FOUNDATION_REVIEW_OWNER_ACCEPTANCE.md',
      ),
      'utf8',
    );

    expect(policy).toMatchObject({
      status: 'FOUNDATION_REVIEWED_NONPRODUCTION',
      candidate: {
        foundation_baseline: '5356fe93932eb285b3c21977a655e4c6e7bb6746',
        core_candidate: 'ea3b5b818a485614ad7cb2d3cd6240a59f7da439',
        evidence_and_review_tip: '8038bc3f8d129f1d6bfa3877d7353ba96da15ac0',
      },
      independent_review: {
        reviewer: 'B',
        open_p0: 0,
        open_major: 0,
        verdict: 'FOUNDATION_REVIEW_CANDIDATE_APPROVED',
      },
      final_foundation_integration: {
        accepted: true,
      },
      hard_dependencies: {
        'V17.1': ['V11.3', 'V13.3', 'V15.3', 'V16.3'],
        'V18.1': ['V05.3', 'V08.3', 'V14.3', 'V17.3'],
        effect:
          'Unchanged. This policy does not approve, satisfy, bypass, or reclassify any dependency.',
      },
      main_merge_authorized: false,
      production_mutation: false,
      verified: false,
    });
    expect(policy.preserved_boundaries).toEqual(
      expect.arrayContaining([
        'V17 and V18 remain FOUNDATION_REVIEWED_NONPRODUCTION, not VERIFIED.',
        'No V17 or V18 product integration, Gate readiness, lifecycle-state transition, or dependency-path approval is claimed.',
        'No status/progress or Gate record is changed.',
      ]),
    );
    expect(acceptance).toContain('`FOUNDATION_REVIEWED_NONPRODUCTION`');
    expect(acceptance).toContain('`FOUNDATION_REVIEW_CANDIDATE_APPROVED`');
    expect(acceptance).toContain('`P0=0`, `MAJOR=0`');
  });
});
