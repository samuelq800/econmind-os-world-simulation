/** Source recovery and design evidence only; no service/cost producer or issuer. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseLossless,
  sha256,
  verifyBytes,
} from '../unknown2544-c-physical/candidate.mjs';
import {
  exactDecimalAdd as add,
  exactDecimalMultiply as multiply,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
function check(ok, message) {
  if (!ok) throw new Error(message);
}
export function canonicalToken(raw) {
  check(typeof raw === 'string', 'EXACT_RAW_TOKEN_REQUIRED');
  const m = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(raw);
  check(m !== null, 'NONNEGATIVE_JSON_DECIMAL_TOKEN_REQUIRED');
  const digits = m[1] + (m[2] ?? '');
  const point = BigInt(m[1].length) + BigInt(m[3] ?? '0');
  check(
    point >= -1024n && point <= 1024n && digits.length <= 2048,
    'TOKEN_SCALE_OUT_OF_BOUNDED_SCOPE',
  );
  // Only a bounded string-position/length is converted to Number, never the
  // numeric observation/coefficient. Its exact raw token is already retained.
  const value =
    point <= 0n
      ? `0.${'0'.repeat(Number(-point))}${digits}`
      : point >= BigInt(digits.length)
        ? `${digits}${'0'.repeat(Number(point - BigInt(digits.length)))}`
        : `${digits.slice(0, Number(point))}.${digits.slice(Number(point))}`;
  return add(value, '0');
}
function pointer(document, path) {
  const parts = path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/gu, '/').replace(/~0/gu, '~'));
  let value = document;
  for (const part of parts) {
    check(
      value !== null && Object.hasOwn(value, part),
      `MISSING_SOURCE_POINTER:${path}`,
    );
    value = value[part];
  }
  return value;
}
export function recover() {
  const pins = JSON.parse(
    readFileSync(new URL('./source-pins.json', import.meta.url)),
  );
  const receipt = [],
    sources = {};
  for (const [key, pin] of Object.entries(pins.sources)) {
    const bytes = readFileSync(pin.path);
    check(sha256(bytes) === pin.sha256, `SOURCE_DRIFT:${key}`);
    sources[key] = pin.textOnly ? bytes.toString('utf8') : parseLossless(bytes);
    receipt.push({ key, ...pin, bytes: bytes.length, verification: 'PASS' });
  }
  const oldPins = JSON.parse(
    readFileSync(
      new URL('../unknown2544-c-physical/source-pins.json', import.meta.url),
    ),
  );
  const ratePin = oldPins.sources.rates;
  const rateBytes = readFileSync(ratePin.path);
  sources.rates = verifyBytes(rateBytes, ratePin);
  receipt.push({
    key: 'rates',
    ...ratePin,
    bytes: rateBytes.length,
    verification: 'PASS',
  });
  const leaf = (source, path, unit) => {
    const rawNumericToken = pointer(sources[source], path);
    return {
      source,
      pointer: path,
      rawNumericToken,
      canonicalDecimal: canonicalToken(rawNumericToken),
      unit,
    };
  };
  const base = '/recipes/potableTreatmentOperationPerRawM3';
  const coefficients = {
    workerDaysBySkill: [0, 1, 2].map((i) =>
      leaf('r3Recipes', `${base}/workerDaysBySkill/${i}`, 'worker-day/raw-m3'),
    ),
    steel: leaf('r3Recipes', `${base}/STEEL_tonnes`, 'tonne/raw-m3'),
    machinery: leaf(
      'r3Recipes',
      `${base}/MACHINERY_units`,
      'equipment-unit/raw-m3',
    ),
    electricity: leaf('r3Recipes', `${base}/electricityMWh`, 'MWh/raw-m3'),
    treatmentYield: leaf(
      'r3Recipes',
      `${base}/yieldTreatment`,
      'net-treatment-m3/raw-m3',
    ),
    distributionYield: leaf(
      'r3Recipes',
      `${base}/pipeDeliveryYield`,
      'delivered-m3/net-treatment-m3',
    ),
    salePriceReference: leaf(
      'r3Recipes',
      `${base}/potablePriceReferenceGcuPerM3`,
      'GCU/delivered-m3_REFERENCE_NOT_COST',
    ),
    performanceQuality: pointer(
      sources.r3Recipes,
      `${base}/performanceQuality`,
    ),
  };
  check(
    !Object.hasOwn(
      sources.r3FinalOverrides,
      'potableTreatmentOperationPerRawM3',
    ),
    'LATER_OPERATION_RECIPE_OVERRIDE_REAUDIT_REQUIRED',
  );
  const sceneIndex = sources.r3Scene.rows.findIndex(
    (r) => r.branch === 'region' && r.number === '01',
  );
  check(sceneIndex >= 0, 'COUNTRY01_REGION_WAGE_SOURCE_REQUIRED');
  const scene = sources.r3Scene.rows[sceneIndex];
  const wage = leaf(
    'r3Scene',
    `/rows/${sceneIndex}/dailySourceWageGcu`,
    'GCU/worker-day_REFERENCE',
  );
  const skills = scene.skillWageMultipliersProposal.map((_, i) =>
    leaf(
      'r3Scene',
      `/rows/${sceneIndex}/skillWageMultipliersProposal/${i}`,
      'ratio_REFERENCE',
    ),
  );
  const financeIndex = sources.finance.findIndex(
    (r) => r.countryId === 'visual-territory-01',
  );
  const employmentIndex = sources.employment.findIndex(
    (r) => r.countryId === 'visual-territory-01',
  );
  check(
    financeIndex >= 0 && employmentIndex >= 0,
    'SOURCE_WAGE_FOREIGN_KEY_MISMATCH',
  );
  const income = leaf(
    'finance',
    `/${financeIndex}/dailyLabourIncomeReference`,
    'GCU/day_REFERENCE',
  );
  const employed = leaf(
    'employment',
    `/${employmentIndex}/employed`,
    'allocated-posts_REFERENCE_NOT_HOURS',
  );
  check(
    multiply(wage.canonicalDecimal, employed.canonicalDecimal) ===
      income.canonicalDecimal,
    'SOURCE_WAGE_RATIO_NOT_EXACT',
  );
  const rateIndex = sources.rates.countries.findIndex(
    (r) => r.countryId === 'COUNTRY_01',
  );
  const quote = sources.rates.countries[rateIndex];
  check(quote?.currencyCode === 'XAA', 'COUNTRY01_CANDIDATE_CURRENCY_MISMATCH');
  const prices = ['STEEL', 'MACHINERY'].map((id) => {
    const i = sources.commodity.findIndex((r) => r.id === id);
    check(i >= 0, `MISSING_COMMODITY:${id}`);
    return {
      commodityId: id,
      sourceUnit: sources.commodity[i].unit,
      ...leaf(
        'commodity',
        `/${i}/referencePriceGcu`,
        `GCU/${sources.commodity[i].unit}_REFERENCE`,
      ),
    };
  });
  const conflicts = ['low', 'medium', 'high'].map((skill, i) => ({
    kind: 'INCOMPATIBLE_UNADOPTED_RECIPE_COEFFICIENTS',
    skill,
    older: leaf('waterV2', `/${skill}WorkerDaysPerRawM3`, 'worker-day/raw-m3'),
    r3Operation: coefficients.workerDaysBySkill[i],
    selectedAsActual: false,
    resolution:
      'Exact R3 version is proposed for E review, not silently adopted',
  }));
  conflicts.push({
    kind: 'SALE_PRICE_NOT_COST_AND_VERSION_CONFLICT',
    older: leaf(
      'waterV2',
      '/domesticPriceReferenceGcuPerDeliveredM3',
      'GCU/delivered-m3_REFERENCE',
    ),
    r3Operation: coefficients.salePriceReference,
    selectedAsActual: false,
  });
  const producerLines = sources.r3FinalProducer.split('\n');
  const powerQuoteLine = producerLines.findIndex(
    (s) => s.includes('waterOpCost=') && s.includes("['electricityMWh']*120"),
  );
  check(
    powerQuoteLine >= 0,
    'EXACT_REFERENCE_POWER_QUOTE_EXPRESSION_NOT_FOUND',
  );
  const excerpts = Object.entries(pins.repositoryTextSources).map(
    ([key, pin]) => {
      const bytes = readFileSync(`${repo}/${pin.path}`);
      check(sha256(bytes) === pin.sha256, `REPOSITORY_SOURCE_DRIFT:${key}`);
      receipt.push({ key, ...pin, bytes: bytes.length, verification: 'PASS' });
      const lines = bytes.toString('utf8').split('\n');
      return {
        key,
        path: pin.path,
        sha256: pin.sha256,
        ranges: pin.ranges.map(([from, until]) => ({
          fromLine: from,
          throughLine: until,
          text: lines.slice(from - 1, until).join('\n'),
        })),
      };
    },
  );
  const contract = JSON.parse(
    readFileSync(new URL('./INPUT_CONTRACT_CANDIDATE.json', import.meta.url)),
  );
  check(
    contract.sourceKind === 'CONSTRUCTED_SCENARIO_CANDIDATE_NOT_ADOPTED' &&
      contract.originalFieldsClosed === 0,
    'CONTRACT_AUTHORITY_BOUNDARY_CHANGED',
  );
  check(
    contract.requiredInputs.every((r) => r.currentlyBound === false),
    'UNSUPPORTED_COMPLETE_INPUT_CLAIM',
  );
  return {
    version: 'C_COUNTRY01_WATER_OPERATION_SOURCE_DELTA_20261018_V2_PROPOSED',
    status:
      'SOURCE_RECOVERED_DESIGN_PENDING_INDEPENDENT_REVIEW_NOT_SERVICE_PRODUCER',
    noActualOperationOrAdoption: true,
    recipeSourceStatus: sources.r3Recipes.status,
    olderWaterStatus: sources.waterV2.status,
    scenarioStatus: sources.r3Scene.status,
    r6Status: sources.r6Effective.status,
    coefficients,
    combinedCandidateYield: {
      amount: multiply(
        coefficients.treatmentYield.canonicalDecimal,
        coefficients.distributionYield.canonicalDecimal,
      ),
      unit: 'delivered-m3/raw-m3',
      meaning:
        'Conditional recipe coefficient only; not any actual produced or delivered quantity',
    },
    wageReference: {
      wage,
      skills,
      ratioCheck:
        'EXACT wage * reference allocated employed = source reference labour income; NOT an actual timesheet or legal payroll',
      income,
      employed,
    },
    nativeQuoteReference: {
      currency: quote.currencyCode,
      rate: leaf(
        'rates',
        `/countries/${rateIndex}/LCperGCU`,
        'XAA/GCU_REFERENCE',
      ),
      quoteVersion: quote.rateVersion,
      valueDate: quote.valueDate,
      adoptedFlagInOriginalSource: quote.adopted,
    },
    materialReferencePrices: prices,
    powerReferenceQuote: {
      amount: '120',
      unit: 'GCU/MWh_REFERENCE_ONLY',
      source: 'r3FinalProducer',
      line: powerQuoteLine + 1,
      expression: producerLines[powerQuoteLine],
      actualNativeTariff: null,
    },
    conflicts,
    unchosenServiceTarget: {
      olderDomestic: leaf(
        'waterV2',
        '/targetLitersPerPersonSimDay',
        'L/person/sim-day_PROPOSAL',
      ),
      olderCriticalPublic: leaf(
        'waterV2',
        '/criticalPublicWaterLitersPerPersonSimDayProposal',
        'L/person/sim-day_PROPOSAL',
      ),
      r6Formula: sources.r6Effective.waterInstalledRawCapacityFormula,
      meaning:
        'Do not treat a 20+2 L stress target or installed-capacity formula as D B02 normal protected service adoption',
    },
    quality: {
      olderHypothesis: sources.waterV2.qualityAssumption,
      actualQuality: null,
      clinicalSafetyClaim: false,
    },
    repositoryExcerpts: excerpts,
    necessarySeams: contract.necessaryExistingSeamReport,
    costComplete: false,
    actualSkillHours: null,
    actualMWhDelivery: null,
    actualAcceptedTonneKm: null,
    receipt,
  };
}
