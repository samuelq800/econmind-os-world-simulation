import { type OfficialCountrySqlReader } from './official-country-baseline.js';
import { type OfficialSocialBindingsPublication } from './official-social-source-bindings-publication.js';
export declare const OFFICIAL_EDGE_FUNCTION_NAME = "world-v2-official-read";
export declare const OFFICIAL_EDGE_FUNCTION_PREFIX = "/functions/v1/world-v2-official-read";
export declare const OFFICIAL_EDGE_INTERNAL_PREFIX = "/world-v2-official-read";
/** Only the frozen country, 34-dataset and metadata-only map routes exist.
 * An explicit publication adds selected Social evidence, default unavailable.
 * No Command, receipt, arbitrary SQL, table, World or worker route is mapped. */
export declare function createOfficialEdgeFetchHandler(input: {
    readonly reader: OfficialCountrySqlReader;
    readonly allowedOrigins: readonly string[];
    readonly socialBindings?: OfficialSocialBindingsPublication | null;
}): (request: Request) => Promise<Response>;
