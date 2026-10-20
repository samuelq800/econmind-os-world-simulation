import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  atPointer,
  auditDocuments,
  readPinnedJson,
  STAGES,
} from './b-unknown2544-id-coverage.mjs';

function fixture() {
  const fields = ['minimum', 'cost'];
  const records = fields.map((missingField, index) => ({
    stableId: `U2544::COUNTRY::COUNTRY_01::${missingField}`,
    scope: 'COUNTRY',
    ownerId: 'COUNTRY_01',
    missingField,
    rootCause: 'RC_COST',
    category: 'FORMULA_DERIVATION_CONDITIONAL',
    acceptanceRule: 'Exact original evidence, units and period required',
    afterActualField: {
      status: 'UNKNOWN',
      value: null,
      unit: 'UNIT',
      currency: null,
    },
    originalSource: {
      path: '/fixture/source.json',
      sha256: 'a'.repeat(64),
      bytes: 123,
      pointer: `/items/${index}`,
    },
  }));
  return {
    expectedCount: 2,
    ledger: { records },
    batches: [
      {
        batchId: 'B10',
        rootCause: 'RC_COST',
        originalFieldCount: 2,
        stableIds: records.map((r) => r.stableId),
      },
    ],
    register: {
      records: records.map((r) => ({ stableId: r.stableId, status: 'OPEN' })),
    },
    sourceDocuments: new Map([
      [
        '/fixture/source.json',
        {
          sha256: 'a'.repeat(64),
          bytes: 123,
          document: {
            items: records.map((r) => structuredClone(r.afterActualField)),
          },
        },
      ],
    ]),
    deliveries: [],
  };
}
function delivery(f, label = 'offline') {
  return {
    label,
    sha256: 'b'.repeat(64),
    rowsPointer: '/records',
    batchIds: ['B10'],
    document: {
      records: f.ledger.records.map((r) => ({
        stableId: r.stableId,
        field: r.missingField,
        ...Object.fromEntries(STAGES.map((s) => [s, false])),
      })),
    },
  };
}

test('complete original partition and source pointers produce diagnostics, never acceptance', () => {
  const f = fixture();
  const before = structuredClone(f);
  const result = auditDocuments(f);
  assert.equal(result.originalCount, 2);
  assert.equal(result.originalSourcePointersVerified, 2);
  assert.equal(result.coverage.explicitlyMappedUniqueIds, 0);
  assert.equal(result.registerSnapshot.currentSemanticClosureCount, null);
  assert.equal(result.authority.originalClosuresAuthorized, 0);
  assert.equal(result.authority.stagesAuthenticated, false);
  assert.deepEqual(f, before);
});

test('exact explicit per-ID mapping is distinct from four-stage field completion', () => {
  const f = fixture();
  f.deliveries.push(delivery(f));
  const r = auditDocuments(f);
  assert.equal(r.coverage.explicitlyMappedUniqueIds, 2);
  assert.deepEqual(Object.values(r.deliveries[0].reportedTrue), [0, 0, 0, 0]);
  assert.equal(r.records[0].independentlyAcceptedStages, null);
});

test('overlapping versions are not summed as additional original coverage', () => {
  const f = fixture();
  f.deliveries.push(delivery(f, 'v1'), delivery(f, 'v2'));
  const r = auditDocuments(f);
  assert.equal(r.coverage.explicitlyMappedUniqueIds, 2);
  assert.equal(r.coverage.idsMentionedByMultipleSelectedArtifacts, 2);
});

test('producer stage claims and stored CLOSED register flags cannot authenticate acceptance', () => {
  const f = fixture();
  f.register.records[0].status = 'CLOSED';
  const d = delivery(f);
  for (const row of d.document.records)
    for (const stage of STAGES) row[stage] = true;
  f.deliveries.push(d);
  const r = auditDocuments(f);
  assert.equal(r.deliveries[0].allFourReportedTrue, 2);
  assert.equal(r.deliveries[0].stageClaimsAuthenticated, false);
  assert.equal(r.registerSnapshot.currentSemanticClosureCount, null);
  assert.equal(r.authority.originalClosuresAuthorized, 0);
});

test('engineering can be built before facts exist; axes are not a fabricated linear completion prefix', () => {
  const f = fixture();
  const d = delivery(f);
  d.document.records[0].engineeringWired = true;
  f.deliveries.push(d);
  const r = auditDocuments(f);
  assert.equal(r.deliveries[0].reportedTrue.engineeringWired, 1);
  assert.equal(r.deliveries[0].reportedTrue.sourceComplete, 0);
});

test('nested stages require explicit pointer, never inferred from candidateEngineering', () => {
  const f = fixture();
  const d = delivery(f);
  d.document.records = d.document.records.map((row) => ({
    stableId: row.stableId,
    phases: Object.fromEntries(STAGES.map((s) => [s, false])),
    candidateEngineering: { implemented: true, tested: true },
  }));
  f.deliveries.push(d);
  assert.throws(() => auditDocuments(f), /STAGE_TYPE/);
  d.stagesPointer = '/phases';
  assert.equal(
    auditDocuments(f).deliveries[0].reportedTrue.validationPassed,
    0,
  );
});

const corruptions = [
  [
    'duplicate ledger',
    (f) => f.ledger.records.push(f.ledger.records[0]),
    /LEDGER:DUPLICATE/,
  ],
  [
    'stable ID identity mismatch',
    (f) => {
      f.ledger.records[0].ownerId = 'COUNTRY_02';
    },
    /LEDGER:IDENTITY/,
  ],
  [
    'duplicate batch membership',
    (f) => {
      f.batches[0].stableIds[1] = f.batches[0].stableIds[0];
    },
    /BATCH:DUPLICATE/,
  ],
  [
    'missing batch member',
    (f) => {
      f.batches[0].stableIds.pop();
      f.batches[0].originalFieldCount = 1;
    },
    /BATCH:MISSING/,
  ],
  [
    'foreign batch ID',
    (f) => {
      f.batches[0].stableIds[0] = 'FOREIGN';
    },
    /BATCH:FOREIGN/,
  ],
  [
    'changed root cause',
    (f) => {
      f.batches[0].rootCause = 'OTHER';
    },
    /BATCH:ROOT_CAUSE/,
  ],
  [
    'duplicate register',
    (f) => f.register.records.push(f.register.records[0]),
    /REGISTER:DUPLICATE/,
  ],
  [
    'foreign register record',
    (f) => {
      f.register.records[0].stableId = 'FOREIGN';
    },
    /REGISTER:FOREIGN/,
  ],
  [
    'changed source pin',
    (f) => {
      f.sourceDocuments.values().next().value.sha256 = 'c'.repeat(64);
    },
    /SOURCE:PIN/,
  ],
  [
    'missing original source pointer',
    (f) => {
      f.ledger.records[0].originalSource.pointer = '/items/3';
    },
    /POINTER_MISSING/,
  ],
  [
    'null silently replaced with zero',
    (f) => {
      f.sourceDocuments.values().next().value.document.items[0].value = 0;
    },
    /SOURCE:LEAF/,
  ],
  [
    'missing original acceptance',
    (f) => {
      f.ledger.records[0].acceptanceRule = '';
    },
    /ACCEPTANCE_REQUIRED/,
  ],
];
for (const [name, mutate, expected] of corruptions) {
  test(`rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => auditDocuments(f), expected);
  });
}

test('delivery duplicates, foreign IDs, partial scope, bad stage types and changed original standards reject', () => {
  const cases = [
    (d) => d.document.records.push(d.document.records[0]),
    (d) => {
      d.document.records[0].stableId = 'FOREIGN';
    },
    (d) => d.document.records.pop(),
    (d) => {
      d.document.records[0].sourceComplete = 'false';
    },
    (d) => {
      delete d.document.records[0].validationPassed;
    },
    (d) => {
      d.document.records[0].originalAcceptanceRule = 'tests alone';
    },
    (d) => {
      d.document.records[0].batchId = 'B99';
    },
    (d) => {
      d.batchIds = ['B99'];
    },
  ];
  for (const mutate of cases) {
    const f = fixture();
    const d = delivery(f);
    mutate(d);
    f.deliveries.push(d);
    assert.throws(() => auditDocuments(f));
  }
});

test('RFC6901 preserves escaped tokens, own keys, zero and null', () => {
  assert.equal(atPointer({ 'a/b': { '~': [0, null] } }, '/a~1b/~0/0'), 0);
  assert.equal(atPointer({ 'a/b': { '~': [0, null] } }, '/a~1b/~0/1'), null);
  assert.equal(atPointer({ '': 4 }, '/'), 4);
  assert.deepEqual(atPointer({ a: 1 }, ''), { a: 1 });
  for (const pointer of ['/toString', '/a/00', '/a/-', '/a/~2', 'a', '/a/2']) {
    assert.throws(() => atPointer({ a: [0, null] }, pointer));
  }
});

test('readPinnedJson verifies actual bytes before parse, not caller labels', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'b-u2544-pin-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'source.json');
  const bytes = Buffer.from('{"value":null}');
  writeFileSync(file, bytes, { flag: 'wx' });
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(readPinnedJson(file, digest).document.value, null);
  assert.throws(() => readPinnedJson(file, 'c'.repeat(64)), /PIN:MISMATCH/);
  assert.throws(() => readPinnedJson(file, 'not-a-hash'), /SHA256_REQUIRED/);
});
