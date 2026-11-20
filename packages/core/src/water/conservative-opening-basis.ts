/** Fixed original water DATA reconciliation. No right, grant, operating
 * permission, World state, delivery or utility-policy authority is issued. */
import { kernelInvalid } from '../engine-kernels/common.js';
import type { Sha256Hex } from '../commands/command.js';
import {
  addWater,
  assertWaterVolume,
  compareWater,
  minimumWater,
  scaleWater,
  subtractWater,
  sumWater,
  volumeFromDecimal,
  waterFraction,
  waterVolumeAsQuantity,
  zeroWater,
  type WaterVolume,
} from './exact-volume.js';

export const CONSERVATIVE_OPENING_WATER_SOURCES = Object.freeze({
  allocations:
    '53b4d7cd0425f6a0789cad2e1bcd0800420a5010f38307e895742df1c0567841',
  population:
    '86e828a421346aecaa31c95a7805289a022c80df93399545aeea39f6ce361615',
  seasonal: '704f59f6204096b1f696d9d35c8727845a92f44efd8948b87eda0e740845fc66',
  geography: 'c1a3d521ae91b37845f764be4ede73d522bc6958be90f4676ad5a19395b26a35',
});
type Row = Readonly<Record<string, unknown>>;
const ZERO = zeroWater(),
  MICRO = volumeFromDecimal('0.000001');
function fail(s: string): never {
  return kernelInvalid('Conservative water DATA: ' + s);
}
function text(x: unknown): string {
  if (typeof x !== 'string' || !x || x.trim() !== x)
    fail('explicit original text required');
  return x;
}
function row(x: unknown): Row {
  if (!x || typeof x !== 'object' || Array.isArray(x))
    fail('original object required');
  return x as Row;
}
function rows(x: unknown): readonly Row[] {
  if (!Array.isArray(x)) fail('original rows required');
  return x.map(row);
}
function v(x: unknown): WaterVolume {
  const s = text(x);
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(s) || s.length > 120)
    fail('bounded exact decimal required');
  return volumeFromDecimal(s);
}
const max = (a: WaterVolume, b: WaterVolume) =>
  compareWater(a, b) >= 0 ? a : b;
const positiveDifference = (a: WaterVolume, b: WaterVolume) =>
  compareWater(a, b) > 0 ? subtractWater(a, b) : ZERO;
function residual(left: WaterVolume, right: WaterVolume) {
  const comparison = compareWater(left, right),
    absolute =
      comparison >= 0 ? subtractWater(left, right) : subtractWater(right, left);
  return Object.freeze({
    direction:
      comparison === 0
        ? ('EQUAL' as const)
        : comparison > 0
          ? ('LEFT_HIGHER' as const)
          : ('RIGHT_HIGHER' as const),
    absolute,
    withinReservationQuantum: compareWater(absolute, MICRO) <= 0,
  });
}
/** The discarded rational is retained. This floor cannot create water. */
export function floorConservativeWaterSixDecimals(value: WaterVolume) {
  assertWaterVolume(value);
  const micros =
    (BigInt(value.numerator) * 1000000n) / BigInt(value.denominator);
  const amount =
    (micros / 1000000n).toString() +
    '.' +
    (micros % 1000000n).toString().padStart(6, '0');
  const volume = volumeFromDecimal(amount),
    canonical = waterVolumeAsQuantity(volume);
  if (!canonical) fail('finite floor required');
  return Object.freeze({
    amount: canonical.amount,
    volume,
    unassigned: subtractWater(value, volume),
  });
}
export interface ConservativeWaterRegionInput {
  readonly allocation: Row;
  readonly domesticAlias: string;
  readonly seasonal: Row;
  readonly daysInMonth: string;
}
/** Generic arithmetic DATA helper, deliberately not an admission/validity check. */
export function deriveConservativeWaterRegionLimit(
  input: ConservativeWaterRegionInput,
) {
  const a = input.allocation,
    s = input.seasonal;
  if (!/^(28|29|30|31)$/u.test(input.daysInMonth))
    fail('actual Gregorian month days required');
  const domestic = v(a.domesticM3Day),
    alias = v(input.domesticAlias),
    agriculture = v(a.agricultureM3Day),
    industry = v(a.industryM3Day),
    allocated = v(a.allocatedM3Day),
    available = v(a.availableM3Day),
    remaining = v(a.remainingM3Day),
    dry = v(a.drySeasonAvailableM3Day),
    monthly = v(s.selectedMonthlyRunoffM3),
    ecology = v(s.ecologicalReserveShare);
  if (compareWater(ecology, volumeFromDecimal('1')) > 0)
    fail('ecology ratio outside unit range');
  const afterEcology = scaleWater(
    monthly,
    waterFraction(
      (BigInt(ecology.denominator) - BigInt(ecology.numerator)).toString(),
      ecology.denominator,
    ),
  );
  const monthlyDaily = scaleWater(
    afterEcology,
    waterFraction('1', input.daysInMonth),
  );
  const sourceSum = sumWater([domestic, agriculture, industry]);
  const differences = Object.freeze({
    componentTotal: residual(sourceSum, allocated),
    remaining: residual(positiveDifference(available, allocated), remaining),
    domesticAlias: residual(domestic, alias),
  });
  const numericTailOnly = Object.values(differences).every(
    (x) => x.withinReservationQuantum,
  );
  // Preserve the larger protected alias AND a larger recorded aggregate; never
  // release a rounding gap as newly available industrial water.
  const protectedDemand = sumWater([
    max(domestic, alias),
    agriculture,
    positiveDifference(allocated, sourceSum),
  ]);
  const originalTotal = max(allocated, addWater(protectedDemand, industry));
  // A conservative DATA upper bound, including dry-season constraints even
  // when the selected month is wetter; it is not a promise of delivered flow.
  const supplyBound = minimumWater(available, dry, monthlyDaily);
  const localIndustrialBound = numericTailOnly
    ? minimumWater(industry, positiveDifference(supplyBound, protectedDemand))
    : ZERO;
  return Object.freeze({
    classification:
      'CONSERVATIVE_SOURCE_LIMIT_DATA_NOT_RIGHT_OR_DELIVERY' as const,
    sourceCountryId: text(a.countryId),
    sourceRegionId: text(a.regionId),
    basinRef: text(a.basinId),
    raw: Object.freeze({
      allocation: Object.freeze({ ...a }),
      domesticAlias: input.domesticAlias,
      seasonal: Object.freeze({
        ...s,
        ...(Array.isArray(s.monthlyRunoffM3Proposal)
          ? {
              monthlyRunoffM3Proposal: Object.freeze([
                ...s.monthlyRunoffM3Proposal,
              ]),
            }
          : {}),
      }),
    }),
    differences,
    numericTailOnly,
    protectedDemand,
    originalTotal,
    supplyBound,
    monthlyPostEcologyDaily: monthlyDaily,
    localIndustrialBound,
    industrialLimit: floorConservativeWaterSixDecimals(localIndustrialBound),
    nominalDrySeasonShortfall: positiveDifference(allocated, dry),
    protectedDemandShortfall: positiveDifference(protectedDemand, supplyBound),
    unallocatedSurplus: minimumWater(
      remaining,
      positiveDifference(available, originalTotal),
      positiveDifference(supplyBound, originalTotal),
    ),
  });
}
function exactParse(raw: string): unknown {
  const parse = JSON.parse as (
    s: string,
    r: (key: string, value: unknown, context: { source?: string }) => unknown,
  ) => unknown;
  return parse(raw, (_key, value, context) =>
    typeof value === 'number' ? context.source : value,
  );
}
function days(year: string, month: string): string {
  if (!/^[1-9][0-9]{0,3}$/u.test(year) || !/^(?:[1-9]|1[0-2])$/u.test(month))
    fail('bounded Gregorian year/month required');
  const y = BigInt(year),
    leap = y % 4n === 0n && (y % 100n !== 0n || y % 400n === 0n);
  if (month === '2') return leap ? '29' : '28';
  return ['4', '6', '9', '11'].includes(month) ? '30' : '31';
}
/** Only these unchanged raw originals are accepted. Matching SHA checks
 * identity, NOT a World admission, current rights, authority or readiness. */
export function deriveFixedConservativeOpeningWaterBasis(
  input: {
    readonly raw: Readonly<
      Record<keyof typeof CONSERVATIVE_OPENING_WATER_SOURCES, string>
    >;
    readonly year: string;
    readonly month: string;
  },
  sha256Hex: Sha256Hex,
) {
  const parsed: Record<string, unknown> = {};
  for (const key of Object.keys(
    CONSERVATIVE_OPENING_WATER_SOURCES,
  ) as (keyof typeof CONSERVATIVE_OPENING_WATER_SOURCES)[]) {
    const raw = input.raw[key];
    if (
      typeof raw !== 'string' ||
      raw.length > (key === 'geography' ? 10000000 : 1000000) ||
      sha256Hex(raw) !== CONSERVATIVE_OPENING_WATER_SOURCES[key]
    )
      fail('fixed raw source drift: ' + key);
    parsed[key] = exactParse(raw);
  }
  const allocations = rows(parsed.allocations),
    population = rows(parsed.population),
    seasonal = rows(parsed.seasonal),
    basins = rows(row(parsed.geography).basins),
    daysInMonth = days(input.year, input.month),
    // The validated calendar month selects a source row, not a numeric amount.
    monthIndex = [
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
    ].indexOf(input.month);
  if (
    allocations.length !== 122 ||
    population.length !== 122 ||
    seasonal.length !== 122
  )
    fail('complete 122 original regions required');
  const regionIds = new Set<string>();
  const regions = allocations.map((a) => {
    const id = text(a.regionId),
      country = text(a.countryId),
      basin = text(a.basinId);
    if (regionIds.has(id)) fail('duplicate regional water contribution');
    regionIds.add(id);
    const aliases = population.filter(
        (x) => x.regionId === id && x.countryId === country,
      ),
      seasons = seasonal.filter(
        (x) => x.regionId === id && x.basinId === basin,
      ),
      bs = basins.filter((x) => x.id === basin);
    if (
      aliases.length !== 1 ||
      seasons.length !== 1 ||
      bs.length !== 1 ||
      !Array.isArray(bs[0]!.regionIds) ||
      !bs[0]!.regionIds.includes(id) ||
      !Array.isArray(bs[0]!.countryIds) ||
      !bs[0]!.countryIds.includes(country)
    )
      fail('exact source basin/region/country alias required');
    const s = seasons[0]!,
      monthly = s.monthlyRunoffM3Proposal;
    if (!Array.isArray(monthly) || monthly.length !== 12)
      fail('twelve original monthly contributions required');
    return deriveConservativeWaterRegionLimit({
      allocation: Object.freeze({ ...a }),
      domesticAlias: text(aliases[0]!.waterDomesticM3Day),
      seasonal: Object.freeze({
        ...s,
        selectedMonthlyRunoffM3: text(monthly[monthIndex]),
      }),
      daysInMonth,
    });
  });
  // One basin budget from DISTINCT regional contributions. The basin annual
  // aggregate is not added again. Protected demand in another region cannot
  // be bypassed by separately spending a country's local remainder.
  const basinResults = [...new Set(regions.map((x) => x.basinRef))]
    .sort()
    .map((basinRef) => {
      const members = regions.filter((x) => x.basinRef === basinRef),
        supply = sumWater(members.map((x) => x.supplyBound)),
        protectedDemand = sumWater(members.map((x) => x.protectedDemand)),
        localSum = sumWater(members.map((x) => x.localIndustrialBound)),
        headroom = positiveDifference(supply, protectedDemand),
        envelope = minimumWater(localSum, headroom);
      const limits = members.map((x) => {
        const exact =
          localSum.numerator === '0'
            ? ZERO
            : scaleWater(
                envelope,
                waterFraction(
                  (
                    BigInt(x.localIndustrialBound.numerator) *
                    BigInt(localSum.denominator)
                  ).toString(),
                  (
                    BigInt(x.localIndustrialBound.denominator) *
                    BigInt(localSum.numerator)
                  ).toString(),
                ),
              );
        return Object.freeze({
          sourceRegionId: x.sourceRegionId,
          limit: floorConservativeWaterSixDecimals(exact),
        });
      });
      const assigned = sumWater(limits.map((x) => x.limit.volume));
      if (compareWater(assigned, envelope) > 0)
        fail('basin upper bound conservation');
      return Object.freeze({
        basinRef,
        sourceRegionIds: Object.freeze(
          members.map((x) => x.sourceRegionId).sort(),
        ),
        supplyBound: supply,
        protectedDemand,
        protectedDemandShortfall: positiveDifference(protectedDemand, supply),
        industrialEnvelope: envelope,
        limits: Object.freeze(limits),
        assigned,
        unassigned: subtractWater(envelope, assigned),
      });
    });
  return Object.freeze({
    classification:
      'FIXED_CONSERVATIVE_WATER_DATA_NOT_ADMISSION_GRANT_OR_DELIVERY' as const,
    period: Object.freeze({
      year: input.year,
      month: input.month,
      daysInMonth,
    }),
    sourceHashes: CONSERVATIVE_OPENING_WATER_SOURCES,
    raw: Object.freeze({ ...input.raw }),
    regions: Object.freeze(regions),
    basins: Object.freeze(basinResults),
    nominalDrySeasonShortageCount: regions.filter(
      (x) => x.nominalDrySeasonShortfall.numerator !== '0',
    ).length,
  });
}
