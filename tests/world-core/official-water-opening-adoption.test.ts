import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SimTime,
  SIMULATION_TICKS_PER_DAY,
  simulationCalendarPosition,
  createGregorianWaterCalendarBinding,
  gregorianWaterPeriod,
  monthlyWaterVolumeForInterval,
  createWaterRight,
  createWaterAllocationState,
  allocateWaterPeriod,
  waterVolume,
  waterVolumeAsQuantity,
  scaleWater,
  volumeFromDecimal,
  compareWater,
  sumWater,
  canonicalSerialize,
  createFoundationFact,
  type WaterRight,
  type WaterOperation,
  type WaterPurpose,
  type FoundationTraceRequest,
} from '@econmind/core';
import {
  buildOfficialWaterOpeningAdoption,
  createOfficialOpeningWaterState,
  previewOfficialOpeningWater,
} from '../../apps/world-worker/src/preparation/official-water-opening-adoption.js';
import type { OfficialOpeningSourceBytes } from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';

const Q = (amount: string, unit: string) => ({ amount, unit });
const rate = (amount: string) => Q(amount, 'm3/sim-day');
const time = (ticks: bigint) => SimTime.fromTicks(ticks.toString());
const day = BigInt(SIMULATION_TICKS_PER_DAY);
const at = (d: bigint) => time(d * day);
const calendar = (iso = '2024-01-01T00:00:00.000Z') =>
  createGregorianWaterCalendarBinding({
    sourceRef: 'TEST_ONLY.CALENDAR',
    anchorSimulationTimestamp: at(0n),
    anchorGregorianTimestamp: iso,
  });
const right = (
  id: string,
  purpose: WaterPurpose = 'DOMESTIC',
  quota = '100',
): WaterRight =>
  createWaterRight({
    rightRef: `TEST_ONLY.RIGHT.${id}`,
    countryRef: 'COUNTRY_01',
    regionRef: `REGION_${id}`,
    basinRef: 'BASIN_TEST',
    holderRef:
      purpose === 'CRITICAL_PUBLIC'
        ? 'ENTITY_GOVERNMENT_01'
        : 'ENTITY_HOUSEHOLDS_01',
    purpose,
    quotaPerDay: rate(quota),
    sourceRef: `TEST_ONLY.SOURCE.${id}`,
    validity: { fromTicks: '0', untilTicks: (31n * day).toString() },
  });
function state(
  rights: readonly WaterRight[] = [right('A')],
  monthly = '3100',
  reserve = '0.1',
) {
  return createWaterAllocationState({
    originRef: 'TEST_ONLY.WATER.GENESIS',
    basinRef: 'BASIN_TEST',
    calendar: calendar(),
    openingTimestamp: at(0n),
    monthlyRunoffM3: monthly,
    ecologicalReserveShare: { amount: reserve, unit: 'ratio' },
    rights,
  });
}
function demand(r: WaterRight, amount = '100', network = '100') {
  return {
    demandRef: `DEMAND_${r.regionRef}_${r.purpose}`,
    rightRef: r.rightRef,
    countryRef: r.countryRef,
    regionRef: r.regionRef,
    holderRef: r.holderRef,
    purpose: r.purpose,
    approvedDemandPerDay: rate(amount),
    networkLimitPerDay: rate(network),
    sourceRef: 'TEST_ONLY.DEMAND',
  };
}
function op(
  rights: readonly WaterRight[] = [right('A')],
  overrides: Partial<WaterOperation> = {},
): WaterOperation {
  return {
    operationRef: 'TEST_ONLY.OP.1',
    sourceRef: 'TEST_ONLY.OP.SOURCE',
    predecessorRef: 'TEST_ONLY.WATER.GENESIS',
    until: at(1n),
    capacities: {
      facilityRef: 'TEST_ONLY.FACILITY',
      operatingEvidenceRef: 'TEST_ONLY.OPERATING',
      abstractionPerDay: rate('100'),
      treatmentPerDay: rate('100'),
      networkPerDay: rate('100'),
      deliveryEfficiency: { amount: '1', unit: 'ratio' },
    },
    demands: rights.map((r) => demand(r)),
    ...overrides,
  };
}
const amount = (v: ReturnType<typeof waterVolume>) =>
  waterVolumeAsQuantity(v)?.amount;

describe('Gregorian water calendar consumes explicit simulation mapping, not 360-day interest convention', () => {
  it.each([
    [2024, 2, 29],
    [2025, 2, 28],
    [1900, 2, 28],
    [2000, 2, 29],
    [2100, 2, 28],
    [2026, 4, 30],
    [2026, 7, 31],
    [2026, 12, 31],
  ])('uses actual %i/%i length %i', (year, month, days) => {
    const c = calendar(
      `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
    );
    const p = gregorianWaterPeriod(c, at(0n));
    expect(p).toMatchObject({
      year: String(year),
      month: String(month),
      daysInMonth: String(days),
    });
    expect(BigInt(p.simulationEndTicks) - BigInt(p.simulationStartTicks)).toBe(
      BigInt(days) * day,
    );
    expect(
      gregorianWaterPeriod(c, time(BigInt(p.simulationEndTicks) - 1n)).month,
    ).toBe(String(month));
    expect(
      gregorianWaterPeriod(c, time(BigInt(p.simulationEndTicks))).month,
    ).toBe(String(month === 12 ? 1 : month + 1));
  });
  it('keeps the existing 360-day interest clock untouched', () => {
    expect(simulationCalendarPosition(at(360n)).yearIndex).toBe('1');
    expect(
      gregorianWaterPeriod(calendar('2024-01-01T00:00:00.000Z'), at(360n)),
    ).toMatchObject({ year: '2024', month: '12' });
  });
  it('preserves non-terminating monthly fractions and never divides daily flow twice', () => {
    expect(
      monthlyWaterVolumeForInterval({
        binding: calendar(),
        simulationStart: at(0n),
        simulationEnd: at(1n),
        monthlyVolumeM3: '1',
      }),
    ).toEqual(waterVolume('1', '31'));
    expect(waterVolumeAsQuantity(waterVolume('1', '31'))).toBeNull();
    const r = right('A', 'DOMESTIC', '10');
    const result = allocateWaterPeriod(
      state([r], '3100', '0'),
      op([r], { demands: [demand(r, '10')] }),
    );
    expect(amount(result.record.delivered)).toBe('10');
  });
  it('requires valid UTC anchor, positive single-month interval and canonical SimTime', () => {
    expect(() => calendar('2025-02-29T00:00:00.000Z')).toThrow(
      /Invalid Gregorian/,
    );
    expect(() => calendar('2024-01-01T00:00:00+08:00')).toThrow(
      /canonical UTC/,
    );
    expect(() =>
      gregorianWaterPeriod(calendar(), { ticks: 0n } as SimTime),
    ).toThrow();
    expect(() =>
      monthlyWaterVolumeForInterval({
        binding: calendar(),
        simulationStart: at(0n),
        simulationEnd: at(32n),
        monthlyVolumeM3: '1',
      }),
    ).toThrow(/Gregorian month/);
    expect(() =>
      monthlyWaterVolumeForInterval({
        binding: calendar(),
        simulationStart: at(0n),
        simulationEnd: at(0n),
        monthlyVolumeM3: '1',
      }),
    ).toThrow();
  });
  it.each([
    '0001-01-01T00:00:00.000Z',
    '1900-12-31T23:59:59.999Z',
    '2000-02-29T12:34:56.789Z',
    '9999-12-31T23:59:59.999Z',
  ])('round-trips exact integer timestamp %s without host time APIs', (iso) => {
    expect(gregorianWaterPeriod(calendar(iso), at(0n)).gregorianTimestamp).toBe(
      iso,
    );
  });
  it('applies an explicit nonzero simulation anchor across a Gregorian year boundary', () => {
    const c = createGregorianWaterCalendarBinding({
      sourceRef: 'TEST_ONLY.OFFSET',
      anchorSimulationTimestamp: at(10n),
      anchorGregorianTimestamp: '2023-12-31T00:00:00.000Z',
    });
    expect(gregorianWaterPeriod(c, at(11n)).gregorianTimestamp).toBe(
      '2024-01-01T00:00:00.000Z',
    );
    expect(() =>
      gregorianWaterPeriod(calendar('0001-01-01T00:00:00.000Z'), {
        ticks: -1n,
      } as SimTime),
    ).toThrow();
  });
  it('handles an explicit midmonth genesis without inventing past flows', () => {
    const c = calendar('2024-02-15T12:00:00.000Z');
    const p = gregorianWaterPeriod(c, at(0n));
    expect(BigInt(p.simulationStartTicks)).toBe(-14n * day - day / 2n);
    const s = createWaterAllocationState({
      originRef: 'TEST_ONLY.MIDMONTH',
      basinRef: 'BASIN_TEST',
      calendar: c,
      openingTimestamp: at(0n),
      monthlyRunoffM3: '2900',
      ecologicalReserveShare: { amount: '0', unit: 'ratio' },
      rights: [],
    });
    expect(amount(s.totals.grossRunoff)).toBe('0');
    expect(
      amount(
        allocateWaterPeriod(s, op([], { predecessorRef: s.lineageRef })).record
          .grossRunoff,
      ),
    ).toBe('100');
  });
});

describe('exact water fractions remain bounded and project only exact decimals', () => {
  it('reduces and conserves exact fractions, including one-third', () => {
    expect(waterVolume('2', '6')).toEqual(waterVolume('1', '3'));
    expect(
      compareWater(
        sumWater([waterVolume('1', '3'), waterVolume('2', '3')]),
        volumeFromDecimal('1'),
      ),
    ).toBe(0);
    expect(waterVolumeAsQuantity(waterVolume('1', '8'))).toEqual(
      Q('0.125', 'm3'),
    );
  });
  it('rejects a dimensioned volume being implicitly used as a scalar', () => {
    expect(() =>
      scaleWater(volumeFromDecimal('1'), volumeFromDecimal('2')),
    ).toThrow(/dimensionless/);
  });
  it.each([
    ['1', '0'],
    ['-1', '1'],
    ['01', '1'],
    ['1'.repeat(481), '1'],
  ])('rejects invalid or oversized fraction %s/%s', (n, d) => {
    expect(() => waterVolume(n, d)).toThrow();
  });
});

describe('water right / operation constructors and actual constrained consumption', () => {
  it('adopts unresolved validity without silently granting it', () => {
    const basis = createWaterRight({ ...right('A'), validity: null });
    expect(basis.validity).toBeNull();
    expect(basis.transferability).toBe('UNRESOLVED');
    expect(() => allocateWaterPeriod(state([basis]), op([basis]))).toThrow(
      /validity missing/,
    );
  });
  it('protects ecology, shares household/critical public tier, then food before industry', () => {
    const rs = [
      right('A'),
      right('B', 'CRITICAL_PUBLIC'),
      right('C', 'FOOD_AGRICULTURE'),
      right('D', 'OTHER_INDUSTRY'),
    ];
    const o = op(rs, {
      demands: [
        demand(rs[0]!, '10'),
        demand(rs[1]!, '20'),
        demand(rs[2]!, '70'),
        demand(rs[3]!, '70'),
      ],
    });
    const result = allocateWaterPeriod(state(rs), o);
    expect(amount(result.record.ecologicalReserve)).toBe('10');
    expect(result.record.deliveries.map((d) => amount(d.delivered))).toEqual([
      '10',
      '20',
      '60',
      '0',
    ]);
    expect(
      compareWater(
        result.record.grossRunoff,
        sumWater([
          result.record.ecologicalReserve,
          result.record.delivered,
          result.record.deliveryLoss,
          result.record.unusedRaw,
        ]),
      ),
    ).toBe(0);
  });
  it('redistributes same-tier residual after quota/network saturation with exact demand weights', () => {
    const rs = [right('A', 'DOMESTIC', '10'), right('B')];
    const result = allocateWaterPeriod(
      state(rs),
      op(rs, { demands: [demand(rs[0]!, '100'), demand(rs[1]!, '100')] }),
    );
    expect(result.record.deliveries.map((d) => amount(d.delivered))).toEqual([
      '10',
      '80',
    ]);
    const network = allocateWaterPeriod(
      state(rs),
      op(rs, { demands: [demand(rs[0]!, '100', '5'), demand(rs[1]!, '100')] }),
    );
    expect(network.record.deliveries.map((d) => amount(d.delivered))).toEqual([
      '5',
      '85',
    ]);
  });
  it('retains exact one-third delivery instead of silently rounding or producing extra water', () => {
    const rs = [right('A'), right('B'), right('C')];
    const s = state(rs, '31', '0');
    const result = allocateWaterPeriod(s, op(rs));
    expect(result.record.deliveries.map((d) => d.delivered)).toEqual(
      rs.map(() => waterVolume('1', '3')),
    );
    expect(amount(result.record.delivered)).toBe('1');
    expect(
      result.record.deliveries.every(
        (d) => waterVolumeAsQuantity(d.delivered) === null,
      ),
    ).toBe(true);
  });
  it.each(['abstractionPerDay', 'treatmentPerDay', 'networkPerDay'] as const)(
    'applies actual shared %s capacity',
    (field) => {
      const o = op();
      const result = allocateWaterPeriod(state(), {
        ...o,
        capacities: { ...o.capacities, [field]: rate('20') },
      });
      expect(amount(result.record.delivered)).toBe('20');
    },
  );
  it('accounts for explicit efficiency losses and no fictitious reservoir carryover', () => {
    const o = op();
    const first = allocateWaterPeriod(state(), {
      ...o,
      capacities: {
        ...o.capacities,
        deliveryEfficiency: { amount: '0.5', unit: 'ratio' },
      },
    });
    expect(amount(first.record.rawWithdrawn)).toBe('90');
    expect(amount(first.record.delivered)).toBe('45');
    expect(amount(first.record.deliveryLoss)).toBe('45');
    const unused = allocateWaterPeriod(state(), op([], { demands: [] }));
    const next = allocateWaterPeriod(
      unused.state,
      op(undefined, {
        operationRef: 'TEST_ONLY.OP.2',
        predecessorRef: unused.state.lineageRef,
        until: at(2n),
      }),
    );
    expect(amount(next.record.grossRunoff)).toBe('100');
    expect(amount(next.record.delivered)).toBe('90');
    expect(amount(next.state.totals.unusedRaw)).toBe('90');
  });
  it('conserves zero-efficiency and fully reserved ecology rather than guessing operability', () => {
    const o = op();
    const zeroEfficiency = allocateWaterPeriod(state(), {
      ...o,
      capacities: {
        ...o.capacities,
        deliveryEfficiency: { amount: '0', unit: 'ratio' },
      },
    });
    expect(amount(zeroEfficiency.record.delivered)).toBe('0');
    expect(amount(zeroEfficiency.record.rawWithdrawn)).toBe('0');
    expect(amount(zeroEfficiency.record.unusedRaw)).toBe('90');
    const reserved = allocateWaterPeriod(state(undefined, '3100', '1'), o);
    expect(amount(reserved.record.ecologicalReserve)).toBe('100');
    expect(amount(reserved.record.delivered)).toBe('0');
  });
  it('is deterministic under demand permutation, replays once and rejects changed idempotency request', () => {
    const rs = [right('A'), right('B')],
      o = op(rs),
      s = state(rs);
    const result = allocateWaterPeriod(s, o);
    const permuted = allocateWaterPeriod(state(rs), {
      ...o,
      demands: [...o.demands].reverse(),
    });
    expect(result).toEqual(permuted);
    const retry = allocateWaterPeriod(result.state, o);
    expect(retry.replayed).toBe(true);
    expect(retry.state).toBe(result.state);
    expect(retry.record).toBe(result.record);
    expect(() =>
      allocateWaterPeriod(result.state, { ...o, until: at(2n) }),
    ).toThrow(/idempotency/);
    expect(allocateWaterPeriod(s, o)).toEqual(result);
  });
  it('rejects duplicate scope, duplicate demand/right, mismatched holder/country, bad lineage, expiry and invalid units', () => {
    const r = right('A'),
      o = op([r]);
    expect(() => state([r, r])).toThrow(/Duplicate water right/);
    expect(() => state([r, { ...r, rightRef: 'TEST_ONLY.OTHER' }])).toThrow(
      /overlapping/,
    );
    expect(() =>
      allocateWaterPeriod(state(), {
        ...o,
        demands: [o.demands[0]!, o.demands[0]!],
      }),
    ).toThrow(/Duplicate demand/);
    expect(() =>
      allocateWaterPeriod(state(), {
        ...o,
        demands: [{ ...o.demands[0]!, holderRef: 'ENTITY_OPERATOR_02' }],
      }),
    ).toThrow(/scoped right/);
    expect(() =>
      allocateWaterPeriod(state(), {
        ...o,
        demands: [{ ...o.demands[0]!, countryRef: 'COUNTRY_02' }],
      }),
    ).toThrow(/scoped right/);
    expect(() =>
      allocateWaterPeriod(state(), { ...o, predecessorRef: 'TEST_ONLY.WRONG' }),
    ).toThrow(/predecessor/);
    expect(() =>
      allocateWaterPeriod(
        state([{ ...r, validity: { fromTicks: '0', untilTicks: '1' } }]),
        o,
      ),
    ).toThrow(/expired/);
    expect(() =>
      allocateWaterPeriod(state(), {
        ...o,
        capacities: { ...o.capacities, networkPerDay: Q('1', 'm3') },
      }),
    ).toThrow(/rate/);
    expect(() => allocateWaterPeriod({ ...state() }, o)).toThrow(/constructor/);
  });
  it('rejects temporal overlap/month crossing and invalid or missing operational inputs', () => {
    const o = op();
    const s = state();
    expect(() => allocateWaterPeriod(s, { ...o, until: at(0n) })).toThrow(
      /overlaps/,
    );
    expect(() => allocateWaterPeriod(s, { ...o, until: at(32n) })).toThrow(
      /crosses/,
    );
    expect(() =>
      allocateWaterPeriod(s, {
        ...o,
        capacities: {
          ...o.capacities,
          deliveryEfficiency: { amount: '1.1', unit: 'ratio' },
        },
      }),
    ).toThrow();
    expect(() =>
      allocateWaterPeriod(s, {
        ...o,
        capacities: { ...o.capacities, operatingEvidenceRef: '' },
      }),
    ).toThrow(/operatingEvidenceRef/);
    expect(() =>
      allocateWaterPeriod(s, {
        ...o,
        capacities: { ...o.capacities, treatmentPerDay: undefined! },
      }),
    ).toThrow();
  });
  it('runs a bounded local 24-hour sequence without duplicate or unbalanced flow', () => {
    let current = state();
    const original = current;
    for (let hour = 1; hour <= 24; hour++)
      current = allocateWaterPeriod(
        current,
        op(undefined, {
          operationRef: `TEST_ONLY.HOUR.${hour}`,
          predecessorRef: current.lineageRef,
          until: time((BigInt(hour) * day) / 24n),
        }),
      ).state;
    expect(current.records).toHaveLength(24);
    expect(amount(current.totals.grossRunoff)).toBe('100');
    expect(amount(current.totals.delivered)).toBe('90');
    expect(original.records).toHaveLength(0);
  });
});

const root = path.resolve(import.meta.dirname, '../..');
const read = (p: string) => readFile(path.join(root, p), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
  mappings: {
    entityProposals: {
      coreCountryId: string;
      role: string;
      proposedCoreLegalEntityId: string;
    }[];
  };
  records: {
    seasonalWater: { source: { monthlyRunoffM3Proposal: string[] } }[];
  };
};
const owner = await read(
  'tests/fixtures/physical-opening/owner-non-host-decisions-20261007.md',
);
const sourceBytes: OfficialOpeningSourceBytes = {
  mappingBytes,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (p) => [
        p,
        await read(`artifacts/world-balanced-candidate-v1/${p}`),
      ]),
    ),
  ),
};
const manifest = buildOfficialWaterOpeningAdoption({
  sourceBytes,
  ownerDecisionBytes: owner,
});
const trace: FoundationTraceRequest = {
  traceRef: 'TEST_ONLY.WATER.TRACE',
  calculationVersion: 'TEST_ONLY.WATER.1',
  snapshot: {
    lineageRef: 'TEST_ONLY.SNAPSHOT.LINEAGE',
    sourceVersion: 'TEST_ONLY.SOURCE.VERSION',
    snapshotRef: 'TEST_ONLY.SNAPSHOT.1',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: null,
  },
  snapshotAt: Q('0', 'sim_millisecond'),
};
function fact<T>(id: string, payload: T) {
  return createFoundationFact({
    trace,
    factRef: `TEST_ONLY.${id}`,
    sourceRef: `TEST_ONLY.SOURCE.${id}`,
    predecessorFactRefs: ['TEST_ONLY.GENESIS'],
    payload,
  });
}
const basis = manifest.allocations.find((r) => r.regionRef === 'REGION_48_E1')!;
function consumer() {
  return createOfficialOpeningWaterState({
    manifest,
    basinRef: basis.basinRef,
    trace,
    simulationTimestamp: at(0n),
    calendar: fact('CALENDAR', calendar()),
    grant: fact('GRANT', {
      originRef: 'TEST_ONLY.ACTUAL.CORE.WATER',
      validities: basis.rights.map((r) => ({
        rightRef: r.rightRef,
        fromTicks: '0',
        untilTicks: (31n * day).toString(),
      })),
    }),
  });
}
describe('fixed official 122-region / 70-country water basis and real public Core consumer', () => {
  it('binds all exact source bytes and preserves them unchanged; no source proposal silently becomes runtime', () => {
    const before = canonicalSerialize(sourceBytes);
    expect(manifest.allocations).toHaveLength(122);
    expect(manifest.countries).toHaveLength(70);
    expect(manifest.allocations.flatMap((r) => r.rights)).toHaveLength(366);
    expect(
      buildOfficialWaterOpeningAdoption({
        sourceBytes,
        ownerDecisionBytes: owner,
      }),
    ).toEqual(manifest);
    expect(canonicalSerialize(sourceBytes)).toBe(before);
    expect(manifest.runtimeEnabled).toBe(false);
    expect(manifest.seedAdmitted).toBe(false);
    expect(
      manifest.allocations.every(
        (r) =>
          r.source.rightsStatus === 'ALLOCATION_PROPOSAL_NOT_GRANTED' &&
          r.rights.every((right) => right.validity === null),
      ),
    ).toBe(true);
  });
  it('preserves all 104 exact aliases, 119 aggregate differences and per-country operating gaps', () => {
    expect(
      manifest.allocations.filter((r) =>
        r.gaps.some((g) => g.field === 'domesticAlias'),
      ),
    ).toHaveLength(104);
    expect(
      manifest.allocations.filter((r) =>
        r.gaps.some((g) => g.field === 'allocatedM3Day'),
      ),
    ).toHaveLength(119);
    expect(manifest.allocations[0]!.domesticAlias).toEqual({
      allocationExact: '19049847.736111112',
      socialExact: '19049847.736111',
      differenceExact: '0.000000112',
    });
    expect(
      manifest.countries.every(
        (c) =>
          c.gaps.some((g) => g.field === 'GregorianSimulationAnchor') &&
          c.gaps.some((g) => g.field === 'criticalPublicWaterRight') &&
          c.gaps.some((g) => g.field === 'networkCapacity'),
      ),
    ).toBe(true);
  });
  it('uses adopted source holders/quotas only and never doubles households into public supply', () => {
    expect(
      manifest.sourceBindings.some((b) =>
        b.path.endsWith('/data/entities.json'),
      ),
    ).toBe(true);
    for (const row of manifest.allocations) {
      expect(row.rights[0]!.holderRef).toBe(
        mapping.mappings.entityProposals.find(
          (e) => e.coreCountryId === row.countryRef && e.role === 'HOUSEHOLDS',
        )!.proposedCoreLegalEntityId,
      );
      expect(row.rights[1]!.holderRef).toBe(
        mapping.mappings.entityProposals.find(
          (e) => e.coreCountryId === row.countryRef && e.role === 'OP',
        )!.proposedCoreLegalEntityId,
      );
      expect(row.rights[0]!.holderRef).toBe(
        `ENTITY_HOUSEHOLDS_${row.countryRef.slice(-2)}`,
      );
      expect(row.rights[1]!.holderRef).toBe(
        `ENTITY_OPERATOR_${row.countryRef.slice(-2)}`,
      );
      expect(row.rights[2]!.holderRef).toBe(
        `ENTITY_OPERATOR_${row.countryRef.slice(-2)}`,
      );
      expect(row.rights.some((r) => r.purpose === 'CRITICAL_PUBLIC')).toBe(
        false,
      );
      expect(row.rights[0]!.quotaPerDay.amount).toBe(row.source.domesticM3Day);
    }
  });
  it('aggregates each regional monthly runoff once for shared basins, not once per country plus annual inflow', () => {
    expect(
      new Set(manifest.basins.flatMap((b) => b.sourceRegionRefs)).size,
    ).toBe(122);
    expect(manifest.basins.flatMap((b) => b.sourceRegionRefs)).toHaveLength(
      122,
    );
    for (let month = 0; month < 12; month++) {
      expect(
        compareWater(
          sumWater(
            manifest.basins.map((b) =>
              volumeFromDecimal(b.monthlyRunoffM3[month]!),
            ),
          ),
          sumWater(
            mapping.records.seasonalWater.map((r) =>
              volumeFromDecimal(r.source.monthlyRunoffM3Proposal[month]!),
            ),
          ),
        ),
      ).toBe(0);
    }
  });
  it('consumes a clean actual source right, source Gregorian monthly budget and explicit TEST_ONLY operation facts through public Core', () => {
    expect(basis.status).toBe('ADOPTED_BASIS_NOT_OPERATING');
    const s = consumer();
    const o = op(s.rights, { predecessorRef: s.lineageRef });
    const { until, ...rest } = o;
    const result = previewOfficialOpeningWater({
      manifest,
      state: s,
      trace,
      operation: fact('OPERATION', {
        ...rest,
        untilTicks: until.toCanonicalValue(),
      }),
    });
    expect(result.record.delivered.numerator).not.toBe('0');
    expect(result.state.records).toHaveLength(1);
    expect(result.runtimeEnabled).toBe(false);
    expect(result.seedAdmitted).toBe(false);
    expect(
      compareWater(
        result.record.grossRunoff,
        sumWater([
          result.record.ecologicalReserve,
          result.record.delivered,
          result.record.deliveryLoss,
          result.record.unusedRaw,
        ]),
      ),
    ).toBe(0);
    expect(manifest.allocations[0]!.rights[0]!.validity).toBeNull();
  });
  it('does not allow typed grant facts to resolve source conflicts or cross-basin scopes', () => {
    const conflicted = manifest.allocations[0]!;
    const input = {
      manifest,
      basinRef: conflicted.basinRef,
      trace,
      simulationTimestamp: at(0n),
      calendar: fact('CALENDAR', calendar()),
      grant: fact('GRANT', {
        originRef: 'TEST_ONLY.REJECTED',
        validities: [
          {
            rightRef: conflicted.rights[0]!.rightRef,
            fromTicks: '0',
            untilTicks: day.toString(),
          },
        ],
      }),
    };
    expect(() => createOfficialOpeningWaterState(input)).toThrow(
      /unresolved source conflict/,
    );
    expect(() =>
      createOfficialOpeningWaterState({ ...input, basinRef: basis.basinRef }),
    ).toThrow(/foreign basin|conflict/);
  });
  it('keeps exact fractional official-consumer delivery unrounded and revalidates a retry against the current snapshot', () => {
    const s = consumer(),
      o = op(s.rights, {
        predecessorRef: s.lineageRef,
        until: time(day / 24n),
      });
    const { until, ...rest } = o;
    const payload = { ...rest, untilTicks: until.toCanonicalValue() };
    const first = previewOfficialOpeningWater({
      manifest,
      state: s,
      trace,
      operation: fact('FRACTIONAL.OP', payload),
    });
    expect(
      first.decimalDeliveries.some(
        (d) =>
          d.gap === 'EXACT_DECIMAL_NOT_REPRESENTABLE' && d.delivered === null,
      ),
    ).toBe(true);
    const nextTrace = {
      ...trace,
      snapshot: {
        ...trace.snapshot,
        snapshotRef: 'TEST_ONLY.SNAPSHOT.2',
        lineageRef: first.state.lineageRef,
        snapshotHash: 'b'.repeat(64),
      },
      snapshotAt: Q(first.state.cursorTicks, 'sim_millisecond'),
    };
    const nextFact = createFoundationFact({
      trace: nextTrace,
      factRef: 'TEST_ONLY.RETRY',
      sourceRef: 'TEST_ONLY.RETRY.SOURCE',
      predecessorFactRefs: ['TEST_ONLY.FRACTIONAL.OP'],
      payload,
    });
    const retry = previewOfficialOpeningWater({
      manifest,
      state: first.state,
      trace: nextTrace,
      operation: nextFact,
    });
    expect(retry.replayed).toBe(true);
    expect(retry.state.records).toHaveLength(1);
    expect(retry.record).toBe(first.record);
    expect(() =>
      previewOfficialOpeningWater({
        manifest,
        state: first.state,
        trace,
        operation: fact('STALE.RETRY', payload),
      }),
    ).toThrow(/cursor snapshot/);
  });
  it('rejects fake owner flags, source drift, copied manifests and stale snapshot/calendar facts', () => {
    expect(() =>
      buildOfficialWaterOpeningAdoption({
        sourceBytes,
        ownerDecisionBytes: 'owner_approved=true',
      }),
    ).toThrow(/SOURCE_DRIFT/);
    expect(() =>
      buildOfficialWaterOpeningAdoption({
        sourceBytes: { ...sourceBytes, mappingBytes: `${mappingBytes} ` },
        ownerDecisionBytes: owner,
      }),
    ).toThrow();
    expect(() =>
      createOfficialOpeningWaterState({
        manifest: { ...manifest },
        basinRef: basis.basinRef,
        trace,
        simulationTimestamp: at(0n),
        calendar: fact('CALENDAR', calendar()),
        grant: fact('GRANT', {
          originRef: 'TEST_ONLY.REJECTED',
          validities: [],
        }),
      }),
    ).toThrow(/Unverified/);
    expect(() =>
      createOfficialOpeningWaterState({
        manifest,
        basinRef: basis.basinRef,
        trace,
        simulationTimestamp: at(1n),
        calendar: fact('CALENDAR', calendar()),
        grant: fact('GRANT', {
          originRef: 'TEST_ONLY.REJECTED',
          validities: [],
        }),
      }),
    ).toThrow(/snapshot timestamp/);
    const s = consumer(),
      o = op(s.rights, { predecessorRef: s.lineageRef }),
      { until, ...rest } = o,
      f = fact('OPERATION', { ...rest, untilTicks: until.toCanonicalValue() });
    expect(() =>
      previewOfficialOpeningWater({
        manifest,
        state: s,
        trace,
        operation: { ...f, canonicalPayload: '{}' },
      }),
    ).toThrow(/canonical payload/);
  });
});
