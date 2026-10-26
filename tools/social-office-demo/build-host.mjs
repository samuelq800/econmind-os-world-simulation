// PREPARATION_ONLY_NOT_V09_2_STARTED. Fixed owned build, never a service mount.
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cache = path.join(root, 'node_modules/.cache/f-social-office-demo');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const git = (args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
const F_PATHS = [
  'tests/support/f-social-office-isolated-host.ts',
  'tests/support/tsconfig.f-social-office-isolated-host.json',
  'tests/world-core/f-social-office-isolated-host.test.ts',
  'tests/integration/f-social-office-isolated-host-postgres.test.ts',
  'tools/social-office-demo/build-host.mjs',
  'tools/social-office-demo/host.mjs',
];
function pin(filename) {
  const absolute = path.resolve(filename),
    stat = fs.lstatSync(absolute);
  assert(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      fs.realpathSync(absolute) === absolute,
    'HOST_BUILD_REGULAR_CANONICAL_FILE',
  );
  const bytes = fs.readFileSync(absolute);
  return {
    path: path.relative(root, absolute),
    bytes: bytes.length,
    sha256: sha(bytes),
  };
}
function walk(directory) {
  const absolute = path.join(root, directory);
  assert(
    fs.lstatSync(absolute).isDirectory() &&
      !fs.lstatSync(absolute).isSymbolicLink(),
  );
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((item) =>
      item.isDirectory()
        ? walk(directory + '/' + item.name)
        : [pin(path.join(absolute, item.name))],
    );
}
function inputs() {
  const paths = git([
    'ls-files',
    '--',
    'packages/core/src',
    'apps/world-worker/src',
    'apps/world-api/src',
    'apps/world-web/src',
    'data/scenario-candidates/single-social-office-demo-v1',
    'tools/social-office-demo',
    'database/migrations',
    'database/proposals/runtime-read-binding-storage.sql',
    'tests/support/social-office-atomic-fixture.ts',
    'tests/support/social-office-simulated-source-schema.sql',
    'tests/support/social-office-simulated-atomic-schema.sql',
    'tsconfig.base.json',
    'package.json',
    'pnpm-lock.yaml',
    'packages/core/package.json',
    'packages/core/tsconfig.json',
    'packages/core/tsconfig.build.json',
    'apps/world-worker/package.json',
    'apps/world-worker/tsconfig.json',
    'apps/world-worker/tsconfig.build.json',
    'apps/world-api/package.json',
    'apps/world-api/tsconfig.json',
    'apps/world-api/tsconfig.build.json',
  ])
    .split('\n')
    .filter(Boolean);
  // Explicit new sources are captured even during paired precommit development.
  for (const p of F_PATHS) paths.push(p);
  for (const p of ['apps/world-web/social-office-demo.html'])
    if (fs.existsSync(path.join(root, p))) paths.push(p);
  return [...new Set(paths)].sort().map((p) => pin(path.join(root, p)));
}
function packageManager() {
  const candidate = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((dir) => path.join(dir, 'pnpm'))
    .find((p) => fs.existsSync(p));
  assert(candidate, 'PINNED_PNPM_NOT_FOUND');
  const executable = fs.realpathSync(candidate),
    stat = fs.statSync(executable);
  assert(
    stat.isFile() &&
      [0, process.getuid()].includes(stat.uid) &&
      (stat.mode & 0o022) === 0,
    'PNPM_EXECUTABLE_CUSTODY',
  );
  const invoke = (args) => {
    const options = {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        LANG: 'C',
        LC_ALL: 'C',
        ECONMIND_ENV: 'local',
      },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    };
    let result = spawnSync(executable, args, options);
    // pnpm12's documented shebang-less package shim needs its fixed sh
    // interpreter on macOS. Arguments remain separate data, never shell text.
    if (result.error?.code === 'ENOEXEC')
      result = spawnSync('/bin/sh', [executable, ...args], options);
    return result;
  };
  const version = invoke(['--version']);
  assert(
    version.status === 0 && version.stdout.trim() === '12.3.4',
    'PNPM_VERSION_REQUIRED',
  );
  return { executable, invoke };
}

export function inspectSocialOfficeHostBuild() {
  assert.equal(process.versions.node, '24.20.0');
  const pointer = path.join(cache, 'latest.json');
  const pointerPin = pin(pointer),
    selected = JSON.parse(fs.readFileSync(pointer, 'utf8'));
  assert(
    /^build-[a-f0-9]{40}-[a-f0-9]{32}$/u.test(selected.directory),
    'HOST_BUILD_CLOSED_DIRECTORY',
  );
  const manifestPath = path.join(cache, selected.directory, 'manifest.json');
  const manifestPin = pin(manifestPath);
  assert.equal(
    manifestPin.sha256,
    selected.manifestSha256,
    'HOST_BUILD_MANIFEST_CHANGED',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 'F_SOCIAL_OFFICE_OWNED_BUILD_V1');
  assert.equal(manifest.root, fs.realpathSync(root), 'FOREIGN_HOST_WORKSPACE');
  assert.equal(manifest.head, git(['rev-parse', 'HEAD']), 'HOST_HEAD_CHANGED');
  assert.equal(
    manifest.tree,
    git(['rev-parse', 'HEAD^{tree}']),
    'HOST_TREE_CHANGED',
  );
  assert.deepEqual(inputs(), manifest.inputs, 'HOST_SOURCE_CHANGED');
  for (const expected of manifest.outputs)
    assert.deepEqual(
      pin(path.join(root, expected.path)),
      expected,
      'HOST_OUTPUT_CHANGED',
    );
  const core = fs.realpathSync(
    fileURLToPath(import.meta.resolve('@econmind/core')),
  );
  assert.equal(
    core,
    path.join(root, 'packages/core/dist/index.js'),
    'FOREIGN_CORE_WORKSPACE_LINK',
  );
  return {
    manifest,
    manifestPin,
    pointerPin,
    directory: path.join(cache, selected.directory),
  };
}

export async function buildSocialOfficeHost() {
  assert.equal(process.versions.node, '24.20.0');
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      .packageManager,
    'pnpm@12.3.4',
  );
  const pm = packageManager(),
    head = git(['rev-parse', 'HEAD']),
    before = inputs();
  const directoryName =
    'build-' + head + '-' + randomUUID().replaceAll('-', '');
  const directory = path.join(cache, directoryName);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const commands = [];
  const execute = (args) => {
    const start = new Date().toISOString(),
      result = pm.invoke(args),
      number = commands.length + 1;
    fs.writeFileSync(
      path.join(directory, `${number}.stdout.txt`),
      result.stdout ?? '',
      { flag: 'wx' },
    );
    fs.writeFileSync(
      path.join(directory, `${number}.stderr.txt`),
      result.stderr ?? '',
      { flag: 'wx' },
    );
    const receipt = {
      args,
      start,
      end: new Date().toISOString(),
      status: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
    };
    commands.push(receipt);
    fs.writeFileSync(
      path.join(directory, `${number}.receipt.json`),
      JSON.stringify(receipt, null, 2) + '\n',
      { flag: 'wx' },
    );
    assert(
      result.status === 0 && !result.error,
      `HOST_BUILD_COMMAND_FAILED_${number}`,
    );
  };
  for (const pkg of [
    '@econmind/core',
    '@econmind/world-worker',
    '@econmind/world-api',
  ])
    execute(['--filter', pkg, 'build']);
  execute([
    'exec',
    'tsc',
    '-p',
    'tests/support/tsconfig.f-social-office-isolated-host.json',
    '--outDir',
    path.join(directory, 'server'),
  ]);
  let browser = {
    status: 'NOT_BOUND',
    reason:
      'G dedicated browser source not present in this infrastructure candidate',
  };
  if (
    fs.existsSync(path.join(root, 'apps/world-web/social-office-demo.html'))
  ) {
    const { build } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    await build({
      root: path.join(root, 'apps/world-web'),
      configFile: false,
      envFile: false,
      envDir: false,
      plugins: [react()],
      build: {
        outDir: path.join(directory, 'browser'),
        emptyOutDir: false,
        sourcemap: false,
        rollupOptions: {
          input: path.join(root, 'apps/world-web/social-office-demo.html'),
        },
      },
    });
    browser = {
      status: 'BUILT_NOT_DEMONSTRATED',
      entry: 'social-office-demo.html',
    };
  }
  assert.deepEqual(inputs(), before, 'HOST_SOURCE_CHANGED_DURING_BUILD');
  assert.equal(
    git(['rev-parse', 'HEAD']),
    head,
    'HOST_HEAD_CHANGED_DURING_BUILD',
  );
  const outputs = [
    ...walk('packages/core/dist'),
    ...walk('apps/world-worker/dist'),
    ...walk('apps/world-api/dist'),
    ...walk(path.relative(root, path.join(directory, 'server'))),
    ...(browser.status === 'NOT_BOUND'
      ? []
      : walk(path.relative(root, path.join(directory, 'browser')))),
  ];
  const manifest = {
    schemaVersion: 'F_SOCIAL_OFFICE_OWNED_BUILD_V1',
    root: fs.realpathSync(root),
    head,
    tree: git(['rev-parse', 'HEAD^{tree}']),
    gitStatus: git(['status', '--porcelain']),
    sourceClass: 'SIMULATED_OPENING',
    node: process.versions.node,
    packageManager: '12.3.4',
    packageManagerExecutable: pm.executable,
    inputs: before,
    outputs,
    commands,
    browser,
    completeCompositionBound: false,
    completeOffice: false,
    sourceAdmitted: false,
    WorldClock: false,
  };
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { flag: 'wx' },
  );
  const manifestPin = pin(path.join(directory, 'manifest.json'));
  const temporary = path.join(cache, 'pointer-' + randomUUID() + '.json');
  fs.writeFileSync(
    temporary,
    JSON.stringify({
      directory: directoryName,
      manifestSha256: manifestPin.sha256,
    }) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  fs.renameSync(temporary, path.join(cache, 'latest.json'));
  return inspectSocialOfficeHostBuild();
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.slice(2).join(' ') !== '--build') {
    process.stderr.write(
      'Only --build is supported; no runtime resources started.\n',
    );
    process.exitCode = 64;
  } else {
    const result = await buildSocialOfficeHost();
    process.stdout.write(
      JSON.stringify({
        classification: 'OWNED_INFRASTRUCTURE_BUILD_NOT_OFFICE_ACCEPTANCE',
        manifest: result.manifestPin,
        browser: result.manifest.browser,
        completeOffice: false,
        sourceAdmitted: false,
      }) + '\n',
    );
  }
}
