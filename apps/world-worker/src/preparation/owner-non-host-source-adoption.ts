import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FormalFinancialOpeningContract } from './formal-financial-opening-contract.js';
import type { FormalFinancialCandidate } from './formal-financial-opening-producer.js';
import {
  Money,
  Quantity,
  canonicalDecimal,
  assertWorldDecimalResult,
  parseWorldDecimal,
  canonicalSerialize,
  createInventoryAccount,
  countryId,
  worldId,
  legalEntityId,
  commodityId,
  inventoryBatchId,
  inventoryLocationId,
  openingInventoryEntryId,
  openingSourceId,
  CURRENT_REPLAY_BINDING,
  type OpeningInventoryEntry,
  type LegalEntityId,
} from '@econmind/core';
import {
  OPENING_FINANCE_FIELDS,
  inspectOpeningEconomicDecision,
  type OpeningFinanceField,
  type TrustedOpeningDecisionInputs,
  type OpeningEconomicDecisionInspection,
} from './opening-economic-decision.js';
import {
  inspectOfficialOpeningDecisionSource,
  isVerifiedOfficialOpeningDecisionSource,
  officialOpeningTrustedDecisionSource,
  unresolvedOfficialOpeningDecision,
  OFFICIAL_OPENING_RECONCILIATION_PINS,
  type VerifiedOfficialOpeningSource,
  type OfficialOpeningSourceBytes,
} from './official-opening-decision-reconciliation.js';

/** Server-side, non-activated preparation only. No request handler, SQL, host,
 * player/admin identity, seat, writer, Clock or production startup is provided. */
export const OWNER_NON_HOST_PINS = Object.freeze({
  documentSha256:
    '57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5',
  receiptSha256:
    '2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e',
  receiptId: 'OWNER_NON_HOST_2026_10_07_V1',
  countriesSha256:
    '5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89',
});
export const NON_HOST_DECISION_CROSSWALK = Object.freeze({
  D01: 'B_FULL_TGA',
  D02: 'R_SAME_CLAIM_AND_COMPLETE_CB_OPENING_NET_WORTH',
  'D03.1': 'SCENARIO_GCU_1_TO_1_NOT_LC',
  'D03.2': 'FIVE_EXISTING_ENTITIES',
  'D03.3': '619_OP_STOCK_RIGHTS_221_ZERO_SOURCE_CELLS',
  'D03.4': 'DEPOSIT_HOLDERS',
  'D03.5': 'OPENING_ONLY_JOINT_BANK_COMPONENT_ANCHOR',
  historicalAuditD06BankReconciliation: 'D03.5',
  D06: 'IDENTITY_SEAT_NPC_NOT_BANK_RECONCILIATION',
  D05: 'OWNER_EXCLUDED_DEFERRED',
} as const);

type Row = Readonly<Record<string, unknown>>;
export interface NonHostSourceGap {
  readonly countryId: string | null;
  readonly objectId: string;
  readonly field: string;
  readonly code: string;
  readonly consumer: string;
}
export class NonHostSourceAdoptionInvalid extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
  ) {
    super(code + ':' + field);
    this.name = 'NonHostSourceAdoptionInvalid';
  }
}
function requireCondition(
  ok: unknown,
  code: string,
  field: string,
): asserts ok {
  if (!ok) throw new NonHostSourceAdoptionInvalid(code, field);
}
function text(v: unknown, field: string): string {
  requireCondition(
    typeof v === 'string' && v.length > 0,
    'SOURCE_MISSING',
    field,
  );
  return v;
}
function hash(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
function lossless(bytes: string): unknown {
  const parse = JSON.parse as (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(bytes, (_key, value, context) => {
    if (typeof value !== 'number') return value;
    requireCondition(
      typeof context.source === 'string',
      'LOSSLESS_CONTEXT_REQUIRED',
      'source',
    );
    return context.source;
  });
}

export interface LoadedNonHostOwnerPolicy {
  readonly state: 'DECISION_ADOPTED';
  readonly recordId: typeof OWNER_NON_HOST_PINS.receiptId;
  readonly reference: string;
  readonly documentSha256: typeof OWNER_NON_HOST_PINS.documentSha256;
  readonly receiptSha256: typeof OWNER_NON_HOST_PINS.receiptSha256;
  readonly decisionCrosswalk: typeof NON_HOST_DECISION_CROSSWALK;
  readonly sourcePins: typeof OFFICIAL_OPENING_RECONCILIATION_PINS;
  readonly formalWorldId: null;
  readonly productionAuthorized: false;
  readonly wholeLegacyProposalAdopted: false;
}
const ownerPolicies = new WeakSet<object>();
export function isLoadedNonHostOwnerPolicy(
  v: unknown,
): v is LoadedNonHostOwnerPolicy {
  return typeof v === 'object' && v !== null && ownerPolicies.has(v);
}
/** Paths come from reviewed server composition, never from request JSON.
 * Both immutable pins are independently fixed here, not supplied by the caller.
 * A copied DTO/hash/approved boolean cannot obtain this WeakSet brand. */
export async function loadNonHostOwnerPolicy(
  input: Readonly<{
    ownerDocumentPath: string;
    rootReceiptPath: string;
  }>,
): Promise<LoadedNonHostOwnerPolicy> {
  let document: string, receiptBytes: string;
  try {
    [document, receiptBytes] = await Promise.all([
      readFile(input.ownerDocumentPath, 'utf8'),
      readFile(input.rootReceiptPath, 'utf8'),
    ]);
  } catch {
    throw new NonHostSourceAdoptionInvalid(
      'OWNER_RECORD_SOURCE_MISSING',
      'ownerFiles',
    );
  }
  requireCondition(
    hash(document) === OWNER_NON_HOST_PINS.documentSha256,
    'OWNER_DOCUMENT_SOURCE_DRIFT',
    'ownerDocument',
  );
  requireCondition(
    hash(receiptBytes) === OWNER_NON_HOST_PINS.receiptSha256,
    'OWNER_RECEIPT_SOURCE_DRIFT',
    'rootReceipt',
  );
  const receipt = JSON.parse(receiptBytes) as {
    record_id: string;
    stage: string;
    approval_evidence: Row;
    fixed_source_scope: Row;
    decisions: readonly Row[];
  };
  requireCondition(
    receipt.record_id === OWNER_NON_HOST_PINS.receiptId &&
      receipt.stage === 'DECISION_ADOPTED' &&
      receipt.approval_evidence.user_instruction_literal === '就此执行' &&
      receipt.approval_evidence.attached_source_sha256 ===
        OWNER_NON_HOST_PINS.documentSha256 &&
      receipt.fixed_source_scope.package_id ===
        OFFICIAL_OPENING_RECONCILIATION_PINS.packageId &&
      receipt.fixed_source_scope.checksums_sha256 ===
        OFFICIAL_OPENING_RECONCILIATION_PINS.checksumsSha256 &&
      receipt.fixed_source_scope.formal_world_id === null,
    'OWNER_RECORD_SCOPE_MISMATCH',
    'receipt',
  );
  for (const id of ['D01', 'D02', 'D03', 'D04', 'D06']) {
    requireCondition(
      receipt.decisions.filter(
        (r) => r.id === id && r.state === 'DECISION_ADOPTED',
      ).length === 1,
      'OWNER_DECISION_MISSING',
      id,
    );
  }
  requireCondition(
    receipt.decisions.some(
      (r) => r.id === 'D05' && r.state === 'OWNER_EXCLUDED_DEFERRED',
    ),
    'PRODUCTION_SCOPE_NOT_EXCLUDED',
    'D05',
  );
  const policy: LoadedNonHostOwnerPolicy = freeze({
    state: 'DECISION_ADOPTED',
    recordId: OWNER_NON_HOST_PINS.receiptId,
    reference: 'sha256:' + OWNER_NON_HOST_PINS.receiptSha256 + '#/decisions',
    documentSha256: OWNER_NON_HOST_PINS.documentSha256,
    receiptSha256: OWNER_NON_HOST_PINS.receiptSha256,
    decisionCrosswalk: NON_HOST_DECISION_CROSSWALK,
    sourcePins: OFFICIAL_OPENING_RECONCILIATION_PINS,
    formalWorldId: null,
    productionAuthorized: false,
    wholeLegacyProposalAdopted: false,
  });
  ownerPolicies.add(policy);
  return policy;
}

export type NonHostPreparationScope =
  | Readonly<{ environment: 'NON_ACTIVATED_PREPARATION'; worldId: null }>
  | Readonly<{ environment: 'TEST_ONLY'; worldId: string }>;
export interface OpeningFxFixtureRow {
  readonly countryId: string;
  readonly localCurrency: string;
  readonly localCurrencyPerGcu: string;
  readonly version: string;
  readonly valueDate: string;
}
export interface TestOnlyOpeningFx {
  readonly sourceKind: 'TEST_FIXTURE';
  readonly worldId: string;
  readonly rows: readonly OpeningFxFixtureRow[];
}
const testFxTables = new WeakSet<object>();
/** No production FX approval API. A future real table needs an independently
 * reviewed source/approval loader. Missing current table stays per-country null. */
export function createTestOnlyOpeningFx(
  testWorldId: string,
  rows: readonly OpeningFxFixtureRow[],
): TestOnlyOpeningFx {
  requireCondition(
    /^WORLD_TEST_ONLY_[A-Z0-9_]+$/u.test(testWorldId),
    'TEST_ONLY_WORLD_REQUIRED',
    'worldId',
  );
  worldId(testWorldId);
  requireCondition(
    new Set(rows.map((r) => r.countryId)).size === rows.length &&
      new Set(rows.map((r) => r.localCurrency)).size === rows.length,
    'FX_DUPLICATE_COUNTRY_OR_LOCAL_CURRENCY',
    'openingFx',
  );
  for (const r of rows) {
    countryId(r.countryId);
    requireCondition(
      /^COUNTRY_(?:0[1-9]|[1-6][0-9]|70)$/u.test(r.countryId),
      'FX_COUNTRY_OUT_OF_SCOPE',
      r.countryId,
    );
    Money.from('0', r.localCurrency);
    requireCondition(
      r.localCurrency !== 'GCU' &&
        parseWorldDecimal(r.localCurrencyPerGcu).gt('0'),
      'FX_RATE_OR_LC_INVALID',
      r.countryId,
    );
    text(r.version, 'fxVersion');
    text(r.valueDate, 'fxValueDate');
  }
  const table = freeze({
    sourceKind: 'TEST_FIXTURE' as const,
    worldId: testWorldId,
    rows: rows.map((r) => ({ ...r })),
  });
  testFxTables.add(table);
  return table;
}
export interface AdoptedFieldDenomination {
  readonly field: OpeningFinanceField;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly sourcePointer: string;
  readonly rawLexeme: string;
  readonly rawUnit: 'GCU_SCENARIO_ACCOUNTING_UNIT';
  readonly decisionId: 'D03.1';
  readonly gcuEquivalent: Readonly<{ amount: string; currency: 'GCU' }>;
  readonly localBookValue: Readonly<{
    amount: string;
    currency: string;
  }> | null;
  readonly openingFx: OpeningFxFixtureRow | null;
  readonly fxAuthority: 'TEST_ONLY_NOT_PRODUCTION' | 'SOURCE_MISSING';
  readonly state:
    'SOURCE_RECONCILED_GCU_LC_MISSING' | 'SOURCE_RECONCILED_TEST_ONLY_LC';
}
function inLocal(
  amount: string,
  fx: OpeningFxFixtureRow,
): Readonly<{ amount: string; currency: string }> {
  const exact = assertWorldDecimalResult(
    parseWorldDecimal(amount).mul(parseWorldDecimal(fx.localCurrencyPerGcu)),
  );
  return Money.from(
    canonicalDecimal(exact),
    fx.localCurrency,
  ).toCanonicalValue();
}
export const CENTRAL_BANK_OPENING_CATEGORIES = Object.freeze([
  ['FX_CASH_AND_DEPOSITS', 'ASSET', 'FX Cash & Deposits', 'CENTRAL_BANK-U0112'],
  [
    'FOREIGN_RESERVE_SECURITIES',
    'ASSET',
    'Foreign Reserve Securities',
    'CENTRAL_BANK-U0113',
  ],
  [
    'RESERVE_SWAP_RECEIVABLES',
    'ASSET',
    'Reserve Swap Receivables',
    'CENTRAL_BANK-U0114',
  ],
  [
    'GOLD_OTHER_RESERVE_ASSETS',
    'ASSET',
    'Gold / Other Reserve Assets',
    'CENTRAL_BANK-U0115',
  ],
  [
    'DOMESTIC_GOVERNMENT_SECURITIES',
    'ASSET',
    'Domestic Government Securities',
    'CENTRAL_BANK-U0116',
  ],
  [
    'REGULAR_REFINANCING_LOANS',
    'ASSET',
    'Regular Refinancing Loans',
    'CENTRAL_BANK-U0117',
  ],
  ['ELA_LOANS', 'ASSET', 'ELA Loans', 'CENTRAL_BANK-U0118'],
  [
    'MONETARY_FINANCING_CLAIMS',
    'ASSET',
    'Monetary Financing Claims',
    'CENTRAL_BANK-U0119',
  ],
  [
    'ACCRUED_INTEREST_RECEIVABLE',
    'ASSET',
    'Accrued Interest Receivable',
    'CENTRAL_BANK-U0120',
  ],
  [
    'OTHER_CENTRAL_BANK_ASSETS',
    'ASSET',
    'Other Central Bank Assets',
    'CENTRAL_BANK-U0121',
  ],
  [
    'CURRENCY_IN_CIRCULATION',
    'LIABILITY',
    'Currency in Circulation',
    'CENTRAL_BANK-U0124',
  ],
  [
    'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
    'LIABILITY',
    'Commercial Bank Reserve Accounts',
    'CENTRAL_BANK-U0125',
  ],
  [
    'TREASURY_GOVERNMENT_DEPOSIT',
    'LIABILITY',
    'Treasury / Government Deposit',
    'CENTRAL_BANK-U0126',
  ],
  [
    'CENTRAL_BANK_BILLS_TERM_DEPOSITS',
    'LIABILITY',
    'Central Bank Bills / Term Deposits',
    'CENTRAL_BANK-U0127',
  ],
  [
    'RESERVE_SWAP_PAYABLES',
    'LIABILITY',
    'Reserve Swap Payables',
    'CENTRAL_BANK-U0128',
  ],
  [
    'ACCRUED_INTEREST_PAYABLE',
    'LIABILITY',
    'Accrued Interest Payable',
    'CENTRAL_BANK-U0129',
  ],
  [
    'OTHER_CENTRAL_BANK_LIABILITIES',
    'LIABILITY',
    'Other Central Bank Liabilities',
    'CENTRAL_BANK-U0130',
  ],
  [
    'INITIAL_CENTRAL_BANK_CAPITAL',
    'EQUITY',
    'Paid-in / Initial Central Bank Capital',
    'CENTRAL_BANK-U0133',
  ],
  ['RETAINED_EARNINGS', 'EQUITY', 'Retained Earnings', 'CENTRAL_BANK-U0134'],
  ['VALUATION_RESERVE', 'EQUITY', 'Valuation Reserve', 'CENTRAL_BANK-U0135'],
  ['ACCUMULATED_LOSSES', 'EQUITY', 'Accumulated Losses', 'CENTRAL_BANK-U0136'],
] as const);
export type CentralBankOpeningCategory =
  (typeof CENTRAL_BANK_OPENING_CATEGORIES)[number][0];
/** Actual tools/holdings are separate from a reserved account catalogue.
 * This prefilled input contract cannot itself approve zero/null/unknown values. */
export interface CentralBankOpeningCategoryInput {
  readonly countryId: string;
  readonly category: CentralBankOpeningCategory;
  readonly categoryName: string;
  readonly accountClass: 'ASSET' | 'LIABILITY' | 'EQUITY';
  readonly sourceUnit: string;
  readonly state:
    | 'ADOPTED_SOURCE_GCU_LC_PENDING'
    | 'ADOPTED_TEST_ONLY_LC'
    | 'NOT_ADOPTED_NO_DECLARED_INSTRUMENT'
    | 'NOT_ADOPTED_UNSUPPORTED_EQUITY_COMPONENT';
  readonly gcuEquivalentAmount: string | null;
  readonly localBookValue: Readonly<{
    amount: string;
    currency: string;
  }> | null;
  readonly sourcePointer: string | null;
  readonly holderId: string | null;
  readonly issuerId: string | null;
  readonly counterpartyId: string | null;
  readonly toolOrHoldingId: string | null;
  readonly reason: string;
}
/** Diagnostic parser for a source-declared holding, NOT an adoption registry.
 * Explicit no-instrument is distinct from a declared instrument missing fields.
 * Source COMPLETE here never means owner-approved or complete CB balance sheet. */
export function inspectCentralBankHoldingCandidate(
  input: Readonly<{
    countryId: string;
    category: CentralBankOpeningCategory;
    declaredInstrument: boolean;
    holdingId: string | null;
    amount: string | null;
    currency: string | null;
    holderId: string | null;
    counterpartyId: string | null;
    counterpartyRequired: boolean;
    valuationRef: string | null;
    usableStatus: string | null;
    sourceRef: string | null;
  }>,
) {
  countryId(input.countryId);
  requireCondition(
    CENTRAL_BANK_OPENING_CATEGORIES.some((c) => c[0] === input.category),
    'UNKNOWN_CB_CATEGORY',
    input.category,
  );
  if (!input.declaredInstrument) {
    requireCondition(
      [
        input.holdingId,
        input.amount,
        input.currency,
        input.holderId,
        input.counterpartyId,
        input.valuationRef,
        input.usableStatus,
        input.sourceRef,
      ].every((v) => v === null),
      'UNDECLARED_HOLDING_HAS_VALUES',
      input.category,
    );
    return freeze({
      state: 'NO_DECLARED_INSTRUMENT' as const,
      amount: null,
      missingFields: [] as string[],
      adoptionAllowed: false,
    });
  }
  const required = [
    'holdingId',
    'amount',
    'currency',
    'holderId',
    'valuationRef',
    'usableStatus',
    'sourceRef',
  ] as const;
  const missingFields = required.filter(
    (k) => input[k] === null || input[k] === '',
  );
  const missing: string[] = [...missingFields];
  if (input.counterpartyRequired && !input.counterpartyId)
    missing.push('counterpartyId');
  if (input.amount !== null && input.currency !== null) {
    const m = Money.from(input.amount, input.currency);
    requireCondition(
      !m.amount.isNegative(),
      'NEGATIVE_SOURCE_HOLDING',
      input.holdingId ?? input.category,
    );
  }
  if (input.holderId !== null) legalEntityId(input.holderId);
  if (input.counterpartyId !== null) legalEntityId(input.counterpartyId);
  return freeze({
    state: missing.length
      ? ('SOURCE_MISSING' as const)
      : ('SOURCE_COMPLETE_CANDIDATE_NOT_ADOPTED' as const),
    amount: input.amount,
    missingFields: missing,
    adoptionAllowed: false,
  });
}
export interface OwnerNonHostSourceAdoption {
  readonly state: 'DECISION_ADOPTED_SOURCE_PARTIALLY_RECONCILED_NOT_SEED';
  readonly source: VerifiedOfficialOpeningSource;
  readonly ownerPolicy: LoadedNonHostOwnerPolicy;
  readonly trustedSource: TrustedOpeningDecisionInputs['source'];
  readonly scope: NonHostPreparationScope;
  readonly manifest: ReturnType<typeof buildManifest>;
  readonly manifestFingerprint: string;
  readonly inventoryEntries: readonly OpeningInventoryEntry[];
  readonly legacyInspection: OpeningEconomicDecisionInspection;
  readonly legacyOwnerRecords: readonly [];
  readonly seedAdmissionAllowed: false;
  readonly productionAuthorized: false;
}
const adoptions = new WeakSet<object>();
export function isOwnerNonHostSourceAdoption(
  v: unknown,
): v is OwnerNonHostSourceAdoption {
  return typeof v === 'object' && v !== null && adoptions.has(v);
}
function buildManifest(
  source: VerifiedOfficialOpeningSource,
  policy: LoadedNonHostOwnerPolicy,
  scope: NonHostPreparationScope,
  fxTable?: TestOnlyOpeningFx,
) {
  const trusted = officialOpeningTrustedDecisionSource(source);
  const financeSha = trusted.financeSha256;
  const gaps: NonHostSourceGap[] = [];
  const add = (
    cid: string | null,
    objectId: string,
    field: string,
    code: string,
    consumer: string,
  ) => gaps.push({ countryId: cid, objectId, field, code, consumer });
  const entities = source.legalEntityProposals.map((r) => ({
    sourceId: text(r.sourceEntityId, 'entity/sourceId'),
    countryId: text(r.coreCountryId, 'entity/country'),
    role: text(r.role, 'entity/role'),
    entityId: legalEntityId(
      text(r.proposedCoreLegalEntityId, 'entity/id'),
    ) as LegalEntityId,
    decisionId: 'D03.2' as const,
    state: 'DECISION_ADOPTED' as const,
    playerId: null,
    seatGranted: false,
    policyNpcEnabled: false,
  }));
  requireCondition(
    entities.length === 350 &&
      new Set(entities.map((r) => r.entityId)).size === 350,
    'SOURCE_ENTITY_COVERAGE_MISMATCH',
    'entities',
  );
  const roster = (cid: string, role: string): LegalEntityId => {
    const found = entities.filter(
      (r) => r.countryId === cid && r.role === role,
    );
    requireCondition(
      found.length === 1,
      'SOURCE_ENTITY_ROLE_MISSING_OR_AMBIGUOUS',
      cid + ':' + role,
    );
    return found[0]!.entityId;
  };
  for (const cid of source.countryIds)
    for (const role of ['GOV', 'OP', 'HOUSEHOLDS', 'BANK', 'CENTRAL-BANK'])
      roster(cid, role);
  const stockDomain = source.domains.find((d) => d.dataset === 'stocks');
  requireCondition(stockDomain, 'SOURCE_MISSING', 'stocks/provenance');
  const stockRights = source.stocks.map((r, i) => {
    const cid = text(r.coreCountryId, 'stock/country'),
      unit = text(r.unit, 'stock/unit');
    const available = text(r.available, 'stock/available');
    const q = Quantity.from(available, unit);
    requireCondition(!q.amount.isNegative(), 'NEGATIVE_OPENING_INVENTORY', cid);
    requireCondition(
      Quantity.from(text(r.reserved, 'stock/reserved'), unit).amount.isZero() &&
        Quantity.from(
          text(r.inTransit, 'stock/inTransit'),
          unit,
        ).amount.isZero(),
      'SOURCE_STOCK_BUCKET_UNSUPPORTED',
      text(r.sourceStockId, 'stock/id'),
    );
    return {
      sourceId: text(r.sourceStockId, 'stock/id'),
      countryId: cid,
      sourcePath: stockDomain.sourcePath,
      sourceSha256: stockDomain.sourceSha256,
      sourcePointer: '/' + i,
      unit,
      rawAvailable: text(source.stockOriginals[i]?.available, 'raw stock'),
      available,
      positive: !q.amount.isZero(),
      decisionId: 'D03.3' as const,
      titleHolderId: roster(cid, 'OP'),
      riskBearerId: roster(cid, 'OP'),
      inventoryEntryId: text(r.proposedInventoryEntryId, 'stock/entryId'),
      batchId: text(r.proposedBatchId, 'stock/batchId'),
      locationId: text(r.proposedInventoryLocationId, 'stock/location'),
      commodityId: text(r.commodityId, 'stock/commodity'),
      state: q.amount.isZero()
        ? ('ZERO_SOURCE_CELL_NO_ENTRY' as const)
        : ('DECISION_ADOPTED' as const),
    };
  });
  requireCondition(
    stockRights.length === 840 &&
      stockRights.filter((r) => r.positive).length === 619,
    'SOURCE_STOCK_COUNTS_MISMATCH',
    'stockRights',
  );
  const countries = trusted.finance.map((f, index) => {
    const cid = f.countryId,
      original = source.financeOriginals[index]!;
    requireCondition(
      original.currency === 'GCU_SCENARIO_ACCOUNTING_UNIT',
      'SOURCE_CURRENCY_CONFLICT',
      cid,
    );
    const fx = fxTable?.rows.find((r) => r.countryId === cid) ?? null;
    const denominations = Object.fromEntries(
      OPENING_FINANCE_FIELDS.map((field) => {
        const amount = Money.from(f.values[field], 'GCU').toCanonicalValue()
          .amount;
        if (fx === null) {
          add(
            cid,
            'FINANCE_' + cid,
            field + '.localCurrency',
            'OPENING_LC_CODE_SOURCE_MISSING',
            'A_FINANCIAL_CARRIER',
          );
          add(
            cid,
            'FINANCE_' + cid,
            field + '.openingFx',
            'OPENING_FX_SOURCE_MISSING',
            'A_FINANCIAL_CARRIER',
          );
        }
        const d: AdoptedFieldDenomination = {
          field,
          sourcePath: 'artifacts/world-balanced-candidate-v1/data/finance.json',
          sourceSha256: financeSha,
          sourcePointer: f.sourceRowPointer + '/' + field,
          rawLexeme: f.values[field],
          rawUnit: 'GCU_SCENARIO_ACCOUNTING_UNIT',
          decisionId: 'D03.1',
          gcuEquivalent: { amount, currency: 'GCU' },
          localBookValue: fx === null ? null : inLocal(amount, fx),
          openingFx: fx,
          fxAuthority:
            fx === null ? 'SOURCE_MISSING' : 'TEST_ONLY_NOT_PRODUCTION',
          state:
            fx === null
              ? 'SOURCE_RECONCILED_GCU_LC_MISSING'
              : 'SOURCE_RECONCILED_TEST_ONLY_LC',
        };
        return [field, d];
      }),
    ) as Record<OpeningFinanceField, AdoptedFieldDenomination>;
    const H = Money.from(f.values.householdBankDeposits, 'GCU');
    const D = Money.from(f.values.businessBankDeposits, 'GCU');
    const R = Money.from(f.values.bankReserveAssets, 'GCU');
    const A = Money.from(f.values.bankLoanAssets, 'GCU');
    const L = H.add(D),
      E = R.add(A).subtract(L);
    const bankOpening = {
      decisionId: 'D03.5',
      appliesOnlyAtOpening: true,
      adoptedL: L.toCanonicalValue(),
      adoptedE: E.toCanonicalValue(),
      adoptedMinusOriginalL: L.subtract(
        Money.from(f.values.bankDepositLiabilities, 'GCU'),
      ).toCanonicalValue().amount,
      adoptedMinusOriginalE: E.subtract(
        Money.from(f.values.bankEquity, 'GCU'),
      ).toCanonicalValue().amount,
      localL: fx === null ? null : inLocal(L.toCanonicalValue().amount, fx),
      localE: fx === null ? null : inLocal(E.toCanonicalValue().amount, fx),
      originalReport: source.financeReportedReconciliation[index],
      causeOfDifference: 'NOT_ASSUMED',
      resetRuntimeLiabilitiesOrEquity: false,
    };
    const pair = (
      field: 'treasuryCentralBankBalance' | 'bankReserveAssets',
      holder: string,
      decisionId: 'D01' | 'D02',
    ) => ({
      decisionId,
      assetHolderId: holder,
      liabilityIssuerId: roster(cid, 'CENTRAL-BANK'),
      gcuEquivalentAmount: denominations[field].gcuEquivalent,
      localAmount: denominations[field].localBookValue,
      claimId: null,
      valueDate: fx?.valueDate ?? null,
      state:
        fx === null
          ? 'LC_FX_SOURCE_MISSING_NO_CLAIM_MATERIALIZED'
          : 'TEST_ONLY_CLAIM_CARRIER_REQUIRED',
      notCentralBankAssetOrCash: true,
    });
    const treasury = pair(
      'treasuryCentralBankBalance',
      roster(cid, 'GOV'),
      'D01',
    );
    const reserve = pair('bankReserveAssets', roster(cid, 'BANK'), 'D02');
    const cbInput: CentralBankOpeningCategoryInput[] =
      CENTRAL_BANK_OPENING_CATEGORIES.map(
        ([category, accountClass, categoryName, sourceUnit]) => {
          const field =
            category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS'
              ? 'bankReserveAssets'
              : category === 'TREASURY_GOVERNMENT_DEPOSIT'
                ? 'treasuryCentralBankBalance'
                : null;
          const d = field === null ? null : denominations[field];
          return {
            countryId: cid,
            category,
            categoryName,
            accountClass,
            sourceUnit,
            state:
              d !== null
                ? fx === null
                  ? 'ADOPTED_SOURCE_GCU_LC_PENDING'
                  : 'ADOPTED_TEST_ONLY_LC'
                : accountClass === 'EQUITY'
                  ? 'NOT_ADOPTED_UNSUPPORTED_EQUITY_COMPONENT'
                  : 'NOT_ADOPTED_NO_DECLARED_INSTRUMENT',
            gcuEquivalentAmount: d?.gcuEquivalent.amount ?? null,
            localBookValue: d?.localBookValue ?? null,
            sourcePointer: d?.sourcePointer ?? null,
            holderId:
              category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS'
                ? roster(cid, 'BANK')
                : category === 'TREASURY_GOVERNMENT_DEPOSIT'
                  ? roster(cid, 'GOV')
                  : null,
            issuerId: d === null ? null : roster(cid, 'CENTRAL-BANK'),
            counterpartyId:
              d === null
                ? null
                : category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS'
                  ? roster(cid, 'BANK')
                  : roster(cid, 'GOV'),
            toolOrHoldingId: null,
            reason:
              d !== null
                ? 'Owner adopted full source amount; actual LC/paired claim still separately required.'
                : accountClass === 'EQUITY'
                  ? 'No source-supported equity subcomponent; initial net worth is a distinct one-time rule, not fabricated historical capital/earnings/loss.'
                  : 'Fixed finance/schema and verified structured-source inventory declare no instrument/holding in this category. Reserved account name is not an asset. Owner section3.2 does not adopt absent tools. Amount remains null, NOT an approved zero or assertion of a complete holding register.',
          };
        },
      );
    add(
      cid,
      roster(cid, 'CENTRAL-BANK'),
      'completeAssetAndLiabilityHoldingRegister',
      'CB_OPENING_HOLDING_REGISTER_COMPLETENESS_NOT_ESTABLISHED',
      'A_CB_OPENING_NET_WORTH',
    );
    return {
      countryId: cid,
      sourceRowPointer: f.sourceRowPointer,
      rawFinance: f.values,
      holderRoster: {
        treasury: roster(cid, 'GOV'),
        operator: roster(cid, 'OP'),
        households: roster(cid, 'HOUSEHOLDS'),
        bank: roster(cid, 'BANK'),
        centralBank: roster(cid, 'CENTRAL-BANK'),
      },
      denominations,
      bankOpening,
      treasury,
      reserve,
      cbInput,
      centralBankNetWorth: {
        decisionId: 'D02',
        rule: 'OPENING_ONCE_ASSETS_MINUS_LIABILITIES_NEGATIVE_ALLOWED',
        amount: null,
        state: 'SOURCE_MISSING_COMPLETE_REGISTER',
        isCash: false,
        governmentAutomaticRecapitalisation: false,
      },
      prohibitedBackingSubstitutions: [
        'R',
        'TGA_B',
        'BANK_A',
        'BANK_E',
        'PHYSICAL_ASSET_BOOK_VALUE',
        'GDP',
        'FUTURE_TAXES',
      ],
    };
  });
  if (scope.worldId === null)
    add(
      null,
      'FORMAL_WORLD',
      'worldId',
      'WORLD_BINDING_NOT_VERIFIED_NO_SEED',
      'A_CANONICAL_OPENING_SEED',
    );
  return freeze({
    schemaVersion: 'owner-non-host-source-adoption-v1',
    state: 'DECISION_ADOPTED_SOURCE_PARTIALLY_RECONCILED_NOT_SEED',
    ownerRecord: policy,
    sourcePins: source.pins,
    scope,
    countryCount: String(countries.length),
    entities,
    stockRights,
    countries,
    gaps,
    centralBankCategoryCount: '21',
    positiveStockCount: '619',
    zeroSourceCellCount: '221',
    sourceRewritten: false,
    seedAdmissionAllowed: false,
    productionAuthorized: false,
  });
}

/** Consumer-facing composition. Uses existing E branded source and actual A
 * parser/inspection; it does not turn the new subset policy into old full-intent
 * records. A's financial module can consume the independently branded policy,
 * trustedSource, denominations and 21-category prefilled input directly. */
export function produceOwnerNonHostSourceAdoption(
  input: Readonly<{
    source: VerifiedOfficialOpeningSource;
    ownerPolicy: LoadedNonHostOwnerPolicy;
    scope: NonHostPreparationScope;
    openingFx?: TestOnlyOpeningFx;
  }>,
): OwnerNonHostSourceAdoption {
  requireCondition(
    isVerifiedOfficialOpeningDecisionSource(input.source),
    'FABRICATED_SOURCE',
    'source',
  );
  requireCondition(
    isLoadedNonHostOwnerPolicy(input.ownerPolicy),
    'UNTRUSTED_OWNER_POLICY',
    'ownerPolicy',
  );
  requireCondition(
    input.scope.environment === 'NON_ACTIVATED_PREPARATION' ||
      input.scope.environment === 'TEST_ONLY',
    'PRODUCTION_EXCLUDED',
    'scope',
  );
  if (input.scope.environment === 'TEST_ONLY') {
    requireCondition(
      /^WORLD_TEST_ONLY_[A-Z0-9_]+$/u.test(input.scope.worldId),
      'TEST_ONLY_WORLD_REQUIRED',
      'scope.worldId',
    );
    worldId(input.scope.worldId);
  } else
    requireCondition(
      input.scope.worldId === null,
      'UNVERIFIED_FORMAL_WORLD',
      'scope.worldId',
    );
  if (input.openingFx !== undefined) {
    requireCondition(
      testFxTables.has(input.openingFx) &&
        input.scope.environment === 'TEST_ONLY' &&
        input.openingFx.worldId === input.scope.worldId,
      'TEST_FX_CANNOT_ENTER_PRODUCTION_OR_WRONG_WORLD',
      'openingFx',
    );
  }
  const manifest = buildManifest(
    input.source,
    input.ownerPolicy,
    input.scope,
    input.openingFx,
  );
  const inventoryEntries: OpeningInventoryEntry[] = [];
  if (input.scope.environment === 'TEST_ONLY') {
    const wid = worldId(input.scope.worldId);
    for (const s of manifest.stockRights.filter((r) => r.positive))
      inventoryEntries.push({
        entryId: openingInventoryEntryId(s.inventoryEntryId),
        sourceId: openingSourceId('SOURCE_OFFICIAL_STOCKS'),
        quantity: Quantity.from(s.available, s.unit),
        account: createInventoryAccount({
          worldId: wid,
          countryId: countryId(s.countryId),
          commodityId: commodityId(s.commodityId),
          batchId: inventoryBatchId(s.batchId),
          unit: s.unit,
          physicalLocationId: inventoryLocationId(s.locationId),
          bucket: 'AVAILABLE',
          reservationId: null,
          shipmentId: null,
          titleHolderId: s.titleHolderId,
          riskBearerId: s.riskBearerId,
          economicRecognitionId: null,
        }),
      });
  }
  const trustedSource = officialOpeningTrustedDecisionSource(input.source);
  const d = unresolvedOfficialOpeningDecision(input.source, {
    worldId: input.scope.worldId,
    modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    orchestratorVersion: 'NON_HOST_SOURCE_PREPARATION_V1',
  });
  const decision = {
    ...d,
    rules: {
      currency: 'EXACT_1_TO_1_GCU' as const,
      legalOwnership: 'E_FIXED_ROSTER_TITLE_RISK' as const,
      bankReconciliation: 'E_COMPONENT_ANCHOR' as const,
      reserve: 'BANK_ASSET_CB_LIABILITY_SAME_CLAIM' as const,
      transformationVersion: 'OWNER_NON_HOST_2026_10_07_V1',
    },
    countries: d.countries.map((c, i) => ({
      ...c,
      fundsModel: 'TREASURY_DEPOSIT_AT_CB' as const,
      legalEntities: {
        treasury: manifest.countries[i]!.holderRoster.treasury,
        bank: manifest.countries[i]!.holderRoster.bank,
        centralBank: manifest.countries[i]!.holderRoster.centralBank,
      },
    })),
  };
  const legacyInspection = inspectOpeningEconomicDecision({
    decision,
    trusted: { source: trustedSource, ownerRecords: [] },
  });
  const result: OwnerNonHostSourceAdoption = freeze({
    state: 'DECISION_ADOPTED_SOURCE_PARTIALLY_RECONCILED_NOT_SEED',
    source: input.source,
    ownerPolicy: input.ownerPolicy,
    trustedSource,
    scope: { ...input.scope },
    manifest,
    manifestFingerprint: 'sha256:' + hash(canonicalSerialize(manifest)),
    inventoryEntries,
    legacyInspection,
    legacyOwnerRecords: [] as const,
    seedAdmissionAllowed: false,
    productionAuthorized: false,
  });
  adoptions.add(result);
  return result;
}

/** Read-only server filesystem entry point, no downloads/environment secrets.
 * Existing source verifier is reused, not a second mapper or approval channel. */
export async function loadOwnerNonHostSourceAdoption(
  input: Readonly<{
    repositoryRoot: string;
    ownerDocumentPath: string;
    rootReceiptPath: string;
    scope: NonHostPreparationScope;
    openingFx?: TestOnlyOpeningFx;
  }>,
): Promise<OwnerNonHostSourceAdoption> {
  const policy = await loadNonHostOwnerPolicy(input);
  const read = (p: string) =>
    readFile(path.join(input.repositoryRoot, p), 'utf8');
  const mappingBytes = await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
  );
  requireCondition(
    hash(mappingBytes) === OFFICIAL_OPENING_RECONCILIATION_PINS.mappingSha256,
    'SOURCE_DRIFT',
    'mapping',
  );
  const mapping = JSON.parse(mappingBytes) as {
    source: { dataFiles: Record<string, unknown> };
  };
  const datasets: Record<string, string> = {};
  for (const p of Object.keys(mapping.source.dataFiles)) {
    requireCondition(
      /^data\/[a-z0-9-]+\.json$/u.test(p),
      'SOURCE_PATH_INVALID',
      p,
    );
    datasets[p] = await read('artifacts/world-balanced-candidate-v1/' + p);
  }
  const sourceBytes: OfficialOpeningSourceBytes = {
    mappingBytes,
    datasets,
    checksumsBytes: await read(
      'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
    ),
    coverageBytes: await read(
      'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
    ),
    proposalBytes: await read(
      'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
    ),
  };
  const checked = inspectOfficialOpeningDecisionSource(sourceBytes);
  requireCondition(
    checked.source !== null,
    'SOURCE_DRIFT',
    JSON.stringify(checked.blockers),
  );
  const countriesBytes = datasets['data/countries.json'];
  requireCondition(
    countriesBytes !== undefined &&
      hash(countriesBytes) === OWNER_NON_HOST_PINS.countriesSha256,
    'SOURCE_DRIFT',
    'countries',
  );
  const countries = lossless(countriesBytes) as readonly Row[];
  requireCondition(
    countries.length === 70 &&
      countries.reduce(
        (sum, r) => sum + BigInt(text(r.population, 'population')),
        0n,
      ) === 14712146434n,
    'SOURCE_POPULATION_MISMATCH',
    'countries/population',
  );
  return produceOwnerNonHostSourceAdoption({
    source: checked.source,
    ownerPolicy: policy,
    scope: input.scope,
    ...(input.openingFx === undefined ? {} : { openingFx: input.openingFx }),
  });
}

/** Independently provisioned by the existing Root provenance owner. This is a
 * private deployment dependency, not a record field or request-supplied manifest.
 * No real registration is installed by this implementation. */
export interface FinancialSupplementRegistration {
  readonly recordId: string;
  readonly ownerIdentity: string;
  readonly expectedReceiptSha256: string;
  readonly expectedInstructionSha256: string;
  readonly retainedReference: string;
  readonly channel: 'DIRECT_USER_MESSAGE_IN_CURRENT_ROOT_CHAT';
}
export interface FinancialSupplementAdoption {
  readonly recordId: string;
  readonly receiptSha256: string;
  readonly instructionSha256: string;
  readonly retainedReference: string;
  readonly parent: OwnerNonHostSourceAdoption;
  readonly contractFingerprint: string;
  readonly candidateFingerprint: string;
  readonly assemblyIntentFingerprint: string;
  readonly worldId: string;
  readonly seedId: string;
  readonly replayBinding: typeof CURRENT_REPLAY_BINDING;
  readonly orchestratorVersion: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly admissionAllowed: false;
}
const financialAdoptions = new WeakSet<object>();
export function isFinancialSupplementAdoption(
  v: unknown,
): v is FinancialSupplementAdoption {
  return typeof v === 'object' && v !== null && financialAdoptions.has(v);
}
export function snapshotFinancialSupplementRegistration(
  input: FinancialSupplementRegistration,
): FinancialSupplementRegistration {
  requireCondition(
    input &&
      Object.keys(input).sort().join('|') ===
        [
          'recordId',
          'ownerIdentity',
          'expectedReceiptSha256',
          'expectedInstructionSha256',
          'retainedReference',
          'channel',
        ]
          .sort()
          .join('|'),
    'FINANCIAL_REGISTRATION_INVALID',
    'registration',
  );
  requireCondition(
    /^[A-Z][A-Z0-9_]{0,127}$/u.test(input.recordId) &&
      typeof input.ownerIdentity === 'string' &&
      input.ownerIdentity.length > 0 &&
      input.ownerIdentity.length <= 256 &&
      /^[0-9a-f]{64}$/u.test(input.expectedReceiptSha256) &&
      /^[0-9a-f]{64}$/u.test(input.expectedInstructionSha256) &&
      /^git:[0-9a-f]{40}:docs\/governance\/owner-inputs\/[A-Za-z0-9_./-]+\.json$/u.test(
        input.retainedReference,
      ) &&
      !input.retainedReference.includes('..') &&
      input.channel === 'DIRECT_USER_MESSAGE_IN_CURRENT_ROOT_CHAT',
    'FINANCIAL_REGISTRATION_INVALID',
    'registration',
  );
  return freeze({ ...input });
}

/** Same provenance ownership as the original rule loader, not an admission
 * signature issuer. Caller is the sole genuine bundle composition path. */
export function loadFinancialSupplementAdoption(input: {
  readonly registration: FinancialSupplementRegistration;
  readonly receiptBytes: string;
  readonly instructionBytes: string;
  readonly parent: OwnerNonHostSourceAdoption;
  readonly contract: FormalFinancialOpeningContract;
  readonly candidate: FormalFinancialCandidate;
  readonly assemblyIntentFingerprint: string;
  readonly seedId: string;
  readonly orchestratorVersion: string;
}): FinancialSupplementAdoption {
  const reg = snapshotFinancialSupplementRegistration(input.registration);
  requireCondition(
    isOwnerNonHostSourceAdoption(input.parent) &&
      input.parent.scope.environment === 'NON_ACTIVATED_PREPARATION',
    'REAL_NON_ACTIVATED_ADOPTION_REQUIRED',
    'parent',
  );
  requireCondition(
    hash(input.receiptBytes) === reg.expectedReceiptSha256 &&
      hash(input.instructionBytes) === reg.expectedInstructionSha256,
    'REGISTERED_FINANCIAL_ADOPTION_IDENTITY_MISMATCH',
    'receipt',
  );
  const record = JSON.parse(input.receiptBytes) as Record<string, unknown>;
  const expectedKeys = [
    'schemaVersion',
    'recordId',
    'purpose',
    'ownerIdentity',
    'adoptedAtReal',
    'ownerInstructionSha256',
    'parentReceiptSha256',
    'sourcePins',
    'adoptionManifestFingerprint',
    'contractFingerprint',
    'candidateFingerprint',
    'assemblyIntentFingerprint',
    'worldId',
    'seedId',
    'sourceId',
    'sourceVersion',
    'valueDate',
    'replayBinding',
    'orchestratorVersion',
    'documents',
    'completeness',
    'exclusions',
  ];
  requireCondition(
    record &&
      Object.keys(record).sort().join('|') === expectedKeys.sort().join('|'),
    'FINANCIAL_ADOPTION_EXACT_KEYS_REQUIRED',
    'receipt',
  );
  const contract = input.contract;
  const equal = (a: unknown, b: unknown) =>
    canonicalSerialize(a) === canonicalSerialize(b);
  const documents = contract.documents
    .map((d) => ({
      documentId: d.documentId,
      sourcePath: d.sourcePath,
      sha256: d.sha256,
      bytes: String(Buffer.byteLength(d.bytes, 'utf8')),
      version: d.version,
      valueDate: d.valueDate,
    }))
    .sort((a, b) => (a.documentId < b.documentId ? -1 : 1));
  requireCondition(
    contract.evidenceKind === 'SOURCE_CANDIDATE' &&
      typeof input.orchestratorVersion === 'string' &&
      input.orchestratorVersion.length > 0 &&
      input.orchestratorVersion.length <= 128 &&
      record.schemaVersion === 'financial-supplement-adoption-v1' &&
      record.purpose ===
        'ADOPT_FINANCIAL_SUPPLEMENT_FOR_NON_ACTIVATED_PREPARATION' &&
      record.recordId === reg.recordId &&
      record.ownerIdentity === reg.ownerIdentity &&
      typeof record.adoptedAtReal === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
        record.adoptedAtReal,
      ) &&
      new Date(record.adoptedAtReal).toISOString() === record.adoptedAtReal &&
      record.ownerInstructionSha256 === reg.expectedInstructionSha256 &&
      record.parentReceiptSha256 === input.parent.ownerPolicy.receiptSha256 &&
      equal(record.sourcePins, input.parent.ownerPolicy.sourcePins) &&
      record.adoptionManifestFingerprint === input.parent.manifestFingerprint &&
      record.contractFingerprint === input.candidate.contractFingerprint &&
      input.candidate.contractFingerprint ===
        'sha256:' + hash(canonicalSerialize(contract)) &&
      input.candidate.requestedWorldId === contract.worldId &&
      record.candidateFingerprint === input.candidate.fingerprint &&
      record.assemblyIntentFingerprint === input.assemblyIntentFingerprint &&
      record.worldId === contract.worldId &&
      record.seedId === input.seedId &&
      record.sourceId === contract.sourceId &&
      record.sourceVersion === contract.sourceVersion &&
      record.valueDate === contract.valueDate &&
      equal(record.replayBinding, CURRENT_REPLAY_BINDING) &&
      record.orchestratorVersion === input.orchestratorVersion &&
      equal(record.documents, documents) &&
      equal(record.exclusions, [
        'HOST_STARTUP',
        'SQL_SCHEMA_GRANTS',
        'IDENTITY_SEATS_NPC',
        'RUNTIME_ADMISSION',
        'RUNTIME_NET_WORTH_RESET',
        'WHOLE_LEGACY_E_PROPOSAL',
      ]),
    'FINANCIAL_ADOPTION_SCOPE_MISMATCH',
    'receipt',
  );
  const coverage = record.completeness as {
    documentId: string;
    pointer: string;
  };
  requireCondition(
    coverage &&
      Object.keys(coverage).sort().join('|') === 'documentId|pointer' &&
      typeof coverage.pointer === 'string' &&
      coverage.pointer.startsWith('/') &&
      !/~(?![01])/u.test(coverage.pointer),
    'COMPLETENESS_SOURCE_REQUIRED',
    'completeness',
  );
  const document = contract.documents.find(
    (d) => d.documentId === coverage.documentId,
  );
  requireCondition(document, 'COMPLETENESS_SOURCE_REQUIRED', 'documentId');
  let value: unknown = JSON.parse(document.bytes);
  for (const raw of coverage.pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/gu, '/').replace(/~0/gu, '~');
    requireCondition(
      value && typeof value === 'object' && Object.hasOwn(value, key),
      'COMPLETENESS_SOURCE_REQUIRED',
      coverage.pointer,
    );
    value = (value as Record<string, unknown>)[key];
  }
  requireCondition(
    equal(value, {
      countryIds: contract.countries.map((c) => c.countryId),
      categoryCount: '21',
      cbRegisterComplete: true,
      valueDate: contract.valueDate,
    }),
    'COMPLETENESS_SOURCE_MISMATCH',
    'completeness',
  );
  const proof: FinancialSupplementAdoption = freeze({
    recordId: reg.recordId,
    receiptSha256: reg.expectedReceiptSha256,
    instructionSha256: reg.expectedInstructionSha256,
    retainedReference: reg.retainedReference,
    parent: input.parent,
    contractFingerprint: input.candidate.contractFingerprint,
    candidateFingerprint: input.candidate.fingerprint,
    assemblyIntentFingerprint: input.assemblyIntentFingerprint,
    worldId: contract.worldId,
    seedId: input.seedId,
    replayBinding: CURRENT_REPLAY_BINDING,
    orchestratorVersion: input.orchestratorVersion,
    record,
    admissionAllowed: false,
  });
  financialAdoptions.add(proof);
  return proof;
}
