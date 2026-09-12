import { canonicalJson, sha256Bytes, sha256Canonical } from './canonical.js';

export const V10_DATA_HANDOFF_READINESS_CONTRACT_CANONICAL_HASH =
  '95a1746400cf228186350c0ac8319d2cbef04d3ba4c22c6bab729db967d0ddf2';

export type V10ClosureEvidenceKind =
  'OWNER_DECISION' | 'NEW_SOURCE_OR_CREDENTIAL' | 'GOVERNANCE_AUTHORIZATION';

export interface V10DataHandoffPolicyInputBytes {
  readonly policyContract: Uint8Array;
  readonly diagnosticsExecutionContract: Uint8Array;
  readonly diagnosticsPack: Uint8Array;
}

export interface V10ClosureEvidenceInput {
  readonly document: Uint8Array;
  readonly artifacts: readonly {
    readonly path: string;
    readonly bytes: Uint8Array;
  }[];
}

export interface VerifiedV10DataHandoffPolicyBundle {
  readonly kind: 'VERIFIED_V10_DATA_HANDOFF_POLICY_BUNDLE';
}

interface ArtifactBinding {
  readonly path: string;
  readonly rawSha256: string;
  readonly canonicalHash?: string;
}

interface Requirement {
  readonly requirementId: string;
  readonly description: string;
}

interface PolicyGate {
  readonly gateId: string;
  readonly satisfiedComputableEvidenceIds: readonly string[];
  readonly requiredOwnerDecision: Requirement | null;
  readonly requiredNewSourceOrCredential: Requirement | null;
  readonly requiredGovernanceAuthorization: Requirement | null;
  readonly dependsOnGateIds: readonly string[];
  readonly allowedNextAction: string;
  readonly prohibitedAuthorityInterpretation: string;
}

interface V10DataHandoffReadinessContract {
  readonly schemaVersion: 'v10-data-handoff-readiness-contract.v1';
  readonly contractVersion: '1.0.0';
  readonly contractId: string;
  readonly status: 'PREPARATION_ONLY_NON_AUTHORITATIVE';
  readonly baseline: {
    readonly diagnosticsTargetCommit: string;
    readonly diagnosticsContentHash: string;
    readonly v10StatusMustRemain: 'PLANNED';
    readonly finalGeneratorReady: false;
  };
  readonly inputArtifacts: readonly ArtifactBinding[];
  readonly closureEvidenceEnvelope: {
    readonly schemaVersion: 'v10-gate-closure-evidence.v1';
    readonly requiredDecision: 'APPROVED';
    readonly requiredArtifactBindingCountMinimum: 1;
    readonly selfCreatedImplementationReportIsAuthority: false;
    readonly independentReviewRequired: true;
  };
  readonly gates: readonly PolicyGate[];
  readonly hardBoundaries: readonly string[];
}

interface DiagnosticsPack {
  readonly schemaVersion: string;
  readonly status: string;
  readonly finalGeneratorReady: boolean;
  readonly baseline: {
    readonly approvedState: string;
    readonly finalGeneratorReady: boolean;
  };
  readonly missingness: {
    readonly strategySelected: boolean;
    readonly valuesImputed: boolean;
    readonly strategyCandidates: readonly unknown[];
    readonly variableApplicability: readonly unknown[];
    readonly commonGridDiagnostic: {
      readonly expectedCellCount: number;
      readonly completeCellCount: number;
    };
  };
  readonly vintageStability: {
    readonly comparableSnapshotPairCount: number;
    readonly stabilityClaimsSupported: boolean;
  };
  readonly sectorDiagnostics: {
    readonly computedPartialSumCellCount: number;
    readonly totalReconciliationStatus: string;
  };
  readonly bilateralTradeDiagnostics: {
    readonly distinctMirrorPairCount: number;
    readonly reconciliationStatus: string;
  };
  readonly readinessGapDisposition: readonly {
    readonly prerequisiteId: string;
    readonly gateStatus: string;
  }[];
  readonly contentHash: string;
}

export interface V10GateClosureEvidence {
  readonly schemaVersion: 'v10-gate-closure-evidence.v1';
  readonly evidenceId: string;
  readonly gateId: string;
  readonly requirementId: string;
  readonly evidenceKind: V10ClosureEvidenceKind;
  readonly status: 'CLOSURE_EVIDENCE_CANDIDATE';
  readonly decision: 'APPROVED';
  readonly authority: {
    readonly reviewerId: string;
    readonly reviewerRole:
      'OWNER' | 'INDEPENDENT_REVIEWER' | 'GOVERNANCE_REVIEWER';
    readonly independentReview: true;
    readonly selfCreatedImplementationReport: false;
    readonly reviewedTargetCommit: string;
    readonly evidenceCommit: string;
  };
  readonly artifactBindings: readonly {
    readonly path: string;
    readonly rawSha256: string;
  }[];
  readonly sourceEvidence: {
    readonly credentialStoredInRepository: false;
    readonly sourceSnapshotIds: readonly string[];
  };
  readonly contentHash: string;
}

export interface V10DataHandoffReadinessAssessment {
  readonly schemaVersion: 'v10-data-handoff-readiness.v1';
  readonly readinessId: string;
  readonly status: 'PREPARATION_ONLY_NON_AUTHORITATIVE';
  readonly input: {
    readonly policyContractCanonicalHash: string;
    readonly artifacts: readonly ArtifactBinding[];
  };
  readonly closureEvidenceBindings: readonly {
    readonly evidenceId: string;
    readonly rawSha256: string;
  }[];
  readonly gates: readonly {
    readonly gateId: string;
    readonly satisfiedComputableEvidenceIds: readonly string[];
    readonly requiredEvidenceIds: readonly string[];
    readonly satisfiedClosureEvidenceIds: readonly string[];
    readonly pendingClosureEvidenceIds: readonly string[];
    readonly dependsOnGateIds: readonly string[];
    readonly computedStatus: 'OPEN' | 'CLOSED';
    readonly allowedNextAction: string;
    readonly prohibitedAuthorityInterpretation: string;
  }[];
  readonly summary: {
    readonly closedGateCount: number;
    readonly openGateCount: number;
    readonly openGateIds: readonly string[];
    readonly dataHandoffCandidateReady: boolean;
    readonly runtimeCountrySeedExportAuthorized: false;
    readonly v10Status: 'PLANNED';
  };
  readonly v10_1Interface: {
    readonly status: 'INTERFACE_ONLY_NOT_EXECUTED';
    readonly calibrationGateDependency: false;
    readonly usesCalibrationCountryValues: false;
    readonly twoCountryFixtureInstancePresent: false;
    readonly countryValuesPresent: false;
    readonly runtimeProjectionImplemented: false;
  };
  readonly hardBoundaries: readonly string[];
  readonly contentHash: string;
}

export interface VerifiedV10DataHandoffReadinessAssessment {
  readonly kind: 'VERIFIED_V10_DATA_HANDOFF_READINESS_ASSESSMENT';
}

export interface V10DataHandoffCandidateAdmission {
  readonly kind: 'V10_DATA_HANDOFF_CANDIDATE_ADMISSION';
  readonly readinessContentHash: string;
  readonly runtimeAuthority: false;
}

export interface V101TestTwoCountryFixtureDescriptor {
  readonly schemaVersion: 'v10.1-test-two-country-fixture.v1';
  readonly fixtureId: string;
  readonly status: 'TEST_ONLY_NON_AUTHORITATIVE';
  readonly countryCount: 2;
  readonly calibrationReadinessRequired: false;
  readonly usesCalibrationCountryValues: false;
  readonly runtimeAuthority: false;
  readonly finalCountryData: false;
  readonly projectionImplementationPresent: false;
  readonly countries: readonly [
    {
      readonly testCountryId: string;
      readonly dataClass: 'PLACEHOLDER';
      readonly featureValues: readonly [];
    },
    {
      readonly testCountryId: string;
      readonly dataClass: 'PLACEHOLDER';
      readonly featureValues: readonly [];
    },
  ];
  readonly contentHash: string;
}

const PATHS = Object.freeze({
  diagnosticsExecutionContract:
    'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
  diagnosticsPack: 'data/calibration/preflight/c4_gate_diagnostics.v1.json',
});

interface VerifiedPolicyData {
  readonly contract: V10DataHandoffReadinessContract;
  readonly artifacts: readonly ArtifactBinding[];
}

interface VerifiedAssessmentData {
  readonly assessment: V10DataHandoffReadinessAssessment;
}

const verifiedPolicies = new WeakMap<object, VerifiedPolicyData>();
const verifiedAssessments = new WeakMap<object, VerifiedAssessmentData>();

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
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
    throw new TypeError(`V10_READINESS_BOUND_BYTES_REQUIRED:${artifactPath}`);
  }
  return new Uint8Array(bytes);
}

function parseBoundJson<T>(bytes: Uint8Array, artifactPath: string): T {
  try {
    return JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    throw new Error(`V10_READINESS_JSON_PARSE_FAILED:${artifactPath}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  return (
    Object.keys(value).sort(compareText).join('\u0000') ===
    [...expectedKeys].sort(compareText).join('\u0000')
  );
}

function finalize<T extends Record<string, unknown>>(
  body: T,
): T & { readonly contentHash: string } {
  return deepFreeze({ ...body, contentHash: sha256Canonical(body) });
}

function validatePolicyBoundary(
  contract: V10DataHandoffReadinessContract,
): void {
  if (
    contract.schemaVersion !== 'v10-data-handoff-readiness-contract.v1' ||
    contract.contractVersion !== '1.0.0' ||
    contract.status !== 'PREPARATION_ONLY_NON_AUTHORITATIVE' ||
    contract.baseline.diagnosticsTargetCommit !==
      '9d9edbd8095017768971f92762ea3d9d2af35179' ||
    contract.baseline.diagnosticsContentHash !==
      'fd0b7f00239b990b847bdca8e3629430a9f163ec49b997e546097b27b49882bc' ||
    contract.baseline.v10StatusMustRemain !== 'PLANNED' ||
    contract.baseline.finalGeneratorReady !== false ||
    contract.closureEvidenceEnvelope.schemaVersion !==
      'v10-gate-closure-evidence.v1' ||
    contract.closureEvidenceEnvelope.requiredDecision !== 'APPROVED' ||
    contract.closureEvidenceEnvelope
      .selfCreatedImplementationReportIsAuthority !== false ||
    contract.closureEvidenceEnvelope.independentReviewRequired !== true ||
    contract.gates.length !== 7
  ) {
    throw new Error('V10_READINESS_POLICY_BOUNDARY_MISMATCH');
  }
  const gateIds = contract.gates.map(({ gateId }) => gateId);
  if (new Set(gateIds).size !== gateIds.length) {
    throw new Error('V10_READINESS_DUPLICATE_GATE_ID');
  }
  const gateSet = new Set(gateIds);
  const requirementIds = new Set<string>();
  for (const gate of contract.gates) {
    for (const dependency of gate.dependsOnGateIds) {
      if (!gateSet.has(dependency) || dependency === gate.gateId) {
        throw new Error(
          `V10_READINESS_INVALID_GATE_DEPENDENCY:${gate.gateId}:${dependency}`,
        );
      }
    }
    for (const requirement of [
      gate.requiredOwnerDecision,
      gate.requiredNewSourceOrCredential,
      gate.requiredGovernanceAuthorization,
    ]) {
      if (requirement === null) continue;
      if (requirementIds.has(requirement.requirementId)) {
        throw new Error(
          `V10_READINESS_DUPLICATE_REQUIREMENT_ID:${requirement.requirementId}`,
        );
      }
      requirementIds.add(requirement.requirementId);
    }
  }
  const boundaries = new Set(contract.hardBoundaries);
  for (const required of [
    'NO_MISSINGNESS_POLICY_SELECTION_OR_VALUE_IMPUTATION',
    'NO_NEW_PROVIDER_RETRIEVAL_OR_CREDENTIAL_STORAGE',
    'NO_IPF_RAS_OR_TRADE_RECONCILIATION',
    'NO_ARCHETYPE_OR_FINAL_COUNTRY_GENERATION',
    'NO_RUNTIME_COUNTRY_SEED_EXPORT_WHILE_ANY_GATE_OPEN',
    'NO_WORLD_CORE_IMPORT_OR_MUTATION',
    'NO_V10_1_EXECUTION_OR_STATUS_CHANGE',
    'CALIBRATION_GATES_DO_NOT_GATE_V10_1_TEST_ONLY_FIXTURE',
    'NO_SUPABASE_OR_PRODUCTION_ACCESS',
    'NO_SELF_CREATED_IMPLEMENTATION_REPORT_AS_APPROVAL',
  ]) {
    if (!boundaries.has(required)) {
      throw new Error(`V10_READINESS_POLICY_BOUNDARY_MISSING:${required}`);
    }
  }
}

function verifyInputBindings(
  contract: V10DataHandoffReadinessContract,
  diagnosticsExecutionContract: Uint8Array,
  diagnosticsPack: Uint8Array,
): readonly ArtifactBinding[] {
  const bytes = new Map<string, Uint8Array>([
    [PATHS.diagnosticsExecutionContract, diagnosticsExecutionContract],
    [PATHS.diagnosticsPack, diagnosticsPack],
  ]);
  if (contract.inputArtifacts.length !== bytes.size) {
    throw new Error('V10_READINESS_INPUT_COUNT_MISMATCH');
  }
  const seen = new Set<string>();
  for (const binding of contract.inputArtifacts) {
    if (seen.has(binding.path)) {
      throw new Error(`V10_READINESS_DUPLICATE_INPUT_PATH:${binding.path}`);
    }
    seen.add(binding.path);
    const input = bytes.get(binding.path);
    if (input === undefined || sha256Bytes(input) !== binding.rawSha256) {
      throw new Error(`V10_READINESS_RAW_HASH_MISMATCH:${binding.path}`);
    }
  }
  if (seen.size !== bytes.size) {
    throw new Error('V10_READINESS_INPUT_BINDING_MISSING');
  }
  return [...contract.inputArtifacts].sort((left, right) =>
    compareText(left.path, right.path),
  );
}

function validateDiagnostics(
  contract: V10DataHandoffReadinessContract,
  diagnostics: DiagnosticsPack,
): void {
  const { contentHash, ...body } = diagnostics;
  if (
    diagnostics.schemaVersion !== 'c4-gate-diagnostics.v1' ||
    diagnostics.status !== 'DIAGNOSTICS_ONLY_NON_AUTHORITATIVE' ||
    diagnostics.finalGeneratorReady !== false ||
    diagnostics.baseline.approvedState !== 'NOT_READY_NON_AUTHORITATIVE' ||
    diagnostics.baseline.finalGeneratorReady !== false ||
    contentHash !== sha256Canonical(body) ||
    contentHash !== contract.baseline.diagnosticsContentHash ||
    diagnostics.missingness.strategySelected !== false ||
    diagnostics.missingness.valuesImputed !== false ||
    diagnostics.missingness.strategyCandidates.length !== 4 ||
    diagnostics.missingness.variableApplicability.length !== 19 ||
    diagnostics.missingness.commonGridDiagnostic.expectedCellCount !== 30 ||
    diagnostics.missingness.commonGridDiagnostic.completeCellCount !== 28 ||
    diagnostics.vintageStability.comparableSnapshotPairCount !== 0 ||
    diagnostics.vintageStability.stabilityClaimsSupported !== false ||
    diagnostics.sectorDiagnostics.computedPartialSumCellCount !== 28 ||
    diagnostics.sectorDiagnostics.totalReconciliationStatus !==
      'NOT_RUN_NON_EXHAUSTIVE_COMPONENT_SET' ||
    diagnostics.bilateralTradeDiagnostics.distinctMirrorPairCount !== 3 ||
    diagnostics.bilateralTradeDiagnostics.reconciliationStatus !==
      'NOT_RUN_NO_AVERAGING_NO_IPF_RAS'
  ) {
    throw new Error('V10_READINESS_DIAGNOSTICS_MISMATCH');
  }
  const diagnosticGateIds = diagnostics.readinessGapDisposition.map(
    ({ prerequisiteId }) => prerequisiteId,
  );
  if (
    diagnostics.readinessGapDisposition.some(
      ({ gateStatus }) => gateStatus !== 'OPEN',
    ) ||
    canonicalJson(diagnosticGateIds) !==
      canonicalJson(contract.gates.map(({ gateId }) => gateId))
  ) {
    throw new Error('V10_READINESS_DIAGNOSTIC_GATE_SET_MISMATCH');
  }
}

export function createVerifiedV10DataHandoffPolicyBundle(
  bytes: V10DataHandoffPolicyInputBytes,
): VerifiedV10DataHandoffPolicyBundle {
  const frozen = {
    policyContract: snapshotBytes(
      bytes.policyContract,
      'data/calibration/preflight/v10_data_handoff_readiness_contract.v1.json',
    ),
    diagnosticsExecutionContract: snapshotBytes(
      bytes.diagnosticsExecutionContract,
      PATHS.diagnosticsExecutionContract,
    ),
    diagnosticsPack: snapshotBytes(
      bytes.diagnosticsPack,
      PATHS.diagnosticsPack,
    ),
  };
  const contract = parseBoundJson<V10DataHandoffReadinessContract>(
    frozen.policyContract,
    'data/calibration/preflight/v10_data_handoff_readiness_contract.v1.json',
  );
  if (
    sha256Canonical(contract) !==
    V10_DATA_HANDOFF_READINESS_CONTRACT_CANONICAL_HASH
  ) {
    throw new Error('V10_READINESS_POLICY_CONTRACT_HASH_MISMATCH');
  }
  validatePolicyBoundary(contract);
  const artifacts = verifyInputBindings(
    contract,
    frozen.diagnosticsExecutionContract,
    frozen.diagnosticsPack,
  );
  const diagnostics = parseBoundJson<DiagnosticsPack>(
    frozen.diagnosticsPack,
    PATHS.diagnosticsPack,
  );
  validateDiagnostics(contract, diagnostics);
  const bundle: VerifiedV10DataHandoffPolicyBundle = Object.freeze({
    kind: 'VERIFIED_V10_DATA_HANDOFF_POLICY_BUNDLE',
  });
  verifiedPolicies.set(bundle, deepFreeze({ contract, artifacts }));
  return bundle;
}

function resolvePolicy(
  bundle: VerifiedV10DataHandoffPolicyBundle,
): VerifiedPolicyData {
  const candidate = bundle as unknown;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('V10_READINESS_UNVERIFIED_POLICY_BUNDLE');
  }
  const data = verifiedPolicies.get(candidate);
  if (data === undefined) {
    throw new Error('V10_READINESS_UNVERIFIED_POLICY_BUNDLE');
  }
  return data;
}

function requirementIndex(
  contract: V10DataHandoffReadinessContract,
): ReadonlyMap<
  string,
  { readonly gateId: string; readonly kind: V10ClosureEvidenceKind }
> {
  const output = new Map<
    string,
    { readonly gateId: string; readonly kind: V10ClosureEvidenceKind }
  >();
  for (const gate of contract.gates) {
    for (const [requirement, kind] of [
      [gate.requiredOwnerDecision, 'OWNER_DECISION'],
      [gate.requiredNewSourceOrCredential, 'NEW_SOURCE_OR_CREDENTIAL'],
      [gate.requiredGovernanceAuthorization, 'GOVERNANCE_AUTHORIZATION'],
    ] as const) {
      if (requirement !== null) {
        output.set(requirement.requirementId, { gateId: gate.gateId, kind });
      }
    }
  }
  return output;
}

function expectedReviewerRole(
  kind: V10ClosureEvidenceKind,
): V10GateClosureEvidence['authority']['reviewerRole'] {
  if (kind === 'OWNER_DECISION') return 'OWNER';
  if (kind === 'GOVERNANCE_AUTHORIZATION') return 'GOVERNANCE_REVIEWER';
  return 'INDEPENDENT_REVIEWER';
}

interface ValidatedClosureEvidence {
  readonly document: V10GateClosureEvidence;
  readonly rawSha256: string;
}

function validateClosureEvidence(
  contract: V10DataHandoffReadinessContract,
  input: V10ClosureEvidenceInput,
): ValidatedClosureEvidence {
  const documentBytes = snapshotBytes(
    input.document,
    'V10_GATE_CLOSURE_EVIDENCE_DOCUMENT',
  );
  const artifactBytes = input.artifacts.map((artifact) => ({
    path: artifact.path,
    bytes: snapshotBytes(artifact.bytes, artifact.path),
  }));
  const parsedDocument = parseBoundJson<unknown>(
    documentBytes,
    'V10_GATE_CLOSURE_EVIDENCE_DOCUMENT',
  );
  if (
    !isRecord(parsedDocument) ||
    !hasExactKeys(parsedDocument, [
      'schemaVersion',
      'evidenceId',
      'gateId',
      'requirementId',
      'evidenceKind',
      'status',
      'decision',
      'authority',
      'artifactBindings',
      'sourceEvidence',
      'contentHash',
    ]) ||
    !isRecord(parsedDocument['authority']) ||
    !hasExactKeys(parsedDocument['authority'], [
      'reviewerId',
      'reviewerRole',
      'independentReview',
      'selfCreatedImplementationReport',
      'reviewedTargetCommit',
      'evidenceCommit',
    ]) ||
    !Array.isArray(parsedDocument['artifactBindings']) ||
    parsedDocument['artifactBindings'].some(
      (binding) =>
        !isRecord(binding) ||
        !hasExactKeys(binding, ['path', 'rawSha256']) ||
        typeof binding['path'] !== 'string' ||
        binding['path'].length === 0 ||
        !/^[0-9a-f]{64}$/u.test(String(binding['rawSha256'])),
    ) ||
    !isRecord(parsedDocument['sourceEvidence']) ||
    !hasExactKeys(parsedDocument['sourceEvidence'], [
      'credentialStoredInRepository',
      'sourceSnapshotIds',
    ]) ||
    !Array.isArray(parsedDocument['sourceEvidence']['sourceSnapshotIds']) ||
    parsedDocument['sourceEvidence']['sourceSnapshotIds'].some(
      (snapshotId) => typeof snapshotId !== 'string' || snapshotId.length === 0,
    )
  ) {
    throw new Error('V10_READINESS_INVALID_CLOSURE_EVIDENCE:UNPARSED');
  }
  const document = parsedDocument as unknown as V10GateClosureEvidence;
  const { contentHash, ...body } = document;
  const requirement = requirementIndex(contract).get(document.requirementId);
  if (
    typeof document.evidenceId !== 'string' ||
    document.evidenceId.length === 0 ||
    typeof document.gateId !== 'string' ||
    document.gateId.length === 0 ||
    typeof document.requirementId !== 'string' ||
    document.requirementId.length === 0 ||
    ![
      'OWNER_DECISION',
      'NEW_SOURCE_OR_CREDENTIAL',
      'GOVERNANCE_AUTHORIZATION',
    ].includes(document.evidenceKind) ||
    typeof document.authority.reviewerId !== 'string' ||
    document.authority.reviewerId.length === 0 ||
    typeof contentHash !== 'string' ||
    document.schemaVersion !== contract.closureEvidenceEnvelope.schemaVersion ||
    document.status !== 'CLOSURE_EVIDENCE_CANDIDATE' ||
    document.decision !== contract.closureEvidenceEnvelope.requiredDecision ||
    contentHash !== sha256Canonical(body) ||
    requirement === undefined ||
    requirement.gateId !== document.gateId ||
    requirement.kind !== document.evidenceKind ||
    document.authority.reviewerRole !==
      expectedReviewerRole(document.evidenceKind) ||
    document.authority.independentReview !== true ||
    document.authority.selfCreatedImplementationReport !== false ||
    !/^[0-9a-f]{40}$/u.test(document.authority.reviewedTargetCommit) ||
    !/^[0-9a-f]{40}$/u.test(document.authority.evidenceCommit) ||
    document.authority.reviewedTargetCommit ===
      document.authority.evidenceCommit ||
    document.artifactBindings.length <
      contract.closureEvidenceEnvelope.requiredArtifactBindingCountMinimum ||
    document.sourceEvidence.credentialStoredInRepository !== false ||
    new Set(document.sourceEvidence.sourceSnapshotIds).size !==
      document.sourceEvidence.sourceSnapshotIds.length ||
    (document.evidenceKind === 'NEW_SOURCE_OR_CREDENTIAL' &&
      document.sourceEvidence.sourceSnapshotIds.length === 0)
  ) {
    throw new Error(
      `V10_READINESS_INVALID_CLOSURE_EVIDENCE:${document.evidenceId}`,
    );
  }
  const supplied = new Map<string, Uint8Array>();
  for (const artifact of artifactBytes) {
    if (supplied.has(artifact.path)) {
      throw new Error(
        `V10_READINESS_DUPLICATE_CLOSURE_ARTIFACT:${artifact.path}`,
      );
    }
    supplied.set(artifact.path, artifact.bytes);
  }
  if (supplied.size !== document.artifactBindings.length) {
    throw new Error(
      `V10_READINESS_CLOSURE_ARTIFACT_COUNT_MISMATCH:${document.evidenceId}`,
    );
  }
  const bindingPaths = new Set<string>();
  for (const binding of document.artifactBindings) {
    if (bindingPaths.has(binding.path)) {
      throw new Error(
        `V10_READINESS_DUPLICATE_CLOSURE_BINDING:${binding.path}`,
      );
    }
    bindingPaths.add(binding.path);
    const bytes = supplied.get(binding.path);
    if (bytes === undefined || sha256Bytes(bytes) !== binding.rawSha256) {
      throw new Error(
        `V10_READINESS_CLOSURE_ARTIFACT_HASH_MISMATCH:${binding.path}`,
      );
    }
  }
  return {
    document: deepFreeze(document),
    rawSha256: sha256Bytes(documentBytes),
  };
}

function requiredEvidenceIds(gate: PolicyGate): readonly string[] {
  return [
    gate.requiredOwnerDecision?.requirementId,
    gate.requiredNewSourceOrCredential?.requirementId,
    gate.requiredGovernanceAuthorization?.requirementId,
  ].flatMap((value) => (value === undefined ? [] : [value]));
}

function createAssessment(
  contract: V10DataHandoffReadinessContract,
  artifacts: readonly ArtifactBinding[],
  evidence: readonly ValidatedClosureEvidence[],
): V10DataHandoffReadinessAssessment {
  const evidenceByRequirement = new Map<string, ValidatedClosureEvidence>();
  const evidenceIds = new Set<string>();
  for (const item of evidence) {
    if (evidenceIds.has(item.document.evidenceId)) {
      throw new Error(
        `V10_READINESS_DUPLICATE_EVIDENCE_ID:${item.document.evidenceId}`,
      );
    }
    evidenceIds.add(item.document.evidenceId);
    if (evidenceByRequirement.has(item.document.requirementId)) {
      throw new Error(
        `V10_READINESS_MULTIPLE_EVIDENCE_FOR_REQUIREMENT:${item.document.requirementId}`,
      );
    }
    evidenceByRequirement.set(item.document.requirementId, item);
  }
  const statusByGate = new Map<string, 'OPEN' | 'CLOSED'>();
  const gates = contract.gates.map((gate) => {
    const required = requiredEvidenceIds(gate);
    const satisfied = required.filter((requirementId) =>
      evidenceByRequirement.has(requirementId),
    );
    const pending = required.filter(
      (requirementId) => !evidenceByRequirement.has(requirementId),
    );
    const dependenciesClosed = gate.dependsOnGateIds.every(
      (gateId) => statusByGate.get(gateId) === 'CLOSED',
    );
    const computedStatus: 'OPEN' | 'CLOSED' =
      pending.length === 0 && dependenciesClosed ? 'CLOSED' : 'OPEN';
    statusByGate.set(gate.gateId, computedStatus);
    return {
      gateId: gate.gateId,
      satisfiedComputableEvidenceIds: gate.satisfiedComputableEvidenceIds,
      requiredEvidenceIds: required,
      satisfiedClosureEvidenceIds: satisfied,
      pendingClosureEvidenceIds: pending,
      dependsOnGateIds: gate.dependsOnGateIds,
      computedStatus,
      allowedNextAction: gate.allowedNextAction,
      prohibitedAuthorityInterpretation: gate.prohibitedAuthorityInterpretation,
    };
  });
  const openGateIds = gates
    .filter(({ computedStatus }) => computedStatus === 'OPEN')
    .map(({ gateId }) => gateId);
  return finalize({
    schemaVersion: 'v10-data-handoff-readiness.v1' as const,
    readinessId: contract.contractId,
    status: contract.status,
    input: {
      policyContractCanonicalHash:
        V10_DATA_HANDOFF_READINESS_CONTRACT_CANONICAL_HASH,
      artifacts,
    },
    closureEvidenceBindings: evidence
      .map(({ document, rawSha256 }) => ({
        evidenceId: document.evidenceId,
        rawSha256,
      }))
      .sort((left, right) => compareText(left.evidenceId, right.evidenceId)),
    gates,
    summary: {
      closedGateCount: gates.length - openGateIds.length,
      openGateCount: openGateIds.length,
      openGateIds,
      dataHandoffCandidateReady: openGateIds.length === 0,
      runtimeCountrySeedExportAuthorized: false as const,
      v10Status: contract.baseline.v10StatusMustRemain,
    },
    v10_1Interface: {
      status: 'INTERFACE_ONLY_NOT_EXECUTED' as const,
      calibrationGateDependency: false as const,
      usesCalibrationCountryValues: false as const,
      twoCountryFixtureInstancePresent: false as const,
      countryValuesPresent: false as const,
      runtimeProjectionImplemented: false as const,
    },
    hardBoundaries: contract.hardBoundaries,
  });
}

export function createV10DataHandoffReadinessAssessment(
  bundle: VerifiedV10DataHandoffPolicyBundle,
  closureEvidence: readonly V10ClosureEvidenceInput[] = [],
): V10DataHandoffReadinessAssessment {
  const { contract, artifacts } = resolvePolicy(bundle);
  return createAssessment(
    contract,
    artifacts,
    closureEvidence.map((input) => validateClosureEvidence(contract, input)),
  );
}

export function verifyV10DataHandoffReadinessAssessment(
  bundle: VerifiedV10DataHandoffPolicyBundle,
  assessmentBytes: Uint8Array,
  closureEvidence: readonly V10ClosureEvidenceInput[] = [],
): VerifiedV10DataHandoffReadinessAssessment {
  const bytes = snapshotBytes(
    assessmentBytes,
    'data/calibration/preflight/v10_data_handoff_readiness.v1.json',
  );
  const committed = parseBoundJson<V10DataHandoffReadinessAssessment>(
    bytes,
    'data/calibration/preflight/v10_data_handoff_readiness.v1.json',
  );
  const expected = createV10DataHandoffReadinessAssessment(
    bundle,
    closureEvidence,
  );
  if (canonicalJson(committed) !== canonicalJson(expected)) {
    throw new Error('V10_READINESS_ASSESSMENT_MISMATCH');
  }
  const verified: VerifiedV10DataHandoffReadinessAssessment = Object.freeze({
    kind: 'VERIFIED_V10_DATA_HANDOFF_READINESS_ASSESSMENT',
  });
  verifiedAssessments.set(verified, { assessment: expected });
  return verified;
}

function resolveAssessment(
  verified: VerifiedV10DataHandoffReadinessAssessment,
): V10DataHandoffReadinessAssessment {
  const candidate = verified as unknown;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('V10_READINESS_UNVERIFIED_ASSESSMENT');
  }
  const data = verifiedAssessments.get(candidate);
  if (data === undefined) {
    throw new Error('V10_READINESS_UNVERIFIED_ASSESSMENT');
  }
  return data.assessment;
}

export function requireV10DataHandoffCandidateAdmission(
  verified: VerifiedV10DataHandoffReadinessAssessment,
): V10DataHandoffCandidateAdmission {
  const assessment = resolveAssessment(verified);
  if (!assessment.summary.dataHandoffCandidateReady) {
    throw new Error(
      `V10_DATA_HANDOFF_NOT_READY:${assessment.summary.openGateIds.join(',')}`,
    );
  }
  return Object.freeze({
    kind: 'V10_DATA_HANDOFF_CANDIDATE_ADMISSION',
    readinessContentHash: assessment.contentHash,
    runtimeAuthority: false,
  });
}

export function rejectV10RuntimeCountrySeedExport(): never {
  throw new Error('V10_RUNTIME_COUNTRY_SEED_EXPORT_OUT_OF_CALIBRATION_SCOPE');
}

export function validateV101TestTwoCountryFixtureDescriptor(
  value: unknown,
): V101TestTwoCountryFixtureDescriptor {
  if (!isRecord(value)) {
    throw new Error('V10_1_TEST_FIXTURE_DESCRIPTOR_REQUIRED');
  }
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'fixtureId',
      'status',
      'countryCount',
      'calibrationReadinessRequired',
      'usesCalibrationCountryValues',
      'runtimeAuthority',
      'finalCountryData',
      'projectionImplementationPresent',
      'countries',
      'contentHash',
    ]) ||
    !Array.isArray(value['countries']) ||
    value['countries'].some(
      (country) =>
        !isRecord(country) ||
        !hasExactKeys(country, ['testCountryId', 'dataClass', 'featureValues']),
    )
  ) {
    throw new Error('V10_1_TEST_FIXTURE_DESCRIPTOR_BOUNDARY_MISMATCH');
  }
  const descriptor =
    value as unknown as Partial<V101TestTwoCountryFixtureDescriptor>;
  if (
    descriptor.schemaVersion !== 'v10.1-test-two-country-fixture.v1' ||
    descriptor.status !== 'TEST_ONLY_NON_AUTHORITATIVE' ||
    descriptor.countryCount !== 2 ||
    descriptor.calibrationReadinessRequired !== false ||
    descriptor.usesCalibrationCountryValues !== false ||
    descriptor.runtimeAuthority !== false ||
    descriptor.finalCountryData !== false ||
    descriptor.projectionImplementationPresent !== false ||
    typeof descriptor.fixtureId !== 'string' ||
    descriptor.fixtureId.length === 0 ||
    !Array.isArray(descriptor.countries) ||
    descriptor.countries.length !== 2 ||
    !Array.isArray(descriptor.countries[0]?.featureValues) ||
    descriptor.countries[0].featureValues.length !== 0 ||
    !Array.isArray(descriptor.countries[1]?.featureValues) ||
    descriptor.countries[1].featureValues.length !== 0 ||
    descriptor.countries.some(
      (country) =>
        country.dataClass !== 'PLACEHOLDER' ||
        !/^test:country:[a-z][a-z0-9-]*$/u.test(country.testCountryId),
    ) ||
    new Set(descriptor.countries.map(({ testCountryId }) => testCountryId))
      .size !== 2 ||
    typeof descriptor.contentHash !== 'string'
  ) {
    throw new Error('V10_1_TEST_FIXTURE_DESCRIPTOR_BOUNDARY_MISMATCH');
  }
  const { contentHash, ...body } =
    descriptor as V101TestTwoCountryFixtureDescriptor;
  if (contentHash !== sha256Canonical(body)) {
    throw new Error('V10_1_TEST_FIXTURE_DESCRIPTOR_HASH_MISMATCH');
  }
  return deepFreeze(descriptor as V101TestTwoCountryFixtureDescriptor);
}
