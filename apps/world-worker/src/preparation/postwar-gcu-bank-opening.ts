/** Once-only authorized new-World endowment. Pure canonical opening inputs;
 * never a payment, executable FX quote, runtime admission or database write. */
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import { parseFinancialRegistrySourceJson } from './financial-opening-package-registry.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
// Core identity proves immutable structure, not a caller-injected SHA function.
// Recheck every source and the true outer intent before data reuse.
function requireSeed(input: unknown): Readonly<C.OpeningSeed> {
  if (!input || typeof input !== 'object' || !C.isValidatedOpeningSeed(input))
    return C.parseOpeningSeed(input, sha);
  for (const source of input.sources) {
    const digest = createHash('sha256')
      .update('SHA-256\n{"payload":')
      .update(source.canonicalPayload)
      .update('}')
      .digest('hex');
    if (source.payloadHash !== `sha256:${digest}`)
      invalid('source SHA mismatch');
  }
  const { fingerprint, ...intent } = input;
  if (fingerprint !== `sha256:${sha(C.canonicalHashInput(intent))}`)
    invalid('seed SHA mismatch');
  return input;
}

export const POSTWAR_GCU_OPENING_VERSION =
  'POSTWAR_GCU_BANK_OPENING_20261029_V1';
export const POSTWAR_GCU_OPENING_CAP = '6662014088.360237';
export const POSTWAR_GCU_OPENING_PINS = Object.freeze({
  tradePlans:
    'c3c8c74dc81d13c0115fd1b5fff1b6f886fd79b3b6ba60b9659b126b0db928cd',
  mapping: 'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253',
  compactMapping:
    'e9d0d7ff2155e762be8a53dc9e48a20b7ef2083139349f944e89bc09d36d4479',
  policy: 'fe6592441e44d71cbc9be0696865142a25a73e2eb2556c14bdc8f6b51bda6472',
  userReceipt:
    '0e8fdf88f0862a22bd3811155a8e7b2b2bd0818d0f479a97873959e91c417433',
});
type Row = Record<string, unknown>;
type Decimal = Readonly<{ n: bigint; scale: number }>;
function invalid(reason: string): never {
  throw Error(`POSTWAR_GCU_OPENING_INVALID: ${reason}`);
}
function row(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('record required');
  return v as Row;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) invalid('text required');
  return v;
}
function list(v: unknown): unknown[] {
  if (!Array.isArray(v)) invalid('array required');
  return v;
}
function decimal(v: unknown): Decimal {
  const s = text(v);
  if (!/^(0|[1-9]\d*)(\.\d+)?$/u.test(s))
    invalid('nonnegative exact decimal required');
  const [whole, frac = ''] = s.split('.');
  return { n: BigInt(whole! + frac), scale: frac.length };
}
function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return {
    n:
      a.n * 10n ** BigInt(scale - a.scale) +
      b.n * 10n ** BigInt(scale - b.scale),
    scale,
  };
}
function multiply(a: Decimal, b: Decimal): Decimal {
  return { n: a.n * b.n, scale: a.scale + b.scale };
}
function format(v: Decimal): string {
  const digits = v.n.toString().padStart(v.scale + 1, '0');
  return v.scale
    ? `${digits.slice(0, -v.scale)}.${digits.slice(-v.scale)}`
        .replace(/0+$/u, '')
        .replace(/\.$/u, '')
    : digits;
}
function floorMicro(v: Decimal): bigint {
  return v.scale > 6
    ? v.n / 10n ** BigInt(v.scale - 6)
    : v.n * 10n ** BigInt(6 - v.scale);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function same(a: unknown, b: unknown, reason: string) {
  if (C.canonicalSerialize(a) !== C.canonicalSerialize(b)) invalid(reason);
}
export interface PostwarGcuOpeningInputs {
  readonly tradePlansBytes: string;
  readonly compactMappingBytes: string;
  readonly policyBytes: string;
  readonly userReceiptBytes: string;
}
export interface PostwarGcuCountryEndowment {
  readonly sourceCountryId: string;
  readonly countryId: string;
  readonly grossImportReferenceGcuPerDay: string;
  readonly inboundFreightReferenceGcuPerDay: string;
  readonly openingGcu: string;
  readonly sourcePlanPointers: readonly string[];
}
export interface PostwarGcuBankOpeningPlan {
  readonly schemaVersion: 'postwar-gcu-bank-opening-plan-v1';
  readonly policyVersion: typeof POSTWAR_GCU_OPENING_VERSION;
  readonly status: 'PROJECT_POLICY_ADOPTED_NOT_RUNTIME_ADMITTED';
  readonly provenanceKind: 'GENERATED_POLICY';
  readonly referenceNature: 'UNSIGNED_PLANS_NOT_EXECUTABLE_QUOTES';
  readonly countries: readonly PostwarGcuCountryEndowment[];
  readonly totalGcu: string;
  readonly planCount: string;
  readonly inputs: PostwarGcuOpeningInputs;
  readonly fingerprint: string;
}
const plans = new WeakSet<object>();
/** Only fixed selected source and this exact real user receipt are accepted.
 * The pins are provenance checks; they do not assert cryptographic admission. */
export function derivePostwarGcuBankOpening(
  input: PostwarGcuOpeningInputs,
): PostwarGcuBankOpeningPlan {
  for (const [key, bytes] of [
    ['tradePlans', input.tradePlansBytes],
    ['compactMapping', input.compactMappingBytes],
    ['policy', input.policyBytes],
    ['userReceipt', input.userReceiptBytes],
  ] as const)
    if (sha(bytes) !== POSTWAR_GCU_OPENING_PINS[key])
      invalid(`${key} pin mismatch`);
  const receipt = row(JSON.parse(input.userReceiptBytes));
  if (
    receipt.answer !== '采用上述一次性开局方案' ||
    receipt.authority !== 'EXPLICIT_USER_ANSWER_IN_THIS_TASK'
  )
    invalid('actual user adoption required');
  const mapping = row(JSON.parse(input.compactMappingBytes));
  if (mapping.sourceMappingSha256 !== POSTWAR_GCU_OPENING_PINS.mapping)
    invalid('mapping lineage mismatch');
  const rows = list(parseFinancialRegistrySourceJson(input.tradePlansBytes));
  if (rows.length !== 641) invalid('complete 641 plan source required');
  const seen = new Set<string>();
  const totals = new Map<
    string,
    { goods: Decimal; freight: Decimal; pointers: string[] }
  >();
  rows.forEach((raw, index) => {
    const p = row(raw),
      id = text(p.id),
      buyer = text(p.buyerCountryId);
    if (seen.has(id) || p.status !== 'UNSIGNED_CAPACITY_AND_TRADE_PLAN')
      invalid('duplicate or changed plan nature');
    seen.add(id);
    const current = totals.get(buyer) ?? {
      goods: { n: 0n, scale: 0 },
      freight: { n: 0n, scale: 0 },
      pointers: [],
    };
    current.goods = add(
      current.goods,
      multiply(decimal(p.quantityPerDay), decimal(p.referenceUnitPriceGcu)),
    );
    current.freight = add(
      current.freight,
      decimal(p.transportCostGcuDayProposal),
    );
    current.pointers.push(`/${index}`);
    totals.set(buyer, current);
  });
  const countries = list(mapping.countries).map(
    (raw): PostwarGcuCountryEndowment => {
      const c = row(raw),
        sourceCountryId = text(c.sourceCountryId),
        countryId = text(c.countryId);
      const t = totals.get(sourceCountryId);
      if (!t) invalid('country planning source missing');
      const micro = floorMicro(add(t.goods, t.freight));
      if (micro <= 0n) invalid('nonpositive opening amount');
      return {
        sourceCountryId,
        countryId,
        grossImportReferenceGcuPerDay: format(t.goods),
        inboundFreightReferenceGcuPerDay: format(t.freight),
        openingGcu: format({ n: micro, scale: 6 }),
        sourcePlanPointers: t.pointers,
      };
    },
  );
  if (
    countries.length !== 70 ||
    totals.size !== 70 ||
    new Set(countries.map((c) => c.countryId)).size !== 70 ||
    new Set(countries.map((c) => c.sourceCountryId)).size !== 70
  )
    invalid('70-country bijection required');
  const totalGcu = format({
    n: countries.reduce((n, c) => n + floorMicro(decimal(c.openingGcu)), 0n),
    scale: 6,
  });
  if (totalGcu !== POSTWAR_GCU_OPENING_CAP)
    invalid('authorized aggregate cap/source changed');
  const body: Omit<PostwarGcuBankOpeningPlan, 'fingerprint'> = {
    schemaVersion: 'postwar-gcu-bank-opening-plan-v1' as const,
    policyVersion: POSTWAR_GCU_OPENING_VERSION,
    status: 'PROJECT_POLICY_ADOPTED_NOT_RUNTIME_ADMITTED' as const,
    provenanceKind: 'GENERATED_POLICY' as const,
    referenceNature: 'UNSIGNED_PLANS_NOT_EXECUTABLE_QUOTES' as const,
    countries,
    totalGcu,
    planCount: String(rows.length),
    inputs: { ...input },
  };
  const result = freeze({
    ...body,
    fingerprint: `sha256:${sha(C.canonicalHashInput(body))}`,
  });
  plans.add(result);
  return result;
}

export interface PostwarGcuBankOpeningFamily {
  readonly schemaVersion: 'postwar-gcu-bank-opening-family-v1';
  readonly parentSeed: Readonly<C.OpeningSeed>;
  readonly seed: Readonly<C.OpeningSeed>;
  readonly source: Readonly<C.OpeningSource>;
  readonly batches: readonly C.FinancialOpeningBatch[];
  readonly accounts: readonly {
    readonly countryId: string;
    readonly bankId: string;
    readonly cashAccountId: string;
    readonly equityAccountId: string;
    readonly amount: string;
    readonly currency: 'GCU';
  }[];
  readonly plan: PostwarGcuBankOpeningPlan;
}
/** Creates a new immutable opening family only. No append to an existing World
 * is possible here; persistence must independently reject an existing World. */
export function appendPostwarGcuBankOpening(input: {
  parentSeed: unknown;
  plan: PostwarGcuBankOpeningPlan;
}): PostwarGcuBankOpeningFamily {
  return buildFamily(requireSeed(input.parentSeed), input.plan);
}
// Private lexical path only: parent was SHA-verified above, or just constructed
// below with the real digest. No caller-controlled validation flag exists.
function buildFamily(
  parent: Readonly<C.OpeningSeed>,
  plan: PostwarGcuBankOpeningPlan,
): PostwarGcuBankOpeningFamily {
  if (!plans.has(plan)) invalid('genuine generated policy plan required');
  for (const s of parent.sources)
    if (s.sourceVersion === POSTWAR_GCU_OPENING_VERSION)
      invalid('endowment already present; no second issuance');
  const financial = parent.sources.filter(
    (s) =>
      s.sourceKind === 'AUTHORITATIVE_DATASET' &&
      s.locator === 'incoming/financial/adoption.json' &&
      JSON.parse(s.canonicalPayload)?.schemaVersion ===
        'adopted-financial-opening-source-v2',
  );
  if (financial.length !== 1)
    invalid('exact original financial source required');
  const assembly = row(
    row(JSON.parse(financial[0]!.canonicalPayload)).assembly,
  );
  if (assembly.worldId !== parent.worldId || assembly.seedId !== parent.seedId)
    invalid('financial source scope mismatch');
  const roster = list(assembly.countries).map((raw) => row(raw));
  if (roster.length !== 70)
    invalid('complete original financial roster required');
  const scope = sha(
    `${parent.worldId}\n${parent.seedId}\n${POSTWAR_GCU_OPENING_VERSION}`,
  )
    .slice(0, 32)
    .toUpperCase();
  const sourceId = C.openingSourceId(`SOURCE_GCU_BANK_${scope}`);
  const accounts = plan.countries.map((c) => {
    const matches = roster.filter((r) => r.countryId === c.countryId);
    if (matches.length !== 1)
      invalid('unique actual financial country required');
    const bankId = text(row(matches[0]!.roster).bank);
    const cashAccountId = `ACCOUNT_GCU_CASH_${sha(`${scope}\n${c.countryId}`).slice(0, 32).toUpperCase()}`;
    const equityAccountId = `ACCOUNT_GCU_EQUITY_${sha(`${scope}\n${c.countryId}`).slice(0, 32).toUpperCase()}`;
    if (
      !parent.financialBatches.some((b) =>
        b.legs.some(
          (l) =>
            l.account.ownerId === bankId && l.account.countryId === c.countryId,
        ),
      )
    )
      invalid('bank absent from original financial accounts');
    return {
      countryId: c.countryId,
      bankId,
      cashAccountId,
      equityAccountId,
      amount: c.openingGcu,
      currency: 'GCU' as const,
    };
  });
  if (new Set(accounts.map((a) => a.bankId)).size !== 70)
    invalid('bank roster must be unique');
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'config/postwar-genesis/gcu-bank-opening.v1.json',
      sourceVersion: POSTWAR_GCU_OPENING_VERSION,
      payload: {
        schemaVersion: 'postwar-gcu-bank-opening-source-v1',
        worldId: parent.worldId,
        seedId: parent.seedId,
        parentSeedFingerprint: parent.fingerprint,
        originalFinancialSourceId: financial[0]!.sourceId,
        originalFinancialSourcePayloadHash: financial[0]!.payloadHash,
        plan: plan,
        accounts,
        accounting: 'NEW_GCU_CASH_ASSET_AND_EQUAL_INITIAL_EQUITY',
        productionAdmission: false,
      },
    },
    sha,
  );
  const batches: C.FinancialOpeningBatch[] = accounts.map((a) => {
    const id = sha(`${scope}\n${a.countryId}`).slice(0, 32).toUpperCase(),
      debitId = C.financialOpeningLegId(`GCU_DEBIT_${id}`),
      creditId = C.financialOpeningLegId(`GCU_CREDIT_${id}`);
    const account = (accountId: string, accountClass: 'CASH' | 'EQUITY') =>
      C.createFinancialAccount({
        worldId: parent.worldId,
        countryId: C.countryId(a.countryId),
        ownerId: C.legalEntityId(a.bankId),
        accountId: C.financialAccountId(accountId),
        accountClass,
        currency: 'GCU',
        claimId: null,
        counterpartyEntityId: null,
      });
    return {
      batchId: C.financialOpeningBatchId(`BATCH_GCU_BANK_${id}`),
      sourceId,
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: debitId,
          account: account(a.cashAccountId, 'CASH'),
          direction: 'DEBIT',
          amount: C.Money.from(a.amount, 'GCU'),
          counterpartLegId: creditId,
        },
        {
          legId: creditId,
          account: account(a.equityAccountId, 'EQUITY'),
          direction: 'CREDIT',
          amount: C.Money.from(a.amount, 'GCU'),
          counterpartLegId: debitId,
        },
      ],
    };
  });
  const seed = C.createOpeningSeed(
    {
      ...parent,
      sources: [...parent.sources, source],
      financialBatches: [...parent.financialBatches, ...batches],
    },
    sha,
  );
  return freeze({
    schemaVersion: 'postwar-gcu-bank-opening-family-v1' as const,
    parentSeed: parent,
    seed,
    source,
    batches,
    accounts,
    plan: plan,
  });
}

/** Re-derive from sole seed bytes: no caller amounts, bank aliases, ready flag,
 * signature or cached authority. Original parent must reconstruct byte-for-byte. */
export function verifyPostwarGcuBankOpeningSeed(
  input: unknown,
): PostwarGcuBankOpeningFamily {
  return verifyValidatedSeed(requireSeed(input));
}
function verifyValidatedSeed(
  seed: Readonly<C.OpeningSeed>,
): PostwarGcuBankOpeningFamily {
  const sources = seed.sources.filter(
    (s) => s.sourceVersion === POSTWAR_GCU_OPENING_VERSION,
  );
  if (sources.length !== 1) invalid('one GCU policy source required');
  const source = sources[0]!,
    payload = row(JSON.parse(source.canonicalPayload));
  if (
    payload.schemaVersion !== 'postwar-gcu-bank-opening-source-v1' ||
    payload.worldId !== seed.worldId ||
    payload.seedId !== seed.seedId
  )
    invalid('GCU source scope mismatch');
  const plan = derivePostwarGcuBankOpening(
    row(payload.plan).inputs as unknown as PostwarGcuOpeningInputs,
  );
  same(
    plan,
    payload.plan,
    'source policy plan differs from complete re-derivation',
  );
  const parent = C.createOpeningSeed(
    {
      ...seed,
      sources: seed.sources.filter((s) => s.sourceId !== source.sourceId),
      financialBatches: seed.financialBatches.filter(
        (b) => b.sourceId !== source.sourceId,
      ),
    },
    sha,
  );
  if (parent.fingerprint !== payload.parentSeedFingerprint)
    invalid('original parent changed');
  const expected = buildFamily(parent, plan);
  // Both fingerprints were computed/checked with the actual SHA-256. Comparing
  // them avoids allocating two additional 120+MiB canonical strings at once.
  if (expected.seed.fingerprint !== seed.fingerprint)
    invalid('GCU source/accounts/batches differ from deterministic issuance');
  return expected;
}

/** Null means the legacy family; a recognized malformed GCU source throws. */
export function readPostwarGcuBankOpeningFromSeed(
  input: unknown,
): PostwarGcuBankOpeningFamily | null {
  const seed = requireSeed(input);
  return hasPostwarGcuBankOpeningCandidate(seed)
    ? verifyValidatedSeed(seed)
    : null;
}

/** Cheap discriminator only, never a source/seed validation or authority proof.
 * An existing SHA-validated legacy consumer can avoid a second full-seed hash.
 * Every positive candidate must still pass the strict reader above. */
export function hasPostwarGcuBankOpeningCandidate(
  seed: Readonly<C.OpeningSeed>,
): boolean {
  return seed.sources.some(
    (s) =>
      s.sourceVersion === POSTWAR_GCU_OPENING_VERSION ||
      s.canonicalPayload.includes(
        '"schemaVersion":"postwar-gcu-bank-opening-source-v1"',
      ),
  );
}
