import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  C4_GENERATION_PREFLIGHT_CANONICAL_HASH,
  sha256Canonical,
  verifyC4GenerationPreflight,
  type C4GenerationPreflightBytes,
} from '../../packages/calibration/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

async function readBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(root, relativePath)));
}

async function loadC4Bytes(): Promise<C4GenerationPreflightBytes> {
  const [
    preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
  ] = await Promise.all([
    readBytes('data/calibration/preflight/c4_generation_preflight.v1.json'),
    readBytes('data/calibration/exploration/c3_execution_contract.v1.json'),
    readBytes('data/calibration/exploration/c3_exploration_summary.v1.json'),
    readBytes('data/calibration/exploration/c3_uncertainty_register.v1.json'),
    readBytes('data/calibration/exploration/c3_exploration_manifest.v1.json'),
  ]);
  return {
    preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
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

describe('C4 generation preparation preflight', () => {
  it('binds the non-authoritative preflight to exact approved C3 evidence', async () => {
    const preflight = verifyC4GenerationPreflight(await loadC4Bytes());

    expect(preflight.contentHash).toBe(C4_GENERATION_PREFLIGHT_CANONICAL_HASH);
    expect(preflight.status).toBe('PREFLIGHT_ONLY_NON_AUTHORITATIVE');
    expect(preflight.finalGeneratorReady).toBe(false);
    expect(preflight.c3Review).toMatchObject({
      approvedTargetCommit: '77c4fb3083970573ed56cbd280e0e41a8d83e43a',
      historicalChangesRequiredTargetCommit:
        '21c571cd215b89bff20804bf2e38db687b44e55e',
      decision: 'APPROVED_FOR_CONTINUATION',
      closedFindingIds: ['C3-MAJ-01'],
      openBlockerCount: 0,
      openMajorCount: 0,
      scope: 'EXPLORATORY_NON_AUTHORITATIVE_ONLY',
    });
    expect(preflight.prohibitedOutputs).toEqual(
      expect.arrayContaining([
        'ARCHETYPE_ALGORITHM_OR_COUNT_SELECTION',
        'FICTIONAL_COUNTRY_MAPPING',
        'FINAL_70_COUNTRY_PACKAGE',
        'WORLD_CORE_RUNTIME_IMPORT_OR_MUTATION',
      ]),
    );
    expect(Object.isFrozen(preflight)).toBe(true);
    expect(Object.isFrozen(preflight.unmetPrerequisites)).toBe(true);
    expect(Object.isFrozen(preflight.unmetPrerequisites[0]!)).toBe(true);
  });

  it('rejects altered frozen C3 bytes before they can support a preflight', async () => {
    const bytes = await loadC4Bytes();
    const alteredSummary = new Uint8Array(bytes.c3Summary);
    alteredSummary[0] = alteredSummary[0] === 123 ? 91 : 123;

    expect(() =>
      verifyC4GenerationPreflight({ ...bytes, c3Summary: alteredSummary }),
    ).toThrow(
      'C4_C3_RAW_HASH_MISMATCH:data/calibration/exploration/c3_exploration_summary.v1.json',
    );
  });

  it('rejects a semantically rewritten preflight even when its self-hash is recomputed', async () => {
    const bytes = await loadC4Bytes();
    const rewritten = decodeJson<Record<string, unknown>>(bytes.preflight);
    rewritten['finalGeneratorReady'] = true;
    const body = { ...rewritten };
    delete body['contentHash'];
    rewritten['contentHash'] = sha256Canonical(body);

    expect(() =>
      verifyC4GenerationPreflight({
        ...bytes,
        preflight: encodeJson(rewritten),
      }),
    ).toThrow('C4_PREFLIGHT_CONTRACT_HASH_MISMATCH');
  });

  it('snapshots each byte field exactly once before verification', async () => {
    const bytes = await loadC4Bytes();
    let summaryReads = 0;
    const swapped: C4GenerationPreflightBytes = {
      ...bytes,
      get c3Summary(): Uint8Array {
        summaryReads += 1;
        if (summaryReads === 1) return bytes.c3Summary;
        const altered = new Uint8Array(bytes.c3Summary);
        altered[0] = altered[0] === 123 ? 91 : 123;
        return altered;
      },
    };

    expect(verifyC4GenerationPreflight(swapped)).toEqual(
      verifyC4GenerationPreflight(bytes),
    );
    expect(summaryReads).toBe(1);
  });

  it('keeps the C4 verifier outside World Core and production surfaces', async () => {
    const source = await readFile(
      path.join(root, 'packages/calibration/src/preflight.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(imports).toEqual(['./canonical.js', './exploration.js']);
  });
});
