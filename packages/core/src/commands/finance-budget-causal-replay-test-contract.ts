import { canonicalSerialize } from '../serialization/canonical.js';
import { isSimTime } from '../numeric/sim-time.js';
import {
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  bindAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
} from './receipt.js';
import {
  parseBudgetSourcePayload,
  replayBudgetSourceDomain,
} from './finance-budget-source-transition.js';

/** LOCAL test composition only, not stored wire, source admission or a factory. */
const SCHEMA = 'budget-causal-replay-test-v1';
const FLAGS = {
  evidenceClass: 'TEST_ONLY',
  semanticsOnly: true,
  productionAuthority: false,
  sourceAdmitted: false,
  runtimeConnected: false,
} as const;
type Row = Record<string, unknown>;
interface Group {
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly eventIds: readonly string[];
  readonly intentKinds: readonly string[];
}
export type BudgetCausalReplayTestResult = typeof FLAGS &
  (
    | Readonly<{
        kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH';
        checkedCommandCount: number;
        checkedEventCount: number;
        head: Readonly<{ worldVersion: string; eventSequence: string }>;
        groups: readonly Readonly<Group>[];
      }>
    | Readonly<{
        kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED';
        code: string;
        path: string;
      }>
  );

class Invalid extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
  ) {
    super(code);
  }
}
function fail(code: string, path: string): never {
  throw new Invalid(code, path);
}
function row(value: unknown, path: string): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail('TEST_CONTRACT_INVALID', path);
  return value as Row;
}
function record(value: unknown, keys: readonly string[], path: string): Row {
  const r = row(value, path);
  if (
    Object.keys(r).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(r, key))
  )
    fail('TEST_CONTRACT_INVALID', path);
  return r;
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail('TEST_CONTRACT_INVALID', path);
  return value;
}
function equal(a: unknown, b: unknown, code: string, path: string): void {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) fail(code, path);
}
function unique(value: string, seen: Set<string>, path: string): void {
  if (seen.has(value)) fail('IDENTITY_REUSED', path);
  seen.add(value);
}
function owned<T>(value: T): T {
  // Output contains plain audit strings/counts only, never Core evidence objects.
  // Audit counts are ordinary numbers, not authoritative canonical amounts.
  // Only our newly constructed plain summary reaches here; no caller aliases.
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    for (const child of Object.values(node)) freeze(child);
    Object.freeze(node);
  };
  freeze(copy);
  return copy;
}
function denied(code: string, path: string): BudgetCausalReplayTestResult {
  return owned({
    ...FLAGS,
    kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_DENIED' as const,
    code,
    path,
  });
}

/**
 * Checks correspondence, not source existence or durable COMMIT. The supplied
 * graph is synthetic TEST_ONLY evidence. No nextState, candidate, receipt,
 * Event, source brand or permission is issued; no official importer is wired.
 */
export function checkBudgetCausalReplayForTest(
  input: unknown,
  sha256Hex: Sha256Hex,
): BudgetCausalReplayTestResult {
  let stage = 'input';
  try {
    const x = record(
      input,
      ['schemaVersion', 'evidenceClass', 'replay', 'frames'],
      stage,
    );
    if (x.schemaVersion !== SCHEMA) fail('TEST_CONTRACT_INVALID', stage);
    if (x.evidenceClass !== 'TEST_ONLY')
      fail('TEST_EVIDENCE_CLASS_REQUIRED', 'input.evidenceClass');
    const replayed = replayBudgetSourceDomain(x.replay);
    if (replayed.kind === 'DOMAIN_DENIED')
      return denied(`DOMAIN_${replayed.code}`, `replay.${replayed.path}`);
    const replay = row(x.replay, 'replay');
    const steps = list(replay.steps, 'replay.steps');
    const frames = list(x.frames, 'frames');
    if (frames.length !== steps.length) fail('FRAME_COUNT_MISMATCH', 'frames');
    const commands = new Set<string>(),
      keys = new Set<string>(),
      events = new Set<string>();
    const groups: Group[] = [];
    let version = 0n,
      sequence = 0n,
      eventCount = 0;
    for (const [i, raw] of frames.entries()) {
      stage = `frames.${i}`;
      const frame = record(raw, ['command', 'transition', 'receipt'], stage);
      const command = validateCanonicalCommand(
        frame.command as CanonicalCommand,
        sha256Hex,
      );
      record(
        frame.transition,
        [
          'schemaVersion',
          'transitionId',
          'worldId',
          'commandId',
          'commandFingerprint',
          'worldVersionBefore',
          'worldVersionAfter',
          'eventIds',
          'events',
        ],
        `${stage}.transition`,
      );
      const transition = frame.transition as AuthoritativeTransition;
      const binding = bindAuthoritativeTransition(
        { command, transition },
        sha256Hex,
      );
      equal(command.worldId, replay.worldId, 'FRAME_BINDING_MISMATCH', stage);
      equal(
        command.expectedWorldVersion,
        version.toString(),
        'GLOBAL_CURSOR_MISMATCH',
        `${stage}.command.expectedWorldVersion`,
      );
      equal(
        binding.worldVersionBefore,
        version.toString(),
        'GLOBAL_CURSOR_MISMATCH',
        stage,
      );
      if (command.idempotencyKey === null)
        fail('FRAME_BINDING_MISMATCH', `${stage}.command.idempotencyKey`);
      unique(command.commandId, commands, `${stage}.command.commandId`);
      unique(command.idempotencyKey, keys, `${stage}.command.idempotencyKey`);
      record(
        frame.receipt,
        [
          'schemaVersion',
          'worldId',
          'commandId',
          'idempotencyKey',
          'commandFingerprint',
          'outcome',
          'reasonCode',
          'transitionId',
          'worldVersionBefore',
          'worldVersionAfter',
          'simTime',
          'eventIds',
          'recordedAtReal',
        ],
        `${stage}.receipt`,
      );
      const receipt = frame.receipt as FinalCommandReceipt;
      validateFinalReceiptForCommand({ command, transition, receipt });
      if (
        receipt.outcome !== 'COMMITTED' ||
        receipt.commandId !== command.commandId ||
        receipt.idempotencyKey !== command.idempotencyKey ||
        receipt.reasonCode !== null ||
        !isSimTime(receipt.simTime) ||
        receipt.simTime.ticks !== command.simTime.ticks ||
        typeof receipt.recordedAtReal !== 'string' ||
        !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u.test(
          receipt.recordedAtReal,
        )
      )
        fail('RECEIPT_BINDING_MISMATCH', `${stage}.receipt`);
      const step = row(steps[i], `replay.steps.${i}`);
      const intents =
        step.kind === 'BUDGET_TEST_FIXTURE'
          ? list(step.eventIntents, `replay.steps.${i}.eventIntents`)
          : [];
      const payload: unknown = JSON.parse(command.canonicalPayload);
      if (step.kind === 'BUDGET_TEST_FIXTURE') {
        equal(
          {
            worldId: command.worldId,
            countryId: command.countryId,
            officeId: command.officeId,
            commandType: command.commandType,
            commandId: command.commandId,
            idempotencyKey: command.idempotencyKey,
            expectedWorldVersion: command.expectedWorldVersion,
            payload: parseBudgetSourcePayload(payload),
          },
          step.command,
          'FRAME_BINDING_MISMATCH',
          `${stage}.command`,
        );
        const context = row(step.context, `replay.steps.${i}.context`);
        equal(
          row(context.authorization, 'context.authorization').actorRef,
          command.actorId,
          'FRAME_BINDING_MISMATCH',
          `${stage}.command.actorId`,
        );
        equal(
          context.intentSimTime,
          command.simTime.toCanonicalValue(),
          'FRAME_BINDING_MISMATCH',
          `${stage}.command.simTime`,
        );
        if (transition.events.length !== intents.length)
          fail('EVENT_GROUP_MISMATCH', `${stage}.transition.events`);
      } else {
        if (
          step.kind !== 'UNRELATED_TEST_FIXTURE' ||
          command.commandType !== 'TEST_ONLY_NON_ECONOMIC_COMMAND' ||
          command.officeId !== null
        )
          fail('UNSUPPORTED_TEST_EVENT', stage);
        equal(
          payload,
          { affectedBudgetLineRefs: [] },
          'UNSUPPORTED_TEST_EVENT',
          `${stage}.command.payload`,
        );
        equal(
          [command.commandId, command.idempotencyKey],
          [step.commandId, step.idempotencyKey],
          'FRAME_BINDING_MISMATCH',
          stage,
        );
        if (transition.events.length !== list(step.events, stage).length)
          fail('EVENT_GROUP_MISMATCH', stage);
      }
      for (const [j, event] of transition.events.entries()) {
        const path = `${stage}.transition.events.${j}`;
        unique(event.eventId, events, `${path}.eventId`);
        equal(
          event.sequence,
          (++sequence).toString(),
          'GLOBAL_CURSOR_MISMATCH',
          path,
        );
        if (
          event.correctsEventId !== null ||
          event.correlationId !== command.correlationId
        )
          fail('EVENT_GROUP_MISMATCH', path);
        if (step.kind === 'BUDGET_TEST_FIXTURE') {
          if (event.eventType !== 'TEST_ONLY_BUDGET_DOMAIN_INTENT')
            fail('UNSUPPORTED_TEST_EVENT', path);
          const intent = row(intents[j], `${path}.intent`);
          equal(
            event.canonicalPayload,
            canonicalSerialize(intent),
            'EVENT_GROUP_MISMATCH',
            path,
          );
          equal(
            [
              event.sequence,
              event.worldVersion,
              event.simTime.toCanonicalValue(),
            ],
            [intent.sequence, intent.worldVersion, intent.intentSimTime],
            'EVENT_GROUP_MISMATCH',
            path,
          );
        } else {
          if (event.eventType !== 'TEST_ONLY_NON_ECONOMIC_EVENT')
            fail('UNSUPPORTED_TEST_EVENT', path);
          equal(
            event.canonicalPayload,
            canonicalSerialize({ affectedBudgetLineRefs: [] }),
            'UNSUPPORTED_TEST_EVENT',
            path,
          );
        }
        eventCount++;
      }
      version++;
      groups.push({
        commandId: command.commandId,
        commandFingerprint: command.fingerprint,
        eventIds: [...transition.eventIds],
        intentKinds: intents.map((intent) => String(row(intent, stage).kind)),
      });
    }
    const head = {
      worldVersion: version.toString(),
      eventSequence: sequence.toString(),
    };
    equal(head, replay.expectedHead, 'GLOBAL_CURSOR_MISMATCH', 'frames.head');
    equal(
      head,
      {
        worldVersion: replayed.nextState.worldVersion,
        eventSequence: replayed.nextState.eventSequence,
      },
      'GLOBAL_CURSOR_MISMATCH',
      'frames.head',
    );
    return owned({
      ...FLAGS,
      kind: 'TEST_ONLY_BUDGET_CAUSAL_REPLAY_MATCH' as const,
      checkedCommandCount: frames.length,
      checkedEventCount: eventCount,
      head,
      groups,
    });
  } catch (error) {
    return error instanceof Invalid
      ? denied(error.code, error.path)
      : denied('CANONICAL_EVIDENCE_INVALID', stage);
  }
}
