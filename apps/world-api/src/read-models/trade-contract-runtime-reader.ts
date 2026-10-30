import { createHash } from 'node:crypto';
import {
  parseSupabaseAuthSubject,
  type SupabaseAuthSubject,
} from '../integration/identity.js';
import type { ParameterizedPgReadExecutor } from '../integration/postgres-read-adapter.js';

/** Durable, read-only own-submission evidence. Not a contract execution model,
 * numeric-result grant, route registration or source-admission assertion.
 * Existing postings have deltas, not the before/after facts required by the
 * preparation projection. Current party membership has no contract linkage.
 */
export const TRADE_CONTRACT_RUNTIME_READ_SCHEMA =
  'trade-committed-evidence-read-v1' as const;
export const TRADE_CONTRACT_RUNTIME_READ_COVERAGE = Object.freeze({
  contractResults: 'UNAVAILABLE_NO_PERSISTED_CONTRACT_MODEL',
  numericResults: 'NOT_AUTHORIZED',
  teamScope: 'CURRENT_AND_IMMUTABLE_COMMIT_AUTHORIZATION_MATCH',
  partyContractBinding: 'UNAVAILABLE',
} as const);

/** Resolved by a signature-verifying server handler, never from request JSON.
 * SQL independently rechecks every field against current persisted sources. */
export interface ServerTradeContractRuntimeScope {
  readonly authSubject: SupabaseAuthSubject;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: 'TRADE';
  readonly teamId: string;
  readonly authorizationRevision: string;
  readonly classification: 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY';
  readonly scopeKey: string;
}
export interface TradeRuntimeWatermark {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface TradeRuntimeCursor {
  readonly scopeFingerprint: string;
  readonly watermark: TradeRuntimeWatermark;
  readonly after: { readonly worldVersion: string; readonly commandId: string };
}
export interface TradeContractRuntimePageRequest {
  readonly limit?: number;
  readonly cursor?: TradeRuntimeCursor;
}
export interface TradeRuntimeEventReference {
  readonly eventId: string;
  readonly eventSequence: string;
  readonly eventFingerprint: string;
}
export interface TradeRuntimePostingReference {
  readonly kind: 'INVENTORY' | 'FINANCIAL';
  readonly postingId: string;
  readonly fingerprint: string;
}
export interface TradeRuntimeCommittedEvidence {
  readonly worldId: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly idempotencyKey: string | null;
  readonly outcome: 'COMMITTED';
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly events: readonly TradeRuntimeEventReference[];
  readonly ledger: Readonly<{
    status: 'REFERENCES_ONLY' | 'UNAVAILABLE_NO_POSTINGS';
    postings: readonly TradeRuntimePostingReference[];
  }>;
}
type ReadFailureStatus =
  'DENIED' | 'UNAVAILABLE' | 'STALE' | 'INVALID_REQUEST' | 'CANCELLED';
export type TradeContractRuntimePage = Readonly<{
  schemaVersion: typeof TRADE_CONTRACT_RUNTIME_READ_SCHEMA;
  coverage: typeof TRADE_CONTRACT_RUNTIME_READ_COVERAGE;
}> &
  (
    | Readonly<{
        status: 'PAGE' | 'EMPTY';
        watermark: TradeRuntimeWatermark;
        rows: readonly TradeRuntimeCommittedEvidence[];
        nextCursor: TradeRuntimeCursor | null;
      }>
    | Readonly<{
        status: ReadFailureStatus;
        reason: string;
        watermark: null;
        rows: readonly [];
        nextCursor: null;
      }>
  );

// One MVCC statement binds authorization, head, receipts, events and postings.
// A managed, read-only executor owns role/RLS/transaction/cancellation. The
// existing two-query runtime executor deliberately does not auto-allow this SQL.
export const TRADE_CONTRACT_RUNTIME_READ_QUERY = `
with current_scope as (
  select exists (
    select 1 from world_v2.current_commit_authorization authz
    join world_v2.projection_entitlement entitlement
      on entitlement.world_id=authz.world_id
      and entitlement.auth_subject=authz.auth_subject
      and entitlement.authorization_version=authz.authorization_version
      and entitlement.active and entitlement.revoked_at is null
    where authz.world_id=$1 and authz.auth_subject=$2::uuid
      and authz.country_id=$3 and authz.office_id='TRADE'
      and authz.team_id=$4 and authz.authorization_version=$5
      and authz.capability='TRADE_CONTRACTS' and authz.active
      and entitlement.classification=$6 and entitlement.scope_key=$7
      and (($6='OFFICE_PRIVATE' and $7=(
        'OFFICE_' || upper(encode(convert_to(authz.country_id,'UTF8'),'hex')) || '_5452414445'))
        or ($6='NEGOTIATION_PARTY' and exists (
          select 1 from world_v2.current_negotiation_party_membership party
          where party.world_id=authz.world_id and party.party_id=$7
            and party.auth_subject=authz.auth_subject and party.country_id=authz.country_id
            and party.office_id=authz.office_id
            and party.authorization_version=authz.authorization_version and party.active
        )))
  ) as allowed
), guarded_head as (
  select head.world_id, head.world_version, head.event_sequence,
    case when not current_scope.allowed then 'DENIED'
      when $6='NEGOTIATION_PARTY' then 'PARTY_UNAVAILABLE'
      when nullif($9,'') is not null and
        (head.world_version<>nullif($9,'')::bigint or head.event_sequence<>nullif($10,'')::bigint)
        then 'STALE'
      else 'READY' end as state
  from world_v2.world_head head cross join current_scope where head.world_id=$1
), selected_receipts as (
  select receipt.*, audit.world_id as audit_world_id, audit.command_id as audit_command_id,
    audit.authority_kind as audit_authority_kind, audit.auth_subject::text as audit_auth_subject,
    audit.country_id as audit_country_id, audit.office_id as audit_office_id,
    audit.capability as audit_capability, audit.team_id as audit_team_id,
    audit.authorization_version as audit_authorization_version
  from world_v2.command_receipt receipt
  join world_v2.command_submission submission
    on submission.world_id=receipt.world_id and submission.command_id=receipt.command_id
    and submission.command_fingerprint=receipt.command_fingerprint
    and submission.idempotency_key is not distinct from receipt.idempotency_key
  join guarded_head head on head.world_id=receipt.world_id and head.state='READY'
  left join world_v2.authoritative_commit_authorization audit
    on audit.world_id=receipt.world_id and audit.command_id=receipt.command_id
  where submission.auth_subject=$2::uuid and submission.country_id=$3
    and submission.office_id='TRADE' and receipt.outcome='COMMITTED'
    and (audit.world_id is null or audit.team_id=$4)
    and receipt.world_version_after<=head.world_version
    and (nullif($11,'') is null or receipt.world_version_after>nullif($11,'')::bigint
      or (receipt.world_version_after=nullif($11,'')::bigint
        and receipt.command_id collate "C">$12 collate "C"))
  order by receipt.world_version_after, receipt.command_id collate "C" limit $8::integer
)
select head.state,
  case when head.state='READY' then head.world_version::text else null end as world_version,
  case when head.state='READY' then head.event_sequence::text else null end as event_sequence,
  coalesce((select jsonb_agg(jsonb_build_object(
    'worldId',receipt.world_id,'commandId',receipt.command_id,
    'commandFingerprint',receipt.command_fingerprint,'idempotencyKey',receipt.idempotency_key,
    'outcome',receipt.outcome,'transitionId',receipt.transition_id,
    'worldVersionBefore',receipt.world_version_before::text,
    'worldVersionAfter',receipt.world_version_after::text,'eventIds',receipt.event_ids,
    'commitAuthorization',case when receipt.audit_world_id is null then null else jsonb_build_object(
      'worldId',receipt.audit_world_id,'commandId',receipt.audit_command_id,
      'authorityKind',receipt.audit_authority_kind,'authSubject',receipt.audit_auth_subject,
      'countryId',receipt.audit_country_id,'officeId',receipt.audit_office_id,
      'capability',receipt.audit_capability,'teamId',receipt.audit_team_id,
      'authorizationRevision',receipt.audit_authorization_version) end,
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'eventId',event.event_id,'eventSequence',event.event_sequence::text,
      'eventFingerprint',event.event_fingerprint,'worldVersion',event.world_version::text)
      order by event.event_sequence)
      from world_v2.authoritative_event event where event.world_id=receipt.world_id
        and event.causation_command_id=receipt.transition_id
        and event.world_version=receipt.world_version_after),'[]'::jsonb),
    'postings',coalesce((select jsonb_agg(posting.payload order by posting.kind, posting.id collate "C")
      from (
        select 'INVENTORY' as kind, posting_id as id, jsonb_build_object(
          'kind','INVENTORY','postingId',posting_id,'fingerprint',posting_fingerprint,
          'worldVersionBefore',world_version_before::text,
          'worldVersionAfter',world_version_after::text,'eventIds',event_ids) as payload
        from world_v2.inventory_posting where world_id=receipt.world_id
          and causation_command_id=receipt.command_id
        union all
        select 'FINANCIAL',batch_id,jsonb_build_object(
          'kind','FINANCIAL','postingId',batch_id,'fingerprint',batch_fingerprint,
          'worldVersionBefore',world_version_before::text,
          'worldVersionAfter',world_version_after::text,'eventIds',event_ids)
        from world_v2.financial_posting_batch where world_id=receipt.world_id
          and causation_command_id=receipt.command_id
      ) posting),'[]'::jsonb)
  ) order by receipt.world_version_after,receipt.command_id collate "C")
  from selected_receipts receipt),'[]'::jsonb) as receipts
from guarded_head head
`.trim();

const ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const VERSION = /^(?:0|[1-9]\d*)$/u;
const MAX_BIGINT = 9223372036854775807n;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('INVALID_OBJECT');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw Error('INVALID_KEYS');
}
function id(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256 || !ID.test(value))
    throw Error('INVALID_ID');
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !HASH.test(value))
    throw Error('INVALID_HASH');
  return value;
}
function version(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 19 ||
    !VERSION.test(value) ||
    BigInt(value) > MAX_BIGINT
  )
    throw Error('INVALID_VERSION');
  return value;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw Error('INVALID_ARRAY');
  return value;
}
function watermark(value: unknown): TradeRuntimeWatermark {
  const row = record(value);
  exact(row, ['worldVersion', 'eventSequence']);
  return Object.freeze({
    worldVersion: version(row.worldVersion),
    eventSequence: version(row.eventSequence),
  });
}
const base = () => ({
  schemaVersion: TRADE_CONTRACT_RUNTIME_READ_SCHEMA,
  coverage: TRADE_CONTRACT_RUNTIME_READ_COVERAGE,
});
function failure(
  status: ReadFailureStatus,
  reason: string,
): TradeContractRuntimePage {
  return Object.freeze({
    ...base(),
    status,
    reason,
    watermark: null,
    rows: Object.freeze([]) as readonly [],
    nextCursor: null,
  });
}
function scopeIdentity(scope: ServerTradeContractRuntimeScope): string {
  parseSupabaseAuthSubject(scope.authSubject);
  for (const value of [
    scope.worldId,
    scope.countryId,
    scope.teamId,
    scope.scopeKey,
  ])
    id(value);
  if (
    scope.officeId !== 'TRADE' ||
    !['OFFICE_PRIVATE', 'NEGOTIATION_PARTY'].includes(scope.classification) ||
    typeof scope.authorizationRevision !== 'string' ||
    scope.authorizationRevision.length === 0 ||
    scope.authorizationRevision.length > 256 ||
    scope.authorizationRevision.trim() !== scope.authorizationRevision
  )
    throw Error('INVALID_SCOPE');
  if (
    scope.classification === 'OFFICE_PRIVATE' &&
    scope.scopeKey !==
      `OFFICE_${Buffer.from(scope.countryId).toString('hex').toUpperCase()}_5452414445`
  )
    throw Error('INVALID_OFFICE_SCOPE');
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify([
        scope.authSubject,
        scope.worldId,
        scope.countryId,
        scope.officeId,
        scope.teamId,
        scope.authorizationRevision,
        scope.classification,
        scope.scopeKey,
      ]),
    )
    .digest('hex')}`;
}
function parseReceipt(
  value: unknown,
  scope: ServerTradeContractRuntimeScope,
  head: TradeRuntimeWatermark,
): TradeRuntimeCommittedEvidence {
  const worldId = scope.worldId;
  const r = record(value);
  exact(r, [
    'worldId',
    'commandId',
    'commandFingerprint',
    'idempotencyKey',
    'outcome',
    'transitionId',
    'worldVersionBefore',
    'worldVersionAfter',
    'eventIds',
    'events',
    'postings',
    'commitAuthorization',
  ]);
  const commandId = id(r.commandId),
    before = version(r.worldVersionBefore),
    after = version(r.worldVersionAfter);
  if (
    r.worldId !== worldId ||
    r.outcome !== 'COMMITTED' ||
    r.transitionId !== commandId ||
    BigInt(after) !== BigInt(before) + 1n ||
    BigInt(after) > BigInt(head.worldVersion)
  )
    throw Error('INVALID_RECEIPT');
  if (r.commitAuthorization === null)
    throw Error('COMMIT_AUTHORIZATION_UNAVAILABLE');
  const audit = record(r.commitAuthorization);
  exact(audit, [
    'worldId',
    'commandId',
    'authorityKind',
    'authSubject',
    'countryId',
    'officeId',
    'capability',
    'teamId',
    'authorizationRevision',
  ]);
  if (
    audit.worldId !== worldId ||
    audit.commandId !== commandId ||
    audit.authorityKind !== 'DISCRETIONARY_USER' ||
    audit.authSubject !== scope.authSubject ||
    audit.countryId !== scope.countryId ||
    audit.officeId !== 'TRADE' ||
    audit.capability !== 'TRADE_CONTRACTS' ||
    audit.teamId !== scope.teamId ||
    typeof audit.authorizationRevision !== 'string' ||
    !audit.authorizationRevision.length
  )
    throw Error('INVALID_COMMIT_AUTHORIZATION');
  const eventIds = array(r.eventIds).map(id);
  if (!eventIds.length || new Set(eventIds).size !== eventIds.length)
    throw Error('INVALID_EVENT_SET');
  let sequence = 0n;
  const events = array(r.events).map((value, index) => {
    const e = record(value);
    exact(e, ['eventId', 'eventSequence', 'eventFingerprint', 'worldVersion']);
    const eventId = id(e.eventId),
      eventSequence = version(e.eventSequence);
    if (
      eventId !== eventIds[index] ||
      e.worldVersion !== after ||
      BigInt(eventSequence) <= sequence ||
      BigInt(eventSequence) > BigInt(head.eventSequence)
    )
      throw Error('INVALID_EVENT_LINKAGE');
    sequence = BigInt(eventSequence);
    return Object.freeze({
      eventId,
      eventSequence,
      eventFingerprint: hash(e.eventFingerprint),
    });
  });
  if (events.length !== eventIds.length) throw Error('MISSING_EVENT');
  const postingKeys = new Set();
  const postings = array(r.postings).map((value) => {
    const p = record(value);
    exact(p, [
      'kind',
      'postingId',
      'fingerprint',
      'worldVersionBefore',
      'worldVersionAfter',
      'eventIds',
    ]);
    if (p.kind !== 'INVENTORY' && p.kind !== 'FINANCIAL')
      throw Error('INVALID_POSTING_KIND');
    const postingId = id(p.postingId),
      key = `${p.kind}:${postingId}`;
    if (
      postingKeys.has(key) ||
      p.worldVersionBefore !== before ||
      p.worldVersionAfter !== after ||
      JSON.stringify(p.eventIds) !== JSON.stringify(eventIds)
    )
      throw Error('INVALID_POSTING_LINKAGE');
    postingKeys.add(key);
    return Object.freeze({
      kind: p.kind,
      postingId,
      fingerprint: hash(p.fingerprint),
    });
  });
  return Object.freeze({
    worldId,
    commandId,
    commandFingerprint: hash(r.commandFingerprint),
    idempotencyKey: r.idempotencyKey === null ? null : id(r.idempotencyKey),
    outcome: 'COMMITTED',
    worldVersionBefore: before,
    worldVersionAfter: after,
    events: Object.freeze(events),
    ledger: Object.freeze({
      status: postings.length ? 'REFERENCES_ONLY' : 'UNAVAILABLE_NO_POSTINGS',
      postings: Object.freeze(postings),
    }),
  });
}

/** No connection startup, arbitrary query input, writes, retries or raw ledger
 * disclosure. EMPTY means an authorized snapshot contained no own committed
 * receipts; missing tables, malformed facts and transport errors never mean EMPTY. */
export async function readTradeContractRuntimePage(input: {
  readonly executor: ParameterizedPgReadExecutor;
  readonly scope: ServerTradeContractRuntimeScope;
  readonly page?: TradeContractRuntimePageRequest;
  readonly signal?: AbortSignal;
}): Promise<TradeContractRuntimePage> {
  let scope: ServerTradeContractRuntimeScope, scopeFingerprint: string;
  try {
    scope = Object.freeze({ ...input.scope });
    scopeFingerprint = scopeIdentity(scope);
  } catch {
    return failure('DENIED', 'SERVER_SCOPE_INVALID');
  }
  let limit: number, cursor: TradeRuntimeCursor | undefined;
  try {
    const page = record(input.page ?? {});
    if (Object.keys(page).some((key) => !['limit', 'cursor'].includes(key)))
      throw Error('INVALID_PAGE');
    limit = page.limit === undefined ? 20 : (page.limit as number);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw Error('INVALID_LIMIT');
    if (page.cursor !== undefined) {
      const c = record(page.cursor);
      exact(c, ['scopeFingerprint', 'watermark', 'after']);
      if (c.scopeFingerprint !== scopeFingerprint)
        throw Error('CURSOR_SCOPE_MISMATCH');
      const w = watermark(c.watermark),
        a = record(c.after);
      exact(a, ['worldVersion', 'commandId']);
      const after = Object.freeze({
        worldVersion: version(a.worldVersion),
        commandId: id(a.commandId),
      });
      if (
        BigInt(after.worldVersion) < 1n ||
        BigInt(after.worldVersion) > BigInt(w.worldVersion)
      )
        throw Error('INVALID_CURSOR');
      cursor = Object.freeze({ scopeFingerprint, watermark: w, after });
    }
  } catch {
    return failure('INVALID_REQUEST', 'PAGE_OR_CURSOR_INVALID');
  }
  if (input.signal?.aborted) return failure('CANCELLED', 'READ_CANCELLED');
  let result: Awaited<ReturnType<ParameterizedPgReadExecutor['query']>>;
  let cancel: () => void = () => undefined;
  try {
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(Error('CANCELLED'));
      input.signal?.addEventListener('abort', cancel, { once: true });
    });
    result = await Promise.race([
      input.executor.query({
        text: TRADE_CONTRACT_RUNTIME_READ_QUERY,
        values: Object.freeze([
          scope.worldId,
          scope.authSubject,
          scope.countryId,
          scope.teamId,
          scope.authorizationRevision,
          scope.classification,
          scope.scopeKey,
          String(limit + 1),
          cursor?.watermark.worldVersion ?? '',
          cursor?.watermark.eventSequence ?? '',
          cursor?.after.worldVersion ?? '',
          cursor?.after.commandId ?? '',
        ]),
        verifiedAuthSubject: scope.authSubject,
        ...(input.signal ? { signal: input.signal } : {}),
      }),
      cancelled,
    ]);
  } catch {
    return input.signal?.aborted
      ? failure('CANCELLED', 'READ_CANCELLED')
      : failure('UNAVAILABLE', 'DATABASE_UNAVAILABLE');
  } finally {
    input.signal?.removeEventListener('abort', cancel);
  }
  if (input.signal?.aborted) return failure('CANCELLED', 'READ_CANCELLED');
  try {
    if (!Array.isArray(result.rows)) throw Error('INVALID_RESULT');
    if (result.rows.length === 0)
      return failure('UNAVAILABLE', 'WORLD_HEAD_UNAVAILABLE');
    if (
      result.rows.length !== 1 ||
      Buffer.byteLength(JSON.stringify(result.rows)) > 1048576
    )
      throw Error('INVALID_ENVELOPE');
    const row = record(result.rows[0]);
    exact(row, ['state', 'world_version', 'event_sequence', 'receipts']);
    if (row.state === 'DENIED')
      return failure('DENIED', 'CURRENT_SCOPE_NOT_AUTHORIZED');
    if (row.state === 'PARTY_UNAVAILABLE')
      return failure('UNAVAILABLE', 'PARTY_CONTRACT_FACTS_UNAVAILABLE');
    if (row.state === 'STALE') return failure('STALE', 'PAGE_HEAD_CHANGED');
    if (row.state !== 'READY') throw Error('INVALID_STATE');
    const head = watermark({
      worldVersion: row.world_version,
      eventSequence: row.event_sequence,
    });
    if (cursor && JSON.stringify(head) !== JSON.stringify(cursor.watermark))
      return failure('STALE', 'PAGE_HEAD_CHANGED');
    const receipts = array(row.receipts);
    if (receipts.length > limit + 1) throw Error('UNBOUNDED_PAGE');
    let previous = cursor?.after;
    const all = receipts.map((value) => {
      const r = parseReceipt(value, scope, head);
      if (
        previous &&
        (BigInt(r.worldVersionAfter) < BigInt(previous.worldVersion) ||
          (r.worldVersionAfter === previous.worldVersion &&
            r.commandId <= previous.commandId))
      )
        throw Error('INVALID_PAGE_ORDER');
      previous = { worldVersion: r.worldVersionAfter, commandId: r.commandId };
      return r;
    });
    const rows = Object.freeze(all.slice(0, limit)),
      last = rows.at(-1);
    const nextCursor =
      all.length > limit && last
        ? Object.freeze({
            scopeFingerprint,
            watermark: head,
            after: Object.freeze({
              worldVersion: last.worldVersionAfter,
              commandId: last.commandId,
            }),
          })
        : null;
    return Object.freeze({
      ...base(),
      status: rows.length ? 'PAGE' : 'EMPTY',
      watermark: head,
      rows,
      nextCursor,
    });
  } catch (error) {
    return failure(
      'UNAVAILABLE',
      error instanceof Error &&
        error.message === 'COMMIT_AUTHORIZATION_UNAVAILABLE'
        ? 'COMMIT_AUTHORIZATION_UNAVAILABLE'
        : 'DURABLE_EVIDENCE_INVALID',
    );
  }
}
