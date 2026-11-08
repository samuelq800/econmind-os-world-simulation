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
// One fixed, non-destructive CHECK extension for the existing shared
// derived-page table. All four prior office values remain valid. This exact
// adjacent replacement is packaged atomically; no general DROP exemption and
// no publication/approval is conferred by recognizing its source text.
const tradeCurrentOfficeCheckExtension =
  /alter\s+table\s+world_v2\.postwar_paged_current_document\s+drop\s+constraint\s+postwar_paged_current_document_office_id_check\s*;\s*alter\s+table\s+world_v2\.postwar_paged_current_document\s+add\s+constraint\s+postwar_paged_current_document_office_id_check\s+check\s*\(\s*office_id\s+in\s*\(\s*'FINANCE'\s*,\s*'CENTRAL_BANK'\s*,\s*'SOCIAL'\s*,\s*'CAPTAIN'\s*,\s*'TRADE'\s*\)\s*\)\s*;/giu;
// One reviewed existing-registry key replacement. The complete SQL bytes are
// pinned so its owner/RLS/column/function/history guards cannot be omitted or
// changed while retaining this narrow transaction-classification exception.
const waterGrantScopeUpgradeSha256 =
  '6f4dec7dbf60001e3c1953e326ce71e97d876b32c30e9e32c5100ccc486aa360';
const waterGrantScopeKeyReplacement =
  /alter\s+table\s+world_v2\.postwar_industry_water_grant_publication\s+drop\s+constraint\s+postwar_industry_water_grant_publication_pkey\s*;\s*alter\s+table\s+world_v2\.postwar_industry_water_grant_publication\s+add\s+constraint\s+postwar_industry_water_grant_publication_pkey\s+primary\s+key\s*\(\s*world_id\s*,\s*schedule_command_id\s*\)\s*;/giu;
/** Conservative fixed-source classification, not a general SQL parser. Unknown
 * transaction shapes or unsafe commands stop packaging for explicit review. */
export function classifyDeltaTransaction(bytes) {
  const sql = bytes.toString('utf8');
  if (!Buffer.from(sql, 'utf8').equals(bytes) || sql.includes('\0'))
    throw Error('VALID_UTF8_SQL_REQUIRED');
  const classified =
    sha(bytes) === waterGrantScopeUpgradeSha256
      ? sql.replace(waterGrantScopeKeyReplacement, '')
      : sql;
  if (forbidden.test(classified.replace(tradeCurrentOfficeCheckExtension, '')))
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

/** Explicit later function-only forward. The historical five-plus-two list and
 * the default fresh-delta plan are deliberately not extended or relabeled. */
export const LOGISTICS_FORWARD_MANIFEST_PATH =
  'database/upgrades/postwar-industry-logistics-multicountry-scope.manifest.json';
export const SOCIAL_CREATION_FORWARD_MANIFEST_PATH =
  'database/upgrades/postwar-social-employment-creation.manifest.json';
export function createUnapprovedSchemaForwardPlan(
  candidate,
  forward,
  sources,
  manifestSha256,
) {
  const { pins, manifest } = candidate;
  const u = forward.upgrade;
  const proposal = pins.proposals.find((p) => p.id === forward.targetProposal);
  if (
    forward.schemaVersion !== 'postwar-function-forward-manifest-v1' ||
    forward.id !== 'postwar-industry-logistics-multicountry-scope-v1' ||
    forward.classification !==
      'UNAPPROVED_FUNCTION_ONLY_FORWARD_NOT_FRESH_INSTALL' ||
    forward.installationAllowed !== false ||
    forward.productionApproval !== 'NOT_GRANTED' ||
    !digest.test(manifestSha256) ||
    !/^[a-f0-9]{40}$/u.test(pins.sourceCommit ?? '') ||
    pins.installationAllowed !== false ||
    manifest.production_publisher !== 'main-site-release-chain' ||
    u?.id !== 'postwar-industry-logistics-multicountry-scope-upgrade' ||
    u.path !== 'database/upgrades/' + u.id + '.sql' ||
    !proposal ||
    proposal.sha256 !== forward.targetProposalSha256 ||
    JSON.stringify(u.dependencies) !==
      JSON.stringify([
        'postwar-industry-logistics-custody',
        'postwar-source-revocation-fence',
      ]) ||
    u.dependencies.some((id) => !pins.proposals.some((p) => p.id === id))
  )
    throw Error('EXPLICIT_PINNED_LOGISTICS_FORWARD_REQUIRED');
  const bytes = sources.get(u.path);
  if (
    !Buffer.isBuffer(bytes) ||
    !digest.test(u.sha256) ||
    sha(bytes) !== u.sha256 ||
    bytes.length !== u.bytes
  )
    throw Error('FORWARD_SOURCE_ARTIFACT_HASH_DIFFERS');
  const signatures = [
    'world_v2.postwar_industry_logistics_order_scope(text,text,text)',
    'world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)',
  ];
  if (
    !Array.isArray(u.functions) ||
    u.functions.length !== 2 ||
    u.functions.some(
      (f, i) =>
        f.qualifiedSignature !== signatures[i] ||
        f.owner !== 'world_v2_industry_source_owner' ||
        f.securityDefiner !== true ||
        f.searchPath !== 'pg_catalog' ||
        !digest.test(f.oldBodySha256) ||
        !digest.test(f.newBodySha256) ||
        JSON.stringify(f.executeRoles) !==
          JSON.stringify(
            i === 0
              ? []
              : [
                  'world_v2_finance_budget_source_reader',
                  'world_v2_postwar_projection_owner',
                  'world_v2_social_source_reader',
                ],
          ) ||
        !bytes
          .toString('utf8')
          .includes(
            "('" +
              f.qualifiedSignature.slice('world_v2.'.length) +
              "','" +
              f.oldBodySha256 +
              "','" +
              f.newBodySha256 +
              "'",
          ),
    )
  )
    throw Error('EXACT_TWO_EXISTING_LOGISTICS_FUNCTION_TARGETS_REQUIRED');
  const transaction = classifyDeltaTransaction(bytes);
  if (transaction.wrapped) throw Error('FORWARD_EXPLICIT_TRANSACTION_REQUIRED');
  const entry = {
    id: u.id,
    disposition: forward.classification,
    dependencies: u.dependencies,
    sourcePath: u.path,
    sourceSha256: u.sha256,
    sourceBytes: bytes.length,
    packagedSourcePath: 'source/01-' + u.id + '.sql',
    transactionPath: 'transactions/01-' + u.id + '.sql',
    transactionSha256: sha(transaction.bytes),
    transactionBytes: transaction.bytes.length,
    transactionEnvelope: transaction.sourceEnvelope,
    nonTransactionalParts: [],
    executionAllowed: false,
    preconditions: {
      functions: u.functions,
      existingObjectDisposition: forward.existingObjectRequirement,
      metadataPolicy: forward.metadataPolicy,
      observed: false,
    },
    recovery: {
      ...forward.recovery,
      automaticRollback: false,
      destructiveRollback: false,
    },
  };
  return {
    chunks: [{ entry, source: bytes, transaction: transaction.bytes }],
    manifest: {
      schemaVersion: 'postwar-schema-forward-review-package-v1',
      classification: 'UNAPPROVED_EXPLICIT_FUNCTION_FORWARD_NOT_INSTALLATION',
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
      explicitForwardManifest: {
        path: LOGISTICS_FORWARD_MANIFEST_PATH,
        sha256: manifestSha256,
        predecessorCommit: forward.predecessorCommit,
        targetSourceCommit: forward.targetSourceCommit,
      },
      packagedProposalCount: 0,
      packagedForwardCount: 1,
      installationPath: 'EXISTING_EXACT_FUNCTIONS_FORWARD_ONLY',
      mutuallyExclusiveWith: 'FRESH_SCHEMA_DELTA_FROM_SAME_CANDIDATE',
      freshProposalSqlIncluded: false,
      steps: [entry],
      installationAllowed: false,
      productionApproval: 'NOT_GRANTED',
      migrationRegistrationPerformed: false,
      databaseOperations: 0,
      networkRequests: 0,
      credentialsCreated: 0,
      isolatedClockSqlIncluded: false,
      acrossFilesAtomic: false,
      targetSchemaObserved: false,
      targetApplicability:
        'EXACT_EXISTING_FUNCTION_PREDECESSORS_OR_SUCCESSORS_REQUIRE_CATALOG_READBACK',
      historicalUpgradeManifestsModified: false,
    },
  };
}

/** One additional fixed increment, verified by its already pinned read-only
 * loader. No arbitrary manifest, SQL, source initializer or execution callback. */
export async function createUnapprovedSocialCreationForwardPlan(
  candidate,
  sourceRoot,
) {
  if (!path.isAbsolute(sourceRoot)) throw Error('ABSOLUTE_PATHS_REQUIRED');
  const loaderPath =
    'tests/support/postwar-social-employment-creation-forward.ts';
  const loaderBytes = await regular(path.join(sourceRoot, loaderPath));
  const { preparePostwarSocialEmploymentCreationForward } = await import(
    pathToFileURL(path.join(sourceRoot, loaderPath)).href
  );
  const prepared =
    await preparePostwarSocialEmploymentCreationForward(sourceRoot);
  const manifestBytes = await regular(
    path.join(sourceRoot, SOCIAL_CREATION_FORWARD_MANIFEST_PATH),
  );
  const forward = JSON.parse(manifestBytes.toString('utf8'));
  const { pins, manifest } = candidate;
  const newSignatures = [
    'world_v2.prepare_postwar_social_employment_creation_licences(text)',
    'world_v2.postwar_social_employment_creation_effect_scoped(text,text,jsonb,jsonb,bigint)',
    'world_v2.postwar_social_created_pool(text,text,text,bigint)',
  ];
  if (
    !/^[a-f0-9]{40}$/u.test(pins.sourceCommit ?? '') ||
    pins.installationAllowed !== false ||
    manifest.production_publisher !== 'main-site-release-chain' ||
    forward.id !== 'postwar-social-employment-creation-dc5-v1' ||
    forward.schemaVersion !== 'postwar-function-forward-manifest-v1' ||
    forward.classification !==
      'UNAPPROVED_FIXED_INCREMENT_NOT_FRESH_PROPOSAL_REPLAY' ||
    forward.installationAllowed !== false ||
    forward.productionApproval !== 'NOT_GRANTED' ||
    sha(manifestBytes) !== prepared.manifestSha256 ||
    forward.upgrade.sha256 !== prepared.sha256 ||
    forward.upgrade.existingFunctionCount !== 13 ||
    forward.upgrade.newFunctionCount !== 3 ||
    forward.upgrade.newRelationCount !== 1 ||
    prepared.functions.length !== 13 ||
    JSON.stringify(forward.newSupplementFunctions.map((f) => f.signature)) !==
      JSON.stringify(newSignatures) ||
    [
      ...forward.sourcePins.map((p) => ({ path: p.path, sha256: p.newSha256 })),
      forward.newSupplement,
    ].some(
      (p) =>
        !pins.proposals.some(
          (actual) => actual.path === p.path && actual.sha256 === p.sha256,
        ),
    )
  )
    throw Error('EXACT_SOCIAL_CREATION_FORWARD_AND_CANDIDATE_PINS_REQUIRED');
  const bytes = Buffer.from(prepared.sql, 'utf8');
  const transaction = classifyDeltaTransaction(bytes);
  if (
    transaction.wrapped ||
    bytes.length !== forward.upgrade.bytes ||
    sha(bytes) !== prepared.sha256
  )
    throw Error('SOCIAL_CREATION_EXACT_TRANSACTION_REQUIRED');
  const entry = {
    id: 'postwar-social-employment-creation',
    disposition: forward.classification,
    sourcePath: prepared.forwardPath,
    sourceSha256: prepared.sha256,
    sourceBytes: bytes.length,
    packagedSourcePath: 'source/01-postwar-social-employment-creation.sql',
    transactionPath: 'transactions/01-postwar-social-employment-creation.sql',
    transactionSha256: sha(transaction.bytes),
    transactionBytes: transaction.bytes.length,
    transactionEnvelope: transaction.sourceEnvelope,
    nonTransactionalParts: [],
    executionAllowed: false,
    preconditions: {
      functions: forward.functions,
      newSupplement: forward.newSupplement,
      newFunctions: forward.newSupplementFunctions,
      newRelation: 'postwar_social_employment_creation_licence',
      metadataPolicy:
        'EXACT_PREDECESSOR_OR_SUCCESSOR_AND_COMPLETE_SUPPLEMENT_STRUCTURE',
      operator: forward.operatorPreconditions,
      observed: false,
    },
    recovery: {
      uncertainCommit: prepared.uncertainCommit,
      automaticRollback: false,
      destructiveRollback: false,
    },
  };
  return {
    chunks: [{ entry, source: bytes, transaction: transaction.bytes }],
    forwardSource: {
      path: SOCIAL_CREATION_FORWARD_MANIFEST_PATH,
      bytes: manifestBytes,
    },
    forwardLoader: { path: loaderPath, sha256: sha(loaderBytes) },
    manifest: {
      schemaVersion: 'postwar-schema-forward-review-package-v1',
      classification: 'UNAPPROVED_EXPLICIT_SOCIAL_INCREMENT_NOT_INSTALLATION',
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
      explicitForwardManifest: {
        path: SOCIAL_CREATION_FORWARD_MANIFEST_PATH,
        sha256: prepared.manifestSha256,
        predecessorCommit: prepared.predecessorWorldCommit,
        targetSourceCommit: prepared.targetSourceCommit,
      },
      fixedReadOnlyLoader: { path: loaderPath, sha256: sha(loaderBytes) },
      packagedProposalCount: 0,
      packagedForwardCount: 1,
      replacedExistingFunctionCount: 13,
      addedFunctionCount: 3,
      addedRelationCount: 1,
      steps: [entry],
      installationPath:
        'EXACT_DC5_SCHEMA_INCREMENT_WITH_LICENCE_SUPPLEMENT_ONLY',
      mutuallyExclusiveWith: 'FRESH_SCHEMA_DELTA_FROM_SAME_CANDIDATE',
      freshProposalSqlIncluded: false,
      installationAllowed: false,
      productionApproval: 'NOT_GRANTED',
      migrationRegistrationPerformed: false,
      databaseOperations: 0,
      networkRequests: 0,
      credentialsCreated: 0,
      isolatedClockSqlIncluded: false,
      acrossFilesAtomic: false,
      targetSchemaObserved: false,
      historicalUpgradeManifestsModified: false,
      sourceInitializer: prepared.sourceInitializer,
      operatorPrecondition: prepared.operatorPrecondition,
      targetApplicability:
        'EXACT_SEALED_PREDECESSOR_CATALOG_OR_EXACT_SUCCESSOR_ONLY_NO_HOT_UPGRADE',
      independentChangesNotCovered: forward.notCovered,
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
  forwardManifestPath,
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
  let plan;
  if (forwardManifestPath === SOCIAL_CREATION_FORWARD_MANIFEST_PATH) {
    plan = await createUnapprovedSocialCreationForwardPlan(
      candidate,
      sourceRoot,
    );
    for (const chunk of plan.chunks)
      sources.set(chunk.entry.sourcePath, chunk.source);
  } else if (forwardManifestPath !== undefined) {
    if (forwardManifestPath !== LOGISTICS_FORWARD_MANIFEST_PATH)
      throw Error('ONLY_EXPLICIT_LOGISTICS_OR_SOCIAL_FORWARD_MANIFEST_ALLOWED');
    const forwardBytes = await regular(
      path.join(sourceRoot, forwardManifestPath),
    );
    const forward = JSON.parse(forwardBytes.toString('utf8'));
    const upgradePath = forward.upgrade?.path;
    if (
      upgradePath !==
      'database/upgrades/postwar-industry-logistics-multicountry-scope-upgrade.sql'
    )
      throw Error('EXPLICIT_PINNED_LOGISTICS_FORWARD_REQUIRED');
    sources.set(upgradePath, await regular(path.join(sourceRoot, upgradePath)));
    plan = createUnapprovedSchemaForwardPlan(
      candidate,
      forward,
      sources,
      sha(forwardBytes),
    );
    plan.forwardSource = { path: forwardManifestPath, bytes: forwardBytes };
  } else plan = createUnapprovedSchemaDeltaPlan(candidate, sources);
  await mkdir(outputDirectory); // Exclusive; never overwrite an earlier package.
  await mkdir(path.join(outputDirectory, 'source'));
  await mkdir(path.join(outputDirectory, 'transactions'));
  if (plan.forwardSource)
    await writeFile(
      path.join(outputDirectory, 'forward-manifest.json'),
      plan.forwardSource.bytes,
      { flag: 'wx' },
    );
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
  if (
    plan.forwardSource &&
    sha(await regular(path.join(sourceRoot, plan.forwardSource.path))) !==
      sha(plan.forwardSource.bytes)
  )
    throw Error('FORWARD_MANIFEST_CHANGED_DURING_PACKAGING');
  if (
    plan.forwardLoader &&
    sha(await regular(path.join(sourceRoot, plan.forwardLoader.path))) !==
      plan.forwardLoader.sha256
  )
    throw Error('FIXED_SOCIAL_FORWARD_LOADER_CHANGED');
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
    (plan.forwardLoader
      ? '# Explicit Social schema increment review\n\nThis fixed alternative adds one licence supplement table and three functions, and replaces thirteen exact existing bodies. It is mutually exclusive with fresh proposal installation and does not include other logistics/opening-repair receipts. Stop and drain all consumers and source-publication transactions first; no hot upgrade. Source licence initialization is a separate controlled publisher transaction after a confirmed schema receipt and is NOT performed by this package. Unknown COMMIT requires STOP and actual catalog/receipt inspection, not automatic retry.\n\n'
      : plan.forwardSource
        ? '# Explicit function-only forward\n\nThis mode packages only the selected later upgrade for an existing exact schema. It is mutually exclusive with the fresh schema-delta path from this same candidate; never execute fresh proposals followed by this forward as one chain. Inspect its exact predecessor/successor body hashes and preserved owner/ACL before applying. Do not install the fresh proposals or rerun/relabel the historical five-upgrade/two-fresh manifest. No database version is inferred.\n\n'
        : '') +
      `# Unapproved schema delta\n\nNo SQL has run. No production registration or approval is granted.\n\nReview the exact baseline release ledger and preflight/catalog.sql output first. Resolve every existing relation/role conflict; do not drop or silently reuse objects. Check existing function signatures, owners, search paths and definition hashes against each approved predecessor. Catalog names alone cannot establish compatible bodies. Optional offline group enrollment remains separately reviewed; online readers must never inherit raw-seed access.\n\nTransactions are per source file, not one atomic ${plan.chunks.length}-file operation. Source files with BEGIN/COMMIT retain their exact envelope; files without one receive an explicit single transaction in transactions/. Both hashes are recorded. No nontransactional part is accepted by the conservative classifier; this is not a complete SQL semantic proof.\n\nIf failure occurs before known COMMIT, only the current open transaction may be rolled back. Earlier committed chunks remain. If COMMIT acknowledgement is uncertain, stop with UNKNOWN_STOP_NO_RETRY and inspect catalogs plus the controlled release ledger; never rerun CREATE ROLE/TABLE blindly. After committed DDL or economic facts, prepare a new reviewed forward-fix. No destructive or automatic rollback script is supplied. The catalog query's ROLLBACK only ends its read-only inspection.\n\nThis package omits isolated-world-clock SQL and starts no World/Clock. Publish only through a separately approved exact delta in main-site-release-chain; the existing historic workflow is not automatically enabled for this package. Production acceptance remains 0/6.\n`,
    { flag: 'wx' },
  );
  if (
    plan.forwardSource &&
    (sha(await regular(path.join(sourceRoot, plan.forwardSource.path))) !==
      sha(plan.forwardSource.bytes) ||
      (
        await Promise.all(
          plan.chunks.map(
            async (c) =>
              sha(await regular(path.join(sourceRoot, c.entry.sourcePath))) !==
              c.entry.sourceSha256,
          ),
        )
      ).some(Boolean))
  )
    throw Error('FORWARD_SOURCE_CHANGED_DURING_PACKAGING');
  if (
    plan.forwardLoader &&
    sha(await regular(path.join(sourceRoot, plan.forwardLoader.path))) !==
      plan.forwardLoader.sha256
  )
    throw Error('FIXED_SOCIAL_FORWARD_LOADER_CHANGED');
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
    status: plan.forwardSource
      ? 'UNAPPROVED_SCHEMA_FORWARD_PACKAGED_NOT_EXECUTED'
      : 'UNAPPROVED_SCHEMA_DELTA_PACKAGED_NOT_EXECUTED',
    sourceCommit: candidateSha,
    packagedProposals: plan.manifest.packagedProposalCount,
    ...(plan.forwardSource ? { packagedForwards: plan.chunks.length } : {}),
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
  if (
    ![8, 10].includes(args.length) ||
    !flags.every((f, i) => args[i * 2] === f) ||
    (args.length === 10 &&
      (args[8] !== '--forward-manifest' ||
        ![
          LOGISTICS_FORWARD_MANIFEST_PATH,
          SOCIAL_CREATION_FORWARD_MANIFEST_PATH,
        ].includes(args[9])))
  )
    throw Error('ONLY_SOURCE_SHA_COMPANION_FRESH_OUTPUT_ARGUMENTS_ALLOWED');
  const result = await preparePostwarSchemaDelta({
    sourceRoot: args[1],
    candidateSha: args[3],
    companionRoot: args[5],
    outputDirectory: args[7],
    ...(args.length === 10 ? { forwardManifestPath: args[9] } : {}),
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}
