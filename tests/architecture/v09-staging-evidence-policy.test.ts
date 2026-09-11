import { describe, expect, it } from 'vitest';

import {
  V09_STAGING_EXECUTION_CONFIRMATION,
  V09_STAGING_MIGRATION_IDS,
  assertNoLinkedSupabaseProject,
  assertV09DedicatedStagingExecution,
  buildV09StagingDryRunPlan,
  createV09StagingTargetFingerprint,
  inspectV09StagingPgRuntime,
  parseV09StagingApproval,
} from '../../scripts/v09-staging-evidence-policy.mjs';

type Approval = {
  admin_database_role: string;
  database_host: string;
  database_name: string;
  database_port: number;
  disposable_namespace: string;
  owner_confirmation: string;
  production_target: boolean;
  project_ref: string;
  roles: {
    migration_owner: string;
    reader: string;
    worker: string;
  };
  schema_version: string;
  shared_target: boolean;
  target_classification: string;
  target_fingerprint: string;
};

function approvedTarget(
  overrides: Partial<Omit<Approval, 'roles' | 'target_fingerprint'>> & {
    roles?: Partial<Approval['roles']>;
    target_fingerprint?: string;
  } = {},
): Approval {
  const base = {
    admin_database_role: 'v09_staging_admin',
    database_host: 'db.v09-stage.example.invalid',
    database_name: 'postgres',
    database_port: 5432,
    disposable_namespace: 'world_v2',
    owner_confirmation: 'OWNER_APPROVED_DEDICATED_NONPRODUCTION_V09',
    production_target: false,
    project_ref: 'abcde12345fghij67890',
    roles: {
      migration_owner: 'v09_staging_migration_owner',
      reader: 'v09_staging_reader',
      worker: 'v09_staging_worker',
    },
    schema_version: 'V09_DEDICATED_STAGING_TARGET-1',
    shared_target: false,
    target_classification: 'DEDICATED_NONPRODUCTION',
  };
  const candidate = {
    ...base,
    ...overrides,
    roles: { ...base.roles, ...overrides.roles },
  };
  return {
    ...candidate,
    target_fingerprint:
      overrides.target_fingerprint ??
      createV09StagingTargetFingerprint(candidate),
  };
}

function approvedExecution(target = approvedTarget()) {
  return {
    ECONMIND_ENV: 'staging',
    V09_STAGING_ADMIN_DATABASE_URL: `postgresql://${target.admin_database_role}:local-test-only@${target.database_host}:${target.database_port}/${target.database_name}?ssl=true`,
    V09_STAGING_EXECUTION_CONFIRMATION: V09_STAGING_EXECUTION_CONFIRMATION,
    V09_STAGING_TARGET_FINGERPRINT: target.target_fingerprint,
  };
}

describe('V09 dedicated staging evidence policy', () => {
  it('builds a dry-run plan that permits only the exact six-migration disposable boundary', () => {
    const target = approvedTarget();
    const plan = buildV09StagingDryRunPlan(target);

    expect(plan.execution).toBe('DRY_RUN_ONLY_UNTIL_EXPLICIT_CONFIRMATION');
    expect(plan.migrations).toEqual(V09_STAGING_MIGRATION_IDS);
    expect(plan.cleanup).toEqual({
      broadResetAllowed: false,
      databaseDropAllowed: false,
      exactNamespace: 'world_v2',
      exactRoles: [
        'v09_staging_migration_owner',
        'v09_staging_worker',
        'v09_staging_reader',
      ],
      requiresRunMarker: true,
    });
  });

  it('rejects missing owner confirmation, production/shared targets and ambiguous hosts', () => {
    expect(() =>
      parseV09StagingApproval(
        approvedTarget({ owner_confirmation: 'UNCONFIRMED' }),
      ),
    ).toThrow('owner_confirmation');
    expect(() =>
      parseV09StagingApproval(approvedTarget({ production_target: true })),
    ).toThrow('production and shared targets');
    expect(() =>
      parseV09StagingApproval(approvedTarget({ shared_target: true })),
    ).toThrow('production and shared targets');
    expect(() =>
      parseV09StagingApproval(
        approvedTarget({ database_host: 'db.v09-stage.example.invalid.' }),
      ),
    ).toThrow('canonical lower-case DNS hostname');
  });

  it('rejects non-exact namespaces, roles and approval fingerprints', () => {
    expect(() =>
      parseV09StagingApproval(
        approvedTarget({ disposable_namespace: 'public' }),
      ),
    ).toThrow('disposable_namespace');
    expect(() =>
      parseV09StagingApproval(
        approvedTarget({
          roles: { worker: 'v09_staging_worker_other' },
        }),
      ),
    ).toThrow('roles.worker');
    expect(() =>
      parseV09StagingApproval(
        approvedTarget({
          target_fingerprint:
            '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      ),
    ).toThrow('target_fingerprint does not bind');
  });

  it('requires a separate approved fingerprint and explicit execution confirmation', () => {
    const target = approvedTarget();
    const missingConfirmation = approvedExecution(target);
    delete missingConfirmation.V09_STAGING_EXECUTION_CONFIRMATION;
    expect(() =>
      assertV09DedicatedStagingExecution(missingConfirmation, target),
    ).toThrow('explicit V09_STAGING_EXECUTION_CONFIRMATION');

    expect(() =>
      assertV09DedicatedStagingExecution(
        {
          ...approvedExecution(target),
          V09_STAGING_TARGET_FINGERPRINT: 'mismatch',
        },
        target,
      ),
    ).toThrow('V09_STAGING_TARGET_FINGERPRINT');
  });

  it('uses pg runtime parameters and rejects authority override query strings', () => {
    const target = approvedTarget();
    const authorityOverride =
      'postgresql://v09_staging_admin:local-test-only@db.v09-stage.example.invalid:5432/postgres?ssl=true&host=other.example.invalid&port=6543&user=other';
    expect(inspectV09StagingPgRuntime(authorityOverride)).toMatchObject({
      host: 'other.example.invalid',
      port: 6543,
      ssl: true,
      user: 'other',
    });
    expect(() =>
      assertV09DedicatedStagingExecution(
        {
          ...approvedExecution(target),
          V09_STAGING_ADMIN_DATABASE_URL: authorityOverride,
        },
        target,
      ),
    ).toThrow('canonical TLS query');
  });

  it('rejects runtime URLs, client keys, TLS overrides and nearby URI encodings', () => {
    const target = approvedTarget();
    const tlsOverride =
      'postgresql://v09_staging_admin:local-test-only@db.v09-stage.example.invalid:5432/postgres?ssl=true&sslmode=disable';
    expect(() =>
      assertV09DedicatedStagingExecution(
        { ...approvedExecution(target), DATABASE_URL: 'postgresql://runtime' },
        target,
      ),
    ).toThrow('DATABASE_URL must be absent');
    expect(() =>
      assertV09DedicatedStagingExecution(
        {
          ...approvedExecution(target),
          V09_STAGING_PUBLISHABLE_KEY: [
            'sb',
            'publishable',
            'not-a-secret',
          ].join('_'),
        },
        target,
      ),
    ).toThrow('client credential');
    expect(() =>
      assertV09DedicatedStagingExecution(
        {
          ...approvedExecution(target),
          V09_STAGING_ADMIN_DATABASE_URL:
            'postgresql://v09_staging_admin:local-test-only@other.example.invalid:5432/postgres?ssl=true',
        },
        target,
      ),
    ).toThrow('does not match the owner-approved host');
    expect(() =>
      assertV09DedicatedStagingExecution(
        {
          ...approvedExecution(target),
          V09_STAGING_ADMIN_DATABASE_URL: tlsOverride,
        },
        target,
      ),
    ).toThrow('canonical TLS query');
    expect(inspectV09StagingPgRuntime(tlsOverride).ssl).toBe(false);
    for (const query of [
      '?ssl=true&%68ost=other.example.invalid',
      '?ssl=true&hostaddr=127.0.0.1',
      '?ssl=true&port=6543',
      '?ssl=true&user=other',
      '?ssl=true&database=other',
      '?ssl=true&sslmode=disable',
      '?ssl=true&ssl=true',
      '?ssl=%74rue',
    ]) {
      expect(() =>
        assertV09DedicatedStagingExecution(
          {
            ...approvedExecution(target),
            V09_STAGING_ADMIN_DATABASE_URL: `postgresql://v09_staging_admin:local-test-only@db.v09-stage.example.invalid:5432/postgres${query}`,
          },
          target,
        ),
      ).toThrow('canonical TLS query');
    }
    expect(() =>
      assertV09DedicatedStagingExecution(
        { ...approvedExecution(target), PGHOST: 'other.example.invalid' },
        target,
      ),
    ).toThrow('PGHOST must be absent');
  });

  it('rejects any linked Supabase project rather than implicitly using it', () => {
    expect(() => assertNoLinkedSupabaseProject('abcde12345fghij67890')).toThrow(
      'linked Supabase project is forbidden',
    );
  });
});
