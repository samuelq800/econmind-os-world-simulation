import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Hosting-only release. Neither this runner nor its artifact contains DB keys.
export const HOLD_RELEASE = Object.freeze({
  repository: 'samuelq800/econmind-os-world-simulation',
  commit: 'e7ecf45184baad69a37e2e51fff8862a635267dc',
  tree: '8ac834bca15b11ef517154133c4e6740ae87ff59',
  account: '9bad0b638402dc39700132716e3b312c',
  apiOrigin: 'https://econmind-world-api-staging.observer-lagesan.workers.dev',
  wrangler: '4.148.0',
});
const targets = Object.freeze({
  executor: Object.freeze({
    name: 'econmind-world-executor-staging',
    config: 'config/cloudflare/world-runtime-executor.wrangler.jsonc',
    input: 'executor/hold-executor.js',
    artifact: 'executor.js',
    sha256: '37e92b7229786e61f5b57acfc4c8cbb96b739ac3198a522b98dd688fab0468b9',
  }),
  api: Object.freeze({
    name: 'econmind-world-api-staging',
    config: 'config/cloudflare/world-runtime-api.wrangler.jsonc',
    input: 'api/runtime-api.js',
    artifact: 'api.js',
    sha256: 'b7a07ec01d2f67818ee0753246eddf611543e7480e28c828f108018a2bb209d4',
  }),
});
const sourceOutput = 'artifacts/world-runtime-environment-2026-10-09';
function absolute(value) {
  if (!value || !path.isAbsolute(value))
    throw new Error('ABSOLUTE_PATH_REQUIRED');
  return value;
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export function verifySource(source) {
  absolute(source);
  const git = (args) =>
    execFileSync('git', ['-C', source, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (
    git(['rev-parse', 'HEAD']) !== HOLD_RELEASE.commit ||
    git(['rev-parse', 'HEAD^{tree}']) !== HOLD_RELEASE.tree ||
    git(['status', '--porcelain=v1', '--untracked-files=all']) !== ''
  )
    throw new Error('REVIEWED_HOLD_SOURCE_REQUIRED');
}
export function verifyPublishEnvironment(env) {
  if (
    env.GITHUB_REPOSITORY !== HOLD_RELEASE.repository ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.PUBLISH_CONFIRMATION !== 'PUBLISH_REVIEWED_HOLD'
  )
    throw new Error('MANUAL_MAIN_HOLD_PUBLICATION_REQUIRED');
  if (env.CLOUDFLARE_ACCOUNT_ID !== HOLD_RELEASE.account)
    throw new Error('FIXED_CLOUDFLARE_ACCOUNT_REQUIRED');
  if (!env.CLOUDFLARE_API_TOKEN?.trim())
    throw new Error('CLOUDFLARE_DEPLOY_TOKEN_REQUIRED');
}
export function verifyExistingHold(kind, settings, subdomain, schedules) {
  if (!Object.hasOwn(targets, kind))
    throw new Error('FIXED_HOLD_TARGET_REQUIRED');
  const bindings = settings?.bindings;
  const mode = Array.isArray(bindings)
    ? bindings.find((b) => b.name === 'RUNTIME_MODE')
    : null;
  const service = Array.isArray(bindings)
    ? bindings.find((b) => b.name === 'WORLD_EXECUTOR')
    : null;
  if (
    !Array.isArray(bindings) ||
    bindings.length !== (kind === 'api' ? 2 : 1) ||
    mode?.type !== 'plain_text' ||
    mode.text !== 'HOLD' ||
    (kind === 'api' &&
      (service?.type !== 'service' ||
        service.service !== targets.executor.name ||
        service.environment !== 'production')) ||
    subdomain?.enabled !== (kind === 'api') ||
    subdomain?.previews_enabled !== false ||
    !Array.isArray(schedules?.schedules) ||
    schedules.schedules.length !== 0
  )
    throw new Error('EXISTING_HOLD_TOPOLOGY_REQUIRED');
}
export async function verifyArtifact(root) {
  absolute(root);
  for (const target of Object.values(targets)) {
    if (
      sha256(await readFile(path.join(root, target.artifact))) !== target.sha256
    )
      throw new Error('REVIEWED_HOLD_BUNDLE_REQUIRED');
  }
}
export async function prepare(source, output) {
  verifySource(source);
  absolute(output);
  await mkdir(output, { recursive: true });
  for (const target of Object.values(targets)) {
    const input = path.join(source, sourceOutput, target.input);
    if (sha256(await readFile(input)) !== target.sha256)
      throw new Error('REVIEWED_HOLD_BUNDLE_REQUIRED');
    await copyFile(input, path.join(output, target.artifact));
  }
  const local = JSON.parse(
    await readFile(
      path.join(source, sourceOutput, 'workerd-local-evidence.json'),
      'utf8',
    ),
  );
  if (
    local.result !== 'PASS' ||
    local.checks.length !== 11 ||
    local.checks.some((c) => c.result !== 'PASS') ||
    !local.disposed ||
    local.bundles.api !== targets.api.sha256 ||
    local.bundles.executor !== targets.executor.sha256
  )
    throw new Error('REAL_WORKERD_HOLD_EVIDENCE_REQUIRED');
  await writeFile(
    path.join(output, 'workerd-evidence.json'),
    JSON.stringify(local, null, 2) + '\n',
  );
  await writeFile(
    path.join(output, 'prepared.json'),
    JSON.stringify(
      {
        schemaVersion: 'WORLD_ACTIONS_HOLD_PREPARATION_V1',
        sourceCommit: HOLD_RELEASE.commit,
        sourceTree: HOLD_RELEASE.tree,
        bundleHashes: {
          api: targets.api.sha256,
          executor: targets.executor.sha256,
        },
        productionDatabase: false,
        economicActivation: false,
        cloudPublication: 'NOT_RUN',
      },
      null,
      2,
    ) + '\n',
  );
}
async function boundedJson(response) {
  if (!response.body) throw new Error('RESPONSE_BODY_REQUIRED');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) throw new Error('RESPONSE_LIMIT_EXCEEDED');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export async function publish(source, artifact, toolRoot, env = process.env) {
  verifyPublishEnvironment(env);
  verifySource(source);
  await verifyArtifact(artifact);
  absolute(toolRoot);
  const tool = path.join(toolRoot, 'node_modules/wrangler');
  if (
    JSON.parse(await readFile(path.join(tool, 'package.json'), 'utf8'))
      .version !== HOLD_RELEASE.wrangler
  )
    throw new Error('PINNED_WRANGLER_REQUIRED');
  const cloudRead = async (suffix) => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${HOLD_RELEASE.account}/workers/scripts/${suffix}`,
      {
        headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error('CLOUDFLARE_PREFLIGHT_FAILED');
    const body = await boundedJson(response);
    if (body.success !== true) throw new Error('CLOUDFLARE_PREFLIGHT_FAILED');
    return body.result;
  };
  // Refuse to overwrite a future DB-connected deployment or an unknown target.
  const readTopology = async () => {
    for (const [kind, target] of Object.entries(targets)) {
      const [settings, subdomain, schedules] = await Promise.all([
        cloudRead(`${target.name}/settings`),
        cloudRead(`${target.name}/subdomain`),
        cloudRead(`${target.name}/schedules`),
      ]);
      verifyExistingHold(kind, settings, subdomain, schedules);
    }
  };
  await readTopology();
  const publication = {
    sourceCommit: HOLD_RELEASE.commit,
    cloudPublication: 'UNKNOWN',
    attemptedTargets: [],
    acknowledgedTargets: [],
    databaseConnected: false,
    economicActivation: false,
  };
  const journal = () =>
    writeFile(
      path.join(artifact, 'publication.json'),
      JSON.stringify(publication, null, 2) + '\n',
    );
  await journal();
  for (const target of Object.values(targets)) {
    publication.attemptedTargets.push(target.name);
    await journal();
    const result = spawnSync(
      process.execPath,
      [
        path.join(tool, 'bin/wrangler.js'),
        'deploy',
        path.join(artifact, target.artifact),
        '--no-bundle',
        '--env',
        'staging',
        '--config',
        path.join(source, target.config),
      ],
      {
        cwd: source,
        env: { ...env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
        stdio: 'inherit',
      },
    );
    if (result.error || result.status !== 0)
      throw new Error('HOLD_PUBLICATION_OUTCOME_UNKNOWN_DO_NOT_RETRY');
    publication.acknowledgedTargets.push(target.name);
    await journal();
  }
  await readTopology();
  const health = await fetch(`${HOLD_RELEASE.apiOrigin}/healthz`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const ready = await fetch(`${HOLD_RELEASE.apiOrigin}/readyz`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const h = await boundedJson(health);
  const r = await boundedJson(ready);
  if (
    health.status !== 200 ||
    ready.status !== 503 ||
    r.executorTransport !== 'ALIVE_HOLD' ||
    [h, r].some(
      (b) =>
        b.runtimeMode !== 'HOLD' ||
        b.runtimeReady !== false ||
        b.databaseConnected !== false ||
        b.simulationEnabled !== false ||
        b.clockEnabled !== false ||
        b.authoritativeCommandsEnabled !== false,
    )
  )
    throw new Error('HOLD_PUBLICATION_READBACK_UNCONFIRMED');
  publication.cloudPublication = 'PASS_HOLD_ONLY';
  await journal();
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'source' && args.length === 1) verifySource(args[0]);
    else if (command === 'prepare' && args.length === 2) await prepare(...args);
    else if (command === 'publish' && args.length === 3) await publish(...args);
    else throw new Error('FIXED_ACTIONS_COMMAND_REQUIRED');
    console.log(
      JSON.stringify({ command, result: 'PASS', economicActivation: false }),
    );
  } catch (error) {
    console.error(
      /^[A-Z][A-Z0-9_]+$/u.test(error?.message ?? '')
        ? error.message
        : 'WORLD_ACTIONS_OPERATION_UNCONFIRMED',
    );
    process.exitCode = 1;
  }
}
