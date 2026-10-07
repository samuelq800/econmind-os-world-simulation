import { describe, expect, it } from 'vitest';

import {
  assertFoundationReplayEvidence,
  calculateV13EnergyAllocation,
  createFoundationFact,
  type FoundationTraceRequest,
} from '../../packages/core/src/index.js';

// Mechanism-only inputs: these are not adopted operating coefficients or a
// solar fuel assignment. The capacity factor reproduces the observed failure.
const trace: FoundationTraceRequest = {
  traceRef: 'TRACE.TEST_ONLY.FUEL_CAP',
  calculationVersion: 'TEST_ONLY.FUEL_CAP.1',
  snapshot: {
    lineageRef: 'LINEAGE.TEST_ONLY.FUEL_CAP',
    sourceVersion: 'WORLD_VERSION.1',
    snapshotRef: 'SNAPSHOT.TEST_ONLY.1',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '0', unit: 'sim_millisecond' },
};
const q = (amount: string, unit: string) => ({ amount, unit });

function allocation(usable: string, fuelRate = '1', efficiency = '1') {
  const fact = <T>(factRef: string, payload: T) =>
    createFoundationFact({
      trace,
      factRef,
      sourceRef: `SOURCE.${factRef}`,
      predecessorFactRefs: ['GENESIS.TEST_ONLY.1'],
      payload,
    });
  const fuelAvailability = fact('FACT.TEST_ONLY.FUEL', {
    v12AvailabilityRef: 'V12.TEST_ONLY.AVAILABILITY',
    inventoryRef: 'INVENTORY.TEST_ONLY.FUEL',
    readOnly: true as const,
    usableBefore: q(usable, 'tonne'),
  });
  const generation = fact('FACT.TEST_ONLY.GENERATION', {
    generationRef: 'GENERATOR.TEST_ONLY',
    availableCapacity: q('100', 'MW'),
    capacityFactor: { amount: '0.164583', unit: 'ratio' as const },
    hours: q('1', 'hour'),
    fuelEnergyPerMWh: {
      amount: fuelRate,
      inputUnit: 'MWh',
      outputUnit: 'tonne',
    },
    technologyEfficiency: { amount: efficiency, unit: 'ratio' as const },
  });
  const grid = fact('FACT.TEST_ONLY.GRID', {
    gridRef: 'GRID.TEST_ONLY',
    storageDischarge: q('0', 'MWh'),
    imports: q('0', 'MWh'),
    storageCharge: q('0', 'MWh'),
    gridLosses: q('0', 'MWh'),
    exports: q('0', 'MWh'),
  });
  const allocationPlan = fact('FACT.TEST_ONLY.ALLOCATION', {
    allocationPlanRef: 'PLAN.TEST_ONLY',
    allocations: [],
  });
  const result = calculateV13EnergyAllocation({
    trace,
    outcomeRef: 'OUTCOME.TEST_ONLY.FUEL_CAP',
    fuelAvailability,
    generation,
    grid,
    allocationPlan,
  });
  assertFoundationReplayEvidence(result.replayProof, [
    fuelAvailability,
    generation,
    grid,
    allocationPlan,
  ]);
  return result;
}

describe('V13 exact fuel cap regression', () => {
  it.each(['8', '8.22915', '0'])(
    'consumes exactly %s without dividing by potential fuel first',
    (usable) => {
      const result = allocation(usable);
      expect(result.generated).toEqual(q(usable, 'MWh'));
      expect(result.fuelConsumed).toEqual(q(usable, 'tonne'));
      expect(result.usableFuelAfter).toEqual(q('0', 'tonne'));
      expect(result.deliveredToGrid).toEqual(q(usable, 'MWh'));
      expect(result.fuelTransition).toMatchObject({
        before: q(usable, 'tonne'),
        after: q('0', 'tonne'),
      });
      expect(allocation(usable)).toEqual(result);
    },
  );

  it('preserves dimensional efficiency and consumption without an intermediate repeating factor', () => {
    const result = allocation('8', '2', '0.5');
    expect(result.generated).toEqual(q('2', 'MWh'));
    expect(result.fuelConsumed).toEqual(q('8', 'tonne'));
    expect(result.usableFuelAfter).toEqual(q('0', 'tonne'));
  });

  it('does not consume surplus stock or limit source-defined zero-fuel generation', () => {
    const surplus = allocation('20');
    expect(surplus.generated).toEqual(q('16.4583', 'MWh'));
    expect(surplus.fuelConsumed).toEqual(q('16.4583', 'tonne'));
    expect(surplus.usableFuelAfter).toEqual(q('3.5417', 'tonne'));
    const zeroFuel = allocation('0', '0');
    expect(zeroFuel.generated).toEqual(q('16.4583', 'MWh'));
    expect(zeroFuel.fuelConsumed).toEqual(q('0', 'tonne'));
  });

  it('still rejects a non-terminating final generation amount instead of rounding to pass', () => {
    expect(() => allocation('8', '3')).toThrow(
      'generation must be a canonical exact decimal',
    );
  });
});
