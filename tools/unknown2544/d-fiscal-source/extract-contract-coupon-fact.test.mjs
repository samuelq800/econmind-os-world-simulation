import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from './intake.mjs';
import { exactDecimalMultiply } from '../../../packages/testkit/src/exact-decimal-oracle.ts';
import {
  SELECTED_COUPON as selected,
  extractContractCouponFact,
  writeContractCouponFact,
} from './extract-contract-coupon-fact.mjs';

// Synthetic quoted-value fixtures are not actual source, title or settlement.
// One explicitly enabled test separately reads the original immutable sources.
const temporary = [];
after(() => {
  for (const directory of temporary)
    rmSync(directory, { recursive: true, force: true });
});
const principal = '3643393640552.20224',
  rate = '0.035',
  coupon = '127518777419.3270784';
function fixture(change = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'econmind-b08-coupon-fixture-'));
  temporary.push(directory);
  const contract = {
    sharedClaimId: selected.claim,
    countryId: selected.country,
    borrowerId: selected.payer,
    lenderId: selected.creditor,
    nativeCurrency: 'XAA',
    nativePrincipal: principal,
    annualCoupon: rate,
    firstCouponDueSimDay: 360,
    interestDayCount: 360,
    valueDate: '2026-10-13',
    version: selected.termsVersion,
    origin: 'CONSTRUCTED_DAY0_ENDOWMENT_NOT_HISTORICAL_LOAN',
    actualDisbursement: false,
    actualRepayment: false,
  };
  const mirror = (role) => ({
    sharedClaimId: selected.claim,
    countryId: selected.country,
    role,
    issuerId: selected.payer,
    assetHolderId: selected.creditor,
    holderId: role === 'ASSET' ? selected.creditor : selected.payer,
    counterpartyId: role === 'ASSET' ? selected.payer : selected.creditor,
    nativeCurrency: 'XAA',
    nativeAmount: principal,
    version: selected.termsVersion,
    actualWorldPosting: false,
    adoptionClass: 'CONSTRUCTED_CANDIDATE_NOT_ADOPTED',
  });
  const documents = {
    terms: {
      version: selected.termsVersion,
      actualDisbursement: false,
      actualRepayment: false,
      contracts: [contract],
    },
    positions: {
      version: selected.termsVersion,
      actualWorldPosting: false,
      positions: [mirror('ASSET'), mirror('LIABILITY')],
    },
    schedule: {
      version: selected.scheduleVersion,
      events: [
        {
          sharedClaimId: selected.claim,
          countryId: selected.country,
          simDay: 360,
          nativeCurrency: 'XAA',
          principalDueNative: '0',
          couponDueNative: coupon,
          sourcePointer: '/contracts/0',
          status: 'FIXED_V2_CONTRACT_CANDIDATE_NOT_ACTUAL_PAYMENT',
        },
      ],
    },
    finance: [
      {
        countryId: 'visual-territory-01',
        publicDebt: 0,
        unquotedReferenceAmount: 1.2345678901234567,
      },
    ],
    entities: [
      { id: 'GOV-01', countryId: 'visual-territory-01', role: 'GOV' },
      {
        id: 'CENTRAL-BANK-01',
        countryId: 'visual-territory-01',
        role: 'CENTRAL-BANK',
      },
    ],
  };
  change(documents);
  const sources = {};
  const save = (name, value) => {
    const path = join(directory, name + '.json'),
      bytes = Buffer.from(JSON.stringify(value));
    writeFileSync(path, bytes);
    sources[name] = { path, bytes: bytes.length, sha256: digest(bytes) };
  };
  save('finance', documents.finance);
  const source = {
    path: sources.finance.path,
    sha256: sources.finance.sha256,
    pointer: '/0',
  };
  for (const c of documents.terms.contracts)
    c.source = { ...source, ...c.source };
  for (const p of documents.positions.positions)
    p.source = { ...source, ...p.source };
  for (const name of ['terms', 'positions', 'schedule', 'entities'])
    save(name, documents[name]);
  return {
    directory,
    documents,
    input: { schemaVersion: 'd-b08-coupon-extraction-input-v1', sources },
  };
}
function reject(change, pattern) {
  assert.throws(
    () => extractContractCouponFact(fixture(change).input),
    pattern,
  );
}
function assertNonAuthority(fact) {
  assert.equal(fact.registerComplete, false);
  assert.equal(fact.sourceAdmitted, false);
  assert.equal(fact.productionAuthority, false);
  assert.equal(fact.actualPayment, false);
  assert.equal(fact.runtimeConnected, false);
  assert.ok(Object.values(fact.actual).every((v) => v === null));
  assert.equal(fact.sourceRelation.economicClaims, 1);
  assert.equal(fact.sourceRelation.oppositeMirrorWitnesses, 2);
  assert.equal(fact.sourceRelation.scheduleRows, 1);
  assert.equal(Object.hasOwn(fact, 'mandatoryNonDebtNative'), false);
  assert.equal(Object.hasOwn(fact, 'sourceRows'), false);
  assert.equal(Object.hasOwn(fact, 'receipt'), false);
}

test(
  'original quoted immutable source positive, enabled only by explicit pin manifest',
  { skip: !process.env.ECONMIND_B08_REAL_SOURCE_PINS },
  () => {
    const input = JSON.parse(
      readFileSync(process.env.ECONMIND_B08_REAL_SOURCE_PINS, 'utf8'),
    );
    const fact = extractContractCouponFact(input);
    assertNonAuthority(fact);
    assert.equal(fact.declaredSource.nativePrincipal, principal);
    assert.equal(fact.declaredSource.annualCoupon, rate);
    assert.equal(fact.declaredSource.scheduledCouponDueNative, coupon);
    assert.deepEqual(
      fact.sourceWitnesses
        .filter((w) => w.kind === 'positions')
        .map((w) => w.pointer),
      ['/positions/4', '/positions/5'],
    );
    assert.equal(
      fact.sourceWitnesses.find((w) => w.kind === 'schedule').pointer,
      '/events/3',
    );
  },
);
test('quoted original-value fixture yields one source coupon, never a complete register', () => {
  const f = fixture(),
    before = JSON.stringify(f.input),
    fact = extractContractCouponFact(f.input);
  assertNonAuthority(fact);
  assert.equal(fact.declaredSource.scheduledCouponDueNative, coupon);
  assert.equal(fact.declaredSource.scheduledPrincipalDueNative, '0');
  assert.equal(fact.metadata.relativeDueSimDay, 360);
  assert.equal(fact.metadata.originalPublicDebtGenesisControl, 0);
  assert.equal(JSON.stringify(f.input), before);
  assert.equal(Object.isFrozen(fact.actual), true);
  assert.equal(
    fact.sourceWitnesses.filter((w) => w.kind === 'entities').length,
    2,
  );
});
test('quoted long-tail values survive exactly before source arithmetic checks', () => {
  const tail = '3643393640552.202240000000000000000001';
  const expected = exactDecimalMultiply(tail, rate);
  const fact = extractContractCouponFact(
    fixture((d) => {
      d.terms.contracts[0].nativePrincipal = tail;
      for (const p of d.positions.positions) p.nativeAmount = tail;
      d.schedule.events[0].couponDueNative = expected;
    }).input,
  );
  assert.equal(fact.declaredSource.nativePrincipal, tail);
  assert.equal(fact.declaredSource.scheduledCouponDueNative, expected);
  assertNonAuthority(fact);
});
test('unquoted long-tail principal is rejected, not Number-to-string repaired', () => {
  // JSON.parse has already rounded this unquoted token. The extractor must
  // reject its type rather than stringify that representation as source text.
  const unquoted = JSON.parse(
    '{"amount":3643393640552.202240000000000000000001}',
  ).amount;
  reject((d) => {
    d.terms.contracts[0].nativePrincipal = unquoted;
  }, /SOURCE_STRING_REQUIRED/);
});
for (const [name, change] of [
  [
    'unquoted rate',
    (d) => {
      d.terms.contracts[0].annualCoupon = 0.035;
    },
  ],
  [
    'unquoted mirror',
    (d) => {
      d.positions.positions[0].nativeAmount = JSON.parse(
        '{"amount":3643393640552.20224}',
      ).amount;
    },
  ],
  [
    'unquoted coupon',
    (d) => {
      d.schedule.events[0].couponDueNative = JSON.parse(
        '{"amount":127518777419.3270784}',
      ).amount;
    },
  ],
  [
    'unquoted principal component',
    (d) => {
      d.schedule.events[0].principalDueNative = 0;
    },
  ],
  [
    'missing principal',
    (d) => {
      delete d.terms.contracts[0].nativePrincipal;
    },
  ],
  [
    'missing coupon',
    (d) => {
      delete d.schedule.events[0].couponDueNative;
    },
  ],
  [
    'null coupon',
    (d) => {
      d.schedule.events[0].couponDueNative = null;
    },
  ],
  [
    'missing zero component is not zero',
    (d) => {
      delete d.schedule.events[0].principalDueNative;
    },
  ],
])
  test(name, () => reject(change, /SOURCE_STRING_REQUIRED/));
for (const value of [
  '1e3',
  '01',
  '-1',
  'NaN',
  'Infinity',
  '1.0',
  '0.000',
  '9'.repeat(121),
])
  test(`reject noncanonical monetary string ${value.slice(0, 12)}`, () =>
    reject((d) => {
      d.terms.contracts[0].nativePrincipal = value;
    }, /CANONICAL_DECIMAL_REQUIRED/));
for (const [name, change] of [
  [
    'wrong borrower',
    (d) => {
      d.terms.contracts[0].borrowerId = 'ENTITY_OPERATOR_01';
    },
  ],
  [
    'wrong creditor',
    (d) => {
      d.terms.contracts[0].lenderId = 'ENTITY_BANK_01';
    },
  ],
  [
    'wrong country',
    (d) => {
      d.terms.contracts[0].countryId = 'COUNTRY_02';
    },
  ],
  [
    'wrong issuer',
    (d) => {
      d.positions.positions[0].issuerId = selected.creditor;
    },
  ],
  [
    'wrong holder',
    (d) => {
      d.positions.positions[0].holderId = selected.payer;
    },
  ],
  [
    'wrong asset holder',
    (d) => {
      d.positions.positions[0].assetHolderId = selected.payer;
    },
  ],
  [
    'wrong counterparty',
    (d) => {
      d.positions.positions[1].counterpartyId = selected.payer;
    },
  ],
  [
    'wrong currency',
    (d) => {
      d.schedule.events[0].nativeCurrency = 'GCU';
    },
  ],
  [
    'wrong principal',
    (d) => {
      d.positions.positions[0].nativeAmount = '1';
    },
  ],
  [
    'wrong contract pointer',
    (d) => {
      d.schedule.events[0].sourcePointer = '/contracts/1';
    },
  ],
  [
    'wrong term version',
    (d) => {
      d.terms.version = 'OTHER';
    },
  ],
  [
    'wrong mirror version',
    (d) => {
      d.positions.positions[0].version = 'OTHER';
    },
  ],
  [
    'wrong schedule version',
    (d) => {
      d.schedule.version = 'OTHER';
    },
  ],
  [
    'wrong coupon amount',
    (d) => {
      d.schedule.events[0].couponDueNative = '1';
    },
  ],
  [
    'not constructed origin',
    (d) => {
      d.terms.contracts[0].origin = 'HISTORICAL_LOAN';
    },
  ],
  [
    'actual repayment flag outside supported source',
    (d) => {
      d.terms.actualRepayment = true;
    },
  ],
  [
    'actual posting flag outside supported source',
    (d) => {
      d.positions.actualWorldPosting = true;
    },
  ],
])
  test(name, () => reject(change, /BINDING_MISMATCH/));
for (const [name, change] of [
  [
    'missing mirror',
    (d) => {
      d.positions.positions.pop();
    },
  ],
  [
    'extra mirror',
    (d) => {
      d.positions.positions.push(structuredClone(d.positions.positions[0]));
    },
  ],
  [
    'duplicate role',
    (d) => {
      d.positions.positions[1].role = 'ASSET';
    },
  ],
  [
    'duplicate contract',
    (d) => {
      d.terms.contracts.push(structuredClone(d.terms.contracts[0]));
    },
  ],
  [
    'duplicate schedule',
    (d) => {
      d.schedule.events.push(structuredClone(d.schedule.events[0]));
    },
  ],
  [
    'another claim',
    (d) => {
      d.terms.contracts[0].sharedClaimId = 'SCENE_OTHER';
    },
  ],
  [
    'another relative day',
    (d) => {
      d.schedule.events[0].simDay = 361;
    },
  ],
  [
    'missing entity',
    (d) => {
      d.entities.pop();
    },
  ],
])
  test(name, () => reject(change, /(REQUIRED|MISMATCH)/));
for (const [name, change] of [
  [
    'unquoted finance monetary control is not stringified',
    (d) => {
      d.finance[0].publicDebt = '0';
    },
  ],
  [
    'missing control is not zero',
    (d) => {
      delete d.finance[0].publicDebt;
    },
  ],
  [
    'unsafe source day',
    (d) => {
      d.terms.contracts[0].firstCouponDueSimDay = 9007199254740992;
    },
  ],
  [
    'quoted day not metadata integer',
    (d) => {
      d.terms.contracts[0].firstCouponDueSimDay = '360';
    },
  ],
])
  test(name, () => reject(change, /SAFE_INTEGER_METADATA_REQUIRED/));
test('source flags cannot populate actual legal/settled or complete frontier', () => {
  const f = fixture((d) => {
    d.terms.contracts[0].approved = true;
    d.terms.contracts[0].settled = '0';
    d.terms.contracts[0].registerComplete = true;
  });
  const fact = extractContractCouponFact(f.input);
  assertNonAuthority(fact);
  assert.equal(fact.actual.settledCoupon, null);
});
test('unquoted unrelated finance row values are not emitted as raw exact copies', () => {
  const fact = extractContractCouponFact(fixture().input);
  assert.equal(JSON.stringify(fact).includes('unquotedReferenceAmount'), false);
  assert.equal(JSON.stringify(fact).includes('1.2345678901234567'), false);
  assert.equal(
    fact.sourceWitnesses.find((w) => w.kind === 'finance').pointer,
    '/0',
  );
});
test('bad hash/size/pointer and caller amount are refused without alternate reader', () => {
  const f = fixture(),
    changed = structuredClone(f.input);
  changed.sources.terms.sha256 = '0'.repeat(64);
  assert.throws(
    () => extractContractCouponFact(changed),
    /SOURCE_HASH_MISMATCH/,
  );
  const wrongSize = structuredClone(f.input);
  wrongSize.sources.terms.bytes += 1;
  assert.throws(
    () => extractContractCouponFact(wrongSize),
    /SOURCE_SIZE_MISMATCH/,
  );
  reject((d) => {
    d.terms.contracts[0].source = { pointer: '/999' };
  }, /BINDING_MISMATCH/);
  assert.throws(
    () => extractContractCouponFact({ ...f.input, amount: coupon }),
    /EXACT_KEYS_REQUIRED/,
  );
});
test('deterministic extraction and exclusive artifact writing do not overwrite sources', () => {
  const f = fixture(),
    before = readFileSync(f.input.sources.terms.path),
    a = extractContractCouponFact(f.input),
    b = extractContractCouponFact(f.input);
  assert.deepEqual(a, b);
  const output = join(f.directory, 'fact.json');
  assert.deepEqual(writeContractCouponFact(f.input, output), a);
  assert.throws(() => writeContractCouponFact(f.input, output), /EEXIST/);
  assert.throws(
    () => writeContractCouponFact(f.input, f.input.sources.terms.path),
    /EEXIST/,
  );
  assert.deepEqual(readFileSync(f.input.sources.terms.path), before);
});

const reconstructionClaim = 'SCENE_INITIAL_RECONSTRUCTION_CLAIM_01_V2';
function asV2(input, sharedClaimId = reconstructionClaim) {
  return {
    schemaVersion: 'd-b08-coupon-extraction-input-v2',
    selection: { sharedClaimId, component: 'COUPON', relativeDueSimDay: 360 },
    sources: input.sources,
  };
}
function reconstructionFixture(change = () => {}) {
  const f = fixture((d) => {
    const c = d.terms.contracts[0];
    c.sharedClaimId = reconstructionClaim;
    c.nativePrincipal = '124656849631.6416';
    c.annualCoupon = '0.015';
    c.principalGraceSimDays = 180;
    c.maturitySimDays = 3600;
    for (const p of d.positions.positions) {
      p.sharedClaimId = reconstructionClaim;
      p.nativeAmount = c.nativePrincipal;
    }
    d.schedule.events[0].sharedClaimId = reconstructionClaim;
    d.schedule.events[0].couponDueNative = '1869852744.474624';
    change(d);
  });
  return { ...f, input: asV2(f.input) };
}

test(
  'v2: original v1 real-source golden bytes and factHash stay unchanged',
  {
    skip:
      !process.env.ECONMIND_B08_REAL_SOURCE_PINS ||
      !process.env.ECONMIND_B08_V1_GOLDEN_FILE,
  },
  () => {
    const input = JSON.parse(
      readFileSync(process.env.ECONMIND_B08_REAL_SOURCE_PINS, 'utf8'),
    );
    const golden = readFileSync(process.env.ECONMIND_B08_V1_GOLDEN_FILE);
    assert.equal(
      digest(golden),
      '95213abc52e4efc042e62fd712d97c4aeba82f5a1a93ef75c20eb03ccc40cdb6',
    );
    const fact = extractContractCouponFact(input);
    assert.deepEqual(Buffer.from(`${JSON.stringify(fact, null, 2)}\n`), golden);
    assert.equal(
      fact.factHash,
      '40f2333bb3a798f305a0775f060ac212d5e40b4eb4f14e26daab8b933b4f8ab6',
    );
    assert.deepEqual(
      extractContractCouponFact(asV2(input, selected.claim)),
      fact,
    );
  },
);
test('v2: original selector is byte-equivalent to v1 for identical fixture pins', () => {
  const f = fixture();
  assert.deepEqual(
    extractContractCouponFact(asV2(f.input, selected.claim)),
    extractContractCouponFact(f.input),
  );
  assert.deepEqual(selected, {
    claim: 'SCENE_INITIAL_GOV_SECURITY_01_V2',
    component: 'COUPON',
    country: 'COUNTRY_01',
    payer: 'ENTITY_GOVERNMENT_01',
    creditor: 'ENTITY_CENTRAL_BANK_01',
    relativeDay: 360,
    termsVersion: 'LCFX_CB_REGION_20261013_V2_PROPOSED',
    scheduleVersion: 'CONSTRUCTED_SCENARIO_FIRST14_20261013_V1_PROPOSED',
  });
  assert.equal(Object.isFrozen(selected), true);
});
test(
  'v2: real reconstruction source relation selects contracts1 positions6/7 events9',
  {
    skip: !process.env.ECONMIND_B08_REAL_SOURCE_PINS,
  },
  () => {
    const input = JSON.parse(
      readFileSync(process.env.ECONMIND_B08_REAL_SOURCE_PINS, 'utf8'),
    );
    const fact = extractContractCouponFact(asV2(input));
    assertNonAuthority(fact);
    assert.deepEqual(fact.localRelationKey, {
      sharedClaimId: reconstructionClaim,
      component: 'COUPON',
      relativeDueSimDay: 360,
    });
    assert.equal(fact.declaredSource.nativePrincipal, '124656849631.6416');
    assert.equal(fact.declaredSource.annualCoupon, '0.015');
    assert.equal(
      fact.declaredSource.scheduledCouponDueNative,
      '1869852744.474624',
    );
    assert.equal(
      fact.sourceWitnesses.find((w) => w.kind === 'terms').pointer,
      '/contracts/1',
    );
    assert.deepEqual(
      fact.sourceWitnesses
        .filter((w) => w.kind === 'positions')
        .map((w) => w.pointer),
      ['/positions/6', '/positions/7'],
    );
    assert.equal(
      fact.sourceWitnesses.find((w) => w.kind === 'schedule').pointer,
      '/events/9',
    );
  },
);
test('v2: two source instrument keys are independent, not summed mirror payables', () => {
  const a = extractContractCouponFact(asV2(fixture().input, selected.claim));
  const b = extractContractCouponFact(reconstructionFixture().input);
  assert.equal(
    new Set([a, b].map((f) => f.localRelationKey.sharedClaimId)).size,
    2,
  );
  for (const f of [a, b]) {
    assertNonAuthority(f);
    assert.equal(Array.isArray(f), false);
    assert.equal(Object.hasOwn(f, 'totalAmount'), false);
    assert.equal(
      f.originalReferenceTarget,
      'U2544::ENTITY::ENTITY_GOVERNMENT_01::canonicalObligations',
    );
  }
  assert.notEqual(a.factHash, b.factHash);
});
test('v2: reconstruction grace and maturity remain source metadata, not new proration', () => {
  const f = reconstructionFixture();
  assert.equal(f.documents.terms.contracts[0].principalGraceSimDays, 180);
  assert.equal(f.documents.terms.contracts[0].maturitySimDays, 3600);
  const fact = extractContractCouponFact(f.input);
  assert.equal(
    fact.declaredSource.scheduledCouponDueNative,
    '1869852744.474624',
  );
  assert.equal(Object.hasOwn(fact.metadata, 'principalGraceSimDays'), false);
  assert.equal(Object.hasOwn(fact.metadata, 'maturitySimDays'), false);
  assert.equal(fact.actual.simTimeDue, null);
  assert.deepEqual(extractContractCouponFact(f.input), fact);
});
test('v2: reconstruction quoted long-tail values retained without Number conversion', () => {
  const tail = '124656849631.641600000000000000000001';
  const expected = exactDecimalMultiply(tail, '0.015');
  const fact = extractContractCouponFact(
    reconstructionFixture((d) => {
      d.terms.contracts[0].nativePrincipal = tail;
      for (const p of d.positions.positions) p.nativeAmount = tail;
      d.schedule.events[0].couponDueNative = expected;
    }).input,
  );
  assert.equal(fact.declaredSource.nativePrincipal, tail);
  assert.equal(fact.declaredSource.scheduledCouponDueNative, expected);
  assertNonAuthority(fact);
});
for (const claim of [
  'SCENE_OTHER',
  'SCENE_TGA_01_V2',
  'SCENE_RESERVE_01_V2',
  'SCENE_CLEARING_09_24_V2',
  'SCENE_INITIAL_GOV_SECURITY_02_V2',
]) {
  test(`v2: closed table rejects ${claim}`, () => {
    assert.throws(
      () => extractContractCouponFact(asV2(fixture().input, claim)),
      /UNSUPPORTED_COUPON_SELECTION/,
    );
  });
}
for (const [name, change, pattern] of [
  [
    'principal component',
    (i) => {
      i.selection.component = 'PRINCIPAL';
    },
    /BINDING_MISMATCH/,
  ],
  [
    'wrong relative day',
    (i) => {
      i.selection.relativeDueSimDay = 361;
    },
    /SAFE_INTEGER_METADATA_REQUIRED/,
  ],
  [
    'quoted relative day',
    (i) => {
      i.selection.relativeDueSimDay = '360';
    },
    /SAFE_INTEGER_METADATA_REQUIRED/,
  ],
  [
    'extra selection key',
    (i) => {
      i.selection.currency = 'XAA';
    },
    /EXACT_KEYS_REQUIRED/,
  ],
  [
    'extra root key',
    (i) => {
      i.approved = true;
    },
    /EXACT_KEYS_REQUIRED/,
  ],
  [
    'missing selection',
    (i) => {
      delete i.selection;
    },
    /EXACT_KEYS_REQUIRED/,
  ],
  [
    'null selection',
    (i) => {
      i.selection = null;
    },
    /RECORD_REQUIRED/,
  ],
  [
    'missing claim',
    (i) => {
      delete i.selection.sharedClaimId;
    },
    /EXACT_KEYS_REQUIRED/,
  ],
  [
    'unknown schema',
    (i) => {
      i.schemaVersion = 'd-b08-coupon-extraction-input-v3';
    },
    /BINDING_MISMATCH/,
  ],
])
  test(`v2: strict input rejects ${name}`, () => {
    const i = asV2(fixture().input, selected.claim);
    change(i);
    assert.throws(() => extractContractCouponFact(i), pattern);
  });
test('v2: v1 extra selector never enables reconstruction or silently falls back', () => {
  const original = fixture();
  assert.throws(
    () =>
      extractContractCouponFact({
        ...original.input,
        selection: {
          sharedClaimId: reconstructionClaim,
          component: 'COUPON',
          relativeDueSimDay: 360,
        },
      }),
    /EXACT_KEYS_REQUIRED/,
  );
  const onlyReconstruction = reconstructionFixture();
  assert.throws(
    () =>
      extractContractCouponFact({
        schemaVersion: 'd-b08-coupon-extraction-input-v1',
        sources: onlyReconstruction.input.sources,
      }),
    /UNIQUE_ROW_REQUIRED/,
  );
  assert.throws(
    () => extractContractCouponFact(asV2(original.input)),
    /UNIQUE_ROW_REQUIRED/,
  );
});
for (const [name, change, pattern] of [
  [
    'wrong payer',
    (d) => {
      d.terms.contracts[0].borrowerId = 'ENTITY_OPERATOR_01';
    },
    /BINDING_MISMATCH/,
  ],
  [
    'wrong country',
    (d) => {
      d.terms.contracts[0].countryId = 'COUNTRY_02';
    },
    /BINDING_MISMATCH/,
  ],
  [
    'wrong mirror role',
    (d) => {
      d.positions.positions[1].role = 'ASSET';
    },
    /UNIQUE_ROW_REQUIRED/,
  ],
  [
    'wrong counterpart',
    (d) => {
      d.positions.positions[1].counterpartyId = selected.payer;
    },
    /BINDING_MISMATCH/,
  ],
  [
    'wrong currency',
    (d) => {
      d.schedule.events[0].nativeCurrency = 'GCU';
    },
    /BINDING_MISMATCH/,
  ],
  [
    'wrong version',
    (d) => {
      d.positions.positions[0].version = 'OTHER';
    },
    /BINDING_MISMATCH/,
  ],
  [
    'wrong contract pointer',
    (d) => {
      d.schedule.events[0].sourcePointer = '/contracts/1';
    },
    /BINDING_MISMATCH/,
  ],
  [
    'duplicate event',
    (d) => {
      d.schedule.events.push(structuredClone(d.schedule.events[0]));
    },
    /UNIQUE_ROW_REQUIRED/,
  ],
  [
    'unquoted long-tail principal',
    (d) => {
      d.terms.contracts[0].nativePrincipal = JSON.parse(
        '{"amount":124656849631.641600000000000000000001}',
      ).amount;
    },
    /SOURCE_STRING_REQUIRED/,
  ],
  [
    'unquoted rate',
    (d) => {
      d.terms.contracts[0].annualCoupon = 0.015;
    },
    /SOURCE_STRING_REQUIRED/,
  ],
  [
    'missing coupon',
    (d) => {
      delete d.schedule.events[0].couponDueNative;
    },
    /SOURCE_STRING_REQUIRED/,
  ],
])
  test(`v2: second case preserves refusal for ${name}`, () => {
    assert.throws(
      () => extractContractCouponFact(reconstructionFixture(change).input),
      pattern,
    );
  });
