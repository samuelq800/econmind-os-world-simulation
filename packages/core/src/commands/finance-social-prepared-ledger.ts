/** Immutable financial data preparation. This is not source admission,
 * authorization, a Clock, or a commit/currentness capability. A complete
 * genuinely replayed Budget/Social prefix may advance the version only when
 * every canonical group has zero financial AND inventory postings. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import { isSimTime } from '../numeric/sim-time.js';
import {
  parseFinancialLedgerSnapshot,
  type FinancialLedgerState,
} from '../finance/financial-ledger.js';
import { inheritProductionDepositInstruments } from '../finance/production-deposit-funding.js';
import {
  authorizeFinancialLedgerState,
  isAuthoritativeFinancialLedgerState,
} from '../opening/ledger-authority.js';
import {
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
} from './receipt.js';
import {
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetMixedPrefixEvidence,
} from './finance-budget-native.js';
import type { Sha256Hex } from './command.js';

declare const preparedLedger: unique symbol;
export interface PreparedFinanceSocialLedger {
  readonly [preparedLedger]: true;
}
const bases = new WeakMap<
  PreparedFinanceSocialLedger,
  Readonly<FinancialLedgerState>
>();
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Prepared Finance/Social ledger: ${reason}`,
  );
}
/** Keeps the small genuine opening financial ledger, never the full seed or
 * an authoritative source/permission snapshot. Copied carriers cannot mint it. */
export function prepareFinanceSocialLedger(
  base: Readonly<FinancialLedgerState>,
): PreparedFinanceSocialLedger {
  if (!isAuthoritativeFinancialLedgerState(base) || base.worldVersion !== '0')
    invalid('genuine H0 financial base required');
  const token = Object.freeze({}) as PreparedFinanceSocialLedger;
  bases.set(token, base);
  return token;
}
export function replayPreparedFinanceSocialLedger(input: {
  readonly prepared: PreparedFinanceSocialLedger;
  readonly mixedPrefixEvidence: FinanceNativeBudgetMixedPrefixEvidence;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly sha256Hex: Sha256Hex;
}): Readonly<FinancialLedgerState> {
  const base = bases.get(input.prepared);
  if (!base || input.frames.length > 256)
    invalid('genuine preparation and bounded complete prefix required');
  // The existing private evidence validates domain effects, all countries,
  // event order, command identity and whole-group canonical replay. Unknown
  // domains cannot issue this evidence. It is NOT a PG/source capability.
  const replay = readFinanceNativeBudgetMixedPrefix(
    input.mixedPrefixEvidence,
    base.worldId,
    input.frames,
    input.sha256Hex,
  );
  if (
    replay.budgetState.worldVersion !== input.expectedHead.worldVersion ||
    replay.budgetState.eventSequence !== input.expectedHead.eventSequence
  )
    invalid('exact complete current head required');
  // Evidence binds commands/events; these adjacent canonical containers and
  // posting arrays must independently be checked on EVERY use, not cached.
  let version = '0';
  for (const frame of input.frames) {
    if (
      !Array.isArray(frame.financialPostingBatches) ||
      !Array.isArray(frame.inventoryPostings) ||
      frame.financialPostingBatches.length !== 0 ||
      frame.inventoryPostings.length !== 0 ||
      frame.receipt.outcome !== 'COMMITTED'
    )
      invalid('only COMMITTED zero-posting groups are supported');
    const transition = createAuthoritativeTransition({
      command: frame.command,
      events: frame.events,
      worldVersionBefore: version,
      worldVersionAfter: (BigInt(version) + 1n).toString(),
    });
    if (canonicalSerialize(transition) !== canonicalSerialize(frame.transition))
      invalid('canonical whole transition required');
    validateFinalReceiptForCommand({
      command: frame.command,
      transition,
      receipt: frame.receipt,
    });
    if (!isSimTime(frame.receipt.simTime))
      invalid('genuine canonical COMMITTED receipt SimTime required');
    const receipt = createFinalCommandReceipt({
      command: frame.command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: frame.command.simTime,
      recordedAtReal: frame.receipt.recordedAtReal,
    });
    if (canonicalSerialize(receipt) !== canonicalSerialize(frame.receipt))
      invalid(
        'canonical COMMITTED receipt identity, reason and SimTime required',
      );
    version = transition.worldVersionAfter;
  }
  if (version !== replay.budgetState.worldVersion)
    invalid('complete prefix from H0 required');
  if (version === '0') return base;
  // No balance, account, claim, money or reservation is created here. Budget
  // encumbrances and Social wage reservations remain the mixed replay result;
  // they must still be included once by the owning source consumer.
  const current = authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({
      worldId: base.worldId,
      worldVersion: version,
      accounts: base.accounts,
      positions: base.positions,
      appliedBatches: base.appliedBatches,
    }),
  );
  inheritProductionDepositInstruments(current, base);
  return current;
}
