import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A fixed, reviewed proposal distribution. Hashes establish byte identity only.
// Neither a hash match nor explicit candidate selection grants source authority.
const DISTRIBUTION_SHA256 =
  '03ce0e0764e636573a73d701d0682d1413d943b7c9d6f44ee97a798268437c06';
const SOURCE_SHA256 = Object.freeze({
  'parent/FREEZE.json':
    '82153c18e3d84dc4b0e21396fe9cd34b1bae97139cfc4256a33ac1e3c2c1f876',
  'parent/MANIFEST.json':
    '1e4d5530e7da6143c52e5c90abae93b064170e1d4bff664212a3947c31a2dbc3',
  'parent/OPENING_CANDIDATES.json':
    'abaf435e2802b853ea6215fdf986c47e430547d514ea81b36fed447f13e04060',
  'parent/PARAMETERS.json':
    '1761e427884dbe3f13392bbeef28937fead61a412355982cd7f268a4617dea27',
  'parent/SOURCE_PINS.json':
    '056898cbfb2994267040443860ac92aef828bd0bb1601966543fec5a2b2f67a8',
  'parent/input/wage-input.json':
    'efaeb578247e7cc0877b9dce7260f07531ff26fd62ed616c32706385836998cd',
  'parent/input/window-mapping.json':
    '3cfb5d03c4e4b516b01648289fa24804927bbc319213d5a772f167174326f457',
  'correction/FREEZE.json':
    'ea7be9558abd2c7c8f2dacb902cc04ebaa05973bd03ac135e063a34a3f6403ac',
  'correction/MANIFEST.json':
    '66a5c46238858fae506d446aaee26c2581e533bee2d716a7adb7b7ad5212ac24',
  'correction/BEFORE_OBLIGATION_OVERLAY.json':
    '64ec8cfaea38c304a02df7d4c0dbef4242b3d721a8a3ededeeb3d17d73dafcc2',
});
const DISTRIBUTION_URL = new URL(
  '../../data/scenario-candidates/single-social-office-demo-v1/opening-finance.json',
  import.meta.url,
);
const STALE_BEFORE_FIELDS = [
  'initialCommitments',
  'initialCashRestrictions',
  'emptyMeaning',
];

function sha256(utf8) {
  return createHash('sha256').update(utf8, 'utf8').digest('hex');
}

function freezeData(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

function unique(rows, predicate) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, 'exactly one explicit candidate required');
  return found[0];
}

function decodeDistribution(utf8) {
  assert.equal(typeof utf8, 'string', 'serialized UTF8 distribution required');
  assert.equal(
    sha256(utf8),
    DISTRIBUTION_SHA256,
    'distribution identity mismatch',
  );
  const distribution = JSON.parse(utf8);
  assert.equal(distribution.classification, 'DATA_NOT_AUTHENTICATED');
  assert.equal(distribution.sourceClass, 'SIMULATED_OPENING');
  assert.equal(distribution.selection, null);
  assert.equal(distribution.sourceAdmitted, false);
  assert.equal(distribution.activationAuthorized, false);
  assert.deepEqual(
    Object.keys(distribution.retainedSources).sort(),
    Object.keys(SOURCE_SHA256).sort(),
  );
  const sources = {};
  for (const [name, expected] of Object.entries(SOURCE_SHA256)) {
    const retained = distribution.retainedSources[name];
    assert.equal(typeof retained.utf8, 'string');
    assert.equal(retained.sha256, expected);
    assert.equal(sha256(retained.utf8), expected, 'retained source mismatch');
    assert.equal(Buffer.byteLength(retained.utf8, 'utf8'), retained.byteLength);
    sources[name] = JSON.parse(retained.utf8);
  }
  const parent = sources['parent/OPENING_CANDIDATES.json'];
  const parameters = sources['parent/PARAMETERS.json'];
  const correction = sources['correction/BEFORE_OBLIGATION_OVERLAY.json'];
  assert.equal(correction.selection, null);
  assert.equal(
    correction.consumerContract.missingOverlayOrUnknownSelector,
    'REJECT_NO_FALLBACK',
  );
  const overrides = [
    ['PARAMETERS.json', '/sharedBudgetRules'],
    ['OPENING_CANDIDATES.json', '/budgetRules'],
  ].flatMap(([file, prefix]) =>
    STALE_BEFORE_FIELDS.map((field) => ({
      file,
      pointer: `${prefix}/${field}`,
      disposition: 'INVALID_FOR_BEFORE_MUST_NOT_CONSUME',
      replacement:
        'selected authoritativeBeforeByVariant (required; no generic empty fallback)',
    })),
  );
  assert.deepEqual(correction.mandatoryOverrides, overrides);
  for (const [file, digest] of Object.entries(correction.parentSHA256)) {
    assert.equal(SOURCE_SHA256[`parent/${file}`], digest);
  }
  assert.equal(
    sources['parent/FREEZE.json'].manifestSHA256,
    SOURCE_SHA256['parent/MANIFEST.json'],
  );
  assert.equal(
    sources['correction/FREEZE.json'].manifestSHA256,
    SOURCE_SHA256['correction/MANIFEST.json'],
  );
  // Only embedded fixed names are inspected; manifest paths never cause file reads.
  for (const [name, retained] of Object.entries(distribution.retainedSources)) {
    const slash = name.indexOf('/');
    const group = name.slice(0, slash);
    const relative = name.slice(slash + 1);
    if (relative === 'FREEZE.json' || relative === 'MANIFEST.json') continue;
    const member = unique(
      sources[`${group}/MANIFEST.json`].members,
      (row) => row.path === relative,
    );
    assert.equal(member.sha256, retained.sha256);
    assert.equal(member.byteLength, retained.byteLength);
  }
  assert.equal(parent.openingVariants.length, 4);
  assert.equal(correction.authoritativeBeforeByVariant.length, 4);
  assert.equal(parent.wageOptions.length, 2);
  for (const variant of parent.openingVariants) {
    const before = unique(
      correction.authoritativeBeforeByVariant,
      (row) =>
        row.meaning === variant.meaning &&
        row.domainVariant === variant.domainVariant,
    );
    assert.equal(
      before.cashTradeObligationsTotal,
      variant.openingCashTradeObligations,
    );
    assert.equal(
      before.budgetBefore[0].committed,
      variant.openingBudgetChild.educationUsedOrCommitted,
    );
  }
  return { distribution, parent, parameters, correction };
}

/** Pure inspection of exact proposal bytes. It creates no ledger or activation. */
export function inspectOpeningFinanceData(distributionUtf8) {
  const { parent } = decodeDistribution(distributionUtf8);
  return freezeData({
    classification: 'DATA_NOT_AUTHENTICATED',
    sourceClass: 'SIMULATED_OPENING',
    status: 'PROPOSED_NOT_ADOPTED',
    distributionSHA256: DISTRIBUTION_SHA256,
    sourceSHA256: { ...SOURCE_SHA256 },
    selection: null,
    sourceAdmitted: false,
    activationAuthorized: false,
    variants: parent.openingVariants.map(({ meaning, domainVariant }) => ({
      meaning,
      domainVariant,
    })),
    financeOptionIds: parent.wageOptions.map(({ id }) => id),
  });
}

/** An explicit read view; the selector is a query, never an owner decision. */
export function selectOpeningFinanceCandidateData(distributionUtf8, selector) {
  const { parent, parameters, correction } =
    decodeDistribution(distributionUtf8);
  assert.ok(
    selector !== null &&
      typeof selector === 'object' &&
      !Array.isArray(selector),
  );
  assert.deepEqual(Object.keys(selector).sort(), [
    'domainVariant',
    'financeOptionId',
    'meaning',
  ]);
  const { meaning, domainVariant, financeOptionId } = selector;
  for (const value of [meaning, domainVariant, financeOptionId])
    assert.equal(typeof value, 'string');
  const variant = unique(
    parent.openingVariants,
    (row) => row.meaning === meaning && row.domainVariant === domainVariant,
  );
  const before = unique(
    correction.authoritativeBeforeByVariant,
    (row) => row.meaning === meaning && row.domainVariant === domainVariant,
  );
  const wageOption = unique(
    parent.wageOptions,
    (row) => row.id === financeOptionId,
  );
  const nonBeforeBudgetPolicy = { ...parent.budgetRules };
  for (const stale of STALE_BEFORE_FIELDS) delete nonBeforeBudgetPolicy[stale];
  const costRuleProjection =
    meaning === 'ACCRUAL'
      ? parent.coreCostRuleProjection.recommendedAccrual
      : parent.coreCostRuleProjection.alternativeOperatingValuation;
  return freezeData({
    classification: 'DATA_NOT_AUTHENTICATED',
    sourceClass: 'SIMULATED_OPENING',
    status: 'PROPOSED_NOT_ADOPTED',
    distributionSHA256: DISTRIBUTION_SHA256,
    sourceSHA256: { ...SOURCE_SHA256 },
    requestedCandidate: { meaning, domainVariant, financeOptionId },
    ownerSelectedOption: null,
    sourceAdmitted: false,
    activationAuthorized: false,
    scope: parent.scope,
    financialOpening: {
      positiveOpeningLegTemplates: variant.positiveOpeningLegTemplates,
      accountDescriptors: variant.accounts,
      zeroDescriptorsNotLedgerBefore: variant.zeroDescriptorsNotLedgerBefore,
    },
    openingBefore: before,
    wageOption,
    payrollRuleProposal: parent.payrollRuleProposal,
    nonWageEnvelopeCaps: parameters.nonWageEnvelopeCaps,
    nonBeforeBudgetPolicy,
    openingFunding: parent.openingFunding,
    costRuleProjection,
    costRuleContractStatus: 'PROPOSAL_REQUIRES_FINAL_MATCHING_C_CONTRACT',
    registrationOrPaymentAuthorized: false,
  });
}

/** Fixed packaged file only; arbitrary caller paths are never accepted. */
export function readOpeningFinanceDistribution() {
  assert.equal(arguments.length, 0, 'path overrides are forbidden');
  const utf8 = readFileSync(DISTRIBUTION_URL, 'utf8');
  inspectOpeningFinanceData(utf8);
  return utf8;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.deepEqual(
      process.argv.slice(2),
      ['--check'],
      'only --check is supported',
    );
    console.log(
      JSON.stringify(
        inspectOpeningFinanceData(readOpeningFinanceDistribution()),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
