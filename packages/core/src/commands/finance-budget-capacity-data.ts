/** A small, parsed Budget-only input. This never issues financial-ledger,
 * admission or commit authority. The fixed server custody guard must obtain
 * these bytes from the sealed canonical-source projection and recheck them
 * through atomic commit; a caller can parse data but cannot authorize it. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  createFinancialAccount,
  type FinancialAccount,
} from '../finance/financial-ledger.js';
import { Money } from '../numeric/money.js';
import {
  worldId,
  countryId,
  financialAccountId,
  legalEntityId,
  financialClaimId,
} from '../ids.js';
export const FINANCE_BUDGET_CAPACITY_SCHEMA =
  'finance-budget-capacity-source-v1' as const;
export interface FinanceBudgetCapacityProjection {
  readonly schemaVersion: typeof FINANCE_BUDGET_CAPACITY_SCHEMA;
  readonly worldId: string;
  readonly countryId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly modelVersion: string;
  readonly openingWorldVersion: '0';
  readonly governmentEntityId: string;
  readonly centralBankEntityId: string;
  readonly financialSourceId: string;
  readonly canonicalSeedSha256: string;
  readonly financialOriginalsSha256: string;
  readonly treasury: {
    readonly assetAccount: Readonly<FinancialAccount>;
    readonly liabilityAccount: Readonly<FinancialAccount>;
    readonly assetLegId: string;
    readonly liabilityLegId: string;
    readonly assetAmount: string;
    readonly liabilityAmount: string;
  };
  readonly openingFunding: {
    readonly totalAmount: string;
    readonly recordCount: string;
    readonly recordsSha256: string;
  };
}
declare const capacityData: unique symbol;
export interface FinanceBudgetCapacityData {
  readonly [capacityData]: true;
}
const parsed = new WeakMap<
  FinanceBudgetCapacityData,
  Readonly<FinanceBudgetCapacityProjection>
>();
function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Exact Budget capacity DATA_ONLY source required; no financial authority is issued',
  );
}
function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(v, k))
  )
    invalid();
  return v as Record<string, unknown>;
}
const text = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.trim() !== v || v.length > 256)
    invalid();
  return v;
};
const hash = (v: unknown): string => {
  const s = text(v);
  if (!/^sha256:[a-f0-9]{64}$/u.test(s)) invalid();
  return s;
};
function account(v: unknown): Readonly<FinancialAccount> {
  const a = object(v, [
    'worldId',
    'countryId',
    'accountId',
    'ownerId',
    'accountClass',
    'currency',
    'claimId',
    'counterpartyEntityId',
  ]);
  if (a.accountClass !== 'ASSET' && a.accountClass !== 'LIABILITY') invalid();
  return createFinancialAccount({
    worldId: worldId(text(a.worldId)),
    countryId: countryId(text(a.countryId)),
    accountId: financialAccountId(text(a.accountId)),
    ownerId: legalEntityId(text(a.ownerId)),
    accountClass: a.accountClass,
    currency: text(a.currency),
    claimId: financialClaimId(text(a.claimId)),
    counterpartyEntityId: legalEntityId(text(a.counterpartyEntityId)),
  });
}
export function parseFinanceBudgetCapacityData(
  value: unknown,
): FinanceBudgetCapacityData {
  const p = object(value, [
    'schemaVersion',
    'worldId',
    'countryId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
    'modelVersion',
    'openingWorldVersion',
    'governmentEntityId',
    'centralBankEntityId',
    'financialSourceId',
    'canonicalSeedSha256',
    'financialOriginalsSha256',
    'treasury',
    'openingFunding',
  ]);
  if (
    p.schemaVersion !== FINANCE_BUDGET_CAPACITY_SCHEMA ||
    p.openingWorldVersion !== '0'
  )
    invalid();
  for (const key of [
    'worldId',
    'countryId',
    'seedId',
    'admissionRef',
    'modelVersion',
    'governmentEntityId',
    'centralBankEntityId',
    'financialSourceId',
  ])
    text(p[key]);
  for (const key of [
    'seedFingerprint',
    'canonicalSeedSha256',
    'financialOriginalsSha256',
  ])
    hash(p[key]);
  const t = object(p.treasury, [
      'assetAccount',
      'liabilityAccount',
      'assetLegId',
      'liabilityLegId',
      'assetAmount',
      'liabilityAmount',
    ]),
    f = object(p.openingFunding, [
      'totalAmount',
      'recordCount',
      'recordsSha256',
    ]);
  const asset = account(t.assetAccount),
    liability = account(t.liabilityAccount),
    amount = Money.from(text(t.assetAmount), asset.currency),
    mirror = Money.from(text(t.liabilityAmount), liability.currency),
    funding = Money.from(text(f.totalAmount), asset.currency);
  if (
    asset.worldId !== p.worldId ||
    liability.worldId !== p.worldId ||
    asset.countryId !== p.countryId ||
    liability.countryId !== p.countryId ||
    asset.accountClass !== 'ASSET' ||
    liability.accountClass !== 'LIABILITY' ||
    asset.accountId === liability.accountId ||
    asset.ownerId !== p.governmentEntityId ||
    liability.ownerId !== p.centralBankEntityId ||
    asset.counterpartyEntityId !== liability.ownerId ||
    liability.counterpartyEntityId !== asset.ownerId ||
    asset.claimId !== liability.claimId ||
    asset.currency !== liability.currency ||
    !amount.amount.equals(mirror.amount) ||
    amount.amount.isNegative() ||
    funding.amount.isNegative() ||
    funding.amount.greaterThan(amount.amount) ||
    amount.toCanonicalValue().amount !== t.assetAmount ||
    mirror.toCanonicalValue().amount !== t.liabilityAmount ||
    funding.toCanonicalValue().amount !== f.totalAmount ||
    text(t.assetLegId) === text(t.liabilityLegId) ||
    !/^(?:0|[1-9]\d*)$/u.test(text(f.recordCount))
  )
    invalid();
  hash(f.recordsSha256);
  const result: FinanceBudgetCapacityProjection = {
    schemaVersion: FINANCE_BUDGET_CAPACITY_SCHEMA,
    worldId: text(p.worldId),
    countryId: text(p.countryId),
    seedId: text(p.seedId),
    seedFingerprint: text(p.seedFingerprint),
    admissionRef: text(p.admissionRef),
    modelVersion: text(p.modelVersion),
    openingWorldVersion: '0',
    governmentEntityId: text(p.governmentEntityId),
    centralBankEntityId: text(p.centralBankEntityId),
    financialSourceId: text(p.financialSourceId),
    canonicalSeedSha256: text(p.canonicalSeedSha256),
    financialOriginalsSha256: text(p.financialOriginalsSha256),
    treasury: Object.freeze({
      assetAccount: asset,
      liabilityAccount: liability,
      assetLegId: text(t.assetLegId),
      liabilityLegId: text(t.liabilityLegId),
      assetAmount: amount.toCanonicalValue().amount,
      liabilityAmount: mirror.toCanonicalValue().amount,
    }),
    openingFunding: Object.freeze({
      totalAmount: funding.toCanonicalValue().amount,
      recordCount: text(f.recordCount),
      recordsSha256: text(f.recordsSha256),
    }),
  };
  const token = Object.freeze({}) as FinanceBudgetCapacityData;
  parsed.set(token, Object.freeze(result));
  return token;
}
export function readFinanceBudgetCapacityData(
  value: FinanceBudgetCapacityData,
): Readonly<FinanceBudgetCapacityProjection> {
  const p = parsed.get(value);
  if (!p) invalid();
  return p;
}
