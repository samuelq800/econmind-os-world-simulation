import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertV09DisposablePostgresEvidenceExecution,
  expectedV09StagingCleanupInventory,
  loadV09StagingMigrationChain,
  runV09DedicatedStagingEvidence,
  runV09DisposablePostgresEvidence,
} from '../../scripts/v09-staging-evidence-runner.mjs';
import {
  V09_STAGING_API_READER_ROLES,
  V09_STAGING_CANDIDATE_0021,
  V09_STAGING_EXECUTION_CONFIRMATION,
  V09_STAGING_MIGRATION_IDS,
  V09_STAGING_OWNER_CONFIRMATION,
  V09_STAGING_TARGET_SCHEMA_VERSION,
  assertV09StagingMigrationAllowlist,
  createV09StagingTargetFingerprint,
} from '../../scripts/v09-staging-evidence-policy.mjs';

const OUTPUT = '/private/tmp/v09-disposable-evidence-test.json';

function environment(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ECONMIND_ENV: 'ci',
    V09_DISPOSABLE_EVIDENCE_CONFIRMATION:
      'EXECUTE_DISPOSABLE_V09_POSTGRES_EVIDENCE',
    V09_DISPOSABLE_EVIDENCE_OUTPUT: OUTPUT,
    V09_TEST_DATABASE_FINGERPRINT: 'world-v2-v09-test-ci',
    V09_TEST_DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/econmind_v09',
    ...overrides,
  };
}

describe('V09 disposable PostgreSQL evidence boundary', () => {
  it('rejects the registered 0023 suffix without widening the pinned staging chain or cleanup baseline', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL('../../database/migrations/manifest.json', import.meta.url),
        'utf8',
      ),
    );
    expect(manifest.migrations.at(-1)).toMatchObject({
      migration_id: '0023_world_v2_production_consumption_posting',
      release_order: 23,
      artifact_source_commit: '4714c1da7af9324741996b94c6da036bf54c39a4',
      sha256:
        '0e1ec372429164acb94f9b9588beac75fbf984f5a41413af13715e28a4e94a36',
    });
    await expect(loadV09StagingMigrationChain()).rejects.toThrow(
      'the runner accepts only the exact reviewed 0001–0020 chain or pinned 0021 candidate',
    );

    const inventory = expectedV09StagingCleanupInventory({
      roles: { migration_owner: 'v09_staging_migration_owner' },
    });
    expect(inventory).toEqual(
      expect.arrayContaining([
        'RELATION|narrow_transfer_approval_reference|r|v09_staging_migration_owner',
        'RELATION|country_candidate_artifact|r|v09_staging_migration_owner',
        'RELATION|country_candidate_bundle|r|v09_staging_migration_owner',
        'RELATION|country_candidate_profile|r|v09_staging_migration_owner',
        'FUNCTION|validate_narrow_transfer_approval_reference|0|v09_staging_migration_owner',
        'TRIGGER|narrow_transfer_approval_reference_cannot_truncate|narrow_transfer_approval_reference|v09_staging_migration_owner',
        'POLICY|country_candidate_bundle_selected_source_server_read|country_candidate_bundle|v09_staging_migration_owner',
        'POLICY|country_candidate_artifact_selected_source_server_read|country_candidate_artifact|v09_staging_migration_owner',
      ]),
    );
    expect(inventory).not.toContain(
      'POLICY|country_candidate_artifact_selected_full_source_server_read|country_candidate_artifact|v09_staging_migration_owner',
    );
  });

  it('accepts only the exact fixed 0021 candidate after main, never a missing, extra, reordered or repinned migration', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL('../../database/migrations/manifest.json', import.meta.url),
        'utf8',
      ),
    );
    // The unchanged V09 runner remains capped at the immutable 0021 chain.
    expect(() =>
      assertV09StagingMigrationAllowlist(manifest.migrations),
    ).toThrow('V09_STAGING_MIGRATION_CHAIN_NOT_REVIEWED');
    const complete = manifest.migrations.slice(0, 21) as Array<
      Record<string, unknown>
    >;
    const main = complete.slice(0, -1);
    const candidate = {
      ...V09_STAGING_CANDIDATE_0021,
      release_order: 21,
    };
    expect(complete.at(-1)).toMatchObject(candidate);
    expect(assertV09StagingMigrationAllowlist(main)).toEqual(
      V09_STAGING_MIGRATION_IDS,
    );
    expect(assertV09StagingMigrationAllowlist(complete)).toHaveLength(21);
    expect(V09_STAGING_API_READER_ROLES).toEqual([
      'world_v2_api_reader',
      'world_v2_api_login',
    ]);
    expect(
      expectedV09StagingCleanupInventory(
        { roles: { migration_owner: 'v09_staging_migration_owner' } },
        complete.map((migration) => String(migration.migration_id)),
      ),
    ).toContain(
      'POLICY|country_candidate_artifact_selected_full_source_server_read|country_candidate_artifact|v09_staging_migration_owner',
    );
    for (const rejected of [
      main.slice(0, -1),
      [...main, { ...candidate, migration_id: '0021_unknown' }],
      [...main, candidate, { ...candidate, migration_id: '0022_unknown' }],
      [...main.slice(0, -2), main.at(-1), main.at(-2)],
      [...main.slice(0, -1), { ...main.at(-1), sha256: '0'.repeat(64) }],
      [...main, { ...candidate, sha256: '0'.repeat(64) }],
      [...main, { ...candidate, artifact_source_commit: '0'.repeat(40) }],
    ])
      expect(() => assertV09StagingMigrationAllowlist(rejected)).toThrow(
        'V09_STAGING_MIGRATION_CHAIN_NOT_REVIEWED',
      );
  });

  it('keeps the dedicated staging entry point policy-gated before client creation', async () => {
    const result = await runV09DedicatedStagingEvidence({
      approval: {},
      clientFactory: () => {
        throw new Error('client factory must not be called');
      },
      environment: {},
    });

    expect(result).toMatchObject({
      failure: { stage: 'POLICY_REJECTED' },
      status: 'FAIL_CLOSED',
    });
  });

  it('rejects 0020 global-role DDL on dedicated staging before creating any client', async () => {
    const approvalBase = {
      schema_version: V09_STAGING_TARGET_SCHEMA_VERSION,
      project_ref: 'abcdefghijklmnopqrst',
      target_classification: 'DEDICATED_NONPRODUCTION',
      production_target: false,
      shared_target: false,
      database_host: 'staging.example.com',
      database_port: 5432,
      database_name: 'econmind_v09',
      admin_database_role: 'postgres',
      disposable_namespace: 'world_v2',
      roles: {
        migration_owner: 'v09_staging_migration_owner',
        worker: 'v09_staging_worker',
        reader: 'v09_staging_reader',
      },
      owner_confirmation: V09_STAGING_OWNER_CONFIRMATION,
      evidence_output_path: '/private/tmp/v09-dedicated-fail-closed.json',
    };
    const target_fingerprint = createV09StagingTargetFingerprint(approvalBase);
    let clientsCreated = 0;
    const result = await runV09DedicatedStagingEvidence({
      approval: { ...approvalBase, target_fingerprint },
      environment: {
        ECONMIND_ENV: 'staging',
        V09_STAGING_EXECUTION_CONFIRMATION: V09_STAGING_EXECUTION_CONFIRMATION,
        V09_STAGING_TARGET_FINGERPRINT: target_fingerprint,
        V09_STAGING_ADMIN_DATABASE_URL:
          'postgresql://postgres:synthetic@staging.example.com:5432/econmind_v09?ssl=true',
      },
      clientFactory: () => {
        clientsCreated += 1;
        throw new Error('dedicated staging must not connect');
      },
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: async () => [
        { migration_id: '0020_world_v2_official_country_reader' },
      ],
      writeEvidence: async () => undefined,
    });
    expect(clientsCreated).toBe(0);
    expect(result).toMatchObject({
      failure: { stage: 'LOCAL_MANIFEST' },
      status: 'FAIL_CLOSED',
    });
  });

  it('admits only an explicitly confirmed loopback disposable target', () => {
    const authorized =
      assertV09DisposablePostgresEvidenceExecution(environment());

    expect(authorized.approval).toMatchObject({
      admin_database_role: 'postgres',
      disposable_namespace: 'world_v2',
      evidence_output_path: OUTPUT,
    });
    expect(authorized.target).toEqual({
      database_name: 'econmind_v09',
      host: '127.0.0.1',
      port: '5432',
      role: 'postgres',
      test_fingerprint: 'world-v2-v09-test-ci',
    });
    expect(() =>
      assertV09DisposablePostgresEvidenceExecution(
        environment({
          V09_TEST_DATABASE_URL:
            'postgresql://postgres@nonproduction.example.com:5432/econmind_v09',
        }),
      ),
    ).toThrow('loopback host');
    expect(() =>
      assertV09DisposablePostgresEvidenceExecution(
        environment({
          V09_TEST_DATABASE_URL:
            'postgresql://postgres@127.0.0.1:5432/econmind_v09?host=pg.example.com&port=6432',
        }),
      ),
    ).toThrow('must not contain query or fragment connection overrides');
    expect(() =>
      assertV09DisposablePostgresEvidenceExecution(
        environment({
          V09_TEST_DATABASE_URL:
            'postgresql://postgres@127.0.0.1:5432/econmind_v09#pg.example.com',
        }),
      ),
    ).toThrow('must not contain query or fragment connection overrides');
  });

  it('rejects an omitted port before a PGPORT environment value can redirect either client', async () => {
    const withoutExplicitPort = environment({
      PGPORT: '6432',
      V09_TEST_DATABASE_URL: 'postgresql://postgres@127.0.0.1/econmind_v09',
    });

    expect(() =>
      assertV09DisposablePostgresEvidenceExecution(withoutExplicitPort),
    ).toThrow('must include an explicit numeric PostgreSQL port');

    let clientFactoryCalls = 0;
    const result = await runV09DisposablePostgresEvidence({
      environment: withoutExplicitPort,
      clientFactory: () => {
        clientFactoryCalls += 1;
        throw new Error('primary or cleanup client must not be constructed');
      },
    });

    expect(clientFactoryCalls).toBe(0);
    expect(result).toMatchObject({
      failure: { stage: 'POLICY_REJECTED' },
      status: 'FAIL_CLOSED',
    });
  });

  it('retains explicit IPv6 and non-default loopback port bindings without URL overrides', () => {
    const ipv6 = assertV09DisposablePostgresEvidenceExecution(
      environment({
        V09_TEST_DATABASE_URL:
          'postgresql://postgres@[::1]:5544/econmind_v09_ipv6',
      }),
    );

    expect(ipv6.target).toEqual({
      database_name: 'econmind_v09_ipv6',
      host: '[::1]',
      port: '5544',
      role: 'postgres',
      test_fingerprint: 'world-v2-v09-test-ci',
    });
  });

  it('groups the schema owner in the ownership and RLS aggregate query', async () => {
    const source = await readFile(
      fileURLToPath(
        new URL(
          '../../scripts/v09-staging-evidence-runner.mjs',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const queryStart = source.indexOf("'VERIFY_OWNERSHIP_GRANTS_RLS'");
    const queryEnd = source.indexOf('    [owner, worker, reader', queryStart);
    const ownershipQuery = source.slice(queryStart, queryEnd);

    expect(queryStart).toBeGreaterThanOrEqual(0);
    expect(queryEnd).toBeGreaterThan(queryStart);
    expect(ownershipQuery).toContain(
      'n.nspowner::regrole::text as schema_owner',
    );
    expect(ownershipQuery).toMatch(
      /where n\.nspname = \$4 and c\.relname = any\(array\['world_head', 'world_writer_lease'\]\)\n\s+group by n\.nspowner/u,
    );
  });

  it('revokes the migration owner database CREATE grant before any later disposable migration', async () => {
    const steps: string[] = [];
    const firstMigration = {
      artifact_sha256: '1'.repeat(64),
      migration_id: '0001_world_v2_namespace',
      source_repo_commit: 'a'.repeat(40),
      sql: 'create schema if not exists world_v2',
    };
    const secondMigration = {
      artifact_sha256: '2'.repeat(64),
      migration_id: '0002_world_v2_command_event_ledger',
      source_repo_commit: 'b'.repeat(40),
      sql: 'create table world_v2.world_head (world_id text primary key)',
    };
    const result = await runV09DisposablePostgresEvidence({
      environment: environment(),
      clientFactory: () => ({
        connect: async () => undefined,
        end: async () => undefined,
        execute: async ({ step }: { step: string }) => {
          steps.push(step);
          if (step === 'VERIFY_CONNECTED_ADMIN_ROLE') {
            return { rows: [{ current_user: 'postgres' }] };
          }
          if (step === 'PRECHECK_NAMESPACE_ABSENT') {
            return { rows: [{ exists: false }] };
          }
          if (step === 'PRECHECK_ROLES_ABSENT') return { rows: [] };
          if (step === 'APPLY_MIGRATION_0002_WORLD_V2_COMMAND_EVENT_LEDGER') {
            throw new Error('stop after bootstrap grant regression boundary');
          }
          return { rows: [] };
        },
      }),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: async () => [firstMigration, secondMigration],
      writeEvidence: async () => undefined,
    });

    expect(result).toMatchObject({
      cleanup: { status: 'TRANSACTION_ROLLED_BACK' },
      failure: { stage: 'APPLY_MIGRATIONS' },
      status: 'FAIL_CLOSED',
    });
    expect(steps).toEqual(
      expect.arrayContaining([
        'GRANT_MIGRATION_OWNER_TEMPORARY_DATABASE_CREATE',
        'APPLY_MIGRATION_0001_WORLD_V2_NAMESPACE',
        'RECORD_MIGRATION_0001_WORLD_V2_NAMESPACE',
        'RESET_MIGRATION_OWNER_FOR_DATABASE_REVOKE',
        'REVOKE_MIGRATION_OWNER_TEMPORARY_DATABASE_CREATE',
        'REASSERT_MIGRATION_OWNER_AFTER_DATABASE_REVOKE',
        'APPLY_MIGRATION_0002_WORLD_V2_COMMAND_EVENT_LEDGER',
      ]),
    );
    expect(
      steps.indexOf('GRANT_MIGRATION_OWNER_TEMPORARY_DATABASE_CREATE'),
    ).toBeLessThan(steps.indexOf('APPLY_MIGRATION_0001_WORLD_V2_NAMESPACE'));
    expect(
      steps.indexOf('APPLY_MIGRATION_0001_WORLD_V2_NAMESPACE'),
    ).toBeLessThan(
      steps.indexOf('REVOKE_MIGRATION_OWNER_TEMPORARY_DATABASE_CREATE'),
    );
    expect(
      steps.indexOf('REVOKE_MIGRATION_OWNER_TEMPORARY_DATABASE_CREATE'),
    ).toBeLessThan(
      steps.indexOf('APPLY_MIGRATION_0002_WORLD_V2_COMMAND_EVENT_LEDGER'),
    );
  });

  it('preflights API roles and uses the disposable admin only for 0020 global-role DDL', async () => {
    const steps: string[] = [];
    let checkedRoles: string[] = [];
    const result = await runV09DisposablePostgresEvidence({
      environment: environment(),
      clientFactory: () => ({
        connect: async () => undefined,
        end: async () => undefined,
        execute: async ({
          step,
          values,
        }: {
          step: string;
          values?: string[][];
        }) => {
          steps.push(step);
          if (step === 'VERIFY_CONNECTED_ADMIN_ROLE')
            return { rows: [{ current_user: 'postgres' }] };
          if (step === 'PRECHECK_NAMESPACE_ABSENT')
            return { rows: [{ exists: false }] };
          if (step === 'PRECHECK_ROLES_ABSENT') {
            checkedRoles = values?.[0] ?? [];
            return { rows: [] };
          }
          if (step === 'APPLY_MIGRATION_0022_STOP_TEST')
            throw new Error('stop after checking the reviewed 0020 boundary');
          return { rows: [] };
        },
      }),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: async () => [
        {
          artifact_sha256: '1'.repeat(64),
          migration_id: '0001_world_v2_namespace',
          source_repo_commit: 'a'.repeat(40),
          sql: 'create schema if not exists world_v2',
        },
        {
          artifact_sha256: '2'.repeat(64),
          migration_id: '0020_world_v2_official_country_reader',
          source_repo_commit: 'b'.repeat(40),
          sql: 'create role world_v2_api_reader nologin',
        },
        {
          artifact_sha256: '3'.repeat(64),
          migration_id: '0022_stop_test',
          source_repo_commit: 'c'.repeat(40),
          sql: 'select 1',
        },
      ],
      writeEvidence: async () => undefined,
    });
    expect(result).toMatchObject({
      cleanup: { status: 'TRANSACTION_ROLLED_BACK' },
      failure: { stage: 'APPLY_MIGRATIONS' },
      status: 'FAIL_CLOSED',
    });
    expect(checkedRoles).toEqual(
      expect.arrayContaining(V09_STAGING_API_READER_ROLES),
    );
    expect(steps.indexOf('RESET_OWNER_FOR_API_ROLE_MIGRATION')).toBeLessThan(
      steps.indexOf('APPLY_MIGRATION_0020_WORLD_V2_OFFICIAL_COUNTRY_READER'),
    );
    expect(
      steps.indexOf('APPLY_MIGRATION_0020_WORLD_V2_OFFICIAL_COUNTRY_READER'),
    ).toBeLessThan(steps.indexOf('REASSERT_OWNER_AFTER_API_ROLE_MIGRATION'));
    expect(
      steps.indexOf('REASSERT_OWNER_AFTER_API_ROLE_MIGRATION'),
    ).toBeLessThan(steps.indexOf('APPLY_MIGRATION_0022_STOP_TEST'));
  });

  it('refuses a pre-existing API reader role before marker creation or cleanup', async () => {
    const steps: string[] = [];
    const result = await runV09DisposablePostgresEvidence({
      environment: environment(),
      clientFactory: () => ({
        connect: async () => undefined,
        end: async () => undefined,
        execute: async ({ step }: { step: string }) => {
          steps.push(step);
          if (step === 'VERIFY_CONNECTED_ADMIN_ROLE')
            return { rows: [{ current_user: 'postgres' }] };
          if (step === 'PRECHECK_NAMESPACE_ABSENT')
            return { rows: [{ exists: false }] };
          if (step === 'PRECHECK_ROLES_ABSENT')
            return { rows: [{ rolname: 'world_v2_api_reader' }] };
          return { rows: [] };
        },
      }),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: async () => [
        {
          artifact_sha256: '1'.repeat(64),
          migration_id: '0020_world_v2_official_country_reader',
          source_repo_commit: 'a'.repeat(40),
          sql: 'create role world_v2_api_reader nologin',
        },
      ],
      writeEvidence: async () => undefined,
    });
    expect(result).toMatchObject({
      failure: { stage: 'PRISTINE_BOUNDARY' },
      status: 'FAIL_CLOSED',
    });
    expect(steps).not.toContain('CREATE_DISPOSABLE_NAMESPACE');
    expect(steps.some((step) => step.startsWith('CLEANUP_'))).toBe(false);
  });

  it('rejects runtime or Supabase configuration before a client can be created', () => {
    expect(() =>
      assertV09DisposablePostgresEvidenceExecution(
        environment({ DATABASE_URL: 'postgresql://runtime@127.0.0.1/runtime' }),
      ),
    ).toThrow('must not share WORLD_DATABASE_URL or DATABASE_URL');
    expect(() =>
      assertV09DisposablePostgresEvidenceExecution(
        environment({ SUPABASE_URL: 'https://example.supabase.co' }),
      ),
    ).toThrow('SUPABASE_URL must be absent');
  });

  it('binds a local-run result to immutable inputs without exposing the connection string', async () => {
    const result = await runV09DisposablePostgresEvidence({
      environment: environment(),
      loadMigrationChain: async () => [
        {
          artifact_sha256: 'a'.repeat(64),
          migration_id: '0001_world_v2_namespace',
          source_repo_commit: 'b'.repeat(40),
          sql: 'create schema world_v2',
        },
      ],
      loadLinkedProjectRef: async () => undefined,
      runId: 'RUN.DISPOSABLE.1',
      writeEvidence: async ({ evidence }) => evidence,
      clientFactory: () => ({
        connect: async () => undefined,
        end: async () => undefined,
        execute: async () => {
          throw new Error('test client must not be reached');
        },
      }),
    });

    expect(result).toMatchObject({
      evidence_scope: 'DISPOSABLE_LOOPBACK_POSTGRESQL',
      gate_b_dedicated_staging: 'NOT_RUN',
      judgment: 'FAIL_DISPOSABLE_LOCAL_ONLY_NOT_DEDICATED_STAGING',
      receipt_recovery: {
        required_focused_suite:
          'tests/world-core/v09-atomic-recovery-postgres.test.ts',
        status: 'NOT_RUN',
      },
      status: 'FAIL_CLOSED',
      transport_tls_staging_equivalence: 'NOT_RUN',
    });
    expect(JSON.stringify(result)).not.toContain('postgresql://');
    expect(result.immutable_input).toMatchObject({
      migrations: [
        {
          artifact_sha256: 'a'.repeat(64),
          migration_id: '0001_world_v2_namespace',
          source_repo_commit: 'b'.repeat(40),
        },
      ],
    });
  });

  it('returns fail-closed policy evidence without opening a connection when confirmation is absent', async () => {
    const result = await runV09DisposablePostgresEvidence({
      environment: environment({
        V09_DISPOSABLE_EVIDENCE_CONFIRMATION: undefined,
      }),
      clientFactory: () => {
        throw new Error('client factory must not be called');
      },
    });

    expect(result).toMatchObject({
      evidence_scope: 'DISPOSABLE_LOOPBACK_POSTGRESQL',
      failure: { stage: 'POLICY_REJECTED' },
      gate_b_dedicated_staging: 'NOT_RUN',
      status: 'FAIL_CLOSED',
    });
  });
});
