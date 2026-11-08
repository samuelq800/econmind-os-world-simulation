/** Genuine small Core lineages, TEST_ONLY source identity. These checks prove
 * full-prefix dispatch and failure atomicity, not SQL custody or deployment. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceNativeBudgetFinancialReplay,
  prepareFinanceNativeBudgetMixedPrefix,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  INDUSTRY_UTILITY_COMMANDS,
  INDUSTRY_UTILITY_EVENTS,
  type IndustryUtilityKind,
} from '../../packages/core/src/commands/industry-utility-execution.js';
import { prepareIndustryOperatingWagePayment } from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import { createIndustryOperatingWageCanonicalFixture } from '../support/industry-operating-wage-canonical-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture(kind: IndustryUtilityKind, unknownFamily = false) {
  const f = createIndustryOperatingWageCanonicalFixture(false),
    paid = prepareIndustryOperatingWagePayment(f),
    payment = {
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
    },
    frames = [f.schedule, f.workFrame, payment],
    opening = C.rebuildV08LedgersFromLineage({
      seed: f.f.seed,
      sha256Hex: sha,
    }),
    encumbrances = [
      {
        reference: f.source.openingEncumbranceRef,
        accountId: f.f.op.asset.accountId,
        currency: 'XAA',
        amount: '100',
      },
    ],
    command = C.parseCanonicalCommand(
      {
        schemaVersion: 'command-v1',
        commandId: 'COMMAND_TEST_ONLY_UNINSTALLED_' + kind,
        commandType: unknownFamily
          ? 'INDUSTRY_UNREGISTERED_ZERO_EFFECT_V1'
          : INDUSTRY_UTILITY_COMMANDS[kind],
        worldId: f.f.worldId,
        countryId: f.f.countryId,
        officeId: 'INDUSTRY',
        actorId: 'ACTOR_TEST_ONLY_UTILITY',
        authSubject: '11111111-1111-4111-8111-111111111111',
        correlationId: 'CORRELATION_TEST_ONLY_UNINSTALLED_' + kind,
        expectedWorldVersion: '3',
        idempotencyKey: 'KEY_TEST_ONLY_UNINSTALLED_' + kind,
        simTime: f.command.simTime.toCanonicalValue(),
        submittedAtReal: f.observedAtReal,
        payload: {
          schemaVersion: 'industry-first-day-utility-command-v1',
          serviceKind: kind,
          operationRef: 'OPERATION_TEST_ONLY_UNINSTALLED_' + kind,
          facilityId: f.site.facilityId,
          runId: f.source.runId,
          sourceRef: 'SOURCE_TEST_ONLY_NOT_INSTALLED',
          sourceRawSha256: 'a'.repeat(64),
          operation: { action: 'BOOK' },
        },
      },
      sha,
    ),
    event = C.parseAuthoritativeEvent(
      {
        schemaVersion: 'event-v1',
        eventId: 'EVENT_TEST_ONLY_UNINSTALLED_' + kind,
        eventType: INDUSTRY_UTILITY_EVENTS[kind],
        worldId: f.f.worldId,
        sequence: '4',
        worldVersion: '4',
        simTime: command.simTime.toCanonicalValue(),
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        correctsEventId: null,
        recordedAtReal: f.observedAtReal,
        payload: {
          classification: 'TEST_ONLY_UNINSTALLED_SOURCE_NOT_A_DELIVERY',
        },
      },
      sha,
    ),
    transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '3',
      worldVersionAfter: '4',
      events: [event],
    }),
    frame = {
      command,
      events: [event],
      transition,
      receipt: C.createFinalCommandReceipt({
        command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: f.observedAtReal,
      }),
      financialPostingBatches: [],
      inventoryPostings: [],
    };
  return {
    f,
    opening,
    encumbrances,
    frames,
    frame,
    financialReplay: prepareFinanceNativeBudgetFinancialReplay(
      {
        financial: opening.financial,
        opening,
        openingEncumbrances: encumbrances,
        fxOriginals: [],
      },
      sha,
    ),
  };
}
describe('fixed utilities in complete Finance/Social prefix', () => {
  it.each([
    ['POWER', 'ACTUAL_UTILITY_POWER_SOURCE_WORK_AND_FINANCIAL_REQUIRED'],
    ['WATER', 'ACTUAL_UTILITY_WATER_SOURCE_AND_PAIRED_LEDGERS_REQUIRED'],
    ['LOGISTICS', 'EXACT_INSTALLED_UTILITY_LOGISTICS_ORIGINAL_REQUIRED'],
  ] as const)(
    'rejects %s without actual installed originals, despite a canonical zero-journal COMMITTED envelope',
    (kind, code) => {
      const f = fixture(kind);
      expect(() =>
        prepareFinanceNativeBudgetMixedPrefix(
          {
            worldId: f.f.f.worldId,
            financialReplay: f.financialReplay,
            socialCountries: [],
            industryWorkSources: [f.f.site],
            industryWageSources: [f.f.source],
            frames: [...f.frames, f.frame],
          },
          sha,
        ),
      ).toThrow(code);
    },
  );
  it('rejects an unknown family even when the full group claims no posting effects', () => {
    const f = fixture('POWER', true);
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          worldId: f.f.f.worldId,
          financialReplay: f.financialReplay,
          socialCountries: [],
          industryWorkSources: [f.f.site],
          industryWageSources: [f.f.source],
          frames: [...f.frames, f.frame],
        },
        sha,
      ),
    ).toThrow();
  });
  it('never accepts a serializable Ready object as private logistics sources', () => {
    const f = fixture('LOGISTICS');
    expect(() =>
      prepareFinanceNativeBudgetMixedPrefix(
        {
          worldId: f.f.f.worldId,
          financialReplay: f.financialReplay,
          socialCountries: [],
          industryWorkSources: [f.f.site],
          industryWageSources: [f.f.source],
          frames: [],
          industryLogisticsSources: [{ ready: true } as never],
        },
        sha,
      ),
    ).toThrow('GENUINE_LOGISTICS_REPLAY_SOURCE_DATA_REQUIRED');
  });
  it('retains the previous genuine continuation after a utility page fails its source checks', () => {
    const f = fixture('POWER'),
      expected = { worldVersion: '4', eventSequence: '4' },
      start = prepareFinanceSocialReplayContinuation(
        {
          opening: f.opening,
          expectedHead: expected,
          socialCountries: [],
          openingEncumbrances: f.encumbrances,
          fxOriginals: [],
          industryWorkSources: [f.f.site],
          industryWageSources: [f.f.source],
        },
        sha,
      ),
      cursor = appendFinanceSocialReplayPage({
        continuation: start,
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.f.f.worldId,
          seedFingerprint: f.f.f.seed.fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: { worldVersion: '3', eventSequence: '3' },
          expectedHead: expected,
          frames: f.frames,
          framesSha256: C.canonicalSha256(C.canonicalHashInput(f.frames), sha),
        },
      }),
      before = readFinanceSocialReplayContinuation(cursor);
    expect(() =>
      appendFinanceSocialReplayPage({
        continuation: cursor,
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.f.f.worldId,
          seedFingerprint: f.f.f.seed.fingerprint,
          fromHead: { worldVersion: '3', eventSequence: '3' },
          throughHead: expected,
          expectedHead: expected,
          frames: [f.frame],
          framesSha256: C.canonicalSha256(C.canonicalHashInput([f.frame]), sha),
        },
      }),
    ).toThrow('ACTUAL_UTILITY_POWER_SOURCE_WORK_AND_FINANCIAL_REQUIRED');
    expect(readFinanceSocialReplayContinuation(cursor)).toBe(before);
    expect(before.head).toEqual({ worldVersion: '3', eventSequence: '3' });
    expect(before.complete).toBe(false);
    retireFinanceSocialReplayContinuation(cursor);
  });
});
