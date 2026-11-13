/** Small TEST_ONLY SQL/Core sources, not the full postwar adoption or owner
 * custody. Exercises fixed extraction, version migration and real RLS/roles. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import { POSTWAR_PROJECTION_PUBLISH_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import {
  createPostwarPhysicalInventoryProvenanceReader,
  publishPostwarPhysicalInventoryProvenanceFrom,
} from '../../apps/world-worker/src/persistence/postwar-physical-inventory-provenance.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPhysicalOpeningHttpNativeFixture } from '../support/postwar-physical-opening-http-native-fixture.js';
import { sealPostwarReferenceClone } from '../support/postwar-native-reference-db.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const world = 'WORLD_TEST_ONLY_INVENTORY_PROVENANCE',
  subject = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const bundle = 'a'.repeat(64),
  readerRole = 'world_v2_postwar_projection_reader',
  publisher = 'world_v2_postwar_projection_publisher',
  admissionPublisher = 'world_v2_opening_admission_inventory_test';
let db: PGlite, seed: C.OpeningSeed, canonicalSha: string, admissionRef: string;
const statements: string[] = [];
const tx: SqlExecutor = {
  async query<Row extends object>(q: string, args: readonly unknown[] = []) {
    statements.push(q);
    const r = await db.query<Row>(q, [...args]);
    return { rows: r.rows, rowCount: r.rows.length };
  },
};
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
async function admin() {
  await db.exec('rollback;reset role;set session authorization postgres');
}
const pins = () => ({
  worldId: world,
  countryId: 'COUNTRY_01',
  seedFingerprint: seed.fingerprint,
  canonicalSeedSha256: canonicalSha,
  sourceBundleSha256: bundle,
  admissionRef,
});
const h3Path = process.env.ECONMIND_INVENTORY_PROVENANCE_NATIVE_H3;
const h0Path = process.env.ECONMIND_INVENTORY_PROVENANCE_NATIVE_H0;
describe.skipIf(!h3Path && !h0Path)(
  'actual admitted c427 inventory provenance repair (TEST_ONLY)',
  () => {
    it('derives both direct-source attestations offline once and seals an unchanged H3 with bounded low-role readback', async () => {
      if (!h3Path || !h0Path)
        throw Error('BOTH_OWNED_ACTUAL_DESCRIPTOR_PATHS_REQUIRED');
      const out =
        process.env.ECONMIND_INVENTORY_PROVENANCE_NATIVE_EVIDENCE ??
        '/workspace/office-connection-evidence/postwar-inventory-provenance-native-20261028';
      await mkdir(out, { recursive: true });
      const fixture = await createPhysicalOpeningHttpNativeFixture(
        h3Path,
        h0Path,
      );
      const { clone, marker } = fixture;
      let sealed = false;
      const evidence: Record<string, unknown> = {
        classification:
          'TEST_ONLY_ACTUAL_ADMITTED_SOURCE_PROVENANCE_REPAIR_NOT_NEW_STATE_OR_PRODUCTION',
        source: fixture.sourceEvidence,
        WorldClock: false,
        production: false,
        oldDocumentsRewritten: false,
      };
      try {
        const legacy = (
          await clone.installer.query(
            "select document_ref,source_version,source_pointer,canonical_seed_sha256,document_sha256 from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and office_id in('INDUSTRY','TRADE')and dataset='opening-inventory-entries'order by office_id",
            [marker.worldId, marker.countryId],
          )
        ).rows;
        const ddl = await read(
          'database/proposals/postwar-physical-inventory-provenance.sql',
        );
        await clone.installer.query(ddl);
        evidence.proposalSha256 = sha(ddl);
        const client = await clone.installer.connect();
        try {
          await client.query('set role world_v2_postwar_projection_publisher');
          const port: SqlExecutor = {
            async query<Row extends object>(
              q: string,
              args: readonly unknown[] = [],
            ) {
              const r = await client.query<Row>(q, [...args]);
              return { rows: r.rows, rowCount: r.rowCount };
            },
          };
          evidence.attestations =
            await publishPostwarPhysicalInventoryProvenanceFrom(port, {
              worldId: marker.worldId,
              countryId: marker.countryId,
              seedFingerprint: marker.seedFingerprint,
              canonicalSeedSha256: legacy[0]!.canonical_seed_sha256,
              sourceBundleSha256: marker.sourceBundleSha256,
              admissionRef: marker.admissionRef,
            });
        } finally {
          await client.query('reset role').catch(() => {});
          client.release();
        }
        const after = (
          await clone.installer.query(
            "select document_ref,source_version,source_pointer,canonical_seed_sha256,document_sha256 from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and office_id in('INDUSTRY','TRADE')and dataset='opening-inventory-entries'order by office_id",
            [marker.worldId, marker.countryId],
          )
        ).rows;
        expect(after).toEqual(legacy);
        evidence.legacyDocumentsUnchanged = legacy;
        const reader = createPostwarPhysicalInventoryProvenanceReader({
          runtimeReaderRole: marker.roles.boundedReaderRole,
          authorizationPublisherRole: marker.roles.authorizationPublisherRole,
          expectedSeedFingerprint: marker.seedFingerprint,
        });
        const statements: string[] = [],
          pages = [];
        for (const office of ['INDUSTRY', 'TRADE'] as const) {
          const c = await clone.boundedReader.connect();
          try {
            await c.query('begin isolation level repeatable read read only');
            await c.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [marker.subject],
            );
            const port: SqlExecutor = {
              async query<Row extends object>(
                q: string,
                args: readonly unknown[] = [],
              ) {
                statements.push(q);
                const r = await c.query<Row>(q, [...args]);
                return { rows: r.rows, rowCount: r.rowCount };
              },
            };
            const result = await reader.readPageFrom(port, {
              worldId: marker.worldId,
              officeId: office,
              dataset: 'opening-inventory-entries',
              limit: 100,
            });
            expect(result.status).toBe('PAGE');
            if ('code' in result) throw Error(result.code);
            expect(result.rows).toEqual(
              fixture.originals.get(office + '/opening-inventory-entries'),
            );
            expect(result.source.observedHead.worldVersion).toBe('3');
            expect(result.source.originWorldVersion).toBe('0');
            expect(result.source.sourcePointer.sourceId).toBe(
              'SOURCE_POSTWAR_FINANCIAL_V1',
            );
            expect(result.source.sourcePointer.adoptionContextSourceId).toBe(
              'SOURCE_POSTWAR_OPERATING_V1',
            );
            expect(result.source.sourcePointer.sourcePayloadHash).not.toBe(
              result.source.sourcePointer.adoptionContextSourcePayloadHash,
            );
            expect(
              Buffer.byteLength(JSON.stringify(result)),
            ).toBeLessThanOrEqual(65536);
            expect(
              (
                await reader.readPageFrom(port, {
                  worldId: marker.worldId,
                  officeId: office,
                  dataset: 'opening-inventory-entries',
                  limit: 1,
                  expectedVersion: String(
                    legacy.find(
                      (d) =>
                        d.document_ref ===
                        result.source.sourcePointer.legacyDocumentRef,
                    )!.source_version,
                  ),
                })
              ).status,
            ).toBe('STALE');
            pages.push(result);
          } finally {
            await c.query('rollback').catch(() => {});
            c.release();
          }
        }
        await expect(
          clone.boundedReader.query(
            'select jsonb_agg(source_pointer)from world_v2.postwar_inventory_provenance_v2',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        expect(
          statements.some((q) =>
            /canonical_payload|from world_v2.opening_seed/iu.test(q),
          ),
        ).toBe(false);
        evidence.pages = pages;
        evidence.onlineStatements = statements;
        evidence.onlineCanonicalPayloadRead = false;
        await clone.close();
        await sealPostwarReferenceClone(marker, clone.database);
        sealed = true;
        const handoff = {
          schemaVersion: 'postwar-inventory-provenance-native-template-v2',
          referenceMarker: JSON.parse(await readFile(h3Path, 'utf8'))
            .referenceMarker,
          templateDatabase: clone.database,
          worldId: marker.worldId,
          seedFingerprint: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
          sourceBundleSha256: marker.sourceBundleSha256,
          worldVersion: '3',
          eventSequence: '3',
          proposalSha256: sha(ddl),
          legacyPointerSemantics:
            'LEGACY_ADOPTION_CONTEXT_POINTER_NOT_DIRECT_ROW_SOURCE',
        };
        evidence.handoff = handoff;
        await writeFile(
          path.join(out, 'current-template.json'),
          JSON.stringify(handoff, null, 2) + '\n',
        );
      } catch (error) {
        evidence.failure =
          error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        try {
          if (!sealed) await clone.drop();
        } finally {
          await writeFile(
            path.join(out, 'native-evidence.json'),
            JSON.stringify(evidence, null, 2) + '\n',
          );
        }
      }
    }, 90_000);
  },
);
async function publish() {
  await admin();
  await db.exec('set role ' + publisher);
  try {
    return await publishPostwarPhysicalInventoryProvenanceFrom(tx, pins());
  } finally {
    await db.exec('reset role').catch(() => {});
  }
}
async function low(who = subject) {
  await admin();
  await db.exec(
    'set session authorization fixture_inventory_reader;set role ' + readerRole,
  );
  await db.exec('begin isolation level repeatable read read only');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [who]);
}
function reader() {
  return createPostwarPhysicalInventoryProvenanceReader({
    runtimeReaderRole: readerRole,
    authorizationPublisherRole: publisher,
    expectedSeedFingerprint: seed.fingerprint,
  });
}
async function page(
  options: { offset?: number; expectedVersion?: string; who?: string } = {},
) {
  await low(options.who);
  return reader().readPageFrom(tx, {
    worldId: world,
    officeId: 'INDUSTRY',
    dataset: 'opening-inventory-entries',
    limit: 1,
    ...options,
  });
}
beforeAll(async () => {
  db = new PGlite();
  for (const name of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0007_world_v2_atomic_transition_facts',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read('database/migrations/artifacts/' + name + '.sql'));
  for (const name of [
    'runtime-read-binding-storage',
    'runtime-admission-publication',
    'postwar-office-derived-read',
    'postwar-physical-opening-facts-read',
    'postwar-physical-inventory-provenance',
  ])
    await db.exec(await read('database/proposals/' + name + '.sql'));
  const source = (id: string, payload: unknown) =>
    C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId(id),
        sourceKind: 'AUTHORITATIVE_DATASET',
        locator: 'TEST_ONLY_NOT_FORMAL_SOURCE',
        sourceVersion: 'TEST_ONLY_V1',
        payload,
      },
      sha,
    );
  const financial = source('SOURCE_TEST_ONLY_FINANCIAL', {
      schemaVersion: 'adopted-financial-opening-source-v2',
      assembly: { worldId: world, countries: [] },
      reconciliations: [],
    }),
    operating = source('SOURCE_TEST_ONLY_OPERATING', {
      schemaVersion: 'postwar-operating-genesis-seed-source-v1',
      carrier: {
        socialEmployment: {
          countries: [{ countryId: 'COUNTRY_01' }, { countryId: 'COUNTRY_02' }],
        },
      },
    }),
    supplement = source('SOURCE_TEST_ONLY_SUPPLEMENT', {
      schemaVersion: 'test-only-supplement',
    });
  seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_INVENTORY_PROVENANCE'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [financial, operating, supplement],
      financialBatches: [],
      inventoryEntries: ['COUNTRY_01', 'COUNTRY_02'].flatMap((country, index) =>
        [0, 1, 2].map((n) => ({
          entryId: C.openingInventoryEntryId(
            'ENTRY_TEST_ONLY_' + index + '_' + n,
          ),
          sourceId: n === 2 ? supplement.sourceId : financial.sourceId,
          quantity: C.Quantity.from('7', 'tonne'),
          account: C.createInventoryAccount({
            worldId: C.worldId(world),
            countryId: C.countryId(country),
            commodityId: C.commodityId('GRAIN'),
            batchId: C.inventoryBatchId('BATCH_TEST_ONLY_' + index + '_' + n),
            physicalLocationId: C.inventoryLocationId(
              'LOCATION_TEST_ONLY_' + index,
            ),
            unit: 'tonne',
            bucket: 'AVAILABLE',
            reservationId: null,
            shipmentId: null,
            titleHolderId: C.legalEntityId('ENTITY_OP_TEST_ONLY_' + index),
            riskBearerId: C.legalEntityId('ENTITY_OP_TEST_ONLY_' + index),
            economicRecognitionId: null,
          }),
        })),
      ),
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
  canonicalSha = sha(C.canonicalSerialize(intent));
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
    `create role ${admissionPublisher} nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant usage on schema world_v2 to ${admissionPublisher};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${admissionPublisher};create role fixture_inventory_reader nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant ${readerRole} to fixture_inventory_reader`,
  );
  const now = Date.now(),
    keys = generateKeyPairSync('ed25519'),
    claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY_INVENTORY',
      keyId: 'TEST_ONLY_EPHEMERAL',
      ownerIdentity: 'TEST_ONLY_NOT_OWNER',
      issuedAtReal: new Date(now - 60000).toISOString(),
      expiresAtReal: new Date(now + 3600000).toISOString(),
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: C.canonicalSerialize(seed.replayBinding),
      sourceBundleSha256: bundle,
    };
  const canonical = C.canonicalSerialize(claims),
    signature = sign(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.privateKey,
    ).toString('base64url');
  await db.exec('set role world_v2_admission_release');
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      claims.authorizationId,
      sha(canonical),
      canonical,
      signature,
      world,
      seed.seedId,
      fingerprint,
      claims.modelVersion,
      claims.replayBinding,
      bundle,
      admissionPublisher,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await admin();
  await db.exec('set session authorization ' + admissionPublisher);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [claims.authorizationId, sha(canonical), bundle],
  );
  admissionRef = 'ADMISSION_' + sha(canonical).toUpperCase();
  await admin();
  for (const [who, country] of [
    [subject, 'COUNTRY_01'],
    [other, 'COUNTRY_02'],
  ])
    for (const [office, capability] of [
      ['INDUSTRY', 'INDUSTRY_PRODUCTION'],
      ['TRADE', 'TRADE_CONTRACTS'],
    ]) {
      await db.query(
        "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,$4,$5,'TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
        [world, who, country, office, capability],
      );
      await db.query(
        "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,$4,'TEAM_TEST_ONLY','REV_TEST_ONLY')",
        [world, who, country, office],
      );
      await db.query(
        "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_TEST_ONLY',true,now(),null)",
        [
          world,
          who,
          'OFFICE_' +
            Buffer.from(country!).toString('hex').toUpperCase() +
            '_' +
            Buffer.from(office!).toString('hex').toUpperCase(),
        ],
      );
      await db.exec('set role ' + publisher);
      await db.query(POSTWAR_PROJECTION_PUBLISH_QUERY, [
        world,
        country,
        office,
        'opening-inventory-entries',
        seed.fingerprint,
        canonicalSha,
        bundle,
        admissionRef,
      ]);
      await db.exec('reset role');
    }
}, 60_000);
afterEach(async () => {
  await admin();
  await db.query(
    'update world_v2.world_head set world_version=0,event_sequence=0 where world_id=$1',
    [world],
  );
  await db.query(
    'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1',
    [world],
  );
});
afterAll(async () => db?.close());
describe('versioned direct inventory provenance over immutable legacy documents', () => {
  it('keeps legacy rows/versions intact and publishes distinct direct-source metadata for both offices', async () => {
    await db.exec('begin');
    const before = (
      await db.query<{
        source_version: string;
        source_pointer: unknown;
        document_sha256: string;
      }>(
        "select source_version,source_pointer,document_sha256 from world_v2.postwar_office_projection_document where country_id='COUNTRY_01'order by office_id",
      )
    ).rows;
    const published = await publish();
    expect(published).toHaveLength(2);
    expect(await publish()).toEqual(published);
    const after = (
      await db.query<{
        source_version: string;
        source_pointer: unknown;
        document_sha256: string;
      }>(
        "select source_version,source_pointer,document_sha256 from world_v2.postwar_office_projection_document where country_id='COUNTRY_01'order by office_id",
      )
    ).rows;
    expect(after).toEqual(before);
    const result = await page();
    expect(result.status).toBe('PAGE');
    if ('code' in result) throw Error(result.code);
    expect(result.source.sourcePointer).toMatchObject({
      schemaVersion: 'postwar-inventory-source-pointer-v2',
      sourceRole: 'DIRECT_ROW_SOURCE',
      sourceId: 'SOURCE_TEST_ONLY_FINANCIAL',
      adoptionContextSourceId: 'SOURCE_TEST_ONLY_OPERATING',
      legacyPointerSemantics:
        'LEGACY_ADOPTION_CONTEXT_POINTER_NOT_DIRECT_ROW_SOURCE',
    });
    expect(result.source.sourceVersion).not.toBe(before[0]!.source_version);
    expect(result.rows).toHaveLength(1);
    expect(result.source.originWorldVersion).toBe('0');
    expect(
      result.rows.every(
        (r) =>
          (r as { sourceId: string }).sourceId === 'SOURCE_TEST_ONLY_FINANCIAL',
      ),
    ).toBe(true);
    const next = await page({
      offset: 1,
      expectedVersion: result.source.sourceVersion,
    });
    expect(next.status).toBe('PAGE');
    expect(
      (
        await page({
          offset: 1,
          expectedVersion: before[0]!.source_version as string,
        })
      ).status,
    ).toBe('STALE');
    expect(
      (await page({ expectedVersion: result.source.sourceVersion, who: other }))
        .status,
    ).toBe('UNAVAILABLE');
  });
  it('requires attestation instead of silently treating the old context pointer as repaired', async () => {
    await db.exec('begin');
    expect((await page({ who: other })).status).toBe('UNAVAILABLE');
  });
  it('rejects arbitrary assertion pins and makes no caller-provided pointer authoritative', async () => {
    await db.exec('begin;set local role ' + publisher);
    await expect(
      publishPostwarPhysicalInventoryProvenanceFrom(tx, {
        ...pins(),
        canonicalSeedSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('ACTUAL_SOURCE_PINS_REQUIRED');
  });
  it('requires a cursor version, keeps online reads bounded and denies private metadata SQL aggregation', async () => {
    await db.exec('begin');
    await publish();
    await low();
    statements.length = 0;
    await expect(
      reader().readPageFrom(tx, {
        worldId: world,
        officeId: 'INDUSTRY',
        dataset: 'opening-inventory-entries',
        offset: 1,
        limit: 1,
      }),
    ).rejects.toThrow('INVALID_PAGE');
    await admin();
    await db.exec('begin');
    await publish();
    const result = await page();
    expect(result.status).toBe('PAGE');
    expect(
      statements.some((q) =>
        /canonical_payload|from world_v2.opening_seed/u.test(q),
      ),
    ).toBe(false);
    await expect(
      db.query(
        'select jsonb_agg(source_pointer)from world_v2.postwar_inventory_provenance_v2',
      ),
    ).rejects.toThrow('permission denied');
  });
  it('rechecks coherent current authorization and preserves historical H0 origin at H>0', async () => {
    await db.exec('begin');
    await publish();
    await db.query(
      'update world_v2.world_head set world_version=3,event_sequence=3 where world_id=$1',
      [world],
    );
    const result = await page();
    expect(result.status).toBe('PAGE');
    if ('code' in result) throw Error(result.code);
    expect(result.source.observedHead.worldVersion).toBe('3');
    expect(result.source.originWorldVersion).toBe('0');
    await admin();
    await db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=now()where world_id=$1 and auth_subject=$2::uuid',
      [world, subject],
    );
    await expect(page()).rejects.toThrow('CURRENT_SEAT_NOT_COHERENT');
  });
  it('retains immutable metadata and denies online publication or owner escalation', async () => {
    await db.exec('begin');
    await publish();
    await expect(
      db.query(
        "update world_v2.postwar_inventory_provenance_v2 set source_revision='FORGED'",
      ),
    ).rejects.toThrow();
    await admin();
    await db.exec('begin');
    await low();
    await expect(
      publishPostwarPhysicalInventoryProvenanceFrom(tx, pins()),
    ).rejects.toThrow('permission denied');
    await admin();
    await low();
    await expect(
      db.exec('set role world_v2_postwar_projection_owner'),
    ).rejects.toThrow('permission denied');
  });
  it('does not accept a legacy context pointer relabeled as new direct provenance', async () => {
    await publish();
    await low();
    const corrupt: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        const result = await tx.query<Record<string, unknown>>(sql, args);
        if (sql.includes('read_postwar_inventory_provenance_v2_page')) {
          const rows = result.rows.map((row) => {
            const source = row.source_json as Record<string, unknown>;
            const pointer = source.sourcePointer as Record<string, unknown>;
            return {
              ...row,
              source_json: {
                ...source,
                sourcePointer: {
                  ...pointer,
                  sourceId: pointer.adoptionContextSourceId,
                },
              },
            };
          });
          return {
            rows: rows as unknown as readonly Row[],
            rowCount: rows.length,
          };
        }
        return {
          rows: result.rows as readonly Row[],
          rowCount: result.rowCount,
        };
      },
    };
    await expect(
      reader().readPageFrom(corrupt, {
        worldId: world,
        officeId: 'INDUSTRY',
        dataset: 'opening-inventory-entries',
        limit: 1,
      }),
    ).rejects.toThrow('EXACT_V2_SOURCE_ROLES_REQUIRED');
  });
  it('keeps original document revocation effective for the new metadata version', async () => {
    await publish();
    await admin();
    await db.query(
      "insert into world_v2.postwar_office_projection_revocation(document_ref,world_id,reason_ref)select document_ref,world_id,'TEST_ONLY_SOURCE_REVOKED'from world_v2.postwar_office_projection_document where world_id=$1 and country_id='COUNTRY_01'and office_id='INDUSTRY'",
      [world],
    );
    expect((await page()).status).toBe('UNAVAILABLE');
  });
});
