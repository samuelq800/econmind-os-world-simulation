const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

interface Parts {
  readonly coefficient: bigint;
  readonly scale: number;
}

function parse(value: string): Parts {
  if (!DECIMAL.test(value) || value === '-0') {
    throw new TypeError(`Invalid canonical decimal: ${value}`);
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${negative ? '-' : ''}${integer}${fraction}`);
  return { coefficient, scale: fraction.length };
}

function power10(scale: number): bigint {
  return 10n ** BigInt(scale);
}

function format(coefficient: bigint, scale: number): string {
  if (coefficient === 0n) return '0';
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient)
    .toString()
    .padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  const integer = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction.length > 0 ? `.${fraction}` : ''}`;
}

function align(left: Parts, right: Parts): readonly [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * power10(scale - left.scale),
    right.coefficient * power10(scale - right.scale),
    scale,
  ];
}

export function assertCanonicalDecimal(value: string): string {
  const parsed = parse(value);
  if (format(parsed.coefficient, parsed.scale) !== value) {
    throw new TypeError(`Decimal is not in canonical form: ${value}`);
  }
  return value;
}

export function addDecimal(left: string, right: string): string {
  const [a, b, scale] = align(parse(left), parse(right));
  return format(a + b, scale);
}

export function subtractDecimal(left: string, right: string): string {
  const [a, b, scale] = align(parse(left), parse(right));
  return format(a - b, scale);
}

export function multiplyDecimal(left: string, right: string): string {
  const a = parse(left);
  const b = parse(right);
  return format(a.coefficient * b.coefficient, a.scale + b.scale);
}

export function divideDecimalExactly(left: string, right: string): string {
  const a = parse(left);
  const b = parse(right);
  if (b.coefficient === 0n) throw new RangeError('Division by zero');
  let numerator = a.coefficient * power10(b.scale);
  let denominator = b.coefficient * power10(a.scale);
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const gcd = (leftValue: bigint, rightValue: bigint): bigint => {
    let x = leftValue < 0n ? -leftValue : leftValue;
    let y = rightValue < 0n ? -rightValue : rightValue;
    while (y !== 0n) [x, y] = [y, x % y];
    return x;
  };
  const divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  let twos = 0;
  let fives = 0;
  let reduced = denominator;
  while (reduced % 2n === 0n) {
    reduced /= 2n;
    twos += 1;
  }
  while (reduced % 5n === 0n) {
    reduced /= 5n;
    fives += 1;
  }
  if (reduced !== 1n) {
    throw new RangeError('CALIBRATION_ROUNDING_POLICY_REQUIRED');
  }
  const scale = Math.max(twos, fives);
  const scaled = numerator * power10(scale);
  return format(scaled / denominator, scale);
}
