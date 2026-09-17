import { describe, expect, it } from 'vitest';

import {
  assertFoundationReplayEvidence,
  calculateV13EnergyAllocation,
  calculateV13Production,
  calculateV14ProjectLifecycle,
  calculateV14TechnologyRights,
  createFoundationFact,
  type FoundationFact,
  type FoundationTraceRequest,
} from '../../packages/core/src/index.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V13_V14.1',
  calculationVersion: 'V13_V14_FOUNDATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.1',
    sourceVersion: 'WORLD_VERSION.42',
    snapshotRef: 'SNAPSHOT.WORLD.42',
    snapshotHash: SHA_A,
    predecessorSnapshotHash: SHA_B,
  },
  snapshotAt: { amount: '1000', unit: 'sim_millisecond' },
};

const Q = (amount: string, unit: string) => ({ amount, unit }) as const;
const RATIO = (amount: string) => ({ amount, unit: 'ratio' }) as const;

function fact<T>(factRef: string, payload: T): FoundationFact<T> {
  return createFoundationFact({
    trace: TRACE,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.1'],
    payload,
  });
}

describe('V13 energy and production foundation', () => {
  it('keeps MW distinct from MWh, consumes only V12-read-only usable fuel, and makes shortage constrain allocations', () => {
    const fuel = fact('FACT.V12.FUEL', {
      v12AvailabilityRef: 'V12.AVAILABILITY.FUEL.1',
      inventoryRef: 'V12.INVENTORY.FUEL.1',
      readOnly: true as const,
      usableBefore: Q('5', 'tonne'),
    });
    const generation = fact('FACT.V13.GENERATION', {
      generationRef: 'GENERATOR.ONE',
      availableCapacity: Q('10', 'MW'),
      capacityFactor: RATIO('1'),
      hours: Q('1', 'hour'),
      fuelEnergyPerMWh: { amount: '1', inputUnit: 'MWh', outputUnit: 'tonne' },
      technologyEfficiency: RATIO('1'),
    });
    const grid = fact('FACT.V13.GRID', {
      gridRef: 'GRID.ONE',
      storageDischarge: Q('0', 'MWh'),
      imports: Q('0', 'MWh'),
      storageCharge: Q('0', 'MWh'),
      gridLosses: Q('0', 'MWh'),
      exports: Q('0', 'MWh'),
    });
    const allocationPlan = fact('FACT.V13.ALLOCATION_PLAN', {
      allocationPlanRef: 'ALLOCATION.PLAN.ONE',
      allocations: [
        {
          allocationRef: 'ALLOCATION.ONE',
          downstreamDemandRef: 'PRODUCTION.SECTOR.ONE',
          priority: '0',
          requested: Q('3', 'MWh'),
        },
        {
          allocationRef: 'ALLOCATION.TWO',
          downstreamDemandRef: 'PRODUCTION.SECTOR.TWO',
          priority: '1',
          requested: Q('3', 'MWh'),
        },
      ],
    });

    const result = calculateV13EnergyAllocation({
      trace: TRACE,
      outcomeRef: 'OUTCOME.V13.ENERGY.ONE',
      fuelAvailability: fuel,
      generation,
      grid,
      allocationPlan,
    });

    expect(result.generated).toEqual(Q('5', 'MWh'));
    expect(result.fuelConsumed).toEqual(Q('5', 'tonne'));
    expect(result.usableFuelAfter).toEqual(Q('0', 'tonne'));
    expect(result.allocations).toMatchObject([
      {
        allocationRef: 'ALLOCATION.ONE',
        delivered: Q('3', 'MWh'),
        shortage: Q('0', 'MWh'),
      },
      {
        allocationRef: 'ALLOCATION.TWO',
        delivered: Q('2', 'MWh'),
        shortage: Q('1', 'MWh'),
      },
    ]);
    assertFoundationReplayEvidence(result.replayProof, [
      fuel,
      generation,
      grid,
      allocationPlan,
    ]);
    expect(() =>
      assertFoundationReplayEvidence(result.replayProof, [
        {
          ...fuel,
          snapshot: {
            ...fuel.snapshot,
            sourceVersion: 'WORLD_VERSION.43',
          },
        },
        generation,
        grid,
        allocationPlan,
      ]),
    ).toThrow('mixed lineage/version/snapshot evidence');
    expect(() =>
      calculateV13EnergyAllocation({
        trace: TRACE,
        outcomeRef: 'OUTCOME.V13.ENERGY.BAD_UNIT',
        fuelAvailability: fuel,
        generation: fact('FACT.V13.BAD_GENERATION', {
          ...generation.payload,
          availableCapacity: Q('10', 'MWh'),
        }),
        grid,
        allocationPlan,
      }),
    ).toThrow('Available generation capacity must use MW');
  });

  it('proposes exact material, energy, labour, and logistics consumption with one constrained output', () => {
    const capacity = fact('FACT.V13.CAPACITY', {
      facilityRef: 'FACILITY.STEEL.ONE',
      operationalCapacity: {
        amount: '10',
        inputUnit: 'hour',
        outputUnit: 'tonne_product',
      },
      operatingDuration: Q('1', 'hour'),
      targetUtilisation: RATIO('1'),
      productivity: {
        amount: '1',
        inputUnit: 'tonne_product',
        outputUnit: 'tonne_product',
      },
    });
    const material = fact('FACT.V13.MATERIAL', {
      materialRef: 'MATERIAL.ORE',
      v12AvailabilityRef: 'V12.AVAILABILITY.ORE.1',
      inventoryRef: 'V12.INVENTORY.ORE.1',
      readOnly: true as const,
      usableBefore: Q('8', 'tonne'),
      requiredAtPotentialOutput: Q('10', 'tonne'),
    });
    const energy = fact('FACT.V13.ENERGY', {
      allocationRef: 'ALLOCATION.PRODUCTION.ONE',
      deliveredBefore: Q('2', 'MWh'),
      requiredAtPotentialOutput: Q('10', 'MWh'),
    });
    const labour = fact('FACT.V13.LABOUR', {
      capacityRef: 'LABOUR.STEEL.ONE',
      availableBefore: Q('10', 'person_hour'),
      requiredAtPotentialOutput: Q('10', 'person_hour'),
    });
    const logistics = fact('FACT.V13.LOGISTICS', {
      capacityRef: 'LOGISTICS.STEEL.ONE',
      availableBefore: Q('10', 'tonne_km'),
      requiredAtPotentialOutput: Q('10', 'tonne_km'),
    });

    const result = calculateV13Production({
      trace: TRACE,
      outcomeRef: 'OUTCOME.V13.PRODUCTION.ONE',
      capacity,
      materials: [material],
      energy,
      labour,
      logistics,
    });

    expect(result.potentialOutput).toEqual(Q('10', 'tonne_product'));
    expect(result.actualOutput).toEqual(Q('2', 'tonne_product'));
    expect(result.materialConsumption[0]).toMatchObject({
      proposedConsumed: Q('2', 'tonne'),
      after: Q('6', 'tonne'),
    });
    expect(result.energyConsumption).toMatchObject({
      proposedConsumed: Q('2', 'MWh'),
      after: Q('0', 'MWh'),
    });
    expect(result.outputTransition.after).toEqual(Q('2', 'tonne_product'));
    assertFoundationReplayEvidence(result.replayProof, [
      capacity,
      material,
      energy,
      labour,
      logistics,
    ]);
  });
});

describe('V14 technology and project foundation', () => {
  it('keeps LICENSED distinct from MASTERED and prevents R&D from creating capacity', () => {
    const right = fact('FACT.V14.RIGHT', {
      rightRef: 'TECH.RIGHT.ONE',
      category: 'LICENSED' as const,
      licenceUnexpired: true,
      productionLimitSatisfied: true,
      requiredPrerequisitesSatisfied: true,
      masteryEvidenceRef: null,
    });
    const research = fact('FACT.V14.RESEARCH', {
      researchRef: 'RESEARCH.ONE',
      accumulatedOutput: Q('9', 'research_point'),
      requiredOutput: Q('10', 'research_point'),
      researchLabourHours: Q('2', 'research_labour_hour'),
      fundingAvailability: RATIO('1'),
      equipmentAvailability: RATIO('1'),
      researchOutputPerLabourHour: {
        amount: '1',
        inputUnit: 'research_labour_hour',
        outputUnit: 'research_point',
      },
      researchEfficiency: RATIO('1'),
    });

    const result = calculateV14TechnologyRights({
      trace: TRACE,
      outcomeRef: 'OUTCOME.V14.RIGHTS.ONE',
      right,
      research,
    });

    expect(result).toMatchObject({
      categoryAfterResearch: 'LICENSED',
      canUseForNewBuild: true,
      researchComplete: true,
      accumulatedResearchOutput: Q('11', 'research_point'),
    });
    expect(result).not.toHaveProperty('capacity');
    assertFoundationReplayEvidence(result.replayProof, [right, research]);
    expect(() =>
      calculateV14TechnologyRights({
        trace: TRACE,
        outcomeRef: 'OUTCOME.V14.RIGHTS.FORGED_MASTERY',
        right: fact('FACT.V14.FORGED_RIGHT', {
          ...right.payload,
          masteryEvidenceRef: 'FORGED.MASTERY.EVIDENCE',
        }),
        research,
      }),
    ).toThrow('Only MASTERED technology may carry mastery evidence');
  });

  it('proposes a facility handoff only after explicit inputs, complete progress, and commissioning', () => {
    const project = fact('FACT.V14.PROJECT', {
      projectRef: 'PROJECT.ONE',
      facilityRef: 'FACILITY.ONE',
      progressBefore: Q('9', 'construction_point'),
      totalRequiredProgress: Q('10', 'construction_point'),
      plannedIncrement: Q('1', 'construction_point'),
      phase: 'UNDER_CONSTRUCTION' as const,
    });
    const approval = fact('FACT.V14.APPROVAL', {
      approvalRef: 'APPROVAL.ONE',
      projectRef: 'PROJECT.ONE',
      activeForSnapshot: true,
    });
    const funding = fact('FACT.V14.FUNDING', {
      fundingRef: 'FUNDING.ONE',
      projectRef: 'PROJECT.ONE',
      fundingSecured: true,
      releasedFactor: RATIO('1'),
    });
    const material = fact('FACT.V14.MATERIAL', {
      materialRef: 'MATERIAL.CEMENT',
      projectRef: 'PROJECT.ONE',
      v12AvailabilityRef: 'V12.AVAILABILITY.CEMENT.1',
      inventoryRef: 'V12.INVENTORY.CEMENT.1',
      readOnly: true as const,
      reservationRef: 'RESERVATION.CEMENT.ONE',
      reservedForProject: true,
      deliveredBefore: Q('5', 'tonne'),
      requiredForPlannedIncrement: Q('5', 'tonne'),
    });
    const labour = fact('FACT.V14.LABOUR', {
      labourRef: 'LABOUR.CONSTRUCTION.ONE',
      projectRef: 'PROJECT.ONE',
      workforceAvailableForStart: true,
      availableBefore: Q('2', 'person_hour'),
      requiredForPlannedIncrement: Q('2', 'person_hour'),
    });
    const technology = fact('FACT.V14.TECHNOLOGY', {
      rightRef: 'TECH.RIGHT.PROJECT.ONE',
      projectRef: 'PROJECT.ONE',
      category: 'MASTERED' as const,
      licenceUnexpired: false,
      productionLimitSatisfied: true,
      requiredPrerequisitesSatisfied: true,
      masteryEvidenceRef: 'MASTERY.EVIDENCE.ONE',
    });
    const oversight = fact('FACT.V14.OVERSIGHT', {
      oversightRef: 'OVERSIGHT.ONE',
      projectRef: 'PROJECT.ONE',
      availableFactor: RATIO('1'),
    });
    const commissioning = fact('FACT.V14.COMMISSIONING', {
      commissioningRef: 'COMMISSIONING.ONE',
      projectRef: 'PROJECT.ONE',
      facilityOwnerRef: 'FACILITY_OWNER.ONE',
      commissioningPassed: true,
      mandatoryInputEvidenceRefs: ['FACT.V14.MATERIAL', 'FACT.V14.LABOUR'],
      capacityForHandoff: Q('5', 'MW'),
    });

    const result = calculateV14ProjectLifecycle({
      trace: TRACE,
      outcomeRef: 'OUTCOME.V14.PROJECT.ONE',
      project,
      approval,
      funding,
      materials: [material],
      labour,
      technology,
      oversight,
      commissioning,
    });

    expect(result).toMatchObject({
      canStart: true,
      progressIncrement: Q('1', 'construction_point'),
      progressAfter: Q('10', 'construction_point'),
      facilityHandoff: {
        facilityRef: 'FACILITY.ONE',
        facilityOwnerRef: 'FACILITY_OWNER.ONE',
        capacity: Q('5', 'MW'),
      },
    });
    assertFoundationReplayEvidence(result.replayProof, [
      project,
      approval,
      funding,
      material,
      labour,
      technology,
      oversight,
      commissioning,
    ]);

    const blocked = calculateV14ProjectLifecycle({
      trace: TRACE,
      outcomeRef: 'OUTCOME.V14.PROJECT.BLOCKED',
      project,
      approval,
      funding,
      materials: [
        fact('FACT.V14.MATERIAL.BLOCKED', {
          ...material.payload,
          deliveredBefore: Q('0', 'tonne'),
        }),
      ],
      labour,
      technology,
      oversight,
      commissioning: fact('FACT.V14.COMMISSIONING.BLOCKED', {
        ...commissioning.payload,
        mandatoryInputEvidenceRefs: [
          'FACT.V14.MATERIAL.BLOCKED',
          'FACT.V14.LABOUR',
        ],
      }),
    });
    expect(blocked.progressIncrement).toEqual(Q('0', 'construction_point'));
    expect(blocked.facilityHandoff).toBeNull();
  });
});
