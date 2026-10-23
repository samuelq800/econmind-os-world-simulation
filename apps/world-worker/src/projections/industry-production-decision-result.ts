/** Explicit isolated projection only. Official Industry source/decoder stays closed. */
import {
  OFFICE_DECISION_RESULT_SCHEMA,
  DomainError,
  DOMAIN_ERROR_CODES,
  type OfficeDecisionResult,
  type EconomicReadScope,
} from '@econmind/core';
import type { EconomicReadVisibilitySnapshot } from './economic-read-visibility-source.js';
import {
  INDUSTRY_TEST_ONLY_ADMISSION,
  readIsolatedIndustryResultSourceForTestOnly,
  requireIndustryIsolatedTestRuntime,
  type IsolatedIndustryResultHandle,
} from './industry-production-result-evidence.js';

/** Per-account disclosure fixture only. The official summary contract currently
 * permits no inventory success and is deliberately neither widened nor used as
 * a test authorization switch. This port never reaches an official publisher.
 */
export type IsolatedIndustryFixtureVisibility = Pick<
  EconomicReadVisibilitySnapshot,
  'worldId' | 'worldVersion' | 'eventSequence' | 'inventory'
>;

/** Fixture visibility is an explicit isolated dependency, not a new governing
 * mapping. No current stock, settled money, raw recipe or accounts are returned.
 */
export function projectIsolatedIndustryDecisionResultForTestOnly(input: {
  readonly handle: IsolatedIndustryResultHandle;
  readonly countryId: string;
  readonly visibility: IsolatedIndustryFixtureVisibility;
}) {
  requireIndustryIsolatedTestRuntime();
  if (Object.keys(input).sort().join('|') !== 'countryId|handle|visibility')
    throw new Error('CLOSED_INDUSTRY_TEST_ONLY_PROJECTOR_INPUT_REQUIRED');
  const source = readIsolatedIndustryResultSourceForTestOnly(input.handle);
  const head = source.sourceHead,
    visibility = input.visibility;
  if (
    visibility.worldId !== head.worldId ||
    visibility.worldVersion !== head.worldVersion ||
    visibility.eventSequence !== head.eventSequence
  )
    throw new DomainError(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      'Industry TEST_ONLY visibility and source head differ',
    );
  const scope: EconomicReadScope = {
    worldId: head.worldId,
    countryId: input.countryId,
    officeId: 'INDUSTRY',
    classification: 'OFFICE_PRIVATE',
  };
  const base = {
    schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
    classification: 'OFFICE_PRIVATE' as const,
    countryId: input.countryId,
    officeId: 'INDUSTRY' as const,
    sourceHead: head,
    semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION' as const,
    afterState: null,
  };
  const envelope = (result: OfficeDecisionResult) =>
    Object.freeze({
      schemaVersion: 'unit-test-only-industry-decision-result-v1' as const,
      admission: INDUSTRY_TEST_ONLY_ADMISSION,
      sourceAdmitted: false as const,
      runtimeConnected: false as const,
      productionAuthority: false as const,
      originalFieldsClosed: 0 as const,
      result: Object.freeze(result),
    });
  const empty = (
    status: 'SOURCE_UNAVAILABLE' | 'NOT_AUTHORIZED',
    reason: string,
  ) =>
    envelope({
      ...base,
      source: null,
      status,
      reason,
      businessState: null,
      cause: null,
      metrics: Object.freeze([]),
    });
  const row = source.rows
    .filter((value) => value.countryId === input.countryId)
    .at(-1);
  if (!row)
    return empty('SOURCE_UNAVAILABLE', 'NO_COMMITTED_PRODUCTION_RESULT');
  if (source.correctedEventIds.includes(row.cause.eventId))
    return empty('SOURCE_UNAVAILABLE', 'PRODUCTION_CAUSE_CORRECTED');
  if (
    row.accounts.some(
      (account) =>
        visibility.inventory({ ...account }, scope).status !== 'AUTHORIZED',
    )
  )
    return empty('NOT_AUTHORIZED', 'SCOPE_NOT_AUTHORIZED');
  return envelope({
    ...base,
    source: 'COMMITTED_EVENT_RESULT',
    status: 'COMMITTED',
    reason: null,
    businessState: 'APPLIED',
    cause: row.cause,
    metrics: Object.freeze([
      Object.freeze({
        key: 'PRODUCTION_OUTPUT',
        unit: row.output.unit,
        status: 'AFTER_ONLY' as const,
        before: null,
        delta: null,
        after: row.output.amount,
        reason: 'PREDECESSOR_STATE_NOT_CARRIED' as const,
      }),
    ]),
  });
}
