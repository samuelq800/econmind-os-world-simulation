/** Fixed native Captain composition. No originals, admission, money, role grants,
 * consumer start or Clock is created here. Exact FINAL recovery belongs before
 * this fresh-use guard in the owning atomic repository. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  assertCaptainPoliticalCapitalAuthorization,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  prepareCaptainPoliticalCapitalEvent,
  parseCaptainPoliticalCapitalAllocation,
  reauthorizeCommitAuthorizationProof,
  validateCanonicalCommand,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
} from '@econmind/core';
import {
  CAPTAIN_OPERATING_CUSTODY_READER,
  createPostgresCaptainRuntimeSnapshotReader,
} from './postgres-captain-operating-custody.js';
import {
  CaptainPoliticalCapitalSourceMissing,
  createCaptainPoliticalCapitalCandidateFactory,
  type CaptainPoliticalCapitalRuntimeReader,
} from './captain-political-capital-candidate-source.js';
import type { AtomicTransitionCandidateFactory } from './atomic-transition-repository.js';
import type { OfficeOperatingSourceBinding } from './office-operating-source-commit-protection.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

import type { PostwarCaptainMixedSource } from './postwar-captain-mixed-source.js';
export const CAPTAIN_SOURCE_PURPOSE =
  'CAPTAIN_POLITICAL_CAPITAL_SOURCE_RECHECK_V1' as const;
export interface CaptainSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof CAPTAIN_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof;
}
export interface CaptainSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof CAPTAIN_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface CaptainSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<CaptainSourceCommitRequest>,
  ): Promise<Readonly<CaptainSourceCommitAudit>>;
}
export interface CaptainSourceReadBinding {
  readonly schemaVersion: 'postwar-captain-source-read-binding-v1';
  readonly commandFingerprint: string;
  readonly observedAtReal: string;
  readonly currentHead: DecisionResultHead;
  readonly sourceBinding: Readonly<OfficeOperatingSourceBinding>;
  readonly snapshotHash: string;
  readonly sourceSnapshotFingerprint: string;
}
const issued = new WeakSet<object>();
export function isPostwarCaptainSourceCommitProtectionPort(
  value: unknown,
): value is CaptainSourceCommitProtectionPort {
  return value !== null && typeof value === 'object' && issued.has(value);
}
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `POSTWAR_CAPTAIN_RUNTIME:${reason}`,
  );
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function canonicalTime(value: string): void {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid('CANONICAL_OBSERVATION_REQUIRED');
}

/** Server config only. Runtime worker must ALREADY have reviewed SET ROLE/read
 * privileges; no grants, source callback, request DTO or readiness flag accepted.
 * Source resources stay locked after restoration until the outer transaction
 * commits. Both prospective reader and candidate factory use the same fixed
 * native custodian; neither admits its source. */
export function createPostwarCaptainRuntime(configuration: {
  readonly database: SqlDatabase;
  readonly mixedSource?: PostwarCaptainMixedSource;
  readonly workerId: string;
  readonly workerRole: string;
  readonly mode: 'TEST_ONLY_LOCAL' | 'OFFICIAL_RUNTIME';
}) {
  const role = configuration.workerRole;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      CAPTAIN_OPERATING_CUSTODY_READER,
      'world_v2_captain_source_owner',
    ].includes(role)
  )
    invalid('SEPARATE_FIXED_WORKER_REQUIRED');
  const active = new WeakSet<SqlExecutor>();
  async function workerSession(tx: SqlExecutor) {
    const result = await tx.query<Record<string, unknown>>(
      `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
        current_setting('transaction_isolation') as isolation,current_setting('transaction_read_only') as read_only,
        pg_has_role(current_user,'world_v2_captain_source_reader','MEMBER') as reader_member,
        pg_has_role(current_user,'world_v2_captain_source_owner','MEMBER') as owner_member
        from pg_roles r where r.rolname=current_user`,
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.role_name !== role ||
      row.rolsuper !== false ||
      row.rolbypassrls !== false ||
      row.rolcreaterole !== false ||
      row.rolcreatedb !== false ||
      row.rolreplication !== false ||
      row.reader_member !== true ||
      row.owner_member !== false ||
      row.read_only !== 'off' ||
      !['repeatable read', 'serializable'].includes(String(row.isolation))
    )
      invalid('SEPARATED_WORKER_STABLE_TRANSACTION_REQUIRED');
  }
  async function withReader<T>(
    tx: SqlExecutor,
    consume: () => Promise<T>,
  ): Promise<T> {
    await workerSession(tx);
    await tx.query("select set_config('role',$1,true)", [
      CAPTAIN_OPERATING_CUSTODY_READER,
    ]);
    try {
      return await consume();
    } finally {
      await tx.query("select set_config('role',$1,true)", [role]);
    }
  }
  const sourceDatabase: SqlDatabase = {
    query: configuration.database.query.bind(configuration.database),
    transaction: (consume) =>
      configuration.database.transaction((tx) =>
        withReader(tx, () => consume(tx)),
      ),
  };
  const native = createPostgresCaptainRuntimeSnapshotReader({
    database: sourceDatabase,
    workerId: configuration.workerId,
    mode: configuration.mode,
    ...(configuration.mixedSource
      ? { mixedSource: configuration.mixedSource }
      : {}),
  });
  const reader: CaptainPoliticalCapitalRuntimeReader = native.reader;
  const factory: AtomicTransitionCandidateFactory = {
    async prepare(input) {
      const command = validateCanonicalCommand(input.command, digest);
      assertCaptainPoliticalCapitalAuthorization(
        command,
        input.commitAuthorization,
      );
      await reauthorizeCommitAuthorizationProof(input.commitAuthorization);
      const preparation = await sourceDatabase.transaction((tx) =>
        native.prepareFrom(tx, command, input.observedAtReal),
      );
      const read = preparation.sourceRead;
      if (read.kind === 'MISSING')
        throw new CaptainPoliticalCapitalSourceMissing(read.missing);
      if (!preparation.sourceBinding) invalid('SOURCE_BINDING_REQUIRED');
      const binding: CaptainSourceReadBinding = freeze({
        schemaVersion: 'postwar-captain-source-read-binding-v1',
        commandFingerprint: command.fingerprint,
        observedAtReal: input.observedAtReal,
        currentHead: {
          worldId: command.worldId,
          worldVersion: read.snapshot.worldVersion,
          eventSequence: read.snapshot.lastEventSequence,
        },
        sourceBinding: preparation.sourceBinding,
        snapshotHash: read.snapshot.trace.snapshot.snapshotHash,
        sourceSnapshotFingerprint: digest(canonicalSerialize(read.snapshot)),
      });
      const fixedFactory = createCaptainPoliticalCapitalCandidateFactory({
        sha256Hex: digest,
        source: {
          async load(request) {
            if (
              !same(request.command, command) ||
              request.observedAtReal !== binding.observedAtReal
            )
              invalid('FIXED_CANDIDATE_SCOPE_REQUIRED');
            return read;
          },
        },
      });
      return Object.freeze({
        ...(await fixedFactory.prepare(input)),
        officeOperatingSourceReadBinding: binding,
      });
    },
  };
  const sourceCommitProtectionPort: CaptainSourceCommitProtectionPort =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        supplied: Readonly<CaptainSourceCommitRequest>,
      ) {
        if (active.has(tx)) invalid('NON_REENTRANT_FRESH_GUARD_REQUIRED');
        const command = validateCanonicalCommand(supplied.command, digest);
        if (
          supplied.phase !== 'BEFORE_EVENTS' ||
          supplied.purpose !== CAPTAIN_SOURCE_PURPOSE ||
          supplied.currentHead.worldId !== command.worldId ||
          supplied.currentHead.worldVersion !== command.expectedWorldVersion
        )
          invalid('EXACT_FRESH_COMMAND_HEAD_PURPOSE_REQUIRED');
        canonicalTime(supplied.observedAtReal);
        assertCaptainPoliticalCapitalAuthorization(
          command,
          supplied.commitAuthorization,
        );
        // Inertly capture before the first await. No JSON object is authority.
        const binding = freeze(
          JSON.parse(canonicalSerialize(supplied.readBinding)),
        ) as CaptainSourceReadBinding;
        const transition = supplied.transition;
        const head = freeze({ ...supplied.currentHead });
        const proof = supplied.commitAuthorization;
        const observedAtReal = supplied.observedAtReal;
        if (
          !binding ||
          binding.schemaVersion !== 'postwar-captain-source-read-binding-v1' ||
          binding.commandFingerprint !== command.fingerprint ||
          !same(binding.currentHead, head) ||
          typeof binding.observedAtReal !== 'string' ||
          binding.observedAtReal > observedAtReal
        )
          invalid('FRESH_NATIVE_READ_BINDING_REQUIRED');
        canonicalTime(binding.observedAtReal);
        const assertFrontier = async () => {
          await workerSession(tx);
          const h = await tx.query<{
            world_version: string;
            event_sequence: string;
          }>(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
            [command.worldId],
          );
          if (
            h.rows.length !== 1 ||
            h.rows[0]?.world_version !== head.worldVersion ||
            h.rows[0]?.event_sequence !== head.eventSequence
          )
            invalid('ACTUAL_FRESH_PREFIX_CHANGED');
          const auth = await tx.query<{
            team_id: string;
            authorization_version: string;
          }>(
            "select team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='CAPTAIN' and capability='CAPTAIN_CABINET' and active for share",
            [command.worldId, command.authSubject, command.countryId],
          );
          if (
            auth.rows.length !== 1 ||
            auth.rows[0]?.team_id !== proof.teamId ||
            auth.rows[0]?.authorization_version !== proof.authorizationVersion
          )
            invalid('CURRENT_NATIVE_AUTHORIZATION_CHANGED');
          await reauthorizeCommitAuthorizationProof(proof);
        };
        active.add(tx);
        try {
          await assertFrontier();
          await withReader(tx, async () => {
            const preparation = await native.prepareFrom(
              tx,
              command,
              observedAtReal,
            );
            if (preparation.sourceRead.kind === 'MISSING')
              throw new CaptainPoliticalCapitalSourceMissing(
                preparation.sourceRead.missing,
              );
            await native.withCommitProtectionFrom(
              tx,
              preparation,
              observedAtReal,
              async (read, scope) => {
                if (
                  scope.executor !== tx ||
                  !same(scope.binding, binding.sourceBinding) ||
                  read.snapshot.trace.snapshot.snapshotHash !==
                    binding.snapshotHash ||
                  digest(canonicalSerialize(read.snapshot)) !==
                    binding.sourceSnapshotFingerprint ||
                  read.snapshot.worldVersion !== head.worldVersion ||
                  read.snapshot.lastEventSequence !== head.eventSequence
                )
                  invalid('ACTUAL_ORIGINALS_OR_REPLAY_BINDING_CHANGED');
                const event = transition.events[0];
                if (!event || transition.events.length !== 1)
                  invalid('SINGLE_CORE_CAPTAIN_EVENT_REQUIRED');
                const expected = prepareCaptainPoliticalCapitalEvent({
                  command,
                  source: read.snapshot,
                  eventId: event.eventId,
                  recordedAtReal: binding.observedAtReal,
                  sha256Hex: digest,
                }).event;
                if (
                  !same(
                    transition,
                    createAuthoritativeTransition({
                      command,
                      worldVersionBefore: head.worldVersion,
                      worldVersionAfter: expected.worldVersion,
                      events: [expected],
                    }),
                  )
                )
                  invalid('CORE_EVENT_OR_TRANSITION_DIFFERS_FROM_HELD_SOURCE');
                if (!same(await scope.readCurrentBinding(), scope.binding))
                  invalid('HELD_NATIVE_ORIGINAL_CHANGED');
              },
            );
          });
          await assertFrontier();
          return freeze({
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY' as const,
            purpose: CAPTAIN_SOURCE_PURPOSE,
            commandFingerprint: command.fingerprint,
            currentHead: head,
            readBindingFingerprint: canonicalSha256(
              canonicalHashInput(binding),
              digest,
            ),
            protectionMode: 'HELD_SOURCE_GUARDS' as const,
          });
        } finally {
          active.delete(tx);
        }
      },
    });
  issued.add(sourceCommitProtectionPort);
  return Object.freeze({
    sourceBoundary:
      'NATIVE_CAPTAIN_ORIGINALS_REQUIRED_NO_LEGACY_FALLBACK' as const,
    reader,
    factory: Object.freeze(factory),
    sourceCommitProtectionPort,
    async assertSourceBeforeClaim(input: {
      command: CanonicalCommand;
      observedAtReal: string;
    }) {
      const terms = parseCaptainPoliticalCapitalAllocation(
        input.command,
        digest,
      );
      const read = await reader.readCanonical!(
        {
          worldId: input.command.worldId,
          countryId: input.command.countryId,
          commandId: input.command.commandId,
          commandFingerprint: input.command.fingerprint,
          expectedWorldVersion: input.command.expectedWorldVersion!,
          simTime: input.command.simTime.toCanonicalValue(),
          reasonFactRef: terms.reasonFactRef,
          observedAtReal: input.observedAtReal,
        },
        input.command,
      );
      if (read.kind === 'MISSING')
        throw new CaptainPoliticalCapitalSourceMissing(read.missing);
    },
  });
}
