import { assertPostwarCurrentSocialMatchPlan } from './postwar-social-match-current-plan.js';
import { observePostwarSocialMaterialization } from './postwar-social-materialization.js';
import type { CurrentMaterializationObservation } from './current-materialization-observation.js';
import type { PreparedPostwarSocialSource } from './prepared-postwar-social-source.js';
/** Fixed once-only day-zero MATCH publication/consumption over actual originals.
 * No Clock service/advance, demo grant, request snapshot or Ready callback. */
import { createHash } from 'node:crypto';
import {
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  parseCanonicalCommand,
  validateCanonicalCommand,
  parseSocialEmploymentServiceCommand,
  bindAuthoritativeTransition,
  prepareSocialEmploymentServiceOperation,
  type CanonicalCommand,
  type AuthoritativeTransition,
  type DecisionResultHead,
  type SocialEmploymentReadFacts,
} from '@econmind/core';
import {
  createPostgresSocialOperatingOriginalReader,
  SOCIAL_OPERATING_CUSTODY_ROLES,
  SOCIAL_CUSTODY_SESSION_QUERY,
} from './postgres-social-operating-custody.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import { replayPostwarSocialEmploymentLineage } from './postwar-social-employment-lineage.js';
import { assertSocialPhysicalAttemptEnvelope } from './social-physical-attempt-envelope.js';
import {
  SqlSocialJobMatchCandidateSource,
  prepareSocialJobMatchAtomicDraft,
  type SocialEmploymentRuntimeSnapshotReader,
} from './social-job-match-candidate-source.js';
import type { OfficialLabourSocialOpeningAdoption } from '../preparation/official-labour-social-opening-adoption.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { AtomicTransitionCandidateFactory } from './atomic-transition-repository.js';
export const SOCIAL_MATCH_SOURCE_PURPOSE =
  'SOCIAL_EMPLOYMENT_JOB_MATCH_DUE_SOURCE_EVALUATION_V1' as const;
export interface SocialMatchSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof SOCIAL_MATCH_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: null;
}
export interface SocialMatchSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof SOCIAL_MATCH_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface SocialMatchSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<SocialMatchSourceCommitRequest>,
  ): Promise<Readonly<SocialMatchSourceCommitAudit>>;
}
const issued = new WeakSet<object>();
export function isPostwarSocialMatchSourceCommitProtectionPort(
  value: unknown,
): value is SocialMatchSourceCommitProtectionPort {
  return typeof value === 'object' && value !== null && issued.has(value);
}
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_MATCH_RUNTIME:${reason}`);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
type Row = Record<string, unknown>;
async function publisherSession(tx: SqlExecutor) {
  const r = (await tx.query<Row>(SOCIAL_CUSTODY_SESSION_QUERY)).rows;
  if (
    r.length !== 1 ||
    !r[0] ||
    r[0].role_name !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
    r[0].rolsuper !== false ||
    r[0].rolbypassrls !== false ||
    r[0].rolcreaterole !== false ||
    r[0].rolcreatedb !== false ||
    r[0].rolreplication !== false ||
    r[0].owner_member !== false ||
    r[0].read_only !== 'off' ||
    !['repeatable read', 'serializable'].includes(String(r[0].isolation))
  )
    invalid('fixed real publisher role and stable transaction required');
}
function commandFromRow(row: Row) {
  const time =
    row.submitted_at_real instanceof Date
      ? row.submitted_at_real.toISOString()
      : String(row.submitted_at_real);
  const c = parseCanonicalCommand(
    {
      schemaVersion: row.schema_version,
      actorId: row.actor_id,
      authSubject: row.auth_subject,
      commandId: row.command_id,
      commandType: row.command_type,
      correlationId: row.correlation_id,
      countryId: row.country_id,
      expectedWorldVersion: String(row.expected_world_version),
      idempotencyKey: row.idempotency_key,
      officeId: row.office_id,
      simTime: String(row.sim_time),
      submittedAtReal: time,
      worldId: row.world_id,
      payload: JSON.parse(String(row.canonical_payload)),
    },
    digest,
  );
  if (
    c.fingerprint !== row.command_fingerprint ||
    c.payloadHash !== row.payload_sha256
  )
    invalid('SQL-issued canonical command differs from actual Core parse/hash');
  return c;
}
export function createPostwarSocialMatchPublisher() {
  return Object.freeze({
    async registerFrom(
      tx: SqlExecutor,
      scope: { worldId: string; countryId: string },
    ) {
      await publisherSession(tx);
      const r = await tx.query<Row>(
        'select * from world_v2.register_social_operating_match_publisher($1,$2)',
        [scope.worldId, scope.countryId],
      );
      if (
        r.rows.length !== 1 ||
        r.rows[0]!.issuer_role !== SOCIAL_OPERATING_CUSTODY_ROLES.publisher ||
        r.rows[0]!.rule_version !== SOCIAL_JOB_MATCH_RULE_VERSION
      )
        invalid('actual fixed rule registration required');
      return freeze(r.rows[0]!);
    },
    async publishFrom(
      tx: SqlExecutor,
      scope: { worldId: string; planCommandId: string },
    ) {
      await publisherSession(tx);
      const r = await tx.query<Row>(
        'select * from world_v2.publish_social_operating_match_due($1,$2)',
        [scope.worldId, scope.planCommandId],
      );
      if (r.rows.length !== 1)
        invalid('actual one-shot command publication required');
      const command = commandFromRow(r.rows[0]!);
      const parsed = parseSocialEmploymentServiceCommand(command, digest);
      if (
        parsed.kind !== 'MATCH' ||
        command.worldId !== scope.worldId ||
        parsed.intent.planCommandId !== scope.planCommandId
      )
        invalid('published command causation differs');
      return command;
    },
    async revokeFrom(
      tx: SqlExecutor,
      scope: { worldId: string; countryId: string; reasonRef: string },
    ) {
      await publisherSession(tx);
      await tx.query(
        'select world_v2.revoke_social_operating_match_publisher($1,$2,$3)',
        [scope.worldId, scope.countryId, scope.reasonRef],
      );
    },
  });
}
export function createPostwarSocialMatchRuntime(configuration: {
  readonly preparedSource?: PreparedPostwarSocialSource;
  readonly database: SqlDatabase;
  readonly workerRole: string;
  readonly workerId: string;
  readonly openingAdoption: OfficialLabourSocialOpeningAdoption;
}) {
  const roles = createPostwarSocialSourceRoleScope(configuration),
    originals = createPostgresSocialOperatingOriginalReader(configuration);
  const captured = new Map<
    string,
    {
      binding: unknown;
      stateHash: string;
      observation: Readonly<CurrentMaterializationObservation>;
      readFactsHash: string;
    }
  >();
  const deriveFrom = async (tx: SqlExecutor, command: CanonicalCommand) => {
    const parsed = parseSocialEmploymentServiceCommand(command, digest);
    if (
      parsed.kind !== 'MATCH' ||
      command.officeId !== null ||
      command.commandType !== SOCIAL_JOB_MATCH_DUE_COMMAND
    )
      invalid('exact versioned automatic MATCH required');
    const original = await roles.withSourceReaderFrom(tx, () =>
      originals.withOriginalsFrom(
        tx,
        { worldId: command.worldId, countryId: command.countryId },
        async (source) => {
          const grants = await tx.query<Row>(
            'select * from world_v2.lock_social_operating_match_publisher($1,$2)',
            [command.worldId, command.countryId],
          );
          const publications = await tx.query<Row>(
            'select * from world_v2.lock_social_operating_match_publication($1,$2,$3,$4)',
            [
              command.worldId,
              command.countryId,
              command.commandId,
              parsed.intent.planCommandId,
            ],
          );
          if (grants.rows.length !== 1 || publications.rows.length !== 1)
            invalid(
              'real current automatic publisher and issued command required',
            );
          return {
            ...source,
            grant: grants.rows[0]!,
            publication: publications.rows[0]!,
          };
        },
      ),
    );
    const { lineage, document, grant, publication } = original;
    const planEntry = lineage.transitions.find(
      (e) => e.command.commandId === parsed.intent.planCommandId,
    );
    if (
      !planEntry ||
      planEntry.receipt.outcome !== 'COMMITTED' ||
      planEntry.command.fingerprint !== parsed.intent.planFingerprint ||
      planEntry.command.countryId !== command.countryId ||
      command.expectedWorldVersion !== lineage.headWorldVersion ||
      command.simTime.ticks !== planEntry.command.simTime.ticks ||
      command.simTime.ticks >= 86400000n ||
      parsed.intent.dueDayIndex !== '0' ||
      grant.rule_version !== SOCIAL_JOB_MATCH_RULE_VERSION ||
      grant.actor_id !== command.actorId ||
      grant.auth_subject !== command.authSubject ||
      publication.command_fingerprint !== command.fingerprint ||
      publication.grant_ref !== grant.grant_ref
    )
      invalid(
        'canonical PLAN, actual publisher, day-zero boundary or publication differs',
      );
    const plan = parseSocialEmploymentServiceCommand(planEntry.command, digest);
    if (plan.kind !== 'PLAN') invalid('actual original PLAN required');
    const replay = replayPostwarSocialEmploymentLineage({ document, lineage });
    assertPostwarCurrentSocialMatchPlan({
      frames: lineage.transitions.map((t) => ({
        ...t,
        events: t.transition.events,
      })),
      socialCountries: replay.countries,
      countryId: command.countryId,
      planCommandId: parsed.intent.planCommandId,
      requirePending: true,
    });
    const country = replay.countries.find(
        (c) => c.countryId === command.countryId,
      ),
      source = document.countries.find(
        (c) => c.countryId === command.countryId,
      );
    if (!country || !source) invalid('actual country source absent');
    const offer = country.lifecycle.offers.find(
      (o) => o.positionId === plan.intent.positionId && o.state === 'ACTIVE',
    );
    const body = source.physicalOriginalBodies.find(
      (b) =>
        b.locationId === plan.intent.locationId &&
        b.dayIndex === parsed.intent.dueDayIndex &&
        b.pools.some(
          (p) =>
            p.poolId === plan.intent.servicePoolId &&
            p.skill === plan.intent.skill,
        ),
    );
    if (!offer || !body)
      invalid('actual funded offer/finite physical day source absent');
    const readFacts: SocialEmploymentReadFacts = {
      ...source.validationReadFacts.facts,
      offer,
      simTime: command.simTime.toCanonicalValue(),
    };
    const state = country.lifecycle.employment;
    const physical = assertSocialPhysicalAttemptEnvelope({
      command,
      state,
      readFacts,
      sourceEnvelope: {
        ...body,
        headWorldVersion: lineage.headWorldVersion,
        headEventSequence: lineage.headEventSequence,
      },
      sha256Hex: digest,
    });
    const operation = prepareSocialEmploymentServiceOperation({
      command,
      state,
      readFacts,
      sha256Hex: digest,
    });
    if (operation.source !== 'APPLIED')
      invalid('settled automatic operation cannot become a new candidate');
    const head = {
      worldId: lineage.worldId,
      worldVersion: lineage.headWorldVersion,
      eventSequence: lineage.headEventSequence,
    };
    const binding = freeze({
      schemaVersion: 'social-match-source-read-binding-v1',
      purpose: SOCIAL_MATCH_SOURCE_PURPOSE,
      commandFingerprint: command.fingerprint,
      head,
      seedFingerprint: lineage.seed.fingerprint,
      sourceId: original.source.sourceId,
      sourcePayloadHash: original.source.payloadHash,
      registration: original.registration,
      publisher: grant,
      publication,
      originalPlanFingerprint: planEntry.command.fingerprint,
      originalPlanReceiptFingerprint: hash(planEntry.receipt),
      completePrefixFingerprint: hash(lineage.transitions),
      stateHash: hash(state),
      readFactsHash: hash(readFacts),
      physicalBodyHash: physical.immutableBodyHash,
      clockBasis:
        'CURRENT_PENDING_PLAN_SIMTIME_COMPLETE_MIXED_PREFIX_OPENING_E01_DAY_ZERO_NO_CLOCK_ADVANCE',
    });
    return { state, readFacts, binding, head, operation, lineage };
  };
  const snapshotReader: SocialEmploymentRuntimeSnapshotReader = Object.freeze({
    async readFrom(
      input: Parameters<SocialEmploymentRuntimeSnapshotReader['readFrom']>[0],
    ) {
      const fresh = await deriveFrom(input.transaction, input.command);
      if (
        fresh.head.worldVersion !== input.headWorldVersion ||
        fresh.head.eventSequence !== input.headEventSequence
      )
        invalid('actual held head differs');
      const observation = await observePostwarSocialMaterialization({
        executor: input.transaction,
        lineage: fresh.lineage,
        countryId: input.command.countryId!,
        kind: 'SERVICE',
      });
      captured.set(input.command.fingerprint, {
        binding: fresh.binding,
        observation,
        stateHash: hash(fresh.state),
        readFactsHash: hash(fresh.readFacts),
      });
      return freeze({
        status: 'REPLAYED' as const,
        provenance: 'TEST_ONLY' as const,
        openingSeedHash: fresh.binding.seedFingerprint,
        worldId: input.command.worldId,
        headWorldVersion: fresh.head.worldVersion,
        headEventSequence: fresh.head.eventSequence,
        state: fresh.state,
        stateHash: hash(fresh.state),
        readFacts: fresh.readFacts,
        readFactsHash: hash(fresh.readFacts),
      });
    },
  });
  const source = new SqlSocialJobMatchCandidateSource({
    ...configuration,
    mode: 'TEST_ONLY_LOCAL',
    sha256Hex: digest,
    snapshotReader,
    automaticAuthority: {
      async assertFrom(input) {
        await roles.withSourceReaderFrom(input.transaction, async () => {
          const r = await input.transaction.query<Row>(
            'select * from world_v2.lock_social_operating_match_publication($1,$2,$3,$4)',
            [
              input.command.worldId,
              input.command.countryId,
              input.command.commandId,
              input.originalPlan.commandId,
            ],
          );
          if (
            r.rows.length !== 1 ||
            r.rows[0]!.command_fingerprint !== input.command.fingerprint
          )
            invalid('actual current automatic publication changed');
        });
      },
    },
  });
  const candidateFactory: AtomicTransitionCandidateFactory = Object.freeze({
    async prepare(
      input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      if (input.commitAuthorization !== null)
        invalid('automatic MATCH cannot borrow discretionary proof');
      const p = await source.load({
        command: input.command,
        observedAtReal: input.observedAtReal,
      });
      const record = captured.get(input.command.fingerprint);
      captured.delete(input.command.fingerprint);
      if (
        !record ||
        record.stateHash !== hash(p.state) ||
        record.readFactsHash !== hash(p.readFacts)
      )
        invalid('factory did not consume the exact actual reader snapshot');
      const draft = prepareSocialJobMatchAtomicDraft({
        preparation: p,
        sha256Hex: digest,
      });
      return freeze({
        ...draft,
        currentMaterializations: draft.currentMaterializations.map((m) => ({
          ...m,
          observation: record.observation,
        })),
        officeOperatingSourceReadBinding: record.binding,
      });
    },
  });
  const sourceCommitProtectionPort: SocialMatchSourceCommitProtectionPort =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        request: Readonly<SocialMatchSourceCommitRequest>,
      ): Promise<Readonly<SocialMatchSourceCommitAudit>> {
        if (
          request.phase !== 'BEFORE_EVENTS' ||
          request.purpose !== SOCIAL_MATCH_SOURCE_PURPOSE ||
          request.commitAuthorization !== null
        )
          invalid('independent automatic source purpose/null proof required');
        bindAuthoritativeTransition(
          { command: request.command, transition: request.transition },
          digest,
        );
        const fresh = await deriveFrom(tx, request.command);
        if (
          !same(request.currentHead, fresh.head) ||
          !same(request.readBinding, fresh.binding) ||
          request.transition.events.length !== 1 ||
          request.transition.events[0]!.canonicalPayload !==
            canonicalSerialize(fresh.operation.eventPayload)
        )
          invalid(
            'actual publisher/source/current prefix differs at automatic cutoff',
          );
        return freeze({
          status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
          purpose: SOCIAL_MATCH_SOURCE_PURPOSE,
          commandFingerprint: request.command.fingerprint,
          currentHead: request.currentHead,
          readBindingFingerprint: hash(fresh.binding),
          protectionMode: 'HELD_SOURCE_GUARDS',
        });
      },
    });
  issued.add(sourceCommitProtectionPort);
  return Object.freeze({
    candidateFactory,
    sourceCommitProtectionPort,
    /** Pre-claim current one-shot source check, never a lease or authority proof. */
    async assertSourceBeforeClaim(request: {
      readonly command: CanonicalCommand;
      readonly observedAtReal: string;
    }): Promise<void> {
      const command = validateCanonicalCommand(request.command, digest);
      if (
        !Number.isFinite(Date.parse(request.observedAtReal)) ||
        new Date(request.observedAtReal).toISOString() !==
          request.observedAtReal ||
        Date.parse(request.observedAtReal) < Date.parse(command.submittedAtReal)
      )
        invalid('valid current pre-claim observation required');
      await configuration.database.transaction(async (tx) => {
        await deriveFrom(tx, command);
      });
    },
  });
}
