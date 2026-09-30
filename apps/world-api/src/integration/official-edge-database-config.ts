export const OFFICIAL_EDGE_PROJECT_REF = 'vimksjrhaxdpnkvgsavz';
export const OFFICIAL_EDGE_LOGIN_ROLE = 'world_v2_api_login';
export const OFFICIAL_EDGE_READER_ROLE = 'world_v2_api_reader';

export interface OfficialEdgeDatabaseConfig {
  /** sslmode is removed so the driver cannot override verified TLS options. */
  readonly connectionString: string;
  readonly loginRole: typeof OFFICIAL_EDGE_LOGIN_ROLE;
  readonly readerRole: typeof OFFICIAL_EDGE_READER_ROLE;
}

function invalid(): never {
  throw new Error('OFFICIAL_EDGE_DATABASE_CONFIGURATION_INVALID');
}

/** This is intentionally narrower than the persistent Node API config:
 * only the project's shared transaction pooler and dedicated login are valid.
 * The URL is server-only and is never copied into an HTTP response. */
export function readOfficialEdgeDatabaseConfig(
  environment: Readonly<Record<string, string | undefined>>,
): OfficialEdgeDatabaseConfig {
  if (
    environment.WORLD_API_DB_LOGIN_ROLE !== OFFICIAL_EDGE_LOGIN_ROLE ||
    environment.WORLD_API_DB_READER_ROLE !== OFFICIAL_EDGE_READER_ROLE ||
    environment.WORLD_DATABASE_FINGERPRINT !== 'world-v2-production' ||
    environment.WORLD_DATABASE_NAMESPACE !== 'world_v2' ||
    environment.WORLD_DATABASE_MUTATION_MODE !== 'disabled'
  )
    return invalid();
  const raw = environment.WORLD_DATABASE_URL;
  if (!raw || raw.length > 2_048) return invalid();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid();
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    decodeURIComponent(url.username) !==
      `${OFFICIAL_EDGE_LOGIN_ROLE}.${OFFICIAL_EDGE_PROJECT_REF}` ||
    url.password.length === 0 ||
    !/^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/u.test(url.hostname) ||
    url.port !== '6543' ||
    url.pathname !== '/postgres' ||
    url.hash !== '' ||
    [...url.searchParams.keys()].length !== 1 ||
    !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')
  )
    return invalid();
  url.searchParams.delete('sslmode');
  return Object.freeze({
    connectionString: url.toString(),
    loginRole: OFFICIAL_EDGE_LOGIN_ROLE,
    readerRole: OFFICIAL_EDGE_READER_ROLE,
  });
}
