// TEST_ONLY. Historical four-case fixture, NOT a complete current-chain rehearsal.
import { deepStrictEqual } from 'node:assert';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from '../../scripts/migration-policy.mjs';

export const RENEWAL_FROZEN_BASELINE =
  'ea492a2d76daf2eab600a58c866d7f600a53112f';
export const RENEWAL_FROZEN_MANIFEST_SHA256 =
  '39efbcfdb28b0a5302fc2d8b7a6c55c8543539e265daaa272b065284d2d839bf';
const MANIFEST_PATH = 'database/migrations/manifest.json';
const FROZEN_PATH = 'tests/fixtures/migrations/renewal-frozen-22.manifest.json';
const execFileAsync = promisify(execFile);

export interface RenewalMigration {
  readonly artifact_source_commit: string;
  readonly migration_id: string;
  readonly path: string;
  readonly release_order: number;
  readonly sha256: string;
  readonly [metadata: string]: unknown;
}
export interface RenewalManifest {
  readonly migrations: readonly RenewalMigration[];
  readonly [metadata: string]: unknown;
}
export interface RenewalGitArtifact {
  readonly commitExists: boolean;
  readonly pathExists: boolean;
  readonly bytes?: Buffer;
}

// The already reviewed F0023 identity is an allowed validated-but-unexecuted
// suffix, not an extensible waiver for future migrations or production grants.
const APPROVED_UNEXECUTED_SUFFIX = Object.freeze({
  migration_id: '0023_world_v2_production_consumption_posting',
  release_order: 23,
  path: 'database/migrations/artifacts/0023_world_v2_production_consumption_posting.sql',
  sha256: '0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36',
  artifact_source_commit: '4714c1da7af9324741996b94c6da036bf54c39a4',
  scope_authority: 'CONTROL_TOWER_OWNER_DELEGATION',
  required_shared_schema_version: 'UNSPECIFIED_NO_SHARED_SCHEMA_WRITE',
  affected_schemas: Object.freeze(['world_v2']),
  rls_or_grants_changed: false,
  backfill: 'NONE',
  lock_or_downtime_risk:
    'P0 candidate-only additive fifth inventory operation on the existing append-only table, preserved four-movement validator and exact production/Event/funding/final-receipt guards; bounded DDL locks and indexes require sole release-chain review, no runtime admission or production authority',
  rollback_strategy: 'forward-fix',
  production_approval: null,
});

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function frozenManifest(bytes: Buffer): RenewalManifest {
  if (hash(bytes) !== RENEWAL_FROZEN_MANIFEST_SHA256)
    throw Error('RENEWAL_FROZEN_MANIFEST_BYTES_CHANGED');
  const manifest = JSON.parse(bytes.toString('utf8')) as RenewalManifest;
  if (manifest.migrations.length !== 22)
    throw Error('RENEWAL_FROZEN_MANIFEST_EXPECTED_22');
  return manifest;
}
function equal(actual: unknown, expected: unknown, reason: string): void {
  try {
    deepStrictEqual(actual, expected);
  } catch {
    throw Error(reason);
  }
}
function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Pure selection only. Caller must validate the complete current provenance. */
export function selectFrozenRenewalManifest(input: {
  readonly frozenBytes: Buffer;
  readonly currentBytes: Buffer;
}): Readonly<{ manifest: RenewalManifest; current: RenewalManifest }> {
  const manifest = frozenManifest(input.frozenBytes);
  const current = JSON.parse(
    input.currentBytes.toString('utf8'),
  ) as RenewalManifest;
  if (
    !Array.isArray(current?.migrations) ||
    ![22, 23].includes(current.migrations.length)
  )
    throw Error('RENEWAL_UNREVIEWED_CHAIN_LENGTH');
  const { migrations: _currentEntries, ...currentHeader } = current;
  const { migrations: _frozenEntries, ...frozenHeader } = manifest;
  void _currentEntries;
  void _frozenEntries;
  equal(currentHeader, frozenHeader, 'RENEWAL_MANIFEST_AUTHORITY_CHANGED');
  equal(
    current.migrations.slice(0, 22),
    manifest.migrations,
    'RENEWAL_FROZEN_PREFIX_CHANGED',
  );
  if (current.migrations.length === 23)
    equal(
      current.migrations[22],
      APPROVED_UNEXECUTED_SUFFIX,
      'RENEWAL_UNREVIEWED_SUFFIX',
    );
  return freeze({ manifest, current });
}

/** Uses the unchanged repository validator for ALL current entries, including
 * the unexecuted 0023. No projected-prefix-only provenance check is accepted.
 */
export function validateRenewalFixtureInputs(input: {
  readonly frozenBytes: Buffer;
  readonly currentBytes: Buffer;
  readonly artifacts: ReadonlyMap<string, Buffer>;
  readonly provenance: ReadonlyMap<string, RenewalGitArtifact>;
}) {
  const selected = selectFrozenRenewalManifest(input);
  const validation = validateMigrationManifest(
    selected.current,
    input.artifacts,
    input.provenance,
  );
  if (validation.status !== 'PASS')
    throw Error(
      `RENEWAL_COMPLETE_CURRENT_PROVENANCE_INVALID:${validation.violations.join('|')}`,
    );
  const artifacts = selected.manifest.migrations.map((migration) => {
    const bytes = input.artifacts.get(migration.path);
    if (bytes === undefined || hash(bytes) !== migration.sha256)
      throw Error('RENEWAL_FROZEN_ARTIFACT_CHANGED');
    return bytes.toString('utf8');
  });
  return Object.freeze({
    manifest: selected.manifest,
    artifacts: Object.freeze(artifacts),
    frozenManifestHash: hash(input.frozenBytes),
    currentManifestHash: hash(input.currentBytes),
    validatedCurrentMigrationCount: selected.current.migrations.length,
    executedScope: 'FROZEN_22_WITH_ORIGINAL_BOUNDED_STORAGE_FIXTURE' as const,
  });
}

/** Actual server-independent setup: read-only files + immutable Git, NO SQL,
 * connection, network fetch, manifest rewrite or migration publication.
 */
export async function loadFrozenRenewalMigrationFixture(
  repositoryRoot: string,
) {
  const [frozenBytes, currentBytes, original] = await Promise.all([
    readFile(path.join(repositoryRoot, FROZEN_PATH)),
    readFile(path.join(repositoryRoot, MANIFEST_PATH)),
    execFileAsync(
      'git',
      [
        '--no-replace-objects',
        'show',
        `${RENEWAL_FROZEN_BASELINE}:${MANIFEST_PATH}`,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'buffer',
        env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
        maxBuffer: 1024 * 1024,
      },
    ),
  ]);
  if (!frozenBytes.equals(original.stdout))
    throw Error('RENEWAL_FIXTURE_DIFFERS_FROM_IMMUTABLE_BASELINE');
  const selected = selectFrozenRenewalManifest({ frozenBytes, currentBytes });
  // Selection pins every path before file reads; the accepted complete chain is
  // still checked by the existing Git-provenance validator before Pool creation.
  const artifacts = new Map<string, Buffer>(
    await Promise.all(
      selected.current.migrations.map(
        async (migration) =>
          [
            migration.path,
            await readFile(path.join(repositoryRoot, migration.path)),
          ] as const,
      ),
    ),
  );
  const provenance = await readMigrationGitProvenance(
    repositoryRoot,
    selected.current.migrations,
  );
  return validateRenewalFixtureInputs({
    frozenBytes,
    currentBytes,
    artifacts,
    provenance,
  });
}
