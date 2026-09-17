import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V12 foundation review nonproduction acceptance', () => {
  it('binds B review evidence without promoting V12 to a product or Gate path', () => {
    const policy = readJson(
      'docs/governance/WORLD_CORE_V12_FOUNDATION_REVIEWED_NONPRODUCTION_POLICY.json',
    );
    const acceptance = readFileSync(
      resolve(root, 'docs/reports/V12/FOUNDATION_REVIEW_OWNER_ACCEPTANCE.md'),
      'utf8',
    );

    expect(policy).toMatchObject({
      status: 'FOUNDATION_REVIEWED_NONPRODUCTION',
      candidate: {
        foundation_baseline: '5356fe93932eb285b3c21977a655e4c6e7bb6746',
        core_candidate: 'b0c04ab3e2bbb87edface2c652949d3c3cfcca21',
        evidence_and_review_tip: '8bc779dcceb34adf731adc4c4868e4032093f8b0',
      },
      independent_review: {
        reviewer: 'B',
        open_p0: 0,
        open_major: 0,
        verdict: 'FOUNDATION_REVIEW_CANDIDATE_APPROVED',
      },
      hard_dependencies: {
        'V12.1': ['V08.3', 'V09.3', 'V11.3'],
        'V12.2': ['V12.1'],
        'V12.3': ['V12.2'],
        effect:
          'Unchanged. This policy does not approve, satisfy, bypass, or reclassify any dependency.',
      },
      main_merge_authorized: false,
      production_mutation: false,
      verified: false,
    });
    expect(policy.permitted_reuse.future_work_packages).toEqual([
      'V13',
      'V14',
      'V15',
      'V16',
      'V17',
      'V18',
    ]);
    expect(policy.preserved_boundaries).toEqual(
      expect.arrayContaining([
        'V12 remains FOUNDATION_REVIEWED_NONPRODUCTION, not VERIFIED.',
        'No V12 product integration, Gate readiness, or dependency-path approval is claimed.',
        'No status/progress or Gate record is changed.',
      ]),
    );
    expect(acceptance).toContain('`FOUNDATION_REVIEWED_NONPRODUCTION`');
    expect(acceptance).toContain('`FOUNDATION_REVIEW_CANDIDATE_APPROVED`');
    expect(acceptance).toContain('`P0=0`, `MAJOR=0`');
  });
});
