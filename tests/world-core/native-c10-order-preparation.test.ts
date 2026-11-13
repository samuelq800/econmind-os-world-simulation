// Pure TEST_ONLY facts; no native/SQL evidence is claimed.
import { it as test } from 'vitest';
import assert from 'node:assert/strict';
const { assembleC10Orders } = await import(
  new URL(
    '../../tools/office-connection/native-c10-order-preparation.mjs',
    import.meta.url,
  ).href
);
const position = {
  positionId: 'P10',
  poolId: 'POOL10',
  regionId: 'R10',
  cohortRef: 'COHORT10',
  sourceStartOrdinal: '0',
  startOrdinal: '10',
  count: '2',
  skill: 'LOW',
  annualWage: '172800',
  currency: 'LC10',
  householdAccountId: 'AGGREGATE_HH',
};
const labour = {
  sourceRef: 'LABOUR_TEST_ONLY',
  sourceRawSha256: 'a'.repeat(64),
  positions: [position],
};
const source = {
  worldId: 'WORLD_TEST_ONLY',
  countryId: 'COUNTRY_10',
  facilityId: 'OPEN-10-REFINED_FUEL',
  operatorId: 'OP_10',
  seedFingerprint: 'sha256:' + 'b'.repeat(64),
  labourSource: labour,
  workOriginals: [],
  expenseOriginals: [],
};
const request = {
  runId: 'RUN_TEST_ONLY',
  transferId: 'TRANSFER_TEST_ONLY',
  startsAtSimTime: '0',
  endsAtSimTime: '60000',
};
const input = {
  source,
  transfer: { request, status: 'IN_TRANSIT', payments: [] },
  bookings: [],
  currentPositions: [
    { positionId: 'P10', locationId: 'R10', skill: 'LOW', employedCount: '2' },
  ],
  now: '0',
  work: { count: '2', startsAtSimTime: '0', endsAtSimTime: '60000' },
  refPrefix: 'C10_TEST_ONLY',
};
test('real scheduled ranges are not completed work before clock reaches end', () => {
  const r = assembleC10Orders(input);
  assert.equal(r.status, 'WAIT_FOR_ACTUAL_CLOCK');
  const b = JSON.parse(r.orders[0].rawText);
  assert.equal(b.allocations[0].startOrdinal, '10');
  assert.equal(b.allocations[0].personMilliseconds, '120000');
  assert.equal(b.labourSourceRef, labour.sourceRef);
  assert(!('workEventFingerprint' in b));
});
test('occupied actual range is refused, not reassigned outside source', () => {
  const r = assembleC10Orders({
    ...input,
    bookings: [
      {
        regionId: 'R10',
        startOrdinal: '10',
        count: '2',
        startsAtSimTime: '0',
        endsAtSimTime: '60000',
      },
    ],
  });
  assert.equal(r.status, 'NO_CURRENT_UNOCCUPIED_LOGISTICS_PERSON_RANGE');
  assert.equal(r.orders.length, 0);
});
test('PAY derives actual committed work and exact child ordinal payees, subtracting prior payments', () => {
  const allocation = JSON.parse(assembleC10Orders(input).orders[0].rawText)
    .allocations[0];
  const child = {
    groups: [
      {
        groupId: 'G1',
        locationId: 'R10',
        firstPersonOrdinal: '10',
        population: '1',
      },
      {
        groupId: 'G2',
        locationId: 'R10',
        firstPersonOrdinal: '11',
        population: '1',
      },
    ],
    subaccounts: [
      { groupId: 'G1', account: { accountId: 'CHILD_1', currency: 'LC10' } },
      { groupId: 'G2', account: { accountId: 'CHILD_2', currency: 'LC10' } },
    ],
  };
  const r = assembleC10Orders({
    ...input,
    source: { ...source, beneficialReceipt: child },
    transfer: {
      request,
      status: 'WORKED',
      work: {
        allocations: [allocation],
        labour,
        eventFingerprint: 'sha256:' + 'c'.repeat(64),
      },
      payments: [
        { householdAccountId: 'CHILD_1', currency: 'LC10', amount: '0.25' },
      ],
    },
  });
  assert.deepEqual(
    r.orders.map((o: { rawText: string }) => {
      const b = JSON.parse(o.rawText);
      return [b.householdAccountId, b.amount];
    }),
    [
      ['CHILD_1', '0.75'],
      ['CHILD_2', '1'],
    ],
  );
  assert(
    r.orders.every(
      (o: { rawText: string }) => !o.rawText.includes('AGGREGATE_HH'),
    ),
  );
});
test('six-place payable amount retains rational wage remainder', () => {
  const allocation = JSON.parse(
    assembleC10Orders({ ...input, work: { ...input.work, count: '1' } })
      .orders[0].rawText,
  ).allocations[0];
  const r = assembleC10Orders({
    ...input,
    transfer: {
      request,
      status: 'WORKED',
      work: {
        allocations: [allocation],
        labour: { ...labour, positions: [{ ...position, annualWage: '1' }] },
        eventFingerprint: 'sha256:' + 'c'.repeat(64),
      },
      payments: [],
    },
  });
  assert.equal(JSON.parse(r.orders[0].rawText).amount, '0.000005');
  assert(BigInt(r.remainders[0].numerator) > 0n);
});
test('no source group map produces no guessed aggregate payment', () => {
  const allocation = JSON.parse(assembleC10Orders(input).orders[0].rawText)
    .allocations[0];
  assert.throws(
    () =>
      assembleC10Orders({
        ...input,
        source: {
          ...source,
          beneficialReceipt: { groups: [], subaccounts: [] },
        },
        transfer: {
          request,
          status: 'WORKED',
          work: {
            allocations: [allocation],
            labour,
            eventFingerprint: 'sha256:' + 'c'.repeat(64),
          },
          payments: [],
        },
      }),
    /COMPLETE_NONOVERLAPPING_CHILD_MAPPING/,
  );
});
test('pending registered wage order is reused instead of minting another payment reference', () => {
  const allocation = JSON.parse(
    assembleC10Orders({ ...input, work: { ...input.work, count: '1' } })
      .orders[0].rawText,
  ).allocations[0];
  const actual = {
    ...input,
    transfer: {
      request,
      status: 'WORKED',
      work: {
        allocations: [allocation],
        labour,
        eventFingerprint: 'sha256:' + 'c'.repeat(64),
      },
      payments: [],
    },
  };
  const first = assembleC10Orders(actual).orders[0];
  const resumed = assembleC10Orders({
    ...actual,
    source: { ...source, expenseOriginals: [first] },
    refPrefix: 'DIFFERENT_CALLER_PREFIX',
  });
  assert.deepEqual(resumed.orders, [first]);
});
