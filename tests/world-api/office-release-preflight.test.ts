import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  planOfficeRelease,
  runReleasePreflight,
} from '../../tools/office-connection/release-preflight.mjs';

describe('offline office release preflight', () => {
  it('reports actual formal host and Finance budget implementation gaps', async () => {
    const report = await planOfficeRelease({ env: {} });
    expect(report.status).toBe('BLOCKED');
    expect(report.productionReady).toBe(false);
    expect(
      report.blockers.find((b) => b.code === 'FORMAL_RUNTIME_HOST_UNAVAILABLE')
        ?.observation,
    ).toBe('SOURCE_BLOCK_CONFIRMED');
    expect(
      report.blockers.find(
        (b) => b.code === 'FINANCE_BUDGET_SOURCE_AND_CONSUMER_UNAVAILABLE',
      )?.observation,
    ).toBe('SOURCE_BLOCK_CONFIRMED');
    expect(report.controlledPaths.database.callerRegistration).toBe(
      'NOT_REGISTERED',
    );
    expect(report.offices.finance.budgetIntent).toBe(
      'SCHEMA_ONLY_RUNTIME_REJECTED',
    );
  });

  it('separates historical gates from actionable engineering and final-candidate review', async () => {
    const report = await planOfficeRelease({ env: {} });
    expect(report.authorization.implementationMayContinue).toBe(true);
    expect(report.authorization.finalCandidateApprovalClaimed).toBe(false);
    expect(report.context[0].category).toBe('HISTORICAL_GOVERNANCE_CONTEXT');
    expect(report.context[0].blocksImplementation).toBe(false);
    expect(
      report.blockers.every(
        (b) => b.category !== 'HISTORICAL_GOVERNANCE_CONTEXT',
      ),
    ).toBe(true);
    expect(
      report.blockers.find((b) => b.code === 'FORMAL_RUNTIME_HOST_UNAVAILABLE')
        ?.category,
    ).toBe('CODE_IMPLEMENTATION_GAP');
    expect(
      report.blockers.find((b) => b.category === 'FINAL_CANDIDATE_REVIEW')
        ?.observation,
    ).toBe('FINAL_CANDIDATE_NOT_PREPARED');
  });

  it('gives bounded owner actions, precise source facts and no token-scope conclusion', async () => {
    const report = await planOfficeRelease({ env: {} });
    expect(
      report.userActions.find((a) => a.id === 'NETWORK_GITHUB_REST')
        ?.tokenPermissionStatus,
    ).toBe('NOT_EVALUABLE_BEFORE_CONNECT_SUCCEEDS');
    const configuration =
      report.userActions.find(
        (a) => a.id === 'VERIFY_EXISTING_PUBLISHER_CONFIGURATION',
      )?.configuration ?? [];
    expect(
      configuration.some(
        (c) =>
          c.name === 'CLOUDFLARE_API_TOKEN' &&
          c.target === 'World GitHub Actions secret',
      ),
    ).toBe(true);
    expect(
      report.authoritativeSourceRequirements.centralBankOmo.missingRuntimeBinding.join(
        ' ',
      ),
    ).toContain('pricePerFace');
    expect(
      report.authoritativeSourceRequirements.financeBudget.missingRuntimeBinding.join(
        ' ',
      ),
    ).toContain('effectivePeriod');
    expect(report.authoritativeSourceRequirements.evidenceStatus).toBe(
      'REQUIRED_CONTRACT_FACTS_NOT_PROOF_DATA_IS_ABSENT',
    );
  });

  it('cannot turn credential presence or fabricated approval env into readiness, and never prints values', async () => {
    const marker = 'TEST_ONLY_VALUE_MUST_NEVER_APPEAR';
    const report = await planOfficeRelease({
      env: {
        GH_TOKEN: marker,
        SUPABASE_ACCESS_TOKEN: marker,
        RUNTIME_MODE: 'ACTIVE',
        OWNER_APPROVED: 'true',
      },
    });
    expect(
      report.credentials.find((c) => c.name === 'GH_TOKEN')?.localEnvironment,
    ).toBe('PRESENT_UNVERIFIED');
    expect(JSON.stringify(report)).not.toContain(marker);
    expect(report.productionReady).toBe(false);
    expect(report.executionSupported).toBe(false);
    expect(report.worldStarted).toBe(false);
    expect(report.clockStarted).toBe(false);
  });

  it('fails closed when source and governance evidence cannot be read', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'office-preflight-'));
    try {
      const report = await planOfficeRelease({ root, env: {} });
      expect(report.status).toBe('BLOCKED');
      expect(report.gate).toBeNull();
      expect(report.blockers[0].observation).toBe('UNAVAILABLE');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('supports only a read-only plan or a failing readiness check', async () => {
    expect((await runReleasePreflight([], { env: {} })).exitCode).toBe(0);
    expect((await runReleasePreflight(['--plan'], { env: {} })).exitCode).toBe(
      0,
    );
    expect((await runReleasePreflight(['--check'], { env: {} })).exitCode).toBe(
      2,
    );
    expect((await runReleasePreflight(['check'], { env: {} })).exitCode).toBe(
      2,
    );
    for (const mode of [
      'deploy',
      'publish',
      'activate',
      'rollback',
      'plan --approve',
    ]) {
      const result = await runReleasePreflight([mode], { env: {} });
      expect(result.exitCode).toBe(2);
      expect(result.report.code).toBe('READ_ONLY_PLAN_OR_CHECK_REQUIRED');
    }
  });
});
