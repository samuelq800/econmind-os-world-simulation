// PREPARATION_ONLY_NOT_V09_2_STARTED. Never mounts the production application.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSocialOfficeHostBuild } from './build-host.mjs';

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
