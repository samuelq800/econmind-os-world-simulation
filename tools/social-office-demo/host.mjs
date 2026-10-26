// PREPARATION_ONLY_NOT_V09_2_STARTED. Never mounts the production application.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
