import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BATCH_FIELDS,
  buildIntake,
  atPointer,
  digest,
  readPinnedJson,
} from './intake.mjs';

// TEST_ONLY inputs below cannot enter the pinned production-ledger CLI.
function fixture() {
  const records = [],
    batches = [],
    source = { fields: [] };
  for (const [batchId, fields] of Object.entries(BATCH_FIELDS)) {
    const stableIds = [];
    for (const [missingField, count] of Object.entries(fields)) {
      for (let i = 0; i < count; i++) {
        const scope =
          missingField === 'canonicalObligations' ? 'ENTITY' : 'COUNTRY';
        const ownerId = `${scope}_${i}`;
        const stableId = `U2544::${scope}::${ownerId}::${missingField}`;
        const before = {
          status: 'UNKNOWN',
          value: null,
          unit: 'TEST_ONLY',
          gapId: missingField,
        };
        const pointer = `/fields/${source.fields.length}`;
        source.fields.push(before);
        records.push({
          stableId,
          scope,
          ownerId,
          countryId: 'TEST_ONLY',
          missingField,
          rootCause: batchId,
          before,
          originalUnit: 'TEST_ONLY',
          originalGapId: missingField,
          originalSource: { pointer },
          dependencies: [],
          completionMethod: 'TEST_ONLY',
          acceptanceRule: 'TEST_ONLY',
        });
        stableIds.push(stableId);
      }
    }
    batches.push({
      batchId,
      rootCause: batchId,
      fieldCounts: fields,
      stableIds,
      originalFieldCount: stableIds.length,
    });
  }
  return { batches, ledger: { records }, source };
}
const build = (f) => buildIntake(f.batches, f.ledger, () => f.source);

test('840 IDs preserve null and do not claim any completion phase', () => {
  const result = build(fixture());
  assert.equal(result.records.length, 840);
  assert.deepEqual(result.batchCounts, {
    B02: 70,
    B03: 140,
    B04: 70,
    B08: 560,
  });
  assert.ok(
    result.records.every(
      (r) =>
        r.candidateValue === null &&
        r.sourceObservedField.value === null &&
        Object.values(r.phases).every((s) => s === 'NOT_ESTABLISHED'),
    ),
  );
  assert.equal(result.originalFieldClosuresClaimed, 0);
});
test('duplicate assigned ID fails', () => {
  const f = fixture();
  f.batches[0].stableIds[1] = f.batches[0].stableIds[0];
  assert.throws(() => build(f), /DUPLICATE_ASSIGNED_ID/);
});
test('foreign stable ID fails', () => {
  const f = fixture();
  f.batches[0].stableIds[0] = 'FOREIGN';
  assert.throws(() => build(f), /FOREIGN_STABLE_ID/);
});
test('duplicate baseline and root-cause mismatch fail', () => {
  const f = fixture();
  f.ledger.records.push(f.ledger.records[0]);
  assert.throws(() => build(f), /DUPLICATE_LEDGER_ID/);
  const g = fixture();
  g.ledger.records[0].rootCause = 'OTHER';
  assert.throws(() => build(g), /ROOT_CAUSE_MISMATCH/);
});
test('missing source pointer is not empty/zero', () => {
  assert.throws(() => atPointer({}, '/absent'), /SOURCE_POINTER_MISSING/);
  assert.throws(() => atPointer({ a: 1 }, '/a~2'), /INVALID_POINTER_ESCAPE/);
  assert.equal(atPointer({ 'a/b': { '~': null } }, '/a~1b/~0'), null);
});
test('changed field semantics fail', () => {
  const f = fixture();
  f.source.fields[0] = { ...f.source.fields[0], unit: 'WRONG' };
  assert.throws(() => build(f), /FIELD_SEMANTICS_CHANGED/);
});
test('missing batch and changed field count fail', () => {
  const f = fixture();
  f.batches.pop();
  assert.throws(() => build(f), /BATCH_MISSING_OR_DUPLICATED/);
  const g = fixture();
  g.batches[0].originalFieldCount++;
  assert.throws(() => build(g), /BATCH_COUNT_MISMATCH/);
});
test('source bytes are pinned; symlinks and directories rejected before parsing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'econmind-d-intake-'));
  const file = join(directory, 'test.json');
  const bytes = Buffer.from('{"testOnly":true}');
  writeFileSync(file, bytes);
  assert.deepEqual(readPinnedJson(file, digest(bytes), bytes.length), {
    testOnly: true,
  });
  assert.throws(
    () => readPinnedJson(file, '0'.repeat(64)),
    /SOURCE_HASH_MISMATCH/,
  );
  assert.throws(
    () => readPinnedJson(file, digest(bytes), bytes.length + 1),
    /SOURCE_SIZE_MISMATCH/,
  );
  symlinkSync(file, join(directory, 'link'));
  assert.throws(() => readPinnedJson(join(directory, 'link'), digest(bytes)));
  assert.throws(
    () => readPinnedJson(directory, digest(bytes)),
    /SOURCE_NOT_REGULAR_FILE/,
  );
});
