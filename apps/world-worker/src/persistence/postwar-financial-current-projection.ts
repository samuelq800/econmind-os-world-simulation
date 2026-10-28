/** Online bounded data only. No seed loader, reducer, publisher or authority cache. */
import { createHash } from 'node:crypto';
import type { SqlExecutor } from './sql-database.js';
import type { PostwarOfficeProjectionScope } from './postwar-office-projection-store.js';
export const POSTWAR_FINANCIAL_CURRENT_DATA_NATURE =
  'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX' as const;
export const POSTWAR_FINANCIAL_OPENING_DATA_NATURE =
  'ADMITTED_IMMUTABLE_OPENING_FACTS' as const;
export const POSTWAR_FINANCIAL_CURRENT_PAGE_QUERY =
  'select * from world_v2.read_postwar_financial_current_page($1,$2,$3,$4,$5,$6)';
export const POSTWAR_FINANCIAL_CURRENT_DATASETS = Object.freeze({
  FINANCE: [
    'currency-fx',
    'opening-financial-legs',
    'ledger-balances',
    'treasury-capacity',
  ],
  CENTRAL_BANK: [
    'currency-fx',
    'cb-categories',
    'cb-holdings',
    'bank-loans',
    'opening-financial-legs',
    'ledger-balances',
  ],
} as const);
export type PostwarCurrentFinancialOffice =
  keyof typeof POSTWAR_FINANCIAL_CURRENT_DATASETS;
export interface PostwarFinancialCurrentCoverage {
  readonly schemaVersion: 'postwar-financial-current-prefix-coverage-v1';
  readonly reducerVersion: 'POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1';
  readonly coverageRef: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly globalWorldVersion: string;
  readonly globalEventSequence: string;
  readonly coveredThroughEventId: string;
  readonly coveredThroughEventFingerprint: string;
  readonly noFinancialPostings: true;
  readonly noInventoryPostings: true;
}
export interface PostwarFinancialCapacityRow {
  readonly schemaVersion: 'postwar-treasury-capacity-row-v1';
  readonly countryId: string;
  readonly accountId: string;
  readonly claimId: string;
  readonly currency: string;
  readonly treasuryLedgerClaimBalance: string;
  readonly openingReservedCapacity: string;
  readonly budgetEnvelopeCapacity: string;
  readonly additionalPayrollReservedCapacity: string;
  readonly totalReservedCapacity: string;
  readonly availableCapacity: string;
  readonly reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED';
  readonly balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET';
}
export interface PostwarFinancialCurrentSource {
  readonly dataNature:
    | typeof POSTWAR_FINANCIAL_CURRENT_DATA_NATURE
    | typeof POSTWAR_FINANCIAL_OPENING_DATA_NATURE;
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
  readonly originWorldVersion: '0';
  readonly originEventSequence: '0';
  readonly observedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly currentFinancialCoverage: PostwarFinancialCurrentCoverage;
  readonly pageHash: string;
  readonly returnedRowsHash: string;
  readonly hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256';
  readonly sourcePointer: Readonly<Record<string, unknown>>;
}
export type PostwarFinancialCurrentPage =
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      scope: PostwarOfficeProjectionScope;
      source: PostwarFinancialCurrentSource;
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
  throw Error('POSTWAR_CURRENT_FINANCIAL:' + reason);
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
export function createPostwarFinancialCurrentProjectionStore(config: {
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
        officeId: PostwarCurrentFinancialOffice;
        dataset: string;
        offset?: number;
        limit?: number;
        expectedVersion?: string;
      },
    ): Promise<PostwarFinancialCurrentPage> {
      const offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      if (
        !Object.hasOwn(POSTWAR_FINANCIAL_CURRENT_DATASETS, input.officeId) ||
        !(
          POSTWAR_FINANCIAL_CURRENT_DATASETS[
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
          POSTWAR_FINANCIAL_CURRENT_PAGE_QUERY,
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
          return { status: 'DENIED', code: 'CURRENT_FINANCIAL_SCOPE_DENIED' };
        throw e;
      }
      if (result.rows.length !== 1) invalid('UNIQUE_RESULT_REQUIRED');
      const row = result.rows[0]!;
      if (['DENIED', 'STALE', 'UNAVAILABLE'].includes(String(row.status)))
        return freeze({
          status: row.status as 'DENIED' | 'STALE' | 'UNAVAILABLE',
          code: 'CURRENT_FINANCIAL_' + String(row.status),
        });
      if (row.status !== 'PAGE' && row.status !== 'EMPTY')
        invalid('INVALID_STATUS');
      const scope = obj(row.scope_json),
        source = obj(row.source_json),
        page = obj(row.page_json),
        coverage = obj(source.currentFinancialCoverage),
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
      const current = ['ledger-balances', 'treasury-capacity'].includes(
        input.dataset,
      );
      if (
        source.dataNature !==
          (current
            ? POSTWAR_FINANCIAL_CURRENT_DATA_NATURE
            : POSTWAR_FINANCIAL_OPENING_DATA_NATURE) ||
        !uint(observed.worldVersion) ||
        observed.worldVersion === '0' ||
        !uint(observed.eventSequence) ||
        observed.eventSequence === '0' ||
        source.worldVersion !== (current ? observed.worldVersion : '0') ||
        source.eventSequence !== (current ? observed.eventSequence : '0') ||
        source.originWorldVersion !== '0' ||
        source.originEventSequence !== '0' ||
        coverage.schemaVersion !==
          'postwar-financial-current-prefix-coverage-v1' ||
        coverage.reducerVersion !==
          'POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1' ||
        coverage.globalWorldVersion !== observed.worldVersion ||
        coverage.globalEventSequence !== observed.eventSequence ||
        coverage.noFinancialPostings !== true ||
        coverage.noInventoryPostings !== true ||
        !fp(coverage.prefixFingerprint) ||
        !fp(coverage.knownEffectsFingerprint) ||
        !text(coverage.coverageRef) ||
        !text(coverage.coveredThroughEventId) ||
        !fp(coverage.coveredThroughEventFingerprint) ||
        !fp(source.sourceVersion) ||
        !fp(source.seedFingerprint) ||
        !text(source.admissionRef) ||
        (input.expectedVersion !== undefined &&
          input.expectedVersion !== source.sourceVersion)
      )
        invalid('CURRENT_NO_POSTING_COVERAGE_REQUIRED');
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
      const raw =
        typeof row.rows_text === 'string'
          ? row.rows_text
          : invalid('ROWS_REQUIRED');
      if (
        Buffer.byteLength(raw) > 48000 ||
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
      const value = { status: row.status, scope, source, page, rows };
      if (Buffer.byteLength(JSON.stringify(value)) > 65536)
        invalid('RESPONSE_SIZE');
      return freeze(value) as unknown as PostwarFinancialCurrentPage;
    },
  });
}
