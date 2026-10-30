/** Pure TEST_ONLY originals, not admitted capital or runtime readiness. */
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { replayPreparedFinanceSocialFxLedger } from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  createCaptainMixedTestFixture,
  testOnlyCaptainFrame,
  testOnlyCaptainOriginal,
} from '../support/captain-finance-social-fixture.js';
import {
  mixedFxFrame,
  mixedSocialFrame,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
describe('complete Captain Finance Social FX Core prefix', () => {
  it('replays all real groups with two country capitals, real FX and once-only budget reservations', async () => {
    const f = createCaptainMixedTestFixture([
      testOnlyCaptainOriginal(),
      testOnlyCaptainOriginal('COUNTRY_02'),
    ]);
    const frames: FinanceNativeBudgetCanonicalFrame[] = [];
    frames.push(await f.budgetFrame('SET_ENVELOPE', frames, 'SET', '100'));
    frames.push(
      await mixedFxFrame({
        financial: f.replay(frames).financial,
        original: f.f,
        sequence: '2',
        identity: 'FX_BEFORE_CAPTAIN',
      }),
    );
    frames.push(
      testOnlyCaptainFrame({ fixture: f, frames, identity: 'FIRST' }),
    );
    const plan = mixedSocialFrame(f.social, '3', '4', undefined, '1');
    frames.push(plan);
    frames.push(
      testOnlyCaptainFrame({
        fixture: f,
        frames,
        countryId: 'COUNTRY_02',
        identity: 'FOREIGN',
      }),
    );
    frames.push(await f.budgetFrame('APPROVE_NEW_LINE', frames, 'LINE', '20'));
    frames.push(
      testOnlyCaptainFrame({ fixture: f, frames, identity: 'SECOND' }),
    );
    frames.push(
      await mixedFxFrame({
        financial: f.replay(frames).financial,
        original: f.f,
        sequence: '10',
        identity: 'FX_AFTER_CAPTAIN',
      }),
    );
    frames.push(mixedSocialFrame(f.social, '8', '11', plan, '1'));
    const r = f.replay(frames);
    expect(r.budgetState.worldVersion).toBe('9');
    expect(r.budgetState.eventSequence).toBe('11');
    expect(
      r.captainCountries?.map((c) => [
        c.countryId,
        c.state.worldVersion,
        c.state.lastEventSequence,
        c.state.capital.buckets[0]!.balance.amount,
      ]),
    ).toEqual([
      ['COUNTRY_01', '9', '11', '36'],
      ['COUNTRY_02', '9', '11', '38'],
    ]);
    expect(r.budgetEncumbrances).toHaveLength(1);
    expect(r.budgetEncumbrances[0]?.amount).toBe('100');
    expect(r.currentTreasuryBalances[0]?.amount).toBe('980.000002');
    expect(r.socialCountries[0]?.lifecycle.employment.plans[0]?.state).toBe(
      'SETTLED',
    );
    const direct = C.rebuildV08LedgersFromLineage({
      seed: f.f.seed,
      transitions: frames.map((x) => ({
        command: x.command,
        transition: x.transition,
        financialPostingBatches:
          x.financialPostingBatches as C.FinancialPostingBatch[],
        inventoryPostings: [],
      })),
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(direct.financial)).toBe(
      C.canonicalSerialize(r.financial),
    );
  });
  it('refuses missing/duplicate/nonconserved capital and preserves legacy no-Captain behavior', () => {
    const f = createCaptainMixedTestFixture();
    const frame = testOnlyCaptainFrame({
      fixture: f,
      frames: [],
      identity: 'ONLY',
    });
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        prepared: f.prepared,
        frames: [frame],
        socialCountries: [f.social],
        openingEncumbrances: f.openingEncumbrances,
        fxOriginals: f.fxOriginals,
        expectedHead: { worldVersion: '1', eventSequence: '1' },
        sha256Hex: sha,
      }),
    ).toThrow();
    expect(() =>
      createCaptainMixedTestFixture([
        testOnlyCaptainOriginal(),
        testOnlyCaptainOriginal(),
      ]).replay([]),
    ).toThrow('UNIQUE_CAPTAIN');
    const bad = testOnlyCaptainOriginal();
    bad.capital.available.amount = '99';
    expect(() => createCaptainMixedTestFixture([bad]).replay([])).toThrow();
    const other = createCaptainMixedTestFixture([
      testOnlyCaptainOriginal('COUNTRY_02'),
    ]);
    expect(() => other.replay([frame])).toThrow(
      'CAPTAIN_COUNTRY_ORIGINAL_REQUIRED',
    );
  });
  it('rejects modified full receipt, unknown domain, postings and evidence reuse', () => {
    const f = createCaptainMixedTestFixture();
    const frame = testOnlyCaptainFrame({
      fixture: f,
      frames: [],
      identity: 'NEGATIVE',
    });
    const r = f.replay([frame]);
    const modified = {
      ...frame,
      receipt: { ...frame.receipt, reasonCode: 'FAKE_REASON' },
    };
    expect(() => f.replay([modified])).toThrow('EXACT_CANONICAL');
    expect(() =>
      f.replay([{ ...frame, inventoryPostings: [{ fake: true }] }]),
    ).toThrow('POSTING');
    expect(() =>
      readFinanceNativeBudgetMixedPrefix(
        r.mixedPrefixEvidence,
        f.f.financial.worldId,
        [modified],
        sha,
      ),
    ).toThrow('GENUINE_EXACT');
    const {
      fingerprint: _fingerprint,
      payloadHash: _payloadHash,
      canonicalPayload,
      simTime,
      ...intent
    } = frame.command;
    void _fingerprint;
    void _payloadHash;
    const command = C.parseCanonicalCommand(
      {
        ...intent,
        simTime: simTime.toCanonicalValue(),
        payload: JSON.parse(canonicalPayload),
        commandType: 'UNREGISTERED_FAMILY',
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: frame.events,
    });
    const receipt = C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: frame.receipt.recordedAtReal,
    });
    expect(() =>
      f.replay([{ ...frame, command, transition, receipt }]),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_FAMILY');
  });
});
