/** Tiny genuine paired H0 and actual Core RUN/WORK. Pure DATA replay only;
 * this does not grant OP representation, source admission or a native write. */
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialLedgerFromOpening,
  replayPreparedFinanceSocialFxLedger,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  readIndustryFirstDayWorkState,
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  createIndustryFirstDayWorkCoreFixture,
  industryWorkTestSha as sha,
} from '../support/industry-first-day-work-core-fixture.js';
import { createIndustryOperatingWageCanonicalFixture } from '../support/industry-operating-wage-canonical-fixture.js';
import { prepareIndustryOperatingWagePayment } from '../../packages/core/src/commands/industry-operating-wage-payment.js';
function fixture() {
  const f = createIndustryFirstDayWorkCoreFixture();
  const original = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_WORK_PAIRED'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY',
      locator: 'fixture://TEST_ONLY_WORK_CORE',
      payload: {},
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_WORK_PAIRED'),
      worldId: C.worldId(f.source.worldId),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [original],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const opening = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha }),
    prepared = prepareFinanceSocialLedgerFromOpening(opening, sha);
  const source = {
    ...f.source,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
  };
  const initial = createIndustryFirstDayWorkState([source]);
  const scheduled = prepareIndustryRunScheduleFrame(
    {
      state: initial,
      command: f.schedule.command,
      head: { worldVersion: '0', eventSequence: '0' },
      observedAtReal: '2026-11-01T00:00:00.000Z',
    },
    sha,
  );
  const worked = prepareIndustryFirstDayWorkFrame(
    {
      state: scheduled.state,
      command: f.frame.command,
      head: { worldVersion: '1', eventSequence: '1' },
      observedAtReal: '2026-11-01T00:00:00.000Z',
    },
    sha,
  );
  return { source, prepared, frames: [scheduled.frame, worked.frame] };
}
describe('same complete mixed Core fold actually reduces Industry stage effects', () => {
  it('replays schedule+work against the genuine paired base and preserves current ledger brands/head without inventing money or stock', () => {
    const f = fixture();
    const replay = replayPreparedFinanceSocialFxLedger({
      prepared: f.prepared,
      frames: f.frames,
      socialCountries: [],
      openingEncumbrances: [],
      fxOriginals: [],
      industryWorkSources: [f.source],
      expectedHead: { worldVersion: '2', eventSequence: '2' },
      sha256Hex: sha,
    });
    expect(
      readIndustryFirstDayWorkState(replay.industryWorkState!).runs[0]
        ?.performedPersonMilliseconds,
    ).toBe('230400');
    expect(replay.financial.worldVersion).toBe('2');
    expect(replay.financial.accounts).toEqual([]);
    expect(replay.inventory?.worldVersion).toBe('2');
  });
  it('refuses missing/wrong-seed sources and undeclared posting effects instead of dropping the stages', () => {
    const f = fixture();
    const base = {
      prepared: f.prepared,
      frames: f.frames,
      socialCountries: [],
      openingEncumbrances: [],
      fxOriginals: [],
      expectedHead: { worldVersion: '2', eventSequence: '2' },
      sha256Hex: sha,
    };
    expect(() => replayPreparedFinanceSocialFxLedger(base)).toThrow(
      'ACTUAL_INDUSTRY_WORK_ORIGINALS_REQUIRED',
    );
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        ...base,
        industryWorkSources: [
          { ...f.source, seedFingerprint: 'sha256:' + 'f'.repeat(64) },
        ],
      }),
    ).toThrow('INDUSTRY_EXACT_GENUINE_PAIRED_H0');
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        ...base,
        industryWorkSources: [f.source],
        frames: [f.frames[0]!, { ...f.frames[1]!, inventoryPostings: [{}] }],
      }),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_POSTING_EFFECT');
  });
  it('releases only actually paid money from the exact original aggregate reservation once', () => {
    const f = createIndustryOperatingWageCanonicalFixture(false);
    const paid = prepareIndustryOperatingWagePayment(f);
    const wageFrame = {
      ...paid.step,
      events: paid.step.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: f.command,
        transition: paid.step.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: f.command.simTime,
        recordedAtReal: f.observedAtReal,
      }),
    };
    const opening = C.rebuildV08LedgersFromLineage({
      seed: f.f.seed,
      sha256Hex: sha,
    });
    const input = {
      prepared: prepareFinanceSocialLedgerFromOpening(opening, sha),
      frames: [f.schedule, f.workFrame, wageFrame],
      socialCountries: [],
      openingEncumbrances: [
        {
          reference: f.source.openingEncumbranceRef,
          accountId: f.f.op.asset.accountId,
          currency: 'XAA',
          amount: '100',
        },
      ],
      fxOriginals: [],
      industryWorkSources: [f.site],
      industryWageSources: [f.source],
      expectedHead: { worldVersion: '3', eventSequence: '3' },
      sha256Hex: sha,
    };
    const replay = replayPreparedFinanceSocialFxLedger(input);
    expect(
      replay.industryWageState?.reservationReleases.map((r) => [
        r.openingEncumbranceRef,
        r.amount,
      ]),
    ).toEqual([[f.source.openingEncumbranceRef, '4.8']]);
    expect(
      replay.financial.positions
        .find((p) => p.account.accountId === f.f.op.asset.accountId)
        ?.netDebitBalance.amount.toString(),
    ).toBe('95.2');
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        ...input,
        openingEncumbrances: [
          { ...input.openingEncumbrances[0]!, reference: 'OTHER_PURPOSE' },
        ],
      }),
    ).toThrow('EXACT_OPENING_WAGE_RESERVATION_RELEASE_REQUIRED');
  });
});
