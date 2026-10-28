/** TEST_ONLY owned native process harness. No env DSN, production host, pool
 * secret, source publication, scheduler or World/Clock. Configuration arrives
 * only over the parent-owned IPC channel and permits UDS/local fixture roles. */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
if (process.env.ECONMIND_BUDGET_CAPACITY_TEST_HOST !== '1' || !process.send)
  throw Error('EXPLICIT_PARENT_OWNED_NATIVE_HOST_REQUIRED');
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
const send = (value) => {
  if (process.connected) process.send(value);
};
async function close() {
  if (closing) return;
  closing = true;
  const server = state?.server ?? pendingServer;
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await state?.runtime.consumer.stop();
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
    !/^WORKER_NATIVE_BUDGET_[A-F0-9]+$/u.test(c.workerId)
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
  const queries = [];
  const raw = new W.PostgresSqlDatabase(worker),
    database = W.createFinanceBudgetAuthorizationDatabase({
      query: async (sql, args) => {
        queries.push(sql);
        return raw.query(sql, args);
      },
      transaction: (work) =>
        raw.transaction((tx) =>
          work({
            query: async (sql, args) => {
              queries.push(sql);
              return tx.query(sql, args);
            },
          }),
        ),
    });
  const intakePool = W.createFinanceBudgetIntakeAuthorizationPool(rawIntake),
    clock = {
      nowReal: () => new Date().toISOString(),
      simTime: async () => '0',
    };
  const started = performance.now(),
    heap = process.memoryUsage().heapUsed;
  const capacitySource = W.createPostgresFinanceBudgetCapacitySource({
    worldId: c.pins.worldId,
    countryId: c.countryId,
    expectedRawSourceSHA256: c.sourceSHA256,
  });
  const { runtime } = W.createBoundedFinanceBudgetIntakeRuntime({
    capacitySource,
    intakePool,
    workerDatabase: database,
    worldId: c.pins.worldId,
    workerId: c.workerId,
    clock,
    sha256Hex: sha,
    environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test', VITEST: 'true' },
  });
  runtime.consumer.startPreparation();
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
  const handler = createBoundedOfficeCommandFetchHandler({
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
  const server = createServer(async (req, res) => {
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
  state = {
    runtime,
    server,
    pools: [worker, rawIntake, readPool],
    metrics,
    queries,
  };
  send({
    type: 'LISTENING_TEST_ONLY',
    base,
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
        result: await state.runtime.consumer.consumeOnce(),
      });
    else if (message.operation === 'inspect' && state)
      send({
        type: 'RESULT',
        id: message.id,
        result: {
          heapUsed: process.memoryUsage().heapUsed,
          rss: process.memoryUsage().rss,
          metrics: state.metrics,
          queries: state.queries,
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
