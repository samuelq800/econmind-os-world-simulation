/** Public read-wire vectors only, not publication/admission or ledger proofs. */
import { describe, it, expect } from 'vitest';
import {
  POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA,
  POSTWAR_FINANCIAL_MIXED_REDUCER,
  parsePostwarFinancialMixedCoverage,
  parsePostwarMixedFinancialBalanceRow,
  parsePostwarMixedTreasuryCapacityRow,
} from '../../packages/core/src/read-models/postwar-financial-mixed-current-contract.js';
const hash = 'sha256:' + '1'.repeat(64),
  scope = { countryId: 'COUNTRY_01', worldVersion: '7', eventSequence: '11' };
const coverage = () => ({
  schemaVersion: POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA,
  reducerVersion: POSTWAR_FINANCIAL_MIXED_REDUCER,
  countryId: scope.countryId,
  coverageRef: 'COVERAGE_TEST_ONLY',
  prefixFingerprint: hash,
  knownEffectsFingerprint: hash,
  globalWorldVersion: '7',
  globalEventSequence: '11',
  coveredThroughEventId: 'EVENT_TEST_ONLY',
  coveredThroughEventFingerprint: hash,
  financialPostingCount: '6',
  financialBatchCount: '2',
  financialPostingsFingerprint: hash,
});
const balance = () => ({
  schemaVersion: 'postwar-current-financial-balance-row-v2',
  countryId: scope.countryId,
  accountId: 'GOV_GCU_TEST_ONLY',
  ownerEntityId: 'GOV_TEST_ONLY',
  ownerKind: 'GOV',
  currency: 'GCU',
  accountClass: 'CASH',
  claimId: null,
  counterpartyEntityId: null,
  netDebitBalance: '1.234567',
  balanceNature: 'GCU_CASH',
});
const capacity = () => ({
  schemaVersion: 'postwar-treasury-capacity-row-v2',
  countryId: scope.countryId,
  accountId: 'TGA_TEST_ONLY',
  claimId: 'CLAIM_TEST_ONLY',
  currency: 'XAA',
  treasuryLedgerClaimBalance: '90.123456789012345678',
  openingReservedCapacity: '10',
  budgetEnvelopeCapacity: '5',
  additionalPayrollReservedCapacity: '0.1',
  totalReservedCapacity: '15.1',
  availableCapacity: '75.023456789012345678',
  governmentGcuCurrency: 'GCU',
  governmentGcuCashBalance: '1.234567',
  governmentGcuAccountIds: ['GOV_GCU_TEST_ONLY'],
  reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
  balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET',
  gcuBalanceNature: 'GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES',
});
describe('posting-aware financial read wire', () => {
  it('preserves exact nonzero batch/leg coverage tied to the current country and head', () => {
    const value = parsePostwarFinancialMixedCoverage(coverage(), scope);
    expect(value.financialPostingCount).toBe('6');
    expect(Object.isFrozen(value)).toBe(true);
  });
  it.each([
    { countryId: 'COUNTRY_02' },
    { globalWorldVersion: '6' },
    { financialPostingCount: '0' },
    { financialBatchCount: '7' },
    { financialPostingCount: 6 },
    { financialPostingsFingerprint: 'CALLER_READY' },
    { noFinancialPostings: true },
  ])(
    'rejects stale/cross-scope or legacy no-posting assertions %#',
    (change) => {
      expect(() =>
        parsePostwarFinancialMixedCoverage({ ...coverage(), ...change }, scope),
      ).toThrow();
    },
  );
  it('does not make an opening genesis claim from a later event prefix', () => {
    expect(() =>
      parsePostwarFinancialMixedCoverage(
        {
          ...coverage(),
          globalWorldVersion: '0',
          globalEventSequence: '0',
          financialPostingCount: '0',
          financialBatchCount: '0',
        },
        { ...scope, worldVersion: '0', eventSequence: '0' },
      ),
    ).toThrow();
  });
  it('restricts Finance to government positions and CB to its own/supervised bank data, never private OP/HH', () => {
    expect(
      parsePostwarMixedFinancialBalanceRow(balance(), {
        countryId: scope.countryId,
        officeId: 'FINANCE',
      }).netDebitBalance,
    ).toBe('1.234567');
    for (const ownerKind of ['OP', 'HH', 'BANK', 'CB'])
      expect(() =>
        parsePostwarMixedFinancialBalanceRow(
          { ...balance(), ownerKind },
          { countryId: scope.countryId, officeId: 'FINANCE' },
        ),
      ).toThrow();
    expect(() =>
      parsePostwarMixedFinancialBalanceRow(balance(), {
        countryId: scope.countryId,
        officeId: 'CENTRAL_BANK',
      }),
    ).toThrow();
    expect(() =>
      parsePostwarMixedFinancialBalanceRow(
        { ...balance(), countryId: 'COUNTRY_02' },
        { countryId: scope.countryId, officeId: 'FINANCE' },
      ),
    ).toThrow();
  });
  it('preserves signed CB liability balances without accepting a negative cash wallet', () => {
    expect(
      parsePostwarMixedFinancialBalanceRow(
        {
          ...balance(),
          ownerKind: 'CB',
          currency: 'XAA',
          accountClass: 'LIABILITY',
          netDebitBalance: '-10',
          balanceNature: 'RECIPROCAL_LEDGER_CLAIM',
          claimId: 'CLAIM_TEST_ONLY',
          counterpartyEntityId: 'GOV_TEST_ONLY',
        },
        { countryId: scope.countryId, officeId: 'CENTRAL_BANK' },
      ).netDebitBalance,
    ).toBe('-10');
    expect(() =>
      parsePostwarMixedFinancialBalanceRow(
        { ...balance(), netDebitBalance: '-1' },
        { countryId: scope.countryId, officeId: 'FINANCE' },
      ),
    ).toThrow();
  });
  it('checks exact current TGA capacity and GCU cash without counting one reservation twice', () => {
    expect(
      parsePostwarMixedTreasuryCapacityRow(capacity(), scope.countryId)
        .availableCapacity,
    ).toBe('75.023456789012345678');
    expect(() =>
      parsePostwarMixedTreasuryCapacityRow(
        { ...capacity(), totalReservedCapacity: '20.1' },
        scope.countryId,
      ),
    ).toThrow();
    expect(() =>
      parsePostwarMixedTreasuryCapacityRow(
        { ...capacity(), treasuryLedgerClaimBalance: '100' },
        scope.countryId,
      ),
    ).toThrow();
    expect(() =>
      parsePostwarMixedTreasuryCapacityRow(
        { ...capacity(), governmentGcuAccountIds: [] },
        scope.countryId,
      ),
    ).toThrow();
  });
});
