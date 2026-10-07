import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { canonicalSerialize, parseOpeningSeed } from '@econmind/core';
import type { ServerReadBindingPort } from './https-authenticated-read-composition.js';
import { parseSupabaseAuthSubject } from './identity.js';
import { WorldReadFailure } from './transport.js';

export const POSTGRES_READ_BINDING_MISSING_PERSISTED_AUTHORITY = Object.freeze([
  'seatRef',
  'seed.admissionRef',
] as const);
const officeScopeSql = `('OFFICE_' || upper(encode(convert_to(authz.country_id, 'UTF8'), 'hex')) || '_' || upper(encode(convert_to(authz.office_id, 'UTF8'), 'hex')))`;
// The injective scope expression is the SQL equivalent of the existing Worker
// publisher's officePrivateReadProjectionScopeKey, not an HTTP-created grant.
const selectedColumns = `authz.world_id, authz.auth_subject::text,
  authz.country_id, authz.office_id, authz.authorization_version,
  entitlement.classification, entitlement.scope_key,
  projection.schema_version as projection_schema_version,
  projection.world_version::text as projection_world_version,
  projection.event_sequence::text as projection_event_sequence`;
const joins = `join world_v2.projection_entitlement entitlement
  on entitlement.world_id=authz.world_id
  and entitlement.auth_subject=authz.auth_subject
  and entitlement.authorization_version=authz.authorization_version
  and entitlement.active and entitlement.revoked_at is null
join world_v2.read_projection projection
  on projection.world_id=entitlement.world_id
  and projection.classification=entitlement.classification
  and projection.scope_key=entitlement.scope_key`;
export const POSTGRES_PROJECTION_BINDING_FACTS_QUERY = `
select distinct ${selectedColumns}
from world_v2.current_commit_authorization authz
${joins}
where authz.world_id=$2 and authz.auth_subject=$1::uuid
  and authz.active and entitlement.classification=$3 and entitlement.scope_key=$4
  and ((entitlement.classification='COUNTRY' and entitlement.scope_key=authz.country_id)
    or (entitlement.classification='OFFICE_PRIVATE' and entitlement.scope_key=${officeScopeSql}))
limit 2`.trim();
export const POSTGRES_FINAL_BINDING_FACTS_QUERY = `
select distinct ${selectedColumns}, submission.command_id, submission.idempotency_key,
  submission.command_fingerprint
from world_v2.command_submission submission
join world_v2.current_commit_authorization authz
  on authz.world_id=submission.world_id
  and authz.auth_subject=submission.auth_subject
  and authz.country_id=submission.country_id
  and authz.office_id=submission.office_id and authz.active
${joins}
where submission.auth_subject=$1::uuid and submission.world_id=$2
  and submission.command_id=$3 and submission.idempotency_key=$4
  and entitlement.classification='OFFICE_PRIVATE' and entitlement.scope_key=${officeScopeSql}
limit 2`.trim();
export const POSTGRES_OPENING_HEAD_FACTS_QUERY = `
select seed.world_id, seed.seed_id, seed.opening_world_version::text,
  seed.replay_binding, seed.canonical_payload, seed.seed_fingerprint,
  head.world_version::text, head.event_sequence::text
from world_v2.opening_seed seed
join world_v2.world_head head on head.world_id=seed.world_id
where seed.world_id=$1
limit 2`.trim();
export const POSTGRES_BINDING_READER_ROLE_QUERY = `
select current_user as role_name, rolsuper, rolbypassrls
from pg_catalog.pg_roles where rolname=current_user`.trim();

type Request = Parameters<ServerReadBindingPort['resolve']>[0];
export interface ExistingPostgresReadBindingFacts {
  readonly scope: Readonly<{
    authSubject: Request['verifiedSubject'];
    worldId: string;
    countryId: string;
    officeId: string;
    authorizationRevision: string;
    classification: 'COUNTRY' | 'OFFICE_PRIVATE';
    scopeKey: string;
    projectionSchemaVersion: 'world-projection-read-v1';
  }>;
  readonly originalSubmission: Readonly<{
    commandId: string;
    idempotencyKey: string;
    commandFingerprint: string;
  }> | null;
  /** Validated persisted opening lineage, not an admission assertion. */
  readonly opening: Readonly<{
    seedId: string;
    seedFingerprint: string;
    modelVersion: string;
  }>;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
}
export interface PostgresServerReadBindingFactsReader {
  /** Server-only inspection of real existing rows. Never an HTTP binding DTO. */
  inspectExistingFacts(
    input: Request,
  ): Promise<Readonly<ExistingPostgresReadBindingFacts> | null>;
}
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v) &&
  v.length <= 256;
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const version = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(?:0|[1-9]\d*)$/u.test(v) &&
  v.length <= 19 &&
  BigInt(v) <= 9223372036854775807n;
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
const row = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const sha256Hex = (v: string) => createHash('sha256').update(v).digest('hex');
function validRequest(r: Request): boolean {
  try {
    parseSupabaseAuthSubject(r.verifiedSubject);
    return (
      id(r.worldId) &&
      !!r.projectionSelector !== !!r.finalSelector &&
      (r.projectionSelector
        ? ['COUNTRY', 'OFFICE_PRIVATE'].includes(
            r.projectionSelector.classification,
          ) && id(r.projectionSelector.scopeKey)
        : id(r.finalSelector?.commandId) && id(r.finalSelector?.idempotencyKey))
    );
  } catch {
    return false;
  }
}
function mapFacts(
  scopeValue: unknown,
  seedValue: unknown,
  request: Request,
): Readonly<ExistingPostgresReadBindingFacts> | null {
  try {
    const s = row(scopeValue),
      w = row(seedValue);
    if (
      !s ||
      !w ||
      s.auth_subject !== request.verifiedSubject ||
      s.world_id !== request.worldId ||
      w.world_id !== request.worldId ||
      !id(s.country_id) ||
      !id(s.office_id) ||
      !id(s.scope_key) ||
      !text(s.authorization_version) ||
      ![
        'CAPTAIN',
        'FINANCE',
        'CENTRAL_BANK',
        'INDUSTRY',
        'TRADE',
        'SOCIAL',
      ].includes(s.office_id) ||
      !['COUNTRY', 'OFFICE_PRIVATE'].includes(String(s.classification)) ||
      s.projection_schema_version !== 'world-projection-read-v1' ||
      !version(s.projection_world_version) ||
      !version(s.projection_event_sequence) ||
      !version(w.world_version) ||
      !version(w.event_sequence) ||
      BigInt(s.projection_world_version) > BigInt(w.world_version) ||
      BigInt(s.projection_event_sequence) > BigInt(w.event_sequence) ||
      w.opening_world_version !== '0' ||
      !id(w.seed_id) ||
      !hash(w.seed_fingerprint) ||
      typeof w.canonical_payload !== 'string' ||
      typeof w.replay_binding !== 'string'
    )
      return null;
    if (
      request.projectionSelector &&
      (s.classification !== request.projectionSelector.classification ||
        s.scope_key !== request.projectionSelector.scopeKey)
    )
      return null;
    const intent: unknown = JSON.parse(w.canonical_payload),
      replay: unknown = JSON.parse(w.replay_binding);
    if (
      canonicalSerialize(intent) !== w.canonical_payload ||
      canonicalSerialize(replay) !== w.replay_binding ||
      !row(intent)
    )
      return null;
    const seed = parseOpeningSeed(
      { ...row(intent), fingerprint: w.seed_fingerprint },
      sha256Hex,
    );
    if (
      seed.worldId !== w.world_id ||
      seed.seedId !== w.seed_id ||
      canonicalSerialize(seed.replayBinding) !== w.replay_binding ||
      seed.sources.some((source) => source.sourceKind === 'TEST_FIXTURE')
    )
      return null;
    let originalSubmission: ExistingPostgresReadBindingFacts['originalSubmission'] =
      null;
    if (request.finalSelector) {
      if (
        s.command_id !== request.finalSelector.commandId ||
        s.idempotency_key !== request.finalSelector.idempotencyKey ||
        !hash(s.command_fingerprint) ||
        s.classification !== 'OFFICE_PRIVATE'
      )
        return null;
      originalSubmission = Object.freeze({
        commandId: String(s.command_id),
        idempotencyKey: String(s.idempotency_key),
        commandFingerprint: s.command_fingerprint,
      });
    }
    return Object.freeze({
      scope: Object.freeze({
        authSubject: request.verifiedSubject,
        worldId: s.world_id as string,
        countryId: s.country_id,
        officeId: s.office_id,
        authorizationRevision: s.authorization_version,
        classification: s.classification as 'COUNTRY' | 'OFFICE_PRIVATE',
        scopeKey: s.scope_key,
        projectionSchemaVersion: 'world-projection-read-v1',
      }),
      originalSubmission,
      opening: Object.freeze({
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        modelVersion: seed.replayBinding.modelVersion,
      }),
      head: Object.freeze({
        worldVersion: w.world_version,
        eventSequence: w.event_sequence,
      }),
    });
  } catch {
    return null;
  }
}

/**
 * Non-activated managed read pool only. Reuses verified-subject transaction GUC
 * semantics. No pool/credentials/roles/grants/admission/seat IDs are created.
 * Current schema cannot supply the full admitted-seat DTO. This is explicitly
 * a facts reader, not a ServerReadBindingPort or a permanently-null provider.
 */
export function createPostgresServerReadBindingFactsReader(input: {
  readonly pool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
}): Readonly<PostgresServerReadBindingFactsReader> {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(input.readerRole) ||
    [
      'postgres',
      'supabase_admin',
      'service_role',
      'anon',
      'authenticated',
    ].includes(input.readerRole)
  )
    throw new Error('POSTGRES_BINDING_READER_ROLE_REQUIRED');
  async function inspectExistingFacts(
    request: Request,
  ): Promise<Readonly<ExistingPostgresReadBindingFacts> | null> {
    if (request.signal.aborted)
      throw new WorldReadFailure('CANCELLED', 'Binding read cancelled', false);
    if (!validRequest(request)) return null;
    let client: PoolClient | undefined,
      released = false,
      abandoned = false,
      open = false;
    const release = (destroy: boolean) => {
      if (client && !released) {
        released = true;
        client.release(destroy);
      }
    };
    let cancel: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => {
        abandoned = true;
        release(true); // Destroy instead of recycling a client with an in-flight read.
        reject(
          new WorldReadFailure('CANCELLED', 'Binding read cancelled', false),
        );
      };
    });
    const onAbort = () => cancel?.();
    request.signal.addEventListener('abort', onAbort, { once: true });
    const operation = async () => {
      try {
        const acquired = await input.pool.connect();
        if (abandoned || request.signal.aborted) {
          acquired.release(true);
          throw new Error('CANCELLED');
        }
        client = acquired;
        const query = async (sql: string, values?: readonly string[]) => {
          if (abandoned || request.signal.aborted) throw new Error('CANCELLED');
          const result = await acquired.query(
            sql,
            values ? [...values] : undefined,
          );
          if (abandoned || request.signal.aborted) throw new Error('CANCELLED');
          return result;
        };
        await query('begin isolation level repeatable read read only');
        open = true;
        const roles = await query(POSTGRES_BINDING_READER_ROLE_QUERY),
          role = row(roles.rows[0]);
        if (
          roles.rows.length !== 1 ||
          !role ||
          role.role_name !== input.readerRole ||
          role.rolsuper !== false ||
          role.rolbypassrls !== false
        ) {
          await query('rollback');
          open = false;
          return null;
        }
        await query("select set_config('request.jwt.claim.sub', $1, true)", [
          request.verifiedSubject,
        ]);
        await query("select set_config('statement_timeout', '10000', true)");
        const selector = request.projectionSelector ?? request.finalSelector!;
        const parameters = request.projectionSelector
          ? [
              request.verifiedSubject,
              request.worldId,
              request.projectionSelector.classification,
              request.projectionSelector.scopeKey,
            ]
          : [
              request.verifiedSubject,
              request.worldId,
              (selector as NonNullable<Request['finalSelector']>).commandId,
              (selector as NonNullable<Request['finalSelector']>)
                .idempotencyKey,
            ];
        const scoped = await query(
          request.projectionSelector
            ? POSTGRES_PROJECTION_BINDING_FACTS_QUERY
            : POSTGRES_FINAL_BINDING_FACTS_QUERY,
          parameters,
        );
        let facts: Readonly<ExistingPostgresReadBindingFacts> | null = null;
        if (scoped.rows.length === 1) {
          const seeds = await query(POSTGRES_OPENING_HEAD_FACTS_QUERY, [
            request.worldId,
          ]);
          if (seeds.rows.length === 1)
            facts = mapFacts(scoped.rows[0], seeds.rows[0], request);
        }
        await query('commit');
        open = false;
        return facts;
      } catch {
        if (open && client && !released) {
          try {
            await client.query('rollback');
            open = false;
          } catch {
            release(true);
          }
        }
        if (abandoned || request.signal.aborted)
          throw new WorldReadFailure(
            'CANCELLED',
            'Binding read cancelled',
            false,
          );
        throw new WorldReadFailure(
          'UPSTREAM_UNAVAILABLE',
          'Binding database unavailable',
          true,
        );
      } finally {
        release(false);
      }
    };
    try {
      return await Promise.race([operation(), cancelled]);
    } finally {
      request.signal.removeEventListener('abort', onAbort);
    }
  }
  return Object.freeze({ inspectExistingFacts });
}
