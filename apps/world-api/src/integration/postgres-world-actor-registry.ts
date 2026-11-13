/** Server-only identity configuration. No default actors, auth caches, Office
 * capabilities or economic/source admission are created by this reader. */
import { actorId, authSubject, worldId, type ActorId } from '@econmind/core';
import type { Pool, PoolClient } from 'pg';

export const WORLD_ACTOR_BINDING_READ_QUERY =
  'select * from world_v2.read_world_actor_binding($1,$2::uuid)';
export const WORLD_ACTOR_BINDING_PUBLISH_QUERY =
  'select world_v2.publish_world_actor_binding($1,$2::uuid,$3,$4,$5,$6) as binding_ref';
export const WORLD_ACTOR_BINDING_REVOKE_QUERY =
  'select world_v2.revoke_world_actor_binding($1,$2,$3,$4,$5) as revocation_ref';
export const WORLD_ACTOR_READER_SCOPE_PUBLISH_QUERY =
  'select world_v2.publish_world_actor_reader_scope($1,$2,$3::name,$4,$5) as scope_ref';
export const WORLD_ACTOR_READER_SCOPE_REVOKE_QUERY =
  'select world_v2.revoke_world_actor_reader_scope($1,$2,$3,$4,$5) as revocation_ref';
export const WORLD_ACTOR_READER_SESSION_QUERY = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,current_setting('transaction_isolation')as isolation,current_setting('transaction_read_only')as read_only,pg_backend_pid()::text as backend_pid,(select virtualxid::text from pg_locks where pid=pg_backend_pid()and locktype='virtualxid'and granted limit 1)as virtual_xid,pg_has_role(current_user,'world_v2_actor_registry_reader','MEMBER')as reader_member,pg_has_role(current_user,'world_v2_actor_registry_owner','MEMBER')as owner_member,pg_has_role(current_user,'world_v2_actor_registry_publisher','MEMBER')as publisher_member from pg_roles r where r.rolname=current_user`;

export interface WorldActorBindingOriginal {
  readonly worldId: string;
  readonly authSubject: string;
  readonly actorId: string;
  readonly bindingRef: string;
  readonly issuerRef: string;
  readonly originalSha256: string;
}
export interface WorldActorReaderScopeOriginal {
  readonly worldId: string;
  readonly scopeRef: string;
  readonly readerRole: string;
  readonly issuerRef: string;
  readonly originalSha256: string;
}
export interface WorldActorRegistryRevocation {
  readonly worldId: string;
  readonly targetRef: string;
  readonly revocationRef: string;
  readonly issuerRef: string;
  readonly originalSha256: string;
}
const rolePattern = /^[a-z][a-z0-9_]{0,62}$/u;
function ref(value: string) {
  if (typeof value !== 'string' || value.length > 128)
    throw Error('WORLD_ACTOR_REGISTRY_REFERENCE_INVALID');
  return actorId(value);
}
function original(input: { issuerRef: string; originalSha256: string }) {
  ref(input.issuerRef);
  if (!/^[0-9a-f]{64}$/u.test(input.originalSha256))
    throw Error('WORLD_ACTOR_REGISTRY_ORIGINAL_SHA256_REQUIRED');
}
function role(value: string) {
  if (
    !rolePattern.test(value) ||
    [
      'postgres',
      'service_role',
      'supabase_admin',
      'anon',
      'authenticated',
      'world_v2_actor_registry_owner',
      'world_v2_actor_registry_publisher',
      'world_v2_actor_registry_reader',
    ].includes(value)
  )
    throw Error('WORLD_ACTOR_REGISTRY_DISTINCT_SCOPED_LOGIN_ROLE_REQUIRED');
  return value;
}
type Executor = Pick<PoolClient, 'query'>;

/** These are fixed release-operator calls, not public routes. SQL independently
 * enforces the separated publisher role. Explicit original hashes are audit
 * provenance, not a substitute for that controlled publisher or user approval. */
export async function publishWorldActorBindingFrom(
  executor: Executor,
  input: WorldActorBindingOriginal,
): Promise<string> {
  original(input);
  ref(input.bindingRef);
  ref(input.actorId);
  worldId(input.worldId);
  const rows = await executor.query(WORLD_ACTOR_BINDING_PUBLISH_QUERY, [
    input.worldId,
    authSubject(input.authSubject),
    input.actorId,
    input.bindingRef,
    input.issuerRef,
    input.originalSha256,
  ]);
  if (rows.rows.length !== 1 || rows.rows[0]?.binding_ref !== input.bindingRef)
    throw Error('WORLD_ACTOR_REGISTRY_PUBLISH_RESULT_INVALID');
  return input.bindingRef;
}
export async function publishWorldActorReaderScopeFrom(
  executor: Executor,
  input: WorldActorReaderScopeOriginal,
): Promise<string> {
  original(input);
  ref(input.scopeRef);
  worldId(input.worldId);
  role(input.readerRole);
  const rows = await executor.query(WORLD_ACTOR_READER_SCOPE_PUBLISH_QUERY, [
    input.worldId,
    input.scopeRef,
    input.readerRole,
    input.issuerRef,
    input.originalSha256,
  ]);
  if (rows.rows.length !== 1 || rows.rows[0]?.scope_ref !== input.scopeRef)
    throw Error('WORLD_ACTOR_REGISTRY_SCOPE_PUBLISH_RESULT_INVALID');
  return input.scopeRef;
}
export async function revokeWorldActorRegistryFrom(
  executor: Executor,
  kind: 'BINDING' | 'READER_SCOPE',
  input: WorldActorRegistryRevocation,
): Promise<string> {
  original(input);
  worldId(input.worldId);
  ref(input.targetRef);
  ref(input.revocationRef);
  if (kind !== 'BINDING' && kind !== 'READER_SCOPE')
    throw Error('WORLD_ACTOR_REGISTRY_REVOCATION_KIND_INVALID');
  const rows = await executor.query(
    kind === 'BINDING'
      ? WORLD_ACTOR_BINDING_REVOKE_QUERY
      : WORLD_ACTOR_READER_SCOPE_REVOKE_QUERY,
    [
      input.worldId,
      input.targetRef,
      input.revocationRef,
      input.issuerRef,
      input.originalSha256,
    ],
  );
  if (
    rows.rows.length !== 1 ||
    rows.rows[0]?.revocation_ref !== input.revocationRef
  )
    throw Error('WORLD_ACTOR_REGISTRY_REVOKE_RESULT_INVALID');
  return input.revocationRef;
}

export interface PostgresWorldActorResolver {
  readonly worldId: string;
  readonly readerRole: string;
  /** Input must come from the verified JWT subject at the existing API boundary.
   * Identity alone does not authorize a command; existing cutoff must still run. */
  resolveActorId(subject: string): Promise<ActorId | null>;
}
const resolvers = new WeakMap<object, string>();
export function isPostgresWorldActorResolver(
  input: unknown,
  expectedWorldId: string,
): input is Readonly<PostgresWorldActorResolver> {
  return (
    typeof input === 'object' &&
    input !== null &&
    resolvers.get(input) === expectedWorldId
  );
}
export function createPostgresWorldActorResolver(input: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly worldId: string;
  readonly readerRole: string;
}): Readonly<PostgresWorldActorResolver> {
  const configuredWorld = worldId(input.worldId);
  const configuredRole = role(input.readerRole);
  const pool = input.pool;
  async function session(client: PoolClient) {
    const result = await client.query<Record<string, unknown>>(
      WORLD_ACTOR_READER_SESSION_QUERY,
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.role_name !== configuredRole ||
      row.reader_member !== true ||
      row.read_only !== 'on' ||
      !['repeatable read', 'serializable'].includes(String(row.isolation)) ||
      [
        row.rolsuper,
        row.rolbypassrls,
        row.rolcreatedb,
        row.rolcreaterole,
        row.rolreplication,
        row.owner_member,
        row.publisher_member,
      ].some((v) => v !== false) ||
      typeof row.backend_pid !== 'string' ||
      !/^[1-9]\d*$/u.test(row.backend_pid) ||
      typeof row.virtual_xid !== 'string' ||
      !/^\d+\/\d+$/u.test(row.virtual_xid)
    )
      throw Error('WORLD_ACTOR_REGISTRY_EXACT_STABLE_LOW_READER_REQUIRED');
    return `${row.backend_pid}:${row.virtual_xid}`;
  }
  const resolver: Readonly<PostgresWorldActorResolver> = Object.freeze({
    worldId: configuredWorld,
    readerRole: configuredRole,
    async resolveActorId(subject: string): Promise<ActorId | null> {
      const verifiedSubject = authSubject(subject);
      const client = await pool.connect();
      let open = false;
      let result: ActorId | null = null;
      let failure: unknown;
      let failed = false;
      let rollbackFailed = false;
      const cleanup: unknown[] = [];
      try {
        await client.query('begin isolation level repeatable read read only');
        open = true;
        const before = await session(client);
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,true)",
          [verifiedSubject],
        );
        const row = await client.query<Record<string, unknown>>(
          WORLD_ACTOR_BINDING_READ_QUERY,
          [configuredWorld, verifiedSubject],
        );
        if (row.rows.length > 1)
          throw Error('WORLD_ACTOR_REGISTRY_DUPLICATE_ACTIVE_BINDING');
        const binding = row.rows[0];
        if (binding) {
          if (
            binding.world_id !== configuredWorld ||
            binding.auth_subject !== verifiedSubject ||
            typeof binding.actor_id !== 'string' ||
            typeof binding.binding_ref !== 'string' ||
            typeof binding.issuer_ref !== 'string' ||
            typeof binding.original_sha256 !== 'string'
          )
            throw Error('WORLD_ACTOR_REGISTRY_ACTUAL_ROW_SCOPE_INVALID');
          ref(binding.binding_ref);
          original({
            issuerRef: binding.issuer_ref,
            originalSha256: binding.original_sha256,
          });
          result = ref(binding.actor_id);
        }
        if ((await session(client)) !== before)
          throw Error('WORLD_ACTOR_REGISTRY_TRANSACTION_CHANGED');
        await client.query('commit');
        open = false;
      } catch (error) {
        failed = true;
        failure = error;
        if (open) {
          try {
            await client.query('rollback');
          } catch (rollbackError) {
            cleanup.push(rollbackError);
            rollbackFailed = true;
          }
        }
      } finally {
        try {
          client.release(
            rollbackFailed
              ? new Error('WORLD_ACTOR_REGISTRY_ROLLBACK_FAILED')
              : undefined,
          );
        } catch (releaseError) {
          cleanup.push(releaseError);
        }
      }
      if (cleanup.length)
        throw new AggregateError(
          failed ? [failure, ...cleanup] : cleanup,
          'WORLD_ACTOR_REGISTRY_CLEANUP_FAILED',
          failed ? { cause: failure } : undefined,
        );
      if (failed) throw failure;
      return result;
    },
  });
  resolvers.set(resolver, configuredWorld);
  return resolver;
}
