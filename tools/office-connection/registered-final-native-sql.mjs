/** Fixed candidate DDL loading plan for the coordinated disposable registered
 * host rehearsal. Importing/rendering never opens a DB, reads a seed, publishes
 * a source, creates a World, or starts a consumer/Clock. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const sha = (v) => createHash('sha256').update(v).digest('hex');
const issuedPlans = new WeakSet();
// Explicit allowlist. No directory discovery, Clock, arbitrary caller paths,
// source DTOs, numeric policies or authority/Ready callbacks.
export const REGISTERED_FINAL_NATIVE_SQL_ORDER = Object.freeze([
  'runtime-read-binding-storage',
  'runtime-admission-publication',
  'financial-posting-decimal-validation',
  'social-operating-custody',
  'postwar-social-startup-seed-header',
  'social-operating-match-publisher',
  'social-intake-authorization',
  'finance-budget-custody',
  'finance-budget-capacity-source',
  'postwar-day-one-fx-custody',
  'central-bank-omo-custody',
  'captain-operating-custody',
  'postwar-office-derived-read',
  'postwar-industry-production-source',
  'postwar-industry-operating-receipts',
  'postwar-industry-first-day-source',
  'postwar-industry-intake-binding',
  'postwar-industry-run-custody',
  'postwar-industry-run-history',
  'postwar-industry-work-custody',
  'postwar-industry-work-publication',
  'postwar-industry-wage-history',
  'postwar-industry-wage-publication',
  'postwar-industry-paid-work-read',
  'postwar-industry-opening-production-validation',
  'postwar-social-current-derived-read',
  'postwar-social-current-prefix-read',
  'postwar-financial-current-derived-read',
  'finance-budget-mixed-source',
  'postwar-finance-social-source-publication',
  'postwar-narrow-trade-source',
  'postwar-beneficial-housing-rent-custody',
  'postwar-beneficial-rent-social-publication',
  'postwar-day-one-fx-history-read',
  'postwar-bounded-journal-read',
  'postwar-bounded-prefix-read',
  'postwar-bounded-prefix-pages',
  'central-bank-omo-history-read',
  'postwar-captain-source-publication',
  'postwar-captain-mixed-read',
  'postwar-paged-office-history-originals',
  'postwar-captain-paged-scope',
  'central-bank-omo-paged-custody',
  'postwar-beneficial-rent-paged-custody',
  'postwar-social-mixed-match-publisher',
  'postwar-social-match-prefix-pages',
  'postwar-social-paged-match-publisher',
  'postwar-physical-opening-facts-read',
  'postwar-physical-inventory-provenance',
  'postwar-mixed-current-projection-read',
  'postwar-mixed-financial-current-publication',
  'postwar-captain-current-derived-read',
  'postwar-narrow-trade-current-source',
  'postwar-narrow-trade-automatic-source',
  'postwar-narrow-trade-history-read',
  'postwar-narrow-trade-paged-source',
  'postwar-mixed-goods-omo-current-effects',
  'postwar-mixed-beneficial-rent-current-effects',
  'postwar-paged-current-projection',
  'postwar-captain-h0-current',
  'postwar-mixed-industry-current-effects',
  'postwar-industry-labour-current-read',
  'postwar-industry-run-parameters-read',
  'postwar-office-recovery-read',
  'postwar-captain-intake-binding',
  'postwar-central-bank-intake-binding',
  'postwar-narrow-trade-intake-binding',
  'world-actor-identity-registry',
  'world-command-execution-registration',
  'postwar-source-revocation-fence',
  'postwar-industry-utility-custody',
  'postwar-industry-power-service-source',
  'postwar-industry-logistics-custody',
  'postwar-mixed-industry-utility-effects',
  'postwar-industry-power-service-current',
  'postwar-trade-current-projection',
]);
// The initializer needs only these source-custody proposals before publishing
// H0 originals. Their relative order always comes from the SAME full plan;
// notably FX originals precede Finance's mixed-source/table declarations.
const childSourceNames = new Set([
  'finance-budget-custody',
  'finance-budget-capacity-source',
  'finance-budget-mixed-source',
  'social-operating-custody',
  'postwar-social-startup-seed-header',
  'postwar-beneficial-housing-rent-custody',
  'postwar-beneficial-rent-social-publication',
  'captain-operating-custody',
  'postwar-captain-source-publication',
  'postwar-captain-mixed-read',
  'postwar-day-one-fx-custody',
  'postwar-finance-social-source-publication',
]);
export const REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER = Object.freeze(
  REGISTERED_FINAL_NATIVE_SQL_ORDER.filter((name) =>
    childSourceNames.has(name),
  ),
);
if (REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER.length !== childSourceNames.size)
  throw Error('CHILD_SOURCE_PROPOSAL_OUTSIDE_FIXED_FULL_PLAN');
export const REGISTERED_FINAL_NATIVE_SQL_EXCLUSIONS = Object.freeze([
  Object.freeze({
    name: 'isolated-world-clock',
    reason: 'CLOCK_NOT_AUTHORIZED_NOT_LOADED',
  }),
  Object.freeze({
    name: 'current-authorization-writer-preparation',
    reason:
      'DEFAULT_DENY_SOURCE_REGISTRATION_STUB_NOT_A_SELECTED_RUNTIME_DEPENDENCY',
  }),
  Object.freeze({
    name: 'postwar-runtime-source-read-policy',
    reason:
      'OFFLINE_RAW_SEED_GROUP_POLICY_NOT_AN_ONLINE_RUNTIME_DEPENDENCY_NO_ENROLLMENT',
  }),
]);
export async function prepareRegisteredFinalNativeSqlPlan({
  repositoryRoot,
  expectedCommit,
  completeOpeningInventory = false,
}) {
  if (typeof completeOpeningInventory !== 'boolean')
    throw Error('EXPLICIT_COMPLETE_OPENING_INVENTORY_SELECTION_REQUIRED');
  if (!/^[a-f0-9]{40}$/u.test(expectedCommit))
    throw Error('EXACT_FROZEN_CANDIDATE_REQUIRED');
  const root = path.resolve(repositoryRoot);
  const head = (
    await exec('git', ['rev-parse', 'HEAD'], { cwd: root })
  ).stdout.trim();
  if (head !== expectedCommit) throw Error('FROZEN_CANDIDATE_HEAD_DIFFERS');
  const changed = (
    await exec(
      'git',
      [
        'diff',
        'HEAD',
        '--',
        'apps',
        'packages',
        'database',
        'config',
        'tools',
        'tests',
      ],
      { cwd: root },
    )
  ).stdout;
  if (changed !== '') throw Error('FROZEN_PRODUCT_BYTES_REQUIRED');
  const untracked = (
    await exec(
      'git',
      [
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        'apps',
        'packages',
        'database',
        'config',
        'tools',
        'tests',
      ],
      { cwd: root },
    )
  ).stdout;
  if (untracked !== '')
    throw Error('UNTRACKED_PRODUCT_OR_SQL_OUTSIDE_FROZEN_COMMIT');
  const entries = [];
  // The historical plan stays immutable for retained checkpoints. A fresh
  // current host selects the existing bounded repair after all its dependencies.
  const selectedNames = completeOpeningInventory
    ? [
        ...REGISTERED_FINAL_NATIVE_SQL_ORDER,
        'postwar-complete-opening-inventory-read-repair',
      ]
    : REGISTERED_FINAL_NATIVE_SQL_ORDER;
  for (const name of selectedNames) {
    const relativePath = 'database/proposals/' + name + '.sql';
    const bytes = await readFile(path.join(root, relativePath), 'utf8');
    entries.push(
      Object.freeze({ name, relativePath, sha256: sha(bytes), bytes }),
    );
  }
  const plan = Object.freeze({
    schemaVersion: 'registered-final-native-sql-plan-v1',
    classification: 'PREPARED_NOT_EXECUTED_NOT_PRODUCTION_APPROVAL',
    expectedCommit,
    repositoryRoot: root,
    entries: Object.freeze(entries),
    planSha256: sha(
      JSON.stringify(entries.map(({ name, sha256 }) => ({ name, sha256 }))),
    ),
    clockExcluded: true,
    exclusions: REGISTERED_FINAL_NATIVE_SQL_EXCLUSIONS,
    industryExecution: 'PREPARATION_ONLY_COMMANDS_NOT_EXECUTED',
  });
  issuedPlans.add(plan);
  return plan;
}
/** The fixture must provide exact receipts for already installed source files.
 * Existence alone cannot stand in for installing the current candidate bytes.
 * Calls use the explicitly owned fixture admin executor, never runtime roles.
 * Every candidate retains its own BEGIN/COMMIT; no all-or-nothing install claim.
 */
export async function installRegisteredFinalNativeSqlFrom({
  plan,
  fixture,
  installedSources,
  recordCommitted,
}) {
  if (
    !issuedPlans.has(plan) ||
    plan.schemaVersion !== 'registered-final-native-sql-plan-v1' ||
    !/^postwar_clone_[a-z0-9_]+$/u.test(fixture.clone.database) ||
    fixture.clone.database === fixture.marker.database
  )
    throw Error('OWNED_DISPOSABLE_CLONE_REQUIRED');
  const actual = (
    await fixture.clone.installer.query('select current_database() database')
  ).rows;
  if (actual.length !== 1 || actual[0].database !== fixture.clone.database)
    throw Error('ACTUAL_OWNED_CLONE_CONNECTION_REQUIRED');
  const committed = [];
  for (const item of plan.entries) {
    if (installedSources[item.name] !== undefined) {
      if (installedSources[item.name] !== item.sha256)
        throw Error('EXISTING_CANDIDATE_SOURCE_HASH_DIFFERS:' + item.name);
      continue;
    }
    // A failed/unknown DDL transaction is retained by the caller; never repair,
    // drop objects, grant runtime privileges or replay economics automatically.
    await fixture.clone.installer.query(item.bytes);
    const receipt = Object.freeze({
      name: item.name,
      sha256: item.sha256,
      status: 'DDL_COMMITTED',
    });
    committed.push(receipt);
    await recordCommitted(receipt);
  }
  return Object.freeze(committed);
}
