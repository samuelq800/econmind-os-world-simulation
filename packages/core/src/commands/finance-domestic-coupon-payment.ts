// NON_ACTIVATED pure preparation. No intake registration, permission, source
// admission, persistence, clock operation or authority issuer is installed here.
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  FINANCIAL_POSTING_SCHEMA_VERSION,
  createFinancialPostingBatch,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingDirection,
} from '../finance/financial-ledger.js';
import { financialPostingBatchId, financialPostingLegId } from '../ids.js';
import { Money } from '../numeric/money.js';
import { SimTime } from '../numeric/sim-time.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
} from '../events/event.js';
import {
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import { createAuthoritativeTransition } from './receipt.js';

/** Identifies an unregistered Core mechanism, NOT an Office capability. */
export const DOMESTIC_COUPON_MECHANISM =
  'FINANCE_SETTLE_DOMESTIC_COUPON_V1' as const;
export type DomesticCouponAccountRole =
  | 'GOV_TGA_ASSET'
  | 'GOV_COUPON_PAYABLE'
  | 'CB_TGA_LIABILITY'
  | 'CB_COUPON_RECEIVABLE';
export interface DomesticCouponScope {
  readonly worldId: string;
  readonly countryId: string;
  readonly payerEntityId: string;
  readonly tgaAccountId: string;
  readonly nativeCurrency: string;
  readonly actualEffectivePeriod: string;
  readonly operationPurpose: 'SETTLE_EXISTING_RECOGNIZED_DUE_COUPON';
  readonly obligationId: string;
  readonly couponComponentId: string;
}
export interface DomesticCouponIntent {
  readonly schemaVersion: 'domestic-coupon-intent-v1';
  readonly obligationId: string;
  readonly couponComponentId: string;
  readonly amount: string;
  readonly currency: string;
  readonly actualEffectivePeriod: string;
  readonly dueSimTime: string;
  /** Identity binding only; a hash is not admission or legal evidence. */
  readonly sourceHash: string;
}
/** Declared source data for a conditional pure calculation. None of these
 * strings/COMPLETE declarations certifies legal source eligibility. A future
 * server source reader and required transaction cutoff remain separate. */
export interface DomesticCouponFacts {
  readonly scope: DomesticCouponScope;
  readonly centralBankId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly simTime: string;
  readonly sourceRef: string;
  readonly roleMapRef: string;
  readonly lineage: {
    readonly status: string | null;
    readonly reference: string | null;
  };
  /** Exact existing registry objects, not class-based role inference or account
   * creation. Source-owned role/class eligibility is not issued by this DTO. */
  readonly roleMap: Readonly<
    Record<DomesticCouponAccountRole, FinancialAccount>
  >;
  readonly coupon: {
    readonly kind: string | null;
    readonly recognition: string | null;
    readonly recognitionRef: string | null;
    readonly termsRef: string | null;
    readonly claimId: string;
    readonly outstanding: string;
    readonly dueSimTime: string;
  };
  readonly history: {
    readonly status: string | null;
    readonly reference: string | null;
    readonly settledComponentIds: readonly string[];
    readonly releasedOrReversedComponentIds: readonly string[];
  };
  readonly clockBinding: {
    readonly status: string | null;
    readonly epochRef: string | null;
    readonly revisionRef: string | null;
    readonly periodRef: string | null;
  };
  readonly spendability: {
    readonly status: string | null;
    readonly partitionRef: string | null;
    readonly otherRestricted: {
      readonly shareId: string;
      readonly amount: string;
    };
    readonly thisCouponRetained: {
      readonly shareId: string;
      readonly amount: string;
    };
    readonly unencumbered: {
      readonly shareId: string;
      readonly amount: string;
    };
  };
  readonly fee: {
    readonly kind: string | null;
    readonly basisRef: string | null;
    readonly scope: DomesticCouponScope | null;
  };
  readonly buffer: {
    readonly kind: string | null;
    readonly amount: string | null;
    readonly basisKind: string | null;
    readonly independentLegalBasisRef: string | null;
    readonly adoptionRef: string | null;
    readonly scope: DomesticCouponScope | null;
    readonly priority: {
      readonly kind: string | null;
      readonly couponComponentId: string | null;
      readonly basisRef: string | null;
    } | null;
  };
}
export interface DomesticCouponSource {
  readonly facts: DomesticCouponFacts;
  /** Existing opening + posting-lineage state, never a parsed raw snapshot. */
  readonly financialState: FinancialLedgerState;
}

const ROLES = [
  'GOV_TGA_ASSET',
  'GOV_COUPON_PAYABLE',
  'CB_TGA_LIABILITY',
  'CB_COUPON_RECEIVABLE',
] as const;
const SCOPE_KEYS = [
  'worldId',
  'countryId',
  'payerEntityId',
  'tgaAccountId',
  'nativeCurrency',
  'actualEffectivePeriod',
  'operationPurpose',
  'obligationId',
  'couponComponentId',
] as const;
const MAX_COUNTER = 9_223_372_036_854_775_807n;
function fail(reason: string): never {
  // Local preparation reasons, not new approved public wire error codes.
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Domestic coupon: ${reason}`,
  );
}
function demand(ok: unknown, reason: string): asserts ok {
  if (!ok) fail(reason);
}
function keys(value: unknown, expected: readonly string[]): void {
  demand(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'UNAVAILABLE_RECORD',
  );
  demand(
    Object.keys(value).sort().join('|') === [...expected].sort().join('|'),
    'MISSING_OR_EXTRA_FIELDS',
  );
}
function ref(value: unknown): asserts value is string {
  demand(
    typeof value === 'string' &&
      value !== 'UNKNOWN' &&
      /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(value) &&
      value.length <= 256,
    'UNAVAILABLE_REFERENCE',
  );
}
function counter(value: string): bigint {
  demand(
    typeof value === 'string' &&
      /^(?:0|[1-9]\d*)$/u.test(value) &&
      value.length <= 19,
    'INVALID_COUNTER',
  );
  const n = BigInt(value);
  demand(n <= MAX_COUNTER, 'COUNTER_OUT_OF_RANGE');
  return n;
}
function money(value: string, currency: string, positive = false): Money {
  const result = Money.from(value, currency);
  demand(
    canonicalDecimal(result.amount) === value &&
      (positive ? result.amount.isPositive() : !result.amount.isNegative()),
    'INVALID_EXACT_AMOUNT',
  );
  return result;
}
function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) immutable(v);
    Object.freeze(value);
  }
  return value;
}
function scopeMatch(
  value: DomesticCouponScope | null,
  expected: DomesticCouponScope,
  reason: string,
): void {
  demand(value !== null, 'UNAVAILABLE_RULE_SCOPE');
  keys(value, SCOPE_KEYS);
  for (const k of SCOPE_KEYS) ref(value[k]);
  demand(canonicalSerialize(value) === canonicalSerialize(expected), reason);
}

export function parseDomesticCouponIntent(
  command: CanonicalCommand,
  sha256Hex: Sha256Hex,
): Readonly<DomesticCouponIntent> {
  validateCanonicalCommand(command, sha256Hex);
  demand(
    command.commandType === DOMESTIC_COUPON_MECHANISM &&
      command.officeId === 'FINANCE' &&
      command.expectedWorldVersion !== null &&
      command.idempotencyKey !== null,
    'UNSUPPORTED_MECHANISM_INTENT',
  );
  const intent = JSON.parse(command.canonicalPayload) as DomesticCouponIntent;
  keys(intent, [
    'schemaVersion',
    'obligationId',
    'couponComponentId',
    'amount',
    'currency',
    'actualEffectivePeriod',
    'dueSimTime',
    'sourceHash',
  ]);
  demand(
    intent.schemaVersion === 'domestic-coupon-intent-v1',
    'UNSUPPORTED_INTENT_VERSION',
  );
  for (const value of [
    intent.obligationId,
    intent.couponComponentId,
    intent.actualEffectivePeriod,
  ])
    ref(value);
  money(intent.amount, intent.currency, true);
  counter(intent.dueSimTime);
  demand(
    typeof intent.sourceHash === 'string' &&
      /^sha256:[0-9a-f]{64}$/u.test(intent.sourceHash),
    'INVALID_SOURCE_HASH',
  );
  return immutable(intent);
}

/** Pure conditional preparation only. It returns no writable ledger state,
 * COMMITTED receipt, capability or source-adoption token. It cannot certify
 * declared legal/clock/history facts; a future trusted reader/cutoff must. */
export function prepareDomesticCouponPayment(input: {
  readonly command: CanonicalCommand;
  readonly source: DomesticCouponSource;
  readonly recordedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}) {
  const { command, source, sha256Hex } = input;
  const intent = parseDomesticCouponIntent(command, sha256Hex);
  const serialized = canonicalSerialize(source.facts);
  demand(serialized.length <= 65_536, 'SOURCE_RECORD_TOO_LARGE');
  const f = JSON.parse(serialized) as DomesticCouponFacts;
  keys(f, [
    'scope',
    'centralBankId',
    'worldVersion',
    'eventSequence',
    'simTime',
    'sourceRef',
    'roleMapRef',
    'lineage',
    'roleMap',
    'coupon',
    'history',
    'clockBinding',
    'spendability',
    'fee',
    'buffer',
  ]);
  demand(
    canonicalSha256(canonicalHashInput(f), sha256Hex) === intent.sourceHash,
    'SOURCE_INTENT_MISMATCH',
  );
  keys(f.scope, SCOPE_KEYS);
  for (const k of SCOPE_KEYS) ref(f.scope[k]);
  for (const v of [f.centralBankId, f.sourceRef, f.roleMapRef]) ref(v);
  const s = f.scope,
    currency = s.nativeCurrency;
  demand(
    s.worldId === command.worldId &&
      s.countryId === command.countryId &&
      s.payerEntityId !== f.centralBankId &&
      s.operationPurpose === 'SETTLE_EXISTING_RECOGNIZED_DUE_COUPON' &&
      intent.obligationId === s.obligationId &&
      intent.couponComponentId === s.couponComponentId &&
      intent.actualEffectivePeriod === s.actualEffectivePeriod &&
      intent.currency === currency,
    'SCOPE_MISMATCH',
  );
  demand(
    isAuthoritativeFinancialLedgerState(source.financialState),
    'UNAVAILABLE_OPENING_POSTING_LINEAGE',
  );
  demand(
    source.financialState.worldId === s.worldId &&
      source.financialState.worldVersion === f.worldVersion &&
      f.worldVersion === command.expectedWorldVersion &&
      counter(f.worldVersion) < MAX_COUNTER &&
      counter(f.eventSequence) < MAX_COUNTER &&
      counter(f.simTime) === command.simTime.ticks,
    'STALE_WORLD_OR_TIME',
  );
  keys(f.lineage, ['status', 'reference']);
  demand(
    f.lineage.status === 'COMPLETE_OPENING_POSTING_DECLARATION',
    'UNAVAILABLE_LINEAGE',
  );
  ref(f.lineage.reference);
  keys(f.coupon, [
    'kind',
    'recognition',
    'recognitionRef',
    'termsRef',
    'claimId',
    'outstanding',
    'dueSimTime',
  ]);
  demand(
    f.coupon.kind === 'COUPON' &&
      f.coupon.recognition === 'EXISTING_RECOGNIZED',
    'UNAVAILABLE_RECOGNIZED_COUPON',
  );
  for (const v of [
    f.coupon.recognitionRef,
    f.coupon.termsRef,
    f.coupon.claimId,
  ])
    ref(v);
  const amount = money(intent.amount, currency, true);
  demand(
    money(f.coupon.outstanding, currency, true).amount.eq(amount.amount),
    'FULL_COUPON_ONLY',
  );
  demand(
    f.coupon.dueSimTime === intent.dueSimTime &&
      counter(f.coupon.dueSimTime) <= command.simTime.ticks,
    'COUPON_NOT_DUE',
  );
  keys(f.clockBinding, ['status', 'epochRef', 'revisionRef', 'periodRef']);
  demand(
    f.clockBinding.status === 'RUNNING_DECLARATION',
    'UNAVAILABLE_RUNNING_CLOCK_BINDING',
  );
  for (const v of [
    f.clockBinding.epochRef,
    f.clockBinding.revisionRef,
    f.clockBinding.periodRef,
  ])
    ref(v);
  demand(
    f.clockBinding.periodRef === s.actualEffectivePeriod,
    'CLOCK_PERIOD_MISMATCH',
  );
  keys(f.history, [
    'status',
    'reference',
    'settledComponentIds',
    'releasedOrReversedComponentIds',
  ]);
  demand(f.history.status === 'COMPLETE_DECLARATION', 'UNAVAILABLE_HISTORY');
  ref(f.history.reference);
  for (const list of [
    f.history.settledComponentIds,
    f.history.releasedOrReversedComponentIds,
  ]) {
    demand(
      Array.isArray(list) &&
        list.length <= 64 &&
        new Set(list).size === list.length,
      'INVALID_COMPONENT_HISTORY',
    );
    for (const component of list) ref(component);
  }
  demand(
    !f.history.settledComponentIds.includes(s.couponComponentId),
    'COMPONENT_ALREADY_SETTLED',
  );
  demand(
    !f.history.releasedOrReversedComponentIds.includes(s.couponComponentId),
    'UNSUPPORTED_RELEASE_OR_REVERSAL',
  );
  keys(f.fee, ['kind', 'basisRef', 'scope']);
  demand(
    f.fee.kind !== null && f.fee.kind !== 'UNKNOWN',
    'UNAVAILABLE_FEE_RULE',
  );
  demand(f.fee.kind === 'NOT_APPLICABLE', 'UNSUPPORTED_FEE_COMPONENT');
  ref(f.fee.basisRef);
  scopeMatch(f.fee.scope, s, 'FEE_SCOPE_MISMATCH');
  keys(f.buffer, [
    'kind',
    'amount',
    'basisKind',
    'independentLegalBasisRef',
    'adoptionRef',
    'scope',
    'priority',
  ]);
  // Dispatch kind BEFORE thresholds: an operating target is never a hard freeze.
  if (
    [
      'B04_OPERATING_TARGET',
      'OPERATING_TARGET_WITH_DRAWDOWN_RECOMPUTE',
      'OTHER_KNOWN_UNSUPPORTED_KIND',
    ].includes(f.buffer.kind ?? '')
  )
    fail('UNSUPPORTED_BUFFER_RULE_KIND');
  demand(f.buffer.kind === 'HARD_MINIMUM', 'UNAVAILABLE_BUFFER_RULE_KIND');
  demand(
    f.buffer.basisKind === 'INDEPENDENT_LEGAL_HARD_MINIMUM',
    'UNAVAILABLE_INDEPENDENT_BUFFER_BASIS',
  );
  ref(f.buffer.independentLegalBasisRef);
  ref(f.buffer.adoptionRef);
  scopeMatch(f.buffer.scope, s, 'UNSUPPORTED_BUFFER_RULE_SCOPE_OR_PRIORITY');
  demand(f.buffer.priority !== null, 'UNAVAILABLE_BUFFER_PRIORITY');
  keys(f.buffer.priority, ['kind', 'couponComponentId', 'basisRef']);
  demand(
    f.buffer.priority.kind !== null && f.buffer.priority.kind !== 'UNKNOWN',
    'UNAVAILABLE_BUFFER_PRIORITY',
  );
  ref(f.buffer.priority.couponComponentId);
  ref(f.buffer.priority.basisRef);
  demand(
    f.buffer.priority.kind === 'APPLIES_TO_THIS_RECOGNIZED_DUE_COUPON' &&
      f.buffer.priority.couponComponentId === s.couponComponentId,
    'UNSUPPORTED_BUFFER_RULE_SCOPE_OR_PRIORITY',
  );
  demand(f.buffer.amount !== null, 'UNAVAILABLE_BUFFER_AMOUNT');
  const minimum = money(f.buffer.amount, currency);
  keys(f.roleMap, ROLES);
  const mapped = ROLES.map((role) => f.roleMap[role]);
  demand(
    new Set(mapped.map((a) => a?.accountId)).size === 4,
    'FOUR_DISTINCT_EXISTING_ACCOUNTS_REQUIRED',
  );
  const before = mapped.map((account, index) => {
    demand(
      account !== null && typeof account === 'object',
      'UNAVAILABLE_ACCOUNT',
    );
    const registered = source.financialState.accounts.find(
      (a) => a.accountId === account.accountId,
    );
    demand(
      registered !== undefined &&
        canonicalSerialize(registered) === canonicalSerialize(account),
      'ACCOUNT_NOT_IN_RECONSTRUCTED_REGISTRY',
    );
    // This is NOT a DEPOSIT-only eligibility profile. Concrete role/class
    // semantics remain source-owned. Explicitly forbidden economic effects
    // (equity or new accrual/income) cannot be disguised as a claim role.
    // A structural class alone never proves an eligible deposit/coupon; exact
    // reciprocal claims/normal-balance signs and the source-owned map also bind.
    demand(
      !['EQUITY', 'REVENUE', 'EXPENSE'].includes(account.accountClass),
      'UNSUPPORTED_ACCOUNT_ROLE_ENCODING',
    );
    const govOwned = index < 2;
    demand(
      account.worldId === s.worldId &&
        account.countryId === s.countryId &&
        account.currency === currency &&
        account.ownerId === (govOwned ? s.payerEntityId : f.centralBankId) &&
        account.counterpartyEntityId ===
          (govOwned ? f.centralBankId : s.payerEntityId) &&
        account.claimId !== null,
      'ACCOUNT_ROLE_SCOPE_OR_COUNTERPARTY_MISMATCH',
    );
    const position = source.financialState.positions.find(
      (p) => p.account.accountId === account.accountId,
    );
    // The generic ledger can use sparse0; this mechanism explicitly cannot.
    demand(
      position !== undefined &&
        canonicalSerialize(position.account) === canonicalSerialize(account),
      'UNAVAILABLE_EXPLICIT_ACCOUNT_BALANCE',
    );
    return position.netDebitBalance;
  });
  const [tga, payable, cbTga, receivable] = before as [
    Money,
    Money,
    Money,
    Money,
  ];
  const [govTgaAccount, govCouponAccount, cbTgaAccount, cbCouponAccount] =
    mapped as [
      FinancialAccount,
      FinancialAccount,
      FinancialAccount,
      FinancialAccount,
    ];
  demand(
    govTgaAccount.accountId === s.tgaAccountId &&
      govTgaAccount.claimId === cbTgaAccount.claimId &&
      govCouponAccount.claimId === cbCouponAccount.claimId &&
      govCouponAccount.claimId === f.coupon.claimId &&
      govTgaAccount.claimId !== govCouponAccount.claimId,
    'TWO_DISTINCT_RECIPROCAL_CLAIMS_REQUIRED',
  );
  demand(
    tga.amount.isPositive() &&
      tga.add(cbTga).amount.isZero() &&
      receivable.amount.eq(amount.amount) &&
      payable.add(amount).amount.isZero(),
    'ACCOUNT_SIGNS_OR_FULL_COMPONENT_BALANCE_MISMATCH',
  );
  demand(tga.amount.gte(amount.amount), 'INSUFFICIENT_TGA');
  keys(f.spendability, [
    'status',
    'partitionRef',
    'otherRestricted',
    'thisCouponRetained',
    'unencumbered',
  ]);
  demand(
    f.spendability.status === 'COMPLETE_DISJOINT_DECLARATION',
    'UNAVAILABLE_RESTRICTION_OVERLAP',
  );
  ref(f.spendability.partitionRef);
  const shares = [
    f.spendability.otherRestricted,
    f.spendability.thisCouponRetained,
    f.spendability.unencumbered,
  ].map((share) => {
    keys(share, ['shareId', 'amount']);
    ref(share.shareId);
    return money(share.amount, currency);
  });
  demand(
    new Set([
      f.spendability.otherRestricted.shareId,
      f.spendability.thisCouponRetained.shareId,
      f.spendability.unencumbered.shareId,
    ]).size === 3,
    'DUPLICATE_CASH_SHARE',
  );
  const [restricted, retained, free] = shares as [Money, Money, Money];
  demand(
    restricted.add(retained).add(free).amount.eq(tga.amount),
    'CASH_PARTITION_MISMATCH',
  );
  demand(retained.amount.lte(amount.amount), 'UNSUPPORTED_RETAINED_PORTION');
  const freeAfter = free.subtract(amount.subtract(retained));
  demand(!freeAfter.amount.isNegative(), 'INSUFFICIENT_SPENDABILITY');
  demand(
    freeAfter.amount.gte(minimum.amount),
    'APPLICABLE_HARD_MINIMUM_VIOLATED',
  );
  const directions: readonly FinancialPostingDirection[] = [
    'CREDIT',
    'DEBIT',
    'DEBIT',
    'CREDIT',
  ];
  const after = before.map((v, i) =>
    directions[i] === 'DEBIT' ? v.add(amount) : v.subtract(amount),
  );
  const nextVersion = (counter(f.worldVersion) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}_COUPON`,
      eventType: 'DOMESTIC_COUPON_PAYMENT_PREPARED_V1',
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: nextVersion,
      sequence: (counter(f.eventSequence) + 1n).toString(),
      simTime: SimTime.fromTicks(f.simTime).toCanonicalValue(),
      recordedAtReal: input.recordedAtReal,
      correctsEventId: null,
      payload: {
        mechanism: DOMESTIC_COUPON_MECHANISM,
        intent,
        sourceHash: intent.sourceHash,
        componentId: s.couponComponentId,
        amount: amount.toCanonicalValue(),
        roleMapRef: f.roleMapRef,
      },
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: f.worldVersion,
    worldVersionAfter: nextVersion,
    events: [event],
  });
  const counterpartIndexes = [2, 3, 0, 1];
  const financialBatch = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId(`BATCH_${command.commandId}_COUPON`),
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: [event.eventId],
      worldVersionBefore: f.worldVersion,
      worldVersionAfter: nextVersion,
      simTime: command.simTime,
      command,
      transition,
      settlementCurrency: currency,
      legs: mapped.map((account, i) => ({
        legId: financialPostingLegId(`LEG_${command.commandId}_${ROLES[i]}`),
        account,
        direction: directions[i]!,
        amount,
        counterpartyAccountId: mapped[counterpartIndexes[i]!]!.accountId,
      })),
    },
    sha256Hex,
  );
  return Object.freeze({
    status: 'PREPARED_NOT_COMMITTED' as const,
    authorityVerified: false as const,
    sourceAdopted: false as const,
    actualPayment: null,
    transition,
    financialBatch,
    projection: immutable({
      componentId: s.couponComponentId,
      outstandingAfter: '0',
      accounts: mapped.map((account, i) => ({
        accountId: account.accountId,
        before: before[i]!.toCanonicalValue().amount,
        after: after[i]!.toCanonicalValue().amount,
      })),
      tgaAfter: after[0]!.toCanonicalValue().amount,
      otherRestrictedAfter: restricted.toCanonicalValue().amount,
      thisCouponRetainedAfter: '0',
      unencumberedAfter: freeAfter.toCanonicalValue().amount,
      hardMinimum: minimum.toCanonicalValue().amount,
      principalDelta: '0',
      equityDelta: '0',
    }),
  });
}
