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
