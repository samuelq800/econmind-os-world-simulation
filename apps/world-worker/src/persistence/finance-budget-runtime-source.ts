/** Server source consumption for the existing conditional Budget kernel.
 * The kernel currently accepts TEST_ONLY evidence only; this module preserves
 * that restriction and supplies no source-admission or commit capability. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  isAuthorizedOfficeContext,
  reauthorizeOfficeCapability,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
} from '@econmind/core';
import { validateManualOfficeCommandIntent } from '../intake/manual-office-command-intent.js';
import { FINANCE_BUDGET_APPROPRIATION_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import type { SqlExecutor } from './sql-database.js';

export interface FinanceBudgetSourceRequest {
  readonly worldId: string;
  readonly countryId: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly payloadHash: string;
  readonly authSubject: string;
  readonly authorizationRevision: string;
  readonly actorId: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly simTime: string;
}
export type FinanceBudgetSourceSnapshot = Readonly<{
  schemaVersion: 'finance-budget-conditional-source-snapshot-v1';
  evidenceClass: 'TEST_ONLY';
  sourceId: string;
  sourceRevision: string;
  requestBinding: FinanceBudgetSourceRequest;
  /** Original source context and COMPLETE existing-kernel replay input.
   * Never copied from the incoming browser payload, a cache or nextState. */
  context: unknown;
  replay: unknown;
}>;
export type FinanceBudgetSourceMissing = Readonly<{
  status: 'MISSING';
  missing: readonly string[];
}>;

/** Fixed server dependency, not a request DTO or caller readiness callback.
 * Implementations independently read source originals/current policy and full
 * lineage at request.head on this executor, protect their cooperating source
 * resources through the awaited callback, and return its exact result. The
 * interface itself does not authenticate/admit a source or install a writer. */
export interface FinanceBudgetRuntimeSourcePort {
  withSnapshotFrom<Result>(
    transaction: SqlExecutor,
    request: FinanceBudgetSourceRequest,
    consume: (
      snapshot: FinanceBudgetSourceSnapshot | FinanceBudgetSourceMissing,
    ) => Promise<Result>,
  ): Promise<Result>;
}

export interface FinanceBudgetSourceConsumption {
  readonly evidenceClass: 'TEST_ONLY';
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly snapshotFingerprint: string;
  readonly request: FinanceBudgetSourceRequest;
  readonly context: unknown;
  readonly replay: unknown;
}
export type FinanceBudgetSourceOutcome<Result> =
  | FinanceBudgetSourceMissing
  | Readonly<{
      status: 'CONDITIONAL_SOURCE_CONSUMED';
      evidenceClass: 'TEST_ONLY';
      value: Result;
    }>;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Finance budget source: ${message}`,
  );
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
function owned<T>(value: T): T {
  const result = JSON.parse(canonicalSerialize(value)) as T;
  const freeze = (v: unknown): void => {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
  };
  freeze(result);
  return result;
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Source record required');
  return value as Record<string, unknown>;
}
function closed(value: unknown, keys: readonly string[]) {
  const result = row(value);
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    invalid('Closed source contract required');
  return result;
}
function authorizationMatches(
  authorization: AuthorizedOfficeContext,
  command: CanonicalCommand,
) {
  return (
    authorization.worldId === command.worldId &&
    authorization.countryId === command.countryId &&
    authorization.authSubject === command.authSubject &&
    authorization.officeId === 'FINANCE' &&
    authorization.capability === 'FINANCE_BUDGET'
  );
}

/** This is an executing source consumer, not a boolean readiness predicate.
 * Missing dependencies never call consume. The callback can compute the
 * existing conditional kernel but cannot receive a native/admitted source tag.
 * No pool query, transaction or write is started by this module. */
export async function withFinanceBudgetRuntimeSourceFrom<Result>(
  input: Readonly<{
    transaction: SqlExecutor;
    command: CanonicalCommand;
    authorization: AuthorizedOfficeContext;
    source: FinanceBudgetRuntimeSourcePort | null;
    environment: Readonly<NodeJS.ProcessEnv>;
  }>,
  consume: (source: FinanceBudgetSourceConsumption) => Promise<Result>,
): Promise<FinanceBudgetSourceOutcome<Result>> {
  const { transaction, command, source } = input;
  validateManualOfficeCommandIntent(command);
  if (command.commandType !== FINANCE_BUDGET_APPROPRIATION_COMMAND)
    invalid('Budget command family required');
  if (!source)
    return Object.freeze({
      status: 'MISSING',
      missing: Object.freeze(['FINANCE_BUDGET_SERVER_SOURCE']),
    });
  if (
    !['local', 'ci'].includes(input.environment.ECONMIND_ENV ?? '') ||
    input.environment.NODE_ENV !== 'test' ||
    input.environment.VITEST !== 'true'
  )
    return Object.freeze({
      status: 'MISSING',
      missing: Object.freeze([
        'CORE_NATIVE_BUDGET_EVIDENCE_AND_STORED_EVENT_CONTRACT',
      ]),
    });
  if (
    !isAuthorizedOfficeContext(input.authorization) ||
    !authorizationMatches(input.authorization, command)
  )
    invalid('Server-issued current Finance authorization required');
  const authorization = await reauthorizeOfficeCapability(input.authorization);
  if (
    !authorizationMatches(authorization, command) ||
    authorization.authorizationVersion !==
      input.authorization.authorizationVersion ||
    authorization.teamId !== input.authorization.teamId
  )
    invalid('Finance authority changed');
  const head = async () => {
    const read = await transaction.query<{
      world_version: string;
      event_sequence: string;
    }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
      [command.worldId],
    );
    if (
      read.rows.length !== 1 ||
      !read.rows[0] ||
      ![read.rows[0].world_version, read.rows[0].event_sequence].every(
        (v) => typeof v === 'string' && /^(?:0|[1-9]\d*)$/u.test(v),
      )
    )
      invalid('Actual held World head required');
    return {
      worldVersion: read.rows[0].world_version,
      eventSequence: read.rows[0].event_sequence,
    };
  };
  const held = await head();
  if (held.worldVersion !== command.expectedWorldVersion)
    invalid('Expected World head changed');
  const request = owned({
    worldId: command.worldId,
    countryId: command.countryId,
    commandId: command.commandId,
    commandFingerprint: command.fingerprint,
    payloadHash: command.payloadHash,
    authSubject: command.authSubject,
    authorizationRevision: authorization.authorizationVersion,
    actorId: command.actorId,
    head: held,
    simTime: command.simTime.toCanonicalValue(),
  });
  let active = true,
    calls = 0,
    completed = false;
  let checked: FinanceBudgetSourceOutcome<Result> | undefined;
  try {
    const result = await source.withSnapshotFrom(
      transaction,
      request,
      async (raw) => {
        if (!active || ++calls !== 1)
          invalid('Source callback lifetime/count differs');
        const snapshot = owned(raw);
        if ('status' in snapshot && snapshot.status === 'MISSING') {
          closed(snapshot, ['status', 'missing']);
          if (
            !Array.isArray(snapshot.missing) ||
            snapshot.missing.length === 0 ||
            snapshot.missing.some(
              (v) => typeof v !== 'string' || v.length === 0,
            )
          )
            invalid('Explicit missing source dependency required');
          checked = Object.freeze({
            status: 'MISSING',
            missing: Object.freeze([...snapshot.missing]),
          });
        } else {
          const parsed = closed(snapshot, [
            'schemaVersion',
            'evidenceClass',
            'sourceId',
            'sourceRevision',
            'requestBinding',
            'context',
            'replay',
          ]);
          if (
            parsed.schemaVersion !==
              'finance-budget-conditional-source-snapshot-v1' ||
            parsed.evidenceClass !== 'TEST_ONLY' ||
            typeof parsed.sourceId !== 'string' ||
            parsed.sourceId.length === 0 ||
            typeof parsed.sourceRevision !== 'string' ||
            parsed.sourceRevision.length === 0 ||
            !same(parsed.requestBinding, request)
          )
            invalid('Source identity/current cutoff differs');
          const context = row(parsed.context),
            auth = row(context.authorization);
          if (
            context.evidenceClass !== 'TEST_ONLY' ||
            context.intentSimTime !== request.simTime ||
            context.sourceRevision !== parsed.sourceRevision ||
            auth.actorRef !== command.actorId ||
            auth.authorizationVersion !== authorization.authorizationVersion ||
            auth.officeId !== 'FINANCE' ||
            auth.capability !== 'FINANCE_BUDGET'
          )
            invalid('Source authorization/time/revision differs');
          const value = await consume(
            Object.freeze({
              evidenceClass: 'TEST_ONLY',
              sourceId: parsed.sourceId,
              sourceRevision: parsed.sourceRevision,
              snapshotFingerprint: `sha256:${sha(canonicalSerialize(snapshot))}`,
              request,
              context: parsed.context,
              replay: parsed.replay,
            }),
          );
          if (!active) invalid('Source callback escaped');
          checked = Object.freeze({
            status: 'CONDITIONAL_SOURCE_CONSUMED',
            evidenceClass: 'TEST_ONLY' as const,
            value,
          });
        }
        const after = await reauthorizeOfficeCapability(authorization);
        if (
          !authorizationMatches(after, command) ||
          after.authorizationVersion !== authorization.authorizationVersion ||
          after.teamId !== authorization.teamId ||
          !same(await head(), held)
        )
          invalid('Source or authorization changed before completion');
        completed = true;
        return checked;
      },
    );
    if (calls !== 1 || !completed || result !== checked || !checked)
      invalid('Source must await one callback and return its exact result');
    return checked;
  } finally {
    active = false;
  }
}
