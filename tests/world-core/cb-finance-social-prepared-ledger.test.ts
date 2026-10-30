/** TEST_ONLY single-currency complete bank register. No SQL/source admission,
 * cfc multicurrency valuation or current user/CB policy approval is asserted. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { createCbFinanceSocialFixture } from '../support/cb-finance-social-replay-fixture.js';
import {
  mixedSocialFrame,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
import {
  prepareFinanceNativeBudgetFinancialReplay,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
describe('complete OMO Budget Social prepared Core replay', () => {
  it('closes Budget -> OMO -> Social PLAN -> LINE -> OMO -> MATCH with full postings and once-only budget cap', async () => {
    const f = createCbFinanceSocialFixture(),
      frames: FinanceNativeBudgetCanonicalFrame[] = [];
    frames.push(await f.budgetFrame('SET_ENVELOPE', frames, 'SET', '1'));
    frames.push(f.omoFrame(frames, 'BUY'));
    const plan = mixedSocialFrame(f.social, '2', '3', undefined, '1');
    frames.push(plan);
    frames.push(await f.budgetFrame('APPROVE_NEW_LINE', frames, 'LINE', '0.2'));
    frames.push(f.omoFrame(frames, 'SELL', 'SELL_GOVERNMENT_SECURITIES'));
    frames.push(mixedSocialFrame(f.social, '5', '8', plan, '1'));
    const result = f.replay(frames);
    expect(result.budgetState.worldVersion).toBe('6');
    expect(result.budgetState.eventSequence).toBe('8');
    expect(result.budgetEncumbrances).toHaveLength(1);
    expect(result.budgetEncumbrances[0]?.amount).toBe('1');
    expect(
      result.financial.positions
        .find((p) => p.account.accountId === f.tga.accountId)
        ?.netDebitBalance.amount.toString(),
    ).toBe('5');
    expect(result.omoCountries?.[0]?.holdings).toEqual(f.original.holdings);
    expect(
      result.socialCountries[0]?.lifecycle.employment.plans[0]?.state,
    ).toBe('SETTLED');
    const whole = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: frames.map((frame) => ({
        command: frame.command,
        transition: frame.transition,
        financialPostingBatches:
          frame.financialPostingBatches as C.FinancialPostingBatch[],
        inventoryPostings: [],
      })),
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(result.financial)).toBe(
      C.canonicalSerialize(whole.financial),
    );
    expect(result.financial.appliedBatches).toHaveLength(2);
  });
  it('also closes Social -> OMO -> Budget -> OMO -> LINE -> MATCH, preserving global version/sequence separation', async () => {
    const f = createCbFinanceSocialFixture(),
      frames: FinanceNativeBudgetCanonicalFrame[] = [];
    const plan = mixedSocialFrame(f.social, '0', '1', undefined, '1');
    frames.push(plan);
    frames.push(f.omoFrame(frames, 'REVERSE_BUY'));
    frames.push(
      await f.budgetFrame('SET_ENVELOPE', frames, 'REVERSE_SET', '1'),
    );
    frames.push(
      f.omoFrame(frames, 'REVERSE_SELL', 'SELL_GOVERNMENT_SECURITIES'),
    );
    frames.push(
      await f.budgetFrame('APPROVE_NEW_LINE', frames, 'REVERSE_LINE', '0.2'),
    );
    frames.push(mixedSocialFrame(f.social, '5', '8', plan, '1'));
    const r = f.replay(frames);
    expect(r.budgetState).toMatchObject({
      worldVersion: '6',
      eventSequence: '8',
    });
    expect(r.omoCountries?.[0]?.holdings).toEqual(f.original.holdings);
    expect(r.budgetEncumbrances).toHaveLength(1);
    expect(r.socialCountries[0]?.lifecycle.employment.plans[0]?.state).toBe(
      'SETTLED',
    );
  });
  it('requires H0-reconciled register/immutable quote and rejects missing/changed actual posting, receipt or unknown family', () => {
    const f = createCbFinanceSocialFixture(),
      frame = f.omoFrame([], 'NEGATIVE');
    expect(() => f.replay([frame], [])).toThrow(
      'EXACT_OMO_ORIGIN_EVENT_AND_POSTING_REQUIRED',
    );
    expect(() =>
      f.replay(
        [frame],
        [
          {
            ...f.original,
            bank: {
              ...f.original.bank,
              governmentSecurities: { amount: '101', currency: 'XAA' },
            },
          },
        ],
      ),
    ).toThrow('snapshot differs from authoritative posted position');
    expect(() => f.replay([{ ...frame, financialPostingBatches: [] }])).toThrow(
      'EXACT_OMO_ORIGIN_EVENT_AND_POSTING_REQUIRED',
    );
    const batch = frame.financialPostingBatches[0]!,
      { fingerprint: _fp, transitionBinding: _binding, ...intent } = batch;
    void _fp;
    void _binding;
    const altered = C.createFinancialPostingBatch(
      {
        ...intent,
        command: frame.command,
        transition: frame.transition,
        legs: batch.legs.map((l) => ({
          ...l,
          amount: C.Money.from('2.5', 'XAA'),
        })),
      },
      sha,
    );
    expect(() =>
      f.replay([{ ...frame, financialPostingBatches: [altered] }]),
    ).toThrow('CANONICAL_OMO_EVENT_OR_FINANCIAL_POSTING_DIFFERS');
    expect(() =>
      f.replay([
        { ...frame, receipt: { ...frame.receipt, reasonCode: 'BAD_REASON' } },
      ]),
    ).toThrow('EXACT_CANONICAL_FINANCIAL_PREFIX_RECEIPT_REQUIRED');
    const r = f.replay([frame]);
    expect(() =>
      readFinanceNativeBudgetMixedPrefix(
        r.mixedPrefixEvidence,
        f.seed.worldId,
        [{ ...frame, financialPostingBatches: [altered] }],
        sha,
      ),
    ).toThrow('GENUINE_EXACT_MIXED_PREFIX_EVIDENCE_REQUIRED');
    const cmd = C.parseCanonicalCommand(
      {
        schemaVersion: frame.command.schemaVersion,
        worldId: frame.command.worldId,
        countryId: frame.command.countryId,
        commandId: 'COMMAND_UNKNOWN_ECONOMIC',
        idempotencyKey: 'KEY_UNKNOWN_ECONOMIC',
        commandType: 'UNKNOWN_ECONOMIC_FAMILY',
        officeId: 'CENTRAL_BANK',
        actorId: frame.command.actorId,
        authSubject: frame.command.authSubject,
        expectedWorldVersion: '0',
        simTime: '1',
        submittedAtReal: frame.command.submittedAtReal,
        correlationId: frame.command.correlationId,
        payload: JSON.parse(frame.command.canonicalPayload),
      },
      sha,
    );
    expect(() => f.replay([{ ...frame, command: cmd }])).toThrow(
      'UNSUPPORTED_MIXED_PREFIX_POSTING_EFFECT',
    );
  });
  it('keeps the existing unmapped BANK GCU valuation/register refusal and rejects copied H0 authority', () => {
    const f = createCbFinanceSocialFixture();
    expect(() =>
      prepareFinanceNativeBudgetFinancialReplay(
        {
          financial: { ...f.financial },
          openingEncumbrances: [],
          fxOriginals: [],
          omoOriginals: [f.original],
        },
        sha,
      ),
    ).toThrow('GENUINE_H0_FINANCIAL_REPLAY_BASE_REQUIRED');
    const cash = C.createFinancialAccount({
      worldId: f.seed.worldId,
      countryId: C.countryId('COUNTRY_01'),
      ownerId: C.legalEntityId(f.original.bank.bankRef),
      accountId: C.financialAccountId('ACCOUNT_BANK_GCU_UNMAPPED_TEST'),
      accountClass: 'CASH',
      currency: 'GCU',
      claimId: null,
      counterpartyEntityId: null,
    });
    const equity = C.createFinancialAccount({
      ...cash,
      accountId: C.financialAccountId('ACCOUNT_BANK_GCU_EQUITY_UNMAPPED_TEST'),
      accountClass: 'EQUITY',
    });
    const { fingerprint: _fp, ...intent } = f.seed;
    void _fp;
    const seed = C.createOpeningSeed(
      {
        ...intent,
        financialBatches: [
          ...f.seed.financialBatches,
          {
            batchId: C.financialOpeningBatchId('BATCH_GCU_UNMAPPED_TEST'),
            sourceId: f.seed.sources[0]!.sourceId,
            settlementCurrency: 'GCU',
            legs: [cash, equity].map((account, i) => ({
              legId: C.financialOpeningLegId(`LEG_GCU_UNMAPPED_${i}`),
              account,
              direction: i === 0 ? ('DEBIT' as const) : ('CREDIT' as const),
              amount: C.Money.from('10', 'GCU'),
              counterpartLegId: C.financialOpeningLegId(
                `LEG_GCU_UNMAPPED_${1 - i}`,
              ),
            })),
          },
        ],
      },
      sha,
    );
    const financial = C.rebuildV08LedgersFromLineage({
      seed,
      sha256Hex: sha,
    }).financial;
    expect(() =>
      prepareFinanceNativeBudgetFinancialReplay(
        {
          financial,
          openingEncumbrances: [],
          fxOriginals: [],
          omoOriginals: [f.original],
        },
        sha,
      ),
    ).toThrow(
      'unmapped BANK/CB account requires full valuation/register source',
    );
  });
});
