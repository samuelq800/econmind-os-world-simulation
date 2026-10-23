import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'vitest';
import {
  createOriginalFieldConsumer,
  ORIGINAL_IDS,
  SOURCE_PINS,
} from '../../tools/unknown2544-c-original-fields/bridge.mjs';
import { produceWaterServiceCandidate } from '../../tools/unknown2544-c-water-service/produce-candidate.mjs';
import { parseLossless } from '../../tools/unknown2544-c-physical/candidate.mjs';

type Obj = Record<string, unknown>;
type Pin = { bytes: number; sha256: string };
type Entry = Pin & { key: string; dataBase64: string };
type Quantity = { amount: string; unit: string; sourceTrace: Obj[] };
type Intermediate = {
  theoreticalNetPotential: Quantity;
  treatmentNetPotential: Quantity;
  deliveryRatio: Quantity;
  requiredInputs: Record<string, Quantity>;
  workerDaysByUnboundSkillSlot: (Quantity & {
    slot: string;
    skillTaxonomy: null;
    actualHours: null;
  })[];
};
type Result = Obj & {
  recipeIntermediate: Intermediate;
  sourceTrace: Obj[];
  originalStages: Record<string, boolean>;
  candidateMeasure: Obj;
  dependentResults: Obj;
  originalBinding: { originalRecord: Obj };
};
type Consumer = { read(input: Obj): Result; snapshot(): unknown };
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function pinned(b: Buffer, pin: Pin) {
  assert.equal(b.length, pin.bytes);
  assert.equal(hash(b), pin.sha256);
}
function read(relative: string, cap: number) {
  const url = new URL(relative, import.meta.url);
  assert(statSync(url).isFile() && statSync(url).size <= cap);
  const b = readFileSync(url);
  assert(b.length <= cap);
  return b;
}
function closed(value: object, keys: string[]) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function decode(e: Entry, pin: Pin & { key: string }) {
  closed(e, ['key', 'bytes', 'sha256', 'dataBase64']);
  assert.equal(e.key, pin.key);
  assert.equal(e.bytes, pin.bytes);
  assert.equal(e.sha256, pin.sha256);
  assert.equal(typeof e.dataBase64, 'string');
  assert.equal(e.dataBase64.length, 4 * Math.ceil(pin.bytes / 3));
  assert(!/[^A-Za-z0-9+/=]/u.test(e.dataBase64));
  const b = Buffer.from(e.dataBase64, 'base64');
  assert.equal(b.toString('base64'), e.dataBase64);
  pinned(b, pin);
  return b;
}
// Only fixed repository files. No local source fallback, network, mocks, skips,
// result replacement, or invocation of the old C13/COUNTRY01 test subjects.
function load() {
  const mb = read(
    '../fixtures/c-country02-constructed-recipe-reference/manifest.v1.json',
    4096,
  );
  pinned(mb, {
    bytes: 1008,
    sha256: '32d2762b70caeca41745540108aac9cc04d698febafb9bbda0b8893355e3ee48',
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
  assert.equal(m.purpose, 'C02_CONSTRUCTED_TEST_ONLY');
  assert.equal(m.bundle.compressedCap, 1048576);
  assert.equal(m.bundle.decodedJsonCap, 1048576);
  assert.deepEqual(
    m.sources.map((s) => s.key),
    ['candidatePacketBytes', 'parameterProposalBytes'],
  );
  const gz = read(
    '../fixtures/c-country02-constructed-recipe-reference/source-bytes-v1.json.gz',
    1048576,
  );
  pinned(gz, m.bundle);
  assert.equal(gz.readUInt32LE(4), 0);
  const raw = gunzipSync(gz, { maxOutputLength: 1048576 });
  pinned(raw, { bytes: m.bundle.jsonBytes, sha256: m.bundle.jsonSha256 });
  const body = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(raw),
  ) as { schemaVersion: number; purpose: string; entries: Entry[] };
  closed(body, ['schemaVersion', 'purpose', 'entries']);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.purpose, m.purpose);
  assert.equal(body.entries.length, 2);
  const sources: Record<string, Buffer> = {};
  body.entries.forEach((e, i) => {
    sources[e.key] = decode(e, m.sources[i]!);
  });
  assert.equal(
    m.sources.reduce((n, p) => n + p.bytes, 0),
    708363,
  );
  // Reuse the exact merged C13 ledger member without running its consumer.
  const oldManifest = read(
    '../fixtures/c-country13-transport-reference/manifest.v1.json',
    4096,
  );
  pinned(oldManifest, {
    bytes: 2824,
    sha256: '121facebc04ae68a3e1bf22c195a119d5da55d3d898d31ab2bf24c43958405ca',
  });
  const oldGz = read(
    '../fixtures/c-country13-transport-reference/source-bytes-v1.json.gz',
    1048576,
  );
  pinned(oldGz, {
    bytes: 994626,
    sha256: '887c2d6ad3e492fa5fc21caa241754576b86c6112aff44a3c40ee06543b5dc13',
  });
  const oldRaw = gunzipSync(oldGz, { maxOutputLength: 13719152 });
  pinned(oldRaw, {
    bytes: 13719123,
    sha256: 'cbc42eaa0532d868aa2d16ee07c3ecc31bf8ca4498d8a65f7ed2f0c7d07bde5c',
  });
  const old = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(oldRaw),
  ) as { entries: Entry[] };
  const ledger = old.entries.filter((e) => e.key === 'ledger');
  assert.equal(ledger.length, 1);
  sources.originalLedgerBytes = decode(ledger[0]!, {
    key: 'ledger',
    bytes: 7255116,
    sha256: 'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb',
  });
  assert.equal(
    m.originalLedgerReuse.path,
    'tests/fixtures/c-country13-transport-reference/source-bytes-v1.json.gz#ledger',
  );
  pinned(sources.originalLedgerBytes, m.originalLedgerReuse);
  return sources;
}
const sources = load();
const mode = 'CONSTRUCTED_RECIPE_INTERMEDIATES_ONLY';
const stableId = 'U2544::COUNTRY::COUNTRY_02::waterPotableDeliveredMinimum';
const create = (options: Obj = { mode }) =>
  createOriginalFieldConsumer(options) as unknown as Consumer;
const consumer = create();
const request = (): Obj => ({
  mode,
  stableId,
  countryId: 'COUNTRY_02',
  originalUnit: 'M3/PERIOD',
  currency: null,
  periodOrValueDate: null,
  proposalSources: Object.fromEntries(
    Object.entries(sources).map(([key, b]) => [key, Buffer.from(b)]),
  ),
});
const record = JSON.parse(sources.candidatePacketBytes!.toString('utf8'))
  .records[1];

test('fixed Git-only bridge -> shared calculator recomputes C02, original field stays UNKNOWN', () => {
  const r = consumer.read(request());
  assert.equal(
    r.status,
    'CONSTRUCTED_RECIPE_INTERMEDIATES_AVAILABLE_NOT_ADOPTED',
  );
  assert.equal(r.stableId, stableId);
  assert.equal(r.countryId, 'COUNTRY_02');
  const mid = r.recipeIntermediate;
  assert.equal(mid.theoreticalNetPotential.amount, '22371015.3437333325312');
  assert.equal(
    mid.theoreticalNetPotential.amount,
    record.B10_B11_waterAndResourcePressure.theoreticalNetPotential
      .valueExactDecimal,
  );
  assert.equal(
    mid.theoreticalNetPotential.unit,
    'THEORETICAL_DELIVERED_M3/DECLARED_PERIOD',
  );
  assert.equal(mid.requiredInputs.ENERGY!.amount, '12395.287756944444');
  assert.equal(
    mid.requiredInputs.ENERGY!.amount,
    record.B10_B11_waterAndResourcePressure.electricityInput.valueExactDecimal,
  );
  assert.equal(mid.requiredInputs.ENERGY!.unit, 'MWH_INPUT/DECLARED_PERIOD');
  assert.equal(mid.deliveryRatio.amount, '0.9024');
  assert.equal(r.candidateMeasure.value, null);
  assert.equal(r.candidateMeasure.status, 'UNKNOWN');
  assert.equal(r.candidateMeasure.unit, 'M3/PERIOD');
  // Preserve ledger numeric lexemes, including provenance byte counts, just
  // as the consumer does. Do not coerce the product's lossless result.
  const original = parseLossless(sources.originalLedgerBytes!).records[44];
  assert.deepEqual(r.originalBinding.originalRecord, original);
  assert.equal(r.originalAcceptanceRule, original.acceptanceRule);
  assert.deepEqual(r.originalDependencies, original.dependencies);
  assert.equal(r.adoptionEvidence, null);
  assert.equal(r.parameterAdoptionRead, null);
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
  ])
    assert.equal(r[key], false);
  assert.equal(r.originalFieldsClosed, 0);
  for (const value of Object.values(r.dependentResults))
    assert.equal(value, null);
  for (const key of [
    'actualQuantities',
    'actualSkillHours',
    'actualDeliveredEnergy',
    'actualCompleteNativeCost',
  ])
    assert.equal(r[key], null);
});

test('proposed coefficients have detached exact byte/pointer traces, slots are not labour taxonomy', () => {
  const r = consumer.read(request());
  const mid = r.recipeIntermediate;
  assert.equal(Object.hasOwn(mid, 'workerDaysBySkill'), false);
  assert.deepEqual(
    mid.workerDaysByUnboundSkillSlot.map((q) => q.slot),
    ['0', '1', '2'],
  );
  assert.deepEqual(
    mid.workerDaysByUnboundSkillSlot.map((q) => q.amount),
    ['7437.1726541666664', '3718.5863270833332', '1239.5287756944444'],
  );
  for (const q of mid.workerDaysByUnboundSkillSlot) {
    assert.equal(q.unit, 'WORKER_DAY/DECLARED_PERIOD');
    assert.equal(q.skillTaxonomy, null);
    assert.equal(q.actualHours, null);
  }
  const traces = mid.theoreticalNetPotential.sourceTrace;
  assert.deepEqual(
    traces.slice(1).map((t) => t.kind),
    [
      'CONSTRUCTED_PARAMETER_PROPOSAL_NOT_ADOPTED',
      'CONSTRUCTED_PARAMETER_PROPOSAL_NOT_ADOPTED',
    ],
  );
  assert.deepEqual(
    traces.slice(1).map((t) => t.canonicalDecimal),
    ['0.96', '0.94'],
  );
  for (const t of traces.slice(1)) {
    assert.equal(t.adoptionEvidence, null);
    const evidence = t.sourceEvidence as Obj;
    assert.equal(evidence.sha256, hash(sources.parameterProposalBytes!));
    assert.match(evidence.pointer as string, /^\/R3SourceCoefficientValues\//u);
  }
  assert.deepEqual(traces[0]!.rational, {
    numerator: '3098821939236111',
    denominator: '125000000',
  });
  assert.equal(
    JSON.stringify(r).includes('FIXED_ADOPTED_RECIPE_COEFFICIENT'),
    false,
  );
  assert.deepEqual(r.geographyLineage, {
    countryPointer: '/1',
    verification: 'FIXED_G_PACKET_LINEAGE_ONLY_COUNTRIES_BYTES_NOT_READ',
  });
});

test.each([
  {
    countryId: 'COUNTRY_01',
    stableId: stableId.replace('COUNTRY_02', 'COUNTRY_01'),
  },
  {
    countryId: 'COUNTRY_03',
    stableId: stableId.replace('COUNTRY_02', 'COUNTRY_03'),
  },
  {
    stableId: stableId.replace(
      'waterPotableDeliveredMinimum',
      'waterCompleteCostNative',
    ),
  },
  { originalUnit: 'MWH/PERIOD' },
  { currency: 'GCU' },
  { periodOrValueDate: '2026-10-23' },
])('new path rejects outside exact scope %j', (delta) => {
  assert.throws(() => consumer.read({ ...request(), ...delta }));
});

test('closed requests and closed source keys never fall back, including undefined', () => {
  const r = request();
  for (const key of Object.keys(r)) {
    const missing = { ...r };
    delete missing[key];
    assert.throws(() => consumer.read(missing));
    assert.throws(() => consumer.read({ ...r, [key]: undefined }));
  }
  assert.throws(() => consumer.read({ ...r, adopted: true }));
  assert.throws(() => consumer.read({ ...r, mode: 'REFERENCE_INPUTS_ONLY' }));
  const b = r.proposalSources as Obj;
  for (const key of Object.keys(b)) {
    const missing = { ...b };
    delete missing[key];
    assert.throws(() => consumer.read({ ...r, proposalSources: missing }));
    assert.throws(() =>
      consumer.read({ ...r, proposalSources: { ...b, [key]: undefined } }),
    );
  }
  assert.throws(() =>
    consumer.read({ ...r, proposalSources: { ...b, coefficient: '1' } }),
  );
});

test('whole byte pins reject drift in all three sources, including altered rational and period', () => {
  for (const key of Object.keys(sources)) {
    const r = request(),
      b = r.proposalSources as Record<string, Buffer>;
    b[key]![0] = b[key]![0]! ^ 1;
    assert.throws(() => consumer.read(r), /CONSTRUCTED_SOURCE_DRIFT/u);
  }
  for (const denominator of ['0', '-1']) {
    const r = request(),
      b = r.proposalSources as Record<string, Buffer>;
    const altered = JSON.parse(b.candidatePacketBytes!.toString('utf8'));
    altered.records[1].B10_B11_waterAndResourcePressure.rawDeclaredPlanningWork.denominator =
      denominator;
    b.candidatePacketBytes = Buffer.from(JSON.stringify(altered));
    // Whole-source rejection precedes semantic arithmetic; this is not a claim
    // that a changed frozen source passed the hash gate to reach that validator.
    assert.throws(() => consumer.read(r), /CONSTRUCTED_SOURCE_DRIFT/u);
  }
});

test('caller getters are captured once and each shared-backed view is copied immediately', () => {
  const counts: Record<string, number> = {};
  const base = request();
  const originals = base.proposalSources as Record<string, Buffer>;
  const backing = Buffer.alloc(originals.candidatePacketBytes!.length + 8);
  originals.candidatePacketBytes!.copy(backing, 4);
  const sourceInput = Object.fromEntries(
    Object.keys(originals).map((key) => [key, undefined]),
  );
  for (const key of Object.keys(originals))
    Object.defineProperty(sourceInput, key, {
      enumerable: true,
      get() {
        counts[key] = (counts[key] ?? 0) + 1;
        if (key === 'parameterProposalBytes') backing.fill(0);
        return key === 'candidatePacketBytes'
          ? backing.subarray(4, backing.length - 4)
          : originals[key];
      },
    });
  const caller = {};
  for (const key of Object.keys(base))
    Object.defineProperty(caller, key, {
      enumerable: true,
      get() {
        counts['request:' + key] = (counts['request:' + key] ?? 0) + 1;
        return key === 'proposalSources' ? sourceInput : base[key];
      },
    });
  const r = consumer.read(caller);
  assert.equal(
    r.recipeIntermediate.theoreticalNetPotential.amount,
    '22371015.3437333325312',
  );
  assert(Object.values(counts).every((n) => n === 1));
  assert.equal(Object.isFrozen(caller), false);
  assert.equal(Object.isFrozen(sourceInput), false);
  assert.equal(Object.isFrozen(originals.parameterProposalBytes), false);
  assert(
    Object.isFrozen(r) &&
      Object.isFrozen(r.recipeIntermediate.theoreticalNetPotential),
  );
  assert.throws(() => {
    r.recipeIntermediate.theoreticalNetPotential.amount = '0';
  });
});

test('direct constructed producer also snapshots once and shares the same exact result', () => {
  const base = request(),
    counts: Record<string, number> = {};
  const caller = {};
  for (const key of Object.keys(base))
    Object.defineProperty(caller, key, {
      enumerable: true,
      get() {
        counts[key] = (counts[key] ?? 0) + 1;
        return base[key];
      },
    });
  const r = produceWaterServiceCandidate(caller) as unknown as Result;
  assert.equal(
    r.recipeIntermediate.theoreticalNetPotential.amount,
    '22371015.3437333325312',
  );
  assert(Object.values(counts).every((n) => n === 1));
});

test('constructor isolation and existing adopted-only route still exclude C02; default constants unchanged', () => {
  assert.throws(() => create({ mode, adopted: true }));
  assert.throws(
    () => consumer.snapshot(),
    /NOT_LOADED_IN_CONSTRUCTED_ONLY_MODE/u,
  );
  const adopted = create({ mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY' });
  assert.throws(
    () =>
      adopted.read({ ...request(), mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY' }),
    /UNSUPPORTED_AUTHORITY/u,
  );
  const r = request();
  delete r.proposalSources;
  assert.throws(
    () => adopted.read({ ...r, mode: 'ADOPTED_RECIPE_INTERMEDIATES_ONLY' }),
    /OUTSIDE_EXACT_16_SUBSET/u,
  );
  assert.equal(ORIGINAL_IDS.length, 16);
  assert(ORIGINAL_IDS.every((id) => !id.includes('COUNTRY_02')));
  assert.equal(
    SOURCE_PINS.referenceExtensions.country13Transport.stableId,
    'U2544::COUNTRY::COUNTRY_13::transportMinimum',
  );
});

test('tracked geography identity is a test control, not claimed as fresh producer input', () => {
  const b = read(
    '../../artifacts/world-balanced-candidate-v1/data/countries.json',
    146348,
  );
  pinned(b, {
    bytes: 146348,
    sha256: '5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89',
  });
  const countries = JSON.parse(b.toString('utf8'));
  assert.equal(countries[1].id, record.scenarioCountryId);
});
