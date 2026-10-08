import {
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  CENTRAL_BANK_OMO_EVENT,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  OFFICE_DECISION_RESULT_SCHEMA,
  DOMAIN_ERROR_CODES,
  DomainError,
  Quantity,
  calculateOpenMarketOperation,
  centralBankOmoSourceHash,
  createFoundationFact,
  canonicalSha256,
  canonicalSerialize,
  parseCanonicalCommand,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
  replayCaptainPoliticalCapitalAllocation,
  validateAuthoritativeEvent,
  validateCanonicalCommand,
  validateAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinalCommandReceipt,
  type CaptainPoliticalCapitalSourceSnapshot,
  type CentralBankOmoSourceFacts,
  type FoundationTraceRequest,
  type Sha256Hex,
  type DecisionResultOffice,
  type DecisionResultHead,
  type DecisionResultMetric,
  type OfficeDecisionResult,
  type CountryDecisionResultSummary,
} from '@econmind/core';
import type { EconomicReadVisibilitySnapshot } from './economic-read-visibility-source.js';

export interface CommittedOfficeDecisionTransition {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly receipt: FinalCommandReceipt;
}
const OFFICES: readonly DecisionResultOffice[] = [
  'CAPTAIN',
  'CENTRAL_BANK',
  'SOCIAL',
  'INDUSTRY',
];
type RecordValue = Record<string, unknown>;
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Decision projection: ${message}`,
  );
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Required canonical record missing');
  return value as RecordValue;
}
function integer(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('Required exact integer missing');
  return value;
}
function keys(value: RecordValue, expected: readonly string[]): void {
  if (
    canonicalSerialize(Object.keys(value).sort()) !==
    canonicalSerialize([...expected].sort())
  )
    invalid('Missing or unknown domain fields');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function delta(
  key: string,
  before: { amount: string; unit: string },
  after: { amount: string; unit: string },
): DecisionResultMetric {
  const a = Quantity.from(before.amount, before.unit),
    b = Quantity.from(after.amount, after.unit);
  if (
    a.toCanonicalValue().amount !== before.amount ||
    b.toCanonicalValue().amount !== after.amount
  )
    invalid('Noncanonical result quantity');
  return freeze({
    key,
    unit: before.unit,
    status: 'EXACT_CHANGE',
    before: before.amount,
    delta: b.subtract(a).toCanonicalValue().amount,
    after: after.amount,
  });
}

/** Validates the complete held global stream, not just the last event of an office.
 * A trusted server reads these immutable records; this function issues no authority.
 */
export function validateCommittedDecisionLineage(input: {
  readonly sourceHead: DecisionResultHead;
  readonly transitions: readonly CommittedOfficeDecisionTransition[];
  readonly sha256Hex: Sha256Hex;
}): void {
  integer(input.sourceHead.worldVersion);
  integer(input.sourceHead.eventSequence);
  let version = 0n,
    sequence = 0n;
  const commands = new Set<string>(),
    events = new Set<string>();
  for (const value of input.transitions) {
    const { command, transition, receipt } = value;
    validateCanonicalCommand(command, input.sha256Hex);
    validateAuthoritativeTransition(transition);
    validateFinalReceiptForCommand({ command, transition, receipt });
    if (
      receipt.outcome !== 'COMMITTED' ||
      receipt.commandId !== command.commandId ||
      receipt.idempotencyKey !== command.idempotencyKey ||
      command.worldId !== input.sourceHead.worldId ||
      transition.commandId !== command.commandId ||
      transition.commandFingerprint !== command.fingerprint ||
      transition.worldId !== command.worldId ||
      transition.worldVersionBefore !== version.toString() ||
      (command.expectedWorldVersion !== null &&
        command.expectedWorldVersion !== transition.worldVersionBefore) ||
      commands.has(command.commandId) ||
      receipt.simTime.ticks !== command.simTime.ticks ||
      receipt.reasonCode !== null
    )
      invalid('Committed lineage identity/head/receipt mismatch');
    commands.add(command.commandId);
    for (const event of transition.events) {
      validateAuthoritativeEvent(event, input.sha256Hex);
      if (
        event.sequence !== (++sequence).toString() ||
        events.has(event.eventId) ||
        event.causationCommandId !== command.commandId ||
        event.correlationId !== command.correlationId ||
        event.simTime.ticks !== command.simTime.ticks
      )
        invalid('Event sequence/causality mismatch');
      events.add(event.eventId);
    }
    version++;
  }
  if (
    version.toString() !== input.sourceHead.worldVersion ||
    sequence.toString() !== input.sourceHead.eventSequence
  )
    invalid('Lineage does not terminate at the exact held head');
}

export function projectCountryDecisionResultSummary(
  countryId: string,
  sourceHead: DecisionResultHead,
): CountryDecisionResultSummary {
  return freeze({
    schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
    classification: 'COUNTRY',
    countryId,
    sourceHead: { ...sourceHead },
    status: 'NOT_AUTHORIZED',
    reason: 'OFFICE_DECISION_DETAIL_PRIVATE',
  });
}

export interface OfficeDecisionProjectionInput {
  readonly countryId: string;
  readonly officeId: string;
  readonly sourceHead: DecisionResultHead;
  readonly transitions: readonly CommittedOfficeDecisionTransition[];
  readonly visibility: EconomicReadVisibilitySnapshot;
  readonly sha256Hex: Sha256Hex;
}
/** Projection scope must come from current server authorization, never a browser choice. */
export function projectOfficeDecisionResult(
  input: OfficeDecisionProjectionInput,
): OfficeDecisionResult | null {
  validateCommittedDecisionLineage(input);
  return projectOfficeDecisionResultFromCheckedLineage(input);
}

/** Batch publication validates the global stream once, not once per active office.
 * The private helper is not an admission token or a separately exported authority API.
 */
export function projectOfficeDecisionResults(
  input: Omit<OfficeDecisionProjectionInput, 'countryId' | 'officeId'> & {
    readonly scopes: readonly Readonly<{
      countryId: string;
      officeId: string;
    }>[];
  },
): ReadonlyMap<string, OfficeDecisionResult | null> {
  validateCommittedDecisionLineage(input);
  return new Map(
    input.scopes.map((scope) => [
      canonicalSerialize([scope.countryId, scope.officeId]),
      projectOfficeDecisionResultFromCheckedLineage({ ...input, ...scope }),
    ]),
  );
}

function projectOfficeDecisionResultFromCheckedLineage(
  input: OfficeDecisionProjectionInput,
): OfficeDecisionResult | null {
  if (!OFFICES.includes(input.officeId as DecisionResultOffice)) return null;
  const office = input.officeId as DecisionResultOffice;
  if (
    input.visibility.worldId !== input.sourceHead.worldId ||
    input.visibility.worldVersion !== input.sourceHead.worldVersion ||
    input.visibility.eventSequence !== input.sourceHead.eventSequence
  )
    invalid('Disclosure and publication head differ');
  const empty = (
    reason: string,
    status: 'SOURCE_UNAVAILABLE' | 'NOT_AUTHORIZED' = 'SOURCE_UNAVAILABLE',
  ): OfficeDecisionResult =>
    freeze({
      schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
      classification: 'OFFICE_PRIVATE',
      countryId: input.countryId,
      officeId: office,
      sourceHead: { ...input.sourceHead },
      semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
      source: null,
      afterState: null,
      status,
      reason,
      businessState: null,
      cause: null,
      metrics: [],
    });
  if (office === 'INDUSTRY')
    return empty('COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE');
  // Social due commands have no human office; only the registered family maps to SOCIAL.
  const candidates = input.transitions
    .flatMap((value) =>
      value.transition.events.map((event) => ({ ...value, event })),
    )
    .filter(
      (value) =>
        value.command.countryId === input.countryId &&
        (value.command.officeId === office ||
          (office === 'SOCIAL' &&
            value.event.eventType === SOCIAL_JOB_MATCH_EVENT)),
    );
  const latest = candidates.at(-1);
  if (!latest) return empty('NO_COMMITTED_DOMAIN_RESULT');
  const { event, command, transition } = latest;
  if (
    (
      [
        CAPTAIN_POLITICAL_CAPITAL_EVENT,
        CENTRAL_BANK_OMO_EVENT,
        SOCIAL_SERVICE_PLAN_EVENT,
        SOCIAL_JOB_MATCH_EVENT,
      ] as readonly string[]
    ).includes(event.eventType) &&
    (event.correctsEventId !== null || transition.events.length !== 1)
  )
    invalid(
      'Known office result requires the existing one-event non-correction transition',
    );
  const payload = record(JSON.parse(event.canonicalPayload));
  let metrics: readonly DecisionResultMetric[],
    state: OfficeDecisionResult['businessState'] = 'APPLIED';
  let planCommandId: string | null = null,
    partial = false;
  if (office === 'CAPTAIN') {
    if (event.eventType !== CAPTAIN_POLITICAL_CAPITAL_EVENT)
      return empty('UNSUPPORTED_EVENT_TYPE');
    const source = payload.source as CaptainPoliticalCapitalSourceSnapshot;
    const embedded = parseCanonicalCommand(payload.command, input.sha256Hex);
    if (
      embedded.fingerprint !== command.fingerprint ||
      embedded.commandId !== command.commandId
    )
      invalid('Captain event is not the committed command');
    const replay = replayCaptainPoliticalCapitalAllocation({
      state: {
        worldId: command.worldId,
        countryId: command.countryId,
        worldVersion: transition.worldVersionBefore,
        lastEventSequence: (BigInt(event.sequence) - 1n).toString(),
        capital: source.capitalFact.payload,
        applied: [],
      },
      event,
      sha256Hex: input.sha256Hex,
    });
    metrics = source.capitalFact.payload.buckets.map((before, index) => {
      const after = replay.capital.buckets[index]!;
      if (before.bucket !== after.bucket) invalid('Bucket identity differs');
      return delta(
        `POLITICAL_CAPITAL.${before.bucket}`,
        before.balance,
        after.balance,
      );
    });
  } else if (office === 'CENTRAL_BANK') {
    if (event.eventType !== CENTRAL_BANK_OMO_EVENT)
      return empty('UNSUPPORTED_EVENT_TYPE');
    keys(payload, [
      'schemaVersion',
      'commandFingerprint',
      'intent',
      'source',
      'trace',
      'rights',
      'kernelReplayHash',
    ]);
    const facts = payload.source as CentralBankOmoSourceFacts,
      trace = payload.trace as FoundationTraceRequest;
    const intent = parseCentralBankOmoIntent(command, input.sha256Hex);
    if (
      payload.schemaVersion !== 'central-bank-omo-settlement-v1' ||
      payload.commandFingerprint !== command.fingerprint ||
      canonicalSerialize(payload.intent) !== canonicalSerialize(intent) ||
      facts.worldId !== command.worldId ||
      facts.countryId !== command.countryId ||
      facts.worldVersion !== transition.worldVersionBefore ||
      facts.currentEventSequence !== (BigInt(event.sequence) - 1n).toString() ||
      facts.currentSimTime !== command.simTime.toCanonicalValue() ||
      trace.snapshot.snapshotHash !==
        centralBankOmoSourceHash(facts, input.sha256Hex) ||
      trace.snapshot.sourceVersion !== `WORLD_VERSION.${facts.worldVersion}` ||
      trace.snapshotAt.amount !== facts.currentSimTime ||
      trace.snapshotAt.unit !== 'sim_millisecond'
    )
      invalid('OMO source/intent/head binding mismatch');
    const scope = {
      worldId: command.worldId,
      countryId: command.countryId,
      officeId: office,
      classification: 'OFFICE_PRIVATE' as const,
    };
    if (
      input.visibility.summary(scope).financialDetail !== 'AUTHORIZED_FILTERED'
    )
      return empty('SCOPE_NOT_AUTHORIZED', 'NOT_AUTHORIZED');
    for (const key of [
      'governmentSecurities',
      'commercialBankReserves',
    ] as const) {
      const disclosure = input.visibility.financial(
        {
          worldId: command.worldId,
          countryId: command.countryId,
          ownerId: facts.centralBank.centralBankRef,
          accountId: facts.centralBankAccounts[key],
          currency: facts.centralBank.currency,
        },
        scope,
      );
      if (disclosure.status !== 'AUTHORIZED')
        return empty('SCOPE_NOT_AUTHORIZED', 'NOT_AUTHORIZED');
    }
    const settlementAmount = record(
      record(payload.rights).settlementAmount,
    ) as unknown as { amount: string; currency: string };
    const fact = <T>(kind: string, value: T) =>
      createFoundationFact({
        trace,
        factRef: `CB1.${kind}`,
        sourceRef: trace.snapshot.snapshotRef,
        predecessorFactRefs: [trace.snapshot.lineageRef],
        payload: value,
      });
    const kernel = calculateOpenMarketOperation({
      trace,
      commercialBankFact: fact('Bank', facts.bank),
      centralBankFact: fact('CentralBank', facts.centralBank),
      operationFact: fact('Operation', {
        bankRef: facts.bank.bankRef,
        centralBankRef: facts.centralBank.centralBankRef,
        operationRef: command.commandId,
        securityRef: intent.securityRef,
        direction: intent.direction,
        settlementAmount,
      }),
      outputRef: 'CB1.Output',
    });
    if (
      payload.kernelReplayHash !==
      canonicalSha256(kernel.replayProof.hashInput, input.sha256Hex)
    )
      invalid('OMO kernel replay differs');
    // Only the central bank's own two traces. Never publish commercial bank traces or holdings.
    metrics = kernel.centralBankTraces.map((value, i) =>
      delta(
        i === 0 ? 'CB_GOVERNMENT_SECURITIES' : 'CB_COMMERCIAL_BANK_RESERVES',
        { amount: value.before.amount, unit: value.before.currency },
        { amount: value.after.amount, unit: value.after.currency },
      ),
    );
  } else {
    if (
      !(
        [SOCIAL_SERVICE_PLAN_EVENT, SOCIAL_JOB_MATCH_EVENT] as readonly string[]
      ).includes(event.eventType)
    )
      return empty('UNSUPPORTED_EVENT_TYPE');
    keys(payload, [
      'schemaVersion',
      'command',
      'readFacts',
      'beforeStateHash',
      'afterStateHash',
      'result',
    ]);
    const embedded = parseCanonicalCommand(payload.command, input.sha256Hex),
      parsed = parseSocialEmploymentServiceCommand(command, input.sha256Hex);
    if (
      embedded.commandId !== command.commandId ||
      embedded.fingerprint !== command.fingerprint ||
      payload.schemaVersion !== 'social-employment-service-event-v1' ||
      event.eventType !==
        (parsed.kind === 'PLAN'
          ? SOCIAL_SERVICE_PLAN_EVENT
          : SOCIAL_JOB_MATCH_EVENT) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(payload.beforeStateHash)) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(payload.afterStateHash))
    )
      invalid('Social event command/type/hash mismatch');
    const result = record(payload.result),
      facts = record(payload.readFacts),
      offer = record(facts.offer),
      floor = record(facts.minimumWage);
    keys(result, [
      'kind',
      'planCommandId',
      'servicePoolId',
      'positionId',
      'allocatedSlots',
      'matched',
      'remainingUnemployed',
      'remainingVacancies',
      'remainingFreeServiceSlots',
      'reason',
    ]);
    if (
      result.kind !== parsed.kind ||
      offer.countryId !== command.countryId ||
      floor.countryId !== command.countryId ||
      offer.positionId !== result.positionId ||
      facts.simTime !== command.simTime.toCanonicalValue()
    )
      invalid('Social country/position/time mismatch');
    if (parsed.kind === 'PLAN') {
      if (
        result.planCommandId !== command.commandId ||
        result.servicePoolId !== parsed.intent.servicePoolId ||
        result.positionId !== parsed.intent.positionId ||
        result.allocatedSlots !== parsed.intent.requestedMatches ||
        result.matched !== '0'
      )
        invalid('Social plan result differs from intent');
      planCommandId = command.commandId;
      state = 'PLAN_PENDING';
    } else {
      planCommandId = parsed.intent.planCommandId;
      const plan = input.transitions.find(
        (value) => value.command.commandId === planCommandId,
      );
      if (
        !plan ||
        plan.command.countryId !== command.countryId ||
        plan.command.fingerprint !== parsed.intent.planFingerprint ||
        BigInt(plan.transition.worldVersionAfter) >=
          BigInt(transition.worldVersionAfter) ||
        !plan.transition.events.some(
          (value) => value.eventType === SOCIAL_SERVICE_PLAN_EVENT,
        )
      )
        invalid('Social settlement has no earlier same-country committed plan');
      const original = parseSocialEmploymentServiceCommand(
        plan.command,
        input.sha256Hex,
      );
      if (
        original.kind !== 'PLAN' ||
        result.planCommandId !== planCommandId ||
        result.positionId !== original.intent.positionId ||
        result.servicePoolId !== original.intent.servicePoolId ||
        result.allocatedSlots !== original.intent.requestedMatches ||
        parsed.intent.dueDayIndex !== original.intent.dueDayIndex ||
        integer(record(facts.boundary).dayIndex) !== parsed.intent.dueDayIndex
      )
        invalid('Social settlement is not bound to original plan');
      state = 'MATCH_SETTLED';
    }
    if (
      BigInt(integer(result.matched)) > BigInt(integer(result.allocatedSlots))
    )
      invalid('Matches exceed committed allocation');
    // Hashes are not predecessor state. Report only the quantities actually carried by the event.
    metrics = [
      'matched',
      'remainingUnemployed',
      'remainingVacancies',
      'remainingFreeServiceSlots',
    ].map((key) =>
      freeze({
        key: `SOCIAL.${key}`,
        unit: key === 'remainingFreeServiceSlots' ? 'service_slot' : 'person',
        status: 'AFTER_ONLY' as const,
        before: null,
        delta: null,
        after: integer(result[key]),
        reason: 'PREDECESSOR_STATE_NOT_CARRIED' as const,
      }),
    );
    partial = true;
  }
  return freeze({
    schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
    classification: 'OFFICE_PRIVATE',
    countryId: input.countryId,
    officeId: office,
    sourceHead: { ...input.sourceHead },
    semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
    source: 'COMMITTED_EVENT_RESULT',
    afterState: null,
    status: 'COMMITTED',
    reason: partial ? 'PREDECESSOR_STATE_NOT_CARRIED' : null,
    businessState: state,
    cause: {
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      eventId: event.eventId,
      eventFingerprint: event.fingerprint,
      eventType: event.eventType,
      eventSequence: event.sequence,
      worldVersionBefore: transition.worldVersionBefore,
      worldVersionAfter: transition.worldVersionAfter,
      simTime: event.simTime.toCanonicalValue(),
      planCommandId,
    },
    metrics,
  });
}
