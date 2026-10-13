import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalSerialize, Money } from '@econmind/core';
import {
  formalFinancialMechanismVector,
  formalFinancialTestAdoption,
} from './formal-financial-opening.test.js';
import {
  financialInputSha256,
  parseFormalFinancialOpeningContract,
  type FinancialCrossCbMirror,
  type FinancialSourceReference,
  type FormalFinancialOpeningContract,
} from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import { produceFormalFinancialOpening } from '../../apps/world-worker/src/preparation/formal-financial-opening-producer.js';

type Mutable<T> = T extends readonly (infer E)[]
  ? Mutable<E>[]
  : T extends object
    ? { -readonly [P in keyof T]: Mutable<T[P]> }
    : T;
const copy = <T>(v: T): Mutable<T> =>
  JSON.parse(canonicalSerialize(v)) as Mutable<T>;
const parse = (v: unknown) =>
  parseFormalFinancialOpeningContract(v, formalFinancialTestAdoption());
const run = (v: unknown) =>
  produceFormalFinancialOpening({
    adoption: formalFinancialTestAdoption(),
    contract: parse(v),
  });

/** The SAME original branded loader/vector is reused. New supplemental values
 * are finite MECHANISM_TEST_VECTOR records, never DATA/adoption/native facts.
 * Imported v1 test registrations are selected out in this file's focused run.
 */
function vector(
  nativeCurrency = 'GCU',
  claimId = 'CROSS_CB_TEST_1',
  sharedLc = false,
) {
  const v = copy(formalFinancialMechanismVector('0.4', 'NATIVE', sharedLc));
  const issuer = copy(
    formalFinancialMechanismVector('2.5', 'NATIVE', sharedLc),
  );
  const rename = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(rename);
    if (x && typeof x === 'object')
      return Object.fromEntries(
        Object.entries(x).map(([k, value]) => [
          k,
          k === 'documentId' && value === 'VECTOR_DOCUMENT'
            ? 'ISSUER_DOMESTIC_DOCUMENT'
            : rename(value),
        ]),
      );
    return x;
  };
  v.countries[1] = rename(issuer.countries[1]) as (typeof v.countries)[number];
  v.documents.push({
    ...issuer.documents[0]!,
    documentId: 'ISSUER_DOMESTIC_DOCUMENT',
  });
  v.schemaVersion = 'formal-financial-opening-input-v2';
  v.openingEpoch = 'OPENING_EPOCH_TEST_V2';
  const originBody = {
    sourceClass: 'MECHANISM_TEST_VECTOR' as const,
    version: 'CROSS_CB_RULE_TEST_V2',
    rulesHash: 'a'.repeat(64),
    paramsHash: 'b'.repeat(64),
    openingEpoch: v.openingEpoch,
    valueDate: v.valueDate,
  };
  const document = (
    documentId: string,
    version: string,
    body: unknown,
  ): FinancialSourceReference => {
    const bytes = canonicalSerialize([body]);
    v.documents.push({
      documentId,
      sourcePath: 'mechanism-vectors/' + documentId + '.json',
      version,
      valueDate: v.valueDate,
      bytes,
      sha256: financialInputSha256(bytes),
    });
    return { documentId, pointer: '/0' };
  };
  v.scenarioOrigin = {
    sourceClass: originBody.sourceClass,
    version: originBody.version,
    rulesHash: originBody.rulesHash,
    paramsHash: originBody.paramsHash,
    source: document(
      'SCENARIO_ORIGIN_DOCUMENT',
      originBody.version,
      originBody,
    ),
  };
  const adoption = formalFinancialTestAdoption(),
    creditor = v.countries[0]!,
    debtor = v.countries[1]!;
  const claimBody = {
    financialClaimId: claimId,
    instrumentCode: 'MECHANISM_ONLY_CROSS_CB_INSTRUMENT',
    assetCategory: 'OTHER_CENTRAL_BANK_ASSETS' as const,
    liabilityCategory: 'OTHER_CENTRAL_BANK_LIABILITIES' as const,
    creditorCountryId: creditor.countryId,
    creditorEntityId: adoption.manifest.countries.find(
      (c) => c.countryId === creditor.countryId,
    )!.holderRoster.centralBank,
    issuerCountryId: debtor.countryId,
    issuerEntityId: adoption.manifest.countries.find(
      (c) => c.countryId === debtor.countryId,
    )!.holderRoster.centralBank,
    openingOutstandingAmount: '10.25',
    currency: nativeCurrency,
    openingEpoch: v.openingEpoch,
    valueDate: v.valueDate,
    expiryDate: null,
  };
  const metadata = {
    sourceClass: originBody.sourceClass,
    rulesHash: originBody.rulesHash,
    paramsHash: originBody.paramsHash,
  };
  v.crossCbClaims = [
    {
      ...claimBody,
      source: document('CANONICAL_CLAIM_DOCUMENT', originBody.version, {
        ...claimBody,
        ...metadata,
      }),
    },
  ];
  for (const c of v.countries) c.cbRegister.crossCbMirrors = [];
  for (const [c, role, category, owner, rate] of [
    [
      creditor,
      'ASSET',
      claimBody.assetCategory,
      claimBody.creditorEntityId,
      '0.4',
    ],
    [
      debtor,
      'LIABILITY',
      claimBody.liabilityCategory,
      claimBody.issuerEntityId,
      '2.5',
    ],
  ] as const) {
    const val = {
      nativeCurrency,
      bookCurrency: c.localCurrency,
      localCurrencyPerUnit: nativeCurrency === c.localCurrency ? '1' : rate,
      quoteDirection: 'BOOK_LC_PER_NATIVE_UNIT' as const,
      version:
        nativeCurrency === 'GCU'
          ? c.openingFx.version
          : 'DIRECT_USD_QUOTE_TEST',
      valueDate: v.valueDate,
    };
    const valuation = {
      ...val,
      source: document(role + '_VALUATION_DOCUMENT', val.version, {
        ...val,
        countryId: c.countryId,
        financialClaimId: claimId,
        openingEpoch: v.openingEpoch,
        ...metadata,
      }),
    };
    const body = {
      holdingId: 'MIRROR_' + role + '_' + claimId,
      financialClaimId: claimId,
      recordOwnerCb: owner,
      role,
      category,
      claim: claimBody,
      valuation: val,
    };
    const mirror: FinancialCrossCbMirror = {
      ...body,
      valuation,
      source: document(role + '_MIRROR_DOCUMENT', c.cbRegister.version, {
        countryId: c.countryId,
        valueDate: v.valueDate,
        openingEpoch: v.openingEpoch,
        ...body,
        ...metadata,
      }),
    };
    c.cbRegister.crossCbMirrors!.push(copy(mirror));
  }
  return synchronize(v);
}

/** Rebind ordinary JSON evidence after semantic negative mutations. This does
 * not create adoption and deliberately does not reconcile conflicting tuples.
 */
function synchronize(v: Mutable<FormalFinancialOpeningContract>) {
  const docs = new Map(
    v.documents.map((d) => [d.documentId, JSON.parse(d.bytes) as unknown[]]),
  );
  const set = (s: FinancialSourceReference, body: unknown) => {
    docs.get(s.documentId)![Number(s.pointer.slice(1))] = body;
  };
  const origin = v.scenarioOrigin!;
  const metadata = {
    sourceClass: origin.sourceClass,
    rulesHash: origin.rulesHash,
    paramsHash: origin.paramsHash,
  };
  set(origin.source, {
    ...metadata,
    version: origin.version,
    openingEpoch: v.openingEpoch,
    valueDate: v.valueDate,
  });
  for (const claim of v.crossCbClaims!) {
    const { source, ...body } = claim;
    set(source, { ...body, ...metadata });
  }
  for (const c of v.countries) {
    for (const loan of c.bankLoans) {
      const { source, ...body } = loan;
      set(source, { countryId: c.countryId, valueDate: v.valueDate, ...body });
    }
    for (const cat of c.cbRegister.categories) {
      cat.disposition =
        c.cbRegister.holdings.some((h) => h.category === cat.category) ||
        c.cbRegister.crossCbMirrors!.some((m) => m.category === cat.category)
          ? 'DECLARED'
          : 'NO_DECLARED_INSTRUMENT';
      set(cat.source, {
        countryId: c.countryId,
        category: cat.category,
        disposition: cat.disposition,
      });
    }
    set(c.cbRegister.source, {
      countryId: c.countryId,
      version: c.cbRegister.version,
      valueDate: v.valueDate,
      categories: c.cbRegister.categories
        .map(({ category, disposition }) => ({ category, disposition }))
        .sort((a, b) => (a.category < b.category ? -1 : 1)),
      holdingIds: c.cbRegister.holdings.map((h) => h.holdingId).sort(),
      crossCbHoldingIds: c.cbRegister
        .crossCbMirrors!.map((m) => m.holdingId)
        .sort(),
    });
    for (const m of c.cbRegister.crossCbMirrors!) {
      const { source: valuationSource, ...valuation } = m.valuation;
      set(valuationSource, {
        ...valuation,
        countryId: c.countryId,
        financialClaimId: m.financialClaimId,
        openingEpoch: v.openingEpoch,
        ...metadata,
      });
      set(m.source, {
        countryId: c.countryId,
        valueDate: v.valueDate,
        openingEpoch: v.openingEpoch,
        holdingId: m.holdingId,
        financialClaimId: m.financialClaimId,
        recordOwnerCb: m.recordOwnerCb,
        role: m.role,
        category: m.category,
        claim: m.claim,
        valuation,
        ...metadata,
      });
    }
  }
  v.documents = v.documents.map((d) => {
    const bytes = canonicalSerialize(docs.get(d.documentId));
    return { ...d, bytes, sha256: financialInputSha256(bytes) };
  });
  return v;
}

function appendPair(
  v: ReturnType<typeof vector>,
  claimId: string,
  amount: string,
) {
  const appendReference = (source: FinancialSourceReference) => {
    const d = v.documents.find((d) => d.documentId === source.documentId)!;
    const rows = JSON.parse(d.bytes) as unknown[];
    const pointer = '/' + rows.length;
    rows.push({});
    d.bytes = canonicalSerialize(rows);
    d.sha256 = financialInputSha256(d.bytes);
    return { documentId: d.documentId, pointer };
  };
  const claim = {
    ...copy(v.crossCbClaims![0]!),
    financialClaimId: claimId,
    openingOutstandingAmount: amount,
    source: appendReference(v.crossCbClaims![0]!.source),
  };
  v.crossCbClaims!.push(claim);
  const { source, ...body } = claim;
  void source;
  for (const c of v.countries) {
    const original = c.cbRegister.crossCbMirrors![0];
    if (!original) continue;
    const mirror = copy(original);
    mirror.holdingId = 'MIRROR_' + mirror.role + '_' + claimId;
    mirror.financialClaimId = claimId;
    mirror.claim = body;
    mirror.source = appendReference(original.source);
    mirror.valuation.source = appendReference(original.valuation.source);
    c.cbRegister.crossCbMirrors!.push(mirror);
  }
  return synchronize(v);
}

describe('cross-CB v2 exact unadopted composition', () => {
  it.each(['GCU', 'USD'])(
    'composes one native %s pair with distinct source hashes, unequal book LC and null external seed',
    (currency) => {
      const v = vector(currency),
        before = canonicalSerialize(v),
        result = run(v);
      expect(result.blockers).toHaveLength(3);
      expect(result).toMatchObject({
        status: 'BLOCKED',
        seed: null,
        admissionAllowed: false,
        activationAllowed: false,
      });
      expect(
        result.candidate,
        canonicalSerialize(result.blockers),
      ).not.toBeNull();
      const candidate = result.candidate!,
        claim = v.crossCbClaims![0]!;
      const legs = candidate.financialBatches
        .flatMap((b) => b.legs)
        .filter((l) => l.account.claimId === claim.financialClaimId);
      expect(legs).toHaveLength(2);
      const asset = legs.find((l) => l.account.accountClass === 'ASSET')!,
        liability = legs.find((l) => l.account.accountClass === 'LIABILITY')!;
      expect(asset.account.countryId).toBe(claim.creditorCountryId);
      expect(liability.account.countryId).toBe(claim.issuerCountryId);
      expect(asset.amount.toCanonicalValue()).toEqual({
        amount: '10.25',
        currency,
      });
      expect(liability.amount.toCanonicalValue()).toEqual(
        asset.amount.toCanonicalValue(),
      );
      expect(asset.account.counterpartyEntityId).toBe(
        liability.account.ownerId,
      );
      expect(liability.account.counterpartyEntityId).toBe(
        asset.account.ownerId,
      );
      expect(asset.counterpartLegId).toBe(liability.legId);
      expect(liability.counterpartLegId).toBe(asset.legId);
      const evidence = candidate.crossCbClaimEvidence![0]!;
      expect(evidence.financialClaimId).toBe(claim.financialClaimId);
      expect(evidence.mirrors.map((m) => m.role)).toEqual([
        'ASSET',
        'LIABILITY',
      ]);
      const refs = evidence.mirrors.map(
        (m) =>
          v.documents.find((d) => d.documentId === m.source.documentId)!.sha256,
      );
      expect(refs[0]).not.toBe(refs[1]);
      expect(
        Money.from(claim.openingOutstandingAmount, currency)
          .amount.mul('0.4')
          .toFixed(),
      ).toBe('4.1');
      expect(
        Money.from(claim.openingOutstandingAmount, currency)
          .amount.mul('2.5')
          .toFixed(),
      ).toBe('25.625');
      expect(
        candidate.financialBatches.filter(
          (b) => b.settlementCurrency === currency,
        ),
      ).toHaveLength(1);
      expect(
        candidate.reconciliations.find(
          (r) => r.countryId === claim.creditorCountryId,
        )!.cbAssets.amount,
      ).toBe('4.9');
      const issuerSource =
        formalFinancialTestAdoption().manifest.countries.find(
          (c) => c.countryId === claim.issuerCountryId,
        )!;
      const expectedIssuerLiabilities = Money.from(
        issuerSource.rawFinance.treasuryCentralBankBalance,
        'GCU',
      )
        .add(Money.from(issuerSource.rawFinance.bankReserveAssets, 'GCU'))
        .amount.mul('2.5')
        .add('25.625')
        .toFixed();
      expect(
        candidate.reconciliations.find(
          (r) => r.countryId === claim.issuerCountryId,
        )!.cbLiabilities.amount,
      ).toBe(expectedIssuerLiabilities);
      for (const [owner, amount, direction] of [
        [
          claim.creditorEntityId,
          currency === 'GCU' ? '12.25' : '10.25',
          'CREDIT',
        ],
        [claim.issuerEntityId, currency === 'GCU' ? '8.25' : '10.25', 'DEBIT'],
      ]) {
        const equity = candidate.financialBatches
          .flatMap((b) => b.legs)
          .filter(
            (l) =>
              l.account.ownerId === owner &&
              l.account.accountClass === 'EQUITY' &&
              l.amount.currency === currency,
          );
        expect(equity).toHaveLength(1);
        expect(equity[0]!.amount.toCanonicalValue().amount).toBe(amount);
        expect(equity[0]!.direction).toBe(direction);
      }
      for (const b of candidate.financialBatches) {
        const equity = b.legs.filter(
          (l) => l.account.accountClass === 'EQUITY',
        );
        expect(
          new Set(
            equity.map((l) =>
              canonicalSerialize([
                l.account.countryId,
                l.account.ownerId,
                l.amount.currency,
              ]),
            ),
          ).size,
        ).toBe(equity.length);
        const sum = (direction: string) =>
          b.legs
            .filter((l) => l.direction === direction)
            .reduce(
              (total, l) => total.add(l.amount),
              Money.from('0', b.settlementCurrency),
            );
        expect(sum('DEBIT').toCanonicalValue()).toEqual(
          sum('CREDIT').toCanonicalValue(),
        );
      }
      expect(canonicalSerialize(v)).toBe(before);
    },
  );
  it('composes multiple pairs and shared local-currency owners into one batch and one full native equity partition', () => {
    const v = appendPair(
      vector('GCU', 'CROSS_CB_TEST_1', true),
      'CROSS_CB_TEST_2',
      '2.75',
    );
    const result = run(v);
    expect(
      result.candidate,
      canonicalSerialize(result.blockers),
    ).not.toBeNull();
    const candidate = result.candidate!;
    expect(candidate.crossCbClaimEvidence).toHaveLength(2);
    const allLegs = candidate.financialBatches.flatMap((b) => b.legs);
    for (const claim of v.crossCbClaims!)
      expect(
        allLegs.filter((l) => l.account.claimId === claim.financialClaimId),
      ).toHaveLength(2);
    expect(
      candidate.financialBatches.filter(
        (b) => b.settlementCurrency === v.countries[0]!.localCurrency,
      ),
    ).toHaveLength(1);
    const owner = v.crossCbClaims![0]!.creditorEntityId;
    const equity = allLegs.filter(
      (l) =>
        l.account.ownerId === owner &&
        l.account.accountClass === 'EQUITY' &&
        l.amount.currency === 'GCU',
    );
    expect(equity).toHaveLength(1);
    expect(equity[0]!.amount.toCanonicalValue().amount).toBe('15');
    const shuffled = copy(v);
    shuffled.crossCbClaims!.reverse();
    shuffled.countries.reverse();
    for (const c of shuffled.countries) c.cbRegister.crossCbMirrors!.reverse();
    expect(run(shuffled).candidate!.fingerprint).toBe(candidate.fingerprint);
  });
  it('requires identity quote one for native local currency without defaulting other direct FX', () => {
    const v = vector('LAA');
    expect(
      run(v).candidate,
      canonicalSerialize(run(v).blockers),
    ).not.toBeNull();
    v.countries[0]!.cbRegister.crossCbMirrors![0]!.valuation.localCurrencyPerUnit =
      '0.4';
    expect(() => parse(synchronize(v))).toThrow('CROSS_CB_VALUATION_INVALID');
  });
  it('returns no partial candidate when the last country has a source-linked but inconsistent bank loan', () => {
    const v = vector(),
      country = v.countries.at(-1)!;
    if (country.bankLoans.length === 0) {
      const d = v.documents.find((d) => d.documentId === 'VECTOR_DOCUMENT')!;
      const rows = JSON.parse(d.bytes) as unknown[];
      const body = {
        loanId: 'LOAN_LAST_COUNTRY_MECHANISM_ONLY',
        borrowerId: formalFinancialTestAdoption().manifest.countries.find(
          (c) => c.countryId === country.countryId,
        )!.holderRoster.operator,
        amount: '1',
        currency: country.localCurrency,
      };
      country.bankLoans.push({
        ...body,
        source: { documentId: d.documentId, pointer: '/' + rows.length },
      });
      rows.push({
        countryId: country.countryId,
        valueDate: v.valueDate,
        ...body,
      });
      d.bytes = canonicalSerialize(rows);
      d.sha256 = financialInputSha256(d.bytes);
    }
    const loan = country.bankLoans[0]!;
    loan.amount = Money.from(loan.amount, loan.currency)
      .add(Money.from('1', loan.currency))
      .toCanonicalValue().amount;
    const result = run(synchronize(v));
    expect(result.candidate).toBeNull();
    expect(result.seed).toBeNull();
    expect(result.blockers.at(-1)).toMatchObject({
      code: 'BANK_LOAN_SOURCE_TOTAL_MISMATCH',
      field: country.countryId,
    });
  });
  it.each(['499500000.0', '199800000.0', '874125000.00', '149850000.0'])(
    'does not convert unadopted referenceGcu %s into an outstanding native claim',
    (referenceGcu) => {
      const v = vector();
      Object.assign(v.crossCbClaims![0]!, {
        financialClaimId: null,
        openingOutstandingAmount: null,
        currency: null,
        referenceGcu,
      });
      expect(() => parse(v)).toThrow('EXACT_KEYS_REQUIRED');
    },
  );
  it('canonicalizes shuffled countries/documents/mirrors while retaining the original claim and both refs', () => {
    const v = vector(),
      expected = run(v).candidate!;
    const shuffled = copy(v);
    shuffled.countries.reverse();
    shuffled.documents.reverse();
    for (const c of shuffled.countries) {
      c.cbRegister.categories.reverse();
      c.cbRegister.holdings.reverse();
      c.cbRegister.crossCbMirrors!.reverse();
    }
    expect(run(shuffled).candidate!.fingerprint).toBe(expected.fingerprint);
  });
  it.each([
    ['RESERVE_SWAP_RECEIVABLES', 'RESERVE_SWAP_PAYABLES'],
    ['ACCRUED_INTEREST_RECEIVABLE', 'ACCRUED_INTEREST_PAYABLE'],
    ['OTHER_CENTRAL_BANK_ASSETS', 'OTHER_CENTRAL_BANK_LIABILITIES'],
  ] as const)(
    'represents the closed category pair %s/%s without adopting instrument economics',
    (assetCategory, liabilityCategory) => {
      const v = vector();
      Object.assign(v.crossCbClaims![0]!, { assetCategory, liabilityCategory });
      for (const c of v.countries)
        for (const m of c.cbRegister.crossCbMirrors!) {
          Object.assign(m.claim, { assetCategory, liabilityCategory });
          m.category = m.role === 'ASSET' ? assetCategory : liabilityCategory;
        }
      const result = run(synchronize(v));
      expect(
        result.candidate,
        canonicalSerialize(result.blockers),
      ).not.toBeNull();
      expect(result.admissionAllowed).toBe(false);
      expect(result.seed).toBeNull();
    },
  );
  it('preserves distinct endpoint source versions as well as document hashes and pointers', () => {
    const v = vector(),
      c = v.countries[1]!,
      version = 'ISSUER_REGISTER_TEST_V2';
    const priorDoc = v.documents.find(
      (d) => d.documentId === 'ISSUER_DOMESTIC_DOCUMENT',
    )!;
    v.documents.push({
      ...copy(priorDoc),
      documentId: 'ISSUER_REGISTER_DOCUMENT_V2',
      version,
    });
    c.cbRegister.version = version;
    c.cbRegister.source.documentId = 'ISSUER_REGISTER_DOCUMENT_V2';
    for (const h of c.cbRegister.holdings)
      h.source.documentId = 'ISSUER_REGISTER_DOCUMENT_V2';
    for (const cat of c.cbRegister.categories)
      cat.source.documentId = 'ISSUER_REGISTER_DOCUMENT_V2';
    v.documents.find(
      (d) =>
        d.documentId === c.cbRegister.crossCbMirrors![0]!.source.documentId,
    )!.version = version;
    const result = run(synchronize(v));
    expect(
      result.candidate,
      canonicalSerialize(result.blockers),
    ).not.toBeNull();
    const mirrors = result.candidate!.crossCbClaimEvidence![0]!.mirrors;
    expect(
      v.documents.find((d) => d.documentId === mirrors[0]!.source.documentId)!
        .version,
    ).not.toBe(
      v.documents.find((d) => d.documentId === mirrors[1]!.source.documentId)!
        .version,
    );
    expect(mirrors[0]!.source.documentId).not.toBe(
      mirrors[1]!.source.documentId,
    );
  });
  it('rejects unsupported category pairs, real invalid expiry dates and bounded-array excess before output', () => {
    const badPair = vector();
    badPair.crossCbClaims![0]!.liabilityCategory = 'RESERVE_SWAP_PAYABLES';
    expect(() => parse(synchronize(badPair))).toThrow(
      'CROSS_CB_INSTRUMENT_INVALID',
    );
    const badDate = vector();
    badDate.crossCbClaims![0]!.expiryDate = '2026-02-30';
    expect(() => parse(synchronize(badDate))).toThrow('VALUE_DATE_INVALID');
    const manyClaims = vector();
    manyClaims.crossCbClaims = Array.from({ length: 17921 }, () =>
      copy(manyClaims.crossCbClaims![0]!),
    );
    expect(() => parse(manyClaims)).toThrow('BOUNDED_ARRAY_REQUIRED');
    const manyMirrors = vector();
    manyMirrors.countries[0]!.cbRegister.crossCbMirrors = Array.from(
      { length: 513 },
      () => copy(manyMirrors.countries[0]!.cbRegister.crossCbMirrors![0]!),
    );
    expect(() => parse(manyMirrors)).toThrow('BOUNDED_ARRAY_REQUIRED');
  });
  it.each([
    'currency',
    'openingOutstandingAmount',
    'openingEpoch',
    'instrumentCode',
    'creditorEntityId',
    'issuerCountryId',
    'expiryDate',
  ] as const)('rejects same claim ID changed mirror tuple: %s', (field) => {
    const v = vector(),
      claim = v.countries[0]!.cbRegister.crossCbMirrors![0]!.claim;
    Object.assign(claim, {
      [field]: field === 'expiryDate' ? '2027-01-01' : 'DIFFERENT',
    });
    expect(() => parse(synchronize(v))).toThrow('CROSS_CB_CLAIM_CONFLICT');
  });
  it('rejects canonical duplicates rather than treating source hashes/endpoints as a second claim key', () => {
    const v = vector();
    v.crossCbClaims!.push(copy(v.crossCbClaims![0]!));
    expect(() => parse(v)).toThrow('DUPLICATE_CROSS_CB_CLAIM');
  });
  it.each(['missing', 'duplicate-role', 'third'] as const)(
    'rejects incomplete or extra mirror coverage: %s',
    (fault) => {
      const v = vector();
      if (fault === 'missing') v.countries[1]!.cbRegister.crossCbMirrors = [];
      else if (fault === 'duplicate-role')
        v.countries[1]!.cbRegister.crossCbMirrors![0]!.role = 'ASSET';
      else
        v.countries[0]!.cbRegister.crossCbMirrors!.push({
          ...copy(v.countries[0]!.cbRegister.crossCbMirrors![0]!),
          holdingId: 'THIRD_MIRROR',
        });
      expect(() => parse(synchronize(v))).toThrow();
    },
  );
  it.each([
    'bank',
    'unknown-country',
    'same-country',
    'wrong-owner',
    'wrong-category',
  ] as const)(
    'rejects invalid endpoint identity/role/category: %s',
    (fault) => {
      const v = vector(),
        claim = v.crossCbClaims![0]!,
        mirror = v.countries[0]!.cbRegister.crossCbMirrors![0]!;
      if (fault === 'bank')
        claim.creditorEntityId =
          formalFinancialTestAdoption().manifest.countries[0]!.holderRoster.bank;
      if (fault === 'unknown-country')
        claim.creditorCountryId = 'COUNTRY_UNKNOWN';
      if (fault === 'same-country')
        claim.issuerCountryId = claim.creditorCountryId;
      if (fault === 'wrong-owner') mirror.recordOwnerCb = claim.issuerEntityId;
      if (fault === 'wrong-category') mirror.category = claim.liabilityCategory;
      expect(() => parse(synchronize(v))).toThrow();
    },
  );
  it.each(['0', '-1', '1.00', '1e3', null, '9'.repeat(121)])(
    'rejects missing/nonpositive/noncanonical native outstanding %s',
    (amount) => {
      const v = vector();
      Object.assign(v.crossCbClaims![0]!, { openingOutstandingAmount: amount });
      expect(() => parse(synchronize(v))).toThrow();
    },
  );
  it.each([
    'rate',
    'version',
    'date',
    'direction',
    'book-currency',
    'native-currency',
  ] as const)(
    'rejects independently rehashed invalid direct quote %s',
    (fault) => {
      const v = vector(),
        val = v.countries[1]!.cbRegister.crossCbMirrors![0]!.valuation;
      if (fault === 'rate') val.localCurrencyPerUnit = '1';
      if (fault === 'version') val.version = 'WRONG_VERSION';
      if (fault === 'date') val.valueDate = '2026-10-09';
      if (fault === 'direction')
        Object.assign(val, { quoteDirection: 'NATIVE_PER_LC' });
      if (fault === 'book-currency') val.bookCurrency = 'USD';
      if (fault === 'native-currency') val.nativeCurrency = 'USD';
      expect(() => parse(synchronize(v))).toThrow();
    },
  );
  it('refuses expired outstanding rather than deleting/writing off the source claim', () => {
    const v = vector();
    v.crossCbClaims![0]!.expiryDate = '2026-10-09';
    expect(() => parse(synchronize(v))).toThrow('CROSS_CB_CLAIM_EXPIRED');
  });
  it.each(['claim', 'mirror', 'valuation', 'origin', 'contract'] as const)(
    'rejects unknown exact v2 keys: %s',
    (where) => {
      const v = vector(),
        mirror = v.countries[0]!.cbRegister.crossCbMirrors![0]!;
      const target =
        where === 'claim'
          ? v.crossCbClaims![0]!
          : where === 'mirror'
            ? mirror
            : where === 'valuation'
              ? mirror.valuation
              : where === 'origin'
                ? v.scenarioOrigin!
                : v;
      Object.assign(target, { approved: true });
      expect(() => parse(v)).toThrow('EXACT_KEYS_REQUIRED');
    },
  );
  it('binds scenario classification/rules/params and real document hashes; cannot relabel mechanism source as historical', () => {
    for (const fault of ['hash', 'rules', 'params', 'class']) {
      const v = vector();
      if (fault === 'hash') v.documents.at(-1)!.sha256 = 'f'.repeat(64);
      if (fault === 'rules') v.scenarioOrigin!.rulesHash = 'c'.repeat(64);
      if (fault === 'params') v.scenarioOrigin!.paramsHash = 'd'.repeat(64);
      if (fault === 'class')
        Object.assign(v.scenarioOrigin!, { sourceClass: 'HISTORICAL' });
      expect(() => parse(v)).toThrow();
    }
  });
  it('supports empty cross arrays without widening v1 keys or formal seed admission', () => {
    const v = vector();
    v.crossCbClaims = [];
    for (const c of v.countries) c.cbRegister.crossCbMirrors = [];
    const result = run(synchronize(v));
    expect(
      result.candidate,
      canonicalSerialize(result.blockers),
    ).not.toBeNull();
    expect(result.seed).toBeNull();
    const v1 = formalFinancialMechanismVector();
    expect(() => parse({ ...v1, openingEpoch: 'EXTRA_V2' })).toThrow(
      'EXACT_KEYS_REQUIRED',
    );
  });
  it('rejects a DATA claim ID aliasing a domestic deterministic native claim before any candidate escapes', () => {
    const base = formalFinancialMechanismVector('0.4'),
      c = base.countries[0]!;
    const claimId =
      'CLAIM_' +
      financialInputSha256(
        canonicalSerialize([base.worldId, c.countryId, 'TGA', c.localCurrency]),
      ).toUpperCase();
    const result = run(vector('GCU', claimId));
    expect(result.candidate).toBeNull();
    expect(result.blockers.at(-1)!.code).toBe('CROSS_CB_CLAIM_CONFLICT');
  });
  it('fails all-or-null for a valid 120-digit operand whose exact composition/valuation overflows', () => {
    const v = vector(),
      amount = '9'.repeat(120);
    v.crossCbClaims![0]!.openingOutstandingAmount = amount;
    for (const c of v.countries)
      for (const m of c.cbRegister.crossCbMirrors!)
        m.claim.openingOutstandingAmount = amount;
    const result = run(synchronize(v));
    expect(result.candidate).toBeNull();
    expect(result.seed).toBeNull();
    expect(result.status).toBe('BLOCKED');
  });
  it('cannot import reference-only GCU flows lacking native claim/FX or use fake adoption', () => {
    const v = vector();
    Object.assign(v.crossCbClaims![0]!, {
      openingOutstandingAmount: null,
      currency: null,
    });
    expect(() => parse(synchronize(v))).toThrow();
    expect(() =>
      parseFormalFinancialOpeningContract(vector(), {
        ...formalFinancialTestAdoption(),
      }),
    ).toThrow('REAL_NON_ACTIVATED_ADOPTION_REQUIRED');
  });
});

// Separate real Node/Vitest processes rehydrate the same genuine adoption.
// Only the finite JSON mechanism input crosses processes; no authority brand,
// production DATA source, compiled stale Worker dist or mocked parser is used.
if (process.env.FINANCIAL_CROSS_CB_LOCALE_CHILD === '1') {
  it('financial cross-locale child proof', () => {
    const input = readFileSync(
      process.env.FINANCIAL_CROSS_CB_LOCALE_INPUT!,
      'utf8',
    );
    const parsed = parse(JSON.parse(input));
    const result = produceFormalFinancialOpening({
      adoption: formalFinancialTestAdoption(),
      contract: parsed,
    });
    expect(result).toMatchObject({
      status: 'BLOCKED',
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
    });
    expect(result.candidate).not.toBeNull();
    const candidate = result.candidate!;
    writeFileSync(
      process.env.FINANCIAL_CROSS_CB_LOCALE_OUTPUT!,
      JSON.stringify({
        locale: new Intl.Collator().resolvedOptions().locale,
        collationAA_AB: Math.sign(new Intl.Collator().compare('AA', 'AB')),
        inputSha256: financialInputSha256(input),
        parsedCanonical: canonicalSerialize(parsed),
        contractFingerprint: candidate.contractFingerprint,
        batchesCanonical: canonicalSerialize(candidate.financialBatches),
        booksCanonical: canonicalSerialize(candidate.reconciliations),
        candidateCanonical: canonicalSerialize(candidate),
        candidateFingerprint: candidate.fingerprint,
        mirrorIds: parsed.countries[0]!.cbRegister.crossCbMirrors!.map(
          (m) => m.holdingId,
        ),
      }) + '\n',
    );
  });
} else {
  it('cross-CB v2 locale-independent real-process canonical contract, native batches, book values and fingerprints', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const dir =
      process.env.FINANCIAL_CROSS_CB_LOCALE_EVIDENCE_DIR ??
      mkdtempSync(path.join(tmpdir(), 'financial-cross-cb-locales-'));
    mkdirSync(dir, { recursive: true });
    const input = canonicalSerialize(
      appendPair(vector('GCU', 'AA'), 'AB', '2.75'),
    );
    const inputPath = path.join(dir, 'input.json');
    writeFileSync(inputPath, input);
    const reports: Record<string, unknown>[] = [];
    for (const [label, locale] of [
      ['en', 'en_US.UTF-8'],
      ['da', 'da_DK.UTF-8'],
    ] as const) {
      const output = path.join(dir, label + '.json');
      const child = spawnSync(
        process.execPath,
        [
          path.join(root, 'node_modules/vitest/vitest.mjs'),
          'run',
          'tests/world-core/formal-financial-cross-cb-composition.test.ts',
          '--config',
          process.env.FINANCIAL_CROSS_CB_LOCALE_CONFIG ??
            path.join(root, 'vitest.config.ts'),
          '--testNamePattern',
          '^financial cross-locale child proof$',
          '--reporter',
          'verbose',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 15000,
          maxBuffer: 1024 * 1024,
          env: {
            PATH: path.dirname(process.execPath) + ':/usr/bin:/bin',
            HOME: dir,
            TMPDIR: dir,
            NODE_ENV: 'test',
            VITEST: 'true',
            ECONMIND_ENV: 'local',
            NO_COLOR: '1',
            LANG: locale,
            LC_ALL: locale,
            TZ: 'UTC',
            FINANCIAL_CROSS_CB_LOCALE_CHILD: '1',
            FINANCIAL_CROSS_CB_LOCALE_INPUT: inputPath,
            FINANCIAL_CROSS_CB_LOCALE_OUTPUT: output,
          },
        },
      );
      writeFileSync(
        path.join(dir, label + '.log'),
        (child.stdout ?? '') + '\nSTDERR\n' + (child.stderr ?? ''),
      );
      expect(child.error).toBeUndefined();
      expect(child.signal).toBeNull();
      expect(child.status, child.stdout + '\n' + child.stderr).toBe(0);
      reports.push(
        JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>,
      );
    }
    const [en, da] = reports;
    expect(en!.locale).toBe('en-US');
    expect(da!.locale).toBe('da-DK');
    // Legitimate locale control proves the child processes actually differ.
    expect(en!.collationAA_AB).not.toBe(da!.collationAA_AB);
    expect(en!.inputSha256).toBe(da!.inputSha256);
    const comparisons = Object.fromEntries(
      [
        'parsedCanonical',
        'contractFingerprint',
        'batchesCanonical',
        'booksCanonical',
        'candidateCanonical',
        'candidateFingerprint',
      ].map((key) => [key, en![key] === da![key]]),
    );
    writeFileSync(
      path.join(dir, 'comparison.json'),
      JSON.stringify(
        {
          locales: [en!.locale, da!.locale],
          inputSha256: en!.inputSha256,
          comparisons,
        },
        null,
        2,
      ) + '\n',
    );
    for (const [key, equal] of Object.entries(comparisons))
      expect.soft(equal, key + ' must not depend on process locale').toBe(true);
  }, 35000);
}
