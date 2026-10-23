import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { afterAll, test } from 'vitest';
import {
  createOriginalFieldConsumer,
  ORIGINAL_IDS,
} from '../../tools/unknown2544-c-original-fields/bridge.mjs';
import { parseLossless } from '../../tools/unknown2544-c-physical/candidate.mjs';
import {
  readAdoptedCountry01Method,
  readAdoptedCountry01FeeMethod,
} from '../../tools/unknown2544-c-method-adoption/adoption-view.mjs';
import { readAdoptedCountry01FeeMethod as feeFacadeRead } from '../../tools/unknown2544-c-fee-buffer/country01-candidate.js';

type Obj = Record<string, unknown>;
type Pin = { bytes: number; sha256: string };
type Entry = Pin & { key: string; dataBase64: string };
type Result = Obj & {
  stableId: string;
  adoptedMethod: {
    methodId: string;
    selectedPointer: string;
    sourceDefinition: Obj;
  };
  methodBoundary: Obj;
  candidateMeasure: Obj;
  originalStages: Obj;
  originalBinding: { originalRecord: Obj };
  sourceTrace: Obj[];
};
type Kind = 'B02' | 'B03';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function pinned(b: Buffer, pin: Pin) {
  assert.equal(b.length, pin.bytes);
  assert.equal(hash(b), pin.sha256);
}
function read(relative: string, cap: number) {
  const url = new URL(relative, import.meta.url);
  const st = statSync(url);
  assert(st.isFile() && st.size <= cap);
  const b = readFileSync(url);
  assert(b.length <= cap);
  return b;
}
function closed(value: object, keys: string[]) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function decode(e: Entry, expected: Pin & { key: string }) {
  closed(e, ['key', 'bytes', 'sha256', 'dataBase64']);
  assert.equal(e.key, expected.key);
  assert.equal(e.bytes, expected.bytes);
  assert.equal(e.sha256, expected.sha256);
  assert.equal(typeof e.dataBase64, 'string');
  assert.equal(e.dataBase64.length, 4 * Math.ceil(e.bytes / 3));
  assert(!/[^A-Za-z0-9+/=]/u.test(e.dataBase64));
  const b = Buffer.from(e.dataBase64, 'base64');
  assert.equal(b.toString('base64'), e.dataBase64);
  pinned(b, expected);
  return b;
}
function load() {
  const mb = read(
    '../fixtures/c-country01-adopted-method-reference/manifest.v1.json',
    4096,
  );
  pinned(mb, {
    bytes: 1139,
    sha256: '0fcdc7a3612965bd7cfa8ddcf8ce1205cdbccb9495fa1e49c4e5ead6968e4e97',
  });
  const m = JSON.parse(mb.toString('utf8')) as {
    schemaVersion: number;
    purpose: string;
    bundle: Pin & {
      jsonBytes: number;
      jsonSha256: string;
      compressedCap: number;
      decodedJsonCap: number;
    };
    sources: (Pin & { key: string })[];
    originalLedgerReuse: Pin & { path: string };
    authority: string;
  };
  closed(m, [
    'schemaVersion',
    'purpose',
    'bundle',
    'sources',
    'originalLedgerReuse',
    'authority',
  ]);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.purpose, 'C01_ADOPTED_METHOD_TEST_ONLY');
  assert.equal(m.bundle.compressedCap, 131072);
  assert.equal(m.bundle.decodedJsonCap, 131072);
  assert.deepEqual(
    m.sources.map((s) => s.key),
    ['adoptionReceiptBytes', 'B02', 'B03'],
  );
  assert.equal(
    m.sources.reduce((n, p) => n + p.bytes, 0),
    66334,
  );
  const gz = read(
    '../fixtures/c-country01-adopted-method-reference/source-bytes-v1.json.gz',
    131072,
  );
  pinned(gz, m.bundle);
  assert.equal(gz.readUInt32LE(4), 0);
  const raw = gunzipSync(gz, { maxOutputLength: 131072 });
  pinned(raw, { bytes: m.bundle.jsonBytes, sha256: m.bundle.jsonSha256 });
  const body = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(raw),
  ) as { schemaVersion: number; purpose: string; entries: Entry[] };
  closed(body, ['schemaVersion', 'purpose', 'entries']);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.purpose, m.purpose);
  assert.equal(body.entries.length, 3);
  const bytes: Record<string, Buffer> = {};
  body.entries.forEach((e, i) => {
    bytes[e.key] = decode(e, m.sources[i]!);
  });
  const oldManifest = read(
    '../fixtures/c-country13-transport-reference/manifest.v1.json',
    4096,
  );
  pinned(oldManifest, {
    bytes: 2824,
    sha256: '121facebc04ae68a3e1bf22c195a119d5da55d3d898d31ab2bf24c43958405ca',
  });
  const oldGzip = read(
    '../fixtures/c-country13-transport-reference/source-bytes-v1.json.gz',
    1048576,
  );
  pinned(oldGzip, {
    bytes: 994626,
    sha256: '887c2d6ad3e492fa5fc21caa241754576b86c6112aff44a3c40ee06543b5dc13',
  });
  const oldRaw = gunzipSync(oldGzip, { maxOutputLength: 13719152 });
  pinned(oldRaw, {
    bytes: 13719123,
    sha256: 'cbc42eaa0532d868aa2d16ee07c3ecc31bf8ca4498d8a65f7ed2f0c7d07bde5c',
  });
  const old = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(oldRaw),
  ) as { entries: Entry[] };
  const entries = old.entries.filter((e) => e.key === 'ledger');
  assert.equal(entries.length, 1);
  bytes.originalLedgerBytes = decode(entries[0]!, {
    key: 'ledger',
    bytes: 7255116,
    sha256: 'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb',
  });
  pinned(bytes.originalLedgerBytes, m.originalLedgerReuse);
  assert.equal(
    m.originalLedgerReuse.path,
    'tests/fixtures/c-country13-transport-reference/source-bytes-v1.json.gz#ledger',
  );
  return bytes;
}
// Fixed Git-only supply, no mocks, skips, private fallback or result substitution.
const sources = load();
const mode = 'ADOPTED_C01_METHODS_ONLY';
const ids = {
  B02: 'U2544::COUNTRY::COUNTRY_01::protectedServiceFloor',
  B03: 'U2544::COUNTRY::COUNTRY_01::feePolicy',
};
const units = { B02: 'VERSIONED_SERVICE_RULE', B03: 'VERSIONED_RULE' };
const request = (kind: Kind): Obj => ({
  mode,
  stableId: ids[kind],
  countryId: 'COUNTRY_01',
  originalUnit: units[kind],
  currency: null,
  periodOrValueDate: null,
  methodSources: {
    adoptionReceiptBytes: Buffer.from(sources.adoptionReceiptBytes!),
    methodPacketBytes: Buffer.from(sources[kind]!),
    originalLedgerBytes: Buffer.from(sources.originalLedgerBytes!),
  },
});
const consumer = createOriginalFieldConsumer({ mode }) as unknown as {
  read(r: Obj): Result;
  snapshot(): unknown;
};
const captures: Record<string, Result> = {};
afterAll(() => {
  const output = process.env.C01_METHOD_READ_RESULT_PATH;
  if (output && Object.keys(captures).length === 2)
    writeFileSync(
      output,
      JSON.stringify(
        {
          schema: 'C01_METHOD_FORMAL_SUITE_ACTUAL_CAPTURES_V1',
          inputPins: Object.fromEntries(
            Object.entries(sources).map(([key, b]) => [
              key,
              { bytes: b.length, sha256: hash(b) },
            ]),
          ),
          captures,
        },
        null,
        2,
      ) + '\n',
    );
});

function common(r: Result, kind: Kind) {
  assert.equal(r.stableId, ids[kind]);
  assert.equal(r.methodAdoptionApplied, true);
  assert.equal(r.candidateMeasure.value, null);
  assert.equal(r.candidateMeasure.status, 'UNKNOWN');
  assert.equal(r.candidateMeasure.unit, units[kind]);
  assert.deepEqual(Object.values(r.originalStages), [
    false,
    false,
    false,
    false,
  ]);
  for (const key of [
    'sourceAdmitted',
    'runtimeConnected',
    'productionAuthority',
    'recordSetAdopted',
  ])
    assert.equal(r[key], false);
  for (const key of [
    'actualValue',
    'actualCurrency',
    'actualPeriod',
    'actualWorld',
    'actualQuantities',
    'actualFeeAmount',
    'actualPayment',
    'actualCash',
  ])
    assert.equal(r[key], null);
  assert.equal(r.originalFieldsClosed, 0);
  const original = parseLossless(sources.originalLedgerBytes!).records[
    kind === 'B02' ? 5 : 14
  ];
  assert.deepEqual(r.originalBinding.originalRecord, original);
  assert.equal(r.originalAcceptanceRule, original.acceptanceRule);
  assert.deepEqual(r.originalDependencies, original.dependencies);
  assert.equal(
    (r.adoptionEvidence as Obj).sha256,
    hash(sources.adoptionReceiptBytes!),
  );
  assert.equal((r.adoptionEvidence as Obj).pointer, '/' + kind);
  assert.equal(r.sourceTrace[1]!.sha256, hash(sources[kind]!));
  assert(
    Object.isFrozen(r) && Object.isFrozen(r.adoptedMethod.sourceDefinition),
  );
}
test('real B02 bridge read selects five normative definitions, not examples or actual need', () => {
  const r = consumer.read(request('B02'));
  captures.B02 = r;
  common(r, 'B02');
  assert.equal(
    r.status,
    'ADOPTED_ORDINARY_POTABLE_SUBMETHOD_REFERENCE_AVAILABLE_ACTUAL_NEED_UNBOUND',
  );
  const packet = parseLossless(sources.B02!);
  const d = r.adoptedMethod.sourceDefinition;
  closed(d, ['proposalId', 'countryId', 'parameters']);
  assert.deepEqual(d.parameters, packet.parameters);
  assert.equal((d.parameters as unknown[]).length, 5);
  assert.equal(r.sourceHistoricalStatus, packet.status);
  assert.equal(
    r.adoptedMethod.methodId,
    'C01_POTABLE_SERVICE_FLOOR_20261023_V2',
  );
  assert.equal(r.adoptedMethod.selectedPointer, '/parameters');
  for (const key of [
    'planningDemandExamples',
    'physicalResourcePressure',
    'resourceStressExample',
    'actualResourceObservations',
  ])
    assert.equal(Object.hasOwn(d, key), false);
  const period = r.methodBoundary.declaredMethodPeriod as Obj;
  assert.equal(period.from, '0');
  assert.equal(period.untilExclusive, '7');
  assert.equal(period.duration, '7');
  assert.equal(period.evaluateEachDailySubintervalSeparately, true);
  assert.equal(period.automaticRenewal, false);
  for (const key of [
    'actualRequiredNeedFrontier',
    'actualCompletedServiceFrontier',
    'actualQualityAcceptedCreditFrontier',
    'actualNationalMinimum',
    'actualAcceptedDelivery',
  ])
    assert.equal(r.methodBoundary[key], null);
  const quality = r.methodBoundary.qualityProfileLineage as Obj;
  assert.equal(quality.measurementStatus, 'NOT_RUN');
  assert.equal(
    quality.verification,
    'RECEIPT_BOUND_LINEAGE_ONLY_EXTERNAL_QUALITY_PROFILE_BYTES_NOT_READ',
  );
});
test('real B03 bridge read selects feePolicy only; all actual binding leaves remain null', () => {
  const r = consumer.read(request('B03'));
  captures.B03 = r;
  common(r, 'B03');
  assert.equal(
    r.status,
    'ADOPTED_FEE_METHOD_REFERENCE_AVAILABLE_ACTUAL_POLICY_BINDING_UNBOUND',
  );
  const packet = parseLossless(sources.B03!);
  assert.deepEqual(r.adoptedMethod.sourceDefinition, packet.feePolicy);
  assert.equal(r.sourceHistoricalStatus, packet.status);
  assert.equal(r.adoptedMethod.methodId, 'G-C01-B03-METHOD-V2');
  assert.equal(r.adoptedMethod.selectedPointer, '/feePolicy');
  const d = r.adoptedMethod.sourceDefinition;
  assert.equal(d.method, 'FRACTIONAL_NATIVE');
  assert.equal(d.rateFraction, '1');
  assert.equal(d.version, 'V2_PROPOSED');
  assert.equal(Object.hasOwn(d, 'bufferRule'), false);
  assert.deepEqual(
    r.methodBoundary.actualSourceBindings,
    packet.independentRealSourceBindings,
  );
  assert.equal(
    Object.values(r.methodBoundary.actualSourceBindings as Obj).length,
    13,
  );
  assert(
    Object.values(r.methodBoundary.actualSourceBindings as Obj).every(
      (v) => v === null,
    ),
  );
  assert.deepEqual(r.methodBoundary.bufferRule, {
    status: 'OWNER_EXPLICITLY_CONTINUES_DEFERRED_NOT_ADOPTED',
    adopted: false,
  });
  for (const key of [
    'actualPolicyPeriod',
    'actualNativeCurrency',
    'actualNativePrecision',
    'actualPayer',
    'actualProvider',
    'actualCharge',
    'actualPayment',
  ])
    assert.equal(r.methodBoundary[key], null);
});
test('existing fee facade identity-reexports exactly the bridge fee-method implementation', () => {
  assert.equal(feeFacadeRead, readAdoptedCountry01FeeMethod);
  assert.deepEqual(
    feeFacadeRead(request('B03')),
    consumer.read(request('B03')),
  );
  assert.throws(
    () => feeFacadeRead(request('B02')),
    /ONLY_EXACT_C01_METHOD_TARGET/u,
  );
});
test.each(['B02', 'B03'] as Kind[])(
  'closed request/source leaves and present undefined reject: %s',
  (kind) => {
    const r = request(kind);
    for (const key of Object.keys(r)) {
      const missing = { ...r };
      delete missing[key];
      assert.throws(() => consumer.read(missing));
      assert.throws(() => consumer.read({ ...r, [key]: undefined }));
    }
    assert.throws(() => consumer.read({ ...r, adopted: true }));
    assert.throws(() => consumer.read({ ...r, mode: 'REFERENCE_INPUTS_ONLY' }));
    const b = r.methodSources as Obj;
    for (const key of Object.keys(b)) {
      const missing = { ...b };
      delete missing[key];
      assert.throws(() => consumer.read({ ...r, methodSources: missing }));
      assert.throws(() =>
        consumer.read({ ...r, methodSources: { ...b, [key]: undefined } }),
      );
    }
    assert.throws(() =>
      consumer.read({ ...r, methodSources: { ...b, sourceAdmitted: true } }),
    );
    assert.throws(() => consumer.read({ ...r, methodSources: null }));
  },
);
test.each([
  { countryId: 'COUNTRY_02' },
  { countryId: 'COUNTRY_03' },
  { stableId: 'U2544::COUNTRY::COUNTRY_01::feeTotalNative' },
  { stableId: 'U2544::COUNTRY::COUNTRY_01::minimumCashBufferNative' },
  { stableId: 'U2544::COUNTRY::COUNTRY_01::waterPotableDeliveredMinimum' },
  { originalUnit: 'VERSIONED_RULE' },
  { currency: 'XAA' },
  { periodOrValueDate: '0..7' },
])('exact two-ID scope rejects %j', (delta) => {
  assert.throws(() => consumer.read({ ...request('B02'), ...delta }));
});
test.each(['B02', 'B03'] as Kind[])(
  'every byte source drift and swapped method reject: %s',
  (kind) => {
    for (const key of [
      'adoptionReceiptBytes',
      'methodPacketBytes',
      'originalLedgerBytes',
    ]) {
      const r = request(kind),
        b = r.methodSources as Record<string, Buffer>;
      b[key]![0] ^= 1;
      assert.throws(() => consumer.read(r), /METHOD_SOURCE_DRIFT/u);
    }
    const r = request(kind),
      b = r.methodSources as Record<string, Buffer>;
    b.methodPacketBytes = Buffer.from(sources[kind === 'B02' ? 'B03' : 'B02']!);
    assert.throws(() => consumer.read(r), /METHOD_SOURCE_DRIFT/u);
    b.methodPacketBytes = Buffer.from(sources[kind]!);
    b.adoptionReceiptBytes = Buffer.from(
      '{"recordId":"OWNER_DIRECT_20261020_R3_A_B02_C_G_C"}',
    );
    // Old-style identity is an explicit negative DTO, not claimed old receipt bytes.
    assert.throws(() => consumer.read(r), /METHOD_SOURCE_DRIFT/u);
  },
);
test('source caps reject oversized views before copy; never accept a B04 adoption mutation', () => {
  const r = request('B03'),
    b = r.methodSources as Record<string, Buffer>;
  b.methodPacketBytes = Buffer.alloc(41219);
  assert.throws(() => consumer.read(r), /METHOD_BYTE_CAP/u);
  b.methodPacketBytes = Buffer.from(sources.B03!);
  const altered = JSON.parse(sources.adoptionReceiptBytes!.toString('utf8'));
  altered.B04.status = 'OWNER_ADOPTED';
  b.adoptionReceiptBytes = Buffer.from(JSON.stringify(altered));
  assert.throws(() => consumer.read(r), /METHOD_SOURCE_DRIFT|METHOD_BYTE_CAP/u);
});
test.each(['B02', 'B03'] as Kind[])(
  'capture once and detach immediately without freezing caller: %s',
  (kind) => {
    const r = request(kind),
      b = r.methodSources as Record<string, Buffer>,
      counts: Record<string, number> = {};
    const backing = Buffer.alloc(b.adoptionReceiptBytes!.length + 8);
    b.adoptionReceiptBytes!.copy(backing, 4);
    const sourceInput = {};
    for (const key of Object.keys(b))
      Object.defineProperty(sourceInput, key, {
        enumerable: true,
        get() {
          counts[key] = (counts[key] ?? 0) + 1;
          if (key === 'methodPacketBytes') backing.fill(0);
          return key === 'adoptionReceiptBytes'
            ? backing.subarray(4, backing.length - 4)
            : b[key];
        },
      });
    const caller = {};
    for (const key of Object.keys(r))
      Object.defineProperty(caller, key, {
        enumerable: true,
        get() {
          counts['request:' + key] = (counts['request:' + key] ?? 0) + 1;
          return key === 'methodSources' ? sourceInput : r[key];
        },
      });
    const result = consumer.read(caller);
    assert.equal(result.stableId, ids[kind]);
    assert(Object.values(counts).every((n) => n === 1));
    assert.equal(Object.isFrozen(caller), false);
    assert.equal(Object.isFrozen(sourceInput), false);
    assert.equal(Object.isFrozen(b.methodPacketBytes), false);
    assert.throws(() => {
      result.adoptedMethod.sourceDefinition.changed = true;
    });
  },
);
test('direct common reader has the same contract and no caller-chosen trusted view', () => {
  assert.deepEqual(
    readAdoptedCountry01Method(request('B02')),
    consumer.read(request('B02')),
  );
  assert.throws(() =>
    readAdoptedCountry01Method({ ...request('B02'), verified: true }),
  );
});
test('new constructor is isolated, snapshot unavailable, default constants unchanged', () => {
  assert.throws(() => createOriginalFieldConsumer({ mode, methodSources: {} }));
  assert.throws(
    () => consumer.snapshot(),
    /NOT_LOADED_IN_C01_METHOD_ONLY_MODE/u,
  );
  assert.equal(ORIGINAL_IDS.length, 16);
  assert.equal(ORIGINAL_IDS.includes(ids.B02), false);
  assert.equal(ORIGINAL_IDS.includes(ids.B03), false);
});
test('direct Node24 bridge import has no eager TS fee/server load dependency', () => {
  const url = new URL(
    '../../tools/unknown2544-c-original-fields/bridge.mjs',
    import.meta.url,
  ).href;
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'const m=await import(process.argv[1]); if(typeof m.createOriginalFieldConsumer!=="function")throw Error("missing export"); process.stdout.write("NODE24_IMPORT_OK");',
      url,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result, 'NODE24_IMPORT_OK');
});
