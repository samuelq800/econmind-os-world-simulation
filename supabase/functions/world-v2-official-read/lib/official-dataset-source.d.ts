import { type OfficialCountrySqlReader } from './official-country-baseline.js';
import type { OfficialDatasetSpec } from './official-dataset-registry.js';
export declare const OFFICIAL_DATASET_SOURCE_QUERY: string;
export declare class OfficialDatasetFailure extends Error {
    readonly code: 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID';
    constructor(code: 'SOURCE_UNAVAILABLE' | 'SOURCE_INVALID');
}
/** Only data number tokens are quoted. Numbers inside source strings are left
 * untouched; parsing then preserves exact decimals without JS float coercion. */
export declare function parseLosslessOfficialJson(content: string): unknown;
/** Reconstructs exact UTF-8 chunks under the selected bundle only. The
 * source's historical candidate status remains unchanged and non-runtime. */
export declare function readOfficialDatasetSource(reader: OfficialCountrySqlReader, spec: OfficialDatasetSpec): Promise<unknown>;
