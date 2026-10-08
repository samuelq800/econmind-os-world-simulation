import type { ProjectionResult } from '../production-read/client.js';
import {
  consumeDecisionResult,
  type DecisionResultView,
} from './decision-result.js';
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
  readonly nature:
    'ACTIVITY_COUNT' | 'NET_POSTING_MOVEMENT' | 'CURRENT_LEDGER_POSITION';
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
  readonly currentFinancialPosition: CurrentFinancialPositionView;
  readonly decisionResult: DecisionResultView;
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

/** Presentation only, not a copied server DTO or a disclosure grant. */
export interface CurrentFinancialPositionView {
  readonly availability: 'AVAILABLE' | 'NOT_AUTHORIZED' | 'UNAVAILABLE';
  readonly fields: readonly OfficeReadout[];
  readonly provenance: readonly Readonly<{ label: string; value: string }>[];
}
const exact = (v: Record<string, unknown> | null, keys: readonly string[]) =>
  !!v &&
  Object.keys(v).length === keys.length &&
  keys.every((key) => Object.hasOwn(v, key));
const canonicalId = (v: unknown): v is string =>
  text(v) && /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v);

function consumeCurrentFinancialPosition(
  value: unknown,
  availability: EconomicAvailability,
  pins: Readonly<{
    worldVersion: string;
    eventSequence: string;
    seedRef: string;
    contentHash: string;
    officeId: string;
  }>,
): CurrentFinancialPositionView {
  const absent = (
    status: 'NOT_AUTHORIZED' | 'UNAVAILABLE',
  ): CurrentFinancialPositionView =>
    Object.freeze({
      availability: status,
      fields: Object.freeze([]),
      provenance: Object.freeze([]),
    });
  const p = row(value);
  if (p?.schemaVersion !== 'authoritative-financial-position-v1')
    return absent('UNAVAILABLE');
  if (p.status === 'NOT_AUTHORIZED')
    return exact(p, ['schemaVersion', 'status', 'reason']) &&
      [
        'ADMITTED_SOURCE_UNAVAILABLE',
        'OWNER_MAPPING_UNAVAILABLE',
        'SCOPE_NOT_AUTHORIZED',
        'SUMMARY_SOURCE_UNAVAILABLE',
      ].includes(String(p.reason))
      ? absent('NOT_AUTHORIZED')
      : absent('UNAVAILABLE');
  if (availability.financial !== 'AVAILABLE') return absent('NOT_AUTHORIZED');
  const head = row(p.sourceHead),
    opening = row(p.opening);
  const units =
    pins.officeId === 'FINANCE'
      ? ['CONSTITUTION-U0381', 'CONSTITUTION-U0382', 'FINANCE-U0831']
      : [
          'CONSTITUTION-U0381',
          'CONSTITUTION-U0382',
          'CENTRAL_BANK-U0585',
          'CENTRAL_BANK-U0586',
        ];
  if (
    !exact(p, [
      'schemaVersion',
      'status',
      'semantics',
      'positionCoverage',
      'sourceHead',
      'opening',
      'sourceUnits',
      'positions',
    ]) ||
    p.status !== 'AUTHORIZED_FILTERED' ||
    p.semantics !== 'OPENING_PLUS_POSTING_LINEAGE' ||
    p.positionCoverage !== 'NONZERO_LEDGER_POSITIONS' ||
    !exact(head, ['worldVersion', 'eventSequence']) ||
    head?.worldVersion !== pins.worldVersion ||
    head?.eventSequence !== pins.eventSequence ||
    !exact(opening, ['seedId', 'seedFingerprint', 'openingWorldVersion']) ||
    !canonicalId(opening?.seedId) ||
    opening.seedId !== pins.seedRef ||
    opening.seedFingerprint !== pins.contentHash ||
    !version(opening.openingWorldVersion) ||
    BigInt(opening.openingWorldVersion) > BigInt(pins.worldVersion) ||
    !Array.isArray(p.sourceUnits) ||
    p.sourceUnits.length > units.length ||
    new Set(p.sourceUnits).size !== p.sourceUnits.length ||
    p.sourceUnits.some(
      (unit) => typeof unit !== 'string' || !units.includes(unit),
    ) ||
    !Array.isArray(p.positions) ||
    p.positions.length > 2000
  )
    return absent('UNAVAILABLE');
  const fields: OfficeReadout[] = [],
    keys = new Set<string>();
  for (const raw of p.positions) {
    const entry = row(raw);
    if (
      !exact(entry, [
        'accountId',
        'accountClass',
        'currency',
        'netDebitBalance',
      ]) ||
      !canonicalId(entry?.accountId) ||
      !text(entry.accountClass) ||
      ![
        'CASH',
        'DEPOSIT',
        'ASSET',
        'LIABILITY',
        'EQUITY',
        'REVENUE',
        'EXPENSE',
        'RECEIVABLE',
        'PAYABLE',
      ].includes(String(entry.accountClass)) ||
      !text(entry.currency) ||
      !/^[A-Z]{3}$/u.test(entry.currency) ||
      !decimal(entry.netDebitBalance) ||
      entry.netDebitBalance.replace(/[-.]/gu, '').length > 120 ||
      entry.netDebitBalance === '0'
    )
      return absent('UNAVAILABLE');
    const key = JSON.stringify(['current', entry.accountId, entry.currency]);
    if (keys.has(key)) return absent('UNAVAILABLE');
    keys.add(key);
    fields.push(
      Object.freeze({
        key,
        label: `${entry.accountId} / ${String(entry.accountClass)} · net debit position`,
        canonicalValue: entry.netDebitBalance,
        unit: entry.currency,
        nature: 'CURRENT_LEDGER_POSITION',
      }),
    );
  }
  const provenance = [
    {
      label: 'Source head',
      value: `World v${pins.worldVersion} / event ${pins.eventSequence}`,
    },
    { label: 'Opening seed', value: opening.seedId },
    { label: 'Opening fingerprint', value: pins.contentHash },
    { label: 'Opening version', value: opening.openingWorldVersion },
    {
      label: 'Source units',
      value: p.sourceUnits.join(' · ') || 'None supplied',
    },
    { label: 'Lineage', value: 'OPENING_PLUS_POSTING_LINEAGE' },
    { label: 'Coverage', value: 'NONZERO_LEDGER_POSITIONS' },
  ].map((item) => Object.freeze(item));
  return Object.freeze({
    availability: 'AVAILABLE',
    fields: Object.freeze(fields),
    provenance: Object.freeze(provenance),
  });
}

/** Browser mirror of existing world-activity-projection-v1, NOT a new API DTO.
 * Values stay exact strings. Legacy financialPositions remain net Posting
 * movements; the separate fixed carrier supplies opening-inclusive positions.
 * Neither represents spendable cash or a local settlement estimate. */
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
    Object.hasOwn(
      payload,
      config.identity.classification === 'COUNTRY'
        ? 'decisionResult'
        : 'decisionResults',
    ) ||
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
    decisionResult: consumeDecisionResult(
      payload[
        config.identity.classification === 'COUNTRY'
          ? 'decisionResults'
          : 'decisionResult'
      ],
      {
        worldId: config.identity.worldId,
        countryId: config.identity.countryId,
        officeId: config.identity.officeId,
        classification: config.identity.classification,
        worldVersion: result.worldVersion,
        eventSequence: authority.readback.eventSequence,
        financialDetail:
          economicAvailability.financial === 'AVAILABLE'
            ? 'AUTHORIZED_FILTERED'
            : 'NOT_AUTHORIZED',
        activity: {
          eventCount: activity.authoritativeEventCount,
          eventSequence: activity.lastAuthoritativeEventSequence,
          worldVersion: activity.lastAuthoritativeEventWorldVersion,
        },
      },
    ),
    currentFinancialPosition: consumeCurrentFinancialPosition(
      ledger.authoritativeFinancialPosition,
      economicAvailability,
      {
        worldVersion: result.worldVersion,
        eventSequence: authority.readback.eventSequence,
        seedRef: authority.seed.seedRef,
        contentHash: authority.seed.contentHash,
        officeId: config.identity.officeId,
      },
    ),
    missing: roleProjectionGaps[role].map((field) => ({
      field,
      code: 'ROLE_FIELD_NOT_PROJECTED',
    })),
  };
}
