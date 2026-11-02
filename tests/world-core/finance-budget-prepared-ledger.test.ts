/** Pure Core fixture. This is no admission or native SQL evidence. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareFinanceBudgetLedger,
  replayPreparedFinanceBudgetLedger,
} from '@econmind/core/finance-budget-prepared-ledger';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
describe('opaque immutable Finance budget ledger preparation', () => {
  it('retains only a genuine Core H0 base and refuses structural preparations', () => {
    const seed = C.createOpeningSeed(
      {
        schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
        seedId: C.openingSeedId('SEED_PREPARED_BUDGET_TEST_ONLY'),
        worldId: C.worldId('WORLD_PREPARED_BUDGET_TEST_ONLY'),
        openingWorldVersion: '0',
        replayBinding: C.CURRENT_REPLAY_BINDING,
        sources: [
          C.createOpeningSource(
            {
              schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
              sourceId: C.openingSourceId('SOURCE_PREPARED_BUDGET_TEST_ONLY'),
              sourceKind: 'TEST_FIXTURE',
              locator:
                'tests/world-core/finance-budget-prepared-ledger.test.ts',
              sourceVersion: 'TEST_ONLY',
              payload: {},
            },
            sha,
          ),
        ],
        inventoryEntries: [],
        financialBatches: [],
      },
      sha,
    );
    const base = C.rebuildV08LedgersFromLineage({
      seed,
      transitions: [],
      sha256Hex: sha,
    }).financial;
    const prepared = prepareFinanceBudgetLedger(base);
    expect(
      replayPreparedFinanceBudgetLedger({
        prepared,
        frames: [],
        sha256Hex: sha,
      }),
    ).toBe(base);
    expect(() => prepareFinanceBudgetLedger({ ...base })).toThrow(
      /genuine H0/u,
    );
    expect(() =>
      replayPreparedFinanceBudgetLedger({
        prepared: {} as typeof prepared,
        frames: [],
        sha256Hex: sha,
      }),
    ).toThrow(/genuine H0/u);
  });
});
