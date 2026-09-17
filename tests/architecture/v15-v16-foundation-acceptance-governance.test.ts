import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V15-V16 foundation review nonproduction acceptance', () => {
  it('binds B remediation evidence and the exact parent without promoting a product, Gate, or normal-mode path', () => {
    const policy = readJson(
      'docs/governance/WORLD_CORE_V15_V16_FOUNDATION_REVIEWED_NONPRODUCTION_POLICY.json',
    );
    const acceptance = readFileSync(
      resolve(
        root,
        'docs/reports/V15_V16_SOCIAL_FOUNDATION/FOUNDATION_REVIEW_OWNER_ACCEPTANCE.md',
      ),
      'utf8',
    );

    expect(policy).toMatchObject({
      status: 'FOUNDATION_REVIEWED_NONPRODUCTION',
      candidate: {
        foundation_baseline: '5356fe93932eb285b3c21977a655e4c6e7bb6746',
        foundation_candidate_parent: '5eb535e0e50780a57f3a0d44125d806a48326be3',
        remediation_and_review_tip: 'b84e790e163593a914ebff771b41c50279c1748f',
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
        'V15.1': ['V06.3', 'V08.3', 'V11.3', 'V14.3'],
        'V16.1': ['V06.3', 'V08.3', 'V11.3', 'V14.3'],
        effect:
          'Unchanged. This policy does not approve, satisfy, bypass, or reclassify any dependency.',
      },
      main_merge_authorized: false,
      production_mutation: false,
      verified: false,
    });
    expect(policy.preserved_boundaries).toEqual(
      expect.arrayContaining([
        'V15 and V16 remain FOUNDATION_REVIEWED_NONPRODUCTION, not VERIFIED.',
        'No V15 or V16 product integration, Gate readiness, lifecycle-state transition, or dependency-path approval is claimed.',
        'No status/progress or Gate record is changed.',
      ]),
    );
    expect(acceptance).toContain('`FOUNDATION_REVIEWED_NONPRODUCTION`');
    expect(acceptance).toContain('`FOUNDATION_REVIEW_CANDIDATE_APPROVED`');
    expect(acceptance).toContain('`P0=0`, `MAJOR=0`');
  });
});
