/** Offline, fixed construction references. No admission, writer or runtime. */
import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';
import {
  exactDecimalAdd as add,
  exactDecimalMultiply as multiply,
  exactDecimalSubtract as subtract,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = 'data/physical-opening-candidates/2026-10-23-g-v2';
export const BUNDLE_REVISION = 'G_PHYSICAL_CONSTRUCTION_POINTER_V3';
export const MANIFEST_SHA256 =
  '3f88cbfd8787c858aec47b741fac32fccdcabcf724e7ba3c4dcc97a40367c0fd';
function need(ok, code) {
  if (!ok) throw new Error(code);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function keys(value, names, location) {
  need(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `OBJECT_REQUIRED:${location}`,
  );
  need(
    isDeepStrictEqual(Object.keys(value).sort(), [...names].sort()),
    `CLOSED_KEYS_MISMATCH:${location}`,
  );
}
function sameReference(value, expected, path = '/chunk') {
  if (Array.isArray(expected)) {
    need(
      Array.isArray(value) && value.length === expected.length,
      `FIXED_REFERENCE_RECORD_MISMATCH:${path}`,
    );
    expected.forEach((item, i) =>
      sameReference(value[i], item, `${path}/${i}`),
    );
  } else if (expected !== null && typeof expected === 'object') {
    keys(value, Object.keys(expected), path);
    for (const [key, item] of Object.entries(expected))
      sameReference(value[key], item, `${path}/${key}`);
  } else need(value === expected, `FIXED_REFERENCE_RECORD_MISMATCH:${path}`);
}
function read(pin) {
  const fd = openSync(
    resolve(root, pin.repoPath),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fstatSync(fd);
    need(
      stat.isFile() && stat.size === pin.bytes,
      `SOURCE_FILE_OR_SIZE_MISMATCH:${pin.repoPath}`,
    );
    const bytes = readFileSync(fd);
    need(
      bytes.length === pin.bytes && sha256(bytes) === pin.sha256,
      `SOURCE_DRIFT:${pin.repoPath}`,
    );
    return bytes;
  } finally {
    closeSync(fd);
  }
}
// The code pins the index itself; a modified index cannot authorize new paths.
const manifestBytes = readFileSync(resolve(root, directory, 'manifest.json'));
need(sha256(manifestBytes) === MANIFEST_SHA256, 'BUNDLE_INDEX_DRIFT');
export const SOURCE_INDEX = freeze(JSON.parse(manifestBytes));
const dataPins = SOURCE_INDEX.generatedAndEvidenceData;
const batches = dataPins.slice(0, 7);
const commonPins = [
  ...SOURCE_INDEX.trackedInputs,
  { ...SOURCE_INDEX.sharedScopeInput, source: 'approved17' },
  ...SOURCE_INDEX.sharedIdentityCurrencyReferences.map((pin) => ({
    ...pin,
    repoPath: pin.path,
    source: pin.id,
  })),
  ...dataPins
    .slice(7)
    .map((pin) => ({ ...pin, source: pin.repoPath.split('/').at(-1) })),
];
const fields = [
  'protectedServiceFloor',
  'labourMinimumHours',
  'labourPayrollNative',
  'waterPotableDeliveredMinimum',
  'waterCompleteCostNative',
  'energyDeliveredMinimum',
  'energyCompleteCostNative',
  'transportMinimum',
  'transportCompleteCostNative',
];
const period = freeze({
  calendar: 'SIM_TIME_RELATIVE_ONLY',
  from: '0',
  until: '1',
  unit: 'SIM_DAY',
  quantityBasis: 'TOTAL_OVER_DECLARED_INTERVAL',
  actualWorldId: null,
  epoch: null,
});
function selection(request) {
  keys(request, ['bundleRevision', 'countryId'], '/request');
  need(request.bundleRevision === BUNDLE_REVISION, 'BUNDLE_REVISION_MISMATCH');
  need(
    typeof request.countryId === 'string' &&
      /^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(request.countryId),
    'CANONICAL_COUNTRY_REQUIRED',
  );
  // Only bounded identity indices use Number; quantities always use exact strings.
  const index = Number(request.countryId.slice(-2)) - 1;
  return { index, pin: batches[Math.floor(index / 10)] };
}
function pinsFor(request) {
  const { pin } = selection(request);
  return [...commonPins, { ...pin, source: 'candidate-batch' }];
}

/** Reads only fixed repository paths, one selected ten-country chunk, no fallback. */
export function readPhysicalReferenceSources(request) {
  return Object.fromEntries(
    pinsFor(request).map((pin) => [pin.source, read(pin)]),
  );
}
function capture(request, buffers) {
  const pins = pinsFor(request);
  keys(
    buffers,
    pins.map((pin) => pin.source),
    '/sourceBuffers',
  );
  // Detach all buffers before parsing any data, including caller subarray views.
  const captured = Object.fromEntries(
    pins.map((pin) => {
      const input = buffers[pin.source];
      need(
        input instanceof Uint8Array && input.byteLength === pin.bytes,
        `SOURCE_BYTES_REQUIRED:${pin.source}`,
      );
      return [pin.source, Buffer.from(input)];
    }),
  );
  for (const pin of pins)
    need(
      sha256(captured[pin.source]) === pin.sha256,
      `SOURCE_DRIFT:${pin.source}`,
    );
  return captured;
}
function decimal(value) {
  need(
    typeof value === 'string' &&
      /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value),
    'EXACT_DECIMAL_REQUIRED',
  );
  return add(value, '0');
}
function gcd(a, b) {
  a = a < 0n ? -a : a;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function fraction(value) {
  const text = decimal(value);
  const scale = text.split('.')[1]?.length ?? 0;
  return [BigInt(text.replace('.', '')), 10n ** BigInt(scale)];
}
// Bounded serialization of these fixed decimal calculations and normal/yield.
// A nonterminating quotient stays n/d with valueExactDecimal:null.
function quantity(value, unit, divisor = '1') {
  const [vn, vd] = fraction(value);
  const [dn, dd] = fraction(divisor);
  need(dn > 0n, 'POSITIVE_DIVISOR_REQUIRED');
  let n = vn * dd,
    d = vd * dn;
  const factor = gcd(n, d);
  n /= factor;
  d /= factor;
  let rest = d,
    twos = 0,
    fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos++;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives++;
  }
  let valueExactDecimal = null;
  if (rest === 1n) {
    const scale = Math.max(twos, fives);
    const integer = (n * 10n ** BigInt(scale)) / d;
    const digits = (integer < 0n ? -integer : integer)
      .toString()
      .padStart(scale + 1, '0');
    const unsigned = scale
      ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
      : digits;
    valueExactDecimal = add(`${integer < 0n ? '-' : ''}${unsigned}`, '0');
  }
  return {
    valueExactDecimal,
    numerator: n.toString(),
    denominator: d.toString(),
    unit,
    roundingApplied: false,
  };
}
function sum(rows, field) {
  return rows.reduce((total, [, row]) => add(total, decimal(row[field])), '0');
}
function entries(rows, key, country) {
  return rows
    .map((row, i) => [i, row])
    .filter(([, row]) => row[key] === country);
}

function construct(index, docs, countryClimate, receipt, originalIds) {
  const c = docs.countries[index];
  const num = String(index + 1).padStart(2, '0');
  const countryId = `COUNTRY_${num}`;
  need(
    c?.number === num && c.id === `visual-territory-${num}`,
    'COUNTRY_IDENTITY_MISMATCH',
  );
  const population = decimal(c.population);
  const waters = entries(docs['water-allocations'], 'countryId', c.id);
  const services = entries(docs['population-services'], 'countryId', c.id);
  const facilities = entries(docs.facilities, 'countryId', c.id);
  const power = entries(docs.power, 'countryId', c.id);
  const trade = entries(docs['trade-plans'], 'buyerCountryId', c.id);
  need(
    waters.length > 0 &&
      services.length > 0 &&
      facilities.length > 0 &&
      power.length === 1,
    'SOURCE_COUNTRY_JOIN_MISMATCH',
  );
  need(
    sum(services, 'population') === population,
    'POPULATION_REFERENCE_MISMATCH',
  );
  need(
    isDeepStrictEqual(
      [...new Set(waters.map(([, row]) => row.regionId))].sort(),
      [...c.regionIds].sort(),
    ),
    'REGION_REFERENCE_MISMATCH',
  );
  need(
    trade.every(([, row]) => row.status === 'UNSIGNED_CAPACITY_AND_TRADE_PLAN'),
    'TRADE_REFERENCE_AUTHORITY_MISMATCH',
  );
  need(
    facilities.every(([, row]) => row.runtimeOperational === false),
    'FACILITY_REFERENCE_AUTHORITY_MISMATCH',
  );
  const ids = fields.map((field) => `U2544::COUNTRY::${countryId}::${field}`);
  need(
    ids.every((id) => originalIds.has(id)),
    'ORIGINAL_ID_OUTSIDE_SHARED_SCOPE',
  );
  const grainIndex = docs['commodity-catalog'].findIndex(
    (row) => row.id === 'GRAIN',
  );
  const grain = docs['commodity-catalog'][grainIndex];
  need(
    grain?.unit === 'tonne' &&
      grain.finalDemandPerPersonDay === '0.0006666666666666666',
    'GRAIN_REFERENCE_UNIT_OR_RATE_MISMATCH',
  );
  const raw = sum(waters, 'domesticM3Day');
  const yieldRatio = multiply(
    receipt.yieldTreatmentExactDecimal,
    receipt.pipeDeliveryYieldExactDecimal,
  );
  need(yieldRatio === '0.9024', 'R3_YIELD_MISMATCH');
  const net = multiply(raw, yieldRatio);
  const normal = multiply(population, '0.05');
  const critical = multiply(population, '0.015');
  return {
    schemaVersion: 'G_PHYSICAL_OPENING_SCENARIO_CANDIDATE_V2',
    candidateVersion: '2',
    originClass: 'CONSTRUCTED_NOT_ADOPTED',
    countryId,
    scenarioCountryId: c.id,
    period: structuredClone(period),
    geography: {
      countryPointer: `/${index}`,
      scenarioRegionIds: c.regionIds,
      climateMixPreserved: countryClimate,
      population,
      populationSourcePointer: `/${index}/population`,
      resourceOrGeographyEdited: false,
    },
    originalIds: ids,
    B02: {
      residentOnlyNormalReference: quantity(normal, 'NET_M3/DECLARED_PERIOD'),
      residentOnlyCriticalReference: quantity(
        critical,
        'NET_M3/DECLARED_PERIOD',
      ),
      policyMeaning:
        'NEW_70_COUNTRY_APPLICABILITY_PROPOSAL_USING_PREVIOUS_C01_DESIGN_REFERENCE_NOT_ADOPTED_FLOOR',
      normalLitresPerResidentSimDay: '50',
      criticalLitresPerResidentSimDay: '15',
      requiredMedicalAndPublicDueAdditions: null,
      completeProtectedFloor: null,
      grainReferenceBasket: quantity(
        multiply(population, grain.finalDemandPerPersonDay),
        'TONNE/DECLARED_PERIOD',
      ),
      grainSourcePointer: `/${grainIndex}/finalDemandPerPersonDay`,
      foodNormalCriticalPolicy: null,
      qualityAndMembershipAdoption: null,
    },
    B10_B11_waterAndResourcePressure: {
      rawDeclaredPlanningWork: quantity(raw, 'RAW_M3/DECLARED_PERIOD'),
      theoreticalNetPotential: quantity(
        net,
        'THEORETICAL_DELIVERED_M3/DECLARED_PERIOD',
      ),
      workerDaysByUnboundSkillSlot: receipt.workerDaysBySkillExactDecimal.map(
        (rate) => quantity(multiply(raw, rate), 'WORKER_DAY/DECLARED_PERIOD'),
      ),
      steel: quantity(
        multiply(raw, receipt.STEEL_tonnesExactDecimal),
        'TONNE/DECLARED_PERIOD',
      ),
      machinery: quantity(
        multiply(raw, receipt.MACHINERY_unitsExactDecimal),
        'EQUIPMENT_UNIT/DECLARED_PERIOD',
      ),
      electricityInput: quantity(
        multiply(raw, receipt.electricityMWhExactDecimal),
        'MWH_INPUT/DECLARED_PERIOD',
      ),
      recipeAuthority:
        num === '01'
          ? 'COUNTRY01_SCOPED_ADOPTED_COEFFICIENTS_ONLY'
          : 'NEW_COPIED_R3_COEFFICIENT_PROPOSAL_NOT_ADOPTED_FOR_THIS_COUNTRY',
      actualOperation: false,
      acceptedDelivery: null,
      actualLabourHours: null,
    },
    waterGeography: {
      regionAllocationPointers: waters.map(([i]) => `/${i}`),
      rightsStatus: 'ALLOCATION_PROPOSAL_NOT_GRANTED',
      referenceAvailableRaw: quantity(
        sum(waters, 'availableM3Day'),
        'RAW_M3/REFERENCE_SIM_DAY',
      ),
      referenceDrySeasonAvailableRaw: quantity(
        sum(waters, 'drySeasonAvailableM3Day'),
        'RAW_M3/REFERENCE_SIM_DAY',
      ),
      referenceAllSectorAllocation: quantity(
        sum(waters, 'allocatedM3Day'),
        'RAW_M3/REFERENCE_SIM_DAY',
      ),
      residentNormalRawRequirementAtProposedRecipe: quantity(
        normal,
        'RAW_M3/DECLARED_PERIOD',
        yieldRatio,
      ),
      residentCriticalRawRequirementAtProposedRecipe: quantity(
        critical,
        'RAW_M3/DECLARED_PERIOD',
        yieldRatio,
      ),
      signedNormalDemandMinusTheoreticalDomesticNet: quantity(
        subtract(normal, net),
        'M3/DECLARED_PERIOD',
      ),
      comparisonMeaning:
        'COUNTERFACTUAL_SAME_UNIT_REFERENCE_DIFFERENCE_NOT_ACTUAL_SHORTAGE_OR_SERVICE_ACCEPTANCE',
    },
    B12: {
      sourcePointer: `/${power[0][0]}`,
      averageDemandMWLexeme: power[0][1].averageDemandMW,
      averageDeliveredMWLexeme: power[0][1].averageDeliveredMW,
      status: power[0][1].status,
      hourlyDispatchValidated: power[0][1].hourlyDispatchValidated,
      actualMWh: null,
      simDayToSimulationHourRule: null,
      supplyOrDemandMWConvertedToMWh: false,
    },
    B13: {
      inboundUnsignedPlanPointers: trade.map(([i]) => `/${i}`),
      plannedFreightTonnes: quantity(
        sum(trade, 'freightTonnesDay'),
        'TONNE/DECLARED_PERIOD',
      ),
      plannedFreightDistanceProduct: quantity(
        trade.reduce(
          (total, [, row]) =>
            add(
              total,
              multiply(
                decimal(row.freightTonnesDay),
                decimal(row.distanceKmEstimate),
              ),
            ),
          '0',
        ),
        'PLANNING_TONNE_KM/DECLARED_PERIOD',
      ),
      existingRouteIds: trade.map(([, row]) => row.routeId ?? null),
      distanceBasis:
        'EXISTING_SOURCE_DISTANCE_KM_ESTIMATE_NOT_NEW_SURVEY_OR_APPROVAL',
      actualTonneKm: null,
      acceptedDeliveryOrRights: null,
      C13FrozenTonnesRelabelled: false,
    },
    facilityReferencePointers: facilities.map(([i]) => `/${i}`),
    actual: {
      ...Object.fromEntries(fields.map((field) => [field, null])),
      period: null,
      currency: null,
      actualWorld: null,
    },
    stages: {
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
    },
    sourceAdmitted: false,
    runtimeConnected: false,
    productionAuthority: false,
    originalFieldsClosed: 0,
  };
}

/** Pure assembly from independently hash-fixed buffers. The economic request
 * remains only {bundleRevision,countryId}; buffers cannot change the pins.
 */
export function assemblePhysicalReference(request, sourceBuffers) {
  const { index, pin } = selection(request);
  const captured = capture(request, sourceBuffers);
  const docs = Object.fromEntries(
    SOURCE_INDEX.trackedInputs.map((p) => [
      p.source,
      parseLossless(captured[p.source]),
    ]),
  );
  const shared = parseLossless(captured.approved17);
  const originalIds = new Set(shared.flatMap((batch) => batch.stableIds));
  const receipt = parseLossless(captured['OWNER_R3_BOUNDED_RECEIPT.json.txt'])
    .R3.perRawWaterCubicMetre;
  const parameters = JSON.parse(
    captured['PARAMETER_AND_APPLICABILITY_PROPOSAL.json'],
  );
  need(
    isDeepStrictEqual(receipt, parameters.R3SourceCoefficientValues),
    'R3_PARAMETER_BINDING_MISMATCH',
  );
  const candidates = JSON.parse(captured['candidate-batch']);
  // Original candidate serialization retained integer display metadata and
  // preserved decimal display tokens as strings (Python parse_float=str).
  const countryClimates = JSON.parse(
    captured.countries,
    (_key, value, context) =>
      typeof value === 'number' && /[.eE]/u.test(context.source)
        ? context.source
        : value,
  ).map((country) => country.climateMix);
  const start = Math.floor(index / 10) * 10;
  const constructed = Array.from({ length: 10 }, (_, offset) =>
    construct(
      start + offset,
      docs,
      countryClimates[start + offset],
      receipt,
      originalIds,
    ),
  );
  const expectedChunk = {
    countryIds: constructed.map((row) => row.countryId),
    originalIdCount: 90,
    records: constructed,
    status: 'CONSTRUCTED_REFERENCE_INPUTS_NOT_ADOPTED',
  };
  sameReference(candidates, expectedChunk);
  const applicability = JSON.parse(
    captured['APPLICABILITY_AND_COMPLETENESS.json'],
  );
  const countryApplicability = applicability.countries[index];
  need(
    countryApplicability?.countryId === request.countryId &&
      countryApplicability.actualValueDate === null &&
      countryApplicability.worldClockAsOf === null &&
      countryApplicability.relativePeriodIsActualTime === false,
    'APPLICABILITY_BOUNDARY_MISMATCH',
  );
  return freeze({
    kind: 'EXACT_CONSTRUCTED_REFERENCE_RECORD_NOT_ACTUAL_OR_ADMITTED',
    bundleRevision: BUNDLE_REVISION,
    economicCandidateVersion: '2',
    sourcePointerArtifactRevision: '3',
    sourceManifestHash: MANIFEST_SHA256,
    record: constructed[index - start],
    applicability: countryApplicability,
    parameters,
    supplyConservationBoundaries: JSON.parse(
      captured['SUPPLY_CONSERVATION_BOUNDARIES.json'],
    ),
    sourceTrace: pinsFor(request).map((p) => ({
      repoPath: p.repoPath,
      bytes: p.bytes,
      sha256: p.sha256,
    })),
    selectedBatch: pin.repoPath,
    sourceAdmitted: false,
    runtimeConnected: false,
    productionAuthority: false,
    originalFieldsClosed: 0,
  });
}

/** Fixed offline selector, suitable for C's separately reviewed reference input. */
export function selectPhysicalReference(request) {
  return assemblePhysicalReference(
    request,
    readPhysicalReferenceSources(request),
  );
}
