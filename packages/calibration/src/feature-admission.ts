import { sha256Bytes, sha256Canonical } from './canonical.js';
import {
  C4_GENERATION_PREFLIGHT_CANONICAL_HASH,
  verifyC4GenerationPreflight,
  type C4GenerationPreflight,
} from './preflight.js';
import type { DataClass, NormalizedObservation } from './types.js';

export const C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH =
  'c2b960b4465f6e8b0755d30ad721618b5454f957462aa236bde283365e59893a';

export type C4FeatureEvidenceStatus =
  'PILOT_EVIDENCE_WITH_CAVEATS' | 'NO_FROZEN_PILOT_OBSERVATIONS';

export interface C4FeatureAdmissionInputBytes {
  readonly executionContract: Uint8Array;
  readonly c4Preflight: Uint8Array;
  readonly c3ExecutionContract: Uint8Array;
  readonly c3Summary: Uint8Array;
  readonly c3UncertaintyRegister: Uint8Array;
  readonly c3Manifest: Uint8Array;
  readonly normalizedObservations: Uint8Array;
  readonly qualityDiagnostics: Uint8Array;
  readonly snapshotManifest: Uint8Array;
  readonly pilotReport: Uint8Array;
  readonly variableRegistry: Uint8Array;
}

export interface VerifiedC4FeatureAdmissionInputBundle {
  readonly kind: 'VERIFIED_C4_FEATURE_ADMISSION_INPUT_BUNDLE';
}

interface ArtifactBinding {
  readonly path: string;
  readonly rawSha256: string;
  readonly canonicalHash?: string;
}

interface C4FeatureAdmissionExecutionContract {
  readonly schemaVersion: 'c4-feature-admission-execution-contract.v1';
  readonly contractVersion: '1.0.0';
  readonly evidenceId: string;
  readonly status: 'EVIDENCE_ONLY_NON_AUTHORITATIVE';
  readonly baseline: {
    readonly reviewedC4TargetCommit: string;
    readonly continuationRecordCommit: string;
    readonly c4ReadinessGate: 'PASS';
    readonly approvedState: 'NOT_READY_NON_AUTHORITATIVE';
    readonly finalGeneratorReady: false;
  };
  readonly inputArtifacts: readonly ArtifactBinding[];
  readonly registryPolicy: {
    readonly requiredVersion: string;
    readonly pilotVariableCoverage: string;
    readonly candidateRole: 'ARCHETYPE_FEATURE';
    readonly candidateDisposition: 'NOT_ADMITTED';
    readonly transformationCompatibility: string;
  };
  readonly evidencePolicy: Readonly<Record<string, string>>;
  readonly hardBoundaries: readonly string[];
}

interface VariableRegistryEntry {
  readonly variableId: string;
  readonly canonicalUnit: string;
  readonly dataClass: DataClass;
  readonly preferredSourceId: string;
  readonly fallbackSourceIds: readonly string[];
  readonly missingPolicy: string;
  readonly transformationId: string;
  readonly transformationVersion: string;
  readonly calibrationRole: string;
}

interface VariableRegistry {
  readonly schemaVersion: string;
  readonly version: string;
  readonly status: string;
  readonly variables: readonly VariableRegistryEntry[];
}

interface NormalizedArtifact {
  readonly status: string;
  readonly observations: readonly NormalizedObservation[];
}

interface QualityArtifact {
  readonly status: string;
  readonly diagnosticCounts: Readonly<Record<string, number>>;
  readonly exactnessFailures: readonly unknown[];
}

interface SnapshotManifest {
  readonly status: string;
  readonly snapshots: readonly {
    readonly snapshotId: string;
    readonly sourceId: string;
  }[];
}

interface PilotReport {
  readonly status: string;
  readonly providerRuns: readonly {
    readonly sourceId: string;
    readonly status: string;
    readonly issues: readonly string[];
  }[];
}

interface C3ExecutionContractInput {
  readonly c2ReviewTarget: {
    readonly normalizedObservationStatus: string;
    readonly inputArtifacts: readonly {
      readonly path: string;
      readonly sha256: string;
    }[];
  };
}

export interface C4FeatureEvidenceEntry {
  readonly variableId: string;
  readonly dataClass: DataClass;
  readonly canonicalUnit: string;
  readonly preferredSourceId: string;
  readonly allowedSourceIds: readonly string[];
  readonly registryTransformation: string;
  readonly missingPolicy: string;
  readonly evidenceStatus: C4FeatureEvidenceStatus;
  readonly admissionStatus: 'NOT_ADMITTED';
  readonly materializationStatus:
    | 'FROZEN_OBSERVATIONS_PRESENT'
    | 'NO_FROZEN_PILOT_OBSERVATIONS'
    | 'DERIVATION_NOT_RUN'
    | 'PLACEHOLDER_VALUE_NOT_ASSIGNED';
  readonly pilotEvidence: {
    readonly sourceFactCount: number;
    readonly distinctObservationIdCount: number;
    readonly exactDuplicateFactCount: number;
    readonly explicitMissingValueCount: number;
    readonly sourceIds: readonly string[];
    readonly sourceSnapshotIds: readonly string[];
    readonly adapterTransformations: readonly string[];
  };
  readonly caveatCodes: readonly string[];
}

export interface C4FeatureAdmissionEvidence {
  readonly schemaVersion: 'c4-feature-admission-evidence.v1';
  readonly evidenceId: string;
  readonly status: 'EVIDENCE_ONLY_NON_AUTHORITATIVE';
  readonly featureSetSelected: false;
  readonly finalGeneratorReady: false;
  readonly input: {
    readonly contractCanonicalHash: string;
    readonly artifacts: readonly ArtifactBinding[];
  };
  readonly baseline: C4FeatureAdmissionExecutionContract['baseline'] & {
    readonly c4PreflightContentHash: string;
  };
  readonly registryCoverage: {
    readonly registryVersion: string;
    readonly frozenPilotVariableCount: number;
    readonly registeredPilotVariableCount: number;
    readonly missingVariableIds: readonly string[];
  };
  readonly qualitySummary: {
    readonly sourceFactCount: number;
    readonly distinctObservationIdCount: number;
    readonly exactDuplicateFactCount: number;
    readonly explicitMissingValueCount: number;
    readonly reportingAsymmetryCount: number;
    readonly exactnessFailureCount: number;
  };
  readonly candidateSummary: {
    readonly candidateCount: number;
    readonly observedCount: number;
    readonly derivedCount: number;
    readonly placeholderCount: number;
    readonly pilotEvidenceCandidateCount: number;
    readonly noFrozenPilotObservationCount: number;
    readonly admittedCount: 0;
  };
  readonly features: readonly C4FeatureEvidenceEntry[];
  readonly remainingPrerequisites: C4GenerationPreflight['unmetPrerequisites'];
  readonly hardBoundaries: readonly string[];
  readonly contentHash: string;
}

const PATHS = Object.freeze({
  c4Preflight: 'data/calibration/preflight/c4_generation_preflight.v1.json',
  c3ExecutionContract:
    'data/calibration/exploration/c3_execution_contract.v1.json',
  c3Summary: 'data/calibration/exploration/c3_exploration_summary.v1.json',
  c3UncertaintyRegister:
    'data/calibration/exploration/c3_uncertainty_register.v1.json',
  c3Manifest: 'data/calibration/exploration/c3_exploration_manifest.v1.json',
  normalizedObservations:
    'data/calibration/pilot/normalized_observations.v1.json',
  qualityDiagnostics: 'data/calibration/pilot/quality_diagnostics.v1.json',
  snapshotManifest: 'data/calibration/pilot/snapshot_manifest.v1.json',
  pilotReport: 'data/calibration/pilot/pilot_report.v1.json',
  variableRegistry: 'data/calibration/variable_registry.v2.json',
});

interface VerifiedBundleData {
  readonly contract: C4FeatureAdmissionExecutionContract;
  readonly preflight: C4GenerationPreflight;
  readonly artifacts: readonly ArtifactBinding[];
  readonly observations: readonly NormalizedObservation[];
  readonly quality: QualityArtifact;
  readonly registry: VariableRegistry;
  readonly sourceBySnapshotId: ReadonlyMap<string, string>;
}

const verifiedBundles = new WeakMap<object, VerifiedBundleData>();

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortText(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), seen);
  }
  return Object.freeze(value) as T;
}

function snapshotBytes(bytes: Uint8Array, artifactPath: string): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(
      `C4_FEATURE_BOUND_INPUT_BYTES_REQUIRED:${artifactPath}`,
    );
  }
  return new Uint8Array(bytes);
}

function snapshotInputs(
  bytes: C4FeatureAdmissionInputBytes,
): C4FeatureAdmissionInputBytes {
  return {
    executionContract: snapshotBytes(
      bytes.executionContract,
      'data/calibration/preflight/c4_feature_admission_execution_contract.v1.json',
    ),
    c4Preflight: snapshotBytes(bytes.c4Preflight, PATHS.c4Preflight),
    c3ExecutionContract: snapshotBytes(
      bytes.c3ExecutionContract,
      PATHS.c3ExecutionContract,
    ),
    c3Summary: snapshotBytes(bytes.c3Summary, PATHS.c3Summary),
    c3UncertaintyRegister: snapshotBytes(
      bytes.c3UncertaintyRegister,
      PATHS.c3UncertaintyRegister,
    ),
    c3Manifest: snapshotBytes(bytes.c3Manifest, PATHS.c3Manifest),
    normalizedObservations: snapshotBytes(
      bytes.normalizedObservations,
      PATHS.normalizedObservations,
    ),
    qualityDiagnostics: snapshotBytes(
      bytes.qualityDiagnostics,
      PATHS.qualityDiagnostics,
    ),
    snapshotManifest: snapshotBytes(
      bytes.snapshotManifest,
      PATHS.snapshotManifest,
    ),
    pilotReport: snapshotBytes(bytes.pilotReport, PATHS.pilotReport),
    variableRegistry: snapshotBytes(
      bytes.variableRegistry,
      PATHS.variableRegistry,
    ),
  };
}

function parseBoundJson<T>(bytes: Uint8Array, artifactPath: string): T {
  try {
    return JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    throw new Error(`C4_FEATURE_BOUND_INPUT_JSON_PARSE_FAILED:${artifactPath}`);
  }
}

function inputByteMap(
  bytes: C4FeatureAdmissionInputBytes,
): ReadonlyMap<string, Uint8Array> {
  return new Map([
    [PATHS.c4Preflight, bytes.c4Preflight],
    [PATHS.c3ExecutionContract, bytes.c3ExecutionContract],
    [PATHS.c3Summary, bytes.c3Summary],
    [PATHS.c3UncertaintyRegister, bytes.c3UncertaintyRegister],
    [PATHS.c3Manifest, bytes.c3Manifest],
    [PATHS.normalizedObservations, bytes.normalizedObservations],
    [PATHS.qualityDiagnostics, bytes.qualityDiagnostics],
    [PATHS.snapshotManifest, bytes.snapshotManifest],
    [PATHS.pilotReport, bytes.pilotReport],
    [PATHS.variableRegistry, bytes.variableRegistry],
  ]);
}

function validateContractBoundary(
  contract: C4FeatureAdmissionExecutionContract,
): void {
  if (
    contract.schemaVersion !== 'c4-feature-admission-execution-contract.v1' ||
    contract.contractVersion !== '1.0.0' ||
    contract.status !== 'EVIDENCE_ONLY_NON_AUTHORITATIVE' ||
    contract.baseline.reviewedC4TargetCommit !==
      'de663d7d6a5d5dc0873f9e49905af8c57ce645fc' ||
    contract.baseline.continuationRecordCommit !==
      'f8a248815db8c2474feea07f1f93d7e6aa9d5654' ||
    contract.baseline.c4ReadinessGate !== 'PASS' ||
    contract.baseline.approvedState !== 'NOT_READY_NON_AUTHORITATIVE' ||
    contract.baseline.finalGeneratorReady !== false ||
    contract.registryPolicy.requiredVersion !== '2.1.0' ||
    contract.registryPolicy.candidateRole !== 'ARCHETYPE_FEATURE' ||
    contract.registryPolicy.candidateDisposition !== 'NOT_ADMITTED'
  ) {
    throw new Error('C4_FEATURE_CONTRACT_BOUNDARY_MISMATCH');
  }
  const boundaries = new Set(contract.hardBoundaries);
  for (const required of [
    'NO_FEATURE_ADMISSION_OR_FEATURE_SET_SELECTION',
    'NO_ARCHETYPE_ALGORITHM_COUNT_OR_LABEL_SELECTION',
    'NO_FICTIONAL_COUNTRY_MAPPING_OR_GENERATION',
    'NO_DERIVED_OR_SYNTHETIC_VALUE_GENERATION',
    'NO_IPF_RAS_OR_TRADE_RECONCILIATION',
    'NO_WORLD_CORE_OR_RUNTIME_IMPORT_OR_MUTATION',
    'NO_SUPABASE_OR_PRODUCTION_DATABASE_ACCESS',
    'NO_LIVE_PROVIDER_NETWORK_RETRIEVAL',
    'NO_FINAL_70_COUNTRY_PACKAGE',
  ]) {
    if (!boundaries.has(required)) {
      throw new Error(`C4_FEATURE_CONTRACT_BOUNDARY_MISSING:${required}`);
    }
  }
}

function verifyRawBindings(
  contract: C4FeatureAdmissionExecutionContract,
  bytesByPath: ReadonlyMap<string, Uint8Array>,
): readonly ArtifactBinding[] {
  if (contract.inputArtifacts.length !== bytesByPath.size) {
    throw new Error('C4_FEATURE_INPUT_ARTIFACT_COUNT_MISMATCH');
  }
  const seen = new Set<string>();
  for (const binding of contract.inputArtifacts) {
    if (seen.has(binding.path)) {
      throw new Error(`C4_FEATURE_DUPLICATE_INPUT_PATH:${binding.path}`);
    }
    seen.add(binding.path);
    const bytes = bytesByPath.get(binding.path);
    if (bytes === undefined || sha256Bytes(bytes) !== binding.rawSha256) {
      throw new Error(`C4_FEATURE_RAW_HASH_MISMATCH:${binding.path}`);
    }
  }
  for (const artifactPath of bytesByPath.keys()) {
    if (!seen.has(artifactPath)) {
      throw new Error(`C4_FEATURE_INPUT_BINDING_MISSING:${artifactPath}`);
    }
  }
  return [...contract.inputArtifacts].sort((left, right) =>
    compareText(left.path, right.path),
  );
}

function validateC2Binding(
  c3Contract: C3ExecutionContractInput,
  artifacts: readonly ArtifactBinding[],
): void {
  const c3Bindings = new Map(
    c3Contract.c2ReviewTarget.inputArtifacts.map(({ path, sha256 }) => [
      path,
      sha256,
    ]),
  );
  const artifactHashes = new Map(
    artifacts.map(({ path, rawSha256 }) => [path, rawSha256]),
  );
  for (const path of [
    PATHS.normalizedObservations,
    PATHS.qualityDiagnostics,
    PATHS.snapshotManifest,
    PATHS.pilotReport,
  ]) {
    if (c3Bindings.get(path) !== artifactHashes.get(path)) {
      throw new Error(`C4_FEATURE_C3_C2_BINDING_MISMATCH:${path}`);
    }
  }
}

function registryMap(
  registry: VariableRegistry,
): ReadonlyMap<string, VariableRegistryEntry> {
  const output = new Map<string, VariableRegistryEntry>();
  for (const variable of registry.variables) {
    if (output.has(variable.variableId)) {
      throw new Error(
        `C4_FEATURE_DUPLICATE_REGISTRY_ID:${variable.variableId}`,
      );
    }
    output.set(variable.variableId, variable);
  }
  return output;
}

function snapshotSourceMap(
  manifest: SnapshotManifest,
): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  for (const { snapshotId, sourceId } of manifest.snapshots) {
    if (output.has(snapshotId)) {
      throw new Error(`C4_FEATURE_DUPLICATE_SNAPSHOT_ID:${snapshotId}`);
    }
    output.set(snapshotId, sourceId);
  }
  return output;
}

function validatePilotRegistryCoverage(
  observations: readonly NormalizedObservation[],
  registry: ReadonlyMap<string, VariableRegistryEntry>,
  sourceBySnapshotId: ReadonlyMap<string, string>,
): void {
  for (const observation of observations) {
    const variable = registry.get(observation.variableId);
    if (variable === undefined) {
      throw new Error(
        `C4_FEATURE_UNREGISTERED_PILOT_VARIABLE:${observation.variableId}`,
      );
    }
    if (
      observation.canonicalUnit !== variable.canonicalUnit ||
      observation.dataClass !== variable.dataClass
    ) {
      throw new Error(
        `C4_FEATURE_REGISTRY_SEMANTICS_MISMATCH:${observation.variableId}`,
      );
    }
    const snapshotId = observation.sourceSnapshotId;
    const sourceId =
      snapshotId === null ? undefined : sourceBySnapshotId.get(snapshotId);
    const allowedSources = new Set([
      variable.preferredSourceId,
      ...variable.fallbackSourceIds,
    ]);
    if (sourceId === undefined || !allowedSources.has(sourceId)) {
      throw new Error(
        `C4_FEATURE_REGISTRY_SOURCE_MISMATCH:${observation.variableId}`,
      );
    }
  }
}

function validateStatusesAndQuality(
  c3Contract: C3ExecutionContractInput,
  normalized: NormalizedArtifact,
  quality: QualityArtifact,
  manifest: SnapshotManifest,
  report: PilotReport,
): void {
  const expected = c3Contract.c2ReviewTarget.normalizedObservationStatus;
  if (
    normalized.status !== expected ||
    quality.status !== expected ||
    manifest.status !== expected ||
    report.status !== expected
  ) {
    throw new Error('C4_FEATURE_C2_STATUS_MISMATCH');
  }
  const distinct = new Set(
    normalized.observations.map(({ observationId }) => observationId),
  ).size;
  const exactDuplicates = normalized.observations.length - distinct;
  const missing = normalized.observations.filter(
    ({ value }) => value === null,
  ).length;
  if (
    quality.diagnosticCounts['DUPLICATE_OBSERVATION'] !== exactDuplicates ||
    quality.diagnosticCounts['MISSING_OBSERVATION'] !== missing ||
    quality.diagnosticCounts['REPORTING_ASYMMETRY'] !== 3 ||
    quality.exactnessFailures.length !== 0
  ) {
    throw new Error('C4_FEATURE_QUALITY_EVIDENCE_MISMATCH');
  }
  const wto = report.providerRuns.find(
    ({ sourceId }) => sourceId === 'WTO_TIMESERIES_V1',
  );
  if (
    wto?.status !== 'NOT_FETCHED' ||
    !wto.issues.includes('WTO_API_KEY_MISSING')
  ) {
    throw new Error('C4_FEATURE_WTO_GAP_NOT_PRESERVED');
  }
}

export function createVerifiedC4FeatureAdmissionInputBundle(
  bytes: C4FeatureAdmissionInputBytes,
): VerifiedC4FeatureAdmissionInputBundle {
  const frozenBytes = snapshotInputs(bytes);
  const contract = parseBoundJson<C4FeatureAdmissionExecutionContract>(
    frozenBytes.executionContract,
    'data/calibration/preflight/c4_feature_admission_execution_contract.v1.json',
  );
  if (
    sha256Canonical(contract) !== C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH
  ) {
    throw new Error('C4_FEATURE_EXECUTION_CONTRACT_HASH_MISMATCH');
  }
  validateContractBoundary(contract);
  const artifacts = verifyRawBindings(contract, inputByteMap(frozenBytes));
  const preflight = verifyC4GenerationPreflight({
    preflight: frozenBytes.c4Preflight,
    c3ExecutionContract: frozenBytes.c3ExecutionContract,
    c3Summary: frozenBytes.c3Summary,
    c3UncertaintyRegister: frozenBytes.c3UncertaintyRegister,
    c3Manifest: frozenBytes.c3Manifest,
  });
  if (
    preflight.contentHash !== C4_GENERATION_PREFLIGHT_CANONICAL_HASH ||
    preflight.finalGeneratorReady !== false
  ) {
    throw new Error('C4_FEATURE_PREFLIGHT_BOUNDARY_MISMATCH');
  }

  const c3Contract = parseBoundJson<C3ExecutionContractInput>(
    frozenBytes.c3ExecutionContract,
    PATHS.c3ExecutionContract,
  );
  validateC2Binding(c3Contract, artifacts);
  const normalized = parseBoundJson<NormalizedArtifact>(
    frozenBytes.normalizedObservations,
    PATHS.normalizedObservations,
  );
  const quality = parseBoundJson<QualityArtifact>(
    frozenBytes.qualityDiagnostics,
    PATHS.qualityDiagnostics,
  );
  const manifest = parseBoundJson<SnapshotManifest>(
    frozenBytes.snapshotManifest,
    PATHS.snapshotManifest,
  );
  const report = parseBoundJson<PilotReport>(
    frozenBytes.pilotReport,
    PATHS.pilotReport,
  );
  const registry = parseBoundJson<VariableRegistry>(
    frozenBytes.variableRegistry,
    PATHS.variableRegistry,
  );
  if (
    registry.schemaVersion !== 'variable-registry.v2' ||
    registry.version !== contract.registryPolicy.requiredVersion ||
    registry.status !== 'DEVELOPMENT_NON_AUTHORITATIVE'
  ) {
    throw new Error('C4_FEATURE_VARIABLE_REGISTRY_IDENTITY_MISMATCH');
  }
  validateStatusesAndQuality(c3Contract, normalized, quality, manifest, report);
  const sourceBySnapshotId = snapshotSourceMap(manifest);
  validatePilotRegistryCoverage(
    normalized.observations,
    registryMap(registry),
    sourceBySnapshotId,
  );

  const bundle: VerifiedC4FeatureAdmissionInputBundle = Object.freeze({
    kind: 'VERIFIED_C4_FEATURE_ADMISSION_INPUT_BUNDLE',
  });
  verifiedBundles.set(
    bundle,
    deepFreeze({
      contract,
      preflight,
      artifacts,
      observations: normalized.observations,
      quality,
      registry,
      sourceBySnapshotId,
    }),
  );
  return bundle;
}

function resolveBundle(
  bundle: VerifiedC4FeatureAdmissionInputBundle,
): VerifiedBundleData {
  const candidate = bundle as unknown;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('C4_FEATURE_UNVERIFIED_INPUT_BUNDLE');
  }
  const data = verifiedBundles.get(candidate);
  if (data === undefined) throw new Error('C4_FEATURE_UNVERIFIED_INPUT_BUNDLE');
  return data;
}

function featureEntry(
  variable: VariableRegistryEntry,
  observations: readonly NormalizedObservation[],
  sourceBySnapshotId: ReadonlyMap<string, string>,
): C4FeatureEvidenceEntry {
  const sourceSnapshotIds = sortText(
    observations.flatMap(({ sourceSnapshotId }) =>
      sourceSnapshotId === null ? [] : [sourceSnapshotId],
    ),
  );
  const sourceIds = sortText(
    sourceSnapshotIds.map((snapshotId) => sourceBySnapshotId.get(snapshotId)!),
  );
  const adapterTransformations = sortText(
    observations.map(
      ({ transformationId, transformationVersion }) =>
        `${transformationId}@${transformationVersion}`,
    ),
  );
  const distinctObservationIdCount = new Set(
    observations.map(({ observationId }) => observationId),
  ).size;
  const explicitMissingValueCount = observations.filter(
    ({ value }) => value === null,
  ).length;
  const allowedSourceIds = sortText([
    variable.preferredSourceId,
    ...variable.fallbackSourceIds,
  ]);
  const caveatCodes: string[] = [];
  if (observations.length > 0) {
    caveatCodes.push('FROZEN_PILOT_ONLY');
    if (explicitMissingValueCount > 0) {
      caveatCodes.push('EXPLICIT_MISSING_VALUES_PRESENT');
    }
    if (sourceIds.some((sourceId) => sourceId !== variable.preferredSourceId)) {
      caveatCodes.push('APPROVED_FALLBACK_SOURCE_USED');
    }
    if (
      observations.some(
        ({ sourceAttributes }) => sourceAttributes['providerUnit'] === '',
      )
    ) {
      caveatCodes.push('PROVIDER_UNIT_METADATA_EMPTY');
    }
    if (
      adapterTransformations.some(
        (value) =>
          value !==
          `${variable.transformationId}@${variable.transformationVersion}`,
      )
    ) {
      caveatCodes.push(
        'REGISTRY_AND_ADAPTER_TRANSFORMATIONS_REPORTED_SEPARATELY',
      );
    }
  } else if (variable.dataClass === 'DERIVED') {
    caveatCodes.push('DERIVATION_NOT_RUN');
  } else if (variable.dataClass === 'PLACEHOLDER') {
    caveatCodes.push('PLACEHOLDER_DEFINITION_NOT_APPROVED');
  } else {
    caveatCodes.push('NO_FROZEN_PILOT_OBSERVATIONS');
  }

  let materializationStatus: C4FeatureEvidenceEntry['materializationStatus'];
  if (variable.dataClass === 'DERIVED') {
    materializationStatus = 'DERIVATION_NOT_RUN';
  } else if (variable.dataClass === 'PLACEHOLDER') {
    materializationStatus = 'PLACEHOLDER_VALUE_NOT_ASSIGNED';
  } else if (observations.length > 0) {
    materializationStatus = 'FROZEN_OBSERVATIONS_PRESENT';
  } else {
    materializationStatus = 'NO_FROZEN_PILOT_OBSERVATIONS';
  }

  return {
    variableId: variable.variableId,
    dataClass: variable.dataClass,
    canonicalUnit: variable.canonicalUnit,
    preferredSourceId: variable.preferredSourceId,
    allowedSourceIds,
    registryTransformation: `${variable.transformationId}@${variable.transformationVersion}`,
    missingPolicy: variable.missingPolicy,
    evidenceStatus:
      observations.length > 0
        ? 'PILOT_EVIDENCE_WITH_CAVEATS'
        : 'NO_FROZEN_PILOT_OBSERVATIONS',
    admissionStatus: 'NOT_ADMITTED',
    materializationStatus,
    pilotEvidence: {
      sourceFactCount: observations.length,
      distinctObservationIdCount,
      exactDuplicateFactCount: observations.length - distinctObservationIdCount,
      explicitMissingValueCount,
      sourceIds,
      sourceSnapshotIds,
      adapterTransformations,
    },
    caveatCodes: sortText(caveatCodes),
  };
}

function finalize<T extends Record<string, unknown>>(
  body: T,
): T & { readonly contentHash: string } {
  return deepFreeze({ ...body, contentHash: sha256Canonical(body) });
}

export function createC4FeatureAdmissionEvidence(
  bundle: VerifiedC4FeatureAdmissionInputBundle,
): C4FeatureAdmissionEvidence {
  const {
    contract,
    preflight,
    artifacts,
    observations,
    quality,
    registry,
    sourceBySnapshotId,
  } = resolveBundle(bundle);
  const pilotVariableIds = sortText(
    observations.map(({ variableId }) => variableId),
  );
  const registryById = registryMap(registry);
  const missingVariableIds = pilotVariableIds.filter(
    (variableId) => !registryById.has(variableId),
  );
  const byVariable = new Map<string, NormalizedObservation[]>();
  for (const observation of observations) {
    const values = byVariable.get(observation.variableId) ?? [];
    values.push(observation);
    byVariable.set(observation.variableId, values);
  }
  const features = registry.variables
    .filter(
      ({ calibrationRole }) =>
        calibrationRole === contract.registryPolicy.candidateRole,
    )
    .sort((left, right) => compareText(left.variableId, right.variableId))
    .map((variable) =>
      featureEntry(
        variable,
        byVariable.get(variable.variableId) ?? [],
        sourceBySnapshotId,
      ),
    );
  const distinctObservationIdCount = new Set(
    observations.map(({ observationId }) => observationId),
  ).size;
  const evidence = finalize({
    schemaVersion: 'c4-feature-admission-evidence.v1' as const,
    evidenceId: contract.evidenceId,
    status: contract.status,
    featureSetSelected: false as const,
    finalGeneratorReady: false as const,
    input: {
      contractCanonicalHash: C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH,
      artifacts,
    },
    baseline: {
      ...contract.baseline,
      c4PreflightContentHash: preflight.contentHash,
    },
    registryCoverage: {
      registryVersion: registry.version,
      frozenPilotVariableCount: pilotVariableIds.length,
      registeredPilotVariableCount:
        pilotVariableIds.length - missingVariableIds.length,
      missingVariableIds,
    },
    qualitySummary: {
      sourceFactCount: observations.length,
      distinctObservationIdCount,
      exactDuplicateFactCount: observations.length - distinctObservationIdCount,
      explicitMissingValueCount: observations.filter(
        ({ value }) => value === null,
      ).length,
      reportingAsymmetryCount:
        quality.diagnosticCounts['REPORTING_ASYMMETRY'] ?? 0,
      exactnessFailureCount: quality.exactnessFailures.length,
    },
    candidateSummary: {
      candidateCount: features.length,
      observedCount: features.filter(
        ({ dataClass }) => dataClass === 'OBSERVED',
      ).length,
      derivedCount: features.filter(({ dataClass }) => dataClass === 'DERIVED')
        .length,
      placeholderCount: features.filter(
        ({ dataClass }) => dataClass === 'PLACEHOLDER',
      ).length,
      pilotEvidenceCandidateCount: features.filter(
        ({ pilotEvidence }) => pilotEvidence.sourceFactCount > 0,
      ).length,
      noFrozenPilotObservationCount: features.filter(
        ({ pilotEvidence }) => pilotEvidence.sourceFactCount === 0,
      ).length,
      admittedCount: 0 as const,
    },
    features,
    remainingPrerequisites: preflight.unmetPrerequisites,
    hardBoundaries: contract.hardBoundaries,
  });
  return evidence;
}
