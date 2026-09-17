import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  assertResourceConservation,
  reconcileInventory,
  reserveUsableInventory,
  transferStrategicInventory,
  transitionResourceLayer,
  type InventoryBuckets,
  type ResourceLayer,
  type ResourceLayers,
} from '../engine-kernels/resources-energy-production.js';
import {
  type ExactQuantity,
  kernelInvalid,
  physicalQuantity,
  positive,
  renderQuantity,
} from '../engine-kernels/common.js';

/** Exact units fixed by Master U0741–U0746. */
export const GEOLOGICAL_RESOURCE_UNITS = Object.freeze({
  CRUDE_OIL: 'barrel',
  NATURAL_GAS: 'MMBtu equivalent',
  URANIUM: 'tonne U',
  IRON_ORE: 'tonne',
  COPPER: 'tonne',
  LITHIUM: 'tonne LCE',
});

export type GeologicalResourceId = keyof typeof GEOLOGICAL_RESOURCE_UNITS;

/** Exact units fixed by Master U0750–U0761; no conversion is implicit. */
export const COMMODITY_UNITS = Object.freeze({
  CRUDE_OIL: 'barrel',
  NATURAL_GAS: 'MMBtu',
  URANIUM: 'tonne U',
  GRAIN: 'tonne',
  IRON_ORE: 'tonne',
  COPPER: 'tonne',
  LITHIUM: 'tonne LCE',
  STEEL: 'tonne',
  REFINED_FUEL: 'barrel equivalent',
  MACHINERY: 'equipment unit',
  SEMICONDUCTORS: 'standardised chip unit',
  BATTERIES: 'MWh-equivalent',
});

export type E08CommodityId = keyof typeof COMMODITY_UNITS;

export type ResourcePoolAction =
  'EXPLORE' | 'DECLARE_RECOVERABLE' | 'DEVELOP' | 'EXTRACT';

export type InventoryMovementAction =
  | 'EXTRACTION_TO_USABLE'
  | 'RESERVE_FOR_CONTRACT'
  | 'ACCUMULATE_STRATEGIC_RESERVE'
  | 'RELEASE_STRATEGIC_RESERVE'
  | 'RECORD_USABLE_LOSS';

export interface CausalTrace {
  /** Stable caller-supplied audit reference for this pure operation. */
  readonly traceRef: string;
  /** Explicit source fact/reference; opaque to this pure foundation. */
  readonly sourceRef: string;
  /** The exact lineage reference of the state read before this operation. */
  readonly predecessorRef: string;
}

export interface ResourcePoolState {
  readonly resourceId: GeologicalResourceId;
  readonly geologicalEndowment: ExactQuantity;
  readonly pools: ResourceLayers;
  readonly lineageRef: string;
  readonly appliedTransitionRefs: readonly string[];
}

export interface ResourcePoolStateInput {
  readonly resourceId: GeologicalResourceId;
  readonly geologicalEndowment: ExactQuantity;
  readonly pools: ResourceLayers;
  readonly originRef: string;
}

export interface ResourcePoolTransition {
  readonly transitionRef: string;
  readonly action: ResourcePoolAction;
  readonly amount: ExactQuantity;
  readonly causalTrace: CausalTrace;
}

export interface ResourcePoolSnapshot {
  readonly lineageRef: string;
  readonly geologicalEndowment: ExactQuantity;
  readonly pools: ResourceLayers;
}

export interface ResourcePoolTransitionRecord {
  readonly transitionRef: string;
  readonly action: ResourcePoolAction;
  readonly from: ResourceLayer;
  readonly to: ResourceLayer;
  readonly resourceId: GeologicalResourceId;
  readonly amount: ExactQuantity;
  readonly causalTrace: CausalTrace;
  readonly before: ResourcePoolSnapshot;
  readonly after: ResourcePoolSnapshot;
}

export interface ResourcePoolTransitionResult {
  readonly state: ResourcePoolState;
  readonly record: ResourcePoolTransitionRecord;
}

export interface ResourcePoolReplayResult {
  readonly state: ResourcePoolState;
  readonly records: readonly ResourcePoolTransitionRecord[];
}

export interface CommodityInventoryBuckets {
  readonly usable: ExactQuantity;
  readonly strategic: ExactQuantity;
  readonly reservedForContract: ExactQuantity;
  readonly inTransitInbound: ExactQuantity;
  readonly inTransitOutbound: ExactQuantity;
  readonly lossesCumulative: ExactQuantity;
}

export interface CommodityInventoryState {
  readonly commodityId: E08CommodityId;
  readonly buckets: CommodityInventoryBuckets;
  readonly lineageRef: string;
  readonly appliedMovementRefs: readonly string[];
}

export interface CommodityInventoryStateInput {
  readonly commodityId: E08CommodityId;
  readonly buckets: CommodityInventoryBuckets;
  readonly originRef: string;
}

export interface InventoryMovement {
  readonly movementRef: string;
  readonly action:
    | 'RESERVE_FOR_CONTRACT'
    | 'ACCUMULATE_STRATEGIC_RESERVE'
    | 'RELEASE_STRATEGIC_RESERVE'
    | 'RECORD_USABLE_LOSS';
  readonly amount: ExactQuantity;
  readonly causalTrace: CausalTrace;
}

export interface CommodityInventorySnapshot {
  readonly lineageRef: string;
  readonly buckets: CommodityInventoryBuckets;
}

export interface InventoryMovementRecord {
  readonly movementRef: string;
  readonly action: InventoryMovementAction;
  readonly commodityId: E08CommodityId;
  readonly amount: ExactQuantity;
  readonly causalTrace: CausalTrace;
  readonly sourceTransitionRef?: string;
  readonly before: CommodityInventorySnapshot;
  readonly after: CommodityInventorySnapshot;
}

export interface InventoryMovementResult {
  readonly state: CommodityInventoryState;
  readonly record: InventoryMovementRecord;
}

export interface ExtractionToInventoryInput {
  readonly resourceState: ResourcePoolState;
  readonly inventoryState: CommodityInventoryState;
  readonly resourceTransition: ResourcePoolTransition;
  readonly inventoryMovementRef: string;
  readonly inventoryCausalTrace: CausalTrace;
}

export interface ExtractionToInventoryResult {
  readonly resource: ResourcePoolTransitionResult;
  readonly inventory: InventoryMovementResult;
}

export interface E08ProductionReadBoundary {
  readonly owner: 'E08_RESOURCE_AND_INVENTORY_ENGINE';
  readonly access: 'READ_ONLY_USABLE_AVAILABILITY';
  readonly commodityId: E08CommodityId;
  readonly unit: string;
  readonly usableAvailable: ExactQuantity;
  readonly inventoryLineageRef: string;
  readonly forbiddenMutations: readonly string[];
}

export interface CommodityInventoryReconciliationInput {
  readonly commodityId: E08CommodityId;
  readonly opening: ExactQuantity;
  readonly extractionOutput: ExactQuantity;
  readonly deliveredImports: ExactQuantity;
  readonly domesticUse: ExactQuantity;
  readonly deliveredExports: ExactQuantity;
  readonly projectUse: ExactQuantity;
  readonly losses: ExactQuantity;
}

const REF_PATTERN = /^[A-Z][A-Z0-9:_./-]{2,127}$/u;

const RESOURCE_ACTION_ROUTE: Readonly<
  Record<
    ResourcePoolAction,
    Readonly<{ from: ResourceLayer; to: ResourceLayer }>
  >
> = Object.freeze({
  EXPLORE: Object.freeze({ from: 'UNDISCOVERED', to: 'DISCOVERED' }),
  DECLARE_RECOVERABLE: Object.freeze({
    from: 'DISCOVERED',
    to: 'RECOVERABLE',
  }),
  DEVELOP: Object.freeze({ from: 'RECOVERABLE', to: 'DEVELOPED' }),
  EXTRACT: Object.freeze({ from: 'DEVELOPED', to: 'EXTRACTED' }),
});

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function canonicalRef(value: string, label: string): string {
  if (typeof value !== 'string' || !REF_PATTERN.test(value)) {
    kernelInvalid(`${label} must be a canonical reference`);
  }
  return value;
}

function requireResourceId(value: GeologicalResourceId): GeologicalResourceId {
  if (!hasOwn(GEOLOGICAL_RESOURCE_UNITS, value)) {
    kernelInvalid('Resource id must be a registered geological resource');
  }
  return value;
}

function requireCommodityId(value: E08CommodityId): E08CommodityId {
  if (!hasOwn(COMMODITY_UNITS, value)) {
    kernelInvalid('Commodity id must be a registered inventory commodity');
  }
  return value;
}

function unitMismatch(label: string, expectedUnit: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.UNIT_MISMATCH,
    `${label} must use ${expectedUnit}`,
  );
}

function exactQuantity(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): ExactQuantity {
  const parsed = physicalQuantity(value, label);
  if (parsed.unit !== expectedUnit) unitMismatch(label, expectedUnit);
  return renderQuantity(parsed.amount, expectedUnit);
}

function positiveQuantity(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): ExactQuantity {
  const exact = exactQuantity(value, expectedUnit, label);
  positive(exact.amount, label);
  return exact;
}

function frozenTrace(value: CausalTrace): CausalTrace {
  return Object.freeze({
    traceRef: canonicalRef(value.traceRef, 'causal trace reference'),
    sourceRef: canonicalRef(value.sourceRef, 'causal source reference'),
    predecessorRef: canonicalRef(
      value.predecessorRef,
      'causal predecessor reference',
    ),
  });
}

function frozenPools(
  resourceId: GeologicalResourceId,
  pools: ResourceLayers,
): ResourceLayers {
  const unit = GEOLOGICAL_RESOURCE_UNITS[resourceId];
  return Object.freeze({
    undiscovered: exactQuantity(pools.undiscovered, unit, 'undiscovered pool'),
    discovered: exactQuantity(pools.discovered, unit, 'discovered pool'),
    recoverable: exactQuantity(pools.recoverable, unit, 'recoverable pool'),
    developed: exactQuantity(pools.developed, unit, 'developed pool'),
    extractedCumulative: exactQuantity(
      pools.extractedCumulative,
      unit,
      'extracted cumulative pool',
    ),
  });
}

function frozenResourceSnapshot(
  state: ResourcePoolState,
): ResourcePoolSnapshot {
  return Object.freeze({
    lineageRef: state.lineageRef,
    geologicalEndowment: exactQuantity(
      state.geologicalEndowment,
      GEOLOGICAL_RESOURCE_UNITS[state.resourceId],
      'geological endowment',
    ),
    pools: frozenPools(state.resourceId, state.pools),
  });
}

function uniqueReferences(values: readonly string[], label: string): void {
  const refs = values.map((value) => canonicalRef(value, label));
  if (new Set(refs).size !== refs.length) {
    kernelInvalid(`${label} must not contain duplicates`);
  }
}

export function assertResourcePoolState(state: ResourcePoolState): void {
  const resourceId = requireResourceId(state.resourceId);
  const unit = GEOLOGICAL_RESOURCE_UNITS[resourceId];
  const endowment = exactQuantity(
    state.geologicalEndowment,
    unit,
    'geological endowment',
  );
  const pools = frozenPools(resourceId, state.pools);
  assertResourceConservation(endowment, pools);
  canonicalRef(state.lineageRef, 'resource lineage reference');
  if (!Array.isArray(state.appliedTransitionRefs)) {
    kernelInvalid('Applied transition references must be an array');
  }
  uniqueReferences(state.appliedTransitionRefs, 'applied transition reference');
}

export function createResourcePoolState(
  input: ResourcePoolStateInput,
): ResourcePoolState {
  const resourceId = requireResourceId(input.resourceId);
  const unit = GEOLOGICAL_RESOURCE_UNITS[resourceId];
  const state: ResourcePoolState = Object.freeze({
    resourceId,
    geologicalEndowment: exactQuantity(
      input.geologicalEndowment,
      unit,
      'geological endowment',
    ),
    pools: frozenPools(resourceId, input.pools),
    lineageRef: canonicalRef(input.originRef, 'resource origin reference'),
    appliedTransitionRefs: Object.freeze([]),
  });
  assertResourcePoolState(state);
  return state;
}

function nextResourceState(
  state: ResourcePoolState,
  pools: ResourceLayers,
  transitionRef: string,
): ResourcePoolState {
  const next: ResourcePoolState = Object.freeze({
    resourceId: state.resourceId,
    geologicalEndowment: exactQuantity(
      state.geologicalEndowment,
      GEOLOGICAL_RESOURCE_UNITS[state.resourceId],
      'geological endowment',
    ),
    pools: frozenPools(state.resourceId, pools),
    lineageRef: transitionRef,
    appliedTransitionRefs: Object.freeze([
      ...state.appliedTransitionRefs,
      transitionRef,
    ]),
  });
  assertResourcePoolState(next);
  return next;
}

export function applyResourcePoolTransition(
  state: ResourcePoolState,
  transition: ResourcePoolTransition,
): ResourcePoolTransitionResult {
  assertResourcePoolState(state);
  const transitionRef = canonicalRef(
    transition.transitionRef,
    'resource transition reference',
  );
  const causalTrace = frozenTrace(transition.causalTrace);
  if (causalTrace.predecessorRef !== state.lineageRef) {
    kernelInvalid(
      'Resource transition predecessor reference is forged or stale',
    );
  }
  if (state.appliedTransitionRefs.includes(transitionRef)) {
    kernelInvalid('Resource transition reference has already been applied');
  }
  const route = RESOURCE_ACTION_ROUTE[transition.action];
  if (route === undefined)
    kernelInvalid('Resource transition action is invalid');
  const amount = positiveQuantity(
    transition.amount,
    GEOLOGICAL_RESOURCE_UNITS[state.resourceId],
    'resource transition amount',
  );
  const before = frozenResourceSnapshot(state);
  const pools = transitionResourceLayer({
    initialEndowment: state.geologicalEndowment,
    layers: state.pools,
    from: route.from,
    to: route.to,
    amount,
  });
  const next = nextResourceState(state, pools, transitionRef);
  const after = frozenResourceSnapshot(next);
  return Object.freeze({
    state: next,
    record: Object.freeze({
      transitionRef,
      action: transition.action,
      from: route.from,
      to: route.to,
      resourceId: state.resourceId,
      amount,
      causalTrace,
      before,
      after,
    }),
  });
}

export function replayResourcePoolTransitions(input: {
  readonly initialState: ResourcePoolState;
  readonly transitions: readonly ResourcePoolTransition[];
}): ResourcePoolReplayResult {
  let state = input.initialState;
  const records: ResourcePoolTransitionRecord[] = [];
  for (const transition of input.transitions) {
    const result = applyResourcePoolTransition(state, transition);
    state = result.state;
    records.push(result.record);
  }
  return Object.freeze({ state, records: Object.freeze(records) });
}

function frozenInventoryBuckets(
  commodityId: E08CommodityId,
  buckets: CommodityInventoryBuckets,
): CommodityInventoryBuckets {
  const unit = COMMODITY_UNITS[commodityId];
  return Object.freeze({
    usable: exactQuantity(buckets.usable, unit, 'usable inventory'),
    strategic: exactQuantity(buckets.strategic, unit, 'strategic inventory'),
    reservedForContract: exactQuantity(
      buckets.reservedForContract,
      unit,
      'reserved inventory',
    ),
    inTransitInbound: exactQuantity(
      buckets.inTransitInbound,
      unit,
      'inbound in-transit inventory',
    ),
    inTransitOutbound: exactQuantity(
      buckets.inTransitOutbound,
      unit,
      'outbound in-transit inventory',
    ),
    lossesCumulative: exactQuantity(
      buckets.lossesCumulative,
      unit,
      'cumulative inventory losses',
    ),
  });
}

function inventoryBucketsForFoundationHelper(
  commodityId: E08CommodityId,
  buckets: CommodityInventoryBuckets,
): InventoryBuckets {
  const unit = COMMODITY_UNITS[commodityId];
  const inbound = physicalQuantity(buckets.inTransitInbound, 'inbound transit');
  const outbound = physicalQuantity(
    buckets.inTransitOutbound,
    'outbound transit',
  );
  return Object.freeze({
    usable: exactQuantity(buckets.usable, unit, 'usable inventory'),
    strategic: exactQuantity(buckets.strategic, unit, 'strategic inventory'),
    reservedForContract: exactQuantity(
      buckets.reservedForContract,
      unit,
      'reserved inventory',
    ),
    inTransit: renderQuantity(inbound.amount.plus(outbound.amount), unit),
  });
}

export function assertCommodityInventoryState(
  state: CommodityInventoryState,
): void {
  const commodityId = requireCommodityId(state.commodityId);
  frozenInventoryBuckets(commodityId, state.buckets);
  canonicalRef(state.lineageRef, 'inventory lineage reference');
  if (!Array.isArray(state.appliedMovementRefs)) {
    kernelInvalid('Applied inventory movement references must be an array');
  }
  uniqueReferences(
    state.appliedMovementRefs,
    'applied inventory movement reference',
  );
}

export function createCommodityInventoryState(
  input: CommodityInventoryStateInput,
): CommodityInventoryState {
  const commodityId = requireCommodityId(input.commodityId);
  const state: CommodityInventoryState = Object.freeze({
    commodityId,
    buckets: frozenInventoryBuckets(commodityId, input.buckets),
    lineageRef: canonicalRef(input.originRef, 'inventory origin reference'),
    appliedMovementRefs: Object.freeze([]),
  });
  assertCommodityInventoryState(state);
  return state;
}

function frozenInventorySnapshot(
  state: CommodityInventoryState,
): CommodityInventorySnapshot {
  return Object.freeze({
    lineageRef: state.lineageRef,
    buckets: frozenInventoryBuckets(state.commodityId, state.buckets),
  });
}

function nextInventoryState(
  state: CommodityInventoryState,
  buckets: CommodityInventoryBuckets,
  movementRef: string,
): CommodityInventoryState {
  const next: CommodityInventoryState = Object.freeze({
    commodityId: state.commodityId,
    buckets: frozenInventoryBuckets(state.commodityId, buckets),
    lineageRef: movementRef,
    appliedMovementRefs: Object.freeze([
      ...state.appliedMovementRefs,
      movementRef,
    ]),
  });
  assertCommodityInventoryState(next);
  return next;
}

function nextInventoryRecord(input: {
  readonly state: CommodityInventoryState;
  readonly next: CommodityInventoryState;
  readonly movementRef: string;
  readonly action: InventoryMovementAction;
  readonly amount: ExactQuantity;
  readonly causalTrace: CausalTrace;
  readonly sourceTransitionRef?: string;
}): InventoryMovementRecord {
  return Object.freeze({
    movementRef: input.movementRef,
    action: input.action,
    commodityId: input.state.commodityId,
    amount: input.amount,
    causalTrace: input.causalTrace,
    ...(input.sourceTransitionRef === undefined
      ? {}
      : { sourceTransitionRef: input.sourceTransitionRef }),
    before: frozenInventorySnapshot(input.state),
    after: frozenInventorySnapshot(input.next),
  });
}

export function applyInventoryMovement(
  state: CommodityInventoryState,
  movement: InventoryMovement,
): InventoryMovementResult {
  assertCommodityInventoryState(state);
  const movementRef = canonicalRef(
    movement.movementRef,
    'inventory movement reference',
  );
  const causalTrace = frozenTrace(movement.causalTrace);
  if (causalTrace.predecessorRef !== state.lineageRef) {
    kernelInvalid(
      'Inventory movement predecessor reference is forged or stale',
    );
  }
  if (state.appliedMovementRefs.includes(movementRef)) {
    kernelInvalid('Inventory movement reference has already been applied');
  }
  const amount = positiveQuantity(
    movement.amount,
    COMMODITY_UNITS[state.commodityId],
    'inventory movement amount',
  );
  const buckets = state.buckets;
  let nextBuckets: CommodityInventoryBuckets;
  let action: InventoryMovementAction;

  switch (movement.action) {
    case 'RESERVE_FOR_CONTRACT': {
      const next = reserveUsableInventory({
        buckets: inventoryBucketsForFoundationHelper(
          state.commodityId,
          buckets,
        ),
        amount,
      });
      nextBuckets = Object.freeze({
        ...buckets,
        usable: next.usable,
        reservedForContract: next.reservedForContract,
      });
      action = 'RESERVE_FOR_CONTRACT';
      break;
    }
    case 'ACCUMULATE_STRATEGIC_RESERVE':
    case 'RELEASE_STRATEGIC_RESERVE': {
      const next = transferStrategicInventory({
        buckets: inventoryBucketsForFoundationHelper(
          state.commodityId,
          buckets,
        ),
        direction:
          movement.action === 'ACCUMULATE_STRATEGIC_RESERVE'
            ? 'ACCUMULATE'
            : 'RELEASE',
        amount,
      });
      nextBuckets = Object.freeze({
        ...buckets,
        usable: next.usable,
        strategic: next.strategic,
      });
      action = movement.action;
      break;
    }
    case 'RECORD_USABLE_LOSS': {
      const usable = physicalQuantity(
        buckets.usable,
        'usable inventory',
      ).amount;
      const losses = physicalQuantity(
        buckets.lossesCumulative,
        'cumulative inventory losses',
      ).amount;
      const loss = physicalQuantity(amount, 'inventory loss').amount;
      if (usable.lessThan(loss))
        kernelInvalid('Inventory loss exceeds usable stock');
      nextBuckets = Object.freeze({
        ...buckets,
        usable: renderQuantity(usable.minus(loss), amount.unit),
        lossesCumulative: renderQuantity(losses.plus(loss), amount.unit),
      });
      action = 'RECORD_USABLE_LOSS';
      break;
    }
    default:
      kernelInvalid('Inventory movement action is invalid');
  }

  const next = nextInventoryState(state, nextBuckets, movementRef);
  return Object.freeze({
    state: next,
    record: nextInventoryRecord({
      state,
      next,
      movementRef,
      action,
      amount,
      causalTrace,
    }),
  });
}

export function extractToCommodityInventory(
  input: ExtractionToInventoryInput,
): ExtractionToInventoryResult {
  assertCommodityInventoryState(input.inventoryState);
  if (input.resourceTransition.action !== 'EXTRACT') {
    kernelInvalid(
      'Inventory extraction requires an EXTRACT resource transition',
    );
  }
  const resource = applyResourcePoolTransition(
    input.resourceState,
    input.resourceTransition,
  );
  if (input.inventoryState.commodityId !== resource.state.resourceId) {
    kernelInvalid('Extraction inventory commodity must match the resource id');
  }
  const resourceUnit = GEOLOGICAL_RESOURCE_UNITS[resource.state.resourceId];
  const commodityUnit = COMMODITY_UNITS[input.inventoryState.commodityId];
  if (resourceUnit !== commodityUnit) {
    unitMismatch('Extraction output and inventory commodity', commodityUnit);
  }
  const movementRef = canonicalRef(
    input.inventoryMovementRef,
    'extraction inventory movement reference',
  );
  const causalTrace = frozenTrace(input.inventoryCausalTrace);
  if (causalTrace.predecessorRef !== input.inventoryState.lineageRef) {
    kernelInvalid(
      'Extraction inventory predecessor reference is forged or stale',
    );
  }
  if (causalTrace.sourceRef !== resource.record.transitionRef) {
    kernelInvalid('Extraction inventory source reference is forged');
  }
  if (input.inventoryState.appliedMovementRefs.includes(movementRef)) {
    kernelInvalid('Inventory movement reference has already been applied');
  }
  const usable = physicalQuantity(
    input.inventoryState.buckets.usable,
    'usable inventory',
  ).amount;
  const extracted = physicalQuantity(
    resource.record.amount,
    'extracted amount',
  ).amount;
  const next = nextInventoryState(
    input.inventoryState,
    Object.freeze({
      ...input.inventoryState.buckets,
      usable: renderQuantity(usable.plus(extracted), commodityUnit),
    }),
    movementRef,
  );
  const inventory: InventoryMovementResult = Object.freeze({
    state: next,
    record: nextInventoryRecord({
      state: input.inventoryState,
      next,
      movementRef,
      action: 'EXTRACTION_TO_USABLE',
      amount: resource.record.amount,
      causalTrace,
      sourceTransitionRef: resource.record.transitionRef,
    }),
  });
  return Object.freeze({ resource, inventory });
}

export function createE08ProductionReadBoundary(
  state: CommodityInventoryState,
): E08ProductionReadBoundary {
  assertCommodityInventoryState(state);
  return Object.freeze({
    owner: 'E08_RESOURCE_AND_INVENTORY_ENGINE',
    access: 'READ_ONLY_USABLE_AVAILABILITY',
    commodityId: state.commodityId,
    unit: COMMODITY_UNITS[state.commodityId],
    usableAvailable: exactQuantity(
      state.buckets.usable,
      COMMODITY_UNITS[state.commodityId],
      'usable inventory',
    ),
    inventoryLineageRef: state.lineageRef,
    forbiddenMutations: Object.freeze([
      'E10_CANNOT_EXTRACT',
      'E10_CANNOT_MOVE_RESERVES',
      'E10_CANNOT_MUTATE_INVENTORY',
    ]),
  });
}

export function reconcileCommodityInventory(
  input: CommodityInventoryReconciliationInput,
): ExactQuantity {
  const commodityId = requireCommodityId(input.commodityId);
  const unit = COMMODITY_UNITS[commodityId];
  const opening = exactQuantity(input.opening, unit, 'opening inventory');
  const extractionOutput = exactQuantity(
    input.extractionOutput,
    unit,
    'extraction output',
  );
  const deliveredImports = exactQuantity(
    input.deliveredImports,
    unit,
    'delivered imports',
  );
  const domesticUse = exactQuantity(input.domesticUse, unit, 'domestic use');
  const deliveredExports = exactQuantity(
    input.deliveredExports,
    unit,
    'delivered exports',
  );
  const projectUse = exactQuantity(input.projectUse, unit, 'project use');
  const losses = exactQuantity(input.losses, unit, 'inventory losses');
  const combinedUse = renderQuantity(
    physicalQuantity(domesticUse, 'domestic use').amount.plus(
      physicalQuantity(projectUse, 'project use').amount,
    ),
    unit,
  );
  return reconcileInventory({
    opening,
    production: extractionOutput,
    deliveredImports,
    domesticUse: combinedUse,
    deliveredExports,
    losses,
  });
}
