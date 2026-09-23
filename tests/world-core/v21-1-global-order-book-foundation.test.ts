import { describe, expect, it } from 'vitest';

import { createFoundationFact } from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  assertGlobalOrderBookReplayEvidence,
  calculateGlobalOrderBook,
  type GlobalLimitOrder,
  type OrderBookAction,
  type SellCapacityFact,
} from '../../packages/core/src/engine-kernels/global-order-book-foundation.js';
import { COMMODITY_ENTRIES } from '../../packages/core/src/registries/fixed-catalog.js';

const GENESIS = 'GENESIS.WORLD.21';
const TRACE = {
  traceRef: 'TRACE.V21.1',
  calculationVersion: 'V21_ORDER_BOOK.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.21',
    sourceVersion: 'WORLD_VERSION.21',
    snapshotRef: 'SNAPSHOT.WORLD.21',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '100', unit: 'sim_millisecond' },
} as const;

const TICK = (amount: string) => ({ amount, unit: 'sim_millisecond' }) as const;

function fact<T>(factRef: string, payload: T, predecessor = GENESIS) {
  return createFoundationFact({
    trace: TRACE,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: [predecessor],
    payload,
  });
}

function actions(payloads: readonly OrderBookAction[]) {
  let predecessor = GENESIS;
  return payloads.map((payload) => {
    const factRef = `FACT.${payload.actionRef}`;
    const created = fact(factRef, payload, predecessor);
    predecessor = factRef;
    return created;
  });
}

function capacity(
  accountRef: string,
  countryRef: string,
  available: string,
  commodityId = 'GRAIN',
  unit = 'tonne',
): SellCapacityFact {
  return {
    accountRef,
    countryRef,
    commodityId,
    availableToReserve: { amount: available, unit },
    existingReservationRefs: [],
  };
}

function order(input: {
  orderRef: string;
  countryRef: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  accountRef?: string;
  reservationRef?: string;
  commodityId?: string;
  unit?: string;
  allowPartialFill?: boolean;
  minimumFill?: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  expiresAt?: string;
}): GlobalLimitOrder {
  const unit = input.unit ?? 'tonne';
  const allowPartialFill = input.allowPartialFill ?? true;
  return {
    orderRef: input.orderRef,
    countryRef: input.countryRef,
    side: input.side,
    commodityId: input.commodityId ?? 'GRAIN',
    quantity: { amount: input.quantity, unit },
    limitPrice: { amount: input.price, currency: 'GCU', perUnit: unit },
    allowPartialFill,
    minimumFill: {
      amount: input.minimumFill ?? (allowPartialFill ? '1' : input.quantity),
      unit,
    },
    deliveryStartAt: TICK(input.deliveryStart ?? '100'),
    deliveryEndAt: TICK(input.deliveryEnd ?? '200'),
    expiresAt: TICK(input.expiresAt ?? '500'),
    inventoryAccountRef:
      input.side === 'SELL'
        ? (input.accountRef ?? `ACCOUNT.${input.countryRef}`)
        : null,
    reservationRef:
      input.side === 'SELL'
        ? (input.reservationRef ?? `RESERVE.${input.orderRef}`)
        : null,
  };
}

function place(
  sequence: string,
  at: string,
  placed: GlobalLimitOrder,
): OrderBookAction {
  return {
    kind: 'PLACE',
    actionRef: `ACTION.${sequence}`,
    sequence,
    occurredAt: TICK(at),
    order: placed,
  };
}

function cancel(
  sequence: string,
  at: string,
  orderRef: string,
  countryRef: string,
): OrderBookAction {
  return {
    kind: 'CANCEL',
    actionRef: `ACTION.${sequence}`,
    sequence,
    occurredAt: TICK(at),
    orderRef,
    countryRef,
  };
}

function evaluate(
  capacityPayloads: readonly SellCapacityFact[],
  actionPayloads: readonly OrderBookAction[],
) {
  const capacityFacts = capacityPayloads.map((payload, index) =>
    fact(`FACT.CAPACITY.${index}`, payload),
  );
  const actionFacts = actions(actionPayloads);
  const result = calculateGlobalOrderBook({
    trace: TRACE,
    genesisFactRef: GENESIS,
    capacityFacts,
    actionFacts,
    outputRef: 'OUT.V21.ORDER_BOOK',
  });
  return { capacityFacts, actionFacts, result };
}

describe('V21.1 Global Order Book pure foundation', () => {
  it('accepts exactly the fixed 12 commodity IDs and canonical units', () => {
    expect(COMMODITY_ENTRIES).toHaveLength(12);
    const payloads = COMMODITY_ENTRIES.map((item, index) =>
      place(
        String(index + 1),
        String(index + 1),
        order({
          orderRef: `BUY.${item.id}`,
          countryRef: 'COUNTRY.B',
          side: 'BUY',
          quantity: '1',
          price: '5',
          commodityId: item.id,
          unit: item.unit,
        }),
      ),
    );
    const { result } = evaluate([], payloads);
    expect(result.orders).toHaveLength(12);
    expect(result.fills).toHaveLength(0);
    expect(() =>
      evaluate(
        [],
        [
          place(
            '1',
            '1',
            order({
              orderRef: 'BUY.UNKNOWN',
              countryRef: 'COUNTRY.B',
              side: 'BUY',
              quantity: '1',
              price: '5',
              commodityId: 'NOT_A_COMMODITY',
            }),
          ),
        ],
      ),
    ).toThrow('12 fixed commodities');
  });

  it('matches best price then earlier time, partially fills, cancels only remainder, and replays identically', () => {
    const capacityPayloads = [
      capacity('ACCOUNT.A', 'COUNTRY.A', '4'),
      capacity('ACCOUNT.C', 'COUNTRY.C', '2'),
      capacity('ACCOUNT.D', 'COUNTRY.D', '3'),
    ];
    const payloads = [
      place(
        '1',
        '10',
        order({
          orderRef: 'SELL.A',
          countryRef: 'COUNTRY.A',
          side: 'SELL',
          quantity: '4',
          price: '5',
          accountRef: 'ACCOUNT.A',
        }),
      ),
      place(
        '2',
        '11',
        order({
          orderRef: 'SELL.C',
          countryRef: 'COUNTRY.C',
          side: 'SELL',
          quantity: '2',
          price: '4',
          accountRef: 'ACCOUNT.C',
        }),
      ),
      place(
        '3',
        '12',
        order({
          orderRef: 'SELL.D',
          countryRef: 'COUNTRY.D',
          side: 'SELL',
          quantity: '3',
          price: '5',
          accountRef: 'ACCOUNT.D',
        }),
      ),
      place(
        '4',
        '13',
        order({
          orderRef: 'BUY.B',
          countryRef: 'COUNTRY.B',
          side: 'BUY',
          quantity: '8',
          price: '6',
        }),
      ),
      cancel('5', '14', 'SELL.D', 'COUNTRY.D'),
    ];
    const { capacityFacts, actionFacts, result } = evaluate(
      capacityPayloads,
      payloads,
    );
    expect(
      result.fills.map((fill) => [fill.sellOrderRef, fill.quantity.amount]),
    ).toEqual([
      ['SELL.C', '2'],
      ['SELL.A', '4'],
      ['SELL.D', '2'],
    ]);
    expect(
      result.orders.find((entry) => entry.order.orderRef === 'SELL.D'),
    ).toMatchObject({
      status: 'CANCELLED',
      remaining: { amount: '1', unit: 'tonne' },
    });
    expect(
      result.capacities.find((entry) => entry.accountRef === 'ACCOUNT.D')
        ?.availableToReserve.amount,
    ).toBe('1');
    expect(
      result.reservationMovements.filter(
        (entry) => entry.kind === 'ALLOCATE_TO_FILL',
      ),
    ).toHaveLength(3);
    expect(
      result.reservationMovements.find((entry) => entry.kind === 'RELEASE')
        ?.delta.amount,
    ).toBe('-1');
    expect(
      result.fills.every(
        (fill) => fill.askLimit.amount <= fill.bidLimit.amount,
      ),
    ).toBe(true);
    expect('executionPrice' in result.fills[0]!).toBe(false);
    assertGlobalOrderBookReplayEvidence({
      proof: result.replayProof,
      capacityFacts,
      actionFacts,
    });
    expect(evaluate(capacityPayloads, payloads).result).toEqual(result);
  });

  it('keeps equal-price FIFO and refuses a partial fill for all-or-none orders', () => {
    const payloads = [
      place(
        '1',
        '10',
        order({
          orderRef: 'SELL.FIRST',
          countryRef: 'COUNTRY.A',
          side: 'SELL',
          quantity: '2',
          price: '5',
          accountRef: 'ACCOUNT.A',
        }),
      ),
      place(
        '2',
        '10',
        order({
          orderRef: 'SELL.SECOND',
          countryRef: 'COUNTRY.C',
          side: 'SELL',
          quantity: '3',
          price: '5',
          accountRef: 'ACCOUNT.C',
        }),
      ),
      place(
        '3',
        '11',
        order({
          orderRef: 'BUY.ONE',
          countryRef: 'COUNTRY.B',
          side: 'BUY',
          quantity: '4',
          price: '5',
        }),
      ),
    ];
    const result = evaluate(
      [
        capacity('ACCOUNT.A', 'COUNTRY.A', '2'),
        capacity('ACCOUNT.C', 'COUNTRY.C', '3'),
      ],
      payloads,
    ).result;
    expect(
      result.fills.map((fill) => [fill.sellOrderRef, fill.quantity.amount]),
    ).toEqual([
      ['SELL.FIRST', '2'],
      ['SELL.SECOND', '2'],
    ]);
    const noPartial = evaluate(
      [capacity('ACCOUNT.A', 'COUNTRY.A', '2')],
      [
        payloads[0]!,
        place(
          '2',
          '11',
          order({
            orderRef: 'BUY.AON',
            countryRef: 'COUNTRY.B',
            side: 'BUY',
            quantity: '3',
            price: '5',
            allowPartialFill: false,
          }),
        ),
      ],
    ).result;
    expect(noPartial.fills).toHaveLength(0);
    expect(
      noPartial.orders.find((entry) => entry.order.orderRef === 'BUY.AON')
        ?.remaining.amount,
    ).toBe('3');
    const aggregated = evaluate(
      [
        capacity('ACCOUNT.A', 'COUNTRY.A', '2'),
        capacity('ACCOUNT.C', 'COUNTRY.C', '3'),
      ],
      [
        payloads[0]!,
        payloads[1]!,
        place(
          '3',
          '11',
          order({
            orderRef: 'BUY.AON',
            countryRef: 'COUNTRY.B',
            side: 'BUY',
            quantity: '4',
            price: '5',
            allowPartialFill: false,
          }),
        ),
      ],
    ).result;
    expect(aggregated.fills.map((fill) => fill.quantity.amount)).toEqual([
      '2',
      '2',
    ]);
    expect(
      aggregated.orders.find((entry) => entry.order.orderRef === 'BUY.AON')
        ?.status,
    ).toBe('FILLED');
  });

  it('rejects reused reservation references and over-reserving an inventory account', () => {
    const first = place(
      '1',
      '10',
      order({
        orderRef: 'SELL.ONE',
        countryRef: 'COUNTRY.A',
        side: 'SELL',
        quantity: '3',
        price: '5',
        accountRef: 'ACCOUNT.A',
        reservationRef: 'RESERVE.SAME',
      }),
    );
    const second = place(
      '2',
      '11',
      order({
        orderRef: 'SELL.TWO',
        countryRef: 'COUNTRY.A',
        side: 'SELL',
        quantity: '3',
        price: '5',
        accountRef: 'ACCOUNT.A',
        reservationRef: 'RESERVE.SAME',
      }),
    );
    expect(() =>
      evaluate([capacity('ACCOUNT.A', 'COUNTRY.A', '10')], [first, second]),
    ).toThrow('reservation reference already exists');
    const uniqueSecond = place(
      '2',
      '11',
      order({
        orderRef: 'SELL.TWO',
        countryRef: 'COUNTRY.A',
        side: 'SELL',
        quantity: '3',
        price: '5',
        accountRef: 'ACCOUNT.A',
        reservationRef: 'RESERVE.TWO',
      }),
    );
    expect(() =>
      evaluate(
        [capacity('ACCOUNT.A', 'COUNTRY.A', '5')],
        [first, uniqueSecond],
      ),
    ).toThrow('exceeds available inventory');
  });

  it('uses exact fractional quantities and releases only an expired unfilled seller remainder', () => {
    const result = evaluate(
      [capacity('ACCOUNT.A', 'COUNTRY.A', '0.3')],
      [
        place(
          '1',
          '10',
          order({
            orderRef: 'SELL.FRACTION',
            countryRef: 'COUNTRY.A',
            side: 'SELL',
            quantity: '0.3',
            minimumFill: '0.1',
            price: '5',
            accountRef: 'ACCOUNT.A',
            expiresAt: '15',
          }),
        ),
        place(
          '2',
          '11',
          order({
            orderRef: 'BUY.FRACTION',
            countryRef: 'COUNTRY.B',
            side: 'BUY',
            quantity: '0.1',
            minimumFill: '0.1',
            price: '5',
          }),
        ),
        place(
          '3',
          '15',
          order({
            orderRef: 'BUY.LATER',
            countryRef: 'COUNTRY.C',
            side: 'BUY',
            quantity: '0.2',
            minimumFill: '0.1',
            price: '5',
          }),
        ),
      ],
    ).result;
    expect(result.fills.map((fill) => fill.quantity.amount)).toEqual(['0.1']);
    expect(
      result.orders.find((entry) => entry.order.orderRef === 'SELL.FRACTION')
        ?.status,
    ).toBe('EXPIRED');
    expect(
      result.reservationMovements.map((entry) => [
        entry.kind,
        entry.delta.amount,
      ]),
    ).toEqual([
      ['HOLD', '0.3'],
      ['ALLOCATE_TO_FILL', '-0.1'],
      ['RELEASE', '-0.2'],
    ]);
    expect(result.capacities[0]?.availableToReserve.amount).toBe('0.2');
  });

  it('expires an unmatched seller at the replay snapshot without a later action', () => {
    const result = evaluate(
      [capacity('ACCOUNT.SNAPSHOT', 'COUNTRY.A', '2')],
      [
        place(
          '1',
          '10',
          order({
            orderRef: 'SELL.SNAPSHOT',
            countryRef: 'COUNTRY.A',
            side: 'SELL',
            quantity: '2',
            price: '5',
            accountRef: 'ACCOUNT.SNAPSHOT',
            expiresAt: '50',
          }),
        ),
      ],
    ).result;
    expect(result.orders[0]?.status).toBe('EXPIRED');
    expect(result.reservationMovements.map((entry) => entry.kind)).toEqual([
      'HOLD',
      'RELEASE',
    ]);
    expect(result.capacities[0]?.availableToReserve.amount).toBe('2');
  });

  it('rejects mismatched price, unit, delivery window, and unsafe action discriminators', () => {
    const sell = order({
      orderRef: 'SELL.A',
      countryRef: 'COUNTRY.A',
      side: 'SELL',
      quantity: '2',
      price: '5',
      accountRef: 'ACCOUNT.A',
    });
    const noCross = evaluate(
      [capacity('ACCOUNT.A', 'COUNTRY.A', '2')],
      [
        place('1', '10', sell),
        place(
          '2',
          '11',
          order({
            orderRef: 'BUY.B',
            countryRef: 'COUNTRY.B',
            side: 'BUY',
            quantity: '2',
            price: '4',
          }),
        ),
      ],
    ).result;
    expect(noCross.fills).toHaveLength(0);
    const noWindowOverlap = evaluate(
      [capacity('ACCOUNT.A', 'COUNTRY.A', '2')],
      [
        place('1', '10', sell),
        place(
          '2',
          '11',
          order({
            orderRef: 'BUY.B',
            countryRef: 'COUNTRY.B',
            side: 'BUY',
            quantity: '2',
            price: '6',
            deliveryStart: '201',
            deliveryEnd: '250',
          }),
        ),
      ],
    ).result;
    expect(noWindowOverlap.fills).toHaveLength(0);
    expect(() =>
      evaluate(
        [],
        [
          place(
            '1',
            '10',
            order({
              orderRef: 'BUY.BAD',
              countryRef: 'COUNTRY.B',
              side: 'BUY',
              quantity: '2',
              price: '6',
              unit: 'barrel',
            }),
          ),
        ],
      ),
    ).toThrow('must use tonne');
    expect(() =>
      evaluate(
        [],
        [
          place('1', '10', {
            ...order({
              orderRef: 'BUY.BAD',
              countryRef: 'COUNTRY.B',
              side: 'BUY',
              quantity: '2',
              price: '6',
            }),
            limitPrice: { amount: '6', currency: 'USD', perUnit: 'tonne' },
          }),
        ],
      ),
    ).toThrow('GCU per canonical commodity unit');
    expect(() =>
      evaluate([], [{ ...place('1', '10', sell), kind: 'UNSAFE' as never }]),
    ).toThrow('action kind must be PLACE or CANCEL');
    expect(() =>
      evaluate([], [place('1', '10', { ...sell, side: 'UNSAFE' as never })]),
    ).toThrow('side must be BUY or SELL');
  });

  it('rejects forged payload, stale snapshot, broken predecessors, and replay proof tampering', () => {
    const payload = place(
      '1',
      '10',
      order({
        orderRef: 'BUY.ONE',
        countryRef: 'COUNTRY.B',
        side: 'BUY',
        quantity: '1',
        price: '5',
      }),
    );
    const first = actions([payload])[0]!;
    expect(() =>
      calculateGlobalOrderBook({
        trace: TRACE,
        genesisFactRef: GENESIS,
        capacityFacts: [],
        actionFacts: [{ ...first, payload: { ...payload, sequence: '999' } }],
        outputRef: 'OUT.FORGED',
      }),
    ).toThrow('canonical payload');
    expect(() =>
      calculateGlobalOrderBook({
        trace: TRACE,
        genesisFactRef: GENESIS,
        capacityFacts: [],
        actionFacts: [fact('FACT.ACTION.STALE', payload, 'UNRELATED.FACT')],
        outputRef: 'OUT.BROKEN',
      }),
    ).toThrow('predecessor chain');
    expect(() =>
      calculateGlobalOrderBook({
        trace: {
          ...TRACE,
          snapshot: { ...TRACE.snapshot, snapshotHash: 'c'.repeat(64) },
        },
        genesisFactRef: GENESIS,
        capacityFacts: [],
        actionFacts: [first],
        outputRef: 'OUT.STALE',
      }),
    ).toThrow('mixed lineage');
    const { result, capacityFacts, actionFacts } = evaluate([], [payload]);
    expect(() =>
      assertGlobalOrderBookReplayEvidence({
        proof: { ...result.replayProof, canonicalOutput: '{}' },
        capacityFacts,
        actionFacts,
      }),
    ).toThrow('replay proof does not match');
  });
});
