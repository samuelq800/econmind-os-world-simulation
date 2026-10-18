/** Inert scenario declarations. Parsing never establishes title, adoption or authority. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  canonicalSerialize,
  parseWorldDecimal,
  CURRENT_REPLAY_BINDING,
} from '@econmind/core';

export type ClaimJson =
  null | boolean | string | readonly ClaimJson[] | ClaimJsonRecord;
export interface ClaimJsonRecord {
  readonly [key: string]: ClaimJson;
}
export interface ClaimScenarioOpening {
  readonly worldId: string;
  readonly openingIdentityReference: string;
  readonly openingIdentityHash: string;
  readonly openingWorldVersion: '0';
  readonly modelVersion: string;
  readonly replayBinding: ClaimJsonRecord;
  readonly openingEpoch: string;
  readonly valueDate: string;
  readonly sourceIdentity: string;
}
export interface ClaimScenarioMirror {
  readonly holdingId: string | null;
  readonly role: 'ASSET' | 'LIABILITY';
  readonly ownerId: string;
  readonly counterpartyId: string;
  readonly amount: string;
  readonly currency: 'GCU';
}
export interface ClaimScenarioRow {
  readonly originalClaimSelector: string;
  readonly financialClaimId: string | null;
  readonly instrumentCode: string | null;
  readonly principal: string;
  readonly currency: 'GCU';
  readonly legalIssuer: {
    readonly entityId: string;
    readonly proof: ClaimJson;
    readonly meaning: string;
  };
  readonly legalHolder: {
    readonly entityId: string;
    readonly proof: ClaimJson;
    readonly meaning: string;
  };
  readonly lifecycle: ClaimJsonRecord;
  readonly sourceReferences: ClaimJsonRecord;
  readonly mirrors: readonly ClaimScenarioMirror[];
}
export interface ClaimScenarioDraftInput {
  readonly schemaVersion: 'CLAIM_SCENARIO_SOURCE_DRAFT_INPUT_DESIGN_V1';
  readonly sourceClass: 'CONSTRUCTED_SCENARIO';
  readonly sourceVersion: string;
  readonly previousVersionHash: string | null;
  readonly creationReason: 'SCENARIO_RESTATEMENT_OF_UNADOPTED_PROPOSALS';
  readonly inactiveOpening: ClaimScenarioOpening | null;
  readonly claims: readonly ClaimScenarioRow[];
  readonly originalStableIdLinks: readonly string[];
}
export interface ParsedClaimScenarioDraft {
  readonly input: ClaimScenarioDraftInput;
  readonly canonicalBytes: string;
  readonly fingerprint: string;
  readonly blockers: readonly string[];
}
export class ClaimScenarioSourceInvalid extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ClaimScenarioSourceInvalid';
  }
}
export function requireClaimSource(ok: unknown, code: string): asserts ok {
  if (!ok) throw new ClaimScenarioSourceInvalid(code);
}
export const claimSourceHash = (bytes: string): string =>
  createHash('sha256').update(bytes).digest('hex');
export const CLAIM_SCENARIO_EXPECTATIONS = Object.freeze([
  Object.freeze(['SCENE_CLEARING_09_24_V2', '499500000', '09', '24']),
  Object.freeze(['SCENE_CLEARING_13_24_V2', '199800000', '13', '24']),
  Object.freeze(['SCENE_CLEARING_20_09_V2', '874125000', '20', '09']),
  Object.freeze(['SCENE_CLEARING_20_24_V2', '149850000', '20', '24']),
] as const);
export const CLAIM_LIFECYCLE_KEYS = Object.freeze([
  'effectiveFrom',
  'accrualStart',
  'interestDayCount',
  'annualCoupon',
  'firstCouponDue',
  'principalDue',
  'principalGrace',
  'lateRate',
  'lateCompounding',
  'overdueBoundary',
  'defaultResolution',
  'callPolicy',
  'earlyPayment',
  'partialPayment',
  'allocation',
  'refundAndCorrection',
  'fees',
]);
export function freezeClaimSource<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    for (const value of Object.values(input)) freezeClaimSource(value);
    Object.freeze(input);
  }
  return input;
}
/** Bounded plain JSON snapshot; reject Proxy/accessor before property execution. */
export function snapshotClaimSource(input: unknown): ClaimJson {
  let count = 0,
    chars = 0;
  const seen = new Set<object>();
  const copy = (v: unknown, depth: number): ClaimJson => {
    requireClaimSource(
      ++count <= 12000 && depth <= 28,
      'SOURCE_STRUCTURE_LIMIT',
    );
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      chars += v.length;
      requireClaimSource(
        v.length <= 65536 && chars <= 262144,
        'SOURCE_TEXT_LIMIT',
      );
      return v;
    }
    requireClaimSource(
      typeof v === 'object' && !types.isProxy(v) && !seen.has(v),
      'PLAIN_JSON_REQUIRED',
    );
    seen.add(v);
    try {
      requireClaimSource(
        Object.getPrototypeOf(v) ===
          (Array.isArray(v) ? Array.prototype : Object.prototype),
        'PLAIN_JSON_REQUIRED',
      );
      const descriptors = Object.getOwnPropertyDescriptors(v);
      const keys = Reflect.ownKeys(descriptors);
      requireClaimSource(
        keys.length <= 513 && keys.every((k) => typeof k === 'string'),
        'SOURCE_STRUCTURE_LIMIT',
      );
      const array = Array.isArray(v);
      for (const k of keys as string[]) {
        if (array && k === 'length') continue;
        const d = descriptors[k]!;
        requireClaimSource(
          'value' in d && d.enumerable && (!array || /^(0|[1-9]\d*)$/u.test(k)),
          'PLAIN_JSON_REQUIRED',
        );
      }
      if (array) {
        requireClaimSource(
          v.length <= 512 && keys.length === v.length + 1,
          'DENSE_BOUNDED_ARRAY_REQUIRED',
        );
        return Array.from({ length: v.length }, (_, i) =>
          copy(descriptors[String(i)]!.value, depth + 1),
        );
      }
      return Object.fromEntries(
        (keys as string[]).map((k) => [
          k,
          copy(descriptors[k]!.value, depth + 1),
        ]),
      );
    } finally {
      seen.delete(v);
    }
  };
  return copy(input, 0);
}
export function claimRecord(
  v: ClaimJson,
  keys?: readonly string[],
): ClaimJsonRecord {
  requireClaimSource(
    v !== null && typeof v === 'object' && !Array.isArray(v),
    'RECORD_REQUIRED',
  );
  const r = v as ClaimJsonRecord;
  if (keys)
    requireClaimSource(
      Object.keys(r).sort().join('|') === [...keys].sort().join('|'),
      'EXACT_KEYS_REQUIRED',
    );
  return r;
}
const text = (v: ClaimJson | undefined): v is string =>
  typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 512;
const stable = (v: ClaimJson | undefined): boolean =>
  text(v) && /^[A-Z][A-Z0-9_]{0,127}$/u.test(v);
const hash = (v: ClaimJson | undefined): boolean =>
  typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v);
const day = (v: ClaimJson | undefined): boolean =>
  typeof v === 'string' && /^(0|[1-9]\d{0,8})$/u.test(v);
function date(v: ClaimJson | undefined): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) return false;
  const n = new Date(v + 'T00:00:00.000Z');
  return Number.isFinite(n.getTime()) && n.toISOString().slice(0, 10) === v;
}
const instances = new WeakSet<object>();
export function isParsedClaimScenarioDraft(
  v: unknown,
): v is ParsedClaimScenarioDraft {
  return typeof v === 'object' && v !== null && instances.has(v);
}
export function parseClaimScenarioSourceDraft(
  input: unknown,
): ParsedClaimScenarioDraft {
  const value = snapshotClaimSource(input);
  const root = claimRecord(value, [
    'schemaVersion',
    'sourceClass',
    'sourceVersion',
    'previousVersionHash',
    'creationReason',
    'inactiveOpening',
    'claims',
    'originalStableIdLinks',
  ]);
  requireClaimSource(
    root.schemaVersion === 'CLAIM_SCENARIO_SOURCE_DRAFT_INPUT_DESIGN_V1' &&
      root.sourceClass === 'CONSTRUCTED_SCENARIO' &&
      root.creationReason === 'SCENARIO_RESTATEMENT_OF_UNADOPTED_PROPOSALS',
    'SOURCE_KIND_INVALID',
  );
  requireClaimSource(
    text(root.sourceVersion) &&
      (root.previousVersionHash === null || hash(root.previousVersionHash)),
    'SOURCE_VERSION_INVALID',
  );
  const blockers = new Set<string>();
  if (root.inactiveOpening === null) blockers.add('INACTIVE_OPENING_UNBOUND');
  else {
    const o = claimRecord(root.inactiveOpening!, [
      'worldId',
      'openingIdentityReference',
      'openingIdentityHash',
      'openingWorldVersion',
      'modelVersion',
      'replayBinding',
      'openingEpoch',
      'valueDate',
      'sourceIdentity',
    ]);
    requireClaimSource(
      stable(o.worldId) &&
        stable(o.openingEpoch) &&
        text(o.openingIdentityReference) &&
        hash(o.openingIdentityHash) &&
        o.openingWorldVersion === '0' &&
        text(o.modelVersion) &&
        text(o.sourceIdentity) &&
        date(o.valueDate),
      'OPENING_BINDING_INVALID',
    );
    claimRecord(o.replayBinding!);
    requireClaimSource(
      o.modelVersion === CURRENT_REPLAY_BINDING.modelVersion &&
        canonicalSerialize(o.replayBinding) ===
          canonicalSerialize(CURRENT_REPLAY_BINDING),
      'OPENING_REPLAY_BINDING_MISMATCH',
    );
  }
  requireClaimSource(
    Array.isArray(root.claims) &&
      root.claims.length === 4 &&
      Array.isArray(root.originalStableIdLinks),
    'EXACT_FOUR_CLAIMS_REQUIRED',
  );
  const rows = root.claims.map((c) =>
    claimRecord(c, [
      'originalClaimSelector',
      'financialClaimId',
      'instrumentCode',
      'principal',
      'currency',
      'legalIssuer',
      'legalHolder',
      'lifecycle',
      'sourceReferences',
      'mirrors',
    ]),
  );
  const ids = new Set<string>(),
    holdings = new Set<string>();
  const expectedLinks: string[] = [];
  for (const [
    selector,
    amount,
    issuer,
    holder,
  ] of CLAIM_SCENARIO_EXPECTATIONS) {
    const matches = rows.filter((r) => r.originalClaimSelector === selector);
    requireClaimSource(matches.length === 1, 'CLAIM_ID_COVERAGE_INVALID');
    const c = matches[0]!;
    requireClaimSource(
      c.principal === amount && c.currency === 'GCU',
      'PRINCIPAL_OR_CURRENCY_MISMATCH',
    );
    for (const k of ['financialClaimId', 'instrumentCode'] as const) {
      if (c[k] === null) blockers.add('INSTRUMENT_ID_UNBOUND');
      else {
        requireClaimSource(stable(c[k]), 'INSTRUMENT_ID_INVALID');
        if (k === 'financialClaimId') {
          requireClaimSource(
            !ids.has(c[k] as string),
            'DUPLICATE_FINANCIAL_CLAIM',
          );
          ids.add(c[k] as string);
        }
      }
    }
    for (const [key, entity] of [
      ['legalIssuer', issuer],
      ['legalHolder', holder],
    ] as const) {
      const r = claimRecord(c[key]!, ['entityId', 'proof', 'meaning']);
      requireClaimSource(
        r.entityId === `ENTITY_CENTRAL_BANK_${entity}` && text(r.meaning),
        'LEGAL_ROLE_MISMATCH',
      );
      if (r.proof === null) blockers.add('LEGAL_ROLE_SOURCE_UNBOUND');
      else {
        const p = claimRecord(r.proof!, [
          'reference',
          'sha256',
          'bytes',
          'version',
          'pointer',
        ]);
        requireClaimSource(
          text(p.reference) &&
            hash(p.sha256) &&
            day(p.bytes) &&
            p.bytes !== '0' &&
            text(p.version) &&
            typeof p.pointer === 'string' &&
            p.pointer.startsWith('/'),
          'ROLE_SOURCE_REFERENCE_INVALID',
        );
      }
    }
    claimRecord(c.sourceReferences!);
    const lifecycle = claimRecord(c.lifecycle!, CLAIM_LIFECYCLE_KEYS);
    for (const key of CLAIM_LIFECYCLE_KEYS)
      if (lifecycle[key] === null) blockers.add('INCOMPLETE_LIFECYCLE');
    const field = (key: string): ClaimJsonRecord | null =>
      lifecycle[key] === null ? null : claimRecord(lifecycle[key]!);
    requireClaimSource(
      field('interestDayCount')?.simulationDaysPerYear === '360',
      'TIME360_REQUIRED',
    );
    for (const key of ['annualCoupon', 'lateRate']) {
      const r = field(key);
      if (r)
        requireClaimSource(
          text(r.fraction) &&
            /^(0|[1-9]\d*)(\.\d+)?$/u.test(r.fraction) &&
            !parseWorldDecimal(r.fraction).isNegative() &&
            text(r.status),
          'EXPLICIT_RATE_REQUIRED',
        );
    }
    const due = field('principalDue')?.selectedRelativeSimDay;
    if (due === null) blockers.add('MATURITY_UNSELECTED');
    else requireClaimSource(day(due) && due !== '0', 'MATURITY_INVALID');
    const accrual = field('accrualStart')?.relativeSimDay;
    const grace = field('principalGrace')?.simDays;
    requireClaimSource(
      day(accrual) && day(grace),
      'EXPLICIT_ACCRUAL_AND_GRACE_REQUIRED',
    );
    if (typeof due === 'string')
      requireClaimSource(
        BigInt(accrual as string) <= BigInt(due),
        'PERIOD_INVALID',
      );
    const coupon = field('annualCoupon')?.fraction;
    requireClaimSource(
      field('principalDue')?.boundary === 'END_OF_SELECTED_RELATIVE_DAY',
      'DUE_BOUNDARY_REQUIRED',
    );
    requireClaimSource(
      field('lateCompounding')?.policy === 'NONE_NO_CAPITALIZATION' &&
        field('overdueBoundary')?.rule ===
          'UNPAID_REMAINDER_FROM_DAY_AFTER_DUE_DAY_END' &&
        field('overdueBoundary')?.balanceForgiven === false &&
        field('callPolicy')?.creditorUnilateralCall === false,
      'EXPLICIT_SUPPORTED_LIFECYCLE_REQUIRED',
    );
    requireClaimSource(
      field('earlyPayment')?.policy ===
        'EXPLICIT_BILATERAL_CONSENT_AND_EXACT_SUPPORTED_ROUTE_ONLY' &&
        field('earlyPayment')?.unsupportedRoute === 'DENY' &&
        field('partialPayment')?.policy ===
          'COUNT_UNIQUE_MATCHING_COMMITTED_PRINCIPAL_ALLOCATIONS_ONLY' &&
        field('partialPayment')?.cap === 'OUTSTANDING_PRINCIPAL' &&
        field('partialPayment')?.unpaidRemainder === 'REMAINS_OWED' &&
        field('partialPayment')?.unsupportedRoute === 'DENY' &&
        field('allocation')?.unknownFeeReducesPrincipal === false &&
        field('allocation')?.policy ===
          'EXACT_COMMITTED_DEBT_PRINCIPAL_LEG_ONLY' &&
        text(field('allocation')?.feeAllocation),
      'EXPLICIT_ALLOCATION_POLICY_REQUIRED',
    );
    const effective = field('effectiveFrom');
    requireClaimSource(
      effective?.scope === 'EXPLICIT_NEW_INACTIVE_OPENING_ONLY',
      'EXPLICIT_EFFECTIVE_SCOPE_REQUIRED',
    );
    if (effective.actualOpeningEpoch === null)
      blockers.add('LIFECYCLE_EPOCH_UNBOUND');
    else
      requireClaimSource(
        root.inactiveOpening !== null &&
          effective.actualOpeningEpoch ===
            claimRecord(root.inactiveOpening!).openingEpoch,
        'LIFECYCLE_EPOCH_MISMATCH',
      );
    if (coupon === '0')
      requireClaimSource(
        field('firstCouponDue')?.policy ===
          'NO_SCHEDULED_COUPON_FOR_EXPLICIT_ZERO_COUPON_DRAFT' &&
          field('firstCouponDue')?.actualDue === null,
        'ZERO_COUPON_POLICY_REQUIRED',
      );
    if (coupon !== '0' && coupon !== undefined) {
      const first = field('firstCouponDue')?.relativeSimDay;
      requireClaimSource(
        day(first) &&
          first !== '0' &&
          BigInt(first as string) > BigInt(accrual as string),
        'DAY0_ANNUAL_COUPON_FORBIDDEN',
      );
    }
    const fees = field('fees');
    if (fees)
      requireClaimSource(
        fees.policy ===
          'REQUIRE_EXACT_APPLICABLE_FEE_SOURCE_BEFORE_OPERATION' &&
          fees.missingApplicableFact === 'DENY_OPERATION_NOT_ZERO_FEE' &&
          fees.freeAdminScopeCoversDebtFxRefund === false &&
          fees.existingContractFeeWaived === false &&
          Object.hasOwn(fees, 'quote'),
        'FEE_SCOPE_OR_DEFAULT_INVALID',
      );
    const refund = field('refundAndCorrection');
    if (refund)
      requireClaimSource(
        refund.originalCommittedReferenceRequired === true &&
          refund.unexecutedIntentCreatesRefund === false &&
          refund.automaticPrincipalRestoration === false &&
          text(refund.policy) &&
          text(refund.cashCap) &&
          text(refund.debtCorrection),
        'REFUND_POLICY_INVALID',
      );
    const resolution = field('defaultResolution');
    if (resolution)
      requireClaimSource(
        resolution.automaticSeizure === false &&
          resolution.automaticRollover === false &&
          resolution.automaticNetting === false &&
          resolution.automaticForgiveness === false &&
          resolution.otherExistingRightsWaived === false &&
          resolution.remedyWithoutBoundAuthority === 'DENY',
        'DEFAULT_REMEDY_POLICY_INVALID',
      );
    requireClaimSource(
      Array.isArray(c.mirrors) && c.mirrors.length === 2,
      'TWO_MIRRORS_REQUIRED',
    );
    const roles = new Set<string>();
    for (const m of c.mirrors) {
      const r = claimRecord(m, [
        'holdingId',
        'role',
        'ownerId',
        'counterpartyId',
        'amount',
        'currency',
      ]);
      requireClaimSource(
        (r.role === 'ASSET' || r.role === 'LIABILITY') &&
          !roles.has(r.role) &&
          r.amount === amount &&
          r.currency === 'GCU' &&
          r.ownerId ===
            `ENTITY_CENTRAL_BANK_${r.role === 'ASSET' ? holder : issuer}` &&
          r.counterpartyId ===
            `ENTITY_CENTRAL_BANK_${r.role === 'ASSET' ? issuer : holder}`,
        'MIRROR_AMOUNT_CURRENCY_OR_ROLE_MISMATCH',
      );
      roles.add(r.role);
      if (r.holdingId === null) blockers.add('HOLDING_ID_UNBOUND');
      else {
        requireClaimSource(
          stable(r.holdingId) && !holdings.has(r.holdingId as string),
          'HOLDING_ID_INVALID_OR_DUPLICATE',
        );
        holdings.add(r.holdingId as string);
      }
    }
    expectedLinks.push(
      ...['actualTerms', 'actualLegalHolderIssuer'].map(
        (f) => `U2544::CLAIM::${selector}::${f}`,
      ),
    );
  }
  requireClaimSource(
    canonicalSerialize([...root.originalStableIdLinks].sort()) ===
      canonicalSerialize(expectedLinks.sort()),
    'ORIGINAL_STABLE_ID_COVERAGE_INVALID',
  );
  const bytes = canonicalSerialize(value);
  const result: ParsedClaimScenarioDraft = freezeClaimSource({
    input: value as unknown as ClaimScenarioDraftInput,
    canonicalBytes: bytes,
    fingerprint: claimSourceHash(bytes),
    blockers: [...blockers].sort(),
  });
  instances.add(result);
  return result;
}
