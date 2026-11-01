/** Parent-owned isolated registered-host acceptance. No DDL, registration,
 * arbitrary SQL/row callbacks, World initialization, lease or Clock start. */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { wireColdError } from './native-mixed-cold-errors.mjs';
if (process.env.ECONMIND_REGISTERED_FINAL_NODE_CHILD !== '1' || !process.send)
  throw Error('EXPLICIT_OWNED_REGISTERED_NODE_CHILD_REQUIRED');
const requireApi = createRequire(
  new URL('../../apps/world-api/package.json', import.meta.url),
);
const { Pool } = requireApi('pg');
const C = await import(requireApi.resolve('@econmind/core'));
const Social = await import(
  requireApi.resolve('@econmind/world-worker/social-runtime-connection')
);
const Shared = await import(
  requireApi.resolve('@econmind/world-worker/finance-social-runtime-connection')
);
const Finance = await import(
  requireApi.resolve('@econmind/world-worker/finance-budget-runtime')
);
const Host = await import(
  requireApi.resolve('@econmind/world-worker/runtime-command-host')
);
const { createPostgresWorldActorResolver } =
  await import('../../apps/world-api/dist/integration/postgres-world-actor-registry.js');
const { startRegisteredPostwarOfficeNodeBootstrap } =
  await import('../../apps/world-api/dist/runtime/registered-postwar-office-node-bootstrap.js');
const { ownedPool } =
  await import('../../apps/world-api/dist/runtime/postwar-office-node-bootstrap.js');
const pools = [],
  idleErrors = [],
  databaseDiagnostics = [];
const {
  loadRegisteredNodeStartupArtifacts,
  retireRegisteredNodeRentSourceAfterDrain,
} =
  await import('../../apps/world-api/dist/runtime/registered-node-beneficial-rent-loader.js');
const Beneficial = await import(
  requireApi.resolve('@econmind/world-worker/beneficial-housing-rent-source')
);
let rentSource,
  proofExposed = false,
  sourceEvidence;
let node,
  binding,
  social,
  matchPublicationDatabase,
  publicationDatabase,
  clock,
  actor,
  closing,
  starting = false;
const send = (m) => {
  if (process.connected) process.send(m);
};
const wire = (v) =>
  JSON.parse(
    JSON.stringify(v, (_k, x) =>
      C.isSimTime(x)
        ? x.toCanonicalValue()
        : typeof x === 'bigint'
          ? x.toString()
          : x,
    ),
  );
async function stop() {
  if (closing) return closing;
  closing = (async () => {
    const errors = [];
    let drained = !binding;
    for (const fn of [
      () => node?.shutdown(),
      async () => {
        await binding?.stop();
        drained = true;
      },
      async () => {
        if (drained) await social?.close();
      },
    ])
      try {
        await fn();
      } catch (e) {
        errors.push(wireColdError(e));
      }
    if (rentSource && (drained || !proofExposed))
      try {
        retireRegisteredNodeRentSourceAfterDrain(rentSource);
      } catch (e) {
        errors.push(wireColdError(e));
      }
    if (!drained)
      errors.push({
        message: 'REGISTERED_FINAL_DRAIN_UNCONFIRMED_POOLS_RETAINED',
      });
    for (const p of drained ? pools : [])
      try {
        await p.end();
      } catch (e) {
        errors.push(wireColdError(e));
      }
    return {
      pid: process.pid,
      errors,
      idleErrors,
      pools: pools.map((p) => ({
        total: p.totalCount,
        idle: p.idleCount,
        waiting: p.waitingCount,
      })),
    };
  })();
  return closing;
}
async function initialize(d) {
  if (starting || node) throw Error('REGISTERED_CHILD_ALREADY_STARTED');
  starting = true;
  if (
    d.schemaVersion !== 'test-only-registered-final-child-host-v1' ||
    d.worldId !== 'WORLD_POSTWAR_GCU_OPENING_20261029_V1' ||
    d.seedFingerprint !==
      'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a' ||
    !d.socket.startsWith('/workspace/.cloud-setup/evidence/') ||
    !/^postwar_clone_[a-z0-9_]+$/u.test(d.database) ||
    d.port !== 5432
  )
    throw Error('EXACT_ISOLATED_VERIFIED_CHILD_REGISTERED_INPUT_REQUIRED');
  if (
    !d.beneficialRent ||
    !Array.isArray(d.countries) ||
    d.countries.length < 1 ||
    d.countries.length > 70 ||
    new Set(d.countries.map((x) => x.countryId)).size !== d.countries.length ||
    d.countries.some(
      (x) =>
        !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(x.countryId) ||
        !/^[a-f0-9]{64}$/u.test(x.expectedRawSourceSHA256),
    )
  )
    throw Error('ACTUAL_CHILD_COUNTRY_SELECTORS_REQUIRED');
  if (
    d.install?.industry === true &&
    (!/^[a-z][a-z0-9_]{0,62}$/u.test(d.industryPublicationRole) ||
      [
        d.workerRole,
        d.sourceRole,
        d.intakeRole,
        d.readRole,
        d.publicationRole,
      ].includes(d.industryPublicationRole))
  )
    throw Error('SEPARATE_ACTUAL_INDUSTRY_PUBLISHER_REQUIRED');
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(d.matchPublicationRole) ||
    [
      d.workerRole,
      d.sourceRole,
      d.intakeRole,
      d.readRole,
      d.publicationRole,
      d.industryPublicationRole,
    ].includes(d.matchPublicationRole)
  )
    throw Error('SEPARATE_ACTUAL_SOCIAL_MATCH_PUBLISHER_REQUIRED');
  const begin = performance.now();
  const pool = (role) => {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(role))
      throw Error('FIXED_ROLE_REQUIRED');
    const p = ownedPool(
      new Pool({
        host: d.socket,
        port: d.port,
        database: d.database,
        user: role,
        password: async () => '',
        ssl: false,
        max: 1,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 1000,
      }),
    );
    p.on('error', (e) => idleErrors.push(e.message));
    const record = (operation, error) => {
      const item = { role, operation, error: wireColdError(error) };
      databaseDiagnostics.push(item);
      process.stderr.write(
        JSON.stringify({ kind: 'REGISTERED_DATABASE_DIAGNOSTIC', ...item }) +
          '\n',
      );
    };
    const observed = new Proxy(p, {
      get(target, key) {
        if (key === 'connect')
          return async () => {
            let client;
            try {
              client = await target.connect();
            } catch (error) {
              record('CONNECT', error);
              throw error;
            }
            return new Proxy(client, {
              get(c, k) {
                if (k === 'query')
                  return async (...args) => {
                    try {
                      return await Reflect.apply(c.query, c, args);
                    } catch (error) {
                      record(
                        typeof args[0] === 'string' ? args[0] : 'QUERY_CONFIG',
                        error,
                      );
                      throw error;
                    }
                  };
                const value = Reflect.get(c, k, c);
                return typeof value === 'function' ? value.bind(c) : value;
              },
            });
          };
        if (key === 'query')
          return async (...args) => {
            try {
              return await Reflect.apply(target.query, target, args);
            } catch (error) {
              record(
                typeof args[0] === 'string' ? args[0] : 'QUERY_CONFIG',
                error,
              );
              throw error;
            }
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    pools.push(observed);
    return observed;
  };
  const read = pool(d.readRole),
    intake = pool(d.intakeRole),
    source = pool(d.sourceRole),
    worker = pool(d.workerRole),
    publication = pool(d.publicationRole);
  matchPublicationDatabase = new Finance.PostgresSqlDatabase(
    pool(d.matchPublicationRole),
  );
  const industryContext =
    d.install?.industry === true
      ? await (
          await import(
            requireApi.resolve(
              '@econmind/world-worker/postwar-industry-runtime-source',
            )
          )
        ).loadPostwarIndustryRuntimeSourceContext(d.repositoryRoot)
      : undefined;
  const openingAdoption =
    industryContext?.labourSocial ??
    (await Social.loadPostwarSocialConnectionOpeningAdoption(d.repositoryRoot));
  const industryPublication = industryContext
    ? pool(d.industryPublicationRole)
    : undefined;
  const industryPublisherBase = industryPublication
    ? new Finance.PostgresSqlDatabase(industryPublication)
    : undefined;
  const industryPublicationDatabase = industryPublisherBase
    ? {
        query: industryPublisherBase.query.bind(industryPublisherBase),
        transaction: (fn) =>
          industryPublisherBase.transaction(async (tx) => {
            await tx.query('set local role world_v2_industry_source_publisher');
            return fn(tx);
          }),
      }
    : undefined;
  social = Social.createPostwarSocialRuntimeConnection({
    worldId: d.worldId,
    workerId: d.workerId,
    workerPool: worker,
    workerRole: d.workerRole,
    openingAdoption,
  });
  clock = Host.createRegisteredWorldExecutionClock({
    database: social.database,
    worldId: d.worldId,
    workerId: d.workerId,
    registrationRef: d.registrationRef,
  });
  actor = createPostgresWorldActorResolver({
    pool: read,
    worldId: d.worldId,
    readerRole: d.readRole,
  });
  const publisherBase = new Finance.PostgresSqlDatabase(publication);
  publicationDatabase = {
    query: publisherBase.query.bind(publisherBase),
    transaction: (fn) =>
      publisherBase.transaction(async (tx) => {
        await tx.query('set local role world_v2_postwar_projection_publisher');
        return fn(tx);
      }),
  };
  const server = Host.createServerCommandHostBinding({
    worldId: d.worldId,
    workerId: d.workerId,
    seedRef: d.seedId,
    contentHash: d.seedFingerprint,
    admissionRef: d.admissionRef,
    modelVersion: d.configuration.modelVersion,
    intakePool: intake,
    sourcePool: source,
    readerRole: d.sourceRole,
    authorizationPublisherRole: d.authorizationPublisherRole,
    workerDatabase: social.database,
    clock,
    resolveActorId: actor.resolveActorId,
    readers: social.readers,
    socialRuntimeConnection: social,
    socialMetadataRead: { pool: read, readerRole: d.readRole },
    financeCapacitySource:
      Finance.createPostgresFinanceBudgetWorldCapacitySource({
        worldId: d.worldId,
        countries: d.countries,
        historyMode: 'BUDGET_SOCIAL',
      }),
  });
  binding = Shared.createProductionPostwarFinanceSocialRuntimeConnection({
    binding: server,
    environment: 'staging',
    publicationDatabase,
    treasuryFx: { workerRole: d.workerRole },
    captain: { workerRole: d.workerRole, mode: 'OFFICIAL_RUNTIME' },
    ...(d.install?.centralBankOmo
      ? {
          centralBankOmo: {
            workerRole: d.workerRole,
            countryIds: d.countries.map((x) => x.countryId),
            mode: 'OFFICIAL_RUNTIME',
          },
        }
      : {}),
    ...(d.install?.trade ? { trade: { workerRole: d.workerRole } } : {}),
    ...(industryContext
      ? {
          industry: {
            sourceContext: industryContext,
            publicationDatabase: industryPublicationDatabase,
          },
          industryLabour: { enabled: true },
        }
      : {}),
    beneficialRent: {
      workerRole: d.workerRole,
      clockBindingRef: d.beneficialRent.clockBindingRef,
    },
  });
  const auth = {
    ...d.configuration.auth,
    fetch: async (url) => {
      if (String(url) !== d.configuration.auth.jwksUrl)
        throw Error('TEST_ONLY_EXACT_JWKS_URL_REQUIRED');
      const r = Response.json(d.jwks);
      Object.defineProperty(r, 'url', { value: String(url) });
      return r;
    },
  };
  const readConfiguration = { ...d.configuration, auth };
  // The product artifact loader performs the one true Core reconstruction.
  // The exact same private proof is then borrowed by FX, Social and Rent.
  // A JSON proof/manifest or parent-only canonical seed can never substitute.
  const loaded = await loadRegisteredNodeStartupArtifacts({
    seedPath: d.seedFile,
    seedFileSha256: d.seedFileSHA256,
    worldId: d.worldId,
    beneficialRent: d.beneficialRent,
  });
  const seed = loaded.seed;
  rentSource = loaded.beneficialRentSource;
  if (
    !rentSource ||
    seed.worldId !== d.worldId ||
    seed.fingerprint !== d.seedFingerprint ||
    seed.sources.length !== 74
  )
    throw Error('ACTUAL_COMPLETE_CHILD_CORE_PROOF_REQUIRED');
  const checked = Beneficial.consumeBeneficialHousingRentSource(rentSource);
  if (
    checked.receipts.length !== 70 ||
    checked.parentSeedFingerprint !==
      'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274'
  )
    throw Error('ACTUAL_PARENT_CHILD_70_RECEIPTS_REQUIRED');
  sourceEvidence = {
    files: loaded.files,
    childFingerprint: checked.seedFingerprint,
    parentFingerprint: checked.parentSeedFingerprint,
    receiptCount: checked.receipts.length,
    industryExecution: industryContext
      ? 'GENUINE_COMPONENT_CONFIGURED_COMMANDS_NOT_YET_EXECUTED'
      : 'NOT_CONFIGURED_NOT_EXECUTED',
  };
  proofExposed = true;
  const policyBytes = await readFile(
    new URL('../../config/postwar-genesis/day-one-fx.v1.json', import.meta.url),
    'utf8',
  );
  const userReceiptBytes = await readFile(
    new URL(
      '../../docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
      import.meta.url,
    ),
    'utf8',
  );
  node = await startRegisteredPostwarOfficeNodeBootstrap({
    binding,
    api: {
      environment: 'staging',
      host: '127.0.0.1',
      port: 0,
      shutdownGraceMs: 5000,
    },
    social: {
      environment: 'staging',
      boundedReadPool: read,
      intakePool: intake,
      sourcePool: source,
      workerPool: worker,
      boundedReaderRole: d.readRole,
      sourceReaderRole: d.sourceRole,
      intakeRole: d.intakeRole,
      workerRole: d.workerRole,
      authorizationPublisherRole: d.authorizationPublisherRole,
      workerId: d.workerId,
      openingAdoption,
      admittedWorldPins: readConfiguration.admittedWorldPins,
      modelVersion: readConfiguration.modelVersion,
      auth,
      clock,
      resolveActorId: actor.resolveActorId,
      allowedOrigins: ['https://pages-test.example'],
    },
    socialStartupSeed: seed,
    socialStartupBeneficialHousingRentSource: rentSource,
    treasuryFxPreparation: {
      seed,
      policyBytes,
      userReceiptBytes,
      startupBeneficialHousingRentSource: rentSource,
    },
    read: readConfiguration,
    financeAllowedOrigins: ['https://pages-test.example'],
  });
  const ports = Shared.readPostwarFinanceSocialRuntimeBinding(binding);
  return {
    pid: process.pid,
    origin: node.origin,
    port: node.port,
    ready: node.ready(),
    environment: ports.environment,
    formalBinding: !!ports.formalBinding,
    consumerState: ports.runtime.consumer.state(),
    startupMs: performance.now() - begin,
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
    sourceEvidence,
  };
}
let active = false;
process.on('message', async (m) => {
  if (active) {
    send({
      id: m?.id,
      ok: false,
      error: { message: 'REGISTERED_CHILD_STEP_ALREADY_RUNNING' },
    });
    return;
  }
  active = true;
  try {
    if (m.type === 'INIT')
      send({ id: m.id, ok: true, value: await initialize(m.configuration) });
    else if (m.type === 'START') {
      node.consumer.startPreparation();
      send({ id: m.id, ok: true, value: { started: true, pid: process.pid } });
    } else if (m.type === 'CONSUME') {
      send({
        id: m.id,
        ok: true,
        value: wire(await node.consumer.consumeOnce()),
        diagnostics: databaseDiagnostics,
      });
    } else if (m.type === 'RETRY_PUBLICATION') {
      if (
        typeof m.commandId !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,255}$/u.test(m.commandId)
      )
        throw Error('FIXED_REGISTERED_COMMAND_ID_REQUIRED');
      send({
        id: m.id,
        ok: true,
        value: wire(await node.retryDerivedPublication(m.commandId)),
        diagnostics: databaseDiagnostics,
      });
    } else if (m.type === 'PUBLISH_WORK' || m.type === 'PUBLISH_WAGE') {
      if (
        m.countryId !== 'COUNTRY_02' ||
        m.facilityId !== 'OPEN-02-REFINED_FUEL' ||
        typeof m.runId !== 'string' ||
        !/^[A-Z][A-Z0-9_-]{0,255}$/u.test(m.runId) ||
        Object.hasOwn(m, 'simTime')
      )
        throw Error('FIXED_ACTUAL_C2_RUN_SCOPE_REQUIRED');
      const method =
        m.type === 'PUBLISH_WORK'
          ? 'publishDueIndustryWork'
          : 'publishIndustryDueWage';
      if (typeof binding?.[method] !== 'function')
        throw Error('FIXED_INDUSTRY_PUBLISHER_NOT_INSTALLED:' + method);
      const result = await binding[method]({
        countryId: m.countryId,
        facilityId: m.facilityId,
        runId: m.runId,
      });
      send({
        id: m.id,
        ok: true,
        value: wire(result),
        diagnostics: databaseDiagnostics,
      });
    } else if (m.type === 'PUBLISH_H0_LABOUR') {
      if (
        !['COUNTRY_01', 'COUNTRY_02'].includes(m.countryId) ||
        !binding ||
        !social
      )
        throw Error('FIXED_ACTUAL_H0_LABOUR_COUNTRY_REQUIRED');
      const { createPostwarMixedCurrentProjectionSource } =
        await import('../../apps/world-worker/dist/persistence/postwar-mixed-current-projection-publication.js');
      const { createPostwarIndustryLabourCurrentPublisher } =
        await import('../../apps/world-worker/dist/persistence/postwar-industry-labour-current-publication.js');
      const resources =
        Social.readPostwarSocialRuntimeConnectionResources(social);
      const source = createPostwarMixedCurrentProjectionSource({
        socialConnection: social,
        worldId: binding.worldId,
        workerRole: resources.workerRole,
        publicationDatabase,
        historyMode: 'PAGED_COMPLETE_V1',
      });
      try {
        const publisher = createPostwarIndustryLabourCurrentPublisher({
          source,
          socialConnection: social,
          publicationDatabase,
        });
        const result = await publisher.publishCountry(m.countryId, {
          worldVersion: '0',
          eventSequence: '0',
        });
        send({
          id: m.id,
          ok: true,
          value: wire(result),
          diagnostics: databaseDiagnostics,
        });
      } finally {
        await source.close();
      }
    } else if (m.type === 'PUBLISH_MATCH') {
      if (
        !['COUNTRY_01', 'COUNTRY_02'].includes(m.countryId) ||
        typeof m.planCommandId !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,255}$/u.test(m.planCommandId) ||
        Object.hasOwn(m, 'simTime')
      )
        throw Error('FIXED_ACTUAL_SOCIAL_PLAN_SCOPE_REQUIRED');
      const { publishPostwarMixedSocialMatchDue } =
        await import('../../apps/world-worker/dist/persistence/postwar-social-mixed-match-publisher.js');
      const ports = Shared.readPostwarFinanceSocialRuntimeBinding(binding);
      const result = await publishPostwarMixedSocialMatchDue({
        socialConnection: social,
        publisherDatabase: matchPublicationDatabase,
        worldId: ports.worldId,
        countryId: m.countryId,
        planCommandId: m.planCommandId,
        workerRole:
          Social.readPostwarSocialRuntimeConnectionResources(social).workerRole,
        observedAtReal: ports.clock.nowReal(),
      });
      send({
        id: m.id,
        ok: true,
        value: wire(result),
        diagnostics: databaseDiagnostics,
      });
    } else if (m.type === 'INDUSTRY_SELECTORS') {
      if (
        !binding ||
        !social ||
        m.countryId !== 'COUNTRY_02' ||
        m.facilityId !== 'OPEN-02-REFINED_FUEL'
      )
        throw Error('FIXED_ACTUAL_C2_INDUSTRY_SCOPE_REQUIRED');
      const State =
        await import('../../apps/world-worker/dist/persistence/postwar-industry-run-state.js');
      const Prepared =
        await import('../../apps/world-worker/dist/persistence/prepared-postwar-social-source.js');
      const ports = Shared.readPostwarFinanceSocialRuntimeBinding(binding),
        currentSimTime = await clock.simTime(ports.worldId);
      const result = await social.database.transaction(async (tx) => {
        const lease = (
          await tx.query(
            'select holder_id from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>clock_timestamp() for share',
            [ports.worldId, ports.workerId],
          )
        ).rows;
        const head = (
          await tx.query(
            'select world_version::text as "worldVersion",event_sequence::text as "eventSequence" from world_v2.world_head where world_id=$1 for share',
            [ports.worldId],
          )
        ).rows;
        if (head.length !== 1 || lease.length !== 1)
          throw Error('ACTUAL_HELD_HEAD_AND_LIVE_WRITER_LEASE_REQUIRED');
        const context = await State.readPostwarIndustryRunStateFrom(tx, {
          socialConnection: social,
          worldId: ports.worldId,
          countryId: m.countryId,
          facilityId: m.facilityId,
          expectedHead: head[0],
        });
        try {
          const facts = State.consumePostwarIndustryRunStateFrom(tx, context),
            base = Prepared.consumePreparedPostwarSocialFinancialReplayBase(
              facts.baseline,
            );
          const sites = facts.siteSources.filter(
            (s) => s.countryId === m.countryId && s.facilityId === m.facilityId,
          );
          if (sites.length !== 1) throw Error('ACTUAL_UNIQUE_C2_SITE_REQUIRED');
          const site = sites[0],
            positions = new Set(site.positions.map((p) => p.positionId));
          const funding = base.document.inputs.fundingAccounts.filter(
            (a) =>
              a.countryId === m.countryId &&
              a.payerRole === 'OP' &&
              a.payerEntityId === site.operatorId &&
              a.accountClass === 'BUSINESS_DEPOSIT_ASSET',
          );
          if (funding.length !== 1)
            throw Error('ACTUAL_UNIQUE_OPERATOR_DEPOSIT_REQUIRED');
          return {
            classification:
              'ACTUAL_CURRENT_INDUSTRY_PLANNING_DATA_NOT_EXECUTION_AUTHORITY',
            head: facts.head,
            site,
            currentEmployment: facts.currentEmployment,
            maxCommandSimTimeTicks: facts.maxCommandSimTimeTicks,
            currentSimTime,
            positionFunding: base.document.inputs.positionFunding.filter((p) =>
              positions.has(p.positionId),
            ),
            fundingAccount: funding[0],
            source: {
              sourceRef: facts.firstdayOriginal.sourceRef,
              sourceRawSha256: facts.firstdayOriginal.rawSha256,
            },
            financialPositions: facts.financial.positions
              .filter((p) => p.account.accountId === funding[0].accountRef)
              .map((p) => ({
                ...p,
                netDebitBalance: p.netDebitBalance.toCanonicalValue(),
              })),
          };
        } finally {
          State.releasePostwarIndustryRunStateContext(context);
        }
      });
      const value = wire(result);
      if (Buffer.byteLength(JSON.stringify(value)) > 262144)
        throw Error('INDUSTRY_PLANNING_DATA_256K_BOUND');
      send({ id: m.id, ok: true, value, diagnostics: databaseDiagnostics });
    } else if (m.type === 'FX_SELECTORS') {
      const ports = Shared.readPostwarFinanceSocialRuntimeBinding(binding);
      if (!ports.treasuryFx) throw Error('FIXED_FX_SOURCE_REQUIRED');
      const quotes = ports.treasuryFx
        .quotes()
        .filter((q) => q.countryId === 'COUNTRY_01');
      if (quotes.length !== 1)
        throw Error('EXACT_COUNTRY_01_FX_QUOTE_REQUIRED');
      send({
        id: m.id,
        ok: true,
        value: wire({
          quote: quotes[0],
          governmentGcuAccountId:
            ports.treasuryFx.treasuryGcuAccountId('COUNTRY_01'),
        }),
      });
    } else if (m.type === 'ACL') {
      const result = [];
      for (const [pool, table] of [
        [pools[0], 'world_actor_binding'],
        [pools[3], 'world_command_execution_registration'],
      ]) {
        const identity = (await pool.query('select current_user as role'))
          .rows[0];
        try {
          const rows = await pool.query(
            'select * from world_v2.' + table + ' limit 1',
          );
          result.push({
            role: identity.role,
            table,
            denied: false,
            rowCount: rows.rowCount,
          });
        } catch (error) {
          result.push({
            role: identity.role,
            table,
            denied: error.code === '42501',
            code: error.code,
            message: error.message,
          });
        }
      }
      send({ id: m.id, ok: true, value: result });
    } else if (m.type === 'CLOCK')
      send({ id: m.id, ok: true, value: await clock.simTime(binding.worldId) });
    else if (m.type === 'ACTOR')
      send({
        id: m.id,
        ok: true,
        value: await actor.resolveActorId(m.subject),
      });
    else if (m.type === 'CLOSE') {
      const result = await stop();
      send({ id: m.id, ok: true, value: result });
      process.exitCode = result.errors.length || idleErrors.length ? 1 : 0;
      if (process.connected) process.disconnect();
    } else throw Error('FIXED_REGISTERED_CHILD_OPERATION_REQUIRED');
  } catch (error) {
    const failure = wireColdError(error);
    process.stderr.write(
      JSON.stringify({
        kind: 'REGISTERED_RPC_ERROR',
        operation: m?.type,
        error: failure,
      }) + '\n',
    );
    send({
      id: m?.id,
      ok: false,
      error: failure,
      diagnostics: databaseDiagnostics,
    });
    if (m?.type === 'INIT') {
      const cleanup = await stop();
      send({ type: 'FAILED_STARTUP_CLEANUP', cleanup });
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    }
  } finally {
    active = false;
  }
});
process.on('disconnect', () => {
  void stop().catch(() => {
    process.exitCode = 1;
  });
});
