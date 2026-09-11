import { describe, expect, it } from 'vitest';

import {
  V09_STAGING_EXECUTION_CONFIRMATION,
  V09_STAGING_MIGRATION_IDS,
  createV09StagingTargetFingerprint,
} from '../../scripts/v09-staging-evidence-policy.mjs';
import { runV09DedicatedStagingEvidence } from '../../scripts/v09-staging-evidence-runner.mjs';

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

type QueryRequest = {
  step: string;
  text: string;
  values: unknown[];
};

function approvedTarget(): Approval {
  const candidate = {
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
  return {
    ...candidate,
    target_fingerprint: createV09StagingTargetFingerprint(candidate),
  };
}

function approvedExecution(target: Approval) {
  return {
    ECONMIND_ENV: 'staging',
    V09_STAGING_ADMIN_DATABASE_URL: `postgresql://${target.admin_database_role}:local-runner-secret@${target.database_host}:${target.database_port}/${target.database_name}?ssl=true`,
    V09_STAGING_EXECUTION_CONFIRMATION: V09_STAGING_EXECUTION_CONFIRMATION,
    V09_STAGING_TARGET_FINGERPRINT: target.target_fingerprint,
  };
}

function expectedDatabaseError(message: string) {
  return Object.assign(new Error(message), { code: '55000' });
}

class FakeClient {
  readonly calls: QueryRequest[] = [];
  connectCalls = 0;
  endCalls = 0;

  constructor(
    private readonly approval: Approval,
    private readonly failAt?: string,
  ) {}

  async connect() {
    this.connectCalls += 1;
  }

  async end() {
    this.endCalls += 1;
  }

  async execute(request: QueryRequest) {
    this.calls.push(request);
    if (request.step === this.failAt) {
      throw new Error(`fake failure at ${request.step}`);
    }
    if (
      [
        'LEASE_ACTIVE_SECOND_WRITER_REJECTED',
        'CRASH_AFTER_HELD_REJECTED',
      ].includes(request.step)
    ) {
      throw expectedDatabaseError('WORLD_WRITER_LEASE_HELD');
    }
    if (request.step === 'LEASE_DELETE_REJECTED') {
      throw expectedDatabaseError('DELETE is forbidden');
    }
    if (request.step === 'LEASE_TRUNCATE_REJECTED') {
      throw expectedDatabaseError('TRUNCATE is forbidden');
    }
    if (
      ['LEASE_OLD_FENCE_REJECTED', 'CRASH_AFTER_OLD_FENCE_REJECTED'].includes(
        request.step,
      )
    ) {
      throw expectedDatabaseError('WORLD_WRITER_FENCE_STALE');
    }
    if (request.step === 'VERIFY_CONNECTED_ADMIN_ROLE') {
      return { rows: [{ current_user: this.approval.admin_database_role }] };
    }
    if (request.step === 'PRECHECK_NAMESPACE_ABSENT') {
      return { rows: [{ exists: false }] };
    }
    if (request.step === 'PRECHECK_ROLES_ABSENT') {
      return { rows: [] };
    }
    if (request.step === 'VERIFY_OWNERSHIP_GRANTS_RLS') {
      return {
        rows: [
          {
            owner_write: true,
            reader_write: false,
            rls_forced: true,
            schema_owner: this.approval.roles.migration_owner,
            worker_delete: false,
          },
        ],
      };
    }
    if (request.step === 'VERIFY_WORKER_LEAST_PRIVILEGE') {
      return {
        rows: [{ can_delete: false, can_write: true, rls_active: true }],
      };
    }
    if (request.step === 'VERIFY_READER_READ_ONLY') {
      return { rows: [{ can_read: true, can_write: false, rls_active: true }] };
    }
    if (request.step === 'CLEANUP_VERIFY_MARKER') {
      return {
        rows: [
          {
            migration_owner: this.approval.roles.migration_owner,
            reader_role: this.approval.roles.reader,
            target_fingerprint: this.approval.target_fingerprint,
            worker_role: this.approval.roles.worker,
          },
        ],
      };
    }
    if (request.step === 'CLEANUP_VERIFY_SCHEMA_OWNERSHIP') {
      return {
        rows: [
          {
            all_objects_owned: true,
            schema_owner: this.approval.roles.migration_owner,
          },
        ],
      };
    }
    if (request.step === 'CLEANUP_VERIFY_NO_EXTERNAL_DEPENDENTS') {
      return { rows: [{ namespaces: [] }] };
    }
    if (request.step === 'LEASE_ACQUIRE') {
      return { rows: [{ acquisition_kind: 'ACQUIRED', fencing_token: '1' }] };
    }
    if (request.step === 'LEASE_RENEW') {
      return { rows: [{ acquisition_kind: 'RENEWED', fencing_token: '1' }] };
    }
    if (request.step === 'LEASE_EXPIRED_TAKEOVER') {
      return { rows: [{ acquisition_kind: 'TAKEN_OVER', fencing_token: '2' }] };
    }
    if (
      [
        'CRASH_BEFORE_ACQUIRE',
        'CRASH_BEFORE_RECOVERY',
        'CRASH_AFTER_ACQUIRE',
      ].includes(request.step)
    ) {
      return { rows: [{ acquisition_kind: 'ACQUIRED', fencing_token: '1' }] };
    }
    if (request.step === 'CRASH_AFTER_TAKEOVER') {
      return { rows: [{ acquisition_kind: 'TAKEN_OVER', fencing_token: '2' }] };
    }
    return { rows: [] };
  }
}

function fakeMigrationChain() {
  return V09_STAGING_MIGRATION_IDS.map((migrationId) => ({
    artifact_sha256: '0'.repeat(64),
    migration_id: migrationId,
    source_repo_commit: 'a'.repeat(40),
    sql: `select '${migrationId}'`,
  }));
}

function fakeFactory(approval: Approval, failAt?: string) {
  const clients: FakeClient[] = [];
  const connectionStrings: string[] = [];
  return {
    clients,
    connectionStrings,
    factory: async ({ connectionString }: { connectionString: string }) => {
      connectionStrings.push(connectionString);
      const client = new FakeClient(approval, failAt);
      clients.push(client);
      return client;
    },
  };
}

function callIndex(calls: readonly QueryRequest[], step: string) {
  return calls.findIndex((call) => call.step === step);
}

describe('V09 dedicated staging evidence runner', () => {
  it('rejects policy failure before creating or connecting a PostgreSQL client', async () => {
    const target = approvedTarget();
    const fake = fakeFactory(target);
    const environment = approvedExecution(target);
    delete environment.V09_STAGING_EXECUTION_CONFIRMATION;

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment,
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-policy-rejected',
    });

    expect(evidence).toMatchObject({
      failure: { stage: 'POLICY_REJECTED' },
      status: 'FAIL_CLOSED',
    });
    expect(fake.clients).toEqual([]);
    expect(fake.connectionStrings).toEqual([]);
  });

  it('runs the exact chain in order, emits redacted evidence, and cleans only the marked boundary', async () => {
    const target = approvedTarget();
    const fake = fakeFactory(target);
    const environment = approvedExecution(target);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment,
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-success',
    });

    expect(evidence).toMatchObject({
      cleanup: { markerBound: true, status: 'PASS' },
      marker: {
        namespace: 'world_v2',
        run_id: 'run-success',
        target_fingerprint: target.target_fingerprint,
      },
      migrations: V09_STAGING_MIGRATION_IDS,
      secret_redacted: true,
      status: 'PASS',
    });
    expect(JSON.stringify(evidence)).not.toContain('local-runner-secret');
    expect(fake.connectionStrings).toHaveLength(4);
    expect(fake.clients).toHaveLength(4);
    expect(fake.clients.every((client) => client.connectCalls === 1)).toBe(
      true,
    );
    expect(fake.clients.every((client) => client.endCalls === 1)).toBe(true);

    const steps = evidence.steps.map((step: { id: string }) => step.id);
    expect(steps).toEqual([
      'LINKED_PROJECT_PRECHECK',
      'LOCAL_MANIFEST',
      'CREATE_CLIENT',
      'CONNECT',
      'VERIFY_CONNECTED_ADMIN',
      'PRISTINE_BOUNDARY',
      'BEGIN_TRANSACTION',
      'PROVISION_MARKER',
      'APPLY_MIGRATIONS',
      'LEASE_EVIDENCE',
      'OWNERSHIP_GRANTS_RLS',
      'COMMIT_TRANSACTION',
      'ROLE_BOUNDARY_EVIDENCE',
      'CRASH_CONNECTION_LOSS',
      'END_PRIMARY_CLIENT',
      'CREATE_CLEANUP_CLIENT',
      'CONNECT_CLEANUP_CLIENT',
      'CLEANUP_MARKED_BOUNDARY',
      'END_CLEANUP_CLIENT',
    ]);

    const primary = fake.clients[0].calls;
    expect(callIndex(primary, 'WRITE_RUN_MARKER')).toBeGreaterThan(
      callIndex(primary, 'CREATE_RUN_MARKER_TABLE'),
    );
    expect(callIndex(primary, 'COMMIT_EVIDENCE_TRANSACTION')).toBeGreaterThan(
      callIndex(primary, 'CREATE_RLS_POLICIES'),
    );
    const cleanup = fake.clients[3].calls;
    expect(callIndex(cleanup, 'CLEANUP_DROP_EXACT_SCHEMA')).toBeGreaterThan(
      callIndex(cleanup, 'CLEANUP_VERIFY_NO_EXTERNAL_DEPENDENTS'),
    );
    const cleanupSql = cleanup
      .map((call) => call.text.toLowerCase())
      .join('\n');
    expect(cleanupSql).toContain('drop schema "world_v2" cascade');
    expect(cleanupSql).not.toContain('drop database');
    expect(cleanupSql).not.toContain('drop owned');
  });

  it('rolls back before a marker exists and does not invoke cleanup', async () => {
    const target = approvedTarget();
    const fake = fakeFactory(target, 'WRITE_RUN_MARKER');

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-pre-marker-failure',
    });

    expect(evidence).toMatchObject({
      cleanup: { markerBound: false, status: 'NOT_ATTEMPTED' },
      failure: { stage: 'PROVISION_MARKER' },
      status: 'FAIL_CLOSED',
    });
    expect(fake.clients).toHaveLength(1);
    expect(fake.clients[0].calls.map((call) => call.step)).toContain(
      'ROLLBACK_AFTER_FAILURE',
    );
    expect(
      fake.clients[0].calls.some((call) => call.step.startsWith('CLEANUP_')),
    ).toBe(false);
  });

  it('fails closed and uses marker-scoped cleanup after a post-commit crash protocol failure', async () => {
    const target = approvedTarget();
    const fake = fakeFactory(target, 'CRASH_BEFORE_ACQUIRE');

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-post-commit-failure',
    });

    expect(evidence).toMatchObject({
      cleanup: { markerBound: true, status: 'PASS' },
      failure: { stage: 'CRASH_CONNECTION_LOSS' },
      status: 'FAIL_CLOSED',
    });
    expect(fake.clients).toHaveLength(3);
    const cleanupCalls = fake.clients[2].calls;
    expect(cleanupCalls.map((call) => call.step)).toEqual(
      expect.arrayContaining([
        'CLEANUP_VERIFY_MARKER',
        'CLEANUP_VERIFY_SCHEMA_OWNERSHIP',
        'CLEANUP_VERIFY_NO_EXTERNAL_DEPENDENTS',
        'CLEANUP_DROP_EXACT_SCHEMA',
        'CLEANUP_REVOKE_V09_STAGING_MIGRATION_OWNER_FROM_ADMIN',
        'CLEANUP_DROP_ROLE_V09_STAGING_MIGRATION_OWNER',
      ]),
    );
  });
});
