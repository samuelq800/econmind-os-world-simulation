import {
  readTradeContractRuntimePage,
  type ServerTradeContractRuntimeScope,
  type TradeContractRuntimePage,
  type TradeContractRuntimePageRequest,
} from '../read-models/trade-contract-runtime-reader.js';
import {
  explicitReadConfig,
  matchesReadPins,
  type ExplicitReadPreparationConfig,
} from '../runtime-preparation/explicit-read-preparation-config.js';
import {
  bearer,
  exact,
  uuid,
} from '../runtime-preparation/bounded-executor-transport.js';
import { trackRequestCompletion } from '../runtime-preparation/request-completion.js';
import {
  createAuthenticatedCurrentSeatReader,
  CurrentSeatReadError,
  enumerateCurrentSeatSelectors,
} from './authenticated-current-seat-reader.js';
import { createPostgresServerReadBindingSnapshotReader } from './postgres-server-read-binding.js';
import { createPersistedReadBindingConsumer } from './postgres-full-read-provider.js';
import { createPostgresRuntimeReadExecutor } from './postgres-runtime-read-executor.js';
import { createSupabaseJwksSignatureVerifier } from './supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from './identity.js';
import { WorldReadFailure } from './transport.js';

export const TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA =
  'trade-committed-evidence-query-v1' as const;
export const TRADE_CONTRACT_RUNTIME_QUERY_OPERATION =
  'READ_OWN_COMMITTED_TRADE_EVIDENCE' as const;
// No browser-supplied World/country/role/team/revision or SQL is accepted.
export const TRADE_CURRENT_TEAM_QUERY = `
select distinct team_id,authorization_version
from world_v2.current_commit_authorization
where world_id=$1 and auth_subject=$2::uuid and country_id=$3
  and office_id='TRADE' and capability='TRADE_CONTRACTS' and authorization_version=$4 and active
limit 2`.trim();

export type TradeRuntimeServiceResponse = Readonly<{
  httpStatus: number;
  body: Readonly<{
    schemaVersion: typeof TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA;
    requestId: string;
  }> &
    (
      | Readonly<{ ok: true; page: TradeContractRuntimePage }>
      | Readonly<{
          ok: false;
          error: Readonly<{ code: string; retryable: boolean }>;
        }>
    );
}>;

function parseRequest(value: unknown) {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw Error('INVALID_REQUEST');
  }
  if (serialized === undefined || Buffer.byteLength(serialized) > 16384)
    throw Error('INVALID_REQUEST');
  const request = exact(
    value,
    ['schemaVersion', 'requestId', 'operation'],
    ['page'],
  );
  if (
    request.schemaVersion !== TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA ||
    request.operation !== TRADE_CONTRACT_RUNTIME_QUERY_OPERATION ||
    !uuid(request.requestId)
  )
    throw Error('INVALID_REQUEST');
  const page = exact(request.page ?? {}, [], ['limit', 'cursor']);
  if (
    page.limit !== undefined &&
    (!Number.isSafeInteger(page.limit) ||
      Number(page.limit) < 1 ||
      Number(page.limit) > 100)
  )
    throw Error('INVALID_REQUEST');
  return {
    requestId: request.requestId,
    page: page as TradeContractRuntimePageRequest,
  };
}

/** Authenticated read-only service for the existing HTTP adapter shape. No
 * production host/barrel registration, connection startup, grants or writes.
 * All authority comes from signature verification and persisted readers, never
 * a caller-supplied scope. A missing/unadmitted binding remains unavailable.
 */
export function createTradeContractRuntimeReadService(
  config: ExplicitReadPreparationConfig | null = null,
) {
  const c = explicitReadConfig(config);
  const verifier = c ? createSupabaseJwksSignatureVerifier(c.auth) : null;
  const seats = c ? createAuthenticatedCurrentSeatReader(c) : null;
  const snapshot = c ? createPostgresServerReadBindingSnapshotReader(c) : null;
  const consume = c ? createPersistedReadBindingConsumer(c) : null;
  const executor = c ? createPostgresRuntimeReadExecutor(c) : null;
  return Object.freeze({
    async handle(input: {
      authorization: unknown;
      request: unknown;
      signal?: AbortSignal;
    }): Promise<TradeRuntimeServiceResponse> {
      let requestId = '00000000-0000-4000-8000-000000000000';
      const fail = (
        httpStatus: number,
        code: string,
        retryable = false,
      ): TradeRuntimeServiceResponse => ({
        httpStatus,
        body: {
          schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
          requestId,
          ok: false,
          error: { code, retryable },
        },
      });
      if (!c || !verifier || !seats || !snapshot || !consume || !executor)
        return fail(503, 'NOT_CONNECTED');
      try {
        const request = parseRequest(input.request);
        requestId = request.requestId;
        const signal = input.signal ?? new AbortController().signal;
        if (signal.aborted) return fail(499, 'CANCELLED');
        const claims = await verifySupabaseJwtClaims({
          token: bearer(input.authorization).slice(7),
          verifier,
          policy: {
            expectedIssuer: c.auth.expectedIssuer,
            expectedAudience: c.auth.audience,
            nowEpochSeconds: Math.floor(Date.now() / 1000),
          },
          signal,
        });
        const current = await trackRequestCompletion(
          seats.read({
            verifiedSubject: claims.authSubject,
            worldId: c.admittedWorldPins.worldId,
            signal,
          }),
        );
        if (
          !current?.length ||
          current.some((binding) => !matchesReadPins(binding, c))
        )
          return fail(503, 'READ_BINDING_UNAVAILABLE');
        const trade = current.filter(
          (binding) =>
            binding.identity.officeId === 'TRADE' &&
            binding.identity.classification === 'OFFICE_PRIVATE',
        );
        if (trade.length !== 1) return fail(403, 'CURRENT_TRADE_SEAT_REQUIRED');
        const selector = {
          verifiedSubject: claims.authSubject,
          worldId: c.admittedWorldPins.worldId,
          projectionSelector: {
            classification: 'OFFICE_PRIVATE',
            scopeKey: trade[0]!.identity.scopeKey,
          },
          finalSelector: null,
          signal,
        };
        const scope = await trackRequestCompletion(
          snapshot.read<
            | ServerTradeContractRuntimeScope
            | { denial: CurrentSeatReadError['code'] }
          >(selector, async (facts, read) => {
            const binding = await consume(selector, facts, read);
            if (
              !binding ||
              !matchesReadPins(binding, c) ||
              binding.identity.officeId !== 'TRADE' ||
              binding.identity.authSubjectId !== claims.authSubject ||
              binding.identity.classification !== 'OFFICE_PRIVATE' ||
              binding.identity.scopeKey !== selector.projectionSelector.scopeKey
            )
              return null;
            let selectors: Awaited<
              ReturnType<typeof enumerateCurrentSeatSelectors>
            >;
            try {
              selectors = await enumerateCurrentSeatSelectors(
                read,
                claims.authSubject,
                c.admittedWorldPins.worldId,
              );
            } catch (error) {
              if (error instanceof CurrentSeatReadError)
                return { denial: error.code };
              throw error;
            }
            if (
              !selectors.some(
                (item) =>
                  item.classification === 'OFFICE_PRIVATE' &&
                  item.scopeKey === binding.identity.scopeKey,
              )
            )
              return { denial: 'CURRENT_AUTHORIZATION_NOT_COHERENT' };
            const result = await read.query<{
              team_id: unknown;
              authorization_version: unknown;
            }>(TRADE_CURRENT_TEAM_QUERY, [
              binding.identity.worldId,
              claims.authSubject,
              binding.identity.countryId,
              binding.identity.authorizationRevision,
            ]);
            if (result.rows.length !== 1)
              return { denial: 'CURRENT_AUTHORIZATION_NOT_COHERENT' };
            const row = result.rows[0]!;
            if (
              typeof row.team_id !== 'string' ||
              !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(row.team_id) ||
              row.authorization_version !==
                binding.identity.authorizationRevision
            )
              return { denial: 'CURRENT_AUTHORIZATION_NOT_COHERENT' };
            return Object.freeze({
              authSubject: claims.authSubject,
              worldId: binding.identity.worldId,
              countryId: binding.identity.countryId,
              officeId: 'TRADE',
              teamId: row.team_id,
              authorizationRevision: binding.identity.authorizationRevision,
              classification: 'OFFICE_PRIVATE',
              scopeKey: binding.identity.scopeKey,
            });
          }),
        );
        if (!scope) return fail(503, 'READ_BINDING_UNAVAILABLE');
        if ('denial' in scope)
          return fail(
            scope.denial === 'CURRENT_AUTHORIZATION_NOT_COHERENT'
              ? 409
              : scope.denial === 'CURRENT_SEAT_REQUIRED'
                ? 403
                : 503,
            scope.denial,
          );
        const page = await trackRequestCompletion(
          readTradeContractRuntimePage({
            executor,
            scope,
            page: request.page,
            signal,
          }),
        );
        if (signal.aborted) return fail(499, 'CANCELLED');
        if ('reason' in page) {
          const status = {
            DENIED: 403,
            UNAVAILABLE: 503,
            STALE: 409,
            INVALID_REQUEST: 400,
            CANCELLED: 499,
          }[page.status];
          return fail(
            status,
            page.reason,
            page.status === 'UNAVAILABLE' &&
              page.reason === 'DATABASE_UNAVAILABLE',
          );
        }
        return {
          httpStatus: 200,
          body: {
            schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
            requestId,
            ok: true,
            page,
          },
        };
      } catch (error) {
        if (input.signal?.aborted) return fail(499, 'CANCELLED');
        if (error instanceof CurrentSeatReadError)
          return fail(
            error.code === 'CURRENT_AUTHORIZATION_NOT_COHERENT'
              ? 409
              : error.code === 'CURRENT_SEAT_REQUIRED'
                ? 403
                : 503,
            error.code,
          );
        if (
          error instanceof WorldReadFailure &&
          error.code === 'AUTHORIZATION_DENIED'
        )
          return fail(403, 'CURRENT_SCOPE_NOT_AUTHORIZED');
        if (
          error instanceof Error &&
          /JWT|AUTHENTICATION|SUPABASE/u.test(error.message)
        )
          return fail(401, 'AUTHENTICATION_INVALID');
        if (error instanceof Error && error.message === 'INVALID_REQUEST')
          return fail(400, 'INVALID_REQUEST');
        return fail(503, 'UPSTREAM_UNAVAILABLE', true);
      }
    },
  });
}
