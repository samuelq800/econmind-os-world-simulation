import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractPinnedAcceptedFreight,
  inspectUntrustedAcceptedFreight,
} from './accepted-freight.mjs';
import { parseLossless } from '../unknown2544-c-physical/candidate.mjs';

const transportBytes = readFileSync(
  '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/RECONSTRUCTION_TRANSPORT_EVENTS.json',
);
const catalogueBytes = readFileSync(
  new URL(
    '../../artifacts/world-balanced-candidate-v1/data/commodity-catalog.json',
    import.meta.url,
  ),
);
const pinned = { transportBytes, catalogueBytes };

// Mutations are inspectable TEST_ONLY semantic checks, never repinned sources.
function inspect(mutate = () => {}) {
  const transport = parseLossless(transportBytes);
  const catalogue = parseLossless(catalogueBytes);
  mutate(transport, catalogue, transport.events[780], transport.orders[2]);
  const output = inspectUntrustedAcceptedFreight({
    transportBytes: Buffer.from(JSON.stringify(transport)),
    catalogueBytes: Buffer.from(JSON.stringify(catalogue)),
  });
  assert.equal(output.sourceBytesVerified, false);
  assert.equal(output.class, 'UNVERIFIED_REFERENCE_INSPECTION_ONLY');
  return output;
}
function fails(mutate, diagnostic) {
  const output = inspect(mutate);
  assert.equal(output.status, 'REJECTED');
  assert.equal(output.derivedReferenceFreightTonnes, null);
  assert.deepEqual(output.diagnostics, [diagnostic]);
}

test('actual immutable retained source: lossless equipment units -> 199.8 reference tonnes', () => {
  const output = extractPinnedAcceptedFreight(pinned);
  assert.equal(output.status, 'REFERENCE_ONLY');
  assert.equal(output.sourceBytesVerified, true);
  assert.equal(output.derivedReferenceFreightTonnes, '199.8');
  assert.equal(output.operands.acceptedNativeRawToken, '39.96');
  assert.equal(output.operands.sourceTonnesPerUnitRawToken, '5.0');
  assert.equal(output.operands.nativePhysicalUnit, 'equipment unit');
  assert.equal(output.identity.sellerCountryNumber, '24');
  assert.equal(output.identity.buyerCountryNumber, '13');
  assert.equal(
    output.identity.aggregateOrderStatus,
    'FUNDED_UNDELIVERED_REMAINDER',
  );
  assert.equal(output.matchingEventRows, 1);
  assert.equal(output.uniqueAcceptedEvents, 1);
  assert.equal(output.provenance.transport.bytes, 1833026);
  assert.equal(output.sourceCountsAsDeliveredGoods, true);
  assert.equal(output.provenance.catalogue.bytes, 1933);
});

test('source byte drift cannot be repinned or downgraded to a source positive', () => {
  for (const key of ['transportBytes', 'catalogueBytes']) {
    assert.throws(
      () =>
        extractPinnedAcceptedFreight({
          ...pinned,
          [key]: Buffer.concat([pinned[key], Buffer.from(' ')]),
        }),
      /SOURCE_DRIFT/u,
    );
  }
});

test('funded or aggregate quantity substituted into the event cannot pass fixed pins', () => {
  for (const quantity of ['8000.0', '4235.760000000003', '39.97']) {
    assert.throws(
      () =>
        extractPinnedAcceptedFreight({
          ...pinned,
          transportBytes: Buffer.from(
            transportBytes
              .toString()
              .replace(
                '"acceptedNative": "39.96"',
                `"acceptedNative": "${quantity}"`,
              ),
          ),
        }),
      /TRANSPORT_SOURCE_DRIFT/u,
    );
  }
});

test('null/empty accepted quantity cannot become zero or use aggregate fallback', () => {
  for (const missing of [null, '']) {
    const output = inspect((_t, _c, e) => {
      e.sourceEvent.acceptedNative = missing;
    });
    assert.equal(output.status, 'GAP');
    assert.deepEqual(output.diagnostics, ['MISSING_ACCEPTED_QUANTITY']);
    assert.equal(output.derivedReferenceFreightTonnes, null);
  }
});

test('missing acceptance flags are rejected, not inferred from an order/payment', () => {
  for (const flag of ['countsAsDeliveredGoods', 'countsAsWorldReceipt']) {
    fails((_t, _c, e) => {
      delete e[flag];
    }, 'ACCEPTED_REFERENCE_EVENT_REQUIRED');
  }
});

test('invalid freight factor fails; scientific factor remains exact', () => {
  fails((_t, c) => {
    c[9].freightTonnesPerUnit = '-5';
  }, 'NONNEGATIVE_FINITE_DECIMAL_REQUIRED');
  const output = inspect((_t, c) => {
    c[9].freightTonnesPerUnit = '5.000e0';
  });
  assert.equal(output.derivedReferenceFreightTonnes, '199.8');
  assert.equal(output.operands.sourceTonnesPerUnitRawToken, '5.000e0');
});

test('funded/aggregate quantities, loss and reference payment are never event operands', () => {
  const output = inspect((_t, _c, event, order) => {
    order.fundedNativeUnits = '999999';
    order.acceptedNativeUnits = '4235.760000000003';
    event.sourceEvent.lostNative = '88888';
    event.sourceEvent.actualPaidReferenceGcu = '999000.0';
  });
  assert.equal(output.derivedReferenceFreightTonnes, '199.8');
  assert.equal(output.completeNativeCost, null);
});

for (const [label, mutate] of [
  [
    'accepted quantity',
    (_t, _c, e) => {
      delete e.sourceEvent.acceptedNative;
    },
  ],
  [
    'physical unit',
    (_t, c) => {
      delete c[9].unit;
    },
  ],
  [
    'freight factor',
    (_t, c) => {
      delete c[9].freightTonnesPerUnit;
    },
  ],
]) {
  test(`missing ${label} remains gap/null, never funded/aggregate fallback or zero`, () => {
    const output = inspect(mutate);
    assert.equal(output.status, 'GAP');
    assert.equal(output.derivedReferenceFreightTonnes, null);
    assert.equal(output.uniqueAcceptedEvents, null);
  });
}

for (const [label, mutate, diagnostic] of [
  [
    'trip',
    (_t, _c, e) => {
      e.sourceEvent.tripId = 'OTHER';
    },
    'SELECTED_EVENT_IDENTITY_MISMATCH',
  ],
  [
    'pointer',
    (_t, _c, e) => {
      e.sourcePointer = '/other';
    },
    'SELECTED_EVENT_IDENTITY_MISMATCH',
  ],
  [
    'order',
    (_t, _c, _e, o) => {
      o.orderId = 'OTHER';
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'commodity',
    (_t, _c, _e, o) => {
      o.commodityId = 'STEEL';
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'seller/buyer swap',
    (_t, _c, _e, o) => {
      o.sellerCountry = '13';
      o.buyerCountry = '24';
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'outer seller',
    (_t, _c, e) => {
      e.country = '13';
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'destination',
    (_t, _c, e) => {
      e.sourceEvent.destinationNodeId = 'visual-territory-12';
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'source node',
    (_t, _c, e) => {
      e.sourceEvent.sourceNodeId = 'OTHER';
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'planned type',
    (_t, _c, e) => {
      e.type = 'PLANNED';
    },
    'ACCEPTED_REFERENCE_EVENT_REQUIRED',
  ],
  [
    'in-transit source type',
    (_t, _c, e) => {
      e.sourceEvent.type = 'IN_TRANSIT';
    },
    'ACCEPTED_REFERENCE_EVENT_REQUIRED',
  ],
  [
    'not accepted status',
    (_t, _c, e) => {
      e.status = 'PLANNED';
    },
    'ACCEPTED_REFERENCE_EVENT_REQUIRED',
  ],
  [
    'not delivered flag',
    (_t, _c, e) => {
      e.countsAsDeliveredGoods = false;
    },
    'ACCEPTED_REFERENCE_EVENT_REQUIRED',
  ],
  [
    'receipt promotion',
    (_t, _c, e) => {
      e.countsAsWorldReceipt = true;
    },
    'ACCEPTED_REFERENCE_EVENT_REQUIRED',
  ],
  [
    'posting promotion',
    (t) => {
      t.actualWorldPosting = true;
    },
    'WORLD_POSTING_NOT_FALSE',
  ],
  [
    'order posting',
    (_t, _c, _e, o) => {
      o.actualWorldPosting = true;
    },
    'ORDER_COMMODITY_PARTY_DESTINATION_MISMATCH',
  ],
  [
    'day mismatch',
    (_t, _c, e) => {
      e.sourceEvent.simDay1 = '36';
    },
    'REFERENCE_EVENT_TIME_MISMATCH',
  ],
  [
    'source version',
    (t) => {
      t.version = 'ACTUAL';
    },
    'SOURCE_VERSION_MISMATCH',
  ],
  [
    'catalogue identity',
    (_t, c) => {
      c[9].id = 'STEEL';
    },
    'COMMODITY_IDENTITY_MISMATCH',
  ],
  [
    'wrong unit',
    (_t, c) => {
      c[9].unit = 'tonne';
    },
    'PHYSICAL_UNIT_MISMATCH',
  ],
  [
    'zero factor',
    (_t, c) => {
      c[9].freightTonnesPerUnit = '0';
    },
    'POSITIVE_FREIGHT_FACTOR_REQUIRED',
  ],
  [
    'duplicate order join',
    (t, _c, _e, o) => {
      t.orders.push(structuredClone(o));
    },
    'ORDER_ID_NOT_UNIQUE',
  ],
  [
    'duplicate catalogue join',
    (_t, c) => {
      c.push(structuredClone(c[9]));
    },
    'COMMODITY_IDENTITY_MISMATCH',
  ],
]) {
  test(`reject ${label}`, () => fails(mutate, diagnostic));
}

test('identical immutable accepted event replay is counted once', () => {
  const output = inspect((t, _c, e) => {
    t.events.push(structuredClone(e));
  });
  assert.equal(output.derivedReferenceFreightTonnes, '199.8');
  assert.equal(output.matchingEventRows, 2);
  assert.equal(output.uniqueAcceptedEvents, 1);
});
for (const field of ['acceptedNative', 'tripId', 'destinationNodeId']) {
  test(`conflicting event replay rejects ${field}`, () =>
    fails((t, _c, e) => {
      const duplicate = structuredClone(e);
      duplicate.sourceEvent[field] = 'CONFLICT';
      t.events.push(duplicate);
    }, 'CONFLICTING_EVENT_DUPLICATE'));
}

for (const [token, expected] of [
  ['39.960000000000000001', '199.800000000000000005'],
  ['3.996e1', '199.8'],
  ['1e-20', '0.00000000000000000005'],
  ['0', '0'],
]) {
  test(`exact finite lexical quantity ${token}`, () => {
    const output = inspect((_t, _c, e) => {
      e.sourceEvent.acceptedNative = token;
    });
    assert.equal(output.derivedReferenceFreightTonnes, expected);
    assert.equal(output.operands.acceptedNativeRawToken, token);
  });
}
for (const token of ['NaN', '-1', 'Infinity', '1e1001', '1e-1001']) {
  test(`invalid/unrepresentable quantity ${token} fails without rounding`, () => {
    const output = inspect((_t, _c, e) => {
      e.sourceEvent.acceptedNative = token;
    });
    assert.equal(output.status, 'REJECTED');
    assert.equal(output.derivedReferenceFreightTonnes, null);
    assert.equal(output.diagnostics.length, 1);
  });
}

test('numeric JSON lexemes retain tails and scientific factor before arithmetic', () => {
  const output = inspectUntrustedAcceptedFreight({
    transportBytes: Buffer.from(
      transportBytes
        .toString()
        .replace(
          '"acceptedNative": "39.96"',
          '"acceptedNative": 39.960000000000000001',
        ),
    ),
    catalogueBytes: Buffer.from(
      catalogueBytes
        .toString()
        .replace('"freightTonnesPerUnit": 5.0', '"freightTonnesPerUnit": 5e0'),
    ),
  });
  assert.equal(output.operands.acceptedNativeRawToken, '39.960000000000000001');
  assert.equal(output.operands.sourceTonnesPerUnitRawToken, '5e0');
  assert.equal(output.derivedReferenceFreightTonnes, '199.800000000000000005');
});

test('reference conversion never closes originals or fabricates authority/cost/distance', () => {
  for (const output of [extractPinnedAcceptedFreight(pinned), inspect()]) {
    for (const key of [
      'referenceTonneKm',
      'actualAcceptedFreightTonnes',
      'actualTonneKm',
      'periodMinimum',
      'completeNativeCost',
    ])
      assert.equal(output[key], null);
    for (const key of [
      'countsAsWorldReceipt',
      'actualWorldPosting',
      'sourceAdmitted',
      'productionAuthority',
      'actualEntityMappingEstablished',
      'actualClockOrPeriodAdopted',
    ])
      assert.equal(output[key], false);
    assert.ok(
      Object.values(output.originalStages).every((stage) => stage === false),
    );
    assert.equal(output.originalIdsStillOpen.length, 2);
    assert.equal(output.sourceStatus, 'RETAINED_REFERENCE_ONLY');
    assert.equal(output.provenance.upstreamJournalReread, false);
  }
});
