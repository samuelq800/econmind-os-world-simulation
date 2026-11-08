/** TEST_ONLY actual tiny RUN/WORK/WAGE/POWER chain, no SQL/admission or
 * formal source claim. Fixed seed/country/owner must not be relabelled. */
import { createHash } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
import { createIndustryOperatingWageCanonicalFixture } from './industry-operating-wage-canonical-fixture.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  prepareIndustryOperatingWagePayment,
  INDUSTRY_OPERATING_WAGE_POLICY,
} from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import { prepareIndustryUtilityExecution } from '../../packages/core/src/commands/industry-utility-execution.js';
import { DAY_ONE_STORAGE_SELF_USE_POLICY } from '../../packages/core/src/engine-kernels/postwar-day-one-storage-self-use.js';
import {
  prepareIndustryFirstDayPowerExecution,
  type IndustryFirstDayPowerOriginal,
} from '../../packages/core/src/commands/industry-first-day-power-execution.js';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '../../packages/core/src/commands/finance-budget-native.js';
export const industryPowerExecutionTestSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
const sha = industryPowerExecutionTestSha;
export function createIndustryPowerExecutionFixture(
  options: Readonly<{
    sourceBasePins?: Readonly<{ sourceRef: string; sourceRawSha256: string }>;
  }> = {},
) {
  const f = createIndustryOperatingWageCanonicalFixture(false),
    now = f.observedAtReal,
    service = {
      ...f.site,
      facilityId: 'STORAGE_TEST_ONLY',
      sourceRef: 'TEST_ONLY_STORAGE_SERVICE_SITE',
      sourceRawSha256: '9'.repeat(64),
      positions: f.site.positions.map((p) => ({
        ...p,
        positionId: 'POSITION_STORAGE_SERVICE_TEST_ONLY',
        poolId: 'POOL_STORAGE_SERVICE_TEST_ONLY',
      })),
    },
    work0 = createIndustryFirstDayWorkState([f.site, service]);
  function command(
    id: string,
    type: string,
    version: string,
    time: string,
    payload: unknown,
    automatic = false,
    idempotencyKey = id,
  ) {
    return C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: id,
        commandType: type,
        worldId: f.f.worldId,
        countryId: f.f.countryId,
        officeId: automatic ? null : 'INDUSTRY',
        actorId: f.command.actorId,
        authSubject: f.command.authSubject,
        expectedWorldVersion: version,
        idempotencyKey,
        correlationId: 'CORRELATION_' + id,
        submittedAtReal: now,
        simTime: time,
        payload,
      },
      sha,
    );
  }
  const targetTerms = JSON.parse(f.schedule.command.canonicalPayload),
    target = prepareIndustryRunScheduleFrame(
      {
        state: work0,
        command: f.schedule.command,
        head: { worldVersion: '0', eventSequence: '0' },
        observedAtReal: now,
      },
      sha,
    );
  const utilitySource = {
    worldId: f.f.worldId,
    countryId: f.f.countryId,
    locationId: f.site.locationId,
    facilityId: f.site.facilityId,
    operatorId: f.f.operatorId,
    runId: targetTerms.runId,
    seedId: f.f.seed.seedId,
    seedFingerprint: f.f.seed.fingerprint,
    admissionRef: f.site.admissionRef,
    sourceRef: 'TEST_ONLY_ADOPTED_POWER_SOURCE',
    sourceRawSha256: '8'.repeat(64),
    ...options.sourceBasePins,
    policyVersion: DAY_ONE_STORAGE_SELF_USE_POLICY.policyVersion,
    policyRawSha256: DAY_ONE_STORAGE_SELF_USE_POLICY.policyRawSha256,
    userAdoptionRawSha256: DAY_ONE_STORAGE_SELF_USE_POLICY.adoptionRawSha256,
    originals: [
      {
        kind: 'STORAGE_PHYSICAL_ORIGINAL',
        reference: 'TEST_ONLY_STORAGE_RAW',
        rawSha256: '7'.repeat(64),
      },
      {
        kind: 'POWER_SERVICE_WORK_SITE',
        reference: service.sourceRef,
        rawSha256: service.sourceRawSha256,
      },
    ],
  };
  const original: IndustryFirstDayPowerOriginal = {
    source: utilitySource,
    opening: {
      scenarioRef: 'TEST_ONLY_NEW_SCENARIO',
      worldId: f.f.worldId,
      seedFingerprint: f.f.seed.fingerprint,
      countryId: f.f.countryId,
      operatorId: f.f.operatorId,
      storageOwnerId: f.f.operatorId,
      gridOwnerId: f.f.operatorId,
      storageId: service.facilityId,
      gridId: 'GRID_TEST_ONLY',
      sourceRef: 'TEST_ONLY_STORAGE_RAW',
      sourceRawSha256: '7'.repeat(64),
      originalEnergyCapacityMWh: '100',
      originalOpeningSocMWh: '90',
      originalStorageDischargeMW: '1000',
      originalGridMW: '500',
      originalEfficiency: '0.9',
      originalLossFraction: '0.1',
      protectedReservations: [
        {
          reservationRef: 'PUBLIC_EXISTING_TEST_ONLY',
          kind: 'PUBLIC_PRIORITY',
          fromSimTime: '0',
          throughSimTime: '86400000',
          storedEnergyMWh: '5',
          outputMWh: '1',
          sourceRef: 'PUBLIC_TEST_ONLY_SOURCE',
          sourceRawSha256: '6'.repeat(64),
        },
      ],
    },
    serviceFacilityId: service.facilityId,
    serviceRunId: 'RUN_SERVICE_TEST_ONLY',
    serviceWorkSourceRef: service.sourceRef,
    serviceWorkSourceRawSha256: service.sourceRawSha256,
    paymentFrames: [],
  };
  const wageSource = {
    ...f.source,
    facilityId: service.facilityId,
    runId: original.serviceRunId,
    policy: {
      ...f.source.policy,
      sourceRef: service.sourceRef,
      sourceRawSha256: service.sourceRawSha256,
    },
    wages: f.source.wages.map((w) => ({
      ...w,
      positionId: service.positions[0]!.positionId,
      poolId: service.positions[0]!.poolId,
    })),
  };
  function replay(
    frames: readonly Frame[],
    o = original,
    wages: (typeof wageSource)[] = [],
  ) {
    const last = frames.at(-1),
      head = {
        worldVersion: last?.transition.worldVersionAfter ?? '0',
        eventSequence: last?.events.at(-1)?.sequence ?? '0',
      },
      opening = C.rebuildV08LedgersFromLineage({
        seed: f.f.seed,
        sha256Hex: sha,
      });
    let cursor = prepareFinanceSocialReplayContinuation(
      {
        opening,
        expectedHead: head,
        socialCountries: [],
        fxOriginals: [],
        industryWorkSources: [f.site, service],
        industryWageSources: wages,
        industryPowerOriginals: [o],
        openingEncumbrances: [
          {
            reference: f.source.openingEncumbranceRef,
            accountId: f.f.op.asset.accountId,
            amount: f.source.openingReservedAmount,
            currency: 'XAA',
          },
        ],
      },
      sha,
    );
    cursor = appendFinanceSocialReplayPage({
      continuation: cursor,
      sha256Hex: sha,
      page: {
        schemaVersion: 'finance-social-replay-page-v1',
        worldId: f.f.worldId,
        seedFingerprint: f.f.seed.fingerprint,
        fromHead: { worldVersion: '0', eventSequence: '0' },
        throughHead: head,
        expectedHead: head,
        frames,
        framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
      },
    });
    const view = readFinanceSocialReplayContinuation(cursor);
    retireFinanceSocialReplayContinuation(cursor);
    return view;
  }
  function powerCommand(
    id: string,
    version: string,
    time: string,
    operation: Record<string, unknown>,
  ) {
    return command(id, 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1', version, time, {
      schemaVersion: 'industry-first-day-utility-command-v1',
      serviceKind: 'POWER',
      operationRef: id,
      facilityId: utilitySource.facilityId,
      runId: utilitySource.runId,
      sourceRef: utilitySource.sourceRef,
      sourceRawSha256: utilitySource.sourceRawSha256,
      operation,
    });
  }
  function prepare(view: ReturnType<typeof replay>, c: C.CanonicalCommand) {
    const preparation = prepareIndustryUtilityExecution(
        { command: c, replay: view, source: utilitySource },
        sha,
      ),
      state = view.result.industryPowerState;
    if (!state) throw Error('Actual Core POWER state required');
    return prepareIndustryFirstDayPowerExecution({ preparation, state }, sha);
  }
  function commit(draft: ReturnType<typeof prepare>): Frame {
    const step = draft.step;
    return {
      ...step,
      events: step.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: step.command,
        transition: step.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: step.command.simTime,
        recordedAtReal: now,
      }),
    };
  }
  const bookCommand = powerCommand('POWER_BOOK_TEST_ONLY', '1', '0', {
      action: 'BOOK',
      bookingRef: 'POWER_BOOKING_TEST_ONLY',
      purpose: 'PROCESS_WATER_PUMPING_SELF_USE',
      fromSimTime: '0',
      throughSimTime: '72000',
      outputMWh: '9',
    }),
    before = replay([target.frame]),
    draftBook = prepare(before, bookCommand),
    book = commit(draftBook);
  const serviceTerms = {
      ...targetTerms,
      facilityId: service.facilityId,
      runId: original.serviceRunId,
      sourceRef: service.sourceRef,
      sourceRawSha256: service.sourceRawSha256,
    },
    serviceSchedule = prepareIndustryRunScheduleFrame(
      {
        state: target.state,
        command: command(
          'RUN_SERVICE_TEST_ONLY',
          'CORE_INDUSTRY_RUN_SCHEDULE_V1',
          '2',
          '0',
          serviceTerms,
        ),
        head: { worldVersion: '2', eventSequence: '2' },
        observedAtReal: now,
      },
      sha,
    );
  wageSource.schedule = {
    commandId: serviceSchedule.frame.command.commandId,
    commandFingerprint: serviceSchedule.frame.command.fingerprint,
    eventId: serviceSchedule.frame.events[0]!.eventId,
    eventFingerprint: serviceSchedule.frame.events[0]!.fingerprint,
  };
  const allocations = JSON.parse(
      f.workFrame.command.canonicalPayload,
    ).allocations.map((a: Record<string, unknown>) => ({
      ...a,
      positionId: service.positions[0]!.positionId,
      poolId: service.positions[0]!.poolId,
    })),
    work = prepareIndustryFirstDayWorkFrame(
      {
        state: serviceSchedule.state,
        command: command(
          'WORK_SERVICE_TEST_ONLY',
          'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
          '3',
          '72000',
          {
            schemaVersion: 'postwar-industry-work-command-v1',
            runId: original.serviceRunId,
            scheduleCommandFingerprint:
              serviceSchedule.frame.command.fingerprint,
            allocations,
          },
          true,
        ),
        head: { worldVersion: '3', eventSequence: '3' },
        observedAtReal: now,
      },
      sha,
    );
  if (!work.work) throw Error('Actual private service WORK required');
  const prepay = [target.frame, book, serviceSchedule.frame, work.frame],
    prepayView = replay(prepay, original, [wageSource]),
    financial = prepayView.result.financialState!,
    wageState = prepayView.result.industryWageState!,
    key = C.canonicalSha256(
      C.canonicalSerialize([
        f.f.worldId,
        f.f.seed.fingerprint,
        work.frame.events[0]!.fingerprint,
        INDUSTRY_OPERATING_WAGE_POLICY.version,
      ]),
      sha,
    )
      .slice(7)
      .toUpperCase(),
    payCommand = command(
      'WAGE_SERVICE_TEST_ONLY',
      'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1',
      '4',
      '72000',
      {
        schemaVersion: 'industry-operating-wage-payment-v1',
        workEventId: work.frame.events[0]!.eventId,
        workEventFingerprint: work.frame.events[0]!.fingerprint,
        policyVersion: INDUSTRY_OPERATING_WAGE_POLICY.version,
      },
      true,
      'INDUSTRY_WAGE_' + key,
    );
  const paid = prepareIndustryOperatingWagePayment({
      state: wageState,
      financial,
      work: work.work,
      source: wageSource,
      command: payCommand,
      eventSequence: '5',
      observedAtReal: now,
      sha256Hex: sha,
    }),
    payment: Frame = {
      ...paid.step,
      events: paid.step.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: payCommand,
        transition: paid.step.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: payCommand.simTime,
        recordedAtReal: now,
      }),
    },
    withPayment = { ...original, paymentFrames: [payment] },
    frames = [...prepay, payment],
    beforeDelivery = replay(frames, withPayment, [wageSource]),
    deliverCommand = powerCommand('POWER_DELIVER_TEST_ONLY', '5', '72000', {
      action: 'DELIVER',
      bookingRef: 'POWER_BOOKING_TEST_ONLY',
      workEventFingerprint: work.frame.events[0]!.fingerprint,
      paymentEventFingerprint: payment.events[0]!.fingerprint,
    });
  return {
    f,
    original,
    withPayment,
    prepay,
    wageSource,
    frames,
    before,
    beforeDelivery,
    book,
    draftBook,
    deliverCommand,
    replay,
    prepare,
    commit,
    work,
    payment,
    powerCommand,
    command,
    prepayView,
  };
}
