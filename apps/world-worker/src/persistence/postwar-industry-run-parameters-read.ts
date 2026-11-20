/** Fixed online DATA reader. Actual read role/session/seat/admission come from
 * the shared bounded store on this same readonly transaction, never a DTO. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import {
  parseIndustryRunParameterRow,
  type IndustryRunParameterRow,
} from '@econmind/core/postwar-industry-run-parameters-contract';
import {
  createPostwarOfficeProjectionStore,
  type PostwarOfficeProjectionScope,
  type PostwarOfficeProjectionSource,
} from './postwar-office-projection-store.js';
import type { SqlExecutor } from './sql-database.js';
export const INDUSTRY_RUN_PARAMETERS_READ_QUERY =
  'select * from world_v2.read_postwar_industry_run_parameters_page($1,$2,$3,$4)';
export type IndustryRunParameterSource = Omit<
  PostwarOfficeProjectionSource,
  'dataNature' | 'currentPrefixCoverage' | 'currentStateBinding'
> & {
  readonly dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS';
  readonly originWorldVersion: '0';
  readonly originEventSequence: '0';
  readonly observedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
};
export type IndustryRunParameterPage =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      scope: PostwarOfficeProjectionScope;
      source: IndustryRunParameterSource;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly IndustryRunParameterRow[];
    }>
  | Readonly<{ status: 'DENIED' | 'STALE' | 'UNAVAILABLE'; code: string }>;
const raw = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('INDUSTRY_RUN_PARAMETERS:OBJECT_REQUIRED');
  return v as Record<string, unknown>;
};
export function createPostwarIndustryRunParametersReader(
  config: Readonly<{
    runtimeReaderRole: string;
    authorizationPublisherRole: string;
  }>,
) {
  const common = createPostwarOfficeProjectionStore(config);
  return Object.freeze({
    async readPageFrom(
      tx: SqlExecutor,
      input: Readonly<{
        worldId: string;
        offset?: number;
        limit?: number;
        expectedVersion?: string;
      }>,
    ): Promise<IndustryRunParameterPage> {
      const offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 100000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (offset > 0 && !input.expectedVersion) ||
        (input.expectedVersion !== undefined && !fp(input.expectedVersion))
      )
        throw Error('INDUSTRY_RUN_PARAMETERS:INVALID_PAGE');
      const headers = await common.readCurrentSeatHeadersFrom(tx, {
          worldId: input.worldId,
        }),
        selected = headers.filter((h) => h.scope.officeId === 'INDUSTRY');
      if (selected.length !== 1)
        return Object.freeze({
          status: 'DENIED',
          code: 'CURRENT_INDUSTRY_SEAT_REQUIRED',
        });
      const h = selected[0]!;
      let result;
      try {
        result = await tx.query<Record<string, unknown>>(
          INDUSTRY_RUN_PARAMETERS_READ_QUERY,
          [input.worldId, offset, limit, input.expectedVersion ?? null],
        );
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '42501'
        )
          return Object.freeze({
            status: 'DENIED',
            code: 'CURRENT_INDUSTRY_PARAMETERS_DENIED',
          });
        throw error;
      }
      if (result.rows.length !== 1)
        throw Error('INDUSTRY_RUN_PARAMETERS:UNIQUE_RESULT_REQUIRED');
      const r = result.rows[0]!;
      if (
        r.status === 'DENIED' ||
        r.status === 'STALE' ||
        r.status === 'UNAVAILABLE'
      )
        return Object.freeze({
          status: r.status,
          code: 'INDUSTRY_RUN_PARAMETERS_' + r.status,
        });
      if (r.status !== 'PAGE' && r.status !== 'EMPTY')
        throw Error('INDUSTRY_RUN_PARAMETERS:INVALID_STATUS');
      const s = object(r.source),
        p = object(r.page),
        scope = object(r.scope),
        observed = object(s.observedHead),
        pointer = object(s.sourcePointer);
      if (
        canonicalSerialize(scope) !== canonicalSerialize(h.scope) ||
        s.dataNature !== 'ADMITTED_IMMUTABLE_OPENING_FACTS' ||
        s.worldVersion !== '0' ||
        s.eventSequence !== '0' ||
        s.originWorldVersion !== '0' ||
        s.originEventSequence !== '0' ||
        observed.worldVersion !== h.source.worldVersion ||
        observed.eventSequence !== h.source.eventSequence ||
        pointer.rowOrigin !==
          'world_v2.postwar_industry_first_day_source.source_text' ||
        pointer.rowBinding !== 'sourceRef+sourceRawSha256' ||
        !fp(s.sourceVersion) ||
        !raw(s.canonicalSeedSha256) ||
        !raw(s.pageHash) ||
        !raw(s.returnedRowsHash) ||
        s.hashAlgorithm !== 'POSTGRES_JSONB_TEXT_UTF8_SHA256'
      )
        throw Error(
          'INDUSTRY_RUN_PARAMETERS:EXACT_SCOPE_ORIGIN_AND_OBSERVED_HEAD_REQUIRED',
        );
      for (const key of [
        'seedId',
        'seedFingerprint',
        'admissionRef',
        'modelVersion',
        'replayBinding',
        'sourceBundleSha256',
      ] as const)
        if (s[key] !== h.source[key])
          throw Error('INDUSTRY_RUN_PARAMETERS:SAME_ADMISSION_REQUIRED');
      if (input.expectedVersion && s.sourceVersion !== input.expectedVersion)
        throw Error('INDUSTRY_RUN_PARAMETERS:EXACT_VERSION_REQUIRED');
      if (
        typeof r.rows_text !== 'string' ||
        Buffer.byteLength(r.rows_text) > 48000 ||
        createHash('sha256').update(r.rows_text).digest('hex') !==
          s.returnedRowsHash
      )
        throw Error('INDUSTRY_RUN_PARAMETERS:RAW_ROWS_HASH_REQUIRED');
      const parsed: unknown = JSON.parse(r.rows_text);
      if (!Array.isArray(parsed))
        throw Error('INDUSTRY_RUN_PARAMETERS:ROWS_REQUIRED');
      const rows = Object.freeze(parsed.map(parseIndustryRunParameterRow));
      if (
        rows.some((row) => row.countryId !== h.scope.countryId) ||
        new Set(rows.map((row) => row.facilityId)).size !== rows.length ||
        p.offset !== offset ||
        p.limit !== limit ||
        p.returned !== rows.length ||
        !Number.isSafeInteger(p.total) ||
        (p.total as number) < 1 ||
        (p.total as number) > 100 ||
        p.nextOffset !==
          (offset + rows.length < (p.total as number)
            ? offset + rows.length
            : null) ||
        (r.status === 'EMPTY') !== (rows.length === 0) ||
        (offset < (p.total as number) && rows.length === 0)
      )
        throw Error(
          'INDUSTRY_RUN_PARAMETERS:EXACT_BOUNDED_FACILITIES_REQUIRED',
        );
      return Object.freeze({
        status: r.status,
        scope: h.scope,
        source: Object.freeze({
          ...s,
          observedHead: Object.freeze({ ...observed }),
          sourcePointer: Object.freeze({ ...pointer }),
        }) as unknown as IndustryRunParameterSource,
        page: Object.freeze({ ...p }) as unknown as Extract<
          IndustryRunParameterPage,
          { status: 'PAGE' | 'EMPTY' }
        >['page'],
        rows,
      });
    },
  });
}
