/** Offline evidence adapter only. No writer, source admission or economic rule.
 * Arithmetic reuses the repository's exact BigInt decimal oracle; no Number
 * observations and no Core/runtime reimplementation or imports are introduced.
 */
import { createHash } from 'node:crypto';
import {
  exactDecimalAdd as add,
  exactDecimalMultiply as multiply,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const FIELD_BATCH = Object.freeze({
  labourMinimumHours: 'B10',
  labourPayrollNative: 'B10',
  waterPotableDeliveredMinimum: 'B11',
  waterCompleteCostNative: 'B11',
  energyDeliveredMinimum: 'B12',
  energyCompleteCostNative: 'B12',
  transportMinimum: 'B13',
  transportCompleteCostNative: 'B13',
});
const EXPECTED_UNITS = Object.freeze({
  labourMinimumHours: 'HOUR/PERIOD',
  labourPayrollNative: 'NATIVE_MONEY',
  waterPotableDeliveredMinimum: 'M3/PERIOD',
  waterCompleteCostNative: 'NATIVE_MONEY',
  energyDeliveredMinimum: 'MWH/PERIOD',
  energyCompleteCostNative: 'NATIVE_MONEY',
  transportMinimum: 'TONNE_KM/PERIOD',
  transportCompleteCostNative: 'NATIVE_MONEY',
});
export const DEPENDENCIES = Object.freeze({
  B10: [
    'D:B02 adopted protectedServiceFloor',
    'approved skill/service recipe and actual available hours',
    'native wages, benefits, payer, period and cost inclusion evidence',
  ],
  B11: [
    'D:B02 adopted protectedServiceFloor',
    'water rights, potable quality, treatment/loss and accepted net delivery evidence',
    'native energy, labour, chemicals, maintenance, payer and non-overlapping cost coverage',
  ],
  B12: [
    'D:B02 adopted protectedServiceFloor',
    'necessary load recipe, simulated hours, dispatch/loss and accepted MWh delivery',
    'native energy tariff or complete fuel/labour/storage/maintenance cost coverage',
  ],
  B13: [
    'D:B02 adopted protectedServiceFloor',
    'accepted cargo, title, verified route km, mode and period',
    'native contracted freight/insurance/fuel/fees and non-overlapping inclusion scope',
  ],
});
function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
export function parseLossless(bytes) {
  return JSON.parse(bytes.toString('utf8'), (_key, value, context) => {
    if (typeof value !== 'number') return value;
    invariant(
      typeof context?.source === 'string',
      'LOSSLESS_TOKEN_CONTEXT_REQUIRED',
    );
    return context.source;
  });
}
export function verifyBytes(bytes, pin) {
  invariant(sha256(bytes) === pin.sha256, `SOURCE_DRIFT:${pin.path}`);
  return parseLossless(bytes);
}
export function decimal(value) {
  invariant(
    typeof value === 'string' && /^(0|[1-9]\d*)(\.\d+)?$/u.test(value),
    'EXPLICIT_NONNEGATIVE_DECIMAL_REQUIRED',
  );
  return add(value, '0');
}
function unique(rows, key, label) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    invariant(
      typeof id === 'string' && !map.has(id),
      `DUPLICATE_OR_MISSING_${label}:${id}`,
    );
    map.set(id, row);
  }
  return map;
}
function countryOfLegacy(value, identity) {
  invariant(identity.has(value), `UNMAPPED_LEGACY_COUNTRY:${value}`);
  return identity.get(value);
}
function relation(source, pointer) {
  return { source, pointer };
}

/** Replays ONLY the existing build_timeline.py formula (wages+materials)*LC/GCU.
 * This is book valuation of constructed reference work, not settlement, a new FX
 * policy, a complete physical-service cost or an actual wage source assertion.
 */
export function decomposeAction(action, quote, actionIndex, quoteIndex) {
  invariant(
    action.countryId === quote.countryId &&
      action.currency === quote.currencyCode,
    'ACTION_QUOTE_IDENTITY_OR_CURRENCY_MISMATCH',
  );
  const rate = decimal(quote.LCperGCU);
  invariant(
    rate !== '0' && multiply(rate, decimal(quote.GCUperLC)) === '1',
    'NON_RECIPROCAL_OR_ZERO_QUOTE',
  );
  const wagesGcu = decimal(action.recordedWagesGcu);
  const materialsGcu = decimal(action.knownMaterialCostGcu);
  const wagesNative = multiply(wagesGcu, rate);
  const materialsNative = multiply(materialsGcu, rate);
  const subtotal = add(wagesNative, materialsNative);
  invariant(
    subtotal === decimal(action.knownCostLC),
    `KNOWN_COST_RECONCILIATION_FAILED:${action.actionId}`,
  );
  invariant(
    Array.isArray(action.labourWorkDaysBySkill) &&
      action.labourWorkDaysBySkill.length === 3,
    'THREE_SOURCE_SKILL_BUCKETS_REQUIRED',
  );
  invariant(
    /^\d+$/u.test(String(action.earliestRecordedStartSimDay)) &&
      /^\d+$/u.test(String(action.lastRecordedWorkSimDay)),
    'EXPLICIT_ACTION_DAYS_REQUIRED',
  );
  const first = BigInt(action.earliestRecordedStartSimDay),
    last = BigInt(action.lastRecordedWorkSimDay);
  invariant(
    first >= 1n && last >= first && last <= 140n,
    'ACTION_PERIOD_OUT_OF_FIXED_REFERENCE_HORIZON',
  );
  invariant(
    action.costCompleteness.startsWith('KNOWN_COMPONENTS_ONLY'),
    'UNEXPECTED_ACTION_COMPLETENESS_SEMANTICS',
  );
  return {
    actionId: action.actionId,
    recipe: action.recipe,
    countryId: action.countryId,
    sourceKind: 'CONSTRUCTED_REFERENCE_REPLAY_NOT_ACTUAL_OPERATION',
    source: relation('actions', `/actions/${actionIndex}`),
    quote: relation('rates', `/countries/${quoteIndex}`),
    quoteVersion: quote.rateVersion,
    quoteValueDate: quote.valueDate,
    quoteAdoptedInSource: quote.adopted,
    timeBasis: {
      kind: 'RECORDED_REFERENCE_SIM_DAY_RANGE',
      firstSimDay: String(first),
      lastSimDay: String(last),
      openingEpoch: null,
    },
    labourWorkDaysBySourceSkillBucket:
      action.labourWorkDaysBySkill.map(decimal),
    labourUnit: 'WORKER_DAY_REFERENCE_NOT_HOUR',
    wages: { gcu: wagesGcu, native: wagesNative },
    materials: { gcu: materialsGcu, native: materialsNative },
    knownComponentsSubtotalNative: subtotal,
    currency: action.currency,
    formula: '(recordedWagesGcu + knownMaterialCostGcu) * source.LCperGCU',
    exactSourceSubtotalMatch: true,
    costCompleteness: action.costCompleteness,
    candidateStatus: action.candidateStatus,
    actualPayer: null,
    actualCreditor: null,
    actualPaid: null,
    completeServiceCost: null,
    labourHours: null,
    actualServiceDelivered: null,
    directJobJournalReread: false,
  };
}

export function buildCandidate(input) {
  const physical = input.ledger.records.filter((r) =>
    Object.hasOwn(FIELD_BATCH, r.missingField),
  );
  invariant(physical.length === 560, 'EXACT_560_ORIGINAL_FIELDS_REQUIRED');
  const byId = unique(physical, (r) => r.stableId, 'ORIGINAL_ID');
  const registerById = unique(
    input.register.records,
    (r) => r.stableId,
    'REGISTER_ID',
  );
  for (const id of byId.keys()) {
    const record = registerById.get(id);
    invariant(
      record?.status === 'OPEN' && record.rootAcceptance === null,
      `PINNED_REGISTER_REAUDIT_REQUIRED:${id}`,
    );
  }
  const selectedBatches = input.batches.filter((b) =>
    Object.values(FIELD_BATCH).includes(b.batchId),
  );
  invariant(selectedBatches.length === 4, 'EXACT_FOUR_FORMAL_BATCHES_REQUIRED');
  const batchById = new Map();
  for (const b of selectedBatches) {
    invariant(
      b.stableIds.length === 140,
      `EXACT_140_BATCH_IDS_REQUIRED:${b.batchId}`,
    );
    for (const id of b.stableIds) {
      invariant(
        !batchById.has(id) && byId.has(id),
        `DUPLICATE_OR_FOREIGN_BATCH_ID:${id}`,
      );
      batchById.set(id, b.batchId);
    }
  }
  invariant(batchById.size === 560, 'FORMAL_BATCH_SET_MISMATCH');
  const quotes = unique(
    input.rates.countries,
    (r) => r.countryId,
    'QUOTE_COUNTRY',
  );
  invariant(quotes.size === 70, 'EXACT_70_QUOTES_REQUIRED');
  unique(input.actions.actions, (r) => r.actionId, 'ACTION_ID');
  const identity = new Map();
  for (const row of input.countries) {
    invariant(
      typeof row.number === 'string' && /^\d{2}$/u.test(row.number),
      'EXPLICIT_SOURCE_COUNTRY_NUMBER_REQUIRED',
    );
    invariant(!identity.has(row.id), 'DUPLICATE_LEGACY_COUNTRY');
    identity.set(row.id, `COUNTRY_${row.number}`);
  }
  invariant(
    identity.size === 70 && new Set(identity.values()).size === 70,
    'EXACT_70_COUNTRY_CROSSWALK_REQUIRED',
  );
  const quoteIndex = new Map(
    input.rates.countries.map((q, i) => [q.countryId, i]),
  );
  const actionResults = input.actions.actions.map((a, i) =>
    decomposeAction(
      a,
      quotes.get(a.countryId) ?? {},
      i,
      quoteIndex.get(a.countryId),
    ),
  );
  const contexts = [...quotes.keys()].sort().map((countryId) => {
    const quote = quotes.get(countryId);
    const legacy = [...identity].find(([, c]) => c === countryId)[0];
    function rows(name, predicate) {
      return input[name]
        .map((value, i) => ({ value, source: relation(name, `/${i}`) }))
        .filter(({ value }) => predicate(value));
    }
    const power = rows('power', (r) => r.countryId === legacy);
    const employment = rows('employment', (r) => r.countryId === legacy);
    const services = rows('services', (r) => r.countryId === legacy);
    const water = rows('water', (r) => r.countryId === legacy);
    invariant(
      power.length === 1 &&
        employment.length === 1 &&
        services.length > 0 &&
        water.length > 0,
      `MISSING_COUNTRY_CONTEXT:${countryId}`,
    );
    invariant(
      power[0].value.status === 'CANDIDATE_NOT_ENERGIZED' &&
        power[0].value.hourlyDispatchValidated === false,
      'UNEXPECTED_POWER_SOURCE_STATUS',
    );
    invariant(
      water.every(
        ({ value }) => value.rightsStatus === 'ALLOCATION_PROPOSAL_NOT_GRANTED',
      ),
      'UNEXPECTED_WATER_SOURCE_STATUS',
    );
    invariant(
      employment[0].value.interpretation ===
        'Candidate allocated posts; not runtime jobs',
      'UNEXPECTED_EMPLOYMENT_SOURCE_STATUS',
    );
    const trade = rows('trade', (r) => r.buyerCountryId === legacy);
    invariant(
      trade.every(
        ({ value }) => value.status === 'UNSIGNED_CAPACITY_AND_TRADE_PLAN',
      ),
      'UNEXPECTED_TRADE_SOURCE_STATUS',
    );
    return {
      countryId,
      legacyCountryId: legacy,
      nativeCurrencyCandidate: quote.currencyCode,
      nativeCurrencySource: relation(
        'rates',
        `/countries/${quoteIndex.get(countryId)}/currencyCode`,
      ),
      originalCountrySource: relation(
        'countries',
        `/${input.countries.findIndex((c) => c.id === legacy)}`,
      ),
      population: decimal(
        input.countries.find((c) => c.id === legacy).population,
      ),
      power: {
        source: power[0].source,
        solarCapacityMW: decimal(power[0].value.solarMW),
        windCapacityMW: decimal(power[0].value.windMW),
        storageCapacityMWh: decimal(power[0].value.storageMWh),
        energized: false,
        actualDeliveredMWh: null,
      },
      labour: {
        source: employment[0].source,
        allocatedPosts: decimal(employment[0].value.employed),
        unit: 'POSTS_NOT_HOURS',
        actualHours: null,
        actualWage: null,
      },
      water: {
        sources: water.map((r) => r.source),
        unit: 'RAW_ALLOCATION_PROPOSAL_M3_PER_DAY_NOT_POTABLE_DELIVERY',
        rightsGranted: false,
        netPotableDelivery: null,
      },
      socialServiceSources: services.map((r) => r.source),
      transport: {
        inboundPlanSources: trade.map((r) => r.source),
        unit: 'PLANNED_TONNES_AND_ESTIMATED_KM_NOT_ACCEPTED_TONNE_KM',
        acceptedTonneKm: null,
        nativeContractedRate: null,
      },
      knownActionComponentIndices: actionResults.flatMap((a, i) =>
        a.countryId === countryId ? [i] : [],
      ),
      period: {
        sourceCandidateGrid:
          'MW instantaneous capacity / MWh storage stock; no integration period asserted',
        water: 'M3/DAY proposal',
        employment: 'allocated posts, not timesheet',
        serviceMinimumPeriod: null,
      },
    };
  });
  // Verify ALL foreign keys, not merely records selected by one country's joins.
  for (const key of ['power', 'employment', 'services', 'water'])
    for (const r of input[key]) countryOfLegacy(r.countryId, identity);
  for (const r of input.trade) {
    countryOfLegacy(r.buyerCountryId, identity);
    countryOfLegacy(r.sellerCountryId, identity);
  }
  const coverage = physical.map((r) => {
    invariant(
      batchById.get(r.stableId) === FIELD_BATCH[r.missingField],
      `BATCH_FIELD_MISMATCH:${r.stableId}`,
    );
    invariant(
      r.originalUnit === EXPECTED_UNITS[r.missingField],
      `ORIGINAL_UNIT_MISMATCH:${r.stableId}`,
    );
    invariant(
      r.stableId === `U2544::COUNTRY::${r.countryId}::${r.missingField}`,
      'STABLE_ID_SEMANTIC_MISMATCH',
    );
    invariant(
      r.afterActualField.value === null &&
        r.closureStatus === 'OPEN_NO_ADOPTED_COMPLETION',
      'ORIGINAL_STATUS_CHANGED_REAUDIT_REQUIRED',
    );
    const ci = contexts.findIndex((c) => c.countryId === r.countryId);
    invariant(ci >= 0, 'ORPHAN_ORIGINAL_COUNTRY');
    const batchId = FIELD_BATCH[r.missingField];
    const related = actionResults.flatMap((a, i) => {
      if (a.countryId !== r.countryId) return [];
      const matches =
        batchId === 'B10' ||
        (batchId === 'B11' && a.recipe === 'potableChainRepairPerRawM3Day') ||
        (batchId === 'B12' &&
          a.recipe === 'existingAveragePowerCapacityRepairPerMWhDay') ||
        (batchId === 'B13' && /warehouse|Carrier|Truck/u.test(a.recipe));
      return matches ? [i] : [];
    });
    return {
      stableId: r.stableId,
      countryId: r.countryId,
      field: r.missingField,
      batchId: FIELD_BATCH[r.missingField],
      unit: r.originalUnit,
      actualValue: null,
      actualCurrency: null,
      actualTimeBasis: null,
      beforeStatus: r.afterActualField.status,
      closureStatus: r.closureStatus,
      candidateContextPointer: `/countryContexts/${ci}`,
      dependenciesRef: FIELD_BATCH[r.missingField],
      relatedKnownComponentIndices: related,
      relatedComponentMeaning:
        'REFERENCE_WORK_OR_RESTORATION_ONLY_NOT_SERVICE_MINIMUM_OR_COMPLETE_COST; wages are already inside each action subtotal, never add them again',
      pinnedRegisterStatus: registerById.get(r.stableId).status,
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
      candidateAdapterImplemented: true,
      runtimeSourceOrAdoptionReceipt: null,
    };
  });
  return {
    version: 'C_PHYSICAL_KNOWN_COMPONENTS_20261018_V1_CANDIDATE',
    authority: {
      productionAuthority: false,
      sourceAdmitted: false,
      runtimeConnected: false,
      worldCreated: false,
      clockStarted: false,
    },
    arithmetic:
      'existing testkit exact decimal oracle; no rounding; numeric raw tokens retained losslessly',
    scope:
      'B10-B13: 560 original fields; constructed reference component recovery is not original-field completion',
    countryContexts: contexts,
    knownActionComponents: actionResults,
    dependencies: DEPENDENCIES,
    recipeSource: {
      source: 'recipes',
      count: input.recipes.length,
      status:
        'CANDIDATE_WORKERS_PER_DAILY_OUTPUT_UNIT_NOT_APPROVED_SERVICE_HOURS',
    },
    coverage,
    summary: {
      originalIds: coverage.length,
      countries: contexts.length,
      knownActionComponentRows: actionResults.length,
      exactSubtotalComparisons: actionResults.length,
      supportedCountryContexts: contexts.length,
      sourceComplete: 0,
      engineeringWired: 0,
      validationPassed: 0,
      formallyAdopted: 0,
      sourceRecoveryValidation:
        'EXACT_COMPONENT_REPLAY_ONLY_NOT_COMPLETE_SERVICE_INPUT_VALIDATION',
      pinnedRegisterAudit:
        '560 OPEN at fixed register hash only; not a global re-audit of subsequent owner acceptance',
      independentReview:
        'PENDING_B_ENGINEERING_E_UNITS_ECONOMICS_ROOT_ACCEPTANCE',
    },
  };
}
