/** Actual Core DATA only, never DB admission or execution permission. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  calculateIndustryOperatingWage,
  quoteIndustryOperatingWage,
  prepareIndustryOperatingWagePayment,
  replayIndustryOperatingWagePayment,
} from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import {
  createIndustryOperatingWageCanonicalFixture as setup,
  secondIndustryOperatingWageStage,
} from '../support/industry-operating-wage-canonical-fixture.js';
import { wageSha as sha } from '../support/industry-operating-wage-fixture.js';
function raw(c: C.CanonicalCommand) {
  const { canonicalPayload, fingerprint, payloadHash, simTime, ...fields } = c;
  void fingerprint;
  void payloadHash;
  return {
    ...fields,
    simTime: simTime.toCanonicalValue(),
    payload: JSON.parse(canonicalPayload) as unknown,
  };
}
describe('actual completed work wage payment conditional Core mechanism', () => {
  it('pays actual region intersections with complete OP/bank/HH legs and replays exact result', () => {
    const s = setup();
    const result = prepareIndustryOperatingWagePayment(s);
    expect(result.paidAmount).toBe('4.8');
    expect(result.recipients.map((r) => r.amount).sort()).toEqual([
      '1.2',
      '1.2',
      '2.4',
    ]);
    expect(result.step.financialPostingBatches[0]!.legs).toHaveLength(10);
    expect(
      C.aggregateBeneficialHousingLiquidClaim(result.financial, s.f.receipt)
        .availableAmount,
    ).toBe('104.8');
    expect(
      result.financial.positions
        .find((p) => p.account.accountId === s.f.hh.asset.accountId)
        ?.netDebitBalance.amount.toString() ?? '0',
    ).toBe('0');
    expect(
      replayIndustryOperatingWagePayment({ ...s, step: result.step }).step,
    ).toEqual(result.step);
    expect(
      result.financial.positions
        .find((p) => p.account.accountId === s.f.op.asset.accountId)!
        .netDebitBalance.amount.toString(),
    ).toBe('95.2');
    expect(result.state.reservationReleases[0]!.amount).toBe('4.8');
  });
  it('enforces the actual RUN ceiling cumulatively and refuses cap-free V2 sources', () => {
    const s = setup(true, '172800', '72000', '2', '144000', '9');
    const first = prepareIndustryOperatingWagePayment(s);
    expect(first.paidAmount).toBe('4.8');
    expect(() => secondIndustryOperatingWageStage(s, first)).toThrow('RUN');
    expect(() =>
      prepareIndustryOperatingWagePayment(
        setup(true, '172800', '72000', '1', '72000', '4'),
      ),
    ).toThrow('RUN');
    const { maximumExpense: ignored, ...capFree } = s.source;
    void ignored;
    expect(() =>
      prepareIndustryOperatingWagePayment({
        ...s,
        source: capFree as typeof s.source,
      }),
    ).toThrow('V2_ACTUAL_RUN_CEILING_REQUIRED');
  });
  it('retains the original-HH six-leg route with unchanged mirror conservation', () => {
    const s = setup(false);
    const r = prepareIndustryOperatingWagePayment(s);
    expect(r.paidAmount).toBe('4.8');
    expect(r.step.financialPostingBatches[0]!.legs).toHaveLength(6);
    expect(
      r.financial.positions
        .find((p) => p.account.accountId === s.f.hh.asset.accountId)!
        .netDebitBalance.amount.toString(),
    ).toBe('104.8');
  });
  it('uses exact floor6 and retains nonfinite remainder without changing the annual rate', () => {
    for (const personMilliseconds of ['0', '01'])
      expect(() =>
        calculateIndustryOperatingWage({
          annualWage: '360',
          currency: 'XAA',
          personMilliseconds,
        }),
      ).toThrow();
    const q = quoteIndustryOperatingWage({
      annualWage: '360',
      currency: 'XAA',
      personMilliseconds: '60000',
    });
    expect(q.paidAmount).toBe('0.002083');
    expect(q.unpaid).toEqual({ numerator: '1', denominator: '3000000' });
    const first = quoteIndustryOperatingWage({
      annualWage: '54770.851364',
      currency: 'XAB',
      personMilliseconds: '2520000',
    });
    const second = quoteIndustryOperatingWage({
      annualWage: '54770.851364',
      currency: 'XAB',
      personMilliseconds: '3480000',
      carry: first.unpaid,
    });
    const whole = quoteIndustryOperatingWage({
      annualWage: '54770.851364',
      currency: 'XAB',
      personMilliseconds: '6000000',
    });
    expect(
      C.Money.from(first.paidAmount, 'XAB')
        .add(C.Money.from(second.paidAmount, 'XAB'))
        .toCanonicalValue().amount,
    ).toBe(whole.paidAmount);
    expect(second.unpaid).toEqual(whole.unpaid);
  });
  it('split actual WORK payments carry exact beneficiary debts identically to one whole payment', () => {
    const s = setup(true, '54770.851364', '72000', '2', '144000');
    const a = prepareIndustryOperatingWagePayment(s),
      b = secondIndustryOperatingWageStage(s, a).result;
    const whole = prepareIndustryOperatingWagePayment(
      setup(true, '54770.851364', '144000', '2', '144000'),
    );
    expect(
      C.Money.from(a.paidAmount, 'XAA')
        .add(C.Money.from(b.paidAmount, 'XAA'))
        .toCanonicalValue().amount,
    ).toBe(whole.paidAmount);
    expect(
      b.unpaidWageLiabilities.map((x) => ({
        accountId: x.accountId,
        amount: x.amount,
      })),
    ).toEqual(
      whole.unpaidWageLiabilities.map((x) => ({
        accountId: x.accountId,
        amount: x.amount,
      })),
    );
    expect(b.state.paidWork).toHaveLength(2);
    expect(
      b.state.reservationReleases
        .reduce(
          (n, r) => n.add(C.Money.from(r.amount, 'XAA')),
          C.Money.from('0', 'XAA'),
        )
        .toCanonicalValue().amount,
    ).toBe(whole.paidAmount);
  });
  it('retains each actual child beneficiary unpaid liability with exact conservation', () => {
    const s = setup(true, '54770.851364'),
      r = prepareIndustryOperatingWagePayment(s);
    expect(r.unpaidWageLiabilities).toHaveLength(3);
    let n = 0n,
      d = 1n;
    for (const v of r.unpaidWageLiabilities) {
      n = n * BigInt(v.amount.denominator) + BigInt(v.amount.numerator) * d;
      d *= BigInt(v.amount.denominator);
    }
    const paid = C.Money.from(r.paidAmount, 'XAA')
      .amount.times('1000000')
      .toFixed(0);
    const exact = quoteIndustryOperatingWage({
      annualWage: '54770.851364',
      currency: 'XAA',
      personMilliseconds: '288000',
    }).earned;
    expect((BigInt(paid) * d + n * 1000000n) * BigInt(exact.denominator)).toBe(
      BigInt(exact.numerator) * d * 1000000n,
    );
    expect(r.state.reservationReleases[0]!.amount).toBe(r.paidAmount);
    expect(r.state.accruedReservations[0]!.amount).toEqual(exact);
  });
  it('refuses copied state/WORK token, missing beneficiaries, future work and unbacked reservations', () => {
    const s = setup();
    expect(() =>
      prepareIndustryOperatingWagePayment({ ...s, state: { ...s.state } }),
    ).toThrow(/EXACT_PAYMENT_STATE/);
    const { beneficialReceipt: ignoredReceipt, ...without } = s;
    void ignoredReceipt;
    expect(() => prepareIndustryOperatingWagePayment(without)).toThrow(
      /household deposit/,
    );
    expect(() =>
      prepareIndustryOperatingWagePayment({ ...s, work: { ...s.work } }),
    ).toThrow(/ISSUED_WORK_REPLAY/);
    const earlier = C.parseCanonicalCommand(
      { ...raw(s.command), simTime: '1' },
      sha,
    );
    expect(() =>
      prepareIndustryOperatingWagePayment({ ...s, command: earlier }),
    ).toThrow(/PRIOR_WORK_SCOPE/);
    expect(() =>
      prepareIndustryOperatingWagePayment({
        ...s,
        source: { ...s.source, openingReservedAmount: '101' },
      }),
    ).toThrow(/RESERVATIONS_NOT_BACKED/);
  });
  it('refuses paid WORK twice without debiting a second amount', () => {
    const s = setup();
    const result = prepareIndustryOperatingWagePayment(s);
    const c = C.parseCanonicalCommand(
      { ...raw(s.command), expectedWorldVersion: '3' },
      sha,
    );
    expect(() =>
      prepareIndustryOperatingWagePayment({
        ...s,
        command: c,
        financial: result.financial,
        state: result.state,
        eventSequence: '4',
      }),
    ).toThrow(/ALREADY_PAID/);
  });
});
