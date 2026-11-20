/** Pure field projection. These DTO fixtures establish no source/admission or
 * runtime authority; mixed Core replay and native publication are separate. */
import { describe, it, expect } from 'vitest';
import type { FinanceNativeBudgetCapacityEncumbrance } from '@econmind/core/finance-budget-native';
import { projectPostwarSocialBudgetReservations } from '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js';
const funding = {
  accountRef: 'ACCOUNT_TEST_ONLY_TGA',
  countryId: 'COUNTRY_01',
  claimId: 'CLAIM_TEST_ONLY_TGA',
  payerEntityId: 'GOV_TEST_ONLY',
  payerRole: 'GOV',
  currency: 'GBP',
};
const cap: FinanceNativeBudgetCapacityEncumbrance = {
  reference: 'BUDGET_CAPACITY_TEST_ONLY',
  accountId: funding.accountRef,
  claimId: funding.claimId,
  countryId: funding.countryId,
  governmentEntityId: funding.payerEntityId,
  currency: funding.currency,
  amount: '12.3456789',
  envelopeRef: 'ENVELOPE_TEST_ONLY',
  effectivePeriodRef: 'PERIOD_TEST_ONLY',
  eventId: 'EVENT_TEST_ONLY_ENVELOPE_SET',
  policyHash: 'sha256:' + '1'.repeat(64),
};
describe('Social Budget-capacity projection after shared Core replay', () => {
  it('preserves the one cap reference, original event and exact unrounded amount', () => {
    const result = projectPostwarSocialBudgetReservations([cap], funding);
    expect(result).toEqual([
      {
        reservationId: cap.reference,
        sourceRef: cap.eventId,
        amount: '12.3456789',
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });
  it('combines separate actual envelope caps without including other accounts', () => {
    const other = {
      ...cap,
      reference: 'BUDGET_CAPACITY_SECOND',
      eventId: 'EVENT_SECOND_SET',
      envelopeRef: 'ENVELOPE_SECOND',
      amount: '2.5',
    };
    const foreign = {
      ...cap,
      accountId: 'ACCOUNT_OTHER_COUNTRY',
      countryId: 'COUNTRY_02',
      governmentEntityId: 'GOV_OTHER_COUNTRY',
      claimId: 'CLAIM_OTHER_COUNTRY',
    };
    expect(
      projectPostwarSocialBudgetReservations(
        [cap, other, foreign],
        funding,
      ).map((r) => [r.reservationId, r.amount]),
    ).toEqual([
      [cap.reference, '12.3456789'],
      [other.reference, '2.5'],
    ]);
  });
  it('rejects repeated capacity references rather than silently dropping or charging twice', () => {
    expect(() =>
      projectPostwarSocialBudgetReservations(
        [cap, { ...cap, eventId: 'EVENT_INVENTED_DUPLICATE' }],
        funding,
      ),
    ).toThrow('exact unique');
  });
  it('rejects a mismatched country, claim, government owner or currency on this same account', () => {
    for (const mismatch of [
      { countryId: 'COUNTRY_02' },
      { claimId: 'CLAIM_OTHER' },
      { governmentEntityId: 'GOV_OTHER' },
      { currency: 'USD' },
    ])
      expect(() =>
        projectPostwarSocialBudgetReservations(
          [{ ...cap, ...mismatch }],
          funding,
        ),
      ).toThrow('exact unique');
  });
  it('preserves absence of Budget capacities and refuses an OP account as GOV backing', () => {
    expect(projectPostwarSocialBudgetReservations([], funding)).toEqual([]);
    expect(() =>
      projectPostwarSocialBudgetReservations([cap], {
        ...funding,
        payerRole: 'OP',
      }),
    ).toThrow('actual GOV');
  });
});
