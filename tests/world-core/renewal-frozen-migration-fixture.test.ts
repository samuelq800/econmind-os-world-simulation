import { deepStrictEqual } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { readMigrationGitProvenance } from '../../scripts/migration-policy.mjs';
import {
  loadFrozenRenewalMigrationFixture,
  RENEWAL_FROZEN_BASELINE,
  RENEWAL_FROZEN_MANIFEST_SHA256,
  selectFrozenRenewalManifest,
  validateRenewalFixtureInputs,
  type RenewalManifest,
  type RenewalGitArtifact,
} from '../support/renewal-frozen-migration-fixture.js';

const root = path.resolve(import.meta.dirname, '../..');
let frozenBytes: Buffer;
let currentBytes: Buffer;
let current: RenewalManifest;
let artifacts: Map<string, Buffer>;
let provenance: Map<string, RenewalGitArtifact>;
const bytes = (manifest: RenewalManifest) =>
  Buffer.from(JSON.stringify(manifest));
const clone = () =>
  JSON.parse(currentBytes.toString('utf8')) as {
    migrations: Record<string, unknown>[];
    [metadata: string]: unknown;
  };

beforeAll(async () => {
  frozenBytes = await readFile(
    path.join(
      root,
      'tests/fixtures/migrations/renewal-frozen-22.manifest.json',
    ),
  );
  currentBytes = await readFile(
    path.join(root, 'database/migrations/manifest.json'),
  );
  current = JSON.parse(currentBytes.toString('utf8')) as RenewalManifest;
  artifacts = new Map(
    await Promise.all(
      current.migrations.map(
        async (migration) =>
          [
            migration.path,
            await readFile(path.join(root, migration.path)),
          ] as const,
      ),
    ),
  );
  provenance = await readMigrationGitProvenance(root, current.migrations);
});

describe('TEST_ONLY renewal fixture compatibility (no database)', () => {
  it('copies the immutable historical original byte-for-byte and retains the locked digest', () => {
    const original = execFileSync(
      'git',
      [
        '--no-replace-objects',
        'show',
        `${RENEWAL_FROZEN_BASELINE}:database/migrations/manifest.json`,
      ],
      { cwd: root, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } },
    );
    expect(frozenBytes.equals(original)).toBe(true);
    expect(RENEWAL_FROZEN_MANIFEST_SHA256).toBe(
      '39efbcfdb28b0a5302fc2d8b7a6c55c8543539e265daaa272b065284d2d839bf',
    );
  });

  it('validates all current 23 with real Git provenance but returns exactly the frozen 22 SQL artifacts', async () => {
    const loaded = await loadFrozenRenewalMigrationFixture(root);
    expect(loaded.validatedCurrentMigrationCount).toBe(23);
    expect(loaded.manifest.migrations).toHaveLength(22);
    expect(loaded.artifacts).toHaveLength(22);
    expect(loaded.manifest.migrations.at(-1)?.migration_id).toBe(
      '0022_world_v2_snapshot_storage_veto',
    );
    expect(
      loaded.manifest.migrations.some((migration) =>
        migration.migration_id.startsWith('0023'),
      ),
    ).toBe(false);
    expect(loaded.artifacts).not.toContain(
      artifacts.get(current.migrations[22]!.path)!.toString('utf8'),
    );
    deepStrictEqual(
      loaded.manifest.migrations,
      current.migrations.slice(0, 22),
    );
    expect(Object.isFrozen(loaded.manifest.migrations)).toBe(true);
    expect(loaded.frozenManifestHash).toBe(RENEWAL_FROZEN_MANIFEST_SHA256);
  });

  it('still supports the identical historical 22-entry complete chain without widening execution', () => {
    const loaded = validateRenewalFixtureInputs({
      frozenBytes,
      currentBytes: frozenBytes,
      artifacts,
      provenance,
    });
    expect(loaded.validatedCurrentMigrationCount).toBe(22);
    expect(loaded.manifest.migrations).toHaveLength(22);
    expect(loaded.artifacts).toHaveLength(22);
  });

  it('does not permit a reformatted/replaced frozen original, even with identical JSON', () => {
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes: Buffer.from(
          JSON.stringify(JSON.parse(frozenBytes.toString('utf8'))),
        ),
        currentBytes,
      }),
    ).toThrow('RENEWAL_FROZEN_MANIFEST_BYTES_CHANGED');
  });

  it.each([
    'sha256',
    'artifact_source_commit',
    'release_order',
    'path',
    'production_approval',
    'unknown_metadata',
  ])('rejects changed prefix %s', (field) => {
    const changed = clone();
    changed.migrations[0]![field] = field === 'release_order' ? 2 : 'CHANGED';
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes,
        currentBytes: Buffer.from(JSON.stringify(changed)),
      }),
    ).toThrow('RENEWAL_FROZEN_PREFIX_CHANGED');
  });

  it('rejects removal, reorder and unknown extra migration', () => {
    const shorter = clone();
    shorter.migrations.splice(21);
    const reordered = clone();
    [reordered.migrations[0], reordered.migrations[1]] = [
      reordered.migrations[1]!,
      reordered.migrations[0]!,
    ];
    const longer = clone();
    longer.migrations.push({
      ...longer.migrations[22],
      migration_id: '0024_unreviewed',
      release_order: 24,
    });
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes,
        currentBytes: Buffer.from(JSON.stringify(shorter)),
      }),
    ).toThrow('RENEWAL_UNREVIEWED_CHAIN_LENGTH');
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes,
        currentBytes: Buffer.from(JSON.stringify(reordered)),
      }),
    ).toThrow('RENEWAL_FROZEN_PREFIX_CHANGED');
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes,
        currentBytes: Buffer.from(JSON.stringify(longer)),
      }),
    ).toThrow('RENEWAL_UNREVIEWED_CHAIN_LENGTH');
  });

  it.each([
    'migration_id',
    'sha256',
    'artifact_source_commit',
    'path',
    'production_approval',
    'affected_schemas',
    'extra_metadata',
  ])('rejects unreviewed suffix %s', (field) => {
    const changed = clone();
    changed.migrations[22]![field] =
      field === 'affected_schemas' ? ['storage'] : 'CHANGED';
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes,
        currentBytes: Buffer.from(JSON.stringify(changed)),
      }),
    ).toThrow('RENEWAL_UNREVIEWED_SUFFIX');
  });

  it('rejects changed manifest publisher/mutation authority', () => {
    const changed = clone();
    changed.world_repository_production_mutation = true;
    expect(() =>
      selectFrozenRenewalManifest({
        frozenBytes,
        currentBytes: Buffer.from(JSON.stringify(changed)),
      }),
    ).toThrow('RENEWAL_MANIFEST_AUTHORITY_CHANGED');
  });

  it('requires valid unexecuted 0023 SQL bytes and Git provenance, not just the selected prefix', () => {
    const suffix = current.migrations[22]!;
    const key = `${suffix.artifact_source_commit}:${suffix.path}`;
    const wrongSql = new Map(artifacts);
    wrongSql.set(
      suffix.path,
      Buffer.concat([
        artifacts.get(suffix.path)!,
        Buffer.from('\n-- changed\n'),
      ]),
    );
    expect(() =>
      validateRenewalFixtureInputs({
        frozenBytes,
        currentBytes,
        artifacts: wrongSql,
        provenance,
      }),
    ).toThrow(`MIGRATION_HASH_MISMATCH:${suffix.migration_id}`);
    const missing = new Map(provenance);
    missing.delete(key);
    expect(() =>
      validateRenewalFixtureInputs({
        frozenBytes,
        currentBytes,
        artifacts,
        provenance: missing,
      }),
    ).toThrow(`UNVERIFIED_GIT_PROVENANCE:${suffix.migration_id}`);
    const wrongGit = new Map(provenance);
    wrongGit.set(key, {
      commitExists: true,
      pathExists: true,
      bytes: Buffer.from('wrong original'),
    });
    expect(() =>
      validateRenewalFixtureInputs({
        frozenBytes,
        currentBytes,
        artifacts,
        provenance: wrongGit,
      }),
    ).toThrow(`SOURCE_ARTIFACT_HASH_MISMATCH:${suffix.migration_id}`);
  });

  it('also requires every selected historical artifact provenance', () => {
    const first = current.migrations[0]!;
    const missing = new Map(provenance);
    missing.delete(`${first.artifact_source_commit}:${first.path}`);
    expect(() =>
      validateRenewalFixtureInputs({
        frozenBytes,
        currentBytes,
        artifacts,
        provenance: missing,
      }),
    ).toThrow(`UNVERIFIED_GIT_PROVENANCE:${first.migration_id}`);
  });

  it('preserves all four actual native case bodies and original bounded Storage fixture bytes', async () => {
    const file = 'tests/world-core/world-writer-lease-renewal-postgres.test.ts';
    const base = 'ff8ecb931389d53e7fe70897c5d0c06183cf0e09';
    const original = execFileSync(
      'git',
      ['--no-replace-objects', 'show', `${base}:${file}`],
      { cwd: root },
    ).toString('utf8');
    const actual = await readFile(path.join(root, file), 'utf8');
    const marker = "    it('RENEWED preserves fence/acquisition";
    expect(actual.slice(actual.indexOf(marker))).toBe(
      original.slice(original.indexOf(marker)),
    );
    expect(actual.match(/ {4}it\('/gu)).toHaveLength(4);
    expect(actual).toContain('expect(manifest.migrations).toHaveLength(22)');
    expect(
      actual.indexOf('const environment = assertV09PostgresTestEnvironment()'),
    ).toBeLessThan(
      actual.indexOf('await loadFrozenRenewalMigrationFixture(root)'),
    );
    expect(
      actual.indexOf('await loadFrozenRenewalMigrationFixture(root)'),
    ).toBeLessThan(actual.indexOf('database = new Pool'));
    const storageFile = 'tests/support/snapshot-storage-fixture.ts';
    expect(
      (await readFile(path.join(root, storageFile))).equals(
        execFileSync(
          'git',
          ['--no-replace-objects', 'show', `${base}:${storageFile}`],
          { cwd: root },
        ),
      ),
    ).toBe(true);
  });

  it('selected manifest content is exactly the frozen original, not a rewritten current 23', () => {
    const selected = selectFrozenRenewalManifest({ frozenBytes, currentBytes });
    expect(bytes(selected.manifest)).toEqual(
      Buffer.from(JSON.stringify(JSON.parse(frozenBytes.toString('utf8')))),
    );
  });
});
