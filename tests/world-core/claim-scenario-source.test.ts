import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalSerialize } from '@econmind/core';
import {
  parseClaimScenarioSourceDraft,
  claimSourceHash,
  type ParsedClaimScenarioDraft,
} from '../../apps/world-worker/src/preparation/claim-scenario-source-contract.js';
import {
  produceClaimScenarioSource,
  type ClaimScenarioSourceCandidate,
} from '../../apps/world-worker/src/preparation/claim-scenario-source-producer.js';
import {
  composeClaimScenarioSource,
  calculateClaimScenarioSourceMechanism,
} from '../../apps/world-worker/src/preparation/claim-scenario-source-composition.js';
import type { OwnerNonHostSourceAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import type { FormalFinancialOpeningContract } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  claimScenarioDraftFixture,
  unadoptedClaimSelectionFixture,
  claimAcceptanceVectorData,
  claimBaselineRuleAdoptionFixture,
  claimFinancialBaselineFixture,
} from '../support/claim-scenario-source-fixture.js';

const row = (v: unknown): Record<string, unknown> =>
  v as Record<string, unknown>;
const evidenceSnapshots: Record<string, unknown> = {};
afterAll(() => {
  const directory = process.env.G_CLAIM_SOURCE_EVIDENCE_DIR;
  if (directory)
    writeFileSync(
      path.join(directory, 'SOURCE_OUTPUTS.json'),
      canonicalSerialize(evidenceSnapshots) + '\n',
      { flag: 'wx' },
    );
});
const complete = () =>
  produceClaimScenarioSource(
    parseClaimScenarioSourceDraft(claimScenarioDraftFixture(true)),
    unadoptedClaimSelectionFixture(),
  );
describe('claim scenario source declarations, never authority', () => {
  it('retains incomplete original draft and unknown selection with no assumed absence, zero or actual opening', () => {
    const original = claimScenarioDraftFixture();
    const before = canonicalSerialize(original);
    const result = produceClaimScenarioSource(
      parseClaimScenarioSourceDraft(original),
    );
    evidenceSnapshots.incompleteInput = original;
    evidenceSnapshots.incompleteOutput = result;
    expect(result.status).toBe('DRAFT_INCOMPLETE');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'PRIOR_SELECTION_OR_ADMISSION_UNPROVEN',
        'MATURITY_UNSELECTED',
        'LEGAL_ROLE_SOURCE_UNBOUND',
        'LIFECYCLE_EPOCH_UNBOUND',
        'INACTIVE_OPENING_UNBOUND',
      ]),
    );
    expect(result.sourceAdopted).toBe(false);
    expect(result.sourceCompleteOriginalIds).toEqual([]);
    expect(canonicalSerialize(original)).toBe(before);
  });
  it('explicit complete TEST_ONLY declarations make a source candidate, never verified legal title or funding', () => {
    const result = complete();
    evidenceSnapshots.completeTestOnlyInput = result.draft.input;
    evidenceSnapshots.completeTestOnlyOutput = result;
    expect(result.status).toBe('COMPLETE_SOURCE_CANDIDATE');
    expect(result.draft.input.claims).toHaveLength(4);
    expect(result.draft.input.claims.flatMap((c) => c.mirrors)).toHaveLength(8);
    expect(result.legalTitleVerified).toBe(false);
    expect(result.actualOpeningVerified).toBe(false);
    expect(result.formalPaymentAllowed).toBe(false);
    expect(Object.isFrozen(result.draft.input.claims[0]!.lifecycle)).toBe(true);
  });
  it('canonical bytes are deterministic under object key reordering, preserve references, and snapshot caller mutation', () => {
    const original = claimScenarioDraftFixture(true);
    const reversed = Object.fromEntries(Object.entries(original).reverse());
    const a = parseClaimScenarioSourceDraft(original),
      b = parseClaimScenarioSourceDraft(reversed);
    expect(a.canonicalBytes).toBe(b.canonicalBytes);
    expect(a.fingerprint).toBe(claimSourceHash(a.canonicalBytes));
    original.claims[0]!.principal = 'BAD';
    expect(a.input.claims[0]!.principal).toBe('499500000');
    expect(a.input.claims[0]!.sourceReferences.classification).toBe(
      'TEST_ONLY_NOT_ACTUAL_SOURCE',
    );
  });
  for (const maturity of ['140', '360'])
    it(`explicit ${maturity} calendar stays relative with no derived actual due or Clock`, () => {
      const input = claimScenarioDraftFixture();
      for (const c of input.claims)
        row(row(c.lifecycle).principalDue).selectedRelativeSimDay = maturity;
      const result = produceClaimScenarioSource(
        parseClaimScenarioSourceDraft(input),
      );
      expect(result.status).toBe('DRAFT_INCOMPLETE');
      expect(result.draft.input.inactiveOpening).toBe(null);
      expect(result.sourceBytes).toContain('"actualDue":null');
    });
  const negatives: [
    string,
    (v: ReturnType<typeof claimScenarioDraftFixture>) => void,
  ][] = [
    [
      'foreign selector',
      (v) => {
        v.claims[0]!.originalClaimSelector = 'FOREIGN';
      },
    ],
    [
      'duplicate original ID',
      (v) => {
        v.originalStableIdLinks[0] = v.originalStableIdLinks[1]!;
      },
    ],
    [
      'foreign original ID',
      (v) => {
        v.originalStableIdLinks[0] = 'OTHER';
      },
    ],
    [
      'principal changed',
      (v) => {
        v.claims[0]!.principal = '0';
      },
    ],
    [
      'new default zero principal',
      (v) => {
        v.claims[0]!.principal = 0;
      },
    ],
    [
      'currency relabelled',
      (v) => {
        v.claims[0]!.currency = 'XAA';
      },
    ],
    [
      'same financialClaimId',
      (v) => {
        v.claims[1]!.financialClaimId = v.claims[0]!.financialClaimId;
      },
    ],
    [
      'role reversed',
      (v) => {
        row(v.claims[0]!.legalIssuer).entityId = 'ENTITY_CENTRAL_BANK_24';
      },
    ],
    [
      'D48 legal source promotion',
      (v) => {
        row(v.claims[0]!.legalIssuer).proof = { reference: 'D48_NOT_ADOPTION' };
      },
    ],
    [
      'Day0 principal',
      (v) => {
        row(row(v.claims[0]!.lifecycle).principalDue).selectedRelativeSimDay =
          '0';
      },
    ],
    [
      'Day0 annual coupon',
      (v) => {
        row(row(v.claims[0]!.lifecycle).annualCoupon).fraction = '0.05';
        row(row(v.claims[0]!.lifecycle).firstCouponDue).relativeSimDay = '0';
      },
    ],
    [
      'year used as arbitrary daycount',
      (v) => {
        row(
          row(v.claims[0]!.lifecycle).interestDayCount,
        ).simulationDaysPerYear = '140';
      },
    ],
    [
      'missing fee rule',
      (v) => {
        delete row(v.claims[0]!.lifecycle).fees;
      },
    ],
    [
      'admin free debt substitution',
      (v) => {
        row(row(v.claims[0]!.lifecycle).fees).freeAdminScopeCoversDebtFxRefund =
          true;
      },
    ],
    [
      'unexecuted intent refunds',
      (v) => {
        row(
          row(v.claims[0]!.lifecycle).refundAndCorrection,
        ).unexecutedIntentCreatesRefund = true;
      },
    ],
    [
      'default seizure',
      (v) => {
        row(row(v.claims[0]!.lifecycle).defaultResolution).automaticSeizure =
          true;
      },
    ],
    [
      'wrong opening epoch',
      (v) => {
        v.inactiveOpening!.openingEpoch = 'OTHER_EPOCH';
      },
    ],
    [
      'invalid value date',
      (v) => {
        v.inactiveOpening!.valueDate = '2026-02-30';
      },
    ],
    [
      'advanced opening',
      (v) => {
        v.inactiveOpening!.openingWorldVersion = '1';
      },
    ],
    [
      'wrong replay model',
      (v) => {
        v.inactiveOpening!.modelVersion = 'FOREIGN_MODEL';
      },
    ],
    [
      'mirror amount',
      (v) => {
        row((v.claims[0]!.mirrors as unknown[])[1]).amount = '499500001';
      },
    ],
    [
      'two liabilities',
      (v) => {
        row((v.claims[0]!.mirrors as unknown[])[1]).role = 'LIABILITY';
      },
    ],
    [
      'historical field injection',
      (v) => {
        v.claims[0]!.historicalNativeCurrency = 'GCU';
      },
    ],
    [
      'approval boolean',
      (v) => {
        Object.assign(v, { ownerApproved: true });
      },
    ],
  ];
  for (const [name, mutate] of negatives)
    it(`rejects ${name} without mutating input or returning a successful prefix`, () => {
      const input = claimScenarioDraftFixture(true);
      mutate(input);
      const before = JSON.stringify(input);
      expect(() => parseClaimScenarioSourceDraft(input)).toThrow();
      expect(JSON.stringify(input)).toBe(before);
    });
  it('fourth claim failure returns no partial source or mutation', () => {
    const input = claimScenarioDraftFixture(true);
    row((input.claims[3]!.mirrors as unknown[])[1]).amount = '149850001';
    let output: ClaimScenarioSourceCandidate | null = null;
    expect(() => {
      output = produceClaimScenarioSource(parseClaimScenarioSourceDraft(input));
    }).toThrow();
    expect(output).toBe(null);
  });
  it('keeps null late/refund policies incomplete instead of inferring zero or no refund', () => {
    const input = claimScenarioDraftFixture(true);
    row(input.claims[0]!.lifecycle).lateRate = null;
    row(input.claims[0]!.lifecycle).refundAndCorrection = null;
    expect(
      produceClaimScenarioSource(
        parseClaimScenarioSourceDraft(input),
        unadoptedClaimSelectionFixture(),
      ).status,
    ).toBe('DRAFT_INCOMPLETE');
  });
  it('refuses Proxy, accessor, cyclic, sparse, over-budget and executable values without invoking behavior', () => {
    let calls = 0;
    const proxy = new Proxy(
      {},
      {
        get() {
          calls++;
          throw new Error('trap');
        },
        ownKeys() {
          calls++;
          throw new Error('trap');
        },
      },
    );
    const accessor = {
      get schemaVersion() {
        calls++;
        return 'x';
      },
    };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const input of [
      proxy,
      accessor,
      cyclic,
      new Array(3),
      { value: 'x'.repeat(262145) },
      {
        f: () => {
          calls++;
        },
      },
    ])
      expect(() => parseClaimScenarioSourceDraft(input)).toThrow();
    expect(calls).toBe(0);
  });
  it('rejects a copied parsed/candidate object instead of importing a serializable authority brand', () => {
    const parsed = parseClaimScenarioSourceDraft(
      claimScenarioDraftFixture(true),
    );
    expect(() =>
      produceClaimScenarioSource({ ...parsed } as ParsedClaimScenarioDraft),
    ).toThrow('PARSED_SOURCE_REQUIRED');
  });
});
describe('immutable source versions and fail-closed selection', () => {
  it('same bytes retry returns identical version, including archived bytes check', () => {
    const source = complete();
    const again = produceClaimScenarioSource(source.draft, {
      status: 'DECLARED_UNADOPTED',
      observedSourceVersion: source.draft.input.sourceVersion,
      observedSourceHash: source.sourceHash,
      existingVersionBytes: source.sourceBytes,
    });
    expect(again.disposition).toBe('IDENTICAL_CANDIDATE_RETRY');
    expect(again.sourceBytes).toBe(source.sourceBytes);
  });
  it('different bytes under same version conflict, preserving original bytes', () => {
    const source = complete(),
      changed = claimScenarioDraftFixture(true);
    row(row(changed.claims[0]!.lifecycle).principalDue).selectedRelativeSimDay =
      '360';
    expect(() =>
      produceClaimScenarioSource(parseClaimScenarioSourceDraft(changed), {
        status: 'DECLARED_UNADOPTED',
        observedSourceVersion: source.draft.input.sourceVersion,
        observedSourceHash: source.sourceHash,
        existingVersionBytes: source.sourceBytes,
      }),
    ).toThrow('IMMUTABLE_VERSION_CONFLICT');
    expect(source.draft.input.claims[0]!.lifecycle.principalDue).toMatchObject({
      selectedRelativeSimDay: '140',
    });
  });
  it('explicit predecessor enables only a separate unadopted candidate, mismatch and changed archive reject', () => {
    const source = complete(),
      revised = claimScenarioDraftFixture(true);
    revised.sourceVersion = 'TEST_ONLY_V2';
    revised.previousVersionHash = source.sourceHash;
    const observation = {
      status: 'DECLARED_UNADOPTED',
      observedSourceVersion: source.draft.input.sourceVersion,
      observedSourceHash: source.sourceHash,
      existingVersionBytes: source.sourceBytes,
    };
    expect(
      produceClaimScenarioSource(
        parseClaimScenarioSourceDraft(revised),
        observation,
      ).sourceAdopted,
    ).toBe(false);
    revised.previousVersionHash = '0'.repeat(64);
    expect(() =>
      produceClaimScenarioSource(
        parseClaimScenarioSourceDraft(revised),
        observation,
      ),
    ).toThrow('EXPLICIT_PREDECESSOR_REQUIRED');
    expect(() =>
      produceClaimScenarioSource(source.draft, {
        ...observation,
        existingVersionBytes: source.sourceBytes + ' ',
      }),
    ).toThrow('VERSION_BYTES_HASH_MISMATCH');
  });
  for (const status of ['ADMITTED', 'ACTIVATED', 'POSTED'])
    it(`refuses ${status} predecessor with no governed change or rebootstrap`, () => {
      expect(() =>
        produceClaimScenarioSource(complete().draft, {
          ...unadoptedClaimSelectionFixture(),
          status,
        }),
      ).toThrow('EXISTING_ADMITTED_CLAIM_REQUIRES_SEPARATE_GOVERNED_CHANGE');
    });
});
describe('actual economic adoption remains unavailable for every original vector', () => {
  for (const vector of claimAcceptanceVectorData().vectors)
    it(`actual ${vector.id}: original raw evidence cannot configure trust or permit composition`, () => {
      const before = JSON.stringify(vector.rawInput);
      const result = composeClaimScenarioSource(
        vector.rawInput.candidateInput,
        vector.rawInput.compositionInputs,
        vector.rawInput.serverCompositionInputs,
      );
      expect(result.reason).toBe('APPROVAL_EVIDENCE_UNAVAILABLE');
      expect(result.replacementContract).toBe(null);
      expect(result.actualAdoptionMatched).toBe(false);
      expect(result.formalPaymentAllowed).toBe(false);
      expect(JSON.stringify(vector.rawInput)).toBe(before);
    });
  it('does not even inspect forged records/getters, publish signatures or alleged trusted callbacks', () => {
    let invoked = 0;
    const evil = new Proxy(
      {},
      {
        get() {
          invoked++;
          throw new Error();
        },
        ownKeys() {
          invoked++;
          throw new Error();
        },
      },
    );
    expect(
      composeClaimScenarioSource(evil, () => {
        invoked++;
        return true;
      }),
    ).toMatchObject({ reason: 'APPROVAL_EVIDENCE_UNAVAILABLE', source: null });
    expect(invoked).toBe(0);
  });
});
describe('TEST_ONLY complete financial composition using existing parser and producer', () => {
  let adoption: OwnerNonHostSourceAdoption,
    baseline: FormalFinancialOpeningContract;
  beforeAll(async () => {
    adoption = await claimBaselineRuleAdoptionFixture();
    baseline = claimFinancialBaselineFixture(adoption);
  });
  it('calculates all four paired claims in the complete baseline, retaining every formal blocker and no cash', () => {
    const original = canonicalSerialize(baseline);
    const result = calculateClaimScenarioSourceMechanism({
      classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION',
      source: complete(),
      baseline,
      baselineRuleAdoption: adoption,
    });
    evidenceSnapshots.mechanismInputSource = complete();
    evidenceSnapshots.mechanismInputFinancialBaseline = baseline;
    evidenceSnapshots.mechanismOutput = result;
    expect(result.contract.crossCbClaims).toHaveLength(4);
    expect(
      result.contract.countries.flatMap(
        (c) => c.cbRegister.crossCbMirrors ?? [],
      ),
    ).toHaveLength(8);
    expect(result.calculation.candidate).not.toBe(null);
    expect(result.calculation.candidate!.crossCbClaimEvidence).toHaveLength(4);
    expect(result.calculation.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining([
        'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
        'FORMAL_WORLD_BINDING_UNRESOLVED',
        'MECHANISM_VECTOR_NOT_FORMAL_SOURCE',
      ]),
    );
    expect(result.Fcash).toBe(null);
    expect(result.actualAdoptionMatched).toBe(false);
    expect(result.formalPaymentAllowed).toBe(false);
    expect(result.calculation.seed).toBe(null);
    expect(canonicalSerialize(baseline)).toBe(original);
    expect(composeClaimScenarioSource(result)).toMatchObject({
      actualAdoptionMatched: false,
      reason: 'APPROVAL_EVIDENCE_UNAVAILABLE',
    });
  });
  it('rejects copy/retarget/opening mismatch and composition failure with no replacement contract or baseline mutation', () => {
    const original = canonicalSerialize(baseline);
    let output: unknown = null;
    const source = complete();
    expect(() =>
      calculateClaimScenarioSourceMechanism({
        classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION',
        source: { ...source },
        baseline,
        baselineRuleAdoption: adoption,
      }),
    ).toThrow('MECHANISM_INPUT_REQUIRED');
    const draft = claimScenarioDraftFixture(true);
    draft.inactiveOpening!.worldId = 'OTHER_WORLD';
    expect(() => {
      output = calculateClaimScenarioSourceMechanism({
        classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION',
        source: produceClaimScenarioSource(
          parseClaimScenarioSourceDraft(draft),
          unadoptedClaimSelectionFixture(),
        ),
        baseline,
        baselineRuleAdoption: adoption,
      });
    }).toThrow('OPENING_BASELINE_MISMATCH');
    expect(output).toBe(null);
    expect(canonicalSerialize(baseline)).toBe(original);
  });
  it('existing financial parser rejects a source holding conflict after preparation, leaving no partial result or baseline change', () => {
    const original = canonicalSerialize(baseline);
    const draft = claimScenarioDraftFixture(true);
    row((draft.claims[0]!.mirrors as unknown[])[0]).holdingId =
      'TEST_H_COUNTRY_09_TREASURY_GOVERNMENT_DEPOSIT';
    const source = produceClaimScenarioSource(
      parseClaimScenarioSourceDraft(draft),
      unadoptedClaimSelectionFixture(),
    );
    let output: unknown = null;
    expect(() => {
      output = calculateClaimScenarioSourceMechanism({
        classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION',
        source,
        baseline,
        baselineRuleAdoption: adoption,
      });
    }).toThrow();
    expect(output).toBe(null);
    expect(canonicalSerialize(baseline)).toBe(original);
  });
});
