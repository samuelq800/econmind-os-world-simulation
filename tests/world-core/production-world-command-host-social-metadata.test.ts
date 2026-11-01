/** TEST_ONLY Host routing protocol, not SQL/source/admission acceptance. The
 * identity predicate double isolates this branch; the real installer's private
 * instance/prepared-slot issuance is covered by its separate owner tests. */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  canonicalSerialize,
  parseCanonicalCommand,
  COMMAND_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  type CanonicalCommand,
} from '@econmind/core';
import type { FinanceSocialSourceBinding } from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPostgresFinanceBudgetCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import {
  createRegisteredWorldExecutionClock,
  createRegisteredWorldExecutionDatabase,
  WORLD_EXECUTION_STATE_QUERY,
} from '../../apps/world-worker/src/time/registered-world-execution-state.js';
import { MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY } from '../../apps/world-worker/src/persistence/manual-office-authorization-sql.js';
import type { PostwarSocialRuntimeConnection } from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
const identities = vi.hoisted(
  () => new WeakMap<object, { world: string; ready: boolean }>(),
);
const sharedIdentities = vi.hoisted(
  () => new WeakMap<object, Record<string, unknown>>(),
);
vi.mock(
  '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js',
  () => ({
    readFinanceSocialSourceBinding(value: object) {
      const found = sharedIdentities.get(value);
      if (!found) throw Error('GENUINE_FINANCE_SOCIAL_SOURCE_BINDING_REQUIRED');
      return found;
    },
  }),
);
vi.mock(
  '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js',
  () => ({
    isPostwarSocialRuntimeConnection: (v: unknown, world: string) =>
      !!v && typeof v === 'object' && identities.get(v)?.world === world,
    isPreparedPostwarSocialRuntimeConnection: (v: unknown, world: string) =>
      !!v &&
      typeof v === 'object' &&
      identities.get(v)?.world === world &&
      identities.get(v)?.ready === true,
  }),
);
import {
  createServerCommandHostBinding,
  createProductionWorldCommandHost,
  preflightProductionManualIntakeRuntime,
  WorkerRequestCompletion,
  type ServerCommandHostDependencies,
} from '../../apps/world-worker/src/runtime-preparation/production-world-command-host.js';
import { POSTWAR_PROJECTION_SEATS_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
const world = 'WORLD_HOST_SOCIAL_METADATA',
  subject = '11111111-1111-4111-8111-111111111111';
function fixture(
  ready = true,
  patch: Record<string, string> = {},
  office: 'SOCIAL' | 'FINANCE' | 'CAPTAIN' = 'SOCIAL',
) {
  const connection = Object.freeze(
    {},
  ) as Readonly<PostwarSocialRuntimeConnection>;
  identities.set(connection, { world, ready });
  const statements: string[] = [],
    release = vi.fn(),
    sourceConnect = vi.fn(async () => {
      throw Error('LEGACY_SOURCE_PORT_SELECTED');
    }),
    query = vi.fn(async (sql: string) => {
      statements.push(sql);
      const rows =
        sql === POSTWAR_PROJECTION_SEATS_QUERY
          ? [
              {
                world_id: world,
                country_id: 'COUNTRY_01',
                office_id: office,
                auth_subject: subject,
                team_id: 'TEAM_METADATA',
                authorization_revision: 'REV_1',
                scope_key:
                  'OFFICE_434F554E5452595F3031_' +
                  Buffer.from(office).toString('hex').toUpperCase(),
                seat_ref: 'SEAT_METADATA',
                seed_id: 'SEED_METADATA',
                seed_fingerprint: 'sha256:' + 'a'.repeat(64),
                admission_ref: 'ADMISSION_METADATA',
                model_version: 'world-v2-foundation-1',
                replay_binding: 'TEST_ONLY_METADATA',
                source_bundle_sha256: 'b'.repeat(64),
                world_version: '3',
                event_sequence: '3',
                ...patch,
              },
            ]
          : sql.includes('as publisher_member')
            ? [
                {
                  role_name: 'host_bounded_reader',
                  subject,
                  read_only: 'on',
                  isolation: 'repeatable read',
                  unsafe_role: false,
                  publisher_member: false,
                },
              ]
            : [];
      return { rows, rowCount: rows.length };
    }),
    client = { query, release } as unknown as PoolClient,
    metadataConnect = vi.fn(async () => client),
    workerQuery = vi.fn(async () => {
      throw Error('DOWNSTREAM_AUTHORIZATION_STILL_REQUIRED');
    });
  const domainRead = vi.fn(async () => {
    throw Error('NO_DOMAIN_SOURCE_EXPECTED');
  });
  const dependencies: ServerCommandHostDependencies = {
    worldId: world,
    workerId: 'WORKER_METADATA',
    seedRef: 'SEED_METADATA',
    contentHash: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_METADATA',
    modelVersion: 'world-v2-foundation-1',
    intakePool: { connect: vi.fn() },
    sourcePool: { connect: sourceConnect },
    readerRole: 'host_offline_reader',
    authorizationPublisherRole: 'host_auth_publisher',
    socialRuntimeConnection: connection,
    socialMetadataRead: {
      pool: { connect: metadataConnect },
      readerRole: 'host_bounded_reader',
    },
    workerDatabase: {
      query: workerQuery,
      transaction: vi.fn(async () => {
        throw Error('NO_TRANSACTION');
      }),
    },
    clock: Object.freeze({
      nowReal: () => '2026-10-29T00:00:00.000Z',
      simTime: async () => '0',
    }),
    resolveActorId: async () => null,
    // A source token must not turn this unrelated reader into Social authority.
    readers: {
      captain: {
        read: domainRead,
      },
    },
  };
  const command = {
    worldId: world,
    countryId: 'COUNTRY_01',
    officeId: office,
    authSubject: subject,
    commandType:
      office === 'SOCIAL'
        ? 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'
        : office === 'FINANCE'
          ? 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'
          : 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
    expectedWorldVersion: '3',
  } as CanonicalCommand;
  const open = (d = dependencies, c = command) => {
    const binding = createServerCommandHostBinding(d);
    if (d.sharedSourceBinding && sharedIdentities.has(d.sharedSourceBinding))
      sharedIdentities.set(d.sharedSourceBinding, {
        ...sharedIdentities.get(d.sharedSourceBinding),
        formalBinding: binding,
      });
    const host = createProductionWorldCommandHost(binding),
      controller = new AbortController(),
      runtime = host.openIntakeRequest({
        route: '/v1/office-command',
        signal: controller.signal,
      })!;
    return {
      host,
      controller,
      preflight: () =>
        preflightProductionManualIntakeRuntime(
          runtime,
          c,
          '2026-10-29T00:00:00.000Z',
        ),
    };
  };
  return {
    dependencies,
    connection,
    open,
    sourceConnect,
    metadataConnect,
    workerQuery,
    domainRead,
    command,
    statements,
    release,
    client,
    query,
  };
}

/** Actual fixed Clock/capacity constructors, with explicit test-only SQL rows
 * and a shared-issuer identity double. No native registration/admission or
 * domain facts are fabricated; successful metadata still cannot authorize. */
function formalFixture(
  f: ReturnType<typeof fixture>,
  shared = true,
  allowAuthorization = false,
) {
  const registrationQueries: string[] = [],
    authorizationQueries: string[] = [];
  const registrationText = canonicalSerialize({
    schemaVersion: 'world-command-execution-registration-v1',
    registrationRef: 'REGISTRATION_METADATA_TEST_ONLY',
    worldId: world,
    workerId: 'WORKER_METADATA',
    seedId: 'SEED_METADATA',
    seedFingerprint: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_METADATA',
    modelVersion: 'world-v2-foundation-1',
    consumerRole: 'host_worker',
    controlMode: 'MANUAL_FINITE',
    clockSourceRef: 'CLOCK_SOURCE_METADATA_TEST_ONLY',
    clockSourceSha256: 'c'.repeat(64),
    controlSourceRef: 'CONTROL_SOURCE_METADATA_TEST_ONLY',
    controlSourceSha256: 'd'.repeat(64),
    soleConsumerRef: 'SOLE_METADATA_TEST_ONLY',
    clockVersion: 'SIMULATION_CLOCK_V1',
    simTime: '0',
    validFromReal: '2026-01-01T00:00:00.000Z',
    validUntilReal: '2027-01-01T00:00:00.000Z',
  });
  const registrationExecutor: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      registrationQueries.push(sql);
      if (sql !== WORLD_EXECUTION_STATE_QUERY)
        throw Error('UNEXPECTED_REGISTRATION_SQL');
      return {
        rows: [
          {
            registration_text: registrationText,
            registration_sha256: createHash('sha256')
              .update(registrationText)
              .digest('hex'),
          },
        ] as Row[],
        rowCount: 1,
      };
    },
  };
  const database: SqlDatabase = {
    async query<Row extends object>(sql: string) {
      authorizationQueries.push(sql);
      if (!allowAuthorization)
        throw Error('DOWNSTREAM_AUTHORIZATION_STILL_REQUIRED');
      if (sql !== MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY)
        throw Error('UNEXPECTED_AUTHORIZATION_SQL');
      return {
        rows: [
          { team_id: 'TEAM_METADATA', authorization_version: 'REV_1' },
        ] as Row[],
        rowCount: 1,
      };
    },
    transaction: async (run) => run(registrationExecutor),
  };
  const clock = createRegisteredWorldExecutionClock({
    database,
    worldId: world,
    workerId: 'WORKER_METADATA',
    registrationRef: 'REGISTRATION_METADATA_TEST_ONLY',
  });
  const pins = {
    seedId: 'SEED_METADATA',
    seedFingerprint: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_METADATA',
    modelVersion: 'world-v2-foundation-1',
  };
  const dependencies: ServerCommandHostDependencies = {
    ...f.dependencies,
    clock,
    workerDatabase: shared
      ? database
      : createRegisteredWorldExecutionDatabase(database, clock, pins),
    financeCapacitySource: createPostgresFinanceBudgetCapacitySource({
      worldId: world,
      countryId: 'COUNTRY_01',
    }),
    resolveActorId: async () => 'ACTOR_METADATA',
  };
  if (shared) {
    const token = Object.freeze({}) as FinanceSocialSourceBinding;
    sharedIdentities.set(token, {
      formalBinding: null,
      worldId: world,
      workerId: 'WORKER_METADATA',
      database,
      clock,
      socialConnection: f.connection,
    });
    return {
      dependencies: { ...dependencies, sharedSourceBinding: token },
      token,
      registrationQueries,
      authorizationQueries,
    };
  }
  const dedicated = { ...dependencies };
  delete dedicated.socialRuntimeConnection;
  return {
    dependencies: dedicated,
    token: null,
    registrationQueries,
    authorizationQueries,
  };
}
describe('explicit prepared Social Host metadata read', () => {
  it('permits constructing before preparation but rejects copied, unknown and wrong-World instances', () => {
    const f = fixture(false);
    expect(() => createServerCommandHostBinding(f.dependencies)).not.toThrow();
    for (const value of [{ ...f.connection }, {}, Object.freeze({})])
      expect(() =>
        createServerCommandHostBinding({
          ...f.dependencies,
          socialRuntimeConnection: value as PostwarSocialRuntimeConnection,
        }),
      ).toThrow('SERVER_COMMAND_DEPENDENCIES_REQUIRED');
    identities.set(f.connection, { world: 'WORLD_OTHER', ready: true });
    expect(() => createServerCommandHostBinding(f.dependencies)).toThrow(
      'SERVER_COMMAND_DEPENDENCIES_REQUIRED',
    );
    expect(f.sourceConnect).not.toHaveBeenCalled();
    expect(f.metadataConnect).not.toHaveBeenCalled();
  });
  it('rejects unprepared or missing metadata ports without cold-seed fallback or any SQL', async () => {
    for (const ready of [false, true]) {
      const f = fixture(ready),
        withoutMetadata = { ...f.dependencies };
      delete withoutMetadata.socialMetadataRead;
      const s = f.open(ready ? withoutMetadata : f.dependencies);
      try {
        expect(await s.preflight()).toBe(false);
        expect(f.sourceConnect).not.toHaveBeenCalled();
        expect(f.metadataConnect).not.toHaveBeenCalled();
        expect(f.workerQuery).not.toHaveBeenCalled();
      } finally {
        await s.host.stop();
      }
    }
  });
  it('uses only the existing bounded metadata port, commits/releases, then still requires downstream authority', async () => {
    const f = fixture(),
      s = f.open();
    try {
      expect(await s.preflight()).toBe(false);
      expect(f.metadataConnect).toHaveBeenCalledOnce();
      expect(f.sourceConnect).not.toHaveBeenCalled();
      expect(f.statements).toContain(POSTWAR_PROJECTION_SEATS_QUERY);
      expect(f.statements).toContain('commit');
      expect(
        f.statements.some((q) => /canonical_payload|opening_seed/iu.test(q)),
      ).toBe(false);
      expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
      expect(f.workerQuery).toHaveBeenCalledOnce();
    } finally {
      await s.host.stop();
    }
  });
  it.each([
    ['country_id', 'COUNTRY_02'],
    ['office_id', 'FINANCE'],
    ['auth_subject', '00000000-0000-4000-8000-000000000099'],
    ['seed_id', 'SEED_OTHER'],
    ['seed_fingerprint', 'sha256:' + 'c'.repeat(64)],
    ['admission_ref', 'ADMISSION_OTHER'],
    ['model_version', 'world-v2-other'],
    ['world_version', '4'],
  ])(
    'refuses mismatched %s before downstream authority without falling back',
    async (field, value) => {
      const f = fixture(true, { [field]: value }),
        s = f.open();
      try {
        expect(await s.preflight()).toBe(false);
        expect(f.sourceConnect).not.toHaveBeenCalled();
        expect(f.workerQuery).not.toHaveBeenCalled();
        expect(f.statements).toContain('rollback');
        expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
      } finally {
        await s.host.stop();
      }
    },
  );
  it('validates metadata-role separation without granting or querying it', () => {
    const f = fixture();
    for (const readerRole of ['postgres', 'host_auth_publisher'])
      expect(() =>
        createServerCommandHostBinding({
          ...f.dependencies,
          socialMetadataRead: {
            pool: f.dependencies.socialMetadataRead!.pool,
            readerRole,
          },
        }),
      ).toThrow();
    expect(f.metadataConnect).not.toHaveBeenCalled();
  });
  it('keeps the legacy source route when no explicit Social installation is provided', async () => {
    const f = fixture(),
      legacy = { ...f.dependencies };
    delete legacy.socialRuntimeConnection;
    const s = f.open(legacy);
    try {
      expect(await s.preflight()).toBe(false);
      expect(f.sourceConnect).toHaveBeenCalledOnce();
      expect(f.metadataConnect).not.toHaveBeenCalled();
    } finally {
      await s.host.stop();
    }
  });
  it('destroys a late metadata client after cancellation and joins it in the actual drain', async () => {
    const f = fixture();
    let acquire!: (client: PoolClient) => void;
    f.metadataConnect.mockImplementationOnce(
      () =>
        new Promise<PoolClient>((r) => {
          acquire = r;
        }),
    );
    const s = f.open(),
      completion = new WorkerRequestCompletion();
    try {
      const pending = completion.run(s.preflight);
      s.controller.abort();
      expect(await pending).toBe(false);
      expect(completion.pending()).toBe(1);
      acquire(f.client);
      await completion.drain();
      expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
      expect(f.query).not.toHaveBeenCalled();
      expect(f.sourceConnect).not.toHaveBeenCalled();
    } finally {
      await completion.drain();
      await s.host.stop();
    }
  });
});

describe('shared finite Host bounded metadata routing protocol', () => {
  it.each(['FINANCE', 'CAPTAIN'] as const)(
    'routes shared %s through the dedicated bounded reader, then still denies missing authority',
    async (office) => {
      const f = fixture(true, {}, office),
        formal = formalFixture(f),
        s = f.open(formal.dependencies);
      try {
        expect(await s.preflight()).toBe(false);
        expect(formal.registrationQueries).toContain(
          WORLD_EXECUTION_STATE_QUERY,
        );
        expect(f.metadataConnect).toHaveBeenCalledOnce();
        expect(f.sourceConnect).not.toHaveBeenCalled();
        expect(f.statements).toContain(POSTWAR_PROJECTION_SEATS_QUERY);
        expect(f.statements).toContain('commit');
        expect(
          f.statements.some((q) => /canonical_payload|opening_seed/iu.test(q)),
        ).toBe(false);
        expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
        expect(formal.authorizationQueries).toEqual([
          MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY,
        ]);
        expect(f.domainRead).not.toHaveBeenCalled();
      } finally {
        await s.host.stop();
      }
    },
  );

  it.each(['FINANCE', 'CAPTAIN'] as const)(
    'refuses shared %s without prepared Social or its explicit metadata port',
    async (office) => {
      for (const [ready, metadata] of [
        [false, true],
        [true, false],
      ] as const) {
        const f = fixture(ready, {}, office),
          formal = formalFixture(f),
          d = { ...formal.dependencies };
        if (!metadata) delete d.socialMetadataRead;
        const s = f.open(d);
        try {
          expect(await s.preflight()).toBe(false);
          expect(f.metadataConnect).not.toHaveBeenCalled();
          expect(f.sourceConnect).not.toHaveBeenCalled();
          expect(formal.authorizationQueries).toEqual([]);
        } finally {
          await s.host.stop();
        }
      }
    },
  );

  it.each(['FINANCE', 'CAPTAIN'] as const)(
    'rejects a foreign-country %s header before actor/domain authority',
    async (office) => {
      const f = fixture(
        true,
        {
          country_id: 'COUNTRY_02',
          scope_key:
            'OFFICE_434F554E5452595F3032_' +
            Buffer.from(office).toString('hex').toUpperCase(),
        },
        office,
      );
      const formal = formalFixture(f),
        s = f.open(formal.dependencies);
      try {
        expect(await s.preflight()).toBe(false);
        expect(f.metadataConnect).toHaveBeenCalledOnce();
        expect(f.sourceConnect).not.toHaveBeenCalled();
        expect(formal.authorizationQueries).toEqual([]);
        expect(f.domainRead).not.toHaveBeenCalled();
        expect(f.statements).toContain('rollback');
        expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
      } finally {
        await s.host.stop();
      }
    },
  );

  it('does not let forged or wrong-World shared identity choose any metadata transport', async () => {
    for (const wrongWorld of [false, true]) {
      const f = fixture(true, {}, 'CAPTAIN'),
        formal = formalFixture(f);
      const token = formal.token!;
      const d = wrongWorld
        ? formal.dependencies
        : {
            ...formal.dependencies,
            sharedSourceBinding: Object.freeze(
              {},
            ) as FinanceSocialSourceBinding,
          };
      if (wrongWorld)
        sharedIdentities.set(token, {
          ...sharedIdentities.get(token),
          worldId: 'WORLD_OTHER',
        });
      const s = f.open(d);
      try {
        expect(await s.preflight()).toBe(false);
        expect(f.metadataConnect).not.toHaveBeenCalled();
        expect(f.sourceConnect).not.toHaveBeenCalled();
        expect(formal.authorizationQueries).toEqual([]);
      } finally {
        await s.host.stop();
      }
    }
  });

  it.each([true, false])(
    'standalone Finance uses bounded metadata only when explicitly installed (%s)',
    async (metadata) => {
      const f = fixture(true, {}, 'FINANCE'),
        formal = formalFixture(f, false),
        d = { ...formal.dependencies };
      if (!metadata) delete d.socialMetadataRead;
      const s = f.open(d);
      try {
        expect(await s.preflight()).toBe(false);
        if (metadata) {
          expect(f.metadataConnect).toHaveBeenCalledOnce();
          expect(f.sourceConnect).not.toHaveBeenCalled();
          expect(f.statements).toContain(POSTWAR_PROJECTION_SEATS_QUERY);
          expect(formal.authorizationQueries).toEqual([
            MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY,
          ]);
        } else {
          expect(f.sourceConnect).toHaveBeenCalledOnce();
          expect(f.metadataConnect).not.toHaveBeenCalled();
          expect(formal.authorizationQueries).toEqual([]);
        }
      } finally {
        await s.host.stop();
      }
    },
  );

  it('a valid Captain intent and current capability still need actual domain originals after metadata succeeds', async () => {
    const f = fixture(true, {}, 'CAPTAIN'),
      formal = formalFixture(f, true, true);
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        commandId: 'COMMAND_METADATA_CAPTAIN_TEST_ONLY',
        commandType: 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
        actorId: 'ACTOR_METADATA',
        authSubject: subject,
        correlationId: 'CORRELATION_METADATA_TEST_ONLY',
        worldId: world,
        countryId: 'COUNTRY_01',
        officeId: 'CAPTAIN',
        expectedWorldVersion: '3',
        idempotencyKey: 'IDEM_METADATA_TEST_ONLY',
        simTime: '0',
        submittedAtReal: '2026-10-29T00:00:00.000Z',
        payload: {
          schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
          fromBucket: 'FISCAL_REFORM',
          toBucket: 'INDUSTRIAL_STRATEGY',
          amount: { amount: '2', unit: 'political_capital' },
          reasonFactRef: 'REASON_METADATA_TEST_ONLY',
        },
      },
      (bytes) => createHash('sha256').update(bytes).digest('hex'),
    );
    const s = f.open(formal.dependencies, command);
    try {
      expect(await s.preflight()).toBe(false);
      expect(f.metadataConnect).toHaveBeenCalledOnce();
      expect(f.sourceConnect).not.toHaveBeenCalled();
      expect(formal.authorizationQueries.length).toBeGreaterThan(0);
      expect(
        formal.authorizationQueries.every(
          (q) => q === MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY,
        ),
      ).toBe(true);
      expect(f.domainRead).toHaveBeenCalledOnce();
      expect(f.statements).toContain('commit');
    } finally {
      await s.host.stop();
    }
  });
});
