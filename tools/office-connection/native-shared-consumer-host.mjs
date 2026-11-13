/** TEST_ONLY isolated child process. No env DSN, passwords, publications,
 * arbitrary SQL/candidate port, scheduler or WorldClock. One shared finite consumer. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
if (process.env.ECONMIND_SHARED_CONSUMER_TEST_HOST !== '1' || !process.send)
  throw Error('EXPLICIT_PARENT_OWNED_SHARED_CONSUMER_HOST_REQUIRED');
const queued = [];
const defer = (value) => queued.push(value);
process.on('message', defer);
const requireApi = createRequire(
  new URL('../../apps/world-api/package.json', import.meta.url),
);
const { Pool } = requireApi('pg');
const Core = await import(requireApi.resolve('@econmind/core'));
const {
  createPostwarFinanceSocialApiConnection,
  readPostwarFinanceSocialApiConnection,
} =
  await import('../../apps/world-api/dist/runtime/postwar-finance-social-connection.js');
const WorkerSocial = await import(
  requireApi.resolve('@econmind/world-worker/social-runtime-connection')
);
const WorkerShared = await import(
  requireApi.resolve('@econmind/world-worker/finance-social-runtime-connection')
);
const FinanceSource = await import(
  requireApi.resolve('@econmind/world-worker/finance-budget-runtime')
);
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
  binding,
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
      if (connection) await connection.stop();
      else await binding?.stop();
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
    !/^postwar_clone_shared_consumer_[a-f0-9]{10}$/u.test(c.database) ||
    !/^WORKER_SHARED_CONSUMER_[A-F0-9]{10}$/u.test(c.workerId)
  )
    throw Error('OWNED_SHARED_CONSUMER_FIXTURE_REQUIRED');
  for (const [kind, role] of Object.entries(c.roles ?? {})) {
    const prefix = {
      bounded: 'read',
      intake: 'intake',
      source: 'source',
      worker: 'worker',
      publisher: 'pub',
    }[kind];
    if (
      !prefix ||
      !new RegExp('^shared_' + prefix + '_[a-f0-9]{10}$', 'u').test(role)
    )
      throw Error('OWNED_SEPARATED_SOCIAL_ROLES_REQUIRED');
  }
  if (
    Object.keys(c.roles ?? {}).length !== 5 ||
    new Set(Object.values(c.roles)).size !== 5
  )
    throw Error('FOUR_SEPARATE_SOCIAL_ROLES_REQUIRED');
  if (
    c.auth?.projectRef !== 'abcdefghijklmnopqrst' ||
    c.auth.expectedIssuer !==
      'https://abcdefghijklmnopqrst.supabase.co/auth/v1' ||
    c.auth.jwksUrl !== c.auth.expectedIssuer + '/.well-known/jwks.json' ||
    c.auth.jwk?.kid !== 'TEST_ONLY_SHARED_CONSUMER' ||
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
      application_name: 'TEST_ONLY_SHARED_CONSUMER_CHILD_' + process.pid,
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
  const boundedReadPool = pool('bounded'),
    intakePool = pool('intake'),
    sourcePool = pool('source'),
    workerPool = pool('worker');
  const clock = Object.freeze({
    nowReal: () => new Date().toISOString(),
    simTime: async () => c.simTime,
  });
  const socialWorker = WorkerSocial.createPostwarSocialRuntimeConnection({
    worldId: c.admittedWorldPins.worldId,
    workerId: c.workerId,
    workerPool,
    workerRole: c.roles.worker,
    openingAdoption,
  });
  const capacitySource =
    FinanceSource.createPostgresFinanceBudgetWorldCapacitySource({
      worldId: c.admittedWorldPins.worldId,
      countries: c.financeCountries,
      historyMode: 'BUDGET_SOCIAL',
    });
  binding = WorkerShared.createPostwarFinanceSocialRuntimeConnection({
    socialConnection: socialWorker,
    capacitySource,
    intakePool,
    clock,
    environment: 'ci',
  });
  const socialConfiguration = {
    environment: 'ci',
    boundedReadPool,
    intakePool,
    sourcePool,
    workerPool,
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
    clock,
    resolveActorId: async (subject) =>
      c.actors.find((a) => a.subject === subject)?.actorId ?? null,
    allowedOrigins: ['https://pages.example'],
  };
  const prepareBegan = performance.now(),
    beforePrepareMemory = process.memoryUsage();
  connection = await createPostwarFinanceSocialApiConnection({
    binding,
    social: socialConfiguration,
    financeAllowedOrigins: ['https://pages.example'],
  });
  await connection.prepare();
  const preparation = {
    method: 'PRODUCT_FINANCE_SOCIAL_API_OWNER_PREPARE',
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
    consumerState:
      WorkerShared.readPostwarFinanceSocialRuntimeBinding(
        binding,
      ).runtime.consumer.state(),
  };
  if (preparation.consumerState !== 'PREPARED')
    throw Error('PRODUCT_SOCIAL_PREPARATION_MUST_LEAVE_CONSUMER_PREPARED');
  phase = 'ONLINE';
  api = await startApiRuntime(
    { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 5000 },
    { postwarFinanceSocialConnection: connection },
  );
  send({
    type: 'LISTENING_TEST_ONLY',
    pid: process.pid,
    origin: api.origin,
    consumerState:
      WorkerShared.readPostwarFinanceSocialRuntimeBinding(
        binding,
      ).runtime.consumer.state(),
    nodeRuntime: 'STANDARD_NODE_API_RUNTIME',
    constructor: 'createPostwarFinanceSocialApiConnection',
    sharedNodeControlIdentity: api.sharedOfficeConsumer === connection.control,
    borrowersExposeConsumer: Boolean(
      readPostwarFinanceSocialApiConnection(connection).finance.runtime ||
      readPostwarFinanceSocialApiConnection(connection).social.preparedRuntime,
    ),
    financeCountryIds:
      WorkerShared.readPostwarFinanceSocialRuntimeBinding(binding)
        .financeCountryIds,
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
      throw Error('SHARED_CONSUMER_HOST_NOT_IDLE_READY');
    if (message.operation === 'consume') {
      active = true;
      try {
        const consumer =
          WorkerShared.readPostwarFinanceSocialRuntimeBinding(binding).runtime
            .consumer;
        if (
          !api.sharedOfficeConsumer ||
          api.sharedOfficeConsumer !== connection.control
        )
          throw Error('GENUINE_SOLE_NODE_CONSUMER_CONTROL_REQUIRED');
        if (consumer.state() === 'PREPARED')
          api.sharedOfficeConsumer.startPreparation();
        else if (consumer.state() !== 'READY')
          throw Error('SOLE_CONSUMER_NOT_READY');
        const step = await api.sharedOfficeConsumer.consumeOnce();
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
          consumerState:
            WorkerShared.readPostwarFinanceSocialRuntimeBinding(
              binding,
            ).runtime.consumer.state(),
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
    else throw Error('FIXED_SHARED_CONSUMER_TEST_OPERATION_REQUIRED');
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
