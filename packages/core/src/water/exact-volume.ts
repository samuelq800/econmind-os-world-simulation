import {
  kernelInvalid,
  nonNegative,
  type ExactQuantity,
} from '../engine-kernels/common.js';

/** Water interval budgets are exact rational m3: Gregorian month lengths do
 * not generally divide decimal monthly volumes. This is not a new decimal
 * policy or a commodity inventory. Projection into ExactQuantity is explicit. */
export interface WaterFraction {
  readonly numerator: string;
  readonly denominator: string;
}
export interface WaterVolume extends WaterFraction {
  readonly unit: 'm3';
}
const INTEGER = /^(?:0|[1-9]\d*)$/u;
const MAX_DIGITS = 480;
function integer(s: string, label: string) {
  if (typeof s !== 'string' || !INTEGER.test(s) || s.length > MAX_DIGITS)
    kernelInvalid(`${label} must be a bounded canonical nonnegative integer`);
  return BigInt(s);
}
function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
export function waterFraction(
  numerator: string,
  denominator: string,
): WaterFraction {
  const n = integer(numerator, 'water numerator');
  const d = integer(denominator, 'water denominator');
  if (d === 0n) kernelInvalid('Water denominator must be positive');
  const factor = gcd(n, d);
  return Object.freeze({
    numerator: (n / factor).toString(),
    denominator: (d / factor).toString(),
  });
}
export function waterVolume(
  numerator: string,
  denominator: string,
): WaterVolume {
  return Object.freeze({
    ...waterFraction(numerator, denominator),
    unit: 'm3',
  });
}
export function assertWaterVolume(v: WaterVolume) {
  if (!v || v.unit !== 'm3') kernelInvalid('Water volume must use m3');
  const canonical = waterVolume(v.numerator, v.denominator);
  if (
    canonical.numerator !== v.numerator ||
    canonical.denominator !== v.denominator
  )
    kernelInvalid('Water fraction must be reduced');
}
export function volumeFromDecimal(amount: string): WaterVolume {
  return Object.freeze({ ...waterScalarFromDecimal(amount), unit: 'm3' });
}
export function waterScalarFromDecimal(amount: string): WaterFraction {
  nonNegative(amount, 'water amount');
  const [whole, fraction = ''] = amount.split('.');
  return waterFraction(
    BigInt(`${whole}${fraction}`).toString(),
    (10n ** BigInt(fraction.length)).toString(),
  );
}
export const zeroWater = () => waterVolume('0', '1');
export function compareWater(a: WaterVolume, b: WaterVolume) {
  assertWaterVolume(a);
  assertWaterVolume(b);
  const difference =
    BigInt(a.numerator) * BigInt(b.denominator) -
    BigInt(b.numerator) * BigInt(a.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export function addWater(a: WaterVolume, b: WaterVolume): WaterVolume {
  assertWaterVolume(a);
  assertWaterVolume(b);
  return waterVolume(
    (
      BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator)
    ).toString(),
    (BigInt(a.denominator) * BigInt(b.denominator)).toString(),
  );
}
export function subtractWater(a: WaterVolume, b: WaterVolume): WaterVolume {
  if (compareWater(a, b) < 0)
    kernelInvalid('Water subtraction would be negative');
  return waterVolume(
    (
      BigInt(a.numerator) * BigInt(b.denominator) -
      BigInt(b.numerator) * BigInt(a.denominator)
    ).toString(),
    (BigInt(a.denominator) * BigInt(b.denominator)).toString(),
  );
}
function assertFraction(value: WaterFraction) {
  if ('unit' in value)
    kernelInvalid('A water scalar must be dimensionless, not a water volume');
  const canonical = waterFraction(value.numerator, value.denominator);
  if (
    canonical.numerator !== value.numerator ||
    canonical.denominator !== value.denominator
  )
    kernelInvalid('Water scalar fraction must be reduced');
}
export function scaleWater(a: WaterVolume, n: WaterFraction): WaterVolume {
  assertWaterVolume(a);
  assertFraction(n);
  return waterVolume(
    (BigInt(a.numerator) * BigInt(n.numerator)).toString(),
    (BigInt(a.denominator) * BigInt(n.denominator)).toString(),
  );
}
export function unscaleWater(a: WaterVolume, b: WaterFraction): WaterVolume {
  assertWaterVolume(a);
  assertFraction(b);
  if (b.numerator === '0') kernelInvalid('Cannot divide water by zero');
  return waterVolume(
    (BigInt(a.numerator) * BigInt(b.denominator)).toString(),
    (BigInt(a.denominator) * BigInt(b.numerator)).toString(),
  );
}
export function ratioWater(a: WaterVolume, b: WaterVolume): WaterFraction {
  assertWaterVolume(a);
  assertWaterVolume(b);
  if (b.numerator === '0') kernelInvalid('Cannot form a ratio to zero water');
  return waterFraction(
    (BigInt(a.numerator) * BigInt(b.denominator)).toString(),
    (BigInt(a.denominator) * BigInt(b.numerator)).toString(),
  );
}
export function minimumWater(...values: WaterVolume[]) {
  if (!values.length) kernelInvalid('Water minimum requires an explicit value');
  return values.reduce((a, b) => (compareWater(a, b) <= 0 ? a : b));
}
export function sumWater(values: readonly WaterVolume[]) {
  return values.reduce(addWater, zeroWater());
}
/** No rounding. null means the existing decimal carrier cannot represent it. */
export function waterVolumeAsQuantity(
  value: WaterVolume,
): ExactQuantity | null {
  assertWaterVolume(value);
  let d = BigInt(value.denominator),
    twos = 0,
    fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) return null;
  const scale = Math.max(twos, fives);
  if (scale > 120) return null;
  const coefficient =
    (BigInt(value.numerator) * 10n ** BigInt(scale)) /
    BigInt(value.denominator);
  const digits = coefficient.toString().padStart(scale + 1, '0');
  const amount =
    scale === 0
      ? digits
      : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
          .replace(/0+$/u, '')
          .replace(/\.$/u, '');
  if (amount.replace('.', '').length > 120) return null;
  return Object.freeze({ amount, unit: 'm3' });
}
