import {
  boundedRatioOrNull,
  decimal,
  factor,
  kernelInvalid,
  minimum,
  nonNegative,
  positive,
  quantity,
  ratioOrNull,
  render,
  sameUnit,
  type ExactDecimal,
  type ExactMoney,
  type ExactQuantity,
  type WorldDecimalValue,
} from './common.js';

export type ResourceLayer =
  'UNDISCOVERED' | 'DISCOVERED' | 'RECOVERABLE' | 'DEVELOPED' | 'EXTRACTED';

export interface ResourceLayers {
  readonly undiscovered: ExactDecimal;
  readonly discovered: ExactDecimal;
  readonly recoverable: ExactDecimal;
  readonly developed: ExactDecimal;
  readonly extractedCumulative: ExactDecimal;
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

function resourceValues(
  input: ResourceLayers,
): Record<keyof ResourceLayers, WorldDecimalValue> {
  return {
    undiscovered: nonNegative(input.undiscovered, 'undiscovered'),
    discovered: nonNegative(input.discovered, 'discovered'),
    recoverable: nonNegative(input.recoverable, 'recoverable'),
    developed: nonNegative(input.developed, 'developed'),
    extractedCumulative: nonNegative(
      input.extractedCumulative,
      'extractedCumulative',
    ),
  };
}

/** E08's five mutually exclusive pools must sum to the fixed geological endowment. */
export function assertResourceConservation(
  initialEndowment: ExactDecimal,
  layers: ResourceLayers,
): void {
  const initial = nonNegative(initialEndowment, 'initialEndowment');
  const values = resourceValues(layers);
  const total = Object.values(values).reduce((sum, value) => sum.plus(value));
  if (!total.equals(initial))
    kernelInvalid('Resource layers must equal the fixed initial endowment');
}

export function transitionResourceLayer(input: {
  readonly initialEndowment: ExactDecimal;
  readonly layers: ResourceLayers;
  readonly from: ResourceLayer;
  readonly to: ResourceLayer;
  readonly amount: ExactDecimal;
}): ResourceLayers {
  assertResourceConservation(input.initialEndowment, input.layers);
  if (FORWARD_LAYER[input.from] !== input.to) {
    kernelInvalid(
      'Resource layers may only advance one documented lifecycle step',
    );
  }
  const amount = nonNegative(input.amount, 'resource transition amount');
  const values = resourceValues(input.layers);
  const fromKey = LAYER_KEY[input.from];
  const toKey = LAYER_KEY[input.to];
  if (values[fromKey].lessThan(amount))
    kernelInvalid('Resource transition exceeds source layer');
  return Object.freeze({
    undiscovered: render(
      values.undiscovered
        .minus(fromKey === 'undiscovered' ? amount : 0)
        .plus(toKey === 'undiscovered' ? amount : 0),
    ),
    discovered: render(
      values.discovered
        .minus(fromKey === 'discovered' ? amount : 0)
        .plus(toKey === 'discovered' ? amount : 0),
    ),
    recoverable: render(
      values.recoverable
        .minus(fromKey === 'recoverable' ? amount : 0)
        .plus(toKey === 'recoverable' ? amount : 0),
    ),
    developed: render(
      values.developed
        .minus(fromKey === 'developed' ? amount : 0)
        .plus(toKey === 'developed' ? amount : 0),
    ),
    extractedCumulative: render(
      values.extractedCumulative
        .minus(fromKey === 'extractedCumulative' ? amount : 0)
        .plus(toKey === 'extractedCumulative' ? amount : 0),
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
  for (const value of quantities.slice(1))
    sameUnit(input.opening, value, 'inventory reconciliation');
  const opening = nonNegative(input.opening.amount, 'opening inventory');
  const production = nonNegative(input.production.amount, 'production');
  const imports = nonNegative(
    input.deliveredImports.amount,
    'deliveredImports',
  );
  const use = nonNegative(input.domesticUse.amount, 'domesticUse');
  const exports = nonNegative(
    input.deliveredExports.amount,
    'deliveredExports',
  );
  const losses = nonNegative(input.losses.amount, 'losses');
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
  return Object.freeze({ amount: render(closing), unit: input.opening.unit });
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
  for (const bucket of Object.values(input.buckets))
    sameUnit(input.amount, bucket, 'inventory reservation');
  const requested = nonNegative(input.amount.amount, 'reserved amount');
  const usable = nonNegative(input.buckets.usable.amount, 'usable inventory');
  if (usable.lessThan(requested))
    kernelInvalid('Inventory reservation exceeds usable stock');
  const reserved = nonNegative(
    input.buckets.reservedForContract.amount,
    'reserved inventory',
  );
  return Object.freeze({
    usable: Object.freeze({
      amount: render(usable.minus(requested)),
      unit: input.amount.unit,
    }),
    strategic: input.buckets.strategic,
    reservedForContract: Object.freeze({
      amount: render(reserved.plus(requested)),
      unit: input.amount.unit,
    }),
    inTransit: input.buckets.inTransit,
  });
}

export function transferStrategicInventory(input: {
  readonly buckets: InventoryBuckets;
  readonly direction: 'ACCUMULATE' | 'RELEASE';
  readonly amount: ExactQuantity;
}): InventoryBuckets {
  for (const bucket of Object.values(input.buckets))
    sameUnit(input.amount, bucket, 'strategic inventory');
  const amount = nonNegative(input.amount.amount, 'strategic transfer amount');
  const usable = nonNegative(input.buckets.usable.amount, 'usable inventory');
  const strategic = nonNegative(
    input.buckets.strategic.amount,
    'strategic inventory',
  );
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
    usable: Object.freeze({
      amount: render(nextUsable),
      unit: input.amount.unit,
    }),
    strategic: Object.freeze({
      amount: render(nextStrategic),
      unit: input.amount.unit,
    }),
    reservedForContract: input.buckets.reservedForContract,
    inTransit: input.buckets.inTransit,
  });
}

export interface EnergyGenerationInput {
  readonly availableCapacity: ExactQuantity;
  readonly capacityFactor: ExactDecimal;
  readonly hours: ExactDecimal;
  readonly fuelEnergyPerMWh: ExactQuantity;
  readonly technologyEfficiency: ExactDecimal;
}

/** Computes MWh only from MW × time and never treats either as an untyped number. */
export function calculateEnergyGeneration(input: EnergyGenerationInput) {
  if (input.availableCapacity.unit !== 'MW')
    kernelInvalid('Available generation capacity must use MW');
  if (input.hours === '0') kernelInvalid('Generation hours must be positive');
  const capacity = nonNegative(
    input.availableCapacity.amount,
    'availableCapacity',
  );
  const hours = positive(input.hours, 'hours');
  const generated = capacity
    .times(factor(input.capacityFactor, 'capacityFactor'))
    .times(hours);
  const fuel = quantity(input.fuelEnergyPerMWh, 'fuelEnergyPerMWh');
  const efficiency = positive(
    input.technologyEfficiency,
    'technologyEfficiency',
  );
  return Object.freeze({
    generated: Object.freeze({ amount: render(generated), unit: 'MWh' }),
    fuelBurn: Object.freeze({
      amount: render(generated.times(fuel.amount).dividedBy(efficiency)),
      unit: fuel.unit,
    }),
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
): ExactDecimal | null {
  if (delivered.unit !== 'MWh' || required.unit !== 'MWh')
    kernelInvalid('Energy availability requires MWh');
  return boundedRatioOrNull(
    nonNegative(delivered.amount, 'delivered MWh'),
    nonNegative(required.amount, 'required MWh'),
  );
}

export function calculateReserveMargin(
  availableGenerationCapacity: ExactQuantity,
  peakDemand: ExactQuantity,
): ExactDecimal | null {
  if (availableGenerationCapacity.unit !== 'MW' || peakDemand.unit !== 'MW') {
    kernelInvalid('Reserve margin requires MW');
  }
  const available = nonNegative(
    availableGenerationCapacity.amount,
    'availableGenerationCapacity',
  );
  const demand = nonNegative(peakDemand.amount, 'peakDemand');
  return ratioOrNull(available.minus(demand), demand);
}

export interface StorageTransitionInput {
  readonly stateOfCharge: ExactQuantity;
  readonly energyCapacity: ExactQuantity;
  readonly requestedChargeFromGrid: ExactQuantity;
  readonly requestedDischargeToGrid: ExactQuantity;
  readonly chargeEfficiency: ExactDecimal;
  readonly dischargeEfficiency: ExactDecimal;
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
  const chargeEfficiency = factor(input.chargeEfficiency, 'chargeEfficiency');
  const dischargeEfficiency = factor(
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
    nextStateOfCharge: Object.freeze({ amount: render(next), unit: 'MWh' }),
    actualChargeFromGrid: Object.freeze({
      amount: render(actualChargeFromGrid),
      unit: 'MWh',
    }),
    deliveredDischarge: Object.freeze({
      amount: render(deliveredDischarge),
      unit: 'MWh',
    }),
  });
}

export interface ProductionInputAvailability {
  readonly available: ExactQuantity;
  readonly required: ExactQuantity;
}

export interface ProductionOutcomeInput {
  readonly operationalCapacity: ExactQuantity;
  readonly targetUtilisation: ExactDecimal;
  readonly productivity: ExactDecimal;
  readonly inputAvailability: readonly ProductionInputAvailability[];
  readonly energyAvailability: ExactDecimal;
  readonly labourAvailability: ExactDecimal;
  readonly logisticsAvailability: ExactDecimal;
}

export function calculateProductionOutcome(input: ProductionOutcomeInput) {
  const capacity = nonNegative(
    input.operationalCapacity.amount,
    'operationalCapacity',
  );
  const potential = capacity
    .times(factor(input.targetUtilisation, 'targetUtilisation'))
    .times(nonNegative(input.productivity, 'productivity'));
  const materialRatios = input.inputAvailability.map((entry) => {
    sameUnit(entry.available, entry.required, 'production input');
    return boundedRatioOrNull(
      nonNegative(entry.available.amount, 'available input'),
      nonNegative(entry.required.amount, 'required input'),
    );
  });
  const material =
    materialRatios.length === 0
      ? decimal('1', 'one')
      : minimum(
          materialRatios.map((value) =>
            decimal(value ?? '1', 'input availability'),
          ),
          'input availability',
        );
  const bottleneck = minimum(
    [
      material,
      factor(input.energyAvailability, 'energyAvailability'),
      factor(input.labourAvailability, 'labourAvailability'),
      factor(input.logisticsAvailability, 'logisticsAvailability'),
    ],
    'production bottleneck',
  );
  const actual = potential.times(bottleneck);
  return Object.freeze({
    potentialOutput: Object.freeze({
      amount: render(potential),
      unit: input.operationalCapacity.unit,
    }),
    actualOutput: Object.freeze({
      amount: render(actual),
      unit: input.operationalCapacity.unit,
    }),
    bottleneckFactor: render(bottleneck),
    capacityUtilisation: ratioOrNull(actual, capacity),
  });
}

export interface ProductionInputCoefficient {
  readonly inputUnit: string;
  readonly amountPerUnitOutput: ExactDecimal;
}

/** Computes the inputs that a later atomic posting must consume before output can be posted. */
export function calculateProductionInputConsumption(
  actualOutput: ExactQuantity,
  coefficients: readonly ProductionInputCoefficient[],
): readonly ExactQuantity[] {
  const output = quantity(actualOutput, 'actualOutput');
  if (output.amount.isNegative())
    kernelInvalid('Actual output must be non-negative');
  return Object.freeze(
    coefficients.map((coefficient) => {
      const perUnit = nonNegative(
        coefficient.amountPerUnitOutput,
        'amountPerUnitOutput',
      );
      if (!/^[A-Za-z][A-Za-z0-9 _/-]{0,63}$/u.test(coefficient.inputUnit)) {
        kernelInvalid('Production input unit must be canonical');
      }
      return Object.freeze({
        amount: render(output.amount.times(perUnit)),
        unit: coefficient.inputUnit,
      });
    }),
  );
}

export function calculateValueAdded(
  grossOutputValue: ExactMoney,
  intermediateInputValue: ExactMoney,
): ExactMoney {
  const gross = decimal(grossOutputValue.amount, 'grossOutputValue');
  const intermediate = decimal(
    intermediateInputValue.amount,
    'intermediateInputValue',
  );
  if (grossOutputValue.currency !== intermediateInputValue.currency)
    kernelInvalid('Value-added currencies must match');
  return Object.freeze({
    amount: render(gross.minus(intermediate)),
    currency: grossOutputValue.currency,
  });
}
