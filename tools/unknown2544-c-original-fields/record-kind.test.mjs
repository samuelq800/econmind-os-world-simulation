import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { SOURCE_PINS } from '../unknown2544-c-r3-adoption/adoption-view.mjs';
import { createOriginalFieldConsumer } from './bridge.mjs';
import { produceWaterServiceCandidate } from '../unknown2544-c-water-service/produce-candidate.mjs';
import { sha256 } from '../unknown2544-c-physical/candidate.mjs';

const sources = Object.fromEntries(
  Object.entries(SOURCE_PINS.sources).map(([key, pin]) => {
    const bytes = readFileSync(pin.path);
    assert.equal(bytes.length, pin.bytes);
    assert.equal(sha256(bytes), pin.sha256);
    return [key, bytes];
  }),
);
const consumer = createOriginalFieldConsumer({
  mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY',
});
const recordKeys = [
  'recordReadContract',
  'recordOriginClass',
  'recordKind',
  'record',
];
const observations = [],
  rejected = [];
function request(labour = true) {
  const period = {
    periodId: 'DECLARED_P2_5',
    axisId: 'DECLARED_SIM_DAY_AXIS',
    axisUnit: 'SIM_DAY',
    start: { numerator: '2', denominator: '1' },
    endExclusive: { numerator: '5', denominator: '1' },
    timeBasisEvidence: null,
  };
  return {
    mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY',
    countryId: 'COUNTRY_01',
    stableId: `U2544::COUNTRY::COUNTRY_01::${labour ? 'labourMinimumHours' : 'waterPotableDeliveredMinimum'}`,
    originalUnit: labour ? 'HOUR/PERIOD' : 'M3/PERIOD',
    currency: null,
    periodOrValueDate: null,
    adoptionSources: sources,
    recipeWork: {
      schema: 'C_DECLARED_RECIPE_WORK_V1',
      role: 'DECLARED_RECIPE_WORKLOAD_NOT_ACTUAL_OPERATION',
      requestRef: 'DECLARED_C01_RECORD_READ',
      countryId: 'COUNTRY_01',
      regionRef: 'DECLARED_REGION',
      facilityRef: 'DECLARED_FACILITY',
      interval: {
        basis: 'DECLARED_SIM_DAY_INTERVAL_NOT_WORLD_TIME',
        fromSimDay: '2',
        untilSimDay: '5',
      },
      ...(labour
        ? {}
        : {
            rawInput: {
              amount: '10',
              unit: 'raw-m3',
              basis: 'TOTAL_OVER_DECLARED_INTERVAL',
            },
          }),
    },
    recordReadContract: 'C01_DECLARED_RECORD_PROJECTION_V1',
    recordOriginClass: 'CONSTRUCTED_NOT_ADOPTED',
    recordKind: labour
      ? 'C01_LABOUR_REQUIREMENT_DERIVATION_V1'
      : 'C01_NET_POTABLE_MINIMUM_REQUIREMENT_V1',
    record: labour
      ? {
          derivationId: 'DECLARED_LABOUR_REQUIREMENT',
          quantityBasis: 'TOTAL_OVER_DECLARED_INTERVAL_NOT_RATE',
          rawInputTotalM3: { value: '10', unit: 'RAW_M3/PERIOD' },
          period,
          hoursConversions: [],
          floor: null,
          recipe: null,
          capacityAttestations: [],
          exactRoundingOrRationalPolicy: null,
        }
      : {
          requirementId: 'DECLARED_NET_WATER_DEMAND',
          netPotableMinimum: { value: '8', unit: 'M3/PERIOD' },
          period,
          floor: null,
          coverage: null,
          recipe: null,
          rawWaterRightsEvidence: null,
        },
  };
}
function noActual(result) {
  assert.equal(result.candidateMeasure.value, null);
  assert.equal(result.candidateMeasure.currency, null);
  assert.equal(result.candidateMeasure.periodOrValueDate, null);
  assert.deepEqual(Object.values(result.originalStages), [
    false,
    false,
    false,
    false,
  ]);
  for (const key of [
    'sourceAdmitted',
    'runtimeConnected',
    'productionAuthority',
  ])
    assert.equal(result[key], false);
  assert.equal(result.originalFieldsClosed, 0);
  for (const value of Object.values(result.dependentResults ?? {}))
    assert.equal(value.value, null);
}
function direct(input) {
  return produceWaterServiceCandidate({
    mode: input.mode,
    originalRequest: {
      mode: 'ADOPTED_PARAMETERS_ONLY',
      stableId: input.stableId,
      countryId: input.countryId,
      originalUnit: input.originalUnit,
      currency: input.currency,
      periodOrValueDate: input.periodOrValueDate,
    },
    adoptionSources: input.adoptionSources,
    recipeWork: input.recipeWork,
    ...Object.fromEntries(
      recordKeys
        .filter((k) => Object.hasOwn(input, k))
        .map((k) => [k, input[k]]),
    ),
  });
}
function reject(name, mutate, labour = true) {
  const input = request(labour);
  mutate(input);
  const result = consumer.read(input);
  rejected.push({
    name,
    status: result.status,
    diagnostics: result.diagnostics,
  });
  assert.equal(result.status, 'BLOCKED_ADOPTED_PARAMETER_INPUT', name);
  assert.equal(result.recipeIntermediate, null);
  assert.equal(result.declaredRecordRead, undefined);
  noActual(result);
}
test('C-TWO-KIND labour record directly supplies raw interval total to genuine R3 chain, never hours', () => {
  const input = request(),
    result = consumer.read(input);
  assert.equal(
    result.status,
    'ADOPTED_RECIPE_INTERMEDIATES_AVAILABLE',
    JSON.stringify(result.diagnostics),
  );
  assert.equal(Object.hasOwn(input.recipeWork, 'rawInput'), false);
  assert.deepEqual(
    Object.values(result.recipeIntermediate.workerDaysBySkill).map((q) => [
      q.amount,
      q.unit,
    ]),
    [
      ['0.003', 'worker-day'],
      ['0.0015', 'worker-day'],
      ['0.0005', 'worker-day'],
    ],
  );
  const projected = result.declaredRecordRead;
  assert.equal(projected.rawInputReference.amount, '10');
  assert.equal(projected.requiredHours, null);
  assert.equal(projected.netPotableDemandCandidate, null);
  assert.equal(projected.trace.pointer, '/record/rawInputTotalM3');
  assert.equal(projected.trace.originClass, 'CONSTRUCTED_NOT_ADOPTED');
  assert.match(
    projected.trace.digestMeaning,
    /NOT_SOURCE_SIGNATURE_OR_ADOPTION/u,
  );
  assert(
    result.recipeIntermediate.workerDaysBySkill.HIGH.sourceTrace.some(
      (t) => t.pointer === '/record/rawInputTotalM3',
    ),
  );
  assert.equal(
    result.parameterAdoptionRead.adoptedParameters.coefficients.length,
    8,
  );
  assert.equal(
    result.originalBinding.packet.sha256,
    SOURCE_PINS.sources.originalPacket.sha256,
  );
  assert.deepEqual(direct(input).declaredRecordRead, projected);
  noActual(result);
  observations.push({
    request: { ...input, adoptionSources: SOURCE_PINS.sources },
    result,
  });
});
test('C-TWO-KIND water declaration is demand8 beside theoretical9.024, not raw input, accepted delivery or B02', () => {
  const input = request(false),
    result = consumer.read(input);
  assert.equal(
    result.status,
    'ADOPTED_RECIPE_INTERMEDIATES_AVAILABLE',
    JSON.stringify(result.diagnostics),
  );
  const projected = result.declaredRecordRead,
    mid = result.recipeIntermediate;
  assert.equal(projected.netPotableDemandCandidate.amount, '8');
  assert.equal(projected.netPotableDemandCandidate.unit, 'M3/PERIOD');
  assert.equal(projected.netPotableDemandCandidate.adopted, false);
  assert.equal(mid.treatmentNetPotential.amount, '9.6');
  assert.equal(mid.theoreticalNetPotential.amount, '9.024');
  assert.equal(mid.deliveryRatio.amount, '0.9024');
  assert.deepEqual(
    mid.theoreticalNetPotential.sourceTrace.map((t) => t.key ?? t.kind),
    ['DECLARED_WORKLOAD_NOT_OBSERVED', 'yieldTreatment', 'pipeDeliveryYield'],
  );
  assert.equal(result.dependentResults.nationalMinimum.status, 'B02_DEFERRED');
  assert.equal(result.dependentResults.acceptedNetDelivery.value, null);
  assert.deepEqual(direct(input).declaredRecordRead, projected);
  noActual(result);
  observations.push({
    request: { ...input, adoptionSources: SOURCE_PINS.sources },
    result,
  });
});
test('C-TWO-KIND old no-record byte digests and REAL_SOURCE refusal are exactly preserved', () => {
  for (const [labour, expected] of [
    [true, 'a003a81320e2d73ad7003cc4e8b7befef6787aa59873f0f1e0a05fe9aafeecf8'],
    [false, 'abcf8cad37ae45a1a1367f7e1f983c4ce9d836e7b0b6f26428f00ab0bc897489'],
  ]) {
    const input = request(labour);
    for (const key of recordKeys) delete input[key];
    input.recipeWork.rawInput = {
      amount: '10',
      unit: 'raw-m3',
      basis: 'TOTAL_OVER_DECLARED_INTERVAL',
    };
    const result = consumer.read(input);
    assert.equal(sha256(Buffer.from(JSON.stringify(result))), expected);
    assert.equal(result.declaredRecordRead, undefined);
    noActual(result);
  }
  const result = produceWaterServiceCandidate({ mode: 'REAL_SOURCE' });
  assert.equal(
    sha256(Buffer.from(JSON.stringify(result))),
    'd7d1d6d831f627548c7b2fe1d6615c183060cdf4c5783dfa8243881fc521eef9',
  );
  assert.equal(
    produceWaterServiceCandidate({ ...request(), mode: 'REAL_SOURCE' }).status,
    'BLOCKED_REAL_SOURCE',
  );
});
test('C-TWO-KIND all4 or no4 keys: partial, null and explicit undefined never fall back', () => {
  for (const key of recordKeys) {
    reject('missing-' + key, (r) => {
      delete r[key];
    });
    reject('undefined-' + key, (r) => {
      r[key] = undefined;
    });
  }
  reject('null-record', (r) => {
    r.record = null;
  });
  reject('wrong-contract', (r) => {
    r.recordReadContract = 'V2';
  });
});
test('C-TWO-KIND canonical rationals bind same positive endpoints before arithmetic, including zero-start', () => {
  const r = request();
  r.recipeWork.interval = {
    basis: r.recipeWork.interval.basis,
    fromSimDay: '2.5',
    untilSimDay: '5.5',
  };
  r.record.period.start = { numerator: '5', denominator: '2' };
  r.record.period.endExclusive = { numerator: '11', denominator: '2' };
  const good = consumer.read(r);
  assert.equal(good.status, 'ADOPTED_RECIPE_INTERMEDIATES_AVAILABLE');
  assert.equal(good.recipeIntermediate.workerDaysBySkill.LOW.amount, '0.003');
  noActual(good);
  for (const denominator of ['0', '00', '01', '-1', 1])
    reject('denominator-' + denominator, (x) => {
      x.recipeWork.interval.fromSimDay = '0';
      x.record.period.start = { numerator: '0', denominator };
    });
  reject('noncanonical-numerator', (x) => {
    x.record.period.start.numerator = '02';
  });
  reject('period-mismatch', (x) => {
    x.record.period.endExclusive.numerator = '6';
  });
  reject('zero-interval', (x) => {
    x.recipeWork.interval.untilSimDay = '2';
    x.record.period.endExclusive.numerator = '2';
  });
  reject('unbound-axis', (x) => {
    x.record.period.axisUnit = 'HOUR';
  });
  reject('actual-time-evidence', (x) => {
    x.record.period.timeBasisEvidence = {};
  });
});
test('C-TWO-KIND duplicate raw must agree; period does not multiply totals and net demand cannot replace raw', () => {
  const input = request();
  input.recipeWork.rawInput = {
    amount: '10.00',
    unit: 'raw-m3',
    basis: 'TOTAL_OVER_DECLARED_INTERVAL',
  };
  input.recipeWork.interval.untilSimDay = '500';
  input.record.period.endExclusive.numerator = '500';
  const result = consumer.read(input);
  assert.equal(result.recipeIntermediate.workerDaysBySkill.LOW.amount, '0.003');
  noActual(result);
  reject('raw-conflict', (r) => {
    r.recipeWork.rawInput = {
      amount: '11',
      unit: 'raw-m3',
      basis: 'TOTAL_OVER_DECLARED_INTERVAL',
    };
  });
  reject('duplicate-raw-undefined', (r) => {
    r.recipeWork.rawInput = undefined;
  });
  reject('raw-record-unit', (r) => {
    r.record.rawInputTotalM3.unit = 'HOUR/PERIOD';
  });
  reject('raw-rate-basis', (r) => {
    r.record.quantityBasis = 'PER_DAY';
  });
  reject(
    'water-needs-raw',
    (r) => {
      delete r.recipeWork.rawInput;
    },
    false,
  );
  reject(
    'water-demand-Number',
    (r) => {
      r.record.netPotableMinimum.value = 8;
    },
    false,
  );
  reject('raw-Number', (r) => {
    r.record.rawInputTotalM3.value = 10;
  });
});
test('C-TWO-KIND scope/kind/phase1 evidence rejects; no new actual, cost, floor or hour-rule kind', () => {
  for (const recordKind of [
    'C01_PROTECTED_SERVICE_FLOOR_RULE_CANDIDATE_V1',
    'C01_ESSENTIAL_LOAD_REQUIREMENT_INPUT_V1',
    'C01_ACCEPTED_TRANSPORT_PORTION_EVENT_INPUT_V1',
    'C01_NET_POTABLE_ACCEPTANCE_EVENT_INPUT_V1',
  ])
    reject(recordKind, (r) => {
      r.recordKind = recordKind;
    });
  reject('kind-original-mismatch', (r) => {
    r.recordKind = 'C01_NET_POTABLE_MINIMUM_REQUIREMENT_V1';
  });
  reject('actual-origin', (r) => {
    r.recordOriginClass = 'RUNTIME_OBSERVATION';
  });
  reject('unknown-authority-leaf', (r) => {
    r.record.sourceAdmitted = true;
  });
  reject('nonempty-floor', (r) => {
    r.record.floor = {};
  });
  reject('nonempty-recipe', (r) => {
    r.record.recipe = {};
  });
  reject('hours-conversion', (r) => {
    r.record.hoursConversions = [{ hoursPerWorkerDay: '8' }];
  });
  reject('capacity', (r) => {
    r.record.capacityAttestations = [{}];
  });
  reject(
    'quality-coverage',
    (r) => {
      r.record.coverage = {};
    },
    false,
  );
  reject(
    'water-rights',
    (r) => {
      r.record.rawWaterRightsEvidence = {};
    },
    false,
  );
  reject('source-drift', (r) => {
    r.adoptionSources = { ...sources, recipe: Buffer.from('{}') };
  });
  assert.throws(
    () => consumer.read({ ...request(), countryId: 'COUNTRY_53' }),
    /COUNTRY01/u,
  );
});
test('C-TWO-KIND detached record getter is captured once; immutable output never freezes caller', () => {
  const input = request(),
    originalRecord = input.record;
  let reads = 0;
  Object.defineProperty(input, 'record', {
    enumerable: true,
    get() {
      reads++;
      return reads === 1 ? originalRecord : { sourceAdmitted: true };
    },
  });
  const result = consumer.read(input);
  assert.equal(reads, 1);
  originalRecord.rawInputTotalM3.value = '999';
  originalRecord.period.endExclusive.numerator = '999';
  assert.equal(result.declaredRecordRead.rawInputReference.amount, '10');
  assert.equal(result.declaredRecordRead.period.endExclusive.numerator, '5');
  assert.equal(Object.isFrozen(originalRecord), false);
  assert.throws(() => {
    result.declaredRecordRead.trace.canonicalDecimal = '999';
  }, TypeError);
  noActual(result);
});
after(() => {
  const out = process.env.C_TWO_KIND_EVIDENCE_DIR;
  if (!out) return;
  assert.equal(
    out,
    '/Users/samuel/Documents/econclub/.econmind-artifacts/data-interface-resume-20261023/C/physical-connection-batch-v1/implementation/focused',
  );
  assert.equal(existsSync(out), false);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    `${out}/EXECUTED_TWO_KIND_READS.json`,
    JSON.stringify(
      {
        sourcePins: SOURCE_PINS.sources,
        observations,
        interpretation:
          'Executed constructed partial projections through existing bridge/producer/fixed reader, not actual source or full schema acceptance',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  writeFileSync(
    `${out}/REJECTIONS.json`,
    JSON.stringify(rejected, null, 2) + '\n',
    { flag: 'wx' },
  );
});
