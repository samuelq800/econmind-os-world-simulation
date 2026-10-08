// SOURCE_ONLY / NOT_REGISTERED / CALLER_NOT_READY. No transport or credentials.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const PRODUCTION_POSTING_RELEASE = Object.freeze({
  namespace: 'world_v2',
  publisher: 'main-site-release-chain',
  sourceCommit: '7461a053a74131fcc8273a8ac981e28b510ca03c',
  migrationTree: '97cd00dea1a9e9ff600278fb2c41fa67a037c667',
  manifestHash:
    'af21a4f0c9a84d6c5f47eec6ed0337b386484633b414efa14c908e70e41118da',
  migrationId: '0023_world_v2_production_consumption_posting',
  artifactSource: '4714c1da7af9324741996b94c6da036bf54c39a4',
  artifactHash:
    '0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36',
  artifactPath:
    'database/migrations/artifacts/0023_world_v2_production_consumption_posting.sql',
  releaseOrder: 23,
  callerRegistration: 'NOT_REGISTERED',
  callerReadiness: 'CALLER_NOT_READY',
});
const REMOTE = 'https://github.com/samuelq800/econmind-os-world-simulation';
const hash = (/** @type {string | Buffer} */ bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const literal = (/** @type {string} */ value) =>
  `'${value.replaceAll("'", "''")}'`;
/** @typedef {{migration_id:string, artifact_sha256:string, source_repo_commit:string, release_order:number}} ReleaseRow */
/** @typedef {{migration_id:string, sha256:string, artifact_source_commit:string, release_order:number, path:string}} Migration */
/** @typedef {{before:ReleaseRow[], after:ReleaseRow[], sql:string}} VerifiedSource */
/** @typedef {'publish' | 'readback'} Phase */
/** @typedef {{phase:Phase, request:Readonly<{query:string}>, policyFingerprint:string, callerRegistration:string, callerReadiness:string}} ReleasePlan */
/** @type {WeakMap<ReleasePlan, VerifiedSource>} */
const plans = new WeakMap();
/** @returns {never} */
function fail(/** @type {string} */ code) {
  throw new Error(code);
}
async function git(/** @type {string} */ root, /** @type {string[]} */ args) {
  try {
    // No replacement objects, shell, caller env, git network or external module.
    const { stdout } = await execFileAsync(
      'git',
      ['--no-replace-objects', ...args],
      {
        cwd: root,
        env: {
          PATH: '/usr/bin:/bin',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        },
        encoding: 'buffer',
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return Buffer.from(stdout);
  } catch {
    fail('POSTING_RELEASE_GIT_SOURCE_INVALID');
  }
}
async function requiredGit(
  /** @type {string} */ root,
  /** @type {string[]} */ args,
) {
  const bytes = await git(root, args);
  if (!bytes) fail('POSTING_RELEASE_GIT_SOURCE_INVALID');
  return /** @type {Buffer} */ (bytes);
}
function ledger(/** @type {Migration[]} */ entries) {
  return entries.map((m) => ({
    migration_id: m.migration_id,
    artifact_sha256: m.sha256,
    source_repo_commit: m.artifact_source_commit,
    release_order: m.release_order,
  }));
}
async function verifiedSource(/** @type {string} */ root) {
  const fixed = PRODUCTION_POSTING_RELEASE;
  // Git emits one record newline. Accept two exact HTTPS spellings, never URL
  // normalization that could admit ports, userinfo, encoded paths or suffixes.
  const remote = (await requiredGit(root, ['remote', 'get-url', 'origin']))
    .toString()
    .replace(/\n$/u, '');
  if (remote !== REMOTE && remote !== `${REMOTE}.git`)
    fail('POSTING_RELEASE_REMOTE_INVALID');
  if (
    (
      await requiredGit(root, [
        'rev-parse',
        `${fixed.sourceCommit}:database/migrations`,
      ])
    )
      .toString()
      .trim() !== fixed.migrationTree
  )
    fail('POSTING_RELEASE_TREE_INVALID');
  // Working tree/HEAD are intentionally not sources. Read the exact Git object.
  const manifest = JSON.parse(
    (
      await requiredGit(root, [
        'show',
        `${fixed.sourceCommit}:database/migrations/manifest.json`,
      ])
    ).toString('utf8'),
  );
  if (
    hash(JSON.stringify(manifest)) !== fixed.manifestHash ||
    manifest.namespace !== fixed.namespace ||
    manifest.production_publisher !== fixed.publisher ||
    manifest.world_repository_production_mutation !== false ||
    manifest.migrations?.length !== 23
  )
    fail('POSTING_RELEASE_MANIFEST_INVALID');
  /** @type {Migration[]} */
  const migrations = manifest.migrations;
  let sql = '';
  for (const entry of migrations) {
    const bytes = await requiredGit(root, [
      'show',
      `${fixed.sourceCommit}:${entry.path}`,
    ]);
    const sourceBytes = await requiredGit(root, [
      'show',
      `${entry.artifact_source_commit}:${entry.path}`,
    ]);
    if (hash(bytes) !== entry.sha256 || hash(sourceBytes) !== entry.sha256)
      fail('POSTING_RELEASE_PROVENANCE_INVALID');
    if (entry.release_order === 23) {
      if (
        entry.migration_id !== fixed.migrationId ||
        entry.path !== fixed.artifactPath ||
        entry.artifact_source_commit !== fixed.artifactSource ||
        entry.sha256 !== fixed.artifactHash
      )
        fail('POSTING_RELEASE_ARTIFACT_INVALID');
      sql = bytes.toString('utf8');
    }
  }
  if (!sql) fail('POSTING_RELEASE_ARTIFACT_INVALID');
  return {
    before: ledger(migrations.slice(0, 22)),
    after: ledger(migrations),
    sql,
  };
}
export async function productionPostingPolicyFingerprint() {
  return hash(
    Buffer.concat([
      Buffer.from(JSON.stringify(PRODUCTION_POSTING_RELEASE)),
      Buffer.from('\0'),
      await readFile(new URL(import.meta.url)),
    ]),
  );
}
const ledgerSql = `coalesce((select jsonb_agg(jsonb_build_object(
  'migration_id', migration_id, 'artifact_sha256', artifact_sha256,
  'source_repo_commit', source_repo_commit, 'release_order', release_order)
  order by release_order) from world_v2.schema_release), '[]'::jsonb)`;
function assertLedgerSql(
  /** @type {ReleaseRow[]} */ expected,
  /** @type {string} */ label,
) {
  return `do $posting_release_${label}$
begin
  if ${ledgerSql} is distinct from ${literal(JSON.stringify(expected))}::jsonb then
    raise exception 'POSTING_RELEASE_${label.toUpperCase()}_LEDGER_CONFLICT';
  end if;
end;
$posting_release_${label}$;`;
}
function readbackSql(
  /** @type {Phase} */ phase,
  /** @type {string} */ fingerprint,
) {
  return `select jsonb_build_object(
  'namespace', to_regnamespace('world_v2')::text,
  'phase', ${literal(phase)}, 'policy_fingerprint', ${literal(fingerprint)},
  'source_commit', ${literal(PRODUCTION_POSTING_RELEASE.sourceCommit)},
  'ledger_entries', ${ledgerSql}
) as production_posting_release_evidence;`;
}
/**
 * Render-only source policy for the existing main-site single-request publisher.
 * A phase lock is an interface guard, NOT proof of approval or registration.
 * No arbitrary SQL, source SHA, database target, callback or transport accepted.
 * @param {{repositoryRoot:string, migrationId:string, namespace:string, phase:Phase, lock:string, confirmation:string}} options
 * @returns {Promise<ReleasePlan>}
 */
export async function prepareProductionPostingRelease(options) {
  if (
    !options ||
    Object.keys(options).sort().join(',') !==
      'confirmation,lock,migrationId,namespace,phase,repositoryRoot'
  )
    fail('POSTING_RELEASE_OPTIONS_INVALID');
  if (
    options.migrationId !== PRODUCTION_POSTING_RELEASE.migrationId ||
    options.namespace !== 'world_v2'
  )
    fail('POSTING_RELEASE_SELECTOR_DENIED');
  if (options.phase !== 'publish' && options.phase !== 'readback')
    fail('POSTING_RELEASE_PHASE_INVALID');
  const fingerprint = await productionPostingPolicyFingerprint();
  const prefix = options.phase === 'publish' ? 'PUBLISH_GO' : 'READBACK_GO';
  const confirmation =
    options.phase === 'publish'
      ? 'RELEASE_WORLD_V2_PRODUCTION_POSTING_ONCE'
      : 'READBACK_WORLD_V2_PRODUCTION_POSTING_ONLY';
  if (
    options.lock !== `${prefix}:${fingerprint}` ||
    options.confirmation !== confirmation
  )
    fail('POSTING_RELEASE_PHASE_HOLD');
  const source = await verifiedSource(options.repositoryRoot);
  const fixed = PRODUCTION_POSTING_RELEASE;
  const query =
    options.phase === 'readback'
      ? `begin read only;\nset local statement_timeout = '60s';\n${readbackSql(options.phase, fingerprint)}\ncommit;`
      : `begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table world_v2.schema_release in exclusive mode;
${assertLedgerSql(source.before, 'before')}
${source.sql}
insert into world_v2.schema_release (migration_id, artifact_sha256, source_repo_commit, release_order)
values (${literal(fixed.migrationId)}, ${literal(fixed.artifactHash)}, ${literal(fixed.artifactSource)}, 23);
${assertLedgerSql(source.after, 'after')}
commit;
${readbackSql(options.phase, fingerprint)}`;
  const plan = Object.freeze({
    phase: options.phase,
    request: Object.freeze({ query }),
    policyFingerprint: fingerprint,
    callerRegistration: fixed.callerRegistration,
    callerReadiness: fixed.callerReadiness,
  });
  plans.set(plan, source);
  return plan;
}
function requirePlan(/** @type {ReleasePlan} */ plan) {
  const source = plans.get(plan);
  if (!source) fail('POSTING_RELEASE_PLAN_NOT_REGISTERED');
  return /** @type {VerifiedSource} */ (source);
}
function sameLedger(
  /** @type {unknown} */ actual,
  /** @type {ReleaseRow[]} */ expected,
) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((row, i) => {
      const target = expected[i];
      return (
        target &&
        row &&
        Object.keys(row).sort().join(',') ===
          'artifact_sha256,migration_id,release_order,source_repo_commit' &&
        row.migration_id === target.migration_id &&
        row.artifact_sha256 === target.artifact_sha256 &&
        row.source_repo_commit === target.source_repo_commit &&
        row.release_order === target.release_order
      );
    })
  );
}
/** Verify actual database response, never emit manifest literals as observed rows.
 * APPLIED_METADATA_MATCH is not schema/World admission or activation proof.
 * @param {ReleasePlan} plan @param {unknown} response
 */
export function verifyProductionPostingReadback(plan, response) {
  const source = requirePlan(plan);
  // The existing Management API shape is exactly a one-row JSON array.
  if (
    !Array.isArray(response) ||
    response.length !== 1 ||
    !response[0] ||
    Object.keys(response[0]).join(',') !== 'production_posting_release_evidence'
  )
    fail('POSTING_RELEASE_RESPONSE_INVALID');
  const observed = response[0].production_posting_release_evidence;
  if (
    !observed ||
    Object.keys(observed).sort().join(',') !==
      'ledger_entries,namespace,phase,policy_fingerprint,source_commit' ||
    observed.namespace !== 'world_v2' ||
    observed.phase !== plan.phase ||
    observed.policy_fingerprint !== plan.policyFingerprint ||
    observed.source_commit !== PRODUCTION_POSTING_RELEASE.sourceCommit
  )
    fail('POSTING_RELEASE_RESPONSE_INVALID');
  if (
    !Array.isArray(observed.ledger_entries) ||
    observed.ledger_entries.some(
      (/** @type {ReleaseRow} */ row) =>
        !row ||
        Object.keys(row).sort().join(',') !==
          'artifact_sha256,migration_id,release_order,source_repo_commit' ||
        typeof row.migration_id !== 'string' ||
        !/^\d{4}_[a-z][a-z0-9_]*$/u.test(row.migration_id) ||
        typeof row.artifact_sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(row.artifact_sha256) ||
        typeof row.source_repo_commit !== 'string' ||
        !/^[0-9a-f]{40}$/u.test(row.source_repo_commit) ||
        !Number.isSafeInteger(row.release_order) ||
        row.release_order < 1,
    )
  )
    fail('POSTING_RELEASE_RESPONSE_INVALID');
  const status = sameLedger(observed.ledger_entries, source.after)
    ? 'APPLIED_METADATA_MATCH'
    : sameLedger(observed.ledger_entries, source.before)
      ? 'BASELINE_METADATA_MATCH'
      : 'CONFLICT';
  if (plan.phase === 'publish' && status !== 'APPLIED_METADATA_MATCH')
    fail('POSTING_RELEASE_PUBLICATION_NOT_PROVEN');
  return Object.freeze({
    status,
    phase: plan.phase,
    observedLedger: Object.freeze(
      observed.ledger_entries.map((/** @type {ReleaseRow} */ row) =>
        Object.freeze({ ...row }),
      ),
    ),
    callerRegistration: 'NOT_REGISTERED',
    callerReadiness: 'CALLER_NOT_READY',
    economicActivation: false,
    schemaAdmitted: false,
    retryAllowed: false,
  });
}
/** Any transport/acknowledgement/proof failure stops. Never auto-replay DDL. */
export function productionPostingUnknownOutcome(
  /** @type {ReleasePlan} */ plan,
) {
  requirePlan(plan);
  return Object.freeze({
    status: 'UNKNOWN_STOP_NO_RETRY',
    phase: plan.phase,
    migrationId: PRODUCTION_POSTING_RELEASE.migrationId,
    policyFingerprint: plan.policyFingerprint,
    retryAllowed: false,
    callerRegistration: 'NOT_REGISTERED',
    callerReadiness: 'CALLER_NOT_READY',
    economicActivation: false,
    schemaAdmitted: false,
  });
}
