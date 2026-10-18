/** TEST_ONLY declarations. No new adoption, title, cash, epoch or human identity is proven. */
import path from 'node:path';
import {
  canonicalSerialize,
  Money,
  CURRENT_REPLAY_BINDING,
} from '@econmind/core';
import {
  financialInputSha256,
  parseFormalFinancialOpeningContract,
  type FormalFinancialOpeningContract,
  type FinancialSourceReference,
  type FinancialCountryInput,
  type FinancialCbHolding,
} from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  loadOwnerNonHostSourceAdoption,
  type OwnerNonHostSourceAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import { CLAIM_SCENARIO_EXPECTATIONS } from '../../apps/world-worker/src/preparation/claim-scenario-source-contract.js';

export interface ClaimScenarioFixtureDraft {
  schemaVersion: string;
  sourceClass: string;
  sourceVersion: string;
  previousVersionHash: string | null;
  creationReason: string;
  inactiveOpening: Record<string, unknown> | null;
  claims: Record<string, unknown>[];
  originalStableIdLinks: string[];
}
// Generated fixed data from frozen vector SHA e52208f4; never actual adoption evidence.
const frozenVectorBase: unknown = JSON.parse(
  '{"candidateInput":{"claims":[{"currency":"GCU","financialClaimId":null,"instrumentCode":null,"legalHolder":{"entityId":"ENTITY_CENTRAL_BANK_24","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"legalIssuer":{"entityId":"ENTITY_CENTRAL_BANK_09","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"lifecycle":{"accrualStart":{"relativeSimDay":"0","status":"DRAFT_NEW_CHOICE_NOT_HISTORICAL"},"allocation":{"feeAllocation":"SEPARATE_EXPLICIT_SOURCE_REQUIRED","policy":"EXACT_COMMITTED_DEBT_PRINCIPAL_LEG_ONLY","unknownFeeReducesPrincipal":false},"annualCoupon":{"fraction":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"callPolicy":{"creditorUnilateralCall":false,"status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"defaultResolution":{"automaticForgiveness":false,"automaticNetting":false,"automaticRollover":false,"automaticSeizure":false,"competentAuthorityReference":null,"otherExistingRightsWaived":false,"remedyWithoutBoundAuthority":"DENY","scope":"RECORD_NOTIFY_AND_REFER_ONLY"},"earlyPayment":{"policy":"EXPLICIT_BILATERAL_CONSENT_AND_EXACT_SUPPORTED_ROUTE_ONLY","unsupportedRoute":"DENY"},"effectiveFrom":{"actualOpeningEpoch":null,"scope":"EXPLICIT_NEW_INACTIVE_OPENING_ONLY"},"fees":{"existingContractFeeWaived":false,"freeAdminScopeCoversDebtFxRefund":false,"missingApplicableFact":"DENY_OPERATION_NOT_ZERO_FEE","policy":"REQUIRE_EXACT_APPLICABLE_FEE_SOURCE_BEFORE_OPERATION","quote":null,"requiredFacts":["payer","beneficiary","operationScope","trigger","nativeCurrency","valuePeriod","base","fixedOrExactRate","inclusionDeduplication","grossNetAndAllocation"],"status":"DRAFT_POLICY_NOT_A_QUOTE_OR_ZERO_FEE"},"firstCouponDue":{"actualDue":null,"policy":"NO_SCHEDULED_COUPON_FOR_EXPLICIT_ZERO_COUPON_DRAFT"},"interestDayCount":{"simulationDaysPerYear":"360","status":"REUSE_EXISTING_TIME360_NOT_MATURITY"},"lateCompounding":{"policy":"NONE_NO_CAPITALIZATION","status":"DRAFT_REQUIRES_ADOPTION"},"lateRate":{"fraction":"0","status":"EXPLICIT_DRAFT_SEPARATE_FROM_COUPON"},"overdueBoundary":{"balanceForgiven":false,"rule":"UNPAID_REMAINDER_FROM_DAY_AFTER_DUE_DAY_END"},"partialPayment":{"cap":"OUTSTANDING_PRINCIPAL","policy":"COUNT_UNIQUE_MATCHING_COMMITTED_PRINCIPAL_ALLOCATIONS_ONLY","unpaidRemainder":"REMAINS_OWED","unsupportedRoute":"DENY"},"principalDue":{"boundary":"END_OF_SELECTED_RELATIVE_DAY","selectedRelativeSimDay":null,"selectionRequired":true},"principalGrace":{"simDays":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"refundAndCorrection":{"automaticPrincipalRestoration":false,"cashCap":"ORIGINAL_ELIGIBLE_PAID_MINUS_PRIOR_REFUNDS","debtCorrection":"SEPARATE_EXACT_SOURCE_MAPPING_REQUIRED","originalCommittedReferenceRequired":true,"policy":"EVIDENCED_DUPLICATE_OR_OVERPAYMENT_ONLY","unexecutedIntentCreatesRefund":false,"unsupportedRoute":"DENY"}},"mirrors":[{"amount":"499500000","counterpartyId":"ENTITY_CENTRAL_BANK_24","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_09","role":"LIABILITY"},{"amount":"499500000","counterpartyId":"ENTITY_CENTRAL_BANK_09","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_24","role":"ASSET"}],"originalClaimSelector":"SCENE_CLEARING_09_24_V2","principal":"499500000","sourceReferences":{"EComparison":{"group":"FOUR_CLAIM_COMPARISON_V2","pointer":"/crossCbLifecycle","sha256":"348cfde8e97b8cbf0508d7273082c2f7758322e618d0f17ebf3d7c4b0232830e"},"historicalNativeCurrencyRecovered":false}},{"currency":"GCU","financialClaimId":null,"instrumentCode":null,"legalHolder":{"entityId":"ENTITY_CENTRAL_BANK_24","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"legalIssuer":{"entityId":"ENTITY_CENTRAL_BANK_13","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"lifecycle":{"accrualStart":{"relativeSimDay":"0","status":"DRAFT_NEW_CHOICE_NOT_HISTORICAL"},"allocation":{"feeAllocation":"SEPARATE_EXPLICIT_SOURCE_REQUIRED","policy":"EXACT_COMMITTED_DEBT_PRINCIPAL_LEG_ONLY","unknownFeeReducesPrincipal":false},"annualCoupon":{"fraction":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"callPolicy":{"creditorUnilateralCall":false,"status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"defaultResolution":{"automaticForgiveness":false,"automaticNetting":false,"automaticRollover":false,"automaticSeizure":false,"competentAuthorityReference":null,"otherExistingRightsWaived":false,"remedyWithoutBoundAuthority":"DENY","scope":"RECORD_NOTIFY_AND_REFER_ONLY"},"earlyPayment":{"policy":"EXPLICIT_BILATERAL_CONSENT_AND_EXACT_SUPPORTED_ROUTE_ONLY","unsupportedRoute":"DENY"},"effectiveFrom":{"actualOpeningEpoch":null,"scope":"EXPLICIT_NEW_INACTIVE_OPENING_ONLY"},"fees":{"existingContractFeeWaived":false,"freeAdminScopeCoversDebtFxRefund":false,"missingApplicableFact":"DENY_OPERATION_NOT_ZERO_FEE","policy":"REQUIRE_EXACT_APPLICABLE_FEE_SOURCE_BEFORE_OPERATION","quote":null,"requiredFacts":["payer","beneficiary","operationScope","trigger","nativeCurrency","valuePeriod","base","fixedOrExactRate","inclusionDeduplication","grossNetAndAllocation"],"status":"DRAFT_POLICY_NOT_A_QUOTE_OR_ZERO_FEE"},"firstCouponDue":{"actualDue":null,"policy":"NO_SCHEDULED_COUPON_FOR_EXPLICIT_ZERO_COUPON_DRAFT"},"interestDayCount":{"simulationDaysPerYear":"360","status":"REUSE_EXISTING_TIME360_NOT_MATURITY"},"lateCompounding":{"policy":"NONE_NO_CAPITALIZATION","status":"DRAFT_REQUIRES_ADOPTION"},"lateRate":{"fraction":"0","status":"EXPLICIT_DRAFT_SEPARATE_FROM_COUPON"},"overdueBoundary":{"balanceForgiven":false,"rule":"UNPAID_REMAINDER_FROM_DAY_AFTER_DUE_DAY_END"},"partialPayment":{"cap":"OUTSTANDING_PRINCIPAL","policy":"COUNT_UNIQUE_MATCHING_COMMITTED_PRINCIPAL_ALLOCATIONS_ONLY","unpaidRemainder":"REMAINS_OWED","unsupportedRoute":"DENY"},"principalDue":{"boundary":"END_OF_SELECTED_RELATIVE_DAY","selectedRelativeSimDay":null,"selectionRequired":true},"principalGrace":{"simDays":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"refundAndCorrection":{"automaticPrincipalRestoration":false,"cashCap":"ORIGINAL_ELIGIBLE_PAID_MINUS_PRIOR_REFUNDS","debtCorrection":"SEPARATE_EXACT_SOURCE_MAPPING_REQUIRED","originalCommittedReferenceRequired":true,"policy":"EVIDENCED_DUPLICATE_OR_OVERPAYMENT_ONLY","unexecutedIntentCreatesRefund":false,"unsupportedRoute":"DENY"}},"mirrors":[{"amount":"199800000","counterpartyId":"ENTITY_CENTRAL_BANK_24","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_13","role":"LIABILITY"},{"amount":"199800000","counterpartyId":"ENTITY_CENTRAL_BANK_13","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_24","role":"ASSET"}],"originalClaimSelector":"SCENE_CLEARING_13_24_V2","principal":"199800000","sourceReferences":{"EComparison":{"group":"FOUR_CLAIM_COMPARISON_V2","pointer":"/crossCbLifecycle","sha256":"348cfde8e97b8cbf0508d7273082c2f7758322e618d0f17ebf3d7c4b0232830e"},"historicalNativeCurrencyRecovered":false}},{"currency":"GCU","financialClaimId":null,"instrumentCode":null,"legalHolder":{"entityId":"ENTITY_CENTRAL_BANK_09","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"legalIssuer":{"entityId":"ENTITY_CENTRAL_BANK_20","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"lifecycle":{"accrualStart":{"relativeSimDay":"0","status":"DRAFT_NEW_CHOICE_NOT_HISTORICAL"},"allocation":{"feeAllocation":"SEPARATE_EXPLICIT_SOURCE_REQUIRED","policy":"EXACT_COMMITTED_DEBT_PRINCIPAL_LEG_ONLY","unknownFeeReducesPrincipal":false},"annualCoupon":{"fraction":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"callPolicy":{"creditorUnilateralCall":false,"status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"defaultResolution":{"automaticForgiveness":false,"automaticNetting":false,"automaticRollover":false,"automaticSeizure":false,"competentAuthorityReference":null,"otherExistingRightsWaived":false,"remedyWithoutBoundAuthority":"DENY","scope":"RECORD_NOTIFY_AND_REFER_ONLY"},"earlyPayment":{"policy":"EXPLICIT_BILATERAL_CONSENT_AND_EXACT_SUPPORTED_ROUTE_ONLY","unsupportedRoute":"DENY"},"effectiveFrom":{"actualOpeningEpoch":null,"scope":"EXPLICIT_NEW_INACTIVE_OPENING_ONLY"},"fees":{"existingContractFeeWaived":false,"freeAdminScopeCoversDebtFxRefund":false,"missingApplicableFact":"DENY_OPERATION_NOT_ZERO_FEE","policy":"REQUIRE_EXACT_APPLICABLE_FEE_SOURCE_BEFORE_OPERATION","quote":null,"requiredFacts":["payer","beneficiary","operationScope","trigger","nativeCurrency","valuePeriod","base","fixedOrExactRate","inclusionDeduplication","grossNetAndAllocation"],"status":"DRAFT_POLICY_NOT_A_QUOTE_OR_ZERO_FEE"},"firstCouponDue":{"actualDue":null,"policy":"NO_SCHEDULED_COUPON_FOR_EXPLICIT_ZERO_COUPON_DRAFT"},"interestDayCount":{"simulationDaysPerYear":"360","status":"REUSE_EXISTING_TIME360_NOT_MATURITY"},"lateCompounding":{"policy":"NONE_NO_CAPITALIZATION","status":"DRAFT_REQUIRES_ADOPTION"},"lateRate":{"fraction":"0","status":"EXPLICIT_DRAFT_SEPARATE_FROM_COUPON"},"overdueBoundary":{"balanceForgiven":false,"rule":"UNPAID_REMAINDER_FROM_DAY_AFTER_DUE_DAY_END"},"partialPayment":{"cap":"OUTSTANDING_PRINCIPAL","policy":"COUNT_UNIQUE_MATCHING_COMMITTED_PRINCIPAL_ALLOCATIONS_ONLY","unpaidRemainder":"REMAINS_OWED","unsupportedRoute":"DENY"},"principalDue":{"boundary":"END_OF_SELECTED_RELATIVE_DAY","selectedRelativeSimDay":null,"selectionRequired":true},"principalGrace":{"simDays":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"refundAndCorrection":{"automaticPrincipalRestoration":false,"cashCap":"ORIGINAL_ELIGIBLE_PAID_MINUS_PRIOR_REFUNDS","debtCorrection":"SEPARATE_EXACT_SOURCE_MAPPING_REQUIRED","originalCommittedReferenceRequired":true,"policy":"EVIDENCED_DUPLICATE_OR_OVERPAYMENT_ONLY","unexecutedIntentCreatesRefund":false,"unsupportedRoute":"DENY"}},"mirrors":[{"amount":"874125000","counterpartyId":"ENTITY_CENTRAL_BANK_09","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_20","role":"LIABILITY"},{"amount":"874125000","counterpartyId":"ENTITY_CENTRAL_BANK_20","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_09","role":"ASSET"}],"originalClaimSelector":"SCENE_CLEARING_20_09_V2","principal":"874125000","sourceReferences":{"EComparison":{"group":"FOUR_CLAIM_COMPARISON_V2","pointer":"/crossCbLifecycle","sha256":"348cfde8e97b8cbf0508d7273082c2f7758322e618d0f17ebf3d7c4b0232830e"},"historicalNativeCurrencyRecovered":false}},{"currency":"GCU","financialClaimId":null,"instrumentCode":null,"legalHolder":{"entityId":"ENTITY_CENTRAL_BANK_24","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"legalIssuer":{"entityId":"ENTITY_CENTRAL_BANK_20","meaning":"PROPOSED_SCENARIO_ROLE_NOT_LEGAL_FACT","proof":null},"lifecycle":{"accrualStart":{"relativeSimDay":"0","status":"DRAFT_NEW_CHOICE_NOT_HISTORICAL"},"allocation":{"feeAllocation":"SEPARATE_EXPLICIT_SOURCE_REQUIRED","policy":"EXACT_COMMITTED_DEBT_PRINCIPAL_LEG_ONLY","unknownFeeReducesPrincipal":false},"annualCoupon":{"fraction":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"callPolicy":{"creditorUnilateralCall":false,"status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"defaultResolution":{"automaticForgiveness":false,"automaticNetting":false,"automaticRollover":false,"automaticSeizure":false,"competentAuthorityReference":null,"otherExistingRightsWaived":false,"remedyWithoutBoundAuthority":"DENY","scope":"RECORD_NOTIFY_AND_REFER_ONLY"},"earlyPayment":{"policy":"EXPLICIT_BILATERAL_CONSENT_AND_EXACT_SUPPORTED_ROUTE_ONLY","unsupportedRoute":"DENY"},"effectiveFrom":{"actualOpeningEpoch":null,"scope":"EXPLICIT_NEW_INACTIVE_OPENING_ONLY"},"fees":{"existingContractFeeWaived":false,"freeAdminScopeCoversDebtFxRefund":false,"missingApplicableFact":"DENY_OPERATION_NOT_ZERO_FEE","policy":"REQUIRE_EXACT_APPLICABLE_FEE_SOURCE_BEFORE_OPERATION","quote":null,"requiredFacts":["payer","beneficiary","operationScope","trigger","nativeCurrency","valuePeriod","base","fixedOrExactRate","inclusionDeduplication","grossNetAndAllocation"],"status":"DRAFT_POLICY_NOT_A_QUOTE_OR_ZERO_FEE"},"firstCouponDue":{"actualDue":null,"policy":"NO_SCHEDULED_COUPON_FOR_EXPLICIT_ZERO_COUPON_DRAFT"},"interestDayCount":{"simulationDaysPerYear":"360","status":"REUSE_EXISTING_TIME360_NOT_MATURITY"},"lateCompounding":{"policy":"NONE_NO_CAPITALIZATION","status":"DRAFT_REQUIRES_ADOPTION"},"lateRate":{"fraction":"0","status":"EXPLICIT_DRAFT_SEPARATE_FROM_COUPON"},"overdueBoundary":{"balanceForgiven":false,"rule":"UNPAID_REMAINDER_FROM_DAY_AFTER_DUE_DAY_END"},"partialPayment":{"cap":"OUTSTANDING_PRINCIPAL","policy":"COUNT_UNIQUE_MATCHING_COMMITTED_PRINCIPAL_ALLOCATIONS_ONLY","unpaidRemainder":"REMAINS_OWED","unsupportedRoute":"DENY"},"principalDue":{"boundary":"END_OF_SELECTED_RELATIVE_DAY","selectedRelativeSimDay":null,"selectionRequired":true},"principalGrace":{"simDays":"0","status":"EXPLICIT_DRAFT_REQUIRES_ADOPTION"},"refundAndCorrection":{"automaticPrincipalRestoration":false,"cashCap":"ORIGINAL_ELIGIBLE_PAID_MINUS_PRIOR_REFUNDS","debtCorrection":"SEPARATE_EXACT_SOURCE_MAPPING_REQUIRED","originalCommittedReferenceRequired":true,"policy":"EVIDENCED_DUPLICATE_OR_OVERPAYMENT_ONLY","unexecutedIntentCreatesRefund":false,"unsupportedRoute":"DENY"}},"mirrors":[{"amount":"149850000","counterpartyId":"ENTITY_CENTRAL_BANK_24","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_20","role":"LIABILITY"},{"amount":"149850000","counterpartyId":"ENTITY_CENTRAL_BANK_20","currency":"GCU","ownerId":"ENTITY_CENTRAL_BANK_24","role":"ASSET"}],"originalClaimSelector":"SCENE_CLEARING_20_24_V2","principal":"149850000","sourceReferences":{"EComparison":{"group":"FOUR_CLAIM_COMPARISON_V2","pointer":"/crossCbLifecycle","sha256":"348cfde8e97b8cbf0508d7273082c2f7758322e618d0f17ebf3d7c4b0232830e"},"historicalNativeCurrencyRecovered":false}}],"creationReason":"SCENARIO_RESTATEMENT_OF_UNADOPTED_PROPOSALS","inactiveOpening":null,"originalStableIdLinks":["U2544::CLAIM::SCENE_CLEARING_09_24_V2::actualTerms","U2544::CLAIM::SCENE_CLEARING_09_24_V2::actualLegalHolderIssuer","U2544::CLAIM::SCENE_CLEARING_13_24_V2::actualTerms","U2544::CLAIM::SCENE_CLEARING_13_24_V2::actualLegalHolderIssuer","U2544::CLAIM::SCENE_CLEARING_20_09_V2::actualTerms","U2544::CLAIM::SCENE_CLEARING_20_09_V2::actualLegalHolderIssuer","U2544::CLAIM::SCENE_CLEARING_20_24_V2::actualTerms","U2544::CLAIM::SCENE_CLEARING_20_24_V2::actualLegalHolderIssuer"],"previousVersionHash":null,"schemaVersion":"CLAIM_SCENARIO_SOURCE_DRAFT_INPUT_DESIGN_V1","sourceClass":"CONSTRUCTED_SCENARIO","sourceVersion":"G_FOUR_CLAIM_TERMS_DRAFT_20261018_V1"},"compositionInputs":{"Fcash":null,"completeFinancialInput":null,"economicEvidence":null},"serverCompositionInputs":{"actualServerSelectedEvidence":null}}',
);
const frozenVectorPatches: readonly {
  id: string;
  patch: readonly [string, unknown][];
}[] = JSON.parse(
  '[{"id":"DRAFT_UNSELECTED","patch":[]},{"id":"DRAFT_140_EXPLICIT","patch":[["/candidateInput/claims/0/lifecycle/principalDue/selectedRelativeSimDay","140"],["/candidateInput/claims/1/lifecycle/principalDue/selectedRelativeSimDay","140"],["/candidateInput/claims/2/lifecycle/principalDue/selectedRelativeSimDay","140"],["/candidateInput/claims/3/lifecycle/principalDue/selectedRelativeSimDay","140"]]},{"id":"DRAFT_360_EXPLICIT","patch":[["/candidateInput/claims/0/lifecycle/principalDue/selectedRelativeSimDay","360"],["/candidateInput/claims/1/lifecycle/principalDue/selectedRelativeSimDay","360"],["/candidateInput/claims/2/lifecycle/principalDue/selectedRelativeSimDay","360"],["/candidateInput/claims/3/lifecycle/principalDue/selectedRelativeSimDay","360"]]},{"id":"ACTUAL_ADOPTION_ABSENT","patch":[]},{"id":"OWNER_APPROVED_BOOLEAN","patch":[["/candidateInput/ownerApproved",true]]},{"id":"REQUEST_SELECTED_TRUST","patch":[["/candidateInput/trustedEvidenceHashes",["TEST_ONLY_CALLER_SELECTED_HASH_NOT_AUTHORITY"]]]},{"id":"SYNTHETIC_RECEIPT","patch":[["/compositionInputs/economicEvidence",{"humanProvenance":null,"reference":"TEST_ONLY_SYNTHETIC_NOT_ADOPTION","sourceHash":"0000000000000000000000000000000000000000000000000000000000000000"}]]},{"id":"MISBOUND_SOURCE_EVIDENCE","patch":[["/compositionInputs/economicEvidence",{"humanProvenance":null,"reference":"UNTRUSTED_EXAMPLE_SOURCE_MISMATCH","sourceHash":"0000000000000000000000000000000000000000000000000000000000000000","sourceVersion":"OTHER_VERSION"}]]},{"id":"MISBOUND_REVIEW_EVIDENCE","patch":[["/compositionInputs/economicEvidence",{"BReviewTarget":"OTHER_CODE_OR_SOURCE_TARGET","humanProvenance":null,"reference":"UNTRUSTED_EXAMPLE_REVIEW_MISMATCH"}]]},{"id":"F_CASH_ABSENT","patch":[]},{"id":"FEE_QUOTE_ABSENT","patch":[]},{"id":"FREE_ADMIN_SCOPE_MISAPPLIED","patch":[["/candidateInput/claims/0/lifecycle/fees/freeAdminScopeCoversDebtFxRefund",true]]},{"id":"D48_PROMOTED_TO_TITLE","patch":[["/candidateInput/claims/0/legalIssuer/proof",{"reference":"D48_CONSTRUCTED_LEAF_NOT_LEGAL_ADOPTION"}]]},{"id":"HISTORICAL_GCU_PROMOTION","patch":[["/candidateInput/claims/0/historicalNativeCurrency","GCU"]]},{"id":"MIRROR_AMOUNT_MISMATCH","patch":[["/candidateInput/claims/0/mirrors/1/amount","499500001"]]},{"id":"MIRROR_NATIVE_CURRENCY_MISMATCH","patch":[["/candidateInput/claims/0/mirrors/1/currency","XAA"]]},{"id":"MIRROR_ROLE_REVERSED","patch":[["/candidateInput/claims/0/mirrors/0/ownerId","ENTITY_CENTRAL_BANK_24"]]},{"id":"PRINCIPAL_DAY0_ACCELERATION","patch":[["/candidateInput/claims/0/lifecycle/principalDue/selectedRelativeSimDay","0"]]},{"id":"MISSING_LATE_POLICY","patch":[["/candidateInput/claims/0/lifecycle/lateRate",null]]},{"id":"MISSING_REFUND_POLICY","patch":[["/candidateInput/claims/0/lifecycle/refundAndCorrection",null]]},{"id":"REMEDY_AUTHORITY_ABSENT","patch":[]},{"id":"REFUND_WITHOUT_COMMITTED_PAYMENT","patch":[["/compositionInputs/refundIntent",{"classification":"UNEXECUTED_TEST_INTENT_NOT_PAYMENT","currency":"GCU","originalCommittedReference":null,"requestedAmount":"1"}]]},{"id":"OPENING_SOURCE_UNBOUND","patch":[]},{"id":"SOURCE_VERSION_CONFLICT","patch":[["/compositionInputs/priorSelection",{"classification":"UNTRUSTED_TEST_CONFLICT_DECLARATION","differentBytesSameVersion":true,"sourceVersion":"G_FOUR_CLAIM_TERMS_DRAFT_20261018_V1"}]]},{"id":"ALREADY_ADMITTED_PREDECESSOR","patch":[["/compositionInputs/priorSelection",{"classification":"TEST_ONLY_NOT_ACTUAL_WORLD_READBACK","declaredStatus":"ADMITTED"}]]},{"id":"FOURTH_CLAIM_REJECTS_ALL","patch":[["/candidateInput/claims/3/mirrors/1/amount","149850001"]]}]',
);
const frozenVectorInputHash =
  '40ae4a3fe1bc6e37fb59b575c1c7c29e91b1747ced1bb68de69d49c2d84ac245';
const rowFixture = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;
/** Exact frozen input expectations, not a source loader or production dependency. */
export function claimAcceptanceVectorData(): {
  vectors: {
    id: string;
    rawInput: {
      candidateInput: ClaimScenarioFixtureDraft;
      compositionInputs: unknown;
      serverCompositionInputs: unknown;
    };
  }[];
} {
  const vectors = frozenVectorPatches.map(({ id, patch }) => {
    const rawInput = structuredClone(frozenVectorBase) as Record<
      string,
      unknown
    >;
    for (const [pointer, value] of patch) {
      const keys = pointer.slice(1).split('/');
      let target = rawInput;
      for (const key of keys.slice(0, -1))
        target = target[key] as Record<string, unknown>;
      target[keys.at(-1)!] = structuredClone(value);
    }
    return { id, rawInput };
  });
  if (
    financialInputSha256(canonicalSerialize(vectors)) !== frozenVectorInputHash
  )
    throw new Error('VECTOR_PIN_DRIFT');
  return { vectors } as ReturnType<typeof claimAcceptanceVectorData>;
}
export function claimScenarioDraftFixture(
  complete = false,
): ClaimScenarioFixtureDraft {
  const base = frozenVectorBase as {
    candidateInput: ClaimScenarioFixtureDraft;
  };
  const terms = {
    commonLifecycleDraft: rowFixture(base.candidateInput.claims[0]!.lifecycle),
  };
  const opening = complete
    ? {
        worldId: 'WORLD_TEST_ONLY_FINANCIAL_CANDIDATE',
        openingIdentityReference: 'TEST_ONLY_PENDING_OPENING',
        openingIdentityHash: '1'.repeat(64),
        openingWorldVersion: '0',
        modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
        replayBinding: JSON.parse(
          canonicalSerialize(CURRENT_REPLAY_BINDING),
        ) as Record<string, unknown>,
        openingEpoch: 'TEST_ONLY_G0',
        valueDate: '2026-10-10',
        sourceIdentity: 'TEST_ONLY_SOURCE',
      }
    : null;
  return {
    schemaVersion: 'CLAIM_SCENARIO_SOURCE_DRAFT_INPUT_DESIGN_V1',
    sourceClass: 'CONSTRUCTED_SCENARIO',
    sourceVersion: 'TEST_ONLY_CLAIM_SOURCE_V1',
    previousVersionHash: null,
    creationReason: 'SCENARIO_RESTATEMENT_OF_UNADOPTED_PROPOSALS',
    inactiveOpening: opening,
    claims: CLAIM_SCENARIO_EXPECTATIONS.map(
      ([id, amount, issuer, holder], i) => {
        const lifecycle = structuredClone(terms.commonLifecycleDraft);
        if (complete) {
          (
            lifecycle.principalDue as Record<string, unknown>
          ).selectedRelativeSimDay = '140';
          (
            lifecycle.effectiveFrom as Record<string, unknown>
          ).actualOpeningEpoch = 'TEST_ONLY_G0';
        }
        const proof = complete
          ? {
              reference: 'TEST_ONLY_NOT_LEGAL_ADOPTION',
              sha256: '2'.repeat(64),
              bytes: '1',
              version: 'TEST_ONLY',
              pointer: '/TEST_ONLY',
            }
          : null;
        return {
          originalClaimSelector: id,
          financialClaimId: complete ? `TEST_CLAIM_${i}` : null,
          instrumentCode: complete ? 'TEST_CLEARING' : null,
          principal: amount,
          currency: 'GCU',
          legalIssuer: {
            entityId: `ENTITY_CENTRAL_BANK_${issuer}`,
            proof,
            meaning: 'TEST_ONLY_PROPOSED_ROLE',
          },
          legalHolder: {
            entityId: `ENTITY_CENTRAL_BANK_${holder}`,
            proof,
            meaning: 'TEST_ONLY_PROPOSED_ROLE',
          },
          lifecycle,
          sourceReferences: { classification: 'TEST_ONLY_NOT_ACTUAL_SOURCE' },
          mirrors: [
            {
              holdingId: complete ? `TEST_HOLDING_${i}_L` : null,
              role: 'LIABILITY',
              ownerId: `ENTITY_CENTRAL_BANK_${issuer}`,
              counterpartyId: `ENTITY_CENTRAL_BANK_${holder}`,
              amount,
              currency: 'GCU',
            },
            {
              holdingId: complete ? `TEST_HOLDING_${i}_A` : null,
              role: 'ASSET',
              ownerId: `ENTITY_CENTRAL_BANK_${holder}`,
              counterpartyId: `ENTITY_CENTRAL_BANK_${issuer}`,
              amount,
              currency: 'GCU',
            },
          ],
        };
      },
    ),
    originalStableIdLinks: CLAIM_SCENARIO_EXPECTATIONS.flatMap(([id]) =>
      ['actualTerms', 'actualLegalHolderIssuer'].map(
        (field) => `U2544::CLAIM::${id}::${field}`,
      ),
    ),
  };
}
export const unadoptedClaimSelectionFixture = () => ({
  status: 'DECLARED_UNADOPTED',
  observedSourceVersion: null,
  observedSourceHash: null,
  existingVersionBytes: null,
});
export async function claimBaselineRuleAdoptionFixture(): Promise<OwnerNonHostSourceAdoption> {
  const root = path.resolve(import.meta.dirname, '../..');
  return loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
}
/** Complete 70-country synthetic baseline for the existing parser, not another finance model. */
export function claimFinancialBaselineFixture(
  adoption: OwnerNonHostSourceAdoption,
): FormalFinancialOpeningContract {
  const rows: unknown[] = [];
  const date = '2026-10-10',
    version = 'TEST_ONLY_BASELINE';
  const ref = (v: unknown): FinancialSourceReference => {
    rows.push(v);
    return { documentId: 'TEST_BASELINE', pointer: '/' + (rows.length - 1) };
  };
  const countries: FinancialCountryInput[] = adoption.manifest.countries.map(
    (c, i) => {
      const cid = c.countryId,
        lc =
          'L' +
          String.fromCharCode(65 + Math.floor(i / 26)) +
          String.fromCharCode(65 + (i % 26)),
        roster = c.holderRoster;
      const B = Money.from(c.rawFinance.treasuryCentralBankBalance, lc),
        R = Money.from(c.rawFinance.bankReserveAssets, lc),
        A = Money.from(c.rawFinance.bankLoanAssets, lc);
      const holdings: FinancialCbHolding[] = [];
      for (const [category, amount, counterpartyId] of [
        [
          'TREASURY_GOVERNMENT_DEPOSIT',
          B.toCanonicalValue().amount,
          roster.treasury,
        ],
        [
          'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
          R.toCanonicalValue().amount,
          roster.bank,
        ],
      ] as const) {
        const body = {
          holdingId: 'TEST_H_' + cid + '_' + category,
          category,
          kind: 'CLAIM' as const,
          amount,
          currency: lc,
          localCurrencyPerUnit: '1',
          holderId: roster.centralBank,
          counterpartyId,
          usableStatus: 'TEST_ONLY',
        };
        holdings.push({
          ...body,
          source: ref({ countryId: cid, valueDate: date, ...body }),
        });
      }
      const categories = CENTRAL_BANK_OPENING_CATEGORIES.map(([category]) => {
        const disposition = holdings.some((h) => h.category === category)
          ? ('DECLARED' as const)
          : ('NO_DECLARED_INSTRUMENT' as const);
        return {
          category,
          disposition,
          source: ref({ countryId: cid, category, disposition }),
        };
      });
      const summary = {
        countryId: cid,
        version,
        valueDate: date,
        categories: categories
          .map(({ category, disposition }) => ({ category, disposition }))
          .sort((a, b) => (a.category < b.category ? -1 : 1)),
        holdingIds: holdings.map((h) => h.holdingId).sort(),
      };
      const loan = {
        loanId: 'TEST_LOAN_' + cid,
        borrowerId: roster.operator,
        amount: A.toCanonicalValue().amount,
        currency: lc,
      };
      return {
        countryId: cid,
        localCurrency: lc,
        openingFx: {
          localCurrencyPerGcu: '1',
          version,
          valueDate: date,
          source: ref({
            countryId: cid,
            localCurrency: lc,
            localCurrencyPerGcu: '1',
            version,
            valueDate: date,
          }),
        },
        cbRegister: {
          version,
          valueDate: date,
          source: ref(summary),
          categories,
          holdings,
        },
        bankLoans: A.amount.isZero()
          ? []
          : [
              {
                ...loan,
                source: ref({ countryId: cid, valueDate: date, ...loan }),
              },
            ],
      };
    },
  );
  const bytes = canonicalSerialize(rows);
  return parseFormalFinancialOpeningContract(
    {
      schemaVersion: 'formal-financial-opening-input-v1',
      evidenceKind: 'MECHANISM_TEST_VECTOR',
      worldId: 'WORLD_TEST_ONLY_FINANCIAL_CANDIDATE',
      sourceId: 'SOURCE_TEST_ONLY_CLAIMS',
      sourceVersion: version,
      valueDate: date,
      ownerReceiptSha256: adoption.ownerPolicy.receiptSha256,
      adoptionManifestFingerprint: adoption.manifestFingerprint,
      financeSha256: adoption.trustedSource.financeSha256,
      documents: [
        {
          documentId: 'TEST_BASELINE',
          sourcePath: 'test-only/baseline.json',
          version,
          valueDate: date,
          bytes,
          sha256: financialInputSha256(bytes),
        },
      ],
      countries,
    },
    adoption,
  );
}
