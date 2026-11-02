/** Online bounded data only. No seed loader, reducer, publisher or authority cache. */
import { createHash } from 'node:crypto';
import type { SqlExecutor } from './sql-database.js';
import type { PostwarOfficeProjectionScope } from './postwar-office-projection-store.js';
import {
  POSTWAR_SOCIAL_MIXED_CURRENT_NATURE,
  parsePostwarSocialMixedCoverage,
  parsePostwarSocialMixedStateBinding,
  type PostwarSocialMixedCoverage,
} from '@econmind/core/postwar-social-mixed-current-contract';
export const POSTWAR_SOCIAL_MIXED_CURRENT_DATA_NATURE =
  POSTWAR_SOCIAL_MIXED_CURRENT_NATURE;
export const POSTWAR_SOCIAL_MIXED_CURRENT_PAGE_QUERY =
  'select * from world_v2.read_postwar_mixed_current_page($1,$2,$3,$4,$5,$6)';
export const POSTWAR_SOCIAL_MIXED_CURRENT_DATASETS = Object.freeze({
  SOCIAL: Object.freeze(['positions', 'service-pools'] as const),
});
export type PostwarCurrentSocialOffice =
  keyof typeof POSTWAR_SOCIAL_MIXED_CURRENT_DATASETS;
export type PostwarSocialCurrentCoverage = PostwarSocialMixedCoverage;
export interface PostwarSocialMixedCurrentSource {
  readonly dataNature: typeof POSTWAR_SOCIAL_MIXED_CURRENT_DATA_NATURE;
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
  readonly observedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly currentPrefixCoverage: PostwarSocialCurrentCoverage;
  readonly currentStateBinding?: import('@econmind/core/postwar-social-mixed-current-contract').PostwarSocialMixedStateBinding;
  readonly pageHash: string;
  readonly returnedRowsHash: string;
  readonly hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256';
  readonly sourcePointer: Readonly<Record<string, unknown>>;
}
export type PostwarSocialMixedCurrentPage =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      scope: PostwarOfficeProjectionScope;
      source: PostwarSocialMixedCurrentSource;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly unknown[];
    }>
  | Readonly<{ status: 'DENIED' | 'STALE' | 'UNAVAILABLE'; code: string }>;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw Error('POSTWAR_MIXED_CURRENT_SOCIAL:' + reason);
}
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 8192;
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9]\d*)$/u.test(v);
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : invalid('OBJECT_REQUIRED');
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export function createPostwarSocialMixedCurrentProjectionStore(config: {
  runtimeReaderRole: string;
  authorizationPublisherRole: string;
}) {
  for (const name of [
    config.runtimeReaderRole,
    config.authorizationPublisherRole,
  ])
    if (
      !/^[a-z][a-z0-9_]{0,62}$/u.test(name) ||
      [
        'postgres',
        'service_role',
        'anon',
        'authenticated',
        'supabase_admin',
      ].includes(name)
    )
      invalid('READER_ROLE_REQUIRED');
  if (config.runtimeReaderRole === config.authorizationPublisherRole)
    invalid('SEPARATE_ROLES_REQUIRED');
  return Object.freeze({
    async readPageFrom(
      tx: SqlExecutor,
      input: {
        worldId: string;
        officeId: PostwarCurrentSocialOffice;
        dataset: string;
        offset?: number;
        limit?: number;
        expectedVersion?: string;
      },
    ): Promise<PostwarSocialMixedCurrentPage> {
      const offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      if (
        !Object.hasOwn(POSTWAR_SOCIAL_MIXED_CURRENT_DATASETS, input.officeId) ||
        !(
          POSTWAR_SOCIAL_MIXED_CURRENT_DATASETS[
            input.officeId
          ] as readonly string[]
        ).includes(input.dataset) ||
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
      const check = await tx.query<{
        role_name: unknown;
        subject: unknown;
        read_only: unknown;
        isolation: unknown;
        unsafe: unknown;
        publisher: unknown;
      }>(
        `select current_user as role_name,current_setting('request.jwt.claim.sub',true)as subject,current_setting('transaction_read_only')as read_only,current_setting('transaction_isolation')as isolation,(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication)as unsafe,pg_has_role(current_user,$1,'MEMBER')as publisher from pg_roles r where r.rolname=current_user`,
        [config.authorizationPublisherRole],
      );
      const c = check.rows[0];
      if (
        check.rows.length !== 1 ||
        !c ||
        c.role_name !== config.runtimeReaderRole ||
        c.read_only !== 'on' ||
        !['repeatable read', 'serializable'].includes(String(c.isolation)) ||
        c.unsafe !== false ||
        c.publisher !== false ||
        typeof c.subject !== 'string' ||
        !/^[a-f0-9-]{36}$/iu.test(c.subject)
      )
        invalid('ROLE_SUBJECT_SNAPSHOT_DENIED');
      let result;
      try {
        result = await tx.query<Record<string, unknown>>(
          POSTWAR_SOCIAL_MIXED_CURRENT_PAGE_QUERY,
          [
            input.worldId,
            input.officeId,
            input.dataset,
            offset,
            limit,
            input.expectedVersion ?? null,
          ],
        );
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === '42501')
          return { status: 'DENIED', code: 'CURRENT_SOCIAL_SCOPE_DENIED' };
        throw e;
      }
      if (result.rows.length !== 1) invalid('UNIQUE_RESULT_REQUIRED');
      const row = result.rows[0]!;
      if (['DENIED', 'STALE', 'UNAVAILABLE'].includes(String(row.status)))
        return freeze({
          status: row.status as 'DENIED' | 'STALE' | 'UNAVAILABLE',
          code: 'CURRENT_SOCIAL_' + String(row.status),
        });
      if (row.status !== 'PAGE' && row.status !== 'EMPTY')
        invalid('INVALID_STATUS');
      const scope = obj(row.scope),
        source = obj(row.source),
        page = obj(row.page),
        coverage = obj(source.currentPrefixCoverage),
        observed = obj(source.observedHead);
      if (
        scope.worldId !== input.worldId ||
        scope.officeId !== input.officeId ||
        scope.authSubject !== c.subject ||
        !text(scope.countryId) ||
        !text(scope.teamId) ||
        !text(scope.authorizationVersion) ||
        !text(scope.seatRef) ||
        scope.scopeKey !==
          `OFFICE_${Buffer.from(String(scope.countryId), 'utf8').toString('hex').toUpperCase()}_${Buffer.from(input.officeId, 'utf8').toString('hex').toUpperCase()}`
      )
        invalid('ACTUAL_SCOPE_MISMATCH');
      if (
        source.dataNature !== POSTWAR_SOCIAL_MIXED_CURRENT_DATA_NATURE ||
        !uint(observed.worldVersion) ||
        !uint(observed.eventSequence) ||
        source.worldVersion !== observed.worldVersion ||
        source.eventSequence !== observed.eventSequence ||
        !fp(source.sourceVersion) ||
        !fp(source.seedFingerprint) ||
        !text(source.admissionRef) ||
        (input.expectedVersion !== undefined &&
          input.expectedVersion !== source.sourceVersion)
      )
        invalid('CURRENT_POSTING_AWARE_SOURCE_REQUIRED');
      const validatedCoverage = parsePostwarSocialMixedCoverage(coverage, {
        countryId: String(scope.countryId),
        worldVersion: String(observed.worldVersion),
        eventSequence: String(observed.eventSequence),
      });
      if (
        ![
          source.sourceRevision,
          source.seedId,
          source.admissionRef,
          source.modelVersion,
          source.replayBinding,
        ].every(text) ||
        !/^[a-f0-9]{64}$/u.test(String(source.sourceBundleSha256)) ||
        !/^[a-f0-9]{64}$/u.test(String(source.canonicalSeedSha256)) ||
        !/^[a-f0-9]{64}$/u.test(String(source.pageHash))
      )
        invalid('SOURCE_HEADER_REQUIRED');
      obj(source.sourcePointer);
      const raw =
        typeof row.rows_text === 'string'
          ? row.rows_text
          : invalid('ROWS_REQUIRED');
      if (
        Buffer.byteLength(raw) > 65536 ||
        source.hashAlgorithm !== 'POSTGRES_JSONB_TEXT_UTF8_SHA256' ||
        source.returnedRowsHash !== hash(raw)
      )
        invalid('PAGE_HASH_OR_SIZE');
      const parse = JSON.parse as (
        s: string,
        r: (k: string, v: unknown, c: { source?: string }) => unknown,
      ) => unknown;
      const rows = parse(raw, (_k, v, ctx) => {
        if (typeof v !== 'number') return v;
        if (!ctx.source) invalid('LOSSLESS_JSON_NUMBER_REQUIRED');
        return ctx.source;
      });
      if (
        !Array.isArray(rows) ||
        rows.length > limit ||
        page.offset !== offset ||
        page.limit !== limit ||
        page.returned !== rows.length ||
        !Number.isSafeInteger(page.total) ||
        Number(page.total) < 0
      )
        invalid('PAGE_BOUNDS');
      if (
        (row.status === 'EMPTY') !== (rows.length === 0) ||
        offset + rows.length > Math.max(offset, Number(page.total)) ||
        (rows.length === 0 && offset < Number(page.total))
      )
        invalid('EMPTY_PAGE_CONTRACT');
      if (
        (page.nextOffset === null) !==
        offset + rows.length >= Number(page.total)
      )
        invalid('NEXT_OFFSET_COMPLETENESS');
      if (
        page.nextOffset !== null &&
        (!Number.isSafeInteger(page.nextOffset) ||
          page.nextOffset !== offset + rows.length ||
          Number(page.nextOffset) >= Number(page.total))
      )
        invalid('NEXT_OFFSET');
      if (
        source.originWorldVersion !== validatedCoverage.originWorldVersion ||
        source.originEventSequence !== validatedCoverage.originEventSequence
      )
        invalid('ORIGIN_MISMATCH');
      const binding = parsePostwarSocialMixedStateBinding(
        source.currentStateBinding,
        validatedCoverage,
      );
      for (const value of rows) {
        const r = obj(value);
        if (
          r.countryId !== scope.countryId ||
          !text(input.dataset === 'positions' ? r.positionId : r.poolId)
        )
          invalid('COUNTRY_ROW_REQUIRED');
      }
      const value = {
        status: row.status,
        scope,
        source: {
          ...source,
          currentPrefixCoverage: validatedCoverage,
          ...(binding === undefined ? {} : { currentStateBinding: binding }),
        },
        page,
        rows,
      };
      if (Buffer.byteLength(JSON.stringify(value)) > 65536)
        invalid('RESPONSE_SIZE');
      return freeze(value) as unknown as PostwarSocialMixedCurrentPage;
    },
  });
}
