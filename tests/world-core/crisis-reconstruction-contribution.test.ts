import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalSerialize } from '@econmind/core';

import {
  readFormalCrisisContribution,
  readIsolatedCrisisContribution,
  type IsolatedCrisisSnapshot,
  type IsolatedCrisisSnapshotBody,
  type IsolatedCrisisResultEnvelope,
} from '../../apps/world-worker/src/projections/crisis-reconstruction-contribution.js';
import {
  createCrisisLineageFixture,
  mutateCrisisFixture,
  fixtureSelection,
  fixtureDigest,
  fixtureCoreFingerprint,
} from '../support/crisis-reconstruction-lineage-fixture.js';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST', 'true');
  vi.stubEnv('ECONMIND_ENV', 'local');
});
afterEach(() => vi.unstubAllEnvs());
const read = (snapshot: IsolatedCrisisSnapshot) =>
  readIsolatedCrisisContribution(
    { readSnapshot: async () => snapshot },
    fixtureSelection,
  );
function metric(result: IsolatedCrisisResultEnvelope) {
  expect(result.admission).toBe('ISOLATED_TEST_ONLY_NOT_ADMITTED');
  expect(result.formalPublicationAllowed).toBe(false);
  if (result.result.kind !== 'TEST_ONLY_DELIVERED_INPUT_RESULT')
    throw new Error(`No test-only metric: ${result.result.reason}`);
  return result.result;
}
function noQuantities(
  result: IsolatedCrisisResultEnvelope,
  kind: 'TEST_ONLY_DENIED' | 'TEST_ONLY_UNAVAILABLE',
) {
  expect(result.result.kind).toBe(kind);
  expect(result.result).not.toHaveProperty('eligible');
  expect(result.result).not.toHaveProperty('target');
  expect(result.result).not.toHaveProperty('gap');
  expect(result.result).not.toHaveProperty('historicalSettledCosts');
}
function rawEdit(
  snapshot: IsolatedCrisisSnapshot,
  edit: (body: IsolatedCrisisSnapshotBody) => void,
): IsolatedCrisisSnapshot {
  const body = JSON.parse(
    JSON.stringify(snapshot.body),
  ) as IsolatedCrisisSnapshotBody;
  edit(body);
  return { ...snapshot, body, canonicalFingerprint: fixtureDigest(body) };
}

describe('A1 isolated GRAIN delivered-input projection', () => {
  it('reads one immutable aggregate and replays real Core opening/reserve/ship/delivery facts', async () => {
    const snapshot = createCrisisLineageFixture();
    const port = { readSnapshot: vi.fn(async () => snapshot) };
    const result = metric(
      await readIsolatedCrisisContribution(port, fixtureSelection),
    );
    expect(port.readSnapshot).toHaveBeenCalledTimes(1);
    expect(result.eligible).toEqual({ amount: '5.25', unit: 'tonne' });
    expect(result.gap).toEqual({ amount: '4.75', unit: 'tonne' });
    expect(result.historicalSettledCosts).toEqual([
      { amount: '6', currency: 'GCU' },
    ]);
    expect(result.contributingLotRefs).toEqual(['LOT_DELIVERY', 'LOT_OPENING']);
    expect(result.formalClock).toBe(null);
    expect(result.formalClockStatus).toBe('UNBOUND');
    expect(result).not.toHaveProperty('commissionedCapacity');
    expect(result).not.toHaveProperty('availableCash');
  });
  it('repeated reads/restart return the same derived exact values', async () => {
    const fixture = createCrisisLineageFixture();
    expect(await read(fixture)).toEqual(await read(fixture));
  });
  it('source identity uses the exact producer/version pair and rejects repeated pairs', async () => {
    const base = createCrisisLineageFixture();
    const extra = rawEdit(base, (b) => {
      const first = b.sourceDocuments[0]!;
      const canonicalBytes = canonicalSerialize({
        ...JSON.parse(first.canonicalBytes),
        sourceVersion: 'ARCHIVED_MECHANISM_VERSION',
      });
      Object.assign(b, {
        sourceDocuments: [
          ...b.sourceDocuments,
          {
            ...first,
            sourceVersion: 'ARCHIVED_MECHANISM_VERSION',
            canonicalBytes,
            canonicalFingerprint: fixtureDigest(JSON.parse(canonicalBytes)),
          },
        ],
      });
    });
    expect(metric(await read(extra)).eligible.amount).toBe('5.25');
    const duplicate = rawEdit(base, (b) =>
      Object.assign(b, {
        sourceDocuments: [...b.sourceDocuments, b.sourceDocuments[0]!],
      }),
    );
    await expect(read(duplicate)).rejects.toThrow('DUPLICATE_SOURCE_DOCUMENT');
  });
  it('replays multiple unique delivered lots rather than only the latest materialization', async () => {
    const fixture = createCrisisLineageFixture({ secondFullDelivery: true });
    expect(fixture.body.held.worldVersion).toBe('6');
    const result = metric(await read(fixture));
    expect(result.eligible.amount).toBe('7.25');
    expect(result.gap.amount).toBe('2.75');
    expect(result.contributingLotRefs).toEqual([
      'LOT_DELIVERY',
      'LOT_DELIVERY_SECOND',
      'LOT_OPENING',
    ]);
    expect(result.historicalSettledCosts).toEqual([
      { amount: '6', currency: 'GCU' },
      { amount: '2', currency: 'GCU' },
    ]);
  });
  it('suppresses exact duplicate allocation evidence without changing authoritative history', async () => {
    const base = createCrisisLineageFixture();
    const repeated = mutateCrisisFixture(base, (b) =>
      Object.assign(b.deliveryAllocations!, {
        lots: [...b.deliveryAllocations!.lots, ...b.deliveryAllocations!.lots],
      }),
    );
    expect(metric(await read(repeated)).eligible).toEqual(
      metric(await read(base)).eligible,
    );
    expect(metric(await read(repeated)).historicalSettledCosts).toEqual([
      { amount: '6', currency: 'GCU' },
    ]);
  });
  it('rejects changed bytes for the same allocation identity', async () => {
    const base = createCrisisLineageFixture();
    const bad = mutateCrisisFixture(base, (b) =>
      Object.assign(b.deliveryAllocations!, {
        lots: [
          ...b.deliveryAllocations!.lots,
          {
            ...b.deliveryAllocations!.lots[0]!,
            quantity: { amount: '1', unit: 'tonne' },
          },
        ],
      }),
    );
    await expect(read(bad)).rejects.toThrow('CONFLICTING_ALLOCATION_IDENTITY');
  });
  it('rejects canonical authoritative duplicate transitions rather than repairing them', async () => {
    const bad = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.prefix!, {
        records: [...b.prefix!.records, ...b.prefix!.records.slice(-1)],
      }),
    );
    await expect(read(bad)).rejects.toThrow();
  });
  it('rejects opening and delivered credits sharing the same stable contribution lot', async () => {
    const bad = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.deliveryAllocations!.lots[0]!, {
        contributionLotRef: 'LOT_OPENING',
      }),
    );
    await expect(read(bad)).rejects.toThrow(
      'CONTRIBUTION_LOT_REUSED_OR_CHANGED',
    );
  });
  it('rejects aggregate split allocations exceeding one source credit', async () => {
    const bad = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.deliveryAllocations!, {
        lots: [
          {
            ...b.deliveryAllocations!.lots[0]!,
            quantity: { amount: '1.25', unit: 'tonne' },
          },
          {
            ...b.deliveryAllocations!.lots[0]!,
            allocationRef: 'ALLOCATION_SPLIT_2',
            contributionLotRef: 'LOT_SPLIT_2',
            quantity: { amount: '1', unit: 'tonne' },
          },
        ],
      }),
    );
    await expect(read(bad)).rejects.toThrow(
      'AGGREGATE_ALLOCATION_EXCEEDS_CANONICAL_CREDIT',
    );
  });
  it('permits exact source-owned fractional allocation, not partial delivery execution', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.deliveryAllocations!.lots[0]!, {
        quantity: { amount: '0.125', unit: 'tonne' },
      }),
    );
    const result = metric(await read(fixture));
    expect(result.eligible.amount).toBe('3.375');
    expect(result.gap.amount).toBe('6.625');
    expect(result.historicalSettledCosts).toEqual([
      { amount: '6', currency: 'GCU' },
    ]);
  });
  it('preserves exact quantities above2^53 with fractional input credit', async () => {
    const result = metric(
      await read(
        createCrisisLineageFixture({
          baseline: '9007199254740993.125',
          target: '9007199254741000',
        }),
      ),
    );
    expect(result.eligible.amount).toBe('9007199254740995.125');
    expect(result.gap.amount).toBe('4.875');
  });
  it('only gap may clamp to zero after excess valid contribution', async () => {
    const result = metric(
      await read(createCrisisLineageFixture({ target: '1' })),
    );
    expect(result.eligible.amount).toBe('5.25');
    expect(result.gap.amount).toBe('0');
  });
  it.each([
    ['2026-10-01T23:59:59.999Z', '3.25'],
    ['2026-10-02T00:00:00.000Z', '5.25'],
    ['2026-10-15T23:59:59.999Z', '5.25'],
    ['2026-10-16T00:00:00.000Z', '3.25'],
  ])(
    'uses separate actual committed-cutoff witness at%s, not earlier command/event/receipt time',
    async (time, total) => {
      const fixture = createCrisisLineageFixture({
        actualEligibilityAtReal: time,
      });
      expect(fixture.body.prefix!.records.at(-1)!.receipt.recordedAtReal).toBe(
        '2026-10-01T00:00:00.000Z',
      );
      expect(metric(await read(fixture)).eligible.amount).toBe(total);
      expect(metric(await read(fixture)).formalClock).toBe(null);
    },
  );
  it('rejects a classification label that contradicts actual witness UTC', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.eligibility!.witnesses[0]!, {
        committedEligibility: 'COMMITTED_BEFORE_START',
      }),
    );
    await expect(read(fixture)).rejects.toThrow(
      'ELIGIBILITY_CUTOFF_CLASSIFICATION_MISMATCH',
    );
  });
  it('does not count reserve/transit stages or expected arrival as delivery', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) => {
      Object.assign(b.prefix!, { records: b.prefix!.records.slice(0, 2) });
      Object.assign(b.held, { worldVersion: '2', eventSequence: '2' });
      Object.assign(b.deliveryAllocations!, { lots: [] });
      Object.assign(b.eligibility!, { witnesses: [] });
    });
    const result = metric(await read(fixture));
    expect(result.eligible.amount).toBe('3.25');
    expect(result.historicalSettledCosts).toEqual([]);
  });
  it.each([
    'opening',
    'rule',
    'prefix',
    'activityWindow',
    'openingAllocations',
    'deliveryAllocations',
    'eligibility',
    'adjustments',
  ] as const)('does not substitute null%s source with zero', async (key) => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b, { [key]: null }),
    );
    noQuantities(await read(fixture), 'TEST_ONLY_UNAVAILABLE');
  });
  it('does not substitute unknown target, allocation, prefix or witness with zero', async () => {
    const cases = [
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.rule!, { target: null }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.openingAllocations!, { completeness: 'UNKNOWN' }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.prefix!, { completeness: 'UNKNOWN' }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.eligibility!.witnesses[0]!, {
          committedEligibility: 'UNKNOWN',
        }),
      ),
    ];
    for (const c of cases) noQuantities(await read(c), 'TEST_ONLY_UNAVAILABLE');
  });
  it('requires explicit candidate allocation and actual witness; destination alone is insufficient', async () => {
    const absent = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.deliveryAllocations!, { lots: [] }),
    );
    noQuantities(await read(absent), 'TEST_ONLY_UNAVAILABLE');
    const noWitness = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.eligibility!, { witnesses: [] }),
    );
    noQuantities(await read(noWitness), 'TEST_ONLY_UNAVAILABLE');
  });
  it('honours source-owned explicit exclusion', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.deliveryAllocations!.lots[0]!, {
        disposition: 'EXCLUDED_BY_SOURCE',
      }),
    );
    expect(metric(await read(fixture)).eligible.amount).toBe('3.25');
  });
  it.each([
    'seedId',
    'seedFingerprint',
    'openingSourceVersion',
    'worldVersion',
    'eventSequence',
  ])('rejects changed held%s instead of cross-source mixing', async (key) => {
    const bad = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.held, { [key]: 'CHANGED' }),
    );
    await expect(read(bad)).rejects.toThrow();
  });
  it('rejects mismatched source document bytes, component pin and rule fingerprint', async () => {
    const base = createCrisisLineageFixture();
    for (const bad of [
      rawEdit(base, (b) =>
        Object.assign(b.sourceDocuments[0]!, {
          canonicalBytes: b.sourceDocuments[0]!.canonicalBytes + ' ',
        }),
      ),
      rawEdit(base, (b) =>
        Object.assign(b.rule!.pin, { sourceVersion: 'WRONG' }),
      ),
      rawEdit(base, (b) =>
        Object.assign(b.rule!, { ruleFingerprint: 'sha256:' + '0'.repeat(64) }),
      ),
    ])
      await expect(read(bad)).rejects.toThrow();
  });
  it('rejects wrong commodity, quantity unit and financial native currency', async () => {
    for (const bad of [
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.rule!, { commodityId: 'STEEL' }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.deliveryAllocations!.lots[0]!, {
          quantity: { amount: '2', unit: 'kg' },
        }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.prefix!.records.at(-1)!.financialPostingBatches[0]!, {
          settlementCurrency: 'USD',
        }),
      ),
    ])
      await expect(read(bad)).rejects.toThrow();
  });
  it('rejects known missing dualposting or reused Event under a new posting identity', async () => {
    const noCash = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.prefix!.records.at(-1)!, { financialPostingBatches: [] }),
    );
    await expect(read(noCash)).rejects.toThrow(
      'DELIVERY_DUAL_FACTS_INCOMPLETE',
    );
    const reused = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.prefix!.records.at(-1)!, {
        inventoryPostings: [
          ...b.prefix!.records.at(-1)!.inventoryPostings,
          {
            ...b.prefix!.records.at(-1)!.inventoryPostings[0]!,
            postingId: 'POSTING_CHANGED',
          },
        ],
      }),
    );
    await expect(read(reused)).rejects.toThrow();
  });
  it('rejects a missing receipt, Event or prefix transition without partial totals', async () => {
    const noReceipt = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.prefix!.records.at(-1)!, {
        receipt: {
          ...b.prefix!.records.at(-1)!.receipt,
          outcome: 'REJECTED',
          reasonCode: 'REJECTED_FIXTURE',
        },
      }),
    );
    await expect(read(noReceipt)).rejects.toThrow();
    const noEvent = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.prefix!.records.at(-1)!.transition, { events: [] }),
    );
    await expect(read(noEvent)).rejects.toThrow();
    const noRecord = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.prefix!, { records: b.prefix!.records.slice(1) }),
    );
    await expect(read(noRecord)).rejects.toThrow();
  });
  it('unsupported partial/return/refund adjustment makes the entire measure unavailable', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.adjustments!, { semantics: 'UNSUPPORTED_OR_UNKNOWN' }),
    );
    noQuantities(await read(fixture), 'TEST_ONLY_UNAVAILABLE');
  });
  it('known malformed correction and double correction remain integrity failures, not clamps', async () => {
    const ref = {
      adjustmentEventId: 'EVENT_COMMAND_CRISIS_DELIVER',
      originalContributionLotRef: 'LOT_OPENING',
      inventoryPostingId: 'POSTING_CRISIS_DELIVER',
      financialBatchId: 'BATCH_CRISIS_DELIVERY_CASH',
      receiptCanonicalFingerprint: 'sha256:' + '0'.repeat(64),
    };
    const malformed = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.adjustments!, {
        semantics: 'UNSUPPORTED_OR_UNKNOWN',
        sourceRefs: [ref],
      }),
    );
    await expect(read(malformed)).rejects.toThrow(
      'CORRECTION_ORIGINAL_RECEIPT_LINK_INVALID',
    );
    const duplicate = mutateCrisisFixture(
      createCrisisLineageFixture({ unsupportedCorrectionAmounts: ['0.25'] }),
      (b) =>
        Object.assign(b.adjustments!, {
          semantics: 'UNSUPPORTED_OR_UNKNOWN',
          sourceRefs: [
            ...b.adjustments!.sourceRefs,
            ...b.adjustments!.sourceRefs,
          ],
        }),
    );
    await expect(read(duplicate)).rejects.toThrow(
      'DUPLICATE_CORRECTION_REFERENCE',
    );
  });
  it.each([['2'], ['0.75', '0.75']])(
    'known individual or aggregate reversal%s cannot exceed original allocated credit',
    async (...amounts) => {
      const fixture = createCrisisLineageFixture({
        openingAllocationAmount: '1.25',
        unsupportedCorrectionAmounts: amounts,
      });
      await expect(read(fixture)).rejects.toThrow(
        'CORRECTION_OVER_REVERSES_ORIGINAL_CREDIT',
      );
    },
  );
  it('a bounded canonical generic correction still cannot enable an unsupported positive subtraction/refund', async () => {
    noQuantities(
      await read(
        createCrisisLineageFixture({ unsupportedCorrectionAmounts: ['0.25'] }),
      ),
      'TEST_ONLY_UNAVAILABLE',
    );
  });
  it('exact read entitlement does not require an action capability', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.currentAuthorization!, { capabilities: [] }),
    );
    expect(metric(await read(fixture)).eligible.amount).toBe('5.25');
  });
  it('inert V14 handoff creates neither input credit nor commissioned capacity', async () => {
    const result = metric(
      await read(createCrisisLineageFixture({ inertV14Handoff: true })),
    );
    expect(result.eligible.amount).toBe('5.25');
    expect(result).not.toHaveProperty('commissionedCapacity');
  });
  it('an unknown canonical posting contract makes the entire measure unavailable, but altered hashes are integrity failures', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) => {
      const p = b.prefix!.records.at(-1)!.inventoryPostings[0]!;
      Object.assign(p, { operation: 'UNSUPPORTED_PARTIAL_DELIVERY' });
      Object.assign(p, {
        fingerprint: fixtureCoreFingerprint(
          Object.fromEntries(
            Object.entries(p).filter(([key]) => key !== 'fingerprint'),
          ),
        ),
      });
    });
    noQuantities(await read(fixture), 'TEST_ONLY_UNAVAILABLE');
    const corrupt = mutateCrisisFixture(fixture, (b) =>
      Object.assign(b.prefix!.records.at(-1)!.inventoryPostings[0]!, {
        fingerprint: 'sha256:' + '0'.repeat(64),
      }),
    );
    await expect(read(corrupt)).rejects.toThrow(
      'UNKNOWN_POSTING_CANONICAL_HASH_MISMATCH',
    );
  });
  it('rechecks isolated-use scope after the awaited single read', async () => {
    const fixture = createCrisisLineageFixture();
    const result = await readIsolatedCrisisContribution(
      {
        readSnapshot: async () => {
          vi.stubEnv('NODE_ENV', 'production');
          return fixture;
        },
      },
      fixtureSelection,
    );
    noQuantities(result, 'TEST_ONLY_UNAVAILABLE');
  });
  it('caller mutation during the single read cannot retarget the captured selection', async () => {
    const fixture = createCrisisLineageFixture();
    const requested = { ...fixtureSelection };
    const result = await readIsolatedCrisisContribution(
      {
        readSnapshot: async (selection) => {
          expect(selection).toEqual(fixtureSelection);
          requested.countryId = 'COUNTRY_99';
          return fixture;
        },
      },
      requested,
    );
    expect(metric(result).eligible.amount).toBe('5.25');
  });
  it('unknown enum labels cannot act as complete source or authorized allocation', async () => {
    const fixtures = [
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.deliveryAllocations!.lots[0]!, {
          disposition: 'APPROVED',
        }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.prefix!, { completeness: 'APPROVED' }),
      ),
      mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.currentAuthorization!, {
          entitlementState: 'APPROVED',
        }),
      ),
    ];
    for (const fixture of fixtures)
      await expect(read(fixture)).rejects.toThrow();
  });
  it.each([
    'membershipState',
    'entitlementState',
    'countryId',
    'officeId',
    'teamId',
    'authorizationRevision',
  ])(
    'revoked/wrong auth%s is DENIED without private quantities',
    async (key) => {
      const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
        Object.assign(b.currentAuthorization!, {
          [key]: key.endsWith('State') ? 'REVOKED' : 'WRONG',
        }),
      );
      noQuantities(await read(fixture), 'TEST_ONLY_DENIED');
    },
  );
  it('action capability or membership alone is not an exact read entitlement', async () => {
    const base = createCrisisLineageFixture();
    const noRead = mutateCrisisFixture(base, (b) =>
      Object.assign(b.currentAuthorization!, { readableMetricIds: [] }),
    );
    noQuantities(await read(noRead), 'TEST_ONLY_DENIED');
    const noDisclosure = mutateCrisisFixture(base, (b) =>
      Object.assign(b.currentAuthorization!, { disclosureRuleRef: null }),
    );
    noQuantities(await read(noDisclosure), 'TEST_ONLY_UNAVAILABLE');
  });
  it('formal path stays unavailable for forged approved/test-envelope inputs and missing clock', async () => {
    expect(
      Reflect.apply(readFormalCrisisContribution, null, [
        { approved: true },
        createCrisisLineageFixture(),
      ]),
    ).toEqual({
      status: 'UNAVAILABLE',
      reason: 'FORMAL_CRISIS_SOURCE_PORT_NOT_INSTALLED',
    });
  });
  it('production environment cannot construct or consume isolated fixtures', async () => {
    const fixture = createCrisisLineageFixture();
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => createCrisisLineageFixture()).toThrow(
      'CRISIS_FIXTURE_ISOLATED_ENVIRONMENT_REQUIRED',
    );
    const port = { readSnapshot: vi.fn(async () => fixture) };
    noQuantities(
      await readIsolatedCrisisContribution(port, fixtureSelection),
      'TEST_ONLY_UNAVAILABLE',
    );
    expect(port.readSnapshot).not.toHaveBeenCalled();
  });
  it('over-limit metadata is unavailable rather than truncated positive', async () => {
    const fixture = mutateCrisisFixture(createCrisisLineageFixture(), (b) =>
      Object.assign(b.rule!, { ruleId: 'X'.repeat(1025) }),
    );
    noQuantities(await read(fixture), 'TEST_ONLY_UNAVAILABLE');
  });
});
