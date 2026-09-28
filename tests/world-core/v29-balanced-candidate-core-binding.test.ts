import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Money, Quantity, countryId } from '../../packages/core/src/index.js';
import { COMMODITY_ENTRIES } from '../../packages/core/src/registries/fixed-catalog.js';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/world-balanced-candidate-v1',
);
const selectedChecksumsSha256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';

interface Country {
  readonly id: string;
  readonly population: number;
}

interface Stock {
  readonly id: string;
  readonly countryId: string;
  readonly commodityId: string;
  readonly unit: string;
  readonly available: number;
  readonly reserved: number;
  readonly inTransit: number;
}

interface Finance {
  readonly countryId: string;
  readonly currency: string;
  readonly householdBankDeposits: number;
}

interface PackageManifest {
  readonly version: string;
  readonly status: string;
  readonly activationAllowed: boolean;
  readonly worldIdentity: string;
  readonly populationTotalPreserved: number;
}

interface ChecksumEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readSelectedPackage() {
  const checksumBytes = await readFile(
    path.join(packageRoot, 'CHECKSUMS.json'),
  );
  expect(sha256(checksumBytes)).toBe(selectedChecksumsSha256);
  const checksums = JSON.parse(
    checksumBytes.toString('utf8'),
  ) as ChecksumEntry[];
  expect(checksums).toHaveLength(86);
  const entries = new Map(checksums.map((entry) => [entry.path, entry]));
  const read = async <T>(relativePath: string): Promise<T> => {
    const entry = entries.get(relativePath);
    expect(entry).toBeDefined();
    const bytes = await readFile(path.join(packageRoot, relativePath));
    expect(bytes.length).toBe(entry?.bytes);
    expect(sha256(bytes)).toBe(entry?.sha256);
    return JSON.parse(bytes.toString('utf8')) as T;
  };
  return {
    manifest: await read<PackageManifest>('data/manifest.json'),
    countries: await read<Country[]>('data/countries.json'),
    stocks: await read<Stock[]>('data/stocks.json'),
    finance: await read<Finance[]>('data/finance.json'),
  };
}

describe('V29 selected balanced World data — read-only Core binding preflight', () => {
  it('binds the selected source and complete 70-country roster without activating a World', async () => {
    const { manifest, countries } = await readSelectedPackage();
    expect(manifest).toMatchObject({
      version: 'WORLD_BALANCED_CANDIDATE_V1',
      status: 'IMPLEMENTED_UNVERIFIED_CANDIDATE',
      activationAllowed: false,
      worldIdentity: 'CANDIDATE_ONLY_NO_PRODUCTION_WORLD_ID',
      populationTotalPreserved: 14_712_146_434,
    });
    expect(countries).toHaveLength(70);
    expect(countries.map((country) => country.id)).toEqual(
      Array.from(
        { length: 70 },
        (_, index) => `visual-territory-${String(index + 1).padStart(2, '0')}`,
      ),
    );
    expect(
      countries.reduce((sum, country) => sum + country.population, 0),
    ).toBe(14_712_146_434);
    // Atlas keys are source locators, not Core CountryId values. No identity
    // mapping is silently inferred from the display-country number.
    expect(() => countryId(countries[0].id)).toThrow();
  });

  it('maps all 840 stock cells to Core commodity units and decimal quantities', async () => {
    const { countries, stocks } = await readSelectedPackage();
    const catalog = new Map(
      COMMODITY_ENTRIES.map((commodity) => [commodity.id, commodity.unit]),
    );
    const expectedCells = new Set(
      countries.flatMap((country) =>
        COMMODITY_ENTRIES.map((commodity) => `${country.id}/${commodity.id}`),
      ),
    );
    const observedCells = new Set<string>();
    let positive = 0;
    let zero = 0;
    for (const stock of stocks) {
      const cell = `${stock.countryId}/${stock.commodityId}`;
      expect(expectedCells.has(cell), stock.id).toBe(true);
      expect(observedCells.has(cell), stock.id).toBe(false);
      observedCells.add(cell);
      expect(stock.unit, stock.id).toBe(catalog.get(stock.commodityId));
      expect(Number.isFinite(stock.available), stock.id).toBe(true);
      expect(stock.available, stock.id).toBeGreaterThanOrEqual(0);
      expect(stock.reserved, stock.id).toBe(0);
      expect(stock.inTransit, stock.id).toBe(0);
      const quantity = Quantity.from(String(stock.available), stock.unit);
      expect(quantity.toCanonicalValue().unit).toBe(stock.unit);
      if (stock.available === 0) zero += 1;
      else positive += 1;
    }
    expect(observedCells).toEqual(expectedCells);
    expect({ total: stocks.length, positive, zero }).toEqual({
      total: 840,
      positive: 619,
      zero: 221,
    });
  });

  it('keeps scenario finance distinct from an approved Core settlement currency', async () => {
    const { countries, finance } = await readSelectedPackage();
    expect(finance).toHaveLength(70);
    expect(new Set(finance.map((row) => row.countryId))).toEqual(
      new Set(countries.map((country) => country.id)),
    );
    expect(new Set(finance.map((row) => row.currency))).toEqual(
      new Set(['GCU_SCENARIO_ACCOUNTING_UNIT']),
    );
    expect(() => Money.from('1', finance[0].currency)).toThrow();
    expect(
      finance.filter(
        (row) =>
          (String(row.householdBankDeposits).split('.')[1] ?? '').length > 2,
      ),
    ).toHaveLength(60);
  });
});
