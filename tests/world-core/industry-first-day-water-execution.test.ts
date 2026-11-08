/** Real Core constructors/full-prefix replay with explicit TEST_ONLY custody.
 * No native grant/source authority or running World delivery is asserted. */
import { describe, it, expect } from 'vitest';
import {
  createIndustryWaterExecutionFixture,
  waterExecutionSha as sha,
} from '../support/industry-water-execution-fixture.js';
import {
  readIndustryFirstDayWaterExecutionState,
  readIndustryFirstDayWaterExecution,
  confirmIndustryFirstDayWaterExecution,
  replayIndustryFirstDayWaterExecutionFrame,
  extendIndustryFirstDayWaterExecutionOriginals,
} from '../../packages/core/src/commands/industry-first-day-water-execution.js';
import { createProductionWaterConsumptionStateFromIndustryWaterExecution } from '../../packages/core/src/inventory/production-water-consumption.js';

describe('actual first-day water grant and committed delivery', () => {
  it('registers a bounded committed right; a draft or mathematical result never proves delivery', () => {
    const f = createIndustryWaterExecutionFixture();
    expect(
      readIndustryFirstDayWaterExecutionState(
        f.beforeGrant.result.industryWaterState!,
        sha,
      ).registeredRights,
    ).toHaveLength(0);
    expect(f.grant.events).toHaveLength(1);
    expect(
      readIndustryFirstDayWaterExecutionState(
        f.beforeWater.result.industryWaterState!,
        sha,
      ).registeredRights,
    ).toHaveLength(1);
    expect(() =>
      readIndustryFirstDayWaterExecution(f.grantDraft as never, sha),
    ).toThrow('GENUINE_CONFIRMED_WATER_EXECUTION_REQUIRED');
    expect(() =>
      createProductionWaterConsumptionStateFromIndustryWaterExecution(
        { execution: f.grantDraft as never },
        sha,
      ),
    ).toThrow('GENUINE_CONFIRMED_WATER_EXECUTION_REQUIRED');
  });
  it('requires actual distinct paid water WORK and sufficient previously committed power, then confirms only the complete after-prefix', () => {
    const f = createIndustryWaterExecutionFixture(),
      draft = f.waterDraft(f.beforeWater, f.waterCommand, f.waterFinal.source),
      frame = f.commit(draft);
    expect(frame.events).toHaveLength(2);
    expect(() =>
      confirmIndustryFirstDayWaterExecution(
        {
          replay: f.beforeWater,
          eventFingerprint: frame.events[0]!.fingerprint,
        },
        sha,
      ),
    ).toThrow('ACTUAL_REPLAYED_WATER_DELIVERY_REQUIRED');
    const after = f.replay(
        [...f.frames, frame],
        f.waterFinal,
        f.powerWithPayment,
      ),
      token = confirmIndustryFirstDayWaterExecution(
        { replay: after, eventFingerprint: frame.events[0]!.fingerprint },
        sha,
      ),
      delivery = readIndustryFirstDayWaterExecution(token, sha),
      state = createProductionWaterConsumptionStateFromIndustryWaterExecution(
        { execution: token },
        sha,
      );
    expect(delivery.accounts[0]!.delivered).toEqual({
      numerator: '1',
      denominator: '10',
      unit: 'm3',
    });
    expect(
      delivery.scenarioRecord.lines[0]!.additionalWaterElectricityRequirement,
    ).toEqual({ numerator: '500000', denominator: '14087209', unit: 'MWh' });
    expect(delivery.powerUses).toHaveLength(1);
    expect(delivery.actualPaidInput.workEventFingerprint).toBe(
      f.waterPaid.work.events[0]!.fingerprint,
    );
    expect(state.accounts[0]!.targetRunId).toBe('RUN_TARGET_TEST_ONLY');
    expect(state.accounts[0]!.facilityRef).toBe('OPEN-02-REFINED_FUEL');
    expect(state.accounts[0]!.consumed.numerator).toBe('0');
    expect(state.accounts[0]!.expiresAtTicks).toBe('86400000');
    expect(state.accounts[0]!.sourceRecipeRef).toBe(
      'SCENARIO-RECIPE-REFINED_FUEL',
    );
    expect(() =>
      confirmIndustryFirstDayWaterExecution(
        {
          replay: { ...after },
          eventFingerprint: frame.events[0]!.fingerprint,
        },
        sha,
      ),
    ).toThrow();
    const replayed = f.replay(
      [...f.frames, frame],
      f.waterFinal,
      f.powerWithPayment,
      2,
    );
    expect(replayed.pageCount).toBe('6');
    expect(
      readIndustryFirstDayWaterExecutionState(
        replayed.result.industryWaterState!,
        sha,
      ).committedDeliveryEventFingerprints,
    ).toEqual([frame.events[0]!.fingerprint]);
  });
  it('rejects a fabricated power reference, manufacturing/service substitution and a second delivery for the same RUN', () => {
    const f = createIndustryWaterExecutionFixture(),
      body = JSON.parse(f.waterCommand.canonicalPayload);
    const altered = (id: string, operation: Record<string, unknown>) =>
      f.command(id, f.waterCommand.commandType, '10', '72000', {
        ...body,
        operation: { ...body.operation, ...operation },
      });
    expect(() =>
      f.waterDraft(
        f.beforeWater,
        altered('WATER_BAD_POWER', {
          powerEventFingerprints: ['sha256:' + '0'.repeat(64)],
        }),
        f.waterFinal.source,
      ),
    ).toThrow('ACTUAL_REPLAYED_POWER_DELIVERY_REQUIRED');
    expect(() =>
      f.waterDraft(
        f.beforeWater,
        altered('WATER_WRONG_PAID', {
          workEventFingerprint: f.powerPaid.work.events[0]!.fingerprint,
          paymentEventFingerprint: f.powerPaid.payment.events[0]!.fingerprint,
        }),
        f.waterFinal.source,
      ),
    ).toThrow('WATER_SERVICE_WORK_NOT_MANUFACTURING_REQUIRED');
    const frame = f.commit(
        f.waterDraft(f.beforeWater, f.waterCommand, f.waterFinal.source),
      ),
      after = f.replay([...f.frames, frame], f.waterFinal, f.powerWithPayment);
    expect(() =>
      f.waterDraft(
        after,
        f.command(
          'WATER_DUPLICATE',
          f.waterCommand.commandType,
          '11',
          '72000',
          body,
        ),
        f.waterFinal.source,
      ),
    ).toThrow('RUN_WATER_ALREADY_DELIVERED');
  });
  it('keeps water unserved when genuine power is insufficient or the actual right is absent/expired', () => {
    const insufficient = createIndustryWaterExecutionFixture('0.001');
    expect(() =>
      insufficient.waterDraft(
        insufficient.beforeWater,
        insufficient.waterCommand,
        insufficient.waterFinal.source,
      ),
    ).toThrow('SUFFICIENT_ACTUAL_POWER_MUST_PRECEDE_WATER_DELIVERY');
    const f = createIndustryWaterExecutionFixture(),
      body = JSON.parse(f.waterCommand.canonicalPayload);
    expect(() =>
      f.waterDraft(
        f.beforeGrant,
        f.command(
          'WATER_NO_RIGHT',
          f.waterCommand.commandType,
          '1',
          '72000',
          body,
        ),
        f.waterOriginal.source,
      ),
    ).toThrow('ACTUAL_PRIOR_COMMITTED_WATER_RIGHT_REQUIRED');
    expect(() =>
      f.waterDraft(
        f.beforeWater,
        f.command(
          'WATER_EXPIRED',
          f.waterCommand.commandType,
          '10',
          '86400000',
          body,
        ),
        f.waterFinal.source,
      ),
    ).toThrow('ACTUAL_RIGHT_RUN_PERIOD_EXPIRED_OR_OUT_OF_SCOPE');
    expect(
      readIndustryFirstDayWaterExecutionState(
        insufficient.beforeWater.result.industryWaterState!,
        sha,
      ).committedDeliveryEventFingerprints,
    ).toEqual([]);
  });
  it('rejects wrong grant pins and mutated canonical water events without advancing the input state', () => {
    const f = createIndustryWaterExecutionFixture(),
      state = f.beforeGrant.result.industryWaterState!;
    expect(() =>
      extendIndustryFirstDayWaterExecutionOriginals(
        {
          state,
          originals: [
            {
              ...f.waterOriginal,
              grantEligibilityOriginal: {
                ...f.waterOriginal.grantEligibilityOriginal!,
                rawText: '{}',
              },
            },
          ],
        },
        sha,
      ),
    ).toThrow('SAME_SOURCE_SCOPE_CHANGED');
    const frame = f.commit(
        f.waterDraft(f.beforeWater, f.waterCommand, f.waterFinal.source),
      ),
      bad = { ...frame, financialPostingBatches: [{}] };
    expect(() =>
      replayIndustryFirstDayWaterExecutionFrame(
        {
          state: f.beforeWater.result.industryWaterState!,
          frame: bad,
          sourceInputs: f.waterFinal,
          prior: {
            head: f.beforeWater.head,
            financial: f.beforeWater.result.financialState!,
            inventory: f.beforeWater.result.inventoryState!,
            industryWorkState: f.beforeWater.result.industryWorkState!,
            industryWageState: f.beforeWater.result.industryWageState!,
            industryPowerState: f.beforeWater.result.industryPowerState!,
          },
        },
        sha,
      ),
    ).toThrow('FULL_COMMITTED_WATER_FRAME_AND_ZERO_JOURNALS_REQUIRED');
    expect(
      readIndustryFirstDayWaterExecutionState(
        f.beforeWater.result.industryWaterState!,
        sha,
      ).committedDeliveryEventFingerprints,
    ).toEqual([]);
  });
});
