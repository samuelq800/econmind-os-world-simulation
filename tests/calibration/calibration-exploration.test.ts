import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  contractCanonicalHash,
  createC3ExplorationManifest,
  createC3ExplorationSummary,
  createC3UncertaintyRegister,
  sha256Bytes,
  sha256Canonical,
  type C3ExplorationContract,
  type C3UncertaintyEvidence,
  type NormalizedObservation,
} from '../../packages/calibration/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8')) as T;
}

async function loadC3Inputs(): Promise<{
  readonly contract: C3ExplorationContract;
  readonly observations: readonly NormalizedObservation[];
  readonly evidence: C3UncertaintyEvidence;
  readonly input: {
    readonly c2ReviewTargetCommit: string;
    readonly contractCanonicalHash: string;
    readonly artifacts: readonly {
      readonly path: string;
      readonly sha256: string;
    }[];
  };
}> {
  const [contract, normalized, quality, report] = await Promise.all([
    readJson<C3ExplorationContract>(
      'data/calibration/exploration/c3_execution_contract.v1.json',
    ),
    readJson<{ observations: readonly NormalizedObservation[] }>(
      'data/calibration/pilot/normalized_observations.v1.json',
    ),
    readJson<{ diagnostics: readonly { readonly code: string }[] }>(
      'data/calibration/pilot/quality_diagnostics.v1.json',
    ),
    readJson<{
      providerRuns: readonly {
        readonly sourceId: string;
        readonly status: string;
        readonly issues: readonly string[];
      }[];
      revisionVintageObservations: readonly string[];
      providerSpecificCaveats: Readonly<Record<string, string>>;
    }>('data/calibration/pilot/pilot_report.v1.json'),
  ]);
  const artifacts = await Promise.all(
    contract.c2ReviewTarget.inputArtifacts.map(async ({ path: inputPath }) => ({
      path: inputPath,
      sha256: sha256Bytes(await readFile(path.join(root, inputPath))),
    })),
  );
  const counts = new Map<string, number>();
  for (const diagnostic of quality.diagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return {
    contract,
    observations: normalized.observations,
    evidence: {
      diagnosticCounts: [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => ({ code, count })),
      providerRuns: report.providerRuns,
      revisionVintageObservations: report.revisionVintageObservations,
      providerSpecificCaveats: report.providerSpecificCaveats,
    },
    input: {
      c2ReviewTargetCommit: contract.c2ReviewTarget.commit,
      contractCanonicalHash: contractCanonicalHash(contract),
      artifacts,
    },
  };
}

describe('C3 exploratory distribution and coverage diagnostics', () => {
  it('binds every C3 computation to the exact frozen C2 artifacts', async () => {
    const { contract, input } = await loadC3Inputs();
    expect(
      [...input.artifacts].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    ).toEqual(
      [...contract.c2ReviewTarget.inputArtifacts].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    );
    expect(input.c2ReviewTargetCommit).toBe(
      '42adf110c1d8e8f01932b8b9b5f97a1e086d0343',
    );
    expect(input.contractCanonicalHash).toBe(contractCanonicalHash(contract));
    expect(() =>
      createC3ExplorationSummary(
        contract,
        {
          ...input,
          artifacts: input.artifacts.map((artifact, index) =>
            index === 0 ? { ...artifact, sha256: '0'.repeat(64) } : artifact,
          ),
        },
        [],
      ),
    ).toThrow('C3_INPUT_ARTIFACT_HASH_MISMATCH');
  });

  it('emits deterministic exact descriptive summaries without rounding', async () => {
    const { contract, input, observations } = await loadC3Inputs();
    const first = createC3ExplorationSummary(contract, input, observations);
    const second = createC3ExplorationSummary(
      contract,
      { ...input, artifacts: [...input.artifacts].reverse() },
      [...observations].reverse(),
    );
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

  it('rejects duplicate input bindings and forged output artifacts', async () => {
    const { contract, input, observations, evidence } = await loadC3Inputs();
    expect(() =>
      createC3ExplorationSummary(
        contract,
        { ...input, artifacts: [...input.artifacts, input.artifacts[0]!] },
        observations,
      ),
    ).toThrow('C3_DUPLICATE_INPUT_ARTIFACT_PATH');

    const summary = createC3ExplorationSummary(contract, input, observations);
    const uncertainty = createC3UncertaintyRegister(contract, input, evidence);
    expect(() =>
      createC3ExplorationManifest(
        contract,
        input,
        { ...summary, contentHash: '0'.repeat(64) },
        uncertainty,
      ),
    ).toThrow('C3_OUTPUT_CONTENT_HASH_MISMATCH:c3-exploration-summary.v1');
    expect(() =>
      createC3ExplorationManifest(
        contract,
        input,
        {
          ...summary,
          input: {
            ...summary.input,
            c2ReviewTargetCommit: 'f'.repeat(40),
          },
        },
        uncertainty,
      ),
    ).toThrow('C3_OUTPUT_INPUT_MISMATCH:c3-exploration-summary.v1');
  });

  it('keeps sparse trade coverage undefined and handles an exact duplicate explicitly', async () => {
    const { contract, input, observations } = await loadC3Inputs();
    const summary = createC3ExplorationSummary(contract, input, observations);
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

  it('fails rather than silently treating conflicting duplicate IDs as evidence', async () => {
    const { contract, input, observations } = await loadC3Inputs();
    const original = observations.find(
      ({ variableId, value }) =>
        variableId === 'gdp_current_usd' && value !== null,
    );
    expect(original).toBeDefined();
    expect(() =>
      createC3ExplorationSummary(contract, input, [
        ...observations,
        { ...original!, value: '1', rawNumericToken: '1' },
      ]),
    ).toThrow('CONFLICTING_DUPLICATE_OBSERVATION_ID');
  });

  it('preserves the WTO gap, uncertainty limits, and immutable artifact content hashes', async () => {
    const { contract, input, observations, evidence } = await loadC3Inputs();
    const summary = createC3ExplorationSummary(contract, input, observations);
    const uncertainty = createC3UncertaintyRegister(contract, input, evidence);
    const manifest = createC3ExplorationManifest(
      contract,
      input,
      summary,
      uncertainty,
    );
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
    const { contract, input, observations, evidence } = await loadC3Inputs();
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
    const summary = createC3ExplorationSummary(contract, input, observations);
    const uncertainty = createC3UncertaintyRegister(contract, input, evidence);
    expect(committedSummary).toEqual(summary);
    expect(committedUncertainty).toEqual(uncertainty);
    expect(committedManifest).toEqual(
      createC3ExplorationManifest(contract, input, summary, uncertainty),
    );
  });
});
