import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH,
  createC4FeatureAdmissionEvidence,
  createVerifiedC4FeatureAdmissionInputBundle,
  sha256Canonical,
  type C4FeatureAdmissionInputBytes,
  type VerifiedC4FeatureAdmissionInputBundle,
} from '../../packages/calibration/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

async function readBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(root, relativePath)));
}

async function loadInputs(): Promise<C4FeatureAdmissionInputBytes> {
  const [
    executionContract,
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
      'data/calibration/preflight/c4_feature_admission_execution_contract.v1.json',
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

describe('C4 feature-admission evidence gate', () => {
  it('packages frozen evidence without selecting or admitting any feature', async () => {
    const evidence = createC4FeatureAdmissionEvidence(
      createVerifiedC4FeatureAdmissionInputBundle(await loadInputs()),
    );
    expect(evidence.status).toBe('EVIDENCE_ONLY_NON_AUTHORITATIVE');
    expect(evidence.featureSetSelected).toBe(false);
    expect(evidence.finalGeneratorReady).toBe(false);
    expect(evidence.registryCoverage).toEqual({
      registryVersion: '2.1.0',
      frozenPilotVariableCount: 10,
      registeredPilotVariableCount: 10,
      missingVariableIds: [],
    });
    expect(evidence.qualitySummary).toEqual({
      sourceFactCount: 247,
      distinctObservationIdCount: 246,
      exactDuplicateFactCount: 1,
      explicitMissingValueCount: 6,
      reportingAsymmetryCount: 3,
      exactnessFailureCount: 0,
    });
    expect(evidence.candidateSummary).toEqual({
      candidateCount: 19,
      observedCount: 10,
      derivedCount: 3,
      placeholderCount: 6,
      pilotEvidenceCandidateCount: 4,
      noFrozenPilotObservationCount: 15,
      admittedCount: 0,
    });
    expect(
      evidence.features.every(
        ({ admissionStatus }) => admissionStatus === 'NOT_ADMITTED',
      ),
    ).toBe(true);
    expect(evidence.remainingPrerequisites).toHaveLength(7);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.features)).toBe(true);
    const { contentHash, ...body } = evidence;
    expect(contentHash).toBe(sha256Canonical(body));
  });

  it('preserves observed, derived, and placeholder classifications without materializing new values', async () => {
    const evidence = createC4FeatureAdmissionEvidence(
      createVerifiedC4FeatureAdmissionInputBundle(await loadInputs()),
    );
    const agriculture = evidence.features.find(
      ({ variableId }) => variableId === 'agriculture_value_added_pct_gdp',
    );
    expect(agriculture).toMatchObject({
      dataClass: 'OBSERVED',
      evidenceStatus: 'PILOT_EVIDENCE_WITH_CAVEATS',
      pilotEvidence: { sourceFactCount: 30, explicitMissingValueCount: 2 },
      caveatCodes: expect.arrayContaining([
        'EXPLICIT_MISSING_VALUES_PRESENT',
        'PROVIDER_UNIT_METADATA_EMPTY',
      ]),
    });
    const unemployment = evidence.features.find(
      ({ variableId }) => variableId === 'unemployment_pct',
    );
    expect(unemployment?.caveatCodes).toContain(
      'APPROVED_FALLBACK_SOURCE_USED',
    );
    for (const feature of evidence.features.filter(
      ({ dataClass }) => dataClass === 'DERIVED',
    )) {
      expect(feature.materializationStatus).toBe('DERIVATION_NOT_RUN');
      expect(feature.pilotEvidence.sourceFactCount).toBe(0);
    }
    for (const feature of evidence.features.filter(
      ({ dataClass }) => dataClass === 'PLACEHOLDER',
    )) {
      expect(feature.materializationStatus).toBe(
        'PLACEHOLDER_VALUE_NOT_ASSIGNED',
      );
      expect(feature.pilotEvidence.sourceFactCount).toBe(0);
      expect(Object.hasOwn(feature, 'value')).toBe(false);
    }
  });

  it('matches the committed deterministic evidence artifact exactly', async () => {
    const inputs = await loadInputs();
    const first = createC4FeatureAdmissionEvidence(
      createVerifiedC4FeatureAdmissionInputBundle(inputs),
    );
    const second = createC4FeatureAdmissionEvidence(
      createVerifiedC4FeatureAdmissionInputBundle(inputs),
    );
    const committed = JSON.parse(
      await readFile(
        path.join(
          root,
          'data/calibration/preflight/c4_feature_admission_evidence.v1.json',
        ),
        'utf8',
      ),
    );
    expect(first).toEqual(second);
    expect(committed).toEqual(first);
    expect(first.input.contractCanonicalHash).toBe(
      C4_FEATURE_ADMISSION_CONTRACT_CANONICAL_HASH,
    );
  });

  it.each([
    [
      'c4Preflight',
      'data/calibration/preflight/c4_generation_preflight.v1.json',
    ],
    [
      'c3Summary',
      'data/calibration/exploration/c3_exploration_summary.v1.json',
    ],
    [
      'normalizedObservations',
      'data/calibration/pilot/normalized_observations.v1.json',
    ],
    [
      'qualityDiagnostics',
      'data/calibration/pilot/quality_diagnostics.v1.json',
    ],
    ['variableRegistry', 'data/calibration/variable_registry.v2.json'],
  ] as const)(
    'rejects altered %s bytes against the execution contract before parsing',
    async (field, artifactPath) => {
      const inputs = await loadInputs();
      expect(() =>
        createVerifiedC4FeatureAdmissionInputBundle({
          ...inputs,
          [field]: mutate(inputs[field]),
        }),
      ).toThrow(`C4_FEATURE_RAW_HASH_MISMATCH:${artifactPath}`);
    },
  );

  it('rejects a semantically rewritten execution contract even without an external content-hash field', async () => {
    const inputs = await loadInputs();
    const contract = JSON.parse(
      new TextDecoder('utf8').decode(inputs.executionContract),
    ) as { baseline: { finalGeneratorReady: boolean } };
    contract.baseline.finalGeneratorReady = true;
    expect(() =>
      createVerifiedC4FeatureAdmissionInputBundle({
        ...inputs,
        executionContract: new TextEncoder().encode(JSON.stringify(contract)),
      }),
    ).toThrow('C4_FEATURE_EXECUTION_CONTRACT_HASH_MISMATCH');
  });

  it('rejects caller-forged verified-bundle brands', () => {
    const forged = Object.freeze({
      kind: 'VERIFIED_C4_FEATURE_ADMISSION_INPUT_BUNDLE',
    }) as VerifiedC4FeatureAdmissionInputBundle;
    expect(() => createC4FeatureAdmissionEvidence(forged)).toThrow(
      'C4_FEATURE_UNVERIFIED_INPUT_BUNDLE',
    );
  });

  it('snapshots every caller byte field exactly once before verification', async () => {
    const inputs = await loadInputs();
    let registryReads = 0;
    const swapped: C4FeatureAdmissionInputBytes = {
      ...inputs,
      get variableRegistry(): Uint8Array {
        registryReads += 1;
        return registryReads === 1
          ? inputs.variableRegistry
          : mutate(inputs.variableRegistry);
      },
    };
    const evidence = createC4FeatureAdmissionEvidence(
      createVerifiedC4FeatureAdmissionInputBundle(swapped),
    );
    expect(evidence.registryCoverage.registeredPilotVariableCount).toBe(10);
    expect(registryReads).toBe(1);
  });

  it('keeps evidence generation outside World Core, runtime, network, and production surfaces', async () => {
    const source = await readFile(
      path.join(root, 'packages/calibration/src/feature-admission.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(imports).toEqual(['./canonical.js', './preflight.js', './types.js']);
    expect(source).not.toMatch(/fetch\s*\(/);
  });

  it('registers both frozen Comtrade flow IDs with observed trade metadata', async () => {
    const registry = JSON.parse(
      await readFile(
        path.join(root, 'data/calibration/variable_registry.v2.json'),
        'utf8',
      ),
    ) as { variables: Array<Record<string, unknown>> };
    for (const [variableId, flowRule] of [
      ['bilateral_trade_exports_usd', 'flowCode = X'],
      ['bilateral_trade_imports_usd', 'flowCode = M'],
    ]) {
      const variable = registry.variables.find(
        (entry) => entry['variableId'] === variableId,
      );
      expect(variable).toMatchObject({
        canonicalUnit: 'USD',
        dataClass: 'OBSERVED',
        preferredSourceId: 'UN_COMTRADE_V1',
        sourceIndicatorCode: 'PRIMARY_VALUE',
        missingPolicy: 'PRESERVE_NULL',
        calibrationRole: 'TRADE_CALIBRATION',
      });
      expect(variable?.['validityRules']).toContain(flowRule);
    }
  });
});
