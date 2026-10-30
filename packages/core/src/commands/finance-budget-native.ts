/** Native ordinary Finance-administration budget bookkeeping. No payment,
 * source admission, source publication or TEST_ONLY evidence promotion. The
 * Worker must protect actual policy/originals and source cutoff through commit. */
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
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
export interface FinanceNativeBudgetMixedPrefixResult {
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
  /** Complete canonical budget prefix from genuine H0. Unknown non-budget
   * intervening work is refused until its budget effect is explicitly replayed. */
  readonly frames: readonly FinanceNativeBudgetFrame[];
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly mixedPrefixEvidence?: FinanceNativeBudgetMixedPrefixEvidence;
}
export type FinanceNativeBudgetSource = FinanceNativeBudgetSourceBase &
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
    readonly openingEncumbrances: readonly FinanceSocialFxOpeningEncumbrance[];
    readonly fxOriginals: ReadonlyMap<string, FinanceSocialFxOriginal>;
  }
>();
export function prepareFinanceNativeBudgetFinancialReplay(
  input: {
    readonly financial: Readonly<FinancialLedgerState>;
    readonly openingEncumbrances: readonly FinanceSocialFxOpeningEncumbrance[];
    readonly fxOriginals: readonly FinanceSocialFxOriginal[];
  },
  sha: Sha256Hex,
): FinanceNativeBudgetFinancialReplayBase {
  const base = input.financial;
  if (!isAuthoritativeFinancialLedgerState(base) || base.worldVersion !== '0')
    invalid('GENUINE_H0_FINANCIAL_REPLAY_BASE_REQUIRED');
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
  financialReplayBases.set(token, {
    financial: base,
    openingEncumbrances: Object.freeze(opening),
    fxOriginals: originals,
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
  const meta = mixedPrefixes.get(input.evidence);
  const result = readFinanceNativeBudgetMixedPrefix(
    input.evidence,
    input.financialBase.worldId,
    input.frames,
    input.sha256Hex,
  );
  if (meta?.financialBase !== input.financialBase || !result.financialState)
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
  return issued.result;
}
/** Whole ordered canonical groups only. The existing Budget/Social reducers
 * establish effects; no caller no-effect classification or filtered/rebased
 * budget prefix exists. All foreign families remain unsupported. */
export function prepareFinanceNativeBudgetMixedPrefix(
  input: {
    readonly worldId: string;
    readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
    readonly financialReplay?: FinanceNativeBudgetFinancialReplayBase;
    readonly socialCountries: readonly {
      readonly countryId: string;
      readonly state: SocialEmploymentServiceState;
      readonly offers: readonly SocialEmploymentWageOffer[];
    }[];
  },
  sha: Sha256Hex,
): FinanceNativeBudgetMixedPrefixEvidence {
  const financialReplay =
    input.financialReplay === undefined
      ? undefined
      : financialReplayBases.get(input.financialReplay);
  if (
    input.financialReplay !== undefined &&
    (!financialReplay || financialReplay.financial.worldId !== input.worldId)
  )
    invalid('GENUINE_SAME_WORLD_FINANCIAL_REPLAY_REQUIRED');
  if (financialReplay && input.frames.length > 256)
    invalid('BOUNDED_COMPLETE_FINANCIAL_PREFIX_REQUIRED');
  let financial = financialReplay?.financial;
  let budget: FinanceNativeBudgetState = {
    worldId: input.worldId,
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
  };
  const countries = new Map<
    string,
    {
      countryId: string;
      lifecycle: SocialPositionOfferLifecycleState;
      offerOrigins: FinanceNativeBudgetMixedSocialCountry['offerOrigins'][number][];
    }
  >();
  const positionCountries = new Map<string, string>(),
    poolCountries = new Map<string, string>();
  for (const c of input.socialCountries) {
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
  const caps = new Map<string, FinanceNativeBudgetCapacityEncumbrance>();
  const checkpoints: FinanceNativeBudgetMixedPrefixResult['checkpoints'][number][] =
    [];
  const commandIds = new Set<string>(),
    keys = new Set<string>(),
    eventIds = new Set<string>();
  let lastSimTime = 0n;
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
      frame.inventoryPostings.length !== 0 ||
      (frame.financialPostingBatches.length !== 0 &&
        !(
          financialReplay &&
          command.commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND
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
    if (financialReplay) {
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
    if (command.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND) {
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
      for (const r of financialReplay.openingEncumbrances) {
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
    if (financial)
      financial = financialAtVersion(financial, transition.worldVersionAfter);
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
      for (const r of financialReplay.openingEncumbrances)
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
    ...(financial === undefined
      ? {}
      : { financialState: financial, currentTreasuryBalances }),
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
    framesHash: financialReplay
      ? completeFrameHash(input.frames, sha)
      : frameHash(input.frames, sha),
    ...(financialReplay === undefined
      ? {}
      : {
          completeFrames: true as const,
          financialBase: financialReplay.financial,
        }),
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
  if (
    source.frames.some(
      (frame) =>
        frame.command.simTime.ticks > command.simTime.ticks ||
        frame.events.some(
          (event) => event.simTime.ticks > command.simTime.ticks,
        ),
    )
  )
    invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
  const before = replayFinanceNativeBudgetHistory(
    command.worldId,
    source.frames,
    sha,
    source.mixedPrefixEvidence,
  );
  if (
    before.worldVersion !== command.expectedWorldVersion ||
    before.worldVersion !== source.worldVersion ||
    before.eventSequence !== source.eventSequence
  )
    invalid('ACTUAL_CANONICAL_SOURCE_HEAD_REQUIRED');
  const mixed =
    source.mixedPrefixEvidence === undefined
      ? undefined
      : readFinanceNativeBudgetMixedPrefix(
          source.mixedPrefixEvidence,
          command.worldId,
          source.frames,
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
    source.frames.some(
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
