/** Actual embedded PostgreSQL, genuine Core/source/three-sign/Atomic protocol.
 * All financial/ownership/route facts are isolated TEST_ONLY fixtures. */
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createPostwarNarrowTradeGoodsFixture } from '../support/postwar-narrow-trade-goods-fixture.js';
import { narrowCutoffSha as sha } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import { prepareNarrowTreasuryGcuDeliveryAtomicDraft } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  createPostwarNarrowTradeAutomaticRuntime,
  isPostwarNarrowTradeAutomaticRuntime,
} from '../../apps/world-worker/src/preparation/postwar-narrow-trade-shipment-delivery-candidates.js';
function lifecycle(
  f: Awaited<ReturnType<typeof createPostwarNarrowTradeGoodsFixture>>,
  kind: 'SHIP' | 'DELIVER',
  version: string,
  suffix = '',
) {
  const original = f.c.command;
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: f.world,
      countryId: f.seller,
      officeId: null,
      actorId: original.actorId,
      authSubject: original.authSubject,
      commandId: 'COMMAND_TEST_GOODS_' + kind + suffix,
      commandType:
        kind === 'SHIP' ? 'CORE_GOODS_SHIPMENT_V1' : 'CORE_GOODS_DELIVERY_V1',
      expectedWorldVersion: version,
      idempotencyKey: 'KEY_TEST_GOODS_' + kind + suffix,
      correlationId: 'CORRELATION_TEST_GOODS_' + kind,
      submittedAtReal: f.c.at,
      simTime: '0',
      payload: {
        schemaVersion:
          kind === 'SHIP' ? 'core-goods-shipment-v1' : 'core-goods-delivery-v1',
        shipmentId: 'SHIPMENT_TEST_GOODS',
        transferCommandId: original.commandId,
        transferFingerprint: original.fingerprint,
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
async function queue(
  f: Awaited<ReturnType<typeof createPostwarNarrowTradeGoodsFixture>>,
  c: C.CanonicalCommand,
  available = 0,
) {
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
    `insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'VERSIONED_AUTOMATIC',$3)`,
    [f.world, c.commandId, available],
  );
  await f.db.query(
    `update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=$4::timestamptz,claim_fencing_token=1,attempt_count=1 where world_id=$1 and command_id=$2`,
    [f.world, c.commandId, f.holder, f.c.at],
  );
  await f.db.exec('set session authorization ' + f.readerRole);
}
describe('fixed automatic Goods candidates and same-transaction source cutoff', () => {
  it('really commits Reserve→Ship→Deliver once under the same Atomic port, without reauthorizing a retired seller', async () => {
    const f = await createPostwarNarrowTradeGoodsFixture();
    try {
      const reserveDraft = await f.runtime.candidateFactory.prepare({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        observedAtReal: f.c.at,
      });
      const reserve = prepareAtomicTransitionCandidate({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        draft: reserveDraft,
        sha256Hex: sha,
      });
      expect((await f.repository.commit(reserve)).receipt.outcome).toBe(
        'COMMITTED',
      );
      const auto = createPostwarNarrowTradeAutomaticRuntime({
        worldId: f.world,
        workerId: f.holder,
        database: f.database,
        source: f.source,
      });
      expect(isPostwarNarrowTradeAutomaticRuntime(auto)).toBe(true);
      expect(isPostwarNarrowTradeAutomaticRuntime({ ...auto })).toBe(false);
      await f.reset();
      await f.db.query(
        'update world_v2.current_commit_authorization set active=false where world_id=$1',
        [f.world],
      );
      // Retirement is not cancellation of an already committed obligation.
      const shipment = lifecycle(f, 'SHIP', '1');
      await queue(f, shipment);
      const shipDraft = await auto.shipmentCandidateFactory.prepare({
        command: shipment,
        commitAuthorization: null,
        observedAtReal: f.c.at,
      });
      expect(shipDraft.currentMaterializations).toEqual([]);
      const ship = prepareAtomicTransitionCandidate({
        command: shipment,
        commitAuthorization: null,
        draft: shipDraft,
        sha256Hex: sha,
      });
      expect((await f.repository.commit(ship)).receipt.outcome).toBe(
        'COMMITTED',
      );
      expect((await f.repository.commit(ship)).source).toBe('EXISTING_COMMIT');
      const delivery = lifecycle(f, 'DELIVER', '2');
      await queue(f, delivery);
      const deliveryDraft = await auto.deliveryCandidateFactory.prepare({
        command: delivery,
        commitAuthorization: null,
        observedAtReal: f.c.at,
      });
      expect(deliveryDraft.inventoryPostings).toHaveLength(1);
      expect(deliveryDraft.financialPostingBatches).toHaveLength(1);
      expect(deliveryDraft.currentMaterializations).toEqual([]);
      const delivered = prepareAtomicTransitionCandidate({
        command: delivery,
        commitAuthorization: null,
        draft: deliveryDraft,
        sha256Hex: sha,
      });
      expect((await f.repository.commit(delivered)).receipt.outcome).toBe(
        'COMMITTED',
      );
      expect((await f.repository.readFinalReceipt(delivery))?.outcome).toBe(
        'COMMITTED',
      );
      expect((await f.repository.commit(delivered)).source).toBe(
        'EXISTING_COMMIT',
      );
      await f.reset();
      const result = await f.db.query(
        `select world_version::text,event_sequence::text,(select count(*)::text from world_v2.inventory_posting)inventory,(select count(*)::text from world_v2.financial_posting_batch)financial,(select count(*)::text from world_v2.command_receipt)receipts from world_v2.world_head`,
      );
      expect(result.rows[0]).toEqual({
        world_version: '3',
        event_sequence: '3',
        inventory: '3',
        financial: '1',
        receipts: '3',
      });
      const raw = await f.db.query<{ canonical_payload: string }>(
        'select canonical_payload from world_v2.financial_posting_batch',
      );
      const batch = JSON.parse(raw.rows[0]!.canonical_payload);
      expect(batch.legs).toHaveLength(2);
      expect(batch.legs[0].amount.amount).toBe('1');
    } finally {
      await f.close();
    }
  }, 30000);
  it('rejects a changed posting, not-due claim and admission revoked between preparation and actual Atomic commit without partial effects', async () => {
    const f = await createPostwarNarrowTradeGoodsFixture();
    try {
      const first = await f.runtime.candidateFactory.prepare({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        observedAtReal: f.c.at,
      });
      await f.repository.commit(
        prepareAtomicTransitionCandidate({
          command: f.c.command,
          commitAuthorization: f.c.proof,
          draft: first,
          sha256Hex: sha,
        }),
      );
      const auto = createPostwarNarrowTradeAutomaticRuntime({
          worldId: f.world,
          workerId: f.holder,
          database: f.database,
          source: f.source,
        }),
        shipment = lifecycle(f, 'SHIP', '1');
      await queue(f, shipment);
      const draft = await auto.shipmentCandidateFactory.prepare({
          command: shipment,
          commitAuthorization: null,
          observedAtReal: f.c.at,
        }),
        actual = draft.inventoryPostings[0]!;
      if (actual.schemaVersion !== 'inventory-posting-v1')
        throw Error('TEST_EXPECTS_NARROW_MOVEMENT');
      const changed = C.createShipmentPosting(
        {
          ...actual,
          command: shipment,
          transition: draft.transition,
          quantity: C.Quantity.from('0.5', 'tonne'),
          source: actual.entries.find((e) => e.delta.amount.isNegative())!
            .account,
          destination: actual.entries.find((e) => e.delta.amount.isPositive())!
            .account,
        },
        sha,
      );
      await expect(
        f.repository.commit(
          prepareAtomicTransitionCandidate({
            command: shipment,
            commitAuthorization: null,
            draft: { ...draft, inventoryPostings: [changed] },
            sha256Hex: sha,
          }),
        ),
      ).rejects.toThrow('inventory differs from actual source');
      await f.reset();
      const notDue = lifecycle(f, 'SHIP', '1', '_NOT_DUE');
      await queue(f, notDue, 1);
      await expect(
        auto.shipmentCandidateFactory.prepare({
          command: notDue,
          commitAuthorization: null,
          observedAtReal: f.c.at,
        }),
      ).rejects.toThrow('ACTIVE_UNFINISHED_CLAIM_REQUIRED');
      await f.reset();
      const permit = await f.db.query<{ authorization_id: string }>(
        'select authorization_id from world_v2.runtime_admission_publication_permit where world_id=$1',
        [f.world],
      );
      await f.db.exec('set role world_v2_admission_release');
      await f.db.query(
        "insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,'TEST_ONLY_REVOKED_AFTER_PREPARE')",
        [permit.rows[0]!.authorization_id],
      );
      await f.db.exec('reset role;set session authorization ' + f.readerRole);
      await expect(
        f.repository.commit(
          prepareAtomicTransitionCandidate({
            command: shipment,
            commitAuthorization: null,
            draft,
            sha256Hex: sha,
          }),
        ),
      ).rejects.toThrow('NARROW_CURRENT_ADMISSION_REVOKED');
      await f.reset();
      const counts = await f.db.query(
        `select world_version::text,(select count(*)::text from world_v2.authoritative_event)events,(select count(*)::text from world_v2.inventory_posting)inventory,(select count(*)::text from world_v2.financial_posting_batch)financial from world_v2.world_head`,
      );
      expect(counts.rows[0]).toEqual({
        world_version: '1',
        events: '1',
        inventory: '1',
        financial: '0',
      });
    } finally {
      await f.close();
    }
  }, 30000);
  it('never treats another actual domestic owner cash account as government authority, in both preparation and Atomic cutoff', async () => {
    const f = await createPostwarNarrowTradeGoodsFixture({
      extraBuyerBankCash: true,
    });
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
      const auto = createPostwarNarrowTradeAutomaticRuntime({
          worldId: f.world,
          workerId: f.holder,
          database: f.database,
          source: f.source,
        }),
        shipment = lifecycle(f, 'SHIP', '1');
      await queue(f, shipment);
      const ship = await auto.shipmentCandidateFactory.prepare({
        command: shipment,
        commitAuthorization: null,
        observedAtReal: f.c.at,
      });
      await f.repository.commit(
        prepareAtomicTransitionCandidate({
          command: shipment,
          commitAuthorization: null,
          draft: ship,
          sha256Hex: sha,
        }),
      );
      const valid = lifecycle(f, 'DELIVER', '2');
      await queue(f, valid);
      const prepared = await f.database.transaction((tx) =>
        f.source.inspectAutomaticFrom(tx, {
          command: valid,
          workerId: f.holder,
          observedAtReal: f.c.at,
        }),
      );
      const {
        canonicalPayload,
        payloadHash: oldHash,
        fingerprint: oldFingerprint,
        ...intent
      } = valid;
      void oldHash;
      void oldFingerprint;
      const payload = JSON.parse(canonicalPayload);
      const foreign = C.parseCanonicalCommand(
        {
          ...intent,
          commandId: 'COMMAND_TEST_FOREIGN_BANK_DELIVERY',
          idempotencyKey: 'KEY_TEST_FOREIGN_BANK_DELIVERY',
          simTime: valid.simTime.toCanonicalValue(),
          payload: {
            ...payload,
            buyerTreasuryAccountId: 'ACCOUNT_TEST_ONLY_BUYER_BANK_CASH',
            destination: {
              ...payload.destination,
              titleHolderId: 'ENTITY_TEST_ONLY_BANK_2',
              riskBearerId: 'ENTITY_TEST_ONLY_BANK_2',
            },
          },
        },
        sha,
      );
      await queue(f, foreign);
      await expect(
        auto.deliveryCandidateFactory.prepare({
          command: foreign,
          commitAuthorization: null,
          observedAtReal: f.c.at,
        }),
      ).rejects.toThrow('actual GOV treasury');
      // The existing generic Core arithmetic permits this genuine Cash→Cash
      // movement. It supplies no government mandate over the bank's property.
      const alternative = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
        deliveryCommand: foreign,
        transferCommand: f.c.command,
        inventoryState: prepared.inventory,
        financialState: prepared.financial,
        source: prepared.source,
        commitAssertion: prepared.commitAssertion,
        observedAtReal: f.c.at,
        eventId: C.eventId('EVENT_TEST_FOREIGN_BANK_DELIVERY'),
        eventSequence: '3',
        inventoryPostingId: C.inventoryPostingId(
          'POSTING_TEST_FOREIGN_BANK_DELIVERY',
        ),
        financialBatchId: C.financialPostingBatchId(
          'BATCH_TEST_FOREIGN_BANK_DELIVERY',
        ),
        buyerTreasuryLegId: C.financialPostingLegId(
          'LEG_TEST_FOREIGN_BANK_BUYER',
        ),
        sellerSettlementLegId: C.financialPostingLegId(
          'LEG_TEST_FOREIGN_BANK_SELLER',
        ),
        outboxMessageId: C.outboxMessageId('OUTBOX_TEST_FOREIGN_BANK_DELIVERY'),
        buyerTreasury: prepared.financial.accounts.find(
          (a) => a.accountId === 'ACCOUNT_TEST_ONLY_BUYER_BANK_CASH',
        )!,
        sellerSettlement: prepared.financial.accounts.find(
          (a) => a.accountId === 'ACCOUNT_TEST_ONLY_BANK_CASH',
        )!,
        sha256Hex: sha,
      });
      expect(
        alternative.financialState.positions
          .find(
            (p) => p.account.accountId === 'ACCOUNT_TEST_ONLY_BUYER_BANK_CASH',
          )
          ?.netDebitBalance.amount.toFixed() ?? '0',
      ).toBe('0');
      const candidate = prepareAtomicTransitionCandidate({
        command: foreign,
        commitAuthorization: null,
        draft: {
          ...alternative.draft,
          currentMaterializations: [],
          officeOperatingSourceReadBinding: {
            ...prepared.binding,
            commandFingerprint: foreign.fingerprint,
          },
        },
        sha256Hex: sha,
      });
      await expect(f.repository.commit(candidate)).rejects.toThrow(
        'actual GOV treasury',
      );
      await f.reset();
      const counts = await f.db.query(
        `select world_version::text,(select count(*)::text from world_v2.authoritative_event)events,(select count(*)::text from world_v2.inventory_posting)inventory,(select count(*)::text from world_v2.financial_posting_batch)financial from world_v2.world_head`,
      );
      expect(counts.rows[0]).toEqual({
        world_version: '2',
        events: '2',
        inventory: '2',
        financial: '0',
      });
    } finally {
      await f.close();
    }
  }, 30000);
});
