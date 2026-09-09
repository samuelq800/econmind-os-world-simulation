import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCHEDULER_PRIORITY_ID,
  DOMAIN_ERROR_CODES,
  ENGINE_ENTRIES,
  ENGINE_STAGE_MAPPING_ENTRIES,
  ENGINE_STAGE_MAPPING_VERSION,
  LEGACY_SIMULATION_SCHEDULER_VERSION,
  SCHEDULER_ORDER_VERSION,
  SCHEDULER_PRIORITY_ENTRIES,
  SETTLEMENT_STAGE_ENTRIES,
  SETTLEMENT_STAGE_REGISTRY_VERSION,
  SIMULATION_SCHEDULER_VERSION,
  SIMULATION_TICKS_PER_DAY,
  SIMULATION_TICKS_PER_YEAR,
  SimTime,
  advanceClockInput,
  advanceRunningSimulationScheduler,
  beginAuthoritativeTransactionCutoff,
  canonicalSerialize,
  completeDueSimulationEvent,
  createEngineStageMapping,
  createSimulationScheduler,
  engineId,
  isAuthoritativeTransactionCutoff,
  orderEngineStageMappings,
  pauseSimulationSeason,
  pendingDueSimulationEventsInOrder,
  restoreSimulationSchedulerState,
  resumeSimulationSeason,
  scheduleEventInput,
  scheduleSimulationEvent,
  scheduledEventId,
  schedulerPriorityId,
  serializeSimulationSchedulerState,
  settlementStageId,
  simulationBoundaryCrossings,
  startSimulationSeason,
} from '../../packages/core/src/index.js';

const expectedStageNames = [
  'Execute Scheduled Events',
  'Update Stocks',
  'Resource Production',
  'Energy Production/Allocation',
  'Industrial Production',
  'Labour Market',
  'Household Income & Consumption',
  'Public Services',
  'Domestic Market / Prices',
  'Global Market & Trade',
  'FX & Financial Markets',
  'Fiscal Settlement',
  'National Accounts',
  'Risk & Crisis Detection',
  'Score & Notifications',
] as const;

const expectedStageIds = [
  'EXECUTE_SCHEDULED_EVENTS',
  'UPDATE_STOCKS',
  'RESOURCE_PRODUCTION',
  'ENERGY_PRODUCTION_ALLOCATION',
  'INDUSTRIAL_PRODUCTION',
  'LABOUR_MARKET',
  'HOUSEHOLD_INCOME_CONSUMPTION',
  'PUBLIC_SERVICES',
  'DOMESTIC_MARKET_PRICES',
  'GLOBAL_MARKET_TRADE',
  'FX_FINANCIAL_MARKETS',
  'FISCAL_SETTLEMENT',
  'NATIONAL_ACCOUNTS',
  'RISK_CRISIS_DETECTION',
  'SCORE_NOTIFICATIONS',
] as const;

function scheduled(
  id: string,
  dueTicks: string,
  priority: 'ORDER_PRIORITY_000' | 'ORDER_PRIORITY_100' | 'ORDER_PRIORITY_200',
) {
  return scheduleEventInput(
    scheduledEventId(id),
    'ORDER_TEST',
    SimTime.fromTicks(dueTicks),
    `KEY_${id}`,
    schedulerPriorityId(priority),
  );
}

describe('V06.3 versioned settlement and priority registries', () => {
  it('freezes the exact Constitution 15-stage orchestration order', () => {
    expect(SETTLEMENT_STAGE_ENTRIES).toHaveLength(15);
    expect(SETTLEMENT_STAGE_ENTRIES.map((entry) => entry.phase)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    expect(SETTLEMENT_STAGE_ENTRIES.map((entry) => entry.name)).toEqual(
      expectedStageNames,
    );
    expect(SETTLEMENT_STAGE_ENTRIES.map((entry) => entry.id)).toEqual(
      expectedStageIds,
    );
    expect(SETTLEMENT_STAGE_ENTRIES.map((entry) => entry.sourceId)).toEqual(
      Array.from(
        { length: 15 },
        (_, index) => `CONSTITUTION-U${String(190 + index).padStart(4, '0')}`,
      ),
    );
    expect(
      SETTLEMENT_STAGE_ENTRIES.every(
        (entry) => entry.registryVersion === SETTLEMENT_STAGE_REGISTRY_VERSION,
      ),
    ).toBe(true);
  });

  it('keeps E01-E18 distinct and maps only the implemented V06 operation', () => {
    expect(ENGINE_ENTRIES.map((entry) => entry.id)).toEqual(
      Array.from(
        { length: 18 },
        (_, index) => `E${String(index + 1).padStart(2, '0')}`,
      ),
    );
    expect(ENGINE_STAGE_MAPPING_ENTRIES).toEqual([
      expect.objectContaining({
        engineId: 'E01',
        implementationClaim: false,
        mappingVersion: ENGINE_STAGE_MAPPING_VERSION,
        operationId: 'DRAIN_DUE_SCHEDULED_EVENTS',
        stageId: 'EXECUTE_SCHEDULED_EVENTS',
        status: 'REGISTERED_NOT_IMPLEMENTED',
      }),
    ]);
  });

  it('rejects unknown registry IDs and duplicate mapping identities', () => {
    expect(() =>
      createEngineStageMapping(
        'UNKNOWN_ENGINE_MAPPING',
        engineId('E19'),
        'UNKNOWN_OPERATION',
        settlementStageId('EXECUTE_SCHEDULED_EVENTS'),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      }),
    );
    expect(() =>
      createEngineStageMapping(
        'UNKNOWN_STAGE_MAPPING',
        engineId('E01'),
        'UNKNOWN_OPERATION',
        settlementStageId('UNKNOWN_STAGE'),
      ),
    ).toThrowError();
    const mapping = ENGINE_STAGE_MAPPING_ENTRIES[0];
    expect(mapping).toBeDefined();
    expect(() => orderEngineStageMappings([mapping!, mapping!])).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      }),
    );
  });

  it('uses a closed versioned priority registry with no ad-hoc ranks', () => {
    expect(
      SCHEDULER_PRIORITY_ENTRIES.map(({ id, rank }) => [id, rank]),
    ).toEqual([
      ['ORDER_PRIORITY_000', 0],
      ['ORDER_PRIORITY_100', 100],
      ['ORDER_PRIORITY_200', 200],
    ]);
    expect(() =>
      scheduled('EVENT_UNKNOWN', '0', 'ORDER_PRIORITY_050' as never),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.REGISTRY_ENTRY_NOT_FOUND,
      }),
    );
  });
});

describe('V06.3 deterministic work ordering and cutoffs', () => {
  it('orders due work by dueSimTime, priorityRank, then code-unit event ID', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    for (const input of [
      scheduled('EVENT_Z', '20', 'ORDER_PRIORITY_100'),
      scheduled('EVENT_B', '20', 'ORDER_PRIORITY_000'),
      scheduled('EVENT_A', '20', 'ORDER_PRIORITY_000'),
      scheduled('EVENT_EARLY', '10', 'ORDER_PRIORITY_200'),
      scheduled('EVENT_LATE', '30', 'ORDER_PRIORITY_000'),
    ]) {
      state = scheduleSimulationEvent(state, input);
    }
    state = advanceRunningSimulationScheduler(
      state,
      advanceClockInput('2'),
    ).state;

    expect(
      pendingDueSimulationEventsInOrder(state).map(
        (event) => event.scheduledEventId,
      ),
    ).toEqual(['EVENT_EARLY', 'EVENT_A', 'EVENT_B', 'EVENT_Z']);
  });

  it('fails closed when completion skips the authoritative due-work head', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(
      state,
      scheduled('EVENT_FIRST', '0', 'ORDER_PRIORITY_000'),
    );
    state = scheduleSimulationEvent(
      state,
      scheduled('EVENT_LAST', '0', 'ORDER_PRIORITY_200'),
    );

    expect(
      pendingDueSimulationEventsInOrder(state).map(
        (event) => event.scheduledEventId,
      ),
    ).toEqual(['EVENT_FIRST', 'EVENT_LAST']);
    expect(() =>
      completeDueSimulationEvent(state, scheduledEventId('EVENT_LAST')),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULED_EVENT_ORDER_VIOLATION,
      }),
    );
    expect(
      state.scheduledEvents.every((event) => event.status === 'PENDING'),
    ).toBe(true);

    const first = completeDueSimulationEvent(
      state,
      scheduledEventId('EVENT_FIRST'),
    );
    expect(first.applied).toBe(true);
    expect(
      completeDueSimulationEvent(first.state, scheduledEventId('EVENT_LAST'))
        .applied,
    ).toBe(true);
  });

  it('does not expose due work while paused and preserves it after resume', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(
      state,
      scheduled('EVENT_PAUSED', '0', 'ORDER_PRIORITY_100'),
    );
    const paused = pauseSimulationSeason(state);
    expect(pendingDueSimulationEventsInOrder(paused)).toEqual([]);
    expect(
      pendingDueSimulationEventsInOrder(resumeSimulationSeason(paused)),
    ).toHaveLength(1);
  });

  it('locks cutoff at authoritative transaction start SimTime', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = advanceRunningSimulationScheduler(
      state,
      advanceClockInput('7'),
    ).state;
    const cutoff = beginAuthoritativeTransactionCutoff(state);
    const later = advanceRunningSimulationScheduler(
      state,
      advanceClockInput('9'),
    ).state;

    expect(isAuthoritativeTransactionCutoff(cutoff)).toBe(true);
    expect(cutoff.lockedSimTime.toCanonicalValue()).toBe('70');
    expect(later.clock.simTime.toCanonicalValue()).toBe('160');
    expect(cutoff.lockedSimTime.toCanonicalValue()).toBe('70');
    expect(() =>
      beginAuthoritativeTransactionCutoff(pauseSimulationSeason(state)),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );
  });

  it('migrates canonical V1 snapshots to V2 with the default priority', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(
      state,
      scheduled('EVENT_LEGACY', '0', 'ORDER_PRIORITY_100'),
    );
    const legacy = JSON.parse(serializeSimulationSchedulerState(state));
    legacy.schedulerVersion = LEGACY_SIMULATION_SCHEDULER_VERSION;
    delete legacy.orderVersion;
    delete legacy.scheduledEvents[0].priorityId;

    const restored = restoreSimulationSchedulerState(
      canonicalSerialize(legacy),
    );
    expect(restored.schedulerVersion).toBe(SIMULATION_SCHEDULER_VERSION);
    expect(restored.orderVersion).toBe(SCHEDULER_ORDER_VERSION);
    expect(restored.scheduledEvents[0]?.priorityId).toBe(
      DEFAULT_SCHEDULER_PRIORITY_ID,
    );
  });

  it('preserves order and exactly-once completion across restart', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    for (const input of [
      scheduled('EVENT_B', '0', 'ORDER_PRIORITY_100'),
      scheduled('EVENT_A', '0', 'ORDER_PRIORITY_100'),
    ]) {
      state = scheduleSimulationEvent(state, input);
    }
    state = restoreSimulationSchedulerState(
      serializeSimulationSchedulerState(state),
    );
    expect(
      pendingDueSimulationEventsInOrder(state).map(
        (event) => event.scheduledEventId,
      ),
    ).toEqual(['EVENT_A', 'EVENT_B']);
    const completed = completeDueSimulationEvent(
      state,
      scheduledEventId('EVENT_A'),
    );
    const restored = restoreSimulationSchedulerState(
      serializeSimulationSchedulerState(completed.state),
    );
    expect(
      completeDueSimulationEvent(restored, scheduledEventId('EVENT_A')).applied,
    ).toBe(false);
  });

  it('uses exact day and year tick boundaries', () => {
    const aroundDay = simulationBoundaryCrossings(
      SimTime.fromTicks((BigInt(SIMULATION_TICKS_PER_DAY) - 1n).toString()),
      SimTime.fromTicks(SIMULATION_TICKS_PER_DAY),
    );
    const aroundYear = simulationBoundaryCrossings(
      SimTime.fromTicks((BigInt(SIMULATION_TICKS_PER_YEAR) - 1n).toString()),
      SimTime.fromTicks(SIMULATION_TICKS_PER_YEAR),
    );
    expect(aroundDay.days).toEqual({
      count: '1',
      firstIndex: '1',
      lastIndex: '1',
    });
    expect(aroundYear.years).toEqual({
      count: '1',
      firstIndex: '1',
      lastIndex: '1',
    });
  });
});
