import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  type CanonicalCommand,
  type CanonicalSha256,
  type CommitAuthorizationProof,
  type CountryId,
  type FinancialAccount,
  type InventoryAccount,
  type Quantity,
  type Price,
  type Sha256Hex,
  type WorldId,
} from '@econmind/core';

import {
  prepareAtomicTransitionCandidate,
  type AtomicCommitAuthorizationGuard,
  type AtomicTransitionCandidateFactory,
  type AtomicTransitionDraft,
  type PrivateAtomicTransitionCandidate,
} from '../persistence/atomic-transition-repository.js';
import type { SqlExecutor } from '../persistence/sql-database.js';

/**
 * This module is a candidate-state adapter only. It has no startup wiring and
 * does not authorize V10.3, change a status record, or provide a second
 * persistence path. Its sole durable target is V09's AtomicTransitionRepository.
 */
export const V10_3_CANDIDATE_STATUS =
  'CANDIDATE_AWAITING_V10_2_CONTRACT_AND_GATE' as const;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function same(left: unknown, right: unknown): boolean {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

function assertCommandBinding(input: {
  readonly command: CanonicalCommand;
  readonly reference: V10ExecutionBinding;
  readonly draft: AtomicTransitionDraft;
}): void {
  if (
    input.command.worldId !== input.reference.worldId ||
    input.command.commandId !== input.reference.commandId ||
    input.command.fingerprint !== input.reference.commandFingerprint ||
    input.command.expectedWorldVersion === null ||
    input.command.expectedWorldVersion !==
      input.reference.expectedWorldVersion ||
    input.draft.transition.worldId !== input.command.worldId ||
    input.draft.transition.commandId !== input.command.commandId ||
    input.draft.transition.commandFingerprint !== input.command.fingerprint ||
    input.draft.transition.worldVersionBefore !==
      input.reference.expectedWorldVersion
  ) {
    invalid(
      'V10 execution reference, Command and transition must bind one WorldVersion boundary',
    );
  }
}

function assertInventoryPair(input: {
  readonly source: InventoryAccount;
  readonly destination: InventoryAccount;
  readonly quantity: Quantity;
  readonly draft: AtomicTransitionDraft;
  readonly operation: 'SHIP' | 'DELIVER';
}): void {
  if (input.draft.inventoryPostings.length !== 1) {
    invalid('A V10 phase requires exactly one Inventory Posting');
  }
  const posting = input.draft.inventoryPostings[0]!;
  if (posting.operation !== input.operation || posting.entries.length !== 2) {
    invalid('V10 Inventory Posting has an unexpected lifecycle operation');
  }
  const debit = posting.entries.find((entry) =>
    entry.delta.amount.isNegative(),
  );
  const credit = posting.entries.find((entry) =>
    entry.delta.amount.isPositive(),
  );
  const amount = input.quantity.toCanonicalValue().amount;
  if (
    debit === undefined ||
    credit === undefined ||
    !same(debit.account, input.source) ||
    !same(credit.account, input.destination) ||
    debit.delta.toCanonicalValue().amount !== `-${amount}` ||
    credit.delta.toCanonicalValue().amount !== amount ||
    debit.delta.unit !== input.quantity.unit ||
    credit.delta.unit !== input.quantity.unit
  ) {
    invalid('V10 Inventory Posting is not the exact approved movement');
  }
}

function assertShipmentLifecycle(input: {
  readonly reference: V10ShipmentReference;
  readonly draft: AtomicTransitionDraft;
}): void {
  const {
    sourceInventoryAccount: source,
    destinationInventoryAccount: target,
  } = input.reference;
  if (
    source.bucket !== 'RESERVED' ||
    target.bucket !== 'IN_TRANSIT' ||
    source.worldId !== input.reference.worldId ||
    target.worldId !== input.reference.worldId ||
    source.countryId !== input.reference.sellerCountryId ||
    target.countryId !== input.reference.sellerCountryId ||
    source.reservationId === null ||
    source.shipmentId !== null ||
    target.reservationId !== null ||
    target.shipmentId === null ||
    source.commodityId !== target.commodityId ||
    source.batchId !== target.batchId ||
    source.unit !== target.unit ||
    source.titleHolderId !== target.titleHolderId ||
    source.riskBearerId !== target.riskBearerId ||
    source.economicRecognitionId !== target.economicRecognitionId ||
    input.draft.financialPostingBatches.length !== 0
  ) {
    invalid('V10 shipment must move only seller RESERVED stock into transit');
  }
  assertInventoryPair({
    source,
    destination: target,
    quantity: input.reference.quantity,
    draft: input.draft,
    operation: 'SHIP',
  });
}

function assertDeliveryLifecycle(input: {
  readonly reference: V10DeliverySettlementReference;
  readonly draft: AtomicTransitionDraft;
}): void {
  const {
    sourceInventoryAccount: source,
    destinationInventoryAccount: target,
  } = input.reference;
  if (
    source.bucket !== 'IN_TRANSIT' ||
    target.bucket !== 'AVAILABLE' ||
    source.worldId !== input.reference.worldId ||
    target.worldId !== input.reference.worldId ||
    source.countryId !== input.reference.sellerCountryId ||
    target.countryId !== input.reference.buyerCountryId ||
    source.reservationId !== null ||
    source.shipmentId === null ||
    target.reservationId !== null ||
    target.shipmentId !== null ||
    source.commodityId !== target.commodityId ||
    source.batchId !== target.batchId ||
    source.unit !== target.unit ||
    source.titleHolderId !== input.reference.sellerEntityId ||
    source.riskBearerId !== input.reference.sellerEntityId ||
    target.titleHolderId !== input.reference.buyerEntityId ||
    target.riskBearerId !== input.reference.buyerEntityId
  ) {
    invalid('V10 delivery must move seller transit stock to buyer AVAILABLE');
  }
  assertInventoryPair({
    source,
    destination: target,
    quantity: input.reference.quantity,
    draft: input.draft,
    operation: 'DELIVER',
  });
}

function assertSettlement(input: {
  readonly reference: V10DeliverySettlementReference;
  readonly draft: AtomicTransitionDraft;
}): void {
  if (input.reference.price.currency !== 'GCU') {
    invalid('The V10 settlement asset is GCU');
  }
  if (input.draft.financialPostingBatches.length !== 1) {
    invalid('V10 delivery requires exactly one Financial Posting batch');
  }
  const batch = input.draft.financialPostingBatches[0]!;
  const expectedAmount = input.reference.price.multiply(
    input.reference.quantity,
  );
  if (batch.settlementCurrency !== 'GCU' || batch.legs.length !== 2) {
    invalid('V10 delivery settlement must have one balanced GCU payment');
  }
  const buyerLeg = batch.legs.find((leg) =>
    same(leg.account, input.reference.buyerTreasuryAccount),
  );
  const sellerLeg = batch.legs.find((leg) =>
    same(leg.account, input.reference.sellerSettlementAccount),
  );
  if (
    buyerLeg === undefined ||
    sellerLeg === undefined ||
    buyerLeg.direction !== 'CREDIT' ||
    sellerLeg.direction !== 'DEBIT' ||
    !buyerLeg.amount.amount.equals(expectedAmount.amount) ||
    !sellerLeg.amount.amount.equals(expectedAmount.amount) ||
    buyerLeg.amount.currency !== expectedAmount.currency ||
    sellerLeg.amount.currency !== expectedAmount.currency ||
    buyerLeg.counterpartyAccountId !== sellerLeg.account.accountId ||
    sellerLeg.counterpartyAccountId !== buyerLeg.account.accountId ||
    buyerLeg.account.worldId !== input.reference.worldId ||
    sellerLeg.account.worldId !== input.reference.worldId ||
    buyerLeg.account.countryId !== input.reference.buyerCountryId ||
    sellerLeg.account.countryId !== input.reference.sellerCountryId ||
    buyerLeg.account.ownerId !== input.reference.buyerEntityId ||
    sellerLeg.account.ownerId !== input.reference.sellerEntityId
  ) {
    invalid('V10 settlement is not the exact buyer-to-seller GCU payment');
  }
}

/**
 * Produced by V10.2's approved-reservation path. The caller owns its
 * persistence and approval semantics; this adapter only verifies that a
 * proposed execution is bound to the opaque, already-approved reference.
 */
export interface V10ExecutionBinding {
  readonly worldId: WorldId;
  readonly commandId: CanonicalCommand['commandId'];
  readonly commandFingerprint: CanonicalSha256;
  readonly expectedWorldVersion: string;
}

export interface V10ShipmentReference extends V10ExecutionBinding {
  readonly sellerCountryId: CountryId;
  readonly quantity: Quantity;
  readonly sourceInventoryAccount: Readonly<InventoryAccount>;
  readonly destinationInventoryAccount: Readonly<InventoryAccount>;
}

export interface V10DeliverySettlementReference extends V10ExecutionBinding {
  readonly sellerCountryId: CountryId;
  readonly buyerCountryId: CountryId;
  readonly sellerEntityId: InventoryAccount['titleHolderId'];
  readonly buyerEntityId: InventoryAccount['titleHolderId'];
  readonly quantity: Quantity;
  readonly price: Price;
  readonly sourceInventoryAccount: Readonly<InventoryAccount>;
  readonly destinationInventoryAccount: Readonly<InventoryAccount>;
  readonly buyerTreasuryAccount: Readonly<FinancialAccount>;
  readonly sellerSettlementAccount: Readonly<FinancialAccount>;
}

export interface V10ShipmentCandidateInput {
  readonly command: CanonicalCommand;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly reference: V10ShipmentReference;
  readonly draft: AtomicTransitionDraft;
  readonly sha256Hex: Sha256Hex;
}

export interface V10DeliverySettlementCandidateInput {
  readonly command: CanonicalCommand;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly reference: V10DeliverySettlementReference;
  readonly draft: AtomicTransitionDraft;
  readonly sha256Hex: Sha256Hex;
}

export function prepareV10ShipmentCandidate(
  input: V10ShipmentCandidateInput,
): Readonly<PrivateAtomicTransitionCandidate> {
  assertCommandBinding(input);
  assertShipmentLifecycle({ reference: input.reference, draft: input.draft });
  return prepareAtomicTransitionCandidate(input);
}

export function prepareV10DeliverySettlementCandidate(
  input: V10DeliverySettlementCandidateInput,
): Readonly<PrivateAtomicTransitionCandidate> {
  assertCommandBinding(input);
  assertDeliveryLifecycle({ reference: input.reference, draft: input.draft });
  assertSettlement({ reference: input.reference, draft: input.draft });
  return prepareAtomicTransitionCandidate(input);
}

export interface V10CandidateDraftFactory<Reference> {
  prepare(input: {
    readonly command: CanonicalCommand;
    readonly commitAuthorization: CommitAuthorizationProof | null;
  }): Promise<Readonly<{ reference: Reference; draft: AtomicTransitionDraft }>>;
}

export function createV10ShipmentCandidateFactory(input: {
  readonly factory: V10CandidateDraftFactory<V10ShipmentReference>;
  readonly sha256Hex: Sha256Hex;
}): AtomicTransitionCandidateFactory {
  return Object.freeze({
    prepare: async ({
      command,
      commitAuthorization,
    }: {
      readonly command: CanonicalCommand;
      readonly commitAuthorization: CommitAuthorizationProof | null;
    }) => {
      const candidate = await input.factory.prepare({
        command,
        commitAuthorization,
      });
      prepareV10ShipmentCandidate({
        command,
        commitAuthorization,
        reference: candidate.reference,
        draft: candidate.draft,
        sha256Hex: input.sha256Hex,
      });
      return candidate.draft;
    },
  });
}

export function createV10DeliverySettlementCandidateFactory(input: {
  readonly factory: V10CandidateDraftFactory<V10DeliverySettlementReference>;
  readonly sha256Hex: Sha256Hex;
}): AtomicTransitionCandidateFactory {
  return Object.freeze({
    prepare: async ({
      command,
      commitAuthorization,
    }: {
      readonly command: CanonicalCommand;
      readonly commitAuthorization: CommitAuthorizationProof | null;
    }) => {
      const candidate = await input.factory.prepare({
        command,
        commitAuthorization,
      });
      prepareV10DeliverySettlementCandidate({
        command,
        commitAuthorization,
        reference: candidate.reference,
        draft: candidate.draft,
        sha256Hex: input.sha256Hex,
      });
      return candidate.draft;
    },
  });
}

/**
 * V09 re-resolves the Command actor. V10.2 must additionally re-resolve the
 * approved bilateral transfer inside the same SQL transaction before a V10.3
 * candidate can commit. This adapter preserves that ordering without taking
 * over V10.2's proposal/reservation model.
 */
export interface V10TransferCommitAuthorizationGuard {
  assertCurrent(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      commitAuthorization: CommitAuthorizationProof | null;
    }>,
  ): Promise<void>;
}

export function createV10DeliveryCommitAuthorizationGuard(input: {
  readonly base: AtomicCommitAuthorizationGuard;
  readonly transfer: V10TransferCommitAuthorizationGuard;
}): AtomicCommitAuthorizationGuard {
  return Object.freeze({
    assertCurrent: async (
      transaction: SqlExecutor,
      candidate: Parameters<AtomicCommitAuthorizationGuard['assertCurrent']>[1],
    ) => {
      await input.base.assertCurrent(transaction, candidate);
      await input.transfer.assertCurrent(transaction, {
        command: candidate.command,
        commitAuthorization: candidate.proof,
      });
    },
  });
}
