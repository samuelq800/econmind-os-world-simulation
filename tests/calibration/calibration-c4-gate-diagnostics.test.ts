import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  C4_GATE_DIAGNOSTICS_CONTRACT_CANONICAL_HASH,
  createC4GateDiagnosticsPack,
  createVerifiedC4GateDiagnosticsInputBundle,
  sha256Canonical,
  type C4GateDiagnosticsInputBytes,
  type VerifiedC4GateDiagnosticsInputBundle,
} from '../../packages/calibration/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

async function readBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(root, relativePath)));
}

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function loadInputs(): Promise<C4GateDiagnosticsInputBytes> {
  const [
    executionContract,
    featureAdmissionExecutionContract,
    featureAdmissionEvidence,
    c4Preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
    variableRegistry,
  ] = await Promise.all([
    readBytes(
      'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
    ),
    readBytes(
      'data/calibration/preflight/c4_feature_admission_execution_contract.v1.json',
    ),
    readBytes(
      'data/calibration/preflight/c4_feature_admission_evidence.v1.json',
    ),
    readBytes('data/calibration/preflight/c4_generation_preflight.v1.json'),
    readBytes('data/calibration/exploration/c3_execution_contract.v1.json'),
    readBytes('data/calibration/exploration/c3_exploration_summary.v1.json'),
    readBytes('data/calibration/exploration/c3_uncertainty_register.v1.json'),
    readBytes('data/calibration/exploration/c3_exploration_manifest.v1.json'),
    readBytes('data/calibration/pilot/normalized_observations.v1.json'),
    readBytes('data/calibration/pilot/quality_diagnostics.v1.json'),
    readBytes('data/calibration/pilot/snapshot_manifest.v1.json'),
    readBytes('data/calibration/pilot/pilot_report.v1.json'),
    readBytes('data/calibration/variable_registry.v2.json'),
  ]);
  return {
    executionContract,
    featureAdmissionExecutionContract,
    featureAdmissionEvidence,
    c4Preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
    variableRegistry,
  };
}

function mutate(bytes: Uint8Array): Uint8Array {
  const altered = new Uint8Array(bytes);
  altered[0] = altered[0] === 123 ? 91 : 123;
  return altered;
}

type JsonSchema = Record<string, unknown>;

function schemaTypeMatches(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function resolveSchemaRef(rootSchema: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  let value: unknown = rootSchema;
  for (const token of ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    value = (value as Record<string, unknown>)[token];
  }
  return value as JsonSchema;
}

function validateSchema(
  value: unknown,
  schema: JsonSchema,
  rootSchema: JsonSchema,
  location = '$',
): string[] {
  if (typeof schema['$ref'] === 'string') {
    return validateSchema(
      value,
      resolveSchemaRef(rootSchema, schema['$ref']),
      rootSchema,
      location,
    );
  }
  if (Array.isArray(schema['oneOf'])) {
    const candidates = (schema['oneOf'] as JsonSchema[]).map((candidate) =>
      validateSchema(value, candidate, rootSchema, location),
    );
    return candidates.filter((errors) => errors.length === 0).length === 1
      ? []
      : [`${location}: expected exactly one oneOf match`];
  }
  const errors: string[] = [];
  if (
    Object.hasOwn(schema, 'const') &&
    JSON.stringify(value) !== JSON.stringify(schema['const'])
  ) {
    errors.push(`${location}: const mismatch`);
  }
  if (
    Array.isArray(schema['enum']) &&
    !(schema['enum'] as unknown[]).some(
      (candidate) => JSON.stringify(candidate) === JSON.stringify(value),
    )
  ) {
    errors.push(`${location}: enum mismatch`);
  }
  const expectedTypes = Array.isArray(schema['type'])
    ? (schema['type'] as string[])
    : typeof schema['type'] === 'string'
      ? [schema['type']]
      : [];
  if (
    expectedTypes.length > 0 &&
    !expectedTypes.some((type) => schemaTypeMatches(value, type))
  ) {
    return [...errors, `${location}: type mismatch`];
  }
  if (typeof value === 'string') {
    if (
      typeof schema['minLength'] === 'number' &&
      value.length < schema['minLength']
    ) {
      errors.push(`${location}: string shorter than minLength`);
    }
    if (
      typeof schema['pattern'] === 'string' &&
      !new RegExp(schema['pattern']).test(value)
    ) {
      errors.push(`${location}: pattern mismatch`);
    }
    if (
      schema['format'] === 'date-time' &&
      (!Number.isFinite(Date.parse(value)) || !value.includes('T'))
    ) {
      errors.push(`${location}: invalid date-time`);
    }
  }
  if (
    typeof value === 'number' &&
    typeof schema['minimum'] === 'number' &&
    value < schema['minimum']
  ) {
    errors.push(`${location}: below minimum`);
  }
  if (Array.isArray(value)) {
    if (
      typeof schema['minItems'] === 'number' &&
      value.length < schema['minItems']
    ) {
      errors.push(`${location}: fewer than minItems`);
    }
    if (
      typeof schema['maxItems'] === 'number' &&
      value.length > schema['maxItems']
    ) {
      errors.push(`${location}: more than maxItems`);
    }
    if (
      schema['uniqueItems'] === true &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    ) {
      errors.push(`${location}: duplicate array item`);
    }
    if (typeof schema['items'] === 'object' && schema['items'] !== null) {
      value.forEach((item, index) => {
        errors.push(
          ...validateSchema(
            item,
            schema['items'] as JsonSchema,
            rootSchema,
            `${location}[${index}]`,
          ),
        );
      });
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema['properties'] ?? {}) as Record<
      string,
      JsonSchema
    >;
    for (const key of (schema['required'] ?? []) as string[]) {
      if (!Object.hasOwn(record, key))
        errors.push(`${location}.${key}: missing`);
    }
    if (schema['additionalProperties'] === false) {
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`${location}.${key}: additional property`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(record, key)) {
        errors.push(
          ...validateSchema(
            record[key],
            childSchema,
            rootSchema,
            `${location}.${key}`,
          ),
        );
      }
    }
  }
  return errors;
}

describe('C4 deterministic gate diagnostics pack', () => {
  it('keeps all readiness gates open while completing computable diagnostics', async () => {
    const diagnostics = createC4GateDiagnosticsPack(
      createVerifiedC4GateDiagnosticsInputBundle(await loadInputs()),
    );
    expect(diagnostics.status).toBe('DIAGNOSTICS_ONLY_NON_AUTHORITATIVE');
    expect(diagnostics.finalGeneratorReady).toBe(false);
    expect(diagnostics.readinessGapDisposition).toHaveLength(7);
    expect(
      diagnostics.readinessGapDisposition.every(
        ({ gateStatus }) => gateStatus === 'OPEN',
      ),
    ).toBe(true);
    expect(
      diagnostics.readinessGapDisposition.filter(
        ({ evidenceWorkStatus }) =>
          evidenceWorkStatus === 'COMPUTABLE_DIAGNOSTICS_COMPLETE',
      ),
    ).toHaveLength(2);
    const { contentHash, ...body } = diagnostics;
    expect(contentHash).toBe(sha256Canonical(body));
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });

  it('reports reviewable missingness candidates and variable-level applicability without filling values', async () => {
    const diagnostics = createC4GateDiagnosticsPack(
      createVerifiedC4GateDiagnosticsInputBundle(await loadInputs()),
    );
    expect(diagnostics.missingness.strategySelected).toBe(false);
    expect(diagnostics.missingness.valuesImputed).toBe(false);
    expect(diagnostics.missingness.strategyCandidates).toHaveLength(4);
    expect(diagnostics.missingness.variableApplicability).toHaveLength(19);
    expect(diagnostics.missingness.commonGridDiagnostic).toEqual({
      variableIds: [
        'agriculture_value_added_pct_gdp',
        'manufacturing_value_added_pct_gdp',
        'services_value_added_pct_gdp',
        'unemployment_pct',
      ],
      expectedCellCount: 30,
      completeCellCount: 28,
      excludedCellCount: 2,
      incompleteCells: [
        {
          geographyId: 'emp:USA',
          period: '2022',
          missingVariableIds: [
            'agriculture_value_added_pct_gdp',
            'manufacturing_value_added_pct_gdp',
            'services_value_added_pct_gdp',
          ],
        },
        {
          geographyId: 'emp:USA',
          period: '2023',
          missingVariableIds: [
            'agriculture_value_added_pct_gdp',
            'manufacturing_value_added_pct_gdp',
            'services_value_added_pct_gdp',
          ],
        },
      ],
    });
    const agriculture = diagnostics.missingness.variableApplicability.find(
      ({ variableId }) => variableId === 'agriculture_value_added_pct_gdp',
    );
    expect(agriculture).toMatchObject({
      pilotObservationCount: 30,
      explicitMissingValueCount: 2,
      nonMissingValueCount: 28,
    });
    expect(agriculture?.strategyApplicability.at(-1)).toEqual({
      strategyId: 'OWNER_APPROVED_IMPUTATION',
      status: 'OWNER_DECISION_REQUIRED_EXPLICIT_MISSING_VALUES',
    });
  });

  it('does not mistake years, different queries, or missing source-as-of metadata for vintage stability', async () => {
    const diagnostics = createC4GateDiagnosticsPack(
      createVerifiedC4GateDiagnosticsInputBundle(await loadInputs()),
    );
    expect(diagnostics.vintageStability.comparableSnapshotPairCount).toBe(0);
    expect(diagnostics.vintageStability.stabilityClaimsSupported).toBe(false);
    expect(
      diagnostics.vintageStability.providerDiagnostics.map(
        ({
          sourceId,
          snapshotCount,
          distinctQueryIdentityCount,
          comparableSnapshotPairCount,
          comparisonStatus,
        }) => ({
          sourceId,
          snapshotCount,
          distinctQueryIdentityCount,
          comparableSnapshotPairCount,
          comparisonStatus,
        }),
      ),
    ).toEqual([
      {
        sourceId: 'UN_COMTRADE_V1',
        snapshotCount: 6,
        distinctQueryIdentityCount: 6,
        comparableSnapshotPairCount: 0,
        comparisonStatus: 'NOT_COMPARABLE_DIFFERENT_QUERY_IDENTITIES',
      },
      {
        sourceId: 'WB_WDI_V2',
        snapshotCount: 1,
        distinctQueryIdentityCount: 1,
        comparableSnapshotPairCount: 0,
        comparisonStatus: 'NOT_COMPARABLE_SINGLE_SNAPSHOT',
      },
      {
        sourceId: 'WTO_TIMESERIES_V1',
        snapshotCount: 0,
        distinctQueryIdentityCount: 0,
        comparableSnapshotPairCount: 0,
        comparisonStatus: 'NOT_COMPARABLE_SOURCE_NOT_FETCHED',
      },
    ]);
  });

  it('computes exact sector partial sums while refusing to label them total reconciliation', async () => {
    const diagnostics = createC4GateDiagnosticsPack(
      createVerifiedC4GateDiagnosticsInputBundle(await loadInputs()),
    );
    expect(diagnostics.sectorDiagnostics).toMatchObject({
      availableComponentSetIsExhaustive: false,
      totalReconciliationStatus: 'NOT_RUN_NON_EXHAUSTIVE_COMPONENT_SET',
      evaluatedCellCount: 30,
      computedPartialSumCellCount: 28,
      explicitMissingComponentCellCount: 2,
      minimumResidualPctPoints: '8.894215082633489',
      maximumResidualPctPoints: '28.67604204198554',
      negativeResidualCellCount: 0,
    });
    const incomplete = diagnostics.sectorDiagnostics.cells.filter(
      ({ diagnosticStatus }) =>
        diagnosticStatus === 'NOT_COMPUTED_EXPLICIT_MISSING_COMPONENT',
    );
    expect(incomplete).toHaveLength(2);
    expect(
      incomplete.every(
        ({ availableComponentSumPctGdp, residualToHundredPctPoints }) =>
          availableComponentSumPctGdp.value === null &&
          residualToHundredPctPoints.value === null,
      ),
    ).toBe(true);
    expect(
      diagnostics.sectorDiagnostics.cells.every(({ observedComponents }) =>
        observedComponents.every(({ dataClass }) => dataClass === 'OBSERVED'),
      ),
    ).toBe(true);
  });

  it('reports three exact mirror differences, one duplicate fact, and no reconciliation output', async () => {
    const diagnostics = createC4GateDiagnosticsPack(
      createVerifiedC4GateDiagnosticsInputBundle(await loadInputs()),
    );
    expect(diagnostics.bilateralTradeDiagnostics).toMatchObject({
      reportedFlowDataClass: 'OBSERVED',
      mirrorDifferenceDataClass: 'DERIVED',
      exactDuplicateSourceFactCount: 1,
      distinctMirrorPairCount: 3,
      nonzeroDifferencePairCount: 3,
      unmatchedDistinctFlowCount: 0,
      reconciliationStatus: 'NOT_RUN_NO_AVERAGING_NO_IPF_RAS',
    });
    expect(
      diagnostics.bilateralTradeDiagnostics.pairs.map(
        ({
          exporterId,
          importerId,
          signedDifferenceExportMinusMirrorUsd,
          absoluteDifferenceUsd,
          reportedExport,
        }) => ({
          exporterId,
          importerId,
          signedDifference: signedDifferenceExportMinusMirrorUsd.value,
          absoluteDifference: absoluteDifferenceUsd.value,
          exportFactMultiplicity: reportedExport.sourceFactMultiplicity,
        }),
      ),
    ).toEqual([
      {
        exporterId: 'emp:DEU',
        importerId: 'emp:BRA',
        signedDifference: '-48138945.061',
        absoluteDifference: '48138945.061',
        exportFactMultiplicity: 2,
      },
      {
        exporterId: 'emp:IND',
        importerId: 'emp:ZAF',
        signedDifference: '-14808334.943',
        absoluteDifference: '14808334.943',
        exportFactMultiplicity: 1,
      },
      {
        exporterId: 'emp:USA',
        importerId: 'emp:CHN',
        signedDifference: '-4739833509',
        absoluteDifference: '4739833509',
        exportFactMultiplicity: 1,
      },
    ]);
  });

  it('matches the committed artifact over three short independent local runs', async () => {
    const inputs = await loadInputs();
    const runs = Array.from({ length: 3 }, () =>
      createC4GateDiagnosticsPack(
        createVerifiedC4GateDiagnosticsInputBundle(inputs),
      ),
    );
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
    expect(
      await readJson('data/calibration/preflight/c4_gate_diagnostics.v1.json'),
    ).toEqual(runs[0]);
    expect(runs[0]!.input.contractCanonicalHash).toBe(
      C4_GATE_DIAGNOSTICS_CONTRACT_CANONICAL_HASH,
    );
  });

  it.each([
    [
      'featureAdmissionEvidence',
      'data/calibration/preflight/c4_feature_admission_evidence.v1.json',
    ],
    [
      'normalizedObservations',
      'data/calibration/pilot/normalized_observations.v1.json',
    ],
    ['snapshotManifest', 'data/calibration/pilot/snapshot_manifest.v1.json'],
    [
      'qualityDiagnostics',
      'data/calibration/pilot/quality_diagnostics.v1.json',
    ],
    ['variableRegistry', 'data/calibration/variable_registry.v2.json'],
  ] as const)(
    'rejects altered %s bytes before parsing diagnostics inputs',
    async (field, artifactPath) => {
      const inputs = await loadInputs();
      expect(() =>
        createVerifiedC4GateDiagnosticsInputBundle({
          ...inputs,
          [field]: mutate(inputs[field]),
        }),
      ).toThrow(`C4_DIAGNOSTICS_RAW_HASH_MISMATCH:${artifactPath}`);
    },
  );

  it('rejects a rewritten diagnostics contract even when the edit preserves valid JSON', async () => {
    const inputs = await loadInputs();
    const contract = JSON.parse(
      new TextDecoder('utf8').decode(inputs.executionContract),
    ) as { baseline: { finalGeneratorReady: boolean } };
    contract.baseline.finalGeneratorReady = true;
    expect(() =>
      createVerifiedC4GateDiagnosticsInputBundle({
        ...inputs,
        executionContract: new TextEncoder().encode(JSON.stringify(contract)),
      }),
    ).toThrow('C4_DIAGNOSTICS_EXECUTION_CONTRACT_HASH_MISMATCH');
  });

  it('rejects caller-forged verified bundle brands', () => {
    const forged = Object.freeze({
      kind: 'VERIFIED_C4_GATE_DIAGNOSTICS_INPUT_BUNDLE',
    }) as VerifiedC4GateDiagnosticsInputBundle;
    expect(() => createC4GateDiagnosticsPack(forged)).toThrow(
      'C4_DIAGNOSTICS_UNVERIFIED_INPUT_BUNDLE',
    );
  });

  it('snapshots every caller byte field exactly once', async () => {
    const inputs = await loadInputs();
    let manifestReads = 0;
    const swapped: C4GateDiagnosticsInputBytes = {
      ...inputs,
      get snapshotManifest(): Uint8Array {
        manifestReads += 1;
        return manifestReads === 1
          ? inputs.snapshotManifest
          : mutate(inputs.snapshotManifest);
      },
    };
    const diagnostics = createC4GateDiagnosticsPack(
      createVerifiedC4GateDiagnosticsInputBundle(swapped),
    );
    expect(diagnostics.vintageStability.comparableSnapshotPairCount).toBe(0);
    expect(manifestReads).toBe(1);
  });

  it('validates the committed contract and diagnostics pack against their closed JSON schemas', async () => {
    const [contract, diagnostics, contractSchema, diagnosticsSchema] =
      await Promise.all([
        readJson(
          'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
        ),
        readJson('data/calibration/preflight/c4_gate_diagnostics.v1.json'),
        readJson(
          'data/calibration/schemas/c4_gate_diagnostics_execution_contract.schema.json',
        ),
        readJson('data/calibration/schemas/c4_gate_diagnostics.schema.json'),
      ]);
    expect(
      validateSchema(
        contract,
        contractSchema as JsonSchema,
        contractSchema as JsonSchema,
      ),
    ).toEqual([]);
    expect(
      validateSchema(
        diagnostics,
        diagnosticsSchema as JsonSchema,
        diagnosticsSchema as JsonSchema,
      ),
    ).toEqual([]);
  });

  it('has only local calibration imports and no network call', async () => {
    const source = await readFile(
      path.join(root, 'packages/calibration/src/gate-diagnostics.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(imports).toEqual([
      './canonical.js',
      './decimal.js',
      './feature-admission.js',
      './types.js',
    ]);
    expect(source).not.toMatch(/fetch\s*\(/);
  });
});
