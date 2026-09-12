import {
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  type CanonicalSha256,
  type Sha256Hex,
} from '../../packages/core/src/index.js';

export const V10_4_EVIDENCE_STATUS =
  'CANDIDATE_NOT_EXECUTED_OR_GATE_APPROVED' as const;

export const V10_GATE_B_PROPERTIES = Object.freeze([
  'CLOCK_DETERMINISTIC',
  'SIM_TIME_MONOTONIC',
  'COMMANDS_CANONICAL',
  'AUTHORIZATION_SERVER_SIDE',
  'IDEMPOTENCY_DURABLE',
  'EVENTS_APPEND_ONLY',
  'REPLAY_EXACT',
  'SINGLE_WRITER_ENFORCED',
  'TRANSACTIONS_ATOMIC',
  'INVENTORY_CONSERVED',
  'MONEY_CONSERVED',
  'RECOVERY_WORKS',
  'PROJECTIONS_NON_AUTHORITATIVE_REBUILDABLE',
  'CONCURRENCY_SAFE',
] as const);

export const V10_INHERITED_FOUNDATION_INVARIANTS = Object.freeze([
  'UNSAFE_STARTUP_FAILS_CLOSED',
  'ARITHMETIC_EXACT_OR_REJECT',
  'SERIALIZATION_INERT',
  'AUTHORIZATION_CURRENT',
  'AUTH_SUBJECT_UUID_SAFE',
  'AST_BOUNDARIES_ENFORCED',
  'MIGRATION_PROVENANCE_TRUTHFUL',
] as const);

export type V10GateBProperty = (typeof V10_GATE_B_PROPERTIES)[number];
export type V10FoundationInvariant =
  (typeof V10_INHERITED_FOUNDATION_INVARIANTS)[number];
export type V10EvidenceResult = 'PASS' | 'FAIL' | 'NOT_RUN';
export type V10EvidenceSurface =
  | 'LOCAL_UNIT'
  | 'REPOSITORY_REGRESSION'
  | 'BROWSER_E2E'
  | 'ISOLATED_POSTGRESQL'
  | 'NONPRODUCTION_SUPABASE_STAGING';

export interface V10GateBEvidenceItem<Subject extends string> {
  readonly subject: Subject;
  readonly result: V10EvidenceResult;
  readonly surface: V10EvidenceSurface;
  readonly evidenceRef: string;
}

export interface V10GateBCampaign {
  readonly candidateCommit: string;
  readonly productionMutation: false;
  readonly v11ImplementationStarted: false;
  readonly propertyEvidence: readonly V10GateBEvidenceItem<V10GateBProperty>[];
  readonly foundationEvidence: readonly V10GateBEvidenceItem<V10FoundationInvariant>[];
  readonly browserE2E: V10GateBEvidenceItem<'TWO_COUNTRY_TWO_OFFICE_BROWSER_E2E'>;
  readonly realPostgresCrashRecovery: V10GateBEvidenceItem<'POSTGRES_CRASH_RECOVERY'>;
  readonly stagingRlsGrants: V10GateBEvidenceItem<'STAGING_RLS_AND_GRANTS'>;
  readonly fullRegression: V10GateBEvidenceItem<'FULL_REPOSITORY_REGRESSION'>;
}

export type V10GateBReadiness =
  | Readonly<{
      kind: 'READY_FOR_INDEPENDENT_GATE_B_REVIEW';
      evidenceHash: CanonicalSha256;
    }>
  | Readonly<{
      kind: 'PENDING_EVIDENCE';
      missing: readonly string[];
      evidenceHash: CanonicalSha256;
    }>
  | Readonly<{
      kind: 'BLOCKED_BY_FAILED_EVIDENCE';
      failed: readonly string[];
      evidenceHash: CanonicalSha256;
    }>;

function invalid(message: string): never {
  throw new Error(`V10_GATE_B_EVIDENCE_INVALID: ${message}`);
}

function canonicalCommit(value: string): string {
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    invalid('candidateCommit must be an immutable lowercase SHA-1');
  }
  return value;
}

function validateCompleteSet<Subject extends string>(input: {
  readonly expected: readonly Subject[];
  readonly evidence: readonly V10GateBEvidenceItem<Subject>[];
  readonly label: string;
}): readonly V10GateBEvidenceItem<Subject>[] {
  const observed = new Set(input.evidence.map((item) => item.subject));
  if (
    observed.size !== input.evidence.length ||
    observed.size !== input.expected.length ||
    input.expected.some((subject) => !observed.has(subject))
  ) {
    invalid(`${input.label} must contain every subject exactly once`);
  }
  for (const item of input.evidence) {
    if (item.evidenceRef.length === 0) {
      invalid(`${item.subject} must name an evidence reference`);
    }
  }
  return Object.freeze(
    [...input.evidence].sort((left, right) =>
      left.subject.localeCompare(right.subject),
    ),
  );
}

function propertyNeedsIsolatedPostgres(property: V10GateBProperty): boolean {
  return (
    property === 'SINGLE_WRITER_ENFORCED' ||
    property === 'TRANSACTIONS_ATOMIC' ||
    property === 'RECOVERY_WORKS' ||
    property === 'CONCURRENCY_SAFE'
  );
}

function invalidPassSurface(item: V10GateBEvidenceItem<string>): boolean {
  return (
    item.result === 'PASS' &&
    ((item.subject === 'TWO_COUNTRY_TWO_OFFICE_BROWSER_E2E' &&
      item.surface !== 'BROWSER_E2E') ||
      (item.subject === 'POSTGRES_CRASH_RECOVERY' &&
        item.surface !== 'ISOLATED_POSTGRESQL') ||
      (item.subject === 'STAGING_RLS_AND_GRANTS' &&
        item.surface !== 'NONPRODUCTION_SUPABASE_STAGING') ||
      (item.subject === 'FULL_REPOSITORY_REGRESSION' &&
        item.surface !== 'REPOSITORY_REGRESSION') ||
      (V10_GATE_B_PROPERTIES.includes(item.subject as V10GateBProperty) &&
        propertyNeedsIsolatedPostgres(item.subject as V10GateBProperty) &&
        item.surface !== 'ISOLATED_POSTGRESQL'))
  );
}

function evidenceHash(
  input: V10GateBCampaign,
  sha256Hex: Sha256Hex,
): CanonicalSha256 {
  return canonicalSha256(
    canonicalHashInput({
      ...input,
      propertyEvidence: [...input.propertyEvidence].sort((left, right) =>
        left.subject.localeCompare(right.subject),
      ),
      foundationEvidence: [...input.foundationEvidence].sort((left, right) =>
        left.subject.localeCompare(right.subject),
      ),
    }),
    sha256Hex,
  );
}

/**
 * Classifies evidence without writing files or asserting that any campaign has
 * run. A READY result means only that a complete immutable bundle may be sent
 * to independent Gate B review; it never self-approves V10 or starts V11.
 */
export function classifyV10GateBReadiness(
  input: V10GateBCampaign,
  sha256Hex: Sha256Hex,
): V10GateBReadiness {
  canonicalCommit(input.candidateCommit);
  if (
    input.productionMutation !== false ||
    input.v11ImplementationStarted !== false
  ) {
    invalid(
      'Gate B evidence must preserve no production mutation and no V11 start',
    );
  }
  const properties = validateCompleteSet({
    expected: V10_GATE_B_PROPERTIES,
    evidence: input.propertyEvidence,
    label: 'Gate B property evidence',
  });
  const foundations = validateCompleteSet({
    expected: V10_INHERITED_FOUNDATION_INVARIANTS,
    evidence: input.foundationEvidence,
    label: 'Inherited Foundation evidence',
  });
  const additional = [
    input.browserE2E,
    input.realPostgresCrashRecovery,
    input.stagingRlsGrants,
    input.fullRegression,
  ] as const;
  if (additional.some((item) => item.evidenceRef.length === 0)) {
    invalid('Required Gate B campaign evidence must name a reference');
  }
  const all = [...properties, ...foundations, ...additional];
  const hash = evidenceHash(input, sha256Hex);
  const surfaceFailures = all
    .filter(invalidPassSurface)
    .map((item) => `${item.subject}:PASS_ON_WRONG_SURFACE`);
  if (surfaceFailures.length > 0) {
    return Object.freeze({
      kind: 'BLOCKED_BY_FAILED_EVIDENCE',
      failed: Object.freeze(surfaceFailures),
      evidenceHash: hash,
    });
  }
  const failed = all
    .filter((item) => item.result === 'FAIL')
    .map((item) => item.subject);
  if (failed.length > 0) {
    return Object.freeze({
      kind: 'BLOCKED_BY_FAILED_EVIDENCE',
      failed: Object.freeze(failed),
      evidenceHash: hash,
    });
  }
  const missing = all
    .filter((item) => item.result === 'NOT_RUN')
    .map((item) => item.subject);
  if (missing.length > 0) {
    return Object.freeze({
      kind: 'PENDING_EVIDENCE',
      missing: Object.freeze(missing),
      evidenceHash: hash,
    });
  }
  return Object.freeze({
    kind: 'READY_FOR_INDEPENDENT_GATE_B_REVIEW',
    evidenceHash: hash,
  });
}

export function deterministicV10GateBCampaignJson(
  input: V10GateBCampaign,
): string {
  return canonicalSerialize({
    ...input,
    propertyEvidence: [...input.propertyEvidence].sort((left, right) =>
      left.subject.localeCompare(right.subject),
    ),
    foundationEvidence: [...input.foundationEvidence].sort((left, right) =>
      left.subject.localeCompare(right.subject),
    ),
  });
}
