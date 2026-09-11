import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  V09_STAGING_APPROVAL_RELATIVE_PATH,
  assertNoLinkedSupabaseProject,
  buildV09StagingDryRunPlan,
  parseV09StagingApproval,
} from './v09-staging-evidence-policy.mjs';
import { runV09DedicatedStagingEvidence } from './v09-staging-evidence-runner.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const approvalPath = path.join(
  repositoryRoot,
  V09_STAGING_APPROVAL_RELATIVE_PATH,
);
const linkedProjectPath = path.join(
  repositoryRoot,
  'supabase/.temp/project-ref',
);

function fail(message) {
  throw new Error(`V09 dedicated staging plan failed closed: ${message}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readApproval() {
  let raw;
  try {
    raw = await readFile(approvalPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      fail(
        `missing exact owner approval contract ${V09_STAGING_APPROVAL_RELATIVE_PATH}`,
      );
    }
    throw error;
  }
  try {
    return parseV09StagingApproval(JSON.parse(raw));
  } catch (error) {
    fail(`invalid owner approval contract: ${errorMessage(error)}`);
  }
}

async function readLinkedProjectRef() {
  try {
    return (await readFile(linkedProjectPath, 'utf8')).trim();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (
    arguments_.length > 1 ||
    (arguments_[0] !== undefined &&
      arguments_[0] !== '--dry-run' &&
      arguments_[0] !== '--execute')
  ) {
    fail('only --dry-run or the explicit one-shot --execute mode is supported');
  }
  const approval = await readApproval();
  const linkedProjectRef = await readLinkedProjectRef();
  assertNoLinkedSupabaseProject(linkedProjectRef);
  if (arguments_[0] === '--execute') {
    const evidence = await runV09DedicatedStagingEvidence({
      approval,
      environment: process.env,
      loadLinkedProjectRef: async () => linkedProjectRef,
    });
    console.log(
      JSON.stringify(
        {
          evidence,
          mode: 'EXECUTE_ONE_SHOT',
          remoteMutation: 'DEDICATED_NAMESPACE_ONLY',
        },
        null,
        2,
      ),
    );
    if (evidence.status !== 'PASS') process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify(
      {
        mode: 'DRY_RUN',
        plan: buildV09StagingDryRunPlan(approval),
        remoteMutation: false,
        status: 'READY_PENDING_SECRET_CONNECTION_AND_APPROVED_ONE_SHOT_RUNNER',
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: errorMessage(error),
          productionAccess: false,
          remoteMutation: false,
          status: 'FAIL_CLOSED',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
