import { describe, expect, it } from 'vitest';

import {
  WORLD_LOBBY_SUPABASE_ENVIRONMENT,
  createSeason1LobbySupabaseMyTeamReader,
  parseSeason1LobbySupabaseConfiguration,
} from '../../apps/world-api/src/index.js';

const PROJECT_REF = 'abcdefghijklmnopqrst';
const USER_ID = '550e8400-e29b-41d4-a716-446655440401';
const CAPTAIN_ID = '550e8400-e29b-41d4-a716-446655440402';

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    [WORLD_LOBBY_SUPABASE_ENVIRONMENT.projectRef]: PROJECT_REF,
    [WORLD_LOBBY_SUPABASE_ENVIRONMENT.publishableKey]:
      'sb_publishable_synthetic_lobby_key_123456',
    [WORLD_LOBBY_SUPABASE_ENVIRONMENT.url]: `https://${PROJECT_REF}.supabase.co`,
    ...overrides,
  };
}

function legacyPublicJwt(role: 'anon' | 'service_role'): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'synthetic-signature',
  ].join('.');
}

function noTeam() {
  return { team: null, membership: null, members: [] };
}

function team() {
  return {
    team: {
      id: '550e8400-e29b-41d4-a716-446655440403',
      name: 'Team Alpha',
      code: 'EM-T1-ALPHA',
      description: 'A bounded test team',
      capacity: 6,
      status: 'forming',
      recruitmentMode: 'open',
      preferredLanguage: 'English',
      teamStyle: 'balanced',
      captainUserId: CAPTAIN_ID,
    },
    membership: { memberRole: 'captain', isReady: true },
    members: [
      {
        userId: USER_ID,
        displayName: 'Participant',
        schoolName: null,
        memberRole: 'captain',
        rolePreferences: ['Finance & Economy'],
        isReady: true,
        joinedAt: '2026-09-27T00:00:00.000Z',
      },
    ],
  };
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Season 1 legacy lobby Supabase reader preparation', () => {
  it('locks the dedicated project origin and rejects privileged or redirected configuration', () => {
    expect(parseSeason1LobbySupabaseConfiguration(environment())).toMatchObject(
      {
        origin: `https://${PROJECT_REF}.supabase.co`,
        projectRef: PROJECT_REF,
      },
    );
    expect(
      parseSeason1LobbySupabaseConfiguration(
        environment({
          [WORLD_LOBBY_SUPABASE_ENVIRONMENT.publishableKey]:
            legacyPublicJwt('anon'),
        }),
      ),
    ).toMatchObject({ projectRef: PROJECT_REF });
    expect(() =>
      parseSeason1LobbySupabaseConfiguration(
        environment({
          [WORLD_LOBBY_SUPABASE_ENVIRONMENT.url]:
            'https://otherprojectabcdefgh.supabase.co',
        }),
      ),
    ).toThrow('must be the exact HTTPS origin');
    expect(() =>
      parseSeason1LobbySupabaseConfiguration(
        environment({
          [WORLD_LOBBY_SUPABASE_ENVIRONMENT.url]: `http://${PROJECT_REF}.supabase.co`,
        }),
      ),
    ).toThrow('must be the exact HTTPS origin');
    expect(() =>
      parseSeason1LobbySupabaseConfiguration(
        environment({
          WORLD_LOBBY_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-secret',
        }),
      ),
    ).toThrow('WORLD_LOBBY_SUPABASE_SERVICE_ROLE_KEY must be absent');
    expect(() =>
      parseSeason1LobbySupabaseConfiguration(
        environment({
          [WORLD_LOBBY_SUPABASE_ENVIRONMENT.publishableKey]: [
            'sb',
            'secret',
            'synthetic',
            'never',
            'accepted',
          ].join('_'),
        }),
      ),
    ).toThrow('must be a publishable or anon public key');
    expect(() =>
      parseSeason1LobbySupabaseConfiguration(
        environment({
          [WORLD_LOBBY_SUPABASE_ENVIRONMENT.publishableKey]:
            legacyPublicJwt('service_role'),
        }),
      ),
    ).toThrow('must be a publishable or anon public key');
  });

  it('calls only the fixed no-argument Season 1 RPC and returns a valid no-team response as data', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const reader = createSeason1LobbySupabaseMyTeamReader({
      configuration: parseSeason1LobbySupabaseConfiguration(environment()),
      fetch: async (input, init) => {
        calls.push({ input, init });
        return response(200, noTeam());
      },
    });

    await expect(
      reader.readMyTeam({ accessToken: 'user-session-token' }),
    ).resolves.toEqual({
      kind: 'OK',
      seasonCode: 'season-1',
      sourceRpc: 'get_world_preseason_my_team',
      data: noTeam(),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      input: `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/get_world_preseason_my_team`,
      init: {
        method: 'POST',
        body: '{}',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          apikey: 'sb_publishable_synthetic_lobby_key_123456',
          authorization: 'Bearer user-session-token',
          'content-type': 'application/json',
        },
      },
    });
  });

  it('rechecks manually constructed configuration before it can receive a user token', () => {
    expect(() =>
      createSeason1LobbySupabaseMyTeamReader({
        configuration: {
          projectRef: PROJECT_REF,
          publishableKey: 'sb_publishable_synthetic_lobby_key_123456',
          origin: 'https://differentabcdefghijkl.supabase.co',
        },
      }),
    ).toThrow('must be the exact HTTPS origin');
  });

  it('does not turn unavailable, unauthenticated, missing-RPC, or malformed replies into an empty team', async () => {
    const configuration = parseSeason1LobbySupabaseConfiguration(environment());
    let calls = 0;
    const unreadable = createSeason1LobbySupabaseMyTeamReader({
      configuration,
      fetch: async () => {
        calls += 1;
        return response(200, noTeam());
      },
    });
    await expect(unreadable.readMyTeam({ accessToken: null })).resolves.toEqual(
      {
        kind: 'UNAUTHENTICATED',
      },
    );
    expect(calls).toBe(0);

    const cases: Array<{
      readonly expected: string;
      readonly fetch: typeof fetch;
    }> = [
      {
        expected: 'UNAUTHENTICATED',
        fetch: async () => response(401, { message: 'redacted' }),
      },
      {
        expected: 'MISSING_RPC',
        fetch: async () => response(404, { code: 'PGRST202' }),
      },
      {
        expected: 'OFFLINE',
        fetch: async () => {
          throw new Error('offline');
        },
      },
      {
        expected: 'CONTRACT_INVALID',
        fetch: async () => response(200, { team: null, membership: null }),
      },
    ];
    for (const entry of cases) {
      const reader = createSeason1LobbySupabaseMyTeamReader({
        configuration,
        fetch: entry.fetch,
      });
      await expect(
        reader.readMyTeam({ accessToken: 'user-session-token' }),
      ).resolves.toMatchObject({ kind: entry.expected });
    }
  });

  it('parses only the documented minimal team DTO without using school or role preferences as authority', async () => {
    const reader = createSeason1LobbySupabaseMyTeamReader({
      configuration: parseSeason1LobbySupabaseConfiguration(environment()),
      fetch: async () => response(200, team()),
    });
    await expect(
      reader.readMyTeam({ accessToken: 'user-session-token' }),
    ).resolves.toMatchObject({
      kind: 'OK',
      data: {
        team: { id: '550e8400-e29b-41d4-a716-446655440403' },
        membership: { memberRole: 'captain' },
        members: [{ userId: USER_ID, rolePreferences: ['Finance & Economy'] }],
      },
    });
  });
});
