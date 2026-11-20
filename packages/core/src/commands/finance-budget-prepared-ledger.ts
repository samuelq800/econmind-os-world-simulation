/** Immutable data preparation only. No source admission, seat or command
 * authority is cached. Only a fully checked, zero-posting Budget prefix can
 * advance this genuine H0 financial base to its computed version. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  parseFinancialLedgerSnapshot,
  type FinancialLedgerState,
} from '../finance/financial-ledger.js';
import {
  authorizeFinancialLedgerState,
  isAuthoritativeFinancialLedgerState,
} from '../opening/ledger-authority.js';
import {
  createAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
} from './receipt.js';
import {
  replayFinanceNativeBudgetHistory,
  type FinanceNativeBudgetFrame,
} from './finance-budget-native.js';
import type { Sha256Hex } from './command.js';

declare const preparedLedger: unique symbol;
export interface PreparedFinanceBudgetLedger {
  readonly [preparedLedger]: true;
}
const bases = new WeakMap<
  PreparedFinanceBudgetLedger,
  Readonly<FinancialLedgerState>
>();
function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Prepared Budget ledger requires genuine H0 and complete canonical zero-effect Budget history',
  );
}
export function prepareFinanceBudgetLedger(
  base: Readonly<FinancialLedgerState>,
): PreparedFinanceBudgetLedger {
  if (!isAuthoritativeFinancialLedgerState(base) || base.worldVersion !== '0')
    invalid();
  const token = Object.freeze({}) as PreparedFinanceBudgetLedger;
  bases.set(token, base);
  return token;
}
export function replayPreparedFinanceBudgetLedger(input: {
  readonly prepared: PreparedFinanceBudgetLedger;
  readonly frames: readonly (FinanceNativeBudgetFrame & {
    readonly transition: AuthoritativeTransition;
    readonly receipt: FinalCommandReceipt;
    readonly financialPostingBatches: readonly unknown[];
    readonly inventoryPostings: readonly unknown[];
  })[];
  readonly sha256Hex: Sha256Hex;
}): Readonly<FinancialLedgerState> {
  const base = bases.get(input.prepared);
  if (!base || input.frames.length > 256) invalid();
  for (const frame of input.frames) {
    if (
      frame.financialPostingBatches.length ||
      frame.inventoryPostings.length ||
      frame.receipt.outcome !== 'COMMITTED'
    )
      invalid();
    const computed = createAuthoritativeTransition({
      command: frame.command,
      events: frame.events,
      worldVersionBefore: frame.transition.worldVersionBefore,
      worldVersionAfter: frame.transition.worldVersionAfter,
    });
    if (canonicalSerialize(computed) !== canonicalSerialize(frame.transition))
      invalid();
    validateFinalReceiptForCommand({
      command: frame.command,
      transition: computed,
      receipt: frame.receipt,
    });
  }
  const state = replayFinanceNativeBudgetHistory(
    base.worldId,
    input.frames,
    input.sha256Hex,
  );
  if (state.worldVersion === '0') return base;
  return authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({
      worldId: base.worldId,
      worldVersion: state.worldVersion,
      accounts: base.accounts,
      positions: base.positions,
      appliedBatches: base.appliedBatches,
    }),
  );
}
