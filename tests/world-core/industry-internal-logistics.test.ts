/** Pure Core TEST_ONLY seed/site binding plus exact existing authored source
 * bytes. No source admission, actual WORK/payment/stock movement or PG run. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createIndustryInternalLogisticsPlanningState,
  inspectIndustryInternalLogisticsExecution,
  prepareIndustryInternalLogisticsPlan,
  prepareIndustryInternalLogisticsSource,
  readIndustryInternalLogisticsPlan,
  readIndustryInternalLogisticsSource,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256,
  type IndustryInternalLogisticsRequest,
} from '../../packages/core/src/inventory/industry-internal-logistics.js';
import { createInventoryAccount } from '../../packages/core/src/inventory/inventory-ledger.js';
import {
  countryId,
  commodityId,
  economicRecognitionId,
  inventoryBatchId,
  inventoryLocationId,
  legalEntityId,
  worldId,
} from '../../packages/core/src/ids.js';
import { Quantity } from '../../packages/core/src/numeric/quantity.js';
import { canonicalSerialize } from '../../packages/core/src/serialization/canonical.js';
import { testOpeningSeed } from '../helpers/v08-ledgers.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const bytes = (p: string) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const policy = bytes(
  'config/postwar-genesis/industry-internal-logistics-first-day.v1.json',
);
const adoption = bytes(
  'docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
);
const sourceBytes = {
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
};
function fixture(owner = 'OP_02', risk = owner, available = '3191522.33351') {
  const account = createInventoryAccount({
    worldId: worldId('WORLD_LOGISTICS_TEST_ONLY'),
    countryId: countryId('COUNTRY_02'),
    commodityId: commodityId('CRUDE_OIL'),
    batchId: inventoryBatchId('BATCH_ACTUAL_CRUDE'),
    unit: 'barrel',
    physicalLocationId: inventoryLocationId('LOCATION_WAREHOUSE_02'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: legalEntityId(owner),
    riskBearerId: legalEntityId(risk),
    economicRecognitionId: economicRecognitionId('ORIGINAL_RECOGNITION'),
  });
  const seed = testOpeningSeed({
    worldId: account.worldId,
    sha256Hex: sha,
    inventory: { account, quantity: Quantity.from(available, 'barrel') },
  });
  const snapshot = {
    lineageRef: 'LOGISTICS_TEST_ONLY',
    sourceVersion: seed.seedId,
    snapshotRef: 'ACTUAL_TEST_SEED',
    snapshotHash: seed.fingerprint.slice(7),
    predecessorSnapshotHash: null,
  };
  const trace = {
    traceRef: 'TRACE_LOGISTICS',
    calculationVersion: 'FIRST_DAY_V1',
    snapshot,
    snapshotAt: { amount: '0', unit: 'sim_millisecond' },
  };
  const payload = {
    facilityRef: 'OPEN-02-REFINED_FUEL',
    countryRef: 'COUNTRY_02',
    operatorRef: 'OP_02',
    locationRef: 'LOCATION_ACTUAL_TEST_REFINERY',
    sourceCountryId: 'visual-territory-02',
    sourceOperatorId: 'OP-02',
  };
  const siteFact = {
    factRef: 'ACTUAL_TEST_SITE',
    sourceRef: 'FIXTURE_EXISTING_SITE',
    predecessorFactRefs: ['EXISTING_SITE_SOURCE'],
    snapshot,
    observedAt: { amount: '0', unit: 'sim_millisecond' },
    payload,
    canonicalPayload: canonicalSerialize(payload),
  };
  const input = {
    seed,
    trace,
    siteFact,
    openingInventoryEntryId: seed.inventoryEntries[0]!.entryId,
    policyRawBytes: policy,
    adoptionRawBytes: adoption,
    sourceBytes,
    sha256Hex: sha,
  };
  return { input, create: () => prepareIndustryInternalLogisticsSource(input) };
}
const request = (
  patch: Partial<IndustryInternalLogisticsRequest> = {},
): IndustryInternalLogisticsRequest => ({
  transferId: 'TRANSFER_1',
  runId: 'RUN_1',
  direction: 'WAREHOUSE_TO_EXISTING_FACILITY',
  quantity: { amount: '1', unit: 'barrel' },
  startsAtSimTime: '0',
  endsAtSimTime: '86400000',
  ...patch,
});
function prepared() {
  const f = fixture(),
    source = f.create();
  return {
    f,
    source,
    state: createIndustryInternalLogisticsPlanningState(source),
  };
}
describe('adopted finite internal same-OP logistics preparation', () => {
  it('binds unchanged raw direction/provenance and actual same-OP warehouse stock to a distinct named site', () => {
    const { f, source } = prepared(),
      s = readIndustryInternalLogisticsSource(source);
    expect(s).toMatchObject({
      fromLocationId: 'LOCATION_WAREHOUSE_02',
      toLocationId: 'LOCATION_ACTUAL_TEST_REFINERY',
      rawRouteFromId: 'OPEN-02-REFINED_FUEL',
      rawRouteToId: 'GATE-02',
      rawRouteStatus: 'NOT_SURVEYED_NOT_OPERATIONAL',
      routeNature: 'SCENARIO_NAMED_HANDOVER_NOT_SURVEYED_ROAD',
      distanceKm: '1252.5865375359651',
      capacityTonnesPerSimDay: '248321.976502',
      tonnesPerUnit: '0.136',
      titleHolderId: 'OP_02',
      riskBearerId: 'OP_02',
      economicRecognitionId: 'ORIGINAL_RECOGNITION',
    });
    expect(f.input.seed.inventoryEntries[0]!.account.physicalLocationId).toBe(
      'LOCATION_WAREHOUSE_02',
    );
    expect(sha(policy)).toBe(INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256);
  });
  it('computes exact tonnes/distance/budget reference without creating expense, WORK, payment or movement', () => {
    const { source, state, f } = prepared(),
      r = prepareIndustryInternalLogisticsPlan({
        source,
        state,
        request: request(),
      }),
      p = readIndustryInternalLogisticsPlan(r.plan);
    expect(r.outcome).toBe('BOOKED_NOT_EXECUTED');
    expect(p).toMatchObject({
      tonnes: '0.136',
      tonneKilometres: '170.3517691048912536',
      capacityRateTonnesPerSimDay: { numerator: '17', denominator: '125' },
      budgetReference: {
        amount: '2.555276536573368804',
        currency: 'GCU',
        isPriceOrExpense: false,
      },
      actualQualifiedExpense: null,
      requiresSameTransactionSourceAndInventoryRecheck: true,
    });
    expect(
      f.input.seed.inventoryEntries[0]!.quantity.toCanonicalValue().amount,
    ).toBe('3191522.33351');
    expect(
      inspectIndustryInternalLogisticsExecution({ plan: r.plan }),
    ).toMatchObject({
      status: 'MISSING_EXECUTION_ORIGINALS',
      missing: [
        'INDEPENDENT_LOGISTICS_SERVICE_WORK_REQUIRED',
        'QUALIFIED_PAID_LOGISTICS_INPUT_REQUIRED',
      ],
      handover: null,
      financialPostingBatches: [],
      inventoryPostings: [],
    });
  });
  it('reserves exactly one interval and returns an exact duplicate instead of double-counting capacity', () => {
    const { source, state } = prepared(),
      a = prepareIndustryInternalLogisticsPlan({
        source,
        state,
        request: request(),
      }),
      b = prepareIndustryInternalLogisticsPlan({
        source,
        state: a.state,
        request: request(),
      });
    expect(b.outcome).toBe('EXACT_DUPLICATE');
    expect(b.plan).toBe(a.plan);
    expect(b.state).toBe(a.state);
    expect(() =>
      prepareIndustryInternalLogisticsPlan({
        source,
        state: a.state,
        request: request({ quantity: { amount: '2', unit: 'barrel' } }),
      }),
    ).toThrow('TRANSFER_IDEMPOTENCY_CONFLICT');
  });
  it('shares capacity across concurrent runs and leaves the prior booking usable after rejection', () => {
    const { source, state } = prepared();
    const a = prepareIndustryInternalLogisticsPlan({
      source,
      state,
      request: request({ quantity: { amount: '900000', unit: 'barrel' } }),
    });
    const b = prepareIndustryInternalLogisticsPlan({
      source,
      state: a.state,
      request: request({
        transferId: 'TRANSFER_2',
        runId: 'RUN_2',
        quantity: { amount: '900000', unit: 'barrel' },
      }),
    });
    expect(() =>
      prepareIndustryInternalLogisticsPlan({
        source,
        state: b.state,
        request: request({
          transferId: 'TRANSFER_3',
          runId: 'RUN_3',
          quantity: { amount: '100000', unit: 'barrel' },
        }),
      }),
    ).toThrow('INTERVAL_LOGISTICS_THROUGHPUT_EXCEEDED');
    expect(
      prepareIndustryInternalLogisticsPlan({
        source,
        state: b.state,
        request: request({
          transferId: 'TRANSFER_3',
          runId: 'RUN_3',
          quantity: { amount: '1', unit: 'barrel' },
        }),
      }).outcome,
    ).toBe('BOOKED_NOT_EXECUTED');
  });
  it('permits adjacent disjoint windows but rejects a one-tick overlap at the capacity peak', () => {
    const { source, state } = prepared();
    const a = prepareIndustryInternalLogisticsPlan({
      source,
      state,
      request: request({
        quantity: { amount: '900000', unit: 'barrel' },
        endsAtSimTime: '43200000',
      }),
    });
    expect(
      prepareIndustryInternalLogisticsPlan({
        source,
        state: a.state,
        request: request({
          transferId: 'TRANSFER_2',
          quantity: { amount: '900000', unit: 'barrel' },
          startsAtSimTime: '43200000',
        }),
      }).outcome,
    ).toBe('BOOKED_NOT_EXECUTED');
    expect(() =>
      prepareIndustryInternalLogisticsPlan({
        source,
        state: a.state,
        request: request({
          transferId: 'TRANSFER_3',
          quantity: { amount: '900000', unit: 'barrel' },
          startsAtSimTime: '43199999',
        }),
      }),
    ).toThrow('INTERVAL_LOGISTICS_THROUGHPUT_EXCEEDED');
  });
  it('retains a nonterminating rate as exact rational rather than rounding a throughput debit', () => {
    const { source, state } = prepared(),
      p = readIndustryInternalLogisticsPlan(
        prepareIndustryInternalLogisticsPlan({
          source,
          state,
          request: request({
            quantity: { amount: '0.01', unit: 'barrel' },
            endsAtSimTime: '7',
          }),
        }).plan,
      );
    expect(p.capacityRateTonnesPerSimDay).toEqual({
      numerator: '117504',
      denominator: '7',
    });
    expect(p.budgetReference.amount).toBe('0.02555276536573368804');
  });
  it.each([
    { startsAtSimTime: '0.5' },
    { endsAtSimTime: '0' },
    { endsAtSimTime: '86400001' },
    { quantity: { amount: '0', unit: 'barrel' } },
    { quantity: { amount: '01', unit: 'barrel' } },
    { quantity: { amount: '1', unit: 'tonne' } },
  ])('rejects invalid first-day quantity/window/units %j', (patch) => {
    const { source, state } = prepared();
    expect(() =>
      prepareIndustryInternalLogisticsPlan({
        source,
        state,
        request: request(patch),
      }),
    ).toThrow();
  });
  it('rejects source-byte changes, wrong policy/adoption, counterfeit seed or site snapshot', () => {
    const { input } = fixture();
    expect(() =>
      prepareIndustryInternalLogisticsSource({
        ...input,
        sourceBytes: {
          ...sourceBytes,
          'domestic-access.json': sourceBytes['domestic-access.json'] + ' ',
        },
      }),
    ).toThrow('EXACT_SOURCE_BYTES_REQUIRED');
    expect(() =>
      prepareIndustryInternalLogisticsSource({
        ...input,
        policyRawBytes: policy + ' ',
      }),
    ).toThrow('EXACT_VERSIONED_LOGISTICS_POLICY_REQUIRED');
    expect(() =>
      prepareIndustryInternalLogisticsSource({
        ...input,
        adoptionRawBytes: adoption + ' ',
      }),
    ).toThrow('EXACT_UTILITY_USER_ADOPTION_REQUIRED');
    expect(() =>
      prepareIndustryInternalLogisticsSource({
        ...input,
        seed: { ...input.seed },
      }),
    ).toThrow('GENUINE_OPENING_SEED_REQUIRED');
    expect(() =>
      prepareIndustryInternalLogisticsSource({
        ...input,
        trace: {
          ...input.trace,
          snapshot: { ...input.trace.snapshot, snapshotHash: 'a'.repeat(64) },
        },
      }),
    ).toThrow('ACTUAL_SEED_SNAPSHOT_REQUIRED');
  });
  it('refuses another title/risk holder, inflated or missing stock instead of relabelling inventory', () => {
    expect(() => fixture('GOV_02').create()).toThrow(
      'ACTUAL_SAME_OP_OPENING_STOCK_REQUIRED',
    );
    expect(() => fixture('OP_02', 'BANK_02').create()).toThrow(
      'ACTUAL_SAME_OP_OPENING_STOCK_REQUIRED',
    );
    expect(() => fixture('OP_02', 'OP_02', '999999999').create()).toThrow(
      'ACTUAL_SAME_OP_OPENING_STOCK_REQUIRED',
    );
  });
  it('refuses copied private plans/states and manufacturing WORK or ready/payment flags as handover evidence', () => {
    const { source, state } = prepared(),
      p = prepareIndustryInternalLogisticsPlan({
        source,
        state,
        request: request(),
      });
    expect(() => readIndustryInternalLogisticsPlan({ ...p.plan })).toThrow(
      'GENUINE_LOGISTICS_PLAN_REQUIRED',
    );
    expect(() =>
      prepareIndustryInternalLogisticsPlan({
        source,
        state: { ...state },
        request: request(),
      }),
    ).toThrow('SAME_SOURCE_PLANNING_STATE_REQUIRED');
    const e = inspectIndustryInternalLogisticsExecution({
      plan: p.plan,
      manufacturingWork: { commandType: 'CORE_INDUSTRY_FIRST_DAY_WORK_V1' },
      independentServiceWork: { ready: true },
      paidInputs: { paid: true, amount: '2.555276536573368804' },
    });
    expect(e.missing).toContain('MANUFACTURING_WORK_IS_NOT_LOGISTICS_WORK');
    expect(e.missing).toContain(
      'FIXED_LOGISTICS_ORIGINALS_ISSUER_NOT_INSTALLED',
    );
    expect(e.handover).toBeNull();
    expect(e.financialPostingBatches).toEqual([]);
  });
});
