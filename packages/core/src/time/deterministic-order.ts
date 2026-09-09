import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  engineId,
  scheduledEventId,
  schedulerPriorityId,
  settlementStageId,
  type EngineId,
  type ScheduledEventId,
  type SchedulerPriorityId,
  type SettlementStageId,
} from '../ids.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import {
  ENGINE_REGISTRY,
  REGISTRY_IMPLEMENTATION_STATUS,
} from '../registries/fixed-catalog.js';
import { CanonicalRegistry } from '../registries/registry.js';

export const SCHEDULER_ORDER_VERSION = 'SCHEDULER_ORDER_V1' as const;
export const SCHEDULER_PRIORITY_REGISTRY_VERSION =
  'SCHEDULER_PRIORITY_REGISTRY_V1' as const;
export const SETTLEMENT_STAGE_REGISTRY_VERSION =
  'SETTLEMENT_STAGE_REGISTRY_V1' as const;
export const ENGINE_STAGE_MAPPING_VERSION = 'ENGINE_STAGE_MAPPING_V1' as const;

export const DEFAULT_SCHEDULER_PRIORITY_ID: SchedulerPriorityId =
  schedulerPriorityId('ORDER_PRIORITY_100');

export interface SchedulerPriorityEntry {
  readonly id: SchedulerPriorityId;
  readonly rank: number;
  readonly registryVersion: typeof SCHEDULER_PRIORITY_REGISTRY_VERSION;
}

export const SCHEDULER_PRIORITY_ENTRIES = Object.freeze([
  Object.freeze({
    id: schedulerPriorityId('ORDER_PRIORITY_000'),
    rank: 0,
    registryVersion: SCHEDULER_PRIORITY_REGISTRY_VERSION,
  }),
  Object.freeze({
    id: DEFAULT_SCHEDULER_PRIORITY_ID,
    rank: 100,
    registryVersion: SCHEDULER_PRIORITY_REGISTRY_VERSION,
  }),
  Object.freeze({
    id: schedulerPriorityId('ORDER_PRIORITY_200'),
    rank: 200,
    registryVersion: SCHEDULER_PRIORITY_REGISTRY_VERSION,
  }),
]) as readonly SchedulerPriorityEntry[];

export const SCHEDULER_PRIORITY_REGISTRY = new CanonicalRegistry(
  'Scheduler Priority Registry V1',
  SCHEDULER_PRIORITY_ENTRIES,
);

export interface SettlementStageEntry {
  readonly id: SettlementStageId;
  readonly name: string;
  readonly phase: number;
  readonly registryVersion: typeof SETTLEMENT_STAGE_REGISTRY_VERSION;
  readonly sourceId: string;
}

const settlementStage = (
  phase: number,
  id: string,
  name: string,
  sourceId: string,
): SettlementStageEntry =>
  Object.freeze({
    id: settlementStageId(id),
    name,
    phase,
    registryVersion: SETTLEMENT_STAGE_REGISTRY_VERSION,
    sourceId,
  });

export const SETTLEMENT_STAGE_ENTRIES = Object.freeze([
  settlementStage(
    1,
    'EXECUTE_SCHEDULED_EVENTS',
    'Execute Scheduled Events',
    'CONSTITUTION-U0190',
  ),
  settlementStage(2, 'UPDATE_STOCKS', 'Update Stocks', 'CONSTITUTION-U0191'),
  settlementStage(
    3,
    'RESOURCE_PRODUCTION',
    'Resource Production',
    'CONSTITUTION-U0192',
  ),
  settlementStage(
    4,
    'ENERGY_PRODUCTION_ALLOCATION',
    'Energy Production/Allocation',
    'CONSTITUTION-U0193',
  ),
  settlementStage(
    5,
    'INDUSTRIAL_PRODUCTION',
    'Industrial Production',
    'CONSTITUTION-U0194',
  ),
  settlementStage(6, 'LABOUR_MARKET', 'Labour Market', 'CONSTITUTION-U0195'),
  settlementStage(
    7,
    'HOUSEHOLD_INCOME_CONSUMPTION',
    'Household Income & Consumption',
    'CONSTITUTION-U0196',
  ),
  settlementStage(
    8,
    'PUBLIC_SERVICES',
    'Public Services',
    'CONSTITUTION-U0197',
  ),
  settlementStage(
    9,
    'DOMESTIC_MARKET_PRICES',
    'Domestic Market / Prices',
    'CONSTITUTION-U0198',
  ),
  settlementStage(
    10,
    'GLOBAL_MARKET_TRADE',
    'Global Market & Trade',
    'CONSTITUTION-U0199',
  ),
  settlementStage(
    11,
    'FX_FINANCIAL_MARKETS',
    'FX & Financial Markets',
    'CONSTITUTION-U0200',
  ),
  settlementStage(
    12,
    'FISCAL_SETTLEMENT',
    'Fiscal Settlement',
    'CONSTITUTION-U0201',
  ),
  settlementStage(
    13,
    'NATIONAL_ACCOUNTS',
    'National Accounts',
    'CONSTITUTION-U0202',
  ),
  settlementStage(
    14,
    'RISK_CRISIS_DETECTION',
    'Risk & Crisis Detection',
    'CONSTITUTION-U0203',
  ),
  settlementStage(
    15,
    'SCORE_NOTIFICATIONS',
    'Score & Notifications',
    'CONSTITUTION-U0204',
  ),
]) as readonly SettlementStageEntry[];

export const SETTLEMENT_STAGE_REGISTRY = new CanonicalRegistry(
  'Settlement Stage Registry V1',
  SETTLEMENT_STAGE_ENTRIES,
);

export interface ScheduledWorkOrderKey {
  readonly dueSimTime: SimTime;
  readonly priorityId: SchedulerPriorityId;
  readonly scheduledEventId: ScheduledEventId;
}

export interface EngineStageMapping {
  readonly engineId: EngineId;
  readonly id: string;
  readonly implementationClaim: false;
  readonly mappingVersion: typeof ENGINE_STAGE_MAPPING_VERSION;
  readonly operationId: string;
  readonly stageId: SettlementStageId;
  readonly status: typeof REGISTRY_IMPLEMENTATION_STATUS;
}

const CANONICAL_TOKEN = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;

function orderingError(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.ORDERING_INPUT_INVALID, message);
}

export function compareCanonicalIdentifiers(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function registeredSchedulerPriorityId(
  value: string,
): SchedulerPriorityId {
  const id = schedulerPriorityId(value);
  SCHEDULER_PRIORITY_REGISTRY.get(id);
  return id;
}

export function registeredSettlementStageId(value: string): SettlementStageId {
  const id = settlementStageId(value);
  SETTLEMENT_STAGE_REGISTRY.get(id);
  return id;
}

export function schedulerPriorityRank(id: SchedulerPriorityId): number {
  return SCHEDULER_PRIORITY_REGISTRY.get(registeredSchedulerPriorityId(id))
    .rank;
}

export function compareScheduledWorkOrder(
  left: ScheduledWorkOrderKey,
  right: ScheduledWorkOrderKey,
): number {
  if (!isSimTime(left.dueSimTime) || !isSimTime(right.dueSimTime)) {
    orderingError('Scheduled work order requires canonical SimTime');
  }
  if (left.dueSimTime.ticks < right.dueSimTime.ticks) return -1;
  if (left.dueSimTime.ticks > right.dueSimTime.ticks) return 1;
  const priorityOrder =
    schedulerPriorityRank(left.priorityId) -
    schedulerPriorityRank(right.priorityId);
  if (priorityOrder !== 0) return priorityOrder;
  return compareCanonicalIdentifiers(
    scheduledEventId(left.scheduledEventId),
    scheduledEventId(right.scheduledEventId),
  );
}

export function orderScheduledWork<Work extends ScheduledWorkOrderKey>(
  work: readonly Work[],
): readonly Work[] {
  return Object.freeze([...work].sort(compareScheduledWorkOrder));
}

export function createEngineStageMapping(
  mappingId: string,
  engine: EngineId,
  operationId: string,
  stage: SettlementStageId,
): EngineStageMapping {
  if (!CANONICAL_TOKEN.test(mappingId) || !CANONICAL_TOKEN.test(operationId)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      'Mapping and operation IDs must be canonical uppercase tokens',
    );
  }
  const canonicalEngine = engineId(engine);
  if (!ENGINE_REGISTRY.has(canonicalEngine)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      `Engine registry has no entry ${canonicalEngine}`,
    );
  }
  return Object.freeze({
    engineId: canonicalEngine,
    id: mappingId,
    implementationClaim: false,
    mappingVersion: ENGINE_STAGE_MAPPING_VERSION,
    operationId,
    stageId: registeredSettlementStageId(stage),
    status: REGISTRY_IMPLEMENTATION_STATUS,
  });
}

export const ENGINE_STAGE_MAPPING_ENTRIES = Object.freeze([
  createEngineStageMapping(
    'E01_DRAIN_DUE_SCHEDULED_EVENTS',
    engineId('E01'),
    'DRAIN_DUE_SCHEDULED_EVENTS',
    settlementStageId('EXECUTE_SCHEDULED_EVENTS'),
  ),
]) as readonly EngineStageMapping[];

export const ENGINE_STAGE_MAPPING_REGISTRY = new CanonicalRegistry(
  'Engine to Settlement Stage Mapping V1',
  ENGINE_STAGE_MAPPING_ENTRIES,
);

export function orderEngineStageMappings(
  mappings: readonly EngineStageMapping[],
): readonly EngineStageMapping[] {
  const seenIdentities = new Set<string>();
  const seenMappingIds = new Set<string>();
  const canonicalMappings = mappings.map((mapping) =>
    createEngineStageMapping(
      mapping.id,
      mapping.engineId,
      mapping.operationId,
      mapping.stageId,
    ),
  );
  for (const canonical of canonicalMappings) {
    const identity = `${canonical.engineId}:${canonical.operationId}`;
    if (seenIdentities.has(identity) || seenMappingIds.has(canonical.id)) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
        `Duplicate Engine operation or mapping ID ${identity}`,
      );
    }
    seenIdentities.add(identity);
    seenMappingIds.add(canonical.id);
  }
  return Object.freeze(
    [...canonicalMappings].sort((left, right) => {
      const stageOrder =
        SETTLEMENT_STAGE_REGISTRY.get(left.stageId).phase -
        SETTLEMENT_STAGE_REGISTRY.get(right.stageId).phase;
      if (stageOrder !== 0) return stageOrder;
      const engineOrder = compareCanonicalIdentifiers(
        left.engineId,
        right.engineId,
      );
      return engineOrder !== 0
        ? engineOrder
        : compareCanonicalIdentifiers(left.operationId, right.operationId);
    }),
  );
}
