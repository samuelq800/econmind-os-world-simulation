/** TEST_ONLY retained-clone upgrade. Never installs a fresh World/schema plan,
 * adopts a source, starts a service/consumer/Clock, or retries uncertain DDL. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const OLD = '0cf65bc0e6cbf1b117ca625bb16ec7280938e239';
const TARGET = '4b6d400c2620303bfdc167d6645adfbfed3f3e04';
const MANIFEST = 'database/upgrades/postwar-0cf65bc0-to-4b6d400c.manifest.json';
const REPAIR = {
  path: 'database/proposals/postwar-complete-opening-inventory-read-repair.sql',
  commit: '79a31c939789c300bfdb7249e72180082cda7554',
  sha256: 'aa47ebbae894c4c9f0dbaff22a18757962a294e5fa18fb0fcea802ae8454cb37',
};
const LABOUR = {
  commit: 'd3e1caecb87bc8fd9fa3cd85b09fc7f0de52b6ad',
  sourcePath: 'database/proposals/postwar-industry-labour-current-read.sql',
  predecessorSourceSha256:
    '3b5f065737ed2bd88f30831f60acb951859bd91a91df380aa8183f6d5a864a0e',
  sourceSha256:
    '15791060eb27bd953a6909816a001eb7ba1750dbab936c255857455fd425fa60',
  artifactSha256:
    '84db02e76299341686e407da3dca71ea220f2bdbf5c6d48cfb36d25bd03f0645',
  functions: [
    {
      signature: 'world_v2.prepare_postwar_industry_labour_scopes(text)',
      operation: 'REPLACE',
      oldBodySha256:
        '3659e7890d46b581d1c3e0cefb8109418872c3023da8ecd4673d6d61d9d82de3',
      newBodySha256:
        'a41bd7decbcb53b4c4c1ff7f458a80f5a8b9a398adef39704384920d1d768d3e',
      owner: 'world_v2_postwar_projection_owner',
      executeRoles: ['world_v2_postwar_projection_publisher'],
      securityDefiner: true,
      searchPath: 'pg_catalog',
    },
    {
      signature:
        'world_v2.repair_postwar_industry_regional_source_capacity(text,text)',
      operation: 'CREATE',
      oldBodySha256: null,
      newBodySha256:
        'd36417b6ab909625d95be7f6e8b0747390c8027351ee67049d22331331e2562b',
      owner: 'world_v2_postwar_projection_owner',
      executeRoles: ['world_v2_postwar_projection_publisher'],
      securityDefiner: true,
      searchPath: 'pg_catalog',
    },
  ],
};
const LABOUR_ACL =
  '{world_v2_postwar_projection_owner=X/world_v2_postwar_projection_owner,world_v2_postwar_projection_publisher=X/world_v2_postwar_projection_owner}';
const KNOWN_SCHEMA_ANCESTRY = {
  repairCheckpoint:
    '/workspace/.cloud-setup/evidence/trade-current-h3-repair-final13-20261108/retained-checkpoint.json',
  repairCheckpointSha256:
    '75881f62b7c1469d8bec5e5b6b06ee82caf801da442905bf006d89ca92905e31',
  actualRestoreEvidence:
    '/workspace/.cloud-setup/evidence/current-read-native-02/pg/restore-evidence.json',
  actualRestoreSha256:
    'b52e9ac6f3fe6e998320bf873fb1c74faa30d36a6e4f1ba53e01b3a1d1e49b55',
};
type Artifact = { path: string; rawSha256: string; bytes: string };
type FunctionChange = {
  signature: string;
  targetBodySha256: string;
  effect: string;
};
type Manifest = {
  oldCommit: string;
  newCommit: string;
  orderedUpgradeFiles: Omit<Artifact, 'bytes'>[];
  freshProposalFiles: Omit<Artifact, 'bytes'>[];
  sourceFunctionChanges: FunctionChange[];
};
type Checkpoint = {
  ownedContainer: string;
  ownershipNonce: string;
  templateDatabase: string;
  allowConnections: boolean;
  isTemplate: boolean;
  head: { world_version: string; event_sequence: string };
  markerPath?: string;
  parentCheckpoint?: string;
  extraDdlReceipt?: string;
  inheritedDdlReceipts?: { path: string; field: string };
  functionForwardReceipt?: string;
};
type FunctionRow = {
  signature: string;
  oid: number;
  owner: string;
  body_sha256: string;
  acl: string | null;
  readers: string[];
  security_definer: boolean;
  config: string[] | null;
  [key: string]: unknown;
};
type Catalog = {
  functions: FunctionRow[];
  tables: unknown;
  policies: unknown;
  roles: unknown;
  memberships: unknown;
  triggers: unknown;
  grantKey: string;
};

/** Pure local preparation only. Artifact paths cannot be supplied by a caller. */
export async function prepareRetainedPostwarPowerUpgrade(input: {
  repositoryRoot: string;
  expectedCommit: string;
}) {
  assert(path.isAbsolute(input.repositoryRoot));
  assert.match(input.expectedCommit, /^[a-f0-9]{40}$/u);
  const git = (...args: string[]) =>
    execFileSync('git', ['--no-replace-objects', ...args], {
      cwd: input.repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
  assert.equal(git('rev-parse', 'HEAD').trim(), input.expectedCommit);
  const rawManifest = await readFile(path.join(input.repositoryRoot, MANIFEST));
  // The reference is the reviewed immutable upgrade package, not mutable HEAD.
  assert.equal(
    rawManifest.toString('utf8'),
    git('show', 'c51d0279ddd285e02f278fc7761f30f1e8e963fd:' + MANIFEST),
  );
  const manifest = JSON.parse(rawManifest.toString('utf8')) as Manifest;
  assert.equal(manifest.oldCommit, OLD);
  assert.equal(manifest.newCommit, TARGET);
  assert.equal(manifest.orderedUpgradeFiles.length, 5);
  assert.equal(manifest.freshProposalFiles.length, 2);
  const artifacts: Artifact[] = [];
  for (const item of [
    ...manifest.orderedUpgradeFiles,
    ...manifest.freshProposalFiles,
  ]) {
    assert.match(
      item.path,
      /^database\/(?:upgrades|proposals)\/[a-z0-9-]+\.sql$/u,
    );
    const bytes = await readFile(
      path.join(input.repositoryRoot, item.path),
      'utf8',
    );
    assert.equal(hash(bytes), item.rawSha256, item.path);
    assert.equal(
      bytes,
      git('show', 'c51d0279ddd285e02f278fc7761f30f1e8e963fd:' + item.path),
    );
    artifacts.push({ ...item, bytes });
  }
  const repairBytes = git('show', REPAIR.commit + ':' + REPAIR.path);
  assert.equal(hash(repairBytes), REPAIR.sha256);
  const repairFunctions = [
    ...repairBytes.matchAll(
      /to_regprocedure\('world_v2\.([^']+)'\);[\s\S]*?replacement:=\$newbody\$[\s\S]*?\$newbody\$;[\s\S]*?oid=f\.oid\)<>'([a-f0-9]{64})'/gu,
    ),
  ].map((m) => ({ signature: 'world_v2.' + m[1], bodySha256: m[2] }));
  assert.equal(repairFunctions.length, 13);
  return {
    manifest,
    manifestSha256: hash(rawManifest),
    artifacts,
    repairFunctions,
  };
}

const evidencePath = (value: string) => {
  assert(path.isAbsolute(value));
  assert(value.startsWith('/workspace/.cloud-setup/evidence/'));
  assert.equal(path.normalize(value), value);
  return value;
};

/** Pure metadata validation, never permission to execute caller SQL. Only this
 * exact already-executed forward is recognized, not arbitrary receipt families. */
export function validateKnownRetainedLabourReceipt(receipt: unknown) {
  assert(receipt && typeof receipt === 'object');
  const r = receipt as Record<string, unknown>;
  assert.equal(
    r.schemaVersion,
    'postwar-industry-labour-function-forward-ddl-receipt-v1',
  );
  assert.equal(r.status, 'DDL_COMMITTED');
  assert.equal(
    r.executionClassification,
    'LOCAL_OWNED_CHECKPOINT_FUNCTION_ONLY_FORWARD',
  );
  assert.equal(r.candidateCommit, LABOUR.commit);
  assert.equal(r.predecessorSourceSha256, LABOUR.predecessorSourceSha256);
  assert.equal(r.nextSourceSha256, LABOUR.sourceSha256);
  assert.equal(r.artifactSha256, LABOUR.artifactSha256);
  assert.equal(r.baselineAnd76ProposalReceiptsUnchanged, true);
  assert.equal(r.freshWholeProposalInstalled, false);
  assert.deepEqual(r.expectedFunctions, LABOUR.functions);
  const observed = r.observedFunctions as Record<string, unknown>[];
  assert.equal(observed.length, 2);
  for (const expected of LABOUR.functions) {
    const actual = observed.find((f) => f.signature === expected.signature);
    assert(actual);
    assert.equal(actual.body_sha256, expected.newBodySha256);
    assert.equal(actual.owner, expected.owner);
    assert.equal(actual.prosecdef, true);
    assert.deepEqual(actual.proconfig, ['search_path=pg_catalog']);
    assert.equal(actual.proacl, LABOUR_ACL);
  }
  return { functions: LABOUR.functions, artifactSha256: LABOUR.artifactSha256 };
}

/** Called only with fresh actual catalog rows by the upgrade entry, before any
 * of its seven DDL chunks. Public for small metadata-only regression tests. */
export function assertKnownRetainedLabourCatalog(
  functions: readonly FunctionRow[],
) {
  for (const expected of LABOUR.functions) {
    const actual = functions.find((f) => f.signature === expected.signature);
    assert(actual, expected.signature);
    assert.equal(
      actual.body_sha256,
      expected.newBodySha256,
      expected.signature,
    );
    assert.equal(actual.owner, expected.owner, expected.signature);
    assert.equal(actual.security_definer, true, expected.signature);
    assert.deepEqual(
      actual.config,
      ['search_path=pg_catalog'],
      expected.signature,
    );
    assert.equal(actual.acl, LABOUR_ACL, expected.signature);
    assert.deepEqual(actual.readers, expected.executeRoles, expected.signature);
  }
}

/** Read the complete inherited descriptor/receipt chain without executing it.
 * Additional derived-data checkpoints may wrap the repair checkpoint; unknown
 * extra DDL receipts fail closed instead of becoming executable SQL input. */
export async function readRetainedPostwarPowerUpgradeLineage(
  checkpointPath: string,
  expectedSha256: string,
): Promise<{
  checkpoint: Checkpoint;
  markerPath: string;
  lineage: { path: string; sha256: string; document: unknown }[];
  labourForward?: Record<string, unknown>;
  schemaAncestrySidecar?: Record<string, unknown>;
}> {
  assert.match(expectedSha256, /^[a-f0-9]{64}$/u);
  const lineage: { path: string; sha256: string; document: unknown }[] = [];
  const visited = new Set<string>();
  let current: string | undefined = checkpointPath;
  let markerPath: string | undefined;
  let root: Checkpoint | undefined;
  let repairFound = false;
  let inheritedFound = false;
  let labourForward: Record<string, unknown> | undefined;
  let schemaAncestrySidecar: Record<string, unknown> | undefined;
  while (current) {
    evidencePath(current);
    assert(
      !visited.has(current) && visited.size < 32,
      'CHECKPOINT_LINEAGE_CYCLE_OR_LIMIT',
    );
    visited.add(current);
    const bytes: Buffer = await readFile(current);
    if (!root) assert.equal(hash(bytes), expectedSha256);
    const checkpoint = JSON.parse(bytes.toString('utf8')) as Checkpoint;
    root ??= checkpoint;
    lineage.push({ path: current, sha256: hash(bytes), document: checkpoint });
    assert.equal(checkpoint.ownedContainer, root.ownedContainer);
    assert.equal(checkpoint.ownershipNonce, root.ownershipNonce);
    if (checkpoint.markerPath) {
      const markerBytes = await readFile(evidencePath(checkpoint.markerPath));
      const recordedMarker = JSON.parse(markerBytes.toString('utf8'));
      assert.equal(recordedMarker.ownedContainer, root.ownedContainer);
      assert.equal(recordedMarker.ownershipNonce, root.ownershipNonce);
      lineage.push({
        path: checkpoint.markerPath,
        sha256: hash(markerBytes),
        document: recordedMarker,
      });
      markerPath ??= checkpoint.markerPath;
    }
    if (checkpoint.extraDdlReceipt) {
      const receiptPath = evidencePath(checkpoint.extraDdlReceipt);
      const receiptBytes = await readFile(receiptPath);
      const r = JSON.parse(receiptBytes.toString('utf8'));
      assert.equal(r.name, 'postwar-complete-opening-inventory-read-repair');
      assert.equal(r.sourceCommit, REPAIR.commit);
      assert.equal(r.sourcePath, REPAIR.path);
      assert.equal(r.sha256, REPAIR.sha256);
      assert.equal(r.status, 'DDL_COMMITTED');
      assert.equal(r.database, checkpoint.templateDatabase);
      repairFound = true;
      lineage.push({
        path: receiptPath,
        sha256: hash(receiptBytes),
        document: r,
      });
    }
    if (checkpoint.functionForwardReceipt) {
      assert(!labourForward, 'DUPLICATE_FORWARD_RECEIPT_DENIED');
      const receiptPath = evidencePath(checkpoint.functionForwardReceipt);
      const receiptBytes = await readFile(receiptPath);
      const receipt = JSON.parse(receiptBytes.toString('utf8')) as Record<
        string,
        unknown
      >;
      validateKnownRetainedLabourReceipt(receipt);
      assert.equal(receipt.database, checkpoint.templateDatabase);
      const artifactPath = evidencePath(String(receipt.artifactPath));
      const artifactBytes = await readFile(artifactPath);
      assert.equal(hash(artifactBytes), LABOUR.artifactSha256);
      labourForward = receipt;
      lineage.push({
        path: receiptPath,
        sha256: hash(receiptBytes),
        document: receipt,
      });
      lineage.push({
        path: artifactPath,
        sha256: hash(artifactBytes),
        document: {
          classification: 'ALREADY_EXECUTED_REFERENCE_BYTES_NEVER_REPLAYED',
          sha256: LABOUR.artifactSha256,
        },
      });
    }
    if (checkpoint.inheritedDdlReceipts) {
      const receiptPath = evidencePath(checkpoint.inheritedDdlReceipts.path);
      assert.equal(checkpoint.inheritedDdlReceipts.field, 'ddlReceipts');
      const receiptBytes = await readFile(receiptPath);
      const inherited = JSON.parse(receiptBytes.toString('utf8'));
      assert(
        Array.isArray(inherited.ddlReceipts) &&
          inherited.ddlReceipts.length > 0,
      );
      assert(
        inherited.ddlReceipts.every(
          (r: { status: string; sha256: string }) =>
            r.status === 'DDL_COMMITTED' && /^[a-f0-9]{64}$/u.test(r.sha256),
        ),
      );
      inheritedFound = true;
      lineage.push({
        path: receiptPath,
        sha256: hash(receiptBytes),
        document: inherited,
      });
    }
    current = checkpoint.parentCheckpoint;
  }
  if (labourForward) {
    // The old parentCheckpoint tracks economic recovery, not the schema clone
    // source. Append a precisely pinned sidecar; never rewrite those records.
    const repair = await readRetainedPostwarPowerUpgradeLineage(
      KNOWN_SCHEMA_ANCESTRY.repairCheckpoint,
      KNOWN_SCHEMA_ANCESTRY.repairCheckpointSha256,
    );
    assert.equal(root!.ownershipNonce, repair.checkpoint.ownershipNonce);
    assert.equal(root!.ownedContainer, repair.checkpoint.ownedContainer);
    const restoreBytes = await readFile(
      KNOWN_SCHEMA_ANCESTRY.actualRestoreEvidence,
    );
    assert.equal(hash(restoreBytes), KNOWN_SCHEMA_ANCESTRY.actualRestoreSha256);
    const restore = JSON.parse(restoreBytes.toString('utf8'));
    assert.equal(
      restore.readRepair.checkpointFile,
      KNOWN_SCHEMA_ANCESTRY.repairCheckpoint,
    );
    assert.equal(
      restore.readRepair.checkpointSha256,
      KNOWN_SCHEMA_ANCESTRY.repairCheckpointSha256,
    );
    assert.equal(restore.readRepair.sqlSha256, REPAIR.sha256);
    assert.equal(
      restore.cloneDatabase,
      (labourForward.sourceCheckpoint as Checkpoint).templateDatabase,
    );
    const actualRepairFunctions = restore.actualReadRepairFunctions as {
      signature: string;
      prosrc_sha256: string;
      owner: string;
      prosecdef: boolean;
      proconfig: string[];
      acl: string;
    }[];
    assert.equal(actualRepairFunctions.length, 13);
    schemaAncestrySidecar = {
      schemaVersion: 'postwar-retained-power-schema-ancestry-sidecar-v1',
      classification:
        'APPENDED_SCHEMA_ANCESTRY_NOT_REWRITTEN_ECONOMIC_CHECKPOINTS',
      repairCheckpoint: KNOWN_SCHEMA_ANCESTRY.repairCheckpoint,
      repairCheckpointSha256: KNOWN_SCHEMA_ANCESTRY.repairCheckpointSha256,
      repairExtraReceipt: repair.lineage.find((item) =>
        item.path.endsWith('/extra-ddl-receipt.json'),
      ),
      actualRestoreEvidence: KNOWN_SCHEMA_ANCESTRY.actualRestoreEvidence,
      actualRestoreSha256: KNOWN_SCHEMA_ANCESTRY.actualRestoreSha256,
      inputDescriptorPins: restore.readRepair,
      actualRepairFunctions,
      freshCatalogVerificationStillRequired: true,
    };
    lineage.push(
      ...repair.lineage.filter(
        (item) => !lineage.some((p) => p.path === item.path),
      ),
    );
    lineage.push({
      path: KNOWN_SCHEMA_ANCESTRY.actualRestoreEvidence,
      sha256: hash(restoreBytes),
      document: { ...schemaAncestrySidecar },
    });
    markerPath ??= repair.markerPath;
    repairFound = true;
    inheritedFound = true;
  }
  assert(
    root && markerPath && repairFound && inheritedFound,
    'EXACT_REPAIR_AND_INHERITED_DDL_LINEAGE_REQUIRED',
  );
  assert(root.isTemplate && root.allowConnections === false);
  assert.match(root.templateDatabase, /^postwar_clone_[a-z0-9_]+$/u);
  return {
    checkpoint: root,
    markerPath,
    lineage,
    labourForward,
    schemaAncestrySidecar,
  };
}

async function catalog(tx: PoolClient): Promise<Catalog> {
  const r = await tx.query<{ catalog: Catalog }>(
    [
      'select json_build_object(',
      "'roles',(select json_agg(x order by oid)from(select oid,rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication from pg_roles)x),",
      "'memberships',(select json_agg(x order by roleid,member)from(select roleid,member,admin_option from pg_auth_members)x),",
      "'tables',(select json_agg(x order by oid)from(select c.oid,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'and c.relkind in('r','p'))x),",
      "'policies',(select json_agg(p order by p.oid)from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'),",
      "'triggers',(select json_agg(t order by t.oid)from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'),",
      "'grantKey',(select pg_get_constraintdef(oid)from pg_constraint where conrelid='world_v2.postwar_industry_water_grant_publication'::regclass and contype='p'),",
      "'functions',(select json_agg(x order by signature)from(select p.oid,replace(p.oid::regprocedure::text,'timestamp with time zone','timestamptz')as signature,pg_get_userbyid(p.proowner)as owner,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')as body_sha256,p.proacl::text as acl,p.prosecdef as security_definer,p.proconfig as config,p.proargnames,p.proisstrict,p.provolatile,p.proparallel,pg_get_function_result(p.oid)as result,(select coalesce(json_agg(case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end),'[]'::json)from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')as readers from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2')x))as catalog",
    ].join(''),
  );
  return r.rows[0]!.catalog;
}

/** Server-side digest only: no large source payload is returned to Node. */
async function rowDigests(tx: PoolClient) {
  const tables = await tx.query<{ name: string }>(
    "select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'and c.relkind='r'order by c.relname",
  );
  const result: Record<string, { count: string; digest: string }> = {};
  for (const { name } of tables.rows) {
    assert.match(name, /^[a-z0-9_]+$/u);
    const source =
      name === 'opening_seed'
        ? '(select world_id,seed_id,seed_fingerprint,md5(canonical_payload)as canonical_md5 from world_v2.opening_seed)t'
        : 'world_v2."' + name + '" t';
    result[name] = (
      await tx.query<{ count: string; digest: string }>(
        "select count(*)::text as count,md5(coalesce(string_agg(md5(row_to_json(t)::text),''order by md5(row_to_json(t)::text)),''))as digest from " +
          source,
      )
    ).rows[0]!;
  }
  return result;
}

export async function upgradeRetainedPostwarPowerClone(input: {
  repositoryRoot: string;
  expectedCommit: string;
  parentCheckpointPath: string;
  parentCheckpointSha256: string;
  evidenceDirectory: string;
}) {
  assert.equal(
    process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE,
    '1',
    'EXPLICIT_RETAINED_UPGRADE_OPT_IN_REQUIRED',
  );
  evidencePath(input.evidenceDirectory);
  const plan = await prepareRetainedPostwarPowerUpgrade(input);
  const inherited = await readRetainedPostwarPowerUpgradeLineage(
    input.parentCheckpointPath,
    input.parentCheckpointSha256,
  );
  await mkdir(input.evidenceDirectory, { recursive: false });
  if (inherited.schemaAncestrySidecar)
    await writeFile(
      path.join(input.evidenceDirectory, 'schema-ancestry-sidecar.json'),
      JSON.stringify(inherited.schemaAncestrySidecar, null, 2) + '\n',
    );
  const report: Record<string, unknown> = {
    classification:
      'TEST_ONLY_RETAINED_CLONE_FIXED_POWER_UPGRADE_NOT_SOURCE_ADMISSION_OR_PRODUCTION',
    startedAt: new Date().toISOString(),
    status: 'PREPARED_NOT_EXECUTED',
    expectedCommit: input.expectedCommit,
    oldReference: OLD,
    targetReference: TARGET,
    referenceOldNonClockProposalCount: 76,
    inheritedReceiptsMeaning:
      'Preserved as actually recorded, not fabricated into 76 new execution receipts',
    parentCheckpoint: input.parentCheckpointPath,
    parentCheckpointSha256: input.parentCheckpointSha256,
    inheritedLineage: inherited.lineage,
    schemaAncestrySidecar: inherited.schemaAncestrySidecar ?? null,
    schemaAncestrySidecarPath: inherited.schemaAncestrySidecar
      ? path.join(input.evidenceDirectory, 'schema-ancestry-sidecar.json')
      : null,
    knownLabourForward: inherited.labourForward ?? null,
    manifestPath: MANIFEST,
    manifestSha256: plan.manifestSha256,
    originalFreshPlanNotReinstalled: true,
    repairNotReplayed: true,
    runtimeReady: false,
    phases: [],
  };
  const save = async () =>
    writeFile(
      path.join(input.evidenceDirectory, 'upgrade-receipt.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  await save();
  // Existing helper validates fixed image, nonce, named volume, network=none.
  // It clones the sealed source without opening/modifying that source database.
  const { clonePostwarNativeReference, loadPostwarNativeReferenceMarker } =
    await import('./postwar-native-reference-db.js');
  const marker = await loadPostwarNativeReferenceMarker(inherited.markerPath);
  assert.equal(marker.ownershipNonce, inherited.checkpoint.ownershipNonce);
  assert.equal(marker.ownedContainer, inherited.checkpoint.ownedContainer);
  const control = new Pool({
    host: marker.socket,
    port: marker.port,
    database: 'postgres',
    user: 'postgres',
    max: 1,
    ssl: false,
    password: async () => '',
    connectionTimeoutMillis: 10000,
  });
  try {
    const source = (
      await control.query(
        'select datistemplate,datallowconn,pg_database_size(oid)::text as size from pg_database where datname=$1',
        [inherited.checkpoint.templateDatabase],
      )
    ).rows[0];
    assert(
      source?.datistemplate && source.datallowconn === false,
      'ACTUAL_SEALED_SOURCE_REQUIRED',
    );
    const df = execFileSync(
      'docker',
      [
        'exec',
        marker.ownedContainer,
        'df',
        '-B1',
        '--output=avail',
        '/var/lib/postgresql/data',
      ],
      { encoding: 'utf8', maxBuffer: 65536 },
    );
    const free = BigInt(df.trim().split(/\s+/u).at(-1)!);
    const required = (BigInt(source.size) * 5n) / 4n + 256n * 1024n * 1024n;
    report.storagePreflight = {
      sourceDatabaseBytes: source.size,
      actualDaemonFilesystemFreeBytes: String(free),
      requiredBytes: String(required),
      policy:
        'one clone only, source size times 1.25 plus 256MiB; never delete a retained database',
    };
    await save();
    assert(
      free >= required,
      'INSUFFICIENT_OWNED_PGDATA_SPACE_DO_NOT_CLONE_OR_DELETE_CHECKPOINTS',
    );
  } catch (error) {
    report.status = 'STORAGE_OR_SEALED_SOURCE_PRECONDITION_BLOCKED_NO_CLONE';
    report.error = error instanceof Error ? error.message : String(error);
    await save();
    throw error;
  } finally {
    await control.end();
  }
  report.status = 'CLONE_CREATION_SUBMITTED_NO_RETRY';
  report.cloneOwnerPrefix = 'postwar_clone_power_upgrade_';
  await save();
  let clone: Awaited<ReturnType<typeof clonePostwarNativeReference>>;
  try {
    clone = await clonePostwarNativeReference(
      marker,
      'power_upgrade',
      inherited.checkpoint.templateDatabase,
    );
  } catch (error) {
    report.status = 'CLONE_CREATION_OUTCOME_UNCONFIRMED_STOP_NO_RETRY';
    report.error = error instanceof Error ? error.message : String(error);
    await save();
    throw error;
  }
  report.database = clone.database;
  report.ownedContainer = marker.ownedContainer;
  report.ownershipNonce = marker.ownershipNonce;
  report.markerPath = inherited.markerPath;
  report.status = 'RUNNING';
  await save();
  let tx: PoolClient;
  try {
    tx = await clone.installer.connect();
  } catch (error) {
    report.status = 'CLONE_CONNECTION_FAILED_NO_SQL_SUBMITTED_RETAINED';
    await clone.close();
    await save();
    throw error;
  }
  try {
    const actual = (
      await tx.query(
        'select current_database()as database,version()as version,(select count(*)::int from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid())as other_connections',
      )
    ).rows[0];
    assert.equal(actual.database, clone.database);
    assert.match(actual.version, /^PostgreSQL 16\.15 /u);
    assert.equal(
      actual.other_connections,
      0,
      'CLONE_MUST_HAVE_NO_OTHER_CONNECTIONS',
    );
    await tx.query("set lock_timeout='2s';set statement_timeout='120s'");
    const head = (
      await tx.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [marker.worldId],
      )
    ).rows;
    assert.deepEqual(head, [inherited.checkpoint.head]);
    const before = await catalog(tx);
    const rowsBefore = await rowDigests(tx);
    report.before = { catalog: before, rowDigests: rowsBefore, head };
    for (const expected of plan.repairFunctions) {
      assert.equal(
        before.functions.find((f) => f.signature === expected.signature)
          ?.body_sha256,
        expected.bodySha256,
        'ACTUAL_REPAIR_FUNCTION_REQUIRED:' + expected.signature,
      );
      if (inherited.schemaAncestrySidecar) {
        const prior = (
          inherited.schemaAncestrySidecar.actualRepairFunctions as {
            signature: string;
            prosrc_sha256: string;
            owner: string;
            prosecdef: boolean;
            proconfig: string[];
            acl: string;
          }[]
        ).find((f) => f.signature === expected.signature);
        assert(prior);
        assert.equal(prior.prosrc_sha256, expected.bodySha256);
        const current = before.functions.find(
          (f) => f.signature === expected.signature,
        )!;
        assert.equal(current.owner, prior.owner);
        assert.equal(current.security_definer, prior.prosecdef);
        assert.deepEqual(current.config, prior.proconfig);
        assert.equal(current.acl, prior.acl);
      }
    }
    if (inherited.labourForward) {
      assert.equal(inherited.labourForward.worldId, marker.worldId);
      const sourceBytes = execFileSync(
        'git',
        [
          '--no-replace-objects',
          'show',
          LABOUR.commit + ':' + LABOUR.sourcePath,
        ],
        { cwd: input.repositoryRoot, maxBuffer: 4 * 1024 * 1024 },
      );
      assert.equal(hash(sourceBytes), LABOUR.sourceSha256);
      assertKnownRetainedLabourCatalog(before.functions);
    }
    await save();
    const phases = report.phases as Record<string, unknown>[];
    for (const artifact of plan.artifacts) {
      const phase: Record<string, unknown> = {
        path: artifact.path,
        sha256: artifact.rawSha256,
        status: 'SUBMITTING_NO_RETRY',
        startedAt: new Date().toISOString(),
      };
      phases.push(phase);
      await save();
      // Each reviewed artifact owns its fixed BEGIN/COMMIT. Any failure is a
      // hard stop; especially transport/COMMIT-ack uncertainty is never retried.
      const response = await tx.query(artifact.bytes);
      const responses = Array.isArray(response) ? response : [response];
      assert.equal(responses.at(-1)?.command, 'COMMIT', 'COMMIT_ACK_REQUIRED');
      phase.status = 'DDL_COMMITTED';
      phase.completedAt = new Date().toISOString();
      assert.deepEqual(
        await rowDigests(tx),
        rowsBefore,
        'ALL_EXISTING_WORLD_ROWS_MUST_REMAIN_IDENTICAL',
      );
      await save();
    }
    const after = await catalog(tx);
    for (const key of [
      'roles',
      'memberships',
      'tables',
      'policies',
      'triggers',
    ] as const)
      assert.deepEqual(after[key], before[key], key);
    assert.equal(after.grantKey, 'PRIMARY KEY (world_id, schedule_command_id)');
    const expectedBodies = new Map(
      plan.manifest.sourceFunctionChanges
        .filter((f) => !f.effect.startsWith('SHADOWED'))
        .map((f) => ['world_v2.' + f.signature, f.targetBodySha256]),
    );
    const expectedFreshMetadata = new Map<
      string,
      { owner: string; readers: string[] }
    >();
    for (const artifact of plan.artifacts.slice(5)) {
      for (const m of artifact.bytes.matchAll(
        /create(?: or replace)? function world_v2\.([a-z0-9_]+)\(([^$]*?)\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/gu,
      )) {
        const types = m[2]!
          .split(',')
          .map((p) => p.trim().split(/\s+/u).slice(1).join(' '));
        const localSignature = m[1] + '(' + types.join(',') + ')';
        const signature = 'world_v2.' + localSignature;
        expectedBodies.set(signature, hash(m[3]!));
        const ownerPrefix =
          'alter function world_v2.' + localSignature + 'owner to ';
        const grantPrefix =
          'grant execute on function world_v2.' + localSignature + 'to ';
        const lines = artifact.bytes.split('\n');
        const owner = lines
          .find((s) => s.startsWith(ownerPrefix))
          ?.slice(ownerPrefix.length)
          .replace(/;$/u, '');
        assert(owner, signature);
        const readers = lines
          .filter((s) => s.startsWith(grantPrefix))
          .map((s) => s.slice(grantPrefix.length).replace(/;$/u, ''))
          .filter((s) => s !== owner)
          .sort();
        expectedFreshMetadata.set(signature, { owner, readers });
      }
    }
    for (const [signature, expected] of expectedBodies)
      assert.equal(
        after.functions.find((f) => f.signature === signature)?.body_sha256,
        expected,
        signature,
      );
    for (const [signature, expected] of expectedFreshMetadata) {
      const actual = after.functions.find((f) => f.signature === signature)!;
      assert.equal(actual.owner, expected.owner, signature);
      assert.deepEqual(actual.readers, expected.readers, signature);
      assert.equal(actual.security_definer, true, signature);
      assert.deepEqual(actual.config, ['search_path=pg_catalog'], signature);
    }
    for (const old of before.functions) {
      const current = after.functions.find(
        (f) => f.signature === old.signature,
      );
      assert(current, old.signature);
      if (!expectedBodies.has(old.signature))
        assert.equal(
          current.body_sha256,
          old.body_sha256,
          'UNRELATED_FUNCTION_BODY_CHANGED:' + old.signature,
        );
      assert.deepEqual(
        { ...current, body_sha256: old.body_sha256 },
        old,
        'EXISTING_FUNCTION_METADATA_AND_UNCHANGED_BODIES:' + old.signature,
      );
    }
    for (const current of after.functions.filter(
      (f) => !before.functions.some((p) => p.signature === f.signature),
    )) {
      assert(expectedBodies.has(current.signature), current.signature);
      assert(!current.readers.includes('PUBLIC'), 'NO_NEW_PUBLIC_EXEC');
    }
    report.after = { catalog: after, rowDigests: await rowDigests(tx) };
    report.status = 'UPGRADED_CATALOG_AND_ROWS_VERIFIED_NOT_SOURCE_READY';
    report.finishedAt = new Date().toISOString();
    await save();
    tx.release();
    return {
      marker,
      clone,
      upgradeReceipt: path.join(
        input.evidenceDirectory,
        'upgrade-receipt.json',
      ),
      close: () => clone.close(),
    };
  } catch (error) {
    report.status = 'STOPPED_NO_RETRY_RETAIN_CLONE_FOR_COMMIT_RECONCILIATION';
    report.error = {
      message: error instanceof Error ? error.message : String(error),
      code:
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : null,
    };
    report.finishedAt = new Date().toISOString();
    // Discard the connection, never issue a speculative second transaction or
    // drop a possibly committed clone. Parent template is never modified.
    tx.release(true);
    await clone.close();
    await save();
    throw error;
  }
}
