/** TEST_ONLY genuine Core schedule/WORK replay; never actual DB admission. */
import * as C from '../../packages/core/src/index.js';
import {
  INDUSTRY_FIRST_DAY_POLICY_VERSION as policyVersion,
  INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256 as policyRawSha256,
  INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256 as adoption,
} from '../../packages/core/src/inventory/production-operating-basis.js';
import {
  createIndustryFirstDayWorkState,
  replayIndustryFirstDayRunFrame,
  type IndustryFirstDayWorkSiteSource,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  industryWageFixture,
  wageSha as sha,
} from '../support/industry-operating-wage-fixture.js';
import {
  INDUSTRY_OPERATING_WAGE_COMMAND,
  INDUSTRY_OPERATING_WAGE_POLICY,
  createIndustryOperatingWageState,
  prepareIndustryOperatingWagePayment,
  type IndustryCompletedWorkBody,
  type IndustryOperatingWageSource,
} from '../../packages/core/src/commands/industry-operating-wage-payment.js';
const now = '2026-11-01T00:00:00.000Z';
function raw(c: C.CanonicalCommand) {
  const {
    canonicalPayload,
    fingerprint: _,
    payloadHash: __,
    simTime,
    ...fields
  } = c;
  void _;
  void __;
  return {
    ...fields,
    simTime: simTime.toCanonicalValue(),
    payload: JSON.parse(canonicalPayload) as unknown,
  };
}
export function createIndustryOperatingWageCanonicalFixture(
  child = true,
  annualWage = '172800',
  duration = '72000',
  quantity = '1',
  window = duration,
  maximumExpense = '10',
  testOnlyPins: Readonly<{
    admissionRef?: string;
    sourceRef?: string;
    sourceRawSha256?: string;
  }> = {},
) {
  const fixture = industryWageFixture();
  const f = { ...fixture, seed: child ? fixture.seed : fixture.parent };
  const opening = C.rebuildV08LedgersFromLineage({
    seed: f.seed,
    sha256Hex: sha,
  }).financial;
  const state = createIndustryOperatingWageState({
    financial: opening,
    seedFingerprint: f.seed.fingerprint,
  });
  const site: IndustryFirstDayWorkSiteSource = {
    worldId: f.worldId,
    countryId: f.countryId,
    locationId: 'REGION_01_E1',
    facilityId: 'FACILITY_TEST_ONLY',
    operatorId: f.operatorId,
    seedId: f.seed.seedId,
    seedFingerprint: f.seed.fingerprint,
    admissionRef: testOnlyPins.admissionRef ?? 'ADMISSION_TEST_ONLY_NOT_SQL',
    sourceRef: testOnlyPins.sourceRef ?? 'TEST_ONLY_SOURCE_NOT_AUTHORITY',
    sourceRawSha256: testOnlyPins.sourceRawSha256 ?? 'e'.repeat(64),
    policyVersion,
    policyRawSha256,
    userAdoptionRawSha256: adoption,
    outputUnit: 'unit',
    capacityPerSimDay: '4000',
    labourPersonDaysPerOutput: '0.01',
    positions: [
      {
        positionId: 'POSITION_TEST_ONLY',
        poolId: 'POOL_TEST_ONLY',
        sourceStartOrdinal: '0',
        startOrdinal: '0',
        count: '8',
        regionId: 'REGION_01_E1',
        cohortRef: 'COHORT_TEST_ONLY',
        skill: 'LOW',
      },
    ],
  };
  const terms = {
    schemaVersion: 'postwar-industry-run-schedule-v1',
    runId: 'RUN_TEST_ONLY',
    facilityId: site.facilityId,
    quantity: { amount: quantity, unit: 'unit' },
    startsAtSimTime: '0',
    endsAtSimTime: window,
    maximumExpense: { amount: maximumExpense, currency: 'XAA' },
    policyVersion,
    sourceRef: site.sourceRef,
    sourceRawSha256: site.sourceRawSha256,
  };
  const base = {
    schemaVersion: C.COMMAND_SCHEMA_VERSION,
    worldId: f.worldId,
    actorId: 'ACTOR_TEST_ONLY',
    authSubject: '11111111-1111-4111-8111-111111111111',
    countryId: f.countryId,
    correlationId: 'CORRELATION_TEST_ONLY',
    submittedAtReal: now,
  };
  const scheduleCommand = C.parseCanonicalCommand(
    {
      ...base,
      commandId: 'COMMAND_TEST_ONLY_SCHEDULE',
      commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
      officeId: 'INDUSTRY',
      expectedWorldVersion: '0',
      idempotencyKey: 'TEST_ONLY_SCHEDULE',
      simTime: '0',
      payload: terms,
    },
    sha,
  );
  const scheduleEvent = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_SCHEDULE',
      eventType: 'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1',
      worldId: f.worldId,
      causationCommandId: scheduleCommand.commandId,
      correlationId: scheduleCommand.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '0',
      recordedAtReal: now,
      correctsEventId: null,
      payload: {
        schemaVersion: 'postwar-industry-run-scheduled-v1',
        terms,
        source: {
          worldId: site.worldId,
          countryId: site.countryId,
          facilityId: site.facilityId,
          operatorId: site.operatorId,
          seedId: site.seedId,
          seedFingerprint: site.seedFingerprint,
          admissionRef: site.admissionRef,
          sourceRef: site.sourceRef,
          sourceRawSha256: site.sourceRawSha256,
        },
      },
    },
    sha,
  );
  const scheduleTransition = C.createAuthoritativeTransition({
    command: scheduleCommand,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [scheduleEvent],
  });
  const schedule = {
    command: scheduleCommand,
    transition: scheduleTransition,
    events: [scheduleEvent],
    inventoryPostings: [],
    financialPostingBatches: [],
    receipt: C.createFinalCommandReceipt({
      command: scheduleCommand,
      transition: scheduleTransition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: scheduleCommand.simTime,
      recordedAtReal: now,
    }),
  };
  const source: IndustryOperatingWageSource = {
    worldId: f.worldId,
    countryId: f.countryId,
    locationId: site.locationId,
    facilityId: site.facilityId,
    operatorId: f.operatorId,
    runId: terms.runId,
    seedId: f.seed.seedId,
    seedFingerprint: f.seed.fingerprint,
    admissionRef: site.admissionRef,
    schedule: {
      commandId: scheduleCommand.commandId,
      commandFingerprint: scheduleCommand.fingerprint,
      eventId: scheduleEvent.eventId,
      eventFingerprint: scheduleEvent.fingerprint,
    },
    policy: {
      version: policyVersion,
      rawSha256: policyRawSha256,
      userAdoptionRawSha256: adoption,
      sourceRef: site.sourceRef,
      sourceRawSha256: site.sourceRawSha256,
    },
    householdAccountId: f.hh.asset.accountId,
    openingReservedAmount: '80',
    maximumExpense: terms.maximumExpense,
    openingEncumbranceRef: f.op.asset.accountId,
    wages: [
      {
        positionId: 'POSITION_TEST_ONLY',
        poolId: 'POOL_TEST_ONLY',
        cohortRef: 'COHORT_TEST_ONLY',
        skill: 'LOW',
        reservationId: 'RESERVATION_TEST_ONLY_WAGE',
        reservedAmount: '30',
        sourceStartOrdinal: '0',
        wagePeriod: 'SIM_YEAR',
        annualWage,
        currency: 'XAA',
        wageVersion: 'TEST_ONLY_SOURCE_WAGE_V1',
        sourceRef: 'TEST_ONLY_EXACT_WAGE_SOURCE',
        firstPersonOrdinal: '0',
        personCount: '8',
      },
    ],
  };
  const body: IndustryCompletedWorkBody = {
    schemaVersion: 'postwar-industry-completed-work-v1',
    worldId: source.worldId,
    countryId: source.countryId,
    locationId: source.locationId,
    facilityId: source.facilityId,
    operatorId: source.operatorId,
    runId: source.runId,
    seedId: source.seedId,
    seedFingerprint: source.seedFingerprint,
    admissionRef: source.admissionRef,
    schedule: source.schedule,
    policy: source.policy,
    completedAtSimTime: duration,
    allocations: [
      {
        positionId: 'POSITION_TEST_ONLY',
        poolId: 'POOL_TEST_ONLY',
        cohortRef: 'COHORT_TEST_ONLY',
        sourceStartOrdinal: '1',
        populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
        regionId: source.locationId,
        startOrdinal: '1',
        count: '4',
        skill: 'LOW',
        startsAtSimTime: '0',
        endsAtSimTime: duration,
        personMilliseconds: (BigInt(duration) * 4n).toString(),
        personMinutes: {
          numerator: (BigInt(duration) * 4n).toString(),
          denominator: '60000',
        },
      },
    ],
  };
  const workCommand = C.parseCanonicalCommand(
    {
      ...base,
      commandId: 'COMMAND_TEST_ONLY_COMPLETED_WORK',
      commandType: 'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
      officeId: null,
      expectedWorldVersion: '1',
      idempotencyKey: 'TEST_ONLY_WORK',
      simTime: duration,
      payload: {
        schemaVersion: 'postwar-industry-work-command-v1',
        runId: terms.runId,
        scheduleCommandFingerprint: scheduleCommand.fingerprint,
        allocations: body.allocations,
      },
    },
    sha,
  );
  const workEvent = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_COMPLETED_WORK',
      eventType: 'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1',
      worldId: f.worldId,
      causationCommandId: workCommand.commandId,
      correlationId: workCommand.correlationId,
      worldVersion: '2',
      sequence: '2',
      simTime: duration,
      recordedAtReal: now,
      correctsEventId: null,
      payload: body,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command: workCommand,
    worldVersionBefore: '1',
    worldVersionAfter: '2',
    events: [workEvent],
  });
  const workFrame = {
    command: workCommand,
    transition,
    events: [workEvent],
    financialPostingBatches: [],
    inventoryPostings: [],
    receipt: C.createFinalCommandReceipt({
      command: workCommand,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: workCommand.simTime,
      recordedAtReal: now,
    }),
  };
  const scheduled = replayIndustryFirstDayRunFrame(
    { state: createIndustryFirstDayWorkState([site]), frame: schedule },
    sha,
  );
  const workResult = replayIndustryFirstDayRunFrame(
    { state: scheduled.state, frame: workFrame },
    sha,
  );
  const work = workResult.work;
  if (!work) throw Error('Actual Core completed work token required');
  const financial = C.rebuildV08LedgersFromLineage({
    seed: f.seed,
    transitions: [schedule, workFrame],
    sha256Hex: sha,
  }).financial;
  const key = C.canonicalSha256(
    C.canonicalSerialize([
      f.worldId,
      f.seed.fingerprint,
      workEvent.fingerprint,
      INDUSTRY_OPERATING_WAGE_POLICY.version,
    ]),
    sha,
  )
    .slice(7)
    .toUpperCase();
  const command = C.parseCanonicalCommand(
    {
      ...base,
      commandId: 'COMMAND_TEST_ONLY_WAGE_PAYMENT',
      commandType: INDUSTRY_OPERATING_WAGE_COMMAND,
      officeId: null,
      expectedWorldVersion: '2',
      idempotencyKey: 'INDUSTRY_WAGE_' + key,
      simTime: duration,
      payload: {
        schemaVersion: 'industry-operating-wage-payment-v1',
        workEventId: workEvent.eventId,
        workEventFingerprint: workEvent.fingerprint,
        policyVersion: INDUSTRY_OPERATING_WAGE_POLICY.version,
      },
    },
    sha,
  );
  return {
    f,
    site,
    source,
    body,
    work,
    workFrame,
    workState: workResult.state,
    schedule,
    financial,
    command,
    state,
    ...(child ? { beneficialReceipt: f.receipt } : {}),
    eventSequence: '3',
    observedAtReal: now,
    sha256Hex: sha,
  };
}
export function secondIndustryOperatingWageStage(
  s: ReturnType<typeof createIndustryOperatingWageCanonicalFixture>,
  first: ReturnType<typeof prepareIndustryOperatingWagePayment>,
) {
  const allocation = {
    ...s.body.allocations[0]!,
    startsAtSimTime: '72000',
    endsAtSimTime: '144000',
  };
  const body = {
    ...s.body,
    completedAtSimTime: '144000',
    allocations: [allocation],
  };
  const c = C.parseCanonicalCommand(
    {
      ...raw(s.workFrame.command),
      commandId: 'COMMAND_TEST_ONLY_WORK_SECOND',
      idempotencyKey: 'TEST_ONLY_WORK_SECOND',
      expectedWorldVersion: '3',
      simTime: '144000',
      payload: {
        schemaVersion: 'postwar-industry-work-command-v1',
        runId: s.source.runId,
        scheduleCommandFingerprint: s.source.schedule.commandFingerprint,
        allocations: body.allocations,
      },
    },
    sha,
  );
  const e = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_WORK_SECOND',
      eventType: 'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1',
      worldId: c.worldId,
      causationCommandId: c.commandId,
      correlationId: c.correlationId,
      worldVersion: '4',
      sequence: '4',
      simTime: '144000',
      recordedAtReal: now,
      correctsEventId: null,
      payload: body,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command: c,
    worldVersionBefore: '3',
    worldVersionAfter: '4',
    events: [e],
  });
  const frame = {
    command: c,
    transition,
    events: [e],
    financialPostingBatches: [],
    inventoryPostings: [],
    receipt: C.createFinalCommandReceipt({
      command: c,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: c.simTime,
      recordedAtReal: now,
    }),
  };
  const work = replayIndustryFirstDayRunFrame(
    { state: s.workState, frame },
    sha,
  ).work;
  if (!work) throw Error('ACTUAL_SECOND_CORE_WORK_REQUIRED');
  const financial = C.rebuildV08LedgersFromLineage({
    seed: s.f.seed,
    transitions: [s.schedule, s.workFrame, first.step, frame],
    sha256Hex: sha,
  }).financial;
  const key = C.canonicalSha256(
    C.canonicalSerialize([
      s.f.worldId,
      s.f.seed.fingerprint,
      e.fingerprint,
      INDUSTRY_OPERATING_WAGE_POLICY.version,
    ]),
    sha,
  )
    .slice(7)
    .toUpperCase();
  const command = C.parseCanonicalCommand(
    {
      ...raw(s.command),
      commandId: 'COMMAND_TEST_ONLY_SECOND_WAGE',
      idempotencyKey: 'INDUSTRY_WAGE_' + key,
      expectedWorldVersion: '4',
      simTime: '144000',
      payload: {
        schemaVersion: 'industry-operating-wage-payment-v1',
        workEventId: e.eventId,
        workEventFingerprint: e.fingerprint,
        policyVersion: INDUSTRY_OPERATING_WAGE_POLICY.version,
      },
    },
    sha,
  );
  const result = prepareIndustryOperatingWagePayment({
    ...s,
    work,
    financial,
    command,
    state: first.state,
    eventSequence: '5',
  });
  return { result, frame, work, financial, command };
}
