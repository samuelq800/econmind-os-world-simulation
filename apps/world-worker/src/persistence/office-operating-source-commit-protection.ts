/** Server-only currentness composition. This module NEVER issues source admission. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  isCommitAuthorizationProof,
  validateCanonicalCommand,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
} from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';

/** An equality key for independently held originals, not an admission/authority token. */
export interface OfficeOperatingSourceBinding {
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly currentnessRevision: string;
  readonly contentHash: `sha256:${string}`;
}

export interface OfficeOperatingSourceCommitRequest {
  readonly command: CanonicalCommand;
  readonly commitAuthorization: CommitAuthorizationProof;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly expectedSourceBinding: OfficeOperatingSourceBinding;
}

export interface OfficeOperatingSourceCustodyScope {
  readonly executor: SqlExecutor;
  readonly binding: OfficeOperatingSourceBinding;
  /** Re-read the actual locked originals/revocation revisions, not a cached DTO. */
  readCurrentBinding(): Promise<OfficeOperatingSourceBinding | null>;
}

/**
 * Root-owned dependency, never a request DTO, registration endpoint or admission
 * issuer. A concrete implementation must independently resolve its genuine
 * issuer/admission/schema and actual original source rows at this cutoff, hold
 * cooperating DB resource locks until outer COMMIT, then invoke consume once.
 * Matching hashes or an implementation of this interface do not prove that work.
 */
export interface OfficeOperatingSourceCustodyPort {
  withCurrentFrom<Result>(
    executor: SqlExecutor,
    request: Readonly<OfficeOperatingSourceCommitRequest>,
    consume: (
      scope: Readonly<OfficeOperatingSourceCustodyScope>,
    ) => Promise<Result>,
  ): Promise<Result>;
}

export interface OfficeOperatingSourceProtectedScope {
  readonly executor: SqlExecutor;
  readonly sourceBinding: Readonly<OfficeOperatingSourceBinding>;
  readonly status: 'CURRENTNESS_ONLY_NOT_SOURCE_ADMISSION';
  /** Valid only during this callback; rechecks current role and actual source. */
  assertCurrent(): Promise<void>;
}

export interface OfficeOperatingSourceCommitProtectionPort {
  withCurrentFrom<Result>(
    executor: SqlExecutor,
    request: Readonly<OfficeOperatingSourceCommitRequest>,
    consume: (
      scope: Readonly<OfficeOperatingSourceProtectedScope>,
    ) => Promise<Result>,
  ): Promise<Result>;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Office source currentness: ${message}`,
  );
}
function denied(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    'Office source currentness: current capability, team or authorization revision changed',
  );
}
function record(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('own plain data required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== fields.length ||
    fields.some(
      (key) =>
        !descriptors[key]?.enumerable ||
        !Object.hasOwn(descriptors[key]!, 'value'),
    )
  )
    invalid('closed own fields required');
  return Object.fromEntries(
    fields.map((key) => [key, descriptors[key]!.value]),
  );
}
function reference(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$/u.test(value)
  )
    invalid('source reference required');
  return value;
}
function binding(value: unknown): Readonly<OfficeOperatingSourceBinding> {
  const row = record(value, [
    'sourceId',
    'sourceRevision',
    'currentnessRevision',
    'contentHash',
  ]);
  if (
    typeof row.contentHash !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(row.contentHash)
  )
    invalid('canonical content hash required');
  return Object.freeze({
    sourceId: reference(row.sourceId),
    sourceRevision: reference(row.sourceRevision),
    currentnessRevision: reference(row.currentnessRevision),
    contentHash: row.contentHash as `sha256:${string}`,
  });
}
function head(value: unknown): Readonly<DecisionResultHead> {
  const row = record(value, ['worldId', 'worldVersion', 'eventSequence']);
  if (
    typeof row.worldVersion !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(row.worldVersion) ||
    typeof row.eventSequence !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(row.eventSequence)
  )
    invalid('canonical head required');
  return Object.freeze({
    worldId: reference(row.worldId),
    worldVersion: row.worldVersion,
    eventSequence: row.eventSequence,
  });
}
function family(command: CanonicalCommand) {
  if (
    command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1' &&
    command.officeId === 'CAPTAIN'
  )
    return { office: 'CAPTAIN', capability: 'CAPTAIN_CABINET' } as const;
  if (
    command.commandType === 'CORE_FINANCE_BUDGET_APPROPRIATION_V1' &&
    command.officeId === 'FINANCE'
  )
    return { office: 'FINANCE', capability: 'FINANCE_BUDGET' } as const;
  invalid(
    'only fixed Captain/Finance families are supported; Social keeps its original guard',
  );
}
function capture(
  input: OfficeOperatingSourceCommitRequest,
): Readonly<OfficeOperatingSourceCommitRequest> {
  const raw = record(input, [
    'command',
    'commitAuthorization',
    'currentHead',
    'observedAtReal',
    'expectedSourceBinding',
  ]);
  if (
    !raw.command ||
    types.isProxy(raw.command) ||
    !Object.isFrozen(raw.command)
  )
    invalid('frozen canonical command required');
  const command = validateCanonicalCommand(
    raw.command as CanonicalCommand,
    (text) => createHash('sha256').update(text).digest('hex'),
  );
  const selected = family(command);
  const proof = raw.commitAuthorization;
  if (
    !isCommitAuthorizationProof(proof) ||
    proof.commandId !== command.commandId ||
    proof.commandFingerprint !== command.fingerprint ||
    proof.actorId !== command.actorId ||
    proof.authSubject !== command.authSubject ||
    proof.worldId !== command.worldId ||
    proof.countryId !== command.countryId ||
    proof.officeId !== selected.office ||
    proof.capability !== selected.capability
  )
    denied();
  const currentHead = head(raw.currentHead);
  if (
    currentHead.worldId !== command.worldId ||
    currentHead.worldVersion !== command.expectedWorldVersion
  )
    invalid('command/head binding mismatch');
  if (
    typeof raw.observedAtReal !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      raw.observedAtReal,
    ) ||
    !Number.isFinite(Date.parse(raw.observedAtReal)) ||
    new Date(raw.observedAtReal).toISOString() !== raw.observedAtReal
  )
    invalid('explicit canonical observation timestamp required');
  return Object.freeze({
    command,
    commitAuthorization: proof,
    currentHead,
    observedAtReal: raw.observedAtReal,
    expectedSourceBinding: binding(raw.expectedSourceBinding),
  });
}

/**
 * Enter only after the existing immutable submission/receipt/lease frontier.
 * Exact old receipt recovery MUST return before calling this fresh-use helper.
 * Lock order: existing S/lease -> H -> A -> custody resources. It starts no
 * transaction, performs no writes and never retries. Caller owns rollback and
 * immutable-receipt recovery after an uncertain COMMIT acknowledgement.
 *
 * No default source or flag enables a family. In particular, Finance remains
 * unavailable unless its independent real source/schema/admission exists.
 */
export function createOfficeOperatingSourceCommitProtectionPort(
  input: Readonly<{
    captain: OfficeOperatingSourceCustodyPort | null;
    finance: OfficeOperatingSourceCustodyPort | null;
  }>,
): OfficeOperatingSourceCommitProtectionPort {
  const captain = input.captain,
    finance = input.finance;
  const activeExecutors = new WeakSet<SqlExecutor>();
  return Object.freeze({
    async withCurrentFrom<Result>(
      executor: SqlExecutor,
      inputRequest: Readonly<OfficeOperatingSourceCommitRequest>,
      consume: (
        scope: Readonly<OfficeOperatingSourceProtectedScope>,
      ) => Promise<Result>,
    ): Promise<Result> {
      const request = capture(inputRequest);
      const selected = family(request.command);
      const custody = selected.office === 'CAPTAIN' ? captain : finance;
      if (custody === null || typeof custody?.withCurrentFrom !== 'function')
        invalid('real server custody dependency is unavailable');
      if (typeof consume !== 'function' || activeExecutors.has(executor))
        invalid('single non-reentrant transaction scope required');
      let active = true,
        entered = false,
        completed = false;
      let result: Result;
      let callbackFailure: unknown;
      let callbackFailed = false;
      const assertActive = () => {
        if (!active) invalid('ended callback scope');
      };
      const assertHead = async () => {
        const rows = await executor.query<{
          world_version: string;
          event_sequence: string;
        }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
          [request.command.worldId],
        );
        assertActive();
        if (
          rows.rows.length !== 1 ||
          rows.rows[0]?.world_version !== request.currentHead.worldVersion ||
          rows.rows[0]?.event_sequence !== request.currentHead.eventSequence
        )
          throw new DomainError(
            DOMAIN_ERROR_CODES.VERSION_MISMATCH,
            'Office source currentness: locked World head changed',
          );
      };
      const assertAuthorization = async () => {
        const proof = request.commitAuthorization;
        const rows = await executor.query<{
          team_id: string;
          authorization_version: string;
        }>(
          'select team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4 and capability=$5 and active for share',
          [
            request.command.worldId,
            request.command.authSubject,
            request.command.countryId,
            selected.office,
            selected.capability,
          ],
        );
        assertActive();
        if (
          rows.rows.length !== 1 ||
          rows.rows[0]?.team_id !== proof.teamId ||
          rows.rows[0]?.authorization_version !== proof.authorizationVersion
        )
          denied();
      };
      activeExecutors.add(executor);
      try {
        await assertHead();
        await assertAuthorization();
        const returned = await custody.withCurrentFrom(
          executor,
          request,
          async (sourceScope) => {
            try {
              assertActive();
              if (entered) invalid('custody callback must run exactly once');
              entered = true;
              if (
                sourceScope.executor !== executor ||
                typeof sourceScope.readCurrentBinding !== 'function' ||
                canonicalSerialize(binding(sourceScope.binding)) !==
                  canonicalSerialize(request.expectedSourceBinding)
              )
                invalid('custody executor/source binding mismatch');
              const assertCurrent = async () => {
                assertActive();
                await assertAuthorization();
                const current = await sourceScope.readCurrentBinding();
                assertActive();
                if (
                  current === null ||
                  canonicalSerialize(binding(current)) !==
                    canonicalSerialize(request.expectedSourceBinding)
                )
                  invalid('source changed, missing or revoked');
              };
              await assertCurrent();
              await assertHead();
              assertActive();
              result = await consume(
                Object.freeze({
                  executor,
                  sourceBinding: request.expectedSourceBinding,
                  status: 'CURRENTNESS_ONLY_NOT_SOURCE_ADMISSION' as const,
                  assertCurrent,
                }),
              );
              assertActive();
              // H may now have advanced through the authoritative repository's
              // own CAS. Recheck source/role here, not the pre-effect H value.
              await assertCurrent();
              completed = true;
              return result;
            } catch (error) {
              callbackFailed = true;
              callbackFailure = error;
              throw error;
            }
          },
        );
        if (callbackFailed) throw callbackFailure;
        if (!entered || !completed || !Object.is(returned, result!))
          invalid('custody must await and preserve its one callback result');
        return result!;
      } finally {
        active = false;
        activeExecutors.delete(executor);
      }
    },
  });
}
