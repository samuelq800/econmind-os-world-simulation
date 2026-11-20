/** Immutable candidate bundling only. No provider API, deploy, credential or DB path. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  lstat,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const POSTWAR_RELEASE_PREPARATION = Object.freeze({
  schemaVersion: 'postwar-read-release-preparation-v1',
  repository: 'https://github.com/samuelq800/econmind-os-world-simulation.git',
  wranglerVersion: '4.148.0',
  target: 'econmind-world-api-staging',
  config: 'config/cloudflare/world-runtime-api.wrangler.jsonc',
  main: 'apps/world-api/cloudflare/runtime-api.mjs',
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function assertImmutableCommit(commit) {
  if (!/^[a-f0-9]{40}$/u.test(commit) || /^0+$/u.test(commit))
    throw Error('FULL_IMMUTABLE_COMMIT_REQUIRED');
}
export function verifyCandidateSource(source, commit) {
  assertImmutableCommit(commit);
  if (!path.isAbsolute(source)) throw Error('ABSOLUTE_SOURCE_REQUIRED');
  const git = (args) =>
    execFileSync('git', ['-C', source, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (
    git(['rev-parse', 'HEAD']) !== commit ||
    git(['remote', 'get-url', 'origin']) !==
      POSTWAR_RELEASE_PREPARATION.repository ||
    git(['status', '--porcelain=v1', '--untracked-files=all'])
  )
    throw Error('EXACT_CLEAN_CANDIDATE_REQUIRED');
  return { commit, tree: git(['rev-parse', 'HEAD^{tree}']) };
}
function parsedJsonc(bytes) {
  const result = ts.parseConfigFileTextToJson(
    'candidate.wrangler.jsonc',
    bytes,
  );
  if (result.error || !result.config || typeof result.config !== 'object')
    throw Error('INVALID_CANDIDATE_WRANGLER_CONFIG');
  return result.config;
}
/** Declaration checks cannot prove a remote binding, privilege or admission. */
export function inspectReadDeclarations(config) {
  const environment = config?.env?.staging;
  if (
    environment?.name !== POSTWAR_RELEASE_PREPARATION.target ||
    config.main !== '../../apps/world-api/cloudflare/runtime-api.mjs' ||
    config.compatibility_date !== '2026-10-09' ||
    JSON.stringify(config.compatibility_flags) !== '["nodejs_compat"]' ||
    config.preview_urls !== false
  )
    throw Error('FIXED_EXISTING_API_TARGET_REQUIRED');
  const blockers = [];
  const metadataText = environment.vars?.POSTWAR_READ_CONFIGURATION_JSON;
  let metadata = null;
  if (environment.vars?.RUNTIME_MODE !== 'ADMITTED_READ_ONLY')
    blockers.push('ADMITTED_READ_ONLY_NOT_DECLARED');
  if (
    typeof metadataText !== 'string' ||
    Buffer.byteLength(metadataText) > 16384
  ) {
    blockers.push('PINNED_SERVER_CONFIGURATION_ABSENT');
  } else {
    try {
      metadata = JSON.parse(metadataText);
    } catch {
      /* blocked below */
    }
    const read = metadata?.read,
      pins = read?.admittedWorldPins;
    const role = /^[a-z][a-z0-9_]{0,62}$/u;
    if (
      metadata?.schemaVersion !== 'postwar-admitted-read-config-v1' ||
      Object.keys(metadata).sort().join('|') !== 'read|schemaVersion' ||
      !role.test(read?.readerRole ?? '') ||
      !role.test(read?.authorizationPublisherRole ?? '') ||
      read?.readerRole === read?.authorizationPublisherRole ||
      [
        'postgres',
        'service_role',
        'supabase_admin',
        'world_v2_postwar_offline_seed_reader',
      ].includes(read?.readerRole) ||
      read?.modelVersion !== 'world-v2-foundation-1' ||
      !/^sha256:[a-f0-9]{64}$/u.test(pins?.contentHash ?? '') ||
      ![
        pins?.worldId,
        pins?.seedRef,
        pins?.admissionRef,
        read?.endpointPins?.deploymentRef,
      ].every(
        (value) =>
          typeof value === 'string' &&
          value.length <= 256 &&
          /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(value) &&
          !/REPLACE|TEST_ONLY|PLACEHOLDER/iu.test(value),
      ) ||
      pins?.minimumWorldVersion !== '0' ||
      read?.endpointPins?.origin !==
        'https://econmind-world-api-staging.observer-lagesan.workers.dev' ||
      read?.endpointPins?.projectionPath !== '/v1/postwar-office-runtime' ||
      read?.endpointPins?.finalLookupPath !== '/v1/final-receipt' ||
      read?.auth?.projectRef !== 'vimksjrhaxdpnkvgsavz' ||
      read?.auth?.expectedIssuer !==
        'https://vimksjrhaxdpnkvgsavz.supabase.co/auth/v1' ||
      read?.auth?.jwksUrl !==
        'https://vimksjrhaxdpnkvgsavz.supabase.co/auth/v1/.well-known/jwks.json' ||
      read?.auth?.audience !== 'authenticated' ||
      !Array.isArray(read?.routeOptions?.allowedOrigins) ||
      read.routeOptions.allowedOrigins.length === 0 ||
      read.routeOptions.allowedOrigins.some(
        (origin) =>
          ![
            'https://world.econmind.group',
            'https://samuelq800.github.io',
          ].includes(origin),
      )
    )
      blockers.push('PINNED_SERVER_CONFIGURATION_INVALID');
  }
  const bindings = environment.hyperdrive;
  if (
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    bindings[0]?.binding !== 'POSTWAR_READER' ||
    !/^[a-f0-9]{32}$/u.test(bindings[0]?.id ?? '') ||
    /^0+$/u.test(bindings[0].id)
  )
    blockers.push('EXISTING_POSTWAR_READER_BINDING_NOT_DECLARED');
  if (
    environment.services?.length !== 1 ||
    environment.services[0]?.binding !== 'WORLD_EXECUTOR' ||
    environment.services[0]?.service !== 'econmind-world-executor-staging'
  )
    throw Error('EXISTING_EXECUTOR_SERVICE_REQUIRED');
  return {
    blockers,
    declaredReadConfigurationValid:
      metadata !== null &&
      !blockers.includes('PINNED_SERVER_CONFIGURATION_INVALID'),
    remoteBindingsVerified: false,
    databasePermissionsVerified: false,
  };
}
export function safeBundleEnvironment(environment, home) {
  // No provider token, proxy credential, dotenv path, Node preload or server DSN.
  return Object.fromEntries(
    Object.entries({
      PATH: environment.PATH,
      SYSTEMROOT: environment.SYSTEMROOT,
      TMPDIR: home,
      HOME: home,
      XDG_CONFIG_HOME: home,
      WRANGLER_SEND_METRICS: 'false',
      CI: 'true',
    }).filter(([, value]) => typeof value === 'string'),
  );
}
export function buildDryRunArguments(output) {
  return [
    'deploy',
    '--dry-run',
    '--autoconfig=false',
    '--install-skills=false',
    '--config',
    path.join(output, 'dry-run.wrangler.json'),
    '--env-file',
    path.join(output, 'empty.env'),
    '--outdir',
    path.join(output, 'bundle'),
    '--metafile',
    path.join(output, 'bundle-meta.json'),
  ];
}
async function hashes(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), {
    withFileTypes: true,
  })) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error('BUNDLE_SYMLINK_DENIED');
    if (entry.isDirectory()) files.push(...(await hashes(directory, name)));
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(directory, name));
      files.push({
        path: name.replaceAll(path.sep, '/'),
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function preparePostwarReadRelease({
  source,
  commit,
  output,
  toolRoot,
}) {
  const identity = verifyCandidateSource(source, commit);
  if (!path.isAbsolute(output) || !path.isAbsolute(toolRoot))
    throw Error('ABSOLUTE_TOOL_AND_OUTPUT_REQUIRED');
  const actualSource = await realpath(source);
  output = path.join(
    await realpath(path.dirname(output)),
    path.basename(output),
  );
  // Isolate generated config, dotenv and bundle from the immutable checkout.
  if (output === actualSource || output.startsWith(actualSource + path.sep))
    throw Error('OUTPUT_MUST_BE_OUTSIDE_SOURCE');
  if (
    await lstat(output).then(
      () => true,
      () => false,
    )
  )
    throw Error('FRESH_OUTPUT_DIRECTORY_REQUIRED');
  const toolPackage = path.join(toolRoot, 'node_modules/wrangler/package.json');
  if (
    JSON.parse(await readFile(toolPackage, 'utf8')).version !==
    POSTWAR_RELEASE_PREPARATION.wranglerVersion
  )
    throw Error('PINNED_WRANGLER_REQUIRED');
  const configBytes = await readFile(
    path.join(source, POSTWAR_RELEASE_PREPARATION.config),
    'utf8',
  );
  const candidateConfig = parsedJsonc(configBytes);
  const declarations = inspectReadDeclarations(candidateConfig);
  await mkdir(output, { recursive: true });
  const home = path.join(output, 'isolated-home');
  await mkdir(home);
  await writeFile(path.join(output, 'empty.env'), '');
  // Only known build options survive; candidate custom-build hooks, unsafe
  // bindings, queues, cron, assets, route and account settings are never copied.
  const bundleConfig = {
    name: POSTWAR_RELEASE_PREPARATION.target,
    main: path.join(source, POSTWAR_RELEASE_PREPARATION.main),
    compatibility_date: '2026-10-09',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    preview_urls: false,
    vars: { RUNTIME_MODE: 'ADMITTED_READ_ONLY' },
    services: [
      { binding: 'WORLD_EXECUTOR', service: 'econmind-world-executor-staging' },
    ],
  };
  // The bundle does not need a real DSN/binding or sensitive config. Declaration
  // identity is hashed separately and explicitly remains unverified remotely.
  const generatedConfig = path.join(output, 'dry-run.wrangler.json');
  await writeFile(
    generatedConfig,
    JSON.stringify(bundleConfig, null, 2) + '\n',
  );
  const args = buildDryRunArguments(output);
  const cli = path.join(toolRoot, 'node_modules/wrangler/bin/wrangler.js');
  let child;
  try {
    child = execFileSync(process.execPath, [cli, ...args], {
      cwd: output,
      env: safeBundleEnvironment(process.env, home),
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    await writeFile(
      path.join(output, 'dry-run.log'),
      String(error.stdout ?? '') + String(error.stderr ?? ''),
    );
    await writeFile(
      path.join(output, 'preparation.json'),
      JSON.stringify(
        {
          schemaVersion: POSTWAR_RELEASE_PREPARATION.schemaVersion,
          source: identity,
          bundleResult: 'FAIL',
          configurationPreflight: declarations,
          failure: 'ACTUAL_API_BUNDLE_FAILED',
          deploymentReady: false,
          cloudPublication: 'NOT_RUN',
          databaseContact: false,
          worldClockStarted: false,
        },
        null,
        2,
      ) + '\n',
    );
    throw Error('ACTUAL_API_BUNDLE_FAILED', { cause: error });
  }
  await writeFile(path.join(output, 'dry-run.log'), child);
  const bundleFiles = await hashes(path.join(output, 'bundle'));
  if (!bundleFiles.some((file) => file.path.endsWith('.js') && file.bytes > 0))
    throw Error('ACTUAL_API_BUNDLE_REQUIRED');
  verifyCandidateSource(source, commit);
  const result = {
    schemaVersion: POSTWAR_RELEASE_PREPARATION.schemaVersion,
    artifactPurpose: 'CODE_BUNDLE_ONLY_NOT_DEPLOYMENT_PACKAGE',
    source: identity,
    wranglerVersion: POSTWAR_RELEASE_PREPARATION.wranglerVersion,
    candidateConfigSha256: sha256(configBytes),
    bundleConfigurationSha256: sha256(await readFile(generatedConfig)),
    bundleMetadataSha256: sha256(
      await readFile(path.join(output, 'bundle-meta.json')),
    ),
    serverConfigurationEmbedded: false,
    databaseBindingIncluded: false,
    bundleFiles,
    bundleResult: 'PASS',
    configurationPreflight: declarations,
    deploymentReady: false,
    cloudPublication: 'NOT_RUN',
    productionContact: false,
    databaseContact: false,
    worldClockStarted: false,
    unverifiedReleaseRequirements: [
      ...declarations.blockers,
      'FINAL_CANDIDATE_CHECKS_AND_INDEPENDENT_REVIEW',
      'REMOTE_EXISTING_BINDING_AND_QUERY_CACHE_DISABLED',
      'MAIN_REPOSITORY_SQL_GRANTS_AND_SIGNED_ADMISSION',
      'CURRENT_WORKER_VERSION_AND_ROLLBACK_PIN',
      'PROTECTED_ENVIRONMENT_PUBLICATION_APPROVAL',
    ],
  };
  await writeFile(
    path.join(output, 'preparation.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (
    args.length !== 8 ||
    !['--source', '--commit', '--output', '--tool-root'].every(
      (name, index) => args[index * 2] === name,
    )
  )
    throw Error(
      'USAGE: --source ABS --commit SHA --output FRESH_ABS --tool-root ABS',
    );
  preparePostwarReadRelease({
    source: args[1],
    commit: args[3],
    output: args[5],
    toolRoot: args[7],
  }).then(
    (result) => process.stdout.write(JSON.stringify(result) + '\n'),
    () => {
      process.stderr.write(
        'POSTWAR_RELEASE_PREPARATION_FAILED; no publication attempted\n',
      );
      process.exitCode = 1;
    },
  );
}
