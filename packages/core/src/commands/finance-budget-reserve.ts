import { Money } from '../numeric/money.js';
import {
  assertWorldDecimalResult,
  canonicalDecimal,
  type WorldDecimalValue,
} from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import { canonicalSha256, type Sha256Hex } from './command.js';
import {
  assertFiscalReferenceMatch,
  sameCurrency,
} from '../engine-kernels/fiscal-budget-lineage-validation.js';

/**
 * RF-D01 V2.1: inert declaration reconciliation only. No source admission,
 * current-seat proof, global command/event registration, SQL or durable write.
 * RF-D02/RF-D03 remain runtime blockers. Hashes here are identity, not evidence.
 * Shape/types below mirror the E-approved schema aad35868... exactly.
 */
export type ReserveRef = string;
export type ReserveAmount = string;
export type ReserveCounter = string;
export type ReserveDigest = string;
export type ReserveScope = {
  readonly worldId: ReserveRef;
  readonly countryId: ReserveRef;
  readonly currency: ReserveCurrency;
};
export type ReserveHead = {
  readonly worldVersion: ReserveCounter;
  readonly eventSequence: ReserveCounter;
  readonly simTime: ReserveCounter;
};
export type ReserveSource = {
  readonly sourceId: ReserveRef;
  readonly revision: ReserveRef;
  readonly seedRef: ReserveRef;
  readonly admissionRef: ReserveRef;
  readonly replayBindingRef: ReserveRef;
  readonly locator: string;
  readonly digest: ReserveDigest;
  readonly producerRef: ReserveRef;
};
export type ReserveSourceRecord = {
  readonly sourceRef: ReserveRef;
  readonly sourceId: ReserveRef;
  readonly sourceRevision: ReserveRef;
  readonly scope: ReserveScope;
  readonly kind:
    | 'BASELINE'
    | 'BUDGET_LINE_CREATION'
    | 'EMPTY_BUDGET_SET'
    | 'APPROPRIATION'
    | 'COMMITMENT'
    | 'RESERVATION'
    | 'PAYMENT'
    | 'LEGAL_EFFECT'
    | 'APPROVAL_RULE'
    | 'APPROVAL_SET'
    | 'FINANCE_PERMISSION'
    | 'NO_BUDGET_EFFECT'
    | 'BUDGET_LINE_INITIALIZATION'
    | 'LEGACY_DISPOSITION'
    | 'ORIGIN_NO_PCR_EFFECT';
  readonly subjectRef: ReserveRef;
  readonly subjectRevision: ReserveRef;
  readonly bindingRef: ReserveRef;
  readonly amount: ReserveAmount | null;
  readonly coveredLineRefs: readonly ReserveRef[];
  readonly at: ReserveHead;
  readonly locator: string;
  readonly digest: ReserveDigest;
  readonly eventRef: ReserveRef | null;
  readonly producerRef: ReserveRef;
  readonly lineIdentityBindings: readonly {
    readonly budgetLineRef: ReserveRef;
    readonly entityRef: ReserveRef;
    readonly envelopeRef: ReserveRef;
    readonly effectivePeriodRef: ReserveRef;
  }[];
};
export type ReserveApprovedRevision = {
  readonly revisionRef: ReserveRef;
  readonly predecessorRevisionRef: ReserveRef | null;
  readonly amount: ReserveAmount;
  readonly approvalRuleRef: ReserveRef;
  readonly approvalSetRef: ReserveRef;
  readonly sourceRef: ReserveRef;
};
export type ReserveOrigin =
  | {
      readonly kind: 'DIRECT_COMMITMENT';
      readonly amount: ReserveAmount;
      readonly sourceRef: ReserveRef;
    }
  | {
      readonly kind: 'RESERVATION_CONSUMPTION';
      readonly amount: ReserveAmount;
      readonly sourceRef: ReserveRef;
      readonly consumptionFactRef: ReserveRef;
    };
export type ReserveCommitment = {
  readonly commitmentRef: ReserveRef;
  readonly predecessorCommitmentRef: ReserveRef | null;
  readonly evidenceRef: ReserveRef;
  readonly grossAmount: ReserveAmount;
  readonly outstandingAmount: ReserveAmount;
  readonly grossOrigins: readonly ReserveOrigin[];
  readonly linkedPaymentAllocationRefs: readonly ReserveRef[];
  readonly releaseFactRefs: readonly ReserveRef[];
};
export type ReservePayload = {
  readonly budgetLineRef: ReserveRef;
  readonly amount: ReserveAmount;
  readonly currency: ReserveCurrency;
  readonly expectedBudgetRevision: ReserveRef;
  readonly expectedCutoff: ReserveHead;
};
export type ReserveIntent = {
  readonly commandId: ReserveRef;
  readonly idempotencyKey: ReserveRef;
  readonly payload: ReservePayload;
};
export type ReserveReservation = {
  readonly reservationRef: ReserveRef;
  readonly predecessorReservationRef: ReserveRef | null;
  readonly originAmount: ReserveAmount;
  readonly activeAmount: ReserveAmount;
  readonly sourceRef: ReserveRef;
  readonly originIntent: ReserveIntent;
  readonly releaseFactRefs: readonly ReserveRef[];
  readonly consumeFactRefs: readonly ReserveRef[];
};
export type ReserveLine = {
  readonly budgetLineRef: ReserveRef;
  readonly approvedRevision: ReserveApprovedRevision;
  readonly lineRevision: ReserveCounter;
  readonly commitmentHeadRef: ReserveRef | null;
  readonly commitments: readonly ReserveCommitment[];
  readonly reservationHeadRef: ReserveRef | null;
  readonly reservations: readonly ReserveReservation[];
  readonly directPaymentAllocationRefs: readonly ReserveRef[];
  readonly assertedTotals: {
    readonly paid: ReserveAmount;
    readonly outstanding: ReserveAmount;
    readonly reserved: ReserveAmount;
  };
  readonly identity: {
    readonly entityRef: ReserveRef;
    readonly envelopeRef: ReserveRef;
    readonly effectivePeriodRef: ReserveRef;
  };
};
export type ReserveBaselineOrigin =
  | {
      readonly kind: 'CARRIED_HISTORY';
      readonly lineageSourceRefs: readonly ReserveRef[];
      readonly importMappingSourceRefs: readonly ReserveRef[];
    }
  | {
      readonly kind: 'CREATED_EMPTY';
      readonly creationSourceRef: ReserveRef;
      readonly emptySetSourceRef: ReserveRef;
      readonly initialization: ReserveInitialization;
      readonly legacyDisposition: ReserveLegacyDisposition;
      readonly originCoverage: ReserveOriginCoverage;
    };
export type ReserveBaseline = {
  readonly baselineRef: ReserveRef;
  readonly sourceRef: ReserveRef;
  readonly at: ReserveHead;
  readonly origin: ReserveBaselineOrigin;
  readonly coveredLineRefs: readonly ReserveRef[];
  readonly lines: readonly ReserveLine[];
};
export type ReserveAllocation =
  | {
      readonly kind: 'DIRECT_BUDGET_PAYMENT';
      readonly allocationRef: ReserveRef;
      readonly budgetLineRef: ReserveRef;
      readonly amount: ReserveAmount;
    }
  | {
      readonly kind: 'COMMITMENT_LINKED_PAYMENT';
      readonly allocationRef: ReserveRef;
      readonly budgetLineRef: ReserveRef;
      readonly commitmentRef: ReserveRef;
      readonly amount: ReserveAmount;
    };
export type ReserveReceipt = {
  readonly receiptRef: ReserveRef;
  readonly paymentEvidenceRef: ReserveRef;
  readonly totalAmount: ReserveAmount;
  readonly sourceRef: ReserveRef;
  readonly at: ReserveHead;
  readonly allocations: readonly ReserveAllocation[];
};
export type ReserveRule = {
  readonly ruleRef: ReserveRef;
  readonly revision: ReserveRef;
  readonly subjectKind:
    | 'BUDGET_LINE'
    | 'COMMITMENT'
    | 'RESERVATION'
    | 'LEGAL_EFFECT'
    | 'RESERVE_INTENT';
  readonly subjectRef: ReserveRef;
  readonly captainRequirement: 'REQUIRED' | 'NOT_REQUIRED' | 'UNKNOWN';
  readonly sourceRef: ReserveRef;
  readonly at: ReserveHead;
};
export type ReserveDecision = {
  readonly office: 'FINANCE' | 'CAPTAIN';
  readonly actorRef: ReserveRef;
  readonly decision: 'APPROVED' | 'REVOKED' | 'REJECTED' | 'PENDING';
};
export type ReserveApprovalSet = {
  readonly setRef: ReserveRef;
  readonly ruleRef: ReserveRef;
  readonly ruleRevision: ReserveRef;
  readonly subjectRef: ReserveRef;
  readonly subjectRevision: ReserveRef;
  readonly decisions: readonly ReserveDecision[];
  readonly sourceRef: ReserveRef;
  readonly at: ReserveHead;
  readonly binding: ReserveApprovalBinding;
};
export type ReserveLineChange = {
  readonly budgetLineRef: ReserveRef;
  readonly lineBeforeRevision: ReserveCounter;
  readonly lineAfterRevision: ReserveCounter;
};
export type ReservePermission = {
  readonly actorRef: ReserveRef;
  readonly office: 'FINANCE';
  readonly domain: 'FINANCE_BUDGET';
  readonly countryId: ReserveRef;
  readonly seatRevision: ReserveRef;
  readonly sourceRef: ReserveRef;
  readonly reservationRuleRef: ReserveRef;
  readonly reservationApprovalSetRef: ReserveRef;
};
export type ReserveLegalEffect =
  | {
      readonly kind: 'COMMITMENT_RELEASE';
      readonly effectRef: ReserveRef;
      readonly budgetLineRef: ReserveRef;
      readonly subjectRef: ReserveRef;
      readonly amount: ReserveAmount;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly approvalRuleRef: ReserveRef;
      readonly approvalSetRef: ReserveRef;
      readonly at: ReserveHead;
    }
  | {
      readonly kind: 'RESERVATION_RELEASE';
      readonly effectRef: ReserveRef;
      readonly budgetLineRef: ReserveRef;
      readonly subjectRef: ReserveRef;
      readonly amount: ReserveAmount;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly approvalRuleRef: ReserveRef;
      readonly approvalSetRef: ReserveRef;
      readonly at: ReserveHead;
    }
  | {
      readonly kind: 'APPROPRIATION_REVISION';
      readonly effectRef: ReserveRef;
      readonly budgetLineRef: ReserveRef;
      readonly subjectRef: ReserveRef;
      readonly amount: ReserveAmount;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly approvalRuleRef: ReserveRef;
      readonly approvalSetRef: ReserveRef;
      readonly at: ReserveHead;
    }
  | {
      readonly kind: 'RESERVATION_CONSUMPTION';
      readonly effectRef: ReserveRef;
      readonly budgetLineRef: ReserveRef;
      readonly subjectRef: ReserveRef;
      readonly amount: ReserveAmount;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly approvalRuleRef: ReserveRef;
      readonly approvalSetRef: ReserveRef;
      readonly at: ReserveHead;
      readonly targetCommitmentRef: ReserveRef;
    };
export type ReserveEvent =
  | {
      readonly kind: 'COMMITMENT_RECORDED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: { readonly commitmentRef: ReserveRef };
    }
  | {
      readonly kind: 'PAYMENT_SETTLED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: { readonly receiptRef: ReserveRef };
    }
  | {
      readonly kind: 'COMMITMENT_RELEASED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: { readonly effectRef: ReserveRef };
    }
  | {
      readonly kind: 'RESERVATION_RECORDED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: { readonly reservationRef: ReserveRef };
    }
  | {
      readonly kind: 'RESERVATION_RELEASED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: { readonly effectRef: ReserveRef };
    }
  | {
      readonly kind: 'RESERVATION_CONSUMED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: {
        readonly effectRef: ReserveRef;
        readonly targetCommitmentRef: ReserveRef;
      };
    }
  | {
      readonly kind: 'APPROPRIATION_REVISED';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: {
        readonly effectRef: ReserveRef;
        readonly revisionRef: ReserveRef;
      };
    }
  | {
      readonly kind: 'NO_BUDGET_EFFECT';
      readonly eventRef: ReserveRef;
      readonly frameRef: ReserveRef;
      readonly causeRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly lineChanges: readonly ReserveLineChange[];
      readonly body: { readonly classificationRevision: ReserveRef };
    };
export type ReserveFrame = {
  readonly frameRef: ReserveRef;
  readonly previousFrameRef: ReserveRef;
  readonly before: ReserveHead;
  readonly after: ReserveHead;
  readonly events: readonly ReserveEvent[];
};
export type ReserveHistory = {
  readonly fromExclusive: ReserveHead;
  readonly toInclusive: ReserveHead;
  readonly startFrameRef: ReserveRef;
  readonly endFrameRef: ReserveRef;
  readonly frames: readonly ReserveFrame[];
};
export type ReserveFacts = {
  readonly sources: readonly ReserveSourceRecord[];
  readonly paymentReceipts: readonly ReserveReceipt[];
  readonly legalEffects: readonly ReserveLegalEffect[];
  readonly approvalRules: readonly ReserveRule[];
  readonly approvalSets: readonly ReserveApprovalSet[];
  readonly commitmentRecords: readonly {
    readonly budgetLineRef: ReserveRef;
    readonly record: ReserveCommitment;
  }[];
  readonly reservationRecords: readonly {
    readonly budgetLineRef: ReserveRef;
    readonly record: ReserveReservation;
  }[];
  readonly appropriationRevisions: readonly {
    readonly budgetLineRef: ReserveRef;
    readonly record: ReserveApprovedRevision;
  }[];
};
export type ReserveApprovalBinding =
  | {
      readonly kind: 'APPROPRIATION';
      readonly budgetLineRef: ReserveRef;
      readonly revisionRef: ReserveRef;
      readonly amount: ReserveAmount;
    }
  | { readonly kind: 'RESERVE_INTENT'; readonly intent: ReserveIntent }
  | {
      readonly kind: 'LEGAL_EFFECT';
      readonly effectRef: ReserveRef;
      readonly effectKind:
        | 'COMMITMENT_RELEASE'
        | 'RESERVATION_RELEASE'
        | 'RESERVATION_CONSUMPTION';
      readonly subjectRef: ReserveRef;
      readonly amount: ReserveAmount;
      readonly causeRef: ReserveRef;
      readonly targetCommitmentRef: ReserveRef | null;
    };
export type ReserveInitialization = {
  readonly initializationRef: ReserveRef;
  readonly sourceRef: ReserveRef;
  readonly budgetLineRef: ReserveRef;
  readonly approvedRevisionRef: ReserveRef;
  readonly at: ReserveHead;
  readonly initialPaid: '0';
  readonly initialOutstanding: '0';
  readonly initialReserved: '0';
};
export type ReserveLegacyDisposition = {
  readonly kind: 'NO_IMPORTED_STATE_IN_THIS_LINE';
  readonly sourceRef: ReserveRef;
};
export type ReserveOriginEvent =
  | {
      readonly kind: 'APPROPRIATION_APPROVAL';
      readonly eventRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly body: { readonly revisionRef: ReserveRef };
    }
  | {
      readonly kind: 'BUDGET_LINE_INITIALIZATION';
      readonly eventRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly body: { readonly initializationRef: ReserveRef };
    }
  | {
      readonly kind: 'NO_PCR_EFFECT';
      readonly eventRef: ReserveRef;
      readonly sourceRef: ReserveRef;
      readonly at: ReserveHead;
      readonly body: { readonly classificationRevision: ReserveRef };
    };
export type ReserveOriginFrame = {
  readonly frameRef: ReserveRef;
  readonly previousFrameRef: ReserveRef;
  readonly before: ReserveHead;
  readonly after: ReserveHead;
  readonly events: readonly ReserveOriginEvent[];
};
export type ReserveOriginCoverage = {
  readonly fromInclusive: ReserveHead;
  readonly toInclusive: ReserveHead;
  readonly startFrameRef: ReserveRef;
  readonly endFrameRef: ReserveRef;
  readonly frames: readonly ReserveOriginFrame[];
};
export type ReserveCurrency = string;
export type FinanceBudgetReserveInput = {
  readonly schemaVersion: 'RF_D01_INERT_INPUT_V2_1';
  readonly evidenceClass: 'UNADMITTED_INERT_INPUT' | 'TEST_ONLY';
  readonly scope: ReserveScope;
  readonly source: ReserveSource;
  readonly cutoff: ReserveHead;
  readonly baseline: ReserveBaseline;
  readonly facts: ReserveFacts;
  readonly history: ReserveHistory;
  readonly intent: ReserveIntent;
  readonly permissionContext: ReservePermission;
};

interface Shape {
  readonly $ref?: string;
  readonly $defs?: Readonly<Record<string, Shape>>;
  readonly type?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly oneOf?: readonly Shape[];
  readonly anyOf?: readonly Shape[];
  readonly properties?: Readonly<Record<string, Shape>>;
  readonly required?: readonly string[];
  readonly items?: Shape;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
}

const INPUT_SCHEMA = JSON.parse(
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:econmind:design:rf-d01:inert-input:v2.1","title":"RF-D01 V2 closed inert reconciliation input","$comment":"DESIGN ONLY. Structure is not source admission, legality, history completeness, permission or runtime authority. Normative semantic rules: RF_D01_CLOSED_CONTRACT.md. Strict lexical forms are proposed; future implementation must map existing branded IDs/Money losslessly and stop for incompatible shapes, not widen runtime contracts. Amounts and heads never pass JS Number. NOT an executable validator or production-source constructor. Amendment 2 incorporates E D-source boundary: producer identity and per-line entity/envelope/effective-period declarations; CREATED_EMPTY requires explicit sourced initialization, scoped legacy disposition and continuous creation-origin-to-baseline coverage, not archive absence. No canonical producer/record is issued by this schema.","type":"object","additionalProperties":false,"required":["schemaVersion","evidenceClass","scope","source","cutoff","baseline","facts","history","intent","permissionContext"],"properties":{"schemaVersion":{"const":"RF_D01_INERT_INPUT_V2_1"},"evidenceClass":{"enum":["UNADMITTED_INERT_INPUT","TEST_ONLY"]},"scope":{"$ref":"#/$defs/Scope"},"source":{"$ref":"#/$defs/Source"},"cutoff":{"$ref":"#/$defs/Head"},"baseline":{"$ref":"#/$defs/Baseline"},"facts":{"$ref":"#/$defs/Facts"},"history":{"$ref":"#/$defs/History"},"intent":{"$ref":"#/$defs/Intent"},"permissionContext":{"$ref":"#/$defs/Permission"}},"$defs":{"Ref":{"type":"string","minLength":1,"maxLength":256,"pattern":"^[A-Za-z0-9][A-Za-z0-9_.:/-]*$"},"Amount":{"type":"string","pattern":"^(0|[1-9][0-9]*)(\\\\.[0-9]*[1-9])?$"},"Counter":{"type":"string","pattern":"^(0|[1-9][0-9]*)$"},"Digest":{"type":"string","pattern":"^[a-f0-9]{64}$"},"Scope":{"type":"object","additionalProperties":false,"required":["worldId","countryId","currency"],"properties":{"worldId":{"$ref":"#/$defs/Ref"},"countryId":{"$ref":"#/$defs/Ref"},"currency":{"$ref":"#/$defs/Currency"}}},"Head":{"type":"object","additionalProperties":false,"required":["worldVersion","eventSequence","simTime"],"properties":{"worldVersion":{"$ref":"#/$defs/Counter"},"eventSequence":{"$ref":"#/$defs/Counter"},"simTime":{"$ref":"#/$defs/Counter"}}},"Source":{"type":"object","additionalProperties":false,"required":["sourceId","revision","seedRef","admissionRef","replayBindingRef","locator","digest","producerRef"],"properties":{"sourceId":{"$ref":"#/$defs/Ref"},"revision":{"$ref":"#/$defs/Ref"},"seedRef":{"$ref":"#/$defs/Ref"},"admissionRef":{"$ref":"#/$defs/Ref"},"replayBindingRef":{"$ref":"#/$defs/Ref"},"locator":{"type":"string","minLength":1},"digest":{"$ref":"#/$defs/Digest"},"producerRef":{"$ref":"#/$defs/Ref"}}},"SourceRecord":{"type":"object","additionalProperties":false,"required":["sourceRef","sourceId","sourceRevision","scope","kind","subjectRef","subjectRevision","bindingRef","amount","coveredLineRefs","at","locator","digest","eventRef","producerRef","lineIdentityBindings"],"properties":{"sourceRef":{"$ref":"#/$defs/Ref"},"sourceId":{"$ref":"#/$defs/Ref"},"sourceRevision":{"$ref":"#/$defs/Ref"},"scope":{"$ref":"#/$defs/Scope"},"kind":{"enum":["BASELINE","BUDGET_LINE_CREATION","EMPTY_BUDGET_SET","APPROPRIATION","COMMITMENT","RESERVATION","PAYMENT","LEGAL_EFFECT","APPROVAL_RULE","APPROVAL_SET","FINANCE_PERMISSION","NO_BUDGET_EFFECT","BUDGET_LINE_INITIALIZATION","LEGACY_DISPOSITION","ORIGIN_NO_PCR_EFFECT"]},"subjectRef":{"$ref":"#/$defs/Ref"},"subjectRevision":{"$ref":"#/$defs/Ref"},"bindingRef":{"$ref":"#/$defs/Ref"},"amount":{"anyOf":[{"$ref":"#/$defs/Amount"},{"type":"null"}]},"coveredLineRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}},"at":{"$ref":"#/$defs/Head"},"locator":{"type":"string","minLength":1},"digest":{"$ref":"#/$defs/Digest"},"eventRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]},"producerRef":{"$ref":"#/$defs/Ref"},"lineIdentityBindings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["budgetLineRef","entityRef","envelopeRef","effectivePeriodRef"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"entityRef":{"$ref":"#/$defs/Ref"},"envelopeRef":{"$ref":"#/$defs/Ref"},"effectivePeriodRef":{"$ref":"#/$defs/Ref"}}}}}},"ApprovedRevision":{"type":"object","additionalProperties":false,"required":["revisionRef","predecessorRevisionRef","amount","approvalRuleRef","approvalSetRef","sourceRef"],"properties":{"revisionRef":{"$ref":"#/$defs/Ref"},"predecessorRevisionRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]},"amount":{"$ref":"#/$defs/Amount"},"approvalRuleRef":{"$ref":"#/$defs/Ref"},"approvalSetRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"}}},"Origin":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","amount","sourceRef"],"properties":{"kind":{"const":"DIRECT_COMMITMENT"},"amount":{"$ref":"#/$defs/Amount"},"sourceRef":{"$ref":"#/$defs/Ref"}}},{"type":"object","additionalProperties":false,"required":["kind","amount","sourceRef","consumptionFactRef"],"properties":{"kind":{"const":"RESERVATION_CONSUMPTION"},"amount":{"$ref":"#/$defs/Amount"},"sourceRef":{"$ref":"#/$defs/Ref"},"consumptionFactRef":{"$ref":"#/$defs/Ref"}}}]},"Commitment":{"type":"object","additionalProperties":false,"required":["commitmentRef","predecessorCommitmentRef","evidenceRef","grossAmount","outstandingAmount","grossOrigins","linkedPaymentAllocationRefs","releaseFactRefs"],"properties":{"commitmentRef":{"$ref":"#/$defs/Ref"},"predecessorCommitmentRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]},"evidenceRef":{"$ref":"#/$defs/Ref"},"grossAmount":{"$ref":"#/$defs/Amount"},"outstandingAmount":{"$ref":"#/$defs/Amount"},"grossOrigins":{"type":"array","minItems":1,"maxItems":1,"items":{"$ref":"#/$defs/Origin"}},"linkedPaymentAllocationRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}},"releaseFactRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}}}},"Payload":{"type":"object","additionalProperties":false,"required":["budgetLineRef","amount","currency","expectedBudgetRevision","expectedCutoff"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"},"currency":{"$ref":"#/$defs/Currency"},"expectedBudgetRevision":{"$ref":"#/$defs/Ref"},"expectedCutoff":{"$ref":"#/$defs/Head"}}},"Intent":{"type":"object","additionalProperties":false,"required":["commandId","idempotencyKey","payload"],"properties":{"commandId":{"$ref":"#/$defs/Ref"},"idempotencyKey":{"$ref":"#/$defs/Ref"},"payload":{"$ref":"#/$defs/Payload"}}},"Reservation":{"type":"object","additionalProperties":false,"required":["reservationRef","predecessorReservationRef","originAmount","activeAmount","sourceRef","originIntent","releaseFactRefs","consumeFactRefs"],"properties":{"reservationRef":{"$ref":"#/$defs/Ref"},"predecessorReservationRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]},"originAmount":{"$ref":"#/$defs/Amount"},"activeAmount":{"$ref":"#/$defs/Amount"},"sourceRef":{"$ref":"#/$defs/Ref"},"originIntent":{"$ref":"#/$defs/Intent"},"releaseFactRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}},"consumeFactRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}}}},"Line":{"type":"object","additionalProperties":false,"required":["budgetLineRef","approvedRevision","lineRevision","commitmentHeadRef","commitments","reservationHeadRef","reservations","directPaymentAllocationRefs","assertedTotals","identity"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"approvedRevision":{"$ref":"#/$defs/ApprovedRevision"},"lineRevision":{"$ref":"#/$defs/Counter"},"commitmentHeadRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]},"commitments":{"type":"array","items":{"$ref":"#/$defs/Commitment"}},"reservationHeadRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]},"reservations":{"type":"array","items":{"$ref":"#/$defs/Reservation"}},"directPaymentAllocationRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}},"assertedTotals":{"type":"object","additionalProperties":false,"required":["paid","outstanding","reserved"],"properties":{"paid":{"$ref":"#/$defs/Amount"},"outstanding":{"$ref":"#/$defs/Amount"},"reserved":{"$ref":"#/$defs/Amount"}}},"identity":{"type":"object","additionalProperties":false,"required":["entityRef","envelopeRef","effectivePeriodRef"],"properties":{"entityRef":{"$ref":"#/$defs/Ref"},"envelopeRef":{"$ref":"#/$defs/Ref"},"effectivePeriodRef":{"$ref":"#/$defs/Ref"}}}}},"BaselineOrigin":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","lineageSourceRefs","importMappingSourceRefs"],"properties":{"kind":{"const":"CARRIED_HISTORY"},"lineageSourceRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}},"importMappingSourceRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}}}},{"type":"object","additionalProperties":false,"required":["kind","creationSourceRef","emptySetSourceRef","initialization","legacyDisposition","originCoverage"],"properties":{"kind":{"const":"CREATED_EMPTY"},"creationSourceRef":{"$ref":"#/$defs/Ref"},"emptySetSourceRef":{"$ref":"#/$defs/Ref"},"initialization":{"$ref":"#/$defs/Initialization"},"legacyDisposition":{"$ref":"#/$defs/LegacyDisposition"},"originCoverage":{"$ref":"#/$defs/OriginCoverage"}}}]},"Baseline":{"type":"object","additionalProperties":false,"required":["baselineRef","sourceRef","at","origin","coveredLineRefs","lines"],"properties":{"baselineRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"origin":{"$ref":"#/$defs/BaselineOrigin"},"coveredLineRefs":{"type":"array","items":{"$ref":"#/$defs/Ref"}},"lines":{"type":"array","items":{"$ref":"#/$defs/Line"}}}},"Allocation":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","allocationRef","budgetLineRef","amount"],"properties":{"kind":{"const":"DIRECT_BUDGET_PAYMENT"},"allocationRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"}}},{"type":"object","additionalProperties":false,"required":["kind","allocationRef","budgetLineRef","commitmentRef","amount"],"properties":{"kind":{"const":"COMMITMENT_LINKED_PAYMENT"},"allocationRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"commitmentRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"}}}]},"Receipt":{"type":"object","additionalProperties":false,"required":["receiptRef","paymentEvidenceRef","totalAmount","sourceRef","at","allocations"],"properties":{"receiptRef":{"$ref":"#/$defs/Ref"},"paymentEvidenceRef":{"$ref":"#/$defs/Ref"},"totalAmount":{"$ref":"#/$defs/Amount"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"allocations":{"type":"array","items":{"$ref":"#/$defs/Allocation"}}}},"Rule":{"type":"object","additionalProperties":false,"required":["ruleRef","revision","subjectKind","subjectRef","captainRequirement","sourceRef","at"],"properties":{"ruleRef":{"$ref":"#/$defs/Ref"},"revision":{"$ref":"#/$defs/Ref"},"subjectKind":{"enum":["BUDGET_LINE","COMMITMENT","RESERVATION","LEGAL_EFFECT","RESERVE_INTENT"]},"subjectRef":{"$ref":"#/$defs/Ref"},"captainRequirement":{"enum":["REQUIRED","NOT_REQUIRED","UNKNOWN"]},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"}}},"Decision":{"type":"object","additionalProperties":false,"required":["office","actorRef","decision"],"properties":{"office":{"enum":["FINANCE","CAPTAIN"]},"actorRef":{"$ref":"#/$defs/Ref"},"decision":{"enum":["APPROVED","REVOKED","REJECTED","PENDING"]}}},"ApprovalSet":{"type":"object","additionalProperties":false,"required":["setRef","ruleRef","ruleRevision","subjectRef","subjectRevision","decisions","sourceRef","at","binding"],"properties":{"setRef":{"$ref":"#/$defs/Ref"},"ruleRef":{"$ref":"#/$defs/Ref"},"ruleRevision":{"$ref":"#/$defs/Ref"},"subjectRef":{"$ref":"#/$defs/Ref"},"subjectRevision":{"$ref":"#/$defs/Ref"},"decisions":{"type":"array","items":{"$ref":"#/$defs/Decision"}},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"binding":{"$ref":"#/$defs/ApprovalBinding"}}},"LineChange":{"type":"object","additionalProperties":false,"required":["budgetLineRef","lineBeforeRevision","lineAfterRevision"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"lineBeforeRevision":{"$ref":"#/$defs/Counter"},"lineAfterRevision":{"$ref":"#/$defs/Counter"}}},"Permission":{"type":"object","additionalProperties":false,"required":["actorRef","office","domain","countryId","seatRevision","sourceRef","reservationRuleRef","reservationApprovalSetRef"],"properties":{"actorRef":{"$ref":"#/$defs/Ref"},"office":{"const":"FINANCE"},"domain":{"const":"FINANCE_BUDGET"},"countryId":{"$ref":"#/$defs/Ref"},"seatRevision":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"reservationRuleRef":{"$ref":"#/$defs/Ref"},"reservationApprovalSetRef":{"$ref":"#/$defs/Ref"}}},"LegalEffect":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","effectRef","budgetLineRef","subjectRef","amount","causeRef","sourceRef","approvalRuleRef","approvalSetRef","at"],"properties":{"kind":{"const":"COMMITMENT_RELEASE"},"effectRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"subjectRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"approvalRuleRef":{"$ref":"#/$defs/Ref"},"approvalSetRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"}}},{"type":"object","additionalProperties":false,"required":["kind","effectRef","budgetLineRef","subjectRef","amount","causeRef","sourceRef","approvalRuleRef","approvalSetRef","at"],"properties":{"kind":{"const":"RESERVATION_RELEASE"},"effectRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"subjectRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"approvalRuleRef":{"$ref":"#/$defs/Ref"},"approvalSetRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"}}},{"type":"object","additionalProperties":false,"required":["kind","effectRef","budgetLineRef","subjectRef","amount","causeRef","sourceRef","approvalRuleRef","approvalSetRef","at"],"properties":{"kind":{"const":"APPROPRIATION_REVISION"},"effectRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"subjectRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"approvalRuleRef":{"$ref":"#/$defs/Ref"},"approvalSetRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"}}},{"type":"object","additionalProperties":false,"required":["kind","effectRef","budgetLineRef","subjectRef","amount","causeRef","sourceRef","approvalRuleRef","approvalSetRef","at","targetCommitmentRef"],"properties":{"kind":{"const":"RESERVATION_CONSUMPTION"},"effectRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"subjectRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"approvalRuleRef":{"$ref":"#/$defs/Ref"},"approvalSetRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"targetCommitmentRef":{"$ref":"#/$defs/Ref"}}}]},"Event":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"COMMITMENT_RECORDED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["commitmentRef"],"properties":{"commitmentRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"PAYMENT_SETTLED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["receiptRef"],"properties":{"receiptRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"COMMITMENT_RELEASED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["effectRef"],"properties":{"effectRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"RESERVATION_RECORDED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["reservationRef"],"properties":{"reservationRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"RESERVATION_RELEASED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["effectRef"],"properties":{"effectRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"RESERVATION_CONSUMED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["effectRef","targetCommitmentRef"],"properties":{"effectRef":{"$ref":"#/$defs/Ref"},"targetCommitmentRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"APPROPRIATION_REVISED"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["effectRef","revisionRef"],"properties":{"effectRef":{"$ref":"#/$defs/Ref"},"revisionRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","frameRef","causeRef","sourceRef","at","lineChanges","body"],"properties":{"kind":{"const":"NO_BUDGET_EFFECT"},"eventRef":{"$ref":"#/$defs/Ref"},"frameRef":{"$ref":"#/$defs/Ref"},"causeRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"lineChanges":{"type":"array","items":{"$ref":"#/$defs/LineChange"}},"body":{"type":"object","additionalProperties":false,"required":["classificationRevision"],"properties":{"classificationRevision":{"$ref":"#/$defs/Ref"}}}}}]},"Frame":{"type":"object","additionalProperties":false,"required":["frameRef","previousFrameRef","before","after","events"],"properties":{"frameRef":{"$ref":"#/$defs/Ref"},"previousFrameRef":{"$ref":"#/$defs/Ref"},"before":{"$ref":"#/$defs/Head"},"after":{"$ref":"#/$defs/Head"},"events":{"type":"array","items":{"$ref":"#/$defs/Event"}}}},"History":{"type":"object","additionalProperties":false,"required":["fromExclusive","toInclusive","startFrameRef","endFrameRef","frames"],"properties":{"fromExclusive":{"$ref":"#/$defs/Head"},"toInclusive":{"$ref":"#/$defs/Head"},"startFrameRef":{"$ref":"#/$defs/Ref"},"endFrameRef":{"$ref":"#/$defs/Ref"},"frames":{"type":"array","items":{"$ref":"#/$defs/Frame"}}}},"Facts":{"type":"object","additionalProperties":false,"required":["sources","paymentReceipts","legalEffects","approvalRules","approvalSets","commitmentRecords","reservationRecords","appropriationRevisions"],"properties":{"sources":{"type":"array","items":{"$ref":"#/$defs/SourceRecord"}},"paymentReceipts":{"type":"array","items":{"$ref":"#/$defs/Receipt"}},"legalEffects":{"type":"array","items":{"$ref":"#/$defs/LegalEffect"}},"approvalRules":{"type":"array","items":{"$ref":"#/$defs/Rule"}},"approvalSets":{"type":"array","items":{"$ref":"#/$defs/ApprovalSet"}},"commitmentRecords":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["budgetLineRef","record"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"record":{"$ref":"#/$defs/Commitment"}}}},"reservationRecords":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["budgetLineRef","record"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"record":{"$ref":"#/$defs/Reservation"}}}},"appropriationRevisions":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["budgetLineRef","record"],"properties":{"budgetLineRef":{"$ref":"#/$defs/Ref"},"record":{"$ref":"#/$defs/ApprovedRevision"}}}}}},"ApprovalBinding":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","budgetLineRef","revisionRef","amount"],"properties":{"kind":{"const":"APPROPRIATION"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"revisionRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"}}},{"type":"object","additionalProperties":false,"required":["kind","intent"],"properties":{"kind":{"const":"RESERVE_INTENT"},"intent":{"$ref":"#/$defs/Intent"}}},{"type":"object","additionalProperties":false,"required":["kind","effectRef","effectKind","subjectRef","amount","causeRef","targetCommitmentRef"],"properties":{"kind":{"const":"LEGAL_EFFECT"},"effectRef":{"$ref":"#/$defs/Ref"},"effectKind":{"enum":["COMMITMENT_RELEASE","RESERVATION_RELEASE","RESERVATION_CONSUMPTION"]},"subjectRef":{"$ref":"#/$defs/Ref"},"amount":{"$ref":"#/$defs/Amount"},"causeRef":{"$ref":"#/$defs/Ref"},"targetCommitmentRef":{"anyOf":[{"$ref":"#/$defs/Ref"},{"type":"null"}]}}}]},"Initialization":{"type":"object","additionalProperties":false,"required":["initializationRef","sourceRef","budgetLineRef","approvedRevisionRef","at","initialPaid","initialOutstanding","initialReserved"],"properties":{"initializationRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"budgetLineRef":{"$ref":"#/$defs/Ref"},"approvedRevisionRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"initialPaid":{"const":"0"},"initialOutstanding":{"const":"0"},"initialReserved":{"const":"0"}}},"LegacyDisposition":{"type":"object","additionalProperties":false,"required":["kind","sourceRef"],"properties":{"kind":{"const":"NO_IMPORTED_STATE_IN_THIS_LINE"},"sourceRef":{"$ref":"#/$defs/Ref"}}},"OriginEvent":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","eventRef","sourceRef","at","body"],"properties":{"kind":{"const":"APPROPRIATION_APPROVAL"},"eventRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"body":{"type":"object","additionalProperties":false,"required":["revisionRef"],"properties":{"revisionRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","sourceRef","at","body"],"properties":{"kind":{"const":"BUDGET_LINE_INITIALIZATION"},"eventRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"body":{"type":"object","additionalProperties":false,"required":["initializationRef"],"properties":{"initializationRef":{"$ref":"#/$defs/Ref"}}}}},{"type":"object","additionalProperties":false,"required":["kind","eventRef","sourceRef","at","body"],"properties":{"kind":{"const":"NO_PCR_EFFECT"},"eventRef":{"$ref":"#/$defs/Ref"},"sourceRef":{"$ref":"#/$defs/Ref"},"at":{"$ref":"#/$defs/Head"},"body":{"type":"object","additionalProperties":false,"required":["classificationRevision"],"properties":{"classificationRevision":{"$ref":"#/$defs/Ref"}}}}}]},"OriginFrame":{"type":"object","additionalProperties":false,"required":["frameRef","previousFrameRef","before","after","events"],"properties":{"frameRef":{"$ref":"#/$defs/Ref"},"previousFrameRef":{"$ref":"#/$defs/Ref"},"before":{"$ref":"#/$defs/Head"},"after":{"$ref":"#/$defs/Head"},"events":{"type":"array","items":{"$ref":"#/$defs/OriginEvent"}}}},"OriginCoverage":{"type":"object","additionalProperties":false,"required":["fromInclusive","toInclusive","startFrameRef","endFrameRef","frames"],"properties":{"fromInclusive":{"$ref":"#/$defs/Head"},"toInclusive":{"$ref":"#/$defs/Head"},"startFrameRef":{"$ref":"#/$defs/Ref"},"endFrameRef":{"$ref":"#/$defs/Ref"},"frames":{"type":"array","items":{"$ref":"#/$defs/OriginFrame"}}}},"Currency":{"type":"string","pattern":"^[A-Z]{3}$"}}}',
) as Shape;

export interface ReserveLineBalances {
  readonly budgetLineRef: string;
  readonly currency: string;
  readonly approvedRevision: string;
  readonly lineRevision: string;
  readonly A: string;
  readonly P: string;
  readonly G: string;
  readonly C: string;
  readonly R: string;
  readonly F: string;
}
interface InertBoundary {
  readonly productionAuthority: false;
  readonly sourceAdmitted: false;
  readonly evidenceClass: FinanceBudgetReserveInput['evidenceClass'] | null;
}
export type FinanceBudgetReserveResult =
  | (InertBoundary & {
      readonly status: 'INERT_REJECTED' | 'INERT_MISSING_INPUT';
      readonly reason: string;
      readonly diagnostic: string;
    })
  | (InertBoundary & {
      readonly status: 'INERT_CONSISTENT';
      readonly cutoff: ReserveHead;
      readonly balances: readonly ReserveLineBalances[];
      readonly effect: {
        readonly kind: 'INERT_RESERVATION_INTENT';
        readonly budgetLineRef: string;
        readonly amount: string;
        readonly currency: string;
        readonly identityInput: string;
        readonly before: { readonly R: string; readonly F: string };
        readonly after: { readonly R: string; readonly F: string };
      };
    })
  | (InertBoundary & {
      readonly status: 'INERT_DUPLICATE';
      readonly cutoff: ReserveHead;
      readonly balances: readonly ReserveLineBalances[];
      readonly originalReservationRef: string;
      readonly originalIntent: ReserveIntent;
      readonly deltaR: '0';
      readonly deltaF: '0';
    });

class InertInputError extends Error {
  constructor(
    readonly missing: boolean,
    readonly reason: string,
    detail: string,
  ) {
    super(detail);
  }
}
function reject(reason: string, detail = reason): never {
  throw new InertInputError(false, reason, detail);
}
function missing(reason: string, detail = reason): never {
  throw new InertInputError(true, reason, detail);
}
function requireThat(ok: boolean, reason: string): asserts ok {
  if (!ok) reject(reason);
}
function equal(a: unknown, b: unknown): boolean {
  return canonicalSerialize(a) === canonicalSerialize(b);
}
function shape(value: unknown, schema: Shape, path: string): void {
  if (schema.$ref !== undefined) {
    const target = INPUT_SCHEMA.$defs?.[schema.$ref.slice('#/$defs/'.length)];
    if (target === undefined) reject('INTERNAL_SCHEMA_REFERENCE', path);
    shape(value, target, path);
    return;
  }
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives !== undefined) {
    let accepted = 0;
    for (const choice of alternatives) {
      try {
        shape(value, choice, path);
        accepted += 1;
      } catch (error) {
        if (!(error instanceof InertInputError)) throw error;
      }
    }
    requireThat(
      schema.oneOf === undefined ? accepted > 0 : accepted === 1,
      'CLOSED_UNION:' + path,
    );
    return;
  }
  if (Object.hasOwn(schema, 'const'))
    requireThat(equal(value, schema.const), 'CONST:' + path);
  if (schema.enum !== undefined)
    requireThat(
      schema.enum.some((v) => equal(v, value)),
      'ENUM:' + path,
    );
  switch (schema.type) {
    case 'null':
      requireThat(value === null, 'NULL:' + path);
      break;
    case 'string':
      requireThat(typeof value === 'string', 'STRING:' + path);
      if (schema.pattern !== undefined)
        requireThat(
          new RegExp(schema.pattern, 'u').test(value),
          'LEXICAL:' + path,
        );
      if (schema.minLength !== undefined)
        requireThat(value.length >= schema.minLength, 'SHORT:' + path);
      if (schema.maxLength !== undefined)
        requireThat(value.length <= schema.maxLength, 'LONG:' + path);
      break;
    case 'array':
      requireThat(Array.isArray(value), 'ARRAY:' + path);
      if (schema.minItems !== undefined)
        requireThat(value.length >= schema.minItems, 'ARRAY_MIN:' + path);
      if (schema.maxItems !== undefined)
        requireThat(value.length <= schema.maxItems, 'ARRAY_MAX:' + path);
      if (schema.items === undefined) reject('INTERNAL_ARRAY_SCHEMA');
      value.forEach((v: unknown, i: number) =>
        shape(v, schema.items!, path + '/' + i),
      );
      break;
    case 'object': {
      requireThat(
        typeof value === 'object' && value !== null && !Array.isArray(value),
        'OBJECT:' + path,
      );
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!Object.hasOwn(record, key))
          missing('MISSING_FIELD', path + '/' + key);
      }
      for (const key of Object.keys(record)) {
        const member = schema.properties?.[key];
        if (member === undefined) reject('UNKNOWN_FIELD', path + '/' + key);
        shape(record[key], member, path + '/' + key);
      }
      break;
    }
  }
}
type D = WorldDecimalValue;
function amount(value: string, currency: string): D {
  return Money.from(value, currency).amount;
}
function plus(a: D, b: D): D {
  return assertWorldDecimalResult(a.plus(b));
}
function minus(a: D, b: D): D {
  return assertWorldDecimalResult(a.minus(b));
}
function positiveAmount(value: D, reason: string): D {
  requireThat(value.greaterThan(0), reason);
  return value;
}
function headAtOrBefore(a: ReserveHead, b: ReserveHead): boolean {
  return (
    BigInt(a.worldVersion) <= BigInt(b.worldVersion) &&
    BigInt(a.eventSequence) <= BigInt(b.eventSequence) &&
    BigInt(a.simTime) <= BigInt(b.simTime)
  );
}
function headCompare(a: ReserveHead, b: ReserveHead): number {
  // These are independently monotone coordinates, not a lexicographic key.
  const before = headAtOrBefore(a, b),
    after = headAtOrBefore(b, a);
  requireThat(before || after, 'INCOMPARABLE_GLOBAL_HEADS');
  return before && after ? 0 : before ? -1 : 1;
}
function noLater(a: ReserveHead, b: ReserveHead, reason: string): void {
  requireThat(headAtOrBefore(a, b), reason);
}
function sameSet(
  actual: readonly string[],
  expected: readonly string[],
  reason: string,
): void {
  requireThat(
    new Set(actual).size === actual.length &&
      new Set(expected).size === expected.length,
    reason,
  );
  requireThat(
    actual.length === expected.length &&
      actual.every((v) => expected.includes(v)),
    reason,
  );
}
function get<T>(map: ReadonlyMap<string, T>, key: string, kind: string): T {
  const result = map.get(key);
  if (result === undefined) missing('MISSING_' + kind, key);
  return result;
}
interface CState {
  readonly record: ReserveCommitment;
  readonly line: string;
  readonly originAt: ReserveHead;
  gross: D;
  paid: D;
  released: D;
  outstanding: D;
}
interface RState {
  readonly record: ReserveReservation;
  readonly line: string;
  readonly originAt: ReserveHead;
  active: D;
  released: D;
  consumed: D;
}
interface LState {
  readonly record: ReserveLine;
  approved: ReserveApprovedRevision;
  revision: bigint;
  A: D;
  commitmentHead: string | null;
  reservationHead: string | null;
}

/** All mutable bookkeeping is per invocation and never escapes as a writer. */
class InertReplay {
  private readonly declared = new Set<string>();
  private readonly sources = new Map<string, ReserveSourceRecord>();
  private readonly rules = new Map<string, ReserveRule>();
  private readonly approvalSets = new Map<string, ReserveApprovalSet>();
  private readonly receipts = new Map<string, ReserveReceipt>();
  private readonly effects = new Map<string, ReserveLegalEffect>();
  private readonly allocations = new Map<
    string,
    { receipt: ReserveReceipt; allocation: ReserveAllocation }
  >();
  private readonly futureC = new Map<
    string,
    { budgetLineRef: string; record: ReserveCommitment }
  >();
  private readonly futureR = new Map<
    string,
    { budgetLineRef: string; record: ReserveReservation }
  >();
  private readonly futureA = new Map<
    string,
    { budgetLineRef: string; record: ReserveApprovedRevision }
  >();
  private readonly lines = new Map<string, LState>();
  private readonly commitments = new Map<string, CState>();
  private readonly reservations = new Map<string, RState>();
  private readonly paidAllocations = new Set<string>();
  private readonly appliedReceipts = new Set<string>();
  private readonly appliedEffects = new Set<string>();
  private readonly appliedRevisions = new Set<string>();
  private readonly usedSources = new Set<string>();
  private readonly commands = new Map<string, string>();
  private readonly keys = new Map<string, string>();
  private readonly baselineEffectClaims = new Map<string, string>();
  private readonly baselineAllocationClaims = new Map<string, string>();

  constructor(private readonly input: FinanceBudgetReserveInput) {}
  private dec(value: string): D {
    return amount(value, this.input.scope.currency);
  }
  private zero(): D {
    return this.dec('0');
  }
  private declare(key: string): void {
    requireThat(!this.declared.has(key), 'DUPLICATE_DECLARATION:' + key);
    this.declared.add(key);
  }
  private claim(
    map: Map<string, string>,
    key: string,
    owner: string,
    reason: string,
  ): void {
    requireThat(!map.has(key), reason + ':' + key);
    map.set(key, owner);
  }
  private source(
    ref: string,
    kind: ReserveSourceRecord['kind'],
    subject: string,
    revision: string | null,
    binding: string,
    value: string | null,
    at?: ReserveHead,
    eventRef?: string,
  ): ReserveSourceRecord {
    const s = get(this.sources, ref, 'SOURCE');
    requireThat(
      s.kind === kind && s.subjectRef === subject && s.bindingRef === binding,
      'SOURCE_BINDING:' + ref,
    );
    if (revision !== null)
      requireThat(
        s.subjectRevision === revision,
        'SOURCE_SUBJECT_REVISION:' + ref,
      );
    requireThat(s.amount === value, 'SOURCE_AMOUNT:' + ref);
    if (at !== undefined) requireThat(equal(s.at, at), 'SOURCE_HEAD:' + ref);
    if (eventRef !== undefined)
      requireThat(s.eventRef === eventRef, 'SOURCE_EVENT:' + ref);
    this.usedSources.add(ref);
    return s;
  }
  private sourceLines(s: ReserveSourceRecord, lines: readonly string[]): void {
    sameSet(s.coveredLineRefs, lines, 'SOURCE_LINE_COVERAGE:' + s.sourceRef);
  }
  private line(key: string): LState {
    return get(this.lines, key, 'LINE');
  }

  private subjectLines(subject: string): readonly string[] {
    if (this.lines.has(subject)) return [subject];
    for (const l of this.input.baseline.lines) {
      if (
        l.commitments.some((c) => c.commitmentRef === subject) ||
        l.reservations.some(
          (r) =>
            r.reservationRef === subject ||
            r.originIntent.commandId === subject,
        )
      )
        return [l.budgetLineRef];
    }
    for (const c of this.input.facts.commitmentRecords)
      if (c.record.commitmentRef === subject) return [c.budgetLineRef];
    for (const r of this.input.facts.reservationRecords)
      if (
        r.record.reservationRef === subject ||
        r.record.originIntent.commandId === subject
      )
        return [r.budgetLineRef];
    for (const set of this.input.facts.approvalSets)
      if (set.subjectRef === subject && set.binding.kind === 'RESERVE_INTENT')
        return [set.binding.intent.payload.budgetLineRef];
    const effect = this.input.facts.legalEffects.find(
      (e) => e.effectRef === subject,
    );
    if (effect !== undefined) return [effect.budgetLineRef];
    return missing('MISSING_APPROVAL_SUBJECT_LINE', subject);
  }

  private initialize(): void {
    const i = this.input;
    sameCurrency(i.scope.currency, i.intent.payload.currency, 'Reserve intent');
    requireThat(
      i.permissionContext.countryId === i.scope.countryId,
      'FINANCE_COUNTRY',
    );
    sameSet(
      i.baseline.coveredLineRefs,
      i.baseline.lines.map((l) => l.budgetLineRef),
      'BASELINE_COVERAGE',
    );
    requireThat(i.baseline.lines.length > 0, 'EMPTY_BUDGET_SCOPE');
    requireThat(
      equal(i.history.fromExclusive, i.baseline.at) &&
        equal(i.history.toInclusive, i.cutoff),
      'GLOBAL_CUTOFF',
    );
    noLater(i.baseline.at, i.cutoff, 'BASELINE_AFTER_CUTOFF');
    for (const line of i.baseline.lines) {
      this.declare(line.budgetLineRef);
      this.lines.set(line.budgetLineRef, {
        record: line,
        approved: line.approvedRevision,
        revision: BigInt(line.lineRevision),
        A: this.dec(line.approvedRevision.amount),
        commitmentHead: null,
        reservationHead: null,
      });
    }
    for (const s of i.facts.sources) {
      this.declare(s.sourceRef);
      requireThat(
        s.sourceId === i.source.sourceId &&
          s.sourceRevision === i.source.revision &&
          s.producerRef === i.source.producerRef,
        'SOURCE_REVISION_OR_PRODUCER',
      );
      requireThat(equal(s.scope, i.scope), 'SOURCE_SCOPE');
      noLater(s.at, i.cutoff, 'SOURCE_AFTER_CUTOFF');
      sameSet(
        s.coveredLineRefs,
        s.lineIdentityBindings.map((b) => b.budgetLineRef),
        'SOURCE_IDENTITY_COVERAGE',
      );
      for (const binding of s.lineIdentityBindings) {
        const line = this.line(binding.budgetLineRef);
        requireThat(
          binding.entityRef === line.record.identity.entityRef &&
            binding.envelopeRef === line.record.identity.envelopeRef &&
            binding.effectivePeriodRef ===
              line.record.identity.effectivePeriodRef,
          'SOURCE_LINE_IDENTITY',
        );
      }
      if (s.amount !== null) this.dec(s.amount);
      this.sources.set(s.sourceRef, s);
    }
    for (const r of i.facts.approvalRules) {
      this.declare(r.ruleRef);
      this.rules.set(r.ruleRef, r);
      this.sourceLines(
        this.source(
          r.sourceRef,
          'APPROVAL_RULE',
          r.subjectRef,
          r.revision,
          r.ruleRef,
          null,
          r.at,
        ),
        this.subjectLines(r.subjectRef),
      );
    }
    for (const a of i.facts.approvalSets) {
      this.declare(a.setRef);
      this.approvalSets.set(a.setRef, a);
      this.sourceLines(
        this.source(
          a.sourceRef,
          'APPROVAL_SET',
          a.subjectRef,
          a.subjectRevision,
          a.setRef,
          null,
          a.at,
        ),
        this.subjectLines(a.subjectRef),
      );
      sameSet(
        a.decisions.map((d) => d.office),
        [...new Set(a.decisions.map((d) => d.office))],
        'DUPLICATE_APPROVAL_OFFICE',
      );
      const rule = get(this.rules, a.ruleRef, 'APPROVAL_RULE');
      requireThat(
        rule.subjectRef === a.subjectRef && rule.revision === a.ruleRevision,
        'APPROVAL_RULE_BINDING',
      );
      noLater(rule.at, a.at, 'RULE_AFTER_APPROVAL');
    }
    for (const p of i.facts.paymentReceipts) {
      this.declare(p.receiptRef);
      this.declare(p.paymentEvidenceRef);
      this.receipts.set(p.receiptRef, p);
      let total = this.zero();
      for (const a of p.allocations) {
        this.declare(a.allocationRef);
        positiveAmount(this.dec(a.amount), 'PAYMENT_ALLOCATION_POSITIVE');
        this.line(a.budgetLineRef);
        this.allocations.set(a.allocationRef, { receipt: p, allocation: a });
        total = plus(total, this.dec(a.amount));
      }
      requireThat(
        p.allocations.length > 0 && total.equals(this.dec(p.totalAmount)),
        'RECEIPT_FULL_ALLOCATION',
      );
      this.sourceLines(
        this.source(
          p.sourceRef,
          'PAYMENT',
          p.receiptRef,
          null,
          p.paymentEvidenceRef,
          p.totalAmount,
          p.at,
        ),
        [...new Set(p.allocations.map((a) => a.budgetLineRef))],
      );
    }
    for (const e of i.facts.legalEffects) {
      this.declare(e.effectRef);
      this.effects.set(e.effectRef, e);
      positiveAmount(this.dec(e.amount), 'LEGAL_EFFECT_POSITIVE');
    }
    for (const c of i.facts.commitmentRecords) {
      this.declare(c.record.commitmentRef);
      this.declare(c.record.evidenceRef);
      this.line(c.budgetLineRef);
      this.futureC.set(c.record.commitmentRef, c);
    }
    for (const r of i.facts.reservationRecords) {
      this.declare(r.record.reservationRef);
      this.line(r.budgetLineRef);
      this.futureR.set(r.record.reservationRef, r);
    }
    for (const a of i.facts.appropriationRevisions) {
      this.declare(a.record.revisionRef);
      this.line(a.budgetLineRef);
      this.futureA.set(a.record.revisionRef, a);
    }
  }

  private approve(
    ruleRef: string,
    setRef: string,
    subject: string,
    revision: string,
    subjectKind: ReserveRule['subjectKind'],
    binding: ReserveApprovalBinding,
    at: ReserveHead,
  ): void {
    const rule = get(this.rules, ruleRef, 'APPROVAL_RULE'),
      set = get(this.approvalSets, setRef, 'APPROVAL_SET');
    requireThat(
      rule.subjectRef === subject &&
        rule.subjectKind === subjectKind &&
        set.ruleRef === ruleRef &&
        set.ruleRevision === rule.revision &&
        set.subjectRef === subject &&
        set.subjectRevision === revision,
      'APPROVAL_SUBJECT',
    );
    requireThat(equal(set.binding, binding), 'APPROVAL_EXACT_PAYLOAD');
    requireThat(
      rule.captainRequirement !== 'UNKNOWN',
      'APPROVAL_APPLICABILITY_UNKNOWN',
    );
    requireThat(
      set.decisions.some(
        (d) => d.office === 'FINANCE' && d.decision === 'APPROVED',
      ),
      'FINANCE_APPROVAL_REQUIRED',
    );
    if (rule.captainRequirement === 'REQUIRED')
      requireThat(
        set.decisions.some(
          (d) => d.office === 'CAPTAIN' && d.decision === 'APPROVED',
        ),
        'CAPTAIN_APPROVAL_REQUIRED',
      );
    // No pending/revoked extra decision may be hidden by an approved office.
    requireThat(
      set.decisions.every((d) => d.decision === 'APPROVED'),
      'APPROVAL_NOT_CURRENTLY_APPROVED',
    );
    noLater(rule.at, at, 'RULE_AFTER_EFFECT');
    noLater(set.at, at, 'APPROVAL_AFTER_EFFECT');
  }
  private appropriation(
    line: string,
    a: ReserveApprovedRevision,
    eventRef?: string,
  ): ReserveSourceRecord {
    const s = this.source(
      a.sourceRef,
      'APPROPRIATION',
      line,
      a.revisionRef,
      a.revisionRef,
      a.amount,
      undefined,
      eventRef,
    );
    this.sourceLines(s, [line]);
    this.approve(
      a.approvalRuleRef,
      a.approvalSetRef,
      line,
      a.revisionRef,
      'BUDGET_LINE',
      {
        kind: 'APPROPRIATION',
        budgetLineRef: line,
        revisionRef: a.revisionRef,
        amount: a.amount,
      },
      s.at,
    );
    return s;
  }
  private origin(c: ReserveCommitment): ReserveOrigin {
    const o = c.grossOrigins[0];
    if (o === undefined) reject('COMMITMENT_ORIGIN_MISSING');
    requireThat(
      c.grossOrigins.length === 1 && o.amount === c.grossAmount,
      'ONE_EXACT_GROSS_ORIGIN',
    );
    positiveAmount(this.dec(o.amount), 'GROSS_POSITIVE');
    return o;
  }
  private addC(
    lineRef: string,
    c: ReserveCommitment,
    baseline: boolean,
    eventRef?: string,
  ): void {
    const l = this.line(lineRef),
      o = this.origin(c);
    if (baseline) {
      this.declare(c.commitmentRef);
      this.declare(c.evidenceRef);
    }
    requireThat(!this.commitments.has(c.commitmentRef), 'COMMITMENT_ID_REUSE');
    assertFiscalReferenceMatch(
      l.commitmentHead,
      c.predecessorCommitmentRef,
      'Commitment predecessor does not match current head',
    );
    let s: ReserveSourceRecord;
    if (o.kind === 'DIRECT_COMMITMENT')
      s = this.source(
        o.sourceRef,
        'COMMITMENT',
        c.commitmentRef,
        null,
        c.evidenceRef,
        o.amount,
        undefined,
        eventRef,
      );
    else {
      const e = get(this.effects, o.consumptionFactRef, 'CONSUMPTION_FACT');
      requireThat(
        e.kind === 'RESERVATION_CONSUMPTION' &&
          e.targetCommitmentRef === c.commitmentRef &&
          e.budgetLineRef === lineRef &&
          e.amount === o.amount &&
          e.sourceRef === o.sourceRef,
        'CONSUMPTION_ORIGIN_PAIR',
      );
      s = get(this.sources, o.sourceRef, 'SOURCE');
      if (eventRef !== undefined)
        requireThat(s.eventRef === eventRef, 'CONSUMPTION_SOURCE_EVENT');
    }
    this.sourceLines(s, [lineRef]);
    if (baseline)
      noLater(s.at, this.input.baseline.at, 'FUTURE_COMMITMENT_IN_BASELINE');
    else {
      requireThat(
        c.linkedPaymentAllocationRefs.length === 0 &&
          c.releaseFactRefs.length === 0 &&
          c.outstandingAmount === c.grossAmount,
        'NEW_COMMITMENT_INITIAL_STATE',
      );
    }
    this.commitments.set(c.commitmentRef, {
      record: c,
      line: lineRef,
      originAt: s.at,
      gross: this.dec(c.grossAmount),
      paid: this.zero(),
      released: this.zero(),
      outstanding: this.dec(c.grossAmount),
    });
    l.commitmentHead = c.commitmentRef;
  }
  private addR(
    lineRef: string,
    r: ReserveReservation,
    baseline: boolean,
    eventRef?: string,
  ): void {
    const l = this.line(lineRef);
    if (baseline) this.declare(r.reservationRef);
    requireThat(
      !this.reservations.has(r.reservationRef),
      'RESERVATION_ID_REUSE',
    );
    assertFiscalReferenceMatch(
      l.reservationHead,
      r.predecessorReservationRef,
      'Reservation predecessor does not match current head',
    );
    positiveAmount(this.dec(r.originAmount), 'RESERVATION_POSITIVE');
    requireThat(
      r.originIntent.payload.budgetLineRef === lineRef &&
        r.originIntent.payload.amount === r.originAmount &&
        r.originIntent.payload.currency === this.input.scope.currency,
      'RESERVATION_ORIGINAL_PAYLOAD',
    );
    this.claim(
      this.commands,
      r.originIntent.commandId,
      r.reservationRef,
      'COMMAND_ID_REUSE',
    );
    this.claim(
      this.keys,
      r.originIntent.idempotencyKey,
      r.reservationRef,
      'IDEMPOTENCY_KEY_REUSE',
    );
    const s = this.source(
      r.sourceRef,
      'RESERVATION',
      r.reservationRef,
      null,
      r.originIntent.commandId,
      r.originAmount,
      undefined,
      eventRef,
    );
    this.sourceLines(s, [lineRef]);
    noLater(
      r.originIntent.payload.expectedCutoff,
      s.at,
      'ORIGINAL_INTENT_AFTER_RESERVATION',
    );
    if (baseline)
      noLater(s.at, this.input.baseline.at, 'FUTURE_RESERVATION_IN_BASELINE');
    else
      requireThat(
        r.releaseFactRefs.length === 0 &&
          r.consumeFactRefs.length === 0 &&
          r.activeAmount === r.originAmount,
        'NEW_RESERVATION_INITIAL_STATE',
      );
    this.reservations.set(r.reservationRef, {
      record: r,
      line: lineRef,
      originAt: s.at,
      active: this.dec(r.originAmount),
      released: this.zero(),
      consumed: this.zero(),
    });
    l.reservationHead = r.reservationRef;
  }
  private totals(lineRef: string): { P: D; G: D; C: D; R: D; F: D } {
    let P = this.zero(),
      G = this.zero(),
      C = this.zero(),
      R = this.zero();
    for (const key of this.paidAllocations) {
      const a = get(this.allocations, key, 'ALLOCATION').allocation;
      if (a.budgetLineRef === lineRef) P = plus(P, this.dec(a.amount));
    }
    for (const c of this.commitments.values())
      if (c.line === lineRef) {
        G = plus(G, c.gross);
        C = plus(C, c.outstanding);
      }
    for (const r of this.reservations.values())
      if (r.line === lineRef) R = plus(R, r.active);
    const F = minus(minus(minus(this.line(lineRef).A, P), C), R);
    return { P, G, C, R, F };
  }
  private capacity(lineRef: string): void {
    const t = this.totals(lineRef);
    requireThat(!t.F.isNegative(), 'NEGATIVE_CAPACITY:' + lineRef);
  }
  private settle(p: ReserveReceipt, eventRef?: string): void {
    requireThat(
      !this.appliedReceipts.has(p.receiptRef),
      'PAID_RECEIPT_ALREADY_APPLIED',
    );
    this.source(
      p.sourceRef,
      'PAYMENT',
      p.receiptRef,
      null,
      p.paymentEvidenceRef,
      p.totalAmount,
      p.at,
      eventRef,
    );
    for (const a of p.allocations) {
      requireThat(
        !this.paidAllocations.has(a.allocationRef),
        'PAID_ALLOCATION_ALREADY_APPLIED',
      );
      if (a.kind === 'COMMITMENT_LINKED_PAYMENT') {
        const c = get(this.commitments, a.commitmentRef, 'COMMITMENT');
        requireThat(c.line === a.budgetLineRef, 'LINKED_PAYMENT_LINE');
        noLater(c.originAt, p.at, 'PAYMENT_BEFORE_COMMITMENT');
        const value = this.dec(a.amount);
        requireThat(
          c.outstanding.greaterThanOrEqualTo(value),
          'LINKED_PAID_EXCEEDS_OUTSTANDING',
        );
        c.paid = plus(c.paid, value);
        c.outstanding = minus(c.outstanding, value);
      }
      this.paidAllocations.add(a.allocationRef);
    }
    this.appliedReceipts.add(p.receiptRef);
  }
  private applyEffect(e: ReserveLegalEffect, eventRef?: string): void {
    requireThat(
      !this.appliedEffects.has(e.effectRef),
      'LEGAL_EFFECT_ALREADY_APPLIED',
    );
    const s = this.source(
      e.sourceRef,
      'LEGAL_EFFECT',
      e.subjectRef,
      null,
      e.causeRef,
      e.amount,
      e.at,
      eventRef,
    );
    this.sourceLines(s, [e.budgetLineRef]);
    const value = this.dec(e.amount);
    if (e.kind === 'APPROPRIATION_REVISION')
      reject('APPROPRIATION_EFFECT_REQUIRES_REVISION_EVENT');
    const isCommitment = e.kind === 'COMMITMENT_RELEASE';
    const subjectVersion = isCommitment
      ? get(
          this.sources,
          this.origin(get(this.commitments, e.subjectRef, 'COMMITMENT').record)
            .sourceRef,
          'SOURCE',
        ).subjectRevision
      : get(
          this.sources,
          get(this.reservations, e.subjectRef, 'RESERVATION').record.sourceRef,
          'SOURCE',
        ).subjectRevision;
    requireThat(
      s.subjectRevision === subjectVersion,
      'LEGAL_EFFECT_SUBJECT_REVISION',
    );
    this.approve(
      e.approvalRuleRef,
      e.approvalSetRef,
      e.subjectRef,
      subjectVersion,
      isCommitment ? 'COMMITMENT' : 'RESERVATION',
      {
        kind: 'LEGAL_EFFECT',
        effectRef: e.effectRef,
        effectKind: e.kind,
        subjectRef: e.subjectRef,
        amount: e.amount,
        causeRef: e.causeRef,
        targetCommitmentRef:
          e.kind === 'RESERVATION_CONSUMPTION' ? e.targetCommitmentRef : null,
      },
      e.at,
    );
    if (e.kind === 'COMMITMENT_RELEASE') {
      const c = get(this.commitments, e.subjectRef, 'COMMITMENT');
      requireThat(c.line === e.budgetLineRef, 'RELEASE_LINE');
      noLater(c.originAt, e.at, 'RELEASE_BEFORE_COMMITMENT');
      requireThat(
        c.outstanding.greaterThanOrEqualTo(value),
        'RELEASE_EXCEEDS_UNPAID',
      );
      c.released = plus(c.released, value);
      c.outstanding = minus(c.outstanding, value);
    } else {
      const r = get(this.reservations, e.subjectRef, 'RESERVATION');
      requireThat(r.line === e.budgetLineRef, 'RESERVATION_EFFECT_LINE');
      noLater(r.originAt, e.at, 'EFFECT_BEFORE_RESERVATION');
      requireThat(
        r.active.greaterThanOrEqualTo(value),
        'RESERVATION_EFFECT_EXCEEDS_ACTIVE',
      );
      if (e.kind === 'RESERVATION_CONSUMPTION') {
        const c = get(
            this.commitments,
            e.targetCommitmentRef,
            'CONSUMPTION_TARGET',
          ),
          o = this.origin(c.record);
        requireThat(
          c.line === r.line &&
            o.kind === 'RESERVATION_CONSUMPTION' &&
            o.consumptionFactRef === e.effectRef &&
            o.sourceRef === e.sourceRef &&
            o.amount === e.amount &&
            equal(c.originAt, e.at),
          'CONSUMPTION_TWO_SIDED_ONCE',
        );
        r.consumed = plus(r.consumed, value);
      } else r.released = plus(r.released, value);
      r.active = minus(r.active, value);
    }
    this.appliedEffects.add(e.effectRef);
  }

  private frame(
    before: ReserveHead,
    after: ReserveHead,
    events: readonly { readonly eventRef: string; readonly at: ReserveHead }[],
  ): void {
    requireThat(
      BigInt(after.worldVersion) === BigInt(before.worldVersion) + 1n,
      'WORLD_VERSION_GAP',
    );
    requireThat(
      BigInt(after.eventSequence) ===
        BigInt(before.eventSequence) + BigInt(events.length),
      'FRAME_EVENT_COUNT',
    );
    requireThat(
      BigInt(after.simTime) >= BigInt(before.simTime),
      'SIMTIME_REGRESSION',
    );
    events.forEach((e, index) => {
      this.declare(e.eventRef);
      requireThat(
        e.at.worldVersion === after.worldVersion &&
          e.at.simTime === after.simTime &&
          BigInt(e.at.eventSequence) ===
            BigInt(before.eventSequence) + BigInt(index) + 1n,
        'EVENT_HEAD_GAP',
      );
    });
  }
  private emptyOrigin(): void {
    const b = this.input.baseline,
      o = b.origin;
    if (o.kind !== 'CREATED_EMPTY') return;
    requireThat(b.lines.length === 1, 'EMPTY_ORIGIN_SINGLE_LINE');
    const line = b.lines[0];
    if (line === undefined) reject('EMPTY_ORIGIN_LINE');
    requireThat(
      line.commitments.length === 0 &&
        line.reservations.length === 0 &&
        line.directPaymentAllocationRefs.length === 0 &&
        line.commitmentHeadRef === null &&
        line.reservationHeadRef === null &&
        equal(line.assertedTotals, {
          paid: '0',
          outstanding: '0',
          reserved: '0',
        }),
      'EMPTY_ORIGIN_NOT_EMPTY',
    );
    const creation = get(this.sources, o.creationSourceRef, 'CREATION_SOURCE');
    this.declare(creation.bindingRef);
    this.sourceLines(
      this.source(
        o.creationSourceRef,
        'BUDGET_LINE_CREATION',
        line.budgetLineRef,
        null,
        creation.bindingRef,
        null,
      ),
      [line.budgetLineRef],
    );
    const init = o.initialization;
    this.declare(init.initializationRef);
    requireThat(
      init.budgetLineRef === line.budgetLineRef &&
        init.approvedRevisionRef === line.approvedRevision.revisionRef,
      'INITIALIZATION_IDENTITY',
    );
    const initSource = this.source(
      init.sourceRef,
      'BUDGET_LINE_INITIALIZATION',
      line.budgetLineRef,
      init.approvedRevisionRef,
      init.initializationRef,
      null,
      init.at,
    );
    this.sourceLines(initSource, [line.budgetLineRef]);
    noLater(creation.at, init.at, 'INITIALIZATION_BEFORE_CREATION');
    noLater(init.at, b.at, 'INITIALIZATION_AFTER_BASELINE');
    noLater(
      get(this.sources, line.approvedRevision.sourceRef, 'APPROPRIATION_SOURCE')
        .at,
      init.at,
      'INITIALIZATION_BEFORE_APPROVAL',
    );
    this.sourceLines(
      this.source(
        o.legacyDisposition.sourceRef,
        'LEGACY_DISPOSITION',
        line.budgetLineRef,
        init.approvedRevisionRef,
        'NO_IMPORTED_STATE_IN_THIS_LINE',
        null,
      ),
      [line.budgetLineRef],
    );
    this.sourceLines(
      this.source(
        o.emptySetSourceRef,
        'EMPTY_BUDGET_SET',
        b.baselineRef,
        b.baselineRef,
        b.baselineRef,
        null,
        b.at,
      ),
      b.coveredLineRefs,
    );
    const coverage = o.originCoverage;
    requireThat(
      equal(coverage.fromInclusive, creation.at) &&
        equal(coverage.toInclusive, b.at),
      'ORIGIN_CUTOFF',
    );
    let at = coverage.fromInclusive,
      previous = coverage.startFrameRef;
    let sawInitialization = equal(init.at, creation.at);
    let sawApproval = equal(
      get(this.sources, line.approvedRevision.sourceRef, 'SOURCE').at,
      creation.at,
    );
    for (const f of coverage.frames) {
      this.declare(f.frameRef);
      requireThat(
        equal(f.before, at) && f.previousFrameRef === previous,
        'ORIGIN_FRAME_GAP',
      );
      this.frame(f.before, f.after, f.events);
      for (const e of f.events) {
        if (e.kind === 'APPROPRIATION_APPROVAL') {
          requireThat(
            !sawApproval &&
              e.body.revisionRef === line.approvedRevision.revisionRef &&
              e.sourceRef === line.approvedRevision.sourceRef,
            'ORIGIN_APPROVAL',
          );
          this.source(
            e.sourceRef,
            'APPROPRIATION',
            line.budgetLineRef,
            e.body.revisionRef,
            e.body.revisionRef,
            line.approvedRevision.amount,
            e.at,
            e.eventRef,
          );
          sawApproval = true;
        } else if (e.kind === 'BUDGET_LINE_INITIALIZATION') {
          requireThat(
            !sawInitialization &&
              sawApproval &&
              e.body.initializationRef === init.initializationRef &&
              e.sourceRef === init.sourceRef,
            'ORIGIN_INITIALIZATION',
          );
          this.source(
            e.sourceRef,
            'BUDGET_LINE_INITIALIZATION',
            line.budgetLineRef,
            init.approvedRevisionRef,
            init.initializationRef,
            null,
            e.at,
            e.eventRef,
          );
          sawInitialization = true;
        } else
          this.sourceLines(
            this.source(
              e.sourceRef,
              'ORIGIN_NO_PCR_EFFECT',
              e.eventRef,
              e.body.classificationRevision,
              e.eventRef,
              null,
              e.at,
              e.eventRef,
            ),
            [line.budgetLineRef],
          );
      }
      at = f.after;
      previous = f.frameRef;
    }
    requireThat(
      equal(at, b.at) &&
        previous === coverage.endFrameRef &&
        sawApproval &&
        sawInitialization,
      'INCOMPLETE_ORIGIN_COVERAGE',
    );
    requireThat(
      coverage.endFrameRef === this.input.history.startFrameRef,
      'ORIGIN_BASELINE_FRAME_LINK',
    );
  }
  private baseline(): void {
    const b = this.input.baseline;
    this.declare(b.baselineRef);
    this.sourceLines(
      this.source(
        b.sourceRef,
        'BASELINE',
        b.baselineRef,
        b.baselineRef,
        b.baselineRef,
        null,
        b.at,
      ),
      b.coveredLineRefs,
    );
    const requiredLineage = new Set<string>();
    for (const l of b.lines) {
      this.declare(l.approvedRevision.revisionRef);
      const s = this.appropriation(l.budgetLineRef, l.approvedRevision);
      noLater(s.at, b.at, 'FUTURE_APPROPRIATION_IN_BASELINE');
      requiredLineage.add(s.sourceRef);
      this.appliedRevisions.add(l.approvedRevision.revisionRef);
      for (const c of l.commitments) {
        this.addC(l.budgetLineRef, c, true);
        requiredLineage.add(this.origin(c).sourceRef);
        for (const ref of c.linkedPaymentAllocationRefs)
          this.claim(
            this.baselineAllocationClaims,
            ref,
            c.commitmentRef,
            'DUPLICATE_PAID_ALLOCATION',
          );
        for (const ref of c.releaseFactRefs) {
          const e = get(this.effects, ref, 'COMMITMENT_RELEASE');
          requireThat(
            e.kind === 'COMMITMENT_RELEASE' &&
              e.subjectRef === c.commitmentRef &&
              e.budgetLineRef === l.budgetLineRef,
            'COMMITMENT_RELEASE_OWNER',
          );
          this.claim(
            this.baselineEffectClaims,
            ref,
            c.commitmentRef,
            'DUPLICATE_RELEASE',
          );
        }
      }
      assertFiscalReferenceMatch(
        l.commitmentHeadRef,
        this.line(l.budgetLineRef).commitmentHead,
        'Baseline commitment head mismatch',
      );
      for (const r of l.reservations) {
        this.addR(l.budgetLineRef, r, true);
        requiredLineage.add(r.sourceRef);
        for (const ref of r.releaseFactRefs) {
          const e = get(this.effects, ref, 'RESERVATION_RELEASE');
          requireThat(
            e.kind === 'RESERVATION_RELEASE' &&
              e.subjectRef === r.reservationRef &&
              e.budgetLineRef === l.budgetLineRef,
            'RESERVATION_RELEASE_OWNER',
          );
          this.claim(
            this.baselineEffectClaims,
            ref,
            r.reservationRef,
            'DUPLICATE_RELEASE',
          );
        }
        for (const ref of r.consumeFactRefs) {
          const e = get(this.effects, ref, 'CONSUMPTION_FACT');
          requireThat(
            e.kind === 'RESERVATION_CONSUMPTION' &&
              e.subjectRef === r.reservationRef &&
              e.budgetLineRef === l.budgetLineRef,
            'CONSUMPTION_OWNER',
          );
          this.claim(
            this.baselineEffectClaims,
            ref,
            r.reservationRef,
            'DUPLICATE_CONSUMPTION',
          );
        }
      }
      assertFiscalReferenceMatch(
        l.reservationHeadRef,
        this.line(l.budgetLineRef).reservationHead,
        'Baseline reservation head mismatch',
      );
      for (const ref of l.directPaymentAllocationRefs)
        this.claim(
          this.baselineAllocationClaims,
          ref,
          l.budgetLineRef,
          'DUPLICATE_PAID_ALLOCATION',
        );
    }
    for (const [key, owner] of this.baselineAllocationClaims) {
      const { allocation: a, receipt: p } = get(
        this.allocations,
        key,
        'ALLOCATION',
      );
      noLater(p.at, b.at, 'FUTURE_PAYMENT_IN_BASELINE');
      requireThat(
        a.kind === 'DIRECT_BUDGET_PAYMENT'
          ? owner === a.budgetLineRef
          : owner === a.commitmentRef &&
              get(this.commitments, owner, 'COMMITMENT').line ===
                a.budgetLineRef,
        'PAID_OWNER_OR_DIRECT_LINKED_OVERLAP',
      );
    }
    const timeline: (
      | { kind: 'PAYMENT'; value: ReserveReceipt }
      | { kind: 'EFFECT'; value: ReserveLegalEffect }
    )[] = [];
    for (const p of this.receipts.values())
      if (headAtOrBefore(p.at, b.at)) {
        requireThat(
          p.allocations.every((a) =>
            this.baselineAllocationClaims.has(a.allocationRef),
          ),
          'UNCLAIMED_BASELINE_PAYMENT',
        );
        timeline.push({ kind: 'PAYMENT', value: p });
        requiredLineage.add(p.sourceRef);
      }
    for (const key of this.baselineEffectClaims.keys()) {
      const e = get(this.effects, key, 'LEGAL_EFFECT');
      noLater(e.at, b.at, 'FUTURE_EFFECT_IN_BASELINE');
      timeline.push({ kind: 'EFFECT', value: e });
      requiredLineage.add(e.sourceRef);
    }
    timeline.sort((a, b) => headCompare(a.value.at, b.value.at));
    for (const item of timeline) {
      if (item.kind === 'PAYMENT') this.settle(item.value);
      else this.applyEffect(item.value);
    }
    for (const c of this.commitments.values()) {
      requireThat(
        c.outstanding.equals(this.dec(c.record.outstandingAmount)) &&
          c.gross.equals(plus(plus(c.paid, c.outstanding), c.released)),
        'GROSS_PAID_OUTSTANDING_RELEASE_RECONCILIATION',
      );
      const o = this.origin(c.record);
      if (o.kind === 'RESERVATION_CONSUMPTION')
        requireThat(
          this.appliedEffects.has(o.consumptionFactRef),
          'UNAPPLIED_BASELINE_CONSUMPTION',
        );
    }
    for (const r of this.reservations.values()) {
      requireThat(
        r.active.equals(this.dec(r.record.activeAmount)) &&
          this.dec(r.record.originAmount).equals(
            plus(plus(r.active, r.released), r.consumed),
          ),
        'RESERVATION_ORIGIN_ACTIVE_RECONCILIATION',
      );
    }
    for (const l of b.lines) {
      const t = this.totals(l.budgetLineRef);
      requireThat(
        t.P.equals(this.dec(l.assertedTotals.paid)) &&
          t.C.equals(this.dec(l.assertedTotals.outstanding)) &&
          t.R.equals(this.dec(l.assertedTotals.reserved)),
        'BASELINE_ASSERTED_TOTALS',
      );
      this.capacity(l.budgetLineRef);
    }
    if (b.origin.kind === 'CARRIED_HISTORY') {
      const refs = b.origin.lineageSourceRefs;
      requireThat(
        refs.length > 0 &&
          new Set(refs).size === refs.length &&
          [...requiredLineage].every((s) => refs.includes(s)),
        'BASELINE_LINEAGE_COVERAGE',
      );
      for (const ref of refs) get(this.sources, ref, 'BASELINE_LINEAGE_SOURCE');
      for (const ref of b.origin.importMappingSourceRefs) {
        const source = get(this.sources, ref, 'IMPORT_MAPPING_SOURCE');
        requireThat(
          source.kind === 'LEGACY_DISPOSITION' &&
            source.amount === null &&
            b.coveredLineRefs.includes(source.subjectRef),
          'IMPORT_MAPPING_BINDING',
        );
        noLater(source.at, b.at, 'IMPORT_MAPPING_AFTER_BASELINE');
        this.sourceLines(source, [source.subjectRef]);
        this.usedSources.add(ref);
      }
    } else this.emptyOrigin();
  }
  private history(): void {
    const h = this.input.history;
    let at = h.fromExclusive,
      previous = h.startFrameRef;
    for (const f of h.frames) {
      this.declare(f.frameRef);
      requireThat(
        equal(at, f.before) && f.previousFrameRef === previous,
        'HISTORY_FRAME_GAP',
      );
      this.frame(f.before, f.after, f.events);
      for (const e of f.events) {
        requireThat(e.frameRef === f.frameRef, 'EVENT_FRAME');
        noLater(e.at, this.input.cutoff, 'EVENT_AFTER_CUTOFF');
        const affected = this.eventLines(e);
        sameSet(
          e.lineChanges.map((c) => c.budgetLineRef),
          affected,
          'EVENT_LINE_CHANGES',
        );
        for (const change of e.lineChanges) {
          const l = this.line(change.budgetLineRef);
          requireThat(
            BigInt(change.lineBeforeRevision) === l.revision &&
              BigInt(change.lineAfterRevision) === l.revision + 1n,
            'LINE_REVISION_GAP',
          );
        }
        this.event(e, f.before);
        for (const change of e.lineChanges) {
          this.line(change.budgetLineRef).revision = BigInt(
            change.lineAfterRevision,
          );
          this.capacity(change.budgetLineRef);
        }
      }
      at = f.after;
      previous = f.frameRef;
    }
    requireThat(
      equal(at, h.toInclusive) && previous === h.endFrameRef,
      'HISTORY_CUTOFF_NOT_REACHED',
    );
    for (const p of this.receipts.values())
      requireThat(this.appliedReceipts.has(p.receiptRef), 'UNAPPLIED_RECEIPT');
    for (const e of this.effects.values())
      requireThat(
        this.appliedEffects.has(e.effectRef),
        'UNAPPLIED_LEGAL_EFFECT',
      );
    for (const c of this.futureC.keys())
      requireThat(this.commitments.has(c), 'UNAPPLIED_COMMITMENT');
    for (const r of this.futureR.keys())
      requireThat(this.reservations.has(r), 'UNAPPLIED_RESERVATION');
    for (const a of this.futureA.keys())
      requireThat(this.appliedRevisions.has(a), 'UNAPPLIED_APPROPRIATION');
  }
  private accountSources(mode: 'ORIGINAL_DUPLICATE' | 'NEW_RESERVE'): void {
    for (const s of this.sources.values())
      requireThat(
        this.usedSources.has(s.sourceRef) ||
          // A supplied current-only permission declaration is not consumed as
          // new authorization on an exact original retry. No other unused
          // declaration is exempt from the historical accounting checks.
          (mode === 'ORIGINAL_DUPLICATE' &&
            s.sourceRef === this.input.permissionContext.sourceRef &&
            s.kind === 'FINANCE_PERMISSION'),
        'UNACCOUNTED_SOURCE:' + s.sourceRef,
      );
  }
  private eventLines(e: ReserveEvent): readonly string[] {
    switch (e.kind) {
      case 'NO_BUDGET_EFFECT':
        return [];
      case 'PAYMENT_SETTLED':
        return [
          ...new Set(
            get(this.receipts, e.body.receiptRef, 'RECEIPT').allocations.map(
              (a) => a.budgetLineRef,
            ),
          ),
        ];
      case 'COMMITMENT_RECORDED':
        return [
          get(this.futureC, e.body.commitmentRef, 'COMMITMENT_RECORD')
            .budgetLineRef,
        ];
      case 'RESERVATION_RECORDED':
        return [
          get(this.futureR, e.body.reservationRef, 'RESERVATION_RECORD')
            .budgetLineRef,
        ];
      default:
        return [
          get(this.effects, e.body.effectRef, 'LEGAL_EFFECT').budgetLineRef,
        ];
    }
  }
  private event(e: ReserveEvent, before: ReserveHead): void {
    if (e.kind === 'NO_BUDGET_EFFECT') {
      const s = this.source(
        e.sourceRef,
        'NO_BUDGET_EFFECT',
        e.eventRef,
        e.body.classificationRevision,
        e.eventRef,
        null,
        e.at,
        e.eventRef,
      );
      requireThat(s.coveredLineRefs.length > 0, 'NO_EFFECT_SCOPE_MISSING');
      return;
    }
    if (e.kind === 'PAYMENT_SETTLED') {
      const p = get(this.receipts, e.body.receiptRef, 'RECEIPT');
      requireThat(
        p.sourceRef === e.sourceRef && equal(p.at, e.at),
        'PAYMENT_EVENT_FACT',
      );
      this.settle(p, e.eventRef);
      return;
    }
    if (e.kind === 'COMMITMENT_RECORDED') {
      const { budgetLineRef, record } = get(
        this.futureC,
        e.body.commitmentRef,
        'COMMITMENT_RECORD',
      );
      const o = this.origin(record);
      requireThat(
        o.kind === 'DIRECT_COMMITMENT' &&
          o.sourceRef === e.sourceRef &&
          equal(get(this.sources, o.sourceRef, 'SOURCE').at, e.at),
        'COMMITMENT_EVENT_ORIGIN',
      );
      requireThat(
        this.totals(budgetLineRef).F.greaterThanOrEqualTo(
          this.dec(record.grossAmount),
        ),
        'COMMITMENT_CAPACITY',
      );
      this.addC(budgetLineRef, record, false, e.eventRef);
      return;
    }
    if (e.kind === 'RESERVATION_RECORDED') {
      const { budgetLineRef, record } = get(
        this.futureR,
        e.body.reservationRef,
        'RESERVATION_RECORD',
      );
      requireThat(
        record.sourceRef === e.sourceRef &&
          equal(get(this.sources, e.sourceRef, 'SOURCE').at, e.at),
        'RESERVATION_EVENT_FACT',
      );
      requireThat(
        record.originIntent.commandId === e.causeRef &&
          equal(record.originIntent.payload.expectedCutoff, before),
        'HISTORICAL_RESERVATION_CAUSE_OR_CUTOFF',
      );
      requireThat(
        record.originIntent.payload.expectedBudgetRevision ===
          this.line(budgetLineRef).approved.revisionRef,
        'HISTORICAL_RESERVATION_REVISION',
      );
      requireThat(
        this.totals(budgetLineRef).F.greaterThanOrEqualTo(
          this.dec(record.originAmount),
        ),
        'RESERVATION_CAPACITY',
      );
      this.addR(budgetLineRef, record, false, e.eventRef);
      return;
    }
    const effect = get(this.effects, e.body.effectRef, 'LEGAL_EFFECT');
    requireThat(
      effect.sourceRef === e.sourceRef &&
        effect.causeRef === e.causeRef &&
        equal(effect.at, e.at),
      'LEGAL_EFFECT_EVENT',
    );
    if (e.kind === 'APPROPRIATION_REVISED') {
      requireThat(
        effect.kind === 'APPROPRIATION_REVISION' &&
          !this.appliedEffects.has(effect.effectRef),
        'APPROPRIATION_EFFECT_TYPE_OR_REPLAY',
      );
      const { budgetLineRef, record } = get(
        this.futureA,
        e.body.revisionRef,
        'APPROPRIATION_REVISION',
      );
      const l = this.line(budgetLineRef);
      requireThat(
        effect.budgetLineRef === budgetLineRef &&
          effect.subjectRef === budgetLineRef &&
          effect.amount === record.amount &&
          effect.approvalRuleRef === record.approvalRuleRef &&
          effect.approvalSetRef === record.approvalSetRef,
        'APPROPRIATION_REVISION_EFFECT_BINDING',
      );
      assertFiscalReferenceMatch(
        l.approved.revisionRef,
        record.predecessorRevisionRef,
        'Appropriation predecessor mismatch',
      );
      const source = this.appropriation(budgetLineRef, record, e.eventRef);
      requireThat(equal(source.at, e.at), 'APPROPRIATION_SOURCE_EVENT_HEAD');
      this.sourceLines(
        this.source(
          effect.sourceRef,
          'LEGAL_EFFECT',
          budgetLineRef,
          record.revisionRef,
          e.causeRef,
          record.amount,
          e.at,
          e.eventRef,
        ),
        [budgetLineRef],
      );
      l.approved = record;
      l.A = this.dec(record.amount);
      this.appliedRevisions.add(record.revisionRef);
      this.appliedEffects.add(effect.effectRef);
      return;
    }
    if (e.kind === 'RESERVATION_CONSUMED') {
      requireThat(
        effect.kind === 'RESERVATION_CONSUMPTION' &&
          effect.targetCommitmentRef === e.body.targetCommitmentRef,
        'CONSUMPTION_EVENT_TARGET',
      );
      const { budgetLineRef, record } = get(
        this.futureC,
        e.body.targetCommitmentRef,
        'CONSUMPTION_TARGET_RECORD',
      );
      requireThat(
        budgetLineRef === effect.budgetLineRef,
        'CONSUMPTION_TARGET_LINE',
      );
      this.addC(budgetLineRef, record, false, e.eventRef);
    } else
      requireThat(
        e.kind === 'COMMITMENT_RELEASED'
          ? effect.kind === 'COMMITMENT_RELEASE'
          : effect.kind === 'RESERVATION_RELEASE',
        'LEGAL_EFFECT_TAG',
      );
    this.applyEffect(effect, e.eventRef);
  }

  run(): FinanceBudgetReserveResult {
    this.initialize();
    this.baseline();
    this.history();
    const balances = Object.freeze(
      [...this.lines.keys()].map((key) => {
        const l = this.line(key),
          t = this.totals(key);
        return Object.freeze({
          budgetLineRef: key,
          currency: this.input.scope.currency,
          approvedRevision: l.approved.revisionRef,
          lineRevision: l.revision.toString(),
          A: canonicalDecimal(l.A),
          P: canonicalDecimal(t.P),
          G: canonicalDecimal(t.G),
          C: canonicalDecimal(t.C),
          R: canonicalDecimal(t.R),
          F: canonicalDecimal(t.F),
        });
      }),
    );
    const boundary = {
      productionAuthority: false,
      sourceAdmitted: false,
      evidenceClass: this.input.evidenceClass,
    } as const;
    const intent = this.input.intent,
      command = this.commands.get(intent.commandId),
      key = this.keys.get(intent.idempotencyKey);
    if (command !== undefined || key !== undefined) {
      requireThat(
        command !== undefined && key === command,
        'ORIGINAL_IDENTITY_CONFLICT',
      );
      const original = get(this.reservations, command, 'ORIGINAL_RESERVATION');
      requireThat(
        equal(original.record.originIntent, intent),
        'ORIGINAL_PAYLOAD_CONFLICT',
      );
      this.accountSources('ORIGINAL_DUPLICATE');
      return Object.freeze({
        ...boundary,
        status: 'INERT_DUPLICATE',
        cutoff: this.input.cutoff,
        balances,
        originalReservationRef: command,
        originalIntent: original.record.originIntent,
        deltaR: '0',
        deltaF: '0',
      });
    }
    const p = this.input.permissionContext;
    this.sourceLines(
      this.source(
        p.sourceRef,
        'FINANCE_PERMISSION',
        p.actorRef,
        p.seatRevision,
        'FINANCE_BUDGET',
        null,
        this.input.cutoff,
      ),
      [intent.payload.budgetLineRef],
    );
    this.accountSources('NEW_RESERVE');
    const l = this.line(intent.payload.budgetLineRef),
      t = this.totals(intent.payload.budgetLineRef);
    requireThat(
      intent.payload.expectedBudgetRevision === l.approved.revisionRef &&
        equal(intent.payload.expectedCutoff, this.input.cutoff),
      'NEW_INTENT_STALE_REVISION_OR_CUTOFF',
    );
    this.approve(
      p.reservationRuleRef,
      p.reservationApprovalSetRef,
      intent.commandId,
      'INTENT_V1',
      'RESERVE_INTENT',
      { kind: 'RESERVE_INTENT', intent },
      this.input.cutoff,
    );
    const approval = get(
      this.approvalSets,
      p.reservationApprovalSetRef,
      'RESERVE_APPROVAL',
    );
    requireThat(
      approval.decisions.some(
        (d) =>
          d.office === 'FINANCE' &&
          d.actorRef === p.actorRef &&
          d.decision === 'APPROVED',
      ),
      'FINANCE_ACTOR_BINDING',
    );
    const x = positiveAmount(
      this.dec(intent.payload.amount),
      'NEW_RESERVE_POSITIVE',
    );
    requireThat(x.lessThanOrEqualTo(t.F), 'NEW_RESERVE_EXCEEDS_FREE');
    const identityInput = canonicalHashInput({
      schemaVersion: this.input.schemaVersion,
      scope: this.input.scope,
      identity: l.record.identity,
      intent,
    });
    return Object.freeze({
      ...boundary,
      status: 'INERT_CONSISTENT',
      cutoff: this.input.cutoff,
      balances,
      effect: Object.freeze({
        kind: 'INERT_RESERVATION_INTENT',
        budgetLineRef: intent.payload.budgetLineRef,
        amount: intent.payload.amount,
        currency: this.input.scope.currency,
        identityInput,
        before: Object.freeze({
          R: canonicalDecimal(t.R),
          F: canonicalDecimal(t.F),
        }),
        after: Object.freeze({
          R: canonicalDecimal(plus(t.R, x)),
          F: canonicalDecimal(minus(t.F, x)),
        }),
      }),
    });
  }
}

/** Strict closed inert contract plus exact reconciliation; never a READY issuer. */
export function validateFinanceBudgetReserveContract(
  value: unknown,
): FinanceBudgetReserveResult {
  let evidenceClass: FinanceBudgetReserveInput['evidenceClass'] | null = null;
  try {
    // Existing canonical normalizer rejects proxies/accessors/classes/numbers,
    // sparse arrays, cycles and hidden properties before any input is trusted.
    const copy: unknown = JSON.parse(canonicalSerialize(value));
    shape(copy, INPUT_SCHEMA, 'input');
    const input = copy as FinanceBudgetReserveInput;
    evidenceClass = input.evidenceClass;
    return new InertReplay(input).run();
  } catch (error) {
    return Object.freeze({
      productionAuthority: false,
      sourceAdmitted: false,
      evidenceClass,
      status:
        error instanceof InertInputError && error.missing
          ? 'INERT_MISSING_INPUT'
          : 'INERT_REJECTED',
      reason:
        error instanceof InertInputError
          ? error.reason
          : 'EXACT_INPUT_REJECTED',
      diagnostic: error instanceof Error ? error.message : 'Input rejected',
    });
  }
}

/** Identity derivation only; the returned trace is not an authoritative event. */
export function evaluateFinanceBudgetReserve(
  value: unknown,
  sha256Hex: Sha256Hex,
) {
  const result = validateFinanceBudgetReserveContract(value);
  if (result.status !== 'INERT_CONSISTENT') return result;
  return Object.freeze({
    ...result,
    reservationRef:
      'RESERVE_' +
      canonicalSha256(result.effect.identityInput, sha256Hex).slice(7),
  });
}
