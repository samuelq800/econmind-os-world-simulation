import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  WORLD_DECIMAL_RESULT_MAX_DIGITS,
  CanonicalRegistry,
  Money,
  Price,
  Quantity,
  canonicalDecimal,
  canonicalSerialize,
  parseWorldDecimal,
  worldId,
} from '../../packages/core/src/index.js';
import {
  acceptedDecimalBoundaryArbitrary,
  canonicalDecimalStringArbitrary,
  canonicalIdArbitrary,
  currencyArbitrary,
  invalidDecimalStringArbitrary,
  priceAndQuantityArbitrary,
  quantityUnitArbitrary,
} from '../../packages/testkit/src/arbitraries.js';
import {
  exactDecimalAdd,
  exactDecimalDigitCount,
  exactDecimalMultiply,
} from '../../packages/testkit/src/exact-decimal-oracle.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

describe('V04 reproducible canonical properties', () => {
  it('is exact-or-reject across the accepted addition boundary', () => {
    fc.assert(
      fc.property(
        acceptedDecimalBoundaryArbitrary,
        acceptedDecimalBoundaryArbitrary,
        (left, right) => {
          const expected = exactDecimalAdd(left, right);
          if (
            exactDecimalDigitCount(expected) > WORLD_DECIMAL_RESULT_MAX_DIGITS
          ) {
            expect(() =>
              Money.from(left, 'GBP').add(Money.from(right, 'GBP')),
            ).toThrow();
          } else {
            expect(
              Money.from(left, 'GBP')
                .add(Money.from(right, 'GBP'))
                .toCanonicalValue().amount,
            ).toBe(expected);
          }
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('is exact-or-reject across the accepted multiplication boundary', () => {
    fc.assert(
      fc.property(
        acceptedDecimalBoundaryArbitrary,
        acceptedDecimalBoundaryArbitrary,
        (left, right) => {
          const expected = exactDecimalMultiply(left, right);
          const operation = () =>
            Price.from(left, 'GBP', 'unit').multiply(
              Quantity.from(right, 'unit'),
            );
          if (
            exactDecimalDigitCount(expected) > WORLD_DECIMAL_RESULT_MAX_DIGITS
          ) {
            expect(operation).toThrow();
          } else {
            expect(operation().toCanonicalValue().amount).toBe(expected);
          }
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('round-trips canonical decimal values', () => {
    fc.assert(
      fc.property(canonicalDecimalStringArbitrary, (input) => {
        const first = parseWorldDecimal(input);
        const serialized = canonicalDecimal(first);
        const second = parseWorldDecimal(serialized);
        expect(second.equals(first)).toBe(true);
      }),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('keeps Money and Quantity addition inside canonical decimal types', () => {
    fc.assert(
      fc.property(
        canonicalDecimalStringArbitrary,
        canonicalDecimalStringArbitrary,
        currencyArbitrary,
        quantityUnitArbitrary,
        (left, right, currency, unit) => {
          const money = Money.from(left, currency).add(
            Money.from(right, currency),
          );
          const quantity = Quantity.from(left, unit).add(
            Quantity.from(right, unit),
          );
          expect(typeof money.toCanonicalValue().amount).toBe('string');
          expect(typeof quantity.toCanonicalValue().amount).toBe('string');
          expect(money.amount.plus(0).equals(money.amount)).toBe(true);
          expect(quantity.amount.plus(0).equals(quantity.amount)).toBe(true);
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('keeps Price multiplied by Quantity as exact Money', () => {
    fc.assert(
      fc.property(priceAndQuantityArbitrary, ({ price, quantity }) => {
        const money = price.multiply(quantity);
        expect(typeof money.toCanonicalValue().amount).toBe('string');
        expect(money.amount.equals(price.amount.times(quantity.amount))).toBe(
          true,
        );
      }),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('deterministically rejects invalid decimal syntax and non-finite attacks', () => {
    fc.assert(
      fc.property(invalidDecimalStringArbitrary, (input) => {
        expect(() => parseWorldDecimal(input)).toThrow();
        expect(() => parseWorldDecimal(input)).toThrow();
      }),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('rejects duplicate registry IDs for generated canonical IDs', () => {
    fc.assert(
      fc.property(canonicalIdArbitrary, (id) => {
        expect(
          () => new CanonicalRegistry('property', [{ id }, { id }]),
        ).toThrow();
        expect(worldId(id)).toBe(id);
      }),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('serializes the same domain record identically across repetitions', () => {
    fc.assert(
      fc.property(
        canonicalDecimalStringArbitrary,
        currencyArbitrary,
        (amount, currency) => {
          const value = { money: Money.from(amount, currency), id: 'VALUE_1' };
          const first = canonicalSerialize(value);
          expect(canonicalSerialize(value)).toBe(first);
          expect(canonicalSerialize({ money: value.money, id: value.id })).toBe(
            first,
          );
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });
});
