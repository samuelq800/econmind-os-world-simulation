import fc from 'fast-check';

import { Money, Price, Quantity, Rate } from '../../core/src/index.js';

const MAX_MAGNITUDE = 10n ** 30n;

export const canonicalDecimalStringArbitrary = fc
  .tuple(
    fc.boolean(),
    fc.bigInt({ min: 0n, max: MAX_MAGNITUDE }),
    fc.option(
      fc
        .array(fc.integer({ min: 0, max: 9 }), {
          maxLength: 18,
          minLength: 1,
        })
        .filter((digits) => digits.at(-1) !== 0),
      { nil: undefined },
    ),
  )
  .map(([negative, integer, fraction]) => {
    const sign = negative && integer !== 0n ? '-' : '';
    const fractional = fraction ? `.${fraction.join('')}` : '';
    return `${sign}${integer}${fractional}`;
  });

export const invalidDecimalStringArbitrary = fc.oneof(
  fc.constantFrom(
    '',
    ' ',
    'NaN',
    'Infinity',
    '-Infinity',
    '+1',
    '.1',
    '1.',
    '01',
    '1e3',
    '1,000',
    '--1',
  ),
  canonicalDecimalStringArbitrary.map((value) => ` ${value}`),
  canonicalDecimalStringArbitrary.map((value) => `${value} `),
  canonicalDecimalStringArbitrary.map((value) => `${value}e2`),
);

export const currencyArbitrary = fc.constantFrom('GBP', 'USD', 'EUR');
export const quantityUnitArbitrary = fc.constantFrom(
  'barrel',
  'MMBtu',
  'tonne',
  'equipment unit',
);

export const moneyArbitrary = fc
  .tuple(canonicalDecimalStringArbitrary, currencyArbitrary)
  .map(([amount, currency]) => Money.from(amount, currency));

export const quantityArbitrary = fc
  .tuple(canonicalDecimalStringArbitrary, quantityUnitArbitrary)
  .map(([amount, unit]) => Quantity.from(amount, unit));

export const rateArbitrary = fc
  .integer({ min: 0, max: 1_000_000 })
  .map((parts) =>
    Rate.from(
      parts === 1_000_000 ? '1' : `0.${String(parts).padStart(6, '0')}`,
    ),
  );

export const priceAndQuantityArbitrary = fc
  .tuple(
    canonicalDecimalStringArbitrary,
    canonicalDecimalStringArbitrary,
    currencyArbitrary,
    quantityUnitArbitrary,
  )
  .map(([price, quantity, currency, unit]) => ({
    price: Price.from(price, currency, unit),
    quantity: Quantity.from(quantity, unit),
  }));

export const canonicalIdArbitrary = fc
  .tuple(
    fc.constantFrom(
      'WORLD',
      'COUNTRY',
      'OFFICE',
      'ACTOR',
      'USER',
      'TEAM',
      'COMMODITY',
      'TECHNOLOGY',
      'PROJECT',
      'ENGINE',
    ),
    fc.integer({ min: 1, max: 999_999 }),
  )
  .map(([prefix, number]) => `${prefix}_${number}`);
