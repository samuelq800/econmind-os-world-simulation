/** TEST_ONLY fixed cold OS recovery. No DDL/registrar/seed bootstrap, arbitrary
 * SQL IPC, consumer start, Clock, privilege installation or external endpoint. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  isExactColdFxSourceRevocation,
  wireColdError,
} from './native-mixed-cold-errors.mjs';
if (process.env.ECONMIND_MIXED_COLD_RESTART_HOST !== '1' || !process.send)
  throw Error('EXPLICIT_PARENT_OWNED_MIXED_COLD_HOST_REQUIRED');
const queue = [];
process.on('message', (m) => queue.push(m));
const requireWorker = createRequire(
  new URL('../../apps/world-worker/package.json', import.meta.url),
);
const { Pool } = requireWorker('pg');
const C = await import(requireWorker.resolve('@econmind/core'));
const Social = await import(
  requireWorker.resolve('@econmind/world-worker/social-runtime-connection')
);
const Shared = await import(
  requireWorker.resolve(
    '@econmind/world-worker/finance-social-runtime-connection',
  )
);
const Finance = await import(
  requireWorker.resolve('@econmind/world-worker/finance-budget-runtime')
);
const Intake = await import(
  requireWorker.resolve('@econmind/world-worker/office-command-intake')
);
const { DurableV08LedgerLineageReader } =
  await import('../../apps/world-worker/dist/persistence/durable-v08-ledger-lineage-reader.js');
const { readFinalReceiptFrom } =
  await import('../../apps/world-worker/dist/persistence/atomic-transition-repository.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pins = Object.freeze({
  worldId: 'WORLD_POSTWAR_GCU_OPENING_20261029_V1',
  seedId: 'SEED_POSTWAR_GCU_OPENING_20261029_V1',
  seedFingerprint:
    'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274',
});
const pools = [],
  idleErrors = [];
let connection,
  ports,
  intake,
  principal,
  configuration,
  active = false,
  closing,
  started = false;
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
function fail(s) {
  throw Error('MIXED_COLD_HOST:' + s);
}
async function close() {
  if (closing) return closing;
  closing = (async () => {
    const errors = [];
    try {
      await connection?.stop();
    } catch (e) {
      errors.push(String(e));
    }
    for (const p of pools)
      try {
        await p.end();
      } catch (e) {
        errors.push(String(e));
      }
    send({ type: 'CLOSED', pid: process.pid, errors, idleErrors });
    if (errors.length || idleErrors.length) process.exitCode = 1;
    if (process.connected) process.disconnect();
  })();
  return closing;
}
async function counts() {
  const r = await ports.database.query(
    `select h.world_version::text as version,h.event_sequence::text as sequence,
 (select count(*)::text from world_v2.command_submission where world_id=$1)commands,
 (select count(*)::text from world_v2.command_queue where world_id=$1)queues,
 (select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,
 (select count(*)::text from world_v2.authoritative_event where world_id=$1)events,
 (select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,
 (select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory
 from world_v2.world_head h where h.world_id=$1`,
    [pins.worldId],
  );
  if (
    r.rows.length !== 1 ||
    r.rows[0].version !== configuration.expectedHead.worldVersion ||
    r.rows[0].sequence !== configuration.expectedHead.eventSequence
  )
    fail('ACTUAL_EXPECTED_HEAD_REQUIRED');
  return r.rows[0];
}
async function binding(request) {
  const r = await ports.database.query(
    `select s.seat_ref,a.authorization_version,h.world_version::text,h.event_sequence::text,ad.model_version,e.scope_key
 from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a using(world_id,auth_subject,country_id,office_id)
 join world_v2.world_head h using(world_id)join world_v2.runtime_opening_admission ad using(world_id)
 join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.active and e.revoked_at is null and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))
 where s.world_id=$1 and s.auth_subject=$2::uuid and s.country_id=$3 and s.office_id=$4 and a.capability=$5 and a.active and a.team_id=s.team_id and a.authorization_version=s.authorization_revision`,
    [
      pins.worldId,
      configuration.subject,
      request.countryId,
      request.officeId,
      Intake.manualOfficeCommandCapability(request),
    ],
  );
  if (r.rows.length !== 1) fail('ACTUAL_CURRENT_AUTHORITY_REQUIRED');
  const s = r.rows[0];
  return {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: s.seat_ref,
    seatState: 'ACTIVE',
    identity: {
      authSubjectId: configuration.subject,
      worldId: pins.worldId,
      countryId: request.countryId,
      officeId: request.officeId,
      scopeKey: s.scope_key,
      classification: 'OFFICE_PRIVATE',
      authorizationRevision: s.authorization_version,
      modelVersion: s.model_version,
      projectionVersion: 'postwar-office-runtime-read-v1',
    },
    seed: {
      worldId: pins.worldId,
      seedRef: pins.seedId,
      contentHash: pins.seedFingerprint,
      admissionRef: configuration.admissionRef,
    },
    readback: {
      worldId: pins.worldId,
      seedRef: pins.seedId,
      contentHash: pins.seedFingerprint,
      admissionRef: configuration.admissionRef,
      worldVersion: s.world_version,
      eventSequence: s.event_sequence,
      readbackRef: configuration.admissionRef,
    },
  };
}
async function verifyFinals() {
  const before = await counts(),
    results = [];
  const reader = new DurableV08LedgerLineageReader({
    database: ports.database,
    sha256Hex: sha,
  });
  for (const request of configuration.requests) {
    const receipt = await ports.database.transaction(async (tx) => {
      await tx.query(
        'select world_version from world_v2.world_head where world_id=$1 for share',
        [pins.worldId],
      );
      const command = await reader.readCommandReadOnlyFrom(
        tx,
        pins.worldId,
        request.commandId,
      );
      if (
        command.authSubject !== configuration.subject ||
        command.actorId !== configuration.actor
      )
        fail('ACTUAL_COMMAND_ACTOR_REQUIRED');
      const final = await readFinalReceiptFrom(tx, command);
      if (!final || final.outcome !== 'COMMITTED')
        fail('ACTUAL_COMMITTED_FINAL_REQUIRED');
      return final;
    });
    const ack = await intake.submit({
      request,
      binding: await binding(request),
      principal,
      actor: configuration.actor,
      signal: AbortSignal.timeout(10000),
    });
    if (
      ack.status !== 'FINALIZED' ||
      ack.source !== 'EXISTING' ||
      ack.submitted !== false
    )
      fail('EXACT_FINAL_IDEMPOTENT_RETRY_REQUIRED');
    results.push({ commandId: request.commandId, receipt: wire(receipt), ack });
  }
  const after = await counts();
  if (C.canonicalSerialize(before) !== C.canonicalSerialize(after))
    fail('RETRY_ADDED_DURABLE_ROWS');
  return { pid: process.pid, before, after, results };
}
async function start(c) {
  if (
    started ||
    !c ||
    c.worldId !== pins.worldId ||
    c.seedId !== pins.seedId ||
    c.seedFingerprint !== pins.seedFingerprint ||
    !/^ADMISSION_[A-F0-9]{64}$/u.test(c.admissionRef) ||
    !/^postwar_clone_day_one_fx_[a-f0-9]{10}$/u.test(c.database) ||
    typeof c.socket !== 'string' ||
    !c.socket.startsWith('/workspace/.cloud-setup/evidence/') ||
    c.socket.includes('..') ||
    c.port !== 5432 ||
    !/^fx_test_worker_[a-f0-9]{10}$/u.test(c.workerRole) ||
    !/^fx_test_intake_[a-f0-9]{10}$/u.test(c.intakeRole) ||
    !/^WORKER_DAY_ONE_FX_[A-F0-9]{10}$/u.test(c.workerId) ||
    c.subject !== '11111111-1111-4111-8111-111111111111' ||
    c.actor !== 'ACTOR_TEST_ONLY_MIXED_FX' ||
    !Array.isArray(c.requests) ||
    c.requests.length < 1 ||
    c.requests.length > 6 ||
    !/^(0|[1-9][0-9]*)$/u.test(c.simTime)
  )
    fail('EXACT_OWNED_CFC_FIXTURE_REQUIRED');
  for (const request of c.requests) {
    Intake.parseManualOfficeCommandRequest(request);
    if (request.worldId !== pins.worldId || request.countryId !== 'COUNTRY_01')
      fail('OWN_CURRENT_COUNTRY_REQUIRED');
  }
  started = true;
  configuration = c;
  const open = (user) => {
    const p = new Pool({
      host: c.socket,
      port: 5432,
      database: c.database,
      user,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + c.subject,
    });
    p.on('error', (e) => idleErrors.push(e.message));
    pools.push(p);
    return p;
  };
  const workerPool = open(c.workerRole),
    intakePool = open(c.intakeRole),
    clock = Object.freeze({
      nowReal: () => new Date().toISOString(),
      simTime: async () => c.simTime,
    });
  const adoption =
    await Social.loadPostwarSocialConnectionOpeningAdoption(root);
  connection = Shared.createPostwarFinanceSocialRuntimeConnection({
    socialConnection: Social.createPostwarSocialRuntimeConnection({
      worldId: pins.worldId,
      workerId: c.workerId,
      workerPool,
      workerRole: c.workerRole,
      openingAdoption: adoption,
    }),
    capacitySource: Finance.createPostgresFinanceBudgetWorldCapacitySource({
      worldId: pins.worldId,
      countries: [{ countryId: 'COUNTRY_01' }],
      historyMode: 'BUDGET_SOCIAL',
    }),
    intakePool,
    clock,
    environment: 'ci',
    treasuryFx: { workerRole: c.workerRole },
  });
  const startedAt = performance.now(),
    rssBefore = process.memoryUsage().rss;
  // One awaited offline frame shares one genuine seed across both prepares;
  // it retires raw bytes before any recovery/online IPC operation.
  await (async () => {
    const seedBytes = await readFile(
      '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z/final-seed.json',
    );
    if (
      sha(seedBytes) !==
      'ee2f777126e9050ce7139e2d9d9e24d2ec7305de95b8380d3e4c35fc4edb314f'
    )
      fail('EXACT_EXISTING_SEED_ARTIFACT_REQUIRED');
    const seed = C.parseOpeningSeed(
      JSON.parse(seedBytes.toString('utf8')),
      sha,
    );
    if (
      seed.worldId !== pins.worldId ||
      seed.seedId !== pins.seedId ||
      seed.fingerprint !== pins.seedFingerprint
    )
      fail('ACTUAL_CORE_CFC_PINS_REQUIRED');
    const policyBytes = await readFile(
        new URL(
          '../../config/postwar-genesis/day-one-fx.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
      userReceiptBytes = await readFile(
        new URL(
          '../../docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
          import.meta.url,
        ),
        'utf8',
      );
    await connection.prepareTreasuryFx({ seed, policyBytes, userReceiptBytes });
    await connection.prepare({
      observedAtReal: clock.nowReal(),
      admittedWorldPins: {
        worldId: pins.worldId,
        seedRef: pins.seedId,
        contentHash: pins.seedFingerprint,
        admissionRef: c.admissionRef,
      },
      modelVersion: c.modelVersion,
      startupSeed: seed,
    });
  })();
  ports = Shared.readPostwarFinanceSocialRuntimeBinding(connection);
  if (ports.runtime.consumer.state() !== 'PREPARED' || !ports.treasuryFx)
    fail('GENUINE_NEW_PREPARED_CONTROLLER_REQUIRED');
  principal = await C.authenticateIdentity({
    token: 'TEST_ONLY_CFC_COLD_OS',
    profile: {
      user_id: c.subject,
      display_name: 'TEST_ONLY_CFC_COLD_OS',
      school_id: null,
    },
    verifier: {
      async verify(token) {
        if (token !== 'TEST_ONLY_CFC_COLD_OS')
          fail('TEST_ONLY_IDENTITY_REQUIRED');
        return {
          subject: c.subject,
          issuer: 'TEST_ONLY_ISOLATED_NATIVE_FIXTURE',
          audience: 'TEST_ONLY_FX',
          issuedAt: clock.nowReal(),
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        };
      },
    },
  });
  intake = new Intake.PostgresOfficeCommandIntake({
    pool: ports.intakePool,
    runtime: ports.runtime,
    role: c.intakeRole,
    clock,
  });
  const finals = await verifyFinals();
  send({
    type: 'READY',
    pid: process.pid,
    preparationMs: performance.now() - startedAt,
    rssBefore,
    rssAfter: process.memoryUsage().rss,
    maxRssKiB: process.resourceUsage().maxRSS,
    consumerState: ports.runtime.consumer.state(),
    consumerStarted: false,
    ...finals,
  });
}
async function revoked(request) {
  Intake.parseManualOfficeCommandRequest(request);
  if (
    request.worldId !== pins.worldId ||
    request.countryId !== 'COUNTRY_01' ||
    request.commandType !== 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1' ||
    request.expectedWorldVersion !== configuration.expectedHead.worldVersion ||
    configuration.requests.some(
      (r) =>
        r.commandId === request.commandId ||
        r.idempotencyKey === request.idempotencyKey,
    )
  )
    fail('OWN_NEW_FX_PROBE_REQUIRED');
  const before = await counts(),
    bindingValue = await binding(request),
    command = Intake.buildManualOfficeCommandIntent({
      request,
      countryId: C.countryId(request.countryId),
      officeId: C.officeId(request.officeId),
      actor: configuration.actor,
      authSubject: C.authSubject(configuration.subject),
      simTime: configuration.simTime,
      submittedAtReal: ports.clock.nowReal(),
      correlationId: 'CORRELATION_' + request.commandId,
    });
  let denied = false;
  let rejection;
  try {
    await ports.treasuryFx.preflightCanonical(command, ports.clock.nowReal());
  } catch (error) {
    if (!isExactColdFxSourceRevocation(error)) throw error;
    rejection = wireColdError(error);
    denied = true;
  }
  if (!denied) fail('REVOKED_SOURCE_WAS_ACCEPTED');
  const existing = await verifyFinals();
  if (C.canonicalSerialize(before) !== C.canonicalSerialize(await counts()))
    fail('REVOKED_PROBE_ADDED_ROWS');
  return {
    newFxDenied: denied,
    rejection,
    finalizedCount: existing.results.length,
    countsBefore: before,
    countsAfter: await counts(),
    actualBindingRevision: bindingValue.identity.authorizationRevision,
    existing,
  };
}
async function dispatch(m) {
  if (active) fail('SERIAL_FIXED_IPC_ONLY');
  active = true;
  try {
    if (m.operation === 'START') await start(m.configuration);
    else if (m.operation === 'VERIFY_REVOKED_SOURCE') {
      if (!ports) fail('COLD_PREPARATION_REQUIRED');
      send({ type: 'RESULT', id: m.id, result: await revoked(m.request) });
    } else if (m.operation === 'CLOSE') await close();
    else fail('FIXED_IPC_OPERATION_REQUIRED');
  } catch (error) {
    send({
      type: 'ERROR',
      id: m.id,
      message: error.message,
      stack: error.stack,
      error: wireColdError(error),
    });
    process.exitCode = 1;
    await close();
  } finally {
    active = false;
  }
}
process.removeAllListeners('message');
process.on('message', (m) => void dispatch(m));
for (const m of queue) await dispatch(m);
process.on('disconnect', () => void close());
