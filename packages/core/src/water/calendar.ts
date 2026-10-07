import { kernelInvalid } from '../engine-kernels/common.js';
import { SimTime, isSimTime } from '../numeric/sim-time.js';
import { SIMULATION_TICKS_PER_DAY } from '../time/simulation-clock.js';
import {
  scaleWater,
  volumeFromDecimal,
  waterFraction,
  type WaterVolume,
} from './exact-volume.js';

export interface GregorianWaterCalendarBinding {
  readonly schema: 'GREGORIAN_WATER_CALENDAR_V1';
  readonly sourceRef: string;
  readonly anchorSimulationTicks: string;
  readonly anchorGregorianTimestamp: string;
}
export interface GregorianWaterPeriod {
  readonly year: string;
  readonly month: string;
  readonly daysInMonth: string;
  readonly simulationStartTicks: string;
  readonly simulationEndTicks: string;
  readonly gregorianTimestamp: string;
}
const DAY = BigInt(SIMULATION_TICKS_PER_DAY);
const MONTHS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const;
function daysBeforeYear(year: bigint) {
  const y = year - 1n;
  return y * 365n + y / 4n - y / 100n + y / 400n;
}
function monthDays(year: bigint): readonly string[] {
  const leap = year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
  return [
    '31',
    leap ? '29' : '28',
    '31',
    '30',
    '31',
    '30',
    '31',
    '31',
    '30',
    '31',
    '30',
    '31',
  ];
}
/** Integer Gregorian arithmetic from year 1. No ambient clock, JS number
 * conversion or host timezone API enters the authoritative computation. */
function parseGregorian(s: string): bigint {
  if (typeof s !== 'string')
    kernelInvalid('Explicit canonical UTC Gregorian timestamp required');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u.exec(
    s,
  );
  if (!m) kernelInvalid('Explicit canonical UTC Gregorian timestamp required');
  const year = BigInt(m[1]!),
    month = BigInt(m[2]!),
    day = BigInt(m[3]!),
    hour = BigInt(m[4]!),
    minute = BigInt(m[5]!),
    second = BigInt(m[6]!),
    millisecond = BigInt(m[7]!);
  if (
    year < 1n ||
    year > 9999n ||
    month < 1n ||
    month > 12n ||
    day < 1n ||
    hour > 23n ||
    minute > 59n ||
    second > 59n
  )
    kernelInvalid('Invalid Gregorian timestamp');
  const index = MONTHS.indexOf(month.toString() as (typeof MONTHS)[number]);
  const lengths = monthDays(year);
  if (day > BigInt(lengths[index]!))
    kernelInvalid('Invalid Gregorian timestamp');
  const previous = lengths
    .slice(0, index)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  return (
    (daysBeforeYear(year) + previous + day - 1n) * DAY +
    hour * 3600000n +
    minute * 60000n +
    second * 1000n +
    millisecond
  );
}
export function createGregorianWaterCalendarBinding(input: {
  readonly sourceRef: string;
  readonly anchorSimulationTimestamp: SimTime;
  readonly anchorGregorianTimestamp: string;
}): GregorianWaterCalendarBinding {
  if (!isSimTime(input.anchorSimulationTimestamp) || !input.sourceRef?.trim())
    kernelInvalid(
      'Gregorian water calendar needs explicit simulation anchor and source',
    );
  parseGregorian(input.anchorGregorianTimestamp);
  return Object.freeze({
    schema: 'GREGORIAN_WATER_CALENDAR_V1',
    sourceRef: input.sourceRef,
    anchorSimulationTicks: input.anchorSimulationTimestamp.toCanonicalValue(),
    anchorGregorianTimestamp: input.anchorGregorianTimestamp,
  });
}
export function gregorianWaterPeriod(
  binding: GregorianWaterCalendarBinding,
  simulationTimestamp: SimTime,
): GregorianWaterPeriod {
  if (
    !binding ||
    binding.schema !== 'GREGORIAN_WATER_CALENDAR_V1' ||
    !binding.sourceRef?.trim() ||
    !isSimTime(simulationTimestamp)
  )
    kernelInvalid(
      'Explicit Gregorian binding and authoritative SimTime required',
    );
  const anchor = SimTime.fromTicks(binding.anchorSimulationTicks);
  const epoch = parseGregorian(binding.anchorGregorianTimestamp);
  const current = epoch + simulationTimestamp.ticks - anchor.ticks;
  if (current < 0n || current >= daysBeforeYear(10000n) * DAY)
    kernelInvalid('Gregorian timestamp out of supported range');
  const absoluteDay = current / DAY;
  let low = 1n,
    high = 10000n;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (daysBeforeYear(middle) <= absoluteDay) low = middle;
    else high = middle;
  }
  const year = low;
  let dayOfYear = absoluteDay - daysBeforeYear(year),
    previous = 0n;
  const lengths = monthDays(year);
  let index = 0;
  while (dayOfYear >= BigInt(lengths[index]!)) {
    const days = BigInt(lengths[index]!);
    dayOfYear -= days;
    previous += days;
    index++;
  }
  const start = (daysBeforeYear(year) + previous) * DAY;
  const month = MONTHS[index]!,
    daysInMonth = lengths[index]!;
  let clock = current % DAY;
  const hour = clock / 3600000n;
  clock %= 3600000n;
  const minute = clock / 60000n;
  clock %= 60000n;
  const second = clock / 1000n,
    millisecond = clock % 1000n;
  const gregorianTimestamp = `${year.toString().padStart(4, '0')}-${month.padStart(2, '0')}-${(dayOfYear + 1n).toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}.${millisecond.toString().padStart(3, '0')}Z`;
  const startTicks = anchor.ticks + start - epoch;
  return Object.freeze({
    year: year.toString(),
    month,
    daysInMonth,
    simulationStartTicks: startTicks.toString(),
    simulationEndTicks: (startTicks + BigInt(daysInMonth) * DAY).toString(),
    gregorianTimestamp,
  });
}
export function monthlyWaterVolumeForInterval(input: {
  readonly binding: GregorianWaterCalendarBinding;
  readonly simulationStart: SimTime;
  readonly simulationEnd: SimTime;
  readonly monthlyVolumeM3: string;
}): WaterVolume {
  const period = gregorianWaterPeriod(input.binding, input.simulationStart);
  if (
    !isSimTime(input.simulationEnd) ||
    input.simulationEnd.ticks <= input.simulationStart.ticks ||
    input.simulationEnd.ticks > BigInt(period.simulationEndTicks)
  )
    kernelInvalid(
      'Water interval must be positive and stay within its Gregorian month',
    );
  return scaleWater(
    volumeFromDecimal(input.monthlyVolumeM3),
    waterFraction(
      (input.simulationEnd.ticks - input.simulationStart.ticks).toString(),
      (BigInt(period.daysInMonth) * DAY).toString(),
    ),
  );
}
