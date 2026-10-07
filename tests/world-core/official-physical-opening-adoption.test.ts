import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOfficialPhysicalOpeningAdoption,
  previewOfficialOpeningStorage,
  previewOfficialOpeningElectricity,
  PHYSICAL_OWNER_DECISION_SHA256,
  OPENING_ELECTRICITY_PRIORITY,
} from '../../apps/world-worker/src/preparation/official-physical-opening-adoption.js';
import type { OfficialOpeningSourceBytes } from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import {
  projectApprovedNestedOpeningResource,
  type NestedOpeningResource,
} from '../../packages/core/src/resource-inventory/approved-opening-projection.js';
import { assertResourcePoolState } from '../../packages/core/src/resource-inventory/foundation.js';
import { assertResourceConservation } from '../../packages/core/src/engine-kernels/resources-energy-production.js';
import {
  createFoundationFact,
  type FoundationTraceRequest,
} from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import type { V13EnergyAllocationInput } from '../../packages/core/src/engine-kernels/energy-production-foundation.js';
import { nonNegative } from '../../packages/core/src/engine-kernels/common.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (p: string) => readFile(path.join(root, p), 'utf8');
const owner = await read(
  'tests/fixtures/physical-opening/owner-non-host-decisions-20261007.md',
);
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
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
const manifest = buildOfficialPhysicalOpeningAdoption({
  sourceBytes,
  ownerDecisionBytes: owner,
});
const Q = (amount: string, unit: string) => ({ amount, unit });
const ratio = (amount: string) => ({ amount, unit: 'ratio' }) as const;
// Explicit mechanism-only facts, not actual source operation/staff/technology.
// Their TEST_ONLY trace must never be published as an operating permission.
const trace: FoundationTraceRequest = {
  traceRef: 'TEST_ONLY.PHYSICAL.1',
  calculationVersion: 'TEST_ONLY.1',
  snapshot: {
    lineageRef: 'TEST_ONLY.LINEAGE.1',
    sourceVersion: 'TEST_ONLY.VERSION.1',
    snapshotRef: 'TEST_ONLY.SNAPSHOT.1',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: null,
  },
  snapshotAt: Q('1000', 'sim_millisecond'),
};
function fact<T>(id: string, payload: T) {
  return createFoundationFact({
    trace,
    factRef: `TEST_ONLY.${id}`,
    sourceRef: `TEST_ONLY.SOURCE.${id}`,
    predecessorFactRefs: ['TEST_ONLY.GENESIS.1'],
    payload,
  });
}
function energy(): V13EnergyAllocationInput {
  const p = manifest.power[0]!;
  return {
    trace,
    outcomeRef: 'TEST_ONLY.ENERGY.1',
    fuelAvailability: fact('FUEL', {
      v12AvailabilityRef: 'TEST_ONLY.V12.1',
      inventoryRef: 'TEST_ONLY.FUEL.1',
      readOnly: true as const,
      usableBefore: Q('8.22915', 'tonne'),
    }),
    generation: fact('GENERATION', {
      generationRef: p.solarFacilityId!,
      availableCapacity: Q('100', 'MW'),
      capacityFactor: ratio(String(p.source.solarCapacityFactor)),
      hours: Q('1', 'hour'),
      fuelEnergyPerMWh: { amount: '1', inputUnit: 'MWh', outputUnit: 'tonne' },
      technologyEfficiency: ratio('1'),
    }),
    grid: fact('GRID', {
      gridRef: p.id,
      storageDischarge: Q('0', 'MWh'),
      imports: Q('0', 'MWh'),
      storageCharge: Q('0', 'MWh'),
      gridLosses: Q('0', 'MWh'),
      exports: Q('0', 'MWh'),
    }),
    allocationPlan: fact('PLAN', {
      allocationPlanRef: 'TEST_ONLY.PLAN.1',
      allocations: [],
    }),
  };
}
const nested: NestedOpeningResource = {
  resourceId: 'COPPER',
  unit: 'tonne',
  initialGeological: '100.125',
  cumulativeExtracted: '10.025',
  remainingGeological: '90.1',
  discoveredRemaining: '80.05',
  recoverableRemaining: '40.04',
  developedRemaining: '20.03',
  originRef: 'TEST_ONLY.COPPER',
};

describe('Owner D04 physical adoption using fixed source and real Core consumers', () => {
  it('uses exact portable adopted-decision bytes and leaves all raw source inputs unchanged', () => {
    expect(createHash('sha256').update(owner).digest('hex')).toBe(
      PHYSICAL_OWNER_DECISION_SHA256,
    );
    expect(manifest.ownerDecisionSha256).toBe(PHYSICAL_OWNER_DECISION_SHA256);
    expect(manifest.runtimeEnabled).toBe(false);
    expect(manifest.seedAdmitted).toBe(false);
    expect(manifest).not.toHaveProperty('worldId');
    expect(manifest).not.toHaveProperty('inventory');
    expect(manifest).not.toHaveProperty('cash');
    expect(
      buildOfficialPhysicalOpeningAdoption({
        sourceBytes,
        ownerDecisionBytes: owner,
      }).manifestHash,
    ).toBe(manifest.manifestHash);
    expect(
      manifest.facilities.every((f) => f.source.runtimeOperational === false),
    ).toBe(true);
    expect(
      manifest.deposits.every((d) => d.source.runtimeExtractionPerDay === '0'),
    ).toBe(true);
    expect(
      manifest.power.every(
        (p) => p.source.status === 'CANDIDATE_NOT_ENERGIZED',
      ),
    ).toBe(true);
  });
  it('adopts precisely 1024 built and leaves 350 options unbuilt without operational capacity or outputs', () => {
    expect(manifest.facilities).toHaveLength(1374);
    const built = manifest.facilities.filter(
      (f) => f.status === 'ADOPTED_BUILT',
    );
    const unbuilt = manifest.facilities.filter(
      (f) => f.status === 'NOT_ADOPTED_UNBUILT',
    );
    expect(built).toHaveLength(1024);
    expect(unbuilt).toHaveLength(350);
    expect(
      built.every(
        (f) =>
          f.commissioning === 'UNRESOLVED' &&
          f.operatingReady === false &&
          f.gaps.length > 0,
      ),
    ).toBe(true);
    expect(
      unbuilt.every(
        (f) =>
          f.titleHolderId === null &&
          f.operatorId === null &&
          f.commissioning === 'NOT_BUILT',
      ),
    ).toBe(true);
    expect(
      manifest.facilities.every(
        (f) => !('operationalCapacity' in f) && !('delivered' in f),
      ),
    ).toBe(true);
  });
  it('uses the adopted OP commercial and GOV explicitly public asset categories, not candidate blanket GOV', () => {
    const built = manifest.facilities.filter(
      (f) => f.status === 'ADOPTED_BUILT',
    );
    expect(
      built.filter((f) => f.titleHolderId?.startsWith('ENTITY_GOVERNMENT_')),
    ).toHaveLength(366);
    expect(
      built.filter((f) => f.titleHolderId?.startsWith('ENTITY_OPERATOR_')),
    ).toHaveLength(658);
    expect(built.filter((f) => f.titleHolderId === null)).toHaveLength(0);
    const mine = built.find((f) => f.source.depositId)!;
    expect(mine.titleHolderId).toBe(
      `ENTITY_OPERATOR_${mine.countryId.slice(-2)}`,
    );
    expect(mine.source.ownerId).toBe(`GOV-${mine.countryId.slice(-2)}`);
    expect(mine.riskBearerId).toBe(mine.titleHolderId);
  });
  it('constructs actual Core conserved resource states; reports exact gas unit conflict rather than renaming', () => {
    expect(manifest.deposits).toHaveLength(240);
    expect(manifest.deposits.filter((d) => d.state !== null)).toHaveLength(191);
    expect(manifest.deposits.filter((d) => d.state === null)).toHaveLength(49);
    for (const d of manifest.deposits) {
      if (!d.state) {
        expect(d.source.commodityId).toBe('NATURAL_GAS');
        expect(d.gaps).toContainEqual(
          expect.objectContaining({ field: 'unit', code: 'SOURCE_CONFLICT' }),
        );
        continue;
      }
      assertResourcePoolState(d.state);
      assertResourceConservation(d.state.geologicalEndowment, d.state.pools);
      expect(d.state.pools.extractedCumulative.amount).toBe(
        String(d.source.cumulativeExtracted).replace(/(?:\.0+)$/u, ''),
      );
      expect(d.state.appliedTransitionRefs).toEqual([]);
      expect(d.state).not.toHaveProperty('inventory');
    }
  });
  it('preserves source sovereign scope and limits conditional OP mining to explicit existing developed links', () => {
    expect(
      manifest.deposits.filter((d) => d.conditionalOperatorScope !== null),
    ).toHaveLength(106);
    for (const d of manifest.deposits) {
      expect(d.sovereignHolderId).toBe(
        `ENTITY_GOVERNMENT_${d.countryId.slice(-2)}`,
      );
      if (!d.conditionalOperatorScope) continue;
      const scope = d.conditionalOperatorScope;
      const facility = manifest.facilities.find(
        (f) => f.id === scope.facilityId,
      )!;
      expect(facility.status).toBe('ADOPTED_BUILT');
      expect(facility.source.depositId).toBe(d.id);
      expect(scope.executable).toBe(false);
      expect(d.gaps.some((g) => g.field.includes('technologyRights'))).toBe(
        true,
      );
      expect(d).not.toHaveProperty('licenseGranted');
    }
  });
  it('resolves all 70 exact solar/wind/grid/storage equipment links and adopts SOC times MWh, not commodity Batteries', () => {
    expect(manifest.power).toHaveLength(70);
    for (const p of manifest.power) {
      expect(p.solarFacilityId).not.toBeNull();
      expect(p.windFacilityId).not.toBeNull();
      expect(p.gridFacilityId).not.toBeNull();
      expect(p.storageFacilityId).not.toBeNull();
      expect(p.openingStorage?.energyCapacity.unit).toBe('MWh');
      expect(p.openingStorage?.stateOfCharge).toEqual(
        p.openingStorage?.energyCapacity,
      );
      expect(p.source.openingStateOfChargeFraction).toBe('1');
      expect(p.energized).toBe(false);
      expect(p.gaps.some((g) => g.field === 'operatingHours')).toBe(true);
      expect(p.gaps.some((g) => g.field === 'fuelEnergyPerMWh')).toBe(true);
    }
  });
  it('consumes adopted source energy through the actual Core storage transition and limits discharge by explicit duration', () => {
    const p = manifest.power[0]!;
    const output = previewOfficialOpeningStorage({
      manifest,
      countryId: p.countryId,
      durationHours: Q('1', 'hour'),
      transition: {
        requestedChargeFromGrid: Q('0', 'MWh'),
        requestedDischargeToGrid: Q('9', 'MWh'),
        chargeEfficiency: ratio('0.9'),
        dischargeEfficiency: ratio('0.9'),
      },
    });
    expect(output.result.deliveredDischarge).toEqual(Q('9', 'MWh'));
    expect(
      nonNegative(output.result.nextStateOfCharge.amount, 'next')
        .plus('10')
        .equals(nonNegative(p.openingStorage!.stateOfCharge.amount, 'opening')),
    ).toBe(true);
    expect(output.runtimeEnabled).toBe(false);
    expect(() =>
      previewOfficialOpeningStorage({
        manifest,
        countryId: p.countryId,
        durationHours: Q('0.000001', 'hour'),
        transition: {
          requestedChargeFromGrid: Q('0', 'MWh'),
          requestedDischargeToGrid: Q('9', 'MWh'),
          chargeEfficiency: ratio('0.9'),
          dischargeEfficiency: ratio('0.9'),
        },
      }),
    ).toThrow(/exceeds/);
    expect(p.openingStorage!.stateOfCharge).toEqual(
      p.openingStorage!.energyCapacity,
    );
  });
  it('does not infer charge power, duration, efficiency or grid energization from source capacity', () => {
    expect(() =>
      previewOfficialOpeningStorage({
        manifest,
        countryId: 'COUNTRY_01',
        durationHours: Q('1', 'hour'),
        transition: {
          requestedChargeFromGrid: Q('1', 'MWh'),
          requestedDischargeToGrid: Q('0', 'MWh'),
          chargeEfficiency: ratio('0.9'),
          dischargeEfficiency: ratio('0.9'),
        },
      }),
    ).toThrow(/charge power/);
    expect(() =>
      previewOfficialOpeningStorage({
        manifest,
        countryId: 'COUNTRY_01',
        durationHours: Q('1', 'sim-day'),
        transition: {
          requestedChargeFromGrid: Q('0', 'MWh'),
          requestedDischargeToGrid: Q('1', 'MWh'),
          chargeEfficiency: ratio('0.9'),
          dischargeEfficiency: ratio('0.9'),
        },
      }),
    ).toThrow(/hour/);
  });
  it('uses actual V13 fuel/grid shortages and adopted priority order with same-tier exact proportional allocation', () => {
    const output = previewOfficialOpeningElectricity({
      manifest,
      countryId: 'COUNTRY_01',
      energy: energy(),
      demands: [
        {
          id: 'TEST_ONLY.HEAVY',
          priority: 'HEAVY_INDUSTRY',
          requested: Q('10', 'MWh'),
        },
        {
          id: 'TEST_ONLY.HOSPITAL',
          priority: 'CRITICAL_PUBLIC_INFRASTRUCTURE',
          requested: Q('4.22915', 'MWh'),
        },
        {
          id: 'TEST_ONLY.HOUSE1',
          priority: 'HOUSEHOLDS',
          requested: Q('3', 'MWh'),
        },
        {
          id: 'TEST_ONLY.HOUSE2',
          priority: 'HOUSEHOLDS',
          requested: Q('9', 'MWh'),
        },
      ],
    });
    expect(output.result.generated).toEqual(Q('8.22915', 'MWh'));
    expect(output.result.fuelConsumed).toEqual(Q('8.22915', 'tonne'));
    expect(output.result.usableFuelAfter).toEqual(Q('0', 'tonne'));
    expect(output.allocations.map((x) => x.delivered.amount)).toEqual([
      '0',
      '4.22915',
      '1',
      '3',
    ]);
    expect(OPENING_ELECTRICITY_PRIORITY).toHaveLength(6);
    expect(output.runtimeEnabled).toBe(false);
  });
  it('consumes exactly eight units through the repaired public Core fuel-cap consumer', () => {
    const e = energy();
    const fuel = fact('EXACT_FUEL_CAP', {
      ...e.fuelAvailability.payload,
      usableBefore: Q('8', 'tonne'),
    });
    // The original consumer failure is retained in the producer handoff.
    // The independently reviewed repair multiplies before dividing; this is
    // a TEST_ONLY operating mechanism, not a new source fuel coefficient.
    const output = previewOfficialOpeningElectricity({
      manifest,
      countryId: 'COUNTRY_01',
      energy: { ...e, fuelAvailability: fuel },
      demands: [
        {
          id: 'TEST_ONLY.PRECISION',
          priority: 'HOUSEHOLDS',
          requested: Q('8', 'MWh'),
        },
      ],
    });
    expect(output.result.generated).toEqual(Q('8', 'MWh'));
    expect(output.result.fuelConsumed).toEqual(Q('8', 'tonne'));
    expect(output.result.usableFuelAfter).toEqual(Q('0', 'tonne'));
    expect(output.allocations[0]?.delivered).toEqual(Q('8', 'MWh'));
    expect(output.runtimeEnabled).toBe(false);
  });
  it('rejects non-terminating proportional values, duplicate demand and foreign equipment/lineage instead of defaulting', () => {
    const e = energy();
    const fuel = fact('FUEL1', {
      ...e.fuelAvailability.payload,
      usableBefore: Q('1', 'tonne'),
    });
    expect(() =>
      previewOfficialOpeningElectricity({
        manifest,
        countryId: 'COUNTRY_01',
        energy: { ...e, fuelAvailability: fuel },
        demands: ['A', 'B', 'C'].map((id) => ({
          id: `TEST_ONLY.${id}`,
          priority: 'HOUSEHOLDS',
          requested: Q('1', 'MWh'),
        })),
      }),
    ).toThrow();
    expect(() =>
      previewOfficialOpeningElectricity({
        manifest,
        countryId: 'COUNTRY_02',
        energy: e,
        demands: [
          {
            id: 'TEST_ONLY.A',
            priority: 'HOUSEHOLDS',
            requested: Q('1', 'MWh'),
          },
        ],
      }),
    ).toThrow(/country adopted/);
    expect(() =>
      previewOfficialOpeningElectricity({
        manifest: { ...manifest },
        countryId: 'COUNTRY_01',
        energy: e,
        demands: [
          {
            id: 'TEST_ONLY.A',
            priority: 'HOUSEHOLDS',
            requested: Q('1', 'MWh'),
          },
        ],
      }),
    ).toThrow(/Unverified/);
  });
  it('validates original demand-plan provenance before using it as a policy predecessor', () => {
    const e = energy();
    expect(() =>
      previewOfficialOpeningElectricity({
        manifest,
        countryId: 'COUNTRY_01',
        energy: {
          ...e,
          allocationPlan: { ...e.allocationPlan, canonicalPayload: '{}' },
        },
        demands: [
          {
            id: 'TEST_ONLY.HOUSEHOLD',
            priority: 'HOUSEHOLDS',
            requested: Q('1', 'MWh'),
          },
        ],
      }),
    ).toThrow(/canonical payload evidence/);
  });
  it('rejects changed source and fake owner approval; does not trust an approval boolean or source-only proposal', () => {
    expect(() =>
      buildOfficialPhysicalOpeningAdoption({
        sourceBytes,
        ownerDecisionBytes: 'approved=true',
      }),
    ).toThrow(/SOURCE_DRIFT/);
    expect(() =>
      buildOfficialPhysicalOpeningAdoption({
        sourceBytes,
        ownerDecisionBytes: `${owner}\n`,
      }),
    ).toThrow(/SOURCE_DRIFT/);
    expect(() =>
      buildOfficialPhysicalOpeningAdoption({
        sourceBytes: { ...sourceBytes, mappingBytes: `${mappingBytes}\n` },
        ownerDecisionBytes: owner,
      }),
    ).toThrow(/mappingBytes/);
  });
});

describe('exact nested remaining projection into the existing resource factory', () => {
  it('projects five exclusive pools without clipping, consumption substitution or a second inventory', () => {
    const state = projectApprovedNestedOpeningResource(nested);
    expect(Object.values(state.pools).map((q) => q.amount)).toEqual([
      '10.05',
      '40.01',
      '20.01',
      '20.03',
      '10.025',
    ]);
    assertResourceConservation(state.geologicalEndowment, state.pools);
    expect(state.lineageRef).toBe(nested.originRef);
  });
  it.each([
    { developedRemaining: '40.05' },
    { recoverableRemaining: '80.06' },
    { discoveredRemaining: '90.2' },
    { cumulativeExtracted: '-1' },
    { remainingGeological: '90.100000000000001' },
    { cumulativeExtracted: '0' },
    { unit: 'MMBtu', resourceId: 'NATURAL_GAS' as const },
  ])(
    'rejects illegal hierarchy or unapproved unit/remainder exactly: %j',
    (patch) => {
      expect(() =>
        projectApprovedNestedOpeningResource({ ...nested, ...patch }),
      ).toThrow();
    },
  );
});
