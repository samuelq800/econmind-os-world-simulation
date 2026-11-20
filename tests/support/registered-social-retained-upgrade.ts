/** TEST_ONLY single owned-clone forward and explicit licence publication.
 * SQL and all target names are fixed, never caller callbacks/rows/authority. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { preparePostwarSocialEmploymentCreationForward } from './postwar-social-employment-creation-forward.js';
import { readRetainedPostwarPowerCatalogFrom } from './postwar-retained-power-upgrade.js';
import { readRegisteredCurrentEconomicSnapshotFrom } from './registered-current-read-repair-checkpoint.js';
import type {
  RegisteredUtilityResources,
  RegisteredUtilitySetup,
} from './registered-utility-checkpoint-restore.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
type Catalog = Awaited<ReturnType<typeof readRetainedPostwarPowerCatalogFrom>>;
type Row = Record<string, unknown>;
export interface SocialForwardMetadata {
  readonly functions: readonly {
    signature: string;
    oldBodySha256: string;
    newBodySha256: string;
  }[];
  readonly newSupplementFunctions: readonly {
    signature: string;
    sha256: string;
    roles: readonly string[];
    argumentNames: readonly string[];
    result: string;
  }[];
}
const tableName = 'postwar_social_employment_creation_licence',
  owner = 'world_v2_postwar_projection_owner';
const rows = (v: unknown): Row[] => {
  assert(Array.isArray(v));
  return v.map((x) => {
    assert(x && typeof x === 'object' && !Array.isArray(x));
    return x as Row;
  });
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Complete old catalogue remains byte/structure equal after undoing only the
 * 13 pinned body changes and the exact supplement. OIDs are never guessed. */
export function assertRegisteredSocialForwardCatalog(input: {
  before: Catalog;
  after: Catalog;
  manifest: SocialForwardMetadata;
  foreignKeyFunctionIds: readonly string[];
  policyExpressions: readonly {
    name: string;
    qual: string;
    check: string | null;
  }[];
}) {
  const { before, after, manifest } = input;
  assert.equal(manifest.functions.length, 13);
  assert.equal(new Set(manifest.functions.map((f) => f.signature)).size, 13);
  assert.equal(manifest.newSupplementFunctions.length, 3);
  for (const spec of manifest.functions) {
    const old = before.functions.filter((f) => f.signature === spec.signature),
      now = after.functions.filter((f) => f.signature === spec.signature);
    assert.equal(old.length, 1);
    assert.equal(now.length, 1);
    assert.equal(old[0]!.body_sha256, spec.oldBodySha256);
    assert.equal(now[0]!.body_sha256, spec.newBodySha256);
    assert.deepEqual({ ...now[0], body_sha256: spec.oldBodySha256 }, old[0]);
  }
  const addedNames = new Set(
    manifest.newSupplementFunctions.map((f) => f.signature),
  );
  assert.deepEqual(
    [...addedNames].sort(),
    [
      'world_v2.postwar_social_created_pool(text,text,text,bigint)',
      'world_v2.postwar_social_employment_creation_effect_scoped(text,text,jsonb,jsonb,bigint)',
      'world_v2.prepare_postwar_social_employment_creation_licences(text)',
    ].sort(),
  );
  for (const spec of manifest.newSupplementFunctions) {
    assert(!before.functions.some((f) => f.signature === spec.signature));
    const found = after.functions.filter((f) => f.signature === spec.signature);
    assert.equal(found.length, 1);
    const f = found[0]!;
    assert.equal(f.owner, owner);
    assert.equal(f.body_sha256, spec.sha256);
    assert.equal(f.security_definer, true);
    assert.deepEqual(f.config, ['search_path=pg_catalog']);
    assert.deepEqual(f.proargnames, spec.argumentNames);
    assert.equal(f.result, spec.result);
    assert.equal(f.proisstrict, false);
    assert.equal(f.provolatile, 'v');
    assert.equal(f.proparallel, 'u');
    assert.equal(typeof f.acl, 'string');
    const entries = (f.acl as string).slice(1, -1).split(',');
    assert.equal('{' + entries.join(',') + '}', f.acl);
    const grants = entries.map((e) => {
      const m =
        /^([a-z][a-z0-9_]*)=X\/world_v2_postwar_projection_owner$/u.exec(e);
      assert(m, 'EXACT_PRIVATE_FUNCTION_EXECUTE_ACL_REQUIRED');
      return m[1]!;
    });
    assert.deepEqual(grants.sort(), [...spec.roles].sort());
  }
  const oldTableRows = rows(before.tables),
    table = rows(after.tables).filter((t) => t.relname === tableName);
  assert(!oldTableRows.some((t) => t.relname === tableName));
  assert.equal(table.length, 1);
  const licence = table[0]!,
    ownerRow = rows(before.roles).find((r) => r.rolname === owner);
  assert(ownerRow);
  assert.equal(licence.relowner, ownerRow.oid);
  assert.equal(licence.relrowsecurity, true);
  assert.equal(licence.relforcerowsecurity, true);
  assert(
    [
      null,
      '{world_v2_postwar_projection_owner=arwdDxt/world_v2_postwar_projection_owner}',
    ].includes(licence.relacl as null | string),
  );
  const policies = rows(after.policies).filter(
    (p) => p.polrelid === licence.oid,
  );
  assert.equal(policies.length, 2);
  assert.deepEqual(policies.map((p) => p.polname).sort(), [
    'social_creation_licence_owner',
    'social_creation_licence_world',
  ]);
  for (const p of policies) {
    assert.equal(p.polcmd, '*');
    assert.deepEqual(p.polroles, [ownerRow.oid]);
    assert.equal(
      p.polpermissive,
      p.polname === 'social_creation_licence_owner',
    );
    assert.equal(typeof p.polqual, 'string');
    assert.equal(
      p.polwithcheck === null,
      p.polname === 'social_creation_licence_world',
    );
  }
  const worldQual =
      "(world_id = current_setting('econmind.postwar_projection_world'::text, true))",
    ownerQual =
      "((CURRENT_USER = 'world_v2_postwar_projection_owner'::name) AND " +
      worldQual +
      ')';
  const norm = (v: string | null) =>
    v === null ? null : v.replace(/\s+/gu, '');
  assert.equal(input.policyExpressions.length, 2);
  for (const expected of [
    {
      name: 'social_creation_licence_owner',
      qual: ownerQual,
      check: ownerQual,
    },
    { name: 'social_creation_licence_world', qual: worldQual, check: null },
  ]) {
    const p = input.policyExpressions.filter((p) => p.name === expected.name);
    assert.equal(p.length, 1);
    assert.equal(norm(p[0]!.qual), norm(expected.qual));
    assert.equal(norm(p[0]!.check), norm(expected.check));
  }
  const oldIds = new Set(rows(before.triggers).map((t) => t.oid)),
    extra = rows(after.triggers).filter((t) => !oldIds.has(t.oid));
  const user = extra.filter((t) => !t.tgisinternal),
    fk = extra.filter((t) => t.tgisinternal);
  assert.equal(user.length, 2);
  assert.deepEqual(user.map((t) => t.tgname).sort(), [
    'social_creation_licence_immutable',
    'social_creation_licence_no_truncate',
  ]);
  const reject = before.functions.find(
    (f) => f.signature === 'world_v2.reject_authoritative_history_mutation()',
  );
  assert(reject);
  for (const t of user) {
    assert.equal(t.tgrelid, licence.oid);
    assert.equal(t.tgfoid, reject.oid);
    assert.equal(t.tgenabled, 'O');
  }
  const parentIds = oldTableRows
    .filter((t) =>
      ['postwar_social_prefix_scope', 'runtime_opening_admission'].includes(
        String(t.relname),
      ),
    )
    .map((t) => t.oid);
  assert.equal(parentIds.length, 2);
  assert.equal(fk.length, 8);
  for (const t of fk) {
    assert(input.foreignKeyFunctionIds.includes(String(t.tgfoid)));
    assert.equal(t.tgenabled, 'O');
    assert(
      (t.tgrelid === licence.oid && parentIds.includes(t.tgconstrrelid)) ||
        (t.tgconstrrelid === licence.oid && parentIds.includes(t.tgrelid)),
    );
  }
  const targets = new Map(manifest.functions.map((f) => [f.signature, f]));
  assert.deepEqual(
    {
      ...after,
      functions: after.functions
        .filter((f) => !addedNames.has(f.signature))
        .map((f) =>
          targets.has(f.signature)
            ? { ...f, body_sha256: targets.get(f.signature)!.oldBodySha256 }
            : f,
        ),
      tables: rows(after.tables).filter((t) => t.oid !== licence.oid),
      policies: rows(after.policies).filter((p) => p.polrelid !== licence.oid),
      triggers: rows(after.triggers).filter((t) => oldIds.has(t.oid)),
    },
    before,
    'UNEXPECTED_SOCIAL_CREATION_CATALOG_DELTA',
  );
}
export async function upgradeRegisteredSocialRetainedClone(input: {
  repositoryRoot: string;
  expectedCommit: string;
  evidenceDirectory: string;
  fixture: RegisteredUtilityResources;
  setup: RegisteredUtilitySetup;
}) {
  assert.equal(
    process.env.ECONMIND_REGISTERED_SOCIAL_CREATION_UPGRADE_NATIVE,
    '1',
  );
  assert(
    input.evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/'),
  );
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: input.repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    input.expectedCommit,
  );
  const forward = await preparePostwarSocialEmploymentCreationForward(
      input.repositoryRoot,
    ),
    raw = await readFile(
      path.join(input.repositoryRoot, forward.manifestPath),
      'utf8',
    );
  assert.equal(sha(raw), forward.manifestSha256);
  const manifest = JSON.parse(raw) as SocialForwardMetadata;
  await mkdir(input.evidenceDirectory, { recursive: false });
  const receiptPath = path.join(
      input.evidenceDirectory,
      'social-creation-upgrade-receipt.json',
    ),
    receipt: Row = {
      classification:
        'EXACT_RETAINED_CATALOG_FORWARD_NOT_FRESH_SCHEMA_OR_SOURCE_AUTHORITY',
      expectedCommit: input.expectedCommit,
      database: input.fixture.clone.database,
      sqlSha256: forward.sha256,
      manifestSha256: forward.manifestSha256,
      status: 'NOT_ATTEMPTED',
      sourceInitializer: { ...forward.sourceInitializer },
    };
  const save = () =>
    writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  await save();
  const client = await input.fixture.clone.installer.connect();
  try {
    const before = await readRetainedPostwarPowerCatalogFrom(client),
      economicBefore = await readRegisteredCurrentEconomicSnapshotFrom(
        client,
        input.fixture.marker.worldId,
      );
    receipt.before = { catalog: before, economic: economicBefore.economic };
    assert.equal(
      (
        await client.query<{ count: string }>(
          "select count(*)::text count from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid()and state is distinct from 'idle'",
        )
      ).rows[0]?.count,
      '0',
      'OWNED_CLONE_MUST_HAVE_NO_ACTIVE_CONSUMER_OR_PUBLICATION_TRANSACTION',
    );
    const fk = (
      await client.query<{ oid: string }>(
        "select oid::text from pg_proc where pronamespace='pg_catalog'::regnamespace and proname=any($1::text[])",
        [
          [
            'RI_FKey_check_ins',
            'RI_FKey_check_upd',
            'RI_FKey_noaction_del',
            'RI_FKey_noaction_upd',
          ],
        ],
      )
    ).rows.map((r) => r.oid);
    assert.equal(fk.length, 4);
    assert(
      !rows(before.tables).some((t) => t.relname === tableName),
      'EXPLICIT_FRESH_SOCIAL_FORWARD_PROFILE_REQUIRED',
    );
    for (const s of manifest.functions)
      assert.equal(
        before.functions.find((f) => f.signature === s.signature)?.body_sha256,
        s.oldBodySha256,
      );
    receipt.status = 'ATTEMPTED_ACK_UNKNOWN';
    await save();
    try {
      await client.query(forward.sql);
      receipt.status = 'DDL_COMMITTED_ACKNOWLEDGED';
      await save();
    } catch (error) {
      receipt.status = 'FAILED_OR_UNKNOWN_COMMIT_NO_AUTOMATIC_RETRY';
      receipt.error = wireColdError(error);
      try {
        await client.query('rollback');
        receipt.rollbackCommandAcknowledged = true;
      } catch (rollback) {
        receipt.rollbackError = wireColdError(rollback);
      }
      await save();
      throw error;
    }
    const after = await readRetainedPostwarPowerCatalogFrom(client);
    const policyExpressions = (
      await client.query<{
        name: string;
        qual: string;
        check_expression: string | null;
      }>(
        "select polname as name,pg_get_expr(polqual,polrelid)qual,pg_get_expr(polwithcheck,polrelid)check_expression from pg_policy where polrelid='world_v2.postwar_social_employment_creation_licence'::regclass order by polname",
      )
    ).rows.map((p) => ({
      name: p.name,
      qual: p.qual,
      check: p.check_expression,
    }));
    assertRegisteredSocialForwardCatalog({
      before,
      after,
      manifest,
      foreignKeyFunctionIds: fk,
      policyExpressions,
    });
    const economicAfter = await readRegisteredCurrentEconomicSnapshotFrom(
      client,
      input.fixture.marker.worldId,
    );
    assert.deepEqual(economicAfter.economic, economicBefore.economic);
    receipt.after = {
      catalog: after,
      economic: economicAfter.economic,
      policyExpressions,
    };
    receipt.catalogVerified = true;
    await save();
  } finally {
    client.release();
  }
  // Explicitly separated transaction on the existing true publisher login.
  const setupEvidence = JSON.parse(
    await readFile(
      path.join(
        path.dirname(input.fixture.marker.markerPath),
        'restore-evidence.json',
      ),
      'utf8',
    ),
  ) as { roles: { publication: string } };
  const { marker, clone } = input.fixture;
  const pool = new Pool({
    host: marker.socket,
    port: marker.port,
    database: clone.database,
    user: setupEvidence.roles.publication,
    max: 1,
    ssl: false,
    password: async () => '',
    connectionTimeoutMillis: 10000,
  });
  try {
    const pub = await pool.connect();
    try {
      await pub.query('begin isolation level repeatable read');
      await pub.query('set local role world_v2_postwar_projection_publisher');
      const r = await pub.query<{ count: number }>(
        'select world_v2.prepare_postwar_social_employment_creation_licences($1)count',
        [marker.worldId],
      );
      assert.equal(r.rows.length, 1);
      assert(Number.isSafeInteger(r.rows[0]!.count) && r.rows[0]!.count >= 0);
      receipt.sourceInitializer = {
        ...forward.sourceInitializer,
        performed: false,
        status: 'ATTEMPTED_COMMIT_ACK_UNKNOWN',
        count: r.rows[0]!.count,
      };
      await save();
      await pub.query('commit');
      receipt.sourceInitializer = {
        ...forward.sourceInitializer,
        performed: true,
        status: 'COMMITTED_DERIVED_FROM_ACTUAL_ADMITTED_SOURCE',
        count: r.rows[0]!.count,
      };
      await save();
    } catch (error) {
      try {
        await pub.query('rollback');
      } catch (rollback) {
        receipt.rollbackError = wireColdError(rollback);
      }
      receipt.sourceInitializerError = wireColdError(error);
      await save();
      throw error;
    } finally {
      pub.release();
    }
  } finally {
    await pool.end();
  }
  const final = await input.fixture.clone.installer.connect();
  try {
    const catalog = await readRetainedPostwarPowerCatalogFrom(final),
      economic = await readRegisteredCurrentEconomicSnapshotFrom(
        final,
        marker.worldId,
      );
    assert.deepEqual(catalog, (receipt.after as { catalog: Catalog }).catalog);
    assert.deepEqual(
      economic.economic,
      (receipt.after as { economic: unknown }).economic,
    );
    receipt.final = { catalog, economic: economic.economic };
    receipt.status =
      'FORWARD_AND_DERIVED_LICENCE_PREPARATION_COMPLETE_NOT_RUNTIME_READY';
    await save();
  } finally {
    final.release();
  }
  return {
    upgradeReceipt: receiptPath,
    sourceInitializer: receipt.sourceInitializer,
  };
}
