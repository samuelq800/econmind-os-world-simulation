import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  C3_EXPLORATION_CONTRACT_CANONICAL_HASH,
  createC3ExplorationManifest,
  createC3ExplorationSummary,
  createC3UncertaintyRegister,
  createVerifiedC3FrozenInputBundle,
  sha256Canonical,
  type C3ExplorationContract,
  type C3FrozenInputBytes,
  type C3UncertaintyEvidence,
  type NormalizedObservation,
  type VerifiedC3FrozenInputBundle,
} from '../../packages/calibration/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8')) as T;
}

async function readBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(root, relativePath)));
}

async function loadC3Bytes(): Promise<C3FrozenInputBytes> {
  const [
    executionContract,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
  ] = await Promise.all([
    readBytes('data/calibration/exploration/c3_execution_contract.v1.json'),
    readBytes('data/calibration/pilot/normalized_observations.v1.json'),
    readBytes('data/calibration/pilot/quality_diagnostics.v1.json'),
    readBytes('data/calibration/pilot/snapshot_manifest.v1.json'),
    readBytes('data/calibration/pilot/pilot_report.v1.json'),
  ]);
  return {
    executionContract,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
  };
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(bytes),
  ) as T;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function alteredNonNullObservation(bytes: Uint8Array): Uint8Array {
  const artifact = decodeJson<{
    observations: NormalizedObservation[];
  }>(bytes);
  const index = artifact.observations.findIndex(({ value }) => value !== null);
  if (index < 0) throw new Error('TEST_EXPECTED_NON_NULL_OBSERVATION');
  const original = artifact.observations[index]!;
  artifact.observations[index] = {
    ...original,
    value: '1',
    rawNumericToken: '1',
  };
  return encodeJson(artifact);
}

function erasedDiagnostics(bytes: Uint8Array): Uint8Array {
  const artifact = decodeJson<{
    status: string;
    diagnostics: unknown[];
  }>(bytes);
  artifact.diagnostics = [];
  return encodeJson(artifact);
}

describe('C3 exploratory distribution and coverage diagnostics', () => {
  it('constructs only from raw bytes bound to the fixed C3 and C2 identities', async () => {
    const bytes = await loadC3Bytes();
    const contract = decodeJson<C3ExplorationContract>(bytes.executionContract);
    const bundle = createVerifiedC3FrozenInputBundle(bytes);
    const summary = createC3ExplorationSummary(bundle);

    expect(summary.input.c2ReviewTargetCommit).toBe(
      '42adf110c1d8e8f01932b8b9b5f97a1e086d0343',
    );
    expect(summary.input.contractCanonicalHash).toBe(
      C3_EXPLORATION_CONTRACT_CANONICAL_HASH,
    );
    expect(summary.input.artifacts).toEqual(
      [...contract.c2ReviewTarget.inputArtifacts].sort((left, right) =>
        compareText(left.path, right.path),
      ),
    );

    expect(() =>
      createVerifiedC3FrozenInputBundle({
        ...bytes,
        normalizedObservations: alteredNonNullObservation(
          bytes.normalizedObservations,
        ),
      }),
    ).toThrow(
      'C3_INPUT_ARTIFACT_HASH_MISMATCH:data/calibration/pilot/normalized_observations.v1.json',
    );
    expect(() =>
      createVerifiedC3FrozenInputBundle({
        ...bytes,
        qualityDiagnostics: erasedDiagnostics(bytes.qualityDiagnostics),
      }),
    ).toThrow(
      'C3_INPUT_ARTIFACT_HASH_MISMATCH:data/calibration/pilot/quality_diagnostics.v1.json',
    );

    let normalizedObservationReads = 0;
    const getterSwappedBytes: C3FrozenInputBytes = {
      ...bytes,
      get normalizedObservations(): Uint8Array {
        normalizedObservationReads += 1;
        return normalizedObservationReads === 1
          ? bytes.normalizedObservations
          : alteredNonNullObservation(bytes.normalizedObservations);
      },
    };
    expect(
      createC3ExplorationSummary(
        createVerifiedC3FrozenInputBundle(getterSwappedBytes),
      ),
    ).toEqual(summary);
    expect(normalizedObservationReads).toBe(1);

    const alteredContract = decodeJson<Record<string, unknown>>(
      bytes.executionContract,
    );
    alteredContract['analysisId'] = 'forged-c3-contract';
    expect(() =>
      createVerifiedC3FrozenInputBundle({
        ...bytes,
        executionContract: encodeJson(alteredContract),
      }),
    ).toThrow('C3_EXECUTION_CONTRACT_HASH_MISMATCH');
  });

  it('rejects runtime-forged bundle brands and the superseded caller-supplied-data API', async () => {
    const bytes = await loadC3Bytes();
    const bundle = createVerifiedC3FrozenInputBundle(bytes);
    const forgedBundle = Object.freeze({
      kind: 'VERIFIED_C3_FROZEN_INPUT_BUNDLE',
    }) as unknown as VerifiedC3FrozenInputBundle;
    expect(() => createC3ExplorationSummary(forgedBundle)).toThrow(
      'C3_UNVERIFIED_INPUT_BUNDLE',
    );
    expect(() => createC3UncertaintyRegister(forgedBundle)).toThrow(
      'C3_UNVERIFIED_INPUT_BUNDLE',
    );

    const contract = decodeJson<C3ExplorationContract>(bytes.executionContract);
    const alteredObservations = decodeJson<{
      observations: readonly NormalizedObservation[];
    }>(alteredNonNullObservation(bytes.normalizedObservations)).observations;
    const summary = createC3ExplorationSummary(bundle);
    const legacySummary = createC3ExplorationSummary as unknown as (
      contract: C3ExplorationContract,
      input: unknown,
      observations: readonly NormalizedObservation[],
    ) => unknown;
    expect(() =>
      legacySummary(contract, summary.input, alteredObservations),
    ).toThrow('C3_UNVERIFIED_INPUT_BUNDLE');

    const legacyUncertainty = createC3UncertaintyRegister as unknown as (
      contract: C3ExplorationContract,
      input: unknown,
      evidence: C3UncertaintyEvidence,
    ) => unknown;
    expect(() =>
      legacyUncertainty(contract, summary.input, {
        diagnosticCounts: [],
        providerRuns: [],
        revisionVintageObservations: [],
        providerSpecificCaveats: {},
      }),
    ).toThrow('C3_UNVERIFIED_INPUT_BUNDLE');
  });

  it('rejects forged or cross-bundle output artifacts before manifest construction', async () => {
    const bytes = await loadC3Bytes();
    const bundle = createVerifiedC3FrozenInputBundle(bytes);
    const summary = createC3ExplorationSummary(bundle);
    const uncertainty = createC3UncertaintyRegister(bundle);

    expect(() =>
      createC3ExplorationManifest(bundle, { ...summary }, uncertainty),
    ).toThrow('C3_UNVERIFIED_OUTPUT_ARTIFACT:c3-exploration-summary.v1');
    expect(() =>
      createC3ExplorationManifest(bundle, summary, { ...uncertainty }),
    ).toThrow('C3_UNVERIFIED_OUTPUT_ARTIFACT:c3-uncertainty-register.v1');

    const equivalentBundle = createVerifiedC3FrozenInputBundle(bytes);
    expect(() =>
      createC3ExplorationManifest(
        bundle,
        createC3ExplorationSummary(equivalentBundle),
        uncertainty,
      ),
    ).toThrow('C3_UNVERIFIED_OUTPUT_ARTIFACT:c3-exploration-summary.v1');

    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.variableSummaries)).toBe(true);
    expect(Object.isFrozen(summary.variableSummaries[0]!)).toBe(true);
  });

  it('emits deterministic exact descriptive summaries without rounding', async () => {
    const bundle = createVerifiedC3FrozenInputBundle(await loadC3Bytes());
    const first = createC3ExplorationSummary(bundle);
    const second = createC3ExplorationSummary(bundle);
    expect(first).toEqual(second);
    const agriculture = first.variableSummaries.find(
      ({ variableId }) => variableId === 'agriculture_value_added_pct_gdp',
    );
    expect(agriculture).toMatchObject({
      reportedCellCount: 30,
      explicitMissingValueCount: 2,
      nonMissingValueCount: 28,
      nonMissingValueCoverage: { numerator: 28, denominator: 30 },
      distribution: {
        arithmeticMean: {
          numeratorDecimal: '163.833140210298807',
          denominatorInteger: '28',
          terminatingDecimal: null,
          roundingApplied: false,
        },
      },
    });
    expect(first.status).toBe('EXPLORATORY_NON_AUTHORITATIVE');
    expect(first.transformation.ordering).toBe(
      'VARIABLE_ID_SUMMARIES; DISTRIBUTION_CANONICAL_DECIMAL_ASCENDING_THEN_OBSERVATION_ID; IDENTIFIER_LISTS_CODE_UNIT_ASCENDING',
    );
    const { contentHash, ...withoutHash } = first;
    expect(contentHash).toBe(sha256Canonical(withoutHash));
  });

  it('keeps sparse trade coverage undefined and handles an exact duplicate explicitly', async () => {
    const summary = createC3ExplorationSummary(
      createVerifiedC3FrozenInputBundle(await loadC3Bytes()),
    );
    const exports = summary.variableSummaries.find(
      ({ variableId }) => variableId === 'bilateral_trade_exports_usd',
    );
    expect(exports).toMatchObject({
      sourceFactCount: 4,
      distinctObservationIdCount: 3,
      exactDuplicateFactCount: 1,
      reportedCellCoverage: {
        numerator: 3,
        denominator: null,
        denominatorPolicy: 'NOT_DEFINED_FOR_SPARSE_REQUESTED_SLICE',
      },
    });
    expect(exports?.unreportedExpectedCellCount).toBeNull();
  });

  it('preserves the WTO gap, uncertainty limits, and immutable artifact content hashes', async () => {
    const bundle = createVerifiedC3FrozenInputBundle(await loadC3Bytes());
    const summary = createC3ExplorationSummary(bundle);
    const uncertainty = createC3UncertaintyRegister(bundle);
    const manifest = createC3ExplorationManifest(bundle, summary, uncertainty);
    expect(uncertainty.entries).toContainEqual(
      expect.objectContaining({
        uncertaintyId: 'C2_WTO_PROVIDER_COVERAGE_GAP',
        treatment:
          'RETAIN_WTO_API_KEY_MISSING_DO_NOT_BACKFILL_OR_SYNTHESIZE_TARIFF_OBSERVATIONS',
      }),
    );
    expect(uncertainty.entries).toContainEqual(
      expect.objectContaining({
        uncertaintyId: 'C3_INFERENCE_SCOPE_LIMIT',
        blocks: expect.arrayContaining([
          'ARCHETYPE_ALGORITHM_OR_COUNT_SELECTION',
        ]),
      }),
    );
    expect(
      manifest.artifacts.map(
        ({ canonicalContentHash }) => canonicalContentHash,
      ),
    ).toEqual([summary.contentHash, uncertainty.contentHash]);
  });

  it('matches the committed generated C3 artifacts exactly', async () => {
    const bundle = createVerifiedC3FrozenInputBundle(await loadC3Bytes());
    const [committedSummary, committedUncertainty, committedManifest] =
      await Promise.all([
        readJson('data/calibration/exploration/c3_exploration_summary.v1.json'),
        readJson(
          'data/calibration/exploration/c3_uncertainty_register.v1.json',
        ),
        readJson(
          'data/calibration/exploration/c3_exploration_manifest.v1.json',
        ),
      ]);
    const summary = createC3ExplorationSummary(bundle);
    const uncertainty = createC3UncertaintyRegister(bundle);
    expect(committedSummary).toEqual(summary);
    expect(committedUncertainty).toEqual(uncertainty);
    expect(committedManifest).toEqual(
      createC3ExplorationManifest(bundle, summary, uncertainty),
    );
  });
});
