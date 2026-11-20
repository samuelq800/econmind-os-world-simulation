/** Actual Atomic Goods -> complete Core fold -> independently checked SQL
 * derived pages. Economic stock/claims/three signatures are tiny TEST_ONLY
 * originals; empty Social host metadata is explicit TEST_ONLY enrollment. */
import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '@econmind/core/finance-social-replay-continuation';
import { createPostwarNarrowTradeGoodsFixture } from '../support/postwar-narrow-trade-goods-fixture.js';
import { narrowCutoffSha as sha } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createPostwarNarrowTradeAutomaticRuntime } from '../../apps/world-worker/src/preparation/postwar-narrow-trade-shipment-delivery-candidates.js';
import { derivePostwarTradeCurrentRows } from '../../apps/world-worker/src/persistence/postwar-trade-current-publication.js';
import { createPostwarTradeCurrentProjectionStore } from '../../apps/world-worker/src/persistence/postwar-trade-current-read.js';
import {
  createPostwarPagedCurrentProof,
  advancePostwarPagedCurrentProof,
  readPostwarPagedCurrentProof,
  retirePostwarPagedCurrentProof,
} from '../../apps/world-worker/src/persistence/postwar-paged-current-proof.js';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
const publisher = 'world_v2_postwar_projection_publisher',
  reader = 'world_v2_postwar_projection_reader';
type Fixture = Awaited<ReturnType<typeof createPostwarNarrowTradeGoodsFixture>>;
async function install(f: Fixture) {
  await f.reset();
  await f.db.exec(
    'create role anon nologin;create role authenticated nologin;create role service_role nologin',
  );
  // Install actual dependencies, not replacement lock/coverage/seat functions.
  for (const name of [
    'financial-posting-decimal-validation',
    'social-operating-custody',
    'social-operating-match-publisher',
    'social-intake-authorization',
    'finance-budget-custody',
    'finance-budget-capacity-source',
    'central-bank-omo-custody',
    'captain-operating-custody',
    'postwar-social-current-derived-read',
    'postwar-social-current-prefix-read',
    'postwar-financial-current-derived-read',
    'finance-budget-mixed-source',
    'postwar-beneficial-housing-rent-custody',
    'postwar-day-one-fx-history-read',
    'postwar-bounded-journal-read',
    'postwar-bounded-prefix-read',
    'postwar-bounded-prefix-pages',
    'postwar-captain-source-publication',
    'postwar-captain-mixed-read',
    'postwar-mixed-current-projection-read',
    'postwar-mixed-financial-current-publication',
    'postwar-captain-current-derived-read',
    'postwar-mixed-goods-omo-current-effects',
    'postwar-mixed-beneficial-rent-current-effects',
    'postwar-paged-current-projection',
    'postwar-source-revocation-fence',
    'postwar-trade-current-projection',
  ])
    await f.db
      .exec(await read('proposals/' + name + '.sql'))
      .catch((cause: unknown) => {
        throw new Error('TRADE_TEST_INSTALL:' + name, { cause });
      });
  const permit = (
    await f.db.query<{ source_bundle_sha256: string }>(
      'select source_bundle_sha256 from world_v2.runtime_admission_publication_permit where world_id=$1',
      [f.world],
    )
  ).rows[0]!;
  const canonical = (
    await f.db.query<{ raw: string }>(
      'select canonical_payload as raw from world_v2.opening_seed where world_id=$1',
      [f.world],
    )
  ).rows[0]!.raw;
  for (const country of [f.seller, f.buyer]) {
    const op = f.seed.sources.find(
      (x) =>
        JSON.parse(x.canonicalPayload).schemaVersion ===
        'postwar-operating-genesis-seed-source-v1',
    )!;
    await f.db.query(
      `insert into world_v2.social_operating_source_registration(world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role)values($1,$2,$3,$4,$5,$6,$7,'world_v2_social_source_publisher')`,
      [
        f.world,
        country,
        'TEST_ONLY_SOCIAL_HOST_' + country,
        f.seed.fingerprint,
        op.sourceId,
        op.payloadHash,
        f.admissionRef,
      ],
    );
    const government =
      country === f.buyer ? 'ENTITY_TEST_ONLY_GOV_2' : 'ENTITY_TEST_ONLY_GOV_1';
    const scope = C.canonicalSerialize({
      countryId: country,
      funding: [{ payerRole: 'GOV', payerEntityId: government }],
      positions: [],
      servicePools: [],
    });
    await f.db.query(
      'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        f.world,
        country,
        f.seed.fingerprint,
        f.admissionRef,
        sha(canonical),
        permit.source_bundle_sha256,
        op.sourceId,
        op.payloadHash,
        scope,
        sha(scope),
      ],
    );
    for (const [office, dataset] of [
      ['SOCIAL', 'positions'],
      ['SOCIAL', 'service-pools'],
      ['FINANCE', 'opening-financial-legs'],
      ['CENTRAL_BANK', 'opening-financial-legs'],
      ['TRADE', 'opening-inventory-entries'],
    ]) {
      if (office === 'TRADE' && country === f.seller) continue; // real fixed H0 publisher already wrote it
      const rows =
        office === 'TRADE'
          ? f.seed.inventoryEntries.filter(
              (x) => x.account.countryId === country,
            )
          : office === 'SOCIAL'
            ? []
            : f.seed.financialBatches.flatMap((b) =>
                b.legs
                  .filter((l) => l.account.countryId === country)
                  .map((leg) => ({
                    batchId: b.batchId,
                    sourceId: b.sourceId,
                    leg,
                  })),
              );
      const raw = C.canonicalSerialize(rows),
        ref =
          'TEST_ONLY_TRADE_CURRENT_' + country + '_' + office + '_' + dataset,
        src = f.seed.sources[0]!;
      await f.db.query(
        `insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)values($1,$2,$3,$4,$5,'postwar-office-projection.v1',$6,'TEST_ONLY_METADATA',$7,$8,$9,$10,$11,$12,$13,'{}',$14,$15,0,0,$16,$17,1)`,
        [
          ref,
          f.world,
          country,
          office,
          dataset,
          'sha256:' + sha(ref),
          f.admissionRef,
          f.seed.seedId,
          f.seed.fingerprint,
          sha(canonical),
          permit.source_bundle_sha256,
          src.sourceId,
          src.payloadHash,
          f.seed.replayBinding.modelVersion,
          C.canonicalSerialize(f.seed.replayBinding),
          sha(raw),
          rows.length,
        ],
      );
      await f.db.query(
        'insert into world_v2.postwar_office_projection_page values($1,$2,$3,$4,0,0,$5,$6,$7)',
        [ref, f.world, country, office, rows.length, raw, sha(raw)],
      );
    }
  }
  await f.db.query(
    "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)select world_id,auth_subject,country_id,office_id,team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and country_id=$2 and office_id in('TRADE','FINANCE')and active",
    [f.world, f.buyer],
  );
  await f.db.query(
    "insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at,revoked_at)select world_id,auth_subject,'OFFICE_PRIVATE','OFFICE_'||upper(encode(convert_to(country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(office_id,'UTF8'),'hex')),authorization_version,true,now(),null from world_v2.current_commit_authorization where world_id=$1 and country_id=$2 and office_id in('TRADE','FINANCE')and active",
    [f.world, f.buyer],
  );
  await f.db.exec(
    `create role test_trade_page_reader login nosuperuser nobypassrls noinherit;grant ${reader} to test_trade_page_reader;grant usage on schema world_v2 to test_trade_page_reader`,
  );
}
function command(f: Fixture, kind: 'SHIP' | 'DELIVER', version: string) {
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: f.world,
      countryId: f.seller,
      officeId: null,
      actorId: f.c.command.actorId,
      authSubject: f.subject,
      commandId: 'COMMAND_TEST_CURRENT_' + kind,
      commandType:
        kind === 'SHIP' ? 'CORE_GOODS_SHIPMENT_V1' : 'CORE_GOODS_DELIVERY_V1',
      expectedWorldVersion: version,
      idempotencyKey: 'KEY_TEST_CURRENT_' + kind,
      correlationId: 'CORRELATION_TEST_CURRENT_' + kind,
      submittedAtReal: f.c.at,
      simTime: '0',
      payload: {
        schemaVersion:
          kind === 'SHIP' ? 'core-goods-shipment-v1' : 'core-goods-delivery-v1',
        shipmentId: 'SHIPMENT_TEST_TRADE_CURRENT',
        transferCommandId: f.c.command.commandId,
        transferFingerprint: f.c.command.fingerprint,
        ...(kind === 'DELIVER'
          ? {
              buyerTreasuryAccountId: 'ACCOUNT_TEST_ONLY_GOV_CASH',
              sellerSettlementAccountId: 'ACCOUNT_TEST_ONLY_BANK_CASH',
              destination: {
                physicalLocationId: 'LOCATION_TEST_GOODS_BUYER',
                titleHolderId: 'ENTITY_TEST_ONLY_GOV_2',
                riskBearerId: 'ENTITY_TEST_ONLY_GOV_2',
                economicRecognitionId: null,
              },
            }
          : {}),
      },
    },
    sha,
  );
}
async function queue(f: Fixture, c: C.CanonicalCommand) {
  await f.reset();
  await f.db.query(
    `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,country_id,office_id,actor_id,auth_subject,expected_world_version,sim_time,canonical_payload,payload_sha256,command_fingerprint,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13,$14,$15,$16::timestamptz)`,
    [
      c.worldId,
      c.commandId,
      c.idempotencyKey,
      c.commandType,
      c.schemaVersion,
      c.countryId,
      c.officeId,
      c.actorId,
      c.authSubject,
      c.expectedWorldVersion,
      c.simTime.toCanonicalValue(),
      c.canonicalPayload,
      c.payloadHash,
      c.fingerprint,
      c.correlationId,
      c.submittedAtReal,
    ],
  );
  await f.db.query(
    `insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'VERSIONED_AUTOMATIC',0)`,
    [f.world, c.commandId],
  );
  await f.db.query(
    `update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=$4::timestamptz,claim_fencing_token=1,attempt_count=1 where world_id=$1 and command_id=$2`,
    [f.world, c.commandId, f.holder, f.c.at],
  );
  await f.db.exec('set session authorization ' + f.readerRole);
}
it('publishes actual Reserve -> Ship -> Deliver inventory and statuses, with least-role reads, exact retries and scope/source denials', async () => {
  const f = await createPostwarNarrowTradeGoodsFixture();
  const frames: FinanceNativeBudgetCanonicalFrame[] = [];
  const tx: SqlExecutor = {
    async query<T extends object>(q: string, args: readonly unknown[] = []) {
      const r = await f.db.query<T>(q, [...args]).catch((error: unknown) => {
        const e = error as {
          code?: string;
          message?: string;
          where?: string;
          internalQuery?: string;
        };
        process.stderr.write(
          'TRADE_READER_CAUSE ' +
            JSON.stringify({
              sql: q,
              code: e.code,
              message: e.message,
              where: e.where,
              internalQuery: e.internalQuery,
            }) +
            '\n',
        );
        throw error;
      });
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  const store = createPostwarTradeCurrentProjectionStore({
    runtimeReaderRole: reader,
    authorizationPublisherRole: publisher,
  });
  try {
    await install(f);
    const opening = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      sha256Hex: sha,
    });
    const auto = createPostwarNarrowTradeAutomaticRuntime({
      worldId: f.world,
      workerId: f.holder,
      database: f.database,
      source: f.source,
    });
    for (const stage of ['RESERVED', 'SHIPPED', 'DELIVERED'] as const) {
      process.stderr.write('TRADE_ACTUAL_STAGE ' + stage + '\n');
      const c =
        stage === 'RESERVED'
          ? f.c.command
          : command(
              f,
              stage === 'SHIPPED' ? 'SHIP' : 'DELIVER',
              String(frames.length),
            );
      if (stage !== 'RESERVED') await queue(f, c);
      else await f.db.exec('set session authorization ' + f.readerRole);
      const draft = await (
        stage === 'RESERVED'
          ? f.runtime.candidateFactory
          : stage === 'SHIPPED'
            ? auto.shipmentCandidateFactory
            : auto.deliveryCandidateFactory
      ).prepare({
        command: c,
        commitAuthorization: stage === 'RESERVED' ? f.c.proof : null,
        observedAtReal: f.c.at,
      });
      const candidate = prepareAtomicTransitionCandidate({
        command: c,
        commitAuthorization: stage === 'RESERVED' ? f.c.proof : null,
        draft,
        sha256Hex: sha,
      });
      expect((await f.repository.commit(candidate)).receipt.outcome).toBe(
        'COMMITTED',
      );
      expect((await f.repository.commit(candidate)).source).toBe(
        'EXISTING_COMMIT',
      );
      frames.push({
        command: c,
        events: draft.transition.events,
        transition: draft.transition,
        receipt: draft.receipt,
        financialPostingBatches: draft.financialPostingBatches,
        inventoryPostings: draft.inventoryPostings,
      });
      const head = {
        worldVersion: String(frames.length),
        eventSequence: String(frames.length),
      };
      let cursor = prepareFinanceSocialReplayContinuation(
        {
          opening,
          socialCountries: [],
          expectedHead: head,
          openingEncumbrances: [],
          fxOriginals: [],
        },
        sha,
      );
      let proof = createPostwarPagedCurrentProof(cursor);
      cursor = appendFinanceSocialReplayPage({
        continuation: cursor,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.world,
          seedFingerprint: f.seed.fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: head,
          expectedHead: head,
          frames,
          framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
        },
        sha256Hex: sha,
      });
      proof = advancePostwarPagedCurrentProof({ proof, continuation: cursor });
      const view = readFinanceSocialReplayContinuation(cursor),
        rows = derivePostwarTradeCurrentRows({
          replay: view,
          countryId: f.seller,
        });
      expect(rows.transfers[0]?.status).toBe(stage);
      expect(() =>
        derivePostwarTradeCurrentRows({
          replay: { ...view },
          countryId: f.seller,
        }),
      ).toThrow();
      expect(
        derivePostwarTradeCurrentRows({
          replay: view,
          countryId: 'COUNTRY_03',
        }),
      ).toMatchObject({ inventory: [], transfers: [] });
      const coverage = readPostwarPagedCurrentProof(proof).coverage;
      for (const country of [f.seller, f.buyer]) {
        process.stderr.write(
          'TRADE_ACTUAL_COUNTRY ' + stage + ' ' + country + '\n',
        );
        const rows = derivePostwarTradeCurrentRows({
          replay: view,
          countryId: country,
        });
        if (country === f.buyer)
          expect(rows.inventory.map((x) => x.quantity)).toEqual(
            stage === 'DELIVERED' ? ['1'] : [],
          );
        const assertion = C.canonicalSerialize({
          head: { worldId: f.world, ...head },
          seedPins: {
            worldId: f.world,
            seedId: f.seed.seedId,
            seedFingerprint: f.seed.fingerprint,
            admissionRef: f.admissionRef,
          },
          coverage,
          inventoryRowsHash: rows.inventoryRowsHash,
          transferRowsHash: rows.transferRowsHash,
        });
        await f.reset();
        await f.db.exec(
          'set role ' + publisher + ';begin isolation level repeatable read',
        );
        let published;
        try {
          published = await f.db.query(
            'select * from world_v2.publish_postwar_paged_trade_current($1,$2,$3)',
            [f.world, country, assertion],
          );
          expect(published.rows).toHaveLength(2);
          expect(
            (
              await f.db.query(
                'select * from world_v2.publish_postwar_paged_trade_current($1,$2,$3)',
                [f.world, country, assertion],
              )
            ).rows,
          ).toEqual(published.rows);
          await f.db.exec('commit');
        } catch (e) {
          const error = e as {
            code?: string;
            where?: string;
            internalQuery?: string;
            message?: string;
          };
          console.error(
            'TRADE_PUBLICATION_SQL',
            JSON.stringify({
              stage,
              code: error.code,
              where: error.where,
              query: error.internalQuery,
              message: error.message,
            }),
          );
          await f.db.exec('rollback');
          throw e;
        }
        await f.reset();
        await f.db.exec(
          'set session authorization test_trade_page_reader;set role ' + reader,
        );
        await f.db.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [
            country === f.seller
              ? f.subject
              : '00000000-0000-4000-8000-000000000002',
          ],
        );
        await f.db.exec('begin isolation level repeatable read read only');
        try {
          const stock = await store.readPageFrom(tx, {
            worldId: f.world,
            dataset: 'inventory-current',
          });
          expect(stock).toMatchObject({
            status: rows.inventory.length ? 'PAGE' : 'EMPTY',
            rows: rows.inventory,
          });
          const goods = await store.readPageFrom(tx, {
            worldId: f.world,
            dataset: 'goods-transfers-current',
          });
          expect(stock).toMatchObject({
            status: rows.inventory.length ? 'PAGE' : 'EMPTY',
            rows: rows.inventory,
          });
          expect(goods).toMatchObject({ status: 'PAGE', rows: rows.transfers });
          await f.db.query(
            "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true)",
          );
          expect(
            await store.readPageFrom(tx, {
              worldId: f.world,
              dataset: 'inventory-current',
            }),
          ).toMatchObject({ status: 'DENIED' });
        } finally {
          await f.db.exec('rollback');
        }
      }
      retirePostwarPagedCurrentProof(proof);
      retireFinanceSocialReplayContinuation(cursor);
    }
    await f.reset();
    expect(
      (
        await f.db.query(
          'select count(*)::int as n from world_v2.authoritative_event',
        )
      ).rows[0],
    ).toMatchObject({ n: 3 });
    expect(
      (
        await f.db.query(
          'select count(*)::int as n from world_v2.inventory_posting',
        )
      ).rows[0],
    ).toMatchObject({ n: 3 });
    expect(
      (
        await f.db.query(
          'select count(*)::int as n from world_v2.financial_posting_batch',
        )
      ).rows[0],
    ).toMatchObject({ n: 1 });
    await f.db.query(
      "insert into world_v2.postwar_office_projection_revocation(document_ref,world_id,reason_ref)select document_ref,world_id,'TEST_ONLY_REVOKE_PARENT'from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and office_id='TRADE'and dataset='opening-inventory-entries'",
      [f.world, f.seller],
    );
    await f.db.exec(
      'set session authorization test_trade_page_reader;set role ' + reader,
    );
    await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      f.subject,
    ]);
    await f.db.exec('begin isolation level repeatable read read only');
    try {
      expect(
        await store.readPageFrom(tx, {
          worldId: f.world,
          dataset: 'inventory-current',
        }),
      ).toMatchObject({ status: 'UNAVAILABLE' });
    } finally {
      await f.db.exec('rollback');
    }
  } finally {
    await f.close();
  }
}, 180000);
