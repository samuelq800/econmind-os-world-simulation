import type {
  DecisionResultCause,
  DecisionResultHead,
} from './office-decision-result-contract.js';

/** Disclosure classification only; it never grants membership or read access. */
export const ECONOMIC_READ_VISIBILITY_SCHEMA =
  'economic-read-visibility-v1' as const;
export type EconomicReadScope = Readonly<{
  worldId: string;
  countryId: string;
  classification: 'COUNTRY' | 'OFFICE_PRIVATE';
  officeId: string | null;
}>;
export type EconomicReadDisclosure =
  | Readonly<{ status: 'AUTHORIZED'; sourceUnits: readonly string[] }>
  | Readonly<{ status: 'NOT_AUTHORIZED'; reason: EconomicReadDenialReason }>;
export type EconomicReadDenialReason =
  | 'ADMITTED_SOURCE_UNAVAILABLE'
  | 'OWNER_MAPPING_UNAVAILABLE'
  | 'SCOPE_NOT_AUTHORIZED'
  | 'SUMMARY_SOURCE_UNAVAILABLE';
export interface EconomicReadVisibilitySummary {
  readonly schemaVersion: typeof ECONOMIC_READ_VISIBILITY_SCHEMA;
  readonly financialDetail: 'AUTHORIZED_FILTERED' | 'NOT_AUTHORIZED';
  readonly inventoryDetail: 'NOT_AUTHORIZED';
  readonly countrySummary: 'NOT_AUTHORIZED';
}

/** Separate result-only wire version; the v1 contract above is unchanged. */
export const ECONOMIC_READ_VISIBILITY_V2_SCHEMA =
  'economic-read-visibility-v2' as const;

/** Only already-disclosed cause identity, not the private source/evidence graph. */
export type IndustryProductionResultCauseBinding = Readonly<
  Pick<
    DecisionResultCause,
    'commandId' | 'commandFingerprint' | 'eventId' | 'eventFingerprint'
  >
>;

/**
 * Describes one source-classified result, never a reusable capability.
 * The sole publisher must classify the output and every material's account
 * history at held head H. Historical production T may precede H. Consumers
 * must validate closed wire keys and exact H/four-cause equality independently;
 * a TypeScript assignment is neither validation nor an authorization issuer.
 */
export type IndustryProductionResultDisclosure =
  | Readonly<{ status: 'NOT_AUTHORIZED' }>
  | Readonly<{
      status: 'AUTHORIZED_RESULT_ONLY';
      purpose: 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY';
      sourceHead: Readonly<DecisionResultHead>;
      causeBinding: IndustryProductionResultCauseBinding;
    }>;

/**
 * Only for the accepted private-INDUSTRY activity-v2/visibility-v2 pair.
 * Existing seat, entitlement and read-binding checks remain separate. Neither
 * this type nor a generic summary(scope) supplies governing-source authority.
 * No stock, financial-position, source-admission or command grant is added.
 */
export interface EconomicReadVisibilitySummaryV2 {
  readonly schemaVersion: typeof ECONOMIC_READ_VISIBILITY_V2_SCHEMA;
  readonly financialDetail: EconomicReadVisibilitySummary['financialDetail'];
  readonly inventoryDetail: 'NOT_AUTHORIZED';
  readonly countrySummary: 'NOT_AUTHORIZED';
  readonly industryProductionResult: IndustryProductionResultDisclosure;
}

/** Sparse canonical debit positions, never a spendable-funds calculation. */
export const AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA =
  'authoritative-financial-position-v1' as const;
export type AuthoritativeFinancialPosition =
  | Readonly<{
      schemaVersion: typeof AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA;
      status: 'NOT_AUTHORIZED';
      reason: EconomicReadDenialReason;
    }>
  | Readonly<{
      schemaVersion: typeof AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA;
      status: 'AUTHORIZED_FILTERED';
      semantics: 'OPENING_PLUS_POSTING_LINEAGE';
      positionCoverage: 'NONZERO_LEDGER_POSITIONS';
      sourceHead: Readonly<{ worldVersion: string; eventSequence: string }>;
      opening: Readonly<{
        seedId: string;
        seedFingerprint: string;
        openingWorldVersion: string;
      }>;
      sourceUnits: readonly string[];
      positions: readonly Readonly<{
        accountId: string;
        accountClass: string;
        currency: string;
        netDebitBalance: string;
      }>[];
    }>;
