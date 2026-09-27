const SEASON1_MY_TEAM_RPC = 'get_world_preseason_my_team' as const;
const SEASON1_SOURCE_CODE = 'season-1' as const;
const MAX_ACCESS_TOKEN_BYTES = 8 * 1024;
const MAX_RPC_RESPONSE_BYTES = 512 * 1024;

export const WORLD_LOBBY_SUPABASE_ENVIRONMENT = Object.freeze({
  projectRef: 'WORLD_LOBBY_SUPABASE_PROJECT_REF',
  publishableKey: 'WORLD_LOBBY_SUPABASE_PUBLISHABLE_KEY',
  url: 'WORLD_LOBBY_SUPABASE_URL',
});

export interface Season1LobbySupabaseConfiguration {
  readonly projectRef: string;
  readonly publishableKey: string;
  readonly origin: string;
}

export interface Season1MyTeam {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string;
  readonly capacity: number;
  readonly status: string;
  readonly recruitmentMode: 'open' | 'application_required' | 'invite_only';
  readonly preferredLanguage: string;
  readonly teamStyle: string;
  readonly captainUserId: string;
}

export interface Season1MyTeamMembership {
  readonly memberRole: 'captain' | 'member';
  readonly isReady: boolean;
}

export interface Season1MyTeamMember {
  readonly userId: string;
  readonly displayName: string;
  readonly schoolName: string | null;
  readonly memberRole: 'captain' | 'member';
  readonly rolePreferences: readonly string[];
  readonly isReady: boolean;
  readonly joinedAt: string;
}

export interface Season1MyTeamData {
  readonly team: Season1MyTeam | null;
  readonly membership: Season1MyTeamMembership | null;
  readonly members: readonly Season1MyTeamMember[];
}

export type Season1MyTeamReadResult =
  | {
      readonly kind: 'OK';
      /** Declares the fixed source contract, not a World authorization. */
      readonly seasonCode: typeof SEASON1_SOURCE_CODE;
      readonly sourceRpc: typeof SEASON1_MY_TEAM_RPC;
      readonly data: Season1MyTeamData;
    }
  | { readonly kind: 'UNAUTHENTICATED' }
  | { readonly kind: 'AUTHORIZATION_DENIED' }
  | { readonly kind: 'MISSING_RPC' }
  | { readonly kind: 'OFFLINE' }
  | { readonly kind: 'CONTRACT_INVALID' }
  | { readonly kind: 'REMOTE_FAILURE' };

export interface Season1MyTeamReader {
  /**
   * accessToken is an ephemeral, already-received user session token. It is
   * forwarded only to the exact configured RPC origin and is never retained.
   */
  readMyTeam(input: {
    readonly accessToken: string | null | undefined;
    readonly signal?: AbortSignal;
  }): Promise<Season1MyTeamReadResult>;
}

export class Season1LobbySupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Season1LobbySupabaseConfigurationError';
  }
}

const PROJECT_REF = /^[a-z0-9]{20}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/u;
const RECRUITMENT_MODES = new Set([
  'open',
  'application_required',
  'invite_only',
]);
const MEMBER_ROLES = new Set(['captain', 'member']);

function configurationFailure(message: string): never {
  throw new Season1LobbySupabaseConfigurationError(message);
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name];
  if (typeof value !== 'string' || value.length === 0) {
    configurationFailure(`${name} is required`);
  }
  return value;
}

function legacyAnonJwt(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

function publicKey(value: string): string {
  if (PUBLISHABLE_KEY.test(value) || legacyAnonJwt(value)) return value;
  configurationFailure(
    `${WORLD_LOBBY_SUPABASE_ENVIRONMENT.publishableKey} must be a publishable or anon public key`,
  );
}

function expectedOrigin(projectRef: string, urlValue: string): string {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    configurationFailure(
      `${WORLD_LOBBY_SUPABASE_ENVIRONMENT.url} must be a URL`,
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.hostname !== `${projectRef}.supabase.co`
  ) {
    configurationFailure(
      `${WORLD_LOBBY_SUPABASE_ENVIRONMENT.url} must be the exact HTTPS origin for ${WORLD_LOBBY_SUPABASE_ENVIRONMENT.projectRef}`,
    );
  }
  return url.origin;
}

/**
 * Parses only the dedicated legacy-lobby configuration. This intentionally
 * rejects service/secret variable names so the adapter cannot be activated
 * with a privileged Supabase credential.
 */
export function parseSeason1LobbySupabaseConfiguration(
  environment: NodeJS.ProcessEnv,
): Readonly<Season1LobbySupabaseConfiguration> {
  for (const forbidden of [
    'WORLD_LOBBY_SUPABASE_SECRET_KEY',
    'WORLD_LOBBY_SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (environment[forbidden] !== undefined && environment[forbidden] !== '') {
      configurationFailure(`${forbidden} must be absent`);
    }
  }
  const projectRef = requiredEnvironmentValue(
    environment,
    WORLD_LOBBY_SUPABASE_ENVIRONMENT.projectRef,
  );
  if (!PROJECT_REF.test(projectRef)) {
    configurationFailure(
      `${WORLD_LOBBY_SUPABASE_ENVIRONMENT.projectRef} is invalid`,
    );
  }
  const publishableKey = publicKey(
    requiredEnvironmentValue(
      environment,
      WORLD_LOBBY_SUPABASE_ENVIRONMENT.publishableKey,
    ),
  );
  return Object.freeze({
    projectRef,
    publishableKey,
    origin: expectedOrigin(
      projectRef,
      requiredEnvironmentValue(
        environment,
        WORLD_LOBBY_SUPABASE_ENVIRONMENT.url,
      ),
    ),
  });
}

function validateConfiguration(
  value: Season1LobbySupabaseConfiguration,
): Readonly<Season1LobbySupabaseConfiguration> {
  if (!PROJECT_REF.test(value.projectRef)) {
    configurationFailure(
      `${WORLD_LOBBY_SUPABASE_ENVIRONMENT.projectRef} is invalid`,
    );
  }
  return Object.freeze({
    projectRef: value.projectRef,
    publishableKey: publicKey(value.publishableKey),
    origin: expectedOrigin(value.projectRef, value.origin),
  });
}

function validAccessToken(value: string | null | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= MAX_ACCESS_TOKEN_BYTES &&
    !/[\r\n]/u.test(value) &&
    !value.startsWith('Bearer ')
  );
}

function object(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function memberRole(value: unknown): value is 'captain' | 'member' {
  return typeof value === 'string' && MEMBER_ROLES.has(value);
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' && Number.isFinite(new Date(value).valueOf())
  );
}

function team(value: unknown): Season1MyTeam | null {
  if (value === null) return null;
  const record = object(value);
  if (
    record === null ||
    !hasExactKeys(record, [
      'id',
      'name',
      'code',
      'description',
      'capacity',
      'status',
      'recruitmentMode',
      'preferredLanguage',
      'teamStyle',
      'captainUserId',
    ]) ||
    !uuid(record.id) ||
    !text(record.name) ||
    !text(record.code) ||
    !text(record.description) ||
    !Number.isSafeInteger(record.capacity) ||
    !text(record.status) ||
    typeof record.recruitmentMode !== 'string' ||
    !RECRUITMENT_MODES.has(record.recruitmentMode) ||
    !text(record.preferredLanguage) ||
    !text(record.teamStyle) ||
    !uuid(record.captainUserId)
  ) {
    return null;
  }
  return Object.freeze({
    id: record.id,
    name: record.name,
    code: record.code,
    description: record.description,
    capacity: record.capacity as number,
    status: record.status,
    recruitmentMode: record.recruitmentMode as Season1MyTeam['recruitmentMode'],
    preferredLanguage: record.preferredLanguage,
    teamStyle: record.teamStyle,
    captainUserId: record.captainUserId,
  });
}

function membership(value: unknown): Season1MyTeamMembership | null {
  if (value === null) return null;
  const record = object(value);
  if (
    record === null ||
    !hasExactKeys(record, ['memberRole', 'isReady']) ||
    !memberRole(record.memberRole) ||
    typeof record.isReady !== 'boolean'
  ) {
    return null;
  }
  return Object.freeze({
    memberRole: record.memberRole,
    isReady: record.isReady,
  });
}

function members(value: unknown): readonly Season1MyTeamMember[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: Season1MyTeamMember[] = [];
  for (const entry of value) {
    const record = object(entry);
    if (
      record === null ||
      !hasExactKeys(record, [
        'userId',
        'displayName',
        'schoolName',
        'memberRole',
        'rolePreferences',
        'isReady',
        'joinedAt',
      ]) ||
      !uuid(record.userId) ||
      !text(record.displayName) ||
      (record.schoolName !== null && !text(record.schoolName)) ||
      !memberRole(record.memberRole) ||
      !Array.isArray(record.rolePreferences) ||
      !record.rolePreferences.every(text) ||
      typeof record.isReady !== 'boolean' ||
      !timestamp(record.joinedAt)
    ) {
      return null;
    }
    parsed.push(
      Object.freeze({
        userId: record.userId,
        displayName: record.displayName,
        schoolName: record.schoolName,
        memberRole: record.memberRole,
        rolePreferences: Object.freeze([...record.rolePreferences]),
        isReady: record.isReady,
        joinedAt: record.joinedAt,
      }),
    );
  }
  return Object.freeze(parsed);
}

function data(value: unknown): Season1MyTeamData | null {
  const record = object(value);
  if (
    record === null ||
    !hasExactKeys(record, ['team', 'membership', 'members'])
  ) {
    return null;
  }
  const parsedTeam = team(record.team);
  const parsedMembership = membership(record.membership);
  const parsedMembers = members(record.members);
  if (parsedTeam === null && record.team !== null) return null;
  if (parsedMembership === null && record.membership !== null) return null;
  if (parsedMembers === null) return null;
  if (
    (parsedTeam === null || parsedMembership === null) &&
    (record.team !== null ||
      record.membership !== null ||
      parsedMembers.length !== 0)
  ) {
    return null;
  }
  return Object.freeze({
    team: parsedTeam,
    membership: parsedMembership,
    members: parsedMembers,
  });
}

async function responseBody(response: Response): Promise<unknown | null> {
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_RPC_RESPONSE_BYTES) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function missingRpc(response: Response, body: unknown | null): boolean {
  if (response.status !== 404) return false;
  const record = object(body);
  return record?.code === 'PGRST202';
}

/**
 * Creates an inactive, injectable read adapter for the legacy Season 1
 * contract. It neither exposes a browser route nor makes a network call until
 * readMyTeam receives an ephemeral access token from a future server boundary.
 */
export function createSeason1LobbySupabaseMyTeamReader(input: {
  readonly configuration: Season1LobbySupabaseConfiguration;
  readonly fetch?: typeof fetch;
}): Readonly<Season1MyTeamReader> {
  const configuration = validateConfiguration(input.configuration);
  const requestFetch = input.fetch ?? fetch;
  const endpoint = `${configuration.origin}/rest/v1/rpc/${SEASON1_MY_TEAM_RPC}`;
  return Object.freeze({
    async readMyTeam(
      request: Parameters<Season1MyTeamReader['readMyTeam']>[0],
    ) {
      if (!validAccessToken(request.accessToken)) {
        return Object.freeze({ kind: 'UNAUTHENTICATED' as const });
      }
      let response: Response;
      try {
        response = await requestFetch(endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            apikey: configuration.publishableKey,
            authorization: `Bearer ${request.accessToken}`,
            'content-type': 'application/json',
          },
          body: '{}',
          redirect: 'error',
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        });
      } catch {
        return Object.freeze({ kind: 'OFFLINE' as const });
      }
      const body = await responseBody(response).catch(() => null);
      if (response.status === 401) {
        return Object.freeze({ kind: 'UNAUTHENTICATED' as const });
      }
      if (response.status === 403) {
        return Object.freeze({ kind: 'AUTHORIZATION_DENIED' as const });
      }
      if (missingRpc(response, body)) {
        return Object.freeze({ kind: 'MISSING_RPC' as const });
      }
      if ([502, 503, 504].includes(response.status)) {
        return Object.freeze({ kind: 'OFFLINE' as const });
      }
      if (!response.ok) {
        return Object.freeze({ kind: 'REMOTE_FAILURE' as const });
      }
      const parsed = data(body);
      if (parsed === null) {
        return Object.freeze({ kind: 'CONTRACT_INVALID' as const });
      }
      return Object.freeze({
        kind: 'OK' as const,
        seasonCode: SEASON1_SOURCE_CODE,
        sourceRpc: SEASON1_MY_TEAM_RPC,
        data: parsed,
      });
    },
  });
}
