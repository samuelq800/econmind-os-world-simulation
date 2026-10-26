// PREPARATION_ONLY_NOT_V09_2_STARTED. Never mounts the production application.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectSocialOfficeHostBuild } from './build-host.mjs';

/** Fixed tool-owned data bridge. This constructs data; it installs no state. */
export async function loadFixedSelectedSocialOfficeScenario(...args) {
  assert.equal(args.length, 0, 'SOCIAL_HOST_SCENARIO_NO_ARGUMENTS');
  inspectSocialOfficeHostBuild();
  const [financeModule, core, scenarioModule] = await Promise.all([
    import('./check-opening-finance.mjs'),
    import('@econmind/core'),
    import('../../apps/world-worker/dist/social-office-demo/scenario-input.js'),
  ]);
  const finance = financeModule.selectOpeningFinanceCandidateData(
    financeModule.readOpeningFinanceDistribution(),
    {
      meaning: 'ACCRUAL',
      domainVariant: 'G_DOMAIN_BASELINE_PROPOSAL',
      financeOptionId: 'SIM_SOCIAL_OPENING_BASELINE_V1_PROPOSAL',
    },
  );
  const scenario = await scenarioModule.loadSocialOfficeDemoScenario({
    openingFinanceCandidateUtf8: core.canonicalSerialize(finance),
  });
  assert.equal(
    scenario.rootSelectionSHA256,
    'b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036',
    'SOCIAL_HOST_SELECTED_RECORD_CHANGED',
  );
  assert.equal(scenario.sourceClass, 'SIMULATED_OPENING');
  assert.equal(scenario.sourceAdmitted, false);
  return scenario;
}

/** Loads the owned installer without invoking it or creating native resources. */
export async function inspectIsolatedSocialOfficeHostPreflight(...args) {
  assert.equal(args.length, 0, 'SOCIAL_HOST_PREFLIGHT_NO_ARGUMENTS');
  const build = inspectSocialOfficeHostBuild();
  const scenario = await loadFixedSelectedSocialOfficeScenario();
  const installerPath = path.join(
    build.directory,
    'server/tests/support/social-office-atomic-fixture.js',
  );
  const installerRelative = path.relative(build.manifest.root, installerPath);
  assert(
    build.manifest.outputs.some((p) => p.path === installerRelative),
    'SOCIAL_HOST_INSTALLER_OUTPUT_NOT_BOUND',
  );
  const schemas = [
    'database/proposals/runtime-read-binding-storage.sql',
    'tests/support/social-office-simulated-source-schema.sql',
    'tests/support/social-office-simulated-atomic-schema.sql',
  ].map((name) => {
    const pinned = build.manifest.inputs.find((p) => p.path === name);
    assert(pinned, 'SOCIAL_HOST_SCHEMA_SOURCE_NOT_BOUND');
    return Object.freeze({ ...pinned });
  });
  const installer = await import(pathToFileURL(installerPath).href);
  assert.equal(typeof installer.installFixture, 'function');
  assert.equal(typeof installer.grantFixtureRoles, 'function');
  return Object.freeze({
    status: 'PREFLIGHT_ONLY_NOT_INSTALLED',
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    sourceRoot: build.manifest.root,
    seedId: scenario.seed.seedId,
    seedFingerprint: scenario.seed.fingerprint,
    manifest: build.manifestPin,
    installerOutput: installerRelative,
    schemaSources: Object.freeze(schemas),
    nativeResourcesStarted: false,
    SQLInstalled: false,
    currentAuthorityVerified: false,
    completeOffice: false,
    WorldClock: false,
  });
}

export function inspectIsolatedSocialOfficeLaunch(
  args = process.argv.slice(2),
) {
  if (args.length !== 1 || args[0] !== '--isolated')
    return {
      exitCode: 64,
      status: 'INVALID_ARGUMENTS',
      resourcesStarted: false,
      completeOffice: false,
    };
  const build = inspectSocialOfficeHostBuild();
  // No guessed C/D/G constructors or positive fixture handler. A finite exact
  // interface supplement must precede the actual dependent composition.
  if (!build.manifest.completeCompositionBound)
    return {
      exitCode: 2,
      status: 'NOT_READY',
      missing: [
        'EXACT_G_SERVICE_TRANSPORT_BROWSER',
        'EXACT_D_SCHEMA_ROLES_ATOMIC',
        'EXACT_C_G_SCENARIO_DOMAIN_PERMISSION',
        'EXACT_MIGRATION_EXECUTION_LIST',
      ],
      resourcesStarted: false,
      completeOffice: false,
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      WorldClock: false,
      manifest: build.manifestPin,
    };
  throw Error('SOCIAL_HOST_FIXED_COMPOSITION_IMPLEMENTATION_REQUIRED');
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = inspectIsolatedSocialOfficeLaunch();
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.exitCode;
}
