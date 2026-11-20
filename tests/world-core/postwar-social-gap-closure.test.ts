import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';
import { assemblePostwarGenesisCarrier } from '../../apps/world-worker/src/preparation/postwar-genesis-carrier-assembly.js';
import { readPostwarNewWorldScopeFrom } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { auditPostwarSocialGapClosure } from '../../apps/world-worker/src/preparation/postwar-social-gap-closure.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const prepared = await preparePostwarWorldGenesis({
  repositoryRoot: path.resolve(import.meta.dirname, '../..'),
  worldId: 'WORLD_SOCIAL_GAP_OVERLAY_TEST',
  seedId: 'SEED_SOCIAL_GAP_OVERLAY_TEST',
  genesisVersion: 'POSTWAR_OPERATING_GENESIS_20261028_V1',
  valueDate: '2026-10-28',
});
// TEST_ONLY new-world absence observation; not deployment or production custody.
const tx: SqlExecutor = {
  async query<Row extends object>(sql: string) {
    return {
      rowCount: 1,
      rows: [
        sql.includes('transaction_read_only')
          ? { read_only: 'on', isolation: 'repeatable read' }
          : { present: false },
      ] as unknown as Row[],
    };
  },
};
const newWorldScope = await readPostwarNewWorldScopeFrom(
  tx,
  prepared.input.worldId,
);
const assembly = await assemblePostwarGenesisCarrier({
  prepared,
  newWorldScope,
});
const overlay = auditPostwarSocialGapClosure({
  prepared,
  finalSeed: assembly.finalSeed,
});

// Full immutable seed/physical/E03 revalidation belongs to the source fixture;
// keep the expensive negative fixture out of the per-assertion timer.
const partialPrepared = {
  ...prepared,
  housing: { ...prepared.housing, regions: [] },
};
const partialOverlay = auditPostwarSocialGapClosure({
  prepared: partialPrepared,
  finalSeed: assembly.finalSeed,
});
if (process.env.ECONMIND_SOCIAL_GAP_OVERLAY_EVIDENCE_DIR) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const directory = path.resolve(
    process.env.ECONMIND_SOCIAL_GAP_OVERLAY_EVIDENCE_DIR,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'summary.json'),
    JSON.stringify(
      {
        schemaVersion: overlay.schemaVersion,
        worldId: overlay.worldId,
        seedId: overlay.seedId,
        sourceChecksumsSha256: overlay.sourceChecksumsSha256,
        finalSeedFingerprint: overlay.finalSeedFingerprint,
        validation: overlay.validation,
        summary: overlay.summary,
        sourceAdmitted: overlay.sourceAdmitted,
        executionAuthorized: overlay.executionAuthorized,
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    path.join(directory, 'full-overlay.json'),
    JSON.stringify(overlay, null, 2) + '\n',
  );
}

describe('immutable 1066 composite-gap source/runtime closure overlay', () => {
  it('keeps exact 700 country and 366 facility denominator and reports only whole checked composites', () => {
    expect(overlay.rows).toHaveLength(1066);
    expect(overlay.summary.originalCompositeGaps).toBe(1066);
    expect(overlay.summary.countryGroups).toBe(700);
    expect(overlay.summary.facilityGroups).toBe(366);
    expect(new Set(overlay.rows.map((r) => r.gapKey)).size).toBe(1066);
    expect(overlay.validation).toEqual({
      canonicalReadback: 'PASS',
      physicalReceipt: 'PASS',
      fullCoreE03: 'PASS',
    });
    expect(
      overlay.rows.every(
        (row) =>
          row.wholeCompositeCovered === row.sourceChecks.every((c) => c.met),
      ),
    ).toBe(true);
    expect(
      overlay.summary.sourcePolicyCoveredCompositeGaps +
        overlay.summary.sourcePolicyUncoveredCompositeGaps,
    ).toBe(1066);
    expect(overlay.summary.sourcePolicyCoveredCompositeGaps).toBe(1066);
  });
  it('never counts source policy/adoption as runtime admission or rewrites legacy source conflicts', () => {
    expect(overlay.summary.runtimeClosedCompositeGaps).toBe(0);
    expect(overlay.summary.originalRawGapsChanged).toBe(0);
    expect(overlay.rows.map((r) => r.originalGap)).toEqual(
      prepared.context.labourSocial.gaps,
    );
    expect(
      overlay.rows.filter(
        (r) => r.originalGap.code === 'INCOMPATIBLE_SKILL_SEMANTICS',
      ),
    ).toHaveLength(122);
    expect(
      overlay.rows.every(
        (r) =>
          r.runtimeLevel === 'NOT_PROVEN' &&
          !r.originalRawGapChanged &&
          r.runtimeBlockers.length > 0,
      ),
    ).toBe(true);
    expect(overlay.sourceAdmitted).toBe(false);
    expect(overlay.executionAuthorized).toBe(false);
    expect(overlay.worldStarted).toBe(false);
  });
  it('does not report unrun final seed/physical/E03 validation as source closure', () => {
    const notRun = auditPostwarSocialGapClosure({ prepared });
    expect(notRun.validation).toEqual({
      canonicalReadback: 'NOT_RUN',
      physicalReceipt: 'NOT_RUN',
      fullCoreE03: 'NOT_RUN',
    });
    expect(notRun.summary.sourcePolicyCoveredCompositeGaps).toBe(0);
    expect(notRun.summary.sourcePolicyUncoveredCompositeGaps).toBe(1066);
    expect(notRun.summary.runtimeClosedCompositeGaps).toBe(0);
  });
  it('requires complete source documents even when partial prepared mappings exist', () => {
    const partial = partialOverlay;
    expect(partial.summary.byField.titleAndTenure.sourcePolicyCovered).toBe(0);
    expect(
      partial.summary.byField.housingOccupancyHabitabilityAndRent
        .sourcePolicyCovered,
    ).toBe(0);
    expect(partial.summary.sourcePolicyUncoveredCompositeGaps).toBe(192);
    expect(partial.summary.runtimeClosedCompositeGaps).toBe(0);
  });
  it('rejects corrupted final seed and leaves original raw gap audit byte-identical', () => {
    const before = canonicalSerialize(prepared.context.labourSocial.gaps);
    expect(() =>
      auditPostwarSocialGapClosure({
        prepared,
        finalSeed: { ...assembly.finalSeed, fingerprint: 'sha256:bad' },
      }),
    ).toThrow();
    expect(canonicalSerialize(prepared.context.labourSocial.gaps)).toBe(before);
  });
});
