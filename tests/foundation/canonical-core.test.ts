import { describe, expect, it } from 'vitest';

import {
  CANONICAL_HASH_ALGORITHM,
  COMMODITY_REGISTRY,
  CURRENT_WORLD_VERSIONS,
  CanonicalRegistry,
  DOMAIN_ERROR_CODES,
  ENGINE_REGISTRY,
  INTERNATIONAL_ACTIVITY_REGISTRY,
  Money,
  OFFICE_REGISTRY,
  PROJECT_REGISTRY,
  PRODUCTION_SECTOR_REGISTRY,
  Price,
  Quantity,
  Rate,
  SimTime,
  TECHNOLOGY_REGISTRY,
  assertWorldVersions,
  canonicalHashInput,
  canonicalSerialize,
  parseWorldDecimal,
  worldId,
} from '../../packages/core/src/index.js';

describe('V03 canonical numeric layer', () => {
  it('uses exact string-first decimal arithmetic', () => {
    expect(
      Money.from('0.1', 'GBP').add(Money.from('0.2', 'GBP')).toCanonicalValue(),
    ).toEqual({ amount: '0.3', currency: 'GBP' });
    expect(Money.from('1234.5600', 'GBP').toCanonicalValue()).toEqual({
      amount: '1234.56',
      currency: 'GBP',
    });
  });

  it('rejects malformed, non-finite, exponent, whitespace, and number inputs', () => {
    for (const value of [
      '',
      ' ',
      'NaN',
      'Infinity',
      '-Infinity',
      '1e9',
      '+1',
      '.5',
      '01',
      '1,000',
    ]) {
      expect(() => parseWorldDecimal(value)).toThrowError();
    }
    expect(() => parseWorldDecimal(0.1 as never)).toThrowError();
  });

  it('enforces currency, unit, and Rate domains', () => {
    expect(() => Money.from('1', 'GBP').add(Money.from('1', 'USD'))).toThrow(
      'currencies must match',
    );
    expect(() =>
      Quantity.from('1', 'tonne').add(Quantity.from('1', 'barrel')),
    ).toThrow('units must match');
    expect(() => Rate.from('-0.01')).toThrow('between 0 and 1');
    expect(() => Rate.from('1.01')).toThrow('between 0 and 1');
    expect(Rate.from('1').toCanonicalValue()).toBe('1');
  });

  it('supports only domain-valid Price multiplied by Quantity', () => {
    expect(
      Price.from('12.50', 'GBP', 'tonne')
        .multiply(Quantity.from('4', 'tonne'))
        .toCanonicalValue(),
    ).toEqual({ amount: '50', currency: 'GBP' });
    expect(() =>
      Price.from('12.50', 'GBP', 'tonne').multiply(
        Quantity.from('4', 'barrel'),
      ),
    ).toThrow('units must match');
  });

  it('defines IDs and SimTime without implementing the V06 clock', () => {
    expect(worldId('WORLD_01')).toBe('WORLD_01');
    expect(() => worldId('world-01')).toThrow('canonical uppercase');
    expect(SimTime.fromTicks('0').toCanonicalValue()).toBe('0');
    expect(() => SimTime.fromTicks('-1')).toThrow('non-negative');
  });
});

describe('V03 fixed registries', () => {
  it('preserves every traced fixed catalog count', () => {
    expect({
      commodities: COMMODITY_REGISTRY.entries.length,
      engines: ENGINE_REGISTRY.entries.length,
      internationalActivities: INTERNATIONAL_ACTIVITY_REGISTRY.entries.length,
      offices: OFFICE_REGISTRY.entries.length,
      productionSectors: PRODUCTION_SECTOR_REGISTRY.entries.length,
      projects: PROJECT_REGISTRY.entries.length,
      technologies: TECHNOLOGY_REGISTRY.entries.length,
    }).toEqual({
      commodities: 12,
      engines: 18,
      internationalActivities: 23,
      offices: 6,
      productionSectors: 12,
      projects: 38,
      technologies: 22,
    });
  });

  it('preserves canonical source identities and rejects duplicates', () => {
    expect(COMMODITY_REGISTRY.get('CRUDE_OIL').unit).toBe('barrel');
    expect(OFFICE_REGISTRY.entries.map((entry) => entry.id)).toEqual([
      'CAPTAIN',
      'CENTRAL_BANK',
      'FINANCE',
      'TRADE',
      'INDUSTRY',
      'SOCIAL',
    ]);
    expect(
      () => new CanonicalRegistry('invalid', [{ id: 'SAME' }, { id: 'SAME' }]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.DUPLICATE_REGISTRY_ID,
      }),
    );
  });
});

describe('V03 canonical serialization and versions', () => {
  it('is deterministic, key-sorted, and string-exact', () => {
    const value = {
      z: Money.from('10.5000', 'GBP'),
      a: { rate: Rate.from('0.25') },
    };
    const first = canonicalSerialize(value);
    expect(first).toBe(
      '{"a":{"rate":"0.25"},"z":{"amount":"10.5","currency":"GBP"}}',
    );
    expect(canonicalSerialize(value)).toBe(first);
    expect(canonicalHashInput(value)).toBe(
      `${CANONICAL_HASH_ALGORITHM}\n${first}`,
    );
  });

  it('rejects JS numbers, bigint, unsupported objects, and cycles', () => {
    expect(() => canonicalSerialize({ amount: 1 })).toThrow('rejects number');
    expect(() => canonicalSerialize(1n)).toThrow('rejects bigint');
    expect(() => canonicalSerialize(new Date())).toThrow(
      'plain domain records',
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalSerialize(cyclic)).toThrow('cyclic');
  });

  it('rejects accessors without invoking them', () => {
    let reads = 0;
    const changing: Record<string, unknown> = {};
    Object.defineProperty(changing, 'value', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? 'A' : 'B';
      },
    });
    expect(() => canonicalSerialize(changing)).toThrow('rejects accessors');
    expect(reads).toBe(0);

    const setterBacked: Record<string, unknown> = {};
    Object.defineProperty(setterBacked, 'value', {
      enumerable: true,
      set(value: unknown) {
        void value;
      },
    });
    expect(() => canonicalSerialize(setterBacked)).toThrow('rejects accessors');
  });

  it('rejects duck-typed executable canonicalization without calling it', () => {
    let calls = 0;
    const behavioral = {
      stable: 'data',
      toCanonicalValue() {
        calls += 1;
        return calls === 1 ? 'A' : 'B';
      },
    };
    expect(() => canonicalSerialize(behavioral)).toThrow('rejects function');
    expect(calls).toBe(0);
  });

  it('rejects unsupported proxy-like objects and hidden or symbol state', () => {
    let traps = 0;
    const liveProxy = new Proxy(
      { value: 'A' },
      {
        get() {
          traps += 1;
          return 'B';
        },
        getOwnPropertyDescriptor() {
          traps += 1;
          return undefined;
        },
        getPrototypeOf() {
          traps += 1;
          return Object.prototype;
        },
        ownKeys() {
          traps += 1;
          return ['value'];
        },
      },
    );
    expect(() => canonicalSerialize(liveProxy)).toThrow('rejects Proxy');
    expect(traps).toBe(0);

    const revoked = Proxy.revocable({ value: 'A' }, {});
    revoked.revoke();
    expect(() => canonicalSerialize(revoked.proxy)).toThrow('rejects Proxy');
    const hidden = { visible: 'A' };
    Object.defineProperty(hidden, 'hidden', { value: 'B' });
    expect(() => canonicalSerialize(hidden)).toThrow('hidden record state');
    expect(() => canonicalSerialize({ [Symbol('hidden')]: 'B' })).toThrow(
      'symbol properties',
    );
  });

  it('reconstructs inert records byte-identically across insertion order', () => {
    const first = canonicalSerialize({
      z: ['A', { y: 'B', x: 'C' }],
      a: Money.from('10.50', 'GBP'),
    });
    const reconstructed = canonicalSerialize({
      a: Money.from('10.500', 'GBP'),
      z: ['A', { x: 'C', y: 'B' }],
    });
    expect(reconstructed).toBe(first);
  });

  it('fails closed on model, registry, or schema version mismatch', () => {
    expect(() => assertWorldVersions(CURRENT_WORLD_VERSIONS)).not.toThrow();
    expect(() =>
      assertWorldVersions({ ...CURRENT_WORLD_VERSIONS, model: 'old' }),
    ).toThrow('version mismatch');
  });
});
