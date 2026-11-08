import {
  INDUSTRY_UTILITY_PLANNING_DATASET,
  INDUSTRY_UTILITY_PLANNING_NATURE,
  parseIndustryUtilityPlanningRow,
  parseIndustryUtilityPlanningCoverage,
  type IndustryUtilityPlanningCoverage,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import {
  isPostwarIndustryUtilityPlanningReader,
  type PostwarIndustryUtilityPlanningReader,
} from '@econmind/world-worker/postwar-industry-utility-planning-read';
import {
  POSTWAR_TRADE_CURRENT_DATASETS,
  type PostwarTradeCurrentDataset,
} from '@econmind/core/postwar-trade-current-contract';
import {
  createPostwarTradeCurrentProjectionStore,
  type PostwarTradeCurrentSource,
} from '@econmind/world-worker/postwar-trade-current-read';
import { INDUSTRY_RUN_PARAMETERS_DATASET } from '@econmind/core/postwar-industry-run-parameters-contract';
import { createPostwarIndustryRunParametersReader } from '@econmind/world-worker/postwar-industry-run-parameters-read';
/** Online reads are bounded derived pages and metadata only. Full canonical
 * seed validation/publication is an offline server job, never this request path. */
import { createHash } from 'node:crypto';
import { POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET } from '@econmind/core/postwar-industry-labour-current-contract';
import {
  createPostwarIndustryLabourCurrentProjectionStore,
  type PostwarIndustryLabourCurrentSource,
} from '@econmind/world-worker/postwar-industry-labour-current-read';
import { POSTWAR_CAPTAIN_CURRENT_DATASET } from '@econmind/core/postwar-captain-current-contract';
import {
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
  canonicalSerialize,
  type AuthenticatedCurrentSeatResponseDto,
} from '@econmind/core';
import {
  createPostwarOfficeProjectionStore,
  createPostwarSocialMixedCurrentProjectionStore,
  createPostwarCaptainCurrentProjectionStore,
  type PostwarCaptainCurrentSource,
  type PostwarSocialMixedCurrentSource,
  PostwarOfficeProjectionStoreError,
  POSTWAR_PROJECTION_DATASETS,
  type PostwarOfficeProjectionPage,
  type PostwarOfficeProjectionSeatHeader,
  type PostwarProjectionOffice,
} from '@econmind/world-worker/postwar-office-runtime';
import {
  createPostwarFinancialMixedCurrentProjectionStore,
  POSTWAR_FINANCIAL_CURRENT_DATASETS,
  type PostwarFinancialCurrentSource,
  type PostwarFinancialMixedCurrentSource,
} from '@econmind/world-worker/postwar-financial-current-read';
import {
  createPostwarPhysicalOpeningHeadReader,
  createPostwarPhysicalInventoryProvenanceReader,
} from '@econmind/world-worker/postwar-physical-opening-facts-read';
import {
  explicitReadConfig,
  matchesReadPins,
  type ExplicitReadPreparationConfig,
} from '../runtime-preparation/explicit-read-preparation-config.js';
import {
  bearer,
  exact,
  parseCurrentSeatRequest,
  uuid,
} from '../runtime-preparation/bounded-executor-transport.js';
import { trackRequestCompletion } from '../runtime-preparation/request-completion.js';
import { createPostgresServerReadBindingSnapshotReader } from './postgres-server-read-binding.js';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import {
  parseSupabaseAuthSubject,
  verifySupabaseJwtClaims,
  type ValidatedJwtClaims,
} from './identity.js';
import type { ServerVerifiedReadBinding } from './https-authenticated-read-composition.js';
import { WorldReadFailure } from './transport.js';

export const POSTWAR_OFFICE_RUNTIME_SCHEMA =
  'postwar-office-runtime-read-v1' as const;
export const POSTWAR_OFFICE_RUNTIME_OPERATION =
  'READ_CURRENT_SOCIAL_OPENING' as const;
export const POSTWAR_CURRENT_OFFICE_RUNTIME_OPERATION =
  'READ_CURRENT_OFFICE_OPENING' as const;
type OriginalSuccessPage = Extract<
  PostwarOfficeProjectionPage,
  { status: 'PAGE' | 'EMPTY' }
>;
type FinancialReadSource =
  PostwarFinancialCurrentSource | PostwarFinancialMixedCurrentSource;
type PageSourceNature =
  | OriginalSuccessPage['source']['dataNature']
  | FinancialReadSource['dataNature']
  | PostwarSocialMixedCurrentSource['dataNature']
  | PostwarCaptainCurrentSource['dataNature']
  | PostwarIndustryLabourCurrentSource['dataNature']
  | PostwarTradeCurrentSource['dataNature']
  | 'ADMITTED_IMMUTABLE_OPENING_FACTS'
  | typeof INDUSTRY_UTILITY_PLANNING_NATURE;
type SuccessPage = Omit<OriginalSuccessPage, 'source'> & {
  readonly source: Omit<
    OriginalSuccessPage['source'],
    | 'dataNature'
    | 'currentPrefixCoverage'
    | 'currentStateBinding'
    | 'canonicalSeedSha256'
  > & {
    readonly currentPrefixCoverage?:
      | OriginalSuccessPage['source']['currentPrefixCoverage']
      | PostwarSocialMixedCurrentSource['currentPrefixCoverage'];
    readonly currentStateBinding?:
      | OriginalSuccessPage['source']['currentStateBinding']
      | PostwarSocialMixedCurrentSource['currentStateBinding'];
    readonly dataNature: PageSourceNature;
    readonly currentIndustryUtilityPlanningCoverage?: IndustryUtilityPlanningCoverage;
    readonly currentFinancialCoverage?: FinancialReadSource['currentFinancialCoverage'];
    readonly centralBankOpeningInstruments?: PostwarFinancialMixedCurrentSource['centralBankOpeningInstruments'];
    readonly currentCaptainCoverage?: PostwarCaptainCurrentSource['currentCaptainCoverage'];
    readonly currentTradeCoverage?: PostwarTradeCurrentSource['currentTradeCoverage'];
    readonly currentCaptainAllocationOptions?: PostwarCaptainCurrentSource['currentCaptainAllocationOptions'];
    readonly currentIndustryLabourCoverage?: PostwarIndustryLabourCurrentSource['currentIndustryLabourCoverage'];
    readonly originWorldVersion?: string;
    readonly originEventSequence?: string;
    readonly observedHead?: Readonly<{
      worldVersion: string;
      eventSequence: string;
    }>;
  } & (
      | Readonly<{
          dataNature: typeof INDUSTRY_UTILITY_PLANNING_NATURE;
          canonicalSeedSha256?: never;
        }>
      | Readonly<{
          dataNature: Exclude<
            PageSourceNature,
            typeof INDUSTRY_UTILITY_PLANNING_NATURE
          >;
          canonicalSeedSha256: string;
        }>
    );
};
const OFFICE_RUNTIME_DATASETS = Object.freeze({
  ...POSTWAR_PROJECTION_DATASETS,
  ...POSTWAR_FINANCIAL_CURRENT_DATASETS,
  INDUSTRY: [
    INDUSTRY_UTILITY_PLANNING_DATASET,
    INDUSTRY_RUN_PARAMETERS_DATASET,
    POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET,
    ...POSTWAR_PROJECTION_DATASETS.INDUSTRY,
  ],
  TRADE: [
    ...POSTWAR_TRADE_CURRENT_DATASETS,
    ...POSTWAR_PROJECTION_DATASETS.TRADE,
  ],
  CAPTAIN: [
    POSTWAR_CAPTAIN_CURRENT_DATASET,
    ...POSTWAR_PROJECTION_DATASETS.CAPTAIN,
  ],
});
export type PostwarOfficeRuntimeServiceResponse = Readonly<{
  httpStatus: number;
  body: Readonly<{
    schemaVersion: typeof POSTWAR_OFFICE_RUNTIME_SCHEMA;
    requestId: string;
  }> &
    (
      | Readonly<{
          ok: true;
          status: 'AVAILABLE' | 'EMPTY';
          dataset: string;
          authority: ServerVerifiedReadBinding;
          source: Readonly<{
            dataNature:
              | Exclude<
                  SuccessPage['source']['dataNature'],
                  'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY'
                >
              | 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY';
            sourceVersion: string;
            bindingVersion: string;
            sourceRevision: string;
            worldId: string;
            countryId: string;
            officeId: PostwarProjectionOffice;
            authSubjectId: string;
            authorizationRevision: string;
            scopeKey: string;
            modelVersion: string;
            seedRef: string;
            contentHash: string;
            canonicalSeedSha256?: string;
            sourceBundleSha256?: string;
            admissionRef: string;
            worldVersion: string;
            eventSequence: string;
            pageHash: string;
            returnedRowsHash: string;
            hashAlgorithm: string;
            sourcePointer: SuccessPage['source']['sourcePointer'];
            currentIndustryUtilityPlanningCoverage?: IndustryUtilityPlanningCoverage;
            currentStateBinding?: SuccessPage['source']['currentStateBinding'];
            currentPrefixCoverage?: SuccessPage['source']['currentPrefixCoverage'];
            currentFinancialCoverage?: SuccessPage['source']['currentFinancialCoverage'];
            centralBankOpeningInstruments?: PostwarFinancialMixedCurrentSource['centralBankOpeningInstruments'];
            currentCaptainCoverage?: SuccessPage['source']['currentCaptainCoverage'];
            currentTradeCoverage?: SuccessPage['source']['currentTradeCoverage'];
            currentCaptainAllocationOptions?: SuccessPage['source']['currentCaptainAllocationOptions'];
            originWorldVersion?: string;
            originEventSequence?: string;
            observedHead?: Readonly<{
              worldVersion: string;
              eventSequence: string;
            }>;
          }>;
          page: SuccessPage['page'];
          rows: readonly unknown[];
        }>
      | Readonly<{
          ok: false;
          error: Readonly<{ code: string; retryable: boolean }>;
        }>
    );
}>;
function parseRequest(value: unknown) {
  const request = exact(
    value,
    ['schemaVersion', 'requestId', 'operation', 'dataset'],
    ['officeId', 'page'],
  );
  const office = request.officeId ?? 'SOCIAL';
  if (
    request.schemaVersion !== POSTWAR_OFFICE_RUNTIME_SCHEMA ||
    !uuid(request.requestId) ||
    typeof office !== 'string' ||
    !Object.hasOwn(OFFICE_RUNTIME_DATASETS, office) ||
    (request.operation !== POSTWAR_CURRENT_OFFICE_RUNTIME_OPERATION &&
      !(
        request.operation === POSTWAR_OFFICE_RUNTIME_OPERATION &&
        office === 'SOCIAL'
      )) ||
    typeof request.dataset !== 'string' ||
    !(
      OFFICE_RUNTIME_DATASETS[
        office as PostwarProjectionOffice
      ] as readonly string[]
    ).includes(request.dataset)
  )
    throw Error('INVALID_REQUEST');
  const page = exact(
    request.page ?? {},
    [],
    ['offset', 'limit', 'sourceVersion', 'bindingVersion'],
  );
  const offset = page.offset ?? 0,
    limit = page.limit ?? 25;
  if (
    !Number.isSafeInteger(offset) ||
    Number(offset) < 0 ||
    Number(offset) > 100000 ||
    !Number.isSafeInteger(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 100
  )
    throw Error('INVALID_REQUEST');
  for (const name of ['sourceVersion', 'bindingVersion'])
    if (
      page[name] !== undefined &&
      (typeof page[name] !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/u.test(page[name]))
    )
      throw Error('INVALID_REQUEST');
  if (
    Number(offset) > 0 &&
    (page.sourceVersion === undefined || page.bindingVersion === undefined)
  )
    throw Error('INVALID_REQUEST');
  return {
    requestId: request.requestId,
    office: office as PostwarProjectionOffice,
    dataset: request.dataset,
    offset: Number(offset),
    limit: Number(limit),
    expectedVersion: page.sourceVersion as string | undefined,
    expectedBinding: page.bindingVersion as string | undefined,
  };
}
/** These bindings are actual SQL header reads, never `{}` projection payloads.
 * New projectionVersion requires a real bounded-page readback before UI connect. */
function authority(
  header: PostwarOfficeProjectionSeatHeader | SuccessPage,
): ServerVerifiedReadBinding {
  const scope = header.scope,
    source = header.source;
  const observed = 'observedHead' in source ? source.observedHead : undefined;
  const seed = {
    worldId: scope.worldId,
    seedRef: source.seedId,
    contentHash: source.seedFingerprint,
    admissionRef: source.admissionRef,
  };
  return {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: scope.seatRef,
    seatState: 'ACTIVE',
    identity: {
      authSubjectId: parseSupabaseAuthSubject(scope.authSubject),
      worldId: scope.worldId,
      countryId: scope.countryId,
      officeId: scope.officeId,
      scopeKey: scope.scopeKey,
      classification: 'OFFICE_PRIVATE',
      authorizationRevision: scope.authorizationVersion,
      modelVersion: source.modelVersion,
      projectionVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
    },
    seed,
    readback: {
      ...seed,
      worldVersion: observed?.worldVersion ?? source.worldVersion,
      eventSequence: observed?.eventSequence ?? source.eventSequence,
      readbackRef: source.admissionRef,
    },
  };
}
function boundVersion(page: SuccessPage, dataset: string): string {
  return `sha256:${createHash('sha256')
    .update(
      canonicalSerialize({
        scope: page.scope,
        dataset,
        sourceVersion: page.source.sourceVersion,
        sourceRevision: page.source.sourceRevision,
      }),
      'utf8',
    )
    .digest('hex')}`;
}
function pageBody(
  page: SuccessPage,
  request: ReturnType<typeof parseRequest>,
): PostwarOfficeRuntimeServiceResponse {
  const bindingVersion = boundVersion(page, request.dataset);
  if (
    request.expectedBinding !== undefined &&
    request.expectedBinding !== bindingVersion
  )
    return {
      httpStatus: 409,
      body: {
        schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
        requestId: request.requestId,
        ok: false,
        error: { code: 'STALE_SOURCE_SCOPE', retryable: false },
      },
    };
  return {
    httpStatus: 200,
    body: {
      schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
      requestId: request.requestId,
      ok: true,
      status: page.status === 'EMPTY' ? 'EMPTY' : 'AVAILABLE',
      dataset: request.dataset,
      authority: authority(page),
      source: {
        dataNature:
          page.source.dataNature ===
          'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY'
            ? 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY'
            : page.source.dataNature,
        sourceVersion: page.source.sourceVersion,
        bindingVersion,
        sourceRevision: page.source.sourceRevision,
        worldId: page.scope.worldId,
        countryId: page.scope.countryId,
        officeId: page.scope.officeId,
        authSubjectId: page.scope.authSubject,
        authorizationRevision: page.scope.authorizationVersion,
        scopeKey: page.scope.scopeKey,
        modelVersion: page.source.modelVersion,
        seedRef: page.source.seedId,
        contentHash: page.source.seedFingerprint,
        admissionRef: page.source.admissionRef,
        worldVersion: page.source.worldVersion,
        eventSequence: page.source.eventSequence,
        pageHash: page.source.pageHash,
        returnedRowsHash: page.source.returnedRowsHash,
        hashAlgorithm: page.source.hashAlgorithm,
        sourcePointer:
          request.dataset === 'opening-inventory-entries' &&
          page.source.sourcePointer.schemaVersion !==
            'postwar-inventory-source-pointer-v2'
            ? {
                ...page.source.sourcePointer,
                sourceRole:
                  'LEGACY_OPERATING_ADOPTION_CONTEXT_NOT_DIRECT_ROW_SOURCE',
              }
            : page.source.sourcePointer,
        ...(page.source.currentStateBinding === undefined
          ? {}
          : { currentStateBinding: page.source.currentStateBinding }),
        ...(page.source.currentPrefixCoverage === undefined
          ? {}
          : { currentPrefixCoverage: page.source.currentPrefixCoverage }),
        ...(page.source.centralBankOpeningInstruments === undefined
          ? {}
          : {
              centralBankOpeningInstruments:
                page.source.centralBankOpeningInstruments,
              canonicalSeedSha256:
                page.source.centralBankOpeningInstruments.canonicalSeedSha256,
              sourceBundleSha256:
                page.source.centralBankOpeningInstruments.sourceBundleSha256,
            }),
        ...(page.source.currentFinancialCoverage === undefined
          ? {}
          : { currentFinancialCoverage: page.source.currentFinancialCoverage }),
        ...(page.source.currentIndustryLabourCoverage === undefined
          ? {}
          : {
              currentIndustryLabourCoverage:
                page.source.currentIndustryLabourCoverage,
            }),
        ...(page.source.currentTradeCoverage === undefined
          ? {}
          : { currentTradeCoverage: page.source.currentTradeCoverage }),
        ...(page.source.currentIndustryUtilityPlanningCoverage === undefined
          ? {}
          : {
              currentIndustryUtilityPlanningCoverage:
                page.source.currentIndustryUtilityPlanningCoverage,
            }),
        ...(page.source.currentCaptainAllocationOptions === undefined
          ? {}
          : {
              currentCaptainAllocationOptions:
                page.source.currentCaptainAllocationOptions,
            }),
        ...(page.source.currentCaptainCoverage === undefined
          ? {}
          : { currentCaptainCoverage: page.source.currentCaptainCoverage }),
        ...(page.source.observedHead === undefined
          ? {}
          : { observedHead: page.source.observedHead }),
        ...(page.source.originWorldVersion === undefined
          ? {}
          : { originWorldVersion: page.source.originWorldVersion }),
        ...(page.source.originEventSequence === undefined
          ? {}
          : { originEventSequence: page.source.originEventSequence }),
      },
      page: page.page,
      rows: page.rows,
    },
  };
}

/** Uses the existing verified-subject/role/READ ONLY/abort/cleanup lifecycle,
 * with no call to the legacy full-seed facts/current-seat hydrators. country,
 * team and revision are always derived by the Native metadata/page SQL. An
 * office enum in the request is a selector, independently authorized in SQL. */
export function createPostwarOfficeRuntimeReadService(
  config: ExplicitReadPreparationConfig | null = null,
  dependencies: Readonly<{
    industryUtilityPlanningReader?: Readonly<PostwarIndustryUtilityPlanningReader>;
  }> = {},
) {
  const c = explicitReadConfig(config);
  const industryUtilityPlanningReader =
    dependencies.industryUtilityPlanningReader ?? null;
  if (
    industryUtilityPlanningReader &&
    (!c ||
      !isPostwarIndustryUtilityPlanningReader(
        industryUtilityPlanningReader,
        c.admittedWorldPins.worldId,
      ))
  )
    throw Error('GENUINE_INDUSTRY_UTILITY_PLANNING_READER_REQUIRED');
  const verifier = c ? createSupabaseJwksSignatureVerifier(c.auth) : null;
  const snapshots = c ? createPostgresServerReadBindingSnapshotReader(c) : null;
  const store = c
    ? createPostwarOfficeProjectionStore({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const socialStore = c
    ? createPostwarSocialMixedCurrentProjectionStore({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const financialStore = c
    ? createPostwarFinancialMixedCurrentProjectionStore({
        includeCentralBankOpeningInstruments: true,
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const industryParametersStore = c
    ? createPostwarIndustryRunParametersReader({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const industryLabourStore = c
    ? createPostwarIndustryLabourCurrentProjectionStore({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const tradeStore = c
    ? createPostwarTradeCurrentProjectionStore({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const captainStore = c
    ? createPostwarCaptainCurrentProjectionStore({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
      })
    : null;
  const physicalStore = c
    ? createPostwarPhysicalOpeningHeadReader({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
        expectedSeedFingerprint: c.admittedWorldPins.contentHash,
      })
    : null;
  const inventoryStore = c
    ? createPostwarPhysicalInventoryProvenanceReader({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
        expectedSeedFingerprint: c.admittedWorldPins.contentHash,
      })
    : null;
  const claimsFor = (authorization: unknown, signal: AbortSignal) => {
    if (!c || !verifier) throw Error('NOT_CONNECTED');
    return verifySupabaseJwtClaims({
      token: bearer(authorization).slice(7),
      verifier,
      policy: {
        expectedIssuer: c.auth.expectedIssuer,
        expectedAudience: c.auth.audience,
        nowEpochSeconds: Math.floor(Date.now() / 1000),
      },
      signal,
    });
  };
  const validHeader = (
    header: PostwarOfficeProjectionSeatHeader,
    claims: ValidatedJwtClaims,
  ) =>
    !!c &&
    header.scope.authSubject === claims.authSubject &&
    matchesReadPins(authority(header), c);
  function errorCode(error: unknown): {
    status: number;
    code: string;
    retryable: boolean;
  } {
    if (error instanceof PostwarOfficeProjectionStoreError)
      return {
        status: /DENIED|CURRENT_SEAT_NOT_COHERENT/u.test(error.code)
          ? 403
          : /INVALID_PAGE_REQUEST|UNKNOWN_DATASET|UNKNOWN_OFFICE/u.test(
                error.code,
              )
            ? 400
            : 503,
        code: error.code,
        retryable: false,
      };
    if (error instanceof WorldReadFailure)
      return {
        status:
          error.code === 'AUTHORIZATION_DENIED'
            ? 403
            : error.code === 'CANCELLED'
              ? 499
              : 503,
        code: error.code,
        retryable: error.retryable,
      };
    if (error instanceof Error && error.message === 'INVALID_REQUEST')
      return { status: 400, code: 'INVALID_REQUEST', retryable: false };
    if (
      error instanceof Error &&
      /JWT|AUTHENTICATION|SUPABASE/u.test(error.message)
    )
      return { status: 401, code: 'AUTHENTICATION_INVALID', retryable: false };
    return { status: 503, code: 'SOURCE_UNAVAILABLE', retryable: true };
  }
  return Object.freeze({
    async handle(input: {
      authorization: unknown;
      request: unknown;
      signal?: AbortSignal;
    }): Promise<PostwarOfficeRuntimeServiceResponse> {
      let requestId = '00000000-0000-4000-8000-000000000000';
      const fail = (
        httpStatus: number,
        code: string,
        retryable = false,
      ): PostwarOfficeRuntimeServiceResponse => ({
        httpStatus,
        body: {
          schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
          requestId,
          ok: false,
          error: { code, retryable },
        },
      });
      if (!c || !verifier || !snapshots || !store)
        return fail(503, 'NOT_CONNECTED');
      try {
        const request = parseRequest(input.request);
        requestId = request.requestId;
        const signal = input.signal ?? new AbortController().signal;
        if (signal.aborted) return fail(499, 'CANCELLED');
        const claims = await claimsFor(input.authorization, signal);
        if (
          request.office === 'INDUSTRY' &&
          request.dataset === INDUSTRY_UTILITY_PLANNING_DATASET
        ) {
          // Release each bounded read connection before using the independent
          // worker source transaction. Nesting a second checkout deadlocks a
          // valid single-connection pool; an RR snapshot is not fresh authority.
          type HeaderSelection =
            | Readonly<{ failure: PostwarOfficeRuntimeServiceResponse }>
            | Readonly<{ header: PostwarOfficeProjectionSeatHeader }>;
          const selectHeader = (identity: ValidatedJwtClaims) =>
            snapshots.withReadOnlyExecutor(
              {
                verifiedSubject: identity.authSubject,
                worldId: c.admittedWorldPins.worldId,
                signal,
              },
              async (read): Promise<HeaderSelection> => {
                try {
                  const headers = await store.readCurrentSeatHeadersFrom(read, {
                    worldId: c.admittedWorldPins.worldId,
                  });
                  if (headers.some((h) => !validHeader(h, identity)))
                    return { failure: fail(503, 'READ_BINDING_UNAVAILABLE') };
                  const selected = headers.filter(
                    (h) => h.scope.officeId === 'INDUSTRY',
                  );
                  if (selected.length !== 1)
                    return {
                      failure: fail(403, 'CURRENT_INDUSTRY_SEAT_REQUIRED'),
                    };
                  return { header: selected[0]! };
                } catch (error) {
                  const failure = errorCode(error);
                  return {
                    failure: fail(
                      failure.status,
                      failure.code,
                      failure.retryable,
                    ),
                  };
                }
              },
            );
          const planningResponse = await trackRequestCompletion(
            (async (): Promise<PostwarOfficeRuntimeServiceResponse> => {
              const selection = await selectHeader(claims);
              if (!selection) return fail(503, 'READ_BINDING_UNAVAILABLE');
              if ('failure' in selection) return selection.failure;
              const before = selection.header;
              if (
                !industryUtilityPlanningReader ||
                !isPostwarIndustryUtilityPlanningReader(
                  industryUtilityPlanningReader,
                  c.admittedWorldPins.worldId,
                )
              )
                return fail(503, 'INDUSTRY_UTILITY_PLANNING_NOT_INSTALLED');
              const planning = await industryUtilityPlanningReader.readPage({
                countryId: before.scope.countryId,
                expectedHead: {
                  worldVersion: before.source.worldVersion,
                  eventSequence: before.source.eventSequence,
                },
                offset: request.offset,
                limit: request.limit,
                ...(request.expectedVersion
                  ? { expectedVersion: request.expectedVersion }
                  : {}),
              });
              if (signal.aborted) return fail(499, 'CANCELLED');
              if (!('source' in planning))
                return fail(
                  planning.status === 'STALE' ? 409 : 503,
                  planning.code,
                );
              // This is a fresh signature/expiry and seat/admission read after the
              // worker transaction, not another SELECT in the old RR snapshot.
              const freshClaims = await claimsFor(input.authorization, signal);
              const checked = await snapshots.withReadOnlyExecutor(
                {
                  verifiedSubject: freshClaims.authSubject,
                  worldId: c.admittedWorldPins.worldId,
                  signal,
                },
                async (read) => {
                  const headers = await store.readCurrentSeatHeadersFrom(read, {
                    worldId: c.admittedWorldPins.worldId,
                  });
                  if (headers.some((h) => !validHeader(h, freshClaims)))
                    return fail(503, 'READ_BINDING_UNAVAILABLE');
                  const selected = headers.filter(
                    (h) => h.scope.officeId === 'INDUSTRY',
                  );
                  if (selected.length !== 1)
                    return fail(403, 'CURRENT_INDUSTRY_SEAT_REQUIRED');
                  const fresh = selected[0]!;
                  if (
                    !fresh ||
                    canonicalSerialize(before.scope) !==
                      canonicalSerialize(fresh.scope)
                  )
                    return fail(409, 'STALE_SOURCE_SCOPE');
                  const ps = planning.source,
                    h = fresh.source;
                  if (
                    !isPostwarIndustryUtilityPlanningReader(
                      industryUtilityPlanningReader,
                      c.admittedWorldPins.worldId,
                    )
                  )
                    return fail(503, 'INDUSTRY_UTILITY_PLANNING_NOT_INSTALLED');
                  for (const key of [
                    'seedId',
                    'seedFingerprint',
                    'admissionRef',
                    'worldVersion',
                    'eventSequence',
                  ] as const)
                    if (ps[key] !== h[key] || before.source[key] !== h[key])
                      return fail(409, 'STALE_SOURCE_SCOPE');
                  if (
                    ps.worldId !== fresh.scope.worldId ||
                    ps.countryId !== fresh.scope.countryId
                  )
                    return fail(403, 'CURRENT_SCOPE_NOT_AUTHORIZED');
                  const coverage = parseIndustryUtilityPlanningCoverage(
                    ps.currentIndustryUtilityPlanningCoverage,
                  );
                  const rows = planning.rows.map(
                    parseIndustryUtilityPlanningRow,
                  );
                  if (
                    coverage.countryId !== fresh.scope.countryId ||
                    coverage.globalWorldVersion !== h.worldVersion ||
                    coverage.globalEventSequence !== h.eventSequence ||
                    rows.some((r) => r.countryId !== fresh.scope.countryId) ||
                    new Set(rows.map((r) => r.planningRef)).size !== rows.length
                  )
                    return fail(503, 'READ_BINDING_UNAVAILABLE');
                  const result = pageBody(
                    {
                      status: planning.status,
                      scope: fresh.scope,
                      source: {
                        ...h,
                        ...ps,
                        sourceRevision: coverage.reducerVersion,
                        dataNature: INDUSTRY_UTILITY_PLANNING_NATURE,
                      },
                      page: planning.page,
                      rows,
                    },
                    request,
                  );
                  if (
                    new TextEncoder().encode(JSON.stringify(result.body))
                      .byteLength > 65536
                  )
                    return fail(503, 'RESPONSE_LIMIT_EXCEEDED');
                  return result;
                },
              );
              return checked ?? fail(503, 'READ_BINDING_UNAVAILABLE');
            })(),
          );
          return signal.aborted ? fail(499, 'CANCELLED') : planningResponse;
        }
        const result = await trackRequestCompletion(
          snapshots.withReadOnlyExecutor(
            {
              verifiedSubject: claims.authSubject,
              worldId: c.admittedWorldPins.worldId,
              signal,
            },
            async (read) => {
              try {
                const headers = await store.readCurrentSeatHeadersFrom(read, {
                  worldId: c.admittedWorldPins.worldId,
                });
                if (headers.some((header) => !validHeader(header, claims)))
                  return fail(503, 'READ_BINDING_UNAVAILABLE');
                const selected = headers.filter(
                  (header) => header.scope.officeId === request.office,
                );
                if (selected.length !== 1)
                  return fail(403, 'CURRENT_OFFICE_SEAT_REQUIRED');
                const pageRequest = {
                  worldId: c.admittedWorldPins.worldId,
                  dataset: request.dataset,
                  offset: request.offset,
                  limit: request.limit,
                  ...(request.expectedVersion
                    ? { expectedVersion: request.expectedVersion }
                    : {}),
                };
                const head = selected[0]!.source;
                const page =
                  request.office === 'TRADE' &&
                  POSTWAR_TRADE_CURRENT_DATASETS.some(
                    (x) => x === request.dataset,
                  )
                    ? await tradeStore!.readPageFrom(read, {
                        worldId: pageRequest.worldId,
                        dataset: request.dataset as PostwarTradeCurrentDataset,
                        offset: pageRequest.offset,
                        limit: pageRequest.limit,
                        ...(pageRequest.expectedVersion
                          ? { expectedVersion: pageRequest.expectedVersion }
                          : {}),
                      })
                    : request.office === 'INDUSTRY' &&
                        request.dataset === INDUSTRY_RUN_PARAMETERS_DATASET
                      ? await industryParametersStore!.readPageFrom(read, {
                          worldId: pageRequest.worldId,
                          offset: pageRequest.offset,
                          limit: pageRequest.limit,
                          ...(pageRequest.expectedVersion
                            ? { expectedVersion: pageRequest.expectedVersion }
                            : {}),
                        })
                      : request.office === 'INDUSTRY' &&
                          request.dataset ===
                            POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET
                        ? await industryLabourStore!.readPageFrom(read, {
                            worldId: pageRequest.worldId,
                            offset: pageRequest.offset,
                            limit: pageRequest.limit,
                            ...(pageRequest.expectedVersion
                              ? { expectedVersion: pageRequest.expectedVersion }
                              : {}),
                          })
                        : request.office === 'CAPTAIN' &&
                            request.dataset === POSTWAR_CAPTAIN_CURRENT_DATASET
                          ? await captainStore!.readPageFrom(read, {
                              worldId: pageRequest.worldId,
                              offset: pageRequest.offset,
                              limit: pageRequest.limit,
                              ...(pageRequest.expectedVersion
                                ? {
                                    expectedVersion:
                                      pageRequest.expectedVersion,
                                  }
                                : {}),
                            })
                          : (request.office === 'FINANCE' ||
                                request.office === 'CENTRAL_BANK') &&
                              (head.worldVersion !== '0' ||
                                [
                                  'ledger-balances',
                                  'treasury-capacity',
                                ].includes(request.dataset))
                            ? await financialStore!.readPageFrom(read, {
                                ...pageRequest,
                                officeId: request.office,
                              })
                            : request.office === 'SOCIAL' &&
                                head.worldVersion !== '0' &&
                                ['positions', 'service-pools'].includes(
                                  request.dataset,
                                )
                              ? await socialStore!.readPageFrom(read, {
                                  ...pageRequest,
                                  officeId: 'SOCIAL',
                                })
                              : (request.office === 'INDUSTRY' ||
                                    request.office === 'TRADE' ||
                                    request.office === 'CAPTAIN') &&
                                  head.worldVersion !== '0'
                                ? await (
                                    request.dataset ===
                                    'opening-inventory-entries'
                                      ? inventoryStore!
                                      : physicalStore!
                                  ).readPageFrom(read, {
                                    ...pageRequest,
                                    officeId: request.office,
                                  })
                                : await store.readPageFrom(read, {
                                    ...pageRequest,
                                    officeId: request.office,
                                  });
                if (!('scope' in page))
                  return fail(
                    page.status === 'DENIED'
                      ? 403
                      : page.status === 'STALE'
                        ? 409
                        : 503,
                    page.code,
                  );
                if (
                  !validHeader(page, claims) ||
                  page.scope.officeId !== request.office ||
                  (((request.office === 'TRADE' &&
                    POSTWAR_TRADE_CURRENT_DATASETS.some(
                      (x) => x === request.dataset,
                    )) ||
                    (request.office === 'CAPTAIN' &&
                      request.dataset === POSTWAR_CAPTAIN_CURRENT_DATASET) ||
                    (request.office === 'INDUSTRY' &&
                      request.dataset ===
                        POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET)) &&
                    canonicalSerialize(page.scope) !==
                      canonicalSerialize(selected[0]!.scope))
                )
                  return fail(403, 'CURRENT_SCOPE_NOT_AUTHORIZED');
                if (
                  request.office === 'INDUSTRY' &&
                  request.dataset === POSTWAR_INDUSTRY_LABOUR_CURRENT_DATASET &&
                  (page.source.worldVersion !== head.worldVersion ||
                    page.source.eventSequence !== head.eventSequence)
                )
                  return fail(503, 'READ_BINDING_UNAVAILABLE');
                return pageBody(page, request);
              } catch (error) {
                const failure = errorCode(error);
                return fail(failure.status, failure.code, failure.retryable);
              }
            },
          ),
        );
        if (signal.aborted) return fail(499, 'CANCELLED');
        if (
          result &&
          new TextEncoder().encode(JSON.stringify(result.body)).byteLength >
            65536
        )
          return fail(503, 'RESPONSE_LIMIT_EXCEEDED');
        return result ?? fail(503, 'READ_BINDING_UNAVAILABLE');
      } catch (error) {
        if (input.signal?.aborted) return fail(499, 'CANCELLED');
        const failure = errorCode(error);
        return fail(failure.status, failure.code, failure.retryable);
      }
    },
    async handleCurrentSeat(input: {
      authorization: unknown;
      request: unknown;
      signal?: AbortSignal;
    }): Promise<{
      httpStatus: number;
      body: AuthenticatedCurrentSeatResponseDto;
    }> {
      let requestId = '00000000-0000-4000-8000-000000000000';
      const fail = (httpStatus: number, code: string, retryable = false) => ({
        httpStatus,
        body: {
          schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
          requestId,
          ok: false as const,
          error: { code, retryable },
        },
      });
      if (!c || !verifier || !snapshots || !store)
        return fail(503, 'NOT_CONNECTED');
      try {
        const request = parseCurrentSeatRequest(input.request);
        requestId = request.requestId;
        const signal = input.signal ?? new AbortController().signal;
        if (signal.aborted) return fail(499, 'CANCELLED');
        const claims = await claimsFor(input.authorization, signal);
        const result = await trackRequestCompletion(
          snapshots.withReadOnlyExecutor(
            {
              verifiedSubject: claims.authSubject,
              worldId: c.admittedWorldPins.worldId,
              signal,
            },
            async (read) => {
              try {
                const headers = await store.readCurrentSeatHeadersFrom(read, {
                  worldId: c.admittedWorldPins.worldId,
                });
                if (!headers.length) {
                  return fail(503, 'READ_BINDING_UNAVAILABLE');
                }
                if (headers.some((header) => !validHeader(header, claims)))
                  return fail(503, 'READ_BINDING_UNAVAILABLE');
                return {
                  httpStatus: 200,
                  body: {
                    schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
                    requestId,
                    ok: true as const,
                    session: {
                      authSubjectId: claims.authSubject,
                      issuedAtEpochSeconds: claims.issuedAtEpochSeconds,
                      expiresAtEpochSeconds: claims.expiresAtEpochSeconds,
                    },
                    world: c.admittedWorldPins,
                    bindings: headers.map(authority),
                  },
                };
              } catch (error) {
                const failure = errorCode(error);
                return fail(failure.status, failure.code, failure.retryable);
              }
            },
          ),
        );
        if (signal.aborted) return fail(499, 'CANCELLED');
        if (
          result &&
          new TextEncoder().encode(JSON.stringify(result.body)).byteLength >
            65536
        )
          return fail(503, 'RESPONSE_LIMIT_EXCEEDED');
        return result ?? fail(503, 'READ_BINDING_UNAVAILABLE');
      } catch (error) {
        if (input.signal?.aborted) return fail(499, 'CANCELLED');
        const failure = errorCode(error);
        return fail(failure.status, failure.code, failure.retryable);
      }
    },
  });
}
