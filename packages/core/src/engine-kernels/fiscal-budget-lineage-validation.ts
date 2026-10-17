import { kernelInvalid } from './common.js';

/** Mechanical structural checks only. No budget cap, P/C/R math or authority. */
interface ImmutableSourceSnapshotBinding {
  readonly sourceRef: string;
  readonly sourceVersion: string;
  readonly snapshotRef: string;
  readonly snapshotHash: string;
  readonly predecessorSnapshotHash: string | null;
}
interface BoundFoundationEvidence {
  readonly evidenceRef: string;
  readonly lineage: ImmutableSourceSnapshotBinding;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

export function stableReference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

export function snapshotHash(value: string, label: string): string {
  if (!SHA256_HEX.test(value)) {
    kernelInvalid(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

export function immutableSourceSnapshotBinding(
  value: ImmutableSourceSnapshotBinding,
  label: string,
): ImmutableSourceSnapshotBinding {
  return Object.freeze({
    sourceRef: stableReference(value.sourceRef, `${label} source`),
    sourceVersion: stableReference(value.sourceVersion, `${label} version`),
    snapshotRef: stableReference(value.snapshotRef, `${label} snapshot`),
    snapshotHash: snapshotHash(value.snapshotHash, `${label} snapshot hash`),
    predecessorSnapshotHash:
      value.predecessorSnapshotHash === null
        ? null
        : snapshotHash(
            value.predecessorSnapshotHash,
            `${label} predecessor snapshot hash`,
          ),
  });
}

export function sameLineage(
  expected: ImmutableSourceSnapshotBinding,
  actual: ImmutableSourceSnapshotBinding,
  label: string,
): void {
  if (
    expected.sourceRef !== actual.sourceRef ||
    expected.sourceVersion !== actual.sourceVersion ||
    expected.snapshotRef !== actual.snapshotRef ||
    expected.snapshotHash !== actual.snapshotHash ||
    expected.predecessorSnapshotHash !== actual.predecessorSnapshotHash
  ) {
    kernelInvalid(`${label} must bind to the closure source snapshot lineage`);
  }
}

export function boundEvidence(
  value: BoundFoundationEvidence,
  expectedLineage: ImmutableSourceSnapshotBinding,
  label: string,
): BoundFoundationEvidence {
  const lineage = immutableSourceSnapshotBinding(
    value.lineage,
    `${label} lineage`,
  );
  sameLineage(expectedLineage, lineage, label);
  return Object.freeze({
    evidenceRef: stableReference(value.evidenceRef, `${label} reference`),
    lineage,
  });
}

export function sameCurrency(
  expected: string,
  actual: string,
  label: string,
): void {
  if (expected !== actual) kernelInvalid(`${label} currency must match`);
}

export function assertUniqueReferences(
  values: readonly string[],
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const canonical = stableReference(value, label);
    if (seen.has(canonical)) kernelInvalid(`${label} must be unique`);
    seen.add(canonical);
  }
}

/** Compare at the caller's original check position; preserve its exact error. */
export function assertFiscalReferenceMatch(
  expected: string | null,
  actual: string | null,
  message: string,
): void {
  if (actual !== expected) kernelInvalid(message);
}
