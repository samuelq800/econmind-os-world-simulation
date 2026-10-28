/** Restore only immutable migration Git objects via the existing origin proxy. */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from '../../scripts/migration-policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function migrationSourceCommits(manifest) {
  if (!Array.isArray(manifest?.migrations) || manifest.migrations.length === 0)
    throw Error('MIGRATION_MANIFEST_INVALID');
  const commits = manifest.migrations.map(
    (item) => item.artifact_source_commit,
  );
  if (commits.some((commit) => !/^[a-f0-9]{40}$/u.test(commit ?? '')))
    throw Error('MIGRATION_SOURCE_COMMIT_INVALID');
  return [...new Set(commits)];
}

export async function checkMigrationSources({ fetchMissing = false } = {}) {
  const manifest = JSON.parse(
    await readFile(
      path.join(root, 'database/migrations/manifest.json'),
      'utf8',
    ),
  );
  const commits = migrationSourceCommits(manifest);
  const git = (args) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
  const present = (commit) =>
    git(['cat-file', '-e', `${commit}^{commit}`]).status === 0;
  const initialMissing = commits.filter((commit) => !present(commit));
  const fetched = [];
  if (fetchMissing && initialMissing.length) {
    const remote = git(['remote', 'get-url', 'origin']);
    if (remote.status !== 0) throw Error('ORIGIN_UNAVAILABLE');
    const url = new URL(remote.stdout.trim());
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.pathname.replace(/\.git$/u, '') !==
        '/samuelq800/econmind-os-world-simulation'
    )
      throw Error('ORIGIN_IDENTITY_MISMATCH');
    for (const commit of initialMissing) {
      const result = git(['fetch', '--no-tags', 'origin', commit]);
      fetched.push({ commit, exitCode: result.status, signal: result.signal });
      if (result.status !== 0 || !present(commit)) break;
    }
  }
  const artifacts = new Map();
  for (const migration of manifest.migrations) {
    const target = path.resolve(root, migration.path);
    if (!target.startsWith(root))
      throw Error('MIGRATION_PATH_OUTSIDE_REPOSITORY');
    artifacts.set(migration.path, await readFile(target));
  }
  const validation = validateMigrationManifest(
    manifest,
    artifacts,
    await readMigrationGitProvenance(root, manifest.migrations),
  );
  return {
    schemaVersion: 'office-migration-source-check-v1',
    mode: fetchMissing ? 'FETCH_IMMUTABLE_GIT_OBJECTS_ONLY' : 'OFFLINE_CHECK',
    initialMissing,
    missing: commits.filter((commit) => !present(commit)),
    fetched,
    validation,
    productionMutation: false,
    headChanged: false,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && !['--check', '--fetch'].includes(args[0]))
  ) {
    process.stderr.write(
      'Use --check (offline default) or --fetch (existing origin read).\n',
    );
    process.exitCode = 64;
  } else {
    checkMigrationSources({ fetchMissing: args[0] === '--fetch' })
      .then((result) => {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exitCode =
          result.missing.length === 0 && result.validation.status === 'PASS'
            ? 0
            : 2;
      })
      .catch((error) => {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
      });
  }
}
