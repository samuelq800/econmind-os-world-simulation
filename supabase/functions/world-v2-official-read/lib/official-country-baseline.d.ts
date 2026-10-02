import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const OFFICIAL_COUNTRY_PACKAGE_ID = "BALANCED_2026_09_28_V1";
export declare const OFFICIAL_COUNTRY_SELECTION_SHA256 = "88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315";
export declare const OFFICIAL_COUNTRIES_SHA256 = "5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89";
export declare const OFFICIAL_COUNTRY_LIST_PATH = "/v1/world-data/countries";
export declare const OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH: string;
export interface OfficialCountrySqlReader {
    query(text: string, values: readonly string[]): Promise<{
        readonly rows: readonly unknown[];
    }>;
}
export declare const OFFICIAL_COUNTRY_SOURCE_QUERY: string;
interface CountrySource {
    readonly id: string;
    readonly name: string;
    readonly number: string;
    readonly population: number;
    readonly teamAssignment: null;
    readonly [key: string]: unknown;
}
export declare class OfficialCountryReadFailure extends Error {
    readonly code: 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID';
    constructor(code: 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID');
}
/** Revalidates the immutable selected source bytes, not the inert candidate
 * label as World/OpeningSeed authority. No source row is interpreted as live. */
export declare function readOfficialCountries(reader: OfficialCountrySqlReader): Promise<readonly CountrySource[]>;
/** Fixed public selected-source route; no World ID, SQL, identity or selector
 * supplied by the client. The authorized live projection route is separate. */
export declare function createOfficialCountryBaselineRoute(reader: OfficialCountrySqlReader): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export {};
