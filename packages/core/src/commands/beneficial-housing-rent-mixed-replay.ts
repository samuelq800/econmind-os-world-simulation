/** Fixed rent-domain reducer for the complete mixed-prefix orchestrator. These
 * private origins are replay DATA, never source admission, Clock or execution
 * authority. The owning orchestrator must reduce every sibling frame and bind
 * the full ordered prefix; this helper never skips or classifies other frames. */
import { canonicalSerialize } from '../serialization/canonical.js';
import { validateCanonicalCommand, type Sha256Hex } from './command.js';
import {
  createAuthoritativeTransition,
  createFinalCommandReceipt,
} from './receipt.js';
import {
  BENEFICIAL_HOUSING_RENT_COMMAND,
  aggregateBeneficialHousingLiquidClaim,
  createBeneficialHousingRentState,
  synchronizeBeneficialHousingRentState,
  settleBeneficialHousingRent,
  type BeneficialHousingReclassificationReceipt,
  type BeneficialHousingRentState,
} from '../finance/beneficial-housing-rent.js';
import type { FinancialLedgerState } from '../finance/financial-ledger.js';
import type { FinanceNativeBudgetCanonicalFrame } from './finance-budget-native.js';
export interface BeneficialHousingRentMixedReplayOrigin {
  readonly countryId: string;
  readonly receipt: Readonly<BeneficialHousingReclassificationReceipt>;
  readonly state: Readonly<BeneficialHousingRentState>;
}
export interface BeneficialHousingRentMixedReplayResult {
  readonly financial: Readonly<FinancialLedgerState>;
  readonly origins: readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[];
}
const issued = new WeakSet<object>();
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(reason: string): never {
  throw Error('BENEFICIAL_RENT_MIXED:' + reason);
}
function origin(
  receipt: Readonly<BeneficialHousingReclassificationReceipt>,
  state: Readonly<BeneficialHousingRentState>,
): Readonly<BeneficialHousingRentMixedReplayOrigin> {
  const value = Object.freeze({ countryId: receipt.countryId, receipt, state });
  issued.add(value);
  return value;
}
function check(
  origins: readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[],
  financial: Readonly<FinancialLedgerState>,
): void {
  if (
    !origins.length ||
    origins.length > 70 ||
    new Set(origins.map((o) => o.countryId)).size !== origins.length
  )
    invalid('FINITE_UNIQUE_COUNTRY_ORIGINS_REQUIRED');
  for (const o of origins) {
    if (
      !issued.has(o) ||
      o.countryId !== o.receipt.countryId ||
      o.receipt.worldId !== financial.worldId
    )
      invalid('GENUINE_SAME_WORLD_RENT_ORIGIN_REQUIRED');
    aggregateBeneficialHousingLiquidClaim(financial, o.receipt);
  }
}
/** Receipts must already be genuine Core reclassifications of the exact
 * admitted seed. No field, signature boolean or caller callback mints them. */
export function createBeneficialHousingRentMixedReplayOrigins(input: {
  readonly financial: Readonly<FinancialLedgerState>;
  readonly receipts: readonly Readonly<BeneficialHousingReclassificationReceipt>[];
}): readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[] {
  if (input.financial.worldVersion !== '0')
    invalid('GENUINE_H0_FINANCIAL_ORIGIN_REQUIRED');
  const values = Object.freeze(
    input.receipts.map((receipt) =>
      origin(receipt, createBeneficialHousingRentState(receipt)),
    ),
  );
  check(values, input.financial);
  return values;
}
/** Advance this domain only after the full orchestrator has actually reduced a
 * sibling's effects into the genuine ledger. This returns no mixed evidence. */
export function synchronizeBeneficialHousingRentMixedReplayOrigins(input: {
  readonly origins: readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[];
  readonly financial: Readonly<FinancialLedgerState>;
  readonly sha256Hex: Sha256Hex;
}): readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[] {
  check(input.origins, input.financial);
  return Object.freeze(
    input.origins.map((o) =>
      origin(
        o.receipt,
        synchronizeBeneficialHousingRentState(
          { receipt: o.receipt, state: o.state, financial: input.financial },
          input.sha256Hex,
        ),
      ),
    ),
  );
}
/** Exact command/group/FINAL/posting reduction. A balanced substituted batch,
 * early period, wrong rights scope, copied origin or repeated frame refuses. */
export function replayBeneficialHousingRentMixedFrame(input: {
  readonly origins: readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[];
  readonly financial: Readonly<FinancialLedgerState>;
  readonly frame: Readonly<FinanceNativeBudgetCanonicalFrame>;
  readonly sha256Hex: Sha256Hex;
}): Readonly<BeneficialHousingRentMixedReplayResult> {
  check(input.origins, input.financial);
  const frame = input.frame,
    command = validateCanonicalCommand(frame.command, input.sha256Hex);
  if (
    command.commandType !== BENEFICIAL_HOUSING_RENT_COMMAND ||
    command.officeId !== null ||
    command.worldId !== input.financial.worldId ||
    command.expectedWorldVersion !== input.financial.worldVersion ||
    frame.inventoryPostings.length !== 0 ||
    frame.financialPostingBatches.length !== 1
  )
    invalid('EXACT_AUTOMATIC_RENT_FRAME_REQUIRED');
  const selected = input.origins.find((o) => o.countryId === command.countryId);
  if (!selected) invalid('COUNTRY_RENT_ORIGINAL_REQUIRED');
  const payload: unknown = JSON.parse(command.canonicalPayload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    invalid('EXACT_RENT_PAYLOAD_REQUIRED');
  const p = payload as Record<string, unknown>;
  if (
    typeof p.leaseId !== 'string' ||
    typeof p.periodIndex !== 'string' ||
    p.genesisReceiptFingerprint !== selected.receipt.fingerprint
  )
    invalid('EXACT_RENT_RIGHTS_REFERENCE_REQUIRED');
  const transition = createAuthoritativeTransition({
    command,
    events: frame.events,
    worldVersionBefore: input.financial.worldVersion,
    worldVersionAfter: (BigInt(input.financial.worldVersion) + 1n).toString(),
  });
  const expectedReceipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: frame.receipt.recordedAtReal,
  });
  if (
    !same(transition, frame.transition) ||
    !same(expectedReceipt, frame.receipt)
  )
    invalid('EXACT_CANONICAL_TRANSITION_AND_FINAL_REQUIRED');
  const current = synchronizeBeneficialHousingRentState(
    {
      receipt: selected.receipt,
      state: selected.state,
      financial: input.financial,
    },
    input.sha256Hex,
  );
  const reduced = settleBeneficialHousingRent(
    {
      receipt: selected.receipt,
      state: current,
      financialBefore: input.financial,
      command,
      transition,
      leaseId: p.leaseId,
      periodIndex: p.periodIndex,
    },
    input.sha256Hex,
  );
  if (
    reduced.outcome !== 'APPLIED' ||
    !reduced.posting ||
    !same([reduced.posting], frame.financialPostingBatches)
  )
    invalid('EXACT_CORE_RENT_POSTING_REQUIRED');
  const next = Object.freeze(
    input.origins.map((o) =>
      o === selected ? origin(o.receipt, reduced.state) : o,
    ),
  );
  return Object.freeze({
    financial: reduced.financial,
    origins: synchronizeBeneficialHousingRentMixedReplayOrigins({
      origins: next,
      financial: reduced.financial,
      sha256Hex: input.sha256Hex,
    }),
  });
}
