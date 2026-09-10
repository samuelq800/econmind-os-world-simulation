import { sha256Bytes, sha256Canonical } from './canonical.js';
import {
  C3_EXPLORATION_CONTRACT_CANONICAL_HASH,
  contractCanonicalHash,
  type C3ExplorationContract,
  type C3ExplorationSummary,
  type C3UncertaintyRegister,
} from './exploration.js';

export const C4_GENERATION_PREFLIGHT_CANONICAL_HASH =
  '323bf1d117d0511cb40891a02a161e052682e9aa8938f33ddbad6ce732fc5843';

export interface C4GenerationPreflight {
  readonly schemaVersion: 'c4-generation-preflight.v1';
  readonly preflightId: string;
  readonly status: 'PREFLIGHT_ONLY_NON_AUTHORITATIVE';
  readonly finalGeneratorReady: false;
  readonly c3Review: {
    readonly approvedTargetCommit: string;
    readonly historicalChangesRequiredTargetCommit: string;
    readonly decision: 'APPROVED_FOR_CONTINUATION';
    readonly closedFindingIds: readonly string[];
    readonly openBlockerCount: 0;
    readonly openMajorCount: 0;
    readonly scope: 'EXPLORATORY_NON_AUTHORITATIVE_ONLY';
  };
  readonly c3ExecutionContract: {
    readonly path: string;
    readonly rawSha256: string;
    readonly canonicalHash: string;
  };
  readonly c3GeneratedArtifacts: readonly C4GeneratedArtifactBinding[];
  readonly evidenceScope: {
    readonly c2InputStatus: 'PILOT_NON_AUTHORITATIVE_PARTIAL';
    readonly empiricalEntityCount: number;
    readonly macroVariableCount: number;
    readonly macroPeriodCount: number;
    readonly sparseTradeVariableCount: number;
    readonly wtoProviderTruth: string;
  };
  readonly allowedPreparation: readonly string[];
  readonly prohibitedOutputs: readonly string[];
  readonly unmetPrerequisites: readonly C4UnmetPrerequisite[];
  readonly contentHash: string;
}

export interface C4GeneratedArtifactBinding {
  readonly path: string;
  readonly rawSha256: string;
  readonly schemaVersion: string;
  readonly canonicalContentHash: string;
}

export interface C4UnmetPrerequisite {
  readonly prerequisiteId: string;
  readonly evidenceId: string;
  readonly effect: string;
}

export interface C4GenerationPreflightBytes {
  readonly preflight: Uint8Array;
  readonly c3ExecutionContract: Uint8Array;
  readonly c3Summary: Uint8Array;
  readonly c3UncertaintyRegister: Uint8Array;
  readonly c3Manifest: Uint8Array;
}

interface C3OutputArtifact {
  readonly schemaVersion: string;
  readonly status: string;
  readonly input: {
    readonly contractCanonicalHash: string;
  };
  readonly contentHash: string;
}

interface C3Manifest extends C3OutputArtifact {
  readonly artifacts: readonly {
    readonly path: string;
    readonly schemaVersion: string;
    readonly canonicalContentHash: string;
  }[];
}

const C3_EXECUTION_CONTRACT_PATH =
  'data/calibration/exploration/c3_execution_contract.v1.json';
const C3_SUMMARY_PATH =
  'data/calibration/exploration/c3_exploration_summary.v1.json';
const C3_UNCERTAINTY_PATH =
  'data/calibration/exploration/c3_uncertainty_register.v1.json';
const C3_MANIFEST_PATH =
  'data/calibration/exploration/c3_exploration_manifest.v1.json';

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), seen);
  }
  return Object.freeze(value) as T;
}

function snapshotBoundBytes(
  bytes: Uint8Array,
  artifactPath: string,
): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`C4_BOUND_INPUT_BYTES_REQUIRED:${artifactPath}`);
  }
  return new Uint8Array(bytes);
}

function snapshotPreflightInputs(
  bytes: C4GenerationPreflightBytes,
): C4GenerationPreflightBytes {
  return {
    preflight: snapshotBoundBytes(
      bytes.preflight,
      'data/calibration/preflight/c4_generation_preflight.v1.json',
    ),
    c3ExecutionContract: snapshotBoundBytes(
      bytes.c3ExecutionContract,
      C3_EXECUTION_CONTRACT_PATH,
    ),
    c3Summary: snapshotBoundBytes(bytes.c3Summary, C3_SUMMARY_PATH),
    c3UncertaintyRegister: snapshotBoundBytes(
      bytes.c3UncertaintyRegister,
      C3_UNCERTAINTY_PATH,
    ),
    c3Manifest: snapshotBoundBytes(bytes.c3Manifest, C3_MANIFEST_PATH),
  };
}

function parseBoundJson<T>(bytes: Uint8Array, artifactPath: string): T {
  try {
    return JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    throw new Error(`C4_BOUND_INPUT_JSON_PARSE_FAILED:${artifactPath}`);
  }
}

function assertContentHash(
  artifact: C3OutputArtifact,
  artifactPath: string,
): void {
  const { contentHash, ...body } = artifact;
  if (contentHash !== sha256Canonical(body)) {
    throw new Error(`C4_C3_CONTENT_HASH_MISMATCH:${artifactPath}`);
  }
}

function assertRawHash(
  bytes: Uint8Array,
  expectedHash: string,
  artifactPath: string,
): void {
  if (sha256Bytes(bytes) !== expectedHash) {
    throw new Error(`C4_C3_RAW_HASH_MISMATCH:${artifactPath}`);
  }
}

function artifactBinding(
  preflight: C4GenerationPreflight,
  artifactPath: string,
): C4GeneratedArtifactBinding {
  const matches = preflight.c3GeneratedArtifacts.filter(
    ({ path }) => path === artifactPath,
  );
  if (matches.length !== 1) {
    throw new Error(`C4_C3_ARTIFACT_BINDING_MISMATCH:${artifactPath}`);
  }
  return matches[0]!;
}

function assertOutputArtifact(
  preflight: C4GenerationPreflight,
  artifactPath: string,
  artifact: C3OutputArtifact,
): void {
  const binding = artifactBinding(preflight, artifactPath);
  if (
    artifact.schemaVersion !== binding.schemaVersion ||
    artifact.contentHash !== binding.canonicalContentHash ||
    artifact.status !== 'EXPLORATORY_NON_AUTHORITATIVE' ||
    artifact.input.contractCanonicalHash !==
      C3_EXPLORATION_CONTRACT_CANONICAL_HASH
  ) {
    throw new Error(`C4_C3_ARTIFACT_IDENTITY_MISMATCH:${artifactPath}`);
  }
  assertContentHash(artifact, artifactPath);
}

function assertManifestBindings(
  manifest: C3Manifest,
  summary: C3OutputArtifact,
  uncertainty: C3OutputArtifact,
): void {
  const expected = [
    {
      path: C3_SUMMARY_PATH,
      schemaVersion: summary.schemaVersion,
      canonicalContentHash: summary.contentHash,
    },
    {
      path: C3_UNCERTAINTY_PATH,
      schemaVersion: uncertainty.schemaVersion,
      canonicalContentHash: uncertainty.contentHash,
    },
  ];
  if (JSON.stringify(manifest.artifacts) !== JSON.stringify(expected)) {
    throw new Error('C4_C3_MANIFEST_BINDING_MISMATCH');
  }
}

function assertEvidenceScope(
  preflight: C4GenerationPreflight,
  contract: C3ExplorationContract,
  summary: C3ExplorationSummary,
): void {
  const macro = contract.coverageScopes.find(
    ({ scopeId }) => scopeId === 'WDI_GRID_10_ENTITIES_3_PERIODS',
  );
  const trade = contract.coverageScopes.find(
    ({ scopeId }) => scopeId === 'COMTRADE_SPARSE_REQUESTED_SLICE',
  );
  if (
    macro === undefined ||
    trade === undefined ||
    preflight.evidenceScope.c2InputStatus !==
      contract.c2ReviewTarget.normalizedObservationStatus ||
    preflight.evidenceScope.empiricalEntityCount !==
      macro.expectedEntityIds?.length ||
    preflight.evidenceScope.macroVariableCount !== macro.variableIds.length ||
    preflight.evidenceScope.macroPeriodCount !==
      macro.expectedPeriods?.length ||
    preflight.evidenceScope.sparseTradeVariableCount !==
      trade.variableIds.length ||
    preflight.evidenceScope.wtoProviderTruth !==
      contract.c2ReviewTarget.requiredProviderTruth['WTO_TIMESERIES_V1'] ||
    summary.variableSummaries.length !==
      macro.variableIds.length + trade.variableIds.length
  ) {
    throw new Error('C4_EVIDENCE_SCOPE_MISMATCH');
  }
}

function assertUnmetPrerequisiteEvidence(
  preflight: C4GenerationPreflight,
  uncertainty: C3UncertaintyRegister,
): void {
  const evidenceIds = new Set(
    uncertainty.entries.map(({ uncertaintyId }) => uncertaintyId),
  );
  for (const { prerequisiteId, evidenceId } of preflight.unmetPrerequisites) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(
        `C4_UNMET_PREREQUISITE_EVIDENCE_MISSING:${prerequisiteId}`,
      );
    }
  }
}

function assertPreflightBoundary(preflight: C4GenerationPreflight): void {
  if (
    preflight.schemaVersion !== 'c4-generation-preflight.v1' ||
    preflight.status !== 'PREFLIGHT_ONLY_NON_AUTHORITATIVE' ||
    preflight.finalGeneratorReady !== false
  ) {
    throw new Error('C4_PREFLIGHT_BOUNDARY_MISMATCH');
  }
  if (
    preflight.c3Review.approvedTargetCommit !==
      '77c4fb3083970573ed56cbd280e0e41a8d83e43a' ||
    preflight.c3Review.historicalChangesRequiredTargetCommit !==
      '21c571cd215b89bff20804bf2e38db687b44e55e' ||
    preflight.c3Review.decision !== 'APPROVED_FOR_CONTINUATION' ||
    preflight.c3Review.openBlockerCount !== 0 ||
    preflight.c3Review.openMajorCount !== 0 ||
    preflight.c3Review.scope !== 'EXPLORATORY_NON_AUTHORITATIVE_ONLY' ||
    !preflight.c3Review.closedFindingIds.includes('C3-MAJ-01')
  ) {
    throw new Error('C4_C3_REVIEW_DECISION_MISMATCH');
  }
  const prohibited = new Set(preflight.prohibitedOutputs);
  for (const required of [
    'ARCHETYPE_ALGORITHM_OR_COUNT_SELECTION',
    'FICTIONAL_COUNTRY_MAPPING',
    'FINAL_70_COUNTRY_PACKAGE',
    'IPF_RAS_OR_TRADE_RECONCILIATION',
    'FINAL_CALIBRATION_OR_RUNTIME_PARAMETERIZATION',
    'WORLD_CORE_RUNTIME_IMPORT_OR_MUTATION',
    'PRODUCTION_DATABASE_OPERATION',
  ]) {
    if (!prohibited.has(required)) {
      throw new Error(`C4_PREFLIGHT_PROHIBITION_MISSING:${required}`);
    }
  }
}

export function verifyC4GenerationPreflight(
  bytes: C4GenerationPreflightBytes,
): C4GenerationPreflight {
  const frozenBytes = snapshotPreflightInputs(bytes);
  const preflight = parseBoundJson<C4GenerationPreflight>(
    frozenBytes.preflight,
    'data/calibration/preflight/c4_generation_preflight.v1.json',
  );
  const { contentHash, ...preflightBody } = preflight;
  if (contentHash !== sha256Canonical(preflightBody)) {
    throw new Error('C4_PREFLIGHT_CONTENT_HASH_MISMATCH');
  }
  if (contentHash !== C4_GENERATION_PREFLIGHT_CANONICAL_HASH) {
    throw new Error('C4_PREFLIGHT_CONTRACT_HASH_MISMATCH');
  }
  assertPreflightBoundary(preflight);

  assertRawHash(
    frozenBytes.c3ExecutionContract,
    preflight.c3ExecutionContract.rawSha256,
    C3_EXECUTION_CONTRACT_PATH,
  );
  assertRawHash(
    frozenBytes.c3Summary,
    artifactBinding(preflight, C3_SUMMARY_PATH).rawSha256,
    C3_SUMMARY_PATH,
  );
  assertRawHash(
    frozenBytes.c3UncertaintyRegister,
    artifactBinding(preflight, C3_UNCERTAINTY_PATH).rawSha256,
    C3_UNCERTAINTY_PATH,
  );
  assertRawHash(
    frozenBytes.c3Manifest,
    artifactBinding(preflight, C3_MANIFEST_PATH).rawSha256,
    C3_MANIFEST_PATH,
  );

  const contract = parseBoundJson<C3ExplorationContract>(
    frozenBytes.c3ExecutionContract,
    C3_EXECUTION_CONTRACT_PATH,
  );
  if (
    contract.schemaVersion !== 'c3-exploration-execution-contract.v1' ||
    contract.status !== 'EXPLORATORY_NON_AUTHORITATIVE' ||
    contractCanonicalHash(contract) !==
      C3_EXPLORATION_CONTRACT_CANONICAL_HASH ||
    preflight.c3ExecutionContract.canonicalHash !==
      C3_EXPLORATION_CONTRACT_CANONICAL_HASH
  ) {
    throw new Error('C4_C3_EXECUTION_CONTRACT_MISMATCH');
  }

  const summary = parseBoundJson<C3ExplorationSummary>(
    frozenBytes.c3Summary,
    C3_SUMMARY_PATH,
  );
  const uncertainty = parseBoundJson<C3UncertaintyRegister>(
    frozenBytes.c3UncertaintyRegister,
    C3_UNCERTAINTY_PATH,
  );
  const manifest = parseBoundJson<C3Manifest>(
    frozenBytes.c3Manifest,
    C3_MANIFEST_PATH,
  );
  assertOutputArtifact(preflight, C3_SUMMARY_PATH, summary);
  assertOutputArtifact(preflight, C3_UNCERTAINTY_PATH, uncertainty);
  assertOutputArtifact(preflight, C3_MANIFEST_PATH, manifest);
  assertManifestBindings(manifest, summary, uncertainty);
  assertEvidenceScope(preflight, contract, summary);
  assertUnmetPrerequisiteEvidence(preflight, uncertainty);

  return deepFreeze(preflight);
}
