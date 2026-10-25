// Three evidence planes: inert mechanism, reachable real negative, NOT_RUN positive.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  countryId,
  worldId,
  commodityId,
  inventoryBatchId,
  inventoryLocationId,
  legalEntityId,
  openingSeedId,
  openingSourceId,
  commandId,
  eventId,
  inventoryPostingId,
} from '@econmind/core';
import {
  evaluateIndustryGoverningForTestOnly as evaluate,
  parseIndustryGoverningRecordData,
  readIndustryProductionGoverningFrom,
  type IndustryGoverningCustodyPort,
} from '../../apps/world-worker/src/projections/industry-production-governing-source.js';
import { SqlEconomicReadVisibilitySource } from '../../apps/world-worker/src/projections/economic-read-visibility-source.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (s: string | Uint8Array) =>
  createHash('sha256').update(s).digest('hex');
const FP = `sha256:${sha('TEST_ONLY')}`;
const WORLD = worldId('WORLD_GOV_TEST_ONLY'),
  COUNTRY = countryId('COUNTRY_GOV_TEST_ONLY');
const PURPOSE = 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY' as const;
const bytes = (v: unknown) => new TextEncoder().encode(canonicalSerialize(v));
type Data = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);
function set(v: unknown, p: readonly (string | number)[], value: unknown) {
  let r = v as Data;
  for (const k of p.slice(0, -1)) r = r[k] as Data;
  r[p.at(-1)!] = value;
}
function fixture() {
  const h = { worldId: WORLD, worldVersion: '10', eventSequence: '20' },
    target = { worldId: WORLD, worldVersion: '2', eventSequence: '3' };
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    classification: 'OFFICE_PRIVATE' as const,
    officeId: 'INDUSTRY',
  };
  const worldBinding = {
    seedId: 'SEED_GOV_TEST_ONLY',
    seedFingerprint: FP,
    modelVersion: 'MODEL_TEST_ONLY',
    replayBindingFingerprint: FP,
  };
  const history = {
    commandId: 'COMMAND_GOV_TEST_ONLY',
    commandFingerprint: FP,
    eventId: 'EVENT_GOV_TEST_ONLY',
    eventFingerprint: FP,
    postingId: 'POSTING_GOV_TEST_ONLY',
    postingFingerprint: FP,
  };
  const sourceBinding = {
    sourceId: 'SOURCE_TEST_ONLY',
    sourceRevision: '2',
    sourceFingerprint: FP,
    ownerAdoptionRef: 'ADOPTION_TEST_ONLY',
    ownerAdoptionFingerprint: FP,
    admissionRef: 'ADMISSION_TEST_ONLY',
    admissionRevision: '3',
  };
  const accounts = ['OUTPUT', 'MATERIAL'].map((kind) =>
    createInventoryAccount({
      worldId: WORLD,
      countryId: COUNTRY,
      commodityId: commodityId('COMMODITY_' + kind),
      batchId: inventoryBatchId('BATCH_' + kind),
      unit: 'tonne',
      physicalLocationId: inventoryLocationId('LOCATION_TEST_ONLY'),
      bucket: 'AVAILABLE',
      reservationId: null,
      shipmentId: null,
      titleHolderId: legalEntityId('ENTITY_ORIGINAL'),
      riskBearerId: legalEntityId('ENTITY_RISK'),
      economicRecognitionId: null,
    }),
  );
  const records = accounts.map((account, i) => ({
    schemaVersion: 'industry-production-governing-record-v1',
    recordId: 'RECORD_' + i,
    revision: '2',
    sourceBinding: clone(sourceBinding),
    scope: clone(scope),
    purpose: PURPOSE,
    ownerBinding: {
      historicalTitleHolderId: account.titleHolderId,
      historicalRiskBearerId: account.riskBearerId,
      currentAuthorityHolderId: 'ENTITY_TRANSFERRED',
      authorityRecordRef: 'AUTHORITY_HISTORY_' + i,
      authorityRecordFingerprint: FP,
    },
    account: { ...account },
    targetHistory: clone(history),
    effectivity: {
      from: { worldVersion: '0', eventSequence: '0' },
      until: null as { worldVersion: string; eventSequence: string } | null,
    },
    revokedAt: null as { worldVersion: string; eventSequence: string } | null,
    sourceUnits: ['CONSTITUTION-U0381', 'INDUSTRY-U0001'],
  }));
  const rows = records.map((record) => ({
    recordId: record.recordId,
    revision: record.revision,
    bytes: bytes(record),
  }));
  const entries = rows.map((r, i) => ({
    recordId: r.recordId,
    revision: r.revision,
    rawByteLength: String(r.bytes.length),
    rawSHA256: sha(r.bytes),
    currentAuthorityHolderId: records[i]!.ownerBinding.currentAuthorityHolderId,
    authorityRecordRef: records[i]!.ownerBinding.authorityRecordRef,
    authorityRecordFingerprint:
      records[i]!.ownerBinding.authorityRecordFingerprint,
  }));
  const request = {
    publicationHead: h,
    worldBinding,
    scope,
    purpose: PURPOSE,
    targetHistory: history,
  };
  const witness = {
    publicationHead: clone(h),
    targetCutoff: target,
    targetHistory: clone(history),
    accounts,
  };
  const snapshot = {
    schemaVersion: 'industry-production-governing-custodied-snapshot-v1',
    publicationHead: clone(h),
    worldBinding: clone(worldBinding),
    sourceAuthority: {
      issuerId: 'ISSUER_TEST_ONLY',
      custodianId: 'CUSTODIAN_TEST_ONLY',
      ...sourceBinding,
    },
    manifest: {
      manifestId: 'MANIFEST_TEST_ONLY',
      revision: '4',
      contentFingerprint: FP,
      scope: clone(scope),
      purpose: PURPOSE,
      targetHistory: clone(history),
      entries,
    },
    records: rows,
  };
  return { request, witness, snapshot, records };
}
function input(f = fixture()) {
  return { request: f.request, witness: f.witness, snapshot: f.snapshot };
}
function refresh(f: ReturnType<typeof fixture>) {
  f.snapshot.records = f.records.map((r) => ({
    recordId: r.recordId,
    revision: r.revision,
    bytes: bytes(r),
  }));
  f.snapshot.manifest.entries = f.snapshot.records.map((r, i) => ({
    recordId: r.recordId,
    revision: r.revision,
    rawByteLength: String(r.bytes.length),
    rawSHA256: sha(r.bytes),
    currentAuthorityHolderId:
      f.records[i]!.ownerBinding.currentAuthorityHolderId,
    authorityRecordRef: f.records[i]!.ownerBinding.authorityRecordRef,
    authorityRecordFingerprint:
      f.records[i]!.ownerBinding.authorityRecordFingerprint,
  }));
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST', 'true');
  vi.stubEnv('ECONMIND_ENV', 'local');
});
afterEach(() => vi.unstubAllEnvs());

describe('C governing shared private algorithm, explicitly TEST_ONLY not admitted', () => {
  it('covers output and every historical material at T<H, allowing transferred current authority', () => {
    const f = fixture(),
      out = evaluate(input(f));
    expect(out).toEqual({
      kind: 'EVALUATED_TEST_ONLY',
      sourceAdmitted: false,
      productionAuthority: false,
      result: {
        disclosure: {
          status: 'AUTHORIZED',
          sourceUnits: ['CONSTITUTION-U0381', 'INDUSTRY-U0001'],
        },
        resultSummary: {
          status: 'AUTHORIZED_RESULT_ONLY',
          purpose: PURPOSE,
          sourceHead: f.request.publicationHead,
          causeBinding: {
            commandId: f.request.targetHistory.commandId,
            commandFingerprint: FP,
            eventId: f.request.targetHistory.eventId,
            eventFingerprint: FP,
          },
        },
      },
    });
    expect(Object.isFrozen(out.result.resultSummary)).toBe(true);
    expect(Object.isFrozen(f.snapshot)).toBe(false);
    expect(canonicalSerialize(out)).not.toContain('ENTITY_TRANSFERRED');
    expect(canonicalSerialize(out)).not.toContain('tonne');
    // No current stock balance is supplied or required by this history classifier.
  });
  it('also accepts T=H and inclusive effectivity start, exact numeric frontiers', () => {
    const f = fixture();
    f.witness.targetCutoff = clone(f.request.publicationHead);
    for (const r of f.records)
      r.effectivity.from = { worldVersion: '10', eventSequence: '20' };
    refresh(f);
    expect(evaluate(input(f)).result.disclosure.status).toBe('AUTHORIZED');
  });
  it('owns canonical raw bytes/data, never yields an admitted record', () => {
    const f = fixture(),
      raw = f.snapshot.records[0]!.bytes,
      out = parseIndustryGoverningRecordData(raw, sha(raw));
    raw.fill(0);
    expect(out.kind).toBe('UNTRUSTED_GOVERNING_RECORD_DATA');
    expect(out.record.recordId).toBe('RECORD_0');
    expect(Object.isFrozen(out.record.ownerBinding)).toBe(true);
    expect(Object.hasOwn(out, 'sourceAdmitted')).toBe(false);
  });
  it('copies byte views intrinsically before consulting any later record data', () => {
    const f = fixture(),
      raw = f.snapshot.records[0]!.bytes;
    let calls = 0;
    Object.defineProperty(raw, 'constructor', {
      get() {
        calls++;
        throw Error('SPECIES_HOOK');
      },
    });
    expect(parseIndustryGoverningRecordData(raw, sha(raw)).kind).toBe(
      'UNTRUSTED_GOVERNING_RECORD_DATA',
    );
    expect(calls).toBe(0);
    // The next record's metadata access is never used to re-read the prior view.
    // Accessor-bearing row itself is rejected without running the accessor.
    Object.defineProperty(f.snapshot.records[1]!, 'recordId', {
      enumerable: true,
      get() {
        calls++;
        raw.fill(0);
        return 'RECORD_1';
      },
    });
    expect(() => evaluate(input(f))).toThrow();
    expect(calls).toBe(0);
  });
  it.each(['until', 'revokedAt', 'future'])(
    'denies at the exact disallowed frontier: %s',
    (kind) => {
      const f = fixture();
      for (const r of f.records) {
        if (kind === 'until')
          r.effectivity.until = { worldVersion: '10', eventSequence: '20' };
        if (kind === 'revokedAt')
          r.revokedAt = { worldVersion: '10', eventSequence: '20' };
        if (kind === 'future')
          r.effectivity.from = { worldVersion: '11', eventSequence: '21' };
      }
      refresh(f);
      expect(evaluate(input(f)).result).toEqual({
        disclosure: {
          status: 'NOT_AUTHORIZED',
          reason: 'OWNER_MAPPING_UNAVAILABLE',
        },
        resultSummary: { status: 'NOT_AUTHORIZED' },
      });
    },
  );
  it.each([
    {
      name: 'crossed-bounds',
      path: ['effectivity', 'until'],
      value: { worldVersion: '1', eventSequence: '0' },
    },
    {
      name: 'inverted-interval',
      path: ['effectivity', 'until'],
      value: { worldVersion: '0', eventSequence: '0' },
    },
    {
      name: 'noncanonical-number',
      path: ['effectivity', 'from', 'worldVersion'],
      value: '01',
    },
    {
      name: 'overflow',
      path: ['effectivity', 'from', 'eventSequence'],
      value: '9223372036854775808',
    },
    {
      name: 'historical-holder',
      path: ['ownerBinding', 'historicalTitleHolderId'],
      value: 'ENTITY_FOREIGN',
    },
    {
      name: 'historical-risk',
      path: ['ownerBinding', 'historicalRiskBearerId'],
      value: 'ENTITY_FOREIGN',
    },
    { name: 'unknown-schema', path: ['schemaVersion'], value: 'other' },
    { name: 'wrong-purpose', path: ['purpose'], value: 'SOCIAL' },
    {
      name: 'extra-accountId',
      path: ['account', 'accountId'],
      value: 'ACCOUNT_FAKE',
    },
    {
      name: 'extra-ownerId',
      path: ['account', 'ownerId'],
      value: 'ENTITY_FAKE',
    },
    {
      name: 'bad-hash',
      path: ['sourceBinding', 'sourceFingerprint'],
      value: 'a'.repeat(64),
    },
    { name: 'zero-revision', path: ['revision'], value: '0' },
    {
      name: 'unit-duplicates',
      path: ['sourceUnits'],
      value: ['INDUSTRY-U0001', 'INDUSTRY-U0001'],
    },
    { name: 'empty-units', path: ['sourceUnits'], value: [] },
    { name: 'extra-admitted-flag', path: ['sourceAdmitted'], value: true },
  ])('raw parser rejects $name', ({ path, value }) => {
    const record = clone(fixture().records[0]!);
    if (
      path[0] === 'effectivity' &&
      path[1] === 'until' &&
      path.length === 2 &&
      path[2] === undefined &&
      typeof value === 'object' &&
      value !== null &&
      'worldVersion' in value &&
      value.worldVersion === '1'
    )
      record.effectivity.from = { worldVersion: '0', eventSequence: '2' };
    set(record, path, value);
    const raw = bytes(record);
    expect(() => parseIndustryGoverningRecordData(raw, sha(raw))).toThrow();
  });
  it.each([
    { name: 'World', p: ['publicationHead', 'worldId'], v: 'WORLD_FOREIGN' },
    { name: 'World-version', p: ['publicationHead', 'worldVersion'], v: '11' },
    {
      name: 'event-sequence',
      p: ['publicationHead', 'eventSequence'],
      v: '21',
    },
    { name: 'seed', p: ['worldBinding', 'seedId'], v: 'SEED_FOREIGN' },
    { name: 'model', p: ['worldBinding', 'modelVersion'], v: 'MODEL_FOREIGN' },
    {
      name: 'replay',
      p: ['worldBinding', 'replayBindingFingerprint'],
      v: `sha256:${'b'.repeat(64)}`,
    },
    { name: 'source', p: ['sourceAuthority', 'sourceId'], v: 'SOURCE_FOREIGN' },
    {
      name: 'adoption',
      p: ['sourceAuthority', 'ownerAdoptionRef'],
      v: 'ADOPTION_FOREIGN',
    },
    { name: 'admission', p: ['sourceAuthority', 'admissionRevision'], v: '4' },
    {
      name: 'scope',
      p: ['manifest', 'scope', 'countryId'],
      v: 'COUNTRY_FOREIGN',
    },
    { name: 'office', p: ['manifest', 'scope', 'officeId'], v: 'SOCIAL' },
    { name: 'purpose', p: ['manifest', 'purpose'], v: 'SOCIAL' },
    {
      name: 'command',
      p: ['manifest', 'targetHistory', 'commandId'],
      v: 'COMMAND_FOREIGN',
    },
    {
      name: 'commandFP',
      p: ['manifest', 'targetHistory', 'commandFingerprint'],
      v: `sha256:${'b'.repeat(64)}`,
    },
    {
      name: 'event',
      p: ['manifest', 'targetHistory', 'eventId'],
      v: 'EVENT_FOREIGN',
    },
    {
      name: 'eventFP',
      p: ['manifest', 'targetHistory', 'eventFingerprint'],
      v: `sha256:${'b'.repeat(64)}`,
    },
    {
      name: 'posting',
      p: ['manifest', 'targetHistory', 'postingId'],
      v: 'POSTING_FOREIGN',
    },
    {
      name: 'postingFP',
      p: ['manifest', 'targetHistory', 'postingFingerprint'],
      v: `sha256:${'b'.repeat(64)}`,
    },
    {
      name: 'current-authority',
      p: ['manifest', 'entries', 0, 'currentAuthorityHolderId'],
      v: 'ENTITY_FOREIGN',
    },
    {
      name: 'authority-history-ref',
      p: ['manifest', 'entries', 0, 'authorityRecordRef'],
      v: 'AUTHORITY_FOREIGN',
    },
    {
      name: 'authority-history-fp',
      p: ['manifest', 'entries', 0, 'authorityRecordFingerprint'],
      v: `sha256:${'b'.repeat(64)}`,
    },
    {
      name: 'raw-length',
      p: ['manifest', 'entries', 0, 'rawByteLength'],
      v: '1',
    },
    {
      name: 'raw-hash',
      p: ['manifest', 'entries', 0, 'rawSHA256'],
      v: 'b'.repeat(64),
    },
    {
      name: 'stale-revision',
      p: ['manifest', 'entries', 0, 'revision'],
      v: '1',
    },
    { name: 'extra-flag', p: ['sourceAdmitted'], v: true },
  ])('rejects snapshot $name mismatch', ({ p, v }) => {
    const f = fixture();
    set(f.snapshot, p, v);
    expect(() => evaluate(input(f))).toThrow();
  });
  it('denies omitted output/material or unrelated extra tuple without partial cause/metric leak', () => {
    for (const index of [0, 1]) {
      const f = fixture();
      f.records.splice(index, 1);
      refresh(f);
      expect(evaluate(input(f)).result.resultSummary).toEqual({
        status: 'NOT_AUTHORIZED',
      });
    }
    const f = fixture();
    set(f.records[0], ['account', 'batchId'], 'BATCH_FOREIGN');
    refresh(f);
    expect(evaluate(input(f)).result.disclosure.status).toBe('NOT_AUTHORIZED');
  });
  it('rejects effectivity coordinates crossed against H in the evaluator, not the H-free raw parser', () => {
    const f = fixture();
    f.records[0]!.effectivity.from = {
      worldVersion: '11',
      eventSequence: '19',
    };
    refresh(f);
    const raw = f.snapshot.records[0]!.bytes;
    expect(parseIndustryGoverningRecordData(raw, sha(raw)).kind).toBe(
      'UNTRUSTED_GOVERNING_RECORD_DATA',
    );
    expect(() => evaluate(input(f))).toThrow('Crossed World/event frontier');
  });
  it('checks a crossed revocation frontier even when a future start already denies', () => {
    const f = fixture();
    f.records[0]!.effectivity.from = {
      worldVersion: '11',
      eventSequence: '40',
    };
    f.records[0]!.revokedAt = { worldVersion: '5', eventSequence: '30' };
    refresh(f);
    expect(() => evaluate(input(f))).toThrow('Crossed World/event frontier');
  });
  it('retains all explicitly supplied normative unit refs within the raw byte cap', () => {
    const f = fixture();
    for (const r of f.records)
      r.sourceUnits = Array.from(
        { length: 129 },
        (_, i) => `INDUSTRY-U${String(i).padStart(4, '0')}`,
      );
    refresh(f);
    const result = evaluate(input(f));
    expect(result.sourceAdmitted).toBe(false);
    expect(result.result.disclosure).toMatchObject({
      status: 'AUTHORIZED',
      sourceUnits: f.records[0]!.sourceUnits,
    });
  });
  it('rejects complete-manifest row omissions/extras/duplicates and ambiguous tuple mappings', () => {
    const missing = fixture();
    missing.snapshot.records.pop();
    expect(() => evaluate(input(missing))).toThrow();
    const extra = fixture();
    extra.snapshot.records.push(clone(extra.snapshot.records[0]!));
    expect(() => evaluate(input(extra))).toThrow();
    const dup = fixture();
    dup.snapshot.manifest.entries.push(
      clone(dup.snapshot.manifest.entries[0]!),
    );
    expect(() => evaluate(input(dup))).toThrow();
    const ambiguous = fixture();
    ambiguous.records[1]!.account = { ...ambiguous.records[0]!.account };
    refresh(ambiguous);
    expect(() => evaluate(input(ambiguous))).toThrow();
  });
  it('does not fall back from a latest revoked revision to an older permissive record', () => {
    const f = fixture();
    f.records[0]!.revision = '10';
    f.records[0]!.revokedAt = { worldVersion: '10', eventSequence: '20' };
    refresh(f);
    expect(evaluate(input(f)).result.resultSummary.status).toBe(
      'NOT_AUTHORIZED',
    );
    f.snapshot.records.push({ ...f.snapshot.records[0]!, revision: '2' });
    expect(() => evaluate(input(f))).toThrow();
  });
  it('rejects malformed/noncanonical/duplicate-key bytes, wrong hashes, capacity and Proxy hooks', () => {
    for (const raw of [
      new TextEncoder().encode('{"x":"1","x":"1"}'),
      new TextEncoder().encode(' {}'),
      new Uint8Array([255]),
      new Uint8Array(8_388_609),
    ])
      expect(() => parseIndustryGoverningRecordData(raw, sha(raw))).toThrow();
    const raw = fixture().snapshot.records[0]!.bytes;
    expect(() =>
      parseIndustryGoverningRecordData(raw, 'a'.repeat(64)),
    ).toThrow();
    let calls = 0;
    const trap = () => {
      calls++;
      throw Error('HOOK');
    };
    const proxy = new Proxy(raw, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
    });
    expect(() => parseIndustryGoverningRecordData(proxy, sha(raw))).toThrow();
    expect(calls).toBe(0);
    const f = fixture();
    set(f.snapshot, ['records'], Array(10001).fill(null));
    expect(() => evaluate(input(f))).toThrow();
    const total = fixture();
    for (const r of total.snapshot.records) r.bytes = new Uint8Array(4_194_305);
    expect(() => evaluate(input(total))).toThrow(
      'Total original record bytes exceed capacity',
    );
  });
  it('rejects metadata accessors and Proxy objects without invoking hooks', () => {
    for (const path of [[], ['manifest'], ['records'], ['records', 0]] as (
      string | number
    )[][]) {
      const f = fixture();
      let value: unknown = f.snapshot;
      for (const key of path) value = (value as Data)[key];
      let calls = 0;
      const trap = () => {
        calls++;
        throw Error('HOOK');
      };
      const proxy = new Proxy(value as object, {
        get: trap,
        getPrototypeOf: trap,
        ownKeys: trap,
        getOwnPropertyDescriptor: trap,
      });
      if (path.length) set(f.snapshot, path, proxy);
      else set(f, ['snapshot'], proxy);
      expect(() => evaluate(input(f))).toThrow();
      expect(calls).toBe(0);
    }
  });
  it('rejects crossed/future target cutoff and gates the mechanism outside test/local-or-ci', () => {
    const f = fixture();
    f.witness.targetCutoff = {
      worldId: WORLD,
      worldVersion: '11',
      eventSequence: '19',
    };
    expect(() => evaluate(input(f))).toThrow();
    vi.stubEnv('ECONMIND_ENV', 'production');
    expect(() => evaluate(input())).toThrow(
      'INDUSTRY_GOVERNING_TEST_RUNTIME_REQUIRED',
    );
  });
});

/** Fresh empty nonproduction SQL protocol only. No fixture retag, live DB or admission. */
function emptyLineage() {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_EMPTY_SQL_PROTOCOL'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://TEST_ONLY_EMPTY_SQL_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: 'EMPTY_SQL_PROTOCOL_NOT_SOURCE_ADMISSION' },
    },
    (s) => sha(s),
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_EMPTY_SQL_PROTOCOL'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    (s) => sha(s),
  );
  const { fingerprint, ...intent } = seed,
    trace: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      trace.push(sql);
      let rows: readonly object[];
      if (sql.includes('from world_v2.world_head'))
        rows = [{ world_version: '0', event_sequence: '0' }];
      else if (sql.includes('to_regclass'))
        rows = [{ opening: null, admission: null }];
      else if (sql.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: WORLD,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(intent),
            seed_fingerprint: fingerprint,
          },
        ];
      else if (
        [
          'authoritative_event event',
          'inventory_posting',
          'financial_posting_batch',
          'command_receipt',
        ].some((name) => sql.includes('from world_v2.' + name))
      )
        rows = [];
      else throw Error('UNEXPECTED_SQL_PROTOCOL_QUERY');
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw Error('NO_POOL_QUERY');
    },
    transaction: async () => {
      throw Error('NO_NESTED_TRANSACTION');
    },
  };
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: (s) => sha(s),
  });
  const selectors = {
    worldId: WORLD,
    countryId: COUNTRY,
    commandId: commandId('COMMAND_ABSENT'),
    eventId: eventId('EVENT_ABSENT'),
    postingId: inventoryPostingId('POSTING_ABSENT'),
    expectedPublicationHead: {
      worldId: WORLD,
      worldVersion: '0',
      eventSequence: '0',
    },
  };
  return { reader, executor, database, selectors, trace };
}
describe('C actual issuer/accessor reachable negatives and optional compatibility only', () => {
  it('uses actual reader/issuer over empty protocol and refuses absent target before custody', async () => {
    const f = emptyLineage();
    let calls = 0;
    const custody: IndustryGoverningCustodyPort = {
      withSnapshotFrom: async () => {
        calls++;
        throw Error('CUSTODY_NOT_REACHABLE');
      },
    };
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        const result = await readIndustryProductionGoverningFrom(
          f.executor,
          view,
          f.selectors,
          fixture().request.scope,
          custody,
        );
        expect(result).toEqual({
          disclosure: {
            status: 'NOT_AUTHORIZED',
            reason: 'ADMITTED_SOURCE_UNAVAILABLE',
          },
          resultSummary: { status: 'NOT_AUTHORIZED' },
        });
        await expect(
          readIndustryProductionGoverningFrom(
            { query: f.executor.query },
            view,
            f.selectors,
            fixture().request.scope,
            custody,
          ),
        ).rejects.toThrow('forged, expired');
      },
    );
    expect(calls).toBe(0);
    expect(f.trace.some((s) => s.includes('authoritative_event event'))).toBe(
      true,
    );
  });
  it('rejects forged/expired genuine views and wrong private scope without a source grant', async () => {
    const f = emptyLineage(),
      custody: IndustryGoverningCustodyPort = {
        withSnapshotFrom: async () => {
          throw Error('UNREACHABLE');
        },
      };
    let escaped: ValidatedCanonicalLineageView | undefined;
    await expect(
      readIndustryProductionGoverningFrom(
        f.executor,
        {} as ValidatedCanonicalLineageView,
        f.selectors,
        fixture().request.scope,
        custody,
      ),
    ).rejects.toThrow('forged, expired');
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        escaped = view;
        expect(
          (
            await readIndustryProductionGoverningFrom(
              f.executor,
              view,
              f.selectors,
              { ...fixture().request.scope, officeId: 'SOCIAL' },
              custody,
            )
          ).disclosure,
        ).toEqual({ status: 'NOT_AUTHORIZED', reason: 'SCOPE_NOT_AUTHORIZED' });
      },
    );
    expect(escaped).toBeDefined();
    await expect(
      readIndustryProductionGoverningFrom(
        f.executor,
        escaped!,
        f.selectors,
        fixture().request.scope,
        custody,
      ),
    ).rejects.toThrow('forged, expired');
  });
  it('preserves one-argument financial/inventory/v1 summary and absent-custody denial', async () => {
    const f = emptyLineage(),
      source = new SqlEconomicReadVisibilitySource(f.database),
      snapshot = await source.loadFrom(f.executor, {
        worldId: WORLD,
        worldVersion: '0',
        eventSequence: '0',
      }),
      scope = fixture().request.scope;
    expect(snapshot.financial({}, scope)).toEqual({
      status: 'NOT_AUTHORIZED',
      reason: 'ADMITTED_SOURCE_UNAVAILABLE',
    });
    expect(snapshot.inventory({}, scope)).toEqual({
      status: 'NOT_AUTHORIZED',
      reason: 'OWNER_MAPPING_UNAVAILABLE',
    });
    expect(snapshot.summary(scope)).toEqual({
      schemaVersion: 'economic-read-visibility-v1',
      financialDetail: 'NOT_AUTHORIZED',
      inventoryDetail: 'NOT_AUTHORIZED',
      countrySummary: 'NOT_AUTHORIZED',
    });
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        expect(
          await snapshot.productionResultFrom!(view, f.selectors, scope),
        ).toEqual({
          disclosure: {
            status: 'NOT_AUTHORIZED',
            reason: 'ADMITTED_SOURCE_UNAVAILABLE',
          },
          resultSummary: { status: 'NOT_AUTHORIZED' },
        });
      },
    );
    await expect(
      source.loadFrom(f.executor, {
        worldId: WORLD,
        worldVersion: '1',
        eventSequence: '0',
      }),
    ).rejects.toThrow('held publication head');
  });
  it('binds optional result to captured World/H and the same executor', async () => {
    const f = emptyLineage(),
      source = new SqlEconomicReadVisibilitySource(f.database),
      snapshot = await source.loadFrom(f.executor, {
        worldId: 'WORLD_OTHER',
        worldVersion: '0',
        eventSequence: '0',
      });
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        await expect(
          snapshot.productionResultFrom!(
            view,
            f.selectors,
            fixture().request.scope,
          ),
        ).rejects.toThrow('held snapshot head');
      },
    );
  });
  // Genuine production positive and post-production custody-await branches are
  // NOT_RUN_DEPENDENCY: current actual reader refuses production decoding.
  // No A mock, issuer/reader replacement, fixture retag or hard-deny change.
});
