import { canonicalJson, sha256Bytes, sha256Canonical } from './canonical.js';
import { addDecimal, compareDecimal, divideDecimalExactly } from './decimal.js';
import type { NormalizedObservation } from './types.js';

export type ExplorationStatus = 'EXPLORATORY_NON_AUTHORITATIVE';

export type CoverageDenominatorPolicy =
  'EXPLICIT_EXPECTED_GRID' | 'NOT_DEFINED_FOR_SPARSE_REQUESTED_SLICE';

export interface C3InputArtifact {
  readonly path: string;
  readonly sha256: string;
}

export interface C3CoverageScope {
  readonly scopeId: string;
  readonly variableIds: readonly string[];
  readonly expectedEntityIds?: readonly string[];
  readonly expectedPeriods?: readonly string[];
  readonly coverageDenominatorPolicy: CoverageDenominatorPolicy;
}

export interface C3ExplorationContract {
  readonly schemaVersion: 'c3-exploration-execution-contract.v1';
  readonly contractVersion: string;
  readonly analysisId: string;
  readonly status: ExplorationStatus;
  readonly c2ReviewTarget: {
    readonly commit: string;
    readonly normalizedObservationStatus: string;
    readonly inputArtifacts: readonly C3InputArtifact[];
    readonly requiredProviderTruth: Readonly<Record<string, string>>;
  };
  readonly coverageScopes: readonly C3CoverageScope[];
  readonly qualityTreatment: Readonly<Record<string, string>>;
  readonly statisticalScope: {
    readonly mode: 'DESCRIPTIVE_EXPLORATION_ONLY';
    readonly prohibited: readonly string[];
    readonly reason: string;
  };
  readonly transformation: {
    readonly transformationId: string;
    readonly transformationVersion: string;
    readonly quantileMethod: 'NEAREST_RANK_V1';
    readonly arithmeticPolicy: 'EXACT_DECIMAL_OR_EXACT_RATIONAL_NO_ROUNDING';
    readonly ordering: string;
  };
  readonly hardBoundaries: readonly string[];
}

export interface ArtifactHashBinding {
  readonly path: string;
  readonly sha256: string;
}

export interface C3InputBinding {
  readonly c2ReviewTargetCommit: string;
  readonly contractCanonicalHash: string;
  readonly artifacts: readonly ArtifactHashBinding[];
}

export const C3_EXPLORATION_CONTRACT_CANONICAL_HASH =
  '9c9b3fab9f7def56bbe66d2e1464d278dde345d24dc37fc3e49e6dd883eafd48';

export interface C3FrozenInputBytes {
  readonly executionContract: Uint8Array;
  readonly normalizedObservations: Uint8Array;
  readonly qualityDiagnostics: Uint8Array;
  readonly snapshotManifest: Uint8Array;
  readonly pilotReport: Uint8Array;
}

export interface VerifiedC3FrozenInputBundle {
  readonly kind: 'VERIFIED_C3_FROZEN_INPUT_BUNDLE';
}

export interface ExactFractionSummary {
  readonly numeratorDecimal: string;
  readonly denominatorInteger: string;
  readonly terminatingDecimal: string | null;
  readonly roundingApplied: false;
}

export interface DistributionSummary {
  readonly quantileMethod: 'NEAREST_RANK_V1';
  readonly minimum: string;
  readonly p25: string;
  readonly p50: string;
  readonly p75: string;
  readonly maximum: string;
  readonly exactSum: string;
  readonly arithmeticMean: ExactFractionSummary;
}

export interface FractionCoverage {
  readonly numerator: number;
  readonly denominator: number | null;
  readonly denominatorPolicy: CoverageDenominatorPolicy;
}

export interface VariableExplorationSummary {
  readonly variableId: string;
  readonly canonicalUnit: string;
  readonly coverageScopeId: string;
  readonly sourceFactCount: number;
  readonly distinctObservationIdCount: number;
  readonly exactDuplicateFactCount: number;
  readonly reportedCellCount: number;
  readonly explicitMissingValueCount: number;
  readonly unreportedExpectedCellCount: number | null;
  readonly nonMissingValueCount: number;
  readonly reportedCellCoverage: FractionCoverage;
  readonly nonMissingValueCoverage: FractionCoverage;
  readonly entityIds: readonly string[];
  readonly periods: readonly string[];
  readonly sourceSnapshotIds: readonly string[];
  readonly distribution: DistributionSummary | null;
}

export interface C3ExplorationSummary {
  readonly schemaVersion: 'c3-exploration-summary.v1';
  readonly analysisId: string;
  readonly status: ExplorationStatus;
  readonly input: C3InputBinding;
  readonly transformation: C3ExplorationContract['transformation'];
  readonly qualityTreatment: C3ExplorationContract['qualityTreatment'];
  readonly variableSummaries: readonly VariableExplorationSummary[];
  readonly contentHash: string;
}

export interface C3DiagnosticCount {
  readonly code: string;
  readonly count: number;
}

export interface C3ProviderRun {
  readonly sourceId: string;
  readonly status: string;
  readonly issues: readonly string[];
}

export interface C3UncertaintyEvidence {
  readonly diagnosticCounts: readonly C3DiagnosticCount[];
  readonly providerRuns: readonly C3ProviderRun[];
  readonly revisionVintageObservations: readonly string[];
  readonly providerSpecificCaveats: Readonly<Record<string, string>>;
}

export interface C3UncertaintyEntry {
  readonly uncertaintyId: string;
  readonly category:
    | 'MISSINGNESS'
    | 'DUPLICATION'
    | 'MIRROR_ASYMMETRY'
    | 'PROVIDER_COVERAGE'
    | 'VINTAGE'
    | 'UNIT_METADATA'
    | 'INFERENCE_SCOPE';
  readonly evidenceCount: number | null;
  readonly evidence: readonly string[];
  readonly treatment: string;
  readonly blocks: readonly string[];
}

export interface C3UncertaintyRegister {
  readonly schemaVersion: 'c3-uncertainty-register.v1';
  readonly analysisId: string;
  readonly status: ExplorationStatus;
  readonly input: C3InputBinding;
  readonly entries: readonly C3UncertaintyEntry[];
  readonly contentHash: string;
}

export interface C3ExplorationManifest {
  readonly schemaVersion: 'c3-exploration-manifest.v1';
  readonly analysisId: string;
  readonly status: ExplorationStatus;
  readonly input: C3InputBinding;
  readonly artifacts: readonly {
    readonly path: string;
    readonly schemaVersion: string;
    readonly canonicalContentHash: string;
  }[];
  readonly contentHash: string;
}

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortText(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function nearestRank(
  sortedValues: readonly string[],
  numerator: number,
  denominator: number,
): string {
  const rank = Math.ceil((sortedValues.length * numerator) / denominator);
  const value = sortedValues[rank - 1];
  if (value === undefined) throw new Error('EMPTY_DISTRIBUTION');
  return value;
}

function exactMean(sum: string, count: number): ExactFractionSummary {
  let terminatingDecimal: string | null = null;
  try {
    terminatingDecimal = divideDecimalExactly(sum, String(count));
  } catch (error) {
    if (
      !(error instanceof RangeError) ||
      error.message !== 'CALIBRATION_ROUNDING_POLICY_REQUIRED'
    ) {
      throw error;
    }
  }
  return {
    numeratorDecimal: sum,
    denominatorInteger: String(count),
    terminatingDecimal,
    roundingApplied: false,
  };
}

function makeDistribution(
  observations: readonly NormalizedObservation[],
): DistributionSummary | null {
  const values = observations
    .flatMap((observation) => (observation.value === null ? [] : [observation]))
    .sort(
      (left, right) =>
        compareDecimal(left.value!, right.value!) ||
        compareText(left.observationId, right.observationId),
    );
  if (values.length === 0) return null;
  const decimalValues = values.map(({ value }) => value!);
  const exactSum = decimalValues.reduce(
    (sum, value) => addDecimal(sum, value),
    '0',
  );
  return {
    quantileMethod: 'NEAREST_RANK_V1',
    minimum: decimalValues[0]!,
    p25: nearestRank(decimalValues, 1, 4),
    p50: nearestRank(decimalValues, 1, 2),
    p75: nearestRank(decimalValues, 3, 4),
    maximum: decimalValues.at(-1)!,
    exactSum,
    arithmeticMean: exactMean(exactSum, decimalValues.length),
  };
}

function scopeIndex(
  contract: C3ExplorationContract,
): ReadonlyMap<string, C3CoverageScope> {
  const output = new Map<string, C3CoverageScope>();
  for (const scope of contract.coverageScopes) {
    for (const variableId of scope.variableIds) {
      if (output.has(variableId)) {
        throw new Error(`DUPLICATE_C3_COVERAGE_SCOPE_VARIABLE:${variableId}`);
      }
      output.set(variableId, scope);
    }
  }
  return output;
}

function deduplicateExactObservationIds(
  observations: readonly NormalizedObservation[],
): Readonly<{
  sourceFactCount: number;
  uniqueObservations: readonly NormalizedObservation[];
}> {
  const byId = new Map<string, NormalizedObservation>();
  for (const observation of observations) {
    const existing = byId.get(observation.observationId);
    if (existing === undefined) {
      byId.set(observation.observationId, observation);
      continue;
    }
    if (canonicalJson(existing) !== canonicalJson(observation)) {
      throw new Error(
        `CONFLICTING_DUPLICATE_OBSERVATION_ID:${observation.observationId}`,
      );
    }
  }
  return {
    sourceFactCount: observations.length,
    uniqueObservations: [...byId.values()].sort((left, right) =>
      compareText(left.observationId, right.observationId),
    ),
  };
}

function summarizeVariable(
  variableId: string,
  observations: readonly NormalizedObservation[],
  scope: C3CoverageScope,
): VariableExplorationSummary {
  const { sourceFactCount, uniqueObservations } =
    deduplicateExactObservationIds(observations);
  const units = sortText(
    uniqueObservations.map(({ canonicalUnit }) => canonicalUnit),
  );
  if (units.length !== 1) {
    throw new Error(`MIXED_CANONICAL_UNITS:${variableId}`);
  }
  if (uniqueObservations.some(({ dataClass }) => dataClass !== 'OBSERVED')) {
    throw new Error(`NON_OBSERVED_INPUT_IN_C3_EXPLORATION:${variableId}`);
  }

  let expectedCellCount: number | null = null;
  let reportedCellCount = uniqueObservations.length;
  let unreportedExpectedCellCount: number | null = null;
  if (scope.coverageDenominatorPolicy === 'EXPLICIT_EXPECTED_GRID') {
    const expectedEntityIds = scope.expectedEntityIds;
    const expectedPeriods = scope.expectedPeriods;
    if (expectedEntityIds === undefined || expectedPeriods === undefined) {
      throw new Error(`INCOMPLETE_C3_GRID_SCOPE:${scope.scopeId}`);
    }
    const entities = new Set(expectedEntityIds);
    const periods = new Set(expectedPeriods);
    const reportedCells = new Set<string>();
    for (const observation of uniqueObservations) {
      if (!entities.has(observation.geographyId)) {
        throw new Error(
          `OUT_OF_SCOPE_C3_ENTITY:${variableId}:${observation.geographyId}`,
        );
      }
      if (!periods.has(observation.period)) {
        throw new Error(
          `OUT_OF_SCOPE_C3_PERIOD:${variableId}:${observation.period}`,
        );
      }
      const cell = `${observation.geographyId}\u0000${observation.period}`;
      if (reportedCells.has(cell)) {
        throw new Error(`MULTIPLE_C3_GRID_OBSERVATIONS:${variableId}:${cell}`);
      }
      reportedCells.add(cell);
    }
    expectedCellCount = expectedEntityIds.length * expectedPeriods.length;
    reportedCellCount = reportedCells.size;
    unreportedExpectedCellCount = expectedCellCount - reportedCellCount;
  }

  const explicitMissingValueCount = uniqueObservations.filter(
    ({ value }) => value === null,
  ).length;
  const nonMissingValueCount =
    uniqueObservations.length - explicitMissingValueCount;
  const denominator = expectedCellCount;
  return {
    variableId,
    canonicalUnit: units[0]!,
    coverageScopeId: scope.scopeId,
    sourceFactCount,
    distinctObservationIdCount: uniqueObservations.length,
    exactDuplicateFactCount: sourceFactCount - uniqueObservations.length,
    reportedCellCount,
    explicitMissingValueCount,
    unreportedExpectedCellCount,
    nonMissingValueCount,
    reportedCellCoverage: {
      numerator: reportedCellCount,
      denominator,
      denominatorPolicy: scope.coverageDenominatorPolicy,
    },
    nonMissingValueCoverage: {
      numerator: nonMissingValueCount,
      denominator,
      denominatorPolicy: scope.coverageDenominatorPolicy,
    },
    entityIds: sortText(
      uniqueObservations.map(({ geographyId }) => geographyId),
    ),
    periods: sortText(uniqueObservations.map(({ period }) => period)),
    sourceSnapshotIds: sortText(
      uniqueObservations.flatMap(({ sourceSnapshotId }) =>
        sourceSnapshotId === null ? [] : [sourceSnapshotId],
      ),
    ),
    distribution: makeDistribution(uniqueObservations),
  };
}

const C3_FROZEN_ARTIFACT_PATHS = Object.freeze({
  normalizedObservations:
    'data/calibration/pilot/normalized_observations.v1.json',
  qualityDiagnostics: 'data/calibration/pilot/quality_diagnostics.v1.json',
  snapshotManifest: 'data/calibration/pilot/snapshot_manifest.v1.json',
  pilotReport: 'data/calibration/pilot/pilot_report.v1.json',
});

interface C2NormalizedArtifact {
  readonly status: string;
  readonly observations: readonly NormalizedObservation[];
}

interface C2QualityArtifact {
  readonly status: string;
  readonly diagnostics: readonly { readonly code: string }[];
}

interface C2SnapshotManifest {
  readonly snapshots: readonly {
    readonly sourceId: string;
    readonly endpointIdentity: string;
  }[];
}

interface C2PilotReport {
  readonly status: string;
  readonly providerRuns: readonly C3ProviderRun[];
  readonly revisionVintageObservations: readonly string[];
  readonly providerSpecificCaveats: Readonly<Record<string, string>>;
}

interface VerifiedC3BundleData {
  readonly contract: C3ExplorationContract;
  readonly input: C3InputBinding;
  readonly observations: readonly NormalizedObservation[];
  readonly evidence: C3UncertaintyEvidence;
}

const verifiedC3Bundles = new WeakMap<object, VerifiedC3BundleData>();
const verifiedC3OutputBundles = new WeakMap<
  object,
  VerifiedC3FrozenInputBundle
>();

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), seen);
  }
  return Object.freeze(value) as T;
}

function parseBoundJson<T>(bytes: Uint8Array, artifactPath: string): T {
  try {
    return JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    throw new Error(`C3_BOUND_INPUT_JSON_PARSE_FAILED:${artifactPath}`);
  }
}

function diagnosticCounts(
  diagnostics: readonly { readonly code: string }[],
): readonly C3DiagnosticCount[] {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([code, count]) => ({ code, count }));
}

function validateC2ProviderTruth(
  contract: C3ExplorationContract,
  report: C2PilotReport,
  manifest: C2SnapshotManifest,
): void {
  if (report.status !== contract.c2ReviewTarget.normalizedObservationStatus) {
    throw new Error('C3_C2_REPORT_STATUS_MISMATCH');
  }
  const wto = report.providerRuns.find(
    ({ sourceId }) => sourceId === 'WTO_TIMESERIES_V1',
  );
  if (
    wto?.status !== 'NOT_FETCHED' ||
    !wto.issues.includes('WTO_API_KEY_MISSING')
  ) {
    throw new Error('C3_WTO_PARTIAL_PILOT_TRUTH_NOT_PRESERVED');
  }
  const comtradeSnapshots = manifest.snapshots.filter(
    ({ sourceId }) => sourceId === 'UN_COMTRADE_V1',
  );
  if (
    comtradeSnapshots.length === 0 ||
    comtradeSnapshots.some(
      ({ endpointIdentity }) =>
        endpointIdentity !== 'UN_COMTRADE_PUBLIC_PREVIEW_V1',
    )
  ) {
    throw new Error('C3_COMTRADE_PUBLIC_PREVIEW_TRUTH_NOT_PRESERVED');
  }
  if (!manifest.snapshots.some(({ sourceId }) => sourceId === 'WB_WDI_V2')) {
    throw new Error('C3_WDI_PILOT_TRUTH_NOT_PRESERVED');
  }
}

function finalize<T extends Record<string, unknown>>(
  value: T,
): T & {
  readonly contentHash: string;
} {
  return deepFreeze({
    ...value,
    contentHash: sha256Canonical(value),
  });
}

export function contractCanonicalHash(contract: C3ExplorationContract): string {
  return sha256Canonical(contract);
}

function artifactHashMap(
  artifacts: readonly ArtifactHashBinding[],
  context: 'CONTRACT' | 'INPUT',
): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  for (const { path, sha256 } of artifacts) {
    if (output.has(path)) {
      throw new Error(`C3_DUPLICATE_${context}_ARTIFACT_PATH:${path}`);
    }
    output.set(path, sha256);
  }
  return output;
}

export function validateC3InputBinding(
  contract: C3ExplorationContract,
  actualArtifacts: readonly ArtifactHashBinding[],
): void {
  const expected = artifactHashMap(
    contract.c2ReviewTarget.inputArtifacts,
    'CONTRACT',
  );
  const actual = artifactHashMap(actualArtifacts, 'INPUT');
  if (expected.size !== actual.size) {
    throw new Error('C3_INPUT_ARTIFACT_COUNT_MISMATCH');
  }
  for (const [path, sha256] of expected) {
    if (actual.get(path) !== sha256) {
      throw new Error(`C3_INPUT_ARTIFACT_HASH_MISMATCH:${path}`);
    }
  }
}

function frozenArtifactBindings(
  bytes: C3FrozenInputBytes,
): readonly ArtifactHashBinding[] {
  return [
    {
      path: C3_FROZEN_ARTIFACT_PATHS.normalizedObservations,
      sha256: sha256Bytes(bytes.normalizedObservations),
    },
    {
      path: C3_FROZEN_ARTIFACT_PATHS.qualityDiagnostics,
      sha256: sha256Bytes(bytes.qualityDiagnostics),
    },
    {
      path: C3_FROZEN_ARTIFACT_PATHS.snapshotManifest,
      sha256: sha256Bytes(bytes.snapshotManifest),
    },
    {
      path: C3_FROZEN_ARTIFACT_PATHS.pilotReport,
      sha256: sha256Bytes(bytes.pilotReport),
    },
  ];
}

function snapshotBoundBytes(
  bytes: Uint8Array,
  artifactPath: string,
): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`C3_BOUND_INPUT_BYTES_REQUIRED:${artifactPath}`);
  }
  return new Uint8Array(bytes);
}

function snapshotFrozenInputs(bytes: C3FrozenInputBytes): C3FrozenInputBytes {
  return {
    executionContract: snapshotBoundBytes(
      bytes.executionContract,
      'data/calibration/exploration/c3_execution_contract.v1.json',
    ),
    normalizedObservations: snapshotBoundBytes(
      bytes.normalizedObservations,
      C3_FROZEN_ARTIFACT_PATHS.normalizedObservations,
    ),
    qualityDiagnostics: snapshotBoundBytes(
      bytes.qualityDiagnostics,
      C3_FROZEN_ARTIFACT_PATHS.qualityDiagnostics,
    ),
    snapshotManifest: snapshotBoundBytes(
      bytes.snapshotManifest,
      C3_FROZEN_ARTIFACT_PATHS.snapshotManifest,
    ),
    pilotReport: snapshotBoundBytes(
      bytes.pilotReport,
      C3_FROZEN_ARTIFACT_PATHS.pilotReport,
    ),
  };
}

export function createVerifiedC3FrozenInputBundle(
  bytes: C3FrozenInputBytes,
): VerifiedC3FrozenInputBundle {
  const frozenBytes = snapshotFrozenInputs(bytes);
  const contract = parseBoundJson<C3ExplorationContract>(
    frozenBytes.executionContract,
    'data/calibration/exploration/c3_execution_contract.v1.json',
  );
  const contractHash = contractCanonicalHash(contract);
  if (contractHash !== C3_EXPLORATION_CONTRACT_CANONICAL_HASH) {
    throw new Error('C3_EXECUTION_CONTRACT_HASH_MISMATCH');
  }

  const artifacts = frozenArtifactBindings(frozenBytes);
  validateC3InputBinding(contract, artifacts);

  const normalized = parseBoundJson<C2NormalizedArtifact>(
    frozenBytes.normalizedObservations,
    C3_FROZEN_ARTIFACT_PATHS.normalizedObservations,
  );
  const quality = parseBoundJson<C2QualityArtifact>(
    frozenBytes.qualityDiagnostics,
    C3_FROZEN_ARTIFACT_PATHS.qualityDiagnostics,
  );
  const manifest = parseBoundJson<C2SnapshotManifest>(
    frozenBytes.snapshotManifest,
    C3_FROZEN_ARTIFACT_PATHS.snapshotManifest,
  );
  const report = parseBoundJson<C2PilotReport>(
    frozenBytes.pilotReport,
    C3_FROZEN_ARTIFACT_PATHS.pilotReport,
  );
  if (
    normalized.status !== contract.c2ReviewTarget.normalizedObservationStatus
  ) {
    throw new Error('C3_C2_NORMALIZED_STATUS_MISMATCH');
  }
  if (quality.status !== normalized.status) {
    throw new Error('C3_C2_QUALITY_STATUS_MISMATCH');
  }
  validateC2ProviderTruth(contract, report, manifest);

  const input = deepFreeze({
    c2ReviewTargetCommit: contract.c2ReviewTarget.commit,
    contractCanonicalHash: contractHash,
    artifacts: [...artifacts].sort((left, right) =>
      compareText(left.path, right.path),
    ),
  });
  const data = deepFreeze({
    contract,
    input,
    observations: normalized.observations,
    evidence: {
      diagnosticCounts: diagnosticCounts(quality.diagnostics),
      providerRuns: report.providerRuns,
      revisionVintageObservations: report.revisionVintageObservations,
      providerSpecificCaveats: report.providerSpecificCaveats,
    },
  });
  const bundle: VerifiedC3FrozenInputBundle = Object.freeze({
    kind: 'VERIFIED_C3_FROZEN_INPUT_BUNDLE',
  });
  verifiedC3Bundles.set(bundle, data);
  return bundle;
}

function resolveVerifiedC3Bundle(
  bundle: VerifiedC3FrozenInputBundle,
): VerifiedC3BundleData {
  const candidate = bundle as unknown;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('C3_UNVERIFIED_INPUT_BUNDLE');
  }
  const data = verifiedC3Bundles.get(candidate);
  if (data === undefined) throw new Error('C3_UNVERIFIED_INPUT_BUNDLE');
  return data;
}

function bindVerifiedC3Output<T extends object>(
  bundle: VerifiedC3FrozenInputBundle,
  output: T,
): T {
  verifiedC3OutputBundles.set(output, bundle);
  return output;
}

export function createC3ExplorationSummary(
  bundle: VerifiedC3FrozenInputBundle,
): C3ExplorationSummary {
  const { contract, input, observations } = resolveVerifiedC3Bundle(bundle);
  const scopes = scopeIndex(contract);
  const byVariable = new Map<string, NormalizedObservation[]>();
  for (const observation of observations) {
    const values = byVariable.get(observation.variableId) ?? [];
    values.push(observation);
    byVariable.set(observation.variableId, values);
  }
  const summaries = [...byVariable.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([variableId, values]) => {
      const scope = scopes.get(variableId);
      if (scope === undefined) {
        throw new Error(`C3_UNSCOPED_VARIABLE:${variableId}`);
      }
      return summarizeVariable(variableId, values, scope);
    });
  if (summaries.length !== scopes.size) {
    const missing = [...scopes.keys()].filter(
      (variableId) => !byVariable.has(variableId),
    );
    throw new Error(`C3_MISSING_SCOPED_VARIABLES:${missing.join(',')}`);
  }
  return bindVerifiedC3Output(
    bundle,
    finalize({
      schemaVersion: 'c3-exploration-summary.v1' as const,
      analysisId: contract.analysisId,
      status: contract.status,
      input,
      transformation: contract.transformation,
      qualityTreatment: contract.qualityTreatment,
      variableSummaries: summaries,
    }),
  );
}

function diagnosticCount(
  evidence: C3UncertaintyEvidence,
  code: string,
): number {
  return (
    evidence.diagnosticCounts.find((entry) => entry.code === code)?.count ?? 0
  );
}

function providerRun(
  evidence: C3UncertaintyEvidence,
  sourceId: string,
): C3ProviderRun | undefined {
  return evidence.providerRuns.find((entry) => entry.sourceId === sourceId);
}

export function createC3UncertaintyRegister(
  bundle: VerifiedC3FrozenInputBundle,
): C3UncertaintyRegister {
  const { contract, input, evidence } = resolveVerifiedC3Bundle(bundle);
  const wto = providerRun(evidence, 'WTO_TIMESERIES_V1');
  if (
    wto?.status !== 'NOT_FETCHED' ||
    !wto.issues.includes('WTO_API_KEY_MISSING')
  ) {
    throw new Error('C3_WTO_PARTIAL_PILOT_TRUTH_NOT_PRESERVED');
  }
  const entries: readonly C3UncertaintyEntry[] = [
    {
      uncertaintyId: 'C2_EXPLICIT_MISSING_OBSERVATIONS',
      category: 'MISSINGNESS',
      evidenceCount: diagnosticCount(evidence, 'MISSING_OBSERVATION'),
      evidence: ['C2 quality diagnostics: MISSING_OBSERVATION'],
      treatment: contract.qualityTreatment['missingness']!,
      blocks: ['MISSING_VALUE_IMPUTATION', 'COMPLETE_CASE_ARCHETYPE_SELECTION'],
    },
    {
      uncertaintyId: 'C2_EXACT_DUPLICATE_SOURCE_FACT',
      category: 'DUPLICATION',
      evidenceCount: diagnosticCount(evidence, 'DUPLICATE_OBSERVATION'),
      evidence: ['C2 quality diagnostics: DUPLICATE_OBSERVATION'],
      treatment: contract.qualityTreatment['duplicateObservationIds']!,
      blocks: ['SILENT_DEDUPLICATION', 'DUPLICATE_WEIGHTING'],
    },
    {
      uncertaintyId: 'C2_REPORTING_ASYMMETRY',
      category: 'MIRROR_ASYMMETRY',
      evidenceCount: diagnosticCount(evidence, 'REPORTING_ASYMMETRY'),
      evidence: ['C2 quality diagnostics: REPORTING_ASYMMETRY'],
      treatment: contract.qualityTreatment['reportingAsymmetry']!,
      blocks: ['MIRROR_AVERAGING', 'IPF_RAS', 'FINAL_TRADE_MATRIX'],
    },
    {
      uncertaintyId: 'C2_WTO_PROVIDER_COVERAGE_GAP',
      category: 'PROVIDER_COVERAGE',
      evidenceCount: null,
      evidence: [
        'C2 provider run: WTO_TIMESERIES_V1 NOT_FETCHED',
        'C2 provider issue: WTO_API_KEY_MISSING',
      ],
      treatment:
        'RETAIN_WTO_API_KEY_MISSING_DO_NOT_BACKFILL_OR_SYNTHESIZE_TARIFF_OBSERVATIONS',
      blocks: ['TARIFF_BACKFILL', 'POLICY_EFFECT_CALIBRATION'],
    },
    {
      uncertaintyId: 'C2_PROVIDER_VINTAGE_LIMIT',
      category: 'VINTAGE',
      evidenceCount: null,
      evidence: evidence.revisionVintageObservations,
      treatment: contract.qualityTreatment['revisionCaveat']!,
      blocks: ['VINTAGE_STABILITY_CLAIM', 'REVISION_INSENSITIVE_FREEZE'],
    },
    {
      uncertaintyId: 'C2_WDI_UNIT_METADATA_LIMIT',
      category: 'UNIT_METADATA',
      evidenceCount: null,
      evidence: [
        evidence.providerSpecificCaveats['WB_WDI_V2'] ??
          'No WDI caveat was supplied.',
      ],
      treatment: contract.qualityTreatment['unitCaveat']!,
      blocks: ['UNSUPPORTED_UNIT_CONVERSION'],
    },
    {
      uncertaintyId: 'C3_INFERENCE_SCOPE_LIMIT',
      category: 'INFERENCE_SCOPE',
      evidenceCount: null,
      evidence: [contract.statisticalScope.reason],
      treatment: 'DESCRIPTIVE_ORDER_STATISTICS_AND_EXACT_RATIONAL_MEANS_ONLY',
      blocks: contract.statisticalScope.prohibited,
    },
  ];
  return bindVerifiedC3Output(
    bundle,
    finalize({
      schemaVersion: 'c3-uncertainty-register.v1' as const,
      analysisId: contract.analysisId,
      status: contract.status,
      input,
      entries,
    }),
  );
}

type C3OutputArtifact = Readonly<{
  schemaVersion: string;
  analysisId: string;
  status: ExplorationStatus;
  input: C3InputBinding;
  contentHash: string;
}>;

function validateOutputArtifactForManifest(
  bundle: VerifiedC3FrozenInputBundle,
  contract: C3ExplorationContract,
  input: C3InputBinding,
  artifact: C3OutputArtifact,
  schemaVersion: C3OutputArtifact['schemaVersion'],
): void {
  const candidate = artifact as unknown;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    verifiedC3OutputBundles.get(candidate) !== bundle
  ) {
    throw new Error(`C3_UNVERIFIED_OUTPUT_ARTIFACT:${schemaVersion}`);
  }
  if (artifact.schemaVersion !== schemaVersion) {
    throw new Error(`C3_OUTPUT_SCHEMA_VERSION_MISMATCH:${schemaVersion}`);
  }
  if (
    artifact.analysisId !== contract.analysisId ||
    artifact.status !== contract.status
  ) {
    throw new Error(`C3_OUTPUT_IDENTITY_MISMATCH:${schemaVersion}`);
  }
  if (canonicalJson(artifact.input) !== canonicalJson(input)) {
    throw new Error(`C3_OUTPUT_INPUT_MISMATCH:${schemaVersion}`);
  }
  const { contentHash, ...unhashedArtifact } = artifact;
  if (contentHash !== sha256Canonical(unhashedArtifact)) {
    throw new Error(`C3_OUTPUT_CONTENT_HASH_MISMATCH:${schemaVersion}`);
  }
}

export function createC3ExplorationManifest(
  bundle: VerifiedC3FrozenInputBundle,
  summary: C3ExplorationSummary,
  uncertainty: C3UncertaintyRegister,
): C3ExplorationManifest {
  const { contract, input } = resolveVerifiedC3Bundle(bundle);
  validateOutputArtifactForManifest(
    bundle,
    contract,
    input,
    summary,
    'c3-exploration-summary.v1',
  );
  validateOutputArtifactForManifest(
    bundle,
    contract,
    input,
    uncertainty,
    'c3-uncertainty-register.v1',
  );
  return bindVerifiedC3Output(
    bundle,
    finalize({
      schemaVersion: 'c3-exploration-manifest.v1' as const,
      analysisId: contract.analysisId,
      status: contract.status,
      input,
      artifacts: [
        {
          path: 'data/calibration/exploration/c3_exploration_summary.v1.json',
          schemaVersion: summary.schemaVersion,
          canonicalContentHash: summary.contentHash,
        },
        {
          path: 'data/calibration/exploration/c3_uncertainty_register.v1.json',
          schemaVersion: uncertainty.schemaVersion,
          canonicalContentHash: uncertainty.contentHash,
        },
      ],
    }),
  );
}
