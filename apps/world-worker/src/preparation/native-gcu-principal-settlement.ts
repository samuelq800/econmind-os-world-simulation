import { types } from 'node:util';
import { DomainError, Money } from '@econmind/core';
import type {
  CandidatePrincipalSelector,
  DeclaredGcuAmount,
  DeclaredPrincipalAccount,
  DeclaredPrincipalCalculation,
  DeclaredPrincipalPositions,
  ExcludedComponent,
  PrincipalCalculationBoundary,
  PrincipalCalculationResult,
  PrincipalCalculationUnavailable,
  PrincipalUnavailableReason,
  ProvisionalPrincipalLeg,
} from './native-gcu-principal-settlement-contract.js';

const BOUNDARY: Readonly<PrincipalCalculationBoundary> = Object.freeze({
  formalStatus: 'PORT_NOT_INSTALLED',
  formalPaymentAllowed: false,
  actualSettlement: false,
  sourceAdopted: false,
  titleVerified: false,
  termsVerified: false,
  permissionVerified: false,
  historyVerified: false,
  reserved: false,
});
const PAIRS = Object.freeze({
  SCENE_CLEARING_09_24_V2: ['ENTITY_CENTRAL_BANK_09', 'ENTITY_CENTRAL_BANK_24'],
  SCENE_CLEARING_13_24_V2: ['ENTITY_CENTRAL_BANK_13', 'ENTITY_CENTRAL_BANK_24'],
  SCENE_CLEARING_20_09_V2: ['ENTITY_CENTRAL_BANK_20', 'ENTITY_CENTRAL_BANK_09'],
  SCENE_CLEARING_20_24_V2: ['ENTITY_CENTRAL_BANK_20', 'ENTITY_CENTRAL_BANK_24'],
} as const);
const COMPONENTS: readonly ExcludedComponent[] = Object.freeze([
  'fee',
  'interest',
  'fx',
  'partial',
  'refund',
  'loan',
  'endowment',
]);

class DeclaredInputError extends Error {
  constructor(readonly reason: PrincipalUnavailableReason) {
    super(reason);
  }
}
function requireCondition(
  ok: unknown,
  reason: PrincipalUnavailableReason,
): asserts ok {
  if (!ok) throw new DeclaredInputError(reason);
}
function unavailable(
  reason: PrincipalUnavailableReason,
): PrincipalCalculationUnavailable {
  return Object.freeze({ ...BOUNDARY, status: 'UNAVAILABLE', reason });
}
/** Ignores the caller entirely, including getters/Proxy/environment/approval markers. */
export function formalNativeGcuPrincipalPayment(): PrincipalCalculationUnavailable {
  return unavailable('PORT_NOT_INSTALLED');
}

/** Reject behaviors BEFORE any ordinary object introspection or property access. */
function detachedDeclaration(input: unknown): unknown {
  let nodes = 0;
  function copy(value: unknown, depth: number): unknown {
    requireCondition(++nodes <= 256 && depth <= 8, 'MALFORMED_DECLARATION');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      requireCondition(value.length <= 512, 'MALFORMED_DECLARATION');
      return value;
    }
    requireCondition(
      typeof value === 'object' &&
        !types.isProxy(value) &&
        !Array.isArray(value),
      'MALFORMED_DECLARATION',
    );
    const prototype = Object.getPrototypeOf(value);
    requireCondition(
      prototype === Object.prototype || prototype === null,
      'MALFORMED_DECLARATION',
    );
    const descriptors = Object.getOwnPropertyDescriptors(value);
    requireCondition(
      Reflect.ownKeys(descriptors).length <= 32 &&
        Reflect.ownKeys(descriptors).every((key) => typeof key === 'string'),
      'MALFORMED_DECLARATION',
    );
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      requireCondition(
        'value' in descriptor && descriptor.enumerable,
        'MALFORMED_DECLARATION',
      );
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  }
  return copy(input, 0);
}
function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  requireCondition(
    value !== null && typeof value === 'object',
    'MALFORMED_DECLARATION',
  );
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result);
  requireCondition(
    actual.length === keys.length &&
      keys.every((key) => Object.hasOwn(result, key)),
    'MALFORMED_DECLARATION',
  );
  return result;
}
function reference(value: unknown): asserts value is string {
  requireCondition(
    typeof value === 'string' && value.length > 0 && value.length <= 512,
    'MALFORMED_DECLARATION',
  );
}
function declaredAmount(value: unknown): DeclaredGcuAmount {
  const row = record(value, ['status', 'amount', 'currency', 'reference']);
  reference(row.reference);
  requireCondition(
    row.status === 'DECLARED' || row.status === 'UNKNOWN',
    'MALFORMED_DECLARATION',
  );
  requireCondition(
    row.status === 'DECLARED' && row.amount !== null && row.currency !== null,
    'DECLARATION_UNKNOWN',
  );
  requireCondition(typeof row.amount === 'string', 'INVALID_EXACT_DECIMAL');
  requireCondition(row.currency === 'GCU', 'CURRENCY_MISMATCH');
  return row as unknown as DeclaredGcuAmount;
}
function account(value: unknown): DeclaredPrincipalAccount {
  const row = record(value, [
    'accountId',
    'ownerId',
    'accountClass',
    'claimId',
    'counterpartyId',
    'balance',
  ]);
  reference(row.accountId);
  reference(row.ownerId);
  reference(row.accountClass);
  requireCondition(
    row.claimId === null || typeof row.claimId === 'string',
    'MALFORMED_DECLARATION',
  );
  requireCondition(
    row.counterpartyId === null || typeof row.counterpartyId === 'string',
    'MALFORMED_DECLARATION',
  );
  declaredAmount(row.balance);
  return row as unknown as DeclaredPrincipalAccount;
}
function checkedDeclaration(value: unknown): DeclaredPrincipalCalculation {
  const root = record(value, [
    'schemaVersion',
    'claim',
    'requestedAmount',
    'accounts',
    'sharedPool',
    'components',
  ]);
  requireCondition(
    root.schemaVersion === 'DECLARED_GCU_PRINCIPAL_CALCULATION_V1',
    'MALFORMED_DECLARATION',
  );
  const claim = record(root.claim, [
    'selector',
    'issuerId',
    'holderId',
    'originalPrincipal',
    'remainingPrincipal',
    'history',
  ]);
  requireCondition(
    typeof claim.selector === 'string' && Object.hasOwn(PAIRS, claim.selector),
    'CLAIM_ACCOUNT_MISMATCH',
  );
  const pair = PAIRS[claim.selector as CandidatePrincipalSelector];
  requireCondition(
    claim.issuerId === pair[0] && claim.holderId === pair[1],
    'CLAIM_ACCOUNT_MISMATCH',
  );
  declaredAmount(claim.originalPrincipal);
  declaredAmount(claim.remainingPrincipal);
  const history = record(claim.history, ['status', 'reference']);
  reference(history.reference);
  requireCondition(history.status !== 'UNKNOWN', 'HISTORY_UNKNOWN');
  requireCondition(
    history.status !== 'DECLARED_FULLY_PAID',
    'DECLARED_ALREADY_PAID',
  );
  requireCondition(
    history.status === 'DECLARED_OUTSTANDING',
    'MALFORMED_DECLARATION',
  );
  declaredAmount(root.requestedAmount);
  const accounts = record(root.accounts, [
    'issuerCash',
    'holderCash',
    'issuerLiability',
    'holderReceivable',
  ]);
  const issuerCash = account(accounts.issuerCash);
  const holderCash = account(accounts.holderCash);
  const liability = account(accounts.issuerLiability);
  const receivable = account(accounts.holderReceivable);
  requireCondition(
    issuerCash.ownerId === pair[0] &&
      holderCash.ownerId === pair[1] &&
      liability.ownerId === pair[0] &&
      receivable.ownerId === pair[1] &&
      issuerCash.accountClass === 'CASH' &&
      holderCash.accountClass === 'CASH' &&
      issuerCash.claimId === null &&
      holderCash.claimId === null &&
      issuerCash.counterpartyId === null &&
      holderCash.counterpartyId === null &&
      ['LIABILITY', 'PAYABLE'].includes(liability.accountClass) &&
      ['ASSET', 'RECEIVABLE'].includes(receivable.accountClass) &&
      liability.claimId === claim.selector &&
      receivable.claimId === claim.selector &&
      liability.counterpartyId === pair[1] &&
      receivable.counterpartyId === pair[0] &&
      new Set(
        [issuerCash, holderCash, liability, receivable].map(
          (row) => row.accountId,
        ),
      ).size === 4,
    'CLAIM_ACCOUNT_MISMATCH',
  );
  const pool = record(root.sharedPool, ['reference', 'available']);
  reference(pool.reference);
  declaredAmount(pool.available);
  const components = record(root.components, COMPONENTS);
  for (const key of COMPONENTS) {
    const component = record(components[key], ['applicability', 'reference']);
    reference(component.reference);
    requireCondition(
      typeof component.applicability === 'string' &&
        ['DECLARED_NONE', 'REQUIRED', 'UNKNOWN'].includes(
          component.applicability,
        ),
      'MALFORMED_DECLARATION',
    );
    requireCondition(
      component.applicability === 'DECLARED_NONE',
      'UNSUPPORTED_FINANCIAL_COMPONENT',
    );
  }
  return root as unknown as DeclaredPrincipalCalculation;
}
function money(value: DeclaredGcuAmount): Money {
  requireCondition(typeof value.amount === 'string', 'DECLARATION_UNKNOWN');
  return Money.from(value.amount, 'GCU');
}
function canonical(value: Money): string {
  return value.toCanonicalValue().amount;
}
function freezeDetached<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDetached(child);
    Object.freeze(value);
  }
  return value;
}
function leg(
  row: DeclaredPrincipalAccount,
  direction: 'DEBIT' | 'CREDIT',
  amount: string,
): ProvisionalPrincipalLeg {
  return {
    diagnosticOnly: true,
    accountId: row.accountId,
    ownerId: row.ownerId,
    accountClass: row.accountClass,
    declaredClaimId: row.claimId,
    declaredCounterpartyId: row.counterpartyId,
    declaredBalanceReference: row.balance.reference,
    direction,
    amountGcu: amount,
  };
}

/** Pure hypothetical arithmetic. No state, posting factory, private issuer or I/O. */
export function calculateProvisionalNativeGcuPrincipal(
  input: unknown,
): PrincipalCalculationResult {
  try {
    const declaration = checkedDeclaration(detachedDeclaration(input));
    const original = money(declaration.claim.originalPrincipal);
    const remaining = money(declaration.claim.remainingPrincipal);
    const requested = money(declaration.requestedAmount);
    const issuerCash = money(declaration.accounts.issuerCash.balance);
    const holderCash = money(declaration.accounts.holderCash.balance);
    const liability = money(declaration.accounts.issuerLiability.balance);
    const receivable = money(declaration.accounts.holderReceivable.balance);
    const available = money(declaration.sharedPool.available);
    const zero = Money.from('0', 'GCU');
    requireCondition(remaining.amount.greaterThan(0), 'DECLARED_ALREADY_PAID');
    requireCondition(
      original.amount.greaterThan(0) &&
        remaining.amount.lessThanOrEqualTo(original.amount) &&
        issuerCash.amount.greaterThanOrEqualTo(0) &&
        holderCash.amount.greaterThanOrEqualTo(0) &&
        available.amount.greaterThanOrEqualTo(0) &&
        available.amount.lessThanOrEqualTo(issuerCash.amount) &&
        liability.amount.lessThan(0) &&
        receivable.amount.greaterThan(0) &&
        liability.add(remaining).amount.equals(0) &&
        receivable.amount.equals(remaining.amount),
      'PRINCIPAL_OR_BALANCE_MISMATCH',
    );
    requireCondition(
      requested.amount.equals(remaining.amount),
      'PRINCIPAL_NOT_FULL',
    );
    requireCondition(
      available.amount.greaterThanOrEqualTo(remaining.amount),
      'INSUFFICIENT_DECLARED_CASH',
    );
    const negative = zero.subtract(remaining);
    const before: DeclaredPrincipalPositions = {
      issuerCash: canonical(issuerCash),
      holderCash: canonical(holderCash),
      issuerLiabilityNetDebit: canonical(liability),
      holderReceivableNetDebit: canonical(receivable),
      remainingPrincipal: canonical(remaining),
      sharedPoolAvailable: canonical(available),
    };
    const delta: DeclaredPrincipalPositions = {
      issuerCash: canonical(negative),
      holderCash: canonical(remaining),
      issuerLiabilityNetDebit: canonical(remaining),
      holderReceivableNetDebit: canonical(negative),
      remainingPrincipal: canonical(negative),
      sharedPoolAvailable: canonical(negative),
    };
    const after: DeclaredPrincipalPositions = {
      issuerCash: canonical(issuerCash.subtract(remaining)),
      holderCash: canonical(holderCash.add(remaining)),
      issuerLiabilityNetDebit: canonical(liability.add(remaining)),
      holderReceivableNetDebit: canonical(receivable.subtract(remaining)),
      remainingPrincipal: canonical(remaining.subtract(remaining)),
      sharedPoolAvailable: canonical(available.subtract(remaining)),
    };
    return freezeDetached({
      ...BOUNDARY,
      status: 'PROVISIONAL_CALCULATION_NOT_RESERVED_NOT_SETTLED' as const,
      provenance: 'EXPLICIT_UNVERIFIED_DECLARATIONS_ONLY' as const,
      currency: 'GCU' as const,
      selector: declaration.claim.selector,
      originalPrincipalGcu: canonical(original),
      amountGcu: canonical(remaining),
      before,
      delta,
      after,
      legs: [
        leg(
          declaration.accounts.issuerLiability,
          'DEBIT',
          canonical(remaining),
        ),
        leg(declaration.accounts.issuerCash, 'CREDIT', canonical(remaining)),
        leg(declaration.accounts.holderCash, 'DEBIT', canonical(remaining)),
        leg(
          declaration.accounts.holderReceivable,
          'CREDIT',
          canonical(remaining),
        ),
      ],
      declaredAssumptions: declaration,
      globalCashDeltaGcu: '0' as const,
      equityDeltaGcu: '0' as const,
    });
  } catch (error) {
    if (error instanceof DeclaredInputError) return unavailable(error.reason);
    if (error instanceof DomainError) {
      return unavailable(
        error.code === 'DECIMAL_RESULT_OUT_OF_RANGE'
          ? 'ARITHMETIC_OUT_OF_DOMAIN'
          : 'INVALID_EXACT_DECIMAL',
      );
    }
    throw error;
  }
}
