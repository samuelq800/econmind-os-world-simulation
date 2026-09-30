export type OfficialDatasetKind = 'ARRAY' | 'OBJECT' | 'GEOGRAPHY';
export interface OfficialDatasetSpec {
    readonly slug: string;
    readonly sourcePath: string;
    readonly storagePath: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly kind: OfficialDatasetKind;
    readonly countryFields: readonly string[];
    readonly entityFields: readonly string[];
    readonly referenceFields: readonly string[];
}
export declare const OFFICIAL_DATASETS: readonly OfficialDatasetSpec[];
export declare const OFFICIAL_DATASET_BY_SLUG: ReadonlyMap<string, OfficialDatasetSpec>;
