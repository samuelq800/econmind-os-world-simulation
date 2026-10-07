/** P0, non-activated decision validation only. Never creates/adopts a seed or World.
 * trusted inputs are a separate server trust boundary, NOT request DTO evidence.
 * This module has no owner-record loader, automatic approval or economic write.
 */
import { createHash } from 'node:crypto';
import {
  Money,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  countryId,
  worldId,
  legalEntityId,
  financialAccountId,
  financialClaimId,
  openingSourceId,
  createFinancialAccount,
  type CanonicalSha256,
} from '@econmind/core';

export const OPENING_ECONOMIC_DECISION_SCHEMA =
  'opening-economic-decision-v1' as const;
export const FIXED_OPENING_PROPOSAL_E = Object.freeze({
  proposalId: 'E',
  proposalVersion: 'E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07',
  proposalSha256:
    '15383e28d523bad7ff4fdbe14e141c7a46f21072c9bd4a81faa5a5acc378c7cb',
  artifactRef: 'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
} as const);
export const OPENING_PROVENANCE_KINDS = Object.freeze([
  'SOURCE_IMMUTABLE',
  'OWNER_ADOPTED_RULE',
  'OWNER_ADOPTED_VALUE',
  'DERIVED_BY_ADOPTED_RULE',
  'DOMAIN_ADOPTED',
  'PROPOSAL_ONLY',
  'AUTHORITATIVE_OPENING_STATE',
] as const);
export type OpeningProvenanceKind = (typeof OPENING_PROVENANCE_KINDS)[number];
export const OPENING_FINANCE_FIELDS = Object.freeze([
  'treasuryCentralBankBalance',
  'householdBankDeposits',
  'businessBankDeposits',
  'bankReserveAssets',
  'bankLoanAssets',
  'bankDepositLiabilities',
  'bankEquity',
] as const);
export type OpeningFinanceField = (typeof OPENING_FINANCE_FIELDS)[number];
export type OpeningFinanceValues = Readonly<
  Record<OpeningFinanceField, string>
>;
const SOURCE_PACKAGE = 'BALANCED_2026_09_28_V1';
const SOURCE_CHECKSUMS =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const FINANCE_SHA =
  '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805';
const FINANCE_LOCATOR =
  'artifacts/world-balanced-candidate-v1/data/finance.json';
type R = Record<string, unknown>;
export interface OpeningEconomicScope {
  readonly worldId: string | null;
  readonly modelVersion: string;
  readonly orchestratorVersion: string;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
}
export interface OpeningProvenanceV1 {
  readonly ref: string;
  readonly kind: OpeningProvenanceKind;
  readonly value: string | null;
  readonly inputRefs: readonly string[];
  readonly rule: 'E_COMPONENT_ANCHOR' | 'EXPLICIT_OWNER_VALUE' | null;
  readonly ownerRecordRef: string | null;
  readonly source: Readonly<{
    locator: string;
    sha256: string;
    pointer: string;
  }> | null;
}
export interface OpeningClaimPairV1 {
  readonly claimId: string;
  readonly amount: string;
  readonly assetAccountId: string;
  readonly liabilityAccountId: string;
  readonly assetOwnerId: string;
  readonly liabilityOwnerId: string;
  readonly provenanceRef: string;
}
export interface OpeningCentralBankPositionV1 {
  readonly accountId: string;
  readonly accountClass: 'ASSET' | 'LIABILITY' | 'EQUITY';
  readonly purpose:
    | 'GENESIS_POOL'
    | 'RESERVE_CLAIM'
    | 'TREASURY_CLAIM'
    | 'EXPLICIT_ADOPTED_POSITION';
  readonly amount: string;
  readonly claimId: string | null;
  readonly counterpartyEntityId: string | null;
  readonly provenanceRef: string;
}
export interface OpeningFinancialAllocationV1 {
  readonly countryId: string;
  readonly decisionStatus:
    'UNRESOLVED_HUMAN_ECONOMIC_INPUT' | 'OWNER_ADOPTION_REQUESTED';
  readonly sourceFinance: OpeningFinanceValues;
  readonly legalEntities: Readonly<{
    treasury: string;
    centralBank: string;
    bank: string;
  }> | null;
  readonly fundsModel:
    'INDEPENDENT_GENESIS_POOLS' | 'TREASURY_DEPOSIT_AT_CB' | null;
  readonly treasuryOpeningBalance: string | null;
  readonly centralBankOpeningBalance: string | null;
  readonly reserveClaim: OpeningClaimPairV1 | null;
  readonly treasuryClaim: OpeningClaimPairV1 | null;
  readonly centralBankPositions: readonly OpeningCentralBankPositionV1[];
  readonly fieldProvenance: Readonly<Record<string, string>>;
}
export interface OpeningEconomicDecisionV1 {
  readonly schemaVersion: typeof OPENING_ECONOMIC_DECISION_SCHEMA;
  readonly decisionVersion: string;
  readonly proposal: typeof FIXED_OPENING_PROPOSAL_E;
  readonly sourceMutationAllowed: false;
  readonly effectiveScope: OpeningEconomicScope;
  readonly rules: Readonly<{
    currency: 'EXACT_1_TO_1_GCU' | null;
    legalOwnership: 'E_FIXED_ROSTER_TITLE_RISK' | null;
    bankReconciliation: 'E_COMPONENT_ANCHOR' | null;
    reserve: 'BANK_ASSET_CB_LIABILITY_SAME_CLAIM' | null;
    transformationVersion: string | null;
  }>;
  readonly ownerAdoption: Readonly<{
    reference: string;
    recordFingerprint: CanonicalSha256;
  }> | null;
  readonly countries: readonly OpeningFinancialAllocationV1[];
  readonly provenance: readonly OpeningProvenanceV1[];
}
export interface ParsedOpeningEconomicDecision {
  readonly status: 'UNTRUSTED_DECISION_CANDIDATE';
  readonly body: OpeningEconomicDecisionV1;
  readonly intentFingerprint: CanonicalSha256;
  readonly fingerprint: CanonicalSha256;
}
/** Trusted only because a reviewed server composition independently resolves the
 * immutable official source and HUMAN owner registry records. No caller flag,
 * hash, filename or this type itself establishes that external trust boundary.
 * Current real owner record set is empty. Never populate it from request JSON.
 */
export interface TrustedOpeningDecisionInputs {
  readonly source: Readonly<{
    sourcePackageId: string;
    sourceChecksumsSha256: string;
    financeSha256: string;
    finance: readonly Readonly<{
      countryId: string;
      sourceRowPointer: string;
      values: OpeningFinanceValues;
    }>[];
  }>;
  readonly ownerRecords: readonly Readonly<{
    /** Fixed existing authority register, immutable Git commit + JSON pointer. */
    reference: string;
    record: unknown;
  }>[];
}
export interface OpeningDecisionBlocker {
  readonly countryId: string | null;
  readonly field: string;
  readonly code: string;
}
export interface OpeningEconomicDecisionInspection {
  readonly status: 'BLOCKED' | 'DECISION_VALIDATED_NOT_SEED';
  readonly candidate: ParsedOpeningEconomicDecision;
  readonly blockers: readonly OpeningDecisionBlocker[];
  readonly derivedBank: readonly Readonly<{
    countryId: string;
    bankDepositLiabilities: string;
    bankEquity: string;
    provenance: 'DERIVED_BY_ADOPTED_RULE';
    rule: 'E_COMPONENT_ANCHOR';
    inputRefs: readonly string[];
    ownerRecordRef: string;
    proposalSha256: string;
    transformationVersion: string;
  }>[];
  readonly openingAdmissionAllowed: false;
}
export class OpeningEconomicDecisionInvalid extends Error {
  constructor(
    readonly field: string,
    readonly code = 'INVALID_DECISION_CONTRACT',
  ) {
    super(`${code}:${field}`);
    this.name = 'OpeningEconomicDecisionInvalid';
  }
}
function need(ok: unknown, field: string, code?: string): asserts ok {
  if (!ok) throw new OpeningEconomicDecisionInvalid(field, code);
}
function rec(v: unknown, field: string): R {
  need(v !== null && typeof v === 'object' && !Array.isArray(v), field);
  return v as R;
}
function keys(v: R, expected: readonly string[], field: string) {
  need(
    Object.keys(v).sort().join('|') === [...expected].sort().join('|'),
    field,
  );
}
function str(v: unknown, field: string): string {
  need(typeof v === 'string' && v.length > 0 && v.trim() === v, field);
  return v;
}
function list(v: unknown, field: string): readonly unknown[] {
  need(Array.isArray(v), field);
  return v;
}
function choice(
  v: unknown,
  allowed: readonly string[],
  field: string,
  nullable = false,
) {
  need(
    (nullable && v === null) || (typeof v === 'string' && allowed.includes(v)),
    field,
  );
}
function amount(v: unknown, field: string, negative = false) {
  const s = str(v, field);
  const m = Money.from(s, 'GCU');
  need(negative || !m.amount.isNegative(), field);
  return s;
}
function hash(v: unknown) {
  return canonicalSha256(canonicalHashInput(v), (s) =>
    createHash('sha256').update(s).digest('hex'),
  );
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const c of Object.values(v)) freeze(c);
    Object.freeze(v);
  }
  return v;
}
function scope(v: unknown) {
  const r = rec(v, 'effectiveScope');
  keys(
    r,
    [
      'worldId',
      'modelVersion',
      'orchestratorVersion',
      'sourcePackageId',
      'sourceChecksumsSha256',
    ],
    'effectiveScope',
  );
  if (r.worldId !== null) worldId(str(r.worldId, 'worldId'));
  str(r.modelVersion, 'modelVersion');
  str(r.orchestratorVersion, 'orchestratorVersion');
  need(
    r.sourcePackageId === SOURCE_PACKAGE &&
      r.sourceChecksumsSha256 === SOURCE_CHECKSUMS,
    'selectedSource',
  );
}
function claim(v: unknown, field: string) {
  if (v === null) return;
  const r = rec(v, field);
  keys(
    r,
    [
      'claimId',
      'amount',
      'assetAccountId',
      'liabilityAccountId',
      'assetOwnerId',
      'liabilityOwnerId',
      'provenanceRef',
    ],
    field,
  );
  financialClaimId(str(r.claimId, field));
  financialAccountId(str(r.assetAccountId, field));
  financialAccountId(str(r.liabilityAccountId, field));
  legalEntityId(str(r.assetOwnerId, field));
  legalEntityId(str(r.liabilityOwnerId, field));
  openingSourceId(str(r.provenanceRef, field));
  amount(r.amount, field);
  need(
    r.assetAccountId !== r.liabilityAccountId &&
      r.assetOwnerId !== r.liabilityOwnerId,
    field,
  );
}
/** Strict parsing computes identity, NOT approval. Original decimal lexemes stay
 * intact; only derived Money calculations emit canonical strings. */
export function parseOpeningEconomicDecision(
  input: unknown,
): ParsedOpeningEconomicDecision {
  let r: R;
  try {
    r = rec(JSON.parse(canonicalSerialize(input)), 'decision');
  } catch {
    throw new OpeningEconomicDecisionInvalid('decision', 'NON_CANONICAL_INPUT');
  }
  keys(
    r,
    [
      'schemaVersion',
      'decisionVersion',
      'proposal',
      'sourceMutationAllowed',
      'effectiveScope',
      'rules',
      'ownerAdoption',
      'countries',
      'provenance',
    ],
    'decision',
  );
  need(r.schemaVersion === OPENING_ECONOMIC_DECISION_SCHEMA, 'schemaVersion');
  str(r.decisionVersion, 'decisionVersion');
  need(
    canonicalSerialize(r.proposal) ===
      canonicalSerialize(FIXED_OPENING_PROPOSAL_E),
    'proposal',
    'FIXED_E_PROPOSAL_REQUIRED',
  );
  need(r.sourceMutationAllowed === false, 'sourceMutationAllowed');
  scope(r.effectiveScope);
  const rules = rec(r.rules, 'rules');
  keys(
    rules,
    [
      'currency',
      'legalOwnership',
      'bankReconciliation',
      'reserve',
      'transformationVersion',
    ],
    'rules',
  );
  choice(rules.currency, ['EXACT_1_TO_1_GCU'], 'rules.currency', true);
  choice(
    rules.legalOwnership,
    ['E_FIXED_ROSTER_TITLE_RISK'],
    'rules.legalOwnership',
    true,
  );
  choice(
    rules.bankReconciliation,
    ['E_COMPONENT_ANCHOR'],
    'rules.bankReconciliation',
    true,
  );
  choice(
    rules.reserve,
    ['BANK_ASSET_CB_LIABILITY_SAME_CLAIM'],
    'rules.reserve',
    true,
  );
  if (rules.transformationVersion !== null)
    str(rules.transformationVersion, 'transformationVersion');
  if (r.ownerAdoption !== null) {
    const a = rec(r.ownerAdoption, 'ownerAdoption');
    keys(a, ['reference', 'recordFingerprint'], 'ownerAdoption');
    need(
      /^git:[a-f0-9]{40}:status\/decisions\.json#\/.+$/u.test(
        str(a.reference, 'ownerAdoption.reference'),
      ),
      'ownerAdoption.reference',
    );
    need(
      /^sha256:[a-f0-9]{64}$/u.test(
        str(a.recordFingerprint, 'recordFingerprint'),
      ),
      'recordFingerprint',
    );
  }
  const countries = list(r.countries, 'countries');
  const ids: string[] = [];
  for (const value of countries) {
    const c = rec(value, 'country');
    keys(
      c,
      [
        'countryId',
        'decisionStatus',
        'sourceFinance',
        'legalEntities',
        'fundsModel',
        'treasuryOpeningBalance',
        'centralBankOpeningBalance',
        'reserveClaim',
        'treasuryClaim',
        'centralBankPositions',
        'fieldProvenance',
      ],
      'country',
    );
    ids.push(countryId(str(c.countryId, 'countryId')));
    choice(
      c.decisionStatus,
      ['UNRESOLVED_HUMAN_ECONOMIC_INPUT', 'OWNER_ADOPTION_REQUESTED'],
      'decisionStatus',
    );
    const s = rec(c.sourceFinance, 'sourceFinance');
    keys(s, OPENING_FINANCE_FIELDS, 'sourceFinance');
    for (const f of OPENING_FINANCE_FIELDS) amount(s[f], f, f === 'bankEquity');
    if (c.legalEntities !== null) {
      const l = rec(c.legalEntities, 'legalEntities');
      keys(l, ['treasury', 'centralBank', 'bank'], 'legalEntities');
      for (const v of Object.values(l)) legalEntityId(str(v, 'legalEntityId'));
      need(new Set(Object.values(l)).size === 3, 'legalEntities');
    }
    choice(
      c.fundsModel,
      ['INDEPENDENT_GENESIS_POOLS', 'TREASURY_DEPOSIT_AT_CB'],
      'fundsModel',
      true,
    );
    for (const f of ['treasuryOpeningBalance', 'centralBankOpeningBalance'])
      if (c[f] !== null) amount(c[f], f);
    claim(c.reserveClaim, 'reserveClaim');
    claim(c.treasuryClaim, 'treasuryClaim');
    for (const p of list(c.centralBankPositions, 'centralBankPositions')) {
      const b = rec(p, 'CB position');
      keys(
        b,
        [
          'accountId',
          'accountClass',
          'purpose',
          'amount',
          'claimId',
          'counterpartyEntityId',
          'provenanceRef',
        ],
        'CB position',
      );
      financialAccountId(str(b.accountId, 'accountId'));
      choice(b.accountClass, ['ASSET', 'LIABILITY', 'EQUITY'], 'accountClass');
      choice(
        b.purpose,
        [
          'GENESIS_POOL',
          'RESERVE_CLAIM',
          'TREASURY_CLAIM',
          'EXPLICIT_ADOPTED_POSITION',
        ],
        'purpose',
      );
      amount(b.amount, 'CB amount', b.accountClass === 'EQUITY');
      if (b.claimId !== null) financialClaimId(str(b.claimId, 'claimId'));
      if (b.counterpartyEntityId !== null)
        legalEntityId(str(b.counterpartyEntityId, 'counterpartyEntityId'));
      openingSourceId(str(b.provenanceRef, 'provenanceRef'));
    }
    const refs = rec(c.fieldProvenance, 'fieldProvenance');
    keys(
      refs,
      [
        ...OPENING_FINANCE_FIELDS,
        'treasuryOpeningBalance',
        'centralBankOpeningBalance',
      ],
      'fieldProvenance',
    );
    for (const v of Object.values(refs))
      openingSourceId(str(v, 'fieldProvenance'));
  }
  need(
    countries.length > 0 &&
      countries.length <= 70 &&
      new Set(ids).size === ids.length,
    'countryCoverage',
  );
  const provenance = list(r.provenance, 'provenance');
  const refs: string[] = [];
  for (const v of provenance) {
    const p = rec(v, 'provenance');
    keys(
      p,
      ['ref', 'kind', 'value', 'inputRefs', 'rule', 'ownerRecordRef', 'source'],
      'provenance',
    );
    refs.push(openingSourceId(str(p.ref, 'provenance.ref')));
    choice(p.kind, OPENING_PROVENANCE_KINDS, 'provenance.kind');
    if (p.value !== null) str(p.value, 'provenance.value');
    const inputs = list(p.inputRefs, 'inputRefs');
    for (const i of inputs) openingSourceId(str(i, 'inputRef'));
    need(new Set(inputs).size === inputs.length, 'inputRefs');
    choice(
      p.rule,
      ['E_COMPONENT_ANCHOR', 'EXPLICIT_OWNER_VALUE'],
      'provenance.rule',
      true,
    );
    if (p.ownerRecordRef !== null) str(p.ownerRecordRef, 'ownerRecordRef');
    if (p.source !== null) {
      const s = rec(p.source, 'provenance.source');
      keys(s, ['locator', 'sha256', 'pointer'], 'provenance.source');
      str(s.locator, 'locator');
      need(
        /^[a-f0-9]{64}$/u.test(str(s.sha256, 'source.sha256')),
        'source.sha256',
      );
      need(str(s.pointer, 'pointer').startsWith('/'), 'pointer');
    }
  }
  need(new Set(refs).size === refs.length, 'provenance.refs');
  const body = r as unknown as OpeningEconomicDecisionV1;
  const { ownerAdoption: omitted, ...intent } = body;
  void omitted;
  return freeze({
    status: 'UNTRUSTED_DECISION_CANDIDATE' as const,
    body,
    intentFingerprint: hash(intent),
    fingerprint: hash(body),
  });
}

/** Inspection validates decisions only. It never upgrades provenance into an
 * authoritative state, claims domain materialization, writes, or grants admission. */
export function inspectOpeningEconomicDecision(input: {
  readonly decision: unknown;
  readonly trusted: TrustedOpeningDecisionInputs;
}): OpeningEconomicDecisionInspection {
  const candidate = parseOpeningEconomicDecision(input.decision),
    d = candidate.body;
  const blockers: OpeningDecisionBlocker[] = [];
  const add = (field: string, code: string, country: string | null = null) =>
    blockers.push({ countryId: country, field, code });
  const t = input.trusted;
  const parsedWorld =
    d.effectiveScope.worldId === null
      ? null
      : worldId(d.effectiveScope.worldId);
  if (parsedWorld === null)
    add('effectiveScope.worldId', 'WORLD_ID_BINDING_REQUIRED');
  need(t && t.source && Array.isArray(t.ownerRecords), 'trustedInputs');
  need(
    t.source.sourcePackageId === SOURCE_PACKAGE &&
      t.source.sourceChecksumsSha256 === SOURCE_CHECKSUMS &&
      t.source.financeSha256 === FINANCE_SHA,
    'trustedSource',
  );
  const sources = new Map(
    t.source.finance.map((s) => [countryId(s.countryId), s]),
  );
  need(
    sources.size === t.source.finance.length &&
      sources.size > 0 &&
      sources.size <= 70,
    'trustedSourceCountries',
  );
  const sourceValues = new Map<string, string>();
  for (const s of sources.values()) {
    need(
      /^\/(?:0|[1-9]\d*)$/u.test(s.sourceRowPointer),
      'trustedSourcePointer',
    );
    for (const f of OPENING_FINANCE_FIELDS) {
      amount(s.values[f], `trustedSource.${f}`, f === 'bankEquity');
      const pointer = `${s.sourceRowPointer}/${f}`;
      need(!sourceValues.has(pointer), 'trustedSourcePointerDuplicate');
      sourceValues.set(pointer, s.values[f]);
    }
  }
  if (
    sources.size !== d.countries.length ||
    d.countries.some((c) => !sources.has(countryId(c.countryId)))
  )
    add('countries', 'SOURCE_COUNTRY_COVERAGE_MISMATCH');
  let adopted = false;
  const adoption = d.ownerAdoption;
  if (adoption === null) add('ownerAdoption', 'OWNER_ADOPTION_RECORD_MISSING');
  else {
    const matching = t.ownerRecords.filter(
      (r) => r.reference === adoption.reference,
    );
    if (matching.length !== 1)
      add('ownerAdoption', 'TRUSTED_OWNER_RECORD_MISSING_OR_AMBIGUOUS');
    else {
      let o: R;
      try {
        o = rec(
          JSON.parse(canonicalSerialize(matching[0]!.record)),
          'ownerRecord',
        );
        keys(
          o,
          [
            'schemaVersion',
            'decision',
            'ownerIdentity',
            'adoptedAtReal',
            'effectiveScope',
            'proposalSha256',
            'intentFingerprint',
          ],
          'ownerRecord',
        );
        const at = str(o.adoptedAtReal, 'adoptedAtReal');
        need(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(at) &&
            new Date(at).toISOString() === at,
          'adoptedAtReal',
        );
        str(o.ownerIdentity, 'ownerIdentity');
        adopted =
          o.schemaVersion === 'opening-owner-adoption-record-v1' &&
          o.decision === 'ADOPT' &&
          o.proposalSha256 === FIXED_OPENING_PROPOSAL_E.proposalSha256 &&
          o.intentFingerprint === candidate.intentFingerprint &&
          hash(o) === adoption.recordFingerprint &&
          canonicalSerialize(o.effectiveScope) ===
            canonicalSerialize(d.effectiveScope);
      } catch {
        adopted = false;
      }
      if (!adopted)
        add('ownerAdoption', 'OWNER_RECORD_SCOPE_OR_CONTENT_MISMATCH');
    }
  }
  for (const [k, v] of Object.entries(d.rules))
    if (v === null) add(`rules.${k}`, 'UNRESOLVED_HUMAN_ECONOMIC_INPUT');
  const nodes = new Map(d.provenance.map((p) => [p.ref, p]));
  const reachable = new Set<string>(),
    visiting = new Set<string>();
  function visit(ref: string): boolean {
    const n = nodes.get(ref);
    if (!n || visiting.has(ref)) return false;
    if (reachable.has(ref)) return true;
    visiting.add(ref);
    const ok = n.inputRefs.every(visit);
    visiting.delete(ref);
    if (ok) reachable.add(ref);
    return ok;
  }
  for (const p of d.provenance) {
    if (!visit(p.ref)) add(`provenance.${p.ref}`, 'BROKEN_PROVENANCE_LINEAGE');
    if (p.kind === 'AUTHORITATIVE_OPENING_STATE')
      add(`provenance.${p.ref}`, 'ACTUAL_ADMISSION_NOT_ESTABLISHED');
    if (
      [
        'OWNER_ADOPTED_RULE',
        'OWNER_ADOPTED_VALUE',
        'DERIVED_BY_ADOPTED_RULE',
        'DOMAIN_ADOPTED',
      ].includes(p.kind) &&
      (!adopted || p.ownerRecordRef !== adoption?.reference)
    )
      add(`provenance.${p.ref}`, 'UNTRUSTED_ADOPTION_LABEL');
    if (
      p.kind === 'SOURCE_IMMUTABLE' &&
      (p.source === null ||
        p.inputRefs.length !== 0 ||
        p.rule !== null ||
        p.ownerRecordRef !== null)
    )
      add(`provenance.${p.ref}`, 'BROKEN_SOURCE_PROVENANCE');
    if (
      p.kind === 'SOURCE_IMMUTABLE' &&
      (p.source?.locator !== FINANCE_LOCATOR ||
        p.source.sha256 !== FINANCE_SHA ||
        sourceValues.get(p.source.pointer) !== p.value)
    )
      add(`provenance.${p.ref}`, 'SOURCE_FIELD_IDENTITY_MISMATCH');
    if (
      ['OWNER_ADOPTED_VALUE', 'OWNER_ADOPTED_RULE', 'DOMAIN_ADOPTED'].includes(
        p.kind,
      ) &&
      (p.source !== null || p.inputRefs.length === 0)
    )
      add(`provenance.${p.ref}`, 'ADOPTED_PROVENANCE_INPUT_MISSING');
    if (
      p.kind === 'DERIVED_BY_ADOPTED_RULE' &&
      (p.rule !== 'E_COMPONENT_ANCHOR' ||
        p.inputRefs.length === 0 ||
        p.source !== null)
    )
      add(`provenance.${p.ref}`, 'BROKEN_DERIVATION_PROVENANCE');
  }
  const derived: OpeningEconomicDecisionInspection['derivedBank'][number][] =
    [];
  const globalAccounts = new Set<string>(),
    globalClaims = new Set<string>();
  for (const c of d.countries) {
    const cid = c.countryId,
      start = blockers.length,
      s = sources.get(countryId(cid));
    const fail = (field: string, code: string) => add(field, code, cid);
    if (
      c.decisionStatus === 'UNRESOLVED_HUMAN_ECONOMIC_INPUT' ||
      c.fundsModel === null ||
      c.treasuryOpeningBalance === null ||
      (c.fundsModel === 'INDEPENDENT_GENESIS_POOLS' &&
        c.centralBankOpeningBalance === null)
    )
      fail('allocation', 'UNRESOLVED_HUMAN_ECONOMIC_INPUT');
    function valueProof(ref: string, value: string | null, ownerOnly = false) {
      const p = nodes.get(ref);
      if (
        !p ||
        p.value !== value ||
        p.kind === 'PROPOSAL_ONLY' ||
        p.kind === 'AUTHORITATIVE_OPENING_STATE' ||
        !reachable.has(ref) ||
        (ownerOnly &&
          (!adopted ||
            p.kind !== 'OWNER_ADOPTED_VALUE' ||
            p.ownerRecordRef !== adoption?.reference ||
            p.rule !== 'EXPLICIT_OWNER_VALUE' ||
            p.source !== null ||
            p.inputRefs.length === 0))
      )
        fail(ref, 'VALUE_PROVENANCE_NOT_ESTABLISHED');
    }
    for (const f of OPENING_FINANCE_FIELDS) {
      const p = nodes.get(c.fieldProvenance[f]!);
      if (!s || c.sourceFinance[f] !== s.values[f])
        fail(f, 'SOURCE_MUTATION_OR_MISMATCH');
      if (
        !p ||
        p.kind !== 'SOURCE_IMMUTABLE' ||
        p.value !== c.sourceFinance[f] ||
        p.source?.locator !== FINANCE_LOCATOR ||
        p.source.sha256 !== FINANCE_SHA ||
        p.source.pointer !== `${s?.sourceRowPointer}/${f}`
      )
        fail(f, 'BROKEN_SOURCE_PROVENANCE');
    }
    valueProof(
      c.fieldProvenance.treasuryOpeningBalance!,
      c.treasuryOpeningBalance,
      true,
    );
    if (c.fundsModel === 'TREASURY_DEPOSIT_AT_CB') {
      if (c.centralBankOpeningBalance !== null)
        fail(
          'centralBankOpeningBalance',
          'NO_SEPARATE_CASH_POOL_IN_CLAIM_MODEL',
        );
    } else
      valueProof(
        c.fieldProvenance.centralBankOpeningBalance!,
        c.centralBankOpeningBalance,
        true,
      );
    if (c.legalEntities === null) {
      fail('legalEntities', 'UNRESOLVED_LEGAL_ENTITY');
      continue;
    }
    const owners = c.legalEntities;
    if (
      c.fundsModel === 'INDEPENDENT_GENESIS_POOLS' &&
      c.treasuryOpeningBalance !== null &&
      c.centralBankOpeningBalance !== null
    ) {
      if (
        !Money.from(c.treasuryOpeningBalance, 'GCU')
          .add(Money.from(c.centralBankOpeningBalance, 'GCU'))
          .amount.equals(
            Money.from(c.sourceFinance.treasuryCentralBankBalance, 'GCU')
              .amount,
          )
      )
        fail('allocation', 'INDEPENDENT_POOLS_SUM_MISMATCH');
      if (c.treasuryClaim !== null)
        fail('treasuryClaim', 'FUNDS_MODEL_CLAIM_CONFLICT');
    }
    if (c.fundsModel === 'TREASURY_DEPOSIT_AT_CB' && c.treasuryClaim === null)
      fail('treasuryClaim', 'TREASURY_CLAIM_COUNTERPART_MISSING');
    if (c.reserveClaim === null)
      fail('reserveClaim', 'RESERVE_COUNTERPART_MISSING');
    function verifyClaim(
      pair: OpeningClaimPairV1 | null,
      expectedAssetOwner: string,
      purpose: 'RESERVE_CLAIM' | 'TREASURY_CLAIM',
      expectedAmount: string | null,
    ) {
      if (!pair) return;
      if (globalClaims.has(pair.claimId))
        fail(pair.claimId, 'DUPLICATE_MONETARY_CLAIM');
      globalClaims.add(pair.claimId);
      if (
        pair.assetOwnerId !== expectedAssetOwner ||
        pair.liabilityOwnerId !== owners.centralBank ||
        expectedAmount === null ||
        !Money.from(pair.amount, 'GCU').amount.equals(
          Money.from(expectedAmount, 'GCU').amount,
        )
      )
        fail(pair.claimId, 'CLAIM_IDENTITY_AMOUNT_MISMATCH');
      const liabilities = c.centralBankPositions.filter(
        (p) => p.purpose === purpose,
      );
      if (
        liabilities.length !== 1 ||
        liabilities[0]!.accountId !== pair.liabilityAccountId ||
        liabilities[0]!.accountClass !== 'LIABILITY' ||
        liabilities[0]!.claimId !== pair.claimId ||
        liabilities[0]!.counterpartyEntityId !== pair.assetOwnerId ||
        !Money.from(liabilities[0]!.amount, 'GCU').amount.equals(
          Money.from(pair.amount, 'GCU').amount,
        )
      )
        fail(pair.claimId, 'CLAIM_COUNTERPART_MISMATCH');
      valueProof(pair.provenanceRef, pair.amount, true);
      for (const [id, owner, kind, counterparty] of [
        [
          pair.assetAccountId,
          pair.assetOwnerId,
          'ASSET',
          pair.liabilityOwnerId,
        ],
        [
          pair.liabilityAccountId,
          pair.liabilityOwnerId,
          'LIABILITY',
          pair.assetOwnerId,
        ],
      ] as const)
        if (parsedWorld !== null)
          createFinancialAccount({
            worldId: parsedWorld,
            countryId: countryId(cid),
            accountId: financialAccountId(id),
            ownerId: legalEntityId(owner),
            accountClass: kind,
            currency: 'GCU',
            claimId: financialClaimId(pair.claimId),
            counterpartyEntityId: legalEntityId(counterparty),
          });
      if (globalAccounts.has(pair.assetAccountId))
        fail(pair.assetAccountId, 'DUPLICATE_MONETARY_ACCOUNT');
      globalAccounts.add(pair.assetAccountId);
    }
    verifyClaim(
      c.reserveClaim,
      owners.bank,
      'RESERVE_CLAIM',
      c.sourceFinance.bankReserveAssets,
    );
    verifyClaim(
      c.treasuryClaim,
      owners.treasury,
      'TREASURY_CLAIM',
      c.treasuryOpeningBalance,
    );
    if (c.centralBankPositions.length === 0)
      fail('centralBankPositions', 'CENTRAL_BANK_COMPLETE_SHEET_MISSING');
    let assets = Money.from('0', 'GCU'),
      liabilities = Money.from('0', 'GCU'),
      equity = Money.from('0', 'GCU');
    for (const p of c.centralBankPositions) {
      if (globalAccounts.has(p.accountId))
        fail(p.accountId, 'DUPLICATE_MONETARY_ACCOUNT');
      globalAccounts.add(p.accountId);
      if (parsedWorld !== null)
        createFinancialAccount({
          worldId: parsedWorld,
          countryId: countryId(cid),
          accountId: financialAccountId(p.accountId),
          ownerId: legalEntityId(owners.centralBank),
          accountClass: p.accountClass,
          currency: 'GCU',
          claimId: p.claimId === null ? null : financialClaimId(p.claimId),
          counterpartyEntityId:
            p.counterpartyEntityId === null
              ? null
              : legalEntityId(p.counterpartyEntityId),
        });
      valueProof(p.provenanceRef, p.amount, true);
      if (
        p.purpose === 'RESERVE_CLAIM' &&
        (p.accountClass !== 'LIABILITY' ||
          p.claimId !== c.reserveClaim?.claimId)
      )
        fail(p.accountId, 'RESERVE_IS_NOT_BACKING_CASH');
      if (
        p.purpose === 'TREASURY_CLAIM' &&
        (p.accountClass !== 'LIABILITY' ||
          p.claimId !== c.treasuryClaim?.claimId)
      )
        fail(p.accountId, 'TREASURY_IS_NOT_SECOND_CASH');
      if (
        p.accountClass === 'ASSET' &&
        (p.claimId === c.reserveClaim?.claimId ||
          p.claimId === c.treasuryClaim?.claimId)
      )
        fail(p.accountId, 'DUPLICATED_CLAIM_AS_BACKING');
      if (
        p.purpose === 'GENESIS_POOL' &&
        (c.fundsModel !== 'INDEPENDENT_GENESIS_POOLS' ||
          p.accountClass !== 'ASSET' ||
          p.claimId !== null ||
          c.centralBankOpeningBalance === null ||
          !Money.from(p.amount, 'GCU').amount.equals(
            Money.from(c.centralBankOpeningBalance, 'GCU').amount,
          ))
      )
        fail(p.accountId, 'GENESIS_POOL_BINDING_MISMATCH');
      const m = Money.from(p.amount, 'GCU');
      if (p.accountClass === 'ASSET') assets = assets.add(m);
      else if (p.accountClass === 'LIABILITY') liabilities = liabilities.add(m);
      else equity = equity.add(m);
    }
    if (
      c.fundsModel === 'INDEPENDENT_GENESIS_POOLS' &&
      c.centralBankPositions.filter((p) => p.purpose === 'GENESIS_POOL')
        .length !== 1
    )
      fail(
        'centralBankOpeningBalance',
        'GENESIS_POOL_POSITION_MISSING_OR_DUPLICATED',
      );
    if (!assets.amount.equals(liabilities.add(equity).amount))
      fail('centralBankPositions', 'CENTRAL_BANK_UNBALANCED');
    if (
      adopted &&
      Object.values(d.rules).every((v) => v !== null) &&
      blockers.length === start
    ) {
      const L = Money.from(c.sourceFinance.householdBankDeposits, 'GCU').add(
        Money.from(c.sourceFinance.businessBankDeposits, 'GCU'),
      );
      const E = Money.from(c.sourceFinance.bankReserveAssets, 'GCU')
        .add(Money.from(c.sourceFinance.bankLoanAssets, 'GCU'))
        .subtract(L);
      derived.push({
        countryId: cid,
        bankDepositLiabilities: L.toCanonicalValue().amount,
        bankEquity: E.toCanonicalValue().amount,
        provenance: 'DERIVED_BY_ADOPTED_RULE',
        rule: 'E_COMPONENT_ANCHOR',
        inputRefs: [
          'householdBankDeposits',
          'businessBankDeposits',
          'bankReserveAssets',
          'bankLoanAssets',
        ].map((f) => c.fieldProvenance[f]!),
        ownerRecordRef: adoption!.reference,
        proposalSha256: d.proposal.proposalSha256,
        transformationVersion: d.rules.transformationVersion!,
      });
    }
  }
  blockers.sort((a, b) =>
    canonicalSerialize(a).localeCompare(canonicalSerialize(b), 'en'),
  );
  return freeze({
    status: blockers.length === 0 ? 'DECISION_VALIDATED_NOT_SEED' : 'BLOCKED',
    candidate,
    blockers,
    derivedBank: blockers.length === 0 ? derived : [],
    openingAdmissionAllowed: false,
  });
}
