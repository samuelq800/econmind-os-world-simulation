/** Server Social source resolution/replay. No source issuer, registry, host or writes. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createReplayOrigin,
  createReplayReducerRegistry,
  createReplaySeed,
  createSocialEmploymentServiceReplayReducers,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_POSITION_OFFER_CREATED_EVENT,
  parseCanonicalCommand,
  parseIndustryPersistenceSchemaBoundaryContext,
  PRODUCTION_CONSUMPTION_SCHEMA_VERSION,
  PRODUCTION_SETTLED_EVENT_TYPE,
  productionConsumptionEventPayload,
  parseSocialEmploymentServiceCommand,
  prepareSocialEmploymentServiceOperation,
  replayAuthoritativeEvents,
  validateSocialEmploymentServiceState,
  validateCanonicalCommand,
  type CanonicalCommand,
  type CanonicalSha256,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
  type Sha256Hex,
  type IndustryPersistenceSchemaReadContextV1,
} from '@econmind/core';
import {
  parseGoverningSourceReadBinding,
  assertGoverningSourceCommitRequestConsistent,
  calculateGoverningSourceCommitBindingFingerprints,
  type GoverningSourceReadBindingV1,
  type SourceCommitProtectionPort,
} from '../projections/governing-source-commit-boundary-contract.js';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  SOCIAL_SOURCE_ROLES,
  bindSocialEmploymentSourceInputFrom,
  parseSocialEmploymentSourceInput,
  type BoundSocialSourceData,
  type SocialOperatingCustodyPort,
  type SocialOperatingSnapshotRequest,
  type SocialSourceRole,
} from './social-employment-source-input.js';
import { assertSocialPhysicalAttemptEnvelope } from './social-physical-attempt-envelope.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import { createPostgresSocialOperatingLineageExecutor } from './postgres-social-operating-custody.js';
import {
  replayPostwarSocialEmploymentLineage,
  assertSocialPositionOfferEventOriginal,
} from './postwar-social-employment-lineage.js';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import {
  readValidatedCanonicalLineageFrom,
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { SocialEmploymentRuntimeSnapshotReader } from './social-job-match-candidate-source.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { IndustryProductionHistoricalReadGuard } from './industry-production-source-cutoff.js';

type Row = Readonly<Record<string, unknown>>;
const PURPOSE = 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1' as const;
const TAXONOMY = 'SOCIAL_SOURCE_EFFECTS_V1' as const;
const MAX_BYTES = 8_388_608;
const MAX_RECORDS = 10_000;
const digest = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), digest);
const NO_DIRECT_SOCIAL_WRITE = Object.freeze([
  'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1',
  'CENTRAL_BANK_OMO_SETTLED_V1',
  'NARROW_TREASURY_GCU_RESERVED_V1',
  'NARROW_TREASURY_GCU_SHIPPED_V1',
  'NARROW_TREASURY_GCU_DELIVERED_V1',
]);
interface CapturedRecordBytes {
  readonly recordId: string;
  readonly revision: string;
  readonly bytes: Uint8Array;
}
interface CapturedSnapshot {
  readonly publicationHead: Row;
  readonly worldBinding: Row;
  readonly sourceAuthority: Row;
  readonly manifest: Row;
  readonly graphBytes: string;
  readonly records: readonly CapturedRecordBytes[];
}
interface OriginalRecord {
  readonly recordId: string;
  readonly revision: string;
  readonly role: SocialSourceRole;
  readonly value: unknown;
  readonly parsed: Row;
  readonly rawSHA256: string;
  readonly rawPayloadHash: CanonicalSha256;
  readonly fieldPaths: readonly string[];
}
interface VerifiedOriginalData {
  readonly bound: BoundSocialSourceData;
  readonly snapshot: CapturedSnapshot;
  readonly originals: readonly OriginalRecord[];
  readonly materialBindings: readonly Row[];
  readonly originalBodyBindings: readonly Row[];
}
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Social source reader: ${reason}`,
  );
}
class SourceNotSupplied extends Error {}
function missing(reason: string): never {
  throw new SourceNotSupplied(reason);
}
function row(value: unknown, expected: readonly string[]): Row {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid('plain own record required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
    Object.keys(descriptors).sort().join('|') !==
      [...expected].sort().join('|') ||
    Object.values(descriptors).some(
      (d) => !Object.hasOwn(d, 'value') || !d.enumerable,
    )
  )
    invalid('missing/unknown/accessor fields');
  return value as Row;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > MAX_BYTES)
    invalid('explicit text required');
  return value;
}
function ref(value: unknown): string {
  const v = text(value);
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(v))
    invalid('stable reference required');
  return v;
}
function integer(value: unknown, positive = false): string {
  const v = text(value);
  if (
    !(positive ? /^[1-9]\d{0,18}$/u : /^(?:0|[1-9]\d{0,18})$/u).test(v) ||
    BigInt(v) > 9_223_372_036_854_775_807n
  )
    invalid('bounded canonical integer required');
  return v;
}
function fp(value: unknown): CanonicalSha256 {
  const v = text(value);
  if (!/^sha256:[0-9a-f]{64}$/u.test(v))
    invalid('canonical object fingerprint required');
  return v as CanonicalSha256;
}
function dense(value: unknown, min: number, max: number): readonly unknown[] {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < min ||
    value.length > max
  )
    invalid('bounded dense array required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, i) => i).some((i) => {
      const descriptor = descriptors[String(i)];
      return (
        !descriptor ||
        !Object.hasOwn(descriptor, 'value') ||
        !descriptor.enumerable
      );
    })
  )
    invalid('dense own inert array required');
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
/** Capture own inert metadata without invoking foreign getters/toJSON/iterators. */
function ownJson(value: unknown): unknown {
  const seen = new Set<object>();
  let nodes = 0;
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 1_000_000 || depth > 32)
      invalid('metadata capacity exceeded');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (!v || typeof v !== 'object' || types.isProxy(v) || seen.has(v))
      invalid('non-inert metadata');
    seen.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      const values = dense(v, 0, MAX_RECORDS);
      const descriptors = Object.getOwnPropertyDescriptors(v);
      if (
        Object.keys(descriptors).some(
          (key) =>
            key !== 'length' &&
            (!/^(?:0|[1-9]\d*)$/u.test(key) ||
              !Object.hasOwn(descriptors[key]!, 'value')),
        )
      )
        invalid('array metadata accessor/extra key');
      result = values.map((part) => copy(part, depth + 1));
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype)
        invalid('class metadata');
      const descriptors = Object.getOwnPropertyDescriptors(v);
      if (Reflect.ownKeys(v).some((key) => typeof key !== 'string'))
        invalid('symbol metadata');
      const entries: [string, unknown][] = [];
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (
          key.length > 512 ||
          !Object.hasOwn(descriptor, 'value') ||
          !descriptor.enumerable
        )
          invalid('metadata accessor/key');
        entries.push([key, copy(descriptor.value, depth + 1)]);
      }
      result = Object.fromEntries(entries);
    }
    seen.delete(v);
    return result;
  }
  return freeze(copy(value, 0));
}
function captureSnapshot(value: unknown): CapturedSnapshot | null {
  if (value === null) return null;
  const r = row(value, [
    'schemaVersion',
    'publicationHead',
    'worldBinding',
    'sourceAuthority',
    'manifest',
    'graphBytes',
    'records',
  ]);
  if (r.schemaVersion !== 'social-operating-custodied-snapshot-v1')
    invalid('wrong custody schema');
  // Capture every byte view now, before any later external access/await.
  let byteCount = 0;
  const records = dense(r.records, 1, MAX_RECORDS).map((value) => {
    const record = row(value, ['recordId', 'revision', 'bytes']);
    if (
      types.isProxy(record.bytes) ||
      !(record.bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(record.bytes) !== Uint8Array.prototype
    )
      invalid('owned original bytes required');
    const byteLengthGetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      'byteLength',
    )!.get!;
    const length = byteLengthGetter.call(record.bytes) as number;
    if (Reflect.ownKeys(record.bytes).length !== length)
      invalid('foreign byte accessors/metadata');
    const bytes = new Uint8Array(length);
    Uint8Array.prototype.set.call(bytes, record.bytes);
    byteCount += bytes.byteLength;
    if (byteCount > MAX_BYTES)
      invalid('original record byte capacity exceeded');
    return Object.freeze({
      recordId: ref(record.recordId),
      revision: integer(record.revision, true),
      bytes,
    });
  });
  const graphBytes = text(r.graphBytes);
  if (Buffer.byteLength(graphBytes, 'utf8') > MAX_BYTES)
    invalid('graph byte capacity exceeded');
  return Object.freeze({
    publicationHead: ownJson(r.publicationHead) as Row,
    worldBinding: ownJson(r.worldBinding) as Row,
    sourceAuthority: ownJson(r.sourceAuthority) as Row,
    manifest: ownJson(r.manifest) as Row,
    graphBytes,
    records: Object.freeze(records),
  });
}
function parseOriginal(bytes: Uint8Array): Row {
  let decoded: unknown;
  let rendered: string;
  try {
    rendered = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    decoded = JSON.parse(rendered) as unknown;
  } catch {
    invalid('invalid original UTF8/JSON');
  }
  const owned = ownJson(decoded);
  if (canonicalSerialize(owned) !== rendered)
    invalid('noncanonical original bytes');
  return row(owned, [
    'schemaVersion',
    'recordId',
    'revision',
    'role',
    'sourceBinding',
    'worldId',
    'fieldPaths',
    'semanticRevision',
    'value',
    'effectivity',
    'predecessorRevision',
    'supersededByRevision',
    'revokedAt',
    'sourceUnits',
    'originProof',
  ]);
}
function atPointer(value: unknown, pointer: unknown): unknown {
  const p = text(pointer);
  if (
    Buffer.byteLength(p, 'utf8') > 512 ||
    !p.startsWith('/') ||
    /~(?![01])/u.test(p)
  )
    invalid('invalid original pointer');
  let current = value;
  for (const encoded of p.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key))
      invalid('original pointer absent');
    if (Array.isArray(current) && !/^(?:0|[1-9]\d*)$/u.test(key))
      invalid('noncanonical array pointer');
    current = (current as Row)[key];
  }
  return current;
}
function assertOriginalOrigin(
  bound: BoundSocialSourceData,
  original: Row,
): void {
  const proof = original.originProof as Row;
  if (!proof || typeof proof !== 'object')
    invalid('original origin proof required');
  if (proof.kind === 'COMMITTED_EVENT_PAYLOAD') {
    const p = row(proof, ['kind', 'eventId', 'pointer', 'payloadHash']);
    if (
      original.role !== 'CURRENT_EFFECTIVE' ||
      canonicalSerialize(original.fieldPaths) !==
        canonicalSerialize(['/currentReadFacts/offer'])
    )
      invalid(
        'only the registered canonical offer event can supply current offer facts',
      );
    const event = assertSocialPositionOfferEventOriginal({
      lineage: bound.lineage,
      eventId: ref(p.eventId),
      payloadHash: fp(p.payloadHash),
      pointer: text(p.pointer),
      value: original.value,
      countryId: bound.command.countryId!,
    });
    const effective = original.effectivity as Row;
    if (
      canonicalSerialize(effective.fromHead) !==
        canonicalSerialize({
          worldVersion: event.worldVersion,
          eventSequence: event.sequence,
        }) ||
      effective.fromSimTime !== event.simTime.toCanonicalValue()
    )
      invalid(
        'committed offer effectivity precedes or differs from its real publication',
      );
    return;
  }
  const p = row(proof, ['kind', 'sourceId', 'pointer', 'payloadHash']);
  if (p.kind !== 'ADMITTED_OPENING_SOURCE')
    invalid('unsupported source origin');
  const sources = bound.lineage.seed.sources.filter(
    (source) => source.sourceId === p.sourceId,
  );
  if (sources.length !== 1 || sources[0]!.payloadHash !== fp(p.payloadHash))
    invalid('actual opening original identity mismatch');
  const value = atPointer(
    JSON.parse(sources[0]!.canonicalPayload) as unknown,
    p.pointer,
  );
  if (canonicalSerialize(value) !== canonicalSerialize(original.value))
    invalid('original value differs from actual publication');
}
function compareHead(a: Row, b: Row): number {
  const w = BigInt(integer(a.worldVersion)) - BigInt(integer(b.worldVersion));
  const e = BigInt(integer(a.eventSequence)) - BigInt(integer(b.eventSequence));
  if ((w < 0n && e > 0n) || (w > 0n && e < 0n))
    invalid('incomparable source frontier');
  return w < 0n || e < 0n ? -1 : w > 0n || e > 0n ? 1 : 0;
}
function head(value: unknown): Row {
  const parsed = row(value, ['worldVersion', 'eventSequence']);
  integer(parsed.worldVersion);
  integer(parsed.eventSequence);
  return parsed;
}
function activeAt(original: Row, bound: BoundSocialSourceData): boolean {
  const effective = row(original.effectivity, [
    'fromSimTime',
    'untilSimTime',
    'fromHead',
    'untilHead',
  ]);
  const current = {
    worldVersion: bound.lineage.headWorldVersion,
    eventSequence: bound.lineage.headEventSequence,
  };
  const from = text(effective.fromSimTime),
    until = effective.untilSimTime;
  if (
    !/^(?:0|[1-9]\d{0,119})$/u.test(from) ||
    (until !== null &&
      (!/^(?:0|[1-9]\d{0,119})$/u.test(text(until)) ||
        BigInt(text(until)) <= BigInt(from)))
  )
    invalid('invalid original SimTime interval');
  const fromHead = head(effective.fromHead);
  if (
    effective.untilHead !== null &&
    compareHead(head(effective.untilHead), fromHead) <= 0
  )
    invalid('empty original frontier range');
  return (
    BigInt(bound.data.scope.simTime) >= BigInt(from) &&
    (until === null ||
      BigInt(bound.data.scope.simTime) < BigInt(text(until))) &&
    compareHead(current, fromHead) >= 0 &&
    (effective.untilHead === null ||
      compareHead(current, head(effective.untilHead)) < 0)
  );
}
function isRevoked(original: Row, bound: BoundSocialSourceData): boolean {
  return (
    original.revokedAt !== null &&
    compareHead(
      {
        worldVersion: bound.lineage.headWorldVersion,
        eventSequence: bound.lineage.headEventSequence,
      },
      head(original.revokedAt),
    ) >= 0
  );
}
function immutableBody(envelope: unknown): Row {
  // The exact D body projection, not another time/recipe calculation.
  const r = envelope as Row;
  return Object.fromEntries(
    Object.entries(r).filter(
      ([key]) => key !== 'headWorldVersion' && key !== 'headEventSequence',
    ),
  );
}
function groupRef(body: Row): string {
  return `SOCIAL_DAY_GROUP_${digest(canonicalHashInput({ worldId: body.worldId, countryId: body.countryId, locationId: body.locationId, dayIndex: body.dayIndex }))}`;
}
/** Current selection is based on the complete real predecessor set, not on an
 * old immutable row predicting its future successor or a larger number alone. */
function currentOriginals(
  originals: readonly OriginalRecord[],
  bound: BoundSocialSourceData,
): readonly OriginalRecord[] {
  // Once a real successor has started, expiry/revocation cannot revive its
  // predecessor. A genuinely future successor does not yet displace it.
  const started = originals.filter((r) => {
    activeAt(r.parsed, bound);
    const effective = r.parsed.effectivity as Row;
    return (
      BigInt(bound.data.scope.simTime) >= BigInt(text(effective.fromSimTime)) &&
      compareHead(
        {
          worldVersion: bound.lineage.headWorldVersion,
          eventSequence: bound.lineage.headEventSequence,
        },
        head(effective.fromHead),
      ) >= 0
    );
  });
  const byIdentity = new Map(
    originals.map((r) => [`${r.recordId}|${r.revision}`, r]),
  );
  function descends(after: OriginalRecord, before: OriginalRecord): boolean {
    let parent = after.parsed.predecessorRevision;
    while (parent !== null) {
      if (parent === before.revision) return true;
      const record = byIdentity.get(`${after.recordId}|${text(parent)}`);
      if (!record) invalid('predecessor is absent');
      parent = record.parsed.predecessorRevision;
    }
    return false;
  }
  return started.filter(
    (r) =>
      !started.some(
        (after) =>
          after.recordId === r.recordId &&
          BigInt(after.revision) > BigInt(r.revision) &&
          descends(after, r),
      ),
  );
}

/** Reader-private original comparison. It can only be called after owned capture
 * inside the actual mandatory custody callback, with an active genuine view. */
function validateCapturedSocialOriginalsFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  bound: BoundSocialSourceData,
  snapshot: CapturedSnapshot,
): VerifiedOriginalData {
  const data = readValidatedCanonicalLineageFrom(executor, view);
  if (data !== bound.lineage) invalid('different active lineage');
  if (
    canonicalSerialize(snapshot.publicationHead) !==
      canonicalSerialize({
        worldId: data.worldId,
        worldVersion: data.headWorldVersion,
        eventSequence: data.headEventSequence,
      }) ||
    canonicalSerialize(snapshot.worldBinding) !==
      canonicalSerialize({
        seedId: data.seed.seedId,
        seedFingerprint: data.seed.fingerprint,
        modelVersion: data.seed.replayBinding.modelVersion,
        replayBindingFingerprint: hash(data.seed.replayBinding),
      })
  )
    invalid('custodied head/World binding mismatch');
  const authority = row(snapshot.sourceAuthority, [
    'issuerId',
    'custodianId',
    'sourceId',
    'sourceRevision',
    'sourceFingerprint',
    'ownerAdoptionRef',
    'ownerAdoptionFingerprint',
    'admissionRef',
    'admissionRevision',
  ]);
  for (const key of [
    'issuerId',
    'custodianId',
    'sourceId',
    'ownerAdoptionRef',
    'admissionRef',
  ])
    ref(authority[key]);
  fp(authority.sourceFingerprint);
  fp(authority.ownerAdoptionFingerprint);
  integer(authority.admissionRevision, true);
  if (
    authority.sourceId !== bound.data.admittedGenesis.socialSourceId ||
    authority.sourceFingerprint !==
      bound.data.admittedGenesis.socialSourcePayloadHash ||
    authority.ownerAdoptionRef !== bound.data.admittedGenesis.adoptionBindingRef
  )
    invalid('independent authority/genesis correspondence mismatch');
  const manifest = row(snapshot.manifest, [
    'manifestId',
    'revision',
    'contentFingerprint',
    'purpose',
    'publicationHead',
    'commandBinding',
    'entries',
  ]);
  ref(manifest.manifestId);
  integer(manifest.revision, true);
  fp(manifest.contentFingerprint);
  const parsed = parseSocialEmploymentServiceCommand(bound.command, digest);
  if (parsed.kind !== 'PLAN') invalid('PLAN source purpose only');
  const commandBinding = {
    commandId: bound.command.commandId,
    commandFingerprint: bound.command.fingerprint,
    countryId: bound.command.countryId,
    locationId: parsed.intent.locationId,
    skill: parsed.intent.skill,
    positionId: parsed.intent.positionId,
    servicePoolId: parsed.intent.servicePoolId,
    dueDayIndex: parsed.intent.dueDayIndex,
    simTime: bound.command.simTime.toCanonicalValue(),
  };
  if (
    manifest.purpose !== PURPOSE ||
    canonicalSerialize(manifest.publicationHead) !==
      canonicalSerialize(snapshot.publicationHead) ||
    canonicalSerialize(manifest.commandBinding) !==
      canonicalSerialize(commandBinding)
  )
    invalid('manifest purpose/command mismatch');
  const { contentFingerprint: _content, ...manifestContent } = manifest;
  void _content;
  if (
    hash({
      schemaVersion: 'SOCIAL_OPERATING_ORIGINAL_MANIFEST_CONTENT_V1',
      ...manifestContent,
    }) !== manifest.contentFingerprint
  )
    invalid('complete original manifest fingerprint mismatch');
  const bytesByKey = new Map<string, CapturedRecordBytes>();
  for (const r of snapshot.records) {
    const key = `${r.recordId}|${r.revision}`;
    if (bytesByKey.has(key)) invalid('duplicate original bytes');
    bytesByKey.set(key, r);
  }
  const originals: OriginalRecord[] = [];
  let previous: { id: string; revision: bigint } | undefined;
  for (const value of dense(manifest.entries, 1, MAX_RECORDS)) {
    const entry = row(value, [
      'recordId',
      'revision',
      'rawByteLength',
      'rawSHA256',
      'role',
      'fieldPaths',
    ]);
    const id = ref(entry.recordId),
      revision = integer(entry.revision, true),
      key = `${id}|${revision}`;
    if (
      previous &&
      (id < previous.id ||
        (id === previous.id && BigInt(revision) <= previous.revision))
    )
      invalid('manifest must retain unique ordered versions');
    previous = { id, revision: BigInt(revision) };
    const r = bytesByKey.get(key);
    if (
      !r ||
      integer(entry.rawByteLength) !== String(r.bytes.byteLength) ||
      !/^[0-9a-f]{64}$/u.test(text(entry.rawSHA256)) ||
      digest(new TextDecoder('utf-8', { fatal: true }).decode(r.bytes)) !==
        entry.rawSHA256
    )
      invalid('manifest/original byte length/hash/set mismatch');
    bytesByKey.delete(key);
    const original = parseOriginal(r.bytes);
    const paths = dense(original.fieldPaths, 1, 64).map(text);
    if (
      paths.some(
        (path, i) =>
          !path.startsWith('/') ||
          Buffer.byteLength(path, 'utf8') > 512 ||
          (i > 0 && path <= paths[i - 1]!),
      )
    )
      invalid('original paths must be canonical unique ordered');
    if (
      original.schemaVersion !== 'social-operating-source-record-v1' ||
      original.recordId !== id ||
      original.revision !== revision ||
      original.worldId !== data.worldId ||
      original.role !== entry.role ||
      !(SOCIAL_SOURCE_ROLES as readonly unknown[]).includes(original.role) ||
      canonicalSerialize(original.fieldPaths) !==
        canonicalSerialize(entry.fieldPaths)
    )
      invalid('original identity/role/path mismatch');
    ref(original.semanticRevision);
    if (
      original.semanticRevision !== bound.data.admittedGenesis.semanticRevision
    )
      invalid('mixed Social semantic revisions');
    if (original.predecessorRevision !== null)
      integer(original.predecessorRevision, true);
    if (original.supersededByRevision !== null)
      integer(original.supersededByRevision, true);
    const sourceBinding = row(original.sourceBinding, [
      'sourceId',
      'sourceRevision',
      'sourceFingerprint',
      'ownerAdoptionRef',
      'ownerAdoptionFingerprint',
      'admissionRef',
      'admissionRevision',
    ]);
    for (const name of Object.keys(sourceBinding))
      if (sourceBinding[name] !== authority[name])
        invalid('original independent authority binding mismatch');
    dense(original.sourceUnits, 1, 64).map(ref);
    if (
      new Set(original.sourceUnits as readonly string[]).size !==
      (original.sourceUnits as readonly string[]).length
    )
      invalid('duplicate normative source units');
    assertOriginalOrigin(bound, original);
    activeAt(original, bound); // Validate all effectivity, even historical/future rows.
    if (original.revokedAt !== null) head(original.revokedAt);
    originals.push(
      Object.freeze({
        recordId: id,
        revision,
        role: original.role as SocialSourceRole,
        value: original.value,
        parsed: original,
        rawSHA256: text(entry.rawSHA256),
        rawPayloadHash: hash(original),
        fieldPaths: Object.freeze(paths),
      }),
    );
  }
  if (bytesByKey.size) invalid('extra original rows outside complete manifest');
  const byIdentity = new Map(
    originals.map((r) => [`${r.recordId}|${r.revision}`, r]),
  );
  const children = new Set<string>();
  const roots = new Set<string>();
  for (const r of originals) {
    const predecessor = r.parsed.predecessorRevision,
      successor = r.parsed.supersededByRevision;
    if (predecessor === null) {
      if (roots.has(r.recordId)) invalid('disconnected source revision roots');
      roots.add(r.recordId);
    }
    if (predecessor !== null) {
      const before = byIdentity.get(`${r.recordId}|${text(predecessor)}`);
      const parentKey = `${r.recordId}|${text(predecessor)}`;
      if (children.has(parentKey)) invalid('forked source revision chain');
      children.add(parentKey);
      if (
        !before ||
        BigInt(before.revision) >= BigInt(r.revision) ||
        (before.parsed.supersededByRevision !== null &&
          before.parsed.supersededByRevision !== r.revision)
      )
        invalid('incomplete/conflicting original predecessor chain');
    }
    if (successor !== null) {
      const after = byIdentity.get(`${r.recordId}|${text(successor)}`);
      if (
        !after ||
        BigInt(after.revision) <= BigInt(r.revision) ||
        after.parsed.predecessorRevision !== r.revision
      )
        invalid('incomplete/conflicting original successor chain');
    }
  }
  const currentRows = currentOriginals(originals, bound);
  const materialBindings: Row[] = [];
  for (const path of SOCIAL_SOURCE_MATERIAL_PATHS) {
    const witness = bound.data.sourceWitnesses.find(
      (w) => w.fieldPath === path,
    )!;
    const candidates = originals.filter(
      (r) =>
        r.role === witness.role &&
        r.fieldPaths.includes(path) &&
        r.parsed.sourceBinding &&
        (r.parsed.sourceBinding as Row).sourceId === witness.sourceId &&
        (r.parsed.sourceBinding as Row).sourceRevision ===
          witness.sourceRevision &&
        r.rawPayloadHash === witness.payloadHash,
    );
    if (candidates.length !== 1)
      invalid('one actual selected original required');
    const r = candidates[0]!;
    if (r.role === 'CURRENT_EFFECTIVE') {
      const current = currentRows.filter(
        (v) => v.role === r.role && v.fieldPaths.includes(path),
      );
      if (
        current.length !== 1 ||
        current[0] !== r ||
        !activeAt(r.parsed, bound) ||
        isRevoked(r.parsed, bound)
      )
        missing('current effective original absent/revoked/ambiguous');
    }
    const effective = r.parsed.effectivity as Row;
    if (
      witness.effectiveFromSimTime !== effective.fromSimTime ||
      witness.effectiveUntilSimTime !== effective.untilSimTime ||
      witness.predecessorRevision !== r.parsed.predecessorRevision ||
      witness.supersededByRevision !== r.parsed.supersededByRevision ||
      witness.revokedByRevision !==
        (r.parsed.revokedAt === null ? null : r.revision) ||
      witness.adoptionOrCommitBindingRef !==
        (r.parsed.sourceBinding as Row).ownerAdoptionRef
    )
      invalid('witness revision/effectivity differs from original');
    const originalValue = atPointer(r.parsed, witness.pointer);
    const graphValue =
      path === '/physicalAttemptEnvelope'
        ? immutableBody(bound.data.physicalAttemptEnvelope)
        : atPointer(bound.data, path);
    if (canonicalSerialize(originalValue) !== canonicalSerialize(graphValue))
      invalid('material graph differs from actual original value');
    materialBindings.push(
      Object.freeze({
        fieldPath: path,
        valueHash: hash(originalValue),
        recordId: r.recordId,
        recordRevision: r.revision,
        pointer: witness.pointer,
      }),
    );
  }
  const originalBodies = originals.filter(
    (r) => r.role === 'PHYSICAL_ORIGINAL_BODY',
  );
  if (!originalBodies.length)
    missing('original immutable physical binding not supplied');
  const bodyBindings: Row[] = [],
    groups = new Map<string, OriginalRecord>(),
    resources = new Set<string>();
  for (const r of originalBodies) {
    const body = r.value as Row;
    if (
      !body ||
      typeof body !== 'object' ||
      Object.hasOwn(body, 'headWorldVersion') ||
      Object.hasOwn(body, 'headEventSequence')
    )
      invalid('physical original must exclude only audit head');
    const group = groupRef(body);
    const prior = groups.get(group);
    if (prior) {
      if (
        prior.recordId !== r.recordId ||
        canonicalSerialize(prior.value) !== canonicalSerialize(body) ||
        canonicalSerialize(prior.parsed.originProof) !==
          canonicalSerialize(r.parsed.originProof)
      )
        invalid('same-day original body replacement/alias');
      // Same original VALUE in a legal later wrapper revision does not reallocate
      // anything. The original binding remains the earliest actual version.
      continue;
    }
    groups.set(group, r);
    const origin = r.parsed.originProof as Row;
    if (origin.kind !== 'ADMITTED_OPENING_SOURCE')
      invalid('original must precede first PLAN under supported origin');
    for (const stage of dense(body.stages, 1, 64)) {
      const resource = text((stage as Row).resourceKey),
        key = `${text(body.worldId)}|${text(body.dayIndex)}|${resource}`;
      if (resources.has(key))
        missing('incomplete overlapping shared resource scope');
      resources.add(key);
    }
    bodyBindings.push(
      Object.freeze({
        groupRef: group,
        bodyHash: hash(body),
        originRecordId: r.recordId,
        originRevision: r.revision,
      }),
    );
  }
  // An opening cannot silently synthesize pre-genesis canonical work.
  if (dense(bound.data.admittedGenesis.state.plans, 0, MAX_RECORDS).length)
    missing(
      'this restriction requires genuine empty-origin and complete committed PLAN history',
    );
  const currentBody = immutableBody(bound.data.physicalAttemptEnvelope),
    selected = groups.get(groupRef(currentBody));
  if (
    !selected ||
    canonicalSerialize(selected.value) !== canonicalSerialize(currentBody)
  )
    invalid('current envelope reprices/rebinds original physical body');
  const eligible = currentRows.filter(
    (v) =>
      v.role === 'CURRENT_ELIGIBILITY' &&
      v.fieldPaths.includes('/physicalAttemptEnvelope') &&
      canonicalSerialize(v.value) === canonicalSerialize(currentBody),
  );
  if (
    eligible.length !== 1 ||
    !activeAt(eligible[0]!.parsed, bound) ||
    isRevoked(eligible[0]!.parsed, bound)
  )
    missing('independent current physical eligibility missing/revoked');
  bodyBindings.sort((a, b) =>
    text(a.groupRef) < text(b.groupRef)
      ? -1
      : text(a.groupRef) === text(b.groupRef)
        ? 0
        : 1,
  );
  readValidatedCanonicalLineageFrom(executor, view);
  return Object.freeze({
    bound,
    snapshot,
    originals: Object.freeze(originals),
    materialBindings: Object.freeze(materialBindings),
    originalBodyBindings: Object.freeze(bodyBindings),
  });
}

/** The generic genuine view validates postings, not every domain Event's meaning.
 * Admit only the exact single-Event correspondence proved by the real constructor.
 * Scan the whole prefix before any reducer runs, including foreign-country events. */
function productionEventIds(lineage: BoundSocialSourceData['lineage']) {
  const ids = new Set(
    lineage.transitions.flatMap(({ transition }) =>
      transition.events
        .filter((event) => event.eventType === PRODUCTION_SETTLED_EVENT_TYPE)
        .map((event) => event.eventId),
    ),
  );
  for (const entry of lineage.transitions) {
    for (const event of entry.transition.events) {
      if (event.correctsEventId !== null && ids.has(event.correctsEventId))
        invalid('unsupported correction of production source event');
      if (event.eventType !== PRODUCTION_SETTLED_EVENT_TYPE) continue;
      if (event.correctsEventId !== null)
        invalid('unsupported production source correction');
      const matches = entry.inventoryPostings.filter(
        (posting) =>
          posting.schemaVersion === PRODUCTION_CONSUMPTION_SCHEMA_VERSION &&
          posting.operation === 'PRODUCE_AND_CONSUME' &&
          canonicalSerialize(
            productionConsumptionEventPayload(posting.evidence),
          ) === event.canonicalPayload,
      );
      if (matches.length !== 1)
        invalid(
          'production event requires exactly one same-transition posting',
        );
    }
  }
  return ids;
}

function replaySocialSource(verified: VerifiedOriginalData): Readonly<{
  state: SocialEmploymentServiceState;
  readFacts: SocialEmploymentReadFacts;
  stateHash: CanonicalSha256;
  readFactsHash: CanonicalSha256;
}> {
  const { data, lineage, command } = verified.bound;
  const hasPositionEvents = lineage.transitions.some((entry) =>
    entry.transition.events.some(
      (event) => event.eventType === SOCIAL_POSITION_OFFER_CREATED_EVENT,
    ),
  );
  if (
    data.historyCoverage.taxonomyRevision !==
    (hasPositionEvents ? 'SOCIAL_SOURCE_EFFECTS_V2' : TAXONOMY)
  )
    invalid('unsupported domain effect taxonomy');
  const productionIds = productionEventIds(lineage);
  const currentLifecycle = hasPositionEvents
    ? (() => {
        const original = readPostwarOperatingGenesisFromSeed(
          lineage.seed,
        ).socialEmployment;
        if (!original)
          invalid(
            'actual admitted full E03 is required for position lifecycle replay',
          );
        return replayPostwarSocialEmploymentLineage({
          document: original,
          lineage,
        });
      })()
    : undefined;
  const reducers = { ...createSocialEmploymentServiceReplayReducers(digest) };
  if (currentLifecycle)
    reducers[SOCIAL_POSITION_OFFER_CREATED_EVENT] = ({ state, event }) => {
      const checkpoint = currentLifecycle.checkpoints.find(
        (c) => c.eventId === event.eventId,
      );
      if (!checkpoint)
        invalid('canonical position event was not strictly replayed');
      if (checkpoint.countryId !== data.scope.countryId) return state;
      if (
        canonicalSerialize(state) !==
        canonicalSerialize(checkpoint.beforeEmployment)
      )
        invalid(
          'local employment differs from full-prefix lifecycle predecessor',
        );
      return checkpoint.afterEmployment;
    };
  reducers[PRODUCTION_SETTLED_EVENT_TYPE] = ({ state, event }) => {
    if (!productionIds.has(event.eventId))
      invalid('unpaired production source event');
    // Only this domain's local state is unchanged. All ledger/resource facts and
    // all sibling Events remain in the genuine prefix and normal replay.
    return state;
  };
  const planReducer = reducers[SOCIAL_SERVICE_PLAN_EVENT]!;
  reducers[SOCIAL_SERVICE_PLAN_EVENT] = (input) => {
    // Replay operands remain historical. Check each committed PLAN against its
    // retained original body, never against today's eligibility or recipe.
    const payload = input.event.payload as Row;
    const historical = parseCanonicalCommand(payload.command, digest);
    const parsed = parseSocialEmploymentServiceCommand(historical, digest);
    if (parsed.kind !== 'PLAN') invalid('historical PLAN required');
    const bodies = verified.originalBodyBindings
      .map((binding) =>
        verified.originals.find(
          (r) =>
            r.recordId === binding.originRecordId &&
            r.revision === binding.originRevision,
        )!,
      )
      .filter((r) => {
        const body = r.value as Row;
        return (
          body.worldId === historical.worldId &&
          body.countryId === historical.countryId &&
          body.locationId === parsed.intent.locationId &&
          body.dayIndex === parsed.intent.dueDayIndex
        );
      });
    if (bodies.length !== 1)
      missing('historical PLAN original day/group missing/ambiguous');
    assertSocialPhysicalAttemptEnvelope({
      command: historical,
      state: input.state as SocialEmploymentServiceState,
      readFacts: payload.readFacts as SocialEmploymentReadFacts,
      sourceEnvelope: {
        ...(bodies[0]!.value as Row),
        headWorldVersion: input.event.worldVersionBefore,
        headEventSequence: (BigInt(input.event.sequence) - 1n).toString(),
      },
      sha256Hex: digest,
    });
    return planReducer(input);
  };
  for (const eventType of NO_DIRECT_SOCIAL_WRITE)
    reducers[eventType] = ({ state, event }) => {
      if (event.correctsEventId !== null)
        invalid('unsupported source correction');
      return state;
    };
  const seed = createReplaySeed(
    {
      openingSeedFingerprint: lineage.seed.fingerprint,
      socialSourcePayloadHash: data.admittedGenesis.socialSourcePayloadHash,
      semanticRevision: data.admittedGenesis.semanticRevision,
    },
    digest,
  );
  const binding = lineage.seed.replayBinding;
  const replay = replayAuthoritativeEvents({
    origin: createReplayOrigin({
      worldId: lineage.seed.worldId,
      lastSequence: '0',
      worldVersion: '0',
      state: data.admittedGenesis.state,
      seed,
      binding,
      sha256Hex: digest,
    }),
    seed,
    binding,
    registry: createReplayReducerRegistry({ binding, reducers }),
    transitions: lineage.transitions.map((v) => v.transition),
    sha256Hex: digest,
  });
  if (
    replay.worldVersion !== lineage.headWorldVersion ||
    replay.lastSequence !== lineage.headEventSequence
  )
    invalid('full Social replay head mismatch');
  if (currentLifecycle) {
    const current = currentLifecycle.countries.find(
      (c) => c.countryId === data.scope.countryId,
    );
    if (
      !current ||
      canonicalSerialize(replay.state) !==
        canonicalSerialize(current.lifecycle.employment)
    )
      invalid('country replay differs from actual complete lifecycle prefix');
  }
  const readFacts = JSON.parse(
    canonicalSerialize(data.currentReadFacts),
  ) as SocialEmploymentReadFacts;
  const state = validateSocialEmploymentServiceState(
    replay.state as SocialEmploymentServiceState,
    readFacts,
    digest,
  );
  // Every historical pending/settled PLAN must resolve to its original day/group.
  for (const plan of state.plans) {
    const originalCommand = parseCanonicalCommand(
      JSON.parse(plan.canonicalCommand) as unknown,
      digest,
    );
    const parsedPlan = parseSocialEmploymentServiceCommand(
      originalCommand,
      digest,
    );
    if (parsedPlan.kind !== 'PLAN') invalid('historical plan command required');
    const payload = parsedPlan.intent;
    const poolId = payload.servicePoolId,
      dayIndex = payload.dueDayIndex;
    const bodies = verified.originals.filter(
      (r) =>
        r.role === 'PHYSICAL_ORIGINAL_BODY' &&
        (r.value as Row).worldId === state.worldId &&
        (r.value as Row).countryId === originalCommand.countryId &&
        (r.value as Row).locationId === payload.locationId &&
        (r.value as Row).dayIndex === dayIndex &&
        Array.isArray((r.value as Row).pools) &&
        ((r.value as Row).pools as readonly Row[]).some(
          (p) => p.poolId === poolId && p.skill === payload.skill,
        ),
    );
    const groups = new Set(bodies.map((r) => groupRef(r.value as Row)));
    if (groups.size !== 1)
      missing(
        'historical PLAN original complete physical binding missing/ambiguous',
      );
  }
  const assessed = assertSocialPhysicalAttemptEnvelope({
    command,
    state,
    readFacts,
    sourceEnvelope: data.physicalAttemptEnvelope,
    sha256Hex: digest,
  });
  if (
    assessed.immutableBodyHash !==
    hash(immutableBody(data.physicalAttemptEnvelope))
  )
    invalid('D immutable body correspondence differs');
  return freeze({
    state,
    readFacts,
    stateHash: hash(state),
    readFactsHash: hash(readFacts),
  });
}

function snapshotRequest(
  command: CanonicalCommand,
  lineage: BoundSocialSourceData['lineage'],
): Readonly<SocialOperatingSnapshotRequest> {
  const parsed = parseSocialEmploymentServiceCommand(command, digest);
  if (parsed.kind !== 'PLAN' || command.officeId !== 'SOCIAL')
    invalid('manual SOCIAL PLAN only');
  return freeze({
    publicationHead: {
      worldId: lineage.worldId,
      worldVersion: lineage.headWorldVersion,
      eventSequence: lineage.headEventSequence,
    },
    worldBinding: {
      seedId: lineage.seed.seedId,
      seedFingerprint: lineage.seed.fingerprint,
      modelVersion: lineage.seed.replayBinding.modelVersion,
      replayBindingFingerprint: hash(lineage.seed.replayBinding),
    },
    purpose: PURPOSE,
    commandBinding: {
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      countryId: command.countryId,
      locationId: parsed.intent.locationId,
      skill: parsed.intent.skill,
      positionId: parsed.intent.positionId,
      servicePoolId: parsed.intent.servicePoolId,
      dueDayIndex: parsed.intent.dueDayIndex,
      simTime: command.simTime.toCanonicalValue(),
    },
    requiredMaterialPaths: SOCIAL_SOURCE_MATERIAL_PATHS,
  });
}

/** Real owned correspondence data, consumed by C's closed parser once its actual
 * accepted implementation is pinned. This function does not grant authority. */
function governingBindingData(
  verified: VerifiedOriginalData,
  replayed: ReturnType<typeof replaySocialSource>,
): Row {
  const { bound, snapshot } = verified,
    { command, lineage } = bound;
  const authority = snapshot.sourceAuthority,
    manifest = snapshot.manifest;
  const revisions = verified.originals.map((r) => ({
    recordId: r.recordId,
    revision: r.revision,
    payloadHash: r.rawPayloadHash,
    role: r.role,
    fieldPaths: r.fieldPaths,
    revocationRevision: r.parsed.revokedAt === null ? null : r.revision,
  }));
  if (
    canonicalSerialize(revisions) !==
    canonicalSerialize(bound.data.historyCoverage.sourceRevisionSet)
  )
    invalid('graph source revision set differs from complete actual originals');
  return freeze({
    schemaVersion: 'social-plan-governing-source-read-binding-v1',
    purpose: PURPOSE,
    scope: {
      worldId: lineage.worldId,
      countryId: command.countryId,
      officeId: 'SOCIAL',
    },
    commandBinding: {
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      commandType: command.commandType,
      payloadHash: command.payloadHash,
      simTime: command.simTime.toCanonicalValue(),
    },
    readHead: {
      worldVersion: lineage.headWorldVersion,
      eventSequence: lineage.headEventSequence,
    },
    worldBinding: snapshot.worldBinding,
    historyBinding: {
      openingVersion: '0',
      completePrefixFingerprint:
        bound.data.historyCoverage.completePrefixBinding,
      receiptSetFingerprint: hash(lineage.transitions.map((v) => v.receipt)),
      taxonomyRevision: bound.data.historyCoverage.taxonomyRevision,
    },
    sourceAuthorityBinding: {
      issuerId: authority.issuerId,
      custodianId: authority.custodianId,
      ownerAdoptionRef: authority.ownerAdoptionRef,
      ownerAdoptionFingerprint: authority.ownerAdoptionFingerprint,
      admissionRef: authority.admissionRef,
      admissionRevision: authority.admissionRevision,
    },
    sourceManifest: {
      manifestId: manifest.manifestId,
      revision: manifest.revision,
      contentFingerprint: manifest.contentFingerprint,
      entrySetFingerprint: hash(manifest.entries),
    },
    sourceRevisions: revisions,
    materialBindings: verified.materialBindings,
    originalPhysicalBodyBindings: verified.originalBodyBindings,
    stateHash: replayed.stateHash,
    readFactsHash: replayed.readFactsHash,
  });
}

type SnapshotResult = Awaited<
  ReturnType<SocialEmploymentRuntimeSnapshotReader['readFrom']>
>;
interface ResolvedSource {
  readonly snapshot: Extract<SnapshotResult, { status: 'REPLAYED' }>;
  readonly binding: Readonly<GoverningSourceReadBindingV1>;
}
type ReadInput = Parameters<
  SocialEmploymentRuntimeSnapshotReader['readFrom']
>[0];
interface PrivateConstruction {
  readonly issued: WeakMap<object, Readonly<GoverningSourceReadBindingV1>>;
  readonly resolve: (input: ReadInput) => Promise<ResolvedSource>;
}
const constructions = new WeakMap<object, PrivateConstruction>();

export interface SocialEmploymentRuntimeSnapshotReaderConstruction {
  readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  readonly database: SqlDatabase;
  readonly sha256Hex: Sha256Hex;
  /** Fixed PostgreSQL host identity only; source read temporarily delegates to
   * the actual fixed SQL reader and restores this verified writer in the same
   * transaction. No membership or economic permission is granted here. */
  readonly postgresWorkerRole?: string;
  /** Actual trusted server custodian/guard adapter requires independent evidence.
   * No implementation or registration is supplied by this module. */
  readonly custody: SocialOperatingCustodyPort;
  /** Fixed server dependencies only. Historical representation-read does not
   * authorize Social use. The actual initial native plan must already cover all
   * later Social originals, eligibility, predicates and cooperating actors until
   * outer commit/rollback; custody may only recheck that same held protection. */
  readonly industryProtectedRead?: Readonly<{
    historicalReadGuard: IndustryProductionHistoricalReadGuard;
    target: IndustryPersistenceSchemaReadContextV1['target'];
    build: IndustryPersistenceSchemaReadContextV1['build'];
  }>;
}
function auditTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid('canonical observed audit timestamp required');
  return value;
}

/** Concrete existing-lineage/original/replay mechanism. OFFICIAL_RUNTIME is a
 * server-only composition choice, usable only with the separately reviewed real
 * source custodian and cooperating protection adapter. It is never an admission
 * claim by this constructor, a parsed DTO, or the callback's lexical lifetime. */
export function createSocialEmploymentRuntimeSnapshotReader(
  input: SocialEmploymentRuntimeSnapshotReaderConstruction,
): SocialEmploymentRuntimeSnapshotReader {
  if (
    !['OFFICIAL_RUNTIME', 'TEST_ONLY_LOCAL'].includes(input.mode) ||
    !input.custody ||
    typeof input.custody.withSnapshotFrom !== 'function' ||
    typeof input.sha256Hex !== 'function'
  )
    invalid('explicit server mode and actual custody dependency required');
  const probe = canonicalHashInput({ domain: 'SOCIAL_SOURCE_HASH_ADAPTER_V1' });
  if (input.sha256Hex(probe) !== digest(probe))
    invalid('incompatible SHA256 adapter');
  // Subsequent identities use the fixed real SHA256 implementation, never a
  // caller-controlled alternate hash function.
  let historicalReadGuard: IndustryProductionHistoricalReadGuard | undefined;
  let industryProfile:
    | Readonly<{
        target: IndustryPersistenceSchemaReadContextV1['target'];
        build: IndustryPersistenceSchemaReadContextV1['build'];
      }>
    | undefined;
  if (input.industryProtectedRead !== undefined) {
    const binding = row(input.industryProtectedRead, [
      'historicalReadGuard',
      'target',
      'build',
    ]);
    historicalReadGuard = input.industryProtectedRead.historicalReadGuard;
    if (
      !historicalReadGuard ||
      typeof historicalReadGuard.assertReadFrom !== 'function'
    )
      invalid('fixed Industry historical read guard required');
    industryProfile = freeze(
      ownJson({
        target: binding.target,
        build: binding.build,
      }) as NonNullable<typeof industryProfile>,
    );
  }
  const lineageReader = new DurableV08LedgerLineageReader({
    database: input.database,
    sha256Hex: digest,
    ...(historicalReadGuard === undefined
      ? {}
      : { industryReadGuard: historicalReadGuard }),
  });
  const mode = input.mode,
    custody = input.custody,
    withSnapshot = custody.withSnapshotFrom;
  const issued = new WeakMap<object, Readonly<GoverningSourceReadBindingV1>>();
  const resolveUnscoped = async (
    supplied: ReadInput,
  ): Promise<ResolvedSource> => {
    // Capture the validated canonical command before the first await.
    canonicalSerialize(supplied.command);
    const command = validateCanonicalCommand(supplied.command, digest),
      transaction = supplied.transaction;
    const headWorldVersion = integer(supplied.headWorldVersion),
      headEventSequence = integer(supplied.headEventSequence);
    auditTimestamp(supplied.observedAtReal);
    const parsedCommand = parseSocialEmploymentServiceCommand(command, digest);
    if (
      parsedCommand.kind !== 'PLAN' ||
      command.officeId !== 'SOCIAL' ||
      command.expectedWorldVersion !== headWorldVersion
    )
      invalid('exact manual SOCIAL PLAN/read head required');
    // D independently locks/reads the actual H and compares both coordinates
    // before the fixed guard runs; supplied coordinates cannot establish H.
    const industryReadContext =
      industryProfile === undefined
        ? undefined
        : parseIndustryPersistenceSchemaBoundaryContext({
            schemaVersion: 'industry-persistence-schema-read-context-v1',
            purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
            worldId: command.worldId,
            expectedHead: {
              worldVersion: headWorldVersion,
              eventSequence: headEventSequence,
            },
            target: industryProfile.target,
            build: industryProfile.build,
          });
    if (
      industryReadContext !== undefined &&
      industryReadContext.schemaVersion !==
        'industry-persistence-schema-read-context-v1'
    )
      invalid('Industry historical read context required');
    return withValidatedCanonicalLineageFrom(
      {
        reader: lineageReader,
        executor: transaction,
        worldId: command.worldId,
        ...(industryReadContext === undefined ? {} : { industryReadContext }),
      },
      async (view) => {
        const lineage = readValidatedCanonicalLineageFrom(transaction, view);
        if (
          lineage.headWorldVersion !== headWorldVersion ||
          lineage.headEventSequence !== headEventSequence
        )
          invalid('actual current lineage differs from supplied head');
        if (
          lineage.transitions.some((entry) =>
            entry.transition.events.some(
              (event) => event.simTime.ticks > command.simTime.ticks,
            ),
          )
        )
          invalid('command SimTime precedes the actual committed prefix');
        const request = snapshotRequest(command, lineage);
        let open = true,
          calls = 0;
        let resolved: ResolvedSource | undefined;
        try {
          const returned = await withSnapshot.call(
            custody,
            transaction,
            request,
            async (raw) => {
              if (!open || ++calls !== 1)
                invalid('custody callback must be used exactly once in scope');
              readValidatedCanonicalLineageFrom(transaction, view);
              const captured = captureSnapshot(raw);
              if (captured === null)
                missing('actual Social operating source not supplied');
              const parsed = parseSocialEmploymentSourceInput(
                captured.graphBytes,
                hash(JSON.parse(captured.graphBytes) as unknown),
              );
              const bound = bindSocialEmploymentSourceInputFrom(
                transaction,
                view,
                command,
                parsed,
              );
              const verified = validateCapturedSocialOriginalsFrom(
                transaction,
                view,
                bound,
                captured,
              );
              const replayed = replaySocialSource(verified);
              const binding = parseGoverningSourceReadBinding(
                governingBindingData(verified, replayed),
              );
              readValidatedCanonicalLineageFrom(transaction, view);
              resolved = Object.freeze({
                binding,
                snapshot: freeze({
                  status: 'REPLAYED' as const,
                  provenance:
                    mode === 'TEST_ONLY_LOCAL'
                      ? ('TEST_ONLY' as const)
                      : ('ADMITTED_OPENING_AND_EVENTS' as const),
                  openingSeedHash: lineage.seed.fingerprint,
                  worldId: lineage.worldId,
                  headWorldVersion,
                  headEventSequence,
                  ...replayed,
                }),
              });
              return resolved;
            },
          );
          readValidatedCanonicalLineageFrom(transaction, view);
          if (calls !== 1 || resolved === undefined || returned !== resolved)
            invalid(
              'custody did not return its exact completed callback result',
            );
          return resolved;
        } finally {
          open = false;
        }
      },
    );
  };
  const roleScope =
    input.postgresWorkerRole === undefined
      ? undefined
      : createPostwarSocialSourceRoleScope({
          workerRole: input.postgresWorkerRole,
        });
  const resolve =
    roleScope === undefined
      ? resolveUnscoped
      : (request: ReadInput) =>
          roleScope.withSourceReaderFrom(request.transaction, () =>
            resolveUnscoped({
              ...request,
              transaction: createPostgresSocialOperatingLineageExecutor(
                request.transaction,
                {
                  worldId: request.command.worldId,
                  countryId: request.command.countryId!,
                },
              ),
            }),
          );
  const reader: SocialEmploymentRuntimeSnapshotReader = Object.freeze({
    async readFrom(request: ReadInput): Promise<SnapshotResult> {
      try {
        const result = await resolve(request);
        issued.set(result.snapshot, result.binding);
        return result.snapshot;
      } catch (error) {
        if (error instanceof SourceNotSupplied)
          return Object.freeze({ status: 'MISSING_OPERATING_STATE' as const });
        throw error;
      }
    },
  });
  constructions.set(reader, Object.freeze({ issued, resolve }));
  return reader;
}

/** Inert data association only. Clones, another reader and caller-created
 * snapshots cannot acquire binding metadata or reuse a source/lock permission. */
export function readIssuedSocialGoverningSourceBinding(
  reader: SocialEmploymentRuntimeSnapshotReader,
  issuedSnapshot: SnapshotResult,
): Readonly<GoverningSourceReadBindingV1> | null {
  if (!issuedSnapshot || typeof issuedSnapshot !== 'object') return null;
  return constructions.get(reader)?.issued.get(issuedSnapshot) ?? null;
}

/** D installs this port at its receipt-first, actual H/auth-held BEFORE_EVENTS
 * seam. The actual source adapter must hold cooperating source guards through
 * transaction settlement; the returned inert audit does not prove those locks. */
export function createSocialEmploymentCommitSourceGuard(
  reader: SocialEmploymentRuntimeSnapshotReader,
): SourceCommitProtectionPort {
  const construction = constructions.get(reader);
  if (!construction)
    invalid('commit guard requires the actual concrete G reader');
  return Object.freeze({
    async assertCurrentFrom(
      executor: SqlExecutor,
      request: Parameters<SourceCommitProtectionPort['assertCurrentFrom']>[1],
    ) {
      const preparedBinding =
        assertGoverningSourceCommitRequestConsistent(request);
      const command = validateCanonicalCommand(request.command, digest);
      const candidatePayload = request.transition.events[0]!.canonicalPayload;
      const currentHead = Object.freeze({ ...request.currentHead }),
        observedAtReal = request.observedAtReal;
      let fresh: ResolvedSource;
      try {
        fresh = await construction.resolve({
          transaction: executor,
          command,
          headWorldVersion: currentHead.worldVersion,
          headEventSequence: currentHead.eventSequence,
          observedAtReal,
        });
      } catch (error) {
        if (error instanceof SourceNotSupplied)
          invalid('fresh current source unavailable before events');
        throw error;
      }
      if (
        canonicalSerialize(fresh.binding) !==
        canonicalSerialize(preparedBinding)
      )
        invalid('actual current source/replay differs from prepared binding');
      const operation = prepareSocialEmploymentServiceOperation({
        command,
        state: fresh.snapshot.state,
        readFacts: fresh.snapshot.readFacts,
        sha256Hex: digest,
      });
      if (
        operation.source !== 'APPLIED' ||
        candidatePayload !== canonicalSerialize(operation.eventPayload)
      )
        invalid(
          'candidate payload/result/state/facts differs from real Core PLAN',
        );
      return freeze({
        status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY' as const,
        purpose: PURPOSE,
        commandFingerprint: command.fingerprint,
        currentHead,
        ...calculateGoverningSourceCommitBindingFingerprints(fresh.binding),
        protectionMode: 'HELD_SOURCE_GUARDS' as const,
      });
    },
  });
}
