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
  parseCanonicalCommand,
} from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import {
  loadPostwarSocialConnectionOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarSocialConnection,
  type PostwarSocialConnectionConfiguration,
} from '../../apps/world-api/src/runtime/postwar-social-connection.js';

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

describe('explicit Social Node connection installation, no default route or activation', () => {
  it('constructs actual official factories and a genuine PREPARED local runtime without SQL or clock/consumer start', async () => {
    const f = fixture('ci'),
      connection = createPostwarSocialConnection(f.config);
    expect(connection.preparationMode).toBe('LOCAL_CI_PREPARED_INTAKE');
    expect(connection.preparedRuntime?.consumer.state()).toBe('PREPARED');
    const unauthenticated = await connection.handle({
      authorization: null,
      request: wire(),
    });
    expect(unauthenticated.httpStatus).toBe(401);
    expect(unauthenticated.body.ok).toBe(false);
    expect(f.calls).toEqual({ queries: 0, connects: 0, ends: 0, fetches: 0 });
    await connection.stop();
    expect(connection.preparedRuntime?.consumer.state()).toBe('STOPPED');
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
  it('reports a failed real connection attempt as source unconfirmed, never EMPTY or definite source denial', async () => {
    const f = fixture(),
      connection = createPostwarSocialConnection(f.config);
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
  it('joins a late connection after cancellation, destroys it, then ends all owned pools exactly once', async () => {
    const f = fixture(),
      connection = createPostwarSocialConnection(f.config),
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
});
