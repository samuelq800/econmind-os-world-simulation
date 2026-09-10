import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  commandId,
  countryId,
  eventId,
  financialAccountId,
  financialClaimId,
  financialPostingBatchId,
  financialPostingLegId,
  legalEntityId,
  worldId,
  type CommandId,
  type CountryId,
  type EventId,
  type FinancialAccountId,
  type FinancialClaimId,
  type FinancialPostingBatchId,
  type FinancialPostingLegId,
  type LegalEntityId,
  type WorldId,
} from '../ids.js';
import { isMoney, Money } from '../numeric/money.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import {
  authorizeFinancialLedgerState,
  isAuthoritativeFinancialLedgerState,
  type FinancialLedgerAuthority,
} from '../opening/ledger-authority.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

export const FINANCIAL_LEDGER_SCHEMA_VERSION = 'financial-ledger-v1' as const;
export const FINANCIAL_POSTING_SCHEMA_VERSION = 'financial-posting-v1' as const;
export const FINANCIAL_AUTHORITATIVE_WRITER =
  'WORLD_FINANCIAL_POSTING' as const;

export type FinancialAccountClass =
  | 'CASH'
  | 'DEPOSIT'
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE'
  | 'RECEIVABLE'
  | 'PAYABLE';
export type FinancialPostingDirection = 'DEBIT' | 'CREDIT';

const ACCOUNT_CLASSES: readonly FinancialAccountClass[] = Object.freeze([
  'ASSET',
  'CASH',
  'DEPOSIT',
  'EQUITY',
  'EXPENSE',
  'LIABILITY',
  'PAYABLE',
  'RECEIVABLE',
  'REVENUE',
]);
const DIRECTIONS: readonly FinancialPostingDirection[] = Object.freeze([
  'CREDIT',
  'DEBIT',
]);
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_SHA256 = /^sha256:[0-9a-f]{64}$/u;
const financialBatchInstances = new WeakSet<object>();

export interface FinancialAccount {
  readonly worldId: WorldId;
  readonly accountId: FinancialAccountId;
  readonly ownerId: LegalEntityId;
  readonly countryId: CountryId;
  readonly accountClass: FinancialAccountClass;
  readonly currency: string;
  readonly claimId: FinancialClaimId | null;
  readonly counterpartyEntityId: LegalEntityId | null;
}

export interface FinancialPostingLeg {
  readonly legId: FinancialPostingLegId;
  readonly account: Readonly<FinancialAccount>;
  readonly direction: FinancialPostingDirection;
  readonly amount: Money;
  readonly counterpartyAccountId: FinancialAccountId | null;
}

export interface FinancialPostingBatch {
  readonly schemaVersion: typeof FINANCIAL_POSTING_SCHEMA_VERSION;
  readonly batchId: FinancialPostingBatchId;
  readonly worldId: WorldId;
  readonly causationCommandId: CommandId;
  readonly causationEventIds: readonly EventId[];
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: SimTime;
  readonly settlementCurrency: string;
  readonly legs: readonly Readonly<FinancialPostingLeg>[];
  readonly fingerprint: CanonicalSha256;
}

export interface FinancialPosition {
  readonly account: Readonly<FinancialAccount>;
  readonly netDebitBalance: Money;
}

export interface AppliedFinancialPostingBatch {
  readonly batchId: FinancialPostingBatchId;
  readonly fingerprint: CanonicalSha256;
}

export interface FinancialLedgerSnapshot {
  readonly schemaVersion: typeof FINANCIAL_LEDGER_SCHEMA_VERSION;
  readonly worldId: WorldId;
  readonly worldVersion: string;
  readonly accounts: readonly Readonly<FinancialAccount>[];
  readonly positions: readonly Readonly<FinancialPosition>[];
  readonly appliedBatches: readonly Readonly<AppliedFinancialPostingBatch>[];
}

export type FinancialLedgerState = Readonly<
  FinancialLedgerSnapshot & FinancialLedgerAuthority
>;

export interface FinancialPostingReceipt {
  readonly batchId: FinancialPostingBatchId;
  readonly fingerprint: CanonicalSha256;
  readonly outcome: 'APPLIED' | 'EXACT_DUPLICATE';
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly causationCommandId: CommandId;
  readonly causationEventIds: readonly EventId[];
}

export interface FinancialPostingResult {
  readonly state: Readonly<FinancialLedgerState>;
  readonly receipt: Readonly<FinancialPostingReceipt>;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID, message);
}

function canonicalVersion(value: string, label: string): string {
  if (!NON_NEGATIVE_INTEGER.test(value)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return value;
}

function validateAccount(input: FinancialAccount): Readonly<FinancialAccount> {
  if (!ACCOUNT_CLASSES.includes(input.accountClass)) {
    invalid('Unsupported financial account class');
  }
  const hasClaim = input.claimId !== null;
  if ((input.counterpartyEntityId !== null) !== hasClaim) {
    invalid('Claim and counterparty entity identities must appear together');
  }
  const canonicalCurrency = Money.from('0', input.currency).currency;
  return Object.freeze({
    worldId: worldId(input.worldId),
    accountId: financialAccountId(input.accountId),
    ownerId: legalEntityId(input.ownerId),
    countryId: countryId(input.countryId),
    accountClass: input.accountClass,
    currency: canonicalCurrency,
    claimId: input.claimId === null ? null : financialClaimId(input.claimId),
    counterpartyEntityId:
      input.counterpartyEntityId === null
        ? null
        : legalEntityId(input.counterpartyEntityId),
  });
}

function accountKey(account: FinancialAccount): string {
  return canonicalSerialize(account);
}

function compareAccounts(left: FinancialAccount, right: FinancialAccount) {
  const leftKey = accountKey(left);
  const rightKey = accountKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function compareLegs(left: FinancialPostingLeg, right: FinancialPostingLeg) {
  return left.legId < right.legId ? -1 : left.legId > right.legId ? 1 : 0;
}

function immutableEventIds(values: readonly EventId[]): readonly EventId[] {
  if (values.length === 0) invalid('Posting batch requires causation Events');
  const canonical = values.map((value) => eventId(value));
  if (new Set(canonical).size !== canonical.length) {
    invalid('Posting causation Event identities must be unique');
  }
  return Object.freeze(canonical);
}

function immutableLegs(
  values: readonly FinancialPostingLeg[],
  expectedWorldId: WorldId,
  settlementCurrency: string,
): readonly Readonly<FinancialPostingLeg>[] {
  if (values.length < 2) invalid('Posting batch requires at least two legs');
  const legs = values.map((value) => {
    const account = validateAccount(value.account);
    if (account.worldId !== expectedWorldId) {
      invalid('Every financial leg must belong to the posting World');
    }
    if (!DIRECTIONS.includes(value.direction)) {
      invalid('Unsupported financial posting direction');
    }
    if (
      !isMoney(value.amount) ||
      !value.amount.amount.isPositive() ||
      value.amount.amount.isZero() ||
      value.amount.currency !== settlementCurrency ||
      account.currency !== settlementCurrency
    ) {
      invalid(
        'Every posting amount must be positive and use the batch settlement currency',
      );
    }
    return Object.freeze({
      legId: financialPostingLegId(value.legId),
      account,
      direction: value.direction,
      amount: value.amount,
      counterpartyAccountId:
        value.counterpartyAccountId === null
          ? null
          : financialAccountId(value.counterpartyAccountId),
    });
  });
  legs.sort(compareLegs);
  if (new Set(legs.map((leg) => leg.legId)).size !== legs.length) {
    invalid('Posting leg identities must be unique');
  }
  if (new Set(legs.map((leg) => leg.account.accountId)).size !== legs.length) {
    invalid('A posting batch cannot repeat an account');
  }
  const accountIds = new Set(legs.map((leg) => leg.account.accountId));
  if (
    legs.some(
      (leg) =>
        leg.counterpartyAccountId !== null &&
        (leg.counterpartyAccountId === leg.account.accountId ||
          !accountIds.has(leg.counterpartyAccountId)),
    )
  ) {
    invalid('A leg counterparty account must identify another batch leg');
  }
  const debit = legs
    .filter((leg) => leg.direction === 'DEBIT')
    .reduce(
      (sum, leg) => sum.add(leg.amount),
      Money.from('0', settlementCurrency),
    );
  const credit = legs
    .filter((leg) => leg.direction === 'CREDIT')
    .reduce(
      (sum, leg) => sum.add(leg.amount),
      Money.from('0', settlementCurrency),
    );
  if (!debit.amount.equals(credit.amount)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.LEDGER_IMBALANCE,
      'Financial posting debits and credits must balance exactly',
    );
  }
  return Object.freeze(legs);
}

export function createFinancialAccount(
  input: FinancialAccount,
): Readonly<FinancialAccount> {
  return validateAccount(input);
}

export function createClaimAccountPair(input: {
  readonly worldId: WorldId;
  readonly claimId: FinancialClaimId;
  readonly currency: string;
  readonly lenderAccountId: FinancialAccountId;
  readonly lenderId: LegalEntityId;
  readonly lenderCountryId: CountryId;
  readonly borrowerAccountId: FinancialAccountId;
  readonly borrowerId: LegalEntityId;
  readonly borrowerCountryId: CountryId;
}): Readonly<{
  receivable: Readonly<FinancialAccount>;
  payable: Readonly<FinancialAccount>;
}> {
  const claim = financialClaimId(input.claimId);
  const lender = legalEntityId(input.lenderId);
  const borrower = legalEntityId(input.borrowerId);
  return Object.freeze({
    receivable: createFinancialAccount({
      worldId: input.worldId,
      accountId: input.lenderAccountId,
      ownerId: lender,
      countryId: input.lenderCountryId,
      accountClass: 'RECEIVABLE',
      currency: input.currency,
      claimId: claim,
      counterpartyEntityId: borrower,
    }),
    payable: createFinancialAccount({
      worldId: input.worldId,
      accountId: input.borrowerAccountId,
      ownerId: borrower,
      countryId: input.borrowerCountryId,
      accountClass: 'PAYABLE',
      currency: input.currency,
      claimId: claim,
      counterpartyEntityId: lender,
    }),
  });
}

export function createFinancialPostingBatch(
  input: Omit<FinancialPostingBatch, 'legs' | 'fingerprint'> & {
    readonly legs: readonly FinancialPostingLeg[];
  },
  sha256Hex: Sha256Hex,
): Readonly<FinancialPostingBatch> {
  if (input.schemaVersion !== FINANCIAL_POSTING_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported financial posting schema version',
    );
  }
  const before = BigInt(
    canonicalVersion(input.worldVersionBefore, 'worldVersionBefore'),
  );
  const after = BigInt(
    canonicalVersion(input.worldVersionAfter, 'worldVersionAfter'),
  );
  if (after !== before + 1n) {
    invalid('A financial posting must advance WorldVersion exactly once');
  }
  if (!isSimTime(input.simTime)) invalid('Posting simTime must be a SimTime');
  const canonicalWorldId = worldId(input.worldId);
  const settlementCurrency = Money.from('0', input.settlementCurrency).currency;
  const intent = Object.freeze({
    schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
    batchId: financialPostingBatchId(input.batchId),
    worldId: canonicalWorldId,
    causationCommandId: commandId(input.causationCommandId),
    causationEventIds: immutableEventIds(input.causationEventIds),
    worldVersionBefore: input.worldVersionBefore,
    worldVersionAfter: input.worldVersionAfter,
    simTime: input.simTime,
    settlementCurrency,
    legs: immutableLegs(input.legs, canonicalWorldId, settlementCurrency),
  });
  const batch = Object.freeze({
    ...intent,
    fingerprint: canonicalSha256(canonicalHashInput(intent), sha256Hex),
  });
  financialBatchInstances.add(batch);
  return batch;
}

/** Parses untrusted checkpoint data. It never grants posting authority. */
export function parseFinancialLedgerSnapshot(input: {
  readonly worldId: WorldId;
  readonly worldVersion: string;
  readonly accounts?: readonly FinancialAccount[];
  readonly positions: readonly FinancialPosition[];
  readonly appliedBatches?: readonly AppliedFinancialPostingBatch[];
}): Readonly<FinancialLedgerSnapshot> {
  const canonicalWorldId = worldId(input.worldId);
  const accountsById = new Map<
    FinancialAccountId,
    Readonly<FinancialAccount>
  >();
  for (const value of input.accounts ?? []) {
    const account = validateAccount(value);
    if (account.worldId !== canonicalWorldId) {
      invalid('Hydrated financial account belongs to a different World');
    }
    const existing = accountsById.get(account.accountId);
    if (
      existing !== undefined &&
      accountKey(existing) !== accountKey(account)
    ) {
      invalid(
        'Hydrated financial account identity has conflicting definitions',
      );
    }
    accountsById.set(account.accountId, account);
  }
  const positions = input.positions.map((position) => {
    const account = validateAccount(position.account);
    if (
      !isMoney(position.netDebitBalance) ||
      account.worldId !== canonicalWorldId ||
      position.netDebitBalance.currency !== account.currency
    ) {
      invalid('Hydrated financial position does not match its World/account');
    }
    if (position.netDebitBalance.amount.isZero()) {
      invalid('Hydrated financial positions must omit zero balances');
    }
    const existing = accountsById.get(account.accountId);
    if (
      existing !== undefined &&
      accountKey(existing) !== accountKey(account)
    ) {
      invalid('Hydrated position redefines a financial account identity');
    }
    accountsById.set(account.accountId, account);
    return Object.freeze({
      account,
      netDebitBalance: position.netDebitBalance,
    });
  });
  positions.sort((left, right) => compareAccounts(left.account, right.account));
  if (
    new Set(positions.map((position) => position.account.accountId)).size !==
    positions.length
  ) {
    invalid(
      'Hydrated financial positions contain duplicate account identities',
    );
  }
  const appliedBatches = (input.appliedBatches ?? []).map((batch) => {
    if (!CANONICAL_SHA256.test(batch.fingerprint)) {
      invalid('Applied batch fingerprint must be canonical SHA-256');
    }
    return Object.freeze({
      batchId: financialPostingBatchId(batch.batchId),
      fingerprint: batch.fingerprint,
    });
  });
  if (
    new Set(appliedBatches.map((batch) => batch.batchId)).size !==
    appliedBatches.length
  ) {
    invalid('Hydrated applied batches contain duplicate identities');
  }
  const state = Object.freeze({
    schemaVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
    worldId: canonicalWorldId,
    worldVersion: canonicalVersion(input.worldVersion, 'worldVersion'),
    accounts: Object.freeze([...accountsById.values()].sort(compareAccounts)),
    positions: Object.freeze(positions),
    appliedBatches: Object.freeze(appliedBatches),
  });
  return state;
}

function receipt(
  batch: FinancialPostingBatch,
  outcome: FinancialPostingReceipt['outcome'],
): Readonly<FinancialPostingReceipt> {
  return Object.freeze({
    batchId: batch.batchId,
    fingerprint: batch.fingerprint,
    outcome,
    worldVersionBefore: batch.worldVersionBefore,
    worldVersionAfter: batch.worldVersionAfter,
    causationCommandId: batch.causationCommandId,
    causationEventIds: batch.causationEventIds,
  });
}

/** The sole authoritative V08.2 financial-position writer. */
export function applyFinancialPostingBatch(
  state: FinancialLedgerState,
  batch: FinancialPostingBatch,
): Readonly<FinancialPostingResult> {
  if (
    state.schemaVersion !== FINANCIAL_LEDGER_SCHEMA_VERSION ||
    !isAuthoritativeFinancialLedgerState(state)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported or unvalidated financial ledger state',
    );
  }
  if (!financialBatchInstances.has(batch)) {
    invalid('Financial writer accepts validated canonical batches only');
  }
  const existing = state.appliedBatches.find(
    (candidate) => candidate.batchId === batch.batchId,
  );
  if (existing !== undefined) {
    if (existing.fingerprint !== batch.fingerprint) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
        'Financial batch identity is bound to different canonical intent',
      );
    }
    return Object.freeze({
      state,
      receipt: receipt(batch, 'EXACT_DUPLICATE'),
    });
  }
  if (
    batch.worldId !== state.worldId ||
    batch.worldVersionBefore !== state.worldVersion
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
      'Financial posting does not extend the current World ledger version',
    );
  }
  const byAccount = new Map(
    state.positions.map((position) => [position.account.accountId, position]),
  );
  const accountsById = new Map(
    state.accounts.map((account) => [account.accountId, account]),
  );
  for (const leg of batch.legs) {
    const existingPosition = byAccount.get(leg.account.accountId);
    const existingAccount = accountsById.get(leg.account.accountId);
    if (
      existingAccount !== undefined &&
      accountKey(existingAccount) !== accountKey(leg.account)
    ) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
        'Financial account identity cannot be redefined by a posting',
      );
    }
    accountsById.set(leg.account.accountId, leg.account);
    const prior =
      existingPosition?.netDebitBalance ?? Money.from('0', leg.amount.currency);
    const next =
      leg.direction === 'DEBIT'
        ? prior.add(leg.amount)
        : prior.subtract(leg.amount);
    if (next.amount.isZero()) byAccount.delete(leg.account.accountId);
    else {
      byAccount.set(
        leg.account.accountId,
        Object.freeze({ account: leg.account, netDebitBalance: next }),
      );
    }
  }
  const positions = [...byAccount.values()].sort((left, right) =>
    compareAccounts(left.account, right.account),
  );
  const nextState = Object.freeze({
    schemaVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
    worldId: state.worldId,
    worldVersion: batch.worldVersionAfter,
    accounts: Object.freeze([...accountsById.values()].sort(compareAccounts)),
    positions: Object.freeze(positions),
    appliedBatches: Object.freeze([
      ...state.appliedBatches,
      Object.freeze({ batchId: batch.batchId, fingerprint: batch.fingerprint }),
    ]),
  });
  const authoritativeNextState = authorizeFinancialLedgerState(nextState);
  return Object.freeze({
    state: authoritativeNextState,
    receipt: receipt(batch, 'APPLIED'),
  });
}
