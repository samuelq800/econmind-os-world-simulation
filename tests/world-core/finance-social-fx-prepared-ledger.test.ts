/** Full ordered TEST_ONLY Core economic frames, never a DB/source approval. */
import { describe, it, expect, beforeAll } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
  replayPreparedFinanceSocialLedger,
  type FinanceSocialFxOriginal,
  type FinanceSocialFxOpeningEncumbrance,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  prepareFinanceNativeBudgetTransition,
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  evaluateFinanceNativeBudgetSource,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetSource,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  mixedFinancialFixture,
  mixedSocialOriginal,
  mixedSocialFrame,
  mixedFxFrame,
  withMixedTestProof,
  mixedWorld as world,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
const at = '2026-10-29T00:00:00.000Z';
function setup() {
  const f = mixedFinancialFixture(),
    social = mixedSocialOriginal(),
    a = f.accounts;
  const fxOriginals: FinanceSocialFxOriginal[] = [
    {
      quote: f.quote,
      treasuryAsset: a.treasuryAsset,
      treasuryLiability: a.treasuryLiability,
      bankSettlementAsset: a.bankSettlementAsset,
      bankSettlementLiability: a.bankSettlementLiability,
      bankGcuAsset: a.bankGcuAsset,
    },
  ];
  const openingEncumbrances: FinanceSocialFxOpeningEncumbrance[] = [
    {
      reference: 'OPENING_TREASURY_TEST_ONLY',
      accountId: a.treasuryAsset.accountId,
      amount: '200',
      currency: 'XAA',
    },
    {
      reference: 'OPENING_BANK_GCU_TEST_ONLY',
      accountId: a.bankGcuAsset.accountId,
      amount: '10',
      currency: 'GCU',
    },
  ];
  const prepared = prepareFinanceSocialLedger(f.financial);
  const replay = (frames: readonly FinanceNativeBudgetCanonicalFrame[]) =>
    replayPreparedFinanceSocialFxLedger({
      prepared,
      frames,
      socialCountries: [social],
      openingEncumbrances,
      fxOriginals,
      expectedHead: {
        worldVersion: frames.at(-1)?.transition.worldVersionAfter ?? '0',
        eventSequence: frames.at(-1)?.events.at(-1)?.sequence ?? '0',
      },
      sha256Hex: sha,
    });
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
    ruleRevision: 'TEST_ONLY_RULE',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: world,
    countryId: 'COUNTRY_01',
    governmentEntityId: a.treasuryAsset.ownerId,
    currency: 'XAA',
    envelopeRef: 'ENVELOPE_MIXED_FX_TEST_ONLY',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '86400000',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ): FinanceNativeBudgetSource => {
    const current = replay(frames),
      opening = [openingEncumbrances[0]!];
    return {
      policy,
      binding: {
        seedRef: f.seed.seedId,
        seedFingerprint: f.seed.fingerprint,
        admissionRef: 'TEST_ONLY_ADMISSION',
        financialSourceId: f.seed.sources[0]!.sourceId,
        originalsSHA256: 'sha256:' + 'b'.repeat(64),
        policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
        treasuryAccountId: a.treasuryAsset.accountId,
        treasuryClaimId: a.treasuryAsset.claimId!,
        openingEncumbranceHash: C.canonicalSha256(
          C.canonicalHashInput(opening),
          sha,
        ),
      },
      openingEncumbrances: opening,
      financialState: current.financial,
      mixedPrefixEvidence: current.mixedPrefixEvidence,
      frames,
      worldVersion: current.budgetState.worldVersion,
      eventSequence: current.budgetState.eventSequence,
    };
  };
  const command = (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY_MIXED',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'COMMAND_MIXED_' + identity,
        idempotencyKey: 'KEY_MIXED_' + identity,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        expectedWorldVersion:
          frames.at(-1)?.transition.worldVersionAfter ?? '0',
        simTime: '1',
        correlationId: 'CORRELATION_MIXED_' + identity,
        submittedAtReal: at,
        payload: {
          operation,
          scope: {
            worldId: world,
            countryId: 'COUNTRY_01',
            entityRef: policy.governmentEntityId,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: 'XAA',
          amount,
          envelopeRevisionRef: 'ENVELOPE_REV_MIXED',
          lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_MIXED_FX',
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_MIXED'
              : 'LINE_REV_MIXED',
          predecessorRevisionRef: null,
        },
      },
      sha,
    );
  const budgetFrame = async (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) => {
    const c = command(operation, frames, identity, amount),
      s = source(frames);
    const value = await withMixedTestProof(c, 'FINANCE_BUDGET', (proof) =>
      prepareFinanceNativeBudgetTransition({
        command: c,
        authorization: proof,
        source: s,
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    );
    return {
      command: c,
      events: value.transition.events,
      transition: value.transition,
      receipt: value.receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    };
  };
  return {
    f,
    social,
    fxOriginals,
    openingEncumbrances,
    prepared,
    replay,
    policy,
    source,
    command,
    budgetFrame,
  };
}
let f: ReturnType<typeof setup>,
  frames: FinanceNativeBudgetCanonicalFrame[],
  firstFx: Awaited<ReturnType<typeof mixedFxFrame>>;
beforeAll(async () => {
  f = setup();
  frames = [];
  frames.push(await f.budgetFrame('SET_ENVELOPE', frames, 'SET', '100'));
  firstFx = await mixedFxFrame({
    financial: f.replay(frames).financial,
    original: f.f,
    sequence: '2',
    identity: 'FIRST',
  });
  frames.push(firstFx);
  const plan = mixedSocialFrame(f.social, '2', '3', undefined, '1');
  frames.push(plan);
  frames.push(await f.budgetFrame('APPROVE_NEW_LINE', frames, 'LINE', '20'));
  const secondFx = await mixedFxFrame({
    financial: f.replay(frames).financial,
    original: f.f,
    sequence: '7',
    identity: 'SECOND',
  });
  frames.push(secondFx);
  frames.push(mixedSocialFrame(f.social, '5', '8', plan, '1'));
});
describe('complete Finance/Social/FX prepared-ledger replay', () => {
  it('replays Budget→FX→Social→Budget→FX→Social with real monetary effects and one global cursor', () => {
    const r = f.replay(frames);
    expect(r.financial.worldVersion).toBe('6');
    expect(r.budgetState.eventSequence).toBe('8');
    expect(r.budgetState.envelopes).toHaveLength(1);
    expect(r.budgetEncumbrances).toHaveLength(1);
    expect(r.budgetEncumbrances[0]!.amount).toBe('100');
    expect(r.socialCountries[0]!.lifecycle.employment.plans[0]!.state).toBe(
      'SETTLED',
    );
    expect(r.currentTreasuryBalances[0]!.amount).toBe('980.000002');
    expect(
      C.canonicalDecimal(
        r.financial.positions.find(
          (p) => p.account.accountId === 'BANK_GCU_CASH',
        )!.netDebitBalance.amount,
      ),
    ).toBe('93.333334');
    const direct = C.rebuildV08LedgersFromLineage({
      seed: f.f.seed,
      transitions: frames.map((frame) => ({
        command: frame.command,
        transition: frame.transition,
        financialPostingBatches:
          frame.financialPostingBatches as C.FinancialPostingBatch[],
        inventoryPostings: [],
      })),
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(direct.financial)).toBe(
      C.canonicalSerialize(r.financial),
    );
  });
  it('supplies actual post-FX funds to Finance and preserves legacy no-FX rejection', () => {
    const prefix = frames.slice(0, 2),
      s = f.source(prefix);
    expect(
      C.canonicalDecimal(
        s.financialState!.positions.find(
          (p) => p.account.accountId === 'TGA_ASSET',
        )!.netDebitBalance.amount,
      ),
    ).toBe('990.000001');
    expect(() =>
      evaluateFinanceNativeBudgetSource({
        command: f.command('APPROVE_NEW_LINE', prefix, 'READ_AFTER_FX', '20'),
        source: s,
        sha256Hex: sha,
      }),
    ).not.toThrow();
    const { financialState: currentFinancial, ...withoutCurrentLedger } = s;
    expect(currentFinancial).toBeDefined();
    expect(() =>
      evaluateFinanceNativeBudgetSource({
        command: f.command('APPROVE_NEW_LINE', prefix, 'NO_H0_FALLBACK', '20'),
        source: {
          ...withoutCurrentLedger,
          capacityData: {} as NonNullable<
            FinanceNativeBudgetSource['capacityData']
          >,
        },
        sha256Hex: sha,
      }),
    ).toThrow('ACTUAL_REPLAYED_FINANCIAL_STATE');
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        { worldId: world, frames: prefix, socialCountries: [f.social] },
        sha,
      ),
    ).toThrow('POSTING_EFFECT');
    const replay = f.replay(prefix);
    expect(
      replayPreparedFinanceSocialLedger({
        prepared: f.prepared,
        mixedPrefixEvidence: replay.mixedPrefixEvidence,
        frames: prefix,
        expectedHead: { worldVersion: '2', eventSequence: '2' },
        sha256Hex: sha,
      }),
    ).toBe(replay.financial);
  });
  it('rejects missing/tampered posting batches, unknown domains and missing quote originals', () => {
    for (const batch of [[], firstFx.financialPostingBatches.slice(0, 1)])
      expect(() =>
        f.replay([frames[0]!, { ...firstFx, financialPostingBatches: batch }]),
      ).toThrow();
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        prepared: f.prepared,
        frames: frames.slice(0, 2),
        socialCountries: [f.social],
        openingEncumbrances: f.openingEncumbrances,
        fxOriginals: [],
        expectedHead: { worldVersion: '2', eventSequence: '2' },
        sha256Hex: sha,
      }),
    ).toThrow('HISTORICAL_FX_QUOTE');
    const bad = {
      ...frames[2]!,
      financialPostingBatches: firstFx.financialPostingBatches,
    };
    expect(() => f.replay([frames[0]!, firstFx, bad])).toThrow(
      'POSTING_EFFECT',
    );
  });
  it('does not trust FX event-self-reported reservations or duplicate opening allocations', async () => {
    const before = [frames[0]!],
      bad = await mixedFxFrame({
        financial: f.replay(before).financial,
        original: f.f,
        sequence: '2',
        identity: 'MISSING_BUDGET',
        treasuryReservedAmount: '200',
      });
    expect(() => f.replay([...before, bad])).toThrow('event changed');
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        prepared: f.prepared,
        frames: [],
        socialCountries: [f.social],
        openingEncumbrances: [
          ...f.openingEncumbrances,
          f.openingEncumbrances[0]!,
        ],
        fxOriginals: f.fxOriginals,
        expectedHead: { worldVersion: '0', eventSequence: '0' },
        sha256Hex: sha,
      }),
    ).toThrow('UNIQUE_OPENING');
  });
  it('binds evidence to every batch/receipt byte and the exact private opening object', () => {
    const prefix = frames.slice(0, 2),
      r = f.replay(prefix),
      mutated = [
        prefix[0]!,
        { ...firstFx, receipt: { ...firstFx.receipt, idempotencyKey: null } },
      ];
    expect(() =>
      readFinanceNativeBudgetMixedPrefix(
        r.mixedPrefixEvidence,
        world,
        mutated,
        sha,
      ),
    ).toThrow('GENUINE_EXACT');
    expect(() =>
      replayPreparedFinanceSocialLedger({
        prepared: prepareFinanceSocialLedger(
          C.rebuildV08LedgersFromLineage({ seed: f.f.seed, sha256Hex: sha })
            .financial,
        ),
        mixedPrefixEvidence: r.mixedPrefixEvidence,
        frames: prefix,
        expectedHead: { worldVersion: '2', eventSequence: '2' },
        sha256Hex: sha,
      }),
    ).toThrow('EXACT_GENUINE_FINANCIAL');
    expect(() => f.replay([...prefix].reverse())).toThrow('ORDERED');
  });
});
