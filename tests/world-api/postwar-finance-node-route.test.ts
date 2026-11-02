/** Actual loopback Node HTTP + real Finance installer handlers. Transport-only
 * controlled delayed ports below test abort/drain, not DB or economic authority. */
import { request as nodeRequest, createServer, Server } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import { startApiRuntime } from '../../apps/world-api/src/runtime.js';
import { createPostwarFinanceNodeRoute } from '../../apps/world-api/src/runtime/postwar-finance-node-route.js';
import {
  createPostwarFinanceConnection,
  type PostwarFinanceConnection,
  type PostwarFinanceConnectionConfig,
} from '../../apps/world-api/src/runtime/postwar-finance-connection.js';

const config = {
  environment: 'ci',
  host: '127.0.0.1',
  port: 0,
  shutdownGraceMs: 30,
};
const officialDatabase = {
  connectionString: 'UNUSED_TEST_ONLY_NO_DATABASE_CONNECTION',
  loginRole: 'test_only_official_reader',
  readerRole: 'world_v2_api_reader' as const,
};
function failingStartupPorts() {
  const stopFailure = new Error('CONTROLLED_FINANCE_STOP_FAILURE');
  const pool = {
    query: vi.fn(async () => {
      throw Error('STARTUP_CLEANUP_TEST_MUST_NOT_QUERY_DATABASE');
    }),
    end: vi.fn(async () => {}),
  };
  const stop = vi.fn(async () => {
    throw stopFailure;
  });
  return {
    stopFailure,
    pool,
    stop,
    connection: { ...createPostwarFinanceConnection(null), stop },
  };
}
function installed() {
  let connects = 0,
    queries = 0;
  const pool = () => ({
    async connect() {
      connects++;
      throw Error('NO_DB_IN_HTTP_TRANSPORT_TEST');
    },
  });
  const project = 'a'.repeat(20),
    issuer = 'https://' + project + '.supabase.co/auth/v1';
  const input: PostwarFinanceConnectionConfig = {
    worldId: 'WORLD_NODE_TEST',
    countryId: 'COUNTRY_01',
    workerId: 'WORKER_NODE_TEST',
    admittedWorldPins: {
      worldId: 'WORLD_NODE_TEST',
      seedRef: 'SEED_NODE_TEST',
      contentHash: 'sha256:' + '1'.repeat(64),
      admissionRef: 'ADMISSION_NODE_TEST',
      minimumWorldVersion: '0',
    },
    readPool: pool() as unknown as PostwarFinanceConnectionConfig['readPool'],
    intakePool:
      pool() as unknown as PostwarFinanceConnectionConfig['intakePool'],
    workerDatabase: {
      async query() {
        queries++;
        throw Error('NO_DB_QUERY');
      },
      async transaction() {
        queries++;
        throw Error('NO_DB_TRANSACTION');
      },
    },
    readerRole: 'node_finance_reader',
    intakeRole: 'node_finance_intake',
    authorizationPublisherRole: 'node_finance_publisher',
    auth: {
      projectRef: project,
      expectedIssuer: issuer,
      jwksUrl: issuer + '/.well-known/jwks.json',
      audience: 'authenticated',
    },
    resolveActorId: async () => null,
    clock: Object.freeze({
      nowReal: () => new Date().toISOString(),
      simTime: async () => '0',
    }),
    allowedOrigins: ['https://world.example'],
    environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test' },
  };
  return {
    connection: createPostwarFinanceConnection(input),
    counts: () => ({ connects, queries }),
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe('explicit Finance installation on standard Node API', () => {
  it('ends the official read pool after actual EADDRINUSE even if Finance stop fails, preserving both errors', async () => {
    const occupied = createServer(),
      f = failingStartupPorts();
    await new Promise<void>((resolve) =>
      occupied.listen(0, '127.0.0.1', resolve),
    );
    const address = occupied.address();
    if (!address || typeof address === 'string')
      throw Error('OWNED_OCCUPIED_LOOPBACK_REQUIRED');
    let unexpectedRuntime:
      Awaited<ReturnType<typeof startApiRuntime>> | undefined;
    try {
      let failure: unknown;
      try {
        unexpectedRuntime = await startApiRuntime(
          {
            ...config,
            port: address.port,
            officialCountryDatabase: officialDatabase,
          },
          {
            officialCountryPool: f.pool,
            postwarFinanceConnection: f.connection,
          },
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      const aggregate = failure as AggregateError;
      expect(aggregate.errors).toHaveLength(2);
      expect(aggregate.errors[0]).toMatchObject({ code: 'EADDRINUSE' });
      expect(aggregate.errors[1]).toBe(f.stopFailure);
      expect(aggregate.cause).toBe(aggregate.errors[0]);
      expect(f.stop).toHaveBeenCalledTimes(1);
      expect(f.pool.end).toHaveBeenCalledTimes(1);
      expect(f.pool.query).not.toHaveBeenCalled();
      expect(occupied.listening).toBe(true);
    } finally {
      await unexpectedRuntime?.shutdown().catch(() => {});
      await new Promise<void>((resolve, reject) =>
        occupied.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(occupied.listening).toBe(false);
  });
  it('attempts every invalid-address startup cleanup and preserves close/Finance failures with the primary cause', async () => {
    const f = failingStartupPorts(),
      closeFailure = new Error('CONTROLLED_LISTENER_CLOSE_FAILURE'),
      originalClose = Server.prototype.close,
      ownedServers = new Set<Server>();
    let unexpectedRuntime:
      Awaited<ReturnType<typeof startApiRuntime>> | undefined;
    const addressSpy = vi
      .spyOn(Server.prototype, 'address')
      .mockImplementation(function (this: Server) {
        ownedServers.add(this);
        return null;
      });
    const closeSpy = vi
      .spyOn(Server.prototype, 'close')
      .mockImplementation(function (this: Server, callback) {
        // Actually close our listener, then report a controlled cleanup failure.
        // This fixture must not leave a socket open merely to test an error path.
        return originalClose.call(this, (error) =>
          callback?.(error ?? closeFailure),
        );
      });
    try {
      let failure: unknown;
      try {
        unexpectedRuntime = await startApiRuntime(
          { ...config, officialCountryDatabase: officialDatabase },
          {
            officialCountryPool: f.pool,
            postwarFinanceConnection: f.connection,
          },
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      const aggregate = failure as AggregateError;
      expect(aggregate.errors).toHaveLength(3);
      expect(aggregate.errors[0]).toMatchObject({
        message: 'world-api did not acquire a TCP address',
      });
      expect(aggregate.errors[1]).toBe(closeFailure);
      expect(aggregate.errors[2]).toBe(f.stopFailure);
      expect(aggregate.cause).toBe(aggregate.errors[0]);
      expect(f.stop).toHaveBeenCalledTimes(1);
      expect(f.pool.end).toHaveBeenCalledTimes(1);
      expect(f.pool.query).not.toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(ownedServers.size).toBe(1);
      expect([...ownedServers][0]?.listening).toBe(false);
    } finally {
      addressSpy.mockRestore();
      closeSpy.mockRestore();
      await unexpectedRuntime?.shutdown().catch(() => {});
      for (const server of ownedServers)
        if (server.listening)
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
    }
  });
  it('preserves default POST405 and leaves health without a configured Finance claim', async () => {
    const api = await startApiRuntime(config);
    try {
      const r = await fetch(api.origin + '/v1/office-command', {
        method: 'POST',
        body: '{}',
      });
      expect(r.status).toBe(405);
      expect(r.headers.get('allow')).toBe('GET, HEAD');
      expect(
        await (await fetch(api.origin + '/healthz')).json(),
      ).not.toHaveProperty('postwarFinance');
    } finally {
      await api.shutdown();
    }
  });
  it('mounts both real null-config handler paths as503 and preserves nonmatches/query restrictions', async () => {
    const api = await startApiRuntime(config, {
      postwarFinanceConnection: createPostwarFinanceConnection(null),
    });
    try {
      for (const path of ['/v1/office-command', '/v1/command-recovery']) {
        const r = await fetch(api.origin + path, {
          method: 'POST',
          body: '{}',
        });
        expect(r.status).toBe(503);
        expect(r.headers.get('cache-control')).toBe('private, no-store');
        expect(await r.json()).toMatchObject({
          ok: false,
          error: { code: 'NOT_CONNECTED' },
        });
      }
      expect(
        (
          await fetch(api.origin + '/v1/office-command?extra=1', {
            method: 'POST',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fetch(api.origin + '/v1/office-command/other', {
            method: 'POST',
          })
        ).status,
      ).toBe(405);
      expect((await fetch(api.origin + '/unrelated')).status).toBe(404);
      expect(await (await fetch(api.origin + '/healthz')).json()).toMatchObject(
        {
          postwarFinance: {
            routeInstalled: true,
            configured: false,
            productionReady: false,
          },
        },
      );
    } finally {
      await api.shutdown();
    }
  });
  it('uses the genuine configured handler for CORS/method/size and never starts or connects the prepared consumer', async () => {
    const f = installed(),
      api = await startApiRuntime(config, {
        postwarFinanceConnection: f.connection,
      });
    try {
      const h = {
        origin: 'https://world.example',
        'content-type': 'application/json',
      };
      expect(
        (
          await fetch(api.origin + '/v1/office-command', {
            method: 'OPTIONS',
            headers: {
              origin: h.origin,
              'access-control-request-method': 'POST',
            },
          })
        ).status,
      ).toBe(204);
      expect(
        (await fetch(api.origin + '/v1/office-command', { headers: h })).status,
      ).toBe(405);
      expect(
        (
          await fetch(api.origin + '/v1/office-command', {
            method: 'POST',
            headers: { ...h, origin: 'https://other.example' },
            body: '{}',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(api.origin + '/v1/office-command', {
            method: 'POST',
            headers: h,
            body: 'x'.repeat(17000),
          })
        ).status,
      ).toBe(413);
      expect(
        (
          await fetch(api.origin + '/v1/office-command', {
            method: 'POST',
            headers: h,
            body: '{}',
          })
        ).status,
      ).toBe(401);
      expect(f.connection.runtime?.consumer.state()).toBe('PREPARED');
      expect(f.counts()).toEqual({ connects: 0, queries: 0 });
      expect(await (await fetch(api.origin + '/healthz')).json()).toMatchObject(
        {
          postwarFinance: {
            configured: true,
            productionReady: false,
            manualConsumptionOnly: true,
          },
        },
      );
    } finally {
      await api.shutdown();
    }
    expect(f.connection.runtime?.consumer.state()).toBe('STOPPED');
    expect(f.counts()).toEqual({ connects: 0, queries: 0 });
  });
  it('constructs a fixed-origin Request without trusting Host and writes safe Fetch response bytes', async () => {
    let observed: Request | undefined;
    const connection: PostwarFinanceConnection = {
      transportOrigins: [],
      handleCommand: createPostwarFinanceConnection(null).handleCommand,
      recover: createPostwarFinanceConnection(null).recover,
      status: 'NOT_CONNECTED',
      runtime: null,
      budget: null,
      async handle(r) {
        observed = r;
        return new Response(await r.text(), {
          status: 202,
          headers: {
            'content-type': 'application/json',
            connection: 'upgrade',
          },
        });
      },
      prepareManualConsumption() {
        throw Error('NOT_USED');
      },
      async consumeOnce() {
        return { status: 'BLOCKED', reason: 'TEST_ONLY' };
      },
      async stop() {},
    };
    const api = await startApiRuntime(config, {
      postwarFinanceConnection: connection,
    });
    try {
      const r = await fetch(api.origin + '/v1/office-command', {
        method: 'POST',
        headers: {
          host: 'untrusted.example',
          'content-type': 'application/json',
        },
        body: '{"transport":true}',
      });
      expect(r.status).toBe(202);
      expect(await r.json()).toEqual({ transport: true });
      expect(observed?.url).toBe('http://world-api.invalid/v1/office-command');
      expect(observed?.headers.has('host')).toBe(false);
      expect(r.headers.get('connection')).not.toBe('upgrade');
    } finally {
      await api.shutdown();
    }
  });
  it('aborts an active Fetch request when the Node client disconnects, then drains installation on shutdown', async () => {
    const entered = deferred(),
      aborted = deferred(),
      order: string[] = [];
    const connection: PostwarFinanceConnection = {
      transportOrigins: [],
      handleCommand: createPostwarFinanceConnection(null).handleCommand,
      recover: createPostwarFinanceConnection(null).recover,
      status: 'NOT_CONNECTED',
      runtime: null,
      budget: null,
      async handle(r) {
        order.push('handle');
        entered.resolve();
        await new Promise<void>((resolve) =>
          r.signal.addEventListener(
            'abort',
            () => {
              order.push('abort');
              aborted.resolve();
              resolve();
            },
            { once: true },
          ),
        );
        order.push('settled');
        return new Response('cancelled');
      },
      prepareManualConsumption() {
        throw Error('NOT_USED');
      },
      async consumeOnce() {
        return { status: 'BLOCKED', reason: 'TEST_ONLY' };
      },
      async stop() {
        order.push('stop');
      },
    };
    const api = await startApiRuntime(config, {
      postwarFinanceConnection: connection,
    });
    const req = nodeRequest(api.origin + '/v1/office-command', {
      method: 'POST',
    });
    req.on('error', () => {});
    req.flushHeaders();
    try {
      await entered.promise;
      req.destroy();
      await aborted.promise;
      await api.shutdown();
      expect(order).toEqual(['handle', 'abort', 'settled', 'stop']);
    } finally {
      req.destroy();
      await api.shutdown();
    }
  });
  it('stops accepting before aborting/draining active handlers and keeps shutdown idempotent', async () => {
    const entered = deferred(),
      aborted = deferred();
    let stops = 0;
    const connection: PostwarFinanceConnection = {
      transportOrigins: [],
      handleCommand: createPostwarFinanceConnection(null).handleCommand,
      recover: createPostwarFinanceConnection(null).recover,
      status: 'NOT_CONNECTED',
      runtime: null,
      budget: null,
      async handle(r) {
        entered.resolve();
        await new Promise<void>((resolve) =>
          r.signal.addEventListener(
            'abort',
            () => {
              aborted.resolve();
              resolve();
            },
            { once: true },
          ),
        );
        return new Response('cancelled');
      },
      prepareManualConsumption() {
        throw Error('NOT_USED');
      },
      async consumeOnce() {
        return { status: 'BLOCKED', reason: 'TEST_ONLY' };
      },
      async stop() {
        stops++;
      },
    };
    const api = await startApiRuntime(config, {
      postwarFinanceConnection: connection,
    });
    const req = nodeRequest(api.origin + '/v1/office-command', {
      method: 'POST',
    });
    req.on('error', () => {});
    req.flushHeaders();
    try {
      await entered.promise;
      const a = api.shutdown(),
        b = api.shutdown();
      await Promise.all([a, b, aborted.promise]);
      expect(stops).toBe(1);
      expect(api.ready()).toBe(false);
    } finally {
      req.destroy();
      await api.shutdown();
    }
  });
  it('bounds a noncooperative transport deadline and rejects increasing the10s budget', async () => {
    let aborted = false;
    const connection: PostwarFinanceConnection = {
      transportOrigins: [],
      handleCommand: createPostwarFinanceConnection(null).handleCommand,
      recover: createPostwarFinanceConnection(null).recover,
      status: 'NOT_CONNECTED',
      runtime: null,
      budget: null,
      handle(r) {
        r.signal.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
      prepareManualConsumption() {
        throw Error('NOT_USED');
      },
      async consumeOnce() {
        return { status: 'BLOCKED', reason: 'TEST_ONLY' };
      },
      async stop() {},
    };
    expect(() =>
      createPostwarFinanceNodeRoute(connection, { timeoutMs: 10001 }),
    ).toThrow('BOUNDED_TIMEOUT');
    const route = createPostwarFinanceNodeRoute(connection, { timeoutMs: 30 }),
      server = createServer((req, res) => {
        void route.handle(req, res);
      });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw Error('OWNED_LOOPBACK_REQUIRED');
    try {
      const response = await fetch(
        'http://127.0.0.1:' + address.port + '/v1/office-command',
        { method: 'POST' },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      });
      expect(aborted).toBe(true);
    } finally {
      route.stopAccepting();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await route.drain();
    }
  });
});
