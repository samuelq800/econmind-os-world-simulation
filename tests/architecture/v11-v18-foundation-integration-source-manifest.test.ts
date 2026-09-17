import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

describe('V11-V18 foundation integration source manifest', () => {
  it('binds every selected reviewed source while retaining quarantine and final-review boundaries', () => {
    const record = readJson(
      'docs/reports/integration/V11_V18_FOUNDATION_INTEGRATION_EVIDENCE.json',
    );

    expect(record).toMatchObject({
      status: 'INTEGRATION_CANDIDATE_PENDING_FINAL_B_REVIEW',
      integrationBase: {
        ref: 'origin/main',
        sha: '0720a57b56394a577d34534356aa784a8bef9d22',
      },
      sources: {
        F: {
          reviewedTip: '5356fe93932eb285b3c21977a655e4c6e7bb6746',
        },
        V12: {
          code: 'b0c04ab3e2bbb87edface2c652949d3c3cfcca21',
          acceptance: '899bcb1a750d01be812fde9eee3fa0fd82357b42',
        },
        V13_V14: {
          codeAndBTarget: '653c1cba9681798260954a29e32dee3398054b70',
          acceptance: '60fc5f8271bff8c86a14993e94cdf44c156472b6',
        },
        V15_V16: {
          remediation: 'b84e790e163593a914ebff771b41c50279c1748f',
          acceptance: '1ccc680682faae18b150a33978ee1456b88cdc24',
        },
        V17_V18: {
          remediationCode: 'ea3b5b818a485614ad7cb2d3cd6240a59f7da439',
          reviewEvidence: '8038bc3f8d129f1d6bfa3877d7353ba96da15ac0',
          acceptance: '74748ec4e607647af2bc5898233f6e17db1457f8',
        },
      },
      mainMergeAuthorized: false,
      productionMutation: false,
      verified: false,
    });
    expect(record.selectionOrder).toEqual([
      'F',
      'V11',
      'V12',
      'V13_V14',
      'V15_V16',
      'V17_V18',
    ]);
    expect(record.sources.V11.governanceRecordHandling).toContain(
      'status/progress.json',
    );
    expect(record.quarantine.V09).toContain('Preserved');
    expect(record.notRun).toEqual(
      expect.arrayContaining([
        'final independent narrow integration Review B',
        'official full repository pnpm check',
      ]),
    );
  });
});
