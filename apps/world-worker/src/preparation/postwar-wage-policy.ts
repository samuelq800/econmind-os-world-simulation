import { createHash } from 'node:crypto';
import { Money, SIMULATION_DAYS_PER_YEAR } from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';
import {
  isVerifiedOfficialOpeningDecisionSource,
  type VerifiedOfficialOpeningSource,
} from './official-opening-decision-reconciliation.js';
import {
  consumePostwarLabourGenesis,
  type PostwarLabourGenesisPreparation,
} from './postwar-labour-genesis.js';

export const POSTWAR_WAGE_POLICY_PATH =
  'config/postwar-genesis/wage-policy.v1.json';
export const POSTWAR_WAGE_POLICY_SHA256 =
  'bc70890c62cac31008f676f0d6ffde65d2ed330ab619f810685cad57d406b827';
export const POSTWAR_WAGE_POLICY_VERSION = 'POSTWAR_WAGE_POLICY_20261028_V1';
type Skill = 'LOW' | 'MEDIUM' | 'HIGH';
export interface PostwarWageSourceReference {
  readonly path: string;
  readonly pointer: string;
  readonly sha256: string;
}
/** Server composition supplies the actual preserved currency/FX binding. This
 * input is evidence for a generated scenario policy, never currency admission. */
export interface PostwarWageMonetaryBinding {
  readonly countryId: string;
  readonly sourceCountryId: string;
  readonly localCurrency: string;
  readonly localCurrencyPerGcu: string;
  readonly fxVersion: string;
  readonly valueDate: string;
  readonly sourceReferences: readonly PostwarWageSourceReference[];
}
export interface PostwarWagePosition {
  readonly positionId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly skill: Skill;
  readonly occupation: string;
  readonly employerRole: 'GOV' | 'OP';
  readonly filledCount: string;
}
export interface PostwarWageQuote {
  readonly wageAmount: string;
  readonly wageCurrency: string;
  readonly wagePeriod: 'SIM_YEAR';
  readonly wageVersion: string;
  readonly wagePolicyRef: string;
  readonly sourceReferences: readonly PostwarWageSourceReference[];
}
export interface PostwarWageRational {
  readonly numerator: string;
  readonly denominator: string;
}
export interface PostwarCountryWages {
  readonly countryId: string;
  readonly sourceCountryId: string;
  readonly currency: string;
  readonly localCurrencyPerGcu: string;
  readonly fxVersion: string;
  readonly valueDate: string;
  readonly period: 'SIM_YEAR';
  readonly meanAnnualWageLC: PostwarWageRational;
  readonly wagesBySkill: Readonly<Record<Skill, PostwarWageQuote>>;
  readonly sourceReferences: readonly PostwarWageSourceReference[];
  readonly calibration: Readonly<{
    sourceDailyIncomeGcu: string;
    sourceEmployedCount: string;
    sourceAnnualTargetLC: string;
    actualAnnualPayrollLC: string;
    residualLC: string;
    actualAnnualPayrollGcu: PostwarWageRational;
    quantizationUpperBoundLC: PostwarWageRational;
    filledBySkill: Readonly<Record<Skill, string>>;
    weightedFilledCount: string;
  }>;
}
export interface PostwarWagePolicy {
  readonly schemaVersion: 'postwar-generated-wages-v1';
  readonly classification: 'GENERATED_POLICY';
  readonly version: typeof POSTWAR_WAGE_POLICY_VERSION;
  readonly policySHA256: string;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly countries: readonly PostwarCountryWages[];
  readonly wagesByPositionId: Readonly<Record<string, PostwarWageQuote>>;
  readonly moneyCreated: false;
  readonly wagesPaid: false;
  readonly sourceAdmitted: false;
  readonly worldClockStarted: false;
}
const policies = new WeakSet<object>();
const positionsByPolicy = new WeakMap<object, readonly PostwarWagePosition[]>();
const weights = { LOW: 10n, MEDIUM: 14n, HIGH: 20n } as const;
const quantum = 1_000_000n;
type Rational = { n: bigint; d: bigint };
function invalid(message: string): never {
  throw new Error(`POSTWAR_WAGE_POLICY: ${message}`);
}
function integer(value: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('Whole person count required');
  return BigInt(value);
}
function decimal(value: string): Rational {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value) ||
    value.replace('.', '').length > 120
  )
    invalid('Exact non-negative decimal required');
  const [whole, fraction = ''] = value.split('.');
  return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) };
}
function mul(a: Rational, b: Rational): Rational {
  return { n: a.n * b.n, d: a.d * b.d };
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
function rational(a: Rational): PostwarWageRational {
  const g = gcd(a.n, a.d);
  return { numerator: (a.n / g).toString(), denominator: (a.d / g).toString() };
}
function finite(a: Rational): string {
  let scale = 0n,
    denominator = a.d;
  while (denominator % 10n === 0n) {
    denominator /= 10n;
    scale++;
  }
  if (denominator !== 1n) invalid('Finite exact decimal required');
  if (scale === 0n) return a.n.toString();
  const digits = a.n.toString().padStart(Number(scale) + 1, '0');
  return `${digits.slice(0, -Number(scale))}.${digits.slice(-Number(scale))}`
    .replace(/0+$/u, '')
    .replace(/\.$/u, '');
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function references(value: readonly PostwarWageSourceReference[]): void {
  if (
    !value.length ||
    value.some(
      (ref) =>
        !ref.path ||
        !ref.pointer.startsWith('/') ||
        !/^[a-f0-9]{64}$/u.test(ref.sha256),
    )
  )
    invalid('Currency/FX source references required');
}
export function isPostwarWagePolicy(
  value: unknown,
): value is PostwarWagePolicy {
  return value !== null && typeof value === 'object' && policies.has(value);
}

/** Source income is a calibration envelope, not an asserted historical wage.
 * Generated skill weights 1/1.4/2 divide this envelope over actual filled jobs.
 * Only newly generated LC/year wages are quantized, down to 6 decimal places;
 * original income, currencies, FX, stocks and all monetary balances stay exact.
 * No SIM-hour/day work schedule is invented: 360 simulation days = one year.
 * Funding/obligation provenance must be joined separately before Core materialization. */
export function createPostwarWagePolicy(input: {
  readonly policyBytes: string;
  readonly adoption: OfficialLabourSocialOpeningAdoption;
  readonly financeSource: VerifiedOfficialOpeningSource;
  readonly monetaryBindings: readonly PostwarWageMonetaryBinding[];
  readonly labourPreparation: PostwarLabourGenesisPreparation;
}): PostwarWagePolicy {
  consumeLabourSocialOpeningAdoption(input.adoption);
  if (!isVerifiedOfficialOpeningDecisionSource(input.financeSource))
    invalid('Verified selected source required');
  if (
    input.financeSource.pins.checksumsSha256 !==
    input.adoption.sourceChecksumsSha256
  )
    invalid('Mixed source package');
  if (
    createHash('sha256').update(input.policyBytes).digest('hex') !==
    POSTWAR_WAGE_POLICY_SHA256
  )
    invalid('Pinned generated policy bytes required');
  if (SIMULATION_DAYS_PER_YEAR !== '360')
    invalid('Policy/calendar version mismatch');
  const prepared = consumePostwarLabourGenesis(input.labourPreparation);
  const allPositions = prepared.positions;
  const financeProvenance = input.financeSource.domains.find(
    (row) => row.dataset === 'finance',
  );
  if (!financeProvenance) invalid('Finance provenance missing');
  const seen = new Set<string>();
  for (const position of allPositions) {
    if (!position.positionId || seen.has(position.positionId))
      invalid('Duplicate/missing position identity');
    seen.add(position.positionId);
    if (
      !Object.hasOwn(weights, position.skill) ||
      !['GOV', 'OP'].includes(position.employerRole)
    )
      invalid('Unsupported position skill/employer');
    integer(position.filledCount);
    if (
      !input.adoption.populationAvailability.some(
        (row) =>
          row.countryId === position.countryId &&
          row.locationId === position.locationId,
      )
    )
      invalid('Position outside selected region');
  }
  if (
    input.monetaryBindings.length !== input.adoption.countryIds.length ||
    new Set(input.monetaryBindings.map((row) => row.countryId)).size !==
      input.adoption.countryIds.length ||
    new Set(input.monetaryBindings.map((row) => row.localCurrency)).size !==
      input.adoption.countryIds.length
  )
    invalid('Complete unique country currency/FX bindings required');
  const wagesByPositionId: Record<string, PostwarWageQuote> = Object.create(
    null,
  ) as Record<string, PostwarWageQuote>;
  const countries = input.adoption.employmentTargets.map(
    (target): PostwarCountryWages => {
      const binding = input.monetaryBindings.find(
        (row) => row.countryId === target.countryId,
      );
      if (!binding) invalid('Missing country monetary binding');
      const countryJoin = input.financeSource.legalEntityProposals.find(
        (row) =>
          row.coreCountryId === target.countryId &&
          row.sourceCountryId === binding.sourceCountryId,
      );
      if (!countryJoin) invalid('Country source/Core mapping differs');
      Money.from('0', binding.localCurrency);
      if (
        binding.localCurrency === 'GCU' ||
        !binding.fxVersion ||
        !binding.valueDate
      )
        invalid('Actual local currency and versioned FX required');
      references(binding.sourceReferences);
      const fx = decimal(binding.localCurrencyPerGcu);
      if (fx.n === 0n) invalid('Positive LC per GCU required');
      const financeIndex = input.financeSource.financeOriginals.findIndex(
        (row) => row.countryId === binding.sourceCountryId,
      );
      const finance = input.financeSource.financeOriginals[financeIndex];
      if (
        !finance ||
        finance.currency !== 'GCU_SCENARIO_ACCOUNTING_UNIT' ||
        typeof finance.dailyLabourIncomeReference !== 'string'
      )
        invalid('GCU per-reference-day source income required');
      const daily = decimal(finance.dailyLabourIncomeReference);
      if (!daily.n) invalid('Positive reference income required');
      const positions = allPositions.filter(
        (row) => row.countryId === target.countryId,
      );
      const filledBySkill = { LOW: 0n, MEDIUM: 0n, HIGH: 0n };
      positions.forEach((row) => {
        filledBySkill[row.skill] += integer(row.filledCount);
      });
      const filled =
        filledBySkill.LOW + filledBySkill.MEDIUM + filledBySkill.HIGH;
      if (filled === 0n || filled !== integer(target.employed))
        invalid(`Unmatched country employment target: ${target.countryId}`);
      const weighted =
        filledBySkill.LOW * weights.LOW +
        filledBySkill.MEDIUM * weights.MEDIUM +
        filledBySkill.HIGH * weights.HIGH;
      const annualTarget = mul(mul(daily, { n: 360n, d: 1n }), fx);
      const sourceReferences: PostwarWageSourceReference[] = [
        {
          path: financeProvenance.sourcePath,
          pointer: `/${financeIndex}/dailyLabourIncomeReference`,
          sha256: financeProvenance.sourceSha256,
        },
        ...binding.sourceReferences.map((ref) => ({ ...ref })),
        {
          path: POSTWAR_WAGE_POLICY_PATH,
          pointer: '/calibration',
          sha256: POSTWAR_WAGE_POLICY_SHA256,
        },
      ];
      const quoteFor = (skill: Skill): PostwarWageQuote => {
        const wage =
          (annualTarget.n * weights[skill] * quantum) /
          (annualTarget.d * weighted);
        if (wage === 0n)
          invalid(
            'Generated wage below positive precision; no invented minimum',
          );
        const wageAmount = finite({ n: wage, d: quantum });
        Money.from(wageAmount, binding.localCurrency);
        return {
          wageAmount,
          wageCurrency: binding.localCurrency,
          wagePeriod: 'SIM_YEAR',
          wageVersion: `${POSTWAR_WAGE_POLICY_VERSION}_${target.countryId}_${binding.fxVersion}`,
          wagePolicyRef: `sha256:${POSTWAR_WAGE_POLICY_SHA256}#/skillWeights/${skill}`,
          sourceReferences,
        };
      };
      const wagesBySkill: Record<Skill, PostwarWageQuote> = {
        LOW: quoteFor('LOW'),
        MEDIUM: quoteFor('MEDIUM'),
        HIGH: quoteFor('HIGH'),
      };
      const payroll = (['LOW', 'MEDIUM', 'HIGH'] as const).reduce(
        (sum, skill) =>
          sum +
          decimal(wagesBySkill[skill].wageAmount).n *
            (quantum / decimal(wagesBySkill[skill].wageAmount).d) *
            filledBySkill[skill],
        0n,
      );
      const residual = {
        n: annualTarget.n * quantum - payroll * annualTarget.d,
        d: annualTarget.d * quantum,
      };
      if (residual.n < 0n || residual.n >= (filled * residual.d) / quantum)
        invalid('Payroll calibration outside documented quantization bound');
      positions.forEach((row) => {
        wagesByPositionId[row.positionId] = wagesBySkill[row.skill];
      });
      return {
        countryId: target.countryId,
        sourceCountryId: binding.sourceCountryId,
        currency: binding.localCurrency,
        localCurrencyPerGcu: binding.localCurrencyPerGcu,
        fxVersion: binding.fxVersion,
        valueDate: binding.valueDate,
        period: 'SIM_YEAR',
        meanAnnualWageLC: rational({
          n: payroll,
          d: quantum * filled,
        }),
        wagesBySkill,
        sourceReferences,
        calibration: {
          sourceDailyIncomeGcu: finance.dailyLabourIncomeReference,
          sourceEmployedCount: target.employed,
          sourceAnnualTargetLC: finite(annualTarget),
          actualAnnualPayrollLC: finite({ n: payroll, d: quantum }),
          residualLC: finite(residual),
          actualAnnualPayrollGcu: rational({
            n: payroll * fx.d,
            d: quantum * fx.n,
          }),
          quantizationUpperBoundLC: rational({ n: filled, d: quantum }),
          filledBySkill: {
            LOW: filledBySkill.LOW.toString(),
            MEDIUM: filledBySkill.MEDIUM.toString(),
            HIGH: filledBySkill.HIGH.toString(),
          },
          weightedFilledCount: weighted.toString(),
        },
      };
    },
  );
  const policy: PostwarWagePolicy = freeze({
    schemaVersion: 'postwar-generated-wages-v1',
    classification: 'GENERATED_POLICY',
    version: POSTWAR_WAGE_POLICY_VERSION,
    policySHA256: POSTWAR_WAGE_POLICY_SHA256,
    sourcePackageId: input.adoption.sourcePackageId,
    sourceChecksumsSha256: input.adoption.sourceChecksumsSha256,
    countries,
    wagesByPositionId: { ...wagesByPositionId },
    moneyCreated: false,
    wagesPaid: false,
    sourceAdmitted: false,
    worldClockStarted: false,
  });
  policies.add(policy);
  positionsByPolicy.set(
    policy,
    allPositions.map((row) => freeze({ ...row })),
  );
  return policy;
}

export function lookupPostwarWage(
  policy: PostwarWagePolicy,
  query: Omit<PostwarWagePosition, 'filledCount' | 'positionId'>,
): PostwarWageQuote {
  if (!isPostwarWagePolicy(policy))
    invalid('Genuine generated policy required');
  if (
    !positionsByPolicy
      .get(policy)!
      .some(
        (row) =>
          row.countryId === query.countryId &&
          row.locationId === query.locationId &&
          row.skill === query.skill &&
          row.occupation === query.occupation &&
          row.employerRole === query.employerRole,
      )
  )
    invalid('Wage query has no prepared position binding');
  return policy.countries.find((row) => row.countryId === query.countryId)!
    .wagesBySkill[query.skill];
}
