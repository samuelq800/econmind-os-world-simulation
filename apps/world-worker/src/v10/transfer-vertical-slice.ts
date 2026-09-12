import {
  DOMAIN_ERROR_CODES,
  DomainError,
  type CanonicalCommand,
} from '@econmind/core';

import {
  prepareGoodsReservation,
  type GoodsReservationInput,
} from '../trade/goods-reservation.js';
import {
  prepareV10DeliverySettlementCandidate,
  prepareV10ShipmentCandidate,
  type V10DeliverySettlementCandidateInput,
  type V10ShipmentCandidateInput,
} from './atomic-transfer-candidates.js';

/**
 * This adapter joins V10's candidate phases only. It deliberately has no
 * repository dependency: V09's database integrity review remains a hard
 * blocker for any durable commit.
 */
export const V10_VERTICAL_SLICE_STATUS =
  'CANDIDATE_NOT_COMMITTED_V09_PERSISTENCE_BLOCKED' as const;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function assertDistinctCommands(commands: readonly CanonicalCommand[]): void {
  const ids = new Set(commands.map((command) => command.commandId));
  const idempotencyKeys = new Set(
    commands.map((command) => command.idempotencyKey),
  );
  if (
    ids.size !== commands.length ||
    idempotencyKeys.size !== commands.length
  ) {
    invalid('Each V10 vertical-slice phase requires its own Command identity');
  }
}

export interface V10TransferVerticalSliceInput {
  readonly reservation: GoodsReservationInput;
  readonly shipment: V10ShipmentCandidateInput;
  readonly delivery: V10DeliverySettlementCandidateInput;
}

/**
 * Produces all locally validated V10 facts in their required order without
 * bypassing V09's sole AtomicTransitionRepository commit path.
 */
export async function prepareV10TransferVerticalSlice(
  input: V10TransferVerticalSliceInput,
) {
  const reservation = await prepareGoodsReservation(input.reservation);
  const reservationTransition = reservation.ledgerTransition.transition;

  if (
    input.shipment.command.worldId !== reservation.command.worldId ||
    input.shipment.reference.worldId !== reservation.command.worldId ||
    input.shipment.reference.expectedWorldVersion !==
      reservationTransition.worldVersionAfter
  ) {
    invalid('Shipment must begin at the reservation candidate WorldVersion');
  }

  const shipment = prepareV10ShipmentCandidate(input.shipment);
  if (
    input.delivery.command.worldId !== shipment.command.worldId ||
    input.delivery.reference.worldId !== shipment.command.worldId ||
    input.delivery.reference.expectedWorldVersion !==
      shipment.transition.worldVersionAfter
  ) {
    invalid('Delivery must begin at the shipment candidate WorldVersion');
  }

  const delivery = prepareV10DeliverySettlementCandidate(input.delivery);
  assertDistinctCommands([
    reservation.command,
    shipment.command,
    delivery.command,
  ]);

  return Object.freeze({
    status: V10_VERTICAL_SLICE_STATUS,
    reservation,
    shipment,
    delivery,
    receipts: Object.freeze([shipment.receipt, delivery.receipt]),
  });
}
