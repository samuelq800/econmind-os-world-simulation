import type { ApprovalProposal } from '../authorization/approvals.js';
import {
  CANONICAL_OFFICE_IDS,
  isAuthorizedOfficeContext,
  type AuthorizedOfficeContext,
} from '../authorization/offices.js';
import { canonicalSha256, type Sha256Hex } from '../commands/command.js';
import type { FinancialAccount } from '../finance/financial-ledger.js';
import { countryId, worldId, type CountryId, type WorldId } from '../ids.js';
import type { InventoryAccount } from '../inventory/inventory-ledger.js';
import { isMoney, type Money } from '../numeric/money.js';
import { isQuantity, type Quantity } from '../numeric/quantity.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import { canonicalSerialize } from '../serialization/canonical.js';

/** No package-index export or runtime caller until V27.2 and ADR-13 close. */
export const NPC_INTENT_PREPARATION_VERSION = 'npc-intent-preparation-v1';

const STABLE_REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const WORLD_VERSION = /^(?:0|[1-9]\d*)$/u;

export type NpcUnavailableReason =
  | 'MODEL_UNAVAILABLE'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'APPROVAL_UNAVAILABLE'
  | 'FUNDING_UNAVAILABLE'
  | 'INVENTORY_UNAVAILABLE'
  | 'VERSION_CONFLICT'
  | 'INSUFFICIENT_BUDGET'
  | 'INSUFFICIENT_INVENTORY';

export interface NpcFundingFact {
  readonly sourceRef: string;
  readonly worldVersion: string;
  readonly account: FinancialAccount;
  readonly availableCash: Money;
  readonly remainingBudget: Money;
  readonly requestedSpend: Money;
}

export interface NpcInventoryFact {
  readonly sourceRef: string;
  readonly worldVersion: string;
  readonly account: InventoryAccount;
  readonly available: Quantity;
  readonly requested: Quantity;
}

export interface NpcIntentPreparationInput {
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly worldVersion: string;
  readonly simTime: SimTime;
  readonly model: Readonly<{
    modelRef: string;
    modelVersion: string;
    decisionRef: string;
  }> | null;
  readonly officeContext: AuthorizedOfficeContext | null;
  readonly approval: ApprovalProposal | null;
  readonly funding: NpcFundingFact | null;
  readonly inventory: NpcInventoryFact | null;
}

export type NpcIntentPreparationResult =
  | Readonly<{
      status: 'UNAVAILABLE';
      reason: NpcUnavailableReason;
    }>
  | Readonly<{
      status: 'CANDIDATE_ONLY';
      candidateKind: 'RESOURCE_ALLOCATION_COMMAND_INTENT';
      /** Canonical proposal payload; not a CanonicalCommand or an acceptance. */
      intent: Readonly<Record<string, unknown>>;
      hashInput: string;
      fingerprint: `sha256:${string}`;
      requiredAuthoritativeChecks: readonly [
        'COMMAND_AUTHORIZATION',
        'APPROVAL_AT_COMMIT',
        'FUNDING_AT_COMMIT',
        'INVENTORY_AT_COMMIT',
        'WORLD_VERSION_AT_COMMIT',
      ];
    }>;

function unavailable(reason: NpcUnavailableReason): NpcIntentPreparationResult {
  return Object.freeze({ status: 'UNAVAILABLE', reason });
}

function stable(value: unknown): value is string {
  return typeof value === 'string' && STABLE_REF.test(value);
}

function nonNegativeVersion(value: unknown): value is string {
  return typeof value === 'string' && WORLD_VERSION.test(value);
}

function freezeCanonicalValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeCanonicalValue(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Prepare one deterministic, non-authoritative allocation proposal. The
 * caller-provided facts are only screening inputs; the authoritative writer
 * must read current ledgers and reauthorize all gates in its transaction.
 */
export function prepareNpcResourceAllocationIntent(
  input: NpcIntentPreparationInput,
  sha256Hex: Sha256Hex,
): NpcIntentPreparationResult {
  const model = input.model;
  if (
    !model ||
    !stable(model.modelRef) ||
    !stable(model.modelVersion) ||
    !stable(model.decisionRef) ||
    !isSimTime(input.simTime)
  ) {
    return unavailable('MODEL_UNAVAILABLE');
  }
  const context = input.officeContext;
  if (
    !isAuthorizedOfficeContext(context) ||
    context.worldId !== input.worldId ||
    context.countryId !== input.countryId ||
    context.officeId !== 'INDUSTRY' ||
    context.capability !== 'INDUSTRY_RESOURCES'
  ) {
    return unavailable('AUTHORIZATION_UNAVAILABLE');
  }
  const funding = input.funding;
  if (
    !funding ||
    !stable(funding.sourceRef) ||
    !funding.account ||
    !isMoney(funding.availableCash) ||
    !isMoney(funding.remainingBudget) ||
    !isMoney(funding.requestedSpend) ||
    funding.account.worldId !== input.worldId ||
    funding.account.countryId !== input.countryId ||
    !['CASH', 'DEPOSIT'].includes(funding.account.accountClass) ||
    funding.account.currency !== funding.requestedSpend.currency ||
    funding.availableCash.currency !== funding.requestedSpend.currency ||
    funding.remainingBudget.currency !== funding.requestedSpend.currency ||
    !funding.requestedSpend.amount.isPositive() ||
    funding.availableCash.amount.isNegative() ||
    funding.remainingBudget.amount.isNegative()
  ) {
    return unavailable('FUNDING_UNAVAILABLE');
  }
  const inventory = input.inventory;
  if (
    !inventory ||
    !stable(inventory.sourceRef) ||
    !inventory.account ||
    !isQuantity(inventory.available) ||
    !isQuantity(inventory.requested) ||
    inventory.account.worldId !== input.worldId ||
    inventory.account.countryId !== input.countryId ||
    inventory.account.bucket !== 'AVAILABLE' ||
    inventory.account.reservationId !== null ||
    inventory.account.shipmentId !== null ||
    inventory.account.unit !== inventory.requested.unit ||
    inventory.available.unit !== inventory.requested.unit ||
    inventory.account.titleHolderId !== funding.account.ownerId ||
    !inventory.requested.amount.isPositive() ||
    inventory.available.amount.isNegative()
  ) {
    return unavailable('INVENTORY_UNAVAILABLE');
  }
  if (
    !nonNegativeVersion(input.worldVersion) ||
    funding.worldVersion !== input.worldVersion ||
    inventory.worldVersion !== input.worldVersion
  ) {
    return unavailable('VERSION_CONFLICT');
  }
  if (
    funding.availableCash.amount.lessThan(funding.requestedSpend.amount) ||
    funding.remainingBudget.amount.lessThan(funding.requestedSpend.amount)
  ) {
    return unavailable('INSUFFICIENT_BUDGET');
  }
  if (inventory.available.amount.lessThan(inventory.requested.amount)) {
    return unavailable('INSUFFICIENT_INVENTORY');
  }
  const intent = Object.freeze({
    schemaVersion: NPC_INTENT_PREPARATION_VERSION,
    candidateKind: 'RESOURCE_ALLOCATION_COMMAND_INTENT',
    worldId: worldId(input.worldId),
    countryId: countryId(input.countryId),
    expectedWorldVersion: input.worldVersion,
    simTime: input.simTime.toCanonicalValue(),
    modelRef: model.modelRef,
    modelVersion: model.modelVersion,
    decisionRef: model.decisionRef,
    officeId: context.officeId,
    authorizationVersion: context.authorizationVersion,
    fundingSourceRef: funding.sourceRef,
    fundingAccountId: funding.account.accountId,
    availableCash: funding.availableCash.toCanonicalValue(),
    remainingBudget: funding.remainingBudget.toCanonicalValue(),
    requestedSpend: funding.requestedSpend.toCanonicalValue(),
    inventorySourceRef: inventory.sourceRef,
    inventoryAccount: inventory.account,
    availableInventory: inventory.available.toCanonicalValue(),
    requestedInventory: inventory.requested.toCanonicalValue(),
  });
  const hashInput = canonicalSerialize(intent);
  // The input account is caller-owned and may remain mutable. The returned
  // candidate must instead own frozen bytes identical to its approval hash.
  const detachedIntent = freezeCanonicalValue(
    JSON.parse(hashInput),
  ) as Readonly<Record<string, unknown>>;
  const fingerprint = canonicalSha256(hashInput, sha256Hex);
  const approval = input.approval;
  if (
    !approval ||
    approval.status !== 'APPROVED' ||
    approval.worldId !== input.worldId ||
    approval.countryId !== input.countryId ||
    approval.payloadFingerprint !== fingerprint ||
    !stable(approval.version) ||
    !stable(approval.policyVersion) ||
    !Array.isArray(approval.requiredOffices) ||
    !Array.isArray(approval.signatures) ||
    !approval.requiredOffices.includes(context.officeId) ||
    approval.requiredOffices.length === 0 ||
    new Set(approval.requiredOffices).size !==
      approval.requiredOffices.length ||
    approval.requiredOffices.some(
      (office) => !CANONICAL_OFFICE_IDS.includes(office),
    ) ||
    approval.requiredOffices.some(
      (office) =>
        approval.signatures.filter((signature) => signature.officeId === office)
          .length !== 1,
    ) ||
    approval.signatures.length !== approval.requiredOffices.length ||
    !approval.signatures.some(
      (signature) =>
        signature.officeId === context.officeId &&
        signature.authSubject === context.authSubject &&
        signature.authorizationVersion === context.authorizationVersion,
    )
  ) {
    return unavailable('APPROVAL_UNAVAILABLE');
  }
  return Object.freeze({
    status: 'CANDIDATE_ONLY',
    candidateKind: 'RESOURCE_ALLOCATION_COMMAND_INTENT',
    intent: detachedIntent,
    hashInput,
    fingerprint,
    requiredAuthoritativeChecks: Object.freeze([
      'COMMAND_AUTHORIZATION',
      'APPROVAL_AT_COMMIT',
      'FUNDING_AT_COMMIT',
      'INVENTORY_AT_COMMIT',
      'WORLD_VERSION_AT_COMMIT',
    ] as const),
  });
}
