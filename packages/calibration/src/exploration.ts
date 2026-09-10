import { canonicalJson, sha256Canonical } from './canonical.js';
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

function finalize<T extends Record<string, unknown>>(
  value: T,
): T & {
  readonly contentHash: string;
} {
  return Object.freeze({
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

function validateC3Input(
  contract: C3ExplorationContract,
  input: C3InputBinding,
): void {
  if (input.c2ReviewTargetCommit !== contract.c2ReviewTarget.commit) {
    throw new Error('C3_INPUT_COMMIT_MISMATCH');
  }
  if (input.contractCanonicalHash !== contractCanonicalHash(contract)) {
    throw new Error('C3_INPUT_CONTRACT_HASH_MISMATCH');
  }
  validateC3InputBinding(contract, input.artifacts);
}

function canonicalInput(
  contract: C3ExplorationContract,
  input: C3InputBinding,
): C3InputBinding {
  validateC3Input(contract, input);
  return Object.freeze({
    c2ReviewTargetCommit: input.c2ReviewTargetCommit,
    contractCanonicalHash: input.contractCanonicalHash,
    artifacts: Object.freeze(
      [...input.artifacts].sort((left, right) =>
        compareText(left.path, right.path),
      ),
    ),
  });
}

export function createC3ExplorationSummary(
  contract: C3ExplorationContract,
  input: C3InputBinding,
  observations: readonly NormalizedObservation[],
): C3ExplorationSummary {
  const normalizedInput = canonicalInput(contract, input);
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
  return finalize({
    schemaVersion: 'c3-exploration-summary.v1' as const,
    analysisId: contract.analysisId,
    status: contract.status,
    input: normalizedInput,
    transformation: contract.transformation,
    qualityTreatment: contract.qualityTreatment,
    variableSummaries: summaries,
  });
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
  contract: C3ExplorationContract,
  input: C3InputBinding,
  evidence: C3UncertaintyEvidence,
): C3UncertaintyRegister {
  const normalizedInput = canonicalInput(contract, input);
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
  return finalize({
    schemaVersion: 'c3-uncertainty-register.v1' as const,
    analysisId: contract.analysisId,
    status: contract.status,
    input: normalizedInput,
    entries,
  });
}

type C3OutputArtifact = Readonly<{
  schemaVersion: string;
  analysisId: string;
  status: ExplorationStatus;
  input: C3InputBinding;
  contentHash: string;
}>;

function validateOutputArtifactForManifest(
  contract: C3ExplorationContract,
  input: C3InputBinding,
  artifact: C3OutputArtifact,
  schemaVersion: C3OutputArtifact['schemaVersion'],
): void {
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
  contract: C3ExplorationContract,
  input: C3InputBinding,
  summary: C3ExplorationSummary,
  uncertainty: C3UncertaintyRegister,
): C3ExplorationManifest {
  const normalizedInput = canonicalInput(contract, input);
  validateOutputArtifactForManifest(
    contract,
    normalizedInput,
    summary,
    'c3-exploration-summary.v1',
  );
  validateOutputArtifactForManifest(
    contract,
    normalizedInput,
    uncertainty,
    'c3-uncertainty-register.v1',
  );
  return finalize({
    schemaVersion: 'c3-exploration-manifest.v1' as const,
    analysisId: contract.analysisId,
    status: contract.status,
    input: normalizedInput,
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
  });
}
