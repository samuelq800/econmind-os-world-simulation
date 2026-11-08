/** Browser-safe planning DATA. A current row grants no OP mandate, reservation,
 * performed work, payment, delivery or permission to commit. */
import {
  MANUAL_INDUSTRY_UTILITY_COMMANDS,
  isManualIndustryUtilityPayload,
} from '../commands/authenticated-office-command-contract.js';
export const INDUSTRY_UTILITY_PLANNING_DATASET =
  'industry-utility-planning' as const;
export const INDUSTRY_UTILITY_PLANNING_NATURE =
  'ADMITTED_CURRENT_INDUSTRY_UTILITY_PLANNING' as const;
export const INDUSTRY_UTILITY_PLANNING_ROW_SCHEMA =
  'postwar-industry-utility-planning-row-v1' as const;
export const INDUSTRY_UTILITY_PLANNING_MEASUREMENT =
  'PLANNING_DATA_NOT_AUTHORITY' as const;
export interface IndustryUtilityCapacityFact {
  readonly name: string;
  readonly value: string;
  readonly unit: string;
}
interface Common {
  readonly schemaVersion: typeof INDUSTRY_UTILITY_PLANNING_ROW_SCHEMA;
  readonly planningRef: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly locationId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly runStartsAtSimTime: string;
  readonly runEndsAtSimTime: string;
  readonly measurement: typeof INDUSTRY_UTILITY_PLANNING_MEASUREMENT;
}
export type IndustryUtilityPlanningRow = Common &
  (
    | Readonly<{
        serviceKind: 'POWER';
        action: 'BOOK';
        parameters: Readonly<{
          purpose: 'INDUSTRY_SELF_USE' | 'PROCESS_WATER_PUMPING_SELF_USE';
          quantityUnit: 'MWh';
          capacityFacts: readonly IndustryUtilityCapacityFact[];
        }>;
      }>
    | Readonly<{
        serviceKind: 'LOGISTICS';
        action: 'BOOK';
        parameters: Readonly<{
          quantityUnit: string;
          fromLocationId: string;
          toLocationId: string;
          materialRef: string;
          titleHolderId: string;
          riskBearerId: string;
          capacityFacts: readonly IndustryUtilityCapacityFact[];
        }>;
      }>
    | Readonly<{
        serviceKind: 'POWER';
        action: 'DELIVER';
        parameters: Readonly<{ operation: Readonly<Record<string, unknown>> }>;
      }>
    | Readonly<{
        serviceKind: 'WATER';
        action: 'DELIVER';
        parameters: Readonly<{ operation: Readonly<Record<string, unknown>> }>;
      }>
    | Readonly<{
        serviceKind: 'LOGISTICS';
        action: 'SHIP' | 'SERVICE_WORK' | 'PAY_INPUTS' | 'DELIVER';
        parameters: Readonly<{ operation: Readonly<Record<string, unknown>> }>;
      }>
  );
export interface IndustryUtilityPlanningCoverage {
  readonly schemaVersion: 'postwar-industry-utility-planning-coverage-v1';
  readonly reducerVersion: 'POSTWAR_INDUSTRY_UTILITY_PLANNING_COMPLETE_PREFIX_V1';
  readonly countryId: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly prefixFingerprint: string;
  readonly pageChainFingerprint: string;
  readonly sourceOriginalsFingerprint: string;
  readonly planningRowsFingerprint: string;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('INDUSTRY_UTILITY_PLANNING:OBJECT_REQUIRED');
  return v as Record<string, unknown>;
};
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const ref = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(v);
const text = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const integer = (v: unknown) =>
  typeof v === 'string' &&
  /^(0|[1-9][0-9]*)$/u.test(v) &&
  BigInt(v) <= 9223372036854775807n;
const raw = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const fp = (v: unknown) =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
function fail(): never {
  throw Error('INDUSTRY_UTILITY_PLANNING:EXACT_SOURCE_BOUND_DATA_REQUIRED');
}
function capacity(input: unknown): void {
  if (!Array.isArray(input) || input.length === 0 || input.length > 32) fail();
  const names = new Set<string>();
  for (const value of input) {
    const v = object(value);
    if (
      !exact(v, ['name', 'value', 'unit']) ||
      ![v.name, v.value, v.unit].every(text) ||
      names.has(String(v.name))
    )
      fail();
    names.add(String(v.name));
  }
}
export function parseIndustryUtilityPlanningRow(
  input: unknown,
): Readonly<IndustryUtilityPlanningRow> {
  const r = object(input),
    p = object(r.parameters);
  if (
    !exact(r, [
      'schemaVersion',
      'planningRef',
      'countryId',
      'facilityId',
      'locationId',
      'operatorId',
      'runId',
      'sourceRef',
      'sourceRawSha256',
      'runStartsAtSimTime',
      'runEndsAtSimTime',
      'serviceKind',
      'action',
      'parameters',
      'measurement',
    ]) ||
    r.schemaVersion !== INDUSTRY_UTILITY_PLANNING_ROW_SCHEMA ||
    r.measurement !== INDUSTRY_UTILITY_PLANNING_MEASUREMENT ||
    ![
      r.planningRef,
      r.countryId,
      r.facilityId,
      r.locationId,
      r.operatorId,
      r.runId,
      r.sourceRef,
    ].every(ref) ||
    !raw(r.sourceRawSha256) ||
    !integer(r.runStartsAtSimTime) ||
    !integer(r.runEndsAtSimTime) ||
    BigInt(String(r.runStartsAtSimTime)) >=
      BigInt(String(r.runEndsAtSimTime)) ||
    BigInt(String(r.runEndsAtSimTime)) > 86400000n
  )
    fail();
  if (r.serviceKind === 'POWER' && r.action === 'BOOK') {
    if (
      !exact(p, ['purpose', 'quantityUnit', 'capacityFacts']) ||
      !['INDUSTRY_SELF_USE', 'PROCESS_WATER_PUMPING_SELF_USE'].includes(
        String(p.purpose),
      ) ||
      p.quantityUnit !== 'MWh'
    )
      fail();
    capacity(p.capacityFacts);
  } else if (r.serviceKind === 'LOGISTICS' && r.action === 'BOOK') {
    if (
      !exact(p, [
        'quantityUnit',
        'fromLocationId',
        'toLocationId',
        'materialRef',
        'titleHolderId',
        'riskBearerId',
        'capacityFacts',
      ]) ||
      !text(p.quantityUnit) ||
      ![
        p.fromLocationId,
        p.toLocationId,
        p.materialRef,
        p.titleHolderId,
        p.riskBearerId,
      ].every(ref) ||
      p.fromLocationId === p.toLocationId
    )
      fail();
    capacity(p.capacityFacts);
  } else {
    if (!exact(p, ['operation'])) fail();
    const op = object(p.operation);
    if (
      op.action !== r.action ||
      !(
        r.serviceKind === 'POWER' ||
        r.serviceKind === 'WATER' ||
        r.serviceKind === 'LOGISTICS'
      ) ||
      !isManualIndustryUtilityPayload(
        MANUAL_INDUSTRY_UTILITY_COMMANDS[r.serviceKind],
        {
          schemaVersion: 'industry-first-day-utility-command-v1',
          serviceKind: r.serviceKind,
          operationRef: r.planningRef,
          facilityId: r.facilityId,
          runId: r.runId,
          sourceRef: r.sourceRef,
          sourceRawSha256: r.sourceRawSha256,
          operation: op,
        },
      )
    )
      fail();
    if (r.serviceKind === 'LOGISTICS') {
      if (!ref(op.transferId)) fail();
      if (
        r.action === 'SERVICE_WORK' &&
        (!ref(op.workOrderRef) || !raw(op.workOrderSha256))
      )
        fail();
      if (
        r.action === 'PAY_INPUTS' &&
        (!ref(op.expenseOrderRef) ||
          !raw(op.expenseOrderSha256) ||
          !fp(op.workEventFingerprint))
      )
        fail();
    } else if (r.serviceKind === 'POWER') {
      if (
        r.action !== 'DELIVER' ||
        !ref(op.bookingRef) ||
        !fp(op.workEventFingerprint) ||
        !fp(op.paymentEventFingerprint)
      )
        fail();
    } else if (
      r.action !== 'DELIVER' ||
      !fp(op.workEventFingerprint) ||
      !fp(op.paymentEventFingerprint) ||
      !Array.isArray(op.powerEventFingerprints) ||
      op.powerEventFingerprints.length === 0 ||
      op.powerEventFingerprints.length > 64 ||
      !op.powerEventFingerprints.every(fp) ||
      new Set(op.powerEventFingerprints).size !==
        op.powerEventFingerprints.length ||
      !Array.isArray(op.additionalProtectedClaims) ||
      op.additionalProtectedClaims.length > 256
    )
      fail();
  }
  return frozen(
    JSON.parse(JSON.stringify(r)),
  ) as Readonly<IndustryUtilityPlanningRow>;
}
export function parseIndustryUtilityPlanningCoverage(
  input: unknown,
): Readonly<IndustryUtilityPlanningCoverage> {
  const c = object(input);
  if (
    !exact(c, [
      'schemaVersion',
      'reducerVersion',
      'countryId',
      'globalWorldVersion',
      'globalEventSequence',
      'prefixFingerprint',
      'pageChainFingerprint',
      'sourceOriginalsFingerprint',
      'planningRowsFingerprint',
    ]) ||
    c.schemaVersion !== 'postwar-industry-utility-planning-coverage-v1' ||
    c.reducerVersion !==
      'POSTWAR_INDUSTRY_UTILITY_PLANNING_COMPLETE_PREFIX_V1' ||
    !ref(c.countryId) ||
    !integer(c.globalWorldVersion) ||
    !integer(c.globalEventSequence) ||
    ![
      c.prefixFingerprint,
      c.pageChainFingerprint,
      c.sourceOriginalsFingerprint,
      c.planningRowsFingerprint,
    ].every(fp)
  )
    fail();
  return Object.freeze({
    ...c,
  }) as unknown as Readonly<IndustryUtilityPlanningCoverage>;
}
