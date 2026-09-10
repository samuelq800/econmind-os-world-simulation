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
  const exponent = Number(match[4] ?? '0');
  if (!Number.isSafeInteger(exponent)) {
    throw new RangeError('LOSSLESS_NUMBER_EXPONENT_OUT_OF_RANGE');
  }
  const digits = `${integer}${fraction}`;
  const decimalPosition = integer.length + exponent;
  const expandedLength = Math.max(
    digits.length,
    decimalPosition,
    1 - decimalPosition,
  );
  if (expandedLength > MAX_EXPANDED_DIGITS) {
    throw new RangeError('LOSSLESS_NUMBER_EXPANSION_LIMIT');
  }

  let expanded: string;
  if (decimalPosition <= 0) {
    expanded = `0.${'0'.repeat(-decimalPosition)}${digits}`;
  } else if (decimalPosition >= digits.length) {
    expanded = `${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
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
