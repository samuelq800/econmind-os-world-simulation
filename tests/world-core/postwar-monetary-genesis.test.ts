import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize, parseWorldDecimal } from '@econmind/core';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  createPostwarMonetaryGenesis,
  consumePostwarMonetaryGenesis,
  postwarLocalBookValue,
} from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';

const base = await loadPostwarSourceContext(
  path.resolve(import.meta.dirname, '../..'),
);
const input = {
  source: base.source,
  countriesBytes: base.countriesBytes,
  mappingBytes: base.mappingBytes,
  valueDate: '2026-10-28',
};
const monetary = createPostwarMonetaryGenesis(input);
describe('postwar nominal-unit calibration preserves original real values', () => {
  it('retains all 70 source countries, independent currencies and heterogeneous source-based scales', () => {
    consumePostwarMonetaryGenesis(monetary);
    expect(monetary.bindings).toHaveLength(70);
    expect(new Set(monetary.bindings.map((b) => b.localCurrency)).size).toBe(
      70,
    );
    expect(
      new Set(monetary.bindings.map((b) => b.localCurrencyPerGcu)).size,
    ).toBeGreaterThan(1);
    expect(monetary.moneyCreated).toBe(false);
    expect(monetary.sourceAdmitted).toBe(false);
    expect(canonicalSerialize(createPostwarMonetaryGenesis(input))).toBe(
      canonicalSerialize(monetary),
    );
  });
  it('preserves every original seven-field financial amount by exact cross multiplication, without rounding source money', () => {
    for (const binding of monetary.bindings) {
      const original = base.ownerAdoption.manifest.countries.find(
        (c) => c.countryId === binding.countryId,
      )!;
      for (const amount of Object.values(original.rawFinance)) {
        const local = postwarLocalBookValue(binding, amount);
        expect(local.currency).toBe(binding.localCurrency);
        expect(
          parseWorldDecimal(local.amount).equals(
            parseWorldDecimal(amount).mul(binding.localCurrencyPerGcu),
          ),
        ).toBe(true);
      }
    }
  });
  it('rejects changed source bytes, fake source brand and invalid date before producing a binding', () => {
    expect(() =>
      createPostwarMonetaryGenesis({
        ...input,
        countriesBytes: input.countriesBytes + ' ',
      }),
    ).toThrow();
    expect(() =>
      createPostwarMonetaryGenesis({
        ...input,
        mappingBytes: input.mappingBytes + ' ',
      }),
    ).toThrow();
    expect(() =>
      createPostwarMonetaryGenesis({ ...input, source: { ...input.source } }),
    ).toThrow();
    expect(() =>
      createPostwarMonetaryGenesis({ ...input, valueDate: '2026-02-30' }),
    ).toThrow();
    expect(() => consumePostwarMonetaryGenesis({ ...monetary })).toThrow();
  });
});
