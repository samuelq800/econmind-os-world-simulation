import { canonicalJson, sha256Bytes, sha256Canonical } from './canonical.js';
import { addDecimal, compareDecimal, subtractDecimal } from './decimal.js';
import {
  C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH,
  createC4FeatureAdmissionEvidence,
  createVerifiedC4FeatureAdmissionInputBundle,
  type C4FeatureAdmissionEvidence,
} from './feature-admission.js';
import type { DataClass, NormalizedObservation } from './types.js';

export const C4_GATE_DIAGNOSTICS_CONTRACT_CANONICAL_HASH =
  'c4172d3cc746be5f82b4eadc4494156918b73cc3b25112910ed90d17063eec40';

export interface C4GateDiagnosticsInputBytes {
  readonly executionContract: Uint8Array;
  readonly featureAdmissionExecutionContract: Uint8Array;
  readonly featureAdmissionEvidence: Uint8Array;
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

export interface VerifiedC4GateDiagnosticsInputBundle {
  readonly kind: 'VERIFIED_C4_GATE_DIAGNOSTICS_INPUT_BUNDLE';
}

interface ArtifactBinding {
  readonly path: string;
  readonly rawSha256: string;
  readonly canonicalHash?: string;
}

type MissingnessStrategyId =
  | 'PRESERVE_NULL_NO_IMPUTATION'
  | 'VARIABLE_AVAILABLE_CASE_NO_IMPUTATION'
  | 'COMMON_GRID_COMPLETE_CASE_NO_IMPUTATION'
  | 'OWNER_APPROVED_IMPUTATION';

interface MissingnessStrategyCandidate {
  readonly strategyId: MissingnessStrategyId;
  readonly fillsValuesWhenRun: boolean;
  readonly executionStatus:
    'DIAGNOSTIC_CANDIDATE_NOT_SELECTED' | 'NOT_RUN_OWNER_DECISION_REQUIRED';
}

interface C4GateDiagnosticsExecutionContract {
  readonly schemaVersion: 'c4-gate-diagnostics-execution-contract.v1';
  readonly contractVersion: '1.0.0';
  readonly diagnosticsId: string;
  readonly status: 'DIAGNOSTICS_ONLY_NON_AUTHORITATIVE';
  readonly baseline: {
    readonly featureEvidenceTargetCommit: string;
    readonly featureEvidenceContentHash: string;
    readonly approvedState: 'NOT_READY_NON_AUTHORITATIVE';
    readonly finalGeneratorReady: false;
  };
  readonly inputArtifacts: readonly ArtifactBinding[];
  readonly missingnessStrategyCandidates: readonly MissingnessStrategyCandidate[];
  readonly vintagePolicy: {
    readonly comparablePairRule: string;
    readonly periodDifferenceIsVintageEvidence: false;
    readonly differentQueryIsVintageEvidence: false;
    readonly missingSourceAsOfSupportsStability: false;
  };
  readonly sectorDiagnosticPolicy: {
    readonly observedComponentVariableIds: readonly string[];
    readonly availableComponentSumDataClass: 'DERIVED';
    readonly totalReconciliationStatus: 'NOT_RUN_NON_EXHAUSTIVE_COMPONENT_SET';
    readonly industryTotalMayBeAddedToManufacturing: false;
  };
  readonly tradeDiagnosticPolicy: {
    readonly reportedFlowDataClass: 'OBSERVED';
    readonly mirrorDifferenceDataClass: 'DERIVED';
    readonly exactDuplicateWeighting: string;
    readonly reconciliationStatus: 'NOT_RUN_NO_AVERAGING_NO_IPF_RAS';
  };
  readonly hardBoundaries: readonly string[];
}

interface SnapshotEntry {
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly retrievedAt: string;
  readonly sourceAsOf: string | null;
  readonly requestParameters: Readonly<Record<string, string>>;
  readonly requestedDimensions: Readonly<Record<string, readonly string[]>>;
}

interface SnapshotManifest {
  readonly snapshots: readonly SnapshotEntry[];
}

interface PilotReport {
  readonly providerRuns: readonly {
    readonly sourceId: string;
    readonly status: string;
    readonly issues: readonly string[];
  }[];
}

interface NormalizedArtifact {
  readonly observations: readonly NormalizedObservation[];
}

export type MissingnessApplicabilityStatus =
  | 'APPLICABLE_PRESERVES_EXPLICIT_NULLS'
  | 'APPLICABLE_NON_MISSING_VALUES_ONLY'
  | 'APPLICABLE_WITH_COMMON_GRID_EXCLUSIONS'
  | 'OWNER_DECISION_REQUIRED_EXPLICIT_MISSING_VALUES'
  | 'NOT_NEEDED_NO_EXPLICIT_MISSING_VALUES'
  | 'NOT_ASSESSABLE_NO_FROZEN_PILOT_OBSERVATIONS'
  | 'NOT_APPLICABLE_PLACEHOLDER';

export interface MissingnessVariableApplicability {
  readonly variableId: string;
  readonly dataClass: DataClass;
  readonly pilotObservationCount: number;
  readonly explicitMissingValueCount: number;
  readonly nonMissingValueCount: number;
  readonly strategyApplicability: readonly {
    readonly strategyId: MissingnessStrategyId;
    readonly status: MissingnessApplicabilityStatus;
  }[];
}

export interface VintageProviderDiagnostic {
  readonly sourceId: string;
  readonly providerRunStatus: string;
  readonly snapshotCount: number;
  readonly distinctQueryIdentityCount: number;
  readonly comparableSnapshotPairCount: number;
  readonly snapshotIds: readonly string[];
  readonly queryIdentityHashes: readonly string[];
  readonly observedPeriods: readonly string[];
  readonly sourceAsOfValues: readonly string[];
  readonly sourceAsOfMissingSnapshotCount: number;
  readonly retrievedAtRange: {
    readonly minimum: string;
    readonly maximum: string;
  } | null;
  readonly comparisonStatus:
    | 'NOT_COMPARABLE_SOURCE_NOT_FETCHED'
    | 'NOT_COMPARABLE_SINGLE_SNAPSHOT'
    | 'NOT_COMPARABLE_DIFFERENT_QUERY_IDENTITIES'
    | 'COMPARABLE_SNAPSHOT_PAIRS_AVAILABLE';
  readonly stabilityClaimSupported: false;
}

interface ClassifiedDecimal {
  readonly dataClass: 'OBSERVED' | 'DERIVED';
  readonly value: string | null;
  readonly transformation: string;
}

export interface SectorCellDiagnostic {
  readonly geographyId: string;
  readonly period: string;
  readonly observedComponents: readonly {
    readonly variableId: string;
    readonly dataClass: 'OBSERVED';
    readonly value: string | null;
    readonly observationId: string;
  }[];
  readonly availableComponentSumPctGdp: ClassifiedDecimal;
  readonly residualToHundredPctPoints: ClassifiedDecimal;
  readonly diagnosticStatus:
    | 'PARTIAL_COMPONENT_SUM_NOT_TOTAL_RECONCILIATION'
    | 'NOT_COMPUTED_EXPLICIT_MISSING_COMPONENT';
}

export interface TradeMirrorDiagnostic {
  readonly pairId: string;
  readonly exporterId: string;
  readonly importerId: string;
  readonly period: string;
  readonly productClassification: string;
  readonly productCode: string;
  readonly calibrationSectorId: string;
  readonly reportedExport: {
    readonly dataClass: 'OBSERVED';
    readonly valueUsd: string;
    readonly observationId: string;
    readonly sourceSnapshotId: string;
    readonly sourceFactMultiplicity: number;
  };
  readonly mirrorReportedImport: {
    readonly dataClass: 'OBSERVED';
    readonly valueUsd: string;
    readonly observationId: string;
    readonly sourceSnapshotId: string;
    readonly sourceFactMultiplicity: number;
  };
  readonly signedDifferenceExportMinusMirrorUsd: ClassifiedDecimal;
  readonly absoluteDifferenceUsd: ClassifiedDecimal;
  readonly diagnosticStatus: 'MIRROR_DIFFERENCE_RETAINED_NO_RECONCILIATION';
  readonly reconciliationStatus: 'NOT_RUN_NO_AVERAGING_NO_IPF_RAS';
}

export interface C4GateDiagnosticsPack {
  readonly schemaVersion: 'c4-gate-diagnostics.v1';
  readonly diagnosticsId: string;
  readonly status: 'DIAGNOSTICS_ONLY_NON_AUTHORITATIVE';
  readonly finalGeneratorReady: false;
  readonly input: {
    readonly contractCanonicalHash: string;
    readonly artifacts: readonly ArtifactBinding[];
  };
  readonly baseline: C4GateDiagnosticsExecutionContract['baseline'];
  readonly missingness: {
    readonly strategySelected: false;
    readonly valuesImputed: false;
    readonly strategyCandidates: readonly MissingnessStrategyCandidate[];
    readonly variableApplicability: readonly MissingnessVariableApplicability[];
    readonly commonGridDiagnostic: {
      readonly variableIds: readonly string[];
      readonly expectedCellCount: number;
      readonly completeCellCount: number;
      readonly excludedCellCount: number;
      readonly incompleteCells: readonly {
        readonly geographyId: string;
        readonly period: string;
        readonly missingVariableIds: readonly string[];
      }[];
    };
  };
  readonly vintageStability: {
    readonly comparisonPolicy: C4GateDiagnosticsExecutionContract['vintagePolicy'];
    readonly providerDiagnostics: readonly VintageProviderDiagnostic[];
    readonly comparableSnapshotPairCount: number;
    readonly stabilityClaimsSupported: false;
  };
  readonly sectorDiagnostics: {
    readonly observedComponentVariableIds: readonly string[];
    readonly availableComponentSetIsExhaustive: false;
    readonly totalReconciliationStatus: 'NOT_RUN_NON_EXHAUSTIVE_COMPONENT_SET';
    readonly evaluatedCellCount: number;
    readonly computedPartialSumCellCount: number;
    readonly explicitMissingComponentCellCount: number;
    readonly minimumResidualPctPoints: string | null;
    readonly maximumResidualPctPoints: string | null;
    readonly negativeResidualCellCount: number;
    readonly cells: readonly SectorCellDiagnostic[];
  };
  readonly bilateralTradeDiagnostics: {
    readonly reportedFlowDataClass: 'OBSERVED';
    readonly mirrorDifferenceDataClass: 'DERIVED';
    readonly exactDuplicateSourceFactCount: number;
    readonly distinctMirrorPairCount: number;
    readonly nonzeroDifferencePairCount: number;
    readonly unmatchedDistinctFlowCount: number;
    readonly reconciliationStatus: 'NOT_RUN_NO_AVERAGING_NO_IPF_RAS';
    readonly pairs: readonly TradeMirrorDiagnostic[];
  };
  readonly readinessGapDisposition: readonly {
    readonly prerequisiteId: string;
    readonly gateStatus: 'OPEN';
    readonly evidenceWorkStatus:
      | 'COMPUTABLE_DIAGNOSTICS_COMPLETE'
      | 'DIAGNOSTIC_COMPLETE_NO_COMPARABLE_EVIDENCE'
      | 'EXTERNAL_EVIDENCE_REQUIRED'
      | 'NOT_ADDRESSED_BY_THIS_DIAGNOSTIC_SCOPE'
      | 'BLOCKED_BY_UPSTREAM_GATES';
    readonly remainingRequirementType:
      | 'OWNER_DECISION'
      | 'NEW_SOURCE_EVIDENCE'
      | 'OWNER_DECISION_AND_NEW_SOURCE_EVIDENCE'
      | 'GOVERNANCE_AUTHORIZATION';
    readonly exactNextRequirement: string;
  }[];
  readonly hardBoundaries: readonly string[];
  readonly contentHash: string;
}

const PATHS = Object.freeze({
  featureAdmissionExecutionContract:
    'data/calibration/preflight/c4_feature_admission_execution_contract.v1.json',
  featureAdmissionEvidence:
    'data/calibration/preflight/c4_feature_admission_evidence.v1.json',
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
  readonly contract: C4GateDiagnosticsExecutionContract;
  readonly artifacts: readonly ArtifactBinding[];
  readonly featureEvidence: C4FeatureAdmissionEvidence;
  readonly observations: readonly NormalizedObservation[];
  readonly manifest: SnapshotManifest;
  readonly report: PilotReport;
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
    throw new TypeError(`C4_DIAGNOSTICS_BOUND_BYTES_REQUIRED:${artifactPath}`);
  }
  return new Uint8Array(bytes);
}

function snapshotInputs(
  bytes: C4GateDiagnosticsInputBytes,
): C4GateDiagnosticsInputBytes {
  return {
    executionContract: snapshotBytes(
      bytes.executionContract,
      'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
    ),
    featureAdmissionExecutionContract: snapshotBytes(
      bytes.featureAdmissionExecutionContract,
      PATHS.featureAdmissionExecutionContract,
    ),
    featureAdmissionEvidence: snapshotBytes(
      bytes.featureAdmissionEvidence,
      PATHS.featureAdmissionEvidence,
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
    throw new Error(`C4_DIAGNOSTICS_JSON_PARSE_FAILED:${artifactPath}`);
  }
}

function inputByteMap(
  bytes: C4GateDiagnosticsInputBytes,
): ReadonlyMap<string, Uint8Array> {
  return new Map([
    [
      PATHS.featureAdmissionExecutionContract,
      bytes.featureAdmissionExecutionContract,
    ],
    [PATHS.featureAdmissionEvidence, bytes.featureAdmissionEvidence],
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
  contract: C4GateDiagnosticsExecutionContract,
): void {
  if (
    contract.schemaVersion !== 'c4-gate-diagnostics-execution-contract.v1' ||
    contract.contractVersion !== '1.0.0' ||
    contract.status !== 'DIAGNOSTICS_ONLY_NON_AUTHORITATIVE' ||
    contract.baseline.featureEvidenceTargetCommit !==
      'f564c0ca18387ab4a07144522ec8ce0c0df9ff62' ||
    contract.baseline.featureEvidenceContentHash !==
      'cf3473c4343a88e3db7ac3e6526ef44ed2ce8a54bd1e3f93e13047de4b5a976c' ||
    contract.baseline.approvedState !== 'NOT_READY_NON_AUTHORITATIVE' ||
    contract.baseline.finalGeneratorReady !== false ||
    contract.vintagePolicy.periodDifferenceIsVintageEvidence !== false ||
    contract.vintagePolicy.differentQueryIsVintageEvidence !== false ||
    contract.vintagePolicy.missingSourceAsOfSupportsStability !== false ||
    contract.sectorDiagnosticPolicy.availableComponentSumDataClass !==
      'DERIVED' ||
    contract.sectorDiagnosticPolicy.totalReconciliationStatus !==
      'NOT_RUN_NON_EXHAUSTIVE_COMPONENT_SET' ||
    contract.sectorDiagnosticPolicy.industryTotalMayBeAddedToManufacturing !==
      false ||
    contract.tradeDiagnosticPolicy.reportedFlowDataClass !== 'OBSERVED' ||
    contract.tradeDiagnosticPolicy.mirrorDifferenceDataClass !== 'DERIVED' ||
    contract.tradeDiagnosticPolicy.reconciliationStatus !==
      'NOT_RUN_NO_AVERAGING_NO_IPF_RAS'
  ) {
    throw new Error('C4_DIAGNOSTICS_CONTRACT_BOUNDARY_MISMATCH');
  }
  const strategies = contract.missingnessStrategyCandidates.map(
    ({ strategyId }) => strategyId,
  );
  if (
    canonicalJson(strategies) !==
    canonicalJson([
      'PRESERVE_NULL_NO_IMPUTATION',
      'VARIABLE_AVAILABLE_CASE_NO_IMPUTATION',
      'COMMON_GRID_COMPLETE_CASE_NO_IMPUTATION',
      'OWNER_APPROVED_IMPUTATION',
    ])
  ) {
    throw new Error('C4_DIAGNOSTICS_MISSINGNESS_STRATEGY_SET_MISMATCH');
  }
  const boundaries = new Set(contract.hardBoundaries);
  for (const required of [
    'NO_VALUE_IMPUTATION',
    'NO_MISSINGNESS_STRATEGY_SELECTION',
    'NO_VINTAGE_STABILITY_CLAIM_WITHOUT_COMPARABLE_SNAPSHOTS',
    'NO_SECTOR_TOTAL_CLAIM_FROM_PARTIAL_COMPONENTS',
    'NO_TRADE_MIRROR_AVERAGING_OR_RECONCILIATION',
    'NO_IPF_RAS',
    'NO_ARCHETYPE_OR_FICTIONAL_COUNTRY_GENERATION',
    'NO_WORLD_CORE_OR_RUNTIME_IMPORT_OR_MUTATION',
    'NO_SUPABASE_OR_PRODUCTION_DATABASE_ACCESS',
    'NO_LIVE_PROVIDER_NETWORK_RETRIEVAL',
    'NO_FINAL_70_COUNTRY_PACKAGE',
  ]) {
    if (!boundaries.has(required)) {
      throw new Error(`C4_DIAGNOSTICS_BOUNDARY_MISSING:${required}`);
    }
  }
}

function verifyRawBindings(
  contract: C4GateDiagnosticsExecutionContract,
  bytesByPath: ReadonlyMap<string, Uint8Array>,
): readonly ArtifactBinding[] {
  if (contract.inputArtifacts.length !== bytesByPath.size) {
    throw new Error('C4_DIAGNOSTICS_INPUT_COUNT_MISMATCH');
  }
  const seen = new Set<string>();
  for (const binding of contract.inputArtifacts) {
    if (seen.has(binding.path)) {
      throw new Error(`C4_DIAGNOSTICS_DUPLICATE_INPUT_PATH:${binding.path}`);
    }
    seen.add(binding.path);
    const bytes = bytesByPath.get(binding.path);
    if (bytes === undefined || sha256Bytes(bytes) !== binding.rawSha256) {
      throw new Error(`C4_DIAGNOSTICS_RAW_HASH_MISMATCH:${binding.path}`);
    }
  }
  for (const artifactPath of bytesByPath.keys()) {
    if (!seen.has(artifactPath)) {
      throw new Error(`C4_DIAGNOSTICS_INPUT_BINDING_MISSING:${artifactPath}`);
    }
  }
  return [...contract.inputArtifacts].sort((left, right) =>
    compareText(left.path, right.path),
  );
}

export function createVerifiedC4GateDiagnosticsInputBundle(
  bytes: C4GateDiagnosticsInputBytes,
): VerifiedC4GateDiagnosticsInputBundle {
  const frozenBytes = snapshotInputs(bytes);
  const contract = parseBoundJson<C4GateDiagnosticsExecutionContract>(
    frozenBytes.executionContract,
    'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
  );
  if (
    sha256Canonical(contract) !== C4_GATE_DIAGNOSTICS_CONTRACT_CANONICAL_HASH
  ) {
    throw new Error('C4_DIAGNOSTICS_EXECUTION_CONTRACT_HASH_MISMATCH');
  }
  validateContractBoundary(contract);
  const artifacts = verifyRawBindings(contract, inputByteMap(frozenBytes));
  const featureEvidence = createC4FeatureAdmissionEvidence(
    createVerifiedC4FeatureAdmissionInputBundle({
      executionContract: frozenBytes.featureAdmissionExecutionContract,
      c4Preflight: frozenBytes.c4Preflight,
      c3ExecutionContract: frozenBytes.c3ExecutionContract,
      c3Summary: frozenBytes.c3Summary,
      c3UncertaintyRegister: frozenBytes.c3UncertaintyRegister,
      c3Manifest: frozenBytes.c3Manifest,
      normalizedObservations: frozenBytes.normalizedObservations,
      qualityDiagnostics: frozenBytes.qualityDiagnostics,
      snapshotManifest: frozenBytes.snapshotManifest,
      pilotReport: frozenBytes.pilotReport,
      variableRegistry: frozenBytes.variableRegistry,
    }),
  );
  const committedFeatureEvidence = parseBoundJson<C4FeatureAdmissionEvidence>(
    frozenBytes.featureAdmissionEvidence,
    PATHS.featureAdmissionEvidence,
  );
  if (
    featureEvidence.contentHash !==
      contract.baseline.featureEvidenceContentHash ||
    canonicalJson(committedFeatureEvidence) !== canonicalJson(featureEvidence)
  ) {
    throw new Error('C4_DIAGNOSTICS_FEATURE_EVIDENCE_MISMATCH');
  }
  const featureContractBinding = contract.inputArtifacts.find(
    ({ path }) => path === PATHS.featureAdmissionExecutionContract,
  );
  if (
    featureContractBinding?.canonicalHash !==
    C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH
  ) {
    throw new Error('C4_DIAGNOSTICS_FEATURE_CONTRACT_BINDING_MISMATCH');
  }

  const normalized = parseBoundJson<NormalizedArtifact>(
    frozenBytes.normalizedObservations,
    PATHS.normalizedObservations,
  );
  const manifest = parseBoundJson<SnapshotManifest>(
    frozenBytes.snapshotManifest,
    PATHS.snapshotManifest,
  );
  const report = parseBoundJson<PilotReport>(
    frozenBytes.pilotReport,
    PATHS.pilotReport,
  );
  const bundle: VerifiedC4GateDiagnosticsInputBundle = Object.freeze({
    kind: 'VERIFIED_C4_GATE_DIAGNOSTICS_INPUT_BUNDLE',
  });
  verifiedBundles.set(
    bundle,
    deepFreeze({
      contract,
      artifacts,
      featureEvidence,
      observations: normalized.observations,
      manifest,
      report,
    }),
  );
  return bundle;
}

function resolveBundle(
  bundle: VerifiedC4GateDiagnosticsInputBundle,
): VerifiedBundleData {
  const candidate = bundle as unknown;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('C4_DIAGNOSTICS_UNVERIFIED_INPUT_BUNDLE');
  }
  const data = verifiedBundles.get(candidate);
  if (data === undefined) {
    throw new Error('C4_DIAGNOSTICS_UNVERIFIED_INPUT_BUNDLE');
  }
  return data;
}

function observationsByVariable(
  observations: readonly NormalizedObservation[],
): ReadonlyMap<string, readonly NormalizedObservation[]> {
  const output = new Map<string, NormalizedObservation[]>();
  for (const observation of observations) {
    const values = output.get(observation.variableId) ?? [];
    values.push(observation);
    output.set(observation.variableId, values);
  }
  return output;
}

function missingnessApplicability(
  featureEvidence: C4FeatureAdmissionEvidence,
  strategies: readonly MissingnessStrategyCandidate[],
): readonly MissingnessVariableApplicability[] {
  return featureEvidence.features.map((feature) => {
    const sourceFactCount = feature.pilotEvidence.sourceFactCount;
    const missingCount = feature.pilotEvidence.explicitMissingValueCount;
    const applicability = strategies.map(({ strategyId }) => {
      let status: MissingnessApplicabilityStatus;
      if (feature.dataClass === 'PLACEHOLDER') {
        status = 'NOT_APPLICABLE_PLACEHOLDER';
      } else if (sourceFactCount === 0) {
        status = 'NOT_ASSESSABLE_NO_FROZEN_PILOT_OBSERVATIONS';
      } else if (strategyId === 'PRESERVE_NULL_NO_IMPUTATION') {
        status = 'APPLICABLE_PRESERVES_EXPLICIT_NULLS';
      } else if (strategyId === 'VARIABLE_AVAILABLE_CASE_NO_IMPUTATION') {
        status = 'APPLICABLE_NON_MISSING_VALUES_ONLY';
      } else if (strategyId === 'COMMON_GRID_COMPLETE_CASE_NO_IMPUTATION') {
        status = 'APPLICABLE_WITH_COMMON_GRID_EXCLUSIONS';
      } else if (missingCount > 0) {
        status = 'OWNER_DECISION_REQUIRED_EXPLICIT_MISSING_VALUES';
      } else {
        status = 'NOT_NEEDED_NO_EXPLICIT_MISSING_VALUES';
      }
      return { strategyId, status };
    });
    return {
      variableId: feature.variableId,
      dataClass: feature.dataClass,
      pilotObservationCount: sourceFactCount,
      explicitMissingValueCount: missingCount,
      nonMissingValueCount: sourceFactCount - missingCount,
      strategyApplicability: applicability,
    };
  });
}

function commonGridDiagnostic(
  featureEvidence: C4FeatureAdmissionEvidence,
  observations: readonly NormalizedObservation[],
): C4GateDiagnosticsPack['missingness']['commonGridDiagnostic'] {
  const variableIds = featureEvidence.features
    .filter(({ pilotEvidence }) => pilotEvidence.sourceFactCount > 0)
    .map(({ variableId }) => variableId)
    .sort(compareText);
  const variableSet = new Set(variableIds);
  const byCell = new Map<string, Map<string, string | null>>();
  for (const observation of observations) {
    if (!variableSet.has(observation.variableId)) continue;
    const cellKey = `${observation.geographyId}\u0000${observation.period}`;
    const cell = byCell.get(cellKey) ?? new Map<string, string | null>();
    if (cell.has(observation.variableId)) {
      throw new Error(
        `C4_DIAGNOSTICS_MULTIPLE_COMMON_GRID_VALUES:${observation.variableId}:${cellKey}`,
      );
    }
    cell.set(observation.variableId, observation.value);
    byCell.set(cellKey, cell);
  }
  const incompleteCells = [...byCell.entries()]
    .map(([cellKey, cell]) => {
      const [geographyId = '', period = ''] = cellKey.split('\u0000');
      const missingVariableIds = variableIds.filter(
        (variableId) => !cell.has(variableId) || cell.get(variableId) === null,
      );
      return { geographyId, period, missingVariableIds };
    })
    .filter(({ missingVariableIds }) => missingVariableIds.length > 0)
    .sort(
      (left, right) =>
        compareText(left.geographyId, right.geographyId) ||
        compareText(left.period, right.period),
    );
  return {
    variableIds,
    expectedCellCount: byCell.size,
    completeCellCount: byCell.size - incompleteCells.length,
    excludedCellCount: incompleteCells.length,
    incompleteCells,
  };
}

function comparablePairCount(snapshots: readonly SnapshotEntry[]): number {
  const byQuery = new Map<string, Set<string>>();
  for (const snapshot of snapshots) {
    const queryHash = sha256Canonical({
      sourceId: snapshot.sourceId,
      requestParameters: snapshot.requestParameters,
    });
    const retrievals = byQuery.get(queryHash) ?? new Set<string>();
    retrievals.add(snapshot.retrievedAt);
    byQuery.set(queryHash, retrievals);
  }
  let count = 0;
  for (const retrievals of byQuery.values()) {
    count += (retrievals.size * (retrievals.size - 1)) / 2;
  }
  return count;
}

function vintageDiagnostics(
  report: PilotReport,
  manifest: SnapshotManifest,
): readonly VintageProviderDiagnostic[] {
  return [...report.providerRuns]
    .sort((left, right) => compareText(left.sourceId, right.sourceId))
    .map((run) => {
      const snapshots = manifest.snapshots.filter(
        ({ sourceId }) => sourceId === run.sourceId,
      );
      const queryIdentityHashes = sortText(
        snapshots.map(({ sourceId, requestParameters }) =>
          sha256Canonical({ sourceId, requestParameters }),
        ),
      );
      const comparableSnapshotPairCount = comparablePairCount(snapshots);
      const retrievedAt = snapshots
        .map(({ retrievedAt }) => retrievedAt)
        .sort();
      let comparisonStatus: VintageProviderDiagnostic['comparisonStatus'];
      if (snapshots.length === 0) {
        comparisonStatus = 'NOT_COMPARABLE_SOURCE_NOT_FETCHED';
      } else if (snapshots.length === 1) {
        comparisonStatus = 'NOT_COMPARABLE_SINGLE_SNAPSHOT';
      } else if (comparableSnapshotPairCount === 0) {
        comparisonStatus = 'NOT_COMPARABLE_DIFFERENT_QUERY_IDENTITIES';
      } else {
        comparisonStatus = 'COMPARABLE_SNAPSHOT_PAIRS_AVAILABLE';
      }
      return {
        sourceId: run.sourceId,
        providerRunStatus: run.status,
        snapshotCount: snapshots.length,
        distinctQueryIdentityCount: queryIdentityHashes.length,
        comparableSnapshotPairCount,
        snapshotIds: sortText(snapshots.map(({ snapshotId }) => snapshotId)),
        queryIdentityHashes,
        observedPeriods: sortText(
          snapshots.flatMap(
            ({ requestedDimensions }) => requestedDimensions['periods'] ?? [],
          ),
        ),
        sourceAsOfValues: sortText(
          snapshots.flatMap(({ sourceAsOf }) =>
            sourceAsOf === null ? [] : [sourceAsOf],
          ),
        ),
        sourceAsOfMissingSnapshotCount: snapshots.filter(
          ({ sourceAsOf }) => sourceAsOf === null,
        ).length,
        retrievedAtRange:
          retrievedAt.length === 0
            ? null
            : { minimum: retrievedAt[0]!, maximum: retrievedAt.at(-1)! },
        comparisonStatus,
        stabilityClaimSupported: false,
      };
    });
}

function sectorDiagnostics(
  contract: C4GateDiagnosticsExecutionContract,
  observations: readonly NormalizedObservation[],
): C4GateDiagnosticsPack['sectorDiagnostics'] {
  const variableIds = [
    ...contract.sectorDiagnosticPolicy.observedComponentVariableIds,
  ];
  const variableSet = new Set(variableIds);
  const byCell = new Map<string, Map<string, NormalizedObservation>>();
  for (const observation of observations) {
    if (!variableSet.has(observation.variableId)) continue;
    const cellKey = `${observation.geographyId}\u0000${observation.period}`;
    const cell =
      byCell.get(cellKey) ?? new Map<string, NormalizedObservation>();
    if (cell.has(observation.variableId)) {
      throw new Error(
        `C4_DIAGNOSTICS_MULTIPLE_SECTOR_VALUES:${observation.variableId}:${cellKey}`,
      );
    }
    cell.set(observation.variableId, observation);
    byCell.set(cellKey, cell);
  }
  const cells = [...byCell.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([cellKey, byVariable]) => {
      const [geographyId = '', period = ''] = cellKey.split('\u0000');
      const observedComponents = variableIds.map((variableId) => {
        const observation = byVariable.get(variableId);
        if (observation === undefined || observation.dataClass !== 'OBSERVED') {
          throw new Error(
            `C4_DIAGNOSTICS_MISSING_SECTOR_OBSERVATION:${variableId}:${cellKey}`,
          );
        }
        return {
          variableId,
          dataClass: 'OBSERVED' as const,
          value: observation.value,
          observationId: observation.observationId,
        };
      });
      const values = observedComponents.flatMap(({ value }) =>
        value === null ? [] : [value],
      );
      const complete = values.length === variableIds.length;
      const sum = complete
        ? values.reduce((total, value) => addDecimal(total, value), '0')
        : null;
      const residual = sum === null ? null : subtractDecimal('100', sum);
      return {
        geographyId,
        period,
        observedComponents,
        availableComponentSumPctGdp: {
          dataClass: 'DERIVED' as const,
          value: sum,
          transformation: 'C4_SECTOR_AVAILABLE_COMPONENT_SUM_EXACT@1.0.0',
        },
        residualToHundredPctPoints: {
          dataClass: 'DERIVED' as const,
          value: residual,
          transformation: 'C4_SECTOR_RESIDUAL_TO_100_EXACT@1.0.0',
        },
        diagnosticStatus: complete
          ? ('PARTIAL_COMPONENT_SUM_NOT_TOTAL_RECONCILIATION' as const)
          : ('NOT_COMPUTED_EXPLICIT_MISSING_COMPONENT' as const),
      };
    });
  const residuals = cells.flatMap(({ residualToHundredPctPoints }) =>
    residualToHundredPctPoints.value === null
      ? []
      : [residualToHundredPctPoints.value],
  );
  const orderedResiduals = [...residuals].sort(compareDecimal);
  return {
    observedComponentVariableIds: variableIds,
    availableComponentSetIsExhaustive: false,
    totalReconciliationStatus:
      contract.sectorDiagnosticPolicy.totalReconciliationStatus,
    evaluatedCellCount: cells.length,
    computedPartialSumCellCount: residuals.length,
    explicitMissingComponentCellCount: cells.length - residuals.length,
    minimumResidualPctPoints: orderedResiduals[0] ?? null,
    maximumResidualPctPoints: orderedResiduals.at(-1) ?? null,
    negativeResidualCellCount: residuals.filter(
      (value) => compareDecimal(value, '0') < 0,
    ).length,
    cells,
  };
}

interface UniqueTradeObservation {
  readonly observation: NormalizedObservation;
  readonly sourceFactMultiplicity: number;
}

function uniqueTradeObservations(
  observations: readonly NormalizedObservation[],
): readonly UniqueTradeObservation[] {
  const byId = new Map<string, UniqueTradeObservation>();
  for (const observation of observations) {
    const existing = byId.get(observation.observationId);
    if (existing !== undefined) {
      if (canonicalJson(existing.observation) !== canonicalJson(observation)) {
        throw new Error(
          `C4_DIAGNOSTICS_CONFLICTING_DUPLICATE:${observation.observationId}`,
        );
      }
      byId.set(observation.observationId, {
        observation: existing.observation,
        sourceFactMultiplicity: existing.sourceFactMultiplicity + 1,
      });
    } else {
      byId.set(observation.observationId, {
        observation,
        sourceFactMultiplicity: 1,
      });
    }
  }
  return [...byId.values()];
}

function requireAttribute(
  observation: NormalizedObservation,
  key: string,
): string {
  const value = observation.sourceAttributes[key];
  if (value === undefined || value === null || value.length === 0) {
    throw new Error(
      `C4_DIAGNOSTICS_TRADE_ATTRIBUTE_REQUIRED:${observation.observationId}:${key}`,
    );
  }
  return value;
}

function tradePairKey(
  observation: NormalizedObservation,
  side: 'EXPORT' | 'MIRROR_IMPORT',
): string {
  const partner = requireAttribute(observation, 'canonicalPartnerEntityId');
  const exporterId = side === 'EXPORT' ? observation.geographyId : partner;
  const importerId = side === 'EXPORT' ? partner : observation.geographyId;
  return [
    exporterId,
    importerId,
    observation.period,
    requireAttribute(observation, 'productClassification'),
    requireAttribute(observation, 'productCode'),
    requireAttribute(observation, 'calibrationSectorId'),
  ].join('\u0000');
}

function bilateralTradeDiagnostics(
  contract: C4GateDiagnosticsExecutionContract,
  observations: readonly NormalizedObservation[],
): C4GateDiagnosticsPack['bilateralTradeDiagnostics'] {
  const sourceFacts = observations.filter(({ variableId }) =>
    variableId.startsWith('bilateral_trade_'),
  );
  const unique = uniqueTradeObservations(sourceFacts);
  const exportsByKey = new Map<string, UniqueTradeObservation>();
  const importsByKey = new Map<string, UniqueTradeObservation>();
  for (const entry of unique) {
    const { observation } = entry;
    if (observation.variableId === 'bilateral_trade_exports_usd') {
      const key = tradePairKey(observation, 'EXPORT');
      if (exportsByKey.has(key)) {
        throw new Error(`C4_DIAGNOSTICS_MULTIPLE_DISTINCT_EXPORTS:${key}`);
      }
      exportsByKey.set(key, entry);
    } else if (observation.variableId === 'bilateral_trade_imports_usd') {
      const key = tradePairKey(observation, 'MIRROR_IMPORT');
      if (importsByKey.has(key)) {
        throw new Error(`C4_DIAGNOSTICS_MULTIPLE_DISTINCT_IMPORTS:${key}`);
      }
      importsByKey.set(key, entry);
    }
  }
  const pairKeys = sortText([...exportsByKey.keys(), ...importsByKey.keys()]);
  const unmatched = pairKeys.filter(
    (key) => !exportsByKey.has(key) || !importsByKey.has(key),
  );
  const pairs = pairKeys.flatMap((key) => {
    const exportEntry = exportsByKey.get(key);
    const importEntry = importsByKey.get(key);
    if (exportEntry === undefined || importEntry === undefined) return [];
    const exportObservation = exportEntry.observation;
    const importObservation = importEntry.observation;
    if (
      exportObservation.value === null ||
      importObservation.value === null ||
      exportObservation.sourceSnapshotId === null ||
      importObservation.sourceSnapshotId === null
    ) {
      throw new Error(`C4_DIAGNOSTICS_TRADE_PAIR_VALUE_REQUIRED:${key}`);
    }
    const [
      exporterId = '',
      importerId = '',
      period = '',
      productClassification = '',
      productCode = '',
      calibrationSectorId = '',
    ] = key.split('\u0000');
    const signedDifference = subtractDecimal(
      exportObservation.value,
      importObservation.value,
    );
    const absoluteDifference =
      compareDecimal(signedDifference, '0') < 0
        ? subtractDecimal('0', signedDifference)
        : signedDifference;
    return [
      {
        pairId: `mirror_${sha256Canonical({
          exporterId,
          importerId,
          period,
          productClassification,
          productCode,
          calibrationSectorId,
        })}`,
        exporterId,
        importerId,
        period,
        productClassification,
        productCode,
        calibrationSectorId,
        reportedExport: {
          dataClass: 'OBSERVED' as const,
          valueUsd: exportObservation.value,
          observationId: exportObservation.observationId,
          sourceSnapshotId: exportObservation.sourceSnapshotId,
          sourceFactMultiplicity: exportEntry.sourceFactMultiplicity,
        },
        mirrorReportedImport: {
          dataClass: 'OBSERVED' as const,
          valueUsd: importObservation.value,
          observationId: importObservation.observationId,
          sourceSnapshotId: importObservation.sourceSnapshotId,
          sourceFactMultiplicity: importEntry.sourceFactMultiplicity,
        },
        signedDifferenceExportMinusMirrorUsd: {
          dataClass: 'DERIVED' as const,
          value: signedDifference,
          transformation: 'C4_TRADE_MIRROR_SIGNED_DIFFERENCE_EXACT@1.0.0',
        },
        absoluteDifferenceUsd: {
          dataClass: 'DERIVED' as const,
          value: absoluteDifference,
          transformation: 'C4_TRADE_MIRROR_ABSOLUTE_DIFFERENCE_EXACT@1.0.0',
        },
        diagnosticStatus:
          'MIRROR_DIFFERENCE_RETAINED_NO_RECONCILIATION' as const,
        reconciliationStatus:
          contract.tradeDiagnosticPolicy.reconciliationStatus,
      },
    ];
  });
  return {
    reportedFlowDataClass: contract.tradeDiagnosticPolicy.reportedFlowDataClass,
    mirrorDifferenceDataClass:
      contract.tradeDiagnosticPolicy.mirrorDifferenceDataClass,
    exactDuplicateSourceFactCount: sourceFacts.length - unique.length,
    distinctMirrorPairCount: pairs.length,
    nonzeroDifferencePairCount: pairs.filter(
      ({ signedDifferenceExportMinusMirrorUsd }) =>
        compareDecimal(signedDifferenceExportMinusMirrorUsd.value!, '0') !== 0,
    ).length,
    unmatchedDistinctFlowCount: unmatched.length,
    reconciliationStatus: contract.tradeDiagnosticPolicy.reconciliationStatus,
    pairs,
  };
}

function readinessGapDisposition(
  featureEvidence: C4FeatureAdmissionEvidence,
): C4GateDiagnosticsPack['readinessGapDisposition'] {
  const disposition = new Map<
    string,
    Omit<
      C4GateDiagnosticsPack['readinessGapDisposition'][number],
      'prerequisiteId' | 'gateStatus'
    >
  >([
    [
      'MISSING_VALUE_POLICY_FOR_ARCHETYPE_FEATURES_UNAPPROVED',
      {
        evidenceWorkStatus: 'COMPUTABLE_DIAGNOSTICS_COMPLETE',
        remainingRequirementType: 'OWNER_DECISION',
        exactNextRequirement:
          'Approve one missingness policy and its variable-level applicability; no imputation values were generated.',
      },
    ],
    [
      'ARCHETYPE_METHOD_AND_COUNT_UNSELECTED',
      {
        evidenceWorkStatus: 'NOT_ADDRESSED_BY_THIS_DIAGNOSTIC_SCOPE',
        remainingRequirementType: 'OWNER_DECISION',
        exactNextRequirement:
          'Select and review an archetype method, count, labels, and feature set in a separately authorized decision.',
      },
    ],
    [
      'FICTIONAL_COUNTRY_MAPPING_NOT_AUTHORIZED',
      {
        evidenceWorkStatus: 'NOT_ADDRESSED_BY_THIS_DIAGNOSTIC_SCOPE',
        remainingRequirementType: 'GOVERNANCE_AUTHORIZATION',
        exactNextRequirement:
          'Obtain explicit governance authorization before any fictional-country mapping or generation.',
      },
    ],
    [
      'WTO_TARIFF_EVIDENCE_ABSENT',
      {
        evidenceWorkStatus: 'EXTERNAL_EVIDENCE_REQUIRED',
        remainingRequirementType: 'NEW_SOURCE_EVIDENCE',
        exactNextRequirement:
          'Provide an authenticated, frozen, reviewed WTO tariff snapshot; no substitute evidence is present.',
      },
    ],
    [
      'VINTAGE_STABILITY_NOT_ESTABLISHED',
      {
        evidenceWorkStatus: 'DIAGNOSTIC_COMPLETE_NO_COMPARABLE_EVIDENCE',
        remainingRequirementType: 'NEW_SOURCE_EVIDENCE',
        exactNextRequirement:
          'Provide at least two distinct retrievals of the same canonical provider query for a valid vintage comparison.',
      },
    ],
    [
      'SECTOR_TAXONOMY_AND_TRADE_RECONCILIATION_UNREVIEWED',
      {
        evidenceWorkStatus: 'COMPUTABLE_DIAGNOSTICS_COMPLETE',
        remainingRequirementType: 'OWNER_DECISION_AND_NEW_SOURCE_EVIDENCE',
        exactNextRequirement:
          'Approve an exhaustive sector component taxonomy and mirror policy, and provide missing sector-total evidence before any reconciliation run.',
      },
    ],
    [
      'FINAL_CALIBRATION_AND_RUNTIME_HANDOFF_BLOCKED',
      {
        evidenceWorkStatus: 'BLOCKED_BY_UPSTREAM_GATES',
        remainingRequirementType: 'GOVERNANCE_AUTHORIZATION',
        exactNextRequirement:
          'Close all upstream evidence and owner gates before a separately reviewed final calibration or runtime handoff.',
      },
    ],
  ]);
  return featureEvidence.remainingPrerequisites.map(({ prerequisiteId }) => {
    const item = disposition.get(prerequisiteId);
    if (item === undefined) {
      throw new Error(`C4_DIAGNOSTICS_UNKNOWN_PREREQUISITE:${prerequisiteId}`);
    }
    return {
      prerequisiteId,
      gateStatus: 'OPEN' as const,
      ...item,
    };
  });
}

function finalize<T extends Record<string, unknown>>(
  body: T,
): T & { readonly contentHash: string } {
  return deepFreeze({ ...body, contentHash: sha256Canonical(body) });
}

export function createC4GateDiagnosticsPack(
  bundle: VerifiedC4GateDiagnosticsInputBundle,
): C4GateDiagnosticsPack {
  const {
    contract,
    artifacts,
    featureEvidence,
    observations,
    manifest,
    report,
  } = resolveBundle(bundle);
  const variableObservations = observationsByVariable(observations);
  for (const feature of featureEvidence.features) {
    const count = variableObservations.get(feature.variableId)?.length ?? 0;
    if (count !== feature.pilotEvidence.sourceFactCount) {
      throw new Error(
        `C4_DIAGNOSTICS_FEATURE_OBSERVATION_COUNT_MISMATCH:${feature.variableId}`,
      );
    }
  }
  const providerDiagnostics = vintageDiagnostics(report, manifest);
  return finalize({
    schemaVersion: 'c4-gate-diagnostics.v1' as const,
    diagnosticsId: contract.diagnosticsId,
    status: contract.status,
    finalGeneratorReady: false as const,
    input: {
      contractCanonicalHash: C4_GATE_DIAGNOSTICS_CONTRACT_CANONICAL_HASH,
      artifacts,
    },
    baseline: contract.baseline,
    missingness: {
      strategySelected: false as const,
      valuesImputed: false as const,
      strategyCandidates: contract.missingnessStrategyCandidates,
      variableApplicability: missingnessApplicability(
        featureEvidence,
        contract.missingnessStrategyCandidates,
      ),
      commonGridDiagnostic: commonGridDiagnostic(featureEvidence, observations),
    },
    vintageStability: {
      comparisonPolicy: contract.vintagePolicy,
      providerDiagnostics,
      comparableSnapshotPairCount: providerDiagnostics.reduce(
        (sum, item) => sum + item.comparableSnapshotPairCount,
        0,
      ),
      stabilityClaimsSupported: false as const,
    },
    sectorDiagnostics: sectorDiagnostics(contract, observations),
    bilateralTradeDiagnostics: bilateralTradeDiagnostics(
      contract,
      observations,
    ),
    readinessGapDisposition: readinessGapDisposition(featureEvidence),
    hardBoundaries: contract.hardBoundaries,
  });
}
