export interface EntityIdentifier {
  readonly namespace: string;
  readonly value: string;
  readonly status: 'VERIFIED' | 'PILOT' | 'UNRESOLVED';
}

export interface EntityConcordanceEntry {
  readonly canonicalEntityId: string;
  readonly displayName: string;
  readonly identifiers: readonly EntityIdentifier[];
}

export interface EntityConcordance {
  readonly schemaVersion: 'source-entity-concordance.v1';
  readonly version: string;
  readonly status: 'PILOT_NON_AUTHORITATIVE';
  readonly entities: readonly EntityConcordanceEntry[];
}

export interface EntityResolution {
  readonly status: 'RESOLVED' | 'UNRESOLVED' | 'AMBIGUOUS';
  readonly canonicalEntityId: string | null;
  readonly matches: readonly string[];
}

export function resolveEntity(
  concordance: EntityConcordance,
  namespace: string,
  providerIdentifier: string,
): EntityResolution {
  const matches = concordance.entities
    .filter((entity) =>
      entity.identifiers.some(
        (identifier) =>
          identifier.namespace === namespace &&
          identifier.value === providerIdentifier &&
          identifier.status !== 'UNRESOLVED',
      ),
    )
    .map(({ canonicalEntityId }) => canonicalEntityId)
    .sort();
  if (matches.length === 0) {
    return { status: 'UNRESOLVED', canonicalEntityId: null, matches };
  }
  if (matches.length > 1) {
    return { status: 'AMBIGUOUS', canonicalEntityId: null, matches };
  }
  return { status: 'RESOLVED', canonicalEntityId: matches[0] ?? null, matches };
}

export function requireResolvedEntity(
  concordance: EntityConcordance,
  namespace: string,
  providerIdentifier: string,
): string {
  const resolution = resolveEntity(concordance, namespace, providerIdentifier);
  if (
    resolution.status !== 'RESOLVED' ||
    resolution.canonicalEntityId === null
  ) {
    throw new Error(
      `${resolution.status}_ENTITY_CONCORDANCE:${namespace}:${providerIdentifier}`,
    );
  }
  return resolution.canonicalEntityId;
}

export interface TradeClassificationRule {
  readonly providerClassification: string;
  readonly providerRevision: string;
  readonly productCodePrefix: string;
  readonly calibrationSectorId: string;
  readonly status: 'PILOT_NON_AUTHORITATIVE';
}

export interface TradeClassificationConcordance {
  readonly schemaVersion: 'trade-classification-concordance.v1';
  readonly version: string;
  readonly status: 'PILOT_NON_AUTHORITATIVE';
  readonly calibrationSectorMappingVersion: string;
  readonly rules: readonly TradeClassificationRule[];
}

export function resolveTradeClassification(
  concordance: TradeClassificationConcordance,
  providerClassification: string,
  providerRevision: string,
  productCode: string,
): TradeClassificationRule | null {
  const matches = concordance.rules
    .filter(
      (rule) =>
        rule.providerClassification === providerClassification &&
        rule.providerRevision === providerRevision &&
        productCode.startsWith(rule.productCodePrefix),
    )
    .sort(
      (left, right) =>
        right.productCodePrefix.length - left.productCodePrefix.length ||
        left.calibrationSectorId.localeCompare(right.calibrationSectorId),
    );
  if (
    matches.length > 1 &&
    matches[0]?.productCodePrefix.length ===
      matches[1]?.productCodePrefix.length
  ) {
    throw new Error(
      `AMBIGUOUS_TRADE_CLASSIFICATION:${providerRevision}:${productCode}`,
    );
  }
  return matches[0] ?? null;
}
