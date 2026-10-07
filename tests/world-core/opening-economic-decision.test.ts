import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalHashInput, canonicalSha256 } from '@econmind/core';
import {
  FIXED_OPENING_PROPOSAL_E,
  OPENING_ECONOMIC_DECISION_SCHEMA,
  OPENING_FINANCE_FIELDS,
  parseOpeningEconomicDecision,
  inspectOpeningEconomicDecision,
  type OpeningEconomicDecisionV1,
  type TrustedOpeningDecisionInputs,
} from '../../apps/world-worker/src/preparation/opening-economic-decision.js';

// Mechanism fixture only. This does NOT manufacture real human approval,
// official source readiness, opening state or an execution authorization.
const ref = `git:${'a'.repeat(40)}:status/decisions.json#/opening_economics/INERT_TEST`;
const sourceValues = {
  treasuryCentralBankBalance: '100',
  householdBankDeposits: '9',
  businessBankDeposits: '3',
  bankReserveAssets: '20',
  bankLoanAssets: '0',
  bankDepositLiabilities: '12.000003',
  bankEquity: '7.999997',
};
const fingerprint = (v: unknown) =>
  canonicalSha256(canonicalHashInput(v), (s) =>
    createHash('sha256').update(s).digest('hex'),
  );
function fixture() {
  const sourceNodes = OPENING_FINANCE_FIELDS.map((f, i) => ({
    ref: `SOURCE_${i}`,
    kind: 'SOURCE_IMMUTABLE',
    value: sourceValues[f],
    inputRefs: [],
    rule: null,
    ownerRecordRef: null,
    source: {
      locator: 'artifacts/world-balanced-candidate-v1/data/finance.json',
      sha256:
        '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
      pointer: `/0/${f}`,
    },
  }));
  const adopted = (name: string, value: string, sourceRef = 'SOURCE_0') => ({
    ref: name,
    kind: 'OWNER_ADOPTED_VALUE',
    value,
    inputRefs: [sourceRef],
    rule: 'EXPLICIT_OWNER_VALUE',
    ownerRecordRef: ref,
    source: null,
  });
  const fields = Object.fromEntries(
    OPENING_FINANCE_FIELDS.map((f, i) => [f, `SOURCE_${i}`]),
  );
  const decision = {
    schemaVersion: OPENING_ECONOMIC_DECISION_SCHEMA,
    decisionVersion: 'INERT_DECISION_V1',
    proposal: FIXED_OPENING_PROPOSAL_E,
    sourceMutationAllowed: false,
    effectiveScope: {
      worldId: 'WORLD_INERT',
      modelVersion: 'model-v1',
      orchestratorVersion: 'orch-v1',
      sourcePackageId: 'BALANCED_2026_09_28_V1',
      sourceChecksumsSha256:
        '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
    },
    rules: {
      currency: 'EXACT_1_TO_1_GCU',
      legalOwnership: 'E_FIXED_ROSTER_TITLE_RISK',
      bankReconciliation: 'E_COMPONENT_ANCHOR',
      reserve: 'BANK_ASSET_CB_LIABILITY_SAME_CLAIM',
      transformationVersion: 'INERT_TRANSFORMATION_V1',
    },
    ownerAdoption: null,
    countries: [
      {
        countryId: 'COUNTRY_01',
        decisionStatus: 'OWNER_ADOPTION_REQUESTED',
        sourceFinance: { ...sourceValues },
        legalEntities: {
          treasury: 'ENTITY_TREASURY',
          centralBank: 'ENTITY_CB',
          bank: 'ENTITY_BANK',
        },
        fundsModel: 'INDEPENDENT_GENESIS_POOLS',
        treasuryOpeningBalance: '30',
        centralBankOpeningBalance: '70',
        reserveClaim: {
          claimId: 'CLAIM_RESERVE',
          amount: '20',
          assetAccountId: 'BANK_RESERVE',
          liabilityAccountId: 'CB_RESERVE',
          assetOwnerId: 'ENTITY_BANK',
          liabilityOwnerId: 'ENTITY_CB',
          provenanceRef: 'ADOPTED_RESERVE',
        },
        treasuryClaim: null,
        centralBankPositions: [
          {
            accountId: 'CB_POOL',
            accountClass: 'ASSET',
            purpose: 'GENESIS_POOL',
            amount: '70',
            claimId: null,
            counterpartyEntityId: null,
            provenanceRef: 'ADOPTED_CB',
          },
          {
            accountId: 'CB_RESERVE',
            accountClass: 'LIABILITY',
            purpose: 'RESERVE_CLAIM',
            amount: '20',
            claimId: 'CLAIM_RESERVE',
            counterpartyEntityId: 'ENTITY_BANK',
            provenanceRef: 'ADOPTED_RESERVE',
          },
          {
            accountId: 'CB_CAPITAL',
            accountClass: 'EQUITY',
            purpose: 'EXPLICIT_ADOPTED_POSITION',
            amount: '50',
            claimId: null,
            counterpartyEntityId: null,
            provenanceRef: 'ADOPTED_CAPITAL',
          },
        ],
        fieldProvenance: {
          ...fields,
          treasuryOpeningBalance: 'ADOPTED_TREASURY',
          centralBankOpeningBalance: 'ADOPTED_CB',
        },
      },
    ],
    provenance: [
      ...sourceNodes,
      adopted('ADOPTED_TREASURY', '30'),
      adopted('ADOPTED_CB', '70'),
      adopted('ADOPTED_RESERVE', '20', 'SOURCE_3'),
      adopted('ADOPTED_CAPITAL', '50'),
    ],
  };
  const trusted = {
    source: {
      sourcePackageId: 'BALANCED_2026_09_28_V1',
      sourceChecksumsSha256:
        '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
      financeSha256:
        '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
      finance: [
        {
          countryId: 'COUNTRY_01',
          sourceRowPointer: '/0',
          values: { ...sourceValues },
        },
      ],
    },
    ownerRecords: [],
  };
  return {
    decision: JSON.parse(JSON.stringify(decision)) as MutableDecision,
    trusted: trusted as MutableTrusted,
  };
}
type Mutable<T> = T extends string
  ? string
  : T extends boolean
    ? boolean
    : T extends readonly (infer E)[]
      ? Mutable<E>[]
      : T extends object
        ? { -readonly [K in keyof T]: Mutable<T[K]> }
        : T;
// Widen literals only for malformed-input tests; production input stays strict.
type MutableDecision = Mutable<OpeningEconomicDecisionV1> &
  Record<string, unknown>;
type MutableTrusted = Omit<
  Mutable<TrustedOpeningDecisionInputs>,
  'ownerRecords'
> & {
  ownerRecords: { reference: string; record: Record<string, unknown> }[];
};
function adopt(f: ReturnType<typeof fixture>) {
  const record = {
    schemaVersion: 'opening-owner-adoption-record-v1',
    decision: 'ADOPT',
    ownerIdentity: 'INERT_OWNER_NOT_A_REAL_APPROVAL',
    adoptedAtReal: '2026-10-07T00:00:00.000Z',
    effectiveScope: f.decision.effectiveScope,
    proposalSha256: FIXED_OPENING_PROPOSAL_E.proposalSha256,
    intentFingerprint: parseOpeningEconomicDecision(f.decision)
      .intentFingerprint,
  };
  f.decision.ownerAdoption = {
    reference: ref,
    recordFingerprint: fingerprint(record),
  };
  f.trusted.ownerRecords = [{ reference: ref, record }];
  return f;
}
function inspect(f: ReturnType<typeof fixture>) {
  return inspectOpeningEconomicDecision(f);
}
const codes = (f: ReturnType<typeof fixture>) =>
  inspect(f).blockers.map((b) => b.code);

describe('opening economic decision source-only authority contract', () => {
  it('raw source decimal lexeme is retained rather than confused with Core canonical output', () => {
    const f = fixture();
    f.decision.countries[0]!.sourceFinance.householdBankDeposits = '9.0';
    f.trusted.source.finance[0]!.values.householdBankDeposits = '9.0';
    f.decision.provenance.find((p) => p.ref === 'SOURCE_1')!.value = '9.0';
    adopt(f);
    const r = inspect(f);
    expect(r.blockers).toEqual([]);
    expect(
      r.candidate.body.countries[0]!.sourceFinance.householdBankDeposits,
    ).toBe('9.0');
    expect(r.derivedBank[0]!.bankDepositLiabilities).toBe('12');
  });
  it('missing formal World binding remains null and blocked, even in an adopted mechanism fixture', () => {
    const f = fixture();
    f.decision.effectiveScope.worldId = null;
    adopt(f);
    const r = inspect(f);
    expect(r.candidate.body.effectiveScope.worldId).toBeNull();
    expect(codes(f)).toContain('WORLD_ID_BINDING_REQUIRED');
    expect(r.derivedBank).toEqual([]);
  });
  it('parse/hash alone is untrusted and no owner record yields no derivation/admission', () => {
    const f = fixture(),
      parsed = parseOpeningEconomicDecision(f.decision);
    expect(parsed.status).toBe('UNTRUSTED_DECISION_CANDIDATE');
    expect(Object.isFrozen(parsed.body.countries)).toBe(true);
    const r = inspect(f);
    expect(r.status).toBe('BLOCKED');
    expect(r.derivedBank).toEqual([]);
    expect(r.openingAdmissionAllowed).toBe(false);
    expect(codes(f)).toContain('OWNER_ADOPTION_RECORD_MISSING');
  });
  it('validated owner-record mechanism derives exact L/E but never creates a seed/state', () => {
    const f = adopt(fixture()),
      r = inspect(f);
    expect(r.blockers).toEqual([]);
    expect(r.status).toBe('DECISION_VALIDATED_NOT_SEED');
    expect(r.openingAdmissionAllowed).toBe(false);
    expect(r.derivedBank[0]).toMatchObject({
      bankDepositLiabilities: '12',
      bankEquity: '8',
      provenance: 'DERIVED_BY_ADOPTED_RULE',
      ownerRecordRef: ref,
      proposalSha256: FIXED_OPENING_PROPOSAL_E.proposalSha256,
    });
    expect(
      r.candidate.body.countries[0]!.sourceFinance.bankDepositLiabilities,
    ).toBe('12.000003');
  });
  it('caller boolean/name/hash/reference cannot stand in for independent trusted records', () => {
    const f = adopt(fixture());
    f.trusted.ownerRecords = [];
    expect(codes(f)).toContain('TRUSTED_OWNER_RECORD_MISSING_OR_AMBIGUOUS');
    f.decision.ownerApproved = true;
    expect(() => inspect(f)).toThrow();
    delete f.decision.ownerApproved;
    f.decision.ownerAdoption!.reference = 'OWNER_SAID_YES';
    expect(() => inspect(f)).toThrow();
  });
  it('owner record must bind exact intent, source, World/model, proposal and timestamp', () => {
    for (const field of [
      'intentFingerprint',
      'proposalSha256',
      'decision',
      'adoptedAtReal',
    ]) {
      const f = adopt(fixture());
      f.trusted.ownerRecords[0]!.record[field] = 'INVALID';
      expect(codes(f)).toContain('OWNER_RECORD_SCOPE_OR_CONTENT_MISMATCH');
    }
    const f = adopt(fixture());
    f.decision.effectiveScope.worldId = 'WORLD_OTHER';
    expect(codes(f)).toContain('OWNER_RECORD_SCOPE_OR_CONTENT_MISMATCH');
  });
  it('unknown allocation stays null/unresolved, never filled with 0', () => {
    const f = fixture();
    f.decision.countries[0]!.decisionStatus = 'UNRESOLVED_HUMAN_ECONOMIC_INPUT';
    f.decision.countries[0]!.treasuryOpeningBalance = null;
    f.decision.countries[0]!.centralBankOpeningBalance = null;
    const r = inspect(f);
    expect(
      r.blockers.some((b) => b.code === 'UNRESOLVED_HUMAN_ECONOMIC_INPUT'),
    ).toBe(true);
    expect(r.candidate.body.countries[0]!.treasuryOpeningBalance).toBeNull();
  });
  it('only independent pools apply exact T+C=B; tiny mismatch has no tolerance', () => {
    const f = fixture();
    f.decision.countries[0]!.centralBankOpeningBalance = '70.000000000000001';
    f.decision.provenance.find((p) => p.ref === 'ADOPTED_CB')!.value =
      '70.000000000000001';
    adopt(f);
    expect(codes(f)).toContain('INDEPENDENT_POOLS_SUM_MISMATCH');
  });
  it('Treasury CB-deposit uses one claim, not a second C cash pool or T+C=B', () => {
    const f = fixture(),
      c = f.decision.countries[0]!;
    c.fundsModel = 'TREASURY_DEPOSIT_AT_CB';
    c.treasuryOpeningBalance = '100';
    c.centralBankOpeningBalance = null;
    f.decision.provenance.find((p) => p.ref === 'ADOPTED_TREASURY')!.value =
      '100';
    f.decision.provenance.find((p) => p.ref === 'ADOPTED_CB')!.value = null;
    c.treasuryClaim = {
      claimId: 'CLAIM_TREASURY',
      amount: '100',
      assetAccountId: 'TREASURY_DEPOSIT',
      liabilityAccountId: 'CB_TREASURY',
      assetOwnerId: 'ENTITY_TREASURY',
      liabilityOwnerId: 'ENTITY_CB',
      provenanceRef: 'ADOPTED_TREASURY',
    };
    c.centralBankPositions[0]!.purpose = 'EXPLICIT_ADOPTED_POSITION';
    c.centralBankPositions[0]!.amount = '170';
    c.centralBankPositions[0]!.provenanceRef = 'ADOPTED_BACKING';
    f.decision.provenance.push({
      ref: 'ADOPTED_BACKING',
      kind: 'OWNER_ADOPTED_VALUE',
      value: '170',
      inputRefs: ['SOURCE_0'],
      rule: 'EXPLICIT_OWNER_VALUE',
      ownerRecordRef: ref,
      source: null,
    });
    c.centralBankPositions.push({
      accountId: 'CB_TREASURY',
      accountClass: 'LIABILITY',
      purpose: 'TREASURY_CLAIM',
      amount: '100',
      claimId: 'CLAIM_TREASURY',
      counterpartyEntityId: 'ENTITY_TREASURY',
      provenanceRef: 'ADOPTED_TREASURY',
    });
    adopt(f);
    const r = inspect(f);
    expect(r.blockers).toEqual([]);
    expect(r.status).toBe('DECISION_VALIDATED_NOT_SEED');
    expect(r.openingAdmissionAllowed).toBe(false);
    c.centralBankOpeningBalance = '70';
    adopt(f);
    expect(codes(f)).toContain('NO_SEPARATE_CASH_POOL_IN_CLAIM_MODEL');
  });
  it('missing/wrong reserve counterpart fails closed', () => {
    const a = fixture();
    a.decision.countries[0]!.reserveClaim = null;
    adopt(a);
    expect(codes(a)).toContain('RESERVE_COUNTERPART_MISSING');
    const b = fixture();
    b.decision.countries[0]!.centralBankPositions[1]!.claimId =
      'CLAIM_DIFFERENT';
    adopt(b);
    expect(codes(b)).toContain('CLAIM_COUNTERPART_MISMATCH');
  });
  it('reserves cannot become a second CB asset/backing claim', () => {
    const f = fixture(),
      c = f.decision.countries[0]!;
    c.centralBankPositions.push({
      ...c.centralBankPositions[1]!,
      accountId: 'CB_FALSE_BACKING',
      accountClass: 'ASSET',
      purpose: 'EXPLICIT_ADOPTED_POSITION',
    });
    adopt(f);
    expect(codes(f)).toContain('DUPLICATED_CLAIM_AS_BACKING');
  });
  it('complete CB balance sheet must be present and exact, without adjustment plugs', () => {
    const a = fixture();
    a.decision.countries[0]!.centralBankPositions = [];
    adopt(a);
    expect(codes(a)).toContain('CENTRAL_BANK_COMPLETE_SHEET_MISSING');
    const b = fixture();
    b.decision.countries[0]!.centralBankPositions.pop();
    adopt(b);
    expect(codes(b)).toContain('CENTRAL_BANK_UNBALANCED');
    const c = fixture();
    c.decision.countries[0]!.centralBankPositions[2]!.purpose =
      'BALANCING_PLUG';
    expect(() => inspect(c)).toThrow();
  });
  it('source lexemes/identities cannot mutate even if a new owner intent is supplied', () => {
    const a = fixture();
    a.decision.countries[0]!.sourceFinance.bankEquity = '8';
    adopt(a);
    expect(codes(a)).toContain('SOURCE_MUTATION_OR_MISMATCH');
    const b = fixture();
    b.decision.sourceMutationAllowed = true;
    expect(() => inspect(b)).toThrow();
    const c = fixture();
    c.decision.provenance[0]!.source!.sha256 = '0'.repeat(64);
    adopt(c);
    expect(codes(c)).toContain('SOURCE_FIELD_IDENTITY_MISMATCH');
  });
  it('only exact fixed E proposal/version is accepted; no F/G or automatic new currency rule', () => {
    for (const change of [
      { proposalId: 'F' },
      { proposalSha256: '0'.repeat(64) },
      { proposalVersion: 'NEXT' },
    ]) {
      const f = fixture();
      f.decision.proposal = { ...FIXED_OPENING_PROPOSAL_E, ...change };
      expect(() => inspect(f)).toThrow();
    }
    const f = fixture();
    f.decision.rules.currency = 'ROUND_TO_CENTS';
    expect(() => inspect(f)).toThrow();
  });
  it('provenance cycles, disconnected adopted values and label-only authority reject', () => {
    const a = fixture();
    a.decision.provenance[7]!.inputRefs = ['ADOPTED_TREASURY'];
    adopt(a);
    expect(codes(a)).toContain('BROKEN_PROVENANCE_LINEAGE');
    const b = fixture();
    b.decision.provenance[7]!.inputRefs = [];
    adopt(b);
    expect(codes(b)).toContain('ADOPTED_PROVENANCE_INPUT_MISSING');
    const c = fixture();
    c.decision.provenance[7]!.kind = 'AUTHORITATIVE_OPENING_STATE';
    adopt(c);
    expect(codes(c)).toContain('ACTUAL_ADMISSION_NOT_ESTABLISHED');
    const d = fixture();
    d.decision.provenance[7]!.kind = 'PROPOSAL_ONLY';
    adopt(d);
    expect(codes(d)).toContain('VALUE_PROVENANCE_NOT_ESTABLISHED');
  });
  it('duplicate countries/accounts/claims and missing source coverage reject', () => {
    const a = fixture();
    a.decision.countries.push(a.decision.countries[0]!);
    expect(() => inspect(a)).toThrow();
    const b = fixture();
    b.decision.countries[0]!.centralBankPositions.push(
      b.decision.countries[0]!.centralBankPositions[0]!,
    );
    adopt(b);
    expect(codes(b)).toContain('DUPLICATE_MONETARY_ACCOUNT');
    const c = fixture();
    c.trusted.source.finance = [];
    expect(() => inspect(c)).toThrow();
  });
  it('canonical hashing is deterministic and intent survives adding its exact owner reference', () => {
    const f = fixture(),
      before = parseOpeningEconomicDecision(f.decision);
    adopt(f);
    const after = parseOpeningEconomicDecision(f.decision);
    expect(before.intentFingerprint).toBe(after.intentFingerprint);
    expect(before.fingerprint).not.toBe(after.fingerprint);
    expect(
      parseOpeningEconomicDecision(JSON.parse(JSON.stringify(f.decision)))
        .fingerprint,
    ).toBe(after.fingerprint);
  });
  it('JS-number authority, unknown keys and accessors are rejected before adoption', () => {
    const a = fixture();
    a.decision.countries[0]!.treasuryOpeningBalance = 30 as unknown as string;
    expect(() => inspect(a)).toThrow();
    const b = fixture();
    b.decision.runtimeEnabled = true;
    expect(() => inspect(b)).toThrow();
    const c = fixture();
    let accessed = false;
    Object.defineProperty(c.decision, 'decisionVersion', {
      enumerable: true,
      get() {
        accessed = true;
        return 'BAD';
      },
    });
    expect(() => inspect(c)).toThrow();
    expect(accessed).toBe(false);
  });
});
