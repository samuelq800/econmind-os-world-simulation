import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCandidate,
  decomposeAction,
  decimal,
  parseLossless,
  sha256,
  verifyBytes,
} from './candidate.mjs';

const pins = JSON.parse(
  readFileSync(new URL('./source-pins.json', import.meta.url)),
);
const sourceInput = Object.fromEntries(
  Object.entries(pins.sources).map(([key, pin]) => [
    key,
    verifyBytes(readFileSync(pin.path), pin),
  ]),
);
const action = () => ({
  countryId: 'COUNTRY_01',
  actionId: '01_WATER_REPAIR',
  recipe: 'waterRepair',
  currency: 'XAA',
  recordedWagesGcu:
    '0.10000000000000000000000000000000000000000000000000000000000001',
  knownMaterialCostGcu: '2',
  knownCostLC:
    '4.20000000000000000000000000000000000000000000000000000000000002',
  labourWorkDaysBySkill: ['1', '2', '3'],
  earliestRecordedStartSimDay: '1',
  lastRecordedWorkSimDay: '8',
  costCompleteness: 'KNOWN_COMPONENTS_ONLY; not invoices',
  candidateStatus: 'REFERENCE_ONLY',
});
const quote = () => ({
  countryId: 'COUNTRY_01',
  currencyCode: 'XAA',
  LCperGCU: '2',
  GCUperLC: '0.5',
  rateVersion: 'FIXED_REFERENCE',
  valueDate: '2026-10-13',
  adopted: false,
});

test('lossless raw JSON number tokens preserve huge integers and decimal tails', () => {
  assert.deepEqual(
    parseLossless(
      Buffer.from(
        '{"a":9007199254740993,"b":0.10000000000000000000001,"c":false}',
      ),
    ),
    { a: '9007199254740993', b: '0.10000000000000000000001', c: false },
  );
});
test('exact source bytes, including whitespace, are immutable', () => {
  const bytes = Buffer.from('{"a":1}');
  assert.deepEqual(
    verifyBytes(bytes, { path: 'fixture', sha256: sha256(bytes) }),
    { a: '1' },
  );
  assert.throws(
    () =>
      verifyBytes(Buffer.concat([bytes, Buffer.from(' ')]), {
        path: 'fixture',
        sha256: sha256(bytes),
      }),
    /SOURCE_DRIFT/,
  );
});
test('missing prices and Number observations never default to zero', () => {
  for (const value of [
    undefined,
    null,
    0,
    1,
    'UNKNOWN',
    '',
    '-1',
    '1e2',
    'NaN',
  ])
    assert.throws(() => decimal(value), /EXPLICIT_NONNEGATIVE_DECIMAL/);
  assert.equal(decimal('0.000'), '0'); // Explicit source zero only.
});
test('native wage/material split uses existing exact oracle without rounding', () => {
  const r = decomposeAction(action(), quote(), 0, 0);
  assert.equal(r.knownComponentsSubtotalNative, action().knownCostLC);
  assert.equal(r.materials.native, '4');
  assert.equal(r.labourHours, null);
  assert.equal(r.completeServiceCost, null);
  assert.equal(r.actualPaid, null);
  assert.equal(r.labourUnit, 'WORKER_DAY_REFERENCE_NOT_HOUR');
});
test('wrong-country, GCU-as-native, nonreciprocal rate, and cost mismatch fail closed', () => {
  for (const q of [
    { ...quote(), countryId: 'COUNTRY_02' },
    { ...quote(), currencyCode: 'GCU' },
    { ...quote(), GCUperLC: '1' },
    { ...quote(), LCperGCU: '0' },
  ])
    assert.throws(() => decomposeAction(action(), q, 0, 0));
  assert.throws(
    () => decomposeAction({ ...action(), knownCostLC: '0' }, quote(), 0, 0),
    /RECONCILIATION_FAILED/,
  );
});
test('unknown wages or missing skill/time basis cannot yield a partial complete cost', () => {
  for (const a of [
    { ...action(), recordedWagesGcu: null },
    { ...action(), labourWorkDaysBySkill: [] },
    { ...action(), lastRecordedWorkSimDay: '0' },
    { ...action(), lastRecordedWorkSimDay: '141' },
  ])
    assert.throws(() => decomposeAction(a, quote(), 0, 0));
});
test('actual pinned 426-action decomposition and exact B10-B13 ID coverage replay deterministically', () => {
  const first = buildCandidate(sourceInput),
    second = buildCandidate(sourceInput);
  assert.deepEqual(first, second);
  assert.equal(first.coverage.length, 560);
  assert.equal(new Set(first.coverage.map((r) => r.stableId)).size, 560);
  assert.equal(first.knownActionComponents.length, 426);
  for (const r of first.coverage)
    for (const stage of [
      'sourceComplete',
      'engineeringWired',
      'validationPassed',
      'formallyAdopted',
    ])
      assert.equal(r[stage], false);
  for (const c of first.countryContexts) {
    assert.equal(c.power.actualDeliveredMWh, null);
    assert.equal(c.water.netPotableDelivery, null);
    assert.equal(c.labour.actualHours, null);
    assert.equal(c.transport.acceptedTonneKm, null);
    assert.notEqual(c.nativeCurrencyCandidate, 'GCU');
  }
});
test('duplicate original IDs are rejected, not counted twice', () => {
  const records = sourceInput.ledger.records.map((r) =>
    r.missingField === 'labourMinimumHours' && r.countryId === 'COUNTRY_02'
      ? { ...r, stableId: 'U2544::COUNTRY::COUNTRY_01::labourMinimumHours' }
      : r,
  );
  assert.throws(
    () =>
      buildCandidate({
        ...sourceInput,
        ledger: { ...sourceInput.ledger, records },
      }),
    /DUPLICATE_OR_MISSING_ORIGINAL_ID/,
  );
});
test('batch reassignment or foreign/duplicate formal IDs are rejected', () => {
  const batches = sourceInput.batches.map((b) =>
    b.batchId === 'B10'
      ? { ...b, stableIds: [b.stableIds[1], ...b.stableIds.slice(1)] }
      : b,
  );
  assert.throws(
    () => buildCandidate({ ...sourceInput, batches }),
    /DUPLICATE_OR_FOREIGN_BATCH_ID/,
  );
});
test('missing country power and unknown foreign keys are not silently omitted', () => {
  assert.throws(
    () => buildCandidate({ ...sourceInput, power: sourceInput.power.slice(1) }),
    /MISSING_COUNTRY_CONTEXT/,
  );
  assert.throws(
    () =>
      buildCandidate({
        ...sourceInput,
        water: [...sourceInput.water, { countryId: 'visual-territory-99' }],
      }),
    /UNMAPPED_LEGACY_COUNTRY/,
  );
});
test('changed source status requires re-audit and cannot be silently promoted', () => {
  const power = sourceInput.power.map((r, i) =>
    i === 0 ? { ...r, status: 'ENERGIZED' } : r,
  );
  assert.throws(
    () => buildCandidate({ ...sourceInput, power }),
    /UNEXPECTED_POWER_SOURCE_STATUS/,
  );
});
