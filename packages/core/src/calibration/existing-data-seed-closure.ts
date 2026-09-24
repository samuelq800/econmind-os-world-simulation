import type { Sha256Hex } from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  parseCountrySeedProvenance,
  type CountrySeedProvenancePreparation,
} from '../opening/country-seed-provenance-preparation.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  validateV27_2CalibrationPreparation,
  type CalibrationSourceEvidence,
} from './country-input-closure.js';
import {
  connectCountrySeedProvenanceToCalibration,
  type ProvenanceCalibrationAdapterResult,
} from './country-provenance-adapter.js';

export const V27_V29_EXISTING_DATA_INVENTORY_SCHEMA =
  'v27-v29-existing-data-inventory-v1' as const;
export const V27_V29_EXISTING_DATA_CLOSURE_STATUS = 'PREPARATION_ONLY' as const;

export type ExistingDataArtifactKind =
  | 'SOURCE_BYTES'
  | 'NORMALIZED_DATA'
  | 'DATA_QUALITY_EVIDENCE'
  | 'READINESS_EVIDENCE';

export interface ExistingDataArtifactEvidence {
  readonly artifactRef: string;
  readonly kind: ExistingDataArtifactKind;
  readonly locator: string;
  readonly contentSha256: string;
}

export interface ExistingDataMetricEvidence {
  readonly metricRef: string;
  readonly value: string;
  readonly unit: 'count';
  readonly evidenceArtifactRef: string;
}

export interface ExistingDataProviderGap {
  readonly sourceRef: string;
  readonly issueRef: string;
  readonly evidenceArtifactRef: string;
}

export interface ExistingDataOpenGate {
  readonly gateId: string;
  readonly requiredEvidenceRefs: readonly string[];
  readonly evidenceArtifactRef: string;
}

export interface ExistingDataInventory {
  readonly schemaVersion: typeof V27_V29_EXISTING_DATA_INVENTORY_SCHEMA;
  readonly dataStatus: string;
  readonly sourceRepository: {
    readonly branch: string;
    readonly commitSha: string;
  };
  readonly targetCountryCount: '70';
  readonly artifacts: readonly ExistingDataArtifactEvidence[];
  readonly metrics: readonly ExistingDataMetricEvidence[];
  readonly providerGaps: readonly ExistingDataProviderGap[];
  readonly openGates: readonly ExistingDataOpenGate[];
  readonly fictionalCountryMappingAuthorized: boolean;
  readonly finalGeneratorReady: boolean;
}

export type ExistingDataClosureIssueCode =
  | 'FINAL_GENERATOR_NOT_READY'
  | 'FICTIONAL_COUNTRY_MAPPING_UNAUTHORIZED'
  | 'EXTERNAL_DATA_GATE_OPEN'
  | 'SOURCE_PROVIDER_GAP'
  | 'PROVENANCE_INPUT_MISSING'
  | 'PROVENANCE_COUNTRY_COUNT_MISMATCH'
  | 'CALIBRATION_INPUT_MISSING'
  | 'CALIBRATION_INPUT_INCOMPLETE'
  | 'SOURCE_ARTIFACT_UNBOUND'
  | 'SOURCE_ARTIFACT_MISMATCH'
  | 'PROVENANCE_CALIBRATION_UNAVAILABLE';

export interface ExistingDataClosureIssue {
  readonly severity: 'UNAVAILABLE' | 'MISMATCH';
  readonly code: ExistingDataClosureIssueCode;
  readonly sourceRef: string | null;
  readonly gateId: string | null;
  readonly missingFields: readonly string[];
  readonly message: string;
}

export interface ExistingDataSeedClosureResult {
  readonly preparationStatus: typeof V27_V29_EXISTING_DATA_CLOSURE_STATUS;
  readonly status: 'TRACEABLE_PREPARATION' | 'UNAVAILABLE' | 'MISMATCH';
  readonly generationAuthorized: false;
  readonly openingSeedAuthorized: false;
  readonly inventory: ExistingDataInventory;
  readonly provenanceCalibration: ProvenanceCalibrationAdapterResult | null;
  readonly issues: readonly ExistingDataClosureIssue[];
  /** Canonical review preimage only; never an OpeningSeed fingerprint. */
  readonly hashInput: string;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const ARTIFACT_KINDS = new Set<ExistingDataArtifactKind>([
  'SOURCE_BYTES',
  'NORMALIZED_DATA',
  'DATA_QUALITY_EVIDENCE',
  'READINESS_EVIDENCE',
]);
const STABLE_REF = /^[A-Z][A-Z0-9]*(?:[_.:-][A-Z0-9]+)*$/u;
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const COUNT = /^(?:0|[1-9][0-9]*)$/u;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
    `V27/V29 existing-data closure invalid: ${message}`,
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function record(value: unknown, label: string): UnknownRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${label} must be a plain record`);
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compare);
  const required = [...expected].sort(compare);
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    invalid(`${label} contains missing or unknown fields`);
  }
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    invalid(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function stableRef(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!STABLE_REF.test(parsed)) invalid(`${label} must be a stable reference`);
  return parsed;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be boolean`);
  return value;
}

function sortedUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): readonly T[] {
  const sorted = [...values].sort((left, right) =>
    compare(identity(left), identity(right)),
  );
  if (new Set(sorted.map(identity)).size !== sorted.length) {
    invalid(`${label} identities must be unique`);
  }
  return Object.freeze(sorted);
}

function parseArtifact(value: unknown): ExistingDataArtifactEvidence {
  const input = record(value, 'existing-data artifact');
  exactKeys(
    input,
    ['artifactRef', 'kind', 'locator', 'contentSha256'],
    'existing-data artifact',
  );
  const kind = text(input.kind, 'artifact kind') as ExistingDataArtifactKind;
  if (!ARTIFACT_KINDS.has(kind)) invalid('artifact kind is unsupported');
  const contentSha256 = text(input.contentSha256, 'artifact SHA-256');
  if (!SHA256.test(contentSha256)) {
    invalid('artifact SHA-256 must be lowercase hexadecimal');
  }
  return Object.freeze({
    artifactRef: stableRef(input.artifactRef, 'artifactRef'),
    kind,
    locator: text(input.locator, 'artifact locator'),
    contentSha256,
  });
}

function parseMetric(
  value: unknown,
  artifactRefs: ReadonlySet<string>,
): ExistingDataMetricEvidence {
  const input = record(value, 'existing-data metric');
  exactKeys(
    input,
    ['metricRef', 'value', 'unit', 'evidenceArtifactRef'],
    'existing-data metric',
  );
  const count = text(input.value, 'metric value');
  if (!COUNT.test(count)) invalid('metric count must be a canonical integer');
  if (input.unit !== 'count') invalid('metric unit must be count');
  const evidenceArtifactRef = stableRef(
    input.evidenceArtifactRef,
    'metric evidenceArtifactRef',
  );
  if (!artifactRefs.has(evidenceArtifactRef)) {
    invalid('metric references an unknown evidence artifact');
  }
  return Object.freeze({
    metricRef: stableRef(input.metricRef, 'metricRef'),
    value: count,
    unit: 'count',
    evidenceArtifactRef,
  });
}

function parseProviderGap(
  value: unknown,
  artifactRefs: ReadonlySet<string>,
): ExistingDataProviderGap {
  const input = record(value, 'provider gap');
  exactKeys(
    input,
    ['sourceRef', 'issueRef', 'evidenceArtifactRef'],
    'provider gap',
  );
  const evidenceArtifactRef = stableRef(
    input.evidenceArtifactRef,
    'provider-gap evidenceArtifactRef',
  );
  if (!artifactRefs.has(evidenceArtifactRef)) {
    invalid('provider gap references an unknown evidence artifact');
  }
  return Object.freeze({
    sourceRef: stableRef(input.sourceRef, 'provider-gap sourceRef'),
    issueRef: stableRef(input.issueRef, 'provider-gap issueRef'),
    evidenceArtifactRef,
  });
}

function parseOpenGate(
  value: unknown,
  artifactRefs: ReadonlySet<string>,
): ExistingDataOpenGate {
  const input = record(value, 'open data gate');
  exactKeys(
    input,
    ['gateId', 'requiredEvidenceRefs', 'evidenceArtifactRef'],
    'open data gate',
  );
  const evidenceArtifactRef = stableRef(
    input.evidenceArtifactRef,
    'gate evidenceArtifactRef',
  );
  if (!artifactRefs.has(evidenceArtifactRef)) {
    invalid('open gate references an unknown evidence artifact');
  }
  const requiredEvidenceRefs = sortedUnique(
    list(input.requiredEvidenceRefs, 'required gate evidence').map((item) =>
      stableRef(item, 'required gate evidenceRef'),
    ),
    (item) => item,
    'required gate evidence',
  );
  if (requiredEvidenceRefs.length === 0) {
    invalid('open gate must name required evidence');
  }
  return Object.freeze({
    gateId: stableRef(input.gateId, 'gateId'),
    requiredEvidenceRefs,
    evidenceArtifactRef,
  });
}

export function parseExistingDataInventory(
  value: unknown,
): ExistingDataInventory {
  const input = record(
    JSON.parse(canonicalSerialize(value)),
    'existing-data inventory',
  );
  exactKeys(
    input,
    [
      'schemaVersion',
      'dataStatus',
      'sourceRepository',
      'targetCountryCount',
      'artifacts',
      'metrics',
      'providerGaps',
      'openGates',
      'fictionalCountryMappingAuthorized',
      'finalGeneratorReady',
    ],
    'existing-data inventory',
  );
  if (input.schemaVersion !== V27_V29_EXISTING_DATA_INVENTORY_SCHEMA) {
    invalid('existing-data inventory schema is unsupported');
  }
  if (input.targetCountryCount !== '70') {
    invalid('targetCountryCount must remain the declared 70-country scope');
  }
  const sourceRepository = record(input.sourceRepository, 'source repository');
  exactKeys(sourceRepository, ['branch', 'commitSha'], 'source repository');
  const commitSha = text(sourceRepository.commitSha, 'source commit SHA');
  if (!SHA1.test(commitSha)) {
    invalid('source commit SHA must be full lowercase Git SHA-1');
  }
  const artifacts = sortedUnique(
    list(input.artifacts, 'artifacts').map(parseArtifact),
    (item) => item.artifactRef,
    'artifact',
  );
  if (artifacts.length === 0) invalid('at least one artifact is required');
  if (
    new Set(artifacts.map((item) => item.locator)).size !== artifacts.length
  ) {
    invalid('artifact locators must be unique');
  }
  const artifactRefs = new Set(artifacts.map((item) => item.artifactRef));
  const metrics = sortedUnique(
    list(input.metrics, 'metrics').map((item) =>
      parseMetric(item, artifactRefs),
    ),
    (item) => item.metricRef,
    'metric',
  );
  const providerGaps = sortedUnique(
    list(input.providerGaps, 'provider gaps').map((item) =>
      parseProviderGap(item, artifactRefs),
    ),
    (item) => `${item.sourceRef}\u0000${item.issueRef}`,
    'provider gap',
  );
  const openGates = sortedUnique(
    list(input.openGates, 'open gates').map((item) =>
      parseOpenGate(item, artifactRefs),
    ),
    (item) => item.gateId,
    'open gate',
  );
  const fictionalCountryMappingAuthorized = boolean(
    input.fictionalCountryMappingAuthorized,
    'fictionalCountryMappingAuthorized',
  );
  const finalGeneratorReady = boolean(
    input.finalGeneratorReady,
    'finalGeneratorReady',
  );
  if (
    finalGeneratorReady &&
    (!fictionalCountryMappingAuthorized ||
      openGates.length > 0 ||
      providerGaps.length > 0)
  ) {
    invalid('finalGeneratorReady conflicts with unresolved evidence');
  }
  return Object.freeze({
    schemaVersion: V27_V29_EXISTING_DATA_INVENTORY_SCHEMA,
    dataStatus: text(input.dataStatus, 'dataStatus'),
    sourceRepository: Object.freeze({
      branch: text(sourceRepository.branch, 'source branch'),
      commitSha,
    }),
    targetCountryCount: '70',
    artifacts,
    metrics,
    providerGaps,
    openGates,
    fictionalCountryMappingAuthorized,
    finalGeneratorReady,
  });
}

function closureIssue(input: {
  readonly severity?: ExistingDataClosureIssue['severity'];
  readonly code: ExistingDataClosureIssueCode;
  readonly sourceRef?: string | null;
  readonly gateId?: string | null;
  readonly missingFields?: readonly string[];
  readonly message: string;
}): ExistingDataClosureIssue {
  return Object.freeze({
    severity: input.severity ?? 'UNAVAILABLE',
    code: input.code,
    sourceRef: input.sourceRef ?? null,
    gateId: input.gateId ?? null,
    missingFields: Object.freeze(
      [...(input.missingFields ?? [])].sort(compare),
    ),
    message: input.message,
  });
}

function issueKey(value: ExistingDataClosureIssue): string {
  return canonicalSerialize([
    value.severity,
    value.code,
    value.sourceRef,
    value.gateId,
    value.missingFields,
    value.message,
  ]);
}

function revalidateProvenance(
  value: CountrySeedProvenancePreparation,
): CountrySeedProvenancePreparation {
  const parsed = parseCountrySeedProvenance({
    schemaVersion: value.schemaVersion,
    worldId: value.worldId,
    seasonRef: value.seasonRef,
    configuredCountryIds: value.configuredCountryIds,
    sources: value.sources,
    countries: value.countries,
  });
  if (canonicalSerialize(parsed) !== canonicalSerialize(value)) {
    invalid('provenance result does not match parser output');
  }
  return parsed;
}

function sourceBindingIssue(input: {
  readonly sourceRef: string;
  readonly locator: string;
  readonly contentSha256: string;
  readonly artifacts: readonly ExistingDataArtifactEvidence[];
}): ExistingDataClosureIssue | null {
  const locatorMatches = input.artifacts.filter(
    (artifact) => artifact.locator === input.locator,
  );
  if (locatorMatches.length === 0) {
    return closureIssue({
      code: 'SOURCE_ARTIFACT_UNBOUND',
      sourceRef: input.sourceRef,
      missingFields: ['inventory.artifact'],
      message: `No frozen inventory artifact binds source locator ${input.locator}`,
    });
  }
  if (
    locatorMatches.every(
      (artifact) => artifact.contentSha256 !== input.contentSha256,
    )
  ) {
    return closureIssue({
      severity: 'MISMATCH',
      code: 'SOURCE_ARTIFACT_MISMATCH',
      sourceRef: input.sourceRef,
      message: `Frozen artifact digest differs for source locator ${input.locator}`,
    });
  }
  return null;
}

function calibrationSourceBindingIssue(input: {
  readonly source: CalibrationSourceEvidence;
  readonly artifacts: readonly ExistingDataArtifactEvidence[];
}): ExistingDataClosureIssue | null {
  return sourceBindingIssue({
    sourceRef: input.source.sourceRef,
    locator: input.source.locator,
    contentSha256: input.source.contentHash.slice('sha256:'.length),
    artifacts: input.artifacts,
  });
}

/**
 * Assesses whether existing frozen evidence can support a traceable V27 input
 * package. It never creates or authorizes an OpeningSeed.
 */
export function prepareExistingDataSeedClosure(input: {
  readonly inventory: unknown;
  readonly provenance: CountrySeedProvenancePreparation | null;
  readonly calibration: unknown | null;
  readonly sha256Hex: Sha256Hex;
}): ExistingDataSeedClosureResult {
  const inventory = parseExistingDataInventory(input.inventory);
  const issues: ExistingDataClosureIssue[] = [];
  if (!inventory.finalGeneratorReady) {
    issues.push(
      closureIssue({
        code: 'FINAL_GENERATOR_NOT_READY',
        missingFields: ['inventory.finalGeneratorReady'],
        message:
          'Frozen existing-data evidence does not mark a final generator ready',
      }),
    );
  }
  if (!inventory.fictionalCountryMappingAuthorized) {
    issues.push(
      closureIssue({
        code: 'FICTIONAL_COUNTRY_MAPPING_UNAUTHORIZED',
        missingFields: ['inventory.fictionalCountryMappingAuthorized'],
        message:
          'Empirical entities cannot be reinterpreted as fictional countries without authorization',
      }),
    );
  }
  for (const gap of inventory.providerGaps) {
    issues.push(
      closureIssue({
        code: 'SOURCE_PROVIDER_GAP',
        sourceRef: gap.sourceRef,
        missingFields: [`source.${gap.issueRef}`],
        message: `Existing-data provider gap remains ${gap.issueRef}`,
      }),
    );
  }
  for (const gate of inventory.openGates) {
    issues.push(
      closureIssue({
        code: 'EXTERNAL_DATA_GATE_OPEN',
        gateId: gate.gateId,
        missingFields: gate.requiredEvidenceRefs.map(
          (reference) => `evidence.${reference}`,
        ),
        message: `Existing-data handoff gate ${gate.gateId} remains open`,
      }),
    );
  }

  const provenance =
    input.provenance === null ? null : revalidateProvenance(input.provenance);
  if (provenance === null) {
    issues.push(
      closureIssue({
        code: 'PROVENANCE_INPUT_MISSING',
        missingFields: ['provenance'],
        message: 'No actual V27.1 70-country provenance input was supplied',
      }),
    );
  } else {
    if (provenance.configuredCountryIds.length !== 70) {
      issues.push(
        closureIssue({
          code: 'PROVENANCE_COUNTRY_COUNT_MISMATCH',
          missingFields: ['provenance.configuredCountryIds'],
          message: `V27.1 provenance covers ${provenance.configuredCountryIds.length} configured countries instead of the declared 70-country scope`,
        }),
      );
    }
    for (const source of provenance.sources) {
      const binding = sourceBindingIssue({
        sourceRef: source.sourceRef,
        locator: source.locator,
        contentSha256: source.contentSha256,
        artifacts: inventory.artifacts,
      });
      if (binding !== null) issues.push(binding);
    }
  }

  const calibration =
    input.calibration === null
      ? null
      : validateV27_2CalibrationPreparation(input.calibration, input.sha256Hex);
  if (calibration === null) {
    issues.push(
      closureIssue({
        code: 'CALIBRATION_INPUT_MISSING',
        missingFields: ['calibration'],
        message: 'No actual V27.2 70-country calibration input was supplied',
      }),
    );
  } else if (calibration.status === 'PREPARATION_INCOMPLETE') {
    issues.push(
      closureIssue({
        code: 'CALIBRATION_INPUT_INCOMPLETE',
        missingFields: ['calibration.candidate'],
        message: calibration.issues.join('; '),
      }),
    );
  } else {
    for (const source of calibration.candidate.sources) {
      const binding = calibrationSourceBindingIssue({
        source,
        artifacts: inventory.artifacts,
      });
      if (binding !== null) issues.push(binding);
    }
  }

  let provenanceCalibration: ProvenanceCalibrationAdapterResult | null = null;
  if (
    provenance !== null &&
    calibration !== null &&
    calibration.status === 'PREPARATION_INPUT_CLOSED'
  ) {
    provenanceCalibration = connectCountrySeedProvenanceToCalibration({
      provenance,
      calibration: calibration.candidate,
      sha256Hex: input.sha256Hex,
    });
    if (provenanceCalibration.status !== 'AVAILABLE') {
      issues.push(
        closureIssue({
          code: 'PROVENANCE_CALIBRATION_UNAVAILABLE',
          missingFields: [
            ...new Set(
              provenanceCalibration.issues.flatMap(
                (entry) => entry.missingFields,
              ),
            ),
          ],
          message: `V27 provenance/calibration adapter reports ${provenanceCalibration.status} with ${provenanceCalibration.issues.length} issue(s)`,
        }),
      );
    }
  }

  const sortedIssues = Object.freeze(
    [...issues].sort((left, right) => compare(issueKey(left), issueKey(right))),
  );
  const status = sortedIssues.some((entry) => entry.severity === 'MISMATCH')
    ? ('MISMATCH' as const)
    : sortedIssues.length > 0
      ? ('UNAVAILABLE' as const)
      : ('TRACEABLE_PREPARATION' as const);
  const body = Object.freeze({
    preparationStatus: V27_V29_EXISTING_DATA_CLOSURE_STATUS,
    status,
    generationAuthorized: false as const,
    openingSeedAuthorized: false as const,
    inventory,
    provenanceCalibration,
    issues: sortedIssues,
  });
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}
