/** TEST_ONLY Host routing protocol, not SQL/source/admission acceptance. The
 * identity predicate double isolates this branch; the real installer's private
 * instance/prepared-slot issuance is covered by its separate owner tests. */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { CanonicalCommand } from '@econmind/core';
import type { PostwarSocialRuntimeConnection } from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
const identities = vi.hoisted(
  () => new WeakMap<object, { world: string; ready: boolean }>(),
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
function fixture(ready = true, patch: Record<string, string> = {}) {
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
                office_id: 'SOCIAL',
                auth_subject: subject,
                team_id: 'TEAM_METADATA',
                authorization_revision: 'REV_1',
                scope_key: 'OFFICE_434F554E5452595F3031_534F4349414C',
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
        read: async () => {
          throw Error('NO_DOMAIN_SOURCE_EXPECTED');
        },
      },
    },
  };
  const command = {
    worldId: world,
    countryId: 'COUNTRY_01',
    officeId: 'SOCIAL',
    authSubject: subject,
    commandType: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
    expectedWorldVersion: '3',
  } as CanonicalCommand;
  const open = (d = dependencies) => {
    const host = createProductionWorldCommandHost(
        createServerCommandHostBinding(d),
      ),
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
          command,
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
    statements,
    release,
    client,
    query,
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
