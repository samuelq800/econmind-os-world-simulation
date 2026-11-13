/** Genuine Core calculations and proof brands; all policy/identity/source
 * originals are explicit TEST_ONLY. No database or source admission is issued. */
import { beforeAll, describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  replayFinanceNativeBudgetHistory,
  prepareFinanceNativeBudgetMixedPrefix,
  prepareFinanceNativeBudgetFinancialReplay,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  prepareFinanceSocialLedger,
  prepareFinanceSocialLedgerFromOpening,
  readPreparedFinanceSocialOpening,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  mixedSocialFrame,
  mixedFxFrame,
  mixedWorld as world,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
import { createFinanceSocialContinuationFixture as fixture } from '../support/finance-social-continuation-fixture.js';
const at = '2026-10-29T00:00:00.000Z';
let small: ReturnType<typeof fixture>,
  frames: FinanceNativeBudgetCanonicalFrame[];
beforeAll(async () => {
  small = fixture();
  frames = [];
  let cursor = small.start({ worldVersion: '257', eventSequence: '259' });
  for (let i = 0; i < 257; i++) {
    const frame = await small.budget(
      cursor,
      String(i),
      i === 1 ? 'APPROVE_NEW_LINE' : 'SET_ENVELOPE',
      i === 1 ? '0' : String(i),
    );
    frames.push(frame);
    cursor = small.append(cursor, [frame]);
  }
  expect(readFinanceSocialReplayContinuation(cursor).complete).toBe(true);
  retireFinanceSocialReplayContinuation(cursor);
});
describe('private genuine complete-domain page continuation', () => {
  it('checks a new Budget command against earlier pages, not only the last page witness', async () => {
    let cursor = small.start({ worldVersion: '257', eventSequence: '259' });
    cursor = small.append(cursor, [frames[0]!]);
    cursor = small.append(cursor, [frames[1]!]);
    expect(readFinanceSocialReplayContinuation(cursor).lastPage.frames).toEqual(
      [frames[1]!],
    );
    await expect(small.budget(cursor, '0')).rejects.toThrow(
      'ORIGINAL_DURABLE_RECEIPT_REQUIRED',
    );
    const fresh = await small.budget(cursor, 'PAGED_FRESH');
    expect(fresh.command.expectedWorldVersion).toBe('2');
    expect(readFinanceSocialReplayContinuation(cursor).head).toEqual({
      worldVersion: '2',
      eventSequence: '4',
    });
    retireFinanceSocialReplayContinuation(cursor);
  });
  it('replays >256 real authorized Core Budget frames without changing legacy limits or counting LINE as a second cap', () => {
    let cursor = small.start({ worldVersion: '257', eventSequence: '259' });
    for (let i = 0; i < frames.length; i += 64)
      cursor = small.append(cursor, frames.slice(i, i + 64));
    const value = readFinanceSocialReplayContinuation(cursor),
      old = replayFinanceNativeBudgetHistory(world, frames, sha),
      direct = C.rebuildV08LedgersFromLineage({
        seed: small.f.seed,
        transitions: frames,
        sha256Hex: sha,
      });
    expect(value.head).toEqual({ worldVersion: '257', eventSequence: '259' });
    expect(value.complete).toBe(true);
    expect(value.frameCount).toBe('257');
    expect(value.pageCount).toBe('5');
    expect(C.canonicalSerialize(value.result.budgetState)).toBe(
      C.canonicalSerialize(old),
    );
    expect(value.result.budgetEncumbrances).toHaveLength(256);
    expect(C.canonicalSerialize(value.result.financialState)).toBe(
      C.canonicalSerialize(direct.financial),
    );
    expect(C.canonicalSerialize(value.result.inventoryState)).toBe(
      C.canonicalSerialize(direct.inventory),
    );
    const legacyBase = prepareFinanceNativeBudgetFinancialReplay(
      {
        financial: small.opening.financial,
        opening: small.opening,
        openingEncumbrances: small.openingEncumbrances,
        fxOriginals: small.fxOriginals,
      },
      sha,
    );
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          worldId: world,
          frames,
          financialReplay: legacyBase,
          socialCountries: [small.social],
        },
        sha,
      ),
    ).toThrow('BOUNDED_COMPLETE_FINANCIAL_PREFIX_REQUIRED');
  });
  it('genuinely reduces Budget→FX→Social PLAN→Budget→MATCH across complete page boundaries', async () => {
    const f = fixture();
    let cursor = f.start({ worldVersion: '5', eventSequence: '5' });
    const all: FinanceNativeBudgetCanonicalFrame[] = [];
    const first = await f.budget(cursor, 'MIXED_FIRST');
    all.push(first);
    cursor = f.append(cursor, [first]);
    const fx = await mixedFxFrame({
      financial:
        readFinanceSocialReplayContinuation(cursor).result.financialState!,
      original: f.f,
      sequence: '2',
      identity: 'PAGE_FX',
      treasuryReservedAmount: '201',
      bankGcuReservedAmount: '10',
    });
    all.push(fx);
    cursor = f.append(cursor, [fx]);
    const plan = mixedSocialFrame(f.social, '2', '3', undefined, '1');
    all.push(plan);
    cursor = f.append(cursor, [plan]);
    const afterPlan =
      readFinanceSocialReplayContinuation(cursor).result.socialCountries[0]!
        .lifecycle.employment;
    const back = await f.budget(cursor, 'MIXED_BACK');
    all.push(back);
    cursor = f.append(cursor, [back]);
    const match = mixedSocialFrame(
      f.social,
      '4',
      '5',
      { command: plan.command, state: afterPlan },
      '1',
    );
    all.push(match);
    cursor = f.append(cursor, [match]);
    const actual = readFinanceSocialReplayContinuation(cursor),
      direct = C.rebuildV08LedgersFromLineage({
        seed: f.f.seed,
        transitions: all,
        sha256Hex: sha,
      });
    expect(actual.complete).toBe(true);
    expect(actual.result.budgetEncumbrances).toHaveLength(2);
    expect(C.canonicalSerialize(actual.result.financialState)).toBe(
      C.canonicalSerialize(direct.financial),
    );
    expect(actual.result.socialCountries[0]!.lifecycle.employment).not.toEqual(
      f.social.state,
    );
    expect(
      actual.result
        .financialState!.positions.find(
          (p) => p.account.accountId === f.f.accounts.treasuryAsset.accountId,
        )!
        .netDebitBalance.amount.toFixed(),
    ).toBe('990.000001');
  });
  it('refuses forged/copy/retired handles and consumes only successful linear append', () => {
    const cursor = small.start({ worldVersion: '257', eventSequence: '259' });
    expect(() => readFinanceSocialReplayContinuation({ ...cursor })).toThrow(
      'genuine live continuation',
    );
    expect(() =>
      appendFinanceSocialReplayPage({
        continuation: {} as never,
        page: small.page(cursor, [frames[0]!]),
        sha256Hex: sha,
      }),
    ).toThrow('genuine live continuation');
    const next = small.append(cursor, [frames[0]!]);
    expect(() => small.append(next, [frames[0]!])).toThrow();
    expect(() => small.append(cursor, [frames[0]!])).toThrow(
      'genuine live continuation',
    );
    retireFinanceSocialReplayContinuation(next);
    expect(() => readFinanceSocialReplayContinuation(next)).toThrow(
      'genuine live continuation',
    );
  });
  it('rejects wrong World/seed/anchor/hash/cursor, missing or reordered frames without changing the old genuine state', () => {
    const cursor = small.start({ worldVersion: '257', eventSequence: '259' }),
      page = small.page(cursor, [frames[0]!]),
      before = readFinanceSocialReplayContinuation(cursor);
    for (const bad of [
      { ...page, worldId: 'WORLD_FOREIGN' },
      { ...page, seedFingerprint: 'sha256:' + 'f'.repeat(64) },
      { ...page, framesSha256: 'sha256:' + '0'.repeat(64) },
      { ...page, expectedHead: { worldVersion: '258', eventSequence: '260' } },
      { ...page, fromHead: { worldVersion: '1', eventSequence: '1' } },
      { ...page, throughHead: { worldVersion: '2', eventSequence: '2' } },
      small.page(cursor, [frames[2]!]),
      small.page(cursor, [frames[1]!, frames[0]!]),
    ]) {
      expect(() =>
        appendFinanceSocialReplayPage({
          continuation: cursor,
          page: bad,
          sha256Hex: sha,
        }),
      ).toThrow();
      expect(readFinanceSocialReplayContinuation(cursor)).toBe(before);
    }
  });
  it('does not split a multi-event LINE, accept nonCOMMITTED/zero-event groups or exceed per-page bytes/events', () => {
    let cursor = small.start({ worldVersion: '257', eventSequence: '259' });
    cursor = small.append(cursor, [frames[0]!]);
    const line = frames[1]!;
    for (const bad of [
      { ...line, events: line.events.slice(0, 1) },
      { ...line, receipt: { ...line.receipt, outcome: 'REJECTED' as const } },
      { ...line, events: [] },
    ])
      expect(() => small.append(cursor, [bad])).toThrow();
    const initial = small.start({ worldVersion: '257', eventSequence: '259' });
    expect(() => small.append(initial, frames)).toThrow(/bounded/);
    const huge = { ...frames[0]!, inventoryPostings: ['x'.repeat(1048576)] };
    expect(() => small.append(initial, [huge])).toThrow('page bytes');
    expect(readFinanceSocialReplayContinuation(initial).head).toEqual({
      worldVersion: '0',
      eventSequence: '0',
    });
  });
  it('rejects unknown zero-posting families after a genuine page; hash is not economic validation', () => {
    let cursor = small.start({ worldVersion: '2', eventSequence: '2' });
    cursor = small.append(cursor, [frames[0]!]);
    const command = C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          worldId: world,
          countryId: 'COUNTRY_01',
          officeId: 'FINANCE',
          actorId: 'ACTOR_TEST_ONLY',
          authSubject: '11111111-1111-4111-8111-111111111111',
          commandId: 'COMMAND_UNKNOWN_PAGE',
          idempotencyKey: 'KEY_UNKNOWN_PAGE',
          commandType: 'UNKNOWN_ZERO_POSTING_FAMILY_V1',
          expectedWorldVersion: '1',
          simTime: '1',
          correlationId: 'CORRELATION_UNKNOWN',
          submittedAtReal: at,
          payload: {},
        },
        sha,
      ),
      event = C.parseAuthoritativeEvent(
        {
          schemaVersion: C.EVENT_SCHEMA_VERSION,
          eventId: 'EVENT_UNKNOWN_PAGE',
          eventType: 'UNKNOWN_ZERO_POSTING_EVENT_V1',
          worldId: world,
          causationCommandId: command.commandId,
          correlationId: command.correlationId,
          worldVersion: '2',
          sequence: '2',
          simTime: command.simTime.toCanonicalValue(),
          recordedAtReal: at,
          correctsEventId: null,
          payload: {},
        },
        sha,
      ),
      transition = C.createAuthoritativeTransition({
        command,
        events: [event],
        worldVersionBefore: '1',
        worldVersionAfter: '2',
      }),
      receipt = C.createFinalCommandReceipt({
        command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: at,
      });
    expect(() =>
      small.append(cursor, [
        {
          command,
          events: [event],
          transition,
          receipt,
          financialPostingBatches: [],
          inventoryPostings: [],
        },
      ]),
    ).toThrow(C.DomainError);
    expect(readFinanceSocialReplayContinuation(cursor).head.worldVersion).toBe(
      '1',
    );
  });
  it('only closes an empty prefix at genuine H0 and cannot mint a handle from a JSON checkpoint', () => {
    const cursor = small.start({ worldVersion: '0', eventSequence: '0' }),
      done = small.append(cursor, []);
    expect(readFinanceSocialReplayContinuation(done).complete).toBe(true);
    expect(() => small.append(done, [])).toThrow('completed continuation');
    expect(() =>
      prepareFinanceSocialReplayContinuation(
        {
          opening: JSON.parse(C.canonicalSerialize(small.opening)),
          expectedHead: { worldVersion: '0', eventSequence: '0' },
          socialCountries: [],
          openingEncumbrances: [],
          fxOriginals: [],
        },
        sha,
      ),
    ).toThrow();
    const nonempty = small.start({ worldVersion: '1', eventSequence: '1' });
    expect(() => small.append(nonempty, [])).toThrow('empty page');
  });
  it('rejects mutation of a previously verified page and preserves explicit handle retirement', () => {
    const receipt = { ...frames[0]!.receipt },
      frame = { ...frames[0]!, receipt },
      initial = small.start({ worldVersion: '2', eventSequence: '2' }),
      next = small.append(initial, [frame]);
    receipt.reasonCode = C.DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID;
    expect(() => readFinanceSocialReplayContinuation(next)).toThrow(
      'previous verified page was mutated',
    );
    retireFinanceSocialReplayContinuation(next);
    expect(() => readFinanceSocialReplayContinuation(next)).toThrow(
      'genuine live continuation',
    );
  });
  it('recomputes the actual FX batch semantics after full page hashing', async () => {
    const f = fixture();
    let cursor = f.start({ worldVersion: '2', eventSequence: '2' });
    cursor = f.append(cursor, [await f.budget(cursor, 'BATCH_TAMPER')]);
    const fx = await mixedFxFrame({
        financial:
          readFinanceSocialReplayContinuation(cursor).result.financialState!,
        original: f.f,
        sequence: '2',
        identity: 'BATCH_TAMPER',
        treasuryReservedAmount: '201',
        bankGcuReservedAmount: '10',
      }),
      batches = JSON.parse(C.canonicalSerialize(fx.financialPostingBatches));
    // Even with an exact newly computed whole-page hash, changing an actual
    // ledger leg cannot borrow the legitimate quote/receipt/transition.
    batches[0].legs[0].amount.amount = '9';
    const tampered = { ...fx, financialPostingBatches: batches };
    expect(() => f.append(cursor, [tampered])).toThrow();
    expect(readFinanceSocialReplayContinuation(cursor).head).toEqual({
      worldVersion: '1',
      eventSequence: '1',
    });
  });
  it('reads only the exact private paired H0 and refuses DTO/copied/unpaired preparations', () => {
    const paired = prepareFinanceSocialLedgerFromOpening(small.opening, sha);
    expect(readPreparedFinanceSocialOpening(paired)).toBe(small.opening);
    expect(() => readPreparedFinanceSocialOpening({ ...paired })).toThrow(
      'genuine paired H0',
    );
    expect(() => readPreparedFinanceSocialOpening(JSON.parse('{}'))).toThrow(
      'genuine paired H0',
    );
    expect(() =>
      readPreparedFinanceSocialOpening(
        prepareFinanceSocialLedger(small.opening.financial),
      ),
    ).toThrow('genuine paired H0');
  });
  it('loads a page quote through genuine H0 validation without resetting accumulated Budget or financial state', async () => {
    const f = fixture();
    let cursor = prepareFinanceSocialReplayContinuation(
      {
        opening: f.opening,
        socialCountries: [f.social],
        openingEncumbrances: f.openingEncumbrances,
        fxOriginals: [],
        expectedHead: { worldVersion: '2', eventSequence: '2' },
      },
      sha,
    );
    cursor = f.append(cursor, [await f.budget(cursor, 'LATE_FX')]);
    const fx = await mixedFxFrame({
      financial:
        readFinanceSocialReplayContinuation(cursor).result.financialState!,
      original: f.f,
      sequence: '2',
      identity: 'LATE_FX',
      treasuryReservedAmount: '201',
      bankGcuReservedAmount: '10',
    });
    expect(() => f.append(cursor, [fx])).toThrow();
    const before = readFinanceSocialReplayContinuation(cursor),
      page = f.page(cursor, [fx]);
    const wrong = {
      ...f.fxOriginals[0]!,
      treasuryAsset: small.f.accounts.bankSettlementAsset,
    };
    expect(() =>
      appendFinanceSocialReplayPage({
        continuation: cursor,
        page,
        originals: { fxOriginals: [wrong] },
        sha256Hex: sha,
      }),
    ).toThrow();
    expect(readFinanceSocialReplayContinuation(cursor)).toBe(before);
    cursor = appendFinanceSocialReplayPage({
      continuation: cursor,
      page,
      originals: { fxOriginals: f.fxOriginals },
      sha256Hex: sha,
    });
    const result = readFinanceSocialReplayContinuation(cursor);
    expect(result.complete).toBe(true);
    expect(result.result.budgetEncumbrances).toHaveLength(1);
    expect(
      result.result
        .financialState!.positions.find(
          (p) => p.account.accountId === f.f.accounts.treasuryAsset.accountId,
        )!
        .netDebitBalance.amount.toFixed(),
    ).toBe('990.000001');
    const { fingerprint: _fp, ...intent } = f.f.seed;
    void _fp;
    const foreign = C.createOpeningSeed(
        { ...intent, seedId: C.openingSeedId('SEED_FOREIGN_SAME_WORLD') },
        sha,
      ),
      opening = C.rebuildV08LedgersFromLineage({
        seed: foreign,
        sha256Hex: sha,
      });
    expect(() =>
      prepareFinanceSocialReplayContinuation(
        {
          opening,
          socialCountries: [f.social],
          openingEncumbrances: f.openingEncumbrances,
          fxOriginals: f.fxOriginals,
          expectedHead: { worldVersion: '0', eventSequence: '0' },
        },
        sha,
      ),
    ).toThrow('quote differs from genuine opening seed');
  });
});
