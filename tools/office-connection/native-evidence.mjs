/** Disposable native acceptance. Never mounts host files or starts World/Clock. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const image =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
const nodeSHA256 =
  '2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2';
const runtimePath =
  '/tmp/node-v24.20.0-linux-x64/bin:/tmp/pnpm/node_modules/.bin:/usr/bin:/bin';
export function nativeEvidencePlan() {
  return {
    schemaVersion: 'OFFICE_NATIVE_EVIDENCE_PLAN_V1',
    status: 'PLAN_ONLY_NOT_RUN',
    image,
    postgres: '16.15',
    node: '24.20.0',
    pnpm: '12.3.4',
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    WorldClock: false,
    productionAdmission: false,
    hostMounts: [],
    networkDuringTests: 'NONE',
    runUser: 'postgres (nonroot)',
    requires: [
      'clean current commit',
      'Docker',
      'content-addressed frozen dependency cache',
      'verified Node archive',
    ],
    commands: [
      'node tools/social-office-demo/build-host.mjs --build',
      'pnpm exec vitest run tests/integration/f-social-office-isolated-host-postgres.test.ts',
      'node tools/social-office-demo/verify.mjs --isolated',
      'pnpm exec vitest run tests/world-core/office-native-evidence.test.ts',
    ],
    unavailableHistoricalRecovery:
      'Fixed Mac uid/inode custody is never rewritten for Linux',
    unavailableDSuites:
      'D private marker provenance is required; no fabricated marker',
    passingRequires:
      'Actual exit zero, zero skipped native assertions, and owned cleanup evidence',
  };
}

export async function runNativeEvidence(commit) {
  assert.equal(process.versions.node, '24.20.0');
  assert.match(
    commit ?? '',
    /^[a-f0-9]{40}$/u,
    'EXPLICIT_IMMUTABLE_COMMIT_REQUIRED',
  );
  const direct = (command, args, cwd = root) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  assert.equal(
    direct('git', ['rev-parse', 'HEAD']),
    commit,
    'CURRENT_COMMIT_REQUIRED',
  );
  assert.equal(
    direct('git', ['status', '--porcelain']),
    '',
    'CLEAN_CANDIDATE_REQUIRED',
  );
  const nodeArchive =
    '/workspace/.cloud-setup/downloads/node-v24.20.0-linux-x64.tar.xz';
  assert.equal(
    createHash('sha256').update(fs.readFileSync(nodeArchive)).digest('hex'),
    nodeSHA256,
  );
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'econmind-office-native-evidence-'),
  );
  const snapshot = path.join(directory, 'snapshot');
  const name = 'econmind-office-native-' + randomUUID();
  const commands = [];
  let created = false;
  let failed = false;
  let cleanup = null;
  const execute = (command, args, mustPass = true) => {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const index = commands.length + 1;
    fs.writeFileSync(
      path.join(directory, `${index}.stdout.txt`),
      result.stdout ?? '',
    );
    fs.writeFileSync(
      path.join(directory, `${index}.stderr.txt`),
      result.stderr ?? '',
    );
    commands.push({
      command,
      args,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
    });
    if (mustPass)
      assert.equal(result.status, 0, `NATIVE_COMMAND_FAILED_${index}`);
    return result;
  };
  const docker = (args, mustPass = true) => execute('docker', args, mustPass);
  const runtime = (args, mustPass = true) =>
    docker(
      [
        'exec',
        '--user',
        'postgres',
        '--workdir',
        '/tmp/candidate',
        '--env',
        `PATH=${runtimePath}`,
        '--env',
        'HOME=/tmp',
        '--env',
        'NODE_EXTRA_CA_CERTS=/tmp/office-host-ca.crt',
        '--env',
        'ECONMIND_ENV=local',
        '--env',
        'ECONMIND_SOCIAL_OFFICE_DEMO=1',
        '--env',
        'ECONMIND_SOCIAL_OFFICE_NATIVE_TESTS=1',
        '--env',
        'ECONMIND_OFFICE_NATIVE_EVIDENCE=1',
        name,
        ...args,
      ],
      mustPass,
    );
  try {
    execute('git', [
      'clone',
      '--no-local',
      '--depth=1',
      '--single-branch',
      new URL(`file://${root}`).href,
      snapshot,
    ]);
    assert.equal(direct('git', ['rev-parse', 'HEAD'], snapshot), commit);
    const migrationManifest = JSON.parse(
      fs.readFileSync(
        path.join(snapshot, 'database/migrations/manifest.json'),
        'utf8',
      ),
    );
    const sourceCommits = [
      ...new Set([
        ...migrationManifest.migrations.map(
          (entry) => entry.artifact_source_commit,
        ),
        // Existing renewal fixture independently pins this original manifest commit.
        'ea492a2d76daf2eab600a58c866d7f600a53112f',
      ]),
    ];
    for (const sourceCommit of sourceCommits) {
      assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
      direct('git', ['cat-file', '-e', sourceCommit + '^{commit}']);
      // Exact local source objects, including trees/blobs, without remote credentials.
      execute('git', [
        '-C',
        snapshot,
        'fetch',
        '--depth=1',
        new URL(`file://${root}`).href,
        sourceCommit,
      ]);
      direct('git', ['cat-file', '-e', sourceCommit + '^{commit}'], snapshot);
    }
    for (const entry of migrationManifest.migrations) {
      const original = direct(
        'git',
        ['show', `${entry.artifact_source_commit}:${entry.path}`],
        snapshot,
      );
      assert(original.length > 0, 'MIGRATION_SOURCE_BLOB_REQUIRED');
    }
    docker(['pull', image]);
    docker([
      'run',
      '--detach',
      '--name',
      name,
      '--tmpfs',
      '/var/lib/postgresql',
      '--entrypoint',
      'sleep',
      image,
      'infinity',
    ]);
    created = true;
    docker([
      'cp',
      '/etc/ssl/certs/ca-certificates.crt',
      name + ':/tmp/office-host-ca.crt',
    ]);
    docker(['cp', nodeArchive, name + ':/tmp/node.tar.xz']);
    docker([
      'cp',
      '/workspace/.cloud-setup/tools/pnpm-12.3.4',
      name + ':/tmp/pnpm',
    ]);
    docker(['exec', name, 'mkdir', '-p', '/tmp/pnpm-store/v11']);
    // Only content and its integrity index; projects contains host-specific symlinks.
    docker([
      'cp',
      '/workspace/.cloud-setup/pnpm-store/v11/files',
      name + ':/tmp/pnpm-store/v11/files',
    ]);
    docker([
      'cp',
      '/workspace/.cloud-setup/pnpm-store/v11/index.db',
      name + ':/tmp/pnpm-store/v11/index.db',
    ]);
    docker(['exec', name, 'mkdir', '-p', '/tmp/.cache/pnpm']);
    docker([
      'cp',
      '/workspace/.cloud-setup/cache/pnpm/v11',
      name + ':/tmp/.cache/pnpm/v11',
    ]);
    docker(['cp', snapshot, name + ':/tmp/candidate']);
    // Normal signed Debian APT, existing host public CA trust bundle, TLS remains on.
    // The PGDG source is unnecessary for git; no third-party source is admitted.
    docker([
      'exec',
      name,
      'bash',
      '-lc',
      [
        'set -euo pipefail',
        'sed "s|URIs: http:|URIs: https:|" /etc/apt/sources.list.d/debian.sources > /tmp/office-debian.sources',
        'apt-get -o Dir::Etc::sourcelist=/tmp/office-debian.sources -o Dir::Etc::sourceparts=- -o Acquire::https::CaInfo=/tmp/office-host-ca.crt update',
        'DEBIAN_FRONTEND=noninteractive apt-get -o Dir::Etc::sourcelist=/tmp/office-debian.sources -o Dir::Etc::sourceparts=- -o Acquire::https::CaInfo=/tmp/office-host-ca.crt install -y --no-install-recommends git',
        'tar -xf /tmp/node.tar.xz -C /tmp',
        'chown -R root:root /tmp/pnpm && chmod -R a+rX /tmp/pnpm',
        'chown -R postgres:postgres /tmp/pnpm-store',
        'chown -R postgres:postgres /tmp/.cache',
        'chown -R postgres:postgres /tmp/candidate',
        'mkdir -m 700 /tmp/office-evidence',
        'chown postgres:postgres /tmp/office-evidence',
      ].join('\n'),
    ]);
    // Preparation may fetch missing public npm metadata, preserving all pinned
    // lockfile, integrity, supply-chain and HTTPS checks. Tests are disconnected.
    runtime([
      'pnpm',
      'install',
      '--frozen-lockfile',
      '--store-dir',
      '/tmp/pnpm-store',
    ]);
    docker(['network', 'disconnect', 'bridge', name]);
    const networks = docker([
      'inspect',
      '--format',
      '{{json .NetworkSettings.Networks}}',
      name,
    ]);
    assert.deepEqual(
      JSON.parse(networks.stdout),
      {},
      'TEST_NETWORK_MUST_BE_DISABLED',
    );
    runtime([
      'node',
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict';assert.equal(process.getuid()===0,false);assert.equal(process.versions.node,'24.20.0');console.log(JSON.stringify({uid:process.getuid(),node:process.versions.node}));",
    ]);
    runtime(['pnpm', '--version']);
    runtime(['node', 'tools/social-office-demo/build-host.mjs', '--build']);
    for (const args of [
      [
        'pnpm',
        'exec',
        'vitest',
        'run',
        'tests/integration/f-social-office-isolated-host-postgres.test.ts',
        '--reporter=json',
        '--outputFile=/tmp/office-evidence/f-social-native.vitest.json',
      ],
      ['node', 'tools/social-office-demo/verify.mjs', '--isolated'],
      [
        'pnpm',
        'exec',
        'vitest',
        'run',
        'tests/world-core/office-native-evidence.test.ts',
        '--reporter=json',
        '--outputFile=/tmp/office-evidence/office-native.vitest.json',
      ],
    ]) {
      if (runtime(args, false).status !== 0) failed = true;
    }
    docker([
      'cp',
      name + ':/tmp/office-evidence',
      path.join(directory, 'native'),
    ]);
    docker(
      [
        'cp',
        name + ':/tmp/candidate/node_modules/.cache/g-social-office-demo',
        path.join(directory, 'http'),
      ],
      false,
    );
    for (const filename of [
      'f-social-native.vitest.json',
      'office-native.vitest.json',
    ]) {
      const result = JSON.parse(
        fs.readFileSync(path.join(directory, 'native', filename), 'utf8'),
      );
      if (
        !result.success ||
        result.numPendingTests !== 0 ||
        result.numPassedTests === 0
      )
        failed = true;
    }
  } catch (error) {
    failed = true;
    fs.writeFileSync(path.join(directory, 'error.txt'), String(error) + '\n');
  } finally {
    if (created) {
      // Preserve original owned markers/checkpoints before destroying this container.
      docker(
        [
          'exec',
          name,
          'bash',
          '-lc',
          'mkdir -p /tmp/office-evidence/owned; for p in /tmp/econmind-f-social-demo-*; do if test -d "$p"; then find "$p" -maxdepth 2 -type f -name "*.json" -exec cp --parents {} /tmp/office-evidence/owned/ \\;; fi; done',
        ],
        false,
      );
      docker(
        [
          'cp',
          name + ':/tmp/office-evidence',
          path.join(directory, 'final-native'),
        ],
        false,
      );
      const result = docker(['rm', '--force', '--volumes', name], false);
      cleanup = {
        container: name,
        exitCode: result.status,
        removed: result.status === 0,
      };
      if (!cleanup.removed) failed = true;
    }
    fs.writeFileSync(
      path.join(directory, 'receipt.json'),
      JSON.stringify(
        {
          schemaVersion: 'OFFICE_NATIVE_EVIDENCE_RECEIPT_V1',
          status: failed ? 'INCOMPLETE' : 'ISOLATED_NATIVE_ASSERTIONS_PASSED',
          commit,
          image,
          nodeSHA256,
          sourceClass: 'SIMULATED_OPENING',
          sourceAdmitted: false,
          productionAdmission: false,
          WorldClock: false,
          historicalMacRecovery: 'NOT_RUN_FIXED_FOREIGN_CUSTODY',
          dPrivateMarkerSuites: 'NOT_RUN_NO_PROVENANCE',
          commands,
          cleanup,
        },
        null,
        2,
      ) + '\n',
    );
  }
  return {
    status: failed ? 'INCOMPLETE' : 'ISOLATED_NATIVE_ASSERTIONS_PASSED',
    exitCode: failed ? 1 : 0,
    evidenceDirectory: directory,
    sourceAdmitted: false,
    WorldClock: false,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--plan')
    console.log(JSON.stringify(nativeEvidencePlan()));
  else if (
    args.length === 2 &&
    args[0] === '--run' &&
    args[1].startsWith('--commit=')
  ) {
    const result = await runNativeEvidence(args[1].slice('--commit='.length));
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
  } else {
    process.stderr.write(
      'Use --plan or --run --commit=<clean current 40-character commit>.\n',
    );
    process.exitCode = 2;
  }
}
