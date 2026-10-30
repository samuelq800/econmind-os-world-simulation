/** Derived instrument classification, never a second balance or payment ledger.
 * Only genuine opening/replay mints and inherits this non-serializable evidence. */
import { canonicalSerialize } from '../serialization/canonical.js';
import type { Sha256Hex } from '../commands/command.js';
import { Money } from '../numeric/money.js';
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  isValidatedOpeningSeed,
  type OpeningSeed,
} from '../opening/opening-seed.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import type {
  FinancialAccount,
  FinancialLedgerState,
  FinancialPostingBatch,
  FinancialPostingLeg,
} from './financial-ledger.js';

interface DepositInstrument {
  readonly kind: 'OPERATOR_BANK_DEPOSIT' | 'HOUSEHOLD_BANK_DEPOSIT';
  readonly sourceId: string;
  readonly sourcePayloadHash: string;
  readonly seedFingerprint: string;
  readonly asset: FinancialAccount;
  readonly liability: FinancialAccount;
}
const instruments = new WeakMap<object, readonly DepositInstrument[]>();
const seedInstruments = new WeakMap<
  OpeningSeed,
  readonly DepositInstrument[]
>();
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID, message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Production deposit original contract required');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    invalid('Production deposit original contract array required');
  return value;
}
function balance(
  state: FinancialLedgerState,
  account: FinancialAccount,
): Money {
  const defined = state.accounts.find((a) => a.accountId === account.accountId);
  if (!defined || !same(defined, account))
    invalid('Production deposit exact original account required');
  return (
    state.positions.find((p) => p.account.accountId === account.accountId)
      ?.netDebitBalance ?? Money.from('0', account.currency)
  );
}
function mirrored(
  state: FinancialLedgerState,
  instrument: DepositInstrument,
): void {
  const asset = balance(state, instrument.asset),
    liability = balance(state, instrument.liability);
  if (
    asset.amount.isNegative() ||
    !asset.amount.equals(liability.amount.negated())
  )
    invalid(
      'Production deposit needs nonnegative asset and exact bank liability mirror',
    );
}
/** @internal Called only after the opening loader's genuine seed check. The
 * explicit check also prevents a caller from minting from a fabricated DTO. */
export function bindOpeningProductionDepositInstruments(
  seed: OpeningSeed,
  state: FinancialLedgerState,
  sha: Sha256Hex,
): void {
  if (
    !isValidatedOpeningSeed(seed) ||
    !isAuthoritativeFinancialLedgerState(state) ||
    state.worldId !== seed.worldId ||
    state.worldVersion !== seed.openingWorldVersion ||
    state.appliedBatches.length
  )
    invalid(
      'Production deposit proof requires genuine opening seed and opening ledger',
    );
  const cached = seedInstruments.get(seed);
  if (cached) {
    instruments.set(state, cached);
    return;
  }
  const found: DepositInstrument[] = [];
  try {
    for (const source of seed.sources) {
      // Other canonical source strings can exceed 120MB. Only parse the exact
      // unescaped root schema candidate, never hydrate the operating carrier.
      if (
        !source.canonicalPayload.includes(
          '"schemaVersion":"adopted-financial-opening-source-v2"',
        )
      )
        continue;
      const root = object(JSON.parse(source.canonicalPayload));
      if (root.schemaVersion !== 'adopted-financial-opening-source-v2')
        continue;
      if (source.sourceKind !== 'AUTHORITATIVE_DATASET')
        invalid('Production deposit original source kind required');
      const assembly = object(root.assembly);
      if (assembly.worldId !== seed.worldId)
        invalid('Production deposit original world differs');
      const reconciliations = array(root.reconciliations).map(object);
      for (const country of array(assembly.countries).map(object)) {
        const roster = object(country.roster),
          countryId = country.countryId;
        if (
          typeof countryId !== 'string' ||
          typeof roster.bank !== 'string' ||
          roster.bank === roster.operator ||
          roster.bank === roster.households ||
          roster.operator === roster.households
        )
          invalid('Production deposit original country/bank required');
        const reconciled = reconciliations.filter(
          (r) => r.countryId === countryId,
        );
        if (reconciled.length !== 1)
          invalid('Production deposit exact reconciliation required');
        for (const [kind, key, field, owner] of [
          [
            'OPERATOR_BANK_DEPOSIT',
            'BUSINESS_DEPOSIT',
            'businessBankDeposits',
            roster.operator,
          ],
          [
            'HOUSEHOLD_BANK_DEPOSIT',
            'HOUSEHOLD_DEPOSIT',
            'householdBankDeposits',
            roster.households,
          ],
        ] as const) {
          const values = array(reconciled[0]!.denominations)
            .map(object)
            .filter((v) => v.field === field);
          if (values.length !== 1 || typeof owner !== 'string')
            invalid('Production deposit exact source denomination required');
          const book = object(values[0]!.localBookValue);
          if (
            typeof book.amount !== 'string' ||
            typeof book.currency !== 'string'
          )
            invalid('Production deposit source amount required');
          const amount = Money.from(book.amount, book.currency);
          if (amount.amount.isNegative())
            invalid('Production deposit original amount cannot be negative');
          if (amount.amount.isZero()) continue;
          const id = (prefix: string, suffix: string): string =>
            `${prefix}_${sha(canonicalSerialize([seed.worldId, countryId, suffix, book.currency])).toUpperCase()}`;
          const assetId: string = id('ACCOUNT', key + '_ASSET'),
            liabilityId: string = id('ACCOUNT', key + '_LIABILITY'),
            claim: string = id('CLAIM', key);
          const asset: FinancialAccount | undefined = state.accounts.find(
              (a) => a.accountId === assetId,
            ),
            liability: FinancialAccount | undefined = state.accounts.find(
              (a) => a.accountId === liabilityId,
            );
          if (
            !asset ||
            !liability ||
            asset.accountClass !== 'ASSET' ||
            liability.accountClass !== 'LIABILITY' ||
            asset.worldId !== seed.worldId ||
            liability.worldId !== seed.worldId ||
            asset.countryId !== countryId ||
            liability.countryId !== countryId ||
            asset.ownerId !== owner ||
            liability.ownerId !== roster.bank ||
            asset.currency !== book.currency ||
            liability.currency !== book.currency ||
            asset.claimId !== claim ||
            liability.claimId !== claim ||
            asset.counterpartyEntityId !== roster.bank ||
            liability.counterpartyEntityId !== owner
          )
            invalid(
              'Production deposit exact original issuer/holder claim required',
            );
          const batches = seed.financialBatches.filter(
            (b) =>
              b.sourceId === source.sourceId &&
              b.legs.some((l) => l.account.accountId === assetId),
          );
          if (batches.length !== 1)
            invalid('Production deposit exact original source batch required');
          const a = batches[0]!.legs.filter(
              (l) => l.account.accountId === assetId,
            ),
            l = batches[0]!.legs.filter(
              (l) => l.account.accountId === liabilityId,
            );
          if (
            a.length !== 1 ||
            l.length !== 1 ||
            a[0]!.direction !== 'DEBIT' ||
            l[0]!.direction !== 'CREDIT' ||
            a[0]!.counterpartLegId !== l[0]!.legId ||
            l[0]!.counterpartLegId !== a[0]!.legId ||
            !a[0]!.amount.amount.equals(amount.amount) ||
            !l[0]!.amount.amount.equals(amount.amount) ||
            !balance(state, asset).amount.equals(amount.amount) ||
            !balance(state, liability).amount.equals(amount.amount.negated())
          )
            invalid('Production deposit original source pair/value differs');
          found.push(
            Object.freeze({
              kind,
              sourceId: source.sourceId,
              sourcePayloadHash: source.payloadHash,
              seedFingerprint: seed.fingerprint,
              asset,
              liability,
            }),
          );
        }
      }
    }
    if (new Set(found.map((i) => i.asset.accountId)).size !== found.length)
      invalid('Production deposit original instrument is ambiguous');
  } catch (error) {
    // Generic Core seeds remain loadable. Unsupported/malformed financial
    // source contracts classify NO asset as a deposit; production fails closed.
    if (!(error instanceof DomainError) && !(error instanceof SyntaxError))
      throw error;
    found.length = 0;
  }
  const proof = Object.freeze(found);
  instruments.set(state, proof);
  seedInstruments.set(seed, proof);
}
/** @internal Financial writer/version views inherit classifications, no balances. */
export function inheritProductionDepositInstruments(
  state: FinancialLedgerState,
  parent: FinancialLedgerState,
): void {
  if (
    !isAuthoritativeFinancialLedgerState(state) ||
    !isAuthoritativeFinancialLedgerState(parent) ||
    state.worldId !== parent.worldId
  )
    invalid(
      'Production deposit classification needs genuine same-world lineage',
    );
  const source = instruments.get(parent);
  if (source) {
    instruments.set(state, source);
  }
}
/** Recognizes a PAID batch only, never a budget/reservation or arbitrary ASSET.
 * Narrow supported settlement: same-bank original deposit transfer with both
 * liability mirrors, or an explicit expense paid to that bank's revenue. */
export function isSettledOriginalProductionDeposit(input: {
  readonly payment: FinancialPostingLeg;
  readonly expense: FinancialPostingLeg;
  readonly batch: FinancialPostingBatch;
  readonly financial: FinancialLedgerState;
}): boolean {
  const { payment, expense, batch, financial } = input;
  const known = instruments.get(financial);
  const payer = known?.find(
    (p) => p.kind === 'OPERATOR_BANK_DEPOSIT' && same(p.asset, payment.account),
  );
  if (!payer) return false;
  if (
    !isAuthoritativeFinancialLedgerState(financial) ||
    !financial.appliedBatches.some(
      (b) => b.batchId === batch.batchId && b.fingerprint === batch.fingerprint,
    ) ||
    payment.direction !== 'CREDIT' ||
    expense.direction !== 'DEBIT' ||
    expense.account.accountClass !== 'EXPENSE' ||
    expense.account.ownerId !== payer.asset.ownerId ||
    expense.account.countryId !== payer.asset.countryId ||
    expense.account.claimId !== null ||
    expense.account.counterpartyEntityId !== null ||
    expense.counterpartyAccountId !== payment.account.accountId ||
    payment.counterpartyAccountId !== expense.account.accountId ||
    !same(payment.amount, expense.amount)
  )
    invalid('Production deposit actual paid expense pair required');
  mirrored(financial, payer);
  const liability = batch.legs.filter(
    (l) =>
      same(l.account, payer.liability) &&
      l.direction === 'DEBIT' &&
      same(l.amount, payment.amount),
  );
  if (liability.length !== 1)
    invalid('Production deposit payment must settle its bank liability');
  const remaining = batch.legs.filter(
    (l) => l !== payment && l !== expense && l !== liability[0],
  );
  const revenue = (l: FinancialPostingLeg, owner: string) =>
    l.direction === 'CREDIT' &&
    l.account.accountClass === 'REVENUE' &&
    l.account.ownerId === owner &&
    l.account.countryId === payer.asset.countryId &&
    l.account.currency === payment.amount.currency &&
    same(l.amount, payment.amount) &&
    l.account.claimId === null &&
    l.account.counterpartyEntityId === null;
  if (
    remaining.length === 1 &&
    revenue(remaining[0]!, payer.liability.ownerId) &&
    remaining[0]!.counterpartyAccountId === payer.liability.accountId &&
    liability[0]!.counterpartyAccountId === remaining[0]!.account.accountId
  )
    return true;
  if (remaining.length !== 3)
    invalid(
      'Production deposit settlement requires complete actual recipient and issuer legs',
    );
  const recipient = known!.find(
    (p) =>
      p.asset.ownerId !== payer.asset.ownerId &&
      p.asset.countryId === payer.asset.countryId &&
      p.liability.ownerId === payer.liability.ownerId &&
      remaining.some(
        (l) =>
          same(l.account, p.asset) &&
          l.direction === 'DEBIT' &&
          same(l.amount, payment.amount),
      ),
  );
  if (!recipient)
    invalid(
      'Production deposit recipient needs original distinct same-bank deposit',
    );
  mirrored(financial, recipient);
  const a = remaining.find(
    (l) =>
      same(l.account, recipient.asset) &&
      l.direction === 'DEBIT' &&
      same(l.amount, payment.amount),
  );
  const l = remaining.find(
    (l) =>
      same(l.account, recipient.liability) &&
      l.direction === 'CREDIT' &&
      same(l.amount, payment.amount),
  );
  const r = remaining.find((l) => revenue(l, recipient.asset.ownerId));
  if (
    !a ||
    !l ||
    !r ||
    a.counterpartyAccountId !== r.account.accountId ||
    r.counterpartyAccountId !== a.account.accountId ||
    l.counterpartyAccountId !== payer.liability.accountId ||
    liability[0]!.counterpartyAccountId !== recipient.liability.accountId
  )
    invalid('Production deposit recipient settlement legs are incomplete');
  return true;
}
