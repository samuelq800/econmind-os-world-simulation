/** Separate next-stage source family. Never replaces the current three-source
 * candidate, registers a host command, starts a Clock, or grants admission. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalDecimal,
  Money,
  createOpeningSeed,
  rebuildV08LedgersFromLineage,
  reclassifyBeneficialHousingSeed,
  verifyBeneficialHousingReclassification,
  aggregateBeneficialHousingLiquidClaim,
  createBeneficialHousingRentState,
  SIMULATION_DAYS_PER_YEAR,
  SIMULATION_TICKS_PER_DAY,
  type OpeningSeed,
  type OpeningSource,
  type FinancialOpeningBatch,
  type BeneficialHousingReclassificationReceipt,
  type BeneficialHousingGroup,
  type BeneficialHousingLease,
  type BeneficialHousingRentState,
  type FinancialAccount,
} from '@econmind/core';
import {
  isPostwarHousingGenesis,
  type PostwarHousingGenesis,
} from './postwar-housing-genesis.js';
import {
  type PostwarFinancialGenesis,
  readPostwarLiquidFundingAccountsFromSeed,
} from './postwar-financial-genesis.js';
import { prepareFinancialSupplementOpeningSeed } from './opening-canonical-seed-bridge.js';

export const POSTWAR_HOUSING_BENEFICIAL_POLICY = Object.freeze({
  schemaVersion: 'postwar-housing-beneficial-policy.v1',
  classification: 'GENERATED_POLICY',
  authorityRef: 'PROJECT_OWNER_2026_10_28_142754_POSTWAR_GENESIS',
  initialDepositShares:
    'EQUAL_PER_EXISTING_HOUSEHOLD_LARGEST_REMAINDER_AT_ORIGINAL_CLAIM_QUANTUM',
  legalOwnership: 'RETAIN_EXISTING_HOUSEHOLDS_ENTITY_AND_BANK_CLAIM',
  annualRent: 'RETAIN_EXACT_EXISTING_GENERATED_HOUSING_V1_ANNUAL_LC_QUOTE',
  settlement: '359_DAILY_SIX_DECIMAL_FLOORS_THEN_ONE_EXACT_FINAL_DAY_REMAINDER',
  period: 'SIM_DAY',
  annualDays: '360',
  startTick: '1',
  t0RentPaid: '0',
  t0RentAccrued: '0',
  newLegalEntities: '0',
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const policySha256 = hash(
  canonicalSerialize(POSTWAR_HOUSING_BENEFICIAL_POLICY),
);
const issued = new WeakSet<object>();
const cache = new WeakMap<object, Map<string, PostwarHousingRentBindings>>();
function invalid(s: string): never {
  throw Error(`POSTWAR_HOUSING_RENT_BINDINGS_INVALID: ${s}`);
}
function uint(s: string) {
  if (!/^(0|[1-9]\d*)$/u.test(s)) invalid('canonical integer required');
  return BigInt(s);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function equal(a: unknown, b: unknown, s: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(s);
}
function microMoney(n: bigint, currency: string) {
  return canonicalDecimal(
    Money.from(
      `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, '0')}`,
      currency,
    ).amount,
  );
}
export interface PostwarHousingBeneficialAccount {
  readonly kind: 'HOUSEHOLD_BENEFICIAL_GROUP_DEPOSIT';
  readonly countryId: string;
  readonly ownerId: string;
  readonly groupId: string;
  readonly originAccountId: string;
  readonly accountId: string;
  readonly claimId: string;
  readonly counterpartLiabilityAccountId: string;
  readonly currency: string;
  readonly availableAmount: string;
  readonly account: Readonly<FinancialAccount>;
}
export interface PostwarHousingCountryReclassification {
  readonly countryId: string;
  readonly receipt: BeneficialHousingReclassificationReceipt;
  readonly source: Readonly<OpeningSource>;
  readonly batch: Readonly<FinancialOpeningBatch>;
  readonly initialRentState: BeneficialHousingRentState;
}
export interface PostwarHousingRentBindings {
  readonly schemaVersion: 'postwar-housing-rent-bindings.v1';
  readonly classification: 'SEPARATE_GENERATED_BENEFICIAL_HOUSING_SOURCE_FAMILY_NOT_ADOPTED';
  readonly housingFingerprint: string;
  readonly policy: typeof POSTWAR_HOUSING_BENEFICIAL_POLICY;
  readonly policySha256: string;
  readonly parentSeed: Readonly<OpeningSeed>;
  readonly seed: Readonly<OpeningSeed>;
  readonly countries: readonly PostwarHousingCountryReclassification[];
  readonly accounts: readonly PostwarHousingBeneficialAccount[];
  readonly aggregateHouseholdClaims: readonly {
    readonly countryId: string;
    readonly originAccountId: string;
    readonly claimId: string;
    readonly currency: string;
    readonly amount: string;
    readonly spendable: false;
  }[];
  readonly privateRentTerms: readonly {
    readonly locationId: string;
    readonly countryId: string;
    readonly annualRentObligationId: string;
    readonly annualAmountPerHousehold: string;
    readonly currency: string;
    readonly fxVersion: string;
    readonly dailyAmountPerHousehold: string;
    readonly finalDayAmountPerHousehold: string;
    readonly landlordGroupRef: string;
    readonly tenantGroupRef: string;
    readonly initialTenantCash: string;
    readonly firstDayDue: string;
    readonly initialCashCoversFirstDay: boolean;
    readonly leaseIds: readonly string[];
  }[];
  readonly publicRentRules: readonly PostwarHousingGenesis['regions'][number]['rentObligations'][number][];
  readonly householdCount: string;
  readonly population: string;
  readonly leaseSegmentCount: string;
  readonly defaultHostCommandFamily: 'NOT_REGISTERED';
  readonly defaultHostReducer: 'NOT_REGISTERED';
  readonly sourceConsumer: 'NEW_BOUNDED_SOURCE_FAMILY_REQUIRES_EXPLICIT_V3_VALIDATOR_AND_PARENT_PROOF';
  readonly replayContract: 'NARROW_CORE_DOMAIN_AND_FINANCIAL_LINEAGE_PROOF_ONLY_NOT_DEFAULT_HOST_REGISTRY';
  readonly requiredHostIntegration: readonly string[];
  readonly productionAdmission: false;
  readonly WorldClock: false;
  readonly fingerprint: string;
}
export function isPostwarHousingRentBindings(
  v: unknown,
): v is PostwarHousingRentBindings {
  return typeof v === 'object' && v !== null && issued.has(v);
}
/** Pure actual-source construction. Each country derives from the same retained
 * financial parent; combine its one source/batch only once in the separate seed. */
export function createPostwarHousingRentBindings(input: {
  financial: PostwarFinancialGenesis;
  housing: PostwarHousingGenesis;
}): PostwarHousingRentBindings {
  if (!isPostwarHousingGenesis(input.housing))
    invalid('genuine source-bound housing required');
  if (SIMULATION_DAYS_PER_YEAR !== '360') invalid('calendar/policy mismatch');
  const parent = prepareFinancialSupplementOpeningSeed({
    assembly: input.financial.assembly,
    proof: input.financial.proof,
    candidate: input.financial.candidate,
  });
  equal(
    parent,
    input.financial.baselineSeed,
    'financial parent differs from original producer/bridge',
  );
  const prior = cache.get(input.financial)?.get(input.housing.fingerprint);
  if (prior) return prior;
  const funding = readPostwarLiquidFundingAccountsFromSeed(parent).filter(
    (a) => a.kind === 'HOUSEHOLD_BANK_DEPOSIT',
  );
  if (
    funding.length !== 70 ||
    new Set(funding.map((f) => f.countryId)).size !== 70 ||
    input.housing.regions.length !== 122
  )
    invalid('70-country/122-region denominator differs');
  const countries: PostwarHousingCountryReclassification[] = [],
    termDrafts: Omit<
      PostwarHousingRentBindings['privateRentTerms'][number],
      'initialTenantCash' | 'initialCashCoversFirstDay'
    >[] = [];
  const day = BigInt(SIMULATION_TICKS_PER_DAY);
  for (const f of [...funding].sort((a, b) =>
    a.countryId.localeCompare(b.countryId),
  )) {
    const regions = input.housing.regions
      .filter((r) => r.countryId === f.countryId)
      .sort((a, b) => a.locationId.localeCompare(b.locationId));
    if (!regions.length) invalid('country missing housing');
    const fx = input.financial.contract.countries.find(
      (c) => c.countryId === f.countryId,
    );
    if (!fx) invalid('country missing actual FX');
    const groups: BeneficialHousingGroup[] = [],
      pools: Parameters<
        typeof reclassifyBeneficialHousingSeed
      >[0]['pools'][number][] = [],
      leases: BeneficialHousingLease[] = [];
    for (const r of regions) {
      if (
        r.monetary.currency !== f.currency ||
        r.monetary.currency !== fx.localCurrency ||
        r.monetary.fxVersion !== fx.openingFx.version ||
        r.monetary.localCurrencyPerGcu !== fx.openingFx.localCurrencyPerGcu ||
        r.monetary.period !== 'SIM_YEAR'
      )
        invalid('rent wage/actual financial currency FX version differs');
      let householdOrdinal = 0n,
        personOrdinal = 0n;
      for (const c of r.cohorts) {
        if (c.householdEntityId !== f.ownerId)
          invalid('household legal owner changed');
        groups.push({
          groupId: c.id,
          locationId: r.locationId,
          role: c.tenure,
          firstHouseholdOrdinal: householdOrdinal.toString(),
          households: c.households,
          firstPersonOrdinal: personOrdinal.toString(),
          population: c.population,
        });
        householdOrdinal += uint(c.households);
        personOrdinal += uint(c.population);
      }
      if (
        householdOrdinal !== uint(r.source.households) ||
        personOrdinal !== uint(r.source.population)
      )
        invalid('housing cohort conservation differs');
      const privateTitle = r.titles.filter(
        (t) =>
          t.titleHolderId === f.ownerId &&
          t.beneficialOwnerGroupRef === r.cohorts[0]!.id,
      );
      if (privateTitle.length !== 1)
        invalid('unique actual generated private title pool required');
      const annual = r.rentObligations.filter(
        (o) =>
          o.payerEntityId === f.ownerId &&
          o.beneficiaryEntityId === f.ownerId &&
          o.settlement === 'REQUIRES_CORE_BENEFICIAL_GROUP_SETTLEMENT',
      );
      if (annual.length !== 1)
        invalid('unique private annual GENESIS_RIGHTS required');
      const rule = annual[0]!;
      if (
        rule.period !== 'SIM_YEAR' ||
        rule.perHousehold.currency !== f.currency ||
        rule.landlordGroupRef !== r.cohorts[0]!.id ||
        rule.tenantGroupRef !== r.cohorts[1]!.id ||
        rule.households !== r.cohorts[1]!.households ||
        rule.accruedAtT0 !== '0' ||
        rule.paidAtT0 !== '0' ||
        rule.outstandingDebtAtT0 !== '0' ||
        rule.contractCreated
      )
        invalid('annual rent is not the original future unpaid cohort rule');
      const annualMoney = Money.from(rule.perHousehold.amount, f.currency),
        scaled = annualMoney.amount.times('1000000');
      if (!scaled.isInteger() || !scaled.isPositive())
        invalid('six-decimal positive annual housing rate required');
      const annualMicro = BigInt(scaled.toFixed(0)),
        dailyMicro = annualMicro / 360n,
        finalMicro = annualMicro - 359n * dailyMicro;
      if (dailyMicro === 0n)
        invalid(
          'daily rent rounds to zero; explicit higher precision policy needed',
        );
      const daily = microMoney(dailyMicro, f.currency),
        last = microMoney(finalMicro, f.currency),
        poolId = `${r.id}_PRIVATE_POOL`;
      pools.push({
        poolId,
        locationId: r.locationId,
        landlordGroupId: rule.landlordGroupRef,
        totalUnits: privateTitle[0]!.units,
        habitableUnits: privateTitle[0]!.habitableUnits,
        ownerOccupiedUnits: r.cohorts[0]!.households,
      });
      const leaseIds = [`${rule.id}_DAYS_1_359`, `${rule.id}_DAY_360`];
      const common = {
        poolId,
        landlordGroupId: rule.landlordGroupRef,
        tenantGroupId: rule.tenantGroupRef,
        firstHouseholdOrdinal: '0',
        households: rule.households,
        periodTicks: day.toString(),
        currency: f.currency,
        genesisRightsRef: rule.id,
      };
      leases.push(
        {
          ...common,
          leaseId: leaseIds[0]!,
          startTick: '1',
          endTick: (1n + 359n * day).toString(),
          rentPerHouseholdPerPeriod: daily,
        },
        {
          ...common,
          leaseId: leaseIds[1]!,
          startTick: (1n + 359n * day).toString(),
          endTick: (1n + 360n * day).toString(),
          rentPerHouseholdPerPeriod: last,
        },
      );
      termDrafts.push({
        locationId: r.locationId,
        countryId: r.countryId,
        annualRentObligationId: rule.id,
        annualAmountPerHousehold: rule.perHousehold.amount,
        currency: f.currency,
        fxVersion: fx.openingFx.version,
        dailyAmountPerHousehold: daily,
        finalDayAmountPerHousehold: last,
        landlordGroupRef: rule.landlordGroupRef,
        tenantGroupRef: rule.tenantGroupRef,
        firstDayDue: canonicalDecimal(
          Money.from(daily, f.currency).amount.times(rule.households),
        ),
        leaseIds,
      });
    }
    const reclassified = reclassifyBeneficialHousingSeed(
      {
        seed: parent,
        allocationId: `POSTWAR_BENEFICIAL_ALLOCATION_${f.countryId}`,
        policyRef: `apps/world-worker/src/preparation/postwar-housing-rent-bindings.ts#sha256:${policySha256}`,
        sourcePopulationRef: `HOUSING_${input.housing.fingerprint}_POLICY_${input.housing.policySha256}`,
        countryId: f.countryId,
        householdEntityId: f.ownerId,
        parentAccountId: f.accountId,
        regions: regions.map((r) => ({
          locationId: r.locationId,
          households: r.source.households,
          population: r.source.population,
        })),
        groups,
        pools,
        leases,
      },
      hash,
    );
    const source = reclassified.seed.sources.find(
        (s) => s.sourceId === reclassified.receipt.supplementalSourceId,
      )!,
      batch = reclassified.seed.financialBatches.find(
        (b) => b.batchId === reclassified.receipt.reclassificationBatchId,
      )!;
    countries.push({
      countryId: f.countryId,
      receipt: reclassified.receipt,
      source,
      batch,
      initialRentState: createBeneficialHousingRentState(reclassified.receipt),
    });
  }
  const seed = createOpeningSeed(
    {
      ...parent,
      sources: [...parent.sources, ...countries.map((c) => c.source)],
      financialBatches: [
        ...parent.financialBatches,
        ...countries.map((c) => c.batch),
      ],
    },
    hash,
  );
  const ledger = rebuildV08LedgersFromLineage({ seed, sha256Hex: hash });
  const accounts: PostwarHousingBeneficialAccount[] = [],
    aggregateHouseholdClaims: PostwarHousingRentBindings['aggregateHouseholdClaims'][number][] =
      [];
  for (const c of countries) {
    const total = aggregateBeneficialHousingLiquidClaim(
      ledger.financial,
      c.receipt,
    );
    aggregateHouseholdClaims.push({
      countryId: c.countryId,
      originAccountId: total.originalAccountId,
      claimId: total.claimId,
      currency: total.currency,
      amount: total.availableAmount,
      spendable: false,
    });
    for (const a of total.subaccounts)
      accounts.push({
        kind: 'HOUSEHOLD_BENEFICIAL_GROUP_DEPOSIT',
        countryId: c.countryId,
        ownerId: total.ownerId,
        groupId: a.groupId,
        originAccountId: total.originalAccountId,
        accountId: a.account.accountId,
        claimId: total.claimId,
        counterpartLiabilityAccountId: total.counterpartLiabilityAccountId,
        currency: total.currency,
        availableAmount: a.availableAmount,
        account: a.account,
      });
  }
  const terms = termDrafts.map((t) => {
    const account = accounts.find((a) => a.groupId === t.tenantGroupRef);
    if (!account) invalid('missing actual tenant beneficial balance');
    const initialCashCoversFirstDay = Money.from(
      account.availableAmount,
      t.currency,
    ).amount.greaterThanOrEqualTo(Money.from(t.firstDayDue, t.currency).amount);
    return {
      ...t,
      initialTenantCash: account.availableAmount,
      initialCashCoversFirstDay,
    };
  });
  const originalBatches = new Set(
    parent.financialBatches.map((b) => b.batchId),
  );
  equal(
    seed.financialBatches.filter((b) => originalBatches.has(b.batchId)),
    parent.financialBatches,
    'original financial batches changed',
  );
  equal(
    seed.inventoryEntries,
    parent.inventoryEntries,
    'original source inventory changed',
  );
  const parentLedger = rebuildV08LedgersFromLineage({
      seed: parent,
      sha256Hex: hash,
    }),
    hhClaims = new Set(funding.map((f) => f.claimId));
  equal(
    ledger.financial.positions.filter(
      (p) =>
        !(
          p.account.ownerId.startsWith('ENTITY_HOUSEHOLDS_') &&
          hhClaims.has(p.account.claimId ?? '')
        ),
    ),
    parentLedger.financial.positions.filter(
      (p) =>
        !(
          p.account.ownerId.startsWith('ENTITY_HOUSEHOLDS_') &&
          hhClaims.has(p.account.claimId ?? '')
        ),
    ),
    'GOV/OP/bank/other accounts changed',
  );
  const payload = {
    schemaVersion: 'postwar-housing-rent-bindings.v1' as const,
    classification:
      'SEPARATE_GENERATED_BENEFICIAL_HOUSING_SOURCE_FAMILY_NOT_ADOPTED' as const,
    housingFingerprint: input.housing.fingerprint,
    policy: POSTWAR_HOUSING_BENEFICIAL_POLICY,
    policySha256,
    parentSeed: parent,
    seed,
    countries,
    accounts,
    aggregateHouseholdClaims,
    privateRentTerms: terms,
    publicRentRules: input.housing.regions.flatMap((r) =>
      r.rentObligations.filter(
        (o) => o.payerEntityId !== o.beneficiaryEntityId,
      ),
    ),
    householdCount: input.housing.totals.households,
    population: input.housing.totals.population,
    leaseSegmentCount: countries
      .reduce((n, c) => n + BigInt(c.receipt.leases.length), 0n)
      .toString(),
    defaultHostCommandFamily: 'NOT_REGISTERED' as const,
    defaultHostReducer: 'NOT_REGISTERED' as const,
    sourceConsumer:
      'NEW_BOUNDED_SOURCE_FAMILY_REQUIRES_EXPLICIT_V3_VALIDATOR_AND_PARENT_PROOF' as const,
    replayContract:
      'NARROW_CORE_DOMAIN_AND_FINANCIAL_LINEAGE_PROOF_ONLY_NOT_DEFAULT_HOST_REGISTRY' as const,
    requiredHostIntegration: [
      'FIXED_SERVER_SOURCE_CONSUMER_FOR_BENEFICIAL_RECLASSIFICATION_FAMILY',
      'AUTHORITATIVE_COMMAND_HANDLER_AND_REDUCER_REGISTRATION',
      'EXPLICIT_VERSIONED_REPLAY_DISPATCH_WITHOUT_MUTATING_EXISTING_REPLAY_BINDING',
      'ATOMIC_RIGHTS_AND_FINANCIAL_POSTING_PERSISTENCE',
      'FUTURE_WAGE_ROUTING_TO_EXISTING_BENEFICIAL_ACCOUNT_IDS',
    ],
    productionAdmission: false as const,
    WorldClock: false as const,
  };
  const result = freeze({
    ...payload,
    fingerprint: hash(canonicalSerialize(payload)),
  });
  issued.add(result);
  const byHousing =
    cache.get(input.financial) ?? new Map<string, PostwarHousingRentBindings>();
  byHousing.set(input.housing.fingerprint, result);
  cache.set(input.financial, byHousing);
  return result;
}
/** A country receipt refers to the independent parent+one-source child, while
 * the composed seed contains all 70 sources. Rebuild that exact child before
 * Core verification; never pretend its fingerprint is the composed fingerprint. */
export function verifyPostwarHousingRentReclassificationFamily(input: {
  parentSeed: OpeningSeed;
  seed: OpeningSeed;
  receipts: readonly BeneficialHousingReclassificationReceipt[];
}) {
  const { parentSeed, seed } = input;
  if (seed.worldId !== parentSeed.worldId || seed.seedId !== parentSeed.seedId)
    invalid('composed seed/world scope differs');
  equal(
    seed.replayBinding,
    parentSeed.replayBinding,
    'existing replay binding changed',
  );
  rebuildV08LedgersFromLineage({ seed: parentSeed, sha256Hex: hash });
  const ledger = rebuildV08LedgersFromLineage({ seed, sha256Hex: hash });
  if (
    input.receipts.length !== 70 ||
    new Set(input.receipts.map((r) => r.countryId)).size !== 70
  )
    invalid('complete unique country receipt family required');
  const sourceIds = new Set(parentSeed.sources.map((s) => s.sourceId)),
    batchIds = new Set(parentSeed.financialBatches.map((b) => b.batchId));
  const verified = input.receipts.map((r) => {
    if (r.parentSeedFingerprint !== parentSeed.fingerprint)
      invalid('receipt has wrong financial parent');
    const source = seed.sources.find(
        (s) => s.sourceId === r.supplementalSourceId,
      ),
      batch = seed.financialBatches.find(
        (b) => b.batchId === r.reclassificationBatchId,
      );
    if (
      !source ||
      !batch ||
      sourceIds.has(source.sourceId) ||
      batchIds.has(batch.batchId)
    )
      invalid('missing/repeated source or reclassification batch');
    sourceIds.add(source.sourceId);
    batchIds.add(batch.batchId);
    const child = createOpeningSeed(
      {
        ...parentSeed,
        sources: [...parentSeed.sources, source],
        financialBatches: [...parentSeed.financialBatches, batch],
      },
      hash,
    );
    const receipt = verifyBeneficialHousingReclassification(
      parentSeed,
      child,
      r,
      hash,
    );
    return {
      receipt,
      aggregate: aggregateBeneficialHousingLiquidClaim(
        ledger.financial,
        receipt,
      ),
    };
  });
  if (
    sourceIds.size !== seed.sources.length ||
    batchIds.size !== seed.financialBatches.length
  )
    invalid('unexplained source/batch in composed beneficial seed');
  equal(
    seed.inventoryEntries,
    parentSeed.inventoryEntries,
    'composed seed inventory changed',
  );
  equal(
    seed.sources.filter((s) =>
      parentSeed.sources.some((p) => p.sourceId === s.sourceId),
    ),
    parentSeed.sources,
    'original source bytes changed',
  );
  equal(
    seed.financialBatches.filter((b) =>
      parentSeed.financialBatches.some((p) => p.batchId === b.batchId),
    ),
    parentSeed.financialBatches,
    'original parent batches changed',
  );
  return freeze(verified);
}
