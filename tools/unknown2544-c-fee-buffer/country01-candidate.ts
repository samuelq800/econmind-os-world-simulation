/** Offline DRAFT projection only. No adoption/permission/source issuer, ledger
 * writer, account constructor, command route, payment, World or Clock exists.
 */
import { createHash } from 'node:crypto';
import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
} from 'node:fs';
import {
  Money,
  parseWorldDecimal,
  canonicalDecimal,
  assertWorldDecimalResult,
  calculateAvailableFiscalCapacity,
} from '../../packages/core/src/index.js';
import { diagnoseFinancialPackageGross } from '../../apps/world-worker/src/preparation/financial-opening-package-preflight.js';
import { readNativeCashSourceCandidate } from '../../apps/world-worker/src/preparation/native-cash-source-candidate.js';
import { parseFinancialRegistrySourceJson } from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import pins from './source-pins.json' with { type: 'json' };

type Row = Record<string, unknown>;
export interface DraftDocument {
  documentId: string;
  documentVersion: string;
  sourceClass:
    'ORIGINAL_RETAINED_NOT_ADMITTED' | 'CONSTRUCTED_DRAFT' | 'TEST_ONLY';
  bytes: string;
  byteLength: number;
  sha256: string;
}
export interface DocumentPointer {
  documentId: string;
  documentVersion: string;
  sha256: string;
  pointer: string;
}
export type DraftSlot =
  | { tag: 'MISSING'; reason: string }
  | {
      tag: 'PRESENT_DRAFT' | 'TEST_ONLY';
      sourceLeaf: DocumentPointer;
      payload: unknown;
      adoptionLocator?: unknown;
    };
export type NativeReaderInput = Parameters<
  typeof readNativeCashSourceCandidate
>[0];
export type CashSlot = DraftSlot & { existingFReaderInput?: NativeReaderInput };
export interface FeeBufferDraftInput {
  schema: 'c-country01-fee-buffer-draft-input-v1';
  mode: 'DRAFT_ONLY' | 'TEST_ONLY';
  countryId: string;
  documents: DraftDocument[];
  feePolicy: DraftSlot;
  feeEvents: DraftSlot;
  bufferRule: DraftSlot;
  cashOverlap: CashSlot;
}
interface Trace {
  documentId: string;
  documentVersion: string;
  sha256: string;
  byteLength: number;
  sourceClass: DraftDocument['sourceClass'];
  sourceCustody: 'NOT_VERIFIED';
  pointer: string;
  rawLeaf: unknown;
}
interface Context {
  leaf: Row;
  document: DraftDocument;
  trace: Trace[];
  root: unknown;
  adoptionLocator: Row | null;
}
interface Scope {
  countryId: string;
  liableEntityId: string;
  nativeCurrency: string;
  period: Row;
}
interface Policy {
  context: Context;
  scope: Scope;
  body: Row;
  basis: Row;
  precision: number;
}
interface Charge {
  key: string;
  amount: string;
  incremental: string;
  grossRef: string;
  grossAmount: string;
}
interface Fees {
  context: Context;
  scope: Scope;
  total: string;
  incremental: string;
  charges: Charge[];
  gross: ReturnType<typeof diagnoseFinancialPackageGross>;
}
interface BufferRequirement {
  context: Context;
  scope: Scope;
  amount: string;
}
interface Result<T> {
  value: T | null;
  blockers: string[];
}
function need(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
function row(v: unknown, code = 'OBJECT_REQUIRED'): Row {
  need(v !== null && typeof v === 'object' && !Array.isArray(v), code);
  return v as Row;
}
function text(v: unknown, code = 'SOURCE_STRING_REQUIRED'): string {
  need(typeof v === 'string' && v.length > 0 && v.length <= 512, code);
  return v;
}
function array(v: unknown, limit = 64): unknown[] {
  need(Array.isArray(v) && v.length <= limit, 'BOUNDED_ARRAY_REQUIRED');
  return v;
}
function exactKeys(v: Row, allowed: string[]) {
  need(
    Object.keys(v).every((k) => allowed.includes(k)),
    'UNSUPPORTED_AUTHORITY_OR_INPUT_OPTION',
  );
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export const SOURCE_PINS = freeze(pins);
export const digest = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object')
    return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const r = row(v);
  return `{${Object.keys(r)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + canonical(r[k]))
    .join(',')}}`;
}
function pointer(v: unknown, p: string): unknown {
  need(p.startsWith('/') && p.length <= 512, 'EXACT_POINTER_REQUIRED');
  return p
    .slice(1)
    .split('/')
    .reduce((value, token) => {
      need(!/~(?![01])/u.test(token), 'BAD_POINTER_ESCAPE');
      const k = token.replace(/~1/gu, '/').replace(/~0/gu, '~');
      const r = rowOrArray(value);
      need(Object.hasOwn(r, k), 'SOURCE_POINTER_MISSING');
      return r[k];
    }, v);
}
function rowOrArray(v: unknown): Row {
  need(v !== null && typeof v === 'object', 'POINTER_OBJECT_REQUIRED');
  return v as Row;
}
function decimal(v: unknown): string {
  const s = text(v, 'EXACT_DECIMAL_STRING_REQUIRED');
  const n = parseWorldDecimal(s);
  need(!n.isNegative(), 'NONNEGATIVE_SOURCE_AMOUNT_REQUIRED');
  return canonicalDecimal(n);
}
function money(v: unknown, currency: string): Money {
  return Money.from(decimal(v), currency);
}
function sum(values: string[], currency: string): string {
  // An additive identity is used only for an explicitly validated finite set.
  return values
    .reduce((a, b) => a.add(money(b, currency)), Money.from('0', currency))
    .toCanonicalValue().amount;
}
function minus(a: string, b: string, currency: string): string {
  const n = money(a, currency).subtract(money(b, currency));
  need(!n.amount.isNegative(), 'COVERAGE_EXCEEDS_REQUIREMENT');
  return n.toCanonicalValue().amount;
}
function product(a: unknown, b: unknown, currency: string): string {
  const value = assertWorldDecimalResult(
    parseWorldDecimal(decimal(a)).times(parseWorldDecimal(decimal(b))),
  );
  return Money.from(canonicalDecimal(value), currency).toCanonicalValue()
    .amount;
}
function precision(c: Context, v: unknown): number {
  const r = row(v);
  exactKeys(r, ['kind', 'sourceRef', 'maxFractionDigits']);
  need(r.kind === 'EXACT_NO_ROUNDING', 'UNSUPPORTED_PRECISION');
  witness(c, r.sourceRef);
  const s = text(r.maxFractionDigits);
  need(
    /^(0|[1-9]\d*)$/u.test(s) && BigInt(s) <= 120n,
    'PRECISION_SOURCE_REQUIRED',
  );
  return Number(s);
}
function fit(amount: string, scale: number) {
  need(
    (amount.split('.')[1]?.length ?? 0) <= scale,
    'EXACT_RESULT_NOT_REPRESENTABLE_AT_SOURCE_PRECISION',
  );
  return amount;
}
function witness(c: Context, v: unknown, expected?: unknown): unknown {
  const p = text(row(v, 'SOURCE_LOCATOR_REQUIRED').pointer);
  const found = pointer(c.root, p);
  if (expected !== undefined) {
    const numeric =
      typeof found === 'string' &&
      typeof expected === 'string' &&
      /^(0|[1-9]\d*)(\.\d+)?$/u.test(found) &&
      /^(0|[1-9]\d*)(\.\d+)?$/u.test(expected);
    need(
      numeric
        ? decimal(found) === decimal(expected)
        : canonical(found) === canonical(expected),
      'SOURCE_OPERAND_MISMATCH',
    );
  }
  c.trace.push({
    documentId: c.document.documentId,
    documentVersion: c.document.documentVersion,
    sha256: c.document.sha256,
    byteLength: c.document.byteLength,
    sourceClass: c.document.sourceClass,
    sourceCustody: 'NOT_VERIFIED',
    pointer: p,
    rawLeaf: structuredClone(found),
  });
  return found;
}
function scope(c: Context, v: unknown, input: FeeBufferDraftInput): Scope {
  const s = row(v);
  exactKeys(s, [
    'countryId',
    'liableEntityId',
    'nativeCurrency',
    'currencySource',
    'period',
  ]);
  const cid = text(s.countryId);
  need(cid === input.countryId, 'COUNTRY_SCOPE_MISMATCH');
  const currency = text(s.nativeCurrency);
  Money.from('0', currency);
  const binding = row(witness(c, s.currencySource));
  need(
    binding.countryId === cid && binding.currency === currency,
    'NATIVE_CURRENCY_SOURCE_MISMATCH',
  );
  const p = row(s.period);
  exactKeys(p, ['periodRef', 'calendarRef', 'fromSimTicks', 'untilSimTicks']);
  for (const k of ['periodRef', 'calendarRef']) text(p[k]);
  const from = text(p.fromSimTicks),
    until = text(p.untilSimTicks);
  need(
    /^(0|[1-9]\d*)$/u.test(from) &&
      /^(0|[1-9]\d*)$/u.test(until) &&
      BigInt(until) > BigInt(from),
    'POSITIVE_SOURCE_PERIOD_REQUIRED',
  );
  return {
    countryId: cid,
    liableEntityId: text(s.liableEntityId),
    nativeCurrency: currency,
    period: structuredClone(p),
  };
}
function sameScope(a: Scope, b: Scope) {
  need(canonical(a) === canonical(b), 'CURRENCY_PAYER_OR_PERIOD_MISMATCH');
}
function capture<T>(fn: () => T): Result<T> {
  try {
    return { value: fn(), blockers: [] };
  } catch (e) {
    return {
      value: null,
      blockers: [e instanceof Error ? e.message : 'INVALID_DRAFT'],
    };
  }
}
function sourceContexts(input: FeeBufferDraftInput) {
  need(Array.isArray(input.documents), 'DOCUMENT_ARRAY_REQUIRED');
  need(input.documents.length <= 8, 'DOCUMENT_COUNT_BUDGET');
  let total = 0;
  const found = new Map<
    string,
    { document: DraftDocument; root: unknown } | string
  >();
  for (const d of input.documents) {
    // Malformed source nodes are unresolved only for their dependents. Global
    // document count/byte limits remain envelope safety constraints.
    if (d === null || typeof d !== 'object') continue;
    const id = typeof d.documentId === 'string' ? d.documentId : 'INVALID';
    if (found.has(id)) {
      found.set(id, 'DUPLICATE_DOCUMENT_ID');
      continue;
    }
    if (typeof d.bytes !== 'string') {
      found.set(id, 'DOCUMENT_BYTES_REQUIRED');
      continue;
    }
    total += Buffer.byteLength(d.bytes);
    need(
      total <= 4194304 && Buffer.byteLength(d.bytes) <= 1048576,
      'DOCUMENT_BYTE_BUDGET',
    );
    const parsed = capture(() => {
      exactKeys(d as unknown as Row, [
        'documentId',
        'documentVersion',
        'sourceClass',
        'bytes',
        'byteLength',
        'sha256',
      ]);
      text(d.documentId);
      text(d.documentVersion);
      need(
        [
          'ORIGINAL_RETAINED_NOT_ADMITTED',
          'CONSTRUCTED_DRAFT',
          'TEST_ONLY',
        ].includes(d.sourceClass),
        'DOCUMENT_CLASS_REQUIRED',
      );
      need(
        d.byteLength === Buffer.byteLength(d.bytes) &&
          digest(d.bytes) === d.sha256,
        'SOURCE_HASH_OR_LENGTH_MISMATCH',
      );
      need(
        input.mode === 'TEST_ONLY'
          ? d.sourceClass === 'TEST_ONLY'
          : d.sourceClass !== 'TEST_ONLY',
        'TEST_SOURCE_ON_REAL_BINDING',
      );
      return {
        document: structuredClone(d),
        root: parseFinancialRegistrySourceJson(d.bytes),
      };
    });
    found.set(id, parsed.value ?? parsed.blockers[0]!);
  }
  return (slot: DraftSlot, allowCash = false): Context => {
    const r = row(slot);
    exactKeys(r, [
      'tag',
      'reason',
      'sourceLeaf',
      'payload',
      'adoptionLocator',
      ...(allowCash ? ['existingFReaderInput'] : []),
    ]);
    need(slot.tag !== 'MISSING', 'SOURCE_SLOT_MISSING');
    need(
      input.mode === 'TEST_ONLY'
        ? slot.tag === 'TEST_ONLY'
        : slot.tag === 'PRESENT_DRAFT',
      'SLOT_CLASS_MISMATCH',
    );
    const p = row(r.sourceLeaf),
      entry = found.get(text(p.documentId));
    need(
      entry && typeof entry !== 'string',
      typeof entry === 'string' ? entry : 'DOCUMENT_NOT_SUPPLIED',
    );
    need(
      p.documentVersion === entry.document.documentVersion &&
        p.sha256 === entry.document.sha256,
      'SOURCE_VERSION_OR_HASH_BINDING_MISMATCH',
    );
    const path = text(p.pointer),
      leaf = pointer(entry.root, path);
    need(
      canonical(leaf) === canonical(slot.payload),
      'SOURCE_PAYLOAD_MISMATCH',
    );
    let adoptionLocator: Row | null = null;
    if (slot.adoptionLocator !== undefined && slot.adoptionLocator !== null) {
      const locator = row(
        slot.adoptionLocator,
        'ADOPTION_LOCATOR_OBJECT_REQUIRED',
      );
      const keys = [
        'receiptDocumentId',
        'receiptVersion',
        'receiptSha256',
        'receiptPointer',
        'claimedTargetDocumentSha256',
        'claimedTargetPointer',
      ];
      exactKeys(locator, keys);
      for (const key of keys)
        text(locator[key], 'ADOPTION_LOCATOR_FIELD_REQUIRED');
      need(
        /^[a-f0-9]{64}$/u.test(String(locator.receiptSha256)) &&
          /^[a-f0-9]{64}$/u.test(String(locator.claimedTargetDocumentSha256)),
        'ADOPTION_LOCATOR_HASH_FORMAT',
      );
      need(
        String(locator.receiptPointer).startsWith('/') &&
          String(locator.claimedTargetPointer).startsWith('/'),
        'ADOPTION_LOCATOR_POINTER_FORMAT',
      );
      adoptionLocator = structuredClone(locator);
    }
    return {
      leaf: row(leaf),
      root: entry.root,
      adoptionLocator,
      document: entry.document,
      trace: [
        {
          documentId: entry.document.documentId,
          documentVersion: entry.document.documentVersion,
          sha256: entry.document.sha256,
          byteLength: entry.document.byteLength,
          sourceClass: entry.document.sourceClass,
          sourceCustody: 'NOT_VERIFIED',
          pointer: path,
          rawLeaf: structuredClone(leaf),
        },
      ],
    };
  };
}
function policy(c: Context, input: FeeBufferDraftInput): Policy {
  const b = c.leaf;
  exactKeys(b, [
    'tag',
    'policyId',
    'policyVersion',
    'scope',
    'payerEntityId',
    'beneficiaryEntityId',
    'operationKind',
    'trigger',
    'chargeBasis',
    'precision',
    'inclusionRule',
    'validityAndExemptions',
  ]);
  need(b.tag === 'FEE_POLICY_DRAFT_V1', 'FEE_POLICY_TAG_REQUIRED');
  const s = scope(c, b.scope, input);
  need(text(b.payerEntityId) === s.liableEntityId, 'PAYER_SCOPE_MISMATCH');
  text(b.beneficiaryEntityId);
  text(b.policyId);
  text(b.policyVersion);
  text(b.operationKind);
  const trigger = row(b.trigger);
  need(trigger.kind === 'ELIGIBLE_EVENT', 'UNSUPPORTED_TRIGGER');
  witness(c, trigger.source);
  const basis = row(b.chargeBasis),
    kind = text(basis.kind);
  text(basis.baseDefinition);
  need(
    [
      'FREE_EXPLICIT',
      'FIXED_NATIVE',
      'FRACTIONAL_NATIVE',
      'COMBINED_EXPLICIT',
    ].includes(kind),
    'UNSUPPORTED_FEE_BASIS',
  );
  if (kind === 'FREE_EXPLICIT') {
    witness(c, basis.explicitFreeScopeSource);
    need(
      basis.fixedNative === null && basis.rateFraction === null,
      'FREE_TERMS_NOT_EXPLICIT',
    );
  }
  if (kind === 'FIXED_NATIVE' || kind === 'COMBINED_EXPLICIT') {
    decimal(basis.fixedNative);
    witness(c, basis.fixedQuoteSource, basis.fixedNative);
  } else need(basis.fixedNative === null, 'INACTIVE_FIXED_TERM_MUST_BE_NULL');
  if (kind === 'FRACTIONAL_NATIVE' || kind === 'COMBINED_EXPLICIT') {
    decimal(basis.rateFraction);
    need(
      basis.rateUnit === 'FRACTION_NOT_PERCENT',
      'UNSUPPORTED_RATE_REPRESENTATION',
    );
    witness(c, basis.rateSource, basis.rateFraction);
  } else need(basis.rateFraction === null, 'INACTIVE_RATE_TERM_MUST_BE_NULL');
  if (kind === 'COMBINED_EXPLICIT')
    witness(c, basis.bothComponentsSelectedSource);
  const inclusion = row(b.inclusionRule);
  for (const k of [
    'feeComponentRefRule',
    'includedInGrossSource',
    'crossChargeDedupRule',
  ])
    witness(c, inclusion[k]);
  const validity = row(b.validityAndExemptions);
  need(
    canonical(validity.effectivePeriod) === canonical(s.period),
    'POLICY_VALIDITY_PERIOD_MISMATCH',
  );
  witness(c, validity.expiryOrExplicitNoExpirySource);
  witness(c, validity.exemptionInventoryOrExplicitNoneSource);
  return {
    context: c,
    scope: s,
    body: b,
    basis,
    precision: precision(c, b.precision),
  };
}
function eventFees(c: Context, p: Policy, input: FeeBufferDraftInput): Fees {
  const b = c.leaf;
  need(b.tag === 'FEE_EVENT_INVENTORY_DRAFT_V1', 'FEE_EVENT_TAG_REQUIRED');
  text(b.inventoryId);
  text(b.inventoryVersion);
  const s = scope(c, b.scope, input);
  sameScope(s, p.scope);
  const coverage = row(b.coverage);
  need(
    coverage.declaredComplete === true,
    'EVENT_INVENTORY_NOT_DECLARED_COMPLETE',
  );
  for (const k of [
    'eventPredicateRef',
    'eligibleUniverseRef',
    'fromFrontier',
    'throughFrontier',
    'completenessSource',
  ])
    witness(c, coverage[k]);
  const events = array(b.events),
    seen = new Set<string>(),
    charges: Charge[] = [],
    grossMap = new Map<
      string,
      { gross: string; fees: string[]; included: string[] }
    >();
  for (const item of events) {
    const e = row(item);
    text(e.sourceEventRef);
    const key = text(e.canonicalChargeRef),
      component = text(e.feeComponentRef);
    need(
      !seen.has(key) && !seen.has('component:' + component),
      'DUPLICATE_ECONOMIC_FEE_COMPONENT',
    );
    seen.add(key);
    seen.add('component:' + component);
    for (const k of [
      'policyId',
      'policyVersion',
      'payerEntityId',
      'beneficiaryEntityId',
      'operationKind',
    ])
      need(e[k] === p.body[k], 'EVENT_POLICY_PARTY_OR_OPERATION_MISMATCH');
    need(
      e.nativeCurrency === s.nativeCurrency &&
        canonical(e.period) === canonical(s.period),
      'EVENT_CURRENCY_OR_PERIOD_MISMATCH',
    );
    witness(c, e.triggerEvidence);
    let amount: string;
    const kind = p.basis.kind;
    if (kind === 'FREE_EXPLICIT') {
      need(
        e.nativeBaseOrExplicitNotApplicable === 'NOT_APPLICABLE_FREE',
        'FREE_BASE_NOT_EXPLICIT',
      );
      witness(c, e.baseSource);
      amount = '0';
    } else if (kind === 'FIXED_NATIVE') {
      need(
        e.nativeBaseOrExplicitNotApplicable === 'NOT_APPLICABLE_FIXED',
        'FIXED_BASE_NOT_EXPLICIT',
      );
      witness(c, e.baseSource);
      amount = decimal(p.basis.fixedNative);
    } else {
      const base = decimal(e.nativeBaseOrExplicitNotApplicable);
      witness(c, e.baseSource, e.nativeBaseOrExplicitNotApplicable);
      amount = product(base, p.basis.rateFraction, s.nativeCurrency);
      if (kind === 'COMBINED_EXPLICIT')
        amount = money(amount, s.nativeCurrency)
          .add(money(p.basis.fixedNative, s.nativeCurrency))
          .toCanonicalValue().amount;
    }
    amount = fit(amount, p.precision);
    const g = row(e.grossCoverage),
      ref = text(g.grossComponentRef),
      gross = decimal(witness(c, g.grossAmountSource));
    need(
      ['EXCLUSIVE', 'ALREADY_INCLUDED', 'EXEMPT_EXPLICIT'].includes(
        String(g.feeInclusion),
      ),
      'FEE_INCLUSION_UNKNOWN',
    );
    witness(c, g.feeComponentAmountSourceOrRuleBinding, amount);
    if (g.feeInclusion === 'EXEMPT_EXPLICIT') {
      witness(c, g.exemptionSource);
      need(amount === '0', 'EXEMPT_COMPONENT_NOT_ZERO');
    }
    const incremental = g.feeInclusion === 'EXCLUSIVE' ? amount : '0';
    if (g.feeInclusion === 'ALREADY_INCLUDED')
      need(
        !money(gross, s.nativeCurrency).amount.lessThan(amount),
        'INCLUDED_FEE_EXCEEDS_GROSS',
      );
    const prior = grossMap.get(ref);
    need(!prior || prior.gross === gross, 'CONFLICTING_GROSS_COMPONENT');
    const included = g.feeInclusion === 'ALREADY_INCLUDED' ? amount : '0';
    if (prior) {
      prior.fees.push(incremental);
      prior.included.push(included);
    } else
      grossMap.set(ref, { gross, fees: [incremental], included: [included] });
    charges.push({
      key,
      amount,
      incremental,
      grossRef: ref,
      grossAmount: gross,
    });
  }
  for (const g of grossMap.values())
    need(
      !money(
        sum(g.included, s.nativeCurrency),
        s.nativeCurrency,
      ).amount.greaterThan(money(g.gross, s.nativeCurrency).amount),
      'INCLUDED_COMPONENTS_EXCEED_GROSS',
    );
  const gross = diagnoseFinancialPackageGross({
    cash: null,
    obligations: [...grossMap].map(([ref, g]) => ({
      flowId: ref,
      ownerId: text(p.body.payerEntityId),
      accountId: 'DRAFT_ROUTE_NOT_ISSUED',
      currency: s.nativeCurrency,
      dueBucket: text(s.period.periodRef),
      amount: g.gross,
      fee: sum(g.fees, s.nativeCurrency),
    })),
  });
  return {
    context: c,
    scope: s,
    total: fit(
      sum(
        charges.map((x) => x.amount),
        s.nativeCurrency,
      ),
      p.precision,
    ),
    incremental: sum(
      charges.map((x) => x.incremental),
      s.nativeCurrency,
    ),
    charges,
    gross,
  };
}
function buffer(c: Context, input: FeeBufferDraftInput): BufferRequirement {
  const b = c.leaf;
  need(b.tag === 'BUFFER_RULE_DRAFT_V1', 'BUFFER_TAG_REQUIRED');
  text(b.ruleId);
  text(b.ruleVersion);
  const s = scope(c, b.scope, input);
  for (const k of [
    'legalBasisSource',
    'shortfallPrioritySource',
    'overlapConventionSource',
  ])
    witness(c, b[k]);
  const m = row(b.method);
  let amount: string;
  if (m.kind === 'SOURCE_FIXED_NATIVE_REQUIREMENT') {
    amount = decimal(m.nativeRequirement);
    witness(c, m.amountSource, m.nativeRequirement);
  } else {
    need(
      m.kind === 'SOURCE_SIM_DAYS_TIMES_NATIVE_DAILY_BASE',
      'UNSUPPORTED_BUFFER_METHOD',
    );
    need(
      m.daysUnit === 'SIM_DAY' && m.baseUnit === 'NATIVE_MONEY_PER_SIM_DAY',
      'BUFFER_BASE_UNIT_MISMATCH',
    );
    witness(c, m.daysSource, m.simDays);
    witness(c, m.baseSource, m.dailyBase);
    witness(c, m.baseCoverage);
    amount = product(m.simDays, m.dailyBase, s.nativeCurrency);
  }
  if (b.optionalLegalMinimum !== undefined && b.optionalLegalMinimum !== null) {
    const min = row(b.optionalLegalMinimum);
    need(
      min.nativeCurrency === s.nativeCurrency &&
        canonical(min.period) === canonical(s.period),
      'DECLARED_MINIMUM_SCOPE_INCOMPLETE_OR_CONFLICTING',
    );
    const floor = decimal(min.amount);
    witness(c, min.source, min.amount);
    need(
      !money(amount, s.nativeCurrency).amount.lessThan(floor),
      'REQUIREMENT_BELOW_DECLARED_LEGAL_MINIMUM',
    );
  }
  return {
    context: c,
    scope: s,
    amount: fit(amount, precision(c, b.precision)),
  };
}

function capacity(
  c: Context,
  input: FeeBufferDraftInput,
  fees: Fees | null,
  b: BufferRequirement | null,
) {
  need(c.leaf.tag === 'CASH_OVERLAP_DRAFT_V1', 'CASH_OVERLAP_TAG_REQUIRED');
  need(b, 'BUFFER_REQUIREMENT_UNAVAILABLE');
  const s = scope(c, c.leaf.cashScope, input);
  sameScope(s, b.scope);
  const fInput = input.cashOverlap.existingFReaderInput;
  need(fInput, 'EXISTING_F_READER_INPUT_REQUIRED');
  const binding = row(c.leaf.cashSnapshotBinding);
  need(
    fInput.document &&
      binding.documentSha256 === fInput.document.sha256 &&
      binding.sourceVersion === fInput.expected.sourceVersion &&
      binding.worldId === fInput.expected.worldId &&
      binding.worldVersion === fInput.expected.worldVersion &&
      binding.asOf === fInput.expected.asOf &&
      binding.periodRef === s.period.periodRef,
    'CASH_SNAPSHOT_PERIOD_BINDING_MISMATCH',
  );
  if (input.mode !== 'TEST_ONLY')
    need(
      fInput.document?.classification !== 'SYNTHETIC_CANDIDATE',
      'TEST_CASH_ON_REAL_BINDING',
    );
  const f = readNativeCashSourceCandidate(fInput);
  const selected = f.rows.find((x) => x.entityId === s.liableEntityId);
  need(
    selected?.candidateAvailable &&
      selected.candidateRestricted &&
      selected.candidateAccount,
    'CASH_SOURCE_OR_RESTRICTION_COVERAGE_UNAVAILABLE',
  );
  need(
    selected.nativeCurrencyCandidate === s.nativeCurrency,
    'CASH_CURRENCY_MISMATCH',
  );
  const doc = row(parseFinancialRegistrySourceJson(fInput.document!.bytes));
  const atoms = new Map(
    array(doc.encumbranceAtoms, 2000).map((x) => {
      const a = row(x);
      return [text(a.atomId), a] as const;
    }),
  );
  const restrictedIds = new Set(
    array(doc.restrictions, 2000).flatMap((x) => {
      const r = row(x);
      return r.accountId === selected.candidateAccount.accountId
        ? array(r.atomIds, 2000).map((x) => text(x))
        : [];
    }),
  );
  const portions = new Map<string, { atomId: string; amount: string }>(),
    atomUsage = new Map<string, string[]>();
  for (const item of array(c.leaf.sourceCoveragePortions)) {
    const q = row(item),
      id = text(q.portionId),
      atomId = text(q.atomId),
      a = atoms.get(atomId);
    need(!portions.has(id), 'DUPLICATE_COVERAGE_PORTION');
    need(
      a &&
        restrictedIds.has(atomId) &&
        a.accountId === selected.candidateAccount.accountId &&
        a.currency === s.nativeCurrency,
      'COVERAGE_ATOM_SCOPE_MISMATCH',
    );
    need(
      q.nativeCurrency === s.nativeCurrency &&
        canonical(q.period) === canonical(s.period),
      'COVERAGE_SCOPE_MISMATCH',
    );
    witness(c, q.source, q.amount);
    const amount = decimal(q.amount);
    portions.set(id, { atomId, amount });
    atomUsage.set(atomId, [...(atomUsage.get(atomId) ?? []), amount]);
  }
  for (const [id, values] of atomUsage)
    need(
      !money(
        sum(values, s.nativeCurrency),
        s.nativeCurrency,
      ).amount.greaterThan(
        money(atoms.get(id)!.amount, s.nativeCurrency).amount,
      ),
      'PORTIONS_EXCEED_RESTRICTED_ATOM',
    );
  const credited = new Set<string>();
  function covered(v: unknown, required: string) {
    const ids = array(v).map((x) => text(x));
    need(new Set(ids).size === ids.length, 'DUPLICATE_PORTION_CREDIT');
    const values = ids.map((id) => {
      need(!credited.has(id), 'CROSS_PURPOSE_PORTION_REUSE');
      credited.add(id);
      const p = portions.get(id);
      need(p, 'COVERAGE_PORTION_MISSING');
      return p.amount;
    });
    return minus(required, sum(values, s.nativeCurrency), s.nativeCurrency);
  }
  const payments = array(c.leaf.feePaymentCoverage),
    seenComponents = new Set<string>(),
    claimedFees = new Set<string>(),
    uncovered: string[] = [];
  for (const item of payments) {
    const p = row(item),
      component = text(p.canonicalPaymentComponentRef);
    need(!seenComponents.has(component), 'DUPLICATE_PAYMENT_COMPONENT');
    seenComponents.add(component);
    witness(c, p.source, p.requiredNative);
    const required = decimal(p.requiredNative);
    const feeRefs = array(p.feeChargeRefs).map((x) => text(x));
    let feeSum = '0';
    for (const ref of feeRefs) {
      need(!claimedFees.has(ref), 'FEE_ALREADY_IN_COMMITTED_COMPONENT');
      claimedFees.add(ref);
      const charge = fees?.charges.find((x) => x.key === ref);
      need(charge, 'FEE_COMPONENT_UNAVAILABLE');
      feeSum = money(feeSum, s.nativeCurrency)
        .add(money(charge.amount, s.nativeCurrency))
        .toCanonicalValue().amount;
    }
    need(
      !money(required, s.nativeCurrency).amount.lessThan(feeSum),
      'PAYMENT_LESS_THAN_INCLUDED_FEE',
    );
    uncovered.push(covered(p.coveredPortionIds, required));
  }
  if (fees) {
    sameScope(s, fees.scope);
    need(
      fees.charges.every((x) => claimedFees.has(x.key)),
      'FEE_PAYMENT_COVERAGE_INCOMPLETE',
    );
  } else
    need(
      input.feePolicy.tag === 'MISSING' &&
        input.feeEvents.tag === 'MISSING' &&
        c.leaf.feeDemandStatus === 'EXPLICIT_COMPLETE_NO_FEES',
      'FEE_DEMAND_UNRESOLVED',
    );
  const bc = row(c.leaf.bufferRestrictionCoverage);
  need(bc.requiredNative === b.amount, 'BUFFER_COVERAGE_REQUIREMENT_MISMATCH');
  witness(c, bc.source, bc.requiredNative);
  const uncoveredBuffer = covered(bc.coveredPortionIds, b.amount);
  const proof = row(witness(c, c.leaf.uncoveredOperandsDisjointProof));
  need(
    proof.disjoint === true &&
      canonical(proof.paymentComponentRefs) ===
        canonical([...seenComponents].sort()) &&
      proof.bufferRuleId === b.context.leaf.ruleId,
    'OVERLAP_UNRESOLVED',
  );
  const financing = row(c.leaf.explicitFeasibleFinancing);
  need(
    financing.nativeCurrency === s.nativeCurrency &&
      canonical(financing.period) === canonical(s.period),
    'FINANCING_SCOPE_MISSING',
  );
  witness(c, financing.source, financing.amount);
  const feasible = decimal(financing.amount);
  const mandatory = sum(uncovered, s.nativeCurrency);
  const result = calculateAvailableFiscalCapacity({
    cash: selected.candidateAvailable,
    feasibleFinancing: { amount: feasible, currency: s.nativeCurrency },
    mandatoryPayments: { amount: mandatory, currency: s.nativeCurrency },
    minimumBuffer: { amount: uncoveredBuffer, currency: s.nativeCurrency },
  });
  Money.from(result.amount, result.currency);
  return {
    kind: 'DRAFT_EXISTING_HELPER_DIAGNOSTIC',
    helperCalls: [
      'readNativeCashSourceCandidate',
      'calculateAvailableFiscalCapacity',
    ],
    availableAfterExistingRestrictionUnion: selected.candidateAvailable,
    restrictedUnion: selected.candidateRestricted,
    uncoveredPayments: { amount: mandatory, currency: s.nativeCurrency },
    uncoveredBuffer: { amount: uncoveredBuffer, currency: s.nativeCurrency },
    capacity: result,
    // Preserve the existing reader's selected candidate and its byte/scope
    // binding. The overlap document's trace alone cannot identify the cash
    // operand. None of these consistency witnesses admits a source or cash.
    nativeCashCandidateSource: f.candidateSource,
    nativeCashScope: fInput.expected,
    nativeCashReferenceMappingSha256: digest(fInput.mappingsBytes),
    nativeCashPackageManifestSha256: f.packageManifestSha256,
    nativeCashRow: selected,
    nativeCashFormalBlockers: f.formalBlockers,
    sourceTrace: c.trace,
    actualRetainedCash: null,
  };
}

export function buildCountry01FeeBufferCandidate(input: FeeBufferDraftInput) {
  exactKeys(row(input), [
    'schema',
    'mode',
    'countryId',
    'documents',
    'feePolicy',
    'feeEvents',
    'bufferRule',
    'cashOverlap',
  ]);
  need(
    input.schema === 'c-country01-fee-buffer-draft-input-v1' &&
      ['DRAFT_ONLY', 'TEST_ONLY'].includes(input.mode),
    'DRAFT_MODE_REQUIRED',
  );
  need(
    input.countryId === 'COUNTRY_01' ||
      (input.mode === 'TEST_ONLY' &&
        input.countryId === 'TEST_ONLY_COUNTRY_01'),
    'COUNTRY01_ONLY',
  );
  const resolve = sourceContexts(input);
  const pc = capture(() => resolve(input.feePolicy)),
    ec = capture(() => resolve(input.feeEvents)),
    bc = capture(() => resolve(input.bufferRule));
  const p = pc.value
    ? capture(() => policy(pc.value!, input))
    : { value: null, blockers: pc.blockers };
  const e = ec.value
    ? capture(() => {
        need(p.value, 'FEE_POLICY_UNAVAILABLE');
        return eventFees(ec.value!, p.value, input);
      })
    : { value: null, blockers: ec.blockers };
  const b = bc.value
    ? capture(() => buffer(bc.value!, input))
    : { value: null, blockers: bc.blockers };
  const joint = capture(() =>
    capacity(resolve(input.cashOverlap, true), input, e.value, b.value),
  );
  const suffix =
    input.mode === 'TEST_ONLY'
      ? 'TEST_ONLY::COUNTRY::COUNTRY_01::'
      : 'U2544::COUNTRY::COUNTRY_01::';
  const values = [
    p.value ? structuredClone(p.value.body) : null,
    e.value
      ? { amount: e.value.total, currency: e.value.scope.nativeCurrency }
      : null,
    b.value
      ? { amount: b.value.amount, currency: b.value.scope.nativeCurrency }
      : null,
  ];
  const contexts = [pc.value, ec.value, bc.value];
  // feeTotal consumes the parsed policy as well as the event inventory. Keep
  // that dependency trace separate from the row-owned adoption locator.
  const sourceTraces = [
    pc.value?.trace ?? [],
    [
      ...(ec.value && p.value ? p.value.context.trace : []),
      ...(ec.value?.trace ?? []),
    ],
    bc.value?.trace ?? [],
  ];
  const errors = [p.blockers, e.blockers, b.blockers];
  const statuses = [
    'DRAFT_POLICY_COMPLETE',
    'DRAFT_COMPUTED_CHARGES',
    'DRAFT_COMPUTED_BUFFER_REQUIREMENT',
  ];
  const rows = SOURCE_PINS.fields.map((f, i) => ({
    stableId: suffix + f.field,
    parentBatch: { batchId: f.batch, subsetCount: f.batch === 'B03' ? 2 : 1 },
    unit: f.unit,
    evidenceClass:
      input.mode === 'TEST_ONLY' ? 'TEST_ONLY' : 'DRAFT_CANDIDATE_NOT_ADOPTED',
    candidateStatus:
      values[i] === null
        ? errors[i]!.some(
            (x) => x.includes('MISSING') || x.includes('UNAVAILABLE'),
          )
          ? 'MISSING_INPUT'
          : 'INVALID_DRAFT'
        : statuses[i],
    candidateValue: values[i],
    candidateMeasureBasis: [
      'VERSIONED_DRAFT_POLICY_NOT_ADOPTED',
      'DRAFT_EVENT_CHARGE_SUM_NOT_PAYMENT',
      'DRAFT_REQUIREMENT_NOT_RETAINED_CASH',
    ][i],
    candidateCompletenessScope:
      'DECLARED_SOURCE_FAMILY_OR_REQUIREMENT_NOT_COUNTRY_UNIVERSE',
    originalBinding:
      input.mode === 'TEST_ONLY'
        ? null
        : {
            stableId: `U2544::COUNTRY::COUNTRY_01::${f.field}`,
            originalAcceptanceRule: f.originalAcceptanceRule,
            ledger: { ...SOURCE_PINS.sources.ledger, pointer: f.ledgerPointer },
            gap: {
              ...SOURCE_PINS.sources.gaps,
              pointer: `/countries/0/fields/${f.field}`,
            },
            evidenceClass: 'PINNED_HISTORICAL_UNKNOWN_NOT_ACTUAL_ADOPTION',
          },
    sourceTrace: sourceTraces[i]!,
    adoptionDiagnostics: {
      locator: contexts[i]?.adoptionLocator ?? null,
      verification: 'NOT_WIRED_TO_TRUSTED_ADOPTION_CONSUMER',
      applied: false,
    },
    blockers: errors[i],
    actual: {
      value: null,
      currency: null,
      period: null,
      worldGenesisHead: null,
      adoptionReceipt: null,
      paymentReceipt: null,
    },
    stageFlags: {
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
    },
  }));
  return freeze(
    structuredClone({
      schema: 'c-country01-fee-buffer-candidate-v1',
      status: 'PER_ID_DRAFT_RESULTS_NOT_ACCEPTANCE',
      rows,
      diagnostics: {
        feeTotalCandidate: e.value
          ? { amount: e.value.total, currency: e.value.scope.nativeCurrency }
          : null,
        incrementalFeeForGrossCandidate: e.value
          ? {
              amount: e.value.incremental,
              currency: e.value.scope.nativeCurrency,
            }
          : null,
        gross: e.value?.gross ?? null,
        jointCapacity: joint.value,
        jointBlockers: joint.blockers,
        actualRetainedCash: null,
      },
      sourceAdmitted: false,
      adoptionApplied: false,
      productionAuthority: false,
      runtimeConnected: false,
      paymentExecuted: false,
      registerWritten: false,
      originalFieldsClosed: 0,
    }),
  );
}

/** Fixed original read only: no source selectors or caller pin/issuer override. */
export function readFixedCountry01FeeBufferInputs() {
  need(arguments.length === 0, 'NO_FIXED_SOURCE_OVERRIDE');
  const sources: Record<string, unknown> = {},
    receipts: unknown[] = [];
  for (const [key, pin] of Object.entries(SOURCE_PINS.sources)) {
    const fd = openSync(
      pin.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const st = fstatSync(fd);
      need(
        st.isFile() && st.size === pin.bytes && st.size <= 16 * 1024 * 1024,
        'FIXED_FILE_SIZE_OR_TYPE',
      );
      const bytes = readFileSync(fd);
      need(
        bytes.length === pin.bytes && digest(bytes) === pin.sha256,
        'FIXED_SOURCE_DRIFT',
      );
      sources[key] = parseFinancialRegistrySourceJson(bytes.toString('utf8'));
      receipts.push({ key, ...pin, verification: 'EXACT_BYTES_NOT_ADOPTION' });
    } finally {
      closeSync(fd);
    }
  }
  const rows = SOURCE_PINS.fields.map((f) => {
    const original = row(pointer(sources.ledger, f.ledgerPointer));
    const leaf = row(pointer(sources.gaps, `/countries/0/fields/${f.field}`));
    const id = `U2544::COUNTRY::COUNTRY_01::${f.field}`;
    need(
      original.stableId === id &&
        original.originalUnit === f.unit &&
        original.acceptanceRule === f.originalAcceptanceRule &&
        leaf.value === null,
      'FIXED_ORIGINAL_ID_OR_NULL_MISMATCH',
    );
    return {
      stableId: id,
      unit: f.unit,
      originalAcceptanceRule: original.acceptanceRule,
      sourceLeaf: leaf,
      ledgerPointer: f.ledgerPointer,
      sourcePointer: `/countries/0/fields/${f.field}`,
      actualValue: null,
    };
  });
  return freeze({
    rows,
    sourceReceipts: receipts,
    feeRule: pointer(sources.parameters, '/feeRule'),
    originalFieldsClosed: 0,
    sourceAdmitted: false,
    adoptionApplied: false,
  });
}
