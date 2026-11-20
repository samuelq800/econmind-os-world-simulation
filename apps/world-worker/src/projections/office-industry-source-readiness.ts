/** Read-only server diagnostic consumer. This module installs no source,
 * custody adapter, host, route, publication or command capability. */
import {
  canonicalSerialize,
  DOMAIN_ERROR_CODES,
  DomainError,
  type DecisionResultHead,
  type EconomicReadDenialReason,
  type EconomicReadScope,
  type IndustryProductionResultCauseBinding,
} from '@econmind/core';
import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../persistence/validated-canonical-lineage.js';
import {
  readIndustryProductionSourceFrom,
  type IndustryProductionSelectors,
} from './industry-production-source-port.js';
import {
  readIndustryProductionGoverningFrom,
  type IndustryGoverningCustodyPort,
  type IndustryProductionGoverningResult,
} from './industry-production-governing-source.js';
import { createHash } from 'node:crypto';

const PURPOSE = 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY';
const denials: readonly EconomicReadDenialReason[] = [
  'ADMITTED_SOURCE_UNAVAILABLE',
  'OWNER_MAPPING_UNAVAILABLE',
  'SCOPE_NOT_AUTHORIZED',
  'SUMMARY_SOURCE_UNAVAILABLE',
];
type Data = Record<string, unknown>;
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Industry readiness: ${reason}`,
  );
}
function record(value: unknown, keys: readonly string[]): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Closed result record required');
  const data = value as Data;
  if (
    Object.keys(data).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(data, key))
  )
    invalid('Result contract keys differ');
  return data;
}
const same = (left: unknown, right: unknown) =>
  canonicalSerialize(left) === canonicalSerialize(right);
const matched = (result: IndustryProductionGoverningResult) =>
  Object.freeze({ kind: 'CONTRACT_MATCHED_NOT_AUTHORITY' as const, result });

/** Contract matching is not source authentication. The runtime entry below
 * invokes this only after the existing genuine-view and custody consumers.
 * Exported separately so tests can prove both result states without minting a
 * fake production view or claiming that a native custody implementation exists. */
export function checkOfficeIndustrySourceResult(
  value: unknown,
  expected: Readonly<{
    head: DecisionResultHead;
    cause: IndustryProductionResultCauseBinding;
  }>,
): Readonly<{
  kind: 'CONTRACT_MATCHED_NOT_AUTHORITY';
  result: IndustryProductionGoverningResult;
}> {
  record(expected.head, ['worldId', 'worldVersion', 'eventSequence']);
  record(expected.cause, [
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
  ]);
  if (
    ![expected.head.worldVersion, expected.head.eventSequence].every(
      (version) => /^(?:0|[1-9]\d*)$/u.test(version),
    ) ||
    ![expected.cause.commandFingerprint, expected.cause.eventFingerprint].every(
      (hash) => /^sha256:[0-9a-f]{64}$/u.test(hash),
    )
  )
    invalid('Canonical expected head/cause required');
  // Canonical serialization rejects non-data values before field access.
  const owned: unknown = JSON.parse(canonicalSerialize(value));
  const result = record(owned, ['disclosure', 'resultSummary']);
  const disclosure = result.disclosure as Data;
  if (disclosure?.status === 'NOT_AUTHORIZED') {
    record(disclosure, ['status', 'reason']);
    if (!denials.includes(disclosure.reason as EconomicReadDenialReason))
      invalid('Unknown denial reason');
    const summary = record(result.resultSummary, ['status']);
    if (summary.status !== 'NOT_AUTHORIZED')
      invalid('Denied disclosure must withhold result');
    return matched(
      Object.freeze({
        disclosure: Object.freeze({
          status: 'NOT_AUTHORIZED',
          reason: disclosure.reason as EconomicReadDenialReason,
        }),
        resultSummary: Object.freeze({ status: 'NOT_AUTHORIZED' }),
      }),
    );
  }
  record(disclosure, ['status', 'sourceUnits']);
  if (
    disclosure.status !== 'AUTHORIZED' ||
    !Array.isArray(disclosure.sourceUnits) ||
    disclosure.sourceUnits.length === 0 ||
    disclosure.sourceUnits.some(
      (unit) => typeof unit !== 'string' || unit.length === 0,
    ) ||
    new Set(disclosure.sourceUnits).size !== disclosure.sourceUnits.length
  )
    invalid('Authorized result requires exact source-unit references');
  const summary = record(result.resultSummary, [
    'status',
    'purpose',
    'sourceHead',
    'causeBinding',
  ]);
  record(summary.sourceHead, ['worldId', 'worldVersion', 'eventSequence']);
  record(summary.causeBinding, [
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
  ]);
  if (
    summary.status !== 'AUTHORIZED_RESULT_ONLY' ||
    summary.purpose !== PURPOSE ||
    !same(summary.sourceHead, expected.head) ||
    !same(summary.causeBinding, expected.cause)
  )
    invalid('Result scope/head/cause differs');
  return matched(
    Object.freeze({
      disclosure: Object.freeze({
        status: 'AUTHORIZED',
        sourceUnits: Object.freeze([...disclosure.sourceUnits] as string[]),
      }),
      resultSummary: Object.freeze({
        status: 'AUTHORIZED_RESULT_ONLY',
        purpose: PURPOSE,
        sourceHead: Object.freeze({ ...expected.head }),
        causeBinding: Object.freeze({ ...expected.cause }),
      }),
    }),
  );
}

export type OfficeIndustrySourceReadiness = Readonly<{
  schemaVersion: 'office-industry-source-readiness-v1';
  authority: 'DIAGNOSTIC_ONLY_NO_ADMISSION_OR_PUBLICATION';
  hostInstallation: 'NOT_ASSESSED';
}> &
  (
    | Readonly<{
        status: 'BLOCKED';
        missing: readonly (
          'COMMITTED_PRODUCTION_TARGET' | 'NATIVE_GOVERNING_CUSTODY'
        )[];
        reason: EconomicReadDenialReason | 'PRODUCTION_TARGET_NOT_FOUND';
      }>
    | Readonly<{
        status: 'READ_ONLY_RESULT_AVAILABLE';
        result: IndustryProductionGoverningResult;
      }>
  );

/** Must be awaited inside the owning transaction and genuine lineage scope.
 * This consumes the existing source/rights contracts, never supplied numbers.
 * A custody dependency is the existing explicit independent server trust
 * boundary; its mere presence is never reported as an admitted source. */
export async function readOfficeIndustrySourceReadinessFrom(
  input: Readonly<{
    executor: SqlExecutor;
    view: ValidatedCanonicalLineageView;
    selectors: IndustryProductionSelectors;
    scope: EconomicReadScope;
    custody: IndustryGoverningCustodyPort | null;
  }>,
): Promise<OfficeIndustrySourceReadiness> {
  const { executor, view, selectors, scope, custody } = input;
  if (custody !== null && typeof custody?.withSnapshotFrom !== 'function')
    invalid('Explicit custody contract required');
  const data = readValidatedCanonicalLineageFrom(executor, view);
  const head = {
    worldId: data.worldId,
    worldVersion: data.headWorldVersion,
    eventSequence: data.headEventSequence,
  };
  const base = {
    schemaVersion: 'office-industry-source-readiness-v1',
    authority: 'DIAGNOSTIC_ONLY_NO_ADMISSION_OR_PUBLICATION',
    hostInstallation: 'NOT_ASSESSED',
  } as const;
  if (
    !same(selectors.expectedPublicationHead, head) ||
    selectors.worldId !== head.worldId
  )
    invalid('Selector differs from held lineage head');
  if (
    scope.worldId !== head.worldId ||
    scope.countryId !== selectors.countryId ||
    scope.classification !== 'OFFICE_PRIVATE' ||
    scope.officeId !== 'INDUSTRY'
  )
    return Object.freeze({
      ...base,
      status: 'BLOCKED',
      reason: 'SCOPE_NOT_AUTHORIZED',
      missing: Object.freeze([]),
    });
  const selected = readIndustryProductionSourceFrom(
    executor,
    view,
    selectors,
    (text) => createHash('sha256').update(text).digest('hex'),
  );
  const missing: (
    'COMMITTED_PRODUCTION_TARGET' | 'NATIVE_GOVERNING_CUSTODY'
  )[] = [];
  if (selected.kind === 'SOURCE_UNAVAILABLE')
    missing.push('COMMITTED_PRODUCTION_TARGET');
  if (!custody) missing.push('NATIVE_GOVERNING_CUSTODY');
  if (
    missing.length > 0 ||
    selected.kind === 'SOURCE_UNAVAILABLE' ||
    custody === null
  )
    return Object.freeze({
      ...base,
      status: 'BLOCKED',
      reason:
        selected.kind === 'SOURCE_UNAVAILABLE'
          ? 'PRODUCTION_TARGET_NOT_FOUND'
          : 'ADMITTED_SOURCE_UNAVAILABLE',
      missing: Object.freeze(missing),
    });
  const result = await readIndustryProductionGoverningFrom(
    executor,
    view,
    selectors,
    scope,
    custody,
  );
  if (readValidatedCanonicalLineageFrom(executor, view) !== data)
    invalid('Lineage changed after source read');
  const checked = checkOfficeIndustrySourceResult(result, {
    head,
    cause: {
      commandId: selected.targetCommand.commandId,
      commandFingerprint: selected.targetCommand.fingerprint,
      eventId: selected.targetEvent.eventId,
      eventFingerprint: selected.targetEvent.fingerprint,
    },
  }).result;
  if (checked.disclosure.status === 'NOT_AUTHORIZED')
    return Object.freeze({
      ...base,
      status: 'BLOCKED',
      reason: checked.disclosure.reason,
      missing: Object.freeze([]),
    });
  return Object.freeze({
    ...base,
    status: 'READ_ONLY_RESULT_AVAILABLE',
    result: checked,
  });
}
