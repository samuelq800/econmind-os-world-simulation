// PREPARATION_ONLY_NOT_V09_2_STARTED. Non-activated P0 candidate adapter.
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  canonicalHashInput,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createOutboxMessage,
  parseAuthoritativeEvent,
  parseNarrowTreasuryGcuShipmentTerms,
  shipNarrowTreasuryGcuTransfer,
  type CanonicalCommand,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryPostingId,
  type Sha256Hex,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';

interface ShipmentDraftInput {
  readonly shipmentCommand: CanonicalCommand;
  readonly transferCommand: CanonicalCommand;
  readonly inventoryState: InventoryLedgerState;
  readonly source: InventoryAccount;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly eventId: string;
  readonly eventSequence: string;
  readonly inventoryPostingId: InventoryPostingId;
  readonly outboxMessageId: string;
  readonly observedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}

/** Worker-held durable state only; no account/balance input on load. */
export interface NarrowTreasuryGcuShipmentPreparationSource {
  load(input: {
    readonly shipmentCommand: CanonicalCommand;
    readonly observedAtReal: string;
  }): Promise<Omit<ShipmentDraftInput, 'shipmentCommand' | 'sha256Hex'>>;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

/** Calls the existing Core movement algorithm; this function performs no SQL. */
export function prepareNarrowTreasuryGcuShipmentAtomicDraft(
  input: ShipmentDraftInput,
): AtomicTransitionDraft {
  const command = input.shipmentCommand;
  if (
    command.officeId !== null ||
    command.expectedWorldVersion === null ||
    command.worldId !== input.commitAssertion.worldId ||
    command.expectedWorldVersion !==
      input.commitAssertion.expectedWorldVersion ||
    input.inventoryState.worldId !== command.worldId ||
    input.inventoryState.worldVersion !== command.expectedWorldVersion ||
    command.simTime.ticks < input.transferCommand.simTime.ticks
  )
    invalid(
      'Shipment requires one matching versioned automatic World boundary',
    );
  const terms = parseNarrowTreasuryGcuShipmentTerms({
    shipmentCommand: command,
    transferCommand: input.transferCommand,
    sha256Hex: input.sha256Hex,
  });
  const after = (BigInt(command.expectedWorldVersion) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: input.eventId,
      eventType: 'NARROW_TREASURY_GCU_SHIPPED_V1',
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: input.eventSequence,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: input.observedAtReal,
      correctsEventId: null,
      payload: {
        schemaVersion: 'narrow-treasury-gcu-shipment-event-v1',
        shipmentId: terms.shipmentId,
        transferCommandId: input.transferCommand.commandId,
        transferFingerprint: input.transferCommand.fingerprint,
      },
    },
    input.sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: command.expectedWorldVersion,
    worldVersionAfter: after,
    events: [event],
  });
  const shipment = shipNarrowTreasuryGcuTransfer({
    shipmentCommand: command,
    transferCommand: input.transferCommand,
    inventoryState: input.inventoryState,
    postingId: input.inventoryPostingId,
    source: input.source,
    causationEventIds: transition.eventIds,
    transition,
    sha256Hex: input.sha256Hex,
  });
  if (shipment.inventory.receipt.outcome !== 'APPLIED')
    invalid('New Shipment candidate cannot reuse an applied posting');
  const payload = {
    schemaVersion: 'narrow-treasury-gcu-shipment-outbox-v1',
    eventId: event.eventId,
    inventoryPostingFingerprint: shipment.posting.fingerprint,
    shipmentId: terms.shipmentId,
    transferCommandId: input.transferCommand.commandId,
    transferFingerprint: input.transferCommand.fingerprint,
  };
  return Object.freeze({
    transition,
    inventoryPostings: Object.freeze([shipment.posting]),
    financialPostingBatches: Object.freeze([]),
    receipt: createFinalCommandReceipt({
      command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: command.simTime,
      recordedAtReal: input.observedAtReal,
    }),
    outboxMessages: Object.freeze([
      createOutboxMessage({
        messageId: input.outboxMessageId,
        worldId: command.worldId,
        commandId: command.commandId,
        eventId: event.eventId,
        payload,
        payloadHash: canonicalSha256(
          canonicalHashInput(payload),
          input.sha256Hex,
        ),
        availableAtSimTime: command.simTime,
      }),
    ]),
    currentMaterializations: Object.freeze([]),
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitAssertion: input.commitAssertion,
    observedAtReal: input.observedAtReal,
  });
}

export function createNarrowTreasuryGcuShipmentCandidateFactory(input: {
  readonly source: NarrowTreasuryGcuShipmentPreparationSource;
  readonly sha256Hex: Sha256Hex;
}): AtomicTransitionCandidateFactory {
  return Object.freeze({
    async prepare(
      candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      if (candidate.commitAuthorization !== null)
        invalid('Automatic Shipment cannot carry discretionary authorization');
      const preparation = await input.source.load({
        shipmentCommand: candidate.command,
        observedAtReal: candidate.observedAtReal,
      });
      return prepareNarrowTreasuryGcuShipmentAtomicDraft({
        ...preparation,
        shipmentCommand: candidate.command,
        sha256Hex: input.sha256Hex,
      });
    },
  });
}
