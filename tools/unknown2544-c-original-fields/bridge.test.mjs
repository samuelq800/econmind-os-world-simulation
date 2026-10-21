import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

const adoptedPins = JSON.parse(
  readFileSync(
    new URL('../unknown2544-c-r3-adoption/source-pins.json', import.meta.url),
  ),
);
const adoptedSources = Object.fromEntries(
  Object.entries(adoptedPins.sources).map(([key, pin]) => [
    key,
    readFileSync(pin.path),
  ]),
);
const adoptedReads = [];
const adoptedConsumer = createOriginalFieldConsumer({
  mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY',
});
const historicalRows = parseLossless(adoptedSources.originalPacket).rows;
function adoptedRequest(
  row = packet.rows.find(
    (r) =>
      r.missingField === 'waterPotableDeliveredMinimum' &&
      r.countryId === 'COUNTRY_01',
  ),
) {
  return {
    ...requestFor(row),
    mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY',
    adoptionSources: { ...adoptedSources },
    recipeWork: {
      schema: 'C_DECLARED_RECIPE_WORK_V1',
      role: 'DECLARED_RECIPE_WORKLOAD_NOT_ACTUAL_OPERATION',
      requestRef: 'TEST_DECLARED_C16_WORK',
      countryId: 'COUNTRY_01',
      regionRef: 'TEST_DECLARED_REGION',
      facilityRef: 'TEST_DECLARED_FACILITY',
      interval: {
        basis: 'DECLARED_SIM_DAY_INTERVAL_NOT_WORLD_TIME',
        fromSimDay: '2',
        untilSimDay: '5',
      },
      rawInput: {
        amount: '10',
        unit: 'raw-m3',
        basis: 'TOTAL_OVER_DECLARED_INTERVAL',
      },
    },
  };
}
function observeAdopted(request = adoptedRequest()) {
  const result = adoptedConsumer.read(request);
  adoptedReads.push({
    request: {
      ...request,
      adoptionSources: 'FIXED_BYTES_FROM_ADOPTED_R3_PINS_NOT_CALLER_AUTHORITY',
    },
    result,
  });
  return result;
}
test('R3-CONN-C01 existing C16 read calls producer and genuine fixed adopted8 reader positively', () => {
  assert.throws(
    () => adoptedConsumer.snapshot(),
    /REFERENCE_SNAPSHOT_NOT_LOADED/u,
  );
  assert.throws(
    () => adoptedConsumer.read({ mode: 'REFERENCE_INPUTS_ONLY' }),
    /ADOPTED_INTERMEDIATE_MODE_REQUIRED/u,
  );
  const r = observeAdopted();
  assert.equal(
    r.status,
    'ADOPTED_RECIPE_INTERMEDIATES_AVAILABLE',
    JSON.stringify(r.diagnostics),
  );
  assert.equal(r.recipeIntermediate.theoreticalNetPotential.amount, '9.024');
  assert.equal(r.recipeIntermediate.treatmentNetPotential.amount, '9.6');
  assert.equal(r.parameterAdoptionRead.stableId, r.stableId);
  assert.equal(
    r.parameterAdoptionRead.adoptedParameters.coefficients.length,
    8,
  );
  assert.equal(r.parameterConnection.engineeringWired, true);
  assert.equal(r.parameterConnection.arithmeticUsesReturnedCoefficients, true);
  assert.equal(r.dependentResults.nationalMinimum.status, 'B02_DEFERRED');
  assert.equal(r.dependentResults.acceptedNetDelivery.value, null);
  assert.equal(r.candidateMeasure.value, null);
  assert.equal(r.adoptionEvidence, null);
});
test('R3-CONN-C02 each COUNTRY01 original ID independently returns correctly typed relevant intermediate', () => {
  const rows = packet.rows.filter((r) => r.countryId === 'COUNTRY_01');
  assert.equal(rows.length, 8);
  for (const row of rows) {
    const historical = historicalRows.find((r) => r.stableId === row.stableId);
    const r = observeAdopted(adoptedRequest(row));
    assert.equal(r.status, 'ADOPTED_RECIPE_INTERMEDIATES_AVAILABLE');
    assert.deepEqual(r.candidateMeasure, row.candidateMeasure);
    assert.deepEqual(r.originalDependencies, historical.dependencies);
    assert.deepEqual(r.originalStages, row.reportedStageFlags);
    assert.equal(r.originalAcceptanceRule, row.originalAcceptanceRule);
    assert.deepEqual(r.originalBinding.ledger, historical.originalLedger);
    assert.equal(
      r.referencesMeaning,
      'HISTORICAL_C16_REFERENCE_CONTEXT_UNCHANGED',
    );
    assert.deepEqual(r.references, historical.references);
    if (row.parentBatch.batchId === 'B10') {
      assert.equal(
        r.recipeIntermediate.workerDaysBySkill.HIGH.amount,
        '0.0005',
      );
      assert.equal(
        r.recipeIntermediate.workerDaysBySkill.LOW.unit,
        'worker-day',
      );
      assert.equal(r.dependentResults.labourHours.value, null);
      assert.equal(r.dependentResults.nativePayroll.value, null);
    } else if (row.parentBatch.batchId === 'B12') {
      assert.equal(r.recipeIntermediate.energyInputRequirement.amount, '0.005');
      assert.equal(r.recipeIntermediate.energyInputRequirement.unit, 'MWh');
      assert.equal(r.dependentResults.acceptedEnergyDelivery.value, null);
    } else if (row.parentBatch.batchId === 'B13') {
      assert.equal(r.recipeIntermediate.steelRequirement.amount, '0.000001');
      assert.equal(
        r.recipeIntermediate.machineryRequirement.unit,
        'equipment-unit',
      );
      assert.equal(r.dependentResults.actualTransport.value, null);
    } else if (row.missingField === 'waterCompleteCostNative') {
      assert.equal(r.recipeIntermediate.requiredInputs.ENERGY.amount, '0.005');
      assert.equal(r.dependentResults.completeNativeCost.value, null);
    }
    const trace = r.sourceTrace.filter(
      (t) => t.kind === 'FIXED_ADOPTED_RECIPE_COEFFICIENT',
    );
    assert.equal(trace.length, 8);
    for (const t of trace) {
      assert.equal(t.sourceEvidence.sha256, adoptedPins.sources.recipe.sha256);
      assert.equal(
        t.adoptionEvidence.sha256,
        adoptedPins.sources.adoptionReceipt.sha256,
      );
      assert(t.sourceEvidence.pointer.endsWith('/' + t.key));
      assert(
        t.adoptionEvidence.pointer.startsWith('/R3/perRawWaterCubicMetre/'),
      );
    }
    assert.equal(r.sourceTrace[0].kind, 'ORIGINAL_C16_REFERENCE_BINDING');
    assert.equal(r.sourceTrace[1].kind, 'DECLARED_WORKLOAD_NOT_OBSERVED');
    assert.equal(r.sourceAdmitted, false);
    assert.equal(r.runtimeConnected, false);
    assert.equal(r.originalFieldsClosed, 0);
  }
});
test('R3-CONN-C03 no dependent bundle gates, hours/default price/actual stages not promoted', () => {
  const r = observeAdopted();
  assert.equal(r.recipeIntermediate.theoreticalNetPotential.amount, '9.024');
  assert(Object.values(r.dependentResults).every((x) => x.value === null));
  assert.deepEqual(Object.values(r.originalStages), [
    false,
    false,
    false,
    false,
  ]);
  assert.equal(
    r.parameterAdoptionRead.adoptedParameters.excluded.hoursPerWorkerDay,
    null,
  );
  assert.equal(
    r.parameterAdoptionRead.adoptedParameters.excluded.nativePriceOrTariff,
    null,
  );
  assert.equal(
    r.parameterAdoptionRead.adoptedParameters.derivedDeliveryRatio
      .actualDeliveredVolume,
    null,
  );
  const f = adoptedRequest();
  f.recipeWork.interval.untilSimDay = '50';
  assert.equal(
    observeAdopted(f).recipeIntermediate.theoreticalNetPotential.amount,
    '9.024',
  );
});
test('R3-CONN-C04 new read rejects cross-country/units/authority without altering C53 reference reads', () => {
  const row53 = packet.rows.find((r) => r.countryId === 'COUNTRY_53');
  assert.throws(
    () => consumer.read(adoptedRequest(row53)),
    /COUNTRY01_ADOPTED_INTERMEDIATE_ONLY/u,
  );
  for (const [delta, expected] of [
    [{ countryId: 'COUNTRY_53' }, /COUNTRY01_ADOPTED_INTERMEDIATE_ONLY/u],
    [{ originalUnit: 'WORKER_DAY' }, /ORIGINAL_UNIT_MISMATCH/u],
    [{ currency: 'XAA' }, /NO_ACTUAL_CURRENCY_BOUND/u],
    [{ periodOrValueDate: 'ACTUAL_TIME' }, /NO_ACTUAL_PERIOD_BOUND/u],
    [
      { stableId: 'U2544::COUNTRY::COUNTRY_13::waterPotableDeliveredMinimum' },
      /OUTSIDE_EXACT_16_SUBSET/u,
    ],
    [{ sourceAdmitted: true }, /UNSUPPORTED_AUTHORITY_OR_ARITHMETIC_OPTION/u],
  ])
    assert.throws(
      () => consumer.read({ ...adoptedRequest(), ...delta }),
      expected,
    );
  assert.equal(
    consumer.read(requestFor(row53)).status,
    'REFERENCE_INPUTS_READ_NOT_ORIGINAL_FIELD_ACCEPTANCE',
  );
  assert.deepEqual(consumer.snapshot(), packet);
});
test('R3-CONN-C05 fixed source/declared input drift rejects through actual C16 chain', () => {
  for (const key of Object.keys(adoptedSources)) {
    const f = adoptedRequest();
    f.adoptionSources[key] = Buffer.from('{}');
    const r = observeAdopted(f);
    assert.equal(r.status, 'BLOCKED_ADOPTED_PARAMETER_INPUT');
    assert.equal(r.recipeIntermediate, null);
    assert.equal(r.candidateMeasure.value, null);
    assert.equal(r.parameterConnection.engineeringWired, false);
  }
  const f = adoptedRequest();
  f.recipeWork.rawInput.unit = 'MWh';
  assert.equal(observeAdopted(f).recipeIntermediate, null);
  const g = adoptedRequest();
  g.recipeWork.countryId = 'COUNTRY_53';
  assert.equal(observeAdopted(g).recipeIntermediate, null);
});
test('R3-CONN-C06 replay/detachment preserves input ownership and original source snapshot', () => {
  const f = adoptedRequest(),
    r = observeAdopted(f);
  assert.deepEqual(consumer.read(f), r);
  f.recipeWork.rawInput.amount = '20';
  assert.equal(
    observeAdopted(f).recipeIntermediate.theoreticalNetPotential.amount,
    '18.048',
  );
  assert.equal(r.recipeIntermediate.theoreticalNetPotential.amount, '9.024');
  assert.equal(Object.isFrozen(f.recipeWork), false);
  assert.throws(() => {
    r.recipeIntermediate.theoreticalNetPotential.amount = '0';
  }, TypeError);
  assert.deepEqual(consumer.snapshot(), packet);
});
after(() => {
  const out = process.env.C_R3_BRIDGE_EVIDENCE_DIR;
  if (!out) return;
  if (
    !/^\/Users\/samuel\/Documents\/econclub\/\.econmind-artifacts\/unknown2544-resume-20261021\/C\/r3-consumer-connection-implementation-v1\/(?:focused|run-precommit|run-committed)\/bridge$/u.test(
      out,
    ) ||
    existsSync(out)
  )
    throw new Error('Exclusive C R3 bridge evidence target required');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    `${out}/ACTUAL_READS.json`,
    JSON.stringify(
      {
        evidenceClass:
          'PRIVATE_FIXED_C16_AND_R3_PLUS_TEST_DECLARED_WORK_NOT_ACTUAL_OPERATION',
        referenceSnapshotUnchanged:
          JSON.stringify(consumer.snapshot()) === JSON.stringify(packet),
        sourcePins: SOURCE_PINS,
        adoptionPins: adoptedPins.sources,
        reads: adoptedReads,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
});
