import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  parseCountrySeedProvenance,
  type CountrySeedExactValue,
  type CountrySeedField,
  type CountrySeedProvenancePreparation,
  type CountrySeedSource,
  type SeedValueOrigin,
} from '../opening/country-seed-provenance-preparation.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  validateV27_2CalibrationPreparation,
  type CalibrationNumericChange,
  type CalibrationQuantity,
  type CalibrationSourceEvidence,
  type CountryCalibrationInput,
  type V27_2CalibrationPreparationInput,
} from './country-input-closure.js';
import type { Sha256Hex } from '../commands/command.js';

export const V27_PROVENANCE_CALIBRATION_ADAPTER_STATUS =
  'PREPARATION_ONLY' as const;

export type ProvenanceCalibrationLinkStatus =
  'AVAILABLE' | 'UNAVAILABLE' | 'MISMATCH';

export type ProvenanceCalibrationIssueCode =
  | 'CALIBRATION_INPUT_INCOMPLETE'
  | 'WORLD_CONFIGURATION_BINDING_UNAVAILABLE'
  | 'COUNTRY_SET_MISMATCH'
  | 'PROVENANCE_VALUE_UNAVAILABLE'
  | 'LEGACY_INDEX_QUARANTINED'
  | 'CALIBRATION_QUANTITY_UNAVAILABLE'
  | 'CALIBRATION_METRIC_IDENTITY_MISSING'
  | 'CALIBRATION_DERIVATION_FIELD_MISSING'
  | 'SOURCE_EVIDENCE_MISMATCH'
  | 'PROVENANCE_METRIC_UNAVAILABLE';

export interface ProvenanceCalibrationIssue {
  readonly severity: 'UNAVAILABLE' | 'MISMATCH';
  readonly code: ProvenanceCalibrationIssueCode;
  readonly countryId: string | null;
  readonly metricRef: string | null;
  readonly calibrationPath: string | null;
  readonly missingFields: readonly string[];
  readonly message: string;
}

export interface ProvenanceCalibrationSourceLink {
  readonly sourceRef: string;
  readonly provenanceKind: CountrySeedSource['sourceKind'];
  readonly calibrationClassification: CalibrationSourceEvidence['classification'];
  readonly locator: string;
  readonly sourceVersion: string;
  readonly contentSha256: string;
  readonly periodRef: string | null;
  readonly geographyRef: string | null;
}

export interface ProvenanceCalibrationValueLink {
  readonly countryId: string;
  readonly domain: CountrySeedExactValue['domain'];
  readonly metricRef: string;
  readonly subjectRef: string | null;
  readonly counterpartyCountryId: string | null;
  readonly calibrationPath: string;
  readonly source: ProvenanceCalibrationSourceLink;
  readonly unit: string;
  readonly provenanceAmount: string;
  readonly originalCalibrationAmount: string;
  readonly finalCalibrationAmount: string;
  readonly valueOrigin: SeedValueOrigin;
  readonly assumptionRef: string | null;
  readonly derivationRef: string | null;
  readonly changes: readonly CalibrationNumericChange[];
}

export interface ProvenanceCalibrationAdapterResult {
  readonly preparationStatus: typeof V27_PROVENANCE_CALIBRATION_ADAPTER_STATUS;
  readonly status: ProvenanceCalibrationLinkStatus;
  readonly generationAuthorized: false;
  readonly worldId: string;
  readonly seasonRef: string;
  readonly countryCount: string;
  readonly links: readonly ProvenanceCalibrationValueLink[];
  readonly issues: readonly ProvenanceCalibrationIssue[];
  /** Canonical review preimage only; never an OpeningSeed fingerprint. */
  readonly hashInput: string;
}

interface FlattenedCalibrationQuantity {
  readonly countryId: string;
  readonly path: string;
  readonly quantity: CalibrationQuantity;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID,
    `V27 provenance/calibration adapter invalid: ${message}`,
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function flattenedCountry(
  country: CountryCalibrationInput,
): readonly FlattenedCalibrationQuantity[] {
  const result: FlattenedCalibrationQuantity[] = [];
  const add = (path: string, quantity: CalibrationQuantity) => {
    result.push(
      Object.freeze({ countryId: country.countryId, path, quantity }),
    );
  };
  for (const batch of country.financialBatches) {
    for (const leg of batch.legs) {
      add(
        `financialBatches.${batch.batchRef}.legs.${leg.legRef}`,
        leg.quantity,
      );
    }
  }
  for (const closure of country.inventoryClosures) {
    const prefix = `inventoryClosures.${closure.commodityId}`;
    add(`${prefix}.total`, closure.total);
    add(`${prefix}.buckets.available`, closure.buckets.available);
    add(`${prefix}.buckets.reserved`, closure.buckets.reserved);
    add(`${prefix}.buckets.strategic`, closure.buckets.strategic);
    add(`${prefix}.buckets.inTransit`, closure.buckets.inTransit);
  }
  for (const closure of country.geologicalClosures) {
    const prefix = `geologicalClosures.${closure.resourceId}`;
    add(`${prefix}.total`, closure.total);
    add(`${prefix}.layers.undiscovered`, closure.layers.undiscovered);
    add(
      `${prefix}.layers.discoveredUnrecoverable`,
      closure.layers.discoveredUnrecoverable,
    );
    add(
      `${prefix}.layers.recoverableUndeveloped`,
      closure.layers.recoverableUndeveloped,
    );
    add(
      `${prefix}.layers.developedRemaining`,
      closure.layers.developedRemaining,
    );
    add(
      `${prefix}.layers.cumulativeExtracted`,
      closure.layers.cumulativeExtracted,
    );
  }
  for (const facility of country.facilities) {
    const prefix = `facilities.${facility.facilityId}`;
    add(`${prefix}.installedCapacity`, facility.installedCapacity);
    add(`${prefix}.operationalCapacity`, facility.operationalCapacity);
    add(`${prefix}.staffRequired`, facility.staffRequired);
    add(`${prefix}.staffAssigned`, facility.staffAssigned);
  }
  for (const chain of country.supplyChains) {
    for (const supplier of chain.supplierShares) {
      add(
        `supplyChains.${chain.commodityId}.supplierShares.${supplier.supplierCountryId}`,
        supplier.share,
      );
    }
  }
  return Object.freeze(
    result.sort((left, right) => compare(left.path, right.path)),
  );
}

function flattenCalibration(
  input: V27_2CalibrationPreparationInput,
): readonly FlattenedCalibrationQuantity[] {
  return Object.freeze(
    input.countries
      .flatMap(flattenedCountry)
      .sort((left, right) =>
        compare(
          `${left.countryId}\u0000${left.path}`,
          `${right.countryId}\u0000${right.path}`,
        ),
      ),
  );
}

function issue(input: ProvenanceCalibrationIssue): ProvenanceCalibrationIssue {
  return Object.freeze({
    ...input,
    missingFields: Object.freeze([...input.missingFields].sort(compare)),
  });
}

function unavailable(input: {
  readonly code: ProvenanceCalibrationIssueCode;
  readonly countryId?: string | null;
  readonly metricRef?: string | null;
  readonly calibrationPath?: string | null;
  readonly missingFields: readonly string[];
  readonly message: string;
}): ProvenanceCalibrationIssue {
  return issue({
    severity: 'UNAVAILABLE',
    code: input.code,
    countryId: input.countryId ?? null,
    metricRef: input.metricRef ?? null,
    calibrationPath: input.calibrationPath ?? null,
    missingFields: input.missingFields,
    message: input.message,
  });
}

function mismatch(input: {
  readonly code: ProvenanceCalibrationIssueCode;
  readonly countryId?: string | null;
  readonly metricRef?: string | null;
  readonly calibrationPath?: string | null;
  readonly message: string;
}): ProvenanceCalibrationIssue {
  return issue({
    severity: 'MISMATCH',
    code: input.code,
    countryId: input.countryId ?? null,
    metricRef: input.metricRef ?? null,
    calibrationPath: input.calibrationPath ?? null,
    missingFields: [],
    message: input.message,
  });
}

function assumptionsMatch(
  field: CountrySeedExactValue,
  quantity: CalibrationQuantity,
): boolean {
  if (field.valueOrigin === 'OBSERVED') {
    return quantity.assumptionRef === null && quantity.changes.length === 0;
  }
  if (field.valueOrigin === 'DESIGN_ASSUMPTION') {
    return (
      field.assumptionRef !== null &&
      field.assumptionRef === quantity.assumptionRef &&
      quantity.changes.every(
        (change) =>
          change.sourceRef === field.sourceRef &&
          change.assumptionRef === field.assumptionRef,
      )
    );
  }
  return false;
}

const FACILITY_METRIC_PATH_SEGMENTS: Readonly<Record<string, string>> =
  Object.freeze({
    FACILITY_INSTALLED_CAPACITY: 'installedCapacity',
    FACILITY_OPERATIONAL_CAPACITY: 'operationalCapacity',
    FACILITY_STAFF_REQUIRED: 'staffRequired',
    FACILITY_STAFF_ASSIGNED: 'staffAssigned',
  });

/**
 * Returns a path only where V27.1 identity fields fully determine one V27.2
 * structural quantity. A domain-compatible value tuple is not an identity.
 */
function verifiedCalibrationPath(field: CountrySeedExactValue): string | null {
  if (
    field.domain !== 'FACILITIES' ||
    field.subjectRef === null ||
    field.counterpartyCountryId !== null
  ) {
    return null;
  }
  const segment = FACILITY_METRIC_PATH_SEGMENTS[field.metricRef];
  return segment === undefined
    ? null
    : `facilities.${field.subjectRef}.${segment}`;
}

function compatibleClassification(
  origin: SeedValueOrigin,
  classification: CalibrationSourceEvidence['classification'],
): boolean {
  return (
    (origin === 'OBSERVED' && classification === 'OBSERVED') ||
    (origin === 'DESIGN_ASSUMPTION' &&
      classification === 'SYNTHETIC_CALIBRATION') ||
    (origin === 'DERIVED' && classification === 'DERIVED')
  );
}

function compareSource(input: {
  readonly field: CountrySeedExactValue;
  readonly provenance: CountrySeedSource | undefined;
  readonly calibration: CalibrationSourceEvidence | undefined;
  readonly countryId: string;
  readonly path: string;
}): ProvenanceCalibrationIssue | ProvenanceCalibrationSourceLink {
  if (input.provenance === undefined || input.calibration === undefined) {
    return unavailable({
      code: 'CALIBRATION_QUANTITY_UNAVAILABLE',
      countryId: input.countryId,
      metricRef: input.field.metricRef,
      calibrationPath: input.path,
      missingFields: [
        input.provenance === undefined
          ? 'provenance.source'
          : 'calibration.source',
      ],
      message: 'An exact value source record is unavailable',
    });
  }
  if (
    input.provenance.sourceRef !== input.calibration.sourceRef ||
    input.provenance.locator !== input.calibration.locator ||
    input.provenance.sourceVersion !== input.calibration.sourceVersion ||
    `sha256:${input.provenance.contentSha256}` !==
      input.calibration.contentHash ||
    !compatibleClassification(
      input.field.valueOrigin,
      input.calibration.classification,
    )
  ) {
    return mismatch({
      code: 'SOURCE_EVIDENCE_MISMATCH',
      countryId: input.countryId,
      metricRef: input.field.metricRef,
      calibrationPath: input.path,
      message:
        'Shared source identity, locator, version, digest or classification differs',
    });
  }
  return Object.freeze({
    sourceRef: input.provenance.sourceRef,
    provenanceKind: input.provenance.sourceKind,
    calibrationClassification: input.calibration.classification,
    locator: input.provenance.locator,
    sourceVersion: input.provenance.sourceVersion,
    contentSha256: input.provenance.contentSha256,
    periodRef: input.provenance.periodRef,
    geographyRef: input.provenance.geographyRef,
  });
}

function isIssue(
  value: ProvenanceCalibrationIssue | ProvenanceCalibrationSourceLink,
): value is ProvenanceCalibrationIssue {
  return 'severity' in value;
}

function fieldUnavailable(
  countryId: string,
  field: CountrySeedField,
): ProvenanceCalibrationIssue {
  if (field.status === 'LEGACY_INDEX_ONLY') {
    return unavailable({
      code: 'LEGACY_INDEX_QUARANTINED',
      countryId,
      metricRef: field.metricRef,
      missingFields: ['calibration.measuredValue'],
      message: 'A quarantined legacy index has no measured calibration value',
    });
  }
  return unavailable({
    code: 'PROVENANCE_VALUE_UNAVAILABLE',
    countryId,
    metricRef: field.metricRef,
    missingFields: ['provenance.amount', 'provenance.sourceRef'],
    message: `Provenance field is explicitly ${field.status}`,
  });
}

function issueKey(value: ProvenanceCalibrationIssue): string {
  return canonicalSerialize([
    value.severity,
    value.code,
    value.countryId,
    value.metricRef,
    value.calibrationPath,
    value.missingFields,
    value.message,
  ]);
}

function linkKey(value: ProvenanceCalibrationValueLink): string {
  return canonicalSerialize([
    value.countryId,
    value.domain,
    value.metricRef,
    value.subjectRef,
    value.counterpartyCountryId,
    value.calibrationPath,
  ]);
}

function result(input: {
  readonly provenance: CountrySeedProvenancePreparation;
  readonly links: readonly ProvenanceCalibrationValueLink[];
  readonly issues: readonly ProvenanceCalibrationIssue[];
}): ProvenanceCalibrationAdapterResult {
  const links = Object.freeze(
    [...input.links].sort((a, b) => compare(linkKey(a), linkKey(b))),
  );
  const issues = Object.freeze(
    [...input.issues].sort((a, b) => compare(issueKey(a), issueKey(b))),
  );
  const status: ProvenanceCalibrationLinkStatus = issues.some(
    (entry) => entry.severity === 'MISMATCH',
  )
    ? 'MISMATCH'
    : issues.length > 0
      ? 'UNAVAILABLE'
      : 'AVAILABLE';
  const body = Object.freeze({
    preparationStatus: V27_PROVENANCE_CALIBRATION_ADAPTER_STATUS,
    status,
    generationAuthorized: false as const,
    worldId: input.provenance.worldId,
    seasonRef: input.provenance.seasonRef,
    countryCount: String(input.provenance.configuredCountryIds.length),
    links,
    issues,
  });
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}

/**
 * Connects two independently validated preparation schemas without guessing a
 * metric identity or authorizing opening-state generation.
 */
export function connectCountrySeedProvenanceToCalibration(input: {
  readonly provenance: CountrySeedProvenancePreparation;
  readonly calibration: unknown;
  readonly sha256Hex: Sha256Hex;
}): ProvenanceCalibrationAdapterResult {
  const provenance = revalidateProvenance(input.provenance);
  const calibration = validateV27_2CalibrationPreparation(
    input.calibration,
    input.sha256Hex,
  );
  if (calibration.status === 'PREPARATION_INCOMPLETE') {
    return result({
      provenance,
      links: [],
      issues: [
        unavailable({
          code: 'CALIBRATION_INPUT_INCOMPLETE',
          missingFields: ['calibration.candidate'],
          message: calibration.issues.join('; '),
        }),
      ],
    });
  }

  const issues: ProvenanceCalibrationIssue[] = [];
  const links: ProvenanceCalibrationValueLink[] = [];
  const provenanceCountries = new Set(provenance.configuredCountryIds);
  const calibrationCountries = new Set(
    calibration.candidate.countries.map((country) => country.countryId),
  );
  const missingFromCalibration = [...provenanceCountries].filter(
    (countryId) => !calibrationCountries.has(countryId),
  );
  const missingFromProvenance = [...calibrationCountries].filter(
    (countryId) => !provenanceCountries.has(countryId),
  );
  if (missingFromCalibration.length > 0 || missingFromProvenance.length > 0) {
    issues.push(
      mismatch({
        code: 'COUNTRY_SET_MISMATCH',
        message: `Country identity sets differ; calibration missing [${missingFromCalibration.sort(compare).join(',')}], provenance missing [${missingFromProvenance.sort(compare).join(',')}]`,
      }),
    );
  }
  issues.push(
    unavailable({
      code: 'WORLD_CONFIGURATION_BINDING_UNAVAILABLE',
      missingFields: [
        'calibration.worldId',
        'calibration.countryConfigurationRef',
      ],
      message:
        'V27.2 input has no World/configuration binding; seasonRef remains audit metadata and cannot select different economics',
    }),
  );

  const quantities = flattenCalibration(calibration.candidate);
  const usedPaths = new Set<string>();
  const provenanceSources = new Map(
    provenance.sources.map((source) => [source.sourceRef, source] as const),
  );
  const calibrationSources = new Map(
    calibration.candidate.sources.map(
      (source) => [source.sourceRef, source] as const,
    ),
  );

  for (const country of provenance.countries) {
    for (const field of country.fields) {
      if (field.status !== 'VALUE') {
        issues.push(fieldUnavailable(country.countryId, field));
        continue;
      }
      if (field.valueOrigin === 'DERIVED') {
        issues.push(
          unavailable({
            code: 'CALIBRATION_DERIVATION_FIELD_MISSING',
            countryId: country.countryId,
            metricRef: field.metricRef,
            missingFields: ['calibration.derivationRef'],
            message:
              'V27.2 quantity has change assumptions but no field equivalent to V27.1 derivationRef',
          }),
        );
        continue;
      }
      const expectedPath = verifiedCalibrationPath(field);
      if (expectedPath === null) {
        issues.push(
          unavailable({
            code: 'CALIBRATION_METRIC_IDENTITY_MISSING',
            countryId: country.countryId,
            metricRef: field.metricRef,
            missingFields: [
              'calibration.metricRef',
              'calibration.structuralPathBinding',
            ],
            message:
              'V27.1 metricRef/subjectRef/counterparty cannot be verified against one V27.2 structural path',
          }),
        );
        continue;
      }
      const matches = quantities.filter(
        (candidate) =>
          candidate.countryId === country.countryId &&
          candidate.path === expectedPath &&
          candidate.quantity.sourceRef === field.sourceRef &&
          candidate.quantity.unit === field.unit &&
          candidate.quantity.amount === field.amount &&
          assumptionsMatch(field, candidate.quantity),
      );
      if (matches.length === 0) {
        issues.push(
          unavailable({
            code: 'CALIBRATION_QUANTITY_UNAVAILABLE',
            countryId: country.countryId,
            metricRef: field.metricRef,
            missingFields: ['calibration.metricRef', 'calibration.quantity'],
            message:
              'No V27.2 quantity has the exact country/source/unit/amount/assumption tuple',
          }),
        );
        continue;
      }
      if (matches.length > 1) {
        issues.push(
          unavailable({
            code: 'CALIBRATION_METRIC_IDENTITY_MISSING',
            countryId: country.countryId,
            metricRef: field.metricRef,
            missingFields: ['calibration.metricRef'],
            message: `Exact tuple is ambiguous across ${matches.length} V27.2 structural paths`,
          }),
        );
        continue;
      }
      const match = matches[0]!;
      const claimedPath = `${match.countryId}\u0000${match.path}`;
      if (usedPaths.has(claimedPath)) {
        issues.push(
          unavailable({
            code: 'CALIBRATION_METRIC_IDENTITY_MISSING',
            countryId: country.countryId,
            metricRef: field.metricRef,
            calibrationPath: match.path,
            missingFields: ['provenance.uniqueCalibrationPathBinding'],
            message:
              'V27.2 structural path is already claimed by another V27.1 field',
          }),
        );
        continue;
      }
      const source = compareSource({
        field,
        provenance: provenanceSources.get(field.sourceRef),
        calibration: calibrationSources.get(match.quantity.sourceRef),
        countryId: country.countryId,
        path: match.path,
      });
      if (isIssue(source)) {
        issues.push(source);
        continue;
      }
      usedPaths.add(claimedPath);
      links.push(
        Object.freeze({
          countryId: country.countryId,
          domain: field.domain,
          metricRef: field.metricRef,
          subjectRef: field.subjectRef,
          counterpartyCountryId: field.counterpartyCountryId,
          calibrationPath: match.path,
          source,
          unit: field.unit,
          provenanceAmount: field.amount,
          originalCalibrationAmount:
            match.quantity.changes[0]?.before ?? match.quantity.amount,
          finalCalibrationAmount: match.quantity.amount,
          valueOrigin: field.valueOrigin,
          assumptionRef: field.assumptionRef,
          derivationRef: field.derivationRef,
          changes: Object.freeze([...match.quantity.changes]),
        }),
      );
    }
  }

  for (const quantity of quantities) {
    const key = `${quantity.countryId}\u0000${quantity.path}`;
    if (!usedPaths.has(key)) {
      issues.push(
        unavailable({
          code: 'PROVENANCE_METRIC_UNAVAILABLE',
          countryId: quantity.countryId,
          calibrationPath: quantity.path,
          missingFields: ['provenance.metricRef'],
          message:
            'V27.2 quantity has no unique exact V27.1 metric provenance link',
        }),
      );
    }
  }
  return result({ provenance, links, issues });
}
