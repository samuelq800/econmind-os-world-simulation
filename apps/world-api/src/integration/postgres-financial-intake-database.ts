import type { Pool } from 'pg';
import { DOMAIN_ERROR_CODES, DomainError } from '@econmind/core';
import type { ServerVerifiedReadBinding } from './https-authenticated-read-composition.js';
import type { StagedTransferServiceInput } from './staged-narrow-transfer-service.js';
import type { PostgresNarrowTransferIntake } from '@econmind/world-worker/intake';

/** Revalidates actual persisted reference/current capability, never caller grants.
 * No lock before the existing Worker port: retain its submission->head->auth
 * ordering. Its transaction already locks current authorization; the final
 * FOR SHARE recheck holds any remaining current row until commit. */
export const FINANCIAL_INTAKE_CURRENT_BINDING_QUERY = `
select seat.seat_ref, seat.authorization_revision, admission.admission_ref,
  admission.seed_id, admission.seed_fingerprint, admission.model_version,
  head.world_version::text
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
where seat.world_id=$1 and seat.auth_subject=$2::uuid and seat.country_id=$3
  and seat.office_id=$4 and seat.seat_ref=$5 and seat.authorization_revision=$6
  and not exists (select 1 from world_v2.current_commit_authorization other
    where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active
      and (other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id
        or other.authorization_version is distinct from seat.authorization_revision))
limit 2`.trim();
export const FINANCIAL_INTAKE_WRITER_ROLE_QUERY = `
select current_user as role_name, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
  r.rolcreaterole, r.rolreplication,
  current_setting('request.jwt.claim.sub',true) as verified_subject,
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='world_v2' and c.relname in
      ('authoritative_event','inventory_posting','financial_posting_batch','current_materialization','world_writer_lease')
      and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) as economic_writer,
  has_schema_privilege(current_user,'world_v2','CREATE') as schema_creator
from pg_roles r where r.rolname=current_user`.trim();

type Database = ConstructorParameters<
  typeof PostgresNarrowTransferIntake
>[0]['database'];
type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];
function deny(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    'Current persisted financial intake binding required',
  );
}

/** Per-request managed writer transaction adapter. Only reviewed Worker intake
 * and approval stores receive it. No economic writes or arbitrary HTTP SQL.
 * A connection/commit acknowledgement failure is thrown, not replayed here.
 * Existing intake alone owns its explicit read-only recovery/UNKNOWN result. */
export function createPostgresFinancialIntakeDatabase(input: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly writerRole: string;
  readonly binding: ServerVerifiedReadBinding;
  readonly signal: AbortSignal;
}): Database &
  StagedTransferServiceInput['database'] & {
    assertNoRolledBackBindingDenial(): void;
  } {
  const b = input.binding;
  // The existing intake deliberately converts adapter-tail errors to UNKNOWN.
  // Preserve a definite guard denial only when our rollback was acknowledged;
  // commit/rollback uncertainty continues through its existing recovery path.
  let rolledBackBindingDenial: DomainError | undefined;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(input.writerRole) ||
    input.writerRole.startsWith('pg_') ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      'supabase_admin',
      'world_v2_api_reader',
      'world_v2_api_login',
    ].includes(input.writerRole)
  )
    throw new Error('FINANCIAL_INTAKE_WRITER_ROLE_REQUIRED');
  const parameters = [
    b.identity.worldId,
    b.identity.authSubjectId,
    b.identity.countryId,
    b.identity.officeId,
    b.seatRef,
    b.identity.authorizationRevision,
    b.identity.officeId === 'FINANCE' ? 'FINANCE_TREASURY' : 'TRADE_CONTRACTS',
  ];
  async function guard(executor: Executor, lock: boolean) {
    const result = await executor.query<Record<string, unknown>>(
      FINANCIAL_INTAKE_CURRENT_BINDING_QUERY +
        (lock ? ' for share of authz' : ''),
      parameters,
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.seat_ref !== b.seatRef ||
      row.authorization_revision !== b.identity.authorizationRevision ||
      row.admission_ref !== b.seed.admissionRef ||
      row.seed_id !== b.seed.seedRef ||
      row.seed_fingerprint !== b.seed.contentHash ||
      row.model_version !== b.identity.modelVersion ||
      typeof row.world_version !== 'string' ||
      !/^(?:0|[1-9]\d*)$/u.test(row.world_version) ||
      BigInt(row.world_version) < BigInt(b.readback.worldVersion)
    )
      deny();
  }
  async function transaction<Result>(
    operation: (executor: Executor) => Promise<Result>,
  ): Promise<Result> {
    if (input.signal.aborted) throw new Error('FINANCIAL_INTAKE_CANCELLED');
    const client = await input.pool.connect();
    let open = false,
      released = false;
    let bindingDenial: DomainError | undefined;
    const checkedGuard = async (lock: boolean) => {
      try {
        await guard(executor, lock);
      } catch (error) {
        if (error instanceof DomainError) bindingDenial = error;
        throw error;
      }
    };
    const release = (destroy: boolean) => {
      if (!released) {
        released = true;
        client.release(destroy);
      }
    };
    const abort = () => release(true);
    input.signal.addEventListener('abort', abort, { once: true });
    const executor: Executor = {
      async query<Row extends object>(
        sql: string,
        values?: readonly unknown[],
      ) {
        if (input.signal.aborted || released)
          throw new Error('FINANCIAL_INTAKE_CANCELLED');
        const result = await client.query(
          sql,
          values ? [...values] : undefined,
        );
        if (input.signal.aborted || released)
          throw new Error('FINANCIAL_INTAKE_CANCELLED');
        return { rows: result.rows as Row[], rowCount: result.rowCount };
      },
    };
    try {
      await executor.query('begin');
      open = true;
      await executor.query(
        "select set_config('request.jwt.claim.sub',$1,true)",
        [b.identity.authSubjectId],
      );
      await executor.query(
        "select set_config('statement_timeout','10000',true)",
      );
      const roles = await executor.query<Record<string, unknown>>(
        FINANCIAL_INTAKE_WRITER_ROLE_QUERY,
      );
      const r = roles.rows[0];
      if (
        roles.rows.length !== 1 ||
        !r ||
        r.role_name !== input.writerRole ||
        r.verified_subject !== b.identity.authSubjectId ||
        [
          'rolsuper',
          'rolbypassrls',
          'rolcreatedb',
          'rolcreaterole',
          'rolreplication',
          'economic_writer',
          'schema_creator',
        ].some((k) => r[k] !== false)
      )
        deny();
      await checkedGuard(false);
      const result = await operation(executor);
      await checkedGuard(true);
      await executor.query('commit');
      open = false;
      return result;
    } catch (error) {
      if (open && !released)
        try {
          await client.query('rollback');
          open = false;
          if (bindingDenial) rolledBackBindingDenial = bindingDenial;
        } catch {
          release(true);
        }
      throw error;
    } finally {
      input.signal.removeEventListener('abort', abort);
      release(false);
    }
  }
  return Object.freeze({
    transaction,
    assertNoRolledBackBindingDenial() {
      if (rolledBackBindingDenial) throw rolledBackBindingDenial;
    },
    query: <Row extends object>(sql: string, parameters?: readonly unknown[]) =>
      transaction((tx) => tx.query<Row>(sql, parameters)),
  });
}
