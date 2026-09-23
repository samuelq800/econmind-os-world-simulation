import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  EVENT_SCHEMA_VERSION,
  OFFICE_APPROVAL_CAPABILITY,
  SimTime,
  assertNarrowTransferApprovalsCurrent,
  authorizeOfficeCapability,
  createAuthoritativeTransition,
  createInventoryAccount,
  createNarrowTransferApprovalBundle,
  inventoryPostingId,
  inventoryReservationId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  proposalId,
  Quantity,
  reserveNarrowTreasuryGcuTransfer,
  signApprovalProposal,
  type ApprovalProposal,
  type CanonicalCommand,
} from '../../packages/core/src/index.js';
import { authorizeInventoryLedgerState } from '../../packages/core/src/opening/ledger-authority.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

const sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const SUBMITTED_AT = '2026-09-14T00:00:00.000Z';
const EXPIRES_AT = '2026-09-14T00:10:00.000Z';
const RESERVED_AT = '2026-09-14T00:01:00.000Z';

function command(
  input: { readonly quantity?: string; readonly currency?: string } = {},
) {
  const fixture = createV10TwoCountryTestFixture();
  const source = fixture.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: 'COMMAND_V10_2_RESERVE',
      idempotencyKey: 'IDEMPOTENCY_V10_2_RESERVE',
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: SUBMITTED_AT,
      correlationId: 'CORRELATION_V10_2_RESERVE',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: fixture.countries.seller,
        buyerCountryId: fixture.countries.buyer,
        quantity: { amount: input.quantity ?? '2', unit: source.unit },
        price: {
          amount: '3',
          currency: input.currency ?? 'GCU',
          perUnit: source.unit,
        },
        assetSource: {
          batchId: source.batchId,
          physicalLocationId: source.physicalLocationId,
          titleHolderId: source.titleHolderId,
          riskBearerId: source.riskBearerId,
          economicRecognitionId: source.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: EXPIRES_AT,
      },
    },
    sha256,
  );
}

function decisionScope(proposal: ApprovalProposal) {
  return {
    proposalId: proposal.id,
    proposalVersion: proposal.version,
    worldId: proposal.worldId,
    countryId: proposal.countryId,
    payloadFingerprint: proposal.payloadFingerprint,
    policyVersion: proposal.policyVersion,
    requiredOffices: proposal.requiredOffices,
  };
}

async function approvalContext(
  actor: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors'][keyof ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors']],
  proposal: ApprovalProposal,
) {
  return authorizeOfficeCapability({
    principal: actor.principal,
    resolver: actor.resolver,
    worldId: proposal.worldId,
    requestedCountryId: proposal.countryId,
    requestedOfficeId: actor.officeId,
    capability: OFFICE_APPROVAL_CAPABILITY,
    decisionScope: decisionScope(proposal),
  });
}

async function approvedScenario(transfer = command()) {
  const fixture = createV10TwoCountryTestFixture();
  let approvals = createNarrowTransferApprovalBundle({
    command: transfer,
    sellerProposalId: proposalId('PROPOSAL_V10_2_SELLER'),
    buyerProposalId: proposalId('PROPOSAL_V10_2_BUYER'),
    proposalVersion: 'VERSION_1',
  });
  const sellerContext = await approvalContext(
    fixture.officeActors.sellerTrade,
    approvals.seller,
  );
  const seller = await signApprovalProposal({
    proposal: approvals.seller,
    context: sellerContext,
    actorId: fixture.officeActors.sellerTrade.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  const buyerTradeContext = await approvalContext(
    fixture.officeActors.buyerTrade,
    approvals.buyer,
  );
  let buyer = await signApprovalProposal({
    proposal: approvals.buyer,
    context: buyerTradeContext,
    actorId: fixture.officeActors.buyerTrade.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  const buyerFinanceContext = await approvalContext(
    fixture.officeActors.buyerFinance,
    approvals.buyer,
  );
  buyer = await signApprovalProposal({
    proposal: buyer,
    context: buyerFinanceContext,
    actorId: fixture.officeActors.buyerFinance.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  approvals = Object.freeze({ ...approvals, seller, buyer });
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_V10_2_RESERVE',
      eventType: 'V10_2_RESERVE',
      worldId: transfer.worldId,
      causationCommandId: transfer.commandId,
      correlationId: transfer.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '10000',
      recordedAtReal: RESERVED_AT,
      correctsEventId: null,
      payload: {
        operation: 'RESERVE',
        transferFingerprint: transfer.fingerprint,
      },
    },
    sha256,
  );
  return Object.freeze({
    fixture,
    approvals,
    contexts: Object.freeze({
      sellerTrade: Object.freeze({
        actorId: fixture.officeActors.sellerTrade.actorId,
        context: sellerContext,
      }),
      buyerTrade: Object.freeze({
        actorId: fixture.officeActors.buyerTrade.actorId,
        context: buyerTradeContext,
      }),
      buyerFinance: Object.freeze({
        actorId: fixture.officeActors.buyerFinance.actorId,
        context: buyerFinanceContext,
      }),
    }),
    transition: createAuthoritativeTransition({
      command: transfer,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [event],
    }),
    event,
  });
}

function authoritativeInventoryState(
  source: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['inventoryAccounts']['sellerAvailable'],
  transfer: CanonicalCommand,
  quantity = '4',
) {
  const account = createInventoryAccount(source);
  return authorizeInventoryLedgerState({
    schemaVersion: 'inventory-ledger-v1' as const,
    worldId: transfer.worldId,
    worldVersion: '0',
    balances: Object.freeze([
      Object.freeze({
        account,
        quantity: Quantity.from(quantity, account.unit),
      }),
    ]),
    appliedPostings: Object.freeze([]),
  });
}

describe('V10.2 narrow Treasury-GCU transfer', () => {
  it('binds the exact ADR-09 terms into two country-scoped proposals', () => {
    const transfer = command();
    const approvals = createNarrowTransferApprovalBundle({
      command: transfer,
      sellerProposalId: proposalId('PROPOSAL_V10_2_SELLER'),
      buyerProposalId: proposalId('PROPOSAL_V10_2_BUYER'),
      proposalVersion: 'VERSION_1',
    });

    expect(approvals.seller.requiredOffices).toEqual(['TRADE']);
    expect(approvals.buyer.requiredOffices).toEqual(['TRADE', 'FINANCE']);
    expect(approvals.seller.payloadFingerprint).toBe(transfer.fingerprint);
    expect(approvals.buyer.payloadFingerprint).toBe(transfer.fingerprint);
    expect(() =>
      createNarrowTransferApprovalBundle({
        command: command({ currency: 'USD' }),
        sellerProposalId: proposalId('PROPOSAL_V10_2_SELLER_USD'),
        buyerProposalId: proposalId('PROPOSAL_V10_2_BUYER_USD'),
        proposalVersion: 'VERSION_1',
      }),
    ).toThrow(/approved registered GRAIN\/GCU terms/u);
    expect(() =>
      createNarrowTransferApprovalBundle({
        command: command({ quantity: '3' }),
        sellerProposalId: proposalId('PROPOSAL_V10_2_SELLER_THRESHOLD'),
        buyerProposalId: proposalId('PROPOSAL_V10_2_BUYER_THRESHOLD'),
        proposalVersion: 'VERSION_1',
      }),
    ).toThrow(/below-threshold maximum/u);
  });

  it('requires each current Seller Trade, Buyer Trade, and Buyer Finance signature', async () => {
    const scenario = await approvedScenario();
    await expect(
      assertNarrowTransferApprovalsCurrent({
        approvals: scenario.approvals,
        contexts: scenario.contexts,
        atReal: RESERVED_AT,
      }),
    ).resolves.toMatchObject({ commodityId: 'GRAIN' });

    for (const target of [
      'SELLER_TRADE',
      'BUYER_TRADE',
      'BUYER_FINANCE',
    ] as const) {
      const staleSeller = Object.freeze({
        ...scenario.approvals.seller,
        signatures: Object.freeze(
          scenario.approvals.seller.signatures.map((signature) =>
            target === 'SELLER_TRADE'
              ? Object.freeze({
                  ...signature,
                  authorizationVersion: 'REVOKED_1',
                })
              : signature,
          ),
        ),
      });
      const staleBuyer = Object.freeze({
        ...scenario.approvals.buyer,
        signatures: Object.freeze(
          scenario.approvals.buyer.signatures.map((signature) =>
            (target === 'BUYER_TRADE' && signature.officeId === 'TRADE') ||
            (target === 'BUYER_FINANCE' && signature.officeId === 'FINANCE')
              ? Object.freeze({
                  ...signature,
                  authorizationVersion: 'REVOKED_1',
                })
              : signature,
          ),
        ),
      });
      await expect(
        assertNarrowTransferApprovalsCurrent({
          approvals: Object.freeze({
            ...scenario.approvals,
            seller: staleSeller,
            buyer: staleBuyer,
          }),
          contexts: scenario.contexts,
          atReal: RESERVED_AT,
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
    }

    await expect(
      assertNarrowTransferApprovalsCurrent({
        approvals: scenario.approvals,
        contexts: scenario.contexts,
        atReal: EXPIRES_AT,
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it('reserves exact available stock and makes a duplicate acceptance idempotent', async () => {
    const scenario = await approvedScenario();
    const first = await reserveNarrowTreasuryGcuTransfer({
      approvals: scenario.approvals,
      contexts: scenario.contexts,
      atReal: RESERVED_AT,
      inventoryState: authoritativeInventoryState(
        scenario.fixture.inventoryAccounts.sellerAvailable,
        scenario.approvals.command,
      ),
      source: scenario.fixture.inventoryAccounts.sellerAvailable,
      reservationId: inventoryReservationId('RESERVATION_V10_2'),
      postingId: inventoryPostingId('POSTING_V10_2_RESERVE'),
      transition: scenario.transition,
      simTime: SimTime.fromTicks('10000'),
      causationEventIds: [scenario.event.eventId],
      sha256Hex: sha256,
    });
    expect(first.posting.operation).toBe('RESERVE');
    expect(first.inventory.receipt.outcome).toBe('APPLIED');
    expect(
      first.inventory.state.balances
        .find((balance) => balance.account.bucket === 'RESERVED')
        ?.quantity.toCanonicalValue().amount,
    ).toBe('2');

    const duplicate = await reserveNarrowTreasuryGcuTransfer({
      approvals: scenario.approvals,
      contexts: scenario.contexts,
      atReal: RESERVED_AT,
      inventoryState: first.inventory.state,
      source: scenario.fixture.inventoryAccounts.sellerAvailable,
      reservationId: inventoryReservationId('RESERVATION_V10_2'),
      postingId: inventoryPostingId('POSTING_V10_2_RESERVE'),
      transition: scenario.transition,
      simTime: SimTime.fromTicks('10000'),
      causationEventIds: [scenario.event.eventId],
      sha256Hex: sha256,
    });
    expect(duplicate.inventory.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.inventory.state).toBe(first.inventory.state);

    const differentIntent = await approvedScenario(command({ quantity: '1' }));
    await expect(
      reserveNarrowTreasuryGcuTransfer({
        approvals: differentIntent.approvals,
        contexts: differentIntent.contexts,
        atReal: RESERVED_AT,
        inventoryState: first.inventory.state,
        source: differentIntent.fixture.inventoryAccounts.sellerAvailable,
        reservationId: inventoryReservationId('RESERVATION_V10_2'),
        postingId: inventoryPostingId('POSTING_V10_2_RESERVE'),
        transition: differentIntent.transition,
        simTime: SimTime.fromTicks('10000'),
        causationEventIds: [differentIntent.event.eventId],
        sha256Hex: sha256,
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INVENTORY_POSTING_CONFLICT,
    });
  });

  it('fails closed when the approved quantity exceeds authoritative stock', async () => {
    const scenario = await approvedScenario();
    await expect(
      reserveNarrowTreasuryGcuTransfer({
        approvals: scenario.approvals,
        contexts: scenario.contexts,
        atReal: RESERVED_AT,
        inventoryState: authoritativeInventoryState(
          scenario.fixture.inventoryAccounts.sellerAvailable,
          scenario.approvals.command,
          '1',
        ),
        source: scenario.fixture.inventoryAccounts.sellerAvailable,
        reservationId: inventoryReservationId('RESERVATION_V10_2_NO_STOCK'),
        postingId: inventoryPostingId('POSTING_V10_2_NO_STOCK'),
        transition: scenario.transition,
        simTime: SimTime.fromTicks('10000'),
        causationEventIds: [scenario.event.eventId],
        sha256Hex: sha256,
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INVENTORY_NEGATIVE_STOCK,
    });
  });
});
