import { type OfficialCountrySqlReader } from './official-country-baseline.js';
interface OfficialReadClient {
    query(text: string, values?: string[]): Promise<{
        readonly rows: readonly unknown[];
    }>;
    release(): void;
}
interface OfficialReadPool {
    connect(): Promise<OfficialReadClient>;
}
/** The only SQL admitted to the public source route is frozen at build time.
 * Each request gets a single read-only transaction and a transaction-local
 * NOLOGIN role; this also works through a transaction-mode pooler. */
export declare function createRoleScopedOfficialCountryReader(pool: OfficialReadPool, { statementTimeoutMillis }?: {
    readonly statementTimeoutMillis?: number;
}): OfficialCountrySqlReader;
export {};
