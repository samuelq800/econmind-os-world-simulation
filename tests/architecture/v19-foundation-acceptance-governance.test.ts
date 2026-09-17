import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V19 foundation review nonproduction acceptance', () => {
  it('binds the reviewed V19 candidate without promoting a product, Gate, or normal-mode path', () => {
    const policy = readJson(
      'docs/governance/WORLD_CORE_V19_FOUNDATION_REVIEWED_NONPRODUCTION_POLICY.json',
    );
    const acceptance = readFileSync(
      resolve(
        root,
        'docs/reports/V19_FOUNDATION/FOUNDATION_REVIEW_OWNER_ACCEPTANCE.md',
      ),
      'utf8',
    );

    expect(policy).toMatchObject({
      status: 'FOUNDATION_REVIEWED_NONPRODUCTION',
      candidate: {
        main_baseline: '72dcb20d83fbc7365fb22d5ac24c373e3ca55994',
        core_candidate: 'f62e50fef6f21dc56df398f1228290679d207293',
        evidence_and_review_tip: 'ff1afa118b207deb69fef1d44daafad3f3717d94',
      },
      independent_review: {
        reviewer: 'B',
        open_p0: 0,
        open_major: 0,
        verdict: 'V19_FOUNDATION_CANDIDATE_APPROVED_FOR_CONTINUATION',
      },
      hard_dependencies: {
        'V19.1': ['V05.3', 'V08.3', 'V13.3', 'V17.3'],
        'V19.2': ['V19.1'],
        'V19.3': ['V19.2'],
        effect:
          'Unchanged. This policy does not approve, satisfy, bypass, or reclassify any dependency.',
      },
      main_merge_authorized: false,
      production_mutation: false,
      verified: false,
    });
    expect(policy.preserved_boundaries).toEqual(
      expect.arrayContaining([
        'V19 remains FOUNDATION_REVIEWED_NONPRODUCTION, not VERIFIED.',
        'No V19 product integration, Gate readiness, lifecycle-state transition, or dependency-path approval is claimed.',
        'No status/progress or Gate record is changed.',
      ]),
    );
    expect(acceptance).toContain('`FOUNDATION_REVIEWED_NONPRODUCTION`');
    expect(acceptance).toContain(
      '`V19_FOUNDATION_CANDIDATE_APPROVED_FOR_CONTINUATION`',
    );
    expect(acceptance).toContain('`P0=0`, `MAJOR=0`');
  });
});
