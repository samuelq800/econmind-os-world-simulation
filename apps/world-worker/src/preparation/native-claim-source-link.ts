/** Offline association of existing domestic claim mirrors and valuation leaves.
 * No account/claim ID generation, source issuer/admission, authority, ledger,
 * cash conversion, runtime export or actual original-field completion. */
import { Money, canonicalSerialize } from '@econmind/core';
import {
  financialInputSha256,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';
import {
  parseFinancialRegistrySourceJson,
  registryArray,
  registryRow,
  registryString,
  selectFinancialRegistryJsonPointer,
} from './financial-opening-package-registry.js';
import { openingBookMoney } from './opening-economic-decision.js';

export interface NativeClaimLinkDocument {
  readonly documentId: string;
  readonly sourceVersion: string;
  readonly sha256: string;
  readonly bytes: string;
}
export interface NativeClaimLinkInput {
  readonly selection: Readonly<{
    countryId: string;
    holderEntityId: string;
    issuerEntityId: string;
    nativeOwnerLabel: string;
    sourceSharedClaimId: string;
    tool: 'TGA' | 'RESERVE';
  }>;
  readonly documents: Readonly<
    Record<
      'positions' | 'native' | 'fx' | 'joint' | 'crosswalk',
      NativeClaimLinkDocument
    >
  >;
}
type ExactMoney = ReturnType<Money['toCanonicalValue']>;
export interface NativeClaimSourceLink {
  readonly schemaVersion: 'native-claim-source-link-v1';
  readonly classification: 'SOURCE_ASSOCIATION_CONSISTENT_NOT_ADOPTED';
  readonly sourceSharedClaimId: string;
  readonly tool: 'TGA' | 'RESERVE';
  readonly category: string;
  readonly sourceCategories: Readonly<{
    asset: string | null;
    liability: string;
  }>;
  readonly countryId: string;
  readonly holderEntityId: string;
  readonly issuerEntityId: string;
  readonly currencyCandidate: string;
  readonly sourceValueDate: string;
  readonly principal: ExactMoney;
  readonly mirrorCount: 2;
  readonly principalCount: 1;
  readonly nativeOwnerBucket: 'PRESENT_CLAIM_NOT_CASH' | 'ABSENT_NOT_ZERO';
  readonly sourceHoldingIds: Readonly<{ asset: string; liability: string }>;
  readonly valuation: Readonly<{
    gcuAccountingReferenceLexeme: string;
    nominalLocalCurrencyPerGcu: string;
    sourceLocalAmountLexeme: string;
    assetBookAmountLexeme: string;
    liabilityBookAmountLexeme: string;
    exactDerivedLocal: ExactMoney;
    nativeFieldAlreadyLocal: true;
    nativeFieldReconverted: false;
    fundedFx: false;
  }>;
  readonly sourceReferences: readonly Readonly<{
    role: string;
    documentId: string;
    sourceVersion: string;
    sha256: string;
    bytes: string;
    pointer: string;
  }>[];
  readonly linkFingerprint: string;
  readonly actualCashAccountId: null;
  readonly admittedFinancialClaimId: null;
  readonly actualAvailableNativeCash: null;
  readonly actualWorldId: null;
  readonly actualAsOf: null;
  readonly originalFieldStages: Readonly<{
    sourceComplete: false;
    engineeringWired: false;
    validationPassed: false;
    formallyAdopted: false;
  }>;
  readonly blockers: readonly string[];
  readonly sourceAdoption: false;
  readonly signatureVerified: false;
  readonly runtimeConnected: false;
  readonly accountIdsCreated: false;
  readonly originalClosures: 0;
}
export class NativeClaimSourceLinkInvalid extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NativeClaimSourceLinkInvalid';
  }
}
function demand(v: unknown, code: string): asserts v {
  if (!v) throw new NativeClaimSourceLinkInvalid(code);
}
function text(v: unknown, field: string): string {
  const s = registryString(v, field);
  demand(s.length <= 256 && /\S/u.test(s), 'NONEMPTY_LINK_REFERENCE_REQUIRED');
  return s;
}
function rows(v: unknown, field: string) {
  const a = registryArray(v, field);
  demand(a.length <= 2000, 'LINK_ARRAY_BUDGET');
  return a.map((r) => registryRow(r, field));
}
function uniqueCountry(v: unknown, cid: string, field: string) {
  const all = rows(v, field),
    indexes = all.flatMap((r, i) => (r.countryId === cid ? [i] : []));
  demand(indexes.length === 1, 'COUNTRY_SOURCE_MISSING_OR_AMBIGUOUS');
  const index = indexes[0]!;
  return { row: all[index]!, index };
}
function amount(v: unknown, currency: string): Money {
  const m = Money.from(registryString(v, 'amount'), currency);
  demand(!m.amount.isNegative(), 'NEGATIVE_CLAIM_SOURCE_AMOUNT');
  return m;
}

/** Input pins are integrity constraints, NOT a caller-issued trust/admission
 * mechanism. Even a perfectly consistent source returns no actual cash or title.
 * Native LC is compared directly; only explicitly GCU-equivalent book reference
 * is valued through existing openingBookMoney. Mirrors are never summed. */
export function linkNativeClaimSources(
  input: NativeClaimLinkInput,
): NativeClaimSourceLink {
  const s = input.selection;
  demand(['TGA', 'RESERVE'].includes(s.tool), 'UNSUPPORTED_CLAIM_TOOL');
  for (const [key, value] of Object.entries(s)) text(value, key);
  const keys = ['positions', 'native', 'fx', 'joint', 'crosswalk'] as const;
  demand(
    Object.keys(input.documents).length === keys.length,
    'EXACT_LINK_DOCUMENT_SET_REQUIRED',
  );
  const parsed = new Map<string, Record<string, unknown>>();
  let readBytes = 0;
  const documentIds = new Set<string>();
  for (const key of keys) {
    const d = input.documents[key];
    demand(d, 'EXACT_LINK_DOCUMENT_SET_REQUIRED');
    text(d.documentId, 'documentId');
    text(d.sourceVersion, 'sourceVersion');
    demand(!documentIds.has(d.documentId), 'DUPLICATE_LINK_DOCUMENT_ID');
    documentIds.add(d.documentId);
    const bytes = Buffer.byteLength(d.bytes);
    readBytes += bytes;
    demand(
      bytes <= 2 * 1024 * 1024 && readBytes <= 4 * 1024 * 1024,
      'LINK_SOURCE_BYTES_BUDGET',
    );
    demand(
      /^[a-f0-9]{64}$/u.test(d.sha256) &&
        financialInputSha256(d.bytes) === d.sha256,
      'LINK_SOURCE_HASH_MISMATCH',
    );
    const raw = registryRow(JSON.parse(d.bytes), 'document');
    if (key === 'crosswalk')
      demand(
        !Object.hasOwn(raw, 'version') &&
          d.sourceVersion === 'BYTE_PINNED_LEGACY_NO_DECLARED_VERSION' &&
          raw.status === 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
        'REFERENCE_CROSSWALK_REQUIRED',
      );
    else
      demand(
        typeof raw.version === 'string' &&
          /\S/u.test(raw.version) &&
          raw.version === d.sourceVersion,
        'LINK_SOURCE_VERSION_MISMATCH',
      );
    parsed.set(
      key,
      registryRow(parseFinancialRegistrySourceJson(d.bytes), key),
    );
  }
  const positions = parsed.get('positions')!,
    native = parsed.get('native')!,
    fx = parsed.get('fx')!,
    joint = parsed.get('joint')!;
  const mappings = rows(parsed.get('crosswalk')!.rows, 'crosswalk.rows');
  const mapping = (entity: string, role: string) => {
    const indexes = mappings.flatMap((r, i) =>
      r.entityId === entity ? [i] : [],
    );
    demand(
      indexes.length === 1,
      'CLAIM_REFERENCE_MAPPING_MISSING_OR_AMBIGUOUS',
    );
    const index = indexes[0]!,
      row = mappings[index]!;
    demand(
      row.countryId === s.countryId &&
        row.role === role &&
        row.sourceClass ===
          'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY' &&
        row.actualAccount === null &&
        row.actualHolderAdmission === null &&
        row.actualCurrentAuthorization === null,
      'CLAIM_REFERENCE_MAPPING_MISMATCH',
    );
    return { row, index };
  };
  const holderMapping = mapping(
    s.holderEntityId,
    s.tool === 'TGA' ? 'GOV' : 'BANK',
  );
  const issuerMapping = mapping(s.issuerEntityId, 'CENTRAL_BANK');
  demand(
    holderMapping.row.legacyEntityId === s.nativeOwnerLabel,
    'NATIVE_OWNER_LABEL_MISMATCH',
  );
  const n = uniqueCountry(native.countries, s.countryId, 'native.countries');
  const f = uniqueCountry(fx.countries, s.countryId, 'fx.countries');
  const j = uniqueCountry(
    joint.countryFinance,
    s.countryId,
    'joint.countryFinance',
  );
  const currency = text(f.row.currencyCode, 'currencyCode');
  demand(
    n.row.currencyCode === currency &&
      j.row.currencyCode === currency &&
      currency !== 'GCU',
    'NATIVE_CURRENCY_SOURCE_MISMATCH',
  );
  const date = text(f.row.valueDate, 'valueDate');
  demand(
    /^\d{4}-\d{2}-\d{2}$/u.test(date) &&
      Number.isFinite(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date,
    'SOURCE_VALUE_DATE_REQUIRED',
  );
  demand(
    fx.valueDate === date &&
      positions.valueDate === date &&
      joint.valueDate === date &&
      positions.version === fx.version &&
      joint.version === fx.version,
    'VALUATION_VERSION_DATE_MISMATCH',
  );
  const lineage = registryRow(n.row.originalGcuLineage, 'originalGcuLineage');
  const parent = registryRow(lineage.source, 'lineage.source');
  const jointPointer = text(lineage.pointer, 'lineage.pointer');
  demand(
    parent.sha256 === input.documents.joint.sha256 &&
      parent.bytes === String(Buffer.byteLength(input.documents.joint.bytes)) &&
      selectFinancialRegistryJsonPointer(joint, jointPointer) === j.row,
    'NATIVE_JOINT_LINEAGE_MISMATCH',
  );
  const allPositions = rows(positions.positions, 'positions');
  const matches = allPositions.flatMap((p, index) =>
    p.sharedClaimId === s.sourceSharedClaimId ? [{ p, index }] : [],
  );
  demand(matches.length === 2, 'CLAIM_PAIR_MISSING_OR_DUPLICATED');
  const asset = matches.filter((x) => x.p.role === 'ASSET'),
    liability = matches.filter((x) => x.p.role === 'LIABILITY');
  demand(
    asset.length === 1 && liability.length === 1,
    'CLAIM_PAIR_ROLE_MISMATCH',
  );
  const a = asset[0]!,
    l = liability[0]!;
  const category =
    s.tool === 'TGA'
      ? 'TREASURY_GOVERNMENT_DEPOSIT'
      : 'COMMERCIAL_BANK_RESERVE_ACCOUNTS';
  // The source classifies the issuer's liability; the mirror asset may
  // explicitly carry null. Preserve that absence, rather than inventing a tag.
  demand(l.p.category === category, 'CLAIM_TOOL_CATEGORY_MISMATCH');
  demand(
    a.p.category === null || a.p.category === category,
    'CLAIM_TOOL_CATEGORY_MISMATCH',
  );
  for (const { p } of matches) {
    demand(
      p.countryId === s.countryId &&
        p.tool === s.tool &&
        p.nativeCurrency === currency &&
        p.valueDate === date &&
        p.version === positions.version,
      'CLAIM_PAIR_SCOPE_MISMATCH',
    );
    demand(
      p.assetHolderId === s.holderEntityId && p.issuerId === s.issuerEntityId,
      'CLAIM_HOLDER_ISSUER_MISMATCH',
    );
  }
  demand(
    a.p.holderId === s.holderEntityId &&
      a.p.counterpartyId === s.issuerEntityId &&
      l.p.holderId === s.issuerEntityId &&
      l.p.counterpartyId === s.holderEntityId,
    'CLAIM_PAIR_DIRECTION_MISMATCH',
  );
  const assetHolding = text(a.p.holdingId, 'asset.holdingId'),
    liabilityHolding = text(l.p.holdingId, 'liability.holdingId');
  demand(
    assetHolding !== liabilityHolding &&
      allPositions.filter((p) => p.holdingId === assetHolding).length === 1 &&
      allPositions.filter((p) => p.holdingId === liabilityHolding).length === 1,
    'CLAIM_HOLDING_ID_DUPLICATED',
  );
  const principal = amount(a.p.nativeAmount, currency);
  demand(
    principal.amount.equals(amount(l.p.nativeAmount, currency).amount),
    'CLAIM_MIRROR_AMOUNT_MISMATCH',
  );
  for (const { p } of matches)
    demand(
      p.bookLocalCurrency === currency &&
        p.bookLcPerNativeUnit === '1' &&
        principal.amount.equals(amount(p.bookLC, currency).amount),
      'NATIVE_BOOK_VALUE_MISMATCH',
    );
  const field =
    s.tool === 'TGA' ? 'treasuryCentralBankBalance' : 'bankReserveAssets';
  const local = registryRow(
    registryRow(n.row.valuesNative, 'valuesNative')[field],
    field,
  );
  demand(
    local.currency === currency && local.unit === 'LC',
    'NATIVE_VALUE_UNIT_MISMATCH',
  );
  demand(
    principal.amount.equals(amount(local.amount, currency).amount) &&
      principal.amount.equals(
        amount(
          registryRow(j.row.valuesLocalCurrency, 'valuesLocalCurrency')[field],
          currency,
        ).amount,
      ),
    'NATIVE_VALUE_AMOUNT_MISMATCH',
  );
  const rate = text(f.row.LCperGCU, 'LCperGCU');
  demand(
    n.row.LCperGCU === rate && j.row.LCperGCU === rate,
    'NOMINAL_QUOTE_SOURCE_MISMATCH',
  );
  const gcu = text(
    registryRow(j.row.valuesGcuReference, 'valuesGcuReference')[field],
    'gcuReference',
  );
  const derived = openingBookMoney({
    rawAmount: gcu,
    denomination: 'GCU_EQUIVALENT',
    localCurrency: currency,
    localCurrencyPerGcu: rate,
  });
  demand(principal.amount.equals(derived.amount), 'CLAIM_VALUATION_MISMATCH');
  const ownerBuckets = registryRow(
    n.row.ownerBucketsNative,
    'ownerBucketsNative',
  );
  const ownerPresent = Object.hasOwn(ownerBuckets, s.nativeOwnerLabel);
  const reference = (
    role: string,
    key: (typeof keys)[number],
    pointer: string,
  ) => {
    const d = input.documents[key];
    selectFinancialRegistryJsonPointer(parsed.get(key), pointer);
    return {
      role,
      documentId: d.documentId,
      sourceVersion: d.sourceVersion,
      sha256: d.sha256,
      bytes: String(Buffer.byteLength(d.bytes)),
      pointer,
    };
  };
  const references = [
    reference(
      'HOLDER_REFERENCE_ONLY',
      'crosswalk',
      '/rows/' + holderMapping.index,
    ),
    reference(
      'ISSUER_REFERENCE_ONLY',
      'crosswalk',
      '/rows/' + issuerMapping.index,
    ),
    reference('ASSET_MIRROR', 'positions', '/positions/' + a.index),
    reference('LIABILITY_MIRROR', 'positions', '/positions/' + l.index),
    reference(
      'ALREADY_NATIVE_VALUE',
      'native',
      `/countries/${n.index}/valuesNative/${field}`,
    ),
    reference(
      'OWNER_BUCKET_EXISTENCE_NOT_CASH',
      'native',
      `/countries/${n.index}/ownerBucketsNative`,
    ),
    reference('GCU_REFERENCE_AND_LOCAL_VALUE', 'joint', jointPointer),
    reference('NOMINAL_DENOMINATION_CANDIDATE', 'fx', '/countries/' + f.index),
  ];
  const facts = {
    sourceSharedClaimId: s.sourceSharedClaimId,
    tool: s.tool,
    category,
    sourceCategories: {
      asset: a.p.category as string | null,
      liability: category,
    },
    countryId: s.countryId,
    holderEntityId: s.holderEntityId,
    issuerEntityId: s.issuerEntityId,
    currencyCandidate: currency,
    sourceValueDate: date,
    principal: principal.toCanonicalValue(),
    sourceHoldingIds: { asset: assetHolding, liability: liabilityHolding },
    valuation: {
      gcuAccountingReferenceLexeme: gcu,
      nominalLocalCurrencyPerGcu: rate,
      sourceLocalAmountLexeme: text(local.amount, 'native.amount'),
      assetBookAmountLexeme: text(a.p.bookLC, 'asset.bookLC'),
      liabilityBookAmountLexeme: text(l.p.bookLC, 'liability.bookLC'),
      exactDerivedLocal: derived.toCanonicalValue(),
      nativeFieldAlreadyLocal: true as const,
      nativeFieldReconverted: false as const,
      fundedFx: false as const,
    },
    sourceReferences: references,
  };
  return freezeFinancialInput({
    schemaVersion: 'native-claim-source-link-v1',
    classification: 'SOURCE_ASSOCIATION_CONSISTENT_NOT_ADOPTED',
    ...facts,
    mirrorCount: 2,
    principalCount: 1,
    nativeOwnerBucket: ownerPresent
      ? 'PRESENT_CLAIM_NOT_CASH'
      : 'ABSENT_NOT_ZERO',
    linkFingerprint: financialInputSha256(canonicalSerialize(facts)),
    actualCashAccountId: null,
    admittedFinancialClaimId: null,
    actualAvailableNativeCash: null,
    actualWorldId: null,
    actualAsOf: null,
    originalFieldStages: {
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
    },
    blockers: [
      'CLAIM_NOT_CASH',
      'SOURCE_HOLDING_ID_NOT_IMMUTABLE_CASH_ACCOUNT_ID',
      'ACTUAL_OPENING_TITLE_CURRENCY_AND_SOURCE_ADMISSION_UNBOUND',
      'CASH_JOURNAL_AND_RESTRICTION_COMPLETENESS_UNPROVEN',
    ],
    sourceAdoption: false,
    signatureVerified: false,
    runtimeConnected: false,
    accountIdsCreated: false,
    originalClosures: 0,
  });
}
