/** Department ceilings only. DATA policy validation is not policy adoption,
 * an appropriation, Captain approval or a Treasury cash instruction. */
import { canonicalHashInput } from '../serialization/canonical.js';
import { canonicalSha256, type Sha256Hex } from './command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { Money } from '../numeric/money.js';
import { parseBudgetSourcePayload } from './finance-budget-source-transition.js';
export const FINANCE_DEPARTMENT_CAP_ONLY_RULE =
  'FINANCE_ORDINARY_DEPARTMENT_CAP_ONLY_V1' as const;
export const FINANCE_DEPARTMENT_CAP_CATEGORIES = Object.freeze([
  'GOVERNMENT_ADMINISTRATION',
  'TRADE_DIPLOMACY',
  'INDUSTRY_SCIENCE_RESOURCES',
  'LABOUR_SOCIAL_DEVELOPMENT',
  'CROSS_GOVERNMENT_ADMINISTRATION',
] as const);
export type FinanceDepartmentCapCategory =
  (typeof FINANCE_DEPARTMENT_CAP_CATEGORIES)[number];
export interface FinanceDepartmentCapOnlyPolicy {
  readonly schemaVersion: 'finance-department-cap-policy-v1';
  readonly ruleRef: typeof FINANCE_DEPARTMENT_CAP_ONLY_RULE;
  readonly ruleRevision: string;
  readonly sourceDocumentSHA256: string;
  readonly normativeUnits: readonly string[];
  readonly worldId: string;
  readonly countryId: string;
  readonly governmentEntityId: string;
  readonly currency: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
  readonly periodRevision: string;
  readonly validFromSimTime: string;
  readonly validUntilSimTime: string;
  readonly requestingOfficeId: 'FINANCE';
  readonly departmentCategory: FinanceDepartmentCapCategory;
  readonly classification: 'ORDINARY_DEPARTMENTAL';
  readonly funding: 'CAP_ONLY_NO_APPROPRIATION';
  readonly requiredApprovalOffices: readonly ['FINANCE'];
  /** Pointers to independently admitted applicability originals. These strings
   * do not establish that the original exists or that Captain is unnecessary. */
  readonly applicability: Readonly<{
    classificationOriginalRef: string;
    classificationOriginalSHA256: string;
    governanceRuleRef: string;
    governanceRuleSHA256: string;
  }>;
}
const units = Object.freeze({
  GOVERNMENT_ADMINISTRATION: 'FINANCE-U0248',
  TRADE_DIPLOMACY: 'FINANCE-U0249',
  INDUSTRY_SCIENCE_RESOURCES: 'FINANCE-U0250',
  LABOUR_SOCIAL_DEVELOPMENT: 'FINANCE-U0251',
  CROSS_GOVERNMENT_ADMINISTRATION: 'FINANCE-U0252',
});
const ref = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 256;
const digest = (v: unknown) =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const ticks = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(0|[1-9][0-9]*)$/u.test(v) &&
  v.length <= 19 &&
  BigInt(v) <= 9223372036854775807n;
function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Native budget: UNSUPPORTED_OR_INCOMPLETE_DEPARTMENT_CAP_RULE',
  );
}
export function financeDepartmentCapNormativeUnits(
  category: FinanceDepartmentCapCategory,
): readonly string[] {
  if (!Object.hasOwn(units, category)) invalid();
  return Object.freeze([
    'FINANCE-U0068',
    'FINANCE-U0247',
    units[category],
    'FINANCE-U0265',
    'FINANCE-U0817',
    'MASTER-U1345',
  ]);
}
export function financeDepartmentCapEnvelopeRef(
  scope: Readonly<{
    worldId: string;
    countryId: string;
    governmentEntityId: string;
    departmentCategory: FinanceDepartmentCapCategory;
    effectivePeriodRef: string;
  }>,
  sha: Sha256Hex,
): string {
  if (
    ![
      scope.worldId,
      scope.countryId,
      scope.governmentEntityId,
      scope.effectivePeriodRef,
    ].every(ref) ||
    !Object.hasOwn(units, scope.departmentCategory)
  )
    invalid();
  return (
    'DEPARTMENT_CAP_' +
    canonicalSha256(canonicalHashInput(scope), sha).slice(7).toUpperCase()
  );
}
export function validateFinanceDepartmentCapOnlyPolicy(
  p: FinanceDepartmentCapOnlyPolicy,
): void {
  const keys = [
    'schemaVersion',
    'ruleRef',
    'ruleRevision',
    'sourceDocumentSHA256',
    'normativeUnits',
    'worldId',
    'countryId',
    'governmentEntityId',
    'currency',
    'envelopeRef',
    'effectivePeriodRef',
    'periodRevision',
    'validFromSimTime',
    'validUntilSimTime',
    'requestingOfficeId',
    'departmentCategory',
    'classification',
    'funding',
    'requiredApprovalOffices',
    'applicability',
  ];
  if (
    !p ||
    JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(keys.sort()) ||
    p.schemaVersion !== 'finance-department-cap-policy-v1' ||
    p.ruleRef !== FINANCE_DEPARTMENT_CAP_ONLY_RULE ||
    ![
      p.ruleRevision,
      p.worldId,
      p.countryId,
      p.governmentEntityId,
      p.envelopeRef,
      p.effectivePeriodRef,
      p.periodRevision,
    ].every(ref) ||
    !digest(p.sourceDocumentSHA256) ||
    !ticks(p.validFromSimTime) ||
    !ticks(p.validUntilSimTime) ||
    BigInt(p.validFromSimTime) >= BigInt(p.validUntilSimTime) ||
    p.requestingOfficeId !== 'FINANCE' ||
    p.classification !== 'ORDINARY_DEPARTMENTAL' ||
    p.funding !== 'CAP_ONLY_NO_APPROPRIATION' ||
    JSON.stringify(p.requiredApprovalOffices) !== '["FINANCE"]' ||
    !Object.hasOwn(units, p.departmentCategory) ||
    JSON.stringify(p.normativeUnits) !==
      JSON.stringify(
        financeDepartmentCapNormativeUnits(p.departmentCategory),
      ) ||
    !p.applicability ||
    JSON.stringify(Object.keys(p.applicability).sort()) !==
      JSON.stringify(
        [
          'classificationOriginalRef',
          'classificationOriginalSHA256',
          'governanceRuleRef',
          'governanceRuleSHA256',
        ].sort(),
      ) ||
    ![
      p.applicability.classificationOriginalRef,
      p.applicability.governanceRuleRef,
    ].every(ref) ||
    ![
      p.applicability.classificationOriginalSHA256,
      p.applicability.governanceRuleSHA256,
    ].every(digest)
  )
    invalid();
  Money.from('0', p.currency);
}

/** Exact existing command payload. No approval, payment or source facts may be supplied through it. */
export function financeDepartmentCapSetPayload(
  input: Readonly<{
    policy: FinanceDepartmentCapOnlyPolicy;
    amount: string;
    revisionRef: string;
  }>,
  sha: Sha256Hex,
) {
  const p = input.policy;
  validateFinanceDepartmentCapOnlyPolicy(p);
  if (
    p.envelopeRef !==
    financeDepartmentCapEnvelopeRef(
      {
        worldId: p.worldId,
        countryId: p.countryId,
        governmentEntityId: p.governmentEntityId,
        departmentCategory: p.departmentCategory,
        effectivePeriodRef: p.effectivePeriodRef,
      },
      sha,
    )
  )
    invalid();
  return parseBudgetSourcePayload({
    operation: 'SET_ENVELOPE',
    scope: {
      worldId: p.worldId,
      countryId: p.countryId,
      entityRef: p.governmentEntityId,
      envelopeRef: p.envelopeRef,
      effectivePeriodRef: p.effectivePeriodRef,
    },
    currency: p.currency,
    amount: input.amount,
    envelopeRevisionRef: input.revisionRef,
    lineRef: null,
    revisionRef: input.revisionRef,
    predecessorRevisionRef: null,
  });
}
