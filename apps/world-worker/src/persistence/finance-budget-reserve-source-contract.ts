import {
  validateFinanceBudgetReserveContract,
  type FinanceBudgetReserveInput,
  type ReserveLineBalances,
} from '@econmind/core';

/**
 * Isolated, UNADMITTED/TEST_ONLY JSON consistency contract. Not a source loader,
 * SQL reader, admission issuer or CurrentMaterializationObservation constructor.
 * Future runtime integration needs a genuinely private, same-SqlExecutor source
 * constructor (including origin/inclusion/absence/cutoff proof) AND a nonnull
 * genuine cache observation, plus RF-D02's final post-lock cutoff recheck.
 * No object returned here can stand in for either observation or authorize IO.
 */
export type FinanceBudgetReserveSourceEvidenceClass =
  FinanceBudgetReserveInput['evidenceClass'];

export type FinanceBudgetReserveSourceContractResult = Readonly<{
  evidenceClass: FinanceBudgetReserveSourceEvidenceClass | null;
  productionAuthority: false;
  sourceAdmitted: false;
  actualSourceObservation: 'NOT_CONSTRUCTED';
  actualCacheObservation: 'NOT_CONSTRUCTED';
}> &
  (
    | Readonly<{
        status: 'INERT_REJECTED' | 'INERT_MISSING_INPUT';
        reason: string;
        diagnostic: string;
      }>
    | Readonly<{
        status: 'INERT_CONSISTENT' | 'INERT_DUPLICATE';
        cutoff: FinanceBudgetReserveInput['cutoff'];
        balances: readonly ReserveLineBalances[];
      }>
  );

export function inspectFinanceBudgetReserveSourceContract(
  input: unknown,
): FinanceBudgetReserveSourceContractResult {
  const result = validateFinanceBudgetReserveContract(input);
  const boundary = {
    evidenceClass: result.evidenceClass,
    productionAuthority: false,
    sourceAdmitted: false,
    actualSourceObservation: 'NOT_CONSTRUCTED',
    actualCacheObservation: 'NOT_CONSTRUCTED',
  } as const;
  if ('diagnostic' in result) {
    return Object.freeze({
      ...boundary,
      status: result.status,
      reason: result.reason,
      diagnostic: result.diagnostic,
    });
  }
  // Deliberately exclude the command's new reservation effect and identity.
  return Object.freeze({
    ...boundary,
    status: result.status,
    cutoff: result.cutoff,
    balances: result.balances,
  });
}
