/** Genuine Core RUN/WORK/WAGE DATA. No fixture issues DB admission, delivery,
 * operating authority or a production receipt. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareIndustryPaidWorkProduction,
  readIndustryPaidWorkProduction,
  retireIndustryPaidWorkProduction,
} from '../../packages/core/src/commands/industry-paid-work-production.js';
import {
  prepareFinanceSocialLedgerFromOpening,
  replayPreparedFinanceSocialFxLedger,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import { prepareIndustryOperatingWagePayment } from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import { createIndustryOperatingWageCanonicalFixture } from '../support/industry-operating-wage-canonical-fixture.js';
import { wageSha as sha } from '../support/industry-operating-wage-fixture.js';
function setup(child = false) {
  const f = createIndustryOperatingWageCanonicalFixture(child),
    paid = prepareIndustryOperatingWagePayment(f),
    paymentFrame = {
      ...paid.step,
      events: paid.step.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: f.command,
        transition: paid.step.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: f.command.simTime,
        recordedAtReal: f.observedAtReal,
      }),
    };
  const frames = [f.schedule, f.workFrame, paymentFrame],
    opening = C.rebuildV08LedgersFromLineage({
      seed: f.f.seed,
      sha256Hex: sha,
    });
  const replay = replayPreparedFinanceSocialFxLedger({
    prepared: prepareFinanceSocialLedgerFromOpening(opening, sha),
    frames,
    socialCountries: [],
    fxOriginals: [],
    industryWorkSources: [f.site],
    industryWageSources: [f.source],
    ...(f.beneficialReceipt === undefined
      ? {}
      : { beneficialHousingRentReceipts: [f.beneficialReceipt] }),
    openingEncumbrances: [
      {
        reference: f.source.openingEncumbranceRef,
        accountId: f.f.op.asset.accountId,
        currency: 'XAA',
        amount: '100',
      },
    ],
    expectedHead: { worldVersion: '3', eventSequence: '3' },
    sha256Hex: sha,
  });
  const input = {
    worldId: f.f.worldId,
    seedFingerprint: f.f.seed.fingerprint,
    head: { worldVersion: '3', eventSequence: '3' },
    mixedPrefixEvidence: replay.mixedPrefixEvidence,
    lastPageFrames: frames,
    paymentFrame,
    target: {
      countryId: f.f.countryId,
      facilityId: f.site.facilityId,
      runId: f.source.runId,
      workEventFingerprint: f.workFrame.events[0]!.fingerprint,
    },
  };
  return { f, paid, frames, replay, input };
}
describe('private current paid WORK production basis', () => {
  it('does not let a caller replace a captured payment receipt after data preparation', () => {
    const s = setup(),
      paymentFrame = { ...s.input.paymentFrame },
      token = prepareIndustryPaidWorkProduction(
        { ...s.input, paymentFrame },
        sha,
      );
    paymentFrame.receipt = {
      ...paymentFrame.receipt,
      idempotencyKey: C.idempotencyKey('REPLACED_AFTER_PREPARATION'),
    };
    expect(() => readIndustryPaidWorkProduction(token)).toThrow(
      'PREPARED_ACTUAL_PAYMENT_FRAME_CHANGED',
    );
    retireIndustryPaidWorkProduction(token);
  });
  it('recognizes real completed WORK and actual same-run expense/deposit mirrors from the complete mixed fold, retaining original household and beneficial child routes', () => {
    for (const child of [false, true]) {
      const s = setup(child),
        token = prepareIndustryPaidWorkProduction(s.input, sha),
        value = readIndustryPaidWorkProduction(token);
      expect(value.paidAmount).toEqual({ amount: '4.8', currency: 'XAA' });
      expect(value.paymentBatch.legs).toHaveLength(child ? 10 : 6);
      expect(value.financial).toBe(s.replay.financial);
      expect(value.run.terms.runId).toBe(s.f.source.runId);
      expect(value.classification).toBe(
        'CORE_VERIFIED_PAID_WORK_COST_NOT_DELIVERY_OR_OPERATING_AUTHORITY',
      );
      expect('productionPosting' in value).toBe(false);
      expect('actualDelivered' in value).toBe(false);
      expect(C.canonicalSerialize(s.replay.financial)).toBe(
        C.canonicalSerialize(value.financial),
      );
      retireIndustryPaidWorkProduction(token);
    }
  });
  it('rejects copied/retired data preparations, wrong head/source/run/work and incomplete receipts', () => {
    const s = setup(),
      token = prepareIndustryPaidWorkProduction(s.input, sha);
    expect(() => readIndustryPaidWorkProduction({ ...token })).toThrow(
      'GENUINE_LIVE',
    );
    retireIndustryPaidWorkProduction(token);
    expect(() => readIndustryPaidWorkProduction(token)).toThrow('GENUINE_LIVE');
    for (const bad of [
      { ...s.input, head: { worldVersion: '2', eventSequence: '2' } },
      { ...s.input, seedFingerprint: 'sha256:' + 'f'.repeat(64) },
      { ...s.input, target: { ...s.input.target, runId: 'FOREIGN_RUN' } },
      {
        ...s.input,
        target: {
          ...s.input.target,
          workEventFingerprint: 'sha256:' + 'f'.repeat(64),
        },
      },
      {
        ...s.input,
        paymentFrame: {
          ...s.input.paymentFrame,
          receipt: {
            ...s.input.paymentFrame.receipt,
            idempotencyKey: C.idempotencyKey('FORGED_KEY'),
          },
        },
      },
    ])
      expect(() => prepareIndustryPaidWorkProduction(bad, sha)).toThrow();
  });
  it('rejects a balanced altered payment batch and cross-run carry instead of assigning old liabilities to this production run', () => {
    const s = setup(),
      batch = s.paid.step.financialPostingBatches[0]!,
      changed = {
        ...batch,
        legs: batch.legs.map((l) => ({
          ...l,
          amount: C.Money.from(
            l.amount.amount.times('2').toFixed(),
            l.amount.currency,
          ),
        })),
      };
    expect(() =>
      prepareIndustryPaidWorkProduction(
        {
          ...s.input,
          paymentFrame: {
            ...s.input.paymentFrame,
            financialPostingBatches: [changed],
          },
        },
        sha,
      ),
    ).toThrow();
    const {
      canonicalPayload,
      payloadHash,
      fingerprint,
      simTime,
      ...eventFields
    } = s.input.paymentFrame.events[0]!;
    void canonicalPayload;
    void payloadHash;
    void fingerprint;
    void simTime;
    const forgedEvent = C.parseAuthoritativeEvent(
      {
        ...eventFields,
        simTime: s.f.command.simTime.toCanonicalValue(),
        payload: {
          ...JSON.parse(s.input.paymentFrame.events[0]!.canonicalPayload),
          recipientSettlements: [
            {
              settledWorkLiabilities: [
                {
                  facilityId: s.f.site.facilityId,
                  runId: 'FOREIGN_RUN',
                  workEventFingerprint: s.input.target.workEventFingerprint,
                  maximumExpense: s.f.source.maximumExpense,
                  amount: { numerator: '24', denominator: '5' },
                },
              ],
            },
          ],
        },
      },
      sha,
    );
    expect(() =>
      prepareIndustryPaidWorkProduction(
        {
          ...s.input,
          paymentFrame: { ...s.input.paymentFrame, events: [forgedEvent] },
        },
        sha,
      ),
    ).toThrow('EXACT_ACTUAL_PRIOR_WAGE_FRAME_REQUIRED');
  });
});
