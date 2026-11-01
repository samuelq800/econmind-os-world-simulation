/** Prospective opening DATA only. Retains the full canonical parent and derives
 * distinct beneficial housing sources under the already versioned rules. No
 * World reset, DB registration, source admission, Clock or due command occurs. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  createOpeningSeed,
  reclassifyBeneficialHousingSeed,
  rebuildV08LedgersFromLineage,
  aggregateBeneficialHousingLiquidClaim,
  SIMULATION_TICKS_PER_DAY,
  Money,
  type OpeningSeed,
  type BeneficialHousingReclassificationInput,
  type BeneficialHousingReclassificationReceipt,
} from '@econmind/core';
import {
  requirePostwarSha256OpeningSeed,
  readPostwarOperatingGenesisFromSeed,
} from './postwar-operating-genesis-adoption.js';
import { readPostwarLiquidFundingAccountsFromSeed } from './postwar-financial-genesis.js';
import { POSTWAR_HOUSING_POLICY_SHA256 } from './postwar-housing-genesis.js';
import { POSTWAR_HOUSING_BENEFICIAL_POLICY } from './postwar-housing-rent-bindings.js';
import {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
} from '../persistence/postwar-beneficial-housing-rent-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw Error('POSTWAR_BENEFICIAL_RENT_CANDIDATE:' + reason);
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('SOURCE_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('EXACT_SOURCE_TEXT_REQUIRED');
  return v;
}
function sourceBytes(v: unknown): string {
  if (typeof v !== 'string' || !v) invalid('EXACT_SOURCE_BYTES_REQUIRED');
  return v;
}
function uint(v: unknown): string {
  const s = text(v);
  if (!/^(0|[1-9]\d*)$/u.test(s)) invalid('SOURCE_INTEGER_REQUIRED');
  return s;
}
function array(v: unknown): readonly unknown[] {
  if (!Array.isArray(v)) invalid('SOURCE_ARRAY_REQUIRED');
  return v;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function micro(n: bigint, currency: string): string {
  return Money.from(
    `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, '0')}`,
    currency,
  ).toCanonicalValue().amount;
}
export interface PostwarBeneficialHousingRentCandidate {
  readonly classification: 'PROSPECTIVE_OPENING_DATA_NOT_CURRENT_WORLD_ADMISSION';
  readonly parentSeed: Readonly<OpeningSeed>;
  readonly seed: Readonly<OpeningSeed>;
  readonly receipts: readonly Readonly<BeneficialHousingReclassificationReceipt>[];
  readonly housingDocument: {
    readonly sourceId: string;
    readonly documentId: 'RAW_HOUSING';
    readonly path: string;
    readonly sha256: string;
    readonly housingFingerprint: string;
    readonly housingPolicySha256: string;
    readonly beneficialPolicySha256: string;
  };
  readonly annualRules: readonly {
    readonly countryId: string;
    readonly locationId: string;
    readonly ruleRef: string;
    readonly currency: string;
    readonly households: string;
    readonly annualPerHousehold: string;
    readonly dailyPerHousehold: string;
    readonly finalDayPerHousehold: string;
  }[];
  readonly population: string;
  readonly households: string;
  readonly sourceCountBefore: number;
  readonly sourceCountAfter: number;
  readonly additionalSources: 70;
  readonly additionalOpeningBatches: 70;
  readonly openingRentPaid: '0';
  readonly openingRentAccrued: '0';
  readonly WorldClock: false;
  readonly productionAdmission: false;
}
export interface PostwarBeneficialHousingRentCandidateVerification {
  readonly classification: 'FULL_PARENT_AND_CORE_RECLASSIFICATION_VERIFIED_NOT_ADMISSION';
  readonly parentFingerprint: string;
  readonly candidateFingerprint: string;
  readonly countries: 70;
  readonly population: string;
  readonly households: string;
  readonly retainedParentSources: number;
  readonly candidateSources: number;
  readonly retainedInventoryEntries: number;
  readonly generatedSources: 70;
  readonly exactLegalHouseholdClaims: true;
  readonly exactNonHouseholdAccounts: true;
  readonly openingRentPaid: '0';
  readonly openingRentAccrued: '0';
}
const generated = new WeakSet<object>(),
  cache = new WeakMap<
    object,
    Readonly<PostwarBeneficialHousingRentCandidate>
  >();
/** Validate the parent through its real source reader; then project the exact
 * retained generated document, without impersonating its old private issuer. */
function housingFromParent(parent: Readonly<OpeningSeed>) {
  const view = readPostwarOperatingGenesisFromSeed(parent);
  if (view.seedFingerprint !== parent.fingerprint)
    invalid('EXACT_PARENT_SOURCE_VIEW_REQUIRED');
  const matches: { sourceId: string; carrier: Record<string, unknown> }[] = [];
  for (const source of parent.sources) {
    const p = record(JSON.parse(source.canonicalPayload));
    if (p.schemaVersion === 'postwar-operating-genesis-seed-source-v1')
      matches.push({ sourceId: source.sourceId, carrier: record(p.carrier) });
  }
  if (matches.length !== 1) invalid('ONE_RETAINED_OPERATING_SOURCE_REQUIRED');
  const source = matches[0]!,
    docs = array(source.carrier.documents).map(record),
    raw = docs.filter((d) => d.documentId === 'RAW_HOUSING'),
    policy = docs.filter((d) => d.documentId === 'POLICY_HOUSING');
  if (raw.length !== 1 || policy.length !== 1)
    invalid('RETAINED_HOUSING_AND_POLICY_DOCUMENT_REQUIRED');
  const doc = raw[0]!,
    bytes = sourceBytes(doc.bytes),
    policyBytes = sourceBytes(policy[0]!.bytes);
  if (
    sha(bytes) !== doc.sha256 ||
    sha(policyBytes) !== policy[0]!.sha256 ||
    sha(policyBytes) !== POSTWAR_HOUSING_POLICY_SHA256
  )
    invalid('EXACT_VERSIONED_HOUSING_BYTES_REQUIRED');
  const housing = record(JSON.parse(bytes)),
    { fingerprint, ...body } = housing;
  if (
    housing.schemaVersion !== 'postwar-housing-genesis.v1' ||
    housing.classification !== 'GENERATED_POLICY_BOUND_TO_PINNED_SOURCE' ||
    housing.policySha256 !== POSTWAR_HOUSING_POLICY_SHA256 ||
    fingerprint !== sha(canonicalSerialize(body))
  )
    invalid('EXACT_RETAINED_HOUSING_MODEL_REQUIRED');
  const regions = array(housing.regions).map(record);
  if (
    regions.length !== view.facts.regions.length ||
    new Set(regions.map((r) => text(r.locationId))).size !== regions.length
  )
    invalid('COMPLETE_UNIQUE_RETAINED_HOUSING_REGIONS_REQUIRED');
  for (const r of regions) {
    const location = text(r.locationId),
      country = text(r.countryId),
      selected = view.facts.regions.filter(
        (x) => x.regionId === location && x.countryId === country,
      );
    const source = record(r.source),
      people = view.facts.people
        .filter((p) => p.regionId === location)
        .reduce((n, p) => n + BigInt(p.count), 0n),
      households = view.facts.housing
        .filter((p) => p.regionId === location)
        .reduce((n, p) => n + BigInt(p.households), 0n);
    if (
      selected.length !== 1 ||
      people.toString() !== uint(source.population) ||
      households.toString() !== uint(source.households) ||
      record(r.generated).policySha256 !== POSTWAR_HOUSING_POLICY_SHA256
    )
      invalid('ACTUAL_PARENT_POPULATION_AND_HOUSEHOLD_SOURCE_REQUIRED');
  }
  return {
    regions,
    reference: {
      sourceId: source.sourceId,
      documentId: 'RAW_HOUSING' as const,
      path: text(doc.path),
      sha256: sha(bytes),
      housingFingerprint: text(fingerprint),
      housingPolicySha256: POSTWAR_HOUSING_POLICY_SHA256,
      beneficialPolicySha256: sha(
        canonicalSerialize(POSTWAR_HOUSING_BENEFICIAL_POLICY),
      ),
    },
  };
}
/** Fixed rule reuse: four existing tenure cohorts, actual existing LC bank
 * claim, 359 six-decimal floors then the exact annual remainder. No new value. */
export function preparePostwarBeneficialHousingRentCandidate(input: {
  readonly parentSeed: Readonly<OpeningSeed>;
}): Readonly<PostwarBeneficialHousingRentCandidate> {
  const parent = requirePostwarSha256OpeningSeed(input.parentSeed);
  const prior = cache.get(parent);
  if (prior) return prior;
  if (
    parent.openingWorldVersion !== '0' ||
    parent.sources.some(
      (s) => s.sourceVersion === 'POSTWAR_BENEFICIAL_HOUSING_V1',
    )
  )
    invalid('UNMODIFIED_NON_BENEFICIAL_OPENING_PARENT_REQUIRED');
  const housing = housingFromParent(parent),
    funding = readPostwarLiquidFundingAccountsFromSeed(parent)
      .filter((f) => f.kind === 'HOUSEHOLD_BANK_DEPOSIT')
      .sort((a, b) => a.countryId.localeCompare(b.countryId));
  if (
    funding.length !== 70 ||
    new Set(funding.map((f) => f.countryId)).size !== 70
  )
    invalid('COMPLETE_SEVENTY_LEGAL_HOUSEHOLD_CLAIMS_REQUIRED');
  const receipts: BeneficialHousingReclassificationReceipt[] = [],
    sources: OpeningSeed['sources'][number][] = [],
    batches: OpeningSeed['financialBatches'][number][] = [];
  const annualRules: PostwarBeneficialHousingRentCandidate['annualRules'][number][] =
    [];
  let population = 0n,
    households = 0n;
  for (const f of funding) {
    const regions = housing.regions
      .filter((r) => r.countryId === f.countryId)
      .sort((a, b) => text(a.locationId).localeCompare(text(b.locationId)));
    if (!regions.length) invalid('COUNTRY_HOUSING_SOURCE_REQUIRED');
    const groups: BeneficialHousingReclassificationInput['groups'][number][] =
        [],
      pools: BeneficialHousingReclassificationInput['pools'][number][] = [],
      leases: BeneficialHousingReclassificationInput['leases'][number][] = [];
    for (const r of regions) {
      const locationId = text(r.locationId),
        s = record(r.source),
        cohorts = array(r.cohorts).map(record),
        monetary = record(r.monetary);
      if (
        cohorts.length !== 4 ||
        monetary.currency !== f.currency ||
        monetary.period !== 'SIM_YEAR'
      )
        invalid('EXACT_COHORTS_AND_LOCAL_CURRENCY_REQUIRED');
      let h = 0n,
        p = 0n;
      for (const c of cohorts) {
        const role = text(c.tenure);
        if (
          ![
            'OWNER_OCCUPIER',
            'PRIVATE_RENTER',
            'PUBLIC_RENTER',
            'DISPLACED',
          ].includes(role) ||
          c.householdEntityId !== f.ownerId
        )
          invalid('RETAINED_LEGAL_OWNER_AND_TENURE_REQUIRED');
        groups.push({
          groupId: text(c.id),
          locationId,
          role: role as BeneficialHousingReclassificationInput['groups'][number]['role'],
          firstHouseholdOrdinal: h.toString(),
          households: uint(c.households),
          firstPersonOrdinal: p.toString(),
          population: uint(c.population),
        });
        h += BigInt(uint(c.households));
        p += BigInt(uint(c.population));
      }
      if (
        h.toString() !== uint(s.households) ||
        p.toString() !== uint(s.population)
      )
        invalid('EXACT_EXISTING_POPULATION_PARTITION_REQUIRED');
      population += p;
      households += h;
      const titles = array(r.titles)
          .map(record)
          .filter(
            (t) =>
              t.titleHolderId === f.ownerId &&
              t.beneficialOwnerGroupRef === cohorts[0]!.id,
          ),
        rules = array(r.rentObligations)
          .map(record)
          .filter(
            (o) =>
              o.payerEntityId === f.ownerId &&
              o.beneficiaryEntityId === f.ownerId &&
              o.settlement === 'REQUIRES_CORE_BENEFICIAL_GROUP_SETTLEMENT',
          );
      if (titles.length !== 1 || rules.length !== 1)
        invalid('EXACT_PRIVATE_TITLE_AND_ANNUAL_RULE_REQUIRED');
      const title = titles[0]!,
        rule = rules[0]!,
        per = record(rule.perHousehold),
        total = record(rule.annualTotal),
        tenant = cohorts[1]!;
      if (
        rule.period !== 'SIM_YEAR' ||
        rule.landlordGroupRef !== cohorts[0]!.id ||
        rule.tenantGroupRef !== tenant.id ||
        rule.households !== tenant.households ||
        per.currency !== f.currency ||
        total.currency !== f.currency ||
        rule.accruedAtT0 !== '0' ||
        rule.paidAtT0 !== '0' ||
        rule.outstandingDebtAtT0 !== '0' ||
        rule.contractCreated !== false ||
        rule.rightsClassification !== 'GENESIS_RIGHTS_NOT_EXECUTED_LEASE' ||
        rule.rightsVersion !== 'POSTWAR_GENESIS_HOUSING_RIGHTS_V1' ||
        rule.rightsPolicySha256 !== POSTWAR_HOUSING_POLICY_SHA256
      )
        invalid('ORIGINAL_FUTURE_UNPAID_RENT_RULE_REQUIRED');
      const annual = Money.from(text(per.amount), f.currency),
        annualTotal = Money.from(text(total.amount), f.currency),
        scaled = annual.amount.times('1000000');
      if (
        !scaled.isInteger() ||
        !scaled.isPositive() ||
        !annualTotal.amount.equals(annual.amount.times(uint(rule.households)))
      )
        invalid('EXACT_ANNUAL_RENT_SOURCE_REQUIRED');
      const annualMicro = BigInt(scaled.toFixed(0)),
        daily = annualMicro / 360n,
        final = annualMicro - 359n * daily;
      if (daily === 0n)
        invalid('EXISTING_SIX_DECIMAL_DAILY_POLICY_CANNOT_REPRESENT_SOURCE');
      const poolId = text(r.id) + '_PRIVATE_POOL',
        day = BigInt(SIMULATION_TICKS_PER_DAY),
        common = {
          poolId,
          landlordGroupId: text(rule.landlordGroupRef),
          tenantGroupId: text(rule.tenantGroupRef),
          firstHouseholdOrdinal: '0',
          households: uint(rule.households),
          periodTicks: day.toString(),
          currency: f.currency,
          genesisRightsRef: text(rule.id),
        };
      pools.push({
        poolId,
        locationId,
        landlordGroupId: common.landlordGroupId,
        totalUnits: uint(title.units),
        habitableUnits: uint(title.habitableUnits),
        ownerOccupiedUnits: uint(cohorts[0]!.households),
      });
      leases.push(
        {
          ...common,
          leaseId: text(rule.id) + '_DAYS_1_359',
          startTick: '1',
          endTick: (1n + 359n * day).toString(),
          rentPerHouseholdPerPeriod: micro(daily, f.currency),
        },
        {
          ...common,
          leaseId: text(rule.id) + '_DAY_360',
          startTick: (1n + 359n * day).toString(),
          endTick: (1n + 360n * day).toString(),
          rentPerHouseholdPerPeriod: micro(final, f.currency),
        },
      );
      annualRules.push({
        countryId: f.countryId,
        locationId,
        ruleRef: text(rule.id),
        currency: f.currency,
        households: uint(rule.households),
        annualPerHousehold: annual.toCanonicalValue().amount,
        dailyPerHousehold: micro(daily, f.currency),
        finalDayPerHousehold: micro(final, f.currency),
      });
    }
    const child = reclassifyBeneficialHousingSeed(
      {
        seed: parent,
        allocationId: 'POSTWAR_BENEFICIAL_ALLOCATION_' + f.countryId,
        policyRef:
          'apps/world-worker/src/preparation/postwar-housing-rent-bindings.ts#sha256:' +
          housing.reference.beneficialPolicySha256,
        sourcePopulationRef:
          'HOUSING_' +
          housing.reference.housingFingerprint +
          '_POLICY_' +
          housing.reference.housingPolicySha256,
        countryId: f.countryId,
        householdEntityId: f.ownerId,
        parentAccountId: f.accountId,
        regions: regions.map((r) => ({
          locationId: text(r.locationId),
          households: uint(record(r.source).households),
          population: uint(record(r.source).population),
        })),
        groups,
        pools,
        leases,
      },
      sha,
    );
    receipts.push(child.receipt);
    sources.push(
      child.seed.sources.find(
        (s) => s.sourceId === child.receipt.supplementalSourceId,
      )!,
    );
    batches.push(
      child.seed.financialBatches.find(
        (b) => b.batchId === child.receipt.reclassificationBatchId,
      )!,
    );
  }
  const seed = createOpeningSeed(
    {
      ...parent,
      sources: [...parent.sources, ...sources],
      financialBatches: [...parent.financialBatches, ...batches],
    },
    sha,
  );
  if (
    seed.fingerprint === parent.fingerprint ||
    !same(seed.inventoryEntries, parent.inventoryEntries)
  )
    invalid('DISTINCT_CANDIDATE_AND_RETAINED_INVENTORY_REQUIRED');
  const candidate = freeze<PostwarBeneficialHousingRentCandidate>({
    classification: 'PROSPECTIVE_OPENING_DATA_NOT_CURRENT_WORLD_ADMISSION',
    parentSeed: parent,
    seed,
    receipts,
    housingDocument: housing.reference,
    annualRules,
    population: population.toString(),
    households: households.toString(),
    sourceCountBefore: parent.sources.length,
    sourceCountAfter: seed.sources.length,
    additionalSources: 70,
    additionalOpeningBatches: 70,
    openingRentPaid: '0',
    openingRentAccrued: '0',
    WorldClock: false,
    productionAdmission: false,
  });
  generated.add(candidate);
  cache.set(parent, candidate);
  return candidate;
}
/** Strip only a complete, independently Core-verified seventy-country delta.
 * The restored object is ordinary genuine opening data, never admission. The
 * receipt parent fingerprint commits to ALL retained source bytes, inventory
 * and financial opening batches; extra/omitted/changed data cannot be hidden. */
function reconstructParent(input: {
  readonly seed: Readonly<OpeningSeed>;
  readonly receipts: readonly Readonly<BeneficialHousingReclassificationReceipt>[];
}): Readonly<OpeningSeed> {
  const seed = requirePostwarSha256OpeningSeed(input.seed),
    receipts = input.receipts;
  if (
    receipts.length !== 70 ||
    new Set(receipts.map((r) => r.countryId)).size !== 70 ||
    new Set(receipts.map((r) => r.parentSeedFingerprint)).size !== 1
  )
    invalid('COMPLETE_SEVENTY_COUNTRY_PARENT_PROOF_REQUIRED');
  const sourceIds = new Set(receipts.map((r) => r.supplementalSourceId)),
    batchIds = new Set(receipts.map((r) => r.reclassificationBatchId));
  if (
    sourceIds.size !== 70 ||
    batchIds.size !== 70 ||
    seed.sources.filter((s) => sourceIds.has(s.sourceId)).length !== 70 ||
    seed.financialBatches.filter((b) => batchIds.has(b.batchId)).length !== 70
  )
    invalid('EXACT_SEVENTY_SOURCE_BATCH_DELTA_REQUIRED');
  const parent = createOpeningSeed(
    {
      ...seed,
      sources: seed.sources.filter((s) => !sourceIds.has(s.sourceId)),
      financialBatches: seed.financialBatches.filter(
        (b) => !batchIds.has(b.batchId),
      ),
    },
    sha,
  );
  if (parent.fingerprint !== receipts[0]!.parentSeedFingerprint)
    invalid('RESTORED_PARENT_FINGERPRINT_MISMATCH');
  return parent;
}
export function restorePostwarBeneficialHousingRentParent(input: {
  readonly seed: Readonly<OpeningSeed>;
  readonly receipts: readonly Readonly<BeneficialHousingReclassificationReceipt>[];
}): Readonly<OpeningSeed> {
  const parent = reconstructParent(input);
  const token = prepareBeneficialHousingRentSource({
    parentSeed: parent,
    seed: input.seed,
    receipts: input.receipts,
  });
  retireBeneficialHousingRentSource(token);
  return parent;
}
/** Full actual Core proof, not label admission. The candidate alone cannot
 * replace the old immutable opening row or register its new fingerprint. */
export function verifyPostwarBeneficialHousingRentCandidate(input: {
  readonly parentSeed: Readonly<OpeningSeed>;
  readonly seed: Readonly<OpeningSeed>;
  readonly receipts: readonly Readonly<BeneficialHousingReclassificationReceipt>[];
}): Readonly<PostwarBeneficialHousingRentCandidateVerification> {
  const parent = requirePostwarSha256OpeningSeed(input.parentSeed),
    seed = requirePostwarSha256OpeningSeed(input.seed),
    expected = preparePostwarBeneficialHousingRentCandidate({
      parentSeed: parent,
    });
  const restored = reconstructParent({
    seed,
    receipts: input.receipts,
  });
  if (restored.fingerprint !== parent.fingerprint)
    invalid('EXACT_RESTORED_PARENT_REQUIRED');
  if (
    seed.fingerprint !== expected.seed.fingerprint ||
    !same(input.receipts, expected.receipts) ||
    !same(seed.inventoryEntries, parent.inventoryEntries)
  )
    invalid('EXACT_DETERMINISTIC_PARENT_CHILD_AND_RECEIPTS_REQUIRED');
  for (const original of parent.sources) {
    const values = seed.sources.filter((s) => s.sourceId === original.sourceId);
    if (values.length !== 1 || !same(values[0], original))
      invalid('PARENT_SOURCE_BYTES_CHANGED');
  }
  const token = prepareBeneficialHousingRentSource({
    parentSeed: parent,
    seed,
    receipts: input.receipts,
  });
  try {
    const after = consumeBeneficialHousingRentSource(token).openingFinancial,
      before = rebuildV08LedgersFromLineage({
        seed: parent,
        sha256Hex: sha,
      }).financial,
      claims = new Set<string>(input.receipts.map((r) => r.claimId));
    for (const receipt of input.receipts)
      if (
        aggregateBeneficialHousingLiquidClaim(after, receipt)
          .availableAmount !== receipt.originalAmount
      )
        invalid('LEGAL_HOUSEHOLD_CLAIM_CHANGED');
    const outside = (f: typeof before) =>
      f.positions.filter(
        (p) =>
          !(
            p.account.ownerId.startsWith('ENTITY_HOUSEHOLDS_') &&
            claims.has(p.account.claimId ?? '')
          ),
      );
    if (!same(outside(before), outside(after)))
      invalid('NON_HOUSEHOLD_OR_BANK_MIRROR_CHANGED');
    return freeze({
      classification:
        'FULL_PARENT_AND_CORE_RECLASSIFICATION_VERIFIED_NOT_ADMISSION',
      parentFingerprint: parent.fingerprint,
      candidateFingerprint: seed.fingerprint,
      countries: 70,
      population: expected.population,
      households: expected.households,
      retainedParentSources: parent.sources.length,
      candidateSources: seed.sources.length,
      retainedInventoryEntries: parent.inventoryEntries.length,
      generatedSources: 70,
      exactLegalHouseholdClaims: true,
      exactNonHouseholdAccounts: true,
      openingRentPaid: '0',
      openingRentAccrued: '0',
    });
  } finally {
    retireBeneficialHousingRentSource(token);
  }
}
export function isPostwarBeneficialHousingRentCandidate(
  value: unknown,
): value is Readonly<PostwarBeneficialHousingRentCandidate> {
  return !!value && typeof value === 'object' && generated.has(value);
}
