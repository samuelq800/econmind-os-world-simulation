/** V29.1 preparation: explicit evidence binding, never step verification. */

export type V29EvidenceStatus = 'EVIDENCED' | 'MISSING' | 'FAIL' | 'NOT_RUN';

export interface V29RequirementRow {
  readonly requirement_id: string;
  readonly source_document: string;
  readonly planned_work_packages: readonly string[];
}

export interface V29EvidenceClaim {
  readonly requirementId: string;
  readonly status: V29EvidenceStatus;
  readonly reason: string;
  readonly candidateSha?: string;
  readonly codePaths?: readonly string[];
  readonly testPaths?: readonly string[];
  readonly evidenceRefs?: readonly string[];
}

export interface V29EvidenceRow {
  readonly requirementId: string;
  readonly sourceDocument: string;
  readonly plannedWorkPackages: readonly string[];
  readonly status: V29EvidenceStatus;
  readonly reason: string;
  readonly candidateSha: string | null;
  readonly evidenceRefs: readonly string[];
  readonly formallyVerified: false;
}

export interface V29EvidenceMatrix {
  readonly status: 'PREPARATION_ONLY_NOT_V29_APPROVAL';
  readonly counts: Readonly<Record<V29EvidenceStatus, number>>;
  readonly rows: readonly V29EvidenceRow[];
}

const SHA = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[A-Z][A-Z0-9_-]+$/u;
const PATH = /^[A-Za-z0-9_./-]+$/u;

function validPaths(paths: readonly string[] | undefined): boolean {
  return (
    Array.isArray(paths) &&
    paths.length > 0 &&
    paths.every(
      (path) =>
        typeof path === 'string' &&
        PATH.test(path) &&
        !path.startsWith('/') &&
        !path.split('/').includes('..'),
    )
  );
}

function validateClaim(claim: V29EvidenceClaim): void {
  if (
    claim === null ||
    typeof claim !== 'object' ||
    !IDENTIFIER.test(claim.requirementId) ||
    !['EVIDENCED', 'MISSING', 'FAIL', 'NOT_RUN'].includes(claim.status) ||
    typeof claim.reason !== 'string' ||
    claim.reason.trim().length === 0
  ) {
    throw new Error('Invalid V29 evidence claim');
  }
  if (
    claim.status === 'EVIDENCED' &&
    (!SHA.test(claim.candidateSha ?? '') ||
      !validPaths(claim.codePaths) ||
      !validPaths(claim.testPaths) ||
      !validPaths(claim.evidenceRefs))
  ) {
    throw new Error('EVIDENCED requires exact SHA, code, tests and evidence');
  }
  if (
    claim.status !== 'EVIDENCED' &&
    (claim.candidateSha !== undefined ||
      claim.codePaths !== undefined ||
      claim.testPaths !== undefined ||
      claim.evidenceRefs !== undefined)
  ) {
    throw new Error('Unproven V29 claim must not carry evidence fields');
  }
}

export function buildV29EvidenceMatrix(
  requirements: readonly V29RequirementRow[],
  claims: readonly V29EvidenceClaim[],
): V29EvidenceMatrix {
  if (!Array.isArray(requirements) || !Array.isArray(claims)) {
    throw new Error('V29 requirements and claims must be arrays');
  }
  const ids = new Set<string>();
  for (const requirement of requirements) {
    if (
      requirement === null ||
      typeof requirement !== 'object' ||
      !IDENTIFIER.test(requirement.requirement_id) ||
      ids.has(requirement.requirement_id) ||
      typeof requirement.source_document !== 'string' ||
      !Array.isArray(requirement.planned_work_packages)
    ) {
      throw new Error('Invalid or duplicate V29 requirement');
    }
    ids.add(requirement.requirement_id);
  }
  const bound = new Map<string, V29EvidenceClaim>();
  for (const claim of claims) {
    validateClaim(claim);
    if (!ids.has(claim.requirementId) || bound.has(claim.requirementId)) {
      throw new Error('Unknown or duplicate V29 evidence claim');
    }
    bound.set(claim.requirementId, claim);
  }
  const counts: Record<V29EvidenceStatus, number> = {
    EVIDENCED: 0,
    MISSING: 0,
    FAIL: 0,
    NOT_RUN: 0,
  };
  const rows = requirements.map((requirement): V29EvidenceRow => {
    const claim = bound.get(requirement.requirement_id);
    const status = claim?.status ?? 'MISSING';
    counts[status] += 1;
    return {
      requirementId: requirement.requirement_id,
      sourceDocument: requirement.source_document,
      plannedWorkPackages: [...requirement.planned_work_packages],
      status,
      reason: claim?.reason ?? 'NO_EXACT_CANDIDATE_EVIDENCE_BOUND',
      candidateSha: claim?.candidateSha ?? null,
      evidenceRefs: [...(claim?.evidenceRefs ?? [])],
      formallyVerified: false,
    };
  });
  return { status: 'PREPARATION_ONLY_NOT_V29_APPROVAL', counts, rows };
}
