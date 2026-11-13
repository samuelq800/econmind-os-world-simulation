/** Actual Core frames/private full prefix. All originals are explicit tiny
 * TEST_ONLY data, not formal custody, a running World or delivery authority. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryPowerExecutionFixture as fixture,
  industryPowerExecutionTestSha as sha,
} from '../support/industry-power-execution-fixture.js';
import { prepareIndustryOperatingWagePayment } from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import {
  createIndustryFirstDayPowerState,
  extendIndustryFirstDayPowerOriginals,
  readIndustryFirstDayPowerState,
  assertIndustryFirstDayPowerCommitBinding,
  replayIndustryFirstDayPowerFrame,
  readIndustryFirstDayPowerReplayDelivery,
  confirmIndustryFirstDayPowerExecution,
  readIndustryFirstDayPowerExecution,
} from '../../packages/core/src/commands/industry-first-day-power-execution.js';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '../../packages/core/src/commands/finance-budget-native.js';
describe('actual first-day POWER frame replay and complete-prefix delivery witness', () => {
  it('keeps BOOK/drafts non-delivery; exact distinct storage-service WORK and paid batch enable one conserved committed delivery', () => {
    const f = fixture(),
      booked = f.replay([f.frames[0]!, f.book]);
    expect(booked.result.industryPowerState).toBeDefined();
    expect(() =>
      readIndustryFirstDayPowerExecution(f.draftBook as never, sha),
    ).toThrow('GENUINE_CONFIRMED_POWER_EXECUTION_REQUIRED');
    const draft = f.prepare(f.beforeDelivery, f.deliverCommand);
    expect(draft.step.transition.events).toHaveLength(2);
    assertIndustryFirstDayPowerCommitBinding(
      { binding: draft.commitBinding, ...draft.step },
      sha,
    );
    expect(() =>
      assertIndustryFirstDayPowerCommitBinding(
        { binding: {} as typeof draft.commitBinding, ...draft.step },
        sha,
      ),
    ).toThrow('GENUINE_POWER_COMMIT_BINDING_REQUIRED');
    expect(
      readIndustryFirstDayPowerState(
        f.beforeDelivery.result.industryPowerState!,
        sha,
      ).physicalLedgerSnapshots[0]!.remainingSocMWh,
    ).toEqual({ numerator: '90', denominator: '1' });
    expect(() =>
      confirmIndustryFirstDayPowerExecution(
        {
          replay: f.beforeDelivery,
          eventFingerprint: draft.step.transition.events[0]!.fingerprint,
        },
        sha,
      ),
    ).toThrow('ACTUAL_REPLAYED_POWER_DELIVERY_REQUIRED');
    const full = f.replay([...f.frames, f.commit(draft)], f.withPayment, [
        f.wageSource,
      ]),
      eventFingerprint = draft.step.transition.events[0]!.fingerprint,
      actual = confirmIndustryFirstDayPowerExecution(
        { replay: full, eventFingerprint },
        sha,
      ),
      d = readIndustryFirstDayPowerExecution(actual, sha);
    expect(d.purpose).toBe('PROCESS_WATER_PUMPING_SELF_USE');
    expect(d.deliveredMWh).toEqual({ numerator: '81', denominator: '10' });
    expect(d.settlement.storedEnergyWithdrawalMWh).toEqual({
      numerator: '10',
      denominator: '1',
    });
    expect(
      readIndustryFirstDayPowerState(full.result.industryPowerState!, sha)
        .physicalLedgerSnapshots[0]!.remainingSocMWh,
    ).toEqual({ numerator: '80', denominator: '1' });
    expect(d.actualPaidInput.workEventFingerprint).toBe(
      f.work.frame.events[0]!.fingerprint,
    );
    expect(d.actualPaidInput.amount).toBe('4.8');
    expect(d.actualPaidInput.currency).toBe('XAA');
    expect(d.frame.financialPostingBatches).toHaveLength(0);
    expect(full.result.financialState!.appliedBatches).toHaveLength(1);
    expect(() =>
      confirmIndustryFirstDayPowerExecution(
        { replay: JSON.parse(C.canonicalSerialize(full)), eventFingerprint },
        sha,
      ),
    ).toThrow('genuine issued replay view required');
  });
  it('rejects a genuine but uncommitted alternate WAGE frame absent from the actual financial prefix', () => {
    const f = fixture(),
      command = f.command(
        'ORPHAN_WAGE_TEST_ONLY',
        'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1',
        '4',
        '72000',
        JSON.parse(f.payment.command.canonicalPayload),
        true,
        f.payment.command.idempotencyKey!,
      ),
      paid = prepareIndustryOperatingWagePayment({
        state: f.prepayView.result.industryWageState!,
        financial: f.prepayView.result.financialState!,
        work: f.work.work!,
        source: f.wageSource,
        command,
        eventSequence: '5',
        observedAtReal: f.f.observedAtReal,
        sha256Hex: sha,
      }),
      orphan: Frame = {
        ...paid.step,
        events: paid.step.transition.events,
        receipt: C.createFinalCommandReceipt({
          command,
          transition: paid.step.transition,
          outcome: 'COMMITTED',
          reasonCode: null,
          simTime: command.simTime,
          recordedAtReal: f.f.observedAtReal,
        }),
      },
      state = extendIndustryFirstDayPowerOriginals(
        f.beforeDelivery.result.industryPowerState!,
        [{ ...f.original, paymentFrames: [orphan] }],
        sha,
      ),
      operation = {
        ...JSON.parse(f.deliverCommand.canonicalPayload).operation,
        paymentEventFingerprint: orphan.events[0]!.fingerprint,
      },
      attempted = f.powerCommand(
        'POWER_ORPHAN_TEST_ONLY',
        '5',
        '72000',
        operation,
      ),
      goodDraft = f.prepare(f.beforeDelivery, f.deliverCommand),
      goodFrame = f.commit(goodDraft);
    // The immutable alternate is valid Core arithmetic, but was never applied
    // to the genuine full prefix. Supply it via a changed command to the fixed
    // history reducer; it must refuse before creating any delivery/state debit.
    const frame = {
      ...goodFrame,
      command: attempted,
      transition: C.createAuthoritativeTransition({
        command: attempted,
        worldVersionBefore: '5',
        worldVersionAfter: '6',
        events: goodFrame.events.map((e) =>
          C.parseAuthoritativeEvent(
            {
              schemaVersion: C.EVENT_SCHEMA_VERSION,
              eventId: e.eventId,
              eventType: e.eventType,
              worldId: attempted.worldId,
              worldVersion: '6',
              sequence: e.sequence,
              simTime: '72000',
              causationCommandId: attempted.commandId,
              correlationId: attempted.correlationId,
              correctsEventId: null,
              recordedAtReal: e.recordedAtReal,
              payload: JSON.parse(e.canonicalPayload),
            },
            sha,
          ),
        ),
      }),
    };
    const actualFrame = {
      ...frame,
      events: frame.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: attempted,
        transition: frame.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: attempted.simTime,
        recordedAtReal: f.f.observedAtReal,
      }),
    };
    expect(() =>
      replayIndustryFirstDayPowerFrame(
        {
          state,
          frame: actualFrame,
          financial: f.beforeDelivery.result.financialState!,
          industryWorkState: f.beforeDelivery.result.industryWorkState!,
          industryWageState: f.beforeDelivery.result.industryWageState!,
        },
        sha,
      ),
    ).toThrow('PAYMENT_MUST_ALREADY_BE_IN_GENUINE_FINANCIAL_PREFIX');
    expect(
      readIndustryFirstDayPowerState(state, sha).physicalLedgerSnapshots[0]!
        .remainingSocMWh,
    ).toEqual({ numerator: '90', denominator: '1' });
  });
  it('refuses declared source bookkeeping, manufacturer labour, changed shared protection, uncommitted groups and extra journals', () => {
    const f = fixture();
    expect(() =>
      createIndustryFirstDayPowerState(
        [{ ...f.original, serviceFacilityId: f.original.source.facilityId }],
        sha,
      ),
    ).toThrow('EXACT_ADOPTED_POWER_ORIGINALS_REQUIRED');
    const state = createIndustryFirstDayPowerState([f.original], sha);
    expect(() =>
      extendIndustryFirstDayPowerOriginals(
        state,
        [
          {
            ...f.original,
            opening: { ...f.original.opening, protectedReservations: [] },
          },
        ],
        sha,
      ),
    ).toThrow('REGISTERED_POWER_ORIGINAL_CHANGED');
    const draft = f.prepare(f.beforeDelivery, f.deliverCommand),
      frame = f.commit(draft),
      context = {
        financial: f.beforeDelivery.result.financialState!,
        industryWorkState: f.beforeDelivery.result.industryWorkState!,
        industryWageState: f.beforeDelivery.result.industryWageState!,
      },
      prior = f.beforeDelivery.result.industryPowerState!;
    expect(() =>
      replayIndustryFirstDayPowerFrame(
        {
          state: prior,
          ...context,
          frame: {
            ...frame,
            receipt: { ...frame.receipt, outcome: 'REJECTED' },
          },
        },
        sha,
      ),
    ).toThrow('ACTUAL_COMMITTED_POWER_RECEIPT_REQUIRED');
    expect(() =>
      replayIndustryFirstDayPowerFrame(
        {
          state: prior,
          ...context,
          frame: { ...frame, inventoryPostings: [{}] },
        },
        sha,
      ),
    ).toThrow('ZERO_JOURNALS_REQUIRED');
    const before = f.replay(f.prepay, f.withPayment, [f.wageSource]);
    const unpaid = f.powerCommand(
      'POWER_UNPAID_TEST_ONLY',
      '4',
      '72000',
      JSON.parse(f.deliverCommand.canonicalPayload).operation,
    );
    expect(() => f.prepare(before, unpaid)).toThrow(
      'ACTUAL_DISTINCT_PAID_POWER_SERVICE_WORK_REQUIRED',
    );
    const next = replayIndustryFirstDayPowerFrame(
      { state: prior, ...context, frame },
      sha,
    );
    expect(
      replayIndustryFirstDayPowerFrame({ state: next, ...context, frame }, sha),
    ).toBe(next);
    expect(
      readIndustryFirstDayPowerReplayDelivery(
        next,
        frame.events[0]!.fingerprint,
        sha,
      ).deliveredMWh,
    ).toEqual({ numerator: '81', denominator: '10' });
  });
});
