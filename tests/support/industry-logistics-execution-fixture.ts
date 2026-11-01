/** Tiny TEST_ONLY Core seed/financial/actual-policy model. No SQL admission,
 * native actor, payment authority or actually committed World is claimed. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  type IndustryFirstDayWorkSiteSource,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  INDUSTRY_UTILITY_COMMANDS,
  prepareIndustryUtilityExecution,
  type IndustryUtilitySource,
} from '../../packages/core/src/commands/industry-utility-execution.js';
import {
  prepareIndustryInternalLogisticsSource,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256,
  INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256,
} from '../../packages/core/src/inventory/industry-internal-logistics.js';
import {
  prepareIndustryInternalLogisticsReplaySources,
  createIndustryInternalLogisticsExecutionState,
  readIndustryInternalLogisticsExecutionState,
  type IndustryLogisticsLabourSource,
  type IndustryInternalLogisticsExecutionState,
  type IndustryLogisticsExpenseOriginal,
} from '../../packages/core/src/inventory/industry-internal-logistics-execution.js';
export const logisticsSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
const bytes = (p: string) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
export const logisticsAt = '2026-11-01T00:00:00.000Z';
export function createIndustryLogisticsExecutionFixture() {
  const sha = logisticsSha,
    w = C.worldId('WORLD_LOGISTICS_EXECUTION_TEST_ONLY'),
    country = C.countryId('COUNTRY_02');
  const operator = C.legalEntityId('OP_02'),
    household = C.legalEntityId('HOUSEHOLDS_02'),
    bank = C.legalEntityId('BANK_02');
  const id = (p: string, k: string) =>
    p + '_' + sha(C.canonicalSerialize([w, country, k, 'XBB'])).toUpperCase();
  const pair = (key: string, owner: C.LegalEntityId) => {
    const asset = C.createFinancialAccount({
      worldId: w,
      countryId: country,
      ownerId: owner,
      accountId: C.financialAccountId(id('ACCOUNT', key + '_ASSET')),
      accountClass: 'ASSET',
      currency: 'XBB',
      claimId: C.financialClaimId(id('CLAIM', key)),
      counterpartyEntityId: bank,
    });
    return {
      asset,
      liability: C.createFinancialAccount({
        ...asset,
        accountId: C.financialAccountId(id('ACCOUNT', key + '_LIABILITY')),
        ownerId: bank,
        accountClass: 'LIABILITY',
        counterpartyEntityId: owner,
      }),
    };
  };
  const op = pair('BUSINESS_DEPOSIT', operator),
    hh = pair('HOUSEHOLD_DEPOSIT', household);
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_LOGISTICS_TEST_ONLY'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      sourceVersion: 'TEST_ONLY_FINANCIAL_DATA',
      locator: 'tests/support/industry-logistics-execution-fixture.ts',
      payload: {
        schemaVersion: 'adopted-financial-opening-source-v2',
        assembly: {
          worldId: w,
          countries: [
            {
              countryId: country,
              roster: { operator, households: household, bank },
            },
          ],
        },
        reconciliations: [
          {
            countryId: country,
            denominations: [
              {
                field: 'businessBankDeposits',
                localBookValue: { amount: '100', currency: 'XBB' },
              },
              {
                field: 'householdBankDeposits',
                localBookValue: { amount: '100', currency: 'XBB' },
              },
            ],
          },
        ],
      },
    },
    sha,
  );
  const account = C.createInventoryAccount({
    worldId: w,
    countryId: country,
    commodityId: C.commodityId('CRUDE_OIL'),
    batchId: C.inventoryBatchId('TEST_ACTUAL_CRUDE_BATCH'),
    unit: 'barrel',
    physicalLocationId: C.inventoryLocationId('LOCATION_WAREHOUSE_02'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: operator,
    riskBearerId: operator,
    economicRecognitionId: null,
  });
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_LOGISTICS_TEST_ONLY'),
      worldId: w,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: C.openingInventoryEntryId('STOCK_ACTUAL_CRUDE_TEST'),
          sourceId: source.sourceId,
          account,
          quantity: C.Quantity.from('3191522.33351', 'barrel'),
        },
      ],
      financialBatches: [op, hh].map(({ asset, liability }, i) => ({
        batchId: C.financialOpeningBatchId('OPENING_LOGISTICS_' + i),
        sourceId: source.sourceId,
        settlementCurrency: 'XBB',
        legs: [
          {
            legId: C.financialOpeningLegId('OPENING_L_ASSET_' + i),
            account: asset,
            direction: 'DEBIT' as const,
            amount: C.Money.from('100', 'XBB'),
            counterpartLegId: C.financialOpeningLegId('OPENING_L_LIAB_' + i),
          },
          {
            legId: C.financialOpeningLegId('OPENING_L_LIAB_' + i),
            account: liability,
            direction: 'CREDIT' as const,
            amount: C.Money.from('100', 'XBB'),
            counterpartLegId: C.financialOpeningLegId('OPENING_L_ASSET_' + i),
          },
        ],
      })),
    },
    sha,
  );
  const workSource: IndustryFirstDayWorkSiteSource = {
    worldId: w,
    countryId: country,
    locationId: 'REGION_02_E1',
    facilityId: 'OPEN-02-REFINED_FUEL',
    operatorId: operator,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef: 'ADMISSION_TEST_ONLY_LOGISTICS',
    sourceRef: 'TEST_ONLY_FIRSTDAY_SOURCE',
    sourceRawSha256: 'a'.repeat(64),
    policyVersion: C.INDUSTRY_FIRST_DAY_POLICY_VERSION,
    policyRawSha256: C.INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
    userAdoptionRawSha256: C.INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
    outputUnit: 'barrel equivalent',
    capacityPerSimDay: '48548.289465',
    labourPersonDaysPerOutput: '0.008',
    positions: [
      {
        positionId: 'TEST_POSITION',
        poolId: 'TEST_POOL',
        regionId: 'REGION_02_E1',
        cohortRef: 'TEST_COHORT',
        sourceStartOrdinal: '0',
        startOrdinal: '0',
        count: '10',
        skill: 'LOW',
      },
    ],
  };
  const terms = {
    schemaVersion: 'postwar-industry-run-schedule-v1',
    runId: 'RUN_LOGISTICS_TEST_ONLY',
    facilityId: workSource.facilityId,
    quantity: { amount: '1', unit: workSource.outputUnit },
    startsAtSimTime: '0',
    endsAtSimTime: '1000000',
    maximumExpense: { amount: '10', currency: 'XBB' },
    policyVersion: workSource.policyVersion,
    sourceRef: workSource.sourceRef,
    sourceRawSha256: workSource.sourceRawSha256,
  };
  const rawCommand = (
    type: string,
    key: string,
    version: string,
    time: string,
    payload: unknown,
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandType: type,
        commandId: key,
        worldId: w,
        countryId: country,
        officeId: 'INDUSTRY',
        actorId: 'TEST_ACTOR_LOGISTICS',
        authSubject: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: key,
        correlationId: 'CORRELATION_' + key,
        expectedWorldVersion: version,
        simTime: time,
        submittedAtReal: logisticsAt,
        payload,
      },
      sha,
    );
  const scheduled = prepareIndustryRunScheduleFrame(
    {
      state: createIndustryFirstDayWorkState([workSource]),
      command: rawCommand(
        INDUSTRY_RUN_SCHEDULE_COMMAND,
        'TEST_RUN_SCHEDULE',
        '0',
        '0',
        terms,
      ),
      head: { worldVersion: '0', eventSequence: '0' },
      observedAtReal: logisticsAt,
    },
    sha,
  );
  const opening = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  const start = prepareFinanceSocialReplayContinuation(
    {
      opening,
      expectedHead: { worldVersion: '1', eventSequence: '1' },
      socialCountries: [],
      fxOriginals: [],
      openingEncumbrances: [],
      industryWorkSources: [workSource],
    },
    sha,
  );
  const after = appendFinanceSocialReplayPage({
    continuation: start,
    sha256Hex: sha,
    page: {
      schemaVersion: 'finance-social-replay-page-v1',
      worldId: w,
      seedFingerprint: seed.fingerprint,
      fromHead: { worldVersion: '0', eventSequence: '0' },
      throughHead: { worldVersion: '1', eventSequence: '1' },
      expectedHead: { worldVersion: '1', eventSequence: '1' },
      frames: [scheduled.frame],
      framesSha256: C.canonicalSha256(
        C.canonicalHashInput([scheduled.frame]),
        sha,
      ),
    },
  });
  const view = readFinanceSocialReplayContinuation(after);
  const snapshot = {
    lineageRef: 'LOGISTICS_SITE_TEST_ONLY',
    sourceVersion: seed.seedId,
    snapshotRef: 'LOGISTICS_SITE_SNAPSHOT',
    snapshotHash: seed.fingerprint.slice(7),
    predecessorSnapshotHash: null,
  };
  const site = {
    facilityRef: workSource.facilityId,
    countryRef: country,
    operatorRef: operator,
    locationRef: 'LOCATION_ACTUAL_REFINERY_TEST',
    sourceCountryId: 'visual-territory-02',
    sourceOperatorId: 'OP-02',
  };
  const planningSource = prepareIndustryInternalLogisticsSource({
    seed,
    openingInventoryEntryId: seed.inventoryEntries[0]!.entryId,
    trace: {
      traceRef: 'TRACE_LOGISTICS_TEST',
      calculationVersion: 'LOGISTICS_FIRST_DAY_V1',
      snapshot,
      snapshotAt: { amount: '0', unit: 'sim_millisecond' },
    },
    siteFact: {
      factRef: 'SITE_LOGISTICS_TEST',
      sourceRef: 'EXISTING_TEST_SITE',
      predecessorFactRefs: ['EXISTING_SITE_ORIGINAL'],
      snapshot,
      observedAt: { amount: '0', unit: 'sim_millisecond' },
      payload: site,
      canonicalPayload: C.canonicalSerialize(site),
    },
    policyRawBytes: bytes(
      'config/postwar-genesis/industry-internal-logistics-first-day.v1.json',
    ),
    adoptionRawBytes: bytes(
      'docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
    ),
    sourceBytes: {
      'domestic-access.json': bytes(
        'artifacts/world-balanced-candidate-v1/data/domestic-access.json',
      ),
      'facilities.json': bytes(
        'artifacts/world-balanced-candidate-v1/data/facilities.json',
      ),
      'stocks.json': bytes(
        'artifacts/world-balanced-candidate-v1/data/stocks.json',
      ),
      'commodity-catalog.json': bytes(
        'artifacts/world-balanced-candidate-v1/data/commodity-catalog.json',
      ),
    },
    sha256Hex: sha,
  });
  const labour: IndustryLogisticsLabourSource = {
    schemaVersion: 'industry-logistics-labour-source-v1',
    sourceRef: 'TEST_LOGISTICS_LABOUR_SOURCE',
    sourceRawSha256: 'b'.repeat(64),
    worldId: w,
    countryId: country,
    facilityId: workSource.facilityId,
    operatorId: operator,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef: workSource.admissionRef,
    positions: [
      {
        ...workSource.positions[0]!,
        positionId: 'POSTWAR_SOURCE_' + sha('WAREHOUSE-02/LOW').toUpperCase(),
        poolId: 'TEST_LOGISTICS_POOL',
        sourceBucket: 'LOGISTICS',
        sourceObjectId: 'WAREHOUSE-02',

        annualWage: '172800',
        currency: 'XBB',
        wageSourceRef: 'TEST_ACTUAL_WAGE',
        wageSourceRawSha256: 'c'.repeat(64),
        householdAccountId: hh.asset.accountId,
      },
    ],
  };
  const utilitySource: IndustryUtilitySource = {
    worldId: w,
    countryId: country,
    facilityId: workSource.facilityId,
    locationId: workSource.locationId,
    operatorId: operator,
    runId: terms.runId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef: workSource.admissionRef,
    sourceRef: 'TEST_LOGISTICS_UTILITY_SOURCE',
    sourceRawSha256: 'd'.repeat(64),
    policyVersion: INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION,
    policyRawSha256: INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256,
    userAdoptionRawSha256: INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256,
    originals: [
      {
        kind: 'LOGISTICS_LABOUR',
        reference: labour.sourceRef,
        rawSha256: labour.sourceRawSha256,
      },
    ],
  };
  const sourceInput = (
    expenseOriginals: readonly IndustryLogisticsExpenseOriginal[] = [],
  ) =>
    prepareIndustryInternalLogisticsReplaySources(
      {
        source: planningSource,
        labourSource: labour,
        utilitySources: [utilitySource],
        expenseOriginals,
      },
      sha,
    );
  const intent = (operation: Record<string, unknown>, key: string) => ({
    schemaVersion: 'industry-first-day-utility-command-v1',
    serviceKind: 'LOGISTICS',
    operationRef: key,
    facilityId: workSource.facilityId,
    runId: terms.runId,
    sourceRef: utilitySource.sourceRef,
    sourceRawSha256: utilitySource.sourceRawSha256,
    operation,
  });
  const command = (
    state: IndustryInternalLogisticsExecutionState | undefined,
    action: Record<string, unknown>,
    key: string,
    time = '0',
  ) =>
    rawCommand(
      INDUSTRY_UTILITY_COMMANDS.LOGISTICS,
      key,
      state
        ? readIndustryInternalLogisticsExecutionState(state).head.worldVersion
        : '1',
      time,
      intent(action, key),
    );
  const request = {
    transferId: 'TRANSFER_TEST_ONLY',
    runId: terms.runId,
    direction: 'WAREHOUSE_TO_EXISTING_FACILITY',
    quantity: { amount: '1.08', unit: 'barrel' },
    startsAtSimTime: '0',
    endsAtSimTime: '60000',
  };
  const book = { action: 'BOOK', transferId: request.transferId, request };
  const firstCommand = command(undefined, book, 'BOOK_TEST_ONLY');
  const prep = prepareIndustryUtilityExecution(
    { command: firstCommand, replay: view, source: utilitySource },
    sha,
  );
  const sources = sourceInput();
  const state = createIndustryInternalLogisticsExecutionState(
    { preparation: prep, sourceInputs: sources },
    sha,
  );
  const allocation = {
    positionId: 'POSTWAR_SOURCE_' + sha('WAREHOUSE-02/LOW').toUpperCase(),
    poolId: 'TEST_LOGISTICS_POOL',
    sourceStartOrdinal: '0',
    populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
    regionId: 'REGION_02_E1',
    cohortRef: 'TEST_COHORT',
    startOrdinal: '0',
    count: '1',
    skill: 'LOW',
    startsAtSimTime: '0',
    endsAtSimTime: '60000',
    personMilliseconds: '60000',
    personMinutes: { numerator: '60000', denominator: '60000' },
  };
  const expense = (
    workFingerprint: string,
    amount = '1',
    reference = 'TEST_LOGISTICS_EXPENSE',
  ) => {
    const rawText = C.canonicalSerialize({
      schemaVersion: 'industry-logistics-service-expense-order-v1',
      purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK_WAGE',
      inputRef: reference,
      worldId: w,
      countryId: country,
      facilityId: workSource.facilityId,
      operatorId: operator,
      runId: terms.runId,
      seedFingerprint: seed.fingerprint,
      transferId: request.transferId,
      workEventFingerprint: workFingerprint,
      householdAccountId: hh.asset.accountId,
      amount,
      currency: 'XBB',
    });
    return { reference, rawText, rawSha256: sha(rawText) };
  };
  return {
    seed,
    op,
    hh,
    world: w,
    country,
    operator,
    workSource,
    scheduled,
    opening,
    view,
    prep,
    planningSource,
    labour,
    utilitySource,
    sourceInput,
    sources,
    state,
    rawCommand,
    command,
    book,
    request,
    allocation,
    expense,
  };
}
