import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V13-V14 foundation review nonproduction acceptance', () => {
  it('binds B continuation evidence without promoting a product, Gate, or normal-mode path', () => {
    const policy = readJson(
      'docs/governance/WORLD_CORE_V13_V14_FOUNDATION_REVIEWED_NONPRODUCTION_POLICY.json',
    );
    const acceptance = readFileSync(
      resolve(
        root,
        'docs/reports/V13_V14_FOUNDATION/FOUNDATION_REVIEW_OWNER_ACCEPTANCE.md',
      ),
      'utf8',
    );

    expect(policy).toMatchObject({
      status: 'FOUNDATION_REVIEWED_NONPRODUCTION',
      candidate: {
        foundation_baseline: '5356fe93932eb285b3c21977a655e4c6e7bb6746',
        core_candidate: '653c1cba9681798260954a29e32dee3398054b70',
      },
      independent_review: {
        reviewer: 'B',
        open_p0: 0,
        open_major: 0,
        verdict: 'FOUNDATION_CANDIDATE_APPROVED_FOR_CONTINUATION',
      },
      final_foundation_integration: {
        accepted: true,
      },
      hard_dependencies: {
        'V13.1': ['V03.3', 'V11.3', 'V12.3'],
        'V14.1': ['V05.3', 'V06.3', 'V08.3', 'V11.3', 'V12.3', 'V13.3'],
        effect:
          'Unchanged. This policy does not approve, satisfy, bypass, or reclassify any dependency.',
      },
      main_merge_authorized: false,
      production_mutation: false,
      verified: false,
    });
    expect(policy.preserved_boundaries).toEqual(
      expect.arrayContaining([
        'V13 and V14 remain FOUNDATION_REVIEWED_NONPRODUCTION, not VERIFIED.',
        'No V13 or V14 product integration, Gate readiness, lifecycle-state transition, or dependency-path approval is claimed.',
        'No status/progress or Gate record is changed.',
      ]),
    );
    expect(acceptance).toContain('`FOUNDATION_REVIEWED_NONPRODUCTION`');
    expect(acceptance).toContain(
      '`FOUNDATION_CANDIDATE_APPROVED_FOR_CONTINUATION`',
    );
    expect(acceptance).toContain('`P0=0`, `MAJOR=0`');
  });
});
