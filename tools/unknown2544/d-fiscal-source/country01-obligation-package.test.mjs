import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from './intake.mjs';
import { contentHash } from './produce-candidate.mjs';
import {
  COUNTRY01_OBLIGATION_IDS,
  writeCountry01ObligationPackage,
  consumeCountry01ObligationPackage,
  consumeTestOnlyObligationCosts,
} from './country01-obligation-package.mjs';

const directories = [];
after(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});
function saved(value) {
  const dir = mkdtempSync(join(tmpdir(), 'd-b08-subset-'));
  directories.push(dir);
  const path = join(dir, 'input.json');
  const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(path, bytes, { flag: 'wx' });
  return { path, sha256: digest(bytes), bytes: bytes.length };
}
function row(id = '1', classification = 'MANDATORY_NON_DEBT') {
  return {
    obligationId: `TEST_ONLY_OBLIGATION_${id}`,
    component: 'TEST_ONLY_COST',
    payerId: 'TEST_ONLY_GOV',
    currency: 'XAA',
    period: 'TEST_ONLY_PERIOD',
    classification,
    nativeAmount: '100.25',
    settledNative: '0.25',
    settlementEvidence: 'TEST_ONLY_DECLARED_SETTLEMENT',
    legalBasisRef: 'TEST_ONLY_CONTRACT',
    commitmentRef: 'TEST_ONLY_COMMITMENT',
    costAtoms: [`TEST_ONLY_ATOM_${id}`],
    includesAtoms: [],
  };
}
function fixture(change = () => {}) {
  const v = {
    schemaVersion: 'd-test-only-obligation-costs-v1',
    evidenceClass: 'TEST_ONLY',
    countryId: 'TEST_ONLY_COUNTRY',
    payerId: 'TEST_ONLY_GOV',
    currency: 'XAA',
    period: 'TEST_ONLY_PERIOD',
    rows: [row()],
    coverage: {
      kind: 'TEST_ONLY_ENUMERATED_UNIVERSE',
      creationRef: 'TEST_ONLY_ORIGIN',
      keys: ['TEST_ONLY_OBLIGATION_1/TEST_ONLY_COST'],
    },
  };
  change(v);
  return v;
}
const consume = (v) => consumeTestOnlyObligationCosts(saved(v));

test('isolated file consumer uses exact strings and excludes debt from non-debt totals', () => {
  const v = fixture((x) => {
    x.rows.push(row('2', 'COMMITTED_DISCRETIONARY'), row('3', 'DEBT_SERVICE'));
    x.coverage.keys = x.rows.map((r) => `${r.obligationId}/${r.component}`);
  });
  const r = consume(v);
  assert.equal(r.status, 'TEST_ONLY_CALCULATED_NOT_SETTLEMENT');
  assert.deepEqual(r.candidateTestTotals, {
    mandatoryNonDebtNative: '100',
    committedDiscretionaryNative: '100',
  });
  assert.equal(r.actualFieldValues, null);
  assert.equal(r.originalFieldClosuresClaimed, 0);
  assert.equal(r.productionAuthority, false);
});
test('complete synthetic empty universe is distinct from absent coverage', () => {
  const v = fixture((x) => {
    x.rows = [];
    x.coverage.keys = [];
  });
  assert.equal(consume(v).candidateTestTotals.mandatoryNonDebtNative, '0');
  v.coverage = null;
  assert.equal(consume(v).candidateTestTotals.mandatoryNonDebtNative, null);
});
test('missing settled history stays null, not zero', () => {
  const r = consume(
    fixture((x) => {
      x.rows[0].settledNative = null;
    }),
  );
  assert.equal(r.status, 'BLOCKED_COVERAGE_OR_SETTLED_HISTORY');
  assert.equal(r.candidateTestTotals.mandatoryNonDebtNative, null);
});
for (const [name, change, error] of [
  [
    'duplicate obligation/component',
    (v) => v.rows.push(structuredClone(v.rows[0])),
    'DUPLICATE_OBLIGATION_COMPONENT',
  ],
  [
    'mixed currency',
    (v) => {
      v.rows[0].currency = 'XAB';
    },
    'PAYER_CURRENCY_MISMATCH',
  ],
  [
    'wrong payer',
    (v) => {
      v.rows[0].payerId = 'TEST_ONLY_CB';
    },
    'PAYER_CURRENCY_MISMATCH',
  ],
  [
    'mixed period',
    (v) => {
      v.rows[0].period = 'TEST_ONLY_OTHER';
    },
    'PERIOD_MISMATCH',
  ],
  [
    'unquoted number',
    (v) => {
      v.rows[0].nativeAmount = 100.25;
    },
    'QUOTED_EXACT_AMOUNT_REQUIRED',
  ],
  [
    'noncanonical decimal',
    (v) => {
      v.rows[0].nativeAmount = '100.250';
    },
    'QUOTED_EXACT_AMOUNT_REQUIRED',
  ],
  [
    'overpayment',
    (v) => {
      v.rows[0].settledNative = '101';
    },
    'SETTLED_EXCEEDS_OBLIGATION',
  ],
  [
    'unknown classification',
    (v) => {
      v.rows[0].classification = 'UNKNOWN';
    },
    'CLASSIFICATION_UNKNOWN',
  ],
  [
    'missing settlement evidence',
    (v) => {
      v.rows[0].settlementEvidence = null;
    },
    'SETTLEMENT_EVIDENCE_REQUIRED',
  ],
  [
    'actual scope cannot enter synthetic consumer',
    (v) => {
      v.countryId = 'COUNTRY_01';
    },
    'TEST_ONLY_SCOPE_REQUIRED',
  ],
  [
    'actual legal identifier',
    (v) => {
      v.rows[0].legalBasisRef = 'LEGAL_01';
    },
    'TEST_ONLY_LEGAL_BINDING_REQUIRED',
  ],
  [
    'inclusive service price plus included input',
    (v) => {
      v.rows[0].includesAtoms = ['TEST_ONLY_ENERGY'];
      const r = row('2');
      r.costAtoms = ['TEST_ONLY_ENERGY'];
      v.rows.push(r);
    },
    'PACKAGE_PRICE_INPUT_COST_OVERLAP',
  ],
  [
    'same cost atom twice',
    (v) => {
      const r = row('2');
      r.costAtoms = ['TEST_ONLY_ATOM_1'];
      v.rows.push(r);
    },
    'DUPLICATE_COST_ATOM',
  ],
  [
    'same included cost twice',
    (v) => {
      v.rows[0].includesAtoms = ['TEST_ONLY_ENERGY', 'TEST_ONLY_ENERGY'];
    },
    'DUPLICATE_INCLUSIVE_COST',
  ],
])
  test(`reject ${name}`, () =>
    assert.throws(() => consume(fixture(change)), new RegExp(error)));
test('coverage omitting a row cannot manufacture a complete sum', () => {
  const r = consume(
    fixture((v) => {
      v.coverage.keys = [];
    }),
  );
  assert.equal(r.candidateTestTotals.mandatoryNonDebtNative, null);
});
test('duplicate coverage keys cannot manufacture completeness', () => {
  const r = consume(
    fixture((v) => {
      v.coverage.keys.push(v.coverage.keys[0]);
    }),
  );
  assert.equal(r.candidateTestTotals.mandatoryNonDebtNative, null);
});
test('tampered disk file rejected before consumption', () => {
  const pin = saved(fixture());
  writeFileSync(pin.path, '{}');
  assert.throws(
    () => consumeTestOnlyObligationCosts(pin),
    /SOURCE_SIZE_MISMATCH|SOURCE_HASH_MISMATCH/,
  );
});
test('closed exact eight-ID subset: five entities and three country fields', () => {
  assert.equal(COUNTRY01_OBLIGATION_IDS.length, 8);
  assert.equal(new Set(COUNTRY01_OBLIGATION_IDS).size, 8);
  assert.equal(
    COUNTRY01_OBLIGATION_IDS.filter((id) => id.includes('::ENTITY::')).length,
    5,
  );
});

const real = process.env.ECONMIND_D_COUNTRY01_INPUT;
test(
  'actual source package is written, independently reread and source-reconstructed; all eight IDs stay blocked',
  { skip: !real },
  () => {
    const input = JSON.parse(readFileSync(real, 'utf8'));
    const dir = mkdtempSync(join(tmpdir(), 'd-b08-actual-'));
    directories.push(dir);
    const path = join(dir, 'package.json');
    const value = writeCountry01ObligationPackage(input, path);
    assert.equal(value.parentBatch, 'B08');
    assert.equal(value.parentBatchOriginalIdCount, 560);
    assert.equal(value.subsetOriginalIdCount, 8);
    assert.deepEqual(value.subsetStableIds, COUNTRY01_OBLIGATION_IDS);
    const bytes = readFileSync(path);
    const result = consumeCountry01ObligationPackage({
      path,
      bytes: bytes.length,
      sha256: digest(bytes),
    });
    assert.equal(result.sourceReconstructionMatched, true);
    assert.equal(result.status, 'BLOCKED_INCOMPLETE_ADOPTED_REGISTER');
    assert.equal(result.knownSourceCoupons.length, 2);
    assert.equal(result.records.length, 8);
    assert(result.records.every((r) => r.value === null));
    assert(
      value.entityCoverage.every(
        (r) => r.completeRegister === null && r.settledHistory === null,
      ),
    );
    assert.equal(value.entityCoverage[4].selectedPayerFactKeys.length, 0);
    assert.equal(value.entityCoverage[4].selectedCreditorWitnessKeys.length, 2);
    assert.throws(() => writeCountry01ObligationPackage(input, path), /EEXIST/);
    for (const mutate of [
      (v) => {
        v.records[0].candidateValue = [];
      },
      (v) => {
        v.countryCoverage.completeRegister = true;
      },
      (v) => {
        v.records.pop();
      },
      (v) => {
        v.facts.push(structuredClone(v.facts[0]));
      },
      (v) => {
        v.productionAuthority = true;
      },
    ]) {
      const altered = structuredClone(value);
      mutate(altered);
      const { packageHash: ignored, ...body } = altered;
      void ignored;
      altered.packageHash = contentHash(body);
      assert.throws(
        () => consumeCountry01ObligationPackage(saved(altered)),
        /PACKAGE_NOT_ORIGINAL_SOURCE_RECONSTRUCTION/,
      );
    }
  },
);
