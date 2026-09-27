import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createSeason1LobbySupabaseMyTeamReader,
  parseSeason1LobbySupabaseConfiguration,
  WORLD_LOBBY_SUPABASE_ENVIRONMENT,
  type Season1LobbySupabaseConfiguration,
} from './season1-lobby-supabase-reader.js';

export const SEASON1_MY_TEAM_PATH = '/v1/season1/my-team';
export const SEASON1_MY_TEAM_LIMITS = Object.freeze({
  timeoutMs: 5_000,
  maxInFlight: 4,
  requestsPerMinute: 60,
});

/** Dedicated opt-in only. No parsing or network activation when unconfigured. */
export function readSeason1MyTeamRouteConfiguration(
  environment: NodeJS.ProcessEnv,
): Season1LobbySupabaseConfiguration | undefined {
  const enabled = environment.WORLD_LOBBY_API_ENABLED;
  const configured =
    Object.values(WORLD_LOBBY_SUPABASE_ENVIRONMENT).some(
      (key) => environment[key] !== undefined,
    ) ||
    Object.keys(environment).some(
      (key) =>
        /^WORLD_LOBBY_SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY$/u.test(key) &&
        environment[key] !== undefined,
    );
  if ((enabled === undefined || enabled === 'false') && !configured)
    return undefined;
  if (enabled !== 'true')
    throw new Error(
      'SEASON1_MY_TEAM_CONFIGURATION_INVALID: explicit enable and complete public configuration required',
    );
  return parseSeason1LobbySupabaseConfiguration(environment);
}

function reply(response: ServerResponse, status: number, body: object): void {
  if (response.destroyed) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'private, no-store',
    vary: 'Authorization',
    'x-content-type-options': 'nosniff',
  });
  response.end(payload);
}

/** Read-only, bearer-only server endpoint. Never forwards cookies, request
 * selectors, Origin, or arbitrary headers; never creates a World principal. */
export function createSeason1MyTeamRoute(input: {
  readonly configuration: Season1LobbySupabaseConfiguration;
  readonly fetch?: typeof fetch;
}) {
  const reader = createSeason1LobbySupabaseMyTeamReader(input);
  let inFlight = 0;
  let windowStarted = Date.now();
  let requestCount = 0;
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const fail = (status: number, code: string) =>
      reply(response, status, { ok: false, error: { code } });
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      fail(405, 'METHOD_NOT_ALLOWED');
      return;
    }
    if (request.headers.origin !== undefined) {
      fail(403, 'BROWSER_ORIGIN_NOT_ENABLED');
      return;
    }
    if (
      request.url !== SEASON1_MY_TEAM_PATH ||
      request.headers['transfer-encoding'] !== undefined ||
      (request.headers['content-length'] !== undefined &&
        request.headers['content-length'] !== '0')
    ) {
      request.resume();
      fail(400, 'PARAMETERS_NOT_ALLOWED');
      return;
    }
    const authorizationCount = request.rawHeaders.filter(
      (_, index) =>
        index % 2 === 0 &&
        request.rawHeaders[index]?.toLowerCase() === 'authorization',
    ).length;
    const authorization = request.headers.authorization;
    if (
      authorizationCount !== 1 ||
      typeof authorization !== 'string' ||
      Buffer.byteLength(authorization, 'utf8') > 8 * 1024 + 7 ||
      !/^Bearer [A-Za-z0-9._~+/-]+=*$/u.test(authorization)
    ) {
      fail(401, 'UNAUTHENTICATED');
      return;
    }
    const now = Date.now();
    if (now - windowStarted >= 60_000) {
      windowStarted = now;
      requestCount = 0;
    }
    if (
      inFlight >= SEASON1_MY_TEAM_LIMITS.maxInFlight ||
      requestCount >= SEASON1_MY_TEAM_LIMITS.requestsPerMinute
    ) {
      response.setHeader('retry-after', '60');
      fail(429, 'RATE_LIMITED');
      return;
    }
    requestCount += 1;
    inFlight += 1;
    const abort = new AbortController();
    const cancel = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.once('close', cancel);
    const timer = setTimeout(
      () => abort.abort(),
      SEASON1_MY_TEAM_LIMITS.timeoutMs,
    );
    timer.unref();
    try {
      const result = await reader.readMyTeam({
        accessToken: authorization.slice(7),
        signal: abort.signal,
      });
      if (result.kind === 'OK') {
        // Only the reviewed, validated same-user DTO; never raw upstream JSON.
        reply(response, 200, {
          ok: true,
          seasonCode: result.seasonCode,
          sourceRpc: result.sourceRpc,
          data: result.data,
          worldAuthorityGranted: false,
        });
        return;
      }
      const status =
        result.kind === 'UNAUTHENTICATED'
          ? 401
          : result.kind === 'AUTHORIZATION_DENIED'
            ? 403
            : result.kind === 'OFFLINE' || result.kind === 'MISSING_RPC'
              ? 503
              : 502;
      fail(status, result.kind);
    } catch {
      fail(503, 'UPSTREAM_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      response.off('close', cancel);
      inFlight -= 1;
    }
  };
}
