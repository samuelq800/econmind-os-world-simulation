/** SQL/RLS infrastructure uses explicit TEST_ONLY small sources. Genuine full
 * source publication is separately exercised against the shared native reference. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_PUBLISH_QUERY,
  POSTWAR_PROJECTION_RESPONSE_MAX,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import {
  preparePostwarOfficeProjectionPublication,
  publishPostwarOfficeProjectionFrom,
  type PostwarOfficeProjectionPublication,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-publication.js';
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
const statements: string[] = [];
const executor: SqlExecutor = {
  async query<Row extends object>(q: string, args: readonly unknown[] = []) {
    statements.push(q);
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
}, 60_000);
afterEach(async () => {
  await admin();
});
afterAll(async () => {
  await db.close();
});
describe('bounded exact-country projection SQL and runtime reader', () => {
  it('publishes only stored-source rows with exact seed/admission hashes, immutable pages and no arbitrary JSON input', async () => {
    const p = await publish(),
      r = p.rows[0]!;
    expect(r.total_rows).toBe(250);
    expect(r.canonical_seed_sha256).toBe(seedIntentHash);
    expect(r.seed_fingerprint).toBe(seed.fingerprint);
    expect(Number(r.page_count)).toBeGreaterThan(1);
    const prior = r.document_ref;
    expect((await publish()).rows[0]!.document_ref).toBe(prior);
    await expect(
      db.query(POSTWAR_PROJECTION_PUBLISH_QUERY, [
        world,
        'COUNTRY_01',
        'SOCIAL',
        'positions',
        seed.fingerprint,
        'b'.repeat(64),
        sourceHash,
        admissionRef,
      ]),
    ).rejects.toThrow('PINS_DO_NOT_MATCH');
    await expect(
      db.query(
        'select world_v2.publish_postwar_office_projection($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          world,
          'COUNTRY_01',
          'SOCIAL',
          'positions',
          seed.fingerprint,
          seedIntentHash,
          sourceHash,
          admissionRef,
          '{"ready":true}',
        ],
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        "update world_v2.postwar_office_projection_page set rows_text='[]'",
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
    await expect(
      db.exec(
        "update world_v2.postwar_office_projection_page set rows_text='[]'",
      ),
    ).rejects.toThrow();
  });
  it('reads actual current-seat headers and all small pages with bounded response and stable immutable source cursor, never fullseedhydrate', async () => {
    statements.length = 0;
    await readerSession();
    const start = process.memoryUsage().heapUsed;
    const headers = await store.readCurrentSeatHeadersFrom(executor, {
      worldId: world,
    });
    expect(headers).toHaveLength(1);
    expect(headers[0]!.scope.countryId).toBe('COUNTRY_01');
    const all: unknown[] = [];
    let offset = 0,
      version: string | undefined,
      maxResponse = 0,
      pageCount = 0;
    do {
      const r = await store.readPageFrom(executor, {
        worldId: world,
        officeId: 'SOCIAL',
        dataset: 'positions',
        offset,
        limit: 100,
        ...(version ? { expectedVersion: version } : {}),
      });
      expect(r.status).toBe('PAGE');
      if (r.status !== 'PAGE') throw Error('PAGE_REQUIRED');
      expect(r.rows.length).toBeLessThanOrEqual(100);
      maxResponse = Math.max(maxResponse, Buffer.byteLength(JSON.stringify(r)));
      expect(maxResponse).toBeLessThanOrEqual(POSTWAR_PROJECTION_RESPONSE_MAX);
      expect(r.scope.authSubject).toBe(subject);
      expect(r.scope.countryId).toBe('COUNTRY_01');
      all.push(...r.rows);
      version = r.source.sourceVersion;
      pageCount++;
      if (r.page.nextOffset === null) break;
      offset = r.page.nextOffset;
    } while (pageCount < 100);
    expect(all).toHaveLength(250);
    expect(pageCount).toBeGreaterThan(1);
    expect(
      new Set(all.map((r) => (r as { positionId: string }).positionId)).size,
    ).toBe(250);
    expect(
      statements.every(
        (q) =>
          !q.includes('canonical_payload') && !q.includes('canonicalPayload'),
      ),
    ).toBe(true);
    const directory = process.env.ECONMIND_BOUNDED_PROJECTION_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        directory + '/pglite-bounded-metrics.json',
        JSON.stringify(
          {
            classification:
              'TEST_ONLY_SQL_INFRASTRUCTURE_NOT_FULL_MODEL_ADOPTION',
            maxResponseBytes: maxResponse,
            pageCount,
            rows: all.length,
            clientHeapDeltaBytes: process.memoryUsage().heapUsed - start,
            queries: statements,
            canonicalSeedIntentBytes: Buffer.byteLength(
              C.canonicalSerialize(
                (({ fingerprint, ...intent }) => {
                  void fingerprint;
                  return intent;
                })(seed),
              ),
            ),
            runtimeFullSeedQueries: 0,
          },
          null,
          2,
        ) + '\n',
      );
    }
  });
  it('denies raw canonical payload and direct cross-country/office SQL while enforcing actual live subject scope', async () => {
    await readerSession();
    await expect(
      db.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('rollback');
    await readerSession();
    for (const q of [
      'select country_id from world_v2.postwar_office_projection_document',
      'select jsonb_agg(rows_text) from world_v2.postwar_office_projection_page',
    ]) {
      await expect(db.query(q)).rejects.toMatchObject({ code: '42501' });
      await db.exec('rollback');
      await readerSession();
    }
    const denied = await store.readPageFrom(executor, {
      worldId: world,
      officeId: 'FINANCE',
      dataset: 'currency-fx',
    });
    expect(denied.status).toBe('DENIED');
    await db.exec('rollback');
    await readerSession(other);
    const r = await store.readPageFrom(executor, {
      worldId: world,
      officeId: 'SOCIAL',
      dataset: 'positions',
    });
    expect(r.status).toBe('PAGE');
    if (r.status === 'PAGE') expect(r.scope.countryId).toBe('COUNTRY_02');
  });
  it('rejects stale cursors, missing entitlement/current seat and publisher-role escalation without granting a new source truth', async () => {
    await readerSession();
    expect(
      (
        await store.readPageFrom(executor, {
          worldId: world,
          officeId: 'SOCIAL',
          dataset: 'positions',
          expectedVersion: 'sha256:' + 'b'.repeat(64),
        })
      ).status,
    ).toBe('STALE');
    await expect(
      db.exec('set role world_v2_postwar_projection_owner'),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
    await db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=now()where auth_subject=$1::uuid',
      [subject],
    );
    await readerSession();
    expect(
      (
        await store.readPageFrom(executor, {
          worldId: world,
          officeId: 'SOCIAL',
          dataset: 'positions',
        })
      ).status,
    ).toBe('DENIED');
    await admin();
    await db.query(
      'update world_v2.projection_entitlement set active=true,revoked_at=null where auth_subject=$1::uuid',
      [subject],
    );
    await db.query(
      "update world_v2.current_commit_authorization set capability='SOCIAL_EDUCATION'where auth_subject=$1::uuid",
      [subject],
    );
    await readerSession();
    expect(
      (
        await store.readPageFrom(executor, {
          worldId: world,
          officeId: 'SOCIAL',
          dataset: 'positions',
        })
      ).status,
    ).toBe('DENIED');
    await expect(
      db.query('select * from world_v2.postwar_office_projection_document'),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
    await db.query(
      "update world_v2.current_commit_authorization set capability='SOCIAL_LABOUR'where auth_subject=$1::uuid",
      [subject],
    );

    await readerSession();
    await expect(
      db.query(POSTWAR_PROJECTION_PUBLISH_QUERY, [
        world,
        'COUNTRY_01',
        'SOCIAL',
        'positions',
        seed.fingerprint,
        seedIntentHash,
        sourceHash,
        admissionRef,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('never silently drops an active office whose exact seat/entitlement is missing', async () => {
    await admin();
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,'COUNTRY_01','FINANCE','FINANCE_TREASURY','TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
      [world, subject],
    );
    await readerSession();
    await expect(
      store.readCurrentSeatHeadersFrom(executor, { worldId: world }),
    ).rejects.toThrow('CURRENT_SEAT_NOT_COHERENT');
    await readerSession();
    expect(
      (
        await store.readPageFrom(executor, {
          worldId: world,
          officeId: 'SOCIAL',
          dataset: 'positions',
        })
      ).status,
    ).toBe('DENIED');
    await admin();
    await db.query(
      "delete from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and office_id='FINANCE'",
      [world, subject],
    );
    await readerSession();
    expect(
      await store.readCurrentSeatHeadersFrom(executor, { worldId: world }),
    ).toHaveLength(1);
  });
  it('rejects fake offline validation and refuses re-labelling this deliberately small SQL fixture as genuine full-model publication', async () => {
    let io = 0;
    const fake: SqlExecutor = {
      async query() {
        io++;
        throw Error('NO_IO');
      },
    };
    await expect(
      publishPostwarOfficeProjectionFrom(
        fake,
        {
          classification: 'READY',
        } as unknown as PostwarOfficeProjectionPublication,
        { countryId: 'COUNTRY_01', officeId: 'SOCIAL', dataset: 'positions' },
      ),
    ).rejects.toThrow('GENUINE_OFFLINE_FULL_VALIDATION_REQUIRED');
    expect(io).toBe(0);
    expect(() =>
      preparePostwarOfficeProjectionPublication({
        seed,
        sourceBundleSha256: sourceHash,
        admissionRef,
      }),
    ).toThrow();
  });
  it('makes projection revocation and H>0 fail closed with metadata-only online reads', async () => {
    const p = await publish('COUNTRY_01', 'offers');
    await db.query(
      'select world_v2.revoke_postwar_office_projection($1,$2,$3)',
      [world, p.rows[0]!.document_ref, 'TEST_ONLY_REVOKED'],
    );
    await readerSession();
    expect(
      (
        await store.readPageFrom(executor, {
          worldId: world,
          officeId: 'SOCIAL',
          dataset: 'offers',
        })
      ).status,
    ).toBe('UNAVAILABLE');
    await admin();
    await db.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [world],
    );
    await readerSession();
    expect(
      (
        await store.readPageFrom(executor, {
          worldId: world,
          officeId: 'SOCIAL',
          dataset: 'positions',
        })
      ).status,
    ).toBe('STALE');
  });
});
