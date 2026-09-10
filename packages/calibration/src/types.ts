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
  readonly schemaVersion: 'raw-snapshot.v2';
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly sourceFamily: string;
  readonly provider: string;
  readonly endpointIdentity: string;
  readonly retrievedAt: string;
  readonly sourceAsOf: string | null;
  readonly query: string;
  readonly requestParameters: Readonly<Record<string, string>>;
  readonly requestedDimensions: Readonly<Record<string, readonly string[]>>;
  readonly providerVersion: string | null;
  readonly fileFormat: 'JSON' | 'CSV';
  readonly httpStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly adapterVersion: string;
  readonly licenseUrl: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly status:
    | 'FIXTURE'
    | 'LIVE_FETCH_NOT_RUN'
    | 'DEVELOPMENT_NON_AUTHORITATIVE'
    | 'FROZEN_REVIEW_CANDIDATE';
}

export interface SourceRecord {
  readonly sourceObservationKey: string;
  readonly variableCode: string;
  readonly geographyId: string;
  readonly period: string;
  readonly value: string | null;
  readonly rawNumericToken: string | null;
  readonly sourceUnit: string;
  readonly qualityFlags: readonly string[];
  readonly attributes: Readonly<Record<string, string | null>>;
}

export interface NormalizedObservation {
  readonly observationId: string;
  readonly variableId: string;
  readonly geographyId: string;
  readonly providerGeographyId: string;
  readonly period: string;
  readonly value: string | null;
  readonly rawNumericToken: string | null;
  readonly canonicalUnit: string;
  readonly dataClass: DataClass;
  readonly sourceSnapshotId: string | null;
  readonly sourceObservationKey: string | null;
  readonly transformationId: string;
  readonly transformationVersion: string;
  readonly qualityFlags: readonly string[];
  readonly provenance: readonly string[];
  readonly sourceAttributes: Readonly<Record<string, string | null>>;
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
  readonly sourceFamily: string;
  readonly provider: string;
  readonly endpointIdentity: string;
  readonly adapterVersion: string;
  readonly licenseUrl: string;
  buildRequest(parameters: Readonly<Record<string, string>>): SourceRequest;
  parse(bytes: Uint8Array): readonly SourceRecord[];
}

export interface SnapshotTransport {
  retrieve(request: SourceRequest): Promise<RetrievedPayload>;
}

export interface RetrievedPayload {
  readonly bytes: Uint8Array;
  readonly httpStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly finalUrl: string;
}
