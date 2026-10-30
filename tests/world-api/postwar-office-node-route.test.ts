/** Transport dispatch fixtures only, not SQL/admission/economic acceptance.
 * Actual bounded services and current SQL authorization remain mandatory. */
import { describe, it, expect } from 'vitest';
import { CAPTAIN_POLITICAL_CAPITAL_COMMAND } from '@econmind/core';
import { createPostwarCaptainConnection } from '../../apps/world-api/src/runtime/postwar-captain-connection.js';
import { startApiRuntime } from '../../apps/world-api/src/runtime.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
import {
  createPostwarFinanceConnection,
  type PostwarFinanceConnection,
} from '../../apps/world-api/src/runtime/postwar-finance-connection.js';
import type { PostwarSocialConnection } from '../../apps/world-api/src/runtime/postwar-social-connection.js';
const origin = 'https://pages.example';
const financeType = 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
  socialType = 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1';
function envelope(officeId = 'SOCIAL', commandType = socialType) {
  return {
    schemaVersion: 'world-authenticated-office-command-v1',
    requestId: '11111111-1111-4111-8111-111111111111',
    request: {
      worldId: 'WORLD_TEST',
      countryId: 'COUNTRY_01',
      officeId,
      commandType,
      commandId: 'COMMAND_TEST',
      idempotencyKey: 'KEY_TEST',
      expectedWorldVersion: '0',
      payload: {},
    },
  };
}
const recovery = (originalRequest = envelope()) => ({
  schemaVersion: 'world-command-recovery-v1',
  requestId: '11111111-1111-4111-8111-111111111111',
  request: {
    worldId: originalRequest.request.worldId,
    commandId: originalRequest.request.commandId,
    idempotencyKey: originalRequest.request.idempotencyKey,
    originalRequest,
  },
});
function ports() {
  const calls: {
      office: string;
      operation: string;
      authorization: unknown;
      request: unknown;
    }[] = [],
    stops: string[] = [];
  const command = (
    office: string,
    input: { authorization: unknown; request: unknown },
  ) => {
    calls.push({ office, operation: 'command', ...input });
    return Promise.resolve({
      httpStatus: 503,
      body: {
        schemaVersion: 'world-authenticated-office-command-v1' as const,
        requestId: '11111111-1111-4111-8111-111111111111',
        ok: false as const,
        error: { code: 'FIXTURE_' + office, retryable: false },
      },
    });
  };
  const recover = (
    office: string,
    input: { authorization: unknown; request: unknown },
  ) => {
    calls.push({ office, operation: 'recovery', ...input });
    return Promise.resolve({
      httpStatus: 503,
      body: {
        schemaVersion: 'world-command-recovery-v1' as const,
        requestId: '11111111-1111-4111-8111-111111111111',
        ok: false as const,
        error: { code: 'FIXTURE_' + office, retryable: false },
      },
    });
  };
  const finance: PostwarFinanceConnection = {
    ...createPostwarFinanceConnection(null),
    transportOrigins: [origin],
    handleCommand: (i) => command('FINANCE', i),
    recover: (i) => recover('FINANCE', i),
    async handle() {
      throw Error('NO_LEGACY_FETCH_FALLBACK');
    },
    async stop() {
      stops.push('FINANCE');
    },
  };
  const social: PostwarSocialConnection = {
    async prepare() {},
    classification:
      'SOCIAL_SERVER_DEPENDENCIES_INSTALLED_NOT_RUNTIME_ACCEPTANCE',
    preparationMode: 'LOCAL_CI_PREPARED_INTAKE',
    preparedRuntime: null,
    productionGates: [],
    transportOrigins: [origin],
    handleCommand: (i) => command('SOCIAL', i),
    handle: (i) => command('SOCIAL', i),
    recover: (i) => recover('SOCIAL', i),
    async preflightOnly() {
      throw Error('NO_SOURCE_PREFLIGHT_FROM_TRANSPORT');
    },
    async stop() {
      stops.push('SOCIAL');
    },
  };
  return { finance, social, calls, stops };
}
describe('fixed dual-office standard Node entry', () => {
  it('dispatches Captain commands and recovery exactly once, rejects cross-family selectors, and drains its borrower before pool owners', async () => {
    const p = ports();
    const captain = {
      ...createPostwarCaptainConnection(),
      transportOrigins: [origin],
      async handleCommand(
        input: Parameters<typeof p.finance.handleCommand>[0],
      ) {
        p.calls.push({ office: 'CAPTAIN', operation: 'command', ...input });
        return {
          httpStatus: 503,
          body: {
            schemaVersion: 'world-authenticated-office-command-v1' as const,
            requestId: '11111111-1111-4111-8111-111111111111',
            ok: false as const,
            error: { code: 'CAPTAIN_FIXTURE', retryable: false },
          },
        };
      },
      async recover(input: Parameters<typeof p.finance.recover>[0]) {
        p.calls.push({ office: 'CAPTAIN', operation: 'recovery', ...input });
        return {
          httpStatus: 503,
          body: {
            schemaVersion: 'world-command-recovery-v1' as const,
            requestId: '11111111-1111-4111-8111-111111111111',
            ok: false as const,
            error: { code: 'CAPTAIN_FIXTURE', retryable: false },
          },
        };
      },
      async stop() {
        p.stops.push('CAPTAIN');
      },
    };
    const handler = createPostwarOfficeCommandFetchHandler({
      captain,
      finance: p.finance,
      social: p.social,
    });
    const send = (dto: unknown, recover = false) =>
      handler.handle(
        new Request(
          'https://api.example/' +
            (recover ? 'v1/command-recovery' : 'v1/office-command'),
          {
            method: 'POST',
            headers: {
              origin,
              'content-type': 'application/json',
              authorization: 'Bearer TEST_ONLY_OPAQUE',
            },
            body: JSON.stringify(dto),
          },
        ),
      );
    const dto = envelope('CAPTAIN', CAPTAIN_POLITICAL_CAPITAL_COMMAND);
    for (const isRecovery of [false, true]) {
      const response = await send(isRecovery ? recovery(dto) : dto, isRecovery);
      expect(response?.status).toBe(503);
      expect(await response?.json()).toMatchObject({
        error: { code: 'CAPTAIN_FIXTURE' },
      });
    }
    expect((await send(envelope('CAPTAIN', financeType)))?.status).toBe(400);
    expect(
      (await send(envelope('FINANCE', CAPTAIN_POLITICAL_CAPITAL_COMMAND)))
        ?.status,
    ).toBe(400);
    expect(p.calls.map((c) => [c.office, c.operation])).toEqual([
      ['CAPTAIN', 'command'],
      ['CAPTAIN', 'recovery'],
    ]);
    expect(
      p.calls.every((c) => c.authorization === 'Bearer TEST_ONLY_OPAQUE'),
    ).toBe(true);
    await handler.stop();
    await handler.stop();
    expect(p.stops).toEqual(['CAPTAIN', 'FINANCE', 'SOCIAL']);
    expect((await send(dto))?.status).toBe(503);
    expect(p.calls).toHaveLength(2);
  });
  it('dispatches each command/recovery once to its exact installed office, without503 fallback', async () => {
    const p = ports(),
      api = await startApiRuntime(
        { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 50 },
        {
          postwarFinanceConnection: p.finance,
          postwarSocialConnection: p.social,
        },
      );
    try {
      for (const [office, type] of [
        ['FINANCE', financeType],
        ['SOCIAL', socialType],
      ])
        for (const recover of [false, true]) {
          const dto = envelope(office, type),
            response = await fetch(
              api.origin +
                (recover ? '/v1/command-recovery' : '/v1/office-command'),
              {
                method: 'POST',
                headers: {
                  origin,
                  'content-type': 'application/json',
                  authorization: 'Bearer TEST_ONLY_OPAQUE',
                },
                body: JSON.stringify(recover ? recovery(dto) : dto),
              },
            );
          expect(response.status).toBe(503);
          expect(await response.json()).toMatchObject({
            error: { code: 'FIXTURE_' + office },
          });
        }
      expect(p.calls.map((c) => [c.office, c.operation])).toEqual([
        ['FINANCE', 'command'],
        ['FINANCE', 'recovery'],
        ['SOCIAL', 'command'],
        ['SOCIAL', 'recovery'],
      ]);
      expect(
        p.calls.every((c) => c.authorization === 'Bearer TEST_ONLY_OPAQUE'),
      ).toBe(true);
      expect(await (await fetch(api.origin + '/healthz')).json()).toMatchObject(
        {
          postwarFinance: { productionReady: false },
          postwarSocial: { productionReady: false },
        },
      );
    } finally {
      await api.shutdown();
    }
    expect(p.stops).toEqual(['FINANCE', 'SOCIAL']);
  });
  it('rejects mismatched recovery originals, added selectors, wrong family and uninstalled offices without a second target', async () => {
    const p = ports(),
      handler = createPostwarOfficeCommandFetchHandler({
        finance: p.finance,
        social: p.social,
      });
    const send = (value: unknown, path = '/v1/command-recovery') =>
      handler.handle(
        new Request('https://api.example' + path, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify(value),
        }),
      );
    const r = recovery();
    expect(
      (
        await send({
          ...r,
          request: { ...r.request, commandId: 'COMMAND_OTHER' },
        })
      )?.status,
    ).toBe(400);
    expect(
      (await send({ ...r, request: { ...r.request, officeId: 'FINANCE' } }))
        ?.status,
    ).toBe(400);
    expect(
      (await send(envelope('SOCIAL', financeType), '/v1/office-command'))
        ?.status,
    ).toBe(400);
    expect(
      (
        await send(
          envelope('CENTRAL_BANK', 'CORE_CENTRAL_BANK_OMO_V1'),
          '/v1/office-command',
        )
      )?.status,
    ).toBe(503);
    expect(p.calls).toHaveLength(0);
    await handler.stop();
  });
  it('reads the body once, never clones it, and enforces the selected connection own CORS policy', async () => {
    const p = ports(),
      handler = createPostwarOfficeCommandFetchHandler({
        finance: p.finance,
        social: { ...p.social, transportOrigins: ['https://social.example'] },
      });
    let reads = 0;
    const request = new Request('https://api.example/v1/office-command', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(envelope('FINANCE', financeType)),
    });
    const stream = request.body!;
    const getReader = stream.getReader.bind(stream);
    Object.defineProperty(stream, 'getReader', {
      value() {
        reads++;
        return getReader();
      },
    });
    Object.defineProperty(request, 'clone', {
      value() {
        throw Error('NO_BODY_TEE_OR_CLONE');
      },
    });
    expect((await handler.handle(request))?.status).toBe(503);
    expect(reads).toBe(1);
    expect(p.calls).toHaveLength(1);
    const denied = await handler.handle(
      new Request('https://api.example/v1/office-command', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify(envelope()),
      }),
    );
    expect(denied?.status).toBe(403);
    expect(p.calls).toHaveLength(1);
    await handler.stop();
  });
  it('keeps absent targets closed and preserves byte/query/method bounds', async () => {
    const p = ports(),
      handler = createPostwarOfficeCommandFetchHandler({
        finance: createPostwarFinanceConnection(null),
        social: p.social,
      });
    const send = (body: string, path = '/v1/office-command', method = 'POST') =>
      handler.handle(
        new Request('https://api.example' + path, {
          method,
          headers: { origin, 'content-type': 'application/json' },
          ...(method === 'GET' ? {} : { body }),
        }),
      );
    expect(
      (await send(JSON.stringify(envelope('FINANCE', financeType))))?.status,
    ).toBe(503);
    expect((await send('x'.repeat(17000)))?.status).toBe(413);
    expect((await send('{}', '/v1/office-command?x=1'))?.status).toBe(404);
    expect((await send('', '/v1/office-command', 'GET'))?.status).toBe(405);
    expect(p.calls).toHaveLength(0);
    await handler.stop();
    expect((await send(JSON.stringify(envelope())))?.status).toBe(503);
    await handler.stop();
    expect(p.stops).toEqual(['SOCIAL']);
  });
  it('cleans both installed connections and official pool on pre-listen constructor failure, preserving all causes', async () => {
    const p = ports(),
      order: string[] = [];
    const finance = {
      ...p.finance,
      transportOrigins: Array.from(
        { length: 4 },
        (_, i) => 'https://finance' + i + '.example',
      ),
      async stop() {
        order.push('FINANCE');
        throw Error('FINANCE_STOP_FAILED');
      },
    };
    const social = {
      ...p.social,
      transportOrigins: Array.from(
        { length: 5 },
        (_, i) => 'https://social' + i + '.example',
      ),
      async stop() {
        order.push('SOCIAL');
        throw Error('SOCIAL_STOP_FAILED');
      },
    };
    const officialPool = {
      async query() {
        throw Error('NO_QUERY_EXPECTED');
      },
      async end() {
        order.push('OFFICIAL_POOL');
        throw Error('OFFICIAL_END_FAILED');
      },
    };
    let caught: unknown;
    try {
      await startApiRuntime(
        {
          environment: 'ci',
          host: '127.0.0.1',
          port: 0,
          shutdownGraceMs: 50,
          officialCountryDatabase: {
            connectionString: 'postgresql://fixture.invalid/no-connection',
            loginRole: 'fixture_official_login',
            readerRole: 'world_v2_api_reader',
          },
        },
        {
          postwarFinanceConnection: finance,
          postwarSocialConnection: social,
          officialCountryPool: officialPool,
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    const error = caught as AggregateError;
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe(
      'OFFICE_TRANSPORT_EXPLICIT_HTTPS_ORIGINS_REQUIRED',
    );
    expect(error.errors.map((e: Error) => e.message)).toEqual([
      'OFFICE_TRANSPORT_EXPLICIT_HTTPS_ORIGINS_REQUIRED',
      'FINANCE_STOP_FAILED',
      'SOCIAL_STOP_FAILED',
      'OFFICIAL_END_FAILED',
    ]);
    expect(order).toEqual(['FINANCE', 'SOCIAL', 'OFFICIAL_POOL']);
  });
  it('does not turn a post-dispatch cancellation/unknown write into a definite cancellation or another-office retry', async () => {
    const p = ports(),
      controller = new AbortController();
    const finance = {
      ...p.finance,
      async handleCommand(
        input: Parameters<PostwarFinanceConnection['handleCommand']>[0],
      ) {
        controller.abort();
        expect(input.signal?.aborted).toBe(true);
        throw Error('TEST_ONLY_LOST_ACK_NOT_A_COMMIT_CLAIM');
      },
    };
    const handler = createPostwarOfficeCommandFetchHandler({
      finance,
      social: p.social,
    });
    try {
      const response = await handler.handle(
        new Request('https://api.example/v1/office-command', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify(envelope('FINANCE', financeType)),
          signal: controller.signal,
        }),
      );
      expect(response?.status).toBe(503);
      expect(await response?.json()).toMatchObject({
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      });
      expect(p.calls).toHaveLength(0);
    } finally {
      await handler.stop();
    }
  });
  it('awaits explicit product preparation before publishing the Node runtime', async () => {
    const p = ports();
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const social = {
      ...p.social,
      async prepare() {
        entered();
        await gate;
      },
    };
    let ready = false;
    const starting = startApiRuntime(
      { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 50 },
      { postwarSocialConnection: social },
    );
    void starting.then(() => {
      ready = true;
    });
    await started;
    await Promise.resolve();
    expect(ready).toBe(false);
    release();
    const api = await starting;
    try {
      expect(api.ready()).toBe(true);
      expect(p.calls).toHaveLength(0);
    } finally {
      await api.shutdown();
    }
  });
  it('cleans all dependencies on cold product preparation failure without starting a listener', async () => {
    const p = ports(),
      failure = Error('ACTUAL_PRODUCT_PREPARATION_FAILED');
    const social = {
      ...p.social,
      async prepare() {
        throw failure;
      },
    };
    await expect(
      startApiRuntime(
        { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 50 },
        {
          postwarFinanceConnection: p.finance,
          postwarSocialConnection: social,
        },
      ),
    ).rejects.toBe(failure);
    expect(p.calls).toHaveLength(0);
    expect(p.stops).toEqual(['FINANCE', 'SOCIAL']);
  });
});
