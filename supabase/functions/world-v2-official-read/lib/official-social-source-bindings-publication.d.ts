import type { IncomingMessage, ServerResponse } from 'node:http';
import { type PublicSocialBindingRow, type PublicSocialBindingsMetadata } from './official-social-source-bindings-dto.js';
export interface OfficialSocialBindingsPublication {
    readonly metadata: PublicSocialBindingsMetadata;
    readonly rows: readonly PublicSocialBindingRow[];
}
/** Explicit server bootstrap only. No filesystem, environment, HTTP loading,
 * Worker import, source admission, database call or mutable publication cache.
 * The expected artifact digest must come from trusted server configuration.
 * Four independently pinned raw datasets are needed to check real JSON pointers
 * and distinguish exact leaf values from merely inspected parent records. */
export declare function loadOfficialSocialBindingsPublication(input: {
    readonly artifactBytes: Uint8Array;
    readonly expectedArtifactSHA256: string;
    readonly mappingBytes: Uint8Array;
    readonly datasetBytes: Readonly<Record<string, Uint8Array>>;
}): Promise<OfficialSocialBindingsPublication>;
/** Already-loaded immutable publication only: request paths never load sources. */
export declare function createOfficialSocialBindingsRoute(publication?: OfficialSocialBindingsPublication | null): (request: IncomingMessage, response: ServerResponse) => void;
