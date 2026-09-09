import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  Money,
  Price,
  Quantity,
  WORLD_DECIMAL_OPERAND_MAX_DIGITS,
  WORLD_DECIMAL_RESULT_MAX_DIGITS,
  canonicalDecimal,
  parseWorldDecimal,
} from '../../packages/core/src/index.js';
import {
  exactDecimalAdd,
  exactDecimalMultiply,
  exactDecimalSubtract,
} from '../../packages/testkit/src/exact-decimal-oracle.js';

const nines = (length: number) => '9'.repeat(length);

describe('GATEA-BLK-02 exact-or-reject arithmetic', () => {
  it.each([1, 79, 80, 81, 119, 120])(
    'accepts and preserves a %i-digit operand exactly',
    (digits) => {
      const input = nines(digits);
      expect(canonicalDecimal(parseWorldDecimal(input))).toBe(input);
    },
  );

  it('publishes separate operand, arithmetic, and result bounds', () => {
    expect(WORLD_DECIMAL_OPERAND_MAX_DIGITS).toBe(120);
    expect(WORLD_DECIMAL_RESULT_MAX_DIGITS).toBe(120);
  });

  it('handles large carry and borrow exactly at the result-domain edge', () => {
    const carryLeft = nines(119);
    const carry = Money.from(carryLeft, 'GBP').add(Money.from('1', 'GBP'));
    expect(carry.toCanonicalValue().amount).toBe(
      exactDecimalAdd(carryLeft, '1'),
    );

    const borrowLeft = `1${'0'.repeat(119)}`;
    const borrow = Money.from(borrowLeft, 'GBP').subtract(
      Money.from('1', 'GBP'),
    );
    expect(borrow.toCanonicalValue().amount).toBe(
      exactDecimalSubtract(borrowLeft, '1'),
    );
  });

  it.each([40, 41, 60])(
    'multiplies %i by %i digits against the independent BigInt oracle',
    (digits) => {
      const left = nines(digits);
      const right = nines(digits);
      const result = Price.from(left, 'GBP', 'tonne')
        .multiply(Quantity.from(right, 'tonne'))
        .toCanonicalValue().amount;
      expect(result).toBe(exactDecimalMultiply(left, right));
    },
  );

  it('closes both reviewer precision reproductions', () => {
    const oneHundredTwentyDigits = nines(120);
    expect(() =>
      Money.from(oneHundredTwentyDigits, 'GBP').add(Money.from('1', 'GBP')),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.DECIMAL_RESULT_OUT_OF_RANGE,
      }),
    );

    const left = '12345678901234567890123456789012345678901';
    const right = '98765432109876543210987654321098765432109';
    expect(
      Price.from(left, 'GBP', 'unit')
        .multiply(Quantity.from(right, 'unit'))
        .toCanonicalValue().amount,
    ).toBe(exactDecimalMultiply(left, right));
  });

  it('rejects exact products outside the 120-digit result domain', () => {
    const operand = nines(120);
    expect(() =>
      Price.from(operand, 'GBP', 'unit').multiply(
        Quantity.from(operand, 'unit'),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.DECIMAL_RESULT_OUT_OF_RANGE,
      }),
    );
  });
});
