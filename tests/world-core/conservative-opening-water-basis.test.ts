/** Actual 122 fixed source rows, deterministic DATA only. No seed bootstrap,
 * World, DB, water grant/operation, utility rule adoption or delivery. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONSERVATIVE_OPENING_WATER_SOURCES,
  deriveConservativeWaterRegionLimit,
  deriveFixedConservativeOpeningWaterBasis,
  floorConservativeWaterSixDecimals,
} from '../../packages/core/src/water/conservative-opening-basis.js';
import {
  addWater,
  compareWater,
  minimumWater,
  scaleWater,
  sumWater,
  volumeFromDecimal,
  waterFraction,
  waterVolume,
} from '../../packages/core/src/water/exact-volume.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const names = {
  allocations: 'water-allocations',
  population: 'population-services',
  seasonal: 'seasonal-water',
  geography: 'geography',
} as const;
const raw = Object.fromEntries(
  await Promise.all(
    Object.entries(names).map(async ([k, name]) => [
      k,
      await readFile(
        new URL(
          '../../artifacts/world-balanced-candidate-v1/data/' + name + '.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ]),
  ),
) as Record<keyof typeof names, string>;
function small() {
  return {
    allocation: {
      regionId: 'REGION_TEST_ONLY',
      countryId: 'COUNTRY_TEST_ONLY',
      basinId: 'BASIN_TEST_ONLY',
      domesticM3Day: '2.0000001',
      agricultureM3Day: '3',
      industryM3Day: '4.9999999',
      allocatedM3Day: '10',
      availableM3Day: '10.9999999',
      remainingM3Day: '0.9999999',
      drySeasonAvailableM3Day: '10.123456789',
    },
    domesticAlias: '2.0000009',
    seasonal: {
      selectedMonthlyRunoffM3: '313.827160459',
      ecologicalReserveShare: '0',
    },
    daysInMonth: '31',
  };
}
describe('conservative fixed water basis is bounded reversible DATA', () => {
  it('preserves all 122 raw regions, larger protected aliases, 20 dry shortages and every basin bound across all months', () => {
    const before = { ...raw };
    for (const [key, h] of Object.entries(CONSERVATIVE_OPENING_WATER_SOURCES))
      expect(sha(raw[key as keyof typeof raw])).toBe(h);
    for (let month = 1; month <= 12; month++) {
      const data = deriveFixedConservativeOpeningWaterBasis(
        { raw, year: '2026', month: String(month) },
        sha,
      );
      expect(data.raw).toEqual(before);
      expect(data.regions).toHaveLength(122);
      expect(data.nominalDrySeasonShortageCount).toBe(20);
      expect(
        data.regions.filter((r) =>
          Object.values(r.differences).some(
            (d) => d.absolute.numerator !== '0',
          ),
        ),
      ).toHaveLength(121);
      expect(data.regions.every((r) => r.numericTailOnly)).toBe(true);
      const assignedRegions = data.basins.flatMap((b) => b.sourceRegionIds);
      expect(assignedRegions).toHaveLength(122);
      expect(new Set(assignedRegions).size).toBe(122);
      for (const r of data.regions) {
        const protectedDomestic = volumeFromDecimal(r.raw.domesticAlias),
          sourceDomestic = volumeFromDecimal(
            String(r.raw.allocation.domesticM3Day),
          ),
          agriculture = volumeFromDecimal(
            String(r.raw.allocation.agricultureM3Day),
          );
        expect(
          compareWater(
            r.protectedDemand,
            addWater(protectedDomestic, agriculture),
          ),
        ).toBeGreaterThanOrEqual(0);
        expect(
          compareWater(
            r.protectedDemand,
            addWater(sourceDomestic, agriculture),
          ),
        ).toBeGreaterThanOrEqual(0);
        const limits = data.basins
          .flatMap((b) => b.limits)
          .filter((x) => x.sourceRegionId === r.sourceRegionId);
        expect(limits).toHaveLength(1);
        const limit = limits[0]!.limit;
        expect(
          compareWater(limit.volume, r.localIndustrialBound),
        ).toBeLessThanOrEqual(0);
        expect(
          compareWater(
            limit.volume,
            volumeFromDecimal(String(r.raw.allocation.industryM3Day)),
          ),
        ).toBeLessThanOrEqual(0);
        expect(limit.amount.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6);
        expect(
          compareWater(
            r.supplyBound,
            minimumWater(
              r.monthlyPostEcologyDaily,
              volumeFromDecimal(String(r.raw.allocation.availableM3Day)),
              volumeFromDecimal(
                String(r.raw.allocation.drySeasonAvailableM3Day),
              ),
            ),
          ),
        ).toBe(0);
      }
      for (const b of data.basins) {
        const members = data.regions.filter((r) => r.basinRef === b.basinRef);
        expect(sumWater(members.map((r) => r.supplyBound))).toEqual(
          b.supplyBound,
        );
        expect(sumWater(b.limits.map((x) => x.limit.volume))).toEqual(
          b.assigned,
        );
        expect(addWater(b.assigned, b.unassigned)).toEqual(
          b.industrialEnvelope,
        );
        expect(
          compareWater(b.industrialEnvelope, b.supplyBound),
        ).toBeLessThanOrEqual(0);
        if (compareWater(b.protectedDemand, b.supplyBound) >= 0)
          expect(b.assigned.numerator).toBe('0');
        else
          expect(
            compareWater(
              addWater(b.assigned, b.protectedDemand),
              b.supplyBound,
            ),
          ).toBeLessThanOrEqual(0);
      }
    }
    expect(raw).toEqual(before);
  });
  it('floors only the derived upper bound, retaining exact rational unassigned water', () => {
    const original = small();
    const data = deriveConservativeWaterRegionLimit(original);
    original.allocation.domesticM3Day = '999';
    expect(data.raw.allocation.domesticM3Day).toBe('2.0000001');
    expect(data.protectedDemand).toEqual(volumeFromDecimal('5.0000009'));
    expect(data.industrialLimit.amount).toBe('4.999999');
    expect(data.industrialLimit.unassigned).toEqual(
      volumeFromDecimal('0.0000009'),
    );
    const f = floorConservativeWaterSixDecimals(waterVolume('1', '3'));
    expect(f.amount).toBe('0.333333');
    expect(addWater(f.volume, f.unassigned)).toEqual(waterVolume('1', '3'));
    expect(
      floorConservativeWaterSixDecimals(volumeFromDecimal('0.0000009')).amount,
    ).toBe('0');
  });
  it('retains genuine shortage and closes incompatible aliases without turning either into a grant', () => {
    const base = small(),
      dry = deriveConservativeWaterRegionLimit({
        ...base,
        allocation: { ...base.allocation, drySeasonAvailableM3Day: '4' },
      });
    expect(dry.nominalDrySeasonShortfall).toEqual(volumeFromDecimal('6'));
    expect(dry.industrialLimit.amount).toBe('0');
    const wrong = deriveConservativeWaterRegionLimit({
      ...base,
      domesticAlias: '2.1',
    });
    expect(wrong.numericTailOnly).toBe(false);
    expect(wrong.industrialLimit.amount).toBe('0');
    expect(wrong.raw.domesticAlias).toBe('2.1');
  });
  it('uses actual Gregorian month lengths, including leap February, without truncating rational budgets', () => {
    const leap = deriveFixedConservativeOpeningWaterBasis(
        { raw, year: '2028', month: '2' },
        sha,
      ),
      normal = deriveFixedConservativeOpeningWaterBasis(
        { raw, year: '2026', month: '2' },
        sha,
      );
    expect(leap.period.daysInMonth).toBe('29');
    expect(normal.period.daysInMonth).toBe('28');
    for (let i = 0; i < 122; i++) {
      expect(
        scaleWater(
          leap.regions[i]!.monthlyPostEcologyDaily,
          waterFraction('29', '1'),
        ),
      ).toEqual(
        scaleWater(
          normal.regions[i]!.monthlyPostEcologyDaily,
          waterFraction('28', '1'),
        ),
      );
    }
    expect(() =>
      deriveFixedConservativeOpeningWaterBasis(
        { raw, year: '2026', month: '13' },
        sha,
      ),
    ).toThrow('Gregorian');
    expect(() =>
      deriveFixedConservativeOpeningWaterBasis(
        {
          raw: { ...raw, allocations: raw.allocations + ' ' },
          year: '2026',
          month: '1',
        },
        sha,
      ),
    ).toThrow('source drift');
    expect(() =>
      floorConservativeWaterSixDecimals({
        numerator: '1',
        denominator: '0',
        unit: 'm3',
      }),
    ).toThrow();
  });
});
