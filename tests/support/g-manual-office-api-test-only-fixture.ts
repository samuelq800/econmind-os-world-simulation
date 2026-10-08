import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  createAuthenticatedOfficeCommandService,
  type AuthenticatedOfficeCommandServiceConfig,
} from '../../apps/world-api/src/integration/authenticated-office-command-service.js';

export const WORLD = 'WORLD_TEST_ONLY_MANUAL_INTAKE';
export const SUBJECT = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const COUNTRY = 'COUNTRY_01';
export const READER = 'g_test_only_office_reader',
  INTAKE = 'g_test_only_office_intake',
  PUB = 'g_test_only_office_publisher';
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const rows = [
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
export async function fixture(
  index = 0,
  admitted = true,
  runtimeWorld = WORLD,
) {
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
      worldId: worldId(runtimeWorld),
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
  await db.query('insert into world_v2.world_head values($1,0,0)', [
    runtimeWorld,
  ]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      runtimeWorld,
      seed.seedId,
      canonicalSerialize(seed.replayBinding),
      canonicalSerialize(seedIntent),
      fingerprint,
    ],
  );
  for (const capability of ['READ', cap])
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,'TEAM_TEST_ONLY','REV_1',true,now())",
      [runtimeWorld, SUBJECT, COUNTRY, office, capability],
    );
  await db.query(
    "insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values('SEAT_TEST_ONLY_MANUAL',$1,$2,$3,$4,'TEAM_TEST_ONLY','REV_1')",
    [runtimeWorld, SUBJECT, COUNTRY, office],
  );
  const scope = `OFFICE_${Buffer.from(COUNTRY).toString('hex').toUpperCase()}_${Buffer.from(office).toString('hex').toUpperCase()}`;
  await db.query(
    "insert into world_v2.projection_entitlement values($1,$2,'OFFICE_PRIVATE',$3,'REV_1',true,now(),null)",
    [runtimeWorld, SUBJECT, scope],
  );
  await db.query(
    "insert into world_v2.read_projection values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}',now())",
    [runtimeWorld, scope],
  );
  if (admitted) {
    await db.exec(
      'alter table world_v2.runtime_opening_admission disable trigger runtime_opening_admission_requires_real_publication',
    );
    await db.query(
      "insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding) values($1,'ADMISSION_TEST_ONLY_MANUAL',$2,$3,$4,$5)",
      [
        runtimeWorld,
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
    beforeSql?: (sql: string) => Promise<void>;
    afterSql?: (sql: string) => Promise<void>;
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
            await hooks.beforeSql?.(sql);
            const result = await db.query(sql, values);
            await hooks.afterSql?.(sql);
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
      worldId: runtimeWorld,
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
        expect(w).toBe(runtimeWorld);
        server.clockCalls++;
        return server.simTime;
      },
    },
  };
  const request: ManualOfficeCommandRequestDto = {
    worldId: runtimeWorld,
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
