/** TEST_ONLY small genuine Core World and actual raw C02 water model. No SQL
 * admission, service original custody, grant authority or native delivery. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
  type IndustryFirstDayWorkSiteSource,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  prepareIndustryOperatingWagePayment,
  INDUSTRY_OPERATING_WAGE_POLICY,
  type IndustryOperatingWageSource,
} from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  prepareIndustryUtilityExecution,
  type IndustryUtilitySource,
} from '../../packages/core/src/commands/industry-utility-execution.js';
import {
  prepareIndustryFirstDayPowerExecution,
  type IndustryFirstDayPowerOriginal,
} from '../../packages/core/src/commands/industry-first-day-power-execution.js';
import {
  createIndustryFirstDayWaterScenario,
  readIndustryFirstDayWaterScenarioExecutionScope,
  INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY as POLICY,
} from '../../packages/core/src/water/industry-first-day-scenario.js';
import { CONSERVATIVE_OPENING_WATER_SOURCES } from '../../packages/core/src/water/conservative-opening-basis.js';
import {
  prepareIndustryFirstDayWaterExecution,
  type IndustryFirstDayWaterReplayOriginal,
} from '../../packages/core/src/commands/industry-first-day-water-execution.js';
import { DAY_ONE_STORAGE_SELF_USE_POLICY as POWER_POLICY } from '../../packages/core/src/engine-kernels/postwar-day-one-storage-self-use.js';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '../../packages/core/src/commands/finance-budget-native.js';
export const waterExecutionSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
const sha = waterExecutionSha,
  bytes = (p: string) =>
    readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const paths = {
  allocations: 'water-allocations',
  population: 'population-services',
  seasonal: 'seasonal-water',
  geography: 'geography',
  regions: 'regions',
  countries: 'countries',
  facilities: 'facilities',
  recipes: 'recipes',
};
const raw = {
  ...Object.fromEntries(
    Object.entries(paths).map(([k, p]) => [
      k,
      bytes('artifacts/world-balanced-candidate-v1/data/' + p + '.json'),
    ]),
  ),
  utilityPolicy: bytes('config/postwar-genesis/utilities.v1.json'),
} as Parameters<typeof createIndustryFirstDayWaterScenario>[0]['raw'];
export const waterExecutionScenario = createIndustryFirstDayWaterScenario(
  {
    modelRef: 'MODEL_TEST_ONLY_WATER_CORE_EXECUTION',
    raw,
    adoptionRecordBytes: bytes(POLICY.userAdoptionPath),
    year: '2026',
    month: '7',
  },
  sha,
);
export function createIndustryWaterExecutionFixture(
  powerBookedMWh = '0.1',
  sourceBasePins: Readonly<{
    WATER?: Readonly<{ sourceRef: string; sourceRawSha256: string }>;
    POWER?: Readonly<{ sourceRef: string; sourceRawSha256: string }>;
    automaticWaterGrant?: true;
  }> = {},
) {
  const world = C.worldId('WORLD_TEST_ONLY_WATER_EXECUTION'),
    country = C.countryId('COUNTRY_02'),
    op = C.legalEntityId('ENTITY_OPERATOR_02'),
    hh = C.legalEntityId('ENTITY_HOUSEHOLDS_02'),
    bank = C.legalEntityId('ENTITY_BANK_02'),
    now = '2026-11-01T00:00:00.000Z';
  const id = (p: string, k: string) =>
    p +
    '_' +
    sha(C.canonicalSerialize([world, country, k, 'XAA'])).toUpperCase();
  function pair(key: string, owner: C.LegalEntityId) {
    const asset = C.createFinancialAccount({
      worldId: world,
      countryId: country,
      ownerId: owner,
      accountId: C.financialAccountId(id('ACCOUNT', key + '_ASSET')),
      accountClass: 'ASSET',
      currency: 'XAA',
      claimId: C.financialClaimId(id('CLAIM', key)),
      counterpartyEntityId: bank,
    });
    return {
      asset,
      liability: C.createFinancialAccount({
        ...asset,
        accountId: C.financialAccountId(id('ACCOUNT', key + '_LIABILITY')),
        accountClass: 'LIABILITY',
        ownerId: bank,
        counterpartyEntityId: owner,
      }),
    };
  }
  const business = pair('BUSINESS_DEPOSIT', op),
    household = pair('HOUSEHOLD_DEPOSIT', hh),
    source = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_TEST_ONLY_WATER_FINANCIAL'),
        sourceKind: 'AUTHORITATIVE_DATASET',
        sourceVersion: 'TEST_ONLY',
        locator: 'tests/support/industry-water-execution-fixture.ts',
        payload: {
          schemaVersion: 'adopted-financial-opening-source-v2',
          assembly: {
            worldId: world,
            countries: [
              {
                countryId: country,
                roster: { operator: op, households: hh, bank },
              },
            ],
          },
          reconciliations: [
            {
              countryId: country,
              denominations: [
                {
                  field: 'businessBankDeposits',
                  localBookValue: { amount: '100', currency: 'XAA' },
                },
                {
                  field: 'householdBankDeposits',
                  localBookValue: { amount: '100', currency: 'XAA' },
                },
              ],
            },
          ],
        },
      },
      sha,
    );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_WATER'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [business, household].map((p, i) => ({
        batchId: C.financialOpeningBatchId('OPENING_WATER_' + i),
        sourceId: source.sourceId,
        settlementCurrency: 'XAA',
        legs: [
          {
            legId: C.financialOpeningLegId('WATER_ASSET_' + i),
            account: p.asset,
            direction: 'DEBIT',
            amount: C.Money.from('100', 'XAA'),
            counterpartLegId: C.financialOpeningLegId('WATER_LIABILITY_' + i),
          },
          {
            legId: C.financialOpeningLegId('WATER_LIABILITY_' + i),
            account: p.liability,
            direction: 'CREDIT',
            amount: C.Money.from('100', 'XAA'),
            counterpartLegId: C.financialOpeningLegId('WATER_ASSET_' + i),
          },
        ],
      })),
    },
    sha,
  );
  const opening = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha }),
    admissionRef = 'ADMISSION_TEST_ONLY_NOT_NATIVE';
  function site(
    facilityId: string,
    ordinal: string,
  ): IndustryFirstDayWorkSiteSource {
    return {
      worldId: world,
      countryId: country,
      locationId: 'REGION_02_E1',
      facilityId,
      operatorId: op,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef,
      sourceRef: 'SOURCE_' + facilityId,
      sourceRawSha256: sha(facilityId),
      policyVersion: C.INDUSTRY_FIRST_DAY_POLICY_VERSION,
      policyRawSha256: C.INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
      userAdoptionRawSha256: C.INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
      outputUnit: 'unit',
      capacityPerSimDay: '4000',
      labourPersonDaysPerOutput: '0.01',
      positions: [
        {
          positionId: 'POSITION_' + facilityId,
          poolId: 'POOL_' + facilityId,
          sourceStartOrdinal: '0',
          startOrdinal: ordinal,
          count: '1',
          regionId: 'REGION_02_E1',
          cohortRef: 'COHORT_TEST_ONLY',
          skill: 'LOW',
        },
      ],
    };
  }
  const target = site('OPEN-02-REFINED_FUEL', '0'),
    powerSite = site('STORAGE_TEST_ONLY_WATER_POWER', '1'),
    waterSite = site('UTILITY_WATER_TEST_ONLY', '2'),
    sites = [target, powerSite, waterSite];
  function command(
    id: string,
    type: string,
    v: string,
    time: string,
    payload: unknown,
    automatic = false,
    key = id,
  ) {
    return C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: id,
        commandType: type,
        worldId: world,
        countryId: country,
        officeId: automatic ? null : 'INDUSTRY',
        actorId: 'ACTOR_TEST_ONLY_WATER',
        authSubject: '11111111-1111-4111-8111-111111111111',
        expectedWorldVersion: v,
        idempotencyKey: key,
        correlationId: 'CORRELATION_' + id,
        submittedAtReal: now,
        simTime: time,
        payload,
      },
      sha,
    );
  }
  function utilitySource(kind: 'WATER' | 'POWER'): IndustryUtilitySource {
    return {
      worldId: world,
      countryId: country,
      locationId: target.locationId,
      facilityId: target.facilityId,
      operatorId: op,
      runId: 'RUN_TARGET_TEST_ONLY',
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef,
      sourceRef: 'SOURCE_TEST_ONLY_' + kind,
      sourceRawSha256: sha(kind),
      ...sourceBasePins[kind],
      policyVersion:
        kind === 'WATER' ? POLICY.version : POWER_POLICY.policyVersion,
      policyRawSha256:
        kind === 'WATER'
          ? sha(C.canonicalSerialize(POLICY))
          : POWER_POLICY.policyRawSha256,
      userAdoptionRawSha256: POLICY.userAdoptionSha256,
      originals: [],
    };
  }
  function utility(
    kind: 'WATER' | 'POWER',
    id: string,
    v: string,
    time: string,
    operation: Record<string, unknown>,
  ) {
    const src = kind === 'WATER' ? waterOriginal.source : powerOriginal.source;
    return command(id, 'INDUSTRY_FIRST_DAY_' + kind + '_EXECUTE_V1', v, time, {
      schemaVersion: 'industry-first-day-utility-command-v1',
      serviceKind: kind,
      operationRef: id,
      facilityId: target.facilityId,
      runId: src.runId,
      sourceRef: src.sourceRef,
      sourceRawSha256: src.sourceRawSha256,
      operation,
    });
  }
  const profile = readIndustryFirstDayWaterScenarioExecutionScope(
    waterExecutionScenario,
  ).profiles.find((p) => p.sourceRegionId === 'visual-territory-02-E1')!;
  const grantRaw = C.canonicalSerialize({
    schemaVersion: 'industry-first-day-water-grant-eligibility-original-v1',
    worldId: world,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef,
    countryId: country,
    locationId: target.locationId,
    operatorId: op,
    sourceCountryId: 'visual-territory-02',
    sourceRegionId: 'visual-territory-02-E1',
    basinRef: profile.basinRef,
    maximumRawQuotaPerDay: { amount: '4221.590388', unit: 'm3/sim-day' },
    validFromTicks: '0',
    validUntilTicks: '86400000',
    sourceRef: sourceBasePins.WATER?.sourceRef ?? 'SOURCE_TEST_ONLY_WATER',
    userAdoptionRawSha256: POLICY.userAdoptionSha256,
    sourceAllocationRawSha256: CONSERVATIVE_OPENING_WATER_SOURCES.allocations,
    grantAuthorityOriginalRef: 'TEST_ONLY_ELIGIBILITY_NOT_NATIVE_AUTHORITY',
    grantAuthorityOriginalRawSha256: sha('TEST_ONLY_AUTHORITY'),
  });
  const waterOriginal: IndustryFirstDayWaterReplayOriginal = {
    scenario: waterExecutionScenario,
    source: {
      ...utilitySource('WATER'),
      originals: [
        {
          kind: 'WATER_GRANT_AUTHORITY',
          reference: 'TEST_ONLY_ELIGIBILITY_NOT_NATIVE_AUTHORITY',
          rawSha256: sha('TEST_ONLY_AUTHORITY'),
        },
        {
          kind: 'WATER_GRANT_ELIGIBILITY',
          reference: 'ELIGIBILITY_TEST_ONLY',
          rawSha256: sha(grantRaw),
        },
        {
          kind: 'WATER_SERVICE_WORK_SOURCE',
          reference: waterSite.sourceRef,
          rawSha256: waterSite.sourceRawSha256,
        },
      ],
    },
    grantEligibilityOriginal: {
      reference: 'ELIGIBILITY_TEST_ONLY',
      rawText: grantRaw,
    },
    serviceFacilityId: waterSite.facilityId,
    serviceRunId: 'RUN_WATER_SERVICE_TEST_ONLY',
    serviceWorkSourceRef: waterSite.sourceRef,
    serviceWorkSourceRawSha256: waterSite.sourceRawSha256,
  };
  const powerOriginal: IndustryFirstDayPowerOriginal = {
    source: {
      ...utilitySource('POWER'),
      originals: [
        {
          kind: 'STORAGE_PHYSICAL_ORIGINAL',
          reference: 'TEST_ONLY_STORAGE_RAW',
          rawSha256: sha('STORAGE'),
        },
        {
          kind: 'POWER_SERVICE_WORK_SITE',
          reference: powerSite.sourceRef,
          rawSha256: powerSite.sourceRawSha256,
        },
      ],
    },
    opening: {
      scenarioRef: 'TEST_ONLY_NEW_SCENARIO',
      worldId: world,
      seedFingerprint: seed.fingerprint,
      countryId: country,
      operatorId: op,
      storageOwnerId: op,
      gridOwnerId: op,
      storageId: powerSite.facilityId,
      gridId: 'GRID_TEST_ONLY',
      sourceRef: 'TEST_ONLY_STORAGE_RAW',
      sourceRawSha256: sha('STORAGE'),
      originalEnergyCapacityMWh: '100',
      originalOpeningSocMWh: '90',
      originalStorageDischargeMW: '1000',
      originalGridMW: '500',
      originalEfficiency: '0.9',
      originalLossFraction: '0.1',
      protectedReservations: [],
    },
    serviceFacilityId: powerSite.facilityId,
    serviceRunId: 'RUN_POWER_SERVICE_TEST_ONLY',
    serviceWorkSourceRef: powerSite.sourceRef,
    serviceWorkSourceRawSha256: powerSite.sourceRawSha256,
    paymentFrames: [],
  };
  const wages: IndustryOperatingWageSource[] = [];
  function replay(
    frames: readonly Frame[],
    water = waterOriginal,
    power = powerOriginal,
    pageSize = 256,
  ) {
    const last = frames.at(-1),
      head = {
        worldVersion: last?.transition.worldVersionAfter ?? '0',
        eventSequence: last?.events.at(-1)?.sequence ?? '0',
      };
    let cursor = prepareFinanceSocialReplayContinuation(
      {
        opening,
        expectedHead: head,
        socialCountries: [],
        fxOriginals: [],
        industryWorkSources: sites,
        industryWageSources: wages,
        industryWaterOriginals: [water],
        industryPowerOriginals: [power],
        openingEncumbrances: [
          {
            reference: business.asset.accountId,
            accountId: business.asset.accountId,
            currency: 'XAA',
            amount: '80',
          },
        ],
      },
      sha,
    );
    let fromHead = { worldVersion: '0', eventSequence: '0' };
    for (let offset = 0; offset < frames.length; offset += pageSize) {
      const pageFrames = frames.slice(offset, offset + pageSize),
        lastFrame = pageFrames.at(-1)!,
        throughHead = {
          worldVersion: lastFrame.transition.worldVersionAfter,
          eventSequence: lastFrame.events.at(-1)!.sequence,
        };
      cursor = appendFinanceSocialReplayPage({
        continuation: cursor,
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: world,
          seedFingerprint: seed.fingerprint,
          fromHead,
          throughHead,
          expectedHead: head,
          frames: pageFrames,
          framesSha256: C.canonicalSha256(
            C.canonicalHashInput(pageFrames),
            sha,
          ),
        },
      });
      fromHead = throughHead;
    }
    const view = readFinanceSocialReplayContinuation(cursor);
    retireFinanceSocialReplayContinuation(cursor);
    return view;
  }
  const frames: Frame[] = [];
  let workState = createIndustryFirstDayWorkState(sites);
  function schedule(s: IndustryFirstDayWorkSiteSource, runId: string) {
    const v = frames.at(-1)?.transition.worldVersionAfter ?? '0',
      seq = frames.at(-1)?.events.at(-1)?.sequence ?? '0',
      result = prepareIndustryRunScheduleFrame(
        {
          state: workState,
          command: command(
            'COMMAND_' + runId,
            'CORE_INDUSTRY_RUN_SCHEDULE_V1',
            v,
            '0',
            {
              schemaVersion: 'postwar-industry-run-schedule-v1',
              runId,
              facilityId: s.facilityId,
              quantity: { amount: '1', unit: 'unit' },
              startsAtSimTime: '0',
              endsAtSimTime: '86400000',
              maximumExpense: { amount: '10', currency: 'XAA' },
              policyVersion: s.policyVersion,
              sourceRef: s.sourceRef,
              sourceRawSha256: s.sourceRawSha256,
            },
          ),
          head: { worldVersion: v, eventSequence: seq },
          observedAtReal: now,
        },
        sha,
      );
    workState = result.state;
    frames.push(result.frame);
    return result.frame;
  }
  function commit(draft: {
    step: {
      command: C.CanonicalCommand;
      transition: C.AuthoritativeTransition;
      financialPostingBatches: readonly unknown[];
      inventoryPostings: readonly unknown[];
    };
  }): Frame {
    const s = draft.step;
    return {
      ...s,
      events: s.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: s.command,
        transition: s.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: s.command.simTime,
        recordedAtReal: now,
      }),
    };
  }
  function waterDraft(
    view: ReturnType<typeof replay>,
    c: C.CanonicalCommand,
    source = waterOriginal.source,
  ) {
    return prepareIndustryFirstDayWaterExecution(
      {
        preparation: prepareIndustryUtilityExecution(
          { command: c, replay: view, source },
          sha,
        ),
        state: view.result.industryWaterState!,
      },
      sha,
    );
  }
  function powerDraft(view: ReturnType<typeof replay>, c: C.CanonicalCommand) {
    return prepareIndustryFirstDayPowerExecution(
      {
        preparation: prepareIndustryUtilityExecution(
          { command: c, replay: view, source: powerOriginal.source },
          sha,
        ),
        state: view.result.industryPowerState!,
      },
      sha,
    );
  }
  schedule(target, 'RUN_TARGET_TEST_ONLY');
  const beforeGrant = replay(frames);
  let grantCommand = utility('WATER', 'GRANT_TEST_ONLY', '1', '0', {
    action: 'GRANT_RIGHT',
  });
  if (sourceBasePins.automaticWaterGrant) {
    const run = frames[0]!.command;
    const id =
      'COMMAND_INDUSTRY_WATER_GRANT_' +
      sha(
        C.canonicalSerialize([
          world,
          run.fingerprint,
          waterOriginal.source.sourceRawSha256,
          'INDUSTRY_BOUNDED_WATER_GRANT_V1',
        ]),
      ).toUpperCase();
    grantCommand = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: id,
        commandType: grantCommand.commandType,
        worldId: world,
        countryId: country,
        officeId: null,
        actorId: run.actorId,
        authSubject: run.authSubject,
        expectedWorldVersion: '1',
        idempotencyKey: id,
        correlationId: run.correlationId,
        submittedAtReal: now,
        simTime: '0',
        payload: {
          ...JSON.parse(grantCommand.canonicalPayload),
          operationRef: id,
        },
      },
      sha,
    );
  }
  const grantDraft = waterDraft(beforeGrant, grantCommand),
    grant = commit(grantDraft);
  frames.push(grant);
  const waterGranted = {
    ...waterOriginal,
    commandSources: [
      {
        commandFingerprint: grant.command.fingerprint,
        source: waterOriginal.source,
      },
    ],
    source: {
      ...waterOriginal.source,
      originals: [
        ...waterOriginal.source.originals,
        {
          kind: 'WATER_RIGHT_COMMIT',
          reference: grant.events[0]!.eventId,
          rawSha256: sha(grant.events[0]!.canonicalPayload),
        },
      ],
    },
  };
  const powerBook = commit(
    powerDraft(
      replay(frames, waterGranted),
      utility('POWER', 'BOOK_POWER_TEST_ONLY', '2', '0', {
        action: 'BOOK',
        bookingRef: 'POWER_BOOK_TEST_ONLY',
        purpose: 'PROCESS_WATER_PUMPING_SELF_USE',
        fromSimTime: '0',
        throughSimTime: '72000',
        outputMWh: powerBookedMWh,
      }),
    ),
  );
  frames.push(powerBook);
  const powerSchedule = schedule(powerSite, powerOriginal.serviceRunId),
    waterSchedule = schedule(waterSite, waterOriginal.serviceRunId!);
  function workAndPay(s: IndustryFirstDayWorkSiteSource, scheduleFrame: Frame) {
    const v = frames.at(-1)!.transition.worldVersionAfter,
      seq = frames.at(-1)!.events.at(-1)!.sequence,
      p = s.positions[0]!,
      run = JSON.parse(scheduleFrame.command.canonicalPayload).runId as string;
    const work = prepareIndustryFirstDayWorkFrame(
      {
        state: workState,
        command: command(
          'WORK_' + s.facilityId,
          'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
          v,
          '72000',
          {
            schemaVersion: 'postwar-industry-work-command-v1',
            runId: run,
            scheduleCommandFingerprint: scheduleFrame.command.fingerprint,
            allocations: [
              {
                positionId: p.positionId,
                poolId: p.poolId,
                cohortRef: p.cohortRef,
                sourceStartOrdinal: '0',
                populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
                regionId: s.locationId,
                startOrdinal: p.startOrdinal,
                count: '1',
                skill: 'LOW',
                startsAtSimTime: '0',
                endsAtSimTime: '72000',
                personMilliseconds: '72000',
                personMinutes: { numerator: '72000', denominator: '60000' },
              },
            ],
          },
          true,
        ),
        head: { worldVersion: v, eventSequence: seq },
        observedAtReal: now,
      },
      sha,
    );
    workState = work.state;
    frames.push(work.frame);
    if (!work.work) throw Error('actual Core WORK required');
    const wage: IndustryOperatingWageSource = {
      worldId: world,
      countryId: country,
      locationId: s.locationId,
      facilityId: s.facilityId,
      operatorId: op,
      runId: run,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef,
      schedule: {
        commandId: scheduleFrame.command.commandId,
        commandFingerprint: scheduleFrame.command.fingerprint,
        eventId: scheduleFrame.events[0]!.eventId,
        eventFingerprint: scheduleFrame.events[0]!.fingerprint,
      },
      policy: {
        version: s.policyVersion,
        rawSha256: s.policyRawSha256,
        userAdoptionRawSha256: s.userAdoptionRawSha256,
        sourceRef: s.sourceRef,
        sourceRawSha256: s.sourceRawSha256,
      },
      householdAccountId: household.asset.accountId,
      openingReservedAmount: '80',
      maximumExpense: { amount: '10', currency: 'XAA' },
      openingEncumbranceRef: business.asset.accountId,
      wages: [
        {
          positionId: p.positionId,
          poolId: p.poolId,
          cohortRef: p.cohortRef,
          skill: p.skill,
          reservationId: 'RESERVATION_' + s.facilityId,
          reservedAmount: '30',
          sourceStartOrdinal: '0',
          wagePeriod: 'SIM_YEAR',
          annualWage: '172800',
          currency: 'XAA',
          wageVersion: 'TEST_ONLY_WAGE',
          sourceRef: 'TEST_ONLY_RATE_' + s.facilityId,
          firstPersonOrdinal: p.startOrdinal,
          personCount: '1',
        },
      ],
    };
    wages.push(wage);
    const view = replay(frames, waterGranted),
      key = C.canonicalSha256(
        C.canonicalSerialize([
          world,
          seed.fingerprint,
          work.frame.events[0]!.fingerprint,
          INDUSTRY_OPERATING_WAGE_POLICY.version,
        ]),
        sha,
      )
        .slice(7)
        .toUpperCase(),
      pay = prepareIndustryOperatingWagePayment({
        state: view.result.industryWageState!,
        financial: view.result.financialState!,
        work: work.work,
        source: wage,
        command: command(
          'PAY_' + s.facilityId,
          'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1',
          work.frame.transition.worldVersionAfter,
          '72000',
          {
            schemaVersion: 'industry-operating-wage-payment-v1',
            workEventId: work.frame.events[0]!.eventId,
            workEventFingerprint: work.frame.events[0]!.fingerprint,
            policyVersion: INDUSTRY_OPERATING_WAGE_POLICY.version,
          },
          true,
          'INDUSTRY_WAGE_' + key,
        ),
        eventSequence: (BigInt(work.frame.events[0]!.sequence) + 1n).toString(),
        observedAtReal: now,
        sha256Hex: sha,
      });
    const payment = commit(pay);
    frames.push(payment);
    return { work: work.frame, payment };
  }
  const powerPaid = workAndPay(powerSite, powerSchedule),
    waterPaid = workAndPay(waterSite, waterSchedule),
    powerWithPayment = { ...powerOriginal, paymentFrames: [powerPaid.payment] },
    waterWithPayment = { ...waterGranted, paymentFrames: [waterPaid.payment] };
  const beforePower = replay(frames, waterWithPayment, powerWithPayment),
    powerDelivery = commit(
      powerDraft(
        beforePower,
        utility('POWER', 'DELIVER_POWER_TEST_ONLY', '9', '72000', {
          action: 'DELIVER',
          bookingRef: 'POWER_BOOK_TEST_ONLY',
          workEventFingerprint: powerPaid.work.events[0]!.fingerprint,
          paymentEventFingerprint: powerPaid.payment.events[0]!.fingerprint,
        }),
      ),
    );
  frames.push(powerDelivery);
  const protectedHash = sha(
      C.canonicalSerialize({
        worldId: world,
        seedFingerprint: seed.fingerprint,
        head: { worldVersion: '10', eventSequence: '11' },
        fromTicks: '0',
        untilTicks: '72000',
        claims: [],
      }),
    ),
    waterFinal = {
      ...waterWithPayment,
      source: {
        ...waterWithPayment.source,
        originals: [
          ...waterWithPayment.source.originals,
          {
            kind: 'POWER_DELIVERY',
            reference: powerDelivery.events[0]!.eventId,
            rawSha256: sha(powerDelivery.events[0]!.canonicalPayload),
          },
          {
            kind: 'WATER_CURRENT_PROTECTED_SET',
            reference: 'PROTECTED_TEST_ONLY_H10',
            rawSha256: protectedHash,
          },
        ],
      },
    };
  const beforeWater = replay(frames, waterFinal, powerWithPayment),
    waterCommand = utility('WATER', 'DELIVER_WATER_TEST_ONLY', '10', '72000', {
      action: 'DELIVER',
      workEventFingerprint: waterPaid.work.events[0]!.fingerprint,
      paymentEventFingerprint: waterPaid.payment.events[0]!.fingerprint,
      powerEventFingerprints: [powerDelivery.events[0]!.fingerprint],
      additionalProtectedClaims: [],
    });
  return {
    frames,
    beforeGrant,
    grantDraft,
    grant,
    waterOriginal,
    waterFinal,
    powerWithPayment,
    beforeWater,
    waterCommand,
    waterPaid,
    powerPaid,
    powerDelivery,
    command,
    utility,
    waterDraft,
    commit,
    replay,
    seed,
    opening,
    sites,
    waterSite,
    target,
    now,
  };
}
