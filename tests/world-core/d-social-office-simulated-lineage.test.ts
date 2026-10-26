import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { requireSocialOfficeProtectedSource } from '../../apps/world-worker/src/persistence/social-office-resource-protection.js';
import {
  socialOfficeServiceWire,
  replaySocialOfficeDurableGroups,
} from '../../apps/world-worker/src/persistence/social-office-simulated-lineage.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  digest,
  socialScenario,
} from '../support/social-office-atomic-fixture.js';

describe('D new Social sole-reader boundary', () => {
  it('denies even an empty prefix without the actual active same-executor source scope', async () => {
    const scenario = await socialScenario();
    const executor = {
      query: async () => {
        throw Error('MUST_NOT_QUERY');
      },
    };
    await expect(
      replaySocialOfficeDurableGroups({
        executor,
        identity: {
          simulationId: scenario.scope.simulationId,
          worldId: scenario.scope.worldId,
          countryId: scenario.scope.countryId,
          seedId: scenario.seed.seedId,
          seedFingerprint: scenario.seed.fingerprint,
        },
        seed: scenario.seed,
        groups: [],
        sha256Hex: digest,
      }),
    ).rejects.toThrow('same-executor');
    expect(() =>
      requireSocialOfficeProtectedSource(executor, scenario.scope),
    ).toThrow('same-executor');
  });
  it('original reader refuses naked simulated mode before reading H or issuing a view', async () => {
    const s = await socialScenario();
    let calls = 0;
    const database = {
      query: async () => {
        calls++;
        throw Error('UNEXPECTED');
      },
      transaction: async () => {
        throw Error('UNEXPECTED');
      },
    } as SqlDatabase;
    const reader = new DurableV08LedgerLineageReader({
      database,
      sha256Hex: digest,
      socialSimulation: {
        simulationId: s.scope.simulationId,
        worldId: s.scope.worldId,
        countryId: s.scope.countryId,
        seedId: s.seed.seedId,
        seedFingerprint: s.seed.fingerprint,
      },
    });
    await expect(
      reader.readValidatedLineageFrom(database, s.scope.worldId),
    ).rejects.toThrow('same-executor');
    expect(calls).toBe(0);
  });
  it('joins the SQL fingerprint without canonicalizing or repairing malformed service intent', () => {
    const intent = {
      operation: 'SERVICE_CONSUME',
      schemaVersion: 'inventory-social-service-consumption-v1',
    };
    const raw = canonicalSerialize(intent),
      fp = `sha256:${'a'.repeat(64)}`;
    expect(socialOfficeServiceWire(raw, fp)).toBe(
      canonicalSerialize({ ...intent, fingerprint: fp }),
    );
    expect(() => socialOfficeServiceWire(` ${raw}`, fp)).toThrow(
      'exact service intent',
    );
    expect(() =>
      socialOfficeServiceWire(
        canonicalSerialize({ ...intent, fingerprint: fp }),
        fp,
      ),
    ).toThrow('exact service intent');
    expect(() => socialOfficeServiceWire(raw, 'a'.repeat(64))).toThrow(
      'canonical service row',
    );
    expect(() =>
      socialOfficeServiceWire(
        canonicalSerialize({ ...intent, operation: 'DELIVER' }),
        fp,
      ),
    ).toThrow('unsupported service pair');
  });
});
