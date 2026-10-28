/** Online reads are bounded derived pages and metadata only. Full canonical
 * seed validation/publication is an offline server job, never this request path. */
import { createHash } from 'node:crypto';
import {
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
  canonicalSerialize,
  type AuthenticatedCurrentSeatResponseDto,
} from '@econmind/core';
import {
  createPostwarOfficeProjectionStore,
  PostwarOfficeProjectionStoreError,
  POSTWAR_PROJECTION_DATASETS,
  type PostwarOfficeProjectionPage,
  type PostwarOfficeProjectionSeatHeader,
  type PostwarProjectionOffice,
} from '@econmind/world-worker/postwar-office-runtime';
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
type SuccessPage = Extract<
  PostwarOfficeProjectionPage,
  { status: 'PAGE' | 'EMPTY' }
>;
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
              | 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY'
              | 'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION';
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
            admissionRef: string;
            worldVersion: string;
            eventSequence: string;
            pageHash: string;
            returnedRowsHash: string;
            hashAlgorithm: string;
            currentStateBinding?: SuccessPage['source']['currentStateBinding'];
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
    !Object.hasOwn(POSTWAR_PROJECTION_DATASETS, office) ||
    (request.operation !== POSTWAR_CURRENT_OFFICE_RUNTIME_OPERATION &&
      !(
        request.operation === POSTWAR_OFFICE_RUNTIME_OPERATION &&
        office === 'SOCIAL'
      )) ||
    typeof request.dataset !== 'string' ||
    !(
      POSTWAR_PROJECTION_DATASETS[
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
  header: PostwarOfficeProjectionSeatHeader,
): ServerVerifiedReadBinding {
  const scope = header.scope,
    source = header.source;
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
      worldVersion: source.worldVersion,
      eventSequence: source.eventSequence,
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
        ...(page.source.currentStateBinding === undefined
          ? {}
          : { currentStateBinding: page.source.currentStateBinding }),
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
) {
  const c = explicitReadConfig(config);
  const verifier = c ? createSupabaseJwksSignatureVerifier(c.auth) : null;
  const snapshots = c ? createPostgresServerReadBindingSnapshotReader(c) : null;
  const store = c
    ? createPostwarOfficeProjectionStore({
        runtimeReaderRole: c.readerRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
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
                const page = await store.readPageFrom(read, {
                  worldId: c.admittedWorldPins.worldId,
                  officeId: request.office,
                  dataset: request.dataset,
                  offset: request.offset,
                  limit: request.limit,
                  ...(request.expectedVersion
                    ? { expectedVersion: request.expectedVersion }
                    : {}),
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
                  page.scope.officeId !== request.office
                )
                  return fail(403, 'CURRENT_SCOPE_NOT_AUTHORIZED');
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
