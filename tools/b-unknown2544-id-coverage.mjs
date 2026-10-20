/** Offline diagnostics only: no source admission, closure decision or writes. */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const BASELINE_PINS = Object.freeze({
  ledger: 'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb',
  batches: 'de8d1d9c52400d675b276f2e9df14ba79870647b579da29630a10746a28fa741',
  register: '224e15de598bb9b8659adcb6dc747f54f3446c2ec411c3688329a1f6e50c353c',
});
export const STAGES = Object.freeze([
  'sourceComplete',
  'engineeringWired',
  'validationPassed',
  'formallyAdopted',
]);
const MAX_BYTES = 16 * 1024 * 1024;
const own = (object, key) => Object.hasOwn(object, key);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}

/** RFC6901 own-property lookup. Empty pointer is the document, not missing. */
export function atPointer(document, pointer) {
  requireValue(typeof pointer === 'string', 'POINTER_TYPE');
  if (pointer === '') return document;
  requireValue(pointer.startsWith('/'), 'POINTER_PREFIX');
  let value = document;
  for (const encoded of pointer.slice(1).split('/')) {
    requireValue(!/~(?:[^01]|$)/u.test(encoded), 'POINTER_ESCAPE');
    const token = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    requireValue(value !== null && typeof value === 'object', 'POINTER_PARENT');
    if (Array.isArray(value)) {
      requireValue(/^(?:0|[1-9][0-9]*)$/u.test(token), 'POINTER_ARRAY_INDEX');
    }
    requireValue(own(value, token), 'POINTER_MISSING');
    value = value[token];
  }
  return value;
}

function indexed(rows, key, name) {
  requireValue(Array.isArray(rows), `${name}:ARRAY_REQUIRED`);
  const map = new Map();
  for (const row of rows) {
    requireValue(row && typeof row[key] === 'string', `${name}:KEY_REQUIRED`);
    requireValue(!map.has(row[key]), `${name}:DUPLICATE:${row[key]}`);
    map.set(row[key], row);
  }
  return map;
}
function histogram(rows, key) {
  const counts = {};
  for (const row of rows) {
    const group = String(row[key]);
    Object.defineProperty(counts, group, {
      value: (own(counts, group) ? counts[group] : 0) + 1,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return counts;
}

/** Pure consistency checker; caller documents are NOT authenticated authority. */
export function auditDocuments({
  ledger,
  batches,
  register,
  sourceDocuments,
  deliveries = [],
  expectedCount = 2544,
}) {
  const originals = indexed(ledger.records, 'stableId', 'LEDGER');
  requireValue(originals.size === expectedCount, 'LEDGER:COUNT');
  indexed(batches, 'batchId', 'BATCHES');
  const batchFor = new Map();
  for (const batch of batches) {
    requireValue(Array.isArray(batch.stableIds), 'BATCH:IDS_REQUIRED');
    requireValue(
      batch.originalFieldCount === batch.stableIds.length,
      'BATCH:COUNT',
    );
    for (const id of batch.stableIds) {
      requireValue(originals.has(id), `BATCH:FOREIGN:${id}`);
      requireValue(!batchFor.has(id), `BATCH:DUPLICATE:${id}`);
      requireValue(
        originals.get(id).rootCause === batch.rootCause,
        `BATCH:ROOT_CAUSE:${id}`,
      );
      batchFor.set(id, batch);
    }
  }
  requireValue(batchFor.size === originals.size, 'BATCH:MISSING');
  const registered = indexed(register.records, 'stableId', 'REGISTER');
  requireValue(registered.size === originals.size, 'REGISTER:COUNT');
  for (const id of registered.keys())
    requireValue(originals.has(id), `REGISTER:FOREIGN:${id}`);
  const seenKeys = new Set();
  const originalRows = [...originals.values()].map((row, index) => {
    const expected = `U2544::${row.scope}::${row.ownerId}::${row.missingField}`;
    requireValue(row.stableId === expected, `LEDGER:IDENTITY:${row.stableId}`);
    const key = JSON.stringify([row.scope, row.ownerId, row.missingField]);
    requireValue(!seenKeys.has(key), 'LEDGER:COMPOSITE_DUPLICATE');
    seenKeys.add(key);
    requireValue(
      typeof row.acceptanceRule === 'string' && row.acceptanceRule.length > 0,
      'LEDGER:ACCEPTANCE_REQUIRED',
    );
    const ref = row.originalSource;
    const source = sourceDocuments.get(ref.path);
    requireValue(
      source && source.sha256 === ref.sha256 && source.bytes === ref.bytes,
      `SOURCE:PIN:${row.stableId}`,
    );
    const leaf = atPointer(source.document, ref.pointer);
    // Structural pointer integrity is NOT economic source completeness.
    requireValue(
      isDeepStrictEqual(leaf, row.afterActualField),
      `SOURCE:LEAF:${row.stableId}`,
    );
    return {
      stableId: row.stableId,
      originalRecordPointer: `/records/${index}`,
      scope: row.scope,
      ownerId: row.ownerId,
      missingField: row.missingField,
      category: row.category,
      rootCause: row.rootCause,
      batchId: batchFor.get(row.stableId).batchId,
      unit: row.afterActualField?.unit ?? row.originalUnit,
      originalAcceptanceRule: row.acceptanceRule,
      originalSource: structuredClone(ref),
      originalSourcePointerIntegrity: true,
      storedRegisterStatus: registered.get(row.stableId).status,
      mentions: [],
      independentlyAcceptedStages: null,
    };
  });
  const outputById = new Map(originalRows.map((r) => [r.stableId, r]));
  indexed(deliveries, 'label', 'DELIVERIES');
  const deliverySummaries = [];
  for (const delivery of deliveries) {
    const rows = atPointer(delivery.document, delivery.rowsPointer);
    const mapping = indexed(rows, 'stableId', `DELIVERY:${delivery.label}`);
    requireValue(
      Array.isArray(delivery.batchIds) && delivery.batchIds.length > 0,
      'DELIVERY:BATCH_SCOPE',
    );
    const expectedIds = batches
      .filter((b) => delivery.batchIds.includes(b.batchId))
      .flatMap((b) => b.stableIds);
    requireValue(
      new Set(delivery.batchIds).size === delivery.batchIds.length &&
        delivery.batchIds.every((id) => batches.some((b) => b.batchId === id)),
      'DELIVERY:BATCH_IDS',
    );
    requireValue(
      mapping.size === expectedIds.length,
      `DELIVERY:SCOPE_COUNT:${delivery.label}`,
    );
    const reportedTrue = Object.fromEntries(STAGES.map((s) => [s, 0]));
    let reportedComplete = 0;
    for (const [id, row] of mapping) {
      requireValue(originals.has(id), `DELIVERY:FOREIGN:${id}`);
      requireValue(expectedIds.includes(id), `DELIVERY:OUT_OF_SCOPE:${id}`);
      const original = originals.get(id);
      for (const [key, value] of Object.entries({
        scope: original.scope,
        ownerId: original.ownerId,
        field: original.missingField,
        missingField: original.missingField,
        batchId: batchFor.get(id).batchId,
        adoptedPlanBatch: batchFor.get(id).batchId,
        originalAcceptanceRule: original.acceptanceRule,
        acceptanceRule: original.acceptanceRule,
      })) {
        if (own(row, key))
          requireValue(
            row[key] === value,
            `DELIVERY:ORIGINAL_METADATA:${id}:${key}`,
          );
      }
      if (own(row, 'originalSource')) {
        requireValue(
          isDeepStrictEqual(row.originalSource, original.originalSource),
          `DELIVERY:ORIGINAL_SOURCE:${id}`,
        );
      }
      const stages = atPointer(row, delivery.stagesPointer ?? '');
      const reportedStages = {};
      for (const stage of STAGES) {
        requireValue(
          typeof stages?.[stage] === 'boolean',
          `DELIVERY:STAGE_TYPE:${id}:${stage}`,
        );
        reportedStages[stage] = stages[stage];
        if (stages[stage]) reportedTrue[stage] += 1;
      }
      if (STAGES.every((s) => stages[s])) reportedComplete += 1;
      outputById.get(id).mentions.push({
        delivery: delivery.label,
        artifactSha256: delivery.sha256,
        reportedStages,
        acceptanceInferred: false,
      });
    }
    deliverySummaries.push({
      label: delivery.label,
      artifactSha256: delivery.sha256,
      mappedUniqueIds: mapping.size,
      batchIds: delivery.batchIds,
      reportedTrue,
      allFourReportedTrue: reportedComplete,
      stageClaimsAuthenticated: false,
    });
  }
  const mentioned = originalRows.filter((r) => r.mentions.length > 0);
  return {
    schemaVersion: 1,
    status: 'STRUCTURAL_DIAGNOSTIC_NOT_ACCEPTANCE',
    originalCount: originals.size,
    uniqueOriginalCount: originals.size,
    originalBatchCount: batches.length,
    originalSourcePointersVerified: originalRows.length,
    profile: {
      scope: histogram(originalRows, 'scope'),
      field: histogram(originalRows, 'missingField'),
      category: histogram(originalRows, 'category'),
      batch: histogram(originalRows, 'batchId'),
    },
    registerSnapshot: {
      statuses: histogram(register.records, 'status'),
      currentSemanticClosureCount: null,
      meaning:
        'Pinned stored snapshot only, not a fresh semantic audit of later deliveries',
    },
    coverage: {
      explicitlyMappedUniqueIds: mentioned.length,
      notMappedInSelectedDeliveries: originals.size - mentioned.length,
      idsMentionedByMultipleSelectedArtifacts: mentioned.filter(
        (r) => r.mentions.length > 1,
      ).length,
      unselectedOrUnmappedWorkMeansAbsent: false,
    },
    deliveries: deliverySummaries,
    authority: {
      sourceAdmitted: false,
      stagesAuthenticated: false,
      originalClosuresAuthorized: 0,
      rootRegisterWritten: false,
      runtimeConnected: false,
    },
    records: originalRows,
  };
}

/** Files are bounded and pinned before parse. No reference graph recursion. */
export function readPinnedJson(path, expectedSha256) {
  requireValue(
    typeof expectedSha256 === 'string' &&
      /^[0-9a-f]{64}$/u.test(expectedSha256),
    'PIN:SHA256_REQUIRED',
  );
  requireValue(
    statSync(path).isFile() && statSync(path).size <= MAX_BYTES,
    'PIN:FILE_SIZE',
  );
  const bytes = readFileSync(path);
  requireValue(
    bytes.length <= MAX_BYTES && hash(bytes) === expectedSha256,
    `PIN:MISMATCH:${path}`,
  );
  return {
    path,
    sha256: expectedSha256,
    bytes: bytes.length,
    document: JSON.parse(bytes.toString('utf8')),
  };
}

export function auditFromConfig(config) {
  const ledger = readPinnedJson(config.ledgerPath, BASELINE_PINS.ledger);
  const batches = readPinnedJson(config.batchesPath, BASELINE_PINS.batches);
  const register = readPinnedJson(config.registerPath, BASELINE_PINS.register);
  const sourceDocuments = new Map();
  for (const { originalSource: ref } of ledger.document.records) {
    if (!sourceDocuments.has(ref.path))
      sourceDocuments.set(ref.path, readPinnedJson(ref.path, ref.sha256));
  }
  requireValue(Array.isArray(config.deliveries), 'CONFIG:DELIVERIES_ARRAY');
  const deliveries = config.deliveries.map((entry) => {
    const artifact = readPinnedJson(entry.path, entry.sha256);
    return { ...entry, document: artifact.document };
  });
  const report = auditDocuments({
    ledger: ledger.document,
    batches: batches.document,
    register: register.document,
    sourceDocuments,
    deliveries,
  });
  report.inputPins = [
    ledger,
    batches,
    register,
    ...sourceDocuments.values(),
  ].map(({ path, sha256, bytes }) => ({ path, sha256, bytes }));
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    requireValue(
      process.argv.length === 3,
      'Usage: node tools/b-unknown2544-id-coverage.mjs CONFIG.json',
    );
    requireValue(statSync(process.argv[2]).size <= 65536, 'CONFIG:TOO_LARGE');
    const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(
      `${JSON.stringify(auditFromConfig(config), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
