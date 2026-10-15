import { describe, expect, it, vi } from 'vitest';
import { Money } from '@econmind/core';
import {
  calculateProvisionalNativeGcuPrincipal,
  formalNativeGcuPrincipalPayment,
} from '../src/preparation/native-gcu-principal-settlement.js';
import type {
  DeclaredPrincipalCalculation,
  PrincipalCalculationResult,
  ProvisionalPrincipalCalculation,
} from '../src/preparation/native-gcu-principal-settlement-contract.js';

type Mutable<T> = T extends object
  ? { -readonly [K in keyof T]: Mutable<T[K]> }
  : T;
/** Inline synthetic declarations only: no World, source, title, permission or Clock fixture. */
function fixture(): Mutable<DeclaredPrincipalCalculation> {
  const amount = (value: string) => ({
    status: 'DECLARED' as const,
    amount: value,
    currency: 'GCU',
    reference: 'INLINE_SYNTHETIC_UNVERIFIED_AMOUNT',
  });
  const account = (
    id: string,
    owner: string,
    kind: string,
    balance: string,
    claimId: string | null,
    counterpartyId: string | null,
  ) => ({
    accountId: id,
    ownerId: owner,
    accountClass: kind,
    claimId,
    counterpartyId,
    balance: amount(balance),
  });
  const selector = 'SCENE_CLEARING_09_24_V2';
  const issuer = 'ENTITY_CENTRAL_BANK_09';
  const holder = 'ENTITY_CENTRAL_BANK_24';
  const none = () => ({
    applicability: 'DECLARED_NONE' as const,
    reference: 'HYPOTHESIS_ONLY_NOT_ACTUAL_TERMS',
  });
  return {
    schemaVersion: 'DECLARED_GCU_PRINCIPAL_CALCULATION_V1',
    claim: {
      selector,
      issuerId: issuer,
      holderId: holder,
      originalPrincipal: amount('499500000'),
      remainingPrincipal: amount('10'),
      history: {
        status: 'DECLARED_OUTSTANDING',
        reference: 'SYNTHETIC_DECLARED_REMAINING_NOT_SETTLEMENT_EVIDENCE',
      },
    },
    requestedAmount: amount('10'),
    accounts: {
      issuerCash: account(
        'DECLARED_ISSUER_CASH',
        issuer,
        'CASH',
        '20',
        null,
        null,
      ),
      holderCash: account(
        'DECLARED_HOLDER_CASH',
        holder,
        'CASH',
        '3',
        null,
        null,
      ),
      issuerLiability: account(
        'DECLARED_ORIGINAL_LIABILITY',
        issuer,
        'LIABILITY',
        '-10',
        selector,
        holder,
      ),
      holderReceivable: account(
        'DECLARED_ORIGINAL_RECEIVABLE',
        holder,
        'RECEIVABLE',
        '10',
        selector,
        issuer,
      ),
    },
    sharedPool: {
      reference: 'SYNTHETIC_SHARED_POOL_NOT_RESERVED',
      available: amount('15'),
    },
    components: {
      fee: none(),
      interest: none(),
      fx: none(),
      partial: none(),
      refund: none(),
      loan: none(),
      endowment: none(),
    },
  };
}
function plan(
  result: PrincipalCalculationResult,
): ProvisionalPrincipalCalculation {
  expect(result.status).toBe(
    'PROVISIONAL_CALCULATION_NOT_RESERVED_NOT_SETTLED',
  );
  if (result.status !== 'PROVISIONAL_CALCULATION_NOT_RESERVED_NOT_SETTLED')
    throw new Error(result.reason);
  return result;
}
function unavailable(input: unknown, reason?: string) {
  const result = calculateProvisionalNativeGcuPrincipal(input);
  expect(result.status).toBe('UNAVAILABLE');
  if (result.status !== 'UNAVAILABLE')
    throw new Error('Unexpected conditional plan');
  if (reason !== undefined) expect(result.reason).toBe(reason);
  expect(result).not.toHaveProperty('legs');
  expect(result).not.toHaveProperty('receipt');
  expect(result.formalPaymentAllowed).toBe(false);
  expect(result.actualSettlement).toBe(false);
  expect(result.sourceAdopted).toBe(false);
  return result;
}

describe('native GCU declared principal preparation only', () => {
  it('returns four traced diagnostic legs and exact signed before/delta/after without authority', () => {
    const result = plan(calculateProvisionalNativeGcuPrincipal(fixture()));
    expect(result.before).toEqual({
      issuerCash: '20',
      holderCash: '3',
      issuerLiabilityNetDebit: '-10',
      holderReceivableNetDebit: '10',
      remainingPrincipal: '10',
      sharedPoolAvailable: '15',
    });
    expect(result.delta).toEqual({
      issuerCash: '-10',
      holderCash: '10',
      issuerLiabilityNetDebit: '10',
      holderReceivableNetDebit: '-10',
      remainingPrincipal: '-10',
      sharedPoolAvailable: '-10',
    });
    expect(result.after).toEqual({
      issuerCash: '10',
      holderCash: '13',
      issuerLiabilityNetDebit: '0',
      holderReceivableNetDebit: '0',
      remainingPrincipal: '0',
      sharedPoolAvailable: '5',
    });
    expect(
      result.legs.map((row) => [row.accountId, row.direction, row.amountGcu]),
    ).toEqual([
      ['DECLARED_ORIGINAL_LIABILITY', 'DEBIT', '10'],
      ['DECLARED_ISSUER_CASH', 'CREDIT', '10'],
      ['DECLARED_HOLDER_CASH', 'DEBIT', '10'],
      ['DECLARED_ORIGINAL_RECEIVABLE', 'CREDIT', '10'],
    ]);
    expect(
      result.legs.every(
        (row) =>
          row.diagnosticOnly &&
          row.declaredBalanceReference === 'INLINE_SYNTHETIC_UNVERIFIED_AMOUNT',
      ),
    ).toBe(true);
    expect(
      Money.from(result.before.issuerCash, 'GCU')
        .add(Money.from(result.before.holderCash, 'GCU'))
        .toCanonicalValue(),
    ).toEqual(
      Money.from(result.after.issuerCash, 'GCU')
        .add(Money.from(result.after.holderCash, 'GCU'))
        .toCanonicalValue(),
    );
    expect(result.originalPrincipalGcu).toBe('499500000');
    expect(result.declaredAssumptions.claim.originalPrincipal.amount).toBe(
      '499500000',
    );
    expect(result.globalCashDeltaGcu).toBe('0');
    expect(result.equityDeltaGcu).toBe('0');
    for (const key of [
      'actualSettlement',
      'formalPaymentAllowed',
      'sourceAdopted',
      'titleVerified',
      'termsVerified',
      'permissionVerified',
      'historyVerified',
      'reserved',
    ] as const)
      expect(result[key]).toBe(false);
    expect(result.formalStatus).toBe('PORT_NOT_INSTALLED');
    for (const key of [
      'receipt',
      'command',
      'event',
      'fingerprint',
      'worldVersion',
      'batchId',
      'privateCandidate',
    ])
      expect(result).not.toHaveProperty(key);
  });

  it('retains exact fractional cash beyond JS safe integers using real Core arithmetic', () => {
    const input = fixture();
    input.accounts.holderCash.balance.amount = '9007199254740993.125';
    input.accounts.issuerCash.balance.amount = '20.125';
    const result = plan(calculateProvisionalNativeGcuPrincipal(input));
    expect(result.after.holderCash).toBe('9007199254741003.125');
    expect(result.after.issuerCash).toBe('10.125');
  });

  it('rejects result-domain overflow instead of rounding or returning a plan', () => {
    const input = fixture();
    input.accounts.holderCash.balance.amount = '9'.repeat(120);
    unavailable(input, 'ARITHMETIC_OUT_OF_DOMAIN');
  });

  it.each(['1e1', '01', 'NaN', 'Infinity', '1'.repeat(121)])(
    'rejects invalid exact decimal %s',
    (token) => {
      const input = fixture();
      input.requestedAmount.amount = token;
      unavailable(input, 'INVALID_EXACT_DECIMAL');
    },
  );

  it('does not accept a JS money number as an exact declared lexeme', () => {
    const input = fixture();
    Object.assign(input.requestedAmount, { amount: 10 });
    unavailable(input);
  });

  it('keeps missing and UNKNOWN amount fields unavailable instead of cash zero', () => {
    const input = fixture();
    input.sharedPool.available.status = 'UNKNOWN';
    input.sharedPool.available.amount = null;
    input.sharedPool.available.currency = null;
    unavailable(input, 'DECLARATION_UNKNOWN');
    const missing = fixture();
    Reflect.deleteProperty(missing.requestedAmount, 'amount');
    unavailable(missing);
  });

  it.each(['REQUIRED', 'UNKNOWN'] as const)(
    'does not turn %s excluded component applicability into none',
    (state) => {
      const input = fixture();
      input.components.fee.applicability = state;
      unavailable(input, 'UNSUPPORTED_FINANCIAL_COMPONENT');
    },
  );

  it('does not infer a fee-free hypothesis from an omitted component', () => {
    const input = fixture();
    Reflect.deleteProperty(input.components, 'fee');
    unavailable(input);
  });

  it('rejects unknown history and declared fully-paid obligations without creating debt', () => {
    const input = fixture();
    input.claim.history.status = 'UNKNOWN';
    unavailable(input, 'HISTORY_UNKNOWN');
    input.claim.history.status = 'DECLARED_FULLY_PAID';
    unavailable(input, 'DECLARED_ALREADY_PAID');
    input.claim.history.status = 'DECLARED_OUTSTANDING';
    input.claim.remainingPrincipal.amount = '0';
    unavailable(input, 'DECLARED_ALREADY_PAID');
  });

  it('requires the full matched remaining principal and original-principal bound', () => {
    const input = fixture();
    input.requestedAmount.amount = '9';
    unavailable(input, 'PRINCIPAL_NOT_FULL');
    input.requestedAmount.amount = '11';
    unavailable(input, 'PRINCIPAL_NOT_FULL');
    input.requestedAmount.amount = '10';
    input.claim.originalPrincipal.amount = '5';
    unavailable(input, 'PRINCIPAL_OR_BALANCE_MISMATCH');
  });

  it('rejects mismatched mirrors and invalid liability/cash signs', () => {
    for (const change of [
      (x: Mutable<DeclaredPrincipalCalculation>) => {
        x.accounts.holderReceivable.balance.amount = '11';
      },
      (x: Mutable<DeclaredPrincipalCalculation>) => {
        x.accounts.issuerLiability.balance.amount = '10';
      },
      (x: Mutable<DeclaredPrincipalCalculation>) => {
        x.accounts.issuerCash.balance.amount = '-1';
      },
    ]) {
      const input = fixture();
      change(input);
      unavailable(input, 'PRINCIPAL_OR_BALANCE_MISMATCH');
    }
  });

  it('rejects wrong native currency, cash class, original account IDs and counterpart roles', () => {
    const currency = fixture();
    currency.accounts.issuerCash.balance.currency = 'LCU';
    unavailable(currency, 'CURRENCY_MISMATCH');
    const cash = fixture();
    cash.accounts.issuerCash.accountClass = 'ASSET';
    unavailable(cash, 'CLAIM_ACCOUNT_MISMATCH');
    const alias = fixture();
    alias.accounts.holderCash.accountId = alias.accounts.issuerCash.accountId;
    unavailable(alias, 'CLAIM_ACCOUNT_MISMATCH');
    const counterpart = fixture();
    counterpart.accounts.issuerLiability.counterpartyId =
      counterpart.claim.issuerId;
    unavailable(counterpart, 'CLAIM_ACCOUNT_MISMATCH');
    const claim = fixture();
    claim.accounts.holderReceivable.claimId = 'OTHER_CLAIM';
    unavailable(claim, 'CLAIM_ACCOUNT_MISMATCH');
  });

  it('rejects insufficient or impossible declared availability with no reservation', () => {
    const input = fixture();
    input.sharedPool.available.amount = '9';
    unavailable(input, 'INSUFFICIENT_DECLARED_CASH');
    input.sharedPool.available.amount = '21';
    unavailable(input, 'PRINCIPAL_OR_BALANCE_MISMATCH');
  });

  it('only describes conditional shared-pool arithmetic and never deducts a pool store', () => {
    const input = fixture();
    const before = structuredClone(input);
    const first = plan(calculateProvisionalNativeGcuPrincipal(input));
    expect(first.after.sharedPoolAvailable).toBe('5');
    expect(input).toEqual(before);
    expect(calculateProvisionalNativeGcuPrincipal(input)).toEqual(first);
    const conditionalNext = fixture();
    conditionalNext.sharedPool.available.amount =
      first.after.sharedPoolAvailable;
    unavailable(conditionalNext, 'INSUFFICIENT_DECLARED_CASH');
    expect(input.sharedPool.available.amount).toBe('15');
  });

  it('detaches and deeply freezes only its own result, preserving declared lexemes and caller mutability', () => {
    const input = fixture();
    input.claim.originalPrincipal.amount = '499500000.0';
    const original = structuredClone(input);
    const result = plan(calculateProvisionalNativeGcuPrincipal(input));
    expect(input).toEqual(original);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.claim)).toBe(false);
    expect(Object.isFrozen(result.legs)).toBe(true);
    expect(Object.isFrozen(result.legs[0])).toBe(true);
    expect(Object.isFrozen(result.declaredAssumptions.components.fee)).toBe(
      true,
    );
    input.accounts.issuerCash.balance.amount = '999';
    expect(result.declaredAssumptions.accounts.issuerCash.balance.amount).toBe(
      '20',
    );
    expect(result.declaredAssumptions.claim.originalPrincipal.amount).toBe(
      '499500000.0',
    );
    expect(result.originalPrincipalGcu).toBe('499500000');
  });

  it('rejects getters, Proxy and toJSON without executing their behavior', () => {
    const getter = vi.fn(() => {
      throw new Error('Getter executed');
    });
    const input = fixture();
    Object.defineProperty(input.claim, 'holderId', {
      get: getter,
      enumerable: true,
    });
    unavailable(input, 'MALFORMED_DECLARATION');
    expect(getter).not.toHaveBeenCalled();
    const traps = vi.fn(() => {
      throw new Error('Proxy trap executed');
    });
    const proxy = new Proxy(
      {},
      { get: traps, ownKeys: traps, getPrototypeOf: traps },
    );
    const nested = fixture();
    Object.assign(nested.accounts.issuerCash, { balance: proxy });
    unavailable(nested, 'MALFORMED_DECLARATION');
    unavailable(proxy, 'MALFORMED_DECLARATION');
    expect(traps).not.toHaveBeenCalled();
    const toJSON = vi.fn(() => {
      throw new Error('toJSON executed');
    });
    const jsonInput = fixture();
    Object.assign(jsonInput, { toJSON });
    unavailable(jsonInput, 'MALFORMED_DECLARATION');
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('keeps formal denial unconditional under caller flags, hashes, positive plans and environment markers', () => {
    const input = fixture();
    Object.assign(input, {
      sourceApproved: true,
      complete: true,
      hash: 'sha256:' + 'a'.repeat(64),
    });
    unavailable(input);
    const traps = vi.fn(() => {
      throw new Error('Formal input inspected');
    });
    const proxy = new Proxy(
      {},
      { get: traps, ownKeys: traps, getPrototypeOf: traps },
    );
    const previous = process.env.G_PHASE1_SYNTHETIC_PAYMENT;
    process.env.G_PHASE1_SYNTHETIC_PAYMENT = 'true';
    try {
      expect(
        Reflect.apply(formalNativeGcuPrincipalPayment, null, [
          proxy,
          fixture(),
        ]),
      ).toEqual({
        formalStatus: 'PORT_NOT_INSTALLED',
        formalPaymentAllowed: false,
        actualSettlement: false,
        sourceAdopted: false,
        titleVerified: false,
        termsVerified: false,
        permissionVerified: false,
        historyVerified: false,
        reserved: false,
        status: 'UNAVAILABLE',
        reason: 'PORT_NOT_INSTALLED',
      });
      expect(traps).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.G_PHASE1_SYNTHETIC_PAYMENT;
      else process.env.G_PHASE1_SYNTHETIC_PAYMENT = previous;
    }
  });
});
