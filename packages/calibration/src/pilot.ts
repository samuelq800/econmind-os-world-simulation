import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  comtradeAdapter,
  readWdiPagination,
  wdiAdapter,
  wtoAdapter,
} from './adapters.js';
import {
  requireResolvedEntity,
  resolveTradeClassification,
  type EntityConcordance,
  type TradeClassificationConcordance,
} from './concordance.js';
import { normalizeRecord } from './normalize.js';
import {
  diagnoseMirrorAsymmetry,
  diagnoseOutliers,
  diagnoseSourceRecords,
  diagnoseTemporalGaps,
  type OutlierRule,
  type QualityDiagnostic,
} from './quality.js';
import {
  createSnapshotMetadata,
  NodeHttpTransport,
  verifySnapshot,
} from './snapshot.js';
import type {
  NormalizedObservation,
  RawSnapshotMetadata,
  RetrievedPayload,
  SourceAdapter,
  SourceRecord,
  SourceRequest,
} from './types.js';

interface PilotVariable {
  readonly variableId: string;
  readonly indicatorCode: string;
  readonly canonicalUnit: string;
}

interface ComtradePilotRequest {
  readonly pairId: string;
  readonly reporterCode: string;
  readonly partnerCode: string;
  readonly flowCode: 'X' | 'M';
  readonly productCode: string;
}

interface PilotSpec {
  readonly pilotId: string;
  readonly periods: readonly string[];
  readonly wdi: {
    readonly economyCodes: readonly string[];
    readonly variables: readonly PilotVariable[];
  };
  readonly wto: {
    readonly indicatorCode: string;
    readonly reporterCode: string;
    readonly period: string;
  };
  readonly comtrade: {
    readonly period: string;
    readonly requests: readonly ComtradePilotRequest[];
  };
}

interface ProviderRun {
  readonly sourceId: string;
  readonly status: 'FETCHED' | 'PARTIAL' | 'NOT_FETCHED';
  readonly requestCount: number;
  readonly snapshotCount: number;
  readonly observationCount: number;
  readonly issues: readonly string[];
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const calibrationData = path.join(repositoryRoot, 'data/calibration');
const rawDirectory = path.join(calibrationData, 'raw');
const pilotDirectory = path.join(calibrationData, 'pilot');

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(path.join(calibrationData, relativePath), 'utf8'),
  ) as T;
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  await writeFile(
    path.join(calibrationData, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

async function preserveRawSnapshot(
  metadata: RawSnapshotMetadata,
  bytes: Uint8Array,
): Promise<void> {
  await mkdir(rawDirectory, { recursive: true });
  const extension = metadata.fileFormat === 'CSV' ? 'csv' : 'json';
  const target = path.join(rawDirectory, `${metadata.snapshotId}.${extension}`);
  try {
    await writeFile(target, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readFile(target);
    if (!verifySnapshot(metadata, existing)) {
      throw new Error(`IMMUTABLE_SNAPSHOT_COLLISION:${metadata.snapshotId}`, {
        cause: error,
      });
    }
  }
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchPayload(
  request: SourceRequest,
  transport: NodeHttpTransport,
  retry429: boolean,
): Promise<RetrievedPayload> {
  for (let attempt = 0; attempt < (retry429 ? 3 : 1); attempt += 1) {
    const payload = await transport.retrieve(request);
    if (payload.httpStatus !== 429 || attempt === 2) return payload;
    await delay(1_250 * (attempt + 1));
  }
  throw new Error('UNREACHABLE_RETRIEVAL_STATE');
}

async function fetchSnapshot(
  adapter: SourceAdapter,
  request: SourceRequest,
  transport: NodeHttpTransport,
  input: {
    readonly sourceAsOf: string | null;
    readonly providerVersion: string | null;
    readonly requestedDimensions: Readonly<Record<string, readonly string[]>>;
    readonly metadataFromBytes?: (bytes: Uint8Array) => Readonly<{
      sourceAsOf: string | null;
      providerVersion: string | null;
    }>;
  },
  retry429 = false,
): Promise<{
  readonly metadata: RawSnapshotMetadata;
  readonly records: readonly SourceRecord[];
  readonly bytes: Uint8Array;
}> {
  const payload = await fetchPayload(request, transport, retry429);
  if (payload.httpStatus < 200 || payload.httpStatus >= 300) {
    throw new Error(
      `HTTP_RETRIEVAL_FAILED:${payload.httpStatus}:${adapter.sourceId}`,
    );
  }
  const derivedMetadata = input.metadataFromBytes?.(payload.bytes);
  const metadata = createSnapshotMetadata(request, payload, adapter, {
    retrievedAt: new Date().toISOString(),
    sourceAsOf: derivedMetadata?.sourceAsOf ?? input.sourceAsOf,
    providerVersion: derivedMetadata?.providerVersion ?? input.providerVersion,
    requestedDimensions: input.requestedDimensions,
    status: 'DEVELOPMENT_NON_AUTHORITATIVE',
  });
  await preserveRawSnapshot(metadata, payload.bytes);
  return {
    metadata,
    records: adapter.parse(payload.bytes),
    bytes: payload.bytes,
  };
}

function normalizeWdi(
  records: readonly SourceRecord[],
  snapshot: RawSnapshotMetadata,
  variables: readonly PilotVariable[],
  concordance: EntityConcordance,
): readonly NormalizedObservation[] {
  const byIndicator = new Map(
    variables.map((variable) => [variable.indicatorCode, variable]),
  );
  return records.map((record) => {
    const variable = byIndicator.get(record.variableCode);
    if (variable === undefined) {
      throw new Error(`UNREGISTERED_PILOT_INDICATOR:${record.variableCode}`);
    }
    return normalizeRecord(record, snapshot, {
      variableId: variable.variableId,
      canonicalUnit: variable.canonicalUnit,
      acceptedSourceUnit: variable.indicatorCode,
      canonicalEntityId: requireResolvedEntity(
        concordance,
        'WDI_ECONOMY_CODE',
        record.geographyId,
      ),
      transformationId: 'WDI_IDENTITY_DECIMAL',
      transformationVersion: '2.0.0',
    });
  });
}

function normalizeComtrade(
  records: readonly SourceRecord[],
  snapshot: RawSnapshotMetadata,
  entityConcordance: EntityConcordance,
  tradeConcordance: TradeClassificationConcordance,
): readonly NormalizedObservation[] {
  return records.map((record) => {
    const partnerCode = record.attributes['partnerCode'];
    const flowCode = record.attributes['flowCode'];
    const revision = record.attributes['productClassification'];
    const productCode = record.attributes['productCode'];
    if (
      partnerCode === undefined ||
      partnerCode === null ||
      flowCode === undefined ||
      flowCode === null ||
      revision === undefined ||
      revision === null ||
      productCode === undefined ||
      productCode === null
    ) {
      throw new Error(
        `INCOMPLETE_COMTRADE_IDENTITY:${record.sourceObservationKey}`,
      );
    }
    const classification = resolveTradeClassification(
      tradeConcordance,
      'UN_COMTRADE_HS',
      revision,
      productCode,
    );
    if (classification === null) {
      throw new Error(`UNSUPPORTED_CLASSIFICATION:${revision}:${productCode}`);
    }
    const canonicalPartnerEntityId = requireResolvedEntity(
      entityConcordance,
      'COMTRADE_REPORTER_CODE',
      partnerCode,
    );
    const augmentedRecord: SourceRecord = {
      ...record,
      attributes: {
        ...record.attributes,
        canonicalPartnerEntityId,
        calibrationSectorId: classification.calibrationSectorId,
        calibrationSectorMappingVersion:
          tradeConcordance.calibrationSectorMappingVersion,
      },
    };
    return normalizeRecord(augmentedRecord, snapshot, {
      variableId:
        flowCode === 'X'
          ? 'bilateral_trade_exports_usd'
          : 'bilateral_trade_imports_usd',
      canonicalUnit: 'USD',
      acceptedSourceUnit: 'USD',
      canonicalEntityId: requireResolvedEntity(
        entityConcordance,
        'COMTRADE_REPORTER_CODE',
        record.geographyId,
      ),
      transformationId: 'COMTRADE_IDENTITY_DECIMAL',
      transformationVersion: '2.0.0',
    });
  });
}

function summarizeDiagnostics(
  diagnostics: readonly QualityDiagnostic[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

async function run(): Promise<void> {
  await mkdir(pilotDirectory, { recursive: true });
  const [spec, entityConcordance, tradeConcordance, outlierFile] =
    await Promise.all([
      readJson<PilotSpec>('pilot/pilot_spec.v1.json'),
      readJson<EntityConcordance>(
        'concordances/source_entity_concordance.v1.json',
      ),
      readJson<TradeClassificationConcordance>(
        'concordances/trade_classification_concordance.v1.json',
      ),
      readJson<{ readonly rules: readonly OutlierRule[] }>(
        'pilot/outlier_rules.v1.json',
      ),
    ]);
  const transport = new NodeHttpTransport();
  const snapshots: RawSnapshotMetadata[] = [];
  const observations: NormalizedObservation[] = [];
  const diagnostics: QualityDiagnostic[] = [];
  const providerRuns: ProviderRun[] = [];
  const exactnessFailures: string[] = [];

  const wdiParameters = {
    economy: spec.wdi.economyCodes.join(';'),
    indicator: spec.wdi.variables
      .map(({ indicatorCode }) => indicatorCode)
      .join(';'),
    date: `${spec.periods[0]}:${spec.periods.at(-1)}`,
    page: '1',
    per_page: '20000',
    source: '2',
  };
  const firstWdi = await fetchSnapshot(
    wdiAdapter,
    wdiAdapter.buildRequest(wdiParameters),
    transport,
    {
      sourceAsOf: null,
      providerVersion: 'WDI_SOURCE_2',
      requestedDimensions: {
        economies: spec.wdi.economyCodes,
        indicators: spec.wdi.variables.map(
          ({ indicatorCode }) => indicatorCode,
        ),
        periods: spec.periods,
      },
      metadataFromBytes: (bytes) => {
        const metadata = readWdiPagination(bytes);
        return {
          sourceAsOf: metadata.lastUpdated,
          providerVersion: `WDI_SOURCE_${metadata.sourceId ?? wdiParameters.source}`,
        };
      },
    },
  );
  const pagination = readWdiPagination(firstWdi.bytes);
  const wdiSourceId = pagination.sourceId ?? wdiParameters.source;
  const wdiPages = [firstWdi];
  for (let page = 2; page <= pagination.pages; page += 1) {
    wdiPages.push(
      await fetchSnapshot(
        wdiAdapter,
        wdiAdapter.buildRequest({ ...wdiParameters, page: String(page) }),
        transport,
        {
          sourceAsOf: pagination.lastUpdated,
          providerVersion: `WDI_SOURCE_${wdiSourceId}`,
          requestedDimensions: {
            economies: spec.wdi.economyCodes,
            indicators: spec.wdi.variables.map(
              ({ indicatorCode }) => indicatorCode,
            ),
            periods: spec.periods,
            pages: [String(page)],
          },
        },
      ),
    );
  }
  for (const page of wdiPages) {
    const metadata = page.metadata;
    snapshots.push(metadata);
    observations.push(
      ...normalizeWdi(
        page.records,
        metadata,
        spec.wdi.variables,
        entityConcordance,
      ),
    );
    diagnostics.push(
      ...diagnoseSourceRecords(page.records, {
        entityConcordance,
        entityNamespace: 'WDI_ECONOMY_CODE',
        expectedUnits: Object.fromEntries(
          spec.wdi.variables.map(({ indicatorCode }) => [
            indicatorCode,
            indicatorCode,
          ]),
        ),
      }),
    );
  }
  providerRuns.push({
    sourceId: wdiAdapter.sourceId,
    status: 'FETCHED',
    requestCount: wdiPages.length,
    snapshotCount: wdiPages.length,
    observationCount: wdiPages.reduce(
      (count, page) => count + page.records.length,
      0,
    ),
    issues: [],
  });

  const wtoKey = process.env['WTO_API_KEY'];
  if (wtoKey === undefined || wtoKey.length === 0) {
    providerRuns.push({
      sourceId: wtoAdapter.sourceId,
      status: 'NOT_FETCHED',
      requestCount: 0,
      snapshotCount: 0,
      observationCount: 0,
      issues: ['WTO_API_KEY_MISSING'],
    });
  } else {
    const wtoTransport = new NodeHttpTransport({
      'Ocp-Apim-Subscription-Key': wtoKey,
      Accept: 'text/csv',
    });
    const request = wtoAdapter.buildRequest({
      indicator: spec.wto.indicatorCode,
      reporter: spec.wto.reporterCode,
      year: spec.wto.period,
    });
    const result = await fetchSnapshot(wtoAdapter, request, wtoTransport, {
      sourceAsOf: null,
      providerVersion: 'WTO_TIMESERIES_V1',
      requestedDimensions: {
        indicators: [spec.wto.indicatorCode],
        reporters: [spec.wto.reporterCode],
        periods: [spec.wto.period],
      },
    });
    snapshots.push(result.metadata);
    observations.push(
      ...result.records.map((record) =>
        normalizeRecord(record, result.metadata, {
          variableId: 'applied_tariff_pct',
          canonicalUnit: 'PERCENT',
          acceptedSourceUnit: 'PERCENT',
          canonicalEntityId: requireResolvedEntity(
            entityConcordance,
            'WTO_MEMBER_ISO3',
            record.geographyId,
          ),
          transformationId: 'WTO_IDENTITY_DECIMAL',
          transformationVersion: '2.0.0',
        }),
      ),
    );
    providerRuns.push({
      sourceId: wtoAdapter.sourceId,
      status: 'FETCHED',
      requestCount: 1,
      snapshotCount: 1,
      observationCount: result.records.length,
      issues: [],
    });
  }

  const comtradeRecords: SourceRecord[] = [];
  let comtradeSnapshotCount = 0;
  const comtradeIssues: string[] = [];
  for (const [index, selection] of spec.comtrade.requests.entries()) {
    if (index > 0) await delay(1_100);
    const request = comtradeAdapter.buildRequest({
      reporterCode: selection.reporterCode,
      partnerCode: selection.partnerCode,
      flowCode: selection.flowCode,
      cmdCode: selection.productCode,
      period: spec.comtrade.period,
    });
    try {
      const result = await fetchSnapshot(
        comtradeAdapter,
        request,
        transport,
        {
          sourceAsOf: null,
          providerVersion: 'UN_COMTRADE_PUBLIC_PREVIEW_V1_HS',
          requestedDimensions: {
            reporters: [selection.reporterCode],
            partners: [selection.partnerCode],
            flows: [selection.flowCode],
            products: [selection.productCode],
            periods: [spec.comtrade.period],
          },
        },
        true,
      );
      snapshots.push(result.metadata);
      comtradeSnapshotCount += 1;
      comtradeRecords.push(...result.records);
      observations.push(
        ...normalizeComtrade(
          result.records,
          result.metadata,
          entityConcordance,
          tradeConcordance,
        ),
      );
      diagnostics.push(
        ...diagnoseSourceRecords(result.records, {
          entityConcordance,
          entityNamespace: 'COMTRADE_REPORTER_CODE',
          expectedUnits: { PRIMARY_VALUE: 'USD' },
          tradeConcordance,
        }),
      );
    } catch (error) {
      const issue = `${selection.pairId}:${String(error)}`;
      comtradeIssues.push(issue);
      if (/LOSSLESS|ROUND|DECIMAL|NUMBER/u.test(issue))
        exactnessFailures.push(issue);
    }
  }
  for (const selection of spec.comtrade.requests.filter(
    ({ flowCode }) => flowCode === 'X',
  )) {
    const exportRecord = comtradeRecords.find(
      (record) =>
        record.geographyId === selection.reporterCode &&
        record.attributes['partnerCode'] === selection.partnerCode &&
        record.attributes['flowCode'] === 'X' &&
        record.attributes['productCode'] === selection.productCode,
    );
    const mirrorRecord = comtradeRecords.find(
      (record) =>
        record.geographyId === selection.partnerCode &&
        record.attributes['partnerCode'] === selection.reporterCode &&
        record.attributes['flowCode'] === 'M' &&
        record.attributes['productCode'] === selection.productCode,
    );
    if (exportRecord !== undefined && mirrorRecord !== undefined) {
      diagnostics.push(diagnoseMirrorAsymmetry(exportRecord, mirrorRecord));
    }
  }
  providerRuns.push({
    sourceId: comtradeAdapter.sourceId,
    status:
      comtradeSnapshotCount === spec.comtrade.requests.length
        ? 'FETCHED'
        : comtradeSnapshotCount === 0
          ? 'NOT_FETCHED'
          : 'PARTIAL',
    requestCount: spec.comtrade.requests.length,
    snapshotCount: comtradeSnapshotCount,
    observationCount: comtradeRecords.length,
    issues: comtradeIssues,
  });

  diagnostics.push(...diagnoseTemporalGaps(observations));
  diagnostics.push(...diagnoseOutliers(observations, outlierFile.rules));
  const sortedObservations = [...observations].sort((a, b) =>
    a.observationId.localeCompare(b.observationId),
  );
  const sortedDiagnostics = [...diagnostics].sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      (a.subjectKeys[0] ?? '').localeCompare(b.subjectKeys[0] ?? ''),
  );
  const generatedAt = new Date().toISOString();
  const diagnosticCounts = summarizeDiagnostics(sortedDiagnostics);
  const diagnosticCount = (code: string): number => diagnosticCounts[code] ?? 0;
  await writeJson('pilot/snapshot_manifest.v1.json', {
    schemaVersion: 'calibration-pilot-snapshot-manifest.v1',
    pilotId: spec.pilotId,
    status: 'PILOT_NON_AUTHORITATIVE_PARTIAL',
    generatedAt,
    rawBytesPolicy: 'GIT_IGNORED_CONTENT_ADDRESSED_FILES',
    rawDirectory: 'data/calibration/raw/',
    providerRuns,
    snapshots,
  });
  await writeJson('pilot/normalized_observations.v1.json', {
    schemaVersion: 'calibration-pilot-observations.v1',
    pilotId: spec.pilotId,
    status: 'PILOT_NON_AUTHORITATIVE_PARTIAL',
    generatedAt,
    sourceSnapshotIds: snapshots.map(({ snapshotId }) => snapshotId).sort(),
    observations: sortedObservations,
  });
  await writeJson('pilot/quality_diagnostics.v1.json', {
    schemaVersion: 'calibration-quality-diagnostics.v1',
    pilotId: spec.pilotId,
    status: 'PILOT_NON_AUTHORITATIVE_PARTIAL',
    generatedAt,
    diagnosticCounts,
    exactnessFailures,
    diagnostics: sortedDiagnostics,
  });
  await writeJson('pilot/pilot_report.v1.json', {
    schemaVersion: 'calibration-pilot-report.v1',
    pilotId: spec.pilotId,
    status: 'PILOT_NON_AUTHORITATIVE_PARTIAL',
    generatedAt,
    sourcesActuallyFetched: providerRuns
      .filter(({ snapshotCount }) => snapshotCount > 0)
      .map(({ sourceId }) => sourceId),
    snapshotIdsAndHashes: snapshots.map(
      ({ snapshotId, sha256, byteLength }) => ({
        snapshotId,
        sha256,
        byteLength,
      }),
    ),
    observationCount: sortedObservations.length,
    uniqueObservationIdCount: new Set(
      sortedObservations.map(({ observationId }) => observationId),
    ).size,
    entityCoverage: [
      ...new Set(sortedObservations.map(({ geographyId }) => geographyId)),
    ].sort(),
    variableCoverage: [
      ...new Set(sortedObservations.map(({ variableId }) => variableId)),
    ].sort(),
    periodCoverage: [
      ...new Set(sortedObservations.map(({ period }) => period)),
    ].sort(),
    missingnessCount: sortedObservations.filter(({ value }) => value === null)
      .length,
    dataQuality: {
      missingObservationCount: diagnosticCount('MISSING_OBSERVATION'),
      duplicateObservationCount: diagnosticCount('DUPLICATE_OBSERVATION'),
      suspiciousDuplicateProviderKeyCount: diagnosticCount(
        'SUSPICIOUS_DUPLICATE_PROVIDER_KEY',
      ),
      unresolvedConcordanceCount: diagnosticCount(
        'UNRESOLVED_ENTITY_CONCORDANCE',
      ),
      ambiguousConcordanceCount: diagnosticCount(
        'AMBIGUOUS_ENTITY_CONCORDANCE',
      ),
      unitMismatchCount: diagnosticCount('UNIT_MISMATCH'),
      temporalGapCount: diagnosticCount('TEMPORAL_GAP'),
      revisionDifferenceCount: diagnosticCount('PROVIDER_REVISION_DIFFERENCE'),
      reportingAsymmetryCount: diagnosticCount('REPORTING_ASYMMETRY'),
      unsupportedClassificationCount: diagnosticCount(
        'UNSUPPORTED_CLASSIFICATION',
      ),
      outlierRuleViolationCount: diagnosticCount('OUTLIER_RULE_VIOLATION'),
    },
    diagnosticCounts,
    exactnessFailures,
    providerRuns,
    revisionVintageObservations: [
      `WDI source 2 last updated ${pagination.lastUpdated}.`,
      'UN Comtrade public-preview responses supplied no provider-vintage field; sourceAsOf is null.',
      'No equivalent query was fetched at two vintages, so live revision comparison was not possible.',
    ],
    providerSpecificCaveats: {
      WB_WDI_V2:
        'The live record-level unit fields were empty; indicator codes were validated against the explicit pilot normalization plan.',
      WTO_TIMESERIES_V1:
        'Authenticated retrieval was not run because WTO_API_KEY was absent.',
      UN_COMTRADE_V1:
        'Public-preview results are limited; reporter exports and mirror imports are separate, and one identical duplicate provider row is retained and flagged.',
    },
    caveats: [
      'This pilot is not final simulation calibration.',
      'WTO remains absent unless an external WTO_API_KEY is supplied at retrieval time.',
      'UN Comtrade public preview responses may be rate-limited or incomplete.',
      'Reporter exports and mirror imports remain separate observed facts.',
      'No IPF, RAS, archetype freeze, fictional-country mapping, or engine mutation was performed.',
    ],
  });
}

await run();
