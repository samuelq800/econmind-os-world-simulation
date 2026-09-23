import { describe, expect, it } from 'vitest';

import {
  assertV09DisposablePostgresEvidenceExecution,
  runV09DedicatedStagingEvidence,
  runV09DisposablePostgresEvidence,
} from '../../scripts/v09-staging-evidence-runner.mjs';

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
