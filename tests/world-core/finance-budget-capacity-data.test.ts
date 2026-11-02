/** Structural data-validation fixtures only. No source admission/SQL claim. */
import { describe, it, expect } from 'vitest';
import {
  type FinancialLedgerState,
  type FinancialPostingBatch,
} from '@econmind/core';
import { applyFinancialPostingBatch } from '../../packages/core/dist/finance/financial-ledger.js';
import {
  parseFinanceBudgetCapacityData,
  readFinanceBudgetCapacityData,
} from '@econmind/core/finance-budget-capacity-data';
const fixture = () => ({
  schemaVersion: 'finance-budget-capacity-source-v1',
  worldId: 'WORLD_TEST_ONLY',
  countryId: 'COUNTRY_01',
  seedId: 'SEED_TEST_ONLY',
  seedFingerprint: 'sha256:' + '1'.repeat(64),
  admissionRef: 'ADMISSION_TEST_ONLY',
  modelVersion: 'MODEL_TEST_ONLY',
  openingWorldVersion: '0',
  governmentEntityId: 'GOV_TEST_ONLY',
  centralBankEntityId: 'CB_TEST_ONLY',
  financialSourceId: 'FINANCIAL_TEST_ONLY',
  canonicalSeedSha256: 'sha256:' + '2'.repeat(64),
  financialOriginalsSha256: 'sha256:' + '3'.repeat(64),
  treasury: {
    assetAccount: {
      worldId: 'WORLD_TEST_ONLY',
      countryId: 'COUNTRY_01',
      accountId: 'TGA_ASSET_TEST_ONLY',
      ownerId: 'GOV_TEST_ONLY',
      accountClass: 'ASSET',
      currency: 'GBP',
      claimId: 'CLAIM_TEST_ONLY',
      counterpartyEntityId: 'CB_TEST_ONLY',
    },
    liabilityAccount: {
      worldId: 'WORLD_TEST_ONLY',
      countryId: 'COUNTRY_01',
      accountId: 'TGA_LIABILITY_TEST_ONLY',
      ownerId: 'CB_TEST_ONLY',
      accountClass: 'LIABILITY',
      currency: 'GBP',
      claimId: 'CLAIM_TEST_ONLY',
      counterpartyEntityId: 'GOV_TEST_ONLY',
    },
    assetLegId: 'LEG_ASSET_TEST_ONLY',
    liabilityLegId: 'LEG_LIABILITY_TEST_ONLY',
    assetAmount: '1000',
    liabilityAmount: '1000',
  },
  openingFunding: {
    totalAmount: '200',
    recordCount: '2',
    recordsSha256: 'sha256:' + '4'.repeat(64),
  },
});
describe('Budget DATA_ONLY capacity projection parser', () => {
  it('validates exact mirror/amount/provenance fields without issuing general financial authority', () => {
    const token = parseFinanceBudgetCapacityData(fixture());
    expect(readFinanceBudgetCapacityData(token).treasury.assetAmount).toBe(
      '1000',
    );
    expect(() =>
      applyFinancialPostingBatch(
        token as unknown as FinancialLedgerState,
        {} as FinancialPostingBatch,
      ),
    ).toThrow(/unvalidated financial ledger/u);
    expect(() => readFinanceBudgetCapacityData({} as typeof token)).toThrow(
      /DATA_ONLY/u,
    );
  });
  it('rejects foreign-world mirrors, overbooked funding and noncanonical source money', () => {
    const p = fixture();
    p.treasury.liabilityAccount.worldId = 'FOREIGN_WORLD';
    expect(() => parseFinanceBudgetCapacityData(p)).toThrow();
    const q = fixture();
    q.openingFunding.totalAmount = '1001';
    expect(() => parseFinanceBudgetCapacityData(q)).toThrow();
    const r = fixture();
    r.treasury.assetAmount = '1000.00';
    expect(() => parseFinanceBudgetCapacityData(r)).toThrow();
  });
});
