/** Fixed local Owner evidence -> original-ID-keyed adopted parameter read.
 * Not an issuer/registry for FoundationFact, runtime authority or actual output.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pins from './source-pins.json' with { type: 'json' };
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';
import { canonicalToken } from '../unknown2544-c-water-service/recover.mjs';
import { exactDecimalMultiply as multiply } from '../../packages/testkit/src/exact-decimal-oracle.ts';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function check(condition, diagnostic) {
  if (!condition) throw new Error(diagnostic);
}
export const SOURCE_PINS = freeze(pins);
const RECIPE_POINTER = '/recipes/potableTreatmentOperationPerRawM3';
const FIELD_LINKS = freeze({
  labourMinimumHours: 'WATER_WORKER_DAY_COMPONENT_NOT_COUNTRY_HOURS',
  labourPayrollNative: 'INDIRECT_WATER_LABOUR_INPUT_NOT_PAYROLL',
  waterPotableDeliveredMinimum:
    'PROCESS_YIELDS_NOT_SERVICE_FLOOR_OR_ACCEPTANCE',
  waterCompleteCostNative: 'PHYSICAL_INPUTS_NOT_PRICES_OR_COMPLETE_COST',
  energyDeliveredMinimum: 'WATER_TREATMENT_LOAD_NOT_COUNTRY_ENERGY_MINIMUM',
  energyCompleteCostNative:
    'INDIRECT_WATER_ENERGY_INPUT_NOT_TARIFF_OR_FULL_COST',
  transportMinimum: 'MATERIAL_REQUIREMENT_ONLY_NO_LOGISTICS_COEFFICIENT',
  transportCompleteCostNative: 'MATERIAL_REQUIREMENT_ONLY_NO_FREIGHT_CONTRACT',
});
export const ORIGINAL_IDS = Object.freeze(
  Object.keys(FIELD_LINKS).map(
    (field) => `U2544::COUNTRY::COUNTRY_01::${field}`,
  ),
);
function at(object, pointer) {
  return pointer
    .slice(1)
    .split('/')
    .reduce((value, key) => {
      check(
        value !== null &&
          typeof value === 'object' &&
          Object.hasOwn(value, key),
        `MISSING_LEAF:${pointer}`,
      );
      return value[key];
    }, object);
}
function verify(bytes, key) {
  check(bytes instanceof Uint8Array, `FIXED_BYTES_REQUIRED:${key}`);
  const pin = SOURCE_PINS.sources[key];
  check(
    bytes.byteLength === pin.bytes && sha256(bytes) === pin.sha256,
    `FIXED_SOURCE_DRIFT:${key}`,
  );
  return parseLossless(Buffer.from(bytes));
}
const ref = (key, pointer) => ({ ...SOURCE_PINS.sources[key], pointer });

/** No caller-chosen pin, path, issuer, or adoption flag is accepted. Supplied
 * buffers must equal the fixed local direct-human receipt and fixed source.
 */
export function createR3AdoptionReader(input) {
  check(
    input &&
      Object.keys(input).every((key) =>
        Object.hasOwn(SOURCE_PINS.sources, key),
      ),
    'ONLY_FIXED_SOURCE_BUFFERS_ALLOWED',
  );
  const receipt = verify(input.adoptionReceipt, 'adoptionReceipt');
  const source = verify(input.recipe, 'recipe');
  const original = verify(input.originalPacket, 'originalPacket');
  check(
    receipt.recordId === 'OWNER_DIRECT_20261020_R3_A_B02_C_G_C' &&
      receipt.authority.type === 'DIRECT_HUMAN_MESSAGE_IN_ROOT_THREAD',
    'FIXED_DIRECT_OWNER_RECORD_REQUIRED',
  );
  check(
    receipt.R3.choice === 'A' &&
      receipt.R3.countryScope.length === 1 &&
      receipt.R3.countryScope[0] === 'COUNTRY_01',
    'R3_COUNTRY_SCOPE_REQUIRED',
  );
  check(
    receipt.R3.sourceSha256 === SOURCE_PINS.sources.recipe.sha256 &&
      receipt.R3.sourcePath === SOURCE_PINS.sources.recipe.path &&
      receipt.R3.pointer === RECIPE_POINTER,
    'ADOPTION_RECIPE_BINDING_REQUIRED',
  );
  check(
    original.schema === SOURCE_PINS.originalReadContract.schema,
    'ORIGINAL_READ_CONTRACT_REQUIRED',
  );
  const recipe = at(source, RECIPE_POINTER);
  const adopted = receipt.R3.perRawWaterCubicMetre;
  const specifications = [
    ...[0, 1, 2].map((i) => [
      `workerDaysBySkill/${i}`,
      `workerDaysBySkillExactDecimal/${i}`,
      'worker-day/raw-m3',
    ]),
    ['STEEL_tonnes', 'STEEL_tonnesExactDecimal', 'tonne/raw-m3'],
    ['MACHINERY_units', 'MACHINERY_unitsExactDecimal', 'equipment-unit/raw-m3'],
    ['electricityMWh', 'electricityMWhExactDecimal', 'MWh/raw-m3'],
    ['yieldTreatment', 'yieldTreatmentExactDecimal', 'treatment-net-m3/raw-m3'],
    [
      'pipeDeliveryYield',
      'pipeDeliveryYieldExactDecimal',
      'delivered-m3/treatment-net-m3',
    ],
  ];
  const coefficients = specifications.map(([key, adoptionKey, unit]) => {
    const rawNumericToken = at(recipe, `/${key}`);
    const canonicalDecimal = canonicalToken(rawNumericToken);
    check(
      canonicalDecimal === at(adopted, `/${adoptionKey}`),
      `ADOPTED_COEFFICIENT_MISMATCH:${key}`,
    );
    return {
      key,
      rawNumericToken,
      canonicalDecimal,
      unit,
      sourceEvidence: ref('recipe', `${RECIPE_POINTER}/${key}`),
      adoptionEvidence: ref(
        'adoptionReceipt',
        `/R3/perRawWaterCubicMetre/${adoptionKey}`,
      ),
    };
  });
  const treatment = coefficients.find((c) => c.key === 'yieldTreatment');
  const pipe = coefficients.find((c) => c.key === 'pipeDeliveryYield');
  const combined = multiply(treatment.canonicalDecimal, pipe.canonicalDecimal);
  check(
    combined === '0.9024' && adopted.eachYieldAppliedExactlyOnce === true,
    'EXACT_ONCE_YIELD_PRODUCT_REQUIRED',
  );
  const parameterView = freeze({
    status: receipt.R3.adoptionStatus,
    evidenceClass:
      'FIXED_LOCAL_DIRECT_OWNER_SCENARIO_PARAMETERS_NOT_RUNTIME_AUTHORITY',
    countryId: 'COUNTRY_01',
    normalization: 'PER_RAW_M3_NOT_ACTUAL_PROCESSED_VOLUME',
    receiptEvidence: ref('adoptionReceipt', '/R3'),
    coefficients,
    derivedDeliveryRatio: {
      canonicalDecimal: combined,
      unit: 'delivered-m3/raw-m3',
      formula: 'yieldTreatment * pipeDeliveryYield',
      appliedSourceLeaves: [treatment, pipe].map((c) => ({
        pointer: c.sourceEvidence.pointer,
        count: 1,
      })),
      actualDeliveredVolume: null,
    },
    excluded: {
      sourceLeafKeys: [...receipt.R3.excludedSourceLeafKeys],
      otherRecipes: 'NOT_ADOPTED',
      otherCountries: 'NOT_ADOPTED',
      hoursPerWorkerDay: null,
      nativePriceOrTariff: null,
      qualityCertification: null,
      WorldEpochOrAsOf: null,
    },
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
  });
  const rows = ORIGINAL_IDS.map((stableId) => {
    const index = original.rows.findIndex((row) => row.stableId === stableId);
    check(index >= 0, 'ORIGINAL_ID_NOT_IN_FIXED_CONTRACT');
    const row = original.rows[index];
    check(
      row.countryId === 'COUNTRY_01' &&
        row.ownerId === 'COUNTRY_01' &&
        row.candidateMeasure.value === null,
      'ORIGINAL_COUNTRY_OR_VALUE_MISMATCH',
    );
    check(
      row.parentBatch.subsetCount === '4',
      'ORIGINAL_SUBSET_METADATA_DRIFT',
    );
    return { row, index };
  });
  return Object.freeze({
    parameters: () => parameterView,
    read(request) {
      check(
        request?.mode === 'ADOPTED_PARAMETERS_ONLY',
        'ACTUAL_OR_COST_OR_DELIVERY_READ_PROHIBITED',
      );
      check(
        Object.keys(request).every((key) =>
          [
            'mode',
            'stableId',
            'countryId',
            'originalUnit',
            'currency',
            'periodOrValueDate',
          ].includes(key),
        ),
        'UNSUPPORTED_AUTHORITY_SCOPE_OR_VOLUME_OPTION',
      );
      const found = rows.find(({ row }) => row.stableId === request.stableId);
      check(found !== undefined, 'OUTSIDE_EXACT_COUNTRY01_ORIGINAL_IDS');
      const { row, index } = found;
      check(request.countryId === 'COUNTRY_01', 'COUNTRY_SCOPE_MISMATCH');
      check(
        request.originalUnit === row.candidateMeasure.unit,
        'ORIGINAL_UNIT_MISMATCH',
      );
      check(
        request.currency === null && request.periodOrValueDate === null,
        'NO_ACTUAL_CURRENCY_OR_PERIOD_BOUND',
      );
      return freeze({
        schema: 'C_R3_ADOPTION_ORIGINAL_ID_READ_V1',
        status: 'ADOPTED_PARAMETERS_READ_NOT_ORIGINAL_FIELD_ACCEPTANCE',
        stableId: row.stableId,
        missingField: row.missingField,
        // Structural cardinalities, not economic observations: old C002 had
        // four per batch; this COUNTRY01-only package has two per batch.
        parentBatch: { ...row.parentBatch, subsetCount: 2 },
        subset: { count: 8, exactOriginalIds: [...ORIGINAL_IDS] },
        originalContract: {
          ...SOURCE_PINS.originalReadContract,
          parentBatch: { ...row.parentBatch, subsetCount: 4 },
          sourceEvidence: ref('originalPacket', `/rows/${index}`),
          originalLedger: structuredClone(row.originalLedger),
          originalAcceptanceRule: row.originalAcceptanceRule,
        },
        relationship: FIELD_LINKS[row.missingField],
        adoptedParameters: parameterView,
        parameterDependencyDelta:
          'Only COUNTRY01 water operation coefficients adopted; whole service/minimum/cost dependency NOT satisfied',
        originalDependencies: structuredClone(row.dependencies),
        originalMeasure: structuredClone(row.candidateMeasure),
        actual: {
          status: 'BLOCKED_MISSING_REAL_INPUTS_AND_B02_DEFERRED',
          processedRawM3: null,
          deliveredPotableM3: null,
          labourHours: null,
          energyDeliveredMWh: null,
          nativeCompleteCost: null,
          actualReceipt: null,
        },
        blockers: [
          'B02 deferred: normal/critical relation, covered beneficiaries/public scope, net quantities/units, quality standard/version, positive effective period',
          'No same-scope actual processed volume, water rights/grant validity, quality, facility operation or accepted delivery',
          'No actual skill hours/availability or source-backed hours per worker-day; no implicit 8h',
          'No complete native wages/benefits/energy/material/chemical/network/freight cost and inclusive-or-disjoint scope',
          'No actual World/genesis/epoch/asOf/operating time binding',
        ],
        originalStages: {
          sourceComplete: false,
          engineeringWired: false,
          validationPassed: false,
          formallyAdopted: false,
        },
        originalFieldsClosed: 0,
        productionAuthority: false,
        runtimeConnected: false,
      });
    },
  });
}

/** The real finite local read point. Paths/pins are repository-owned constants,
 * not a caller hash admitting arbitrary JSON. Reads three small fixed files.
 */
export function readFixedR3Adoption(request) {
  const buffers = Object.fromEntries(
    Object.entries(SOURCE_PINS.sources).map(([key, pin]) => [
      key,
      readFileSync(pin.path),
    ]),
  );
  return createR3AdoptionReader(buffers).read(request);
}
export function inspectFixedConsumerSources() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  return SOURCE_PINS.readOnlyConsumers.map((pin) => {
    const bytes = readFileSync(resolve(root, pin.path));
    check(
      bytes.length === pin.bytes && sha256(bytes) === pin.sha256,
      `READ_ONLY_CONSUMER_DRIFT:${pin.path}`,
    );
    return {
      ...pin,
      status: 'EXACT_SOURCE_READ_ONLY_NOT_EXECUTED',
      excerpt: bytes
        .toString('utf8')
        .split('\n')
        .slice(pin.fromLine - 1, pin.throughLine)
        .join('\n'),
    };
  });
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  check(process.argv.length === 3, 'ONE_EXACT_ORIGINAL_ID_REQUIRED');
  const stableId = process.argv[2];
  const isMoney = stableId.endsWith('Native');
  const originalUnit = isMoney
    ? 'NATIVE_MONEY'
    : stableId.endsWith('labourMinimumHours')
      ? 'HOUR/PERIOD'
      : stableId.endsWith('waterPotableDeliveredMinimum')
        ? 'M3/PERIOD'
        : stableId.endsWith('energyDeliveredMinimum')
          ? 'MWH/PERIOD'
          : 'TONNE_KM/PERIOD';
  console.log(
    JSON.stringify(
      readFixedR3Adoption({
        mode: 'ADOPTED_PARAMETERS_ONLY',
        stableId,
        countryId: 'COUNTRY_01',
        originalUnit,
        currency: null,
        periodOrValueDate: null,
      }),
      null,
      2,
    ),
  );
}
