import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  buildCountry01FeeBufferCandidate as construct,
  digest,
  readFixedCountry01FeeBufferInputs,
  type DraftDocument,
  type DraftSlot,
  type FeeBufferDraftInput,
  type CashSlot,
  type NativeReaderInput,
} from '../../tools/unknown2544-c-fee-buffer/country01-candidate.js';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import {
  materializeFinancialOpeningPackageFixture,
  disposeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';

// Only a fixed-IO negative control is mocked. Financial helpers execute their
// genuine existing implementation; no cash/adoption/permission factory is added.
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
type Obj = Record<string, unknown>;
const executedFacts: unknown[] = [];
let fixedReadback: ReturnType<typeof readFixedCountry01FeeBufferInputs> | null =
  null;
function build(input: FeeBufferDraftInput) {
  const result = construct(input);
  if (process.env.C_FEE_BUFFER_EVIDENCE_DIR) {
    const savedInput = {
      ...input,
      cashOverlap:
        input.cashOverlap.tag === 'MISSING'
          ? input.cashOverlap
          : {
              ...input.cashOverlap,
              existingFReaderInput: input.cashOverlap.existingFReaderInput
                ? {
                    ...input.cashOverlap.existingFReaderInput,
                    registry:
                      'EXISTING_GENUINE_TEST_ONLY_LOADER_OPAQUE_HANDLE_NOT_JSON_AUTHORITY',
                  }
                : null,
            },
    };
    executedFacts.push({
      test: expect.getState().currentTestName,
      testEvidenceClass:
        'TEST_ONLY_SYNTHETIC_CALLER_DATA_EXCEPT_SEPARATELY_PINNED_R01_FIXED_NULLS',
      input: structuredClone(savedInput),
      result,
    });
  }
  return result;
}
const obj = (v: unknown) => v as Obj;
const ref = (pointer: string) => ({ pointer });
const period = {
  periodRef: 'TEST_ONLY_PERIOD_A',
  calendarRef: 'TEST_ONLY_CALENDAR',
  fromSimTicks: '0',
  untilSimTicks: '10',
};
const missing = (): DraftSlot => ({
  tag: 'MISSING',
  reason: 'TEST_ONLY_NOT_SUPPLIED',
});
const scope = (currency = 'TST') => ({
  countryId: 'COUNTRY_01',
  liableEntityId: 'ENTITY_GOVERNMENT_01',
  nativeCurrency: currency,
  currencySource: ref('/currencyBinding'),
  period: structuredClone(period),
});
function pack(id: string, payload: Obj, currency = 'TST', extras: Obj = {}) {
  const root = {
    payload,
    currencyBinding: { countryId: 'COUNTRY_01', currency },
    proof: { source: 'TEST_ONLY_EXPLICIT_RULE' },
    ...extras,
  };
  const bytes = JSON.stringify(root);
  const document: DraftDocument = {
    documentId: 'TEST_ONLY_' + id,
    documentVersion: 'TEST_ONLY_V1',
    sourceClass: 'TEST_ONLY',
    bytes,
    byteLength: Buffer.byteLength(bytes),
    sha256: digest(bytes),
  };
  const slot: DraftSlot = {
    tag: 'TEST_ONLY',
    payload: structuredClone(payload),
    sourceLeaf: {
      documentId: document.documentId,
      documentVersion: document.documentVersion,
      sha256: document.sha256,
      pointer: '/payload',
    },
  };
  return { document, slot };
}
const precision = () => ({
  kind: 'EXACT_NO_ROUNDING',
  sourceRef: ref('/proof'),
  maxFractionDigits: '4',
});
function fixture(
  options: {
    kind?: string;
    fixed?: string;
    rate?: string;
    base?: string;
    assessed?: string;
    inclusion?: string;
    currency?: string;
  } = {},
) {
  const currency = options.currency ?? 'TST',
    kind = options.kind ?? 'FIXED_NATIVE';
  const policy = {
    tag: 'FEE_POLICY_DRAFT_V1',
    policyId: 'TEST_ONLY_POLICY',
    policyVersion: 'TEST_ONLY_V1',
    scope: scope(currency),
    payerEntityId: 'ENTITY_GOVERNMENT_01',
    beneficiaryEntityId: 'ENTITY_OPERATOR_01',
    operationKind: 'TEST_ONLY_ADMIN',
    trigger: { kind: 'ELIGIBLE_EVENT', source: ref('/proof') },
    chargeBasis: {
      kind,
      baseDefinition: 'TEST_ONLY_PER_ELIGIBLE_EVENT',
      fixedNative:
        kind === 'FREE_EXPLICIT' || kind === 'FRACTIONAL_NATIVE'
          ? null
          : (options.fixed ?? '2'),
      rateFraction:
        kind === 'FRACTIONAL_NATIVE' || kind === 'COMBINED_EXPLICIT'
          ? (options.rate ?? '0.025')
          : null,
      rateUnit: 'FRACTION_NOT_PERCENT',
      fixedQuoteSource: ref('/payload/chargeBasis/fixedNative'),
      rateSource: ref('/payload/chargeBasis/rateFraction'),
      bothComponentsSelectedSource: ref('/proof'),
      explicitFreeScopeSource: ref('/proof'),
    },
    precision: precision(),
    inclusionRule: {
      feeComponentRefRule: ref('/proof'),
      includedInGrossSource: ref('/proof'),
      crossChargeDedupRule: ref('/proof'),
    },
    validityAndExemptions: {
      effectivePeriod: structuredClone(period),
      expiryOrExplicitNoExpirySource: ref('/proof'),
      exemptionInventoryOrExplicitNoneSource: ref('/proof'),
    },
  };
  const assessed =
    options.assessed ??
    (kind === 'FREE_EXPLICIT'
      ? '0'
      : kind === 'FRACTIONAL_NATIVE'
        ? '2.5'
        : kind === 'COMBINED_EXPLICIT'
          ? '4.5'
          : (options.fixed ?? '2'));
  const inventory = {
    tag: 'FEE_EVENT_INVENTORY_DRAFT_V1',
    inventoryId: 'TEST_ONLY_INVENTORY',
    inventoryVersion: 'TEST_ONLY_V1',
    scope: scope(currency),
    coverage: {
      declaredComplete: true,
      eventPredicateRef: ref('/proof'),
      eligibleUniverseRef: ref('/proof'),
      fromFrontier: ref('/proof'),
      throughFrontier: ref('/proof'),
      completenessSource: ref('/proof'),
    },
    events: [
      {
        sourceEventRef: 'TEST_ONLY_EVENT',
        canonicalChargeRef: 'TEST_ONLY_CHARGE',
        feeComponentRef: 'TEST_ONLY_FEE_COMPONENT',
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        payerEntityId: policy.payerEntityId,
        beneficiaryEntityId: policy.beneficiaryEntityId,
        operationKind: policy.operationKind,
        triggerEvidence: ref('/proof'),
        nativeCurrency: currency,
        period: structuredClone(period),
        nativeBaseOrExplicitNotApplicable:
          kind === 'FREE_EXPLICIT'
            ? 'NOT_APPLICABLE_FREE'
            : kind === 'FIXED_NATIVE'
              ? 'NOT_APPLICABLE_FIXED'
              : (options.base ?? '100'),
        baseSource: ref('/payload/events/0/nativeBaseOrExplicitNotApplicable'),
        grossCoverage: {
          grossComponentRef: 'TEST_ONLY_GROSS',
          grossAmountSource: ref('/grossAmount'),
          feeInclusion: options.inclusion ?? 'EXCLUSIVE',
          feeComponentAmountSourceOrRuleBinding: ref('/assessedFee'),
        },
      },
    ],
  };
  const buffer = {
    tag: 'BUFFER_RULE_DRAFT_V1',
    ruleId: 'TEST_ONLY_BUFFER',
    ruleVersion: 'TEST_ONLY_V1',
    scope: scope(currency),
    legalBasisSource: ref('/proof'),
    method: {
      kind: 'SOURCE_FIXED_NATIVE_REQUIREMENT',
      nativeRequirement: '10',
      amountSource: ref('/payload/method/nativeRequirement'),
    },
    precision: precision(),
    shortfallPrioritySource: ref('/proof'),
    overlapConventionSource: ref('/proof'),
  };
  const p = pack('POLICY', policy, currency),
    e = pack('EVENTS', inventory, currency, {
      grossAmount: '100',
      assessedFee: assessed,
    }),
    b = pack('BUFFER', buffer, currency);
  const input: FeeBufferDraftInput = {
    schema: 'c-country01-fee-buffer-draft-input-v1',
    mode: 'TEST_ONLY',
    countryId: 'COUNTRY_01',
    documents: [p.document, e.document, b.document],
    feePolicy: p.slot,
    feeEvents: e.slot,
    bufferRule: b.slot,
    cashOverlap: missing(),
  };
  return input;
}
type SlotKey = 'feePolicy' | 'feeEvents' | 'bufferRule' | 'cashOverlap';
function change(
  input: FeeBufferDraftInput,
  key: SlotKey,
  path: string[],
  value: unknown,
) {
  const slot = input[key];
  if (slot.tag === 'MISSING') throw Error('TEST_SLOT_MISSING');
  const d = input.documents.find(
    (d) => d.documentId === slot.sourceLeaf.documentId,
  )!;
  const root = JSON.parse(d.bytes) as Obj;
  let target = obj(root.payload);
  for (const part of path.slice(0, -1)) target = obj(target[part]);
  const last = path.at(-1)!;
  if (value === undefined) delete target[last];
  else target[last] = value;
  d.bytes = JSON.stringify(root);
  d.byteLength = Buffer.byteLength(d.bytes);
  d.sha256 = digest(d.bytes);
  slot.payload = structuredClone(root.payload);
  slot.sourceLeaf.sha256 = d.sha256;
}
const field = (input: FeeBufferDraftInput, index: number) =>
  build(input).rows[index]!;
const sourceTraceEntry = (
  document: DraftDocument,
  pointer: string,
  rawLeaf: unknown,
) =>
  expect.objectContaining({
    documentId: document.documentId,
    documentVersion: document.documentVersion,
    sha256: document.sha256,
    byteLength: document.byteLength,
    sourceClass: document.sourceClass,
    sourceCustody: 'NOT_VERIFIED',
    pointer,
    rawLeaf,
  });
const amount = (value: unknown) => obj(value).amount;
const total = (input: FeeBufferDraftInput) =>
  build(input).diagnostics.feeTotalCandidate?.amount;
function noAuthority(input: FeeBufferDraftInput) {
  const x = build(input);
  expect(x.originalFieldsClosed).toBe(0);
  expect(x.sourceAdmitted).toBe(false);
  expect(x.adoptionApplied).toBe(false);
  expect(x.paymentExecuted).toBe(false);
  for (const r of x.rows) {
    expect(r.stableId.startsWith('TEST_ONLY::')).toBe(true);
    expect(Object.values(r.stageFlags)).toEqual([false, false, false, false]);
    expect(Object.values(r.actual)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  }
  return x;
}

let ownedFixture: OwnedFinancialOpeningPackageFixture;
let registry: LoadedFinancialOpeningPackageRegistry;
beforeAll(async () => {
  ownedFixture = await materializeFinancialOpeningPackageFixture();
  console.info(
    'F_FINANCIAL_FIXTURE_BEFORE_LOADER',
    JSON.stringify({
      fixtureRoot: ownedFixture.fixtureRoot,
      io: ownedFixture.io,
    }),
  );
  registry = await (
    await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: ownedFixture.fixtureRoot,
    })
  ).load();
  console.info(
    'F_FINANCIAL_LOADER_RECEIPT',
    JSON.stringify({
      bytesRead: registry.bytesRead,
      receipt: registry.testOnlyReadReceipt,
    }),
  );
});
afterAll(async () => {
  try {
    const out = process.env.C_FEE_BUFFER_EVIDENCE_DIR;
    if (out) {
      const allowed =
        '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261021/C/';
      if (!path.isAbsolute(out) || !path.resolve(out).startsWith(allowed))
        throw Error('C_EVIDENCE_PATH_REQUIRED');
      mkdirSync(out, { recursive: false });
      writeFileSync(
        path.join(out, 'ACTUAL_READBACKS.json'),
        JSON.stringify(
          {
            status: 'EXECUTED_FACTS_NOT_TEST_VERDICT_OR_ADOPTION',
            node: process.version,
            fixedSourceCasesEnabled: fixed,
            fixedReadback,
            fixtureIo: ownedFixture?.io ?? null,
            facts: executedFacts,
            interpretation:
              'Real fixed-source null readback separate from TEST_ONLY numeric controls; use reporter for actual assertion counts',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
    }
  } finally {
    if (ownedFixture) {
      await disposeFinancialOpeningPackageFixture(ownedFixture);
      console.info(
        'F_FINANCIAL_FIXTURE_CLEANUP_COMPLETE',
        ownedFixture.fixtureRoot,
      );
    }
  }
});
function fReader(): NativeReaderInput {
  const expected = {
    worldId: 'WORLD_TEST_ONLY_FEE_BUFFER',
    worldVersion: '0',
    sourceVersion: 'TEST_ONLY_NATIVE_V1',
    asOf: '2026-10-21T00:00:00.000Z',
  };
  const accountId = 'ACCOUNT_TEST_ONLY_FEE_BUFFER';
  const source = {
    schemaVersion: 'native-cash-source-candidate-v1',
    ...expected,
    accounts: [
      {
        worldId: expected.worldId,
        accountId,
        ownerId: 'ENTITY_GOVERNMENT_01',
        countryId: 'COUNTRY_01',
        accountClass: 'CASH',
        currency: 'XAA',
        claimId: null,
        counterpartyEntityId: null,
      },
    ],
    balances: [
      { accountId, currency: 'XAA', amount: '100', asOf: expected.asOf },
    ],
    entityBindings: [
      {
        entityId: 'ENTITY_GOVERNMENT_01',
        accountId,
        sourceHoldingKind: 'CASH',
      },
    ],
    encumbranceAtoms: [
      {
        atomId: 'TEST_ONLY_ATOM',
        accountId,
        currency: 'XAA',
        amount: '4',
        asOf: expected.asOf,
      },
    ],
    restrictionBasis: 'DECLARED_DISJOINT_CASH_ATOMS',
    restrictionsComplete: true,
    restrictions: ['FROZEN', 'PLEDGED', 'EARMARK'].map((kind) => ({
      restrictionId: 'TEST_ONLY_' + kind,
      accountId,
      kind,
      atomIds: ['TEST_ONLY_ATOM'],
    })),
  };
  const bytes = JSON.stringify(source);
  return {
    registry,
    expected,
    document: {
      documentId: 'TEST_ONLY_CASH',
      classification: 'SYNTHETIC_CANDIDATE',
      sourceVersion: expected.sourceVersion,
      asOf: expected.asOf,
      bytes,
      sha256: digest(bytes),
    },
    mappingsBytes: JSON.stringify({
      status: 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
      rows: [
        {
          entityId: 'ENTITY_GOVERNMENT_01',
          countryId: 'COUNTRY_01',
          legacyEntityId: 'GOV-01',
          legacyCountryId: 'visual-territory-01',
          sourceClass:
            'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY',
          actualAccount: null,
          actualHolderAdmission: null,
          actualCurrentAuthorization: null,
        },
      ],
    }),
  };
}
function withCash(
  input = fixture({ currency: 'XAA' }),
  options: {
    bufferCoverage?: string;
    feeCoverage?: string;
    payment?: string;
    financing?: string;
  } = {},
) {
  const native = fReader();
  const noFees = input.feePolicy.tag === 'MISSING';
  const bufferCovered = options.bufferCoverage ?? '0',
    feeCovered = options.feeCoverage ?? '0';
  const portions: Obj[] = [];
  if (bufferCovered !== '0')
    portions.push({
      portionId: 'TEST_ONLY_BUFFER_PART',
      atomId: 'TEST_ONLY_ATOM',
      amount: bufferCovered,
      nativeCurrency: 'XAA',
      period: structuredClone(period),
      source: ref('/payload/sourceCoveragePortions/0/amount'),
    });
  if (feeCovered !== '0')
    portions.push({
      portionId: 'TEST_ONLY_FEE_PART',
      atomId: 'TEST_ONLY_ATOM',
      amount: feeCovered,
      nativeCurrency: 'XAA',
      period: structuredClone(period),
      source: ref(
        '/payload/sourceCoveragePortions/' + portions.length + '/amount',
      ),
    });
  const payments = noFees
    ? []
    : [
        {
          canonicalPaymentComponentRef: 'TEST_ONLY_COMMITTED',
          requiredNative: options.payment ?? '2',
          feeChargeRefs: ['TEST_ONLY_CHARGE'],
          coveredPortionIds: feeCovered === '0' ? [] : ['TEST_ONLY_FEE_PART'],
          source: ref('/payload/feePaymentCoverage/0/requiredNative'),
        },
      ];
  const cash = {
    tag: 'CASH_OVERLAP_DRAFT_V1',
    cashScope: scope('XAA'),
    cashSnapshotBinding: {
      ...native.expected,
      documentSha256: native.document!.sha256,
      periodRef: period.periodRef,
    },
    sourceCoveragePortions: portions,
    feeDemandStatus: 'EXPLICIT_COMPLETE_NO_FEES',
    feePaymentCoverage: payments,
    bufferRestrictionCoverage: {
      requiredNative: '10',
      coveredPortionIds: bufferCovered === '0' ? [] : ['TEST_ONLY_BUFFER_PART'],
      source: ref('/payload/bufferRestrictionCoverage/requiredNative'),
    },
    uncoveredOperandsDisjointProof: ref('/disjoint'),
    explicitFeasibleFinancing: {
      amount: options.financing ?? '0',
      nativeCurrency: 'XAA',
      period: structuredClone(period),
      source: ref('/payload/explicitFeasibleFinancing/amount'),
    },
  };
  const p = pack('CASH_OVERLAP', cash, 'XAA', {
    disjoint: {
      disjoint: true,
      paymentComponentRefs: noFees ? [] : ['TEST_ONLY_COMMITTED'],
      bufferRuleId: 'TEST_ONLY_BUFFER',
    },
  });
  input.documents.push(p.document);
  input.cashOverlap = { ...p.slot, existingFReaderInput: native } as CashSlot;
  return input;
}
const fixed = process.env.C_FEE_BUFFER_FIXED_INPUTS === '1';
it.skipIf(!fixed)(
  'R01 actual fixed3 read stays null, exact feeRule and no authority',
  () => {
    const r = readFixedCountry01FeeBufferInputs();
    fixedReadback = r;
    console.info('F_FINANCIAL_FIXED_NULL_READBACK', JSON.stringify(r));
    const absent: FeeBufferDraftInput = {
      schema: 'c-country01-fee-buffer-draft-input-v1',
      mode: 'DRAFT_ONLY',
      countryId: 'COUNTRY_01',
      documents: [],
      feePolicy: missing(),
      feeEvents: missing(),
      bufferRule: missing(),
      cashOverlap: missing(),
    };
    const view = build(absent);
    expect(view.rows.map((x) => x.stableId)).toEqual(
      r.rows.map((x) => x.stableId),
    );
    expect(
      view.rows.every(
        (x) =>
          x.candidateValue === null &&
          x.actual.value === null &&
          x.originalBinding !== null,
      ),
    ).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(
      r.rows.every(
        (x) => x.actualValue === null && x.sourceLeaf.value === null,
      ),
    ).toBe(true);
    expect(r.feeRule).toBe('UNKNOWN_NOT_ADOPTED');
    expect(r.originalFieldsClosed).toBe(0);
  },
);
it.skipIf(!fixed)(
  'R02 fixed bytes drift and caller selector fail closed',
  () => {
    vi.mocked(readFileSync).mockReturnValueOnce(Buffer.from('{}'));
    expect(() => readFixedCountry01FeeBufferInputs()).toThrow(
      'FIXED_SOURCE_DRIFT',
    );
    expect(() =>
      Reflect.apply(readFixedCountry01FeeBufferInputs, undefined, [
        { selector: 'COUNTRY_02' },
      ]),
    ).toThrow('NO_FIXED_SOURCE_OVERRIDE');
  },
);
it('P01 fixed per-event candidate2, source trace and all actual/adoption false', () => {
  const f = fixture();
  expect(total(f)).toBe('2');
  expect(field(f, 0).candidateStatus).toBe('DRAFT_POLICY_COMPLETE');
  expect(field(f, 0).sourceTrace.length).toBeGreaterThan(1);
  expect(field(f, 1).sourceTrace).toEqual(
    expect.arrayContaining([
      sourceTraceEntry(
        f.documents[0]!,
        '/payload',
        expect.objectContaining({
          precision: precision(),
        }),
      ),
      sourceTraceEntry(
        f.documents[0]!,
        '/payload/chargeBasis/fixedNative',
        '2',
      ),
      sourceTraceEntry(
        f.documents[1]!,
        '/payload/events/0/nativeBaseOrExplicitNotApplicable',
        'NOT_APPLICABLE_FIXED',
      ),
      sourceTraceEntry(f.documents[1]!, '/assessedFee', '2'),
    ]),
  );
  noAuthority(f);
});
it('P02 exact fractional0.025*100=2.5 with inactive fixed null', () => {
  const f = fixture({ kind: 'FRACTIONAL_NATIVE' });
  expect(total(f)).toBe('2.5');
  expect(field(f, 1).sourceTrace).toEqual(
    expect.arrayContaining([
      sourceTraceEntry(
        f.documents[0]!,
        '/payload',
        expect.objectContaining({
          precision: precision(),
        }),
      ),
      sourceTraceEntry(
        f.documents[0]!,
        '/payload/chargeBasis/rateFraction',
        '0.025',
      ),
      sourceTraceEntry(
        f.documents[1]!,
        '/payload/events/0/nativeBaseOrExplicitNotApplicable',
        '100',
      ),
      sourceTraceEntry(f.documents[1]!, '/assessedFee', '2.5'),
    ]),
  );
});
it('P03 explicit mixed2+0.025*100=4.5', () => {
  expect(total(fixture({ kind: 'COMBINED_EXPLICIT' }))).toBe('4.5');
});
it('P04 explicit FREE covered scope, not unknown zero', () => {
  expect(total(fixture({ kind: 'FREE_EXPLICIT' }))).toBe('0');
  const f = fixture();
  f.feePolicy = missing();
  expect(total(f)).toBeUndefined();
});
it('P05 required policy leaves missing block fee only', () => {
  for (const path of [
    ['beneficiaryEntityId'],
    ['trigger'],
    ['precision'],
    ['scope', 'period'],
    ['chargeBasis', 'fixedNative'],
    ['scope', 'currencySource'],
  ]) {
    const f = fixture();
    change(f, 'feePolicy', path, undefined);
    expect(field(f, 0).candidateValue).toBeNull();
    expect(amount(field(f, 2).candidateValue)).toBe('10');
  }
  const f = fixture({ kind: 'FRACTIONAL_NATIVE' });
  change(
    f,
    'feeEvents',
    ['events', '0', 'nativeBaseOrExplicitNotApplicable'],
    undefined,
  );
  expect(total(f)).toBeUndefined();
});
it('P06 fixed inactive rate null valid; active fixed missing is not0', () => {
  const f = fixture();
  expect(total(f)).toBe('2');
  change(f, 'feePolicy', ['chargeBasis', 'fixedNative'], null);
  expect(total(f)).toBeUndefined();
});
it('P07 admin-free policy does not cover debt/FX/refund operation', () => {
  for (const op of ['DEBT', 'FX', 'REFUND']) {
    const f = fixture({ kind: 'FREE_EXPLICIT' });
    change(f, 'feeEvents', ['events', '0', 'operationKind'], op);
    expect(total(f)).toBeUndefined();
  }
});
it('P08 percent/rational/insufficient source precision never rounded', () => {
  for (const rate of ['1%', '1/3']) {
    const f = fixture({ kind: 'FRACTIONAL_NATIVE', rate });
    expect(total(f)).toBeUndefined();
  }
  const f = fixture({ kind: 'FRACTIONAL_NATIVE' });
  change(f, 'feePolicy', ['precision', 'maxFractionDigits'], '0');
  expect(total(f)).toBeUndefined();
});
it('P09 Number inputs and Core decimal-domain overflow rejected', () => {
  const f = fixture();
  change(f, 'feePolicy', ['chargeBasis', 'fixedNative'], 2);
  expect(total(f)).toBeUndefined();
  expect(total(fixture({ fixed: '1'.repeat(121) }))).toBeUndefined();
  const over = fixture({
    kind: 'FRACTIONAL_NATIVE',
    base: '9'.repeat(120),
    rate: '9'.repeat(120),
    assessed: '1',
  });
  expect(total(over)).toBeUndefined();
});
it('E01 events missing does not erase complete policy/buffer', () => {
  const f = fixture();
  f.feeEvents = missing();
  expect(field(f, 0).candidateValue).not.toBeNull();
  expect(field(f, 1).candidateValue).toBeNull();
  expect(amount(field(f, 2).candidateValue)).toBe('10');
});
it('E02 policy missing does not invent policy from events or block buffer', () => {
  const f = fixture();
  f.feePolicy = missing();
  expect(field(f, 0).candidateValue).toBeNull();
  expect(field(f, 1).candidateValue).toBeNull();
  expect(amount(field(f, 2).candidateValue)).toBe('10');
});
it('E03 complete explicit empty event inventory vs missing inventory', () => {
  const f = fixture();
  change(f, 'feeEvents', ['events'], []);
  expect(total(f)).toBe('0');
  change(f, 'feeEvents', ['coverage', 'declaredComplete'], false);
  expect(total(f)).toBeUndefined();
});
it('E04 economic fee alias/component duplication rejected', () => {
  const f = fixture();
  const s = f.feeEvents;
  if (s.tag === 'MISSING') throw Error();
  const e = obj(s.payload).events as Obj[];
  change(
    f,
    'feeEvents',
    ['events'],
    [e[0], { ...e[0], sourceEventRef: 'TEST_ONLY_MESSAGE_ALIAS' }],
  );
  expect(total(f)).toBeUndefined();
});
it('E05 inclusive gross100/fee5 means total5, incremental0, gross100', () => {
  const f = fixture({ fixed: '5', inclusion: 'ALREADY_INCLUDED' }),
    r = build(f);
  expect(r.diagnostics.feeTotalCandidate?.amount).toBe('5');
  expect(r.diagnostics.incrementalFeeForGrossCandidate?.amount).toBe('0');
  expect(r.diagnostics.gross?.grossByBucket[0]?.gross).toBe('100');
  expect(r.diagnostics.gross?.status).toBe('UNKNOWN');
});
it('E06 exclusive gross100+fee5 means total5/gross105', () => {
  const r = build(fixture({ fixed: '5' }));
  expect(r.diagnostics.feeTotalCandidate?.amount).toBe('5');
  expect(r.diagnostics.incrementalFeeForGrossCandidate?.amount).toBe('5');
  expect(r.diagnostics.gross?.grossByBucket[0]?.gross).toBe('105');
});
it('E07 fee already inside committed component deducted once', () => {
  const f = withCash(fixture({ currency: 'XAA', fixed: '5' }), {
      payment: '5',
    }),
    r = build(f);
  expect(r.diagnostics.jointCapacity?.uncoveredPayments.amount).toBe('5');
  expect(r.diagnostics.jointCapacity?.capacity.amount).toBe('81');
});
it('E08 scope/version/inclusion mismatch does not erase buffer', () => {
  for (const [path, value] of [
    [['nativeCurrency'], 'USD'],
    [['payerEntityId'], 'OTHER'],
    [['beneficiaryEntityId'], 'OTHER'],
    [['policyVersion'], 'OTHER'],
    [['grossCoverage', 'feeInclusion'], 'UNKNOWN'],
    [['period', 'periodRef'], 'OTHER'],
  ] as const) {
    const f = fixture();
    change(f, 'feeEvents', ['events', '0', ...path], value);
    expect(total(f)).toBeUndefined();
    expect(amount(field(f, 2).candidateValue)).toBe('10');
  }
});
it('B01 no fee/no declared optional minimum still independent fixed draft10', () => {
  const f = fixture();
  f.feePolicy = missing();
  f.feeEvents = missing();
  const r = build(f);
  expect(amount(r.rows[2]!.candidateValue)).toBe('10');
  expect(r.diagnostics.actualRetainedCash).toBeNull();
  noAuthority(f);
});
it('B02 no declared optional minimum still exact3sim-days*4=12', () => {
  const f = fixture();
  change(f, 'bufferRule', ['method'], {
    kind: 'SOURCE_SIM_DAYS_TIMES_NATIVE_DAILY_BASE',
    simDays: '3',
    daysUnit: 'SIM_DAY',
    daysSource: ref('/payload/method/simDays'),
    dailyBase: '4',
    baseUnit: 'NATIVE_MONEY_PER_SIM_DAY',
    baseSource: ref('/payload/method/dailyBase'),
    baseCoverage: ref('/proof'),
  });
  expect(amount(field(f, 2).candidateValue)).toBe('12');
});
it('B03 declared optional minimum incomplete/conflicting blocks; absent does not', () => {
  for (const minimum of [
    {},
    { amount: '1', source: ref('/proof'), nativeCurrency: 'USD', period },
    { amount: '1', nativeCurrency: 'TST', period },
  ]) {
    const f = fixture();
    change(f, 'bufferRule', ['optionalLegalMinimum'], minimum);
    expect(field(f, 2).candidateValue).toBeNull();
    expect(total(f)).toBe('2');
  }
  for (const path of [
    ['shortfallPrioritySource'],
    ['overlapConventionSource'],
    ['method', 'nativeRequirement'],
  ]) {
    const f = fixture();
    change(f, 'bufferRule', path, undefined);
    expect(field(f, 2).candidateValue).toBeNull();
  }
  const f = fixture();
  expect(amount(field(f, 2).candidateValue)).toBe('10');
});
it('B04 below declared legal minimum or unsupported max method rejected', () => {
  const f = fixture();
  change(f, 'bufferRule', ['optionalLegalMinimum'], {
    amount: '11',
    source: ref('/payload/optionalLegalMinimum/amount'),
    nativeCurrency: 'TST',
    period,
  });
  expect(field(f, 2).candidateValue).toBeNull();
  const g = fixture();
  change(g, 'bufferRule', ['method', 'kind'], 'MAX_DEFAULT');
  expect(field(g, 2).candidateValue).toBeNull();
});
it('O01 existing F UNION counts one atom with three labels once', () => {
  const r = build(withCash());
  expect(
    r.diagnostics.jointCapacity,
    r.diagnostics.jointBlockers.join(';'),
  ).not.toBeNull();
  expect(r.diagnostics.jointCapacity?.restrictedUnion.amount).toBe('4');
  expect(
    r.diagnostics.jointCapacity?.availableAfterExistingRestrictionUnion.amount,
  ).toBe('96');
  expect(r.diagnostics.jointCapacity?.helperCalls).toEqual([
    'readNativeCashSourceCandidate',
    'calculateAvailableFiscalCapacity',
  ]);
});
it('O02 required10 with4 already restricted subtracts only6', () => {
  const f = fixture({ currency: 'XAA' });
  f.feePolicy = missing();
  f.feeEvents = missing();
  const r = build(withCash(f, { bufferCoverage: '4' }));
  expect(r.diagnostics.jointCapacity?.uncoveredBuffer.amount).toBe('6');
  expect(r.diagnostics.jointCapacity?.capacity.amount).toBe('90');
});
it('O03 fee5 with2 already restricted subtracts only3', () => {
  const r = build(
    withCash(fixture({ currency: 'XAA', fixed: '5' }), {
      feeCoverage: '2',
      payment: '5',
    }),
  );
  expect(r.diagnostics.feeTotalCandidate?.amount).toBe('5');
  expect(r.diagnostics.jointCapacity?.uncoveredPayments.amount).toBe('3');
  expect(r.diagnostics.jointCapacity?.capacity.amount).toBe('83');
});
it('O04 duplicate/overclaimed/cross-purpose portions block joint only', () => {
  const f = withCash(fixture({ currency: 'XAA' }), { bufferCoverage: '4' });
  expect(build(f).diagnostics.jointCapacity).not.toBeNull();
  change(
    f,
    'cashOverlap',
    ['bufferRestrictionCoverage', 'coveredPortionIds'],
    ['TEST_ONLY_BUFFER_PART', 'TEST_ONLY_BUFFER_PART'],
  );
  expect(build(f).diagnostics.jointCapacity).toBeNull();
  expect(build(f).diagnostics.jointBlockers).toContain(
    'DUPLICATE_PORTION_CREDIT',
  );
  const g = withCash(fixture({ currency: 'XAA' }), { bufferCoverage: '5' });
  expect(build(g).diagnostics.jointCapacity).toBeNull();
  expect(build(g).diagnostics.jointBlockers).toContain(
    'PORTIONS_EXCEED_RESTRICTED_ATOM',
  );
  const h = withCash(fixture({ currency: 'XAA' }), { bufferCoverage: '2' });
  change(
    h,
    'cashOverlap',
    ['feePaymentCoverage', '0', 'coveredPortionIds'],
    ['TEST_ONLY_BUFFER_PART'],
  );
  expect(build(h).diagnostics.jointCapacity).toBeNull();
  expect(build(h).diagnostics.jointBlockers).toContain(
    'CROSS_PURPOSE_PORTION_REUSE',
  );
  const wrong = withCash();
  change(wrong, 'cashOverlap', ['cashSnapshotBinding', 'asOf'], 'OTHER');
  expect(build(wrong).diagnostics.jointBlockers).toContain(
    'CASH_SNAPSHOT_PERIOD_BINDING_MISMATCH',
  );
  expect(total(h)).toBe('2');
  expect(amount(field(h, 2).candidateValue)).toBe('10');
});
it('O05 signed negative capacity is not clamped or funded', () => {
  const r = build(withCash(fixture({ currency: 'XAA' }), { payment: '200' }));
  expect(r.diagnostics.jointCapacity?.capacity.amount).toBe('-114');
  expect(r.originalFieldsClosed).toBe(0);
});
it('O06 missing cash/financing blocks optional diagnostic, not rows', () => {
  const f = fixture();
  expect(build(f).diagnostics.jointCapacity).toBeNull();
  expect(total(f)).toBe('2');
  const g = withCash();
  change(g, 'cashOverlap', ['explicitFeasibleFinancing'], undefined);
  expect(build(g).diagnostics.jointCapacity).toBeNull();
  expect(amount(field(g, 2).candidateValue)).toBe('10');
});
it('O07 joint calculation retains existing native cash provenance, never admission', () => {
  const input = withCash();
  const native = input.cashOverlap.existingFReaderInput!;
  const result = build(input);
  const joint = result.diagnostics.jointCapacity!;
  expect(joint, result.diagnostics.jointBlockers.join(';')).not.toBeNull();
  expect(joint.nativeCashCandidateSource).toEqual({
    documentId: native.document!.documentId,
    sourceVersion: native.document!.sourceVersion,
    asOf: native.document!.asOf,
    sha256: native.document!.sha256,
    classification: 'SYNTHETIC_CANDIDATE',
    signatureStatus: 'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE',
  });
  expect(joint.nativeCashScope).toEqual(native.expected);
  expect(joint.nativeCashReferenceMappingSha256).toBe(
    digest(native.mappingsBytes),
  );
  expect(joint.nativeCashPackageManifestSha256).toBe(
    registry.packageManifestSha256,
  );
  expect(joint.nativeCashRow).toMatchObject({
    entityId: 'ENTITY_GOVERNMENT_01',
    countryId: 'COUNTRY_01',
    nativeCurrencyCandidate: 'XAA',
    candidateAccount: { accountId: 'ACCOUNT_TEST_ONLY_FEE_BUFFER' },
    candidateBalance: { amount: '100', currency: 'XAA' },
    candidateRestricted: { amount: '4', currency: 'XAA' },
    candidateAvailable: { amount: '96', currency: 'XAA' },
    archiveMeaning: 'CONSTRUCTED_CLAIM_NEVER_ACTUAL_CASH',
    actualAvailableCash: null,
    currentPermission: 'UNKNOWN',
  });
  expect(joint.nativeCashFormalBlockers).toEqual([
    'SOURCE_ADOPTION_UNBOUND',
    'ACTUAL_WORLD_HEAD_AND_CLOCK_UNBOUND',
    'CURRENT_AUTHORIZATION_UNAVAILABLE',
  ]);
  expect(joint.actualRetainedCash).toBeNull();
  noAuthority(input);
});
it('O08 exact cash operand provenance is deterministic, detached and frozen', () => {
  const input = withCash();
  const native = input.cashOverlap.existingFReaderInput!;
  const source = JSON.parse(native.document!.bytes);
  source.balances[0].amount = '9007199254740993.000000000000000001';
  const bytes = JSON.stringify(source);
  input.cashOverlap.existingFReaderInput = {
    ...native,
    document: { ...native.document!, bytes, sha256: digest(bytes) },
  };
  change(
    input,
    'cashOverlap',
    ['cashSnapshotBinding', 'documentSha256'],
    digest(bytes),
  );
  const result = build(input);
  const joint = result.diagnostics.jointCapacity!;
  expect(joint, result.diagnostics.jointBlockers.join(';')).not.toBeNull();
  expect(joint.nativeCashRow.candidateBalance?.amount).toBe(
    '9007199254740993.000000000000000001',
  );
  expect(joint.capacity.amount).toBe('9007199254740977.000000000000000001');
  expect(build(input)).toEqual(result);
  expect(Object.isFrozen(joint.nativeCashRow)).toBe(true);
  expect(Object.isFrozen(joint.nativeCashScope)).toBe(true);
  Object.assign(native.expected, { worldVersion: '99' });
  expect(joint.nativeCashScope.worldVersion).toBe('0');
  expect(joint.nativeCashRow.actualAvailableCash).toBeNull();
});
it('A01 caller flags/issuer reject; unrelated adoption locator stays unverified', () => {
  const f = fixture();
  expect(() =>
    build({ ...f, sourceAdmitted: true } as FeeBufferDraftInput),
  ).toThrow('UNSUPPORTED_AUTHORITY_OR_INPUT_OPTION');
  const slot = f.feePolicy;
  if (slot.tag === 'MISSING') throw Error();
  slot.adoptionLocator = {
    receiptDocumentId: 'B06_OR_R3_UNRELATED_TO_FEE_POLICY',
    receiptVersion: 'V1',
    receiptSha256:
      '968440af89bce122475915823336bbc11e6d481244424aa80bd72ac1bc3ab716',
    receiptPointer: '/exactStableIds',
    claimedTargetDocumentSha256: slot.sourceLeaf.sha256,
    claimedTargetPointer: '/payload',
  };
  const r = noAuthority(f);
  expect(r.rows[0]!.adoptionDiagnostics.applied).toBe(false);
  expect(r.rows[1]!.adoptionDiagnostics.locator).toBeNull();
  expect(r.rows[0]!.candidateValue).not.toBeNull();
  const draft = fixture();
  draft.mode = 'DRAFT_ONLY';
  for (const d of draft.documents) d.sourceClass = 'CONSTRUCTED_DRAFT';
  for (const s of [draft.feePolicy, draft.feeEvents, draft.bufferRule])
    if (s.tag !== 'MISSING') s.tag = 'PRESENT_DRAFT';
  const result = build(draft);
  expect(result.rows[1]!.candidateStatus).toBe('DRAFT_COMPUTED_CHARGES');
  expect(
    result.rows.every(
      (x) =>
        x.actual.value === null &&
        Object.values(x.stageFlags).every((v) => v === false),
    ),
  ).toBe(true);
  expect(result.adoptionApplied).toBe(false);
});
it('A02 typed B06 references need no extra CASH; B07 diagnostic remains separate', () => {
  const f = fixture();
  f.cashOverlap = missing();
  const r = build(f);
  expect(r.rows[0]!.candidateValue).not.toBeNull();
  expect(amount(r.rows[2]!.candidateValue)).toBe('10');
  expect(r.diagnostics.jointCapacity).toBeNull();
  expect(r.paymentExecuted).toBe(false);
});
it('A03 TEST_ONLY documents cannot bind numeric real original-ID evidence', () => {
  const f = fixture();
  f.mode = 'DRAFT_ONLY';
  const r = build(f);
  expect(r.rows.every((x) => x.candidateValue === null)).toBe(true);
  expect(r.rows.every((x) => x.actual.value === null)).toBe(true);
  expect(r.originalFieldsClosed).toBe(0);
});
it('A04 invalid independent slots are isolated', () => {
  const f = fixture();
  change(f, 'feePolicy', ['tag'], 'BROKEN');
  expect(amount(field(f, 2).candidateValue)).toBe('10');
  const g = fixture();
  change(g, 'bufferRule', ['tag'], 'BROKEN');
  expect(total(g)).toBe('2');
  expect(field(g, 2).candidateValue).toBeNull();
  const badBytes = fixture();
  badBytes.documents[0]!.bytes = undefined as never;
  expect(amount(field(badBytes, 2).candidateValue)).toBe('10');
  expect(field(badBytes, 0).blockers).toContain('DOCUMENT_BYTES_REQUIRED');
  const invalidLocator = fixture();
  if (invalidLocator.feePolicy.tag !== 'MISSING')
    invalidLocator.feePolicy.adoptionLocator = 'INVALID';
  expect(field(invalidLocator, 0).candidateValue).toBeNull();
  expect(amount(field(invalidLocator, 2).candidateValue)).toBe('10');
  const cash = withCash();
  change(cash, 'feePolicy', ['tag'], 'BROKEN');
  expect(build(cash).diagnostics.jointBlockers).toContain(
    'FEE_COMPONENT_UNAVAILABLE',
  );
});
it('A05 deterministic replay, detached and recursively immutable output', () => {
  const f = fixture(),
    first = build(f);
  expect(build(f)).toEqual(first);
  f.documents.reverse();
  expect(build(f)).toEqual(first);
  expect(() => {
    first.rows[0]!.actual.value = 'forged' as never;
  }).toThrow();
  change(f, 'feePolicy', ['beneficiaryEntityId'], 'OTHER');
  expect(first.rows[0]!.actual.value).toBeNull();
  expect(obj(first.rows[0]!.candidateValue).beneficiaryEntityId).toBe(
    'ENTITY_OPERATOR_01',
  );
});
