import {
  canonicalSha256,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  financialOpeningBatchId,
  financialOpeningLegId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  worldId,
  type FinancialOpeningBatchId,
  type FinancialOpeningLegId,
  type OpeningInventoryEntryId,
  type OpeningSeedId,
  type OpeningSourceId,
  type WorldId,
} from '../ids.js';
import {
  applyInventoryPosting,
  createInventoryAccount,
  parseInventoryLedgerSnapshot,
  type InventoryAccount,
  type InventoryLedgerSnapshot,
  type InventoryLedgerState,
  type InventoryPosting,
} from '../inventory/inventory-ledger.js';
import { isMoney, Money } from '../numeric/money.js';
import { isQuantity, type Quantity } from '../numeric/quantity.js';
import {
  CURRENT_REPLAY_BINDING,
  type ReplayVersionBinding,
} from '../replay/replay.js';
import {
  bindAuthoritativeTransition,
  validateAuthoritativeTransition,
  type AuthoritativeTransition,
  type AuthoritativeTransitionBinding,
} from '../commands/receipt.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  applyFinancialPostingBatch,
  createFinancialAccount,
  parseFinancialLedgerSnapshot,
  type FinancialAccount,
  type FinancialLedgerSnapshot,
  type FinancialLedgerState,
  type FinancialPostingBatch,
  type FinancialPostingDirection,
} from '../finance/financial-ledger.js';
import {
  authorizeFinancialLedgerState,
  authorizeInventoryLedgerState,
} from './ledger-authority.js';

export const OPENING_SOURCE_SCHEMA_VERSION = 'opening-source-v1' as const;
export const OPENING_SEED_SCHEMA_VERSION = 'opening-seed-v1' as const;

export type OpeningSourceKind =
  'AUTHORITATIVE_DATASET' | 'DOCUMENTED_ASSUMPTION' | 'TEST_FIXTURE';

const SOURCE_KINDS: readonly OpeningSourceKind[] = Object.freeze([
  'AUTHORITATIVE_DATASET',
  'DOCUMENTED_ASSUMPTION',
  'TEST_FIXTURE',
]);
const DIRECTIONS: readonly FinancialPostingDirection[] = Object.freeze([
  'CREDIT',
  'DEBIT',
]);
const openingSourceInstances = new WeakSet<object>();
const openingSeedInstances = new WeakSet<object>();
const rebuiltLedgerInstances = new WeakSet<object>();

export interface OpeningSource {
  readonly schemaVersion: typeof OPENING_SOURCE_SCHEMA_VERSION;
  readonly sourceId: OpeningSourceId;
  readonly sourceKind: OpeningSourceKind;
  readonly locator: string;
  readonly sourceVersion: string;
  readonly canonicalPayload: string;
  readonly payloadHash: CanonicalSha256;
}

export interface OpeningInventoryEntry {
  readonly entryId: OpeningInventoryEntryId;
  readonly sourceId: OpeningSourceId;
  readonly account: Readonly<InventoryAccount>;
  readonly quantity: Quantity;
}

export interface FinancialOpeningLeg {
  readonly legId: FinancialOpeningLegId;
  readonly account: Readonly<FinancialAccount>;
  readonly direction: FinancialPostingDirection;
  readonly amount: Money;
  readonly counterpartLegId: FinancialOpeningLegId;
}

export interface FinancialOpeningBatch {
  readonly batchId: FinancialOpeningBatchId;
  readonly sourceId: OpeningSourceId;
  readonly settlementCurrency: string;
  readonly legs: readonly Readonly<FinancialOpeningLeg>[];
}

export interface OpeningSeed {
  readonly schemaVersion: typeof OPENING_SEED_SCHEMA_VERSION;
  readonly seedId: OpeningSeedId;
  readonly worldId: WorldId;
  readonly openingWorldVersion: '0';
  readonly replayBinding: Readonly<ReplayVersionBinding>;
  readonly sources: readonly Readonly<OpeningSource>[];
  readonly inventoryEntries: readonly Readonly<OpeningInventoryEntry>[];
  readonly financialBatches: readonly Readonly<FinancialOpeningBatch>[];
  readonly fingerprint: CanonicalSha256;
}

export interface RebuiltV08Ledgers {
  readonly seedId: OpeningSeedId;
  readonly seedFingerprint: CanonicalSha256;
  readonly worldVersion: string;
  readonly inventory: Readonly<InventoryLedgerState>;
  readonly financial: Readonly<FinancialLedgerState>;
}

export interface V08AuthoritativeLedgerTransition {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly inventoryPostings: readonly InventoryPosting[];
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
}

export type LedgerReconciliationComparison = Readonly<{
  status: 'NOT_PROVIDED' | 'MATCH' | 'MISMATCH';
  reconstructedHash: CanonicalSha256;
  snapshotHash: CanonicalSha256 | null;
}>;

export interface V08LedgerReconciliation {
  readonly seedId: OpeningSeedId;
  readonly seedFingerprint: CanonicalSha256;
  readonly inventory: LedgerReconciliationComparison;
  readonly financial: LedgerReconciliationComparison;
  readonly reconciled: boolean;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.OPENING_SEED_INVALID, message);
}

function nonEmpty(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0
  ) {
    invalid(`${label} must be a non-empty canonical string`);
  }
  return value;
}

export function createOpeningSource(
  input: {
    readonly schemaVersion: typeof OPENING_SOURCE_SCHEMA_VERSION;
    readonly sourceId: OpeningSourceId;
    readonly sourceKind: OpeningSourceKind;
    readonly locator: string;
    readonly sourceVersion: string;
    readonly payload: unknown;
  },
  sha256Hex: Sha256Hex,
): Readonly<OpeningSource> {
  if (input.schemaVersion !== OPENING_SOURCE_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported opening-source schema version',
    );
  }
  if (!SOURCE_KINDS.includes(input.sourceKind)) {
    invalid('Unsupported opening source kind');
  }
  const canonicalPayload = canonicalSerialize(input.payload);
  const source = Object.freeze({
    schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
    sourceId: openingSourceId(input.sourceId),
    sourceKind: input.sourceKind,
    locator: nonEmpty(input.locator, 'source locator'),
    sourceVersion: nonEmpty(input.sourceVersion, 'source version'),
    canonicalPayload,
    payloadHash: canonicalSha256(
      canonicalHashInput({ payload: input.payload }),
      sha256Hex,
    ),
  });
  openingSourceInstances.add(source);
  return source;
}

function canonicalSources(
  values: readonly OpeningSource[],
): readonly Readonly<OpeningSource>[] {
  const sources = values.map((source) => {
    if (!openingSourceInstances.has(source)) {
      invalid('Opening seed accepts validated source records only');
    }
    return source;
  });
  sources.sort((left, right) =>
    left.sourceId < right.sourceId
      ? -1
      : left.sourceId > right.sourceId
        ? 1
        : 0,
  );
  if (sources.length === 0) invalid('Opening seed requires source provenance');
  if (
    new Set(sources.map((source) => source.sourceId)).size !== sources.length
  ) {
    invalid('Opening source identities must be unique');
  }
  return Object.freeze(sources);
}

function canonicalInventoryEntries(input: {
  readonly worldId: WorldId;
  readonly sources: ReadonlySet<OpeningSourceId>;
  readonly values: readonly OpeningInventoryEntry[];
}): readonly Readonly<OpeningInventoryEntry>[] {
  const entries = input.values.map((value) => {
    const account = createInventoryAccount(value.account);
    if (account.worldId !== input.worldId) {
      invalid('Opening inventory account belongs to a different World');
    }
    if (!input.sources.has(value.sourceId)) {
      invalid('Opening inventory entry references an unknown source');
    }
    if (
      !isQuantity(value.quantity) ||
      !value.quantity.amount.isPositive() ||
      value.quantity.amount.isZero() ||
      value.quantity.unit !== account.unit
    ) {
      invalid('Opening inventory quantity must be positive and match its unit');
    }
    return Object.freeze({
      entryId: openingInventoryEntryId(value.entryId),
      sourceId: openingSourceId(value.sourceId),
      account,
      quantity: value.quantity,
    });
  });
  entries.sort((left, right) =>
    left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0,
  );
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) {
    invalid('Opening inventory entry identities must be unique');
  }
  const accountKeys = entries.map((entry) => canonicalSerialize(entry.account));
  if (new Set(accountKeys).size !== accountKeys.length) {
    invalid('Opening inventory cannot repeat a canonical account');
  }
  return Object.freeze(entries);
}

function canonicalFinancialBatches(input: {
  readonly worldId: WorldId;
  readonly sources: ReadonlySet<OpeningSourceId>;
  readonly values: readonly FinancialOpeningBatch[];
}): readonly Readonly<FinancialOpeningBatch>[] {
  const batches = input.values.map((value) => {
    const sourceId = openingSourceId(value.sourceId);
    if (!input.sources.has(sourceId)) {
      invalid('Financial opening batch references an unknown source');
    }
    const settlementCurrency = Money.from(
      '0',
      value.settlementCurrency,
    ).currency;
    if (value.legs.length < 2) {
      invalid('Financial opening batch requires counterpart legs');
    }
    const legs = value.legs.map((leg) => {
      const account = createFinancialAccount(leg.account);
      if (account.worldId !== input.worldId) {
        invalid('Financial opening account belongs to a different World');
      }
      if (!DIRECTIONS.includes(leg.direction)) {
        invalid('Unsupported financial opening direction');
      }
      if (
        !isMoney(leg.amount) ||
        !leg.amount.amount.isPositive() ||
        leg.amount.amount.isZero() ||
        leg.amount.currency !== settlementCurrency ||
        account.currency !== settlementCurrency
      ) {
        invalid('Financial opening amount must be positive in batch currency');
      }
      return Object.freeze({
        legId: financialOpeningLegId(leg.legId),
        account,
        direction: leg.direction,
        amount: leg.amount,
        counterpartLegId: financialOpeningLegId(leg.counterpartLegId),
      });
    });
    legs.sort((left, right) =>
      left.legId < right.legId ? -1 : left.legId > right.legId ? 1 : 0,
    );
    const legIds = new Set(legs.map((leg) => leg.legId));
    if (legIds.size !== legs.length) {
      invalid('Financial opening leg identities must be unique within a batch');
    }
    if (
      new Set(legs.map((leg) => leg.account.accountId)).size !== legs.length
    ) {
      invalid('Financial opening batch cannot repeat an account');
    }
    for (const leg of legs) {
      const counterpart = legs.find(
        (candidate) => candidate.legId === leg.counterpartLegId,
      );
      if (
        counterpart === undefined ||
        counterpart.legId === leg.legId ||
        counterpart.direction === leg.direction
      ) {
        invalid('Every financial opening leg requires an opposite counterpart');
      }
    }
    const debit = legs
      .filter((leg) => leg.direction === 'DEBIT')
      .reduce(
        (total, leg) => total.add(leg.amount),
        Money.from('0', settlementCurrency),
      );
    const credit = legs
      .filter((leg) => leg.direction === 'CREDIT')
      .reduce(
        (total, leg) => total.add(leg.amount),
        Money.from('0', settlementCurrency),
      );
    if (!debit.amount.equals(credit.amount)) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.LEDGER_IMBALANCE,
        'Financial opening debit and credit must balance exactly',
      );
    }
    return Object.freeze({
      batchId: financialOpeningBatchId(value.batchId),
      sourceId,
      settlementCurrency,
      legs: Object.freeze(legs),
    });
  });
  batches.sort((left, right) =>
    left.batchId < right.batchId ? -1 : left.batchId > right.batchId ? 1 : 0,
  );
  if (new Set(batches.map((batch) => batch.batchId)).size !== batches.length) {
    invalid('Financial opening batch identities must be unique');
  }
  return Object.freeze(batches);
}

export function createOpeningSeed(
  input: Omit<
    OpeningSeed,
    'sources' | 'inventoryEntries' | 'financialBatches' | 'fingerprint'
  > & {
    readonly sources: readonly OpeningSource[];
    readonly inventoryEntries: readonly OpeningInventoryEntry[];
    readonly financialBatches: readonly FinancialOpeningBatch[];
  },
  sha256Hex: Sha256Hex,
): Readonly<OpeningSeed> {
  if (input.schemaVersion !== OPENING_SEED_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported opening-seed schema version',
    );
  }
  if (input.openingWorldVersion !== '0') {
    invalid('Opening seed must establish WorldVersion zero');
  }
  if (
    canonicalSerialize(input.replayBinding) !==
    canonicalSerialize(CURRENT_REPLAY_BINDING)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Opening seed replay version binding mismatch',
    );
  }
  const canonicalWorldId = worldId(input.worldId);
  const sources = canonicalSources(input.sources);
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  const intent = Object.freeze({
    schemaVersion: OPENING_SEED_SCHEMA_VERSION,
    seedId: openingSeedId(input.seedId),
    worldId: canonicalWorldId,
    openingWorldVersion: '0' as const,
    replayBinding: Object.freeze({ ...input.replayBinding }),
    sources,
    inventoryEntries: canonicalInventoryEntries({
      worldId: canonicalWorldId,
      sources: sourceIds,
      values: input.inventoryEntries,
    }),
    financialBatches: canonicalFinancialBatches({
      worldId: canonicalWorldId,
      sources: sourceIds,
      values: input.financialBatches,
    }),
  });
  const seed = Object.freeze({
    ...intent,
    fingerprint: canonicalSha256(canonicalHashInput(intent), sha256Hex),
  });
  openingSeedInstances.add(seed);
  return seed;
}

function openingFinancialState(
  seed: OpeningSeed,
): Readonly<FinancialLedgerState> {
  const accounts = new Map<string, Readonly<FinancialAccount>>();
  const balances = new Map<string, Money>();
  for (const batch of seed.financialBatches) {
    for (const leg of batch.legs) {
      const key = leg.account.accountId;
      const existing = accounts.get(key);
      if (
        existing !== undefined &&
        canonicalSerialize(existing) !== canonicalSerialize(leg.account)
      ) {
        invalid('Opening seed redefines a financial account identity');
      }
      accounts.set(key, leg.account);
      const prior = balances.get(key) ?? Money.from('0', leg.amount.currency);
      balances.set(
        key,
        leg.direction === 'DEBIT'
          ? prior.add(leg.amount)
          : prior.subtract(leg.amount),
      );
    }
  }
  return authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({
      worldId: seed.worldId,
      worldVersion: seed.openingWorldVersion,
      accounts: [...accounts.values()],
      positions: [...balances]
        .filter(([, balance]) => !balance.amount.isZero())
        .map(([accountId, netDebitBalance]) => {
          const account = accounts.get(accountId);
          if (account === undefined)
            invalid('Opening financial account missing');
          return { account, netDebitBalance };
        }),
    }),
  );
}

function openingInventoryState(
  seed: OpeningSeed,
): Readonly<InventoryLedgerState> {
  return authorizeInventoryLedgerState(
    parseInventoryLedgerSnapshot({
      worldId: seed.worldId,
      worldVersion: seed.openingWorldVersion,
      balances: seed.inventoryEntries.map((entry) => ({
        account: entry.account,
        quantity: entry.quantity,
      })),
    }),
  );
}

function inventoryStateAtVersion(
  state: InventoryLedgerState,
  worldVersion: string,
): Readonly<InventoryLedgerState> {
  return authorizeInventoryLedgerState(
    parseInventoryLedgerSnapshot({
      worldId: state.worldId,
      worldVersion,
      balances: state.balances,
      appliedPostings: state.appliedPostings,
    }),
  );
}

function financialStateAtVersion(
  state: FinancialLedgerState,
  worldVersion: string,
): Readonly<FinancialLedgerState> {
  return authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({
      worldId: state.worldId,
      worldVersion,
      accounts: state.accounts,
      positions: state.positions,
      appliedBatches: state.appliedBatches,
    }),
  );
}

function assertInventoryPostingBinding(
  posting: InventoryPosting,
  binding: AuthoritativeTransitionBinding,
): void {
  if (
    canonicalSerialize(posting.transitionBinding) !==
    canonicalSerialize(binding)
  ) {
    invalid(
      'Inventory posting is not bound to its authoritative World transition',
    );
  }
}

function assertFinancialPostingBinding(
  batch: FinancialPostingBatch,
  binding: AuthoritativeTransitionBinding,
): void {
  if (
    canonicalSerialize(batch.transitionBinding) !== canonicalSerialize(binding)
  ) {
    invalid(
      'Financial posting is not bound to its authoritative World transition',
    );
  }
}

export function rebuildV08LedgersFromLineage(input: {
  readonly seed: OpeningSeed;
  readonly transitions?: readonly V08AuthoritativeLedgerTransition[];
  readonly sha256Hex: Sha256Hex;
}): Readonly<RebuiltV08Ledgers> {
  if (!openingSeedInstances.has(input.seed)) {
    invalid('Ledger reconstruction accepts a validated opening seed only');
  }
  let worldVersion: string = input.seed.openingWorldVersion;
  let inventory = openingInventoryState(input.seed);
  let financial = openingFinancialState(input.seed);
  const transitionIds = new Set<string>();
  const eventIds = new Set<string>();
  const idempotencyCommands = new Map<string, string>();
  const inventoryPostingIds = new Set<string>();
  const financialBatchIds = new Set<string>();
  let expectedEventSequence = 1n;

  for (const value of input.transitions ?? []) {
    const transition = validateAuthoritativeTransition(value.transition);
    const transitionBinding = bindAuthoritativeTransition(
      { command: value.command, transition },
      input.sha256Hex,
    );
    if (transitionIds.has(transition.transitionId)) {
      invalid('Authoritative transition identity is duplicated');
    }
    if (transitionBinding.idempotencyKey !== null) {
      const priorCommand = idempotencyCommands.get(
        transitionBinding.idempotencyKey,
      );
      if (
        priorCommand !== undefined &&
        priorCommand !== transitionBinding.commandId
      ) {
        invalid('Idempotency key is reused across distinct Commands');
      }
      idempotencyCommands.set(
        transitionBinding.idempotencyKey,
        transitionBinding.commandId,
      );
    }
    if (
      transition.worldId !== input.seed.worldId ||
      transition.worldVersionBefore !== worldVersion
    ) {
      invalid(
        'Authoritative transition sequence has a gap, conflict or foreign World',
      );
    }
    transitionIds.add(transition.transitionId);
    for (const event of transition.events) {
      if (
        BigInt(event.sequence) !== expectedEventSequence ||
        eventIds.has(event.eventId)
      ) {
        invalid('Authoritative Event lineage is duplicated or out of order');
      }
      eventIds.add(event.eventId);
      expectedEventSequence += 1n;
    }

    for (const posting of value.inventoryPostings) {
      assertInventoryPostingBinding(posting, transitionBinding);
      if (inventoryPostingIds.has(posting.postingId)) {
        invalid('Inventory posting identity is duplicated across lineage');
      }
      inventoryPostingIds.add(posting.postingId);
    }
    for (const batch of value.financialPostingBatches) {
      assertFinancialPostingBinding(batch, transitionBinding);
      if (financialBatchIds.has(batch.batchId)) {
        invalid('Financial posting identity is duplicated across lineage');
      }
      financialBatchIds.add(batch.batchId);
    }

    let candidateInventory = inventory;
    for (const posting of value.inventoryPostings) {
      candidateInventory = applyInventoryPosting(
        inventoryStateAtVersion(
          candidateInventory,
          transition.worldVersionBefore,
        ),
        posting,
      ).state;
    }
    if (value.inventoryPostings.length === 0) {
      candidateInventory = inventoryStateAtVersion(
        candidateInventory,
        transition.worldVersionAfter,
      );
    }

    let candidateFinancial = financial;
    for (const batch of value.financialPostingBatches) {
      candidateFinancial = applyFinancialPostingBatch(
        financialStateAtVersion(
          candidateFinancial,
          transition.worldVersionBefore,
        ),
        batch,
      ).state;
    }
    if (value.financialPostingBatches.length === 0) {
      candidateFinancial = financialStateAtVersion(
        candidateFinancial,
        transition.worldVersionAfter,
      );
    }

    inventory = candidateInventory;
    financial = candidateFinancial;
    worldVersion = transition.worldVersionAfter;
  }
  const rebuilt = Object.freeze({
    seedId: input.seed.seedId,
    seedFingerprint: input.seed.fingerprint,
    worldVersion,
    inventory,
    financial,
  });
  rebuiltLedgerInstances.add(rebuilt);
  return rebuilt;
}

function stateHash(value: unknown, sha256Hex: Sha256Hex): CanonicalSha256 {
  return canonicalSha256(canonicalHashInput(value), sha256Hex);
}

function comparison(
  reconstructed: unknown,
  snapshot: unknown | undefined,
  sha256Hex: Sha256Hex,
): LedgerReconciliationComparison {
  const reconstructedHash = stateHash(reconstructed, sha256Hex);
  if (snapshot === undefined) {
    return Object.freeze({
      status: 'NOT_PROVIDED',
      reconstructedHash,
      snapshotHash: null,
    });
  }
  const snapshotHash = stateHash(snapshot, sha256Hex);
  return Object.freeze({
    status: snapshotHash === reconstructedHash ? 'MATCH' : 'MISMATCH',
    reconstructedHash,
    snapshotHash,
  });
}

export function reconcileV08LedgerSnapshots(input: {
  readonly reconstructed: RebuiltV08Ledgers;
  readonly inventorySnapshot?: InventoryLedgerSnapshot;
  readonly financialSnapshot?: FinancialLedgerSnapshot;
  readonly sha256Hex: Sha256Hex;
}): Readonly<V08LedgerReconciliation> {
  if (!rebuiltLedgerInstances.has(input.reconstructed)) {
    invalid('Reconciliation accepts validated reconstructed lineage only');
  }
  const inventorySnapshot =
    input.inventorySnapshot === undefined
      ? undefined
      : parseInventoryLedgerSnapshot({
          worldId: input.inventorySnapshot.worldId,
          worldVersion: input.inventorySnapshot.worldVersion,
          balances: input.inventorySnapshot.balances,
          appliedPostings: input.inventorySnapshot.appliedPostings,
        });
  const financialSnapshot =
    input.financialSnapshot === undefined
      ? undefined
      : parseFinancialLedgerSnapshot({
          worldId: input.financialSnapshot.worldId,
          worldVersion: input.financialSnapshot.worldVersion,
          accounts: input.financialSnapshot.accounts,
          positions: input.financialSnapshot.positions,
          appliedBatches: input.financialSnapshot.appliedBatches,
        });
  const inventory = comparison(
    input.reconstructed.inventory,
    inventorySnapshot,
    input.sha256Hex,
  );
  const financial = comparison(
    input.reconstructed.financial,
    financialSnapshot,
    input.sha256Hex,
  );
  const reconciled =
    inventory.status !== 'MISMATCH' && financial.status !== 'MISMATCH';
  return Object.freeze({
    seedId: input.reconstructed.seedId,
    seedFingerprint: input.reconstructed.seedFingerprint,
    inventory,
    financial,
    reconciled,
  });
}

export function assertV08LedgerReconciled(
  report: V08LedgerReconciliation,
): void {
  if (!report.reconciled) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.RECONCILIATION_MISMATCH,
      'Derived V08 snapshot does not match opening seed plus posting lineage',
    );
  }
}
