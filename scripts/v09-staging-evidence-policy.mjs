import { createHash } from 'node:crypto';
import path from 'node:path';

import { Client } from 'pg';

export const V09_STAGING_APPROVAL_RELATIVE_PATH =
  'config/v09-staging-target.json';
export const V09_STAGING_TARGET_SCHEMA_VERSION =
  'V09_DEDICATED_STAGING_TARGET-2';
export const V09_STAGING_NAMESPACE = 'world_v2';
export const V09_STAGING_OWNER_CONFIRMATION =
  'OWNER_APPROVED_DEDICATED_NONPRODUCTION_V09';
export const V09_STAGING_EXECUTION_CONFIRMATION =
  'EXECUTE_OWNER_APPROVED_V09_STAGING';
export const V09_STAGING_MIGRATION_IDS = Object.freeze([
  '0001_world_v2_namespace',
  '0002_world_v2_command_event_ledger',
  '0003_world_v2_command_receipts_outbox',
  '0004_world_v2_receipt_event_set_integrity',
  '0005_world_v2_writer_lease_fencing',
  '0006_world_v2_writer_lease_lineage_guard',
]);

const PROJECT_REF = /^[a-z0-9]{20}$/u;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/u;
const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/u;
const ADMIN_ROLE = /^[a-z_][a-z0-9_.-]{0,62}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const EXPECTED_ROLE_NAMES = Object.freeze({
  migration_owner: 'v09_staging_migration_owner',
  reader: 'v09_staging_reader',
  worker: 'v09_staging_worker',
});
const FORBIDDEN_RUNTIME_VARIABLES = Object.freeze([
  'DATABASE_URL',
  'WORLD_DATABASE_URL',
  'V09_TEST_DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
]);
const FORBIDDEN_PG_CONNECTION_VARIABLES = Object.freeze([
  'PGDATABASE',
  'PGHOST',
  'PGHOSTADDR',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLCRL',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLNEGOTIATION',
  'PGSSLROOTCERT',
  'PGSSLSNI',
  'PGUSER',
]);
const REQUIRED_ADMIN_CONNECTION_QUERY = '?ssl=true';
const EVIDENCE_OUTPUT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u;

function invalid(message) {
  throw new Error(
    `Unsafe V09 dedicated staging evidence configuration: ${message}`,
  );
}

export function normalizeApprovedHost(host) {
  if (typeof host !== 'string' || host.length === 0 || host.trim() !== host) {
    invalid('database_host must be a non-empty unambiguous hostname');
  }
  if (
    host !== host.toLowerCase() ||
    host.endsWith('.') ||
    host.includes('/') ||
    host.includes(':') ||
    host.includes('@') ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
      host,
    )
  ) {
    invalid('database_host must be a canonical lower-case DNS hostname');
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^\d+(?:\.\d+){3}$/u.test(host)
  ) {
    invalid('database_host must not be a loopback or literal-IP host');
  }
  return host;
}

function normalizedPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    invalid('database_port must be an integer from 1 through 65535');
  }
  return port;
}

function normalizeEvidenceOutputPath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    invalid('evidence_output_path must be a non-empty absolute local path');
  }
  if (!path.isAbsolute(value) || value.includes('\0')) {
    invalid('evidence_output_path must be an absolute local path');
  }
  const normalized = path.resolve(value);
  if (
    normalized !== value ||
    !EVIDENCE_OUTPUT_FILE.test(path.basename(value))
  ) {
    invalid(
      'evidence_output_path must be normalized and name an owner-approved .json file',
    );
  }
  return normalized;
}

function stableFingerprintInput(approval) {
  return [
    approval.schema_version,
    approval.project_ref,
    approval.target_classification,
    String(approval.production_target),
    String(approval.shared_target),
    approval.database_host,
    String(approval.database_port),
    approval.database_name,
    approval.admin_database_role,
    approval.disposable_namespace,
    approval.roles.migration_owner,
    approval.roles.worker,
    approval.roles.reader,
    approval.owner_confirmation,
    approval.evidence_output_path,
  ].join('\n');
}

export function createV09StagingTargetFingerprint(approval) {
  return createHash('sha256')
    .update(stableFingerprintInput(approval), 'utf8')
    .digest('hex');
}

function assertExactRoles(roles) {
  if (roles === null || typeof roles !== 'object' || Array.isArray(roles)) {
    invalid(
      'roles must name the dedicated migration_owner, worker and reader roles',
    );
  }
  if (
    Object.keys(roles).length !== Object.keys(EXPECTED_ROLE_NAMES).length ||
    Object.keys(roles).some((key) => !(key in EXPECTED_ROLE_NAMES))
  ) {
    invalid('roles must contain only migration_owner, worker and reader');
  }
  for (const [key, expected] of Object.entries(EXPECTED_ROLE_NAMES)) {
    if (roles[key] !== expected || !ROLE_NAME.test(roles[key])) {
      invalid(`roles.${key} must be the exact dedicated role ${expected}`);
    }
  }
  if (new Set(Object.values(roles)).size !== 3) {
    invalid('dedicated staging roles must be distinct');
  }
}

/**
 * Parses only a non-secret, version-controlled owner approval contract. The
 * exact project and host are intentionally not accepted from the environment.
 */
export function parseV09StagingApproval(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('owner approval contract must be an object');
  }
  const approval = value;
  if (approval.schema_version !== V09_STAGING_TARGET_SCHEMA_VERSION) {
    invalid('owner approval contract has an unsupported schema_version');
  }
  if (approval.target_classification !== 'DEDICATED_NONPRODUCTION') {
    invalid('target_classification must be DEDICATED_NONPRODUCTION');
  }
  if (
    approval.production_target !== false ||
    approval.shared_target !== false
  ) {
    invalid(
      'owner approval must explicitly reject production and shared targets',
    );
  }
  if (approval.owner_confirmation !== V09_STAGING_OWNER_CONFIRMATION) {
    invalid(
      'owner_confirmation is missing or does not approve dedicated non-production staging',
    );
  }
  if (!PROJECT_REF.test(approval.project_ref ?? '')) {
    invalid(
      'project_ref must be the exact 20-character Supabase project reference',
    );
  }
  const databaseHost = normalizeApprovedHost(approval.database_host);
  const databasePort = normalizedPort(approval.database_port);
  if (!DATABASE_NAME.test(approval.database_name ?? '')) {
    invalid('database_name is invalid');
  }
  if (!ADMIN_ROLE.test(approval.admin_database_role ?? '')) {
    invalid('admin_database_role is invalid');
  }
  const evidenceOutputPath = normalizeEvidenceOutputPath(
    approval.evidence_output_path,
  );
  if (approval.disposable_namespace !== V09_STAGING_NAMESPACE) {
    invalid(
      `disposable_namespace must be the exact migration namespace ${V09_STAGING_NAMESPACE}`,
    );
  }
  assertExactRoles(approval.roles);
  if (!SHA256.test(approval.target_fingerprint ?? '')) {
    invalid('target_fingerprint must be a SHA-256 value');
  }

  const canonical = Object.freeze({
    admin_database_role: approval.admin_database_role,
    database_host: databaseHost,
    database_name: approval.database_name,
    database_port: databasePort,
    disposable_namespace: approval.disposable_namespace,
    evidence_output_path: evidenceOutputPath,
    owner_confirmation: approval.owner_confirmation,
    production_target: approval.production_target,
    project_ref: approval.project_ref,
    roles: Object.freeze({ ...approval.roles }),
    schema_version: approval.schema_version,
    shared_target: approval.shared_target,
    target_classification: approval.target_classification,
    target_fingerprint: approval.target_fingerprint,
  });
  if (
    canonical.target_fingerprint !==
    createV09StagingTargetFingerprint(canonical)
  ) {
    invalid(
      'target_fingerprint does not bind the exact approved project, host, roles and namespace',
    );
  }
  return canonical;
}

export function buildV09StagingDryRunPlan(approval) {
  const target = parseV09StagingApproval(approval);
  return Object.freeze({
    approvalFile: V09_STAGING_APPROVAL_RELATIVE_PATH,
    cleanup: Object.freeze({
      exactNamespace: target.disposable_namespace,
      exactRoles: Object.freeze([
        target.roles.migration_owner,
        target.roles.worker,
        target.roles.reader,
      ]),
      requiresRunMarker: true,
      broadResetAllowed: false,
      databaseDropAllowed: false,
    }),
    credentialSource: 'V09_STAGING_ADMIN_DATABASE_URL_ONLY',
    durableEvidence: Object.freeze({
      ownerApprovedOutputPath: target.evidence_output_path,
      overwriteAllowed: false,
    }),
    execution: 'DRY_RUN_ONLY_UNTIL_EXPLICIT_CONFIRMATION',
    migrations: V09_STAGING_MIGRATION_IDS,
    roleChecks: Object.freeze([
      'SCHEMA_OWNERSHIP',
      'WORKER_LEAST_PRIVILEGE',
      'READER_READ_ONLY',
      'RLS_ENABLED_AND_FORCED',
      'PUBLIC_PRIVILEGES_REVOKED',
    ]),
    target: Object.freeze({
      database_host: target.database_host,
      database_port: target.database_port,
      project_ref: target.project_ref,
      target_fingerprint: target.target_fingerprint,
    }),
    tests: Object.freeze([
      'TWO_WRITER_CONCURRENCY',
      'DELETE_REJECTED',
      'TRUNCATE_REJECTED',
      'STALE_FENCE_REJECTED',
      'CRASH_BEFORE_COMMIT_ROLLS_BACK',
      'CRASH_AFTER_COMMIT_RETAINS_FENCE',
    ]),
  });
}

function hasPublishableOrAnonMaterial(value) {
  return (
    typeof value === 'string' &&
    (/^sb_(?:publishable|anon)_/iu.test(value) ||
      /(?:^|[?&])(?:anon|publishable)[_=]/iu.test(value))
  );
}

function parseCanonicalAdminUri(connectionString) {
  let connection;
  try {
    connection = new URL(connectionString);
  } catch {
    invalid('V09_STAGING_ADMIN_DATABASE_URL is not a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(connection.protocol)) {
    invalid('V09_STAGING_ADMIN_DATABASE_URL must use PostgreSQL');
  }
  if (
    connection.hash !== '' ||
    connection.search !== REQUIRED_ADMIN_CONNECTION_QUERY
  ) {
    invalid(
      'admin PostgreSQL URL must have exactly one canonical TLS query ?ssl=true and no fragment or override parameters',
    );
  }
  return connection;
}

function effectiveTlsEnabled(ssl) {
  return (
    ssl === true ||
    (ssl !== null &&
      typeof ssl === 'object' &&
      ssl.rejectUnauthorized !== false)
  );
}

/**
 * Uses pg's actual ConnectionParameters construction without calling connect,
 * so policy checks cover the exact parser/runtime semantics a later runner
 * would use rather than only WHATWG URL authority fields.
 */
export function inspectV09StagingPgRuntime(connectionString) {
  let parameters;
  try {
    parameters = new Client({ connectionString }).connectionParameters;
  } catch (error) {
    invalid(
      `pg runtime could not parse the admin PostgreSQL URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return Object.freeze({
    database: parameters.database,
    host: parameters.host,
    port: parameters.port,
    ssl: parameters.ssl,
    user: parameters.user,
  });
}

function parseAdminConnection(environment, approval) {
  const connectionString = environment.V09_STAGING_ADMIN_DATABASE_URL;
  if (!connectionString) {
    invalid('V09_STAGING_ADMIN_DATABASE_URL is required for execution');
  }
  if (hasPublishableOrAnonMaterial(connectionString)) {
    invalid(
      'publishable or anon material is not an admin PostgreSQL connection',
    );
  }

  const connection = parseCanonicalAdminUri(connectionString);
  if (normalizeApprovedHost(connection.hostname) !== approval.database_host) {
    invalid('admin PostgreSQL URL host does not match the owner-approved host');
  }
  if (connection.port !== String(approval.database_port)) {
    invalid('admin PostgreSQL URL port does not match the owner-approved port');
  }
  if (connection.username !== approval.admin_database_role) {
    invalid('admin PostgreSQL URL role does not match the owner-approved role');
  }
  if (connection.pathname !== `/${approval.database_name}`) {
    invalid(
      'admin PostgreSQL URL database does not match the owner-approved database',
    );
  }
  if (!connection.password) {
    invalid(
      'admin PostgreSQL URL must be securely provisioned with a password',
    );
  }
  const runtime = inspectV09StagingPgRuntime(connectionString);
  if (normalizeApprovedHost(runtime.host) !== approval.database_host) {
    invalid('pg runtime host does not match the owner-approved host');
  }
  if (runtime.port !== approval.database_port) {
    invalid('pg runtime port does not match the owner-approved port');
  }
  if (runtime.user !== approval.admin_database_role) {
    invalid('pg runtime user does not match the owner-approved role');
  }
  if (runtime.database !== approval.database_name) {
    invalid('pg runtime database does not match the owner-approved database');
  }
  if (!effectiveTlsEnabled(runtime.ssl)) {
    invalid(
      'pg runtime does not resolve the admin PostgreSQL URL to effective TLS',
    );
  }
  return connectionString;
}

/**
 * Verifies an explicit one-shot execution request without emitting or storing
 * credential values. It intentionally rejects runtime configuration and all
 * client/publishable Supabase credentials.
 */
export function assertV09DedicatedStagingExecution(environment, approval) {
  const target = parseV09StagingApproval(approval);
  if (environment.ECONMIND_ENV !== 'staging') {
    invalid('ECONMIND_ENV must be staging for dedicated staging evidence');
  }
  if (
    environment.V09_STAGING_EXECUTION_CONFIRMATION !==
    V09_STAGING_EXECUTION_CONFIRMATION
  ) {
    invalid('explicit V09_STAGING_EXECUTION_CONFIRMATION is required');
  }
  if (
    environment.V09_STAGING_TARGET_FINGERPRINT !== target.target_fingerprint
  ) {
    invalid(
      'V09_STAGING_TARGET_FINGERPRINT does not match the owner-approved target',
    );
  }
  for (const name of FORBIDDEN_RUNTIME_VARIABLES) {
    if (environment[name] !== undefined && environment[name] !== '') {
      invalid(
        `${name} must be absent from dedicated staging evidence execution`,
      );
    }
  }
  for (const name of FORBIDDEN_PG_CONNECTION_VARIABLES) {
    if (environment[name] !== undefined && environment[name] !== '') {
      invalid(
        `${name} must be absent from dedicated staging evidence execution`,
      );
    }
  }
  for (const [name, value] of Object.entries(environment)) {
    if (/V09_STAGING_(?:ANON|PUBLISHABLE)_KEY/iu.test(name) && value) {
      invalid(`${name} is a client credential and is forbidden`);
    }
    if (hasPublishableOrAnonMaterial(value)) {
      invalid(
        `${name} contains publishable or anon material instead of an admin connection`,
      );
    }
  }
  return Object.freeze({
    approval: target,
    connectionString: parseAdminConnection(environment, target),
  });
}

export function assertNoLinkedSupabaseProject(linkedProjectRef) {
  if (linkedProjectRef !== undefined && linkedProjectRef.trim() !== '') {
    invalid(
      'a linked Supabase project is forbidden; dedicated staging must use only the approved direct admin connection',
    );
  }
}
