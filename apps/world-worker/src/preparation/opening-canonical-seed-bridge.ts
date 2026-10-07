/** P0 preparation only. No persistence, World creation, admission or startup.
 * All inputs are independently resolved SERVER inputs, never request approval.
 * Reuses approved A inspection and existing Core constructors/parser/ledgers.
 */
import { createHash } from 'node:crypto';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Money,
  Quantity,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  createOpeningSource,
  createOpeningSeed,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  createInventoryAccount,
  createFinancialAccount,
  openingSourceId,
  openingSeedId,
  openingInventoryEntryId,
  financialOpeningBatchId,
  financialOpeningLegId,
  worldId,
  type InventoryAccount,
  type FinancialAccount,
  type FinancialOpeningBatch,
  type OpeningInventoryEntry,
  type OpeningSeed,
  type ReplayVersionBinding,
} from '@econmind/core';
import {
  inspectOpeningEconomicDecision,
  OPENING_FINANCE_FIELDS,
  type TrustedOpeningDecisionInputs,
  type OpeningEconomicDecisionInspection,
  type OpeningFinancialAllocationV1,
} from './opening-economic-decision.js';

export const FROZEN_OPENING_MAPPING_SHA256 =
  'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253';
const CHECKSUMS =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const FINANCE_SHA =
  '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805';
const SOURCE_LOCATOR = 'artifacts/world-balanced-candidate-v1/CHECKSUMS.json';
const COUNTRIES = Object.freeze(
  Array.from(
    { length: 70 },
    (_, i) => `COUNTRY_${String(i + 1).padStart(2, '0')}`,
  ),
);
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
type R = Record<string, unknown>;
interface Stock {
  sourceStockId: string;
  sourceCountryId: string;
  coreCountryId: string;
  commodityId: string;
  unit: string;
  available: string;
  reserved: string;
  inTransit: string;
  total: string;
  proposedInventoryEntryId: string;
  proposedBatchId: string;
  proposedInventoryLocationId: string;
}
interface Mapping {
  mappingFingerprint: string;
  records: {
    stocks: Stock[];
    finance: { coreCountryId: string; values: Record<string, string> }[];
  };
}
export interface OpeningCountrySeedAssembly {
  readonly countryId: string;
  /** An A DOMAIN_ADOPTED node whose value binds the entire assembly below. */
  readonly adoptionRef: string;
  readonly roster: Readonly<{
    operator: string;
    government: string;
    households: string;
    bank: string;
    centralBank: string;
  }>;
  readonly inventoryEntries: readonly Readonly<{
    entryId: string;
    account: InventoryAccount;
    quantity: Readonly<{ amount: string; unit: string }>;
  }>[];
  readonly financialBatch: Readonly<{
    batchId: string;
    settlementCurrency: string;
    legs: readonly Readonly<{
      legId: string;
      account: FinancialAccount;
      direction: 'DEBIT' | 'CREDIT';
      amount: Readonly<{ amount: string; currency: string }>;
      counterpartLegId: string;
    }>[];
  }>;
}
export interface OpeningCanonicalSeedAssembly {
  readonly schemaVersion: 'opening-canonical-seed-assembly-v1';
  readonly seedId: string;
  readonly sourceId: string;
  readonly replayBinding: Readonly<ReplayVersionBinding>;
  readonly orchestratorVersion: string;
  readonly countries: readonly OpeningCountrySeedAssembly[];
}
/** Fingerprint utility only, not approval. A's independently loaded owner intent
 * must already bind a matching DOMAIN_ADOPTED node for every country. */
export function openingCountrySeedAssemblyFingerprint(
  assembly: OpeningCanonicalSeedAssembly,
  country: OpeningCountrySeedAssembly,
): string {
  const { adoptionRef: omitted, ...body } = country;
  void omitted;
  return hash({
    schemaVersion: assembly.schemaVersion,
    seedId: assembly.seedId,
    sourceId: assembly.sourceId,
    replayBinding: assembly.replayBinding,
    orchestratorVersion: assembly.orchestratorVersion,
    mappingSha256: FROZEN_OPENING_MAPPING_SHA256,
    country: body,
  });
}
export interface OpeningSeedBridgeBlocker {
  readonly countryId: string;
  readonly field: string;
  readonly code: string;
}
export interface OpeningCanonicalSeedBridgeResult {
  readonly status: 'BLOCKED' | 'NOT_ADMITTED';
  readonly seed: Readonly<OpeningSeed> | null;
  readonly blockers: readonly OpeningSeedBridgeBlocker[];
  readonly decisionFingerprint: string | null;
  readonly sourceIdentity: Readonly<{
    mappingSha256: string;
    mappingFingerprint: string | null;
    mappingBytesVerified: boolean;
    checksumsSha256: string;
    financeSha256: string;
    countryCount: '70';
    stockCellCount: '840';
    positiveStockCellCount: '619';
    zeroStockCellCount: '221';
  }>;
  readonly activationAllowed: false;
  readonly admissionEvaluated: false;
}
function record(v: unknown): R {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Error('RECORD_REQUIRED');
  return v as R;
}
function exactKeys(v: R, keys: readonly string[]) {
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw new Error('UNSUPPORTED_ASSEMBLY_FIELDS');
}
function clone<T>(v: unknown): T {
  return JSON.parse(canonicalSerialize(v)) as T;
}
const signed = (leg: { direction: string; amount: Money }) =>
  leg.direction === 'DEBIT'
    ? leg.amount
    : Money.from('0', 'GCU').subtract(leg.amount);
const normal = (amount: Money, kind: string) =>
  kind === 'ASSET' ? amount : Money.from('0', 'GCU').subtract(amount);

/** No trust-result parameter, approval flag, write adapter or activation callback.
 * Complete explicit accounting legs must be human-adopted; none are inferred. */
export function prepareOpeningCanonicalSeed(input: {
  readonly decision: unknown;
  readonly trusted: TrustedOpeningDecisionInputs;
  readonly frozenMappingBytes: string;
  readonly assembly: unknown | null;
}): Readonly<OpeningCanonicalSeedBridgeResult> {
  const blockers: OpeningSeedBridgeBlocker[] = [];
  const add = (field: string, code: string, countryId?: string) => {
    for (const id of countryId === undefined ? COUNTRIES : [countryId])
      blockers.push({ countryId: id, field, code });
  };
  let inspection: OpeningEconomicDecisionInspection | null = null,
    mapping: Mapping | null = null;
  let seed: Readonly<OpeningSeed> | null = null;
  const finish = (): Readonly<OpeningCanonicalSeedBridgeResult> => {
    const unique = [
      ...new Map(
        blockers.map((b) => [canonicalSerialize(b), Object.freeze(b)]),
      ).values(),
    ];
    unique.sort((a, b) => {
      const x = canonicalSerialize(a),
        y = canonicalSerialize(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return Object.freeze({
      status: unique.length === 0 ? 'NOT_ADMITTED' : 'BLOCKED',
      seed: unique.length === 0 ? seed : null,
      blockers: Object.freeze(unique),
      decisionFingerprint: inspection?.candidate.fingerprint ?? null,
      sourceIdentity: Object.freeze({
        mappingSha256: FROZEN_OPENING_MAPPING_SHA256,
        mappingFingerprint: mapping?.mappingFingerprint ?? null,
        mappingBytesVerified: mapping !== null,
        checksumsSha256: CHECKSUMS,
        financeSha256: FINANCE_SHA,
        countryCount: '70',
        stockCellCount: '840',
        positiveStockCellCount: '619',
        zeroStockCellCount: '221',
      }),
      activationAllowed: false,
      admissionEvaluated: false,
    });
  };
  try {
    if (sha(input.frozenMappingBytes) !== FROZEN_OPENING_MAPPING_SHA256)
      throw new Error('MAPPING_IDENTITY_MISMATCH');
    mapping = JSON.parse(input.frozenMappingBytes) as Mapping;
    if (
      mapping.records.finance.length !== 70 ||
      mapping.records.stocks.length !== 840
    )
      throw new Error('MAPPING_SCOPE_MISMATCH');
  } catch {
    add('frozenMapping', 'FROZEN_MAPPING_INVALID');
    return finish();
  }
  try {
    inspection = inspectOpeningEconomicDecision({
      decision: input.decision,
      trusted: input.trusted,
    });
  } catch {
    add('decision', 'DECISION_CONTRACT_INVALID');
    return finish();
  }
  for (const b of inspection.blockers)
    add(b.field, b.code, b.countryId ?? undefined);
  const decision = inspection.candidate.body;
  if (
    decision.countries.length !== 70 ||
    input.trusted.source.finance.length !== 70 ||
    COUNTRIES.some((id) => !decision.countries.some((c) => c.countryId === id))
  )
    add('countries', 'FULL_70_COUNTRY_SCOPE_REQUIRED');
  for (const [index, row] of mapping.records.finance.entries()) {
    const source = input.trusted.source.finance.find(
      (s) => s.countryId === row.coreCountryId,
    );
    if (
      !source ||
      source.sourceRowPointer !== `/${index}` ||
      OPENING_FINANCE_FIELDS.some((f) => source.values[f] !== row.values[f])
    )
      add('finance', 'FROZEN_FINANCE_LEXEME_MISMATCH', row.coreCountryId);
  }
  if (input.assembly === null) {
    add('assembly', 'CANONICAL_SEED_ASSEMBLY_MISSING');
    return finish();
  }
  let assembly: OpeningCanonicalSeedAssembly;
  try {
    assembly = clone<OpeningCanonicalSeedAssembly>(input.assembly);
    exactKeys(record(assembly), [
      'schemaVersion',
      'seedId',
      'sourceId',
      'replayBinding',
      'orchestratorVersion',
      'countries',
    ]);
    if (assembly.schemaVersion !== 'opening-canonical-seed-assembly-v1')
      throw new Error('UNSUPPORTED_SCHEMA');
    openingSeedId(assembly.seedId);
    openingSourceId(assembly.sourceId);
    if (
      !Array.isArray(assembly.countries) ||
      assembly.countries.length !== 70 ||
      new Set(assembly.countries.map((c) => c.countryId)).size !== 70 ||
      COUNTRIES.some(
        (id) => !assembly.countries.some((c) => c.countryId === id),
      )
    )
      throw new Error('COUNTRY_SCOPE');
    if (
      canonicalSerialize(assembly.replayBinding) !==
        canonicalSerialize(CURRENT_REPLAY_BINDING) ||
      decision.effectiveScope.modelVersion !==
        CURRENT_REPLAY_BINDING.modelVersion ||
      assembly.orchestratorVersion !==
        decision.effectiveScope.orchestratorVersion
    )
      throw new Error('REPLAY_MODEL_OR_ORCHESTRATOR_MISMATCH');
  } catch {
    add('assembly', 'ASSEMBLY_SCHEMA_SCOPE_OR_VERSION_INVALID');
    return finish();
  }
  assembly = {
    ...assembly,
    countries: [...assembly.countries].sort((a, b) =>
      a.countryId < b.countryId ? -1 : 1,
    ),
  };
  const inventory: OpeningInventoryEntry[] = [],
    batches: FinancialOpeningBatch[] = [];
  const stocks = mapping.records.stocks;
  const positive = stocks.filter(
    (s) => !Quantity.from(s.available, s.unit).amount.isZero(),
  );
  if (positive.length !== 619 || stocks.length - positive.length !== 221)
    add('stocks', 'STOCK_SOURCE_COUNTS_MISMATCH');
  const ids = new Set<string>(),
    claimCountries = new Map<string, string>();
  for (const country of assembly.countries) {
    const cid = country.countryId,
      allocation = decision.countries.find((c) => c.countryId === cid);
    const fail = (field: string, code: string) => add(field, code, cid);
    try {
      exactKeys(record(country), [
        'countryId',
        'adoptionRef',
        'roster',
        'inventoryEntries',
        'financialBatch',
      ]);
      exactKeys(record(country.roster), [
        'operator',
        'government',
        'households',
        'bank',
        'centralBank',
      ]);
      const nn = cid.slice(-2),
        roster = {
          operator: `ENTITY_OPERATOR_${nn}`,
          government: `ENTITY_GOVERNMENT_${nn}`,
          households: `ENTITY_HOUSEHOLDS_${nn}`,
          bank: `ENTITY_BANK_${nn}`,
          centralBank: `ENTITY_CENTRAL_BANK_${nn}`,
        };
      if (
        canonicalSerialize(country.roster) !== canonicalSerialize(roster) ||
        !allocation ||
        allocation.legalEntities?.treasury !== roster.government ||
        allocation.legalEntities.centralBank !== roster.centralBank ||
        allocation.legalEntities.bank !== roster.bank
      )
        fail('roster', 'FIXED_ROSTER_NOT_ADOPTED');
      const p = decision.provenance.find((n) => n.ref === country.adoptionRef);
      if (
        inspection.status !== 'DECISION_VALIDATED_NOT_SEED' ||
        !p ||
        p.kind !== 'DOMAIN_ADOPTED' ||
        p.rule !== 'EXPLICIT_OWNER_VALUE' ||
        p.source !== null ||
        p.ownerRecordRef !== decision.ownerAdoption?.reference ||
        p.value !== openingCountrySeedAssemblyFingerprint(assembly, country) ||
        !allocation ||
        OPENING_FINANCE_FIELDS.some(
          (f) => !p.inputRefs.includes(allocation.fieldProvenance[f]!),
        )
      )
        fail('adoptionRef', 'EXACT_COUNTRY_ASSEMBLY_ADOPTION_MISSING');
      const expected = positive.filter((s) => s.coreCountryId === cid);
      if (
        !Array.isArray(country.inventoryEntries) ||
        country.inventoryEntries.length !== expected.length
      )
        fail('inventory', 'POSITIVE_STOCK_COVERAGE_MISMATCH');
      const cells = new Set<string>();
      for (const e of country.inventoryEntries) {
        exactKeys(record(e), ['entryId', 'account', 'quantity']);
        const stock = expected.find(
          (s) => s.commodityId === e.account.commodityId,
        );
        const a = createInventoryAccount(e.account),
          q = Quantity.from(e.quantity.amount, e.quantity.unit);
        if (
          !stock ||
          cells.has(a.commodityId) ||
          a.countryId !== cid ||
          a.worldId !== decision.effectiveScope.worldId ||
          e.entryId !== stock.proposedInventoryEntryId ||
          a.batchId !== stock.proposedBatchId ||
          a.physicalLocationId !== stock.proposedInventoryLocationId ||
          a.titleHolderId !== roster.operator ||
          a.riskBearerId !== roster.operator ||
          a.bucket !== 'AVAILABLE' ||
          a.reservationId !== null ||
          a.shipmentId !== null ||
          a.economicRecognitionId !== null ||
          a.unit !== stock.unit ||
          q.unit !== stock.unit ||
          !q.amount.isPositive() ||
          !q.amount.equals(Quantity.from(stock.available, stock.unit).amount)
        )
          fail(e.entryId, 'INVENTORY_SOURCE_OR_RIGHTS_MISMATCH');
        cells.add(a.commodityId);
        inventory.push({
          entryId: openingInventoryEntryId(e.entryId),
          sourceId: openingSourceId(assembly.sourceId),
          account: a,
          quantity: q,
        });
      }
      if (expected.some((s) => !cells.has(s.commodityId)))
        fail('inventory', 'POSITIVE_STOCK_COVERAGE_MISMATCH');
      exactKeys(record(country.financialBatch), [
        'batchId',
        'settlementCurrency',
        'legs',
      ]);
      if (country.financialBatch.settlementCurrency !== 'GCU')
        fail('financialBatch', 'EXACT_GCU_REQUIRED');
      const legs = country.financialBatch.legs.map((l) => {
        exactKeys(record(l), [
          'legId',
          'account',
          'direction',
          'amount',
          'counterpartLegId',
        ]);
        const account = createFinancialAccount(l.account),
          amount = Money.from(l.amount.amount, l.amount.currency);
        if (
          account.countryId !== cid ||
          account.worldId !== decision.effectiveScope.worldId ||
          account.currency !== 'GCU' ||
          amount.currency !== 'GCU' ||
          !amount.amount.isPositive()
        )
          fail(l.legId, 'FINANCIAL_SCOPE_OR_POSITIVE_AMOUNT_INVALID');
        if (ids.has(account.accountId))
          fail(account.accountId, 'DUPLICATE_GLOBAL_FINANCIAL_ACCOUNT');
        ids.add(account.accountId);
        if (account.claimId !== null) {
          const prior = claimCountries.get(account.claimId);
          if (prior !== undefined && prior !== cid) {
            fail(account.claimId, 'CLAIM_SHARED_ACROSS_COUNTRIES');
            add(account.claimId, 'CLAIM_SHARED_ACROSS_COUNTRIES', prior);
          }
          claimCountries.set(account.claimId, cid);
        }
        return {
          legId: financialOpeningLegId(l.legId),
          account,
          amount,
          direction: l.direction,
          counterpartLegId: financialOpeningLegId(l.counterpartLegId),
        };
      });
      if (allocation && inspection.status === 'DECISION_VALIDATED_NOT_SEED')
        validateFinancial(allocation, country, legs, inspection, fail);
      batches.push({
        batchId: financialOpeningBatchId(country.financialBatch.batchId),
        sourceId: openingSourceId(assembly.sourceId),
        settlementCurrency: 'GCU',
        legs,
      });
    } catch {
      fail('assembly', 'COUNTRY_ASSEMBLY_CONTRACT_INVALID');
    }
  }
  if (blockers.length !== 0) return finish();
  try {
    const source = createOpeningSource(
      {
        schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: openingSourceId(assembly.sourceId),
        sourceKind: 'AUTHORITATIVE_DATASET',
        locator: SOURCE_LOCATOR,
        sourceVersion: CHECKSUMS,
        payload: {
          provenanceStatus: 'DECISION_VALIDATED_NOT_ADMITTED',
          mappingSha256: FROZEN_OPENING_MAPPING_SHA256,
          mappingFingerprint: mapping.mappingFingerprint,
          financeSha256: FINANCE_SHA,
          sourceFinance: [...input.trusted.source.finance].sort((a, b) =>
            a.countryId < b.countryId ? -1 : 1,
          ),
          originalStockCells: stocks.map((s) => ({
            sourceStockId: s.sourceStockId,
            sourceCountryId: s.sourceCountryId,
            coreCountryId: s.coreCountryId,
            commodityId: s.commodityId,
            unit: s.unit,
            available: s.available,
            reserved: s.reserved,
            inTransit: s.inTransit,
            total: s.total,
          })),
          decision: inspection.candidate.body,
          decisionFingerprint: inspection.candidate.fingerprint,
          assembly,
        },
      },
      sha,
    );
    const constructed = createOpeningSeed(
      {
        schemaVersion: OPENING_SEED_SCHEMA_VERSION,
        seedId: openingSeedId(assembly.seedId),
        worldId: worldId(decision.effectiveScope.worldId!),
        openingWorldVersion: '0',
        replayBinding: assembly.replayBinding,
        sources: [source],
        inventoryEntries: inventory,
        financialBatches: batches,
      },
      sha,
    );
    seed = parseOpeningSeed(clone(constructed), sha);
    rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  } catch {
    add('coreSeed', 'CORE_SEED_CONTRACT_REJECTED');
  }
  return finish();
}

function validateFinancial(
  c: OpeningFinancialAllocationV1,
  country: OpeningCountrySeedAssembly,
  legs: FinancialOpeningBatch['legs'],
  inspection: OpeningEconomicDecisionInspection,
  fail: (field: string, code: string) => void,
) {
  const roster = country.roster,
    amounts = new Map<string, Money>(
      legs.map((l) => [l.account.accountId, signed(l)]),
    );
  const zero = () => Money.from('0', 'GCU'),
    sum = (owner: string, kind: string, cp?: string) =>
      legs
        .filter(
          (l) =>
            l.account.ownerId === owner &&
            l.account.accountClass === kind &&
            (cp === undefined || l.account.counterpartyEntityId === cp),
        )
        .reduce((a, l) => a.add(normal(signed(l), kind)), zero());
  const check = (actual: Money, expected: string, field: string) => {
    if (!actual.amount.equals(Money.from(expected, 'GCU').amount))
      fail(field, 'FINANCIAL_POSITION_DECISION_MISMATCH');
  };
  const match = (
    id: string,
    owner: string,
    kind: string,
    claim: string | null,
    cp: string | null,
    expected: string,
  ) => {
    const l = legs.find((l) => l.account.accountId === id),
      value = amounts.get(id) ?? zero();
    if (
      l &&
      (l.account.ownerId !== owner ||
        l.account.accountClass !== kind ||
        l.account.claimId !== claim ||
        l.account.counterpartyEntityId !== cp)
    )
      fail(id, 'ACCOUNT_IDENTITY_DECISION_MISMATCH');
    if (!l && !Money.from(expected, 'GCU').amount.isZero())
      fail(id, 'REQUIRED_FINANCIAL_ACCOUNT_MISSING');
    check(normal(value, kind), expected, id);
  };
  for (const p of c.centralBankPositions)
    match(
      p.accountId,
      roster.centralBank,
      p.accountClass,
      p.claimId,
      p.counterpartyEntityId,
      p.amount,
    );
  if (
    legs.some(
      (l) =>
        l.account.ownerId === roster.centralBank &&
        !c.centralBankPositions.some(
          (p) => p.accountId === l.account.accountId,
        ),
    )
  )
    fail('centralBank', 'UNADOPTED_CB_POSITION_OR_BACKING');
  for (const pair of [c.reserveClaim, c.treasuryClaim])
    if (pair)
      match(
        pair.assetAccountId,
        pair.assetOwnerId,
        'ASSET',
        pair.claimId,
        pair.liabilityOwnerId,
        pair.amount,
      );
  const derived = inspection.derivedBank.find(
    (d) => d.countryId === c.countryId,
  );
  if (!derived) {
    fail('bank', 'VALIDATED_COMPONENT_DERIVATION_MISSING');
    return;
  }
  if (!Money.from(c.sourceFinance.bankLoanAssets, 'GCU').amount.isZero())
    fail('bankLoanAssets', 'LOAN_OPENING_MODEL_NOT_SUPPORTED_BY_NARROW_BRIDGE');
  check(
    sum(roster.bank, 'ASSET'),
    c.sourceFinance.bankReserveAssets,
    'bankAssets',
  );
  check(
    sum(roster.bank, 'LIABILITY'),
    derived.bankDepositLiabilities,
    'bankLiabilities',
  );
  check(sum(roster.bank, 'EQUITY'), derived.bankEquity, 'bankEquity');
  for (const [owner, expected] of [
    [roster.households, c.sourceFinance.householdBankDeposits],
    [roster.operator, c.sourceFinance.businessBankDeposits],
  ] as const) {
    check(sum(roster.bank, 'LIABILITY', owner), expected, `${owner}.bankClaim`);
    check(sum(owner, 'ASSET', roster.bank), expected, `${owner}.deposit`);
    check(sum(owner, 'ASSET'), expected, `${owner}.assets`);
    check(sum(owner, 'LIABILITY'), '0', `${owner}.liabilities`);
    check(sum(owner, 'EQUITY'), expected, `${owner}.explicitGenesisFunding`);
  }
  check(sum(roster.government, 'ASSET'), c.treasuryOpeningBalance!, 'treasury');
  check(sum(roster.government, 'LIABILITY'), '0', 'treasuryLiabilities');
  check(
    sum(roster.government, 'EQUITY'),
    c.treasuryOpeningBalance!,
    'treasuryExplicitGenesisFunding',
  );
  for (const l of legs) {
    const a = l.account;
    if (
      !Object.values(roster).includes(a.ownerId) ||
      !['ASSET', 'LIABILITY', 'EQUITY'].includes(a.accountClass)
    )
      fail(a.accountId, 'ACCOUNT_OUTSIDE_NARROW_ADOPTED_MODEL');
    if (
      (a.accountClass === 'EQUITY' && a.claimId !== null) ||
      (a.ownerId === roster.bank &&
        a.accountClass === 'ASSET' &&
        a.accountId !== c.reserveClaim?.assetAccountId) ||
      (a.ownerId === roster.bank &&
        a.accountClass === 'LIABILITY' &&
        a.counterpartyEntityId !== roster.households &&
        a.counterpartyEntityId !== roster.operator)
    )
      fail(a.accountId, 'ACCOUNT_OUTSIDE_NARROW_ADOPTED_MODEL');
    if (a.claimId !== null) {
      const paired = legs.filter((x) => x.account.claimId === a.claimId),
        other = paired.find((x) => x.account.accountId !== a.accountId);
      if (
        paired.length !== 2 ||
        !other ||
        other.account.ownerId !== a.counterpartyEntityId ||
        other.account.counterpartyEntityId !== a.ownerId ||
        new Set(paired.map((x) => x.account.accountClass)).size !== 2 ||
        !paired.some((x) => x.account.accountClass === 'ASSET') ||
        !paired.some((x) => x.account.accountClass === 'LIABILITY') ||
        l.direction === other.direction ||
        l.counterpartLegId !== other.legId ||
        other.counterpartLegId !== l.legId ||
        !l.amount.amount.equals(other.amount.amount)
      )
        fail(a.claimId, 'CLAIM_OPPOSITE_LEGS_MISSING_OR_MISMATCH');
    } else if (a.ownerId === roster.bank && a.accountClass === 'LIABILITY')
      fail(a.accountId, 'DEPOSIT_CLAIM_REQUIRED');
    if (
      a.ownerId === roster.government &&
      a.accountClass === 'ASSET' &&
      ((c.fundsModel === 'INDEPENDENT_GENESIS_POOLS' && a.claimId !== null) ||
        (c.fundsModel === 'TREASURY_DEPOSIT_AT_CB' &&
          a.accountId !== c.treasuryClaim?.assetAccountId))
    )
      fail(a.accountId, 'TREASURY_MODEL_ACCOUNT_MISMATCH');
  }
}
