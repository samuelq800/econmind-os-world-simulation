import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  HOUSEHOLD_FISCAL_FOUNDATION_STATUS,
  closeFiscalTreasury,
  closeHouseholdDomesticClosure,
} from '../../packages/core/src/index.js';

const MONEY = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const QUANTITY = (amount: string, unit: string) => ({ amount, unit }) as const;
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HOUSEHOLD_LINEAGE = {
  sourceRef: 'HOUSEHOLD_SOURCE_1',
  sourceVersion: 'HOUSEHOLD_V1',
  snapshotRef: 'HOUSEHOLD_SNAPSHOT_1',
  snapshotHash: HASH_A,
  predecessorSnapshotHash: null,
} as const;
const FISCAL_LINEAGE = {
  sourceRef: 'FISCAL_SOURCE_1',
  sourceVersion: 'FISCAL_V1',
  snapshotRef: 'FISCAL_SNAPSHOT_1',
  snapshotHash: HASH_B,
  predecessorSnapshotHash: HASH_A,
} as const;
const EVIDENCE = <T>(evidenceRef: string, lineage: T) =>
  ({ evidenceRef, lineage }) as const;

describe('E13 household domestic foundation', () => {
  it('uses only explicit settlements and traces supply and cash constrained final demand', () => {
    const input = {
      lineage: HOUSEHOLD_LINEAGE,
      bankDeposit: { balanceRef: 'BANK_DEPOSIT_HH_1', balance: MONEY('100') },
      settledReceipts: [
        {
          receiptRef: 'RECEIPT_WAGE_1',
          sourceRef: 'PAYROLL_1',
          evidence: EVIDENCE('EVIDENCE_WAGE_1', HOUSEHOLD_LINEAGE),
          kind: 'WAGE' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('80'),
        },
        {
          receiptRef: 'RECEIPT_TAX_1',
          sourceRef: 'TAX_SETTLEMENT_1',
          evidence: EVIDENCE('EVIDENCE_TAX_1', HOUSEHOLD_LINEAGE),
          kind: 'TAX' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('10'),
        },
        {
          receiptRef: 'RECEIPT_TRANSFER_1',
          sourceRef: 'TREASURY_PAYMENT_1',
          evidence: EVIDENCE('EVIDENCE_TRANSFER_1', HOUSEHOLD_LINEAGE),
          kind: 'TRANSFER' as const,
          settlementState: 'SETTLED' as const,
          amount: MONEY('20'),
        },
        {
          receiptRef: 'RECEIPT_DEBT_1',
          sourceRef: 'BANK_DEBT_SERVICE_1',
          evidence: EVIDENCE('EVIDENCE_DEBT_1', HOUSEHOLD_LINEAGE),
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
      replayProof: {
        lineage: HOUSEHOLD_LINEAGE,
        evidenceRefs: [
          'EVIDENCE_WAGE_1',
          'EVIDENCE_TAX_1',
          'EVIDENCE_TRANSFER_1',
          'EVIDENCE_DEBT_1',
        ],
      },
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
      lineage: HOUSEHOLD_LINEAGE,
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
            evidence: EVIDENCE('EVIDENCE_UNSETTLED_1', HOUSEHOLD_LINEAGE),
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
        settledReceipts: [
          {
            receiptRef: 'RECEIPT_FORGED_KIND_1',
            sourceRef: 'FORGED_KIND_SOURCE_1',
            evidence: EVIDENCE('EVIDENCE_FORGED_KIND_1', HOUSEHOLD_LINEAGE),
            kind: 'FORGED' as never,
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
            evidence: EVIDENCE('EVIDENCE_DEBT_2', HOUSEHOLD_LINEAGE),
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

  it('rejects settlement evidence from a mixed immutable source snapshot', () => {
    expect(() =>
      closeHouseholdDomesticClosure({
        lineage: HOUSEHOLD_LINEAGE,
        bankDeposit: {
          balanceRef: 'BANK_DEPOSIT_HH_MIXED_1',
          balance: MONEY('0'),
        },
        settledReceipts: [
          {
            receiptRef: 'RECEIPT_WAGE_MIXED_1',
            sourceRef: 'PAYROLL_MIXED_1',
            evidence: EVIDENCE('EVIDENCE_WAGE_MIXED_1', {
              ...HOUSEHOLD_LINEAGE,
              snapshotHash: HASH_B,
            }),
            kind: 'WAGE',
            settlementState: 'SETTLED',
            amount: MONEY('1'),
          },
        ],
        approvedUnpaidTransfers: [],
        demandLines: [],
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
      lineage: FISCAL_LINEAGE,
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
      budgetLineSnapshots: [
        {
          budgetLineRef: 'BUDGET_SOCIAL_1',
          lineage: FISCAL_LINEAGE,
          appropriation: MONEY('100'),
          commitmentHeadRef: 'COMMITMENT_SOCIAL_EXISTING_1',
          committed: [
            {
              commitmentRef: 'COMMITMENT_SOCIAL_EXISTING_1',
              predecessorCommitmentRef: null,
              amount: MONEY('20'),
              evidence: EVIDENCE(
                'EVIDENCE_COMMITMENT_SOCIAL_EXISTING_1',
                FISCAL_LINEAGE,
              ),
            },
          ],
        },
      ],
      commitments: [
        {
          budgetLineRef: 'BUDGET_SOCIAL_1',
          commitmentRef: 'COMMITMENT_SOCIAL_1',
          predecessorCommitmentRef: 'COMMITMENT_SOCIAL_EXISTING_1',
          newCommitment: MONEY('30'),
          evidence: EVIDENCE('EVIDENCE_COMMITMENT_SOCIAL_1', FISCAL_LINEAGE),
        },
      ],
      payments: [
        {
          paymentRef: 'PAYMENT_PENSION_1',
          obligationRef: 'OBLIGATION_PENSION_1',
          evidence: EVIDENCE('EVIDENCE_PAYMENT_PENSION_1', FISCAL_LINEAGE),
          priority: 1,
          duePayment: MONEY('70'),
          insufficientCashDisposition: 'ARREAR' as const,
        },
        {
          paymentRef: 'PAYMENT_WELFARE_1',
          obligationRef: 'OBLIGATION_WELFARE_1',
          evidence: EVIDENCE('EVIDENCE_PAYMENT_WELFARE_1', FISCAL_LINEAGE),
          priority: 2,
          duePayment: MONEY('30'),
          insufficientCashDisposition: 'ARREAR' as const,
        },
        {
          paymentRef: 'PAYMENT_SUPPLIER_1',
          obligationRef: 'OBLIGATION_SUPPLIER_1',
          evidence: EVIDENCE('EVIDENCE_PAYMENT_SUPPLIER_1', FISCAL_LINEAGE),
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
          committedBefore: MONEY('20'),
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

  it('reconciles each authoritative commitment lineage before accepting an exact retry', () => {
    const base = {
      lineage: FISCAL_LINEAGE,
      treasuryGeneralAccount: {
        balanceRef: 'CB_TGA_CAPACITY_1',
        balance: MONEY('0'),
      },
      taxes: [],
      payments: [],
    } as const;
    expect(() =>
      closeFiscalTreasury({
        ...base,
        budgetLineSnapshots: [
          {
            budgetLineRef: 'BUDGET_CAPACITY_1',
            lineage: FISCAL_LINEAGE,
            appropriation: MONEY('100'),
            commitmentHeadRef: null,
            committed: [],
          },
        ],
        commitments: [
          {
            budgetLineRef: 'BUDGET_CAPACITY_1',
            commitmentRef: 'COMMITMENT_CAPACITY_1',
            predecessorCommitmentRef: null,
            newCommitment: MONEY('60'),
            evidence: EVIDENCE(
              'EVIDENCE_COMMITMENT_CAPACITY_1',
              FISCAL_LINEAGE,
            ),
          },
          {
            budgetLineRef: 'BUDGET_CAPACITY_1',
            commitmentRef: 'COMMITMENT_CAPACITY_2',
            predecessorCommitmentRef: 'COMMITMENT_CAPACITY_1',
            newCommitment: MONEY('60'),
            evidence: EVIDENCE(
              'EVIDENCE_COMMITMENT_CAPACITY_2',
              FISCAL_LINEAGE,
            ),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );

    const retry = {
      ...base,
      budgetLineSnapshots: [
        {
          budgetLineRef: 'BUDGET_RETRY_1',
          lineage: FISCAL_LINEAGE,
          appropriation: MONEY('100'),
          commitmentHeadRef: 'COMMITMENT_EXISTING_RETRY_1',
          committed: [
            {
              commitmentRef: 'COMMITMENT_EXISTING_RETRY_1',
              predecessorCommitmentRef: null,
              amount: MONEY('80'),
              evidence: EVIDENCE(
                'EVIDENCE_COMMITMENT_EXISTING_RETRY_1',
                FISCAL_LINEAGE,
              ),
            },
          ],
        },
      ],
      commitments: [
        {
          budgetLineRef: 'BUDGET_RETRY_1',
          commitmentRef: 'COMMITMENT_RETRY_1',
          predecessorCommitmentRef: 'COMMITMENT_EXISTING_RETRY_1',
          newCommitment: MONEY('20'),
          evidence: EVIDENCE('EVIDENCE_COMMITMENT_RETRY_1', FISCAL_LINEAGE),
        },
      ],
    };
    const first = closeFiscalTreasury(retry);
    expect(closeFiscalTreasury(retry)).toEqual(first);
    expect(first.replayProof.hashInput).toContain('FISCAL_TREASURY');

    expect(() =>
      closeFiscalTreasury({
        ...retry,
        commitments: [
          {
            ...retry.commitments[0],
            predecessorCommitmentRef: null,
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        ...retry,
        commitments: [
          {
            ...retry.commitments[0],
            committedBefore: MONEY('0'),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        ...retry,
        commitments: [
          {
            ...retry.commitments[0],
            commitmentRef: 'COMMITMENT_EXISTING_RETRY_1',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        ...retry,
        budgetLineSnapshots: [
          {
            ...retry.budgetLineSnapshots[0],
            lineage: { ...FISCAL_LINEAGE, snapshotHash: HASH_A },
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
  });

  it('makes the caller-declared default explicit and rejects fake collections, overspent budgets, and unordered priorities', () => {
    const base = {
      lineage: FISCAL_LINEAGE,
      taxes: [],
      budgetLineSnapshots: [],
      commitments: [],
      payments: [],
    } as const;
    expect(
      closeFiscalTreasury({
        ...base,
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_2',
          balance: MONEY('0'),
        },
        payments: [
          {
            paymentRef: 'PAYMENT_DEFAULT_1',
            obligationRef: 'OBLIGATION_DEFAULT_1',
            evidence: EVIDENCE('EVIDENCE_PAYMENT_DEFAULT_1', FISCAL_LINEAGE),
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
        ...base,
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_FORGED_DISPOSITION',
          balance: MONEY('100'),
        },
        payments: [
          {
            paymentRef: 'PAYMENT_FORGED_DISPOSITION_1',
            obligationRef: 'OBLIGATION_FORGED_DISPOSITION_1',
            evidence: EVIDENCE(
              'EVIDENCE_PAYMENT_FORGED_DISPOSITION_1',
              FISCAL_LINEAGE,
            ),
            priority: 1,
            duePayment: MONEY('1'),
            insufficientCashDisposition: 'FORGED' as never,
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        ...base,
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_MIXED_LINEAGE',
          balance: MONEY('0'),
        },
        payments: [
          {
            paymentRef: 'PAYMENT_MIXED_LINEAGE_1',
            obligationRef: 'OBLIGATION_MIXED_LINEAGE_1',
            evidence: EVIDENCE('EVIDENCE_PAYMENT_MIXED_LINEAGE_1', {
              ...FISCAL_LINEAGE,
              sourceVersion: 'FISCAL_V0',
            }),
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
    expect(() =>
      closeFiscalTreasury({
        ...base,
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
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        ...base,
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_4',
          balance: MONEY('0'),
        },
        budgetLineSnapshots: [
          {
            budgetLineRef: 'BUDGET_1',
            lineage: FISCAL_LINEAGE,
            appropriation: MONEY('10'),
            commitmentHeadRef: 'COMMITMENT_EXISTING_1',
            committed: [
              {
                commitmentRef: 'COMMITMENT_EXISTING_1',
                predecessorCommitmentRef: null,
                amount: MONEY('8'),
                evidence: EVIDENCE(
                  'EVIDENCE_COMMITMENT_EXISTING_1',
                  FISCAL_LINEAGE,
                ),
              },
            ],
          },
        ],
        commitments: [
          {
            budgetLineRef: 'BUDGET_1',
            commitmentRef: 'COMMITMENT_1',
            predecessorCommitmentRef: 'COMMITMENT_EXISTING_1',
            newCommitment: MONEY('3'),
            evidence: EVIDENCE('EVIDENCE_COMMITMENT_1', FISCAL_LINEAGE),
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
      }),
    );
    expect(() =>
      closeFiscalTreasury({
        ...base,
        treasuryGeneralAccount: {
          balanceRef: 'CB_TGA_COUNTRY_5',
          balance: MONEY('20'),
        },
        payments: [
          {
            paymentRef: 'PAYMENT_2',
            obligationRef: 'OBLIGATION_2',
            evidence: EVIDENCE('EVIDENCE_PAYMENT_2', FISCAL_LINEAGE),
            priority: 2,
            duePayment: MONEY('1'),
            insufficientCashDisposition: 'ARREAR',
          },
          {
            paymentRef: 'PAYMENT_1',
            obligationRef: 'OBLIGATION_1',
            evidence: EVIDENCE('EVIDENCE_PAYMENT_1', FISCAL_LINEAGE),
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
