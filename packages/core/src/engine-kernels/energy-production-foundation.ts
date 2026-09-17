import {
  calculateEnergyGeneration,
  calculateProductionOutcome,
  reconcileElectricityBalance,
} from './resources-energy-production.js';
import {
  decimal,
  kernelInvalid,
  minimum,
  physicalQuantity,
  render,
  renderQuantity,
  sameUnit,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitRate,
  type WorldDecimalValue,
} from './common.js';
import {
  exactQuantityTransition,
  foundationFactPayload,
  foundationReplayProof,
  type ExactQuantityTransition,
  type FoundationFact,
  type V13V14FoundationReplayProof,
  type FoundationTraceRequest,
} from './foundation-provenance.js';

/**
 * V13's pure E09/E10 foundation. It consumes only immutable, caller-owned
 * evidence and emits proposed physical transitions for a future authoritative
 * writer. It never posts resource, energy, inventory, output, or ledger state.
 */
export const V13_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function reference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

function mwh(value: ExactQuantity, label: string): WorldDecimalValue {
  const parsed = physicalQuantity(value, label);
  if (parsed.unit !== 'MWh') kernelInvalid(`${label} must use MWh`);
  return parsed.amount;
}

function ratioFromAvailability(input: {
  readonly available: ExactQuantity;
  readonly required: ExactQuantity;
  readonly label: string;
}): ExactRatio {
  sameUnit(input.available, input.required, input.label);
  const available = physicalQuantity(
    input.available,
    `${input.label}.available`,
  ).amount;
  const required = physicalQuantity(
    input.required,
    `${input.label}.required`,
  ).amount;
  return Object.freeze({
    amount: render(
      required.isZero()
        ? decimal('1', `${input.label}.one`)
        : minimum(
            [decimal('1', `${input.label}.one`), available.dividedBy(required)],
            input.label,
          ),
    ),
    unit: 'ratio',
  });
}

function strictlyAscendingPriorities(
  values: readonly {
    readonly priority: string;
    readonly allocationRef: string;
  }[],
  label: string,
): void {
  let previous: WorldDecimalValue | null = null;
  const references = new Set<string>();
  for (const [index, value] of values.entries()) {
    const priority = decimal(value.priority, `${label}[${index}].priority`);
    if (priority.isNegative() || !priority.isInteger()) {
      kernelInvalid(
        `${label}[${index}].priority must be a non-negative integer`,
      );
    }
    if (previous !== null && priority.lessThanOrEqualTo(previous)) {
      kernelInvalid(
        `${label} priorities must be strictly ascending and caller-owned`,
      );
    }
    previous = priority;
    const allocationRef = reference(
      value.allocationRef,
      `${label}[${index}].allocationRef`,
    );
    if (references.has(allocationRef)) {
      kernelInvalid(`${label} must not repeat an allocation reference`);
    }
    references.add(allocationRef);
  }
}

export interface V12UsableResourceAvailability {
  /** Exact read-only E08 availability reference, not a local inventory copy. */
  readonly v12AvailabilityRef: string;
  readonly inventoryRef: string;
  readonly readOnly: true;
  readonly usableBefore: ExactQuantity;
}

export interface V13GenerationParameters {
  readonly generationRef: string;
  readonly availableCapacity: ExactQuantity;
  readonly capacityFactor: ExactRatio;
  readonly hours: ExactQuantity;
  /** Fuel per generated MWh. Its output unit must match E08 usable stock. */
  readonly fuelEnergyPerMWh: ExactUnitRate;
  readonly technologyEfficiency: ExactRatio;
}

export interface V13GridFlows {
  readonly gridRef: string;
  readonly storageDischarge: ExactQuantity;
  readonly imports: ExactQuantity;
  readonly storageCharge: ExactQuantity;
  readonly gridLosses: ExactQuantity;
  readonly exports: ExactQuantity;
}

export interface V13EnergyAllocationDemand {
  readonly allocationRef: string;
  readonly downstreamDemandRef: string;
  /** Explicit caller-owned dispatch order; the kernel supplies no policy priority. */
  readonly priority: string;
  readonly requested: ExactQuantity;
}

export interface V13EnergyAllocationPlan {
  readonly allocationPlanRef: string;
  readonly allocations: readonly V13EnergyAllocationDemand[];
}

export interface V13EnergyAllocationInput {
  readonly trace: FoundationTraceRequest;
  readonly outcomeRef: string;
  readonly fuelAvailability: FoundationFact<V12UsableResourceAvailability>;
  readonly generation: FoundationFact<V13GenerationParameters>;
  readonly grid: FoundationFact<V13GridFlows>;
  readonly allocationPlan: FoundationFact<V13EnergyAllocationPlan>;
}

export interface V13EnergyAllocationResultLine {
  readonly allocationRef: string;
  readonly downstreamDemandRef: string;
  readonly priority: string;
  readonly requested: ExactQuantity;
  readonly delivered: ExactQuantity;
  readonly shortage: ExactQuantity;
  readonly availability: ExactRatio;
  readonly energyTransition: ExactQuantityTransition;
}

export interface V13EnergyAllocationResult {
  readonly foundationStatus: typeof V13_FOUNDATION_STATUS;
  readonly outcomeRef: string;
  readonly v12AvailabilityRef: string;
  readonly inventoryRef: string;
  readonly generationRef: string;
  readonly gridRef: string;
  readonly generated: ExactQuantity;
  readonly fuelConsumed: ExactQuantity;
  /** Inert proposal only; V12 remains the owner of usable inventory. */
  readonly usableFuelAfter: ExactQuantity;
  readonly deliveredToGrid: ExactQuantity;
  readonly allocations: readonly V13EnergyAllocationResultLine[];
  readonly fuelTransition: ExactQuantityTransition;
  readonly gridTransition: ExactQuantityTransition;
  readonly replayProof: V13V14FoundationReplayProof;
}

/**
 * Computes MWh generation and explicit grid allocation. Fuel scarcity caps MWh
 * before grid allocation, so every downstream shortage is a physical outcome,
 * not a cosmetic availability flag.
 */
export function calculateV13EnergyAllocation(
  input: V13EnergyAllocationInput,
): V13EnergyAllocationResult {
  const fuel = foundationFactPayload(
    input.trace,
    input.fuelAvailability,
    'fuelAvailability',
  );
  const generation = foundationFactPayload(
    input.trace,
    input.generation,
    'generation',
  );
  const grid = foundationFactPayload(input.trace, input.grid, 'grid');
  const allocationPlan = foundationFactPayload(
    input.trace,
    input.allocationPlan,
    'allocationPlan',
  );
  const outcomeRef = reference(input.outcomeRef, 'outcomeRef');
  const v12AvailabilityRef = reference(
    fuel.v12AvailabilityRef,
    'fuelAvailability.v12AvailabilityRef',
  );
  const inventoryRef = reference(
    fuel.inventoryRef,
    'fuelAvailability.inventoryRef',
  );
  if (fuel.readOnly !== true) {
    kernelInvalid(
      'V12 usable resource availability must be explicitly read-only',
    );
  }
  reference(generation.generationRef, 'generation.generationRef');
  reference(grid.gridRef, 'grid.gridRef');
  reference(
    allocationPlan.allocationPlanRef,
    'allocationPlan.allocationPlanRef',
  );
  strictlyAscendingPriorities(
    allocationPlan.allocations,
    'allocationPlan.allocations',
  );

  const unconstrained = calculateEnergyGeneration({
    availableCapacity: generation.availableCapacity,
    capacityFactor: generation.capacityFactor,
    hours: generation.hours,
    fuelEnergyPerMWh: generation.fuelEnergyPerMWh,
    technologyEfficiency: generation.technologyEfficiency,
  });
  const usableFuel = physicalQuantity(
    fuel.usableBefore,
    'fuelAvailability.usableBefore',
  );
  const requiredFuel = physicalQuantity(unconstrained.fuelBurn, 'requiredFuel');
  if (usableFuel.unit !== requiredFuel.unit) {
    kernelInvalid('V12 usable fuel unit must equal generation fuel unit');
  }
  const fuelFactor = requiredFuel.amount.isZero()
    ? decimal('1', 'fuelFactor.one')
    : minimum(
        [
          decimal('1', 'fuelFactor.one'),
          usableFuel.amount.dividedBy(requiredFuel.amount),
        ],
        'fuelFactor',
      );
  const generatedAmount = mwh(
    unconstrained.generated,
    'unconstrained.generated',
  ).times(fuelFactor);
  const fuelConsumedAmount = requiredFuel.amount.times(fuelFactor);
  const generated = renderQuantity(generatedAmount, 'MWh');
  const fuelConsumed = renderQuantity(fuelConsumedAmount, usableFuel.unit);
  const usableFuelAfter = renderQuantity(
    usableFuel.amount.minus(fuelConsumedAmount),
    usableFuel.unit,
  );

  const deliveredToGrid = reconcileElectricityBalance({
    generation: generated,
    storageDischarge: grid.storageDischarge,
    imports: grid.imports,
    storageCharge: grid.storageCharge,
    gridLosses: grid.gridLosses,
    exports: grid.exports,
  });
  let remaining = mwh(deliveredToGrid, 'deliveredToGrid');
  const allocations: V13EnergyAllocationResultLine[] = [];
  const allocationTransitions: ExactQuantityTransition[] = [];
  for (const allocation of allocationPlan.allocations) {
    const requested = mwh(
      allocation.requested,
      `${allocation.allocationRef}.requested`,
    );
    const delivered = minimum([requested, remaining], 'allocated energy');
    const shortage = requested.minus(delivered);
    const allocationRef = reference(allocation.allocationRef, 'allocationRef');
    const downstreamDemandRef = reference(
      allocation.downstreamDemandRef,
      'downstreamDemandRef',
    );
    const energyTransition = exactQuantityTransition({
      transitionRef: `${outcomeRef}.${allocationRef}.energy`,
      inputRefs: [
        input.allocationPlan.factRef,
        input.grid.factRef,
        input.generation.factRef,
      ],
      outputRef: `${outcomeRef}.${allocationRef}.remaining_energy`,
      before: renderQuantity(remaining, 'MWh'),
      delta: renderQuantity(delivered.negated(), 'MWh'),
      after: renderQuantity(remaining.minus(delivered), 'MWh'),
    });
    allocations.push(
      Object.freeze({
        allocationRef,
        downstreamDemandRef,
        priority: allocation.priority,
        requested: renderQuantity(requested, 'MWh'),
        delivered: renderQuantity(delivered, 'MWh'),
        shortage: renderQuantity(shortage, 'MWh'),
        availability: ratioFromAvailability({
          available: renderQuantity(delivered, 'MWh'),
          required: renderQuantity(requested, 'MWh'),
          label: `${allocationRef}.availability`,
        }),
        energyTransition,
      }),
    );
    allocationTransitions.push(energyTransition);
    remaining = remaining.minus(delivered);
  }

  const fuelTransition = exactQuantityTransition({
    transitionRef: `${outcomeRef}.usable_fuel`,
    inputRefs: [input.fuelAvailability.factRef, input.generation.factRef],
    outputRef: `${outcomeRef}.usable_fuel_after`,
    before: fuel.usableBefore,
    delta: renderQuantity(fuelConsumedAmount.negated(), usableFuel.unit),
    after: usableFuelAfter,
  });
  const gridTransition = exactQuantityTransition({
    transitionRef: `${outcomeRef}.delivered_grid_energy`,
    inputRefs: [input.generation.factRef, input.grid.factRef],
    outputRef: `${outcomeRef}.delivered_grid_energy_after_balance`,
    before: renderQuantity(decimal('0', 'grid opening'), 'MWh'),
    delta: deliveredToGrid,
    after: deliveredToGrid,
  });
  const resultPayload = {
    outcomeRef,
    v12AvailabilityRef,
    inventoryRef,
    generated,
    fuelConsumed,
    usableFuelAfter,
    deliveredToGrid,
    allocations,
    fuelTransition,
    gridTransition,
  };
  const replayProof = foundationReplayProof({
    module: 'V13_ENERGY_ALLOCATION',
    trace: input.trace,
    inputFacts: [
      input.fuelAvailability,
      input.generation,
      input.grid,
      input.allocationPlan,
    ],
    outputs: [{ outputRef: outcomeRef, payload: resultPayload }],
    transitions: [fuelTransition, gridTransition, ...allocationTransitions],
  });
  return Object.freeze({
    foundationStatus: V13_FOUNDATION_STATUS,
    outcomeRef,
    v12AvailabilityRef,
    inventoryRef,
    generationRef: generation.generationRef,
    gridRef: grid.gridRef,
    generated,
    fuelConsumed,
    usableFuelAfter,
    deliveredToGrid,
    allocations: Object.freeze(allocations),
    fuelTransition,
    gridTransition,
    replayProof,
  });
}

export interface V13ProductionCapacity {
  readonly facilityRef: string;
  readonly operationalCapacity: ExactUnitRate;
  readonly operatingDuration: ExactQuantity;
  readonly targetUtilisation: ExactRatio;
  readonly productivity: ExactUnitRate;
}

export interface V13ProductionMaterialInput {
  readonly materialRef: string;
  readonly v12AvailabilityRef: string;
  readonly inventoryRef: string;
  readonly readOnly: true;
  readonly usableBefore: ExactQuantity;
  readonly requiredAtPotentialOutput: ExactQuantity;
}

export interface V13ProductionEnergyInput {
  readonly allocationRef: string;
  readonly deliveredBefore: ExactQuantity;
  readonly requiredAtPotentialOutput: ExactQuantity;
}

export interface V13ProductionOperationalInput {
  readonly capacityRef: string;
  readonly availableBefore: ExactQuantity;
  readonly requiredAtPotentialOutput: ExactQuantity;
}

export interface V13ProductionInput {
  readonly trace: FoundationTraceRequest;
  readonly outcomeRef: string;
  readonly capacity: FoundationFact<V13ProductionCapacity>;
  readonly materials: readonly FoundationFact<V13ProductionMaterialInput>[];
  readonly energy: FoundationFact<V13ProductionEnergyInput>;
  readonly labour: FoundationFact<V13ProductionOperationalInput>;
  readonly logistics: FoundationFact<V13ProductionOperationalInput>;
}

export interface V13ProposedInputConsumption {
  readonly inputRef: string;
  readonly before: ExactQuantity;
  readonly proposedConsumed: ExactQuantity;
  readonly after: ExactQuantity;
  readonly transition: ExactQuantityTransition;
}

export interface V13ProductionResult {
  readonly foundationStatus: typeof V13_FOUNDATION_STATUS;
  readonly outcomeRef: string;
  readonly facilityRef: string;
  readonly potentialOutput: ExactQuantity;
  /** The only production-output quantity emitted by this calculation. */
  readonly actualOutput: ExactQuantity;
  readonly bottleneckFactor: ExactRatio;
  readonly materialConsumption: readonly V13ProposedInputConsumption[];
  readonly energyConsumption: V13ProposedInputConsumption;
  readonly labourConsumption: V13ProposedInputConsumption;
  readonly logisticsConsumption: V13ProposedInputConsumption;
  readonly outputTransition: ExactQuantityTransition;
  readonly replayProof: V13V14FoundationReplayProof;
}

function proposedConsumption(input: {
  readonly outcomeRef: string;
  readonly inputRef: string;
  readonly sourceFactRef: string;
  readonly availableBefore: ExactQuantity;
  readonly requiredAtPotentialOutput: ExactQuantity;
  readonly scale: WorldDecimalValue;
}): V13ProposedInputConsumption {
  sameUnit(
    input.availableBefore,
    input.requiredAtPotentialOutput,
    `${input.inputRef}.availability`,
  );
  const available = physicalQuantity(
    input.availableBefore,
    `${input.inputRef}.availableBefore`,
  );
  const required = physicalQuantity(
    input.requiredAtPotentialOutput,
    `${input.inputRef}.requiredAtPotentialOutput`,
  );
  const consumed = required.amount.times(input.scale);
  if (consumed.greaterThan(available.amount)) {
    kernelInvalid(
      `${input.inputRef} proposed consumption exceeds available input`,
    );
  }
  const after = available.amount.minus(consumed);
  const transition = exactQuantityTransition({
    transitionRef: `${input.outcomeRef}.${input.inputRef}.consumption`,
    inputRefs: [input.sourceFactRef],
    outputRef: `${input.outcomeRef}.${input.inputRef}.after`,
    before: renderQuantity(available.amount, available.unit),
    delta: renderQuantity(consumed.negated(), available.unit),
    after: renderQuantity(after, available.unit),
  });
  return Object.freeze({
    inputRef: reference(input.inputRef, 'inputRef'),
    before: renderQuantity(available.amount, available.unit),
    proposedConsumed: renderQuantity(consumed, available.unit),
    after: renderQuantity(after, available.unit),
    transition,
  });
}

/**
 * Computes one bottlenecked production result and the exact material, energy,
 * labour, and logistics consumption proposals that must accompany any future
 * output posting. The function never creates a second output or writes stock.
 */
export function calculateV13Production(
  input: V13ProductionInput,
): V13ProductionResult {
  if (input.materials.length === 0) {
    kernelInvalid('V13 production requires explicit material input evidence');
  }
  const capacity = foundationFactPayload(
    input.trace,
    input.capacity,
    'capacity',
  );
  const energy = foundationFactPayload(input.trace, input.energy, 'energy');
  const labour = foundationFactPayload(input.trace, input.labour, 'labour');
  const logistics = foundationFactPayload(
    input.trace,
    input.logistics,
    'logistics',
  );
  const materials = input.materials.map((fact, index) =>
    foundationFactPayload(input.trace, fact, `materials[${index}]`),
  );
  const outcomeRef = reference(input.outcomeRef, 'outcomeRef');
  const facilityRef = reference(capacity.facilityRef, 'capacity.facilityRef');
  reference(capacity.facilityRef, 'capacity.facilityRef');
  reference(energy.allocationRef, 'energy.allocationRef');
  reference(labour.capacityRef, 'labour.capacityRef');
  reference(logistics.capacityRef, 'logistics.capacityRef');

  const materialReferences = new Set<string>();
  for (const material of materials) {
    const materialRef = reference(material.materialRef, 'material.materialRef');
    if (materialReferences.has(materialRef)) {
      kernelInvalid('V13 material inputs must not repeat a material reference');
    }
    materialReferences.add(materialRef);
    reference(material.v12AvailabilityRef, 'material.v12AvailabilityRef');
    reference(material.inventoryRef, 'material.inventoryRef');
    if (material.readOnly !== true) {
      kernelInvalid('V12 material availability must be explicitly read-only');
    }
    sameUnit(
      material.usableBefore,
      material.requiredAtPotentialOutput,
      `${materialRef}.unit`,
    );
  }
  if (mwh(energy.deliveredBefore, 'energy.deliveredBefore').isNegative()) {
    kernelInvalid('energy.deliveredBefore must be non-negative');
  }
  mwh(energy.requiredAtPotentialOutput, 'energy.requiredAtPotentialOutput');
  sameUnit(
    energy.deliveredBefore,
    energy.requiredAtPotentialOutput,
    'energy.unit',
  );
  sameUnit(
    labour.availableBefore,
    labour.requiredAtPotentialOutput,
    'labour.unit',
  );
  sameUnit(
    logistics.availableBefore,
    logistics.requiredAtPotentialOutput,
    'logistics.unit',
  );

  const production = calculateProductionOutcome({
    operationalCapacity: capacity.operationalCapacity,
    operatingDuration: capacity.operatingDuration,
    targetUtilisation: capacity.targetUtilisation,
    productivity: capacity.productivity,
    inputAvailability: materials.map((material) => ({
      available: material.usableBefore,
      required: material.requiredAtPotentialOutput,
    })),
    energyAvailability: ratioFromAvailability({
      available: energy.deliveredBefore,
      required: energy.requiredAtPotentialOutput,
      label: 'energy availability',
    }),
    labourAvailability: ratioFromAvailability({
      available: labour.availableBefore,
      required: labour.requiredAtPotentialOutput,
      label: 'labour availability',
    }),
    logisticsAvailability: ratioFromAvailability({
      available: logistics.availableBefore,
      required: logistics.requiredAtPotentialOutput,
      label: 'logistics availability',
    }),
  });
  const potential = physicalQuantity(
    production.potentialOutput,
    'potentialOutput',
  );
  const actual = physicalQuantity(production.actualOutput, 'actualOutput');
  if (
    potential.unit !== actual.unit ||
    actual.amount.greaterThan(potential.amount)
  ) {
    kernelInvalid(
      'V13 actual output must be bounded by physical potential output',
    );
  }
  const scale = potential.amount.isZero()
    ? decimal('0', 'production scale zero')
    : actual.amount.dividedBy(potential.amount);
  const materialConsumption = materials.map((material, index) => {
    const sourceFact = input.materials[index];
    if (sourceFact === undefined) {
      return kernelInvalid('Material source fact is missing');
    }
    return proposedConsumption({
      outcomeRef,
      inputRef: material.materialRef,
      sourceFactRef: sourceFact.factRef,
      availableBefore: material.usableBefore,
      requiredAtPotentialOutput: material.requiredAtPotentialOutput,
      scale,
    });
  });
  const energyConsumption = proposedConsumption({
    outcomeRef,
    inputRef: energy.allocationRef,
    sourceFactRef: input.energy.factRef,
    availableBefore: energy.deliveredBefore,
    requiredAtPotentialOutput: energy.requiredAtPotentialOutput,
    scale,
  });
  const labourConsumption = proposedConsumption({
    outcomeRef,
    inputRef: labour.capacityRef,
    sourceFactRef: input.labour.factRef,
    availableBefore: labour.availableBefore,
    requiredAtPotentialOutput: labour.requiredAtPotentialOutput,
    scale,
  });
  const logisticsConsumption = proposedConsumption({
    outcomeRef,
    inputRef: logistics.capacityRef,
    sourceFactRef: input.logistics.factRef,
    availableBefore: logistics.availableBefore,
    requiredAtPotentialOutput: logistics.requiredAtPotentialOutput,
    scale,
  });
  const outputTransition = exactQuantityTransition({
    transitionRef: `${outcomeRef}.actual_output`,
    inputRefs: [input.capacity.factRef, input.energy.factRef],
    outputRef: `${outcomeRef}.actual_output_after`,
    before: renderQuantity(decimal('0', 'output opening'), actual.unit),
    delta: renderQuantity(actual.amount, actual.unit),
    after: renderQuantity(actual.amount, actual.unit),
  });
  const resultPayload = {
    outcomeRef,
    facilityRef,
    potentialOutput: production.potentialOutput,
    actualOutput: production.actualOutput,
    bottleneckFactor: production.bottleneckFactor,
    materialConsumption,
    energyConsumption,
    labourConsumption,
    logisticsConsumption,
    outputTransition,
  };
  const replayProof = foundationReplayProof({
    module: 'V13_PRODUCTION',
    trace: input.trace,
    inputFacts: [
      input.capacity,
      ...input.materials,
      input.energy,
      input.labour,
      input.logistics,
    ],
    outputs: [{ outputRef: outcomeRef, payload: resultPayload }],
    transitions: [
      ...materialConsumption.map((value) => value.transition),
      energyConsumption.transition,
      labourConsumption.transition,
      logisticsConsumption.transition,
      outputTransition,
    ],
  });
  return Object.freeze({
    foundationStatus: V13_FOUNDATION_STATUS,
    outcomeRef,
    facilityRef,
    potentialOutput: production.potentialOutput,
    actualOutput: production.actualOutput,
    bottleneckFactor: production.bottleneckFactor,
    materialConsumption: Object.freeze(materialConsumption),
    energyConsumption,
    labourConsumption,
    logisticsConsumption,
    outputTransition,
    replayProof,
  });
}
