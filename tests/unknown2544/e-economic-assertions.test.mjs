import assert from 'node:assert/strict';
import test from 'node:test';
import { assessEconomicObservation } from '../../tools/unknown2544/e-economic-assertions.mjs';
import { reviewEconomicInput } from '../../tools/unknown2544/e-economic-review.mjs';

const row = (field, unit = 'NATIVE_MONEY', scope = 'ENTITY') => ({
  stableId: `U2544::${scope}::ENTITY_A::${field}`,
  scope,
  ownerId: 'ENTITY_A',
  countryId: 'COUNTRY_A',
  missingField: field,
  originalUnit: unit,
});
const review = (r, o) =>
  assessEconomicObservation(r, {
    unit: r.originalUnit,
    currency: 'LC_A',
    nativeCurrency: 'LC_A',
    ...o,
  });
const check = (result, name) => result.checks.find((c) => c.name === name);
const scope = {
  worldId: 'WORLD_A',
  countryId: 'COUNTRY_A',
  entityId: 'ENTITY_A',
  accountId: 'CASH_A',
  accountClass: 'CASH',
  issuerId: 'ISSUER_A',
  purpose: 'CASH_ON_HAND',
  currency: 'LC_A',
  valueDate: 'DATE_A',
  asOf: 'HEAD_A',
  sourceVersion: 'V1',
};
const cash = () => ({
  scope,
  opening: '100.1',
  closing: '80.1',
  flowCoverage: 'COMPLETE_DECLARED_SCOPE',
  settledFlows: [
    { id: 'FLOW_A', state: 'SETTLED', direction: 'OUT', amount: '20', scope },
  ],
  restrictions: {
    coverage: 'COMPLETE_DECLARED_SCOPE',
    atoms: [
      { id: 'freeze', amount: '60' },
      { id: 'buffer', amount: '30' },
    ],
    partitions: [
      { id: 'overlap', atomIds: ['freeze', 'buffer'], amount: '20' },
      { id: 'freezeOnly', atomIds: ['freeze'], amount: '40' },
      { id: 'bufferOnly', atomIds: ['buffer'], amount: '10' },
    ],
    unionAmount: '70',
  },
  declaredAvailable: '10.1',
});

test('declared cash arithmetic and overlap union do not confer source authority', () => {
  const r = review(row('availableNativeCash'), { cash: cash() });
  assert.equal(
    check(r, 'cash-reconciliation').status,
    'CONSISTENT_DECLARATION',
  );
  assert.equal(r.conclusion, 'INSUFFICIENT_FOR_ORIGINAL_FIELD_ACCEPTANCE');
  for (const k of [
    'sourceComplete',
    'engineeringWired',
    'validationPassed',
    'formallyAdopted',
    'closureProposed',
  ])
    assert.equal(r[k], false);
});
for (const [name, mutate] of [
  [
    'duplicate settled flow',
    (c) => c.settledFlows.push(structuredClone(c.settledFlows[0])),
  ],
  [
    'wrong native currency',
    (c) => (c.settledFlows[0].scope = { ...scope, currency: 'GCU' }),
  ],
  [
    'claim treated as cash',
    (c) => (c.scope = { ...scope, purpose: 'CLAIM_RECEIVABLE' }),
  ],
  ['overlap double counted', (c) => (c.restrictions.unionAmount = '90')],
  ['uncovered restriction atom', (c) => c.restrictions.partitions.pop()],
  ['unsettled inflow', (c) => (c.settledFlows[0].state = 'PROPOSED')],
])
  test(`cash rejects ${name}`, () => {
    const c = cash();
    mutate(c);
    assert.equal(
      check(
        review(row('availableNativeCash'), { cash: c }),
        'cash-reconciliation',
      ).status,
      'CONTRADICTED',
    );
  });

test('negative shortfall is not clipped or fabricated into zero availability', () => {
  const c = cash();
  c.closing = '60';
  c.opening = '80';
  c.declaredAvailable = '-10';
  assert.equal(
    check(
      review(row('availableNativeCash'), { cash: c }),
      'cash-reconciliation',
    ).status,
    'UNKNOWN',
  );
  c.declaredAvailable = '0';
  assert.equal(
    check(
      review(row('availableNativeCash'), { cash: c }),
      'cash-reconciliation',
    ).status,
    'CONTRADICTED',
  );
});
test('missing coverage never becomes empty/zero evidence', () => {
  const c = cash();
  c.flowCoverage = 'UNKNOWN';
  assert.equal(
    check(
      review(row('availableNativeCash'), { cash: c }),
      'cash-reconciliation',
    ).status,
    'UNKNOWN',
  );
});
test('exact rational arithmetic retains values above Number safe integer range', () => {
  const c = cash();
  c.opening = '9007199254740993.100000000000000001';
  c.closing = '9007199254740973.100000000000000001';
  c.declaredAvailable = '9007199254740903.100000000000000001';
  assert.equal(
    check(
      review(row('availableNativeCash'), { cash: c }),
      'cash-reconciliation',
    ).status,
    'CONSISTENT_DECLARATION',
  );
});

const obligation = () => ({
  entityId: 'ENTITY_A',
  period: 'P1',
  currency: 'LC_A',
  coverage: {
    kind: 'ENTITY_PERIOD_REGISTER',
    status: 'COMPLETE_DECLARED_SCOPE',
    entityId: 'ENTITY_A',
    period: 'P1',
    currency: 'LC_A',
    obligationIds: ['O1'],
    obligationOriginalAmounts: { O1: '10' },
  },
  rows: [
    {
      id: 'O1',
      componentId: 'C1',
      entityId: 'ENTITY_A',
      currency: 'LC_A',
      period: 'P1',
      legalBasisRef: 'LEGAL_A',
      ruleVersion: 'RULE_V1',
      classification: 'MANDATORY_NON_DEBT',
      classificationBasis: 'NAMED_LEGAL_RULE',
      originalAmount: '10',
      settlements: [
        {
          id: 'S1',
          obligationId: 'O1',
          componentId: 'C1',
          currency: 'LC_A',
          state: 'SETTLED_OR_LEGALLY_RELEASED',
          amount: '2',
        },
      ],
      releases: [],
      unpaidAmount: '8',
    },
  ],
  mandatoryNonDebt: '8',
  committedDiscretionary: '0',
});
test('obligations reconcile unique unpaid components, not whole budget or commitment flag', () => {
  const o = obligation(),
    r = row('canonicalObligations', 'REGISTER');
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').status,
    'CONSISTENT_DECLARATION',
  );
  o.rows[0].classificationBasis = 'COMMITTED_FLAG_ONLY';
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').status,
    'CONTRADICTED',
  );
});
test('one line cannot declare a complete entity obligation register', () => {
  const o = obligation();
  o.coverage.kind = 'ONE_NEW_BUDGET_LINE';
  assert.equal(
    check(
      review(row('canonicalObligations', 'REGISTER'), { obligations: o }),
      'obligations-and-budget',
    ).status,
    'UNKNOWN',
  );
});
test('debt and duplicate component do not enter mandatory non-debt twice', () => {
  const o = obligation(),
    r = row('canonicalObligations', 'REGISTER');
  o.rows[0].classification = 'DEBT_SERVICE';
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').status,
    'CONTRADICTED',
  );
  o.mandatoryNonDebt = '0';
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').status,
    'CONSISTENT_DECLARATION',
  );
  o.rows.push(structuredClone(o.rows[0]));
  o.coverage.obligationOriginalAmounts.O1 = '20';
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').reason,
    'DUPLICATE_ECONOMIC_COMPONENT',
  );
});
test('multiple components of one obligation reconcile to one original principal, with no reused allocation', () => {
  const o = obligation(),
    r = row('canonicalObligations', 'REGISTER');
  o.rows[0].originalAmount = '4';
  o.rows[0].unpaidAmount = '2';
  o.rows.push({
    ...structuredClone(o.rows[0]),
    componentId: 'C2',
    originalAmount: '6',
    unpaidAmount: '6',
    settlements: [],
  });
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').status,
    'CONSISTENT_DECLARATION',
  );
  o.rows[1].settlements = [{ ...o.rows[0].settlements[0], componentId: 'C2' }];
  o.rows[1].unpaidAmount = '4';
  o.mandatoryNonDebt = '6';
  assert.equal(
    check(review(r, { obligations: o }), 'obligations-and-budget').reason,
    'MISSING_OR_REUSED_ALLOCATION_ID',
  );
});

test('MW requires accepted hours; capacity is not actual MWh', () => {
  const r = row('energyDeliveredMinimum', 'MWH/PERIOD'),
    d = {
      unit: 'MWH/PERIOD',
      amount: '25',
      acceptedPowerMw: '10',
      acceptedHours: '2.5',
      state: 'ACCEPTED_DELIVERED',
      period: 'P1',
      acceptanceSourceRef: 'METER_A',
    };
  assert.equal(
    check(review(r, { delivery: d }), 'actual-delivery').status,
    'CONSISTENT_DECLARATION',
  );
  d.amount = '10';
  assert.equal(
    check(review(r, { delivery: d }), 'actual-delivery').status,
    'CONTRADICTED',
  );
  d.state = 'CAPACITY';
  assert.equal(
    check(review(r, { delivery: d }), 'actual-delivery').status,
    'UNKNOWN',
  );
});
test('a design minimum is not falsely required to be an executed delivery', () => {
  const r = row('energyDeliveredMinimum', 'MWH/PERIOD');
  const result = review(r, {
    minimumRequirement: {
      unit: r.originalUnit,
      amount: '10',
      kind: 'SOURCE_BOUND_MINIMUM_REQUIREMENT',
      period: 'P1',
      sourceRef: 'ADOPTED_REQUIREMENT_LOCATOR',
    },
  });
  assert.equal(
    check(result, 'source-minimum-requirement').status,
    'CONSISTENT_DECLARATION',
  );
  assert.equal(check(result, 'actual-delivery').status, 'UNKNOWN');
  assert.equal(result.conclusion, 'INSUFFICIENT_FOR_ORIGINAL_FIELD_ACCEPTANCE');
});
test('tonne-km, potable quality and labour hours preserve their actual units', () => {
  const tr = row('transportMinimum', 'TONNE_KM/PERIOD'),
    d = {
      unit: 'TONNE_KM/PERIOD',
      amount: '6',
      acceptedTonnes: '2',
      acceptedDistanceKm: '3',
      state: 'ACCEPTED_DELIVERED',
      period: 'P1',
      acceptanceSourceRef: 'ACCEPT_A',
    };
  assert.equal(
    check(review(tr, { delivery: d }), 'actual-delivery').status,
    'CONSISTENT_DECLARATION',
  );
  const wr = row('waterPotableDeliveredMinimum', 'M3/PERIOD');
  assert.equal(
    check(
      review(wr, { delivery: { ...d, unit: wr.originalUnit, quality: 'RAW' } }),
      'actual-delivery',
    ).status,
    'UNKNOWN',
  );
  const lr = row('labourMinimumHours', 'HOUR/PERIOD');
  assert.equal(
    check(
      review(lr, {
        delivery: { ...d, unit: lr.originalUnit, basis: 'WORKER_DAYS' },
      }),
      'actual-delivery',
    ).status,
    'UNKNOWN',
  );
});
test('inclusive tariff OR disjoint native components, not both or overlapping cost atoms', () => {
  const r = row('energyCompleteCostNative'),
    c = {
      currency: 'LC_A',
      convention: 'ALL_INCLUSIVE_TARIFF',
      tariffTotal: '4',
      total: '4',
      addends: [],
      period: 'P1',
      sourceRef: 'TARIFF_A',
    };
  assert.equal(
    check(review(r, { cost: c }), 'native-cost').status,
    'CONSISTENT_DECLARATION',
  );
  c.addends = [{ amount: '1', currency: 'LC_A', costAtomIds: ['LABOUR'] }];
  assert.equal(
    check(review(r, { cost: c }), 'native-cost').status,
    'CONTRADICTED',
  );
  c.convention = 'DISJOINT_COMPONENTS';
  c.tariffTotal = null;
  c.total = '2';
  c.addends.push({ ...c.addends[0] });
  assert.equal(
    check(review(r, { cost: c }), 'native-cost').status,
    'CONTRADICTED',
  );
});
test('native money is never assumed equal to GCU', () =>
  assert.equal(
    check(review(row('feeTotalNative'), { currency: 'GCU' }), 'native-currency')
      .status,
    'CONTRADICTED',
  ));
test('constructed GCU is not history, but a genuinely original GCU declaration is not categorically forbidden', () => {
  const r = row('originalHistoricalNativeCurrency', 'CURRENCY', 'CLAIM'),
    c = {
      claimId: 'ENTITY_A',
      sourceClass: 'CONSTRUCTED_SCENARIO',
      originalDenomination: 'GCU',
      originalDenominationLeafRef: 'HISTORY_A',
    };
  assert.equal(
    check(review(r, { claim: c }), 'historical-versus-scenario').status,
    'CONTRADICTED',
  );
  c.sourceClass = 'HISTORICAL_ORIGINAL';
  assert.equal(
    check(review(r, { claim: c }), 'historical-versus-scenario').status,
    'CONSISTENT_DECLARATION',
  );
});
test('actual due cannot come from missing epoch, wall time or first-year Day0 coupon', () => {
  const r = row('actualDue', 'SIM_TIME_BOUND_TO_CLOCK', 'CLAIM');
  for (const time of [
    { actualDue: '140', openingEpoch: null },
    { actualDue: null, epochSource: 'WALL_TIME' },
    { actualDue: null, day0WholeYearCouponPaid: true },
  ])
    assert.equal(
      check(review(r, { time }), 'time-binding').status,
      'CONTRADICTED',
    );
});
test('caller approval/permission JSON cannot authenticate actual subject or source', () => {
  const r = row('currentPermission', 'AUTHORIZATION'),
    a = {
      entityId: 'ENTITY_A',
      countryId: 'COUNTRY_A',
      ownerApproved: true,
      complete: true,
      sourceReady: true,
    };
  assert.equal(
    check(review(r, { authorization: a }), 'current-authorization').status,
    'UNKNOWN',
  );
});
test('review entry rejects foreign/duplicate IDs and never proposes closures', () => {
  const r = row('feeTotalNative'),
    records = Array.from({ length: 2544 }, (_, i) => ({
      ...r,
      stableId: `ID_${i}`,
    }));
  const input = {
    schema: 'e-economic-review-input-v1',
    observations: [
      {
        stableId: 'ID_0',
        unit: 'NATIVE_MONEY',
        currency: 'LC_A',
        nativeCurrency: 'LC_A',
      },
    ],
  };
  const result = reviewEconomicInput({ records }, input);
  assert.equal(result.originalClosuresProposed, 0);
  assert.equal(result.results[0].formallyAdopted, false);
  input.observations.push(input.observations[0]);
  assert.throws(() => reviewEconomicInput({ records }, input), /DUPLICATE/);
  input.observations = [{ stableId: 'FOREIGN' }];
  assert.throws(() => reviewEconomicInput({ records }, input), /FOREIGN/);
  input.observations = [];
  assert.throws(
    () => reviewEconomicInput({ records }, input),
    /INVALID_REVIEW_INPUT/,
  );
});

// B E-LOCAL-01: coherent nested frames must still bind to the native-money leaf.
const cashInCurrency = (currency) => {
  const c = structuredClone(cash());
  c.scope.currency = currency;
  for (const flow of c.settledFlows) flow.scope.currency = currency;
  return c;
};
const obligationsInCurrency = (currency) => {
  const o = obligation();
  o.currency = currency;
  o.coverage.currency = currency;
  for (const r of o.rows) {
    r.currency = currency;
    for (const allocation of [...r.settlements, ...r.releases])
      allocation.currency = currency;
  }
  return o;
};
for (const [field, key, name, make] of [
  ['availableNativeCash', 'cash', 'cash-reconciliation', cashInCurrency],
  [
    'mandatoryNonDebtNative',
    'obligations',
    'obligations-and-budget',
    obligationsInCurrency,
  ],
]) {
  test(`native-money ${field} rejects an internally consistent foreign frame`, () => {
    const result = review(row(field), { [key]: make('GCU') });
    assert.equal(check(result, name).status, 'CONTRADICTED');
    assert.equal(check(result, name).reason, 'NATIVE_CURRENCY_FRAME_MISMATCH');
    assert.equal(result.conclusion, 'CONTRADICTED');
  });
  test(`native-money ${field} stays unknown without a declared native frame`, () => {
    const result = review(row(field), {
      nativeCurrency: null,
      [key]: make('GCU'),
    });
    assert.equal(check(result, name).status, 'UNKNOWN');
    assert.equal(check(result, name).reason, 'NATIVE_CURRENCY_SOURCE_MISSING');
    assert.equal(
      result.conclusion,
      'INSUFFICIENT_FOR_ORIGINAL_FIELD_ACCEPTANCE',
    );
  });
}
test('native binding retains all-native controls and legal foreign-currency registers', () => {
  assert.equal(
    check(
      review(row('mandatoryNonDebtNative'), { obligations: obligation() }),
      'obligations-and-budget',
    ).status,
    'CONSISTENT_DECLARATION',
  );
  const result = review(row('canonicalObligations', 'REGISTER'), {
    obligations: obligationsInCurrency('GCU'),
  });
  assert.equal(
    check(result, 'obligations-and-budget').status,
    'CONSISTENT_DECLARATION',
  );
  assert.equal(result.formallyAdopted, false);
});

// B E-LOCAL-02: a nonnegative product cannot validate negative physical factors.
for (const [field, unit, first, second, pairs] of [
  [
    'energyDeliveredMinimum',
    'MWH/PERIOD',
    'acceptedPowerMw',
    'acceptedHours',
    [
      ['-10', '-2.5', '25'],
      ['-10', '0', '0'],
      ['0', '-2.5', '0'],
    ],
  ],
  [
    'transportMinimum',
    'TONNE_KM/PERIOD',
    'acceptedTonnes',
    'acceptedDistanceKm',
    [
      ['-2', '-3', '6'],
      ['-2', '0', '0'],
      ['0', '-3', '0'],
    ],
  ],
])
  test(`${unit} rejects each negative physical factor, including double-negative and zero products`, () => {
    for (const [a, b, amount] of pairs) {
      const result = review(row(field, unit), {
        delivery: {
          unit,
          amount,
          [first]: a,
          [second]: b,
          state: 'ACCEPTED_DELIVERED',
          period: 'P1',
          acceptanceSourceRef: 'TEST_ONLY_ACCEPTANCE_DECLARATION',
        },
      });
      assert.equal(check(result, 'actual-delivery').status, 'CONTRADICTED');
      assert.equal(
        check(result, 'actual-delivery').reason,
        'NEGATIVE_PHYSICAL_FACTOR',
      );
    }
  });
test('nonnegative zero physical factors remain legitimate declarations', () => {
  for (const [field, unit, factors] of [
    [
      'energyDeliveredMinimum',
      'MWH/PERIOD',
      { acceptedPowerMw: '0', acceptedHours: '2.5' },
    ],
    [
      'energyDeliveredMinimum',
      'MWH/PERIOD',
      { acceptedPowerMw: '10', acceptedHours: '0' },
    ],
    [
      'transportMinimum',
      'TONNE_KM/PERIOD',
      { acceptedTonnes: '0', acceptedDistanceKm: '3' },
    ],
    [
      'transportMinimum',
      'TONNE_KM/PERIOD',
      { acceptedTonnes: '2', acceptedDistanceKm: '0' },
    ],
  ]) {
    const result = review(row(field, unit), {
      delivery: {
        unit,
        amount: '0',
        ...factors,
        state: 'ACCEPTED_DELIVERED',
        period: 'P1',
        acceptanceSourceRef: 'TEST_ONLY_ACCEPTANCE_DECLARATION',
      },
    });
    assert.equal(
      check(result, 'actual-delivery').status,
      'CONSISTENT_DECLARATION',
    );
    assert.equal(result.validationPassed, false);
  }
});
