/** Fixed offline GRAIN reference validator. No actual food or authority branch. */
import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pins from './source-pins.json' with { type: 'json' };
import { parseLossless, sha256 } from '../unknown2544-c-physical/candidate.mjs';
import {
  exactDecimalMultiply as multiply,
  exactDecimalSubtract as subtract,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const SOURCE_PINS = freeze(structuredClone(pins));
export const FIXED_INPUT = SOURCE_PINS.fixedInput;
const documentPins = SOURCE_PINS.documents;
const root = fileURLToPath(new URL('../../', import.meta.url));

function need(ok, code) {
  if (!ok) throw new Error(code);
}
function keys(value, expected, path) {
  need(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `OBJECT_REQUIRED:${path}`,
  );
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  need(
    actual.length === wanted.length && actual.every((k, i) => k === wanted[i]),
    `CLOSED_KEYS_MISMATCH:${path}`,
  );
}
function same(value, expected, path = '/input') {
  if (Array.isArray(expected)) {
    need(
      Array.isArray(value) && value.length === expected.length,
      `FIXED_INPUT_MISMATCH:${path}`,
    );
    expected.forEach((v, i) => same(value[i], v, `${path}/${i}`));
  } else if (expected !== null && typeof expected === 'object') {
    keys(value, Object.keys(expected), path);
    Object.entries(expected).forEach(([k, v]) =>
      same(value[k], v, `${path}/${k}`),
    );
  } else {
    need(value === expected, `FIXED_INPUT_MISMATCH:${path}`);
  }
}
function at(document, pointer) {
  need(/^\/(?:[^~]|~[01])*$/u.test(pointer), 'INVALID_SOURCE_POINTER');
  return pointer
    .slice(1)
    .split('/')
    .reduce((value, token) => {
      const key = token.replace(/~1/gu, '/').replace(/~0/gu, '~');
      need(
        value !== null &&
          typeof value === 'object' &&
          Object.hasOwn(value, key),
        `MISSING_SOURCE_POINTER:${pointer}`,
      );
      return value[key];
    }, document);
}
function decimal(value, name) {
  need(
    typeof value === 'string' &&
      /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u.test(value),
    `EXACT_DECIMAL_REQUIRED:${name}`,
  );
  return value;
}

/** Only the six fixed repository files. These candidate bytes are not actuals. */
export function readFixedFoodReferenceSources(repositoryRoot = root) {
  return Object.fromEntries(
    documentPins.map((pin) => {
      const fd = openSync(
        resolve(repositoryRoot, pin.path),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const stat = fstatSync(fd);
        need(
          stat.isFile() && stat.size === pin.bytes,
          `SOURCE_FILE_OR_SIZE_MISMATCH:${pin.label}`,
        );
        const bytes = readFileSync(fd);
        need(
          bytes.length === pin.bytes && sha256(bytes) === pin.sha256,
          `SOURCE_DRIFT:${pin.label}`,
        );
        return [pin.label, bytes];
      } finally {
        closeSync(fd);
      }
    }),
  );
}

/** Validate a fixed design input against independently pinned source buffers.
 * No IO here, no caller pins or promotion switches, no general actual contract.
 */
export function projectCountry01FoodReference(request) {
  keys(request, ['input', 'sourceBuffers'], '/request');
  keys(
    request.sourceBuffers,
    documentPins.map((pin) => pin.label),
    '/sourceBuffers',
  );
  // Detach every source before reading the authored input. Validation and
  // projection use these same captured bytes, even for Buffer.subarray inputs.
  const captured = Object.fromEntries(
    documentPins.map((pin) => {
      const bytes = request.sourceBuffers[pin.label];
      need(
        bytes instanceof Uint8Array && bytes.byteLength === pin.bytes,
        `SOURCE_BYTES_REQUIRED:${pin.label}`,
      );
      return [pin.label, Buffer.from(bytes)];
    }),
  );
  const input = structuredClone(request.input);
  const documents = Object.fromEntries(
    documentPins.map((pin) => {
      const bytes = captured[pin.label];
      need(sha256(bytes) === pin.sha256, `SOURCE_DRIFT:${pin.label}`);
      return [pin.label, parseLossless(bytes)];
    }),
  );

  keys(input, Object.keys(FIXED_INPUT), '/input');
  keys(input.actual, Object.keys(FIXED_INPUT.actual), '/input/actual');
  for (const [key, value] of Object.entries(input.actual)) {
    need(value === null, `ACTUAL_VALUE_PROHIBITED:${key}`);
  }
  same(input.closure, FIXED_INPUT.closure, '/input/closure');
  same(
    input.policySelection,
    FIXED_INPUT.policySelection,
    '/input/policySelection',
  );
  const period = input.planningPeriod;
  decimal(period?.from, 'period.from');
  decimal(period?.until, 'period.until');
  const duration = subtract(period.until, period.from);
  need(
    duration !== '0' && !duration.startsWith('-'),
    'POSITIVE_RELATIVE_PERIOD_REQUIRED',
  );
  same(period, FIXED_INPUT.planningPeriod, '/input/planningPeriod');

  const get = (label, pointer) => at(documents[label], pointer);
  need(
    get('countries', '/0/id') === input.scenarioCountryId &&
      get('countries', '/0/number') === '01' &&
      input.countryId === 'COUNTRY_01',
    'COUNTRY_IDENTITY_MISMATCH',
  );
  const population = get('countries', '/0/population');
  need(
    population === get('population-services', '/0/population') &&
      population === get('regions', '/0/initial/population'),
    'POPULATION_REFERENCE_MISMATCH',
  );
  need(
    get('population-services', '/0/countryId') === input.scenarioCountryId &&
      get('regions', '/0/countryId') === input.scenarioCountryId &&
      get('facilities', '/350/countryId') === input.scenarioCountryId,
    'SOURCE_COUNTRY_JOIN_MISMATCH',
  );
  need(
    get('regions', '/0/id') === input.scenarioRegionId &&
      get('population-services', '/0/regionId') === input.scenarioRegionId &&
      get('facilities', '/350/regionId') === input.scenarioRegionId &&
      get('countries', '/0/regionIds/0') === input.scenarioRegionId,
    'SOURCE_REGION_JOIN_MISMATCH',
  );
  need(
    get('facilities', '/350/id') === input.scenarioFacilityReferenceId &&
      get('facilities', '/350/commodityId') === 'GRAIN' &&
      get('commodity-catalog', '/3/id') === 'GRAIN',
    'GRAIN_IDENTITY_MISMATCH',
  );
  need(
    get('commodity-catalog', '/3/unit') === 'tonne' &&
      input.referenceRate.unit === 'TONNE/PERSON/SIM_DAY' &&
      input.planningLoad.unit === 'TONNE',
    'GRAIN_UNIT_MISMATCH',
  );
  need(
    get('facilities', '/350/runtimeOperational') === false &&
      get('facilities', '/350/status') === 'UNAPPROVED_SCENARIO_ASSET' &&
      get('balanced-manifest', '/activationAllowed') === false,
    'REFERENCE_AUTHORITY_BOUNDARY_MISMATCH',
  );
  const rate = decimal(
    get('commodity-catalog', '/3/finalDemandPerPersonDay'),
    'source.rate',
  );
  const personDays = multiply(
    decimal(population, 'source.population'),
    duration,
  );
  const total = multiply(personDays, rate);
  need(
    input.planningCoverage.population === population &&
      input.planningCoverage.personDays === personDays &&
      input.planningCoverage.durationSimDays === duration,
    'PLANNING_COVERAGE_MISMATCH',
  );
  need(
    decimal(input.referenceRate.value, 'input.rate') === rate,
    'REFERENCE_RATE_MISMATCH',
  );
  need(
    decimal(input.planningLoad.value, 'input.total') === total,
    'EXACT_PLANNING_TOTAL_MISMATCH',
  );
  const fraction = input.planningLoad.exactRational;
  need(
    typeof fraction?.numerator === 'string' &&
      /^(0|[1-9][0-9]*)$/u.test(fraction.numerator) &&
      typeof fraction.denominator === 'string' &&
      /^[1-9][0-9]*$/u.test(fraction.denominator),
    'EXPLICIT_POSITIVE_DENOMINATOR_REQUIRED',
  );
  same(
    fraction,
    FIXED_INPUT.planningLoad.exactRational,
    '/input/planningLoad/exactRational',
  );
  need(
    multiply(total, fraction.denominator) === fraction.numerator,
    'PLANNING_RATIONAL_MISMATCH',
  );
  // Closed semantics for this reviewed frozen version, including source refs,
  // ID/unit, all descriptions, false flags and unchosen normal/critical policy.
  same(input, FIXED_INPUT);

  return freeze({
    schemaVersion: 'G_C01_FOOD_REFERENCE_PROJECTION_V1',
    status: 'REFERENCE_INPUT_VALIDATED_NOT_ACTUAL_FOOD_FLOOR',
    originClass: 'CONSTRUCTED_NOT_ADOPTED',
    originalId: input.originalId,
    originalUnit: input.originalUnit,
    originalValue: null,
    referenceComponent: 'GRAIN_REFERENCE_COMPONENT_NOT_COMPLETE_NUTRITION',
    planningPeriod: structuredClone(period),
    referencePlanningLoad: {
      value: total,
      unit: 'TONNE',
      basis: 'TOTAL_OVER_DECLARED_INTERVAL',
      rate,
      personDays,
      exactRational: structuredClone(fraction),
      normalFloorTarget: null,
      criticalFloorTarget: null,
    },
    sourceTrace: documentPins.map((pin) => ({ ...pin })),
    designBinding: structuredClone(SOURCE_PINS.designBinding),
    actual: structuredClone(FIXED_INPUT.actual),
    closure: structuredClone(FIXED_INPUT.closure),
    meaning:
      'EXACT_EXISTING_SCENARIO_REFERENCE_ONLY_NOT_ELIGIBILITY_QUALITY_DELIVERY_OR_ADOPTION',
  });
}
