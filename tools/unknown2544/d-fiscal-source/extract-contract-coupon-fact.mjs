import { writeFileSync } from 'node:fs';
import { readPinnedJson, atPointer } from './intake.mjs';
import { canonical, contentHash } from './produce-candidate.mjs';
import { exactDecimalMultiply } from '../../../packages/testkit/src/exact-decimal-oracle.ts';

/** Offline source relation only; not a legal obligation/source issuer. */
export const SELECTED_COUPON = Object.freeze({
  claim: 'SCENE_INITIAL_GOV_SECURITY_01_V2',
  component: 'COUPON',
  country: 'COUNTRY_01',
  payer: 'ENTITY_GOVERNMENT_01',
  creditor: 'ENTITY_CENTRAL_BANK_01',
  relativeDay: 360,
  termsVersion: 'LCFX_CB_REGION_20261013_V2_PROPOSED',
  scheduleVersion: 'CONSTRUCTED_SCENARIO_FIRST14_20261013_V1_PROPOSED',
});

// Closed source scope, not a registry or a country/claim-pattern resolver.
// Keep the public v1 selection and its output contract unchanged.
const COUPON_CASES = Object.freeze([
  SELECTED_COUPON,
  Object.freeze({
    ...SELECTED_COUPON,
    claim: 'SCENE_INITIAL_RECONSTRUCTION_CLAIM_01_V2',
  }),
]);

const SOURCE_NAMES = ['terms', 'positions', 'schedule', 'finance', 'entities'];
const requireThat = (condition, code) => {
  if (!condition) throw new Error(code);
};
function record(value, keys, path) {
  requireThat(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${path}:RECORD_REQUIRED`,
  );
  requireThat(
    Object.keys(value).every((k) => keys.includes(k)) &&
      keys.every((k) => Object.hasOwn(value, k)),
    `${path}:EXACT_KEYS_REQUIRED`,
  );
  return value;
}
function rows(value, path) {
  requireThat(Array.isArray(value), `${path}:ARRAY_REQUIRED`);
  return value;
}
function object(value, path) {
  requireThat(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${path}:RECORD_REQUIRED`,
  );
  return value;
}
function equal(left, right, path) {
  requireThat(canonical(left) === canonical(right), `${path}:BINDING_MISMATCH`);
}
function one(items, path) {
  requireThat(items.length === 1, `${path}:UNIQUE_ROW_REQUIRED`);
  return items[0];
}
function find(items, predicate, path) {
  return rows(items, path)
    .map((row, index) => ({
      row: object(row, path),
      pointer: `/${path}/${index}`,
    }))
    .filter(({ row }) => predicate(row));
}
/**
 * B08-E-PRECISION-01: JSON.parse is NOT a lossless numerical reader. Accept
 * only source JSON strings before comparison. Never stringify/format Number.
 * Exact decoded string value is retained; source hash/pointer preserves the
 * original byte encoding. No complete source row is emitted as a raw copy.
 */
function exactString(value, path) {
  requireThat(typeof value === 'string', `${path}:SOURCE_STRING_REQUIRED`);
  requireThat(
    /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value) &&
      value.replace('.', '').length <= 120,
    `${path}:CANONICAL_DECIMAL_REQUIRED`,
  );
  return value;
}
function currency(value) {
  requireThat(
    typeof value === 'string' && /^[A-Z]{3}$/u.test(value),
    'NATIVE_CURRENCY_REQUIRED',
  );
  return value;
}
function safeMetadata(value, expected, path) {
  requireThat(
    Number.isSafeInteger(value) && Object.is(value, expected),
    `${path}:SAFE_INTEGER_METADATA_REQUIRED`,
  );
  return value;
}
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function resolveSelection(input) {
  object(input, 'input');
  if (input.schemaVersion === 'd-b08-coupon-extraction-input-v1') {
    record(input, ['schemaVersion', 'sources'], 'input');
    return SELECTED_COUPON;
  }
  equal(
    input.schemaVersion,
    'd-b08-coupon-extraction-input-v2',
    'input.schemaVersion',
  );
  record(input, ['schemaVersion', 'selection', 'sources'], 'input');
  const requested = record(
    input.selection,
    ['sharedClaimId', 'component', 'relativeDueSimDay'],
    'selection',
  );
  const spec = COUPON_CASES.find((c) => c.claim === requested.sharedClaimId);
  requireThat(spec !== undefined, 'UNSUPPORTED_COUPON_SELECTION');
  equal(requested.component, spec.component, 'selection.component');
  safeMetadata(
    requested.relativeDueSimDay,
    spec.relativeDay,
    'selection.relativeDueSimDay',
  );
  return spec;
}

export function extractContractCouponFact(input) {
  const selectionSpec = resolveSelection(input);
  record(input.sources, SOURCE_NAMES, 'sources');
  const documents = {},
    pins = {};
  for (const name of SOURCE_NAMES) {
    const p = record(
      input.sources[name],
      ['path', 'sha256', 'bytes'],
      `sources.${name}`,
    );
    requireThat(
      typeof p.path === 'string' && p.path.length > 0,
      'SOURCE_PATH_REQUIRED',
    );
    requireThat(
      Number.isSafeInteger(p.bytes) && p.bytes >= 0,
      'SOURCE_BYTES_REQUIRED',
    );
    documents[name] = readPinnedJson(p.path, p.sha256, p.bytes);
    pins[name] = { path: p.path, sha256: p.sha256, bytes: p.bytes };
  }
  const { terms, positions, schedule, finance, entities } = documents;
  equal(terms.version, selectionSpec.termsVersion, 'terms.version');
  equal(positions.version, selectionSpec.termsVersion, 'positions.version');
  equal(schedule.version, selectionSpec.scheduleVersion, 'schedule.version');
  equal(terms.actualDisbursement, false, 'terms.actualDisbursement');
  equal(terms.actualRepayment, false, 'terms.actualRepayment');
  equal(positions.actualWorldPosting, false, 'positions.actualWorldPosting');
  const selected = one(
    find(
      terms.contracts,
      (r) => r.sharedClaimId === selectionSpec.claim,
      'contracts',
    ),
    'selectedContract',
  );
  const c = selected.row;
  equal(c.version, terms.version, 'contract.version');
  equal(c.countryId, selectionSpec.country, 'contract.country');
  equal(c.borrowerId, selectionSpec.payer, 'contract.payer');
  equal(c.lenderId, selectionSpec.creditor, 'contract.creditor');
  equal(
    c.origin,
    'CONSTRUCTED_DAY0_ENDOWMENT_NOT_HISTORICAL_LOAN',
    'contract.origin',
  );
  equal(c.actualDisbursement, false, 'contract.actualDisbursement');
  equal(c.actualRepayment, false, 'contract.actualRepayment');
  const nativeCurrency = currency(c.nativeCurrency);
  const principal = exactString(c.nativePrincipal, 'contract.nativePrincipal');
  const annualCoupon = exactString(c.annualCoupon, 'contract.annualCoupon');
  const relativeDay = safeMetadata(
    c.firstCouponDueSimDay,
    selectionSpec.relativeDay,
    'firstCouponDueSimDay',
  );
  const dayCount = safeMetadata(c.interestDayCount, 360, 'interestDayCount');
  requireThat(
    typeof c.valueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(c.valueDate),
    'SOURCE_VALUE_DATE_STRING_REQUIRED',
  );
  const primary = record(
    c.source,
    ['path', 'sha256', 'pointer'],
    'contract.source',
  );
  equal(primary.path, pins.finance.path, 'primaryFinance.path');
  equal(primary.sha256, pins.finance.sha256, 'primaryFinance.sha256');
  equal(primary.pointer, '/0', 'primaryFinance.pointer');
  const f = object(atPointer(finance, primary.pointer), 'primaryFinance');
  equal(f.countryId, 'visual-territory-01', 'primaryFinance.country');
  const originalPublicDebtGenesisControl = safeMetadata(
    f.publicDebt,
    0,
    'finance.publicDebt',
  );
  // These exact integers are source METADATA/controls, not an amount lexeme,
  // actual due/cutoff, paid/settled0 or an empty obligation history.
  const mirrors = find(
    positions.positions,
    (r) => r.sharedClaimId === selectionSpec.claim,
    'positions',
  );
  requireThat(mirrors.length === 2, 'TWO_MIRROR_WITNESSES_REQUIRED');
  const asset = one(
    mirrors.filter((x) => x.row.role === 'ASSET'),
    'assetWitness',
  );
  const liability = one(
    mirrors.filter((x) => x.row.role === 'LIABILITY'),
    'liabilityWitness',
  );
  for (const { row: m } of mirrors) {
    equal(m.version, terms.version, 'mirror.version');
    equal(m.countryId, c.countryId, 'mirror.country');
    equal(m.issuerId, c.borrowerId, 'mirror.issuer');
    equal(m.assetHolderId, c.lenderId, 'mirror.assetHolder');
    equal(m.nativeCurrency, nativeCurrency, 'mirror.currency');
    equal(
      exactString(m.nativeAmount, 'mirror.nativeAmount'),
      principal,
      'mirror.principal',
    );
    equal(m.source, primary, 'mirror.primarySource');
    equal(m.actualWorldPosting, false, 'mirror.actualWorldPosting');
    equal(
      m.adoptionClass,
      'CONSTRUCTED_CANDIDATE_NOT_ADOPTED',
      'mirror.adoptionClass',
    );
  }
  equal(asset.row.holderId, c.lenderId, 'asset.holder');
  equal(liability.row.holderId, c.borrowerId, 'liability.holder');
  equal(asset.row.counterpartyId, c.borrowerId, 'asset.counterparty');
  equal(liability.row.counterpartyId, c.lenderId, 'liability.counterparty');
  const event = one(
    find(
      schedule.events,
      (r) =>
        r.sharedClaimId === selectionSpec.claim && r.simDay === relativeDay,
      'events',
    ),
    'selectedSchedule',
  );
  const e = event.row;
  safeMetadata(e.simDay, relativeDay, 'schedule.simDay');
  equal(e.countryId, c.countryId, 'schedule.country');
  equal(e.nativeCurrency, nativeCurrency, 'schedule.currency');
  equal(e.sourcePointer, selected.pointer, 'schedule.contractPointer');
  equal(
    e.status,
    'FIXED_V2_CONTRACT_CANDIDATE_NOT_ACTUAL_PAYMENT',
    'schedule.status',
  );
  const couponDue = exactString(e.couponDueNative, 'schedule.couponDueNative');
  const principalDue = exactString(
    e.principalDueNative,
    'schedule.principalDueNative',
  );
  // Reuse existing exact primitive only to cross-check this source's simple
  // first annual coupon. No new rate, accrual policy, period or cash created.
  equal(
    couponDue,
    exactDecimalMultiply(principal, annualCoupon),
    'sourceCouponArithmetic',
  );
  equal(principalDue, '0', 'firstCoupon.principalComponent');
  const entityRows = rows(entities, 'entities');
  const entityWitnesses = [
    ['GOV-01', 'GOV', c.borrowerId],
    ['CENTRAL-BANK-01', 'CENTRAL-BANK', c.lenderId],
  ].map(([alias, role, reference]) => {
    const item = one(
      entityRows
        .map((row, index) => ({
          row: object(row, 'entity'),
          pointer: `/${index}`,
        }))
        .filter(
          (x) =>
            x.row.id === alias && x.row.countryId === 'visual-territory-01',
        ),
      'entityAlias',
    );
    equal(item.row.role, role, 'entity.role');
    return { alias, role, reference, pointer: item.pointer };
  });
  const witness = (name, pointer, sourceVersion) => ({
    kind: name,
    pin: pins[name],
    pointer,
    sourceVersion,
  });
  const fact = {
    schemaVersion: 'd-b08-retained-coupon-fact-v1',
    evidenceClass: 'CONSTRUCTED_SOURCE_FACT_NOT_ACTUAL_OBLIGATION',
    localRelationKey: {
      sharedClaimId: selectionSpec.claim,
      component: selectionSpec.component,
      relativeDueSimDay: relativeDay,
    },
    declaredSource: {
      countryId: c.countryId,
      payerEntityRef: c.borrowerId,
      creditorEntityRef: c.lenderId,
      nativeCurrency,
      nativePrincipal: principal,
      annualCoupon,
      scheduledCouponDueNative: couponDue,
      scheduledPrincipalDueNative: principalDue,
      origin: c.origin,
    },
    metadata: {
      sourceValueDate: c.valueDate,
      relativeDueSimDay: relativeDay,
      sourceInterestDayCount: dayCount,
      originalPublicDebtGenesisControl,
      integerMeaning:
        'SAFE_INTEGER_SOURCE_METADATA_NOT_ACTUAL_DUE_SETTLED_OR_EMPTY_HISTORY',
    },
    sourceWitnesses: [
      witness('terms', selected.pointer, terms.version),
      witness('positions', asset.pointer, positions.version),
      witness('positions', liability.pointer, positions.version),
      witness('schedule', event.pointer, schedule.version),
      witness('finance', primary.pointer, null),
      ...entityWitnesses.map((x) => ({
        ...witness('entities', x.pointer, null),
        sourceAlias: x.alias,
        declaredRole: x.role,
        referenceEntityRef: x.reference,
      })),
    ],
    sourceRelation: {
      economicClaims: 1,
      oppositeMirrorWitnesses: 2,
      scheduleRows: 1,
      couponArithmetic: 'EXACT_SOURCE_STRING_PRODUCT_MATCH',
      stringPrecision:
        'EXACT_DECODED_SOURCE_STRINGS_ONLY_NOT_RAW_NUMERIC_ROW_COPY',
    },
    originalReferenceTarget:
      'U2544::ENTITY::ENTITY_GOVERNMENT_01::canonicalObligations',
    actual: {
      canonicalObligationId: null,
      worldId: null,
      openingIdentity: null,
      effectivePeriodRef: null,
      simTimeDue: null,
      adoptedLegalCommitment: null,
      settledPrincipal: null,
      settledCoupon: null,
      unpaidAmount: null,
      coverageFrontier: null,
    },
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
    actualPayment: false,
    registerComplete: false,
  };
  return freeze({ ...fact, factHash: contentHash(fact) });
}

/** Exclusive local artifact only; a filesystem output cannot grant authority. */
export function writeContractCouponFact(input, outputPath) {
  const fact = extractContractCouponFact(input);
  writeFileSync(outputPath, `${JSON.stringify(fact, null, 2)}\n`, {
    flag: 'wx',
  });
  return fact;
}
