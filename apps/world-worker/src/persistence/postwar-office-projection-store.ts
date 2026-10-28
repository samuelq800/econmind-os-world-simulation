/** Online bounded metadata/pages only. No full-seed validator or preparation import. */
import { createHash } from 'node:crypto';
import { worldId, countryId } from '@econmind/core';
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_PROJECTION_ROWS_TEXT_MAX = 48000;
export const POSTWAR_PROJECTION_RESPONSE_MAX = 65536;
export const POSTWAR_PROJECTION_PAGE_QUERY =
  'select * from world_v2.read_postwar_office_projection_page($1,$2,$3,$4,$5,$6)';
export const POSTWAR_PROJECTION_SEATS_QUERY =
  'select * from world_v2.read_postwar_office_projection_seats($1)';
export const POSTWAR_PROJECTION_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_office_projection($1,$2,$3,$4,$5,$6,$7,$8)';
export const POSTWAR_PROJECTION_DATASETS = Object.freeze({
  SOCIAL: ['positions', 'service-pools', 'offers', 'minimum-wage'],
  FINANCE: ['currency-fx', 'opening-financial-legs'],
  CENTRAL_BANK: [
    'currency-fx',
    'cb-categories',
    'cb-holdings',
    'bank-loans',
    'opening-financial-legs',
  ],
  INDUSTRY: ['opening-inventory-entries', 'regional-source-capacity'],
  TRADE: ['opening-inventory-entries'],
  CAPTAIN: ['regional-source-capacity', 'public-service-summary'],
} as const);
export type PostwarProjectionOffice = keyof typeof POSTWAR_PROJECTION_DATASETS;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const denied = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === '42501';
type Row = Readonly<Record<string, unknown>>;
export class PostwarOfficeProjectionStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function invalid(s: string): never {
  throw new PostwarOfficeProjectionStoreError(s);
}
function text(v: unknown, max = 256): string {
  if (typeof v !== 'string' || !v || v.trim() !== v || v.length > max)
    invalid('INVALID_PROJECTION_METADATA');
  return v;
}
function role(v: string) {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(v) ||
    [
      'anon',
      'authenticated',
      'service_role',
      'world_v2_api_reader',
      'world_v2_api_login',
    ].includes(v)
  )
    invalid('INVALID_READER_ROLE');
  return v;
}
function obj(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('INVALID_PROJECTION_METADATA');
  return v as Row;
}
function integer(v: unknown): string {
  const s = text(v);
  if (!/^(?:0|[1-9]\d*)$/u.test(s)) invalid('INVALID_PROJECTION_HEAD');
  return s;
}
function count(v: unknown): number {
  if (!Number.isSafeInteger(v) || Number(v) < 0)
    invalid('INVALID_PROJECTION_METADATA');
  return Number(v);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export interface PostwarOfficeProjectionScope {
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: PostwarProjectionOffice;
  readonly authSubject: string;
  readonly teamId: string;
  readonly authorizationVersion: string;
  readonly scopeKey: string;
  readonly seatRef: string;
}
export interface PostwarOfficeProjectionSource {
  readonly sourceVersion: string;
  readonly sourceRevision: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly modelVersion: string;
  readonly replayBinding: string;
  readonly sourceBundleSha256: string;
  readonly canonicalSeedSha256: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly pageHash: string;
  readonly returnedRowsHash: string;
  readonly hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256';
  readonly sourcePointer: Row;
  readonly dataNature:
    | 'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY'
    | 'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION';
  readonly currentStateBinding?: Readonly<{
    sourceCommandId: string;
    commandFingerprint: string;
    sourceEventId: string;
    eventFingerprint: string;
    materializationKey: string;
    materializationHash: string;
    canonicalMaterializationSha256: string;
    sourceStateWorldVersion: string;
    sourceEventSequence: string;
  }>;
}
export interface PostwarOfficeProjectionSeatHeader {
  readonly scope: PostwarOfficeProjectionScope;
  readonly source: Readonly<{
    admissionRef: string;
    seedId: string;
    seedFingerprint: string;
    modelVersion: string;
    replayBinding: string;
    sourceBundleSha256: string;
    worldVersion: string;
    eventSequence: string;
  }>;
}
export type PostwarOfficeProjectionPage =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      scope: PostwarOfficeProjectionScope;
      source: PostwarOfficeProjectionSource;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly unknown[];
    }>
  | Readonly<{ status: 'STALE' | 'DENIED' | 'UNAVAILABLE'; code: string }>;
function office(v: string): PostwarProjectionOffice {
  if (!Object.hasOwn(POSTWAR_PROJECTION_DATASETS, v))
    invalid('INVALID_OFFICE_DATASET');
  return v as PostwarProjectionOffice;
}
function dataset(o: PostwarProjectionOffice, v: string) {
  if (!(POSTWAR_PROJECTION_DATASETS[o] as readonly string[]).includes(v))
    invalid('INVALID_OFFICE_DATASET');
  return v;
}
function scope(
  v: Row,
  expectedWorld: string,
  expectedSubject: string,
): PostwarOfficeProjectionScope {
  const value = {
    worldId: text(v.worldId),
    countryId: text(v.countryId),
    officeId: office(text(v.officeId)),
    authSubject: text(v.authSubject),
    teamId: text(v.teamId),
    authorizationVersion: text(v.authorizationVersion),
    scopeKey: text(v.scopeKey),
    seatRef: text(v.seatRef),
  };
  if (
    value.worldId !== expectedWorld ||
    value.authSubject !== expectedSubject ||
    !/^OFFICE_[0-9A-F]+_[0-9A-F]+$/u.test(value.scopeKey)
  )
    invalid('PROJECTION_SCOPE_MISMATCH');
  countryId(value.countryId);
  return freeze(value);
}
function validSourceHead(
  source: Row,
  o: PostwarProjectionOffice,
  d: string,
  country: string,
): boolean {
  const version = integer(source.worldVersion),
    sequence = integer(source.eventSequence);
  if (source.dataNature === 'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY')
    return (
      version === '0' &&
      sequence === '0' &&
      source.currentStateBinding === undefined
    );
  if (
    source.dataNature !==
      'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION' ||
    o !== 'SOCIAL' ||
    !['positions', 'service-pools'].includes(d) ||
    version === '0' ||
    sequence === '0'
  )
    return false;
  const b = obj(source.currentStateBinding);
  return (
    text(b.sourceCommandId).length > 0 &&
    text(b.sourceEventId).length > 0 &&
    ['commandFingerprint', 'eventFingerprint', 'materializationHash'].every(
      (k) => /^sha256:[0-9a-f]{64}$/u.test(text(b[k])),
    ) &&
    /^[0-9a-f]{64}$/u.test(text(b.canonicalMaterializationSha256)) &&
    [
      'SOCIAL_POSITION_LIFECYCLE_' + country,
      'SOCIAL_EMPLOYMENT_SERVICE_' + country,
    ].includes(text(b.materializationKey)) &&
    integer(b.sourceStateWorldVersion) === version &&
    integer(b.sourceEventSequence) === sequence
  );
}
/** No pool, credentials, JWT, admission write, source authority or full JSON load. */
export function createPostwarOfficeProjectionStore(configuration: {
  runtimeReaderRole: string;
  authorizationPublisherRole: string;
}) {
  const expectedRole = role(configuration.runtimeReaderRole),
    publisherRole = role(configuration.authorizationPublisherRole);
  if (expectedRole === publisherRole) invalid('READER_PUBLISHER_MUST_DIFFER');
  const preflight = async (executor: SqlExecutor) => {
    const result = await executor.query<{
      role_name: unknown;
      subject: unknown;
      read_only: unknown;
      isolation: unknown;
      unsafe_role: unknown;
      publisher_member: unknown;
    }>(
      `select current_user as role_name,current_setting('request.jwt.claim.sub',true)as subject,current_setting('transaction_read_only')as read_only,current_setting('transaction_isolation')as isolation,(r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)as unsafe_role,pg_has_role(current_user,$1,'MEMBER')as publisher_member from pg_roles r where r.rolname=current_user`,
      [publisherRole],
    );
    const r = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !r ||
      r.role_name !== expectedRole ||
      r.unsafe_role !== false ||
      r.publisher_member !== false ||
      r.read_only !== 'on' ||
      !['repeatable read', 'serializable'].includes(String(r.isolation)) ||
      typeof r.subject !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        r.subject,
      )
    )
      invalid('BOUNDED_READER_ROLE_SUBJECT_OR_SNAPSHOT_DENIED');
    return r.subject;
  };
  return Object.freeze({
    async readCurrentSeatHeadersFrom(
      executor: SqlExecutor,
      input: { worldId: string },
    ): Promise<readonly PostwarOfficeProjectionSeatHeader[]> {
      const world = worldId(input.worldId),
        subject = await preflight(executor),
        r = await executor
          .query<Row>(POSTWAR_PROJECTION_SEATS_QUERY, [world])
          .catch((e) => {
            if (denied(e)) invalid('CURRENT_SEAT_NOT_COHERENT');
            throw e;
          });
      if (r.rows.length > 6) invalid('CURRENT_SEAT_NOT_COHERENT');
      const headers = r.rows.map((row) => ({
        scope: scope(
          {
            worldId: row.world_id,
            countryId: row.country_id,
            officeId: row.office_id,
            authSubject: row.auth_subject,
            teamId: row.team_id,
            authorizationVersion: row.authorization_revision,
            scopeKey: row.scope_key,
            seatRef: row.seat_ref,
          },
          world,
          subject,
        ),
        source: {
          admissionRef: text(row.admission_ref),
          seedId: text(row.seed_id),
          seedFingerprint: text(row.seed_fingerprint),
          modelVersion: text(row.model_version),
          replayBinding: text(row.replay_binding, 8192),
          sourceBundleSha256: text(row.source_bundle_sha256),
          worldVersion: integer(row.world_version),
          eventSequence: integer(row.event_sequence),
        },
      }));
      if (
        new Set(headers.map((h) => h.scope.officeId)).size !== headers.length ||
        new Set(
          headers.map(
            (h) =>
              `${h.scope.countryId}/${h.scope.teamId}/${h.scope.authorizationVersion}`,
          ),
        ).size > 1
      )
        invalid('CURRENT_SEAT_NOT_COHERENT');
      if (
        Buffer.byteLength(JSON.stringify(headers)) >
        POSTWAR_PROJECTION_RESPONSE_MAX
      )
        invalid('PROJECTION_RESPONSE_TOO_LARGE');
      return freeze(headers);
    },
    async readPageFrom(
      executor: SqlExecutor,
      input: {
        worldId: string;
        officeId: PostwarProjectionOffice;
        dataset: string;
        offset?: number;
        limit?: number;
        expectedVersion?: string;
      },
    ): Promise<PostwarOfficeProjectionPage> {
      const o = office(input.officeId),
        d = dataset(o, input.dataset),
        world = worldId(input.worldId),
        offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 100000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (offset > 0 && !input.expectedVersion) ||
        (input.expectedVersion !== undefined &&
          !/^sha256:[a-f0-9]{64}$/u.test(input.expectedVersion))
      )
        invalid('INVALID_PAGE_REQUEST');
      const subject = await preflight(executor),
        r = await executor
          .query<Row>(POSTWAR_PROJECTION_PAGE_QUERY, [
            world,
            o,
            d,
            offset,
            limit,
            input.expectedVersion ?? null,
          ])
          .catch((e) => {
            if (denied(e))
              return {
                rows: [{ status: 'DENIED' }] as readonly Row[],
                rowCount: 1,
              };
            throw e;
          });
      if (r.rows.length !== 1) invalid('PROJECTION_RESULT_NOT_UNIQUE');
      const row = r.rows[0]!;
      if (['STALE', 'DENIED', 'UNAVAILABLE'].includes(String(row.status)))
        return Object.freeze({
          status: row.status as 'STALE' | 'DENIED' | 'UNAVAILABLE',
          code:
            row.status === 'STALE'
              ? 'STALE_PROJECTION_OR_H0_HEAD_REQUIRED'
              : String(row.status),
        });
      if (row.status !== 'PAGE' && row.status !== 'EMPTY')
        invalid('INVALID_PROJECTION_STATUS');
      const actual = scope(obj(row.scope_json), world, subject);
      if (actual.officeId !== o) invalid('PROJECTION_SCOPE_MISMATCH');
      const source = obj(row.source_json),
        page = obj(row.page_json),
        raw =
          typeof row.rows_text === 'string'
            ? row.rows_text
            : invalid('INVALID_PROJECTION_ROWS');
      if (
        Buffer.byteLength(raw) > POSTWAR_PROJECTION_ROWS_TEXT_MAX ||
        source.hashAlgorithm !== 'POSTGRES_JSONB_TEXT_UTF8_SHA256' ||
        source.returnedRowsHash !== sha(raw) ||
        !validSourceHead(source, o, d, actual.countryId) ||
        (input.expectedVersion &&
          source.sourceVersion !== input.expectedVersion)
      )
        invalid('PROJECTION_PAGE_HASH_OR_HEAD_MISMATCH');
      const parseRows = JSON.parse as (
        s: string,
        reviver: (
          key: string,
          value: unknown,
          context: { source?: string },
        ) => unknown,
      ) => unknown;
      const rows = parseRows(raw, (_key, value, context) => {
        if (typeof value !== 'number') return value;
        if (typeof context.source !== 'string')
          invalid('LOSSLESS_SOURCE_NUMBER_CONTEXT_REQUIRED');
        return context.source;
      });
      if (
        !Array.isArray(rows) ||
        rows.length > limit ||
        rows.length > 100 ||
        count(page.returned) !== rows.length ||
        count(page.offset) !== offset ||
        count(page.limit) !== limit
      )
        invalid('PROJECTION_PAGE_BOUND_MISMATCH');
      const total = count(page.total),
        next = page.nextOffset === null ? null : count(page.nextOffset);
      if (next !== null && (next !== offset + rows.length || next >= total))
        invalid('PROJECTION_NEXT_OFFSET_MISMATCH');
      const result: Extract<
        PostwarOfficeProjectionPage,
        { status: 'PAGE' | 'EMPTY' }
      > = {
        status: row.status,
        scope: actual,
        source: source as unknown as PostwarOfficeProjectionSource,
        page: { offset, limit, returned: rows.length, total, nextOffset: next },
        rows,
      };
      if (
        Buffer.byteLength(JSON.stringify(result)) >
        POSTWAR_PROJECTION_RESPONSE_MAX
      )
        invalid('PROJECTION_RESPONSE_TOO_LARGE');
      return freeze(result);
    },
  });
}
