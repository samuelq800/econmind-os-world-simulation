import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';

import { assessEnvironment } from './environment-policy.mjs';
import { findForbiddenBrowserVariables } from './vite-environment-policy.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const linkMarker = path.join(repositoryRoot, 'supabase/.temp/project-ref');
const worldWebRoot = path.join(repositoryRoot, 'apps/world-web');
const assessment = assessEnvironment(process.env);
const viteModes = ['development', 'production'];
const viteViolations = viteModes.flatMap((mode) =>
  findForbiddenBrowserVariables(loadEnv(mode, worldWebRoot, 'VITE_')).map(
    ({ name, category }) => ({ name, category, mode }),
  ),
);
const uniqueViteViolations = [
  ...new Map(
    viteViolations.map((violation) => [
      `${violation.mode}:${violation.name}`,
      violation,
    ]),
  ).values(),
];

const linkedProjectDetected = await access(linkMarker).then(
  () => true,
  () => false,
);

if (assessment.violations.length > 0 || uniqueViteViolations.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: 'FAIL',
        environment: assessment.name,
        violations: assessment.violations,
        viteEnvironmentViolations: uniqueViteViolations,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      environment: assessment.name,
      databaseConfigured: assessment.databaseConfigured,
      validatedViteModes: viteModes,
      linkedSupabaseProject: linkedProjectDetected
        ? 'PRODUCTION_INTEGRATION_TARGET_ONLY'
        : 'NOT_LINKED',
      databaseMutationAllowed: false,
    },
    null,
    2,
  ),
);
