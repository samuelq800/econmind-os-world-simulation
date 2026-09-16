import {
  decimal,
  kernelInvalid,
  minimum,
  money,
  nonNegative,
  physicalQuantity,
  ratio,
  render,
  renderMoney,
  renderQuantity,
  sameUnit,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitRate,
  type WorldDecimalValue,
} from './common.js';

export type ResourceLayer =
  'UNDISCOVERED' | 'DISCOVERED' | 'RECOVERABLE' | 'DEVELOPED' | 'EXTRACTED';

export interface ResourceLayers {
  readonly undiscovered: ExactQuantity;
  readonly discovered: ExactQuantity;
  readonly recoverable: ExactQuantity;
  readonly developed: ExactQuantity;
  readonly extractedCumulative: ExactQuantity;
}

const LAYER_KEY: Readonly<Record<ResourceLayer, keyof ResourceLayers>> =
  Object.freeze({
    UNDISCOVERED: 'undiscovered',
    DISCOVERED: 'discovered',
    RECOVERABLE: 'recoverable',
    DEVELOPED: 'developed',
    EXTRACTED: 'extractedCumulative',
  });

const FORWARD_LAYER: Readonly<Record<ResourceLayer, ResourceLayer | null>> =
  Object.freeze({
    UNDISCOVERED: 'DISCOVERED',
    DISCOVERED: 'RECOVERABLE',
    RECOVERABLE: 'DEVELOPED',
    DEVELOPED: 'EXTRACTED',
    EXTRACTED: null,
  });

function resourceValues(input: ResourceLayers): {
  readonly values: Record<keyof ResourceLayers, WorldDecimalValue>;
  readonly unit: string;
} {
  const undiscovered = physicalQuantity(input.undiscovered, 'undiscovered');
  const discovered = physicalQuantity(input.discovered, 'discovered');
  const recoverable = physicalQuantity(input.recoverable, 'recoverable');
  const developed = physicalQuantity(input.developed, 'developed');
  const extracted = physicalQuantity(
    input.extractedCumulative,
    'extractedCumulative',
  );
  for (const value of [discovered, recoverable, developed, extracted]) {
    if (value.unit !== undiscovered.unit) {
      kernelInvalid('All resource layers must use one physical unit');
    }
  }
  return Object.freeze({
    values: {
      undiscovered: undiscovered.amount,
      discovered: discovered.amount,
      recoverable: recoverable.amount,
      developed: developed.amount,
      extractedCumulative: extracted.amount,
    },
    unit: undiscovered.unit,
  });
}

/** E08's five mutually exclusive pools must sum to the fixed geological endowment. */
export function assertResourceConservation(
  initialEndowment: ExactQuantity,
  layers: ResourceLayers,
): void {
  const initial = physicalQuantity(initialEndowment, 'initialEndowment');
  const resource = resourceValues(layers);
  if (initial.unit !== resource.unit) {
    kernelInvalid('Initial endowment and resource layers must use one unit');
  }
  const total = Object.values(resource.values).reduce((sum, value) =>
    sum.plus(value),
  );
  if (!total.equals(initial.amount))
    kernelInvalid('Resource layers must equal the fixed initial endowment');
}

export function transitionResourceLayer(input: {
  readonly initialEndowment: ExactQuantity;
  readonly layers: ResourceLayers;
  readonly from: ResourceLayer;
  readonly to: ResourceLayer;
  readonly amount: ExactQuantity;
}): ResourceLayers {
  assertResourceConservation(input.initialEndowment, input.layers);
  if (FORWARD_LAYER[input.from] !== input.to) {
    kernelInvalid(
      'Resource layers may only advance one documented lifecycle step',
    );
  }
  const resource = resourceValues(input.layers);
  const amount = physicalQuantity(input.amount, 'resource transition amount');
  if (amount.unit !== resource.unit) {
    kernelInvalid('Resource transition amount must use the resource unit');
  }
  const values = resource.values;
  const fromKey = LAYER_KEY[input.from];
  const toKey = LAYER_KEY[input.to];
  if (values[fromKey].lessThan(amount.amount))
    kernelInvalid('Resource transition exceeds source layer');
  return Object.freeze({
    undiscovered: renderQuantity(
      values.undiscovered
        .minus(fromKey === 'undiscovered' ? amount.amount : 0)
        .plus(toKey === 'undiscovered' ? amount.amount : 0),
      resource.unit,
    ),
    discovered: renderQuantity(
      values.discovered
        .minus(fromKey === 'discovered' ? amount.amount : 0)
        .plus(toKey === 'discovered' ? amount.amount : 0),
      resource.unit,
    ),
    recoverable: renderQuantity(
      values.recoverable
        .minus(fromKey === 'recoverable' ? amount.amount : 0)
        .plus(toKey === 'recoverable' ? amount.amount : 0),
      resource.unit,
    ),
    developed: renderQuantity(
      values.developed
        .minus(fromKey === 'developed' ? amount.amount : 0)
        .plus(toKey === 'developed' ? amount.amount : 0),
      resource.unit,
    ),
    extractedCumulative: renderQuantity(
      values.extractedCumulative
        .minus(fromKey === 'extractedCumulative' ? amount.amount : 0)
        .plus(toKey === 'extractedCumulative' ? amount.amount : 0),
      resource.unit,
    ),
  });
}

export interface InventoryReconciliationInput {
  readonly opening: ExactQuantity;
  readonly production: ExactQuantity;
  readonly deliveredImports: ExactQuantity;
  readonly domesticUse: ExactQuantity;
  readonly deliveredExports: ExactQuantity;
  readonly losses: ExactQuantity;
}

/** Reconciles only physical flow; reservations and trade identity remain the authoritative transaction layer. */
export function reconcileInventory(
  input: InventoryReconciliationInput,
): ExactQuantity {
  const quantities = [
    input.opening,
    input.production,
    input.deliveredImports,
    input.domesticUse,
    input.deliveredExports,
    input.losses,
  ];
  for (const value of quantities) physicalQuantity(value, 'inventory flow');
  for (const value of quantities.slice(1))
    sameUnit(input.opening, value, 'inventory reconciliation');
  const opening = physicalQuantity(input.opening, 'opening inventory').amount;
  const production = physicalQuantity(input.production, 'production').amount;
  const imports = physicalQuantity(
    input.deliveredImports,
    'deliveredImports',
  ).amount;
  const use = physicalQuantity(input.domesticUse, 'domesticUse').amount;
  const exports = physicalQuantity(
    input.deliveredExports,
    'deliveredExports',
  ).amount;
  const losses = physicalQuantity(input.losses, 'losses').amount;
  const closing = opening
    .plus(production)
    .plus(imports)
    .minus(use)
    .minus(exports)
    .minus(losses);
  if (closing.isNegative())
    kernelInvalid(
      'Inventory reconciliation would create negative physical stock',
    );
  return renderQuantity(closing, input.opening.unit);
}

export interface InventoryBuckets {
  readonly usable: ExactQuantity;
  readonly strategic: ExactQuantity;
  readonly reservedForContract: ExactQuantity;
  readonly inTransit: ExactQuantity;
}

export function reserveUsableInventory(input: {
  readonly buckets: InventoryBuckets;
  readonly amount: ExactQuantity;
}): InventoryBuckets {
  physicalQuantity(input.amount, 'reserved amount');
  for (const bucket of Object.values(input.buckets)) {
    physicalQuantity(bucket, 'inventory bucket');
    sameUnit(input.amount, bucket, 'inventory reservation');
  }
  const requested = physicalQuantity(input.amount, 'reserved amount').amount;
  const usable = physicalQuantity(
    input.buckets.usable,
    'usable inventory',
  ).amount;
  if (usable.lessThan(requested))
    kernelInvalid('Inventory reservation exceeds usable stock');
  const reserved = physicalQuantity(
    input.buckets.reservedForContract,
    'reserved inventory',
  ).amount;
  return Object.freeze({
    usable: renderQuantity(usable.minus(requested), input.amount.unit),
    strategic: input.buckets.strategic,
    reservedForContract: renderQuantity(
      reserved.plus(requested),
      input.amount.unit,
    ),
    inTransit: input.buckets.inTransit,
  });
}

export function transferStrategicInventory(input: {
  readonly buckets: InventoryBuckets;
  readonly direction: 'ACCUMULATE' | 'RELEASE';
  readonly amount: ExactQuantity;
}): InventoryBuckets {
  physicalQuantity(input.amount, 'strategic transfer amount');
  for (const bucket of Object.values(input.buckets)) {
    physicalQuantity(bucket, 'inventory bucket');
    sameUnit(input.amount, bucket, 'strategic inventory');
  }
  const amount = physicalQuantity(
    input.amount,
    'strategic transfer amount',
  ).amount;
  const usable = physicalQuantity(
    input.buckets.usable,
    'usable inventory',
  ).amount;
  const strategic = physicalQuantity(
    input.buckets.strategic,
    'strategic inventory',
  ).amount;
  const from = input.direction === 'ACCUMULATE' ? usable : strategic;
  if (from.lessThan(amount))
    kernelInvalid('Strategic transfer exceeds source bucket');
  const nextUsable =
    input.direction === 'ACCUMULATE'
      ? usable.minus(amount)
      : usable.plus(amount);
  const nextStrategic =
    input.direction === 'ACCUMULATE'
      ? strategic.plus(amount)
      : strategic.minus(amount);
  return Object.freeze({
    usable: renderQuantity(nextUsable, input.amount.unit),
    strategic: renderQuantity(nextStrategic, input.amount.unit),
    reservedForContract: input.buckets.reservedForContract,
    inTransit: input.buckets.inTransit,
  });
}

export interface EnergyGenerationInput {
  readonly availableCapacity: ExactQuantity;
  readonly capacityFactor: ExactRatio;
  readonly hours: ExactQuantity;
  /** Physical fuel per generated MWh; input and output units are explicit. */
  readonly fuelEnergyPerMWh: ExactUnitRate;
  readonly technologyEfficiency: ExactRatio;
}

/** Computes MWh only from MW × time and never treats either as an untyped number. */
export function calculateEnergyGeneration(input: EnergyGenerationInput) {
  if (input.availableCapacity.unit !== 'MW')
    kernelInvalid('Available generation capacity must use MW');
  const capacity = nonNegative(
    input.availableCapacity.amount,
    'availableCapacity',
  );
  const duration = physicalQuantity(input.hours, 'hours');
  if (duration.unit !== 'hour' || duration.amount.isZero()) {
    kernelInvalid('Generation hours must use positive hour');
  }
  const generated = capacity
    .times(ratio(input.capacityFactor, 'capacityFactor'))
    .times(duration.amount);
  if (input.fuelEnergyPerMWh.inputUnit !== 'MWh') {
    kernelInvalid('fuelEnergyPerMWh inputUnit must use MWh');
  }
  const fuelUnit = physicalQuantity(
    { amount: '0', unit: input.fuelEnergyPerMWh.outputUnit },
    'fuelEnergyPerMWh outputUnit',
  ).unit;
  const fuelPerMWh = nonNegative(
    input.fuelEnergyPerMWh.amount,
    'fuelEnergyPerMWh amount',
  );
  const efficiency = ratio(input.technologyEfficiency, 'technologyEfficiency');
  if (efficiency.isZero())
    kernelInvalid('technologyEfficiency must be positive');
  return Object.freeze({
    generated: renderQuantity(generated, 'MWh'),
    fuelBurn: renderQuantity(
      generated.times(fuelPerMWh).dividedBy(efficiency),
      fuelUnit,
    ),
  });
}

export interface ElectricityBalanceInput {
  readonly generation: ExactQuantity;
  readonly storageDischarge: ExactQuantity;
  readonly imports: ExactQuantity;
  readonly storageCharge: ExactQuantity;
  readonly gridLosses: ExactQuantity;
  readonly exports: ExactQuantity;
}

export function reconcileElectricityBalance(
  input: ElectricityBalanceInput,
): ExactQuantity {
  const values = [
    input.generation,
    input.storageDischarge,
    input.imports,
    input.storageCharge,
    input.gridLosses,
    input.exports,
  ];
  for (const value of values)
    if (value.unit !== 'MWh') kernelInvalid('Electricity balance requires MWh');
  const result = nonNegative(input.generation.amount, 'generation')
    .plus(nonNegative(input.storageDischarge.amount, 'storageDischarge'))
    .plus(nonNegative(input.imports.amount, 'imports'))
    .minus(nonNegative(input.storageCharge.amount, 'storageCharge'))
    .minus(nonNegative(input.gridLosses.amount, 'gridLosses'))
    .minus(nonNegative(input.exports.amount, 'exports'));
  if (result.isNegative())
    kernelInvalid('Electricity balance would become negative');
  return Object.freeze({ amount: render(result), unit: 'MWh' });
}

export function calculateEnergyAvailability(
  delivered: ExactQuantity,
  required: ExactQuantity,
): ExactRatio | null {
  if (delivered.unit !== 'MWh' || required.unit !== 'MWh')
    kernelInvalid('Energy availability requires MWh');
  const supplied = nonNegative(delivered.amount, 'delivered MWh');
  const needed = nonNegative(required.amount, 'required MWh');
  return needed.isZero()
    ? null
    : Object.freeze({
        amount: render(
          minimum(
            [decimal('1', 'one'), supplied.dividedBy(needed)],
            'energy availability',
          ),
        ),
        unit: 'ratio',
      });
}

export function calculateReserveMargin(
  availableGenerationCapacity: ExactQuantity,
  peakDemand: ExactQuantity,
): ExactQuantity | null {
  if (availableGenerationCapacity.unit !== 'MW' || peakDemand.unit !== 'MW') {
    kernelInvalid('Reserve margin requires MW');
  }
  const available = nonNegative(
    availableGenerationCapacity.amount,
    'availableGenerationCapacity',
  );
  const demand = nonNegative(peakDemand.amount, 'peakDemand');
  return demand.isZero()
    ? null
    : Object.freeze({
        amount: render(available.minus(demand).dividedBy(demand)),
        unit: 'MW_per_MW',
      });
}

export interface StorageTransitionInput {
  readonly stateOfCharge: ExactQuantity;
  readonly energyCapacity: ExactQuantity;
  readonly requestedChargeFromGrid: ExactQuantity;
  readonly requestedDischargeToGrid: ExactQuantity;
  readonly chargeEfficiency: ExactRatio;
  readonly dischargeEfficiency: ExactRatio;
}

/** Storage is energy-conserving: charge and discharge cannot be requested in the same pure transition. */
export function transitionEnergyStorage(input: StorageTransitionInput) {
  const values = [
    input.stateOfCharge,
    input.energyCapacity,
    input.requestedChargeFromGrid,
    input.requestedDischargeToGrid,
  ];
  for (const value of values)
    if (value.unit !== 'MWh') kernelInvalid('Storage transition requires MWh');
  const stored = nonNegative(input.stateOfCharge.amount, 'stateOfCharge');
  const capacity = nonNegative(input.energyCapacity.amount, 'energyCapacity');
  const chargeRequested = nonNegative(
    input.requestedChargeFromGrid.amount,
    'requestedChargeFromGrid',
  );
  const dischargeRequested = nonNegative(
    input.requestedDischargeToGrid.amount,
    'requestedDischargeToGrid',
  );
  if (stored.greaterThan(capacity))
    kernelInvalid('State of charge cannot exceed storage capacity');
  if (!chargeRequested.isZero() && !dischargeRequested.isZero())
    kernelInvalid('Storage cannot charge and discharge in one transition');
  const chargeEfficiency = ratio(input.chargeEfficiency, 'chargeEfficiency');
  const dischargeEfficiency = ratio(
    input.dischargeEfficiency,
    'dischargeEfficiency',
  );
  if (chargeEfficiency.isZero() || dischargeEfficiency.isZero())
    kernelInvalid('Storage efficiency must be positive');
  const actualChargeFromGrid = minimum(
    [chargeRequested, capacity.minus(stored).dividedBy(chargeEfficiency)],
    'storage charge',
  );
  const deliveredDischarge = minimum(
    [dischargeRequested, stored.times(dischargeEfficiency)],
    'storage discharge',
  );
  const next = stored
    .plus(actualChargeFromGrid.times(chargeEfficiency))
    .minus(deliveredDischarge.dividedBy(dischargeEfficiency));
  return Object.freeze({
    nextStateOfCharge: renderQuantity(next, 'MWh'),
    actualChargeFromGrid: renderQuantity(actualChargeFromGrid, 'MWh'),
    deliveredDischarge: renderQuantity(deliveredDischarge, 'MWh'),
  });
}

export interface ProductionInputAvailability {
  readonly available: ExactQuantity;
  readonly required: ExactQuantity;
}

export interface ProductionOutcomeInput {
  /** Physical output per one explicit operating-duration unit. */
  readonly operationalCapacity: ExactUnitRate;
  readonly operatingDuration: ExactQuantity;
  readonly targetUtilisation: ExactRatio;
  /** Output per unit of the capacity's output, preserving the output dimension. */
  readonly productivity: ExactUnitRate;
  readonly inputAvailability: readonly ProductionInputAvailability[];
  readonly energyAvailability: ExactRatio;
  readonly labourAvailability: ExactRatio;
  readonly logisticsAvailability: ExactRatio;
}

export function calculateProductionOutcome(input: ProductionOutcomeInput) {
  const duration = physicalQuantity(
    input.operatingDuration,
    'operatingDuration',
  );
  if (input.operationalCapacity.inputUnit !== duration.unit) {
    kernelInvalid('operationalCapacity inputUnit must match operatingDuration');
  }
  const outputUnit = physicalQuantity(
    { amount: '0', unit: input.operationalCapacity.outputUnit },
    'operationalCapacity outputUnit',
  ).unit;
  const capacity = nonNegative(
    input.operationalCapacity.amount,
    'operationalCapacity',
  );
  if (
    input.productivity.inputUnit !== outputUnit ||
    input.productivity.outputUnit !== outputUnit
  ) {
    kernelInvalid('productivity must preserve the production output unit');
  }
  const productivity = nonNegative(input.productivity.amount, 'productivity');
  const potential = capacity
    .times(duration.amount)
    .times(ratio(input.targetUtilisation, 'targetUtilisation'))
    .times(productivity);
  const materialRatios = input.inputAvailability.map((entry) => {
    physicalQuantity(entry.available, 'available input');
    physicalQuantity(entry.required, 'required input');
    sameUnit(entry.available, entry.required, 'production input');
    const available = physicalQuantity(
      entry.available,
      'available input',
    ).amount;
    const required = physicalQuantity(entry.required, 'required input').amount;
    return required.isZero()
      ? null
      : minimum(
          [decimal('1', 'one'), available.dividedBy(required)],
          'production input availability',
        );
  });
  const material =
    materialRatios.length === 0
      ? decimal('1', 'one')
      : minimum(
          materialRatios.map((value) => value ?? decimal('1', 'one')),
          'input availability',
        );
  const bottleneck = minimum(
    [
      material,
      ratio(input.energyAvailability, 'energyAvailability'),
      ratio(input.labourAvailability, 'labourAvailability'),
      ratio(input.logisticsAvailability, 'logisticsAvailability'),
    ],
    'production bottleneck',
  );
  const actual = potential.times(bottleneck);
  return Object.freeze({
    potentialOutput: renderQuantity(potential, outputUnit),
    actualOutput: renderQuantity(actual, outputUnit),
    bottleneckFactor: Object.freeze({
      amount: render(bottleneck),
      unit: 'ratio',
    }),
    capacityUtilisation: potential.isZero()
      ? null
      : Object.freeze({
          amount: render(actual.dividedBy(potential)),
          unit: 'ratio',
        }),
  });
}

export interface ProductionInputCoefficient {
  /** Physical input amount per one physical unit of output. */
  readonly inputPerOutput: ExactUnitRate;
}

/** Computes the inputs that a later atomic posting must consume before output can be posted. */
export function calculateProductionInputConsumption(
  actualOutput: ExactQuantity,
  coefficients: readonly ProductionInputCoefficient[],
): readonly ExactQuantity[] {
  const output = physicalQuantity(actualOutput, 'actualOutput');
  return Object.freeze(
    coefficients.map((coefficient) => {
      if (coefficient.inputPerOutput.inputUnit !== output.unit) {
        kernelInvalid(
          'Production coefficient inputUnit must match actual output',
        );
      }
      const inputUnit = physicalQuantity(
        { amount: '0', unit: coefficient.inputPerOutput.outputUnit },
        'Production coefficient outputUnit',
      );
      const perUnit = nonNegative(
        coefficient.inputPerOutput.amount,
        'amountPerUnitOutput',
      );
      return renderQuantity(output.amount.times(perUnit), inputUnit.unit);
    }),
  );
}

export function calculateValueAdded(
  grossOutputValue: ExactMoney,
  intermediateInputValue: ExactMoney,
): ExactMoney {
  const gross = money(grossOutputValue, 'grossOutputValue');
  const intermediate = money(intermediateInputValue, 'intermediateInputValue');
  if (gross.currency !== intermediate.currency)
    kernelInvalid('Value-added currencies must match');
  if (gross.amount.isNegative() || intermediate.amount.isNegative()) {
    kernelInvalid('Value-added monetary inputs must be non-negative');
  }
  return renderMoney(gross.amount.minus(intermediate.amount), gross.currency);
}
