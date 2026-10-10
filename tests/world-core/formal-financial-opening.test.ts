import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Money, canonicalSerialize, canonicalDecimal } from '@econmind/core';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  loadOwnerNonHostSourceAdoption,
  produceOwnerNonHostSourceAdoption,
  type OwnerNonHostSourceAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import {
  financialInputSha256,
  parseFormalFinancialOpeningContract,
  type FinancialCbHolding,
  type FinancialCountryInput,
  type FinancialSourceReference,
  type FormalFinancialOpeningContract,
} from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import { produceFormalFinancialOpening } from '../../apps/world-worker/src/preparation/formal-financial-opening-producer.js';
import { openingBookMoney } from '../../apps/world-worker/src/preparation/opening-economic-decision.js';

const root = path.resolve(import.meta.dirname, '../..');
let real: OwnerNonHostSourceAdoption;
beforeAll(async () => {
  real = await loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
});

// Supplemental FX/CB/loan records below are GENERATED MECHANISM VECTORS.
// Only the original source + rule receipt are real. Hash/reference correctness
// and Core rebuild NEVER upgrade these generated records to formal evidence.
function vector(
  rate = '1.25',
  cashMode: 'NEGATIVE' | 'ZERO' | 'POSITIVE' | 'NATIVE' = 'NATIVE',
  sharedLc = false,
): FormalFinancialOpeningContract {
  const rows: unknown[] = [],
    date = '2026-10-10',
    version = 'MECHANISM_VECTOR_V1';
  const ref = (v: unknown): FinancialSourceReference => {
    rows.push(v);
    return { documentId: 'VECTOR_DOCUMENT', pointer: '/' + (rows.length - 1) };
  };
  const countries = real.manifest.countries.map(
    (c, i): FinancialCountryInput => {
      const cid = c.countryId,
        lc =
          sharedLc && i === 1
            ? 'LAA'
            : 'L' +
              String.fromCharCode(65 + Math.floor(i / 26)) +
              String.fromCharCode(65 + (i % 26));
      const local = (raw: string) =>
        openingBookMoney({
          rawAmount: raw,
          denomination: 'GCU_EQUIVALENT',
          localCurrency: lc,
          localCurrencyPerGcu: rate,
        });
      const B = local(c.rawFinance.treasuryCentralBankBalance),
        R = local(c.rawFinance.bankReserveAssets),
        A = local(c.rawFinance.bankLoanAssets);
      const liability = B.add(R);
      const cash =
        cashMode === 'NEGATIVE'
          ? '0'
          : cashMode === 'ZERO'
            ? liability.toCanonicalValue().amount
            : cashMode === 'POSITIVE'
              ? liability.add(Money.from('1', lc)).toCanonicalValue().amount
              : '2';
      const holdings: FinancialCbHolding[] = [];
      const holding = (body: Omit<FinancialCbHolding, 'source'>) =>
        holdings.push({
          ...body,
          source: ref({ countryId: cid, valueDate: date, ...body }),
        });
      for (const [category, amount, counterpartyId] of [
        [
          'TREASURY_GOVERNMENT_DEPOSIT',
          B.toCanonicalValue().amount,
          c.holderRoster.treasury,
        ],
        [
          'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
          R.toCanonicalValue().amount,
          c.holderRoster.bank,
        ],
      ] as const)
        holding({
          holdingId: 'HOLDING_' + cid + '_' + category,
          category,
          kind: 'CLAIM',
          amount,
          currency: lc,
          localCurrencyPerUnit: '1',
          holderId: c.holderRoster.centralBank,
          counterpartyId,
          usableStatus: 'SOURCE_DECLARED_MECHANISM_ONLY',
        });
      holding({
        holdingId: 'HOLDING_' + cid + '_CASH',
        category: 'FX_CASH_AND_DEPOSITS',
        kind: 'CASH',
        amount: cash,
        currency: cashMode === 'NATIVE' ? 'GCU' : lc,
        localCurrencyPerUnit: cashMode === 'NATIVE' ? rate : '1',
        holderId: c.holderRoster.centralBank,
        counterpartyId: null,
        usableStatus: 'SOURCE_DECLARED_MECHANISM_ONLY',
      });
      const categories = CENTRAL_BANK_OPENING_CATEGORIES.map(([category]) => {
        const disposition = holdings.some((h) => h.category === category)
          ? ('DECLARED' as const)
          : ('NO_DECLARED_INSTRUMENT' as const);
        return {
          category,
          disposition,
          source: ref({ countryId: cid, category, disposition }),
        };
      });
      const summary = {
        countryId: cid,
        version,
        valueDate: date,
        categories: categories
          .map(({ category, disposition }) => ({ category, disposition }))
          .sort((a, b) => (a.category < b.category ? -1 : 1)),
        holdingIds: holdings.map((h) => h.holdingId).sort(),
      };
      const bankLoans = A.amount.isZero()
        ? []
        : [
            {
              loanId: 'LOAN_' + cid,
              borrowerId: c.holderRoster.operator,
              amount: A.toCanonicalValue().amount,
              currency: lc,
              source: ref({
                countryId: cid,
                valueDate: date,
                loanId: 'LOAN_' + cid,
                borrowerId: c.holderRoster.operator,
                amount: A.toCanonicalValue().amount,
                currency: lc,
              }),
            },
          ];
      return {
        countryId: cid,
        localCurrency: lc,
        openingFx: {
          localCurrencyPerGcu: rate,
          version,
          valueDate: date,
          source: ref({
            countryId: cid,
            localCurrency: lc,
            localCurrencyPerGcu: rate,
            version,
            valueDate: date,
          }),
        },
        cbRegister: {
          version,
          valueDate: date,
          source: ref(summary),
          categories,
          holdings,
        },
        bankLoans,
      };
    },
  );
  const bytes = canonicalSerialize(rows);
  return {
    schemaVersion: 'formal-financial-opening-input-v1',
    evidenceKind: 'MECHANISM_TEST_VECTOR',
    worldId: 'WORLD_TEST_ONLY_FINANCIAL_CANDIDATE',
    sourceId: 'SOURCE_FINANCIAL_CANDIDATE',
    sourceVersion: version,
    valueDate: date,
    ownerReceiptSha256: real.ownerPolicy.receiptSha256,
    adoptionManifestFingerprint: real.manifestFingerprint,
    financeSha256: real.trustedSource.financeSha256,
    documents: [
      {
        documentId: 'VECTOR_DOCUMENT',
        sourcePath: 'test-vectors/supplemental-financial.json',
        version,
        valueDate: date,
        bytes,
        sha256: financialInputSha256(bytes),
      },
    ],
    countries,
  };
}
const parse = (v: unknown) => parseFormalFinancialOpeningContract(v, real);
const run = (v: unknown) =>
  produceFormalFinancialOpening({ adoption: real, contract: parse(v) });
// Mutable JSON-only copy for invalid-input tests; no forged authority brand.
const copy = <T>(v: T): T => JSON.parse(canonicalSerialize(v)) as T;
function changeFirst(
  v: FormalFinancialOpeningContract,
  edit: (c: Record<string, unknown>) => void,
): unknown {
  const r = copy(v) as unknown as { countries: Record<string, unknown>[] };
  edit(r.countries[0]!);
  return r;
}

function appendHolding(
  v: FormalFinancialOpeningContract,
  body: Omit<FinancialCbHolding, 'source'>,
): FormalFinancialOpeningContract {
  const rows = JSON.parse(v.documents[0]!.bytes) as Record<string, unknown>[];
  const c = v.countries[0]!;
  const added = {
    ...body,
    source: { documentId: 'VECTOR_DOCUMENT', pointer: '/' + rows.length },
  };
  rows.push({ countryId: c.countryId, valueDate: v.valueDate, ...body });
  const categories = c.cbRegister.categories.map((cat) => {
    if (cat.category !== body.category) return cat;
    rows[Number(cat.source.pointer.slice(1))]!.disposition = 'DECLARED';
    return { ...cat, disposition: 'DECLARED' as const };
  });
  const holdings = [...c.cbRegister.holdings, added];
  const summary = rows[Number(c.cbRegister.source.pointer.slice(1))]!;
  summary.categories = categories
    .map(({ category, disposition }) => ({ category, disposition }))
    .sort((a, b) => (a.category < b.category ? -1 : 1));
  summary.holdingIds = holdings.map((h) => h.holdingId).sort();
  const bytes = canonicalSerialize(rows);
  return {
    ...v,
    countries: [
      { ...c, cbRegister: { ...c.cbRegister, holdings, categories } },
      ...v.countries.slice(1),
    ],
    documents: [
      { ...v.documents[0]!, bytes, sha256: financialInputSha256(bytes) },
    ],
  };
}

describe('strict formal financial calculation contract (never formal approval)', () => {
  it('requires the actual independently loaded non-activated adoption, not a clone, fixture scope or approval DTO', () => {
    const v = vector();
    expect(() => parseFormalFinancialOpeningContract(v, { ...real })).toThrow(
      'REAL_NON_ACTIVATED_ADOPTION_REQUIRED',
    );
    const testAdoption = produceOwnerNonHostSourceAdoption({
      source: real.source,
      ownerPolicy: real.ownerPolicy,
      scope: { environment: 'TEST_ONLY', worldId: v.worldId },
    });
    expect(() => parseFormalFinancialOpeningContract(v, testAdoption)).toThrow(
      'REAL_NON_ACTIVATED_ADOPTION_REQUIRED',
    );
    expect(() => parse({ ...v, approved: true })).toThrow(
      'EXACT_KEYS_REQUIRED',
    );
    expect(() => parse(undefined)).toThrow();
  });
  it.each([
    'ownerReceiptSha256',
    'adoptionManifestFingerprint',
    'financeSha256',
  ] as const)('rejects changed %s source/adoption binding', (field) => {
    expect(() => parse({ ...vector(), [field]: 'f'.repeat(64) })).toThrow(
      'SOURCE_ADOPTION_BINDING_MISMATCH',
    );
  });
  it('requires current parser provenance again after JSON transport, and snapshots/freezes inputs', () => {
    const v = vector(),
      parsed = parse(v);
    expect(() =>
      produceFormalFinancialOpening({ adoption: real, contract: copy(parsed) }),
    ).toThrow('PARSED_FINANCIAL_CONTRACT_REQUIRED');
    expect(Object.isFrozen(parsed.countries[0]!.cbRegister.holdings[0])).toBe(
      true,
    );
    const r = v as unknown as { worldId: string };
    r.worldId = 'WORLD_CHANGED_AFTER_PARSE';
    expect(parsed.worldId).not.toBe(r.worldId);
  });
  it.each(['0', '-1', '1.00', '1e3', 1, null])(
    'rejects missing/nonpositive/noncanonical FX %s',
    (rate) => {
      expect(() =>
        parse(
          changeFirst(vector(), (c) => {
            (c.openingFx as Record<string, unknown>).localCurrencyPerGcu = rate;
          }),
        ),
      ).toThrow();
    },
  );
  it('checks real calendar dates, uniform value dates and source versions', () => {
    expect(() => parse({ ...vector(), valueDate: '2026-02-30' })).toThrow(
      'VALUE_DATE_INVALID',
    );
    expect(() =>
      parse(
        changeFirst(vector(), (c) => {
          (c.openingFx as Record<string, unknown>).valueDate = '2026-10-09';
        }),
      ),
    ).toThrow('VALUE_DATE_MISMATCH');
    expect(() =>
      parse(
        changeFirst(vector(), (c) => {
          (c.cbRegister as Record<string, unknown>).version = 'UNBOUND_VERSION';
        }),
      ),
    ).toThrow('SOURCE_VERSION_MISMATCH');
  });
  it('rejects altered bytes, wrong hash, unresolved pointer and mismatched source value', () => {
    const v = vector();
    expect(() =>
      parse({
        ...v,
        documents: [{ ...v.documents[0]!, bytes: v.documents[0]!.bytes + ' ' }],
      }),
    ).toThrow('SUPPLEMENTAL_SOURCE_DRIFT');
    expect(() =>
      parse(
        changeFirst(v, (c) => {
          (
            (c.openingFx as Record<string, unknown>).source as Record<
              string,
              unknown
            >
          ).pointer = '/999999';
        }),
      ),
    ).toThrow('SOURCE_POINTER_MISSING');
    expect(() =>
      parse(
        changeFirst(v, (c) => {
          (c.openingFx as Record<string, unknown>).localCurrencyPerGcu = '2';
        }),
      ),
    ).toThrow('SOURCE_VALUE_MISMATCH');
  });
  it('rejects canonical JSON collisions/numbers, oversized documents and traversal provenance', () => {
    const v = vector();
    const bytes = '{"a":"first","a":"second"}';
    expect(() =>
      parse({
        ...v,
        documents: [
          { ...v.documents[0]!, bytes, sha256: financialInputSha256(bytes) },
        ],
      }),
    ).toThrow('CANONICAL_SOURCE_JSON_REQUIRED');
    expect(() =>
      parse({
        ...v,
        documents: [
          { ...v.documents[0]!, bytes: 'x'.repeat(4 * 1024 * 1024 + 1) },
        ],
      }),
    ).toThrow('SOURCE_BYTE_BUDGET_OR_UTF8_INVALID');
    expect(() =>
      parse({
        ...v,
        documents: [{ ...v.documents[0]!, sourcePath: '../untrusted.json' }],
      }),
    ).toThrow('SOURCE_PATH_INVALID');
    expect(() => parse({ ...v, ready: () => true })).toThrow();
  });
  it('requires exactly all countries, explicit LC and complete declared category coverage', () => {
    const v = vector();
    expect(() => parse({ ...v, countries: v.countries.slice(1) })).toThrow(
      'ALL_70_COUNTRIES_REQUIRED',
    );
    expect(() =>
      parse({ ...v, countries: [v.countries[0], ...v.countries.slice(0, 69)] }),
    ).toThrow('COUNTRY_COVERAGE_INVALID');
    expect(() =>
      parse(
        changeFirst(v, (c) => {
          c.localCurrency = 'GCU';
        }),
      ),
    ).toThrow('LOCAL_CURRENCY_INVALID');
    expect(() =>
      parse(
        changeFirst(v, (c) => {
          const cb = c.cbRegister as { categories: unknown[] };
          cb.categories.pop();
        }),
      ),
    ).toThrow('COMPLETE_CB_CATEGORY_COVERAGE_REQUIRED');
    expect(() =>
      parse(
        changeFirst(v, (c) => {
          const cb = c.cbRegister as { holdings: unknown[] };
          cb.holdings.pop();
        }),
      ),
    ).toThrow('REGISTER_DECLARATION_MISMATCH');
  });
  it('rejects unknown versus zero, missing counterpart, unsupported instruments and conflicting native valuation', () => {
    for (const [key, value] of [
      ['amount', null],
      ['counterpartyId', null],
      ['kind', 'ASSET_FROM_GDP'],
      ['holderId', 'ENTITY_FAKE'],
      ['localCurrencyPerUnit', '2'],
    ] as const) {
      expect(() =>
        parse(
          changeFirst(vector(), (c) => {
            const h = (c.cbRegister as { holdings: Record<string, unknown>[] })
              .holdings[0]!;
            h[key] = value;
          }),
        ),
      ).toThrow();
    }
  });
});

describe('D01/D02/D03 actual multi-currency calculation with explicit unresolved authority', () => {
  it('builds 70 LC + 70 native GCU batches; exact source conversion once, paired B/R and no CB backing plug', () => {
    const r = run(vector());
    expect(r.status).toBe('BLOCKED');
    expect(r.seed).toBeNull();
    expect(r.admissionAllowed).toBe(false);
    expect(r.activationAllowed).toBe(false);
    expect(r.blockers.map((b) => b.code)).toEqual([
      'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
      'FORMAL_WORLD_BINDING_UNRESOLVED',
      'MECHANISM_VECTOR_NOT_FORMAL_SOURCE',
    ]);
    const candidate = r.candidate!;
    expect(candidate.provenance).toBe(
      'UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE',
    );
    expect(candidate.financialBatches).toHaveLength(140);
    expect(candidate.reconciliations).toHaveLength(70);
    for (const c of candidate.reconciliations) {
      const batches = candidate.financialBatches.filter(
        (b) => b.legs[0]!.account.countryId === c.countryId,
      );
      expect(batches).toHaveLength(2);
      const lc = c.bankL.currency;
      const local = batches.find((b) => b.settlementCurrency === lc)!;
      const finance = real.manifest.countries.find(
        (x) => x.countryId === c.countryId,
      )!;
      const cbLiabilityClaims = local.legs.filter(
        (l) =>
          l.account.ownerId === finance.holderRoster.centralBank &&
          l.account.accountClass === 'LIABILITY',
      );
      expect(cbLiabilityClaims).toHaveLength(2);
      for (const l of cbLiabilityClaims) {
        const other = local.legs.find(
          (x) => x.account.claimId === l.account.claimId && x.legId !== l.legId,
        )!;
        expect(other.account.accountClass).toBe('ASSET');
        expect(other.account.ownerId).not.toBe(
          finance.holderRoster.centralBank,
        );
        expect(other.amount.toCanonicalValue()).toEqual(
          l.amount.toCanonicalValue(),
        );
        expect(other.counterpartLegId).toBe(l.legId);
        expect(l.counterpartLegId).toBe(other.legId);
      }
      expect(c.denominations).toHaveLength(7);
      for (const d of c.denominations)
        expect(d.localBookValue).toEqual(
          openingBookMoney({
            rawAmount: d.rawLexeme,
            denomination: 'GCU_EQUIVALENT',
            localCurrency: lc,
            localCurrencyPerGcu: '1.25',
          }).toCanonicalValue(),
        );
      expect(c.original).toEqual(finance.rawFinance);
      expect(c.runtimeResetAllowed).toBe(false);
      expect(c.isCash).toBe(false);
      const native = batches.find((b) => b.settlementCurrency === 'GCU')!;
      expect(
        native.legs
          .filter((l) => l.account.accountClass === 'ASSET')
          .map((l) => l.amount.toCanonicalValue().amount),
      ).toEqual(['2']);
      for (const b of batches) {
        const sum = (direction: 'DEBIT' | 'CREDIT') =>
          b.legs
            .filter((l) => l.direction === direction)
            .reduce(
              (a, l) => a.add(l.amount),
              Money.from('0', b.settlementCurrency),
            );
        expect(sum('DEBIT').toCanonicalValue()).toEqual(
          sum('CREDIT').toCanonicalValue(),
        );
      }
    }
  });
  it.each(['NEGATIVE', 'ZERO', 'POSITIVE'] as const)(
    'derives %s CB opening net worth without fabricated historical equity/asset',
    (mode) => {
      const r = run(vector('1.25', mode));
      expect(r.candidate).not.toBeNull();
      for (const c of r.candidate!.reconciliations) {
        const net = Money.from(
          c.cbNetWorth.amount,
          c.cbNetWorth.currency,
        ).amount;
        expect(
          mode === 'NEGATIVE'
            ? net.isNegative()
            : mode === 'ZERO'
              ? net.isZero()
              : net.isPositive(),
        ).toBe(true);
        expect(c.cbOriginalEquity.amount).toBe('0');
        expect(c.cbDeltaEquity).toEqual(c.cbNetWorth);
      }
    },
  );
  it('does not treat SOURCE_CANDIDATE or a chosen formal-looking World ID as economic/World approval', () => {
    const r = run({
      ...vector(),
      evidenceKind: 'SOURCE_CANDIDATE',
      worldId: 'WORLD_SEASON_ONE',
    });
    expect(r.candidate).not.toBeNull();
    expect(r.status).toBe('BLOCKED');
    expect(r.seed).toBeNull();
    expect(r.blockers.map((b) => b.code)).toContain(
      'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
    );
    expect(r.blockers.map((b) => b.code)).toContain(
      'FORMAL_WORLD_BINDING_UNRESOLVED',
    );
  });
  it('keeps source-declared shared LC in separate country batches without inventing currency uniqueness', () => {
    const r = run(vector('1.25', 'NATIVE', true));
    expect(r.candidate).not.toBeNull();
    const batches = r.candidate!.financialBatches.filter(
      (b) => b.settlementCurrency === 'LAA',
    );
    expect(batches).toHaveLength(2);
    expect(new Set(batches.map((b) => b.legs[0]!.account.countryId)).size).toBe(
      2,
    );
    expect(new Set(batches.map((b) => b.batchId)).size).toBe(2);
  });
  it('preserves a supported additional native holding, paired sourced security, and original equity without duplicate cash', () => {
    const v = vector(),
      roster = real.manifest.countries[0]!.holderRoster;
    const withNative = appendHolding(v, {
      holdingId: 'EXTRA_NATIVE_CASH',
      category: 'FX_CASH_AND_DEPOSITS',
      kind: 'CASH',
      amount: '3',
      currency: 'USD',
      localCurrencyPerUnit: '2.5',
      holderId: roster.centralBank,
      counterpartyId: null,
      usableStatus: 'MECHANISM_ONLY',
    });
    const withClaim = appendHolding(withNative, {
      holdingId: 'EXTRA_SOURCE_SECURITY',
      category: 'DOMESTIC_GOVERNMENT_SECURITIES',
      kind: 'CLAIM',
      amount: '5',
      currency: withNative.countries[0]!.localCurrency,
      localCurrencyPerUnit: '1',
      holderId: roster.centralBank,
      counterpartyId: roster.treasury,
      usableStatus: 'MECHANISM_ONLY',
    });
    const withEquity = appendHolding(withClaim, {
      holdingId: 'ORIGINAL_SOURCE_EQUITY',
      category: 'RETAINED_EARNINGS',
      kind: 'SOURCE_EQUITY',
      amount: '-4',
      currency: withClaim.countries[0]!.localCurrency,
      localCurrencyPerUnit: '1',
      holderId: roster.centralBank,
      counterpartyId: null,
      usableStatus: 'MECHANISM_ONLY_NOT_HISTORICAL_ASSERTION',
    });
    const r = run(withEquity),
      baseline = run(v).candidate!;
    expect(r.candidate).not.toBeNull();
    const first = r.candidate!.reconciliations[0]!;
    expect(first.cbOriginalEquity.amount).toBe('-4');
    expect(
      Money.from(first.cbAssets.amount, first.cbAssets.currency)
        .subtract(
          Money.from(
            baseline.reconciliations[0]!.cbAssets.amount,
            first.cbAssets.currency,
          ),
        )
        .toCanonicalValue().amount,
    ).toBe('12.5');
    const native = r.candidate!.financialBatches.find(
      (b) => b.settlementCurrency === 'USD',
    )!;
    expect(native.legs).toHaveLength(2);
    expect(
      native.legs.every((l) => l.amount.toCanonicalValue().amount === '3'),
    ).toBe(true);
    const claim = r
      .candidate!.financialBatches.flatMap((b) => b.legs)
      .filter(
        (l) =>
          l.account.ownerId === roster.treasury &&
          l.account.accountClass === 'LIABILITY',
      );
    expect(claim).toHaveLength(1);
    expect(claim[0]!.amount.toCanonicalValue().amount).toBe('5');
    const equityBookTotal = r
      .candidate!.financialBatches.flatMap((b) => b.legs)
      .filter(
        (l) =>
          l.account.countryId === first.countryId &&
          l.account.ownerId === roster.centralBank &&
          l.account.accountClass === 'EQUITY',
      )
      .reduce(
        (sum, l) => {
          const native = l.amount.toCanonicalValue().amount;
          const signed = l.direction === 'DEBIT' ? '-' + native : native;
          const rate =
            l.amount.currency === 'USD'
              ? '2.5'
              : l.amount.currency === 'GCU'
                ? '1.25'
                : '1';
          return sum.add(
            openingBookMoney({
              rawAmount: signed,
              denomination: 'GCU_EQUIVALENT',
              localCurrency: first.cbNetWorth.currency,
              localCurrencyPerGcu: rate,
            }),
          );
        },
        Money.from('0', first.cbNetWorth.currency),
      );
    expect(equityBookTotal.toCanonicalValue()).toEqual(first.cbNetWorth);
  });
  it('refuses an extra bank liability that would silently override the D03.5 opening anchor', () => {
    const v = vector(),
      roster = real.manifest.countries[0]!.holderRoster;
    const changed = appendHolding(v, {
      holdingId: 'EXTRA_CB_BANK_LOAN',
      category: 'REGULAR_REFINANCING_LOANS',
      kind: 'CLAIM',
      amount: '5',
      currency: v.countries[0]!.localCurrency,
      localCurrencyPerUnit: '1',
      holderId: roster.centralBank,
      counterpartyId: roster.bank,
      usableStatus: 'MECHANISM_ONLY',
    });
    const r = run(changed);
    expect(r.candidate).toBeNull();
    expect(r.blockers.map((b) => b.code)).toContain(
      'UNREPRESENTED_BANK_OPENING_COMPONENT',
    );
  });
  it('rejects a source-linked loan whose total disagrees with the fixed bank asset component', () => {
    const v = vector(),
      c = v.countries[0]!,
      roster = real.manifest.countries[0]!.holderRoster;
    // The actual fixed source has A=0 in all 70 countries. This sourced test
    // vector is intentionally inconsistent; it must not manufacture a loan.
    expect(
      real.manifest.countries.every((x) => x.rawFinance.bankLoanAssets === '0'),
    ).toBe(true);
    const rows = JSON.parse(v.documents[0]!.bytes) as unknown[];
    const body = {
      loanId: 'INCONSISTENT_VECTOR_LOAN',
      borrowerId: roster.operator,
      amount: '1',
      currency: c.localCurrency,
    };
    const loan = {
      ...body,
      source: { documentId: 'VECTOR_DOCUMENT', pointer: '/' + rows.length },
    };
    rows.push({ countryId: c.countryId, valueDate: v.valueDate, ...body });
    const bytes = canonicalSerialize(rows);
    const r = run({
      ...v,
      countries: [{ ...c, bankLoans: [loan] }, ...v.countries.slice(1)],
      documents: [
        { ...v.documents[0]!, bytes, sha256: financialInputSha256(bytes) },
      ],
    });
    expect(r.candidate).toBeNull();
    expect(r.blockers.map((b) => b.code)).toContain(
      'BANK_LOAN_SOURCE_TOTAL_MISMATCH',
    );
  });
  it('rejects duplicate instrument IDs and inconsistent native valuation before producing batches', () => {
    const v = vector(),
      roster = real.manifest.countries[0]!.holderRoster;
    const h = v.countries[0]!.cbRegister.holdings.find(
      (h) => h.currency === 'GCU',
    )!;
    expect(() =>
      parse(appendHolding(v, { ...h, localCurrencyPerUnit: '2' })),
    ).toThrow('HOLDING_DUPLICATE_OR_UNDECLARED');
    expect(() =>
      parse(
        appendHolding(v, {
          holdingId: 'BAD_NATIVE_VALUATION',
          category: 'FX_CASH_AND_DEPOSITS',
          kind: 'CASH',
          amount: '3',
          currency: 'GCU',
          localCurrencyPerUnit: '2',
          holderId: roster.centralBank,
          counterpartyId: null,
          usableStatus: 'MECHANISM_ONLY',
        }),
      ),
    ).toThrow('NATIVE_VALUATION_RATE_CONFLICT');
  });
  it('has stable fingerprints after transport/reparse and input enumeration changes', () => {
    const v = vector(),
      original = run(v).candidate!;
    const reordered = {
      ...v,
      documents: [...v.documents].reverse(),
      countries: v.countries
        .map((c) => ({
          ...c,
          bankLoans: [...c.bankLoans].reverse(),
          cbRegister: {
            ...c.cbRegister,
            categories: [...c.cbRegister.categories].reverse(),
            holdings: [...c.cbRegister.holdings].reverse(),
          },
        }))
        .reverse(),
    };
    expect(run(copy(v)).candidate!.fingerprint).toBe(original.fingerprint);
    expect(run(reordered).candidate!.fingerprint).toBe(original.fingerprint);
    expect(canonicalSerialize(real.manifest)).toBe(
      canonicalSerialize(copy(real.manifest)),
    );
  });
  it('reproduces the same candidate in a fresh Node process with reloaded real adoption', () => {
    const v = vector(),
      expected = run(v).candidate!.fingerprint;
    const script = `
      import {loadOwnerNonHostSourceAdoption} from './apps/world-worker/dist/preparation/owner-non-host-source-adoption.js';
      import {parseFormalFinancialOpeningContract} from './apps/world-worker/dist/preparation/formal-financial-opening-contract.js';
      import {produceFormalFinancialOpening} from './apps/world-worker/dist/preparation/formal-financial-opening-producer.js';
      let bytes = ''; for await (const part of process.stdin) bytes += part;
      const root = process.cwd();
      const adoption = await loadOwnerNonHostSourceAdoption({repositoryRoot: root,
        ownerDocumentPath: root + '/docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
        rootReceiptPath: root + '/docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
        scope: {environment: 'NON_ACTIVATED_PREPARATION', worldId: null}});
      const contract = parseFormalFinancialOpeningContract(JSON.parse(bytes), adoption);
      const result = produceFormalFinancialOpening({adoption, contract});
      if (result.status !== 'BLOCKED' || result.seed !== null || !result.candidate) process.exit(2);
      process.stdout.write(result.candidate.fingerprint);
    `;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        cwd: root,
        input: canonicalSerialize(v),
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin' },
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toBe(expected);
  });
  it('fails all-or-zero when TGA/R source totals or native valuation fail', () => {
    // Change source and hash together: byte binding alone is not enough to
    // override the approved baseline B/R component semantics.
    const v = copy(vector());
    const countries = v.countries as FinancialCountryInput[];
    const h = countries[0]!.cbRegister.holdings[0]!;
    const changed = {
      ...h,
      amount: Money.from(h.amount, h.currency)
        .add(Money.from('1', h.currency))
        .toCanonicalValue().amount,
    };
    const rows = JSON.parse(v.documents[0]!.bytes) as Record<string, unknown>[];
    rows[Number(h.source.pointer.slice(1))]!.amount = changed.amount;
    (countries[0]!.cbRegister.holdings as FinancialCbHolding[])[0] = changed;
    const bytes = canonicalSerialize(rows);
    const r = run({
      ...v,
      documents: [
        { ...v.documents[0]!, bytes, sha256: financialInputSha256(bytes) },
      ],
    });
    expect(r.candidate).toBeNull();
    expect(r.blockers.map((b) => b.code)).toContain(
      'TGA_RESERVE_COMPLETE_SOURCE_REQUIRED',
    );
  });
  it('rejects exact decimal result overflow without rounding or a partial candidate', () => {
    const v = vector(),
      rate = '9'.repeat(119);
    const rows = JSON.parse(v.documents[0]!.bytes) as Record<string, unknown>[];
    const countries = v.countries.map((c) => {
      rows[Number(c.openingFx.source.pointer.slice(1))]!.localCurrencyPerGcu =
        rate;
      const holdings = c.cbRegister.holdings.map((h) => {
        if (h.currency !== 'GCU') return h;
        rows[Number(h.source.pointer.slice(1))]!.localCurrencyPerUnit = rate;
        return { ...h, localCurrencyPerUnit: rate };
      });
      return {
        ...c,
        openingFx: { ...c.openingFx, localCurrencyPerGcu: rate },
        cbRegister: { ...c.cbRegister, holdings },
      };
    });
    const bytes = canonicalSerialize(rows);
    const r = run({
      ...v,
      countries,
      documents: [
        { ...v.documents[0]!, bytes, sha256: financialInputSha256(bytes) },
      ],
    });
    expect(r.candidate).toBeNull();
    expect(r.blockers.map((b) => b.code)).toContain(
      'EXACT_FINANCIAL_OR_CORE_VALIDATION_FAILED',
    );
  });
  it('preserves exact conversion and per-currency conservation for bounded generated rates', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 11 }), (n) => {
        const r = run(vector(String(n), 'POSITIVE'));
        expect(r.candidate).not.toBeNull();
        for (const c of r.candidate!.reconciliations) {
          expect(c.cbNetWorth.amount).toBe('1');
          expect(c.bankL.amount).toBe(
            canonicalDecimal(
              Money.from(c.original.householdBankDeposits, 'GCU')
                .add(Money.from(c.original.businessBankDeposits, 'GCU'))
                .amount.mul(String(n)),
            ),
          );
        }
      }),
      { seed: 20261010, numRuns: 8 },
    );
  });
});
