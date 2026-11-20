/** Real pinned21-refinery source rows bound to small genuine TEST_ONLY H0
 * ledgers. Source/planning data only: no actual WORK/pay/delivery or Node. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { testOpeningSeed } from '../helpers/v08-ledgers.js';
import {
  prepareIndustryInternalLogisticsSource,
  readIndustryInternalLogisticsSource,
  createIndustryInternalLogisticsPlanningState,
  prepareIndustryInternalLogisticsPlan,
  readIndustryInternalLogisticsPlan,
  INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION,
  INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256,
} from '../../packages/core/src/inventory/industry-internal-logistics.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const sourceBytes = {
  'facilities.json': read(
    'artifacts/world-balanced-candidate-v1/data/facilities.json',
  ),
  'domestic-access.json': read(
    'artifacts/world-balanced-candidate-v1/data/domestic-access.json',
  ),
  'stocks.json': read('artifacts/world-balanced-candidate-v1/data/stocks.json'),
  'commodity-catalog.json': read(
    'artifacts/world-balanced-candidate-v1/data/commodity-catalog.json',
  ),
};
function rows(s: string): Record<string, string>[] {
  const parse = JSON.parse as (
    s: string,
    revive: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => Record<string, string>[];
  return parse(s, (_k, v, c) => (typeof v === 'number' ? c.source : v));
}
const facilities = rows(sourceBytes['facilities.json']),
  stocks = rows(sourceBytes['stocks.json']),
  routes = rows(sourceBytes['domestic-access.json']);
const refineries = facilities.filter((f) => f.id?.endsWith('-REFINED_FUEL'));
const policyRawBytes = read(
  'config/postwar-genesis/industry-internal-logistics-first-day.multicountry-v2.json',
);
const adoptionRawBytes = read(
  'docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
);
function fixture(f: Record<string, string>) {
  const n = f.id!.split('-')[1]!,
    country = 'COUNTRY_' + n,
    operator = 'ENTITY_OPERATOR_' + n;
  const stock = stocks.find((s) => s.id === 'STOCK-' + n + '-CRUDE_OIL');
  if (!stock) throw Error('ACTUAL_SOURCE_STOCK_REQUIRED');
  const account = C.createInventoryAccount({
    worldId: C.worldId('WORLD_LOGISTICS_' + n + '_TEST_ONLY'),
    countryId: C.countryId(country),
    commodityId: C.commodityId(stock.commodityId!),
    batchId: C.inventoryBatchId('BATCH_ACTUAL_' + n + '_CRUDE'),
    unit: stock.unit!,
    physicalLocationId: C.inventoryLocationId('LOCATION_WAREHOUSE_' + n),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: C.legalEntityId(operator),
    riskBearerId: C.legalEntityId(operator),
    economicRecognitionId: C.economicRecognitionId('ACTUAL_RECOGNITION_' + n),
  });
  const seed = testOpeningSeed({
    worldId: account.worldId,
    sha256Hex: sha,
    inventory: {
      account,
      quantity: C.Quantity.from(stock.available!, stock.unit!),
    },
  });
  const snapshot = {
    lineageRef: 'LOGISTICS_TEST_ONLY',
    sourceVersion: seed.seedId,
    snapshotRef: 'ACTUAL_' + n,
    snapshotHash: seed.fingerprint.slice(7),
    predecessorSnapshotHash: null,
  };
  const trace = {
    traceRef: 'TRACE_' + n,
    calculationVersion: 'MULTICOUNTRY_V2',
    snapshot,
    snapshotAt: { amount: '0', unit: 'sim_millisecond' },
  };
  const payload = {
    facilityRef: f.id!,
    countryRef: country,
    operatorRef: operator,
    locationRef: 'REGION_' + n + '_E1',
    sourceCountryId: f.countryId!,
    sourceOperatorId: f.operatorId!,
  };
  const siteFact = {
    factRef: 'ACTUAL_SITE_' + n,
    sourceRef: 'ACTUAL_PINNED_FACILITIES',
    predecessorFactRefs: ['ACTUAL_PINNED_FACILITIES'],
    snapshot,
    observedAt: { amount: '0', unit: 'sim_millisecond' },
    payload,
    canonicalPayload: C.canonicalSerialize(payload),
  };
  return {
    input: {
      seed,
      trace,
      siteFact,
      openingInventoryEntryId: seed.inventoryEntries[0]!.entryId,
      policyRawBytes,
      adoptionRawBytes,
      sourceBytes,
      sha256Hex: sha,
    },
    n,
    stock,
  };
}
it('pins the derived mapping to unchanged original adoption, not another approval', () => {
  expect(sha(policyRawBytes)).toBe(
    INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256,
  );
  const p = JSON.parse(policyRawBytes);
  for (const original of p.existingAdoptions)
    expect(sha(read(original.path))).toBe(original.rawSha256);
  expect(refineries).toHaveLength(21);
});
it.each(refineries.map((f) => [f.id!, f] as const))(
  'maps actual stock/route/ownership and independent labour origins for %s or keeps zero distance closed',
  (id, f) => {
    const x = fixture(f),
      route = routes.find((r) => r.id === 'DOM-' + id);
    expect(route).toBeDefined();
    if (x.n === '20') {
      expect(route!.distanceKmEstimate).toBe('0.0');
      expect(() => prepareIndustryInternalLogisticsSource(x.input)).toThrow(
        'POSITIVE_SOURCE_CAPACITY_MASS_DISTANCE_REQUIRED',
      );
      return;
    }
    const token = prepareIndustryInternalLogisticsSource(x.input),
      data = readIndustryInternalLogisticsSource(token);
    expect(data).toMatchObject({
      policyVersion: INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION,
      countryId: 'COUNTRY_' + x.n,
      facilityId: id,
      operatorId: 'ENTITY_OPERATOR_' + x.n,
      fromLocationId: 'LOCATION_WAREHOUSE_' + x.n,
      rawRouteToId: route!.toId,
      distanceKm: route!.distanceKmEstimate,
      capacityTonnesPerSimDay: route!.capacityTonnesDayProposal,
      openingAvailable: x.stock.available,
      titleHolderId: 'ENTITY_OPERATOR_' + x.n,
      riskBearerId: 'ENTITY_OPERATOR_' + x.n,
    });
    expect(
      data.logisticsEmploymentSources.map((p) => p.sourceObjectId),
    ).toEqual(['WAREHOUSE-' + x.n, 'GATE-' + x.n]);
    const result = prepareIndustryInternalLogisticsPlan({
      source: token,
      state: createIndustryInternalLogisticsPlanningState(token),
      request: {
        transferId: 'TEST_ONLY_TRANSFER_' + x.n,
        runId: 'TEST_ONLY_RUN_' + x.n,
        direction: 'WAREHOUSE_TO_EXISTING_FACILITY',
        quantity: { amount: '1', unit: data.unit },
        startsAtSimTime: '0',
        endsAtSimTime: '86400000',
      },
    });
    expect(result.outcome).toBe('BOOKED_NOT_EXECUTED');
    expect(
      readIndustryInternalLogisticsPlan(result.plan).actualQualifiedExpense,
    ).toBeNull();
    expect(x.input.seed.inventoryEntries[0]!.account.physicalLocationId).toBe(
      'LOCATION_WAREHOUSE_' + x.n,
    );
  },
);
it('refuses a foreign admitted stock/title and changed country originals', () => {
  const x = fixture(refineries.find((f) => f.id === 'OPEN-10-REFINED_FUEL')!);
  const payload = {
    ...x.input.siteFact.payload,
    operatorRef: 'ENTITY_OPERATOR_02',
  };
  expect(() =>
    prepareIndustryInternalLogisticsSource({
      ...x.input,
      siteFact: {
        ...x.input.siteFact,
        payload,
        canonicalPayload: C.canonicalSerialize(payload),
      },
    }),
  ).toThrow('ACTUAL_SAME_OP_OPENING_STOCK_REQUIRED');
  expect(() =>
    prepareIndustryInternalLogisticsSource({
      ...x.input,
      sourceBytes: {
        ...sourceBytes,
        'stocks.json': sourceBytes['stocks.json'] + ' ',
      },
    }),
  ).toThrow('EXACT_SOURCE_BYTES_REQUIRED');
});

it('accepts the v2 source only with its matching policy, and BOOK/SHIP still cannot become delivery without independent actual work and paid inputs', async () => {
  const { createIndustryLogisticsExecutionFixture } =
    await import('../support/industry-logistics-execution-fixture.js');
  const {
    prepareIndustryInternalLogisticsReplaySources,
    createIndustryInternalLogisticsExecutionState,
    prepareIndustryInternalLogisticsFrame,
  } =
    await import('../../packages/core/src/inventory/industry-internal-logistics-execution.js');
  const { prepareIndustryUtilityExecution } =
    await import('../../packages/core/src/commands/industry-utility-execution.js');
  const f = createIndustryLogisticsExecutionFixture(),
    before = readIndustryInternalLogisticsSource(f.planningSource);
  const snapshot = {
    lineageRef: 'LOGISTICS_V2_TEST',
    sourceVersion: f.seed.seedId,
    snapshotRef: 'LOGISTICS_V2_TEST',
    snapshotHash: f.seed.fingerprint.slice(7),
    predecessorSnapshotHash: null,
  };
  const payload = {
    facilityRef: before.facilityId,
    countryRef: before.countryId,
    operatorRef: before.operatorId,
    locationRef: before.toLocationId,
    sourceCountryId: 'visual-territory-02',
    sourceOperatorId: 'OP-02',
  };
  const source = prepareIndustryInternalLogisticsSource({
    seed: f.seed,
    openingInventoryEntryId: f.seed.inventoryEntries[0]!.entryId,
    policyRawBytes,
    adoptionRawBytes,
    sourceBytes,
    sha256Hex: sha,
    trace: {
      traceRef: 'TRACE_V2',
      calculationVersion:
        INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION,
      snapshot,
      snapshotAt: { amount: '0', unit: 'sim_millisecond' },
    },
    siteFact: {
      factRef: 'SITE_V2',
      sourceRef: 'TEST_ONLY_ADMITTED_SITE',
      predecessorFactRefs: ['TEST_ONLY_ADMITTED_SITE'],
      snapshot,
      observedAt: { amount: '0', unit: 'sim_millisecond' },
      payload,
      canonicalPayload: C.canonicalSerialize(payload),
    },
  });
  expect(() =>
    prepareIndustryInternalLogisticsReplaySources(
      { source, labourSource: f.labour, utilitySources: [f.utilitySource] },
      sha,
    ),
  ).toThrow('EXACT_ADOPTED_LOGISTICS_EXECUTION_POLICY_REQUIRED');
  const utility = {
    ...f.utilitySource,
    policyVersion: INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION,
    policyRawSha256: INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256,
  };
  const sourceInputs = prepareIndustryInternalLogisticsReplaySources(
    { source, labourSource: f.labour, utilitySources: [utility] },
    sha,
  );
  const command = f.command(undefined, f.book, 'V2_BOOK');
  const preparation = prepareIndustryUtilityExecution(
    { command, replay: f.view, source: utility },
    sha,
  );
  const state = createIndustryInternalLogisticsExecutionState(
    { preparation, sourceInputs },
    sha,
  );
  const book = prepareIndustryInternalLogisticsFrame(
    { state, command, observedAtReal: '2026-11-01T00:00:00.000Z' },
    sha,
  );
  const ship = prepareIndustryInternalLogisticsFrame(
    {
      state: book.state,
      command: f.command(
        book.state,
        { action: 'SHIP', transferId: f.request.transferId },
        'V2_SHIP',
      ),
      observedAtReal: '2026-11-01T00:00:00.000Z',
    },
    sha,
  );
  expect(book.frame.inventoryPostings).toHaveLength(1);
  expect(ship.frame.inventoryPostings).toHaveLength(1);
  expect(book.frame.financialPostingBatches).toEqual([]);
  expect(ship.frame.financialPostingBatches).toEqual([]);
  expect(() =>
    prepareIndustryInternalLogisticsFrame(
      {
        state: ship.state,
        command: f.command(
          ship.state,
          { action: 'DELIVER', transferId: f.request.transferId },
          'V2_UNPAID_DELIVER',
          '60000',
        ),
        observedAtReal: '2026-11-01T00:00:00.000Z',
      },
      sha,
    ),
  ).toThrow('ACTUAL_DISTINCT_SERVICE_WORK_AND_PAID_INPUTS_REQUIRED');
});
