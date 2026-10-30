/** TEST_ONLY isolated child process. No env DSN, passwords, publications,
 * arbitrary SQL/candidate port, Finance consumer, scheduler or WorldClock. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
if (process.env.ECONMIND_SOCIAL_NODE_TEST_HOST !== '1' || !process.send)
  throw Error('EXPLICIT_PARENT_OWNED_SOCIAL_NODE_HOST_REQUIRED');
const queued = [];
const defer = (value) => queued.push(value);
process.on('message', defer);
const requireApi = createRequire(
  new URL('../../apps/world-api/package.json', import.meta.url),
);
const { Pool } = requireApi('pg');
const Core = await import(requireApi.resolve('@econmind/core'));
const { createPostwarSocialConnection } =
  await import('../../apps/world-api/dist/runtime/postwar-social-connection.js');
const { startApiRuntime } =
  await import('../../apps/world-api/dist/runtime.js');
const { loadPostwarSocialConnectionOpeningAdoption } = await import(
  requireApi.resolve('@econmind/world-worker/social-runtime-connection')
);
const root = fileURLToPath(new URL('../../', import.meta.url));
const pools = [],
  queries = [],
  idleErrors = [];
let connection,
  api,
  active = false,
  closing,
  started = false,
  phase = 'OFFLINE_PREPARATION';
const send = (message) => {
  if (process.connected) process.send(message);
};
const diagnostic = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      Core.isSimTime(item)
        ? item.toCanonicalValue()
        : typeof item === 'bigint'
          ? item.toString()
          : item,
    ),
  );
async function close() {
  if (closing) return closing;
  closing = (async () => {
    const failures = [];
    try {
      await api?.shutdown();
    } catch (e) {
      failures.push(e);
    }
    try {
      await connection?.stop();
    } catch (e) {
      failures.push(e);
    }
    for (const p of pools)
      try {
        await p.end();
      } catch (e) {
        failures.push(e);
      }
    send({
      type: 'CLOSED',
      pid: process.pid,
      cleanupFailures: failures.map((e) =>
        e instanceof Error ? e.message : String(e),
      ),
      idleErrors,
    });
    if (process.connected) process.disconnect();
    if (failures.length || idleErrors.length) process.exitCode = 1;
  })();
  return closing;
}
async function start(c) {
  if (
    started ||
    !c ||
    typeof c.socket !== 'string' ||
    !c.socket.startsWith('/workspace/.cloud-setup/evidence/') ||
    c.socket.includes('..') ||
    c.port !== 5432 ||
    typeof c.simTime !== 'string' ||
    !/^(0|[1-9][0-9]*)$/u.test(c.simTime) ||
    !/^postwar_clone_social_node_[a-f0-9]{10}$/u.test(c.database) ||
    !/^WORKER_SOCIAL_NODE_[A-F0-9]{10}$/u.test(c.workerId)
  )
    throw Error('OWNED_SOCIAL_NODE_FIXTURE_REQUIRED');
  for (const [kind, role] of Object.entries(c.roles ?? {})) {
    const prefix = {
      bounded: 'read',
      intake: 'intake',
      source: 'source',
      worker: 'worker',
    }[kind];
    if (
      !prefix ||
      !new RegExp('^social_node_' + prefix + '_[a-f0-9]{10}$', 'u').test(role)
    )
      throw Error('OWNED_SEPARATED_SOCIAL_ROLES_REQUIRED');
  }
  if (
    Object.keys(c.roles ?? {}).length !== 4 ||
    new Set(Object.values(c.roles)).size !== 4
  )
    throw Error('FOUR_SEPARATE_SOCIAL_ROLES_REQUIRED');
  if (
    c.auth?.projectRef !== 'abcdefghijklmnopqrst' ||
    c.auth.expectedIssuer !==
      'https://abcdefghijklmnopqrst.supabase.co/auth/v1' ||
    c.auth.jwksUrl !== c.auth.expectedIssuer + '/.well-known/jwks.json' ||
    c.auth.jwk?.kid !== 'TEST_ONLY_SOCIAL_NODE' ||
    c.auth.jwk.d !== undefined
  )
    throw Error('TEST_ONLY_PUBLIC_JWKS_REQUIRED');
  started = true;
  const observedQuery = async (executor, kind, sql, values) => {
    const metric = {
      pool: kind,
      phase,
      sql: typeof sql === 'string' ? sql : sql.text,
      startedAtMonotonicMs: performance.now(),
    };
    queries.push(metric);
    try {
      const result = await executor.query(sql, values);
      metric.elapsedMs = performance.now() - metric.startedAtMonotonicMs;
      const frames = Array.isArray(result) ? result : [result];
      metric.rows = frames.reduce(
        (count, frame) =>
          count + (Array.isArray(frame.rows) ? frame.rows.length : 0),
        0,
      );
      if (metric.phase === 'ONLINE') {
        metric.byteMeasurement = 'JSON_ENCODED_PG_ROW_UTF8_NOT_WIRE_PROTOCOL';
        metric.maxRowBytes = 0;
        metric.resultBytes = 2;
        for (const frame of frames)
          for (const row of frame.rows ?? []) {
            const bytes = Buffer.byteLength(
              JSON.stringify(row, (_key, value) =>
                typeof value === 'bigint' ? value.toString() : value,
              ),
            );
            metric.maxRowBytes = Math.max(metric.maxRowBytes, bytes);
            metric.resultBytes += bytes + 1;
          }
      }
      return result;
    } catch (error) {
      metric.elapsedMs = performance.now() - metric.startedAtMonotonicMs;
      metric.error = {
        name: error.name,
        message: error.message,
        code: error.code ?? null,
      };
      throw error;
    }
  };
  const pool = (kind) => {
    const p = new Pool({
      host: c.socket,
      port: c.port,
      database: c.database,
      user: c.roles[kind],
      ssl: false,
      password: async () => '',
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + c.subject,
      application_name: 'TEST_ONLY_SOCIAL_NODE_CHILD_' + process.pid,
    });
    p.on('error', (e) => idleErrors.push(e.message));
    let ending;
    const observed = new Proxy(p, {
      get(target, key, receiver) {
        if (key === 'end') return () => (ending ??= target.end());
        if (key === 'connect')
          return async () => {
            const client = await target.connect();
            return new Proxy(client, {
              get(t, k, r) {
                if (k === 'query')
                  return (sql, values) => observedQuery(t, kind, sql, values);
                const v = Reflect.get(t, k, r);
                return typeof v === 'function' ? v.bind(t) : v;
              },
            });
          };
        if (key === 'query')
          return (sql, values) => observedQuery(target, kind, sql, values);
        const value = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    pools.push(observed);
    return observed;
  };
  const began = performance.now();
  const openingAdoption =
    await loadPostwarSocialConnectionOpeningAdoption(root);
  connection = createPostwarSocialConnection({
    environment: 'ci',
    boundedReadPool: pool('bounded'),
    intakePool: pool('intake'),
    sourcePool: pool('source'),
    workerPool: pool('worker'),
    boundedReaderRole: c.roles.bounded,
    sourceReaderRole: c.roles.source,
    intakeRole: c.roles.intake,
    workerRole: c.roles.worker,
    authorizationPublisherRole: c.authorizationPublisherRole,
    workerId: c.workerId,
    openingAdoption,
    admittedWorldPins: c.admittedWorldPins,
    modelVersion: c.modelVersion,
    auth: {
      ...c.auth,
      audience: 'authenticated',
      fetch: async (url) => {
        if (String(url) !== c.auth.jwksUrl)
          throw Error('PINNED_TEST_ONLY_JWKS_REQUIRED');
        const response = Response.json({ keys: [c.auth.jwk] });
        Object.defineProperty(response, 'url', { value: c.auth.jwksUrl });
        return response;
      },
    },
    clock: Object.freeze({
      nowReal: () => new Date().toISOString(),
      simTime: async () => c.simTime,
    }),
    resolveActorId: async (subject) =>
      subject === c.subject ? c.actorId : null,
    allowedOrigins: ['https://pages.example'],
  });
  const prepareBegan = performance.now(),
    beforePrepareMemory = process.memoryUsage();
  await connection.prepare();
  const preparation = {
    method: 'PRODUCT_POSTWAR_SOCIAL_CONNECTION_PREPARE',
    callerSeedOrReadyProvided: false,
    milliseconds: performance.now() - prepareBegan,
    before: {
      heapUsed: beforePrepareMemory.heapUsed,
      rss: beforePrepareMemory.rss,
    },
    after: {
      heapUsed: process.memoryUsage().heapUsed,
      rss: process.memoryUsage().rss,
    },
    consumerState: connection.preparedRuntime?.consumer.state(),
  };
  if (preparation.consumerState !== 'PREPARED')
    throw Error('PRODUCT_SOCIAL_PREPARATION_MUST_LEAVE_CONSUMER_PREPARED');
  phase = 'ONLINE';
  api = await startApiRuntime(
    { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 5000 },
    { postwarSocialConnection: connection },
  );
  send({
    type: 'LISTENING_TEST_ONLY',
    pid: process.pid,
    origin: api.origin,
    consumerState: connection.preparedRuntime?.consumer.state(),
    nodeRuntime: 'STANDARD_NODE_API_RUNTIME',
    constructor: 'createPostwarSocialConnection',
    coldMilliseconds: performance.now() - began,
    preparation,
    frozenSimTime: c.simTime,
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
  });
}
const receive = (message) => {
  void (async () => {
    if (message.operation === 'start') return start(message.config);
    if (message.operation === 'close') return close();
    if (!connection || !api || active || closing)
      throw Error('SOCIAL_NODE_HOST_NOT_IDLE_READY');
    if (message.operation === 'consume') {
      active = true;
      try {
        const consumer = connection.preparedRuntime?.consumer;
        if (!consumer || consumer.state() !== 'PREPARED')
          throw Error('EXACT_SINGLE_PREPARED_SOCIAL_CONSUMER_REQUIRED');
        consumer.startPreparation();
        const step = await consumer.consumeOnce();
        send({ type: 'RESULT', id: message.id, result: diagnostic(step) });
      } finally {
        active = false;
      }
    } else if (message.operation === 'inspect')
      send({
        type: 'RESULT',
        id: message.id,
        result: {
          pid: process.pid,
          consumerState: connection.preparedRuntime?.consumer.state(),
          queries,
          onlineQuerySummary: {
            count: queries.filter((q) => q.phase === 'ONLINE').length,
            maximumJsonRowBytes: Math.max(
              0,
              ...queries
                .filter((q) => q.phase === 'ONLINE')
                .map((q) => q.maxRowBytes ?? 0),
            ),
            maximumSqlMilliseconds: Math.max(
              0,
              ...queries
                .filter((q) => q.phase === 'ONLINE')
                .map((q) => q.elapsedMs ?? 0),
            ),
            canonicalOpeningSeedQueries: queries.filter(
              (q) =>
                q.phase === 'ONLINE' &&
                /canonical_payload[\s\S]*from\s+world_v2\.opening_seed/iu.test(
                  q.sql,
                ),
            ).length,
          },
          idleErrors,
          heapUsed: process.memoryUsage().heapUsed,
          rss: process.memoryUsage().rss,
        },
      });
    else throw Error('FIXED_SOCIAL_NODE_TEST_OPERATION_REQUIRED');
  })().catch((error) =>
    send({
      type: 'ERROR',
      id: message.id,
      name: error.name,
      message: error.message,
      code: error.code ?? null,
    }),
  );
};
process.off('message', defer);
process.on('message', receive);
for (const value of queued) receive(value);
process.on('SIGTERM', () => void close());
process.on('disconnect', () => void close());
