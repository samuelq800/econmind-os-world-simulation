/** TEST_ONLY owned native process harness. No env DSN, production host, pool
 * secret, source publication, scheduler or World/Clock. Configuration arrives
 * only over the parent-owned IPC channel and permits UDS/local fixture roles. */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
if (process.env.ECONMIND_BUDGET_CAPACITY_TEST_HOST !== '1' || !process.send)
  throw Error('EXPLICIT_PARENT_OWNED_NATIVE_HOST_REQUIRED');
const installerFlag = process.env.ECONMIND_BUDGET_CAPACITY_CONNECTION_INSTALLER;
if (installerFlag !== undefined && installerFlag !== '1')
  throw Error('EXPLICIT_CONNECTION_INSTALLER_FLAG_REQUIRED');
const useConnectionInstaller = installerFlag === '1';
const pendingMessages = [];
const queueMessage = (message) => pendingMessages.push(message);
process.on('message', queueMessage);
const requireApi = createRequire(
  new URL('../../apps/world-api/package.json', import.meta.url),
);
const { Pool } = requireApi('pg');
const W = await import(
  requireApi.resolve('@econmind/world-worker/finance-budget-runtime')
);
const { createBoundedOfficeCommandFetchHandler } =
  await import('../../apps/world-api/dist/integration/bounded-office-command-fetch-handler.js');
const {
  createPostwarCurrentSeatFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} =
  await import('../../apps/world-api/dist/runtime-preparation/postwar-office-runtime-fetch-handler.js');
const C = await import(requireApi.resolve('@econmind/core'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
let state = null,
  closing = false;
const pendingPools = [];
let pendingServer = null;
let pendingApiRuntime = null;
const send = (value) => {
  if (process.connected) process.send(value);
};
async function close() {
  if (closing) return;
  closing = true;
  const apiRuntime = state?.apiRuntime ?? pendingApiRuntime;
  const server = state?.server ?? pendingServer;
  if (apiRuntime) await apiRuntime.shutdown();
  else {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (state?.connection) await state.connection.stop();
    else await state?.runtime.consumer.stop();
  }
  await Promise.all((state?.pools ?? pendingPools).map((pool) => pool.end()));
  send({ type: 'CLOSED', ownedCleanup: true });
  if (process.connected) process.disconnect();
}
async function start(c) {
  if (
    state ||
    typeof c.socket !== 'string' ||
    !c.socket.startsWith('/') ||
    c.socket.includes('..') ||
    !/^postwar_clone_[a-z0-9_]+$/u.test(c.database) ||
    !/^budget_test_worker_[a-f0-9]{8}$/u.test(c.workerRole) ||
    !/^budget_test_intake_[a-f0-9]{8}$/u.test(c.intakeRole) ||
    c.readerRole !== 'fixture_postwar_bounded_reader' ||
    !/^WORKER_NATIVE_BUDGET_[A-F0-9]+$/u.test(c.workerId) ||
    (c.historyMode !== undefined &&
      c.historyMode !== 'BUDGET_ONLY' &&
      c.historyMode !== 'BUDGET_SOCIAL')
  )
    throw Error('OWNED_FIXTURE_CONFIGURATION_REQUIRED');
  const pool = (role) => {
    const p = new Pool({
      host: c.socket,
      port: c.port,
      database: c.database,
      user: role,
      password: async () => '',
      ssl: false,
      max: 2,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + c.subject,
    });
    p.on('error', () => undefined);
    pendingPools.push(p);
    return p;
  };
  const worker = pool(c.workerRole),
    rawIntake = pool(c.intakeRole),
    readPool = pool(c.readerRole);
  const queries = [],
    queryMetrics = [],
    failures = [];
  const failed = (error) => {
    const chain = [];
    let e = error;
    while (e instanceof Error && chain.length < 8) {
      chain.push({ name: e.name, message: e.message, code: e.code ?? null });
      e = e.cause;
    }
    failures.push(chain);
  };
  const observed = async (executor, sql, args) => {
    queries.push(sql);
    const result = await executor.query(sql, args);
    queryMetrics.push({
      sql,
      rows: result.rows.length,
      bytes: Buffer.byteLength(
        JSON.stringify(result.rows, (_key, v) =>
          typeof v === 'bigint' ? String(v) : v,
        ),
      ),
    });
    return result;
  };
  const raw = new W.PostgresSqlDatabase(worker),
    observedDatabase = {
      query: (sql, args) => observed(raw, sql, args),
      transaction: async (work) => {
        try {
          return await raw.transaction((tx) =>
            work({ query: (sql, args) => observed(tx, sql, args) }),
          );
        } catch (error) {
          failed(error);
          throw error;
        }
      },
    },
    database = W.createFinanceBudgetAuthorizationDatabase(observedDatabase);
  const intakePool = W.createFinanceBudgetIntakeAuthorizationPool(rawIntake),
    rawClock = {
      nowReal: () => new Date().toISOString(),
      simTime: async () => (c.historyMode === 'BUDGET_SOCIAL' ? '3000' : '0'),
    },
    clock = useConnectionInstaller ? Object.freeze(rawClock) : rawClock;
  const auth = {
    projectRef: c.projectRef,
    expectedIssuer: c.issuer,
    jwksUrl: c.jwksUrl,
    audience: 'authenticated',
    fetch: async (url) => {
      if (String(url) !== c.jwksUrl) throw Error('PINNED_JWKS_ONLY');
      const response = Response.json({ keys: [c.jwk] });
      Object.defineProperty(response, 'url', { value: c.jwksUrl });
      return response;
    },
  };
  const started = performance.now(),
    heap = process.memoryUsage().heapUsed;
  const capacitySource = W.createPostgresFinanceBudgetCapacitySource({
    worldId: c.pins.worldId,
    countryId: c.countryId,
    expectedRawSourceSHA256: c.sourceSHA256,
    historyMode: c.historyMode ?? 'BUDGET_ONLY',
  });
  const connection = useConnectionInstaller
    ? (
        await import('../../apps/world-api/dist/runtime/postwar-finance-connection.js')
      ).createPostwarFinanceConnection({
        worldId: c.pins.worldId,
        countryId: c.countryId,
        workerId: c.workerId,
        admittedWorldPins: c.pins,
        expectedCapacitySourceSHA256: c.sourceSHA256,
        readPool,
        intakePool: rawIntake,
        workerDatabase: observedDatabase,
        readerRole: c.readerRole,
        intakeRole: c.intakeRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
        auth,
        resolveActorId: async (subject) =>
          subject === c.subject ? 'ACTOR_NATIVE_BUDGET_TEST_ONLY' : null,
        clock,
        allowedOrigins: [c.ui],
        // This executable is explicitly an owned isolated CI fixture. Preserve
        // that actual environment; no formal host is disguised or activated.
        environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test', VITEST: 'true' },
      })
    : null;
  const runtime =
    connection?.runtime ??
    W.createBoundedFinanceBudgetIntakeRuntime({
      capacitySource,
      intakePool,
      workerDatabase: database,
      worldId: c.pins.worldId,
      workerId: c.workerId,
      clock,
      sha256Hex: sha,
      environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test', VITEST: 'true' },
    }).runtime;
  if (connection) connection.prepareManualConsumption();
  else runtime.consumer.startPreparation();
  const handler = connection
    ? (request) => connection.handle(request)
    : createBoundedOfficeCommandFetchHandler({
        allowedOrigins: [c.ui],
        composition: {
          readPool,
          readerRole: c.readerRole,
          writerPool: intakePool,
          writerRole: c.intakeRole,
          authorizationPublisherRole: c.authorizationPublisherRole,
          admittedWorldPins: c.pins,
          auth,
          resolveActorId: async (subject) =>
            subject === c.subject ? 'ACTOR_NATIVE_BUDGET_TEST_ONLY' : null,
          clock,
          runtime,
        },
      });
  const seat = createPostwarCurrentSeatFetchHandler({
    pool: readPool,
    readerRole: c.readerRole,
    authorizationPublisherRole: c.authorizationPublisherRole,
    admittedWorldPins: c.pins,
    auth,
    modelVersion: C.WORLD_MODEL_VERSION,
    endpointPins: {
      origin: c.origin,
      projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_ONLY_BUDGET_HTTP',
    },
    routeOptions: { allowedOrigins: [c.ui] },
  });
  const metrics = [];
  let base = '';
  let server = null,
    apiRuntime = null;
  if (connection) {
    const { startApiRuntime } =
      await import('../../apps/world-api/dist/runtime.js');
    apiRuntime = await startApiRuntime(
      {
        environment: 'ci',
        host: '127.0.0.1',
        port: 0,
        shutdownGraceMs: 5000,
      },
      { postwarFinanceConnection: connection },
    );
    pendingApiRuntime = apiRuntime;
    base = apiRuntime.origin;
  } else {
    server = createServer(async (req, res) => {
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) abort.abort();
      });
      const began = performance.now(),
        before = process.memoryUsage().heapUsed;
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          const b = Buffer.from(chunk);
          size += b.length;
          if (size > 16384) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(b);
        }
        const request = new Request(base + req.url, {
          method: req.method ?? 'GET',
          headers: req.headers,
          ...(['GET', 'HEAD'].includes(req.method ?? 'GET')
            ? {}
            : { body: Buffer.concat(chunks) }),
          signal: abort.signal,
        });
        const response =
          new URL(request.url).pathname === C.AUTHENTICATED_CURRENT_SEAT_PATH
            ? await seat(request)
            : await handler(request);
        if (!response) {
          res.writeHead(404).end();
          return;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        metrics.push({
          path: new URL(request.url).pathname,
          status: response.status,
          bytes: bytes.length,
          milliseconds: performance.now() - began,
          heapDeltaBytes: process.memoryUsage().heapUsed - before,
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(bytes);
      } catch {
        if (!res.destroyed) res.writeHead(503).end();
      }
    });
    pendingServer = server;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw Error('OWNED_LOOPBACK_REQUIRED');
    base = `http://127.0.0.1:${address.port}`;
  }
  state = {
    runtime,
    connection,
    server,
    apiRuntime,
    pools: [worker, rawIntake, readPool],
    metrics,
    queries,
    queryMetrics,
    failures,
  };
  send({
    type: 'LISTENING_TEST_ONLY',
    base,
    ...(connection
      ? {
          connectionInstaller: 'STANDARD_EXPLICIT_FINANCE_CONNECTION',
          nodeRuntime: 'STANDARD_NODE_API_RUNTIME',
        }
      : {}),
    coldConstruction: {
      milliseconds: performance.now() - started,
      heapDeltaBytes: process.memoryUsage().heapUsed - heap,
    },
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
  });
}
const receiveMessage = (message) => {
  void (async () => {
    if (message.operation === 'start') await start(message.config);
    else if (message.operation === 'consume' && state)
      send({
        type: 'RESULT',
        id: message.id,
        result: state.connection
          ? await state.connection.consumeOnce()
          : await state.runtime.consumer.consumeOnce(),
      });
    else if (message.operation === 'inspect' && state)
      send({
        type: 'RESULT',
        id: message.id,
        result: {
          ...(state.connection
            ? {
                connectionInstaller: 'STANDARD_EXPLICIT_FINANCE_CONNECTION',
                nodeRuntime: 'STANDARD_NODE_API_RUNTIME',
              }
            : {}),
          heapUsed: process.memoryUsage().heapUsed,
          rss: process.memoryUsage().rss,
          metrics: state.metrics,
          queries: state.queries,
          queryMetrics: state.queryMetrics,
          failures: state.failures,
        },
      });
    else if (message.operation === 'close') await close();
    else throw Error('FIXED_NATIVE_OPERATION_REQUIRED');
  })().catch((error) =>
    send({
      type: 'ERROR',
      id: message.id,
      name: error.name,
      message: error.message,
      code: 'code' in error ? error.code : null,
    }),
  );
};
process.off('message', queueMessage);
process.on('message', receiveMessage);
for (const message of pendingMessages) receiveMessage(message);
process.on('SIGTERM', () => {
  void close();
});
