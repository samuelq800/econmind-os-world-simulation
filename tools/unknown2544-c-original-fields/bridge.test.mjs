import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseLossless } from '../unknown2544-c-physical/candidate.mjs';
import {
  SOURCE_PINS,
  ORIGINAL_IDS,
  createOriginalFieldConsumer,
} from './bridge.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const buffers = Object.fromEntries(
  Object.entries(SOURCE_PINS.sources).map(([key, pin]) => [
    key,
    readFileSync(resolve(root, pin.path)),
  ]),
);
const consumer = createOriginalFieldConsumer(buffers);
const packet = consumer.snapshot();
const requestFor = (row) => ({
  mode: 'REFERENCE_INPUTS_ONLY',
  stableId: row.stableId,
  countryId: row.countryId,
  originalUnit: row.candidateMeasure.unit,
  currency: null,
  periodOrValueDate: null,
});

test('exact 16 unique original IDs, four per approved parent; no expanded denominator', () => {
  assert.equal(new Set(packet.rows.map((r) => r.stableId)).size, 16);
  assert.deepEqual(
    packet.rows.map((r) => r.stableId),
    ORIGINAL_IDS,
  );
  const ledger = parseLossless(buffers.ledger);
  const batches = parseLossless(buffers.batches);
  for (const row of packet.rows) {
    const original = ledger.records.find((r) => r.stableId === row.stableId);
    assert.equal(row.scope, original.scope);
    assert.equal(row.ownerId, original.ownerId);
    assert.equal(row.missingField, original.missingField);
    assert.equal(row.originalAcceptanceRule, original.acceptanceRule);
    assert.equal(row.candidateMeasure.unit, original.originalUnit);
    assert.equal(row.parentBatch.subsetCount, 4);
    assert.equal(
      packet.rows.filter(
        (r) => r.parentBatch.batchId === row.parentBatch.batchId,
      ).length,
      4,
    );
    const parent = batches.find((b) => b.batchId === row.parentBatch.batchId);
    assert(parent.stableIds.includes(row.stableId));
    assert.equal(
      row.parentBatch.originalFieldCount,
      String(parent.originalFieldCount),
    );
  }
});
for (const row of packet.rows)
  test(`isolated positive read: ${row.stableId}`, () => {
    const result = consumer.read(requestFor(row));
    assert.equal(
      result.status,
      'REFERENCE_INPUTS_READ_NOT_ORIGINAL_FIELD_ACCEPTANCE',
    );
    assert.equal(result.candidateMeasure.value, null);
    assert(Object.keys(result.references).length >= 2);
    assert.equal(
      result.actualResultStatus,
      'BLOCKED_MISSING_SOURCE_OR_ADOPTION',
    );
  });
test('concrete source numbers retain exact strings and typed reference meaning', () => {
  const refs = (country, field) =>
    packet.rows.find((r) => r.countryId === country && r.missingField === field)
      .references;
  assert.equal(
    refs('COUNTRY_01', 'labourMinimumHours').allocatedPosts.amount,
    '34571592',
  );
  assert.equal(
    refs('COUNTRY_53', 'labourMinimumHours').allocatedPosts.amount,
    '95416273',
  );
  const water = refs('COUNTRY_01', 'waterPotableDeliveredMinimum');
  assert.equal(water.rawAllocations[0].amount, '19049847.736111112');
  assert.equal(
    water.waterRecipe.coefficients.workerDaysBySkill[2].rawNumericToken,
    '5e-05',
  );
  assert.equal(
    water.waterRecipe.coefficients.workerDaysBySkill[2].canonicalDecimal,
    '0.00005',
  );
  assert.equal(water.waterRecipe.combinedYield.amount, '0.9024');
  assert.equal(water.rawAllocations[0].netPotableDelivery, null);
  const energy = refs('COUNTRY_53', 'energyDeliveredMinimum');
  assert.equal(energy.repairInput.electricity.amount, '721.32686051059275');
  assert.equal(
    energy.repairInput.electricity.unit,
    'MWH_REPAIR_INPUT_NOT_DELIVERY',
  );
  assert.equal(energy.installedPower.solarCapacityMW.amount, '589197.332859');
  const transport = refs('COUNTRY_53', 'transportMinimum').inboundPlans;
  assert.equal(transport.length, 9);
  assert.equal(transport[0].freightTonnesPerDay, '0.277523');
  assert.equal(transport[0].distanceKmEstimate, '4425.494569');
  assert.equal(transport[0].acceptedTonneKm, null);
});
test('reference cost is wages-inclusive repair subtotal, never complete recurring cost', () => {
  const row = packet.rows.find(
    (r) =>
      r.countryId === 'COUNTRY_53' &&
      r.missingField === 'energyCompleteCostNative',
  );
  const [component] = row.references.knownRepairComponents;
  assert.equal(component.wages.native, '13195205.7588673536');
  assert.equal(component.knownComponentsSubtotalNative, '160922946.7914367456');
  assert.equal(component.currency, 'XCA');
  assert.equal(component.wagesAlreadyIncludedInSubtotal, true);
  assert.equal(component.recurringServiceCost, null);
  assert.equal(row.candidateMeasure.currency, null);
});
test('adopted opening D04 is separate from unadopted recipe and missing operating facts', () => {
  assert.equal(
    packet.adoptionBoundary.adoptedPolicyReceipt.exactLeaf.id,
    'D04',
  );
  assert.equal(
    packet.adoptionBoundary.adoptedPolicyReceipt.exactLeaf.state,
    'DECISION_ADOPTED',
  );
  for (const row of packet.rows) {
    assert.equal(row.adoptionEvidence, null);
    assert.deepEqual(Object.values(row.reportedStageFlags), [
      false,
      false,
      false,
      false,
    ]);
    assert.equal(row.candidateMeasure.periodOrValueDate, null);
    assert.equal(row.candidateMeasure.applicableWorldGenesisHead, null);
    assert(row.blockers.length >= 4);
  }
  assert.equal(packet.originalFieldsClosed, 0);
  assert.equal(packet.runtimeConnected, false);
});
test('reject source drift, missing source, and Number-based replacement', () => {
  for (const replacement of [Buffer.from('{}'), 0, undefined])
    assert.throws(
      () => createOriginalFieldConsumer({ ...buffers, repair: replacement }),
      /SOURCE_(DRIFT|BYTES_REQUIRED):repair/u,
    );
});
test('reject actual/minimum/cost promotion, cross-country, wrong units/period/currency and fabricated adoption', () => {
  const request = requestFor(packet.rows[0]);
  for (const [delta, diagnostic] of [
    [{ mode: 'ACTUAL' }, /ACTUAL_MINIMUM_OR_COST_READ_PROHIBITED/u],
    [{ mode: 'MINIMUM' }, /ACTUAL_MINIMUM_OR_COST_READ_PROHIBITED/u],
    [{ mode: 'COMPLETE_COST' }, /ACTUAL_MINIMUM_OR_COST_READ_PROHIBITED/u],
    [{ countryId: 'COUNTRY_53' }, /COUNTRY_MISMATCH/u],
    [{ originalUnit: 'WORKER_DAY' }, /ORIGINAL_UNIT_MISMATCH/u],
    [{ periodOrValueDate: 'DAY_1' }, /NO_ACTUAL_PERIOD_BOUND/u],
    [{ currency: 'XAA' }, /NO_ACTUAL_CURRENCY_BOUND/u],
    [{ formallyAdopted: true }, /UNSUPPORTED_AUTHORITY_OR_ARITHMETIC_OPTION/u],
    [{ addWagesAgain: true }, /UNSUPPORTED_AUTHORITY_OR_ARITHMETIC_OPTION/u],
    [
      { evidenceClass: 'TEST_ONLY' },
      /UNSUPPORTED_AUTHORITY_OR_ARITHMETIC_OPTION/u,
    ],
    [
      { stableId: 'U2544::COUNTRY::COUNTRY_13::transportMinimum' },
      /OUTSIDE_EXACT_16_SUBSET/u,
    ],
  ])
    assert.throws(() => consumer.read({ ...request, ...delta }), diagnostic);
});
test('immutable snapshot, detached source buffers and deterministic rebuilding', () => {
  assert.throws(() => {
    packet.rows[0].candidateMeasure.value = '0';
  }, TypeError);
  assert.throws(() => {
    SOURCE_PINS.sources.repair.sha256 = 'forged';
  }, TypeError);
  assert.deepEqual(createOriginalFieldConsumer(buffers).snapshot(), packet);
  const copy = Object.fromEntries(
    Object.entries(buffers).map(([k, b]) => [k, Buffer.from(b)]),
  );
  const independent = createOriginalFieldConsumer(copy);
  copy.repair.fill(0);
  assert.deepEqual(independent.snapshot(), packet);
});
