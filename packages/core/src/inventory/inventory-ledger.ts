import {
  canonicalSha256,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  type AuthoritativeTransition,
  type AuthoritativeTransitionBinding,
} from '../commands/receipt.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  commandId,
  commodityId,
  countryId,
  economicRecognitionId,
  eventId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  inventoryShipmentId,
  legalEntityId,
  worldId,
  type CommandId,
  type CommodityId,
  type CountryId,
  type EconomicRecognitionId,
  type EventId,
  type InventoryBatchId,
  type InventoryLocationId,
  type InventoryPostingId,
  type InventoryReservationId,
  type InventoryShipmentId,
  type LegalEntityId,
  type WorldId,
} from '../ids.js';
import { Quantity } from '../numeric/quantity.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  authorizeInventoryLedgerState,
  isAuthoritativeInventoryLedgerState,
  type InventoryLedgerAuthority,
} from '../opening/ledger-authority.js';

export const INVENTORY_LEDGER_SCHEMA_VERSION = 'inventory-ledger-v1' as const;
export const INVENTORY_POSTING_SCHEMA_VERSION = 'inventory-posting-v1' as const;
export const INVENTORY_AUTHORITATIVE_WRITER =
  'WORLD_INVENTORY_POSTING' as const;

export type InventoryBucket = 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT';
export type InventoryOperation = 'RESERVE' | 'RELEASE' | 'SHIP' | 'DELIVER';

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const BUCKETS: readonly InventoryBucket[] = Object.freeze([
  'AVAILABLE',
  'IN_TRANSIT',
  'RESERVED',
]);
const OPERATIONS: readonly InventoryOperation[] = Object.freeze([
  'DELIVER',
  'RELEASE',
  'RESERVE',
  'SHIP',
]);
const inventoryPostingInstances = new WeakSet<object>();
const CANONICAL_SHA256 = /^sha256:[0-9a-f]{64}$/u;

export interface InventoryAccount {
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly commodityId: CommodityId;
  readonly batchId: InventoryBatchId;
  readonly unit: string;
  readonly physicalLocationId: InventoryLocationId;
  readonly bucket: InventoryBucket;
  readonly reservationId: InventoryReservationId | null;
  readonly shipmentId: InventoryShipmentId | null;
  readonly titleHolderId: LegalEntityId;
  readonly riskBearerId: LegalEntityId;
  readonly economicRecognitionId: EconomicRecognitionId | null;
}

export interface InventoryPostingEntry {
  readonly account: Readonly<InventoryAccount>;
  readonly delta: Quantity;
}

export interface InventoryPosting {
  readonly schemaVersion: typeof INVENTORY_POSTING_SCHEMA_VERSION;
  readonly postingId: InventoryPostingId;
  readonly worldId: WorldId;
  readonly causationCommandId: CommandId;
  readonly causationEventIds: readonly EventId[];
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: SimTime;
  readonly transitionBinding: Readonly<AuthoritativeTransitionBinding>;
  readonly operation: InventoryOperation;
  readonly entries: readonly Readonly<InventoryPostingEntry>[];
  readonly fingerprint: CanonicalSha256;
}

export interface InventoryBalance {
  readonly account: Readonly<InventoryAccount>;
  readonly quantity: Quantity;
}

export interface AppliedInventoryPosting {
  readonly postingId: InventoryPostingId;
  readonly fingerprint: CanonicalSha256;
}

export interface InventoryLedgerSnapshot {
  readonly schemaVersion: typeof INVENTORY_LEDGER_SCHEMA_VERSION;
  readonly worldId: WorldId;
  readonly worldVersion: string;
  readonly balances: readonly Readonly<InventoryBalance>[];
  readonly appliedPostings: readonly Readonly<AppliedInventoryPosting>[];
}

export type InventoryLedgerState = Readonly<
  InventoryLedgerSnapshot & InventoryLedgerAuthority
>;

export interface InventoryPostingReceipt {
  readonly postingId: InventoryPostingId;
  readonly fingerprint: CanonicalSha256;
  readonly outcome: 'APPLIED' | 'EXACT_DUPLICATE';
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly causationCommandId: CommandId;
  readonly causationEventIds: readonly EventId[];
}

export interface InventoryPostingResult {
  readonly state: Readonly<InventoryLedgerState>;
  readonly receipt: Readonly<InventoryPostingReceipt>;
}

export interface InventoryMovementInput {
  readonly schemaVersion: typeof INVENTORY_POSTING_SCHEMA_VERSION;
  readonly postingId: InventoryPostingId;
  readonly worldId: WorldId;
  readonly causationCommandId: CommandId;
  readonly causationEventIds: readonly EventId[];
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: SimTime;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly quantity: Quantity;
  readonly source: InventoryAccount;
  readonly destination: InventoryAccount;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID, message);
}

function canonicalVersion(value: string, label: string): string {
  if (!NON_NEGATIVE_INTEGER.test(value)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return value;
}

function validateAccount(input: InventoryAccount): Readonly<InventoryAccount> {
  const bucket = input.bucket;
  if (!BUCKETS.includes(bucket)) invalid('Unsupported inventory bucket');
  const reservationRequired = bucket === 'RESERVED';
  const shipmentRequired = bucket === 'IN_TRANSIT';
  if ((input.reservationId !== null) !== reservationRequired) {
    invalid('Only RESERVED inventory carries a reservation identity');
  }
  if ((input.shipmentId !== null) !== shipmentRequired) {
    invalid('Only IN_TRANSIT inventory carries a shipment identity');
  }
  const canonicalUnit = Quantity.from('0', input.unit).unit;
  return Object.freeze({
    worldId: worldId(input.worldId),
    countryId: countryId(input.countryId),
    commodityId: commodityId(input.commodityId),
    batchId: inventoryBatchId(input.batchId),
    unit: canonicalUnit,
    physicalLocationId: inventoryLocationId(input.physicalLocationId),
    bucket,
    reservationId:
      input.reservationId === null
        ? null
        : inventoryReservationId(input.reservationId),
    shipmentId:
      input.shipmentId === null ? null : inventoryShipmentId(input.shipmentId),
    titleHolderId: legalEntityId(input.titleHolderId),
    riskBearerId: legalEntityId(input.riskBearerId),
    economicRecognitionId:
      input.economicRecognitionId === null
        ? null
        : economicRecognitionId(input.economicRecognitionId),
  });
}

function accountKey(account: InventoryAccount): string {
  return canonicalSerialize(account);
}

function compareAccounts(left: InventoryAccount, right: InventoryAccount) {
  const leftKey = accountKey(left);
  const rightKey = accountKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function conservationKey(account: InventoryAccount): string {
  return canonicalSerialize({
    batchId: account.batchId,
    commodityId: account.commodityId,
    unit: account.unit,
    worldId: account.worldId,
  });
}

function validatePositive(quantity: Quantity, label: string): Quantity {
  if (!quantity.amount.isPositive()) {
    invalid(`${label} must be strictly positive`);
  }
  return quantity;
}

function immutableEntries(
  entries: readonly InventoryPostingEntry[],
  expectedWorldId: WorldId,
): readonly Readonly<InventoryPostingEntry>[] {
  if (entries.length < 2)
    invalid('Inventory posting needs at least two entries');
  const normalized = entries.map((entry) => {
    const account = validateAccount(entry.account);
    if (account.worldId !== expectedWorldId) {
      invalid('Every inventory entry must belong to the posting World');
    }
    if (entry.delta.amount.isZero()) {
      invalid('Inventory posting entries cannot have zero deltas');
    }
    if (entry.delta.unit !== account.unit) {
      invalid('Inventory entry quantity unit must match its account');
    }
    return Object.freeze({ account, delta: entry.delta });
  });
  normalized.sort((left, right) =>
    compareAccounts(left.account, right.account),
  );
  const keys = normalized.map((entry) => accountKey(entry.account));
  if (new Set(keys).size !== keys.length) {
    invalid('An inventory posting cannot repeat an account');
  }
  const totals = new Map<string, Quantity>();
  for (const entry of normalized) {
    const key = conservationKey(entry.account);
    const prior = totals.get(key) ?? Quantity.from('0', entry.delta.unit);
    totals.set(key, prior.add(entry.delta));
  }
  if ([...totals.values()].some((total) => !total.amount.isZero())) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.INVENTORY_CONSERVATION_VIOLATION,
      'Every posting must conserve exact quantity by World, commodity, batch and unit',
    );
  }
  return Object.freeze(normalized);
}

function validateOperationEntries(
  operation: InventoryOperation,
  entries: readonly Readonly<InventoryPostingEntry>[],
): void {
  if (entries.length !== 2) {
    invalid('V08.1 inventory movements require exactly two posting entries');
  }
  const source = entries.find((entry) => entry.delta.amount.isNegative());
  const destination = entries.find((entry) => entry.delta.amount.isPositive());
  if (source === undefined || destination === undefined) {
    invalid('Inventory movement requires one debit and one credit quantity');
  }
  const expectedBuckets: Record<
    InventoryOperation,
    readonly [InventoryBucket, InventoryBucket]
  > = {
    RESERVE: ['AVAILABLE', 'RESERVED'],
    RELEASE: ['RESERVED', 'AVAILABLE'],
    SHIP: ['RESERVED', 'IN_TRANSIT'],
    DELIVER: ['IN_TRANSIT', 'AVAILABLE'],
  };
  const [sourceBucket, destinationBucket] = expectedBuckets[operation];
  if (
    source.account.bucket !== sourceBucket ||
    destination.account.bucket !== destinationBucket
  ) {
    invalid(`${operation} requires ${sourceBucket} -> ${destinationBucket}`);
  }
  for (const field of ['worldId', 'commodityId', 'batchId', 'unit'] as const) {
    if (source.account[field] !== destination.account[field]) {
      invalid(`${operation} cannot change ${field}`);
    }
  }
  const identityFields = [
    'countryId',
    'titleHolderId',
    'riskBearerId',
    'economicRecognitionId',
  ] as const;
  if (operation !== 'DELIVER') {
    for (const field of identityFields) {
      if (source.account[field] !== destination.account[field]) {
        invalid(`${operation} cannot change ${field}`);
      }
    }
  }
  if (
    (operation === 'RESERVE' || operation === 'RELEASE') &&
    source.account.physicalLocationId !== destination.account.physicalLocationId
  ) {
    invalid(`${operation} cannot change physicalLocationId`);
  }
}

function immutableEventIds(values: readonly EventId[]): readonly EventId[] {
  if (values.length === 0) invalid('Posting requires causation Event evidence');
  const canonical = values.map((value) => eventId(value));
  if (new Set(canonical).size !== canonical.length) {
    invalid('Posting causation Event identities must be unique');
  }
  return Object.freeze(canonical);
}

export function createInventoryAccount(
  input: InventoryAccount,
): Readonly<InventoryAccount> {
  return validateAccount(input);
}

export function createInventoryPosting(
  input: Omit<
    InventoryPosting,
    'entries' | 'fingerprint' | 'transitionBinding'
  > & {
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
    readonly entries: readonly InventoryPostingEntry[];
  },
  sha256Hex: Sha256Hex,
): Readonly<InventoryPosting> {
  if (input.schemaVersion !== INVENTORY_POSTING_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported inventory posting schema version',
    );
  }
  if (!OPERATIONS.includes(input.operation)) {
    invalid('Unsupported inventory operation');
  }
  const before = BigInt(
    canonicalVersion(input.worldVersionBefore, 'worldVersionBefore'),
  );
  const after = BigInt(
    canonicalVersion(input.worldVersionAfter, 'worldVersionAfter'),
  );
  if (after !== before + 1n) {
    invalid('An inventory posting must advance WorldVersion exactly once');
  }
  if (!isSimTime(input.simTime)) invalid('Posting simTime must be a SimTime');
  const canonicalWorldId = worldId(input.worldId);
  const transitionBinding = bindAuthoritativeTransition(
    { command: input.command, transition: input.transition },
    sha256Hex,
  );
  const causationEventIds = immutableEventIds(input.causationEventIds);
  if (
    canonicalWorldId !== transitionBinding.worldId ||
    input.causationCommandId !== transitionBinding.commandId ||
    input.worldVersionBefore !== transitionBinding.worldVersionBefore ||
    input.worldVersionAfter !== transitionBinding.worldVersionAfter ||
    input.simTime.ticks !== transitionBinding.simTime.ticks ||
    causationEventIds.length !== transitionBinding.eventIds.length ||
    causationEventIds.some(
      (identity, index) => identity !== transitionBinding.eventIds[index],
    )
  ) {
    invalid('Posting must bind the complete authoritative V07 transition');
  }
  const entries = immutableEntries(input.entries, canonicalWorldId);
  validateOperationEntries(input.operation, entries);
  const intent = Object.freeze({
    schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
    postingId: inventoryPostingId(input.postingId),
    worldId: canonicalWorldId,
    causationCommandId: commandId(input.causationCommandId),
    causationEventIds,
    worldVersionBefore: input.worldVersionBefore,
    worldVersionAfter: input.worldVersionAfter,
    simTime: input.simTime,
    transitionBinding,
    operation: input.operation,
    entries,
  });
  const posting = Object.freeze({
    ...intent,
    fingerprint: canonicalSha256(canonicalHashInput(intent), sha256Hex),
  });
  inventoryPostingInstances.add(posting);
  return posting;
}

/** Parses untrusted checkpoint data. It never grants posting authority. */
export function parseInventoryLedgerSnapshot(input: {
  readonly worldId: WorldId;
  readonly worldVersion: string;
  readonly balances: readonly InventoryBalance[];
  readonly appliedPostings?: readonly AppliedInventoryPosting[];
}): Readonly<InventoryLedgerSnapshot> {
  const canonicalWorldId = worldId(input.worldId);
  const balances = input.balances.map((balance) => {
    const account = validateAccount(balance.account);
    if (account.worldId !== canonicalWorldId) {
      invalid('Hydrated inventory balance belongs to a different World');
    }
    if (balance.quantity.unit !== account.unit) {
      invalid('Hydrated quantity unit must match its account');
    }
    if (balance.quantity.amount.isNegative()) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVENTORY_NEGATIVE_STOCK,
        'Physical inventory cannot be negative',
      );
    }
    if (balance.quantity.amount.isZero()) {
      invalid('Hydrated inventory balances must omit zero quantities');
    }
    return Object.freeze({ account, quantity: balance.quantity });
  });
  balances.sort((left, right) => compareAccounts(left.account, right.account));
  const balanceKeys = balances.map((balance) => accountKey(balance.account));
  if (new Set(balanceKeys).size !== balanceKeys.length) {
    invalid('Hydrated inventory balances contain a duplicate account');
  }
  const postings = (input.appliedPostings ?? []).map((posting) =>
    (() => {
      if (!CANONICAL_SHA256.test(posting.fingerprint)) {
        invalid('Applied posting fingerprint must be canonical SHA-256');
      }
      return Object.freeze({
        postingId: inventoryPostingId(posting.postingId),
        fingerprint: posting.fingerprint,
      });
    })(),
  );
  if (
    new Set(postings.map((posting) => posting.postingId)).size !==
    postings.length
  ) {
    invalid('Hydrated applied postings contain duplicate identities');
  }
  const state = Object.freeze({
    schemaVersion: INVENTORY_LEDGER_SCHEMA_VERSION,
    worldId: canonicalWorldId,
    worldVersion: canonicalVersion(input.worldVersion, 'worldVersion'),
    balances: Object.freeze(balances),
    appliedPostings: Object.freeze(postings),
  });
  return state;
}

function receipt(
  posting: InventoryPosting,
  outcome: InventoryPostingReceipt['outcome'],
): Readonly<InventoryPostingReceipt> {
  return Object.freeze({
    postingId: posting.postingId,
    fingerprint: posting.fingerprint,
    outcome,
    worldVersionBefore: posting.worldVersionBefore,
    worldVersionAfter: posting.worldVersionAfter,
    causationCommandId: posting.causationCommandId,
    causationEventIds: posting.causationEventIds,
  });
}

/** @internal Per-projection step used only by the joint V08 lineage writer. */
export function applyInventoryPosting(
  state: InventoryLedgerState,
  posting: InventoryPosting,
): Readonly<InventoryPostingResult> {
  if (
    state.schemaVersion !== INVENTORY_LEDGER_SCHEMA_VERSION ||
    !isAuthoritativeInventoryLedgerState(state)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported inventory ledger schema version',
    );
  }
  if (!inventoryPostingInstances.has(posting)) {
    invalid('Inventory writer accepts validated canonical postings only');
  }
  const existing = state.appliedPostings.find(
    (candidate) => candidate.postingId === posting.postingId,
  );
  if (existing !== undefined) {
    if (existing.fingerprint !== posting.fingerprint) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVENTORY_POSTING_CONFLICT,
        'Inventory posting identity is bound to different canonical intent',
      );
    }
    return Object.freeze({
      state,
      receipt: receipt(posting, 'EXACT_DUPLICATE'),
    });
  }
  if (
    posting.worldId !== state.worldId ||
    posting.worldVersionBefore !== state.worldVersion
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.INVENTORY_POSTING_CONFLICT,
      'Inventory posting does not extend the current World ledger version',
    );
  }
  const byAccount = new Map(
    state.balances.map((balance) => [accountKey(balance.account), balance]),
  );
  for (const entry of posting.entries) {
    const key = accountKey(entry.account);
    const prior =
      byAccount.get(key)?.quantity ?? Quantity.from('0', entry.delta.unit);
    const next = prior.add(entry.delta);
    if (next.amount.isNegative()) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVENTORY_NEGATIVE_STOCK,
        'Inventory posting would make physical stock negative',
      );
    }
    if (next.amount.isZero()) byAccount.delete(key);
    else {
      byAccount.set(
        key,
        Object.freeze({ account: entry.account, quantity: next }),
      );
    }
  }
  const balances = [...byAccount.values()].sort((left, right) =>
    compareAccounts(left.account, right.account),
  );
  const nextState = Object.freeze({
    schemaVersion: INVENTORY_LEDGER_SCHEMA_VERSION,
    worldId: state.worldId,
    worldVersion: posting.worldVersionAfter,
    balances: Object.freeze(balances),
    appliedPostings: Object.freeze([
      ...state.appliedPostings,
      Object.freeze({
        postingId: posting.postingId,
        fingerprint: posting.fingerprint,
      }),
    ]),
  });
  const authoritativeNextState = authorizeInventoryLedgerState(nextState);
  return Object.freeze({
    state: authoritativeNextState,
    receipt: receipt(posting, 'APPLIED'),
  });
}

function movementPosting(
  input: InventoryMovementInput,
  operation: InventoryOperation,
  sourceBucket: InventoryBucket,
  destinationBucket: InventoryBucket,
  sha256Hex: Sha256Hex,
): Readonly<InventoryPosting> {
  validatePositive(input.quantity, 'Movement quantity');
  if (
    input.source.bucket !== sourceBucket ||
    input.destination.bucket !== destinationBucket
  ) {
    invalid(`${operation} requires ${sourceBucket} -> ${destinationBucket}`);
  }
  return createInventoryPosting(
    {
      schemaVersion: input.schemaVersion,
      postingId: input.postingId,
      worldId: input.worldId,
      causationCommandId: input.causationCommandId,
      causationEventIds: input.causationEventIds,
      worldVersionBefore: input.worldVersionBefore,
      worldVersionAfter: input.worldVersionAfter,
      simTime: input.simTime,
      command: input.command,
      transition: input.transition,
      operation,
      entries: [
        {
          account: input.source,
          delta: Quantity.from(
            `-${input.quantity.amount.toFixed()}`,
            input.quantity.unit,
          ),
        },
        { account: input.destination, delta: input.quantity },
      ],
    },
    sha256Hex,
  );
}

export const createReservationPosting = (
  input: InventoryMovementInput,
  sha256Hex: Sha256Hex,
) => movementPosting(input, 'RESERVE', 'AVAILABLE', 'RESERVED', sha256Hex);

export const createReleasePosting = (
  input: InventoryMovementInput,
  sha256Hex: Sha256Hex,
) => movementPosting(input, 'RELEASE', 'RESERVED', 'AVAILABLE', sha256Hex);

export const createShipmentPosting = (
  input: InventoryMovementInput,
  sha256Hex: Sha256Hex,
) => movementPosting(input, 'SHIP', 'RESERVED', 'IN_TRANSIT', sha256Hex);

/**
 * Moves physical stock to destination availability. V10 must supply any
 * title/risk/X-M identity changes explicitly; this helper never infers them.
 */
export const createDeliveryPosting = (
  input: InventoryMovementInput,
  sha256Hex: Sha256Hex,
) => movementPosting(input, 'DELIVER', 'IN_TRANSIT', 'AVAILABLE', sha256Hex);
