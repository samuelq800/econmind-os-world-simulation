/** Actual 70-country generated source, real financial mirror and Core state.
 * The disposable DB supplies only an absent-World observation, no production
 * authority, private signature, admission, actual payment or task dispatch. */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
} from '@econmind/core';
import { createHash } from 'node:crypto';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';
import { assemblePostwarGenesisCarrier } from '../../apps/world-worker/src/preparation/postwar-genesis-carrier-assembly.js';
import {
  readPostwarNewWorldScopeFrom,
  readPostwarOperatingGenesisFromSeed,
  adoptPostwarOperatingGenesis,
} from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { selectPostwarSocialEmploymentCountry } from '../../apps/world-worker/src/preparation/postwar-social-employment-state.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from '../../apps/world-worker/src/preparation/postwar-financial-office-originals.js';
import { validatePostwarPhysicalServiceReceiptFromSeed } from '../../apps/world-worker/src/preparation/postwar-physical-service-receipt.js';
const root = path.resolve(import.meta.dirname, '../..');
const world = 'WORLD_POSTWAR_CARRIER_ACCEPTANCE_V1',
  seed = 'SEED_POSTWAR_CARRIER_ACCEPTANCE_V1';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const db = new PGlite();
let prepared: Awaited<ReturnType<typeof preparePostwarWorldGenesis>>;
let assembled: Awaited<ReturnType<typeof assemblePostwarGenesisCarrier>>;
let newWorldScope: Awaited<ReturnType<typeof readPostwarNewWorldScopeFrom>>;
beforeAll(async () => {
  const preparationStarted = performance.now();
  prepared = await preparePostwarWorldGenesis({
    repositoryRoot: root,
    worldId: world,
    seedId: seed,
    genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
    valueDate: '2026-10-28',
  });
  const preparationMs = performance.now() - preparationStarted;
  await db.exec(
    'create schema world_v2;create table world_v2.world_head(world_id text primary key);create table world_v2.opening_seed(world_id text primary key)',
  );
  await db.exec('begin isolation level repeatable read read only');
  try {
    newWorldScope = await readPostwarNewWorldScopeFrom(
      {
        async query<Row extends object>(
          sql: string,
          values: readonly unknown[] = [],
        ) {
          const r = await db.query(sql, [...values]);
          return { rows: r.rows as Row[], rowCount: r.rows.length };
        },
      },
      world,
    );
  } finally {
    await db.exec('rollback');
  }
  const assemblyStarted = performance.now();
  assembled = await assemblePostwarGenesisCarrier({ prepared, newWorldScope });
  console.info(
    'POSTWAR_CARRIER_SETUP_TIMING',
    JSON.stringify({
      preparationMs,
      assemblyMs: performance.now() - assemblyStarted,
      totalMs: performance.now() - preparationStarted,
    }),
  );
}, 120_000);
afterAll(async () => {
  await db.close();
});
describe('actual postwar operating canonical carrier assembly', () => {
  it('materializes and reads the real full-source 70-country seed, full Core E03 and finite physical receipts without t0 economic events', () => {
    expect(assembled.adoption.status).toBe('PROJECT_ADOPTED_NOT_ADMITTED');
    expect(assembled.finalSeed.sources).toHaveLength(3);
    expect(assembled.finalSeed.inventoryEntries).toHaveLength(863);
    expect(assembled.finalSeed.financialBatches).toEqual(
      prepared.financial.baselineSeed.financialBatches,
    );
    expect(assembled.finalSeed.inventoryEntries).toEqual(
      prepared.supplySeed.inventoryEntries,
    );
    expect(assembled.readback.facts.regions).toHaveLength(122);
    expect(assembled.readback.socialEmployment?.countries).toHaveLength(70);
    const current = readPostwarOperatingGenesisFromSeed(assembled.finalSeed);
    expect(current.socialEmployment).toBe(assembled.socialEmployment);
    expect(current.seedFingerprint).toBe(assembled.finalSeed.fingerprint);
    expect(current.socialEmployment?.inputs.seedId).toBe(seed);
    expect(
      current.facts.people.reduce((n, c) => n + BigInt(c.count), 0n).toString(),
    ).toBe('14712146434');
    const source = selectPostwarSocialEmploymentCountry(
      current.socialEmployment!,
      'COUNTRY_01',
    );
    expect(source.countryId).toBe('COUNTRY_01');
    expect(
      source.state.labour.positions.every((p) => p.countryId === 'COUNTRY_01'),
    ).toBe(true);
    expect(source.offers).toEqual([]);
    const ledger = rebuildV08LedgersFromLineage({
      seed: assembled.finalSeed,
      sha256Hex: sha,
    });
    expect(ledger.worldVersion).toBe('0');
    expect(assembled.paymentsPosted).toBe(false);
    expect(assembled.tasksDispatched).toBe(false);
    expect(
      assembled.readback.facts.obligations
        .filter((o) => o.kind === 'WAGE')
        .every(
          (o) =>
            o.basis === 'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED' &&
            o.accruedAtOpening === '0' &&
            o.periodDays === '1' &&
            o.units === '1',
        ),
    ).toBe(true);
  });
  it('independently re-derives the finite physical receipt and exact financial originals from the actual canonical seed', () => {
    expect(
      validatePostwarPhysicalServiceReceiptFromSeed({
        seed: assembled.finalSeed,
        documentId: assembled.carrier.physicalServiceReceiptDocumentId!,
        context: prepared.context,
      }),
    ).toBeTruthy();
    expect(
      readPostwarFinancialOfficeOriginalsFromSeed(assembled.finalSeed),
    ).toBeTruthy();
  });
  it('retains every policy source byte exactly, including fixed-hash finite supplies and Social support', async () => {
    for (const name of [
      'wage-policy',
      'public-safety',
      'housing',
      'supplies',
      'utilities',
      'social-services',
      'social-support',
    ]) {
      const file = `config/postwar-genesis/${name}.v1.json`,
        document = assembled.sourceDocuments.find((d) => d.path === file);
      expect(document?.bytes).toBe(
        await readFile(path.join(root, file), 'utf8'),
      );
      expect(document?.sha256).toBe(sha(document!.bytes));
    }
    expect(
      assembled.carrier.documents.some(
        (d) => d.documentId === 'POSTWAR_FINANCIAL_OFFICE_ORIGINALS',
      ),
    ).toBe(true);
  });
  it('rejects an oversized first-day payroll reservation even when the normalized output document hash is recomputed', () => {
    const carrier = JSON.parse(
      canonicalSerialize(assembled.carrier),
    ) as typeof assembled.carrier;
    const wage = carrier.facts.obligations.find((o) => o.kind === 'WAGE')!;
    Object.assign(wage, {
      amount: '999999999999999999999999',
      unitAmount: '999999999999999999999999',
    });
    const output = carrier.documents.find(
        (d) => d.documentId === carrier.outputDocumentId,
      )!,
      bytes = canonicalSerialize(carrier.facts);
    Object.assign(output, { bytes, sha256: sha(bytes) });
    const result = adoptPostwarOperatingGenesis({
      carrier,
      baselineSeed: prepared.supplySeed,
      sourceId: 'SOURCE_POSTWAR_OPERATING_V1',
      newWorldScope,
    });
    expect(result.seed).toBeNull();
    expect(result.blockers[0]?.code).toBe('FIRST_DAY_PAYROLL_CEILING_MISMATCH');
  });
});
