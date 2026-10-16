import {
  BUDGET_INERT_FLAGS,
  checkBudgetAppropriationHistory,
  planBudgetAppropriation,
  type BudgetEvidenceClass,
  type BudgetInertResult,
  type BudgetRecordKind,
} from '../../../../packages/core/src/commands/finance-budget-appropriation.js';
import { canonicalSerialize } from '../../../../packages/core/src/serialization/canonical.js';

/** Isolated carrier: no IO, source issuer, loader, runtime or production brand. */
export type BudgetCarrierResult = typeof BUDGET_INERT_FLAGS &
  (
    | Readonly<{
        kind: 'INERT_CARRIER_CONSISTENT';
        evidenceClass: BudgetEvidenceClass;
        result: BudgetInertResult;
        sourceCrosswalk: readonly Readonly<{
          proposedRecordRef: string;
          sourceKind: BudgetRecordKind;
          proposedSourceRef: string;
          subjectRef: string;
          subjectRevision: string;
          entityRef: string;
          envelopeRef: string;
          effectivePeriodRef: string;
          currency: string;
        }>[];
      }>
    | Readonly<{
        kind: 'INERT_REJECTED';
        code: string;
      }>
  );

/** Reconstruct exact inert result. Matching JSON does NOT establish source existence. */
export function checkBudgetAppropriationCarrier(
  input: unknown,
): BudgetCarrierResult {
  const reject = (code: string): BudgetCarrierResult =>
    Object.freeze({ ...BUDGET_INERT_FLAGS, kind: 'INERT_REJECTED', code });
  try {
    const normalized: unknown = JSON.parse(canonicalSerialize(input));
    if (
      normalized === null ||
      typeof normalized !== 'object' ||
      Array.isArray(normalized)
    )
      return reject('CARRIER_RECORD_REQUIRED');
    const row = normalized as Record<string, unknown>;
    const keys = [
      'schemaVersion',
      'evidenceClass',
      'mode',
      'request',
      'result',
    ];
    if (
      Object.keys(row).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(row, key)) ||
      row.schemaVersion !== 'inert-budget-carrier-v1'
    )
      return reject('CARRIER_SCHEMA_INVALID');
    if (
      row.evidenceClass !== 'UNADMITTED_INERT_INPUT' &&
      row.evidenceClass !== 'TEST_ONLY'
    )
      return reject('CARRIER_EVIDENCE_CLASS');
    if (row.mode !== 'PLAN' && row.mode !== 'HISTORY')
      return reject('CARRIER_MODE');
    if (
      row.request === null ||
      typeof row.request !== 'object' ||
      Array.isArray(row.request) ||
      (row.request as Record<string, unknown>).evidenceClass !==
        row.evidenceClass
    )
      return reject('CARRIER_EVIDENCE_MISMATCH');
    const result =
      row.mode === 'PLAN'
        ? planBudgetAppropriation(row.request)
        : checkBudgetAppropriationHistory(row.request);
    if (canonicalSerialize(result) !== canonicalSerialize(row.result))
      return reject('CARRIER_RESULT_MISMATCH');
    const sourceCrosswalk =
      result.kind === 'INERT_PROPOSED'
        ? result.records.map((record) =>
            Object.freeze({
              proposedRecordRef: record.proposedRecordRef,
              sourceKind: record.kind,
              proposedSourceRef: record.proposedSourceRef,
              subjectRef: record.subjectRef,
              subjectRevision: record.subjectRevision,
              entityRef: record.binding.scope.entityRef,
              envelopeRef: record.binding.scope.envelopeRef,
              effectivePeriodRef: record.binding.scope.effectivePeriodRef,
              currency: record.binding.currency,
            }),
          )
        : [];
    return Object.freeze({
      ...BUDGET_INERT_FLAGS,
      kind: 'INERT_CARRIER_CONSISTENT',
      evidenceClass: row.evidenceClass,
      result,
      sourceCrosswalk: Object.freeze(sourceCrosswalk),
    });
  } catch {
    return reject('INVALID_INERT_CARRIER');
  }
}
