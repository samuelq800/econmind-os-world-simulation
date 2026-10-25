/** Governing data validation. No custodian, source issuer or default provider. */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  commandId,
  countryId,
  createInventoryAccount,
  eventId,
  inventoryPostingId,
  legalEntityId,
  openingSeedId,
  worldId,
  type DecisionResultHead,
  type EconomicReadDenialReason,
  type EconomicReadDisclosure,
  type EconomicReadScope,
  type InventoryAccount,
  type IndustryProductionResultDisclosure,
} from '@econmind/core';
import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../persistence/validated-canonical-lineage.js';
import {
  readIndustryProductionSourceFrom,
  type IndustryProductionSelectors,
} from './industry-production-source-port.js';

const PURPOSE = 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY' as const;
const RECORD_SCHEMA = 'industry-production-governing-record-v1';
const SNAPSHOT_SCHEMA = 'industry-production-governing-custodied-snapshot-v1';
const LIMIT = 10_000,
  BYTE_LIMIT = 8_388_608;
type Data = Record<string, unknown>;
type Frontier = Readonly<{ worldVersion: string; eventSequence: string }>;
type History = Readonly<{
  commandId: string;
  commandFingerprint: string;
  eventId: string;
  eventFingerprint: string;
  postingId: string;
  postingFingerprint: string;
}>;
type WorldBinding = Readonly<{
  seedId: string;
  seedFingerprint: string;
  modelVersion: string;
  replayBindingFingerprint: string;
}>;
type SourceBinding = Readonly<{
  sourceId: string;
  sourceRevision: string;
  sourceFingerprint: string;
  ownerAdoptionRef: string;
  ownerAdoptionFingerprint: string;
  admissionRef: string;
  admissionRevision: string;
}>;
type OwnerBinding = Readonly<{
  historicalTitleHolderId: string;
  historicalRiskBearerId: string;
  currentAuthorityHolderId: string;
  authorityRecordRef: string;
  authorityRecordFingerprint: string;
}>;
interface GoverningRecord {
  readonly schemaVersion: typeof RECORD_SCHEMA;
  readonly recordId: string;
  readonly revision: string;
  readonly sourceBinding: SourceBinding;
  readonly scope: EconomicReadScope;
  readonly purpose: typeof PURPOSE;
  readonly ownerBinding: OwnerBinding;
  readonly account: Readonly<InventoryAccount>;
  readonly targetHistory: History;
  readonly effectivity: Readonly<{ from: Frontier; until: Frontier | null }>;
  readonly revokedAt: Frontier | null;
  readonly sourceUnits: readonly string[];
}
export interface UntrustedIndustryGoverningRecordData {
  readonly kind: 'UNTRUSTED_GOVERNING_RECORD_DATA';
  readonly record: Readonly<GoverningRecord>;
}
export interface IndustryGoverningSnapshotRequest {
  readonly publicationHead: DecisionResultHead;
  readonly worldBinding: WorldBinding;
  readonly scope: EconomicReadScope;
  readonly purpose: typeof PURPOSE;
  readonly targetHistory: History;
}
export type IndustryProductionGoverningResult = Readonly<{
  disclosure: EconomicReadDisclosure;
  resultSummary: IndustryProductionResultDisclosure;
}>;
/**
 * Explicit independently verified custody trust boundary. A real adapter MUST
 * verify original provenance/adoption/current admission, authority/transfer and
 * selected-history rights, normative unit coverage and complete latest manifest
 * while real cooperating source resources remain protected through this scope.
 * A callback, same executor, schema/hash or test provider does not prove that.
 * There is no production adapter/registration supplied by this module.
 */
export interface IndustryGoverningCustodyPort {
  withSnapshotFrom<Result>(
    executor: SqlExecutor,
    request: Readonly<IndustryGoverningSnapshotRequest>,
    consume: (snapshot: unknown) => Promise<Result>,
  ): Promise<Result>;
}
const digest = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Industry governing source: ${message}`,
  );
}
function closed(value: unknown, keys: readonly string[]): Data {
  if (
    nodeTypes.isProxy(value) ||
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid('Plain closed own record required');
  const ds = Object.getOwnPropertyDescriptors(value),
    actual = Reflect.ownKeys(ds),
    out: Data = {};
  if (
    actual.length !== keys.length ||
    actual.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    invalid('Missing or unknown field');
  for (const key of keys) {
    const d = ds[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Accessor/hidden field');
    out[key] = d.value;
  }
  return out;
}
function array(value: unknown, min = 0, max = LIMIT): unknown[] {
  if (
    nodeTypes.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    invalid('Plain array required');
  const ds = Object.getOwnPropertyDescriptors(value),
    n = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
  if (n < min || n > max || Reflect.ownKeys(ds).length !== n + 1)
    invalid('Dense bounded array required');
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const d = ds[String(i)];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Array accessor/hole');
    out.push(d.value);
  }
  return out;
}
function freeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
function own<T>(value: T): Readonly<T> {
  return freeze(JSON.parse(canonicalSerialize(value)) as T);
}
function ref(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(v))
    invalid('Canonical reference required');
  return v;
}
function uint(v: unknown, positive = false): string {
  if (
    typeof v !== 'string' ||
    v.length > 19 ||
    !(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(v) ||
    BigInt(v) > 9_223_372_036_854_775_807n
  )
    invalid('Canonical bounded integer text required');
  return v;
}
function fp(v: unknown): string {
  if (typeof v !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(v))
    invalid('Canonical object fingerprint required');
  return v;
}
function rawSha(v: unknown): string {
  if (typeof v !== 'string' || !/^[0-9a-f]{64}$/u.test(v))
    invalid('Raw byte SHA256 required');
  return v;
}
function equal(a: unknown, b: unknown, label: string): void {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(label);
}
function frontier(v: unknown): Frontier {
  const r = closed(v, ['worldVersion', 'eventSequence']);
  return {
    worldVersion: uint(r.worldVersion),
    eventSequence: uint(r.eventSequence),
  };
}
function head(v: unknown): DecisionResultHead {
  const r = closed(v, ['worldId', 'worldVersion', 'eventSequence']);
  return {
    worldId: worldId(ref(r.worldId)),
    ...frontier({
      worldVersion: r.worldVersion,
      eventSequence: r.eventSequence,
    }),
  };
}
/** Product order, never lexicographic: crossed coordinates are invalid. */
function compare(a: Frontier, b: Frontier): number {
  const w = BigInt(a.worldVersion) - BigInt(b.worldVersion),
    e = BigInt(a.eventSequence) - BigInt(b.eventSequence);
  if ((w < 0n && e > 0n) || (w > 0n && e < 0n))
    invalid('Crossed World/event frontier');
  return w === 0n && e === 0n ? 0 : w < 0n || e < 0n ? -1 : 1;
}
function scope(v: unknown): EconomicReadScope {
  const r = closed(v, ['worldId', 'countryId', 'classification', 'officeId']);
  worldId(ref(r.worldId));
  countryId(ref(r.countryId));
  if (r.classification !== 'OFFICE_PRIVATE' || r.officeId !== 'INDUSTRY')
    invalid('Only exact private Industry scope');
  return r as EconomicReadScope;
}
function worldBinding(v: unknown): WorldBinding {
  const r = closed(v, [
    'seedId',
    'seedFingerprint',
    'modelVersion',
    'replayBindingFingerprint',
  ]);
  openingSeedId(ref(r.seedId));
  fp(r.seedFingerprint);
  ref(r.modelVersion);
  fp(r.replayBindingFingerprint);
  return r as WorldBinding;
}
function history(v: unknown): History {
  const r = closed(v, [
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
    'postingId',
    'postingFingerprint',
  ]);
  commandId(ref(r.commandId));
  eventId(ref(r.eventId));
  inventoryPostingId(ref(r.postingId));
  fp(r.commandFingerprint);
  fp(r.eventFingerprint);
  fp(r.postingFingerprint);
  return r as History;
}
const SOURCE_KEYS = [
  'sourceId',
  'sourceRevision',
  'sourceFingerprint',
  'ownerAdoptionRef',
  'ownerAdoptionFingerprint',
  'admissionRef',
  'admissionRevision',
];
function sourceBinding(v: unknown): SourceBinding {
  const r = closed(v, SOURCE_KEYS);
  ref(r.sourceId);
  uint(r.sourceRevision, true);
  fp(r.sourceFingerprint);
  ref(r.ownerAdoptionRef);
  fp(r.ownerAdoptionFingerprint);
  ref(r.admissionRef);
  uint(r.admissionRevision, true);
  return r as SourceBinding;
}
const ACCOUNT_KEYS = [
  'worldId',
  'countryId',
  'commodityId',
  'batchId',
  'unit',
  'physicalLocationId',
  'bucket',
  'reservationId',
  'shipmentId',
  'titleHolderId',
  'riskBearerId',
  'economicRecognitionId',
];
function account(v: unknown): Readonly<InventoryAccount> {
  const r = closed(v, ACCOUNT_KEYS);
  for (const key of ACCOUNT_KEYS) {
    const value = r[key];
    if (key === 'unit') {
      if (typeof value !== 'string') invalid('Exact Core unit required');
      continue;
    }
    if (
      !['reservationId', 'shipmentId', 'economicRecognitionId'].includes(key) ||
      value !== null
    )
      ref(value);
  }
  const parsed = createInventoryAccount(r as unknown as InventoryAccount);
  equal(parsed, r, 'Account may not be repaired');
  return parsed;
}
function sourceUnits(v: unknown): readonly string[] {
  // The already-enforced raw byte cap bounds this set. Do not invent an
  // unrelated per-adoption economic/unit-count limit.
  const a = array(v, 1, BYTE_LIMIT).map(ref);
  for (let i = 1; i < a.length; i++)
    if (a[i - 1]! >= a[i]!)
      invalid('Source units must be unique canonical order');
  return a;
}
function denied(
  reason: EconomicReadDenialReason,
): IndustryProductionGoverningResult {
  return freeze({
    disclosure: { status: 'NOT_AUTHORIZED', reason },
    resultSummary: { status: 'NOT_AUTHORIZED' },
  } as const);
}

/** Snapshot the bytes intrinsically; do not consult caller getters/iterators/species. */
function byteCopy(value: unknown): Uint8Array {
  if (
    nodeTypes.isProxy(value) ||
    !nodeTypes.isUint8Array(value) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype
  )
    invalid('Plain Uint8Array bytes required');
  const intrinsic = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    'byteLength',
  )!.get!;
  const n = Reflect.apply(intrinsic, value, []) as number;
  if (n < 1 || n > BYTE_LIMIT) invalid('Raw record byte capacity');
  const copy = new Uint8Array(n);
  Uint8Array.prototype.set.call(copy, value);
  return copy;
}
function validateOwnedRecord(
  bytes: Uint8Array,
  expected: string,
): Readonly<UntrustedIndustryGoverningRecordData> {
  rawSha(expected);
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    invalid('Raw record hash differs');
  let text: string, value: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
    value = JSON.parse(text);
  } catch {
    invalid('Record must be canonical UTF8 JSON');
  }
  let nodes = 0;
  const bound = (v: unknown, depth = 0): void => {
    if (++nodes > 1_000_000 || depth > 16)
      invalid('Raw record structural capacity');
    if (v !== null && typeof v === 'object')
      for (const child of Object.values(v)) bound(child, depth + 1);
  };
  bound(value);
  if (canonicalSerialize(value) !== text) invalid('Noncanonical record bytes');
  const r = closed(value, [
    'schemaVersion',
    'recordId',
    'revision',
    'sourceBinding',
    'scope',
    'purpose',
    'ownerBinding',
    'account',
    'targetHistory',
    'effectivity',
    'revokedAt',
    'sourceUnits',
  ]);
  if (r.schemaVersion !== RECORD_SCHEMA || r.purpose !== PURPOSE)
    invalid('Record schema/purpose differs');
  ref(r.recordId);
  uint(r.revision, true);
  sourceBinding(r.sourceBinding);
  scope(r.scope);
  history(r.targetHistory);
  const a = account(r.account),
    o = closed(r.ownerBinding, [
      'historicalTitleHolderId',
      'historicalRiskBearerId',
      'currentAuthorityHolderId',
      'authorityRecordRef',
      'authorityRecordFingerprint',
    ]);
  legalEntityId(ref(o.historicalTitleHolderId));
  legalEntityId(ref(o.historicalRiskBearerId));
  legalEntityId(ref(o.currentAuthorityHolderId));
  ref(o.authorityRecordRef);
  fp(o.authorityRecordFingerprint);
  if (
    o.historicalTitleHolderId !== a.titleHolderId ||
    o.historicalRiskBearerId !== a.riskBearerId
  )
    invalid('Historical owner/risk does not equal original tuple');
  const effect = closed(r.effectivity, ['from', 'until']),
    from = frontier(effect.from),
    until = effect.until === null ? null : frontier(effect.until),
    revoked = r.revokedAt === null ? null : frontier(r.revokedAt);
  if (until && compare(from, until) >= 0) invalid('Invalid effective interval');
  if (revoked) compare(from, revoked);
  if (until && revoked) compare(until, revoked);
  sourceUnits(r.sourceUnits);
  return freeze({
    kind: 'UNTRUSTED_GOVERNING_RECORD_DATA',
    record: value as GoverningRecord,
  });
}
function parseOwnedRecord(
  bytes: Uint8Array,
  expected: string,
): Readonly<UntrustedIndustryGoverningRecordData> {
  try {
    return validateOwnedRecord(bytes, expected);
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID
    )
      throw error;
    invalid('Malformed governing record data');
  }
}
/** Returns untrusted owned data only, not a disclosure or installed source. */
export function parseIndustryGoverningRecordData(
  bytes: Uint8Array,
  expectedRawSHA256: string,
): Readonly<UntrustedIndustryGoverningRecordData> {
  return parseOwnedRecord(byteCopy(bytes), expectedRawSHA256);
}

interface Witness {
  readonly publicationHead: DecisionResultHead;
  readonly targetCutoff: DecisionResultHead;
  readonly targetHistory: History;
  readonly accounts: readonly Readonly<InventoryAccount>[];
}
function requestData(v: unknown): Readonly<IndustryGoverningSnapshotRequest> {
  const r = closed(v, [
    'publicationHead',
    'worldBinding',
    'scope',
    'purpose',
    'targetHistory',
  ]);
  if (r.purpose !== PURPOSE) invalid('Request purpose differs');
  const h = head(r.publicationHead),
    s = scope(r.scope);
  if (h.worldId !== s.worldId) invalid('Request scope World differs');
  return own({
    publicationHead: h,
    worldBinding: worldBinding(r.worldBinding),
    scope: s,
    purpose: PURPOSE,
    targetHistory: history(r.targetHistory),
  });
}
function witnessData(
  v: unknown,
  request: IndustryGoverningSnapshotRequest,
): Witness {
  const r = closed(v, [
      'publicationHead',
      'targetCutoff',
      'targetHistory',
      'accounts',
    ]),
    h = head(r.publicationHead),
    t = head(r.targetCutoff),
    cause = history(r.targetHistory),
    accounts = array(r.accounts, 1).map(account);
  equal(h, request.publicationHead, 'Witness head differs');
  equal(cause, request.targetHistory, 'Witness target differs');
  if (
    t.worldId !== h.worldId ||
    compare(t, h) > 0 ||
    accounts.some((a) => a.worldId !== h.worldId)
  )
    invalid('Target/account outside held World/frontier');
  return own({
    publicationHead: h,
    targetCutoff: t,
    targetHistory: cause,
    accounts,
  });
}
/** Shared by real accessor and gated inert mechanism seam; no alternate validator. */
function evaluate(
  request: IndustryGoverningSnapshotRequest,
  witness: Witness,
  snapshot: unknown,
): IndustryProductionGoverningResult {
  const s = closed(snapshot, [
    'schemaVersion',
    'publicationHead',
    'worldBinding',
    'sourceAuthority',
    'manifest',
    'records',
  ]);
  if (s.schemaVersion !== SNAPSHOT_SCHEMA)
    invalid('Unknown custodied snapshot schema');
  equal(head(s.publicationHead), request.publicationHead, 'Custody H differs');
  equal(
    worldBinding(s.worldBinding),
    request.worldBinding,
    'Custody seed/model/replay differs',
  );
  const authority = closed(s.sourceAuthority, [
    'issuerId',
    'custodianId',
    ...SOURCE_KEYS,
  ]);
  ref(authority.issuerId);
  ref(authority.custodianId);
  const binding = sourceBinding(
    Object.fromEntries(SOURCE_KEYS.map((k) => [k, authority[k]])),
  );
  const manifest = closed(s.manifest, [
    'manifestId',
    'revision',
    'contentFingerprint',
    'scope',
    'purpose',
    'targetHistory',
    'entries',
  ]);
  ref(manifest.manifestId);
  uint(manifest.revision, true);
  fp(manifest.contentFingerprint);
  if (manifest.purpose !== PURPOSE) invalid('Manifest purpose differs');
  equal(scope(manifest.scope), request.scope, 'Manifest scope differs');
  equal(
    history(manifest.targetHistory),
    request.targetHistory,
    'Manifest target differs',
  );
  // Copy each view before examining any subsequent externally supplied row.
  let total = 0;
  const records = array(s.records, 1).map((v) => {
    const row = closed(v, ['recordId', 'revision', 'bytes']),
      bytes = byteCopy(row.bytes);
    total += bytes.length;
    if (total > BYTE_LIMIT)
      invalid('Total original record bytes exceed capacity');
    return {
      recordId: ref(row.recordId),
      revision: uint(row.revision, true),
      bytes,
    };
  });
  const rows = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    if (rows.has(r.recordId)) invalid('Duplicate raw record ID');
    rows.set(r.recordId, r);
  }
  const entries = array(manifest.entries, 1);
  if (entries.length !== rows.size)
    invalid('Complete current manifest/record set differs');
  const allowed = new Map<string, Readonly<GoverningRecord>>(),
    seen = new Set<string>();
  let effective = true;
  for (const value of entries) {
    const entry = closed(value, [
        'recordId',
        'revision',
        'rawByteLength',
        'rawSHA256',
        'currentAuthorityHolderId',
        'authorityRecordRef',
        'authorityRecordFingerprint',
      ]),
      id = ref(entry.recordId),
      revision = uint(entry.revision, true);
    if (seen.has(id)) invalid('Duplicate current manifest record');
    seen.add(id);
    legalEntityId(ref(entry.currentAuthorityHolderId));
    ref(entry.authorityRecordRef);
    fp(entry.authorityRecordFingerprint);
    const row = rows.get(id);
    if (
      !row ||
      row.revision !== revision ||
      uint(entry.rawByteLength, true) !== String(row.bytes.length)
    )
      invalid('Missing/stale original record');
    const record = parseOwnedRecord(row.bytes, rawSha(entry.rawSHA256)).record;
    if (record.recordId !== id || record.revision !== revision)
      invalid('Record identity differs');
    equal(
      record.sourceBinding,
      binding,
      'Original source/adoption/admission differs',
    );
    equal(record.scope, request.scope, 'Record scope differs');
    equal(
      record.targetHistory,
      request.targetHistory,
      'Record target/history differs',
    );
    for (const key of [
      'currentAuthorityHolderId',
      'authorityRecordRef',
      'authorityRecordFingerprint',
    ] as const)
      if (record.ownerBinding[key] !== entry[key])
        invalid('Current authority/history record differs');
    const h = request.publicationHead,
      from = record.effectivity.from,
      until = record.effectivity.until,
      revoked = record.revokedAt;
    // Validate every frontier even if an earlier bound already denies use.
    const startsAfterHead = compare(from, h) > 0;
    const endsAtOrBeforeHead = until !== null && compare(h, until) >= 0;
    const revokedAtOrBeforeHead = revoked !== null && compare(h, revoked) >= 0;
    if (startsAfterHead || endsAtOrBeforeHead || revokedAtOrBeforeHead)
      effective = false;
    const tuple = canonicalSerialize(record.account);
    if (allowed.has(tuple)) invalid('Ambiguous account/history mapping');
    allowed.set(tuple, record);
  }
  const required = new Set(witness.accounts.map((a) => canonicalSerialize(a)));
  if (
    !effective ||
    allowed.size !== required.size ||
    [...required].some((k) => !allowed.has(k))
  )
    return denied('OWNER_MAPPING_UNAVAILABLE');
  // Coverage/authenticity of these exact normative refs is the REAL custody
  // adapter's independently verified adoption responsibility, not a label rule.
  const units = [
    ...new Set([...allowed.values()].flatMap((r) => r.sourceUnits)),
  ].sort();
  return freeze({
    disclosure: { status: 'AUTHORIZED', sourceUnits: units },
    resultSummary: {
      status: 'AUTHORIZED_RESULT_ONLY',
      purpose: PURPOSE,
      sourceHead: request.publicationHead,
      causeBinding: {
        commandId: request.targetHistory.commandId,
        commandFingerprint: request.targetHistory.commandFingerprint,
        eventId: request.targetHistory.eventId,
        eventFingerprint: request.targetHistory.eventFingerprint,
      },
    },
  } as const);
}

/** Real genuine-view entry. No caller-supplied posting/source-output argument. */
export async function readIndustryProductionGoverningFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  selectors: IndustryProductionSelectors,
  requestedScope: EconomicReadScope,
  custody: IndustryGoverningCustodyPort,
): Promise<IndustryProductionGoverningResult> {
  const data = readValidatedCanonicalLineageFrom(executor, view);
  canonicalSerialize(selectors);
  canonicalSerialize(requestedScope);
  const scopeRow = closed(requestedScope, [
    'worldId',
    'countryId',
    'classification',
    'officeId',
  ]);
  worldId(ref(scopeRow.worldId));
  countryId(ref(scopeRow.countryId));
  if (
    typeof scopeRow.classification !== 'string' ||
    !['OFFICE_PRIVATE', 'COUNTRY'].includes(scopeRow.classification) ||
    (scopeRow.officeId !== null && typeof scopeRow.officeId !== 'string')
  )
    invalid('Malformed requested scope');
  const held = {
    worldId: data.worldId,
    worldVersion: data.headWorldVersion,
    eventSequence: data.headEventSequence,
  };
  const check = () => {
    const current = readValidatedCanonicalLineageFrom(executor, view);
    if (current !== data) invalid('Lineage view changed');
  };
  if (
    requestedScope.worldId !== held.worldId ||
    requestedScope.countryId !== selectors.countryId ||
    requestedScope.classification !== 'OFFICE_PRIVATE' ||
    requestedScope.officeId !== 'INDUSTRY'
  )
    return denied('SCOPE_NOT_AUTHORIZED');
  const selected = readIndustryProductionSourceFrom(
    executor,
    view,
    selectors,
    digest,
  );
  check();
  if (selected.kind === 'SOURCE_UNAVAILABLE')
    return denied('ADMITTED_SOURCE_UNAVAILABLE');
  const targetHistory = {
    commandId: selected.targetCommand.commandId,
    commandFingerprint: selected.targetCommand.fingerprint,
    eventId: selected.targetEvent.eventId,
    eventFingerprint: selected.targetEvent.fingerprint,
    postingId: selected.constructorValidatedProductionPosting.postingId,
    postingFingerprint:
      selected.constructorValidatedProductionPosting.fingerprint,
  };
  const request = requestData({
    publicationHead: held,
    worldBinding: {
      seedId: data.seed.seedId,
      seedFingerprint: data.seed.fingerprint,
      modelVersion: data.seed.replayBinding.modelVersion,
      replayBindingFingerprint: hash(data.seed.replayBinding),
    },
    scope: requestedScope,
    purpose: PURPOSE,
    targetHistory,
  });
  const witness = witnessData(
    {
      publicationHead: selected.publicationHead,
      targetCutoff: selected.immutableSourceWitnesses.targetCutoff,
      targetHistory,
      accounts: selected.immutableSourceWitnesses.inventoryAccountWitnesses,
    },
    request,
  );
  let active = true,
    calls = 0,
    completed = false;
  let evaluated: IndustryProductionGoverningResult | undefined;
  try {
    check();
    const result = await custody.withSnapshotFrom(
      executor,
      request,
      async (snapshot) => {
        if (!active || ++calls !== 1)
          invalid('Custody callback count/lifetime differs');
        check();
        const candidate = evaluate(request, witness, snapshot);
        await Promise.resolve();
        check();
        if (!active) invalid('Custody callback escaped');
        completed = true;
        evaluated = candidate;
        return candidate;
      },
    );
    check();
    if (calls !== 1 || !completed || result !== evaluated)
      invalid('Custody must await exactly one callback and return its result');
    return result;
  } finally {
    active = false;
  }
}

/** Inert mechanism only; cannot issue/replace a genuine view or custody handle. */
export function evaluateIndustryGoverningForTestOnly(input: unknown): Readonly<{
  kind: 'EVALUATED_TEST_ONLY';
  sourceAdmitted: false;
  productionAuthority: false;
  result: IndustryProductionGoverningResult;
}> {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.VITEST !== 'true' ||
    !['local', 'ci'].includes(process.env.ECONMIND_ENV ?? '')
  )
    throw new Error('INDUSTRY_GOVERNING_TEST_RUNTIME_REQUIRED');
  const r = closed(input, ['request', 'witness', 'snapshot']),
    request = requestData(r.request),
    witness = witnessData(r.witness, request);
  return freeze({
    kind: 'EVALUATED_TEST_ONLY',
    sourceAdmitted: false,
    productionAuthority: false,
    result: evaluate(request, witness, r.snapshot),
  } as const);
}
