export type DataClass =
  'OBSERVED' | 'DERIVED' | 'SYNTHETIC_CALIBRATION' | 'PLACEHOLDER';

export type CalibrationRole =
  | 'EMPIRICAL_INPUT'
  | 'DERIVED_INDICATOR'
  | 'ARCHETYPE_FEATURE'
  | 'TRADE_CALIBRATION'
  | 'MODEL_PARAMETER';

export interface SourceRequest {
  readonly sourceId: string;
  readonly url: string;
  readonly method: 'GET';
  readonly parameters: Readonly<Record<string, string>>;
  readonly expectedFormat: 'JSON' | 'CSV';
}

export interface RawSnapshotMetadata {
  readonly schemaVersion: 'raw-snapshot.v1';
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly retrievedAt: string;
  readonly sourceAsOf: string | null;
  readonly query: string;
  readonly requestParameters: Readonly<Record<string, string>>;
  readonly providerVersion: string | null;
  readonly fileFormat: 'JSON' | 'CSV';
  readonly sha256: string;
  readonly byteLength: number;
  readonly status: 'FIXTURE' | 'LIVE_FETCH_NOT_RUN' | 'FROZEN';
}

export interface SourceRecord {
  readonly sourceObservationKey: string;
  readonly geographyId: string;
  readonly period: string;
  readonly value: string | null;
  readonly sourceUnit: string;
  readonly qualityFlags: readonly string[];
}

export interface NormalizedObservation {
  readonly observationId: string;
  readonly variableId: string;
  readonly geographyId: string;
  readonly period: string;
  readonly value: string | null;
  readonly canonicalUnit: string;
  readonly dataClass: DataClass;
  readonly sourceSnapshotId: string | null;
  readonly sourceObservationKey: string | null;
  readonly transformationId: string;
  readonly transformationVersion: string;
  readonly qualityFlags: readonly string[];
  readonly provenance: readonly string[];
}

export interface CalibrationPackage {
  readonly packageId: string;
  readonly schemaVersion: 'calibration-package.v1';
  readonly calibrationVersion: string;
  readonly status: 'DEVELOPMENT_NON_AUTHORITATIVE' | 'FROZEN_REVIEW_CANDIDATE';
  readonly asOfDate: string;
  readonly sourceSnapshotSet: readonly string[];
  readonly transformationVersions: readonly string[];
  readonly variableRegistryVersion: string;
  readonly countryArchetypeVersion: string;
  readonly tradeCalibrationVersion: string;
  readonly generatorVersion: string;
  readonly contentHash: string;
}

export interface SourceAdapter {
  readonly sourceId: string;
  buildRequest(parameters: Readonly<Record<string, string>>): SourceRequest;
  parse(bytes: Uint8Array): readonly SourceRecord[];
}

export interface SnapshotTransport {
  retrieve(request: SourceRequest): Promise<Uint8Array>;
}
