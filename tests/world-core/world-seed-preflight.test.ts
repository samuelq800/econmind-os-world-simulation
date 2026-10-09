import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  collectWorldSeedPreflight,
  runWorldSeedPreflight,
  seedPreflightExitCode,
} from '../../scripts/world-seed-preflight.mjs';

const root = path.resolve(import.meta.dirname, '../..');
type Snapshot = Awaited<ReturnType<typeof collectWorldSeedPreflight>>;
let snapshot: Snapshot;

describe('offline Seed delivery uses existing source validators', () => {
  beforeAll(async () => {
    snapshot = await collectWorldSeedPreflight(root);
  });

  it('keeps adopted rules and all countries while refusing to produce a formal Seed', () => {
    const report = snapshot.report;
    expect(report.counts).toMatchObject({
      countries: 70,
      entities: 350,
      stockCells: 840,
      positiveStockSourceCells: 619,
      positiveInventoryEntries: 0,
      centralBankCategoryRows: 1470,
    });
    expect(report.status).toBe('BLOCKED');
    expect(Object.values(report.capabilities)).toEqual(Array(6).fill(false));
    const first = report.countries[0];
    if (first === undefined) throw new Error('COUNTRY_01_REQUIRED');
    expect(first.rawFinance.treasuryCentralBankBalance).toBe('46796106931.2');
    expect(first.bankOpening.adoptedL).toEqual({
      amount: '23398053465.599997',
      currency: 'GCU',
    });
  });

  it('reports concrete currency and CB completeness gaps without reviving old model approvals', () => {
    const gaps = snapshot.report.gaps.financialSource;
    expect(
      gaps.filter((gap) => gap.code === 'OPENING_LC_CODE_SOURCE_MISSING'),
    ).toHaveLength(490);
    expect(
      gaps.filter((gap) => gap.code === 'OPENING_FX_SOURCE_MISSING'),
    ).toHaveLength(490);
    expect(gaps.map((gap) => gap.code)).not.toContain(
      'TREASURY_CENTRAL_BANK_SPLIT_REQUIRED',
    );
    expect(
      snapshot.report.countries.every(
        (country) => country.centralBankNetWorth.amount === null,
      ),
    ).toBe(true);
  });

  it('keeps physical/water/employment gaps and withheld operating status visible', () => {
    for (const domain of ['physical', 'water', 'labourSocial'] as const)
      expect(snapshot.report.gaps[domain].length).toBeGreaterThan(0);
    expect(
      snapshot.report.counts.gapGroups.physical?.byCode.SOURCE_CONFLICT,
    ).toBe(49);
    expect(snapshot.report.inspectedDomainStates.labourSocial).toBe(
      'ADOPTED_CAPACITY_AND_TARGETS_NOT_READY',
    );
  });

  it('exports known source facts separately from unfilled, non-authoritative user inputs', () => {
    expect(snapshot.worksheet.countries).toHaveLength(70);
    expect(snapshot.worksheet.worldBindingEvidence).toBeNull();
    for (const country of snapshot.worksheet.countries) {
      expect(country.actualHoldingRecords).toBeNull();
      expect(country.politicalCapitalGenesisEvidence).toBeNull();
      expect(
        country.knownCategoryFacts.filter(
          (row) => row.gcuEquivalentAmount !== null,
        ),
      ).toHaveLength(2);
    }
  });

  it('regenerates the same diagnostic bytes without using time or randomness', async () => {
    expect(JSON.stringify(await collectWorldSeedPreflight(root))).toBe(
      JSON.stringify(snapshot),
    );
  });

  it('rejects source drift instead of normalizing an untrusted mapping', async () => {
    const parent = path.join(root, '.seed-validation');
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(path.join(parent, 'drift-'));
    try {
      for (const file of [
        'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
        'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
      ]) {
        await mkdir(path.dirname(path.join(directory, file)), {
          recursive: true,
        });
        await writeFile(
          path.join(directory, file),
          await readFile(path.join(root, file)),
        );
      }
      const mapping = path.join(
        directory,
        'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
      );
      await mkdir(path.dirname(mapping), { recursive: true });
      await writeFile(mapping, '{"status":"READY","owner_approved":true}');
      await expect(collectWorldSeedPreflight(directory)).rejects.toMatchObject({
        code: 'SOURCE_DRIFT',
        field: 'mapping',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses exit 2 for blocked check and distinguishes successful report export', () => {
    expect(seedPreflightExitCode('--check', snapshot.report)).toBe(2);
    expect(seedPreflightExitCode('--report', snapshot.report)).toBe(0);
  });

  it('rejects activation flags and arbitrary output paths before reading or writing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const args of [
        [],
        ['--apply'],
        ['--report', '--activate'],
        ['--report', '--out', 'other'],
      ])
        expect(await runWorldSeedPreflight(args)).toBe(1);
    } finally {
      log.mockRestore();
    }
  });
});
