/** P0, non-activated storage candidate. References are not grants/admission.
 * No connector, credential, route, role creation, SET ROLE or admission writer.
 */
import { createHash } from 'node:crypto';
import {
  authSubject,
  worldId,
  countryId,
  officeId,
  teamId,
  openingSeedId,
  canonicalSerialize,
  CANONICAL_OFFICE_IDS,
  reauthorizeOfficeCapability,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import { WorldOpeningSeedStore } from './opening-seed-store.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const EXCLUDED_ROLES = new Set([
  'anon',
  'authenticated',
  'service_role',
  'postgres',
  'supabase_admin',
  'supabase_auth_admin',
  'world_v2_api_reader',
  'world_v2_api_login',
]);
type Row = Record<string, unknown>;
export const ADMISSION_PUBLICATION_BLOCKER =
  'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING' as const;
export interface RuntimeSeatReference {
  readonly seatRef: string;
  readonly worldId: string;
  readonly authSubject: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly teamId: string;
  readonly authorizationRevision: string;
  readonly createdAtReal: string;
}
export interface ImmutableOpeningAdmissionReference {
  readonly admissionRef: string;
  readonly worldId: string;
  readonly seedRef: string;
  readonly contentHash: string;
  readonly modelVersion: string;
  readonly replayBinding: string;
  readonly admittedAtReal: string;
}
export class RuntimeReadBindingStoreError extends Error {
  constructor(
    readonly code:
      | 'RUNTIME_READ_BINDING_UNAVAILABLE'
      | 'CURRENT_AUTHORIZATION_NOT_COHERENT'
      | 'SEAT_REFERENCE_CONFLICT'
      | 'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED',
  ) {
    super(code);
    this.name = 'RuntimeReadBindingStoreError';
  }
}
// SQL adapters may wrap callback failures after rollback. Preserve only our
// typed denial, never arbitrary SQL text/codes or caller-labelled objects.
function sanitizedFailure(error: unknown): RuntimeReadBindingStoreError {
  const seen = new Set<Error>();
  for (let depth = 0; depth < 8 && error instanceof Error; depth++) {
    if (error instanceof RuntimeReadBindingStoreError) return error;
    if (seen.has(error)) break;
    seen.add(error);
    error = error.cause;
  }
  return new RuntimeReadBindingStoreError('RUNTIME_READ_BINDING_UNAVAILABLE');
}
function text(v: unknown): string {
  if (
    typeof v !== 'string' ||
    v.length === 0 ||
    v.length > 256 ||
    v.trim() !== v
  )
    throw new Error('INVALID_STORED_TEXT');
  return v;
}
function ref(v: unknown): string {
  const s = text(v);
  if (!ID.test(s)) throw new Error('INVALID_REFERENCE');
  return s;
}
function timestamp(v: unknown): string {
  const s = text(v);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(s) ||
    new Date(s).toISOString() !== s
  )
    throw new Error('INVALID_TIMESTAMP');
  return s;
}
function role(v: string): string {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(v) ||
    v.startsWith('pg_') ||
    EXCLUDED_ROLES.has(v)
  )
    throw new Error('UNSAFE_RUNTIME_BINDING_ROLE');
  return v;
}
function parseSeat(r: Row): Readonly<RuntimeSeatReference> {
  const office = officeId(text(r.office_id));
  if (!CANONICAL_OFFICE_IDS.includes(office)) throw new Error('INVALID_OFFICE');
  return Object.freeze({
    seatRef: ref(r.seat_ref),
    worldId: worldId(text(r.world_id)),
    authSubject: authSubject(text(r.auth_subject)),
    countryId: countryId(text(r.country_id)),
    officeId: office,
    teamId: teamId(text(r.team_id)),
    authorizationRevision: text(r.authorization_revision),
    createdAtReal: timestamp(r.created_at_real),
  });
}
const SEAT_COLUMNS = `seat_ref, world_id, auth_subject::text as auth_subject, country_id, office_id, team_id, authorization_revision,
  to_char(created_at_real at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at_real`;

export class RuntimeReadBindingStore {
  readonly #database: SqlDatabase;
  readonly #publisherRole: string;
  readonly #readerRole: string;
  readonly #opening: WorldOpeningSeedStore;
  constructor(input: {
    readonly database: SqlDatabase;
    readonly authorizationPublisherRole: string;
    readonly runtimeReaderRole: string;
  }) {
    this.#database = input.database;
    this.#publisherRole = role(input.authorizationPublisherRole);
    this.#readerRole = role(input.runtimeReaderRole);
    if (this.#publisherRole === this.#readerRole)
      throw new Error('PUBLISHER_AND_RUNTIME_READER_MUST_BE_SEPARATE');
    this.#opening = new WorldOpeningSeedStore({
      database: input.database,
      sha256Hex: sha,
    });
  }
  async #assertSession(
    executor: SqlExecutor,
    expectedRole: string,
    subject: string,
  ): Promise<void> {
    const result = await executor.query<Row>(
      `select current_user as role_name, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
      exists (select 1 from pg_roles p where p.rolname in ('world_v2_api_reader','world_v2_api_login') and pg_has_role(current_user,p.oid,'MEMBER')) as official_source_member,
      exists (select 1 from pg_roles p where p.rolname=$1 and pg_has_role(current_user,p.oid,'MEMBER')) as publisher_member,
      (has_schema_privilege(current_user,'world_v2','CREATE') or exists (
        select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='world_v2' and c.relkind in ('r','p')
          and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
      )) as unsafe_reader_privileges,
      current_setting('request.jwt.claim.sub', true) as verified_subject
      from pg_roles r where r.rolname = current_user`,
      [this.#publisherRole],
    );
    const r = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !r ||
      r.role_name !== expectedRole ||
      r.rolsuper !== false ||
      r.rolbypassrls !== false ||
      r.rolcreaterole !== false ||
      r.rolcreatedb !== false ||
      r.rolreplication !== false ||
      r.verified_subject !== subject ||
      r.official_source_member !== false ||
      (expectedRole === this.#readerRole &&
        (r.publisher_member !== false || r.unsafe_reader_privileges !== false))
    )
      throw new RuntimeReadBindingStoreError(
        'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED',
      );
  }
  /** Reuses genuine Core authorization, then SQL current facts. Does not assign
   * an Office, publish capabilities/entitlements or accept a caller seat ID. */
  async bindCurrentSeat(input: {
    readonly authorization: AuthorizedOfficeContext;
  }): Promise<Readonly<RuntimeSeatReference>> {
    const current = await reauthorizeOfficeCapability(input.authorization);
    try {
      return await this.#database.transaction(async (tx) => {
        await this.#assertSession(tx, this.#publisherRole, current.authSubject);
        const source = await tx.query<Row>(
          `select country_id, office_id, capability, team_id, authorization_version
        from world_v2.current_commit_authorization
        where world_id = $1 and auth_subject = $2::uuid and active
        order by country_id, office_id, capability for share`,
          [current.worldId, current.authSubject],
        );
        if (
          source.rows.length === 0 ||
          !source.rows.some(
            (r) =>
              r.office_id === current.officeId &&
              r.capability === current.capability,
          ) ||
          source.rows.some(
            (r) =>
              r.country_id !== current.countryId ||
              r.team_id !== current.teamId ||
              r.authorization_version !== current.authorizationVersion,
          )
        )
          throw new RuntimeReadBindingStoreError(
            'CURRENT_AUTHORIZATION_NOT_COHERENT',
          );
        const params = [
          current.worldId,
          current.authSubject,
          current.countryId,
          current.officeId,
          current.teamId,
          current.authorizationVersion,
        ];
        const inserted = await tx.query<Row>(
          `insert into world_v2.runtime_read_seat
        (world_id, auth_subject, country_id, office_id, team_id, authorization_revision)
        values ($1,$2::uuid,$3,$4,$5,$6)
        on conflict (world_id, auth_subject, office_id, authorization_revision) do nothing
        returning ${SEAT_COLUMNS}`,
          params,
        );
        const stored =
          inserted.rows.length === 1
            ? inserted
            : await tx.query<Row>(
                `select ${SEAT_COLUMNS} from world_v2.runtime_read_seat
        where world_id = $1 and auth_subject = $2::uuid and office_id = $3 and authorization_revision = $4`,
                [
                  current.worldId,
                  current.authSubject,
                  current.officeId,
                  current.authorizationVersion,
                ],
              );
        if (stored.rows.length !== 1)
          throw new RuntimeReadBindingStoreError('SEAT_REFERENCE_CONFLICT');
        const s = parseSeat(stored.rows[0]!);
        if (
          s.worldId !== current.worldId ||
          s.authSubject !== current.authSubject ||
          s.countryId !== current.countryId ||
          s.officeId !== current.officeId ||
          s.teamId !== current.teamId ||
          s.authorizationRevision !== current.authorizationVersion
        )
          throw new RuntimeReadBindingStoreError('SEAT_REFERENCE_CONFLICT');
        return s;
      });
    } catch (e) {
      throw sanitizedFailure(e);
    }
  }
  /** Caller owns the coherent read-only transaction, verified subject and GUC.
   * This is reference lookup only, NOT the full binding/entitlement provider. */
  async readCurrentSeatFrom(input: {
    readonly executor: SqlExecutor;
    readonly verifiedSubject: string;
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: string;
  }): Promise<Readonly<RuntimeSeatReference> | null> {
    try {
      const subject = authSubject(input.verifiedSubject),
        world = worldId(input.worldId),
        country = countryId(input.countryId),
        office = officeId(input.officeId);
      if (!CANONICAL_OFFICE_IDS.includes(office)) return null;
      await this.#assertSession(input.executor, this.#readerRole, subject);
      const result = await input.executor.query<Row>(
        `select ${SEAT_COLUMNS} from world_v2.runtime_read_seat s
        where s.world_id = $1 and s.auth_subject = $2::uuid and s.country_id = $3 and s.office_id = $4
          and exists (select 1 from world_v2.current_commit_authorization a
            where a.world_id=s.world_id and a.auth_subject=s.auth_subject and a.country_id=s.country_id
              and a.office_id=s.office_id and a.team_id=s.team_id and a.authorization_version=s.authorization_revision and a.active)
          and not exists (select 1 from world_v2.current_commit_authorization a
            where a.world_id=s.world_id and a.auth_subject=s.auth_subject and a.active
              and (a.country_id is distinct from s.country_id or a.team_id is distinct from s.team_id or a.authorization_version is distinct from s.authorization_revision))`,
        [world, subject, country, office],
      );
      if (result.rows.length !== 1) return null;
      const s = parseSeat(result.rows[0]!);
      return s.worldId === world &&
        s.authSubject === subject &&
        s.countryId === country &&
        s.officeId === office
        ? s
        : null;
    } catch (e) {
      throw sanitizedFailure(e);
    }
  }
  /** Read ONLY: no admission publication method. Actual schema veto is held
   * until a real independent ADMITTED-result publisher exists. Valid seed,
   * source selection/bootstrap/technical approval cannot mint this record. */
  async readImmutableAdmissionFrom(input: {
    readonly executor: SqlExecutor;
    readonly verifiedSubject: string;
    readonly worldId: string;
  }): Promise<Readonly<ImmutableOpeningAdmissionReference> | null> {
    try {
      const subject = authSubject(input.verifiedSubject),
        world = worldId(input.worldId);
      await this.#assertSession(input.executor, this.#readerRole, subject);
      const result = await input.executor.query<Row>(
        `select admission_ref, world_id, seed_id, seed_fingerprint, model_version, replay_binding,
        to_char(admitted_at_real at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as admitted_at_real
        from world_v2.runtime_opening_admission where world_id = $1`,
        [world],
      );
      if (result.rows.length !== 1) return null;
      const r = result.rows[0]!,
        seed = await this.#opening.loadFrom(input.executor, world);
      const replay = canonicalSerialize(seed.replayBinding),
        fingerprint = text(r.seed_fingerprint);
      if (
        r.world_id !== seed.worldId ||
        openingSeedId(text(r.seed_id)) !== seed.seedId ||
        fingerprint !== seed.fingerprint ||
        r.model_version !== seed.replayBinding.modelVersion ||
        r.replay_binding !== replay
      )
        return null;
      return Object.freeze({
        admissionRef: ref(r.admission_ref),
        worldId: seed.worldId,
        seedRef: seed.seedId,
        contentHash: seed.fingerprint,
        modelVersion: seed.replayBinding.modelVersion,
        replayBinding: replay,
        admittedAtReal: timestamp(r.admitted_at_real),
      });
    } catch (e) {
      throw sanitizedFailure(e);
    }
  }
}
