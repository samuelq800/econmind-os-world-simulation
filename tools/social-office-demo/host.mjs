// PREPARATION_ONLY_NOT_V09_2_STARTED. Never mounts the production application.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectSocialOfficeHostBuild } from './build-host.mjs';

const liveHosts = new WeakMap();

function ownedOutput(build, relative) {
  assert(
    build.manifest.outputs.some((p) => p.path === relative),
    'SOCIAL_HOST_RUNTIME_OUTPUT_NOT_BOUND',
  );
  return path.join(build.manifest.root, relative);
}

async function hostSupport(build) {
  return import(
    pathToFileURL(
      ownedOutput(
        build,
        path.relative(
          build.manifest.root,
          path.join(
            build.directory,
            'server/tests/support/f-social-office-isolated-host.js',
          ),
        ),
      ),
    ).href
  );
}

/** Fixed tool-owned data bridge. This constructs data; it installs no state. */
export async function loadFixedSelectedSocialOfficeScenario(...args) {
  assert.equal(args.length, 0, 'SOCIAL_HOST_SCENARIO_NO_ARGUMENTS');
  inspectSocialOfficeHostBuild();
  const [financeModule, core, scenarioModule] = await Promise.all([
    import('./check-opening-finance.mjs'),
    import('@econmind/core'),
    import('../../apps/world-worker/dist/social-office-demo/scenario-input.js'),
  ]);
  const finance = financeModule.selectOpeningFinanceCandidateData(
    financeModule.readOpeningFinanceDistribution(),
    {
      meaning: 'ACCRUAL',
      domainVariant: 'G_DOMAIN_BASELINE_PROPOSAL',
      financeOptionId: 'SIM_SOCIAL_OPENING_BASELINE_V1_PROPOSAL',
    },
  );
  const scenario = await scenarioModule.loadSocialOfficeDemoScenario({
    openingFinanceCandidateUtf8: core.canonicalSerialize(finance),
  });
  assert.equal(
    scenario.rootSelectionSHA256,
    'b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036',
    'SOCIAL_HOST_SELECTED_RECORD_CHANGED',
  );
  assert.equal(scenario.sourceClass, 'SIMULATED_OPENING');
  assert.equal(scenario.sourceAdmitted, false);
  return scenario;
}

/** Loads the owned installer without invoking it or creating native resources. */
export async function inspectIsolatedSocialOfficeHostPreflight(...args) {
  assert.equal(args.length, 0, 'SOCIAL_HOST_PREFLIGHT_NO_ARGUMENTS');
  const build = inspectSocialOfficeHostBuild();
  const scenario = await loadFixedSelectedSocialOfficeScenario();
  const installerPath = path.join(
    build.directory,
    'server/tests/support/social-office-atomic-fixture.js',
  );
  const installerRelative = path.relative(build.manifest.root, installerPath);
  assert(
    build.manifest.outputs.some((p) => p.path === installerRelative),
    'SOCIAL_HOST_INSTALLER_OUTPUT_NOT_BOUND',
  );
  const schemas = [
    'database/proposals/runtime-read-binding-storage.sql',
    'tests/support/social-office-simulated-source-schema.sql',
    'tests/support/social-office-simulated-atomic-schema.sql',
  ].map((name) => {
    const pinned = build.manifest.inputs.find((p) => p.path === name);
    assert(pinned, 'SOCIAL_HOST_SCHEMA_SOURCE_NOT_BOUND');
    return Object.freeze({ ...pinned });
  });
  const installer = await import(pathToFileURL(installerPath).href);
  assert.equal(typeof installer.installFixture, 'function');
  assert.equal(typeof installer.grantFixtureRoles, 'function');
  return Object.freeze({
    status: 'PREFLIGHT_ONLY_NOT_INSTALLED',
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    sourceRoot: build.manifest.root,
    seedId: scenario.seed.seedId,
    seedFingerprint: scenario.seed.fingerprint,
    manifest: build.manifestPin,
    installerOutput: installerRelative,
    schemaSources: Object.freeze(schemas),
    nativeResourcesStarted: false,
    SQLInstalled: false,
    currentAuthorityVerified: false,
    completeOffice: false,
    WorldClock: false,
  });
}

/** One owned simulation. No caller-selected database, time, principal or handler. */
export async function startIsolatedSocialOfficeHost(...args) {
  assert.equal(args.length, 0, 'SOCIAL_HOST_START_NO_ARGUMENTS');
  const build = inspectSocialOfficeHostBuild();
  assert.equal(
    build.manifest.gitStatus,
    '',
    'SOCIAL_HOST_CLEAN_BUILD_REQUIRED',
  );
  assert.equal(build.manifest.browser.status, 'BUILT_NOT_DEMONSTRATED');
  const support = await hostSupport(build);
  support.assertIsolatedSocialOfficeEnvironment();
  const scenario = await loadFixedSelectedSocialOfficeScenario();
  const installer = await import(
    pathToFileURL(
      ownedOutput(
        build,
        path.relative(
          build.manifest.root,
          path.join(
            build.directory,
            'server/tests/support/social-office-atomic-fixture.js',
          ),
        ),
      ),
    ).href
  );
  // Resolve through API's declared dependency, preserving the actual adapter's
  // module identity. The relocated installer never supplies a runtime adapter.
  const apiRequire = createRequire(
    path.join(build.manifest.root, 'apps/world-api/package.json'),
  );
  const workerPath = await fs.realpath(
    apiRequire.resolve('@econmind/world-worker/social-office-demo'),
  );
  assert.equal(
    workerPath,
    ownedOutput(build, 'apps/world-worker/dist/social-office-demo/consumer.js'),
  );
  const [worker, source, core, api, transportModule] = await Promise.all([
    import(pathToFileURL(workerPath).href),
    import(
      pathToFileURL(
        ownedOutput(
          build,
          'apps/world-worker/dist/persistence/social-office-simulated-source-custody.js',
        ),
      ).href
    ),
    import('@econmind/core'),
    import(
      pathToFileURL(
        ownedOutput(
          build,
          'apps/world-api/dist/integration/social-office-demo-service.js',
        ),
      ).href
    ),
    import(
      pathToFileURL(
        ownedOutput(
          build,
          'apps/world-api/dist/integration/social-office-demo-transport.js',
        ),
      ).href
    ),
  ]);
  let database,
    server,
    service,
    transport,
    identity,
    origin = '',
    closing = false;
  let closed = false,
    closingOperation,
    controlBusy = false,
    dayIndex = '0';
  let readPool, publisherPool, authorityPool, leasePool, admin;
  let boundFence;
  let responseLossArmed = false,
    lostResponse = null;
  const requests = new Set(),
    controls = new Set();
  const close = () => {
    if (closingOperation) return closingOperation;
    if (closed) return Promise.resolve({ status: 'ALREADY_STOPPED' });
    closing = true;
    closingOperation = (async () => {
      try {
        // Stop accepting requests, then let existing owning transactions finish
        // before ending any role pool or touching the owned postmaster.
        const listenerClosed = server?.listening
          ? new Promise((resolve, reject) =>
              server.close((e) => (e ? reject(e) : resolve())),
            )
          : Promise.resolve();
        server?.closeIdleConnections();
        await Promise.allSettled([...requests]);
        await Promise.allSettled([...controls]);
        server?.closeAllConnections();
        await listenerClosed;
        const cleanup = database
          ? await database.close()
          : { status: 'NO_NATIVE_RESOURCES' };
        closed = true;
        return Object.freeze(cleanup);
      } catch (cause) {
        throw new support.IsolatedSocialHostError(
          'SOCIAL_HOST_CLEANUP_INCOMPLETE',
          cause,
        );
      }
    })();
    return closingOperation;
  };
  const assertLive = async () => {
    assert(!closing && !closed, 'SOCIAL_HOST_CLOSED');
    await database.inspect();
    assert(!closing && !closed, 'SOCIAL_HOST_CLOSED');
  };
  const renewLease = async () => {
    const row = (
      await leasePool.query(
        'select world_v2.social_demo_lease_control($1::jsonb) as lease',
        [
          core.canonicalSerialize({
            worldId: scenario.scope.worldId,
            holderId: 'SOCIAL_DEMO_WORKER_V1',
            observedAtReal: new Date().toISOString(),
            leaseDurationMilliseconds: '300000',
          }),
        ],
      )
    ).rows[0]?.lease;
    assert(
      row && row.holder_id === 'SOCIAL_DEMO_WORKER_V1',
      'SOCIAL_HOST_ACTUAL_LEASE_REQUIRED',
    );
    const token = String(row.fencing_token);
    assert(/^[1-9][0-9]*$/u.test(token), 'SOCIAL_HOST_ACTUAL_FENCE_REQUIRED');
    if (boundFence !== undefined)
      assert.equal(token, boundFence, 'SOCIAL_HOST_FENCE_CHANGED');
    return token;
  };
  const latestSource = async () => {
    const row = (
      await readPool.query(
        'select generation::text,manifest_hash,publication_utf8 from world_v2.social_demo_source_revision where simulation_id=$1 and world_id=$2 and country_id=$3 order by generation desc limit 1',
        [
          scenario.scope.simulationId,
          scenario.scope.worldId,
          scenario.scope.countryId,
        ],
      )
    ).rows[0];
    assert(row, 'SOCIAL_HOST_ACTUAL_SOURCE_REQUIRED');
    return row;
  };
  const withControl = (operation) => {
    assert(!controlBusy, 'SOCIAL_HOST_CONTROL_BUSY');
    controlBusy = true;
    const pending = (async () => {
      try {
        await assertLive();
        await renewLease();
        return await operation();
      } finally {
        controlBusy = false;
      }
    })();
    controls.add(pending);
    void pending.finally(() => controls.delete(pending)).catch(() => undefined);
    return pending;
  };
  const send = (
    res,
    status,
    body,
    type = 'application/json; charset=utf-8',
  ) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      connection: 'close',
      'referrer-policy': 'no-referrer',
    });
    res.end(body);
  };
  try {
    database = await support.createOwnedSocialOfficeDatabase();
    admin = await database.rolePool('installer');
    await database.inspect();
    // Original D installer verifies all 23 original migration bytes before DDL.
    await installer.installFixture(admin, scenario, {
      sourceRoot: build.manifest.root,
    });
    await installer.grantFixtureRoles(admin);
    readPool = await database.rolePool('reader');
    const writerPool = await database.rolePool('settler');
    publisherPool = await database.rolePool('publisher');
    authorityPool = await database.rolePool('authority');
    leasePool = await database.rolePool('lease');
    for (const [pool, role] of [
      [readPool, 'd_social_reader'],
      [writerPool, 'd_social_settler'],
      [publisherPool, 'd_social_publisher'],
      [authorityPool, 'd_social_authority'],
      [leasePool, 'd_social_lease'],
    ]) {
      const r = (
        await pool.query(
          "select current_user as role,current_database() as database,current_setting('listen_addresses') as listen,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_catalog.pg_roles where rolname=current_user",
        )
      ).rows[0];
      assert.deepEqual(r, {
        role,
        database: database.marker.database,
        listen: '',
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
      });
    }
    boundFence = await renewLease();
    identity = support.createIsolatedSocialOfficeIdentity();
    service = api.createSocialOfficeDemoService({
      readDatabase: new worker.PostgresSqlDatabase(readPool),
      writerDatabase: new worker.PostgresSqlDatabase(writerPool),
      scenario,
      worker: { holderId: 'SOCIAL_DEMO_WORKER_V1', fencingToken: boundFence },
      auth: identity.config,
      sessionAuthorization: identity.authorization,
    });
    // This actual signed session must pass G's unchanged verifier and native
    // authorization/full-prefix reader before the listener can be advertised.
    const authenticated = await service.session({});
    assert.equal(
      authenticated.httpStatus,
      200,
      'SOCIAL_HOST_REAL_SESSION_REFUSED',
    );
    const initial = await service.projection({
      authorization: identity.authorization,
    });
    assert.equal(
      initial.httpStatus,
      200,
      'SOCIAL_HOST_REAL_PROJECTION_REFUSED',
    );
    const browserPrefix =
      path.relative(
        build.manifest.root,
        path.join(build.directory, 'browser'),
      ) + '/';
    const staticFiles = new Map(
      build.manifest.outputs
        .filter((p) => p.path.startsWith(browserPrefix))
        .map((p) => [
          '/' + p.path.slice(browserPrefix.length),
          path.join(build.manifest.root, p.path),
        ]),
    );
    const html = staticFiles.get('/social-office-demo.html');
    assert(html, 'SOCIAL_HOST_BROWSER_ENTRY_REQUIRED');
    staticFiles.set('/', html);
    const handle = async (req, res) => {
      const hostHeaders = req.rawHeaders
        .filter((_, i) => i % 2 === 0)
        .filter((x) => x.toLowerCase() === 'host');
      if (
        closing ||
        requests.size >= support.ISOLATED_SOCIAL_HOST_LIMITS.inFlightRequests ||
        req.socket.remoteAddress !== '127.0.0.1' ||
        hostHeaders.length !== 1 ||
        req.headers.host !== origin.slice(7)
      ) {
        req.resume();
        send(res, closing ? 503 : 403, '{"status":"UNAVAILABLE"}');
        return;
      }
      await assertLive();
      await renewLease();
      if (
        responseLossArmed &&
        req.method === 'POST' &&
        req.url === '/isolated/v1/social-office/command'
      ) {
        const end = res.end.bind(res);
        res.end = function (chunk, ...rest) {
          responseLossArmed = false;
          const body =
            typeof chunk === 'string' || Buffer.isBuffer(chunk)
              ? JSON.parse(chunk.toString())
              : null;
          if (res.statusCode === 200 && body?.status === 'FINAL') {
            // G has returned only after its genuine native final receipt. This
            // one controlled response is lost; the browser must recover that
            // original ID. No transaction acknowledgement fault is simulated.
            lostResponse = support.redactIsolatedSocialEvidence({
              kind: 'CONTROLLED_RESPONSE_LOSS_AFTER_FINAL',
              body,
            });
            res.destroy();
            return res;
          }
          return end(chunk, ...rest);
        };
      }
      if (await transport.handle(req, res)) return;
      const selected = staticFiles.get(req.url);
      if (req.method !== 'GET' || !selected) {
        req.resume();
        send(res, 404, '{"status":"NOT_FOUND"}');
        return;
      }
      const extension = path.extname(selected);
      const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
      }[extension];
      assert(mime, 'SOCIAL_HOST_STATIC_TYPE_REFUSED');
      send(res, 200, await fs.readFile(selected), mime);
    };
    server = createServer((req, res) => {
      const operation = handle(req, res).catch(() => {
        req.resume();
        send(
          res,
          503,
          '{"status":"UNAVAILABLE","message":"Recover the original request receipt."}',
        );
      });
      requests.add(operation);
      void operation.finally(() => requests.delete(operation));
    });
    server.headersTimeout = support.ISOLATED_SOCIAL_HOST_LIMITS.headerTimeoutMs;
    server.requestTimeout =
      support.ISOLATED_SOCIAL_HOST_LIMITS.requestTimeoutMs;
    server.maxConnections =
      support.ISOLATED_SOCIAL_HOST_LIMITS.inFlightRequests;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert(
      address && typeof address !== 'string' && address.address === '127.0.0.1',
    );
    origin = `http://127.0.0.1:${address.port}`;
    transport = transportModule.createSocialOfficeDemoTransport({
      service,
      allocatedOrigin: origin,
    });
    const publicHandle = Object.freeze({
      origin,
      advanceToNextPreset: (...args) => {
        assert.equal(args.length, 0, 'SOCIAL_HOST_ADVANCE_NO_ARGUMENTS');
        return withControl(async () => {
          const next = dayIndex === '0' ? '1' : dayIndex === '1' ? '10' : null;
          assert(next, 'SOCIAL_HOST_NO_NEXT_PRESET');
          const current = await latestSource();
          const publication = scenario.publicationForPreset({
            dayIndex: next,
            expectedGeneration: current.generation,
            expectedManifestHash: current.manifest_hash,
          });
          const result = await source.publishSocialOfficeSimulatedSource(
            new worker.PostgresSqlDatabase(publisherPool),
            publication,
          );
          dayIndex = next;
          return Object.freeze({
            dayIndex,
            generation: result.generation,
            manifestHash: result.manifestHash,
          });
        });
      },
      processDueBoundary: (...args) => {
        assert.equal(args.length, 0, 'SOCIAL_HOST_DUE_NO_ARGUMENTS');
        return withControl(() => service.processDueBoundary());
      },
      close,
      inspection: () =>
        Object.freeze({
          classification: 'PREPARATION_ONLY_NOT_V09_2_STARTED',
          runtimeClass: 'ISOLATED_SIMULATED',
          status: closed ? 'STOPPED' : closing ? 'CLOSING' : 'RUNNING',
          sourceClass: 'SIMULATED_OPENING',
          sourceAdmitted: false,
          WorldClock: false,
          completeOffice: false,
          origin,
          head: build.manifest.head,
          tree: build.manifest.tree,
          manifest: build.manifestPin,
          nativeRoot: database.marker.root,
          dayIndex,
          seedFingerprint: scenario.seed.fingerprint,
          workerFence: boundFence,
          rolesConnected: 5,
          actualJWTAndNativeProjectionVerified: true,
        }),
    });
    liveHosts.set(publicHandle, {
      withControl,
      latestSource,
      scenario,
      core,
      source,
      worker,
      admin,
      publisherPool,
      authorityPool,
      identity,
      getDay: () => dayIndex,
      armResponseLoss: () => {
        assert(
          !responseLossArmed && !lostResponse,
          'SOCIAL_HOST_RESPONSE_LOSS_ALREADY_USED',
        );
        responseLossArmed = true;
      },
      responseLossEvidence: () => lostResponse,
    });
    return publicHandle;
  } catch (cause) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [cause, cleanup],
        'SOCIAL_HOST_START_FAILED_CLEANUP_INCOMPLETE',
        { cause: cleanup },
      );
    }
    throw cause;
  }
}

/** A single fixed local response-loss injection, never a database fault hook. */
export function armIsolatedSocialOfficeResponseLoss(...args) {
  assert.equal(
    process.env.ECONMIND_SOCIAL_OFFICE_NATIVE_TESTS,
    '1',
    'SOCIAL_HOST_NATIVE_CONTROL_OPT_IN',
  );
  assert.equal(args.length, 1, 'SOCIAL_HOST_CONTROL_ARGUMENTS');
  const state = liveHosts.get(args[0]);
  assert(state, 'SOCIAL_HOST_GENUINE_HANDLE_REQUIRED');
  assert.equal(state.getDay(), '0', 'SOCIAL_HOST_CONTROL_PHASE_REQUIRED');
  state.armResponseLoss();
  return Object.freeze({
    status: 'ARMED_ONE_FINAL_RESPONSE',
    effectsCommitted: false,
  });
}

/** Native opt-in controls for this genuine live handle only. No HTTP control route. */
export async function runIsolatedSocialOfficeNegativeControl(...args) {
  assert.equal(
    process.env.ECONMIND_SOCIAL_OFFICE_NATIVE_TESTS,
    '1',
    'SOCIAL_HOST_NATIVE_CONTROL_OPT_IN',
  );
  assert.equal(args.length, 2, 'SOCIAL_HOST_CONTROL_ARGUMENTS');
  const state = liveHosts.get(args[0]);
  assert(state, 'SOCIAL_HOST_GENUINE_HANDLE_REQUIRED');
  const kind = args[1];
  assert(
    typeof kind === 'string' &&
      [
        'AUTHORITY_REVOKED',
        'SOURCE_MISSING_DOMAIN',
        'SOURCE_REVOKED',
        'SOURCE_EXPIRED',
        'WRONG_VERSION',
      ].includes(kind),
    'SOCIAL_HOST_FIXED_CONTROL_REQUIRED',
  );
  const host = args[0];
  return state.withControl(async () => {
    const day = state.getDay();
    assert.equal(
      day,
      kind === 'SOURCE_EXPIRED' ? '10' : '0',
      'SOCIAL_HOST_CONTROL_PHASE_REQUIRED',
    );
    const digest = (value) =>
      createHash('sha256')
        .update(state.core.canonicalSerialize(value))
        .digest('hex');
    const snapshot = async () => {
      const row = (
        await state.admin.query(`select jsonb_build_object(
        'head',(select to_jsonb(t) from world_v2.world_head t),
        'events',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from world_v2.authoritative_event t),
        'inventory',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from world_v2.inventory_posting t),
        'financial',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from world_v2.financial_posting_batch t),
        'audit',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from world_v2.authoritative_commit_authorization t),
        'outbox',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from world_v2.notification_outbox t)
      ) as facts`)
      ).rows[0].facts;
      const intake = (
        await state.admin.query(
          'select (select count(*)::int from world_v2.command_submission) submissions,(select count(*)::int from world_v2.command_queue) queue,(select count(*)::int from world_v2.command_receipt) receipts',
        )
      ).rows[0];
      return { facts: row, sha256: digest(row), intake };
    };
    const before = await snapshot();
    let restore;
    const publish = async (disposition, expired = false) => {
      const current = await state.latestSource();
      const publication = state.scenario.publicationForPreset({
        dayIndex: day,
        expectedGeneration: current.generation,
        expectedManifestHash: current.manifest_hash,
      });
      return state.source.publishSocialOfficeSimulatedSource(
        new state.worker.PostgresSqlDatabase(state.publisherPool),
        {
          ...publication,
          operationId: `F_SOCIAL_${kind}_${disposition}_${current.generation}`,
          disposition,
          ...(kind === 'SOURCE_MISSING_DOMAIN' && disposition === 'REVOKED'
            ? {
                disposition: 'ACTIVE',
                selectedRecordIds: publication.selectedRecordIds.filter(
                  (id) => id !== 'G_SOCIAL_DOMAIN_FACTS_V1',
                ),
              }
            : {}),
          ...(expired
            ? { validUntilSimTime: (10n * 86400000n).toString() }
            : {}),
        },
      );
    };
    const reviseAuthority = async (expected, next, active) =>
      state.authorityPool.query(
        'select world_v2.social_demo_revise_manual_authority($1::jsonb)',
        [
          state.core.canonicalSerialize({
            simulationId: state.scenario.scope.simulationId,
            worldId: state.scenario.scope.worldId,
            countryId: state.scenario.scope.countryId,
            authSubject: state.scenario.authSubject,
            expectedAuthorizationVersion: expected,
            nextAuthorizationVersion: next,
            active,
            observedAtReal: new Date().toISOString(),
          }),
        ],
      );
    let response;
    try {
      if (kind === 'AUTHORITY_REVOKED') {
        await reviseAuthority(
          'SOCIAL_AUTH_V1',
          'F_SOCIAL_AUTH_REVOKED_V1',
          false,
        );
        restore = () =>
          reviseAuthority(
            'F_SOCIAL_AUTH_REVOKED_V1',
            'F_SOCIAL_AUTH_RESTORED_V1',
            true,
          );
      } else if (
        kind === 'SOURCE_REVOKED' ||
        kind === 'SOURCE_EXPIRED' ||
        kind === 'SOURCE_MISSING_DOMAIN'
      ) {
        await publish(
          kind === 'SOURCE_REVOKED' || kind === 'SOURCE_MISSING_DOMAIN'
            ? 'REVOKED'
            : 'ACTIVE',
          kind === 'SOURCE_EXPIRED',
        );
        restore = () => publish('ACTIVE');
      }
      const requestId = randomUUID();
      const requestedVersion =
        kind === 'WRONG_VERSION'
          ? (BigInt(before.facts.head.world_version) + 1n).toString()
          : String(before.facts.head.world_version);
      const r = await fetch(
        host.origin + '/isolated/v1/social-office/command',
        {
          method: 'POST',
          headers: {
            origin: host.origin,
            'content-type': 'application/json',
            authorization: state.identity.authorization,
          },
          body: JSON.stringify({
            requestId,
            action: day === '10' ? 'GRADUATE_NEW' : 'PLAN',
            expectedWorldVersion: requestedVersion,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      response = { requestId, status: r.status, body: await r.json() };
      assert(
        r.status >= 400 || response.body.status === 'REJECTED',
        'SOCIAL_HOST_NEGATIVE_NOT_REFUSED',
      );
      const after = await snapshot();
      assert.equal(
        after.sha256,
        before.sha256,
        'SOCIAL_HOST_NEGATIVE_ECONOMIC_FACTS_CHANGED',
      );
      return Object.freeze({
        case: kind,
        dayIndex: day,
        before,
        after,
        response,
        economicFactsUnchanged: true,
        intakeSeparateFromEconomicCommit: true,
        sourceAdmitted: false,
        WorldClock: false,
      });
    } finally {
      if (restore) await restore();
    }
  });
}

/** Fixed native evidence checkpoint, private to the same genuine host handle. */
export async function preserveIsolatedSocialOfficeCheckpoint(...args) {
  assert.equal(
    process.env.ECONMIND_SOCIAL_OFFICE_NATIVE_TESTS,
    '1',
    'SOCIAL_HOST_NATIVE_CONTROL_OPT_IN',
  );
  assert.equal(args.length, 2, 'SOCIAL_HOST_CONTROL_ARGUMENTS');
  const state = liveHosts.get(args[0]);
  assert(state, 'SOCIAL_HOST_GENUINE_HANDLE_REQUIRED');
  const checkpoint = args[1];
  assert(
    typeof checkpoint === 'string' &&
      ['OPENING', 'DAY0', 'DAY1', 'FINAL'].includes(checkpoint),
    'SOCIAL_HOST_FIXED_CHECKPOINT_REQUIRED',
  );
  assert.equal(
    state.getDay(),
    checkpoint === 'FINAL' ? '10' : checkpoint === 'DAY1' ? '1' : '0',
    'SOCIAL_HOST_CHECKPOINT_PHASE_REQUIRED',
  );
  const host = args[0];
  return state.withControl(async () => {
    const tables = {};
    // Identifiers are fixed tool source, never caller-controlled SQL.
    for (const name of [
      'schema_release',
      'world_head',
      'opening_seed',
      'command_submission',
      'command_queue',
      'authoritative_event',
      'inventory_posting',
      'financial_posting_batch',
      'command_receipt',
      'authoritative_commit_authorization',
      'notification_outbox',
      'social_demo_source_scope',
      'social_demo_source_record',
      'social_demo_source_revision',
      'current_commit_authorization',
      'runtime_read_seat',
      'social_demo_automatic_authorization',
      'runtime_opening_admission',
    ]) {
      tables[name] = (
        await state.admin.query(
          `select to_jsonb(t) as row from world_v2.${name} t order by to_jsonb(t)::text`,
        )
      ).rows.map((r) => r.row);
    }
    const response = await fetch(
      host.origin + '/isolated/v1/social-office/projection',
      {
        headers: { authorization: state.identity.authorization },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const projection = { status: response.status, body: await response.json() };
    assert.equal(
      projection.status,
      200,
      'SOCIAL_HOST_CHECKPOINT_PROJECTION_REQUIRED',
    );
    const evidence = {
      classification: 'PREPARATION_ONLY_NOT_V09_2_STARTED',
      checkpoint,
      inspection: host.inspection(),
      tables,
      projection,
      responseLoss: state.responseLossEvidence(),
      sourceAdmitted: false,
      WorldClock: false,
    };
    const raw = state.core.canonicalSerialize(evidence) + '\n';
    const file = path.join(
      host.inspection().nativeRoot,
      `checkpoint-${checkpoint}.json`,
    );
    const temporary = file + '.' + randomUUID() + '.partial';
    const output = await fs.open(temporary, 'wx', 0o600);
    try {
      await output.writeFile(raw);
      await output.sync();
    } finally {
      await output.close();
    }
    // Publish a complete inode atomically without replacing an earlier original.
    await fs.link(temporary, file);
    await fs.unlink(temporary);
    return Object.freeze({
      path: file,
      bytes: Buffer.byteLength(raw),
      sha256: createHash('sha256').update(raw).digest('hex'),
      projection: projection.body,
      responseLoss: state.responseLossEvidence(),
    });
  });
}

export function inspectIsolatedSocialOfficeLaunch(
  args = process.argv.slice(2),
) {
  if (args.length !== 1 || args[0] !== '--isolated')
    return {
      exitCode: 64,
      status: 'INVALID_ARGUMENTS',
      resourcesStarted: false,
      completeOffice: false,
    };
  const build = inspectSocialOfficeHostBuild();
  // Build inspection never starts or certifies a live office.
  return {
    exitCode: 0,
    status: 'BUILD_VERIFIED_NOT_STARTED',
    resourcesStarted: false,
    completeOffice: false,
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    WorldClock: false,
    manifest: build.manifestPin,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.slice(2).join(' ') !== '--isolated') {
    process.stderr.write('Only --isolated is supported.\n');
    process.exitCode = 64;
  } else {
    const host = await startIsolatedSocialOfficeHost();
    process.stdout.write(JSON.stringify(host.inspection()) + '\n');
    const lines = createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });
    const interrupt = () => lines.close();
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      for await (const line of lines) {
        if (line === 'close') break;
        try {
          const result =
            line === 'next'
              ? await host.advanceToNextPreset()
              : line === 'due'
                ? await host.processDueBoundary()
                : { status: 'INVALID_CONTROL' };
          process.stdout.write(
            JSON.stringify({
              control: line === 'next' || line === 'due' ? line : 'invalid',
              result,
            }) + '\n',
          );
        } catch {
          process.stdout.write('{"status":"CONTROL_REFUSED"}\n');
        }
      }
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      lines.close();
      process.stdout.write(JSON.stringify(await host.close()) + '\n');
    }
  }
}
