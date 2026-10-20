import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import {
  produceWaterServiceCandidate,
  R3_RECIPE_SHA256,
  COST_SCOPE_KEYS,
} from './produce-candidate.mjs';
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';

const receipt = [];
function readPinned(key, path, hash) {
  const bytes = readFileSync(path);
  assert.equal(sha256(bytes), hash, `pinned ${key}`);
  receipt.push({ key, path, sha256: hash, bytes: bytes.length });
  return bytes;
}
const pinsPath = new URL('./source-pins.json', import.meta.url);
const pins = JSON.parse(readFileSync(pinsPath));
assert.equal(pins.sources.r3Recipes.sha256, R3_RECIPE_SHA256);
const recipeBytes = readPinned(
  'fixedR3Recipe',
  pins.sources.r3Recipes.path,
  R3_RECIPE_SHA256,
).toString('utf8');
const recoveryPath =
  '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261018/C/v2-water-design/SOURCE_DELTA.json';
const recovery = JSON.parse(
  readPinned(
    'fixed56fRecovery',
    recoveryPath,
    '3a8d709eb02d043b302830613f0be19677cca859c3b2cdd7e2992e5b274a48ac',
  ),
);
const allocationPath = new URL(
  '../../artifacts/world-balanced-candidate-v1/data/water-allocations.json',
  import.meta.url,
);
const allocations = parseLossless(
  readPinned(
    'actualFixedAllocation',
    allocationPath,
    '53b4d7cd0425f6a0789cad2e1bcd0800420a5010f38307e895742df1c0567841',
  ),
);
const allocation = allocations.find(
  (r) => r.countryId === 'visual-territory-01',
);
assert.ok(allocation);
const realInput = {
  mode: 'REAL_SOURCE',
  recipeBytes,
  allocation,
  sourceRecovery: recovery,
  b02: null,
  quality: null,
  grants: null,
  staffing: null,
  inputs: null,
  costs: null,
};
const realOutput = produceWaterServiceCandidate(realInput);

function fixture() {
  const scope = {
    evidenceClass: 'TEST_ONLY',
    scenarioKind: 'TEST_ONLY_SYNTHETIC',
    countryId: 'COUNTRY_01',
    regionId: 'TEST_REGION_01',
    facilityId: 'TEST_WATER_01',
    payerId: 'TEST_OPERATOR_01',
    currency: 'XAA',
    periodRef: 'TEST_PERIOD_01',
    fromSimDay: '0',
    untilSimDay: '1',
    calendar: 'GREGORIAN',
  };
  const bound = (row) => ({ ...scope, sourceRef: 'TEST_SOURCE', ...row });
  const q = (amount, unit) => bound({ amount, unit });
  const line = (id, basis, rateNative, covers) =>
    bound({
      id,
      basis,
      rateNative,
      covers,
      unit: {
        LOW_HOURS: 'XAA/hour',
        MEDIUM_HOURS: 'XAA/hour',
        HIGH_HOURS: 'XAA/hour',
        ENERGY_MWH: 'XAA/MWh',
        STEEL_TONNES: 'XAA/tonne',
        MACHINERY_UNITS: 'XAA/equipment-unit',
        DELIVERED_NET_M3: 'XAA/delivered-m3',
        FIXED_SERVICE_ITEM: 'XAA/service-item',
      }[basis],
    });
  const lines = [
    line('TEST_COST_LOW', 'LOW_HOURS', '2', ['LABOUR_LOW']),
    line('TEST_COST_MEDIUM', 'MEDIUM_HOURS', '3', ['LABOUR_MEDIUM']),
    line('TEST_COST_HIGH', 'HIGH_HOURS', '5', ['LABOUR_HIGH']),
    line('TEST_COST_ENERGY', 'ENERGY_MWH', '7', ['ENERGY']),
    line('TEST_COST_STEEL', 'STEEL_TONNES', '11', ['STEEL_MAINTENANCE']),
    line('TEST_COST_MACHINERY', 'MACHINERY_UNITS', '13', [
      'MACHINERY_MAINTENANCE',
    ]),
    line('TEST_COST_QUALITY', 'FIXED_SERVICE_ITEM', '0.02', ['QUALITY']),
    line('TEST_COST_NETWORK', 'DELIVERED_NET_M3', '0.01', ['NETWORK']),
  ];
  const coverage = COST_SCOPE_KEYS.map((key) => {
    const linked = lines.find((l) => l.covers.includes(key));
    return bound({
      key,
      disposition: linked ? 'PRICED' : 'NOT_APPLICABLE',
      componentId: linked?.id ?? null,
      reason: linked
        ? 'Explicit synthetic rate'
        : 'TEST_ONLY bounded contract declares not applicable; not an actual fee/benefit exemption',
    });
  });
  return {
    mode: 'TEST_ONLY',
    scope,
    recipeBytes,
    capacities: {
      ecologyNetRunoff: q('10', 'raw-m3'),
      abstraction: q('20', 'raw-m3/sim-day'),
      treatment: q('10', 'raw-m3/sim-day'),
      network: q('20', 'delivered-m3/sim-day'),
    },
    processedRaw: q('10', 'raw-m3'),
    quality: bound({
      qualityClass: 'TEST_POTABLE_CLASS',
      status: 'TEST_ONLY_VALID',
    }),
    b02: bound({
      version: 'TEST_B02_V1',
      recipeSha256: R3_RECIPE_SHA256,
      qualityClass: 'TEST_POTABLE_CLASS',
      beneficiaries: [
        bound({
          ref: 'TEST_HOUSEHOLDS',
          purpose: 'DOMESTIC',
          requiredNet: q('8', 'delivered-m3'),
        }),
        bound({
          ref: 'TEST_PUBLIC',
          purpose: 'CRITICAL_PUBLIC',
          requiredNet: q('2', 'delivered-m3'),
        }),
      ],
    }),
    grants: [
      bound({
        rightRef: 'TEST_HH_RIGHT',
        beneficiaryRef: 'TEST_HOUSEHOLDS',
        status: 'TEST_ONLY_GRANTED',
        quotaBasis: 'DELIVERED_NET',
        quota: q('8', 'delivered-m3/sim-day'),
      }),
      bound({
        rightRef: 'TEST_PUBLIC_RIGHT',
        beneficiaryRef: 'TEST_PUBLIC',
        status: 'TEST_ONLY_GRANTED',
        quotaBasis: 'DELIVERED_NET',
        quota: q('2', 'delivered-m3/sim-day'),
      }),
    ],
    staffing: Object.fromEntries(
      ['LOW', 'MEDIUM', 'HIGH'].map((s) => [
        s,
        bound({
          hoursPerWorkerDay: q('6', 'hour/worker-day'),
          availableHours: q('1', 'hour'),
        }),
      ]),
    ),
    inputs: {
      ENERGY: bound({
        amount: '1',
        unit: 'MWh',
        deliveryStatus: 'ACCEPTED_TEST_ONLY',
      }),
      STEEL: bound({
        amount: '1',
        unit: 'tonne',
        deliveryStatus: 'ACCEPTED_TEST_ONLY',
      }),
      MACHINERY: bound({
        amount: '1',
        unit: 'equipment-unit',
        deliveryStatus: 'ACCEPTED_TEST_ONLY',
      }),
    },
    deliveryEvents: [
      bound({
        eventId: 'TEST_HH_DELIVERY_1',
        beneficiaryRef: 'TEST_HOUSEHOLDS',
        amount: '7',
        unit: 'delivered-m3',
        status: 'ACCEPTED_TEST_ONLY',
      }),
      bound({
        eventId: 'TEST_PUBLIC_DELIVERY_1',
        beneficiaryRef: 'TEST_PUBLIC',
        amount: '2',
        unit: 'delivered-m3',
        status: 'ACCEPTED_TEST_ONLY',
      }),
    ],
    retainedNet: q('0.024', 'delivered-m3'),
    wastedNet: q('0', 'delivered-m3'),
    costs: bound({ mode: 'DISJOINT', lines, coverage }),
  };
}
const codes = (result) => result.diagnostics.map((r) => r.code);
const pristine = fixture(),
  syntheticOutput = produceWaterServiceCandidate(pristine);
const localReviewCases = [];
function observeLocal(name, input, expected) {
  const actual = produceWaterServiceCandidate(input);
  localReviewCases.push({ name, expected, actual });
  return actual;
}
function lowEnergyBundle() {
  const f = fixture();
  Object.assign(f.costs.lines[0], {
    id: 'TEST_LOW_ENERGY_BUNDLE',
    basis: 'FIXED_SERVICE_ITEM',
    unit: 'XAA/service-item',
    rateNative: '1',
    covers: ['LABOUR_LOW', 'ENERGY'],
  });
  f.costs.coverage.find((r) => r.key === 'LABOUR_LOW').componentId =
    'TEST_LOW_ENERGY_BUNDLE';
  return f;
}
test('C-LOCAL review base input exactly matches E retained six-case input', () => {
  assert.equal(
    sha256(JSON.stringify(pristine, null, 2) + '\n'),
    '0862f2503f88979e697e4dd632ae806c9b2b1a5b268c7168b3ebdd34758c2b52',
  );
});
test('C-LOCAL-01 rejects bundled ENERGY plus separately charged ENERGY', () => {
  const r = observeLocal(
    'R1_bundle_energy_plus_separate_energy',
    lowEnergyBundle(),
    'BLOCKED_TEST_INPUT',
  );
  assert.equal(r.status, 'BLOCKED_TEST_INPUT');
  assert.equal(r.conditional, null);
});
test('C-LOCAL-01 preserves one paid bundle with ENERGY legitimately INCLUDED', () => {
  const f = lowEnergyBundle();
  f.costs.lines = f.costs.lines.filter((r) => r.id !== 'TEST_COST_ENERGY');
  Object.assign(
    f.costs.coverage.find((r) => r.key === 'ENERGY'),
    { disposition: 'INCLUDED', componentId: 'TEST_LOW_ENERGY_BUNDLE' },
  );
  const r = observeLocal(
    'single_bundle_includes_energy_control',
    f,
    'TEST_ONLY_CONSISTENT',
  );
  assert.equal(r.status, 'TEST_ONLY_CONSISTENT');
  assert.equal(r.conditional.cost.completeNativeCost, '1.152037');
});
test('C-LOCAL-02 rejects explicit off-interval energy despite same periodRef', () => {
  const f = fixture();
  f.inputs.ENERGY.fromSimDay = '2';
  f.inputs.ENERGY.untilSimDay = '3';
  const r = observeLocal(
    'R2_accepted_energy_explicit_off_interval',
    f,
    'BLOCKED_TEST_INPUT',
  );
  assert.equal(r.status, 'BLOCKED_TEST_INPUT');
  assert.equal(r.conditional, null);
});
test('C-LOCAL-01 B benefits control is valid but an overlapping wage bundle is blocked', () => {
  const f = fixture();
  f.costs.lines.push({
    ...f.costs.lines[0],
    id: 'TEST_COST_BENEFITS',
    rateNative: '1',
    covers: ['BENEFITS'],
  });
  Object.assign(
    f.costs.coverage.find((r) => r.key === 'BENEFITS'),
    { disposition: 'PRICED', componentId: 'TEST_COST_BENEFITS' },
  );
  const control = observeLocal(
    'B_disjoint_benefits_control',
    f,
    'TEST_ONLY_CONSISTENT',
  );
  assert.equal(control.status, 'TEST_ONLY_CONSISTENT');
  assert.equal(control.conditional.cost.completeNativeCost, '0.241037');
  f.costs.lines[0].covers.push('BENEFITS');
  const negative = observeLocal(
    'B_overlapping_benefits_in_wage',
    f,
    'BLOCKED_TEST_INPUT',
  );
  assert.equal(negative.status, 'BLOCKED_TEST_INPUT');
  assert.ok(codes(negative).includes('OVERLAPPING_ACTIVE_COST_COVERAGE'));
});
test('C-LOCAL-01 covers declarations are nonempty unique known categories', () => {
  for (const covers of [
    null,
    [],
    ['LABOUR_LOW', 'LABOUR_LOW'],
    ['LABOUR_LOW', 'UNKNOWN_COST'],
  ]) {
    const f = fixture();
    f.costs.lines[0].covers = covers;
    const r = produceWaterServiceCandidate(f);
    assert.equal(r.status, 'BLOCKED_TEST_INPUT');
    assert.ok(codes(r).includes('EXPLICIT_UNIQUE_COST_COVERS_REQUIRED'));
  }
});
test('C-LOCAL-01 reverse coverage rejects unbound and NOT_APPLICABLE contradictions', () => {
  for (const mutate of [
    (f) => f.costs.lines[0].covers.push('BENEFITS'),
    (f) => {
      const row = f.costs.coverage.find((r) => r.key === 'LABOUR_LOW');
      Object.assign(row, {
        disposition: 'NOT_APPLICABLE',
        componentId: null,
        reason: 'TEST_ONLY contradictory waiver',
      });
    },
  ]) {
    const f = fixture();
    mutate(f);
    const r = produceWaterServiceCandidate(f);
    assert.equal(r.status, 'BLOCKED_TEST_INPUT');
    assert.ok(codes(r).includes('COST_COVERS_REVERSE_MISMATCH'));
  }
  const f = fixture();
  f.costs.coverage.find((r) => r.key === 'LABOUR_LOW').disposition = 'INCLUDED';
  assert.ok(
    codes(produceWaterServiceCandidate(f)).includes(
      'INCLUDED_WITHOUT_PRICED_COMPONENT',
    ),
  );
});
test('C-LOCAL-02 every scoped evidence record requires the same explicit frame', () => {
  const paths = [
    ['inputs', 'ENERGY'],
    ['capacities', 'network'],
    ['staffing', 'LOW', 'availableHours'],
    ['quality'],
    ['b02'],
    ['b02', 'beneficiaries', 0],
    ['grants', 0, 'quota'],
    ['costs'],
    ['costs', 'lines', 0],
    ['costs', 'coverage', 0],
    ['deliveryEvents', 0],
    ['retainedNet'],
    ['wastedNet'],
  ];
  for (const path of paths)
    for (const field of ['fromSimDay', 'untilSimDay', 'calendar']) {
      const f = fixture();
      const row = path.reduce((value, key) => value[key], f);
      row[field] =
        field === 'calendar'
          ? 'UNRELATED_CALENDAR'
          : field === 'fromSimDay'
            ? '2'
            : '3';
      assert.equal(
        produceWaterServiceCandidate(f).status,
        'BLOCKED_TEST_INPUT',
        `${path.join('/')}:${field}`,
      );
      delete row[field];
      assert.equal(
        produceWaterServiceCandidate(f).status,
        'BLOCKED_TEST_INPUT',
        `missing ${path.join('/')}:${field}`,
      );
    }
});
test('C-LOCAL-02 canonical-equivalent explicit interval and event replay remain valid', () => {
  const f = fixture();
  f.inputs.ENERGY.fromSimDay = '0.0';
  f.inputs.ENERGY.untilSimDay = '1.00';
  f.grants[0].fromSimDay = '0.00';
  f.grants[0].untilSimDay = '1e0';
  const replay = structuredClone(f.deliveryEvents[0]);
  replay.fromSimDay = '0.000';
  replay.untilSimDay = '1.000';
  f.deliveryEvents.push(replay);
  const r = produceWaterServiceCandidate(f);
  assert.equal(r.status, 'TEST_ONLY_CONSISTENT', JSON.stringify(r.diagnostics));
  assert.equal(r.conditional.acceptedNetM3, '9');
  assert.deepEqual(r.conditional.deduplicatedEventIds, ['TEST_HH_DELIVERY_1']);
  replay.fromSimDay = '2';
  replay.untilSimDay = '3';
  const bad = produceWaterServiceCandidate(f);
  assert.equal(bad.status, 'BLOCKED_TEST_INPUT');
  assert.ok(codes(bad).includes('SCOPE_INTERVAL_MISMATCH'));
});

test('real fixed source stays BLOCKED/null with exact proposal/basis/missing readback', () => {
  assert.equal(realOutput.status, 'BLOCKED_REAL_SOURCE');
  assert.equal(
    realOutput.sourceReadback.allocationStatus,
    'ALLOCATION_PROPOSAL_NOT_GRANTED',
  );
  assert.equal(realOutput.sourceReadback.declaredQuotaBasis, null);
  assert.equal(realOutput.retainedSourceConflicts.length, 4);
  assert.equal(realOutput.actualQuantities, null);
  assert.equal(realOutput.actualSkillHours, null);
  assert.equal(realOutput.actualCompleteNativeCost, null);
  for (const code of [
    'B02_ADOPTED_SCOPE_UNBOUND',
    'ACTUAL_QUALITY_UNBOUND',
    'ACTUAL_GRANT_UNBOUND',
    'QUOTA_BASIS_UNSPECIFIED_OR_PROPOSAL',
    'ACTUAL_SKILL_HOURS_UNBOUND',
    'ACCEPTED_OPERATING_INPUTS_UNBOUND',
    'COMPLETE_RECURRING_NATIVE_COST_UNBOUND',
  ])
    assert.ok(codes(realOutput).includes(code));
});
test('caller approval/complete flags cannot authenticate the real source', () => {
  const r = produceWaterServiceCandidate({
    ...fixture(),
    mode: 'REAL_SOURCE',
    adopted: true,
    complete: true,
    sourceAdmitted: true,
  });
  assert.equal(r.status, 'BLOCKED_REAL_SOURCE');
  assert.equal(r.conditional, null);
  assert.equal(r.sourceAdmitted, false);
});
test('immutable real-source output does not freeze or alias caller source objects', () => {
  const sourceRecovery = {
    quality: { actualQuality: { label: 'UNADMITTED_SOURCE_ONLY' } },
    conflicts: [{ kind: 'SOURCE_ONLY_CONFLICT' }],
  };
  const r = produceWaterServiceCandidate({
    mode: 'REAL_SOURCE',
    sourceRecovery,
  });
  assert.equal(Object.isFrozen(sourceRecovery.conflicts), false);
  assert.equal(Object.isFrozen(sourceRecovery.quality.actualQuality), false);
  sourceRecovery.conflicts[0].kind = 'CALLER_LOCAL_EDIT';
  sourceRecovery.quality.actualQuality.label = 'CALLER_LOCAL_EDIT';
  assert.equal(r.retainedSourceConflicts[0].kind, 'SOURCE_ONLY_CONFLICT');
  assert.equal(r.sourceReadback.quality.label, 'UNADMITTED_SOURCE_ONLY');
});
test('explicit TEST_ONLY complete case uses exact R3 yields once and explicit six-hour basis', () => {
  assert.equal(
    syntheticOutput.status,
    'TEST_ONLY_CONSISTENT',
    JSON.stringify(syntheticOutput.diagnostics),
  );
  const c = syntheticOutput.conditional;
  assert.equal(c.rawCapacityM3, '10');
  assert.equal(c.combinedCandidateYield, '0.9024');
  assert.equal(c.netCapacityUpperBoundM3, '9.024');
  assert.equal(c.producedNetM3, '9.024');
  assert.equal(c.acceptedNetM3, '9');
  assert.equal(c.unmetNetM3, '1');
  assert.equal(c.hoursBySkill.LOW, '0.018');
  assert.equal(c.hoursBySkill.HIGH, '0.003');
  assert.equal(c.cost.completeNativeCost, '0.223037');
  assert.equal(syntheticOutput.actualCompleteNativeCost, null);
});
test('different raw treatment and net network capacities stay dimensionally separate', () => {
  const f = fixture();
  f.capacities.network.amount = '5';
  f.processedRaw.amount = '5';
  f.deliveryEvents[0].amount = '3';
  f.deliveryEvents[1].amount = '1';
  f.retainedNet.amount = '0.512';
  const r = produceWaterServiceCandidate(f);
  assert.equal(r.status, 'TEST_ONLY_CONSISTENT', JSON.stringify(r.diagnostics));
  assert.equal(r.conditional.rawCapacityM3, '10');
  assert.equal(r.conditional.netCapacityUpperBoundM3, '5');
  assert.equal(r.conditional.producedNetM3, '4.512');
  assert.equal(r.conditional.acceptedNetM3, '4');
});
test('partial accepted delivery is not capacity, target or in-transit', () => {
  const f = fixture();
  f.deliveryEvents[0].amount = '3';
  f.deliveryEvents[1].amount = '1';
  f.retainedNet.amount = '5.024';
  const r = produceWaterServiceCandidate(f);
  assert.equal(r.conditional.acceptedNetM3, '4');
  assert.equal(r.conditional.unmetNetM3, '6');
  const g = fixture();
  g.deliveryEvents[0].status = 'IN_TRANSIT';
  assert.equal(produceWaterServiceCandidate(g).status, 'BLOCKED_TEST_INPUT');
});
test('identical same-event replay deduplicates, conflicting same ID blocks', () => {
  const f = fixture();
  f.deliveryEvents.push(structuredClone(f.deliveryEvents[0]));
  const r = produceWaterServiceCandidate(f);
  assert.equal(r.conditional.acceptedNetM3, '9');
  assert.deepEqual(r.conditional.deduplicatedEventIds, ['TEST_HH_DELIVERY_1']);
  f.deliveryEvents[2].amount = '6';
  assert.ok(
    codes(produceWaterServiceCandidate(f)).includes(
      'CONFLICTING_DUPLICATE_EVENT',
    ),
  );
});
test('duplicate beneficiary/right shares do not duplicate one scarce supply', () => {
  const f = fixture();
  f.b02.beneficiaries.push(structuredClone(f.b02.beneficiaries[0]));
  assert.ok(
    codes(produceWaterServiceCandidate(f)).includes(
      'DUPLICATE_OR_INVALID_BENEFICIARY',
    ),
  );
  const g = fixture();
  g.grants[1].rightRef = g.grants[0].rightRef;
  assert.ok(
    codes(produceWaterServiceCandidate(g)).includes(
      'DUPLICATE_OR_UNSCOPED_RIGHT',
    ),
  );
});
test('raw/unknown/proposal grant basis and wrongly typed raw capacity block', () => {
  for (const basis of ['RAW', 'UNSPECIFIED', null]) {
    const f = fixture();
    f.grants[0].quotaBasis = basis;
    assert.ok(
      codes(produceWaterServiceCandidate(f)).includes(
        'GRANT_OR_QUOTA_BASIS_UNBOUND',
      ),
    );
  }
  const p = fixture();
  p.grants[0].status = 'ALLOCATION_PROPOSAL_NOT_GRANTED';
  assert.equal(produceWaterServiceCandidate(p).status, 'BLOCKED_TEST_INPUT');
  const f = fixture();
  f.capacities.treatment.unit = 'delivered-m3/sim-day';
  assert.ok(
    codes(produceWaterServiceCandidate(f)).includes('UNIT_OR_BASIS_MISMATCH'),
  );
});
test('missing worker-day hours has no default eight-hour or free labour path', () => {
  for (const missing of [null, undefined, 8]) {
    const f = fixture();
    f.staffing.LOW.hoursPerWorkerDay.amount = missing;
    assert.ok(
      codes(produceWaterServiceCandidate(f)).includes('EXACT_DECIMAL_REQUIRED'),
    );
  }
  const f = fixture();
  f.staffing.HIGH.availableHours.amount = '0';
  assert.ok(
    codes(produceWaterServiceCandidate(f)).includes('SKILL_HOURS_SHORTAGE'),
  );
});
test('missing/mismatched quality, rights and accepted inputs block operating output', () => {
  const mutations = [
    (f) => {
      f.quality = null;
    },
    (f) => {
      f.grants = [];
    },
    (f) => {
      f.inputs.ENERGY.deliveryStatus = 'CAPACITY_ONLY';
    },
    (f) => {
      f.inputs.MACHINERY = null;
    },
    (f) => {
      f.inputs.STEEL.amount = '0';
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    const r = produceWaterServiceCandidate(f);
    assert.equal(r.status, 'BLOCKED_TEST_INPUT');
    assert.equal(r.conditional, null);
  }
});
test('B02 source/version/quality/payer/period scope is required and read-only', () => {
  for (const mutate of [
    (f) => {
      f.b02 = null;
    },
    (f) => {
      f.b02.version = '';
    },
    (f) => {
      f.b02.recipeSha256 = 'old';
    },
    (f) => {
      f.b02.qualityClass = 'other';
    },
    (f) => {
      f.b02.payerId = 'TEST_OTHER';
    },
    (f) => {
      f.b02.periodRef = 'TEST_OTHER';
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(produceWaterServiceCandidate(f).status, 'BLOCKED_TEST_INPUT');
  }
});
test('partial fee/benefit coverage and unknown quote leave complete native cost null', () => {
  const f = fixture();
  f.costs.coverage = f.costs.coverage.filter((r) => r.key !== 'FEES');
  const r = produceWaterServiceCandidate(f);
  assert.equal(r.status, 'TEST_ONLY_PARTIAL_COST');
  assert.equal(r.conditional.cost.completeNativeCost, null);
  assert.deepEqual(r.conditional.cost.missingCoverage, ['FEES']);
  const g = fixture();
  g.costs.lines[0].rateNative = null;
  const q = produceWaterServiceCandidate(g);
  assert.equal(q.status, 'TEST_ONLY_PARTIAL_COST');
  assert.ok(q.conditional.cost.unknownCostComponents.includes('TEST_COST_LOW'));
});
test('inclusive tariff OR disjoint costs, never all-in plus additional wages', () => {
  const f = fixture();
  const old = f.costs.lines[0];
  f.costs.mode = 'INCLUSIVE';
  f.costs.lines = [
    {
      ...old,
      id: 'TEST_ALL_IN',
      basis: 'DELIVERED_NET_M3',
      unit: 'XAA/delivered-m3',
      rateNative: '0.1',
      covers: [...COST_SCOPE_KEYS],
    },
  ];
  f.costs.coverage = f.costs.coverage.map((r) => ({
    ...r,
    disposition: 'INCLUDED',
    componentId: 'TEST_ALL_IN',
  }));
  const r = produceWaterServiceCandidate(f);
  assert.equal(r.status, 'TEST_ONLY_CONSISTENT');
  assert.equal(r.conditional.cost.completeNativeCost, '0.9');
  f.costs.lines.push(old);
  assert.ok(
    codes(produceWaterServiceCandidate(f)).includes('INCLUSIVE_DOUBLE_COUNT'),
  );
});
test('duplicate cost IDs/coverage, wrong native currency/unit and unproved not-applicable fail', () => {
  const mutations = [
    (f) => f.costs.lines.push(structuredClone(f.costs.lines[0])),
    (f) => f.costs.coverage.push(structuredClone(f.costs.coverage[0])),
    (f) => {
      f.costs.lines[0].currency = 'GCU';
    },
    (f) => {
      f.costs.lines[0].unit = 'XAA/worker-day';
    },
    (f) => {
      f.costs.coverage.find((r) => r.disposition === 'NOT_APPLICABLE').reason =
        '';
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    assert.equal(produceWaterServiceCandidate(f).status, 'BLOCKED_TEST_INPUT');
  }
});
test('legacy/new recipe conflict cannot be bypassed with a declared hash or injected coefficient', () => {
  for (const bytes of ['{}', recipeBytes.replace('0.0003', '0.000005')]) {
    const f = fixture();
    f.recipeBytes = bytes;
    f.recipeSha256 = R3_RECIPE_SHA256;
    assert.ok(
      codes(produceWaterServiceCandidate(f)).includes(
        'EXACT_R3_RECIPE_PIN_REQUIRED',
      ),
    );
  }
});
test('no pre-applied second yield, excess processing, overdelivery or unbalanced stock flow', () => {
  const mutations = [
    (f) => {
      f.processedRaw.amount = '11';
    },
    (f) => {
      f.capacities.network.amount = '8';
    },
    (f) => {
      f.deliveryEvents[0].amount = '9';
    },
    (f) => {
      f.retainedNet.amount = '0';
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    assert.equal(produceWaterServiceCandidate(f).status, 'BLOCKED_TEST_INPUT');
  }
});
test('all outcomes remain immutable/inert and original axes false; input unchanged', () => {
  const f = fixture(),
    before = JSON.stringify(f),
    a = produceWaterServiceCandidate(f),
    b = produceWaterServiceCandidate(f);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(f), before);
  assert.ok(Object.isFrozen(a.conditional.cost));
  for (const r of [
    a,
    realOutput,
    produceWaterServiceCandidate({ mode: 'TEST_ONLY' }),
  ]) {
    assert.ok(Object.values(r.originalStages).every((v) => v === false));
    assert.equal(r.productionAuthority, false);
    assert.equal(r.sourceAdmitted, false);
    assert.equal(r.runtimeConnected, false);
    assert.equal(r.originalFieldsClosed, 0);
  }
});

after(() => {
  const out = process.env.C_WATER_CANDIDATE_EVIDENCE_DIR;
  if (!out) return;
  if (
    !/^\/Users\/samuel\/Documents\/econclub\/\.econmind-artifacts\/unknown2544-resume-20261018\/C\/(?:v4-pure-producer|v5-local-correction)-run-[1-9]\d*$/u.test(
      out,
    ) ||
    existsSync(out)
  )
    throw new Error('Exclusive C-only evidence target required');
  mkdirSync(out);
  const save = (name, value) =>
    writeFileSync(`${out}/${name}`, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
    });
  const before = receipt.map((r) => ({ ...r, path: String(r.path) }));
  for (const r of receipt)
    assert.equal(
      sha256(readFileSync(r.path)),
      r.sha256,
      'Sources unchanged after focused tests',
    );
  save('SOURCE_READ_RECEIPT.json', {
    scope:
      'Three fixed source buffers (recipe/recovery/actual allocation), read then rehashed; no recover(), old suite or model run. Module/config/tool IO is not included.',
    sources: before,
    afterHashesUnchanged: true,
  });
  save('REAL_SOURCE_INPUT_READBACK.json', {
    mode: realInput.mode,
    allocation,
    quality: recovery.quality,
    retainedSourceConflicts: recovery.conflicts,
    b02: null,
    grants: null,
    staffing: null,
    inputs: null,
    costs: null,
    meaning:
      'Bounded source readset only; null is not proof that no other source exists',
  });
  save('REAL_SOURCE_CANDIDATE.json', realOutput);
  save('TEST_ONLY_COMPLETE_INPUT.json', pristine);
  save('TEST_ONLY_COMPLETE_CANDIDATE.json', syntheticOutput);
  if (localReviewCases.length)
    save('LOCAL_R1_R2_CASE_OUTPUTS.json', localReviewCases);
});
