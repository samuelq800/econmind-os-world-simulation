import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  SOURCE_PINS,
  ORIGINAL_IDS,
  createR3AdoptionReader,
  readFixedR3Adoption,
  inspectFixedConsumerSources,
} from './adoption-view.mjs';

const buffers = Object.fromEntries(
  Object.entries(SOURCE_PINS.sources).map(([key, pin]) => [
    key,
    readFileSync(pin.path),
  ]),
);
const reader = createR3AdoptionReader(buffers);
const original = JSON.parse(buffers.originalPacket);
function requestFor(stableId) {
  const row = original.rows.find((r) => r.stableId === stableId);
  return {
    mode: 'ADOPTED_PARAMETERS_ONLY',
    stableId,
    countryId: 'COUNTRY_01',
    originalUnit: row.candidateMeasure.unit,
    currency: null,
    periodOrValueDate: null,
  };
}
const request = requestFor(ORIGINAL_IDS[2]);
test('only eight exact adopted scalars; source tokens, canonical decimals, units and receipt pointers', () => {
  const view = reader.parameters();
  assert.equal(
    view.status,
    'OWNER_ADOPTED_BOUNDED_SCENARIO_RECIPE_COEFFICIENTS',
  );
  assert.equal(view.coefficients.length, 8);
  assert.deepEqual(
    view.coefficients.map((c) => [
      c.rawNumericToken,
      c.canonicalDecimal,
      c.unit,
    ]),
    [
      ['0.0003', '0.0003', 'worker-day/raw-m3'],
      ['0.00015', '0.00015', 'worker-day/raw-m3'],
      ['5e-05', '0.00005', 'worker-day/raw-m3'],
      ['1e-07', '0.0000001', 'tonne/raw-m3'],
      ['2e-07', '0.0000002', 'equipment-unit/raw-m3'],
      ['0.0005', '0.0005', 'MWh/raw-m3'],
      ['0.96', '0.96', 'treatment-net-m3/raw-m3'],
      ['0.94', '0.94', 'delivered-m3/treatment-net-m3'],
    ],
  );
  for (const c of view.coefficients) {
    assert(
      c.sourceEvidence.pointer.startsWith(
        '/recipes/potableTreatmentOperationPerRawM3/',
      ),
    );
    assert(c.adoptionEvidence.pointer.startsWith('/R3/perRawWaterCubicMetre/'));
    assert.equal(
      c.adoptionEvidence.sha256,
      SOURCE_PINS.sources.adoptionReceipt.sha256,
    );
  }
  assert.equal(view.derivedDeliveryRatio.canonicalDecimal, '0.9024');
  assert.deepEqual(
    view.derivedDeliveryRatio.appliedSourceLeaves.map((l) => l.count),
    [1, 1],
  );
  assert.equal(view.derivedDeliveryRatio.actualDeliveredVolume, null);
});
for (const stableId of ORIGINAL_IDS)
  test(`positive original-ID adoption read: ${stableId}`, () => {
    const value = reader.read(requestFor(stableId));
    const row = original.rows.find((r) => r.stableId === stableId);
    assert.equal(value.stableId, stableId);
    assert.equal(value.missingField, row.missingField);
    assert.deepEqual(value.parentBatch, { ...row.parentBatch, subsetCount: 2 });
    assert.deepEqual(value.originalContract.parentBatch, row.parentBatch);
    assert.equal(value.subset.count, 8);
    assert.deepEqual(value.subset.exactOriginalIds, ORIGINAL_IDS);
    assert.equal(
      value.originalContract.originalAcceptanceRule,
      row.originalAcceptanceRule,
    );
    assert.equal(
      value.originalContract.commit,
      '0021320d660ad530b408dba5e313c5e52862385e',
    );
    assert.equal(value.adoptedParameters.coefficients.length, 8);
    assert.equal(value.originalMeasure.value, null);
    assert.equal(value.originalMeasure.currency, null);
    assert.equal(value.originalMeasure.periodOrValueDate, null);
    assert.equal(
      value.actual.status,
      'BLOCKED_MISSING_REAL_INPUTS_AND_B02_DEFERRED',
    );
    assert.deepEqual(Object.values(value.originalStages), [
      false,
      false,
      false,
      false,
    ]);
    assert.equal(value.originalFieldsClosed, 0);
  });
test('actual fixed local file read and CLI readback agree, without any source extraction', () => {
  assert.deepEqual(readFixedR3Adoption(request), reader.read(request));
  const cli = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./adoption-view.mjs', import.meta.url)),
      request.stableId,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), reader.read(request));
});
test('readonly consumers are exact unchanged source, not executed or treated as adoption', () => {
  const evidence = inspectFixedConsumerSources();
  assert.equal(evidence.length, 3);
  assert(evidence[0].excerpt.includes("input?.mode !== 'TEST_ONLY'"));
  assert(evidence[1].excerpt.includes('scaleWater(rawCapacity, efficiency)'));
  assert(evidence[2].excerpt.includes('foundationFactPayload('));
  assert(
    evidence.every((e) => e.status === 'EXACT_SOURCE_READ_ONLY_NOT_EXECUTED'),
  );
});
test('sale price, performance quality, other recipes, 8h, currency and epoch never adopted', () => {
  const view = reader.parameters();
  const keys = view.coefficients.map((c) => c.key);
  assert(!keys.includes('potablePriceReferenceGcuPerM3'));
  assert(!keys.includes('performanceQuality'));
  assert.equal(view.excluded.hoursPerWorkerDay, null);
  assert.equal(view.excluded.nativePriceOrTariff, null);
  assert.equal(view.excluded.qualityCertification, null);
  assert.equal(view.excluded.WorldEpochOrAsOf, null);
  assert.equal(view.sourceAdmitted, false);
  assert.equal(view.runtimeConnected, false);
  const result = reader.read(request);
  for (const [key, value] of Object.entries(result.actual))
    if (key !== 'status') assert.equal(value, null);
});
test('missing receipt, different bytes/version/scope and forged replacement JSON fail closed', () => {
  assert.throws(
    () => createR3AdoptionReader({ ...buffers, adoptionReceipt: undefined }),
    /FIXED_BYTES_REQUIRED:adoptionReceipt/u,
  );
  for (const key of Object.keys(buffers)) {
    const modified = Buffer.from(buffers[key]);
    modified[0] ^= 1;
    assert.throws(
      () => createR3AdoptionReader({ ...buffers, [key]: modified }),
      new RegExp(`FIXED_SOURCE_DRIFT:${key}`, 'u'),
    );
  }
  for (const delta of [
    { R3: { countryScope: ['COUNTRY_53'], choice: 'A' } },
    { R3: { choice: 'B', sourceSha256: SOURCE_PINS.sources.recipe.sha256 } },
    {
      authority: { type: 'DIRECT_HUMAN_MESSAGE_IN_ROOT_THREAD' },
      formallyAdopted: true,
    },
  ])
    assert.throws(
      () =>
        createR3AdoptionReader({
          ...buffers,
          adoptionReceipt: Buffer.from(JSON.stringify(delta)),
        }),
      /FIXED_SOURCE_DRIFT:adoptionReceipt/u,
    );
  assert.throws(
    () => createR3AdoptionReader({ ...buffers, expectedHash: 'self-declared' }),
    /ONLY_FIXED_SOURCE_BUFFERS_ALLOWED/u,
  );
  assert.throws(
    () => createR3AdoptionReader({ ...buffers, recipe: 0.0005 }),
    /FIXED_BYTES_REQUIRED:recipe/u,
  );
});
test('request scope, actual promotion, other coefficients and caller authority options rejected', () => {
  for (const [delta, diagnostic] of [
    [{ mode: 'ACTUAL' }, /ACTUAL_OR_COST_OR_DELIVERY_READ_PROHIBITED/u],
    [{ mode: 'COMPLETE_COST' }, /ACTUAL_OR_COST_OR_DELIVERY_READ_PROHIBITED/u],
    [
      { mode: 'DELIVERED_WATER' },
      /ACTUAL_OR_COST_OR_DELIVERY_READ_PROHIBITED/u,
    ],
    [{ countryId: 'COUNTRY_53' }, /COUNTRY_SCOPE_MISMATCH/u],
    [
      { stableId: 'U2544::COUNTRY::COUNTRY_53::waterPotableDeliveredMinimum' },
      /OUTSIDE_EXACT_COUNTRY01_ORIGINAL_IDS/u,
    ],
    [{ originalUnit: 'RAW_M3/DAY' }, /ORIGINAL_UNIT_MISMATCH/u],
    [{ currency: 'XAA' }, /NO_ACTUAL_CURRENCY_OR_PERIOD_BOUND/u],
    [
      { periodOrValueDate: '2026-10-20' },
      /NO_ACTUAL_CURRENCY_OR_PERIOD_BOUND/u,
    ],
    ...[
      'formallyAdopted',
      'sourceAdmitted',
      'receiptSha256',
      'recipePointer',
      'hoursPerWorkerDay',
      'processedRawM3',
      'WorldEpoch',
      'includeSalePrice',
      'performanceQuality',
    ].map((key) => [
      { [key]: true },
      /UNSUPPORTED_AUTHORITY_SCOPE_OR_VOLUME_OPTION/u,
    ]),
  ])
    assert.throws(() => reader.read({ ...request, ...delta }), diagnostic);
});
test('B13 is only material-requirement linkage, not a new transport coefficient', () => {
  const value = reader.read(requestFor(ORIGINAL_IDS[6]));
  assert.equal(
    value.relationship,
    'MATERIAL_REQUIREMENT_ONLY_NO_LOGISTICS_COEFFICIENT',
  );
  assert(
    !value.adoptedParameters.coefficients.some((c) =>
      /tonne-km|freight/iu.test(c.unit),
    ),
  );
});
test('immutable, deterministic and detached from supplied bytes', () => {
  assert.throws(() => {
    reader.parameters().coefficients[0].canonicalDecimal = '0';
  }, TypeError);
  assert.throws(() => {
    SOURCE_PINS.sources.adoptionReceipt.sha256 = 'forged';
  }, TypeError);
  const copy = Object.fromEntries(
    Object.entries(buffers).map(([k, b]) => [k, Buffer.from(b)]),
  );
  const other = createR3AdoptionReader(copy);
  Object.values(copy).forEach((b) => b.fill(0));
  assert.deepEqual(other.read(request), reader.read(request));
  assert.deepEqual(
    createR3AdoptionReader(buffers).read(request),
    reader.read(request),
  );
});
