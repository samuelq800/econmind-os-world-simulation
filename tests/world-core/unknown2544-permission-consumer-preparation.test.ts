/** Isolated consumer mechanics only. Reuses an existing TEST_ONLY principal;
 * none of these controls appoints a real user or closes an original B16 field. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  OFFICE_DEFINITIONS,
  authorizeOfficeCapability,
  countryId,
  officeId,
  parseCanonicalCommand,
  processQueuedCommand,
  teamId,
  worldId,
  type AuthorizationCapability,
  type AuthorizationResolver,
  type CanonicalCommand,
  type CommitAuthorizationProof,
} from '@econmind/core';
import { inspectB16PermissionConsumer } from '../../apps/world-worker/src/preparation/unknown2544-permission-consumer-preparation.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  sourceBytes,
  TEST_NOW,
} from '../support/current-authorization-preparation-fixture.js';
import { createV10CommitAuthorizationFixture } from '../support/v10-commit-authorization-fixture.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';

const inherited = createV10CommitAuthorizationFixture();
const principal = inherited.principal; // Existing fixture subject; not a new AuthSubject.
const WORLD = 'WORLD_AUTHZ_TEST_DEFAULT';
const COUNTRY = 'COUNTRY_01';
const TEAM = inherited.currentMembership()!.teamId;
const REVISION = inherited.initialAuthorizationVersion;
const database = createPGliteV09AtomicTestDatabase(); // RAM only, no DSN accepted.
const root = path.resolve(import.meta.dirname, '../..');
const target = (kind: string | null) => ({
  stableId: `U2544::${kind ? 'ENTITY' : 'COUNTRY'}::${kind ? `ENTITY_${kind}_01` : COUNTRY}::${kind ? 'currentPermission' : 'discretionaryAuthorization'}`,
  scope: kind ? 'ENTITY' : 'COUNTRY',
  ownerId: kind ? `ENTITY_${kind}_01` : COUNTRY,
  countryId: COUNTRY,
  missingField: kind ? 'currentPermission' : 'discretionaryAuthorization',
});
const originalInputPath = process.env.B16_ORIGINAL_INPUT_FILE;
const originalInput: {
  rows: ReturnType<typeof target>[];
  ledgerSha256: string;
} | null = originalInputPath
  ? JSON.parse(readFileSync(originalInputPath, 'utf8'))
  : null;
const originalTargets =
  originalInput?.rows ??
  [null, 'GOVERNMENT', 'OPERATOR', 'HOUSEHOLDS', 'BANK', 'CENTRAL_BANK'].map(
    target,
  );
const originalReads: object[] = [];
type Input = Parameters<typeof inspectB16PermissionConsumer>[0];
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');

// The existing Core resolver interface consumes real rows in this disposable
// database, not caller-selected membership/Office JSON. It is a TEST_ONLY
// adapter; production authentication/current-seat plumbing remains unchanged.
const resolver: AuthorizationResolver = {
  async resolveCurrentIdentity(candidate) {
    return candidate === principal ? principal.authSubject : null;
  },
  async resolveCurrentMembership(candidate, requestedWorld) {
    if (candidate !== principal || requestedWorld !== WORLD) return null;
    const { rows } = await database.query<{
      country_id: string;
      office_id: string;
      team_id: string;
      authorization_version: string;
    }>(
      'select distinct country_id,office_id,team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and active order by office_id',
      [WORLD, principal.authSubject],
    );
    const first = rows[0];
    if (
      !first ||
      rows.some(
        (row) =>
          row.country_id !== first.country_id ||
          row.team_id !== first.team_id ||
          row.authorization_version !== first.authorization_version,
      )
    )
      return null;
    return {
      authorizationVersion: first.authorization_version,
      authSubject: principal.authSubject,
      worldId: worldId(WORLD),
      teamId: teamId(first.team_id),
      countryId: countryId(first.country_id),
      officeAssignments: [
        ...new Set(rows.map((row) => officeId(row.office_id))),
      ],
      active: true,
      suspended: false,
      isWorldAdmin: false,
      negotiationPartyIds: [],
    };
  },
};
async function installTestAuthority(
  office = 'FINANCE',
  capability = 'FINANCE_BUDGET',
  revision: string = REVISION,
) {
  await database.query('delete from world_v2.current_commit_authorization');
  await database.query(
    'insert into world_v2.current_commit_authorization (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real) values ($1,$2::uuid,$3,$4,$5,$6,$7,true,$8)',
    [
      WORLD,
      principal.authSubject,
      COUNTRY,
      office,
      capability,
      TEAM,
      revision,
      TEST_NOW,
    ],
  );
}
function candidate(
  office = 'FINANCE',
  capability = 'FINANCE_BUDGET',
  revision: string = REVISION,
  version = '0',
) {
  const source = sourceBytes(revision, null, [], {
    worldId: WORLD,
    countryId: COUNTRY,
    authSubject: principal.authSubject,
    teamId: TEAM,
    expectedWorldVersion: version,
    grants: [{ officeId: office, capability }],
  });
  return {
    target: target(null),
    rawBytes: source.rawBytes,
    expectedSha256: source.expectedSha256,
    observedAtReal: TEST_NOW,
    expected: {
      worldId: WORLD,
      worldVersion: version,
      countryId: COUNTRY,
      authSubject: principal.authSubject,
      teamId: TEAM,
      officeId: office,
      capability,
      authorizationRevision: revision,
    },
  };
}
async function issueContext(
  office: string,
  capability: AuthorizationCapability,
) {
  return authorizeOfficeCapability({
    principal,
    resolver,
    worldId: worldId(WORLD),
    requestedCountryId: countryId(COUNTRY),
    requestedOfficeId: officeId(office),
    capability,
  });
}
async function attempt(
  office = 'FINANCE',
  capability: AuthorizationCapability = 'FINANCE_BUDGET',
  revision: string = REVISION,
  version = '0',
) {
  const issuedContext = await issueContext(office, capability);
  const existing = inherited.command;
  const command = parseCanonicalCommand(
    {
      actorId: existing.actorId,
      authSubject: existing.authSubject,
      commandId: existing.commandId,
      correlationId: existing.correlationId,
      idempotencyKey: existing.idempotencyKey,
      schemaVersion: existing.schemaVersion,
      simTime: existing.simTime.toCanonicalValue(),
      submittedAtReal: existing.submittedAtReal,
      commandType: 'TEST_ONLY_B16_PERMISSION_PROBE',
      payload: { purpose: 'AUTHORITY_DIAGNOSTIC_NO_ECONOMIC_COMMIT' },
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: office,
      expectedWorldVersion: version,
    },
    digest,
  );
  const stop = new Error('B16_TEST_ONLY_PROOF_CAPTURE_NO_COMMIT');
  let proof: CommitAuthorizationProof | null = null;
  try {
    await processQueuedCommand({
      command,
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: command.simTime,
      recordedAtReal: TEST_NOW,
      requiredCapability: capability,
      intakeAuthorization: issuedContext,
      persistence: {
        async readFinalReceipt() {
          return null;
        },
        async recordZeroEffectReceipt() {
          throw new Error('UNEXPECTED_ZERO_EFFECT');
        },
        async commitAuthorizedCommand(input) {
          proof = input.commitAuthorization;
          throw stop;
        },
      },
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (proof === null) throw new Error('CORE_PROOF_NOT_CAPTURED');
  return {
    candidate: candidate(office, capability, revision, version),
    issuedContext,
    commitAttempt: { command, proof },
    transaction: null,
  } satisfies Input;
}
const probe = (input: Omit<Input, 'transaction'>, transaction?: SqlExecutor) =>
  transaction
    ? inspectB16PermissionConsumer({ ...input, transaction })
    : database.transaction((tx) =>
        inspectB16PermissionConsumer({ ...input, transaction: tx }),
      );
function notOriginalPermission(
  value: Awaited<ReturnType<typeof inspectB16PermissionConsumer>>,
) {
  expect(value).toMatchObject({
    originalFieldStatus: 'UNKNOWN',
    originalFieldValue: null,
    permissionGranted: false,
    currentnessVerified: false,
    sourceAdmitted: false,
    productionAuthority: false,
    runtimeConnected: false,
    actualRosterBinding: null,
    actualEntityScopeBinding: null,
    authoritativeCommitPerformed: false,
    originalFieldClosure: false,
    entityOfficeAssignment: null,
  });
  for (const name of [
    'principal',
    'authorization',
    'commitProof',
    'resolver',
    'grants',
  ])
    expect(value).not.toHaveProperty(name);
}
beforeAll(async () => {
  expect(database.kind).toBe('PGLITE');
  expect(database.supportsParallelTransactions).toBe(false);
  for (const file of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0003_world_v2_command_receipts_outbox.sql',
    '0011_world_v2_current_commit_authorization.sql',
  ])
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', file),
        'utf8',
      ),
    );
  await database.query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [WORLD],
  );
});
beforeEach(async () => {
  await database.query(
    'update world_v2.world_head set world_version=0 where world_id=$1',
    [WORLD],
  );
  await installTestAuthority();
});
afterEach(async () => {
  const { rows } = await database.query<{
    commands: string;
    events: string;
    receipts: string;
  }>(
    'select (select count(*)::text from world_v2.command_submission) as commands,(select count(*)::text from world_v2.authoritative_event) as events,(select count(*)::text from world_v2.command_receipt) as receipts',
  );
  expect(rows[0]).toEqual({ commands: '0', events: '0', receipts: '0' });
});
afterAll(async () => {
  await database.close();
  console.info(
    'B16_ORIGINAL_SUBSET_CONSUMER_READ',
    JSON.stringify({
      parentBatch: 'B16',
      parentBatchCount: 420,
      subsetCount: 6,
      inputKind: originalInput
        ? 'ORIGINAL_PINNED_LEDGER_ROWS'
        : 'TEST_ONLY_CANONICAL_TARGETS',
      ledgerSha256: originalInput?.ledgerSha256 ?? null,
      rows: originalReads,
      actualClosures: 0,
      database: 'PGLITE_DISPOSABLE_CLOSED',
      economicWrites: 0,
    }),
  );
});

describe('B16 COUNTRY01 isolated existing-chain consumer, not actual permission', () => {
  it.each(originalTargets)(
    'reads $stableId without inventing an assignment',
    async (row) => {
      const value = await inspectB16PermissionConsumer({
        candidate: {
          target: row,
          rawBytes: null,
          expectedSha256: null,
          expected: null,
          observedAtReal: TEST_NOW,
        },
        issuedContext: null,
        transaction: null,
        commitAttempt: null,
      });
      notOriginalPermission(value);
      expect(value.consumerObservation).toBe('ACTUAL_BINDING_ABSENT');
      originalReads.push({
        stableId: value.stableId,
        actualValue: value.originalFieldValue,
        status: 'BLOCKED_ACTUAL_ROSTER_ENTITY_SCOPE_WORLD_HEAD_NOT_ADOPTED',
        consumerObservation: value.consumerObservation,
        realAuthSubject: null,
        actualWorldId: null,
        actualWorldVersion: null,
        actualTeamId: null,
        sourceAdoption: null,
      });
    },
  );
  const pairs = Object.entries(OFFICE_DEFINITIONS).flatMap(([office, def]) =>
    def.capabilities.map((capability) => ({ office, capability })),
  );
  it.each(pairs)(
    'reuses $office/$capability through real local SQL and fixed cutoff guard',
    async ({ office, capability }) => {
      await installTestAuthority(office, capability);
      const input = await attempt(office, capability);
      const value = await probe(input);
      notOriginalPermission(value);
      expect(value.consumerObservation).toBe(
        'ISOLATED_GUARD_RECHECKED_NOT_ORIGINAL_PERMISSION',
      );
    },
  );
  it('does not turn caller-shaped context/source JSON into a server-issued context', async () => {
    const input = await attempt();
    const value = await probe({
      ...input,
      issuedContext: { ...input.issuedContext },
    });
    notOriginalPermission(value);
    expect(value.consumerObservation).toBe('CONTEXT_NOT_SERVER_ISSUED');
  });
  it('refuses a genuine but different existing World/country/Office context', async () => {
    const input = await attempt();
    const value = await probe({
      ...input,
      issuedContext: await inherited.issueAuthorization(),
    });
    notOriginalPermission(value);
    expect(value.consumerObservation).toBe('CONTEXT_SCOPE_CHANGED');
  });
  it('re-resolves a revoked membership instead of trusting the prior issued context', async () => {
    const input = await attempt();
    await database.query(
      'update world_v2.current_commit_authorization set active=false',
    );
    const value = await probe(input);
    notOriginalPermission(value);
    expect(value.consumerObservation).toBe('CURRENT_AUTHORIZATION_DENIED');
  });
  it('requires a fresh revision/context/proof after an authorization change', async () => {
    const old = await attempt();
    const revision = 'TEST_ONLY_B16_REVISED';
    await installTestAuthority('FINANCE', 'FINANCE_BUDGET', revision);
    expect((await probe(old)).consumerObservation).toBe(
      'CONTEXT_SCOPE_CHANGED',
    );
    const fresh = await attempt('FINANCE', 'FINANCE_BUDGET', revision);
    const value = await probe(fresh);
    notOriginalPermission(value);
    expect(value.consumerObservation).toBe(
      'ISOLATED_GUARD_RECHECKED_NOT_ORIGINAL_PERMISSION',
    );
  });
  it.each([
    [
      'revocation',
      'update world_v2.current_commit_authorization set active=false',
    ],
    [
      'revision',
      "update world_v2.current_commit_authorization set authorization_version='TEST_ONLY_CUTOFF_CHANGED'",
    ],
    [
      'team',
      "update world_v2.current_commit_authorization set team_id='TEAM_TEST_ONLY_CHANGED'",
    ],
    [
      'capability',
      "update world_v2.current_commit_authorization set capability='FINANCE_TREASURY'",
    ],
  ])(
    'fixed SQL guard refuses %s after Core re-read but before cutoff',
    async (_name, mutation) => {
      const input = await attempt();
      let cutoffQueries = 0;
      const value = await database.transaction(async (tx) => {
        const instrumented: SqlExecutor = {
          async query<Row extends object>(
            sql: string,
            values?: readonly unknown[],
          ) {
            const answer = await tx.query<Row>(sql, values);
            if (sql.includes('from world_v2.world_head'))
              await tx.query(mutation);
            if (sql.includes('for key share')) cutoffQueries++;
            return answer;
          },
        };
        return probe(input, instrumented);
      });
      notOriginalPermission(value);
      expect(cutoffQueries).toBe(1);
      expect(value.consumerObservation).toBe('CURRENT_AUTHORIZATION_DENIED');
    },
  );
  it('refuses stale head and only rechecks a fresh explicit retry, without queue/event/receipt', async () => {
    const old = await attempt();
    await database.query(
      'update world_v2.world_head set world_version=1 where world_id=$1',
      [WORLD],
    );
    const rejected = await probe(old);
    notOriginalPermission(rejected);
    expect(rejected.consumerObservation).toBe('HEAD_ABSENT_OR_CHANGED');
    const fresh = await attempt('FINANCE', 'FINANCE_BUDGET', REVISION, '1');
    const first = await probe(fresh),
      retry = await probe(fresh);
    expect(retry).toEqual(first);
    notOriginalPermission(retry);
    expect(retry.consumerObservation).toBe(
      'ISOLATED_GUARD_RECHECKED_NOT_ORIGINAL_PERMISSION',
    );
  });
  it('does not accept a mismatched command head even with a genuine proof/context', async () => {
    const input = await attempt();
    const command = {
      ...input.commitAttempt.command,
      expectedWorldVersion: '1',
    } as CanonicalCommand;
    const value = await probe({
      ...input,
      commitAttempt: { ...input.commitAttempt, command },
    });
    notOriginalPermission(value);
    expect(value.consumerObservation).toBe('COMMIT_SCOPE_CHANGED');
  });
  it('does not translate an unavailable SQL connection into denial, current authority or PASS', async () => {
    const input = await attempt();
    const transaction: SqlExecutor = {
      async query() {
        throw new Error('TEST_ONLY_SQL_UNAVAILABLE');
      },
    };
    await expect(probe(input, transaction)).rejects.toThrow(
      'TEST_ONLY_SQL_UNAVAILABLE',
    );
  });
});
