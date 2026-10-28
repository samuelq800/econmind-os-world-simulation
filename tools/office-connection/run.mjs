/** Offline orchestration. Inventory and mechanism tests never certify live authority. */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { plan as catalogPlan } from './catalog.mjs';
import { socialConnectionPlan } from './social-workflow.mjs';
import { planOfficeRelease } from './release-preflight.mjs';
import { buildRunPlan, loadCases } from './acceptance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const offices = [
  'CAPTAIN',
  'FINANCE',
  'CENTRAL_BANK',
  'INDUSTRY',
  'TRADE',
  'SOCIAL',
];

export function summarizeInventory(matrix) {
  if (matrix?.schemaVersion !== 'office-connection-acceptance-matrix-v1')
    throw Error('INVENTORY_SCHEMA_INVALID');
  if (
    !Array.isArray(matrix.offices) ||
    matrix.offices.length !== offices.length ||
    new Set(matrix.offices.map((item) => item.officeId)).size !==
      offices.length ||
    offices.some(
      (office) => !matrix.offices.some((item) => item.officeId === office),
    )
  )
    throw Error('OFFICE_DENOMINATOR_INVALID');
  const rows = matrix.offices.reduce(
    (total, office) => total + office.catalogRows,
    0,
  );
  if (
    rows !== matrix.denominators.catalogRows ||
    matrix.rows.length !== matrix.denominators.totalRows ||
    matrix.denominators.totalRows !== rows + matrix.denominators.pageCommandRows
  )
    throw Error('ROW_DENOMINATOR_INVALID');
  return {
    counts: matrix.counts,
    denominators: matrix.denominators,
    offices: matrix.offices.map((office) => ({
      ...office,
      formallyVerifiedRows: 0,
      selectedCountryInstanceTargets:
        office.catalogRows * matrix.counts.selectedCountries,
      formalRuntimeAcceptance: 'NOT_RUN',
      reason: 'OFFLINE_INVENTORY_CANNOT_CERTIFY_LIVE_AUTHORITY',
    })),
    selectedSourceDatasets: matrix.selectedSources.length,
    unclassifiedDynamicCommandExpressions:
      matrix.unclassifiedDynamicCommandExpressions,
    allOfficeRuntimeReady: false,
  };
}

export async function planAllOfficeConnections() {
  const matrix = catalogPlan();
  const inventory = summarizeInventory(matrix);
  const release = await planOfficeRelease();
  const social = socialConnectionPlan();
  const acceptance = buildRunPlan(loadCases());
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return {
    schemaVersion: 'all-office-connection-workflow-v1',
    mode: 'OFFLINE_READ_ONLY_NO_RUNTIME_REQUESTS',
    generatedAt: new Date().toISOString(),
    candidate: {
      commit: git(['rev-parse', 'HEAD']),
      tree: git(['rev-parse', 'HEAD^{tree}']),
      workingTreeDirty: git(['status', '--porcelain']).length > 0,
      inventoryBaseCommit: matrix.sourceCommit,
    },
    ...inventory,
    formallyVerifiedCountryOfficePairs: 0,
    productionReady: false,
    worldStarted: false,
    clockStarted: false,
    release: {
      blockers: release.blockers,
      context: release.context ?? null,
      userActions: release.userActions ?? [],
      executionSupported: release.executionSupported,
    },
    social: {
      sourceClass: social.sourceClass,
      sourceAdmitted: false,
      evidence: social.evidence,
      blockers: social.blockers,
    },
    mechanismCases: acceptance.cases.map(
      ({ id, availability, backend, execution, status }) => ({
        id,
        availability,
        backend,
        execution,
        status,
      }),
    ),
    evidenceRule:
      'Run acceptance cases separately. TEST_ONLY/SIMULATED/PASS_TEST_ONLY, historical CI, skips and source-only DTOs never increment formal live counts.',
    next: {
      provenance: 'node tools/office-connection/provenance.mjs --check',
      fullMatrix: 'node tools/office-connection/catalog.mjs --plan',
      mechanisms: 'node tools/office-connection/acceptance.mjs plan',
      social: 'node tools/office-connection/social-workflow.mjs --plan',
      native: 'node tools/office-connection/native-evidence.mjs --plan',
      release: 'node tools/office-connection/release-preflight.mjs --plan',
    },
  };
}

export async function main(args) {
  const mode = args[0] ?? '--plan';
  if (
    !['--plan', '--check'].includes(mode) ||
    !(args.length <= 1 || (args.length === 3 && args[1] === '--out' && args[2]))
  )
    throw Error('Use --plan or --check, optionally --out NEW_REPORT_PATH');
  const result = await planAllOfficeConnections();
  const body = JSON.stringify(result, null, 2) + '\n';
  if (args[1] === '--out') {
    const output = path.resolve(root, args[2]);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, body, { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write(body);
  return mode === '--check' ? 2 : 0;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        `OFFICE_CONNECTION_WORKFLOW_FAILED: ${error.message}\n`,
      );
      process.exitCode = 1;
    });
}
