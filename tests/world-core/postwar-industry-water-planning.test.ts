import { describe, expect, it } from 'vitest';
import {
  createIndustryWaterExecutionFixture,
  waterExecutionSha as sha,
} from '../support/industry-water-execution-fixture.js';
import { readIndustryFirstDayWaterExecutionState } from '../../packages/core/src/commands/industry-first-day-water-execution.js';
import {
  readIndustryFirstDayPowerState,
  readIndustryFirstDayPowerReplayDelivery,
} from '../../packages/core/src/commands/industry-first-day-power-execution.js';
import {
  readIndustryFirstDayWorkState,
  readIndustryCompletedWork,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import { selectPostwarIndustryWaterPlanningInputs as select } from '../../apps/world-worker/src/persistence/postwar-industry-water-planning.js';

function actualInputs() {
  const f = createIndustryWaterExecutionFixture(),
    replay = f.beforeWater,
    water = readIndustryFirstDayWaterExecutionState(
      replay.result.industryWaterState!,
      sha,
    ),
    power = readIndustryFirstDayPowerState(
      replay.result.industryPowerState!,
      sha,
    ),
    run = readIndustryFirstDayWorkState(
      replay.result.industryWorkState!,
    ).runs.find((r) => r.terms.runId === f.waterOriginal.source.runId)!;
  const input: Parameters<typeof select>[0] = {
    scope: {
      ...f.waterOriginal.source,
      startsAtSimTime: run.terms.startsAtSimTime,
      endsAtSimTime: run.terms.endsAtSimTime,
      serviceFacilityId: f.waterOriginal.serviceFacilityId!,
      serviceRunId: f.waterOriginal.serviceRunId!,
    },
    observedAtSimTime: '72000',
    headWorldVersion: replay.head.worldVersion,
    registeredRights: water.registeredRights,
    fromTicks: '0',
    alreadyDelivered: false,
    works: readIndustryFirstDayWorkState(replay.result.industryWorkState!)
      .completedWorks.map(readIndustryCompletedWork)
      .map((w) => ({
        ...w.data,
        workEventFingerprint: w.frame.events[0]!.fingerprint,
      })),
    payments: water.paymentFrames.map((frame) => {
      const body = JSON.parse(frame.events[0]!.canonicalPayload);
      return {
        ...body.source,
        workEventFingerprint: body.workEventFingerprint,
        paymentEventFingerprint: frame.events[0]!.fingerprint,
        paidAtSimTime: frame.command.simTime.toCanonicalValue(),
        worldVersionAfter: frame.transition.worldVersionAfter,
      };
    }),
    paidWork: replay.result.industryWageState!.paidWork,
    usedPaidEvents: water.usedPaidEventFingerprints,
    power: power.committedDeliveryEventFingerprints.map((fp) => {
      const d = readIndustryFirstDayPowerReplayDelivery(
        replay.result.industryPowerState!,
        fp,
        sha,
      );
      return {
        ...d,
        eventFingerprint: fp,
        committedAtSimTime: d.frame.command.simTime.toCanonicalValue(),
        worldVersionAfter: d.frame.transition.worldVersionAfter,
        usedMWh: { numerator: '0', denominator: '1' },
      };
    }),
  };
  return { f, input };
}

describe('water planning from actual paid Core work and delivered power', () => {
  it('selects immutable references without submitting a command or claiming delivery', () => {
    const { f, input } = actualInputs();
    expect(select(input)).toEqual({
      status: 'REFERENCES_AVAILABLE_NOT_AUTHORITY',
      fromTicks: '0',
      workEventFingerprint: f.waterPaid.work.events[0]!.fingerprint,
      paymentEventFingerprint: f.waterPaid.payment.events[0]!.fingerprint,
      powerEventFingerprints: [f.powerDelivery.events[0]!.fingerprint],
    });
    expect(
      readIndustryFirstDayWaterExecutionState(
        f.beforeWater.result.industryWaterState!,
        sha,
      ).committedDeliveryEventFingerprints,
    ).toEqual([]);
    expect(f.beforeWater.head).toEqual({
      worldVersion: '10',
      eventSequence: '11',
    });
  });
  it('distinguishes unavailable Clock, actual zero time, missing right and expiry', () => {
    const { input } = actualInputs();
    expect(select({ ...input, observedAtSimTime: null })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'REGISTERED_CLOCK_REQUIRED',
    });
    expect(select({ ...input, observedAtSimTime: '0' })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_INTERVAL_NOT_ELAPSED',
    });
    expect(select({ ...input, registeredRights: [] })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_RIGHT_REQUIRED',
    });
    expect(select({ ...input, observedAtSimTime: '86400000' })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_RUN_EXPIRED',
    });
    expect(select({ ...input, alreadyDelivered: true })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_ALREADY_DELIVERED',
    });
  });
  it('requires same-country OP water service labour covering every extraction instant and actual wages', () => {
    const { input } = actualInputs();
    expect(select({ ...input, works: [] })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_SERVICE_WORK_REQUIRED',
    });
    expect(
      select({
        ...input,
        works: input.works.map((w) => ({ ...w, operatorId: 'FOREIGN_OP' })),
      }),
    ).toEqual({ status: 'BLOCKED', reasonCode: 'WATER_SERVICE_WORK_REQUIRED' });
    expect(
      select({
        ...input,
        works: input.works.map((w) => ({
          ...w,
          allocations: w.allocations.map((a) => ({
            ...a,
            startsAtSimTime: '1',
          })),
        })),
      }),
    ).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_SERVICE_COVERAGE_REQUIRED',
    });
    expect(select({ ...input, payments: [] })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_SERVICE_PAYMENT_REQUIRED',
    });
    expect(select({ ...input, paidWork: [] })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_SERVICE_PAYMENT_REQUIRED',
    });
    expect(
      select({
        ...input,
        payments: input.payments.map((p) => ({
          ...p,
          countryId: 'FOREIGN_COUNTRY',
        })),
      }),
    ).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_SERVICE_PAYMENT_REQUIRED',
    });
  });
  it('requires same RUN actual pumping power, rejects spent power and payment reuse', () => {
    const { f, input } = actualInputs();
    expect(select({ ...input, power: [] })).toEqual({
      status: 'BLOCKED',
      reasonCode: 'POWER_DELIVERY_REQUIRED',
    });
    expect(
      select({
        ...input,
        power: input.power.map((p) => ({ ...p, purpose: 'INDUSTRY_SELF_USE' })),
      }),
    ).toEqual({ status: 'BLOCKED', reasonCode: 'POWER_DELIVERY_REQUIRED' });
    expect(
      select({
        ...input,
        power: input.power.map((p) => ({ ...p, usedMWh: p.deliveredMWh })),
      }),
    ).toEqual({ status: 'BLOCKED', reasonCode: 'POWER_DELIVERY_REQUIRED' });
    expect(
      select({
        ...input,
        usedPaidEvents: [f.waterPaid.payment.events[0]!.fingerprint],
      }),
    ).toEqual({
      status: 'BLOCKED',
      reasonCode: 'WATER_SERVICE_PAYMENT_REQUIRED',
    });
  });
});
