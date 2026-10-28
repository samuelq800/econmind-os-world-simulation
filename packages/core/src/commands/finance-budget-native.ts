/** Native ordinary Finance-administration budget bookkeeping. No payment,
 * source admission, source publication or TEST_ONLY evidence promotion. The
 * Worker must protect actual policy/originals and source cutoff through commit. */
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { Money } from '../numeric/money.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
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
  type CommitAuthorizationProof,
} from './receipt.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import type { FinancialLedgerState } from '../finance/financial-ledger.js';

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
export interface FinanceNativeBudgetSource {
  readonly policy: FinanceNativeBudgetPolicy;
  readonly binding: FinanceNativeBudgetBinding;
  readonly financialState: FinancialLedgerState;
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
}
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
    ].every(digest)
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
export function replayFinanceNativeBudgetHistory(
  worldId: string,
  frames: readonly FinanceNativeBudgetFrame[],
  sha: Sha256Hex,
): FinanceNativeBudgetState {
  let state: FinanceNativeBudgetState = {
    worldId,
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
  };
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const frame of frames) {
    const c = frame.command,
      p = payload(c, sha);
    if (
      c.worldId !== worldId ||
      c.expectedWorldVersion !== state.worldVersion ||
      ids.has(c.commandId) ||
      keys.has(c.idempotencyKey!)
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
    ids.add(c.commandId);
    keys.add(c.idempotencyKey!);
    state = after;
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
  const before = replayFinanceNativeBudgetHistory(
    command.worldId,
    source.frames,
    sha,
  );
  if (
    before.worldVersion !== command.expectedWorldVersion ||
    before.worldVersion !== source.worldVersion ||
    before.eventSequence !== source.eventSequence ||
    !isAuthoritativeFinancialLedgerState(source.financialState) ||
    source.financialState.worldId !== command.worldId ||
    source.financialState.worldVersion !== before.worldVersion
  )
    invalid('ACTUAL_CANONICAL_SOURCE_HEAD_REQUIRED');
  const treasury = source.financialState.positions.find(
    (v) => v.account.accountId === source.binding.treasuryAccountId,
  );
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
