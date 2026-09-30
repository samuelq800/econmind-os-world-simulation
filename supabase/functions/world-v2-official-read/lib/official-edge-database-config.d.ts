export declare const OFFICIAL_EDGE_PROJECT_REF = "vimksjrhaxdpnkvgsavz";
export declare const OFFICIAL_EDGE_LOGIN_ROLE = "world_v2_api_login";
export declare const OFFICIAL_EDGE_READER_ROLE = "world_v2_api_reader";
export interface OfficialEdgeDatabaseConfig {
    /** sslmode is removed so the driver cannot override verified TLS options. */
    readonly connectionString: string;
    readonly loginRole: typeof OFFICIAL_EDGE_LOGIN_ROLE;
    readonly readerRole: typeof OFFICIAL_EDGE_READER_ROLE;
}
/** This is intentionally narrower than the persistent Node API config:
 * only the project's shared transaction pooler and dedicated login are valid.
 * The URL is server-only and is never copied into an HTTP response. */
export declare function readOfficialEdgeDatabaseConfig(environment: Readonly<Record<string, string | undefined>>): OfficialEdgeDatabaseConfig;
