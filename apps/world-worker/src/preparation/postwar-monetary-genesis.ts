/** Generated nominal units only: no money, grants, market trades or admission. */
import { createHash } from 'node:crypto';
import {
  Money,
  canonicalDecimal,
  canonicalSerialize,
  parseWorldDecimal,
} from '@econmind/core';
import {
  isVerifiedOfficialOpeningDecisionSource,
  type VerifiedOfficialOpeningSource,
} from './official-opening-decision-reconciliation.js';
import {
  isFinancialSupplementAdoption,
  type FinancialSupplementAdoption,
} from './owner-non-host-source-adoption.js';
import {
  financialInputSha256,
  isParsedFormalFinancialOpeningContract,
  type FormalFinancialOpeningContract,
} from './formal-financial-opening-contract.js';

export const POSTWAR_MONETARY_POLICY_VERSION =
  'POSTWAR_NOMINAL_UNITS_20261028_V1';
const policy = Object.freeze({
  schemaVersion: 'postwar-nominal-unit-policy-v1',
  version: POSTWAR_MONETARY_POLICY_VERSION,
  classification: 'GENERATED_POLICY',
  authorizationMessage: 'Sentinel_a619bdbe25588191aa05709db76c7567',
  preserveAdoptedQuotes: true,
  generatedRate: '1 + 9 * originalCountryUrbanShare',
  generatedRateMeaning: 'NOMINAL_UNIT_CALIBRATION_NOT_OBSERVED_MARKET_FX',
  generatedCurrency: 'XAA_THROUGH_XCR_BY_PINNED_COUNTRY_MAPPING_NUMBER',
  amountRule: 'LC = UNCHANGED_GCU_REFERENCE * EXACT_LOCAL_UNITS_PER_GCU',
  uniformFxReset: false,
  newMoney: false,
});
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
export const POSTWAR_MONETARY_POLICY_SHA256 = sha(canonicalSerialize(policy));
export interface PostwarMonetaryReference {
  readonly path: string;
  readonly pointer: string;
  readonly sha256: string;
  readonly relation:
    'GENERATED_POLICY' | 'DERIVATION_INPUT' | 'PRESERVED_ADOPTED_QUOTE';
}
export interface PostwarMonetaryBinding {
  readonly countryId: string;
  readonly sourceCountryId: string;
  readonly localCurrency: string;
  readonly localCurrencyPerGcu: string;
  readonly fxVersion: string;
  /** Scenario valuation date, not an assertion of an observed market quote. */
  readonly valueDate: string;
  readonly classification: 'GENERATED_POLICY' | 'PRESERVED_ADOPTED_QUOTE';
  readonly sourceReferences: readonly PostwarMonetaryReference[];
}
export interface PostwarMonetaryGenesis {
  readonly schemaVersion: 'postwar-monetary-bindings-v1';
  readonly policy: typeof policy;
  readonly policySHA256: string;
  readonly bindings: readonly PostwarMonetaryBinding[];
  readonly moneyCreated: false;
  readonly sourceAdmitted: false;
}
const issued = new WeakSet<object>();
const fail = (reason: string): never => {
  throw new Error(`POSTWAR_MONETARY: ${reason}`);
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function rows(bytes: string): readonly Record<string, unknown>[] {
  const parse = JSON.parse as (
    bytes: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  const value = parse(bytes, (_key, value, context) => {
    if (typeof value !== 'number') return value;
    if (typeof context.source !== 'string')
      return fail('Lossless numeric source required');
    return context.source;
  });
  if (
    !Array.isArray(value) ||
    value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
  )
    fail('Source rows required');
  return value as Record<string, unknown>[];
}
export function createPostwarMonetaryGenesis(input: {
  readonly source: VerifiedOfficialOpeningSource;
  readonly countriesBytes: string;
  readonly mappingBytes: string;
  readonly valueDate: string;
  readonly preservedFinancial?: Readonly<{
    contract: FormalFinancialOpeningContract;
    proof: FinancialSupplementAdoption;
  }>;
}): PostwarMonetaryGenesis {
  if (!isVerifiedOfficialOpeningDecisionSource(input.source))
    fail('Verified pinned source required');
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.valueDate) ||
    !Number.isFinite(Date.parse(input.valueDate)) ||
    new Date(input.valueDate).toISOString().slice(0, 10) !== input.valueDate
  )
    fail('Explicit valid scenario valuation date required');
  const foundDomain = input.source.domains.find(
    (d) => d.dataset === 'countries',
  );
  if (!foundDomain) return fail('Pinned countries domain required');
  const domain = foundDomain;
  if (
    sha(input.countriesBytes) !== domain.sourceSha256 ||
    sha(input.mappingBytes) !== input.source.pins.mappingSha256
  )
    fail('Country/mapping source bytes changed');
  const countries = rows(input.countriesBytes);
  const mappings = (
    JSON.parse(input.mappingBytes) as {
      mappings: {
        countries: {
          sourceCountryId: string;
          coreCountryId: string;
          number: string;
        }[];
      };
    }
  ).mappings.countries;
  if (countries.length !== 70 || mappings.length !== 70)
    fail('Exact selected country denominator required');
  const preserved = input.preservedFinancial;
  if (
    preserved &&
    (!isParsedFormalFinancialOpeningContract(preserved.contract) ||
      !isFinancialSupplementAdoption(preserved.proof) ||
      preserved.contract.evidenceKind !== 'SOURCE_CANDIDATE' ||
      preserved.proof.parent.scope.environment !==
        'NON_ACTIVATED_PREPARATION' ||
      preserved.proof.contractFingerprint !==
        `sha256:${financialInputSha256(canonicalSerialize(preserved.contract))}` ||
      preserved.contract.financeSha256 !==
        input.source.domains.find((d) => d.dataset === 'finance')?.sourceSha256)
  )
    fail(
      'Preservation requires the actual adopted financial contract, never a test FX table',
    );
  const bindings = mappings.map((mapping): PostwarMonetaryBinding => {
    const sourceIndex = countries.findIndex(
      (c) => c.id === mapping.sourceCountryId,
    );
    if (
      sourceIndex < 0 ||
      !input.source.countryIds.includes(mapping.coreCountryId)
    )
      fail('Mapping country not in verified source');
    const previous = preserved?.contract.countries.find(
      (c) => c.countryId === mapping.coreCountryId,
    );
    if (previous && preserved) {
      const foundDocument = preserved.contract.documents.find(
        (d) => d.documentId === previous.openingFx.source.documentId,
      );
      if (!foundDocument)
        return fail('Preserved quote lacks its validated document');
      const document = foundDocument;
      return {
        countryId: mapping.coreCountryId,
        sourceCountryId: mapping.sourceCountryId,
        localCurrency: previous.localCurrency,
        localCurrencyPerGcu: previous.openingFx.localCurrencyPerGcu,
        fxVersion: previous.openingFx.version,
        valueDate: previous.openingFx.valueDate,
        classification: 'PRESERVED_ADOPTED_QUOTE',
        sourceReferences: [
          {
            path: document.sourcePath,
            pointer: previous.openingFx.source.pointer,
            sha256: document.sha256,
            relation: 'PRESERVED_ADOPTED_QUOTE',
          },
        ],
      };
    }
    const country = countries[sourceIndex]!;
    const rawUrban = country.urbanShare;
    if (typeof rawUrban !== 'string')
      return fail('Lossless original urban share required');
    const urban = parseWorldDecimal(rawUrban);
    if (!urban.isFinite() || urban.lt(0) || urban.gt(1))
      fail('Urban share outside source bounds');
    const ordinal = Number(mapping.number) - 1;
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 70)
      fail('Stable mapped country number required');
    const localCurrency = `X${String.fromCharCode(65 + Math.floor(ordinal / 26))}${String.fromCharCode(65 + (ordinal % 26))}`;
    Money.from('0', localCurrency);
    return {
      countryId: mapping.coreCountryId,
      sourceCountryId: mapping.sourceCountryId,
      localCurrency,
      localCurrencyPerGcu: canonicalDecimal(urban.mul('9').plus('1')),
      fxVersion: `${POSTWAR_MONETARY_POLICY_VERSION}_${mapping.coreCountryId}`,
      valueDate: input.valueDate,
      classification: 'GENERATED_POLICY',
      sourceReferences: [
        {
          path: 'artifacts/world-balanced-candidate-v1/data/countries.json',
          pointer: `/${sourceIndex}/urbanShare`,
          sha256: domain.sourceSha256,
          relation: 'DERIVATION_INPUT',
        },
        {
          path: 'POSTWAR_NOMINAL_UNIT_POLICY',
          pointer: '/generatedRate',
          sha256: POSTWAR_MONETARY_POLICY_SHA256,
          relation: 'GENERATED_POLICY',
        },
      ],
    };
  });
  if (
    new Set(bindings.map((b) => b.countryId)).size !== 70 ||
    new Set(bindings.map((b) => b.localCurrency)).size !== 70
  )
    fail('Duplicate country/currency would erase independent national units');
  const result = freeze({
    schemaVersion: 'postwar-monetary-bindings-v1' as const,
    policy,
    policySHA256: POSTWAR_MONETARY_POLICY_SHA256,
    bindings,
    moneyCreated: false as const,
    sourceAdmitted: false as const,
  });
  issued.add(result);
  return result;
}
/** Brand verifies this calculation's origin, never account funding or admission. */
export function consumePostwarMonetaryGenesis(
  value: PostwarMonetaryGenesis,
): void {
  if (!issued.has(value)) fail('Issued monetary calculation required');
}
export function postwarLocalBookValue(
  binding: PostwarMonetaryBinding,
  originalGcuAmount: string,
) {
  const amount = parseWorldDecimal(originalGcuAmount);
  const rate = parseWorldDecimal(binding.localCurrencyPerGcu);
  if (!amount.isFinite() || !rate.isFinite() || rate.lte(0))
    fail('Exact finite amount/rate required');
  return Money.from(
    canonicalDecimal(amount.mul(rate)),
    binding.localCurrency,
  ).toCanonicalValue();
}
