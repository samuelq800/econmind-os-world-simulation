/** Pure offline candidate: adopted rules derive declared work requirements.
 * TEST_ONLY checks a ledger; legacy REAL_SOURCE stays blocked, never actuals.
 * No fs/network/SQL, source issuer, grant constructor, runtime or World mutation.
 */
import { canonicalToken } from './recover.mjs';
import { createR3AdoptionReader } from '../unknown2544-c-r3-adoption/adoption-view.mjs';
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';
import {
  exactDecimalAdd as add,
  exactDecimalSubtract as sub,
  exactDecimalMultiply as mul,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

export const R3_RECIPE_SHA256 =
  '70cb4731e5b70bce15bffe2e9b2d9c1b092b0f8b6ff6baa0a54e463129054def';
export const COST_SCOPE_KEYS = Object.freeze([
  'LABOUR_LOW',
  'LABOUR_MEDIUM',
  'LABOUR_HIGH',
  'ENERGY',
  'STEEL_MAINTENANCE',
  'MACHINERY_MAINTENANCE',
  'BENEFITS',
  'RAW_WATER',
  'CHEMICALS',
  'QUALITY',
  'NETWORK',
  'STORAGE',
  'FREIGHT',
  'FEES',
]);
const SKILLS = ['LOW', 'MEDIUM', 'HIGH'];
const SCOPE_KEYS = [
  'countryId',
  'regionId',
  'facilityId',
  'payerId',
  'currency',
  'periodRef',
  'calendar',
];
const less = (a, b) => sub(a, b).startsWith('-');
const minimum = (...values) => values.reduce((a, b) => (less(a, b) ? a : b));
const sum = (values) => values.reduce((a, b) => add(a, b), '0');
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
function envelope(status, diagnostics, conditional = null, extra = {}) {
  // Output freezing must not freeze caller-owned source/conflict objects.
  return freeze(
    structuredClone({
      schema: 'C_WATER_INERT_CANDIDATE_V1',
      status,
      diagnostics,
      conditional,
      actualQuantities: null,
      actualSkillHours: null,
      actualDeliveredEnergy: null,
      actualCompleteNativeCost: null,
      existingRuntimeCarrier: 'NOT_CONSTRUCTED_OR_SUBMITTED',
      candidateEngineering: true,
      candidateConsistency: status === 'TEST_ONLY_CONSISTENT',
      originalStages: {
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      },
      productionAuthority: false,
      sourceAdmitted: false,
      runtimeConnected: false,
      originalFieldsClosed: 0,
      ...extra,
    }),
  );
}

export function produceWaterServiceCandidate(input) {
  const diagnostics = [];
  const issue = (code, path, detail) =>
    diagnostics.push({ code, path, detail });
  if (input?.mode === 'ADOPTED_RECIPE_INTERMEDIATES_ONLY') {
    // This is a calculation request against fixed adopted rules, not an
    // operating fact. It needs neither B02 nor a manufactured source issuer.
    try {
      const need = (ok, message) => {
        if (!ok) throw new Error(message);
      };
      const keys = (value, allowed) => {
        need(
          value !== null && typeof value === 'object' && !Array.isArray(value),
          'OBJECT_REQUIRED',
        );
        need(
          Object.keys(value).every((key) => allowed.includes(key)),
          'UNSUPPORTED_AUTHORITY_OR_WORKLOAD_OPTION',
        );
      };
      const ref = (value) => {
        need(
          typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/u.test(value),
          'EXPLICIT_DECLARED_REFERENCE_REQUIRED',
        );
        return value;
      };
      keys(input, ['mode', 'originalRequest', 'adoptionSources', 'recipeWork']);
      const work = input.recipeWork;
      keys(work, [
        'schema',
        'role',
        'requestRef',
        'countryId',
        'regionRef',
        'facilityRef',
        'interval',
        'rawInput',
      ]);
      need(
        work.schema === 'C_DECLARED_RECIPE_WORK_V1' &&
          work.role === 'DECLARED_RECIPE_WORKLOAD_NOT_ACTUAL_OPERATION',
        'DECLARED_WORKLOAD_ROLE_REQUIRED',
      );
      need(work.countryId === 'COUNTRY_01', 'COUNTRY01_WORKLOAD_ONLY');
      keys(work.interval, ['basis', 'fromSimDay', 'untilSimDay']);
      need(
        work.interval.basis === 'DECLARED_SIM_DAY_INTERVAL_NOT_WORLD_TIME',
        'DECLARED_INTERVAL_BASIS_REQUIRED',
      );
      const from = canonicalToken(work.interval.fromSimDay);
      const until = canonicalToken(work.interval.untilSimDay);
      need(less(from, until), 'POSITIVE_DECLARED_INTERVAL_REQUIRED');
      keys(work.rawInput, ['amount', 'unit', 'basis']);
      need(
        work.rawInput.unit === 'raw-m3' &&
          work.rawInput.basis === 'TOTAL_OVER_DECLARED_INTERVAL',
        'TOTAL_RAW_INTERVAL_QUANTITY_REQUIRED',
      );
      const raw = canonicalToken(work.rawInput.amount);
      const workloadTrace = {
        kind: 'DECLARED_WORKLOAD_NOT_OBSERVED',
        schema: work.schema,
        role: work.role,
        requestRef: ref(work.requestRef),
        countryId: work.countryId,
        regionRef: ref(work.regionRef),
        facilityRef: ref(work.facilityRef),
        interval: {
          basis: work.interval.basis,
          fromSimDay: from,
          untilSimDay: until,
        },
        rawInput: {
          amount: raw,
          rawNumericToken: work.rawInput.amount,
          unit: work.rawInput.unit,
          basis: work.rawInput.basis,
        },
        WorldGenesisHead: null,
        actualSourceAdmitted: false,
      };
      const adoptedRead = createR3AdoptionReader(input.adoptionSources).read(
        input.originalRequest,
      );
      const parameters = adoptedRead.adoptedParameters;
      need(
        adoptedRead.stableId === input.originalRequest.stableId &&
          parameters.countryId === work.countryId,
        'ADOPTED_PARAMETER_WORKLOAD_SCOPE_MISMATCH',
      );
      const coefficient = (key, unit) => {
        const c = parameters.coefficients.find((c) => c.key === key);
        need(c && c.unit === unit, 'ADOPTED_COEFFICIENT_UNIT_MISMATCH');
        return c;
      };
      const trace = (c) => ({
        kind: 'FIXED_ADOPTED_RECIPE_COEFFICIENT',
        key: c.key,
        rawNumericToken: c.rawNumericToken,
        canonicalDecimal: c.canonicalDecimal,
        unit: c.unit,
        sourceEvidence: {
          ...c.sourceEvidence,
          versionIdentity: c.sourceEvidence.sha256,
        },
        adoptionEvidence: {
          ...c.adoptionEvidence,
          versionIdentity: c.adoptionEvidence.sha256,
        },
      });
      const quantity = (amount, unit, used) => ({
        status: 'DERIVED_RECIPE_INTERMEDIATE_AVAILABLE',
        amount,
        unit,
        meaning: 'DECLARED_WORK_REQUIREMENT_OR_THEORETICAL_YIELD_NOT_ACTUAL',
        sourceTrace: [workloadTrace, ...used.map(trace)],
      });
      const workerDaysBySkill = Object.fromEntries(
        SKILLS.map((skill, i) => {
          const c = coefficient(`workerDaysBySkill/${i}`, 'worker-day/raw-m3');
          return [
            skill,
            quantity(mul(raw, c.canonicalDecimal), 'worker-day', [c]),
          ];
        }),
      );
      const requiredInputs = Object.fromEntries(
        [
          ['ENERGY', 'electricityMWh', 'MWh/raw-m3', 'MWh'],
          ['STEEL', 'STEEL_tonnes', 'tonne/raw-m3', 'tonne'],
          [
            'MACHINERY',
            'MACHINERY_units',
            'equipment-unit/raw-m3',
            'equipment-unit',
          ],
        ].map(([name, key, coefficientUnit, unit]) => {
          const c = coefficient(key, coefficientUnit);
          return [name, quantity(mul(raw, c.canonicalDecimal), unit, [c])];
        }),
      );
      const treatment = coefficient(
        'yieldTreatment',
        'treatment-net-m3/raw-m3',
      );
      const pipe = coefficient(
        'pipeDeliveryYield',
        'delivered-m3/treatment-net-m3',
      );
      const treated = mul(raw, treatment.canonicalDecimal);
      // raw is already the interval TOTAL: do not multiply by interval days.
      const parameterIntermediate = {
        scope: workloadTrace,
        workerDaysBySkill,
        requiredInputs,
        treatmentNetPotential: quantity(treated, 'treatment-net-m3', [
          treatment,
        ]),
        theoreticalNetPotential: quantity(
          mul(treated, pipe.canonicalDecimal),
          'theoretical-delivered-m3',
          [treatment, pipe],
        ),
        deliveryRatio: {
          amount: mul(treatment.canonicalDecimal, pipe.canonicalDecimal),
          unit: 'delivered-m3/raw-m3',
          sourceTrace: [trace(treatment), trace(pipe)],
        },
      };
      const unavailable = (reason, unit) => ({
        status: reason,
        value: null,
        unit,
      });
      return envelope('ADOPTED_RECIPE_INTERMEDIATES_AVAILABLE', [], null, {
        schema: 'C_WATER_ADOPTED_RECIPE_INTERMEDIATES_V1',
        inputEvidenceClass: 'FIXED_ADOPTED_PARAMETERS_WITH_DECLARED_WORKLOAD',
        parameterConnection: {
          engineeringWired: true,
          reader: 'createR3AdoptionReader.read:ADOPTED_PARAMETERS_ONLY',
          arithmeticUsesReturnedCoefficients: true,
        },
        originalId: adoptedRead.stableId,
        originalContract: adoptedRead.originalContract,
        parameterAdoptionRead: adoptedRead,
        parameterIntermediate,
        sourceTrace: [workloadTrace, ...parameters.coefficients.map(trace)],
        dependentResults: {
          labourHours: unavailable(
            'MISSING_APPLICABLE_ADOPTED_HOUR_CONVERSION',
            'hour',
          ),
          nativePayroll: unavailable(
            'MISSING_ACTUAL_WAGES_BENEFITS_PAYER_CURRENCY',
            'NATIVE_MONEY',
          ),
          actualOperatingCapacity: unavailable(
            'MISSING_ACTUAL_OPERATING_EVIDENCE',
            null,
          ),
          actualGrant: unavailable('MISSING_SCOPED_VALID_GRANT', null),
          actualQuality: unavailable(
            'MISSING_ACTUAL_QUALITY_STANDARD_AND_ACCEPTANCE',
            null,
          ),
          acceptedNetDelivery: unavailable(
            'MISSING_ACTUAL_ACCEPTED_DELIVERY',
            'delivered-m3',
          ),
          acceptedEnergyDelivery: unavailable(
            'MISSING_ACTUAL_ACCEPTED_ENERGY_DELIVERY',
            'MWh',
          ),
          actualTransport: unavailable(
            'MISSING_ACCEPTED_CARGO_ROUTE_AND_PERIOD',
            'tonne-km',
          ),
          nationalMinimum: unavailable('B02_DEFERRED', null),
          nationalSufficiency: unavailable(
            'B02_DEFERRED_AND_ACTUAL_SUPPLY_MISSING',
            null,
          ),
          completeNativeCost: unavailable(
            'MISSING_NATIVE_RATES_AND_COMPLETE_COST_COVERAGE',
            'NATIVE_MONEY',
          ),
        },
      });
    } catch (error) {
      issue('ADOPTED_PARAMETER_INPUT_INVALID', '/', error.message);
      return envelope('BLOCKED_ADOPTED_PARAMETER_INPUT', diagnostics, null, {
        schema: 'C_WATER_ADOPTED_RECIPE_INTERMEDIATES_V1',
        parameterIntermediate: null,
        parameterConnection: { engineeringWired: false },
      });
    }
  }
  // No combination of caller flags, locators or complete-looking actual DTOs
  // authenticates an actual source through this offline tool.
  if (input?.mode !== 'TEST_ONLY') {
    for (const [code, path] of [
      ['B02_ADOPTED_SCOPE_UNBOUND', '/b02'],
      ['ACTUAL_QUALITY_UNBOUND', '/quality'],
      ['ACTUAL_GRANT_UNBOUND', '/grants'],
      ['QUOTA_BASIS_UNSPECIFIED_OR_PROPOSAL', '/allocation'],
      ['ACTUAL_SKILL_HOURS_UNBOUND', '/staffing'],
      ['ACCEPTED_OPERATING_INPUTS_UNBOUND', '/inputs'],
      ['COMPLETE_RECURRING_NATIVE_COST_UNBOUND', '/costs'],
      ['NO_ACTUAL_SOURCE_ISSUER_IN_TOOL', '/mode'],
    ])
      issue(
        code,
        path,
        'Fixed-source recovery is not an independently admitted operating fact; actual result stays null',
      );
    return envelope('BLOCKED_REAL_SOURCE', diagnostics, null, {
      inputEvidenceClass: 'SOURCE_ONLY_NOT_ADMITTED',
      sourceReadback: {
        allocationStatus: input?.allocation?.rightsStatus ?? null,
        declaredQuotaBasis: input?.allocation?.quotaBasis ?? null,
        quality: input?.sourceRecovery?.quality?.actualQuality ?? null,
      },
      retainedSourceConflicts: input?.sourceRecovery?.conflicts ?? [],
    });
  }
  const number = (value, path) => {
    try {
      return canonicalToken(value);
    } catch {
      issue(
        'EXACT_DECIMAL_REQUIRED',
        path,
        'Explicit nonnegative exact string required; missing/Number is not zero',
      );
      return null;
    }
  };
  const scope = input.scope ?? {};
  const bound = (row, path) => {
    if (
      !row ||
      row.evidenceClass !== 'TEST_ONLY' ||
      typeof row.sourceRef !== 'string' ||
      !row.sourceRef.startsWith('TEST_')
    )
      issue(
        'TEST_ONLY_EVIDENCE_REQUIRED',
        path,
        'Synthetic scope/source must be explicit; no actual approval is implied',
      );
    for (const key of SCOPE_KEYS)
      if (row?.[key] !== scope[key])
        issue(
          'SCOPE_MISMATCH',
          `${path}/${key}`,
          'Country/region/facility/payer/currency/period must match',
        );
    // A shared label is not proof that explicit evidence bounds are the same.
    // Compare exact normalized coordinates; no epoch or duration is invented.
    for (const [key, expected] of [
      ['fromSimDay', from],
      ['untilSimDay', until],
    ]) {
      const actual = number(row?.[key], `${path}/${key}`);
      if (actual === null || actual !== expected)
        issue(
          'SCOPE_INTERVAL_MISMATCH',
          `${path}/${key}`,
          'Evidence must bind the same explicit canonical interval',
        );
    }
  };
  const quantity = (row, unit, path) => {
    bound(row, path);
    if (row?.unit !== unit)
      issue('UNIT_OR_BASIS_MISMATCH', `${path}/unit`, unit);
    return number(row?.amount, path);
  };
  const blocked = () =>
    envelope('BLOCKED_TEST_INPUT', diagnostics, null, {
      inputEvidenceClass: 'TEST_ONLY',
    });
  if (
    scope.evidenceClass !== 'TEST_ONLY' ||
    scope.scenarioKind !== 'TEST_ONLY_SYNTHETIC' ||
    scope.countryId !== 'COUNTRY_01'
  )
    issue(
      'TEST_ONLY_SCOPE_REQUIRED',
      '/scope',
      'Only explicitly synthetic COUNTRY_01 slice is supported',
    );
  for (const key of SCOPE_KEYS)
    if (typeof scope[key] !== 'string' || !scope[key])
      issue(
        'EXPLICIT_SCOPE_REQUIRED',
        `/scope/${key}`,
        'No inferred identity or currency',
      );
  const from = number(scope.fromSimDay, '/scope/fromSimDay'),
    until = number(scope.untilSimDay, '/scope/untilSimDay');
  if (scope.calendar !== 'GREGORIAN')
    issue(
      'CALENDAR_BINDING_REQUIRED',
      '/scope/calendar',
      'No TIME360 month substitution',
    );
  if (from === null || until === null || !less(from, until))
    issue(
      'POSITIVE_INTERVAL_REQUIRED',
      '/scope',
      'Explicit positive simulated interval required',
    );
  if (
    typeof input.recipeBytes !== 'string' ||
    sha256(input.recipeBytes) !== R3_RECIPE_SHA256
  )
    issue(
      'EXACT_R3_RECIPE_PIN_REQUIRED',
      '/recipeBytes',
      'Old/conflicting recipe bytes cannot be silently selected',
    );
  if (diagnostics.length) return blocked();
  const days = sub(until, from);
  const recipe = parseLossless(Buffer.from(input.recipeBytes, 'utf8')).recipes
    .potableTreatmentOperationPerRawM3;
  const treatment = number(recipe.yieldTreatment, '/recipe/yieldTreatment'),
    distribution = number(
      recipe.pipeDeliveryYield,
      '/recipe/pipeDeliveryYield',
    );
  if (
    treatment === '0' ||
    distribution === '0' ||
    less('1', treatment) ||
    less('1', distribution)
  )
    issue(
      'YIELD_RANGE',
      '/recipe',
      'Candidate yields must be positive ratios no greater than one',
    );
  const capacities = input.capacities ?? {};
  const runoff = quantity(
    capacities.ecologyNetRunoff,
    'raw-m3',
    '/capacities/ecologyNetRunoff',
  );
  const abstraction = quantity(
    capacities.abstraction,
    'raw-m3/sim-day',
    '/capacities/abstraction',
  );
  const treatmentRate = quantity(
    capacities.treatment,
    'raw-m3/sim-day',
    '/capacities/treatment',
  );
  const network = quantity(
    capacities.network,
    'delivered-m3/sim-day',
    '/capacities/network',
  );
  const processed = quantity(input.processedRaw, 'raw-m3', '/processedRaw');
  bound(input.quality, '/quality');
  if (
    input.quality?.qualityClass !== 'TEST_POTABLE_CLASS' ||
    input.quality?.status !== 'TEST_ONLY_VALID'
  )
    issue(
      'QUALITY_MISSING_OR_MISMATCH',
      '/quality',
      'Only explicit same-scope synthetic quality evidence supports the test',
    );
  bound(input.b02, '/b02');
  if (
    input.b02?.recipeSha256 !== R3_RECIPE_SHA256 ||
    input.b02?.qualityClass !== input.quality?.qualityClass ||
    !input.b02?.version?.startsWith('TEST_')
  )
    issue(
      'B02_SCOPE_OR_RECIPE_MISMATCH',
      '/b02',
      'Synthetic exact floor/version/recipe/quality binding required',
    );
  const beneficiaries = Array.isArray(input.b02?.beneficiaries)
    ? input.b02.beneficiaries
    : [];
  if (!beneficiaries.length)
    issue(
      'B02_BENEFICIARIES_REQUIRED',
      '/b02/beneficiaries',
      'A raw allocation does not define household/public demand',
    );
  const beneficiaryMap = new Map(),
    grants = new Map();
  for (const [i, b] of beneficiaries.entries()) {
    bound(b, `/b02/beneficiaries/${i}`);
    if (!b.ref?.startsWith('TEST_') || beneficiaryMap.has(b.ref))
      issue(
        'DUPLICATE_OR_INVALID_BENEFICIARY',
        `/b02/beneficiaries/${i}`,
        'No multiplied household/public share',
      );
    if (!['DOMESTIC', 'CRITICAL_PUBLIC'].includes(b.purpose))
      issue(
        'PURPOSE_MISMATCH',
        `/b02/beneficiaries/${i}`,
        'Use adopted service categories; no new priority rule',
      );
    beneficiaryMap.set(b.ref, {
      ...b,
      requested: quantity(
        b.requiredNet,
        'delivered-m3',
        `/b02/beneficiaries/${i}/requiredNet`,
      ),
    });
  }
  const grantRows = Array.isArray(input.grants) ? input.grants : [];
  const rightIds = new Set();
  for (const [i, g] of grantRows.entries()) {
    bound(g, `/grants/${i}`);
    if (
      !beneficiaryMap.has(g.beneficiaryRef) ||
      grants.has(g.beneficiaryRef) ||
      rightIds.has(g.rightRef) ||
      !g.rightRef?.startsWith('TEST_')
    )
      issue(
        'DUPLICATE_OR_UNSCOPED_RIGHT',
        `/grants/${i}`,
        'One explicit test right per beneficiary; no duplicated legal capacity',
      );
    rightIds.add(g.rightRef);
    if (g.status !== 'TEST_ONLY_GRANTED' || g.quotaBasis !== 'DELIVERED_NET')
      issue(
        'GRANT_OR_QUOTA_BASIS_UNBOUND',
        `/grants/${i}`,
        'PROPOSAL/UNSPECIFIED/raw quota is not a delivered-net test grant',
      );
    grants.set(
      g.beneficiaryRef,
      quantity(g.quota, 'delivered-m3/sim-day', `/grants/${i}/quota`),
    );
  }
  for (const ref of beneficiaryMap.keys())
    if (!grants.has(ref))
      issue('MISSING_RIGHT', `/grants/${ref}`, 'No inferred grant or quota');
  const hours = {},
    workers = {};
  for (const [i, skill] of SKILLS.entries()) {
    const staff = input.staffing?.[skill];
    bound(staff, `/staffing/${skill}`);
    const hpd = quantity(
      staff?.hoursPerWorkerDay,
      'hour/worker-day',
      `/staffing/${skill}/hoursPerWorkerDay`,
    );
    const available = quantity(
      staff?.availableHours,
      'hour',
      `/staffing/${skill}/availableHours`,
    );
    if (hpd === '0')
      issue(
        'POSITIVE_HOURS_BASIS_REQUIRED',
        `/staffing/${skill}`,
        'No implicit 8h shift or zero-hours worker-day',
      );
    if (processed !== null && hpd !== null && available !== null) {
      workers[skill] = mul(
        processed,
        number(recipe.workerDaysBySkill[i], `/recipe/workerDaysBySkill/${i}`),
      );
      hours[skill] = mul(workers[skill], hpd);
      if (less(available, hours[skill]))
        issue(
          'SKILL_HOURS_SHORTAGE',
          `/staffing/${skill}`,
          'Available hours do not cover processed input; no reallocation is performed',
        );
    }
  }
  const needed = {},
    deliveredInputs = {};
  const inputSpecs = [
    ['ENERGY', 'MWh', recipe.electricityMWh],
    ['STEEL', 'tonne', recipe.STEEL_tonnes],
    ['MACHINERY', 'equipment-unit', recipe.MACHINERY_units],
  ];
  for (const [key, unit, coefficient] of inputSpecs) {
    const supplied = input.inputs?.[key];
    const available = quantity(supplied, unit, `/inputs/${key}`);
    if (supplied?.deliveryStatus !== 'ACCEPTED_TEST_ONLY')
      issue(
        'INPUT_NOT_ACCEPTED',
        `/inputs/${key}`,
        'Capacity/planning/in-transit is not accepted input',
      );
    if (processed !== null && available !== null) {
      needed[key] = mul(processed, number(coefficient, `/recipe/${key}`));
      deliveredInputs[key] = available;
      if (less(available, needed[key]))
        issue(
          'OPERATING_INPUT_SHORTAGE',
          `/inputs/${key}`,
          'No future/free input or second use is supplied',
        );
    }
  }
  const events = Array.isArray(input.deliveryEvents)
    ? input.deliveryEvents
    : [];
  if (!events.length)
    issue(
      'ACCEPTED_DELIVERY_EVENTS_REQUIRED',
      '/deliveryEvents',
      'No capacity-as-delivery or empty-input zero',
    );
  const eventIds = new Map(),
    acceptedByBeneficiary = new Map(),
    deduplicated = [];
  for (const [i, e] of events.entries()) {
    bound(e, `/deliveryEvents/${i}`);
    const amount = quantity(e, 'delivered-m3', `/deliveryEvents/${i}`);
    if (
      e.status !== 'ACCEPTED_TEST_ONLY' ||
      !e.eventId?.startsWith('TEST_') ||
      !beneficiaryMap.has(e.beneficiaryRef)
    )
      issue(
        'DELIVERY_EVENT_SCOPE_OR_STATUS',
        '/deliveryEvents',
        'Only accepted explicit beneficiary test receipts count',
      );
    if (amount === null) continue;
    const key = JSON.stringify([
      e.beneficiaryRef,
      amount,
      e.unit,
      e.status,
      e.sourceRef,
      ...SCOPE_KEYS.map((k) => e[k]),
      number(e.fromSimDay, `/deliveryEvents/${i}/fromSimDay`),
      number(e.untilSimDay, `/deliveryEvents/${i}/untilSimDay`),
    ]);
    if (eventIds.has(e.eventId)) {
      if (eventIds.get(e.eventId) !== key)
        issue(
          'CONFLICTING_DUPLICATE_EVENT',
          '/deliveryEvents',
          'Same event ID has conflicting content',
        );
      else deduplicated.push(e.eventId);
      continue;
    }
    eventIds.set(e.eventId, key);
    acceptedByBeneficiary.set(
      e.beneficiaryRef,
      add(acceptedByBeneficiary.get(e.beneficiaryRef) ?? '0', amount),
    );
  }
  const retained = quantity(input.retainedNet, 'delivered-m3', '/retainedNet');
  const wasted = quantity(input.wastedNet, 'delivered-m3', '/wastedNet');
  if (diagnostics.length) return blocked();
  const rawCapacity = minimum(
    runoff,
    mul(abstraction, days),
    mul(treatmentRate, days),
  );
  const combinedYield = mul(treatment, distribution),
    netNetwork = mul(network, days);
  const requested = sum([...beneficiaryMap.values()].map((b) => b.requested));
  const granted = sum([...grants.values()].map((q) => mul(q, days)));
  const upperBound = minimum(
    mul(rawCapacity, combinedYield),
    netNetwork,
    requested,
    granted,
  );
  const produced = mul(processed, combinedYield),
    accepted = sum([...acceptedByBeneficiary.values()]);
  if (less(rawCapacity, processed) || less(netNetwork, produced))
    issue(
      'PROCESSING_EXCEEDS_RAW_OR_NET_CAPACITY',
      '/processedRaw',
      'Raw treatment basis and delivered network basis are not interchangeable',
    );
  for (const [ref, b] of beneficiaryMap) {
    const amount = acceptedByBeneficiary.get(ref) ?? '0'; // Sum of an explicit known test event set only, never a missing source balance.
    if (less(b.requested, amount) || less(mul(grants.get(ref), days), amount))
      issue(
        'DELIVERY_EXCEEDS_BENEFICIARY_OR_RIGHT',
        `/deliveryEvents/${ref}`,
        'One supplied receipt cannot exceed scoped demand/right',
      );
  }
  if (
    less(upperBound, accepted) ||
    add(add(accepted, retained), wasted) !== produced
  )
    issue(
      'NET_DELIVERY_CONSERVATION',
      '/deliveryEvents',
      'Produced net = accepted + explicitly retained + explicitly wasted; no inferred zero',
    );
  if (diagnostics.length) return blocked();
  const measures = {
    LOW_HOURS: hours.LOW,
    MEDIUM_HOURS: hours.MEDIUM,
    HIGH_HOURS: hours.HIGH,
    ENERGY_MWH: needed.ENERGY,
    STEEL_TONNES: needed.STEEL,
    MACHINERY_UNITS: needed.MACHINERY,
    DELIVERED_NET_M3: accepted,
    FIXED_SERVICE_ITEM: '1',
  };
  const units = {
    LOW_HOURS: `${scope.currency}/hour`,
    MEDIUM_HOURS: `${scope.currency}/hour`,
    HIGH_HOURS: `${scope.currency}/hour`,
    ENERGY_MWH: `${scope.currency}/MWh`,
    STEEL_TONNES: `${scope.currency}/tonne`,
    MACHINERY_UNITS: `${scope.currency}/equipment-unit`,
    DELIVERED_NET_M3: `${scope.currency}/delivered-m3`,
    FIXED_SERVICE_ITEM: `${scope.currency}/service-item`,
  };
  const costs = input.costs ?? {};
  bound(costs, '/costs');
  if (!['INCLUSIVE', 'DISJOINT'].includes(costs.mode))
    issue(
      'EXPLICIT_COST_MODE_REQUIRED',
      '/costs/mode',
      'Inclusive all-in OR disjoint components',
    );
  const lines = Array.isArray(costs.lines) ? costs.lines : [];
  if (
    costs.mode === 'INCLUSIVE' &&
    (lines.length !== 1 || lines[0]?.basis !== 'DELIVERED_NET_M3')
  )
    issue(
      'INCLUSIVE_DOUBLE_COUNT',
      '/costs/lines',
      'An all-in delivered service tariff cannot add labour/energy/material lines',
    );
  const costLines = new Map(),
    unknownCosts = [],
    declaredCoverageOwner = new Map();
  for (const [i, line] of lines.entries()) {
    bound(line, `/costs/lines/${i}`);
    if (!line.id?.startsWith('TEST_') || costLines.has(line.id))
      issue(
        'DUPLICATE_COST_COMPONENT',
        `/costs/lines/${i}`,
        'One economic component is counted once',
      );
    if (!Object.hasOwn(measures, line.basis) || line.unit !== units[line.basis])
      issue(
        'COST_BASIS_OR_UNIT_MISMATCH',
        `/costs/lines/${i}`,
        'Native rate must match a derived measure',
      );
    const covers = Array.isArray(line.covers) ? line.covers : [];
    if (
      !covers.length ||
      new Set(covers).size !== covers.length ||
      covers.some((key) => !COST_SCOPE_KEYS.includes(key))
    )
      issue(
        'EXPLICIT_UNIQUE_COST_COVERS_REQUIRED',
        `/costs/lines/${i}/covers`,
        'Each active priced component declares a nonempty unique supported economic scope',
      );
    for (const key of covers) {
      if (
        declaredCoverageOwner.has(key) &&
        declaredCoverageOwner.get(key) !== line.id
      )
        issue(
          'OVERLAPPING_ACTIVE_COST_COVERAGE',
          `/costs/lines/${i}/covers`,
          'A bundled category cannot also belong to another active paid component',
        );
      declaredCoverageOwner.set(key, line.id);
    }
    if (line.rateNative === null || line.rateNative === undefined) {
      unknownCosts.push(line.id);
      costLines.set(line.id, { ...line, covers, total: null });
      continue;
    }
    const rate = number(line.rateNative, `/costs/lines/${i}/rateNative`);
    costLines.set(line.id, {
      ...line,
      covers,
      total:
        rate !== null && Object.hasOwn(measures, line.basis)
          ? mul(measures[line.basis], rate)
          : null,
    });
  }
  const coverage = Array.isArray(costs.coverage) ? costs.coverage : [];
  const covered = new Set(),
    usedLines = new Set(),
    coverageByKey = new Map(),
    pricedLines = new Set();
  for (const [i, row] of coverage.entries()) {
    bound(row, `/costs/coverage/${i}`);
    if (!COST_SCOPE_KEYS.includes(row.key) || covered.has(row.key))
      issue(
        'COST_COVERAGE_DUPLICATE_OR_UNKNOWN',
        '/costs/coverage',
        'No overlap or silently widened legal-cost universe',
      );
    covered.add(row.key);
    coverageByKey.set(row.key, row);
    if (row.disposition === 'NOT_APPLICABLE') {
      if (
        row.componentId !== null ||
        typeof row.reason !== 'string' ||
        !row.reason
      )
        issue(
          'EXPLICIT_NOT_APPLICABLE_EVIDENCE_REQUIRED',
          '/costs/coverage',
          'Missing charge is not free; synthetic bounded reason required',
        );
    } else if (['PRICED', 'INCLUDED'].includes(row.disposition)) {
      const line = costLines.get(row.componentId);
      if (!line || !line.covers?.includes(row.key))
        issue(
          'COST_INCLUSION_REFERENCE_MISMATCH',
          '/costs/coverage',
          'Included coverage must resolve to the one explicitly priced component',
        );
      usedLines.add(row.componentId);
      if (row.disposition === 'PRICED') pricedLines.add(row.componentId);
      if (costs.mode === 'INCLUSIVE' && row.disposition !== 'INCLUDED')
        issue(
          'INCLUSIVE_COVERAGE_REQUIRED',
          '/costs/coverage',
          'All-in contract coverage must be explicit',
        );
    } else
      issue(
        'UNKNOWN_COST_DISPOSITION',
        '/costs/coverage',
        'No default-zero unknown category',
      );
  }
  // Validate the reverse association too, including contradictions with an
  // explicit NOT_APPLICABLE row. Multiple keys may share one paid package.
  for (const [id, line] of costLines) {
    for (const key of line.covers) {
      const row = coverageByKey.get(key);
      if (
        !row ||
        row.componentId !== id ||
        !['PRICED', 'INCLUDED'].includes(row.disposition)
      )
        issue(
          'COST_COVERS_REVERSE_MISMATCH',
          `/costs/lines/${id}/covers`,
          'Every declared covered category must resolve back to this one paid component',
        );
    }
    if (
      costs.mode === 'DISJOINT' &&
      !pricedLines.has(id) &&
      coverage.some(
        (row) => row.componentId === id && row.disposition === 'INCLUDED',
      )
    )
      issue(
        'INCLUDED_WITHOUT_PRICED_COMPONENT',
        `/costs/lines/${id}`,
        'An included category must point to a component priced once in the disjoint scope',
      );
  }
  for (const [id] of costLines)
    if (!usedLines.has(id))
      issue(
        'UNBOUND_ADDITIONAL_COST_LINE',
        '/costs/lines',
        'A line not linked into coverage could duplicate included expenditure',
      );
  if (diagnostics.length) return blocked();
  const missingCoverage = COST_SCOPE_KEYS.filter((key) => !covered.has(key));
  const costComplete =
    missingCoverage.length === 0 &&
    unknownCosts.length === 0 &&
    lines.length > 0;
  const subtotal = sum(
    [...costLines.values()].flatMap((line) =>
      line.total === null ? [] : [line.total],
    ),
  );
  const conditional = {
    evidenceClass: 'TEST_ONLY',
    meaning:
      'One fictional facility ledger, not an allocation/actual observation or national minimum',
    periodDays: days,
    rawCapacityM3: rawCapacity,
    combinedCandidateYield: combinedYield,
    netCapacityUpperBoundM3: upperBound,
    processedRawM3: processed,
    producedNetM3: produced,
    acceptedNetM3: accepted,
    retainedNetM3: retained,
    wastedNetM3: wasted,
    unmetNetM3: sub(requested, accepted),
    workerDaysBySkill: workers,
    hoursBySkill: hours,
    consumedOperatingInputs: needed,
    acceptedInputEvidence: deliveredInputs,
    deduplicatedEventIds: deduplicated,
    cost: {
      currency: scope.currency,
      mode: costs.mode,
      knownComponentsSubtotalNative: subtotal,
      completeNativeCost: costComplete ? subtotal : null,
      missingCoverage,
      unknownCostComponents: unknownCosts,
      boundedCoverageOnly: true,
      notLegalUniverseProof: true,
    },
  };
  return envelope(
    costComplete ? 'TEST_ONLY_CONSISTENT' : 'TEST_ONLY_PARTIAL_COST',
    [],
    conditional,
    {
      inputEvidenceClass: 'TEST_ONLY',
      candidatePhysicalConsistency: true,
      candidateCostConsistency: costComplete,
    },
  );
}
