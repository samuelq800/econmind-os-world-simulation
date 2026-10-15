/** Inert declared calculation DTOs. None of these types grants financial authority. */
export type CandidatePrincipalSelector =
  | 'SCENE_CLEARING_09_24_V2'
  | 'SCENE_CLEARING_13_24_V2'
  | 'SCENE_CLEARING_20_09_V2'
  | 'SCENE_CLEARING_20_24_V2';

export interface DeclaredGcuAmount {
  readonly status: 'DECLARED' | 'UNKNOWN';
  readonly amount: string | null;
  readonly currency: string | null;
  readonly reference: string;
}
export interface DeclaredPrincipalAccount {
  readonly accountId: string;
  readonly ownerId: string;
  readonly accountClass: string;
  readonly claimId: string | null;
  readonly counterpartyId: string | null;
  readonly balance: DeclaredGcuAmount;
}
export type ExcludedComponent =
  'fee' | 'interest' | 'fx' | 'partial' | 'refund' | 'loan' | 'endowment';
export interface DeclaredComponentApplicability {
  readonly applicability: 'DECLARED_NONE' | 'REQUIRED' | 'UNKNOWN';
  readonly reference: string;
}
export interface DeclaredPrincipalCalculation {
  readonly schemaVersion: 'DECLARED_GCU_PRINCIPAL_CALCULATION_V1';
  readonly claim: {
    readonly selector: CandidatePrincipalSelector;
    readonly issuerId: string;
    readonly holderId: string;
    readonly originalPrincipal: DeclaredGcuAmount;
    readonly remainingPrincipal: DeclaredGcuAmount;
    readonly history: {
      readonly status:
        'DECLARED_OUTSTANDING' | 'DECLARED_FULLY_PAID' | 'UNKNOWN';
      readonly reference: string;
    };
  };
  readonly requestedAmount: DeclaredGcuAmount;
  readonly accounts: {
    readonly issuerCash: DeclaredPrincipalAccount;
    readonly holderCash: DeclaredPrincipalAccount;
    readonly issuerLiability: DeclaredPrincipalAccount;
    readonly holderReceivable: DeclaredPrincipalAccount;
  };
  readonly sharedPool: {
    readonly reference: string;
    readonly available: DeclaredGcuAmount;
  };
  readonly components: Readonly<
    Record<ExcludedComponent, DeclaredComponentApplicability>
  >;
}
export interface PrincipalCalculationBoundary {
  readonly formalStatus: 'PORT_NOT_INSTALLED';
  readonly formalPaymentAllowed: false;
  readonly actualSettlement: false;
  readonly sourceAdopted: false;
  readonly titleVerified: false;
  readonly termsVerified: false;
  readonly permissionVerified: false;
  readonly historyVerified: false;
  readonly reserved: false;
}
export type PrincipalUnavailableReason =
  | 'MALFORMED_DECLARATION'
  | 'DECLARATION_UNKNOWN'
  | 'HISTORY_UNKNOWN'
  | 'DECLARED_ALREADY_PAID'
  | 'UNSUPPORTED_FINANCIAL_COMPONENT'
  | 'CURRENCY_MISMATCH'
  | 'CLAIM_ACCOUNT_MISMATCH'
  | 'PRINCIPAL_NOT_FULL'
  | 'PRINCIPAL_OR_BALANCE_MISMATCH'
  | 'INSUFFICIENT_DECLARED_CASH'
  | 'INVALID_EXACT_DECIMAL'
  | 'ARITHMETIC_OUT_OF_DOMAIN'
  | 'PORT_NOT_INSTALLED';
export interface PrincipalCalculationUnavailable extends PrincipalCalculationBoundary {
  readonly status: 'UNAVAILABLE';
  readonly reason: PrincipalUnavailableReason;
}
export interface ProvisionalPrincipalLeg {
  readonly diagnosticOnly: true;
  readonly accountId: string;
  readonly ownerId: string;
  readonly accountClass: string;
  readonly declaredClaimId: string | null;
  readonly declaredCounterpartyId: string | null;
  readonly declaredBalanceReference: string;
  readonly direction: 'DEBIT' | 'CREDIT';
  readonly amountGcu: string;
}
export interface DeclaredPrincipalPositions {
  readonly issuerCash: string;
  readonly holderCash: string;
  readonly issuerLiabilityNetDebit: string;
  readonly holderReceivableNetDebit: string;
  readonly remainingPrincipal: string;
  readonly sharedPoolAvailable: string;
}
export interface ProvisionalPrincipalCalculation extends PrincipalCalculationBoundary {
  readonly status: 'PROVISIONAL_CALCULATION_NOT_RESERVED_NOT_SETTLED';
  readonly provenance: 'EXPLICIT_UNVERIFIED_DECLARATIONS_ONLY';
  readonly currency: 'GCU';
  readonly selector: CandidatePrincipalSelector;
  readonly originalPrincipalGcu: string;
  readonly amountGcu: string;
  readonly before: Readonly<DeclaredPrincipalPositions>;
  readonly delta: Readonly<DeclaredPrincipalPositions>;
  readonly after: Readonly<DeclaredPrincipalPositions>;
  readonly legs: readonly ProvisionalPrincipalLeg[];
  readonly declaredAssumptions: Readonly<DeclaredPrincipalCalculation>;
  readonly globalCashDeltaGcu: '0';
  readonly equityDeltaGcu: '0';
}
export type PrincipalCalculationResult =
  PrincipalCalculationUnavailable | ProvisionalPrincipalCalculation;
