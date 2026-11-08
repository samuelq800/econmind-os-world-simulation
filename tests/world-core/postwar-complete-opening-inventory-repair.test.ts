/** Tiny genuine Core source / real baseline SQL only. No full postwar seed,
 * economic execution or production adoption is claimed. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import { POSTWAR_PROJECTION_PUBLISH_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import { createPostwarPhysicalInventoryProvenanceReader } from '../../apps/world-worker/src/persistence/postwar-physical-inventory-provenance.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const world = 'WORLD_TEST_ONLY_INVENTORY_PROVENANCE',
  subject = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const bundle = 'a'.repeat(64),
  readerRole = 'world_v2_postwar_projection_reader',
  publisher = 'world_v2_postwar_projection_publisher',
  admissionPublisher = 'world_v2_opening_admission_inventory_test';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
it('appends complete inventory from exact adopted seed without changing legacy pages/head and fails closed on bad pins/revocation', async () => {
  const db = new PGlite();
  let seed: C.OpeningSeed, canonicalSha: string, admissionRef: string;
  const admin = async () => {
    await db.exec('rollback;reset role;set session authorization postgres');
  };
  try {
    await db.exec(
      'create role anon nologin;create role authenticated nologin;create role service_role nologin',
    );
    for (const n of [
      '0001_world_v2_namespace.sql',
      '0002_world_v2_command_event_ledger.sql',
      '0003_world_v2_command_receipts_outbox.sql',
      '0004_world_v2_receipt_event_set_integrity.sql',
      '0005_world_v2_writer_lease_fencing.sql',
      '0006_world_v2_writer_lease_lineage_guard.sql',
      '0007_world_v2_atomic_transition_facts.sql',
      '0008_world_v2_materialization_recovery.sql',
      '0009_world_v2_posting_payload_integrity.sql',
      '0010_world_v2_command_claim_fencing.sql',
      '0011_world_v2_current_commit_authorization.sql',
      '0012_world_v2_command_claim_active_lease_guard.sql',
      '0013_world_v2_read_projection_boundary.sql',
      '0014_world_v2_current_negotiation_party_membership.sql',
      '0015_world_v2_narrow_transfer_approvals.sql',
      '0016_world_v2_opening_seed.sql',
      '0017_world_v2_narrow_transfer_approval_reference.sql',
      '0023_world_v2_production_consumption_posting.sql',
    ])
      await db.exec(await read('database/migrations/artifacts/' + n));
    const {
      REGISTERED_FINAL_NATIVE_SQL_ORDER,
      REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER,
    } = (await import(
      new URL(
        '../../tools/office-connection/registered-final-native-sql.mjs',
        import.meta.url,
      ).href
    )) as {
      REGISTERED_FINAL_NATIVE_SQL_ORDER: readonly string[];
      REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER: readonly string[];
    };
    for (const n of new Set([
      'runtime-read-binding-storage',
      'runtime-admission-publication',
      ...REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER,
      ...REGISTERED_FINAL_NATIVE_SQL_ORDER,
    ]))
      await db
        .exec(await read('database/proposals/' + n + '.sql'))
        .catch((cause) => {
          throw Error('DEPENDENCY:' + n + ':' + String(cause), { cause });
        });
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
            countries: [
              { countryId: 'COUNTRY_01' },
              { countryId: 'COUNTRY_02' },
            ],
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
        inventoryEntries: ['COUNTRY_01', 'COUNTRY_02'].flatMap(
          (country, index) =>
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
                batchId: C.inventoryBatchId(
                  'BATCH_TEST_ONLY_' + index + '_' + n,
                ),
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
        if (country === 'COUNTRY_02') continue;
        await db.exec('set role ' + publisher);
        await db.query<{ total_rows: number }>(
          POSTWAR_PROJECTION_PUBLISH_QUERY,
          [
            world,
            country,
            office,
            'opening-inventory-entries',
            seed.fingerprint,
            canonicalSha,
            bundle,
            admissionRef,
          ],
        );
        await db.exec('reset role');
      }

    await admin();
    const before = (
      await db.query<{ total_rows: number }>(
        "select d.*,p.rows_text,p.page_sha256 from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page p using(document_ref)where d.world_id=$1 and d.country_id='COUNTRY_01'and d.office_id in('INDUSTRY','TRADE')and d.dataset='opening-inventory-entries'order by d.office_id,p.page_index",
        [world],
      )
    ).rows;
    expect(before.map((r) => r.total_rows)).toEqual([2, 2]);
    const headBefore = (await db.query('select * from world_v2.world_head'))
      .rows;
    const candidate = await read(
      'database/proposals/postwar-complete-opening-inventory-read-repair.sql',
    );
    await expect(
      db.exec(candidate.replace(/commit;\s*$/u, 'select 1/0;commit;')),
    ).rejects.toMatchObject({ code: '22012' });
    await admin();
    expect(
      (
        await db.query<{ fn: string | null }>(
          "select to_regprocedure('world_v2.publish_postwar_complete_opening_inventory(text,text,text,text,text,text)')as fn",
        )
      ).rows[0]?.fn,
    ).toBeNull();
    await db.exec(candidate);
    for (const office of ['INDUSTRY', 'TRADE']) {
      await db.exec('set role ' + publisher);
      const fresh = await db.query<{ total_rows: number }>(
        POSTWAR_PROJECTION_PUBLISH_QUERY,
        [
          world,
          'COUNTRY_02',
          office,
          'opening-inventory-entries',
          seed.fingerprint,
          canonicalSha,
          bundle,
          admissionRef,
        ],
      );
      expect(fresh.rows[0]?.total_rows).toBe(3);
      await admin();
    }

    const publish = async (bad = false) => {
      await admin();
      await db.exec(
        'set session authorization ' +
          publisher +
          ';begin isolation level repeatable read',
      );
      try {
        return (
          await db.query(
            'select * from world_v2.publish_postwar_inventory_provenance_v2($1,$2,$3,$4,$5,$6)',
            [
              world,
              'COUNTRY_01',
              seed.fingerprint,
              bad ? '0'.repeat(64) : canonicalSha,
              bundle,
              admissionRef,
            ],
          )
        ).rows;
      } finally {
        await db.exec('rollback');
        await admin();
      }
    };
    await expect(publish(true)).rejects.toMatchObject({
      code: '23514',
      message: 'COMPLETE_INVENTORY_ACTUAL_SOURCE_PINS_REQUIRED',
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)as n from world_v2.postwar_office_projection_document where dataset='opening-inventory-entries-complete-v2'",
        )
      ).rows[0]?.n,
    ).toBe(0);
    await db.exec(
      'set session authorization ' +
        publisher +
        ';begin isolation level repeatable read',
    );
    const rows = (
      await db.query(
        'select * from world_v2.publish_postwar_inventory_provenance_v2($1,$2,$3,$4,$5,$6)',
        [
          world,
          'COUNTRY_01',
          seed.fingerprint,
          canonicalSha,
          bundle,
          admissionRef,
        ],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    await db.exec('commit');
    await admin();
    const repaired = (
      await db.query<{
        document_ref: string;
        total_rows: number;
        source_pointer: {
          parentDocumentRef: string;
          parentDocumentSha256: string;
          inventorySources: readonly object[];
        };
      }>(
        "select * from world_v2.postwar_office_projection_document where dataset='opening-inventory-entries-complete-v2'order by office_id",
      )
    ).rows;
    expect(repaired).toHaveLength(2);
    expect(repaired.map((r) => r.total_rows)).toEqual([3, 3]);
    expect(
      repaired.every(
        (r) =>
          r.source_pointer.parentDocumentRef &&
          r.source_pointer.parentDocumentSha256 &&
          r.source_pointer.inventorySources.length === 2,
      ),
    ).toBe(true);
    expect(
      (
        await db.query(
          "select d.*,p.rows_text,p.page_sha256 from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page p using(document_ref)where d.world_id=$1 and d.country_id='COUNTRY_01'and d.office_id in('INDUSTRY','TRADE')and d.dataset='opening-inventory-entries'order by d.office_id,p.page_index",
          [world],
        )
      ).rows,
    ).toEqual(before);
    expect((await db.query('select * from world_v2.world_head')).rows).toEqual(
      headBefore,
    );
    expect(await publish()).toHaveLength(2);
    await db.exec(
      'set session authorization fixture_inventory_reader;set role world_v2_postwar_projection_reader;begin isolation level repeatable read read only',
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      subject,
    ]);
    const reader = createPostwarPhysicalInventoryProvenanceReader({
      runtimeReaderRole: readerRole,
      authorizationPublisherRole: publisher,
      expectedSeedFingerprint: seed.fingerprint,
    });
    const tx = {
      async query<T extends object>(q: string, args: readonly unknown[] = []) {
        const r = await db.query<T>(q, [...args]);
        return { rows: r.rows, rowCount: r.rows.length };
      },
    };
    const page = await reader.readPageFrom(tx, {
      worldId: world,
      officeId: 'INDUSTRY',
      dataset: 'opening-inventory-entries',
      limit: 100,
    });
    expect(page.status).toBe('PAGE');
    if ('code' in page) throw Error(page.code);
    expect(page.rows).toHaveLength(3);
    expect(page.source.sourcePointer.sourceRole).toBe(
      'MULTIPLE_DIRECT_ROW_SOURCES',
    );
    await expect(
      db.query('select * from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
    await db.exec('set session authorization fixture_inventory_reader');
    await expect(
      db.query(
        'select * from world_v2.publish_postwar_complete_opening_inventory($1,$2,$3,$4,$5,$6)',
        [
          world,
          'COUNTRY_01',
          seed.fingerprint,
          canonicalSha,
          bundle,
          admissionRef,
        ],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
    const oldTrade = (
      await db.query<{ document_ref: string }>(
        "select document_ref from world_v2.postwar_office_projection_document where world_id=$1 and country_id='COUNTRY_01'and office_id='TRADE'and dataset='opening-inventory-entries'",
        [world],
      )
    ).rows[0];
    if (!oldTrade) throw Error('ACTUAL_PARENT_DOCUMENT_REQUIRED');
    await db.exec(
      'set session authorization ' +
        publisher +
        ';begin isolation level repeatable read',
    );
    await db.query(
      'select world_v2.revoke_postwar_office_projection($1,$2,$3)',
      [world, oldTrade.document_ref, 'TEST_ONLY_REVOKE_PARENT'],
    );
    await db.exec('commit');
    await admin();
    await expect(publish()).rejects.toMatchObject({
      code: '55000',
      message: 'COMPLETE_INVENTORY_PARENT_REVOKED',
    });
    await db.exec(
      'set session authorization fixture_inventory_reader;set role world_v2_postwar_projection_reader;begin isolation level repeatable read read only',
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      subject,
    ]);
    expect(
      (
        await reader.readPageFrom(tx, {
          worldId: world,
          officeId: 'TRADE',
          dataset: 'opening-inventory-entries',
          limit: 100,
        })
      ).status,
    ).toBe('UNAVAILABLE');
    await admin();
    await db.exec(
      'set session authorization ' +
        publisher +
        ';begin isolation level repeatable read',
    );
    await db.query(
      'select world_v2.revoke_postwar_office_projection($1,$2,$3)',
      [world, repaired[0]!.document_ref, 'TEST_ONLY_REVOKE_COMPLETE'],
    );
    await db.exec('commit');
    await admin();
    await expect(publish()).rejects.toMatchObject({
      code: '23514',
      message: 'COMPLETE_INVENTORY_IMMUTABLE_REPAIR_CONFLICT',
    });
  } finally {
    await db.close();
  }
}, 60000);
