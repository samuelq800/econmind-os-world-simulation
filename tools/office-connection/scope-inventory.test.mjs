import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { after, test } from 'node:test';
import {
  buildScopeInventory,
  classifySourceHit,
  collectRecordedTests,
  indexSources,
  reviewedFieldConnections,
} from './scope-inventory.mjs';

const temp = mkdtempSync(resolve(tmpdir(), 'office-scope-inventory-'));
after(() => rmSync(temp, { recursive: true, force: true }));
test('retains every required module/input/readout and never counts supplemental Finance facts as catalog acceptance', () => {
  const inventory = buildScopeInventory();
  assert.deepEqual(
    ['MODULE_ACTION', 'INPUT_FIELD', 'RESULT_READOUT'].map(
      (kind) => inventory.itemRows.filter((row) => row.kind === kind).length,
    ),
    [120, 1126, 158],
  );
  assert.equal(inventory.itemRows.length, 1404);
  assert.equal(inventory.denominators.countryCatalogInstances, 98280);
  assert.equal(new Set(inventory.itemRows.map(({ id }) => id)).size, 1404);
  for (const row of inventory.itemRows) {
    assert.equal(row.acceptance, 'UNKNOWN_NOT_EXECUTED_AS_A_CATALOG_ITEM');
    assert.match(row.page.staticRenderer.sha256, /^[0-9a-f]{64}$/u);
    for (const link of ['command', 'api', 'sql']) {
      if (row.reviewedConnection) {
        assert.equal(row.kind, 'INPUT_FIELD');
        assert.equal(
          row.links[link].status,
          'IMPLEMENTED_UNVERIFIED_LIMITED_CONTRACT',
        );
        assert.match(row.links[link].reference.sha256, /^[0-9a-f]{64}$/u);
        assert.equal(
          row.reviewedConnection.runtimeAcceptance,
          'NOT_EXECUTED_BY_INVENTORY',
        );
      } else {
        assert.match(row.links[link].status, /^UNKNOWN_/u);
        assert.equal(row.links[link].reference, null);
      }
    }
  }
  assert.equal(inventory.reviewedCatalogFieldConnections.inputFieldCount, 8);
  assert.equal(
    inventory.itemRows.filter((r) => r.reviewedConnection).length,
    8,
  );
  assert.equal(
    inventory.reviewedCatalogFieldConnections.moduleActionsCompleted,
    0,
  );
  assert.deepEqual(
    inventory.reviewedCatalogFieldConnections.fields
      .map((r) => r.fieldKey)
      .sort(),
    [
      'industry-u0283-0',
      'industry-u0283-1',
      'social-u0933-0',
      'social-u0933-1',
      'social-u0933-2',
      'social-u0934-0',
      'social-u0934-1',
      'social-u0934-2',
    ],
  );
  assert.equal(inventory.supplementalMainFields.catalogPolicyInputs, 0);
  assert.equal(inventory.supplementalMainFields.catalogReadouts, 0);
  assert.equal(inventory.supplementalMainFields.readonlySlots, 10);
  assert.equal(
    inventory.itemRows.find(
      ({ id }) => id === 'field:captain-1:captain-u0347-0',
    ).page.selector,
    '[data-field="captain-u0347-0"]',
  );
  assert.equal(
    inventory.itemRows.find(
      ({ id }) => id === 'field:captain-1:captain-u0347-0',
    ).page.immersiveSelector,
    '[data-cmd="field-choice"][data-id="captain-u0347-0"]',
  );
  assert.equal(
    inventory.itemRows.find(({ id }) => id === 'module:captain-1').page
      .selector,
    '[data-module-card="captain-1"]',
  );
  assert.equal(
    inventory.itemRows.find(({ id }) => id === 'readout:captain-1:0').page
      .selector,
    '[data-readout="CAPTAIN-U0355"]',
  );
});
test('exact token navigation does not turn context or a longer unrelated ID into field binding', () => {
  mkdirSync(resolve(temp, 'apps/world-web/src'), { recursive: true });
  writeFileSync(
    resolve(temp, 'apps/world-web/src/example.ts'),
    "const context=['finance-11']; const unrelated='finance-110';\nconst unknown='mock';\n",
  );
  const result = indexSources(temp, ['finance-11']);
  assert.equal(result.hits.get('finance-11').length, 1);
  assert.equal(
    result.hits.get('finance-11')[0].meaning,
    'LEXICAL_REFERENCE_ONLY',
  );
  assert.equal(
    result.classifiedHits[0].classification,
    'PRODUCT_SOURCE_REQUIRES_CONTEXT_NOT_CONFIRMED_DEFECT',
  );
});
test('separates actual recorded assertions from file/job counts, preserves fail/skip and does not infer new-commit acceptance', () => {
  const testPath = 'tests/world-api/example.test.ts';
  writeFileSync(
    resolve(temp, 'vitest.json'),
    JSON.stringify({
      testResults: [
        {
          name: `/old-tree/${testPath}`,
          status: 'failed',
          assertionResults: [
            { status: 'passed' },
            { status: 'failed' },
            { status: 'pending' },
          ],
        },
      ],
    }),
  );
  const { recorded } = collectRecordedTests(
    [temp],
    [testPath, 'tests/world-api/example.test.tsx'],
  );
  assert.deepEqual(recorded.get(testPath)[0].assertionStatusCounts, {
    passed: 1,
    failed: 1,
    pending: 1,
  });
  assert.equal(recorded.get(testPath)[0].recordedSuiteStatus, 'failed');
  assert.match(recorded.get(testPath)[0].sourceCommitBinding, /^UNKNOWN_/u);
  assert.equal(recorded.get('tests/world-api/example.test.tsx').length, 0);
});
test('classifies normal tests and explicit rehearsal apart from potential product gaps', () => {
  assert.equal(
    classifySourceHit('tests/example.test.ts', 'mock()'),
    'TEST_FIXTURE_OR_ASSERTION',
  );
  assert.equal(
    classifySourceHit(
      'apps/world-web/public/season1-immersive/game.js',
      'fixed cash',
    ),
    'LOCAL_REHEARSAL_PRODUCT_SURFACE_NOT_WORLD_SETTLEMENT',
  );
  assert.equal(
    classifySourceHit(
      'apps/world-worker/src/source.ts',
      'sourceAdmitted: false',
    ),
    'EXPLICIT_UNAVAILABLE_OR_REFUSAL_REQUIRES_CONTEXT',
  );
});

test('reviewed field mappings fail on DTO or SQL-anchor drift instead of blessing another contract', () => {
  const target = resolve(temp, 'reviewed-connection-drift');
  const reviewed = reviewedFieldConnections();
  const refs = reviewed.flatMap((r) => [
    r.mapping,
    ...Object.values(r.references),
  ]);
  for (const { path } of refs) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true });
    writeFileSync(resolve(target, path), readFileSync(resolve(path)));
  }
  assert.equal(reviewedFieldConnections(target).length, 8);
  const mapping = 'apps/world-web/src/industry-run/form.ts';
  const original = readFileSync(resolve(target, mapping), 'utf8');
  writeFileSync(
    resolve(target, mapping),
    original.replace(
      "'industry-u0283-1': 'targetPercent'",
      "'industry-u0283-1': 'quantity'",
    ),
  );
  assert.throws(
    () => reviewedFieldConnections(target),
    /REVIEWED_FIELD_MAPPING_REVIEW_REQUIRED/u,
  );
  writeFileSync(resolve(target, mapping), original);
  const sql = 'database/proposals/postwar-pending-programme-target-prefix.sql';
  writeFileSync(
    resolve(target, sql),
    readFileSync(resolve(target, sql), 'utf8').replace(
      'create function world_v2.postwar_social_programme_effect_scoped',
      'create function world_v2.REMOVED_TEST_ONLY',
    ),
  );
  assert.throws(
    () => reviewedFieldConnections(target),
    /REVIEWED_FIELD_CONNECTION_DRIFT/u,
  );
});
