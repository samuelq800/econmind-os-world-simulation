/** Existing conditional Core Budget semantics wired to a fixed server source.
 * This creates inert drafts, never AtomicTransitionDraft or stored events. */
import {
  canonicalSerialize,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
} from '@econmind/core';
import {
  BUDGET_DOMAIN_SCHEMAS,
  computeBudgetSourceDomain,
  parseBudgetSourcePayload,
  replayBudgetSourceDomain,
  type BudgetDomainCommand,
  type BudgetDomainResult,
} from '@econmind/core/finance-budget-conditional-contract';
import { createHash } from 'node:crypto';
import {
  prepareFinanceBudgetEventWire,
  type FinanceBudgetEventWire,
} from '@econmind/core/finance-budget-event-wire-contract';
import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  withFinanceBudgetRuntimeSourceFrom,
  type FinanceBudgetRuntimeSourcePort,
  type FinanceBudgetSourceConsumption,
} from '../persistence/finance-budget-runtime-source.js';

const FLAGS = Object.freeze({
  evidenceClass: 'TEST_ONLY',
  semanticsOnly: true,
  productionAuthority: false,
  sourceAdmitted: false,
  runtimeConnected: false,
} as const);
type ConditionalChange = Extract<
  BudgetDomainResult,
  { kind: 'CONDITIONAL_DOMAIN_CHANGE' }
>;
export type FinanceBudgetConditionalDraft = typeof FLAGS &
  Readonly<{
    kind: 'CONDITIONAL_DRAFT_PREPARED';
    commandFingerprint: string;
    sourceBinding: Readonly<{
      sourceId: string;
      sourceRevision: string;
      snapshotFingerprint: string;
    }>;
    /** Exactly the existing kernel's intents/state. No replacement arithmetic,
     * current_materialization write, stored-event schema, receipt or grant. */
    domain: ConditionalChange;
  }>;
export type FinanceBudgetConditionalPreparation =
  | FinanceBudgetConditionalDraft
  | (typeof FLAGS &
      Readonly<{ kind: 'SOURCE_MISSING'; missing: readonly string[] }>)
  | (typeof FLAGS &
      Readonly<{
        kind: 'CONDITIONAL_PREPARATION_DENIED';
        code: string;
        path: string;
      }>);
export type FinanceBudgetEventWirePreparation =
  | Exclude<FinanceBudgetConditionalPreparation, FinanceBudgetConditionalDraft>
  | (FinanceBudgetConditionalDraft &
      Readonly<{
        eventWire: Extract<
          FinanceBudgetEventWire,
          { kind: 'BUDGET_EVENT_WIRE_PREPARED' }
        >;
      }>);

function denied(
  code: string,
  path: string,
): Extract<
  FinanceBudgetConditionalPreparation,
  { kind: 'CONDITIONAL_PREPARATION_DENIED' }
> {
  return Object.freeze({
    ...FLAGS,
    kind: 'CONDITIONAL_PREPARATION_DENIED',
    code,
    path,
  });
}
function prepare(
  command: CanonicalCommand,
  source: FinanceBudgetSourceConsumption,
): FinanceBudgetConditionalPreparation {
  const replay = replayBudgetSourceDomain(source.replay);
  if (replay.kind === 'DOMAIN_DENIED')
    return denied(`REPLAY_${replay.code}`, replay.path);
  const state = replay.nextState;
  if (
    state.worldId !== command.worldId ||
    state.worldVersion !== source.request.head.worldVersion ||
    state.eventSequence !== source.request.head.eventSequence
  )
    return denied('SOURCE_REPLAY_HEAD_MISMATCH', 'replay.expectedHead');
  const canonical: BudgetDomainCommand = {
    worldId: command.worldId,
    countryId: command.countryId,
    officeId: 'FINANCE',
    commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey!,
    expectedWorldVersion: command.expectedWorldVersion!,
    payload: parseBudgetSourcePayload(JSON.parse(command.canonicalPayload)),
  };
  const domain = computeBudgetSourceDomain({
    schemaVersion: BUDGET_DOMAIN_SCHEMAS.evaluation,
    command: canonical,
    context: source.context,
    state,
  });
  if (domain.kind === 'DOMAIN_DENIED') return denied(domain.code, domain.path);
  if (domain.kind === 'CONDITIONAL_DOMAIN_DUPLICATE')
    return denied('ORIGINAL_DURABLE_RECEIPT_RECOVERY_REQUIRED', 'command');
  return Object.freeze({
    ...FLAGS,
    kind: 'CONDITIONAL_DRAFT_PREPARED',
    commandFingerprint: command.fingerprint,
    sourceBinding: Object.freeze({
      sourceId: source.sourceId,
      sourceRevision: source.sourceRevision,
      snapshotFingerprint: source.snapshotFingerprint,
    }),
    domain,
  });
}

/** Fixed source constructor only; no candidateFactory, amount/approval/grant
 * overrides or automatic dispatch. No source means denial before computation.
 * The current Core's TEST_ONLY restriction is enforced by the source consumer.
 * Durable receipt recovery remains before this new-effect preparation, owned
 * by the existing repository; a semantic duplicate never becomes a receipt. */
export function createFinanceBudgetCommandComposition(
  config: Readonly<{
    source?: FinanceBudgetRuntimeSourcePort | null;
    environment: Readonly<NodeJS.ProcessEnv>;
  }>,
) {
  const source = config.source ?? null;
  const environment = Object.freeze({ ...config.environment });
  return Object.freeze({
    status: 'CONDITIONAL_PREPARATION_ONLY_NOT_RUNTIME_ADMISSION' as const,
    async prepareFrom(
      input: Readonly<{
        transaction: SqlExecutor;
        command: CanonicalCommand;
        authorization: AuthorizedOfficeContext;
      }>,
    ): Promise<FinanceBudgetConditionalPreparation> {
      const read = await withFinanceBudgetRuntimeSourceFrom(
        { ...input, source, environment },
        async (snapshot) => prepare(input.command, snapshot),
      );
      if (read.status === 'MISSING')
        return Object.freeze({
          ...FLAGS,
          kind: 'SOURCE_MISSING',
          missing: read.missing,
        });
      // The source scope returned only an owned immutable conditional artifact,
      // not an authority token reusable after releasing source protection.
      canonicalSerialize(read.value);
      return read.value;
    },
    /** Canonical event/transition/receipt candidates for engineering review.
     * No queue claim, source admission, threshold default or persistence.
     * The recorded timestamp comes from the server operation, never a DTO. */
    async prepareEventWireFrom(
      input: Readonly<{
        transaction: SqlExecutor;
        command: CanonicalCommand;
        authorization: AuthorizedOfficeContext;
        recordedAtReal: string;
      }>,
    ): Promise<FinanceBudgetEventWirePreparation> {
      const read = await withFinanceBudgetRuntimeSourceFrom(
        { ...input, source, environment },
        async (snapshot): Promise<FinanceBudgetEventWirePreparation> => {
          const conditional = prepare(input.command, snapshot);
          if (conditional.kind !== 'CONDITIONAL_DRAFT_PREPARED')
            return conditional;
          const replayed = replayBudgetSourceDomain(snapshot.replay);
          if (replayed.kind === 'DOMAIN_DENIED')
            return denied(replayed.code, replayed.path);
          const eventWire = prepareFinanceBudgetEventWire({
            command: input.command,
            state: replayed.nextState,
            context: snapshot.context,
            sourceReadFingerprint: snapshot.snapshotFingerprint,
            recordedAtReal: input.recordedAtReal,
            sha256Hex: (text) =>
              createHash('sha256').update(text).digest('hex'),
          });
          if (eventWire.kind === 'BUDGET_EVENT_WIRE_DENIED')
            return denied(eventWire.code, eventWire.path);
          if (
            canonicalSerialize(eventWire.nextState) !==
            canonicalSerialize(conditional.domain.nextState)
          )
            throw new Error('Budget source/wire deterministic state differs');
          return Object.freeze({ ...conditional, eventWire });
        },
      );
      if (read.status === 'MISSING')
        return Object.freeze({
          ...FLAGS,
          kind: 'SOURCE_MISSING',
          missing: read.missing,
        });
      return read.value;
    },
  });
}
