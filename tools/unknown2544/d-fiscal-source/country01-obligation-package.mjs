import { writeFileSync } from 'node:fs';
import { atPointer, readPinnedJson, LEDGER_SHA, BATCH_SHA } from './intake.mjs';
import { canonical, contentHash } from './produce-candidate.mjs';
import { extractContractCouponFact } from './extract-contract-coupon-fact.mjs';
import {
  exactDecimalAdd,
  exactDecimalSubtract,
} from '../../../packages/testkit/src/exact-decimal-oracle.ts';

const MANIFEST =
  '5735bb398ad9175796dca77059c3fb39738acf9ee89709dcfccb30eefdd050ae';
const RULES =
  '7a5059333ef542e4b5766136ca5156022a52eb0f231d4b9b9efe99af45464801';
const DECISIONS =
  '2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e';
const RULE_INDEX =
  '84add9918ff3857556199a9ef96a6354fe310eea3679bc62714fc342ee410a2e';
const COUPON_SOURCE_PINS = {
  terms: 'a7d6aaa0a21af0b006fcbc209dd0de7f338ae89924d3c63e6a7c9f241e540dc7',
  positions: '22e0a293f9edbbdd28684c6c6c0c68c4621855b06a44fb17bd1bbda19b9fdfe3',
  schedule: '126901ac027c4ba9cd65e36f41c7749462a8b76a79daeb21a3eeb4da17518f1a',
  finance: '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
  entities: 'd53e64a28110ea3615d42be03fc740a2fe72b55e6aeb5d4a584f5d2c117a6593',
};
const ENTITIES = [
  'GOVERNMENT',
  'OPERATOR',
  'HOUSEHOLDS',
  'BANK',
  'CENTRAL_BANK',
];
const ALIASES = [
  'GOV-01',
  'OP-01',
  'HOUSEHOLDS-01',
  'BANK-01',
  'CENTRAL-BANK-01',
];
const FIELDS = [
  'mandatoryClassification',
  'mandatoryNonDebtNative',
  'committedDiscretionaryNative',
];
export const COUNTRY01_OBLIGATION_IDS = Object.freeze([
  ...FIELDS.map((field) => `U2544::COUNTRY::COUNTRY_01::${field}`),
  ...ENTITIES.map(
    (entity) => `U2544::ENTITY::ENTITY_${entity}_01::canonicalObligations`,
  ),
]);
const FLAGS = {
  productionAuthority: false,
  sourceAdmitted: false,
  runtimeConnected: false,
  actualPayment: false,
};
const need = (condition, code) => {
  if (!condition) throw new Error(code);
};
const equal = (a, b) => canonical(a) === canonical(b);
const pinRead = (pin, expected = pin?.sha256) => {
  need(pin?.sha256 === expected, 'UNEXPECTED_SOURCE_PIN');
  return readPinnedJson(pin.path, pin.sha256, pin.bytes);
};
const seal = (body) => ({ ...body, packageHash: contentHash(body) });

/** Closed first-country readset. No issuer/adoption hook, registry or runtime port. */
export function buildCountry01ObligationPackage(input) {
  need(
    input?.schemaVersion === 'd-country01-obligation-input-v1',
    'INPUT_SCHEMA',
  );
  const manifest = pinRead(input.deliveryManifest, MANIFEST);
  const ledger = pinRead(input.ledger, LEDGER_SHA);
  const batches = pinRead(input.batches, BATCH_SHA);
  const rules = pinRead(input.rules, RULES);
  const decisions = pinRead(input.decisions, DECISIONS);
  const ruleIndex = pinRead(input.adoptedRulesIndex, RULE_INDEX);
  need(
    manifest.files.some(
      (f) =>
        f.path === 'UNKNOWN_LEDGER.json' &&
        f.sha256 === LEDGER_SHA &&
        f.bytes === input.ledger.bytes,
    ),
    'DELIVERY_LEDGER_BINDING',
  );
  need(
    Array.isArray(ledger.records) && ledger.records.length === 2544,
    'ORIGINAL_LEDGER_SIZE',
  );
  need(
    new Set(ledger.records.map((r) => r.stableId)).size === 2544,
    'DUPLICATE_ORIGINAL_ID',
  );
  const batch = batches.filter((b) => b.batchId === 'B08');
  need(
    batch.length === 1 && batch[0].stableIds.length === 560,
    'B08_BATCH_IDENTITY',
  );
  const originalSources = new Map();
  const records = COUNTRY01_OBLIGATION_IDS.map((id) => {
    need(batch[0].stableIds.includes(id), 'ORIGINAL_ID_NOT_IN_B08');
    const r = ledger.records.find((row) => row.stableId === id);
    need(
      r?.countryId === 'COUNTRY_01' &&
        r.rootCause === 'RC_LEGAL_OBLIGATION_REGISTER',
      'ORIGINAL_ID_SEMANTICS',
    );
    const s = r.originalSource;
    const sourceKey = `${s.path}/${s.sha256}`;
    if (!originalSources.has(sourceKey))
      originalSources.set(sourceKey, pinRead(s));
    const observed = atPointer(originalSources.get(sourceKey), s.pointer);
    need(equal(observed, r.before), 'ORIGINAL_SOURCE_CHANGED');
    need(
      observed.value === null && observed.unit === r.originalUnit,
      'ORIGINAL_NULL_OR_UNIT_CHANGED',
    );
    return {
      stableId: id,
      ownerId: r.ownerId,
      field: r.missingField,
      unit: r.originalUnit,
      source: s,
      observedOriginalField: observed,
      candidateValue: null,
      currency: null,
      effectivePeriod: null,
      valueDate: null,
      applicableWorldGenesisHead: null,
      adoptionEvidence: null,
      custodyOrSignatureEvidence: null,
      coverageFrontier: null,
      actualDue: null,
      actualSettled: null,
      currencyApplicability:
        r.originalUnit === 'CLASSIFICATION'
          ? 'NOT_APPLICABLE_TO_CLASSIFICATION_LABEL'
          : 'REQUIRED_PER_ITEM_NOT_ESTABLISHED',
      reportedStages: {
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      },
      blockers:
        r.missingField === 'canonicalObligations'
          ? [
              'COMPLETE_SOURCE_OWNED_REGISTER',
              'LEGAL_OPENING_IDENTITY_AND_ADOPTION',
              'DUE_PERIOD_AND_SETTLEMENT_FRONTIER',
            ]
          : [
              'FIVE_COMPLETE_ENTITY_REGISTERS',
              'ADOPTED_CLASSIFICATION_APPLICABILITY',
              'NATIVE_CURRENCY_PERIOD_AND_NONOVERLAP',
            ],
      dependencies: r.dependencies,
      acceptanceRule: r.acceptanceRule,
      status: 'BLOCKED_COMPLETE_ADOPTED_REGISTER_NOT_ESTABLISHED',
    };
  });
  need(
    Array.isArray(input.couponInputs) && input.couponInputs.length === 2,
    'TWO_SOURCE_SELECTIONS_REQUIRED',
  );
  for (const selection of input.couponInputs)
    for (const [name, hash] of Object.entries(COUPON_SOURCE_PINS))
      need(
        selection.sources?.[name]?.sha256 === hash,
        'ORIGINAL_COUPON_READSET_REQUIRED',
      );
  const facts = input.couponInputs.map(extractContractCouponFact);
  need(
    new Set(facts.map((f) => f.localRelationKey.sharedClaimId)).size === 2,
    'DUPLICATE_SOURCE_OBLIGATION_COMPONENT',
  );
  need(
    facts.every(
      (f) =>
        f.declaredSource.nativeCurrency === 'XAA' &&
        f.localRelationKey.relativeDueSimDay === 360,
    ),
    'SOURCE_CURRENCY_PERIOD',
  );
  const entitiesPin = input.couponInputs[0].sources.entities;
  const sourceEntities = pinRead(entitiesPin);
  const entityCoverage = ENTITIES.map((name, i) => {
    need(
      sourceEntities[i]?.id === ALIASES[i] &&
        sourceEntities[i]?.countryId === 'visual-territory-01',
      'ENTITY_SOURCE_IDENTITY',
    );
    return {
      entityId: `ENTITY_${name}_01`,
      sourceIdentity: { pin: entitiesPin, pointer: `/${i}`, alias: ALIASES[i] },
      selectedPayerFactKeys:
        i === 0 ? facts.map((f) => f.localRelationKey) : [],
      selectedCreditorWitnessKeys:
        i === 4 ? facts.map((f) => f.localRelationKey) : [],
      completeRegister: null,
      adoptedCategoryCoverage: null,
      settledHistory: null,
      actualCoverageFrontier: null,
      meaning:
        'BOUNDED_SELECTED_SOURCE_RELATIONS_NOT_EMPTY_OR_COMPLETE_LEGAL_HISTORY',
    };
  });
  return seal({
    schemaVersion: 'd-country01-obligation-package-v1',
    ...FLAGS,
    inputs: input,
    parentBatch: 'B08',
    parentBatchOriginalIdCount: 560,
    subsetOriginalIdCount: 8,
    subsetStableIds: [...COUNTRY01_OBLIGATION_IDS],
    originalFieldClosuresClaimed: 0,
    evidenceClass: 'UNADMITTED_SOURCE_INPUT',
    countryId: 'COUNTRY_01',
    records,
    facts,
    entityCoverage,
    ruleEvidence: {
      pin: input.rules,
      parentStatus: rules.status,
      normativeReferences: rules.reusedNormative,
      decisionsPin: input.decisions,
      reusedDecisions: decisions.decisions.filter((d) =>
        ['D01', 'D02', 'D03', 'D04', 'D06', 'TIME_360'].includes(d.id),
      ),
      independentIndexPin: input.adoptedRulesIndex,
      existingNormativeCategories: ruleIndex.existingNormativeCategories,
      proposedRulesNotPromotedToAdoption: true,
    },
    manifestLayers: {
      deliveryManifest: input.deliveryManifest,
      ledgerInternalUpstreamManifest: ledger.primarySourceManifest,
      batches: input.batches,
    },
    countryCoverage: {
      completeRegister: null,
      classificationAdopted: null,
      actualPeriod: null,
      mandatoryNonDebtNative: null,
      committedDiscretionaryNative: null,
      knownDebtCouponRelations: 2,
      outgoingPayablesNotDoubledByCreditorMirrors: true,
      includedPriceVsInputCostConvention: null,
      scope: 'FIVE_ENTITY_SELECTED_READSET_NOT_ALL_POSSIBLE_SOURCES',
    },
  });
}

export function writeCountry01ObligationPackage(input, outputPath) {
  const value = buildCountry01ObligationPackage(input);
  writeFileSync(outputPath, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
  });
  return value;
}

/** Real file read + original-source reconstruction. Hash/caller flags grant no authority. */
export function consumeCountry01ObligationPackage(pin) {
  const value = pinRead(pin);
  need(
    value?.schemaVersion === 'd-country01-obligation-package-v1',
    'PACKAGE_SCHEMA',
  );
  const { packageHash, ...body } = value;
  need(contentHash(body) === packageHash, 'PACKAGE_CONTENT_HASH');
  const reconstructed = buildCountry01ObligationPackage(value.inputs);
  need(
    equal(value, reconstructed),
    'PACKAGE_NOT_ORIGINAL_SOURCE_RECONSTRUCTION',
  );
  return {
    schemaVersion: 'd-country01-obligation-consumption-v1',
    ...FLAGS,
    status: 'BLOCKED_INCOMPLETE_ADOPTED_REGISTER',
    packageHash,
    records: value.records.map(
      ({ stableId, candidateValue, unit, dependencies }) => ({
        stableId,
        value: candidateValue,
        unit,
        dependencies,
      }),
    ),
    knownSourceCoupons: value.facts.map((f) => ({
      key: f.localRelationKey,
      sourceAmount: f.declaredSource.scheduledCouponDueNative,
      sourceCurrency: f.declaredSource.nativeCurrency,
      actualDue: null,
      actualSettled: null,
      actualUnpaid: null,
    })),
    countryAmounts: {
      mandatoryNonDebtNative: null,
      committedDiscretionaryNative: null,
    },
    originalFieldClosuresClaimed: 0,
    sourceReconstructionMatched: true,
  };
}

const decimal = (value) => {
  need(
    typeof value === 'string' &&
      /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value) &&
      value.replace('.', '').length <= 120,
    'QUOTED_EXACT_AMOUNT_REQUIRED',
  );
  return value;
};
const testRef = (v) =>
  typeof v === 'string' && /^TEST_ONLY_[A-Za-z0-9_-]+$/u.test(v);

/** Inspectable synthetic consumer only. Never accepts actual IDs or issues a field value. */
export function consumeTestOnlyObligationCosts(pin) {
  const v = pinRead(pin);
  need(
    v?.schemaVersion === 'd-test-only-obligation-costs-v1' &&
      v.evidenceClass === 'TEST_ONLY',
    'TEST_ONLY_REQUIRED',
  );
  need(
    testRef(v.countryId) && testRef(v.payerId) && testRef(v.period),
    'TEST_ONLY_SCOPE_REQUIRED',
  );
  need(
    typeof v.currency === 'string' && /^[A-Z]{3}$/u.test(v.currency),
    'CURRENCY_REQUIRED',
  );
  need(Array.isArray(v.rows) && v.rows.length <= 128, 'BOUNDED_ROWS_REQUIRED');
  const keys = new Set(),
    costAtoms = new Set(),
    included = new Set();
  let mandatory = '0',
    discretionary = '0',
    unknownPaid = false;
  for (const row of v.rows) {
    need(
      testRef(row.obligationId) &&
        testRef(row.component) &&
        testRef(row.legalBasisRef) &&
        testRef(row.commitmentRef),
      'TEST_ONLY_LEGAL_BINDING_REQUIRED',
    );
    need(
      row.payerId === v.payerId && row.currency === v.currency,
      'PAYER_CURRENCY_MISMATCH',
    );
    need(row.period === v.period, 'PERIOD_MISMATCH');
    const key = `${row.obligationId}/${row.component}`;
    need(!keys.has(key), 'DUPLICATE_OBLIGATION_COMPONENT');
    keys.add(key);
    need(
      [
        'MANDATORY_NON_DEBT',
        'COMMITTED_DISCRETIONARY',
        'DEBT_SERVICE',
      ].includes(row.classification),
      'CLASSIFICATION_UNKNOWN',
    );
    const amount = decimal(row.nativeAmount);
    let unpaid = null;
    if (row.settledNative === null) unknownPaid = true;
    else {
      need(
        row.settlementEvidence === 'TEST_ONLY_DECLARED_SETTLEMENT',
        'SETTLEMENT_EVIDENCE_REQUIRED',
      );
      unpaid = exactDecimalSubtract(amount, decimal(row.settledNative));
      need(!unpaid.startsWith('-'), 'SETTLED_EXCEEDS_OBLIGATION');
    }
    need(
      Array.isArray(row.costAtoms) && Array.isArray(row.includesAtoms),
      'EXPLICIT_COST_INCLUSION_REQUIRED',
    );
    for (const atom of row.costAtoms) {
      need(testRef(atom), 'TEST_ONLY_COST_ATOM_REQUIRED');
      need(!costAtoms.has(atom), 'DUPLICATE_COST_ATOM');
      costAtoms.add(atom);
    }
    for (const atom of row.includesAtoms) {
      need(testRef(atom), 'TEST_ONLY_COST_ATOM_REQUIRED');
      need(!included.has(atom), 'DUPLICATE_INCLUSIVE_COST');
      included.add(atom);
    }
    if (unpaid !== null && row.classification === 'MANDATORY_NON_DEBT')
      mandatory = exactDecimalAdd(mandatory, unpaid);
    if (unpaid !== null && row.classification === 'COMMITTED_DISCRETIONARY')
      discretionary = exactDecimalAdd(discretionary, unpaid);
  }
  need(
    ![...costAtoms].some((atom) => included.has(atom)),
    'PACKAGE_PRICE_INPUT_COST_OVERLAP',
  );
  const coverage = v.coverage;
  const complete =
    coverage?.kind === 'TEST_ONLY_ENUMERATED_UNIVERSE' &&
    testRef(coverage.creationRef) &&
    Array.isArray(coverage.keys) &&
    new Set(coverage.keys).size === coverage.keys.length &&
    equal([...coverage.keys].sort(), [...keys].sort());
  const ready = complete && !unknownPaid;
  return {
    ...FLAGS,
    evidenceClass: 'TEST_ONLY',
    originalIdsAllowed: false,
    status: ready
      ? 'TEST_ONLY_CALCULATED_NOT_SETTLEMENT'
      : 'BLOCKED_COVERAGE_OR_SETTLED_HISTORY',
    candidateTestTotals: {
      mandatoryNonDebtNative: ready ? mandatory : null,
      committedDiscretionaryNative: ready ? discretionary : null,
    },
    actualFieldValues: null,
    originalFieldClosuresClaimed: 0,
  };
}
