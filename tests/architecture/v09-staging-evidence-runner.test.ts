import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  V09_STAGING_EXECUTION_CONFIRMATION,
  V09_STAGING_MIGRATION_IDS,
  V09_STAGING_TARGET_SCHEMA_VERSION,
  createV09StagingTargetFingerprint,
} from '../../scripts/v09-staging-evidence-policy.mjs';
import {
  expectedV09StagingCleanupInventory,
  runV09DedicatedStagingEvidence,
  writeV09StagingEvidence,
} from '../../scripts/v09-staging-evidence-runner.mjs';

type Approval = {
  admin_database_role: string;
  database_host: string;
  database_name: string;
  database_port: number;
  disposable_namespace: string;
  evidence_output_path: string;
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

type QueryResult = { rows: Record<string, unknown>[] };

type SharedStagingState = {
  ackBackendPid: string;
  ackCommitCommandObserved: boolean;
  ackCommitIntentStaged: boolean;
  ackClientId?: number;
  ackLost: boolean;
  ackMarkerCommitted: boolean;
  ackReject?: (reason?: unknown) => void;
  ackSleeping: boolean;
  cleanupCommitted: boolean;
  crashBeforeLeaseRolledBack: boolean;
  durableWriteCalls: number;
  externalDependencyNamespace?: string;
  failAt?: string;
  markerRunId?: string;
  permissionDenied?: boolean;
  publicOperatorStillPresent: boolean;
  rolesRemaining: number;
  rolesRevoked: number;
  schemaExists: boolean;
};

function approvedTarget(): Approval {
  const candidate = {
    admin_database_role: 'v09_staging_admin',
    database_host: 'db.v09-stage.example.invalid',
    database_name: 'postgres',
    database_port: 5432,
    disposable_namespace: 'world_v2',
    evidence_output_path: '/private/tmp/v09-staging-runner-test/evidence.json',
    owner_confirmation: 'OWNER_APPROVED_DEDICATED_NONPRODUCTION_V09',
    production_target: false,
    project_ref: 'abcde12345fghij67890',
    roles: {
      migration_owner: 'v09_staging_migration_owner',
      reader: 'v09_staging_reader',
      worker: 'v09_staging_worker',
    },
    schema_version: V09_STAGING_TARGET_SCHEMA_VERSION,
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

function createSharedState(
  overrides: Partial<SharedStagingState> = {},
): SharedStagingState {
  return {
    ackBackendPid: '4242',
    ackCommitCommandObserved: false,
    ackCommitIntentStaged: false,
    ackLost: false,
    ackMarkerCommitted: false,
    ackSleeping: false,
    cleanupCommitted: false,
    crashBeforeLeaseRolledBack: false,
    durableWriteCalls: 0,
    publicOperatorStillPresent: true,
    rolesRemaining: 3,
    rolesRevoked: 0,
    schemaExists: true,
    ...overrides,
  };
}

class FakeClient {
  readonly calls: QueryRequest[] = [];
  connectCalls = 0;
  endCalls = 0;
  private transactionOpen = false;
  private crashBeforeLeaseStaged = false;

  constructor(
    private readonly approval: Approval,
    private readonly state: SharedStagingState,
    private readonly id: number,
  ) {}

  async connect() {
    this.connectCalls += 1;
  }

  async end() {
    this.endCalls += 1;
    if (this.transactionOpen && this.crashBeforeLeaseStaged) {
      this.state.crashBeforeLeaseRolledBack = true;
    }
    this.transactionOpen = false;
    if (this.state.ackClientId === this.id && this.state.ackSleeping) {
      this.state.ackSleeping = false;
      this.state.ackLost = true;
      this.state.ackReject?.(new Error('simulated acknowledgement loss'));
    }
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    this.calls.push(request);
    if (request.step === this.state.failAt) {
      throw new Error(`fake failure at ${request.step}`);
    }
    if (
      request.step === 'VERIFY_CONNECTED_ADMIN_ROLE' ||
      request.step.endsWith('_VERIFY_CONNECTED_ADMIN')
    ) {
      return { rows: [{ current_user: this.approval.admin_database_role }] };
    }
    if (request.step === 'PRECHECK_NAMESPACE_ABSENT') {
      return { rows: [{ exists: false }] };
    }
    if (request.step === 'PRECHECK_ROLES_ABSENT') {
      return { rows: [] };
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
    if (
      request.step === 'BEGIN_EVIDENCE_TRANSACTION' ||
      request.step === 'ACK_BEGIN' ||
      request.step === 'CRASH_BEFORE_BEGIN'
    ) {
      this.transactionOpen = true;
      return { rows: [] };
    }
    if (request.step === 'COMMIT_EVIDENCE_TRANSACTION') {
      this.transactionOpen = false;
      return { rows: [] };
    }
    if (request.step === 'ROLLBACK_AFTER_FAILURE') {
      this.transactionOpen = false;
      return { rows: [] };
    }
    if (request.step === 'WRITE_RUN_MARKER') {
      this.state.markerRunId = String(request.values[0]);
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
    if (request.step === 'LEASE_ACQUIRE') {
      return { rows: [{ acquisition_kind: 'ACQUIRED', fencing_token: '1' }] };
    }
    if (request.step === 'LEASE_RENEW') {
      return { rows: [{ acquisition_kind: 'RENEWED', fencing_token: '1' }] };
    }
    if (request.step === 'LEASE_EXPIRED_TAKEOVER') {
      return { rows: [{ acquisition_kind: 'TAKEN_OVER', fencing_token: '2' }] };
    }
    if (request.step === 'CRASH_BEFORE_ACQUIRE') {
      this.crashBeforeLeaseStaged = true;
      return { rows: [{ acquisition_kind: 'ACQUIRED', fencing_token: '1' }] };
    }
    if (request.step === 'CRASH_BEFORE_RECOVERY') {
      if (!this.state.crashBeforeLeaseRolledBack) {
        throw new Error('pre-commit lease was not rolled back');
      }
      return { rows: [{ acquisition_kind: 'ACQUIRED', fencing_token: '1' }] };
    }
    if (request.step === 'CRASH_BEFORE_RECOVER_EXACT_MARKER') {
      return {
        rows: [
          {
            acknowledgement_state: this.state.ackMarkerCommitted
              ? 'COMMITTED'
              : 'PENDING',
            migration_owner: this.approval.roles.migration_owner,
            reader_role: this.approval.roles.reader,
            target_fingerprint: this.approval.target_fingerprint,
            worker_role: this.approval.roles.worker,
          },
        ],
      };
    }
    if (request.step === 'ACK_PRIMARY_BACKEND_PID') {
      return { rows: [{ backend_pid: this.state.ackBackendPid }] };
    }
    if (request.step === 'ACK_MARK_COMMIT_INTENT') {
      this.state.ackCommitIntentStaged = true;
      return { rows: [{ acknowledgement_state: 'COMMITTED' }] };
    }
    if (request.step === 'ACK_ACQUIRE_LEASE') {
      return { rows: [{ acquisition_kind: 'ACQUIRED', fencing_token: '1' }] };
    }
    if (request.step === 'ACK_UNKNOWN_COMMIT_AND_SLEEP') {
      if (
        !this.transactionOpen ||
        !this.state.ackCommitIntentStaged ||
        !request.text.includes('commit;') ||
        !request.text.includes('pg_sleep(')
      ) {
        throw new Error('acknowledgement protocol was not transactional');
      }
      this.transactionOpen = false;
      this.state.ackCommitCommandObserved = true;
      this.state.ackMarkerCommitted = true;
      this.state.ackSleeping = true;
      this.state.ackClientId = this.id;
      return new Promise<QueryResult>((_resolve, reject) => {
        this.state.ackReject = reject;
      });
    }
    if (request.step === 'ACK_OBSERVE_POST_COMMIT_SLEEP') {
      const requestedPid = String(request.values[0]);
      if (this.state.ackSleeping && requestedPid === this.state.ackBackendPid) {
        return {
          rows: [
            {
              backend_pid: this.state.ackBackendPid,
              backend_type: 'client backend',
              matching_ack_sleep: true,
              state: 'active',
              wait_event: 'PgSleep',
              wait_event_type: 'Timeout',
            },
          ],
        };
      }
      return { rows: [] };
    }
    if (request.step === 'ACK_TERMINATE_EXACT_BACKEND') {
      const requestedPid = String(request.values[0]);
      const terminated =
        !this.state.permissionDenied &&
        this.state.ackSleeping &&
        requestedPid === this.state.ackBackendPid;
      if (terminated) {
        this.state.ackSleeping = false;
        this.state.ackLost = true;
        this.state.ackReject?.(new Error('simulated acknowledgement loss'));
      }
      return { rows: [{ terminated }] };
    }
    if (request.step === 'ACK_RECOVER_EXACT_MARKER') {
      return {
        rows: [
          {
            acknowledgement_state: this.state.ackMarkerCommitted
              ? 'COMMITTED'
              : 'PENDING',
            migration_owner: this.approval.roles.migration_owner,
            reader_role: this.approval.roles.reader,
            target_fingerprint: this.approval.target_fingerprint,
            worker_role: this.approval.roles.worker,
          },
        ],
      };
    }
    if (request.step === 'CRASH_AFTER_TAKEOVER') {
      return { rows: [{ acquisition_kind: 'TAKEN_OVER', fencing_token: '2' }] };
    }
    if (request.step === 'CLEANUP_VERIFY_MARKER') {
      return {
        rows: [
          {
            acknowledgement_state: this.state.ackMarkerCommitted
              ? 'COMMITTED'
              : 'PENDING',
            migration_owner: this.approval.roles.migration_owner,
            reader_role: this.approval.roles.reader,
            run_id: this.state.markerRunId,
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
    if (request.step === 'CLEANUP_VERIFY_EXACT_ALLOWLIST') {
      return {
        rows: expectedV09StagingCleanupInventory(this.approval).map(
          (inventory_key) => ({ inventory_key }),
        ),
      };
    }
    if (
      [
        'CLEANUP_VERIFY_NO_STANDALONE_TYPES',
        'CLEANUP_VERIFY_NO_SCHEMA_OPERATORS',
      ].includes(request.step)
    ) {
      return { rows: [] };
    }
    if (request.step === 'CLEANUP_VERIFY_EXACT_ROLE_ATTRIBUTES') {
      return {
        rows: Object.values(this.approval.roles).map((rolname) => ({
          rolbypassrls: false,
          rolcanlogin: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolinherit: false,
          rolname,
          rolreplication: false,
          rolsuper: false,
        })),
      };
    }
    if (request.step === 'CLEANUP_VERIFY_EXACT_ROLE_MEMBERSHIPS') {
      return {
        rows: Object.values(this.approval.roles).map((role_name) => ({
          member_name: this.approval.admin_database_role,
          role_name,
        })),
      };
    }
    if (request.step === 'CLEANUP_VERIFY_NO_EXTERNAL_DEPENDENTS') {
      return {
        rows: [
          {
            namespaces: this.state.externalDependencyNamespace
              ? [this.state.externalDependencyNamespace]
              : [],
          },
        ],
      };
    }
    if (request.step === 'CLEANUP_BEGIN') {
      this.transactionOpen = true;
      return { rows: [] };
    }
    if (request.step === 'CLEANUP_ROLLBACK') {
      this.transactionOpen = false;
      return { rows: [] };
    }
    if (request.step === 'CLEANUP_DROP_EXACT_SCHEMA_RESTRICT') {
      this.state.schemaExists = false;
      return { rows: [] };
    }
    if (request.step.startsWith('CLEANUP_REVOKE_')) {
      this.state.rolesRevoked += 1;
      return { rows: [] };
    }
    if (request.step === 'CLEANUP_VERIFY_NO_ROLE_RESIDUE') {
      return {
        rows: this.state.rolesRevoked === 3 ? [] : [{ role: 'residue' }],
      };
    }
    if (request.step.startsWith('CLEANUP_DROP_ROLE_')) {
      this.state.rolesRemaining -= 1;
      return { rows: [] };
    }
    if (request.step === 'CLEANUP_VERIFY_NAMESPACE_ABSENT') {
      return { rows: this.state.schemaExists ? [{ nspname: 'world_v2' }] : [] };
    }
    if (request.step === 'CLEANUP_VERIFY_ROLES_ABSENT') {
      return {
        rows:
          this.state.rolesRemaining === 0
            ? []
            : [{ rolname: this.approval.roles.migration_owner }],
      };
    }
    if (request.step === 'CLEANUP_COMMIT') {
      this.transactionOpen = false;
      this.state.cleanupCommitted = true;
      return { rows: [] };
    }
    if (request.step.startsWith('CLEANUP_DROP_')) {
      if (
        request.text.includes('public') ||
        request.text.includes('operator')
      ) {
        this.state.publicOperatorStillPresent = false;
      }
      return { rows: [] };
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

function fakeFactory(approval: Approval, state: SharedStagingState) {
  const clients: FakeClient[] = [];
  const connectionStrings: string[] = [];
  return {
    clients,
    connectionStrings,
    factory: async ({ connectionString }: { connectionString: string }) => {
      connectionStrings.push(connectionString);
      const client = new FakeClient(approval, state, clients.length + 1);
      clients.push(client);
      return client;
    },
  };
}

function callIndex(calls: readonly QueryRequest[], step: string) {
  return calls.findIndex((call) => call.step === step);
}

function cleanupCalls(fake: ReturnType<typeof fakeFactory>) {
  return fake.clients[fake.clients.length - 1].calls;
}

function noOpEvidenceWriter(state: SharedStagingState) {
  return async () => {
    state.durableWriteCalls += 1;
  };
}

describe('V09 dedicated staging evidence runner', () => {
  it('rejects policy failure before creating a PostgreSQL client or selecting a durable output', async () => {
    const target = approvedTarget();
    const state = createSharedState();
    const fake = fakeFactory(target, state);
    const environment = approvedExecution(target);
    delete environment.V09_STAGING_EXECUTION_CONFIRMATION;

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment,
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-policy-rejected',
      writeEvidence: noOpEvidenceWriter(state),
    });

    expect(evidence).toMatchObject({
      failure: { stage: 'POLICY_REJECTED' },
      status: 'FAIL_CLOSED',
    });
    expect(fake.clients).toEqual([]);
    expect(fake.connectionStrings).toEqual([]);
    expect(state.durableWriteCalls).toBe(0);
  });

  it('uses shared transaction state to prove rollback-before-commit and committed-but-unacknowledged recovery', async () => {
    const target = approvedTarget();
    const state = createSharedState();
    const fake = fakeFactory(target, state);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-success',
      writeEvidence: noOpEvidenceWriter(state),
    });

    expect(evidence).toMatchObject({
      cleanup: { markerBound: true, status: 'PASS' },
      commit_acknowledgement: {
        outcome: 'COMMITTED_ACKNOWLEDGEMENT_LOST',
        rollback_before_commit: 'PASS',
        status: 'PASS',
      },
      durable_evidence: { status: 'PASS' },
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
    expect(state.crashBeforeLeaseRolledBack).toBe(true);
    expect(state.ackCommitIntentStaged).toBe(true);
    expect(state.ackCommitCommandObserved).toBe(true);
    expect(state.ackMarkerCommitted).toBe(true);
    expect(state.ackLost).toBe(true);
    expect(state.cleanupCommitted).toBe(true);
    expect(state.durableWriteCalls).toBe(1);
    expect(fake.clients.length).toBe(5);
    expect(fake.clients.every((client) => client.connectCalls === 1)).toBe(
      true,
    );
    expect(fake.clients.every((client) => client.endCalls === 1)).toBe(true);

    const primary = fake.clients[0].calls;
    expect(callIndex(primary, 'WRITE_RUN_MARKER')).toBeGreaterThan(
      callIndex(primary, 'CREATE_RUN_MARKER_TABLE'),
    );
    expect(callIndex(primary, 'COMMIT_EVIDENCE_TRANSACTION')).toBeGreaterThan(
      callIndex(primary, 'CREATE_RLS_POLICIES'),
    );
    expect(primary.map((call) => call.step)).toContain(
      'CRASH_BEFORE_RECOVER_EXACT_MARKER',
    );
    const cleanup = cleanupCalls(fake);
    expect(
      callIndex(cleanup, 'CLEANUP_DROP_EXACT_SCHEMA_RESTRICT'),
    ).toBeGreaterThan(
      callIndex(cleanup, 'CLEANUP_VERIFY_NO_EXTERNAL_DEPENDENTS'),
    );
    const cleanupSql = cleanup
      .map((call) => call.text.toLowerCase())
      .join('\n');
    expect(cleanupSql).not.toContain('cascade');
    expect(cleanupSql).not.toContain('drop database');
    expect(cleanupSql).not.toContain('drop owned');
    expect(cleanupSql).toContain('drop schema "world_v2" restrict');
    expect(cleanupSql).toContain(
      'drop table "world_v2"."notification_outbox" restrict',
    );
  });

  it('fails closed without cleanup when provisioning rolls back before a marker exists', async () => {
    const target = approvedTarget();
    const state = createSharedState({ failAt: 'WRITE_RUN_MARKER' });
    const fake = fakeFactory(target, state);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-pre-marker-failure',
      writeEvidence: noOpEvidenceWriter(state),
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
    expect(state.durableWriteCalls).toBe(1);
  });

  it('refuses a synthetic public-operator dependency before deleting any dependent object', async () => {
    const target = approvedTarget();
    const state = createSharedState({ externalDependencyNamespace: 'public' });
    const fake = fakeFactory(target, state);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-public-operator-dependency',
      writeEvidence: noOpEvidenceWriter(state),
    });

    expect(evidence).toMatchObject({
      cleanup: { status: 'CLEANUP_INCOMPLETE' },
      failure: { stage: 'CLEANUP_INCOMPLETE' },
      status: 'FAIL_CLOSED',
    });
    expect(state.publicOperatorStillPresent).toBe(true);
    expect(
      cleanupCalls(fake).some((call) => call.step.startsWith('CLEANUP_DROP_')),
    ).toBe(false);
  });

  it('fails closed on an unavailable exact-backend termination protocol and still attempts strict cleanup', async () => {
    const target = approvedTarget();
    const state = createSharedState({ permissionDenied: true });
    const fake = fakeFactory(target, state);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-ack-permission-denied',
      writeEvidence: noOpEvidenceWriter(state),
    });

    expect(evidence).toMatchObject({
      cleanup: { status: 'PASS' },
      failure: { stage: 'CRASH_PROTOCOL_UNAVAILABLE' },
      status: 'FAIL_CLOSED',
    });
    expect(state.cleanupCommitted).toBe(true);
    expect(cleanupCalls(fake).map((call) => call.step)).toContain(
      'CLEANUP_DROP_EXACT_SCHEMA_RESTRICT',
    );
  });

  it('fails closed when an allowlisted cleanup operation itself fails', async () => {
    const target = approvedTarget();
    const state = createSharedState({
      failAt: 'CLEANUP_DROP_EXACT_SCHEMA_RESTRICT',
    });
    const fake = fakeFactory(target, state);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-cleanup-failure',
      writeEvidence: noOpEvidenceWriter(state),
    });

    expect(evidence).toMatchObject({
      cleanup: { status: 'CLEANUP_INCOMPLETE' },
      failure: { stage: 'CLEANUP_INCOMPLETE' },
      status: 'FAIL_CLOSED',
    });
    expect(state.schemaExists).toBe(true);
    expect(state.durableWriteCalls).toBe(1);
  });

  it('reports durable-evidence failure after strict database cleanup rather than reporting success', async () => {
    const target = approvedTarget();
    const state = createSharedState();
    const fake = fakeFactory(target, state);

    const evidence = await runV09DedicatedStagingEvidence({
      approval: target,
      clientFactory: fake.factory,
      environment: approvedExecution(target),
      loadLinkedProjectRef: async () => undefined,
      loadMigrationChain: fakeMigrationChain,
      runId: 'run-evidence-write-failure',
      writeEvidence: async () => {
        state.durableWriteCalls += 1;
        throw new Error('simulated local evidence failure');
      },
    });

    expect(evidence).toMatchObject({
      cleanup: { status: 'PASS' },
      durable_evidence: { status: 'FAIL' },
      failure: { stage: 'DURABLE_EVIDENCE_WRITE_FAILED' },
      status: 'FAIL_CLOSED',
    });
    expect(state.cleanupCommitted).toBe(true);
    expect(state.durableWriteCalls).toBe(1);
  });

  it('writes redacted evidence with an atomic temp-and-rename local handoff', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'v09-evidence-'));
    const evidencePath = path.join(directory, 'owner-approved-evidence.json');
    try {
      await writeV09StagingEvidence({
        evidence: {
          database_url:
            'postgresql://runner:super-secret@db.example.invalid/postgres',
          nested: { password: 'super-secret' },
          status: 'PASS',
        },
        evidencePath,
      });

      const written = await readFile(evidencePath, 'utf8');
      expect(written).not.toContain('super-secret');
      expect(written).not.toContain('postgresql://');
      expect(JSON.parse(written)).toMatchObject({
        database_url: '[REDACTED]',
        durable_evidence: { status: 'PASS' },
        nested: { password: '[REDACTED]' },
      });
      expect(await readdir(directory)).toEqual([
        'owner-approved-evidence.json',
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
