/** Actual tiny Core/Atomic economic fixtures; projection metadata below is
 * explicitly TEST_ONLY. No formal securities, mandate, activation or native PG. */
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import type { PGlite } from '@electric-sql/pglite';
import { createPostwarNarrowTradeGoodsFixture } from '../support/postwar-narrow-trade-goods-fixture.js';
import { narrowCutoffSha as sha } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import { createCentralBankOmoAtomicFixture } from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createPostwarNarrowTradeAutomaticRuntime } from '../../apps/world-worker/src/preparation/postwar-narrow-trade-shipment-delivery-candidates.js';
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
const json = (v: unknown) =>
  JSON.parse(C.canonicalSerialize(v)) as Record<string, unknown>;
async function metadata(
  db: PGlite,
  seed: C.OpeningSeed,
  admission: string,
  cb: boolean,
) {
  await db.exec('reset role;set session authorization postgres');
  if (!cb) await db.exec(await read('proposals/central-bank-omo-custody.sql'));
  else {
    for (const id of [
      '0014_world_v2_current_negotiation_party_membership',
      '0015_world_v2_narrow_transfer_approvals',
      '0017_world_v2_narrow_transfer_approval_reference',
    ])
      await db.exec(await read('migrations/artifacts/' + id + '.sql'));
    await db.exec(`create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls;
  create role world_v2_postwar_narrow_trade_current_owner nologin nosuperuser nobypassrls;
  grant usage on schema world_v2 to world_v2_postwar_projection_owner,world_v2_postwar_narrow_trade_current_owner;
  create table world_v2.postwar_narrow_trade_current_original(world_id text,source_id text,seed_fingerprint text,source_payload_hash text,canonical_payload text);
  create table world_v2.postwar_narrow_trade_rights_admission(world_id text,source_id text,seed_fingerprint text,source_payload_hash text,admission_ref text);
  create table world_v2.postwar_office_projection_document(document_ref text primary key,world_id text,country_id text,office_id text,dataset text,seed_fingerprint text,admission_ref text,world_version bigint,event_sequence bigint);
  create table world_v2.postwar_office_projection_page(document_ref text,rows_text text);
  create function world_v2.postwar_projection_admission_header(text)returns table(seed_fingerprint text,admission_ref text)language sql security definer set search_path=pg_catalog as $$select seed_fingerprint,admission_ref from world_v2.runtime_opening_admission where world_id=$1$$;
  `);
  }
  // Only the fixture H0 financial batches are projected. No caller balance DTO.
  // The full production document table is reused where present.
  if (cb) {
    await db.query(
      "insert into world_v2.postwar_office_projection_document values('TEST_ONLY_H0',$1,'COUNTRY_01','CENTRAL_BANK','opening-financial-legs',$2,$3,0,0)",
      [seed.worldId, seed.fingerprint, admission],
    );
    await db.query(
      "insert into world_v2.postwar_office_projection_page values('TEST_ONLY_H0',$1)",
      [
        C.canonicalSerialize(
          seed.financialBatches.flatMap((b) => b.legs.map((leg) => ({ leg }))),
        ),
      ],
    );
  } else {
    // Clone a metadata envelope only; row bytes come from the actual Core seed.
    const cols =
      'document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count';
    const rows = C.canonicalSerialize(
      seed.financialBatches.flatMap((b) => b.legs.map((leg) => ({ leg }))),
    );
    await db.query(
      `insert into world_v2.postwar_office_projection_document(${cols})select 'TEST_ONLY_H0',world_id,country_id,'FINANCE','opening-financial-legs',projection_version,'TEST_ONLY_H0_VERSION',source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,0,0,$1,$2,1 from world_v2.postwar_office_projection_document limit 1`,
      [sha(rows), JSON.parse(rows).length],
    );
    await db.query(
      "insert into world_v2.postwar_office_projection_page(document_ref,world_id,country_id,office_id,page_index,row_offset,row_count,rows_text,page_sha256)values('TEST_ONLY_H0',$1,$2,'FINANCE',0,0,$3,$4,$5)",
      [seed.worldId, 'COUNTRY_01', JSON.parse(rows).length, rows, sha(rows)],
    );
  }
  await db.exec(`create table if not exists world_v2.postwar_social_prefix_scope(world_id text,country_id text,scope_document text);
 grant select on world_v2.postwar_office_projection_document,world_v2.postwar_office_projection_page,world_v2.postwar_social_prefix_scope,world_v2.command_submission,world_v2.command_receipt,world_v2.financial_posting_batch to world_v2_postwar_projection_owner;
 `);
  // Isolated fixture enrollment, exact World only; no production enrollment.
  for (const table of [
    'command_submission',
    'command_receipt',
    'financial_posting_batch',
  ])
    await db.exec(
      `create policy test_only_extended_projection_read on world_v2.${table} for select to world_v2_postwar_projection_owner using(world_id='${seed.worldId}')`,
    );
  const extension = await read(
    'proposals/postwar-mixed-goods-omo-current-effects.sql',
  );
  try {
    await db.exec(extension);
  } catch (e) {
    const err = e as {
      message: string;
      position?: string;
      internalPosition?: string;
      internalQuery?: string;
      where?: string;
    };
    throw new Error(
      JSON.stringify({
        message: err.message,
        position: err.position,
        where: err.where,
      }),
      { cause: e },
    );
  }
  await db.query(
    "select set_config('econmind.postwar_projection_world',$1,false)",
    [seed.worldId],
  );
}
async function group(
  db: PGlite,
  fn: 'goods' | 'omo',
  world: string,
  command: C.CanonicalCommand,
  draft: {
    transition: { readonly events: readonly unknown[] };
    financialPostingBatches: readonly unknown[];
    inventoryPostings: readonly unknown[];
  },
  prior: unknown = null,
) {
  return db
    .query<{ value: unknown }>(
      `select world_v2.postwar_mixed_${fn}_group($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb)as value`,
      [
        world,
        C.canonicalSerialize(command),
        C.canonicalSerialize(draft.transition),
        C.canonicalSerialize(draft.transition.events[0]),
        C.canonicalSerialize(draft.financialPostingBatches),
        C.canonicalSerialize(fn === 'goods' ? draft.inventoryPostings : prior),
      ],
    )
    .catch((e: unknown) => {
      const err = e as { message: string; detail?: string; where?: string };
      throw new Error(
        JSON.stringify({
          message: err.message,
          detail: err.detail,
          where: err.where,
        }),
        { cause: e },
      );
    });
}
describe('bounded Goods/OMO current economic reducers', () => {
  it('recomputes actual Reserve→Ship→Deliver stock and GCU payment; altered stock/account/payment refuses', async () => {
    const f = await createPostwarNarrowTradeGoodsFixture();
    const frames: unknown[] = [];
    try {
      const reserve = await f.runtime.candidateFactory.prepare({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        observedAtReal: f.c.at,
      });
      await f.repository.commit(
        prepareAtomicTransitionCandidate({
          command: f.c.command,
          commitAuthorization: f.c.proof,
          draft: reserve,
          sha256Hex: sha,
        }),
      );
      frames.push({
        command: f.c.command,
        transition: reserve.transition,
        events: reserve.transition.events,
        receipt: reserve.receipt,
        financialPostingBatches: reserve.financialPostingBatches,
        inventoryPostings: reserve.inventoryPostings,
      });
      await metadata(f.db, f.seed, f.admissionRef, false);
      expect(
        await group(f.db, 'goods', f.world, f.c.command, reserve),
      ).toBeDefined();
      const altered = json(reserve);
      const postings = altered.inventoryPostings as {
        entries: { delta: { amount: string } }[];
      }[];
      postings[0]!.entries[0]!.delta.amount = '-0.5';
      await expect(
        group(
          f.db,
          'goods',
          f.world,
          f.c.command,
          altered as unknown as typeof reserve,
        ),
      ).rejects.toThrow('MIXED_GOODS_EXACT_CORE_INVENTORY_MOVEMENT_REQUIRED');
      const auto = createPostwarNarrowTradeAutomaticRuntime({
        worldId: f.world,
        workerId: f.holder,
        database: f.database,
        source: f.source,
      });
      for (const [kind, version] of [
        ['SHIP', '1'],
        ['DELIVER', '2'],
      ] as const) {
        const command = C.parseCanonicalCommand(
          {
            schemaVersion: C.COMMAND_SCHEMA_VERSION,
            worldId: f.world,
            countryId: f.seller,
            officeId: null,
            actorId: f.c.command.actorId,
            authSubject: f.c.command.authSubject,
            commandId: 'COMMAND_TEST_CURRENT_' + kind,
            commandType:
              kind === 'SHIP'
                ? 'CORE_GOODS_SHIPMENT_V1'
                : 'CORE_GOODS_DELIVERY_V1',
            expectedWorldVersion: version,
            idempotencyKey: 'KEY_TEST_CURRENT_' + kind,
            correlationId: 'CORRELATION_TEST_CURRENT_' + kind,
            submittedAtReal: f.c.at,
            simTime: '0',
            payload: {
              schemaVersion:
                kind === 'SHIP'
                  ? 'core-goods-shipment-v1'
                  : 'core-goods-delivery-v1',
              shipmentId: 'SHIPMENT_TEST_CURRENT',
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
        await f.reset();
        await f.db.query(
          'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,country_id,office_id,actor_id,auth_subject,expected_world_version,sim_time,canonical_payload,payload_sha256,command_fingerprint,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
          [
            command.worldId,
            command.commandId,
            command.idempotencyKey,
            command.commandType,
            command.schemaVersion,
            command.countryId,
            command.officeId,
            command.actorId,
            command.authSubject,
            command.expectedWorldVersion,
            command.simTime.toCanonicalValue(),
            command.canonicalPayload,
            command.payloadHash,
            command.fingerprint,
            command.correlationId,
            command.submittedAtReal,
          ],
        );
        await f.db.query(
          "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'VERSIONED_AUTOMATIC',0)",
          [f.world, command.commandId],
        );
        await f.db.query(
          "update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=$4::timestamptz,claim_fencing_token=1,attempt_count=1 where world_id=$1 and command_id=$2",
          [f.world, command.commandId, f.holder, f.c.at],
        );
        await f.db.exec('set session authorization ' + f.readerRole);
        const draft = await (
          kind === 'SHIP'
            ? auto.shipmentCandidateFactory
            : auto.deliveryCandidateFactory
        ).prepare({
          command,
          commitAuthorization: null,
          observedAtReal: f.c.at,
        });
        await f.repository.commit(
          prepareAtomicTransitionCandidate({
            command,
            commitAuthorization: null,
            draft,
            sha256Hex: sha,
          }),
        );
        await f.reset();
        await f.db.query(
          "select set_config('econmind.postwar_projection_world',$1,false)",
          [f.world],
        );
        if (kind === 'DELIVER')
          await f.db.query(
            'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3)',
            [
              f.world,
              f.buyer,
              C.canonicalSerialize({
                funding: [
                  { payerRole: 'GOV', payerEntityId: 'ENTITY_TEST_ONLY_GOV_2' },
                ],
              }),
            ],
          );
        expect(
          await group(f.db, 'goods', f.world, command, draft),
        ).toBeDefined();
        frames.push({
          command,
          transition: draft.transition,
          events: draft.transition.events,
          receipt: draft.receipt,
          financialPostingBatches: draft.financialPostingBatches,
          inventoryPostings: draft.inventoryPostings,
        });
        if (kind === 'DELIVER') {
          const bad = json(draft);
          const bs = bad.financialPostingBatches as {
            legs: { amount: { amount: string } }[];
          }[];
          bs[0]!.legs[0]!.amount.amount = '0.5';
          await expect(
            group(
              f.db,
              'goods',
              f.world,
              command,
              bad as unknown as typeof draft,
            ),
          ).rejects.toThrow('MIXED_GOODS_EXACT_CORE_PAYMENT_REQUIRED');
        }
      }
      await f.db.exec(
        await read('proposals/postwar-mixed-current-projection-read.sql'),
      );
      await f.db.exec(
        `grant select on world_v2.authoritative_event,world_v2.world_head to world_v2_postwar_projection_owner;create policy test_only_extended_events on world_v2.authoritative_event for select to world_v2_postwar_projection_owner using(world_id='${f.world}')`,
      );
      const prefix = await f.db.query<{
        prefix_fingerprint: string;
        financial_batch_count: string;
        financial_posting_count: string;
      }>('select * from world_v2.postwar_mixed_current_prefix($1)', [f.world]);
      expect(prefix.rows[0]!.prefix_fingerprint).toBe(
        C.canonicalSha256(
          C.canonicalHashInput({
            worldId: f.world,
            seedFingerprint: f.seed.fingerprint,
            headWorldVersion: '3',
            headEventSequence: '3',
            frames,
          }),
          sha,
        ),
      );
      expect(prefix.rows[0]!.financial_batch_count).toBe('1');
      expect(prefix.rows[0]!.financial_posting_count).toBe('2');
      expect(
        (
          await f.db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,'world_v2.postwar_mixed_goods_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE')as allowed",
            [f.readerRole],
          )
        ).rows[0]!.allowed,
      ).toBe(false);
      await f.db.exec(
        'drop function world_v2.postwar_mixed_goods_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      );
      await expect(
        f.db.query('select * from world_v2.postwar_mixed_current_prefix($1)', [
          f.world,
        ]),
      ).rejects.toThrow('MIXED_GOODS_EFFECTS_EXTENSION_REQUIRED');
    } finally {
      await f.close();
    }
  });
  it('recomputes independently adopted OMO holdings and actual four-leg snapshots, refusing fake rights/postings', async () => {
    const f = await createCentralBankOmoAtomicFixture();
    try {
      const { draft } = await f.prepareDraft();
      expect(
        (await f.execution.executeQueuedCommand(f.input)).receipt.outcome,
      ).toBe('COMMITTED');
      await metadata(f.db, f.seed, 'ADMISSION_' + '1'.repeat(64), true);
      const result = await group(f.db, 'omo', f.seed.worldId, f.command, draft);
      expect(result.rows[0]!.value).toEqual(
        JSON.parse(draft.transition.events[0]!.canonicalPayload).rights.after,
      );
      const main = await read(
        'proposals/postwar-mixed-current-projection-read.sql',
      );
      await f.db.exec(
        main.slice(
          main.indexOf('create function world_v2.postwar_mixed_fx_group('),
          main.indexOf(
            'create function world_v2.postwar_write_mixed_current_document(',
          ),
        ),
      );
      await f.db.exec(
        `grant select on world_v2.authoritative_event,world_v2.world_head to world_v2_postwar_projection_owner;create policy test_only_extended_events on world_v2.authoritative_event for select to world_v2_postwar_projection_owner using(world_id='${f.seed.worldId}')`,
      );
      await f.db.query(
        'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3)',
        [f.seed.worldId, f.command.countryId, '{}'],
      );
      const prefix = await f.db.query<{
        prefix_fingerprint: string;
        financial_batch_count: string;
        financial_posting_count: string;
      }>('select * from world_v2.postwar_mixed_current_prefix($1)', [
        f.seed.worldId,
      ]);
      const frame = {
        command: f.command,
        transition: draft.transition,
        events: draft.transition.events,
        receipt: draft.receipt,
        financialPostingBatches: draft.financialPostingBatches,
        inventoryPostings: draft.inventoryPostings,
      };
      expect(prefix.rows[0]!.prefix_fingerprint).toBe(
        C.canonicalSha256(
          C.canonicalHashInput({
            worldId: f.seed.worldId,
            seedFingerprint: f.seed.fingerprint,
            headWorldVersion: '1',
            headEventSequence: '1',
            frames: [frame],
          }),
          sha,
        ),
      );
      expect(prefix.rows[0]!.financial_batch_count).toBe('1');
      expect(prefix.rows[0]!.financial_posting_count).toBe('4');
      expect(
        (
          await f.db.query<{ allowed: boolean }>(
            "select has_function_privilege('cb_omo_atomic_test_worker','world_v2.postwar_mixed_omo_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE')as allowed",
          )
        ).rows[0]!.allowed,
      ).toBe(false);
      const rights = json(draft);
      const rightsEvent = (
        rights.transition as { events: { canonicalPayload: string }[] }
      ).events[0]!;
      const rightsPayload = JSON.parse(rightsEvent.canonicalPayload);
      rightsPayload.rights.after[0].carryingValue = '999';
      rightsEvent.canonicalPayload = C.canonicalSerialize(rightsPayload);
      await expect(
        group(
          f.db,
          'omo',
          f.seed.worldId,
          f.command,
          rights as unknown as typeof draft,
        ),
      ).rejects.toThrow('MIXED_OMO_EXACT_RIGHTS_TRANSFER_REQUIRED');
      const bad = json(draft);
      const batches = bad.financialPostingBatches as {
        legs: { amount: { amount: string } }[];
      }[];
      batches[0]!.legs[0]!.amount.amount = '0.5';
      await expect(
        group(
          f.db,
          'omo',
          f.seed.worldId,
          f.command,
          bad as unknown as typeof draft,
        ),
      ).rejects.toThrow('MIXED_OMO_EXACT_CORE_FOUR_LEG_BATCH_REQUIRED');
    } finally {
      await f.db.close();
    }
  });
});
