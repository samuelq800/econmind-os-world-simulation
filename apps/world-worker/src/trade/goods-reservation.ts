import {
  COMMODITY_REGISTRY,
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  OFFICE_APPROVAL_CAPABILITY,
  Price,
  Quantity,
  canonicalSerialize,
  classifyCommandIdentity,
  createAuthoritativeTransition,
  createInventoryAccount,
  createReservationPosting,
  eventId,
  inventoryPostingId,
  inventoryReservationId,
  parseAuthoritativeEvent,
  reauthorizeOfficeCapability,
  reauthorizeOfficeDecision,
  rebuildV08LedgersFromLineage,
  validateCanonicalCommand,
  type ApprovalProposal,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type CountryId,
  type InventoryAccount,
  type OfficeId,
  type OpeningSeed,
  type Sha256Hex,
  type V08AuthoritativeLedgerTransition,
} from '../../../../packages/core/src/index.js';

export interface GoodsReservationPolicy {
  readonly policyVersion: string;
  /** Server configuration reference, never read from the submitted payload. */
  readonly approvalRecord: string;
  readonly requiredSignatures: readonly Readonly<{
    countryId: CountryId;
    officeId: OfficeId;
  }>[];
}

export interface GoodsReservationApproval {
  /** Loaded from the authoritative proposal store, not client JSON. */
  readonly proposal: ApprovalProposal;
  readonly contexts: readonly AuthorizedOfficeContext[];
}

export interface GoodsReservationInput {
  readonly command: CanonicalCommand;
  readonly seed: OpeningSeed;
  readonly lineage: readonly V08AuthoritativeLedgerTransition[];
  readonly source: InventoryAccount;
  readonly commandContext: AuthorizedOfficeContext;
  readonly policy: GoodsReservationPolicy | null;
  readonly approvals: readonly GoodsReservationApproval[];
  readonly recordedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}

function deny(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    deny('Trade terms must be records');
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    deny('Trade terms require nonempty strings');
  return value;
}

function signatureKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0)
    deny('Country/Office signatures are required');
  const keys = value.map((item: unknown) => {
    const entry = record(item);
    if (Object.keys(entry).sort().join(',') !== 'countryId,officeId')
      deny('Invalid required signature shape');
    return `${string(entry.countryId)}:${string(entry.officeId)}`;
  });
  if (new Set(keys).size !== keys.length) deny('Duplicate required Office');
  return keys.sort();
}

/**
 * Runs inside the server's private candidate phase. This is NOT a committed
 * reservation or a replacement for the V09 transaction and final auth guard.
 * No default policy is installed while ADR-09 approval remains outstanding.
 */
export async function prepareGoodsReservation(input: GoodsReservationInput) {
  const command = validateCanonicalCommand(input.command, input.sha256Hex);
  const terms = record(JSON.parse(command.canonicalPayload) as unknown);
  if (
    Object.keys(terms).sort().join(',') !==
    'buyerCountryId,commodityId,paymentSource,policyVersion,price,quantity,requiredSignatures,sellerCountryId'
  )
    deny('Unsupported trade terms');
  const seller = string(terms.sellerCountryId);
  const buyer = string(terms.buyerCountryId);
  if (
    command.commandType !== 'CORE_GOODS_TRANSFER_V1' ||
    command.countryId !== seller ||
    command.officeId !== 'TRADE' ||
    command.expectedWorldVersion === null ||
    command.idempotencyKey === null ||
    seller === buyer ||
    terms.commodityId !== 'GRAIN' ||
    terms.paymentSource !== 'BUYER_TREASURY_GCU'
  )
    deny('Command is outside the narrow goods reservation contract');

  // Snapshot the trusted policy before any asynchronous authorization reads.
  const policy =
    input.policy === null
      ? null
      : {
          policyVersion: input.policy.policyVersion,
          approvalRecord: input.policy.approvalRecord,
          requiredSignatures: input.policy.requiredSignatures.map((item) => ({
            ...item,
          })),
        };
  if (
    policy === null ||
    policy.approvalRecord.trim() === '' ||
    policy.policyVersion !== terms.policyVersion
  )
    deny('A matching server-approved Office policy is required');
  const required = signatureKeys(policy.requiredSignatures);
  if (
    canonicalSerialize(required) !==
      canonicalSerialize(signatureKeys(terms.requiredSignatures)) ||
    !required.includes(`${seller}:TRADE`) ||
    !required.includes(`${buyer}:TRADE`) ||
    !required.includes(`${buyer}:FINANCE`) ||
    policy.requiredSignatures.some(
      (item) => item.countryId !== seller && item.countryId !== buyer,
    )
  )
    deny('Trade signatures do not match the server policy');

  const q = record(terms.quantity);
  const p = record(terms.price);
  if (
    Object.keys(q).sort().join(',') !== 'amount,unit' ||
    Object.keys(p).sort().join(',') !== 'amount,currency,perUnit'
  )
    deny('Invalid quantity or price shape');
  const quantity = Quantity.from(string(q.amount), string(q.unit));
  const price = Price.from(
    string(p.amount),
    string(p.currency),
    string(p.perUnit),
  );
  const commodity = COMMODITY_REGISTRY.get('GRAIN');
  if (
    !quantity.amount.isPositive() ||
    !price.amount.isPositive() ||
    quantity.unit !== commodity.unit ||
    price.currency !== 'GCU' ||
    price.perUnit !== quantity.unit ||
    canonicalSerialize(q) !== canonicalSerialize(quantity.toCanonicalValue()) ||
    canonicalSerialize(p) !== canonicalSerialize(price.toCanonicalValue())
  )
    deny(
      'Trade requires positive canonical registered quantities and GCU price',
    );
  const settlementAmount = price.multiply(quantity);

  const current = await reauthorizeOfficeCapability(input.commandContext);
  if (
    current.authSubject !== command.authSubject ||
    current.worldId !== command.worldId ||
    current.countryId !== seller ||
    current.officeId !== 'TRADE' ||
    current.capability !== 'TRADE_CONTRACTS'
  )
    deny('Current command authority does not match the seller intent');
  if (input.approvals.length !== 2) deny('Both country proposals are required');
  const seenCountries = new Set<string>();
  for (const approval of input.approvals) {
    const proposal = approval.proposal;
    const countryRequired = policy.requiredSignatures
      .filter((item) => item.countryId === proposal.countryId)
      .map((item) => item.officeId)
      .sort();
    if (
      seenCountries.has(proposal.countryId) ||
      countryRequired.length === 0 ||
      proposal.status !== 'APPROVED' ||
      proposal.worldId !== command.worldId ||
      proposal.payloadFingerprint !== command.fingerprint ||
      proposal.policyVersion !== policy.policyVersion ||
      canonicalSerialize([...proposal.requiredOffices].sort()) !==
        canonicalSerialize(countryRequired) ||
      proposal.signatures.length !== countryRequired.length ||
      approval.contexts.length !== countryRequired.length
    )
      deny('Proposal is incomplete, stale, or not bound to this trade');
    seenCountries.add(proposal.countryId);
    const seenOffices = new Set<string>();
    for (const signature of proposal.signatures) {
      if (seenOffices.has(signature.officeId))
        deny('Duplicate Office signature');
      seenOffices.add(signature.officeId);
      const contexts = approval.contexts.filter(
        (context) => context.officeId === signature.officeId,
      );
      if (contexts.length !== 1)
        deny('Each signature requires its current server context');
      const context = await reauthorizeOfficeDecision(contexts[0], {
        proposalId: proposal.id,
        proposalVersion: proposal.version,
        worldId: proposal.worldId,
        countryId: proposal.countryId,
        payloadFingerprint: proposal.payloadFingerprint,
        policyVersion: proposal.policyVersion,
        requiredOffices: proposal.requiredOffices,
      });
      if (
        context.capability !== OFFICE_APPROVAL_CAPABILITY ||
        context.authSubject !== signature.authSubject ||
        context.authorizationVersion !== signature.authorizationVersion
      )
        deny('Signed authorization has been replaced or revoked');
    }
    if (
      canonicalSerialize([...seenOffices].sort()) !==
      canonicalSerialize(countryRequired)
    )
      deny('Missing required Office signature');
  }

  const prior = rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions: input.lineage,
    sha256Hex: input.sha256Hex,
  });
  if (
    classifyCommandIdentity(
      input.lineage.map((item) => item.command),
      command,
    ).kind !== 'NEW'
  )
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Duplicate must resolve through its durable receipt, not reserve again',
    );
  if (
    input.seed.worldId !== command.worldId ||
    prior.worldVersion !== command.expectedWorldVersion
  )
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Reservation requires the current World version',
    );
  const source = createInventoryAccount(input.source);
  if (
    source.worldId !== command.worldId ||
    source.countryId !== seller ||
    source.commodityId !== terms.commodityId ||
    source.bucket !== 'AVAILABLE' ||
    source.unit !== quantity.unit
  )
    deny('Reservation source must be the seller available inventory');
  const suffix = command.fingerprint.slice('sha256:'.length).toUpperCase();
  const reserved = createInventoryAccount({
    ...source,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId(`RESERVATION_${suffix}`),
  });
  const after = (BigInt(prior.worldVersion) + 1n).toString();
  const sequence = (
    input.lineage.reduce(
      (n, item) => n + BigInt(item.transition.events.length),
      0n,
    ) + 1n
  ).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: eventId(`RESERVATION_EVENT_${suffix}`),
      eventType: 'GOODS_RESERVED_V1',
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      sequence,
      worldVersion: after,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: input.recordedAtReal,
      payload: {
        commandFingerprint: command.fingerprint,
        reservationId: reserved.reservationId,
        terms,
        source,
        reserved,
        policyApprovalRecord: policy.approvalRecord,
      },
    },
    input.sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: prior.worldVersion,
    worldVersionAfter: after,
    events: [event],
  });
  const posting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(`RESERVATION_POSTING_${suffix}`),
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: prior.worldVersion,
      worldVersionAfter: after,
      simTime: command.simTime,
      command,
      transition,
      quantity,
      source,
      destination: reserved,
    },
    input.sha256Hex,
  );
  const ledgerTransition: V08AuthoritativeLedgerTransition = Object.freeze({
    command,
    transition,
    inventoryPostings: Object.freeze([posting]),
    financialPostingBatches: Object.freeze([]),
  });
  const nextLedgers = rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions: [...input.lineage, ledgerTransition],
    sha256Hex: input.sha256Hex,
  });
  return Object.freeze({
    status: 'CANDIDATE_NOT_COMMITTED' as const,
    command,
    ledgerTransition,
    posting,
    source,
    reserved,
    quantity,
    price,
    settlementAmount,
    nextLedgers,
  });
}
