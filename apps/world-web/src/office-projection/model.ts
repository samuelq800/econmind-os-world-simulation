import type { ProjectionResult } from '../production-read/client.js';
import {
  parseAuthority,
  row,
  version,
  type ProductionReadConfig,
} from '../production-read/contract.js';

export const officeProjectionRoles = {
  captain: 'CAPTAIN',
  finance: 'FINANCE',
  central_bank: 'CENTRAL_BANK',
  industry: 'INDUSTRY',
  trade: 'TRADE',
  social: 'SOCIAL',
} as const;
export type OfficeRole = keyof typeof officeProjectionRoles;
export interface OfficeProjectionView {
  /** Display key supplied by the host, not an inferred server country ID. */
  readonly countryDisplayId: string;
  readonly role: OfficeRole;
}
export const roleProjectionGaps = {
  captain: ['National priorities', 'Cabinet approvals', 'Political capital'],
  finance: [
    'Available treasury balance',
    'Budget commitments',
    'Debt maturity',
  ],
  central_bank: ['Policy rate', 'Eligible collateral', 'Bank liquidity'],
  industry: ['Operating capacity', 'Power dispatch', 'Construction progress'],
  trade: ['Shipment arrival', 'Supplier quote', 'Trade contract terms'],
  social: ['Employment matching', 'Training places', 'Healthcare capacity'],
} as const;
export interface OfficeReadout {
  readonly key: string;
  readonly label: string;
  readonly canonicalValue: string;
  readonly unit: string;
  readonly nature: 'ACTIVITY_COUNT' | 'NET_POSTING_MOVEMENT';
}
/** UI availability, not a membership or disclosure grant. The server must
 * already have filtered accounts using admitted owners before publication. */
export interface EconomicAvailability {
  readonly financial: 'AVAILABLE' | 'NOT_AUTHORIZED' | 'UNAVAILABLE';
  readonly inventory: 'NOT_AUTHORIZED' | 'UNAVAILABLE';
  readonly countrySummary: 'NOT_AUTHORIZED' | 'UNAVAILABLE';
}
export function consumeEconomicAvailability(
  value: unknown,
  identity: Readonly<{ classification: string; officeId: string }>,
): EconomicAvailability {
  const visibility = row(value);
  if (
    visibility?.schemaVersion !== 'economic-read-visibility-v1' ||
    (visibility.financialDetail !== 'AUTHORIZED_FILTERED' &&
      visibility.financialDetail !== 'NOT_AUTHORIZED') ||
    visibility.inventoryDetail !== 'NOT_AUTHORIZED' ||
    visibility.countrySummary !== 'NOT_AUTHORIZED'
  )
    return Object.freeze({
      financial: 'UNAVAILABLE',
      inventory: 'UNAVAILABLE',
      countrySummary: 'UNAVAILABLE',
    });
  return Object.freeze({
    financial:
      visibility.financialDetail === 'AUTHORIZED_FILTERED' &&
      identity.classification === 'OFFICE_PRIVATE' &&
      ['FINANCE', 'CENTRAL_BANK'].includes(identity.officeId)
        ? 'AVAILABLE'
        : 'NOT_AUTHORIZED',
    inventory: 'NOT_AUTHORIZED',
    countrySummary: 'NOT_AUTHORIZED',
  });
}
export function economicAvailabilityMessages(
  availability: EconomicAvailability,
): readonly string[] {
  return [
    ['Financial movements', availability.financial],
    ['Inventory movements', availability.inventory],
    ['Country economic summary', availability.countrySummary],
  ].map(
    ([label, status]) =>
      `${label} · ${status === 'AVAILABLE' ? 'Authorized, server-filtered' : status === 'UNAVAILABLE' ? 'Unavailable · ECONOMIC_VISIBILITY_UNAVAILABLE' : 'NOT_AUTHORIZED'}`,
  );
}
export interface OfficeProjectionModel {
  readonly kind: 'CURRENT';
  readonly role: OfficeRole;
  readonly source: 'DERIVED_SERVER_PROJECTION';
  readonly head: {
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: string;
    readonly classification: string;
    readonly worldVersion: string;
    readonly eventSequence: string;
    readonly snapshotRef: string;
    readonly readbackRef: string;
    readonly seedRef: string;
    readonly admissionRef: string;
    readonly contentHash: string;
    readonly seatRef: string;
    readonly authorizationRevision: string;
    readonly modelVersion: string;
    readonly projectionVersion: string;
  };
  readonly readouts: readonly OfficeReadout[];
  readonly economicAvailability: EconomicAvailability;
  readonly missing: readonly {
    readonly field: string;
    readonly code: 'ROLE_FIELD_NOT_PROJECTED';
  }[];
}
export type OfficeProjectionMissing = {
  readonly kind: 'MISSING';
  readonly code:
    'PROJECTION_UNAVAILABLE' | 'INVALID_ACTIVITY_DTO' | 'IDENTITY_MISMATCH';
};
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const decimal = (v: unknown): v is string =>
  text(v) && /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v) && v !== '-0';

/** Browser mirror of existing world-activity-projection-v1, NOT a new API DTO.
 * Values stay exact strings. Positions are net Posting movements, never opening
 * balances, spendable cash, production levels or local settlement estimates. */
export function consumeOfficeProjection(
  result: ProjectionResult,
  config: ProductionReadConfig,
  role: OfficeRole,
): OfficeProjectionModel | OfficeProjectionMissing {
  const missing = (
    code: OfficeProjectionMissing['code'],
  ): OfficeProjectionMissing => ({ kind: 'MISSING', code });
  if (result.status !== 'PROJECTION') return missing('PROJECTION_UNAVAILABLE');
  const authority = parseAuthority(result.authority, config);
  if (
    !authority ||
    officeProjectionRoles[role] !== config.identity.officeId ||
    result.source !== 'DERIVED_SERVER_PROJECTION' ||
    result.worldVersion !== authority.readback.worldVersion ||
    result.snapshotRef !==
      `projection:${authority.readback.worldVersion}:${authority.readback.eventSequence}`
  )
    return missing('IDENTITY_MISMATCH');
  const payload = row(result.payload),
    activity = row(payload?.activity),
    ledger = row(payload?.ledger);
  if (
    payload?.countryId !== config.identity.countryId ||
    (config.identity.classification === 'OFFICE_PRIVATE' &&
      payload.officeId !== config.identity.officeId) ||
    (payload?.officeId !== undefined &&
      payload.officeId !== config.identity.officeId)
  )
    return missing('IDENTITY_MISMATCH');
  if (
    payload.schemaVersion !== 'world-activity-projection-v1' ||
    !activity ||
    !ledger ||
    !version(activity.authoritativeEventCount) ||
    !version(activity.lastAuthoritativeEventSequence) ||
    !version(activity.lastAuthoritativeEventWorldVersion) ||
    BigInt(activity.lastAuthoritativeEventSequence) >
      BigInt(authority.readback.eventSequence) ||
    BigInt(activity.lastAuthoritativeEventWorldVersion) >
      BigInt(result.worldVersion) ||
    !Array.isArray(ledger.financialPositions) ||
    !Array.isArray(ledger.inventoryPositions) ||
    ledger.financialPositions.length + ledger.inventoryPositions.length > 2000
  )
    return missing('INVALID_ACTIVITY_DTO');
  const readouts: OfficeReadout[] = [
    {
      key: 'activity',
      label: 'Recorded authoritative events',
      canonicalValue: activity.authoritativeEventCount,
      unit: 'events',
      nature: 'ACTIVITY_COUNT',
    },
  ];
  const economicAvailability = consumeEconomicAvailability(
    ledger.visibility,
    config.identity,
  );
  const keys = new Set<string>();
  for (const value of ledger.financialPositions) {
    const p = row(value);
    if (
      !p ||
      !text(p.accountId) ||
      !text(p.accountClass) ||
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(p.accountClass) ||
      !text(p.currency) ||
      !decimal(p.netDebitBalance)
    )
      return missing('INVALID_ACTIVITY_DTO');
    const key = JSON.stringify(['financial', p.accountId, p.currency]);
    if (keys.has(key)) return missing('INVALID_ACTIVITY_DTO');
    keys.add(key);
    if (economicAvailability.financial === 'AVAILABLE')
      readouts.push({
        key,
        label: `${p.accountId} / ${p.accountClass} · net debit movement`,
        canonicalValue: p.netDebitBalance,
        unit: p.currency,
        nature: 'NET_POSTING_MOVEMENT',
      });
  }
  for (const value of ledger.inventoryPositions) {
    const p = row(value);
    if (
      !p ||
      !text(p.commodityId) ||
      !text(p.unit) ||
      !['AVAILABLE', 'RESERVED', 'IN_TRANSIT'].includes(String(p.bucket)) ||
      !decimal(p.quantity)
    )
      return missing('INVALID_ACTIVITY_DTO');
    const key = JSON.stringify(['inventory', p.commodityId, p.unit, p.bucket]);
    if (keys.has(key)) return missing('INVALID_ACTIVITY_DTO');
    keys.add(key);
    // The fixed carrier has no authorized inventory detail. Validate shape but
    // never expose, aggregate or reinterpret withheld / legacy raw positions.
  }
  return {
    kind: 'CURRENT',
    role,
    source: result.source,
    head: {
      worldId: config.identity.worldId,
      countryId: config.identity.countryId,
      officeId: config.identity.officeId,
      classification: config.identity.classification,
      worldVersion: result.worldVersion,
      eventSequence: authority.readback.eventSequence,
      snapshotRef: result.snapshotRef,
      readbackRef: authority.readback.readbackRef,
      seedRef: authority.seed.seedRef,
      admissionRef: authority.seed.admissionRef,
      contentHash: authority.seed.contentHash,
      seatRef: authority.seatRef,
      authorizationRevision: config.identity.authorizationRevision,
      modelVersion: config.identity.modelVersion,
      projectionVersion: config.identity.projectionVersion,
    },
    readouts,
    economicAvailability,
    missing: roleProjectionGaps[role].map((field) => ({
      field,
      code: 'ROLE_FIELD_NOT_PROJECTED',
    })),
  };
}
