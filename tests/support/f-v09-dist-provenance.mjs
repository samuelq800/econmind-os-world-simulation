// PREPARATION_ONLY_NOT_V09_2_STARTED. Read-only source/dist binding, not a gate.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const testPath = 'tests/world-core/f-v09-native-claim-recovery.test.ts';
const helperPath = 'tests/support/f-v09-dist-provenance.mjs';

export function captureFNativeBuildProvenance(
  codeCommit = git('rev-parse', 'HEAD'),
) {
  assert.match(codeCommit, /^[a-f0-9]{40}$/u);
  assert.equal(process.version, 'v24.20.0');
  // Verify actual build inputs against immutable objects, not only a HEAD label.
  const inputs = [
    'packages/core/src',
    'packages/core/package.json',
    'packages/core/tsconfig.json',
    'packages/core/tsconfig.build.json',
    'apps/world-worker/src',
    'apps/world-worker/package.json',
    'apps/world-worker/tsconfig.json',
    'apps/world-worker/tsconfig.build.json',
    'tsconfig.base.json',
    'package.json',
    'pnpm-lock.yaml',
    'vitest.config.ts',
    testPath,
    helperPath,
    'tests/support/tsconfig.f-v09-native-claim.json',
  ];
  const sources = git('ls-tree', '-r', codeCommit, '--', ...inputs)
    .split('\n')
    .map((line) => {
      const [metadata, relative] = line.split('\t');
      const absolute = path.join(root, relative);
      assert.equal(lstatSync(absolute).isFile(), true);
      assert.equal(realpathSync(absolute), absolute);
      const bytes = readFileSync(absolute);
      const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      assert.equal(
        blob,
        metadata.split(' ')[2],
        `SOURCE_OBJECT_MISMATCH:${relative}`,
      );
      return { path: relative, gitBlob: blob, sha256: sha(bytes) };
    });
  const dist = [];
  function walk(relative) {
    const absolute = path.join(root, relative);
    const stat = lstatSync(absolute);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort())
        walk(`${relative}/${name}`);
    } else {
      assert.equal(stat.isFile(), true);
      const bytes = readFileSync(absolute);
      dist.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
    }
  }
  walk('packages/core/dist');
  walk('apps/world-worker/dist');
  assert.ok(dist.length > 0);
  const resolved = realpathSync(
    fileURLToPath(import.meta.resolve('@econmind/core')),
  );
  assert.equal(resolved, path.join(root, 'packages/core/dist/index.js'));
  const runtimeImport = dist.find(
    (entry) => entry.path === 'packages/core/dist/index.js',
  );
  assert.ok(runtimeImport);
  return {
    schemaVersion: 'F_NATIVE_SOURCE_DIST_BINDING-1',
    classification: 'HASH_BINDING_NOT_BUILD_REEXECUTION_OR_GATE',
    codeCommit,
    codeTree: git('rev-parse', `${codeCommit}^{tree}`),
    node: process.version,
    runtimeImport,
    testSource: sources.find((entry) => entry.path === testPath),
    sources,
    dist,
  };
}

export function assertFNativeBuildProvenance() {
  const expectedHash = process.env.F_NATIVE_BUILD_MANIFEST_SHA256;
  assert.match(expectedHash ?? '', /^[a-f0-9]{64}$/u);
  const directory = path.dirname(process.env.F_NATIVE_DATA_DIRECTORY ?? '');
  assert.match(
    directory,
    /^\/Users\/samuel\/Documents\/econclub\/artifacts\/f-v09-claim-recovery-20261010\.[A-Za-z0-9]+$/u,
  );
  const manifestPath = path.join(directory, 'BUILD_PROVENANCE.json');
  assert.equal(realpathSync(manifestPath), manifestPath);
  assert.equal(lstatSync(manifestPath).isFile(), true);
  const bytes = readFileSync(manifestPath);
  assert.equal(sha(bytes), expectedHash, 'BUILD_MANIFEST_HASH_MISMATCH');
  const expected = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(
    captureFNativeBuildProvenance(expected.codeCommit),
    expected,
  );
  return {
    manifestSha256: expectedHash,
    codeCommit: expected.codeCommit,
    codeTree: expected.codeTree,
    runtimeImport: expected.runtimeImport,
    testSource: expected.testSource,
    sourceCount: expected.sources.length,
    distCount: expected.dist.length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.deepEqual(process.argv.slice(2), ['--capture']);
  console.log(JSON.stringify(captureFNativeBuildProvenance(), null, 2));
}
