import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';

export const CANONICAL_HASH_ALGORITHM = 'SHA-256' as const;

interface CanonicalValueProvider {
  toCanonicalValue(): unknown;
}

function isProvider(value: object): value is CanonicalValueProvider {
  return (
    'toCanonicalValue' in value && typeof value.toCanonicalValue === 'function'
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
    throw new DomainError(
      DOMAIN_ERROR_CODES.SERIALIZATION_REJECTED,
      `Canonical serialization rejects ${typeof value}`,
    );
  }
  if (seen.has(value)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SERIALIZATION_REJECTED,
      'Canonical serialization rejects cyclic values',
    );
  }
  seen.add(value);
  try {
    if (isProvider(value)) return normalize(value.toCanonicalValue(), seen);
    if (Array.isArray(value)) return value.map((item) => normalize(item, seen));
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.SERIALIZATION_REJECTED,
        'Canonical serialization accepts plain domain records only',
      );
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          normalize((value as Record<string, unknown>)[key], seen),
        ]),
    );
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
