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
  AuthenticatedOfficeCommandResponseDto,
  ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';

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

type Rejection = NonNullable<AuthenticatedOfficeCommandResponseDto['state']>;
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

/** Real SQL preflight. The fixed baseline sole dispatcher has no consumer for
 * any of these families, and no adopted domain source is wired here. Therefore
 * this class has no INSERT/queue/callback/registry readiness switch. It returns
 * the exact blocker after canonical parsing and current SQL authorization.
 * Adding persistence needs the real Root-owned source/consumer integration and
 * independently reviewed writer provisioning, not a caller's boolean. */
export class PostgresOfficeCommandIntake {
  constructor(
    private readonly config: {
      pool: Pick<Pool, 'connect'>;
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
  }): Promise<Rejection> {
    const request = parseManualOfficeCommandRequest(input.request);
    const b = input.binding;
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
      open = false;
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
      // No writes are possible even if a TEST_ONLY role has INSERT privileges.
      await query('begin isolation level repeatable read read only');
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
        role.read_only !== 'on' ||
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
      if (storedRows.length > 1) conflict();
      const stored = storedRows[0];
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
      const command = parseCanonicalCommand(
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
      if (command.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND)
        parseCaptainPoliticalCapitalAllocation(command, sha);
      else if (command.commandType === CENTRAL_BANK_OMO_COMMAND)
        parseCentralBankOmoIntent(command, sha);
      else if (
        parseSocialEmploymentServiceCommand(command, sha).kind !== 'PLAN'
      )
        invalid();
      if (original && original.fingerprint !== command.fingerprint) conflict();
      if (command.expectedWorldVersion !== current.world_version)
        throw new DomainError(
          DOMAIN_ERROR_CODES.VERSION_MISMATCH,
          'World head changed before manual intake',
        );
      if (
        !integer.test(command.simTime.toCanonicalValue()) ||
        BigInt(command.simTime.toCanonicalValue()) > maxBigint
      )
        invalid();
      await query('commit');
      open = false;
      return Object.freeze({
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
    } catch (error) {
      if (open && !released) {
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          release(true);
          // This preflight is SQL read-only. No write/acceptance to infer; do
          // not unwrap an uncertain cleanup as a definite semantic denial.
          throw new Error('OFFICE_COMMAND_ROLLBACK_UNCONFIRMED', {
            cause: rollbackError,
          });
        }
      }
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
