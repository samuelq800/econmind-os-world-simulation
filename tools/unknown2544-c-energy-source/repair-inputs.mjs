/** One pinned constructed-reference input vector. No writer/registration/model.
 * Private byte framing is not a generic JSON syntax or source-admission API.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import {
  parseLossless,
  decimal,
  decomposeAction,
} from '../unknown2544-c-physical/candidate.mjs';
import {
  exactDecimalAdd as add,
  exactDecimalMultiply as multiply,
} from '../../packages/testkit/src/exact-decimal-oracle.ts';

export const LIMITS = Object.freeze({ chunk: 65536, frame: 65536, depth: 256 });
const FIRST14 =
  '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/';
const ORIGINAL = '/Users/samuel/Documents/Codex/2026-10-10/task-3/';
export const PINS = Object.freeze({
  action: Object.freeze({
    path: FIRST14 + 'RECONSTRUCTION_ACTIONS.json',
    bytes: 756152,
    sha256: '9c9a4d91cb16e17cc48fa23c801360f8c7c1c499d6ead61f7382dc40ce1f17e2',
  }),
  quote: Object.freeze({
    path:
      ORIGINAL +
      'world-opening-fx-cb-scene-20261013-v1/CURRENCY_FX_RULES_AND_CANDIDATE.json',
    bytes: 213759,
    sha256: '812e95994053837139afd6b8798a68d3ff4f4436fbd839dfb8f9568371c3e562',
  }),
  catalogue: Object.freeze({
    path: fileURLToPath(
      new URL(
        '../../artifacts/world-balanced-candidate-v1/data/commodity-catalog.json',
        import.meta.url,
      ),
    ),
    bytes: 1933,
    sha256: 'b1f9a100bdb80627e31801ffaf1b2c7863a2996cedba0344de8a899c616eff2b',
  }),
  jobs: Object.freeze({
    path:
      ORIGINAL +
      'world-opening-remnant-v2-revision/region_R3AM_STARTUP_strict_bridge_R0.3_D140_S1_JOBS.json',
    bytes: 78674969,
    sha256: '265a3831b9c2e585c20794f6993d653744dfff66a4f526685b46fc7108bf8f3d',
  }),
  daily: Object.freeze({
    path: FIRST14 + 'RECONSTRUCTION_DAILY.jsonl',
    bytes: 27406844,
    sha256: '01830ae0d9e30bcfbd313a387282910ad929fa20999507384916528566fd81d5',
  }),
});
const INDICES = Object.freeze([1323, 1328, 1332, 1336]);
const SETTLEMENTS = Object.freeze([
  'visual-territory-53-E1-URBAN_CLUSTER',
  'visual-territory-53-E1-RURAL_SETTLEMENT_NETWORK',
  'visual-territory-53-E2-URBAN_CLUSTER',
  'visual-territory-53-E2-RURAL_SETTLEMENT_NETWORK',
]);
const RECIPE = 'existingAveragePowerCapacityRepairPerMWhDay';
const VERSION = 'CONSTRUCTED_SCENARIO_FIRST14_20261013_V1_PROPOSED';
const whitespace = (byte) => [9, 10, 13, 32].includes(byte);
function requireFact(ok, code) {
  if (!ok) throw new Error(code);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Validation only: canonicalization reuses the existing plain-decimal helper. */
function amount(value, field) {
  requireFact(
    typeof value === 'string' && value.length > 0,
    `MISSING_OR_INVALID_AMOUNT:${field}`,
  );
  requireFact(value.length <= 1024, `AMOUNT_TOKEN_LIMIT:${field}`);
  requireFact(
    !/[eE]/u.test(value),
    `EXPONENT_LEXEME_UNSUPPORTED_THIS_SLICE:${field}`,
  );
  requireFact(
    /^(0|[1-9]\d*)(\.\d+)?$/u.test(value),
    `PLAIN_NONNEGATIVE_DECIMAL_REQUIRED:${field}`,
  );
  return decimal(value);
}
function selectedJson(raw, label) {
  try {
    return parseLossless(raw);
  } catch {
    throw new Error(`INVALID_SELECTED_JSON:${label}`);
  }
}

/** ASCII structure is located in original bytes; strings/escapes span chunks.
 * Skipped values are framed, NOT semantically parsed. Fixed full-file pins gate
 * every positive; untrusted inspection never claims snapshot integrity.
 */
function jobFramer() {
  let phase = 'START',
    index = 0,
    stack = [],
    quoted = false,
    escaped = false;
  let start = 0,
    parts = [],
    retainedBytes = 0;
  const frames = [];
  const keep = (bytes) => {
    retainedBytes += bytes.length;
    requireFact(retainedBytes <= LIMITS.frame, 'JOB_FRAME_LIMIT');
    parts.push(Buffer.from(bytes)); // Do not alias a caller-reused chunk.
  };
  return {
    feed(bytes, offset) {
      let sliceStart = phase === 'BODY' && INDICES.includes(index) ? 0 : null;
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (phase === 'BODY') {
          requireFact(
            offset + i - start + 1 <= LIMITS.frame,
            'JOB_FRAME_LIMIT',
          );
          if (quoted) {
            requireFact(byte >= 32, 'JOB_STRING_CONTROL_BYTE');
            if (escaped) escaped = false;
            else if (byte === 92) escaped = true;
            else if (byte === 34) quoted = false;
          } else if (byte === 34) quoted = true;
          else if (byte === 123 || byte === 91) {
            stack.push(byte === 123 ? 125 : 93);
            requireFact(stack.length <= LIMITS.depth, 'JOB_NESTING_LIMIT');
          } else if (byte === 125 || byte === 93) {
            requireFact(stack.pop() === byte, 'JOB_BRACKET_MISMATCH');
            if (!stack.length) {
              if (INDICES.includes(index)) {
                keep(bytes.subarray(sliceStart, i + 1));
                frames.push({
                  pointer: `/${index}`,
                  startByte: start,
                  endByteExclusive: offset + i + 1,
                  raw: Buffer.concat(parts, retainedBytes),
                });
                requireFact(frames.length <= 4, 'JOB_RETAINED_FRAME_LIMIT');
                parts = [];
                retainedBytes = 0;
                sliceStart = null;
              }
              index++;
              phase = 'SEPARATOR';
            }
          }
          continue;
        }
        if (whitespace(byte)) continue;
        if (phase === 'START') {
          requireFact(byte === 91, 'JOB_ROOT_ARRAY_REQUIRED');
          phase = 'FIRST';
        } else if ((phase === 'FIRST' || phase === 'NEXT') && byte === 123) {
          phase = 'BODY';
          stack = [125];
          quoted = false;
          escaped = false;
          start = offset + i;
          parts = [];
          retainedBytes = 0;
          sliceStart = INDICES.includes(index) ? i : null;
        } else if (phase === 'FIRST' && byte === 93) phase = 'DONE';
        else if (phase === 'SEPARATOR' && byte === 44) phase = 'NEXT';
        else if (phase === 'SEPARATOR' && byte === 93) phase = 'DONE';
        else throw new Error(`INVALID_JOB_OUTER_FRAME:${phase}`);
      }
      if (sliceStart !== null) keep(bytes.subarray(sliceStart));
    },
    finish() {
      requireFact(
        phase === 'DONE' && !quoted && !stack.length,
        'TRUNCATED_JOB_ARRAY',
      );
      requireFact(
        frames.length === 4 &&
          frames.every((r, i) => r.pointer === `/${INDICES[i]}`),
        'FOUR_EXACT_JOB_POINTERS_REQUIRED',
      );
      return { frames, recordCount: index };
    },
  };
}

function dailyFramer() {
  let line = 1,
    count = 0,
    start = 0,
    size = 0,
    parts = [];
  let frame = null;
  const keep = (bytes) => {
    if (line === 256) parts.push(Buffer.from(bytes));
  };
  const end = (endByte) => {
    if (line === 256) {
      requireFact(size > 0, 'EMPTY_SELECTED_DAILY_LINE');
      frame = {
        line: 256,
        startByte: start,
        endByteExclusive: endByte,
        raw: Buffer.concat(parts, size),
      };
    }
    count++;
    line++;
    size = 0;
    parts = [];
  };
  return {
    feed(bytes, offset) {
      let from = 0;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 10) {
          size += i - from;
          requireFact(size <= LIMITS.frame, 'DAILY_LINE_LIMIT');
          keep(bytes.subarray(from, i));
          end(offset + i);
          start = offset + i + 1;
          from = i + 1;
        }
      }
      size += bytes.length - from;
      requireFact(size <= LIMITS.frame, 'DAILY_LINE_LIMIT');
      keep(bytes.subarray(from));
    },
    finish(bytes) {
      if (size > 0) end(bytes); // No phantom empty line after final LF.
      requireFact(frame !== null, 'SELECTED_DAILY_LINE_MISSING');
      return { frames: [frame], lineCount: count };
    },
  };
}

async function collect(chunks, key, pinned) {
  const pin = PINS[key],
    hash = createHash('sha256');
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const framer =
    key === 'jobs' ? jobFramer() : key === 'daily' ? dailyFramer() : null;
  const parts = [];
  let bytesRead = 0;
  try {
    for await (const value of chunks) {
      requireFact(value instanceof Uint8Array, `BYTE_CHUNK_REQUIRED:${key}`);
      requireFact(
        value.byteLength > 0 && value.byteLength <= LIMITS.chunk,
        `CHUNK_LIMIT:${key}`,
      );
      const bytes = Buffer.from(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      );
      const offset = bytesRead;
      bytesRead += bytes.length;
      requireFact(bytesRead <= pin.bytes, `SOURCE_BYTE_LIMIT:${key}`);
      hash.update(bytes);
      try {
        utf8.decode(bytes, { stream: true });
      } catch {
        throw new Error(`INVALID_UTF8:${key}`);
      }
      if (framer) framer.feed(bytes, offset);
      else parts.push(Buffer.from(bytes));
    }
    try {
      utf8.decode();
    } catch {
      throw new Error(`INVALID_UTF8_EOF:${key}`);
    }
    const data = framer
      ? framer.finish(bytesRead)
      : { raw: Buffer.concat(parts, bytesRead) };
    const sha256 = hash.digest('hex');
    const receipt = {
      key,
      expectedPath: pin.path,
      bytes: bytesRead,
      sha256,
      hashCompleteAtEof: true,
      matchesFixedPin: bytesRead === pin.bytes && sha256 === pin.sha256,
      recordCount: data.recordCount ?? null,
      lineCount: data.lineCount ?? null,
      retainedFrames: data.frames?.length ?? null,
    };
    if (
      pinned &&
      (!receipt.matchesFixedPin ||
        (key === 'jobs' && data.recordCount !== 138966) ||
        (key === 'daily' && data.lineCount !== 27127))
    ) {
      const error = new Error(`SOURCE_INTEGRITY_MISMATCH:${key}`);
      error.receipt = receipt;
      throw error;
    }
    return { ...data, receipt };
  } catch (error) {
    // A rejected/unfinished stream never returns a partly verified fact.
    if (
      error instanceof TypeError &&
      error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA'
    )
      throw new Error(`INVALID_UTF8:${key}`, { cause: error });
    throw error;
  }
}

async function readPinned(key) {
  const handle = await fs.open(
    PINS[key].path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let stream;
  try {
    const stat = await handle.stat();
    requireFact(stat.isFile(), `REGULAR_FILE_REQUIRED:${key}`);
    requireFact(
      stat.size === PINS[key].bytes,
      `SOURCE_FILE_LENGTH_MISMATCH:${key}`,
    );
    stream = handle.createReadStream({
      autoClose: false,
      highWaterMark: LIMITS.chunk,
    });
    return await collect(stream, key, true);
  } finally {
    stream?.destroy();
    await handle.close();
  }
}

function vector(sources, pinned) {
  const actionDoc = selectedJson(sources.action.raw, 'action');
  const quoteDoc = selectedJson(sources.quote.raw, 'quote');
  const catalogue = selectedJson(sources.catalogue.raw, 'catalogue');
  requireFact(actionDoc.version === VERSION, 'ACTION_SOURCE_VERSION_MISMATCH');
  const action = actionDoc.actions?.[330],
    quote = quoteDoc.countries?.[52];
  const daily = selectedJson(sources.daily.frames[0].raw, 'daily:256');
  const jobs = sources.jobs.frames.map((frame) =>
    selectedJson(frame.raw, `job:${frame.pointer}`),
  );
  requireFact(
    action?.actionId === '53_' + RECIPE &&
      action.countryId === 'COUNTRY_53' &&
      action.recipe === RECIPE &&
      action.currency === 'XCA' &&
      action.earliestRecordedStartSimDay === '1' &&
      action.lastRecordedWorkSimDay === '1',
    'ACTION_SCOPE_MISMATCH',
  );
  requireFact(
    quote?.countryId === 'COUNTRY_53' &&
      quote.currencyCode === 'XCA' &&
      quote.adopted === false &&
      quote.rateVersion === 'LCFX_CB_REGION_20261013_V2_PROPOSED',
    'QUOTE_SCOPE_MISMATCH',
  );
  requireFact(
    daily.country === '53' &&
      daily.simDay === '1' &&
      daily.realDay === '1' &&
      daily.recipe === RECIPE &&
      daily.localCurrency === 'XCA' &&
      daily.actualWorldPosting === false &&
      daily.status ===
        'REFERENCE_REPLAY_RECORDED_AND_OLD_AUDIT_SUPPORTED_NOT_VERIFIED_V2_RUNTIME',
    'DAILY_SCOPE_MISMATCH',
  );
  requireFact(
    Array.isArray(daily.sourceIndices) &&
      daily.sourceIndices.length === 4 &&
      new Set(daily.sourceIndices).size === 4 &&
      INDICES.every((i) => daily.sourceIndices.includes(String(i))),
    'DAILY_POINTER_SET_MISMATCH',
  );
  requireFact(
    Array.isArray(daily.finishSimDays) &&
      daily.finishSimDays.length === 1 &&
      daily.finishSimDays[0] === '3',
    'DAILY_FINISH_SCOPE_MISMATCH',
  );
  requireFact(
    Array.isArray(catalogue) &&
      catalogue.length === 12 &&
      new Set(catalogue.map((r) => r.id)).size === 12 &&
      catalogue.every(
        (r) =>
          typeof r.id === 'string' &&
          typeof r.unit === 'string' &&
          r.unit.length > 0,
      ),
    'EXPLICIT_UNIQUE_COMMODITY_UNITS_REQUIRED',
  );
  requireFact(
    catalogue[7].id === 'STEEL' &&
      catalogue[7].unit === 'tonne' &&
      catalogue[9].id === 'MACHINERY' &&
      catalogue[9].unit === 'equipment unit',
    'SELECTED_MATERIAL_UNIT_MISMATCH',
  );
  const materialIds = catalogue.map((r) => r.id);
  const prices = catalogue.map((r) =>
    amount(r.referencePriceGcu, `${r.id}.price`),
  );
  const skill = ['0', '0', '0'],
    materials = Object.fromEntries(materialIds.map((id) => [id, '0']));
  let energy = '0',
    wages = '0',
    quantity = '0';
  for (const [i, job] of jobs.entries()) {
    requireFact(
      job.settlementId === SETTLEMENTS[i] &&
        job.name === RECIPE &&
        job.simDay1 === '1' &&
        job.finishSimDay1 === '3' &&
        job.newSceneContract === true,
      'JOB_SCOPE_OR_SETTLEMENT_MISMATCH',
    );
    requireFact(
      Array.isArray(job.workDaysBySkill) && job.workDaysBySkill.length === 3,
      'THREE_EXPLICIT_SKILL_BUCKETS_REQUIRED',
    );
    requireFact(
      job.materialsNative &&
        typeof job.materialsNative === 'object' &&
        !Array.isArray(job.materialsNative) &&
        Object.keys(job.materialsNative).length === 12 &&
        materialIds.every((id) => Object.hasOwn(job.materialsNative, id)),
      'TWELVE_EXPLICIT_RAW_MATERIALS_REQUIRED',
    );
    energy = add(energy, amount(job.electricityMWh, 'job.electricityMWh'));
    wages = add(
      wages,
      amount(job.salaryReferenceGcu, 'job.salaryReferenceGcu'),
    );
    quantity = add(quantity, amount(job.quantity, 'job.quantity'));
    for (let j = 0; j < 3; j++)
      skill[j] = add(skill[j], amount(job.workDaysBySkill[j], `job.skill${j}`));
    for (const id of materialIds)
      materials[id] = add(
        materials[id],
        amount(job.materialsNative[id], `job.material.${id}`),
      );
  }
  requireFact(
    energy === amount(daily.electricityMWhKnown, 'daily.electricityMWhKnown'),
    'ENERGY_SUM_MISMATCH',
  );
  requireFact(
    wages ===
      amount(daily.actualReferenceWagesGcu, 'daily.actualReferenceWagesGcu') &&
      wages === amount(action.recordedWagesGcu, 'action.recordedWagesGcu'),
    'WAGE_SUM_MISMATCH',
  );
  requireFact(
    quantity === amount(daily.quantity, 'daily.quantity') &&
      daily.quantityUnit === 'source recipe capacity/vehicle/freight unit',
    'RECIPE_QUANTITY_MISMATCH',
  );
  requireFact(
    Array.isArray(daily.labourWorkDaysBySkill) &&
      daily.labourWorkDaysBySkill.length === 3 &&
      Array.isArray(action.labourWorkDaysBySkill) &&
      action.labourWorkDaysBySkill.length === 3,
    'THREE_SUMMARY_SKILL_BUCKETS_REQUIRED',
  );
  requireFact(
    skill.every(
      (v, i) =>
        v === amount(daily.labourWorkDaysBySkill[i], `daily.skill${i}`) &&
        v === amount(action.labourWorkDaysBySkill[i], `action.skill${i}`),
    ),
    'SKILL_SUM_MISMATCH',
  );
  requireFact(
    daily.materialsNative &&
      typeof daily.materialsNative === 'object' &&
      !Array.isArray(daily.materialsNative),
    'DAILY_MATERIAL_MAP_REQUIRED',
  );
  for (const [id, value] of Object.entries(daily.materialsNative))
    requireFact(
      materialIds.includes(id) &&
        amount(value, `daily.material.${id}`) === materials[id],
      'DAILY_MATERIAL_SUM_MISMATCH',
    );
  for (const id of materialIds)
    requireFact(
      materials[id] === '0' || Object.hasOwn(daily.materialsNative, id),
      'MISSING_NONZERO_DAILY_MATERIAL',
    );
  const book = materialIds.reduce(
    (sum, id, i) => add(sum, multiply(materials[id], prices[i])),
    '0',
  );
  requireFact(
    book === amount(daily.materialBookCostGcu, 'daily.materialBookCostGcu') &&
      book ===
        amount(action.knownMaterialCostGcu, 'action.knownMaterialCostGcu'),
    'MATERIAL_BOOK_SUM_MISMATCH',
  );
  requireFact(
    add(wages, book) === amount(daily.knownCostGcu, 'daily.knownCostGcu'),
    'INCLUSIVE_REFERENCE_SUBTOTAL_MISMATCH',
  );
  // This existing helper validates plain quote operands and reconciles only one
  // already-recorded action. No buildCandidate(), model or426-action replay.
  amount(quote.LCperGCU, 'quote.LCperGCU');
  amount(quote.GCUperLC, 'quote.GCUperLC');
  const bookkeeping = decomposeAction(action, quote, 330, 52);
  requireFact(
    bookkeeping.knownComponentsSubtotalNative ===
      amount(daily.knownCostLC, 'daily.knownCostLC'),
    'NATIVE_REFERENCE_SUBTOTAL_MISMATCH',
  );
  return freeze({
    schemaVersion: 1,
    class: pinned
      ? 'CONSTRUCTED_REFERENCE_REPAIR_INPUT_VECTOR_NOT_ACTUAL_OPERATION'
      : 'UNVERIFIED_REFERENCE_INSPECTION_ONLY',
    status: 'REFERENCE_ONLY',
    sourceBytesVerified: pinned,
    identity: {
      countryId: 'COUNTRY_53',
      actionId: action.actionId,
      actionPointer: '/actions/330',
      dailyLine: 256,
      jobPointers: INDICES.map((i) => `/${i}`),
      recipe: RECIPE,
      referenceWorkSimDay: '1',
      referenceFinishSimDay: '3',
    },
    referenceVector: {
      electricityInputMWh: energy,
      workerDaysBySourceSkillBucket: skill,
      labourUnit: 'WORKER_DAY_REFERENCE_NOT_HOUR',
      materials: catalogue.map((r) => ({
        commodityId: r.id,
        unit: r.unit,
        amount: materials[r.id],
      })),
      recipeQuantity: { amount: quantity, unit: daily.quantityUnit },
      recordedWagesReferenceGcu: wages,
      materialBookCostReferenceGcu: book,
    },
    bookkeeping,
    sourceReceipts: Object.values(sources).map((s) => s.receipt),
    witnesses: {
      jobs: sources.jobs.frames.map((f) => ({
        ...f,
        raw: f.raw.toString('utf8'),
      })),
      daily: {
        ...sources.daily.frames[0],
        raw: sources.daily.frames[0].raw.toString('utf8'),
      },
      action,
      quote,
      catalogue,
      sourceVersion: actionDoc.version,
    },
    rawJobSourceRead: pinned,
    cashJournalRead: false,
    actualLabourHours: null,
    actualEnergyDeliveredMWh: null,
    actualRecurringEnergyCost: null,
    nationalMinimum: null,
    actualWorldPosting: false,
    sourceAdmitted: false,
    runtimeRegistered: false,
    productionAuthority: false,
    originalStages: {
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
    },
    originalFieldsClosed: 0,
  });
}

/** Each original file is opened once, regular-file checked, then selected and
 * hashed through that SAME FD to EOF. No public pin/mode/path/callback override.
 */
export async function extractPinnedRepairInputs() {
  const sources = {};
  for (const key of Object.keys(PINS)) sources[key] = await readPinned(key);
  return vector(sources, true);
}

/** Synthetic streams inspect the SAME mechanics/semantics, never fixed-source
 * truth. No caller option can turn this result into sourceBytesVerified=true.
 */
export async function inspectUntrustedRepairInputs(streams) {
  const sources = {};
  for (const key of Object.keys(PINS)) {
    requireFact(streams?.[key], `SOURCE_STREAM_REQUIRED:${key}`);
    sources[key] = await collect(streams[key], key, false);
  }
  return vector(sources, false);
}
