/** Reviewable SQL packaging only. No SQL driver, provider, credential, role
 * enrollment, migration registration or execution switch exists here. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = (v) => createHash('sha256').update(v).digest('hex');
const id = /^[a-z][a-z0-9_]*$/u;
const digest = /^[a-f0-9]{64}$/u;
const forbidden =
  /\bdrop\b|\bdisable\s+(?:row\s+level\s+security|trigger)\b|\brow_security\s*(?:=|to)\s*off\b|\b(?:vacuum|reindex|alter\s+system|create\s+(?:database|tablespace)|prepare\s+transaction)\b|\bcreate\s+(?:unique\s+)?index\s+concurrently\b|\bcreate\s+(?:user|role)[^;\n]*\blogin\b|\bpassword\b|\\!/iu;
/** Conservative fixed-source classification, not a general SQL parser. Unknown
 * transaction shapes or unsafe commands stop packaging for explicit review. */
export function classifyDeltaTransaction(bytes) {
  const sql = bytes.toString('utf8');
  if (!Buffer.from(sql, 'utf8').equals(bytes) || sql.includes('\0'))
    throw Error('VALID_UTF8_SQL_REQUIRED');
  if (forbidden.test(sql))
    throw Error('DESTRUCTIVE_CREDENTIAL_OR_NONTRANSACTIONAL_SQL_DENIED');
  const outer = sql
    .replace(/(\$[a-z_0-9]*\$)[\s\S]*?\1/giu, ' ')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/--[^\n]*/gu, ' ')
    .trim();
  const begin = [...outer.matchAll(/\bbegin\s*;/giu)].length;
  const commit = [...outer.matchAll(/\bcommit\s*;/giu)].length;
  if (/\b(?:rollback|savepoint|start\s+transaction|abort)\b/iu.test(outer))
    throw Error('UNSUPPORTED_TRANSACTION_CONTROL_REQUIRES_REVIEW');
  if (
    begin === 1 &&
    commit === 1 &&
    /^begin\s*;/iu.test(outer) &&
    /commit\s*;$/iu.test(outer)
  )
    return { sourceEnvelope: 'SOURCE_BEGIN_COMMIT', wrapped: false, bytes };
  if (begin || commit) throw Error('UNSUPPORTED_TRANSACTION_ENVELOPE');
  return {
    sourceEnvelope: 'WRAPPED_SINGLE_TRANSACTION',
    wrapped: true,
    bytes: Buffer.from('begin;\n' + sql + '\ncommit;\n'),
  };
}

/** Pure unapproved plan. Only preparePostwarSchemaDelta performs immutable Git
 * validation through the existing companion candidate/catalog tools. */
export function createUnapprovedSchemaDeltaPlan(candidate, sources) {
  const { manifest, pins } = candidate;
  if (
    !/^[a-f0-9]{40}$/u.test(pins.sourceCommit ?? '') ||
    /^0+$/u.test(pins.sourceCommit) ||
    pins.installationAllowed !== false ||
    manifest.production_publisher !== 'main-site-release-chain'
  )
    throw Error('EXPLICIT_UNAPPROVED_IMMUTABLE_SOURCE_REQUIRED');
  const all = pins.proposals;
  const selected = all.filter(
    (p) =>
      p.id !== 'isolated-world-clock' && !p.disposition.startsWith('EXCLUDED_'),
  );
  const selectedIds = new Set(selected.map((p) => p.id));
  if (selectedIds.size !== selected.length) throw Error('DUPLICATE_PROPOSAL');
  const baseline = new Set(manifest.migrations.map((m) => m.migration_id));
  const seen = new Set(),
    functions = new Map(),
    chunks = [];
  for (const p of selected) {
    if (
      !id.test(p.id.replaceAll('-', '_')) ||
      p.path !== `database/proposals/${p.id}.sql` ||
      p.dependencies.some((d) => !selectedIds.has(d) || !seen.has(d)) ||
      p.baselineDependencies.some((d) => !baseline.has(d))
    )
      throw Error('DEPENDENCY_ORDER_OR_BASELINE_REQUIRED');
    const bytes = sources.get(p.path);
    if (
      !Buffer.isBuffer(bytes) ||
      !digest.test(p.sha256) ||
      sha(bytes) !== p.sha256
    )
      throw Error('SOURCE_ARTIFACT_HASH_DIFFERS');
    const transaction = classifyDeltaTransaction(bytes);
    const sequence = String(chunks.length + 1).padStart(2, '0');
    const entry = {
      id: p.id,
      disposition: p.disposition,
      dependencies: p.dependencies,
      sourceRoleDeps: p.sourceRoleDeps ?? {},
      baselineDependencies: p.baselineDependencies,
      sourcePath: p.path,
      sourceSha256: p.sha256,
      sourceBytes: bytes.length,
      packagedSourcePath: `source/${sequence}-${p.id}.sql`,
      transactionPath: `transactions/${sequence}-${p.id}.sql`,
      transactionSha256: sha(transaction.bytes),
      transactionBytes: transaction.bytes.length,
      transactionEnvelope: transaction.sourceEnvelope,
      nonTransactionalParts: [],
      executionAllowed: false,
      preconditions: {
        relationsMustBeAbsent: p.createdRelations,
        rolesMustBeAbsent: p.createdRoles,
        existingObjectDisposition:
          'CONFLICT_STOP_NO_IF_NOT_EXISTS_OR_OBJECT_REUSE',
        reusedRoles: p.reusedRoles.map((role) => ({
          role,
          attributes: [
            'NOLOGIN',
            'NOSUPERUSER',
            'NOBYPASSRLS',
            'NOCREATEDB',
            'NOCREATEROLE',
            'NOREPLICATION',
          ],
          enrollmentApproved: false,
        })),
        functions: p.definedFunctions.map((name) => ({
          name,
          predecessorProposal: functions.get(name) ?? null,
          expectedDefinitionSha256: null,
          requirement: functions.has(name)
            ? 'VERIFY_EXACT_REVIEWED_PREDECESSOR_BEFORE_REPLACE_OR_RENAME'
            : 'ABSENT_OR_EXPLICIT_BASELINE_OVERRIDE_REVIEW_REQUIRED',
        })),
        renamedFunctionTargets: p.renamedFunctions ?? [],
        observed: false,
      },
      recovery: {
        beforeCommit: 'ROLLBACK_CURRENT_OPEN_TRANSACTION_ONLY_IF_OUTCOME_KNOWN',
        afterCommit: 'RETAIN_PREVIOUS_COMMITTED_CHUNKS_FORWARD_FIX_ONLY',
        uncertainCommit:
          'UNKNOWN_STOP_NO_RETRY_VERIFY_CATALOG_AND_RELEASE_LEDGER',
        automaticRollback: false,
        destructiveRollback: false,
      },
    };
    chunks.push({ entry, source: bytes, transaction: transaction.bytes });
    seen.add(p.id);
    for (const name of p.definedFunctions) functions.set(name, p.id);
  }
  return {
    chunks,
    manifest: {
      schemaVersion: 'postwar-schema-delta-review-package-v1',
      classification: 'UNAPPROVED_SOURCE_ONLY_SCHEMA_DELTA_NOT_INSTALLATION',
      sourceCommit: pins.sourceCommit,
      sourceTree: pins.sourceTree,
      baselineManifestSha256: pins.manifestSha256,
      companionPolicySha256: pins.expandedPolicySha256,
      baseline: manifest.migrations.map((m) => ({
        id: m.migration_id,
        releaseOrder: m.release_order,
        path: m.path,
        sha256: m.sha256,
        sourceCommit: m.artifact_source_commit,
      })),
      inventoriedProposalCount: all.length,
      packagedProposalCount: chunks.length,
      excludedNotPackaged: all
        .filter((p) => !selectedIds.has(p.id))
        .map((p) => ({
          id: p.id,
          reason: 'EXCLUDED_NOT_AN_INSTALL_DEPENDENCY',
        })),
      isolatedClockSqlIncluded: false,
      installationAllowed: false,
      productionApproval: 'NOT_GRANTED',
      migrationRegistrationPerformed: false,
      databaseOperations: 0,
      networkRequests: 0,
      credentialsCreated: 0,
      productionVerifiedOffices: 0,
      productionOfficeDenominator: 6,
      acrossFilesAtomic: false,
      targetSchemaObserved: false,
      targetApplicability:
        'FRESH_DELTA_ONLY_UNTIL_CATALOG_CONFLICTS_ARE_RECONCILED',
      preconditions: {
        catalog: 'preflight/catalog.sql',
        catalogReadbackStatus: 'NOT_RUN',
        baselineReleaseLedgerQuery: 'baseline-release-precondition.sql',
        releaseLedger:
          'ALL_PINNED_BASELINE_IDS_HASHES_ORDERS_REQUIRE_SEPARATE_CONTROLLED_READBACK',
        conflictPolicy:
          'EXISTING_DELTA_RELATIONS_OR_ROLES_STOP_NO_DROP_OR_SILENT_REUSE',
        functionConflictPolicy:
          'CATALOG_SIGNATURE_OWNER_SEARCH_PATH_AND_DEFINITION_HASH_REVIEW_REQUIRED',
        optionalOfflineRole: pins.externalRolePrerequisite ?? null,
        noRoleEnrollmentImplied: true,
      },
      steps: chunks.map((c) => c.entry),
      recoveryBoundary:
        'NO_AUTOMATIC_SCHEMA_ROLLBACK; catalog read-only ROLLBACK does not undo committed DDL',
    },
  };
}

async function regular(file) {
  if (!(await lstat(file)).isFile() || (await realpath(file)) !== file)
    throw Error('REGULAR_COMPANION_MODULE_REQUIRED');
  return readFile(file);
}
export async function preparePostwarSchemaDelta({
  sourceRoot,
  candidateSha,
  companionRoot,
  outputDirectory,
}) {
  for (const v of [sourceRoot, companionRoot, outputDirectory])
    if (typeof v !== 'string' || !path.isAbsolute(v))
      throw Error('ABSOLUTE_PATHS_REQUIRED');
  sourceRoot = await realpath(sourceRoot);
  companionRoot = await realpath(companionRoot);
  outputDirectory = path.join(
    await realpath(path.dirname(outputDirectory)),
    path.basename(outputDirectory),
  );
  for (const root of [sourceRoot, companionRoot])
    if (outputDirectory === root || outputDirectory.startsWith(root + path.sep))
      throw Error('OUTPUT_OUTSIDE_BOTH_REPOSITORIES_REQUIRED');
  const loaderFile = path.join(
    companionRoot,
    'scripts/world-v2-postwar-proposal-candidate.mjs',
  );
  const catalogFile = path.join(
    companionRoot,
    'scripts/world-v2-postwar-production-preflight.mjs',
  );
  const dependencies = await Promise.all(
    [loaderFile, catalogFile].map(async (file) => ({
      path: file,
      sha256: sha(await regular(file)),
    })),
  );
  const { loadPostwarExpandedProposalCandidate } = await import(
    pathToFileURL(loaderFile).href
  );
  const { preparePostwarProductionPreflight } = await import(
    pathToFileURL(catalogFile).href
  );
  const candidate = await loadPostwarExpandedProposalCandidate(
    sourceRoot,
    candidateSha,
  );
  const sources = new Map(
    await Promise.all(
      candidate.pins.proposals.map(async (p) => [
        p.path,
        await readFile(path.join(sourceRoot, p.path)),
      ]),
    ),
  );
  const plan = createUnapprovedSchemaDeltaPlan(candidate, sources);
  await mkdir(outputDirectory); // Exclusive; never overwrite an earlier package.
  await mkdir(path.join(outputDirectory, 'source'));
  await mkdir(path.join(outputDirectory, 'transactions'));
  for (const c of plan.chunks) {
    await writeFile(
      path.join(outputDirectory, c.entry.packagedSourcePath),
      c.source,
      { flag: 'wx' },
    );
    await writeFile(
      path.join(outputDirectory, c.entry.transactionPath),
      c.transaction,
      { flag: 'wx' },
    );
  }
  const preflight = await preparePostwarProductionPreflight({
    sourceRoot,
    candidateSha,
    outputDirectory: path.join(outputDirectory, 'preflight'),
  });
  if (
    preflight.sourceCommit !== candidateSha ||
    preflight.sourceTree !== candidate.pins.sourceTree
  )
    throw Error('CANDIDATE_CHANGED_DURING_DELTA_PACKAGING');
  plan.manifest.generatorSha256 = sha(
    await readFile(fileURLToPath(import.meta.url)),
  );
  plan.manifest.companionDependencies = dependencies;
  plan.manifest.catalogQuerySha256 = preflight.catalogQuerySha256;
  const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const baselineSql = `-- Rendered metadata precondition only; not executed or approved.\nbegin isolation level repeatable read read only;\nwith expected(migration_id,artifact_sha256,source_repo_commit,release_order)as(values\n${plan.manifest.baseline.map((m) => `(${literal(m.id)},${literal(m.sha256)},${literal(m.sourceCommit)},${m.releaseOrder})`).join(',\n')}\n),actual as(select migration_id,artifact_sha256,source_repo_commit,release_order from world_v2.schema_release)\nselect coalesce(e.migration_id,a.migration_id)as migration_id,case when e.migration_id is null then'UNEXPECTED_REGISTERED_MIGRATION'when a.migration_id is null then'MISSING_BASELINE_RELEASE'when e.artifact_sha256<>a.artifact_sha256 or e.source_repo_commit<>a.source_repo_commit or e.release_order<>a.release_order then'BASELINE_RELEASE_MISMATCH'else'MATCH'end as status\nfrom expected e full join actual a using(migration_id)order by migration_id;\nrollback;\n`;
  plan.manifest.baselineReleasePreconditionSha256 = sha(baselineSql);
  await writeFile(
    path.join(outputDirectory, 'baseline-release-precondition.sql'),
    baselineSql,
    { flag: 'wx' },
  );
  await writeFile(
    path.join(outputDirectory, 'RECOVERY.md'),
    `# Unapproved schema delta\n\nNo SQL has run. No production registration or approval is granted.\n\nReview the exact baseline release ledger and preflight/catalog.sql output first. Resolve every existing relation/role conflict; do not drop or silently reuse objects. Check existing function signatures, owners, search paths and definition hashes against each approved predecessor. Catalog names alone cannot establish compatible bodies. Optional offline group enrollment remains separately reviewed; online readers must never inherit raw-seed access.\n\nTransactions are per source file, not one atomic ${plan.chunks.length}-file operation. Source files with BEGIN/COMMIT retain their exact envelope; files without one receive an explicit single transaction in transactions/. Both hashes are recorded. No nontransactional part is accepted by the conservative classifier; this is not a complete SQL semantic proof.\n\nIf failure occurs before known COMMIT, only the current open transaction may be rolled back. Earlier committed chunks remain. If COMMIT acknowledgement is uncertain, stop with UNKNOWN_STOP_NO_RETRY and inspect catalogs plus the controlled release ledger; never rerun CREATE ROLE/TABLE blindly. After committed DDL or economic facts, prepare a new reviewed forward-fix. No destructive or automatic rollback script is supplied. The catalog query's ROLLBACK only ends its read-only inspection.\n\nThis package omits isolated-world-clock SQL and starts no World/Clock. Publish only through a separately approved exact delta in main-site-release-chain; the existing historic workflow is not automatically enabled for this package. Production acceptance remains 0/6.\n`,
    { flag: 'wx' },
  );
  // The completion manifest is last: an interrupted package cannot look final.
  for (const dependency of dependencies)
    if (sha(await regular(dependency.path)) !== dependency.sha256)
      throw Error('COMPANION_MODULE_CHANGED_DURING_PACKAGING');
  const finalCandidate = await loadPostwarExpandedProposalCandidate(
    sourceRoot,
    candidateSha,
  );
  if (finalCandidate.pins.sourceTree !== candidate.pins.sourceTree)
    throw Error('CANDIDATE_CHANGED_DURING_DELTA_PACKAGING');
  await writeFile(
    path.join(outputDirectory, 'delta-manifest.json'),
    JSON.stringify(plan.manifest, null, 2) + '\n',
    { flag: 'wx' },
  );
  return {
    status: 'UNAPPROVED_SCHEMA_DELTA_PACKAGED_NOT_EXECUTED',
    sourceCommit: candidateSha,
    packagedProposals: plan.chunks.length,
    outputDirectory,
    installationAllowed: false,
    databaseOperations: 0,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    flags = [
      '--source-root',
      '--candidate-sha',
      '--companion-root',
      '--output-directory',
    ];
  if (args.length !== 8 || !flags.every((f, i) => args[i * 2] === f))
    throw Error('ONLY_SOURCE_SHA_COMPANION_FRESH_OUTPUT_ARGUMENTS_ALLOWED');
  const result = await preparePostwarSchemaDelta({
    sourceRoot: args[1],
    candidateSha: args[3],
    companionRoot: args[5],
    outputDirectory: args[7],
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}
