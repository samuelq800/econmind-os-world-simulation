import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  V10_DATA_HANDOFF_READINESS_CONTRACT_CANONICAL_HASH,
  createV10DataHandoffReadinessAssessment,
  createVerifiedV10DataHandoffPolicyBundle,
  rejectV10RuntimeCountrySeedExport,
  requireV10DataHandoffCandidateAdmission,
  sha256Bytes,
  sha256Canonical,
  validateV101TestTwoCountryFixtureDescriptor,
  verifyV10DataHandoffReadinessAssessment,
  type V10DataHandoffPolicyInputBytes,
  type V10ClosureEvidenceInput,
  type VerifiedV10DataHandoffReadinessAssessment,
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

async function loadInputs(): Promise<V10DataHandoffPolicyInputBytes> {
  const [policyContract, diagnosticsExecutionContract, diagnosticsPack] =
    await Promise.all([
      readBytes(
        'data/calibration/preflight/v10_data_handoff_readiness_contract.v1.json',
      ),
      readBytes(
        'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
      ),
      readBytes('data/calibration/preflight/c4_gate_diagnostics.v1.json'),
    ]);
  return { policyContract, diagnosticsExecutionContract, diagnosticsPack };
}

function mutate(bytes: Uint8Array): Uint8Array {
  const altered = new Uint8Array(bytes);
  altered[0] = altered[0] === 123 ? 91 : 123;
  return altered;
}

function testFixtureDescriptor(): Record<string, unknown> {
  const body = {
    schemaVersion: 'v10.1-test-two-country-fixture.v1',
    fixtureId: 'v10.1-interface-test-only',
    status: 'TEST_ONLY_NON_AUTHORITATIVE',
    countryCount: 2,
    calibrationReadinessRequired: false,
    usesCalibrationCountryValues: false,
    runtimeAuthority: false,
    finalCountryData: false,
    projectionImplementationPresent: false,
    countries: [
      {
        testCountryId: 'test:country:alpha',
        dataClass: 'PLACEHOLDER',
        featureValues: [],
      },
      {
        testCountryId: 'test:country:beta',
        dataClass: 'PLACEHOLDER',
        featureValues: [],
      },
    ],
  };
  return { ...body, contentHash: sha256Canonical(body) };
}

function testClosureEvidence(
  index: number,
  gateId: string,
  requirementId: string,
  evidenceKind:
    'OWNER_DECISION' | 'NEW_SOURCE_OR_CREDENTIAL' | 'GOVERNANCE_AUTHORIZATION',
): V10ClosureEvidenceInput {
  const artifactPath = `test/evidence/${index}.json`;
  const artifact = new TextEncoder().encode(`test-only-evidence-${index}`);
  const reviewerRole =
    evidenceKind === 'OWNER_DECISION'
      ? 'OWNER'
      : evidenceKind === 'GOVERNANCE_AUTHORIZATION'
        ? 'GOVERNANCE_REVIEWER'
        : 'INDEPENDENT_REVIEWER';
  const body = {
    schemaVersion: 'v10-gate-closure-evidence.v1',
    evidenceId: `test-only-evidence-${index}`,
    gateId,
    requirementId,
    evidenceKind,
    status: 'CLOSURE_EVIDENCE_CANDIDATE',
    decision: 'APPROVED',
    authority: {
      reviewerId: 'test-fixture-reviewer',
      reviewerRole,
      independentReview: true,
      selfCreatedImplementationReport: false,
      reviewedTargetCommit: index.toString(16).padStart(40, '0'),
      evidenceCommit: (index + 20).toString(16).padStart(40, '0'),
    },
    artifactBindings: [
      { path: artifactPath, rawSha256: sha256Bytes(artifact) },
    ],
    sourceEvidence: {
      credentialStoredInRepository: false,
      sourceSnapshotIds:
        evidenceKind === 'NEW_SOURCE_OR_CREDENTIAL'
          ? [`test:snapshot:${index}`]
          : [],
    },
  };
  return {
    document: new TextEncoder().encode(
      JSON.stringify({ ...body, contentHash: sha256Canonical(body) }),
    ),
    artifacts: [{ path: artifactPath, bytes: artifact }],
  };
}

describe('V10 calibration data-handoff readiness', () => {
  it('compresses all seven open gates and eight unique requirements without granting authority', async () => {
    const assessment = createV10DataHandoffReadinessAssessment(
      createVerifiedV10DataHandoffPolicyBundle(await loadInputs()),
    );
    expect(assessment.gates).toHaveLength(7);
    expect(assessment.summary).toEqual({
      closedGateCount: 0,
      openGateCount: 7,
      openGateIds: assessment.gates.map(({ gateId }) => gateId),
      dataHandoffCandidateReady: false,
      runtimeCountrySeedExportAuthorized: false,
      v10Status: 'PLANNED',
    });
    expect(
      new Set(
        assessment.gates.flatMap(
          ({ requiredEvidenceIds }) => requiredEvidenceIds,
        ),
      ).size,
    ).toBe(8);
    expect(
      assessment.gates.every(
        ({ computedStatus, satisfiedComputableEvidenceIds }) =>
          computedStatus === 'OPEN' &&
          satisfiedComputableEvidenceIds.length > 0,
      ),
    ).toBe(true);
    expect(assessment.closureEvidenceBindings).toEqual([]);
    expect(assessment.v10_1Interface).toEqual({
      status: 'INTERFACE_ONLY_NOT_EXECUTED',
      calibrationGateDependency: false,
      usesCalibrationCountryValues: false,
      twoCountryFixtureInstancePresent: false,
      countryValuesPresent: false,
      runtimeProjectionImplemented: false,
    });
    const { contentHash, ...body } = assessment;
    expect(contentHash).toBe(sha256Canonical(body));
  });

  it('matches and verifies the committed current assessment', async () => {
    const bundle = createVerifiedV10DataHandoffPolicyBundle(await loadInputs());
    const verified = verifyV10DataHandoffReadinessAssessment(
      bundle,
      await readBytes(
        'data/calibration/preflight/v10_data_handoff_readiness.v1.json',
      ),
    );
    expect(verified).toEqual({
      kind: 'VERIFIED_V10_DATA_HANDOFF_READINESS_ASSESSMENT',
    });
    expect(() => requireV10DataHandoffCandidateAdmission(verified)).toThrow(
      /^V10_DATA_HANDOFF_NOT_READY:/u,
    );
  });

  it('rejects policy, input, assessment, and verified-brand forgery', async () => {
    const inputs = await loadInputs();
    expect(() =>
      createVerifiedV10DataHandoffPolicyBundle({
        ...inputs,
        policyContract: mutate(inputs.policyContract),
      }),
    ).toThrow('V10_READINESS_JSON_PARSE_FAILED');
    expect(() =>
      createVerifiedV10DataHandoffPolicyBundle({
        ...inputs,
        diagnosticsPack: mutate(inputs.diagnosticsPack),
      }),
    ).toThrow(
      'V10_READINESS_RAW_HASH_MISMATCH:data/calibration/preflight/c4_gate_diagnostics.v1.json',
    );
    const bundle = createVerifiedV10DataHandoffPolicyBundle(inputs);
    const assessmentBytes = await readBytes(
      'data/calibration/preflight/v10_data_handoff_readiness.v1.json',
    );
    expect(() =>
      verifyV10DataHandoffReadinessAssessment(bundle, mutate(assessmentBytes)),
    ).toThrow('V10_READINESS_JSON_PARSE_FAILED');
    const forged = {
      kind: 'VERIFIED_V10_DATA_HANDOFF_READINESS_ASSESSMENT',
    } as VerifiedV10DataHandoffReadinessAssessment;
    expect(() => requireV10DataHandoffCandidateAdmission(forged)).toThrow(
      'V10_READINESS_UNVERIFIED_ASSESSMENT',
    );
  });

  it('rejects self-created or unbound gate-closure claims', async () => {
    const bundle = createVerifiedV10DataHandoffPolicyBundle(await loadInputs());
    const artifact = new TextEncoder().encode('owner decision candidate');
    const body = {
      schemaVersion: 'v10-gate-closure-evidence.v1',
      evidenceId: 'test-self-created-claim',
      gateId: 'MISSING_VALUE_POLICY_FOR_ARCHETYPE_FEATURES_UNAPPROVED',
      requirementId: 'OWNER_MISSINGNESS_POLICY',
      evidenceKind: 'OWNER_DECISION',
      status: 'CLOSURE_EVIDENCE_CANDIDATE',
      decision: 'APPROVED',
      authority: {
        reviewerId: 'test-only',
        reviewerRole: 'OWNER',
        independentReview: true,
        selfCreatedImplementationReport: true,
        reviewedTargetCommit: '1'.repeat(40),
        evidenceCommit: '2'.repeat(40),
      },
      artifactBindings: [
        { path: 'test/decision.json', rawSha256: '0'.repeat(64) },
      ],
      sourceEvidence: {
        credentialStoredInRepository: false,
        sourceSnapshotIds: [],
      },
    };
    const document = new TextEncoder().encode(
      JSON.stringify({ ...body, contentHash: sha256Canonical(body) }),
    );
    expect(() =>
      createV10DataHandoffReadinessAssessment(bundle, [
        {
          document,
          artifacts: [{ path: 'test/decision.json', bytes: artifact }],
        },
      ]),
    ).toThrow('V10_READINESS_INVALID_CLOSURE_EVIDENCE');
  });

  it('can consume only future byte-bound evidence without changing the pipeline', async () => {
    const requirements = [
      [
        'MISSING_VALUE_POLICY_FOR_ARCHETYPE_FEATURES_UNAPPROVED',
        'OWNER_MISSINGNESS_POLICY',
        'OWNER_DECISION',
      ],
      [
        'ARCHETYPE_METHOD_AND_COUNT_UNSELECTED',
        'OWNER_ARCHETYPE_METHOD_COUNT_LABELS_FEATURE_SET',
        'OWNER_DECISION',
      ],
      [
        'FICTIONAL_COUNTRY_MAPPING_NOT_AUTHORIZED',
        'GOVERNANCE_FICTIONAL_MAPPING_AUTHORIZATION',
        'GOVERNANCE_AUTHORIZATION',
      ],
      [
        'WTO_TARIFF_EVIDENCE_ABSENT',
        'SOURCE_WTO_TARIFF_FROZEN_REVIEWED',
        'NEW_SOURCE_OR_CREDENTIAL',
      ],
      [
        'VINTAGE_STABILITY_NOT_ESTABLISHED',
        'SOURCE_REPEATED_EQUIVALENT_QUERY_SNAPSHOTS',
        'NEW_SOURCE_OR_CREDENTIAL',
      ],
      [
        'SECTOR_TAXONOMY_AND_TRADE_RECONCILIATION_UNREVIEWED',
        'OWNER_SECTOR_TAXONOMY_AND_MIRROR_POLICY',
        'OWNER_DECISION',
      ],
      [
        'SECTOR_TAXONOMY_AND_TRADE_RECONCILIATION_UNREVIEWED',
        'SOURCE_EXHAUSTIVE_SECTOR_TOTAL_EVIDENCE',
        'NEW_SOURCE_OR_CREDENTIAL',
      ],
      [
        'FINAL_CALIBRATION_AND_RUNTIME_HANDOFF_BLOCKED',
        'GOVERNANCE_FINAL_DATA_HANDOFF_AUTHORIZATION',
        'GOVERNANCE_AUTHORIZATION',
      ],
    ] as const;
    const bundle = createVerifiedV10DataHandoffPolicyBundle(await loadInputs());
    const assessment = createV10DataHandoffReadinessAssessment(
      bundle,
      requirements.map(([gateId, requirementId, kind], index) =>
        testClosureEvidence(index + 1, gateId, requirementId, kind),
      ),
    );
    expect(assessment.summary).toMatchObject({
      closedGateCount: 7,
      openGateCount: 0,
      dataHandoffCandidateReady: true,
      runtimeCountrySeedExportAuthorized: false,
      v10Status: 'PLANNED',
    });
    expect(assessment.v10_1Interface.calibrationGateDependency).toBe(false);
  });

  it('keeps runtime export categorically outside calibration scope', () => {
    expect(() => rejectV10RuntimeCountrySeedExport()).toThrow(
      'V10_RUNTIME_COUNTRY_SEED_EXPORT_OUT_OF_CALIBRATION_SCOPE',
    );
  });

  it('validates an independent test-only two-country placeholder interface', () => {
    const descriptor = testFixtureDescriptor();
    expect(validateV101TestTwoCountryFixtureDescriptor(descriptor)).toEqual(
      descriptor,
    );
    expect(() =>
      validateV101TestTwoCountryFixtureDescriptor({
        ...descriptor,
        calibrationReadinessRequired: true,
      }),
    ).toThrow('V10_1_TEST_FIXTURE_DESCRIPTOR_BOUNDARY_MISMATCH');
    const countries = descriptor['countries'] as Record<string, unknown>[];
    expect(() =>
      validateV101TestTwoCountryFixtureDescriptor({
        ...descriptor,
        countries: [
          { ...countries[0], featureValues: [{ value: 1 }] },
          countries[1],
        ],
      }),
    ).toThrow('V10_1_TEST_FIXTURE_DESCRIPTOR_BOUNDARY_MISMATCH');
  });

  it('publishes four closed schemas and keeps implementation imports local', async () => {
    const [contractSchema, assessmentSchema, closureSchema, fixtureSchema] =
      await Promise.all([
        readJson(
          'data/calibration/schemas/v10_data_handoff_readiness_contract.schema.json',
        ),
        readJson(
          'data/calibration/schemas/v10_data_handoff_readiness.schema.json',
        ),
        readJson(
          'data/calibration/schemas/v10_gate_closure_evidence.schema.json',
        ),
        readJson(
          'data/calibration/schemas/v10_1_test_two_country_fixture.schema.json',
        ),
      ]);
    for (const schema of [
      contractSchema,
      assessmentSchema,
      closureSchema,
      fixtureSchema,
    ]) {
      expect(schema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }
    const source = await readFile(
      path.join(root, 'packages/calibration/src/v10-readiness.ts'),
      'utf8',
    );
    expect(source.match(/^import /gmu)).toHaveLength(1);
    expect(source).toContain("from './canonical.js';");
    expect(source).not.toMatch(
      /fetch\(|@supabase|world-worker|packages\/core/u,
    );
    expect(V10_DATA_HANDOFF_READINESS_CONTRACT_CANONICAL_HASH).toMatch(
      /^[0-9a-f]{64}$/u,
    );
  });

  it('snapshots caller policy bytes exactly once', async () => {
    const inputs = await loadInputs();
    let reads = 0;
    const swapped: V10DataHandoffPolicyInputBytes = {
      ...inputs,
      get diagnosticsPack(): Uint8Array {
        reads += 1;
        return reads === 1
          ? inputs.diagnosticsPack
          : mutate(inputs.diagnosticsPack);
      },
    };
    createVerifiedV10DataHandoffPolicyBundle(swapped);
    expect(reads).toBe(1);
  });
});
