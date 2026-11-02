/** Real fixed source-data loader + actual standard factories; protocol pools
 * exercise lifecycle only. No SQL admission/authority, native DB or formal
 * connection success is claimed by these tests. Nothing starts a consumer. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  WORLD_MODEL_VERSION,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  parseCanonicalCommand,
} from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import {
  loadPostwarSocialConnectionOpeningAdoption,
  createPostwarSocialRuntimeConnection,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarSocialConnection,
  type PostwarSocialConnectionConfiguration,
} from '../../apps/world-api/src/runtime/postwar-social-connection.js';

import { createServerCommandHostBinding } from '../../apps/world-worker/dist/runtime-preparation/production-world-command-host-exports.js';
import { createSourceOwnedExecutorComposition } from '../../apps/world-api/src/runtime-preparation/source-owned-executor-composition.js';

/** Keep the explicitly uninstalled legacy offline diagnostic's original
 * cancellation coverage. This is a real field-absent host composition, never
 * a fallback from an explicitly installed-but-unprepared source. No HTTP,
 * Ready flag or successful source proof is supplied by this protocol fixture. */
function legacyDiagnostic(config: PostwarSocialConnectionConfiguration) {
  const poolsOwner = createPostwarSocialConnection(config);
  const sources = createPostwarSocialRuntimeConnection({
    worldId: config.admittedWorldPins.worldId,
    workerId: config.workerId,
    workerPool: config.workerPool,
    workerRole: config.workerRole,
    openingAdoption: config.openingAdoption,
  });
  const binding = createServerCommandHostBinding({
    worldId: config.admittedWorldPins.worldId,
    workerId: config.workerId,
    seedRef: config.admittedWorldPins.seedRef,
    contentHash: config.admittedWorldPins.contentHash,
    admissionRef: config.admittedWorldPins.admissionRef,
    modelVersion: config.modelVersion,
    intakePool: config.intakePool,
    sourcePool: config.sourcePool,
    readerRole: config.sourceReaderRole,
    authorizationPublisherRole: config.authorizationPublisherRole,
    workerDatabase: sources.database,
    clock: config.clock,
    resolveActorId: config.resolveActorId,
    readers: sources.readers,
  });
  const diagnostic = createSourceOwnedExecutorComposition(binding);
  return {
    async preflightOnly(input: Parameters<typeof diagnostic.preflightOnly>[0]) {
      const r = await diagnostic.preflightOnly(input);
      return {
        ...r,
        status:
          r.status === 'SOURCE_PREFLIGHT_DENIED'
            ? ('SOURCE_PREFLIGHT_NOT_CONFIRMED' as const)
            : r.status,
      };
    },
    async stop() {
      const errors: unknown[] = [];
      for (const close of [
        () => diagnostic.stop(),
        () => sources.close(),
        () => poolsOwner.stop(),
      ])
        try {
          await close();
        } catch (e) {
          errors.push(e);
        }
      if (errors.length)
        throw new AggregateError(errors, 'LEGACY_DIAGNOSTIC_CLEANUP_FAILED');
    },
  };
}

const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const now = '2026-10-29T00:00:00.000Z';
const world = 'WORLD_TEST_ONLY_SOCIAL_CONNECTION';
let adoption: OfficialLabourSocialOpeningAdoption;
beforeAll(async () => {
  adoption = await loadPostwarSocialConnectionOpeningAdoption(root);
}, 60_000);
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(
  environment: PostwarSocialConnectionConfiguration['environment'] = 'production',
) {
  const events: string[] = [],
    calls = { queries: 0, connects: 0, ends: 0, fetches: 0 };
  const controls = new Map<
    string,
    {
      endCalls: number;
      connect: () => Promise<PoolClient>;
      endFailure: boolean;
    }
  >();
  function pool(name: string): Pool {
    const control = {
      endCalls: 0,
      connect: async (): Promise<PoolClient> => {
        throw Error('UNEXPECTED_PROTOCOL_CONNECTION');
      },
      endFailure: false,
    };
    controls.set(name, control);
    return {
      async connect() {
        calls.connects++;
        events.push(`connect:${name}`);
        return control.connect();
      },
      async query() {
        calls.queries++;
        throw Error('UNEXPECTED_PROTOCOL_QUERY');
      },
      async end() {
        calls.ends++;
        control.endCalls++;
        events.push(`end:${name}`);
        if (control.endFailure)
          throw Error('TEST_ONLY_PRIVATE_TRANSPORT_DETAIL');
      },
    } as unknown as Pool;
  }
  const config: PostwarSocialConnectionConfiguration = {
    environment,
    boundedReadPool: pool('bounded'),
    intakePool: pool('intake'),
    sourcePool: pool('source'),
    workerPool: pool('worker'),
    boundedReaderRole: 'fixture_social_bounded',
    sourceReaderRole: 'fixture_social_offline_source',
    intakeRole: 'fixture_social_intake',
    workerRole: 'fixture_social_worker',
    authorizationPublisherRole: 'fixture_social_auth_publisher',
    workerId: 'WORKER_TEST_ONLY_SOCIAL_CONNECTION',
    openingAdoption: adoption,
    admittedWorldPins: {
      worldId: world,
      seedRef: 'SEED_TEST_ONLY_NOT_ADMITTED',
      contentHash: `sha256:${'1'.repeat(64)}`,
      admissionRef: 'ADMISSION_TEST_ONLY_NOT_ACTUAL',
      minimumWorldVersion: '0',
    },
    modelVersion: WORLD_MODEL_VERSION,
    auth: {
      projectRef: 'abcdefghijklmnopqrst',
      expectedIssuer: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
      jwksUrl:
        'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
      audience: 'authenticated',
      fetch: async () => {
        calls.fetches++;
        throw Error('NO_NETWORK_EXPECTED');
      },
    },
    clock: Object.freeze({ nowReal: () => now, simTime: async () => '2000' }),
    resolveActorId: async () => 'ACTOR_TEST_ONLY',
  };
  return { config, events, calls, controls };
}
function wire(
  commandType: string = SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  countryId = 'COUNTRY_02',
) {
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: '00000000-0000-4000-8000-000000000001',
    request: {
      worldId: world,
      countryId,
      officeId: 'SOCIAL',
      commandType,
      commandId: 'COMMAND_TEST_ONLY_SOCIAL_CONNECTION',
      idempotencyKey: 'IDEMPOTENCY_TEST_ONLY_SOCIAL_CONNECTION',
      expectedWorldVersion: '0',
      payload: {},
    },
  };
}
function canonical() {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: 'COUNTRY_01',
      officeId: 'SOCIAL',
      commandType: SOCIAL_POSITION_OFFER_CREATE_COMMAND,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'COMMAND_TEST_ONLY_SOURCE_PREFLIGHT',
      idempotencyKey: 'IDEMPOTENCY_TEST_ONLY_SOURCE_PREFLIGHT',
      correlationId: 'CORRELATION_TEST_ONLY',
      expectedWorldVersion: '0',
      payload: {},
      simTime: '2000',
      submittedAtReal: now,
    },
    sha,
  );
}
function recovery(originalRequest = wire()) {
  return {
    schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
    requestId: '00000000-0000-4000-8000-000000000002',
    request: {
      worldId: originalRequest.request.worldId,
      commandId: originalRequest.request.commandId,
      idempotencyKey: originalRequest.request.idempotencyKey,
      originalRequest,
    },
  };
}

describe('explicit Social Node connection installation, no default route or activation', () => {
  it('exposes only snapshotted explicit HTTP origins and retains the structured command alias', async () => {
    const f = fixture('ci'),
      origins = ['https://pages.example'];
    const connection = createPostwarSocialConnection({
      ...f.config,
      allowedOrigins: origins,
    });
    origins.push('https://later.example');
    expect(connection.transportOrigins).toEqual(['https://pages.example']);
    expect(Object.isFrozen(connection.transportOrigins)).toBe(true);
    expect(
      (await connection.handleCommand({ authorization: null, request: wire() }))
        .httpStatus,
    ).toBe(503);
    expect(() =>
      createPostwarSocialConnection({
        ...f.config,
        allowedOrigins: ['http://unsafe.example'],
      }),
    ).toThrow('TRANSPORT_ORIGINS_INVALID');
    await connection.stop();
  });
  it('recovers only the strict original Social manual family through the actual shared recovery service', async () => {
    const f = fixture('ci'),
      connection = createPostwarSocialConnection(f.config);
    const result = await connection.recover({
      authorization: null,
      request: recovery(),
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({
      error: { code: 'SOURCE_NOT_PREPARED' },
    });
    expect(result.body.schemaVersion).toBe(
      AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
    );
    const other = wire('CORE_FINANCE_BUDGET_APPROPRIATION_V1');
    other.request.officeId = 'FINANCE';
    expect(
      (
        await connection.recover({
          authorization: null,
          request: recovery(other),
        })
      ).body,
    ).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_SOCIAL_RECOVERY' },
    });
    const altered = recovery();
    altered.request.commandId = 'COMMAND_OTHER';
    expect(
      (await connection.recover({ authorization: null, request: altered }))
        .body,
    ).toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } });
    expect(f.calls.connects).toBe(0);
    await connection.stop();
    expect(
      (await connection.recover({ authorization: null, request: recovery() }))
        .body,
    ).toMatchObject({
      schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
      ok: false,
      error: { code: 'NOT_CONNECTED' },
    });
  });
  it('keeps production recovery explicitly uninstalled without granting a consumer or changing the write gate', async () => {
    const f = fixture(),
      connection = createPostwarSocialConnection(f.config);
    expect(
      (
        await connection.recover({
          authorization: 'Bearer TEST_ONLY',
          request: recovery(),
        })
      ).body,
    ).toMatchObject({
      schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
      ok: false,
      error: { code: 'SOCIAL_PRODUCTION_RECOVERY_NOT_INSTALLED' },
    });
    expect(connection.preparedRuntime).toBeNull();
    expect(f.calls.connects).toBe(0);
    await connection.stop();
  });
  it('keeps the local consumer inaccessible and HTTP closed until genuine source preparation, without constructor SQL or clock start', async () => {
    const f = fixture('ci'),
      connection = createPostwarSocialConnection(f.config);
    expect(connection.preparationMode).toBe('LOCAL_CI_PREPARED_INTAKE');
    expect(connection.preparedRuntime).toBeNull();
    const unauthenticated = await connection.handle({
      authorization: null,
      request: wire(),
    });
    expect(unauthenticated.httpStatus).toBe(503);
    expect(unauthenticated.body).toMatchObject({
      error: { code: 'SOURCE_NOT_PREPARED' },
    });
    expect(unauthenticated.body.ok).toBe(false);
    expect(f.calls).toEqual({ queries: 0, connects: 0, ends: 0, fetches: 0 });
    await connection.stop();
    expect(connection.preparedRuntime).toBeNull();
    expect(f.calls.ends).toBe(4);
    expect(
      (await connection.handle({ authorization: null, request: wire() })).body,
    ).toMatchObject({ ok: false, error: { code: 'NOT_CONNECTED' } });
  });
  it('keeps production writes explicitly closed rather than relabelling production as ci or returning an empty result', async () => {
    const f = fixture(),
      connection = createPostwarSocialConnection(f.config);
    expect(connection.preparedRuntime).toBeNull();
    expect(connection.preparationMode).toBe('PRODUCTION_SOURCE_PREFLIGHT_ONLY');
    const result = await connection.handle({
      authorization: 'Bearer TEST_ONLY',
      request: wire(),
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({
      ok: false,
      error: { code: 'SOCIAL_PRODUCTION_EXECUTION_NOT_INSTALLED' },
    });
    expect(
      connection.productionGates.some((g) => g.includes('OFFLINE_SEED_READER')),
    ).toBe(true);
    expect(f.calls.connects).toBe(0);
    await connection.stop();
  });
  it('rejects pool/role aliasing and copied source adoption without querying or granting anything', () => {
    const f = fixture('ci');
    expect(() =>
      createPostwarSocialConnection({
        ...f.config,
        sourcePool: f.config.boundedReadPool,
      }),
    ).toThrow('FOUR_DISTINCT');
    expect(() =>
      createPostwarSocialConnection({
        ...f.config,
        sourceReaderRole: f.config.boundedReaderRole,
      }),
    ).toThrow('ROLE_SEPARATION');
    expect(() =>
      createPostwarSocialConnection({ ...f.config, workerRole: 'postgres' }),
    ).toThrow('SCOPED_ROLE_REQUIRED');
    expect(() =>
      createPostwarSocialConnection({
        ...f.config,
        openingAdoption: { ...adoption },
      }),
    ).toThrow();
    expect(f.calls.connects).toBe(0);
    expect(f.calls.ends).toBe(0);
  });
  it('never accepts browser MATCH/foreign-world selectors as manual Social commands', async () => {
    const f = fixture('ci'),
      connection = createPostwarSocialConnection(f.config);
    expect(
      (
        await connection.handle({
          authorization: null,
          request: wire(SOCIAL_JOB_MATCH_DUE_COMMAND),
        })
      ).httpStatus,
    ).toBe(400);
    const other = wire();
    other.request.worldId = 'WORLD_OTHER';
    expect(
      (await connection.handle({ authorization: null, request: other })).body,
    ).toMatchObject({ ok: false, error: { code: 'WORLD_BINDING_MISMATCH' } });
    expect(f.calls.connects).toBe(0);
    await connection.stop();
  });
  it('keeps legacy offline diagnostic unreachable-source classification as unconfirmed, never EMPTY or definite source denial', async () => {
    const f = fixture(),
      connection = legacyDiagnostic(f.config);
    f.controls.get('source')!.connect = async () => {
      throw Error('TEST_ONLY_UNREACHABLE_DATABASE');
    };
    const result = await connection.preflightOnly({
      command: canonical(),
      observedAtReal: now,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: 'SOURCE_PREFLIGHT_NOT_CONFIRMED',
      commandQueued: false,
    });
    expect(f.calls.connects).toBe(1);
    expect(f.calls.queries).toBe(0);
    await connection.stop();
    expect(f.calls.ends).toBe(4);
  });
  it('keeps legacy offline diagnostic late-client cancellation/destroy before its pool-owner shutdown', async () => {
    const f = fixture(),
      connection = legacyDiagnostic(f.config),
      started = deferred<void>(),
      late = deferred<PoolClient>();
    f.controls.get('source')!.connect = () => {
      started.resolve();
      return late.promise;
    };
    const abort = new AbortController();
    const work = connection.preflightOnly({
      command: canonical(),
      observedAtReal: now,
      signal: abort.signal,
    });
    await started.promise;
    abort.abort();
    const closing = connection.stop();
    await Promise.resolve();
    expect(f.calls.ends).toBe(0);
    late.resolve({
      query: async () => {
        throw Error('LATE_ABORTED_CLIENT_MUST_NOT_QUERY');
      },
      release: (destroy?: boolean | Error) => {
        f.events.push(`release:source:${String(destroy)}`);
      },
    } as unknown as PoolClient);
    expect((await work).status).toBe('CANCELLED');
    await closing;
    expect(f.events.indexOf('release:source:true')).toBeGreaterThanOrEqual(0);
    expect(f.events.indexOf('release:source:true')).toBeLessThan(
      f.events.indexOf('end:source'),
    );
    expect(f.calls.ends).toBe(4);
    await connection.stop();
    expect(f.calls.ends).toBe(4);
  });
  it('attempts every pool cleanup and preserves a cleanup failure instead of certifying clean shutdown', async () => {
    const f = fixture(),
      connection = createPostwarSocialConnection(f.config);
    f.controls.get('bounded')!.endFailure = true;
    const closing = connection.stop();
    await expect(closing).rejects.toThrow(
      'SOCIAL_CONNECTION_CLEANUP_UNCONFIRMED',
    );
    expect(f.calls.ends).toBe(4);
    expect(connection.stop()).toBe(closing);
    await expect(connection.stop()).rejects.toThrow(
      'SOCIAL_CONNECTION_CLEANUP_UNCONFIRMED',
    );
    expect(f.calls.ends).toBe(4);
  });
  it('requires real DB preparation, keeps failed preparation idempotent and never exposes a consumer', async () => {
    const f = fixture('ci'),
      connection = createPostwarSocialConnection(f.config);
    const preparation = connection.prepare();
    await expect(preparation).rejects.toThrow();
    expect(connection.prepare()).toBe(preparation);
    await expect(connection.prepare()).rejects.toThrow();
    expect(connection.preparedRuntime).toBeNull();
    expect(f.calls.connects).toBe(1);
    expect(
      (await connection.handleCommand({ authorization: null, request: wire() }))
        .body,
    ).toMatchObject({ error: { code: 'SOURCE_NOT_PREPARED' } });
    await connection.stop();
    expect(f.calls.ends).toBe(4);
  });
  it('drains a late preparation connection before closing owned pools and cannot become prepared during stop', async () => {
    const f = fixture('ci'),
      connection = createPostwarSocialConnection(f.config),
      started = deferred<void>(),
      late = deferred<PoolClient>();
    f.controls.get('worker')!.connect = () => {
      started.resolve();
      return late.promise;
    };
    const preparation = connection.prepare(),
      rejected = expect(preparation).rejects.toThrow();
    await started.promise;
    const closing = connection.stop();
    await Promise.resolve();
    expect(f.calls.ends).toBe(0);
    late.resolve({
      query: async () => {
        throw Error('TEST_ONLY_STARTUP_QUERY_FAILED');
      },
      release: () => {
        f.events.push('release:worker');
      },
    } as unknown as PoolClient);
    await rejected;
    await closing;
    expect(connection.preparedRuntime).toBeNull();
    expect(f.calls.ends).toBe(4);
    expect(f.events.indexOf('release:worker')).toBeGreaterThanOrEqual(0);
    expect(f.events.indexOf('release:worker')).toBeLessThan(
      f.events.indexOf('end:worker'),
    );
  });
});
