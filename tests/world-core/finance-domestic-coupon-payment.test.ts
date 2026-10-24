import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  DOMESTIC_COUPON_MECHANISM,
  Money,
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  countryId,
  worldId,
  legalEntityId,
  financialAccountId,
  financialClaimId,
  financialOpeningBatchId,
  financialOpeningLegId,
  openingSeedId,
  openingSourceId,
  createFinancialAccount,
  createOpeningSeed,
  createOpeningSource,
  parseCanonicalCommand,
  parseDomesticCouponIntent,
  prepareDomesticCouponPayment,
  rebuildV08LedgersFromLineage,
  type DomesticCouponFacts,
  type DomesticCouponAccountRole,
  type FinancialAccount,
  type FinancialAccountClass,
  type FinancialLedgerState,
} from '@econmind/core';
import {
  exactDecimalAdd,
  exactDecimalSubtract,
} from '../../packages/testkit/src/exact-decimal-oracle.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const WORLD = worldId('TEST_ONLY_WORLD_COUPON');
const COUNTRY = countryId('TEST_ONLY_COUNTRY_COUPON');
const GOV = legalEntityId('TEST_ONLY_GOV_COUPON');
const CB = legalEntityId('TEST_ONLY_CB_COUPON');
const CURRENCY = 'XZZ';
const AT = '2026-10-23T00:00:00.000Z';
type Writable<T> = T extends string | number | boolean | null
  ? T
  : T extends readonly (infer V)[]
    ? Writable<V>[]
    : { -readonly [K in keyof T]: Writable<T[K]> };

function commandFor(
  facts: DomesticCouponFacts,
  options: {
    id?: string;
    payload?: Record<string, unknown>;
    office?: string;
    family?: string;
  } = {},
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: WORLD,
      actorId: 'TEST_ONLY_ACTOR_COUPON',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: COUNTRY,
      officeId: options.office ?? 'FINANCE',
      commandType: options.family ?? DOMESTIC_COUPON_MECHANISM,
      commandId: options.id ?? 'TEST_ONLY_COMMAND_COUPON',
      idempotencyKey: 'TEST_ONLY_IDEMPOTENCY_COUPON',
      expectedWorldVersion: facts.worldVersion,
      simTime: facts.simTime,
      correlationId: 'TEST_ONLY_CORRELATION_COUPON',
      submittedAtReal: AT,
      payload: {
        schemaVersion: 'domestic-coupon-intent-v1',
        obligationId: facts.scope.obligationId,
        couponComponentId: facts.scope.couponComponentId,
        amount: facts.coupon.outstanding,
        currency: CURRENCY,
        actualEffectivePeriod: facts.scope.actualEffectivePeriod,
        dueSimTime: facts.coupon.dueSimTime,
        sourceHash: canonicalSha256(canonicalHashInput(facts), sha),
        ...options.payload,
      },
    },
    sha,
  );
}

function fixture(
  options: {
    gross?: string;
    amount?: string;
    restricted?: string;
    retained?: string;
    floor?: string;
    tgaClass?: FinancialAccountClass;
    omitCouponPair?: boolean;
  } = {},
) {
  const gross = options.gross ?? '100.000000000000000001';
  const amount = options.amount ?? '30.000000000000000001';
  const restricted = options.restricted ?? '10';
  const retained = options.retained ?? amount;
  const roles = [
    'GOV_TGA_ASSET',
    'GOV_COUPON_PAYABLE',
    'CB_TGA_LIABILITY',
    'CB_COUPON_RECEIVABLE',
  ] as const;
  const roleMap = Object.fromEntries(
    roles.map((role, i) => [
      role,
      createFinancialAccount({
        worldId: WORLD,
        countryId: COUNTRY,
        accountId: financialAccountId(`TEST_ONLY_${role}`),
        ownerId: i < 2 ? GOV : CB,
        counterpartyEntityId: i < 2 ? CB : GOV,
        claimId: financialClaimId(
          i === 0 || i === 2
            ? 'TEST_ONLY_TGA_CLAIM'
            : 'TEST_ONLY_RECOGNIZED_COUPON_CLAIM',
        ),
        currency: CURRENCY,
        accountClass: [
          options.tgaClass ?? 'DEPOSIT',
          'PAYABLE',
          'LIABILITY',
          'RECEIVABLE',
        ][i] as FinancialAccountClass,
      }),
    ]),
  ) as Record<DomesticCouponAccountRole, FinancialAccount>;
  const principal = [GOV, CB].map((ownerId, i) =>
    createFinancialAccount({
      worldId: WORLD,
      countryId: COUNTRY,
      accountId: financialAccountId(`TEST_ONLY_PRINCIPAL_${i}`),
      ownerId,
      counterpartyEntityId: i === 0 ? CB : GOV,
      claimId: financialClaimId('TEST_ONLY_PRINCIPAL_CLAIM'),
      currency: CURRENCY,
      accountClass: i === 0 ? 'PAYABLE' : 'RECEIVABLE',
    }),
  );
  const openingSource = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('TEST_ONLY_COUPON_SOURCE'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/finance-domestic-coupon-payment.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { notice: 'TEST_ONLY_NOT_ADMITTED_NO_REAL_C19_ELIGIBILITY' },
    },
    sha,
  );
  const pairs: {
    accounts: readonly FinancialAccount[];
    directions: readonly ('DEBIT' | 'CREDIT')[];
    amount: string;
  }[] = [
    {
      accounts: [roleMap.GOV_TGA_ASSET, roleMap.CB_TGA_LIABILITY],
      directions: ['DEBIT', 'CREDIT'],
      amount: gross,
    },
    ...(options.omitCouponPair
      ? []
      : [
          {
            accounts: [
              roleMap.GOV_COUPON_PAYABLE,
              roleMap.CB_COUPON_RECEIVABLE,
            ],
            directions: ['CREDIT', 'DEBIT'] as const,
            amount,
          },
        ]),
    { accounts: principal, directions: ['CREDIT', 'DEBIT'], amount: '1000' },
  ];
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('TEST_ONLY_COUPON_SEED'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [openingSource],
      inventoryEntries: [],
      financialBatches: pairs.map((pair, i) => ({
        batchId: financialOpeningBatchId(`TEST_ONLY_OPENING_PAIR_${i}`),
        sourceId: openingSource.sourceId,
        settlementCurrency: CURRENCY,
        legs: pair.accounts.map((account, j) => ({
          legId: financialOpeningLegId(
            `TEST_ONLY_OPENING_${account.accountId}`,
          ),
          account,
          direction: pair.directions[j]!,
          amount: Money.from(pair.amount, CURRENCY),
          counterpartLegId: financialOpeningLegId(
            `TEST_ONLY_OPENING_${pair.accounts[1 - j]!.accountId}`,
          ),
        })),
      })),
    },
    sha,
  );
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    payerEntityId: GOV,
    tgaAccountId: roleMap.GOV_TGA_ASSET.accountId,
    nativeCurrency: CURRENCY,
    actualEffectivePeriod: 'TEST_ONLY_PERIOD_COUPON',
    operationPurpose: 'SETTLE_EXISTING_RECOGNIZED_DUE_COUPON' as const,
    obligationId: 'TEST_ONLY_OBLIGATION_COUPON',
    couponComponentId: 'TEST_ONLY_COMPONENT_COUPON',
  };
  const facts: DomesticCouponFacts = {
    scope,
    centralBankId: CB,
    worldVersion: '0',
    eventSequence: '0',
    simTime: '100',
    sourceRef: 'TEST_ONLY_DECLARED_SOURCE',
    roleMapRef: 'TEST_ONLY_SOURCE_OWNED_ROLE_MAP',
    lineage: {
      status: 'COMPLETE_OPENING_POSTING_DECLARATION',
      reference: 'TEST_ONLY_LINEAGE',
    },
    roleMap,
    coupon: {
      kind: 'COUPON',
      recognition: 'EXISTING_RECOGNIZED',
      recognitionRef: 'TEST_ONLY_RECOGNITION',
      termsRef: 'TEST_ONLY_TERMS',
      claimId: 'TEST_ONLY_RECOGNIZED_COUPON_CLAIM',
      outstanding: amount,
      dueSimTime: '100',
    },
    history: {
      status: 'COMPLETE_DECLARATION',
      reference: 'TEST_ONLY_HISTORY',
      settledComponentIds: [],
      releasedOrReversedComponentIds: [],
    },
    clockBinding: {
      status: 'RUNNING_DECLARATION',
      epochRef: 'TEST_ONLY_EPOCH',
      revisionRef: 'TEST_ONLY_CLOCK_REVISION',
      periodRef: scope.actualEffectivePeriod,
    },
    spendability: {
      status: 'COMPLETE_DISJOINT_DECLARATION',
      partitionRef: 'TEST_ONLY_PARTITION',
      otherRestricted: { shareId: 'TEST_ONLY_OTHER_SHARE', amount: restricted },
      thisCouponRetained: {
        shareId: 'TEST_ONLY_COUPON_SHARE',
        amount: retained,
      },
      unencumbered: {
        shareId: 'TEST_ONLY_FREE_SHARE',
        amount: exactDecimalSubtract(
          exactDecimalSubtract(gross, restricted),
          retained,
        ),
      },
    },
    fee: { kind: 'NOT_APPLICABLE', basisRef: 'TEST_ONLY_FEE_BASIS', scope },
    buffer: {
      kind: 'HARD_MINIMUM',
      amount: options.floor ?? '20',
      basisKind: 'INDEPENDENT_LEGAL_HARD_MINIMUM',
      independentLegalBasisRef: 'TEST_ONLY_HARD_MINIMUM_BASIS',
      adoptionRef: 'TEST_ONLY_INDEPENDENT_ADOPTION',
      scope,
      priority: {
        kind: 'APPLIES_TO_THIS_RECOGNIZED_DUE_COUPON',
        couponComponentId: scope.couponComponentId,
        basisRef: 'TEST_ONLY_PRIORITY_BASIS',
      },
    },
  };
  return {
    facts,
    seed,
    financialState: rebuildV08LedgersFromLineage({ seed, sha256Hex: sha })
      .financial,
  };
}
type Fixture = ReturnType<typeof fixture>;
function run(f: Fixture, command = commandFor(f.facts)) {
  return prepareDomesticCouponPayment({
    command,
    source: { facts: f.facts, financialState: f.financialState },
    recordedAtReal: AT,
    sha256Hex: sha,
  });
}
function altered(
  change: (facts: Writable<DomesticCouponFacts>) => void,
): Fixture {
  const f = fixture(),
    facts = structuredClone(
      f.facts,
    ) as unknown as Writable<DomesticCouponFacts>;
  // Break shared scope aliases: changing a rule scope must not edit base scope.
  facts.fee.scope = structuredClone(facts.scope);
  facts.buffer.scope = structuredClone(facts.scope);
  change(facts);
  return { ...f, facts };
}

describe('unregistered Core-only domestic coupon preparation', () => {
  it('prepares four exact reciprocal legs, no mutation, payment receipt or authority', () => {
    const f = fixture(),
      before = canonicalSerialize(f.financialState),
      result = run(f);
    expect(result.status).toBe('PREPARED_NOT_COMMITTED');
    expect(result.authorityVerified).toBe(false);
    expect(result.sourceAdopted).toBe(false);
    expect(result.actualPayment).toBeNull();
    expect(result).not.toHaveProperty('receipt');
    expect(result).not.toHaveProperty('financialState');
    expect(result.financialBatch.legs).toHaveLength(4);
    expect(result.financialBatch.settlementCurrency).toBe('XZZ');
    expect(result.projection).toMatchObject({
      outstandingAfter: '0',
      tgaAfter: '70',
      otherRestrictedAfter: '10',
      thisCouponRetainedAfter: '0',
      unencumberedAfter: '60',
      principalDelta: '0',
      equityDelta: '0',
    });
    expect(result.projection.accounts.map((a) => a.after)).toEqual([
      '70',
      '0',
      '-70',
      '0',
    ]);
    expect(result.transition.worldVersionBefore).toBe('0');
    expect(result.transition.worldVersionAfter).toBe('1');
    expect(result.transition.events[0]!.sequence).toBe('1');
    const amounts = result.financialBatch.legs.map(
      (l) => l.amount.toCanonicalValue().amount,
    );
    expect(amounts).toEqual(Array(4).fill('30.000000000000000001'));
    for (const owner of [GOV, CB]) {
      const legs = result.financialBatch.legs.filter(
        (l) => l.account.ownerId === owner,
      );
      expect(legs).toHaveLength(2);
      expect(legs.map((l) => l.direction).sort()).toEqual(['CREDIT', 'DEBIT']);
    }
    for (const leg of result.financialBatch.legs) {
      const peer = result.financialBatch.legs.find(
        (l) => l.account.accountId === leg.counterpartyAccountId,
      )!;
      expect(peer.account.claimId).toBe(leg.account.claimId);
      expect(peer.counterpartyAccountId).toBe(leg.account.accountId);
    }
    expect(canonicalSerialize(f.financialState)).toBe(before);
    expect(Object.isFrozen(result.projection.accounts)).toBe(true);
  });
  it('produces deterministic evidence and replays through existing ledger without changing principal', () => {
    const f = fixture(),
      first = run(f),
      second = run(f),
      command = commandFor(f.facts);
    expect(canonicalSerialize(first)).toBe(canonicalSerialize(second));
    const state = rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [
        {
          command,
          transition: first.transition,
          inventoryPostings: [],
          financialPostingBatches: [first.financialBatch],
        },
      ],
      sha256Hex: sha,
    }).financial;
    expect(state.worldVersion).toBe('1');
    for (const a of first.projection.accounts) {
      const p = state.positions.find(
        (p) => p.account.accountId === a.accountId,
      );
      expect(p?.netDebitBalance.toCanonicalValue().amount ?? '0').toBe(a.after);
    }
    expect(
      state.positions
        .filter((p) => p.account.claimId === 'TEST_ONLY_PRINCIPAL_CLAIM')
        .map((p) => p.netDebitBalance.toCanonicalValue().amount)
        .sort(),
    ).toEqual(['-1000', '1000']);
    expect(state.appliedBatches).toHaveLength(1);
  });
  it('consumes only the matched retained portion once, not the mirror or free60 again', () => {
    const result = run(fixture());
    expect(
      exactDecimalAdd(
        result.projection.otherRestrictedAfter,
        result.projection.unencumberedAfter,
      ),
    ).toBe(result.projection.tgaAfter);
    expect(result.projection.unencumberedAfter).toBe('60');
    expect(
      result.financialBatch.legs.some(
        (l) => l.account.accountClass === 'EQUITY',
      ),
    ).toBe(false);
  });
  it('uses free capacity only for a source-declared unretained part', () => {
    const result = run(
      fixture({ gross: '100', amount: '30', restricted: '10', retained: '10' }),
    );
    expect(result.projection.unencumberedAfter).toBe('60');
    expect(result.projection.tgaAfter).toBe('70');
  });
  it('accepts equality to a legitimately applicable declared hard minimum', () => {
    expect(run(fixture({ floor: '60' })).projection.unencumberedAfter).toBe(
      '60',
    );
  });
  it('retains the existing 120-digit exact operand/result domain', () => {
    const amount = '1' + '0'.repeat(119),
      gross = '2' + '0'.repeat(119);
    const result = run(fixture({ amount, gross, restricted: '0', floor: '0' }));
    expect(result.projection.tgaAfter).toBe(amount);
    expect(
      result.financialBatch.legs.every(
        (l) => l.amount.toCanonicalValue().amount === amount,
      ),
    ).toBe(true);
  });
  it('does not silently round an exact result outside the shared domain', () => {
    const amount = '9'.repeat(120);
    expect(() =>
      run(fixture({ amount, gross: amount, restricted: '0', floor: '0' })),
    ).toThrow(/exceeds 120 digits/);
  });
  it.each([
    [
      'unrecognized coupon',
      (f: Writable<DomesticCouponFacts>) => {
        f.coupon.recognition = null;
      },
      /RECOGNIZED_COUPON/,
    ],
    [
      'principal instead of coupon',
      (f: Writable<DomesticCouponFacts>) => {
        f.coupon.kind = 'PRINCIPAL';
      },
      /RECOGNIZED_COUPON/,
    ],
    [
      'incomplete history',
      (f: Writable<DomesticCouponFacts>) => {
        f.history.status = null;
      },
      /UNAVAILABLE_HISTORY/,
    ],
    [
      'same component paid under another command',
      (f: Writable<DomesticCouponFacts>) => {
        f.history.settledComponentIds = [f.scope.couponComponentId];
      },
      /COMPONENT_ALREADY_SETTLED/,
    ],
    [
      'release/reversal not supported',
      (f: Writable<DomesticCouponFacts>) => {
        f.history.releasedOrReversedComponentIds = [f.scope.couponComponentId];
      },
      /UNSUPPORTED_RELEASE_OR_REVERSAL/,
    ],
    [
      'duplicate history IDs',
      (f: Writable<DomesticCouponFacts>) => {
        f.history.settledComponentIds = ['TEST_ONLY_OTHER', 'TEST_ONLY_OTHER'];
      },
      /INVALID_COMPONENT_HISTORY/,
    ],
    [
      'incomplete lineage',
      (f: Writable<DomesticCouponFacts>) => {
        f.lineage.status = null;
      },
      /UNAVAILABLE_LINEAGE/,
    ],
    [
      'unknown overlap',
      (f: Writable<DomesticCouponFacts>) => {
        f.spendability.status = null;
      },
      /UNAVAILABLE_RESTRICTION_OVERLAP/,
    ],
    [
      'duplicate cash portion',
      (f: Writable<DomesticCouponFacts>) => {
        f.spendability.unencumbered.shareId =
          f.spendability.thisCouponRetained.shareId;
      },
      /DUPLICATE_CASH_SHARE/,
    ],
    [
      'partition mismatch',
      (f: Writable<DomesticCouponFacts>) => {
        f.spendability.unencumbered.amount = '61';
      },
      /CASH_PARTITION_MISMATCH/,
    ],
    [
      'preopen',
      (f: Writable<DomesticCouponFacts>) => {
        f.clockBinding.status = 'PREOPEN';
      },
      /RUNNING_CLOCK/,
    ],
    [
      'unknown epoch',
      (f: Writable<DomesticCouponFacts>) => {
        f.clockBinding.epochRef = null;
      },
      /UNAVAILABLE_REFERENCE/,
    ],
    [
      'future due',
      (f: Writable<DomesticCouponFacts>) => {
        f.coupon.dueSimTime = '101';
      },
      /COUPON_NOT_DUE/,
    ],
    [
      'unknown fee',
      (f: Writable<DomesticCouponFacts>) => {
        f.fee.kind = null;
      },
      /UNAVAILABLE_FEE/,
    ],
    [
      'required fee',
      (f: Writable<DomesticCouponFacts>) => {
        f.fee.kind = 'REQUIRED';
      },
      /UNSUPPORTED_FEE/,
    ],
    [
      'unknown buffer kind',
      (f: Writable<DomesticCouponFacts>) => {
        f.buffer.kind = null;
      },
      /UNAVAILABLE_BUFFER_RULE_KIND/,
    ],
    [
      'unknown independent basis',
      (f: Writable<DomesticCouponFacts>) => {
        f.buffer.independentLegalBasisRef = null;
      },
      /UNAVAILABLE_REFERENCE/,
    ],
    [
      'B04 adoption is not hard basis',
      (f: Writable<DomesticCouponFacts>) => {
        f.buffer.basisKind = 'B04_TARGET_ADOPTION';
      },
      /INDEPENDENT_BUFFER_BASIS/,
    ],
    [
      'unknown priority',
      (f: Writable<DomesticCouponFacts>) => {
        f.buffer.priority = null;
      },
      /UNAVAILABLE_BUFFER_PRIORITY/,
    ],
    [
      'priority not applicable',
      (f: Writable<DomesticCouponFacts>) => {
        f.buffer.priority!.kind = 'NOT_APPLICABLE';
      },
      /UNSUPPORTED_BUFFER_RULE_SCOPE_OR_PRIORITY/,
    ],
    [
      'unknown amount',
      (f: Writable<DomesticCouponFacts>) => {
        f.buffer.amount = null;
      },
      /UNAVAILABLE_BUFFER_AMOUNT/,
    ],
  ])('rejects %s without preparing a payment', (_name, change, error) => {
    expect(() => run(altered(change))).toThrow(error);
  });
  it.each(['20', '61'])(
    'keeps B04 operating target%s unsupported before threshold/funding interpretation',
    (value) => {
      const f = altered((facts) => {
        facts.buffer.kind = 'B04_OPERATING_TARGET';
        facts.buffer.amount = value;
        facts.buffer.priority = null;
      });
      expect(() => run(f)).toThrow(/UNSUPPORTED_BUFFER_RULE_KIND/);
    },
  );
  it('does not substitute another operating drawdown/recompute target', () => {
    expect(() =>
      run(
        altered((f) => {
          f.buffer.kind = 'OPERATING_TARGET_WITH_DRAWDOWN_RECOMPUTE';
        }),
      ),
    ).toThrow(/UNSUPPORTED_BUFFER_RULE_KIND/);
  });
  it.each([
    'worldId',
    'countryId',
    'payerEntityId',
    'tgaAccountId',
    'nativeCurrency',
    'actualEffectivePeriod',
    'operationPurpose',
    'obligationId',
    'couponComponentId',
  ] as const)('requires exact hard-minimum scope: %s', (key) => {
    const f = altered((facts) => {
      (facts.buffer.scope as unknown as Record<string, string>)[key] =
        'TEST_ONLY_WRONG_SCOPE';
    });
    expect(() => run(f)).toThrow(/UNSUPPORTED_BUFFER_RULE_SCOPE_OR_PRIORITY/);
  });
  it('keeps a missing scope unavailable, not a target0', () => {
    expect(() =>
      run(
        altered((f) => {
          f.buffer.scope = null;
        }),
      ),
    ).toThrow(/UNAVAILABLE_RULE_SCOPE/);
  });
  it('requires full amount and canonical exact decimal strings', () => {
    const f = fixture();
    expect(() =>
      run(f, commandFor(f.facts, { payload: { amount: '15' } })),
    ).toThrow(/FULL_COUPON_ONLY/);
    for (const amount of ['3e1', 'NaN', '0', '-1', '30.0', '1'.repeat(121)])
      expect(() =>
        run(f, commandFor(f.facts, { payload: { amount } })),
      ).toThrow();
    expect(() => commandFor(f.facts, { payload: { amount: 30 } })).toThrow(
      /rejects number/,
    );
  });
  it('rejects a genuinely insufficient balance instead of partial repayment', () => {
    expect(() =>
      run(
        fixture({
          gross: '20',
          amount: '30',
          restricted: '0',
          retained: '0',
          floor: '0',
        }),
      ),
    ).toThrow(/INSUFFICIENT_TGA/);
  });
  it('rejects insufficient free funds after respecting other portions', () => {
    expect(() =>
      run(
        fixture({
          gross: '100',
          amount: '30',
          restricted: '80',
          retained: '0',
          floor: '0',
        }),
      ),
    ).toThrow(/INSUFFICIENT_SPENDABILITY/);
  });
  it('rejects a truly applicable floor violation without a new policy or default', () => {
    expect(() => run(fixture({ floor: '61' }))).toThrow(
      /APPLICABLE_HARD_MINIMUM_VIOLATED/,
    );
  });
  it('never creates a missing existing account', () => {
    expect(() => run(fixture({ omitCouponPair: true }))).toThrow(
      /ACCOUNT_NOT_IN_RECONSTRUCTED_REGISTRY/,
    );
  });
  it('does not grant ledger authority to a cloned raw snapshot', () => {
    const f = fixture();
    f.financialState = { ...f.financialState } as FinancialLedgerState;
    expect(() => run(f)).toThrow(/UNAVAILABLE_OPENING_POSTING_LINEAGE/);
  });
  it('rejects a client reclassification even when the ID is unchanged', () => {
    const f = altered((facts) => {
      facts.roleMap.GOV_TGA_ASSET.accountClass = 'CASH';
    });
    expect(() => run(f)).toThrow(/ACCOUNT_NOT_IN_RECONSTRUCTED_REGISTRY/);
  });
  it('does not impose a global DEPOSIT class on a fixed source-owned ASSET TGA representation', () => {
    const result = run(fixture({ tgaClass: 'ASSET' }));
    expect(result.projection.tgaAfter).toBe('70');
    expect(result.authorityVerified).toBe(false);
    expect(
      result.financialBatch.legs.find(
        (l) => l.account.accountId === 'TEST_ONLY_GOV_TGA_ASSET',
      )!.account.accountClass,
    ).toBe('ASSET');
  });
  it.each(['EQUITY', 'REVENUE', 'EXPENSE'] as const)(
    'does not reinterpret an existing %s account as one of the four claim roles',
    (tgaClass) => {
      expect(() => run(fixture({ tgaClass }))).toThrow(
        /UNSUPPORTED_ACCOUNT_ROLE_ENCODING/,
      );
    },
  );
  it('does not assume sparse missing balances are zero', () => {
    const f = fixture(),
      first = run(f),
      command = commandFor(f.facts);
    const state = rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [
        {
          command,
          transition: first.transition,
          inventoryPostings: [],
          financialPostingBatches: [first.financialBatch],
        },
      ],
      sha256Hex: sha,
    }).financial;
    const facts = { ...f.facts, worldVersion: '1', eventSequence: '1' };
    expect(() =>
      run(
        { ...f, facts, financialState: state },
        commandFor(facts, { id: 'TEST_ONLY_SECOND_COMMAND' }),
      ),
    ).toThrow(/UNAVAILABLE_EXPLICIT_ACCOUNT_BALANCE/);
  });
  it('rejects duplicate account IDs, wrong reciprocal claim and wrong owner', () => {
    const duplicate = altered((f) => {
      f.roleMap.GOV_COUPON_PAYABLE = f.roleMap.GOV_TGA_ASSET;
    });
    expect(() => run(duplicate)).toThrow(/FOUR_DISTINCT/);
    const claim = altered((f) => {
      f.coupon.claimId = 'TEST_ONLY_WRONG_CLAIM';
    });
    expect(() => run(claim)).toThrow(/TWO_DISTINCT_RECIPROCAL_CLAIMS/);
    const owner = altered((f) => {
      f.centralBankId = 'TEST_ONLY_OTHER_CB';
    });
    expect(() => run(owner)).toThrow(/ACCOUNT_ROLE_SCOPE_OR_COUNTERPARTY/);
  });
  it('binds source identity, native currency, mechanism and Office without granting a capability', () => {
    const f = fixture(),
      command = commandFor(f.facts),
      changed = altered((facts) => {
        facts.sourceRef = 'TEST_ONLY_CHANGED_SOURCE';
      });
    expect(() => run(changed, command)).toThrow(/SOURCE_INTENT_MISMATCH/);
    expect(() =>
      run(f, commandFor(f.facts, { payload: { currency: 'GCU' } })),
    ).toThrow(/SCOPE_MISMATCH/);
    expect(() =>
      parseDomesticCouponIntent(commandFor(f.facts, { office: 'TRADE' }), sha),
    ).toThrow(/UNSUPPORTED_MECHANISM/);
    expect(() =>
      parseDomesticCouponIntent(
        commandFor(f.facts, { family: 'TEST_ONLY_OTHER_FAMILY' }),
        sha,
      ),
    ).toThrow(/UNSUPPORTED_MECHANISM/);
    expect(() =>
      run(f, commandFor(f.facts, { payload: { extra: 'TEST_ONLY_EXTRA' } })),
    ).toThrow(/MISSING_OR_EXTRA/);
  });
});
