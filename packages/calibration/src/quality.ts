import { compareDecimal, subtractDecimal } from './decimal.js';
import type { EntityConcordance } from './concordance.js';
import {
  resolveEntity,
  resolveTradeClassification,
  type TradeClassificationConcordance,
} from './concordance.js';
import type {
  NormalizedObservation,
  RawSnapshotMetadata,
  SourceRecord,
} from './types.js';

export type DiagnosticCode =
  | 'MISSING_OBSERVATION'
  | 'DUPLICATE_OBSERVATION'
  | 'UNRESOLVED_ENTITY_CONCORDANCE'
  | 'AMBIGUOUS_ENTITY_CONCORDANCE'
  | 'UNIT_MISMATCH'
  | 'TEMPORAL_GAP'
  | 'PROVIDER_REVISION_DIFFERENCE'
  | 'SUSPICIOUS_DUPLICATE_PROVIDER_KEY'
  | 'REPORTING_ASYMMETRY'
  | 'UNSUPPORTED_CLASSIFICATION'
  | 'OUTLIER_RULE_VIOLATION';

export interface QualityDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly subjectKeys: readonly string[];
  readonly message: string;
  readonly transformationVersion: string;
  readonly details: Readonly<Record<string, string | null>>;
}

export interface OutlierRule {
  readonly ruleId: string;
  readonly version: string;
  readonly variableId: string;
  readonly minimum: string | null;
  readonly maximum: string | null;
}

export function diagnoseSourceRecords(
  records: readonly SourceRecord[],
  options: {
    readonly entityConcordance: EntityConcordance;
    readonly entityNamespace: string;
    readonly expectedUnits: Readonly<Record<string, string>>;
    readonly tradeConcordance?: TradeClassificationConcordance;
  },
): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  const byKey = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const existing = byKey.get(record.sourceObservationKey) ?? [];
    existing.push(record);
    byKey.set(record.sourceObservationKey, existing);
    if (record.value === null) {
      diagnostics.push({
        code: 'MISSING_OBSERVATION',
        severity: 'WARNING',
        subjectKeys: [record.sourceObservationKey],
        message: 'Provider returned an explicit missing observation.',
        transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
        details: {},
      });
    }
    const resolution = resolveEntity(
      options.entityConcordance,
      options.entityNamespace,
      record.geographyId,
    );
    if (resolution.status !== 'RESOLVED') {
      diagnostics.push({
        code:
          resolution.status === 'AMBIGUOUS'
            ? 'AMBIGUOUS_ENTITY_CONCORDANCE'
            : 'UNRESOLVED_ENTITY_CONCORDANCE',
        severity: 'ERROR',
        subjectKeys: [record.sourceObservationKey],
        message:
          'Provider entity does not resolve to one canonical empirical entity.',
        transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
        details: {
          namespace: options.entityNamespace,
          providerIdentifier: record.geographyId,
        },
      });
    }
    const expectedUnit = options.expectedUnits[record.variableCode];
    if (expectedUnit !== undefined && expectedUnit !== record.sourceUnit) {
      diagnostics.push({
        code: 'UNIT_MISMATCH',
        severity: 'ERROR',
        subjectKeys: [record.sourceObservationKey],
        message:
          'Provider unit does not match the registered normalization plan.',
        transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
        details: { expectedUnit, observedUnit: record.sourceUnit },
      });
    }
    const classification = record.attributes['productClassification'];
    const productCode = record.attributes['productCode'];
    if (
      options.tradeConcordance !== undefined &&
      classification !== undefined &&
      classification !== null &&
      productCode !== undefined &&
      productCode !== null &&
      resolveTradeClassification(
        options.tradeConcordance,
        'UN_COMTRADE_HS',
        classification,
        productCode,
      ) === null
    ) {
      diagnostics.push({
        code: 'UNSUPPORTED_CLASSIFICATION',
        severity: 'WARNING',
        subjectKeys: [record.sourceObservationKey],
        message:
          'No pilot sector mapping exists for this provider classification/product.',
        transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
        details: { classification, productCode },
      });
    }
  }
  for (const [key, values] of [...byKey.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (values.length > 1) {
      const signatures = new Set(
        values.map(
          (record) =>
            `${record.rawNumericToken ?? 'null'}\u0000${record.sourceUnit}`,
        ),
      );
      diagnostics.push({
        code:
          signatures.size === 1
            ? 'DUPLICATE_OBSERVATION'
            : 'SUSPICIOUS_DUPLICATE_PROVIDER_KEY',
        severity: signatures.size === 1 ? 'WARNING' : 'ERROR',
        subjectKeys: [key],
        message:
          signatures.size === 1
            ? 'The same provider observation appears more than once.'
            : 'The same provider key carries conflicting values or units.',
        transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
        details: { count: String(values.length) },
      });
    }
  }
  return diagnostics;
}

export function diagnoseTemporalGaps(
  observations: readonly NormalizedObservation[],
): readonly QualityDiagnostic[] {
  const groups = new Map<string, number[]>();
  for (const observation of observations) {
    if (!/^\d{4}$/u.test(observation.period)) continue;
    const key = `${observation.geographyId}\u0000${observation.variableId}`;
    const years = groups.get(key) ?? [];
    years.push(Number(observation.period));
    groups.set(key, years);
  }
  const diagnostics: QualityDiagnostic[] = [];
  for (const [key, years] of groups) {
    const unique = [...new Set(years)].sort((a, b) => a - b);
    const first = unique[0];
    const last = unique.at(-1);
    if (first === undefined || last === undefined) continue;
    for (let year = first; year <= last; year += 1) {
      if (!unique.includes(year)) {
        diagnostics.push({
          code: 'TEMPORAL_GAP',
          severity: 'WARNING',
          subjectKeys: [key],
          message: 'Annual observation sequence has an internal gap.',
          transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
          details: { missingPeriod: String(year) },
        });
      }
    }
  }
  return diagnostics;
}

export function diagnoseSnapshotRevision(
  earlier: RawSnapshotMetadata,
  later: RawSnapshotMetadata,
): QualityDiagnostic | null {
  if (
    earlier.sourceId !== later.sourceId ||
    JSON.stringify(earlier.requestParameters) !==
      JSON.stringify(later.requestParameters) ||
    (earlier.sourceAsOf === later.sourceAsOf && earlier.sha256 === later.sha256)
  ) {
    return null;
  }
  return {
    code: 'PROVIDER_REVISION_DIFFERENCE',
    severity: 'INFO',
    subjectKeys: [earlier.snapshotId, later.snapshotId],
    message:
      'Equivalent provider query differs by vintage or exact response bytes.',
    transformationVersion: 'QUALITY_DIAGNOSTICS@1.0.0',
    details: { earlierAsOf: earlier.sourceAsOf, laterAsOf: later.sourceAsOf },
  };
}

export function diagnoseOutliers(
  observations: readonly NormalizedObservation[],
  rules: readonly OutlierRule[],
): readonly QualityDiagnostic[] {
  const byVariable = new Map(rules.map((rule) => [rule.variableId, rule]));
  return observations.flatMap((observation) => {
    const rule = byVariable.get(observation.variableId);
    if (rule === undefined || observation.value === null) return [];
    const below =
      rule.minimum !== null &&
      compareDecimal(observation.value, rule.minimum) < 0;
    const above =
      rule.maximum !== null &&
      compareDecimal(observation.value, rule.maximum) > 0;
    if (!below && !above) return [];
    return [
      {
        code: 'OUTLIER_RULE_VIOLATION' as const,
        severity: 'WARNING' as const,
        subjectKeys: [observation.observationId],
        message:
          'Observation falls outside an explicitly versioned pilot rule.',
        transformationVersion: `${rule.ruleId}@${rule.version}`,
        details: {
          minimum: rule.minimum,
          maximum: rule.maximum,
          value: observation.value,
        },
      },
    ];
  });
}

export function diagnoseMirrorAsymmetry(
  exportsRecord: SourceRecord,
  mirrorImportsRecord: SourceRecord,
): QualityDiagnostic {
  if (exportsRecord.value === null || mirrorImportsRecord.value === null) {
    throw new Error('REPORTING_ASYMMETRY_REQUIRES_NON_MISSING_VALUES');
  }
  const exporter = exportsRecord.attributes['reporterCode'];
  const importer = exportsRecord.attributes['partnerCode'];
  if (
    exportsRecord.attributes['flowCode'] !== 'X' ||
    mirrorImportsRecord.attributes['flowCode'] !== 'M' ||
    mirrorImportsRecord.attributes['reporterCode'] !== importer ||
    mirrorImportsRecord.attributes['partnerCode'] !== exporter
  ) {
    throw new Error('NOT_A_COMTRADE_MIRROR_PAIR');
  }
  return {
    code: 'REPORTING_ASYMMETRY',
    severity: 'INFO',
    subjectKeys: [
      exportsRecord.sourceObservationKey,
      mirrorImportsRecord.sourceObservationKey,
    ],
    message:
      'Reporter exports and partner-reported mirror imports remain separate observations.',
    transformationVersion: 'COMTRADE_MIRROR_ASYMMETRY@1.0.0',
    details: {
      reporterExports: exportsRecord.value,
      mirrorImports: mirrorImportsRecord.value,
      absoluteSignedDifference: subtractDecimal(
        exportsRecord.value,
        mirrorImportsRecord.value,
      ),
    },
  };
}
