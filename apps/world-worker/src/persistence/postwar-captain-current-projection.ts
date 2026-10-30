/** Online EXEC-only fixed small-page adapter. No seed, reducer, source
 * publisher, activation, or cached actor/admission/current-head decision. */
import { createHash } from 'node:crypto';
import {
  POSTWAR_CAPTAIN_CURRENT_NATURE,
  parsePostwarCaptainCurrentCoverage,
  parsePostwarCaptainPoliticalCapitalRow,
  type PostwarCaptainCurrentCoverage,
  type PostwarCaptainPoliticalCapitalRow,
} from '@econmind/core/postwar-captain-current-contract';
import type { SqlExecutor } from './sql-database.js';
import type { PostwarOfficeProjectionScope } from './postwar-office-projection-store.js';
export const POSTWAR_CAPTAIN_CURRENT_PAGE_QUERY =
  'select * from world_v2.read_postwar_captain_current_page($1,$2,$3,$4)';
export interface PostwarCaptainCurrentSource {
  readonly dataNature: typeof POSTWAR_CAPTAIN_CURRENT_NATURE;
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
  readonly originWorldVersion: string;
  readonly originEventSequence: string;
  readonly observedHead: {
    readonly worldVersion: string;
    readonly eventSequence: string;
  };
  readonly currentCaptainCoverage: PostwarCaptainCurrentCoverage;
  readonly pageHash: string;
  readonly returnedRowsHash: string;
  readonly hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256';
  readonly sourcePointer: Readonly<Record<string, unknown>>;
}
export type PostwarCaptainCurrentPage =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      scope: PostwarOfficeProjectionScope;
      source: PostwarCaptainCurrentSource;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly PostwarCaptainPoliticalCapitalRow[];
    }>
  | Readonly<{ status: 'DENIED' | 'STALE' | 'UNAVAILABLE'; code: string }>;
function invalid(s: string): never {
  throw Error('POSTWAR_CAPTAIN_CURRENT:' + s);
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const rawHash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 8192;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : invalid('OBJECT_REQUIRED');
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export function createPostwarCaptainCurrentProjectionStore(config: {
  readonly runtimeReaderRole: string;
  readonly authorizationPublisherRole: string;
}) {
  for (const role of [
    config.runtimeReaderRole,
    config.authorizationPublisherRole,
  ])
    if (
      !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
      [
        'postgres',
        'service_role',
        'supabase_admin',
        'anon',
        'authenticated',
      ].includes(role)
    )
      invalid('FIXED_SEPARATE_LOW_PRIVILEGE_ROLES_REQUIRED');
  if (config.runtimeReaderRole === config.authorizationPublisherRole)
    invalid('SEPARATE_ROLES_REQUIRED');
  return Object.freeze({
    async readPageFrom(
      tx: SqlExecutor,
      input: {
        worldId: string;
        offset?: number;
        limit?: number;
        expectedVersion?: string;
      },
    ): Promise<PostwarCaptainCurrentPage> {
      const offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      if (
        !/^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$/u.test(input.worldId) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 100000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (offset > 0 && !input.expectedVersion) ||
        (input.expectedVersion !== undefined && !fp(input.expectedVersion))
      )
        invalid('INVALID_PAGE_REQUEST');
      const session = await tx.query<Record<string, unknown>>(
        `select current_user as role_name,current_setting('request.jwt.claim.sub',true)as subject,current_setting('transaction_read_only')as read_only,current_setting('transaction_isolation')as isolation,(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication)as unsafe,pg_has_role(current_user,$1,'MEMBER')as publisher from pg_roles r where r.rolname=current_user`,
        [config.authorizationPublisherRole],
      );
      const identity = session.rows[0];
      if (
        session.rows.length !== 1 ||
        !identity ||
        identity.role_name !== config.runtimeReaderRole ||
        identity.read_only !== 'on' ||
        !['repeatable read', 'serializable'].includes(
          String(identity.isolation),
        ) ||
        identity.unsafe !== false ||
        identity.publisher !== false ||
        typeof identity.subject !== 'string' ||
        !/^[a-f0-9-]{36}$/iu.test(identity.subject)
      )
        invalid('ROLE_SUBJECT_SNAPSHOT_DENIED');
      let r;
      try {
        r = await tx.query<Record<string, unknown>>(
          POSTWAR_CAPTAIN_CURRENT_PAGE_QUERY,
          [input.worldId, offset, limit, input.expectedVersion ?? null],
        );
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === '42501')
          return Object.freeze({
            status: 'DENIED' as const,
            code: 'CURRENT_CAPTAIN_SCOPE_DENIED',
          });
        throw e;
      }
      const row = r.rows[0];
      if (r.rows.length !== 1 || !row) invalid('UNIQUE_RESULT_REQUIRED');
      if (['DENIED', 'STALE', 'UNAVAILABLE'].includes(String(row.status)))
        return Object.freeze({
          status: row.status as 'DENIED' | 'STALE' | 'UNAVAILABLE',
          code: 'CURRENT_CAPTAIN_' + String(row.status),
        });
      if (row.status !== 'PAGE' && row.status !== 'EMPTY')
        invalid('INVALID_STATUS');
      const scope = obj(row.scope),
        source = obj(row.source),
        page = obj(row.page),
        observed = obj(source.observedHead),
        coverage = parsePostwarCaptainCurrentCoverage(
          source.currentCaptainCoverage,
        );
      if (
        scope.worldId !== input.worldId ||
        scope.officeId !== 'CAPTAIN' ||
        scope.authSubject !== identity.subject ||
        !text(scope.countryId) ||
        !text(scope.teamId) ||
        !text(scope.authorizationVersion) ||
        !text(scope.seatRef) ||
        scope.scopeKey !==
          `OFFICE_${Buffer.from(scope.countryId, 'utf8').toString('hex').toUpperCase()}_4341505441494E`
      )
        invalid('ACTUAL_SCOPE_MISMATCH');
      if (
        source.dataNature !== POSTWAR_CAPTAIN_CURRENT_NATURE ||
        source.worldVersion !== coverage.globalWorldVersion ||
        source.eventSequence !== coverage.globalEventSequence ||
        observed.worldVersion !== source.worldVersion ||
        observed.eventSequence !== source.eventSequence ||
        source.originWorldVersion !== coverage.originWorldVersion ||
        source.originEventSequence !== coverage.originEventSequence ||
        coverage.countryId !== scope.countryId ||
        !fp(source.sourceVersion) ||
        !fp(source.seedFingerprint) ||
        (input.expectedVersion !== undefined &&
          source.sourceVersion !== input.expectedVersion)
      )
        invalid('EXACT_CURRENT_AND_ORIGIN_HEAD_REQUIRED');
      if (
        ![
          source.sourceRevision,
          source.seedId,
          source.admissionRef,
          source.modelVersion,
          source.replayBinding,
        ].every(text) ||
        ![
          source.sourceBundleSha256,
          source.canonicalSeedSha256,
          source.pageHash,
          source.returnedRowsHash,
        ].every(rawHash) ||
        source.hashAlgorithm !== 'POSTGRES_JSONB_TEXT_UTF8_SHA256'
      )
        invalid('SOURCE_HEADER_REQUIRED');
      obj(source.sourcePointer);
      const raw =
        typeof row.rows_text === 'string'
          ? row.rows_text
          : invalid('ROWS_REQUIRED');
      if (
        Buffer.byteLength(raw) > 65536 ||
        hash(raw) !== source.returnedRowsHash
      )
        invalid('BOUNDED_HASHED_ROWS_REQUIRED');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) invalid('ROW_ARRAY_REQUIRED');
      const rows = parsed.map(parsePostwarCaptainPoliticalCapitalRow);
      if (
        rows.length > limit ||
        rows.some((x) => x.countryId !== scope.countryId) ||
        new Set(rows.map((x) => x.bucket)).size !== rows.length ||
        page.offset !== offset ||
        page.limit !== limit ||
        page.returned !== rows.length ||
        page.total !== 7 ||
        (row.status === 'EMPTY') !== (rows.length === 0) ||
        page.nextOffset !==
          (offset + rows.length < 7 ? offset + rows.length : null) ||
        (offset < 7 && rows.length !== Math.min(limit, 7 - offset))
      )
        invalid('EXACT_SEVEN_BUCKET_PAGE_REQUIRED');
      return freeze({
        status: row.status,
        scope,
        source,
        page,
        rows,
      }) as unknown as PostwarCaptainCurrentPage;
    },
  });
}
