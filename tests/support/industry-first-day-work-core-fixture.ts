/** Small deterministic TEST_ONLY Core model, not DB/source/OP admission. */
import { createHash } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryFirstDayWorkState,
  replayIndustryFirstDayRunFrame,
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  INDUSTRY_RUN_SCHEDULED_EVENT,
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
  INDUSTRY_FIRST_DAY_WORK_EVENT,
  type IndustryFirstDayWorkAllocation,
  type IndustryFirstDayRunTerms,
  type IndustryFirstDayWorkSiteSource,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
export const industryWorkTestSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export function industryWorkTestFrame(input: {
  type: string;
  eventType: string;
  id: string;
  version: string;
  time: string;
  payload: unknown;
  eventPayload: unknown;
  automatic?: boolean;
}): FinanceNativeBudgetCanonicalFrame {
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandId: input.id,
      commandType: input.type,
      worldId: 'WORLD_TEST_ONLY_INDUSTRY_WORK',
      actorId: 'ACTOR_TEST_ONLY_INDUSTRY_WORK',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: 'COUNTRY_02',
      officeId: input.automatic ? null : 'INDUSTRY',
      expectedWorldVersion: input.version,
      idempotencyKey: input.id,
      correlationId: 'CORRELATION_' + input.id,
      simTime: input.time,
      submittedAtReal: '2026-11-01T00:00:00.000Z',
      payload: input.payload,
    },
    industryWorkTestSha,
  );
  const after = (BigInt(input.version) + 1n).toString();
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      worldId: command.worldId,
      worldVersion: after,
      sequence: after,
      simTime: input.time,
      eventId: 'EVENT_' + input.id,
      eventType: input.eventType,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      recordedAtReal: '2026-11-01T00:00:00.000Z',
      payload: input.eventPayload,
    },
    industryWorkTestSha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: input.version,
    worldVersionAfter: after,
  });
  return {
    command,
    transition,
    events: transition.events,
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: '2026-11-01T00:00:00.000Z',
    }),
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
export function createIndustryFirstDayWorkCoreFixture() {
  const source: IndustryFirstDayWorkSiteSource = {
    worldId: 'WORLD_TEST_ONLY_INDUSTRY_WORK',
    countryId: 'COUNTRY_02',
    locationId: 'REGION_TEST_ONLY_WORK',
    facilityId: 'OPEN-02-REFINED_FUEL',
    operatorId: 'ENTITY_TEST_ONLY_OP_02',
    seedId: 'SEED_TEST_ONLY_INDUSTRY_WORK',
    seedFingerprint: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_TEST_ONLY',
    sourceRef: 'INDUSTRY_FIRST_DAY_TEST_ONLY',
    sourceRawSha256: 'b'.repeat(64),
    policyVersion: C.INDUSTRY_FIRST_DAY_POLICY_VERSION,
    policyRawSha256: C.INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
    userAdoptionRawSha256: C.INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
    outputUnit: 'barrel equivalent',
    capacityPerSimDay: '48548.289465',
    labourPersonDaysPerOutput: '0.008',
    positions: [
      {
        positionId: 'POSITION_TEST_ONLY_INDUSTRY_WORK',
        poolId: 'POOL_TEST_ONLY_INDUSTRY_LOW',
        sourceStartOrdinal: '10',
        startOrdinal: '100',
        count: '2',
        regionId: 'REGION_TEST_ONLY_WORK',
        cohortRef: 'COHORT_TEST_ONLY_WORK',
        skill: 'LOW',
      },
    ],
  };
  const terms: IndustryFirstDayRunTerms = {
    schemaVersion: 'postwar-industry-run-schedule-v1',
    runId: 'RUN_TEST_ONLY_INDUSTRY_01',
    facilityId: source.facilityId,
    quantity: { amount: '1', unit: source.outputUnit },
    startsAtSimTime: '0',
    endsAtSimTime: '86400000',
    maximumExpense: { amount: '100000', currency: 'XBB' },
    policyVersion: source.policyVersion,
    sourceRef: source.sourceRef,
    sourceRawSha256: source.sourceRawSha256,
  };
  const schedule = industryWorkTestFrame({
    type: INDUSTRY_RUN_SCHEDULE_COMMAND,
    eventType: INDUSTRY_RUN_SCHEDULED_EVENT,
    id: 'COMMAND_TEST_ONLY_INDUSTRY_SCHEDULE',
    version: '0',
    time: '0',
    payload: terms,
    eventPayload: {
      schemaVersion: 'postwar-industry-run-scheduled-v1',
      terms,
      source: {
        worldId: source.worldId,
        countryId: source.countryId,
        facilityId: source.facilityId,
        operatorId: source.operatorId,
        seedId: source.seedId,
        seedFingerprint: source.seedFingerprint,
        admissionRef: source.admissionRef,
        sourceRef: source.sourceRef,
        sourceRawSha256: source.sourceRawSha256,
      },
    },
  });
  const allocation: IndustryFirstDayWorkAllocation = {
    positionId: source.positions[0]!.positionId,
    poolId: source.positions[0]!.poolId,
    sourceStartOrdinal: '10',
    populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
    regionId: source.locationId,
    cohortRef: source.positions[0]!.cohortRef,
    startOrdinal: '100',
    count: '1',
    skill: 'LOW',
    startsAtSimTime: '0',
    endsAtSimTime: '230400',
    personMilliseconds: '230400',
    personMinutes: { numerator: '230400', denominator: '60000' },
  };
  const makeWork = (
    allocations: readonly IndustryFirstDayWorkAllocation[] = [allocation],
    options: { id?: string; version?: string; time?: string } = {},
  ) => {
    const time = options.time ?? '230400';
    return industryWorkTestFrame({
      type: INDUSTRY_FIRST_DAY_WORK_COMMAND,
      eventType: INDUSTRY_FIRST_DAY_WORK_EVENT,
      id: options.id ?? 'COMMAND_TEST_ONLY_INDUSTRY_WORK',
      version: options.version ?? '1',
      time,
      automatic: true,
      payload: {
        schemaVersion: 'postwar-industry-work-command-v1',
        runId: terms.runId,
        scheduleCommandFingerprint: schedule.command.fingerprint,
        allocations,
      },
      eventPayload: {
        schemaVersion: 'postwar-industry-completed-work-v1',
        worldId: source.worldId,
        countryId: source.countryId,
        locationId: source.locationId,
        facilityId: source.facilityId,
        operatorId: source.operatorId,
        runId: terms.runId,
        seedId: source.seedId,
        seedFingerprint: source.seedFingerprint,
        admissionRef: source.admissionRef,
        schedule: {
          commandId: schedule.command.commandId,
          commandFingerprint: schedule.command.fingerprint,
          eventId: schedule.events[0]!.eventId,
          eventFingerprint: schedule.events[0]!.fingerprint,
        },
        policy: {
          version: source.policyVersion,
          rawSha256: source.policyRawSha256,
          userAdoptionRawSha256: source.userAdoptionRawSha256,
          sourceRef: source.sourceRef,
          sourceRawSha256: source.sourceRawSha256,
        },
        completedAtSimTime: time,
        allocations,
      },
    });
  };
  const initial = createIndustryFirstDayWorkState([source]);
  const scheduled = replayIndustryFirstDayRunFrame(
    { state: initial, frame: schedule },
    industryWorkTestSha,
  ).state;
  const frame = makeWork();
  const result = replayIndustryFirstDayRunFrame(
    { state: scheduled, frame },
    industryWorkTestSha,
  );
  return {
    source,
    terms,
    schedule,
    allocation,
    initial,
    scheduled,
    makeWork,
    frame,
    state: result.state,
    work: result.work!,
  };
}
