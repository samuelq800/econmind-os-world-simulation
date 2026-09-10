import { assertCanonicalDecimal } from './decimal.js';

export interface LosslessJsonNumber {
  readonly kind: 'LOSSLESS_JSON_NUMBER';
  readonly raw: string;
}

export interface LosslessJsonObject {
  readonly [key: string]: LosslessJsonValue;
}

export interface LosslessJsonArray extends ReadonlyArray<LosslessJsonValue> {
  readonly length: number;
}

export type LosslessJsonValue =
  | null
  | boolean
  | string
  | LosslessJsonNumber
  | LosslessJsonArray
  | LosslessJsonObject;

const NUMBER_TOKEN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
const NUMBER_PARTS = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u;
const MAX_EXPANDED_DIGITS = 10_000;
const MAX_EXPANDED_DIGITS_BIGINT = BigInt(MAX_EXPANDED_DIGITS);
const MAX_PROVIDER_EXPONENT_MAGNITUDE = MAX_EXPANDED_DIGITS_BIGINT + 1n;
const EXPONENT_PARTS = /^([+-]?)(\d+)$/u;
const DECIMAL_DIGIT_VALUE: Readonly<Record<string, number>> = Object.freeze({
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
});

function maxBigInt(...values: readonly bigint[]): bigint {
  return values.reduce((maximum, value) => (value > maximum ? value : maximum));
}

function parseBoundedProviderExponent(raw: string | undefined): bigint {
  if (raw === undefined) return 0n;
  const match = raw.match(EXPONENT_PARTS);
  if (match === null) throw new TypeError('INVALID_PROVIDER_NUMBER_EXPONENT');
  const sign = match[1] === '-' ? -1n : 1n;
  const magnitudeText = (match[2] ?? '0').replace(/^0+/u, '') || '0';
  const maximumTextLength = MAX_PROVIDER_EXPONENT_MAGNITUDE.toString().length;
  if (magnitudeText.length > maximumTextLength) {
    throw new RangeError('LOSSLESS_NUMBER_EXPONENT_OUT_OF_RANGE');
  }
  const magnitude = BigInt(magnitudeText);
  if (magnitude > MAX_PROVIDER_EXPONENT_MAGNITUDE) {
    throw new RangeError('LOSSLESS_NUMBER_EXPONENT_OUT_OF_RANGE');
  }
  return sign * magnitude;
}

function boundedBigIntToIndex(value: bigint): number {
  if (
    value < -MAX_EXPANDED_DIGITS_BIGINT ||
    value > MAX_EXPANDED_DIGITS_BIGINT
  ) {
    throw new RangeError('LOSSLESS_NUMBER_EXPANSION_LIMIT');
  }
  const negative = value < 0n;
  const magnitude = (negative ? -value : value).toString();
  let index = 0;
  for (const character of magnitude) {
    const digit = DECIMAL_DIGIT_VALUE[character];
    if (digit === undefined) throw new TypeError('INVALID_BIGINT_DIGIT');
    index = index * 10 + digit;
  }
  return negative ? -index : index;
}

export function isLosslessJsonNumber(
  value: unknown,
): value is LosslessJsonNumber {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'LOSSLESS_JSON_NUMBER' &&
    typeof (value as { raw?: unknown }).raw === 'string'
  );
}

export function canonicalDecimalFromJsonNumber(raw: string): string {
  const match = raw.match(NUMBER_PARTS);
  if (match === null)
    throw new TypeError(`INVALID_PROVIDER_NUMBER_TOKEN:${raw}`);
  const negative = match[1] === '-';
  const integer = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const exponent = parseBoundedProviderExponent(match[4]);
  const digits = `${integer}${fraction}`;
  const decimalPosition = BigInt(integer.length) + exponent;
  const expandedLength = maxBigInt(
    BigInt(digits.length),
    decimalPosition,
    1n - decimalPosition,
  );
  if (expandedLength > MAX_EXPANDED_DIGITS_BIGINT) {
    throw new RangeError('LOSSLESS_NUMBER_EXPANSION_LIMIT');
  }
  const decimalIndex = boundedBigIntToIndex(decimalPosition);

  let expanded: string;
  if (decimalIndex <= 0) {
    expanded = `0.${'0'.repeat(-decimalIndex)}${digits}`;
  } else if (decimalIndex >= digits.length) {
    expanded = `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }

  const [rawInteger = '0', rawFraction = ''] = expanded.split('.');
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/u, '');
  const normalizedFraction = rawFraction.replace(/0+$/u, '');
  const magnitude = `${normalizedInteger}${normalizedFraction}`.replace(
    /[.0]/gu,
    '',
  );
  const canonical = `${negative && magnitude.length > 0 ? '-' : ''}${normalizedInteger}${
    normalizedFraction.length > 0 ? `.${normalizedFraction}` : ''
  }`;
  return assertCanonicalDecimal(canonical);
}

export function parseLosslessJson(bytes: Uint8Array): LosslessJsonValue {
  const source = new TextDecoder('utf8', { fatal: true }).decode(bytes);
  let index = 0;

  const fail = (message: string): never => {
    throw new SyntaxError(
      `LOSSLESS_JSON_PARSE_ERROR:${message}:offset=${index}`,
    );
  };
  const whitespace = (): void => {
    while (
      source[index] === ' ' ||
      source[index] === '\t' ||
      source[index] === '\n' ||
      source[index] === '\r'
    ) {
      index += 1;
    }
  };
  const parseString = (): string => {
    const start = index;
    if (source[index] !== '"') fail('expected-string');
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === '\\') {
        index += 2;
        continue;
      }
      if (character === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index)) as string;
      }
      if ((character?.charCodeAt(0) ?? 0) < 0x20) fail('control-character');
      index += 1;
    }
    return fail('unterminated-string');
  };
  const parseValue = (): LosslessJsonValue => {
    whitespace();
    const character = source[index];
    if (character === '"') return parseString();
    if (character === '[') {
      index += 1;
      const values: LosslessJsonValue[] = [];
      whitespace();
      if (source[index] === ']') {
        index += 1;
        return values;
      }
      while (true) {
        values.push(parseValue());
        whitespace();
        if (source[index] === ']') {
          index += 1;
          return values;
        }
        if (source[index] !== ',') fail('expected-array-delimiter');
        index += 1;
      }
    }
    if (character === '{') {
      index += 1;
      const value: Record<string, LosslessJsonValue> = {};
      whitespace();
      if (source[index] === '}') {
        index += 1;
        return value;
      }
      while (true) {
        whitespace();
        const key = parseString();
        if (Object.hasOwn(value, key)) fail(`duplicate-object-key:${key}`);
        whitespace();
        if (source[index] !== ':') fail('expected-object-colon');
        index += 1;
        value[key] = parseValue();
        whitespace();
        if (source[index] === '}') {
          index += 1;
          return value;
        }
        if (source[index] !== ',') fail('expected-object-delimiter');
        index += 1;
      }
    }
    for (const [token, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (source.startsWith(token, index)) {
        index += token.length;
        return value;
      }
    }
    const number = source.slice(index).match(NUMBER_TOKEN)?.[0];
    if (number !== undefined) {
      index += number.length;
      return Object.freeze({ kind: 'LOSSLESS_JSON_NUMBER', raw: number });
    }
    return fail('unexpected-token');
  };

  const value = parseValue();
  whitespace();
  if (index !== source.length) fail('trailing-content');
  return value;
}

export function losslessObject(
  value: LosslessJsonValue,
  context: string,
): Readonly<Record<string, LosslessJsonValue>> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    isLosslessJsonNumber(value)
  ) {
    throw new TypeError(`${context} must be an object`);
  }
  return value as LosslessJsonObject;
}

export function losslessArray(
  value: LosslessJsonValue,
  context: string,
): readonly LosslessJsonValue[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array`);
  return value;
}

export function losslessString(
  value: LosslessJsonValue,
  context: string,
): string {
  if (typeof value !== 'string')
    throw new TypeError(`${context} must be a string`);
  return value;
}

export function losslessScalarText(
  value: LosslessJsonValue,
  context: string,
): string {
  if (typeof value === 'string') return value;
  if (isLosslessJsonNumber(value))
    return canonicalDecimalFromJsonNumber(value.raw);
  throw new TypeError(`${context} must be a string or number token`);
}

export function rawNumberToken(
  value: LosslessJsonValue,
  context: string,
): string | null {
  if (value === null) return null;
  if (isLosslessJsonNumber(value)) return value.raw;
  if (typeof value === 'string') return value;
  throw new TypeError(
    `${context} must be a number token, decimal string, or null`,
  );
}

export function canonicalDecimalValue(
  value: LosslessJsonValue,
  context: string,
): string | null {
  if (value === null) return null;
  if (isLosslessJsonNumber(value))
    return canonicalDecimalFromJsonNumber(value.raw);
  if (typeof value === 'string') return assertCanonicalDecimal(value);
  throw new TypeError(
    `${context} must be a number token, decimal string, or null`,
  );
}
