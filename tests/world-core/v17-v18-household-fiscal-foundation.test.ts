import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  HOUSEHOLD_FISCAL_FOUNDATION_STATUS,
  closeFiscalTreasury,
  closeHouseholdDomesticClosure,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const QUANTITY = (amount: string, unit: string) => ({ amount, unit }) as const;

describe('E13 household domestic foundation', () => {
  it('uses only explicit settlements and traces supply and cash constrained final demand', () => {
    const input = {
      bankDeposit: { balanceRef: 'BANK_DEPOSIT_HH_1', balance: MONEY('100') },
      settledReceipts: [
        {
          receiptRef: 'RECEIPT_WAGE_1',
          sourceRef: 'PAYROLL_1',
          kind: 'WAGE' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('80'),
        },
        {
          receiptRef: 'RECEIPT_TAX_1',
          sourceRef: 'TAX_SETTLEMENT_1',
          kind: 'TAX' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('10'),
        },
        {
          receiptRef: 'RECEIPT_TRANSFER_1',
          sourceRef: 'TREASURY_PAYMENT_1',
          kind: 'TRANSFER' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('20'),
        },
        {
          receiptRef: 'RECEIPT_DEBT_1',
          sourceRef: 'BANK_DEBT_SERVICE_1',
          kind: 'DEBT_SERVICE' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('15'),
        },
      ],
      approvedUnpaidTransfers: [
        {
          claimRef: 'TRANSFER_CLAIM_UNPAID_1',
          paymentRequestRef: 'TREASURY_REQUEST_UNPAID_1',
          state: 'APPROVED_UNPAID' as const,
          amount: MONEY('40'),
        },
      ],
      demandLines: [
        {
          lineRef: 'DEMAND_FOOD_1',
          priority: 1,
          supplyRef: 'DOMESTIC_FOOD_SUPPLY_1',
          requestedQuantity: QUANTITY('10', 'kg'),
          availableSupply: QUANTITY('6', 'kg'),
          unitPrice: { amount: '5', currency: 'GCU', perUnit: 'kg' },
        },
        {
          lineRef: 'DEMAND_MEDICAL_1',
          priority: 2,
          supplyRef: 'DOMESTIC_MEDICAL_SUPPLY_1',
          requestedQuantity: QUANTITY('10', 'medical_service'),
          availableSupply: QUANTITY('10', 'medical_service'),
          unitPrice: {
            amount: '20',
            currency: 'GCU',
            perUnit: 'medical_service',
          },
        },
      ],
    };
    const result = closeHouseholdDomesticClosure(input);

    expect(result).toMatchObject({
      foundationStatus: HOUSEHOLD_FISCAL_FOUNDATION_STATUS,
      bankDepositRef: 'BANK_DEPOSIT_HH_1',
      cashAfterSettlements: MONEY('175'),
      cashAfterConsumption: MONEY('0'),
      settledCashIncome: MONEY('100'),
      settledTaxPaid: MONEY('10'),
      settledDebtServicePaid: MONEY('15'),
      excludedApprovedUnpaidTransfers: [
        { claimRef: 'TRANSFER_CLAIM_UNPAID_1', amount: MONEY('40') },
      ],
    });
    expect(result.receiptTraces).toHaveLength(4);
    expect(result.receiptTraces[3]).toMatchObject({
      traceRef: 'RECEIPT_DEBT_1',
      before: MONEY('190'),
      delta: MONEY('-15'),
      after: MONEY('175'),
      outputRef: 'BANK_DEPOSIT_HH_1',
    });
    expect(result.demandClosures).toEqual([
      expect.objectContaining({
        lineRef: 'DEMAND_FOOD_1',
        fulfilledQuantity: QUANTITY('6', 'kg'),
        unmetDueToSupply: QUANTITY('4', 'kg'),
        unmetDueToCash: QUANTITY('0', 'kg'),
        paid: MONEY('30'),
        supplyTrace: expect.objectContaining({
          before: QUANTITY('6', 'kg'),
          delta: QUANTITY('-6', 'kg'),
          after: QUANTITY('0', 'kg'),
        }),
      }),
      expect.objectContaining({
        lineRef: 'DEMAND_MEDICAL_1',
        fulfilledQuantity: QUANTITY('7.25', 'medical_service'),
        unmetDueToSupply: QUANTITY('0', 'medical_service'),
        unmetDueToCash: QUANTITY('2.75', 'medical_service'),
        paid: MONEY('145'),
        cashTrace: expect.objectContaining({
          before: MONEY('145'),
          delta: MONEY('-145'),
          after: MONEY('0'),
        }),
      }),
    ]);
    expect('bankDepositBalance' in (result as Record<string, unknown>)).toBe(
      false,
    );
    expect(closeHouseholdDomesticClosure(input)).toEqual(result);
  });

  it('rejects un-settled income, unordered allocation, and debit paths without cash', () => {
    const base = {
      bankDeposit: { balanceRef: 'BANK_DEPOSIT_HH_2', balance: MONEY('0') },
      approvedUnpaidTransfers: [],
      demandLines: [],
    } as const;
    expect(() =>
      closeHouseholdDomesticClosure({
        ...base,
        settledReceipts: [
          {
            receiptRef: 'RECEIPT_UNSETTLED_1',
            sourceRef: 'TRANSFER_UNSETTLED_1',
            kind: 'TRANSFER',
            settlementState: 'APPROVED' as never,
            amount: MONEY('10'),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeHouseholdDomesticClosure({
        ...base,
        settledReceipts: [],
        demandLines: [
          {
            lineRef: 'DEMAND_2',
            priority: 2,
            supplyRef: 'SUPPLY_2',
            requestedQuantity: QUANTITY('1', 'kg'),
            availableSupply: QUANTITY('1', 'kg'),
            unitPrice: { amount: '1', currency: 'GCU', perUnit: 'kg' },
          },
          {
            lineRef: 'DEMAND_1',
            priority: 1,
            supplyRef: 'SUPPLY_1',
            requestedQuantity: QUANTITY('1', 'kg'),
            availableSupply: QUANTITY('1', 'kg'),
            unitPrice: { amount: '1', currency: 'GCU', perUnit: 'kg' },
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeHouseholdDomesticClosure({
        ...base,
        settledReceipts: [
          {
            receiptRef: 'RECEIPT_DEBT_2',
            sourceRef: 'DEBT_2',
            kind: 'DEBT_SERVICE',
            settlementState: 'SETTLED',
            amount: MONEY('1'),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeHouseholdDomesticClosure({
        ...base,
        bankDeposit: {
          balanceRef: 'BANK_DEPOSIT_HH_3',
          balance: MONEY('1'),
        },
        settledReceipts: [],
        demandLines: [
          {
            lineRef: 'DEMAND_EXACTNESS_1',
            priority: 1,
            supplyRef: 'SUPPLY_EXACTNESS_1',
            requestedQuantity: QUANTITY('1', 'kg'),
            availableSupply: QUANTITY('1', 'kg'),
            unitPrice: { amount: '3', currency: 'GCU', perUnit: 'kg' },
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
  });
});

describe('E14 fiscal Treasury foundation', () => {
  it('keeps tax credits, commitments, TGA cash, and ordered payment outcomes distinct', () => {
    const input = {
      treasuryGeneralAccount: {
        balanceRef: 'CB_TGA_COUNTRY_1',
        balance: MONEY('40'),
      },
      taxes: [
        {
          taxRef: 'PIT_1',
          assessmentRef: 'TAX_ASSESSMENT_PIT_1',
          creditRef: 'TAX_CREDIT_PIT_1',
          settlementReceiptRef: 'TAX_RECEIPT_PIT_1',
          assessedLiability: MONEY('50'),
          credit: MONEY('10'),
          cashCollected: MONEY('40'),
        },
        {
          taxRef: 'VAT_1',
          assessmentRef: 'TAX_ASSESSMENT_VAT_1',
          creditRef: null,
          settlementReceiptRef: 'TAX_RECEIPT_VAT_1',
          assessedLiability: MONEY('30'),
          credit: MONEY('0'),
          cashCollected: MONEY('10'),
        },
      ],
      commitments: [
        {
          budgetLineRef: 'BUDGET_SOCIAL_1',
          commitmentRef: 'COMMITMENT_SOCIAL_1',
          appropriation: MONEY('100'),
          committedBefore: MONEY('20'),
          newCommitment: MONEY('30'),
        },
      ],
      payments: [
        {
          paymentRef: 'PAYMENT_PENSION_1',
          obligationRef: 'OBLIGATION_PENSION_1',
          priority: 1,
          duePayment: MONEY('70'),
          insufficientCashDisposition: 'ARREAR' as const,
        },
        {
          paymentRef: 'PAYMENT_WELFARE_1',
          obligationRef: 'OBLIGATION_WELFARE_1',
          priority: 2,
          duePayment: MONEY('30'),
          insufficientCashDisposition: 'ARREAR' as const,
        },
        {
          paymentRef: 'PAYMENT_SUPPLIER_1',
          obligationRef: 'OBLIGATION_SUPPLIER_1',
          priority: 3,
          duePayment: MONEY('5'),
          insufficientCashDisposition: 'DEFAULT' as const,
        },
      ],
    };
    const result = closeFiscalTreasury(input);

    expect(result).toMatchObject({
      foundationStatus: HOUSEHOLD_FISCAL_FOUNDATION_STATUS,
      treasuryGeneralAccountRef: 'CB_TGA_COUNTRY_1',
      cashAfterTaxCollections: MONEY('90'),
      cashAfterPayments: MONEY('20'),
      taxCollections: [
        {
          taxRef: 'PIT_1',
          assessmentRef: 'TAX_ASSESSMENT_PIT_1',
          creditRef: 'TAX_CREDIT_PIT_1',
          settlementReceiptRef: 'TAX_RECEIPT_PIT_1',
          netLiability: MONEY('40'),
          cashCollected: MONEY('40'),
          unpaidReceivable: MONEY('0'),
          liabilityTrace: {
            before: MONEY('50'),
            delta: MONEY('-10'),
            after: MONEY('40'),
          },
          receivableTrace: {
            before: MONEY('40'),
            delta: MONEY('-40'),
            after: MONEY('0'),
          },
          tgaTrace: {
            before: MONEY('40'),
            delta: MONEY('40'),
            after: MONEY('80'),
          },
        },
        {
          taxRef: 'VAT_1',
          assessmentRef: 'TAX_ASSESSMENT_VAT_1',
          creditRef: null,
          settlementReceiptRef: 'TAX_RECEIPT_VAT_1',
          netLiability: MONEY('30'),
          cashCollected: MONEY('10'),
          unpaidReceivable: MONEY('20'),
          liabilityTrace: {
            before: MONEY('30'),
            delta: MONEY('0'),
            after: MONEY('30'),
          },
          receivableTrace: {
            before: MONEY('30'),
            delta: MONEY('-10'),
            after: MONEY('20'),
          },
          tgaTrace: {
            before: MONEY('80'),
            delta: MONEY('10'),
            after: MONEY('90'),
          },
        },
      ],
      commitments: [
        {
          budgetLineRef: 'BUDGET_SOCIAL_1',
          appropriation: MONEY('100'),
          remainingAppropriation: MONEY('50'),
          commitmentTrace: {
            before: MONEY('20'),
            delta: MONEY('30'),
            after: MONEY('50'),
          },
        },
      ],
      paymentResults: [
        { paymentRef: 'PAYMENT_PENSION_1', status: 'PAID', paid: MONEY('70') },
        {
          paymentRef: 'PAYMENT_WELFARE_1',
          status: 'ARREAR',
          paid: MONEY('0'),
          unpaid: MONEY('30'),
        },
        {
          paymentRef: 'PAYMENT_SUPPLIER_1',
          status: 'DELAYED',
          paid: MONEY('0'),
          unpaid: MONEY('5'),
          blockedByHigherPriorityPaymentRef: 'PAYMENT_WELFARE_1',
        },
      ],
    });
    expect(result.paymentResults[1]!.tgaTrace).toMatchObject({
      before: MONEY('20'),
      delta: MONEY('0'),
      after: MONEY('20'),
    });
    expect(closeFiscalTreasury(input)).toEqual(result);
  });

  it('makes the caller-declared default explicit and rejects fake collections, overspent budgets, and unordered priorities', () => {
    expect(
      closeFiscalTreasury({
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_2',
          balance: MONEY('0'),
        },
        taxes: [],
        commitments: [],
        payments: [
          {
            paymentRef: 'PAYMENT_DEFAULT_1',
            obligationRef: 'OBLIGATION_DEFAULT_1',
            priority: 1,
            duePayment: MONEY('10'),
            insufficientCashDisposition: 'DEFAULT',
          },
        ],
      }).paymentResults[0],
    ).toMatchObject({
      status: 'DEFAULT',
      paid: MONEY('0'),
      unpaid: MONEY('10'),
    });
    expect(() =>
      closeFiscalTreasury({
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_3',
          balance: MONEY('0'),
        },
        taxes: [
          {
            taxRef: 'CIT_1',
            assessmentRef: 'TAX_ASSESSMENT_CIT_1',
            creditRef: null,
            settlementReceiptRef: null,
            assessedLiability: MONEY('10'),
            credit: MONEY('0'),
            cashCollected: MONEY('1'),
          },
        ],
        commitments: [],
        payments: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_4',
          balance: MONEY('0'),
        },
        taxes: [],
        commitments: [
          {
            budgetLineRef: 'BUDGET_1',
            commitmentRef: 'COMMITMENT_1',
            appropriation: MONEY('10'),
            committedBefore: MONEY('8'),
            newCommitment: MONEY('3'),
          },
        ],
        payments: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_5',
          balance: MONEY('20'),
        },
        taxes: [],
        commitments: [],
        payments: [
          {
            paymentRef: 'PAYMENT_2',
            obligationRef: 'OBLIGATION_2',
            priority: 2,
            duePayment: MONEY('1'),
            insufficientCashDisposition: 'ARREAR',
          },
          {
            paymentRef: 'PAYMENT_1',
            obligationRef: 'OBLIGATION_1',
            priority: 1,
            duePayment: MONEY('1'),
            insufficientCashDisposition: 'ARREAR',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
  });
});
