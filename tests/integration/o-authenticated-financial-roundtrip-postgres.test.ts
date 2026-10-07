import { describe, expect, it } from 'vitest';
import { parseCanonicalCommand, type CanonicalCommand } from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { cIsolatedHash } from '../support/c-isolated-financial-fixture.js';
import { createOAuthenticatedFinancialRoundtripFixture } from '../support/o-authenticated-financial-roundtrip-fixture.js';
import type { WorldReadResponseEnvelope } from '../../apps/world-api/src/integration/contracts.js';
import type { WorldFinalReceiptReadResponseEnvelope } from '../../apps/world-api/src/integration/authenticated-final-receipt-query-handler.js';

// Explicit native opt-in. NOT_RUN when disabled. No caller DSN or PGlite/mock
// positive path, no production Clock/listener or acceptance status advancement.
describe.skipIf(process.env.O_NATIVE_AUTHENTICATED_ROUNDTRIP !== '1')(
  'O TEST_ONLY JWT -> persisted seat/admission -> G intake -> C economic lineage -> authorized read',
  () => {
    it('executes one once-queued exact Command through fenced Reserve/Ship/Deliver and reads real FINAL and exact posting projection', async () => {
      const f = await createOAuthenticatedFinancialRoundtripFixture();
      const state = (result: Awaited<ReturnType<typeof f.call>>) =>
        result.body.state!;
      async function footprint() {
        return (
          await f.admin.query(
            `select world_version::text,event_sequence::text,
          (select count(*)::text from world_v2.command_submission where world_id=$1) as commands,
          (select count(*)::text from world_v2.command_queue where world_id=$1) as queued,
          (select count(*)::text from world_v2.authoritative_event where world_id=$1) as events,
          (select count(*)::text from world_v2.inventory_posting where world_id=$1) as inventory,
          (select count(*)::text from world_v2.financial_posting_batch where world_id=$1) as financial,
          (select count(*)::text from world_v2.command_receipt where world_id=$1) as receipts
          from world_v2.world_head where world_id=$1`,
            [f.c.world],
          )
        ).rows[0];
      }
      // Only automatic scheduling uses C's TEST_ONLY producer port. This helper
      // consumes the actual G-created immutable canonical Command, never C's
      // unused fixture transfer/fingerprint or a golden economic event.
      function automatic(
        transfer: CanonicalCommand,
        kind: 'SHIP' | 'DELIVERY',
      ) {
        const shipmentId = 'SHIPMENT_O_JWT_TRANSFER';
        const destination = f.c.original.inventoryAccounts.buyerAvailable;
        return parseCanonicalCommand(
          {
            schemaVersion: transfer.schemaVersion,
            commandId: `COMMAND_O_${kind}`,
            idempotencyKey: `KEY_O_${kind}`,
            worldId: transfer.worldId,
            commandType:
              kind === 'SHIP'
                ? 'CORE_GOODS_SHIPMENT_V1'
                : 'CORE_GOODS_DELIVERY_V1',
            actorId: transfer.actorId,
            authSubject: transfer.authSubject,
            countryId: transfer.countryId,
            officeId: null,
            expectedWorldVersion: kind === 'SHIP' ? '1' : '2',
            simTime: kind === 'SHIP' ? '10100' : '10200',
            submittedAtReal: transfer.submittedAtReal,
            correlationId: transfer.correlationId,
            payload:
              kind === 'SHIP'
                ? {
                    schemaVersion: 'core-goods-shipment-v1',
                    shipmentId,
                    transferCommandId: transfer.commandId,
                    transferFingerprint: transfer.fingerprint,
                  }
                : {
                    schemaVersion: 'core-goods-delivery-v1',
                    shipmentId,
                    transferCommandId: transfer.commandId,
                    transferFingerprint: transfer.fingerprint,
                    destination: {
                      physicalLocationId: destination.physicalLocationId,
                      titleHolderId: destination.titleHolderId,
                      riskBearerId: destination.riskBearerId,
                      economicRecognitionId: destination.economicRecognitionId,
                    },
                    buyerTreasuryAccountId:
                      f.c.original.financialAccounts.buyerTreasury.accountId,
                    sellerSettlementAccountId:
                      f.c.original.financialAccounts.sellerSettlement.accountId,
                  },
          },
          cIsolatedHash,
        );
      }
      try {
        expect(
          (
            await f.admin.query(
              'select current_database() as database,host(inet_server_addr()) as host,current_user as role',
            )
          ).rows[0],
        ).toEqual({
          database: 'econmind_v09_o_authenticated_roundtrip',
          host: '127.0.0.1',
          role: 'postgres',
        });
        expect(
          (
            await f.admin.query(
              'select count(distinct auth_subject)::text as subjects,count(*)::text as offices from world_v2.current_commit_authorization where world_id=$1',
              [f.c.world],
            )
          ).rows[0],
        ).toEqual({ subjects: '2', offices: '3' });
        expect(f.c.openingReadback.readback.worldVersion).toBe('0');
        expect(await footprint()).toMatchObject({
          world_version: '0',
          commands: '0',
          queued: '0',
          events: '0',
          inventory: '0',
          financial: '0',
          receipts: '0',
        });
        // Real JWT for the buyer does not grant the seller-selected Office.
        expect(
          (
            await f.call(
              f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
              'buyerTrade',
            )
          ).body.ok,
        ).toBe(false);
        const registration = await f.call(
          f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
        );
        expect(registration.body.ok).toBe(true);
        expect(state(registration).status).toBe('PENDING_APPROVAL_OR_ENQUEUE');
        expect(registration.body.authority?.seed).toEqual({
          worldId: f.c.world,
          seedRef: f.c.seed.seedId,
          contentHash: f.c.seed.fingerprint,
          admissionRef: 'ADMISSION_O_TEST_ONLY',
        });
        expect(
          (
            await f.call(
              f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
            )
          ).body.state?.status,
        ).toBe('PENDING_APPROVAL_OR_ENQUEUE');
        const inspected = await f.call(f.staged('INSPECT'));
        expect(inspected.body.ok).toBe(true);
        const fingerprint = state(inspected).commandFingerprint as string;
        expect(await footprint()).toMatchObject({
          commands: '1',
          queued: '0',
          events: '0',
          receipts: '0',
        });
        expect(
          (
            await f.call(
              f.staged('ENQUEUE', 'sellerTrade', {
                commandFingerprint: fingerprint,
                approvalRef: 'APPROVAL_O_MISSING',
              }),
            )
          ).body.ok,
        ).toBe(false);
        for (const [action, seat] of [
          ['SIGN_SELLER', 'sellerTrade'],
          ['SIGN_BUYER_TRADE', 'buyerTrade'],
          ['SIGN_BUYER_FINANCE', 'buyerFinance'],
        ] as const) {
          const signed = await f.call(
            f.staged(action, seat, { commandFingerprint: fingerprint }),
            seat,
          );
          expect(signed.body.ok).toBe(true);
          expect(state(signed).status).toBe('SIGNATURE_RECORDED');
        }
        expect(
          (
            await f.admin.query(
              'select country_id,office_id from world_v2.narrow_transfer_approval_signature where world_id=$1 order by country_id,office_id',
              [f.c.world],
            )
          ).rows,
        ).toEqual([
          { country_id: f.c.original.countries.buyer, office_id: 'FINANCE' },
          { country_id: f.c.original.countries.buyer, office_id: 'TRADE' },
          { country_id: f.c.original.countries.seller, office_id: 'TRADE' },
        ]);
        const reference = await f.call(
          f.staged('BIND_REFERENCE', 'buyerFinance', {
            commandFingerprint: fingerprint,
          }),
          'buyerFinance',
        );
        expect(reference.body.ok).toBe(true);
        const enqueue = f.staged('ENQUEUE', 'sellerTrade', {
          commandFingerprint: fingerprint,
          approvalRef: state(reference).approvalRef,
        });
        expect(state(await f.call(enqueue)).status).toBe('QUEUED');
        expect(state(await f.call(enqueue)).status).toBe('QUEUED');
        expect(
          (
            await f.admin.query(
              'select command_id,authority_kind,queue_state from world_v2.command_queue where world_id=$1',
              [f.c.world],
            )
          ).rows,
        ).toEqual([
          {
            command_id: f.commandId,
            authority_kind: 'DISCRETIONARY_USER',
            queue_state: 'PENDING',
          },
        ]);
        expect(await footprint()).toMatchObject({
          world_version: '0',
          queued: '1',
          events: '0',
          financial: '0',
          receipts: '0',
        });
        const transfer = await f.database.transaction((tx) =>
          new DurableV08LedgerLineageReader({
            database: f.database,
            sha256Hex: cIsolatedHash,
          }).readCommandFrom(tx, f.c.world, f.commandId),
        );
        expect(transfer.fingerprint).toBe(fingerprint);
        expect(transfer.authSubject).toBe(
          f.c.original.officeActors.sellerTrade.principal.authSubject,
        );
        expect(transfer.actorId).toBe(
          f.c.original.officeActors.sellerTrade.actorId,
        );
        await f.c.host.startIsolation();
        const reserve = await f.c.host.consumeOnce();
        expect(reserve.step).toMatchObject({
          status: 'PROCESSED',
          commandId: f.commandId,
          source: 'NEW_FINAL',
          receipt: {
            outcome: 'COMMITTED',
            worldVersionBefore: '0',
            worldVersionAfter: '1',
            commandFingerprint: fingerprint,
          },
        });
        const shipment = automatic(transfer, 'SHIP');
        await f.c.schedule(shipment);
        f.c.setTime('10100');
        expect((await f.c.host.consumeOnce()).step).toMatchObject({
          status: 'PROCESSED',
          commandId: shipment.commandId,
          receipt: { outcome: 'COMMITTED', worldVersionAfter: '2' },
        });
        const delivery = automatic(transfer, 'DELIVERY');
        await f.c.schedule(delivery);
        f.c.setTime('10200');
        const delivered = await f.c.host.consumeOnce();
        expect(delivered.step).toMatchObject({
          status: 'PROCESSED',
          commandId: delivery.commandId,
          receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
        });
        const positions = delivered.readback.ledgers.financial.positions;
        expect(
          positions
            .find(
              (p) =>
                p.account.accountId ===
                f.c.original.financialAccounts.buyerTreasury.accountId,
            )
            ?.netDebitBalance.toCanonicalValue(),
        ).toEqual({ amount: '2', currency: 'GCU' });
        expect(
          positions
            .find(
              (p) =>
                p.account.accountId ===
                f.c.original.financialAccounts.sellerSettlement.accountId,
            )
            ?.netDebitBalance.toCanonicalValue(),
        ).toEqual({ amount: '8', currency: 'GCU' });
        expect(
          delivered.readback.ledgers.inventory.balances
            .find((b) => b.account.countryId === f.c.original.countries.buyer)
            ?.quantity.toCanonicalValue(),
        ).toEqual({ amount: '2', unit: 'tonne' });
        expect(await footprint()).toEqual({
          world_version: '3',
          event_sequence: '3',
          commands: '3',
          queued: '3',
          events: '3',
          inventory: '3',
          financial: '1',
          receipts: '3',
        });
        expect(await f.publish('3')).toMatchObject({
          worldVersion: '3',
          eventSequence: '3',
          countryProjections: 2,
          officePrivateProjections: 3,
        });
        // Existing projection publisher sums committed Posting facts only; it
        // omits the opening. Assert its exact wire changes (-6/+6), not fake
        // absolute balances (actual opening-aware ledger above is 2/8).
        for (const [seat, account, change, quantity] of [
          [
            'buyerFinance',
            f.c.original.financialAccounts.buyerTreasury.accountId,
            '-6',
            '2',
          ],
          [
            'sellerTrade',
            f.c.original.financialAccounts.sellerSettlement.accountId,
            '6',
            '-2',
          ],
        ] as const) {
          const read = await f.projection(seat);
          expect(read.ok).toBe(true);
          if (!read.ok) throw new Error('O_AUTHORIZED_PROJECTION_DENIED');
          expect(read.authority.identity.worldId).toBe(f.c.world);
          expect(read.authority.seed.contentHash).toBe(f.c.seed.fingerprint);
          expect(read.authority.readback.worldVersion).toBe('3');
          const result = read.result as WorldReadResponseEnvelope;
          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error('O_PROJECTION_QUERY_DENIED');
          expect(result.data.watermark).toMatchObject({
            worldVersion: '3',
            eventSequence: '3',
          });
          const payload = result.data.payload as {
            ledger: {
              financialPositions: Array<{
                accountId: string;
                netDebitBalance: string;
                currency: string;
              }>;
              inventoryPositions: Array<{
                bucket: string;
                quantity: string;
                unit: string;
              }>;
            };
          };
          expect(
            payload.ledger.financialPositions.find(
              (p) => p.accountId === account,
            ),
          ).toMatchObject({ netDebitBalance: change, currency: 'GCU' });
          expect(
            payload.ledger.inventoryPositions.find(
              (p) => p.bucket === 'AVAILABLE',
            ),
          ).toMatchObject({ quantity, unit: 'tonne' });
        }
        expect(
          (await f.projection('buyerFinance', f.scope('sellerTrade'))).ok,
        ).toBe(false);
        const final = await f.final();
        expect(final.ok).toBe(true);
        if (!final.ok) throw new Error('O_FINAL_BINDING_DENIED');
        const finalResult =
          final.result as WorldFinalReceiptReadResponseEnvelope;
        expect(finalResult.ok).toBe(true);
        if (!finalResult.ok) throw new Error('O_FINAL_QUERY_DENIED');
        expect(finalResult.receipt).toMatchObject({
          commandId: f.commandId,
          commandFingerprint: fingerprint,
          outcome: 'COMMITTED',
          worldVersionAfter: '1',
        });
        // Canonical staged READ/INSPECT accept identity only. Fingerprint is
        // required only by signature/reference/enqueue actions, not READ.
        const intakeRead = await f.call(f.staged('READ'));
        expect(intakeRead.body.error).toBeUndefined();
        expect(intakeRead).toMatchObject({
          body: { ok: true, state: { status: 'FINAL' } },
        });
        expect(
          state(
            await f.call(
              f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
            ),
          ).status,
        ).toBe('FINAL');
        expect((await f.c.host.consumeOnce()).step).toEqual({ status: 'IDLE' });
        expect(await footprint()).toMatchObject({
          world_version: '3',
          events: '3',
          receipts: '3',
          financial: '1',
        });
        await f.admin.query(
          'update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2',
          [
            f.c.world,
            f.c.original.officeActors.sellerTrade.principal.authSubject,
          ],
        );
        expect((await f.final()).ok).toBe(false);
        expect((await f.call(f.staged('READ'))).body.ok).toBe(false);
        expect([
          f.intake.simulationEnabled,
          f.readHost.simulationEnabled,
          f.readHost.workerActivationAllowed,
          f.readHost.clockActivationAllowed,
        ]).toEqual([false, false, false, false]);
      } finally {
        await f.c.host.stop();
        await f.close();
      }
    }, 30000);
  },
);
