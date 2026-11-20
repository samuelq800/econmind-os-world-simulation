/** Canonical event engineering over the existing Budget semantics. Building a
 * wire/transition/receipt candidate never authenticates or admits its sources.
 * Native source, current policy and commit protection remain server boundaries. */
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  validateAuthoritativeEvent,
} from '../events/event.js';
import {
  canonicalSha256,
  parseCanonicalCommand,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  bindAuthoritativeTransition,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
} from './receipt.js';
import {
  BUDGET_DOMAIN_SCHEMAS,
  computeBudgetSourceDomain,
  parseBudgetSourcePayload,
  replayBudgetSourceDomain,
  type BudgetDomainCommand,
  type BudgetDomainState,
} from './finance-budget-source-transition.js';
import { FINANCE_BUDGET_APPROPRIATION_COMMAND } from './authenticated-office-command-contract.js';
import {
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  replayCaptainPoliticalCapitalAllocation,
  type CaptainPoliticalCapitalSourceSnapshot,
} from './captain-political-capital-allocation.js';
import { worldId } from '../ids.js';

export const FINANCE_BUDGET_EVENT_PAYLOAD_SCHEMA =
  'finance-budget-event-v1' as const;
export const FINANCE_BUDGET_EVENT_TYPES = Object.freeze({
  BUDGET_ENVELOPE_SET: 'FINANCE_BUDGET_ENVELOPE_SET_V1',
  BUDGET_LINE_CREATED: 'FINANCE_BUDGET_LINE_CREATED_V1',
  BUDGET_APPROPRIATED: 'FINANCE_BUDGET_APPROPRIATED_V1',
  BUDGET_LINE_INITIALIZED: 'FINANCE_BUDGET_LINE_INITIALIZED_V1',
} as const);
const FLAGS = Object.freeze({
  wireOnly: true,
  sourceAdmitted: false,
  productionAuthority: false,
} as const);
type Data = Record<string, unknown>;
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Budget event wire: ${message}`,
  );
}
function record(value: unknown, keys: readonly string[]): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Closed canonical record required');
  const row = value as Data;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    invalid('Wire keys differ');
  return row;
}
const same = (left: unknown, right: unknown) =>
  canonicalSerialize(left) === canonicalSerialize(right);
const hash = (value: unknown, digest: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(value), digest);
function fingerprint(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value))
    invalid('Exact source-read fingerprint required');
  return value;
}
function domainCommand(
  command: CanonicalCommand,
  digest: Sha256Hex,
): BudgetDomainCommand {
  validateCanonicalCommand(command, digest);
  if (
    command.commandType !== FINANCE_BUDGET_APPROPRIATION_COMMAND ||
    command.officeId !== 'FINANCE' ||
    command.expectedWorldVersion === null ||
    command.idempotencyKey === null
  )
    invalid('Canonical discretionary Finance budget command required');
  const payload = parseBudgetSourcePayload(
    JSON.parse(command.canonicalPayload),
  );
  if (
    payload.scope.worldId !== command.worldId ||
    payload.scope.countryId !== command.countryId
  )
    invalid('Command/payload scope differs');
  return {
    worldId: command.worldId,
    countryId: command.countryId,
    officeId: 'FINANCE',
    commandType: FINANCE_BUDGET_APPROPRIATION_COMMAND,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    expectedWorldVersion: command.expectedWorldVersion,
    payload,
  };
}

export type FinanceBudgetEventWire = typeof FLAGS &
  (
    | Readonly<{
        kind: 'BUDGET_EVENT_WIRE_PREPARED';
        transition: AuthoritativeTransition;
        receiptCandidate: FinalCommandReceipt;
        nextState: BudgetDomainState;
      }>
    | Readonly<{ kind: 'BUDGET_EVENT_WIRE_DENIED'; code: string; path: string }>
  );

/** One WorldVersion transition; SET_ENVELOPE emits one event, APPROVE_NEW_LINE
 * emits the existing three intents in their existing order. No cash/stock
 * posting or new economic comparison is added. Source evidence labels are
 * preserved inside the original canonicalContext, never promoted to admission. */
export function prepareFinanceBudgetEventWire(
  input: Readonly<{
    command: CanonicalCommand;
    state: BudgetDomainState;
    context: unknown;
    sourceReadFingerprint: string;
    recordedAtReal: string;
    sha256Hex: Sha256Hex;
  }>,
): FinanceBudgetEventWire {
  const { command, state, context, sha256Hex: digest } = input;
  const parsed = domainCommand(command, digest);
  fingerprint(input.sourceReadFingerprint);
  const x = JSON.parse(canonicalSerialize(context)) as unknown;
  if (!x || typeof x !== 'object' || Array.isArray(x))
    invalid('Original source context required');
  const authority = (x as Data).authorization as Data | undefined;
  if (
    (x as Data).intentSimTime !== command.simTime.toCanonicalValue() ||
    authority?.actorRef !== command.actorId
  )
    invalid('Context actor/time differs from canonical Command');
  const result = computeBudgetSourceDomain({
    schemaVersion: BUDGET_DOMAIN_SCHEMAS.evaluation,
    command: parsed,
    state,
    context: x,
  });
  if (result.kind === 'DOMAIN_DENIED')
    return Object.freeze({
      ...FLAGS,
      kind: 'BUDGET_EVENT_WIRE_DENIED',
      code: result.code,
      path: result.path,
    });
  if (result.kind === 'CONDITIONAL_DOMAIN_DUPLICATE')
    return Object.freeze({
      ...FLAGS,
      kind: 'BUDGET_EVENT_WIRE_DENIED',
      code: 'ORIGINAL_DURABLE_RECEIPT_REQUIRED',
      path: 'command',
    });
  const stateBeforeHash = hash(state, digest),
    stateAfterHash = hash(result.nextState, digest);
  const events = result.eventIntents.map((intent, index) =>
    parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: `EVENT_FINANCE_BUDGET_${command.fingerprint.slice(7).toUpperCase()}_${index + 1}`,
        eventType: FINANCE_BUDGET_EVENT_TYPES[intent.kind],
        worldId: command.worldId,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: intent.worldVersion,
        sequence: intent.sequence,
        simTime: command.simTime.toCanonicalValue(),
        recordedAtReal: input.recordedAtReal,
        correctsEventId: null,
        payload: {
          schemaVersion: FINANCE_BUDGET_EVENT_PAYLOAD_SCHEMA,
          commandFingerprint: command.fingerprint,
          sourceReadFingerprint: input.sourceReadFingerprint,
          stateBeforeHash,
          stateAfterHash,
          intentIndex: String(index),
          intentCount: String(result.eventIntents.length),
          intent,
        },
      },
      digest,
    ),
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: state.worldVersion,
    worldVersionAfter: result.nextState.worldVersion,
    events,
  });
  bindAuthoritativeTransition({ command, transition }, digest);
  const receiptCandidate = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: input.recordedAtReal,
  });
  return Object.freeze({
    ...FLAGS,
    kind: 'BUDGET_EVENT_WIRE_PREPARED',
    transition,
    receiptCandidate,
    nextState: result.nextState,
  });
}

export interface FinanceBudgetEventWireFrame {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly receipt: FinalCommandReceipt;
  readonly inventoryPostings: readonly unknown[];
  readonly financialPostingBatches: readonly unknown[];
}
export interface FinanceBudgetEventWireReplayInput {
  readonly worldId: string;
  /** Explicit original-source declaration, not an inference from no rows.
   * Authenticating/admitting this declaration remains the source owner's job. */
  readonly origin: Readonly<{
    kind: 'EMPTY_BUDGET_ORIGIN_DECLARATION';
    worldId: string;
    openingWorldVersion: '0';
    openingEventSequence: '0';
    sourceReadFingerprint: string;
  }>;
  readonly frames: readonly FinanceBudgetEventWireFrame[];
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly sha256Hex: Sha256Hex;
}

/** Complete canonical frame dispatcher from the existing empty Budget origin.
 * No unknown/economic frame is skipped. The sole non-budget family admitted
 * here is independently replay-validated Captain capital allocation: its
 * economics are isolated from Budget by the existing Core contract. */
export function replayFinanceBudgetEventWire(
  input: FinanceBudgetEventWireReplayInput,
) {
  const digest = input.sha256Hex;
  const origin = record(input.origin, [
    'kind',
    'worldId',
    'openingWorldVersion',
    'openingEventSequence',
    'sourceReadFingerprint',
  ]);
  if (
    origin.kind !== 'EMPTY_BUDGET_ORIGIN_DECLARATION' ||
    origin.worldId !== input.worldId ||
    origin.openingWorldVersion !== '0' ||
    origin.openingEventSequence !== '0'
  )
    invalid('Explicit supported empty origin declaration required');
  fingerprint(origin.sourceReadFingerprint);
  let state: BudgetDomainState = {
    schemaVersion: BUDGET_DOMAIN_SCHEMAS.state,
    worldId: worldId(input.worldId),
    worldVersion: '0',
    eventSequence: '0',
    envelopes: [],
    history: [],
  };
  const steps: unknown[] = [],
    identities: unknown[] = [];
  const seenCommands = new Set<string>(),
    seenKeys = new Set<string>(),
    seenEvents = new Set<string>();
  for (const frame of input.frames) {
    const command = validateCanonicalCommand(frame.command, digest);
    const binding = bindAuthoritativeTransition(
      { command, transition: frame.transition },
      digest,
    );
    const receipt = validateFinalReceiptForCommand({
      command,
      transition: frame.transition,
      receipt: frame.receipt,
    });
    if (
      command.worldId !== input.worldId ||
      binding.worldVersionBefore !== state.worldVersion ||
      receipt.outcome !== 'COMMITTED' ||
      receipt.simTime.toCanonicalValue() !==
        command.simTime.toCanonicalValue() ||
      receipt.commandId !== command.commandId ||
      receipt.idempotencyKey !== command.idempotencyKey
    )
      invalid('Whole replay frame/head/receipt differs');
    const rebuiltReceipt = createFinalCommandReceipt({
      command,
      transition: frame.transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: receipt.recordedAtReal,
    });
    if (!same(rebuiltReceipt, receipt))
      invalid('Canonical final receipt fields differ');
    if (
      seenCommands.has(command.commandId) ||
      (command.idempotencyKey !== null && seenKeys.has(command.idempotencyKey))
    )
      invalid('Duplicate whole-replay command identity');
    seenCommands.add(command.commandId);
    if (command.idempotencyKey !== null) seenKeys.add(command.idempotencyKey);
    if (
      frame.inventoryPostings.length !== 0 ||
      frame.financialPostingBatches.length !== 0
    )
      invalid('Budget/capital event engineering cannot hide economic postings');
    for (const [index, event] of frame.transition.events.entries()) {
      validateAuthoritativeEvent(event, digest);
      if (
        event.sequence !==
          (BigInt(state.eventSequence) + BigInt(index) + 1n).toString() ||
        event.correlationId !== command.correlationId ||
        event.correctsEventId !== null ||
        seenEvents.has(event.eventId)
      )
        invalid('Whole replay event cursor/correction/identity differs');
      seenEvents.add(event.eventId);
    }
    if (command.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND) {
      const first = frame.transition.events[0]!;
      const payload = record(JSON.parse(first.canonicalPayload), [
        'schemaVersion',
        'commandFingerprint',
        'sourceReadFingerprint',
        'stateBeforeHash',
        'stateAfterHash',
        'intentIndex',
        'intentCount',
        'intent',
      ]);
      const intent = payload.intent as Data;
      if (typeof intent?.canonicalContext !== 'string')
        invalid('Original context absent from Budget wire');
      const context: unknown = JSON.parse(intent.canonicalContext);
      const prepared = prepareFinanceBudgetEventWire({
        command,
        state,
        context,
        sourceReadFingerprint: fingerprint(payload.sourceReadFingerprint),
        recordedAtReal: first.recordedAtReal,
        sha256Hex: digest,
      });
      if (
        prepared.kind !== 'BUDGET_EVENT_WIRE_PREPARED' ||
        !same(prepared.transition, frame.transition)
      )
        invalid('Budget event group fails exact economic replay');
      steps.push({
        kind: 'BUDGET_TEST_FIXTURE',
        command: domainCommand(command, digest),
        context,
        eventIntents: frame.transition.events.map(
          (event) => (JSON.parse(event.canonicalPayload) as Data).intent,
        ),
      });
    } else if (
      command.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND &&
      frame.transition.events.length === 1 &&
      frame.transition.events[0]!.eventType === CAPTAIN_POLITICAL_CAPITAL_EVENT
    ) {
      const event = frame.transition.events[0]!,
        payload = JSON.parse(event.canonicalPayload) as Data;
      const original = parseCanonicalCommand(payload.command, digest);
      if (!same(original, command))
        invalid('Captain no-budget-effect classifier Command differs');
      const source = payload.source as CaptainPoliticalCapitalSourceSnapshot;
      replayCaptainPoliticalCapitalAllocation({
        state: {
          worldId: command.worldId,
          countryId: command.countryId,
          worldVersion: state.worldVersion,
          lastEventSequence: state.eventSequence,
          capital: source.capitalFact.payload,
          applied: [],
        },
        event,
        sha256Hex: digest,
      });
      // This is the existing kernel's INTERNAL no-effect representation. The
      // actual original canonical frame remains in identities below; this is
      // never emitted/stored as a test event or used as source admission.
      steps.push({
        kind: 'UNRELATED_TEST_FIXTURE',
        worldId: input.worldId,
        worldVersionBefore: state.worldVersion,
        worldVersionAfter: binding.worldVersionAfter,
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        events: [
          {
            eventType: 'TEST_ONLY_NON_ECONOMIC_EVENT',
            sequence: event.sequence,
            affectedBudgetLineRefs: [],
          },
        ],
      });
    } else
      invalid('No versioned Budget effect handler for canonical event family');
    const replayed = replayBudgetSourceDomain({
      schemaVersion: BUDGET_DOMAIN_SCHEMAS.replay,
      worldId: input.worldId,
      steps,
      expectedHead: {
        worldVersion: binding.worldVersionAfter,
        eventSequence: frame.transition.events.at(-1)!.sequence,
      },
    });
    if (replayed.kind !== 'CONDITIONAL_DOMAIN_REPLAY')
      invalid(`Budget prefix replay denied: ${replayed.code}`);
    state = replayed.nextState;
    identities.push({
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      eventIds: frame.transition.eventIds,
      eventFingerprints: frame.transition.events.map(
        (event) => event.fingerprint,
      ),
      receipt: frame.receipt,
    });
  }
  if (
    !same(input.expectedHead, {
      worldVersion: state.worldVersion,
      eventSequence: state.eventSequence,
    })
  )
    invalid('Complete replay does not reach requested global head');
  return Object.freeze({
    ...FLAGS,
    kind: 'BUDGET_EVENT_WIRE_REPLAYED' as const,
    nextState: state,
    wholePrefixFingerprint: hash(
      { origin: input.origin, frames: identities },
      digest,
    ),
    checkedCommandCount: input.frames.length,
    checkedEventCount: seenEvents.size,
  });
}
