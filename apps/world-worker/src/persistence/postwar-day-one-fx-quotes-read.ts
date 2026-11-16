/** Fixed online DATA reader. Actual read role/session/seat/admission come from
 * the shared bounded store on this same readonly transaction, never a DTO. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import {
  parsePostwarDayOneFxQuoteRow,
  type PostwarDayOneFxQuoteRow,
} from '@econmind/core/postwar-day-one-fx-command-contract';
import {
  createPostwarOfficeProjectionStore,
  type PostwarOfficeProjectionScope,
  type PostwarOfficeProjectionSource,
} from './postwar-office-projection-store.js';
import type { SqlExecutor } from './sql-database.js';
export const DAY_ONE_FX_QUOTES_READ_QUERY =
  'select * from world_v2.read_postwar_day_one_fx_quotes_page($1,$2,$3,$4)';
export type PostwarDayOneFxQuoteSource = Omit<
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
export type PostwarDayOneFxQuotePage =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      scope: PostwarOfficeProjectionScope;
      source: PostwarDayOneFxQuoteSource;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly PostwarDayOneFxQuoteRow[];
    }>
  | Readonly<{ status: 'DENIED' | 'STALE' | 'UNAVAILABLE'; code: string }>;
const raw = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('DAY_ONE_FX_QUOTES:OBJECT_REQUIRED');
  return v as Record<string, unknown>;
};
export function createPostwarDayOneFxQuotesReader(
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
    ): Promise<PostwarDayOneFxQuotePage> {
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
        throw Error('DAY_ONE_FX_QUOTES:INVALID_PAGE');
      const headers = await common.readCurrentSeatHeadersFrom(tx, {
          worldId: input.worldId,
        }),
        selected = headers.filter((h) => h.scope.officeId === 'FINANCE');
      if (selected.length !== 1)
        return Object.freeze({
          status: 'DENIED',
          code: 'CURRENT_FINANCE_SEAT_REQUIRED',
        });
      const h = selected[0]!;
      let result;
      try {
        result = await tx.query<Record<string, unknown>>(
          DAY_ONE_FX_QUOTES_READ_QUERY,
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
            code: 'CURRENT_FINANCE_PARAMETERS_DENIED',
          });
        throw error;
      }
      if (result.rows.length !== 1)
        throw Error('DAY_ONE_FX_QUOTES:UNIQUE_RESULT_REQUIRED');
      const r = result.rows[0]!;
      if (
        r.status === 'DENIED' ||
        r.status === 'STALE' ||
        r.status === 'UNAVAILABLE'
      )
        return Object.freeze({
          status: r.status,
          code: 'DAY_ONE_FX_QUOTES_' + r.status,
        });
      if (r.status !== 'PAGE' && r.status !== 'EMPTY')
        throw Error('DAY_ONE_FX_QUOTES:INVALID_STATUS');
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
          'world_v2.postwar_day_one_fx_quote_original.quote_text' ||
        pointer.rowBinding !== 'quoteRef+quoteSha256' ||
        !fp(s.sourceVersion) ||
        !raw(s.canonicalSeedSha256) ||
        !raw(s.pageHash) ||
        !raw(s.returnedRowsHash) ||
        s.hashAlgorithm !== 'POSTGRES_JSONB_TEXT_UTF8_SHA256'
      )
        throw Error(
          'DAY_ONE_FX_QUOTES:EXACT_SCOPE_ORIGIN_AND_OBSERVED_HEAD_REQUIRED',
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
          throw Error('DAY_ONE_FX_QUOTES:SAME_ADMISSION_REQUIRED');
      if (input.expectedVersion && s.sourceVersion !== input.expectedVersion)
        throw Error('DAY_ONE_FX_QUOTES:EXACT_VERSION_REQUIRED');
      if (
        typeof r.rows_text !== 'string' ||
        Buffer.byteLength(r.rows_text) > 8192 ||
        createHash('sha256').update(r.rows_text).digest('hex') !==
          s.returnedRowsHash
      )
        throw Error('DAY_ONE_FX_QUOTES:RAW_ROWS_HASH_REQUIRED');
      const parsed: unknown = JSON.parse(r.rows_text);
      if (!Array.isArray(parsed))
        throw Error('DAY_ONE_FX_QUOTES:ROWS_REQUIRED');
      const rows = Object.freeze(parsed.map(parsePostwarDayOneFxQuoteRow));
      if (
        rows.some((row) => row.countryId !== h.scope.countryId) ||
        new Set(rows.map((row) => row.quoteRef)).size !== rows.length ||
        p.offset !== offset ||
        p.limit !== limit ||
        p.returned !== rows.length ||
        !Number.isSafeInteger(p.total) ||
        (p.total as number) < 1 ||
        (p.total as number) > 1 ||
        p.nextOffset !==
          (offset + rows.length < (p.total as number)
            ? offset + rows.length
            : null) ||
        (r.status === 'EMPTY') !== (rows.length === 0) ||
        (offset < (p.total as number) && rows.length === 0)
      )
        throw Error('DAY_ONE_FX_QUOTES:EXACT_BOUNDED_QUOTES_REQUIRED');
      return Object.freeze({
        status: r.status,
        scope: h.scope,
        source: Object.freeze({
          ...s,
          observedHead: Object.freeze({ ...observed }),
          sourcePointer: Object.freeze({ ...pointer }),
        }) as unknown as PostwarDayOneFxQuoteSource,
        page: Object.freeze({ ...p }) as unknown as Extract<
          PostwarDayOneFxQuotePage,
          { status: 'PAGE' | 'EMPTY' }
        >['page'],
        rows,
      });
    },
  });
}
