import {
  createApprovalProposal,
  type ApprovalProposal,
} from '../authorization/approvals.js';
import {
  OFFICE_APPROVAL_CAPABILITY,
  reauthorizeOfficeDecision,
  type AuthorizedOfficeContext,
} from '../authorization/offices.js';
import type { CanonicalCommand, Sha256Hex } from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  commodityId,
  countryId,
  economicRecognitionId,
  eventId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryReservationId,
  legalEntityId,
  officeId,
  type ActorId,
  type EconomicRecognitionId,
  type EventId,
  type InventoryBatchId,
  type InventoryLocationId,
  type InventoryPostingId,
  type InventoryReservationId,
  type LegalEntityId,
  type ProposalId,
} from '../ids.js';
import {
  applyInventoryPosting,
  createInventoryAccount,
  createReservationPosting,
  INVENTORY_POSTING_SCHEMA_VERSION,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryPostingResult,
} from '../inventory/inventory-ledger.js';
import { Price, Quantity, type SimTime } from '../numeric/index.js';
import { COMMODITY_REGISTRY } from '../registries/fixed-catalog.js';
import type { AuthoritativeTransition } from '../commands/receipt.js';

/**
 * ADR-09 deliberately releases one narrow, below-threshold fixture.  This is
 * not a generic commodity or payment-policy resolver: another commodity,
 * instrument, or approval matrix needs a new decision and implementation.
 */
export const NARROW_TREASURY_GCU_COMMAND_TYPE =
  'CORE_GOODS_TRANSFER_V1' as const;
export const NARROW_TREASURY_GCU_PAYLOAD_SCHEMA =
  'core-goods-transfer-v1' as const;
export const NARROW_TREASURY_GCU_POLICY_VERSION =
  'V10_TREASURY_GCU_V1' as const;
export const NARROW_TREASURY_GCU_PAYMENT_SOURCE = 'BUYER_TREASURY_GCU' as const;
export const NARROW_TREASURY_GCU_COMMODITY = 'GRAIN' as const;

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const PROPOSAL_VERSION = /^[A-Z][A-Z0-9_]*$/u;

type JsonRecord = Readonly<Record<string, unknown>>;

export interface NarrowTreasuryGcuTransferTerms {
  readonly schemaVersion: typeof NARROW_TREASURY_GCU_PAYLOAD_SCHEMA;
  readonly commodityId: typeof NARROW_TREASURY_GCU_COMMODITY;
  readonly sellerCountryId: ReturnType<typeof countryId>;
  readonly buyerCountryId: ReturnType<typeof countryId>;
  readonly quantity: Quantity;
  readonly price: Price;
  readonly assetSource: Readonly<{
    readonly batchId: InventoryBatchId;
    readonly physicalLocationId: InventoryLocationId;
    readonly titleHolderId: LegalEntityId;
    readonly riskBearerId: LegalEntityId;
    readonly economicRecognitionId: EconomicRecognitionId | null;
  }>;
  readonly paymentSource: typeof NARROW_TREASURY_GCU_PAYMENT_SOURCE;
  readonly policyVersion: typeof NARROW_TREASURY_GCU_POLICY_VERSION;
  readonly expiresAtReal: string;
}

export interface NarrowTransferApprovalBundle {
  readonly command: CanonicalCommand;
  readonly terms: NarrowTreasuryGcuTransferTerms;
  readonly seller: ApprovalProposal;
  readonly buyer: ApprovalProposal;
}

export interface NarrowTransferApprovalContexts {
  readonly sellerTrade: Readonly<{
    readonly actorId: ActorId;
    readonly context: AuthorizedOfficeContext;
  }>;
  readonly buyerTrade: Readonly<{
    readonly actorId: ActorId;
    readonly context: AuthorizedOfficeContext;
  }>;
  readonly buyerFinance: Readonly<{
    readonly actorId: ActorId;
    readonly context: AuthorizedOfficeContext;
  }>;
}

export interface NarrowTransferReservation {
  readonly posting: ReturnType<typeof createReservationPosting>;
  readonly inventory: Readonly<InventoryPostingResult>;
}

function deny(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID, message);
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid(`${label} has an unsupported or missing field`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalTimestamp(value: string, label: string): number {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(`${label} must be canonical RFC3339 UTC milliseconds`);
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    invalid(`${label} must be a valid UTC timestamp`);
  }
  return milliseconds;
}

function parseQuantity(value: unknown): Quantity {
  const quantity = record(value, 'quantity');
  exactKeys(quantity, ['amount', 'unit'], 'quantity');
  const parsed = Quantity.from(
    requiredString(quantity.amount, 'quantity.amount'),
    requiredString(quantity.unit, 'quantity.unit'),
  );
  if (!parsed.amount.isPositive())
    invalid('quantity must be strictly positive');
  return parsed;
}

function parsePrice(value: unknown): Price {
  const price = record(value, 'price');
  exactKeys(price, ['amount', 'currency', 'perUnit'], 'price');
  const parsed = Price.from(
    requiredString(price.amount, 'price.amount'),
    requiredString(price.currency, 'price.currency'),
    requiredString(price.perUnit, 'price.perUnit'),
  );
  if (!parsed.amount.isPositive()) invalid('price must be strictly positive');
  return parsed;
}

function parseAssetSource(
  value: unknown,
): NarrowTreasuryGcuTransferTerms['assetSource'] {
  const assetSource = record(value, 'assetSource');
  exactKeys(
    assetSource,
    [
      'batchId',
      'economicRecognitionId',
      'physicalLocationId',
      'riskBearerId',
      'titleHolderId',
    ],
    'assetSource',
  );
  const recognition = assetSource.economicRecognitionId;
  if (recognition !== null && typeof recognition !== 'string') {
    invalid('assetSource.economicRecognitionId must be a string or null');
  }
  return Object.freeze({
    batchId: inventoryBatchId(
      requiredString(assetSource.batchId, 'assetSource.batchId'),
    ),
    physicalLocationId: inventoryLocationId(
      requiredString(
        assetSource.physicalLocationId,
        'assetSource.physicalLocationId',
      ),
    ),
    titleHolderId: legalEntityId(
      requiredString(assetSource.titleHolderId, 'assetSource.titleHolderId'),
    ),
    riskBearerId: legalEntityId(
      requiredString(assetSource.riskBearerId, 'assetSource.riskBearerId'),
    ),
    economicRecognitionId:
      recognition === null ? null : economicRecognitionId(recognition),
  });
}

function parsePayload(command: CanonicalCommand): JsonRecord {
  try {
    return record(JSON.parse(command.canonicalPayload), 'Command payload');
  } catch (error) {
    if (error instanceof DomainError) throw error;
    invalid('Command payload must be valid JSON');
  }
}

function proposalScope(proposal: ApprovalProposal) {
  return Object.freeze({
    proposalId: proposal.id,
    proposalVersion: proposal.version,
    worldId: proposal.worldId,
    countryId: proposal.countryId,
    payloadFingerprint: proposal.payloadFingerprint,
    policyVersion: proposal.policyVersion,
    requiredOffices: proposal.requiredOffices,
  });
}

function assertProposal(
  proposal: ApprovalProposal,
  input: {
    readonly command: CanonicalCommand;
    readonly countryId: ReturnType<typeof countryId>;
    readonly expectedOffices: readonly ReturnType<typeof officeId>[];
  },
): void {
  if (
    proposal.worldId !== input.command.worldId ||
    proposal.countryId !== input.countryId ||
    proposal.payloadFingerprint !== input.command.fingerprint ||
    proposal.policyVersion !== NARROW_TREASURY_GCU_POLICY_VERSION ||
    proposal.requiredOffices.length !== input.expectedOffices.length ||
    input.expectedOffices.some(
      (office) => !proposal.requiredOffices.includes(office),
    ) ||
    proposal.status !== 'APPROVED' ||
    proposal.signatures.length !== input.expectedOffices.length ||
    proposal.signatures.some(
      (signature) => !input.expectedOffices.includes(signature.officeId),
    ) ||
    new Set(proposal.signatures.map((signature) => signature.officeId)).size !==
      proposal.signatures.length
  ) {
    deny('Transfer approval does not match the ADR-09 bound proposal');
  }
}

async function reauthorizeSignature(input: {
  readonly proposal: ApprovalProposal;
  readonly expectedOffice: ReturnType<typeof officeId>;
  readonly actorId: ActorId;
  readonly context: AuthorizedOfficeContext;
}): Promise<void> {
  const signature = input.proposal.signatures.find(
    (candidate) => candidate.officeId === input.expectedOffice,
  );
  if (signature === undefined) deny('Required Office signature is absent');
  const current = await reauthorizeOfficeDecision(
    input.context,
    proposalScope(input.proposal),
  );
  if (
    current.capability !== OFFICE_APPROVAL_CAPABILITY ||
    current.officeId !== input.expectedOffice ||
    current.countryId !== input.proposal.countryId ||
    current.worldId !== input.proposal.worldId ||
    signature.actorId !== input.actorId ||
    signature.authSubject !== current.authSubject ||
    signature.authorizationVersion !== current.authorizationVersion
  ) {
    deny(
      'Required Office signature is stale, revoked, or held by another actor',
    );
  }
}

function assertReservationSource(input: {
  readonly source: InventoryAccount;
  readonly command: CanonicalCommand;
  readonly terms: NarrowTreasuryGcuTransferTerms;
}): Readonly<InventoryAccount> {
  const source = createInventoryAccount(input.source);
  if (
    source.worldId !== input.command.worldId ||
    source.countryId !== input.terms.sellerCountryId ||
    source.commodityId !== input.terms.commodityId ||
    source.unit !== input.terms.quantity.unit ||
    source.batchId !== input.terms.assetSource.batchId ||
    source.physicalLocationId !== input.terms.assetSource.physicalLocationId ||
    source.titleHolderId !== input.terms.assetSource.titleHolderId ||
    source.riskBearerId !== input.terms.assetSource.riskBearerId ||
    source.economicRecognitionId !==
      input.terms.assetSource.economicRecognitionId ||
    source.bucket !== 'AVAILABLE' ||
    source.reservationId !== null ||
    source.shipmentId !== null
  ) {
    deny(
      'Reservation source is not the seller available account bound by terms',
    );
  }
  return source;
}

/** Parses only the exact ADR-09 below-threshold Treasury-GCU fixture. */
export function parseNarrowTreasuryGcuTransferTerms(
  command: CanonicalCommand,
): Readonly<NarrowTreasuryGcuTransferTerms> {
  if (
    command.commandType !== NARROW_TREASURY_GCU_COMMAND_TYPE ||
    command.officeId !== officeId('TRADE')
  ) {
    invalid('Command is not a Seller Trade narrow Treasury-GCU transfer');
  }
  const payload = parsePayload(command);
  exactKeys(
    payload,
    [
      'assetSource',
      'buyerCountryId',
      'commodityId',
      'expiresAtReal',
      'paymentSource',
      'policyVersion',
      'price',
      'quantity',
      'schemaVersion',
      'sellerCountryId',
    ],
    'Narrow transfer payload',
  );
  if (
    payload.schemaVersion !== NARROW_TREASURY_GCU_PAYLOAD_SCHEMA ||
    payload.commodityId !== NARROW_TREASURY_GCU_COMMODITY ||
    payload.paymentSource !== NARROW_TREASURY_GCU_PAYMENT_SOURCE ||
    payload.policyVersion !== NARROW_TREASURY_GCU_POLICY_VERSION
  ) {
    invalid('Transfer payload is outside the approved Treasury-GCU fixture');
  }
  const sellerCountryId = countryId(
    requiredString(payload.sellerCountryId, 'sellerCountryId'),
  );
  const buyerCountryId = countryId(
    requiredString(payload.buyerCountryId, 'buyerCountryId'),
  );
  if (
    sellerCountryId !== command.countryId ||
    sellerCountryId === buyerCountryId
  ) {
    invalid('Transfer countries must be distinct and match the Seller command');
  }
  const quantity = parseQuantity(payload.quantity);
  const price = parsePrice(payload.price);
  const assetSource = parseAssetSource(payload.assetSource);
  const registeredCommodity = COMMODITY_REGISTRY.get(
    commodityId(NARROW_TREASURY_GCU_COMMODITY),
  );
  if (
    registeredCommodity.id !== NARROW_TREASURY_GCU_COMMODITY ||
    registeredCommodity.unit !== quantity.unit ||
    price.currency !== 'GCU' ||
    price.perUnit !== quantity.unit
  ) {
    invalid('Transfer does not use the approved registered GRAIN/GCU terms');
  }
  const expiresAtReal = requiredString(payload.expiresAtReal, 'expiresAtReal');
  if (
    canonicalTimestamp(expiresAtReal, 'expiresAtReal') <=
    canonicalTimestamp(command.submittedAtReal, 'submittedAtReal')
  ) {
    invalid('Transfer expiry must be canonical and after command submission');
  }
  return Object.freeze({
    schemaVersion: NARROW_TREASURY_GCU_PAYLOAD_SCHEMA,
    commodityId: NARROW_TREASURY_GCU_COMMODITY,
    sellerCountryId,
    buyerCountryId,
    quantity,
    price,
    assetSource,
    paymentSource: NARROW_TREASURY_GCU_PAYMENT_SOURCE,
    policyVersion: NARROW_TREASURY_GCU_POLICY_VERSION,
    expiresAtReal,
  });
}

/**
 * Creates the two country-scoped approval records.  The caller persists these
 * records; they are not a browser credential and they carry no reservation.
 */
export function createNarrowTransferApprovalBundle(input: {
  readonly command: CanonicalCommand;
  readonly sellerProposalId: ProposalId;
  readonly buyerProposalId: ProposalId;
  readonly proposalVersion: string;
}): Readonly<NarrowTransferApprovalBundle> {
  const terms = parseNarrowTreasuryGcuTransferTerms(input.command);
  if (
    !PROPOSAL_VERSION.test(input.proposalVersion) ||
    input.sellerProposalId === input.buyerProposalId
  ) {
    invalid('Transfer proposal identities and version must be canonical');
  }
  const seller = createApprovalProposal({
    id: input.sellerProposalId,
    version: input.proposalVersion,
    worldId: input.command.worldId,
    countryId: terms.sellerCountryId,
    payloadFingerprint: input.command.fingerprint,
    resolution: {
      policyVersion: terms.policyVersion,
      requiredOffices: [officeId('TRADE')],
    },
  });
  const buyer = createApprovalProposal({
    id: input.buyerProposalId,
    version: input.proposalVersion,
    worldId: input.command.worldId,
    countryId: terms.buyerCountryId,
    payloadFingerprint: input.command.fingerprint,
    resolution: {
      policyVersion: terms.policyVersion,
      requiredOffices: [officeId('TRADE'), officeId('FINANCE')],
    },
  });
  return Object.freeze({ command: input.command, terms, seller, buyer });
}

/**
 * Re-resolves each individual signer.  A persisted `APPROVED` status alone is
 * never a credential: stale membership, changed revision, or an altered scope
 * denies the reservation before a posting is created.
 */
export async function assertNarrowTransferApprovalsCurrent(input: {
  readonly approvals: NarrowTransferApprovalBundle;
  readonly contexts: NarrowTransferApprovalContexts;
  readonly atReal: string;
}): Promise<Readonly<NarrowTreasuryGcuTransferTerms>> {
  const terms = parseNarrowTreasuryGcuTransferTerms(input.approvals.command);
  const reservationTime = canonicalTimestamp(input.atReal, 'Reservation time');
  if (
    input.approvals.terms.sellerCountryId !== terms.sellerCountryId ||
    input.approvals.terms.buyerCountryId !== terms.buyerCountryId ||
    input.approvals.terms.quantity.toCanonicalValue().amount !==
      terms.quantity.toCanonicalValue().amount ||
    input.approvals.terms.quantity.unit !== terms.quantity.unit ||
    input.approvals.terms.price.toCanonicalValue().amount !==
      terms.price.toCanonicalValue().amount ||
    input.approvals.terms.price.currency !== terms.price.currency ||
    input.approvals.terms.price.perUnit !== terms.price.perUnit ||
    input.approvals.terms.assetSource.batchId !== terms.assetSource.batchId ||
    input.approvals.terms.assetSource.physicalLocationId !==
      terms.assetSource.physicalLocationId ||
    input.approvals.terms.assetSource.titleHolderId !==
      terms.assetSource.titleHolderId ||
    input.approvals.terms.assetSource.riskBearerId !==
      terms.assetSource.riskBearerId ||
    input.approvals.terms.assetSource.economicRecognitionId !==
      terms.assetSource.economicRecognitionId ||
    input.approvals.terms.paymentSource !== terms.paymentSource ||
    input.approvals.terms.policyVersion !== terms.policyVersion ||
    input.approvals.terms.expiresAtReal !== terms.expiresAtReal ||
    reservationTime >= canonicalTimestamp(terms.expiresAtReal, 'expiresAtReal')
  ) {
    deny('Transfer terms are stale or do not match their canonical Command');
  }
  assertProposal(input.approvals.seller, {
    command: input.approvals.command,
    countryId: terms.sellerCountryId,
    expectedOffices: [officeId('TRADE')],
  });
  assertProposal(input.approvals.buyer, {
    command: input.approvals.command,
    countryId: terms.buyerCountryId,
    expectedOffices: [officeId('TRADE'), officeId('FINANCE')],
  });
  await reauthorizeSignature({
    proposal: input.approvals.seller,
    expectedOffice: officeId('TRADE'),
    actorId: input.contexts.sellerTrade.actorId,
    context: input.contexts.sellerTrade.context,
  });
  await reauthorizeSignature({
    proposal: input.approvals.buyer,
    expectedOffice: officeId('TRADE'),
    actorId: input.contexts.buyerTrade.actorId,
    context: input.contexts.buyerTrade.context,
  });
  await reauthorizeSignature({
    proposal: input.approvals.buyer,
    expectedOffice: officeId('FINANCE'),
    actorId: input.contexts.buyerFinance.actorId,
    context: input.contexts.buyerFinance.context,
  });
  return terms;
}

/**
 * Produces one exact AVAILABLE -> RESERVED posting and applies it only to an
 * authoritative inventory state. Persistence remains the V09 atomic writer's
 * responsibility; this function cannot grant a caller a writable ledger.
 */
export async function reserveNarrowTreasuryGcuTransfer(input: {
  readonly approvals: NarrowTransferApprovalBundle;
  readonly contexts: NarrowTransferApprovalContexts;
  readonly atReal: string;
  readonly inventoryState: InventoryLedgerState;
  readonly source: InventoryAccount;
  readonly reservationId: InventoryReservationId;
  readonly postingId: InventoryPostingId;
  readonly transition: AuthoritativeTransition;
  readonly simTime: SimTime;
  readonly causationEventIds: readonly EventId[];
  readonly sha256Hex: Sha256Hex;
}): Promise<Readonly<NarrowTransferReservation>> {
  const terms = await assertNarrowTransferApprovalsCurrent({
    approvals: input.approvals,
    contexts: input.contexts,
    atReal: input.atReal,
  });
  const source = assertReservationSource({
    source: input.source,
    command: input.approvals.command,
    terms,
  });
  if (input.inventoryState.worldId !== input.approvals.command.worldId) {
    deny('Inventory state belongs to another World');
  }
  const destination = createInventoryAccount({
    ...source,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId(input.reservationId),
    shipmentId: null,
  });
  const posting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: input.postingId,
      worldId: input.approvals.command.worldId,
      causationCommandId: input.approvals.command.commandId,
      causationEventIds: input.causationEventIds.map((identity) =>
        eventId(identity),
      ),
      worldVersionBefore: input.transition.worldVersionBefore,
      worldVersionAfter: input.transition.worldVersionAfter,
      simTime: input.simTime,
      command: input.approvals.command,
      transition: input.transition,
      quantity: terms.quantity,
      source,
      destination,
    },
    input.sha256Hex,
  );
  const existing = input.inventoryState.appliedPostings.find(
    (candidate) => candidate.postingId === posting.postingId,
  );
  if (existing === undefined) {
    const reservationInUse = input.inventoryState.balances.some(
      (balance) => balance.account.reservationId === destination.reservationId,
    );
    if (reservationInUse) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        'Reservation identity is already bound to a different posting',
      );
    }
  }
  return Object.freeze({
    posting,
    inventory: applyInventoryPosting(input.inventoryState, posting),
  });
}
