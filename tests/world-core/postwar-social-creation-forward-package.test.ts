/** Source packaging only: no DB, actual schema upgrade or source initializer. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createUnapprovedSocialCreationForwardPlan,
  SOCIAL_CREATION_FORWARD_MANIFEST_PATH,
  LOGISTICS_FORWARD_MANIFEST_PATH,
} from '../../tools/office-connection/postwar-schema-delta.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const forward = JSON.parse(
    await readFile(
      path.join(root, SOCIAL_CREATION_FORWARD_MANIFEST_PATH),
      'utf8',
    ),
  );
  // TEST_ONLY package metadata, not an admitted World/DB/currentness proof.
  return {
    forward,
    candidate: {
      manifest: {
        production_publisher: 'main-site-release-chain',
        migrations: [],
      },
      pins: {
        sourceCommit: 'b'.repeat(40),
        sourceTree: 'c'.repeat(40),
        installationAllowed: false,
        manifestSha256: 'a'.repeat(64),
        expandedPolicySha256: 'f'.repeat(64),
        proposals: [
          ...forward.sourcePins.map(
            (p: { path: string; newSha256: string }) => ({
              path: p.path,
              sha256: p.newSha256,
            }),
          ),
          forward.newSupplement,
        ],
      },
    },
  };
}
describe('fixed Social13 source-review package entry', () => {
  it('uses the pinned loader and packages13 exact replacements plus only the declared new supplement', async () => {
    const f = await fixture();
    const p = await createUnapprovedSocialCreationForwardPlan(
      f.candidate,
      root,
    );
    expect(p.chunks).toHaveLength(1);
    expect(p.chunks[0]!.source).toEqual(p.chunks[0]!.transaction);
    expect(sha(p.chunks[0]!.source.toString())).toBe(
      'b998b0fd648470a495f2f2a6fbe0632f916d99c1de44c0cee556fa63e9109a8f',
    );
    expect(p.chunks[0]!.entry.preconditions.functions).toHaveLength(13);
    expect(p.chunks[0]!.entry.preconditions.newFunctions).toHaveLength(3);
    expect(p.manifest).toMatchObject({
      packagedProposalCount: 0,
      packagedForwardCount: 1,
      replacedExistingFunctionCount: 13,
      addedRelationCount: 1,
      addedFunctionCount: 3,
      installationAllowed: false,
      databaseOperations: 0,
      migrationRegistrationPerformed: false,
      freshProposalSqlIncluded: false,
      mutuallyExclusiveWith: 'FRESH_SCHEMA_DELTA_FROM_SAME_CANDIDATE',
    });
    expect(p.manifest.sourceInitializer).toMatchObject({
      performed: false,
      separateTransaction: true,
      role: 'world_v2_postwar_projection_publisher',
    });
    expect(p.manifest.operatorPrecondition).toContain('STOPPED_AND_DRAINED');
    expect(p.chunks[0]!.entry.recovery).toMatchObject({
      automaticRollback: false,
      uncertainCommit: 'STOP_INSPECT_CATALOG_AND_RECEIPTS_NO_BLIND_RETRY',
    });
  });
  it('rejects candidate source-pin disagreement and approval instead of silently packaging another schema', async () => {
    const f = await fixture();
    f.candidate.pins.proposals[0]!.sha256 = '0'.repeat(64);
    await expect(
      createUnapprovedSocialCreationForwardPlan(f.candidate, root),
    ).rejects.toThrow(
      'EXACT_SOCIAL_CREATION_FORWARD_AND_CANDIDATE_PINS_REQUIRED',
    );
    const g = await fixture();
    g.candidate.pins.installationAllowed = true;
    await expect(
      createUnapprovedSocialCreationForwardPlan(g.candidate, root),
    ).rejects.toThrow(
      'EXACT_SOCIAL_CREATION_FORWARD_AND_CANDIDATE_PINS_REQUIRED',
    );
  });
  it('rejects changed manifest or SQL through the exact existing loader pins', async () => {
    for (const changed of [
      SOCIAL_CREATION_FORWARD_MANIFEST_PATH,
      'database/upgrades/postwar-social-employment-creation.sql',
    ]) {
      const temporary = await mkdtemp(
        path.join(tmpdir(), 'social-forward-package-'),
      );
      try {
        for (const relative of [
          'tests/support/postwar-social-employment-creation-forward.ts',
          SOCIAL_CREATION_FORWARD_MANIFEST_PATH,
          'database/upgrades/postwar-social-employment-creation.sql',
        ]) {
          await mkdir(path.dirname(path.join(temporary, relative)), {
            recursive: true,
          });
          const text = await readFile(path.join(root, relative), 'utf8');
          await writeFile(
            path.join(temporary, relative),
            text + (relative === changed ? '\n--TEST_ONLY_CHANGED_BYTES' : ''),
          );
        }
        await expect(
          createUnapprovedSocialCreationForwardPlan(
            (await fixture()).candidate,
            temporary,
          ),
        ).rejects.toThrow();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  });
  it('accepts only the known Social/logistics flags and leaves default fresh argument validation unchanged', () => {
    const script = path.join(
      root,
      'tools/office-connection/postwar-schema-delta.mjs',
    );
    const args = [
      '--source-root',
      'relative',
      '--candidate-sha',
      'b'.repeat(40),
      '--companion-root',
      '/tmp',
      '--output-directory',
      '/tmp/unused-source-only',
    ];
    for (const suffix of [
      [],
      ['--forward-manifest', SOCIAL_CREATION_FORWARD_MANIFEST_PATH],
      ['--forward-manifest', LOGISTICS_FORWARD_MANIFEST_PATH],
    ]) {
      const r = spawnSync(process.execPath, [script, ...args, ...suffix], {
        encoding: 'utf8',
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('ABSOLUTE_PATHS_REQUIRED');
    }
    const unknown = spawnSync(
      process.execPath,
      [
        script,
        ...args,
        '--forward-manifest',
        'database/upgrades/unknown.manifest.json',
      ],
      { encoding: 'utf8' },
    );
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain(
      'ONLY_SOURCE_SHA_COMPANION_FRESH_OUTPUT_ARGUMENTS_ALLOWED',
    );
  });
});
