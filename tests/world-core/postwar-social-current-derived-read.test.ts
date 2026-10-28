/** SQL/RLS infrastructure uses explicit TEST_ONLY small sources. Genuine full
 * source publication is separately exercised against the shared native reference. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_PUBLISH_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_TEST_ONLY_BOUNDED_PROJECTION',
  subject = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const admissionPublisher = 'world_v2_opening_admission_test_bounded',
  reader = 'world_v2_postwar_projection_reader',
  publisher = 'world_v2_postwar_projection_publisher';
const sourceHash = 'a'.repeat(64);
let db: PGlite,
  seed: C.OpeningSeed,
  seedIntentHash: string,
  admissionRef: string;
const executor: SqlExecutor = {
  async query<Row extends object>(q: string, args: readonly unknown[] = []) {
    const r = await db.query<Row>(q, [...args]);
    return { rows: r.rows, rowCount: r.rows.length };
  },
};
const store = createPostwarOfficeProjectionStore({
  runtimeReaderRole: reader,
  authorizationPublisherRole: publisher,
});
async function admin() {
  await db.exec('rollback; reset role; set session authorization postgres');
}
async function readerSession(who = subject) {
  await admin();
  await db.exec(
    'set session authorization projection_test_reader; set role world_v2_postwar_projection_reader',
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
  await db.exec('begin isolation level repeatable read read only');
}
async function publish(country = 'COUNTRY_01', dataset = 'positions') {
  await admin();
  await db.exec('set role ' + publisher);
  return db.query<Record<string, unknown>>(POSTWAR_PROJECTION_PUBLISH_QUERY, [
    world,
    country,
    'SOCIAL',
    dataset,
    seed.fingerprint,
    seedIntentHash,
    sourceHash,
    admissionRef,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0007_world_v2_atomic_transition_facts',
    '0009_world_v2_posting_payload_integrity',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read(`database/migrations/artifacts/${id}.sql`));
  await db.exec(
    await read('database/proposals/runtime-read-binding-storage.sql'),
  );
  await db.exec(
    await read('database/proposals/runtime-admission-publication.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-office-derived-read.sql'),
  );
  await db.exec(
    await read('database/proposals/postwar-social-current-derived-read.sql'),
  );
  const countries = ['COUNTRY_01', 'COUNTRY_02'].map((countryId, index) => ({
    countryId,
    state: {
      labour: {
        positions: Array.from({ length: index === 0 ? 250 : 2 }, (_, i) => ({
          positionId: `POSITION_${index}_${i}`,
          countryId,
          filledCount: '1',
          wageAmount: '2.123456',
          description: 'TEST_ONLY_FINITE_PUBLIC_SOURCE_'.repeat(50),
        })),
      },
      servicePools: [],
    },
    offers: [],
    minimumWage: {
      countryId,
      amount: '1.23',
      currency: 'XAA',
      period: 'SIM_YEAR',
    },
  }));
  seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_BOUNDED_PROJECTION'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [
        C.createOpeningSource(
          {
            schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: C.openingSourceId('SOURCE_TEST_ONLY_BOUNDED_OPERATING'),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'TEST_ONLY_BOUNDED_SQL_INFRASTRUCTURE',
            sourceVersion: 'TEST_ONLY_SMALL_SOURCE_V1',
            payload: {
              schemaVersion: 'postwar-operating-genesis-seed-source-v1',
              carrier: {
                socialEmployment: { countries },
                facts: {
                  regions: [
                    { countryId: 'COUNTRY_01', regionId: 'REGION_01_E1' },
                    { countryId: 'COUNTRY_02', regionId: 'REGION_02_E1' },
                  ],
                },
                retainedTestOnlyPadding: 'TEST_ONLY_NOT_RETURNED_'.repeat(
                  30000,
                ),
              },
            },
          },
          sha,
        ),
      ],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
  seedIntentHash = sha(C.canonicalSerialize(intent));
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      world,
      seed.seedId,
      C.canonicalSerialize(seed.replayBinding),
      C.canonicalSerialize(intent),
      fingerprint,
    ],
  );
  await db.exec(
    `create role ${admissionPublisher} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication; grant usage on schema world_v2 to ${admissionPublisher}; grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${admissionPublisher}; create role projection_test_reader nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant world_v2_postwar_projection_reader to projection_test_reader`,
  );
  const now = Date.now(),
    keys = generateKeyPairSync('ed25519'),
    claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY_BOUNDED',
      keyId: 'TEST_ONLY_BOUNDED_EPHEMERAL_KEY',
      ownerIdentity: 'TEST_ONLY_NOT_REAL_OWNER',
      issuedAtReal: new Date(now - 60000).toISOString(),
      expiresAtReal: new Date(now + 3600000).toISOString(),
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: C.canonicalSerialize(seed.replayBinding),
      sourceBundleSha256: sourceHash,
    };
  const canonical = C.canonicalSerialize(claims),
    signature = sign(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.privateKey,
    );
  expect(
    verify(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.publicKey,
      signature,
    ),
  ).toBe(true);
  await db.exec('set role world_v2_admission_release');
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      claims.authorizationId,
      sha(canonical),
      canonical,
      signature.toString('base64url'),
      world,
      seed.seedId,
      seed.fingerprint,
      claims.modelVersion,
      claims.replayBinding,
      sourceHash,
      admissionPublisher,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await admin();
  await db.exec('set session authorization ' + admissionPublisher);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [claims.authorizationId, sha(canonical), sourceHash],
  );
  admissionRef = 'ADMISSION_' + sha(canonical).toUpperCase();
  await admin();
  for (const [who, countryId] of [
    [subject, 'COUNTRY_01'],
    [other, 'COUNTRY_02'],
  ] as const) {
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'SOCIAL','SOCIAL_LABOUR','TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
      [world, who, countryId],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'SOCIAL','TEAM_TEST_ONLY','REV_TEST_ONLY')",
      [world, who, countryId],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_TEST_ONLY',true,now(),null)",
      [
        world,
        who,
        'OFFICE_' +
          Buffer.from(countryId).toString('hex').toUpperCase() +
          '_' +
          Buffer.from('SOCIAL').toString('hex').toUpperCase(),
      ],
    );
  }
  await publish();
  await publish('COUNTRY_02');
  await publish('COUNTRY_01', 'offers');
  await publish('COUNTRY_01', 'service-pools');
}, 60_000);
afterEach(async () => {
  await admin();
});
afterAll(async () => {
  await db.close();
});
// SQL witness infrastructure fixtures only. These small TEST_ONLY states are not
// a production Core adoption. The actual native three-step flow is separate.
const currentNature =
  'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION';
const stateFor = (country = 'COUNTRY_01') => ({
  schemaVersion: 'social-employment-service-state-v1',
  worldId: world,
  labour: {
    aggregates: [{ countryId: country, aggregateId: 'AGGREGATE_TEST_ONLY' }],
    positions: [
      {
        countryId: country,
        positionId: 'POSITION_TEST_ONLY_CURRENT',
        requiredCount: '4',
        filledCount: '2',
      },
    ],
    wageAssertions: [],
    appliedFactBindings: [],
  },
  servicePools: [
    {
      countryId: country,
      servicePoolId: 'POOL_TEST_ONLY_CURRENT',
      capacityCount: '2',
    },
  ],
  plans: [],
  appliedOperations: [],
});
async function commit(
  version = 1,
  options: {
    country?: string;
    kind?: 'POSITION' | 'PLAN' | 'MATCH';
    materialized?: boolean;
    state?: unknown;
    unknownEvent?: boolean;
    corruptMaterialization?: boolean;
  } = {},
) {
  const country = options.country ?? 'COUNTRY_01',
    kind = options.kind ?? 'PLAN',
    state = options.state ?? stateFor(country),
    materialization =
      kind === 'POSITION'
        ? {
            schemaVersion: 'social-employment-position-lifecycle-v1',
            employment: state,
            offers: [],
            reservations: [],
            operations: [],
          }
        : state;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      commandId: `COMMAND_TEST_ONLY_CURRENT_${version}`,
      commandType:
        kind === 'POSITION'
          ? 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'
          : kind === 'MATCH'
            ? 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'
            : 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: subject,
      correlationId: `CORRELATION_CURRENT_${version}`,
      worldId: world,
      countryId: country,
      officeId: kind === 'MATCH' ? null : 'SOCIAL',
      expectedWorldVersion: String(version - 1),
      idempotencyKey: `IDEMPOTENCY_CURRENT_${version}`,
      simTime: String(version),
      submittedAtReal: '2026-10-28T00:00:00.000Z',
      payload: { testOnly: true },
    },
    sha,
  );
  const canonicalState = C.canonicalSerialize(materialization),
    hash = 'sha256:' + sha('SHA-256\n' + canonicalState),
    event = C.parseAuthoritativeEvent(
      {
        schemaVersion: 'event-v1',
        eventId: `EVENT_CURRENT_${version}`,
        eventType: options.unknownEvent
          ? 'UNKNOWN_EFFECT_TEST_ONLY_V1'
          : kind === 'POSITION'
            ? 'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'
            : kind === 'MATCH'
              ? 'SOCIAL_JOB_MATCH_SETTLED_V1'
              : 'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1',
        worldId: world,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: String(version),
        sequence: String(version),
        simTime: String(version),
        recordedAtReal: '2026-10-28T00:00:00.000Z',
        correctsEventId: null,
        payload: {
          schemaVersion:
            kind === 'POSITION'
              ? 'social-employment-position-offer-event-v1'
              : 'social-employment-service-event-v1',
          command: {
            ...JSON.parse(C.canonicalSerialize(command)),
            payload: JSON.parse(command.canonicalPayload),
          },
          beforeStateHash: 'sha256:' + '0'.repeat(64),
          afterStateHash: hash,
        },
      },
      sha,
    );
  await db.query(
    'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
    [
      world,
      command.commandId,
      command.idempotencyKey,
      command.commandType,
      command.schemaVersion,
      command.canonicalPayload,
      command.payloadHash,
      command.fingerprint,
      subject,
      command.actorId,
      country,
      command.officeId,
      command.expectedWorldVersion,
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
  await db.query(
    'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [
      world,
      event.eventId,
      event.sequence,
      event.worldVersion,
      command.commandId,
      command.correlationId,
      event.eventType,
      event.schemaVersion,
      event.canonicalPayload,
      event.payloadHash,
      event.fingerprint,
      event.simTime.toCanonicalValue(),
      event.recordedAtReal,
      null,
    ],
  );
  await db.query(
    "insert into world_v2.command_receipt values($1,$2,$3,'command-receipt-v2',$4,'COMMITTED',null,$2,$5,$6,$7,$8::jsonb,now())",
    [
      world,
      command.commandId,
      command.idempotencyKey,
      command.fingerprint,
      String(version - 1),
      String(version),
      String(version),
      JSON.stringify([event.eventId]),
    ],
  );
  if (options.materialized !== false)
    await db.query(
      'insert into world_v2.current_materialization values($1,$2,$3,$4,$5,$6)on conflict(world_id,materialization_key)do update set world_version=excluded.world_version,source_command_id=excluded.source_command_id,canonical_payload=excluded.canonical_payload,payload_sha256=excluded.payload_sha256',
      [
        world,
        (kind === 'POSITION'
          ? 'SOCIAL_POSITION_LIFECYCLE_'
          : 'SOCIAL_EMPLOYMENT_SERVICE_') + country,
        version,
        command.commandId,
        options.corruptMaterialization
          ? canonicalState.replace('"filledCount":"2"', '"filledCount":"3"')
          : canonicalState,
        hash,
      ],
    );
  await db.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$2 where world_id=$1',
    [world, version],
  );
}
async function beginTest() {
  await admin();
  await db.exec('begin');
}
async function publishCurrent() {
  await db.exec('set local role ' + publisher);
  const r = await db.query(
    'select * from world_v2.publish_postwar_social_current_projection($1,$2)',
    [world, 'COUNTRY_01'],
  );
  await db.exec('reset role');
  return r;
}
async function readCurrent(
  dataset = 'positions',
  expectedVersion?: string,
  who = subject,
) {
  await db.exec(
    'set local session authorization projection_test_reader;set local role ' +
      reader,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [who]);
  // The production wrapper supplies RR READ ONLY. For this rollback fixture,
  // call the exact SQL function, then validate the same store via a read-only
  // transaction after committed setup in the independent native flow.
  return db.query<{
    status: string;
    source_json: Record<string, unknown>;
    rows_text: string;
    scope_json: Record<string, unknown>;
  }>(
    'select * from world_v2.read_postwar_office_projection_page($1,$2,$3,$4,$5,$6)',
    [world, 'SOCIAL', dataset, 0, 100, expectedVersion ?? null],
  );
}
describe('current Social bounded projection witness', () => {
  it('retains H0 output and never reads a full seed online', async () => {
    await readerSession();
    const r = await store.readPageFrom(executor, {
      worldId: world,
      officeId: 'SOCIAL',
      dataset: 'positions',
      limit: 2,
    });
    expect(r.status).toBe('PAGE');
    if (r.status === 'PAGE')
      expect(r.source.dataNature).toBe(
        'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY',
      );
  });
  it('publishes only matching committed H1/H2/H3 states including null-office MATCH; deterministic immutable pages', async () => {
    await beginTest();
    await commit(1, { kind: 'POSITION' });
    await publishCurrent();
    let r = (await readCurrent()).rows[0]!;
    expect(r.status).toBe('PAGE');
    expect(r.source_json.dataNature).toBe(currentNature);
    expect(r.source_json.worldVersion).toBe('1');
    await db.exec('set local session authorization postgres;reset role');
    await commit(2);
    const d = await publishCurrent();
    expect(d.rows).toHaveLength(2);
    expect((await publishCurrent()).rows).toEqual(d.rows);
    r = (await readCurrent('service-pools')).rows[0]!;
    expect(r.source_json.worldVersion).toBe('2');
    expect(JSON.parse(r.rows_text)[0].capacityCount).toBe('2');
    await db.exec('set local session authorization postgres;reset role');
    await commit(3, { kind: 'MATCH' });
    await publishCurrent();
    r = (await readCurrent()).rows[0]!;
    expect(r.source_json.worldVersion).toBe('3');
    expect(r.source_json.eventSequence).toBe('3');
    expect(r.source_json.currentStateBinding).toMatchObject({
      sourceStateWorldVersion: '3',
      sourceEventSequence: '3',
      materializationKey: 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_01',
    });
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(65536);
  });
  it('validates actual current SQL output in the bounded parser and rejects head/key/nature tamper', async () => {
    await beginTest();
    await commit();
    await publishCurrent();
    const actual = (await readCurrent()).rows[0]!;
    const parse = async (source: Record<string, unknown>) => {
      const port: SqlExecutor = {
        async query<Row extends object>(q: string) {
          const rows = q.startsWith('select current_user as role_name')
            ? [
                {
                  role_name: reader,
                  subject,
                  read_only: 'on',
                  isolation: 'repeatable read',
                  unsafe_role: false,
                  publisher_member: false,
                },
              ]
            : [{ ...actual, source_json: source }];
          return {
            rows: rows as unknown as readonly Row[],
            rowCount: rows.length,
          };
        },
      };
      return store.readPageFrom(port, {
        worldId: world,
        officeId: 'SOCIAL',
        dataset: 'positions',
        limit: 100,
      });
    };
    const parsed = await parse(actual.source_json);
    expect(parsed.status).toBe('PAGE');
    await expect(
      parse({ ...actual.source_json, worldVersion: '01' }),
    ).rejects.toThrow('INVALID_PROJECTION_HEAD');
    await expect(
      parse({
        ...actual.source_json,
        dataNature: 'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY',
      }),
    ).rejects.toThrow('HASH_OR_HEAD_MISMATCH');
    await expect(
      parse({
        ...actual.source_json,
        currentStateBinding: {
          ...(actual.source_json.currentStateBinding as object),
          materializationKey: 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_02',
        },
      }),
    ).rejects.toThrow('HASH_OR_HEAD_MISMATCH');
  });
  it('missing publication and missing current materialization are UNAVAILABLE, never empty/current', async () => {
    await beginTest();
    await commit();
    expect((await readCurrent()).rows[0]!.status).toBe('UNAVAILABLE');
    await db.exec('set local session authorization postgres;reset role');
    await commit(2, { materialized: false });
    await expect(publishCurrent()).rejects.toThrow('WITNESS_UNAVAILABLE');
  });
  it('refuses source state/hash tamper even if a prior current page exists', async () => {
    await beginTest();
    await commit();
    await publishCurrent();
    await db.query(
      'update world_v2.current_materialization set world_version=2,canonical_payload=replace(canonical_payload,\'"filledCount":"2"\',\'"filledCount":"3"\')where world_id=$1',
      [world],
    );
    expect((await readCurrent()).rows[0]!.status).toBe('UNAVAILABLE');
  });
  it('refuses promoted stale state and old continuation; other H0 datasets remain stale', async () => {
    await beginTest();
    await commit();
    await publishCurrent();
    const old = (await readCurrent()).rows[0]!.source_json
      .sourceVersion as string;
    await db.exec('set local session authorization postgres;reset role');
    await commit(2);
    expect((await readCurrent()).rows[0]!.status).toBe('UNAVAILABLE');
    await db.exec('set local session authorization postgres;reset role');
    await publishCurrent();
    expect((await readCurrent('positions', old)).rows[0]!.status).toBe('STALE');
    expect((await readCurrent('offers')).rows[0]!.status).toBe('STALE');
  });
  it('refuses cross-country state', async () => {
    await beginTest();
    await commit(1, { state: stateFor('COUNTRY_02') });
    await expect(publishCurrent()).rejects.toThrow('WITNESS_UNAVAILABLE');
  });
  it('refuses a same-head payload SHA mismatch', async () => {
    await beginTest();
    await commit(1, { corruptMaterialization: true });
    await expect(publishCurrent()).rejects.toThrow('WITNESS_UNAVAILABLE');
  });
  it('refuses unknown effects and incomplete event prefix rather than calling them unrelated', async () => {
    await beginTest();
    await commit(1, { unknownEvent: true });
    await expect(publishCurrent()).rejects.toThrow('WITNESS_UNAVAILABLE');
  });
  it('refuses another country in the prefix even when the latest event is this country', async () => {
    await beginTest();
    await commit(1, { country: 'COUNTRY_02' });
    await commit(2);
    await expect(publishCurrent()).rejects.toThrow('WITNESS_UNAVAILABLE');
  });
  it('refuses advanced head without a complete committed event prefix', async () => {
    await beginTest();
    await commit();
    await publishCurrent();
    await db.query(
      'update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1',
      [world],
    );
    expect((await readCurrent()).rows[0]!.status).toBe('UNAVAILABLE');
  });
  it('requires a fresh READ COMMITTED publication snapshot after revocation locks', async () => {
    await admin();
    await db.exec('begin isolation level repeatable read');
    await expect(publishCurrent()).rejects.toThrow(
      'FRESH_READ_COMMITTED_REQUIRED',
    );
  });
  it('denies direct page aggregation and private witness functions', async () => {
    await readerSession();
    await expect(
      db.query(
        'select jsonb_agg(rows_text)from world_v2.postwar_social_current_page',
      ),
    ).rejects.toThrow('permission denied');
    await admin();
    await readerSession();
    await expect(
      db.query('select * from world_v2.postwar_current_social_witness($1,$2)', [
        world,
        'COUNTRY_01',
      ]),
    ).rejects.toThrow('permission denied');
  });
  it('does not expose another country or revoked entitlement', async () => {
    await beginTest();
    await commit();
    await publishCurrent();
    expect(
      (await readCurrent('positions', undefined, other)).rows[0]!.status,
    ).toBe('UNAVAILABLE');
    await db.exec('set local session authorization postgres;reset role');
    await db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=now() where world_id=$1 and auth_subject=$2',
      [world, subject],
    );
    await expect(readCurrent()).rejects.toThrow('CURRENT_SEAT_NOT_COHERENT');
  });
});
