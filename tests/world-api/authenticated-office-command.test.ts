import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
  parseCanonicalCommand,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  createAuthenticatedOfficeCommandService,
  type AuthenticatedOfficeCommandServiceConfig,
} from '../../apps/world-api/src/integration/authenticated-office-command-service.js';
import { parseManualOfficeCommandRequest } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';

const WORLD = 'WORLD_TEST_ONLY_MANUAL_INTAKE';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const COUNTRY = 'COUNTRY_01';
const READER = 'g_test_only_office_reader',
  INTAKE = 'g_test_only_office_intake',
  PUB = 'g_test_only_office_publisher';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rows = [
  [
    'CAPTAIN',
    'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
    'CAPTAIN_CABINET',
    {
      schemaVersion: 'captain-political-capital-allocation-v1',
      fromBucket: 'FISCAL_REFORM',
      toBucket: 'INDUSTRIAL_STRATEGY',
      amount: { amount: '7.125', unit: 'political_capital' },
      reasonFactRef: 'FACT.TEST_ONLY.REASON.1',
    },
  ],
  [
    'CENTRAL_BANK',
    'CORE_CENTRAL_BANK_OMO_V1',
    'CENTRAL_BANK_MONETARY_POLICY',
    {
      schemaVersion: 'central-bank-omo-intent-v1',
      direction: 'BUY_GOVERNMENT_SECURITIES',
      securityRef: 'SECURITY_TEST_ONLY_GOV',
      batchRef: 'BATCH_TEST_ONLY_GOV',
      faceValue: { amount: '2', currency: 'GCU' },
      settlementSimTime: '10000',
      policyNote: null,
    },
  ],
  [
    'SOCIAL',
    'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
    'SOCIAL_LABOUR',
    {
      schemaVersion: 'social-employment-service-plan-v1',
      locationId: 'REGION_01_E1',
      skill: 'HIGH',
      positionId: 'POSITION_TEST_ONLY',
      servicePoolId: 'SERVICE_POOL_TEST_ONLY',
      requestedMatches: '3',
      dueDayIndex: '1',
    },
  ],
] as const;
const databases: PGlite[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.close();
});

/** TEST_ONLY real SQL/JWT mechanism. No domain snapshot or readiness injection.
 * Exactly the disposable admission veto is disabled/re-enabled to exercise the
 * already-existing persisted binding consumer. This is no official admission
 * or executable economic source; the expected result is zero-write rejection. */
async function fixture(index = 0, admitted = true) {
  const [office, family, cap, payload] = rows[index]!;
  const db = new PGlite();
  databases.push(db);
  for (const migration of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0003_world_v2_command_receipts_outbox.sql',
    '0007_world_v2_atomic_transition_facts.sql',
    '0011_world_v2_current_commit_authorization.sql',
    '0013_world_v2_read_projection_boundary.sql',
    '0016_world_v2_opening_seed.sql',
  ])
    await db.exec(
      await readFile(
        new URL(
          `../../database/migrations/artifacts/${migration}`,
          import.meta.url,
        ),
        'utf8',
      ),
    );
  await db.exec(
    await readFile(
      new URL(
        '../../database/proposals/runtime-read-binding-storage.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_MANUAL_INTAKE'),
      worldId: worldId(WORLD),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [
        createOpeningSource(
          {
            schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: openingSourceId('SOURCE_TEST_ONLY_MANUAL_INTAKE'),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'fixture://TEST_ONLY/manual-intake',
            sourceVersion: 'TEST_ONLY',
            payload: { testOnly: true, productionFallback: false },
          },
          sha,
        ),
      ],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...seedIntent } = seed;
  await db.query('insert into world_v2.world_head values($1,0,0)', [WORLD]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      WORLD,
      seed.seedId,
      canonicalSerialize(seed.replayBinding),
      canonicalSerialize(seedIntent),
      fingerprint,
    ],
  );
  for (const capability of ['READ', cap])
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,'TEAM_TEST_ONLY','REV_1',true,now())",
      [WORLD, SUBJECT, COUNTRY, office, capability],
    );
  await db.query(
    "insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values('SEAT_TEST_ONLY_MANUAL',$1,$2,$3,$4,'TEAM_TEST_ONLY','REV_1')",
    [WORLD, SUBJECT, COUNTRY, office],
  );
  const scope = `OFFICE_${Buffer.from(COUNTRY).toString('hex').toUpperCase()}_${Buffer.from(office).toString('hex').toUpperCase()}`;
  await db.query(
    "insert into world_v2.projection_entitlement values($1,$2,'OFFICE_PRIVATE',$3,'REV_1',true,now(),null)",
    [WORLD, SUBJECT, scope],
  );
  await db.query(
    "insert into world_v2.read_projection values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}',now())",
    [WORLD, scope],
  );
  if (admitted) {
    await db.exec(
      'alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_requires_real_publication',
    );
    await db.query(
      "insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding) values($1,'ADMISSION_TEST_ONLY_MANUAL',$2,$3,$4,$5)",
      [
        WORLD,
        seed.seedId,
        fingerprint,
        seed.replayBinding.modelVersion,
        canonicalSerialize(seed.replayBinding),
      ],
    );
    await db.exec(
      'alter table world_v2.runtime_opening_admission enable trigger runtime_opening_admission_requires_real_publication',
    );
  }
  await db.exec(`create role ${READER} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    create role ${INTAKE} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    create role ${PUB} nologin nosuperuser nobypassrls;
    grant usage on schema world_v2 to ${READER},${INTAKE};
    grant select on world_v2.world_head,world_v2.opening_seed,world_v2.current_commit_authorization,world_v2.runtime_read_seat,
      world_v2.runtime_opening_admission,world_v2.projection_entitlement,world_v2.read_projection,world_v2.command_submission,world_v2.command_queue to ${READER},${INTAKE};
    create policy test_only_manual_seed_read on world_v2.opening_seed for select to ${READER},${INTAKE}
      using(exists(select 1 from world_v2.runtime_read_seat s where s.world_id=opening_seed.world_id and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)));`);
  const queries: Array<{ role: string; sql: string; values?: unknown[] }> = [];
  const hooks: {
    beforeIntake?: () => Promise<void>;
    beforeSecondRead?: () => Promise<void>;
    loseCommit?: boolean;
    loseRollback?: boolean;
  } = {};
  const admin = async (sql: string, values?: unknown[]) => {
    await db.exec('reset role');
    return db.query(sql, values);
  };
  let reads = 0;
  const pool = (role: string) =>
    ({
      connect: async () => {
        if (role === INTAKE) await hooks.beforeIntake?.();
        if (role === READER && ++reads === 2) await hooks.beforeSecondRead?.();
        await db.exec(`set role ${role}`);
        return {
          query: async (sql: string, values?: unknown[]) => {
            queries.push({ role, sql, ...(values ? { values } : {}) });
            const result = await db.query(sql, values);
            if (
              role === INTAKE &&
              ((sql === 'commit' && hooks.loseCommit) ||
                (sql === 'rollback' && hooks.loseRollback))
            )
              throw new Error('TEST_ONLY_ACK_LOSS');
            return {
              ...result,
              rowCount: result.affectedRows ?? result.rows.length,
            };
          },
          release: () => undefined,
        };
      },
    }) as unknown as Pick<Pool, 'connect'>;
  const project = 'abcdefghijklmnopqrst',
    issuer = `https://${project}.supabase.co/auth/v1`,
    jwksUrl = `${issuer}/.well-known/jwks.json`;
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'TEST_ONLY_MANUAL',
    alg: 'ES256',
    use: 'sig',
  };
  const token = (subject = SUBJECT, expired = false) => {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(
      JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
    ).toString('base64url');
    const p = Buffer.from(
      JSON.stringify({
        sub: subject,
        iss: issuer,
        aud: 'authenticated',
        iat: now - 10,
        exp: expired ? now - 1 : now + 60,
      }),
    ).toString('base64url');
    return `${h}.${p}.${sign('sha256', Buffer.from(`${h}.${p}`), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };
  const server = {
    actor: 'ACTOR_TEST_ONLY_MANUAL' as string | null,
    simTime: '10000',
    clockCalls: 0,
  };
  const config: AuthenticatedOfficeCommandServiceConfig = {
    readPool: pool(READER),
    writerPool: pool(INTAKE),
    readerRole: READER,
    writerRole: INTAKE,
    authorizationPublisherRole: PUB,
    admittedWorldPins: {
      worldId: WORLD,
      seedRef: seed.seedId,
      contentHash: fingerprint,
      admissionRef: 'ADMISSION_TEST_ONLY_MANUAL',
      minimumWorldVersion: '0',
    },
    auth: {
      projectRef: project,
      expectedIssuer: issuer,
      jwksUrl,
      audience: 'authenticated',
      fetch: async () => {
        const r = new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        });
        Object.defineProperty(r, 'url', { value: jwksUrl });
        return r;
      },
    },
    resolveActorId: async (subject) =>
      subject === SUBJECT ? server.actor : null,
    clock: {
      nowReal: () => '2026-10-08T00:00:00.000Z',
      simTime: async (w) => {
        expect(w).toBe(WORLD);
        server.clockCalls++;
        return server.simTime;
      },
    },
  };
  const request: ManualOfficeCommandRequestDto = {
    worldId: WORLD,
    countryId: COUNTRY,
    officeId: office,
    commandType: family,
    commandId: 'COMMAND_TEST_ONLY_MANUAL',
    idempotencyKey: 'KEY_TEST_ONLY_MANUAL',
    expectedWorldVersion: '0',
    payload,
  };
  const envelope = (r: unknown = request) => ({
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: '33333333-3333-4333-8333-333333333333',
    request: r,
  });
  const service = createAuthenticatedOfficeCommandService(config);
  const call = (r: unknown = request, auth = token()) =>
    service.handle({ authorization: `Bearer ${auth}`, request: envelope(r) });
  const noEffects = async () => {
    for (const table of [
      'command_submission',
      'command_queue',
      'authoritative_event',
      'inventory_posting',
      'financial_posting_batch',
      'command_receipt',
    ])
      expect(
        (await admin(`select count(*)::text as n from world_v2.${table}`))
          .rows[0],
      ).toEqual({ n: '0' });
    expect(
      (
        await admin(
          'select world_version::text,event_sequence::text from world_v2.world_head',
        )
      ).rows[0],
    ).toEqual({ world_version: '0', event_sequence: '0' });
    expect(
      queries
        .filter((q) => q.role === INTAKE)
        .every(
          (q) =>
            !/^\s*(?:insert|update|delete|alter|grant|truncate)\b/iu.test(
              q.sql,
            ),
        ),
    ).toBe(true);
  };
  return {
    db,
    config,
    service,
    server,
    hooks,
    queries,
    admin,
    request,
    envelope,
    call,
    token,
    noEffects,
  };
}

describe('actual JWT/current SQL manual Office intake: unavailable source is zero-effect rejection', () => {
  it('unconfigured service is NOT_CONNECTED', async () => {
    expect(
      await createAuthenticatedOfficeCommandService().handle({
        authorization: 'Bearer none',
        request: {},
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'NOT_CONNECTED' } },
    });
  });
  it.each([0, 1, 2])(
    'strict existing family %i parses, authenticates actual current capability, and never stores or queues',
    async (index) => {
      const f = await fixture(index);
      const response = await f.call();
      expect(response).toMatchObject({
        httpStatus: 503,
        body: {
          ok: false,
          error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
          state: {
            status: 'REJECTED',
            commandType: rows[index]![1],
            submitted: false,
            queued: false,
            missing: ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'],
          },
        },
      });
      expect(f.server.clockCalls).toBe(1);
      expect(f.queries.filter((q) => q.role === INTAKE)[0]?.sql).toBe(
        'begin isolation level repeatable read read only',
      );
      expect(f.queries.filter((q) => q.role === INTAKE).at(-1)?.sql).toBe(
        'commit',
      );
      await f.noEffects();
    },
  );
  it('no SQL write grant is inferred from a read binding; real INSERT privilege still cannot enable missing runtime', async () => {
    const f = await fixture();
    expect((await f.call()).body.error.code).toBe('SOURCE_RUNTIME_UNAVAILABLE');
    await f.admin(
      `grant insert on world_v2.command_submission,world_v2.command_queue to ${INTAKE}`,
    );
    expect((await f.call()).body.error.code).toBe('SOURCE_RUNTIME_UNAVAILABLE');
    await f.noEffects();
  });
  it.each([0, 1, 2])(
    'family %i refuses unknown payload fields through actual Core parser before source rejection',
    async (index) => {
      const f = await fixture(index);
      const r = await f.call({
        ...f.request,
        payload: { ...rows[index]![3], approved: true },
      });
      expect(r.httpStatus).toBe(400);
      expect(r.body.error.code).not.toBe('SOURCE_RUNTIME_UNAVAILABLE');
      expect(r.body.state).toBeUndefined();
      await f.noEffects();
    },
  );
  it.each([
    'actorId',
    'authSubject',
    'simTime',
    'submittedAtReal',
    'approved',
    'runtimeReady',
    'binding',
  ])('refuses browser %s without SQL access', async (field) => {
    const f = await fixture();
    const r = await f.call({ ...f.request, [field]: true });
    expect(r.body.error.code).toBe('PROTOCOL_ERROR');
    expect(f.queries).toHaveLength(0);
    await f.noEffects();
  });
  it.each([
    ['INDUSTRY', 'CORE_INDUSTRY_FAKE_V1'],
    ['SOCIAL', 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'],
    ['CAPTAIN', 'CORE_CENTRAL_BANK_OMO_V1'],
    ['TRADE', 'CORE_GOODS_TRANSFER_V1'],
  ])(
    'refuses unsupported Office/SystemDue pairing %s/%s',
    async (officeId, commandType) => {
      const f = await fixture();
      expect(
        (await f.call({ ...f.request, officeId, commandType })).body.error.code,
      ).toBe('PROTOCOL_ERROR');
      expect(f.queries).toHaveLength(0);
      await f.noEffects();
    },
  );
  it('expired or invalid signature never reaches persisted authority', async () => {
    const f = await fixture();
    for (const token of [
      f.token(SUBJECT, true),
      `${f.token().slice(0, -4)}aaaa`,
    ])
      expect((await f.call(f.request, token)).body.error.code).toBe(
        'AUTHENTICATION_INVALID',
      );
    expect(f.queries).toHaveLength(0);
    await f.noEffects();
  });
  it('wrong subject, world, missing admission, missing server actor and wrong pin are refused', async () => {
    const f = await fixture();
    expect((await f.call(f.request, f.token(OTHER))).body.error.code).toBe(
      'CURRENT_SEAT_OR_ADMISSION_REQUIRED',
    );
    expect(
      (await f.call({ ...f.request, worldId: 'WORLD_OTHER' })).body.error.code,
    ).toBe('WORLD_BINDING_MISMATCH');
    f.server.actor = null;
    expect((await f.call()).body.error.code).toBe('SERVER_ACTOR_REQUIRED');
    expect(
      (
        await createAuthenticatedOfficeCommandService({
          ...f.config,
          admittedWorldPins: {
            ...f.config.admittedWorldPins,
            contentHash: `sha256:${'a'.repeat(64)}`,
          },
        }).handle({
          authorization: `Bearer ${f.token()}`,
          request: f.envelope(),
        })
      ).body.error.code,
    ).toBe('CURRENT_SEAT_OR_ADMISSION_REQUIRED');
    await f.noEffects();
    const g = await fixture(0, false);
    expect((await g.call()).body.error.code).toBe(
      'CURRENT_SEAT_OR_ADMISSION_REQUIRED',
    );
    await g.noEffects();
  });
  it('read capability cannot substitute for current manual capability', async () => {
    const f = await fixture();
    await f.admin(
      "update world_v2.current_commit_authorization set active=false where capability='CAPTAIN_CABINET'",
    );
    expect((await f.call()).body.error.code).toBe('AUTHORIZATION_DENIED');
    expect(f.server.clockCalls).toBe(0);
    await f.noEffects();
  });
  it('stale expected head is VERSION_MISMATCH, never a parked intent', async () => {
    const f = await fixture();
    expect(
      (await f.call({ ...f.request, expectedWorldVersion: '1' })).body.error
        .code,
    ).toBe('VERSION_MISMATCH');
    await f.noEffects();
  });
  it('intake sees exact current head after the before read; changed head rejects before canonical work', async () => {
    const f = await fixture();
    f.hooks.beforeIntake = async () => {
      await f.admin(
        'update world_v2.world_head set world_version=1,event_sequence=1',
      );
    };
    expect((await f.call()).body.error.code).toBe('AUTHORIZATION_DENIED');
    expect(f.server.clockCalls).toBe(0);
    expect(
      (
        await f.admin(
          'select count(*)::text as n from world_v2.command_submission',
        )
      ).rows[0],
    ).toEqual({ n: '0' });
  });
  it('after read must retain identical current seat, admission and actual head', async () => {
    const f = await fixture();
    f.hooks.beforeSecondRead = async () => {
      await f.admin(
        'update world_v2.world_head set world_version=1,event_sequence=1',
      );
      await f.admin(
        'update world_v2.read_projection set world_version=1,event_sequence=1',
      );
    };
    expect((await f.call()).body.error.code).toBe('CURRENT_BINDING_CHANGED');
    expect(
      (await f.admin('select count(*)::text as n from world_v2.command_queue'))
        .rows[0],
    ).toEqual({ n: '0' });
  });
  it('economic-writer role is refused and missing SELECT is unavailable, not source success', async () => {
    const f = await fixture();
    await f.admin(`grant insert on world_v2.authoritative_event to ${INTAKE}`);
    expect((await f.call()).body.error.code).toBe('AUTHORIZATION_DENIED');
    await f.noEffects();
    await f.admin(
      `revoke insert on world_v2.authoritative_event from ${INTAKE}`,
    );
    await f.admin(
      `revoke select on world_v2.command_submission from ${INTAKE}`,
    );
    expect((await f.call()).body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    await f.noEffects();
  });
  it('lost read-only commit or rollback acknowledgement remains unavailable, with no blind callback replay', async () => {
    const f = await fixture();
    f.hooks.loseCommit = true;
    expect((await f.call()).body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(
      f.queries.filter((q) => q.role === INTAKE && q.sql.startsWith('begin')),
    ).toHaveLength(1);
    await f.noEffects();
    const g = await fixture();
    g.hooks.loseRollback = true;
    await g.admin(
      "update world_v2.current_commit_authorization set active=false where capability='CAPTAIN_CABINET'",
    );
    expect((await g.call()).body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    await g.noEffects();
  });
  it('canonical stored identity is rehydrated with original server clock and conflicting identity is denied', async () => {
    const f = await fixture();
    // TEST_ONLY administrator persists a real CanonicalCommand on the existing
    // table. This verifies history/idempotency reads, never bypasses submit or
    // makes a positive acceptance/source/kernel execution claim.
    const c = parseCanonicalCommand(
      {
        ...f.request,
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_TEST_ONLY_MANUAL',
        authSubject: SUBJECT,
        simTime: '10000',
        submittedAtReal: '2026-10-08T00:00:00.000Z',
        correlationId: 'CORRELATION_TEST_ONLY_HISTORY',
      },
      sha,
    );
    await f.admin(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        c.worldId,
        c.commandId,
        c.idempotencyKey,
        c.commandType,
        c.schemaVersion,
        c.canonicalPayload,
        c.payloadHash,
        c.fingerprint,
        c.authSubject,
        c.actorId,
        c.countryId,
        c.officeId,
        c.expectedWorldVersion,
        c.simTime.toCanonicalValue(),
        c.correlationId,
        c.submittedAtReal,
      ],
    );
    f.server.simTime = '20000';
    expect((await f.call()).body.error.code).toBe('SOURCE_RUNTIME_UNAVAILABLE');
    expect(f.server.clockCalls).toBe(0);
    expect(
      (await f.call({ ...f.request, commandId: 'COMMAND_DIFFERENT' })).body
        .error.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      (
        await f.call({
          ...f.request,
          payload: {
            ...rows[0][3],
            amount: { amount: '8', unit: 'political_capital' },
          },
        })
      ).body.error.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      (
        await f.admin(
          'select count(*)::text as n from world_v2.command_submission',
        )
      ).rows[0],
    ).toEqual({ n: '1' });
    expect(
      (await f.admin('select count(*)::text as n from world_v2.command_queue'))
        .rows[0],
    ).toEqual({ n: '0' });
  });
  it('pre-abort and late pool acquisition issue no intake SQL', async () => {
    const f = await fixture();
    const pre = new AbortController();
    pre.abort();
    expect(
      (
        await f.service.handle({
          authorization: `Bearer ${f.token()}`,
          request: f.envelope(),
          signal: pre.signal,
        })
      ).body.error.code,
    ).toBe('CANCELLED');
    expect(f.queries).toHaveLength(0);
    let started!: () => void, resume!: () => void;
    const acquired = new Promise<void>((r) => {
      started = r;
    });
    const gate = new Promise<void>((r) => {
      resume = r;
    });
    f.hooks.beforeIntake = async () => {
      started();
      await gate;
    };
    const controller = new AbortController();
    const pending = f.service.handle({
      authorization: `Bearer ${f.token()}`,
      request: f.envelope(),
      signal: controller.signal,
    });
    await acquired;
    controller.abort();
    expect((await pending).body.error.code).toBe('CANCELLED');
    resume();
    await new Promise((r) => setTimeout(r, 20));
    expect(f.queries.filter((q) => q.role === INTAKE)).toHaveLength(0);
    await f.noEffects();
  });
  it('transport parser rejects getters and invalid PostgreSQL version before issuing a command', () => {
    expect(() =>
      parseManualOfficeCommandRequest({
        get worldId() {
          throw new Error('not inert');
        },
      }),
    ).toThrow();
    expect(() =>
      parseManualOfficeCommandRequest({
        worldId: WORLD,
        countryId: COUNTRY,
        officeId: 'CAPTAIN',
        commandType: rows[0][1],
        commandId: 'COMMAND_TEST_ONLY',
        idempotencyKey: 'KEY_TEST_ONLY',
        expectedWorldVersion: '9223372036854775808',
        payload: rows[0][3],
      }),
    ).toThrow();
  });
});
