import {
  constants,
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BATCH_FIELDS = Object.freeze({
  B02: { protectedServiceFloor: 70 },
  B03: { feePolicy: 70, feeTotalNative: 70 },
  B04: { minimumCashBufferNative: 70 },
  B08: {
    canonicalObligations: 350,
    mandatoryClassification: 70,
    mandatoryNonDebtNative: 70,
    committedDiscretionaryNative: 70,
  },
});
export const LEDGER_SHA =
  'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb';
export const BATCH_SHA =
  'de8d1d9c52400d675b276f2e9df14ba79870647b579da29630a10746a28fa741';
export const MANIFEST_SHA =
  'fd4133a190e41a59eb0b5b1aa9f8abd98a61f0c857c178ad3e3bca7c5470675f';
export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, code) => {
  if (!condition) throw new Error(code);
};

/** Local evidence IO only: never follow a source symlink or read a FIFO/device. */
export function readPinnedJson(path, expectedSha, expectedBytes = null) {
  requireThat(/^[a-f0-9]{64}$/.test(expectedSha), 'INVALID_SOURCE_PIN');
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fstatSync(fd);
    requireThat(stat.isFile(), 'SOURCE_NOT_REGULAR_FILE');
    requireThat(stat.size <= 16 * 1024 * 1024, 'SOURCE_SIZE_LIMIT');
    if (expectedBytes !== null)
      requireThat(stat.size === expectedBytes, 'SOURCE_SIZE_MISMATCH');
    const bytes = readFileSync(fd);
    requireThat(bytes.length === stat.size, 'SOURCE_CHANGED_DURING_READ');
    requireThat(digest(bytes) === expectedSha, 'SOURCE_HASH_MISMATCH');
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

export function atPointer(document, pointer) {
  requireThat(
    typeof pointer === 'string' && pointer.startsWith('/'),
    'INVALID_POINTER',
  );
  return pointer
    .slice(1)
    .split('/')
    .reduce((row, token) => {
      requireThat(!/~(?![01])/u.test(token), 'INVALID_POINTER_ESCAPE');
      const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
      requireThat(
        row !== null && typeof row === 'object' && Object.hasOwn(row, key),
        'SOURCE_POINTER_MISSING',
      );
      return row[key];
    }, document);
}

/** Exact original-ID intake, NOT a legal completeness check or fiscal producer. */
export function buildIntake(batches, ledger, loadSource) {
  requireThat(
    Array.isArray(batches) && Array.isArray(ledger.records),
    'INVALID_INTAKE',
  );
  const original = new Map();
  for (const record of ledger.records) {
    requireThat(!original.has(record.stableId), 'DUPLICATE_LEDGER_ID');
    original.set(record.stableId, record);
  }
  const selected = new Set();
  const records = [];
  const counts = {};
  for (const [batchId, expectedFields] of Object.entries(BATCH_FIELDS)) {
    const matches = batches.filter((b) => b.batchId === batchId);
    requireThat(matches.length === 1, 'BATCH_MISSING_OR_DUPLICATED');
    const batch = matches[0];
    requireThat(Array.isArray(batch.stableIds), 'BATCH_IDS_REQUIRED');
    const fieldCounts = {};
    for (const stableId of batch.stableIds) {
      requireThat(!selected.has(stableId), 'DUPLICATE_ASSIGNED_ID');
      selected.add(stableId);
      const r = original.get(stableId);
      requireThat(r !== undefined, 'FOREIGN_STABLE_ID');
      requireThat(
        Object.hasOwn(expectedFields, r.missingField),
        'WRONG_BATCH_FIELD',
      );
      requireThat(r.rootCause === batch.rootCause, 'ROOT_CAUSE_MISMATCH');
      requireThat(
        stableId === `U2544::${r.scope}::${r.ownerId}::${r.missingField}`,
        'IDENTITY_MISMATCH',
      );
      fieldCounts[r.missingField] = (fieldCounts[r.missingField] ?? 0) + 1;
      const s = r.originalSource;
      const source = loadSource(s);
      const leaf = atPointer(source, s.pointer);
      requireThat(
        leaf && typeof leaf === 'object' && !Array.isArray(leaf),
        'FIELD_LEAF_REQUIRED',
      );
      requireThat(
        Object.hasOwn(leaf, 'value') && Object.hasOwn(leaf, 'status'),
        'FIELD_VALUE_MISSING',
      );
      requireThat(
        leaf.unit === r.originalUnit && leaf.gapId === r.originalGapId,
        'FIELD_SEMANTICS_CHANGED',
      );
      requireThat(
        JSON.stringify(leaf) === JSON.stringify(r.before),
        'BASELINE_SOURCE_CHANGED',
      );
      // Hash/pointer identity does not establish legal status, current completeness,
      // approval, source admission, or runtime wiring. None is inferred here.
      records.push({
        stableId,
        batchId,
        countryId: r.countryId,
        scope: r.scope,
        ownerId: r.ownerId,
        missingField: r.missingField,
        rootCause: r.rootCause,
        originalUnit: r.originalUnit,
        originalGapId: r.originalGapId,
        historicalBefore: r.before,
        sourceObservedField: leaf,
        originalSource: s,
        dependencies: r.dependencies,
        completionMethod: r.completionMethod,
        acceptanceRule: r.acceptanceRule,
        phases: {
          sourceComplete: 'NOT_ESTABLISHED',
          engineeringWired: 'NOT_ESTABLISHED',
          validationPassed: 'NOT_ESTABLISHED',
          formallyAdopted: 'NOT_ESTABLISHED',
        },
        intakeValidation: 'PIN_POINTER_IDENTITY_AND_HISTORICAL_FIELD_MATCH',
        candidateValue: null,
        currentOriginalFieldClosure: 'NOT_ASSESSED_BY_INTAKE',
      });
    }
    requireThat(
      batch.originalFieldCount === batch.stableIds.length,
      'BATCH_COUNT_MISMATCH',
    );
    requireThat(
      Object.keys(fieldCounts).length === Object.keys(expectedFields).length,
      'BATCH_FIELD_COUNT_MISMATCH',
    );
    for (const [field, count] of Object.entries(expectedFields)) {
      requireThat(
        fieldCounts[field] === count && batch.fieldCounts[field] === count,
        'BATCH_FIELD_COUNT_MISMATCH',
      );
    }
    counts[batchId] = batch.stableIds.length;
  }
  requireThat(records.length === 840, 'ASSIGNED_TOTAL_MISMATCH');
  return {
    schemaVersion: 'd-fiscal-original-id-intake-v1',
    status: 'SOURCE_INTAKE_ONLY_NOT_FISCAL_COMPLETION',
    batchCounts: counts,
    originalIdCount: records.length,
    scope:
      'Pinned historical ledger and original source fields only; not all possible current sources',
    originalFieldClosuresClaimed: 0,
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
    records,
  };
}

export function runIntake({ inputDirectory, ledgerPath, outputPath }) {
  const manifestPath = resolve(inputDirectory, 'manifest.json');
  // Caller-supplied manifest is only a file inventory, not authority. The batch
  // and ledger have independent immutable pins; each original source has its own.
  const manifest = readPinnedJson(manifestPath, MANIFEST_SHA);
  requireThat(Array.isArray(manifest.files), 'MANIFEST_FILES_REQUIRED');
  const names = new Set();
  for (const file of manifest.files) {
    requireThat(
      typeof file.file === 'string' &&
        !file.file.includes('/') &&
        !file.file.includes('\\') &&
        file.file !== '..' &&
        !names.has(file.file),
      'MANIFEST_PATH_OR_DUPLICATE',
    );
    names.add(file.file);
    const path = resolve(inputDirectory, file.file);
    // The text/csv are byte-checked too, without parsing as JSON.
    const fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = fstatSync(fd);
      requireThat(
        stat.isFile() && stat.size <= 16 * 1024 * 1024,
        'MANIFEST_FILE_TYPE_SIZE',
      );
      const bytes = readFileSync(fd);
      requireThat(
        bytes.length === file.bytes && digest(bytes) === file.sha256,
        'MANIFEST_PIN_MISMATCH',
      );
    } finally {
      closeSync(fd);
    }
  }
  requireThat(
    names.has('execution_batches.json'),
    'BATCH_MANIFEST_ENTRY_REQUIRED',
  );
  const batches = readPinnedJson(
    resolve(inputDirectory, 'execution_batches.json'),
    BATCH_SHA,
  );
  const ledger = readPinnedJson(ledgerPath, LEDGER_SHA);
  const sources = new Map();
  const result = buildIntake(batches, ledger, (s) => {
    const key = JSON.stringify([s.path, s.sha256, s.bytes]);
    if (!sources.has(key))
      sources.set(key, readPinnedJson(s.path, s.sha256, s.bytes));
    return sources.get(key);
  });
  result.inputPins = {
    ledger: LEDGER_SHA,
    batches: BATCH_SHA,
    manifest: MANIFEST_SHA,
    sourceFiles: [...sources.keys()].map((key) => JSON.parse(key)),
  };
  // Never overwrite an existing evidence artifact; a later run needs a new name.
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  return {
    originalIdCount: result.originalIdCount,
    batchCounts: result.batchCounts,
    outputSha256: digest(readFileSync(outputPath)),
    outputPath,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  requireThat(
    process.argv.length === 5,
    'USAGE: node intake.mjs INPUT_DIRECTORY LEDGER_PATH NEW_OUTPUT_PATH',
  );
  console.log(
    JSON.stringify(
      runIntake({
        inputDirectory: process.argv[2],
        ledgerPath: process.argv[3],
        outputPath: process.argv[4],
      }),
      null,
      2,
    ),
  );
}
