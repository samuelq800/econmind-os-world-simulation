/** Supplementary t0 physical endowment only. Never cash, procurement, delivery,
 * historical service, operational readiness or an edit of the selected source. */
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';
import {
  isVerifiedOfficialOpeningDecisionSource,
  type VerifiedOfficialOpeningSource,
} from './official-opening-decision-reconciliation.js';

export const POSTWAR_SUPPLIES_POLICY_SHA256 =
  '86710ed9a6cd18425b7d06badc0ec1c7aa78a80f1feaa2e5cadd9edcad94416a';
export const POSTWAR_SUPPLIES_POLICY_PATH =
  'config/postwar-genesis/supplies.v1.json';
type Kind = 'MEDICINE' | 'SCHOOL_MATERIALS';
type Row = Readonly<Record<string, unknown>>;
const issued = new WeakSet<object>();
const boundPlans = new Map<
  string,
  { canonicalRequests: string; plan: PostwarSupplyAllocation }
>();
const allocations = new WeakSet<object>();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new Error(`POSTWAR_SUPPLIES_INVALID: ${s}`);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('canonical text required');
  return v;
}
function whole(v: unknown): bigint {
  const s = text(v).replace(/\.0+$/u, '');
  if (!/^(0|[1-9]\d*)$/u.test(s)) invalid('exact nonnegative integer required');
  return BigInt(s);
}
function ratio(v: unknown): { n: bigint; d: bigint } {
  const s = text(v);
  if (!/^(0|[1-9]\d*)(\.\d+)?$/u.test(s))
    invalid('exact nonnegative decimal required');
  const [i, f = ''] = s.split('.');
  return { n: BigInt(i! + f), d: 10n ** BigInt(f.length) };
}
function bps(v: unknown) {
  const r = ratio(v);
  if (r.n > r.d) invalid('fraction exceeds one');
  return (r.n * 10000n) / r.d;
}
function row(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('record required');
  return v as Row;
}
function rows(bytes: string): readonly Row[] {
  const parse = JSON.parse as (
    s: string,
    r: (k: string, v: unknown, c: { source?: string }) => unknown,
  ) => unknown;
  const v = parse(bytes, (_k, x, c) => {
    if (typeof x !== 'number') return x;
    if (typeof c.source !== 'string') invalid('lossless JSON context required');
    return c.source;
  });
  if (!Array.isArray(v)) invalid('rows required');
  return v.map(row);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
export interface PostwarSupplyStock {
  readonly kind: Kind;
  readonly countryId: string;
  readonly locationId: string;
  readonly serviceAssetId: string;
  readonly dailyBasis: string;
  readonly coverageSimDays: string;
  readonly recoveryBps: string;
  readonly sourceBufferDays: string;
  readonly entry: Readonly<C.OpeningInventoryEntry>;
  readonly sourceReferences: readonly {
    readonly path: string;
    readonly pointer: string;
    readonly sha256: string;
  }[];
}
export interface PostwarOperatingSupplies {
  readonly schemaVersion: 'postwar-operating-supplies.v1';
  readonly classification: 'GENERATED_POLICY_NEW_DOMAIN_PHYSICAL_ENDOWMENT';
  readonly worldId: string;
  readonly seedId: string;
  readonly sourceChecksumsSha256: string;
  readonly policySha256: string;
  readonly source: Readonly<C.OpeningSource>;
  readonly stocks: readonly PostwarSupplyStock[];
  readonly totals: Readonly<
    Record<
      Kind,
      {
        readonly amount: string;
        readonly commodityId: string;
        readonly unit: string;
      }
    >
  >;
  readonly remainingPrerequisites: readonly [
    'FINITE_AUTHORIZED_WATER',
    'FINITE_AUTHORIZED_POWER',
    'FINITE_EQUIPMENT',
    'ACTUAL_FILLED_STAFF',
    'AUTHORIZED_LOCAL_CURRENCY_BUDGET',
  ];
  readonly serviceReadinessEstablished: false;
  readonly financialBatches: readonly [];
  readonly historicalProcurementOrServiceEvents: readonly [];
  readonly fingerprint: string;
}
export function isPostwarOperatingSupplies(
  v: unknown,
): v is PostwarOperatingSupplies {
  return typeof v === 'object' && v !== null && issued.has(v);
}
export function buildPostwarOperatingSupplies(input: {
  readonly source: VerifiedOfficialOpeningSource;
  readonly adoption: OfficialLabourSocialOpeningAdoption;
  readonly mappingBytes: string;
  readonly countriesBytes: string;
  readonly regionsBytes: string;
  readonly worldId: string;
  readonly seedId: string;
  readonly policyBytes: string;
}): PostwarOperatingSupplies {
  if (!isVerifiedOfficialOpeningDecisionSource(input.source))
    invalid('genuine verified selected source required');
  consumeLabourSocialOpeningAdoption(input.adoption);
  if (
    input.source.pins.checksumsSha256 !==
      input.adoption.sourceChecksumsSha256 ||
    hash(input.mappingBytes) !== input.source.pins.mappingSha256
  )
    invalid('mixed source/adoption/mapping');
  if (hash(input.policyBytes) !== POSTWAR_SUPPLIES_POLICY_SHA256)
    invalid('pinned generated supply policy required');
  for (const [dataset, bytes] of [
    ['countries', input.countriesBytes],
    ['regions', input.regionsBytes],
  ] as const) {
    const p = input.source.domains.find((d) => d.dataset === dataset);
    if (!p || p.sourceSha256 !== hash(bytes))
      invalid('source dataset bytes differ');
  }
  const worldId = C.worldId(input.worldId),
    seedId = C.openingSeedId(input.seedId);
  const policy = JSON.parse(input.policyBytes) as {
    coverage: {
      minimumSimDays: string;
      maximumSimDays: string;
      sourceBufferReferenceDays: string;
      sourceReferenceDayThroughputEquivalentsPerSimDay: string;
      bufferRecoveryWeightBps: string;
      settlementAccessWeightBps: string;
      hazardResilienceWeightBps: string;
    };
    medicine: {
      commodityId: string;
      unit: string;
      dosesPerReferenceVisit: string;
      bedDailyDoseReserve: string;
    };
    schoolMaterials: {
      commodityId: string;
      unit: string;
      unitsPerSeatSimDay: string;
    };
  };
  const mapping = row(row(JSON.parse(input.mappingBytes)).mappings);
  if (!Array.isArray(mapping.regions) || !Array.isArray(mapping.countries))
    invalid('mapping grain required');
  const countryMap = new Map(
    mapping.countries.map((v) => {
      const r = row(v);
      return [text(r.sourceCountryId), text(r.coreCountryId)] as const;
    }),
  );
  const regionMap = new Map(
    mapping.regions.map((v) => {
      const r = row(v);
      return [
        text(r.sourceRegionId),
        {
          countryId: text(r.coreCountryId),
          locationId: text(r.normalizedRegionId),
        },
      ] as const;
    }),
  );
  const countries = rows(input.countriesBytes),
    regions = rows(input.regionsBytes);
  if (
    countries.length !== 70 ||
    regions.length !== 122 ||
    countryMap.size !== 70 ||
    regionMap.size !== 122
  )
    invalid('selected source grain differs');
  const countryRows = new Map(
    countries.map((r, index) => [text(r.id), { r, index }]),
  );
  const scope = {
    worldId,
    seedId,
    sourceChecksumsSha256: input.source.pins.checksumsSha256,
    policySha256: POSTWAR_SUPPLIES_POLICY_SHA256,
  };
  const identity = (kind: string, locationId: string) =>
    hash(C.canonicalSerialize({ ...scope, kind, locationId }))
      .slice(0, 40)
      .toUpperCase();
  const sourceId = C.openingSourceId(
    `POSTWAR_SUPPLY_SOURCE_${identity('ALL', 'ALL')}`,
  );
  const stocks: PostwarSupplyStock[] = [];
  const regionHash = hash(input.regionsBytes),
    countryHash = hash(input.countriesBytes);
  const seenRegions = new Set<string>();
  for (const [index, r] of regions.entries()) {
    const mapped = regionMap.get(text(r.id)),
      country = countryRows.get(text(r.countryId));
    if (
      !mapped ||
      !country ||
      countryMap.get(text(r.countryId)) !== mapped.countryId ||
      seenRegions.has(mapped.locationId)
    )
      invalid('source region join differs/duplicates');
    seenRegions.add(mapped.locationId);
    const assets = input.adoption.capacities.filter(
      (a) =>
        a.core.countryId === mapped.countryId &&
        a.core.locationId === mapped.locationId,
    );
    const school = assets.filter((a) => a.sourceProjectId === 'PROJECT-31'),
      hospital = assets.filter((a) => a.sourceProjectId === 'PROJECT-35');
    if (
      school.length !== 1 ||
      hospital.length !== 1 ||
      hospital[0]!.dailyMedicalVisitsReference === null
    )
      invalid('unique real school/hospital reference required');
    const gov = input.adoption.employers.filter(
      (e) => e.countryId === mapped.countryId && e.role === 'GOV',
    );
    if (gov.length !== 1) invalid('existing public entity required');
    const natural = row(r.natural),
      access = bps(r.settlementAccess),
      hazard = max(bps(natural.floodExposure), bps(natural.stormExposure));
    const buffer = ratio(country.r.stockBufferDays),
      reference = whole(policy.coverage.sourceBufferReferenceDays);
    const bufferRecovery = min(
      10000n,
      (buffer.n * 10000n) / (buffer.d * reference),
    );
    const recovery =
      (bufferRecovery * whole(policy.coverage.bufferRecoveryWeightBps) +
        access * whole(policy.coverage.settlementAccessWeightBps) +
        (10000n - hazard) * whole(policy.coverage.hazardResilienceWeightBps)) /
      10000n;
    const minimum = whole(policy.coverage.minimumSimDays),
      maximum = whole(policy.coverage.maximumSimDays);
    const days = minimum + ((maximum - minimum) * recovery) / 10000n;
    if (days < minimum || days > maximum || maximum > 21n || minimum === 0n)
      invalid('bounded finite coverage required');
    for (const kind of ['MEDICINE', 'SCHOOL_MATERIALS'] as const) {
      const spec =
        kind === 'MEDICINE' ? policy.medicine : policy.schoolMaterials;
      const asset = kind === 'MEDICINE' ? hospital[0]! : school[0]!;
      const daily =
        kind === 'MEDICINE'
          ? whole(hospital[0]!.dailyMedicalVisitsReference!) *
              whole(policy.medicine.dosesPerReferenceVisit) *
              whole(
                policy.coverage
                  .sourceReferenceDayThroughputEquivalentsPerSimDay,
              ) +
            whole(hospital[0]!.core.capacity.amount) *
              whole(policy.medicine.bedDailyDoseReserve)
          : whole(school[0]!.core.capacity.amount) *
            whole(policy.schoolMaterials.unitsPerSeatSimDay);
      if (daily === 0n)
        invalid('positive source-scaled finite supply required');
      const id = identity(kind, mapped.locationId);
      const account = C.createInventoryAccount({
        worldId,
        countryId: C.countryId(mapped.countryId),
        commodityId: C.commodityId(spec.commodityId),
        batchId: C.inventoryBatchId(`POSTWAR_SUPPLY_BATCH_${id}`),
        unit: spec.unit,
        physicalLocationId: C.inventoryLocationId(
          `POSTWAR_SUPPLY_LOCATION_${mapped.locationId}`,
        ),
        bucket: 'AVAILABLE',
        reservationId: null,
        shipmentId: null,
        titleHolderId: C.legalEntityId(gov[0]!.employerId),
        riskBearerId: C.legalEntityId(gov[0]!.employerId),
        economicRecognitionId: null,
      });
      const entry = freeze({
        entryId: C.openingInventoryEntryId(`POSTWAR_SUPPLY_ENTRY_${id}`),
        sourceId,
        account,
        quantity: C.Quantity.from((daily * days).toString(), spec.unit),
      });
      stocks.push({
        kind,
        ...mapped,
        serviceAssetId: asset.core.assetId,
        dailyBasis: daily.toString(),
        coverageSimDays: days.toString(),
        recoveryBps: recovery.toString(),
        sourceBufferDays: text(country.r.stockBufferDays),
        entry,
        sourceReferences: [
          {
            path: 'artifacts/world-balanced-candidate-v1/data/countries.json',
            pointer: `/${country.index}/stockBufferDays`,
            sha256: countryHash,
          },
          {
            path: 'artifacts/world-balanced-candidate-v1/data/regions.json',
            pointer: `/${index}`,
            sha256: regionHash,
          },
          {
            path: 'artifacts/world-balanced-candidate-v1/data/population-services.json',
            pointer: asset.servicePointer,
            sha256: input.source.domains.find(
              (d) => d.dataset === 'population-services',
            )!.sourceSha256,
          },
          {
            path: POSTWAR_SUPPLIES_POLICY_PATH,
            pointer: '/',
            sha256: POSTWAR_SUPPLIES_POLICY_SHA256,
          },
        ],
      });
    }
  }
  stocks.sort((a, b) => (a.entry.entryId < b.entry.entryId ? -1 : 1));
  const totals = Object.fromEntries(
    (['MEDICINE', 'SCHOOL_MATERIALS'] as const).map((kind) => {
      const selected = stocks.filter((s) => s.kind === kind);
      return [
        kind,
        {
          amount: selected
            .reduce(
              (a, s) => a + whole(C.canonicalDecimal(s.entry.quantity.amount)),
              0n,
            )
            .toString(),
          commodityId: selected[0]!.entry.account.commodityId,
          unit: selected[0]!.entry.account.unit,
        },
      ];
    }),
  ) as unknown as PostwarOperatingSupplies['totals'];
  const stockFacts = stocks.map((s) => ({
    ...s,
    entry: {
      entryId: s.entry.entryId,
      sourceId,
      account: s.entry.account,
      quantity: {
        amount: C.canonicalDecimal(s.entry.quantity.amount),
        unit: s.entry.quantity.unit,
      },
    },
  }));
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: POSTWAR_SUPPLIES_POLICY_PATH,
      sourceVersion: 'POSTWAR_FINITE_PUBLIC_SUPPLIES_V1',
      payload: {
        classification: 'GENERATED_POLICY_NEW_DOMAIN_PHYSICAL_ENDOWMENT',
        ...scope,
        policy: JSON.parse(input.policyBytes),
        stocks: stockFacts,
        totals,
        financialEffect: 'NO_CASH_NO_PROCUREMENT_NO_HISTORY',
        originalSourceBytesUnchanged: true,
      },
    },
    hash,
  );
  const value = {
    schemaVersion: 'postwar-operating-supplies.v1' as const,
    classification: 'GENERATED_POLICY_NEW_DOMAIN_PHYSICAL_ENDOWMENT' as const,
    ...scope,
    source,
    stocks,
    totals,
    remainingPrerequisites: [
      'FINITE_AUTHORIZED_WATER',
      'FINITE_AUTHORIZED_POWER',
      'FINITE_EQUIPMENT',
      'ACTUAL_FILLED_STAFF',
      'AUTHORIZED_LOCAL_CURRENCY_BUDGET',
    ] as const,
    serviceReadinessEstablished: false as const,
    financialBatches: [] as const,
    historicalProcurementOrServiceEvents: [] as const,
  };
  const result = freeze({
    ...value,
    fingerprint: hash(C.canonicalSerialize(value)),
  });
  issued.add(result);
  return result;
}

export interface PostwarSupplyAllocationRequest {
  readonly allocationId: string;
  readonly consumerRef: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly serviceAssetId: string;
  readonly sourceId: string;
  readonly entryId: string;
  readonly commodityId: string;
  readonly unit: string;
  readonly quantity: string;
}
export interface PostwarSupplyAllocation {
  readonly schemaVersion: 'postwar-supply-allocation.v1';
  readonly suppliesFingerprint: string;
  readonly grants: readonly PostwarSupplyAllocationRequest[];
  readonly remaining: readonly {
    readonly entryId: string;
    readonly amount: string;
    readonly unit: string;
  }[];
  readonly fingerprint: string;
  readonly consumesInventory: false;
}
/** A single complete allocation plan. Replaying it returns the same object;
 * binding a different second plan to this supply capability is refused. */
export function allocatePostwarOperatingSupplies(
  supplies: PostwarOperatingSupplies,
  requests: readonly PostwarSupplyAllocationRequest[],
): PostwarSupplyAllocation {
  if (!isPostwarOperatingSupplies(supplies))
    invalid('genuine supplemental supplies required');
  const grants = JSON.parse(
    JSON.stringify(requests),
  ) as PostwarSupplyAllocationRequest[];
  grants.sort((a, b) =>
    a.allocationId < b.allocationId
      ? -1
      : a.allocationId > b.allocationId
        ? 1
        : 0,
  );
  const canonicalRequests = C.canonicalSerialize(grants),
    previous = boundPlans.get(supplies.fingerprint);
  if (previous) {
    if (previous.canonicalRequests !== canonicalRequests)
      invalid('allocation already bound; cannot double-use supply');
    return previous.plan;
  }
  const used = new Map<string, bigint>(),
    ids = new Set<string>(),
    consumers = new Set<string>();
  for (const r of grants) {
    const fields = [
      'allocationId',
      'consumerRef',
      'worldId',
      'countryId',
      'locationId',
      'serviceAssetId',
      'sourceId',
      'entryId',
      'commodityId',
      'unit',
      'quantity',
    ].sort();
    if (
      C.canonicalSerialize(Object.keys(r).sort()) !==
      C.canonicalSerialize(fields)
    )
      invalid('closed allocation shape required');
    C.openingInventoryEntryId(r.allocationId);
    C.openingSourceId(r.consumerRef);
    const stock = supplies.stocks.find((s) => s.entry.entryId === r.entryId);
    if (!stock) invalid('unknown supplementary entry');
    const account = stock.entry.account;
    if (
      r.worldId !== supplies.worldId ||
      r.countryId !== stock.countryId ||
      r.locationId !== stock.locationId ||
      r.serviceAssetId !== stock.serviceAssetId ||
      r.sourceId !== stock.entry.sourceId ||
      r.commodityId !== account.commodityId ||
      r.unit !== account.unit
    )
      invalid('source/world/country/service/commodity/unit scope differs');
    const key = `${r.consumerRef}/${r.entryId}`;
    if (ids.has(r.allocationId) || consumers.has(key))
      invalid('duplicate consumer/allocation');
    ids.add(r.allocationId);
    consumers.add(key);
    if (!/^(0|[1-9]\d*)$/u.test(text(r.quantity)))
      invalid('canonical whole allocation quantity required');
    const quantity = whole(r.quantity);
    if (quantity === 0n) invalid('positive finite allocation required');
    const total = (used.get(r.entryId) ?? 0n) + quantity;
    if (total > whole(C.canonicalDecimal(stock.entry.quantity.amount)))
      invalid('global allocation exceeds finite stock');
    used.set(r.entryId, total);
  }
  const remaining = supplies.stocks.map((s) => ({
    entryId: s.entry.entryId,
    amount: (
      whole(C.canonicalDecimal(s.entry.quantity.amount)) -
      (used.get(s.entry.entryId) ?? 0n)
    ).toString(),
    unit: s.entry.account.unit,
  }));
  const payload = {
    schemaVersion: 'postwar-supply-allocation.v1' as const,
    suppliesFingerprint: supplies.fingerprint,
    grants,
    remaining,
    consumesInventory: false as const,
  };
  const result = freeze({
    ...payload,
    fingerprint: hash(C.canonicalSerialize(payload)),
  });
  allocations.add(result);
  boundPlans.set(supplies.fingerprint, { canonicalRequests, plan: result });
  return result;
}
export function consumePostwarSupplyAllocation(
  supplies: PostwarOperatingSupplies,
  plan: PostwarSupplyAllocation,
): PostwarSupplyAllocation {
  if (
    !isPostwarOperatingSupplies(supplies) ||
    !allocations.has(plan) ||
    boundPlans.get(supplies.fingerprint)?.plan !== plan
  )
    invalid('genuine single supply allocation required');
  return plan;
}
/** Sole genesis assembler helper, never persistence. The original validated seed
 * must match exactly; duplicate append is an idempotent read, never another grant. */
export function appendPostwarOperatingSupplies(
  seed: C.OpeningSeed,
  supplies: PostwarOperatingSupplies,
): Readonly<C.OpeningSeed> {
  if (!isPostwarOperatingSupplies(supplies))
    invalid('genuine supplemental supplies required');
  C.rebuildV08LedgersFromLineage({ seed, sha256Hex: hash });
  if (seed.worldId !== supplies.worldId || seed.seedId !== supplies.seedId)
    invalid('seed/world scope differs');
  const commodities = new Set(
    supplies.stocks.map((s) => s.entry.account.commodityId),
  );
  for (const entry of seed.inventoryEntries.filter((e) =>
    commodities.has(e.account.commodityId),
  )) {
    const expected = supplies.stocks.find(
      (s) => s.entry.entryId === entry.entryId,
    );
    if (
      !expected ||
      C.canonicalSerialize(expected.entry) !== C.canonicalSerialize(entry)
    )
      invalid('existing supplemental commodity grant conflicts');
  }
  const existing = seed.sources.find(
    (s) => s.sourceId === supplies.source.sourceId,
  );
  if (existing) {
    if (
      C.canonicalSerialize(existing) !== C.canonicalSerialize(supplies.source)
    )
      invalid('supplement source conflict');
    if (
      seed.inventoryEntries.filter((e) => e.sourceId === existing.sourceId)
        .length !== supplies.stocks.length
    )
      invalid('partial/duplicate supplementary source entries');
    for (const s of supplies.stocks) {
      const found = seed.inventoryEntries.find(
        (e) => e.entryId === s.entry.entryId,
      );
      if (
        !found ||
        C.canonicalSerialize(found) !== C.canonicalSerialize(s.entry)
      )
        invalid('partial/changed supplementary grant');
    }
    return seed;
  }
  const newAccounts = new Set(
    supplies.stocks.map((s) => C.canonicalSerialize(s.entry.account)),
  );
  if (
    seed.inventoryEntries.some(
      (e) =>
        newAccounts.has(C.canonicalSerialize(e.account)) ||
        supplies.stocks.some((s) => s.entry.entryId === e.entryId),
    )
  )
    invalid('supplement overlaps existing inventory');
  return C.createOpeningSeed(
    {
      ...seed,
      sources: [...seed.sources, supplies.source],
      inventoryEntries: [
        ...seed.inventoryEntries,
        ...supplies.stocks.map((s) => s.entry),
      ],
      financialBatches: seed.financialBatches,
    },
    hash,
  );
}
