/** Fixed first-day no-fee employment-service creation. Protected originals,
 * actual current prefix and same-tx authorization are rederived at cutoff.
 * No caller source DTO, licence issuer callback, additional purchase or work. */
import { createHash } from 'node:crypto';
import {
  SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  validateCanonicalCommand,
  bindAuthoritativeTransition,
  prepareSocialEmploymentServiceCreation,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
  type AuthoritativeTransition,
} from '@econmind/core';
import {
  createPostwarSocialSourceRoleScope,
  authorizePostwarSocialOperatingCommandFrom,
} from './postwar-social-position-runtime.js';
import { createPostgresSocialOperatingOriginalReader } from './postgres-social-operating-custody.js';
import { replayPostwarSocialEmploymentLineage } from './postwar-social-employment-lineage.js';
import {
  readPreparedSocialPagedLineage,
  type PreparedPostwarSocialSource,
} from './prepared-postwar-social-source.js';
import {
  projectPostwarSocialServiceCreationFacts,
  projectPostwarSocialServiceCreationPlanning,
  type PostwarSocialServiceCreationPlanningData,
} from './postwar-social-service-creation-originals.js';
export type { PostwarSocialServiceCreationPlanningData } from './postwar-social-service-creation-originals.js';
import { assertSocialPhysicalCapacityState } from './social-physical-attempt-envelope.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { observePostwarSocialMaterialization } from './postwar-social-materialization.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import {
  readRegisteredWorldExecutionFrom,
  registeredWorldExecutionClockScope,
} from '../time/registered-world-execution-state.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
export const SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE =
  'SOCIAL_EMPLOYMENT_SERVICE_CREATE_SOURCE_EVALUATION_V1' as const;
const digest = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest),
  same = (a: unknown, b: unknown) =>
    canonicalSerialize(a) === canonicalSerialize(b);
function invalid(reason: string): never {
  throw Error('POSTWAR_SOCIAL_SERVICE_CREATE:' + reason);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export interface SocialServiceCreationSourceReadBinding {
  readonly schemaVersion: 'social-service-create-source-read-binding-v1';
  readonly purpose: typeof SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly readHead: DecisionResultHead;
  readonly seedFingerprint: string;
  readonly registrationRef: string;
  readonly admissionRef: string;
  readonly sourceId: string;
  readonly sourcePayloadHash: string;
  readonly completePrefixFingerprint: string;
  readonly stateHash: string;
  readonly readFactsHash: string;
  readonly physicalCapacityFingerprint: string;
  readonly clockSimTime: string;
  readonly socialAuthorization: Readonly<{
    subject: string;
    team: string;
    revision: string;
  }>;
}
export interface SocialServiceCreationSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof;
}
export interface SocialServiceCreationSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface SocialServiceCreationSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<SocialServiceCreationSourceCommitRequest>,
  ): Promise<Readonly<SocialServiceCreationSourceCommitAudit>>;
}
const issuedSourcePorts = new WeakSet<object>();
export function isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort(
  value: unknown,
): value is SocialServiceCreationSourceCommitProtectionPort {
  return !!value && typeof value === 'object' && issuedSourcePorts.has(value);
}
export interface PostwarSocialEmploymentServiceCreationRuntime {
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<SocialServiceCreationSourceCommitProtectionPort>;
  assertSourceBeforeClaim(request: {
    readonly command: CanonicalCommand;
    readonly observedAtReal: string;
  }): Promise<void>;
  authorizeIntake(command: CanonicalCommand): Promise<AuthorizedOfficeContext>;
  readPlanningFrom(
    tx: SqlExecutor,
    selection: {
      readonly countryId: string;
      readonly servicePoolIds: readonly string[];
      readonly expectedHead: Readonly<{
        worldVersion: string;
        eventSequence: string;
      }>;
    },
  ): Promise<Readonly<PostwarSocialServiceCreationPlanningData>>;
}
export function createPostwarSocialEmploymentServiceCreationRuntime(configuration: {
  readonly worldId: string;
  readonly preparedSource: PreparedPostwarSocialSource;
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly workerRole: string;
  readonly clock: DurableConsumptionClock;
}): Readonly<PostwarSocialEmploymentServiceCreationRuntime> {
  const roles = createPostwarSocialSourceRoleScope(configuration),
    originals = createPostgresSocialOperatingOriginalReader(configuration),
    durable = new DurableV08LedgerLineageReader({
      database: configuration.database,
      sha256Hex: digest,
    });
  function capturedCommand(value: CanonicalCommand) {
    const c = validateCanonicalCommand(value, digest);
    if (
      c.worldId !== configuration.worldId ||
      c.commandType !== SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND ||
      c.officeId !== 'SOCIAL' ||
      c.countryId === null ||
      c.expectedWorldVersion === null ||
      c.idempotencyKey === null
    )
      invalid('EXACT_OWN_WORLD_MANUAL_CREATE_REQUIRED');
    return c;
  }
  async function assertProof(
    c: CanonicalCommand,
    p: CommitAuthorizationProof | null,
  ) {
    if (
      !isCommitAuthorizationProof(p) ||
      p.commandId !== c.commandId ||
      p.commandFingerprint !== c.fingerprint ||
      p.actorId !== c.actorId ||
      p.authSubject !== c.authSubject ||
      p.worldId !== c.worldId ||
      p.countryId !== c.countryId ||
      p.officeId !== 'SOCIAL' ||
      p.capability !== 'SOCIAL_LABOUR'
    )
      invalid('GENUINE_CURRENT_SOCIAL_PROOF_REQUIRED');
    await reauthorizeCommitAuthorizationProof(p);
  }
  // The shared Social database establishes RR before its first query; callers
  // supply that same held executor, never another Clock/pool transaction.
  const readCurrentFrom = async (tx: SqlExecutor, countryId: string) => {
    const scope = registeredWorldExecutionClockScope(configuration.clock);
    if (
      !scope ||
      scope.worldId !== configuration.worldId ||
      scope.workerId !== configuration.workerId
    )
      invalid('ACTUAL_SAME_WORLD_REGISTERED_CLOCK_REQUIRED');
    const execution = await readRegisteredWorldExecutionFrom(
      tx,
      configuration.clock,
    );
    if (execution.consumerRole !== configuration.workerRole)
      invalid('ACTUAL_REGISTERED_CONSUMER_ROLE_REQUIRED');
    const ticks = execution.simTime;
    if (!/^(0|[1-9][0-9]*)$/u.test(ticks) || BigInt(ticks) >= 86400000n)
      invalid('ACTUAL_CURRENT_T0_CLOCK_REQUIRED');
    const source = await roles.withSourceReaderFrom(tx, () =>
      originals.withOriginalsFrom(
        tx,
        { worldId: configuration.worldId, countryId },
        async (v) => v,
      ),
    );
    const { lineage, document, registration } = source;
    if (
      execution.seedId !== lineage.seed.seedId ||
      execution.seedFingerprint !== lineage.seed.fingerprint ||
      execution.admissionRef !== registration.admission_ref
    )
      invalid('ACTUAL_CLOCK_SOURCE_ADMISSION_PINS_DIFFER');
    const paged = readPreparedSocialPagedLineage(lineage);
    const country = replayPostwarSocialEmploymentLineage({
        document,
        lineage,
      }).countries.find((c) => c.countryId === countryId),
      originalCountry = document.countries.find(
        (c) => c.countryId === countryId,
      );
    if (!country || !originalCountry)
      invalid('ACTUAL_CURRENT_COUNTRY_REQUIRED');
    if (
      paged
        ? BigInt(ticks) < BigInt(paged.metadata.maxCommandSimTimeTicks)
        : lineage.transitions === null ||
          lineage.transitions.some((t) =>
            t.transition.events.some((e) => e.simTime.ticks > BigInt(ticks)),
          )
    )
      invalid('ACTUAL_CLOCK_PRECEDES_CURRENT_PREFIX');
    return {
      execution,
      ticks,
      source,
      lineage,
      document,
      registration,
      paged,
      country,
      originalCountry,
    };
  };
  const deriveFrom = async (tx: SqlExecutor, command: CanonicalCommand) => {
    const {
      ticks,
      source,
      lineage,
      document,
      registration,
      paged,
      country,
      originalCountry,
    } = await readCurrentFrom(tx, command.countryId!);
    if (command.simTime.ticks > BigInt(ticks)) invalid('FUTURE_COMMAND_TIME');
    if (
      lineage.headWorldVersion !== command.expectedWorldVersion ||
      command.simTime.ticks >= 86400000n
    )
      invalid('ACTUAL_CURRENT_FIRST_DAY_HEAD_REQUIRED');
    if (
      paged
        ? command.simTime.ticks < BigInt(paged.metadata.maxCommandSimTimeTicks)
        : lineage.transitions === null ||
          lineage.transitions.some((t) =>
            t.transition.events.some(
              (e) => e.simTime.ticks > command.simTime.ticks,
            ),
          )
    )
      invalid('COMMAND_PRECEDES_CURRENT_PREFIX');

    const facts = projectPostwarSocialServiceCreationFacts({
      command,
      document,
      source: source.source,
      head: {
        worldVersion: lineage.headWorldVersion,
        eventSequence: lineage.headEventSequence,
      },
    });
    const body = originalCountry.physicalDayBodies.filter(
      (b) =>
        b.locationId === facts.usageLicence.locationId && b.dayIndex === '0',
    );
    if (body.length !== 1) invalid('ACTUAL_UNIQUE_PHYSICAL_DAY_REQUIRED');
    const physical = (state: typeof country.lifecycle.employment) =>
      assertSocialPhysicalCapacityState({
        state,
        readFacts: {
          ...originalCountry.validationReadFacts.facts,
          simTime: command.simTime.toCanonicalValue(),
        },
        sourceEnvelope: {
          ...body[0]!,
          headWorldVersion: lineage.headWorldVersion,
          headEventSequence: lineage.headEventSequence,
        },
        sha256Hex: digest,
      });
    const before = physical(country.lifecycle.employment),
      operation = prepareSocialEmploymentServiceCreation({
        command,
        state: country.lifecycle.employment,
        readFacts: facts,
        sha256Hex: digest,
      });
    if (operation.source !== 'APPLIED')
      invalid('FINAL_RECOVERY_MUST_NOT_BECOME_FRESH_CANDIDATE');
    const after = physical(operation.state);
    if (!same(before, after))
      invalid('CAPACITY_OR_PHYSICAL_COMMITMENTS_NOT_CONSERVED');
    const social = await authorizePostwarSocialOperatingCommandFrom(
      tx,
      command,
      'SOCIAL',
      roles,
    );
    const binding: SocialServiceCreationSourceReadBinding = freeze({
      schemaVersion: 'social-service-create-source-read-binding-v1',
      purpose: SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE,
      commandFingerprint: command.fingerprint,
      readHead: {
        worldId: lineage.worldId,
        worldVersion: lineage.headWorldVersion,
        eventSequence: lineage.headEventSequence,
      },
      seedFingerprint: lineage.seed.fingerprint,
      registrationRef: String(registration.registration_ref),
      admissionRef: String(registration.admission_ref),
      sourceId: source.source.sourceId,
      sourcePayloadHash: source.source.payloadHash,
      completePrefixFingerprint:
        paged?.metadata.prefixFingerprint ?? hash(lineage.transitions),
      stateHash: hash(country.lifecycle.employment),
      readFactsHash: hash(facts),
      physicalCapacityFingerprint: hash(before),
      clockSimTime: ticks,
      socialAuthorization: {
        subject: social.authSubject,
        team: social.teamId,
        revision: social.authorizationVersion,
      },
    });
    return { operation, binding, lineage };
  };
  const sourceCommitProtectionPort: SocialServiceCreationSourceCommitProtectionPort =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        request: Readonly<SocialServiceCreationSourceCommitRequest>,
      ): Promise<Readonly<SocialServiceCreationSourceCommitAudit>> {
        const command = capturedCommand(request.command);
        if (
          request.phase !== 'BEFORE_EVENTS' ||
          request.purpose !== SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE ||
          !isCommitAuthorizationProof(request.commitAuthorization) ||
          request.commitAuthorization.commandFingerprint !==
            command.fingerprint ||
          request.commitAuthorization.capability !== 'SOCIAL_LABOUR'
        )
          invalid(
            'exact independent source purpose and genuine Social commit proof required',
          );
        await assertProof(command, request.commitAuthorization);
        bindAuthoritativeTransition(
          { command, transition: request.transition },
          digest,
        );
        const fresh = await deriveFrom(tx, command);
        if (
          request.commitAuthorization.authSubject !==
            fresh.binding.socialAuthorization.subject ||
          request.commitAuthorization.teamId !==
            fresh.binding.socialAuthorization.team ||
          request.commitAuthorization.authorizationVersion !==
            fresh.binding.socialAuthorization.revision
        )
          invalid('Social commit proof differs from held Social authorization');
        if (
          !same(request.currentHead, fresh.binding.readHead) ||
          !same(request.readBinding, fresh.binding) ||
          request.transition.events.length !== 1 ||
          request.transition.events[0]!.eventType !==
            SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT ||
          request.transition.events[0]!.canonicalPayload !==
            canonicalSerialize(fresh.operation.eventPayload)
        )
          invalid(
            'candidate source/authorization/current prefix differs at commit cutoff',
          );
        return freeze({
          status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
          purpose: SOCIAL_SERVICE_CREATION_SOURCE_PURPOSE,
          commandFingerprint: command.fingerprint,
          currentHead: request.currentHead,
          readBindingFingerprint: hash(fresh.binding),
          protectionMode: 'HELD_SOURCE_GUARDS',
        });
      },
    });
  const candidateFactory: AtomicTransitionCandidateFactory = Object.freeze({
    async prepare(
      input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      const command = capturedCommand(input.command);
      await assertProof(command, input.commitAuthorization);
      if (
        !isCommitAuthorizationProof(input.commitAuthorization) ||
        input.commitAuthorization.capability !== 'SOCIAL_LABOUR' ||
        input.commitAuthorization.commandFingerprint !== command.fingerprint
      )
        invalid('genuine command-bound commit authorization required');
      return configuration.database.transaction(async (tx) => {
        await tx.query(
          'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
          [command.worldId, command.commandId],
        );
        if (
          !same(
            await durable.readCommandFrom(
              tx,
              command.worldId,
              command.commandId,
            ),
            command,
          )
        )
          invalid('actual durable submission differs');
        const leaseRows = await tx.query<Record<string, unknown>>(
          'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share',
          [command.worldId, configuration.workerId, input.observedAtReal],
        );
        if (leaseRows.rows.length !== 1 || !leaseRows.rows[0])
          invalid('actual active writer lease required');
        const l = leaseRows.rows[0];
        const time = (v: unknown) =>
          v instanceof Date ? v.toISOString() : String(v);
        const lease = parseWorldWriterLease({
          schemaVersion: 'world-writer-lease-v1',
          worldId: String(l.world_id),
          holderId: String(l.holder_id),
          fencingToken: String(l.fencing_token),
          acquiredAtReal: time(l.acquired_at_real),
          renewedAtReal: time(l.renewed_at_real),
          expiresAtReal: time(l.lease_expires_at_real),
        });
        const fresh = await deriveFrom(tx, command);
        const q = await tx.query<Record<string, unknown>>(
          'select authority_kind,queue_state,claimed_by,claim_fencing_token::text,available_at_sim_time::text from world_v2.command_queue where world_id=$1 and command_id=$2 for share',
          [command.worldId, command.commandId],
        );
        if (
          q.rows.length !== 1 ||
          q.rows[0]!.authority_kind !== 'DISCRETIONARY_USER' ||
          q.rows[0]!.queue_state !== 'CLAIMED' ||
          q.rows[0]!.claimed_by !== lease.holderId ||
          q.rows[0]!.claim_fencing_token !== lease.fencingToken ||
          BigInt(String(q.rows[0]!.available_at_sim_time)) >
            command.simTime.ticks
        )
          invalid('actual claimed discretionary queue/fence required');
        const event = parseAuthoritativeEvent(
          {
            schemaVersion: 'event-v1',
            eventId: `SOCIAL_SERVICE_CREATE_EVENT_${command.commandId}`,
            eventType: SOCIAL_EMPLOYMENT_SERVICE_CREATED_EVENT,
            worldId: command.worldId,
            causationCommandId: command.commandId,
            correlationId: command.correlationId,
            worldVersion: (
              BigInt(command.expectedWorldVersion!) + 1n
            ).toString(),
            sequence: (BigInt(fresh.lineage.headEventSequence) + 1n).toString(),
            simTime: command.simTime.toCanonicalValue(),
            recordedAtReal: input.observedAtReal,
            correctsEventId: null,
            payload: fresh.operation.eventPayload,
          },
          digest,
        );
        const transition = createAuthoritativeTransition({
          command,
          worldVersionBefore: command.expectedWorldVersion!,
          worldVersionAfter: event.worldVersion,
          events: [event],
        });
        const materializationObservation =
          await observePostwarSocialMaterialization({
            executor: tx,
            lineage: fresh.lineage,
            countryId: command.countryId!,
            kind: 'SERVICE',
          });
        const draft: AtomicTransitionDraft & {
          readonly officeOperatingSourceReadBinding: SocialServiceCreationSourceReadBinding;
        } = freeze({
          transition,
          inventoryPostings: [],
          financialPostingBatches: [],
          receipt: createFinalCommandReceipt({
            command,
            outcome: 'COMMITTED',
            reasonCode: null,
            transition,
            simTime: command.simTime,
            recordedAtReal: input.observedAtReal,
          }),
          outboxMessages: [],
          currentMaterializations: [
            {
              key: `SOCIAL_EMPLOYMENT_SERVICE_${command.countryId}`,
              payload: fresh.operation.state,
              observation: materializationObservation,
            },
          ],
          authorityKind: 'DISCRETIONARY_USER',
          commitAssertion: createWorldWriterCommitAssertion(
            lease,
            command.expectedWorldVersion!,
          ),
          observedAtReal: input.observedAtReal,
          officeOperatingSourceReadBinding: fresh.binding,
        });
        return draft;
      });
    },
  });
  issuedSourcePorts.add(sourceCommitProtectionPort);
  return Object.freeze({
    candidateFactory,
    sourceCommitProtectionPort,
    async readPlanningFrom(
      tx: SqlExecutor,
      selection: {
        readonly countryId: string;
        readonly servicePoolIds: readonly string[];
        readonly expectedHead: Readonly<{
          worldVersion: string;
          eventSequence: string;
        }>;
      },
    ): Promise<Readonly<PostwarSocialServiceCreationPlanningData>> {
      if (
        !Array.isArray(selection.servicePoolIds) ||
        selection.servicePoolIds.length > 100 ||
        new Set(selection.servicePoolIds).size !==
          selection.servicePoolIds.length ||
        selection.servicePoolIds.some(
          (id) => typeof id !== 'string' || !id.length || id.length > 512,
        ) ||
        !/^(0|[1-9][0-9]*)$/u.test(
          selection.expectedHead?.worldVersion ?? '',
        ) ||
        !/^(0|[1-9][0-9]*)$/u.test(selection.expectedHead?.eventSequence ?? '')
      )
        invalid('EXACT_BOUNDED_PLANNING_PAGE_REQUIRED');
      const current = await readCurrentFrom(tx, selection.countryId),
        head = {
          worldVersion: current.lineage.headWorldVersion,
          eventSequence: current.lineage.headEventSequence,
        };
      if (!same(selection.expectedHead, head))
        invalid('PLANNING_CURRENT_HEAD_DIFFERS');
      return projectPostwarSocialServiceCreationPlanning({
        document: current.document,
        source: current.source.source,
        countryId: selection.countryId,
        servicePoolIds: selection.servicePoolIds,
        state: current.country.lifecycle.employment,
        head,
        simTime: current.ticks,
        sha256Hex: digest,
      });
    },
    async assertSourceBeforeClaim(request: {
      readonly command: CanonicalCommand;
      readonly observedAtReal: string;
    }) {
      const command = capturedCommand(request.command);
      if (
        !Number.isFinite(Date.parse(request.observedAtReal)) ||
        new Date(request.observedAtReal).toISOString() !==
          request.observedAtReal ||
        Date.parse(request.observedAtReal) < Date.parse(command.submittedAtReal)
      )
        invalid('CURRENT_PRECLAIM_OBSERVATION_REQUIRED');
      await configuration.database.transaction((tx) => deriveFrom(tx, command));
    },
    authorizeIntake(command: CanonicalCommand) {
      return authorizePostwarSocialOperatingCommandFrom(
        configuration.database,
        capturedCommand(command),
        'SOCIAL',
      );
    },
  });
}
