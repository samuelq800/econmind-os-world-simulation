/** Native ordinary Finance-administration budget bookkeeping. No payment,
 * source admission, source publication or TEST_ONLY evidence promotion. The
 * Worker must protect actual policy/originals and source cutoff through commit. */
import {
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  createCaptainPoliticalCapitalReplayOrigin,
  replayCaptainPoliticalCapitalAllocation,
  type CaptainPoliticalCapitalReplayState,
} from './captain-political-capital-allocation.js';
import type { PoliticalCapitalSnapshot } from '../engine-kernels/captain-strategy-governance-preparation.js';
import {
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_EVENT,
  assertCentralBankOmoOpeningOriginal,
  prepareCentralBankOmoTransition,
  type CentralBankOmoSourceFacts,
  type OmoSecurityHolding,
} from './central-bank-open-market-operation.js';
import {
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
  createIndustryFirstDayWorkState,
  extendIndustryFirstDayWorkSources,
  replayIndustryFirstDayRunFrame,
  readIndustryFirstDayWorkState,
  readIndustryCompletedWork,
  type IndustryFirstDayWorkSiteSource,
  type IndustryFirstDayWorkState,
} from '../industry/industry-first-day-work.js';
import {
  INDUSTRY_OPERATING_WAGE_COMMAND,
  createIndustryOperatingWageState,
  replayIndustryOperatingWagePayment,
  type IndustryOperatingWageSource,
  type IndustryOperatingWageState,
} from './industry-operating-wage-payment.js';
import {
  INDUSTRY_UTILITY_COMMANDS,
  parseIndustryUtilityIntent,
  type IndustryUtilitySource,
} from './industry-utility-execution.js';
import {
  createIndustryFirstDayPowerState,
  extendIndustryFirstDayPowerOriginals,
  readIndustryFirstDayPowerState,
  replayIndustryFirstDayPowerFrame,
  type IndustryFirstDayPowerOriginal,
  type IndustryFirstDayPowerState,
} from './industry-first-day-power-execution.js';
import {
  createIndustryFirstDayWaterExecutionState,
  extendIndustryFirstDayWaterExecutionOriginals,
  readIndustryFirstDayWaterExecutionState,
  replayIndustryFirstDayWaterExecutionFrame,
  type IndustryFirstDayWaterReplayOriginal,
  type IndustryFirstDayWaterExecutionState,
} from './industry-first-day-water-execution.js';
import {
  mergeIndustryInternalLogisticsReplaySources,
  readIndustryInternalLogisticsReplaySources,
  readIndustryInternalLogisticsExecutionState,
  replayIndustryInternalLogisticsFrame,
  synchronizeIndustryInternalLogisticsExecutionState,
  type IndustryInternalLogisticsReplaySources,
  type IndustryInternalLogisticsExecutionState,
} from '../inventory/industry-internal-logistics-execution.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  POSTWAR_NARROW_GOODS_TYPES,
  replayPostwarNarrowGoodsFrame,
  type PostwarNarrowGoodsReplayEntry,
} from '../transfers/postwar-narrow-trade-mixed-replay.js';
import {
  parseInventoryLedgerSnapshot,
  type InventoryLedgerState,
} from '../inventory/inventory-ledger.js';
import {
  reconcileV08LedgerSnapshots,
  type RebuiltV08Ledgers,
} from '../opening/opening-seed.js';
import { authorizeInventoryLedgerState } from '../opening/ledger-authority.js';
import {
  BENEFICIAL_HOUSING_RENT_COMMAND,
  type BeneficialHousingReclassificationReceipt,
} from '../finance/beneficial-housing-rent.js';
import {
  createBeneficialHousingRentMixedReplayOrigins,
  replayBeneficialHousingRentMixedFrame,
  synchronizeBeneficialHousingRentMixedReplayOrigins,
  type BeneficialHousingRentMixedReplayOrigin,
} from './beneficial-housing-rent-mixed-replay.js';

import { projectCentralBankDayOneValuedSnapshot } from '../finance/central-bank-day-one-valuation.js';
import { Money } from '../numeric/money.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import {
  createFinancialAccount,
  parseFinancialLedgerSnapshot,
  type FinancialAccount,
} from '../finance/financial-ledger.js';
import { authorizeFinancialLedgerState } from '../opening/ledger-authority.js';
import { inheritProductionDepositInstruments } from '../finance/production-deposit-funding.js';
import {
  parsePostwarDayOneFxQuoteData,
  replayPostwarDayOneTreasuryFxFrame,
  type PostwarDayOneFxQuoteData,
  type PostwarDayOneTreasuryFxAccounts,
} from '../finance/postwar-day-one-treasury-fx.js';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from './authenticated-fx-command-contract.js';
import {
  financialAccountId,
  legalEntityId,
  countryId as coreCountryId,
} from '../ids.js';

import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  parseCanonicalCommand,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import { parseBudgetSourcePayload } from './finance-budget-source-transition.js';
import type {
  BudgetPayload,
  BudgetScope,
} from './finance-budget-appropriation.js';
import { FINANCE_BUDGET_APPROPRIATION_COMMAND } from './authenticated-office-command-contract.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  validateAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../events/event.js';
import {
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
  type CommitAuthorizationProof,
} from './receipt.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import type {
  FinancialLedgerState,
  FinancialPosition,
} from '../finance/financial-ledger.js';
import {
  readFinanceBudgetCapacityData,
  type FinanceBudgetCapacityData,
} from './finance-budget-capacity-data.js';
import {
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_POSITION_OFFER_CREATED_EVENT,
  createSocialPositionOfferLifecycleState,
  reduceSocialPositionOfferCreatedEvent,
  type SocialPositionOfferLifecycleState,
  type SocialPositionPayrollReservation,
} from './social-employment-position-lifecycle.js';
import {
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  reduceSocialEmploymentServiceEvent,
  type SocialEmploymentServiceState,
  type SocialEmploymentWageOffer,
} from './social-employment-service.js';
import type { ReplayReducerEvent } from '../replay/replay.js';

export const FINANCE_NATIVE_BUDGET_RULE =
  'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1' as const;
export const FINANCE_NATIVE_BUDGET_EVENT_TYPES = Object.freeze([
  'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1',
  'FINANCE_NATIVE_BUDGET_LINE_CREATED_V1',
  'FINANCE_NATIVE_BUDGET_APPROPRIATED_V1',
  'FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1',
] as const);
export interface FinanceNativeBudgetPolicy {
  readonly schemaVersion: 'finance-native-budget-policy-v1';
  readonly ruleRef: typeof FINANCE_NATIVE_BUDGET_RULE;
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
  readonly programmeOwnerOfficeId: 'FINANCE';
  readonly classification: 'ORDINARY_DEPARTMENTAL';
  readonly funding: 'FULL_UNCONDITIONAL';
  readonly requiredApprovalOffices: readonly ['FINANCE'];
}
export interface FinanceNativeBudgetBinding {
  readonly seedRef: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly financialSourceId: string;
  readonly originalsSHA256: string;
  readonly policyHash: string;
  readonly treasuryAccountId: string;
  readonly treasuryClaimId: string;
  readonly openingEncumbranceHash: string;
  readonly capacityProjectionFingerprint?: string;
  readonly mixedSourceBindingsFingerprint?: string;
}
export interface FinanceNativeBudgetLine {
  readonly lineRef: string;
  readonly revisionRef: string;
  readonly appropriation: string;
  readonly paid: '0';
  readonly outstandingCommitments: '0';
  readonly reserved: '0';
}
export interface FinanceNativeBudgetEnvelope {
  readonly scope: BudgetScope;
  readonly currency: string;
  readonly revisionRef: string;
  readonly cap: string;
  readonly lines: readonly FinanceNativeBudgetLine[];
}
export interface FinanceNativeBudgetState {
  readonly worldId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly envelopes: readonly FinanceNativeBudgetEnvelope[];
}
export interface FinanceNativeBudgetFrame {
  readonly command: CanonicalCommand;
  readonly events: readonly AuthoritativeEvent[];
}
export interface FinanceNativeBudgetCanonicalFrame extends FinanceNativeBudgetFrame {
  readonly transition: AuthoritativeTransition;
  readonly receipt: FinalCommandReceipt;
  readonly inventoryPostings: readonly unknown[];
  readonly financialPostingBatches: readonly unknown[];
}
export interface FinanceNativeBudgetCapacityEncumbrance {
  readonly reference: string;
  readonly accountId: string;
  readonly claimId: string;
  readonly countryId: string;
  readonly governmentEntityId: string;
  readonly currency: string;
  readonly amount: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
  readonly eventId: string;
  readonly policyHash: string;
}
export interface FinanceNativeBudgetMixedSocialCountry {
  readonly countryId: string;
  readonly lifecycle: SocialPositionOfferLifecycleState;
  readonly offerOrigins: readonly {
    readonly positionId: string;
    readonly eventId: string;
    readonly payloadHash: string;
    readonly pointer: '/offer';
    readonly fromSimTime: string;
    readonly fromHead: {
      readonly worldVersion: string;
      readonly eventSequence: string;
    };
  }[];
}
export interface FinanceNativeBudgetMixedCaptainCountry {
  readonly countryId: string;
  readonly state: CaptainPoliticalCapitalReplayState;
}
export interface FinanceNativeBudgetMixedPrefixResult {
  readonly inventoryState?: Readonly<InventoryLedgerState>;
  readonly narrowGoodsTransfers?: readonly PostwarNarrowGoodsReplayEntry[];
  readonly beneficialHousingRentOrigins?: readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[];
  readonly omoCountries?: readonly {
    readonly countryId: string;
    readonly holdings: readonly OmoSecurityHolding[];
  }[];
  readonly captainCountries?: readonly FinanceNativeBudgetMixedCaptainCountry[];
  readonly industryWorkState?: IndustryFirstDayWorkState;
  readonly industryWageState?: Readonly<IndustryOperatingWageState>;
  readonly industryPowerState?: IndustryFirstDayPowerState;
  readonly industryWaterState?: IndustryFirstDayWaterExecutionState;
  /** Scoped private logistics states, never caller-supplied ledger snapshots. */
  readonly industryLogisticsState?: readonly IndustryInternalLogisticsExecutionState[];
  readonly budgetState: FinanceNativeBudgetState;
  readonly budgetEncumbrances: readonly FinanceNativeBudgetCapacityEncumbrance[];
  readonly socialCountries: readonly FinanceNativeBudgetMixedSocialCountry[];
  readonly socialReservations: readonly SocialPositionPayrollReservation[];
  readonly financialState?: Readonly<FinancialLedgerState>;
  readonly currentTreasuryBalances?: readonly FinanceSocialFxCurrentTreasuryBalance[];
  readonly checkpoints: readonly {
    readonly eventId: string;
    readonly countryId: string;
    readonly beforeEmployment: SocialEmploymentServiceState;
    readonly afterEmployment: SocialEmploymentServiceState;
  }[];
}
declare const mixedPrefixBrand: unique symbol;
/** Core replay/lifetime evidence only. Never source admission or commit authority. */
export interface FinanceNativeBudgetMixedPrefixEvidence {
  readonly [mixedPrefixBrand]: true;
}
const mixedPrefixes = new WeakMap<
  object,
  {
    readonly worldId: string;
    readonly framesHash: string;
    readonly completeFrames?: true;
    readonly financialBase?: Readonly<FinancialLedgerState>;
    readonly result: Readonly<FinanceNativeBudgetMixedPrefixResult>;
    readonly foldState: MixedPrefixFoldState;
  }
>();
interface FinanceNativeBudgetSourceBase {
  readonly policy: FinanceNativeBudgetPolicy;
  readonly binding: FinanceNativeBudgetBinding;
  readonly openingEncumbrances: readonly {
    readonly reference: string;
    readonly accountId: string;
    readonly amount: string;
    readonly currency: string;
  }[];
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly mixedPrefixEvidence?: FinanceNativeBudgetMixedPrefixEvidence;
}
export type FinanceNativeBudgetSource = FinanceNativeBudgetSourceBase &
  (
    | {
        readonly frames: readonly FinanceNativeBudgetFrame[];
        readonly pagedPrefix?: never;
      }
    | {
        readonly frames: null;
        readonly pagedPrefix: Readonly<{
          readonly evidence: FinanceNativeBudgetMixedPrefixEvidence;
          /** Last-page bytes bind the privately accumulated full fold; these are
           * explicitly not an all-history frame array or an H0 replacement. */
          readonly lastPageFrames: readonly FinanceNativeBudgetCanonicalFrame[];
        }>;
      }
  ) &
  (
    | {
        readonly financialState: FinancialLedgerState;
        readonly capacityData?: never;
      }
    | {
        readonly capacityData: FinanceBudgetCapacityData;
        readonly financialState?: never;
      }
  );
function invalid(code: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Native budget: ${code}`,
  );
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
const ref = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 256;
const digest = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const integer = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(?:0|[1-9]\d*)$/u.test(v) &&
  v.length <= 19 &&
  BigInt(v) <= 9223372036854775807n;
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function hash(v: unknown, sha: Sha256Hex) {
  return canonicalSha256(canonicalHashInput(v), sha);
}
export function validateFinanceNativeBudgetPolicy(
  policy: FinanceNativeBudgetPolicy,
): void {
  if (
    !policy ||
    policy.schemaVersion !== 'finance-native-budget-policy-v1' ||
    policy.ruleRef !== FINANCE_NATIVE_BUDGET_RULE ||
    ![
      policy.ruleRevision,
      policy.worldId,
      policy.countryId,
      policy.governmentEntityId,
      policy.envelopeRef,
      policy.effectivePeriodRef,
      policy.periodRevision,
    ].every(ref) ||
    !digest(policy.sourceDocumentSHA256) ||
    !integer(policy.validFromSimTime) ||
    !integer(policy.validUntilSimTime) ||
    BigInt(policy.validUntilSimTime) <= BigInt(policy.validFromSimTime) ||
    policy.requestingOfficeId !== 'FINANCE' ||
    policy.programmeOwnerOfficeId !== 'FINANCE' ||
    policy.classification !== 'ORDINARY_DEPARTMENTAL' ||
    policy.funding !== 'FULL_UNCONDITIONAL' ||
    !same(policy.requiredApprovalOffices, ['FINANCE']) ||
    !same(policy.normativeUnits, [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ])
  )
    invalid('UNSUPPORTED_OR_INCOMPLETE_APPROVAL_RULE');
  Money.from('0', policy.currency);
}
function payload(command: CanonicalCommand, sha: Sha256Hex): BudgetPayload {
  validateCanonicalCommand(command, sha);
  if (
    command.commandType !== FINANCE_BUDGET_APPROPRIATION_COMMAND ||
    command.officeId !== 'FINANCE' ||
    !command.idempotencyKey ||
    command.expectedWorldVersion === null
  )
    invalid('CANONICAL_FINANCE_BUDGET_COMMAND_REQUIRED');
  const p = parseBudgetSourcePayload(JSON.parse(command.canonicalPayload));
  if (
    p.scope.worldId !== command.worldId ||
    p.scope.countryId !== command.countryId
  )
    invalid('COMMAND_SCOPE_MISMATCH');
  return p;
}
function apply(
  state: FinanceNativeBudgetState,
  p: BudgetPayload,
): readonly FinanceNativeBudgetEnvelope[] {
  if (
    state.envelopes.some(
      (e) =>
        e.revisionRef === p.revisionRef ||
        e.lines.some((l) => l.revisionRef === p.revisionRef),
    )
  )
    invalid('REVISION_SLOT_OCCUPIED');
  const existing = state.envelopes.find(
    (e) => e.scope.envelopeRef === p.scope.envelopeRef,
  );
  if (p.operation === 'SET_ENVELOPE') {
    if (existing) invalid('ENVELOPE_SLOT_OCCUPIED');
    return [
      ...state.envelopes,
      {
        scope: p.scope,
        currency: p.currency,
        revisionRef: p.revisionRef,
        cap: p.amount,
        lines: [],
      },
    ];
  }
  if (
    !existing ||
    !same(existing.scope, p.scope) ||
    existing.currency !== p.currency ||
    existing.revisionRef !== p.envelopeRevisionRef
  )
    invalid('EXACT_APPROVED_ENVELOPE_REQUIRED');
  if (
    p.lineRef === null ||
    state.envelopes.some((e) => e.lines.some((l) => l.lineRef === p.lineRef))
  )
    invalid('LINE_SLOT_OCCUPIED');
  const total = existing.lines.reduce(
    (v, l) => v.add(Money.from(l.appropriation, p.currency)),
    Money.from(p.amount, p.currency),
  );
  if (total.amount.greaterThan(Money.from(existing.cap, p.currency).amount))
    invalid('ENVELOPE_CAP_EXCEEDED');
  const line: FinanceNativeBudgetLine = {
    lineRef: p.lineRef,
    revisionRef: p.revisionRef,
    appropriation: p.amount,
    paid: '0',
    outstandingCommitments: '0',
    reserved: '0',
  };
  return state.envelopes.map((e) =>
    e === existing ? { ...e, lines: [...e.lines, line] } : e,
  );
}
function checkedPolicy(
  command: CanonicalCommand,
  p: BudgetPayload,
  policy: FinanceNativeBudgetPolicy,
  binding: FinanceNativeBudgetBinding,
  sha: Sha256Hex,
) {
  validateFinanceNativeBudgetPolicy(policy);
  if (
    !same(p.scope, {
      worldId: policy.worldId,
      countryId: policy.countryId,
      entityRef: policy.governmentEntityId,
      envelopeRef: policy.envelopeRef,
      effectivePeriodRef: policy.effectivePeriodRef,
    }) ||
    p.currency !== policy.currency ||
    command.simTime.ticks < BigInt(policy.validFromSimTime) ||
    command.simTime.ticks >= BigInt(policy.validUntilSimTime) ||
    hash(policy, sha) !== binding.policyHash ||
    ![
      binding.seedRef,
      binding.admissionRef,
      binding.financialSourceId,
      binding.treasuryAccountId,
      binding.treasuryClaimId,
    ].every(ref) ||
    ![
      binding.seedFingerprint,
      binding.originalsSHA256,
      binding.openingEncumbranceHash,
    ].every(digest) ||
    (binding.mixedSourceBindingsFingerprint !== undefined &&
      !digest(binding.mixedSourceBindingsFingerprint))
  )
    invalid('PROTECTED_SOURCE_BINDING_MISMATCH');
}
function next(
  state: FinanceNativeBudgetState,
  p: BudgetPayload,
): FinanceNativeBudgetState {
  return {
    worldId: state.worldId,
    worldVersion: (BigInt(state.worldVersion) + 1n).toString(),
    eventSequence: (
      BigInt(state.eventSequence) + (p.operation === 'SET_ENVELOPE' ? 1n : 3n)
    ).toString(),
    envelopes: apply(state, p),
  };
}
function eventPayload(
  command: CanonicalCommand,
  p: BudgetPayload,
  policy: FinanceNativeBudgetPolicy,
  binding: FinanceNativeBudgetBinding,
  before: FinanceNativeBudgetState,
  after: FinanceNativeBudgetState,
  index: number,
  count: number,
  sha: Sha256Hex,
) {
  return {
    schemaVersion: 'finance-native-budget-event-v1',
    commandFingerprint: command.fingerprint,
    payload: p,
    policy,
    binding,
    stateBeforeHash: hash(before, sha),
    stateAfterHash: hash(after, sha),
    intentIndex: String(index),
    intentCount: String(count),
  };
}
function kinds(p: BudgetPayload) {
  return p.operation === 'SET_ENVELOPE'
    ? [FINANCE_NATIVE_BUDGET_EVENT_TYPES[0]]
    : FINANCE_NATIVE_BUDGET_EVENT_TYPES.slice(1);
}
function replayBudgetFrame(
  state: FinanceNativeBudgetState,
  frame: FinanceNativeBudgetFrame,
  sha: Sha256Hex,
): FinanceNativeBudgetState {
  const c = frame.command,
    p = payload(c, sha);
  if (
    c.worldId !== state.worldId ||
    c.expectedWorldVersion !== state.worldVersion
  )
    invalid('COMPLETE_UNIQUE_BUDGET_PREFIX_REQUIRED');
  const after = next(state, p),
    types = kinds(p);
  if (frame.events.length !== types.length)
    invalid('COMPLETE_EVENT_GROUP_REQUIRED');
  for (const [i, event] of frame.events.entries()) {
    validateAuthoritativeEvent(event, sha);
    const body = JSON.parse(event.canonicalPayload) as ReturnType<
      typeof eventPayload
    >;
    checkedPolicy(c, p, body.policy, body.binding, sha);
    if (
      event.worldId !== c.worldId ||
      event.causationCommandId !== c.commandId ||
      event.correlationId !== c.correlationId ||
      event.eventType !== types[i] ||
      event.worldVersion !== after.worldVersion ||
      event.sequence !==
        (BigInt(state.eventSequence) + BigInt(i) + 1n).toString() ||
      event.simTime.ticks !== c.simTime.ticks ||
      !same(
        body,
        eventPayload(
          c,
          p,
          body.policy,
          body.binding,
          state,
          after,
          i,
          types.length,
          sha,
        ),
      )
    )
      invalid('CANONICAL_BUDGET_EVENT_REPLAY_MISMATCH');
  }
  return freeze(after);
}

/** Immutable source data only. The owning Worker still holds/rechecks its own
 * source/admission/auth/lease/head. Neither this token nor a quote grants it. */
export interface FinanceSocialFxOpeningEncumbrance {
  readonly reference: string;
  readonly accountId: string;
  readonly amount: string;
  readonly currency: string;
}
export interface FinanceSocialFxOriginal {
  readonly quote: PostwarDayOneFxQuoteData;
  readonly treasuryAsset: FinancialAccount;
  readonly treasuryLiability: FinancialAccount;
  readonly bankSettlementAsset: FinancialAccount;
  readonly bankSettlementLiability: FinancialAccount;
  readonly bankGcuAsset: FinancialAccount;
}
/** Immutable register/quote DATA. The genuine H0 ledger is independently
 * required; these records grant no issuer, custody or current trading right. */
export interface FinanceSocialOmoOriginal {
  readonly valuationQuote?: NonNullable<
    CentralBankOmoSourceFacts['valuationQuote']
  >;
  readonly countryId: string;
  readonly domesticTreasuryRef: string;
  readonly bank: CentralBankOmoSourceFacts['bank'];
  readonly centralBank: CentralBankOmoSourceFacts['centralBank'];
  readonly bankAccounts: CentralBankOmoSourceFacts['bankAccounts'];
  readonly centralBankAccounts: CentralBankOmoSourceFacts['centralBankAccounts'];
  readonly holdings: readonly OmoSecurityHolding[];
  readonly quotes: readonly CentralBankOmoSourceFacts['quote'][];
}
export interface FinanceSocialFxCurrentTreasuryBalance {
  readonly countryId: string;
  readonly accountId: string;
  readonly claimId: string;
  readonly ownerId: string;
  readonly currency: string;
  readonly amount: string;
}
declare const financialReplayBase: unique symbol;
export interface FinanceNativeBudgetFinancialReplayBase {
  readonly [financialReplayBase]: true;
}
const financialReplayBases = new WeakMap<
  FinanceNativeBudgetFinancialReplayBase,
  {
    readonly financial: Readonly<FinancialLedgerState>;
    readonly seedFingerprint?: string;
    readonly inventory?: Readonly<InventoryLedgerState>;
    readonly openingEncumbrances: readonly FinanceSocialFxOpeningEncumbrance[];
    readonly fxOriginals: ReadonlyMap<string, FinanceSocialFxOriginal>;
    readonly omoOriginals: ReadonlyMap<string, FinanceSocialOmoOriginal>;
    readonly beneficialHousingRentOrigins?: readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[];
  }
>();
type MixedFinancialReplayData = NonNullable<
  ReturnType<typeof financialReplayBases.get>
>;
interface MixedSocialCountryCursor {
  countryId: string;
  lifecycle: SocialPositionOfferLifecycleState;
  offerOrigins: FinanceNativeBudgetMixedSocialCountry['offerOrigins'][number][];
}
/** In-process deterministic data only. It is issued by the same existing fold,
 * not reconstructed from a snapshot DTO, a supplied head or a database cache. */
interface MixedPrefixFoldState {
  readonly industryPowerState: IndustryFirstDayPowerState | undefined;
  readonly industryWaterState: IndustryFirstDayWaterExecutionState | undefined;
  readonly industryWaterOriginals: ReadonlyMap<
    string,
    IndustryFirstDayWaterReplayOriginal
  >;
  readonly industryLogisticsState: readonly IndustryInternalLogisticsExecutionState[];
  readonly industryLogisticsSources: readonly IndustryInternalLogisticsReplaySources[];
  readonly industryWorkState: IndustryFirstDayWorkState | undefined;
  readonly industryWageState: Readonly<IndustryOperatingWageState> | undefined;
  readonly industryWageSources: ReadonlyMap<
    string,
    IndustryOperatingWageSource
  >;
  readonly financialReplay: MixedFinancialReplayData | undefined;
  readonly captainEnabled: boolean;
  readonly captains: ReadonlyMap<string, CaptainPoliticalCapitalReplayState>;
  readonly financial: Readonly<FinancialLedgerState> | undefined;
  readonly inventory: Readonly<InventoryLedgerState> | undefined;
  readonly goodsEntries: ReadonlyMap<string, PostwarNarrowGoodsReplayEntry>;
  readonly rentOrigins:
    readonly Readonly<BeneficialHousingRentMixedReplayOrigin>[] | undefined;
  readonly omoHoldings: ReadonlyMap<string, readonly OmoSecurityHolding[]>;
  readonly budget: FinanceNativeBudgetState;
  readonly countries: ReadonlyMap<string, MixedSocialCountryCursor>;
  readonly positionCountries: ReadonlyMap<string, string>;
  readonly poolCountries: ReadonlyMap<string, string>;
  readonly caps: ReadonlyMap<string, FinanceNativeBudgetCapacityEncumbrance>;
  readonly commandIds: ReadonlySet<string>;
  readonly keys: ReadonlySet<string>;
  readonly eventIds: ReadonlySet<string>;
  readonly lastSimTime: bigint;
  readonly originalReferences: ReadonlyMap<string, string>;
}
export function prepareFinanceNativeBudgetFinancialReplay(
  input: {
    readonly financial: Readonly<FinancialLedgerState>;
    readonly opening?: Readonly<RebuiltV08Ledgers>;
    readonly openingEncumbrances: readonly FinanceSocialFxOpeningEncumbrance[];
    readonly fxOriginals: readonly FinanceSocialFxOriginal[];
    readonly omoOriginals?: readonly FinanceSocialOmoOriginal[];
    readonly beneficialHousingRentReceipts?: readonly Readonly<BeneficialHousingReclassificationReceipt>[];
  },
  sha: Sha256Hex,
): FinanceNativeBudgetFinancialReplayBase {
  const base = input.financial;
  if (!isAuthoritativeFinancialLedgerState(base) || base.worldVersion !== '0')
    invalid('GENUINE_H0_FINANCIAL_REPLAY_BASE_REQUIRED');
  if (input.opening !== undefined) {
    reconcileV08LedgerSnapshots({
      reconstructed: input.opening,
      sha256Hex: sha,
    });
    if (
      input.opening.financial !== base ||
      input.opening.worldVersion !== '0' ||
      input.opening.inventory.worldVersion !== '0'
    )
      invalid('EXACT_GENUINE_PAIRED_H0_LEDGER_BASE_REQUIRED');
  }
  const seen = new Set<string>(),
    totals = new Map<string, Money>();
  const opening = input.openingEncumbrances.map((r) => {
    if (!r || !ref(r.reference) || seen.has(r.reference))
      invalid('UNIQUE_OPENING_ENCUMBRANCE_REQUIRED');
    seen.add(r.reference);
    const a = base.accounts.find((a) => a.accountId === r.accountId);
    if (!a || a.currency !== r.currency)
      invalid('OPENING_ENCUMBRANCE_ORIGINAL_ACCOUNT_REQUIRED');
    const m = Money.from(r.amount, r.currency);
    if (m.amount.isNegative() || canonicalDecimal(m.amount) !== r.amount)
      invalid('EXACT_OPENING_ENCUMBRANCE_AMOUNT_REQUIRED');
    totals.set(
      a.accountId,
      (totals.get(a.accountId) ?? Money.from('0', a.currency)).add(m),
    );
    return Object.freeze({ ...r });
  });
  for (const [id, amount] of totals) {
    const a = base.accounts.find((a) => a.accountId === id)!;
    const balance =
      base.positions.find((p) => p.account.accountId === id)?.netDebitBalance ??
      Money.from('0', a.currency);
    if (amount.amount.greaterThan(balance.amount))
      invalid('OPENING_ENCUMBRANCE_EXCEEDS_ACTUAL_BALANCE');
  }
  const originals = new Map<string, FinanceSocialFxOriginal>();
  let seed: string | undefined;
  for (const r of input.fxOriginals) {
    const q = parsePostwarDayOneFxQuoteData(r.quote, sha);
    if (
      q.worldId !== base.worldId ||
      originals.has(q.quoteRef) ||
      (seed !== undefined && seed !== q.seedFingerprint)
    )
      invalid('EXACT_UNIQUE_FX_ORIGINAL_WORLD_REQUIRED');
    seed = q.seedFingerprint;
    for (const key of [
      'treasuryAsset',
      'treasuryLiability',
      'bankSettlementAsset',
      'bankSettlementLiability',
      'bankGcuAsset',
    ] as const) {
      const a = createFinancialAccount(r[key]);
      if (
        !same(
          a,
          base.accounts.find((b) => b.accountId === a.accountId),
        ) ||
        a.worldId !== base.worldId ||
        a.countryId !== q.countryId
      )
        invalid('FX_ORIGINAL_DIFFERS_FROM_GENUINE_H0_LEDGER');
    }
    if (r.bankGcuAsset.accountId !== q.dealerGcuAccountId)
      invalid('EXACT_FX_BANK_CASH_ORIGINAL_REQUIRED');
    originals.set(q.quoteRef, freeze({ ...r, quote: q }));
  }
  const token = Object.freeze({}) as FinanceNativeBudgetFinancialReplayBase;
  const omoOriginals = new Map<string, FinanceSocialOmoOriginal>();
  if ((input.omoOriginals?.length ?? 0) > 70)
    invalid('BOUNDED_OMO_COUNTRY_ORIGINALS_REQUIRED');
  for (const original of input.omoOriginals ?? []) {
    if (
      !ref(original.countryId) ||
      omoOriginals.has(original.countryId) ||
      !Array.isArray(original.quotes) ||
      !original.quotes.length ||
      original.quotes.length > 256
    )
      invalid('UNIQUE_COMPLETE_OMO_ORIGINAL_REQUIRED');
    assertCentralBankOmoOpeningOriginal({
      financialState: base,
      worldId: base.worldId,
      ...original,
      sha256Hex: sha,
    });
    const quotes = new Set<string>();
    for (const quote of original.quotes) {
      if (
        !ref(quote.quoteRef) ||
        quotes.has(quote.quoteRef) ||
        quote.issuerRef !== original.domesticTreasuryRef ||
        quote.currency !== original.bank.currency ||
        !integer(quote.worldVersion) ||
        !integer(quote.validAtSimTime)
      )
        invalid('UNIQUE_EXACT_OMO_QUOTE_ORIGINAL_REQUIRED');
      quotes.add(quote.quoteRef);
    }
    omoOriginals.set(original.countryId, freeze({ ...original }));
  }
  const beneficialHousingRentOrigins =
    input.beneficialHousingRentReceipts === undefined
      ? undefined
      : createBeneficialHousingRentMixedReplayOrigins({
          financial: base,
          ...(input.opening === undefined
            ? {}
            : { seedFingerprint: input.opening.seedFingerprint }),
          receipts: input.beneficialHousingRentReceipts,
        });
  financialReplayBases.set(token, {
    ...(beneficialHousingRentOrigins === undefined
      ? {}
      : { beneficialHousingRentOrigins }),
    financial: base,
    ...(input.opening === undefined
      ? {}
      : {
          inventory: input.opening.inventory,
          seedFingerprint: input.opening.seedFingerprint,
        }),
    openingEncumbrances: Object.freeze(opening),
    fxOriginals: originals,
    omoOriginals,
  });
  return token;
}
function financialAtVersion(
  state: Readonly<FinancialLedgerState>,
  worldVersion: string,
): Readonly<FinancialLedgerState> {
  if (state.worldVersion === worldVersion) return state;
  const next = authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({ ...state, worldVersion }),
  );
  inheritProductionDepositInstruments(next, state);
  return next;
}
function completeFrameHash(
  frames: readonly FinanceNativeBudgetFrame[],
  sha: Sha256Hex,
) {
  return hash(frames, sha);
}
/** A same-world different opening ledger cannot borrow a replayed balance. */
export function readFinanceNativeBudgetMixedFinancialState(input: {
  readonly evidence: FinanceNativeBudgetMixedPrefixEvidence;
  readonly financialBase: Readonly<FinancialLedgerState>;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly sha256Hex: Sha256Hex;
}): Readonly<FinancialLedgerState> {
  const result = readFinanceNativeBudgetMixedPrefix(
    input.evidence,
    input.financialBase.worldId,
    input.frames,
    input.sha256Hex,
    input.financialBase,
  );
  if (!result.financialState)
    invalid('EXACT_GENUINE_FINANCIAL_REPLAY_BASE_REQUIRED');
  return result.financialState;
}
function frameHash(
  frames: readonly FinanceNativeBudgetFrame[],
  sha: Sha256Hex,
) {
  return hash(
    frames.map((f) => ({ command: f.command, events: f.events })),
    sha,
  );
}
export function readFinanceNativeBudgetMixedPrefix(
  evidence: FinanceNativeBudgetMixedPrefixEvidence,
  worldId: string,
  frames: readonly FinanceNativeBudgetFrame[],
  sha: Sha256Hex,
  financialBase?: Readonly<FinancialLedgerState>,
): Readonly<FinanceNativeBudgetMixedPrefixResult> {
  const issued = mixedPrefixes.get(evidence);
  if (
    !issued ||
    issued.worldId !== worldId ||
    issued.framesHash !==
      (issued.completeFrames
        ? completeFrameHash(frames, sha)
        : frameHash(frames, sha))
  )
    invalid('GENUINE_EXACT_MIXED_PREFIX_EVIDENCE_REQUIRED');
  if (
    financialBase !== undefined &&
    issued.result.financialState !== undefined &&
    issued.financialBase !== financialBase
  )
    invalid('EXACT_GENUINE_FINANCIAL_REPLAY_BASE_REQUIRED');
  return issued.result;
}
/** Whole ordered canonical groups only. The existing Budget/Social reducers
 * establish effects; no caller no-effect classification or filtered/rebased
 * budget prefix exists. All foreign families remain unsupported. */
export interface FinanceNativeBudgetMixedPrefixInput {
  readonly worldId: string;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly industryWorkSources?: readonly IndustryFirstDayWorkSiteSource[];
  readonly industryWageSources?: readonly IndustryOperatingWageSource[];
  readonly industryPowerOriginals?: readonly IndustryFirstDayPowerOriginal[];
  readonly industryWaterOriginals?: readonly IndustryFirstDayWaterReplayOriginal[];
  readonly industryLogisticsSources?: readonly IndustryInternalLogisticsReplaySources[];
  readonly financialReplay?: FinanceNativeBudgetFinancialReplayBase;
  /** Immutable original DATA; no default capital, callback or admission flag. */
  readonly captainCountries?: readonly {
    readonly countryId: string;
    readonly capital: PoliticalCapitalSnapshot;
  }[];
  readonly socialCountries: readonly {
    readonly countryId: string;
    readonly state: SocialEmploymentServiceState;
    readonly offers: readonly SocialEmploymentWageOffer[];
  }[];
}
export function prepareFinanceNativeBudgetMixedPrefix(
  input: FinanceNativeBudgetMixedPrefixInput,
  sha: Sha256Hex,
): FinanceNativeBudgetMixedPrefixEvidence {
  return foldFinanceNativeBudgetMixedPrefix(input, sha);
}
/** Continuation data is recoverable only from privately issued complete Core
 * evidence. Caller-supplied domain state/version cannot enter this seam. */
export function continueFinanceNativeBudgetMixedPrefix(
  input: {
    readonly previous: FinanceNativeBudgetMixedPrefixEvidence;
    readonly worldId: string;
    readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
    readonly financialReplay?: FinanceNativeBudgetFinancialReplayBase;
    readonly captainCountries?: FinanceNativeBudgetMixedPrefixInput['captainCountries'];
    readonly industryWorkSources?: FinanceNativeBudgetMixedPrefixInput['industryWorkSources'];
    readonly industryWageSources?: FinanceNativeBudgetMixedPrefixInput['industryWageSources'];
    readonly industryPowerOriginals?: FinanceNativeBudgetMixedPrefixInput['industryPowerOriginals'];
    readonly industryWaterOriginals?: FinanceNativeBudgetMixedPrefixInput['industryWaterOriginals'];
    readonly industryLogisticsSources?: FinanceNativeBudgetMixedPrefixInput['industryLogisticsSources'];
  },
  sha: Sha256Hex,
): FinanceNativeBudgetMixedPrefixEvidence {
  const issued = mixedPrefixes.get(input.previous);
  if (
    !issued ||
    issued.worldId !== input.worldId ||
    !issued.completeFrames ||
    !issued.foldState.financialReplay?.inventory
  )
    invalid('GENUINE_PAIRED_COMPLETE_PREFIX_CONTINUATION_REQUIRED');
  const originalReferences = new Map(issued.foldState.originalReferences);
  const retainOriginal = (reference: string, value: unknown) => {
    const fingerprint = hash(value, sha),
      previous = originalReferences.get(reference);
    if (previous !== undefined && previous !== fingerprint)
      invalid('CONTINUATION_IMMUTABLE_ORIGINAL_REFERENCE_CHANGED');
    originalReferences.set(reference, fingerprint);
  };
  let financialReplay = issued.foldState.financialReplay;
  const omoHoldings = new Map(issued.foldState.omoHoldings),
    captains = new Map(issued.foldState.captains);
  if (input.financialReplay !== undefined) {
    const incoming = financialReplayBases.get(input.financialReplay);
    if (
      !incoming ||
      !financialReplay ||
      incoming.financial !== financialReplay.financial ||
      incoming.inventory !== financialReplay.inventory ||
      !same(incoming.openingEncumbrances, financialReplay.openingEncumbrances)
    )
      invalid('CONTINUATION_EXACT_GENUINE_H0_ORIGINALS_REQUIRED');
    const fxOriginals = new Map(financialReplay.fxOriginals),
      omoOriginals = new Map(financialReplay.omoOriginals);
    for (const [ref, original] of incoming.fxOriginals) {
      retainOriginal('FX:' + ref, original);
      fxOriginals.set(ref, original);
    }
    for (const [countryId, original] of incoming.omoOriginals) {
      retainOriginal('OMO:' + countryId, { ...original, quotes: [] });
      for (const quote of original.quotes)
        retainOriginal('OMO_QUOTE:' + countryId + ':' + quote.quoteRef, quote);
      // Actual holdings are carried forward. The page only supplies the
      // immutable H0 source plus this page's genuine quote facts.
      if (!omoHoldings.has(countryId))
        omoHoldings.set(countryId, original.holdings);
      omoOriginals.set(countryId, original);
    }
    if (omoOriginals.size > 70)
      invalid('BOUNDED_OMO_COUNTRY_ORIGINALS_REQUIRED');
    financialReplay = { ...financialReplay, fxOriginals, omoOriginals };
  }
  if ((input.captainCountries?.length ?? 0) > 70)
    invalid('BOUNDED_EXPLICIT_CAPTAIN_ORIGINALS_REQUIRED');
  for (const original of input.captainCountries ?? []) {
    retainOriginal('CAPTAIN:' + original.countryId, original.capital);
    if (!captains.has(original.countryId)) {
      const origin = createCaptainPoliticalCapitalReplayOrigin({
        worldId: input.worldId,
        ...original,
      });
      // A missing country could not have produced a previous Captain frame:
      // that would already have failed the same complete fold. Prior frames
      // were genuinely reduced siblings, so Core may synchronize this origin.
      captains.set(
        original.countryId,
        freeze({
          ...origin,
          worldVersion: issued.foldState.budget.worldVersion,
          lastEventSequence: issued.foldState.budget.eventSequence,
        }),
      );
    }
  }
  if (captains.size > 70)
    invalid('BOUNDED_EXPLICIT_CAPTAIN_ORIGINALS_REQUIRED');
  let industryWorkState = issued.foldState.industryWorkState;
  if (input.industryWorkSources?.length) {
    for (const value of input.industryWorkSources) {
      if (
        value.seedFingerprint !== financialReplay?.seedFingerprint ||
        value.worldId !== input.worldId
      )
        invalid('INDUSTRY_EXACT_GENUINE_PAIRED_H0_SOURCE_REQUIRED');
      retainOriginal(
        'INDUSTRY_WORK:' + value.countryId + ':' + value.facilityId,
        value,
      );
    }
    industryWorkState = industryWorkState
      ? extendIndustryFirstDayWorkSources(
          industryWorkState,
          input.industryWorkSources,
        )
      : createIndustryFirstDayWorkState(input.industryWorkSources);
  }
  const industryWageSources = new Map(issued.foldState.industryWageSources);
  for (const value of input.industryWageSources ?? []) {
    const key = value.countryId + '\0' + value.facilityId + '\0' + value.runId;
    retainOriginal('INDUSTRY_WAGE:' + key, value);
    industryWageSources.set(key, value);
  }
  const prior: MixedPrefixFoldState = {
    ...issued.foldState,
    industryWorkState,
    industryWageSources,
    financialReplay,
    omoHoldings,
    captains,
    originalReferences,
    captainEnabled: issued.foldState.captainEnabled || captains.size > 0,
  };
  return foldFinanceNativeBudgetMixedPrefix(
    {
      worldId: input.worldId,
      frames: input.frames,
      socialCountries: [],
      ...(input.industryPowerOriginals === undefined
        ? {}
        : { industryPowerOriginals: input.industryPowerOriginals }),
      ...(input.industryWaterOriginals === undefined
        ? {}
        : { industryWaterOriginals: input.industryWaterOriginals }),
      ...(input.industryLogisticsSources === undefined
        ? {}
        : { industryLogisticsSources: input.industryLogisticsSources }),
    },
    sha,
    prior,
  );
}
function utilityOriginalKey(source: IndustryUtilitySource): string {
  return canonicalSerialize([
    source.worldId,
    source.countryId,
    source.facilityId,
    source.runId,
    source.sourceRef,
  ]);
}
function requireUtilityOpening(
  source: IndustryUtilitySource,
  worldId: string,
  financialReplay: MixedFinancialReplayData | undefined,
): void {
  if (
    !financialReplay?.inventory ||
    !financialReplay.seedFingerprint ||
    source.worldId !== worldId ||
    source.seedFingerprint !== financialReplay.seedFingerprint
  )
    invalid('UTILITY_EXACT_GENUINE_PAIRED_H0_SOURCE_REQUIRED');
}
/** One derived consistency check over actual private work records. It creates
 * no people/work ledger. Logistics service time and canonical Industry WORK
 * must not spend the same regional population ordinals twice, in either order.
 * Sweep range boundaries rather than enumerate potentially billions of people. */
function assertUtilityWorkerTimeConserved(
  work: IndustryFirstDayWorkState | undefined,
  logistics: readonly IndustryInternalLogisticsExecutionState[],
): void {
  const service = logistics.flatMap((state) =>
    readIndustryInternalLogisticsExecutionState(state).transfers.flatMap(
      (transfer) => transfer.work?.allocations ?? [],
    ),
  );
  if (!service.length) return;
  if (!work) invalid('ACTUAL_UTILITY_WORKER_ORIGINALS_REQUIRED');
  type Range = {
    readonly ordinal: bigint;
    readonly from: bigint;
    readonly until: bigint;
    readonly duration: bigint;
  };
  type Boundary = {
    readonly at: bigint;
    readonly add: boolean;
    readonly row: Range;
  };
  const regions = new Map<string, Boundary[]>();
  for (const allocation of [
    ...readIndustryFirstDayWorkState(work).bookings,
    ...service,
  ]) {
    const start = BigInt(allocation.startOrdinal),
      count = BigInt(allocation.count),
      from = BigInt(allocation.startsAtSimTime),
      until = BigInt(allocation.endsAtSimTime);
    if (count <= 0n || until <= from)
      invalid('ACTUAL_UTILITY_WORKER_RANGE_REQUIRED');
    const row = { ordinal: start, from, until, duration: until - from },
      boundaries = regions.get(allocation.regionId) ?? [];
    boundaries.push(
      { at: start, add: true, row },
      { at: start + count, add: false, row },
    );
    regions.set(allocation.regionId, boundaries);
  }
  for (const boundaries of regions.values()) {
    boundaries.sort((a, b) =>
      a.at < b.at ? -1 : a.at > b.at ? 1 : Number(a.add) - Number(b.add),
    );
    const active: Range[] = [];
    let total = 0n;
    for (const boundary of boundaries) {
      const row = boundary.row;
      if (!boundary.add) {
        const index = active.indexOf(row);
        if (index < 0) invalid('ACTUAL_UTILITY_WORKER_RANGE_REQUIRED');
        active.splice(index, 1);
        total -= row.duration;
        continue;
      }
      let lo = 0,
        hi = active.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (active[mid]!.from < row.from) lo = mid + 1;
        else hi = mid;
      }
      if (
        (lo > 0 && active[lo - 1]!.until > row.from) ||
        (lo < active.length && active[lo]!.from < row.until)
      )
        invalid('ACTUAL_UTILITY_WORKER_TIME_OVERLAP');
      total += row.duration;
      if (total > 28800000n)
        invalid('ACTUAL_UTILITY_WORKER_480_MINUTES_EXCEEDED');
      active.splice(lo, 0, row);
    }
  }
}
function foldFinanceNativeBudgetMixedPrefix(
  input: FinanceNativeBudgetMixedPrefixInput,
  sha: Sha256Hex,
  prior?: MixedPrefixFoldState,
): FinanceNativeBudgetMixedPrefixEvidence {
  const financialReplay =
    prior?.financialReplay ??
    (input.financialReplay === undefined
      ? undefined
      : financialReplayBases.get(input.financialReplay));
  if (
    input.financialReplay !== undefined &&
    (!financialReplay || financialReplay.financial.worldId !== input.worldId)
  )
    invalid('GENUINE_SAME_WORLD_FINANCIAL_REPLAY_REQUIRED');
  if (financialReplay && input.frames.length > 256)
    invalid('BOUNDED_COMPLETE_FINANCIAL_PREFIX_REQUIRED');
  if (
    (input.industryWorkSources?.length ?? 0) > 2048 ||
    (input.industryWageSources?.length ?? 0) > 4096 ||
    (input.industryPowerOriginals?.length ?? 0) > 4096 ||
    (input.industryWaterOriginals?.length ?? 0) > 4096 ||
    (input.industryLogisticsSources?.length ?? 0) > 2048
  )
    invalid('BOUNDED_INDUSTRY_ORIGINALS_REQUIRED');
  let industryWorkState =
    prior?.industryWorkState ??
    (input.industryWorkSources?.length
      ? createIndustryFirstDayWorkState(input.industryWorkSources)
      : undefined);
  const industryWageSources = new Map<string, IndustryOperatingWageSource>(
    prior?.industryWageSources,
  );
  for (const value of prior ? [] : (input.industryWageSources ?? [])) {
    const key = value.countryId + '\0' + value.facilityId + '\0' + value.runId;
    if (industryWageSources.has(key))
      invalid('UNIQUE_INDUSTRY_WAGE_ORIGINAL_REQUIRED');
    industryWageSources.set(key, value);
  }
  if (
    industryWorkState &&
    (!financialReplay?.inventory ||
      !financialReplay.seedFingerprint ||
      (input.industryWorkSources ?? []).some(
        (value) => value.seedFingerprint !== financialReplay.seedFingerprint,
      ))
  )
    invalid('INDUSTRY_EXACT_GENUINE_PAIRED_H0_SOURCE_REQUIRED');
  let industryWageState = prior?.industryWageState;
  if (
    industryWorkState &&
    !industryWageState &&
    financialReplay?.seedFingerprint
  )
    industryWageState = createIndustryOperatingWageState({
      financial: financialReplay.financial,
      seedFingerprint: financialReplay.seedFingerprint,
    });
  let industryPowerState = prior?.industryPowerState;
  if (input.industryPowerOriginals?.length) {
    for (const original of input.industryPowerOriginals)
      requireUtilityOpening(original.source, input.worldId, financialReplay);
    industryPowerState = industryPowerState
      ? extendIndustryFirstDayPowerOriginals(
          industryPowerState,
          input.industryPowerOriginals,
          sha,
        )
      : createIndustryFirstDayPowerState(input.industryPowerOriginals, sha);
  }
  if (industryPowerState) {
    const state = readIndustryFirstDayPowerState(industryPowerState, sha);
    if (
      state.worldId !== input.worldId ||
      state.seedFingerprint !== financialReplay?.seedFingerprint
    )
      invalid('UTILITY_EXACT_GENUINE_PAIRED_H0_SOURCE_REQUIRED');
  }
  let industryWaterState = prior?.industryWaterState;
  const industryWaterOriginals = new Map(prior?.industryWaterOriginals);
  if (input.industryWaterOriginals?.length) {
    for (const original of input.industryWaterOriginals)
      requireUtilityOpening(original.source, input.worldId, financialReplay);
    if (!industryWaterState) {
      const first = input.industryWaterOriginals.find(
        (o) => o.scenario !== undefined,
      );
      if (!first?.scenario)
        invalid('ACTUAL_UTILITY_WATER_H0_SCENARIO_REQUIRED');
      industryWaterState = createIndustryFirstDayWaterExecutionState(
        { scenario: first.scenario, source: first.source },
        sha,
      );
    }
    industryWaterState = extendIndustryFirstDayWaterExecutionOriginals(
      { state: industryWaterState, originals: input.industryWaterOriginals },
      sha,
    );
    for (const original of input.industryWaterOriginals)
      industryWaterOriginals.set(utilityOriginalKey(original.source), original);
  }
  if (industryWaterState) {
    const state = readIndustryFirstDayWaterExecutionState(
      industryWaterState,
      sha,
    );
    if (
      state.worldId !== input.worldId ||
      state.seedFingerprint !== financialReplay?.seedFingerprint
    )
      invalid('UTILITY_EXACT_GENUINE_PAIRED_H0_SOURCE_REQUIRED');
  }
  const industryLogisticsSources = mergeIndustryInternalLogisticsReplaySources(
    prior?.industryLogisticsSources ?? [],
    input.industryLogisticsSources ?? [],
    sha,
  );
  for (const original of industryLogisticsSources) {
    const row = readIndustryInternalLogisticsReplaySources(original);
    if (
      row.worldId !== input.worldId ||
      row.seedFingerprint !== financialReplay?.seedFingerprint ||
      !financialReplay?.inventory
    )
      invalid('UTILITY_EXACT_GENUINE_PAIRED_H0_SOURCE_REQUIRED');
    for (const source of row.utilitySources)
      requireUtilityOpening(source, input.worldId, financialReplay);
  }
  let industryLogisticsState = [...(prior?.industryLogisticsState ?? [])];
  // The opening reservation is an account aggregate. Only actually paid,
  // genuinely replayed wage releases reduce that exact immutable reference.
  // Recompute from the original amount on each frame; never release a carry.
  const currentOpeningEncumbrances = () => {
    if (!financialReplay) return [];
    const originals = new Map(
      financialReplay.openingEncumbrances.map((r) => [r.reference, r]),
    );
    const released = new Map<string, Money>();
    const seen = new Set<string>();
    for (const r of industryWageState?.reservationReleases ?? []) {
      const original = originals.get(r.openingEncumbranceRef);
      if (
        !original ||
        original.accountId !== r.accountId ||
        original.currency !== r.currency ||
        seen.has(r.reservationId)
      )
        invalid('EXACT_OPENING_WAGE_RESERVATION_RELEASE_REQUIRED');
      seen.add(r.reservationId);
      const amount = Money.from(r.amount, r.currency);
      if (amount.amount.isNegative()) invalid('NEGATIVE_OPENING_WAGE_RELEASE');
      released.set(
        original.reference,
        (released.get(original.reference) ?? Money.from('0', r.currency)).add(
          amount,
        ),
      );
    }
    return financialReplay.openingEncumbrances.map((r) => {
      const paid = released.get(r.reference) ?? Money.from('0', r.currency);
      const remaining = Money.from(r.amount, r.currency).subtract(paid);
      if (remaining.amount.isNegative())
        invalid('WAGE_RELEASE_EXCEEDS_OPENING_RESERVATION');
      return { ...r, amount: canonicalDecimal(remaining.amount) };
    });
  };
  const captainEnabled =
    prior?.captainEnabled ?? input.captainCountries !== undefined;
  if (
    !prior &&
    captainEnabled &&
    (!input.captainCountries!.length ||
      input.captainCountries!.length > 70 ||
      input.frames.length > 256)
  )
    invalid('BOUNDED_EXPLICIT_CAPTAIN_ORIGINALS_REQUIRED');
  const captains = new Map<string, CaptainPoliticalCapitalReplayState>(
    prior?.captains,
  );
  const originalReferences = new Map(prior?.originalReferences);
  const retainUtilityOriginal = (
    kind: string,
    source: IndustryUtilitySource,
  ) => {
    const key = kind + ':' + utilityOriginalKey(source),
      { originals, ...base } = source;
    const retain = (reference: string, value: unknown) => {
      const digest = hash(value, sha),
        old = originalReferences.get(reference);
      if (old !== undefined && old !== digest)
        invalid('CONTINUATION_IMMUTABLE_UTILITY_ORIGINAL_CHANGED');
      originalReferences.set(reference, digest);
    };
    retain(key, base);
    if (!Array.isArray(originals) || !originals.length || originals.length > 64)
      invalid('BOUNDED_UTILITY_SOURCE_ORIGINALS_REQUIRED');
    for (const row of originals)
      retain(key + ':' + row.kind + ':' + row.reference, row);
  };
  if (industryPowerState)
    for (const original of readIndustryFirstDayPowerState(
      industryPowerState,
      sha,
    ).originals)
      retainUtilityOriginal('POWER', original.source);
  for (const original of industryWaterOriginals.values())
    retainUtilityOriginal('WATER', original.source);
  for (const token of industryLogisticsSources)
    for (const original of readIndustryInternalLogisticsReplaySources(token)
      .utilitySources)
      retainUtilityOriginal('LOGISTICS', original);
  if (!prior) {
    for (const value of input.industryWorkSources ?? [])
      originalReferences.set(
        'INDUSTRY_WORK:' + value.countryId + ':' + value.facilityId,
        hash(value, sha),
      );
    for (const [key, value] of industryWageSources)
      originalReferences.set('INDUSTRY_WAGE:' + key, hash(value, sha));
    for (const [ref, original] of financialReplay?.fxOriginals ?? [])
      originalReferences.set('FX:' + ref, hash(original, sha));
    for (const [countryId, original] of financialReplay?.omoOriginals ?? []) {
      originalReferences.set(
        'OMO:' + countryId,
        hash({ ...original, quotes: [] }, sha),
      );
      for (const quote of original.quotes)
        originalReferences.set(
          'OMO_QUOTE:' + countryId + ':' + quote.quoteRef,
          hash(quote, sha),
        );
    }
    for (const original of input.captainCountries ?? [])
      originalReferences.set(
        'CAPTAIN:' + original.countryId,
        hash(original.capital, sha),
      );
  }
  for (const original of prior ? [] : (input.captainCountries ?? [])) {
    if (captains.has(original.countryId))
      invalid('UNIQUE_CAPTAIN_COUNTRY_ORIGINAL_REQUIRED');
    captains.set(
      original.countryId,
      createCaptainPoliticalCapitalReplayOrigin({
        worldId: input.worldId,
        ...original,
      }),
    );
  }
  let financial = prior?.financial ?? financialReplay?.financial;
  let inventory = prior?.inventory ?? financialReplay?.inventory;
  let goodsEntries: ReadonlyMap<string, PostwarNarrowGoodsReplayEntry> =
    new Map(prior?.goodsEntries);
  let rentOrigins =
    prior?.rentOrigins ?? financialReplay?.beneficialHousingRentOrigins;
  const omoHoldings = new Map<string, readonly OmoSecurityHolding[]>(
    prior?.omoHoldings ??
      [...(financialReplay?.omoOriginals ?? [])].map(
        ([countryId, original]) => [countryId, original.holdings],
      ),
  );
  let budget: FinanceNativeBudgetState = prior?.budget ?? {
    worldId: input.worldId,
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
  };
  const countries = new Map<string, MixedSocialCountryCursor>(
    [...(prior?.countries ?? [])].map(([id, country]) => [
      id,
      {
        ...country,
        offerOrigins: [...country.offerOrigins],
      },
    ]),
  );
  const positionCountries = new Map<string, string>(prior?.positionCountries),
    poolCountries = new Map<string, string>(prior?.poolCountries);
  for (const c of prior ? [] : input.socialCountries) {
    if (countries.has(c.countryId) || c.state.worldId !== input.worldId)
      invalid('UNIQUE_SAME_WORLD_SOCIAL_ORIGINALS_REQUIRED');
    for (const p of c.state.labour.positions) {
      if (p.countryId !== c.countryId || positionCountries.has(p.positionId))
        invalid('UNIQUE_COUNTRY_POSITION_ORIGINALS_REQUIRED');
      positionCountries.set(p.positionId, c.countryId);
    }
    for (const p of c.state.servicePools) {
      if (p.countryId !== c.countryId || poolCountries.has(p.poolId))
        invalid('UNIQUE_COUNTRY_POOL_ORIGINALS_REQUIRED');
      poolCountries.set(p.poolId, c.countryId);
    }
    if (
      c.state.labour.aggregates.some((a) => a.countryId !== c.countryId) ||
      c.offers.some(
        (o) =>
          o.countryId !== c.countryId ||
          positionCountries.get(o.positionId) !== c.countryId,
      )
    )
      invalid('COUNTRY_LABOUR_OFFER_ORIGINALS_REQUIRED');
    countries.set(c.countryId, {
      countryId: c.countryId,
      lifecycle: createSocialPositionOfferLifecycleState(c.state, c.offers),
      offerOrigins: [],
    });
  }
  const caps = new Map<string, FinanceNativeBudgetCapacityEncumbrance>(
    prior?.caps,
  );
  const checkpoints: FinanceNativeBudgetMixedPrefixResult['checkpoints'][number][] =
    [];
  const commandIds = new Set<string>(prior?.commandIds),
    keys = new Set<string>(prior?.keys),
    eventIds = new Set<string>(prior?.eventIds);
  let lastSimTime = prior?.lastSimTime ?? 0n;
  for (const frame of input.frames) {
    const command = validateCanonicalCommand(frame.command, sha);
    if (
      command.worldId !== input.worldId ||
      command.expectedWorldVersion !== budget.worldVersion ||
      commandIds.has(command.commandId) ||
      (command.idempotencyKey !== null && keys.has(command.idempotencyKey)) ||
      command.simTime.ticks < lastSimTime
    )
      invalid('COMPLETE_UNIQUE_ORDERED_MIXED_PREFIX_REQUIRED');
    if (
      (frame.inventoryPostings.length !== 0 &&
        !(
          inventory &&
          (POSTWAR_NARROW_GOODS_TYPES.includes(command.commandType) ||
            (command.commandType === INDUSTRY_UTILITY_COMMANDS.LOGISTICS &&
              industryLogisticsSources.length > 0 &&
              financial &&
              industryWorkState))
        )) ||
      (frame.financialPostingBatches.length !== 0 &&
        !(
          financialReplay &&
          (command.commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND ||
            command.commandType === CENTRAL_BANK_OMO_COMMAND ||
            (command.commandType === INDUSTRY_OPERATING_WAGE_COMMAND &&
              industryWorkState !== undefined &&
              industryWageState !== undefined) ||
            (command.commandType === INDUSTRY_UTILITY_COMMANDS.LOGISTICS &&
              industryLogisticsSources.length > 0 &&
              inventory &&
              industryWorkState) ||
            (inventory && command.commandType === 'CORE_GOODS_DELIVERY_V1') ||
            (command.commandType === BENEFICIAL_HOUSING_RENT_COMMAND &&
              rentOrigins !== undefined))
        ))
    )
      invalid('UNSUPPORTED_MIXED_PREFIX_POSTING_EFFECT');
    const transition = createAuthoritativeTransition({
      command,
      worldVersionBefore: budget.worldVersion,
      worldVersionAfter: (BigInt(budget.worldVersion) + 1n).toString(),
      events: frame.events,
    });
    if (
      !same(transition, frame.transition) ||
      frame.receipt.outcome !== 'COMMITTED'
    )
      invalid('ACTUAL_CANONICAL_TRANSITION_RECEIPT_REQUIRED');
    validateFinalReceiptForCommand({
      command,
      transition,
      receipt: frame.receipt,
    });
    if (financialReplay || captainEnabled) {
      const canonicalReceipt = createFinalCommandReceipt({
        command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: frame.receipt.recordedAtReal,
      });
      if (!same(canonicalReceipt, frame.receipt))
        invalid('EXACT_CANONICAL_FINANCIAL_PREFIX_RECEIPT_REQUIRED');
    }
    for (const [i, event] of frame.events.entries()) {
      validateAuthoritativeEvent(event, sha);
      if (
        event.correctsEventId !== null ||
        eventIds.has(event.eventId) ||
        event.sequence !==
          (BigInt(budget.eventSequence) + BigInt(i) + 1n).toString() ||
        event.simTime.ticks !== command.simTime.ticks ||
        event.correlationId !== command.correlationId
      )
        invalid('COMPLETE_UNIQUE_MIXED_EVENT_SEQUENCE_REQUIRED');
      eventIds.add(event.eventId);
    }
    if (command.commandType === INDUSTRY_UTILITY_COMMANDS.POWER) {
      if (
        !industryPowerState ||
        !financial ||
        !inventory ||
        !industryWorkState ||
        !industryWageState
      )
        invalid('ACTUAL_UTILITY_POWER_SOURCE_WORK_AND_FINANCIAL_REQUIRED');
      industryPowerState = replayIndustryFirstDayPowerFrame(
        {
          state: industryPowerState,
          frame,
          financial,
          industryWorkState,
          industryWageState,
        },
        sha,
      );
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events.at(-1)!.sequence,
      });
    } else if (command.commandType === INDUSTRY_UTILITY_COMMANDS.WATER) {
      if (!industryWaterState || !financial || !inventory)
        invalid('ACTUAL_UTILITY_WATER_SOURCE_AND_PAIRED_LEDGERS_REQUIRED');
      const intent = parseIndustryUtilityIntent(command, sha),
        matches = [...industryWaterOriginals.values()].filter(
          (original) =>
            original.source.worldId === command.worldId &&
            original.source.countryId === command.countryId &&
            original.source.facilityId === intent.facilityId &&
            original.source.runId === intent.runId &&
            original.source.sourceRef === intent.sourceRef &&
            original.source.sourceRawSha256 === intent.sourceRawSha256,
        );
      if (matches.length !== 1)
        invalid('EXACT_INSTALLED_UTILITY_WATER_ORIGINAL_REQUIRED');
      const reduced = replayIndustryFirstDayWaterExecutionFrame(
        {
          state: industryWaterState,
          frame,
          sourceInputs: matches[0]!,
          prior: {
            head: {
              worldVersion: budget.worldVersion,
              eventSequence: budget.eventSequence,
            },
            financial,
            inventory,
            ...(industryWorkState === undefined ? {} : { industryWorkState }),
            ...(industryWageState === undefined ? {} : { industryWageState }),
            ...(industryPowerState === undefined ? {} : { industryPowerState }),
          },
        },
        sha,
      );
      if (reduced.financial !== financial || reduced.inventory !== inventory)
        invalid('WATER_REPLAY_CANNOT_INVENT_UNPOSTED_LEDGER_EFFECTS');
      industryWaterState = reduced.state;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events.at(-1)!.sequence,
      });
    } else if (command.commandType === INDUSTRY_UTILITY_COMMANDS.LOGISTICS) {
      if (!financial || !inventory || !industryWorkState)
        invalid(
          'ACTUAL_UTILITY_LOGISTICS_SOURCE_WORK_AND_PAIRED_LEDGERS_REQUIRED',
        );
      const intent = parseIndustryUtilityIntent(command, sha),
        matches = industryLogisticsSources.filter((token) => {
          const source = readIndustryInternalLogisticsReplaySources(token);
          return (
            source.worldId === command.worldId &&
            source.countryId === command.countryId &&
            source.facilityId === intent.facilityId &&
            source.utilitySources.some(
              (row) =>
                row.runId === intent.runId &&
                row.sourceRef === intent.sourceRef &&
                row.sourceRawSha256 === intent.sourceRawSha256,
            )
          );
        });
      if (matches.length !== 1)
        invalid('EXACT_INSTALLED_UTILITY_LOGISTICS_ORIGINAL_REQUIRED');
      const states = industryLogisticsState.filter((state) => {
        const source =
          readIndustryInternalLogisticsExecutionState(state).source;
        return (
          source.worldId === command.worldId &&
          source.countryId === command.countryId &&
          source.facilityId === intent.facilityId
        );
      });
      if (states.length > 1)
        invalid('UNIQUE_UTILITY_LOGISTICS_PRIVATE_STATE_REQUIRED');
      const reduced = replayIndustryInternalLogisticsFrame(
        {
          ...(states[0] === undefined ? {} : { state: states[0] }),
          sourceInputs: matches[0]!,
          context: {
            head: {
              worldId: input.worldId,
              worldVersion: budget.worldVersion,
              eventSequence: budget.eventSequence,
            },
            financial,
            inventory,
            industryWorkState,
            ...(industryWageState === undefined ? {} : { industryWageState }),
          },
          frame,
        },
        sha,
      );
      if (reduced.execution !== null)
        invalid('UTILITY_REPLAY_MUST_NOT_MINT_DELIVERY_BEFORE_COMPLETE_PREFIX');
      industryLogisticsState = [
        ...industryLogisticsState.filter((state) => state !== states[0]),
        reduced.state,
      ];
      financial = reduced.financial;
      inventory = reduced.inventory;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events.at(-1)!.sequence,
      });
    } else if (
      command.commandType === INDUSTRY_RUN_SCHEDULE_COMMAND ||
      command.commandType === INDUSTRY_FIRST_DAY_WORK_COMMAND
    ) {
      if (!industryWorkState)
        invalid('ACTUAL_INDUSTRY_WORK_ORIGINALS_REQUIRED');
      industryWorkState = replayIndustryFirstDayRunFrame(
        { state: industryWorkState, frame },
        sha,
      ).state;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events.at(-1)!.sequence,
      });
    } else if (command.commandType === INDUSTRY_OPERATING_WAGE_COMMAND) {
      if (!industryWorkState || !industryWageState || !financial)
        invalid('ACTUAL_INDUSTRY_WORK_AND_FINANCIAL_REQUIRED');
      const payload = JSON.parse(command.canonicalPayload) as {
        workEventId?: unknown;
        workEventFingerprint?: unknown;
      };
      const selected = readIndustryFirstDayWorkState(
        industryWorkState,
      ).completedWorks.filter((token) => {
        const w = readIndustryCompletedWork(token);
        return (
          w.frame.events[0]?.eventId === payload.workEventId &&
          w.frame.events[0]?.fingerprint === payload.workEventFingerprint
        );
      });
      if (selected.length !== 1)
        invalid('EXACT_ACTUAL_COMPLETED_WORK_REQUIRED');
      const work = selected[0]!,
        data = readIndustryCompletedWork(work).data,
        key = data.countryId + '\0' + data.facilityId + '\0' + data.runId,
        source = industryWageSources.get(key);
      if (
        !source ||
        source.seedFingerprint !== financialReplay?.seedFingerprint
      )
        invalid('ACTUAL_INDUSTRY_WAGE_SOURCE_REQUIRED');
      const beneficiary = financialReplay.beneficialHousingRentOrigins?.find(
        (o) => o.receipt.countryId === source.countryId,
      )?.receipt;
      const paid = replayIndustryOperatingWagePayment({
        command,
        source,
        work,
        state: industryWageState,
        financial,
        ...(beneficiary === undefined
          ? {}
          : { beneficialReceipt: beneficiary }),
        sha256Hex: sha,
        step: {
          command,
          transition,
          financialPostingBatches: frame.financialPostingBatches,
          inventoryPostings: [],
        },
      });
      industryWageState = paid.state;
      financial = paid.financial;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events.at(-1)!.sequence,
      });
    } else if (command.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND) {
      budget = replayBudgetFrame(budget, frame, sha);
      const body = JSON.parse(frame.events[0]!.canonicalPayload) as {
        payload: BudgetPayload;
        binding: FinanceNativeBudgetBinding;
      };
      const p = body.payload,
        previous = caps.get(p.scope.envelopeRef);
      if (p.operation === 'SET_ENVELOPE') {
        caps.set(p.scope.envelopeRef, {
          reference: `BUDGET_CAPACITY_${hash(p.scope, sha).slice(7).toUpperCase()}`,
          accountId: body.binding.treasuryAccountId,
          claimId: body.binding.treasuryClaimId,
          countryId: p.scope.countryId,
          governmentEntityId: p.scope.entityRef,
          currency: p.currency,
          amount: p.amount,
          envelopeRef: p.scope.envelopeRef,
          effectivePeriodRef: p.scope.effectivePeriodRef,
          eventId: frame.events[0]!.eventId,
          policyHash: body.binding.policyHash,
        });
      } else if (
        !previous ||
        previous.accountId !== body.binding.treasuryAccountId ||
        previous.claimId !== body.binding.treasuryClaimId ||
        previous.currency !== p.currency ||
        previous.countryId !== p.scope.countryId
      )
        invalid('BUDGET_LINE_DIFFERS_FROM_REAL_CAPACITY_ACCOUNT');
    } else if (POSTWAR_NARROW_GOODS_TYPES.includes(command.commandType)) {
      if (!inventory || !financial)
        invalid('GENUINE_PREPARED_INVENTORY_AND_FINANCIAL_REQUIRED');
      const reduced = replayPostwarNarrowGoodsFrame({
        frame,
        inventory,
        financial,
        entries: goodsEntries,
        sha256Hex: sha,
      });
      inventory = reduced.inventory;
      financial = reduced.financial;
      goodsEntries = reduced.entries;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events[0]!.sequence,
      });
    } else if (command.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND) {
      const current = captains.get(command.countryId);
      const event = frame.events[0];
      if (!current || !captainEnabled)
        invalid('CAPTAIN_COUNTRY_ORIGINAL_REQUIRED');
      if (
        !event ||
        frame.events.length !== 1 ||
        event.eventType !== CAPTAIN_POLITICAL_CAPITAL_EVENT
      )
        invalid('EXACT_CAPTAIN_EVENT_REQUIRED');
      const payload = JSON.parse(event.canonicalPayload);
      if (!same(parseCanonicalCommand(payload.command, sha), command))
        invalid('CAPTAIN_EMBEDDED_CANONICAL_COMMAND_DIFFERS');
      const state = replayCaptainPoliticalCapitalAllocation({
        state: current,
        event,
        sha256Hex: sha,
      });
      captains.set(command.countryId, state);
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: event.sequence,
      });
    } else if (command.commandType === BENEFICIAL_HOUSING_RENT_COMMAND) {
      if (!financialReplay || !financial || rentOrigins === undefined)
        invalid('RENT_REQUIRES_GENUINE_PREPARED_FINANCIAL_AND_RIGHTS_ORIGINS');
      const reduced = replayBeneficialHousingRentMixedFrame({
        origins: rentOrigins,
        financial,
        frame,
        sha256Hex: sha,
      });
      financial = reduced.financial;
      rentOrigins = reduced.origins;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: frame.events[0]!.sequence,
      });
    } else if (command.commandType === CENTRAL_BANK_OMO_COMMAND) {
      if (!financialReplay || !financial)
        invalid('OMO_REQUIRES_GENUINE_PREPARED_FINANCIAL_BASE');
      const original = financialReplay.omoOriginals.get(command.countryId),
        event = frame.events[0];
      if (
        !original ||
        !event ||
        frame.events.length !== 1 ||
        event.eventType !== CENTRAL_BANK_OMO_EVENT ||
        frame.financialPostingBatches.length !== 1
      )
        invalid('EXACT_OMO_ORIGIN_EVENT_AND_POSTING_REQUIRED');
      const payload = JSON.parse(event.canonicalPayload) as {
        source?: { quote?: { quoteRef?: string } };
        trace: import('./central-bank-open-market-operation.js').CentralBankOmoSource['trace'];
      };
      const quote = original.quotes.find(
        (q) => q.quoteRef === payload.source?.quote?.quoteRef,
      );
      if (!quote) invalid('IMMUTABLE_HISTORICAL_OMO_QUOTE_REQUIRED');
      const currentSnapshot = <T extends object>(
        template: T,
        accounts: Readonly<Record<string, string>>,
      ): T => {
        const snapshot = { ...template } as Record<string, unknown>;
        for (const [field, id] of Object.entries(accounts)) {
          const account = financial!.accounts.find((a) => a.accountId === id);
          if (!account) invalid('OMO_REGISTERED_ACCOUNT_ABSENT');
          const balance =
            financial!.positions.find((p) => p.account.accountId === id)
              ?.netDebitBalance ?? Money.from('0', account.currency);
          snapshot[field] = {
            amount: canonicalDecimal(
              account.accountClass === 'LIABILITY' ||
                account.accountClass === 'EQUITY'
                ? balance.amount.negated()
                : balance.amount,
            ),
            currency: account.currency,
          };
        }
        return snapshot as T;
      };
      const facts: CentralBankOmoSourceFacts = {
        worldId: input.worldId,
        countryId: original.countryId,
        worldVersion: financial.worldVersion,
        currentSimTime: command.simTime.toCanonicalValue(),
        currentEventSequence: budget.eventSequence,
        domesticTreasuryRef: original.domesticTreasuryRef,
        bank: original.valuationQuote
          ? projectCentralBankDayOneValuedSnapshot({
              snapshot: currentSnapshot(original.bank, original.bankAccounts),
              financial,
              quote: original.valuationQuote,
              ownerRef: original.bank.bankRef,
              simTime: command.simTime,
              assetField: 'settlementCash',
              sha256Hex: sha,
            })
          : currentSnapshot(original.bank, original.bankAccounts),
        centralBank: original.valuationQuote
          ? projectCentralBankDayOneValuedSnapshot({
              snapshot: currentSnapshot(
                original.centralBank,
                original.centralBankAccounts,
              ),
              financial,
              quote: original.valuationQuote,
              ownerRef: original.centralBank.centralBankRef,
              simTime: command.simTime,
              assetField: 'otherAssets',
              sha256Hex: sha,
            })
          : currentSnapshot(original.centralBank, original.centralBankAccounts),
        ...(original.valuationQuote === undefined
          ? {}
          : { valuationQuote: original.valuationQuote }),
        bankAccounts: original.bankAccounts,
        centralBankAccounts: original.centralBankAccounts,
        holdings: omoHoldings.get(original.countryId)!,
        quote,
      };
      const stored = frame.financialPostingBatches[0] as { batchId?: unknown };
      if (!stored || typeof stored !== 'object' || !ref(stored.batchId))
        invalid('ACTUAL_OMO_FINANCIAL_BATCH_REQUIRED');
      const expected = prepareCentralBankOmoTransition({
        command,
        source: { facts, trace: payload.trace, financialState: financial },
        eventId: event.eventId,
        eventSequence: event.sequence,
        financialBatchId: stored.batchId,
        observedAtReal: event.recordedAtReal,
        sha256Hex: sha,
      });
      if (
        !same(expected.event, event) ||
        !same(expected.transition, transition) ||
        !same([expected.posting], frame.financialPostingBatches)
      )
        invalid('CANONICAL_OMO_EVENT_OR_FINANCIAL_POSTING_DIFFERS');
      financial = expected.financial.state;
      omoHoldings.set(original.countryId, expected.holdingsAfter);
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: event.sequence,
      });
    } else if (
      command.commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND
    ) {
      if (!financialReplay || !financial)
        invalid('FX_REQUIRES_GENUINE_PREPARED_FINANCIAL_BASE');
      const event = frame.events[0];
      if (!event || frame.events.length !== 1)
        invalid('EXACT_FX_EVENT_REQUIRED');
      const p = JSON.parse(event.canonicalPayload) as {
        quote?: { quoteRef?: string };
        encumbrances?: { sourceRef?: string; sourceSha256?: string };
      };
      const original = financialReplay.fxOriginals.get(p.quote?.quoteRef ?? '');
      if (!original) invalid('IMMUTABLE_HISTORICAL_FX_QUOTE_REQUIRED');
      const q = original.quote;
      const payload = JSON.parse(command.canonicalPayload) as {
        payerGcuAccountId: string;
      };
      const treasuryGcuAsset = createFinancialAccount({
        worldId: financial.worldId,
        countryId: coreCountryId(q.countryId),
        ownerId: legalEntityId(q.governmentEntityId),
        accountId: financialAccountId(payload.payerGcuAccountId),
        accountClass: 'CASH',
        currency: 'GCU',
        claimId: null,
        counterpartyEntityId: null,
      });
      const accounts: PostwarDayOneTreasuryFxAccounts = {
        treasuryAsset: original.treasuryAsset,
        treasuryLiability: original.treasuryLiability,
        bankSettlementAsset: original.bankSettlementAsset,
        bankSettlementLiability: original.bankSettlementLiability,
        bankGcuAsset: original.bankGcuAsset,
        treasuryGcuAsset,
      };
      let treasuryReserved = Money.from('0', q.localCurrency),
        bankReserved = Money.from('0', 'GCU');
      for (const r of currentOpeningEncumbrances()) {
        if (r.accountId === original.treasuryAsset.accountId)
          treasuryReserved = treasuryReserved.add(
            Money.from(r.amount, r.currency),
          );
        if (r.accountId === original.bankGcuAsset.accountId)
          bankReserved = bankReserved.add(Money.from(r.amount, r.currency));
      }
      for (const r of caps.values())
        if (r.accountId === original.treasuryAsset.accountId) {
          if (
            r.countryId !== q.countryId ||
            r.governmentEntityId !== q.governmentEntityId ||
            r.currency !== q.localCurrency ||
            r.claimId !== original.treasuryAsset.claimId
          )
            invalid('FX_BUDGET_ENCUMBRANCE_SCOPE_MISMATCH');
          treasuryReserved = treasuryReserved.add(
            Money.from(r.amount, r.currency),
          );
        }
      for (const c of countries.values())
        for (const r of c.lifecycle.reservations)
          if (r.accountId === original.treasuryAsset.accountId) {
            if (
              r.countryId !== q.countryId ||
              r.employerId !== q.governmentEntityId ||
              r.currency !== q.localCurrency
            )
              invalid('FX_SOCIAL_ENCUMBRANCE_SCOPE_MISMATCH');
            treasuryReserved = treasuryReserved.add(
              Money.from(r.amount, r.currency),
            );
          }
      financial = replayPostwarDayOneTreasuryFxFrame(
        {
          financialBefore: financial,
          frame,
          quote: q,
          accounts,
          encumbrances: {
            worldVersion: financial.worldVersion,
            treasuryReservedAmount: canonicalDecimal(treasuryReserved.amount),
            bankGcuReservedAmount: canonicalDecimal(bankReserved.amount),
            sourceRef: p.encumbrances?.sourceRef ?? '',
            sourceSha256: p.encumbrances?.sourceSha256 ?? '',
          },
        },
        sha,
      ).financial;
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: event.sequence,
      });
    } else {
      const country = countries.get(command.countryId);
      if (!country) invalid('SOCIAL_COUNTRY_ORIGINALS_REQUIRED');
      const type =
        command.commandType === SOCIAL_POSITION_OFFER_CREATE_COMMAND
          ? SOCIAL_POSITION_OFFER_CREATED_EVENT
          : command.commandType === SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND
            ? SOCIAL_SERVICE_PLAN_EVENT
            : command.commandType === SOCIAL_JOB_MATCH_DUE_COMMAND
              ? SOCIAL_JOB_MATCH_EVENT
              : null;
      const event = frame.events[0];
      if (
        type === null ||
        !event ||
        frame.events.length !== 1 ||
        event.eventType !== type
      )
        invalid('UNSUPPORTED_MIXED_PREFIX_FAMILY');
      const payload = JSON.parse(event.canonicalPayload);
      if (!same(parseCanonicalCommand(payload.command, sha), command))
        invalid('SOCIAL_EMBEDDED_CANONICAL_COMMAND_DIFFERS');
      const replayEvent: ReplayReducerEvent = {
        transitionId: command.commandId,
        worldId: event.worldId,
        eventId: event.eventId,
        causationCommandId: event.causationCommandId,
        correctsEventId: event.correctsEventId,
        eventType: event.eventType,
        sequence: event.sequence,
        worldVersionBefore: transition.worldVersionBefore,
        worldVersionAfter: transition.worldVersionAfter,
        simTime: event.simTime,
        payload,
      };
      const beforeEmployment = country.lifecycle.employment;
      if (type === SOCIAL_POSITION_OFFER_CREATED_EVENT) {
        if (positionCountries.has(payload.offer?.positionId))
          invalid('GLOBAL_POSITION_ID_ALREADY_OCCUPIED');
        const funding = payload.readFacts?.funding;
        if (!funding || !Array.isArray(funding.priorReservations))
          invalid('SOCIAL_ACTUAL_PRIOR_CAPACITY_REQUIRED');
        for (const cap of caps.values())
          if (
            cap.countryId === command.countryId &&
            cap.accountId === funding.accountId
          ) {
            if (
              cap.currency !== funding.currency ||
              cap.governmentEntityId !== funding.ownerId ||
              funding.priorReservations.filter(
                (r: { reservationId: string; amount: string }) =>
                  r.reservationId === cap.reference && r.amount === cap.amount,
              ).length !== 1
            )
              invalid('SOCIAL_OMITS_EXISTING_BUDGET_CAPACITY');
          }
        country.lifecycle = reduceSocialPositionOfferCreatedEvent({
          state: country.lifecycle,
          event: replayEvent,
          sha256Hex: sha,
        });
        positionCountries.set(payload.offer.positionId, country.countryId);
        country.offerOrigins.push({
          positionId: payload.offer.positionId,
          eventId: event.eventId,
          payloadHash: event.payloadHash,
          pointer: '/offer',
          fromSimTime: event.simTime.toCanonicalValue(),
          fromHead: {
            worldVersion: event.worldVersion,
            eventSequence: event.sequence,
          },
        });
      } else
        country.lifecycle = freeze({
          ...country.lifecycle,
          employment: reduceSocialEmploymentServiceEvent({
            state: beforeEmployment,
            event: replayEvent,
            sha256Hex: sha,
          }),
        });
      checkpoints.push({
        eventId: event.eventId,
        countryId: country.countryId,
        beforeEmployment,
        afterEmployment: country.lifecycle.employment,
      });
      budget = freeze({
        ...budget,
        worldVersion: transition.worldVersionAfter,
        eventSequence: event.sequence,
      });
    }
    // Every frame above has been fully reduced with canonical group/receipt/
    // posting checks. Only here may Core project an unchanged Captain domain
    // through a known inert sibling frame; Worker callers cannot rebase it.
    for (const [countryId, state] of captains)
      captains.set(
        countryId,
        freeze({
          ...state,
          worldVersion: budget.worldVersion,
          lastEventSequence: budget.eventSequence,
        }),
      );
    // This is after complete real sibling reduction, never a caller no-effect flag.
    if (inventory && inventory.worldVersion !== transition.worldVersionAfter)
      inventory = authorizeInventoryLedgerState(
        parseInventoryLedgerSnapshot({
          ...inventory,
          worldVersion: transition.worldVersionAfter,
        }),
      );
    if (financial)
      financial = financialAtVersion(financial, transition.worldVersionAfter);
    if (industryLogisticsState.length) {
      if (!financial || !inventory || !industryWorkState)
        invalid(
          'ACTUAL_UTILITY_LOGISTICS_CONTEXT_REQUIRED_AFTER_COMPLETE_SIBLING',
        );
      industryLogisticsState = industryLogisticsState.map((state) =>
        synchronizeIndustryInternalLogisticsExecutionState(
          state,
          {
            head: {
              worldId: input.worldId,
              worldVersion: budget.worldVersion,
              eventSequence: budget.eventSequence,
            },
            financial: financial!,
            inventory: inventory!,
            industryWorkState: industryWorkState!,
            ...(industryWageState === undefined ? {} : { industryWageState }),
          },
          sha,
        ),
      );
    }
    assertUtilityWorkerTimeConserved(industryWorkState, industryLogisticsState);
    // Domain synchronization follows actual full sibling reduction only. It
    // cannot establish a no-effect classification or omit a financial batch.
    if (financial && rentOrigins !== undefined)
      rentOrigins = synchronizeBeneficialHousingRentMixedReplayOrigins({
        origins: rentOrigins,
        financial,
        sha256Hex: sha,
      });
    if (financial && financialReplay) {
      const accounts = new Map<string, FinancialAccount>(
        financial.accounts.map((a) => [a.accountId, a]),
      );
      const positions = new Map<string, Money>(
        financial.positions.map((p) => [
          p.account.accountId,
          p.netDebitBalance,
        ]),
      );
      const amounts = new Map<string, Money>(),
        references = new Set<string>();
      const reserve = (
        reference: string,
        id: string,
        currency: string,
        amount: string,
        owner?: string,
        country?: string,
        claim?: string,
      ) => {
        if (references.has(reference))
          invalid('MIXED_CAPACITY_REFERENCE_COUNTED_TWICE');
        references.add(reference);
        const a = accounts.get(id);
        if (
          !a ||
          a.currency !== currency ||
          (owner !== undefined && a.ownerId !== owner) ||
          (country !== undefined && a.countryId !== country) ||
          (claim !== undefined && a.claimId !== claim)
        )
          invalid('MIXED_CAPACITY_ACTUAL_ACCOUNT_SCOPE_REQUIRED');
        const value = Money.from(amount, currency);
        if (value.amount.isNegative()) invalid('NEGATIVE_MIXED_CAPACITY');
        amounts.set(
          id,
          (amounts.get(id) ?? Money.from('0', currency)).add(value),
        );
      };
      for (const r of currentOpeningEncumbrances())
        reserve(r.reference, r.accountId, r.currency, r.amount);
      for (const r of caps.values())
        reserve(
          r.reference,
          r.accountId,
          r.currency,
          r.amount,
          r.governmentEntityId,
          r.countryId,
          r.claimId,
        );
      for (const c of countries.values())
        for (const r of c.lifecycle.reservations)
          reserve(
            r.reservationId,
            r.accountId,
            r.currency,
            r.amount,
            r.employerId,
            r.countryId,
          );
      for (const [id, amount] of amounts) {
        const balance =
          positions.get(id) ?? Money.from('0', accounts.get(id)!.currency);
        if (amount.amount.greaterThan(balance.amount))
          invalid('MIXED_CAPACITY_EXCEEDS_CURRENT_FINANCIAL_BALANCE');
      }
    }
    commandIds.add(command.commandId);
    if (command.idempotencyKey !== null) keys.add(command.idempotencyKey);
    lastSimTime = command.simTime.ticks;
  }
  const socialCountries = [...countries.values()];
  const currentTreasuryBalances: FinanceSocialFxCurrentTreasuryBalance[] = [];
  if (financial && financialReplay)
    for (const original of financialReplay.fxOriginals.values()) {
      const a = original.treasuryAsset;
      if (!currentTreasuryBalances.some((r) => r.accountId === a.accountId))
        currentTreasuryBalances.push({
          countryId: a.countryId,
          accountId: a.accountId,
          claimId: a.claimId!,
          ownerId: a.ownerId,
          currency: a.currency,
          amount: canonicalDecimal(
            (
              financial.positions.find(
                (p) => p.account.accountId === a.accountId,
              )?.netDebitBalance ?? Money.from('0', a.currency)
            ).amount,
          ),
        });
    }
  const result = freeze({
    ...(industryPowerState === undefined ? {} : { industryPowerState }),
    ...(industryWaterState === undefined ? {} : { industryWaterState }),
    ...(industryLogisticsSources.length === 0
      ? {}
      : { industryLogisticsState }),
    ...(industryWorkState === undefined ? {} : { industryWorkState }),
    ...(industryWageState === undefined ? {} : { industryWageState }),
    ...(inventory === undefined
      ? {}
      : {
          inventoryState: inventory,
          narrowGoodsTransfers: [...goodsEntries.values()],
        }),
    ...(rentOrigins === undefined
      ? {}
      : { beneficialHousingRentOrigins: rentOrigins }),
    ...(omoHoldings.size
      ? {
          omoCountries: [...omoHoldings].map(([countryId, holdings]) => ({
            countryId,
            holdings,
          })),
        }
      : {}),
    ...(financial === undefined
      ? {}
      : { financialState: financial, currentTreasuryBalances }),
    ...(captainEnabled
      ? {
          captainCountries: [...captains].map(([countryId, state]) => ({
            countryId,
            state,
          })),
        }
      : {}),
    budgetState: budget,
    budgetEncumbrances: [...caps.values()],
    socialCountries,
    socialReservations: socialCountries.flatMap(
      (c) => c.lifecycle.reservations,
    ),
    checkpoints,
  });
  const evidence = Object.freeze({}) as FinanceNativeBudgetMixedPrefixEvidence;
  mixedPrefixes.set(evidence, {
    worldId: input.worldId,
    framesHash:
      financialReplay || captainEnabled
        ? completeFrameHash(input.frames, sha)
        : frameHash(input.frames, sha),
    ...(!financialReplay && !captainEnabled
      ? {}
      : { completeFrames: true as const }),
    ...(financialReplay ? { financialBase: financialReplay.financial } : {}),
    foldState: {
      industryPowerState,
      industryWaterState,
      industryWaterOriginals,
      industryLogisticsState,
      industryLogisticsSources,
      industryWorkState,
      industryWageState,
      industryWageSources,
      financialReplay,
      captainEnabled,
      captains,
      financial,
      inventory,
      goodsEntries,
      rentOrigins,
      omoHoldings,
      budget,
      countries,
      positionCountries,
      poolCountries,
      caps,
      commandIds,
      keys,
      eventIds,
      lastSimTime,
      originalReferences,
    },
    result,
  });
  return evidence;
}
export function replayFinanceNativeBudgetHistory(
  worldId: string,
  frames: readonly FinanceNativeBudgetFrame[],
  sha: Sha256Hex,
  mixedEvidence?: FinanceNativeBudgetMixedPrefixEvidence,
): FinanceNativeBudgetState {
  if (mixedEvidence !== undefined)
    return readFinanceNativeBudgetMixedPrefix(
      mixedEvidence,
      worldId,
      frames,
      sha,
    ).budgetState;
  let state: FinanceNativeBudgetState = {
    worldId,
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
  };
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const frame of frames) {
    if (
      ids.has(frame.command.commandId) ||
      keys.has(frame.command.idempotencyKey!)
    )
      invalid('COMPLETE_UNIQUE_BUDGET_PREFIX_REQUIRED');
    state = replayBudgetFrame(state, frame, sha);
    ids.add(frame.command.commandId);
    keys.add(frame.command.idempotencyKey!);
  }
  return freeze(state);
}
/** Pure source/rule validation for intake preflight. It issues neither a
 * transition nor source/authorization capability. Commit repeats it with the
 * actual private command proof while native source guards remain held. */
export function evaluateFinanceNativeBudgetSource(input: {
  readonly command: CanonicalCommand;
  readonly source: FinanceNativeBudgetSource;
  readonly sha256Hex: Sha256Hex;
}) {
  const { command, source, sha256Hex: sha } = input,
    p = payload(command, sha);
  checkedPolicy(command, p, source.policy, source.binding, sha);
  const paged = source.frames === null ? source.pagedPrefix : undefined,
    witnessFrames = paged?.lastPageFrames ?? source.frames,
    evidence = paged?.evidence ?? source.mixedPrefixEvidence,
    pagedMeta =
      paged === undefined ? undefined : mixedPrefixes.get(paged.evidence);
  if (
    !Array.isArray(witnessFrames) ||
    (paged !== undefined &&
      (!pagedMeta?.completeFrames ||
        !pagedMeta.foldState.financialReplay?.inventory ||
        pagedMeta.worldId !== command.worldId ||
        (source.mixedPrefixEvidence !== undefined &&
          source.mixedPrefixEvidence !== paged.evidence)))
  )
    invalid('GENUINE_COMPLETE_PAGED_BUDGET_SOURCE_REQUIRED');
  if (
    (pagedMeta !== undefined &&
      command.simTime.ticks < pagedMeta.foldState.lastSimTime) ||
    witnessFrames.some(
      (frame: FinanceNativeBudgetFrame) =>
        frame.command.simTime.ticks > command.simTime.ticks ||
        frame.events.some(
          (event: FinanceNativeBudgetFrame['events'][number]) =>
            event.simTime.ticks > command.simTime.ticks,
        ),
    )
  )
    invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
  const before = replayFinanceNativeBudgetHistory(
    command.worldId,
    witnessFrames,
    sha,
    evidence,
  );
  if (
    before.worldVersion !== command.expectedWorldVersion ||
    before.worldVersion !== source.worldVersion ||
    before.eventSequence !== source.eventSequence
  )
    invalid('ACTUAL_CANONICAL_SOURCE_HEAD_REQUIRED');
  const mixed =
    evidence === undefined
      ? undefined
      : readFinanceNativeBudgetMixedPrefix(
          evidence,
          command.worldId,
          witnessFrames,
          sha,
        );
  if (
    mixed?.financialState !== undefined &&
    (source.capacityData !== undefined ||
      source.financialState !== mixed.financialState)
  )
    invalid('ACTUAL_REPLAYED_FINANCIAL_STATE_REQUIRED_NOT_OPENING_CAPACITY');
  let treasury: FinancialPosition | undefined;
  if (source.capacityData !== undefined) {
    if (source.financialState !== undefined)
      invalid('CAPACITY_DATA_DOES_NOT_ISSUE_FINANCIAL_LEDGER_AUTHORITY');
    const capacity = readFinanceBudgetCapacityData(source.capacityData);
    if (
      capacity.worldId !== command.worldId ||
      capacity.countryId !== command.countryId ||
      capacity.seedId !== source.binding.seedRef ||
      capacity.seedFingerprint !== source.binding.seedFingerprint ||
      capacity.admissionRef !== source.binding.admissionRef ||
      capacity.governmentEntityId !== source.policy.governmentEntityId ||
      capacity.financialSourceId !== source.binding.financialSourceId ||
      capacity.financialOriginalsSha256 !== source.binding.originalsSHA256 ||
      hash(capacity, sha) !== source.binding.capacityProjectionFingerprint ||
      (mixed !== undefined &&
        !digest(source.binding.mixedSourceBindingsFingerprint ?? ''))
    )
      invalid('CAPACITY_DATA_PROTECTED_SOURCE_MISMATCH');
    const reference =
      'OPENING_FUNDING_TOTAL_' +
      capacity.openingFunding.recordsSha256.slice(7).toUpperCase();
    const reservations = (mixed?.socialReservations ?? []).filter(
      (r) =>
        r.countryId === command.countryId ||
        r.accountId === capacity.treasury.assetAccount.accountId,
    );
    for (const r of reservations)
      if (
        r.countryId !== command.countryId ||
        r.accountId !== capacity.treasury.assetAccount.accountId ||
        r.employerId !== source.policy.governmentEntityId ||
        r.currency !== capacity.treasury.assetAccount.currency
      )
        invalid('CAPACITY_MIXED_RESERVATION_SCOPE_MISMATCH');
    if (
      !same(source.openingEncumbrances, [
        {
          reference,
          accountId: capacity.treasury.assetAccount.accountId,
          amount: capacity.openingFunding.totalAmount,
          currency: capacity.treasury.assetAccount.currency,
        },
        ...reservations.map((r) => ({
          reference: r.reservationId,
          accountId: r.accountId,
          amount: r.amount,
          currency: r.currency,
        })),
      ])
    )
      invalid('COMPLETE_PUBLISHED_OPENING_AND_MIXED_RESERVATIONS_REQUIRED');
    treasury = {
      account: capacity.treasury.assetAccount,
      netDebitBalance: Money.from(
        capacity.treasury.assetAmount,
        capacity.treasury.assetAccount.currency,
      ),
    };
  } else {
    if (
      !source.financialState ||
      !isAuthoritativeFinancialLedgerState(source.financialState) ||
      source.financialState.worldId !== command.worldId ||
      source.financialState.worldVersion !== before.worldVersion
    )
      invalid('ACTUAL_CANONICAL_SOURCE_HEAD_REQUIRED');
    treasury = source.financialState.positions.find(
      (v) => v.account.accountId === source.binding.treasuryAccountId,
    );
  }
  if (
    !treasury ||
    treasury.account.countryId !== command.countryId ||
    treasury.account.ownerId !== source.policy.governmentEntityId ||
    treasury.account.currency !== p.currency ||
    treasury.account.accountClass !== 'ASSET' ||
    treasury.account.claimId !== source.binding.treasuryClaimId
  )
    invalid('ACTUAL_TREASURY_CLAIM_REQUIRED');
  if (
    hash(source.openingEncumbrances, sha) !==
      source.binding.openingEncumbranceHash ||
    new Set(source.openingEncumbrances.map((v) => v.reference)).size !==
      source.openingEncumbrances.length
  )
    invalid('EXACT_OPENING_ENCUMBRANCE_COVERAGE_REQUIRED');
  if (mixed !== undefined) {
    for (const r of mixed.socialReservations)
      if (
        r.countryId === command.countryId &&
        r.accountId === source.binding.treasuryAccountId
      ) {
        if (
          r.employerId !== source.policy.governmentEntityId ||
          r.currency !== p.currency ||
          source.openingEncumbrances.filter(
            (v) =>
              v.reference === r.reservationId &&
              v.accountId === r.accountId &&
              v.currency === r.currency &&
              v.amount === r.amount,
          ).length !== 1
        )
          invalid('SOURCE_OMITS_ACTUAL_SOCIAL_PAYROLL_RESERVATION');
      }
  }
  let protectedAmount = Money.from('0', p.currency);
  for (const item of source.openingEncumbrances) {
    if (
      !ref(item.reference) ||
      item.accountId !== source.binding.treasuryAccountId ||
      item.currency !== p.currency
    )
      invalid('ENCUMBRANCE_SCOPE_MISMATCH');
    const amount = Money.from(item.amount, item.currency);
    if (
      amount.amount.isNegative() ||
      amount.toCanonicalValue().amount !== item.amount
    )
      invalid('NONCANONICAL_SOURCE_ENCUMBRANCE');
    protectedAmount = protectedAmount.add(amount);
  }
  const allocated = before.envelopes
    .filter(
      (e) =>
        e.scope.countryId === command.countryId &&
        e.scope.entityRef === source.policy.governmentEntityId &&
        e.currency === p.currency,
    )
    .reduce(
      (sum, e) => sum.add(Money.from(e.cap, p.currency)),
      protectedAmount,
    );
  const free = treasury.netDebitBalance.subtract(allocated);
  if (free.amount.isNegative())
    invalid('EXISTING_ENCUMBRANCE_EXCEEDS_CURRENT_TREASURY');
  if (
    p.operation === 'SET_ENVELOPE' &&
    Money.from(p.amount, p.currency).amount.greaterThan(free.amount)
  )
    invalid('INSUFFICIENT_UNENCUMBERED_FISCAL_CAPACITY');
  if (
    (pagedMeta !== undefined &&
      (pagedMeta.foldState.commandIds.has(command.commandId) ||
        (command.idempotencyKey !== null &&
          pagedMeta.foldState.keys.has(command.idempotencyKey)))) ||
    witnessFrames.some(
      (f) =>
        f.command.commandId === command.commandId ||
        f.command.idempotencyKey === command.idempotencyKey,
    )
  )
    invalid('ORIGINAL_DURABLE_RECEIPT_REQUIRED');
  return freeze({ before, after: next(before, p) });
}
export async function prepareFinanceNativeBudgetTransition(input: {
  readonly command: CanonicalCommand;
  readonly authorization: CommitAuthorizationProof;
  readonly source: FinanceNativeBudgetSource;
  readonly recordedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}) {
  const { command, source, sha256Hex: sha } = input,
    p = payload(command, sha),
    auth = input.authorization;
  const check = async () => {
    if (
      !isCommitAuthorizationProof(auth) ||
      auth.capability !== 'FINANCE_BUDGET' ||
      auth.officeId !== 'FINANCE' ||
      auth.worldId !== command.worldId ||
      auth.countryId !== command.countryId ||
      auth.authSubject !== command.authSubject ||
      auth.actorId !== command.actorId ||
      auth.commandId !== command.commandId ||
      auth.commandFingerprint !== command.fingerprint
    )
      invalid('CURRENT_COMMAND_BOUND_FINANCE_AUTHORITY_REQUIRED');
    await reauthorizeCommitAuthorizationProof(auth);
  };
  await check();
  const { before, after } = evaluateFinanceNativeBudgetSource({
    command,
    source,
    sha256Hex: sha,
  });
  const types = kinds(p);
  const events = types.map((type, i) =>
    parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: `EVENT_NATIVE_BUDGET_${command.fingerprint.slice(7).toUpperCase()}_${i + 1}`,
        eventType: type,
        worldId: command.worldId,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: after.worldVersion,
        sequence: (BigInt(before.eventSequence) + BigInt(i) + 1n).toString(),
        simTime: command.simTime.toCanonicalValue(),
        recordedAtReal: input.recordedAtReal,
        correctsEventId: null,
        payload: eventPayload(
          command,
          p,
          source.policy,
          source.binding,
          before,
          after,
          i,
          types.length,
          sha,
        ),
      },
      sha,
    ),
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: before.worldVersion,
    worldVersionAfter: after.worldVersion,
    events,
  });
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: input.recordedAtReal,
  });
  await check();
  return freeze({
    transition,
    receipt,
    nextState: after,
    financialPostingBatches: [],
    inventoryPostings: [],
    interpretation:
      'APPROVED_BUDGET_AUTHORITY_NOT_RESERVED_COMMITTED_OR_PAID' as const,
  });
}
