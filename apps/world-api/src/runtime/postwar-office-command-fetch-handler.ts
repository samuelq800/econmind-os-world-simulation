/** Fixed Finance/Social/Treasury-FX transport, never a general handler registry. Request
 * selectors choose one installed service; they confer no identity or source
 * authority. The selected service still verifies JWT and current SQL bindings. */
import {
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  FINANCE_BUDGET_APPROPRIATION_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
} from '@econmind/core/authenticated-office-command-contract';
import {
  boundedBytes,
  jsonBytes,
  parseOfficeEnvelope,
  parseRecoveryRequest,
  requestBudget,
  ExecutorTransportError,
  record,
  uuid,
  ZERO_REQUEST_ID,
} from '../runtime-preparation/bounded-executor-transport.js';
import { RequestCompletion } from '../runtime-preparation/request-completion.js';
import type { PostwarCaptainConnection } from './postwar-captain-connection.js';
import type { PostwarFinanceConnection } from './postwar-finance-connection.js';
import type { PostwarSocialConnection } from './postwar-social-connection.js';
import type { PostwarTreasuryFxConnection } from './postwar-treasury-fx-connection.js';

function decode(recovering: boolean, body: unknown) {
  if (recovering) {
    const request = parseRecoveryRequest(body);
    return { request, selector: request.request.originalRequest.request };
  }
  const request = parseOfficeEnvelope(body);
  return { request, selector: request.request };
}
export interface PostwarOfficeCommandConnections {
  readonly captain?: PostwarCaptainConnection;
  readonly finance?: PostwarFinanceConnection;
  readonly social?: PostwarSocialConnection;
  readonly treasuryFx?: PostwarTreasuryFxConnection;
}
export function createPostwarOfficeCommandFetchHandler(
  input: PostwarOfficeCommandConnections,
) {
  const captain = input.captain,
    finance = input.finance,
    social = input.social,
    treasuryFx = input.treasuryFx;
  const origins = new Set([
    ...(captain?.transportOrigins ?? []),
    ...(finance?.transportOrigins ?? []),
    ...(social?.transportOrigins ?? []),
    ...(treasuryFx?.transportOrigins ?? []),
  ]);
  if (
    origins.size > 8 ||
    [...origins].some((o) => {
      try {
        const u = new URL(o);
        return (
          u.protocol !== 'https:' ||
          u.origin !== o ||
          !!u.username ||
          !!u.password
        );
      } catch {
        return true;
      }
    })
  )
    throw Error('OFFICE_TRANSPORT_EXPLICIT_HTTPS_ORIGINS_REQUIRED');
  let stopped = false,
    stopping: Promise<void> | undefined;
  const active = new Set<Promise<Response | null>>();
  async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url),
      recovering = url.pathname === AUTHENTICATED_COMMAND_RECOVERY_PATH;
    if (url.pathname !== AUTHENTICATED_OFFICE_COMMAND_PATH && !recovering)
      return null;
    let requestId = ZERO_REQUEST_ID,
      cors: string | undefined;
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          vary: 'Origin',
          ...(cors ? { 'access-control-allow-origin': cors } : {}),
        },
      });
    const fail = (status: number, code: string, retryable = false) =>
      reply(status, {
        schemaVersion: recovering
          ? AUTHENTICATED_COMMAND_RECOVERY_SCHEMA
          : AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId,
        ok: false,
        error: { code, retryable },
      });
    if (url.search || url.hash) return fail(404, 'NOT_FOUND');
    if (stopped) return fail(503, 'NOT_CONNECTED');
    const origin = request.headers.get('origin');
    if (!origin || !origins.has(origin)) return fail(403, 'ORIGIN_DENIED');
    cors = origin;
    if (request.method === 'OPTIONS') {
      const names = (
        request.headers.get('access-control-request-headers') ?? ''
      )
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        request.headers.get('access-control-request-method') !== 'POST' ||
        names.some((n) => !['authorization', 'content-type'].includes(n))
      )
        return fail(405, 'METHOD_NOT_ALLOWED');
      return new Response(null, {
        status: 204,
        headers: {
          'cache-control': 'private, no-store',
          vary: 'Origin',
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'authorization,content-type',
        },
      });
    }
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
    if (
      request.headers.get('content-type')?.split(';')[0]?.trim() !==
        'application/json' ||
      request.headers.has('content-encoding')
    )
      return fail(415, 'CONTENT_TYPE_INVALID');
    const budget = requestBudget(request.signal),
      completion = new RequestCompletion();
    let response: Response;
    let commandDispatched = false;
    try {
      response = await completion.run(async () => {
        try {
          // The only HTTP body read. Never clone/tee/replay a Fetch body and
          // never send a failed request to a different connection.
          const body = jsonBytes(
            await boundedBytes(request, 16384, budget.signal, true),
          );
          const r = record(body);
          if (r && uuid(r.requestId)) requestId = r.requestId;
          let decoded: ReturnType<typeof decode>;
          try {
            decoded = decode(recovering, body);
          } catch {
            return fail(400, 'PROTOCOL_ERROR');
          }
          const { request: parsed, selector } = decoded;
          const target =
            selector.officeId === 'CAPTAIN' &&
            selector.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND
              ? captain
              : selector.officeId === 'FINANCE' &&
                  selector.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND
                ? finance
                : selector.officeId === 'FINANCE' &&
                    selector.commandType ===
                      POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND
                  ? treasuryFx
                  : selector.officeId === 'SOCIAL' &&
                      [
                        SOCIAL_POSITION_OFFER_CREATE_COMMAND,
                        SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
                      ].some((f) => f === selector.commandType)
                    ? social
                    : undefined;
          if (!target || target.transportOrigins.length === 0)
            return fail(503, 'OFFICE_CONNECTION_NOT_INSTALLED');
          if (!target.transportOrigins.includes(origin)) {
            cors = undefined;
            return fail(403, 'ORIGIN_DENIED');
          }
          const input = {
            authorization: request.headers.get('authorization'),
            request: parsed,
            signal: budget.signal,
          };
          // Do not race a write acknowledgement against a generic499. The
          // real service distinguishes cancellation from outcome-unknown and
          // its completion lifecycle drains the actual SQL operation.
          commandDispatched = !recovering;
          const result = await (recovering
            ? target.recover(input)
            : target.handleCommand(input));
          return reply(result.httpStatus, result.body);
        } catch (error) {
          if (commandDispatched)
            return fail(503, 'WRITE_OUTCOME_UNKNOWN', false);
          if (error instanceof ExecutorTransportError)
            return fail(error.status, error.code);
          if (budget.signal.aborted) return fail(499, 'CANCELLED');
          if (
            error instanceof Error &&
            (error.message === 'INVALID_REQUEST' ||
              error instanceof SyntaxError)
          )
            return fail(400, 'PROTOCOL_ERROR');
          return fail(503, 'UPSTREAM_UNAVAILABLE', true);
        }
      });
    } finally {
      budget.close();
      await completion.drain();
    }
    return completion.cleanupFailed()
      ? fail(
          503,
          commandDispatched ? 'WRITE_OUTCOME_UNKNOWN' : 'UPSTREAM_UNAVAILABLE',
          !commandDispatched,
        )
      : response;
  }
  return Object.freeze({
    handle(request: Request): Promise<Response | null> {
      const operation = handle(request);
      active.add(operation);
      void operation.then(
        () => active.delete(operation),
        () => active.delete(operation),
      );
      return operation;
    },
    stop(): Promise<void> {
      stopped = true;
      stopping ??= (async () => {
        while (active.size) await Promise.allSettled([...active]);
        // Borrowers drain before Social closes the owned pools.
        // No consumer is started by this mux.
        const errors: unknown[] = [];
        try {
          await captain?.stop();
        } catch (e) {
          errors.push(e);
        }
        try {
          await finance?.stop();
        } catch (e) {
          errors.push(e);
        }
        try {
          await treasuryFx?.stop();
        } catch (e) {
          errors.push(e);
        }
        try {
          await social?.stop();
        } catch (e) {
          errors.push(e);
        }
        if (errors.length)
          throw new AggregateError(
            errors,
            'OFFICE_CONNECTION_CLEANUP_UNCONFIRMED',
          );
      })();
      return stopping;
    },
  });
}
