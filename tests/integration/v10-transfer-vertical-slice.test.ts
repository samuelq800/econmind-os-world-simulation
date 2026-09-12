import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  OFFICE_APPROVAL_CAPABILITY,
  acquireWorldWriterLease,
  authorizeOfficeCapability,
  canonicalHashInput,
  canonicalSha256,
  createApprovalProposal,
  createAuthoritativeTransition,
  createDeliveryPosting,
  createFinalCommandReceipt,
  createFinancialPostingBatch,
  createOutboxMessage,
  createShipmentPosting,
  createWorldWriterCommitAssertion,
  eventId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  signApprovalProposal,
  workerId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import {
  createWorldReadRequest,
  parseSupabaseAuthSubject,
  readEntitledWorldProjection,
} from '../../apps/world-api/src/index.js';
import {
  V10_VERTICAL_SLICE_STATUS,
  prepareV10TransferVerticalSlice,
} from '../../apps/world-worker/src/index.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';
import {
  decisionScope,
  sha256,
  transferInput,
} from '../preparation/v10-transfer-contract.js';

const at = '2026-09-12T00:00:02.000Z';
const digest = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

async function reservationInput() {
  const fixture = createV10TwoCountryTestFixture();
  const approvals = [];
  for (const [side, keys] of [
    ['seller', ['sellerTrade']],
    ['buyer', ['buyerTrade', 'buyerFinance']],
  ] as const) {
    const original = fixture.proposals[side];
    let proposal = createApprovalProposal({
      id: original.id,
      version: original.version,
      worldId: original.worldId,
      countryId: original.countryId,
      payloadFingerprint: fixture.command.fingerprint,
      resolution: {
        policyVersion: original.policyVersion,
        requiredOffices: original.requiredOffices,
      },
    });
    const contexts = [];
    for (const key of keys) {
      const actor = fixture.officeActors[key];
      const context = await authorizeOfficeCapability({
        principal: actor.principal,
        resolver: actor.resolver,
        worldId: fixture.worldId,
        requestedCountryId: actor.membership.countryId,
        requestedOfficeId: actor.officeId,
        capability: OFFICE_APPROVAL_CAPABILITY,
        decisionScope: decisionScope(proposal),
      });
      contexts.push(context);
      proposal = await signApprovalProposal({
        proposal,
        context,
        actorId: actor.actorId,
        expectedVersion: proposal.version,
        signedAt: '2026-09-12T00:00:01.000Z',
      });
    }
    approvals.push({ proposal, contexts });
  }
  const seller = fixture.officeActors.sellerTrade;
  const commandContext = await authorizeOfficeCapability({
    principal: seller.principal,
    resolver: seller.resolver,
    worldId: fixture.worldId,
    requestedCountryId: seller.membership.countryId,
    requestedOfficeId: seller.officeId,
    capability: 'TRADE_CONTRACTS',
  });
  return {
    fixture,
    input: {
      command: fixture.command,
      seed: fixture.openingSeed,
      lineage: [],
      source: fixture.inventoryAccounts.sellerAvailable,
      commandContext,
      policy: {
        policyVersion: fixture.proposals.seller.policyVersion,
        approvalRecord: 'TEST_ONLY_POLICY_APPROVAL_NOT_ADR09',
        requiredSignatures: fixture.transferIntent.terms.requiredSignatures,
      },
      approvals,
      recordedAtReal: at,
      sha256Hex: sha256,
    },
  };
}

function phaseCommand(phase: 'SHIP' | 'DELIVER', worldVersion: string) {
  return parseCanonicalCommand(
    {
      ...transferInput({ phase }),
      commandType: `CORE_GOODS_${phase}_V1`,
      commandId: `COMMAND_${phase}_VERTICAL_TEST`,
      idempotencyKey: `IDEMPOTENCY_${phase}_VERTICAL_TEST`,
      expectedWorldVersion: worldVersion,
      simTime: phase === 'SHIP' ? '10001' : '10002',
      correlationId: `CORRELATION_${phase}_VERTICAL_TEST`,
    },
    sha256,
  );
}

function phaseDraft(input: {
  readonly phase: 'SHIP' | 'DELIVER';
  readonly command: ReturnType<typeof phaseCommand>;
  readonly worldVersionBefore: string;
  readonly source: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['inventoryAccounts']['sellerInTransit'];
  readonly destination: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['inventoryAccounts']['sellerInTransit'];
  readonly fixture: ReturnType<typeof createV10TwoCountryTestFixture>;
}) {
  const after = (BigInt(input.worldVersionBefore) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: eventId(`EVENT_${input.phase}_VERTICAL_TEST`),
      eventType: `GOODS_${input.phase}_V1`,
      worldId: input.command.worldId,
      worldVersion: after,
      sequence: after,
      causationCommandId: input.command.commandId,
      correlationId: input.command.correlationId,
      simTime: input.command.simTime.toCanonicalValue(),
      recordedAtReal: at,
      payload: { phase: input.phase },
      correctsEventId: null,
    },
    sha256,
  );
  const transition = createAuthoritativeTransition({
    command: input.command,
    worldVersionBefore: input.worldVersionBefore,
    worldVersionAfter: after,
    events: [event],
  });
  const inventoryPosting =
    input.phase === 'SHIP'
      ? createShipmentPosting(
          {
            schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
            postingId: inventoryPostingId('POSTING_SHIP_VERTICAL_TEST'),
            worldId: input.command.worldId,
            causationCommandId: input.command.commandId,
            causationEventIds: transition.eventIds,
            worldVersionBefore: input.worldVersionBefore,
            worldVersionAfter: after,
            simTime: input.command.simTime,
            command: input.command,
            transition,
            quantity: input.fixture.transferIntent.quantity,
            source: input.source,
            destination: input.destination,
          },
          sha256,
        )
      : createDeliveryPosting(
          {
            schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
            postingId: inventoryPostingId('POSTING_DELIVER_VERTICAL_TEST'),
            worldId: input.command.worldId,
            causationCommandId: input.command.commandId,
            causationEventIds: transition.eventIds,
            worldVersionBefore: input.worldVersionBefore,
            worldVersionAfter: after,
            simTime: input.command.simTime,
            command: input.command,
            transition,
            quantity: input.fixture.transferIntent.quantity,
            source: input.source,
            destination: input.destination,
          },
          sha256,
        );
  const financialPostingBatches =
    input.phase === 'SHIP'
      ? []
      : [
          createFinancialPostingBatch(
            {
              schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
              batchId: financialPostingBatchId('BATCH_DELIVER_VERTICAL_TEST'),
              worldId: input.command.worldId,
              causationCommandId: input.command.commandId,
              causationEventIds: transition.eventIds,
              worldVersionBefore: input.worldVersionBefore,
              worldVersionAfter: after,
              simTime: input.command.simTime,
              settlementCurrency: 'GCU',
              command: input.command,
              transition,
              legs: input.fixture.paymentPlan.map((leg, index) => ({
                ...leg,
                legId: financialPostingLegId(`LEG_DELIVER_VERTICAL_${index}`),
              })),
            },
            sha256,
          ),
        ];
  const receipt = createFinalCommandReceipt({
    command: input.command,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: input.command.simTime,
    recordedAtReal: at,
  });
  const payload = { phase: input.phase, commandId: input.command.commandId };
  const outbox = createOutboxMessage({
    messageId: `OUTBOX_${input.phase}_VERTICAL_TEST`,
    worldId: input.command.worldId,
    commandId: input.command.commandId,
    eventId: transition.eventIds[0]!,
    payload,
    payloadHash: canonicalSha256(canonicalHashInput(payload), sha256),
    availableAtSimTime: input.command.simTime,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      input.command.worldId,
      workerId('WORKER_V10_VERTICAL_TEST'),
      at,
      '2026-09-12T00:03:00.000Z',
    ),
  );
  return {
    transition,
    draft: {
      transition,
      inventoryPostings: [inventoryPosting],
      financialPostingBatches,
      receipt,
      outboxMessages: [outbox],
      currentMaterializations: [],
      authorityKind: 'VERSIONED_AUTOMATIC' as const,
      commitAssertion: createWorldWriterCommitAssertion(
        lease.lease,
        input.worldVersionBefore,
      ),
      observedAtReal: at,
    },
  };
}

describe('V10 candidate-only vertical slice', () => {
  it('binds current approvals, reservation, shipping, delivery/payment, receipts, and an entitled read without committing', async () => {
    const { fixture, input: reserve } = await reservationInput();
    const shipCommand = phaseCommand('SHIP', '1');
    const deliveryCommand = phaseCommand('DELIVER', '2');
    const reservationId = `RESERVATION_${fixture.command.fingerprint
      .slice('sha256:'.length)
      .toUpperCase()}`;
    const shipSource = {
      ...fixture.inventoryAccounts.sellerReserved,
      reservationId,
    };
    const ship = phaseDraft({
      phase: 'SHIP',
      command: shipCommand,
      worldVersionBefore: '1',
      source: shipSource,
      destination: fixture.inventoryAccounts.sellerInTransit,
      fixture,
    });
    const delivery = phaseDraft({
      phase: 'DELIVER',
      command: deliveryCommand,
      worldVersionBefore: '2',
      source: fixture.inventoryAccounts.sellerInTransit,
      destination: fixture.inventoryAccounts.buyerAvailable,
      fixture,
    });

    const result = await prepareV10TransferVerticalSlice({
      reservation: reserve,
      shipment: {
        command: shipCommand,
        commitAuthorization: null,
        reference: {
          worldId: fixture.worldId,
          commandId: shipCommand.commandId,
          commandFingerprint: shipCommand.fingerprint,
          expectedWorldVersion: '1',
          sellerCountryId: fixture.countries.seller,
          quantity: fixture.transferIntent.quantity,
          sourceInventoryAccount: shipSource,
          destinationInventoryAccount:
            fixture.inventoryAccounts.sellerInTransit,
        },
        draft: ship.draft,
        sha256Hex: sha256,
      },
      delivery: {
        command: deliveryCommand,
        commitAuthorization: null,
        reference: {
          worldId: fixture.worldId,
          commandId: deliveryCommand.commandId,
          commandFingerprint: deliveryCommand.fingerprint,
          expectedWorldVersion: '2',
          sellerCountryId: fixture.countries.seller,
          buyerCountryId: fixture.countries.buyer,
          sellerEntityId: fixture.entities.sellerTreasury,
          buyerEntityId: fixture.entities.buyerTreasury,
          quantity: fixture.transferIntent.quantity,
          price: fixture.transferIntent.price,
          sourceInventoryAccount: fixture.inventoryAccounts.sellerInTransit,
          destinationInventoryAccount: fixture.inventoryAccounts.buyerAvailable,
          buyerTreasuryAccount: fixture.financialAccounts.buyerTreasury,
          sellerSettlementAccount: fixture.financialAccounts.sellerSettlement,
        },
        draft: delivery.draft,
        sha256Hex: sha256,
      },
    });

    expect(result.status).toBe(V10_VERTICAL_SLICE_STATUS);
    expect(result.reservation.status).toBe('CANDIDATE_NOT_COMMITTED');
    expect(result.shipment.transition.worldVersionAfter).toBe('2');
    expect(result.delivery.transition.worldVersionAfter).toBe('3');
    expect(result.delivery.financialPostingBatches).toHaveLength(1);
    expect(result.receipts.map((receipt) => receipt.commandId)).toEqual([
      shipCommand.commandId,
      deliveryCommand.commandId,
    ]);

    const projection = await readEntitledWorldProjection({
      authSubject: parseSupabaseAuthSubject(
        '11111111-1111-4111-8111-111111111111',
      ),
      request: createWorldReadRequest({
        requestId: '123e4567-e89b-42d3-a456-426614174099',
        worldId: fixture.worldId,
        classification: 'COUNTRY',
        scopeKey: fixture.countries.seller,
      }),
      executor: {
        query: async () => ({
          rows: [
            {
              world_id: fixture.worldId,
              classification: 'COUNTRY',
              scope_key: fixture.countries.seller,
              schema_version: 'world-projection-read-v1',
              world_version: '3',
              event_sequence: '3',
              payload: {
                deliveryReceipt: result.delivery.receipt.commandId,
                status: result.status,
              },
              generated_at: at,
            },
          ],
        }),
      },
    });
    expect(projection?.payload).toEqual({
      deliveryReceipt: deliveryCommand.commandId,
      status: V10_VERTICAL_SLICE_STATUS,
    });
  });

  it('fails closed when a phase skips a candidate WorldVersion', async () => {
    const { fixture, input: reserve } = await reservationInput();
    const shipCommand = phaseCommand('SHIP', '2');
    const ship = phaseDraft({
      phase: 'SHIP',
      command: shipCommand,
      worldVersionBefore: '2',
      source: fixture.inventoryAccounts.sellerReserved,
      destination: fixture.inventoryAccounts.sellerInTransit,
      fixture,
    });
    await expect(
      prepareV10TransferVerticalSlice({
        reservation: reserve,
        shipment: {
          command: shipCommand,
          commitAuthorization: null,
          reference: {
            worldId: fixture.worldId,
            commandId: shipCommand.commandId,
            commandFingerprint: shipCommand.fingerprint,
            expectedWorldVersion: '2',
            sellerCountryId: fixture.countries.seller,
            quantity: fixture.transferIntent.quantity,
            sourceInventoryAccount: fixture.inventoryAccounts.sellerReserved,
            destinationInventoryAccount:
              fixture.inventoryAccounts.sellerInTransit,
          },
          draft: ship.draft,
          sha256Hex: sha256,
        },
        delivery: {} as never,
      }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
  });
});
