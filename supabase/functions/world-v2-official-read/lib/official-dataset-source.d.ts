import { type OfficialCountrySqlReader } from './official-country-baseline.js';
import type { OfficialDatasetSpec } from './official-dataset-registry.js';
export declare const OFFICIAL_DATASET_SOURCE_QUERY: string;
/** Per snapshot-reader isolate. Accounted value bytes are a conservative retained
 * tree budget, not a promise about the JS engine's total RSS or cold allocations. */
export declare const OFFICIAL_SNAPSHOT_CACHE_LIMITS: Readonly<{
    entries: 4;
    sourceBytes: 12000000;
    valueBytes: 32000000;
    inFlight: 2;
}>;
type CacheLimits = {
    readonly [Key in keyof typeof OFFICIAL_SNAPSHOT_CACHE_LIMITS]: number;
};
type SnapshotBytesLoader = (spec: OfficialDatasetSpec) => Promise<Uint8Array>;
/** Server-only registration: generic SQL readers are never silently cached.
 * The loader supplies bytes, not trusted parsed data. Every new load is verified
 * here before parsing, freezing and admission. Lower limits aid focused tests;
 * callers cannot raise the production caps. No raw bytes are retained. */
export declare function registerOfficialSnapshotSourceStore(reader: OfficialCountrySqlReader, load: SnapshotBytesLoader, requested?: Partial<CacheLimits>): void;
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
export {};
