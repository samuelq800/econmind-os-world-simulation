/** P0 preparation contract, NOT an economic approval/World binding API.
 * Supplemental documents prove byte/value linkage only. The current genuine
 * Owner receipt adopts rules, not arbitrary supplemental FX/register values.
 */
import { createHash } from 'node:crypto';
import {
  Money,
  canonicalDecimal,
  canonicalSerialize,
  parseWorldDecimal,
  worldId,
  openingSourceId,
} from '@econmind/core';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  isOwnerNonHostSourceAdoption,
  type CentralBankOpeningCategory,
  type OwnerNonHostSourceAdoption,
} from './owner-non-host-source-adoption.js';

export interface FinancialSourceReference {
  readonly documentId: string;
  readonly pointer: string;
}
export interface FinancialSourceDocument {
  readonly documentId: string;
  readonly sourcePath: string;
  readonly sha256: string;
  readonly version: string;
  readonly valueDate: string;
  readonly bytes: string;
}
export interface FinancialCategoryCoverage {
  readonly category: CentralBankOpeningCategory;
  readonly disposition: 'DECLARED' | 'NO_DECLARED_INSTRUMENT';
  readonly source: FinancialSourceReference;
}
export interface FinancialCbHolding {
  readonly holdingId: string;
  readonly category: CentralBankOpeningCategory;
  readonly kind: 'CASH' | 'CLAIM' | 'SOURCE_EQUITY';
  readonly amount: string;
  readonly currency: string;
  /** Book LC per one native currency unit; identity LC valuation must be 1. */
  readonly localCurrencyPerUnit: string;
  readonly holderId: string;
  readonly counterpartyId: string | null;
  readonly usableStatus: string;
  readonly source: FinancialSourceReference;
}
export interface FinancialBankLoan {
  readonly loanId: string;
  readonly borrowerId: string;
  readonly amount: string;
  readonly currency: string;
  readonly source: FinancialSourceReference;
}
export interface FinancialCountryInput {
  readonly countryId: string;
  readonly localCurrency: string;
  readonly openingFx: Readonly<{
    localCurrencyPerGcu: string;
    version: string;
    valueDate: string;
    source: FinancialSourceReference;
  }>;
  readonly cbRegister: Readonly<{
    version: string;
    valueDate: string;
    source: FinancialSourceReference;
    categories: readonly FinancialCategoryCoverage[];
    holdings: readonly FinancialCbHolding[];
  }>;
  readonly bankLoans: readonly FinancialBankLoan[];
}
export interface FormalFinancialOpeningContract {
  readonly schemaVersion: 'formal-financial-opening-input-v1';
  readonly evidenceKind: 'SOURCE_CANDIDATE' | 'MECHANISM_TEST_VECTOR';
  /** A requested deterministic calculation namespace, never verified authority. */
  readonly worldId: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly valueDate: string;
  readonly ownerReceiptSha256: string;
  readonly adoptionManifestFingerprint: string;
  readonly financeSha256: string;
  readonly documents: readonly FinancialSourceDocument[];
  readonly countries: readonly FinancialCountryInput[];
}
export class FormalFinancialOpeningInvalid extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
  ) {
    super(`${code}:${field}`);
    this.name = 'FormalFinancialOpeningInvalid';
  }
}
export function requireFinancialInput(
  ok: unknown,
  code: string,
  field: string,
): asserts ok {
  if (!ok) throw new FormalFinancialOpeningInvalid(code, field);
}
const parsed = new WeakSet<object>();
export function isParsedFormalFinancialOpeningContract(
  v: unknown,
): v is FormalFinancialOpeningContract {
  return typeof v === 'object' && v !== null && parsed.has(v);
}
export const financialInputSha256 = (bytes: string): string =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
export function freezeFinancialInput<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeFinancialInput(child);
    Object.freeze(value);
  }
  return value;
}
type Row = Record<string, unknown>;
function row(value: unknown, keys: readonly string[], field: string): Row {
  requireFinancialInput(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'OBJECT_REQUIRED',
    field,
  );
  const r = value as Row;
  requireFinancialInput(
    Object.keys(r).sort().join('|') === [...keys].sort().join('|'),
    'EXACT_KEYS_REQUIRED',
    field,
  );
  return r;
}
function text(value: unknown, field: string): string {
  requireFinancialInput(
    typeof value === 'string' && value.length > 0 && value.length <= 1024,
    'TEXT_REQUIRED',
    field,
  );
  return value;
}
function id(value: unknown, field: string): string {
  const s = text(value, field);
  requireFinancialInput(
    /^[A-Z][A-Z0-9_]{0,127}$/u.test(s),
    'STABLE_ID_REQUIRED',
    field,
  );
  return s;
}
function date(value: unknown, field: string): string {
  const s = text(value, field);
  requireFinancialInput(
    /^\d{4}-\d{2}-\d{2}$/u.test(s),
    'VALUE_DATE_INVALID',
    field,
  );
  const d = new Date(s + 'T00:00:00.000Z');
  requireFinancialInput(
    Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s,
    'VALUE_DATE_INVALID',
    field,
  );
  return s;
}
function array(value: unknown, field: string, limit: number): unknown[] {
  requireFinancialInput(
    Array.isArray(value) && value.length <= limit,
    'BOUNDED_ARRAY_REQUIRED',
    field,
  );
  return value;
}
export function exactFinancialDecimal(
  value: unknown,
  field: string,
  positive = false,
): string {
  const s = text(value, field),
    n = parseWorldDecimal(s);
  requireFinancialInput(
    canonicalDecimal(n) === s && (!positive || n.isPositive()),
    'CANONICAL_DECIMAL_REQUIRED',
    field,
  );
  return s;
}
function currency(value: unknown, field: string): string {
  return Money.from('0', text(value, field)).currency;
}
function pointerValue(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  requireFinancialInput(
    pointer.startsWith('/') && !/~(?![01])/u.test(pointer),
    'SOURCE_POINTER_INVALID',
    pointer,
  );
  let current = root;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/gu, '/').replace(/~0/gu, '~');
    requireFinancialInput(
      current !== null &&
        typeof current === 'object' &&
        Object.hasOwn(current, key),
      'SOURCE_POINTER_MISSING',
      pointer,
    );
    current = (current as Row)[key];
  }
  return current;
}

/** No source loader callbacks, approval booleans or fixture-to-authority cast.
 * Accepts real branded source/rule adoption and independently hash-checked
 * supplemental bytes. Output remains a non-adopted calculation contract.
 */
export function parseFormalFinancialOpeningContract(
  input: unknown,
  adoption: OwnerNonHostSourceAdoption,
): FormalFinancialOpeningContract {
  requireFinancialInput(
    isOwnerNonHostSourceAdoption(adoption) &&
      adoption.scope.environment === 'NON_ACTIVATED_PREPARATION',
    'REAL_NON_ACTIVATED_ADOPTION_REQUIRED',
    'adoption',
  );
  // Canonical roundtrip rejects executable/non-JSON payloads and snapshots input.
  const r = row(
    JSON.parse(canonicalSerialize(input)) as unknown,
    [
      'schemaVersion',
      'evidenceKind',
      'worldId',
      'sourceId',
      'sourceVersion',
      'valueDate',
      'ownerReceiptSha256',
      'adoptionManifestFingerprint',
      'financeSha256',
      'documents',
      'countries',
    ],
    'contract',
  );
  requireFinancialInput(
    r.schemaVersion === 'formal-financial-opening-input-v1' &&
      ['SOURCE_CANDIDATE', 'MECHANISM_TEST_VECTOR'].includes(
        String(r.evidenceKind),
      ),
    'CONTRACT_VERSION_OR_EVIDENCE_INVALID',
    'contract',
  );
  worldId(text(r.worldId, 'worldId'));
  openingSourceId(text(r.sourceId, 'sourceId'));
  text(r.sourceVersion, 'sourceVersion');
  const valueDate = date(r.valueDate, 'valueDate');
  requireFinancialInput(
    r.ownerReceiptSha256 === adoption.ownerPolicy.receiptSha256 &&
      r.adoptionManifestFingerprint === adoption.manifestFingerprint &&
      r.financeSha256 === adoption.trustedSource.financeSha256,
    'SOURCE_ADOPTION_BINDING_MISMATCH',
    'contract',
  );
  const docs = new Map<string, unknown>();
  let totalBytes = 0;
  const documents = array(r.documents, 'documents', 256)
    .map((v) => {
      const d = row(
        v,
        ['documentId', 'sourcePath', 'sha256', 'version', 'valueDate', 'bytes'],
        'document',
      );
      const documentId = id(d.documentId, 'documentId');
      requireFinancialInput(
        !docs.has(documentId),
        'DUPLICATE_DOCUMENT',
        documentId,
      );
      const sourcePath = text(d.sourcePath, 'sourcePath');
      requireFinancialInput(
        !sourcePath.startsWith('/') &&
          !sourcePath
            .split('/')
            .some((s) => s === '..' || s === '.' || s === '') &&
          !sourcePath.includes('\\'),
        'SOURCE_PATH_INVALID',
        sourcePath,
      );
      text(d.version, 'document.version');
      requireFinancialInput(
        date(d.valueDate, 'document.valueDate') === valueDate,
        'VALUE_DATE_MISMATCH',
        documentId,
      );
      requireFinancialInput(
        typeof d.bytes === 'string',
        'SOURCE_BYTES_REQUIRED',
        documentId,
      );
      const size = Buffer.byteLength(d.bytes, 'utf8');
      totalBytes += size;
      requireFinancialInput(
        size <= 4 * 1024 * 1024 &&
          totalBytes <= 16 * 1024 * 1024 &&
          Buffer.from(d.bytes, 'utf8').toString('utf8') === d.bytes,
        'SOURCE_BYTE_BUDGET_OR_UTF8_INVALID',
        documentId,
      );
      requireFinancialInput(
        typeof d.sha256 === 'string' &&
          /^[0-9a-f]{64}$/u.test(d.sha256) &&
          financialInputSha256(d.bytes) === d.sha256,
        'SUPPLEMENTAL_SOURCE_DRIFT',
        documentId,
      );
      const body: unknown = JSON.parse(d.bytes);
      requireFinancialInput(
        canonicalSerialize(body) === d.bytes,
        'CANONICAL_SOURCE_JSON_REQUIRED',
        documentId,
      );
      docs.set(documentId, body);
      return d as unknown as FinancialSourceDocument;
    })
    .sort((a, b) =>
      a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0,
    );
  const verify = (value: unknown, expected: unknown, version?: string) => {
    const s = row(value, ['documentId', 'pointer'], 'source');
    const documentId = id(s.documentId, 'source.documentId'),
      pointer = typeof s.pointer === 'string' ? s.pointer : null;
    requireFinancialInput(
      pointer !== null && docs.has(documentId),
      'SOURCE_REFERENCE_UNRESOLVED',
      documentId,
    );
    if (version !== undefined)
      requireFinancialInput(
        documents.find((d) => d.documentId === documentId)?.version === version,
        'SOURCE_VERSION_MISMATCH',
        documentId,
      );
    requireFinancialInput(
      canonicalSerialize(pointerValue(docs.get(documentId), pointer)) ===
        canonicalSerialize(expected),
      'SOURCE_VALUE_MISMATCH',
      documentId + pointer,
    );
  };
  const seenCountries = new Set<string>(),
    holdingIds = new Set<string>();
  const countries = array(r.countries, 'countries', 70)
    .map((v) => {
      const c = row(
        v,
        ['countryId', 'localCurrency', 'openingFx', 'cbRegister', 'bankLoans'],
        'country',
      );
      const cid = text(c.countryId, 'countryId'),
        original = adoption.manifest.countries.find((x) => x.countryId === cid);
      requireFinancialInput(
        original && !seenCountries.has(cid),
        'COUNTRY_COVERAGE_INVALID',
        cid,
      );
      seenCountries.add(cid);
      const lc = currency(c.localCurrency, 'localCurrency');
      requireFinancialInput(lc !== 'GCU', 'LOCAL_CURRENCY_INVALID', cid);
      const fx = row(
        c.openingFx,
        ['localCurrencyPerGcu', 'version', 'valueDate', 'source'],
        'openingFx',
      );
      exactFinancialDecimal(fx.localCurrencyPerGcu, 'openingFx.rate', true);
      const fxVersion = text(fx.version, 'openingFx.version');
      requireFinancialInput(
        date(fx.valueDate, 'openingFx.valueDate') === valueDate,
        'VALUE_DATE_MISMATCH',
        cid,
      );
      verify(
        fx.source,
        {
          countryId: cid,
          localCurrency: lc,
          localCurrencyPerGcu: fx.localCurrencyPerGcu,
          version: fxVersion,
          valueDate,
        },
        fxVersion,
      );
      const cb = row(
        c.cbRegister,
        ['version', 'valueDate', 'source', 'categories', 'holdings'],
        'cbRegister',
      );
      const cbVersion = text(cb.version, 'cbRegister.version');
      requireFinancialInput(
        date(cb.valueDate, 'cbRegister.valueDate') === valueDate,
        'VALUE_DATE_MISMATCH',
        cid,
      );
      const allowedEntities: readonly string[] = Object.values(
        original.holderRoster,
      );
      const valuationRates = new Map<string, unknown>([
        ['GCU', fx.localCurrencyPerGcu],
        [lc, '1'],
      ]);
      const categories = array(cb.categories, 'categories', 21)
        .map((v) => {
          const t = row(v, ['category', 'disposition', 'source'], 'category');
          requireFinancialInput(
            CENTRAL_BANK_OPENING_CATEGORIES.some(
              ([cat]) => cat === t.category,
            ) &&
              ['DECLARED', 'NO_DECLARED_INSTRUMENT'].includes(
                String(t.disposition),
              ),
            'CB_CATEGORY_INVALID',
            cid,
          );
          verify(
            t.source,
            {
              countryId: cid,
              category: t.category,
              disposition: t.disposition,
            },
            cbVersion,
          );
          return t as unknown as FinancialCategoryCoverage;
        })
        .sort((a, b) => (a.category < b.category ? -1 : 1));
      requireFinancialInput(
        categories.length === 21 &&
          new Set(categories.map((x) => x.category)).size === 21,
        'COMPLETE_CB_CATEGORY_COVERAGE_REQUIRED',
        cid,
      );
      const holdings = array(cb.holdings, 'holdings', 512)
        .map((v) => {
          const h = row(
            v,
            [
              'holdingId',
              'category',
              'kind',
              'amount',
              'currency',
              'localCurrencyPerUnit',
              'holderId',
              'counterpartyId',
              'usableStatus',
              'source',
            ],
            'holding',
          );
          const hid = id(h.holdingId, 'holdingId'),
            cat = CENTRAL_BANK_OPENING_CATEGORIES.find(
              ([cat]) => cat === h.category,
            );
          requireFinancialInput(
            cat &&
              !holdingIds.has(hid) &&
              categories.some(
                (x) =>
                  x.category === h.category && x.disposition === 'DECLARED',
              ),
            'HOLDING_DUPLICATE_OR_UNDECLARED',
            hid,
          );
          holdingIds.add(hid);
          const amount = exactFinancialDecimal(h.amount, 'holding.amount'),
            nativeCurrency = currency(h.currency, 'holding.currency');
          exactFinancialDecimal(
            h.localCurrencyPerUnit,
            'holding.valuation',
            true,
          );
          const priorRate = valuationRates.get(nativeCurrency);
          requireFinancialInput(
            priorRate === undefined || priorRate === h.localCurrencyPerUnit,
            'NATIVE_VALUATION_RATE_CONFLICT',
            hid,
          );
          valuationRates.set(nativeCurrency, h.localCurrencyPerUnit);
          requireFinancialInput(
            (nativeCurrency !== lc || h.localCurrencyPerUnit === '1') &&
              (nativeCurrency !== 'GCU' ||
                h.localCurrencyPerUnit === fx.localCurrencyPerGcu),
            'HOLDING_VALUATION_CONFLICT',
            hid,
          );
          requireFinancialInput(
            h.holderId === original.holderRoster.centralBank &&
              typeof h.usableStatus === 'string' &&
              h.usableStatus.length > 0,
            'HOLDING_HOLDER_OR_STATUS_MISSING',
            hid,
          );
          if (cat[1] === 'EQUITY')
            requireFinancialInput(
              h.kind === 'SOURCE_EQUITY' && h.counterpartyId === null,
              'SOURCE_EQUITY_INVALID',
              hid,
            );
          else {
            requireFinancialInput(
              !parseWorldDecimal(amount).isNegative(),
              'NEGATIVE_CB_POSITION',
              hid,
            );
            requireFinancialInput(
              h.kind === 'CLAIM' ||
                (h.kind === 'CASH' && cat[0] === 'FX_CASH_AND_DEPOSITS'),
              'INSTRUMENT_CARRIER_REQUIRED',
              hid,
            );
            requireFinancialInput(
              h.kind === 'CASH'
                ? h.counterpartyId === null
                : typeof h.counterpartyId === 'string' &&
                    allowedEntities.includes(h.counterpartyId) &&
                    h.counterpartyId !== h.holderId,
              'COUNTERPART_SOURCE_CARRIER_REQUIRED',
              hid,
            );
          }
          const { source, ...body } = h;
          verify(source, { countryId: cid, valueDate, ...body }, cbVersion);
          return h as unknown as FinancialCbHolding;
        })
        .sort((a, b) => (a.holdingId < b.holdingId ? -1 : 1));
      requireFinancialInput(
        categories.every(
          (cat) =>
            (cat.disposition === 'DECLARED') ===
            holdings.some((h) => h.category === cat.category),
        ),
        'REGISTER_DECLARATION_MISMATCH',
        cid,
      );
      verify(
        cb.source,
        {
          countryId: cid,
          version: cbVersion,
          valueDate,
          categories: categories.map(({ category, disposition }) => ({
            category,
            disposition,
          })),
          holdingIds: holdings.map((h) => h.holdingId),
        },
        cbVersion,
      );
      const loans = array(c.bankLoans, 'bankLoans', 512)
        .map((v) => {
          const l = row(
            v,
            ['loanId', 'borrowerId', 'amount', 'currency', 'source'],
            'loan',
          );
          const lid = id(l.loanId, 'loanId');
          requireFinancialInput(
            !holdingIds.has(lid),
            'DUPLICATE_LOAN_OR_HOLDING',
            lid,
          );
          holdingIds.add(lid);
          exactFinancialDecimal(l.amount, 'loan.amount', true);
          requireFinancialInput(
            l.currency === lc &&
              [
                original.holderRoster.treasury,
                original.holderRoster.operator,
                original.holderRoster.households,
              ].some((id) => id === l.borrowerId),
            'BANK_LOAN_COUNTERPART_OR_CURRENCY_INVALID',
            lid,
          );
          const { source, ...body } = l;
          verify(source, { countryId: cid, valueDate, ...body });
          return l as unknown as FinancialBankLoan;
        })
        .sort((a, b) => (a.loanId < b.loanId ? -1 : 1));
      return {
        ...c,
        cbRegister: { ...cb, categories, holdings },
        bankLoans: loans,
      } as unknown as FinancialCountryInput;
    })
    .sort((a, b) => (a.countryId < b.countryId ? -1 : 1));
  requireFinancialInput(
    countries.length === adoption.manifest.countries.length &&
      seenCountries.size === 70,
    'ALL_70_COUNTRIES_REQUIRED',
    'countries',
  );
  const result = freezeFinancialInput({
    ...r,
    documents,
    countries,
  }) as unknown as FormalFinancialOpeningContract;
  parsed.add(result);
  return result;
}
