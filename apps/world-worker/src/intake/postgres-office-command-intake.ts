import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  COMMAND_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_CAPABILITY,
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_CAPABILITY,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY,
  DomainError,
  DOMAIN_ERROR_CODES,
  actorId,
  authSubject,
  authorizeOfficeCapability,
  canonicalSerialize,
  countryId,
  officeId,
  teamId,
  worldId,
  parseCanonicalCommand,
  parseCaptainPoliticalCapitalAllocation,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
  type AuthenticatedPrincipal,
  type CanonicalCommand,
} from '@econmind/core';
import type { FinancialIntakeBindingDto } from '@econmind/core/authenticated-financial-intake-contract';
import type {
  ManualOfficeSourceRejectionDto,
  ManualOfficeQueueAcknowledgementDto,
  ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';

import {
  boundManualOfficeIntakeRuntime,
  preflightManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from './manual-office-intake-runtime.js';
export {
  createManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from './manual-office-intake-runtime.js';
export class OfficeCommandOutcomeUnknownError extends Error {
  constructor(cause: unknown) {
    super('OFFICE_COMMAND_WRITE_OUTCOME_UNKNOWN', { cause });
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const reference = /^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u;
const integer = /^(?:0|[1-9]\d*)$/u;
const maxBigint = 9_223_372_036_854_775_807n;

function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
    'Invalid manual Office request',
  );
}
function deny(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    'Current persisted Office authority required',
  );
}
function conflict(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    'Command identity already binds a different intent',
  );
}

/** Transport shape only: the three existing Core parsers validate economics. */
export function parseManualOfficeCommandRequest(
  input: unknown,
): ManualOfficeCommandRequestDto {
  const value: unknown = JSON.parse(canonicalSerialize(input));
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  const fields = [
    'worldId',
    'countryId',
    'officeId',
    'commandType',
    'commandId',
    'idempotencyKey',
    'expectedWorldVersion',
    'payload',
  ];
  if (
    Object.keys(row).length !== fields.length ||
    !fields.every((k) => Object.hasOwn(row, k))
  )
    invalid();
  for (const k of ['worldId', 'countryId', 'commandId', 'idempotencyKey'])
    if (
      typeof row[k] !== 'string' ||
      row[k].length > 256 ||
      !reference.test(row[k])
    )
      invalid();
  if (
    typeof row.expectedWorldVersion !== 'string' ||
    !integer.test(row.expectedWorldVersion) ||
    BigInt(row.expectedWorldVersion) > maxBigint
  )
    invalid();
  if (!(
    (row.officeId === 'CAPTAIN' &&
      row.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND) ||
    (row.officeId === 'CENTRAL_BANK' &&
      row.commandType === CENTRAL_BANK_OMO_COMMAND) ||
    (row.officeId === 'SOCIAL' &&
      row.commandType === SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND)
  ))
    invalid();
  return Object.freeze(row) as unknown as ManualOfficeCommandRequestDto;
}

const capability = (office: ManualOfficeCommandRequestDto['officeId']) =>
  office === 'CAPTAIN'
    ? CAPTAIN_POLITICAL_CAPITAL_CAPABILITY
    : office === 'CENTRAL_BANK'
      ? CENTRAL_BANK_OMO_CAPABILITY
      : SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY;

export const OFFICE_COMMAND_CURRENT_BINDING_QUERY = `
select seat.seat_ref, authz.team_id, authz.authorization_version,
  admission.admission_ref, admission.seed_id, admission.seed_fingerprint,
  admission.model_version, head.world_version::text, head.event_sequence::text
from world_v2.runtime_read_seat seat
join world_v2.current_commit_authorization authz
  on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject
  and authz.country_id=seat.country_id and authz.office_id=seat.office_id
  and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision
  and authz.active and authz.capability=$7
join world_v2.runtime_opening_admission admission on admission.world_id=seat.world_id
join world_v2.opening_seed seed on seed.world_id=admission.world_id
  and seed.seed_id=admission.seed_id and seed.seed_fingerprint=admission.seed_fingerprint
  and seed.replay_binding=admission.replay_binding
  and (seed.replay_binding::jsonb->>'modelVersion')=admission.model_version
join world_v2.world_head head on head.world_id=seed.world_id
join world_v2.projection_entitlement entitlement
  on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject
  and entitlement.authorization_version=seat.authorization_revision and entitlement.active
  and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'
  and entitlement.scope_key=$8
where seat.world_id=$1 and seat.auth_subject=$2::uuid and seat.country_id=$3
  and seat.office_id=$4 and seat.seat_ref=$5 and seat.authorization_revision=$6
  and not exists (select 1 from world_v2.current_commit_authorization other
    where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active
      and (other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id
        or other.authorization_version is distinct from seat.authorization_revision))
limit 2`.trim();

/** Privilege observations are not a grant, policy or runtime-readiness proof. */
export const OFFICE_COMMAND_ROLE_QUERY = `
select current_user as role_name, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
  r.rolcreaterole, r.rolreplication,
  current_setting('request.jwt.claim.sub',true) as verified_subject,
  current_setting('transaction_read_only') as read_only,
  has_schema_privilege(current_user,'world_v2','CREATE') as schema_creator,
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='world_v2' and c.relname in
      ('authoritative_event','inventory_posting','financial_posting_batch','current_materialization','world_writer_lease')
      and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) as economic_writer,
  has_table_privilege(current_user,'world_v2.command_submission','INSERT') as submission_insert,
  has_table_privilege(current_user,'world_v2.command_queue','INSERT') as queue_insert
from pg_roles r where r.rolname=current_user`.trim();

type IntakeState =
  ManualOfficeSourceRejectionDto | ManualOfficeQueueAcknowledgementDto;
interface StoredCommand {
  worldId: string;
  commandId: string;
  idempotencyKey: string;
  commandType: string;
  schemaVersion: string;
  canonicalPayload: string;
  payloadHash: string;
  fingerprint: string;
  actorId: string;
  authSubject: string;
  countryId: string;
  officeId: string;
  expectedWorldVersion: string;
  simTime: string;
  correlationId: string;
  submittedAtReal: Date | string;
}

/** Conditional server intake. Default is read-only/source-blocked. Only the
 * private identity of a real source+sole consumer composition can write the
 * existing command_submission/command_queue atomically. No economic execution. */
export class PostgresOfficeCommandIntake {
  constructor(
    private readonly config: {
      pool: Pick<Pool, 'connect'>;
      runtime?: ManualOfficeIntakeRuntime | null;
      role: string;
      clock: { nowReal(): string; simTime(world: string): Promise<string> };
    },
  ) {
    if (
      !/^[a-z][a-z0-9_]{0,62}$/u.test(config.role) ||
      config.role.startsWith('pg_') ||
      [
        'postgres',
        'anon',
        'authenticated',
        'service_role',
        'supabase_admin',
        'supabase_auth_admin',
        'world_v2_api_reader',
        'world_v2_api_login',
      ].includes(config.role)
    )
      throw new Error('OFFICE_COMMAND_SCOPED_ROLE_REQUIRED');
  }

  async submit(input: {
    request: ManualOfficeCommandRequestDto;
    binding: FinancialIntakeBindingDto;
    principal: AuthenticatedPrincipal;
    actor: string;
    signal: AbortSignal;
  }): Promise<IntakeState> {
    const request = parseManualOfficeCommandRequest(input.request);
    const b = input.binding;
    const runtime = this.config.runtime;
    const positive = boundManualOfficeIntakeRuntime(runtime, {
      pool: this.config.pool,
      clock: this.config.clock,
      worldId: request.worldId,
    });
    const rejected = (): ManualOfficeSourceRejectionDto =>
      Object.freeze({
        status: 'REJECTED',
        reason: 'SOURCE_RUNTIME_UNAVAILABLE',
        commandType: request.commandType,
        submitted: false,
        queued: false,
        missing: Object.freeze([
          'ADMITTED_DOMAIN_SOURCE',
          'SOLE_DURABLE_CONSUMER',
        ] as const),
      });
    const subject = authSubject(input.principal.authSubject);
    const scope = `OFFICE_${Buffer.from(request.countryId).toString('hex').toUpperCase()}_${Buffer.from(request.officeId).toString('hex').toUpperCase()}`;
    if (
      b.source !== 'SERVER_VERIFIED_READ_BINDING' ||
      b.seatState !== 'ACTIVE' ||
      b.identity.worldId !== request.worldId ||
      b.identity.authSubjectId !== subject ||
      b.identity.countryId !== request.countryId ||
      b.identity.officeId !== request.officeId ||
      b.identity.classification !== 'OFFICE_PRIVATE' ||
      b.identity.scopeKey !== scope ||
      b.seed.worldId !== request.worldId ||
      b.readback.worldId !== request.worldId ||
      b.readback.seedRef !== b.seed.seedRef ||
      b.readback.contentHash !== b.seed.contentHash ||
      b.readback.admissionRef !== b.seed.admissionRef
    )
      deny();
    if (input.signal.aborted) throw new Error('OFFICE_COMMAND_CANCELLED');
    const client = await this.config.pool.connect();
    let released = false,
      open = false,
      writeAttempted = false,
      commitAttempted = false;
    const release = (destroy: boolean) => {
      if (!released) {
        released = true;
        client.release(destroy);
      }
    };
    if (input.signal.aborted) release(true);
    const abort = () => release(true);
    input.signal.addEventListener('abort', abort, { once: true });
    const query = async <Row extends object>(
      sql: string,
      values?: readonly unknown[],
    ) => {
      if (input.signal.aborted || released)
        throw new Error('OFFICE_COMMAND_CANCELLED');
      const result = await client.query(sql, values ? [...values] : undefined);
      if (input.signal.aborted || released)
        throw new Error('OFFICE_COMMAND_CANCELLED');
      return result.rows as Row[];
    };
    try {
      await query(
        positive
          ? 'begin isolation level read committed'
          : 'begin isolation level repeatable read read only',
      );
      open = true;
      await query("select set_config('request.jwt.claim.sub',$1,true)", [
        subject,
      ]);
      await query("select set_config('statement_timeout','10000',true)");
      const roles = await query<Record<string, unknown>>(
        OFFICE_COMMAND_ROLE_QUERY,
      );
      const role = roles[0];
      if (
        roles.length !== 1 ||
        !role ||
        role.role_name !== this.config.role ||
        role.verified_subject !== subject ||
        role.read_only !== (positive ? 'off' : 'on') ||
        [
          'rolsuper',
          'rolbypassrls',
          'rolcreatedb',
          'rolcreaterole',
          'rolreplication',
          'schema_creator',
          'economic_writer',
        ].some((k) => role[k] !== false)
      )
        deny();
      const rows = await query<Record<string, string>>(
        OFFICE_COMMAND_CURRENT_BINDING_QUERY,
        [
          request.worldId,
          subject,
          request.countryId,
          request.officeId,
          b.seatRef,
          b.identity.authorizationRevision,
          capability(request.officeId),
          scope,
        ],
      );
      const current = rows[0];
      if (
        rows.length !== 1 ||
        !current ||
        current.seat_ref !== b.seatRef ||
        current.authorization_version !== b.identity.authorizationRevision ||
        current.admission_ref !== b.seed.admissionRef ||
        current.seed_id !== b.seed.seedRef ||
        current.seed_fingerprint !== b.seed.contentHash ||
        current.model_version !== b.identity.modelVersion ||
        current.world_version !== b.readback.worldVersion ||
        current.event_sequence !== b.readback.eventSequence
      )
        deny();
      const membership = Object.freeze({
        authSubject: subject,
        worldId: worldId(request.worldId),
        countryId: countryId(request.countryId),
        teamId: teamId(current.team_id!),
        authorizationVersion: current.authorization_version!,
        officeAssignments: [officeId(request.officeId)],
        active: true,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      });
      const authorization = await authorizeOfficeCapability({
        principal: input.principal,
        resolver: {
          resolveCurrentIdentity: async () => subject,
          resolveCurrentMembership: async () => membership,
        },
        worldId: worldId(request.worldId),
        requestedCountryId: countryId(request.countryId),
        requestedOfficeId: officeId(request.officeId),
        capability: capability(request.officeId),
      });
      const storedRows = await query<StoredCommand>(
        `select world_id as "worldId", command_id as "commandId", idempotency_key as "idempotencyKey",
        command_type as "commandType", schema_version as "schemaVersion", canonical_payload as "canonicalPayload",
        payload_sha256 as "payloadHash", command_fingerprint as fingerprint, actor_id as "actorId", auth_subject::text as "authSubject",
        country_id as "countryId", office_id as "officeId", expected_world_version::text as "expectedWorldVersion",
        sim_time::text as "simTime", correlation_id as "correlationId", submitted_at_real as "submittedAtReal"
        from world_v2.command_submission where world_id=$1 and (command_id=$2 or idempotency_key=$3)`,
        [request.worldId, request.commandId, request.idempotencyKey],
      );
      const decode = (
        records: StoredCommand[],
      ): CanonicalCommand | undefined => {
        if (records.length > 1) conflict();
        const stored = records[0];
        let original: CanonicalCommand | undefined;
        if (stored) {
          if (
            stored.commandId !== request.commandId ||
            stored.idempotencyKey !== request.idempotencyKey
          )
            conflict();
          const { fingerprint, payloadHash, canonicalPayload, ...fields } =
            stored;
          original = parseCanonicalCommand(
            {
              ...fields,
              submittedAtReal:
                stored.submittedAtReal instanceof Date
                  ? stored.submittedAtReal.toISOString()
                  : stored.submittedAtReal,
              payload: JSON.parse(canonicalPayload) as unknown,
            },
            sha,
          );
          if (
            original.fingerprint !== fingerprint ||
            original.payloadHash !== payloadHash ||
            original.canonicalPayload !== canonicalPayload
          )
            conflict();
        }
        return original;
      };
      let original = decode(storedRows);
      const build = async (original?: CanonicalCommand) =>
        parseCanonicalCommand(
          {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            commandType: request.commandType,
            worldId: request.worldId,
            commandId: request.commandId,
            idempotencyKey: request.idempotencyKey,
            countryId: authorization.countryId,
            officeId: authorization.officeId,
            actorId: actorId(input.actor),
            authSubject: authorization.authSubject,
            expectedWorldVersion: request.expectedWorldVersion,
            simTime:
              original?.simTime.toCanonicalValue() ??
              (await this.config.clock.simTime(request.worldId)),
            submittedAtReal:
              original?.submittedAtReal ?? this.config.clock.nowReal(),
            correlationId:
              original?.correlationId ?? `CORRELATION_${request.commandId}`,
            payload: request.payload,
          },
          sha,
        );
      let command = await build(original);
      if (command.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND)
        parseCaptainPoliticalCapitalAllocation(command, sha);
      else if (command.commandType === CENTRAL_BANK_OMO_COMMAND)
        parseCentralBankOmoIntent(command, sha);
      else if (
        parseSocialEmploymentServiceCommand(command, sha).kind !== 'PLAN'
      )
        invalid();
      if (original && original.fingerprint !== command.fingerprint) conflict();
      if (
        (!positive || !original) &&
        command.expectedWorldVersion !== current.world_version
      )
        throw new DomainError(
          DOMAIN_ERROR_CODES.VERSION_MISMATCH,
          'World head changed before manual intake',
        );
      if (
        !integer.test(command.simTime.toCanonicalValue()) ||
        BigInt(command.simTime.toCanonicalValue()) > maxBigint
      )
        invalid();
      if (
        !positive ||
        (!original &&
          !(await preflightManualOfficeIntakeRuntime(
            runtime!,
            command,
            this.config.clock.nowReal(),
          )))
      ) {
        await query('commit');
        open = false;
        return rejected();
      }
      // Immutable seat/admission/seed have existing mutation vetoes. Lock mutable
      // auth/entitlement at cutoff and follow submission→head lock order. A missing submission cannot
      // be locked, so serialize new registrations through the existing head.
      await query(
        'select command_id from world_v2.command_submission where world_id=$1 and (command_id=$2 or idempotency_key=$3) for update',
        [request.worldId, request.commandId, request.idempotencyKey],
      );
      await query(
        'select world_version from world_v2.world_head where world_id=$1 for update',
        [request.worldId],
      );
      const cutoff = await query<Record<string, string>>(
        OFFICE_COMMAND_CURRENT_BINDING_QUERY +
          ' for share of authz,entitlement',
        [
          request.worldId,
          subject,
          request.countryId,
          request.officeId,
          b.seatRef,
          b.identity.authorizationRevision,
          capability(request.officeId),
          scope,
        ],
      );
      if (
        cutoff.length !== 1 ||
        canonicalSerialize(cutoff[0]) !== canonicalSerialize(current)
      )
        deny();
      const finalRoles = await query<Record<string, unknown>>(
        OFFICE_COMMAND_ROLE_QUERY,
      );
      if (
        finalRoles.length !== 1 ||
        canonicalSerialize(finalRoles[0]) !== canonicalSerialize(role)
      )
        deny();
      // Re-read under the head WITHOUT acquiring a submission lock. A racing
      // registrar may have committed while this new registration waited.
      const raced = await query<StoredCommand>(
        `select world_id as "worldId", command_id as "commandId", idempotency_key as "idempotencyKey",
        command_type as "commandType", schema_version as "schemaVersion", canonical_payload as "canonicalPayload",
        payload_sha256 as "payloadHash", command_fingerprint as fingerprint, actor_id as "actorId", auth_subject::text as "authSubject",
        country_id as "countryId", office_id as "officeId", expected_world_version::text as "expectedWorldVersion",
        sim_time::text as "simTime", correlation_id as "correlationId", submitted_at_real as "submittedAtReal"
        from world_v2.command_submission where world_id=$1 and (command_id=$2 or idempotency_key=$3)`,
        [request.worldId, request.commandId, request.idempotencyKey],
      );
      if (
        !boundManualOfficeIntakeRuntime(runtime, {
          pool: this.config.pool,
          clock: this.config.clock,
          worldId: request.worldId,
        })
      ) {
        await query('commit');
        open = false;
        return rejected();
      }
      original = decode(raced);
      if (original) {
        command = await build(original);
        if (command.fingerprint !== original.fingerprint) conflict();
      } else {
        if (role.submission_insert !== true || role.queue_insert !== true)
          deny();
        if (command.expectedWorldVersion !== cutoff[0]!.world_version) deny();
        writeAttempted = true;
        const inserted = await query<{ command_id: string }>(
          `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,
          auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning command_id`,
          [
            command.worldId,
            command.commandId,
            command.idempotencyKey,
            command.commandType,
            command.schemaVersion,
            command.canonicalPayload,
            command.payloadHash,
            command.fingerprint,
            command.authSubject,
            command.actorId,
            command.countryId,
            command.officeId,
            command.expectedWorldVersion,
            command.simTime.toCanonicalValue(),
            command.correlationId,
            command.submittedAtReal,
          ],
        );
        if (
          inserted.length !== 1 ||
          inserted[0]?.command_id !== command.commandId
        )
          conflict();
        const queued = await query<{ command_id: string }>(
          `insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)
           values($1,$2,'DISCRETIONARY_USER',$3::bigint) returning command_id`,
          [
            command.worldId,
            command.commandId,
            command.simTime.toCanonicalValue(),
          ],
        );
        if (queued.length !== 1 || queued[0]?.command_id !== command.commandId)
          conflict();
      }
      const queues = await query<{
        queue_state: string;
        authority_kind: string;
        available_at_sim_time: string;
      }>(
        'select queue_state,authority_kind,available_at_sim_time::text from world_v2.command_queue where world_id=$1 and command_id=$2',
        [command.worldId, command.commandId],
      );
      const queue = queues[0];
      if (
        queues.length !== 1 ||
        !queue ||
        queue.authority_kind !== 'DISCRETIONARY_USER' ||
        queue.available_at_sim_time !== command.simTime.toCanonicalValue() ||
        !['PENDING', 'CLAIMED', 'FINALIZED'].includes(queue.queue_state)
      )
        conflict();
      const status =
        queue.queue_state === 'PENDING'
          ? 'QUEUED'
          : queue.queue_state === 'CLAIMED'
            ? 'EXECUTING'
            : 'FINALIZED';
      const state: ManualOfficeQueueAcknowledgementDto = Object.freeze({
        status,
        source: original ? 'EXISTING' : 'NEW',
        commandType: request.commandType,
        commandId: command.commandId,
        commandFingerprint: command.fingerprint,
        submitted: !original,
        queued: true,
      });
      commitAttempted = true;
      await query('commit');
      open = false;
      return state;
    } catch (error) {
      if (commitAttempted) {
        release(true);
        throw new OfficeCommandOutcomeUnknownError(error);
      }
      if (open && !released) {
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          release(true);
          // Do not unwrap unacknowledged cleanup as a definite denial.
          // Any attempted write retains UNKNOWN instead of a false rejection.
          if (positive && writeAttempted)
            throw new OfficeCommandOutcomeUnknownError(rollbackError);
          throw new Error('OFFICE_COMMAND_ROLLBACK_UNCONFIRMED', {
            cause: rollbackError,
          });
        }
      }
      if (open && released && positive && writeAttempted)
        throw new OfficeCommandOutcomeUnknownError(error);
      if (open && released)
        throw new Error('OFFICE_COMMAND_CONNECTION_DESTROYED', {
          cause: error,
        });
      throw error;
    } finally {
      input.signal.removeEventListener('abort', abort);
      release(false);
    }
  }
}
