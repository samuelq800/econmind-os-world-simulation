// TEST_ONLY serial embedded SQL. No real source admission or native lock proof.
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SimTime,
  authSubject,
  authorizeOfficeCapability,
  countryId,
  officeId,
  processQueuedCommand,
  teamId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationResolver,
  type CanonicalCommand,
  type CommandLifecyclePersistencePort,
  type CommitAuthorizationProof,
} from '@econmind/core';
import {
  createOfficeOperatingSourceCommitProtectionPort,
  type OfficeOperatingSourceBinding,
  type OfficeOperatingSourceCommitRequest,
  type OfficeOperatingSourceCustodyPort,
  type OfficeOperatingSourceCustodyScope,
  type OfficeOperatingSourceProtectedScope,
} from '../../apps/world-worker/src/persistence/office-operating-source-commit-protection.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { captainTestOnlyCommand } from '../support/g-dispatch-captain-test-only-fixture.js';

const databases: PGlite[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) await database.close();
});
const sourceBinding: Readonly<OfficeOperatingSourceBinding> = Object.freeze({
  sourceId: 'TEST_ONLY_ORIGINALS_NOT_ADMISSION',
  sourceRevision: 'SOURCE_REV_1',
  currentnessRevision: 'RESTRICTION_REV_1',
  contentHash: `sha256:${createHash('sha256').update('TEST_ONLY inert source bytes').digest('hex')}`,
});

async function proofFor(
  command: CanonicalCommand,
): Promise<CommitAuthorizationProof> {
  const subject = authSubject(command.authSubject),
    world = worldId(command.worldId),
    country = countryId(command.countryId),
    office = officeId(command.officeId!);
  const capability =
    office === 'CAPTAIN' ? 'CAPTAIN_CABINET' : 'FINANCE_BUDGET';
  const principal: AuthenticatedPrincipal = Object.freeze({
    authSubject: subject,
    facts: {
      user_id: subject,
      display_name: 'TEST_ONLY currentness',
      school_id: null,
    },
    token: {
      subject,
      issuer: 'https://test.invalid',
      audience: 'test-only',
      issuedAt: command.submittedAtReal,
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  });
  const resolver: AuthorizationResolver = {
    async resolveCurrentIdentity() {
      return subject;
    },
    async resolveCurrentMembership() {
      return {
        active: true,
        authorizationVersion: 'AUTH_REV_1',
        authSubject: subject,
        countryId: country,
        isWorldAdmin: false,
        negotiationPartyIds: [],
        officeAssignments: [office],
        suspended: false,
        teamId: teamId('TEAM_TEST_ONLY'),
        worldId: world,
      };
    },
  };
  let proof: CommitAuthorizationProof | null = null;
  const stop = new Error('CAPTURE_GENUINE_CORE_PROOF');
  const persistence: CommandLifecyclePersistencePort = {
    async readFinalReceipt() {
      return null;
    },
    async recordZeroEffectReceipt() {
      throw new Error('unexpected revoked proof');
    },
    async commitAuthorizedCommand(request) {
      proof = request.commitAuthorization;
      throw stop;
    },
  };
  try {
    await processQueuedCommand({
      command,
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: SimTime.fromTicks(command.simTime.toCanonicalValue()),
      recordedAtReal: command.submittedAtReal,
      requiredCapability: capability,
      intakeAuthorization: await authorizeOfficeCapability({
        capability,
        principal,
        requestedCountryId: country,
        requestedOfficeId: office,
        resolver,
        worldId: world,
      }),
      persistence,
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (proof === null) throw new Error('genuine proof missing');
  return proof;
}

async function fixture(office: 'CAPTAIN' | 'FINANCE' = 'CAPTAIN') {
  const command = captainTestOnlyCommand(
    office === 'CAPTAIN'
      ? {}
      : {
          commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          officeId: 'FINANCE',
          payload: { testOnly: 'CURRENTNESS_MECHANISM_NOT_BUDGET_EXECUTION' },
        },
  );
  const proof = await proofFor(command);
  const db = new PGlite();
  databases.push(db);
  // Minimal isolated mechanism schema only. This is neither the production
  // migration chain nor a domain source/admission or authoritative amount.
  await db.exec(`create schema world_v2;
    create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
    create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,capability text,team_id text,authorization_version text,active boolean);
    create table world_v2.test_only_current_source(world_id text,country_id text,office_id text,source_id text,source_revision text,currentness_revision text,content_hash text);
    create table world_v2.test_only_effect(marker text primary key);`);
  await db.query('insert into world_v2.world_head values($1,0,0)', [
    command.worldId,
  ]);
  await db.query(
    'insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,$4,$5,$6,$7,true)',
    [
      command.worldId,
      command.authSubject,
      command.countryId,
      office,
      proof.capability,
      proof.teamId,
      proof.authorizationVersion,
    ],
  );
  await db.query(
    'insert into world_v2.test_only_current_source values($1,$2,$3,$4,$5,$6,$7)',
    [
      command.worldId,
      command.countryId,
      office,
      sourceBinding.sourceId,
      sourceBinding.sourceRevision,
      sourceBinding.currentnessRevision,
      sourceBinding.contentHash,
    ],
  );
  const calls: string[] = [];
  const port: OfficeOperatingSourceCustodyPort = {
    async withCurrentFrom(executor, request, consume) {
      const readCurrentBinding =
        async (): Promise<OfficeOperatingSourceBinding | null> => {
          const result = await executor.query<{
            source_id: string;
            source_revision: string;
            currentness_revision: string;
            content_hash: `sha256:${string}`;
          }>(
            'select source_id,source_revision,currentness_revision,content_hash from world_v2.test_only_current_source where world_id=$1 and country_id=$2 and office_id=$3 for share',
            [
              request.command.worldId,
              request.command.countryId,
              request.command.officeId,
            ],
          );
          if (result.rows.length !== 1) return null;
          const row = result.rows[0]!;
          return {
            sourceId: row.source_id,
            sourceRevision: row.source_revision,
            currentnessRevision: row.currentness_revision,
            contentHash: row.content_hash,
          };
        };
      const current = await readCurrentBinding();
      if (!current) throw new Error('TEST_ONLY source absent');
      return consume({ executor, binding: current, readCurrentBinding });
    },
  };
  const guard = createOfficeOperatingSourceCommitProtectionPort({
    captain: port,
    finance: port,
  });
  const request: OfficeOperatingSourceCommitRequest = {
    command,
    commitAuthorization: proof,
    currentHead: {
      worldId: command.worldId,
      worldVersion: '0',
      eventSequence: '0',
    },
    observedAtReal: command.submittedAtReal,
    expectedSourceBinding: sourceBinding,
  };
  async function transaction<Result>(
    operation: (executor: SqlExecutor) => Promise<Result>,
  ): Promise<Result> {
    return db.transaction(async (tx) => {
      const executor: SqlExecutor = {
        async query<Row extends object>(
          sql: string,
          params: readonly unknown[] = [],
        ) {
          calls.push(sql);
          const result = await tx.query<Row>(sql, [...params]);
          return { rows: result.rows, rowCount: result.rows.length };
        },
      };
      return operation(executor);
    });
  }
  const run = (
    consume: (
      scope: Readonly<OfficeOperatingSourceProtectedScope>,
    ) => Promise<unknown>,
    input = request,
  ) =>
    transaction((executor) => guard.withCurrentFrom(executor, input, consume));
  return { db, command, proof, request, guard, port, calls, transaction, run };
}

describe('server-only Captain/Finance source commit currentness', () => {
  it.each(['CAPTAIN', 'FINANCE'] as const)(
    'holds H/A/source scope for %s without certifying admission',
    async (office) => {
      const f = await fixture(office);
      const result = await f.run(async (scope) => {
        f.calls.push('CONSUME');
        expect(scope.status).toBe('CURRENTNESS_ONLY_NOT_SOURCE_ADMISSION');
        await scope.assertCurrent();
        return 'same callback result';
      });
      expect(result).toBe('same callback result');
      expect(f.calls[0]).toMatch(/world_head.*for share/u);
      expect(f.calls[1]).toMatch(/current_commit_authorization.*for share/u);
      const source = f.calls.findIndex((call) =>
        /test_only_current_source.*for share/u.test(call),
      );
      expect(source).toBeGreaterThan(1);
      expect(source).toBeLessThan(f.calls.indexOf('CONSUME'));
      expect(
        f.calls.some((call) =>
          /^(?:insert|update|delete|begin|commit|rollback)\b/iu.test(call),
        ),
      ).toBe(false);
    },
  );
  it.each([
    'active=false',
    "authorization_version='AUTH_REV_2'",
    "team_id='OTHER_TEAM'",
    "office_id='OTHER_OFFICE'",
    "capability='OTHER_CAPABILITY'",
  ])(
    'denies current role mutation %s before source callback',
    async (change) => {
      const f = await fixture();
      await f.db.exec(
        `update world_v2.current_commit_authorization set ${change}`,
      );
      await expect(
        f.run(async () => {
          throw new Error('must not consume');
        }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
      expect(
        f.calls.some((call) => call.includes('test_only_current_source')),
      ).toBe(false);
    },
  );
  it.each([
    "source_revision='SOURCE_REV_2'",
    "currentness_revision='WITHDRAWAL_REV_2'",
    `content_hash='sha256:${'a'.repeat(64)}'`,
  ])(
    'same-head source mutation %s rolls back all callback effects',
    async (change) => {
      const f = await fixture();
      await expect(
        f.run(async (scope) => {
          await scope.executor.query(
            "insert into world_v2.test_only_effect values('effect')",
          );
          await scope.executor.query(
            `update world_v2.test_only_current_source set ${change}`,
          );
        }),
      ).rejects.toThrow('source changed');
      expect(
        (await f.db.query('select * from world_v2.test_only_effect')).rows,
      ).toEqual([]);
      expect(
        (
          await f.db.query(
            'select world_version::text from world_v2.world_head',
          )
        ).rows,
      ).toEqual([{ world_version: '0' }]);
    },
  );
  it('rechecks same-head revocation after callback and rolls back its effects', async () => {
    const f = await fixture();
    await expect(
      f.run(async (scope) => {
        await scope.executor.query(
          "insert into world_v2.test_only_effect values('effect')",
        );
        await scope.executor.query(
          'update world_v2.current_commit_authorization set active=false',
        );
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(
      (await f.db.query('select * from world_v2.test_only_effect')).rows,
    ).toEqual([]);
  });
  it('rejects a changed World head before invoking custody', async () => {
    const f = await fixture();
    await f.db.exec('update world_v2.world_head set world_version=1');
    await expect(f.run(async () => undefined)).rejects.toMatchObject({
      code: 'VERSION_MISMATCH',
    });
    expect(f.calls).toHaveLength(1);
  });
  it('does not mistake the authoritative callback head advance for source revocation', async () => {
    const f = await fixture();
    await expect(
      f.run(async (scope) => {
        await scope.executor.query(
          'update world_v2.world_head set world_version=1,event_sequence=1',
        );
        return 'effect';
      }),
    ).resolves.toBe('effect');
  });
  it('expires escaped callback methods and preserves callback failure without retry', async () => {
    const f = await fixture();
    let escaped: OfficeOperatingSourceProtectedScope | undefined;
    let callbacks = 0;
    await expect(
      f.run(async (scope) => {
        escaped = scope;
        callbacks++;
        throw new Error('actual consumer failure');
      }),
    ).rejects.toThrow('actual consumer failure');
    const before = f.calls.length;
    await expect(escaped!.assertCurrent()).rejects.toThrow(
      'ended callback scope',
    );
    expect(f.calls).toHaveLength(before);
    expect(callbacks).toBe(1);
    // A new caller-owned retry has no extra source-side state or dedupe truth.
    await expect(f.run(async () => 'retry')).resolves.toBe('retry');
    expect(
      (await f.db.query('select * from world_v2.test_only_effect')).rows,
    ).toEqual([]);
  });
  it('refuses copied proof flags, unconfigured source and Social family before SQL', async () => {
    const f = await fixture();
    await expect(
      f.run(async () => undefined, {
        ...f.request,
        commitAuthorization: { ...f.proof },
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    const unavailable = createOfficeOperatingSourceCommitProtectionPort({
      captain: null,
      finance: null,
    });
    await expect(
      f.transaction((tx) =>
        unavailable.withCurrentFrom(tx, f.request, async () => undefined),
      ),
    ).rejects.toThrow('unavailable');
    await expect(
      f.run(async () => undefined, {
        ...f.request,
        command: captainTestOnlyCommand({
          commandType: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
          officeId: 'SOCIAL',
        }),
      }),
    ).rejects.toThrow('Social keeps its original guard');
    expect(f.calls).toEqual([]);
  });
  it('captures detached expected binding before asynchronous custody work', async () => {
    const f = await fixture();
    const mutable = { ...sourceBinding };
    const driver: OfficeOperatingSourceCustodyPort = {
      async withCurrentFrom(tx, request, consume) {
        mutable.sourceRevision = 'CLIENT_CHANGED';
        return f.port.withCurrentFrom(tx, request, consume);
      },
    };
    const guard = createOfficeOperatingSourceCommitProtectionPort({
      captain: driver,
      finance: null,
    });
    await expect(
      f.transaction((tx) =>
        guard.withCurrentFrom(
          tx,
          { ...f.request, expectedSourceBinding: mutable },
          async () => 'captured',
        ),
      ),
    ).resolves.toBe('captured');
  });
  it('refuses a custody callback bound to another executor', async () => {
    const f = await fixture();
    const driver: OfficeOperatingSourceCustodyPort = {
      async withCurrentFrom(tx, request, consume) {
        return f.port.withCurrentFrom(tx, request, (scope) =>
          consume({ ...scope, executor: { query: tx.query.bind(tx) } }),
        );
      },
    };
    const guard = createOfficeOperatingSourceCommitProtectionPort({
      captain: driver,
      finance: null,
    });
    await expect(
      f.transaction((tx) =>
        guard.withCurrentFrom(tx, f.request, async () => 'unreachable'),
      ),
    ).rejects.toThrow('executor/source binding mismatch');
  });
  it('does not accept skipped callback, substituted result or swallowed consumer error', async () => {
    const f = await fixture();
    const skipped = {
      async withCurrentFrom() {
        return undefined;
      },
    } as OfficeOperatingSourceCustodyPort;
    await expect(
      f.transaction((tx) =>
        createOfficeOperatingSourceCommitProtectionPort({
          captain: skipped,
          finance: null,
        }).withCurrentFrom(tx, f.request, async () => undefined),
      ),
    ).rejects.toThrow('must await');
    const substituted: OfficeOperatingSourceCustodyPort = {
      async withCurrentFrom<Result>(
        tx: SqlExecutor,
        request: Readonly<OfficeOperatingSourceCommitRequest>,
        consume: (
          scope: Readonly<OfficeOperatingSourceCustodyScope>,
        ) => Promise<Result>,
      ) {
        await f.port.withCurrentFrom(tx, request, consume);
        return 'substituted' as Result;
      },
    };
    await expect(
      f.transaction((tx) =>
        createOfficeOperatingSourceCommitProtectionPort({
          captain: substituted,
          finance: null,
        }).withCurrentFrom(tx, f.request, async () => 'original'),
      ),
    ).rejects.toThrow('must await');
    const swallowed: OfficeOperatingSourceCustodyPort = {
      async withCurrentFrom<Result>(
        tx: SqlExecutor,
        request: Readonly<OfficeOperatingSourceCommitRequest>,
        consume: (
          scope: Readonly<OfficeOperatingSourceCustodyScope>,
        ) => Promise<Result>,
      ) {
        try {
          return await f.port.withCurrentFrom(tx, request, consume);
        } catch {
          return undefined as Result;
        }
      },
    };
    await expect(
      f.transaction((tx) =>
        createOfficeOperatingSourceCommitProtectionPort({
          captain: swallowed,
          finance: null,
        }).withCurrentFrom(tx, f.request, async () => {
          throw new Error('consumer failed');
        }),
      ),
    ).rejects.toThrow('consumer failed');
  });
});
