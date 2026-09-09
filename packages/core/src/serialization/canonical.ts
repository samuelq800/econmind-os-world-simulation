import { types as nodeTypes } from 'node:util';

import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { isMoney } from '../numeric/money.js';
import { isPrice } from '../numeric/price.js';
import { isQuantity } from '../numeric/quantity.js';
import { isRate } from '../numeric/rate.js';
import { isSimTime } from '../numeric/sim-time.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';

export const CANONICAL_HASH_ALGORITHM = 'SHA-256' as const;

const NO_DOMAIN_ADAPTER = Symbol('NO_DOMAIN_ADAPTER');

function rejected(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.SERIALIZATION_REJECTED, message);
}

function trustedDomainValue(value: object): unknown | typeof NO_DOMAIN_ADAPTER {
  if (isMoney(value)) {
    return { amount: canonicalDecimal(value.amount), currency: value.currency };
  }
  if (isQuantity(value)) {
    return { amount: canonicalDecimal(value.amount), unit: value.unit };
  }
  if (isPrice(value)) {
    return {
      amount: canonicalDecimal(value.amount),
      currency: value.currency,
      perUnit: value.perUnit,
    };
  }
  if (isRate(value)) return canonicalDecimal(value.value);
  if (isSimTime(value)) return value.ticks.toString();
  return NO_DOMAIN_ADAPTER;
}

function ownDescriptors(value: object): PropertyDescriptorMap {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    rejected('Canonical serialization rejects uninspectable objects');
  }
}

function normalizeArray(
  value: readonly unknown[],
  seen: Set<object>,
): unknown[] {
  const descriptors = ownDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') {
      rejected('Canonical serialization rejects symbol properties');
    }
    if (key === 'length') continue;
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      rejected('Canonical serialization rejects accessors');
    }
    if (!descriptor.enumerable || !/^(?:0|[1-9]\d*)$/u.test(key)) {
      rejected(
        'Canonical serialization rejects non-canonical array properties',
      );
    }
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      rejected('Canonical serialization rejects sparse arrays');
    }
    result.push(normalize(descriptor.value, seen));
  }
  return result;
}

function normalizeRecord(value: object, seen: Set<object>): object {
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    rejected('Canonical serialization rejects uninspectable objects');
  }
  if (prototype !== Object.prototype) {
    rejected('Canonical serialization accepts plain domain records only');
  }
  const descriptors = ownDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === 'symbol')) {
    rejected('Canonical serialization rejects symbol properties');
  }
  return Object.fromEntries(
    (keys as string[]).sort().map((key) => {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        rejected('Canonical serialization rejects accessors');
      }
      if (!descriptor.enumerable) {
        rejected('Canonical serialization rejects hidden record state');
      }
      return [key, normalize(descriptor.value, seen)];
    }),
  );
}

function normalize(value: unknown, seen: Set<object>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    rejected(`Canonical serialization rejects ${typeof value}`);
  }
  // ECMAScript reflection operations can execute Proxy traps. Node's native
  // identity check does not inspect the target and therefore rejects first.
  if (nodeTypes.isProxy(value)) {
    rejected('Canonical serialization rejects Proxy objects');
  }
  if (seen.has(value)) {
    rejected('Canonical serialization rejects cyclic values');
  }
  seen.add(value);
  try {
    const adapted = trustedDomainValue(value);
    if (adapted !== NO_DOMAIN_ADAPTER) return normalize(adapted, seen);
    let array: boolean;
    try {
      array = Array.isArray(value);
    } catch {
      rejected('Canonical serialization rejects uninspectable objects');
    }
    if (array) return normalizeArray(value as readonly unknown[], seen);
    return normalizeRecord(value, seen);
  } finally {
    seen.delete(value);
  }
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()));
}

export function canonicalHashInput(value: unknown): string {
  return `${CANONICAL_HASH_ALGORITHM}\n${canonicalSerialize(value)}`;
}
