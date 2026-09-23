import { COMMODITY_REGISTRY } from '../registries/fixed-catalog.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

import {
  foundationFactBinding,
  foundationFactPayload,
  type FoundationFact,
  type FoundationFactBinding,
  type FoundationSnapshotBinding,
  type FoundationTraceRequest,
} from './foundation-provenance.js';
import {
  kernelInvalid,
  money,
  nonNegative,
  nonNegativeQuantity,
  positive,
  quantity,
  render,
  renderQuantity,
  type ExactQuantity,
  type ExactUnitPrice,
  type WorldDecimalValue,
} from './common.js';

/** Pure E16 calculation; the authoritative writer owns reservations and trades. */
export const GLOBAL_ORDER_BOOK_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export type OrderBookFact<T> = FoundationFact<T>;
export type OrderBookTraceRequest = FoundationTraceRequest;

export interface SellCapacityFact {
  readonly accountRef: string;
  readonly countryRef: string;
  readonly commodityId: string;
  /** Caller-attested net stock available for new sell reservations. */
  readonly availableToReserve: ExactQuantity;
  readonly existingReservationRefs: readonly string[];
}

export interface GlobalLimitOrder {
  readonly orderRef: string;
  readonly countryRef: string;
  readonly side: 'BUY' | 'SELL';
  readonly commodityId: string;
  readonly quantity: ExactQuantity;
  readonly limitPrice: ExactUnitPrice;
  readonly allowPartialFill: boolean;
  readonly minimumFill: ExactQuantity;
  readonly deliveryStartAt: ExactQuantity;
  readonly deliveryEndAt: ExactQuantity;
  readonly expiresAt: ExactQuantity;
  /** Exactly one seller reservation; BUY orders use null in both fields. */
  readonly inventoryAccountRef: string | null;
  readonly reservationRef: string | null;
}

export interface PlaceOrderAction {
  readonly kind: 'PLACE';
  readonly actionRef: string;
  readonly sequence: string;
  readonly occurredAt: ExactQuantity;
  readonly order: GlobalLimitOrder;
}

export interface CancelOrderAction {
  readonly kind: 'CANCEL';
  readonly actionRef: string;
  readonly sequence: string;
  readonly occurredAt: ExactQuantity;
  readonly orderRef: string;
  readonly countryRef: string;
}

export type OrderBookAction = PlaceOrderAction | CancelOrderAction;

export interface BookOrder {
  readonly order: GlobalLimitOrder;
  readonly placedAt: ExactQuantity;
  readonly sequence: string;
  readonly remaining: ExactQuantity;
  readonly status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
}

export interface BookFill {
  readonly fillRef: string;
  readonly buyOrderRef: string;
  readonly sellOrderRef: string;
  readonly buyerCountryRef: string;
  readonly sellerCountryRef: string;
  readonly commodityId: string;
  readonly quantity: ExactQuantity;
  /** Limits only; selecting a cash execution price belongs to later policy. */
  readonly bidLimit: ExactUnitPrice;
  readonly askLimit: ExactUnitPrice;
  readonly sellerReservationRef: string;
  readonly deliveryStartAt: ExactQuantity;
  readonly deliveryEndAt: ExactQuantity;
  readonly matchedAt: ExactQuantity;
}

export interface ReservationMovement {
  readonly movementRef: string;
  readonly reservationRef: string;
  readonly inventoryAccountRef: string;
  readonly orderRef: string;
  readonly kind: 'HOLD' | 'ALLOCATE_TO_FILL' | 'RELEASE';
  readonly remainingBefore: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly remainingAfter: ExactQuantity;
  readonly availableBefore: ExactQuantity;
  readonly availableAfter: ExactQuantity;
}

export interface RemainingSellCapacity {
  readonly accountRef: string;
  readonly commodityId: string;
  readonly availableToReserve: ExactQuantity;
}

export interface OrderBookReplayProof {
  readonly module: 'V21_GLOBAL_ORDER_BOOK';
  readonly traceRef: string;
  readonly calculationVersion: string;
  readonly snapshot: FoundationSnapshotBinding;
  readonly snapshotAt: ExactQuantity;
  readonly genesisFactRef: string;
  readonly inputFacts: readonly FoundationFactBinding[];
  readonly outputRef: string;
  readonly canonicalOutput: string;
  /** A canonical SHA-256 preimage, not a persistent commitment or digest. */
  readonly hashInput: string;
}

export interface GlobalOrderBookResult {
  readonly foundationStatus: typeof GLOBAL_ORDER_BOOK_FOUNDATION_STATUS;
  readonly orders: readonly BookOrder[];
  readonly fills: readonly BookFill[];
  readonly reservationMovements: readonly ReservationMovement[];
  readonly capacities: readonly RemainingSellCapacity[];
  readonly replayProof: OrderBookReplayProof;
}

interface MutableCapacity {
  readonly fact: SellCapacityFact;
  available: WorldDecimalValue;
}

interface MutableOrder {
  readonly order: GlobalLimitOrder;
  readonly placedAt: WorldDecimalValue;
  readonly sequence: WorldDecimalValue;
  remaining: WorldDecimalValue;
  status: BookOrder['status'];
  reservationRemaining: WorldDecimalValue;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function reference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value))
    kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function distinctReferences(
  values: readonly string[],
  label: string,
): readonly string[] {
  const result = values.map((value, index) =>
    reference(value, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length)
    kernelInvalid(`${label} must be unique`);
  return Object.freeze(result);
}

function simTick(value: ExactQuantity, label: string): WorldDecimalValue {
  const tick = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!tick.isInteger())
    kernelInvalid(`${label} must be an integer simulation millisecond`);
  return tick;
}

function sequence(value: string): WorldDecimalValue {
  const result = nonNegative(value, 'action sequence');
  if (!result.isInteger()) kernelInvalid('action sequence must be an integer');
  return result;
}

function commodity(id: string, label: string): { id: string; unit: string } {
  if (!COMMODITY_REGISTRY.has(id))
    kernelInvalid(`${label} must be one of the 12 fixed commodities`);
  const entry = COMMODITY_REGISTRY.get(id);
  if (!('unit' in entry) || typeof entry.unit !== 'string') {
    kernelInvalid('Fixed commodity must carry its physical unit');
  }
  return { id: entry.id, unit: entry.unit };
}

function exactQuantity(
  value: ExactQuantity,
  unit: string,
  label: string,
  mustBePositive = false,
): WorldDecimalValue {
  const parsed = quantity(value, label);
  if (parsed.unit !== unit) kernelInvalid(`${label} must use ${unit}`);
  return mustBePositive
    ? positive(value.amount, label)
    : nonNegative(value.amount, label);
}

function limitPrice(value: ExactUnitPrice, unit: string): ExactUnitPrice {
  const amount = positive(value.amount, 'limit price');
  const currency = money(
    { amount: '0', currency: value.currency },
    'limit currency',
  ).currency;
  if (currency !== 'GCU' || value.perUnit !== unit) {
    kernelInvalid('Limit price must use GCU per canonical commodity unit');
  }
  return Object.freeze({
    amount: render(amount),
    currency: 'GCU',
    perUnit: unit,
  });
}

function normalizedOrder(
  value: GlobalLimitOrder,
  occurredAt: WorldDecimalValue,
): GlobalLimitOrder {
  if (value.side !== 'BUY' && value.side !== 'SELL')
    kernelInvalid('Order side must be BUY or SELL');
  if (typeof value.allowPartialFill !== 'boolean')
    kernelInvalid('allowPartialFill must be boolean');
  const item = commodity(value.commodityId, 'order commodity');
  const total = exactQuantity(
    value.quantity,
    item.unit,
    'order quantity',
    true,
  );
  const minimum = exactQuantity(
    value.minimumFill,
    item.unit,
    'minimum fill',
    true,
  );
  if (minimum.greaterThan(total))
    kernelInvalid('Minimum fill exceeds order quantity');
  if (!value.allowPartialFill && !minimum.equals(total)) {
    kernelInvalid(
      'Non-partial order minimum fill must equal its total quantity',
    );
  }
  const deliveryStartAt = simTick(value.deliveryStartAt, 'deliveryStartAt');
  const deliveryEndAt = simTick(value.deliveryEndAt, 'deliveryEndAt');
  const expiresAt = simTick(value.expiresAt, 'expiresAt');
  if (
    deliveryStartAt.lessThan(occurredAt) ||
    deliveryEndAt.lessThan(deliveryStartAt)
  ) {
    kernelInvalid(
      'Delivery window must start at or after placement and end at or after start',
    );
  }
  if (!expiresAt.greaterThan(occurredAt))
    kernelInvalid('Order must expire after placement');
  if (value.side === 'BUY') {
    if (value.inventoryAccountRef !== null || value.reservationRef !== null) {
      kernelInvalid('BUY order cannot carry seller inventory reservation');
    }
  } else if (
    value.inventoryAccountRef === null ||
    value.reservationRef === null
  ) {
    kernelInvalid(
      'SELL order requires inventory account and unique reservation',
    );
  }
  return Object.freeze({
    orderRef: reference(value.orderRef, 'orderRef'),
    countryRef: reference(value.countryRef, 'order countryRef'),
    side: value.side,
    commodityId: item.id,
    quantity: renderQuantity(total, item.unit),
    limitPrice: limitPrice(value.limitPrice, item.unit),
    allowPartialFill: value.allowPartialFill,
    minimumFill: renderQuantity(minimum, item.unit),
    deliveryStartAt: renderQuantity(deliveryStartAt, 'sim_millisecond'),
    deliveryEndAt: renderQuantity(deliveryEndAt, 'sim_millisecond'),
    expiresAt: renderQuantity(expiresAt, 'sim_millisecond'),
    inventoryAccountRef:
      value.inventoryAccountRef === null
        ? null
        : reference(value.inventoryAccountRef, 'inventoryAccountRef'),
    reservationRef:
      value.reservationRef === null
        ? null
        : reference(value.reservationRef, 'reservationRef'),
  });
}

function normalizedCapacity(value: SellCapacityFact): SellCapacityFact {
  const item = commodity(value.commodityId, 'capacity commodity');
  return Object.freeze({
    accountRef: reference(value.accountRef, 'capacity accountRef'),
    countryRef: reference(value.countryRef, 'capacity countryRef'),
    commodityId: item.id,
    availableToReserve: renderQuantity(
      exactQuantity(value.availableToReserve, item.unit, 'availableToReserve'),
      item.unit,
    ),
    existingReservationRefs: distinctReferences(
      value.existingReservationRefs,
      'existingReservationRefs',
    ),
  });
}

function compare(left: WorldDecimalValue, right: WorldDecimalValue): number {
  return left.lessThan(right) ? -1 : left.greaterThan(right) ? 1 : 0;
}

function min(
  left: WorldDecimalValue,
  right: WorldDecimalValue,
): WorldDecimalValue {
  return left.lessThan(right) ? left : right;
}

function candidateOrder(
  left: MutableOrder,
  right: MutableOrder,
  incomingSide: GlobalLimitOrder['side'],
): number {
  const leftPrice = positive(left.order.limitPrice.amount, 'limit price');
  const rightPrice = positive(right.order.limitPrice.amount, 'limit price');
  const price = compare(leftPrice, rightPrice);
  if (price !== 0) return incomingSide === 'BUY' ? price : -price;
  const time = compare(left.placedAt, right.placedAt);
  if (time !== 0) return time;
  const seq = compare(left.sequence, right.sequence);
  if (seq !== 0) return seq;
  return left.order.orderRef < right.order.orderRef
    ? -1
    : left.order.orderRef > right.order.orderRef
      ? 1
      : 0;
}

function compatible(incoming: MutableOrder, resting: MutableOrder): boolean {
  if (resting.status !== 'OPEN' || resting.order.side === incoming.order.side)
    return false;
  if (
    resting.order.commodityId !== incoming.order.commodityId ||
    resting.order.countryRef === incoming.order.countryRef
  )
    return false;
  const bid = incoming.order.side === 'BUY' ? incoming.order : resting.order;
  const ask = incoming.order.side === 'SELL' ? incoming.order : resting.order;
  if (
    positive(bid.limitPrice.amount, 'bid').lessThan(
      positive(ask.limitPrice.amount, 'ask'),
    )
  )
    return false;
  const start = simTick(incoming.order.deliveryStartAt, 'deliveryStartAt');
  const otherStart = simTick(resting.order.deliveryStartAt, 'deliveryStartAt');
  const end = simTick(incoming.order.deliveryEndAt, 'deliveryEndAt');
  const otherEnd = simTick(resting.order.deliveryEndAt, 'deliveryEndAt');
  return !(start.greaterThan(otherStart) ? start : otherStart).greaterThan(
    end.lessThan(otherEnd) ? end : otherEnd,
  );
}

function movement(input: {
  readonly ref: string;
  readonly order: MutableOrder;
  readonly kind: ReservationMovement['kind'];
  readonly before: WorldDecimalValue;
  readonly delta: WorldDecimalValue;
  readonly availableBefore: WorldDecimalValue;
  readonly availableAfter: WorldDecimalValue;
}): ReservationMovement {
  const unit = commodity(
    input.order.order.commodityId,
    'movement commodity',
  ).unit;
  const after = input.before.plus(input.delta);
  if (after.isNegative() || input.availableAfter.isNegative())
    kernelInvalid('Reservation movement cannot make stock negative');
  const reservationRef = input.order.order.reservationRef;
  const inventoryAccountRef = input.order.order.inventoryAccountRef;
  if (reservationRef === null || inventoryAccountRef === null)
    kernelInvalid('Reservation movement requires SELL order');
  return Object.freeze({
    movementRef: reference(input.ref, 'movementRef'),
    reservationRef,
    inventoryAccountRef,
    orderRef: input.order.order.orderRef,
    kind: input.kind,
    remainingBefore: renderQuantity(input.before, unit),
    delta: renderQuantity(input.delta, unit),
    remainingAfter: renderQuantity(after, unit),
    availableBefore: renderQuantity(input.availableBefore, unit),
    availableAfter: renderQuantity(input.availableAfter, unit),
  });
}

function bookOrder(value: MutableOrder): BookOrder {
  const unit = commodity(value.order.commodityId, 'book commodity').unit;
  return Object.freeze({
    order: value.order,
    placedAt: renderQuantity(value.placedAt, 'sim_millisecond'),
    sequence: value.sequence.toFixed(),
    remaining: renderQuantity(value.remaining, unit),
    status: value.status,
  });
}

/** Deterministically computes price/time fills and exact reservation evidence. */
export function calculateGlobalOrderBook(input: {
  readonly trace: OrderBookTraceRequest;
  readonly genesisFactRef: string;
  readonly capacityFacts: readonly OrderBookFact<SellCapacityFact>[];
  readonly actionFacts: readonly OrderBookFact<OrderBookAction>[];
  readonly outputRef: string;
}): GlobalOrderBookResult {
  const genesisFactRef = reference(input.genesisFactRef, 'genesisFactRef');
  const snapshotAt = simTick(input.trace.snapshotAt, 'snapshotAt');
  const capacities = new Map<string, MutableCapacity>();
  const reservationRefs = new Set<string>();
  for (const [index, fact] of input.capacityFacts.entries()) {
    foundationFactBinding(input.trace, fact, `capacityFacts[${index}]`);
    if (!fact.predecessorFactRefs.includes(genesisFactRef))
      kernelInvalid('Capacity fact must descend from genesis fact');
    const capacity = normalizedCapacity(
      foundationFactPayload(input.trace, fact, `capacityFacts[${index}]`),
    );
    if (capacities.has(capacity.accountRef))
      kernelInvalid('Inventory capacity account must be unique');
    for (const ref of capacity.existingReservationRefs) {
      if (reservationRefs.has(ref))
        kernelInvalid('Existing reservation reference must be globally unique');
      reservationRefs.add(ref);
    }
    capacities.set(capacity.accountRef, {
      fact: capacity,
      available: nonNegative(
        capacity.availableToReserve.amount,
        'availableToReserve',
      ),
    });
  }

  const orders = new Map<string, MutableOrder>();
  const fills: BookFill[] = [];
  const reservationMovements: ReservationMovement[] = [];
  const actionRefs = new Set<string>();
  let previousFactRef = genesisFactRef;
  let previousSequence: WorldDecimalValue | null = null;
  let previousTime: WorldDecimalValue | null = null;

  const release = (
    order: MutableOrder,
    ref: string,
    kind: 'RELEASE' | 'ALLOCATE_TO_FILL',
    amount: WorldDecimalValue,
  ): void => {
    if (order.reservationRemaining.lessThan(amount))
      kernelInvalid('Seller reservation cannot be consumed twice');
    const accountRef = order.order.inventoryAccountRef;
    if (accountRef === null)
      kernelInvalid('Seller reservation account is required');
    const capacity = capacities.get(accountRef);
    if (capacity === undefined)
      kernelInvalid('Seller reservation capacity fact is required');
    const before = order.reservationRemaining;
    const availableBefore = capacity.available;
    order.reservationRemaining = before.minus(amount);
    if (kind === 'RELEASE')
      capacity.available = capacity.available.plus(amount);
    reservationMovements.push(
      movement({
        ref,
        order,
        kind,
        before,
        delta: amount.negated(),
        availableBefore,
        availableAfter: capacity.available,
      }),
    );
  };

  const expire = (at: WorldDecimalValue, actionRef: string): void => {
    for (const order of orders.values()) {
      if (
        order.status !== 'OPEN' ||
        simTick(order.order.expiresAt, 'expiresAt').greaterThan(at)
      )
        continue;
      order.status = 'EXPIRED';
      if (order.order.side === 'SELL' && !order.remaining.isZero()) {
        release(
          order,
          `${actionRef}.${order.order.orderRef}.expiry`,
          'RELEASE',
          order.remaining,
        );
      }
    }
  };

  for (const [index, fact] of input.actionFacts.entries()) {
    foundationFactBinding(input.trace, fact, `actionFacts[${index}]`);
    if (!fact.predecessorFactRefs.includes(previousFactRef))
      kernelInvalid('Action fact predecessor chain is broken');
    if (capacities.has(fact.factRef))
      kernelInvalid('Action fact reference collides with capacity account');
    const action = foundationFactPayload(
      input.trace,
      fact,
      `actionFacts[${index}]`,
    );
    if (action.kind !== 'PLACE' && action.kind !== 'CANCEL')
      kernelInvalid('Order action kind must be PLACE or CANCEL');
    const actionRef = reference(action.actionRef, 'actionRef');
    if (actionRefs.has(actionRef))
      kernelInvalid('Order action reference must be unique');
    actionRefs.add(actionRef);
    const actionSequence = sequence(action.sequence);
    const at = simTick(action.occurredAt, 'action occurredAt');
    if (at.greaterThan(snapshotAt))
      kernelInvalid('Order action cannot occur after replay snapshot');
    if (
      previousSequence !== null &&
      !actionSequence.greaterThan(previousSequence)
    )
      kernelInvalid('Order action sequence must strictly increase');
    if (previousTime !== null && at.lessThan(previousTime))
      kernelInvalid('Order action time must not move backwards');
    previousSequence = actionSequence;
    previousTime = at;
    previousFactRef = fact.factRef;
    expire(at, actionRef);

    if (action.kind === 'CANCEL') {
      const order = orders.get(reference(action.orderRef, 'cancel orderRef'));
      if (order === undefined || order.status !== 'OPEN')
        kernelInvalid('Cancellation requires an open order');
      if (
        order.order.countryRef !==
        reference(action.countryRef, 'cancel countryRef')
      )
        kernelInvalid('Cancellation country must own the order');
      order.status = 'CANCELLED';
      if (order.order.side === 'SELL' && !order.remaining.isZero())
        release(order, `${actionRef}.release`, 'RELEASE', order.remaining);
      continue;
    }

    const normalized = normalizedOrder(action.order, at);
    if (orders.has(normalized.orderRef))
      kernelInvalid('Order reference must be unique across replay');
    const total = positive(normalized.quantity.amount, 'order quantity');
    const incoming: MutableOrder = {
      order: normalized,
      placedAt: at,
      sequence: actionSequence,
      remaining: total,
      status: 'OPEN',
      reservationRemaining: nonNegative('0', 'zero'),
    };
    if (normalized.side === 'SELL') {
      const accountRef = normalized.inventoryAccountRef;
      const reservationRef = normalized.reservationRef;
      if (accountRef === null || reservationRef === null)
        kernelInvalid('SELL order requires reservation');
      if (reservationRefs.has(reservationRef))
        kernelInvalid('Seller reservation reference already exists');
      const capacity = capacities.get(accountRef);
      if (
        capacity === undefined ||
        capacity.fact.countryRef !== normalized.countryRef ||
        capacity.fact.commodityId !== normalized.commodityId
      ) {
        kernelInvalid(
          'SELL reservation must match caller-attested inventory account and commodity',
        );
      }
      if (capacity.available.lessThan(total))
        kernelInvalid('SELL reservation exceeds available inventory');
      reservationRefs.add(reservationRef);
      const availableBefore = capacity.available;
      capacity.available = availableBefore.minus(total);
      incoming.reservationRemaining = total;
      reservationMovements.push(
        movement({
          ref: `${actionRef}.hold`,
          order: incoming,
          kind: 'HOLD',
          before: nonNegative('0', 'zero'),
          delta: total,
          availableBefore,
          availableAfter: capacity.available,
        }),
      );
    }
    orders.set(normalized.orderRef, incoming);

    const candidates = [...orders.values()]
      .filter((order) => order !== incoming && compatible(incoming, order))
      .sort((left, right) => candidateOrder(left, right, normalized.side));
    const plan: { resting: MutableOrder; amount: WorldDecimalValue }[] = [];
    let unfilled = total;
    for (const resting of candidates) {
      if (unfilled.isZero()) break;
      const amount = min(unfilled, resting.remaining);
      if (!resting.order.allowPartialFill && !amount.equals(resting.remaining))
        continue;
      if (
        amount.lessThan(
          positive(resting.order.minimumFill.amount, 'resting minimum fill'),
        )
      )
        continue;
      if (
        normalized.allowPartialFill &&
        amount.lessThan(
          positive(normalized.minimumFill.amount, 'incoming minimum fill'),
        )
      )
        continue;
      plan.push({ resting, amount });
      unfilled = unfilled.minus(amount);
    }
    if (!normalized.allowPartialFill && !unfilled.isZero()) continue;
    for (const { resting, amount } of plan) {
      const buyer = incoming.order.side === 'BUY' ? incoming : resting;
      const seller = incoming.order.side === 'SELL' ? incoming : resting;
      const unit = commodity(normalized.commodityId, 'fill commodity').unit;
      const sellerReservationRef = seller.order.reservationRef;
      if (sellerReservationRef === null)
        kernelInvalid('Matched seller reservation is required');
      const start = simTick(incoming.order.deliveryStartAt, 'deliveryStartAt');
      const otherStart = simTick(
        resting.order.deliveryStartAt,
        'deliveryStartAt',
      );
      const end = simTick(incoming.order.deliveryEndAt, 'deliveryEndAt');
      const otherEnd = simTick(resting.order.deliveryEndAt, 'deliveryEndAt');
      const fillRef = `${actionRef}.${resting.order.orderRef}.fill`;
      fills.push(
        Object.freeze({
          fillRef,
          buyOrderRef: buyer.order.orderRef,
          sellOrderRef: seller.order.orderRef,
          buyerCountryRef: buyer.order.countryRef,
          sellerCountryRef: seller.order.countryRef,
          commodityId: normalized.commodityId,
          quantity: renderQuantity(amount, unit),
          bidLimit: buyer.order.limitPrice,
          askLimit: seller.order.limitPrice,
          sellerReservationRef,
          deliveryStartAt: renderQuantity(
            start.greaterThan(otherStart) ? start : otherStart,
            'sim_millisecond',
          ),
          deliveryEndAt: renderQuantity(
            end.lessThan(otherEnd) ? end : otherEnd,
            'sim_millisecond',
          ),
          matchedAt: renderQuantity(at, 'sim_millisecond'),
        }),
      );
      incoming.remaining = incoming.remaining.minus(amount);
      resting.remaining = resting.remaining.minus(amount);
      if (incoming.remaining.isZero()) incoming.status = 'FILLED';
      if (resting.remaining.isZero()) resting.status = 'FILLED';
      release(seller, `${fillRef}.allocate`, 'ALLOCATE_TO_FILL', amount);
    }
  }

  // The returned book is measured at the supplied snapshot, even when no
  // later placement or cancellation action advances the replay clock.
  expire(snapshotAt, `${input.outputRef}.snapshot`);

  const output = Object.freeze({
    orders: Object.freeze([...orders.values()].map(bookOrder)),
    fills: Object.freeze(fills),
    reservationMovements: Object.freeze(reservationMovements),
    capacities: Object.freeze(
      [...capacities.values()].map((capacity) =>
        Object.freeze({
          accountRef: capacity.fact.accountRef,
          commodityId: capacity.fact.commodityId,
          availableToReserve: renderQuantity(
            capacity.available,
            commodity(capacity.fact.commodityId, 'capacity commodity').unit,
          ),
        }),
      ),
    ),
  });
  const allFacts: readonly FoundationFact<unknown>[] = [
    ...input.capacityFacts,
    ...input.actionFacts,
  ];
  const inputFacts = Object.freeze(
    allFacts.map((fact, index) =>
      foundationFactBinding(input.trace, fact, `inputFacts[${index}]`),
    ),
  );
  const factRefs = distinctReferences(
    inputFacts.map((fact) => fact.factRef),
    'input fact references',
  );
  if (factRefs.length !== inputFacts.length)
    kernelInvalid('Replay input fact references must be unique');
  const proofBody = {
    module: 'V21_GLOBAL_ORDER_BOOK' as const,
    traceRef: reference(input.trace.traceRef, 'traceRef'),
    calculationVersion: reference(
      input.trace.calculationVersion,
      'calculationVersion',
    ),
    snapshot: input.trace.snapshot,
    snapshotAt: renderQuantity(snapshotAt, 'sim_millisecond'),
    genesisFactRef,
    inputFacts,
    outputRef: reference(input.outputRef, 'outputRef'),
    canonicalOutput: canonicalSerialize(output),
  };
  return Object.freeze({
    foundationStatus: GLOBAL_ORDER_BOOK_FOUNDATION_STATUS,
    ...output,
    replayProof: Object.freeze({
      ...proofBody,
      hashInput: canonicalHashInput(proofBody),
    }),
  });
}

/** Replays from the same immutable facts and compares the entire canonical proof. */
export function assertGlobalOrderBookReplayEvidence(input: {
  readonly proof: OrderBookReplayProof;
  readonly capacityFacts: readonly OrderBookFact<SellCapacityFact>[];
  readonly actionFacts: readonly OrderBookFact<OrderBookAction>[];
}): void {
  const replayed = calculateGlobalOrderBook({
    trace: {
      traceRef: input.proof.traceRef,
      calculationVersion: input.proof.calculationVersion,
      snapshot: input.proof.snapshot,
      snapshotAt: input.proof.snapshotAt,
    },
    genesisFactRef: input.proof.genesisFactRef,
    capacityFacts: input.capacityFacts,
    actionFacts: input.actionFacts,
    outputRef: input.proof.outputRef,
  });
  if (
    canonicalSerialize(replayed.replayProof) !== canonicalSerialize(input.proof)
  ) {
    kernelInvalid(
      'Global order book replay proof does not match supplied facts',
    );
  }
}
