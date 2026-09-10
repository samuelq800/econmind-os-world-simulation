import { sha256Canonical } from './canonical.js';
import { assertCanonicalDecimal } from './decimal.js';
import type {
  NormalizedObservation,
  RawSnapshotMetadata,
  SourceRecord,
} from './types.js';

export interface NormalizationPlan {
  readonly variableId: string;
  readonly canonicalUnit: string;
  readonly acceptedSourceUnit: string;
  readonly transformationId: string;
  readonly transformationVersion: string;
}

export function normalizeRecord(
  record: SourceRecord,
  snapshot: RawSnapshotMetadata,
  plan: NormalizationPlan,
): NormalizedObservation {
  if (record.sourceUnit !== plan.acceptedSourceUnit) {
    throw new Error(
      `Unexpected unit ${record.sourceUnit}; expected ${plan.acceptedSourceUnit}`,
    );
  }
  const value =
    record.value === null ? null : assertCanonicalDecimal(record.value);
  const identity = {
    variableId: plan.variableId,
    geographyId: record.geographyId,
    period: record.period,
    sourceSnapshotId: snapshot.snapshotId,
    sourceObservationKey: record.sourceObservationKey,
    transformationVersion: plan.transformationVersion,
  };
  return Object.freeze({
    observationId: `obs_${sha256Canonical(identity)}`,
    variableId: plan.variableId,
    geographyId: record.geographyId,
    period: record.period,
    value,
    canonicalUnit: plan.canonicalUnit,
    dataClass: 'OBSERVED',
    sourceSnapshotId: snapshot.snapshotId,
    sourceObservationKey: record.sourceObservationKey,
    transformationId: plan.transformationId,
    transformationVersion: plan.transformationVersion,
    qualityFlags: Object.freeze([...record.qualityFlags]),
    provenance: Object.freeze([
      snapshot.snapshotId,
      record.sourceObservationKey,
    ]),
  });
}
