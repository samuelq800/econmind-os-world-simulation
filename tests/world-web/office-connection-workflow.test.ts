import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  plan as catalogPlan,
  repositoryRoot,
} from '../../tools/office-connection/catalog.mjs';
import { summarizeInventory } from '../../tools/office-connection/run.mjs';
import { migrationSourceCommits } from '../../tools/office-connection/provenance.mjs';

describe('all-office connection workflow evidence boundary', () => {
  it('keeps the actual six-office denominator separate from live verification', () => {
    const matrix = catalogPlan();
    const summary = summarizeInventory(matrix);
    expect(summary.counts.offices).toBe(6);
    expect(summary.denominators.catalogRows).toBe(1404);
    expect(summary.denominators.pageCommandRows).toBe(148);
    expect(summary.denominators.countryOfficePairs).toBe(420);
    expect(summary.denominators.countryCatalogInstanceRows).toBe(98280);
    expect(
      summary.offices.every(
        (office: { formallyVerifiedRows: number }) =>
          office.formallyVerifiedRows === 0,
      ),
    ).toBe(true);
    expect(summary.allOfficeRuntimeReady).toBe(false);
    expect(summary.selectedSourceDatasets).toBe(34);
  });

  it('rejects omitted or duplicate offices rather than shrinking the denominator', () => {
    const matrix = catalogPlan();
    matrix.offices[1] = matrix.offices[0];
    expect(() => summarizeInventory(matrix)).toThrow(
      'OFFICE_DENOMINATOR_INVALID',
    );
  });

  it('rejects a row count that hides required connections', () => {
    const matrix = catalogPlan();
    matrix.rows.pop();
    expect(() => summarizeInventory(matrix)).toThrow('ROW_DENOMINATOR_INVALID');
  });

  it('does not convert a producer label or selected-source success into live proof', () => {
    const matrix = catalogPlan();
    const summary = summarizeInventory({ ...matrix, productionReady: true });
    expect(summary.allOfficeRuntimeReady).toBe(false);
    expect(
      summary.offices.every(
        (office: { formalRuntimeAcceptance: string }) =>
          office.formalRuntimeAcceptance === 'NOT_RUN',
      ),
    ).toBe(true);
  });

  it('makes the production gate fail without running network or services', () => {
    const result = spawnSync(
      process.execPath,
      ['tools/office-connection/run.mjs', '--check'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(result.status, result.stderr).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.mode).toBe('OFFLINE_READ_ONLY_NO_RUNTIME_REQUESTS');
    expect(report.productionReady).toBe(false);
    expect(
      report.release.authoritativeSourceRequirements.financeBudget
        .missingRuntimeBinding.length,
    ).toBeGreaterThan(0);
    expect(report.release.authorization.implementationMayContinue).toBe(true);
    expect(report.worldStarted).toBe(false);
    expect(report.clockStarted).toBe(false);
  });
});

describe('immutable migration object preparation', () => {
  it('deduplicates the exact manifest sources without changing identities', () => {
    const commit = 'a'.repeat(40);
    expect(
      migrationSourceCommits({
        migrations: [
          { artifact_source_commit: commit },
          { artifact_source_commit: commit },
        ],
      }),
    ).toEqual([commit]);
  });
  it.each(['HEAD', '--all', 'a'.repeat(40) + ';touch /tmp/x', null])(
    'rejects nonimmutable or malformed fetch targets: %s',
    (commit) => {
      expect(() =>
        migrationSourceCommits({
          migrations: [{ artifact_source_commit: commit }],
        }),
      ).toThrow('MIGRATION_SOURCE_COMMIT_INVALID');
    },
  );
  it('rejects a missing manifest instead of reporting zero targets passed', () => {
    expect(() => migrationSourceCommits({ migrations: [] })).toThrow(
      'MIGRATION_MANIFEST_INVALID',
    );
  });
});
