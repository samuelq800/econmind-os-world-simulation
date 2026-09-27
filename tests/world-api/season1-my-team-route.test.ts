import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readApiRuntimeConfig,
  startApiRuntime,
  type RunningApiRuntime,
} from '../../apps/world-api/src/runtime.js';
import { SEASON1_MY_TEAM_PATH } from '../../apps/world-api/src/integration/season1-my-team-route.js';

const project = 'abcdefghijklmnopqrst';
const key = 'sb_publishable_synthetic_lobby_key_123456';
const settings = {
  ECONMIND_ENV: 'ci',
  WORLD_LOBBY_API_ENABLED: 'true',
  WORLD_LOBBY_SUPABASE_PROJECT_REF: project,
  WORLD_LOBBY_SUPABASE_URL: `https://${project}.supabase.co`,
  WORLD_LOBBY_SUPABASE_PUBLISHABLE_KEY: key,
};
const runtimes: RunningApiRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
  vi.restoreAllMocks();
});

async function start(
  upstream: typeof fetch,
  environment: NodeJS.ProcessEnv = settings,
) {
  const runtime = await startApiRuntime(
    { ...readApiRuntimeConfig(environment), port: 0 },
    { season1Fetch: upstream },
  );
  runtimes.push(runtime);
  return runtime.origin;
}
function rpcResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status });
}
function noTeam() {
  return { team: null, membership: null, members: [] };
}
function team(name: string) {
  return {
    team: {
      id: '550e8400-e29b-41d4-a716-446655440403',
      name,
      code: 'EM-TEAM',
      description: '',
      capacity: 6,
      status: 'forming',
      recruitmentMode: 'open',
      preferredLanguage: 'English',
      teamStyle: 'balanced',
      captainUserId: '550e8400-e29b-41d4-a716-446655440402',
    },
    membership: { memberRole: 'member', isReady: false },
    members: [
      {
        userId: '550e8400-e29b-41d4-a716-446655440402',
        displayName: name,
        schoolName: null,
        memberRole: 'captain',
        rolePreferences: ['Finance & Economy'],
        isReady: true,
        joinedAt: '2026-09-27T00:00:00.000Z',
      },
    ],
  };
}
async function get(origin: string, token = 'user-session-A', suffix = '') {
  return fetch(`${origin}${SEASON1_MY_TEAM_PATH}${suffix}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}
async function raw(
  origin: string,
  headers: string[],
  method = 'GET',
  body = '',
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(
      `${origin}${SEASON1_MY_TEAM_PATH}`,
      { method, headers: ['Host', new URL(origin).host, ...headers] },
      (response) => {
        let payload = '';
        response.on('data', (part) => {
          payload += String(part);
        });
        response.on('end', () =>
          resolve({ status: response.statusCode!, body: payload }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

describe('Season 1 opt-in same-user API (mock upstream, LIVE_NOT_RUN)', () => {
  it('keeps default health/ready unchanged and never connects without opt-in', async () => {
    const upstream = vi.fn<typeof fetch>();
    const origin = await start(upstream, { ECONMIND_ENV: 'ci' });
    for (const endpoint of ['/healthz', '/readyz']) {
      const response = await fetch(`${origin}${endpoint}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        service: 'world-api',
        ready: true,
        authoritativeMutationEnabled: false,
      });
    }
    expect((await get(origin)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
    expect(
      readApiRuntimeConfig({
        ECONMIND_ENV: 'ci',
        WORLD_LOBBY_API_ENABLED: 'false',
      }).season1MyTeam,
    ).toBeUndefined();
  });
  it('fails partial, ambiguous or privileged configuration before listening', () => {
    const cases: NodeJS.ProcessEnv[] = [
      { WORLD_LOBBY_API_ENABLED: 'true' },
      { WORLD_LOBBY_SUPABASE_URL: settings.WORLD_LOBBY_SUPABASE_URL },
      { ...settings, WORLD_LOBBY_API_ENABLED: undefined },
      { ...settings, WORLD_LOBBY_API_ENABLED: 'false' },
      { ...settings, WORLD_LOBBY_SUPABASE_PUBLISHABLE_KEY: '' },
      {
        ...settings,
        WORLD_LOBBY_SUPABASE_SERVICE_ROLE_KEY: 'forbidden-test-value',
      },
      { ...settings, WORLD_LOBBY_SUPABASE_URL: 'https://wrong.example.test' },
    ];
    for (const environment of cases)
      expect(() => readApiRuntimeConfig(environment)).toThrow();
  });
  it('forwards only each bearer to the fixed no-argument RPC; preserves the authorized full DTO without caching', async () => {
    const calls: RequestInit[] = [];
    const upstream = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(
        `https://${project}.supabase.co/rest/v1/rpc/get_world_preseason_my_team`,
      );
      calls.push(init!);
      const subject =
        new Headers(init?.headers).get('authorization') ===
        'Bearer user-session-A'
          ? 'Member A'
          : 'Member B';
      return rpcResponse(200, team(subject));
    });
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error')];
    const origin = await start(upstream);
    expect(upstream).not.toHaveBeenCalled();
    expect((await fetch(`${origin}/readyz`)).status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
    for (const [token, name] of [
      ['user-session-A', 'Member A'],
      ['user-session-B', 'Member B'],
    ]) {
      const response = await fetch(`${origin}${SEASON1_MY_TEAM_PATH}`, {
        headers: {
          authorization: `Bearer ${token}`,
          cookie: 'DO_NOT_FORWARD',
          'x-user-id': 'DO_NOT_FORWARD',
        },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toBe('Authorization');
      expect(await response.json()).toEqual({
        ok: true,
        seasonCode: 'season-1',
        sourceRpc: 'get_world_preseason_my_team',
        data: team(name!),
        worldAuthorityGranted: false,
      });
    }
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: '{}',
      redirect: 'error',
      headers: { apikey: key, authorization: 'Bearer user-session-A' },
    });
    expect(Object.keys(calls[0]!.headers!)).toEqual([
      'accept',
      'apikey',
      'authorization',
      'content-type',
    ]);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it('rejects selectors, GET bodies, cookies-only, duplicate/malformed bearer, Origin and wrong method before upstream', async () => {
    const upstream = vi.fn<typeof fetch>();
    const origin = await start(upstream);
    for (const suffix of [
      '?userId=someone',
      '?teamId=other',
      '?rpc=other',
      '?',
    ])
      expect((await get(origin, 'user-session-A', suffix)).status).toBe(400);
    expect(
      (
        await fetch(`${origin}${SEASON1_MY_TEAM_PATH}`, {
          headers: { cookie: 'session=ignored' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await raw(origin, [
          'Authorization',
          'Bearer first',
          'Authorization',
          'Bearer second',
        ])
      ).status,
    ).toBe(401);
    expect(
      (await raw(origin, ['Authorization', 'Bearer with whitespace'])).status,
    ).toBe(401);
    expect(
      (
        await raw(
          origin,
          ['Authorization', 'Bearer user-session-A', 'Content-Length', '2'],
          'GET',
          '{}',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${origin}${SEASON1_MY_TEAM_PATH}`, {
          headers: {
            authorization: 'Bearer user-session-A',
            origin: 'https://site.example.test',
          },
        })
      ).status,
    ).toBe(403);
    for (const method of ['HEAD', 'POST', 'OPTIONS'])
      expect(
        (await fetch(`${origin}${SEASON1_MY_TEAM_PATH}`, { method })).status,
      ).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    [401, { message: 'PRIVATE_TOKEN_PII' }, 401, 'UNAUTHENTICATED'],
    [403, { message: 'PRIVATE_TOKEN_PII' }, 403, 'AUTHORIZATION_DENIED'],
    [
      404,
      { code: 'PGRST202', details: 'PRIVATE_TOKEN_PII' },
      503,
      'MISSING_RPC',
    ],
    [503, { message: 'PRIVATE_TOKEN_PII' }, 503, 'OFFLINE'],
    [500, { message: 'PRIVATE_TOKEN_PII' }, 502, 'REMOTE_FAILURE'],
    [
      200,
      { team: null, privateField: 'PRIVATE_TOKEN_PII' },
      502,
      'CONTRACT_INVALID',
    ],
  ] as const)(
    'sanitizes upstream %s into %s without turning failure into no-team success',
    async (status, payload, expected, code) => {
      const origin = await start(async () => rpcResponse(status, payload));
      const response = await get(origin);
      expect(response.status).toBe(expected);
      expect(await response.json()).toEqual({ ok: false, error: { code } });
    },
  );
  it('distinguishes true empty team success from transport failure', async () => {
    const origin = await start(async () => rpcResponse(200, noTeam()));
    expect(await (await get(origin)).json()).toMatchObject({
      ok: true,
      data: noTeam(),
    });
    const offline = await start(async () => {
      throw new Error('PRIVATE_TOKEN_PII');
    });
    expect(await (await get(offline)).json()).toEqual({
      ok: false,
      error: { code: 'OFFLINE' },
    });
  });
  it('bounds upstream timeout without exposing session or upstream diagnostics', async () => {
    const origin = await start(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => reject(new Error('PRIVATE_TOKEN_PII')),
            { once: true },
          );
        }),
    );
    const response = await get(origin);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'OFFLINE' },
    });
  });
  it('limits in-flight reads using counters, then releases capacity', async () => {
    const releases: (() => void)[] = [];
    let ready!: () => void;
    const allStarted = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const origin = await start(
      async () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(rpcResponse(200, noTeam())));
          if (releases.length === 4) ready();
        }),
    );
    const requests = Array.from({ length: 4 }, () => get(origin));
    await allStarted;
    expect((await get(origin)).status).toBe(429);
    for (const release of releases) release();
    expect(
      (await Promise.all(requests)).map((response) => response.status),
    ).toEqual([200, 200, 200, 200]);
  });
  it('bounds accepted upstream requests per process without retaining user data', async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      rpcResponse(200, noTeam()),
    );
    const origin = await start(upstream);
    for (let index = 0; index < 60; index += 1)
      expect((await get(origin)).status).toBe(200);
    expect((await get(origin)).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(60);
    expect((await fetch(`${origin}/healthz`)).status).toBe(200);
  });
});
