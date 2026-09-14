import {
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  canonicalHashInput,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createOutboxMessage,
  deliverNarrowTreasuryGcuTransfer,
  parseAuthoritativeEvent,
  parseNarrowTreasuryGcuDeliveryTerms,
  type CanonicalCommand,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingBatchId,
  type FinancialPostingLegId,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryPostingId,
  type Sha256Hex,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
  CurrentMaterializationInput,
} from './atomic-transition-repository.js';

export const NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE =
  'NARROW_TREASURY_GCU_DELIVERED_V1' as const;
export const NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA =
  'narrow-treasury-gcu-delivery-event-v1' as const;
export const NARROW_TREASURY_GCU_DELIVERY_OUTBOX_SCHEMA =
  'narrow-treasury-gcu-delivery-outbox-v1' as const;
export const NARROW_TREASURY_GCU_DELIVERY_MATERIALIZATION_KEY =
  'NARROW_TREASURY_GCU_DELIVERY' as const;
export const NARROW_TREASURY_GCU_DELIVERY_MATERIALIZATION_SCHEMA =
  'narrow-treasury-gcu-delivery-materialization-v1' as const;

type NarrowTreasuryGcuDeliveryDraftInput = Parameters<
  typeof prepareNarrowTreasuryGcuDeliveryAtomicDraft
>[0];

/**
 * Server-owned adapter boundary for loading the one authoritative delivery
 * snapshot. The worker must implement it with one consistent read boundary;
 * this port accepts no caller-provided balance or account facts.
 */
export interface NarrowTreasuryGcuDeliveryPreparationSource {
  load(
    input: Readonly<{
      readonly deliveryCommand: CanonicalCommand;
    }>,
  ): Promise<
    Omit<NarrowTreasuryGcuDeliveryDraftInput, 'deliveryCommand' | 'sha256Hex'>
  >;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function automaticVersion(command: CanonicalCommand): Readonly<{
  readonly before: string;
  readonly after: string;
}> {
  if (command.officeId !== null || command.expectedWorldVersion === null) {
    invalid('Narrow delivery draft requires one versioned automatic Command');
  }
  return Object.freeze({
    before: command.expectedWorldVersion,
    after: (BigInt(command.expectedWorldVersion) + 1n).toString(),
  });
}

/**
 * This is a derived delivery index only. It is deliberately composed entirely
 * from the immutable Command/Event/Posting identity that already commits in
 * the same transaction; it carries no balance, stock, or authorization input.
 */
export function createNarrowTreasuryGcuDeliveryMaterialization(input: {
  readonly deliveryCommandId: string;
  readonly deliveryFingerprint: string;
  readonly deliveryWorldVersion: string;
  readonly eventId: string;
  readonly financialPostingFingerprint: string;
  readonly inventoryPostingFingerprint: string;
  readonly shipmentId: string;
  readonly transferCommandId: string;
  readonly transferFingerprint: string;
  readonly worldId: string;
  readonly materializedWorldVersion: string;
}): CurrentMaterializationInput {
  return Object.freeze({
    key: NARROW_TREASURY_GCU_DELIVERY_MATERIALIZATION_KEY,
    payload: Object.freeze({
      deliveryCommandId: input.deliveryCommandId,
      deliveryFingerprint: input.deliveryFingerprint,
      deliveryWorldVersion: input.deliveryWorldVersion,
      eventId: input.eventId,
      financialPostingFingerprint: input.financialPostingFingerprint,
      inventoryPostingFingerprint: input.inventoryPostingFingerprint,
      schemaVersion: NARROW_TREASURY_GCU_DELIVERY_MATERIALIZATION_SCHEMA,
      shipmentId: input.shipmentId,
      transferCommandId: input.transferCommandId,
      transferFingerprint: input.transferFingerprint,
      worldId: input.worldId,
      materializedWorldVersion: input.materializedWorldVersion,
    }),
  });
}

/**
 * Builds the facts for one narrow automatic delivery. The caller remains
 * responsible for obtaining the live authoritative ledgers and writer lease;
 * this function performs no I/O and is not a production composition root.
 */
export function prepareNarrowTreasuryGcuDeliveryAtomicDraft(input: {
  readonly buyerTreasury: FinancialAccount;
  readonly buyerTreasuryLegId: FinancialPostingLegId;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly deliveryCommand: CanonicalCommand;
  readonly eventId: string;
  readonly eventSequence: string;
  readonly financialBatchId: FinancialPostingBatchId;
  readonly financialState: FinancialLedgerState;
  readonly inventoryPostingId: InventoryPostingId;
  readonly inventoryState: InventoryLedgerState;
  readonly observedAtReal: string;
  readonly outboxMessageId: string;
  readonly sellerSettlement: FinancialAccount;
  readonly sellerSettlementLegId: FinancialPostingLegId;
  readonly source: InventoryAccount;
  readonly transferCommand: CanonicalCommand;
  readonly sha256Hex: Sha256Hex;
}): Readonly<{
  readonly draft: AtomicTransitionDraft;
  readonly inventoryState: InventoryLedgerState;
  readonly financialState: FinancialLedgerState;
}> {
  const versions = automaticVersion(input.deliveryCommand);
  const terms = parseNarrowTreasuryGcuDeliveryTerms({
    deliveryCommand: input.deliveryCommand,
    transferCommand: input.transferCommand,
    sha256Hex: input.sha256Hex,
  });
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: input.eventId,
      eventType: NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE,
      worldId: input.deliveryCommand.worldId,
      causationCommandId: input.deliveryCommand.commandId,
      correlationId: input.deliveryCommand.correlationId,
      worldVersion: versions.after,
      sequence: input.eventSequence,
      simTime: input.deliveryCommand.simTime.toCanonicalValue(),
      recordedAtReal: input.observedAtReal,
      correctsEventId: null,
      payload: {
        schemaVersion: NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA,
        shipmentId: terms.shipmentId,
        transferCommandId: input.transferCommand.commandId,
        transferFingerprint: input.transferCommand.fingerprint,
      },
    },
    input.sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command: input.deliveryCommand,
    worldVersionBefore: versions.before,
    worldVersionAfter: versions.after,
    events: [event],
  });
  const delivery = deliverNarrowTreasuryGcuTransfer({
    buyerTreasury: input.buyerTreasury,
    buyerTreasuryLegId: input.buyerTreasuryLegId,
    causationEventIds: transition.eventIds,
    deliveryCommand: input.deliveryCommand,
    financialBatchId: input.financialBatchId,
    financialState: input.financialState,
    inventoryPostingId: input.inventoryPostingId,
    inventoryState: input.inventoryState,
    sellerSettlement: input.sellerSettlement,
    sellerSettlementLegId: input.sellerSettlementLegId,
    source: input.source,
    transferCommand: input.transferCommand,
    transition,
    sha256Hex: input.sha256Hex,
  });
  if (
    delivery.inventory.receipt.outcome !== 'APPLIED' ||
    delivery.financial.receipt.outcome !== 'APPLIED'
  ) {
    invalid(
      'New delivery draft cannot be built from an already-applied posting',
    );
  }
  const receipt = createFinalCommandReceipt({
    command: input.deliveryCommand,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: input.deliveryCommand.simTime,
    recordedAtReal: input.observedAtReal,
  });
  const outboxPayload = {
    schemaVersion: NARROW_TREASURY_GCU_DELIVERY_OUTBOX_SCHEMA,
    eventId: event.eventId,
    financialPostingFingerprint: delivery.settlement.fingerprint,
    inventoryPostingFingerprint: delivery.posting.fingerprint,
    shipmentId: terms.shipmentId,
    transferCommandId: input.transferCommand.commandId,
    transferFingerprint: input.transferCommand.fingerprint,
  };
  const outbox = createOutboxMessage({
    messageId: input.outboxMessageId,
    worldId: input.deliveryCommand.worldId,
    commandId: input.deliveryCommand.commandId,
    eventId: event.eventId,
    payload: outboxPayload,
    payloadHash: canonicalSha256(
      canonicalHashInput(outboxPayload),
      input.sha256Hex,
    ),
    availableAtSimTime: input.deliveryCommand.simTime,
  });
  const materialization = createNarrowTreasuryGcuDeliveryMaterialization({
    deliveryCommandId: input.deliveryCommand.commandId,
    deliveryFingerprint: input.deliveryCommand.fingerprint,
    deliveryWorldVersion: versions.after,
    eventId: event.eventId,
    financialPostingFingerprint: delivery.settlement.fingerprint,
    inventoryPostingFingerprint: delivery.posting.fingerprint,
    shipmentId: terms.shipmentId,
    transferCommandId: input.transferCommand.commandId,
    transferFingerprint: input.transferCommand.fingerprint,
    worldId: input.deliveryCommand.worldId,
    materializedWorldVersion: versions.after,
  });
  return Object.freeze({
    draft: Object.freeze({
      transition,
      inventoryPostings: Object.freeze([delivery.posting]),
      financialPostingBatches: Object.freeze([delivery.settlement]),
      receipt,
      outboxMessages: Object.freeze([outbox]),
      currentMaterializations: Object.freeze([materialization]),
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: input.commitAssertion,
      observedAtReal: input.observedAtReal,
    }),
    inventoryState: delivery.inventory.state,
    financialState: delivery.financial.state,
  });
}

/**
 * Adapts the narrowly scoped, server-owned delivery snapshot to the existing
 * authoritative worker composition root. It deliberately accepts only a
 * versioned automatic delivery command and never discretionary authorization.
 */
export function createNarrowTreasuryGcuDeliveryCandidateFactory(input: {
  readonly sha256Hex: Sha256Hex;
  readonly source: NarrowTreasuryGcuDeliveryPreparationSource;
}): AtomicTransitionCandidateFactory {
  return Object.freeze({
    async prepare(
      candidateInput: Parameters<
        AtomicTransitionCandidateFactory['prepare']
      >[0],
    ) {
      if (candidateInput.commitAuthorization !== null) {
        invalid(
          'Automatic Treasury-GCU delivery cannot carry user authorization',
        );
      }
      const preparation = await input.source.load({
        deliveryCommand: candidateInput.command,
      });
      return prepareNarrowTreasuryGcuDeliveryAtomicDraft({
        ...preparation,
        deliveryCommand: candidateInput.command,
        sha256Hex: input.sha256Hex,
      }).draft;
    },
  });
}
