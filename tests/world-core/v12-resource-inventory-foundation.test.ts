import { describe, expect, it } from 'vitest';

import {
  applyInventoryMovement,
  applyResourcePoolTransition,
  createCommodityInventoryState,
  createE08ProductionReadBoundary,
  createResourcePoolState,
  extractToCommodityInventory,
  reconcileCommodityInventory,
  replayResourcePoolTransitions,
  type CommodityInventoryState,
  type ResourcePoolState,
  type ResourcePoolTransition,
} from '../../packages/core/src/index.js';

const BARRELS = (amount: string) => ({ amount, unit: 'barrel' }) as const;
const TONNES = (amount: string) => ({ amount, unit: 'tonne' }) as const;
const GAS_EQUIVALENT = (amount: string) =>
  ({ amount, unit: 'MMBtu equivalent' }) as const;
const GAS = (amount: string) => ({ amount, unit: 'MMBtu' }) as const;

function oilState(originRef = 'ORIGIN:OIL-001'): ResourcePoolState {
  return createResourcePoolState({
    resourceId: 'CRUDE_OIL',
    geologicalEndowment: BARRELS('100'),
    pools: {
      undiscovered: BARRELS('60'),
      discovered: BARRELS('10'),
      recoverable: BARRELS('10'),
      developed: BARRELS('10'),
      extractedCumulative: BARRELS('10'),
    },
    originRef,
  });
}

function oilInventory(
  originRef = 'ORIGIN:OIL-INVENTORY',
): CommodityInventoryState {
  return createCommodityInventoryState({
    commodityId: 'CRUDE_OIL',
    buckets: {
      usable: BARRELS('0'),
      strategic: BARRELS('0'),
      reservedForContract: BARRELS('0'),
      inTransitInbound: BARRELS('0'),
      inTransitOutbound: BARRELS('0'),
      lossesCumulative: BARRELS('0'),
    },
    originRef,
  });
}

function transition(
  transitionRef: string,
  action: ResourcePoolTransition['action'],
  amount: string,
  predecessorRef: string,
): ResourcePoolTransition {
  return {
    transitionRef,
    action,
    amount: BARRELS(amount),
    causalTrace: {
      traceRef: `TRACE:${transitionRef}`,
      sourceRef: `SOURCE:${transitionRef}`,
      predecessorRef,
    },
  };
}

describe('V12 E08 geological pools and causal lineage', () => {
  it('moves only the documented pools, conserves the fixed endowment, and records exact snapshots', () => {
    const initial = oilState();
    const explored = applyResourcePoolTransition(
      initial,
      transition('TRANS:EXPLORE-001', 'EXPLORE', '12.5', initial.lineageRef),
    );
    const recoverable = applyResourcePoolTransition(
      explored.state,
      transition(
        'TRANS:RECOVER-001',
        'DECLARE_RECOVERABLE',
        '2.5',
        explored.state.lineageRef,
      ),
    );
    const developed = applyResourcePoolTransition(
      recoverable.state,
      transition(
        'TRANS:DEVELOP-001',
        'DEVELOP',
        '2.5',
        recoverable.state.lineageRef,
      ),
    );

    expect(explored.record).toMatchObject({
      action: 'EXPLORE',
      from: 'UNDISCOVERED',
      to: 'DISCOVERED',
      amount: BARRELS('12.5'),
      causalTrace: {
        predecessorRef: 'ORIGIN:OIL-001',
        sourceRef: 'SOURCE:TRANS:EXPLORE-001',
      },
      before: {
        pools: { undiscovered: BARRELS('60'), discovered: BARRELS('10') },
      },
      after: {
        pools: { undiscovered: BARRELS('47.5'), discovered: BARRELS('22.5') },
      },
    });
    expect(developed.state).toMatchObject({
      geologicalEndowment: BARRELS('100'),
      pools: {
        undiscovered: BARRELS('47.5'),
        discovered: BARRELS('20'),
        recoverable: BARRELS('10'),
        developed: BARRELS('12.5'),
        extractedCumulative: BARRELS('10'),
      },
    });
    expect(
      Object.values(developed.state.pools).map((quantity) => quantity.unit),
    ).toEqual(['barrel', 'barrel', 'barrel', 'barrel', 'barrel']);
  });

  it('binds extraction inventory to the exact E08 extraction transition and exposes only a read boundary to E10', () => {
    const initial = oilState();
    const inventory = oilInventory();
    const prepared = applyResourcePoolTransition(
      initial,
      transition('TRANS:PREPARE-EXTRACT', 'DEVELOP', '5', initial.lineageRef),
    );
    const extracted = extractToCommodityInventory({
      resourceState: prepared.state,
      inventoryState: inventory,
      resourceTransition: transition(
        'TRANS:EXTRACT-001',
        'EXTRACT',
        '5',
        prepared.state.lineageRef,
      ),
      inventoryMovementRef: 'MOVE:EXTRACT-001',
      inventoryCausalTrace: {
        traceRef: 'TRACE:MOVE-EXTRACT-001',
        sourceRef: 'TRANS:EXTRACT-001',
        predecessorRef: inventory.lineageRef,
      },
    });

    expect(extracted.resource.record).toMatchObject({
      from: 'DEVELOPED',
      to: 'EXTRACTED',
      before: {
        pools: { developed: BARRELS('15'), extractedCumulative: BARRELS('10') },
      },
      after: {
        pools: { developed: BARRELS('10'), extractedCumulative: BARRELS('15') },
      },
    });
    expect(extracted.inventory.record).toMatchObject({
      action: 'EXTRACTION_TO_USABLE',
      sourceTransitionRef: 'TRANS:EXTRACT-001',
      amount: BARRELS('5'),
      before: { buckets: { usable: BARRELS('0') } },
      after: { buckets: { usable: BARRELS('5') } },
    });
    expect(createE08ProductionReadBoundary(extracted.inventory.state)).toEqual({
      owner: 'E08_RESOURCE_AND_INVENTORY_ENGINE',
      access: 'READ_ONLY_USABLE_AVAILABILITY',
      commodityId: 'CRUDE_OIL',
      unit: 'barrel',
      usableAvailable: BARRELS('5'),
      inventoryLineageRef: 'MOVE:EXTRACT-001',
      forbiddenMutations: [
        'E10_CANNOT_EXTRACT',
        'E10_CANNOT_MOVE_RESERVES',
        'E10_CANNOT_MUTATE_INVENTORY',
      ],
    });
  });

  it('rejects forged and stale resource or extraction-to-inventory causal links', () => {
    const initial = oilState();
    expect(() =>
      applyResourcePoolTransition(
        initial,
        transition('TRANS:FORGED-001', 'EXPLORE', '1', 'FORGED:RESOURCE'),
      ),
    ).toThrow('forged or stale');

    const prepared = applyResourcePoolTransition(
      initial,
      transition('TRANS:PREPARE-002', 'DEVELOP', '2', initial.lineageRef),
    );
    expect(() =>
      extractToCommodityInventory({
        resourceState: prepared.state,
        inventoryState: oilInventory(),
        resourceTransition: transition(
          'TRANS:EXTRACT-002',
          'EXTRACT',
          '1',
          prepared.state.lineageRef,
        ),
        inventoryMovementRef: 'MOVE:EXTRACT-002',
        inventoryCausalTrace: {
          traceRef: 'TRACE:MOVE-EXTRACT-002',
          sourceRef: 'FORGED:EXTRACTION-SOURCE',
          predecessorRef: 'ORIGIN:OIL-INVENTORY',
        },
      }),
    ).toThrow('source reference is forged');
  });

  it('replays deterministically and rejects duplicate transition references', () => {
    const initial = oilState('ORIGIN:REPLAY-OIL');
    const transitions = [
      transition('TRANS:REPLAY-001', 'EXPLORE', '1', initial.lineageRef),
      transition(
        'TRANS:REPLAY-002',
        'DECLARE_RECOVERABLE',
        '1',
        'TRANS:REPLAY-001',
      ),
      transition('TRANS:REPLAY-003', 'DEVELOP', '1', 'TRANS:REPLAY-002'),
    ] as const;
    const first = replayResourcePoolTransitions({
      initialState: initial,
      transitions,
    });
    const second = replayResourcePoolTransitions({
      initialState: initial,
      transitions,
    });

    expect(second).toEqual(first);
    expect(() =>
      applyResourcePoolTransition(
        first.state,
        transition('TRANS:REPLAY-001', 'EXTRACT', '1', first.state.lineageRef),
      ),
    ).toThrow('already been applied');
  });

  it('rejects silent resource and commodity unit conversion', () => {
    expect(() =>
      createResourcePoolState({
        resourceId: 'CRUDE_OIL',
        geologicalEndowment: TONNES('10'),
        pools: {
          undiscovered: TONNES('10'),
          discovered: TONNES('0'),
          recoverable: TONNES('0'),
          developed: TONNES('0'),
          extractedCumulative: TONNES('0'),
        },
        originRef: 'ORIGIN:BAD-UNIT',
      }),
    ).toThrow('must use barrel');

    const gas = createResourcePoolState({
      resourceId: 'NATURAL_GAS',
      geologicalEndowment: GAS_EQUIVALENT('10'),
      pools: {
        undiscovered: GAS_EQUIVALENT('0'),
        discovered: GAS_EQUIVALENT('0'),
        recoverable: GAS_EQUIVALENT('0'),
        developed: GAS_EQUIVALENT('10'),
        extractedCumulative: GAS_EQUIVALENT('0'),
      },
      originRef: 'ORIGIN:GAS-001',
    });
    const gasInventory = createCommodityInventoryState({
      commodityId: 'NATURAL_GAS',
      buckets: {
        usable: GAS('0'),
        strategic: GAS('0'),
        reservedForContract: GAS('0'),
        inTransitInbound: GAS('0'),
        inTransitOutbound: GAS('0'),
        lossesCumulative: GAS('0'),
      },
      originRef: 'ORIGIN:GAS-INVENTORY',
    });
    expect(() =>
      extractToCommodityInventory({
        resourceState: gas,
        inventoryState: gasInventory,
        resourceTransition: {
          transitionRef: 'TRANS:GAS-EXTRACT',
          action: 'EXTRACT',
          amount: GAS_EQUIVALENT('1'),
          causalTrace: {
            traceRef: 'TRACE:GAS-EXTRACT',
            sourceRef: 'SOURCE:GAS-EXTRACT',
            predecessorRef: gas.lineageRef,
          },
        },
        inventoryMovementRef: 'MOVE:GAS-EXTRACT',
        inventoryCausalTrace: {
          traceRef: 'TRACE:MOVE-GAS-EXTRACT',
          sourceRef: 'TRANS:GAS-EXTRACT',
          predecessorRef: gasInventory.lineageRef,
        },
      }),
    ).toThrow('must use MMBtu');
  });
});

describe('V12 E08 inventory, reserve, reconciliation, and exhaustion foundation', () => {
  it('keeps strategic and contract-reserved inventory out of freely usable stock', () => {
    const inventory = createCommodityInventoryState({
      commodityId: 'COPPER',
      buckets: {
        usable: TONNES('10'),
        strategic: TONNES('2'),
        reservedForContract: TONNES('1'),
        inTransitInbound: TONNES('3'),
        inTransitOutbound: TONNES('4'),
        lossesCumulative: TONNES('0'),
      },
      originRef: 'ORIGIN:COPPER-INVENTORY',
    });
    const reserved = applyInventoryMovement(inventory, {
      movementRef: 'MOVE:COPPER-RESERVE',
      action: 'RESERVE_FOR_CONTRACT',
      amount: TONNES('3'),
      causalTrace: {
        traceRef: 'TRACE:COPPER-RESERVE',
        sourceRef: 'SOURCE:COPPER-CONTRACT',
        predecessorRef: inventory.lineageRef,
      },
    });
    const accumulated = applyInventoryMovement(reserved.state, {
      movementRef: 'MOVE:COPPER-STRATEGIC',
      action: 'ACCUMULATE_STRATEGIC_RESERVE',
      amount: TONNES('2'),
      causalTrace: {
        traceRef: 'TRACE:COPPER-STRATEGIC',
        sourceRef: 'SOURCE:COPPER-RESERVE-POLICY',
        predecessorRef: reserved.state.lineageRef,
      },
    });
    const loss = applyInventoryMovement(accumulated.state, {
      movementRef: 'MOVE:COPPER-LOSS',
      action: 'RECORD_USABLE_LOSS',
      amount: TONNES('1'),
      causalTrace: {
        traceRef: 'TRACE:COPPER-LOSS',
        sourceRef: 'SOURCE:COPPER-SHOCK',
        predecessorRef: accumulated.state.lineageRef,
      },
    });

    expect(loss.state.buckets).toEqual({
      usable: TONNES('4'),
      strategic: TONNES('4'),
      reservedForContract: TONNES('4'),
      inTransitInbound: TONNES('3'),
      inTransitOutbound: TONNES('4'),
      lossesCumulative: TONNES('1'),
    });
    expect(() =>
      applyInventoryMovement(loss.state, {
        movementRef: 'MOVE:COPPER-STALE',
        action: 'RESERVE_FOR_CONTRACT',
        amount: TONNES('1'),
        causalTrace: {
          traceRef: 'TRACE:COPPER-STALE',
          sourceRef: 'SOURCE:COPPER-CONTRACT',
          predecessorRef: inventory.lineageRef,
        },
      }),
    ).toThrow('forged or stale');
  });

  it('reconciles only explicit physical flows and rejects mismatched units', () => {
    expect(
      reconcileCommodityInventory({
        commodityId: 'CRUDE_OIL',
        opening: BARRELS('20'),
        extractionOutput: BARRELS('5'),
        deliveredImports: BARRELS('3'),
        domesticUse: BARRELS('4'),
        deliveredExports: BARRELS('2'),
        projectUse: BARRELS('1'),
        losses: BARRELS('1'),
      }),
    ).toEqual(BARRELS('20'));
    expect(() =>
      reconcileCommodityInventory({
        commodityId: 'CRUDE_OIL',
        opening: BARRELS('1'),
        extractionOutput: BARRELS('0'),
        deliveredImports: TONNES('1'),
        domesticUse: BARRELS('0'),
        deliveredExports: BARRELS('0'),
        projectUse: BARRELS('0'),
        losses: BARRELS('0'),
      }),
    ).toThrow('must use barrel');
  });

  it('handles exact repeated extraction through exhaustion without negative pools', () => {
    let state = createResourcePoolState({
      resourceId: 'CRUDE_OIL',
      geologicalEndowment: BARRELS('1'),
      pools: {
        undiscovered: BARRELS('0'),
        discovered: BARRELS('0'),
        recoverable: BARRELS('0'),
        developed: BARRELS('1'),
        extractedCumulative: BARRELS('0'),
      },
      originRef: 'ORIGIN:EXHAUSTION',
    });

    for (let index = 0; index < 10; index += 1) {
      const result = applyResourcePoolTransition(
        state,
        transition(
          `TRANS:EXHAUST-${String(index).padStart(3, '0')}`,
          'EXTRACT',
          '0.1',
          state.lineageRef,
        ),
      );
      state = result.state;
    }

    expect(state.pools).toMatchObject({
      developed: BARRELS('0'),
      extractedCumulative: BARRELS('1'),
    });
    expect(() =>
      applyResourcePoolTransition(
        state,
        transition('TRANS:EXHAUST-OVER', 'EXTRACT', '0.1', state.lineageRef),
      ),
    ).toThrow('exceeds source layer');
  });
});
