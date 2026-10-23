import { createHash } from 'node:crypto';
import {
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import {
  createOriginalFieldConsumer,
  SOURCE_PINS,
  ORIGINAL_IDS,
} from '../../tools/unknown2544-c-original-fields/bridge.mjs';

type Obj = Record<string, unknown>;
type Pin = { bytes: number; sha256: string };
type Row = {
  stableId: string;
  countryId: string;
  candidateMeasure: { unit: string; value: null };
};
type Packet = {
  rows: Row[];
  subset: {
    count: number;
    exactOriginalIds: string[];
    parentBatches: { batchId: string; subsetCount: number }[];
  };
  [key: string]: unknown;
};
type Consumer = { snapshot(): Packet; read(input: Obj): Obj };
const obj = (v: unknown) => v as Obj;
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const digest = (v: unknown) => hash(Buffer.from(JSON.stringify(v)));
const missing = [
  'ledger',
  'batches',
  'physical',
  'waterRecovery',
  'repair',
  'transport',
];
const reuse = {
  water: new URL(
    '../../artifacts/world-balanced-candidate-v1/data/water-allocations.json',
    import.meta.url,
  ),
  trade: new URL(
    '../../artifacts/world-balanced-candidate-v1/data/trade-plans.json',
    import.meta.url,
  ),
  ownerReceipt: new URL(
    '../../docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    import.meta.url,
  ),
  owner: new URL(
    '../../docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    import.meta.url,
  ),
  catalogue: new URL(
    '../../artifacts/world-balanced-candidate-v1/data/commodity-catalog.json',
    import.meta.url,
  ),
};
const manifestUrl = new URL(
  '../fixtures/c-country13-transport-reference/manifest.v1.json',
  import.meta.url,
);
const bundleUrl = new URL(
  '../fixtures/c-country13-transport-reference/source-bytes-v1.json.gz',
  import.meta.url,
);
function boundedRead(url: URL, max: number) {
  const s = statSync(url);
  assert(s.isFile() && s.size <= max);
  const b = readFileSync(url);
  assert(b.length <= max);
  return b;
}
function closed(value: unknown, keys: string[]) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function pinned(b: Buffer, pin: Pin) {
  assert.equal(b.length, pin.bytes);
  assert.equal(hash(b), pin.sha256);
}
function decodeEntry(e: unknown, expected: { key: string } & Pin) {
  closed(e, ['key', 'bytes', 'sha256', 'dataBase64']);
  const entry = e as {
    key: string;
    bytes: number;
    sha256: string;
    dataBase64: string;
  };
  assert.equal(entry.key, expected.key);
  assert.equal(entry.bytes, expected.bytes);
  assert.equal(entry.sha256, expected.sha256);
  assert.equal(typeof entry.dataBase64, 'string');
  assert.equal(entry.dataBase64.length, 4 * Math.ceil(expected.bytes / 3));
  // Linear scan: repeated-group validation can exhaust V8's regex stack on
  // the exact large ledger. Re-encoding below enforces padding/canonical bits.
  assert(!/[^A-Za-z0-9+/=]/u.test(entry.dataBase64));
  const bytes = Buffer.from(entry.dataBase64, 'base64');
  assert.equal(bytes.toString('base64'), entry.dataBase64);
  pinned(bytes, expected);
  return bytes;
}
function loadFixture() {
  const mb = boundedRead(manifestUrl, 16384);
  pinned(mb, {
    bytes: 2824,
    sha256: '121facebc04ae68a3e1bf22c195a119d5da55d3d898d31ab2bf24c43958405ca',
  });
  const m = JSON.parse(mb.toString('utf8')) as {
    schemaVersion: number;
    purpose: string;
    bundle: Pin & { jsonBytes: number; jsonSha256: string };
    sources: ({
      key: string;
      delivery: string;
      trackedPath: string | null;
    } & Pin)[];
  };
  closed(m, ['schemaVersion', 'purpose', 'bundle', 'sources']);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.purpose, 'C13_TEST_ONLY');
  closed(m.bundle, ['bytes', 'sha256', 'jsonBytes', 'jsonSha256']);
  const allPins: Record<string, Pin> = {
    ...SOURCE_PINS.sources,
    transport: SOURCE_PINS.referenceExtensions.country13Transport.transport,
    catalogue: SOURCE_PINS.referenceExtensions.country13Transport.catalogue,
  };
  assert.deepEqual(
    m.sources.map((s) => s.key),
    Object.keys(allPins),
  );
  for (const s of m.sources) {
    closed(s, ['key', 'bytes', 'sha256', 'delivery', 'trackedPath']);
    assert.equal(s.bytes, allPins[s.key]!.bytes);
    assert.equal(s.sha256, allPins[s.key]!.sha256);
    assert.equal(s.delivery, missing.includes(s.key) ? 'BUNDLE' : 'TRACKED');
    if (missing.includes(s.key)) assert.equal(s.trackedPath, null);
    else assert(Object.hasOwn(reuse, s.key));
  }
  const gz = boundedRead(bundleUrl, 1048576);
  pinned(gz, m.bundle);
  assert.equal(gz.readUInt32LE(4), 0);
  const raw = gunzipSync(gz, { maxOutputLength: 13719152 });
  assert(raw.length <= 13719152);
  assert.equal(raw.length, m.bundle.jsonBytes);
  assert.equal(hash(raw), m.bundle.jsonSha256);
  const body = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(raw),
  ) as { schemaVersion: number; purpose: string; entries: unknown[] };
  closed(body, ['schemaVersion', 'purpose', 'entries']);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.purpose, 'C13_TEST_ONLY');
  assert.equal(body.entries.length, 6);
  const bytes: Record<string, Buffer> = {};
  for (const [i, key] of missing.entries())
    bytes[key] = decodeEntry(body.entries[i], { key, ...allPins[key]! });
  assert.equal(
    missing.reduce((n, k) => n + bytes[k]!.length, 0),
    10288724,
  );
  for (const [key, url] of Object.entries(reuse)) {
    const b = boundedRead(url, allPins[key]!.bytes);
    pinned(b, allPins[key]!);
    bytes[key] = b;
  }
  return {
    legacy: Object.fromEntries(
      Object.keys(SOURCE_PINS.sources).map((k) => [k, bytes[k]!]),
    ),
    transportBytes: bytes.transport!,
    catalogueBytes: bytes.catalogue!,
  };
}
const f = loadFixture();
const contract = 'C13_PINNED_REFERENCE_FREIGHT_EXTENSION_V1';
const extension = () => ({
  contract,
  transportBytes: Buffer.from(f.transportBytes),
  catalogueBytes: Buffer.from(f.catalogueBytes),
});
const input = () => ({ ...f.legacy, country13Transport: extension() });
const create = (b: Obj) =>
  createOriginalFieldConsumer(b) as unknown as Consumer;
const legacy = create(f.legacy),
  active = create(input());
const id = 'U2544::COUNTRY::COUNTRY_13::transportMinimum';
const request = () => ({
  mode: 'REFERENCE_INPUTS_ONLY',
  stableId: id,
  countryId: 'COUNTRY_13',
  originalUnit: 'TONNE_KM/PERIOD',
  currency: null,
  periodOrValueDate: null,
});
const rowRequests = legacy.snapshot().rows.map((r) => ({
  ...request(),
  stableId: r.stableId,
  countryId: r.countryId,
  originalUnit: r.candidateMeasure.unit,
}));
let positive: Obj | null = null;

test('real shared bridge calls fixed extractor,199.8 reference TONNE never original TONNE_KM/PERIOD', () => {
  const result = active.read(request());
  positive = result;
  assert.equal(obj(result.candidateMeasure).value, null);
  assert.equal(obj(result.candidateMeasure).unit, 'TONNE_KM/PERIOD');
  const refs = obj(result.references),
    freight = obj(refs.acceptedFreight),
    operands = obj(freight.operands);
  assert.equal(freight.status, 'REFERENCE_ONLY');
  assert.equal(freight.sourceBytesVerified, true);
  assert.equal(freight.derivedReferenceFreightTonnes, '199.8');
  assert.equal(operands.acceptedNativeRawToken, '39.96');
  assert.equal(operands.sourceTonnesPerUnitRawToken, '5.0');
  assert.equal(obj(freight.identity).buyerCountryNumber, '13');
  assert.equal(obj(freight.provenance).eventPointer, '/events/780');
  assert.equal(obj(refs.acceptedFreightOperand).unit, 'TONNE');
  for (const k of [
    'distanceKm',
    'referenceTonneKm',
    'actualTonneKm',
    'periodMinimum',
    'completeNativeCost',
  ])
    assert.equal(refs[k], null);
  for (const k of [
    'sourceAdmitted',
    'productionAuthority',
    'countsAsWorldReceipt',
    'actualWorldPosting',
    'actualEntityMappingEstablished',
    'actualClockOrPeriodAdopted',
  ])
    assert.equal(freight[k], false);
  assert.equal(result.adoptionEvidence, null);
  assert.equal(obj(result.candidateMeasure).periodOrValueDate, null);
  const packet = active.snapshot(),
    row = obj(packet.rows[16]);
  assert.deepEqual(Object.values(obj(row.reportedStageFlags)), [
    false,
    false,
    false,
    false,
  ]);
  assert.equal(row.originalFieldsClosed, 0);
  assert.equal(packet.originalFieldsClosed, 0);
  assert.equal(
    obj(row.originalRowBinding).sha256,
    '7cfe3c5f9926f4a68eaf4f9ec014e435eba4ae8a6c5b03aa88b81c9c8bf5367f',
  );
});
test('default16 golden bytes and all16 active reads unchanged; exactly one controlled extra ID', () => {
  assert.equal(
    digest(legacy.snapshot()),
    '15e4a4e8ad66da746ccd3800f0a79af249b0a44255338fab0f79209640adc388',
  );
  assert.deepEqual(
    rowRequests.map((r) => digest(legacy.read(r))),
    [
      '74503595b86873c9dccf39cf9b2754554e97b23b6670cde49159181f3b9a16fb',
      'f8b55207e9a6563dec44f98a413682f1a5178e1660942f767651e74fada0183b',
      '3bf7151d90388d11a49d3dda3a03858d272549d21afcc4f33074e01d3cd2dd29',
      '69ffc954e452cbb549c58202bf8903b6b55700f14fce69fdab67d2490343ecf9',
      'a62eead46ab56296564a2d0cf9339e46c8d6c070c2e87bbc7196ad55a971807b',
      '677eeb6edd9f06d0e46011afea49697ca4a985b644d43620420dc032f9ae48bf',
      '48cc1475cb310087aefce50f91c62b75998e44c5290ea8565173f421b63b51f1',
      'e5f5424647b129e04e49110b88dd436c73496d26b42d7d1021d803a9fe8f6ff9',
      '2476e0c2a8abcbb8f2150c9ef1c1dee933986946eb4319103a9a0de6f63eb260',
      '52399ead9747063b3901ff4df2c36e4a6d3e6c2c538b5f173ec832d3655162c6',
      'd02d67c666fd09e43c2fa369f756e2a76d8a4283eb5671e4102789fdf959a817',
      '05968439fc6f92afae28eb6adeed265bcf6eb548a3364fc41448f2d56120ad85',
      '0371c9a6e6113e25ad3d4373879d442c74cd777804d8883f1a1c7d9dcc176e25',
      '3641d61d20cb8c545df7c3153cd9111fa01bab6cb31a32ac72d9a52ea0e20893',
      'e8de99503fb84284445a42ad11e725607dad6f83a7960c8d6481f5c463a0b864',
      '412b648e6fc3023be09630503513b5933f7cf401ed6cc50a46deae31a5707dd1',
    ],
  );
  assert.equal(ORIGINAL_IDS.length, 16);
  assert.equal(legacy.snapshot().subset.count, 16);
  assert.equal(active.snapshot().subset.count, 17);
  assert.deepEqual(active.snapshot().subset.exactOriginalIds, [
    ...ORIGINAL_IDS,
    id,
  ]);
  assert.deepEqual(active.snapshot().rows.slice(0, 16), legacy.snapshot().rows);
  for (const r of rowRequests)
    assert.equal(
      JSON.stringify(active.read(r)),
      JSON.stringify(legacy.read(r)),
    );
  assert.equal(
    active.snapshot().subset.parentBatches.find((b) => b.batchId === 'B13')!
      .subsetCount,
    5,
  );
  assert.equal(
    obj(active.snapshot().rows[16]).parentBatch &&
      obj(obj(active.snapshot().rows[16]).parentBatch).subsetCount,
    1,
  );
  assert.throws(() => legacy.read(request()), /OUTSIDE_EXACT_16/u);
  assert.throws(
    () =>
      active.read({
        ...request(),
        stableId: id.replace('transportMinimum', 'transportCompleteCostNative'),
      }),
    /OUTSIDE_EXACT_16/u,
  );
  assert.throws(
    () =>
      active.read({ ...request(), mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY' }),
    /OUTSIDE_EXACT_16/u,
  );
});
test('closed opt-in contract rejects present undefined/null/partial/authority without fallback', () => {
  for (const value of [
    undefined,
    null,
    {},
    { contract },
    { ...extension(), extra: true },
    { ...extension(), contract: 'WRONG' },
  ])
    assert.throws(() => create({ ...f.legacy, country13Transport: value }));
  for (const key of ['contract', 'transportBytes', 'catalogueBytes']) {
    const e: Obj = extension();
    delete e[key];
    assert.throws(() => create({ ...f.legacy, country13Transport: e }));
    assert.throws(() =>
      create({
        ...f.legacy,
        country13Transport: { ...extension(), [key]: undefined },
      }),
    );
  }
  assert.throws(() => create({ ...input(), actual: true }));
  assert.throws(() =>
    create({
      mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY',
      country13Transport: extension(),
    }),
  );
});
test('all original and extension byte drift/missing sources reject; no result injection', () => {
  for (const key of Object.keys(f.legacy)) {
    assert.throws(
      () => create({ ...input(), [key]: Buffer.from('{}') }),
      /SOURCE_DRIFT/u,
    );
    const b: Obj = input();
    delete b[key];
    assert.throws(() => create(b));
  }
  for (const key of ['transportBytes', 'catalogueBytes']) {
    assert.throws(
      () =>
        create({
          ...f.legacy,
          country13Transport: { ...extension(), [key]: Buffer.from('{}') },
        }),
      /C13_SOURCE_DRIFT/u,
    );
  }
  assert.throws(() =>
    create({
      ...f.legacy,
      country13Transport: {
        ...extension(),
        result: { derivedReferenceFreightTonnes: '199.8' },
      },
    }),
  );
});
test('new read requires exact six keys/country/units; cannot promote period/value/authority', () => {
  for (const key of Object.keys(request())) {
    const r: Obj = request();
    delete r[key];
    assert.throws(() => active.read(r));
    assert.throws(() => active.read({ ...request(), [key]: undefined }));
  }
  for (const change of [
    { countryId: 'COUNTRY_24' },
    { countryId: 'COUNTRY_01' },
    { originalUnit: 'TONNE' },
    { originalUnit: 'NATIVE_MONEY' },
    { currency: 'XAA' },
    { periodOrValueDate: '35' },
    { mode: 'ACTUAL' },
    { mode: 'MINIMUM' },
    { distanceKm: '4153.503454065901' },
    { sourceAdmitted: true },
    { value: '199.8' },
  ])
    assert.throws(() => active.read({ ...request(), ...change }));
});
test('getters captured once; output immutable while source and caller mutation stays isolated', () => {
  const counts: Record<string, number> = {},
    values: Obj = input(),
    owned: Obj = {};
  const ext = extension();
  values.country13Transport = Object.fromEntries(
    Object.entries(ext).map(([key, v]) => [key, v]),
  );
  for (const key of Object.keys(values))
    Object.defineProperty(owned, key, {
      enumerable: true,
      get() {
        counts[key] = (counts[key] ?? 0) + 1;
        return values[key];
      },
    });
  const nested = values.country13Transport as Obj;
  for (const key of Object.keys(nested)) {
    const v = nested[key];
    Object.defineProperty(nested, key, {
      enumerable: true,
      get() {
        counts['nested:' + key] = (counts['nested:' + key] ?? 0) + 1;
        return v;
      },
    });
  }
  const c = create(owned);
  assert(Object.values(counts).every((n) => n === 1));
  (obj(values.country13Transport).transportBytes as Buffer).fill(0);
  const q = request(),
    rc: Record<string, number> = {},
    getters: Obj = {};
  for (const [k, v] of Object.entries(q))
    Object.defineProperty(getters, k, {
      enumerable: true,
      get() {
        rc[k] = (rc[k] ?? 0) + 1;
        return v;
      },
    });
  const result = c.read(getters);
  assert(Object.values(rc).every((n) => n === 1));
  assert.equal(
    obj(obj(result.references).acceptedFreight).derivedReferenceFreightTonnes,
    '199.8',
  );
  assert.equal(Object.isFrozen(values), false);
  assert.throws(() => {
    obj(obj(result.references).acceptedFreight).derivedReferenceFreightTonnes =
      '999';
  }, TypeError);
});
test('inline decoder rejects extra entries, altered bytes and noncanonical base64', () => {
  const expected = { key: 'x', bytes: 1, sha256: hash(Buffer.from('a')) };
  assert.throws(() =>
    decodeEntry({ ...expected, dataBase64: 'YQ==', extra: true }, expected),
  );
  assert.throws(() =>
    decodeEntry({ ...expected, dataBase64: 'Yg==' }, expected),
  );
  assert.throws(() =>
    decodeEntry({ ...expected, dataBase64: 'YR==' }, expected),
  );
  assert.throws(() =>
    decodeEntry({ ...expected, dataBase64: 'YQ==\n' }, expected),
  );
});
afterAll(() => {
  const out = process.env.C13_IMPLEMENTATION_EVIDENCE;
  if (!out) return;
  assert.equal(
    out,
    '/Users/samuel/Documents/econclub/.econmind-artifacts/data-interface-resume-20261023/C/c13-transport-implementation-v1/focused',
  );
  assert.equal(existsSync(out), false);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    out + '/ACTUAL_C13_READ_AND_INPUT_PINS.json',
    JSON.stringify(
      {
        fixtureManifestSha256:
          '121facebc04ae68a3e1bf22c195a119d5da55d3d898d31ab2bf24c43958405ca',
        sourceRoot: new URL('../../', import.meta.url).pathname,
        sourceAccess:
          'Git-relative static fixture and five tracked files only; no absolute source locators',
        defaultSnapshotSha256: digest(legacy.snapshot()),
        activeSnapshotRows: active.snapshot().rows.length,
        request: request(),
        result: positive,
        actualRow: active.snapshot().rows[16],
        originalClosures: 0,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
});
