/** Derived display facts, never an authoritative balance or an authorization grant. */
export const OFFICE_DECISION_RESULT_SCHEMA =
  'office-decision-results-v1' as const;
export type DecisionResultOffice =
  'CAPTAIN' | 'CENTRAL_BANK' | 'SOCIAL' | 'INDUSTRY';
export interface DecisionResultHead {
  readonly worldId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface DecisionResultCause {
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly eventType: string;
  readonly eventSequence: string;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: string;
  readonly planCommandId: string | null;
}
export type DecisionResultMetric = Readonly<{
  key: string;
  unit: string;
}> &
  (
    | Readonly<{
        status: 'EXACT_CHANGE';
        before: string;
        delta: string;
        after: string;
      }>
    | Readonly<{
        status: 'AFTER_ONLY';
        before: null;
        delta: null;
        after: string;
        reason: 'PREDECESSOR_STATE_NOT_CARRIED';
      }>
  );
export interface OfficeDecisionResult {
  readonly schemaVersion: typeof OFFICE_DECISION_RESULT_SCHEMA;
  readonly classification: 'OFFICE_PRIVATE';
  readonly countryId: string;
  readonly officeId: DecisionResultOffice;
  /** Publication head, not the version at which the last result occurred. */
  readonly sourceHead: DecisionResultHead;
  readonly semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION';
  readonly source: 'COMMITTED_EVENT_RESULT' | null;
  /** No full operating state is disclosed or reconstructed from a hash. */
  readonly afterState: null;
  readonly status: 'COMMITTED' | 'SOURCE_UNAVAILABLE' | 'NOT_AUTHORIZED';
  readonly reason: string | null;
  readonly businessState: 'APPLIED' | 'PLAN_PENDING' | 'MATCH_SETTLED' | null;
  readonly cause: DecisionResultCause | null;
  readonly metrics: readonly DecisionResultMetric[];
}
/** No quantities, financial instrument IDs, raw payloads or private causality. */
export interface CountryDecisionResultSummary {
  readonly schemaVersion: typeof OFFICE_DECISION_RESULT_SCHEMA;
  readonly classification: 'COUNTRY';
  readonly countryId: string;
  readonly sourceHead: DecisionResultHead;
  readonly status: 'NOT_AUTHORIZED';
  readonly reason: 'OFFICE_DECISION_DETAIL_PRIVATE';
}
