/** Narrow generated-genesis beneficial housing rights. Legal HH ownership and
 * underlying bank claim stay unchanged. Balances live only in the real ledger. */
import {
  canonicalSha256,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  validateAuthoritativeTransition,
  type AuthoritativeTransition,
} from '../commands/receipt.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import { Money } from '../numeric/money.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import { SimTime, isSimTime } from '../numeric/sim-time.js';
import {
  countryId,
  legalEntityId,
  openingSourceId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  financialPostingBatchId,
  financialPostingLegId,
  type FinancialPostingBatchId,
} from '../ids.js';
import {
  createOpeningSource,
  createOpeningSeed,
  rebuildV08LedgersFromLineage,
  OPENING_SOURCE_SCHEMA_VERSION,
  type OpeningSeed,
  type FinancialOpeningLeg,
  type V08AuthoritativeLedgerTransition,
} from '../opening/opening-seed.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import {
  createFinancialAccount,
  createFinancialPostingBatch,
  applyFinancialPostingBatch,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingBatch,
} from './financial-ledger.js';

export const BENEFICIAL_HOUSING_RENT_COMMAND =
  'POSTWAR_BENEFICIAL_HOUSING_RENT_V1';
export const BENEFICIAL_HOUSING_RENT_EVENT =
  'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1';
type Role = 'OWNER_OCCUPIER' | 'PRIVATE_RENTER' | 'PUBLIC_RENTER' | 'DISPLACED';
const receipts = new WeakSet<object>(),
  states = new WeakSet<object>();
function invalid(s: string): never {
  throw new Error(`BENEFICIAL_HOUSING_INVALID: ${s}`);
}
function uint(s: string): bigint {
  if (typeof s !== 'string' || !/^(0|[1-9]\d*)$/u.test(s))
    invalid('canonical integer required');
  return BigInt(s);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const fingerprint = (v: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), sha);
const id = (v: unknown, sha: Sha256Hex) =>
  fingerprint(v, sha).slice(7, 55).toUpperCase();
function equal(a: unknown, b: unknown, label: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(label);
}
function position(
  ledger: FinancialLedgerState,
  accountId: string,
  currency: string,
) {
  return (
    ledger.positions.find((p) => p.account.accountId === accountId)
      ?.netDebitBalance ?? Money.from('0', currency)
  );
}
export interface BeneficialHousingGroup {
  readonly groupId: string;
  readonly locationId: string;
  readonly role: Role;
  /** Ordinals partition the source region's existing households/people. */
  readonly firstHouseholdOrdinal: string;
  readonly households: string;
  readonly firstPersonOrdinal: string;
  readonly population: string;
}
export interface BeneficialHousingRegion {
  readonly locationId: string;
  readonly households: string;
  readonly population: string;
}
export interface BeneficialHousingPool {
  readonly poolId: string;
  readonly locationId: string;
  readonly landlordGroupId: string;
  readonly totalUnits: string;
  readonly habitableUnits: string;
  readonly ownerOccupiedUnits: string;
}
export interface BeneficialHousingLease {
  readonly leaseId: string;
  readonly poolId: string;
  readonly landlordGroupId: string;
  readonly tenantGroupId: string;
  /** This range is relative to its tenant cohort; it creates no new household. */
  readonly firstHouseholdOrdinal: string;
  readonly households: string;
  readonly startTick: string;
  readonly endTick: string;
  readonly periodTicks: string;
  readonly rentPerHouseholdPerPeriod: string;
  readonly currency: string;
  readonly genesisRightsRef: string;
}
export interface BeneficialHousingReclassificationInput {
  readonly seed: OpeningSeed;
  readonly allocationId: string;
  readonly policyRef: string;
  readonly sourcePopulationRef: string;
  readonly countryId: string;
  readonly householdEntityId: string;
  readonly parentAccountId: string;
  readonly regions: readonly BeneficialHousingRegion[];
  readonly groups: readonly BeneficialHousingGroup[];
  readonly pools: readonly BeneficialHousingPool[];
  readonly leases: readonly BeneficialHousingLease[];
}
export interface BeneficialHousingReclassificationReceipt {
  readonly schemaVersion: 'beneficial-housing-reclassification.v1';
  readonly parentSeedFingerprint: CanonicalSha256;
  readonly childSeedFingerprint: CanonicalSha256;
  readonly worldId: string;
  readonly seedId: string;
  readonly countryId: string;
  readonly householdEntityId: string;
  readonly allocationId: string;
  readonly policyRef: string;
  readonly sourcePopulationRef: string;
  readonly originalSourceId: string;
  readonly originalAccount: Readonly<FinancialAccount>;
  readonly originalAmount: string;
  readonly claimId: string;
  readonly counterpartLiabilityAccount: Readonly<FinancialAccount>;
  readonly supplementalSourceId: string;
  readonly reclassificationBatchId: string;
  readonly regions: readonly BeneficialHousingRegion[];
  readonly groups: readonly BeneficialHousingGroup[];
  readonly pools: readonly BeneficialHousingPool[];
  readonly leases: readonly BeneficialHousingLease[];
  readonly subaccounts: readonly {
    readonly groupId: string;
    readonly account: Readonly<FinancialAccount>;
    readonly openingAmount: string;
  }[];
  readonly rentPaidAtOpening: '0';
  readonly rentAccruedAtOpening: '0';
  readonly newLegalClaims: false;
  readonly fingerprint: CanonicalSha256;
}
function intervalPartition(
  items: readonly { start: bigint; count: bigint }[],
  total: bigint,
) {
  let next = 0n;
  for (const item of [...items].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  )) {
    if (item.count === 0n) continue;
    if (item.start !== next)
      invalid('cohort ordinals overlap or leave a population gap');
    next += item.count;
  }
  if (next !== total) invalid('cohort population/households do not conserve');
}
function validateRights(
  i: Omit<BeneficialHousingReclassificationInput, 'seed'>,
  currency: string,
) {
  const groupIds = new Set<string>(),
    locations = new Set<string>();
  for (const region of i.regions) {
    openingSourceId(region.locationId);
    if (locations.has(region.locationId)) invalid('duplicate region');
    locations.add(region.locationId);
    uint(region.households);
    uint(region.population);
  }
  if (!i.regions.length) invalid('source region totals required');
  for (const g of i.groups) {
    openingSourceId(g.groupId);
    if (groupIds.has(g.groupId) || !locations.has(g.locationId))
      invalid('duplicate/out-of-scope beneficial group');
    groupIds.add(g.groupId);
    if (
      ![
        'OWNER_OCCUPIER',
        'PRIVATE_RENTER',
        'PUBLIC_RENTER',
        'DISPLACED',
      ].includes(g.role)
    )
      invalid('unsupported tenure role');
    if (uint(g.population) < uint(g.households))
      invalid('households exceed people');
  }
  for (const region of i.regions) {
    const gs = i.groups.filter((g) => g.locationId === region.locationId);
    if (gs.length !== 4 || new Set(gs.map((g) => g.role)).size !== 4)
      invalid('four mutually exclusive tenure cohorts required');
    intervalPartition(
      gs.map((g) => ({
        start: uint(g.firstHouseholdOrdinal),
        count: uint(g.households),
      })),
      uint(region.households),
    );
    intervalPartition(
      gs.map((g) => ({
        start: uint(g.firstPersonOrdinal),
        count: uint(g.population),
      })),
      uint(region.population),
    );
  }
  const poolIds = new Set<string>(),
    poolOwners = new Set<string>();
  for (const p of i.pools) {
    openingSourceId(p.poolId);
    if (poolIds.has(p.poolId)) invalid('duplicate property pool');
    poolIds.add(p.poolId);
    if (poolOwners.has(p.landlordGroupId))
      invalid('same beneficial property pool cannot be allocated twice');
    poolOwners.add(p.landlordGroupId);
    const owner = i.groups.find((g) => g.groupId === p.landlordGroupId);
    if (
      !owner ||
      owner.role !== 'OWNER_OCCUPIER' ||
      owner.locationId !== p.locationId ||
      uint(owner.households) === 0n
    )
      invalid('property beneficial owner differs');
    if (
      uint(p.ownerOccupiedUnits) !== uint(owner.households) ||
      uint(p.ownerOccupiedUnits) > uint(p.habitableUnits) ||
      uint(p.habitableUnits) > uint(p.totalUnits)
    )
      invalid('property occupancy exceeds finite stock');
  }
  const leaseIds = new Set<string>();
  for (const l of i.leases) {
    openingSourceId(l.leaseId);
    openingSourceId(l.genesisRightsRef);
    if (leaseIds.has(l.leaseId)) invalid('duplicate lease');
    leaseIds.add(l.leaseId);
    const p = i.pools.find((p) => p.poolId === l.poolId),
      tenant = i.groups.find((g) => g.groupId === l.tenantGroupId);
    if (
      !p ||
      !tenant ||
      tenant.role !== 'PRIVATE_RENTER' ||
      l.landlordGroupId !== p.landlordGroupId ||
      l.landlordGroupId === l.tenantGroupId ||
      tenant.locationId !== p.locationId
    )
      invalid('lease needs distinct real beneficial owner/tenant groups');
    if (
      uint(l.households) === 0n ||
      uint(l.firstHouseholdOrdinal) + uint(l.households) >
        uint(tenant.households)
    )
      invalid('lease household range exceeds tenant cohort');
    const start = uint(l.startTick),
      end = uint(l.endTick),
      period = uint(l.periodTicks);
    if (
      start === 0n ||
      end <= start ||
      period === 0n ||
      (end - start) % period !== 0n
    )
      invalid('future exact lease periods required');
    const rent = Money.from(l.rentPerHouseholdPerPeriod, l.currency);
    if (l.currency !== currency || !rent.amount.isPositive())
      invalid('positive matching-currency rent required');
  }
  const overlaps = (a: BeneficialHousingLease, b: BeneficialHousingLease) =>
    uint(a.startTick) < uint(b.endTick) && uint(b.startTick) < uint(a.endTick);
  for (const [index, l] of i.leases.entries())
    for (const other of i.leases.slice(index + 1))
      if (
        l.tenantGroupId === other.tenantGroupId &&
        overlaps(l, other) &&
        uint(l.firstHouseholdOrdinal) <
          uint(other.firstHouseholdOrdinal) + uint(other.households) &&
        uint(other.firstHouseholdOrdinal) <
          uint(l.firstHouseholdOrdinal) + uint(l.households)
      )
        invalid('same households cannot occupy two homes');
  for (const p of i.pools) {
    const ls = i.leases.filter((l) => l.poolId === p.poolId),
      capacity = uint(p.habitableUnits) - uint(p.ownerOccupiedUnits);
    for (const at of ls.map((l) => uint(l.startTick))) {
      const active = ls
        .filter((l) => uint(l.startTick) <= at && at < uint(l.endTick))
        .reduce((n, l) => n + uint(l.households), 0n);
      if (active > capacity)
        invalid('leases exceed finite habitable rental capacity');
    }
  }
}
/** Adds a t0 balanced beneficial reclassification, retaining every parent batch.
 * Only the caller's explicit new seed is returned; nothing is persisted/applied to an existing World. */
export function reclassifyBeneficialHousingSeed(
  input: BeneficialHousingReclassificationInput,
  sha: Sha256Hex,
): Readonly<{
  seed: Readonly<OpeningSeed>;
  receipt: BeneficialHousingReclassificationReceipt;
}> {
  const before = rebuildV08LedgersFromLineage({
    seed: input.seed,
    sha256Hex: sha,
  });
  countryId(input.countryId);
  legalEntityId(input.householdEntityId);
  openingSourceId(input.allocationId);
  if (!input.policyRef || !input.sourcePopulationRef)
    invalid('documented generated policy/source population refs required');
  const original = before.financial.positions.find(
    (p) => p.account.accountId === input.parentAccountId,
  );
  if (
    !original ||
    original.account.ownerId !== input.householdEntityId ||
    original.account.countryId !== input.countryId ||
    original.account.accountClass !== 'ASSET' ||
    !original.account.claimId ||
    !original.account.counterpartyEntityId ||
    !original.netDebitBalance.amount.isPositive()
  )
    invalid('actual positive household bank-deposit ASSET claim required');
  const account = original.account,
    currency = account.currency;
  const mirror = before.financial.positions.filter(
    (p) =>
      p.account.accountClass === 'LIABILITY' &&
      p.account.claimId === account.claimId &&
      p.account.ownerId === account.counterpartyEntityId &&
      p.account.counterpartyEntityId === account.ownerId &&
      p.account.countryId === account.countryId &&
      p.account.currency === currency &&
      p.netDebitBalance.amount.equals(
        original.netDebitBalance.amount.negated(),
      ),
  );
  if (mirror.length !== 1)
    invalid('original bank liability exact mirror required');
  const sourceBatches = input.seed.financialBatches.filter((b) =>
    b.legs.some((l) => l.account.accountId === account.accountId),
  );
  if (
    sourceBatches.length !== 1 ||
    !sourceBatches[0]!.legs.some(
      (l) => l.account.accountId === mirror[0]!.account.accountId,
    )
  )
    invalid('original producer claim pair source required');
  const originalLeg = sourceBatches[0]!.legs.find(
      (l) => l.account.accountId === account.accountId,
    )!,
    mirrorLeg = sourceBatches[0]!.legs.find(
      (l) => l.account.accountId === mirror[0]!.account.accountId,
    )!;
  if (
    originalLeg.direction !== 'DEBIT' ||
    mirrorLeg.direction !== 'CREDIT' ||
    originalLeg.counterpartLegId !== mirrorLeg.legId ||
    mirrorLeg.counterpartLegId !== originalLeg.legId ||
    !originalLeg.amount.amount.equals(original.netDebitBalance.amount) ||
    !mirrorLeg.amount.amount.equals(original.netDebitBalance.amount)
  )
    invalid('original producer exact reciprocal claim amounts required');
  validateRights(input, currency);
  const groups = JSON.parse(
    JSON.stringify(input.groups),
  ) as BeneficialHousingGroup[];
  groups.sort((a, b) => (a.groupId < b.groupId ? -1 : 1));
  const regions = JSON.parse(
    JSON.stringify(input.regions),
  ) as BeneficialHousingRegion[];
  const pools = JSON.parse(
    JSON.stringify(input.pools),
  ) as BeneficialHousingPool[];
  const leases = JSON.parse(
    JSON.stringify(input.leases),
  ) as BeneficialHousingLease[];
  const totalHouseholds = groups.reduce((n, g) => n + uint(g.households), 0n);
  if (totalHouseholds === 0n) invalid('positive household partition required');
  const originalAmount = canonicalDecimal(original.netDebitBalance.amount),
    parts = originalAmount.split('.'),
    places = (parts[1] ?? '').length,
    scale = 10n ** BigInt(places),
    units = BigInt(parts[0]! + (parts[1] ?? ''));
  const amounts = groups.map(
      (g) => (units * uint(g.households)) / totalHouseholds,
    ),
    order = groups
      .map((g, index) => ({
        index,
        remainder: (units * uint(g.households)) % totalHouseholds,
      }))
      .sort((a, b) =>
        a.remainder === b.remainder
          ? a.index - b.index
          : a.remainder > b.remainder
            ? -1
            : 1,
      );
  let left = units - amounts.reduce((a, b) => a + b, 0n);
  for (const item of order)
    if (left > 0n) {
      amounts[item.index] = amounts[item.index]! + 1n;
      left--;
    }
  const money = (n: bigint) =>
    Money.from(
      places === 0
        ? n.toString()
        : `${n / scale}.${(n % scale).toString().padStart(places, '0')}`,
      currency,
    );
  const intent = {
    schemaVersion: 'beneficial-housing-genesis-rights.v1',
    parentSeedFingerprint: input.seed.fingerprint,
    allocationId: input.allocationId,
    policyRef: input.policyRef,
    sourcePopulationRef: input.sourcePopulationRef,
    countryId: input.countryId,
    householdEntityId: input.householdEntityId,
    originalAccount: account,
    originalAmount,
    originalSourceId: sourceBatches[0]!.sourceId,
    counterpartLiabilityAccount: mirror[0]!.account,
    regions,
    groups,
    pools,
    leases,
  };
  const identity = id(intent, sha),
    sourceId = openingSourceId(`SOURCE_BENEFICIAL_HOUSING_${identity}`);
  if (input.seed.sources.some((s) => s.sourceId === sourceId))
    invalid('already reclassified');
  const subaccounts = groups.map((g, index) => ({
    groupId: g.groupId,
    account: createFinancialAccount({
      ...account,
      accountId: financialAccountId(
        `ACCOUNT_BENEFICIAL_${id({ identity, groupId: g.groupId }, sha)}`,
      ),
    }),
    openingAmount: canonicalDecimal(money(amounts[index]!).amount),
  }));
  if (
    subaccounts.some((s) =>
      before.financial.accounts.some(
        (a) => a.accountId === s.account.accountId,
      ),
    )
  )
    invalid('beneficial account already exists');
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: input.policyRef,
      sourceVersion: 'POSTWAR_BENEFICIAL_HOUSING_V1',
      payload: {
        classification:
          'GENERATED_POLICY_BENEFICIAL_PARTITION_NOT_NEW_LEGAL_CLAIMS',
        ...intent,
        subaccounts,
        rentPaidAtOpening: '0',
        rentAccruedAtOpening: '0',
      },
    },
    sha,
  );
  const parentLeg = financialOpeningLegId(`LEG_PARENT_${identity}`),
    positive = subaccounts.filter((s) =>
      Money.from(s.openingAmount, currency).amount.isPositive(),
    );
  const legs: FinancialOpeningLeg[] = [
    {
      legId: parentLeg,
      account,
      direction: 'CREDIT',
      amount: original.netDebitBalance,
      counterpartLegId: financialOpeningLegId(
        `LEG_${id({ identity, groupId: positive[0]!.groupId }, sha)}`,
      ),
    },
    ...positive.map((s) => ({
      legId: financialOpeningLegId(
        `LEG_${id({ identity, groupId: s.groupId }, sha)}`,
      ),
      account: s.account,
      direction: 'DEBIT' as const,
      amount: Money.from(s.openingAmount, currency),
      counterpartLegId: parentLeg,
    })),
  ];
  const batchId = financialOpeningBatchId(`OPENING_BENEFICIAL_${identity}`);
  const seed = createOpeningSeed(
    {
      ...input.seed,
      sources: [...input.seed.sources, source],
      financialBatches: [
        ...input.seed.financialBatches,
        { batchId, sourceId, settlementCurrency: currency, legs },
      ],
    },
    sha,
  );
  const payload = {
    schemaVersion: 'beneficial-housing-reclassification.v1' as const,
    parentSeedFingerprint: input.seed.fingerprint,
    childSeedFingerprint: seed.fingerprint,
    worldId: seed.worldId,
    seedId: seed.seedId,
    countryId: input.countryId,
    householdEntityId: input.householdEntityId,
    allocationId: input.allocationId,
    policyRef: input.policyRef,
    sourcePopulationRef: input.sourcePopulationRef,
    originalSourceId: sourceBatches[0]!.sourceId,
    originalAccount: account,
    originalAmount,
    claimId: account.claimId!,
    counterpartLiabilityAccount: mirror[0]!.account,
    supplementalSourceId: sourceId,
    reclassificationBatchId: batchId,
    regions,
    groups,
    pools,
    leases,
    subaccounts,
    rentPaidAtOpening: '0' as const,
    rentAccruedAtOpening: '0' as const,
    newLegalClaims: false as const,
  };
  const receipt = freeze({
    ...payload,
    fingerprint: fingerprint(payload, sha),
  });
  receipts.add(receipt);
  const after = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  aggregateBeneficialHousingLiquidClaim(after.financial, receipt);
  return freeze({ seed, receipt });
}
/** Independently recomputes an untrusted receipt from the retained parent; no
 * receipt hash, child claim, or approval boolean can substitute for this replay. */
export function verifyBeneficialHousingReclassification(
  parent: OpeningSeed,
  child: OpeningSeed,
  receipt: BeneficialHousingReclassificationReceipt,
  sha: Sha256Hex,
): BeneficialHousingReclassificationReceipt {
  const rebuilt = reclassifyBeneficialHousingSeed(
    {
      seed: parent,
      allocationId: receipt.allocationId,
      policyRef: receipt.policyRef,
      sourcePopulationRef: receipt.sourcePopulationRef,
      countryId: receipt.countryId,
      householdEntityId: receipt.householdEntityId,
      parentAccountId: receipt.originalAccount.accountId,
      regions: receipt.regions,
      groups: receipt.groups,
      pools: receipt.pools,
      leases: receipt.leases,
    },
    sha,
  );
  equal(
    rebuilt.seed,
    child,
    'child seed differs from retained parent/reclassification',
  );
  equal(rebuilt.receipt, receipt, 'reclassification receipt differs');
  return rebuilt.receipt;
}
/** Current balances always come from actual Core ledger positions, never a
 * second beneficial balance table. Claims aggregate to the unchanged legal HH/bank mirror. */
export function aggregateBeneficialHousingLiquidClaim(
  ledger: FinancialLedgerState,
  receipt: BeneficialHousingReclassificationReceipt,
) {
  if (
    !receipts.has(receipt) ||
    !isAuthoritativeFinancialLedgerState(ledger) ||
    ledger.worldId !== receipt.worldId
  )
    invalid('genuine receipt and authoritative ledger required');
  const currency = receipt.originalAccount.currency,
    allowed = new Set(receipt.subaccounts.map((s) => s.account.accountId));
  if (
    !position(
      ledger,
      receipt.originalAccount.accountId,
      currency,
    ).amount.isZero()
  )
    invalid(
      'parent claim must not coexist with duplicated beneficial balances',
    );
  const subaccounts = receipt.subaccounts.map((s) => {
    const actual = ledger.accounts.find(
      (a) => a.accountId === s.account.accountId,
    );
    if (actual)
      equal(actual, s.account, 'beneficial account definition changed');
    const balance = position(ledger, s.account.accountId, currency);
    if (balance.amount.isNegative()) invalid('beneficial account overdraft');
    return { ...s, availableAmount: canonicalDecimal(balance.amount) };
  });
  for (const p of ledger.positions)
    if (
      p.account.claimId === receipt.claimId &&
      p.account.ownerId === receipt.householdEntityId &&
      !allowed.has(p.account.accountId)
    )
      invalid('unregistered/duplicated household claim');
  const total = subaccounts.reduce(
    (n, s) => n.add(Money.from(s.availableAmount, currency)),
    Money.from('0', currency),
  );
  if (
    ledger.worldVersion === '0' &&
    !total.amount.equals(Money.from(receipt.originalAmount, currency).amount)
  )
    invalid('household legal claim total changed');
  const mirror = ledger.positions.find(
    (p) =>
      p.account.accountId === receipt.counterpartLiabilityAccount.accountId,
  );
  if (!mirror) invalid('bank mirror missing');
  equal(
    mirror.account,
    receipt.counterpartLiabilityAccount,
    'bank mirror definition changed',
  );
  if (!mirror.netDebitBalance.amount.equals(total.amount.negated()))
    invalid('bank liability mirror changed');
  return freeze({
    worldId: ledger.worldId,
    worldVersion: ledger.worldVersion,
    ownerId: receipt.householdEntityId,
    countryId: receipt.countryId,
    claimId: receipt.claimId,
    currency,
    originalAccountId: receipt.originalAccount.accountId,
    counterpartLiabilityAccountId:
      receipt.counterpartLiabilityAccount.accountId,
    availableAmount: canonicalDecimal(total.amount),
    subaccounts,
  });
}
export interface BeneficialRentPaidReceipt {
  readonly leaseId: string;
  readonly periodIndex: string;
  readonly batchId: string;
  readonly batchFingerprint: CanonicalSha256;
  readonly commandFingerprint: CanonicalSha256;
  readonly transitionFingerprint: CanonicalSha256;
  readonly amount: string;
}
export interface BeneficialHousingRentState {
  readonly schemaVersion: 'beneficial-housing-rent-state.v1';
  readonly genesisReceiptFingerprint: CanonicalSha256;
  readonly worldVersion: string;
  readonly paid: readonly BeneficialRentPaidReceipt[];
}
export function createBeneficialHousingRentState(
  receipt: BeneficialHousingReclassificationReceipt,
): BeneficialHousingRentState {
  if (!receipts.has(receipt)) invalid('genuine genesis receipt required');
  const state = freeze({
    schemaVersion: 'beneficial-housing-rent-state.v1' as const,
    genesisReceiptFingerprint: receipt.fingerprint,
    worldVersion: '0',
    paid: [],
  });
  states.add(state);
  return state;
}
/** Follow unrelated actual World events without inventing paid periods. */
export function synchronizeBeneficialHousingRentState(
  input: {
    receipt: BeneficialHousingReclassificationReceipt;
    state: BeneficialHousingRentState;
    financial: FinancialLedgerState;
  },
  sha: Sha256Hex,
): BeneficialHousingRentState {
  const { receipt, state, financial } = input;
  if (
    !receipts.has(receipt) ||
    !states.has(state) ||
    state.genesisReceiptFingerprint !== receipt.fingerprint ||
    uint(financial.worldVersion) < uint(state.worldVersion)
  )
    invalid('genuine non-regressing rights/financial head required');
  aggregateBeneficialHousingLiquidClaim(financial, receipt);
  for (const paid of state.paid)
    if (
      !financial.appliedBatches.some(
        (b) =>
          b.batchId === paid.batchId && b.fingerprint === paid.batchFingerprint,
      )
    )
      invalid('paid rights receipt missing from actual ledger');
  for (const lease of receipt.leases) {
    const periodIndex = state.paid
        .filter((p) => p.leaseId === lease.leaseId)
        .length.toString(),
      logical = id(
        { receipt: receipt.fingerprint, leaseId: lease.leaseId, periodIndex },
        sha,
      );
    if (
      financial.appliedBatches.some(
        (b) => b.batchId === `BATCH_BENEFICIAL_RENT_${logical}`,
      )
    )
      invalid('unrecorded actual rent settlement requires domain replay');
  }
  const result = freeze({ ...state, worldVersion: financial.worldVersion });
  states.add(result);
  return result;
}
export interface BeneficialHousingRentDraft {
  readonly batchId: FinancialPostingBatchId;
  readonly idempotencyKey: string;
  readonly commandPayload: {
    readonly schemaVersion: string;
    readonly genesisReceiptFingerprint: CanonicalSha256;
    readonly leaseId: string;
    readonly periodIndex: string;
  };
  readonly eventPayload: {
    readonly schemaVersion: string;
    readonly genesisReceiptFingerprint: CanonicalSha256;
    readonly leaseId: string;
    readonly periodIndex: string;
    readonly landlordGroupId: string;
    readonly tenantGroupId: string;
    readonly landlordAccountId: string;
    readonly tenantAccountId: string;
    readonly amount: string;
    readonly currency: string;
  };
  readonly amount: Money;
  readonly tenantAccount: Readonly<FinancialAccount>;
  readonly landlordAccount: Readonly<FinancialAccount>;
}
export function prepareBeneficialHousingRent(
  input: {
    receipt: BeneficialHousingReclassificationReceipt;
    state: BeneficialHousingRentState;
    financialBefore: FinancialLedgerState;
    leaseId: string;
    periodIndex: string;
    simTime: SimTime;
  },
  sha: Sha256Hex,
): Readonly<BeneficialHousingRentDraft> {
  const { receipt, state, financialBefore } = input;
  if (
    !receipts.has(receipt) ||
    !states.has(state) ||
    state.genesisReceiptFingerprint !== receipt.fingerprint ||
    state.worldVersion !== financialBefore.worldVersion
  )
    invalid('genuine current rights/financial state required');
  aggregateBeneficialHousingLiquidClaim(financialBefore, receipt);
  if (!isSimTime(input.simTime)) invalid('canonical SimTime required');
  const lease = receipt.leases.find((l) => l.leaseId === input.leaseId);
  if (!lease) invalid('unknown genesis lease');
  const index = uint(input.periodIndex),
    paid = state.paid.filter((p) => p.leaseId === lease.leaseId);
  if (index !== BigInt(paid.length)) invalid('period already paid or skipped');
  const due = uint(lease.startTick) + (index + 1n) * uint(lease.periodTicks);
  if (
    due > uint(lease.endTick) ||
    input.simTime.ticks < due ||
    input.simTime.ticks === 0n
  )
    invalid('rent period not yet due/outside lease');
  const tenant = receipt.subaccounts.find(
      (s) => s.groupId === lease.tenantGroupId,
    ),
    landlord = receipt.subaccounts.find(
      (s) => s.groupId === lease.landlordGroupId,
    );
  if (
    !tenant ||
    !landlord ||
    tenant.groupId === landlord.groupId ||
    tenant.account.accountId === landlord.account.accountId
  )
    invalid('self-transfer is not beneficial rent');
  const amount = Money.from(
    canonicalDecimal(
      Money.from(lease.rentPerHouseholdPerPeriod, lease.currency).amount.times(
        lease.households,
      ),
    ),
    lease.currency,
  );
  if (
    position(
      financialBefore,
      tenant.account.accountId,
      lease.currency,
    ).amount.lessThan(amount.amount)
  )
    invalid('insufficient tenant beneficial funds');
  const logical = id(
      {
        receipt: receipt.fingerprint,
        leaseId: lease.leaseId,
        periodIndex: input.periodIndex,
      },
      sha,
    ),
    batchId = financialPostingBatchId(`BATCH_BENEFICIAL_RENT_${logical}`);
  if (financialBefore.appliedBatches.some((b) => b.batchId === batchId))
    invalid('rights state missing an already applied rent period');
  return freeze({
    batchId,
    idempotencyKey: `BENEFICIAL_RENT_${logical}`,
    commandPayload: {
      schemaVersion: 'beneficial-housing-rent-command.v1',
      genesisReceiptFingerprint: receipt.fingerprint,
      leaseId: lease.leaseId,
      periodIndex: input.periodIndex,
    },
    eventPayload: {
      schemaVersion: 'beneficial-housing-rent-event.v1',
      genesisReceiptFingerprint: receipt.fingerprint,
      leaseId: lease.leaseId,
      periodIndex: input.periodIndex,
      landlordGroupId: landlord.groupId,
      tenantGroupId: tenant.groupId,
      landlordAccountId: landlord.account.accountId,
      tenantAccountId: tenant.account.accountId,
      amount: canonicalDecimal(amount.amount),
      currency: lease.currency,
    },
    amount,
    tenantAccount: tenant.account,
    landlordAccount: landlord.account,
  });
}
/** Actual narrow payment: two distinct beneficial accounts, one retained HH
 * legal claimant. Real Core financial posting; joint V08 lineage can replay it. */
export function settleBeneficialHousingRent(
  input: {
    receipt: BeneficialHousingReclassificationReceipt;
    state: BeneficialHousingRentState;
    financialBefore: FinancialLedgerState;
    command: CanonicalCommand;
    transition: AuthoritativeTransition;
    leaseId: string;
    periodIndex: string;
  },
  sha: Sha256Hex,
) {
  const transition = validateAuthoritativeTransition(input.transition),
    previous = input.state.paid.find(
      (p) => p.leaseId === input.leaseId && p.periodIndex === input.periodIndex,
    );
  const authoritativeBinding = bindAuthoritativeTransition(
    { command: input.command, transition },
    sha,
  );
  if (
    !states.has(input.state) ||
    !receipts.has(input.receipt) ||
    input.state.genesisReceiptFingerprint !== input.receipt.fingerprint
  )
    invalid('genuine rent state/receipt required');
  if (previous) {
    if (
      previous.commandFingerprint !== input.command.fingerprint ||
      previous.transitionFingerprint !==
        fingerprint(authoritativeBinding, sha) ||
      input.state.worldVersion !== input.financialBefore.worldVersion
    )
      invalid('period settlement conflict');
    aggregateBeneficialHousingLiquidClaim(input.financialBefore, input.receipt);
    if (
      !input.financialBefore.appliedBatches.some(
        (b) =>
          b.batchId === previous.batchId &&
          b.fingerprint === previous.batchFingerprint,
      )
    )
      invalid('paid receipt absent from real financial ledger');
    return freeze({
      outcome: 'EXACT_DUPLICATE' as const,
      state: input.state,
      financial: input.financialBefore,
      posting: null,
      paidReceipt: previous,
    });
  }
  const draft = prepareBeneficialHousingRent(
    { ...input, simTime: input.command.simTime },
    sha,
  );
  if (
    input.command.commandType !== BENEFICIAL_HOUSING_RENT_COMMAND ||
    input.command.worldId !== input.receipt.worldId ||
    input.command.countryId !== input.receipt.countryId ||
    input.command.expectedWorldVersion !== input.financialBefore.worldVersion ||
    input.command.idempotencyKey !== draft.idempotencyKey ||
    input.command.officeId !== null
  )
    invalid('wrong narrow rent command scope/head/idempotency');
  equal(
    JSON.parse(input.command.canonicalPayload),
    draft.commandPayload,
    'rent command payload differs',
  );
  if (
    transition.events.length !== 1 ||
    transition.events[0]!.eventType !== BENEFICIAL_HOUSING_RENT_EVENT
  )
    invalid('one exact beneficial rent event required');
  equal(
    JSON.parse(transition.events[0]!.canonicalPayload),
    draft.eventPayload,
    'rent event payload differs',
  );
  const posting = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: draft.batchId,
      worldId: input.command.worldId,
      causationCommandId: input.command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: transition.worldVersionBefore,
      worldVersionAfter: transition.worldVersionAfter,
      simTime: input.command.simTime,
      command: input.command,
      transition,
      settlementCurrency: draft.amount.currency,
      legs: [
        {
          legId: financialPostingLegId(`${draft.batchId}_CREDIT`),
          account: draft.tenantAccount,
          direction: 'CREDIT',
          amount: draft.amount,
          counterpartyAccountId: draft.landlordAccount.accountId,
        },
        {
          legId: financialPostingLegId(`${draft.batchId}_DEBIT`),
          account: draft.landlordAccount,
          direction: 'DEBIT',
          amount: draft.amount,
          counterpartyAccountId: draft.tenantAccount.accountId,
        },
      ],
    },
    sha,
  );
  const totalBefore = aggregateBeneficialHousingLiquidClaim(
    input.financialBefore,
    input.receipt,
  ).availableAmount;
  const applied = applyFinancialPostingBatch(input.financialBefore, posting);
  if (applied.receipt.outcome !== 'APPLIED')
    invalid('new period unexpectedly duplicated');
  if (
    aggregateBeneficialHousingLiquidClaim(applied.state, input.receipt)
      .availableAmount !== totalBefore
  )
    invalid('rent changed total legal household funds');
  const paidReceipt = freeze({
    leaseId: input.leaseId,
    periodIndex: input.periodIndex,
    batchId: posting.batchId,
    batchFingerprint: posting.fingerprint,
    commandFingerprint: input.command.fingerprint,
    transitionFingerprint: fingerprint(authoritativeBinding, sha),
    amount: canonicalDecimal(draft.amount.amount),
  });
  const state = freeze({
    ...input.state,
    worldVersion: applied.state.worldVersion,
    paid: [...input.state.paid, paidReceipt],
  });
  states.add(state);
  return freeze({
    outcome: 'APPLIED' as const,
    state,
    financial: applied.state,
    posting,
    paidReceipt,
  });
}
/** Domain-specific replay validates rights and actual posting, then independently
 * reconciles the joint V08 financial projection from the retained child seed. */
export function replayBeneficialHousingRent(
  input: {
    seed: OpeningSeed;
    receipt: BeneficialHousingReclassificationReceipt;
    steps: readonly {
      command: CanonicalCommand;
      transition: AuthoritativeTransition;
      leaseId: string;
      periodIndex: string;
      posting: FinancialPostingBatch;
    }[];
  },
  sha: Sha256Hex,
) {
  if (input.seed.fingerprint !== input.receipt.childSeedFingerprint)
    invalid('wrong reclassified seed');
  let state = createBeneficialHousingRentState(input.receipt),
    financial = rebuildV08LedgersFromLineage({
      seed: input.seed,
      sha256Hex: sha,
    }).financial;
  const transitions: V08AuthoritativeLedgerTransition[] = [];
  for (const step of input.steps) {
    const applied = settleBeneficialHousingRent(
      { ...step, receipt: input.receipt, state, financialBefore: financial },
      sha,
    );
    if (!applied.posting) invalid('duplicate transition in rent lineage');
    equal(applied.posting, step.posting, 'historical rent posting differs');
    state = applied.state;
    financial = applied.financial;
    transitions.push({
      command: step.command,
      transition: step.transition,
      inventoryPostings: [],
      financialPostingBatches: [step.posting],
    });
  }
  const rebuilt = rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions,
    sha256Hex: sha,
  });
  equal(rebuilt.financial, financial, 'joint V08 rent replay differs');
  return freeze({
    state,
    financial: rebuilt.financial,
    inventory: rebuilt.inventory,
  });
}
