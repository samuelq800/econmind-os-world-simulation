import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalToken, recover } from './recover.mjs';

test('source exponent tokens normalize losslessly without monetary rounding', () => {
  for (const [raw, expected] of [
    ['5e-05', '0.00005'],
    ['1e-07', '0.0000001'],
    ['2e-07', '0.0000002'],
    ['1E+3', '1000'],
    ['0.0003000', '0.0003'],
    ['9007199254740993', '9007199254740993'],
  ])
    assert.equal(canonicalToken(raw), expected);
});
test('missing/Number/negative/out-of-scope coefficients cannot become zero', () => {
  for (const raw of [null, undefined, 0, '', '-1', 'NaN', '1e2000'])
    assert.throws(() => canonicalToken(raw));
});
const result = recover();
test('operation recipe supplies exact three-skill inputs, maintenance, energy and two loss factors', () => {
  assert.deepEqual(
    result.coefficients.workerDaysBySkill.map((r) => r.canonicalDecimal),
    ['0.0003', '0.00015', '0.00005'],
  );
  assert.equal(result.coefficients.electricity.canonicalDecimal, '0.0005');
  assert.equal(result.coefficients.steel.canonicalDecimal, '0.0000001');
  assert.equal(result.coefficients.machinery.canonicalDecimal, '0.0000002');
  assert.equal(result.combinedCandidateYield.amount, '0.9024');
});
test('older competing coefficients and sale tariff are preserved, never silently merged', () => {
  assert.equal(result.conflicts.length, 4);
  assert.equal(result.conflicts[0].older.rawNumericToken, '5e-06');
  assert.equal(result.coefficients.salePriceReference.canonicalDecimal, '0.11');
  assert.ok(result.conflicts.every((r) => r.selectedAsActual === false));
});
test('COUNTRY_01 wage source ratio and XAA reference quote are bound, not admitted', () => {
  assert.equal(result.wageReference.wage.canonicalDecimal, '22.56');
  assert.equal(result.nativeQuoteReference.rate.canonicalDecimal, '163.84');
  assert.equal(result.nativeQuoteReference.currency, 'XAA');
  assert.equal(result.nativeQuoteReference.adoptedFlagInOriginalSource, false);
});
test('no physical, quality, transport, complete-cost or source authority invented', () => {
  assert.equal(result.noActualOperationOrAdoption, true);
  assert.equal(result.quality.actualQuality, null);
  assert.equal(result.quality.clinicalSafetyClaim, false);
  assert.equal(result.actualSkillHours, null);
  assert.equal(result.actualMWhDelivery, null);
  assert.equal(result.actualAcceptedTonneKm, null);
  assert.equal(result.costComplete, false);
  assert.equal(result.powerReferenceQuote.actualNativeTariff, null);
});
test('frozen current constructors and quota/capacity seam are in actual readset', () => {
  assert.equal(result.repositoryExcerpts.length, 3);
  assert.equal(result.necessarySeams.length, 3);
  assert.equal(result.receipt.length, 13);
  assert.ok(result.receipt.every((r) => r.verification === 'PASS'));
});
