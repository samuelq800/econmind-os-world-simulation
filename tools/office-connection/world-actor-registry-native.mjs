/** Explicitly opt-in disposable native identity tests. No external DSN, source
 * seed, World/Clock, production, repository mount or credential input. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmod, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTOR_NATIVE_IMAGE =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
const testPath = 'tests/world-api/world-actor-identity-registry-native.test.ts';
const sqlPath = 'database/proposals/world-actor-identity-registry.sql';
const sourcePaths = [
  sqlPath,
  'apps/world-api/src/integration/postgres-world-actor-registry.ts',
  testPath,
  'tools/office-connection/world-actor-registry-native.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vitest.config.ts',
  'tsconfig.base.json',
  'apps/world-api/package.json',
  'packages/core/package.json',
  'packages/core/src/ids.ts',
  'packages/core/dist/ids.js',
  'packages/core/dist/errors.js',
  'packages/core/dist/index.js',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const localDocker = ['--host', 'unix:///var/run/docker.sock'];
export function actorNativePlan() {
  return {
    classification: 'PLAN_ONLY_NOT_RUN',
    image: ACTOR_NATIVE_IMAGE,
    postgres: '16.15',
    sourcePaths,
    testPath,
    backend: 'ONE_OWNED_NETWORK_NONE_CONTAINER_UDS_ONLY',
    sources:
      'Tiny fresh TEST_ONLY World-head and unrelated-schema sentinels; no opening seed',
    resources: {
      cpus: 1,
      memory: '512m',
      sharedMemory: '64m',
      sharedBuffers: '16MB',
      maxConnections: 12,
      pgData: 'One owned named volume; removed after owned container',
      expectedDataUpperBound: '128MiB, no full-source initialization',
    },
    required: [
      'Parent native slot released',
      'Pinned image already cached; no image pull',
      'Node24.20.0/pnpm12.3.4 wrapper',
      'Adopt the staged test/runner into the next test checkpoint',
    ],
    effects: [
      'Create new private database/container/volume/socket',
      'Install candidate SQL into that database only',
      'Explicit TEST_ONLY low-privilege LOGIN roles',
      'Two concurrent publisher backends',
      'Retain test results and source hashes',
      'End all pools; remove only nonce-owned resources',
    ],
    never: [
      'Production or shared Supabase',
      'Existing container or reference-template mutation',
      'External PG environment/DSN',
      'World/Clock',
      'Real user actor mapping',
      'Economic commands',
    ],
  };
}

export async function runActorNative({ root, evidenceDirectory }) {
  assert.equal(process.versions.node, '24.20.0', 'PINNED_NODE_REQUIRED');
  root = resolve(root);
  evidenceDirectory = resolve(evidenceDirectory);
  assert.match(
    evidenceDirectory,
    /^(?:\/workspace\/\.cloud-setup\/evidence\/|\/tmp\/)/u,
    'OWNED_LOCAL_EVIDENCE_DIRECTORY_REQUIRED',
  );
  await mkdir(evidenceDirectory, { recursive: false, mode: 0o700 });
  const commands = [];
  const evidenceIoFailures = [];
  async function command(binary, args, options = {}) {
    const start = new Date().toISOString();
    const result = await new Promise((done, reject) => {
      const child = spawn(binary, args, {
        cwd: root,
        env: options.env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      const chunks = { stdout: [], stderr: [] };
      let count = 0;
      let oversized = false;
      const collect = (kind, bytes) => {
        count += bytes.length;
        if (count > 4 * 1024 * 1024) {
          oversized = true;
          child.kill('SIGTERM');
        } else chunks[kind].push(bytes);
      };
      child.stdout.on('data', (b) => collect('stdout', b));
      child.stderr.on('data', (b) => collect('stderr', b));
      child.once('error', reject);
      child.once('close', (code, signal) =>
        done({
          code,
          signal,
          oversized,
          stdout: Buffer.concat(chunks.stdout).toString(),
          stderr: Buffer.concat(chunks.stderr).toString(),
        }),
      );
    });
    const index = commands.length + 1;
    const stdout = `${index}.stdout.log`;
    const stderr = `${index}.stderr.log`;
    commands.push({
      binary,
      args,
      startedAt: start,
      endedAt: new Date().toISOString(),
      exitCode: result.code,
      signal: result.signal,
      oversized: result.oversized,
      stdout,
      stdoutSha256: digest(result.stdout),
      stderr,
      stderrSha256: digest(result.stderr),
    });
    try {
      await writeFile(join(evidenceDirectory, stdout), result.stdout);
      await writeFile(join(evidenceDirectory, stderr), result.stderr);
    } catch (error) {
      evidenceIoFailures.push({ command: index, error: String(error) });
      if (options.requireEvidence !== false) throw error;
    }
    if (options.requireZero !== false)
      assert.equal(
        result.code,
        0,
        `${binary} failed; inspect owned evidence command ${index}`,
      );
    return result;
  }
  const docker = (args, options) =>
    command('docker', [...localDocker, ...args], options);
  // A parent may execute the review-only staging files before adopting them.
  // All product/database/dependency imports must still resolve to this exact
  // frozen repository, never to alternate staging implementations.
  const runnerRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const staged = runnerRoot !== root;
  if (staged) {
    for (const directory of ['apps', 'database', 'node_modules'])
      assert.equal(
        await realpath(join(runnerRoot, directory)),
        await realpath(join(root, directory)),
        'STAGED_PRODUCT_AND_DEPENDENCY_ROOT_MISMATCH',
      );
  }
  const actualSourcePath = (path) =>
    join(
      staged &&
        [
          testPath,
          'tools/office-connection/world-actor-registry-native.mjs',
        ].includes(path)
        ? runnerRoot
        : root,
      path,
    );
  async function sourcePins() {
    return Promise.all(
      sourcePaths.map(async (path) => ({
        path,
        actualPath: actualSourcePath(path),
        sha256: digest(await readFile(actualSourcePath(path))),
      })),
    );
  }
  const pins = await sourcePins();
  assert.equal(
    (await command('pnpm', ['--version'])).stdout.trim(),
    '12.3.4',
    'PINNED_PNPM_REQUIRED',
  );
  const commit = (await command('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const status = (await command('git', ['status', '--porcelain=v1'])).stdout;
  const nonce = randomUUID().replaceAll('-', '');
  const ownedContainer = 'econmind-actor-native-' + nonce;
  const volume = 'econmind-actor-native-data-' + nonce;
  const socket = join(evidenceDirectory, 'socket');
  await mkdir(socket, { mode: 0o777 });
  await chmod(socket, 0o777);
  const marker = {
    schema: 'WORLD_ACTOR_NATIVE_OWNED_V1',
    image: ACTOR_NATIVE_IMAGE,
    nonce,
    ownedContainer,
    socket,
    database: 'actor_registry_' + nonce,
    evidenceDirectory,
    sqlSha256: pins.find((p) => p.path === sqlPath).sha256,
  };
  const markerPath = join(evidenceDirectory, 'owned-marker.json');
  await writeFile(markerPath, JSON.stringify(marker, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  const require = createRequire(join(root, 'apps/world-api/package.json'));
  const { Pool } = require('pg');
  let admin;
  let volumeAttempted = false;
  let containerAttempted = false;
  let testRun;
  let report;
  let primary;
  let result;
  const cleanup = {
    containerRemoved: false,
    volumeRemoved: false,
    failures: [],
  };
  try {
    // Local cached image only. No registry pull or fallback PostgreSQL version.
    await docker(['image', 'inspect', ACTOR_NATIVE_IMAGE]);
    volumeAttempted = true;
    await docker([
      'volume',
      'create',
      '--label',
      'econmind.actor.nonce=' + nonce,
      volume,
    ]);
    containerAttempted = true;
    await docker([
      'run',
      '--detach',
      '--pull=never',
      '--name',
      ownedContainer,
      '--label',
      'econmind.actor.nonce=' + nonce,
      '--network',
      'none',
      '--cpus',
      '1',
      '--memory',
      '512m',
      '--shm-size',
      '64m',
      '--read-only',
      '--mount',
      `type=volume,src=${volume},dst=/var/lib/postgresql/data`,
      '--tmpfs',
      '/tmp:rw,nosuid,size=32m',
      '--mount',
      `type=bind,src=${socket},dst=/var/run/postgresql`,
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      ACTOR_NATIVE_IMAGE,
      'postgres',
      '-c',
      'listen_addresses=',
      '-c',
      'unix_socket_directories=/var/run/postgresql',
      '-c',
      'unix_socket_permissions=0777',
      '-c',
      'shared_buffers=16MB',
      '-c',
      'max_connections=12',
      '-c',
      'timezone=UTC',
    ]);
    admin = new Pool({
      host: socket,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 1000,
      idleTimeoutMillis: 1000,
      application_name: 'ACTOR_NATIVE_OWNED_RUNNER',
    });
    admin.on('error', (error) => {
      cleanup.failures.push('IDLE_ADMIN:' + error.message);
    });
    let ready = false;
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      const probe = await docker(
        ['exec', ownedContainer, 'cat', '/proc/1/comm'],
        { requireZero: false },
      );
      if (probe.code === 0 && probe.stdout.trim() === 'postgres') {
        let version;
        try {
          version = await admin.query(
            "select current_setting('server_version_num')as version",
          );
        } catch {
          /* Only an owned startup readiness retry, no alternate backend. */
        }
        if (version) {
          assert.equal(version.rows[0].version, '160015');
          ready = true;
          break;
        }
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    assert(ready, 'OWNED_PG16_15_STARTUP_REQUIRED');
    await admin.query(`create database "${marker.database}"`);
    await admin.end();
    admin = undefined;
    const childEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'C',
      LC_ALL: 'C',
      CI: 'true',
      NO_COLOR: '1',
      ECONMIND_ACTOR_REGISTRY_NATIVE_TESTS: '1',
      ECONMIND_ACTOR_REGISTRY_NATIVE_MARKER: markerPath,
    };
    const testArgs = [testPath];
    let stagedConfig;
    if (staged) {
      stagedConfig = join(evidenceDirectory, 'native.vitest.config.mjs');
      const config = `export default ${JSON.stringify({
        root: runnerRoot,
        test: {
          include: [testPath],
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      })};\n`;
      await writeFile(stagedConfig, config, { flag: 'wx' });
      testArgs.push('--config', stagedConfig);
    }
    testRun = await command(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        ...testArgs,
        '--reporter=default',
        '--reporter=json',
        '--outputFile=' + join(evidenceDirectory, 'native.vitest.json'),
      ],
      { requireZero: false, env: childEnv },
    );
    report = JSON.parse(
      await readFile(join(evidenceDirectory, 'native.vitest.json'), 'utf8'),
    );
    assert.equal(testRun.code, 0, 'ACTOR_NATIVE_TEST_EXIT_NONZERO');
    assert(report.numPassedTests > 0, 'ACTUAL_NATIVE_ASSERTIONS_REQUIRED');
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    assert.deepEqual(
      await sourcePins(),
      pins,
      'SOURCE_CHANGED_DURING_NATIVE_ATTEMPT',
    );
  } catch (error) {
    primary = error;
  } finally {
    if (admin)
      try {
        await admin.end();
      } catch (error) {
        cleanup.failures.push('ADMIN_END:' + String(error));
      }
    // Evidence preservation and owned removal remain separate even on log IO
    // failure; never operate on an unverified foreign name/volume.
    if (containerAttempted) {
      try {
        await docker(['logs', ownedContainer], {
          requireZero: false,
          requireEvidence: false,
        });
      } catch (error) {
        cleanup.failures.push('PRESERVE_LOGS:' + String(error));
      }
      try {
        const owned = await docker(
          [
            'inspect',
            '--format',
            '{{index .Config.Labels "econmind.actor.nonce"}}',
            ownedContainer,
          ],
          { requireZero: false, requireEvidence: false },
        );
        if (owned.code === 0) {
          assert.equal(
            owned.stdout.trim(),
            nonce,
            'FOREIGN_CONTAINER_REFUSE_CLEANUP',
          );
          await docker(['rm', '--force', ownedContainer], {
            requireEvidence: false,
          });
          cleanup.containerRemoved = true;
        } else cleanup.failures.push('OWNED_CONTAINER_INSPECTION_FAILED');
      } catch (error) {
        cleanup.failures.push('REMOVE_CONTAINER:' + String(error));
      }
    }
    if (volumeAttempted && (!containerAttempted || cleanup.containerRemoved)) {
      try {
        const owned = await docker(
          [
            'volume',
            'inspect',
            '--format',
            '{{index .Labels "econmind.actor.nonce"}}',
            volume,
          ],
          { requireZero: false, requireEvidence: false },
        );
        if (owned.code === 0) {
          assert.equal(
            owned.stdout.trim(),
            nonce,
            'FOREIGN_VOLUME_REFUSE_CLEANUP',
          );
          await docker(['volume', 'rm', volume], { requireEvidence: false });
          cleanup.volumeRemoved = true;
        } else cleanup.failures.push('OWNED_VOLUME_INSPECTION_FAILED');
      } catch (error) {
        cleanup.failures.push('REMOVE_VOLUME:' + String(error));
      }
    }
    result = {
      classification: 'TEST_ONLY_ACTOR_REGISTRY_NATIVE_NOT_PRODUCTION',
      status:
        !primary &&
        testRun?.code === 0 &&
        cleanup.containerRemoved &&
        cleanup.volumeRemoved &&
        cleanup.failures.length === 0 &&
        evidenceIoFailures.length === 0
          ? 'EXECUTED_PASS_TEST_ONLY'
          : 'FAILED_OR_NOT_RUN',
      commit,
      workingTreeStatus: status,
      sourcePins: pins,
      marker,
      executionLayout: staged
        ? 'REVIEW_STAGING_EXACT_ROOT_PRODUCT_SYMLINKS'
        : 'ADOPTED_REPOSITORY_TEST',
      testExitCode: testRun?.code ?? null,
      tests: report
        ? {
            total: report.numTotalTests,
            passed: report.numPassedTests,
            failed: report.numFailedTests,
            skipped: report.numPendingTests,
          }
        : null,
      failure: primary ? String(primary) : null,
      cleanup,
      evidenceIoFailures,
      commands,
      approval: 'NOT_APPROVED_NOT_DEPLOYED',
    };
    try {
      await writeFile(
        join(evidenceDirectory, 'report.json'),
        JSON.stringify(result, null, 2) + '\n',
      );
    } catch (error) {
      evidenceIoFailures.push({
        command: 'FINAL_REPORT',
        error: String(error),
      });
    }
  }
  if (
    primary ||
    cleanup.failures.length ||
    evidenceIoFailures.length ||
    result.status !== 'EXECUTED_PASS_TEST_ONLY'
  )
    throw new AggregateError(
      [
        ...(primary ? [primary] : []),
        ...cleanup.failures,
        ...evidenceIoFailures,
      ],
      'ACTOR_NATIVE_ATTEMPT_FAILED_RETAINED_EVIDENCE',
    );
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  try {
    if (args.length === 0 || (args.length === 1 && args[0] === '--plan'))
      process.stdout.write(JSON.stringify(actorNativePlan()) + '\n');
    else {
      assert(
        args.length === 5 &&
          args[0] === '--run' &&
          args[1] === '--root' &&
          args[3] === '--evidence',
        'USAGE: --plan | --run --root repository --evidence fresh-directory',
      );
      const result = await runActorNative({
        root: args[2],
        evidenceDirectory: args[4],
      });
      process.stdout.write(
        JSON.stringify({
          status: result.status,
          tests: result.tests,
          report: join(resolve(args[4]), 'report.json'),
        }) + '\n',
      );
    }
  } catch (error) {
    process.stderr.write(String(error) + '\n');
    process.exitCode = 1;
  }
}
