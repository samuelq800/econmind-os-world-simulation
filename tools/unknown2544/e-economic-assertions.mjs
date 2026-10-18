/** Review-side declarations only. Never a producer, adoption verifier or runtime DTO. */
const requireThat = (ok, code) => {
  if (!ok) throw new Error(code);
};
const rational = (value) => {
  requireThat(
    typeof value === 'string' && value.length <= 128,
    'EXACT_DECIMAL_STRING_REQUIRED',
  );
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,36}))?$/u.exec(value);
  requireThat(match, 'EXACT_DECIMAL_STRING_REQUIRED');
  const fraction = match[3] ?? '';
  return [
    BigInt(`${match[1]}${match[2]}${fraction}`),
    10n ** BigInt(fraction.length),
  ];
};
const normalize = ([n, d]) => {
  let a = n < 0n ? -n : n,
    b = d;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return [n / a, d / a];
};
const add = ([a, b], [c, d]) => normalize([a * d + c * b, b * d]);
const subtract = ([a, b], [c, d]) => normalize([a * d - c * b, b * d]);
const multiply = ([a, b], [c, d]) => normalize([a * c, b * d]);
const equal = ([a, b], [c, d]) => a * d === c * b;
const nonnegative = ([a]) => a >= 0n;
const sum = (rows) =>
  rows.reduce((total, value) => add(total, rational(value)), [0n, 1n]);
const list = (value) => {
  requireThat(
    Array.isArray(value) && value.length <= 10000,
    'BOUNDED_ARRAY_REQUIRED',
  );
  return value;
};
const sameSet = (left, right) =>
  left.length === new Set(left).size &&
  right.length === new Set(right).size &&
  left.length === right.length &&
  left.every((v) => right.includes(v));
const bindingKeys = [
  'worldId',
  'countryId',
  'entityId',
  'accountId',
  'accountClass',
  'issuerId',
  'purpose',
  'currency',
  'valueDate',
  'asOf',
  'sourceVersion',
];
const sameBinding = (left, right) =>
  bindingKeys.every(
    (k) =>
      typeof left?.[k] === 'string' &&
      left[k].length > 0 &&
      left[k] === right?.[k],
  );

// Only native-money leaves require this frame; a register may legally be foreign.
function checkNativeFrame(currency, row, observation) {
  if (row.originalUnit !== 'NATIVE_MONEY') return null;
  if (!observation.nativeCurrency || !observation.currency)
    return 'NATIVE_CURRENCY_SOURCE_MISSING';
  requireThat(
    currency === observation.nativeCurrency &&
      observation.currency === observation.nativeCurrency,
    'NATIVE_CURRENCY_FRAME_MISMATCH',
  );
  return null;
}

function checkCash(value, row, observation) {
  requireThat(sameBinding(value.scope, value.scope), 'CASH_SCOPE_INCOMPLETE');
  const missingNative = checkNativeFrame(
    value.scope.currency,
    row,
    observation,
  );
  if (missingNative) return missingNative;
  requireThat(value.scope.countryId === row.countryId, 'CASH_COUNTRY_MISMATCH');
  requireThat(
    value.scope.entityId === row.ownerId || row.scope === 'COUNTRY',
    'CASH_OWNER_MISMATCH',
  );
  requireThat(
    value.scope.accountClass === 'CASH' &&
      ['CASH_ON_HAND', 'NATIVE_CASH_SETTLEMENT'].includes(value.scope.purpose),
    'NON_CASH_NOT_AVAILABLE_FUNDS',
  );
  if (
    value.flowCoverage !== 'COMPLETE_DECLARED_SCOPE' ||
    value.restrictions?.coverage !== 'COMPLETE_DECLARED_SCOPE'
  )
    return 'CASH_COVERAGE_NOT_PROVEN';
  const flows = list(value.settledFlows);
  requireThat(
    new Set(flows.map((f) => f.id)).size === flows.length,
    'DUPLICATE_SETTLED_FLOW',
  );
  let closing = rational(value.opening);
  for (const flow of flows) {
    requireThat(
      typeof flow.id === 'string' &&
        flow.id.length > 0 &&
        sameBinding(flow.scope, value.scope),
      'FLOW_ID_OR_SCOPE_MISMATCH',
    );
    requireThat(
      flow.state === 'SETTLED' && ['IN', 'OUT'].includes(flow.direction),
      'UNSETTLED_NOT_CASH',
    );
    const amount = rational(flow.amount);
    requireThat(nonnegative(amount), 'NEGATIVE_FLOW_AMOUNT');
    closing =
      flow.direction === 'IN'
        ? add(closing, amount)
        : subtract(closing, amount);
  }
  requireThat(
    equal(closing, rational(value.closing)),
    'CASH_RECONCILIATION_MISMATCH',
  );
  const atoms = list(value.restrictions.atoms);
  requireThat(
    atoms.every(
      (a) =>
        typeof a.id === 'string' &&
        a.id.length > 0 &&
        nonnegative(rational(a.amount)),
    ),
    'RESTRICTION_ATOM_INVALID',
  );
  requireThat(
    new Set(atoms.map((a) => a.id)).size === atoms.length,
    'DUPLICATE_RESTRICTION',
  );
  // Explicit overlap partitions prevent simply summing overlapping restrictions.
  const partitions = list(value.restrictions.partitions);
  requireThat(
    new Set(partitions.map((p) => p.id)).size === partitions.length,
    'DUPLICATE_RESTRICTION_PARTITION',
  );
  for (const p of partitions) {
    requireThat(
      typeof p.id === 'string' &&
        p.id.length > 0 &&
        nonnegative(rational(p.amount)) &&
        list(p.atomIds).length > 0,
      'INVALID_UNION_PARTITION',
    );
    requireThat(
      new Set(p.atomIds).size === p.atomIds.length &&
        p.atomIds.every((id) => atoms.some((a) => a.id === id)),
      'FOREIGN_OR_DUPLICATE_RESTRICTION_ATOM',
    );
  }
  for (const atom of atoms)
    requireThat(
      equal(
        sum(
          partitions
            .filter((p) => p.atomIds.includes(atom.id))
            .map((p) => p.amount),
        ),
        rational(atom.amount),
      ),
      'RESTRICTION_PARTITION_COVERAGE_MISMATCH',
    );
  requireThat(
    equal(
      sum(partitions.map((p) => p.amount)),
      rational(value.restrictions.unionAmount),
    ),
    'UNION_AMOUNT_MISMATCH',
  );
  requireThat(
    equal(
      subtract(closing, rational(value.restrictions.unionAmount)),
      rational(value.declaredAvailable),
    ),
    'AVAILABLE_CASH_MISMATCH_OR_CLAMP',
  );
  if (!nonnegative(subtract(closing, rational(value.restrictions.unionAmount))))
    return 'RESTRICTIONS_EXCEED_BALANCE_SHORTFALL_NOT_USABLE_CASH';
  return null;
}

function checkObligations(value, row, observation) {
  const missingNative = checkNativeFrame(value.currency, row, observation);
  if (missingNative) return missingNative;
  requireThat(
    value.entityId === row.ownerId || row.scope === 'COUNTRY',
    'OBLIGATION_ENTITY_MISMATCH',
  );
  if (
    value.coverage?.kind !== 'ENTITY_PERIOD_REGISTER' ||
    value.coverage?.status !== 'COMPLETE_DECLARED_SCOPE'
  )
    return 'REGISTER_COMPLETENESS_NOT_PROVEN';
  requireThat(
    value.coverage.entityId === value.entityId &&
      value.coverage.period === value.period &&
      value.coverage.currency === value.currency,
    'REGISTER_SCOPE_MISMATCH',
  );
  const rows = list(value.rows);
  requireThat(
    sameSet(list(value.coverage.obligationIds), [
      ...new Set(rows.map((r) => r.id)),
    ]),
    'REGISTER_ID_COVERAGE_MISMATCH',
  );
  if (!value.coverage.obligationOriginalAmounts)
    return 'ORIGINAL_OBLIGATION_GROUP_AMOUNTS_MISSING';
  for (const id of value.coverage.obligationIds)
    requireThat(
      equal(
        sum(rows.filter((r) => r.id === id).map((r) => r.originalAmount)),
        rational(value.coverage.obligationOriginalAmounts[id]),
      ),
      'OBLIGATION_COMPONENT_ORIGINAL_TOTAL_MISMATCH',
    );
  const seen = new Set(),
    allocations = new Set(),
    mandatory = [],
    discretionary = [];
  for (const r of rows) {
    requireThat(
      typeof r.id === 'string' &&
        r.id.length > 0 &&
        typeof r.componentId === 'string' &&
        r.componentId.length > 0,
      'OBLIGATION_ID_REQUIRED',
    );
    const componentKey = JSON.stringify([r.id, r.componentId]);
    requireThat(!seen.has(componentKey), 'DUPLICATE_ECONOMIC_COMPONENT');
    seen.add(componentKey);
    requireThat(
      r.entityId === value.entityId &&
        r.currency === value.currency &&
        r.period === value.period,
      'OBLIGATION_SCOPE_OR_CURRENCY_MISMATCH',
    );
    if (!r.legalBasisRef || !r.ruleVersion || r.classification === 'UNKNOWN')
      return 'LEGAL_OR_CLASSIFICATION_EVIDENCE_MISSING';
    requireThat(
      [
        'MANDATORY_NON_DEBT',
        'COMMITTED_DISCRETIONARY',
        'DEBT_SERVICE',
        'EXCLUDED',
      ].includes(r.classification),
      'UNKNOWN_CLASSIFICATION',
    );
    requireThat(
      r.classificationBasis !== 'COMMITTED_FLAG_ONLY',
      'COMMITMENT_NOT_DISCRETIONARY_CLASSIFICATION',
    );
    const settlements = list(r.settlements),
      releases = list(r.releases);
    requireThat(
      sameSet(
        [...settlements, ...releases].map((x) => x.id),
        [...settlements, ...releases].map((x) => x.id),
      ),
      'DUPLICATE_SETTLEMENT_OR_RELEASE',
    );
    for (const allocation of [...settlements, ...releases]) {
      requireThat(
        typeof allocation.id === 'string' &&
          allocation.id.length > 0 &&
          !allocations.has(allocation.id),
        'MISSING_OR_REUSED_ALLOCATION_ID',
      );
      allocations.add(allocation.id);
      requireThat(
        allocation.obligationId === r.id &&
          allocation.componentId === r.componentId &&
          allocation.currency === r.currency &&
          allocation.state === 'SETTLED_OR_LEGALLY_RELEASED' &&
          nonnegative(rational(allocation.amount)),
        'ALLOCATION_LINEAGE_MISMATCH',
      );
    }
    const unpaid = subtract(
      subtract(
        rational(r.originalAmount),
        sum(settlements.map((x) => x.amount)),
      ),
      sum(releases.map((x) => x.amount)),
    );
    requireThat(
      nonnegative(unpaid) && equal(unpaid, rational(r.unpaidAmount)),
      'UNPAID_AMOUNT_MISMATCH',
    );
    if (r.classification === 'MANDATORY_NON_DEBT')
      mandatory.push(r.unpaidAmount);
    if (r.classification === 'COMMITTED_DISCRETIONARY') {
      if (!r.commitmentRef) return 'LEGAL_COMMITMENT_EVIDENCE_MISSING';
      discretionary.push(r.unpaidAmount);
    }
  }
  requireThat(
    equal(sum(mandatory), rational(value.mandatoryNonDebt)) &&
      equal(sum(discretionary), rational(value.committedDiscretionary)),
    'OBLIGATION_TOTAL_MISMATCH',
  );
  return null;
}

function checkDelivery(value, row) {
  requireThat(value.unit === row.originalUnit, 'DELIVERY_UNIT_MISMATCH');
  requireThat(nonnegative(rational(value.amount)), 'NEGATIVE_DELIVERY');
  if (value.state !== 'ACCEPTED_DELIVERED')
    return 'CAPACITY_PLAN_OR_TRANSIT_NOT_DELIVERY';
  if (value.unit === 'HOUR/PERIOD') {
    if (value.basis !== 'ACCEPTED_HOURS')
      return 'HEADCOUNT_OR_WORKERDAY_NOT_HOURS';
    requireThat(
      equal(rational(value.amount), rational(value.acceptedHours)),
      'LABOUR_HOURS_MISMATCH',
    );
  } else if (value.unit === 'MWH/PERIOD') {
    const power = rational(value.acceptedPowerMw),
      hours = rational(value.acceptedHours);
    requireThat(
      nonnegative(power) && nonnegative(hours),
      'NEGATIVE_PHYSICAL_FACTOR',
    );
    requireThat(
      equal(rational(value.amount), multiply(power, hours)),
      'MW_TIMES_HOURS_NOT_MWH',
    );
  } else if (value.unit === 'TONNE_KM/PERIOD') {
    const tonnes = rational(value.acceptedTonnes),
      distance = rational(value.acceptedDistanceKm);
    requireThat(
      nonnegative(tonnes) && nonnegative(distance),
      'NEGATIVE_PHYSICAL_FACTOR',
    );
    requireThat(
      equal(rational(value.amount), multiply(tonnes, distance)),
      'ACCEPTED_TONNE_KM_MISMATCH',
    );
  } else if (value.unit === 'M3/PERIOD') {
    if (
      value.quality !== 'POTABLE_ACCEPTED' ||
      !value.rightsRef ||
      !value.lossAccountingRef
    )
      return 'RAW_WATER_OR_RIGHTS_NOT_POTABLE_DELIVERY';
  } else return 'DELIVERY_RULE_NOT_IMPLEMENTED';
  if (!value.period || !value.acceptanceSourceRef)
    return 'DELIVERY_SOURCE_OR_PERIOD_MISSING';
  return null;
}

function checkMinimum(value, row) {
  requireThat(
    value.unit === row.originalUnit && nonnegative(rational(value.amount)),
    'MINIMUM_UNIT_OR_AMOUNT_INVALID',
  );
  if (
    value.kind !== 'SOURCE_BOUND_MINIMUM_REQUIREMENT' ||
    !value.period ||
    !value.sourceRef
  )
    return 'MINIMUM_REQUIREMENT_SOURCE_MISSING_CAPACITY_NOT_SUFFICIENT';
  return null;
}

function checkCost(value, observation) {
  if (!observation.nativeCurrency) return 'NATIVE_CURRENCY_SOURCE_MISSING';
  requireThat(
    value.currency === observation.nativeCurrency,
    'COST_NATIVE_CURRENCY_MISMATCH',
  );
  const addends = list(value.addends);
  if (value.convention === 'ALL_INCLUSIVE_TARIFF') {
    requireThat(
      addends.length === 0 &&
        equal(rational(value.tariffTotal), rational(value.total)),
      'INCLUSIVE_TARIFF_DOUBLE_COUNT_OR_MISMATCH',
    );
  } else if (value.convention === 'DISJOINT_COMPONENTS') {
    requireThat(
      value.tariffTotal === null && addends.length > 0,
      'COST_CONVENTION_MIXED',
    );
    const atoms = [];
    for (const a of addends) {
      requireThat(
        a.currency === value.currency && list(a.costAtomIds).length > 0,
        'COST_COMPONENT_SCOPE_MISMATCH',
      );
      atoms.push(...a.costAtomIds);
    }
    requireThat(
      new Set(atoms).size === atoms.length,
      'OVERLAPPING_COST_COMPONENTS',
    );
    requireThat(
      equal(sum(addends.map((a) => a.amount)), rational(value.total)),
      'COST_TOTAL_MISMATCH',
    );
  } else return 'COST_CONVENTION_NOT_SELECTED';
  if (!value.period || !value.sourceRef) return 'COST_SOURCE_OR_PERIOD_MISSING';
  return null;
}

/** Results check consistency of supplied observations, never real provenance. */
export function assessEconomicObservation(row, input) {
  const observation = structuredClone(input);
  const checks = [];
  const run = (name, present, fn) => {
    if (!present) {
      checks.push({ name, status: 'UNKNOWN', reason: 'NOT_PROVIDED' });
      return;
    }
    try {
      const missing = fn();
      checks.push({
        name,
        status: missing ? 'UNKNOWN' : 'CONSISTENT_DECLARATION',
        reason: missing ?? 'ARITHMETIC_OR_DECLARED_RELATIONS_ONLY',
      });
    } catch (error) {
      checks.push({ name, status: 'CONTRADICTED', reason: error.message });
    }
  };
  run('original-unit', true, () => {
    requireThat(
      observation.unit === row.originalUnit,
      'ORIGINAL_UNIT_MISMATCH',
    );
    return null;
  });
  if (row.originalUnit === 'NATIVE_MONEY')
    run('native-currency', true, () => {
      if (!observation.nativeCurrency || !observation.currency)
        return 'NATIVE_CURRENCY_SOURCE_MISSING';
      requireThat(
        observation.currency === observation.nativeCurrency,
        'LC_GCU_OR_OTHER_CURRENCY_MISMATCH',
      );
      return null;
    });
  if (
    ['account', 'availableNativeCash', 'minimumCashBufferNative'].includes(
      row.missingField,
    )
  )
    run('cash-reconciliation', !!observation.cash, () =>
      checkCash(observation.cash, row, observation),
    );
  if (
    [
      'canonicalObligations',
      'mandatoryClassification',
      'mandatoryNonDebtNative',
      'committedDiscretionaryNative',
    ].includes(row.missingField)
  )
    run('obligations-and-budget', !!observation.obligations, () =>
      checkObligations(observation.obligations, row, observation),
    );
  if (
    [
      'labourMinimumHours',
      'waterPotableDeliveredMinimum',
      'energyDeliveredMinimum',
      'transportMinimum',
    ].includes(row.missingField)
  ) {
    run('source-minimum-requirement', !!observation.minimumRequirement, () =>
      checkMinimum(observation.minimumRequirement, row),
    );
    // A source minimum and an actual delivered observation are separate facts.
    run('actual-delivery', !!observation.delivery, () =>
      checkDelivery(observation.delivery, row),
    );
  }
  if (
    [
      'labourPayrollNative',
      'waterCompleteCostNative',
      'energyCompleteCostNative',
      'transportCompleteCostNative',
    ].includes(row.missingField)
  )
    run('native-cost', !!observation.cost, () =>
      checkCost(observation.cost, observation),
    );
  if (
    [
      'feePolicy',
      'feeTotalNative',
      'protectedServiceFloor',
      'minimumCashBufferNative',
    ].includes(row.missingField)
  )
    run(
      'policy-applicability',
      true,
      () =>
        'APPLICABLE_ADOPTED_RULE_AND_COMPLETE_SCOPE_NOT_AUTHENTICATED_BY_REVIEW_JSON',
    );
  if (row.scope === 'CLAIM') {
    run('historical-versus-scenario', !!observation.claim, () => {
      const c = observation.claim;
      requireThat(c.claimId === row.ownerId, 'CLAIM_ID_MISMATCH');
      if (row.missingField === 'originalHistoricalNativeCurrency') {
        requireThat(
          c.sourceClass === 'HISTORICAL_ORIGINAL',
          'CONSTRUCTED_SCENARIO_NOT_HISTORICAL_DENOMINATION',
        );
        if (!c.originalDenominationLeafRef || !c.originalDenomination)
          return 'ORIGINAL_DENOMINATION_SOURCE_MISSING';
      } else if (
        c.sourceClass === 'CONSTRUCTED_SCENARIO' &&
        c.claimsActualFieldCompletion === true
      )
        requireThat(false, 'DRAFT_NOT_ACTUAL_FIELD_COMPLETION');
      return null;
    });
    if (row.missingField === 'actualDue')
      run('time-binding', !!observation.time, () => {
        const t = observation.time;
        requireThat(
          t.day0WholeYearCouponPaid !== true,
          'DAY0_ANNUAL_COUPON_NOT_ALLOWED',
        );
        requireThat(
          !['WALL_TIME', 'FILE_MTIME', 'RELATIVE_MATURITY'].includes(
            t.epochSource,
          ),
          'EPOCH_NOT_PROVEN',
        );
        if (t.actualDue !== null && t.actualDue !== undefined)
          requireThat(
            !!t.openingEpoch && !!t.clockBindingRef,
            'ACTUAL_DUE_WITHOUT_EPOCH_OR_CLOCK_BINDING',
          );
        return 'ACTUAL_TIME_AND_ADOPTION_NOT_AUTHENTICATED_BY_REVIEW_JSON';
      });
    if (row.missingField === 'atomicRoute')
      run(
        'atomic-route',
        true,
        () =>
          'SUPPORTED_ROUTE_AND_COMMITTED_AUTHORITY_NOT_AUTHENTICATED_BY_REVIEW_JSON',
      );
    if (row.missingField === 'actualCashAccounts')
      run(
        'claim-account-pair',
        true,
        () =>
          'TWO_SOURCE_OWNED_ROLE_COMPATIBLE_ACCOUNTS_REQUIRE_SEPARATE_EVIDENCE_REVIEW',
      );
  }
  if (
    ['currentPermission', 'discretionaryAuthorization'].includes(
      row.missingField,
    )
  )
    run('current-authorization', !!observation.authorization, () => {
      requireThat(
        observation.authorization.entityId === row.ownerId ||
          row.scope === 'COUNTRY',
        'AUTHORIZATION_ENTITY_MISMATCH',
      );
      requireThat(
        observation.authorization.countryId === row.countryId,
        'AUTHORIZATION_COUNTRY_MISMATCH',
      );
      return 'REAL_SUBJECT_SEAT_REVISION_AND_PERMISSION_NOT_AUTHENTICATED_BY_REVIEW_JSON';
    });
  return {
    stableId: row.stableId,
    field: row.missingField,
    originalUnit: row.originalUnit,
    checks,
    conclusion: checks.some((c) => c.status === 'CONTRADICTED')
      ? 'CONTRADICTED'
      : 'INSUFFICIENT_FOR_ORIGINAL_FIELD_ACCEPTANCE',
    provenance: 'NOT_AUTHENTICATED_BY_THIS_TOOL',
    sourceComplete: false,
    engineeringWired: false,
    validationPassed: false,
    formallyAdopted: false,
    closureProposed: false,
  };
}
