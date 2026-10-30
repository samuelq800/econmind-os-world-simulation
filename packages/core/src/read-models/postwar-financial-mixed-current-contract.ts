/** Browser-safe derived read wire. This validates shape/scope, never issues
 * source custody, admission, ledger authority or spending permission. */
export const POSTWAR_FINANCIAL_MIXED_CURRENT_NATURE =
  'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX' as const;
export const POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA =
  'postwar-financial-current-prefix-coverage-v2' as const;
export const POSTWAR_FINANCIAL_MIXED_REDUCER =
  'POSTWAR_FINANCIAL_SOCIAL_FX_COMPLETE_PREFIX_V2' as const;
export const POSTWAR_FINANCIAL_MIXED_DATASETS = Object.freeze({
  FINANCE: Object.freeze([
    'currency-fx',
    'opening-financial-legs',
    'ledger-balances',
    'treasury-capacity',
  ] as const),
  CENTRAL_BANK: Object.freeze([
    'currency-fx',
    'cb-categories',
    'cb-holdings',
    'bank-loans',
    'opening-financial-legs',
    'ledger-balances',
  ] as const),
});
export type PostwarFinancialMixedOffice =
  keyof typeof POSTWAR_FINANCIAL_MIXED_DATASETS;
export interface PostwarFinancialMixedCoverage {
  readonly schemaVersion: typeof POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA;
  readonly reducerVersion: typeof POSTWAR_FINANCIAL_MIXED_REDUCER;
  readonly countryId: string;
  readonly coverageRef: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly coveredThroughEventId: string | null;
  readonly coveredThroughEventFingerprint: string | null;
  /** Actual leg count and batch count across the complete ordered prefix. */
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
}
export interface PostwarMixedFinancialBalanceRow {
  readonly schemaVersion: 'postwar-current-financial-balance-row-v2';
  readonly countryId: string;
  readonly accountId: string;
  readonly ownerEntityId: string;
  readonly ownerKind: 'GOV' | 'CB' | 'BANK';
  readonly currency: string;
  readonly accountClass: string;
  readonly claimId: string | null;
  readonly counterpartyEntityId: string | null;
  /** Signed debit balance. Liabilities/equity retain their actual sign. */
  readonly netDebitBalance: string;
  readonly balanceNature:
    'RECIPROCAL_LEDGER_CLAIM' | 'GCU_CASH' | 'LEDGER_POSITION';
}
export interface PostwarMixedTreasuryCapacityRow {
  readonly schemaVersion: 'postwar-treasury-capacity-row-v2';
  readonly countryId: string;
  readonly accountId: string;
  readonly claimId: string;
  readonly currency: string;
  readonly treasuryLedgerClaimBalance: string;
  readonly openingReservedCapacity: string;
  readonly budgetEnvelopeCapacity: string;
  readonly additionalPayrollReservedCapacity: string;
  readonly totalReservedCapacity: string;
  readonly availableCapacity: string;
  readonly governmentGcuCurrency: 'GCU';
  readonly governmentGcuCashBalance: string;
  readonly governmentGcuAccountIds: readonly string[];
  readonly reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED';
  readonly balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET';
  readonly gcuBalanceNature: 'GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES';
}
function invalid(reason: string): never {
  throw Error('POSTWAR_MIXED_FINANCIAL_WIRE:' + reason);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('OBJECT_REQUIRED');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    invalid('EXACT_FIELDS_REQUIRED');
}
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9]\d*)$/u.test(v) && v.length <= 20;
const fingerprint = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
const decimal = (v: unknown, signed = false): v is string =>
  typeof v === 'string' &&
  v.length <= 256 &&
  (signed ? /^-?(0|[1-9]\d*)(\.\d+)?$/u : /^(0|[1-9]\d*)(\.\d+)?$/u).test(v) &&
  !(signed && /^-0(?:\.0+)?$/u.test(v));
function sumEquals(total: string, parts: readonly string[]): boolean {
  const values = [total, ...parts];
  const scale = Math.max(...values.map((v) => (v.split('.')[1] ?? '').length));
  const integer = (v: string) => {
    const [whole, fraction = ''] = v.split('.');
    return BigInt(whole! + fraction.padEnd(scale, '0'));
  };
  return integer(total) === parts.reduce((sum, v) => sum + integer(v), 0n);
}
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
export function parsePostwarFinancialMixedCoverage(
  value: unknown,
  scope: { countryId: string; worldVersion: string; eventSequence: string },
): PostwarFinancialMixedCoverage {
  const c = object(value);
  exact(c, [
    'schemaVersion',
    'reducerVersion',
    'countryId',
    'coverageRef',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'globalWorldVersion',
    'globalEventSequence',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'financialPostingCount',
    'financialBatchCount',
    'financialPostingsFingerprint',
  ]);
  if (
    c.schemaVersion !== POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA ||
    c.reducerVersion !== POSTWAR_FINANCIAL_MIXED_REDUCER ||
    c.countryId !== scope.countryId ||
    !id(c.countryId) ||
    !id(c.coverageRef) ||
    !uint(c.globalWorldVersion) ||
    !uint(c.globalEventSequence) ||
    c.globalWorldVersion !== scope.worldVersion ||
    c.globalEventSequence !== scope.eventSequence ||
    ![
      c.prefixFingerprint,
      c.knownEffectsFingerprint,
      c.financialPostingsFingerprint,
    ].every(fingerprint) ||
    !uint(c.financialPostingCount) ||
    !uint(c.financialBatchCount) ||
    BigInt(c.financialBatchCount) > BigInt(c.financialPostingCount) ||
    (c.financialPostingCount === '0') !== (c.financialBatchCount === '0')
  )
    invalid('EXACT_COMPLETE_POSTING_COVERAGE_REQUIRED');
  if (c.globalWorldVersion === '0' && c.globalEventSequence === '0') {
    if (
      c.coveredThroughEventId !== null ||
      c.coveredThroughEventFingerprint !== null ||
      c.financialPostingCount !== '0'
    )
      invalid('GENESIS_COVERAGE_REQUIRED');
  } else if (
    c.globalWorldVersion === '0' ||
    c.globalEventSequence === '0' ||
    !id(c.coveredThroughEventId) ||
    !fingerprint(c.coveredThroughEventFingerprint)
  )
    invalid('ACTUAL_LAST_EVENT_REQUIRED');
  return immutable({ ...c }) as unknown as PostwarFinancialMixedCoverage;
}
export function parsePostwarMixedFinancialBalanceRow(
  value: unknown,
  scope: { countryId: string; officeId: PostwarFinancialMixedOffice },
): PostwarMixedFinancialBalanceRow {
  const r = object(value);
  exact(r, [
    'schemaVersion',
    'countryId',
    'accountId',
    'ownerEntityId',
    'ownerKind',
    'currency',
    'accountClass',
    'claimId',
    'counterpartyEntityId',
    'netDebitBalance',
    'balanceNature',
  ]);
  if (
    r.schemaVersion !== 'postwar-current-financial-balance-row-v2' ||
    r.countryId !== scope.countryId ||
    ![r.accountId, r.ownerEntityId, r.currency].every(id) ||
    ![
      'ASSET',
      'CASH',
      'DEPOSIT',
      'EQUITY',
      'EXPENSE',
      'LIABILITY',
      'PAYABLE',
      'RECEIVABLE',
      'REVENUE',
    ].includes(String(r.accountClass)) ||
    !decimal(r.netDebitBalance, true) ||
    (r.claimId !== null && !id(r.claimId)) ||
    (r.counterpartyEntityId !== null && !id(r.counterpartyEntityId)) ||
    !['RECIPROCAL_LEDGER_CLAIM', 'GCU_CASH', 'LEDGER_POSITION'].includes(
      String(r.balanceNature),
    )
  )
    invalid('SCOPED_BALANCE_ROW_REQUIRED');
  if (
    scope.officeId === 'FINANCE'
      ? r.ownerKind !== 'GOV'
      : !['CB', 'BANK'].includes(String(r.ownerKind))
  )
    invalid('OFFICE_OWNER_VISIBILITY_REQUIRED');
  if (
    r.balanceNature === 'RECIPROCAL_LEDGER_CLAIM' &&
    (r.claimId === null || r.counterpartyEntityId === null)
  )
    invalid('ACTUAL_RECIPROCAL_CLAIM_REQUIRED');
  if (
    r.balanceNature === 'GCU_CASH' &&
    (r.currency !== 'GCU' ||
      r.accountClass !== 'CASH' ||
      !decimal(r.netDebitBalance))
  )
    invalid('ACTUAL_NONNEGATIVE_GCU_CASH_REQUIRED');
  return immutable({ ...r }) as unknown as PostwarMixedFinancialBalanceRow;
}
export function parsePostwarMixedTreasuryCapacityRow(
  value: unknown,
  countryId: string,
): PostwarMixedTreasuryCapacityRow {
  const r = object(value);
  exact(r, [
    'schemaVersion',
    'countryId',
    'accountId',
    'claimId',
    'currency',
    'treasuryLedgerClaimBalance',
    'openingReservedCapacity',
    'budgetEnvelopeCapacity',
    'additionalPayrollReservedCapacity',
    'totalReservedCapacity',
    'availableCapacity',
    'governmentGcuCurrency',
    'governmentGcuCashBalance',
    'governmentGcuAccountIds',
    'reservationNature',
    'balanceNature',
    'gcuBalanceNature',
  ]);
  if (
    r.schemaVersion !== 'postwar-treasury-capacity-row-v2' ||
    r.countryId !== countryId ||
    ![r.accountId, r.claimId, r.currency].every(id) ||
    ![
      'treasuryLedgerClaimBalance',
      'openingReservedCapacity',
      'budgetEnvelopeCapacity',
      'additionalPayrollReservedCapacity',
      'totalReservedCapacity',
      'availableCapacity',
      'governmentGcuCashBalance',
    ].every((k) => decimal(r[k])) ||
    r.governmentGcuCurrency !== 'GCU' ||
    !Array.isArray(r.governmentGcuAccountIds) ||
    r.governmentGcuAccountIds.length > 100 ||
    !r.governmentGcuAccountIds.every(id) ||
    new Set(r.governmentGcuAccountIds).size !==
      r.governmentGcuAccountIds.length ||
    r.reservationNature !== 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED' ||
    r.balanceNature !== 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET' ||
    r.gcuBalanceNature !== 'GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES'
  )
    invalid('ACTUAL_SCOPED_CAPACITY_ROW_REQUIRED');
  if (
    !sumEquals(r.totalReservedCapacity as string, [
      r.openingReservedCapacity as string,
      r.budgetEnvelopeCapacity as string,
      r.additionalPayrollReservedCapacity as string,
    ]) ||
    !sumEquals(r.treasuryLedgerClaimBalance as string, [
      r.totalReservedCapacity as string,
      r.availableCapacity as string,
    ]) ||
    (r.governmentGcuAccountIds.length === 0 &&
      !/^0(?:\.0+)?$/u.test(r.governmentGcuCashBalance as string))
  )
    invalid('CAPACITY_CONSERVATION_REQUIRED');
  return immutable({
    ...r,
    governmentGcuAccountIds: [...r.governmentGcuAccountIds],
  }) as unknown as PostwarMixedTreasuryCapacityRow;
}
